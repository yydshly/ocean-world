import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';

// Compare the full pre-change class, with the same unchanged dependency modules.
// No replacement movement, mocked support values or synthesized food histories.
const beforeSource = readFileSync(new URL('../output/validation/whole-habitat-kelpOceanEcology-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(beforeSource).digest('hex'), '0b6634380ea652f0e0043456f90c8eb56c8e2c78660df452b63bbc4915cb6919');
const rewritten = beforeSource.replace(/from (['"])(\.\/[^'"]+)\1/g, (_match, _quote, path) =>
  `from ${JSON.stringify(new URL(`../src/${path.slice(2)}`, import.meta.url).href)}`);
const { KelpOceanEcology: Original } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);

class MemoryStore {
  constructor(atomic = true) { this.records = new Map(); this.available = true; this.failLoadId = null; if (!atomic) this.saveMany = undefined; }
  async load(world, id) { if (id === this.failLoadId) throw new Error('Intentional read failure'); return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { this.records.set(`${world}|${id}`, structuredClone(record)); return record; }
  async saveMany(world, entries) { for (const [id, record] of entries) this.records.set(`${world}|${id}`, structuredClone(record)); return entries.length; }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const records = controller => [...controller._active.values()].map(region => controller._record(region)).sort((a, b) => a.id.localeCompare(b.id));
const savedRecords = store => [...store.records].sort((a, b) => a[0].localeCompare(b[0]));
function equal(pair, label = 'complete saved model') {
  const expected = records(pair.old), actual = records(pair.current);
  assert.deepEqual(actual, expected, label); assert.equal(hash(actual), hash(expected), label);
  assert.equal(pair.current._waterContextMemoActive, false, 'memo cannot survive the water phase');
  assert.equal(pair.current._waterContextMemo.size, 0);
}
async function fixture(t, { seed = '42', x = 154.59254923750888, z = 54.75845912593715, atomic = true } = {}) {
  const oldStore = new MemoryStore(atomic), currentStore = new MemoryStore(atomic);
  const old = new Original(seed, createKelpOceanGenerator(seed), { store: oldStore });
  const current = new KelpOceanEcology(seed, createKelpOceanGenerator(seed), { store: currentStore });
  t.after(async () => { await old.dispose(); await current.dispose(); });
  await old.update({ x, z }); await current.update({ x, z });
  const pair = { old, current, oldStore, currentStore, position: { x, z } }; equal(pair); return pair;
}
function step(pair, seconds, environment = {}) {
  pair.old.step(seconds, environment); pair.current.step(seconds, environment); equal(pair);
}

test('complete old and memoized records, RNG, resources and population remain exact across eight real seed/location/environment trajectories', async t => {
  for (const [seed, point, environment] of [
    ['42', { x: 154.59, z: 54.76 }, { currentMps: .18, hour: 10 }],
    ['42', { x: 259, z: -123 }, { currentMps: 1.2, hour: 18 }],
    ['42', { x: -211, z: 155 }, { currentMps: .65, turbidity: .8, hour: 22 }],
    ['42', { x: 147.13, z: 105.96 }, { currentMps: .06, foodSupply: 0, hour: 4 }],
    [42, { x: 154.59, z: 54.76 }, { currentMps: .3, hour: 12 }],
    [42, { x: 259, z: -123 }, { currentMps: .8, hour: 8 }],
    ['coastal-window', { x: 259, z: -123 }, { currentMps: .18, hour: 10 }],
    ['coastal-window', { x: -211, z: 155 }, { currentMps: 1.2, foodSupply: 2, hour: 23 }],
  ]) {
    const pair = await fixture(t, { seed, ...point });
    for (let index = 0; index < 5; index++) for (const seconds of [.04, .06, .2]) step(pair, seconds, environment);
    pair.current.agents; pair.old.agents; equal(pair, `${typeof seed}:${seed} ${point.x},${point.z} including real public annotations`);
    await pair.old.checkpoint(); await pair.current.checkpoint();
    assert.deepEqual(savedRecords(pair.currentStore), savedRecords(pair.oldStore), 'atomic checkpoints persist identical full records');
  }
});

test('same-step region and exact numeric prediction contexts share references while all values equal the original method', async t => {
  const pair = await fixture(t), current = pair.current;
  const originalTick = current._tickWater; let checked = false;
  current._tickWater = function(region) {
    if (!checked) {
      checked = true; assert.equal(this._waterContextMemoActive, true);
      const point = { x: (region.cx + .5) * 64, y: 0, z: (region.cz + .5) * 64 };
      for (const seconds of [0, .2, .4]) {
        const context = this._mobileWaterContext(point, seconds), again = this._mobileWaterContext({ ...point, x: point.x + 1 }, seconds);
        assert.equal(context, again);
        const reference = Original.prototype._mobileWaterContext.call(this, point, seconds);
        assert.equal(context.timeSec, reference.timeSec); assert.equal(context.ownerMarginM, reference.ownerMarginM);
        assert.deepEqual(context.environment, reference.environment); assert.deepEqual(context.elements, reference.elements);
        for (const element of context.elements) {
          const local = context.elementContext(element); assert.deepEqual(local, reference.elementContext(element));
          assert.equal(local, context.elementContext(element), 'an element reference is created only once for this phase');
        }
      }
      const a = this._mobileWaterContext(point, .2), b = this._mobileWaterContext(point, .20000000000000004);
      assert.notEqual(a, b, 'adjacent distinct Number prediction offsets are never rounded together');
      for (const seconds of [NaN, Infinity, '0.2']) {
        assert.notEqual(this._mobileWaterContext(point, seconds), this._mobileWaterContext(point, seconds), 'nonfinite/nonnumeric arguments keep the old direct behavior');
      }
    }
    return originalTick.call(this, region);
  };
  step(pair, .1); assert.equal(checked, true);
});

test('step exit, pause/no-step calls and new clocks or environments never reuse a stale prediction frame', async t => {
  const pair = await fixture(t); step(pair, .1, { currentMps: .6 });
  const current = pair.current, region = [...current._active.values()][0], point = { x: (region.cx + .5) * 64, z: (region.cz + .5) * 64 };
  const first = current._mobileWaterContext(point, .4), second = current._mobileWaterContext(point, .4);
  assert.notEqual(first, second, 'public helper calls outside ticking retain fresh original contexts');
  const before = records(current); current.step(0, { hour: 23, currentMps: 1.2 }); pair.old.step(0, { hour: 23, currentMps: 1.2 });
  assert.deepEqual(records(current), before); equal(pair);
  step(pair, .1, { currentMps: 1.2, hour: 23 });
  const after = current._mobileWaterContext(point, .4); assert.notEqual(after, first);
  assert.equal(after.timeSec, region.sim.timeSec); assert.equal(after.environment.currentMps, 1.2);
});

test('memo storage remains finite for extra owner/prediction requests and conservative unloaded plants retain original references', async t => {
  const pair = await fixture(t), current = pair.current, tick = current._tickWater; let checked = false;
  current._tickWater = function(region) {
    if (!checked) {
      checked = true;
      for (let owner = 0; owner < 14; owner++) for (let offset = 0; offset < 7; offset++) {
        const point = { x: 64 * owner + 1, y: 0, z: 6401 }, seconds = offset / 10;
        const context = this._mobileWaterContext(point, seconds), expected = Original.prototype._mobileWaterContext.call(this, point, seconds);
        const element = { id: 'unloaded-plant', x: 6401, z: 6401, anchor: { x: 6401, y: -1, z: 6401, lengthM: 10 } };
        assert.deepEqual(context.elementContext(element), expected.elementContext(element));
        assert.deepEqual(context.elementContext(element), { conservative: true });
        assert.ok(this._waterContextMemo.size <= 9);
        assert.ok([...this._waterContextMemo.values()].every(predictions => predictions.size <= 3));
      }
    }
    return tick.call(this, region);
  };
  step(pair, .1); assert.equal(checked, true);
});

test('locked owners and legacy non-atomic stores retain their full original ecological behavior', async t => {
  for (const atomic of [true, false]) {
    const pair = await fixture(t, { atomic }), id = [...pair.old._active.keys()][0];
    const before = pair.current._record(pair.current._active.get(id));
    pair.old._locked.add(id); pair.current._locked.add(id);
    for (let index = 0; index < 4; index++) step(pair, .1, { currentMps: .3 });
    assert.deepEqual(pair.current._record(pair.current._active.get(id)), before);
    pair.old._locked.delete(id); pair.current._locked.delete(id); step(pair, .1);
  }
});

test('failed load, retry, checkpoint, unload and returning to an old owner never retain a prior owner context', async t => {
  const pair = await fixture(t); step(pair, .3); await pair.old.checkpoint(); await pair.current.checkpoint();
  const destination = { x: pair.position.x + 64, z: pair.position.z };
  pair.oldStore.failLoadId = pair.currentStore.failLoadId = '4,-1';
  assert.equal(await pair.old.update(destination), false); assert.equal(await pair.current.update(destination), false); equal(pair);
  assert.ok(pair.current._active.size < 9); step(pair, .1, { currentMps: .3 });
  pair.oldStore.failLoadId = pair.currentStore.failLoadId = null;
  await pair.old.update(destination); await pair.current.update(destination); equal(pair); step(pair, .2, { currentMps: .4 });
  await pair.old.update(pair.position); await pair.current.update(pair.position); equal(pair); step(pair, .2, { currentMps: .18 });
  await pair.old.checkpoint(); await pair.current.checkpoint(); assert.deepEqual(savedRecords(pair.currentStore), savedRecords(pair.oldStore));
});

test('a thrown water tick closes and clears the transient cache through the real step finally block', async t => {
  const pair = await fixture(t), current = pair.current;
  current._tickWater = function(region) {
    const point = { x: (region.cx + .5) * 64, y: 0, z: (region.cz + .5) * 64 };
    this._mobileWaterContext(point, .4); assert.ok(this._waterContextMemo.size > 0); throw new Error('Intentional water-tick failure');
  };
  assert.throws(() => current.step(.1), /Intentional water-tick failure/);
  assert.equal(current._waterContextMemoActive, false); assert.equal(current._waterContextMemo.size, 0);
});

test('reset to another generator and disposal clear all contexts and save exactly the old full records', async t => {
  const pair = await fixture(t); step(pair, .3);
  await pair.old.reset('next-seed', createKelpOceanGenerator('next-seed'));
  await pair.current.reset('next-seed', createKelpOceanGenerator('next-seed')); equal(pair);
  await pair.old.update({ x: 259, z: -123 }); await pair.current.update({ x: 259, z: -123 }); equal(pair); step(pair, .2);
  await pair.old.dispose(); await pair.current.dispose(); equal(pair);
  assert.deepEqual(savedRecords(pair.currentStore), savedRecords(pair.oldStore));
});
