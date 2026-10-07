import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { predatorEnergyBudgetError } from '../src/deepPredatorEcology.js';
import { DEEP_WHOLE_SEASCAPE_ANCHOR as GROUP, DEEP_WHOLE_SEASCAPE_OWNERS as OWNERS } from '../src/deepWholeSeascape.js';

const SEED = '42', OPENING = { x: (GROUP.cx + .5) * 64, z: (GROUP.cz + .5) * 64 };
const V1 = { x: -352, z: -608 }, FAR = { x: -2400, z: 1600 };
const clone = value => structuredClone(value);
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? []);
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const receipt = { scope: 'finite CPU actual-record, shared-support and persistence evidence; no browser or visual acceptance',
  seed: SEED, group: { ...GROUP, widthM: 384, depthM: 128, ownerIds: OWNERS } };

class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeCommit = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'throw') throw new Error('whole deep seascape save rejected');
    if (this.refusal === 'null') return null;
    const offered = clone(entries);
    if (await this.beforeCommit?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture({ store = new MemoryStore(), whole = true, seascape = true } = {}) {
  const generator = createDeepOceanGenerator(SEED, { seascape, wholeSeascape: whole });
  const model = new DeepOceanEcology(SEED, generator, { store, seascape, wholeSeascape: whole });
  return { generator, model, store };
}
function groupRows(f) { return OWNERS.map(id => clone(f.store.records.get(`${f.model._world}|${id}`))); }
function bounded(f) {
  assert.ok(f.model._active.size <= 9);
  if (f.generator.seascapeRegistryStats) assert.ok(f.generator.seascapeRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'native, visiting and dead animal records share capacity');
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    near(row.sim.metrics.resourceBudgetError, 0, 'complete actual food ledger');
    near(row.sim.metrics.energyBudgetError, 0, 'native condition ledger');
    near(predatorEnergyBudgetError(row), 0, 'predator condition ledger');
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
  }
}
function markActualDeath(row) {
  const animal = row.sim.agents.find(a => a.alive); assert.ok(animal);
  // The retained condition index stays in the original energy ledger. Death
  // does not fabricate a new transfer or erase its recorded condition.
  animal.alive = false; animal.state = 'dead'; row.sim.counters.deathCount++; return animal.id;
}
function actualSupport(f, region) {
  for (const animal of region.sim.agents.filter(a => a.alive)) {
    const floor = f.generator.heightAt(animal.position.x, animal.position.z);
    if (animal.speciesId === 'rattail-family') {
      near(animal.position.y, region.sim._fishFloor(animal), 'real fish body clearance');
      assert.ok(animal.position.y >= floor + .03 - 1e-8);
    } else near(animal.position.y, floor, 'real benthic support');
    if (animal.speciesId === 'pom-pom-anemone') assert.deepEqual(animal.position, animal.anchor);
    if (animal.speciesId === 'sea-pig-group') {
      const c = Math.cos(animal.heading), s = Math.sin(animal.heading);
      for (const foot of animal.contactPointsLocal) near(animal.position.y + foot.y * animal.sizeM,
        f.generator.heightAt(animal.position.x + animal.sizeM * (foot.x * c - foot.z * s),
          animal.position.z + animal.sizeM * (foot.x * s + foot.z * c)), 'actual sea-pig foot support');
    }
  }
  for (const name of ['surfacePatches', 'benthicPatches']) for (const patch of region.sim[name])
    near(patch.position.y, f.generator.heightAt(patch.position.x, patch.position.z), 'actual sediment food patch');
}

let initialPromise;
async function initialRecords() {
  initialPromise ??= (async () => {
    const f = fixture(); assert.equal(await f.model.update(OPENING), true);
    const rows = groupRows(f); assert.equal(rows.length, 12);
    assert.ok(rows.every(row => row?.seascapeVersion === 2 && row.wholeSeascapeVersion === 1));
    const batches = f.store.batches.filter(batch => batch.some(([, row]) => row.seascapeVersion === 2));
    assert.equal(batches.length, 1);
    assert.deepEqual(new Set(batches[0].filter(([, row]) => row.seascapeVersion === 2).map(([id]) => id)), new Set(OWNERS));
    assert.equal(f.store.reads.length, 24, 'the real entrance reaches the 16+12-4 complete read bound'); bounded(f);
    return stored(f.store);
  })();
  return clone(await initialPromise);
}

