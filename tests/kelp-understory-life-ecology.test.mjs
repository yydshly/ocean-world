import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';
import { validateKelpBenthicLifeRecord } from '../src/kelpBenthicLife.js';
import { validateKelpWaterLifeRecord } from '../src/kelpWaterLife.js';
import { validateKelpNearBottomLifeRecord, kelpNearBottomLifeFoodBudgetError } from '../src/kelpNearBottomLife.js';
import { KELP_UNDERSTORY_LIFE_IDS, KELP_UNDERSTORY_LIFE_ANIMAL_IDS, KELP_UNDERSTORY_LIFE_PLANT_IDS,
  KELP_UNDERSTORY_LIFE_MODEL, kelpUnderstoryLifePositionValid, kelpUnderstoryLifeBodyPoints,
  kelpUnderstoryLifeFeedingPosition, kelpUnderstoryLifeSnapshot, validateKelpUnderstoryLifeRecord,
  kelpUnderstoryLifeFoodBudgetError, kelpUnderstoryLifeEnergyBudgetError } from '../src/kelpUnderstoryLife.js';
import { kelpUnderstoryLifeSpeciesCatalog, kelpUnderstoryLifeSpeciesById } from '../src/kelpUnderstoryLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Two final ordinary native windows. No authored supports, forced placements,
// extra initial food, overridden RNG or altered old-controller food positions.
const windows = [at(58, -4), at(59, -4)], opening = windows[0], far = at(-38, 25);
const observationSec = 12, environment = { foodSupply: 1, currentMps: .18, hour: 12 };
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.kelpUnderstoryLifeAgents ?? [];
const newPlants = row => row.kelpUnderstoryLife?.plants ?? [];
const allAnimals = row => row.sim.agents.filter(a => a.speciesId !== 'giant-kelp').concat(
  row.waterAgents, row.visitorAgents, row.kelpBenthicAgents ?? [], row.kelpWaterLifeAgents ?? [],
  row.kelpNearBottomLifeAgents ?? [], newAnimals(row));
const newFields = ['kelpUnderstoryLifeVersion', 'kelpUnderstoryLifeInitializedAtSec', 'kelpUnderstoryLife',
  'kelpUnderstoryLifeAgents', 'kelpUnderstoryEnergyLedger'];
