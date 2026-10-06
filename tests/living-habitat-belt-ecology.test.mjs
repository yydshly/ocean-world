import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent, reefGuildFootRadius } from '../src/oceanReefGuild.js';
import { reefGuildSupportHeight } from '../src/reefGuildHabitat.js';
import { isOpenWaterLifeAgent, openWaterLifePositionValid } from '../src/oceanOpenWaterLife.js';
import { validateOceanTurtleRecord } from '../src/oceanTurtleCommunity.js';

const seed = livingShallowsSeed('42');
const groupOrigin = { cx: 74, cz: 2 };
const far = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const near = (a, b, title) => assert.ok(Math.abs(a - b) <= 1e-9, `${title}: ${a} != ${b}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ids = () => [0, 1].flatMap(dz => [0, 1].map(dx => `${groupOrigin.cx + dx},${groupOrigin.cz + dz}`));
const approach = () => ({ x: (groupOrigin.cx - 1) * 64 + 32, z: groupOrigin.cz * 64 + 32 });
const centre = () => ({ x: groupOrigin.cx * 64 + 32, z: groupOrigin.cz * 64 + 32 });

class MemoryStore {
  available = true;
  records = new Map();
  commits = [];
  failWrites = false;
  beforeMany = null;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) { await this.saveMany(world, [[id, state]]); }
  async saveMany(world, entries) {
    const pending = clone(entries);
    if (this.failWrites) throw new Error('whole living belt write rejected');
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}
function storeFrom(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), { livingBelt = true, seascape = false, geology = true } = {}) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true,
    livingGeology: geology, livingBelt, seascape });
  return { base, generator, model, store };
}
function groupRows(f) { return ids().map(id => f.store.records.get(`${f.model._world}|${id}`)); }
function bounded(f) {
  assert.ok(f.model._active.size <= 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.equal(f.generator.floorSurfaceVersion, 1);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(row), row.id);
    near(livingNetworkBalance(row), 0, 'full material balance');
  }
}
function killOneActual(row) {
  const agent = row.agents.find(a => a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a));
  assert.ok(agent, 'ordinary real individual is available');
  agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  recordLivingDeath(row, agent); row.counters.deaths++; return agent.id;
}
function actualGroup(f) {
  const rows = groupRows(f), surface = (x, z, coral) => oceanSupportHeight(f.generator, x, z, { avoidCoral: coral });
  const animals = [], elements = [];
  let addedHostUsers = 0, grassUsers = 0;
  for (const row of rows) {
    assert.equal(row.livingRidgePlan.version, 5);
    assert.equal(row.livingRidgePlan.group.cx, groupOrigin.cx);
    assert.equal(row.livingRidgePlan.group.cz, groupOrigin.cz);
    assert.deepEqual(new Set(row.livingRidgePlan.group.ownerIds), new Set(ids()));
    const chunk = f.generator.chunk(row.cx, row.cz), count = kind => chunk.elements.filter(e => e.kind === kind).length;
    elements.push(...chunk.elements);
    assert.deepEqual(row.basicNetwork.habitat, { algae: Math.min(1, count('algae') / 4),
      seagrass: Math.min(1, count('seagrass') / 24), coral: Math.min(1, count('coral') / 8) });
    near(row.basicNetwork.ledger.externalInput,
      (row.reefGuild?.initialInputUnits ?? 0) + (row.openWaterLife?.initialInputUnits ?? 0), 'once-only admitted body/prey input');
    assert.equal(row.basicNetwork.processTotals.primaryProduction, 0);
    assert.equal(row.counters.feeding, 0);
    assert.ok(validateLivingNetworkRecord(row)); near(livingNetworkBalance(row), 0, 'initial balance');
    const original = new Set(f.base.chunk(row.cx, row.cz).elements.map(e => e.id));
    const added = new Set(chunk.elements.filter(e => !original.has(e.id)).map(e => e.id));
    for (const a of row.agents) {
      assert.ok(a.alive); animals.push(a);
      if (isOpenWaterLifeAgent(a)) assert.ok(openWaterLifePositionValid(f.generator, row, a, a.position, { surface }), a.id);
      else if (isReefGuildAgent(a)) {
        const support = reefGuildSupportHeight(surface, a.position.x, a.position.z, reefGuildFootRadius(a), { avoidCoral: true });
        assert.ok(support, a.id); near(a.position.y, support.height + .004, 'whole guild contact');
      } else {
        const swimmer = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(a.speciesId);
        assert.ok(a.position.y >= surface(a.position.x, a.position.z, swimmer) + (swimmer ? .08 : .0039), a.id);
      }
      if (added.has(a.refugeHostId) || added.has(a.guildHostId)) addedHostUsers++;
      if (a.speciesId === 'black-cucumber' && a.habitat === 'sand-with-seagrass') {
        assert.ok(chunk.elements.some(e => e.kind === 'seagrass' && Math.hypot(e.x - a.home.x, e.z - a.home.z) < 3.2));
        near(a.home.y, f.generator.floorSurface(a.home.x, a.home.z).height + .004, 'real soft-bed contact'); grassUsers++;
      }
    }
    assert.ok(validateOceanTurtleRecord(row, f.generator, { surface: (x, z) => surface(x, z, true) }));
    grassUsers += row.turtleAgents?.length ?? 0;
  }
  assert.ok(elements.some(e => e.kind === 'rock') && elements.some(e => e.kind === 'coral') && elements.some(e => e.kind === 'seagrass'));
  assert.ok(animals.some(a => a.speciesId === 'green-chromis'), 'a real coral refuge school');
  assert.ok(animals.some(a => a.speciesId === 'black-cucumber'), 'real soft-sediment animals');
  assert.ok(animals.some(a => a.speciesId === 'yellowtail-fusilier' || isOpenWaterLifeAgent(a)), 'real water-layer animals');
  assert.ok(addedHostUsers > 0, 'new macro hosts supply real animal support');
  assert.ok(grassUsers > 0, 'real animals use the grass neighbourhood');
  bounded(f);
}

let freshPromise;
async function freshCapture() {
  if (!freshPromise) freshPromise = (async () => {
    const f = fixture(); await f.model.update(approach()); actualGroup(f);
    const records = capture(f.store.records);
    const matching = f.store.commits.filter(rows => rows.some(([, row]) => row.livingRidgePlan?.version === 5 &&
      row.livingRidgePlan.group.cx === groupOrigin.cx && row.livingRidgePlan.group.cz === groupOrigin.cz));
    assert.equal(matching.length, 1); assert.equal(matching[0].length, 4);
    const inactive = clone(groupRows(f).filter(row => !f.model._active.has(row.id)));
    assert.ok(inactive.length > 0);
    f.model.step(.4); await f.model.checkpoint();
    for (const row of inactive) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row, 'offscreen births remain frozen');
    bounded(f); return { records };
  })();
  return clone(await freshPromise);
}

test('fresh living belt uses its committed reef, sediment, meadow and water supports for real births and balanced stocks', async () => {
  await freshCapture();
});

test('delayed and superseded whole-belt commits reveal no partial source or population, and restore their exact durable births', { timeout: 90000 }, async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => {
    if (offered || !rows.some(([, row]) => row.livingRidgePlan?.version === 5 &&
      row.livingRidgePlan.group.cx === groupOrigin.cx && row.livingRidgePlan.group.cz === groupOrigin.cz)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture(store), first = f.model.update(approach()); let next;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error('whole-belt commit was never reached'); })]);
    assert.equal(offered.length, 4);
    for (const [id, row] of offered) {
      assert.equal(f.model._active.has(id), false);
      assert.equal(store.records.has(`${f.model._world}|${id}`), false);
      assert.equal(f.generator.getRidgePlan(id), undefined);
      assert.equal(f.generator.isRidgeOwnerReady(id), false);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz).elements, f.base.chunk(row.cx, row.cz).elements);
    }
    next = f.model.update(far);
  } finally { permit.resolve(); await first; if (next) await next; }
  for (const [id, row] of offered) {
    assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row);
    assert.equal(f.model._active.has(id), false);
  }
  await f.model.update(approach());
  for (const [id, row] of offered) if (f.model._active.has(id)) assert.deepEqual(f.model._active.get(id), row);
  bounded(f);
});

test('write and read failures never become virgin owners; a successful retry commits the complete living belt', async () => {
  const store = new MemoryStore(); store.failWrites = true;
  const f = fixture(store); await f.model.update(approach());
  assert.equal(f.model._active.size, 0); assert.equal(store.records.size, 0);
  assert.equal(f.generator.registryStats().ridgePlanOwnerIds.length, 0);
  store.failWrites = false; await f.model.update(approach()); actualGroup(f);
  const unreadableStore = new MemoryStore(); unreadableStore.load = async () => { throw new Error('saved owner read failed'); };
  const unreadable = fixture(unreadableStore); await unreadable.model.update(centre());
  assert.equal(unreadable.model._active.size, 0); assert.equal(unreadableStore.records.size, 0);
  assert.equal(unreadable.generator.registryStats().ridgePlanOwnerIds.length, 0);
});

test('one saved group member blocks the belt and preserves every historical field and death', async () => {
  const old = fixture(new MemoryStore(), { livingBelt: false, geology: false });
  await old.model.update(centre()); old.model.step(.4);
  const retained = [...old.model._active.values()].find(row => ids().includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killOneActual(retained), before = clone(retained), store = new MemoryStore();
  store.records.set(`${old.model._world}|${retained.id}`, clone(before));
  const f = fixture(store); await f.model.update(centre());
  assert.deepEqual(f.model._active.get(retained.id), before);
  assert.deepEqual(store.records.get(`${f.model._world}|${retained.id}`), before);
  assert.equal(f.model._active.get(retained.id).agents.find(a => a.id === deadId).alive, false);
  for (const id of ids()) assert.notEqual(f.model._active.get(id).livingRidgePlan?.version, 5);
  bounded(f);
});

test('all nine owners unload, revisit and cold restore exact full living-belt populations, plans, deaths and inventories', async () => {
  const initial = await freshCapture(), f = fixture(storeFrom(initial.records));
  await f.model.update(centre()); f.model.step(.4);
  const owner = [...f.model._active.values()].find(row => ids().includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killOneActual(owner); await f.model.checkpoint();
  const before = capture(f.model._active), oldIds = [...f.model._active.keys()];
  await f.model.update(far); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  await f.model.update(centre()); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const reload = fixture(f.store); await reload.model.update(centre());
  assert.deepEqual(capture(reload.model._active), before); bounded(reload);
  assert.equal([...reload.model._active.values()].flatMap(row => row.agents).find(a => a.id === deadId).alive, false);
  for (const id of ids()) assert.deepEqual(reload.generator.getRidgePlan(id), f.generator.getRidgePlan(id));
});

test('living belt requires explicit opt-in and living geology; disabled admission retains the established v4 path', async () => {
  const noOpt = fixture(new MemoryStore(), { livingBelt: false, seascape: true });
  assert.equal(noOpt.model.livingBeltEnabled, false);
  await noOpt.model.update({ x: 54 * 64 + 32, z: 8 * 64 + 32 });
  assert.equal(noOpt.model._active.get('54,8').livingRidgePlan.version, 4);
  const noGeology = fixture(new MemoryStore(), { livingBelt: true, geology: false });
  assert.equal(noGeology.model.livingBeltEnabled, false);
  await noGeology.model.update(centre());
  assert.ok([...noGeology.model._active.values()].every(row => row.livingRidgePlan === undefined));
  bounded(noGeology);
});