test('one complete sample commits actual terrain, native communities and balanced food and condition once; offscreen births freeze', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) }); assert.equal(await f.model.update(OPENING), true);
  const rows = groupRows(f), base = f.generator.baseGenerator, species = {}, foodByPool = {};
  let rocks = 0, addedRocks = 0, rubble = 0, changedBedSamples = 0, initialFood = 0;
  for (const saved of rows) {
    const plan = saved.seascapePlan;
    assert.equal(plan.version, 2); assert.equal(plan.group.widthM, 384); assert.equal(plan.group.depthM, 128);
    assert.deepEqual(plan.group.ownerIds, OWNERS); assert.equal(saved.wholeSeascapeGroupId, `${GROUP.cx},${GROUP.cz}`);
    assert.equal(saved.wholeSeascapeInitializedAtSec, 0); assert.equal(saved.state.timeSec, 0); assert.equal(saved.state._ticks, 0);
    assert.equal(saved.state.ledger.input, 0); assert.equal(saved.state.ledger.ingested, 0);
    const chunk = f.generator.chunk(saved.cx, saved.cz), byId = new Map(chunk.elements.map(e => [e.id, e]));
    for (const old of base.chunk(saved.cx, saved.cz).elements.filter(e => e.kind === 'rock')) assert.deepEqual(byId.get(old.id), old, 'native hard supports remain complete');
    for (const id of plan.addedRockIds) {
      const rock = byId.get(id); assert.equal(rock?.kind, 'rock');
      const support = f.generator.supportAt(rock.x, rock.z); assert.equal(support.elementId, rock.id); assert.equal(support.substrate, 'rock'); addedRocks++;
    }
    rocks += chunk.elements.filter(e => e.kind === 'rock').length; rubble += chunk.elements.filter(e => e.kind === 'rubble').length;
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const x = saved.cx * 64 + ix * 8 + .37, z = saved.cz * 64 + iz * 8 + .21;
      const x0 = Math.floor(x), z0 = Math.floor(z), a = f.generator.floorVertex(x0, z0), b = f.generator.floorVertex(x0 + 1, z0), c = f.generator.floorVertex(x0, z0 + 1);
      near(f.generator.floorSurface(x, z).height, a + (b - a) * (x - x0) + (c - a) * (z - z0), 'actual persisted Float32 sea-bed triangle');
      if (Math.abs(f.generator.floorSurface(x, z).height - base.floorSurface(x, z).height) > 1e-6) changedBedSamples++;
    }
    const restored = f.model._restore(saved, saved.cx, saved.cz); actualSupport(f, restored);
    for (const a of allAnimals(restored)) species[a.speciesId] = (species[a.speciesId] ?? 0) + 1;
    initialFood += saved.state.ledger.initial;
    for (const [pool, amount] of Object.entries(restored.sim.resources)) foodByPool[pool] = (foodByPool[pool] ?? 0) + amount;
  }
  assert.ok(rocks > 0 && addedRocks > 0 && rubble > 0 && changedBedSamples > 0 && initialFood > 0);
  for (const id of ['sea-pig-group', 'rattail-family', 'pom-pom-anemone']) assert.ok(species[id] > 0, `${id} is an actual saved resident`);
  for (const stock of Object.values(foodByPool)) assert.ok(stock > 0);
  const offscreen = rows.filter(row => !f.model._active.has(row.id)), before = new Map(f.model.agents.map(a => [a.id, clone(a.position)]));
  const ingestedBefore = [...f.model._active.values()].reduce((n, row) => n + row.sim.ledger.ingested, 0);
  f.model.step(3, { currentMps: .06, foodSupply: 0, observerLight: 0 }); await f.model.checkpoint(); bounded(f);
  for (const row of f.model._active.values()) actualSupport(f, row);
  const moved = f.model.agents.filter(a => before.has(a.id) && ['x', 'y', 'z'].some(axis => Math.abs(a.position[axis] - before.get(a.id)[axis]) > 1e-8)).length;
  const ingested = [...f.model._active.values()].reduce((n, row) => n + row.sim.ledger.ingested, 0) - ingestedBefore;
  const feeding = [...f.model._active.values()].flatMap(row => row.sim.events.filter(e => e.type === 'feeding'));
  assert.ok(moved > 0 && ingested > 0 && feeding.length > 0, 'ordinary actual movement and reachable intake debit stock');
  for (const event of feeding) assert.ok(event.actualIntake > 0 && event.feedDistanceM <= event.allowedDistanceM + 1e-10);
  assert.ok(offscreen.length > 0); for (const row of offscreen) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row);
  Object.assign(receipt, { groupOwnerCount: 12, groupSpeciesCounts: species, groupRocks: rocks, groupAddedRocks: addedRocks,
    groupRubble: rubble, changedBedSamples, groupInitialFoodUnits: initialFood, groupInitialFoodByPool: foodByPool,
    activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.seascapeRegistryStats().size,
    observedSec: 3, activeMovedAnimals: moved, activeIngestedUnits: ingested, activeFeedingEvents: feeding.length,
    maxFoodBalanceError: f.model.snapshot().metrics.balanceError, maxNativeEnergyBalanceError: f.model.snapshot().metrics.energyBalanceError,
    maxPredatorEnergyBalanceError: f.model.snapshot().metrics.predatorEnergyBalanceError });
});

