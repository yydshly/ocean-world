import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KELP_SURFACE_Y } from '../src/kelpHabitat.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';

const SEED = '42', GROUP = { cx: -6, cz: -2 };
const clone = value => structuredClone(value);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
const ownerIds = () => [0, 1].flatMap(dz => [0, 1].map(dx => `${GROUP.cx + dx},${GROUP.cz + dz}`));
const at = () => ({ x: (GROUP.cx + .5) * 64, z: (GROUP.cz + .5) * 64 });
const offscreenApproach = () => ({ x: (GROUP.cx + .5) * 64, z: (GROUP.cz - .5) * 64 });
const away = () => ({ x: (GROUP.cx + 12.5) * 64, z: (GROUP.cz - 10.5) * 64 });
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(row => model._record(row));
const allAnimals = row => row.sim.agents.filter(agent => agent.speciesId !== 'giant-kelp').concat(row.waterAgents, row.visitorAgents);
const savedGroup = fixture => ownerIds().map(id => clone(fixture.store.records.get(`${fixture.model._world}|${id}`)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const receipt = { scope: 'finite CPU model and persistence evidence; not a browser or visual acceptance', seed: SEED, group: GROUP };

class MemoryStore {
  available = true; records = new Map(); batches = []; beforeCommit = null; readFailure = null;
  async load(world, id) {
    if (this.readFailure === 'throw') throw new Error('Kelp forest read failed.');
    if (this.readFailure === 'undefined') return undefined;
    return clone(this.records.get(`${world}|${id}`) ?? null);
  }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    const offered = clone(entries); this.batches.push(offered);
    if (await this.beforeCommit?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next;
  }
}
function fixture({ store = new MemoryStore(), enabled = true } = {}) {
  const generator = createKelpOceanGenerator(SEED, { forestBelt: enabled });
  const model = new KelpOceanEcology(SEED, generator, { store, visitors: true, understory: true, forestBelt: enabled });
  return { store, generator, model };
}
function bounded(f) {
  assert.ok(f.model._active.size <= 9, 'loaded ecology window stays bounded');
  const stats = f.generator.forestBeltRegistryStats();
  assert.equal(stats.limit, 25); assert.ok(stats.size <= stats.limit);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'all animal records, including deaths, occupy the shared limit');
    assert.ok(row.sim.hostById.size <= 3, 'display roots do not add unbounded simulated plants');
    near(row.sim.metrics.resourceBudgetError, 0, `${row.id} complete food ledger`);
    near(kelpDriftBalanceError(row), 0, `${row.id} shed-food ledger`);
  }
  receipt.maximumActiveRegions = Math.max(receipt.maximumActiveRegions ?? 0, f.model._active.size);
  receipt.maximumRegistrySize = Math.max(receipt.maximumRegistrySize ?? 0, stats.size);
}
function completeGroup(f) {
  const rows = savedGroup(f);
  assert.ok(rows.every(Boolean), 'four complete ecological owners are durable');
  for (const row of rows) {
    assert.equal(row.forestBeltVersion, 1);
    assert.equal(row.forestBeltInitializedAtSec, 0);
    assert.equal(row.forestBeltPlan.version, 1);
    assert.equal(row.forestBeltPlan.id, row.id);
    assert.deepEqual(f.generator.forestBeltPlan(row.cx, row.cz), row.forestBeltPlan);
  }
  return rows;
}

test('default-disabled forest composition preserves complete saved kelp state and the next ordinary steps', async () => {
  const first = fixture({ enabled: false }); assert.equal(await first.model.update(at()), true);
  first.model.step(.4, { currentMps: .2, foodSupply: 0, hour: 12 }); await first.model.checkpoint();
  const before = records(first.model), second = fixture({ enabled: false, store: first.store });
  assert.equal(await second.model.update(at()), true);
  assert.deepEqual(records(second.model), before);
  for (const dt of [.1, .2]) {
    first.model.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 });
    second.model.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 });
  }
  assert.deepEqual(records(second.model), records(first.model));
  assert.ok(records(second.model).every(row => row.forestBeltVersion === undefined && row.forestBeltPlan === undefined));
});

