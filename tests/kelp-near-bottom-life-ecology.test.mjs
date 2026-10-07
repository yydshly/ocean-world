import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';
import { validateKelpBenthicLifeRecord } from '../src/kelpBenthicLife.js';
import { validateKelpWaterLifeRecord } from '../src/kelpWaterLife.js';
import { KELP_NEAR_BOTTOM_LIFE_IDS, KELP_NEAR_BOTTOM_LIFE_MODEL,
  kelpNearBottomLifePositionValid, kelpNearBottomLifeFeedingPosition,
  kelpNearBottomLifeFoodBudgetError, kelpNearBottomLifeEnergyBudgetError,
  validateKelpNearBottomLifeRecord } from '../src/kelpNearBottomLife.js';
import { kelpNearBottomLifeSpeciesCatalog, kelpNearBottomLifeSpeciesById } from '../src/kelpNearBottomLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Actual ordinary production windows, without authored supports, extra food,
// RNG overrides or injected animal placements. Every old controller is enabled.
const windows = [at(53, -4), at(54, -4)], opening = windows[0], far = at(-38, 25);
const observationSec = 12, clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.kelpNearBottomLifeAgents ?? [];
const allAnimals = row => row.sim.agents.filter(a => a.speciesId !== 'giant-kelp').concat(
  row.waterAgents, row.visitorAgents, row.kelpBenthicAgents ?? [], row.kelpWaterLifeAgents ?? [], newAnimals(row));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const newFields = ['kelpNearBottomLifeVersion', 'kelpNearBottomLifeInitializedAtSec', 'kelpNearBottomLife',
  'kelpNearBottomLifeAgents', 'kelpNearBottomEnergyLedger'];
