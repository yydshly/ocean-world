import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createOceanPelagicCommunityPlan, OCEAN_PELAGIC_COMMUNITY_VERSION } from '../src/oceanPelagicCommunity.js';
import { speciesById } from '../src/species.js';

// A real coordinate-seeded fixture: the old shallow recipe is empty here,
// the prior slope upgrade has eleven animals, and the water-column plan adds
// six. It exercises both upgrades without fabricating a planner or terrain.
const SEED = '42';
const WORLD = 'ecology-v1:string:42';
const REGION = '4,-2';
const CENTER = { x: 288, z: -96 };
const FAR = { x: 1024, z: 1024 };
const SPECIES = 'yellowtail-fusilier';
const MARKERS = ['pelagicCommunityVersion', 'pelagicCommunityAdded', 'pelagicInitializedAtSec'];
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantity = resources => Object.values(resources).reduce((total, value) => total + value, 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

class MemoryStore {
  available = true;
  records = new Map();
  saves = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) {
    await this.onSave?.(world, id, state);
    this.records.set(`${world}|${id}`, clone(state));
    this.saves.push({ world, id, state: clone(state) });
  }
  async clear(world) {
    for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key);
  }
}

function setup(store = new MemoryStore()) {
  const generator = createOceanGenerator(SEED);
  return { generator, store, ecology: new OceanEcology(SEED, generator, { store }) };
}

function baseWithSlope(ecology) {
  const region = ecology._createRegion(4, -2);
  assert.equal(region.agents.length, 0, 'the old shallow recipe remains unchanged');
  assert.equal(ecology._supplementSlopeRegion(region), true);
  assert.equal(region.agents.length, 11);
  return region;
}

function legacyRecord(ecology, count = null) {
  const region = baseWithSlope(ecology);
  if (count !== null) {
    const template = region.agents.find(agent => agent.speciesId === 'blue-starfish');
    region.agents = Array.from({ length: count }, (_, index) => ({ ...clone(template), id: `historical:${index}` }));
  }
  region.timeSec = 32.8; region.ticks = 328;
  region.resources = { algae: .21, plankton: .33, detritus: .47 };
  region.ledger = { initial: 1.04, input: .27, ingested: .11, exported: .19 };
  region.counters = { feeding: 17, escapes: 3, cleaning: 2, predation: 1, deaths: 2 };
  region.events = [{ id: 'old-event', timeSec: 8.2, type: 'feeding', agentId: 'historical:0' }];
  for (const [index, agent] of region.agents.entries()) {
    agent.alive = index % 3 !== 0;
    agent.state = agent.alive ? 'foraging' : 'dead';
    agent.energy = agent.alive ? .72 : 0;
    agent.velocity = { x: .013, y: -.002, z: -.01 };
    agent.stateSince = 12.4;
    agent.lastFeedAt = 8.2; agent.nextBite = 34; agent.nextDecision = 35;
    agent.decisions = 9; agent.timeSec = region.timeSec;
  }
  return region;
}

function previousProjection(region, priorLength) {
  const result = clone(region);
  for (const key of [...MARKERS, 'mantaCommunityVersion', 'mantaCommunityAdded', 'mantaInitializedAtSec']) delete result[key];
  result.agents = result.agents.slice(0, priorLength);
  return result;
}

function forbidRebuild(ecology) {
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== 4 || cz !== -2, 'a valid saved population cannot enter initial allocation');
    return create(cx, cz);
  };
}

function assertWaterColumn(generator, agent) {
  const support = oceanSupportHeight(generator, agent.position.x, agent.position.z, { avoidCoral: true });
  assert.ok(agent.position.y >= support + 1 - 1e-9, 'actual mesh/coral support stays below the fish');
  assert.ok(agent.position.y <= OCEAN_SURFACE_Y - 1.5 + 1e-9, 'fish remain submerged');
  const chunk = generator.chunk(4, -2);
  assert.ok(agent.position.x >= chunk.bounds.minX + .5 && agent.position.x <= chunk.bounds.maxX - .5);
  assert.ok(agent.position.z >= chunk.bounds.minZ + .5 && agent.position.z <= chunk.bounds.maxZ - .5);
  assert.ok([agent.position.x, agent.position.y, agent.position.z, agent.preferredDepthM].every(Number.isFinite));
}

function assertBalance(region) {
  assert.ok(Math.abs(region.ledger.initial + region.ledger.input - region.ledger.ingested -
    region.ledger.exported - quantity(region.resources)) < 1e-12);
}

