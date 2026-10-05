import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';

const SEED = '42', WORLD = 'ecology-v1:string:42';
const SOURCE = '4,-2', DESTINATION = '3,-2';
const FAR = { x: 2048, z: 2048 };
const BASELINE = { hour: 12, currentMps: 0, foodSupply: 0, turbidity: 0 };
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const quantity = resources => Object.values(resources).reduce((total, value) => total + value, 0);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${message}: expected ${expected}, received ${actual}`);

// Atomic in-memory test storage uses the same [regionId, state] tuples as the
// IndexedDB adapter. A failure/gate runs before replacing any record.
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
    const record = clone(state);
    await this.onSave?.(world, id, record);
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
  mobile = true, store = new MemoryStore() } = {}) {
  const generator = createOceanGenerator(SEED);
  const ecology = new OceanEcology(SEED, generator, { store });
  const source = ecology._createRegion(4, -2), destination = ecology._createRegion(3, -2);
  source.agents = []; destination.agents = [];
  assert.equal(ecology._supplementMantaRegion(source), true);
  assert.equal(source.agents.length, 1, 'the real coordinate-seeded source contains one ray');
  const agent = source.agents[0];
  source.timeSec = sourceTime; source.ticks = Math.round(sourceTime * 10);
  destination.timeSec = destinationTime; destination.ticks = Math.round(destinationTime * 10);
  agent.position = { x: 256.015, y: 4, z: -96 };
  agent.target = { ...agent.position };
  agent.velocity = { x: 0, y: 0, z: 0 };
  agent.sizeM = 3.15;
  agent.energy = .72; agent.state = 'gliding'; agent.stateSince = 12.3;
  agent.lastFeedAt = 6.7; agent.nextBite = sourceTime + 100;
  agent.nextDecision = sourceTime + 20; agent.patrolStartedAtSec = 3.1;
  stock(source); stock(destination);
  if (mobile) assert.equal(ecology._upgradeMantaMobility(source), true);
  ecology._active = new Map(reverse
    ? [[DESTINATION, destination], [SOURCE, source]]
    : [[SOURCE, source], [DESTINATION, destination]]);
  ecology._center = { cx: 4, cz: -2 };
  // A deterministic seam-directed goal isolates ownership from the long roam.
  // Actual stepping, support probes, food accounting and transfers are retained.
  ecology._mantaTarget = (region, animal) => {
    animal.target = { x: animal.position.x - .4, y: animal.position.y, z: animal.position.z };
    return animal.target;
  };
  assert.equal(ecology._mantaY(agent.position.x, agent.position.z, 4, agent.sizeM), 4);
  assert.equal(ecology._mantaY(255.965, agent.position.z, 4, agent.sizeM), 4);
  return { ecology, generator, store, source, destination, agent };
}

function assertBalance(region) {
  close(region.ledger.initial + region.ledger.input - region.ledger.ingested - region.ledger.exported,
    quantity(region.resources), `food balance in ${region.id}`);
}

function storedOwners(store, id, world = WORLD) {
  return [...store.records.entries()].filter(([key]) => key.startsWith(`${world}|`))
    .flatMap(([, record]) => record.agents.filter(agent => agent.id === id));
}

test('mobility upgrades preserve every old field and do not enable unsupported legacy stores', () => {
  const { ecology, source, agent } = fixture({ mobile: false });
  const other = { id: 'old-benthos', speciesId: 'blue-starfish', regionId: SOURCE,
    alive: false, state: 'dead', stateSince: 9, lastFeedAt: 4, energy: 0,
    position: { x: 281, y: -14, z: -94 }, timeSec: source.timeSec };
  source.agents.push(other);
  const before = clone(source);
  assert.equal(ecology._upgradeMantaMobility(source), true);
  for (const [key, value] of Object.entries(before)) {
    if (key !== 'agents') assert.deepEqual(source[key], value, `old regional field ${key}`);
  }
  for (const [key, value] of Object.entries(before.agents[0])) {
    assert.deepEqual(agent[key], value, `old ray field ${key}`);
  }
  assert.deepEqual(other, before.agents[1]);
  assert.equal(agent.birthRegionId, SOURCE); assert.equal(agent.mobileTimeSec, source.timeSec);
  assert.equal(agent.roamingVersion, 1); assert.ok(agent.roamingRadiusM >= 80);
  const upgraded = clone(agent);
  source.timeSec += 200;
  assert.equal(ecology._upgradeMantaMobility(source), false);
  assert.deepEqual(agent, upgraded, 'a later owner clock cannot overwrite existing mobility history');

  const legacyStore = new MemoryStore(); legacyStore.saveMany = undefined;
  const legacy = fixture({ store: legacyStore, mobile: false }), legacyBefore = clone(legacy.source);
  assert.equal(legacy.ecology._upgradeMantaMobility(legacy.source), false);
  assert.deepEqual(legacy.source, legacyBefore);
});

test('a seam transfer advances one finite movement/energy/individual-clock step under either region order', () => {
  const results = [];
  for (const reverse of [false, true]) {
    const { ecology, store, source, destination, agent } = fixture({ reverse });
    const before = clone(agent), frozen = clone([...ecology._active]);
    ecology.step(0, BASELINE);
    assert.deepEqual([...ecology._active], frozen, 'pause changes no records');
    ecology.step(.1, BASELINE);
    assert.equal(source.agents.length, 0); assert.equal(destination.agents.length, 1);
    assert.equal(destination.agents[0], agent); assert.equal(agent.regionId, DESTINATION);
    assert.equal(agent.birthRegionId, SOURCE); assert.equal(agent.id, before.id);
    assert.ok(distance(before.position, agent.position) > 0);
    assert.ok(distance(before.position, agent.position) <= .050001, 'crossing cannot teleport or move twice');
    close(agent.mobileTimeSec, 17.5, 'individual clock advances once');
    close(agent.energy, before.energy - .000012, 'energy advances once');
    close(source.timeSec, 17.5, 'source clock'); close(destination.timeSec, 1220.1, 'destination clock');
    assert.equal(agent.stateSince, before.stateSince); assert.equal(agent.lastFeedAt, before.lastFeedAt);
    assert.equal(agent.nextBite, before.nextBite); assert.equal(agent.patrolStartedAtSec, before.patrolStartedAtSec);
    assert.equal(ecology.agents[0].timeSec, agent.mobileTimeSec);
    assert.equal(ecology.snapshot().agents[0].timeSec, agent.mobileTimeSec);
    assert.equal(store.batches.length, 0); assert.equal(store.singleSaves.length, 0, 'transfer itself performs no I/O');
    assertBalance(source); assertBalance(destination);
    results.push(clone(agent));
  }
  assert.deepEqual(results[0], results[1], 'Map iteration order cannot change the transferred individual');
});

test('departure consumes its source pool; subsequent intake and death use the carried individual clock', () => {
  const { ecology, source, destination, agent } = fixture({ sourceTime: 100, destinationTime: 3 });
  stock(source, .8); stock(destination, .8);
  agent.nextBite = 100;
  ecology.step(.1, BASELINE);
  close(source.ledger.ingested, .0035, 'departure tick source ingestion');
  assert.equal(destination.ledger.ingested, 0);
  close(agent.lastFeedAt, 100.1, 'departure intake history');
  assert.ok(agent.nextBite > agent.mobileTimeSec);
  agent.nextBite = 100.15;
  ecology.step(.1, BASELINE);
  close(destination.ledger.ingested, .0035, 'next tick destination ingestion');
  close(agent.lastFeedAt, 100.2, 'arrival intake history does not fall back to destination time');
  assertBalance(source); assertBalance(destination);
  agent.energy = 1e-12;
  ecology.step(.1, BASELINE);
  assert.equal(agent.alive, false); assert.equal(agent.state, 'dead');
  close(agent.stateSince, 100.3, 'death uses the individual clock');
  assert.equal(destination.counters.deaths, 1);
});

test('dead-filled capacity, unloaded/locked neighbours and invalid real support probes block a crossing', () => {
  for (const block of ['capacity', 'unloaded', 'locked', 'support']) {
    const { ecology, generator, source, destination, agent } = fixture();
    if (block === 'capacity') {
      destination.agents = Array.from({ length: OCEAN_REGION_AGENT_LIMIT }, (_, index) => ({
        id: `dead:${index}`, speciesId: 'blue-starfish', regionId: DESTINATION,
        alive: false, state: 'dead', energy: 0, position: { x: 250, y: -15, z: -96 } }));
    } else if (block === 'unloaded') ecology._active.delete(DESTINATION);
    else if (block === 'locked') ecology._lockedRegions.add(DESTINATION);
    else {
      // A sharp elevated-floor fixture is outside the initial western wing
      // probe but inside the candidate's probe. It exercises the actual shared
      // support query rather than replacing the movement/transfer method.
      const sample = generator.sample, floorSurface = generator.floorSurface;
      ecology.generator = { ...generator, sample(x, z) {
        const value = sample(x, z);
        return x < 254.215 ? { ...value, floorY: OCEAN_SURFACE_Y, depthM: 0 } : value;
      }, floorSurface(x, z) {
        // Keep the synthetic western wall in the actual rendered-bed query,
        // as well as the environmental sampler; movement uses the former.
        const value = floorSurface(x, z);
        return x < 254.215 ? { ...value, height: OCEAN_SURFACE_Y } : value;
      } };
      assert.equal(ecology.generator.floorSurface(254.2, agent.position.z).height, OCEAN_SURFACE_Y);
      assert.equal(ecology._mantaY(agent.position.x, agent.position.z, 4, agent.sizeM), 4);
      assert.equal(ecology._mantaY(255.965, agent.position.z, 4, agent.sizeM), null);
    }
    const before = clone(agent.position);
    assert.equal(ecology._mantaCandidate(agent, { ...before, x: before.x - .05 }, .05), null,
      `${block} rejects the intended western step`);
    ecology.step(.1, BASELINE);
    assert.equal(agent.regionId, SOURCE, block); assert.equal(source.agents[0], agent);
    assert.ok(distance(agent.position, before) > 0, `${block} permits a safe local alternative`);
    assert.ok(distance(agent.position, before) <= .050001, `${block} obeys the XYZ step limit`);
    assert.ok(agent.position.x >= 256, `${block} cannot publish the forbidden western crossing`);
    close(ecology._mantaY(agent.position.x, agent.position.z, OCEAN_SURFACE_Y - agent.position.y, agent.sizeM),
      agent.position.y, `${block} final footprint support`);
    for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis],
      (agent.position[axis] - before[axis]) / .1, `${block} ${axis} velocity`);
    assert.equal(destination.agents.some(animal => animal.id === agent.id), false);
    assert.equal(ecology._transfers.length, 0);
    assert.ok(source.agents.length <= OCEAN_REGION_AGENT_LIMIT);
    assert.ok(destination.agents.length <= OCEAN_REGION_AGENT_LIMIT);
  }
});

test('a future wing-support probe cannot teleport a mobile ray upward while crossing a seam', () => {
  const { ecology, generator, source, destination, agent } = fixture();
  const sample = generator.sample, floorSurface = generator.floorSurface;
  ecology.generator = { ...generator, sample(x, z) {
    const value = sample(x, z);
    return x < 254.215 ? { ...value, floorY: 4, depthM: OCEAN_SURFACE_Y - 4 } : value;
  }, floorSurface(x, z) {
    const value = floorSurface(x, z);
    return x < 254.215 ? { ...value, height: 4 } : value;
  } };
  assert.equal(ecology.generator.floorSurface(254.2, agent.position.z).height, 4);
  assert.equal(ecology._mantaY(agent.position.x, agent.position.z, 4, agent.sizeM), 4);
  assert.equal(ecology._mantaY(255.965, agent.position.z, 4, agent.sizeM), 5.5,
    'the candidate is submerged but needs an impossible 1.5 m upward step');
  const before = clone(agent.position);
  assert.equal(ecology._mantaCandidate(agent, { ...before, x: before.x - .05 }, .05), null,
    'the raised western candidate exceeds the actual XYZ budget');
  ecology.step(.1, BASELINE);
  assert.ok(distance(agent.position, before) > 0, 'a safe local alternative keeps the ray moving');
  assert.ok(distance(agent.position, before) <= .050001, 'a .05 m step cannot publish a 1.5 m lift');
  close(agent.position.y, before.y, 'the safe alternative does not lift onto the western obstacle');
  assert.equal(agent.regionId, SOURCE); assert.equal(source.agents[0], agent);
  assert.equal(destination.agents.some(animal => animal.id === agent.id), false);
  for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis],
    (agent.position[axis] - before[axis]) / .1, `safe alternative ${axis} velocity`);
  assert.equal(ecology._transfers.length, 0);
  close(agent.mobileTimeSec, 17.5, 'local steering still has exactly one individual-clock tick');
});

test('restored roaming metadata cannot transfer ownership through a store without atomic batch support', async () => {
  const { generator, store, source, destination, agent } = fixture();
  const saved = clone(agent);
  await store.save(WORLD, SOURCE, source); await store.save(WORLD, DESTINATION, destination);
  store.saveMany = undefined;
  const reopened = new OceanEcology(SEED, generator, { store });
  await reopened.update({ x: 288, z: -96 });
  const restored = reopened._active.get(SOURCE).agents.find(animal => animal.id === agent.id);
  assert.ok(restored); assert.equal(restored.roamingVersion, 1);
  for (const field of ['birthRegionId', 'mobileTimeSec', 'roamingRadiusM', 'roamingStartedAtSec', 'roamingPhaseRad']) {
    assert.equal(restored[field], saved[field], `restored metadata ${field}`);
  }
  assert.ok(reopened._active.get(DESTINATION).agents.length < OCEAN_REGION_AGENT_LIMIT,
    'the destination has room, so storage capability is the actual blocker');
  reopened._mantaTarget = (region, animal) => {
    animal.target = { x: animal.position.x - .4, y: animal.position.y, z: animal.position.z };
    return animal.target;
  };
  reopened.step(.1, BASELINE);
  assert.deepEqual(restored.position, saved.position);
  assert.equal(restored.regionId, SOURCE); assert.equal(restored.birthRegionId, SOURCE);
  assert.equal(restored.roamingVersion, 1, 'existing metadata is preserved rather than discarded');
  assert.equal(restored.roamingRadiusM, saved.roamingRadiusM);
  assert.equal(restored.roamingPhaseRad, saved.roamingPhaseRad);
  close(restored.mobileTimeSec, 17.5, 'restored individual clock still advances once');
  assert.equal(reopened._active.get(DESTINATION).agents.some(animal => animal.id === agent.id), false);
  assert.equal(reopened.agents.filter(animal => animal.id === agent.id).length, 1);
  await reopened.checkpoint();
  assert.equal(store.batches.length, 0);
  assert.equal(storedOwners(store, agent.id).length, 1);
  assert.equal(storedOwners(store, agent.id)[0].regionId, SOURCE);
});

test('competing arrivals recheck the twenty-record limit and retain each identity exactly once', () => {
  const { ecology, source, destination, agent } = fixture();
  const second = { ...clone(agent), id: `${agent.id}:second`, position: { ...agent.position, z: -95 } };
  source.agents.push(second);
  destination.agents = Array.from({ length: OCEAN_REGION_AGENT_LIMIT - 1 }, (_, index) => ({
    id: `dead:${index}`, speciesId: 'blue-starfish', regionId: DESTINATION,
    alive: false, state: 'dead', energy: 0, position: { x: 250, y: -15, z: -96 } }));
  ecology.step(.1, BASELINE);
  assert.equal(destination.agents.length, OCEAN_REGION_AGENT_LIMIT);
  assert.equal(source.agents.length, 1);
  const rays = ecology.agents.filter(animal => animal.speciesId === 'reef-manta');
  assert.equal(rays.length, 2); assert.equal(new Set(rays.map(animal => animal.id)).size, 2);
  assert.equal(rays.filter(animal => animal.regionId === DESTINATION).length, 1);
  for (const ray of rays) close(ray.mobileTimeSec, 17.5, 'each competing ray advances once');
});

test('one atomic checkpoint and a fresh model restore only the destination identity and its carried history', async () => {
  const { ecology, generator, store, source, destination, agent } = fixture();
  ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  await ecology.checkpoint();
  assert.equal(store.batches.length, 1); assert.equal(store.singleSaves.length, 0);
  assert.equal(store.batches[0].records.length, 2);
  assert.equal(store.records.get(`${WORLD}|${SOURCE}`).agents.some(animal => animal.id === agent.id), false);
  assert.deepEqual(storedOwners(store, agent.id), [expected]);
  assert.equal(source.mantaEverOccupied, true); assert.equal(destination.mantaEverOccupied, true);
  const reopened = new OceanEcology(SEED, generator, { store });
  await reopened.update({ x: 288, z: -96 });
  assert.deepEqual(reopened.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(reopened._active.get(SOURCE).agents.some(animal => animal.id === agent.id), false);
  assert.ok(reopened.snapshot().metrics.activeRegions <= 9);
  assert.ok(reopened.snapshot().regions.every(region => region.agentCount <= OCEAN_REGION_AGENT_LIMIT));
});

test('queued checkpoints capture ownership when they execute, after an earlier gated batch completes', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), first = ecology.checkpoint();
  await gate.entered;
  const second = ecology.checkpoint();
  ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  gate.release(); await Promise.all([first, second]);
  assert.equal(store.batches.length, 2);
  assert.equal(store.batches[0].records.find(([id]) => id === SOURCE)[1].agents[0].regionId, SOURCE);
  assert.deepEqual(storedOwners(store, agent.id), [expected], 'the queued second checkpoint includes the later transfer');
});

test('a failed birth-cell read cannot rebuild a departed manta; retry restores one destination identity', async () => {
  const { ecology, store, agent } = fixture();
  ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  await ecology.checkpoint(); await ecology.update(FAR);
  assert.equal(store.records.get(`${WORLD}|${SOURCE}`).agents.length, 0);
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== 4 || cz !== -2, 'a failed read must never reenter birth allocation');
    return create(cx, cz);
  };
  store.onLoad = (world, id) => {
    if (world === WORLD && id === SOURCE) throw new Error('birth-cell read temporarily unavailable');
  };
  assert.equal(await ecology.update({ x: 288, z: -96 }), false);
  assert.equal(ecology._active.has(SOURCE), false); assert.equal(ecology._center, null);
  assert.equal(storedOwners(store, agent.id).length, 1);
  assert.ok(ecology.agents.filter(animal => animal.id === agent.id).length <= 1);
  store.onLoad = null;
  await ecology.update({ x: 288, z: -96 });
  assert.deepEqual(ecology.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(ecology._active.get(SOURCE).agents.some(animal => animal.id === agent.id), false);
  assert.equal(storedOwners(store, agent.id).length, 1);
});

test('pre-unload locks freeze exiting owners; failed atomic saves retain them and allow an explicit retry', async () => {
  const { ecology, store, source, destination, agent } = fixture();
  const gate = gateNextBatch(store), moving = ecology.update(FAR);
  await gate.entered;
  assert.ok(ecology._lockedRegions.has(SOURCE)); assert.ok(ecology._lockedRegions.has(DESTINATION));
  const frozen = clone([...ecology._active]);
  ecology.step(.2, BASELINE);
  assert.deepEqual([...ecology._active], frozen, 'a pending unload cannot discard unsaved behavioural ticks');
  gate.release(); await moving;
  assert.equal(ecology._active.has(SOURCE), false); assert.equal(ecology._active.has(DESTINATION), false);
  assert.equal(ecology._lockedRegions.size, 0);
  assert.equal(storedOwners(store, agent.id).length, 1);
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), source);
  assert.deepEqual(store.records.get(`${WORLD}|${DESTINATION}`), destination);

  for (const failure of ['throw', 'null']) {
    const context = fixture();
    context.ecology.step(.1, BASELINE); await context.ecology.checkpoint();
    const diskBefore = clone([...context.store.records]);
    context.store.onBatch = () => {
      if (failure === 'throw') throw new Error('atomic ownership save rejected');
      return null;
    };
    assert.equal(await context.ecology.update(FAR), false);
    assert.deepEqual([...context.store.records], diskBefore, 'neither persisted owner changes on failure');
    assert.equal(context.ecology._active.get(SOURCE), context.source);
    assert.equal(context.ecology._active.get(DESTINATION), context.destination);
    assert.equal(context.ecology._center, null); assert.equal(context.ecology._lockedRegions.size, 0);
    assert.equal(storedOwners(context.store, context.agent.id).length, 1);
    context.store.onBatch = null;
    await context.ecology.update(FAR);
    assert.equal(context.ecology._active.has(SOURCE), false);
    assert.ok(context.ecology.snapshot().metrics.activeRegions <= 9);
  }
});

test('dispose stops stepping immediately but queues its final coherent ownership snapshot behind pending storage', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), checkpoint = ecology.checkpoint();
  await gate.entered;
  ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  const disposal = ecology.dispose(), frozen = clone([...ecology._active]);
  ecology.step(4, BASELINE);
  assert.deepEqual([...ecology._active], frozen);
  assert.ok(ecology._active.size > 0, 'final records remain available until the queued save executes');
  gate.release(); await Promise.all([checkpoint, disposal]);
  assert.equal(ecology.agents.length, 0); assert.equal(ecology._lockedRegions.size, 0);
  assert.equal(ecology._transfers.length, 0);
  assert.deepEqual(storedOwners(store, agent.id), [expected]);
});

test('reset clears both pending transfer ownership and late checkpoint records before the new world activates', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), checkpoint = ecology.checkpoint();
  await gate.entered;
  ecology.step(.1, BASELINE);
  const staleCheckpoint = ecology.checkpoint();
  const resetting = ecology.reset('fresh', createOceanGenerator('fresh'));
  assert.equal(ecology.agents.length, 0); assert.equal(ecology._transfers.length, 0);
  assert.equal(ecology._lockedRegions.size, 0);
  gate.release(); await Promise.all([checkpoint, staleCheckpoint, resetting]);
  assert.equal(store.records.size, 0, 'the earlier commit cannot resurrect the explicitly cleared world');
  assert.equal(storedOwners(store, agent.id).length, 0);
  await ecology.update(FAR);
  assert.equal(ecology.seed, 'fresh'); assert.ok(ecology.snapshot().metrics.activeRegions <= 9);
  assert.ok(ecology.agents.every(animal => animal.id !== agent.id));
  assert.ok([...store.records.keys()].every(key => key.startsWith('ecology-v1:string:fresh|')));
});
