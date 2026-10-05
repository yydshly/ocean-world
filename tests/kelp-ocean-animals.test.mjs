import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { kelpWaterSpeciesCatalog } from '../src/kelpWaterSpecies.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { leafAttachmentPosition } from '../src/kelpHabitat.js';

async function fixture(t) {
  const store = { available: true, load: async () => null, saveMany: async () => undefined, clear: async () => undefined };
  const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
  await ecology.update({ x: 259, z: 3 });
  const animals = new KelpOceanAnimals([...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog]); t.after(() => animals.dispose());
  return { ecology, animals };
}

test('living known animals have picking metadata and stable objects; plant representatives are excluded from counts', async t => {
  const { ecology, animals } = await fixture(t), agents = ecology.agents;
  animals.update(agents, 0);
  assert.equal(animals.entities.size, agents.length); assert.equal(animals.pickableObjects.length, agents.length);
  assert.equal(animals.stats.speciesCounts['giant-kelp'], undefined); assert.equal(animals.stats.detailedHosts, 0);
  const first = agents[0], object = animals.getObject(first.id);
  assert.equal(object.userData.regionId, first.regionId); assert.equal(object.userData.agentId, first.id);
  assert.equal(animals.objects, animals.entities);
  animals.update(agents, 1);
  assert.equal(animals.getObject(first.id), object);
  animals.update([{ ...first, alive: false }], 2);
  assert.equal(animals.getObject(first.id), null); assert.equal(animals.entities.size, 0);
});

test('nearby detailed hosts use the same actual leaf, attachment time and environment across floating origins', async t => {
  const { ecology, animals } = await fixture(t);
  const region = [...ecology._active.values()].find(region => region.sim.hostById.size);
  const snail = region.sim.agents.find(agent => agent.speciesId === 'brown-turban-snail');
  ecology.step(.7, { currentMps: .6 });
  snail.attachment.along = .5;
  snail.position = leafAttachmentPosition(region.sim.getKelpAnchor(snail.attachment.hostId), snail.attachment,
    region.sim.timeSec, region.sim.environment);
  const agent = ecology.agents.find(agent => agent.id === snail.id), origin = { x: 256, z: -64 };
  const camera = new THREE.Vector3(agent.position.x - origin.x + .1, agent.position.y, agent.position.z - origin.z);
  animals.update([agent], 99, origin, camera);
  assert.deepEqual(animals.detailedHostIds, [agent.hostSceneryId]);
  const host = animals.hosts.get(agent.hostSceneryId), motion = host.userData.motion;
  assert.equal(motion.lastGeometry.timeSec, agent.hostTimeSec);
  assert.equal(motion.lastGeometry.flow, agent.hostEnvironment.deformationCurrentMps);
  assert.equal(motion.lastGeometry.lengthM, agent.hostAnchor.lengthM);
  const positions = motion.blades.geometry.attributes.position;
  const row = agent.attachment.leafIndex * 11 * 2 + 5 * 2;
  const midpoint = new THREE.Vector3().fromBufferAttribute(positions, row)
    .add(new THREE.Vector3().fromBufferAttribute(positions, row + 1)).multiplyScalar(.5);
  host.localToWorld(midpoint); midpoint.y += agent.attachment.clearanceM;
  const renderedSnail = animals.getObject(agent.id).getWorldPosition(new THREE.Vector3());
  assert.ok(midpoint.distanceTo(renderedSnail) < 1e-6, 'the actual mesh leaf row supports the snail within Float32 vertex precision');
  const before = renderedSnail.clone();
  animals.update([agent], 999, { x: 320, z: 0 }, new THREE.Vector3(camera.x - 64, camera.y, camera.z - 64));
  const shifted = animals.getObject(agent.id).getWorldPosition(new THREE.Vector3());
  assert.deepEqual(shifted.toArray(), before.add(new THREE.Vector3(-64, 0, -64)).toArray());
  assert.equal(animals.hosts.get(agent.hostSceneryId), host);
});

test('pause leaves animal anatomy and detailed host geometry unchanged despite advancing caller display time', async t => {
  const { ecology, animals } = await fixture(t); ecology.step(.3);
  const snail = ecology.agents.find(agent => agent.attachment);
  const camera = new THREE.Vector3(snail.position.x + 1, snail.position.y, snail.position.z);
  animals.update(ecology.agents, 0, { x: 0, z: 0 }, camera);
  const host = animals.hosts.get(snail.hostSceneryId), vertices = Array.from(host.userData.motion.blades.geometry.attributes.position.array);
  const fish = ecology.agents.find(agent => agent.speciesId === 'giant-kelpfish');
  const tail = animals.getObject(fish.id).userData.motion.tail.rotation.y;
  ecology.step(0); animals.update(ecology.agents, 500, { x: 0, z: 0 }, camera);
  assert.deepEqual(Array.from(host.userData.motion.blades.geometry.attributes.position.array), vertices);
  assert.equal(animals.getObject(fish.id).userData.motion.tail.rotation.y, tail);
});

