import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSimulation, deepSpeciesCatalog, DEEP_MODEL_PARAMETERS, WORLD_BOUNDS } from '../src/deepSimulation.js';
import { deepFloorHeight, sampleDeepSupportPose, DEEP_SEA_PIG_CONTACTS_LOCAL } from '../src/deepHabitat.js';

const snapshot = (sim) => ({ agents: sim.agents, metrics: sim.metrics, events: sim.events,
  environment: sim.environment, sediment: sim.surfacePatches, benthic: sim.benthicPatches,
  suspended: sim.suspendedPatches, ledger: sim.ledger, energy: sim.energyLedger });
const ecology = (sim) => ({ agents: sim.agents, resources: sim.resources, ledger: sim.ledger,
  energy: sim.energyLedger, feedingCount: sim.counters.feedingCount });
const emptyFood = (sim) => {
  for (const patch of sim.surfacePatches) patch.surfaceDetritus = 0;
  for (const patch of sim.benthicPatches) patch.benthicAnimalFood = 0;
  for (const patch of sim.suspendedPatches) patch.suspendedPrey = 0;
  sim.ledger.initial = 0;
  for (const budget of Object.values(sim.ledger.byPool)) budget.initial = 0;
};
const close = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('only admitted identities, source ceilings and representative display sizes enter the deep model', () => {
  const sim = new DeepSimulation(42);
  assert.deepEqual(deepSpeciesCatalog.map((species) => [species.id, species.taxonomicLevel]), [
    ['sea-pig-group', 'genus'], ['rattail-family', 'family'], ['pom-pom-anemone', 'species'],
  ]);
  assert.equal(sim.agents.length, 16);
  assert.equal(sim.metrics.depthM, 3500);
  for (const species of deepSpeciesCatalog) {
    assert.equal(species.bioluminescent, false);
    assert(species.sourceLinks.every((source) => source.url.startsWith('https://')));
    assert(species.referenceDepthM.range[0] <= 3500 && species.referenceDepthM.range[1] >= 3500);
    assert(species.displaySizeM.range[1] <= species.referenceSizeM.maximum);
    for (const agent of sim.agents.filter((item) => item.speciesId === species.id)) {
      assert(agent.sizeM >= species.displaySizeM.range[0] && agent.sizeM <= species.displaySizeM.range[1]);
      assert.equal(agent.taxonomicLevel, species.taxonomicLevel);
      assert.equal(agent.lastFeedAt, null);
    }
  }
});

test('deterministic seed, fixed 0.1-second updates and reset are independent of frame batching', () => {
  const whole = new DeepSimulation('deep-replay'); const frames = new DeepSimulation('deep-replay');
  whole.step(60);
  for (let frame = 0; frame < 3600; frame += 1) frames.step(1 / 60);
  assert.deepEqual(snapshot(whole), snapshot(frames));
  assert.notDeepEqual(new DeepSimulation(1).agents, new DeepSimulation(2026).agents);
  whole.reset('deep-replay');
  assert.deepEqual(snapshot(whole), snapshot(new DeepSimulation('deep-replay')));
});

test('finite and atomic environment validation, fractional steps and clock-only hour remain explicit', () => {
  const sim = new DeepSimulation(); sim.step(1.07);
  assert.equal(sim.timeSec, 1); sim.step(0.03); assert.equal(sim.timeSec, 1.1);
  const before = JSON.stringify(snapshot(sim));
  for (const input of [-1, NaN, Infinity, 86401]) assert.throws(() => sim.step(input), RangeError);
  for (const patch of [null, [], { currentMps: 0.4, foodSupply: NaN }, { temperatureC: 2 }, { constructor: 2 }]) {
    assert.throws(() => sim.setEnvironment(patch), TypeError);
    assert.equal(JSON.stringify(snapshot(sim)), before);
  }
  sim.setEnvironment({ currentMps: 5, foodSupply: 8, turbidity: -1, hour: -1, observerLight: 8 });
  assert.deepEqual(sim.environment, { currentMps: 1.2, foodSupply: 3, turbidity: 0, hour: 23, observerLight: 1 });
});

