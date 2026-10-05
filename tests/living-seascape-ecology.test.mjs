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
// A normally admitted, fixed world-coordinate group supplied by the planner.
const groupOrigin = { cx: 54, cz: 8 };
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
    if (this.failWrites) throw new Error('whole seascape commit rejected');
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}
function storeFrom(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), { seascape = true, geology = true, relief = true, mosaic = true } = {}) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true,
    livingGeology: geology, seabedRelief: relief, habitatMosaic: mosaic, seascape });
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
  assert.ok(agent, 'a real ordinary birth is available, without manufacturing a species');
  agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  recordLivingDeath(row, agent); row.counters.deaths++; return agent.id;
}
function actualGroup(f) {
  const rows = groupRows(f), surface = (x, z, coral) => oceanSupportHeight(f.generator, x, z, { avoidCoral: coral });
  assert.equal(rows.length, 4);
  let actualBedUsers = 0;
  for (const row of rows) {
    assert.equal(row.livingRidgePlan.version, 4);
    assert.equal(row.livingRidgePlan.group.cx, groupOrigin.cx);
    assert.equal(row.livingRidgePlan.group.cz, groupOrigin.cz);
    assert.deepEqual(new Set(row.livingRidgePlan.group.ownerIds), new Set(ids()));
    const chunk = f.generator.chunk(row.cx, row.cz), count = kind => chunk.elements.filter(e => e.kind === kind).length;
    assert.deepEqual(row.basicNetwork.habitat, { algae: Math.min(1, count('algae') / 4),
      seagrass: Math.min(1, count('seagrass') / 24), coral: Math.min(1, count('coral') / 8) });
    near(row.basicNetwork.ledger.externalInput,
      (row.reefGuild?.initialInputUnits ?? 0) + (row.openWaterLife?.initialInputUnits ?? 0), 'once-only admitted body/prey input');
    assert.equal(row.basicNetwork.processTotals.primaryProduction, 0);
    assert.equal(row.counters.feeding, 0);
    assert.ok(validateLivingNetworkRecord(row)); near(livingNetworkBalance(row), 0, 'group initial balance');
    const final = new Map(chunk.elements.map(e => [e.id, e]));
    for (const e of f.base.chunk(row.cx, row.cz).elements)
      if (e.kind !== 'rubble') assert.deepEqual(final.get(e.id), e, 'whole native hosts/roots/props remain exact');
    for (const a of row.agents) {
      if (isOpenWaterLifeAgent(a)) assert.ok(openWaterLifePositionValid(f.generator, row, a, a.position, { surface }), a.id);
      else if (isReefGuildAgent(a)) {
        const support = reefGuildSupportHeight(surface, a.position.x, a.position.z, reefGuildFootRadius(a), { avoidCoral: true });
        assert.ok(support, a.id); near(a.position.y, support.height + .004, 'whole guild contact');
      } else {
        const swimmer = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(a.speciesId);
        assert.ok(a.position.y >= surface(a.position.x, a.position.z, swimmer) + (swimmer ? .08 : .0039), a.id);
      }
      if (Math.abs(f.generator.floorSurface(a.home.x, a.home.z).height - f.base.floorSurface(a.home.x, a.home.z).height) > .0001) {
        actualBedUsers++;
        near(f.generator.sample(a.home.x, a.home.z).depthM, 8 - f.generator.floorSurface(a.home.x, a.home.z).height, 'real birth depth');
      }
    }
    assert.ok(validateOceanTurtleRecord(row, f.generator, { surface: (x, z) => surface(x, z, true) }));
  }
  assert.ok(actualBedUsers > 0, 'actual individuals use displaced floor; a particular species is not forced');
  const plans = new Map(rows.map(row => [row.id, row.livingRidgePlan])), gx = groupOrigin.cx, gz = groupOrigin.cz;
  let changedSeam = 0;
  for (let n = 0; n < 128; n++) {
    const left = plans.get(`${gx},${gz + Math.floor(n / 64)}`), right = plans.get(`${gx + 1},${gz + Math.floor(n / 64)}`);
    const index = (n % 64) * 65;
    near(left.floorPatch.heights[index + 64], right.floorPatch.heights[index], 'persisted vertical shared edge');
    const x = (gx + 1) * 64, z = gz * 64 + n;
    near(f.generator.floorVertex(x, z), right.floorPatch.heights[index], 'public shared vertex');
    if (Math.abs(f.generator.floorSurface(x, z).height - f.base.floorSurface(x, z).height) > .01) changedSeam++;
    const top = plans.get(`${gx + Math.floor(n / 64)},${gz}`), bottom = plans.get(`${gx + Math.floor(n / 64)},${gz + 1}`);
    const column = n % 64;
    near(top.floorPatch.heights[64 * 65 + column], bottom.floorPatch.heights[column], 'persisted horizontal shared edge');
    const sx = gx * 64 + n, sz = (gz + 1) * 64;
    near(f.generator.floorVertex(sx, sz), bottom.floorPatch.heights[column], 'public horizontal shared vertex');
    if (Math.abs(f.generator.floorSurface(sx, sz).height - f.base.floorSurface(sx, sz).height) > .01) changedSeam++;
  }
  assert.ok(changedSeam > 0, 'a real nonzero landform crosses an internal owner seam');
  bounded(f);
}