test('one natural fresh forest group commits real high-canopy roots and existing ecological populations and food together', async () => {
  const f = fixture(); assert.equal(await f.model.update(at()), true);
  const rows = completeGroup(f), base = createKelpOceanGenerator(SEED);
  const batch = f.store.batches.filter(entries => entries.some(([, row]) => ownerIds().includes(row.id) && row.forestBeltVersion === 1));
  assert.equal(batch.length, 1);
  assert.deepEqual(new Set(batch[0].filter(([id]) => ownerIds().includes(id)).map(([id]) => id)), new Set(ownerIds()));
  let roots = 0, addedRoots = 0, plants = 0, understory = 0, inventory = 0;
  const speciesCounts = {}, addedLengths = [], addedCanopyHeights = [];
  for (const row of rows) {
    const chunk = f.generator.chunk(row.cx, row.cz), byId = new Map(chunk.elements.map(element => [element.id, element]));
    for (const old of base.chunk(row.cx, row.cz).elements) assert.deepEqual(byId.get(old.id), old, 'all native rocks and roots remain complete');
    const actualRoots = chunk.elements.filter(element => element.kind === 'kelp'); roots += actualRoots.length;
    for (const id of row.forestBeltPlan.addedRootIds) {
      const root = byId.get(id), host = byId.get(root?.hostId);
      assert.equal(root?.kind, 'kelp'); assert.equal(host?.kind, 'rock');
      assert.ok(root.lengthM > 0 && root.y + root.lengthM > KELP_SURFACE_Y - 3 && root.y + root.lengthM < KELP_SURFACE_Y);
      near(root.y, f.generator.supportAt(root.x, root.z).height, 'new actual hard-bottom root');
      addedLengths.push(root.lengthM); addedCanopyHeights.push(root.y + root.lengthM);
      addedRoots++;
    }
    assert.equal(row.state.timeSec, 0); assert.equal(row.state.ledger.input, 0);
    assert.equal(row.state.ledger.ingested, 0); assert.equal(row.state.totalPrimaryProduction, 0);
    inventory += row.state.ledger.initial;
    const live = f.model._active.get(row.id); assert.ok(live);
    understory += live.understoryPlants.length;
    for (const plant of live.sim.hostById.values()) {
      const root = byId.get(plant.sceneryId); assert.equal(root?.kind, 'kelp');
      near(plant.anchor.y, root.y, 'actual selected plant uses this committed root'); plants++;
    }
    for (const animal of allAnimals(live)) speciesCounts[animal.speciesId] = (speciesCounts[animal.speciesId] ?? 0) + 1;
  }
  assert.ok(addedRoots > 0 && roots >= addedRoots && plants > 0 && understory > 0 && inventory > 0);
  assert.ok(speciesCounts['purple-urchin'] > 0 && speciesCounts['brown-turban-snail'] > 0, 'existing ground and attached consumers live in the actual forest');
  const positions = new Map([...f.model._active.values()].flatMap(row => allAnimals(row)).map(agent => [agent.id, clone(agent.position)]));
  const ingestionBefore = [...f.model._active.values()].reduce((sum, row) => sum + row.sim.ledger.ingested, 0);
  f.model.step(2, { currentMps: .18, foodSupply: 0, hour: 12 });
  const moved = [...f.model._active.values()].flatMap(row => allAnimals(row)).filter(agent => positions.has(agent.id) &&
    ['x', 'y', 'z'].some(key => Math.abs(agent.position[key] - positions.get(agent.id)[key]) > 1e-8)).length;
  const ingestion = [...f.model._active.values()].reduce((sum, row) => sum + row.sim.ledger.ingested, 0) - ingestionBefore;
  assert.ok(moved > 0 && ingestion > 0, 'ordinary simulation produces genuine movement and stock-debited intake');
  bounded(f);
  Object.assign(receipt, { ownerIds: ownerIds(), streamedRoots: roots, addedRoots, simulatedPlants: plants, understoryPlants: understory, speciesCounts,
    addedRootLengthRangeM: [Math.min(...addedLengths), Math.max(...addedLengths)],
    addedCanopyHeightRangeM: [Math.min(...addedCanopyHeights), Math.max(...addedCanopyHeights)], surfaceY: KELP_SURFACE_Y,
    initialFoodUnits: inventory, simulatedSec: 2, movedAnimals: moved, ingestedUnits: ingestion,
    maximumFoodBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(row.sim.metrics.resourceBudgetError))),
    maximumDriftBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(kelpDriftBalanceError(row)))) });
});

