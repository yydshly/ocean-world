import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createOceanMantaCommunityPlan, OCEAN_MANTA_COMMUNITY_VERSION } from '../src/oceanMantaCommunity.js';

const SEED = '42';
const WORLD = 'ecology-v1:string:42';
const SPECIES = 'reef-manta';
const ORIGIN = 'manta-community-v1';
const MARKERS = ['mantaCommunityVersion', 'mantaCommunityAdded', 'mantaInitializedAtSec'];
const FAR = { x: 2048, z: 2048 };
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

function priorRecord(ecology, cx, cz) {
  const region = ecology._createRegion(cx, cz);
  ecology._supplementSlopeRegion(region);
  ecology._supplementPelagicRegion(region);
  return region;
}

// Real coordinate-seeded fixtures, supplied by the independent planner tests.
// The first has eleven slope animals and six fusiliers before adding one manta;
// the second has a legal column but deliberately no seeded manta encounter.
const PRESENT = Object.freeze({ cx: 4, cz: -2, id: '4,-2', center: { x: 288, z: -96 } });
const EMPTY = Object.freeze({ cx: 5, cz: -2, id: '5,-2', center: { x: 352, z: -96 } });
const fixtures = () => ({ present: PRESENT, empty: EMPTY, combined: PRESENT });

function withoutMantaUpgrade(region) {
  const record = clone(region);
  for (const key of MARKERS) delete record[key];
  record.agents = record.agents.filter(agent => agent.populationOrigin !== ORIGIN);
  return record;
}

function historicalRecord(ecology, fixture, count = null) {
  const region = priorRecord(ecology, fixture.cx, fixture.cz);
  if (count !== null) {
    const donor = priorRecord(ecology, 4, -2).agents.find(agent => agent.speciesId === 'blue-starfish');
    assert.ok(donor);
    region.agents = Array.from({ length: count }, (_, index) => ({ ...clone(donor),
      id: `old:${fixture.id}:${index}`, regionId: fixture.id, populationOrigin: 'historical' }));
  }
  region.timeSec = 112.4; region.ticks = 1124;
  region.resources = { algae: .21, plankton: .33, detritus: .47 };
  region.ledger = { initial: 1.04, input: .27, ingested: .11, exported: .19 };
  region.counters = { feeding: 17, escapes: 3, cleaning: 2, predation: 1, deaths: 2 };
  region.events = [{ id: 'old-event', timeSec: 8.2, type: 'feeding', agentId: 'historical' }];
  for (const [index, agent] of region.agents.entries()) {
    agent.alive = index % 3 !== 0;
    agent.state = agent.alive ? 'foraging' : 'dead';
    agent.energy = agent.alive ? .72 : 0;
    agent.velocity = { x: .013, y: -.002, z: -.01 };
    agent.stateSince = 12.4; agent.lastFeedAt = 8.2;
    agent.nextBite = 114; agent.nextDecision = 115; agent.decisions = 9;
    agent.timeSec = region.timeSec;
  }
  return region;
}

function forbidSavedRebuild(ecology, fixture) {
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== fixture.cx || cz !== fixture.cz, 'a valid saved region cannot reenter initial allocation');
    return create(cx, cz);
  };
}

function mantaOnly() {
  const context = setup(), fixture = fixtures().present;
  const region = context.ecology._createRegion(fixture.cx, fixture.cz);
  region.agents = [];
  assert.equal(context.ecology._supplementMantaRegion(region), true);
  assert.equal(region.agents.length, 1);
  assert.equal(region.agents[0].speciesId, SPECIES);
  region.resources = { algae: .2, plankton: .8, detritus: .3 };
  region.ledger = { initial: quantity(region.resources), input: 0, ingested: 0, exported: 0 };
  context.ecology._active.set(fixture.id, region);
  return { ...context, fixture, region, agent: region.agents[0] };
}

function assertBalance(region) {
  assert.ok(Math.abs(region.ledger.initial + region.ledger.input - region.ledger.ingested -
    region.ledger.exported - quantity(region.resources)) < 1e-12);
}

