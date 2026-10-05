import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent, reefGuildFootRadius } from '../src/oceanReefGuild.js';
import { reefGuildSupportHeight } from '../src/reefGuildHabitat.js';
import { isOpenWaterLifeAgent, openWaterLifePositionValid } from '../src/oceanOpenWaterLife.js';

const seed = livingShallowsSeed('42');
const centre = { x: 928, z: 288 };
const far = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const sortedEntries = entries => clone([...entries]).sort(([a], [b]) => a.localeCompare(b));
const near = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-9, `${message}: ${a} != ${b}`);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

class MemoryStore {
  available = true;
  records = new Map();
  reads = [];
  writes = [];
  failedReads = new Set();
  failWrites = false;
  beforeMany = null;
  async load(world, id) {
    this.reads.push(id);
    if (this.failedReads.has(id)) throw new Error(`read unavailable: ${id}`);
    return clone(this.records.get(`${world}|${id}`) ?? null);
  }
  async save(world, id, record) {
    await this.saveMany(world, [[id, record]]);
  }
  async saveMany(world, entries) {
    const committed = clone(entries);
    this.writes.push(committed.map(([id]) => id));
    if (this.failWrites) throw new Error('ridge atomic write rejected');
    if (this.beforeMany) await this.beforeMany(committed);
    // No state is visible before the complete batch passes the write gate.
    for (const [id, record] of committed) this.records.set(`${world}|${id}`, record);
  }
}

function fixture(store = new MemoryStore(), enabled = true) {
  const base = createLivingShallowsGenerator(seed);
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: enabled });
  return { base, generator, model, store };
}
function checkBounds(model, generator) {
  assert.ok(model._active.size <= 9);
  const registry = generator.registryStats();
  assert.ok(registry.size <= 25);
  assert.equal(registry.limit, 25);
  for (const region of model._active.values()) {
    assert.ok(region.agents.length + (region.turtleAgents?.length ?? 0) <= 20,
      `${region.id}: living and historical records share the capacity`);
    assert.ok(validateLivingNetworkRecord(region), `${region.id}: complete material inventory validates`);
    near(livingNetworkBalance(region), 0, `${region.id}: material balance`);
  }
}
function checkActualBirths(model, generator) {
  let ridgeResidents = 0, plannedOwners = 0;
  for (const region of model._active.values()) {
    const plan = region.livingRidgePlan;
    if (plan) plannedOwners++;
    const descriptors = new Map(generator.chunk(region.cx, region.cz).elements.map(element => [element.id, element]));
    const newHosts = new Set(plan?.ridgeIds ?? []);
    const descriptorCount = kind => [...descriptors.values()].filter(element => element.kind === kind).length;
    assert.deepEqual(region.basicNetwork.habitat, {
      algae: Math.min(1, descriptorCount('algae') / 4),
      seagrass: Math.min(1, descriptorCount('seagrass') / 24),
      coral: Math.min(1, descriptorCount('coral') / 8),
    }, 'habitat inventory follows actual descriptors, not a declared coverage count');
    near(region.basicNetwork.plantOrganicUnits, .06 * region.basicNetwork.habitat.seagrass, 'initial plant stock');
    near(region.basicNetwork.coralOrganicUnits, .06 * region.basicNetwork.habitat.coral, 'initial coral stock');
    const surface = (x, z, coral) => oceanSupportHeight(generator, x, z, { avoidCoral: coral });
    for (const agent of region.agents) {
      if (!agent.alive) continue;
      const descriptor = descriptors.get(agent.refugeHostId);
      const hostId = descriptor?.attachmentId ?? descriptor?.id;
      if (newHosts.has(hostId) && descriptor?.kind === 'coral') {
        const host = descriptors.get(hostId);
        assert.ok(host && host.kind === 'rock');
        near(oceanRockHeight(host, descriptor.x, descriptor.z), descriptor.y,
          'an admitted ridge resident uses a physically attached refuge colony');
        ridgeResidents++;
      } else if (newHosts.has(hostId) && descriptor?.kind === 'rock' &&
        ['giant-clam', 'yellowtail-fusilier'].includes(agent.speciesId)) {
        if (agent.speciesId === 'giant-clam') {
          const ownHeight = oceanRockHeight(descriptor, agent.home.x, agent.home.z);
          assert.notEqual(ownHeight, null, 'the ridge clam is attached to its actual named host');
          near(agent.home.y, ownHeight + .004, 'the ridge clam uses its host triangle support');
        } else {
          const ownHeight = oceanRockHeight(descriptor, agent.schoolHome.x, agent.schoolHome.z);
          assert.notEqual(ownHeight, null, 'the pelagic school references an actual ridge structure');
          assert.ok(ownHeight > generator.floorSurface(agent.schoolHome.x, agent.schoolHome.z).height + .06);
          assert.ok(model._pelagicCandidate(agent, agent.position, 0),
            'the ridge school occupies a legal water column under the original finite route-support model');
        }
        ridgeResidents++;
      }
      if (isOpenWaterLifeAgent(agent)) {
        assert.ok(openWaterLifePositionValid(generator, region, agent, agent.position, { surface }), agent.id);
      } else if (isReefGuildAgent(agent)) {
        const support = reefGuildSupportHeight(surface, agent.position.x, agent.position.z,
          reefGuildFootRadius(agent), { avoidCoral: true });
        assert.ok(support, `${agent.id}: actual whole-footprint support exists`);
        near(agent.position.y, support.height + .004, `${agent.id}: actual contact height`);
      } else {
        const swimming = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper',
          'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(agent.speciesId);
        const support = surface(agent.position.x, agent.position.z, swimming);
        assert.ok(agent.position.y >= support + (swimming ? .08 : .0039),
          `${agent.id}: actual birth is above the rendered supporting surface`);
      }
    }
    const initialGuild = region.reefGuild?.initialInputUnits ?? 0;
    const initialWater = region.openWaterLife?.initialInputUnits ?? 0;
    near(region.basicNetwork.ledger.externalInput, initialGuild + initialWater,
      'fresh representatives have one explicitly accounted initial input');
    assert.equal(region.basicNetwork.processTotals.primaryProduction, 0);
    assert.equal(region.counters.feeding, 0);
  }
  assert.ok(plannedOwners > 0, 'suitable fresh owners receive actual persisted geology');
  assert.ok(model._active.get('14,4').livingRidgePlan, 'the actual eligible centre receives a ridge corridor');
  assert.ok(ridgeResidents > 0, 'actual animals, not only catalogue entries, use a new ridge host');
}