test('one visited member prevents group replacement and preserves all its complete old state, deaths and opaque history', async () => {
  const old = fixture({ enabled: false }); assert.equal(await old.model.update(at()), true);
  old.model.step(.4, { currentMps: .18, foodSupply: 0, hour: 12 });
  const preservedOwner = old.model._active.get(ownerIds()[0]);
  const dead = allAnimals(preservedOwner).find(agent => agent.alive); assert.ok(dead);
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  for (const row of old.model._active.values()) {
    row._savedRecord = { ...row._savedRecord, opaqueMacroHistory: { owner: row.id, notes: ['preserve', 'all'] } };
    row._savedState = { ...row._savedState, opaqueNativeHistory: { ticks: row.sim._ticks, bytes: [8, 3, 2] } };
  }
  await old.model.checkpoint();
  const before = new Map(records(old.model).map(row => [row.id, row]));
  // A mixed durable group: this owner was visited, the other three are
  // genuinely missing in this test store, rather than being regenerated.
  for (const id of ownerIds().slice(1)) old.store.records.delete(`${old.model._world}|${id}`);
  const f = fixture({ store: old.store }); assert.equal(await f.model.update(at()), true);
  for (const row of records(f.model)) if (!ownerIds().slice(1).includes(row.id)) assert.deepEqual(row, before.get(row.id));
  for (const id of ownerIds()) {
    const row = f.model._active.get(id); assert.equal(row.forestBeltVersion, undefined);
    assert.equal(f.generator.forestBeltPlan(row.cx, row.cz), undefined);
  }
  const keptDeath = allAnimals(f.model._active.get(preservedOwner.id)).find(agent => agent.id === dead.id);
  assert.deepEqual(keptDeath, dead);
  bounded(f); receipt.oldRecordsPreserved = true; receipt.oldDeathPreserved = true;
});

test('delayed or failed atomic writes and failed or ambiguous reads never publish candidate source or births', async () => {
  const f = fixture(), offered = deferred(), gate = deferred(); let waiting = false;
  f.store.beforeCommit = async entries => {
    if (!waiting && entries.some(([id, row]) => ownerIds().includes(id) && row.forestBeltVersion === 1)) {
      waiting = true; offered.resolve(clone(entries)); await gate.promise;
    }
  };
  const pending = f.model.update(offscreenApproach()), entries = await offered.promise;
  assert.deepEqual(new Set(entries.filter(([id]) => ownerIds().includes(id)).map(([id]) => id)), new Set(ownerIds()));
  const base = createKelpOceanGenerator(SEED), revision = f.generator.forestBeltRevision;
  for (const [id, row] of entries) {
    assert.equal(f.model._active.has(id), false);
    assert.equal(f.store.records.has(`${f.model._world}|${id}`), false);
    assert.equal(f.generator.forestBeltPlan(row.cx, row.cz), undefined);
    assert.deepEqual(f.generator.chunk(row.cx, row.cz), base.chunk(row.cx, row.cz));
  }
  gate.resolve(); assert.equal(await pending, true);
  assert.ok(f.generator.forestBeltRevision > revision);
  const durable = completeGroup(f), offscreen = durable.filter(row => !f.model._active.has(row.id));
  assert.equal(offscreen.length, 2); assert.ok(offscreen.every(row => row.state.timeSec === 0 && row.state._ticks === 0));
  const frozen = clone(offscreen); f.model.step(.3, { currentMps: .18, foodSupply: 0, hour: 12 }); await f.model.checkpoint();
  assert.deepEqual(savedGroup(f).filter(row => offscreen.some(old => old.id === row.id)), frozen);
  for (const failure of ['null', 'throw', 'read', 'undefined']) {
    const failed = fixture(); let candidates = [];
    if (failure === 'read' || failure === 'undefined') failed.store.readFailure = failure === 'read' ? 'throw' : 'undefined';
    else failed.store.beforeCommit = entries => {
      candidates = clone(entries);
      if (failure === 'throw') throw new Error('Atomic forest group rejected.');
      return null;
    };
    assert.equal(await failed.model.update(at()), false);
    assert.equal(failed.store.records.size, 0);
    assert.equal(failed.model._active.size, 0);
    assert.equal(failed.generator.forestBeltRevision, 0);
    for (const [, row] of candidates) assert.equal(failed.generator.forestBeltPlan(row.cx, row.cz), undefined);
  }
  bounded(f); receipt.offscreenOwners = offscreen.map(row => row.id); receipt.offscreenFrozen = true;
});