function assertFiniteSubmerged(generator, fixture, agent) {
  const bounds = generator.chunk(fixture.cx, fixture.cz).bounds;
  assert.ok([agent.position.x, agent.position.y, agent.position.z, agent.preferredDepthM,
    agent.patrolHome.x, agent.patrolHome.z, agent.patrolHome.depthM, agent.orbitRadiusM,
    agent.patrolPhaseRad].every(Number.isFinite));
  assert.ok(agent.position.x >= bounds.minX && agent.position.x <= bounds.maxX);
  assert.ok(agent.position.z >= bounds.minZ && agent.position.z <= bounds.maxZ);
  assert.ok(agent.position.y <= OCEAN_SURFACE_Y - 2 + 1e-9);
  // These are independent finite reference probes beneath centre and half-disc
  // cardinal points. They are not a full-body or swept-path collision proof.
  const radius = agent.sizeM * .5;
  for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
    const support = oceanSupportHeight(generator, agent.position.x + dx, agent.position.z + dz, { avoidCoral: true });
    assert.ok(agent.position.y >= support + 1.5 - 1e-9, 'finite disc reference points clear actual rock/coral support');
  }
}

test('a sparse real-seed manta appends without changing existing animals, scenery or the v1 namespace', async () => {
  const { ecology, generator, store } = setup(), fixture = fixtures().present;
  const baseline = priorRecord(ecology, fixture.cx, fixture.cz), scenery = hash(generator.chunk(fixture.cx, fixture.cz));
  const plan = createOceanMantaCommunityPlan(generator, generator.chunk(fixture.cx, fixture.cz), {
    random: salt => ecology._random(baseline, salt), surface: (x, z, fish) => ecology._surface(x, z, fish) });
  assert.equal(plan.eligible, true); assert.equal(plan.placements.length, 1);
  assert.equal(baseline.agents.length, 17);
  await ecology.update(fixture.center);
  const current = ecology._active.get(fixture.id), additions = current.agents.filter(agent => agent.populationOrigin === ORIGIN);
  assert.deepEqual(withoutMantaUpgrade(current), baseline);
  assert.equal(additions.length, 1);
  assert.equal(current.mantaCommunityVersion, OCEAN_MANTA_COMMUNITY_VERSION);
  assert.equal(current.mantaCommunityAdded, 1);
  assert.equal(current.mantaInitializedAtSec, baseline.timeSec);
  assert.equal(additions[0].habitat, 'manta-water-column');
  assert.equal(additions[0].lastFeedAt, null);
  assertFiniteSubmerged(generator, fixture, additions[0]);
  assert.equal(hash(generator.chunk(fixture.cx, fixture.cz)), scenery);
  assert.deepEqual(store.records.get(`${WORLD}|${fixture.id}`), current);
  assert.ok([...store.records.keys()].every(key => key.startsWith(`${WORLD}|`)));
  const second = setup();
  await second.ecology.update(FAR); await second.ecology.update(fixture.center);
  assert.deepEqual(second.ecology._active.get(fixture.id), current);
});

test('historical living/dead state, timing and ledgers survive the upgrade saved before activation', async () => {
  const { ecology, store } = setup(), fixture = fixtures().present;
  const old = historicalRecord(ecology, fixture), oldHash = hash(old);
  store.records.set(`${WORLD}|${fixture.id}`, clone(old));
  forbidSavedRebuild(ecology, fixture);
  let checked = false;
  store.onSave = (world, id, state) => {
    if (id !== fixture.id) return;
    assert.equal(world, WORLD); assert.equal(ecology._active.has(id), false);
    assert.equal(hash(withoutMantaUpgrade(state)), oldHash);
    checked = true;
  };
  await ecology.update(fixture.center);
  const current = ecology._active.get(fixture.id), agent = current.agents.find(animal => animal.populationOrigin === ORIGIN);
  assert.ok(checked); assert.ok(agent);
  assert.equal(hash(withoutMantaUpgrade(current)), oldHash);
  assert.equal(current.mantaInitializedAtSec, old.timeSec);
  assert.equal(agent.stateSince, old.timeSec);
  assert.ok(agent.nextBite >= old.timeSec); assert.equal(agent.lastFeedAt, null);
  assert.deepEqual(store.records.get(`${WORLD}|${fixture.id}`), current);
  const summary = ecology.snapshot().regions.find(region => region.id === fixture.id);
  assert.equal(summary.mantaCommunityVersion, 1); assert.equal(summary.mantaCommunityAdded, 1);
  assert.equal(summary.mantaInitializedAtSec, old.timeSec);
});