test('pending and superseded full saves expose no candidate terrain or animals and restore exact durable births without a second admission', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeCommit = async rows => {
    if (offered || !rows.some(([, row]) => row.seascapeVersion === 2)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture({ store }), pending = f.model.update(OPENING); let next;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('full deep sample was not offered'); })]);
    assert.equal(f.generator.seascapeRevision, 0); assert.equal(f.model._active.size, 0);
    assert.equal(offered.filter(([, row]) => row.seascapeVersion === 2).length, 12);
    for (const [id, row] of offered) {
      assert.equal(store.records.has(`${f.model._world}|${id}`), false); assert.equal(f.generator.seascapePlan(row.cx, row.cz), undefined);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz), f.generator.baseGenerator.chunk(row.cx, row.cz));
    }
    next = f.model.update(FAR);
  } finally { permit.resolve(); await pending; if (next) await next; }
  for (const [id, row] of offered) { assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row); assert.equal(f.model._active.has(id), false); }
  assert.equal(await f.model.update(OPENING), true);
  for (const [id, row] of offered) if (f.model._active.has(id)) assert.deepEqual(f.model._record(f.model._active.get(id)), row);
  assert.equal(store.batches.filter(rows => rows.some(([, row]) => row.seascapeVersion === 2)).length, 1); bounded(f);
});

test('null or thrown commits and undefined or thrown reads never create partial terrain, populations or inventory', async () => {
  for (const refusal of ['null', 'throw']) {
    const store = new MemoryStore(); store.refusal = refusal;
    const f = fixture({ store }); assert.equal(await f.model.update(OPENING), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.seascapeRevision, 0); assert.equal(store.records.size, 0);
    store.refusal = null; assert.equal(await f.model.update(OPENING), true);
    assert.ok(groupRows(f).every(row => row?.seascapeVersion === 2)); bounded(f);
  }
  for (const failedRead of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failedRead === 'throw') throw new Error('deep record unreadable'); return undefined; };
    const f = fixture({ store }); assert.equal(await f.model.update(OPENING), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.seascapeRevision, 0); assert.equal(store.records.size, 0);
  }
});

test('one legacy member declines the whole package, and complete v1 deaths, history and next steps remain exact', async () => {
  const legacy = fixture({ whole: false, seascape: false }); assert.equal(await legacy.model.update(OPENING), true);
  const owner = legacy.model._active.get(OWNERS[0]), deadId = markActualDeath(owner);
  owner._savedRecord = { ...owner._savedRecord, opaqueHistory: { notes: ['stable'], bytes: [2, 7] } };
  owner._savedState = { ...owner._savedState, opaqueLifeHistory: { value: 14 } };
  const before = legacy.model._record(owner), store = new MemoryStore(); store.records.set(`${legacy.model._world}|${owner.id}`, clone(before));
  const f = fixture({ store }); assert.equal(await f.model.update(OPENING), true);
  assert.deepEqual(f.model._record(f.model._active.get(owner.id)), before); assert.deepEqual(store.records.get(`${f.model._world}|${owner.id}`), before);
  assert.equal(allAnimals(f.model._active.get(owner.id)).find(a => a.id === deadId).alive, false);
  assert.ok(groupRows(f).every(row => row?.seascapeVersion !== 2)); bounded(f);
  const old = fixture({ whole: false }); assert.equal(await old.model.update(V1), true);
  assert.ok(records(old.model).some(row => row.seascapeVersion === 1));
  old.model.step(.4, { currentMps: .06, foodSupply: 0 }); await old.model.checkpoint();
  const enabled = fixture({ store: fromRecords(stored(old.store)) }); assert.equal(await enabled.model.update(V1), true);
  assert.deepEqual(records(enabled.model), records(old.model));
  for (const dt of [.1, .2]) { old.model.step(dt, { currentMps: .06, foodSupply: 0 }); enabled.model.step(dt, { currentMps: .06, foodSupply: 0 }); }
  assert.deepEqual(records(enabled.model), records(old.model)); bounded(enabled);
});