const withoutNew = raw => Object.fromEntries(Object.entries(clone(raw)).filter(([key]) => !newFields.includes(key)));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { return this.saveMany(world, [[id, record]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('understory atomic commit rejected');
    const offered = clone(entries); if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records); for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), understoryLife = true) {
  const generator = createKelpOceanGenerator(seed, { forestBelt: true, kelpSeascape: true });
  const model = new KelpOceanEcology(seed, generator, { store, visitors: true, understory: true,
    forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife: true, nearBottomLife: true, understoryLife });
  return { generator, model, store };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.forestBeltRegistryStats().size <= 25);
  const snapshot = f.model.snapshot(); close(snapshot.metrics.balanceError, 'public original plus both independent food bounds');
  if (snapshot.metrics.understoryFoodBudgetError !== undefined) close(snapshot.metrics.understoryFoodBudgetError, 'public suspended-food balance');
  if (snapshot.metrics.understoryEnergyBudgetError !== undefined) close(snapshot.metrics.understoryEnergyBudgetError, 'public filter-animal condition balance');
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, `${row.id} complete original and new animal budget`);
    close(row.sim.metrics.resourceBudgetError, `${row.id} original food ledger`);
    close(kelpDriftBalanceError(row), `${row.id} old shed-food ledger`);
    close(kelpNearBottomLifeFoodBudgetError(row), `${row.id} old independent bed-food ledger`);
    close(kelpUnderstoryLifeFoodBudgetError(row), `${row.id} suspended-food ledger`);
    close(kelpUnderstoryLifeEnergyBudgetError(row), `${row.id} filter-animal condition ledger`);
    const raw = f.model._record(row);
    for (const [label, validate] of [['benthic', validateKelpBenthicLifeRecord], ['water', validateKelpWaterLifeRecord],
      ['near-bottom', validateKelpNearBottomLifeRecord], ['understory', validateKelpUnderstoryLifeRecord]])
      assert.ok(validate(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} complete ${label} history`);
    assert.equal(Object.hasOwn(row.sim.resources, 'suspendedOrganicFood'), false, 'new nutrition is not a renamed original pool');
    if (row.kelpUnderstoryLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); assert.equal(newPlants(row).length, 0); continue; }
    const d = row.kelpUnderstoryLife, publicRow = snapshot.regions.find(r => r.id === row.id);
    assert.equal(row.kelpUnderstoryLifeVersion, 1); assert.ok(newAnimals(row).length <= 4); assert.ok(newPlants(row).length <= 12);
    assert.equal(d.counters.ticks, row.sim._ticks); assert.equal(d.lastTickSec, row.sim.timeSec);
    assert.ok(d.foodChannels.length <= KELP_UNDERSTORY_LIFE_MODEL.maximumChannels);
    assert.ok(d.foodParcels.length <= KELP_UNDERSTORY_LIFE_MODEL.maximumParcels);
    assert.equal(d.foodLedger.initial, 0); assert.equal(d.foodLedger.byPool.suspendedOrganicFood.initial, 0);
    assert.deepEqual(publicRow.understoryLife, kelpUnderstoryLifeSnapshot(row));
    for (const a of newPlants(row).concat(newAnimals(row))) {
      const source = kelpUnderstoryLifeSpeciesById[a.speciesId]; assert.ok(source);
      assert.ok(kelpUnderstoryLifePositionValid(f.generator, row, a), `${row.id}/${a.id} whole native rock support`);
      assert.equal(a.pitch, 0); assert.ok(a.sizeM >= source.sizeRangeM[0] && a.sizeM <= source.sizeRangeM[1]);
      const support = f.generator.supportAt(a.position.x, a.position.z);
      assert.equal(support.substrate, 'rock'); assert.equal(support.elementId, a.kelpUnderstoryHostId);
      for (const p of kelpUnderstoryLifeBodyPoints(a)) {
        const depth = f.generator.surfaceY - p.y;
        assert.ok(depth >= source.depthSelectionM[0] && depth <= source.depthSelectionM[1]);
        assert.ok(p.y >= f.generator.heightAt(p.x, p.z) - 1e-8);
      }
      if (KELP_UNDERSTORY_LIFE_ANIMAL_IDS.includes(a.speciesId)) {
        assert.deepEqual(a.velocity, { x: 0, y: 0, z: 0 }); if (a.alive) assert.equal(a.timeSec, row.sim.timeSec);
      } else { assert.equal(source.biomassStockSimulated, false); assert.equal(source.photosynthesisSimulated, false); }
    }
  }
}

// Passive observation of actual native parcel amount, typed/owner ingestion
// and independent condition writes; it never adds input or changes a pore.
function observeIntakes(row, traces) {
  const d = row.kelpUnderstoryLife, latest = new Map(), watched = new WeakSet(), cleanup = [];
  let ingestion, typedIngestion, gain;
  for (const [object, key, observe] of [[d.foodLedger, 'ingested', value => { ingestion = value; }],
    [d.foodLedger.byPool.suspendedOrganicFood, 'ingested', value => { typedIngestion = value; }],
    [row.kelpUnderstoryEnergyLedger, 'feedingGain', value => { gain = value; }]]) {
    let value = object[key]; Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value,
      set: next => { observe({ before: value, after: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value }));
  }
  function watchParcels() {
    for (const p of d.foodParcels) {
      if (watched.has(p)) continue; watched.add(p); let value = p.amount;
      Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, get: () => value,
        set: next => { latest.set(p.id, { parcel: p, stockBefore: value, stockAfter: next }); value = next; } });
      cleanup.push(() => Object.defineProperty(p, 'amount', { configurable: true, enumerable: true, writable: true, value }));
    }
  }
  for (const a of newAnimals(row)) {
    let value = a.lastUnderstoryIntake;
    Object.defineProperty(a, 'lastUnderstoryIntake', { configurable: true, enumerable: true, get: () => value,
      set: next => {
        value = next; if (!next) return;
        const c = d.foodChannels.find(c => c.id === next.channelId), debit = latest.get(next.parcelId);
        assert.ok(c && debit && ingestion && typedIngestion && gain, 'real transported parcel and both ingestion ledgers wrote');
        assert.equal(next.pool, 'suspendedOrganicFood'); assert.equal(next.ownerId, row.id); assert.equal(next.hostId, a.kelpUnderstoryHostId);
        assert.equal(c.agentId, a.id); assert.ok(d.foodLedger.input > 0); assert.equal(d.foodLedger.initial, 0);
        assert.ok(debit.stockBefore > 0); assert.equal(debit.parcel.amount, debit.stockAfter);
        assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual suspended-stock debit');
        close(ingestion.after - ingestion.before - next.removedUnits, 'actual owner ingestion write');
        close(typedIngestion.after - typedIngestion.before - next.removedUnits, 'actual typed ingestion write');
        close(gain.after - gain.before - next.removedUnits * KELP_UNDERSTORY_LIFE_MODEL.energyGainPerUnit, 'actual condition gain');
        assert.equal(a.energy, next.energyAfter); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(next.timeSec, row.sim._ticks * .1); assert.equal(a.timeSec, next.timeSec);
        assert.deepEqual(next.agentPosition, a.position); assert.deepEqual(next.sourcePosition, c.sourcePosition);
        assert.deepEqual(next.feedingPosition, kelpUnderstoryLifeFeedingPosition(a)); assert.deepEqual(next.foodPosition, debit.parcel.position);
        assert.equal(next.foodPosition.y, next.sourcePosition.y); assert.equal(next.foodPosition.z, next.sourcePosition.z);
        close(next.foodPosition.x - next.sourcePosition.x - next.parcelTravelM, 'actual constant-Y positive-X transport');
        assert.ok(next.parcelTravelM > 0); assert.ok(next.timeSec > next.parcelCreatedAtSec);
        close(distance(next.feedingPosition, next.foodPosition) - next.contactDistanceM, 'actual inlet-pore contact');
        assert.ok(next.contactDistanceM <= KELP_UNDERSTORY_LIFE_MODEL.maximumFoodDistanceM);
        close(kelpUnderstoryLifeFoodBudgetError(row), 'food closes at actual ingestion');
        traces.push({ agentId: a.id, speciesId: a.speciesId, ...clone(next), actualOwnerIngestion: clone(ingestion),
          actualTypedIngestion: clone(typedIngestion), actualConditionGain: clone(gain), individualClockSec: a.timeSec });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastUnderstoryIntake', { configurable: true, enumerable: true, writable: true, value }));
  }
  return { watchParcels, stop: () => cleanup.forEach(done => done()) };
}

let samplePromise, oldBirthPromise;
async function oldBirth() {
  oldBirthPromise ??= (async () => { const f = fixture(new MemoryStore(), false);
    assert.equal(await f.model.update(opening), true, f.model._storageError); return stored(f.store); })();
  return clone(await oldBirthPromise);
}
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), initial = new Map(), owners = [], windowActivity = [], union = new Set();
    for (const position of windows) {
      f.store.reads.length = 0; assert.equal(await f.model.update(position), true, f.model._storageError);
      assert.ok(f.store.reads.length <= 24);
      const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(position), true, old.model._storageError);
      // Public getters attach old display metadata. Expose both sides before
      // comparing in-memory raw state, but compare committed births separately.
      bounded(f); bounded(old);
      const before = new Map(), traces = [], observers = [], offscreen = [...f.store.records]
        .filter(([, raw]) => !f.model._active.has(raw.id)).map(([key, raw]) => [key, clone(raw)]);
      for (const row of f.model._active.values()) {
        const raw = f.model._record(row), original = old.model._record(old.model._active.get(row.id)), key = `${f.model._world}|${row.id}`;
        const fresh = !owners.some(owner => owner.id === row.id);
        if (fresh) {
          assert.deepEqual(withoutNew(f.store.records.get(key)), old.store.records.get(key), `${row.id} all old committed birth bytes unchanged`);
          assert.deepEqual(withoutNew(raw), original, `${row.id} original food points, actors, clocks and RNG unchanged at admission`);
          if (!initial.has(key)) initial.set(key, clone(f.store.records.get(key))); assert.equal(row.sim.timeSec, 0);
          assert.equal(row.kelpUnderstoryLife.foodLedger.initial, 0); assert.equal(row.kelpUnderstoryLife.foodLedger.input, 0);
          assert.deepEqual(row.kelpUnderstoryLife.foodParcels, []);
        }
        assert.equal(row.kelpUnderstoryLifeVersion, 1);
        for (const a of newAnimals(row).concat(newPlants(row))) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        if (fresh) owners.push({ id: row.id, role: row.kelpUnderstoryLife.role,
          oldAnimalRecords: allAnimals(row).length - newAnimals(row).length, totalAnimalRecords: allAnimals(row).length,
          initialNativeState: clone(raw.state), initialNewFoodLedger: clone(row.kelpUnderstoryLife.foodLedger),
          initialNewEnergyLedger: clone(row.kelpUnderstoryEnergyLedger), foodChannels: clone(row.kelpUnderstoryLife.foodChannels),
          plants: clone(newPlants(row)), newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId,
            sizeM: a.sizeM, sizeMeasure: kelpUnderstoryLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
            supportNormal: clone(a.supportNormal), hostId: a.kelpUnderstoryHostId, actualRootDepthM: f.generator.surfaceY - a.position.y,
            capturePosition: kelpUnderstoryLifeFeedingPosition(a), energy: a.energy, timeSec: a.timeSec, pool: a.nutritionPool })) });
        observers.push(observeIntakes(row, traces));
      }
      // Preserve the complete original forest-group history, including atomic
      // offscreen siblings. They are not counted as additional observations.
      for (const [key, raw] of f.store.records) if (!initial.has(key) && raw.state.timeSec === 0) initial.set(key, clone(raw));
      const started = performance.now();
      try { for (let tick = 0; tick < observationSec * 10; tick++) { observers.forEach(o => o.watchParcels()); f.model.step(.1, environment); } }
      finally { observers.forEach(o => o.stop()); }
      bounded(f); assert.equal(await f.model.checkpoint(), true, f.model._storageError);
      for (const [key, raw] of offscreen) assert.deepEqual(f.store.records.get(key), raw, 'offscreen historical food and population freeze');
      const snapshot = f.model.snapshot();
      windowActivity.push({ position, observedSec: observationSec, actualCpuWallTimeMs: performance.now() - started,
        activeOwners: f.model._active.size, sourceOwners: f.generator.forestBeltRegistryStats().size,
        actualIntakes: traces, publicSuspendedOrganicFood: snapshot.resources.suspendedOrganicFood,
        combinedFoodBalanceError: snapshot.metrics.balanceError,
        owners: [...f.model._active.values()].map(row => {
          for (const p of newPlants(row)) assert.deepEqual(p, before.get(p.id), 'persistent plant root/descriptor does not simulate biomass growth');
          return { id: row.id, role: row.kelpUnderstoryLife.role, clockSec: row.sim.timeSec, ticks: row.sim._ticks,
            newClockSec: row.kelpUnderstoryLife.lastTickSec, totalAnimalRecords: allAnimals(row).length,
            plants: clone(newPlants(row)), counters: clone(row.kelpUnderstoryLife.counters), nativeFoodLedger: clone(row.sim.ledger),
            foodLedger: clone(row.kelpUnderstoryLife.foodLedger), energyLedger: clone(row.kelpUnderstoryEnergyLedger),
            foodChannels: clone(row.kelpUnderstoryLife.foodChannels), foodParcels: clone(row.kelpUnderstoryLife.foodParcels),
            nativeFoodBalanceError: row.sim.metrics.resourceBudgetError, oldBedFoodBalanceError: kelpNearBottomLifeFoodBudgetError(row),
            newFoodBalanceError: kelpUnderstoryLifeFoodBudgetError(row), conditionBalanceError: kelpUnderstoryLifeEnergyBudgetError(row),
            combinedFoodBalanceError: Math.abs(row.sim.metrics.resourceBudgetError) + Math.abs(kelpNearBottomLifeFoodBudgetError(row)) + Math.abs(kelpUnderstoryLifeFoodBudgetError(row)),
            agents: newAnimals(row).map(a => { assert.deepEqual(a.position, before.get(a.id).position); return {
              id: a.id, speciesId: a.speciesId, alive: a.alive, timeSec: a.timeSec, energy: a.energy, state: a.state,
              position: clone(a.position), fixedRootDisplacementM: distance(a.position, before.get(a.id).position),
              lastFeedAt: a.lastFeedAt, lastUnderstoryIntake: clone(a.lastUnderstoryIntake) }; }) };
        }) });
    }
    const births = owners.flatMap(r => r.newAgents), plantBirths = owners.flatMap(r => r.plants),
      final = [...new Map(windowActivity.flatMap(w => w.owners).map(r => [r.id, r])).values()],
      agents = final.flatMap(r => r.agents), intakes = windowActivity.flatMap(w => w.actualIntakes);
    const countsBySpecies = Object.fromEntries(KELP_UNDERSTORY_LIFE_IDS.map(id => [id, {
      kind: kelpUnderstoryLifeSpeciesById[id].kind,
      bornPlants: plantBirths.filter(p => p.speciesId === id).length,
      bornIndividuals: births.filter(a => a.speciesId === id).length,
      clockedIndividuals: agents.filter(a => a.speciesId === id && a.timeSec > 0).length,
      fedIndividuals: new Set(intakes.filter(a => a.speciesId === id).map(a => a.agentId)).size,
      successfulBites: intakes.filter(a => a.speciesId === id).length,
    }]));
    return { initial: clone([...initial]), union: [...union], owners, windowActivity, countsBySpecies,
      summary: { productionWindows: 2, uniqueProductionOwners: final.length, observedSecPerWindow: observationSec,
        actualNewPlants: plantBirths.length, actualNewIndividuals: births.length, clockedIndividuals: agents.filter(a => a.timeSec > 0).length,
        fedIndividuals: new Set(intakes.map(a => a.agentId)).size, successfulBites: intakes.length,
        intakeUnits: intakes.reduce((n, a) => n + a.removedUnits, 0), initialNewFoodUnits: 0,
        externalInputUnits: final.reduce((n, r) => n + r.foodLedger.input, 0), exportedUnits: final.reduce((n, r) => n + r.foodLedger.exported, 0),
        maxNewPlantsPerOwner: Math.max(...final.map(r => r.plants.length)),
        maxAllAnimalRecordsPerOwner: Math.max(...final.map(r => r.totalAnimalRecords)),
        maxFoodBalanceError: Math.max(...final.map(r => Math.abs(r.nativeFoodBalanceError))),
        maxNewFoodBalanceError: Math.max(...final.map(r => Math.abs(r.newFoodBalanceError))),
        maxCombinedFoodBalanceError: Math.max(...final.map(r => r.combinedFoodBalanceError)),
        maxConditionBalanceError: Math.max(...final.map(r => Math.abs(r.conditionBalanceError))) } };
  })();
  return clone(await samplePromise);
}

test('two ordinary windows preserve all original births and host four source-qualified forms with real suspended-food transport, inlet contact and accounting', async () => {
  const actual = await sample();
  assert.deepEqual(new Set(actual.union), new Set(KELP_UNDERSTORY_LIFE_IDS));
  assert.ok(actual.owners.some(r => !r.role && !r.newAgents.length && !r.plants.length), 'natural complete empty role remains');
  assert.ok(actual.summary.successfulBites > 0, 'real pore contact and debit without relocating old prey');
  for (const id of KELP_UNDERSTORY_LIFE_PLANT_IDS) assert.ok(actual.countsBySpecies[id].bornPlants > 0);
  for (const id of KELP_UNDERSTORY_LIFE_ANIMAL_IDS) assert.ok(actual.countsBySpecies[id].clockedIndividuals > 0);
  const zero = fixture(fromRecords(actual.initial)); assert.equal(await zero.model.update(opening), true, zero.model._storageError);
  for (const hour of [0, 12]) zero.model.step(.1, { foodSupply: 0, currentMps: .18, hour }); bounded(zero);
  for (const row of zero.model._active.values()) {
    assert.equal(row.kelpUnderstoryLife.foodLedger.input, 0); assert.equal(row.kelpUnderstoryLife.foodLedger.ingested, 0);
    assert.deepEqual(row.kelpUnderstoryLife.foodParcels, []);
  }
  if (process.env.KELP_UNDERSTORY_RECEIPT) {
    const { initial, ...evidence } = actual, entry = actual.owners.find(r => r.id === '58,-4');
    await writeFile(process.env.KELP_UNDERSTORY_RECEIPT, `${JSON.stringify({ seed,
      scope: 'finite ordinary CPU production; fixed persistent scenery and independent filter animals; zero-initial typed suspended-food input/transport/contact/debit/export and relative condition; no GPU/visual acceptance, biomass, photosynthesis or complete natural food web',
      activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalRecordLimit: 4, newPlantLimit: 12,
      entry: { ownerId: entry.id, x: 3744, z: -224, newIndividuals: entry.newAgents.length,
        newPlants: entry.plants.length, totalAnimalRecords: entry.totalAnimalRecords },
      sourceSpecies: kelpUnderstoryLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName,
        kind: s.kind, firstTimeSpeciesAddition: s.firstTimeSpeciesAddition, sizeMeasure: s.sizeMeasure,
        selectedDepthM: s.depthSelectionM, sourceLinks: s.sourceLinks,
        unknownEnvironmentRanges: { temperature: s.temperatureRangeC, oxygen: s.oxygenRangeMgPerL, salinity: s.salinityRangePSU } })),
      ...evidence }, null, 2)}\n`);
  }
});

test('complete plants, empty categories, dead filter actors and source histories remain exact through unload and cold restore without recruitment', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.equal(await f.model.update(opening), true, f.model._storageError);
  f.model.step(.4, environment); bounded(f);
  const row = [...f.model._active.values()].find(r => newAnimals(r).length); assert.ok(row);
  const roster = newAnimals(row).map(a => a.id), plants = clone(newPlants(row));
  for (const a of newAnimals(row)) {
    row.kelpUnderstoryEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead';
    a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 }; row.kelpUnderstoryLife.counters.deaths++;
  }
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { lineage: [2, 9], observed: 'fixed-pore' } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { original: true } };
  assert.equal(await f.model.checkpoint(), true); bounded(f); const before = records(f.model), ids = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(ids.every(id => !f.model._active.has(id)));
  assert.equal(await f.model.update(opening), true, f.model._storageError); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true, cold.model._storageError);
  assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id), dead = clone(newAnimals(restored));
  assert.deepEqual(newAnimals(restored).map(a => a.id), roster); assert.deepEqual(newPlants(restored), plants);
  cold.model.step(.1, { ...environment, foodSupply: 0 }); bounded(cold);
  assert.deepEqual(newAnimals(restored), dead, 'dead actors, pores, clocks and intake history freeze'); assert.deepEqual(newPlants(restored), plants);
  const empty = data.initial.find(([, raw]) => raw.kelpUnderstoryLife?.role === false && !raw.kelpUnderstoryLifeAgents.length && !raw.kelpUnderstoryLife.plants.length)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.equal(await emptyCold.model.update(at(empty.cx, empty.cz)), true, emptyCold.model._storageError);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
});

test('enabling on historical owners preserves every raw old record, paused state and exact following native steps without adding scenery or animals', async () => {
  const old = fixture(fromRecords(await oldBirth()), false); assert.equal(await old.model.update(opening), true);
  old.model.step(.4, environment); const row = [...old.model._active.values()][0];
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { lineage: [11, 4] } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { original: true } };
  assert.equal(await old.model.checkpoint(), true); const saved = stored(old.store);
  const enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.kelpUnderstoryLifeVersion === undefined && !newAnimals(r).length && !newPlants(r).length));
  enabled.model.step(0, environment); assert.deepEqual(records(enabled.model), records(disabled.model));
  for (const dt of [.1, .2]) { enabled.model.step(dt, environment); disabled.model.step(dt, environment);
    assert.deepEqual(records(enabled.model), records(disabled.model)); }
  bounded(enabled); bounded(disabled);
});

test('strict-null atomic scenery and animal births stay private while pending and publish nothing after refused or thrown commits', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, raw]) => raw.kelpUnderstoryLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('complete atomic understory records were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    for (const [id, raw] of offered) {
      assert.equal(store.records.has(`${f.model._world}|${id}`), false); assert.equal(raw.state.timeSec, 0);
      assert.equal(raw.kelpUnderstoryLifeVersion, 1); assert.equal(raw.kelpUnderstoryLife.foodLedger.initial, 0);
      assert.equal(raw.kelpUnderstoryLife.foodLedger.input, 0); assert.deepEqual(raw.kelpUnderstoryLife.foodParcels, []);
      assert.ok(raw.kelpUnderstoryLife.plants.every(p => p.createdAtSec === 0));
    }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const rejected = new MemoryStore(); rejected.refusal = refusal; const failed = fixture(rejected);
    assert.equal(await failed.model.update(opening), false); assert.equal(failed.model._active.size, 0);
    assert.equal(failed.model.agents.length, 0); assert.equal(failed.generator.forestBeltRevision, 0); assert.equal(rejected.records.size, 0);
  }
});

test('undefined and thrown historical reads never become fresh attached communities', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('understory history unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('fifteen offscreen plant, animal, source, parcel and original-history corruptions reject the whole atomic halo without repair or refill', async () => {
  const data = await sample(), base = data.initial.map(([, raw]) => raw).find(r => r.id === '57,-4' && r.kelpUnderstoryLifeAgents.length && r.kelpUnderstoryLife.plants.length);
  assert.ok(base, 'saved odd forest-group edge owner has genuine independent plants and animals');
  const targetId = base.id, shifted = at(base.cx - 2, -4);
  // A group contains even/odd x siblings. The actual odd owner 57,-4 lies
  // outside active54..56 but is required by active56's complete forest group.
  const damages = [
    ['unknown-top-prefix', r => { r.kelpUnderstoryUnknown = 1; }],
    ['unknown-state-prefix', r => { r.state.kelpUnderstoryUnknown = 1; }],
    ['orphan-old-animal-prefix', r => { r.state.agents.find(a => a.speciesId !== 'giant-kelp').kelpUnderstoryUnknown = 1; }],
    ['missing-five-field-version', r => { delete r.kelpUnderstoryLifeVersion; }],
    ['unknown-new-animal-prefix', r => { r.kelpUnderstoryLifeAgents[0].kelpUnderstoryUnknown = 1; }],
    ['incomplete-animal-roster', r => { r.kelpUnderstoryLifeAgents.pop(); }],
    ['unknown-persistent-plant-prefix', r => { r.kelpUnderstoryLife.plants[0].kelpUnderstoryUnknown = 1; }],
    ['incomplete-persistent-plant-roster', r => { r.kelpUnderstoryLife.plants.pop(); }],
    ['relocated-plant-rock-root', r => { r.kelpUnderstoryLife.plants[0].position.y += .01; }],
    ['relocated-upstream-source', r => { r.kelpUnderstoryLife.foodChannels[0].sourcePosition.y += .01; }],
    ['fabricated-initial-suspended-food', r => { r.kelpUnderstoryLife.foodLedger.initial = .001; }],
    ['foreign-food-pool', r => { r.kelpUnderstoryLife.foodChannels[0].pool = 'smallPrey'; }],
    ['future-new-clock', r => { r.kelpUnderstoryLifeAgents[0].timeSec = .1; }],
    ['unbalanced-original-food', r => { r.state.preyPatches[0].smallPrey += .1; }],
    ['invalid-original-near-bottom-category', r => { r.kelpNearBottomLifeVersion = 99; }],
  ];
  for (const [name, damage] of damages) {
    const store = fromRecords(data.initial), raw = [...store.records.values()].find(r => r.id === targetId); damage(raw);
    const before = stored(store), f = fixture(store); assert.equal(await f.model.update(shifted), false, name);
    assert.ok(store.reads.includes(targetId), `${name} actually reads offscreen historical owner`);
    assert.deepEqual(stored(store), before, `${name} never repairs or replenishes historical state`);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(store.batches.length, 0); assert.ok(store.reads.length <= 24);
  }
});
