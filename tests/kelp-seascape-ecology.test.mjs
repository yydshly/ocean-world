import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KELP_SEASCAPE_OWNERS } from '../src/kelpSeascape.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';

const SEED = '42', OPENING = { x: 416, z: -96 }, V1 = { x: -352, z: -96 }, FAR = { x: -2400, z: 1600 };
const clone = value => structuredClone(value);
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const allAnimals = row => row.sim.agents.filter(a => a.speciesId !== 'giant-kelp').concat(row.waterAgents, row.visitorAgents);
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const receipt = { scope: 'finite CPU actual-record, shared-support and persistence evidence; no browser or visual acceptance',
  seed: SEED, group: { cx: 6, cz: -2, widthM: 384, depthM: 128, ownerIds: KELP_SEASCAPE_OWNERS } };

class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeCommit = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'throw') throw new Error('whole kelp seascape save rejected');
    if (this.refusal === 'null') return null;
    const offered = clone(entries);
    if (await this.beforeCommit?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture({ store = new MemoryStore(), seascape = true, forestBelt = true } = {}) {
  const generator = createKelpOceanGenerator(SEED, { forestBelt, kelpSeascape: seascape });
  const model = new KelpOceanEcology(SEED, generator, { store, visitors: true, understory: true, forestBelt, kelpSeascape: seascape });
  return { generator, model, store };
}
function groupRows(f) { return KELP_SEASCAPE_OWNERS.map(id => clone(f.store.records.get(`${f.model._world}|${id}`))); }
function bounded(f) {
  assert.ok(f.model._active.size <= 9);
  if (f.generator.forestBeltRegistryStats) assert.ok(f.generator.forestBeltRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'dead and visiting animals occupy the same cap');
    assert.ok(row.sim.hostById.size <= 3, 'scene roots do not become unbounded simulated plants');
    near(row.sim.metrics.resourceBudgetError, 0, 'actual complete food ledger');
    near(kelpDriftBalanceError(row), 0, 'actual shed-food ledger');
  }
}
function killActual(row) {
  const animal = allAnimals(row).find(a => a.alive && Number.isFinite(a.energy)); assert.ok(animal);
  animal.alive = false; animal.state = 'dead'; animal.energy = 0; animal.velocity = { x: 0, y: 0, z: 0 };
  row.sim.counters.deathCount++; return animal.id;
}

let initialPromise;
async function initialRecords() {
  initialPromise ??= (async () => {
    const f = fixture(); assert.equal(await f.model.update(OPENING), true);
    const rows = groupRows(f); assert.equal(rows.length, 12);
    assert.ok(rows.every(row => row?.forestBeltVersion === 2 && row.kelpSeascapeVersion === 1));
    const batches = f.store.batches.filter(batch => batch.some(([, row]) => row.forestBeltVersion === 2));
    assert.equal(batches.length, 1);
    assert.deepEqual(new Set(batches[0].filter(([, row]) => row.forestBeltVersion === 2).map(([id]) => id)), new Set(KELP_SEASCAPE_OWNERS));
    assert.equal(f.store.reads.length, 24, 'the real entrance reaches the 16+12-4 complete read bound'); bounded(f);
    return stored(f.store);
  })();
  return clone(await initialPromise);
}