test('all five nearby attachment hosts are shown and remote snails and hosts are culled together', async t => {
  const { ecology, animals } = await fixture(t);
  const snail = ecology.agents.find(agent => agent.attachment);
  const agents = Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(snail), id: `snail:${index}`,
    hostSceneryId: `actual-kelp:${index}`, hostAnchor: { ...snail.hostAnchor, x: snail.hostAnchor.x + index }, alive: true }));
  animals.update(agents, 0, { x: 0, z: 0 }, new THREE.Vector3(snail.hostAnchor.x, snail.position.y, snail.hostAnchor.z));
  assert.equal(animals.stats.detailedHosts, 5); assert.equal(animals.stats.activeAnimals, 5);
  assert.deepEqual(animals.detailedHostIds, agents.map(agent => agent.hostSceneryId));
  assert.ok(agents.every(agent => animals.getObject(agent.id).visible && animals.hosts.has(agent.hostSceneryId)));
  const previous = [...animals.hosts.values()];
  animals.update(agents, 0, { x: 0, z: 0 }, new THREE.Vector3(snail.hostAnchor.x + 100, snail.position.y, snail.hostAnchor.z));
  assert.equal(animals.stats.detailedHosts, 0); assert.ok(previous.every(host => host.parent === null && host.children.length === 0));
  assert.ok(agents.every(agent => !animals.getObject(agent.id).visible));
});

test('dispose releases animals and nearby hosts once and later updates cannot reconstruct them', async t => {
  const { ecology, animals } = await fixture(t), snail = ecology.agents.find(agent => agent.attachment);
  animals.update(ecology.agents, 0, { x: 0, z: 0 }, new THREE.Vector3(snail.position.x, snail.position.y, snail.position.z));
  assert.ok(animals.root.children.length > animals.entities.size);
  animals.dispose(); animals.dispose(); assert.equal(animals.root.children.length, 0);
  assert.equal(animals.update(ecology.agents, 1), false); assert.equal(animals.entities.size, 0);
});

test('an observed fish pins its actual distant host without removing any nearby attachment support', async t => {
  const { ecology, animals } = await fixture(t);
  const snail = ecology.agents.find(agent => agent.attachment), fish = ecology.agents.find(agent => agent.speciesId === 'giant-kelpfish');
  const near = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(snail), id: `near-snail:${index}`,
    hostSceneryId: `near-host:${index}`, hostAnchor: { ...snail.hostAnchor, x: snail.hostAnchor.x + index } }));
  const distant = { ...structuredClone(fish), id: 'observed-fish', hostSceneryId: 'distant-actual-host',
    hostAnchor: { ...fish.hostAnchor, x: snail.hostAnchor.x + 100, z: snail.hostAnchor.z } };
  // Another unselected animal shares the selected plant and appears later.
  const sameHost = { ...structuredClone(distant), id: 'other-fish' };
  const agents = [...near, distant, sameHost], camera = new THREE.Vector3(snail.hostAnchor.x, snail.position.y, snail.hostAnchor.z);
  animals.update(agents, 0, { x: 0, z: 0 }, camera);
  assert.deepEqual(animals.detailedHostIds, ['near-host:0', 'near-host:1', 'near-host:2']);
  assert.equal(animals.setObservationAgent('observed-fish'), true);
  animals.update(agents, 0, { x: 0, z: 0 }, camera);
  assert.equal(animals.stats.detailedHosts, 4);
  assert.ok(animals.detailedHostIds.includes('distant-actual-host'));
  assert.equal(animals.detailedHostIds.includes('near-host:2'), true);
  const host = animals.hosts.get('distant-actual-host');
  assert.equal(host.userData.motion.lastGeometry.timeSec, distant.hostTimeSec);
  assert.equal(animals.setObservationAgent('observed-fish'), false);
  assert.equal(animals.setObservationAgent(null), true);
  animals.update(agents, 0, { x: 0, z: 0 }, camera);
  assert.equal(host.parent, null); assert.equal(animals.stats.detailedHosts, 3);
  assert.deepEqual(animals.detailedHostIds.sort(), ['near-host:0', 'near-host:1', 'near-host:2']);
  assert.equal(animals.stats.observationAgentId, null);
});
