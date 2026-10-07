import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { predatorEnergyBudgetError } from '../src/deepPredatorEcology.js';
import { DEEP_BENTHIC_LIFE_IDS, DEEP_BENTHIC_LIFE_MODEL, isDeepBenthicLifeAgent,
  deepBenthicLifePositionValid, validateDeepBenthicLifeRecord, deepBenthicLifeEnergyBudgetError } from '../src/deepBenthicLife.js';
import { deepBenthicLifeSpeciesCatalog, deepBenthicLifeSpeciesById } from '../src/deepBenthicLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
const opening = at(140, 8), windows = [opening, at(144, 8)], far = at(-38, 25);
const environment = { foodSupply: 0, currentMps: .18, hour: 12, observerLight: .35 };
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? [], row.deepBenthicAgents ?? []);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));

class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('deep bottom-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), benthicLife = true) {
  const generator = createDeepOceanGenerator(seed, { seascape: true, wholeSeascape: true });
  const model = new DeepOceanEcology(seed, generator, { store, seascape: true, wholeSeascape: true, benthicLife });
  return { generator, model, store };
}
function balances(row) {
  const byPool = Object.fromEntries([['surfaceDetritus', row.sim.surfacePatches], ['benthicAnimalFood', row.sim.benthicPatches],
    ['suspendedPrey', row.sim.suspendedPatches]].map(([pool, patches]) => {
    const l = row.sim.ledger.byPool[pool], stock = patches.reduce((sum, p) => sum + p[pool], 0);
    return [pool, stock - (l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported)];
  }));
  const food = Object.values(row.sim.resources).reduce((sum, value) => sum + value, 0) -
    (row.sim.ledger.initial + row.sim.ledger.input - row.sim.ledger.ingested - row.sim.ledger.exported);
  const l = row.sim.energyLedger;
  const native = row.sim.agents.reduce((sum, a) => sum + a.energy, 0) -
    (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection - (l.predationTransferredOut ?? 0));
  return { byPool, food, native, predator: predatorEnergyBudgetError(row), newAnimals: deepBenthicLifeEnergyBudgetError(row) };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.seascapeRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'old, dead, predator and new animal records share the cap');
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    const errors = balances(row);
    for (const [pool, error] of Object.entries(errors.byPool)) close(error, `${row.id} ${pool} stock`);
    for (const name of ['food', 'native', 'predator', 'newAnimals']) close(errors[name], `${row.id} ${name} ledger`);
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
    if (row.deepBenthicLifeVersion !== undefined) {
      assert.ok(row.deepBenthicAgents.length <= 4);
      assert.ok(validateDeepBenthicLifeRecord(f.model._record(row), row, { generator: f.generator, capacity: 20 }), row.id);
      for (const agent of row.deepBenthicAgents) assert.ok(deepBenthicLifePositionValid(f.generator, row, agent), `${row.id}/${agent.id}`);
    }
  }
}
function killActual(row, newAnimal = true) {
  const animal = allAnimals(row).find(a => a.alive && (newAnimal ? isDeepBenthicLifeAgent(a) : !isDeepBenthicLifeAgent(a)));
  assert.ok(animal);
  if (newAnimal) { row.deepBenthicEnergyLedger.maintenanceAndMotionDebit += animal.energy; animal.energy = 0; animal.hunger = 1; }
  animal.alive = false; animal.state = 'dead'; animal.velocity = { x: 0, y: 0, z: 0 };
  if (!newAnimal) row.sim.counters.deathCount++;
  return animal.id;
}
let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), union = new Set(), fed = new Set(), moved = new Set(), owners = [], windowActivity = [];
    let initial, firstFinal, secondInitial;
    for (let index = 0; index < windows.length; index++) {
      const point = windows[index]; f.store.reads.length = 0;
      assert.equal(await f.model.update(point), true, f.model._storageError); bounded(f); assert.ok(f.store.reads.length <= 24);
      if (index === 0) initial = stored(f.store); else secondInitial = stored(f.store);
      const before = new Map([...f.model._active.values()].flatMap(row => row.deepBenthicAgents).map(a => [a.id, clone(a.position)]));
      const offscreen = [...f.store.records].filter(([, row]) => !f.model._active.has(row.id)).map(([id, row]) => [id, clone(row)]);
      for (const row of f.model._active.values()) {
        assert.equal(row.sim.timeSec, 0); assert.equal(row.sim._ticks, 0); assert.equal(row.deepBenthicLifeVersion, 1);
        assert.equal(row.deepBenthicLifeInitializedAtSec, 0); assert.equal(row.deepBenthicLife.lastTickSec, 0);
        assert.equal(row.sim.ledger.input, 0); assert.equal(row.sim.ledger.ingested, 0); assert.equal(row.deepBenthicLife.counters.consumedUnits, 0);
        row.deepBenthicAgents.forEach(a => union.add(a.speciesId));
        owners.push({ id: row.id, totalAnimalRecordCount: allAnimals(row).length, initialFoodByPool: clone(row.sim.resources),
          sourceDepthM: f.generator.sample((row.cx + .5) * 64, (row.cz + .5) * 64).depthM,
          newAgents: row.deepBenthicAgents.map(a => ({ id: a.id, speciesId: a.speciesId, taxonomicLevel: a.taxonomicLevel,
            sizeM: a.sizeM, sizeMeasure: deepBenthicLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
            actualSupportDepthM: f.generator.surfaceY - a.position.y, actualSubstrate: f.generator.supportAt(a.position.x, a.position.z).substrate,
            foodPatchId: a.deepBenthicFoodPatchId, pool: a.nutritionPool })) });
      }
      f.model.step(24, environment); assert.equal(await f.model.checkpoint(), true); bounded(f);
      const bites = [];
      for (const row of f.model._active.values()) for (const agent of row.deepBenthicAgents) {
        assert.equal(agent.timeSec, row.sim.timeSec);
        if (agent.lastBenthicIntake) {
          const bite = agent.lastBenthicIntake; fed.add(agent.speciesId); close(bite.stockBefore - bite.stockAfter - bite.removedUnits, 'actual stock debit');
          assert.ok(bite.contactDistanceM <= bite.allowedDistanceM + 1e-10); assert.equal(bite.pool, DEEP_BENTHIC_LIFE_MODEL.traits[agent.speciesId].pool);
          const patch = (bite.pool === 'surfaceDetritus' ? row.sim.surfacePatches : row.sim.benthicPatches).find(p => p.id === bite.patchId);
          assert.ok(patch); assert.deepEqual(bite.foodPosition, patch.position);
          bites.push({ speciesId: agent.speciesId, owner: row.id, ...clone(bite) });
        }
        const old = before.get(agent.id), gap = Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z);
        if (gap > 1e-8) moved.add(agent.speciesId);
        assert.ok(gap <= DEEP_BENTHIC_LIFE_MODEL.traits[agent.speciesId].speedMps * 24 + 1e-8, 'native speed budget');
      }
      for (const [id, row] of offscreen) assert.deepEqual(f.store.records.get(id), row, 'offscreen clocks, inventory and history freeze');
      windowActivity.push({ point, observedSec: 24, activeOwnerCount: f.model._active.size,
        sourceOwnerCount: f.generator.seascapeRegistryStats().size, newAnimalRecordCount: before.size,
        movedNewAnimals: [...f.model._active.values()].flatMap(row => row.deepBenthicAgents).filter(a => {
          const p = before.get(a.id); return Math.hypot(a.position.x - p.x, a.position.y - p.y, a.position.z - p.z) > 1e-8;
        }).length,
        fedNewAnimals: bites.length, actualNewConsumedUnits: [...f.model._active.values()].reduce((n, row) => n + row.deepBenthicLife.counters.consumedUnits, 0),
        owners: [...f.model._active.values()].map(row => ({ id: row.id, finalFoodByPool: clone(row.sim.resources),
          foodLedger: clone(row.sim.ledger), nativeConditionLedger: clone(row.sim.energyLedger), predatorConditionLedger: clone(row.predatorEnergyLedger),
          newConditionLedger: clone(row.deepBenthicEnergyLedger), balanceErrors: balances(row) })), bites });
      if (index === 0) firstFinal = records(f.model);
    }
    return { initial, firstFinal, secondInitial, windows, union: [...union], fed: [...fed], moved: [...moved], owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary deep windows admit deterministic whole soft-bottom animals, move and debit original local stocks with three condition ledgers', async () => {
  const actual = await sample(), { initial, firstFinal, secondInitial, ...evidence } = actual;
  assert.deepEqual(new Set(actual.union), new Set(DEEP_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.fed), new Set(DEEP_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.moved), new Set(DEEP_BENTHIC_LIFE_IDS));
  assert.ok(actual.owners.some(row => row.newAgents.length < 4), 'physical admission does not force every species in every owner');
  assert.ok(actual.owners.some(row => row.newAgents.length === 0), 'complete empty new categories are real saved owners');
  const repeated = fixture(); assert.equal(await repeated.model.update(opening), true); assert.deepEqual(stored(repeated.store), initial);
  repeated.model.step(24, environment); bounded(repeated); assert.deepEqual(records(repeated.model), firstFinal, 'native motion, intake and all fields are deterministic');
  const control = fixture(new MemoryStore(), false); assert.equal(await control.model.update(opening), true);
  for (const row of records(control.model)) {
    const birth = initial.find(([, item]) => item.id === row.id)?.[1]; assert.ok(birth);
    assert.deepEqual(birth.state, row.state, 'new relative-condition animals leave original RNG, animals, clocks and initial food exact');
    for (const key of ['predatorAgents', 'predatorEnergyLedger', 'predatorCounters', 'predatorEvents']) assert.deepEqual(birth[key], row[key]);
  }
  if (process.env.DEEP_BENTHIC_LIFE_RECEIPT) await writeFile(process.env.DEEP_BENTHIC_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'CPU actual native generation, whole support, existing food debits and persisted records; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalLimit: 4,
      sourceSpecies: deepBenthicLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, identityLevel: s.identityLevel, measure: s.sizeMeasure })),
      ...evidence }, null, 2)}\n`);
});

test('new death clocks, complete empty predators and new categories survive unload, revisit and cold restore without refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.equal(await f.model.update(opening), true);
  f.model.step(.4, environment);
  const row = [...f.model._active.values()].find(r => r.deepBenthicAgents.some(a => a.alive) && r.predatorAgents.length === 0); assert.ok(row);
  const deadId = killActual(row), newIds = row.deepBenthicAgents.map(a => a.id);
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'deep-bottom-death'], retained: 17 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [2, 9] } };
  assert.equal(await f.model.checkpoint(), true); bounded(f); const before = records(f.model), ids = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(ids.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id); assert.deepEqual(restored.deepBenthicAgents.map(a => a.id), newIds);
  assert.deepEqual(restored.predatorAgents, []); assert.equal(restored.predatorCommunityVersion, row.predatorCommunityVersion);
  const disk = stored(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(stored(f.store), disk);
  const dead = clone(restored.deepBenthicAgents.find(a => a.id === deadId)); cold.model.step(.1, environment);
  assert.deepEqual(restored.deepBenthicAgents.find(a => a.id === deadId), dead);
  assert.equal(cold.model.agents.find(a => a.id === deadId).timeSec, dead.timeSec);
  const snapshot = cold.model.snapshot(); assert.equal(snapshot.agents.find(a => a.id === deadId).timeSec, dead.timeSec);
  assert.equal(snapshot.regions.find(r => r.id === row.id).deepBenthicAgents.find(a => a.id === deadId).timeSec, dead.timeSec);
  const emptyCold = fixture(fromRecords(data.secondInitial)); assert.equal(await emptyCold.model.update(windows[1]), true); bounded(emptyCold);
  const actualEmpty = data.secondInitial.find(([, r]) => ownerWindow(windows[1]).has(r.id) && r.deepBenthicAgents.length === 0)?.[1]; assert.ok(actualEmpty);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(actualEmpty.id)), actualEmpty, 'actual complete empty new category restores exactly');
});

test('enabling the package on old saved complete communities preserves original history and next ordinary native steps exactly', async () => {
  const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(opening), true); old.model.step(.4, environment);
  const row = [...old.model._active.values()].find(r => r.sim.agents.some(a => a.alive)); killActual(row, false);
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { originalCommunity: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [11, 4] } };
  assert.equal(await old.model.checkpoint(), true); const saved = stored(old.store), enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.deepBenthicLifeVersion === undefined));
  for (const dt of [.1, .2]) { enabled.model.step(dt, environment); disabled.model.step(dt, environment); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic new births reveal no new actors, saved records or scenery revision before a complete commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.deepBenthicLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('new deep records were not offered atomically'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(offered.length, 9);
    for (const [, row] of offered) { assert.equal(row.state.timeSec, 0); assert.equal(row.deepBenthicLifeVersion, 1);
      assert.equal(row.deepBenthicLifeInitializedAtSec, 0); }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.generator.seascapeRevision, 0);
    assert.equal(failed.records.size, 0); assert.equal(failed.batches.length, 0);
  }
});

test('undefined and thrown historical reads never become strict-null fresh deep births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('deep historical owner unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false); assert.equal(f.model._active.size, 0);
    assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('partial and reserved markers, stocks, taxonomy and actual offscreen prefetched history corruptions reject without publication', async () => {
  const { initial } = await sample(), desired = ownerWindow(opening);
  for (const damage of ['descriptor', 'version', 'individual', 'food', 'taxonomy', 'reserved']) {
    const store = fromRecords(initial), f = fixture(store), [, row] = [...store.records].find(([, r]) => desired.has(r.id) && r.deepBenthicAgents.length);
    if (damage === 'descriptor') delete row.deepBenthicLife;
    if (damage === 'version') delete row.deepBenthicLifeVersion;
    if (damage === 'individual') delete row.deepBenthicAgents[0].deepBenthicIndividualVersion;
    if (damage === 'food') row.state.surfacePatches[0].surfaceDetritus += .1;
    if (damage === 'taxonomy') row.deepBenthicAgents.find(a => a.taxonomicLevel === 'genus').taxonomicLevel = 'species';
    if (damage === 'reserved') { for (const key of Object.keys(row).filter(k => k.startsWith('deepBenthic'))) delete row[key]; row.deepBenthicReservedFuture = 1; }
    const before = stored(store); assert.equal(await f.model.update(opening), false, damage); assert.deepEqual(stored(store), before);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.length <= 24);
  }
  // Real old native records from a nearby nine-owner window supply the
  // prefetched halo. These owners are outside the desired public window.
  const historical = fixture(new MemoryStore(), false); assert.equal(await historical.model.update(at(138, 6)), true);
  const halo = stored(historical.store).find(([, r]) => r.id === '139,6'); assert.ok(halo && !desired.has(halo[1].id));
  const markedHistory = fixture(); assert.equal(await markedHistory.model.update(at(138, 6)), true);
  const markedHalo = stored(markedHistory.store).find(([, r]) => r.id === '139,6');
  assert.ok(markedHalo && markedHalo[1].deepBenthicAgents.some(a => a.taxonomicLevel === 'genus'));
  for (const damage of ['top-prefix', 'individual-prefix', 'stock', 'taxonomy']) {
    const source = ['stock', 'taxonomy'].includes(damage) ? markedHalo : halo;
    const store = fromRecords(initial); store.records.set(source[0], clone(source[1])); const row = store.records.get(source[0]), f = fixture(store);
    if (damage === 'top-prefix') row.deepBenthicReservedFuture = 1;
    if (damage === 'individual-prefix') row.state.agents[0].deepBenthicReservedFuture = 1;
    if (damage === 'stock') row.state.surfacePatches[0].surfaceDetritus += .1;
    if (damage === 'taxonomy') row.deepBenthicAgents.find(a => a.taxonomicLevel === 'genus').taxonomicLevel = 'species';
    const before = stored(store); assert.equal(await f.model.update(opening), false, `offscreen ${damage}`);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.seascapeRevision, 0); assert.ok(store.reads.includes('139,6')); assert.ok(store.reads.length <= 24);
  }
});
