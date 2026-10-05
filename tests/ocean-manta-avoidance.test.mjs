import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';

const SEED = '42', WORLD = 'ecology-v1:string:42';
const SOURCE = '4,-2', WEST = '3,-2';
const BASELINE = { hour: 12, currentMps: 0, foodSupply: 0, turbidity: 0 };
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const quantity = resources => Object.values(resources).reduce((total, value) => total + value, 0);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${message}: expected ${expected}, received ${actual}`);

class MemoryStore {
  available = true;
  records = new Map();
  batches = [];
  saves = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) {
    this.records.set(`${world}|${id}`, clone(state));
    this.saves.push({ world, id });
  }
  async saveMany(world, records) {
    const snapshot = records.map(([id, state]) => [id, clone(state)]);
    const next = new Map(this.records);
    for (const [id, state] of snapshot) next.set(`${world}|${id}`, state);
    this.records = next;
    this.batches.push({ world, records: snapshot });
  }
  async clear(world) {
    for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key);
  }
}

function stock(region, plankton = 0) {
  region.resources = { algae: .2, plankton, detritus: .3 };
  region.ledger = { initial: quantity(region.resources), input: 0, ingested: 0, exported: 0 };
  region.counters = { feeding: 0, escapes: 0, cleaning: 0, predation: 0, deaths: 0 };
  region.events = [];
}

function examinedRegion(ecology, cx, cz) {
  const region = ecology._createRegion(cx, cz);
  ecology._supplementSlopeRegion(region);
  ecology._supplementPelagicRegion(region);
  ecology._supplementMantaRegion(region);
  region.agents = [];
  stock(region);
  return region;
}

function fill(region) {
  region.agents = Array.from({ length: OCEAN_REGION_AGENT_LIMIT }, (_, index) => ({
    id: `dead:${region.id}:${index}`, speciesId: 'blue-starfish', regionId: region.id,
    alive: false, state: 'dead', energy: 0, position: { x: region.cx * 64 + 32, y: -15, z: region.cz * 64 + 32 },
  }));
}

function directWest(ecology) {
  // The real coordinate-seeded animal and shared support probes are retained;
  // this seam-directed goal makes a forbidden crossing repeatable.
  ecology._mantaTarget = (region, animal) => {
    animal.target = { x: animal.position.x - .4, y: animal.position.y, z: animal.position.z };
    return animal.target;
  };
}

function fixture({ reverse = false, sourceTime = 17.4, destinationTime = 1220 } = {}) {
  const generator = createOceanGenerator(SEED), store = new MemoryStore();
  const ecology = new OceanEcology(SEED, generator, { store });
  const source = ecology._createRegion(4, -2), destination = examinedRegion(ecology, 3, -2);
  ecology._supplementSlopeRegion(source); ecology._supplementPelagicRegion(source);
  source.agents = [];
  assert.equal(ecology._supplementMantaRegion(source), true);
  assert.equal(source.agents.length, 1, 'the real seed supplies one representative manta');
  const agent = source.agents[0];
  source.timeSec = sourceTime; source.ticks = Math.round(sourceTime * 10);
  destination.timeSec = destinationTime; destination.ticks = Math.round(destinationTime * 10);
  agent.position = { x: 256.015, y: 4, z: -96 };
  agent.target = { ...agent.position }; agent.velocity = { x: 0, y: 0, z: 0 };
  agent.sizeM = 3.15; agent.energy = .72;
  agent.state = 'gliding'; agent.stateSince = 12.3; agent.lastFeedAt = 6.7;
  agent.nextBite = sourceTime + 100; agent.nextDecision = sourceTime + 20;
  stock(source); stock(destination);
  assert.equal(ecology._upgradeMantaMobility(source), true);
  fill(destination);
  ecology._active = new Map(reverse ? [[WEST, destination], [SOURCE, source]] : [[SOURCE, source], [WEST, destination]]);
  ecology._center = { cx: 4, cz: -2 };
  directWest(ecology);
  assert.equal(ecology._mantaY(agent.position.x, agent.position.z, 4, agent.sizeM), 4);
  return { ecology, generator, store, source, destination, agent };
}

function assertBalance(region) {
  close(region.ledger.initial + region.ledger.input - region.ledger.ingested - region.ledger.exported,
    quantity(region.resources), `food balance in ${region.id}`);
}

function assertSafeStep(ecology, agent, previous, dt = .1) {
  assert.ok(Object.values(agent.position).every(Number.isFinite));
  assert.ok(Object.values(agent.velocity).every(Number.isFinite));
  assert.ok(distance(previous, agent.position) > 1e-8, 'a safe alternative makes progress');
  assert.ok(distance(previous, agent.position) <= .5 * dt + 1e-8, 'XYZ motion obeys the speed limit');
  close(ecology._mantaY(agent.position.x, agent.position.z, OCEAN_SURFACE_Y - agent.position.y, agent.sizeM),
    agent.position.y, 'published footprint remains supported');
  for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis], (agent.position[axis] - previous[axis]) / dt,
    `${axis} velocity matches the one published step`);
  assert.equal(ecology._transfers.length, 0, 'lookahead cannot leave pending ownership');
}

test('a full real seam permits sustained local progress without crossing, refilling or extra ticks', () => {
  const { ecology, store, source, destination, agent } = fixture();
  const initial = clone(agent), blockers = clone(destination.agents);
  for (let index = 0; index < 20; index++) {
    const previous = clone(agent.position);
    ecology.step(.1, BASELINE);
    assertSafeStep(ecology, agent, previous);
    assert.equal(agent.regionId, SOURCE);
    assert.ok(agent.position.x >= 256 && agent.position.x < 320);
    assert.ok(agent.position.z >= -128 && agent.position.z < -64);
    assert.equal(source.agents.length, 1); assert.equal(source.agents[0], agent);
    assert.equal(destination.agents.length, OCEAN_REGION_AGENT_LIMIT);
  }
  assert.ok(distance(initial.position, agent.position) > .3, 'the ray cannot remain stalled at the seam');
  assert.deepEqual(destination.agents, blockers, 'dead records continue to occupy every destination slot');
  assert.equal(agent.id, initial.id); assert.equal(agent.birthRegionId, SOURCE);
  close(agent.mobileTimeSec, 19.4, 'twenty individual ticks');
  close(agent.energy, initial.energy - 2 * .00012, 'twenty energy debits');
  assert.equal(agent.lastFeedAt, initial.lastFeedAt); assert.equal(agent.nextBite, initial.nextBite);
  assert.equal(agent.crossings, undefined);
  assert.equal(store.batches.length, 0); assert.equal(store.saves.length, 0);
  assertBalance(source); assertBalance(destination);
});

test('local steering is identical under active-region order and equal fixed-step partitions', () => {
  const outcomes = [];
  for (const reverse of [false, true]) for (const partitioned of [false, true]) {
    const { ecology, source, destination, agent } = fixture({ reverse });
    const before = clone(agent.position);
    if (partitioned) for (let index = 0; index < 20; index++) ecology.step(.1, BASELINE);
    else ecology.step(2, BASELINE);
    assert.ok(distance(before, agent.position) > .3);
    outcomes.push(clone({ agent, source, destination }));
  }
  for (const outcome of outcomes.slice(1)) assert.deepEqual(outcome, outcomes[0]);
});

test('an active held turn progresses through a zero-distance target while an unheld ray stops exactly', () => {
  const heldContext = fixture(), stationaryContext = fixture();
  heldContext.ecology.step(.1, BASELINE);
  const held = clone(heldContext.agent.avoidance);
  assert.ok(held && held.untilSec > heldContext.agent.mobileTimeSec);
  for (const { ecology } of [heldContext, stationaryContext]) {
    ecology._mantaTarget = (region, animal) => {
      animal.target = { ...animal.position };
      return animal.target;
    };
  }
  const previous = clone(heldContext.agent.position);
  heldContext.ecology.step(.1, BASELINE);
  assertSafeStep(heldContext.ecology, heldContext.agent, previous);
  close(heldContext.agent.position.x - previous.x, Math.cos(held.headingRad) * .05,
    'the held course retains its horizontal X direction');
  close(heldContext.agent.position.z - previous.z, Math.sin(held.headingRad) * .05,
    'the held course retains its horizontal Z direction');
  close(heldContext.agent.position.y, previous.y, 'a held horizontal course cannot invent a vertical step');
  assert.deepEqual(heldContext.agent.avoidance, held);
  assert.equal(heldContext.agent.regionId, SOURCE);
  close(heldContext.agent.mobileTimeSec, 17.6, 'the held ray advances one further individual tick');

  const stationary = clone(stationaryContext.agent.position);
  stationaryContext.ecology.step(.1, BASELINE);
  assert.deepEqual(stationaryContext.agent.position, stationary);
  assert.deepEqual(stationaryContext.agent.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(stationaryContext.agent.avoidance, undefined);
  assert.equal(stationaryContext.agent.regionId, SOURCE);
  assert.equal(stationaryContext.ecology._transfers.length, 0);
  close(stationaryContext.agent.mobileTimeSec, 17.5, 'a stationary ray still receives one individual tick');
});

test('a blocked east/north corner turns into the owning cell with full or unloaded neighbours', () => {
  for (const neighbours of ['full', 'unloaded']) {
    const { ecology, source, agent } = fixture();
    agent.position = { x: 319.985, y: 4, z: -64.015 };
    agent.target = { ...agent.position };
    ecology._active = new Map([[SOURCE, source]]);
    if (neighbours === 'full') {
      for (const [cx, cz] of [[5, -2], [4, -1]]) {
        const region = examinedRegion(ecology, cx, cz); fill(region);
        ecology._active.set(region.id, region);
      }
    }
    ecology._mantaTarget = (region, animal) => {
      animal.target = { x: animal.position.x + .4, y: animal.position.y, z: animal.position.z + .4 };
      return animal.target;
    };
    assert.equal(ecology._mantaY(agent.position.x, agent.position.z, 4, agent.sizeM), 4);
    const initial = clone(agent.position);
    for (let index = 0; index < 10; index++) {
      const previous = clone(agent.position);
      ecology.step(.1, BASELINE); assertSafeStep(ecology, agent, previous);
      assert.equal(agent.regionId, SOURCE, neighbours);
      assert.ok(agent.position.x >= 256 && agent.position.x < 320);
      assert.ok(agent.position.z >= -128 && agent.position.z < -64);
    }
    assert.ok(distance(initial, agent.position) > .3, neighbours);
    assert.ok(agent.position.x < initial.x || agent.position.z < initial.z, 'recovery heads toward the cell interior');
    assert.equal(agent.crossings, undefined);
    assert.ok([...ecology._active.values()].every(region => region.agents.length <= OCEAN_REGION_AGENT_LIMIT));
  }
});

test('a real support enclosure stops exactly when every immediate heading is blocked', () => {
  const { ecology, generator, source, destination, agent } = fixture();
  const start = clone(agent.position), radius = agent.sizeM * .5 + .2;
  const sample = generator.sample, floorSurface = generator.floorSurface;
  const enclosed = (x, z) => Math.hypot(x - start.x, z - start.z) > radius + 1e-8;
  ecology.generator = { ...generator, sample(x, z) {
    const value = sample(x, z);
    // The initial finite footprint remains valid. Every displaced footprint
    // probes the surrounding raised floor, including the immediate-step pass.
    return enclosed(x, z)
      ? { ...value, floorY: OCEAN_SURFACE_Y, depthM: 0 } : value;
  }, floorSurface(x, z) {
    // The sampler and rendered-bed support entry point describe one fixture;
    // a sample-only wall would leave the actual triangle bed unobstructed.
    const value = floorSurface(x, z);
    return enclosed(x, z) ? { ...value, height: OCEAN_SURFACE_Y } : value;
  } };
  assert.equal(ecology.generator.floorSurface(start.x + radius + .05, start.z).height, OCEAN_SURFACE_Y);
  assert.equal(ecology._mantaY(start.x, start.z, 4, agent.sizeM), 4);
  for (let index = 0; index < 16; index++) {
    const angle = index * Math.PI / 8;
    assert.equal(ecology._mantaY(start.x + Math.cos(angle) * .05, start.z + Math.sin(angle) * .05, 4, agent.sizeM), null);
  }
  ecology.step(2, BASELINE);
  assert.deepEqual(agent.position, start); assert.deepEqual(agent.velocity, { x: 0, y: 0, z: 0 });
  assert.equal(agent.regionId, SOURCE); assert.equal(source.agents[0], agent);
  assert.equal(destination.agents.some(animal => animal.id === agent.id), false);
  assert.equal(agent.avoidance, undefined); assert.equal(ecology._transfers.length, 0);
  close(agent.mobileTimeSec, 19.4, 'blocked movement still advances one clock per tick');
  close(agent.energy, .72 - 2 * .00012, 'blocked movement still spends energy once per tick');
});

test('recovery feeding debits only the owner pool and advances one individual clock and energy step', () => {
  const { ecology, store, source, destination, agent } = fixture({ sourceTime: 100, destinationTime: 3 });
  stock(source, .8); stock(destination, .9); agent.nextBite = 100;
  const previous = clone(agent.position), energy = agent.energy;
  ecology.step(.1, BASELINE); assertSafeStep(ecology, agent, previous);
  assert.equal(agent.regionId, SOURCE);
  close(agent.mobileTimeSec, 100.1, 'one individual-clock step');
  close(source.timeSec, 100.1, 'source clock'); close(destination.timeSec, 3.1, 'destination clock');
  close(source.ledger.ingested, .0035, 'the source supplies one intake');
  assert.equal(destination.ledger.ingested, 0);
  assert.equal(source.counters.feeding, 1); assert.equal(destination.counters.feeding, 0);
  close(agent.energy, energy - .000012 + .0035 * 8, 'one energy debit and one intake credit');
  close(agent.lastFeedAt, 100.1, 'intake retains the individual clock');
  assert.ok(agent.nextBite > agent.mobileTimeSec);
  assertBalance(source); assertBalance(destination);
  assert.equal(store.batches.length, 0); assert.equal(store.saves.length, 0);
});

test('pause and atomic checkpoint preserve the held turn for the same next step after reopening', async () => {
  const { ecology, generator, store, source, agent } = fixture();
  ecology.step(2, BASELINE);
  assert.ok(agent.avoidance && agent.avoidance.untilSec > agent.mobileTimeSec);
  void ecology.agents;
  const expected = clone(agent), frozen = clone([...ecology._active]);
  ecology.step(0, { hour: 0, currentMps: 1 });
  assert.deepEqual([...ecology._active], frozen, 'pause changes neither the held turn nor regional records');
  await ecology.checkpoint();
  assert.equal(store.batches.length, 1); assert.equal(store.batches[0].records.length, 2);
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`).agents[0], expected);
  const reopened = new OceanEcology(SEED, generator, { store });
  await reopened.update({ x: 288, z: -96 }); directWest(reopened);
  const restored = reopened.agents.find(animal => animal.id === agent.id);
  assert.deepEqual(restored, expected, 'saved ownership and avoidance history restore together');
  const previous = clone(expected.position);
  ecology.step(.1, BASELINE); reopened.step(.1, BASELINE);
  assertSafeStep(ecology, agent, previous); assertSafeStep(reopened, restored, previous);
  assert.deepEqual(restored, agent, 'the restored turn resumes the uninterrupted next step');
  assert.deepEqual(reopened._active.get(SOURCE).ledger, source.ledger);
  assert.equal(reopened.agents.filter(animal => animal.id === agent.id).length, 1);
});

test('after the finite held turn expires an available seam uses the ordinary transfer path', async () => {
  const { ecology, destination, agent } = fixture();
  ecology.step(.1, BASELINE);
  const held = clone(agent.avoidance), id = agent.id;
  assert.ok(held && held.untilSec > agent.mobileTimeSec);
  destination.agents = [];
  ecology.step(11.9, BASELINE);
  close(agent.mobileTimeSec, held.untilSec - .1, 'the held local course lasts a finite individual-clock interval');
  assert.equal(agent.regionId, SOURCE); assert.deepEqual(agent.avoidance, held);
  const previous = clone(agent.position);
  ecology.step(.1, BASELINE);
  assertSafeStep(ecology, agent, previous);
  assert.equal(agent.id, id); assert.equal(agent.regionId, WEST);
  assert.equal(destination.agents[0], agent); assert.equal(agent.crossings, 1);
  assert.equal(agent.avoidance, undefined, 'ordinary roaming resumes after the held turn');
  close(agent.mobileTimeSec, held.untilSec, 'arrival receives exactly the expiry tick');
  await ecology.checkpoint();
});
