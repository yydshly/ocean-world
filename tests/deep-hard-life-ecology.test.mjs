import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { predatorEnergyBudgetError } from '../src/deepPredatorEcology.js';
import { validateDeepBenthicLifeRecord, deepBenthicLifeEnergyBudgetError } from '../src/deepBenthicLife.js';
import { DEEP_HARD_LIFE_IDS, DEEP_HARD_LIFE_MODEL, DEEP_HARD_LIFE_FOOD_POOLS,
  deepHardLifePositionValid, deepHardLifeFeedingPosition, validateDeepHardLifeRecord,
  deepHardLifeFoodBudgetError, deepHardLifeEnergyBudgetError, deepHardLifeSnapshot } from '../src/deepHardLife.js';
import { deepHardLifeSpeciesCatalog, deepHardLifeSpeciesById } from '../src/deepHardLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Final ordinary windows are chosen by the finite native admission scan. No
// supplied hosts, forced organisms, new initial stock or RNG override is used.
const windows = [at(156, 8), at(160, 8)], opening = windows[0], far = at(-38, 25);
const environment = { foodSupply: 1, currentMps: .18, hour: 12, observerLight: .35 };
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.deepHardLifeAgents ?? [];
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? [], row.deepBenthicAgents ?? [], newAnimals(row));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('deep hard-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), hardLife = true) {
  const generator = createDeepOceanGenerator(seed, { seascape: true, wholeSeascape: true });
  const model = new DeepOceanEcology(seed, generator, { store, seascape: true, wholeSeascape: true, benthicLife: true, hardLife });
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
    newFood: deepHardLifeFoodBudgetError(row), newCondition: deepHardLifeEnergyBudgetError(row) };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.seascapeRegistryStats().size <= 25);
  const snapshot = f.model.snapshot(); close(snapshot.combinedFoodBalanceError, 'whole active food control volume');
  close(snapshot.combinedFoodStock - Object.values(snapshot.resources).reduce((sum, n) => sum + n, 0), 'all five visible pools');
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, row.id);
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    const errors = balances(row);
    for (const [pool, error] of Object.entries(errors.byPool)) close(error, `${row.id} original ${pool}`);
    for (const key of ['food', 'native', 'predator', 'oldBottom', 'newFood', 'newCondition']) close(errors[key], `${row.id} ${key}`);
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
    const raw = f.model._record(row);
    assert.ok(validateDeepBenthicLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} prior bottom history`);
    assert.ok(validateDeepHardLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} new complete history`);
    if (row.deepHardLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); continue; }
    assert.equal(row.deepHardLifeVersion, 1); assert.ok(newAnimals(row).length <= 4);
    assert.equal(row.deepHardLife.counters.ticks, row.sim._ticks); assert.equal(row.deepHardLife.lastTickSec, row.sim.timeSec);
    assert.ok(row.deepHardLife.parcels.length <= DEEP_HARD_LIFE_MODEL.maximumParcels);
    assert.ok(row.deepHardLife.channels.length <= DEEP_HARD_LIFE_MODEL.maximumChannels);
    const publicRow = snapshot.regions.find(r => r.id === row.id), hard = deepHardLifeSnapshot(row);
    assert.deepEqual(publicRow.deepHardResources, hard.resources);
    assert.deepEqual(publicRow.deepHardFoodLedger, hard.foodLedger); close(publicRow.combinedFoodBalanceError, `${row.id} combined ledger`);
    for (const key of ['initial', 'input', 'ingested', 'exported'])
      assert.equal(publicRow.combinedFoodLedger[key], row.sim.ledger[key] + row.deepHardLife.foodLedger[key]);
    for (const a of newAnimals(row)) {
      assert.ok(deepHardLifePositionValid(f.generator, row, a), `${row.id}/${a.id} entire attached form`);
      assert.equal(f.generator.supportAt(a.position.x, a.position.z).substrate, 'rock');
      assert.equal(f.generator.supportAt(a.position.x, a.position.z).elementId, a.deepHardHostId);
      assert.deepEqual(a.velocity, { x: 0, y: 0, z: 0 });
      if (a.alive) assert.equal(a.timeSec, row.sim.timeSec);
    }
  }
}
// Observe actual writes without changing food, clocks, random choices or
// transport. Fresh external parcels are discovered after their ordinary birth.
function observeNativeIntakes(row, traces) {
  const d = row.deepHardLife, latest = new Map(), watched = new WeakSet(), cleanup = [];
  let lastIngestion, lastGain, ingested = d.foodLedger.ingested, feedingGain = row.deepHardEnergyLedger.feedingGain;
  Object.defineProperty(d.foodLedger, 'ingested', { configurable: true, enumerable: true, get: () => ingested,
    set: next => { lastIngestion = { ingestionBefore: ingested, ingestionAfter: next }; ingested = next; } });
  cleanup.push(() => Object.defineProperty(d.foodLedger, 'ingested', { configurable: true, enumerable: true, writable: true, value: ingested }));
  Object.defineProperty(row.deepHardEnergyLedger, 'feedingGain', { configurable: true, enumerable: true, get: () => feedingGain,
    set: next => { lastGain = { gainBefore: feedingGain, gainAfter: next }; feedingGain = next; } });
  cleanup.push(() => Object.defineProperty(row.deepHardEnergyLedger, 'feedingGain', { configurable: true, enumerable: true, writable: true, value: feedingGain }));
  function watchParcels() {
    for (const parcel of d.parcels) {
      if (watched.has(parcel)) continue; watched.add(parcel); let amount = parcel.amount;
      Object.defineProperty(parcel, 'amount', { configurable: true, enumerable: true, get: () => amount,
        set: next => { latest.set(parcel.id, { parcel, stockBefore: amount, stockAfter: next }); amount = next; } });
      cleanup.push(() => Object.defineProperty(parcel, 'amount', { configurable: true, enumerable: true, writable: true, value: amount }));
    }
  }
  for (const a of newAnimals(row)) {
    let receipt = a.lastHardLifeIntake;
    Object.defineProperty(a, 'lastHardLifeIntake', { configurable: true, enumerable: true, get: () => receipt,
      set: next => {
        receipt = next; if (!next) return;
        const debit = latest.get(next.parcelId), channel = d.channels.find(c => c.id === a.deepHardChannelId);
        assert.ok(debit && channel && lastIngestion && lastGain, 'real prior parcel, source and both ledgers wrote');
        assert.equal(next.ownerId, row.id); assert.equal(next.pool, a.nutritionPool); assert.equal(next.hostId, a.deepHardHostId);
        assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        assert.ok(next.stockBefore > 0); close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual independent parcel debit');
        close(lastIngestion.ingestionAfter - lastIngestion.ingestionBefore - next.removedUnits, 'actual control-volume ingestion');
        close(lastGain.gainAfter - lastGain.gainBefore - (next.energyAfter - next.energyBefore), 'actual independent condition gain');
        assert.equal(next.energyAfter, a.energy); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(a.lastFeedAt, row.sim.timeSec); assert.equal(a.timeSec, row.sim.timeSec);
        assert.deepEqual(next.agentPosition, a.position); assert.deepEqual(next.feedingPosition, deepHardLifeFeedingPosition(a));
        assert.deepEqual(next.foodPosition, debit.parcel.position); assert.deepEqual(next.sourcePosition, channel.sourcePosition);
        assert.equal(next.foodPosition.y, next.sourcePosition.y); assert.equal(next.foodPosition.z, next.sourcePosition.z);
        close(next.foodPosition.x - next.sourcePosition.x - next.parcelTravelM, 'actual constant-Y positive-X path');
        assert.ok(next.parcelTravelM > 0); assert.ok(next.timeSec > next.parcelCreatedAtSec);
        close(distance(next.foodPosition, next.feedingPosition) - next.contactDistanceM, 'actual fixed organ contact');
        assert.ok(next.contactDistanceM <= DEEP_HARD_LIFE_MODEL.maximumFoodDistanceM);
        close(deepHardLifeFoodBudgetError(row), 'new food ledger immediately at real ingestion');
        traces.push({ agentId: a.id, speciesId: a.speciesId, ...clone(next), ...lastIngestion, ...lastGain,
          individualClockSec: a.timeSec, ownerClockSec: row.sim.timeSec, independentFoodBalanceError: deepHardLifeFoodBudgetError(row) });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastHardLifeIntake', { configurable: true, enumerable: true, writable: true, value: receipt }));
  }
  return { watchParcels, stop: () => cleanup.forEach(done => done()) };
}
let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), union = new Set(), owners = [], windowActivity = []; let initial, firstFinal, secondInitial;
    for (let index = 0; index < windows.length; index++) {
      f.store.reads.length = 0; assert.equal(await f.model.update(windows[index]), true, f.model._storageError); bounded(f);
      assert.ok(f.store.reads.length <= 24);
      if (index === 0) initial = stored(f.store); else secondInitial = stored(f.store);
      const before = new Map(), intakes = [], observers = [], offscreen = [...f.store.records]
        .filter(([, r]) => !f.model._active.has(r.id)).map(([id, r]) => [id, clone(r)]);
      for (const row of f.model._active.values()) {
        assert.equal(row.sim.timeSec, 0); assert.equal(row.deepHardLifeVersion, 1);
        assert.equal(row.deepHardLife.foodLedger.initial, 0); assert.equal(row.deepHardLife.foodLedger.input, 0);
        assert.deepEqual(row.deepHardLife.parcels, []); assert.equal(row.deepHardLife.counters.consumedUnits, 0);
        for (const a of newAnimals(row)) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        owners.push({ id: row.id, role: row.deepHardLife.role, totalAnimalRecordCount: allAnimals(row).length,
          originalFoodStock: clone(row.sim.resources), originalFoodLedger: clone(row.sim.ledger),
          newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM,
            sizeMeasure: deepHardLifeSpeciesById[a.speciesId].sizeMeasure, actualRootDepthM: f.generator.surfaceY - a.position.y,
            hostId: a.deepHardHostId, position: clone(a.position), supportNormal: clone(a.supportNormal),
            actualFeedingPosition: deepHardLifeFeedingPosition(a), nutritionPool: a.nutritionPool, energy: a.energy, timeSec: a.timeSec })) });
        observers.push(observeNativeIntakes(row, intakes));
      }
      const started = performance.now();
      try { for (let i = 0; i < 40; i++) { observers.forEach(o => o.watchParcels()); f.model.step(.1, environment); } }
      finally { observers.forEach(o => o.stop()); }
      bounded(f); assert.equal(await f.model.checkpoint(), true);
      for (const [id, raw] of offscreen) assert.deepEqual(f.store.records.get(id), raw, 'offscreen whole history freezes');
      const snap = f.model.snapshot();
      windowActivity.push({ point: windows[index], observedSec: 4, actualCpuWallTimeMs: performance.now() - started,
        activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.seascapeRegistryStats().size,
        newAnimalRecordCount: before.size, successfulBites: intakes.length, actualIntakes: intakes,
        combinedFoodLedger: clone(snap.combinedFoodLedger), combinedFoodStock: snap.combinedFoodStock,
        combinedFoodBalanceError: snap.combinedFoodBalanceError,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, totalAnimalRecordCount: allAnimals(row).length,
          clockSec: row.sim.timeSec, ticks: row.sim._ticks, originalFoodStock: clone(row.sim.resources), originalFoodLedger: clone(row.sim.ledger),
          hardLife: clone(row.deepHardLife), newConditionLedger: clone(row.deepHardEnergyLedger), balanceErrors: balances(row),
          agents: newAnimals(row).map(a => { assert.deepEqual(a.position, before.get(a.id).position); return {
            id: a.id, speciesId: a.speciesId, alive: a.alive, state: a.state, timeSec: a.timeSec,
            energy: a.energy, position: clone(a.position), fixedRootDisplacementM: distance(a.position, before.get(a.id).position),
            lastFeedAt: a.lastFeedAt, lastHardLifeIntake: clone(a.lastHardLifeIntake) }; }) })) });
      if (index === 0) firstFinal = stored(f.store);
    }
    return { initial, firstFinal, secondInitial, union: [...union], owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary deep windows admit whole fixed hard-host animals and real external parcels with independent and complete combined ledgers', async () => {
  const actual = await sample(); assert.deepEqual(new Set(actual.union), new Set(DEEP_HARD_LIFE_IDS));
  const bites = actual.windowActivity.flatMap(w => w.actualIntakes);
  assert.deepEqual(new Set(bites.map(b => b.speciesId)), new Set(DEEP_HARD_LIFE_IDS));
  assert.ok(actual.owners.some(r => r.newAgents.length === 0), 'real complete empty category is retained');
  assert.ok(actual.owners.some(r => r.newAgents.length > 1), 'several distinct independent hard-host animals can form a sparse community');
  const repeat = fixture(); assert.equal(await repeat.model.update(opening), true); assert.deepEqual(stored(repeat.store), actual.initial);
  for (let i = 0; i < 40; i++) repeat.model.step(.1, environment);
  bounded(repeat); assert.equal(await repeat.model.checkpoint(), true); assert.deepEqual(stored(repeat.store), actual.firstFinal);
  const control = fixture(new MemoryStore(), false); assert.equal(await control.model.update(opening), true);
  for (const row of records(control.model)) {
    const birth = actual.initial.find(([, raw]) => raw.id === row.id)?.[1]; assert.ok(birth);
    assert.deepEqual(birth.state, row.state, 'native RNG, original animals, food and clocks at birth remain exact');
    for (const key of ['predatorAgents', 'predatorEnergyLedger', 'predatorCounters', 'predatorEvents']) assert.deepEqual(birth[key], row[key]);
  }
  // The two illumination schedules have identical new food/condition; neither
  // schedule can supply food when the actual external input is zero.
  const dark = fixture(fromRecords(actual.initial)), lit = fixture(fromRecords(actual.initial));
  assert.equal(await dark.model.update(opening), true); assert.equal(await lit.model.update(opening), true);
  dark.model.step(.2, { ...environment, foodSupply: 0, observerLight: 0, hour: 0 });
  lit.model.step(.2, { ...environment, foodSupply: 0, observerLight: 1, hour: 24 });
  for (const row of dark.model._active.values()) {
    const other = lit.model._active.get(row.id); assert.deepEqual(row.deepHardLife, other.deepHardLife);
    assert.deepEqual(newAnimals(row), newAnimals(other)); assert.deepEqual(row.deepHardEnergyLedger, other.deepHardEnergyLedger);
    assert.equal(row.deepHardLife.foodLedger.input, 0); assert.equal(row.deepHardLife.foodLedger.ingested, 0);
  }
  if (process.env.DEEP_HARD_LIFE_RECEIPT) {
    const { initial, firstFinal, secondInitial, ...evidence } = actual;
    const observedOwners = actual.windowActivity.flatMap(w => w.owners), errors = observedOwners.map(r => r.balanceErrors);
    const summary = { productionWindows: 2, observedSecPerWindow: 4,
      actualNewIndividuals: actual.owners.reduce((sum, r) => sum + r.newAgents.length, 0),
      fedIndividuals: new Set(bites.map(b => b.agentId)).size, successfulBites: bites.length,
      intakeUnits: bites.reduce((sum, b) => sum + b.removedUnits, 0),
      externalInputUnits: observedOwners.reduce((sum, r) => sum + r.hardLife.foodLedger.input, 0),
      exportedUnits: observedOwners.reduce((sum, r) => sum + r.hardLife.foodLedger.exported, 0),
      maxAllAnimalRecordsPerOwner: Math.max(...observedOwners.map(r => r.totalAnimalRecordCount)),
      maxFoodBalanceError: Math.max(...errors.flatMap(e => [e.food, e.newFood, ...Object.values(e.byPool)]).map(Math.abs)),
      maxCombinedFoodBalanceError: Math.max(...actual.windowActivity.map(w => Math.abs(w.combinedFoodBalanceError))),
      maxConditionBalanceError: Math.max(...errors.flatMap(e => [e.native, e.predator, e.oldBottom, e.newCondition]).map(Math.abs)) };
    await writeFile(process.env.DEEP_HARD_LIFE_RECEIPT, `${JSON.stringify({
      scope: 'CPU ordinary native hard-host admission, independent animals, actual external particles/intake, original and combined ledgers, persistent history; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalLimit: 4,
      summary, entry: { ownerId: '156,8', x: 10019.58, z: 515.40, newIndividuals: 2, totalAnimalRecords: 14 },
      sourceSpecies: deepHardLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, identityLevel: s.identityLevel,
        sizeMeasure: s.sizeMeasure, depthSelectionM: s.depthSelectionM, selectedFoodPool: s.foodPool, sourceLinks: s.sourceLinks })),
      countsBySpecies: Object.fromEntries(DEEP_HARD_LIFE_IDS.map(id => [id, {
        bornIndividuals: actual.owners.flatMap(r => r.newAgents).filter(a => a.speciesId === id).length,
        fedIndividuals: new Set(bites.filter(b => b.speciesId === id).map(b => b.agentId)).size,
        actualIntakes: bites.filter(b => b.speciesId === id).length,
        consumedUnits: bites.filter(b => b.speciesId === id).reduce((sum, b) => sum + b.removedUnits, 0) }])), ...evidence }, null, 2)}\n`);
  }
});