test('all nine unload, revisit and cold restore complete deaths, history, clocks and stocks; same entry is an exact no-op', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) }); assert.equal(await f.model.update(OPENING), true);
  f.model.step(.4, { currentMps: .06, foodSupply: 0 }); const owner = f.model._active.get(OWNERS[0]), deadId = markActualDeath(owner);
  owner._savedRecord = { ...owner._savedRecord, opaqueHistory: { marker: 'retained' } };
  owner._savedState = { ...owner._savedState, opaqueLifeHistory: { value: [3, 1] } };
  await f.model.checkpoint(); const before = records(f.model), oldIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(FAR), true); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(OPENING), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture({ store: f.store }); assert.equal(await cold.model.update(OPENING), true);
  assert.deepEqual(records(cold.model), before); assert.equal(allAnimals(cold.model._active.get(owner.id)).find(a => a.id === deadId).alive, false); bounded(cold);
  const full = stored(f.store); assert.equal(await cold.model.update(OPENING), true);
  assert.deepEqual(records(cold.model), before); assert.deepEqual(stored(f.store), full);
});

test('offscreen missing members, stripped plans or markers and corrupt food, condition or deaths reject before publication', async () => {
  const initial = await initialRecords();
  for (const damage of ['missing', 'plan', 'all-plans', 'marker', 'version', 'group', 'food', 'energy', 'death']) {
    const store = fromRecords(initial), f = fixture({ store }), key = `${f.model._world}|${OWNERS.at(-1)}`, row = store.records.get(key);
    if (damage === 'missing') store.records.delete(key);
    else if (damage === 'plan') delete row.seascapePlan;
    else if (damage === 'all-plans') for (const id of OWNERS) delete store.records.get(`${f.model._world}|${id}`).seascapePlan;
    else if (damage === 'marker') delete row.wholeSeascapeGroupId;
    else if (damage === 'version') row.seascapeVersion = 1;
    else if (damage === 'group') row.seascapePlan.group.cx += 6;
    else if (damage === 'food') { const patch = row.state.surfacePatches[0]; assert.ok(patch); patch.surfaceDetritus += .125; }
    else if (damage === 'energy') row.state.energyLedger.initial += .125;
    else { assert.ok(row.state.agents[0]); row.state.agents[0].alive = 'dead'; }
    const before = stored(store); assert.equal(await f.model.update(OPENING), false);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.generator.seascapeRevision, 0);
    assert.ok(store.reads.length <= 24);
  }
});

test('normal whole-sample and distant windows preserve 24 reads, 25 sources, nine active owners and shared capacity', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) }), transitions = [];
  for (const point of [OPENING, { x: (GROUP.cx + 2.5) * 64, z: OPENING.z },
    { x: (GROUP.cx + 5.5) * 64, z: (GROUP.cz + 1.5) * 64 }, FAR, OPENING]) {
    f.store.reads.length = 0; assert.equal(await f.model.update(point), true); bounded(f);
    assert.ok(f.store.reads.length <= 24); assert.equal(f.store.reads.length, new Set(f.store.reads).size);
    transitions.push({ ...point, diskReads: f.store.reads.length, sourceOwners: f.generator.seascapeRegistryStats().size, activeOwners: f.model._active.size });
  }
  receipt.transitions = transitions;
});

after(() => { if (process.env.DEEP_WHOLE_SEASCAPE_RECEIPT) writeFileSync(process.env.DEEP_WHOLE_SEASCAPE_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`); });