test('a historical living or dead manta occupies its category and can never be automatically refilled', () => {
  for (const alive of [true, false]) {
    const { ecology, agent: donor } = mantaOnly(), fixture = fixtures().present;
    const region = historicalRecord(ecology, fixture, 2);
    const existing = { ...clone(donor), populationOrigin: 'historical', alive,
      state: alive ? 'gliding' : 'dead', energy: alive ? .7 : 0 };
    region.agents.push(existing);
    const before = clone(region);
    assert.equal(ecology._supplementMantaRegion(region), true);
    assert.deepEqual(withoutMantaUpgrade(region), before);
    assert.equal(region.mantaCommunityAdded, 0);
    assert.equal(region.agents.filter(agent => agent.speciesId === SPECIES).length, 1);
    const after = clone(region);
    assert.equal(ecology._supplementMantaRegion(region), false); assert.deepEqual(region, after);
  }
});

test('dead records use the twenty-slot cap, examined full/empty cells stay examined, and allocation is at most one', () => {
  const fixture = fixtures().present;
  for (const count of [20, 19, 17]) {
    const { ecology } = setup(), region = historicalRecord(ecology, fixture, count), before = clone(region);
    assert.ok(region.agents.some(agent => !agent.alive));
    assert.equal(ecology._supplementMantaRegion(region), true);
    assert.deepEqual(withoutMantaUpgrade(region), before);
    assert.equal(region.mantaCommunityAdded, count < 20 ? 1 : 0);
    assert.equal(region.agents.length, Math.min(20, count + 1));
    assert.ok(region.agents.length <= OCEAN_REGION_AGENT_LIMIT);
    for (const agent of region.agents) { agent.alive = false; agent.state = 'dead'; agent.energy = 0; }
    const dead = clone(region); assert.equal(ecology._supplementMantaRegion(region), false); assert.deepEqual(region, dead);
    region.agents.length = 0;
    assert.equal(ecology._supplementMantaRegion(region), false); assert.equal(region.agents.length, 0);
  }
  const { ecology } = setup(), emptyFixture = fixtures().empty;
  const empty = priorRecord(ecology, emptyFixture.cx, emptyFixture.cz), before = clone(empty);
  assert.equal(ecology._supplementMantaRegion(empty), true);
  assert.equal(empty.mantaCommunityAdded, 0);
  assert.deepEqual(withoutMantaUpgrade(empty), before);
  assert.equal(ecology._supplementMantaRegion(empty), false);
});

test('one failed preactivation save rolls back slope, pelagic and manta additions together', async () => {
  const fixture = fixtures().combined;
  for (const failure of ['throw', 'null']) {
    const { ecology, store } = setup(), old = ecology._createRegion(fixture.cx, fixture.cz);
    old.timeSec = 17.6; old.ticks = 176;
    const expected = clone(old);
    store.records.set(`${WORLD}|${fixture.id}`, clone(old));
    forbidSavedRebuild(ecology, fixture);
    let attempts = 0;
    store.save = async (world, id, state) => {
      if (id !== fixture.id) return;
      attempts++;
      assert.equal(world, WORLD); assert.equal(ecology._active.has(id), false);
      assert.equal(state.slopeCommunityVersion, 1); assert.equal(state.pelagicCommunityVersion, 1);
      assert.equal(state.mantaCommunityVersion, 1);
      for (const origin of ['slope-community-v1', 'pelagic-community-v1', ORIGIN]) {
        assert.ok(state.agents.some(agent => agent.populationOrigin === origin));
      }
      if (failure === 'throw') throw new Error('all-community-save-rejected');
      return null;
    };
    await ecology.update(fixture.center);
    assert.equal(attempts, 1);
    assert.deepEqual(ecology._active.get(fixture.id), expected);
    assert.deepEqual(store.records.get(`${WORLD}|${fixture.id}`), expected);
    if (failure === 'throw') {
      assert.equal(ecology.snapshot().metrics.persistenceStatus, 'error');
      assert.match(ecology.snapshot().metrics.storageError, /all-community-save-rejected/);
    }
  }
});

test('day and night ray gliding consumes only actual plankton when the model pool passes its filter threshold', () => {
  for (const hour of [12, 0]) {
    const { ecology, generator, fixture, region, agent } = mantaOnly();
    const before = clone(agent), intakes = [], feed = ecology._feed.bind(ecology);
    ecology._feed = (record, animal, pool, amount) => {
      const taken = feed(record, animal, pool, amount);
      if (taken > 0) intakes.push({ agentId: animal.id, pool, taken });
      return taken;
    };
    for (let index = 0; index < 24; index++) {
      ecology.step(.5, { hour, currentMps: 0, foodSupply: 0, turbidity: 0 });
      assertFiniteSubmerged(generator, fixture, agent);
    }
    assert.equal(agent.state, 'filtering'); assert.ok(agent.lastFeedAt > 0);
    assert.ok(distance(agent.position, before.position) > .3);
    assert.ok(intakes.length > 0); assert.ok(intakes.every(intake => intake.agentId === agent.id && intake.pool === 'plankton'));
    assert.ok(Math.abs(intakes.reduce((total, intake) => total + intake.taken, 0) - region.ledger.ingested) < 1e-12);
    assert.ok(region.resources.plankton < .8); assertBalance(region);
    if (hour === 0) assert.equal(ecology.environmentField.sample(agent.position.x, agent.position.z,
      { hour, currentMps: 0, foodSupply: 0, turbidity: 0 }, OCEAN_SURFACE_Y - agent.position.y).lightAtDepth, 0);
  }
});