test('new death clocks and actual complete empty categories survive unload, revisit and cold restore without animal or food refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.firstFinal)); assert.equal(await f.model.update(opening), true);
  const row = [...f.model._active.values()].find(r => newAnimals(r).some(a => a.alive)); assert.ok(row);
  const animal = newAnimals(row).find(a => a.alive), newIds = newAnimals(row).map(a => a.id);
  row.deepHardEnergyLedger.deathLoss += animal.energy; animal.energy = 0; animal.alive = false;
  animal.state = 'dead'; animal.stateSince = animal.timeSec; row.deepHardLife.counters.deaths++;
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'hard-host-death'], retained: 17 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [2, 9] } };
  bounded(f); assert.equal(await f.model.checkpoint(), true); const before = records(f.model), ids = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(ids.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id); assert.deepEqual(newAnimals(restored).map(a => a.id), newIds);
  const dead = clone(newAnimals(restored).find(a => a.id === animal.id)); cold.model.step(.1, environment);
  assert.deepEqual(newAnimals(restored).find(a => a.id === animal.id), dead); bounded(cold);
  assert.equal(cold.model.agents.find(a => a.id === animal.id).timeSec, dead.timeSec);
  assert.equal(cold.model.snapshot().agents.find(a => a.id === animal.id).timeSec, dead.timeSec);
  const empty = data.initial.find(([, r]) => ownerWindow(opening).has(r.id) && r.deepHardLifeAgents.length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.equal(await emptyCold.model.update(opening), true);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
});

