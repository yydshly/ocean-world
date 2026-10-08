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
import { validateDeepWaterLifeRecord, deepWaterLifeFoodBudgetError, deepWaterLifeEnergyBudgetError } from '../src/deepWaterLife.js';
import { DEEP_MIDWATER_LIFE_IDS, DEEP_MIDWATER_LIFE_FOOD_POOLS, DEEP_MIDWATER_LIFE_MODEL,
  deepMidwaterLifePositionValid, deepMidwaterLifeBodyPoints, deepMidwaterLifeFeedingPosition,
  deepMidwaterLifeSnapshot, validateDeepMidwaterLifeRecord, deepMidwaterLifeFoodBudgetError,
  deepMidwaterLifeEnergyBudgetError } from '../src/deepMidwaterLife.js';
import { deepMidwaterLifeSpeciesCatalog, deepMidwaterLifeSpeciesById } from '../src/deepMidwaterLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Two agreed ordinary windows, including their six overlapping owners. No
// supplied hosts, forced populations, overridden RNG or added food inventory.
const windows = [at(192, 8), at(193, 8)], opening = windows[0], far = at(-38, 25);
const observationSec = 12, environment = { foodSupply: 1, currentMps: .18, hour: 12, observerLight: .35 };
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.deepMidwaterLifeAgents ?? [];
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? [], row.deepBenthicAgents ?? [],
  row.deepHardLifeAgents ?? [], row.deepWaterLifeAgents ?? [], newAnimals(row));
const newFields = ['deepMidwaterLifeVersion', 'deepMidwaterLifeInitializedAtSec', 'deepMidwaterLife',
  'deepMidwaterLifeAgents', 'deepMidwaterEnergyLedger'];
