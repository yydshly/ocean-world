import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent } from '../src/oceanReefGuild.js';
import { isOpenWaterLifeAgent } from '../src/oceanOpenWaterLife.js';

const seed = livingShallowsSeed('42');
const ids = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${96 + dx},${2 + dz}`));
const opening = { x: 96 * 64 + 32, z: 2 * 64 + 32 };
const far = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const near = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-9, `${message}: ${a} != ${b}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class MemoryStore {
  available = true;
  records = new Map();
  commits = [];
  reads = [];
  beforeMany = null;
  refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('whole-shallow commit rejected');
    const pending = clone(entries);
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}

function fromRecords(records) { const store = new MemoryStore(); store.records = new Map(clone(records)); return store; }
function fixture(store = new MemoryStore(), shallowSeascape = true) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, shallowSeascape });
  return { base, generator, model, store };
}
function groupRows(f) { return ids.map(id => f.store.records.get(`${f.model._world}|${id}`)); }
function bounded(f) {
  assert.ok(f.model._active.size <= 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(row), row.id);
    near(livingNetworkBalance(row), 0, 'full organic balance');
  }
}
function killActual(row) {
  const animal = row.agents.find(a => a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a));
  assert.ok(animal, 'an ordinary generated animal is available');
  animal.alive = false; animal.state = 'dead'; animal.energy = 0;
  recordLivingDeath(row, animal); row.counters.deaths++;
  return animal.id;
}

let initialPromise;
async function initialRecords() {
  initialPromise ??= (async () => {
    const f = fixture(); await f.model.update(opening);
    const rows = groupRows(f);
    assert.equal(rows.length, 12); assert.ok(rows.every(row => row?.livingRidgePlan?.version === 6));
    const batches = f.store.commits.filter(batch => batch.some(([, row]) => row.livingRidgePlan?.version === 6));
    assert.equal(batches.length, 1); assert.equal(batches[0].length, 12);
    assert.deepEqual(new Set(batches[0].map(([id]) => id)), new Set(ids));
    assert.ok(f.store.reads.length <= 37);
    return capture(f.store.records);
  })();
  return clone(await initialPromise);
}

test('the complete 384 by 128 metre sample commits actual scenery, communities and balanced inventories once', async () => {
  const f = fixture(fromRecords(await initialRecords())); await f.model.update(opening);
  const rows = groupRows(f), elements = rows.flatMap(row => row.livingRidgePlan.elements);
  const species = {}, counts = {};
  f.generator.withShallowSeascapePlans(rows.map(row => row.livingRidgePlan), () => {
    for (const row of rows) {
      const plan = row.livingRidgePlan, chunk = f.generator.chunk(row.cx, row.cz);
      assert.equal(plan.group.widthM, 384); assert.equal(plan.group.depthM, 128);
      assert.deepEqual(plan.group.ownerIds, ids);
      assert.ok(validateLivingNetworkRecord(row)); near(livingNetworkBalance(row), 0, 'birth balance');
      assert.equal(row.timeSec, 0); assert.equal(row.ticks, 0);
      assert.equal(row.basicNetwork.processTotals.primaryProduction, 0);
      const count = kind => chunk.elements.filter(e => e.kind === kind).length;
      assert.deepEqual(row.basicNetwork.habitat, { algae: Math.min(1, count('algae') / 4),
        seagrass: Math.min(1, count('seagrass') / 24), coral: Math.min(1, count('coral') / 8) });
      for (const animal of row.agents) {
        assert.ok(animal.alive); species[animal.speciesId] = (species[animal.speciesId] ?? 0) + 1;
        const swimmer = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper',
          'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(animal.speciesId) || isOpenWaterLifeAgent(animal);
        const support = oceanSupportHeight(f.generator, animal.position.x, animal.position.z, { avoidCoral: swimmer });
        assert.ok(animal.position.y >= support + (swimmer ? .079 : .0039), animal.id);
      }
    }
  });
  for (const element of elements) counts[element.kind] = (counts[element.kind] ?? 0) + 1;
  assert.ok(counts.rock > 0 && counts.coral > 0 && counts.seagrass > 0 && counts.rubble > 0);
  assert.ok(Object.keys(species).length >= 4, 'multiple actual existing life forms occupy the sample');
  assert.ok(species['green-chromis'] > 0 && species['black-cucumber'] > 0);
  const offscreen = clone(rows.filter(row => !f.model._active.has(row.id)));
  const before = new Map([...f.model._active.values()].flatMap(row => row.agents).map(a => [a.id, clone(a.position)]));
  f.model.step(4); await f.model.checkpoint(); bounded(f);
  assert.ok([...f.model._active.values()].some(row => row.counters.feeding > 0), 'real ordinary stock ingestion occurs');
  assert.ok([...f.model._active.values()].flatMap(row => row.agents).some(a => a.alive && before.has(a.id) &&
    Math.hypot(a.position.x - before.get(a.id).x, a.position.z - before.get(a.id).z) > .01), 'actual animals move');
  for (const row of offscreen) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row, 'unloaded births stay at their original clocks and stocks');
  const receipt = { scope: 'CPU full-record and shared-support verification; no browser or GPU acceptance',
    groupOwnerCount: 12, widthM: 384, depthM: 128, groupElementCounts: counts, groupOrdinarySpecies: species,
    activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.registryStats().size,
    activeFeedingEvents: [...f.model._active.values()].reduce((n, row) => n + row.counters.feeding, 0) };
  if (process.env.LIVING_SHALLOW_SEASCAPE_RECEIPT) await writeFile(process.env.LIVING_SHALLOW_SEASCAPE_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});