test('enabling new hard life on old stored communities retains original raw and paused history and the next ordinary steps exactly', async () => {
  const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(opening), true); old.model.step(.4, environment);
  const row = [...old.model._active.values()][0]; row._savedRecord = { ...row._savedRecord, opaqueHistory: { beforeHardLife: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [11, 4] } };
  assert.equal(await old.model.checkpoint(), true); const disk = stored(old.store), enabled = fixture(fromRecords(disk)), disabled = fixture(fromRecords(disk), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), disk);
  assert.ok([...enabled.model._active.values()].every(r => r.deepHardLifeVersion === undefined));
  assert.equal(await enabled.model.update(opening), true); assert.deepEqual(stored(enabled.store), disk, 'paused revisits create no package markers');
  for (const dt of [.1, .2]) { enabled.model.step(dt, environment); disabled.model.step(dt, environment); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic hard-life births publish no actors, food or scenery revision before a complete commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, r]) => r.deepHardLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('new records were not offered atomically'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(offered.length, 9);
    for (const [, row] of offered) { assert.equal(row.state.timeSec, 0); assert.equal(row.deepHardLifeVersion, 1);
      assert.equal(row.deepHardLifeInitializedAtSec, 0); assert.equal(row.deepHardLife.foodLedger.initial, 0); assert.deepEqual(row.deepHardLife.parcels, []); }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.generator.seascapeRevision, 0);
    assert.equal(failed.records.size, 0); assert.equal(failed.batches.length, 0);
  }
});