test('one complete sample admits real hard-bottom roots, existing life and actual food once; offscreen births freeze', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) }); assert.equal(await f.model.update(OPENING), true);
  const rows = groupRows(f), base = f.generator.baseGenerator, speciesCounts = {};
  let roots = 0, addedRoots = 0, simulatedPlants = 0, understory = 0, initialFood = 0;
  for (const row of rows) {
    assert.equal(row.forestBeltPlan.version, 2); assert.equal(row.forestBeltPlan.group.widthM, 384);
    assert.equal(row.forestBeltPlan.group.depthM, 128); assert.deepEqual(row.forestBeltPlan.group.ownerIds, KELP_SEASCAPE_OWNERS);
    assert.equal(row.kelpSeascapeGroupId, '6,-2'); assert.equal(row.kelpSeascapeInitializedAtSec, 0);
    assert.equal(row.state.timeSec, 0); assert.equal(row.state._ticks, 0);
    assert.equal(row.state.ledger.input, 0); assert.equal(row.state.ledger.ingested, 0);
    const chunk = f.generator.chunk(row.cx, row.cz), original = base.chunk(row.cx, row.cz);
    assert.deepEqual(chunk.elements.slice(0, original.elements.length), original.elements, 'all native rocks and roots retain order and descriptors');
    const byId = new Map(chunk.elements.map(e => [e.id, e])); roots += chunk.counts.kelp;
    for (const id of row.forestBeltPlan.addedRootIds) {
      const root = byId.get(id), host = byId.get(root?.hostId); assert.equal(root?.kind, 'kelp'); assert.equal(host?.kind, 'rock');
      const support = f.generator.supportAt(root.x, root.z);
      assert.equal(support.elementId, host.id); near(root.y, support.height, 'actual existing hard-cap holdfast');
      assert.ok(root.lengthM > 0 && root.y + root.lengthM < f.generator.surfaceY); addedRoots++;
    }
    simulatedPlants += row.state.agents.filter(a => a.speciesId === 'giant-kelp').length;
    understory += row.understoryPlants?.length ?? 0; initialFood += row.state.ledger.initial;
    for (const a of row.state.agents.filter(a => a.speciesId !== 'giant-kelp').concat(row.waterAgents ?? [], row.visitorAgents ?? []))
      speciesCounts[a.speciesId] = (speciesCounts[a.speciesId] ?? 0) + 1;
  }
  assert.ok(addedRoots > 0 && roots > addedRoots && simulatedPlants > 0 && understory > 0 && initialFood > 0);
  assert.ok(speciesCounts['purple-urchin'] > 0 && speciesCounts['brown-turban-snail'] > 0 && speciesCounts['giant-kelpfish'] > 0);
  const offscreen = rows.filter(row => !f.model._active.has(row.id)), before = new Map([...f.model._active.values()]
    .flatMap(allAnimals).map(a => [a.id, clone(a.position)]));
  assert.ok(offscreen.length > 0);
  const ingestedBefore = [...f.model._active.values()].reduce((n, row) => n + row.sim.ledger.ingested, 0);
  f.model.step(2, { currentMps: .18, foodSupply: 0, hour: 12 }); await f.model.checkpoint(); bounded(f);
  const moved = [...f.model._active.values()].flatMap(allAnimals).filter(a => before.has(a.id) &&
    ['x', 'y', 'z'].some(axis => Math.abs(a.position[axis] - before.get(a.id)[axis]) > 1e-8)).length;
  const ingested = [...f.model._active.values()].reduce((n, row) => n + row.sim.ledger.ingested, 0) - ingestedBefore;
  assert.ok(moved > 0 && ingested > 0, 'ordinary agents move and debit actual food inventory');
  for (const row of offscreen) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row);
  Object.assign(receipt, { groupOwnerCount: 12, groupStreamedRoots: roots, groupAddedRoots: addedRoots,
    groupSimulatedPlants: simulatedPlants, groupUnderstoryPlants: understory, groupAnimalSpecies: speciesCounts,
    groupInitialFoodUnits: initialFood, activeOwnerCount: f.model._active.size,
    sourceOwnerCount: f.generator.forestBeltRegistryStats().size, observedSec: 2, activeMovedAnimals: moved, activeIngestedUnits: ingested,
    maxFoodBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(row.sim.metrics.resourceBudgetError))),
    maxDriftBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(kelpDriftBalanceError(row)))) });
});

test('pending and superseded saves publish no portion of the sample and preserve complete durable births for later restoration', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeCommit = async rows => {
    if (offered || !rows.some(([, row]) => row.forestBeltVersion === 2)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture({ store }), pending = f.model.update(OPENING); let next;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('full kelp sample was not offered'); })]);
    assert.equal(f.generator.forestBeltRevision, 0); assert.equal(f.model._active.size, 0);
    assert.equal(offered.filter(([, row]) => row.forestBeltVersion === 2).length, 12);
    for (const [id, row] of offered) {
      assert.equal(store.records.has(`${f.model._world}|${id}`), false);
      assert.equal(f.generator.forestBeltPlan(row.cx, row.cz), undefined);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz).elements, f.generator.baseGenerator.chunk(row.cx, row.cz).elements);
    }
    next = f.model.update(FAR);
  } finally { permit.resolve(); await pending; if (next) await next; }
  for (const [id, row] of offered) { assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row); assert.equal(f.model._active.has(id), false); }
  assert.equal(await f.model.update(OPENING), true);
  for (const [id, row] of offered) if (f.model._active.has(id)) assert.deepEqual(f.model._record(f.model._active.get(id)), row);
  assert.equal(store.batches.filter(rows => rows.some(([, row]) => row.forestBeltVersion === 2)).length, 1, 'durable group is restored without a second admission');
  bounded(f);
});

test('null or thrown commits and undefined or thrown reads refuse admission rather than rebirthing owners', async () => {
  for (const refusal of ['null', 'throw']) {
    const store = new MemoryStore(); store.refusal = refusal;
    const f = fixture({ store }); assert.equal(await f.model.update(OPENING), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.forestBeltRevision, 0); assert.equal(store.records.size, 0);
    store.refusal = null; assert.equal(await f.model.update(OPENING), true);
    assert.ok(groupRows(f).every(row => row?.forestBeltVersion === 2)); bounded(f);
  }
  for (const failedRead of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => {
      if (failedRead === 'throw') throw new Error('complete kelp record could not be read');
      return undefined;
    };
    const f = fixture({ store }); assert.equal(await f.model.update(OPENING), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.forestBeltRevision, 0); assert.equal(store.records.size, 0);
  }
});