const withoutNew = raw => Object.fromEntries(Object.entries(clone(raw)).filter(([key]) => !newFields.includes(key)));
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('midwater atomic commit rejected');
    const offered = clone(entries); if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records); for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), midwaterLife = true) {
  const generator = createDeepOceanGenerator(seed, { seascape: true, wholeSeascape: true });
  const model = new DeepOceanEcology(seed, generator, { store, seascape: true, wholeSeascape: true,
    benthicLife: true, hardLife: true, waterLife: true, midwaterLife });
  return { generator, model, store };
}
function balances(row) {
  const byPool = Object.fromEntries([['surfaceDetritus', row.sim.surfacePatches], ['benthicAnimalFood', row.sim.benthicPatches],
    ['suspendedPrey', row.sim.suspendedPatches]].map(([pool, patches]) => {
    const l = row.sim.ledger.byPool[pool], stock = patches.reduce((sum, p) => sum + p[pool], 0);
    return [pool, stock - (l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported)];
  }));
  return { byPool, nativeFood: row.sim.metrics.resourceBudgetError, nativeCondition: row.sim.metrics.energyBudgetError,
    predatorCondition: predatorEnergyBudgetError(row), benthicCondition: deepBenthicLifeEnergyBudgetError(row),
    hardFood: deepHardLifeFoodBudgetError(row), hardCondition: deepHardLifeEnergyBudgetError(row),
    nearBottomFood: deepWaterLifeFoodBudgetError(row), nearBottomCondition: deepWaterLifeEnergyBudgetError(row),
    midwaterFood: deepMidwaterLifeFoodBudgetError(row), midwaterCondition: deepMidwaterLifeEnergyBudgetError(row) };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.seascapeRegistryStats().size <= 25);
  const snapshot = f.model.snapshot(); close(snapshot.combinedFoodBalanceError, 'complete combined food control volume');
  close(snapshot.combinedFoodStock - Object.values(snapshot.resources).reduce((sum, n) => sum + n, 0), 'complete public typed stocks');
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, `${row.id} old plus new animal record budget`);
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
    const errors = balances(row);
    for (const [pool, error] of Object.entries(errors.byPool)) close(error, `${row.id} original ${pool}`);
    for (const [key, error] of Object.entries(errors).filter(([key]) => key !== 'byPool')) close(error, `${row.id} ${key}`);
    const raw = f.model._record(row);
    for (const [label, validate] of [['benthic', validateDeepBenthicLifeRecord], ['hard', validateDeepHardLifeRecord],
      ['near-bottom', validateDeepWaterLifeRecord], ['midwater', validateDeepMidwaterLifeRecord]])
      assert.ok(validate(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} complete ${label} saved history`);
    for (const pool of DEEP_MIDWATER_LIFE_FOOD_POOLS) assert.equal(Object.hasOwn(row.sim.resources, pool), false, 'new water stock is separate from original pools');
    if (row.deepMidwaterLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); continue; }
    const d = row.deepMidwaterLife, publicRow = snapshot.regions.find(r => r.id === row.id);
    assert.equal(row.deepMidwaterLifeVersion, 1); assert.ok(newAnimals(row).length <= DEEP_MIDWATER_LIFE_MODEL.maximumAdded);
    assert.equal(d.counters.ticks, row.sim._ticks); assert.equal(d.lastTickSec, row.sim._ticks * .1);
    assert.equal(d.foodLedger.initial, 0); assert.ok(d.channels.length <= DEEP_MIDWATER_LIFE_MODEL.maximumChannels);
    assert.ok(d.channels.flatMap(c => c.parcels).length <= DEEP_MIDWATER_LIFE_MODEL.maximumParcels);
    assert.deepEqual(publicRow.midwaterLife, deepMidwaterLifeSnapshot(row));
    close(publicRow.combinedFoodBalanceError, `${row.id} combined food ledger`);
    for (const key of ['initial', 'input', 'ingested', 'exported']) assert.equal(publicRow.combinedFoodLedger[key],
      row.sim.ledger[key] + (row.deepHardLife?.foodLedger?.[key] ?? 0) + d.foodLedger[key]);
    for (const pool of DEEP_MIDWATER_LIFE_FOOD_POOLS) assert.equal(d.foodLedger.byPool[pool].initial, 0);
    for (const c of d.channels) assert.ok(c.parcels.length <= DEEP_MIDWATER_LIFE_MODEL.maximumParcelsPerChannel);
    for (const a of newAnimals(row)) {
      const s = deepMidwaterLifeSpeciesById[a.speciesId]; assert.ok(s);
      assert.equal(a.nutritionPool, s.foodPool); assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
      assert.ok(deepMidwaterLifePositionValid(f.generator, row, a), `${row.id}/${a.id} whole midwater anatomy`);
      assert.ok(Math.abs(a.pitch) <= .12); if (s.kind === 'jellyfish') assert.equal(a.pitch, 0);
      const points = deepMidwaterLifeBodyPoints(a); assert.equal(points.length, 27);
      for (const p of points) {
        const depth = f.generator.surfaceY - p.y;
        assert.ok(depth >= s.depthSelectionM[0] && depth <= s.depthSelectionM[1], 'full tentacles/filaments remain in actual source depth');
        assert.ok(p.y >= f.generator.heightAt(p.x, p.z) + DEEP_MIDWATER_LIFE_MODEL.wholeBodyClearanceM);
      }
      assert.ok(a.position.y - f.generator.heightAt(a.position.x, a.position.z) > 2000, 'actual off-bottom water, not a renamed near-bed swimmer');
      if (a.alive) assert.equal(a.timeSec, row.sim._ticks * .1);
    }
  }
}

// Passive observation of the actual transported amount and both real
// ingestion/condition writes. It never adds a parcel or alters food input.
function observeIntakes(row, traces) {
  const d = row.deepMidwaterLife, latest = new Map(), watched = new WeakSet(), cleanup = [];
  let ingestion, gain; const typed = new Map();
  for (const [object, key, observe] of [[d.foodLedger, 'ingested', value => { ingestion = value; }],
    ...DEEP_MIDWATER_LIFE_FOOD_POOLS.map(pool => [d.foodLedger.byPool[pool], 'ingested', value => { typed.set(pool, value); }]),
    [row.deepMidwaterEnergyLedger, 'feedingGain', value => { gain = value; }]]) {
    let value = object[key]; Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value,
      set: next => { observe({ before: value, after: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value }));
  }
  function watchParcels() {
    for (const p of d.channels.flatMap(c => c.parcels)) {
      if (watched.has(p)) continue; watched.add(p); let value = p.amount;
      Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, get: () => value,
        set: next => { latest.set(p.id, { parcel: p, stockBefore: value, stockAfter: next }); value = next; } });
      cleanup.push(() => Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, writable: true, value }));
    }
  }
  for (const a of newAnimals(row)) {
    let value = a.lastMidwaterIntake;
    Object.defineProperty(a, 'lastMidwaterIntake', { configurable: true, enumerable: true, get: () => value,
      set: next => {
        value = next; if (!next) return;
        const c = d.channels.find(c => c.id === next.channelId), debit = latest.get(next.parcelId), typedIngestion = typed.get(next.pool);
        assert.ok(c && debit && ingestion && typedIngestion && gain, 'real parcel debit and both ingestion ledgers wrote');
        assert.equal(c.agentId, a.id); assert.equal(next.ownerId, row.id); assert.equal(next.pool, deepMidwaterLifeSpeciesById[a.speciesId].foodPool);
        assert.equal(d.foodLedger.initial, 0); assert.ok(d.foodLedger.input > 0); assert.ok(debit.stockBefore > 0);
        assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual midwater parcel debit');
        close(ingestion.after - ingestion.before - next.removedUnits, 'actual owner ingestion write');
        close(typedIngestion.after - typedIngestion.before - next.removedUnits, 'actual selected pool ingestion write');
        close(gain.after - gain.before - next.removedUnits * DEEP_MIDWATER_LIFE_MODEL.energyGainPerUnit, 'actual relative condition gain');
        assert.equal(a.energy, next.energyAfter); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(next.timeSec, row.sim._ticks * .1); assert.equal(a.timeSec, next.timeSec);
        assert.deepEqual(next.agentPosition, a.position); assert.equal(next.agentHeading, a.heading); assert.equal(next.agentPitch, a.pitch);
        assert.deepEqual(next.feedingPosition, deepMidwaterLifeFeedingPosition(a)); assert.deepEqual(next.foodPosition, debit.parcel.position);
        assert.deepEqual(next.sourcePosition, c.sourcePosition); assert.deepEqual(c.sourcePosition, a.sourcePosition);
        assert.equal(next.foodPosition.y, next.sourcePosition.y); assert.equal(next.foodPosition.z, next.sourcePosition.z);
        close(next.foodPosition.x - next.sourcePosition.x - next.parcelTravelM, 'actual positive-X constant-Y transport');
        assert.ok(next.parcelTravelM > 0); assert.ok(next.timeSec > next.parcelCreatedAtSec);
        close(distance(next.feedingPosition, next.foodPosition) - next.contactDistanceM, 'actual full-form capture-organ contact');
        assert.ok(next.contactDistanceM <= DEEP_MIDWATER_LIFE_MODEL.captureDistanceM);
        close(deepMidwaterLifeFoodBudgetError(row), 'independent food ledger closes at actual ingestion');
        traces.push({ agentId: a.id, speciesId: a.speciesId, ...clone(next), actualOwnerIngestion: clone(ingestion),
          actualTypedIngestion: clone(typedIngestion), actualConditionGain: clone(gain), individualClockSec: a.timeSec });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastMidwaterIntake', { configurable: true, enumerable: true, writable: true, value }));
  }
  return { watchParcels, stop: () => cleanup.forEach(done => done()) };
}

let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), control = fixture(new MemoryStore(), false), initial = new Map(), owners = [], windowActivity = [], union = new Set();
    let firstInitial, firstFinal;
    for (const [index, position] of windows.entries()) {
      f.store.reads.length = 0; assert.equal(await f.model.update(position), true, f.model._storageError);
      assert.equal(await control.model.update(position), true, control.model._storageError); bounded(f); bounded(control);
      assert.ok(f.store.reads.length <= 24); if (index === 0) firstInitial = stored(f.store);
      const before = new Map(), traces = [], observers = [], offscreen = [...f.store.records]
        .filter(([, raw]) => !f.model._active.has(raw.id)).map(([key, raw]) => [key, clone(raw)]);
      for (const row of f.model._active.values()) {
        const raw = f.model._record(row), original = control.model._record(control.model._active.get(row.id)), key = `${f.model._world}|${row.id}`;
        assert.deepEqual(withoutNew(raw), original, `${row.id} original actors/RNG/clocks/stocks/ledgers preserved`);
        const freshObservation = !owners.some(owner => owner.id === row.id);
        if (freshObservation) {
          assert.equal(row.sim.timeSec, 0); assert.deepEqual(withoutNew(f.store.records.get(key)), control.store.records.get(key), 'old committed birth remains exact');
          assert.equal(row.deepMidwaterLife.foodLedger.initial, 0); assert.equal(row.deepMidwaterLife.foodLedger.input, 0);
          assert.ok(row.deepMidwaterLife.channels.every(c => c.parcels.length === 0));
          owners.push({ id: row.id, role: row.deepMidwaterLife.role, oldAnimalRecords: allAnimals(row).length - newAnimals(row).length,
            totalAnimalRecords: allAnimals(row).length, originalStateAtBirth: clone(raw.state),
            initialFoodLedger: clone(row.deepMidwaterLife.foodLedger), initialConditionLedger: clone(row.deepMidwaterEnergyLedger),
            channelsAtBirth: clone(row.deepMidwaterLife.channels), newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId,
              sizeM: a.sizeM, sizeMeasure: deepMidwaterLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
              heading: a.heading, pitch: a.pitch, rootDepthM: f.generator.surfaceY - a.position.y, timeSec: a.timeSec,
              capturePosition: deepMidwaterLifeFeedingPosition(a), sourcePosition: clone(a.sourcePosition), energy: a.energy, pool: a.nutritionPool })) });
        }
        for (const a of newAnimals(row)) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        assert.equal(row.deepMidwaterLifeVersion, 1); observers.push(observeIntakes(row, traces));
      }
      for (const [key, raw] of f.store.records) if (!initial.has(key) && raw.state.timeSec === 0) initial.set(key, clone(raw));
      const started = performance.now();
      try { for (let tick = 0; tick < observationSec * 10; tick++) {
        observers.forEach(o => o.watchParcels()); f.model.step(.1, environment); control.model.step(.1, environment);
      } } finally { observers.forEach(o => o.stop()); }
      bounded(f); bounded(control);
      for (const row of f.model._active.values()) assert.deepEqual(withoutNew(f.model._record(row)),
        control.model._record(control.model._active.get(row.id)), `${row.id} independent midwater activity leaves complete old state exact`);
      assert.equal(await f.model.checkpoint(), true, f.model._storageError);
      for (const [key, raw] of offscreen) assert.deepEqual(f.store.records.get(key), raw, 'offscreen old and new clocks, animals and food freeze');
      const snapshot = f.model.snapshot();
      windowActivity.push({ position, observedSec: observationSec, actualCpuWallTimeMs: performance.now() - started,
        activeOwners: f.model._active.size, sourceOwners: f.generator.seascapeRegistryStats().size, actualIntakes: traces,
        combinedFoodLedger: clone(snapshot.combinedFoodLedger), combinedFoodStock: snapshot.combinedFoodStock,
        combinedFoodBalanceError: snapshot.combinedFoodBalanceError,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, role: row.deepMidwaterLife.role,
          totalAnimalRecords: allAnimals(row).length, clockSec: row.sim.timeSec, ticks: row.sim._ticks,
          lastMidwaterTickSec: row.deepMidwaterLife.lastTickSec, channels: clone(row.deepMidwaterLife.channels),
          foodLedger: clone(row.deepMidwaterLife.foodLedger), conditionLedger: clone(row.deepMidwaterEnergyLedger),
          counters: clone(row.deepMidwaterLife.counters), balanceErrors: balances(row),
          originalFoodStock: clone(row.sim.resources), originalFoodLedger: clone(row.sim.ledger),
          oldStateMatchesControl: true, combinedFoodBalanceError: snapshot.regions.find(r => r.id === row.id).combinedFoodBalanceError,
          agents: newAnimals(row).map(a => {
            const displacementM = distance(a.position, before.get(a.id).position);
            assert.ok(displacementM <= DEEP_MIDWATER_LIFE_MODEL.traits[a.speciesId].speedMps * observationSec + 1e-8);
            assert.deepEqual(a.sourcePosition, before.get(a.id).sourcePosition, 'food source remains fixed while animal swims');
            return { id: a.id, speciesId: a.speciesId, alive: a.alive, state: a.state, position: clone(a.position), heading: a.heading,
              pitch: a.pitch, timeSec: a.timeSec, energy: a.energy, displacementM, travelledM: a.travelledM,
              feedingCount: a.feedingCount, consumedUnits: a.consumedUnits, lastFeedAt: a.lastFeedAt,
              sourcePosition: clone(a.sourcePosition), capturePosition: deepMidwaterLifeFeedingPosition(a), lastMidwaterIntake: clone(a.lastMidwaterIntake) };
          }) })) });
      if (index === 0) firstFinal = stored(f.store);
    }
    return { initial: clone([...initial]), firstInitial, firstFinal, union: [...union], owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary all-feature windows contain whole off-bottom forms, real movement and independent typed food contacts without changing old life', async () => {
  const data = await sample(); assert.equal(data.owners.length, 12); assert.deepEqual(new Set(data.union), new Set(DEEP_MIDWATER_LIFE_IDS));
  const final = [...new Map(data.windowActivity.flatMap(w => w.owners).map(r => [r.id, r])).values()],
    agents = final.flatMap(r => r.agents), intakes = data.windowActivity.flatMap(w => w.actualIntakes);
  assert.deepEqual(new Set(agents.filter(a => a.travelledM > 1e-8).map(a => a.speciesId)), new Set(DEEP_MIDWATER_LIFE_IDS));
  assert.ok(intakes.length > 0, 'ordinary native capture happens; classes/individuals with zero food remain honest');
  assert.ok(data.owners.some(r => r.newAgents.length === 0), 'a natural complete empty category remains stored');
  const dark = fixture(fromRecords(data.firstInitial)), lit = fixture(fromRecords(data.firstInitial));
  assert.equal(await dark.model.update(opening), true); assert.equal(await lit.model.update(opening), true);
  dark.model.step(.2, { ...environment, foodSupply: 0, observerLight: 0, hour: 0 });
  lit.model.step(.2, { ...environment, foodSupply: 0, observerLight: 1, hour: 24 });
  for (const row of dark.model._active.values()) {
    const other = lit.model._active.get(row.id); assert.deepEqual(row.deepMidwaterLife, other.deepMidwaterLife);
    const physiological = animals => animals.map(({ localEnvironment, ...state }) => state);
    assert.deepEqual(physiological(newAnimals(row)), physiological(newAnimals(other)));
    assert.deepEqual(row.deepMidwaterEnergyLedger, other.deepMidwaterEnergyLedger);
    for (const a of newAnimals(row)) assert.equal(a.localEnvironment.observerLight, 0);
    for (const a of newAnimals(other)) assert.equal(a.localEnvironment.observerLight, 1);
    assert.equal(row.deepMidwaterLife.foodLedger.input, 0); assert.equal(row.deepMidwaterLife.foodLedger.ingested, 0);
  }
  if (process.env.DEEP_MIDWATER_LIFE_RECEIPT) {
    const { initial, firstInitial, firstFinal, ...evidence } = data, errors = final.map(r => r.balanceErrors), entry = data.owners.find(r => r.id === '192,8');
    const summary = { productionWindows: 2, observedSecPerWindow: 12, uniqueObservedOwners: data.owners.length,
      actualNewIndividuals: data.owners.reduce((sum, r) => sum + r.newAgents.length, 0), movedIndividuals: agents.filter(a => a.travelledM > 1e-8).length,
      fedIndividuals: new Set(intakes.map(a => a.agentId)).size, successfulBites: intakes.length,
      intakeUnits: intakes.reduce((sum, a) => sum + a.removedUnits, 0), initialFoodUnits: 0,
      externalInputUnits: final.reduce((sum, r) => sum + r.foodLedger.input, 0), exportedUnits: final.reduce((sum, r) => sum + r.foodLedger.exported, 0),
      maxAllAnimalRecordsPerOwner: Math.max(...final.map(r => r.totalAnimalRecords)),
      maxFoodBalanceError: Math.max(...errors.flatMap(e => [e.nativeFood, e.hardFood, e.nearBottomFood, e.midwaterFood, ...Object.values(e.byPool)]).map(Math.abs)),
      maxCombinedFoodBalanceError: Math.max(...data.windowActivity.map(w => Math.abs(w.combinedFoodBalanceError))),
      maxConditionBalanceError: Math.max(...errors.flatMap(e => [e.nativeCondition, e.predatorCondition, e.benthicCondition,
        e.hardCondition, e.nearBottomCondition, e.midwaterCondition]).map(Math.abs)), originalHistoryPreservedExactly: true };
    await writeFile(process.env.DEEP_MIDWATER_LIFE_RECEIPT, `${JSON.stringify({
      scope: 'CPU ordinary actual-depth midwater bodies, native movement and fixed capture-organ contacts with independent zero-initial typed food/condition ledger; old raw/RNG/clocks/food exact. No browser/GPU/visual acceptance.',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, allAnimalRecordLimit: 20, newAnimalLimit: 3, summary,
      entry: { ownerId: '192,8', x: 12320, z: 544, observationDepthM: 700, newIndividuals: entry.newAgents.length, totalAnimalRecords: entry.totalAnimalRecords },
      sourceSpecies: deepMidwaterLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, sizeMeasure: s.sizeMeasure,
        sizeRangeM: s.sizeRangeM, depthSelectionM: s.depthSelectionM, foodPool: s.foodPool, feedingEvidenceLevel: s.feedingEvidenceLevel, sourceLinks: s.sourceLinks })),
      countsBySpecies: Object.fromEntries(DEEP_MIDWATER_LIFE_IDS.map(id => [id, {
        bornIndividuals: data.owners.flatMap(r => r.newAgents).filter(a => a.speciesId === id).length,
        movedIndividuals: agents.filter(a => a.speciesId === id && a.travelledM > 1e-8).length,
        fedIndividuals: new Set(intakes.filter(a => a.speciesId === id).map(a => a.agentId)).size,
        actualIntakes: intakes.filter(a => a.speciesId === id).length,
        consumedUnits: intakes.filter(a => a.speciesId === id).reduce((sum, a) => sum + a.removedUnits, 0) }])), ...evidence }, null, 2)}\n`);
  }
});

test('midwater death and natural empty histories unload and cold restore with fixed food sources and no replacement', async () => {
  const data = await sample(), f = fixture(fromRecords(data.firstFinal)); assert.equal(await f.model.update(opening), true);
  const row = [...f.model._active.values()].find(r => newAnimals(r).some(a => a.alive)); assert.ok(row);
  const a = newAnimals(row).find(a => a.alive), ids = newAnimals(row).map(a => a.id);
  row.deepMidwaterEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead';
  a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 }; row.deepMidwaterLife.counters.deaths++;
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'midwater-death'], retained: 31 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [8, 13] } };
  bounded(f); assert.equal(await f.model.checkpoint(), true); const before = records(f.model), activeIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(activeIds.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id); assert.deepEqual(newAnimals(restored).map(a => a.id), ids);
  const dead = clone(newAnimals(restored).find(x => x.id === a.id)); cold.model.step(.1, environment);
  assert.deepEqual(newAnimals(restored).find(x => x.id === a.id), dead); bounded(cold);
  assert.equal(cold.model.agents.find(x => x.id === a.id).timeSec, dead.timeSec);
  assert.equal(cold.model.snapshot().agents.find(x => x.id === a.id).timeSec, dead.timeSec);
  const empty = data.firstInitial.find(([, raw]) => ownerWindow(opening).has(raw.id) && raw.deepMidwaterLifeAgents.length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.firstInitial)); assert.equal(await emptyCold.model.update(opening), true);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
});

test('enabling midwater on old paused records leaves all raw history and subsequent native steps exactly unchanged', async () => {
  const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(opening), true); old.model.step(.4, environment);
  const row = [...old.model._active.values()][0]; row._savedRecord = { ...row._savedRecord, opaqueHistory: { beforeMidwater: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [13, 17] } };
  assert.equal(await old.model.checkpoint(), true); const disk = stored(old.store), enabled = fixture(fromRecords(disk)), disabled = fixture(fromRecords(disk), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), disk);
  assert.ok([...enabled.model._active.values()].every(r => r.deepMidwaterLifeVersion === undefined));
  assert.equal(await enabled.model.update(opening), true); assert.deepEqual(stored(enabled.store), disk);
  for (const dt of [.1, .2]) { enabled.model.step(dt, environment); disabled.model.step(dt, environment); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic midwater births expose no animals, food stock or scenery revision', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, r]) => r.deepMidwaterLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('new histories were not offered atomically'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.ok(offered.length >= 9 && offered.length <= 24);
    for (const [, row] of offered) {
      assert.equal(row.state.timeSec, 0); assert.equal(row.deepMidwaterLifeVersion, 1); assert.equal(row.deepMidwaterLifeInitializedAtSec, 0);
      assert.equal(row.deepMidwaterLife.foodLedger.initial, 0); assert.equal(row.deepMidwaterLife.foodLedger.input, 0);
      assert.ok(row.deepMidwaterLife.channels.every(c => c.parcels.length === 0)); assert.equal(row.deepMidwaterEnergyLedger.feedingGain, 0);
    }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.generator.seascapeRevision, 0);
    assert.equal(failed.records.size, 0); assert.equal(failed.batches.length, 0);
  }
});

test('undefined and thrown owner reads never become strict-null fresh water-column births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('midwater historical read unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false); assert.equal(f.model._active.size, 0);
    assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('finite incomplete rosters, whole-body/typed-stock corruption and actually read offscreen history fail without refill or publication', async () => {
  const data = await sample(), desired = ownerWindow(opening);
  const active = data.firstFinal.find(([, r]) => desired.has(r.id) && r.deepMidwaterLifeAgents.length &&
    r.deepMidwaterLife.channels.some(c => c.parcels.length) && r.state.surfacePatches.length && r.deepBenthicLifeVersion === 1);
  assert.ok(active, 'actual ordinary active saved community for finite corruption cases');
  for (const damage of ['descriptor', 'version', 'individual', 'whole-body', 'parcel', 'identity', 'reserved', 'erased-roster', 'old-stock']) {
    const store = fromRecords(data.firstFinal), row = store.records.get(active[0]), f = fixture(store);
    if (damage === 'descriptor') delete row.deepMidwaterLife;
    if (damage === 'version') delete row.deepMidwaterLifeVersion;
    if (damage === 'individual') delete row.deepMidwaterLifeAgents[0].deepMidwaterIndividualVersion;
    if (damage === 'whole-body') row.deepMidwaterLifeAgents[0].position.y = 3500 - 650;
    if (damage === 'parcel') row.deepMidwaterLife.channels.find(c => c.parcels.length).parcels[0].amount += .1;
    if (damage === 'identity') row.deepMidwaterLifeAgents[0].speciesId = 'pom-pom-anemone';
    if (damage === 'reserved') { for (const key of Object.keys(row).filter(k => k.startsWith('deepMidwater'))) delete row[key]; row.deepMidwaterReservedFuture = 1; }
    if (damage === 'erased-roster') {
      row.deepMidwaterLifeAgents = []; row.deepMidwaterLife.addedIds = []; row.deepMidwaterLife.birthPlacements = []; row.deepMidwaterLife.channels = [];
      row.deepMidwaterLife.nextParcelId = 0; row.deepMidwaterLife.events = [];
      row.deepMidwaterLife.foodLedger = { initial: 0, input: 0, ingested: 0, exported: 0,
        byPool: Object.fromEntries(DEEP_MIDWATER_LIFE_FOOD_POOLS.map(pool => [pool, { initial: 0, input: 0, ingested: 0, exported: 0 }])) };
      row.deepMidwaterLife.counters = { ticks: row.state._ticks, inputPulses: 0, feedings: 0, consumedUnits: 0, deaths: 0 };
      row.deepMidwaterEnergyLedger = { initial: 0, feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 };
    }
    if (damage === 'old-stock') row.state.surfacePatches[0].surfaceDetritus += .1;
    const before = stored(store); assert.equal(await f.model.update(opening), false, damage); assert.deepEqual(stored(store), before);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.length <= 24);
  }
  // The ordinary windows commit only their nine public owners here. This one
  // zero-tick cold/history probe reads existing 193,* records in the aligned
  // halo while they remain outside desired 190..192. It is a failure-path
  // fixture, not a third observed ecological window or receipt sample.
  const historyProbe = at(191, 8), probeDesired = ownerWindow(historyProbe);
  const probe = fixture(fromRecords(data.firstInitial)); assert.equal(await probe.model.update(historyProbe), true);
  const halo = data.firstInitial.find(([, row]) => !probeDesired.has(row.id) && probe.store.reads.includes(row.id) &&
    row.deepMidwaterLifeVersion === 1 && row.state.agents.length && row.state.surfacePatches.length);
  assert.ok(halo, 'finite offscreen owner is genuinely read by this ordinary window');
  for (const damage of ['top-prefix', 'state-prefix', 'old-agent-prefix', 'new-ledger', 'roster', 'old-category']) {
    const store = fromRecords(data.firstInitial), row = store.records.get(halo[0]), f = fixture(store);
    if (damage === 'top-prefix') row.deepMidwaterReservedFuture = 1;
    if (damage === 'state-prefix') row.state.deepMidwaterReservedFuture = 1;
    if (damage === 'old-agent-prefix') row.state.agents[0].deepMidwaterReservedFuture = 1;
    if (damage === 'new-ledger') row.deepMidwaterLife.foodLedger.input += .1;
    if (damage === 'roster') row.deepMidwaterLife.addedIds.push('missing-midwater-individual');
    if (damage === 'old-category') delete row.deepBenthicLife;
    const before = stored(store); assert.equal(await f.model.update(historyProbe), false, `actually read offscreen ${damage}`);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.includes(halo[1].id)); assert.ok(store.reads.length <= 24);
  }
});
