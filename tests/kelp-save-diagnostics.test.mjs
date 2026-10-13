import test from 'node:test';
import assert from 'node:assert/strict';
import { readKelpSaveDiagnostics } from '../src/kelpSaveDiagnostics.js';

test('failed seed 55 admission exports all 16 original owners, including offscreen records, without writes', async () => {
  const bad = { kelpWaterLifeVersion: 1, kelpWaterLife: { lastTickSec: 26.2 }, state: { timeSec: 326 }, agents: [{ id: 'retained' }], stock: 7.4 };
  const original = structuredClone(bad), calls = [];
  const store = { available: true,
    async loadMany(world, ids) { calls.push([world, [...ids]]); return new Map(ids.map(id => [id, id === '12,-4' ? bad : null])); },
    save() { throw new Error('must not write'); }, saveMany() { throw new Error('must not write'); }, clear() { throw new Error('must not clear'); },
  };
  const data = await readKelpSaveDiagnostics({ store, worldKey: 'kelp-ecology-v1:string:55', seed: '55', position: { x: 922, z: -96 }, error: 'Invalid saved kelp water-life community' });
  assert.deepEqual(data.center, { cx: 14, cz: -2 });
  assert.equal(data.ownerIds.length, 16);
  assert.equal(data.requestedOwnerIds.length, 9);
  assert.ok(data.ownerIds.includes('12,-4'));
  assert.ok(!data.requestedOwnerIds.includes('12,-4'));
  assert.equal(calls.length, 1);
  assert.equal(data.seedType, 'string');
  assert.deepEqual(data.records.find(row => row.ownerId === '12,-4').record, original);
  assert.deepEqual(bad, original);
  data.records.find(row => row.ownerId === '12,-4').record.stock = 0;
  assert.deepEqual(bad, original);
});

test('a saved seascape marker includes its bounded offscreen group, each read stays below 25 owners', async () => {
  const calls = [];
  const store = { async loadMany(_world, ids) { calls.push([...ids]); return new Map(ids.map(id => [id, id === '12,-4' ? { kelpSeascapeVersion: 1 } : null])); } };
  const data = await readKelpSaveDiagnostics({ store, worldKey: 'kelp-ecology-v1:string:55', seed: '55', position: { x: 922, z: -96 } });
  assert.equal(data.readonlyTransactions, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(ids => ids.length <= 25));
  assert.equal(data.ownerIds.length, 28);
  assert.ok(data.ownerIds.includes('6,-2') && data.ownerIds.includes('11,-1'));
  assert.equal(new Set(data.ownerIds).size, data.ownerIds.length);
});

test('failed or partial reads remain failures, never treated as empty population', async () => {
  const args = { worldKey: 'kelp-ecology-v1:string:55', seed: '55', position: { x: 922, z: -96 } };
  await assert.rejects(readKelpSaveDiagnostics({ ...args, store: { available: false, loadMany() { throw new Error('not called'); } } }), /不可读/);
  await assert.rejects(readKelpSaveDiagnostics({ ...args, store: { async loadMany() { return new Map(); } } }), /未完成/);
  await assert.rejects(readKelpSaveDiagnostics({ ...args, store: { async loadMany() { throw new Error('storage failed'); } } }), /storage failed/);
});

test('partial seascape markers still export associated owners for diagnosis', async () => {
  for (const marker of [{ forestBeltVersion: 2 }, { forestBeltPlan: { version: 2 } },
    { kelpSeascapeGroupId: '6,-2' }, { kelpSeascapeInitializedAtSec: 0 }]) {
    const store = { async loadMany(_world, ids) { return new Map(ids.map(id => [id, id === '12,-4' ? marker : null])); } };
    const data = await readKelpSaveDiagnostics({ store, worldKey: 'kelp-ecology-v1:string:55', seed: '55', position: { x: 922, z: -96 } });
    assert.equal(data.ownerIds.length, 28);
    assert.ok(data.ownerIds.includes('6,-2'));
    assert.equal(data.readonlyTransactions, 2);
  }
});

test('reset during asynchronous reading rejects the stale export', async () => {
  let generation = 1, release;
  const store = { loadMany(_world, ids) { return new Promise(resolve => { release = () => resolve(new Map(ids.map(id => [id, null]))); }); } };
  const pending = readKelpSaveDiagnostics({ store, worldKey: 'kelp-ecology-v1:string:55', seed: '55',
    position: { x: 922, z: -96 }, isCurrent: () => generation === 1 });
  generation = 2; release();
  await assert.rejects(pending, /已经切换或重新准备/);
});