test('a pending or superseded twelve-owner save exposes no candidate source or population', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => {
    if (offered || !rows.some(([, row]) => row.livingRidgePlan?.version === 6)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture(store), pending = f.model.update(opening); let next;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('twelve-owner save was not reached'); })]);
    assert.equal(offered.length, 12); assert.equal(f.generator.ridgeRevision, 0); assert.equal(f.model._active.size, 0);
    for (const [id, row] of offered) {
      assert.equal(f.generator.getRidgePlan(id), undefined);
      assert.equal(store.records.has(`${f.model._world}|${id}`), false);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz).elements, f.base.chunk(row.cx, row.cz).elements);
    }
    next = f.model.update(far);
  } finally { permit.resolve(); await pending; if (next) await next; }
  for (const [id, row] of offered) {
    assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row);
    assert.equal(f.model._active.has(id), false);
  }
  await f.model.update(opening);
  for (const [id, row] of offered) if (f.model._active.has(id)) assert.deepEqual(f.model._active.get(id), row);
  bounded(f);
});

test('refused writes, thrown writes and undefined or failed reads never create a partial sample', async () => {
  for (const refusal of ['null', 'throw']) {
    const store = new MemoryStore(); store.refusal = refusal;
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0); assert.equal(store.records.size, 0);
    store.refusal = null; await f.model.update(opening);
    assert.ok(groupRows(f).every(row => row?.livingRidgePlan?.version === 6)); bounded(f);
  }
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => {
      if (failure === 'throw') throw new Error('saved sample cannot be read');
      return undefined;
    };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0); assert.equal(store.records.size, 0);
  }
});