let legacyPromise;
async function legacyCapture() {
  legacyPromise ??= (async () => {
    const original = fixture(new MemoryStore(), false);
    await original.model.update(centre);
    original.model.step(.4);
    const region = [...original.model._active.values()].find(owner => owner.agents.some(agent => agent.alive));
    const deceased = region.agents.find(agent => agent.alive && !isOpenWaterLifeAgent(agent) && !isReefGuildAgent(agent));
    deceased.alive = false; deceased.state = 'dead'; deceased.energy = 0;
    recordLivingDeath(region, deceased); region.counters.deaths++;
    await original.model.checkpoint();
    return { records: sortedEntries(original.store.records), active: sortedEntries(original.model._active), deadId: deceased.id };
  })();
  return clone(await legacyPromise);
}
const restoreStore = records => {
  const store = new MemoryStore(); store.records = new Map(clone(records)); return store;
};

test('disabled geology and legacy saved owners preserve all old records and historical deaths without a new marker', async () => {
  const before = await legacyCapture();
  const store = restoreStore(before.records);
  const { model, generator, base } = fixture(store);
  await model.update(centre);
  assert.deepEqual(sortedEntries(model._active), before.active);
  assert.deepEqual(sortedEntries(store.records), before.records);
  assert.equal(generator.registryStats().ridgePlanOwnerIds.length, 0);
  for (const region of model._active.values()) {
    assert.equal(Object.hasOwn(region, 'livingRidgePlan'), false);
    assert.deepEqual(generator.chunk(region.cx, region.cz), base.chunk(region.cx, region.cz));
  }
  const deceased = [...model._active.values()].flatMap(region => region.agents).find(agent => agent.id === before.deadId);
  assert.equal(deceased.alive, false);
  checkBounds(model, generator);
});

test('fresh real ridge communities use new physical hosts and initialize actual habitat stocks exactly once', async () => {
  const { model, generator, store } = fixture();
  await model.update(centre);
  assert.equal(model._active.size, 9);
  assert.equal(new Set(store.reads).size, 25, 'the complete 5x5 support halo is read before deciding freshness');
  checkActualBirths(model, generator);
  checkBounds(model, generator);
  const before = sortedEntries(model._active);
  await model.update(centre);
  await model.checkpoint();
  assert.deepEqual(sortedEntries(model._active), before);
  for (const [id, region] of before) assert.deepEqual(store.records.get(`${model._world}|${id}`), region);
});

