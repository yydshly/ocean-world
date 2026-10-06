import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { predatorEnergyBudgetError } from '../src/deepPredatorEcology.js';

const SEED = '42', GROUP = { cx: -6, cz: -10 };
const clone = value => structuredClone(value);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
const ownerIds = () => [0, 1].flatMap(dz => [0, 1].map(dx => `${GROUP.cx + dx},${GROUP.cz + dz}`));
const at = () => ({ x: (GROUP.cx + .5) * 64, z: (GROUP.cz + .5) * 64 });
const offscreenApproach = () => ({ x: at().x, z: at().z - 64 });
const away = () => ({ x: at().x + 800, z: at().z + 700 });
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(row => model._record(row));
const allAnimals = row => row.sim.agents.concat(row.predatorAgents ?? []);
const savedGroup = f => ownerIds().map(id => clone(f.store.records.get(`${f.model._world}|${id}`)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const receipt = { scope: 'finite CPU model, shared support and persistence evidence; not browser or visual acceptance', seed: SEED, group: GROUP };

class MemoryStore {
  available = true; records = new Map(); batches = []; beforeCommit = null; readFailure = null;
  async load(world, id) {
    if (this.readFailure === 'throw') throw new Error('Deep seascape read failed.');
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
  const generator = createDeepOceanGenerator(SEED, { seascape: enabled });
  const model = new DeepOceanEcology(SEED, generator, { store, seascape: enabled });
  return { store, generator, model };
}
function bounded(f) {
  assert.ok(f.model._active.size <= 9, 'actual loaded ecology stays bounded');
  const stats = f.generator.seascapeRegistryStats();
  assert.equal(stats.limit, 25); assert.ok(stats.size <= stats.limit);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'native and predator records, including deaths, share capacity');
    assert.ok(row.sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
    near(row.sim.metrics.resourceBudgetError, 0, `${row.id} full food ledger`);
    near(row.sim.metrics.energyBudgetError, 0, `${row.id} native condition ledger`);
    near(predatorEnergyBudgetError(row), 0, `${row.id} predator condition ledger`);
    assert.equal(row.sim.primaryProduction, 0); assert.equal(row.sim.totalPrimaryProduction, 0);
  }
  receipt.maximumActiveRegions = Math.max(receipt.maximumActiveRegions ?? 0, f.model._active.size);
  receipt.maximumRegistrySize = Math.max(receipt.maximumRegistrySize ?? 0, stats.size);
}
function completeGroup(f) {
  const rows = savedGroup(f);
  assert.ok(rows.every(Boolean), 'all four ecological owners are committed');
  for (const row of rows) {
    assert.equal(row.seascapeVersion, 1); assert.equal(row.seascapeInitializedAtSec, 0);
    assert.equal(row.seascapePlan.version, 1); assert.equal(row.seascapePlan.id, row.id);
    assert.deepEqual(f.generator.seascapePlan(row.cx, row.cz), row.seascapePlan);
  }
  return rows;
}
function actualSupport(f, row) {
  for (const agent of row.sim.agents.filter(agent => agent.alive)) {
    const floor = f.generator.heightAt(agent.position.x, agent.position.z);
    assert.equal(Math.floor(agent.position.x / 64), row.cx); assert.equal(Math.floor(agent.position.z / 64), row.cz);
    if (agent.speciesId === 'rattail-family') {
      near(agent.position.y, row.sim._fishFloor(agent), 'nine-probe fish clearance');
      assert.ok(agent.position.y >= floor + .03 - 1e-8);
    } else near(agent.position.y, floor, 'actual grounded base');
    if (agent.speciesId === 'pom-pom-anemone') assert.deepEqual(agent.position, agent.anchor);
    if (agent.speciesId === 'sea-pig-group') {
      const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
      assert.equal(agent.contactPointsLocal.length, 12);
      for (const foot of agent.contactPointsLocal) near(agent.position.y + foot.y * agent.sizeM,
        f.generator.heightAt(agent.position.x + agent.sizeM * (foot.x * c - foot.z * s),
          agent.position.z + agent.sizeM * (foot.x * s + foot.z * c)), 'actual sea-pig foot');
    }
  }
  for (const [name, pool] of [['surfacePatches', 'surfaceDetritus'], ['benthicPatches', 'benthicAnimalFood']]) {
    for (const patch of row.sim[name]) {
      assert.ok(patch[pool] >= 0); near(patch.position.y, f.generator.heightAt(patch.position.x, patch.position.z), 'actual sediment food patch');
    }
  }
}

test('disabled deep composition preserves complete default records and their next ordinary steps', async () => {
  const first = fixture({ enabled: false }); assert.equal(await first.model.update(at()), true);
  first.model.step(.4, { currentMps: .2, foodSupply: 0, hour: 12 }); await first.model.checkpoint();
  const before = records(first.model), second = fixture({ enabled: false, store: first.store });
  assert.equal(await second.model.update(at()), true); assert.deepEqual(records(second.model), before);
  for (const dt of [.1, .2]) {
    first.model.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 });
    second.model.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 });
  }
  assert.deepEqual(records(second.model), records(first.model));
  assert.ok(records(second.model).every(row => row.seascapeVersion === undefined && row.seascapePlan === undefined));
});