function pelagicOnly() {
  const context = setup();
  const region = context.ecology._createRegion(4, -2);
  assert.equal(context.ecology._supplementPelagicRegion(region), true);
  assert.ok(region.agents.length >= 5 && region.agents.length <= 8);
  assert.ok(region.agents.every(agent => agent.speciesId === SPECIES));
  region.resources = { algae: .2, plankton: .4, detritus: .3 };
  region.ledger = { initial: quantity(region.resources), input: 0, ingested: 0, exported: 0 };
  context.ecology._active.set(REGION, region);
  return { ...context, region };
}

test('real water-column cohort is append-only, host-stable and independent of loading order', async () => {
  const { ecology, generator, store } = setup();
  const baseline = baseWithSlope(ecology);
  const shallowCatalog = hash(speciesById), scenery = hash(generator.chunk(4, -2));
  const plan = createOceanPelagicCommunityPlan(generator, generator.chunk(4, -2), {
    random: salt => ecology._random(baseline, salt), surface: (x, z, fish) => ecology._surface(x, z, fish) });
  assert.equal(plan.eligible, true); assert.equal(plan.placements.length, 6);
  await ecology.update(CENTER);
  const current = ecology._active.get(REGION), additions = current.agents.slice(baseline.agents.length).filter(agent => agent.populationOrigin === 'pelagic-community-v1');
  assert.deepEqual(previousProjection(current, baseline.agents.length), baseline);
  assert.equal(current.pelagicCommunityVersion, OCEAN_PELAGIC_COMMUNITY_VERSION);
  assert.equal(current.pelagicCommunityAdded, 6);
  assert.equal(current.pelagicInitializedAtSec, 0);
  assert.equal(additions.length, 6);
  assert.equal(new Set(additions.map(agent => agent.groupId)).size, 1);
  for (const agent of additions) {
    assert.equal(agent.speciesId, SPECIES);
    assert.equal(agent.habitat, 'pelagic-water-column');
    assert.ok(agent.id.includes(`:pelagic:${agent.refugeHostId}:fish:`));
    assert.ok(generator.chunk(4, -2).elements.some(host => host.id === agent.refugeHostId));
    const placement = plan.placements.find(site => site.schoolSlot === agent.schoolSlot);
    assert.ok(placement);
    assert.equal(agent.preferredDepthM, placement.depthM);
    assert.ok(Math.abs(OCEAN_SURFACE_Y - agent.position.y - placement.depthM) < 1e-12);
    assert.deepEqual(agent.schoolHome, placement.schoolHome);
    assert.equal(agent.lastFeedAt, null);
    assertWaterColumn(generator, agent);
  }
  assert.equal(hash(speciesById), shallowCatalog);
  assert.equal(speciesById[SPECIES], undefined);
  assert.equal(hash(generator.chunk(4, -2)), scenery);
  assert.deepEqual(store.records.get(`${WORLD}|${REGION}`), current);
  const reordered = setup();
  await reordered.ecology.update(FAR);
  await reordered.ecology.update(CENTER);
  assert.deepEqual(reordered.ecology._active.get(REGION), current);
});

test('old live/dead records, clocks and resources survive a saved-before-activation append', async () => {
  const { ecology, store } = setup();
  const old = legacyRecord(ecology), oldHash = hash(old);
  store.records.set(`${WORLD}|${REGION}`, clone(old));
  forbidRebuild(ecology);
  let checkedSave = false;
  store.onSave = (world, id, state) => {
    if (id !== REGION) return;
    assert.equal(world, WORLD);
    assert.equal(ecology._active.has(REGION), false);
    assert.equal(hash(previousProjection(state, old.agents.length)), oldHash);
    checkedSave = true;
  };
  await ecology.update(CENTER);
  const current = ecology._active.get(REGION);
  assert.ok(checkedSave);
  assert.equal(hash(previousProjection(current, old.agents.length)), oldHash);
  assert.deepEqual(store.records.get(`${WORLD}|${REGION}`), current);
  assert.equal(current.pelagicInitializedAtSec, old.timeSec);
  for (const agent of current.agents.slice(old.agents.length)) {
    assert.equal(agent.stateSince, old.timeSec);
    assert.equal(agent.nextDecision, old.timeSec);
    assert.ok(agent.nextBite >= old.timeSec);
    assert.equal(agent.lastFeedAt, null);
  }
  const pausedHash = hash(current);
  ecology.step(0, { hour: 0, foodSupply: 0 });
  assert.equal(hash(current), pausedHash);
  assert.equal(ecology._supplementPelagicRegion(current), false);
  assert.equal(hash(current), pausedHash);
  assert.ok([...store.records.keys()].every(key => key.startsWith(`${WORLD}|`)));
});

