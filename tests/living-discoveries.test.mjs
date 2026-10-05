import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingDiscoveries, livingDiscoveryCandidates, LIVING_DISCOVERY_LIMIT } from '../src/livingDiscoveries.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
const seed = livingShallowsSeed('42');
const storageFixture = () => { const records = new Map(); return { records, getItem: key => records.get(key) ?? null,
  setItem: (key, value) => records.set(key, value) }; };

test('only loaded actual props become clues, with stable identity and no descriptor changes', () => {
  const generator = createOceanGenerator(seed), chunk = generator.chunk(5, 3), before = JSON.stringify(chunk);
  const observer = { x: 336, y: -1, z: 224 };
  const clues = livingDiscoveryCandidates(generator, ['5,3', '5,3'], observer);
  assert.deepEqual(clues.map(row => row.kind).sort(), ['bottle', 'driftwood']);
  assert.equal(new Set(clues.map(row => row.id)).size, 2);
  assert.deepEqual(livingDiscoveryCandidates(generator, [], observer), []);
  assert.deepEqual(livingDiscoveryCandidates(createOceanGenerator('42'), ['5,3'], observer), []);
  assert.equal(JSON.stringify(chunk), before);
});

test('actual close approach marks once, survives restore and typed world seeds stay separate', () => {
  const storage = storageFixture(), generator = createOceanGenerator(seed);
  const clues = livingDiscoveryCandidates(generator, ['5,3'], { x: 336, y: 0, z: 224 });
  const target = clues.find(row => row.kind === 'bottle'), position = { ...target.position, y: target.position.y + 2.8 };
  const store = createLivingDiscoveries(seed, { storage });
  assert.deepEqual(store.observe([{ ...target, distanceM: 0 }], { ...position, x: position.x + 100 }, 10), []);
  assert.equal(store.observe([target], position, 11).length, 1);
  assert.deepEqual(store.observe([target], position, 99), []);
  assert.deepEqual(createLivingDiscoveries(seed, { storage }).records, store.records);
  assert.equal(createLivingDiscoveries(livingShallowsSeed(42), { storage }).records.length, 0);
  assert.equal(store.records[0].discoveredAtSec, 11);
});

test('recent marks have a bounded budget and returned data cannot mutate persisted marks', () => {
  const storage = storageFixture(), store = createLivingDiscoveries(seed, { storage }), position = { x: 1, y: 0, z: 1 };
  for (let i = 0; i < 80; i++) store.observe([{ id: `living-bottle:${i},0`, kind: 'bottle', position }], position, i);
  assert.equal(store.records.length, LIVING_DISCOVERY_LIMIT);
  const rows = store.records; rows[0].position.x = 900;
  assert.equal(store.records[0].position.x, 1);
  assert.equal(createLivingDiscoveries(seed, { storage }).records.length, LIVING_DISCOVERY_LIMIT);
});

test('unavailable storage remains useful locally and corrupt stored history is not overwritten', () => {
  const key = `tidal-living-discoveries-v1:${seed}`, storage = storageFixture();
  storage.records.set(key, '{damaged');
  const bad = createLivingDiscoveries(seed, { storage });
  const item = { id: 'living-bottle:5,3', kind: 'bottle', position: { x: 0, y: 0, z: 0 } };
  bad.observe([item], item.position, 1);
  assert.equal(storage.records.get(key), '{damaged');
  assert.notEqual(bad.status, 'saved');
  const local = createLivingDiscoveries(seed, { storage: null });
  assert.equal(local.observe([item], item.position, 1).length, 1);
  assert.equal(local.status, 'session-only');
});
