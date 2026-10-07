import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isOceanBenthicLifeAgent } from '../src/oceanBenthicLife.js';

// Isolated native CPU model timing. Do not run simultaneously with a test batch.
// Each phase restores the same actually persisted native records; generation,
// restore validation, checkpoint and invariant checks are outside step timing.
const mode = process.argv[2];
assert.ok(['baseline', 'compare'].includes(mode), 'Use baseline or compare.');
const directory = resolve('output/validation');
const inputsPath = resolve(directory, 'ocean-support-performance-inputs.json');
const baselinePath = resolve(directory, 'ocean-support-performance-baseline.json');
const modelPath = resolve(directory, 'ocean-support-performance-model.json');
const seed = livingShallowsSeed('42');
const windows = [{ cx: 176, cz: 8 }, { cx: 188, cz: 17 }];
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'persisted number must be finite');
  return value;
}
const serialized = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(serialized(value)).digest('hex');
class MemoryStore {
  available = true;
  records;
  constructor(records = []) { this.records = new Map(clone(records)); }
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, rows) {
    for (const [id, row] of clone(rows)) this.records.set(`${world}|${id}`, row);
  }
}
function fixture(records = []) {
  const store = new MemoryStore(records);
  const generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, biodiversity: true, benthicLife: true });
  return { store, generator, model };
}
const position = ({ cx, cz }) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
function verify(f) {
  assert.equal(f.model._active.size, 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  let largestBalanceError = 0, largestFoodError = 0;
  for (const row of f.model._active.values()) {
    assert.equal(row.benthicLifeVersion, 1);
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(row), row.id);
    largestBalanceError = Math.max(largestBalanceError, Math.abs(livingNetworkBalance(row)));
    const foodError = row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus;
    largestFoodError = Math.max(largestFoodError, Math.abs(foodError));
    assert.ok(Math.abs(foodError) < 1e-8, `food stock balance ${row.id}: ${foodError}`);
    assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8);
  }
  return { largestBalanceError, largestFoodError };
}
function counters(f) {
  return capture(f.model._active).map(([id, row]) => ({ id, timeSec: row.timeSec,
    individualRecordCount: row.agents.length + (row.turtleAgents?.length ?? 0),
    newSpecies: row.agents.filter(isOceanBenthicLifeAgent).map(agent => agent.speciesId),
    counters: row.counters, benthicCounters: row.benthicLife.counters,
    resources: row.resources, ledger: row.ledger, basicNetwork: row.basicNetwork }));
}
async function sourceHashes() {
  const files = ['src/oceanEcology.js', 'src/oceanRockShape.js', 'src/oceanBenthicLife.js',
    'src/oceanBiodiversity.js', 'scripts/benchmark-ocean-support.mjs'];
  return Object.fromEntries(await Promise.all(files.map(async path => [path,
    createHash('sha256').update(await readFile(path)).digest('hex')])));
}
await mkdir(directory, { recursive: true });
let inputs;
if (mode === 'baseline') {
  inputs = [];
  for (const window of windows) {
    const fresh = fixture();
    assert.notEqual(await fresh.model.update(position(window)), false);
    verify(fresh);
    assert.ok([...fresh.model._active.values()].every(row => row.timeSec === 0));
    await fresh.model.checkpoint();
    inputs.push({ window, records: capture(fresh.store.records), active: capture(fresh.model._active) });
  }
  await writeFile(inputsPath, `${JSON.stringify({ seed, inputs }, null, 2)}\n`);
} else {
  const saved = JSON.parse(await readFile(inputsPath, 'utf8'));
  assert.equal(saved.seed, seed);
  inputs = saved.inputs;
}
const results = [];
for (const input of inputs) {
  const f = fixture(input.records);
  assert.notEqual(await f.model.update(position(input.window)), false);
  assert.equal(serialized(capture(f.model._active)), serialized(input.active), 'cold restore must retain exact starting records');
  verify(f);
  const counts = { surface: 0, bed: 0 };
  for (const [method, key] of [['_surface', 'surface'], ['_bed', 'bed']]) {
    const original = f.model[method];
    f.model[method] = function (...args) { counts[key]++; return original.apply(this, args); };
  }
  console.log(JSON.stringify({ phase: mode, window: input.window, event: 'steps-started' }));
  const started = performance.now();
  f.model.step(8, { hour: 0 });
  const nightDone = performance.now(), nightCounts = { ...counts };
  const nightState = capture(f.model._active);
  counts.surface = 0; counts.bed = 0;
  const dayStarted = performance.now();
  f.model.step(4, { hour: 12 });
  const dayDone = performance.now(), dayCounts = { ...counts };
  // Exclude serialization from day timing.
  await f.model.checkpoint();
  const balance = verify(f), finalState = capture(f.model._active), persistedState = capture(f.store.records);
  const result = { window: input.window, startingRecordDigest: digest(input.records),
    activeOwnerCount: f.model._active.size, supportOwnerCount: f.generator.registryStats().size,
    supportCacheOwnerCount: f.model._supportCells.size, simulatedNightSec: 8, simulatedDaySec: 4,
    nightStepWallTimeMs: nightDone - started, dayStepWallTimeMs: dayDone - dayStarted,
    nightCalls: nightCounts, dayCalls: dayCounts, nightRecordDigest: digest(nightState),
    finalRecordDigest: digest(finalState), persistedRecordDigest: digest(persistedState),
    ...balance, ownerCounters: counters(f) };
  results.push({ summary: result, nightState, finalState, persistedState });
  console.log(JSON.stringify({ phase: mode, ...result, ownerCounters: undefined }));
}
const run = { scope: 'Two isolated native CPU runs from fixed actual persisted string42 owner records; no browser/GPU/FPS claim',
  timingProtocol: 'One cold-restored fixture per window. Native restore/validation warms support caches before 8s night followed by 4s day. Queries remain fully enabled. Both phases count _surface/_bed calls. No repetitions or concurrent test batch.',
  sourceHashes: await sourceHashes(), results };
if (mode === 'baseline') {
  await writeFile(baselinePath, `${JSON.stringify(run, null, 2)}\n`);
  console.log('BASELINE_COMPLETE');
} else {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const comparisons = results.map((result, index) => {
    const before = baseline.results[index], after = result;
    for (const field of ['nightState', 'finalState', 'persistedState'])
      assert.equal(serialized(after[field]), serialized(before[field]), `${field} must match exactly for ${index}`);
    assert.deepEqual(after.summary.nightCalls, before.summary.nightCalls);
    assert.deepEqual(after.summary.dayCalls, before.summary.dayCalls);
    const b = before.summary, a = after.summary;
    return { window: a.window, startingRecordDigest: a.startingRecordDigest,
      before: b, after: a, exactNightRecords: true, exactFinalRecords: true, exactPersistedRecords: true,
      nightTimeReductionFraction: 1 - a.nightStepWallTimeMs / b.nightStepWallTimeMs,
      dayTimeReductionFraction: 1 - a.dayStepWallTimeMs / b.dayStepWallTimeMs };
  });
  await writeFile(modelPath, `${JSON.stringify({ scope: run.scope, timingProtocol: run.timingProtocol,
    baselineSourceHashes: baseline.sourceHashes, optimizedSourceHashes: run.sourceHashes, comparisons }, null, 2)}\n`);
  console.log('EXACT_COMPARISON_COMPLETE');
}