test('all owners unload, revisit and cold restore the full plans, inventories, deaths and saved history without refill', async () => {
  const f = fixture(); assert.equal(await f.model.update(at()), true); completeGroup(f);
  f.model.step(.5, { currentMps: .24, foodSupply: 0, hour: 11 });
  const deathOwner = [...f.model._active.values()].find(row => allAnimals(row).some(agent => agent.alive));
  const dead = allAnimals(deathOwner).find(agent => agent.alive);
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  for (const row of f.model._active.values()) row._savedRecord = { ...row._savedRecord, opaqueHistory: { full: true, owner: row.id } };
  const expected = records(f.model), originalIds = expected.map(row => row.id);
  assert.equal(await f.model.update(away()), true); assert.ok(originalIds.every(id => !f.model._active.has(id)));
  f.model.step(.3, { currentMps: .24, foodSupply: 0, hour: 11 });
  assert.equal(await f.model.update(at()), true); assert.deepEqual(records(f.model), expected);
  await f.model.checkpoint(); const restored = fixture({ store: f.store });
  assert.equal(await restored.model.update(at()), true); assert.deepEqual(records(restored.model), expected);
  const stillDead = allAnimals(restored.model._active.get(deathOwner.id)).find(agent => agent.id === dead.id);
  assert.deepEqual(stillDead, dead);
  const frozen = records(restored.model); restored.model.step(0); assert.deepEqual(records(restored.model), frozen);
  bounded(f); bounded(restored);
  Object.assign(receipt, { fullRecordsRestored: expected.length, allOriginalOwnersUnloaded: true, revisitRecordsExact: true, coldRecordsExact: true });
});

test('corrupt or partial saved forest plans reject before regenerating owners or changing saved history', async () => {
  const source = fixture(); assert.equal(await source.model.update(at()), true); completeGroup(source); await source.model.checkpoint();
  const original = clone([...source.store.records]), key = `${source.model._world}|${ownerIds()[0]}`;
  for (const mutate of [row => { delete row.forestBeltVersion; }, row => { delete row.forestBeltInitializedAtSec; },
    row => { row.forestBeltPlan.version = 99; }, row => { row.forestBeltPlan.id = '99,99'; },
    row => { row.forestBeltPlan.elements[0].y += 1; },
    row => { for (const field of ['forestBeltVersion', 'forestBeltInitializedAtSec', 'forestBeltPlan']) delete row[field]; },
    (_row, store) => { store.records.delete(key); }]) {
    const store = new MemoryStore(); store.records = new Map(clone(original)); mutate(store.records.get(key), store);
    const disk = clone([...store.records]), f = fixture({ store });
    assert.equal(await f.model.update(at()), false);
    assert.equal(f.model._active.size, 0); assert.deepEqual([...store.records], disk);
    assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(f.generator.forestBeltPlan(GROUP.cx, GROUP.cz), undefined);
  }
  Object.assign(receipt, { corruptPlansRejected: true, missingGroupMemberRejected: true, strippedGroupMemberRejected: true });
});

test('ordinary repeated exploration retains a bounded ecology and source registry', async () => {
  const f = fixture();
  const transitions = [];
  for (const point of [at(), { x: at().x + 192, z: at().z + 128 }, away(), at()]) {
    assert.equal(await f.model.update(point), true); bounded(f);
    assert.equal(f.model._active.size, 9);
    transitions.push({ ...point, activeRegions: f.model._active.size, sourceOwners: f.generator.forestBeltRegistryStats().size,
      publicRevision: f.generator.forestBeltRevision });
  }
  receipt.loadedRegistryTransitions = transitions;
});

after(() => {
  if (process.env.KELP_FOREST_BELT_RECEIPT) writeFileSync(process.env.KELP_FOREST_BELT_RECEIPT,
    JSON.stringify(receipt, null, 2) + '\n');
});