test('one historical member declines the entire new sample and preserves deaths, opaque fields and the next ecological step', async () => {
  const original = fixture(new MemoryStore(), false); await original.model.update(opening); original.model.step(.4);
  const retained = [...original.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killActual(retained); retained.historyExtension = { evidence: ['visited', 'opaque'], value: 17 };
  const before = clone(retained), store = new MemoryStore(); store.records.set(`${original.model._world}|${retained.id}`, before);
  const f = fixture(store); await f.model.update(opening);
  assert.deepEqual(f.model._active.get(retained.id), before);
  assert.deepEqual(store.records.get(`${f.model._world}|${retained.id}`), before);
  assert.equal(f.model._active.get(retained.id).agents.find(a => a.id === deadId).alive, false);
  assert.ok(groupRows(f).every(row => row?.livingRidgePlan?.version !== 6));
  await f.model.checkpoint();
  const records = capture(store.records), enabled = fixture(fromRecords(records)), disabled = fixture(fromRecords(records), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  enabled.model.step(.4); disabled.model.step(.4);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); bounded(enabled); bounded(disabled);
});

test('all nine unload, revisit and cold restore preserve full plans, inventories, history and deaths without refill', async () => {
  const f = fixture(fromRecords(await initialRecords())); await f.model.update(opening); f.model.step(.4);
  const row = [...f.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killActual(row); row.historyExtension = { key: 'stable' }; await f.model.checkpoint();
  const before = capture(f.model._active), oldIds = [...f.model._active.keys()];
  await f.model.update(far); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  await f.model.update(opening); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); await cold.model.update(opening); assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal([...cold.model._active.values()].flatMap(owner => owner.agents).find(a => a.id === deadId).alive, false);
});

test('missing members, stripped plans or markers, corrupt food and a corrupt floor reject before publication', async () => {
  const initial = await initialRecords();
  for (const damage of ['missing', 'stripped', 'all-plans', 'marker', 'version', 'group', 'food', 'floor']) {
    const store = fromRecords(initial), probe = fixture(store), key = `${probe.model._world}|101,3`;
    if (damage === 'missing') store.records.delete(key);
    else if (damage === 'stripped') delete store.records.get(key).livingRidgePlan;
    else if (damage === 'all-plans') for (const id of ids) delete store.records.get(`${probe.model._world}|${id}`).livingRidgePlan;
    else if (damage === 'marker') delete store.records.get(key).shallowSeascapeGroupId;
    else if (damage === 'version') store.records.get(key).livingRidgePlan.version = 5;
    else if (damage === 'group') store.records.get(key).livingRidgePlan.group.cx += 6;
    else if (damage === 'food') store.records.get(key).resources.detritus += .1;
    else store.records.get(key).livingRidgePlan.floorPatch.heights[32 * 65 + 32] += .125;
    const before = capture(store.records);
    await assert.rejects(probe.model.update(opening), /Invalid saved|Incomplete saved/);
    assert.deepEqual(capture(store.records), before);
    assert.equal(probe.model._active.size, 0); assert.equal(probe.generator.ridgeRevision, 0);
    assert.ok(store.reads.length <= 37);
  }
});

test('ordinary neighbouring and far windows keep nine active owners, 25 public sources and at most 37 distinct reads', async () => {
  const initial = await initialRecords(), f = fixture(fromRecords(initial));
  const priorIds = Array.from({ length: 25 }, (_, i) => `${-20 + i % 5},${-20 + Math.floor(i / 5)}`);
  f.generator.replaceRidgeOwners([], priorIds);
  const prior = f.generator.registryStats();
  f.generator.withShallowSeascapePlans(groupRows(f).map(row => row.livingRidgePlan), () => {
    assert.deepEqual(f.generator.registryStats(), prior, 'private twelve-owner source does not union with 25 published owners');
    assert.equal(f.generator.chunk(96, 2).ridgePlan.version, 6);
    assert.equal(f.generator.getRidgePlan('96,2'), undefined, 'temporary queries do not publish a plan');
    assert.throws(() => f.generator.registerLegacyRidgeOwner('96,2'), /temporary/);
  });
  assert.deepEqual(f.generator.registryStats(), prior);
  assert.equal(f.generator.chunk(96, 2).ridgePlan, undefined, 'private source is restored on callback exit');
  for (const point of [opening, { x: 98 * 64 + 32, z: 2 * 64 + 32 }, { x: 101 * 64 + 32, z: 3 * 64 + 32 }, far, opening]) {
    f.store.reads.length = 0; await f.model.update(point); bounded(f);
    assert.ok(f.store.reads.length <= 37, `read bound at ${point.x},${point.z}`);
    assert.equal(new Set(f.store.reads).size, f.store.reads.length, 'each disk owner is read once per window');
    const cx = Math.floor(point.x / 64), cz = Math.floor(point.z / 64);
    assert.ok(f.generator.registryStats().ids.every(id => { const [x, z] = id.split(',').map(Number); return Math.abs(x - cx) <= 2 && Math.abs(z - cz) <= 2; }));
  }
});