test('a natural fresh group commits actual sediment, hard supports and existing living food consumers together', async () => {
  const f = fixture(); assert.equal(await f.model.update(at()), true);
  const rows = completeGroup(f), base = createDeepOceanGenerator(SEED);
  const groupBatches = f.store.batches.filter(entries => entries.some(([id, row]) => ownerIds().includes(id) && row.seascapeVersion === 1));
  assert.equal(groupBatches.length, 1);
  assert.deepEqual(new Set(groupBatches[0].filter(([id]) => ownerIds().includes(id)).map(([id]) => id)), new Set(ownerIds()));
  const groupSpecies = {}, windowSpecies = {}, initialFoodByPool = {}, habitats = new Set();
  let rocks = 0, rubble = 0, addedRocks = 0, changedBedSamples = 0, inventory = 0;
  for (const saved of rows) {
    const row = f.model._active.get(saved.id); assert.ok(row);
    const chunk = f.generator.chunk(saved.cx, saved.cz), byId = new Map(chunk.elements.map(element => [element.id, element]));
    for (const old of base.chunk(saved.cx, saved.cz).elements) assert.deepEqual(byId.get(old.id), old, 'native scenery remains complete');
    for (const id of saved.seascapePlan.addedRockIds) {
      const rock = byId.get(id); assert.equal(rock?.kind, 'rock');
      const support = f.generator.supportAt(rock.x, rock.z);
      assert.equal(support.substrate, 'rock'); assert.equal(support.elementId, id); addedRocks++;
    }
    for (const element of chunk.elements) {
      if (element.kind === 'rock') rocks++; else if (element.kind === 'rubble') rubble++;
      const support = f.generator.supportAt(element.x, element.z);
      assert.ok(Number.isFinite(support.height));
      near(f.generator.heightAt(element.x, element.z), support.height, 'actual shared hard support');
    }
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const x = chunk.origin.x + ix * 8 + .37, z = chunk.origin.z + iz * 8 + .21;
      habitats.add(f.generator.sample(x, z).habitat);
      const x0 = Math.floor(x), z0 = Math.floor(z), tx = x - x0, tz = z - z0;
      const a = f.generator.floorVertex(x0, z0), b = f.generator.floorVertex(x0 + 1, z0), c = f.generator.floorVertex(x0, z0 + 1);
      near(f.generator.floorSurface(x, z).height, a + (b - a) * tx + (c - a) * tz, 'actual shared Float32 bed triangle');
      if (Math.abs(f.generator.floorSurface(x, z).height - base.floorSurface(x, z).height) > 1e-6) changedBedSamples++;
    }
    actualSupport(f, row);
    assert.equal(saved.state.timeSec, 0); assert.equal(saved.state.ledger.input, 0); assert.equal(saved.state.ledger.ingested, 0);
    inventory += saved.state.ledger.initial;
    for (const [pool, stock] of Object.entries(row.sim.resources)) initialFoodByPool[pool] = (initialFoodByPool[pool] ?? 0) + stock;
    for (const animal of allAnimals(row)) groupSpecies[animal.speciesId] = (groupSpecies[animal.speciesId] ?? 0) + 1;
  }
  for (const row of f.model._active.values()) for (const animal of allAnimals(row)) windowSpecies[animal.speciesId] = (windowSpecies[animal.speciesId] ?? 0) + 1;
  assert.ok(rocks > 0 && rubble > 0 && addedRocks > 0 && changedBedSamples > 0 && inventory > 0);
  assert.ok(habitats.has('deep-soft-bottom') && habitats.has('deep-hard-bottom') && habitats.has('deep-slope'));
  for (const species of ['sea-pig-group', 'rattail-family', 'pom-pom-anemone']) assert.ok(groupSpecies[species] > 0, `${species} is an actual persisted group resident`);
  for (const stock of Object.values(initialFoodByPool)) assert.ok(stock > 0);
  const positions = new Map(f.model.agents.map(agent => [agent.id, clone(agent.position)]));
  const foodBefore = [...f.model._active.values()].reduce((sum, row) => sum + row.sim.ledger.ingested, 0);
  const foodEvents = new Map();
  for (let tick = 0; tick < 30; tick++) {
    const before = new Map(f.model.agents.map(agent => [agent.id, clone(agent.position)]));
    f.model.step(.1, { currentMps: .06, foodSupply: 0, observerLight: 0 });
    for (const row of f.model._active.values()) {
      actualSupport(f, row);
      for (const agent of row.sim.agents) {
        const old = before.get(agent.id), length = Math.hypot(...['x', 'y', 'z'].map(key => agent.position[key] - old[key]));
        const budget = agent.speciesId === 'sea-pig-group' ? DEEP_MODEL_PARAMETERS.seaPigCrawlMps * .1 :
          agent.speciesId === 'rattail-family' ? (DEEP_MODEL_PARAMETERS.fishSearchMps + .06 * .006) * .1 : 0;
        assert.ok(length <= budget + 1e-8, `${agent.id} keeps its full XYZ step budget`);
      }
      for (const event of row.sim.events.filter(event => event.type === 'feeding')) {
        assert.ok(event.actualIntake > 0 && event.feedDistanceM <= event.allowedDistanceM + 1e-10);
        foodEvents.set(`${row.id}|${event.agentId}|${event.timeSec}`, event.foodPool);
      }
    }
  }
  const moved = f.model.agents.filter(agent => ['x', 'y', 'z'].some(key => Math.abs(agent.position[key] - positions.get(agent.id)[key]) > 1e-8)).length;
  const ingestion = [...f.model._active.values()].reduce((sum, row) => sum + row.sim.ledger.ingested, 0) - foodBefore;
  assert.ok(moved > 0 && ingestion > 0 && foodEvents.size > 0, 'ordinary motion and reachable intake debit actual inventory');
  bounded(f);
  Object.assign(receipt, { ownerIds: ownerIds(), groupSpeciesCounts: groupSpecies, activeWindowSpeciesCounts: windowSpecies,
    groupRocks: rocks, groupRubble: rubble, groupAddedRocks: addedRocks, changedBedSamples,
    sampledHabitats: [...habitats].sort(), groupInitialFoodUnits: inventory, groupInitialFoodByPool: initialFoodByPool,
    simulatedSec: 3, activeWindowMovedAnimals: moved, activeWindowIngestedUnits: ingestion, activeWindowFeedingEvents: foodEvents.size,
    activeWindowFeedingPools: [...new Set(foodEvents.values())].sort(), maximumFoodBalanceError: f.model.snapshot().metrics.balanceError,
    maximumNativeEnergyBalanceError: f.model.snapshot().metrics.energyBalanceError, maximumPredatorEnergyBalanceError: f.model.snapshot().metrics.predatorEnergyBalanceError });
});