test('a delayed atomic commit exposes neither pending ridge geometry nor new animals to the live facade', { timeout: 60000 }, async () => {
  const store = new MemoryStore(), started = deferred(), permit = deferred();
  let pendingOwner;
  store.beforeMany = async entries => {
    if (pendingOwner) return;
    const candidate = entries.find(([, region]) => region.livingRidgePlan);
    if (!candidate) return;
    pendingOwner = candidate[1];
    started.resolve(); await permit.promise;
  };
  const { model, generator, base } = fixture(store);
  const pending = model.update(centre);
  try {
    await Promise.race([started.promise, pending.then(() => { throw new Error('update completed without reaching the atomic gate'); })]);
    assert.equal(model._active.has(pendingOwner.id), false);
    assert.equal(store.records.has(`${model._world}|${pendingOwner.id}`), false);
    assert.equal(generator.registryStats().ridgePlanOwnerIds.length, 0);
    assert.equal(generator.getRidgePlan(pendingOwner.id), undefined);
    assert.deepEqual(generator.chunk(pendingOwner.cx, pendingOwner.cz), base.chunk(pendingOwner.cx, pendingOwner.cz),
      'the pending owner remains on its render-visible committed base');
  } finally {
    permit.resolve(); await pending;
  }
  assert.equal(model._active.size, 9);
  assert.ok(generator.registryStats().size > 0);
  assert.ok(generator.ridgeRevision > 0);
  checkBounds(model, generator);
});

test('failed ridge writes activate no geometry or individuals, preserve old disk records, and allow a successful retry', async () => {
  const before = await legacyCapture(), store = restoreStore(before.records);
  store.failWrites = true;
  const { model, generator, base } = fixture(store);
  await model.update(far);
  assert.equal(model._active.size, 0);
  assert.equal(generator.registryStats().ridgePlanOwnerIds.length, 0);
  assert.deepEqual(sortedEntries(store.records), before.records);
  assert.deepEqual(generator.chunk(37, -25), base.chunk(37, -25));
  store.failWrites = false;
  await model.update(far);
  assert.equal(model._active.size, 9);
  for (const [key, record] of before.records) assert.deepEqual(store.records.get(key), record);
  checkBounds(model, generator);
});

test('a failed owner read is not mistaken for an empty owner and never overwrites its saved community', async () => {
  const before = await legacyCapture(), store = restoreStore(before.records);
  store.failedReads.add('14,4');
  const { model, generator, base } = fixture(store);
  try { await model.update(centre); } catch (error) { assert.match(String(error), /read unavailable/); }
  assert.equal(model._active.has('14,4'), false);
  assert.equal(generator.getRidgePlan('14,4'), undefined);
  assert.deepEqual(generator.chunk(14, 4), base.chunk(14, 4));
  assert.ok(store.writes.every(ids => !ids.includes('14,4')));
  assert.deepEqual(sortedEntries(store.records), before.records);
  checkBounds(model, generator);
});

test('malformed saved ridge plans are rejected without regenerating an owner or modifying any original record', async () => {
  const initial = fixture(); await initial.model.update(centre);
  const store = restoreStore(sortedEntries(initial.store.records));
  const key = `${initial.model._world}|14,4`, damaged = store.records.get(key);
  assert.ok(damaged.livingRidgePlan);
  damaged.livingRidgePlan.version = 999;
  const before = sortedEntries(store.records), { model, generator, base } = fixture(store);
  await assert.rejects(model.update(centre), /ridge/i);
  assert.equal(model._active.has('14,4'), false);
  assert.equal(generator.getRidgePlan('14,4'), undefined);
  assert.deepEqual(generator.chunk(14, 4), base.chunk(14, 4));
  assert.deepEqual(sortedEntries(store.records), before);
});

test('complete plans, real individuals, deaths and inventories survive all-owner unload, revisit and a fresh facade', async () => {
  const first = fixture(); await first.model.update(centre); first.model.step(.4);
  const owner = [...first.model._active.values()].find(region => region.agents.some(agent => agent.alive));
  const deceased = owner.agents.find(agent => agent.alive && !isReefGuildAgent(agent) && !isOpenWaterLifeAgent(agent));
  deceased.alive = false; deceased.state = 'dead'; deceased.energy = 0;
  recordLivingDeath(owner, deceased); owner.counters.deaths++;
  await first.model.checkpoint();
  const before = sortedEntries(first.model._active);
  await first.model.update(far);
  assert.ok(before.every(([id]) => !first.model._active.has(id)), 'every original active owner genuinely unloaded');
  checkBounds(first.model, first.generator);
  await first.model.update(centre);
  assert.deepEqual(sortedEntries(first.model._active), before);
  checkBounds(first.model, first.generator);
  await first.model.checkpoint();
  const reload = fixture(first.store);
  await reload.model.update(centre);
  assert.deepEqual(sortedEntries(reload.model._active), before);
  const restoredDead = [...reload.model._active.values()].flatMap(region => region.agents).find(agent => agent.id === deceased.id);
  assert.equal(restoredDead.alive, false);
  for (const [id, region] of before) assert.deepEqual(reload.generator.getRidgePlan(id), region.livingRidgePlan);
  checkBounds(reload.model, reload.generator);
});