test('existing live or dead fusiliers occupy the category before its first version marker', () => {
  for (const alive of [false, true]) {
    const { ecology } = setup();
    const donor = ecology._createRegion(4, -2);
    ecology._supplementPelagicRegion(donor);
    const existing = clone(donor.agents[0]);
    existing.alive = alive; existing.state = alive ? 'schooling' : 'dead'; existing.energy = alive ? .72 : 0;
    const region = legacyRecord(ecology, 2);
    region.agents.push(existing);
    const before = clone(region);
    assert.equal(ecology._supplementPelagicRegion(region), true);
    assert.deepEqual(previousProjection(region, before.agents.length), before);
    assert.equal(region.agents.filter(agent => agent.speciesId === SPECIES).length, 1);
    assert.equal(region.pelagicCommunityAdded, 0);
    assert.equal(ecology._supplementPelagicRegion(region), false);
  }
});

test('deaths consume slots, fewer than four free slots create no partial school, and no later refill occurs', () => {
  for (const count of [20, 17, 16, 15, 14]) {
    const { ecology } = setup();
    const region = legacyRecord(ecology, count), before = clone(region);
    assert.equal(ecology._supplementPelagicRegion(region), true);
    const additions = region.agents.slice(count);
    assert.deepEqual(previousProjection(region, count), before);
    assert.equal(additions.length, count >= 17 ? 0 : 20 - count);
    assert.equal(region.pelagicCommunityAdded, additions.length);
    assert.ok(region.agents.length <= OCEAN_REGION_AGENT_LIMIT);
    assert.ok(additions.every(agent => agent.speciesId === SPECIES));
    assert.equal(new Set(region.agents.map(agent => agent.id)).size, region.agents.length);
    for (const agent of region.agents) { agent.alive = false; agent.state = 'dead'; agent.energy = 0; }
    const afterDeaths = clone(region);
    assert.equal(ecology._supplementPelagicRegion(region), false);
    assert.deepEqual(region, afterDeaths);
    // Even an externally shortened record with the persisted marker must not
    // turn a one-time model upgrade into a recurring allocation recipe.
    region.agents.length = 0;
    assert.equal(ecology._supplementPelagicRegion(region), false);
    assert.equal(region.agents.length, 0);
  }
});

test('throwing and explicit-null saves roll back both new slope and pelagic cohorts and markers', async () => {
  for (const failure of ['throw', 'null']) {
    const { ecology, store } = setup();
    const old = ecology._createRegion(4, -2);
    old.timeSec = 17.6; old.ticks = 176;
    old.resources = { algae: .21, plankton: .32, detritus: .45 };
    old.ledger = { initial: .98, input: 0, ingested: 0, exported: 0 };
    const expectedHash = hash(old);
    store.records.set(`${WORLD}|${REGION}`, clone(old));
    forbidRebuild(ecology);
    let attempts = 0;
    store.save = async (world, id, state) => {
      if (id !== REGION) return;
      attempts++;
      assert.equal(world, WORLD);
      assert.equal(ecology._active.has(REGION), false);
      assert.equal(state.slopeCommunityVersion, 1);
      assert.equal(state.pelagicCommunityVersion, 1);
      assert.ok(state.agents.some(agent => agent.speciesId === 'lyretail-anthias'));
      assert.ok(state.agents.some(agent => agent.speciesId === SPECIES));
      if (failure === 'throw') throw new Error('combined-upgrade-save-rejected');
      return null;
    };
    await ecology.update(CENTER);
    assert.equal(attempts, 1);
    assert.equal(hash(ecology._active.get(REGION)), expectedHash);
    assert.equal(hash(store.records.get(`${WORLD}|${REGION}`)), expectedHash);
    if (failure === 'throw') {
      assert.equal(ecology.snapshot().metrics.persistenceStatus, 'error');
      assert.match(ecology.snapshot().metrics.storageError, /combined-upgrade-save-rejected/);
    }
  }
});