let freshPromise;
async function freshCapture() {
  if (!freshPromise) freshPromise = (async () => {
    assert.ok(groupOrigin, 'the real admitted planner group is configured');
    const f = fixture(); await f.model.update(approach()); actualGroup(f);
    const records = capture(f.store.records), active = capture(f.model._active);
    const matching = f.store.commits.filter(rows => rows.some(([, row]) => row.livingRidgePlan?.version === 4 &&
      row.livingRidgePlan.group.cx === groupOrigin.cx && row.livingRidgePlan.group.cz === groupOrigin.cz));
    assert.equal(matching.length, 1); assert.equal(matching[0].length, 4);
    const inactive = clone(groupRows(f).filter(row => !f.model._active.has(row.id)));
    assert.ok(inactive.length > 0, 'the finite first approach commits genuine offscreen members');
    f.model.step(.4); await f.model.checkpoint();
    for (const row of inactive) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row, 'offscreen births do not simulate');
    bounded(f); return { records, active };
  })();
  return clone(await freshPromise);
}

test('four fresh owners share real seam geometry, births and one atomic inventory admission; inactive siblings freeze', async () => {
  await freshCapture();
});

test('full-group delayed, failed and superseded commits publish no partial source/population and can restore after retry', { timeout: 90000 }, async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => {
    if (offered || !rows.some(([, row]) => row.livingRidgePlan?.version === 4 &&
      row.livingRidgePlan.group.cx === groupOrigin.cx && row.livingRidgePlan.group.cz === groupOrigin.cz)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const delayed = fixture(store), first = delayed.model.update(approach()); let next;
  try {
    await Promise.race([entered.promise, first.then(() => { throw new Error('target full-group commit was never reached'); })]);
    assert.equal(offered.length, 4);
    for (const [id, row] of offered) {
      assert.equal(delayed.model._active.has(id), false);
      assert.equal(store.records.has(`${delayed.model._world}|${id}`), false);
      assert.equal(delayed.generator.getRidgePlan(id), undefined);
      assert.equal(delayed.generator.isRidgeOwnerReady(id), false);
      const p = row.livingRidgePlan.floorPatch.mostDisplaced;
      assert.deepEqual(delayed.generator.floorSurface(p.x, p.z), delayed.base.floorSurface(p.x, p.z));
    }
    next = delayed.model.update(far);
  } finally { permit.resolve(); await first; if (next) await next; }
  for (const [id, row] of offered) {
    assert.deepEqual(store.records.get(`${delayed.model._world}|${id}`), row, 'superseded successful commit remains complete and durable');
    assert.equal(delayed.model._active.has(id), false);
  }
  await delayed.model.update(approach());
  for (const [id, row] of offered) if (delayed.model._active.has(id)) assert.deepEqual(delayed.model._active.get(id), row);
  bounded(delayed);
  const failedStore = new MemoryStore(); failedStore.failWrites = true;
  const failed = fixture(failedStore); await failed.model.update(approach());
  assert.equal(failed.model._active.size, 0); assert.equal(failedStore.records.size, 0);
  assert.equal(failed.generator.registryStats().ridgePlanOwnerIds.length, 0);
  failedStore.failWrites = false; await failed.model.update(approach()); actualGroup(failed);
});

test('legacy mixed groups and complete old v3 death records use the old path without replacement', async () => {
  const old = fixture(new MemoryStore(), { seascape: false, geology: false, relief: false, mosaic: false });
  await old.model.update(centre()); old.model.step(.4);
  const retained = [...old.model._active.values()].find(row => ids().includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killOneActual(retained), before = clone(retained), store = new MemoryStore();
  store.records.set(`${old.model._world}|${retained.id}`, clone(before));
  const current = fixture(store); await current.model.update(centre());
  assert.deepEqual(current.model._active.get(retained.id), before);
  assert.deepEqual(store.records.get(`${current.model._world}|${retained.id}`), before);
  assert.equal(current.model._active.get(retained.id).agents.find(a => a.id === deadId).alive, false);
  for (const id of ids()) assert.notEqual(current.model._active.get(id).livingRidgePlan?.version, 4);
  bounded(current);
  const oldV3 = fixture(new MemoryStore(), { seascape: false }), oldPosition = { x: 1760, z: 608 };
  await oldV3.model.update(oldPosition); oldV3.model.step(.4);
  assert.equal(oldV3.model._active.get('27,9').livingRidgePlan.version, 3);
  const oldOwner = [...oldV3.model._active.values()].find(row => row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  killOneActual(oldOwner); await oldV3.model.checkpoint();
  const oldRecords = capture(oldV3.store.records), oldActive = capture(oldV3.model._active);
  const upgrade = fixture(storeFrom(oldRecords)); await upgrade.model.update(oldPosition);
  assert.deepEqual(capture(upgrade.model._active), oldActive);
  assert.deepEqual(capture(upgrade.store.records), oldRecords);
  assert.equal(upgrade.model._active.get('27,9').livingRidgePlan.version, 3);
  bounded(upgrade);
});

test('all nine owners unload and full group restoration preserves complete deaths, clocks, stocks and 25/9/20 bounds', async () => {
  const initial = await freshCapture(), f = fixture(storeFrom(initial.records));
  await f.model.update(centre()); f.model.step(.4);
  const owner = [...f.model._active.values()].find(row => ids().includes(row.id) && row.agents.some(a =>
    a.alive && !isReefGuildAgent(a) && !isOpenWaterLifeAgent(a)));
  const deadId = killOneActual(owner); await f.model.checkpoint();
  const before = capture(f.model._active), oldIds = [...f.model._active.keys()];
  await f.model.update(far);
  assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  await f.model.update(centre()); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const reload = fixture(f.store); await reload.model.update(centre());
  assert.deepEqual(capture(reload.model._active), before); bounded(reload);
  assert.equal([...reload.model._active.values()].flatMap(row => row.agents).find(a => a.id === deadId).alive, false);
  for (const id of ids()) assert.deepEqual(reload.generator.getRidgePlan(id), f.generator.getRidgePlan(id));
});
