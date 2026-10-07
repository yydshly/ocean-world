import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { predatorEnergyBudgetError } from '../src/deepPredatorEcology.js';
import { validateDeepBenthicLifeRecord, deepBenthicLifeEnergyBudgetError } from '../src/deepBenthicLife.js';
import { validateDeepHardLifeRecord, deepHardLifeFoodBudgetError, deepHardLifeEnergyBudgetError } from '../src/deepHardLife.js';
import { DEEP_WATER_LIFE_IDS, DEEP_WATER_LIFE_MODEL, deepWaterLifePositionValid,
  deepWaterLifeFeedingPosition, validateDeepWaterLifeRecord, deepWaterLifeFoodBudgetError,
  deepWaterLifeEnergyBudgetError } from '../src/deepWaterLife.js';
import { deepWaterLifeSpeciesCatalog, deepWaterLifeSpeciesById } from '../src/deepWaterLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Actual ordinary windows from the finite native admission scan; complete
// source forms and native food sites, without supplied hosts or RNG overrides.
const windows = [at(173, 8), at(180, 8)], opening = windows[0], far = at(-38, 25);
const observedSec = [24, 12], environment = { foodSupply: 1, currentMps: .18, hour: 12, observerLight: .35 };
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.deepWaterLifeAgents ?? [];
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? [], row.deepBenthicAgents ?? [], row.deepHardLifeAgents ?? [], newAnimals(row));
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('near-bottom swimmer atomic commit rejected');
    const offered = clone(entries); if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), waterLife = true) {
  const generator = createDeepOceanGenerator(seed, { seascape: true, wholeSeascape: true });
  const model = new DeepOceanEcology(seed, generator, { store, seascape: true,
    wholeSeascape: true, benthicLife: true, hardLife: true, waterLife });
  return { generator, model, store };
}
function balances(row) {
  const byPool = Object.fromEntries([['surfaceDetritus', row.sim.surfacePatches], ['benthicAnimalFood', row.sim.benthicPatches],
    ['suspendedPrey', row.sim.suspendedPatches]].map(([pool, patches]) => {
    const l = row.sim.ledger.byPool[pool], stock = patches.reduce((sum, p) => sum + p[pool], 0);
    return [pool, stock - (l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported)];
  }));
  return { byPool, food: row.sim.metrics.resourceBudgetError, native: row.sim.metrics.energyBudgetError,
    predator: predatorEnergyBudgetError(row), oldBottom: deepBenthicLifeEnergyBudgetError(row),
    oldHardFood: deepHardLifeFoodBudgetError(row), oldHardCondition: deepHardLifeEnergyBudgetError(row),
    newFood: deepWaterLifeFoodBudgetError(row), newCondition: deepWaterLifeEnergyBudgetError(row) };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.seascapeRegistryStats().size <= 25);
  const snapshot = f.model.snapshot(); close(snapshot.combinedFoodBalanceError, 'complete active control volume');
  close(snapshot.combinedFoodStock - Object.values(snapshot.resources).reduce((sum, n) => sum + n, 0), 'all existing typed food stocks');
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, row.id);
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    for (const [pool, error] of Object.entries(balances(row).byPool)) close(error, `${row.id} original ${pool}`);
    for (const [key, error] of Object.entries(balances(row)).filter(([key]) => key !== 'byPool')) close(error, `${row.id} ${key}`);
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
    const raw = f.model._record(row);
    for (const validate of [validateDeepBenthicLifeRecord, validateDeepHardLifeRecord, validateDeepWaterLifeRecord])
      assert.ok(validate(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} complete old and new history`);
    if (row.deepWaterLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); continue; }
    assert.equal(row.deepWaterLifeVersion, 1); assert.ok(newAnimals(row).length <= 4);
    assert.equal(row.deepWaterLife.counters.ticks, row.sim._ticks); assert.equal(row.deepWaterLife.lastTickSec, row.sim.timeSec);
    const publicRow = snapshot.regions.find(r => r.id === row.id);
    close(publicRow.combinedFoodBalanceError, `${row.id} combined ledger`);
    for (const key of ['initial', 'input', 'ingested', 'exported'])
      assert.equal(publicRow.combinedFoodLedger[key], row.sim.ledger[key] + (row.deepHardLife?.foodLedger?.[key] ?? 0));
    for (const a of newAnimals(row)) {
      assert.ok(deepWaterLifePositionValid(f.generator, row, a), `${row.id}/${a.id} whole anatomy`);
      assert.equal(a.nutritionPool, 'benthicAnimalFood'); assert.ok(Math.abs(a.pitch) <= .12);
      if (a.alive) assert.equal(a.timeSec, row.sim.timeSec);
    }
  }
}
// Record actual property writes, preserving every native value and operation.
// A last-intake object alone cannot prove that a real existing patch was debited.
function observeNativeIntakes(row, traces) {
  const cleanup = [], latest = new Map(); let lastIngestion, lastGain;
  const poolLedger = row.sim.ledger.byPool.benthicAnimalFood;
  let ingested = poolLedger.ingested, feedingGain = row.deepWaterEnergyLedger.feedingGain;
  Object.defineProperty(poolLedger, 'ingested', { configurable: true, enumerable: true, get: () => ingested,
    set: next => { lastIngestion = { ingestionBefore: ingested, ingestionAfter: next }; ingested = next; } });
  cleanup.push(() => Object.defineProperty(poolLedger, 'ingested', { configurable: true, enumerable: true, writable: true, value: ingested }));
  Object.defineProperty(row.deepWaterEnergyLedger, 'feedingGain', { configurable: true, enumerable: true, get: () => feedingGain,
    set: next => { lastGain = { gainBefore: feedingGain, gainAfter: next }; feedingGain = next; } });
  cleanup.push(() => Object.defineProperty(row.deepWaterEnergyLedger, 'feedingGain', { configurable: true, enumerable: true, writable: true, value: feedingGain }));
  for (const patch of row.sim.benthicPatches) {
    let stock = patch.benthicAnimalFood;
    Object.defineProperty(patch, 'benthicAnimalFood', { configurable: true, enumerable: true, get: () => stock,
      set: next => { latest.set(patch.id, { patch, stockBefore: stock, stockAfter: next }); stock = next; } });
    cleanup.push(() => Object.defineProperty(patch, 'benthicAnimalFood', { configurable: true, enumerable: true, writable: true, value: stock }));
  }
  for (const a of newAnimals(row)) {
    let receipt = a.lastWaterLifeIntake;
    Object.defineProperty(a, 'lastWaterLifeIntake', { configurable: true, enumerable: true, get: () => receipt,
      set: next => {
        receipt = next; if (!next) return; const debit = latest.get(next.patchId);
        assert.ok(debit && lastIngestion && lastGain, 'existing patch and both actual ledgers wrote before receipt');
        assert.equal(next.pool, 'benthicAnimalFood'); assert.equal(next.ownerId, row.id);
        assert.equal(next.patchId, a.deepWaterFoodPatchId); assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        assert.ok(next.stockBefore > 0); close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual native patch debit');
        close(lastIngestion.ingestionAfter - lastIngestion.ingestionBefore - next.removedUnits, 'original pool ingestion');
        close(lastGain.gainAfter - lastGain.gainBefore - (next.energyAfter - next.energyBefore), 'independent relative condition gain');
        assert.equal(next.energyAfter, a.energy); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(a.lastFeedAt, row.sim.timeSec); assert.equal(a.timeSec, row.sim.timeSec);
        assert.deepEqual(next.agentPosition, a.position); assert.equal(next.agentHeading, a.heading); assert.equal(next.agentPitch, a.pitch);
        assert.deepEqual(next.feedingPosition, deepWaterLifeFeedingPosition(a)); assert.deepEqual(next.foodPosition, debit.patch.position);
        close(distance(next.foodPosition, next.feedingPosition) - next.contactDistanceM, 'actual fixed mouth contact');
        assert.ok(next.contactDistanceM <= DEEP_WATER_LIFE_MODEL.feedingDistanceM);
        close(deepWaterLifeFoodBudgetError(row), 'original food volume balances at ingestion');
        traces.push({ agentId: a.id, speciesId: a.speciesId, ...clone(next), ...lastIngestion, ...lastGain,
          individualClockSec: a.timeSec, ownerClockSec: row.sim.timeSec, originalFoodBalanceError: deepWaterLifeFoodBudgetError(row) });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastWaterLifeIntake', { configurable: true, enumerable: true, writable: true, value: receipt }));
  }
  return () => cleanup.forEach(done => done());
}
let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), union = new Set(), owners = [], windowActivity = []; let initial, firstFinal;
    for (let index = 0; index < windows.length; index++) {
      f.store.reads.length = 0; assert.equal(await f.model.update(windows[index]), true, f.model._storageError); bounded(f);
      assert.ok(f.store.reads.length <= 24); if (index === 0) initial = stored(f.store);
      const before = new Map(), intakes = [], cleanup = [], offscreen = [...f.store.records]
        .filter(([, r]) => !f.model._active.has(r.id)).map(([id, r]) => [id, clone(r)]);
      for (const row of f.model._active.values()) {
        assert.equal(row.sim.timeSec, 0); assert.equal(row.deepWaterLifeVersion, 1);
        assert.equal(row.deepWaterLifeInitializedAtSec, 0); assert.equal(row.deepWaterLife.counters.consumedUnits, 0);
        assert.equal(row.deepWaterEnergyLedger.feedingGain, 0);
        for (const a of newAnimals(row)) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        owners.push({ id: row.id, role: row.deepWaterLife.role, totalAnimalRecordCount: allAnimals(row).length,
          originalFoodStock: clone(row.sim.resources), originalFoodLedger: clone(row.sim.ledger),
          newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM,
            sizeMeasure: deepWaterLifeSpeciesById[a.speciesId].sizeMeasure, actualRootDepthM: f.generator.surfaceY - a.position.y,
            position: clone(a.position), heading: a.heading, pitch: a.pitch, actualFeedingPosition: deepWaterLifeFeedingPosition(a),
            foodPatchId: a.deepWaterFoodPatchId, nutritionPool: a.nutritionPool, energy: a.energy, timeSec: a.timeSec })) });
        cleanup.push(observeNativeIntakes(row, intakes));
      }
      const started = performance.now();
      try { for (let tick = 0; tick < observedSec[index] * 10; tick++) f.model.step(.1, environment); }
      finally { cleanup.forEach(done => done()); }
      bounded(f); assert.equal(await f.model.checkpoint(), true, f.model._storageError);
      for (const [id, raw] of offscreen) assert.deepEqual(f.store.records.get(id), raw, 'offscreen clocks, food and full history freeze');
      const snap = f.model.snapshot();
      windowActivity.push({ point: windows[index], observedSec: observedSec[index], actualCpuWallTimeMs: performance.now() - started,
        activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.seascapeRegistryStats().size,
        newAnimalRecordCount: before.size, successfulBites: intakes.length, actualIntakes: intakes,
        combinedFoodLedger: clone(snap.combinedFoodLedger), combinedFoodStock: snap.combinedFoodStock, combinedFoodBalanceError: snap.combinedFoodBalanceError,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, role: row.deepWaterLife.role,
          totalAnimalRecordCount: allAnimals(row).length, clockSec: row.sim.timeSec, ticks: row.sim._ticks,
          originalFoodStock: clone(row.sim.resources), originalFoodLedger: clone(row.sim.ledger), newLife: clone(row.deepWaterLife),
          newConditionLedger: clone(row.deepWaterEnergyLedger), balanceErrors: balances(row),
          agents: newAnimals(row).map(a => {
            const displacementM = distance(a.position, before.get(a.id).position);
            assert.ok(displacementM <= DEEP_WATER_LIFE_MODEL.traits[a.speciesId].speedMps * observedSec[index] + 1e-8);
            return { id: a.id, speciesId: a.speciesId, alive: a.alive, state: a.state, timeSec: a.timeSec,
              energy: a.energy, position: clone(a.position), heading: a.heading, pitch: a.pitch, displacementM, travelledM: a.travelledM,
              feedingCount: a.feedingCount, consumedUnits: a.consumedUnits, lastFeedAt: a.lastFeedAt, lastWaterLifeIntake: clone(a.lastWaterLifeIntake) };
          }) })) });
      if (index === 0) firstFinal = stored(f.store);
    }
    return { initial, firstFinal, union: [...union], owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary all-feature deep windows move whole near-bottom animals and debit real existing food with complete condition and food ledgers', async () => {
  const actual = await sample(); assert.deepEqual(new Set(actual.union), new Set(DEEP_WATER_LIFE_IDS));
  const bites = actual.windowActivity.flatMap(w => w.actualIntakes), observations = actual.windowActivity.flatMap(w => w.owners);
  assert.deepEqual(new Set(bites.map(b => b.speciesId)), new Set(DEEP_WATER_LIFE_IDS),
    'two actual native species contact existing food; individual zero-feeding cases remain truthful');
  assert.deepEqual(new Set(observations.flatMap(r => r.agents).filter(a => a.displacementM > 1e-8).map(a => a.speciesId)), new Set(DEEP_WATER_LIFE_IDS));
  assert.ok(actual.owners.some(r => r.newAgents.length === 0), 'naturally complete empty category is retained');
  const repeat = fixture(); assert.equal(await repeat.model.update(opening), true); assert.deepEqual(stored(repeat.store), actual.initial);
  for (let tick = 0; tick < observedSec[0] * 10; tick++) repeat.model.step(.1, environment);
  bounded(repeat); assert.equal(await repeat.model.checkpoint(), true); assert.deepEqual(stored(repeat.store), actual.firstFinal);
  const control = fixture(new MemoryStore(), false); assert.equal(await control.model.update(opening), true);
  for (const row of records(control.model)) {
    const birth = actual.initial.find(([, raw]) => raw.id === row.id)?.[1]; assert.ok(birth);
    assert.deepEqual(birth.state, row.state, 'admission leaves original RNG, food, animals and native clocks exact');
    for (const key of Object.keys(row).filter(k => k.startsWith('deepBenthic') || k.startsWith('deepHard') || k.startsWith('predator')))
      assert.deepEqual(birth[key], row[key], `admission preserves original ${key}`);
  }
  const dark = fixture(fromRecords(actual.initial)), lit = fixture(fromRecords(actual.initial));
  assert.equal(await dark.model.update(opening), true); assert.equal(await lit.model.update(opening), true);
  dark.model.step(.2, { ...environment, foodSupply: 0, observerLight: 0, hour: 0 });
  lit.model.step(.2, { ...environment, foodSupply: 0, observerLight: 1, hour: 24 });
  for (const row of dark.model._active.values()) {
    const other = lit.model._active.get(row.id); assert.deepEqual(row.deepWaterLife, other.deepWaterLife);
    assert.deepEqual(newAnimals(row), newAnimals(other)); assert.deepEqual(row.deepWaterEnergyLedger, other.deepWaterEnergyLedger);
  }
  if (process.env.DEEP_WATER_LIFE_RECEIPT) {
    const { initial, firstFinal, ...evidence } = actual, errors = observations.map(r => r.balanceErrors);
    const summary = { productionWindows: 2, observedSecPerWindow: observedSec,
      actualNewIndividuals: actual.owners.reduce((sum, r) => sum + r.newAgents.length, 0),
      movedIndividuals: observations.flatMap(r => r.agents).filter(a => a.displacementM > 1e-8).length,
      fedIndividuals: new Set(bites.map(b => b.agentId)).size, successfulBites: bites.length,
      intakeUnits: bites.reduce((sum, b) => sum + b.removedUnits, 0), newInitialFoodUnits: 0, newExternalInputUnits: 0,
      maxAllAnimalRecordsPerOwner: Math.max(...observations.map(r => r.totalAnimalRecordCount)),
      maxFoodBalanceError: Math.max(...errors.flatMap(e => [e.food, e.oldHardFood, e.newFood, ...Object.values(e.byPool)]).map(Math.abs)),
      maxCombinedFoodBalanceError: Math.max(...actual.windowActivity.map(w => Math.abs(w.combinedFoodBalanceError))),
      maxConditionBalanceError: Math.max(...errors.flatMap(e => [e.native, e.predator, e.oldBottom, e.oldHardCondition, e.newCondition]).map(Math.abs)) };
    await writeFile(process.env.DEEP_WATER_LIFE_RECEIPT, `${JSON.stringify({
      scope: 'CPU ordinary native near-bottom swimming/contact with old raw food/ledger, complete anatomy clearance and persistent history; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalLimit: 4, summary,
      entry: { ownerId: '173,8', x: 11093.79, z: 544.84, newIndividuals: 4, totalAnimalRecords: 15 },
      sourceSpecies: deepWaterLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, identityLevel: s.identityLevel,
        sizeMeasure: s.sizeMeasure, depthSelectionM: s.depthSelectionM, selectedFoodPool: s.foodPool,
        feedingEvidenceLevel: s.feedingEvidenceLevel, sourceLinks: s.sourceLinks })),
      countsBySpecies: Object.fromEntries(DEEP_WATER_LIFE_IDS.map(id => [id, {
        bornIndividuals: actual.owners.flatMap(r => r.newAgents).filter(a => a.speciesId === id).length,
        movedIndividuals: observations.flatMap(r => r.agents).filter(a => a.speciesId === id && a.displacementM > 1e-8).length,
        fedIndividuals: new Set(bites.filter(b => b.speciesId === id).map(b => b.agentId)).size,
        actualIntakes: bites.filter(b => b.speciesId === id).length,
        consumedUnits: bites.filter(b => b.speciesId === id).reduce((sum, b) => sum + b.removedUnits, 0) }])), ...evidence }, null, 2)}\n`);
  }
});

test('complete near-bottom death and empty rosters unload, revisit and cold restore without recruitment or native food refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.firstFinal)); assert.equal(await f.model.update(opening), true);
  const row = [...f.model._active.values()].find(r => newAnimals(r).some(a => a.alive)); assert.ok(row);
  const animal = newAnimals(row).find(a => a.alive), ids = newAnimals(row).map(a => a.id);
  row.deepWaterEnergyLedger.deathLoss += animal.energy; animal.energy = 0; animal.alive = false;
  animal.state = 'dead'; animal.stateSince = animal.timeSec; animal.velocity = { x: 0, y: 0, z: 0 }; row.deepWaterLife.counters.deaths++;
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'near-bottom-death'], retained: 23 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [4, 7] } };
  bounded(f); assert.equal(await f.model.checkpoint(), true); const before = records(f.model), activeIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(activeIds.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id); assert.deepEqual(newAnimals(restored).map(a => a.id), ids);
  const dead = clone(newAnimals(restored).find(a => a.id === animal.id)); cold.model.step(.1, environment);
  assert.deepEqual(newAnimals(restored).find(a => a.id === animal.id), dead); bounded(cold);
  assert.equal(cold.model.agents.find(a => a.id === animal.id).timeSec, dead.timeSec);
  assert.equal(cold.model.snapshot().agents.find(a => a.id === animal.id).timeSec, dead.timeSec);
  const empty = data.initial.find(([, r]) => ownerWindow(opening).has(r.id) && r.deepWaterLifeAgents.length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.equal(await emptyCold.model.update(opening), true);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
});

test('enabling swimmers on old all-feature histories preserves raw paused records and subsequent native steps exactly', async () => {
  const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(opening), true); old.model.step(.4, environment);
  const row = [...old.model._active.values()][0]; row._savedRecord = { ...row._savedRecord, opaqueHistory: { beforeWaterLife: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [7, 11] } };
  assert.equal(await old.model.checkpoint(), true); const disk = stored(old.store), enabled = fixture(fromRecords(disk)), disabled = fixture(fromRecords(disk), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), disk);
  assert.ok([...enabled.model._active.values()].every(r => r.deepWaterLifeVersion === undefined));
  assert.equal(await enabled.model.update(opening), true); assert.deepEqual(stored(enabled.store), disk);
  for (const dt of [.1, .2]) { enabled.model.step(dt, environment); disabled.model.step(dt, environment); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic swimmer births publish no actors or landscape revision before complete admission', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, r]) => r.deepWaterLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('new history was not offered atomically'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(offered.length, 9);
    for (const [, row] of offered) { assert.equal(row.state.timeSec, 0); assert.equal(row.deepWaterLifeVersion, 1);
      assert.equal(row.deepWaterLifeInitializedAtSec, 0); assert.equal(row.deepWaterEnergyLedger.feedingGain, 0); }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.generator.seascapeRevision, 0);
    assert.equal(failed.records.size, 0); assert.equal(failed.batches.length, 0);
  }
});

test('undefined and thrown historical reads cannot be treated as strict-null fresh swimmer births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('deep historical read unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false); assert.equal(f.model._active.size, 0);
    assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('finite partial swimmer markers, native stocks and complete offscreen history corruptions reject without refill or publication', async () => {
  const data = await sample(), desired = ownerWindow(opening);
  for (const damage of ['descriptor', 'version', 'individual', 'receipt', 'old-stock', 'identity', 'reserved', 'old-bottom']) {
    const store = fromRecords(data.firstFinal), f = fixture(store), [, row] = [...store.records]
      .find(([, r]) => desired.has(r.id) && r.deepWaterLifeAgents.length && r.state.benthicPatches.length && r.deepBenthicLifeVersion === 1);
    if (damage === 'descriptor') delete row.deepWaterLife;
    if (damage === 'version') delete row.deepWaterLifeVersion;
    if (damage === 'individual') delete row.deepWaterLifeAgents[0].deepWaterIndividualVersion;
    if (damage === 'receipt') row.deepWaterLifeAgents[0].lastFeedAt = .05;
    if (damage === 'old-stock') row.state.benthicPatches[0].benthicAnimalFood += .1;
    if (damage === 'identity') row.deepWaterLifeAgents[0].speciesId = 'pom-pom-anemone';
    if (damage === 'reserved') { for (const key of Object.keys(row).filter(k => k.startsWith('deepWater'))) delete row[key]; row.deepWaterReservedFuture = 1; }
    if (damage === 'old-bottom') delete row.deepBenthicLife;
    const before = stored(store); assert.equal(await f.model.update(opening), false, damage); assert.deepEqual(stored(store), before);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.length <= 24);
  }
  const historical = fixture(); assert.equal(await historical.model.update(at(171, 6)), true);
  const halo = stored(historical.store).find(([, r]) => r.id === '172,6' && r.state.agents.length && r.state.benthicPatches.length && r.deepWaterLifeVersion === 1);
  assert.ok(halo && !desired.has(halo[1].id));
  for (const damage of ['top-prefix', 'individual-prefix', 'old-stock', 'new-ledger', 'roster', 'old-category']) {
    const store = fromRecords(data.initial); store.records.set(halo[0], clone(halo[1])); const row = store.records.get(halo[0]), f = fixture(store);
    if (damage === 'top-prefix') row.deepWaterReservedFuture = 1;
    if (damage === 'individual-prefix') row.state.agents[0].deepWaterReservedFuture = 1;
    if (damage === 'old-stock') row.state.benthicPatches[0].benthicAnimalFood += .1;
    if (damage === 'new-ledger') row.deepWaterEnergyLedger.feedingGain += .1;
    if (damage === 'roster') row.deepWaterLife.addedIds.push('missing-near-bottom-individual');
    if (damage === 'old-category') delete row.predatorEnergyLedger;
    const before = stored(store); assert.equal(await f.model.update(opening), false, `offscreen ${damage}`);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.includes(halo[1].id)); assert.ok(store.reads.length <= 24);
  }
});
