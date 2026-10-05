import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createOceanMantaCommunityPlan } from '../src/oceanMantaCommunity.js';
import { oceanCommunityReading, nearestOceanAnimal } from '../src/oceanCommunityReading.js';

const SOURCE = '4,-2', DESTINATION = '5,-2';
const ray = (overrides = {}) => ({
  id: 'ocean:4,-2:reef-manta:manta:rock:35,-13:ray:0',
  speciesId: 'reef-manta', regionId: SOURCE, birthRegionId: SOURCE,
  position: { x: 319.9, y: -2, z: -96 }, velocity: { x: .5, y: 0, z: 0 },
  heading: 0, sizeM: 3.15, state: 'gliding', alive: true,
  roamingVersion: 1, mobileTimeSec: 123.5, timeSec: 123.5, ...overrides,
});
const wingPose = object => object.userData.animation.wings.map(wing => wing.rotation.toArray());
const meshResources = root => {
  const result = [];
  root.traverse(object => { if (object.isMesh) result.push([object, object.geometry, object.material]); });
  return result;
};

test('a roaming ray reuses its exact object and resources across ownership and floating-origin changes', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef);
  t.after(() => animals.dispose());
  const agent = ray();
  animals.update([agent], 800, { x: 256, z: -128 });
  const object = animals.getObject(agent.id), wings = wingPose(object);
  const resources = meshResources(object), resourceKeys = [...object.userData.resources];
  const pickable = animals.pickableObjects;
  assert.equal(object.userData.regionId, SOURCE);

  // Geographic ownership changes while the individual's animation clock is frozen.
  agent.regionId = DESTINATION;
  agent.position = { x: 320.1, y: -2, z: -96 };
  const frozenRecord = structuredClone(agent);
  for (const origin of [{ x: 320, z: -64 }, { x: 512, z: -256 }, { x: 0, z: 0 }]) {
    assert.equal(animals.update([agent], 5000, origin), false);
    assert.equal(animals.getObject(agent.id), object);
    assert.equal(object.userData.regionId, DESTINATION);
    assert.equal(object.userData.agentId, agent.id);
    assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [320.1 - origin.x, -2, -96 - origin.z]);
    assert.deepEqual(wingPose(object), wings);
    assert.equal(animals.pickableObjects, pickable);
    assert.equal(animals.root.children.length, 1);
    assert.equal(animals.stats.activeAnimals, 1);
    assert.deepEqual([...object.userData.resources], resourceKeys);
    const current = meshResources(object);
    assert.equal(current.length, resources.length);
    current.forEach((entry, index) => entry.forEach((resource, part) => assert.equal(resource, resources[index][part])));
  }
  assert.deepEqual(agent, frozenRecord, 'rendering leaves individual state unchanged');
  agent.mobileTimeSec += .5;
  agent.timeSec = agent.mobileTimeSec;
  animals.update([agent], 5000);
  assert.equal(animals.getObject(agent.id), object);
  assert.notDeepEqual(wingPose(object), wings, 'advancing the individual clock animates the reused wings');
});

// Execute the actual World summary method without constructing a browser GPU.
const worldSource = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const snapshotStart = worldSource.indexOf('  oceanSnapshot(){');
const snapshotEnd = worldSource.indexOf('  updateOceanWater(', snapshotStart);
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart);
const WorldFixture = new Function('oceanCommunityReading',
  `return class {${worldSource.slice(snapshotStart, snapshotEnd)}}`)(oceanCommunityReading);

test('current-cell readings and focus follow the live owner even when the source still has a seeded manta plan', () => {
  const generator = createOceanGenerator('42'), ecology = new OceanEcology('42', generator);
  const chunk = generator.chunk(4, -2);
  const plan = () => createOceanMantaCommunityPlan(generator, chunk, {
    random: salt => ecology._random({ id: SOURCE }, salt),
    surface: (x, z) => ecology._surface(x, z, true),
  });
  const seeded = plan();
  assert.equal(seeded.placements.length, 1, 'the departure cell retains its seeded potential encounter');
  const placement = seeded.placements[0];
  const agent = ray({ position: { x: placement.x, y: OCEAN_SURFACE_Y - placement.depthM, z: placement.z } });
  const fish = regionId => ({ id: `fish:${regionId}`, speciesId: 'green-chromis', regionId, alive: true,
    position: { x: regionId === SOURCE ? 318 : 322, y: -2, z: -96 }, state: 'schooling' });
  const state = { agents: [agent, fish(SOURCE), fish(DESTINATION)],
    regions: [{ id: SOURCE }, { id: DESTINATION }], metrics: { alive: 3, activeRegions: 2 } };
  let camera = new THREE.Vector3(319, -2, -96);
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    oceanWorldPosition: () => camera.clone(),
    oceanChunks: { generator, stats: {} }, oceanRenderOrigin: { x: 256, z: -128 },
    oceanEcology: { snapshot: () => state }, catalog: new Map(sceneCatalogs.reef.map(species => [species.id, species])),
  });
  const read = x => { camera.x = x; return world.oceanSnapshot(); };
  const count = snapshot => snapshot.localHabitat.species.find(item => item.speciesId === 'reef-manta')?.count ?? 0;
  assert.equal(count(read(319)), 1);
  assert.equal(count(read(321)), 0);

  agent.regionId = DESTINATION;
  agent.position = { x: 320.1, y: -2, z: -96 };
  const departed = read(319), arrived = read(321);
  assert.equal(departed.localHabitat.chunkId, SOURCE);
  assert.equal(departed.localHabitat.livingAnimals, 1);
  assert.equal(count(departed), 0);
  assert.equal(arrived.localHabitat.chunkId, DESTINATION);
  assert.equal(arrived.localHabitat.livingAnimals, 2);
  assert.equal(count(arrived), 1);
  assert.equal(arrived.localHabitat.species.find(item => item.speciesId === 'reef-manta').nearestAgentId, agent.id);
  assert.equal(departed.ecology.metrics.alive, 3);
  assert.deepEqual(plan(), seeded, 'generated potential remains scenery context and does not repopulate the reading');
  const observer = { x: 319.9, y: -2, z: -96 };
  assert.equal(nearestOceanAnimal(state.agents, observer, { speciesId: 'reef-manta', regionId: SOURCE }), null);
  assert.equal(nearestOceanAnimal(state.agents, observer, { speciesId: 'reef-manta', regionId: DESTINATION }), agent);
  assert.equal(nearestOceanAnimal(state.agents, observer, { speciesId: 'reef-manta' }), agent,
    'a known nearby ray remains selectable across the cell seam');
});