test('daytime schools move cohesively in the actual water column and consume the balanced plankton ledger', () => {
  const { ecology, generator, region } = pelagicOnly();
  const before = clone(region), intakes = [], feed = ecology._feed.bind(ecology);
  ecology._feed = (record, agent, pool, amount) => {
    const taken = feed(record, agent, pool, amount);
    if (taken > 0) intakes.push({ agentId: agent.id, pool, taken });
    return taken;
  };
  ecology.step(12, { hour: 12, foodSupply: 0, currentMps: 0, turbidity: 0 });
  assert.ok(region.agents.every(agent => agent.state === 'schooling'));
  assert.ok(region.agents.some(agent => distance(agent.position, before.agents.find(prior => prior.id === agent.id).position) > .3));
  assert.ok(intakes.length > 0);
  assert.ok(intakes.every(intake => intake.pool === 'plankton'));
  assert.ok(region.agents.some(agent => agent.lastFeedAt > 0));
  assert.ok(Math.abs(intakes.reduce((total, intake) => total + intake.taken, 0) - region.ledger.ingested) < 1e-12);
  for (const agent of region.agents) {
    assertWaterColumn(generator, agent);
    assert.ok(Math.abs(OCEAN_SURFACE_Y - agent.position.y - agent.preferredDepthM) < .6);
    assert.ok(agent.position.y - oceanSupportHeight(generator, agent.position.x, agent.position.z, { avoidCoral: true }) > 3,
      'midwater fish do not collapse into the old near-bed fish support offset');
    for (const peer of region.agents) assert.ok(distance(agent.position, peer.position) < 4, 'the school remains locally cohesive');
  }
  assertBalance(region);
});

test('pause freezes the cohort, and low light or an empty pool cannot invent successful feeding', () => {
  for (const condition of ['night', 'empty']) {
    const { ecology, generator, region } = pelagicOnly();
    if (condition === 'empty') {
      region.resources.plankton = 0;
      region.ledger.initial = quantity(region.resources);
    }
    const before = clone(region), intakes = [], feed = ecology._feed.bind(ecology);
    ecology._feed = (record, agent, pool, amount) => {
      const taken = feed(record, agent, pool, amount);
      if (taken > 0) intakes.push(taken);
      return taken;
    };
    ecology.step(0, { hour: 0 });
    assert.deepEqual(region, before);
    ecology.step(12, { hour: condition === 'night' ? 0 : 12, foodSupply: 0, currentMps: 0, turbidity: 0 });
    assert.equal(intakes.length, 0);
    assert.ok(region.agents.every(agent => agent.lastFeedAt === null));
    assert.ok(region.agents.every(agent => agent.state === (condition === 'night' ? 'resting' : 'schooling')));
    for (const agent of region.agents) {
      assertWaterColumn(generator, agent);
      assert.ok(agent.position.y - oceanSupportHeight(generator, agent.position.x, agent.position.z, { avoidCoral: true }) > 3);
    }
    assertBalance(region);
  }
});

test('new deaths, individual fields and clocks survive unload, revisit and a fresh model without refill', async () => {
  const { ecology, generator, store } = setup();
  await ecology.update(CENTER);
  const region = ecology._active.get(REGION), victim = region.agents.find(agent => agent.speciesId === SPECIES);
  victim.energy = 1e-12;
  ecology.step(.1);
  assert.equal(victim.alive, false);
  assert.equal(victim.state, 'dead');
  // Match the live-array clock annotation performed by the browser snapshot.
  void ecology.agents;
  const expected = clone(region), expectedHash = hash(expected);
  await ecology.checkpoint();
  await ecology.update(FAR);
  ecology.step(2);
  assert.equal(hash(store.records.get(`${WORLD}|${REGION}`)), expectedHash, 'unloaded time and animals stay frozen');
  await ecology.update(CENTER);
  assert.equal(hash(ecology._active.get(REGION)), expectedHash);
  assert.equal(ecology._supplementPelagicRegion(ecology._active.get(REGION)), false);
  const reopened = new OceanEcology(SEED, generator, { store });
  forbidRebuild(reopened);
  await reopened.update(CENTER);
  assert.deepEqual(reopened._active.get(REGION), expected);
  assert.equal(reopened._active.get(REGION).agents.find(agent => agent.id === victim.id).alive, false);
  assert.equal(reopened._active.get(REGION).timeSec, .1);
});

test('changing observer Y in the same cell never recreates populations or changes their water-column behavior', async () => {
  const first = setup(), second = setup();
  await first.ecology.update({ ...CENTER, y: -15 });
  await second.ecology.update({ ...CENTER, y: 6.5 });
  const before = clone(first.ecology._active.get(REGION));
  await first.ecology.update({ ...CENTER, y: 6.5 });
  assert.deepEqual(first.ecology._active.get(REGION), before);
  first.ecology.step(4, { hour: 12 }); second.ecology.step(4, { hour: 12 });
  assert.deepEqual(first.ecology._active.get(REGION), second.ecology._active.get(REGION));
});