test('sea-pig representative foot contacts and fixed anemone bases share the exact soft bottom', () => {
  const sim = new DeepSimulation('support'); sim.setEnvironment({ currentMps: 0.4, foodSupply: 0 });
  const anchors = new Map(sim.agents.filter((agent) => agent.speciesId === 'pom-pom-anemone').map((agent) => [agent.id, { ...agent.position }]));
  for (let tick = 0; tick < 2400; tick += 1) {
    sim.step(0.1);
    for (const agent of sim.agents) {
      if (agent.speciesId === 'sea-pig-group') {
        close(agent.position.y, deepFloorHeight(agent.position.x, agent.position.z));
        assert.equal(agent.contactPointsLocal.length, 12);
        agent.contactPointsLocal.forEach((point, index) => {
          close(point.x, DEEP_SEA_PIG_CONTACTS_LOCAL[index].x);
          close(point.z, DEEP_SEA_PIG_CONTACTS_LOCAL[index].z);
          const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
          const x = agent.position.x + agent.sizeM * (point.x * c - point.z * s);
          const z = agent.position.z + agent.sizeM * (point.x * s + point.z * c);
          close(agent.position.y + agent.sizeM * point.y, deepFloorHeight(x, z));
        });
        assert(Math.hypot(agent.velocity.x, agent.velocity.z) <= DEEP_MODEL_PARAMETERS.seaPigCrawlMps + 1e-8);
      } else if (agent.speciesId === 'pom-pom-anemone') {
        assert.deepEqual(agent.position, anchors.get(agent.id));
        assert.deepEqual(agent.velocity, { x: 0, y: 0, z: 0 });
      } else close(agent.position.y, deepFloorHeight(agent.position.x, agent.position.z) + 0.03);
      const pose = sampleDeepSupportPose(agent.position.x, agent.position.z, agent.heading);
      close(Math.hypot(...Object.values(pose.normal)), 1);
      close(pose.normal.x * pose.tangent.x + pose.normal.y * pose.tangent.y + pose.normal.z * pose.tangent.z, 0);
    }
  }
});

test('empty resources with stopped external input cannot fabricate feeding or timestamps', () => {
  const sim = new DeepSimulation('empty'); emptyFood(sim);
  sim.setEnvironment({ foodSupply: 0 });
  const energy = sim.agents.map((agent) => agent.energy);
  sim.step(120);
  assert.equal(sim.metrics.feedingCount, 0); assert.equal(sim.ledger.ingested, 0); assert.equal(sim.ledger.input, 0);
  assert(sim.agents.every((agent, index) => agent.lastFeedAt === null && agent.energy < energy[index]));
  assert.deepEqual(sim.resources, { surfaceDetritus: 0, benthicAnimalFood: 0, suspendedPrey: 0 });
});

test('positive intake is gated by the actual mouth/capture volume, including direct calls with remote food', () => {
  const sim = new DeepSimulation(42);
  const pig = sim.agents.find((agent) => agent.speciesId === 'sea-pig-group');
  const fish = sim.agents.find((agent) => agent.speciesId === 'rattail-family');
  const anemone = sim.agents.find((agent) => agent.speciesId === 'pom-pom-anemone');
  for (const [agent, patches, pool] of [[pig, sim.surfacePatches, 'surfaceDetritus'], [fish, sim.benthicPatches, 'benthicAnimalFood'], [anemone, sim.suspendedPatches, 'suspendedPrey']]) {
    agent.nextBite = 0;
    const remote = patches.find((patch) => Math.hypot(patch.position.x - agent.position.x, patch.position.z - agent.position.z) > 3);
    const before = remote[pool], energy = agent.energy;
    assert.equal(sim._feed(agent, remote, pool, 0.01, 6, 4), 0);
    assert.equal(remote[pool], before); assert.equal(agent.energy, energy); assert.equal(agent.lastFeedAt, null);
  }
  sim.step(30);
  const feeds = sim.events.filter((event) => event.type === 'feeding');
  assert(feeds.length > 0);
  assert(new Set(feeds.map((event) => event.foodPool)).size === 3);
  for (const event of feeds) {
    assert(event.actualIntake > 0 && event.actualIntake <= event.requestedAmount);
    assert(event.feedDistanceM <= event.allowedDistanceM + 1e-10);
    assert.equal(event.unit, 'relative-organic-food-proxy-unit');
  }
});

