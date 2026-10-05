import test from 'node:test';
import assert from 'node:assert/strict';
import { ReefSimulation, WORLD_BOUNDS } from '../src/simulation.js';
import { speciesCatalog, speciesById } from '../src/species.js';
import { floorHeight, habitatHeight, REEF_ROCKS } from '../src/habitat.js';

const snapshot = (sim) => ({ agents: sim.agents, metrics: sim.metrics, environment: sim.environment, events: sim.events });
const run = (patch, seconds = 420, seed = 42) => {
  const sim = new ReefSimulation(seed);
  sim.setEnvironment(patch);
  sim.step(seconds);
  return sim;
};

test('reef catalogue contains sourced species and excludes an unrelated Barramundi asset', () => {
  assert.equal(speciesCatalog.length, 14);
  assert.equal(new Set(speciesCatalog.map((species) => species.id)).size, 14);
  assert.equal(speciesCatalog.filter((species) => species.kind !== 'algae').length, 13);
  assert(!speciesCatalog.some((species) => /barramundi|Lates calcarifer/i.test(`${species.commonName} ${species.scientificName}`)));
  for (const species of speciesCatalog) {
    assert(species.scientificName && species.description && species.diet && species.behavior);
    assert(species.lengthM > 0 && species.lengthM < 2);
    assert(species.sources.length >= 1);
    assert(species.sources.every((source) => /^https:\/\//.test(source.url) && source.label));
    assert(species.colors.every((color) => /^#[a-f\d]{6}$/i.test(color)));
  }
});

test('same seed and elapsed simulation time reproduce behavior despite frame batching', () => {
  const oneCall = new ReefSimulation('reef-replay');
  const manyFrames = new ReefSimulation('reef-replay');
  oneCall.step(60);
  for (let frame = 0; frame < 3600; frame += 1) manyFrames.step(1 / 60);
  assert.deepEqual(snapshot(oneCall), snapshot(manyFrames));
  const different = new ReefSimulation('different-seed');
  assert.notDeepEqual(different.agents[0].position, oneCall.agents[0].position);
  oneCall.reset('reef-replay');
  assert.deepEqual(snapshot(oneCall), snapshot(new ReefSimulation('reef-replay')));
});

test('named coral colonies attach to broad hard bottom and preserve seeded traits and crab hosts', () => {
  const goldenSizes42 = [0.8434114195960574, 0.8830697168344632, 0.7384731415095739, 0.8121073777067941,
    0.8538175658113324, 0.837151318610413, 0.7646331776189618, 0.7230676187667996];
  for (const seed of [1, 9, 42, 77, 2026, 'reef-attachment']) {
    const sim = new ReefSimulation(seed), replay = new ReefSimulation(seed);
    const corals = sim.agents.filter(agent => agent.speciesId === 'staghorn-coral');
    assert.equal(corals.length, 8);
    assert.deepEqual(sim.agents, replay.agents);
    for (const colony of corals) {
      const { x, y, z } = colony.position;
      assert([x, y, z].every(Number.isFinite));
      // Independent support classification: a wide authored rock shoulder,
      // far inside its footprint rather than an arbitrary sand-floor sample.
      assert(REEF_ROCKS.some(([cx, , cz, sx, , sz]) => sx >= 1.7 && sz >= 1.4
        && ((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2 < 0.16));
      // The lowered authored mounds no longer all stand 0.7 m above sand.
      assert(y - floorHeight(x, z) > 0.08, `${colony.id} cannot be placed in the sand channel`);
      assert(Math.abs(y - habitatHeight(x, z) - 0.004) < 1e-12);
      // The current low-mound attachment contract is a supported root on a
      // broad shoulder; it does not promise the old slope<.35 flat crown.
      assert.deepEqual(colony.home, colony.position);
      assert.deepEqual(colony.target, colony.position);
    }
    if (seed === 42) {
      assert.deepEqual(corals.map(agent => agent.sizeM), goldenSizes42);
      assert.equal(sim._rngState, 3892602830, 'Placement must not add random draws');
    }
    for (const crab of sim.agents.filter(agent => agent.speciesId === 'reef-crab')) {
      const host = corals[(Number(crab.id.split('-').at(-1)) - 1) % corals.length];
      assert(Math.abs(crab.position.x - host.position.x) <= 0.080000000001);
      assert(Math.abs(crab.position.z - host.position.z) <= 0.080000000001);
      assert.equal(crab.branchOffset, host.sizeM * 0.11);
      assert(Math.abs(crab.position.y - habitatHeight(crab.position.x, crab.position.z) - crab.branchOffset) < 1e-12);
      assert.deepEqual(crab.home, crab.position);
      assert.deepEqual(crab.target, crab.position);
    }
  }
});

test('substep remainders and invalid inputs preserve a consistent clock', () => {
  const sim = new ReefSimulation();
  sim.step(1.07);
  assert.equal(sim.metrics.timeSec, 1);
  sim.step(0.03);
  assert.equal(sim.metrics.timeSec, 1.1);
  const before = JSON.stringify(snapshot(sim));
  sim.step(0);
  assert.equal(JSON.stringify(snapshot(sim)), before);
  for (const value of [-1, NaN, Infinity, 86401]) assert.throws(() => sim.step(value), RangeError);
  assert.throws(() => sim.setEnvironment({ currentMps: 0.3, turbidity: NaN }), TypeError);
  assert.throws(() => sim.setEnvironment({ temperature: 50 }), TypeError);
  assert.equal(JSON.stringify(snapshot(sim)), before);
  sim.setEnvironment({ currentMps: 99, turbidity: -3, foodSupply: -1, hour: 25 });
  assert.deepEqual(sim.environment, { currentMps: 1.2, turbidity: 0, foodSupply: 0, hour: 1 });
});

test('multiple seeds remain finite and bounded and account for resource transfers', () => {
  for (const seed of [1, 9, 42, 77, 2026]) {
    const sim = run({ currentMps: 0.35, turbidity: 0.6, foodSupply: 0.7 }, 240, seed);
    assert.equal(sim.agents.length, 78);
    for (const agent of sim.agents) {
      assert(agent.energy >= 0 && agent.energy <= 1);
      assert(Number.isFinite(agent.heading));
      for (const axis of ['x', 'y', 'z']) {
        assert(Number.isFinite(agent.position[axis]) && Number.isFinite(agent.velocity[axis]));
        assert(agent.position[axis] >= WORLD_BOUNDS[axis][0] && agent.position[axis] <= WORLD_BOUNDS[axis][1]);
      }
      const kind = speciesById[agent.speciesId].kind;
      if (agent.alive && kind === 'fish') {
        for (const lengthFraction of [-0.5, 0, 0.5]) {
          const x = agent.position.x + Math.cos(agent.heading) * agent.sizeM * lengthFraction;
          const z = agent.position.z + Math.sin(agent.heading) * agent.sizeM * lengthFraction;
          assert(agent.position.y - agent.sizeM * 0.3 >= habitatHeight(x, z) + 0.099);
        }
      } else if (kind === 'shrimp') {
        assert(Math.abs(agent.position.y - floorHeight(agent.position.x, agent.position.z)) < 0.015);
        assert(agent.position.x >= 0.85 && agent.position.x <= 1.15);
        assert(agent.position.z >= -1.65 && agent.position.z <= -1.35);
      } else if (kind !== 'fish') {
        const gap = agent.position.y - habitatHeight(agent.position.x, agent.position.z);
        assert(gap >= -1e-8 && gap < 0.2, `${agent.id} must be attached to its local support surface`);
      }
    }
    assert(Object.values(sim.resources).every((amount) => Number.isFinite(amount) && amount >= 0));
    assert(Math.abs(sim.metrics.resourceBudgetError) < 1e-8);
    assert(sim.metrics.feedingCount > 0 && sim.metrics.grazingCount > 0);
    // A separated authored population need not meet a predator in every run.
    // Escape/refuge causality is exercised by the explicit encounter below.
    assert(sim.events.every((event) => event.label && event.cause && Number.isFinite(event.timeSec)));
  }
});

test('food supply changes resources first and reduces planktivore condition when scarce', () => {
  const scarce = run({ foodSupply: 0 }, 700);
  const fed = run({ foodSupply: 1.4 }, 700);
  const planktonEnergy = (sim) => {
    const consumers = sim.agents.filter((agent) => agent.alive && speciesById[agent.speciesId].guild === 'planktivore');
    return consumers.reduce((sum, agent) => sum + agent.energy, 0) / consumers.length;
  };
  assert(scarce.metrics.plankton < fed.metrics.plankton * 0.2);
  assert(planktonEnergy(scarce) < planktonEnergy(fed));
  assert(scarce.metrics.averageEnergy < fed.metrics.averageEnergy);
});

test('turbidity reduces visibility and photosynthetic production without instant bleaching', () => {
  const clear = run({ turbidity: 0 });
  const murky = run({ turbidity: 1 });
  assert(murky.metrics.visibilityM < clear.metrics.visibilityM);
  assert(murky.metrics.totalPrimaryProduction < clear.metrics.totalPrimaryProduction * 0.5);
  assert(murky.metrics.coralHealth < clear.metrics.coralHealth);
  assert(murky.agents.filter((agent) => agent.speciesId === 'staghorn-coral').every((agent) => agent.alive));
});

test('stronger current increases swimming cost and changes moving trajectories while benthos anchors', () => {
  const slow = run({ currentMps: 0 });
  const fast = run({ currentMps: 0.8 });
  assert(fast.metrics.currentEnergyCost > slow.metrics.currentEnergyCost);
  assert(fast.metrics.averageEnergy < slow.metrics.averageEnergy);
  assert.notDeepEqual(fast.agents[0].position, slow.agents[0].position);
  const initial = new ReefSimulation(42);
  for (const agent of fast.agents.filter((individual) => ['coral', 'clam', 'algae'].includes(speciesById[individual.speciesId].kind))) {
    assert.deepEqual(agent.position, initial.agents.find((individual) => individual.id === agent.id).position);
    assert.deepEqual(agent.velocity, { x: 0, y: 0, z: 0 });
  }
});

test('nearby predator triggers escape and refuge steering, not a fixed looping animation', () => {
  const sim = new ReefSimulation(7);
  const prey = sim.agents.find((agent) => agent.speciesId === 'green-chromis');
  const predators = sim.agents.filter((agent) => agent.speciesId === 'honeycomb-grouper');
  prey.position = { x: -1, y: 2, z: -1 };
  predators[0].position = { x: -1.65, y: 2, z: -1 };
  predators[0].home = { ...predators[0].position };
  predators[1].position = { x: 8, y: 0.6, z: 8 };
  sim.step(0.5);
  assert.equal(prey.state, 'fleeing');
  assert(sim.metrics.escapeCount > 0);
  assert(prey.velocity.x > 0);
  assert(prey.energy < 0.88);
});

test('night has no solar production and ordinary reef fishes seek shelter', () => {
  const night = run({ hour: 0, currentMps: 0 }, 50);
  assert.equal(night.metrics.lightLevel, 0);
  assert.equal(night.metrics.totalPrimaryProduction, 0);
  assert((night.metrics.behaviorCounts.hiding || 0) + (night.metrics.behaviorCounts.resting || 0) > 10);
  assert(night.agents.filter((agent) => agent.speciesId === 'black-cucumber').every((agent) => agent.state === 'deposit-feeding'));
});

test('feeding timestamps mark actual resource-backed events in simulation seconds', () => {
  const fed = new ReefSimulation(42);
  assert(fed.agents.every((agent) => agent.lastFeedAt === null));
  const eater = fed.agents.find((agent) => agent.speciesId === 'black-cucumber');
  eater.nextBite = 0;
  fed.step(0.1);
  assert.equal(eater.lastFeedAt, 0.1);
  assert(fed.metrics.feedingCount > 0 && fed.ledger.ingested > 0);

  const empty = new ReefSimulation(42);
  const emptyEater = empty.agents.find((agent) => agent.id === eater.id);
  // Isolate a deposit feeder so no predation/death can introduce new detritus.
  for (const agent of empty.agents) if (agent !== emptyEater) agent.alive = false;
  for (const pool of Object.keys(empty.resources)) empty.resources[pool] = 0;
  empty.ledger.initial = 0;
  empty.setEnvironment({ foodSupply: 0, hour: 0 });
  emptyEater.nextBite = 0;
  empty.step(1);
  assert.equal(emptyEater.state, 'deposit-feeding');
  assert.equal(emptyEater.lastFeedAt, null);
  assert.equal(empty.metrics.feedingCount, 0);
  assert.equal(empty.ledger.ingested, 0);

  fed.reset(42);
  assert(fed.agents.every((agent) => agent.lastFeedAt === null));
});