test('one visited member blocks macro replacement and preserves full old deaths, ledgers and opaque histories', async () => {
  const old = fixture({ enabled: false }); assert.equal(await old.model.update(at()), true);
  old.model.step(.4, { currentMps: .06, foodSupply: 0 });
  const owner = old.model._active.get(ownerIds()[0]), dead = owner.sim.agents.find(agent => agent.alive); assert.ok(dead);
  dead.alive = false; dead.state = 'dead';
  for (const row of old.model._active.values()) {
    row._savedRecord = { ...row._savedRecord, opaqueMacroHistory: { owner: row.id, notes: ['preserve', 'all'] } };
    row._savedState = { ...row._savedState, opaqueNativeHistory: { ticks: row.sim._ticks, bytes: [8, 3, 2] } };
  }
  await old.model.checkpoint(); const before = new Map(records(old.model).map(row => [row.id, row]));
  for (const id of ownerIds().slice(1)) old.store.records.delete(`${old.model._world}|${id}`);
  const f = fixture({ store: old.store }); assert.equal(await f.model.update(at()), true);
  for (const row of records(f.model)) if (!ownerIds().slice(1).includes(row.id)) assert.deepEqual(row, before.get(row.id));
  for (const id of ownerIds()) {
    const row = f.model._active.get(id); assert.equal(row.seascapeVersion, undefined);
    assert.equal(f.generator.seascapePlan(row.cx, row.cz), undefined);
    assert.deepEqual(f.generator.chunk(row.cx, row.cz), old.generator.chunk(row.cx, row.cz));
  }
  assert.deepEqual(f.model._active.get(owner.id).sim.getAgent(dead.id), dead);
  bounded(f); receipt.oldRecordsPreserved = true; receipt.oldDeathPreserved = true;
});