test('undefined and thrown historical owner reads do not turn into strict-null fresh hard-life births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('deep historical owner unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false); assert.equal(f.model._active.size, 0);
    assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('finite partial markers, parcel and old-stock corruption and complete offscreen history reject without refill or publication', async () => {
  const data = await sample(), desired = ownerWindow(opening);
  for (const damage of ['descriptor', 'version', 'individual', 'parcel', 'old-stock', 'identity', 'reserved', 'old-bottom']) {
    const store = fromRecords(data.firstFinal), f = fixture(store), [, row] = [...store.records]
      .find(([, r]) => desired.has(r.id) && r.deepHardLifeAgents.length && r.deepHardLife.parcels.length && r.state.surfacePatches.length && r.deepBenthicAgents.length);
    if (damage === 'descriptor') delete row.deepHardLife;
    if (damage === 'version') delete row.deepHardLifeVersion;
    if (damage === 'individual') delete row.deepHardLifeAgents[0].deepHardIndividualVersion;
    if (damage === 'parcel') row.deepHardLife.parcels[0].amount += .1;
    if (damage === 'old-stock') row.state.surfacePatches[0].surfaceDetritus += .1;
    if (damage === 'identity') row.deepHardLifeAgents[0].speciesId = 'pom-pom-anemone';
    if (damage === 'reserved') { for (const key of Object.keys(row).filter(k => k.startsWith('deepHard'))) delete row[key]; row.deepHardReservedFuture = 1; }
    if (damage === 'old-bottom') delete row.deepBenthicLife;
    const before = stored(store); assert.equal(await f.model.update(opening), false, damage); assert.deepEqual(stored(store), before);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.length <= 24);
  }
  // Choose an actual frozen prefetched owner from the same committed native
  // history; it remains outside the desired nine public owners.
  const historical = fixture(); assert.equal(await historical.model.update(at(154, 6)), true);
  const halo = stored(historical.store).find(([, r]) => r.id === '155,6' && r.state.agents.length && r.state.surfacePatches.length && r.deepHardLifeVersion === 1);
  assert.ok(halo && !desired.has(halo[1].id));
  for (const damage of ['top-prefix', 'individual-prefix', 'old-stock', 'new-ledger', 'roster', 'old-category']) {
    const store = fromRecords(data.initial); store.records.set(halo[0], clone(halo[1]));
    const row = store.records.get(halo[0]), f = fixture(store);
    if (damage === 'top-prefix') row.deepHardReservedFuture = 1;
    if (damage === 'individual-prefix') row.state.agents[0].deepHardReservedFuture = 1;
    if (damage === 'old-stock') row.state.surfacePatches[0].surfaceDetritus += .1;
    if (damage === 'new-ledger') row.deepHardLife.foodLedger.input += .1;
    if (damage === 'roster') row.deepHardLife.addedIds.push('missing-new-individual');
    if (damage === 'old-category') delete row.predatorEnergyLedger;
    const before = stored(store); assert.equal(await f.model.update(opening), false, `offscreen ${damage}`);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.includes(halo[1].id)); assert.ok(store.reads.length <= 24);
  }
});
