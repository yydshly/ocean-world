import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanCommunityReading, nearestOceanAnimal } from '../src/oceanCommunityReading.js';

const camera = { x: 128, y: -5, z: 0 };
const catalog = [{ id: 'chromis', commonName: '绿光鳃鱼' }, { id: 'clam', commonName: '砗磲' },
  { id: 'cucumber', commonName: '黑海参' }, { id: 'snail', commonName: '螺' }];
const agent = (id, speciesId, regionId = '2,0', x = 130, extras = {}) => ({ id, speciesId, regionId, alive: true,
  position: { x, y: -5, z: 0 }, state: 'foraging', ...extras });
const read = (agents, extras = {}) => oceanCommunityReading({ agents, regionId: '2,0', cameraPosition: camera,
  catalog, loaded: true, ...extras });

test('only actual local live records determine counts and catalog names', () => {
  const agents = [agent('a', 'chromis'), agent('b', 'chromis'), agent('c', 'clam'),
    agent('dead', 'snail', '2,0', 128, { alive: false }), agent('neighbor', 'cucumber', '3,0'),
    agent('original', 'chromis', null), agent('unknown-alive', 'clam', '2,0', 130, { alive: undefined })];
  const before = structuredClone(agents);
  const result = read(agents);
  assert.equal(result.status, 'ready');
  assert.equal(result.livingAnimals, 3);
  assert.equal(result.speciesCount, 2);
  assert.deepEqual(result.species.map(entry => [entry.commonName, entry.count]), [['绿光鳃鱼', 2], ['砗磲', 1]]);
  assert.deepEqual(agents, before, 'summary leaves live state and input order unchanged');
});

test('representatives rank abundance first and true camera distance next, capped at three', () => {
  const agents = [agent('crowded-a', 'chromis', '2,0', 140), agent('crowded-b', 'chromis', '2,0', 141),
    agent('snail', 'snail', '2,0', 129), agent('clam', 'clam', '2,0', 130), agent('cucumber', 'cucumber', '2,0', 131)];
  const expected = ['chromis', 'snail', 'clam'];
  assert.deepEqual(read(agents).representatives.map(entry => entry.speciesId), expected);
  assert.deepEqual(read(agents.toReversed()).representatives.map(entry => entry.speciesId), expected);
  assert.equal(read(agents).representatives[0].nearestAgentId, 'crowded-a');
});

test('loading and an empty loaded region are distinct even when neighbours are alive', () => {
  const agents = [agent('neighbor', 'chromis', '3,0')];
  assert.equal(read(agents, { loaded: false }).status, 'loading');
  assert.equal(read(agents).status, 'empty');
  assert.equal(read(agents).livingAnimals, 0);
  assert.deepEqual(read(agents).representatives, []);
});

test('activity counts describe states and never invent successful feeding', () => {
  const result = read([agent('a', 'clam', '2,0', 130, { state: 'filtering', lastFeedAt: null }),
    agent('b', 'cucumber', '2,0', 131, { state: 'deposit-feeding', lastFeedAt: null })]);
  assert.deepEqual(result.activityCounts, { filtering: 1, 'deposit-feeding': 1 });
  assert.equal(result.feedingSuccesses, undefined);
  assert.equal(result.species.every(entry => entry.lastFeedAt === undefined), true);
});

test('focused regional choice stays in the requested cell with no species or region fallback', () => {
  const agents = [agent('local-far', 'clam', '2,0', 140), agent('near-other', 'clam', '3,0', 129),
    agent('local-dead', 'clam', '2,0', 128, { alive: false }), agent('local-other', 'snail', '2,0', 128)];
  assert.equal(nearestOceanAnimal(agents, camera, { speciesId: 'clam', regionId: '2,0' }).id, 'local-far');
  assert.equal(nearestOceanAnimal(agents, camera, { speciesId: 'clam' }).id, 'near-other', 'catalog retains cross-region choice');
  assert.equal(nearestOceanAnimal(agents, camera, { speciesId: 'chromis', regionId: '2,0' }), null);
  assert.equal(nearestOceanAnimal(agents, camera, { regionId: '5,5' }), null);
});

test('unrecognized species cannot manufacture a named observation entry', () => {
  const result = read([agent('a', 'not-in-catalog')]);
  assert.equal(result.livingAnimals, 1);
  assert.equal(result.speciesCount, 1);
  assert.equal(result.species[0].commonName, null);
  assert.deepEqual(result.representatives, []);
});
