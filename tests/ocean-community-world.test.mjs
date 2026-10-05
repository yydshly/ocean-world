import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { oceanCommunityReading, nearestOceanAnimal } from '../src/oceanCommunityReading.js';

// Execute the actual CPU World methods without constructing its browser GPU.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const focusStart = source.indexOf('  focusNearbyOceanAnimal('), focusEnd = source.indexOf('  setView(', focusStart);
const snapshotStart = source.indexOf('  oceanSnapshot(){'), snapshotEnd = source.indexOf('  updateOceanWater(', snapshotStart);
assert.ok(focusStart >= 0 && focusEnd > focusStart && snapshotStart >= 0 && snapshotEnd > snapshotStart);
const WorldFixture = new Function('oceanCommunityReading', 'nearestOceanAnimal',
  `return class {${source.slice(focusStart, focusEnd)}\n${source.slice(snapshotStart, snapshotEnd)}}`)(oceanCommunityReading, nearestOceanAnimal);
const live = (id, regionId, speciesId, x = 133) => ({ id, regionId, speciesId, alive: true,
  position: { x, y: -5, z: 5 }, state: 'foraging', sizeM: .2 });

test('World cell focus never silently selects a live animal from another cell', () => {
  const agents = [live('other', '3,0', 'clam', 129), { ...live('dead', '2,0', 'clam', 128), alive: false },
    live('local', '2,0', 'snail', 132)];
  const calls = [];
  const world = Object.assign(Object.create(WorldFixture.prototype), { oceanEcology: { agents },
    oceanWorldPosition: () => new THREE.Vector3(128, -5, 5), focusAgent: (...args) => calls.push(args) });
  assert.equal(world.focusNearbyOceanAnimal('clam', '2,0'), false);
  assert.equal(calls.length, 0);
  assert.equal(world.focusNearbyOceanAnimal(null, '5,5'), false);
  assert.equal(calls.length, 0);
  assert.equal(world.focusNearbyOceanAnimal('snail', '2,0'), true);
  assert.equal(calls[0][0], 'local');
  assert.equal(world.focusNearbyOceanAnimal('clam'), true, 'catalog call retains the complete loaded-window scope');
  assert.equal(calls[1][0], 'other');
});

test('kelp school observation keeps its cell scope, favours the group over a feeding outlier and frames multiple fish', () => {
  const agents = [{ ...live('near-feeder', '2,0', 'blue-rockfish', 129), state: 'prey-feeding' },
    { ...live('local-school', '2,0', 'blue-rockfish', 134), state: 'schooling' },
    { ...live('neighbor-school', '3,0', 'blue-rockfish', 128), state: 'schooling' },
    { ...live('dead-school', '2,0', 'blue-rockfish', 128), state: 'schooling', alive: false },
    live('local-snail', '2,0', 'snail', 132)];
  const calls = [];
  const world = Object.assign(Object.create(WorldFixture.prototype), { oceanEcology: { agents },
    oceanWorldPosition: () => new THREE.Vector3(128, -5, 5), focusAgent: (...args) => calls.push(args) });
  assert.equal(world.focusNearbyOceanAnimal('blue-rockfish', '2,0'), true);
  assert.deepEqual(calls[0], ['local-school', { minDistanceM: 5.5 }]);
  agents[1].state = 'approaching-prey';
  assert.equal(world.focusNearbyOceanAnimal('blue-rockfish', '2,0'), true);
  assert.equal(calls[1][0], 'near-feeder', 'without a local grouped member, retain the ordinary local live candidate');
  assert.equal(world.focusNearbyOceanAnimal('blue-rockfish', '5,5'), false);
  assert.equal(world.focusNearbyOceanAnimal('snail', '2,0'), true);
  assert.equal(calls[2][0], 'local-snail');
  assert.ok(Math.abs(calls[2][1].minDistanceM - .7) < 1e-12, 'other species retain the previous close observation');
});

test('World derives actual local community status and species, separate from loaded-window totals', () => {
  const agents = [live('local', '2,0', 'clam'), live('neighbor', '3,0', 'snail'),
    { ...live('dead', '2,0', 'snail'), alive: false }];
  const state = { agents, regions: [{ id: '2,0' }, { id: '3,0' }], metrics: { alive: 2, activeRegions: 2 } };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    oceanWorldPosition: () => new THREE.Vector3(130, -5, 5),
    oceanChunks: { generator: { sample: () => ({ habitat: 'sand' }), chunk: () => ({ counts: { rock: 0 }, landform: {}, habitatComposition: {} }),
      cacheStats: () => ({ size: 9, limit: 32 }) }, stats: {} },
    oceanEcology: { snapshot: () => state }, oceanRenderOrigin: { x: 128, z: 0 },
    catalog: new Map([['clam', { commonName: '砗磲' }], ['snail', { commonName: '螺' }]]),
  });
  const before = structuredClone(agents), snapshot = world.oceanSnapshot();
  assert.equal(snapshot.localHabitat.status, 'ready');
  assert.equal(snapshot.localHabitat.livingAnimals, 1);
  assert.equal(snapshot.localHabitat.speciesCount, 1);
  assert.equal(snapshot.localHabitat.representatives[0].commonName, '砗磲');
  assert.equal(snapshot.ecology.metrics.alive, 2);
  assert.deepEqual(agents, before);
  state.regions = [{ id: '3,0' }]; state.agents = [agents[1]];
  assert.equal(world.oceanSnapshot().localHabitat.status, 'loading');
  state.regions.push({ id: '2,0' });
  assert.equal(world.oceanSnapshot().localHabitat.status, 'empty');
});