test('pending, rejected or unreadable complete saves never expose candidate terrain or unsaved populations', async () => {
  const f = fixture(), offered = deferred(), gate = deferred(); let waiting = false;
  f.store.beforeCommit = async entries => {
    if (!waiting && entries.some(([id, row]) => ownerIds().includes(id) && row.seascapeVersion === 1)) {
      waiting = true; offered.resolve(clone(entries)); await gate.promise;
    }
  };
  const pending = f.model.update(offscreenApproach()), entries = await offered.promise;
  assert.deepEqual(new Set(entries.filter(([id]) => ownerIds().includes(id)).map(([id]) => id)), new Set(ownerIds()));
  const base = createDeepOceanGenerator(SEED), revision = f.generator.seascapeRevision;
  for (const [id, row] of entries) {
    assert.equal(f.model._active.has(id), false); assert.equal(f.store.records.has(`${f.model._world}|${id}`), false);
    assert.equal(f.generator.seascapePlan(row.cx, row.cz), undefined);
    assert.deepEqual(f.generator.chunk(row.cx, row.cz), base.chunk(row.cx, row.cz));
  }
  gate.resolve(); assert.equal(await pending, true); assert.ok(f.generator.seascapeRevision > revision);
  const durable = completeGroup(f), offscreen = durable.filter(row => !f.model._active.has(row.id));
  assert.equal(offscreen.length, 2); assert.ok(offscreen.every(row => row.state.timeSec === 0 && row.state._ticks === 0));
  const frozen = clone(offscreen); f.model.step(.3, { currentMps: .06, foodSupply: 0 }); await f.model.checkpoint();
  assert.deepEqual(savedGroup(f).filter(row => offscreen.some(old => old.id === row.id)), frozen);
  for (const failure of ['null', 'throw', 'read', 'undefined']) {
    const failed = fixture();
    if (failure === 'read' || failure === 'undefined') failed.store.readFailure = failure === 'read' ? 'throw' : 'undefined';
    else failed.store.beforeCommit = () => { if (failure === 'throw') throw new Error('Atomic deep group rejected.'); return null; };
    assert.equal(await failed.model.update(at()), false); assert.equal(failed.store.records.size, 0); assert.equal(failed.model._active.size, 0);
    assert.equal(failed.generator.seascapeRevision, 0);
    assert.equal(failed.generator.seascapePlan(GROUP.cx, GROUP.cz), undefined);
  }
  bounded(f); receipt.offscreenOwners = offscreen.map(row => row.id); receipt.offscreenFrozen = true;
});