const withoutNew = raw => Object.fromEntries(Object.entries(clone(raw)).filter(([key]) => !newFields.includes(key)));
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { return this.saveMany(world, [[id, record]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('near-bottom atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), nearBottomLife = true) {
  const generator = createKelpOceanGenerator(seed, { forestBelt: true, kelpSeascape: true });
  const model = new KelpOceanEcology(seed, generator, { store, visitors: true, understory: true,
    forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife: true, nearBottomLife });
  return { generator, model, store };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.forestBeltRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, `${row.id} complete record budget`);
    close(row.sim.metrics.resourceBudgetError, `${row.id} old food ledger`);
    close(kelpDriftBalanceError(row), `${row.id} original shed-food ledger`);
    close(kelpNearBottomLifeFoodBudgetError(row), `${row.id} bed-food ledger`);
    close(kelpNearBottomLifeEnergyBudgetError(row), `${row.id} condition ledger`);
    const raw = f.model._record(row);
    assert.ok(validateKelpBenthicLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} old benthic history`);
    assert.ok(validateKelpWaterLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} old water history`);
    assert.ok(validateKelpNearBottomLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} complete new history`);
    assert.equal(Object.hasOwn(row.sim.resources, 'benthicAnimalFood'), false, 'new food is not an old pool alias');
    if (row.kelpNearBottomLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); continue; }
    const d = row.kelpNearBottomLife;
    assert.equal(row.kelpNearBottomLifeVersion, 1); assert.ok(newAnimals(row).length <= 4);
    assert.equal(d.counters.ticks, row.sim._ticks); assert.equal(d.lastTickSec, row.sim.timeSec);
    assert.equal(new Set(newAnimals(row).map(a => a.id)).size, newAnimals(row).length);
    assert.equal(new Set(newAnimals(row).map(a => a.speciesId)).size, newAnimals(row).length);
    for (const p of d.foodPatches) {
      const native = row.sim.rockPatches.concat(row.sim.floorPatches).find(n => n.id === p.nativePatchId);
      assert.ok(native, 'new source is an actual existing native patch');
      assert.equal(p.position.x, native.position.x); assert.equal(p.position.z, native.position.z);
      close(p.position.y - f.generator.heightAt(p.position.x, p.position.z) - KELP_NEAR_BOTTOM_LIFE_MODEL.foodHeightM,
        'explicit bed-source microheight');
      assert.ok(p.amount >= 0 && p.amount <= KELP_NEAR_BOTTOM_LIFE_MODEL.maximumPatchStock);
    }
    for (const a of newAnimals(row)) {
      if (a.alive) assert.equal(a.timeSec, row.sim.timeSec);
      assert.ok(kelpNearBottomLifePositionValid(f.generator, row, a, a.position, a.heading, a.pitch,
        { future: false, checkPlants: a.alive }), `${row.id}/${a.id} actual whole form and support`);
    }
  }
  const snapshot = f.model.snapshot(); close(snapshot.metrics.balanceError, 'public old plus independent bed-food bound');
  if (snapshot.metrics.nearBottomFoodBudgetError !== undefined) close(snapshot.metrics.nearBottomFoodBudgetError, 'public bed-food balance');
  if (snapshot.metrics.nearBottomEnergyBudgetError !== undefined) close(snapshot.metrics.nearBottomEnergyBudgetError, 'public condition balance');
}

// Passive setters observe actual raw stock, both ingestion-ledger writes and
// condition gain before each native receipt. They never supply food or move actors.
function observeIntakes(row, traces) {
  const d = row.kelpNearBottomLife, latest = new Map(), cleanup = []; let ingestion, typedIngestion, gain;
  for (const p of d.foodPatches) {
    let value = p.amount;
    Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, get: () => value,
      set: next => { latest.set(p.id, { stockBefore: value, stockAfter: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, writable: true, value }));
  }
  for (const [object, key, observe] of [[d.foodLedger, 'ingested', value => { ingestion = value; }],
    [d.foodLedger.byPool.benthicAnimalFood, 'ingested', value => { typedIngestion = value; }],
    [row.kelpNearBottomEnergyLedger, 'feedingGain', value => { gain = value; }]]) {
    let value = object[key];
    Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value,
      set: next => { observe({ before: value, after: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value }));
  }
  for (const a of newAnimals(row)) {
    let value = a.lastNearBottomIntake;
    Object.defineProperty(a, 'lastNearBottomIntake', { configurable: true, enumerable: true, get: () => value,
      set: next => {
        value = next; if (next === null) return;
        const p = d.foodPatches.find(p => p.id === next.patchId), debit = latest.get(next.patchId);
        assert.ok(p && debit && ingestion && typedIngestion && gain, 'actual stock and both typed ledgers really wrote');
        assert.equal(next.pool, 'benthicAnimalFood'); assert.equal(next.nativePatchId, p.nativePatchId);
        assert.equal(next.ownerId, row.id); assert.ok(d.foodLedger.input > 0); assert.equal(d.foodLedger.initial, 0);
        assert.ok(debit.stockBefore > 0); assert.equal(p.amount, debit.stockAfter);
        assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual bed-stock debit');
        close(ingestion.after - ingestion.before - next.removedUnits, 'actual owner ingestion write');
        close(typedIngestion.after - typedIngestion.before - next.removedUnits, 'actual typed ingestion write');
        close(gain.after - gain.before - next.removedUnits * KELP_NEAR_BOTTOM_LIFE_MODEL.energyGainPerUnit, 'actual condition gain');
        assert.equal(a.energy, next.energyAfter); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(next.timeSec, row.sim._ticks * .1); assert.equal(a.timeSec, next.timeSec);
        assert.deepEqual(next.agentPosition, a.position); assert.deepEqual(next.supportNormal, a.supportNormal);
        assert.deepEqual(next.feedingPosition, kelpNearBottomLifeFeedingPosition(a)); assert.deepEqual(next.foodPosition, p.position);
        close(distance(next.feedingPosition, next.foodPosition) - next.contactDistanceM, 'actual visible mouth contact');
        assert.ok(next.contactDistanceM <= KELP_NEAR_BOTTOM_LIFE_MODEL.maximumFoodDistanceM);
        close(kelpNearBottomLifeFoodBudgetError(row), 'food closes immediately after actual ingestion');
        traces.push({ agentId: a.id, speciesId: a.speciesId, ...clone(next), actualOwnerIngestion: clone(ingestion),
          actualTypedIngestion: clone(typedIngestion), actualConditionGain: clone(gain), individualClockSec: a.timeSec });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastNearBottomIntake', { configurable: true, enumerable: true, writable: true, value }));
  }
  return () => cleanup.forEach(done => done());
}

let samplePromise, oldBirthPromise;
async function oldBirth() {
  oldBirthPromise ??= (async () => { const f = fixture(new MemoryStore(), false);
    assert.equal(await f.model.update(opening), true); return stored(f.store); })();
  return clone(await oldBirthPromise);
}
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), initial = new Map(), owners = [], windowActivity = [], union = new Set();
    for (const position of windows) {
      f.store.reads.length = 0; assert.equal(await f.model.update(position), true); bounded(f);
      assert.ok(f.store.reads.length <= 24);
      const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(position), true); bounded(old);
      const before = new Map(), traces = [], cleanup = [], offscreen = [...f.store.records]
        .filter(([, raw]) => !f.model._active.has(raw.id)).map(([key, raw]) => [key, clone(raw)]);
      for (const row of f.model._active.values()) {
        const raw = f.model._record(row), original = old.model._record(old.model._active.get(row.id)), key = `${f.model._world}|${row.id}`;
        const fresh = !owners.some(owner => owner.id === row.id);
        if (fresh) {
          assert.deepEqual(withoutNew(f.store.records.get(key)), old.store.records.get(key), `${row.id} original committed raw is unchanged before public snapshot`);
          assert.deepEqual(withoutNew(raw), original, `${row.id} all old raw data, food points, clocks and RNG unchanged at admission`);
          if (!initial.has(key)) initial.set(key, clone(f.store.records.get(key))); assert.equal(row.sim.timeSec, 0);
          assert.equal(row.kelpNearBottomLife.foodLedger.initial, 0); assert.equal(row.kelpNearBottomLife.foodLedger.input, 0);
          assert.ok(row.kelpNearBottomLife.foodPatches.every(p => p.amount === 0));
        }
        assert.equal(row.kelpNearBottomLifeVersion, 1);
        for (const a of newAnimals(row)) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        if (fresh) owners.push({ id: row.id, role: row.kelpNearBottomLife.role, oldAnimalRecords: allAnimals(row).length - newAnimals(row).length,
          totalAnimalRecords: allAnimals(row).length, initialNativeState: clone(raw.state),
          initialNewFoodLedger: clone(row.kelpNearBottomLife.foodLedger), initialNewEnergyLedger: clone(row.kelpNearBottomEnergyLedger),
          foodPatches: clone(row.kelpNearBottomLife.foodPatches),
          newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM,
            sizeMeasure: kelpNearBottomLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position), supportNormal: clone(a.supportNormal),
            actualRootDepthM: f.generator.surfaceY - a.position.y, energy: a.energy, timeSec: a.timeSec, pool: a.nutritionPool })) });
        cleanup.push(observeIntakes(row, traces));
      }
      // The production writer commits complete forest groups, including unloaded
      // sibling owners. Preserve those exact initial rows for cold restoration;
      // they are not counted as observed animals or extra sample windows.
      for (const [key, raw] of f.store.records) if (!initial.has(key) && raw.state.timeSec === 0) initial.set(key, clone(raw));
      const started = performance.now();
      try { f.model.step(observationSec, { foodSupply: 1, currentMps: .18, hour: 12 }); }
      finally { cleanup.forEach(done => done()); }
      bounded(f); await f.model.checkpoint();
      for (const [key, raw] of offscreen) assert.deepEqual(f.store.records.get(key), raw, 'offscreen complete history freezes');
      windowActivity.push({ position, observedSec: observationSec, actualCpuWallTimeMs: performance.now() - started,
        activeOwners: f.model._active.size, sourceOwners: f.generator.forestBeltRegistryStats().size, actualIntakes: traces,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, role: row.kelpNearBottomLife.role,
          clockSec: row.sim.timeSec, ticks: row.sim._ticks, newClockSec: row.kelpNearBottomLife.lastTickSec,
          totalAnimalRecords: allAnimals(row).length, counters: clone(row.kelpNearBottomLife.counters),
          nativeFoodLedger: clone(row.sim.ledger), foodLedger: clone(row.kelpNearBottomLife.foodLedger),
          energyLedger: clone(row.kelpNearBottomEnergyLedger), foodPatches: clone(row.kelpNearBottomLife.foodPatches),
          nativeFoodBalanceError: row.sim.metrics.resourceBudgetError, newFoodBalanceError: kelpNearBottomLifeFoodBudgetError(row),
          conditionBalanceError: kelpNearBottomLifeEnergyBudgetError(row),
          combinedFoodBalanceError: Math.abs(row.sim.metrics.resourceBudgetError) + Math.abs(kelpNearBottomLifeFoodBudgetError(row)),
          agents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, alive: a.alive, timeSec: a.timeSec,
            energy: a.energy, state: a.state, position: clone(a.position), travelledM: a.travelledM,
            displacementM: distance(a.position, before.get(a.id).position), lastFeedAt: a.lastFeedAt,
            lastNearBottomIntake: clone(a.lastNearBottomIntake) })) })) });
    }
    const births = owners.flatMap(r => r.newAgents), final = [...new Map(windowActivity.flatMap(w => w.owners).map(r => [r.id, r])).values()], agents = final.flatMap(r => r.agents),
      intakes = windowActivity.flatMap(w => w.actualIntakes);
    const countsBySpecies = Object.fromEntries(KELP_NEAR_BOTTOM_LIFE_IDS.map(id => [id, {
      bornIndividuals: births.filter(a => a.speciesId === id).length,
      movedIndividuals: agents.filter(a => a.speciesId === id && a.travelledM > 1e-8).length,
      fedIndividuals: new Set(intakes.filter(a => a.speciesId === id).map(a => a.agentId)).size,
      successfulBites: intakes.filter(a => a.speciesId === id).length,
    }]));
    return { initial: clone([...initial]), union: [...union], owners, windowActivity, countsBySpecies,
      summary: { productionWindows: 2, uniqueProductionOwners: final.length, observedSecPerWindow: observationSec, actualNewIndividuals: births.length,
        movedIndividuals: agents.filter(a => a.travelledM > 1e-8).length, fedIndividuals: new Set(intakes.map(a => a.agentId)).size,
        successfulBites: intakes.length, intakeUnits: intakes.reduce((n, a) => n + a.removedUnits, 0), initialNewFoodUnits: 0,
        externalInputUnits: final.reduce((n, r) => n + r.foodLedger.input, 0), exportedUnits: final.reduce((n, r) => n + r.foodLedger.exported, 0),
        maxAllAnimalRecordsPerOwner: Math.max(...final.map(r => r.totalAnimalRecords)),
        maxFoodBalanceError: Math.max(...final.map(r => Math.abs(r.nativeFoodBalanceError))),
        maxNewFoodBalanceError: Math.max(...final.map(r => Math.abs(r.newFoodBalanceError))),
        maxCombinedFoodBalanceError: Math.max(...final.map(r => r.combinedFoodBalanceError)),
        maxConditionBalanceError: Math.max(...final.map(r => Math.abs(r.conditionBalanceError))) } };
  })();
  return clone(await samplePromise);
}

test('two ordinary windows preserve all old birth data and add four whole forms with actual bed-food input, contact, debit and gain', async () => {
  const actual = await sample(); assert.deepEqual(new Set(actual.union), new Set(KELP_NEAR_BOTTOM_LIFE_IDS));
  for (const id of KELP_NEAR_BOTTOM_LIFE_IDS) {
    assert.ok(actual.countsBySpecies[id].bornIndividuals > 0, id);
    assert.ok(actual.countsBySpecies[id].movedIndividuals > 0, `${id} actual movement`);
  }
  assert.ok(actual.owners.some(r => !r.role && r.newAgents.length === 0), 'natural empty role is retained');
  assert.ok(actual.summary.successfulBites > 0, 'real bed-food consumption without relocating old prey');
  const control = fixture(fromRecords(actual.initial)); assert.equal(await control.model.update(opening), true, control.model._storageError);
  for (const hour of [0, 12]) control.model.step(.1, { foodSupply: 0, currentMps: .18, hour });
  bounded(control);
  for (const row of control.model._active.values()) {
    assert.equal(row.kelpNearBottomLife.foodLedger.input, 0); assert.equal(row.kelpNearBottomLife.foodLedger.ingested, 0);
    assert.ok(row.kelpNearBottomLife.foodPatches.every(p => p.amount === 0));
  }
  if (process.env.KELP_NEAR_BOTTOM_RECEIPT) {
    const { initial, ...evidence } = actual;
    await writeFile(process.env.KELP_NEAR_BOTTOM_RECEIPT, `${JSON.stringify({ seed,
      scope: 'finite actual CPU production; independent zero-initial bed-food input/debit/export and relative condition; no GPU/visual acceptance, resolved biomass, full food web or visible prey kill',
      activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalRecordLimit: 4,
      entry: { ownerId: '53,-4', x: 3424, z: -224, newIndividuals: actual.owners.find(r => r.id === '53,-4').newAgents.length,
        totalAnimalRecords: actual.owners.find(r => r.id === '53,-4').totalAnimalRecords },
      sourceSpecies: kelpNearBottomLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName,
        sizeMeasure: s.sizeMeasure, selectedDepthM: s.depthSelectionM, sourceLinks: s.sourceLinks,
        unknownEnvironmentRanges: { temperature: s.temperatureRangeC, oxygen: s.oxygenRangeMgPerL, salinity: s.salinityRangePSU } })),
      ...evidence }, null, 2)}\n`);
  }
});

test('dead rosters, initial-zero bed pools and naturally empty roles unload and cold restore exactly without replacement or refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.equal(await f.model.update(opening), true, f.model._storageError);
  f.model.step(.3, { foodSupply: 1, currentMps: .18, hour: 12 }); bounded(f);
  const row = [...f.model._active.values()].find(r => newAnimals(r).length); assert.ok(row);
  const roster = newAnimals(row).map(a => a.id);
  for (const a of newAnimals(row)) {
    row.kelpNearBottomEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead';
    a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 }; row.kelpNearBottomLife.counters.deaths++;
  }
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { lineage: [2, 9], observed: 'bed-food' } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { original: true } };
  await f.model.checkpoint(); bounded(f); const before = records(f.model), ids = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(ids.every(id => !f.model._active.has(id)));
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id), dead = clone(newAnimals(restored));
  assert.deepEqual(newAnimals(restored).map(a => a.id), roster);
  cold.model.step(.1, { foodSupply: 0, currentMps: .18, hour: 12 }); bounded(cold);
  assert.deepEqual(newAnimals(restored), dead, 'dead complete actors, clocks and receipts freeze');
  const empty = data.initial.find(([, raw]) => raw.kelpNearBottomLife?.role === false && raw.kelpNearBottomLifeAgents.length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.equal(await emptyCold.model.update(at(empty.cx, empty.cz)), true);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
});

test('enabling on historical owners preserves all raw records, paused state and the exact following native steps', async () => {
  const old = fixture(fromRecords(await oldBirth()), false); assert.equal(await old.model.update(opening), true);
  old.model.step(.4, { foodSupply: 1, currentMps: .18, hour: 12 });
  const row = [...old.model._active.values()][0]; row._savedRecord = { ...row._savedRecord, opaqueHistory: { lineage: [11, 4] } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { original: true } };
  await old.model.checkpoint(); const saved = stored(old.store), enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.kelpNearBottomLifeVersion === undefined && newAnimals(r).length === 0));
  enabled.model.step(0, { hour: 12 }); assert.deepEqual(records(enabled.model), records(disabled.model));
  for (const dt of [.1, .2]) {
    enabled.model.step(dt, { foodSupply: 1, currentMps: .18, hour: 12 }); disabled.model.step(dt, { foodSupply: 1, currentMps: .18, hour: 12 });
    assert.deepEqual(records(enabled.model), records(disabled.model));
  }
  bounded(enabled); bounded(disabled);
});

test('strict-null atomic births remain private while pending and publish nothing after refused or thrown commits', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, raw]) => raw.kelpNearBottomLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('complete atomic near-bottom records were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    for (const [id, raw] of offered) {
      assert.equal(store.records.has(`${f.model._world}|${id}`), false); assert.equal(raw.state.timeSec, 0);
      assert.equal(raw.kelpNearBottomLifeVersion, 1); assert.equal(raw.kelpNearBottomLife.foodLedger.initial, 0);
      assert.equal(raw.kelpNearBottomLife.foodLedger.input, 0); assert.ok(raw.kelpNearBottomLife.foodPatches.every(p => p.amount === 0));
    }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const rejected = new MemoryStore(); rejected.refusal = refusal; const failed = fixture(rejected);
    assert.equal(await failed.model.update(opening), false); assert.equal(failed.model._active.size, 0);
    assert.equal(failed.model.agents.length, 0); assert.equal(failed.generator.forestBeltRevision, 0); assert.equal(rejected.records.size, 0);
  }
});

test('undefined and thrown historical reads cannot become new near-bottom communities', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('near-bottom historical owner unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('fifteen offscreen prefix, food, support, roster and original-category corruptions reject the entire historical halo without repair', async () => {
  const data = await sample();
  const base = data.initial.map(([, raw]) => raw).find(r => r.cx === 53 && r.kelpNearBottomLifeAgents.length);
  assert.ok(base, 'ordinary saved east-edge owner has real new actors');
  const targetId = base.id, shifted = at(base.cx - 2, -4);
  // The saved east-edge owner lies just outside the actual active window
  // scenery/history halo. Rejection must occur before any scene publication.
  const damages = [
    ['unknown-top-prefix', r => { r.kelpNearBottomUnknown = 1; }],
    ['unknown-state-prefix', r => { r.state.kelpNearBottomUnknown = 1; }],
    ['orphan-old-animal-prefix', r => { r.state.agents.find(a => a.speciesId !== 'giant-kelp').kelpNearBottomUnknown = 1; }],
    ['missing-five-field-version', r => { delete r.kelpNearBottomLifeVersion; }],
    ['missing-descriptor', r => { delete r.kelpNearBottomLife; }],
    ['unknown-new-individual-prefix', r => { r.kelpNearBottomLifeAgents[0].kelpNearBottomUnknown = 1; }],
    ['incomplete-individual-roster', r => { r.kelpNearBottomLifeAgents.pop(); }],
    ['missing-native-food-reference', r => { r.kelpNearBottomLife.foodPatches[0].nativePatchId = 'absent-native-patch'; }],
    ['relocated-source-point', r => { r.kelpNearBottomLife.foodPatches[0].position.y += .01; }],
    ['fabricated-initial-bed-food', r => { r.kelpNearBottomLife.foodPatches[0].amount += .001; }],
    ['foreign-food-pool', r => { r.kelpNearBottomLife.foodPatches[0].pool = 'smallPrey'; }],
    ['future-new-clock', r => { r.kelpNearBottomLifeAgents[0].timeSec = .1; }],
    ['unbalanced-original-food', r => { r.state.preyPatches[0].smallPrey += .1; }],
    ['invalid-original-water-category', r => { r.waterAgents = {}; }],
    ['invalid-original-complete-benthic-marker', r => { r.kelpBenthicLifeVersion = 99; }],
  ];
  for (const [name, damage] of damages) {
    const store = fromRecords(data.initial), raw = [...store.records.values()].find(r => r.id === targetId); damage(raw);
    const before = stored(store), f = fixture(store);
    assert.equal(await f.model.update(shifted), false, name); assert.ok(store.reads.includes(targetId), `${name} really read offscreen history`);
    assert.deepEqual(stored(store), before, `${name} never rewrites or refills historical stock`);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(store.batches.length, 0); assert.ok(store.reads.length <= 24);
  }
});