test('one legacy member declines the new group; existing v1 full records, deaths and next ordinary steps remain exact', async () => {
  const legacy = fixture({ seascape: false, forestBelt: false }); assert.equal(await legacy.model.update(OPENING), true);
  const owner = legacy.model._active.get('6,-2'), deadId = killActual(owner);
  owner._savedRecord = { ...owner._savedRecord, opaqueHistory: { notes: ['stable'], bytes: [2, 7] } };
  owner._savedState = { ...owner._savedState, opaqueLifeHistory: { value: 14 } };
  const before = legacy.model._record(owner), store = new MemoryStore(); store.records.set(`${legacy.model._world}|6,-2`, clone(before));
  const f = fixture({ store }); assert.equal(await f.model.update(OPENING), true);
  assert.deepEqual(f.model._record(f.model._active.get('6,-2')), before);
  assert.deepEqual(store.records.get(`${f.model._world}|6,-2`), before);
  assert.equal(allAnimals(f.model._active.get('6,-2')).find(a => a.id === deadId).alive, false);
  assert.ok(groupRows(f).every(row => row?.forestBeltVersion !== 2)); bounded(f);
  const old = fixture({ seascape: false }); assert.equal(await old.model.update(V1), true);
  assert.ok(records(old.model).some(row => row.forestBeltVersion === 1));
  old.model.step(.4, { currentMps: .18, foodSupply: 0, hour: 12 }); await old.model.checkpoint();
  const enabled = fixture({ store: fromRecords(stored(old.store)) }); assert.equal(await enabled.model.update(V1), true);
  assert.deepEqual(records(enabled.model), records(old.model));
  for (const dt of [.1, .2]) { old.model.step(dt, { currentMps: .18, foodSupply: 0, hour: 12 }); enabled.model.step(dt, { currentMps: .18, foodSupply: 0, hour: 12 }); }
  assert.deepEqual(records(enabled.model), records(old.model)); bounded(enabled);
});

test('all nine unload, revisit and cold restore exact whole records, deaths, clocks and inventories without refill', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) }); assert.equal(await f.model.update(OPENING), true);
  f.model.step(.4, { foodSupply: 0 }); const row = f.model._active.get('6,-2'), deadId = killActual(row);
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { marker: 'preserved' } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { value: [3, 1] } };
  await f.model.checkpoint(); const before = records(f.model), oldIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(FAR), true); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(OPENING), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture({ store: f.store }); assert.equal(await cold.model.update(OPENING), true);
  assert.deepEqual(records(cold.model), before); assert.equal(allAnimals(cold.model._active.get('6,-2')).find(a => a.id === deadId).alive, false);
  bounded(cold); const full = stored(f.store);
  assert.equal(await cold.model.update(OPENING), true); assert.deepEqual(records(cold.model), before);
  assert.deepEqual(stored(f.store), full, 'same-entry no-op neither saves nor changes stocks');
});

test('offscreen missing members, stripped markers or plans and corrupt food reject the complete sample before publication', async () => {
  const initial = await initialRecords();
  for (const damage of ['missing', 'plan', 'all-plans', 'marker', 'version', 'group', 'food']) {
    const store = fromRecords(initial), f = fixture({ store }), key = `${f.model._world}|11,-1`, row = store.records.get(key);
    if (damage === 'missing') store.records.delete(key);
    else if (damage === 'plan') delete row.forestBeltPlan;
    else if (damage === 'all-plans') for (const id of KELP_SEASCAPE_OWNERS) delete store.records.get(`${f.model._world}|${id}`).forestBeltPlan;
    else if (damage === 'marker') delete row.kelpSeascapeGroupId;
    else if (damage === 'version') row.forestBeltVersion = 1;
    else if (damage === 'group') row.forestBeltPlan.group.cx += 6;
    else {
      const patch = row.state.rockPatches[0] ?? row.state.floorPatches[0]; assert.ok(patch);
      patch.detritus += .125;
    }
    const before = stored(store); assert.equal(await f.model.update(OPENING), false);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.ok(store.reads.length <= 24);
  }
});

test('actual whole-sample and distant exploration windows stay within 24 reads, 25 sources, nine active owners and shared caps', async () => {
  const f = fixture({ store: fromRecords(await initialRecords()) });
  const transitions = [];
  for (const point of [OPENING, { x: 544, z: -96 }, { x: 736, z: -32 }, FAR, OPENING]) {
    f.store.reads.length = 0; assert.equal(await f.model.update(point), true); bounded(f);
    assert.ok(f.store.reads.length <= 24); assert.equal(f.store.reads.length, new Set(f.store.reads).size);
    transitions.push({ ...point, diskReads: f.store.reads.length, sourceOwners: f.generator.forestBeltRegistryStats().size,
      activeOwners: f.model._active.size });
  }
  receipt.transitions = transitions;
});

after(() => { if (process.env.KELP_SEASCAPE_RECEIPT) writeFileSync(process.env.KELP_SEASCAPE_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`); });