test('all nine owners unload, revisit and cold restore full plans and stocks without reviving deaths or refilling food', async () => {
  const f = fixture(); assert.equal(await f.model.update(at()), true); completeGroup(f);
  f.model.step(.5, { currentMps: .06, foodSupply: 0 });
  const owner = [...f.model._active.values()].find(row => row.sim.agents.some(agent => agent.alive));
  const dead = owner.sim.agents.find(agent => agent.alive); dead.alive = false; dead.state = 'dead';
  for (const row of f.model._active.values()) {
    row._savedRecord = { ...row._savedRecord, opaqueHistory: { full: true, owner: row.id } };
    row._savedState = { ...row._savedState, opaqueClockHistory: { ticks: row.sim._ticks } };
  }
  const expected = records(f.model), originalIds = expected.map(row => row.id);
  assert.equal(await f.model.update(away()), true); assert.ok(originalIds.every(id => !f.model._active.has(id)));
  f.model.step(.3, { currentMps: .06, foodSupply: 0 });
  assert.equal(await f.model.update(at()), true); assert.deepEqual(records(f.model), expected);
  await f.model.checkpoint(); const cold = fixture({ store: f.store });
  assert.equal(await cold.model.update(at()), true); assert.deepEqual(records(cold.model), expected);
  assert.deepEqual(cold.model._active.get(owner.id).sim.getAgent(dead.id), dead);
  const frozen = records(cold.model); cold.model.step(0); assert.deepEqual(records(cold.model), frozen);
  bounded(f); bounded(cold);
  Object.assign(receipt, { fullRecordsRestored: expected.length, allOriginalOwnersUnloaded: true, revisitRecordsExact: true, coldRecordsExact: true });
});

test('corrupt plans, missing group members and wholly stripped markers reject without replacing stored history', async () => {
  const source = fixture(); assert.equal(await source.model.update(at()), true); completeGroup(source); await source.model.checkpoint();
  const original = clone([...source.store.records]), key = `${source.model._world}|${ownerIds()[0]}`;
  for (const mutate of [row => { delete row.seascapeVersion; }, row => { delete row.seascapeInitializedAtSec; },
    row => { row.seascapePlan.version = 99; }, row => { row.seascapePlan.id = '99,99'; },
    row => { row.seascapePlan.floorPatch.heights[20 * 65 + 20] += 1; },
    row => { for (const field of ['seascapeVersion', 'seascapeInitializedAtSec', 'seascapePlan']) delete row[field]; },
    (_row, store) => { store.records.delete(key); }]) {
    const store = new MemoryStore(); store.records = new Map(clone(original)); mutate(store.records.get(key), store);
    const disk = clone([...store.records]), f = fixture({ store });
    assert.equal(await f.model.update(at()), false); assert.equal(f.model._active.size, 0); assert.deepEqual([...store.records], disk);
    assert.equal(f.generator.seascapeRevision, 0); assert.equal(f.generator.seascapePlan(GROUP.cx, GROUP.cz), undefined);
  }
  Object.assign(receipt, { corruptPlansRejected: true, missingGroupMemberRejected: true, strippedGroupMemberRejected: true });
});

test('ordinary repeated long-distance exploration keeps actual ecology and registered sources bounded', async () => {
  const f = fixture(), transitions = [];
  for (const point of [at(), { x: at().x + 192, z: at().z + 128 }, away(), at()]) {
    assert.equal(await f.model.update(point), true); bounded(f); assert.equal(f.model._active.size, 9);
    transitions.push({ ...point, activeRegions: f.model._active.size, sourceOwners: f.generator.seascapeRegistryStats().size,
      publicRevision: f.generator.seascapeRevision });
  }
  receipt.loadedRegistryTransitions = transitions;
});

after(() => {
  if (process.env.DEEP_SEASCAPE_RECEIPT) writeFileSync(process.env.DEEP_SEASCAPE_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
});
