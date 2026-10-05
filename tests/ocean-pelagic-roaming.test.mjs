import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';

const SEED = '42', WORLD = 'ecology-v1:string:42';
const SOURCE = '4,-2', DESTINATION = '3,-2', SPECIES = 'yellowtail-fusilier';
const CENTER = { x: 288, z: -96 }, FAR = { x: 2048, z: 2048 };
const BASELINE = { hour: 12, currentMps: 0, foodSupply: 0, turbidity: 0 };
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const quantity = resources => Object.values(resources).reduce((total, value) => total + value, 0);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${message}: expected ${expected}, received ${actual}`);

// Match the IndexedDB adapter's atomic [ownerId, fullState] transaction. A
// rejected or explicitly uncommitted batch leaves every previous record intact.
class MemoryStore {
  available = true;
  records = new Map();
  batches = [];
  singleSaves = [];
  async load(world, id) {
    await this.onLoad?.(world, id);
    return clone(this.records.get(`${world}|${id}`) ?? null);
  }
  async save(world, id, state) {
    const record = clone(state), result = await this.onSave?.(world, id, record);
    if (result === null) return null;
    this.records.set(`${world}|${id}`, record);
    this.singleSaves.push({ world, id, state: clone(record) });
  }
  async saveMany(world, records) {
    const snapshot = records.map(([id, state]) => [id, clone(state)]);
    this.batches.push({ world, records: clone(snapshot) });
    const result = await this.onBatch?.(world, snapshot);
    if (result === null) return null;
    const next = new Map(this.records);
    for (const [id, state] of snapshot) next.set(`${world}|${id}`, state);
    this.records = next;
  }
  async clear(world) {
    for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function gateNextBatch(store) {
  const entered = deferred(), release = deferred();
  store.onBatch = async () => {
    store.onBatch = null;
    entered.resolve();
    await release.promise;
  };
  return { entered: entered.promise, release: release.resolve };
}

function stock(region, plankton = 0) {
  region.resources = { algae: .2, plankton, detritus: .3 };
  region.ledger = { initial: quantity(region.resources), input: 0, ingested: 0, exported: 0 };
  region.counters = { feeding: 0, escapes: 0, cleaning: 0, predation: 0, deaths: 0 };
  region.events = [];
}

function fixture({ reverse = false, sourceTime = 17.4, destinationTime = 1220,
  mobile = true, store = new MemoryStore(), keepSchool = false } = {}) {
  const generator = createOceanGenerator(SEED), ecology = new OceanEcology(SEED, generator, { store });
  const source = ecology._createRegion(4, -2), destination = ecology._createRegion(3, -2);
  source.agents = []; destination.agents = [];
  assert.equal(ecology._supplementPelagicRegion(source), true);
  assert.equal(source.agents.length, 6, 'a real coordinate-seeded plan creates the existing six-member school');
  const agent = source.agents[0], school = clone(source.agents);
  if (!keepSchool) source.agents = [agent];
  source.timeSec = sourceTime; source.ticks = Math.round(sourceTime * 10);
  destination.timeSec = destinationTime; destination.ticks = Math.round(destinationTime * 10);
  // The real seam is clear open water. Only the target is controlled below:
  // normal clocks, energy, physical movement, food and ownership all execute.
  agent.position = { x: 256.015, y: 4, z: -96 };
  agent.target = { ...agent.position };
  agent.velocity = { x: 0, y: 0, z: 0 };
  agent.energy = .72; agent.state = 'schooling'; agent.stateSince = 12.3;
  agent.lastFeedAt = 6.7; agent.nextBite = sourceTime + 100;
  agent.nextDecision = sourceTime + 20;
  stock(source); stock(destination);
  if (mobile) assert.equal(ecology._upgradePelagicMobility(source), true);
  ecology._active = new Map(reverse
    ? [[DESTINATION, destination], [SOURCE, source]]
    : [[SOURCE, source], [DESTINATION, destination]]);
  ecology._center = { cx: 4, cz: -2 };
  ecology._pelagicTarget = (region, animal) => {
    animal.target = { x: animal.position.x - .4, y: animal.position.y, z: animal.position.z };
    return animal.target;
  };
  assert.equal(ecology._pelagicY(agent.position.x, agent.position.z, 4), 4);
  assert.equal(ecology._pelagicY(255.99, agent.position.z, 4), 4);
  return { ecology, generator, store, source, destination, agent, school };
}

function assertBalance(region) {
  close(region.ledger.initial + region.ledger.input - region.ledger.ingested - region.ledger.exported,
    quantity(region.resources), `food balance in ${region.id}`);
}

function storedOwners(store, id, world = WORLD) {
  return [...store.records.entries()].filter(([key]) => key.startsWith(`${world}|`))
    .flatMap(([, record]) => record.agents.filter(agent => agent.id === id));
}

function assertPriorFields(current, previous, message) {
  for (const [key, value] of Object.entries(previous)) {
    assert.deepEqual(current[key], value, `${message}: ${key}`);
  }
}

test('a one-time pelagic metadata upgrade preserves live/dead histories and rejects non-atomic legacy stores', () => {
  const { ecology, source, agent, school } = fixture({ mobile: false });
  const dead = { ...school[1], alive: false, state: 'dead', energy: 0, stateSince: 8.1,
    lastFeedAt: 4.2, nextBite: 9, mobileTimeSec: 9.1, birthRegionId: 'older-owner' };
  const benthos = { id: 'old-bottom', speciesId: 'blue-starfish', alive: false, energy: 0,
    state: 'dead', regionId: SOURCE, position: { x: 280, y: -13, z: -90 } };
  source.agents.push(dead, benthos);
  const before = clone(source);
  assert.equal(ecology._upgradePelagicMobility(source), true);
  for (const [key, value] of Object.entries(before)) {
    if (key !== 'agents') assert.deepEqual(source[key], value, `old regional field ${key}`);
  }
  source.agents.forEach((animal, index) => assertPriorFields(animal, before.agents[index], 'prior individual'));
  assert.deepEqual(benthos, before.agents[2]);
  assert.equal(agent.birthRegionId, SOURCE); assert.equal(agent.mobileTimeSec, source.timeSec);
  assert.equal(agent.fusilierRoamingVersion, 1);
  assert.ok(agent.roamingSchoolRadiusM >= 80 && agent.roamingSchoolRadiusM <= 96);
  assert.ok(Number.isFinite(agent.roamingSchoolPhaseRad) && Number.isFinite(agent.roamingSchoolPeriodSec));
  const upgraded = clone(source);
  source.timeSec += 200;
  assert.equal(ecology._upgradePelagicMobility(source), false);
  assert.deepEqual(source.agents, upgraded.agents, 'owner clock cannot rewrite individual or group history');
  const legacyStore = new MemoryStore(); legacyStore.saveMany = undefined;
  const legacy = fixture({ mobile: false, store: legacyStore }), legacyBefore = clone(legacy.source);
  assert.equal(legacy.ecology._upgradePelagicMobility(legacy.source), false);
  assert.deepEqual(legacy.source, legacyBefore);
});

test('crossing a seam gives exactly one finite XYZ, energy and carried-clock tick in either region order', () => {
  const results = [];
  for (const reverse of [false, true]) {
    const { ecology, source, destination, agent, store } = fixture({ reverse });
    const before = clone(agent), frozen = clone([...ecology._active]);
    ecology.step(0, BASELINE);
    assert.deepEqual([...ecology._active], frozen, 'pause changes no population, clock or food record');
    ecology.step(.1, BASELINE);
    assert.equal(source.agents.length, 0); assert.equal(destination.agents.length, 1);
    assert.equal(destination.agents[0], agent); assert.equal(agent.regionId, DESTINATION);
    assert.equal(agent.id, before.id); assert.equal(agent.birthRegionId, SOURCE);
    assert.ok(distance(before.position, agent.position) > 0);
    assert.ok(distance(before.position, agent.position) <= .025000001, 'no double tick or teleport');
    close(agent.mobileTimeSec, 17.5, 'one individual tick');
    close(agent.energy, before.energy - .000012, 'one energy debit');
    close(source.timeSec, 17.5, 'source time'); close(destination.timeSec, 1220.1, 'destination time');
    assert.equal(agent.stateSince, before.stateSince); assert.equal(agent.lastFeedAt, before.lastFeedAt);
    assert.equal(agent.nextBite, before.nextBite); assert.equal(agent.groupId, before.groupId);
    assert.deepEqual(agent.schoolHome, before.schoolHome); assert.equal(agent.schoolSlot, before.schoolSlot);
    for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis],
      (agent.position[axis] - before.position[axis]) / .1, `published ${axis} velocity`);
    assert.equal(ecology.snapshot().agents[0].timeSec, agent.mobileTimeSec);
    assert.equal(ecology.agents[0].timeSec, agent.mobileTimeSec);
    assert.equal(store.batches.length + store.singleSaves.length, 0, 'the transfer itself performs no I/O');
    assertBalance(source); assertBalance(destination);
    results.push(clone(agent));
  }
  assert.deepEqual(results[0], results[1], 'Map order cannot double-step or alter the transferred individual');
});

test('departure intake stays in the source ledger, while later feeding/rest/death uses the carried clock', () => {
  const { ecology, source, destination, agent } = fixture({ sourceTime: 100, destinationTime: 3 });
  stock(source, .8); stock(destination, .8); agent.nextBite = 100;
  ecology.step(.1, BASELINE);
  close(source.ledger.ingested, .0012, 'source departure intake');
  close(destination.ledger.ingested, 0, 'arrival has no second intake');
  close(agent.lastFeedAt, 100.1, 'departure feed clock');
  agent.nextBite = 100.15;
  ecology.step(.1, BASELINE);
  close(destination.ledger.ingested, .0012, 'following tick spends destination plankton');
  close(agent.lastFeedAt, 100.2, 'arrival does not adopt the younger owner clock');
  ecology.step(.1, { ...BASELINE, hour: 0 });
  assert.equal(agent.state, 'resting'); close(agent.stateSince, 100.3, 'low light transition clock');
  close(destination.ledger.ingested, .0012, 'low light cannot create feeding');
  agent.energy = 1e-12;
  ecology.step(.1, BASELINE);
  assert.equal(agent.alive, false); assert.equal(agent.state, 'dead');
  close(agent.stateSince, 100.4, 'death clock'); assert.equal(destination.counters.deaths, 1);
  assertBalance(source); assertBalance(destination);
});

test('a mobile school target is independent of current owner age and retains its shared birthplace phase', () => {
  const { ecology, source, destination, agent, school } = fixture();
  const actualTarget = OceanEcology.prototype._pelagicTarget;
  const before = actualTarget.call(ecology, source, agent, false);
  const oldSchoolFields = { schoolHome: clone(agent.schoolHome), schoolPhaseRad: agent.schoolPhaseRad,
    schoolSlot: agent.schoolSlot, orbitRadiusM: agent.orbitRadiusM };
  agent.regionId = DESTINATION;
  destination.timeSec += 8000; destination.ticks += 80000;
  assert.deepEqual(actualTarget.call(ecology, destination, agent, false), before,
    'owner age cannot jump patrol phase, route home or preferred depth');
  const peer = clone(school[1]); peer.regionId = SOURCE;
  source.agents.push(peer); ecology._upgradePelagicMobility(source);
  assert.deepEqual(peer.roamingSchoolHome, agent.roamingSchoolHome);
  close(peer.roamingSchoolPhaseRad, agent.roamingSchoolPhaseRad, 'birth school shared phase');
  assert.equal(peer.roamingSchoolPeriodSec, agent.roamingSchoolPeriodSec);
  assert.equal(peer.roamingSchoolRadiusM, agent.roamingSchoolRadiusM);
  assert.deepEqual({ schoolHome: agent.schoolHome, schoolPhaseRad: agent.schoolPhaseRad,
    schoolSlot: agent.schoolSlot, orbitRadiusM: agent.orbitRadiusM }, oldSchoolFields);
});

test('nearby members keep their separation response across a seam without depending on region iteration order', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const { ecology, source, destination, agent, school } = fixture({ reverse });
    const peer = { ...clone(school[1]), position: { x: 255.95, y: 4, z: -95.95 },
      regionId: DESTINATION, energy: .72, nextBite: 1e8, nextDecision: 1e8,
      ...Object.fromEntries(Object.entries(agent).filter(([key]) => key.startsWith('roamingSchool'))),
      fusilierRoamingVersion: 1, birthRegionId: SOURCE, mobileTimeSec: 17.4 };
    destination.agents.push(peer);
    const previous = clone(agent.position);
    ecology.step(.1, BASELINE);
    assert.ok(agent.position.z < previous.z, 'same-group member west/north still causes southward separation');
    assert.ok(distance(agent.position, previous) <= .025000001);
    close(peer.mobileTimeSec, 17.5, 'neighbour ticks once');
    const living = ecology.agents.filter(animal => animal.speciesId === SPECIES);
    assert.equal(living.length, 2); assert.equal(new Set(living.map(animal => animal.id)).size, 2);
    outcomes.push(living.map(clone).sort((a, b) => a.id.localeCompare(b.id)));
    assert.ok(source.agents.length <= 20 && destination.agents.length <= 20);
  }
  assert.deepEqual(outcomes[0], outcomes[1], 'each fixed tick reads one consistent cross-region school pose');
});

test('dead-filled capacity, unloaded/locked neighbours and raised physical support reject illegal crossings', () => {
  for (const block of ['capacity', 'unloaded', 'locked', 'support']) {
    const { ecology, generator, source, destination, agent } = fixture();
    if (block === 'capacity') destination.agents = Array.from({ length: OCEAN_REGION_AGENT_LIMIT }, (_, index) => ({
      id: `dead:${index}`, speciesId: 'blue-starfish', regionId: DESTINATION,
      alive: false, state: 'dead', energy: 0, position: { x: 250, y: -15, z: -96 } }));
    else if (block === 'unloaded') ecology._active.delete(DESTINATION);
    else if (block === 'locked') ecology._lockedRegions.add(DESTINATION);
    else {
      const floorSurface = generator.floorSurface;
      ecology.generator = { ...generator, floorSurface(x, z) {
        const value = floorSurface(x, z);
        return x < 256 ? { ...value, height: 3.5 } : value;
      } };
      assert.equal(ecology.generator.floorSurface(255.99, -96).height, 3.5);
    }
    const previous = clone(agent.position);
    assert.equal(ecology._pelagicCandidate(agent, { ...previous, x: previous.x - .025 }, .025), null,
      `${block} rejects the forbidden destination`);
    ecology.step(.1, BASELINE);
    assert.equal(agent.regionId, SOURCE, block);
    assert.equal(destination.agents.some(animal => animal.id === agent.id), false);
    assert.ok(agent.position.x >= 256, `${block}: no illegal ownership`);
    assert.ok(distance(previous, agent.position) <= .025000001, `${block}: full XYZ speed limit`);
    assert.ok(agent.position.y >= ecology._surface(agent.position.x, agent.position.z, true) + 1 - 1e-10);
    assert.ok(agent.position.y <= OCEAN_SURFACE_Y - 1.5);
    for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis],
      (agent.position[axis] - previous[axis]) / .1, `${block}: actual ${axis} velocity`);
    assert.equal(ecology._transfers.length, 0);
  }
});

test('competing school arrivals count dead records and publish each stable identity only once', () => {
  const { ecology, source, destination, agent, school } = fixture();
  const second = { ...clone(agent), id: school[1].id, schoolSlot: 1,
    position: { ...agent.position, z: agent.position.z + .8 } };
  source.agents.push(second);
  destination.agents = Array.from({ length: 19 }, (_, index) => ({ id: `dead:${index}`,
    speciesId: 'blue-starfish', regionId: DESTINATION, alive: false, state: 'dead',
    energy: 0, position: { x: 250, y: -15, z: -96 } }));
  ecology.step(.1, BASELINE);
  assert.equal(destination.agents.length, OCEAN_REGION_AGENT_LIMIT); assert.equal(source.agents.length, 1);
  const schoolAfter = ecology.agents.filter(animal => animal.speciesId === SPECIES);
  assert.equal(schoolAfter.length, 2); assert.equal(new Set(schoolAfter.map(animal => animal.id)).size, 2);
  assert.equal(schoolAfter.filter(animal => animal.regionId === DESTINATION).length, 1);
  for (const fish of schoolAfter) close(fish.mobileTimeSec, 17.5, 'one tick per competing arrival');
});

test('a clear endpoint cannot skip a narrow intervening support barrier and drift spends the same XYZ budget', () => {
  const { ecology, generator, agent } = fixture();
  const requested = { ...agent.position, x: agent.position.x - .025 };
  assert.ok(ecology._pelagicCandidate(agent, requested, .025), 'the real unobstructed seam is legal');
  const floorSurface = generator.floorSurface;
  ecology.generator = { ...generator, floorSurface(x, z) {
    const value = floorSurface(x, z);
    return x > 256.0023 && x < 256.0027 ? { ...value, height: 4 } : value;
  } };
  assert.ok(ecology._surface(requested.x, requested.z, true) + 1 < requested.y,
    'the endpoint stays clear, isolating the actual swept reference probes');
  assert.equal(ecology._pelagicCandidate(agent, requested, .025), null,
    'a supported final pose cannot tunnel through the intervening rock reference');
  ecology.generator = generator;
  agent.position = { x: 256.1, y: 4, z: -96 };
  const previous = clone(agent.position), current = { x: .8, z: .2 }, dt = .1;
  const budget = .25 * dt + Math.hypot(current.x, current.z) * .04 * dt;
  ecology._moveRoamingPelagic(agent, { x: 255.7, y: 4.6, z: -95.5 }, .25, dt, current);
  ecology._applyMantaTransfers();
  assert.ok(distance(previous, agent.position) > 0);
  assert.ok(distance(previous, agent.position) <= budget + 1e-10);
  assert.ok(agent.position.y >= ecology._surface(agent.position.x, agent.position.z, true) + 1);
  for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis],
    (agent.position[axis] - previous[axis]) / dt, `drifting ${axis} velocity`);
});

test('a persisted ever-occupied school category prevents a departed or dead school from being allocated again', () => {
  const { ecology, source, agent } = fixture();
  ecology.step(.1, BASELINE);
  assert.equal(agent.regionId, DESTINATION); assert.equal(source.pelagicEverOccupied, true);
  // The durable occupancy marker is independently necessary if a historical
  // community marker is absent. The real seed would otherwise allocate six.
  delete source.pelagicCommunityVersion;
  assert.equal(ecology._supplementPelagicRegion(source), true);
  assert.equal(source.pelagicCommunityAdded, 0); assert.equal(source.agents.length, 0);
  const dead = { ...clone(agent), id: `${agent.id}:historical-dead`, regionId: SOURCE, alive: false, state: 'dead', energy: 0 };
  source.agents.push(dead); delete source.pelagicCommunityVersion;
  const before = clone(dead);
  assert.equal(ecology._supplementPelagicRegion(source), true);
  assert.equal(source.agents.length, 1); assert.deepEqual(source.agents[0], before);
  const frozenTime = dead.mobileTimeSec;
  ecology.step(.1, BASELINE);
  assert.equal(dead.mobileTimeSec, frozenTime, 'death occupies capacity but is never simulated or recruited');
});

test('the old-record mobility transaction commits before activation and preserves all existing fields', async () => {
  const { ecology, generator, store, source, agent } = fixture({ mobile: false });
  source.slopeCommunityVersion = source.pelagicCommunityVersion = source.mantaCommunityVersion = 1;
  source.events = [{ id: 'old-event', timeSec: 6.7, type: 'feeding', agentId: agent.id }];
  source.counters.feeding = 7;
  const previous = clone(source);
  await store.save(WORLD, SOURCE, previous); store.singleSaves.length = 0;
  const entered = deferred(), release = deferred();
  store.onSave = async (world, id, state) => {
    if (id !== SOURCE) return;
    assert.equal(state.agents[0].fusilierRoamingVersion, 1);
    assert.equal(reopened._active.has(SOURCE), false, 'old records are not published before their metadata commits');
    entered.resolve(); await release.promise;
  };
  const reopened = new OceanEcology(SEED, generator, { store }), loading = reopened.update(CENTER);
  await entered.promise;
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous, 'disk still contains the complete old record');
  release.resolve(); await loading;
  const restored = reopened._active.get(SOURCE);
  for (const [key, value] of Object.entries(previous)) if (key !== 'agents') assert.deepEqual(restored[key], value);
  assertPriorFields(restored.agents[0], previous.agents[0], 'saved old individual');
  assert.equal(restored.agents[0].mobileTimeSec, previous.timeSec);
  assert.equal(restored.agents[0].fusilierRoamingVersion, 1);
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), restored);
});

test('failed preactivation mobility saves expose only the base state and retry without replacing histories', async () => {
  for (const failure of ['throw', 'null']) {
    const { generator, store, source } = fixture({ mobile: false });
    source.slopeCommunityVersion = source.pelagicCommunityVersion = source.mantaCommunityVersion = 1;
    const previous = clone(source);
    await store.save(WORLD, SOURCE, previous);
    store.onSave = (world, id) => {
      if (id !== SOURCE) return;
      if (failure === 'throw') throw new Error('pelagic-metadata-upgrade-rejected');
      return null;
    };
    const reopened = new OceanEcology(SEED, generator, { store });
    await reopened.update(CENTER);
    assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous, 'no partial metadata persisted');
    const base = reopened._active.get(SOURCE);
    if (base) assert.deepEqual(base, previous, 'failed upgrade cannot activate mobile history');
    store.onSave = null;
    await reopened.update(FAR); await reopened.update(CENTER);
    const restored = reopened._active.get(SOURCE);
    assert.ok(restored); assert.equal(restored.agents[0].fusilierRoamingVersion, 1);
    assertPriorFields(restored.agents[0], previous.agents[0], 'retry preserves the same old individual');
    assert.equal(restored.agents[0].mobileTimeSec, previous.timeSec);
    assert.equal(storedOwners(store, previous.agents[0].id).length, 1);
  }
});

test('departure ownership is atomically saved and pause/unload/revisit/refresh cannot refill the birthplace', async () => {
  const { ecology, generator, store, source, destination, agent } = fixture();
  ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  assert.equal(source.pelagicEverOccupied, true); assert.equal(destination.pelagicEverOccupied, true);
  await ecology.checkpoint();
  assert.equal(store.batches.length, 1); assert.equal(store.singleSaves.length, 0);
  assert.equal(store.batches[0].records.length, 2);
  assert.equal(store.records.get(`${WORLD}|${SOURCE}`).agents.some(animal => animal.id === agent.id), false);
  assert.deepEqual(storedOwners(store, agent.id), [expected]);
  const paused = clone([...ecology._active]); ecology.step(0, BASELINE);
  assert.deepEqual([...ecology._active], paused);
  await ecology.update(FAR); await ecology.update(CENTER);
  assert.deepEqual(ecology.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(ecology._active.get(SOURCE).agents.some(animal => animal.speciesId === SPECIES), false,
    'returning to the seeded school birth cell cannot refill a departed cohort');
  const reopened = new OceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  assert.deepEqual(reopened.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(reopened._active.get(SOURCE).agents.some(animal => animal.speciesId === SPECIES), false);
  assert.equal(storedOwners(store, agent.id).length, 1);
  assert.ok(reopened.snapshot().metrics.activeRegions <= 9);
  assert.ok(reopened.snapshot().regions.every(region => region.agentCount <= OCEAN_REGION_AGENT_LIMIT));
});

test('queued atomic checkpoints snapshot ownership at execution rather than queue time', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), first = ecology.checkpoint(); await gate.entered;
  const second = ecology.checkpoint(); ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  gate.release(); await Promise.all([first, second]);
  assert.equal(store.batches.length, 2);
  assert.equal(store.batches[0].records.find(([id]) => id === SOURCE)[1].agents[0].regionId, SOURCE);
  assert.deepEqual(storedOwners(store, agent.id), [expected], 'latest coherent batch owns the individual only in its destination');
});

test('a failed birth-cell read never allocates a duplicate school and an explicit retry restores the departed identity', async () => {
  const { ecology, store, agent } = fixture();
  ecology.step(.1, BASELINE); const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  await ecology.checkpoint(); await ecology.update(FAR);
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== 4 || cz !== -2, 'a failed read cannot rebuild the school birth cell');
    return create(cx, cz);
  };
  store.onLoad = (world, id) => { if (id === SOURCE) throw new Error('birth-cell read unavailable'); };
  assert.equal(await ecology.update(CENTER), false);
  assert.equal(ecology._active.has(SOURCE), false); assert.equal(ecology._center, null);
  assert.equal(storedOwners(store, agent.id).length, 1);
  store.onLoad = null; await ecology.update(CENTER);
  assert.deepEqual(ecology.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(ecology._active.get(SOURCE).agents.some(animal => animal.speciesId === SPECIES), false);
});

test('pre-unload locks freeze owner clocks and a failed coherent save retains both regions for retry', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), leaving = ecology.update(FAR); await gate.entered;
  assert.ok(ecology._lockedRegions.has(SOURCE)); assert.ok(ecology._lockedRegions.has(DESTINATION));
  const frozen = clone([...ecology._active]); ecology.step(.2, BASELINE);
  assert.deepEqual([...ecology._active], frozen, 'locked exits cannot accumulate unsaved behavioural ticks');
  gate.release(); await leaving;
  assert.equal(ecology._active.has(SOURCE), false); assert.equal(ecology._lockedRegions.size, 0);
  assert.equal(storedOwners(store, agent.id).length, 1);
  for (const failure of ['throw', 'null']) {
    const context = fixture(); context.ecology.step(.1, BASELINE); await context.ecology.checkpoint();
    const previous = clone([...context.store.records]);
    context.store.onBatch = () => { if (failure === 'throw') throw new Error('ownership-save-rejected'); return null; };
    assert.equal(await context.ecology.update(FAR), false);
    assert.deepEqual([...context.store.records], previous, 'no source or destination partially commits');
    assert.equal(context.ecology._active.get(SOURCE), context.source);
    assert.equal(context.ecology._active.get(DESTINATION), context.destination);
    assert.equal(context.ecology._lockedRegions.size, 0); assert.equal(context.ecology._center, null);
    context.store.onBatch = null; await context.ecology.update(FAR);
    assert.equal(context.ecology._active.has(SOURCE), false);
    assert.equal(storedOwners(context.store, context.agent.id).length, 1);
  }
});

test('restored mobile history stays local with a legacy store and never publishes a non-atomic transfer', async () => {
  const { generator, store, source, destination, agent } = fixture();
  agent.position.x = 256.505; agent.target = { ...agent.position };
  const expected = clone(agent);
  await store.save(WORLD, SOURCE, source); await store.save(WORLD, DESTINATION, destination);
  store.saveMany = undefined;
  const reopened = new OceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  const restored = reopened._active.get(SOURCE).agents.find(animal => animal.id === agent.id);
  assert.ok(restored); assertPriorFields(restored, expected, 'restored legacy record');
  assert.ok(reopened._active.get(DESTINATION).agents.length < OCEAN_REGION_AGENT_LIMIT);
  reopened._pelagicTarget = (region, animal) => ({ x: animal.position.x - .4, y: animal.position.y, z: animal.position.z });
  const previous = clone(restored.position); reopened.step(.1, BASELINE);
  assert.equal(restored.regionId, SOURCE); assert.ok(restored.position.x >= 256.5);
  assert.ok(distance(previous, restored.position) <= .025000001);
  close(restored.mobileTimeSec, 17.5, 'existing individual history advances once');
  assert.equal(reopened._active.get(DESTINATION).agents.some(animal => animal.id === agent.id), false);
  assert.equal(reopened.agents.filter(animal => animal.id === agent.id).length, 1);
  await reopened.checkpoint(); assert.equal(store.batches.length, 0);
  assert.equal(storedOwners(store, agent.id).length, 1);
});