test('external organic input enters finite resources first and enables real feeding from an initially empty bed', () => {
  const absent = new DeepSimulation(42); const supplied = new DeepSimulation(42);
  emptyFood(absent); emptyFood(supplied);
  absent.setEnvironment({ foodSupply: 0 }); supplied.setEnvironment({ foodSupply: 1 });
  assert.deepEqual(absent.agents, supplied.agents);
  absent.step(600); supplied.step(600);
  assert.equal(absent.ledger.ingested, 0);
  assert(supplied.ledger.input > 0 && supplied.ledger.ingested > 0);
  assert(supplied.metrics.averageEnergy > absent.metrics.averageEnergy);
  assert(supplied.ledger.ingested <= supplied.ledger.input + 1e-10);
});

test('current advects finite parcels to an explicit outlet and changes cost without moving attached bases', () => {
  const still = new DeepSimulation(1), moving = new DeepSimulation(1);
  still.setEnvironment({ currentMps: 0, foodSupply: 0 }); moving.setEnvironment({ currentMps: 0.4, foodSupply: 0 });
  const parcel = { ...moving.suspendedPatches[0].position };
  moving.step(0.1); close(moving.suspendedPatches[0].position.x, parcel.x + 0.04);
  close(moving.suspendedPatches[0].position.y, parcel.y);
  moving.step(99.9); still.step(100);
  assert(moving.ledger.byPool.suspendedPrey.exported > 0);
  assert.equal(still.ledger.byPool.suspendedPrey.exported, 0);
  assert(moving.metrics.currentEnergyCost > still.metrics.currentEnergyCost);
  for (const agent of moving.agents.filter((item) => item.speciesId === 'pom-pom-anemone')) {
    assert.deepEqual(agent.position, still.getAgent(agent.id).position);
  }
});

test('suspended prey keeps its world height over falling ground and detects a ridge between clear endpoints', () => {
  const make = supportHeight => new DeepSimulation('prey-transport', { supportHeight,
    surfaceSites: [], benthicSiteIndices: [], seaPigSiteIndices: [], fishSiteIndices: [],
    anchors: [{ x: 0, y: supportHeight(0, 0), z: 0 }], inletX: -1, outletX: 1 });
  const falling = make(x => -.4 * x), p = falling.suspendedPatches[0], before = { ...p.position };
  falling.agents[0].nextBite = 100; falling.setEnvironment({ currentMps: 1.2, foodSupply: 0 }); falling.step(.1);
  close(p.position.x, before.x + .12); close(p.position.y, before.y);
  assert.ok(p.heightM > falling.agents[0].sizeM * .40);
  close(p.position.y, -.4 * p.position.x + p.heightM); close(falling.metrics.resourceBudgetError, 0);

  const ridge = make(x => x >= .05 && x <= .08 ? .3 : 0), hit = ridge.suspendedPatches[0];
  ridge.agents[0].nextBite = 100; hit.position.x = 0;
  const amount = hit.suspendedPrey;
  ridge.setEnvironment({ currentMps: 1.2, foodSupply: 0 }); ridge.step(.1);
  assert.equal(ridge._floorHeight(0, 0), 0); assert.equal(ridge._floorHeight(.12, 0), 0);
  assert.ok(!ridge.suspendedPatches.some(parcel => parcel.id === hit.id));
  close(ridge.ledger.byPool.suspendedPrey.exported, amount);
  close(ridge.ledger.ingested, 0); close(ridge.metrics.resourceBudgetError, 0); close(ridge.metrics.energyBudgetError, 0);
});

