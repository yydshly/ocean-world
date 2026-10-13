import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OceanHistoryPreparation } from '../src/oceanHistoryPreparation.js';
import { OceanBackgroundPreparation } from '../src/oceanBackgroundPreparation.js';
import { createOceanPreparationJobs } from '../src/oceanPreparationJobs.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { withWholeSeabedGenerator } from '../src/wholeSeabedComposition.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { nativePreparation } from './helpers/ocean-preparation-node.mjs';

test('history lanes join every result, cancel siblings on failure, reject concurrency and stale replies', async () => {
  const workers = [];
  const pool = new OceanHistoryPreparation({ createPreparation: () => new OceanBackgroundPreparation({ workerFactory: () => {
    const worker = { messages: [], postMessage(message) { this.messages.push(message); }, terminate() { this.closed = true; } };
    workers.push(worker); return worker;
  } }) });
  const plans = Array.from({ length: 12 }, (_, index) => ({ id: String(index) }));
  const ack = pool.run('validate-group', { plans, retainContext: true });
  await assert.rejects(pool.run('generate', {}), /one/);
  workers.forEach((worker, index) => worker.onmessage({ data: { id: worker.messages.at(-1).id, value: { valid: true, contextToken: 'context-' + index } } }));
  const context = await ack;
  const rows = plans.map(row => ({ ...row, energy: 1 }));
  let finished = false;
  const history = pool.run('history', { contextToken: context.contextToken, rows }).then(value => { finished = true; return value; });
  for (const worker of workers) assert.equal(worker.messages.at(-1).payload.rows.length, 4);
  workers.slice(0, 2).forEach(worker => worker.onmessage({ data: { id: worker.messages.at(-1).id, value: true } }));
  await Promise.resolve(); assert.equal(finished, false);
  workers[2].onmessage({ data: { id: workers[2].messages.at(-1).id, value: false } });
  assert.equal(await history, false, 'a failing owner prevents the whole transaction');
  const failed = pool.run('history', { contextToken: context.contextToken, rows });
  workers[1].onerror({ message: 'worker lost' });
  await assert.rejects(failed, /worker lost/);
  assert.ok(workers.every(worker => worker.closed)); assert.equal(pool.contexts.size, 0);
  const retry = pool.run('validate-group', { plans, retainContext: true });
  workers[0].onmessage({ data: { id: workers[0].messages.at(-1).id, value: true } });
  assert.equal(pool.stats().pending, true);
  pool.cancel(); await assert.rejects(retry, { name: 'AbortError' });
  pool.dispose(); await assert.rejects(pool.run('history', {}), /disposed/);
});

const seed = livingShallowsSeed('55');
function fixture() {
  const run = createOceanPreparationJobs();
  const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  const start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'), end = source.indexOf(');', start) + 1;
  class Capture { constructor(s, g, options) { this.options = options; } }
  const options = new Function('OceanEcology', 'seed', 'return ' + source.slice(start, end))
    .call({ isLivingShallows: true, oceanWorldVariant: 'whole-seabed', oceanChunks: { generator: {} } }, Capture, seed).options;
  const plans = run('generate', { seed, wholeSeabed: true, version: 8, cx: 204, cz: 4 });
  const rows = run('birth', { seed, wholeSeabed: true, plans, ecologySeed: seed, options,
    environment: { hour: 10, currentMps: .15, turbidity: .25, foodSupply: 1 } });
  return { plans, rows };
}

test('real lanes preserve complete history verdicts, repeat mutable checks and never publish terrain', async () => {
  const { plans, rows } = fixture(), before = structuredClone(rows);
  const pool = new OceanHistoryPreparation({ createPreparation: nativePreparation });
  const generator = createLivingRidgeGenerator(withWholeSeabedGenerator(createLivingShallowsGenerator(seed), true), { preparation: pool });
  try {
    const context = await generator.prepareReefValleyContextAsync(plans);
    assert.equal(await context.validateHistory(rows, seed), true);
    for (let lane = 0; lane < 3; lane++) {
      const changed = structuredClone(rows); changed[lane].resources.detritus = -1;
      assert.equal(await context.validateHistory(changed, seed), false, 'reject corrupt records in every lane');
    }
    const changed = structuredClone(rows); changed.find(row => row.agents.length).agents[0].energy = -1;
    assert.equal(await context.validateHistory(changed, seed), false);
    assert.equal(await context.validateHistory(rows, seed), true, 'no prior verdict replaces current record validation');
    assert.equal(generator.registryStats().size, 0); assert.deepEqual(rows, before);
    assert.equal(pool.stats().laneCount, 3);
  } finally { pool.dispose(); }
});

test('overlapping frozen terrain retains identity, but one changed vertex fails before halo publication', () => {
  const { plans } = fixture();
  const generator = createLivingRidgeGenerator(withWholeSeabedGenerator(createLivingShallowsGenerator(seed), true));
  generator.replaceRidgeOwners(plans);
  const before = generator.registryStats(), owner = generator.getRidgePlan(plans[0].id);
  assert.ok(Object.isFrozen(owner.floorPatch.heights));
  assert.equal(generator.replaceRidgeOwners(structuredClone(plans)), false);
  assert.equal(generator.getRidgePlan(owner.id), owner);
  const changed = structuredClone(plans); changed[0].floorPatch.heights[2000] += .2;
  assert.throws(() => generator.replaceRidgeOwners(changed), /Invalid/);
  assert.deepEqual(generator.registryStats(), before);
  assert.equal(generator.getRidgePlan(owner.id), owner);
});