test('below-threshold and empty plankton pools permit gliding but cannot create successful intake', () => {
  for (const plankton of [0, .2]) {
    const { ecology, generator, fixture, region, agent } = mantaOnly();
    region.resources.plankton = plankton;
    region.ledger.initial = quantity(region.resources);
    const before = clone(agent);
    ecology.step(12, { hour: 0, currentMps: 0, foodSupply: 0 });
    assert.equal(agent.state, 'gliding'); assert.equal(agent.lastFeedAt, null);
    assert.equal(agent.nextBite, before.nextBite, 'gliding does not consume the next filter-feeding attempt');
    assert.equal(region.ledger.ingested, 0);
    assert.ok(distance(agent.position, before.position) > .3);
    assertFiniteSubmerged(generator, fixture, agent); assertBalance(region);
  }
});

test('pause is exact and the aquatic ray samples light/current at its own depth', () => {
  const { ecology, region, agent } = mantaOnly(), before = clone(region);
  ecology.step(0, { hour: 0, foodSupply: 0 }); assert.deepEqual(region, before);
  const sample = ecology.environmentField.sample, sampled = [];
  ecology.environmentField = { ...ecology.environmentField,
    sample(x, z, baseline, depthM) {
      if (depthM !== undefined) sampled.push({ x, z, depthM });
      return sample(x, z, baseline, depthM);
    } };
  ecology.step(.1, { hour: 12 });
  assert.ok(sampled.some(point => point.x === before.agents[0].position.x && point.z === before.agents[0].position.z &&
    Math.abs(point.depthM - (OCEAN_SURFACE_Y - before.agents[0].position.y)) < 1e-12));
  assert.ok(agent.alive);
});

test('ray death, identity, regional time and every historical field survive unload/revisit and a fresh model', async () => {
  const { ecology, generator, store } = setup(), fixture = fixtures().present;
  await ecology.update(fixture.center);
  const region = ecology._active.get(fixture.id), victim = region.agents.find(agent => agent.speciesId === SPECIES);
  assert.ok(victim); victim.energy = 1e-12;
  ecology.step(.1); assert.equal(victim.alive, false); assert.equal(victim.state, 'dead');
  void ecology.agents;
  const expected = clone(region), expectedHash = hash(expected);
  await ecology.checkpoint(); await ecology.update(FAR); ecology.step(2);
  assert.equal(hash(store.records.get(`${WORLD}|${fixture.id}`)), expectedHash, 'unloaded records freeze');
  await ecology.update(fixture.center);
  assert.equal(hash(ecology._active.get(fixture.id)), expectedHash);
  assert.equal(ecology._supplementMantaRegion(ecology._active.get(fixture.id)), false);
  const reopened = new OceanEcology(SEED, generator, { store });
  forbidSavedRebuild(reopened, fixture); await reopened.update(fixture.center);
  assert.deepEqual(reopened._active.get(fixture.id), expected);
  assert.equal(reopened._active.get(fixture.id).agents.find(agent => agent.id === victim.id).alive, false);
  assert.equal(reopened._active.get(fixture.id).timeSec, .1);
});

test('observer height and fixed-step partitioning cannot drive or rebuild the ray patrol', async () => {
  const first = setup(), second = setup(), fixture = fixtures().present;
  await first.ecology.update({ ...fixture.center, y: -15 });
  await second.ecology.update({ ...fixture.center, y: 6 });
  const before = clone(first.ecology._active.get(fixture.id));
  await first.ecology.update({ ...fixture.center, y: 6 });
  assert.deepEqual(first.ecology._active.get(fixture.id), before);
  first.ecology.step(4, { hour: 12 });
  for (let index = 0; index < 40; index++) second.ecology.step(.1, { hour: 12 });
  assert.deepEqual(first.ecology._active.get(fixture.id), second.ecology._active.get(fixture.id));
});
