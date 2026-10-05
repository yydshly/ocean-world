import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeepOceanAnimals } from '../src/world/DeepOceanAnimals.js';
import { DeepSimulation, deepSpeciesCatalog } from '../src/deepSimulation.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

function fixture(t) {
  const sim = new DeepSimulation('regional-render'); sim.step(.4);
  const agents = deepSpeciesCatalog.map(species => sim.agents.find(agent => agent.speciesId === species.id))
    .map(agent => ({ ...structuredClone(agent), regionId: 'deep:0,0', timeSec: sim.timeSec,
      localEnvironment: { ...sim.environment } }));
  const animals = new DeepOceanAnimals(deepSpeciesCatalog); t.after(() => animals.dispose());
  return { sim, agents, animals };
}
const vertices = object => object.userData.animation.map(record => Array.from(record.item.geometry.attributes.position.array));

test('three admitted morphologies retain taxonomy, stable objects and live picking metadata', t => {
  const { agents, animals } = fixture(t);
  animals.update([...agents, { ...agents[0], id: 'unsupported', speciesId: 'deep-acorn-worm-group' }], 99);
  assert.equal(animals.entities.size, 3); assert.equal(animals.objects, animals.entities);
  assert.equal(animals.getPickables(), animals.pickableObjects);
  for (const agent of agents) {
    const object = animals.getObject(agent.id);
    assert.equal(animals.find(agent.id), object);
    assert.equal(object.userData.agentId, agent.id); assert.equal(object.userData.regionId, agent.regionId);
    assert.equal(object.userData.identityLevel, deepSpeciesCatalog.find(species => species.id === agent.speciesId).identityLevel);
    assert.equal(object.scale.x, agent.sizeM);
    object.traverse(child => assert.ok(!child.isLight, 'animal adaptation adds no illumination'));
  }
  const first = animals.getObject(agents[0].id);
  animals.update(agents, 1000); assert.equal(animals.getObject(agents[0].id), first);
  animals.update(agents.map((agent, index) => index ? agent : { ...agent, alive: false }), 1001);
  assert.equal(animals.getObject(agents[0].id), null); assert.equal(first.userData.disposed, true);
  assert.equal(animals.pickableObjects.length, 2); assert.equal(animals.snapshot().activeAnimals, 2);
});

test('regional clocks freeze anatomy despite display time and observer-light changes', t => {
  const { agents, animals } = fixture(t); animals.update(agents, 0);
  const before = new Map(agents.map(agent => [agent.id, vertices(animals.getObject(agent.id))]));
  const saved = structuredClone(agents);
  animals.update(agents.map(agent => ({ ...agent, localEnvironment: { ...agent.localEnvironment, hour: 0, observerLight: 0 } })), 500);
  for (const agent of agents) assert.deepEqual(vertices(animals.getObject(agent.id)), before.get(agent.id));
  assert.deepEqual(agents, saved, 'renderer does not mutate model state');
  animals.update(agents.map((agent, index) => index ? agent : { ...agent, timeSec: agent.timeSec + .3 }), 1000);
  assert.notDeepEqual(vertices(animals.getObject(agents[0].id)), before.get(agents[0].id));
  for (const agent of agents.slice(1)) assert.deepEqual(vertices(animals.getObject(agent.id)), before.get(agent.id));
});

test('stable ID determines phase across reload order, independently of factory serial', t => {
  const { agents, animals } = fixture(t), reloaded = new DeepOceanAnimals(deepSpeciesCatalog);
  t.after(() => reloaded.dispose()); animals.update(agents, 999); reloaded.update([...agents].reverse(), 100);
  for (const agent of agents) {
    const original = animals.getObject(agent.id), restored = reloaded.getObject(agent.id);
    assert.equal(restored.userData.phase, original.userData.phase);
    assert.deepEqual(vertices(restored), vertices(original));
  }
});