test('3500m sunlight and photosynthesis stay zero; observer light and hour have no ecological effect', () => {
  const off = new DeepSimulation(2026), on = new DeepSimulation(2026);
  off.setEnvironment({ observerLight: 0, hour: 0 }); on.setEnvironment({ observerLight: 1, hour: 12 });
  off.step(600); on.step(600);
  assert.deepEqual(ecology(off), ecology(on));
  for (const sim of [off, on]) {
    assert.equal(sim.metrics.lightLevel, 0); assert.equal(sim.metrics.naturalLightLevel, 0);
    assert.equal(sim.metrics.primaryProduction, 0); assert.equal(sim.metrics.totalPrimaryProduction, 0);
    assert(sim.agents.every((agent) => !('photosynthesis' in agent)));
  }
  assert.equal(off.metrics.observerLightLevel, 0); assert.equal(on.metrics.observerLightLevel, 1);
});

test('turbidity attenuates observation without penalising all nonvisual food mechanisms', () => {
  const clear = new DeepSimulation(42), murky = new DeepSimulation(42);
  clear.setEnvironment({ turbidity: 0 }); murky.setEnvironment({ turbidity: 1 });
  clear.step(600); murky.step(600);
  assert(murky.metrics.visibilityM < clear.metrics.visibilityM);
  assert.deepEqual(ecology(clear), ecology(murky));
});

test('resource and condition ledgers close per pool and total under all paired 600-second cases', () => {
  for (const seed of [1, 42, 2026]) for (const patch of [{}, { currentMps: 0.4 }, { turbidity: 1 }, { foodSupply: 0 }]) {
    const sim = new DeepSimulation(seed); sim.setEnvironment(patch); sim.step(600);
    close(sim.metrics.resourceBudgetError, 0); close(sim.metrics.energyBudgetError, 0);
    assert(sim.ledger.transferred > 0);
    for (const [pool, stock] of Object.entries(sim.resources)) {
      const budget = sim.ledger.byPool[pool];
      close(stock, budget.initial + budget.input + budget.transferredIn - budget.transferredOut - budget.ingested - budget.exported);
      assert(Number.isFinite(stock) && stock >= 0);
    }
    for (const agent of sim.agents) {
      assert(Number.isFinite(agent.energy) && agent.energy >= 0.02 && agent.energy <= 1);
      for (const axis of ['x', 'y', 'z']) assert(Number.isFinite(agent.position[axis]) && agent.position[axis] >= WORLD_BOUNDS[axis][0] && agent.position[axis] <= WORLD_BOUNDS[axis][1]);
    }
  }
});

test('zero-flow long runs bound parcel storage while retaining every incoming relative unit in the ledger', () => {
  const sim = new DeepSimulation('stagnant'); sim.setEnvironment({ currentMps: 0, foodSupply: 3 }); sim.step(1200);
  assert(sim.suspendedPatches.length <= DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
  close(sim.metrics.resourceBudgetError, 0); close(sim.metrics.energyBudgetError, 0);
  close(sim.ledger.byPool.suspendedPrey.input, 120 * 5 * 0.0015 * 3);
});

test('a full suspended channel with an empty lane accounts overflow without throwing or exceeding storage', () => {
  const sim = new DeepSimulation('bounded-lanes', { supportHeight: () => 0,
    surfaceSites: [], benthicSiteIndices: [], seaPigSiteIndices: [], fishSiteIndices: [],
    anchors: [{ x: .8, y: 0, z: 0 }, { x: .8, y: 0, z: .5 }], inletX: -1, outletX: 1 });
  for (const agent of sim.agents) agent.nextBite = 100;
  // A retained lane can fill the finite pool after all parcels in another
  // lane have exited or been eaten. Do not assume each lane has one to merge.
  sim.suspendedPatches = Array.from({ length: DEEP_MODEL_PARAMETERS.maximumSuspendedParcels }, () => sim._parcel(0, -1, 0, .0015));
  sim.ledger.initial = sim.resources.suspendedPrey;
  sim.ledger.byPool.suspendedPrey.initial = sim.resources.suspendedPrey;
  sim.setEnvironment({ currentMps: 0, foodSupply: 1 }); sim.step(10);
  assert.equal(sim.suspendedPatches.length, DEEP_MODEL_PARAMETERS.maximumSuspendedParcels);
  close(sim.ledger.byPool.suspendedPrey.input, .003);
  close(sim.ledger.byPool.suspendedPrey.exported, .0015);
  close(sim.metrics.resourceBudgetError, 0); close(sim.metrics.energyBudgetError, 0);
});