test('floating origins translate all three animals without changing logical pose or clock', t => {
  const { agents, animals } = fixture(t); animals.update(agents, 100, { x: 256, z: -128 });
  const saved = structuredClone(agents), objects = agents.map(agent => animals.getObject(agent.id));
  const points = objects.map(object => object.getWorldPosition(new THREE.Vector3()));
  const shapes = objects.map(vertices);
  animals.update(agents, 10000, { x: 320, z: 64 });
  objects.forEach((object, index) => {
    assert.equal(animals.getObject(agents[index].id), object);
    assert.ok(object.getWorldPosition(new THREE.Vector3()).distanceTo(points[index].add(new THREE.Vector3(-64, 0, -192))) < 1e-10);
    assert.deepEqual(vertices(object), shapes[index]);
    assert.equal(object.rotation.x, 0); assert.equal(object.rotation.z, 0);
    assert.equal(object.rotation.y, -agents[index].heading);
  });
  assert.deepEqual(agents, saved); assert.deepEqual(animals.stats.renderOrigin, { x: 320, z: 64 });
});

test('all twelve actual sea-pig foot endpoints follow model terrain contacts under yaw and rebase', t => {
  const generator = createDeepOceanGenerator('regional-render');
  const sites = [-3, 0, 3].flatMap(z => [-5, -2, 1, 4].map(x => [272 + x, 112 + z]));
  const sim = new DeepSimulation('regional-render', { supportHeight: generator.heightAt, surfaceSites: sites,
    seaPigSiteIndices: [0], fishSiteIndices: [], anchors: [] });
  const pig = { ...sim.agents[0], regionId: 'deep:4,1', timeSec: sim.timeSec, localEnvironment: sim.environment };
  const animals = new DeepOceanAnimals(deepSpeciesCatalog); t.after(() => animals.dispose());
  // The real simulation queries the generator's actual Float32 surface, not
  // its analytic sample description. Additional root tilt would break these.
  assert.equal(pig.contactPointsLocal.length, 12);
  assert.ok(Math.abs(pig.supportPose.normal.x) + Math.abs(pig.supportPose.normal.z) > 0);
  const origin = { x: 64, z: -64 }; animals.update([pig], 2000, origin);
  const object = animals.getObject(pig.id), record = object.userData.animation.find(item => item.channel === 'pig-appendages');
  const attr = record.item.geometry.attributes.position;
  const duplicateSeams = new Set(record.item.geometry.userData.seams.map(([, duplicate]) => duplicate));
  for (let foot = 0; foot < 12; foot++) {
    const centre = new THREE.Vector3(); let count = 0;
    for (let index = 0; index < attr.count; index++) {
      const tag = index * 4;
      if (record.tags[tag] === 1 && record.tags[tag + 1] === foot && record.tags[tag + 2] === 1 && !duplicateSeams.has(index)) {
        centre.add(new THREE.Vector3().fromBufferAttribute(attr, index)); count++;
      }
    }
    assert.ok(count > 0, `foot ${foot} has a real endpoint ring`); centre.divideScalar(count);
    const expected = new THREE.Vector3(pig.contactPointsLocal[foot].x, pig.contactPointsLocal[foot].y, pig.contactPointsLocal[foot].z);
    assert.ok(centre.distanceTo(expected) < 1e-6, `foot ${foot} mesh reads the supplied local endpoint`);
    object.localToWorld(centre);
    assert.ok(Math.abs(centre.y - generator.heightAt(centre.x + origin.x, centre.z + origin.z)) < 1e-6,
      `foot ${foot} meets its actual shared floor within Float32 precision`);
  }
});

test('removing one animal retains shared assets until the last live instance and disposal is idempotent', t => {
  const sim = new DeepSimulation('shared-render'), pigs = sim.agents.filter(agent => agent.speciesId === 'sea-pig-group').slice(0, 2);
  const animals = new DeepOceanAnimals(deepSpeciesCatalog); t.after(() => animals.dispose());
  animals.update(pigs, .2);
  const first = animals.getObject(pigs[0].id), second = animals.getObject(pigs[1].id);
  const material = first.userData.animation.find(record => record.channel === 'pig-body').item.material;
  assert.equal(second.userData.animation.find(record => record.channel === 'pig-body').item.material, material);
  let disposals = 0; material.addEventListener('dispose', () => disposals++);
  animals.update([pigs[1]], .3); assert.equal(disposals, 0); assert.equal(first.parent, null);
  animals.setObservationAgent(pigs[1].id); assert.equal(animals.snapshot().observationAgentId, pigs[1].id);
  animals.dispose(); animals.dispose(); assert.equal(disposals, 1); assert.equal(second.parent, null);
  assert.equal(animals.entities.size, 0); assert.equal(animals.root.children.length, 0);
  assert.equal(animals.update(pigs, 5), false); assert.equal(animals.setRenderOrigin({ x: 64, z: 64 }), false);
});
