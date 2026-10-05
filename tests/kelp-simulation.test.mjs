import test from 'node:test';
import assert from 'node:assert/strict';
import { KelpSimulation, kelpSpeciesCatalog, KELP_MODEL_PARAMETERS, WORLD_BOUNDS } from '../src/kelpSimulation.js';
import { KELP_ANCHORS, habitatHeight, rockSurfaceHeight, kelpStipePosition, leafAttachmentPosition } from '../src/kelpHabitat.js';

const snapshot = (sim) => ({ agents: sim.agents, metrics: sim.metrics, environment: sim.environment, events: sim.events, ground: sim.groundPatches, leaves: sim.leafPatches, prey: sim.preyPatches, plants: sim.kelpPatches, ledger: sim.ledger });
const run = (patch, seconds = 420, seed = 42) => {
  const sim = new KelpSimulation(seed);
  sim.setEnvironment(patch);
  sim.step(seconds);
  return sim;
};
const fishEnergy = (sim) => {
  const fish = sim.agents.filter((agent) => agent.speciesId === 'giant-kelpfish');
  return fish.reduce((total, agent) => total + agent.energy, 0) / fish.length;
};

test('independent kelp catalogue and authored patch keep all six organisms in realistic display sizes', () => {
  const sim = new KelpSimulation();
  assert.equal(kelpSpeciesCatalog.length, 6);
  assert.equal(sim.metrics.speciesCount, 6);
  assert.equal(sim.agents.length, 46);
  assert.equal(sim.agents.filter((agent) => agent.speciesId === 'giant-kelp').length, KELP_ANCHORS.length);
  assert(!sim.agents.some((agent) => /tang|coral|grouper/.test(agent.speciesId)));
  for (const species of kelpSpeciesCatalog) {
    assert.equal(species.identityLevel, 'species');
    assert(species.sourceLinks.every((source) => source.url.startsWith('https://')));
    const individuals = sim.agents.filter((agent) => agent.speciesId === species.id);
    assert(individuals.every((agent) => agent.sizeM >= species.displaySizeM.range[0] && agent.sizeM <= species.displaySizeM.range[1]));
  }
});

test('same seed and simulated time produce identical state across frame batches and reset', () => {
  const whole = new KelpSimulation('kelp-replay');
  const frames = new KelpSimulation('kelp-replay');
  whole.step(60);
  for (let index = 0; index < 3600; index += 1) frames.step(1 / 60);
  assert.deepEqual(snapshot(whole), snapshot(frames));
  assert.notDeepEqual(new KelpSimulation('another-seed').agents[13].position, new KelpSimulation('kelp-replay').agents[13].position);
  whole.reset('kelp-replay');
  assert.deepEqual(snapshot(whole), snapshot(new KelpSimulation('kelp-replay')));
});

test('substeps, finite input validation and complete environment validation preserve the clock', () => {
  const sim = new KelpSimulation();
  sim.step(1.07);
  assert.equal(sim.timeSec, 1);
  sim.step(0.03);
  assert.equal(sim.timeSec, 1.1);
  const before = JSON.stringify(snapshot(sim));
  sim.step(0);
  assert.equal(JSON.stringify(snapshot(sim)), before);
  for (const seconds of [-1, NaN, Infinity, 86401]) assert.throws(() => sim.step(seconds), RangeError);
  for (const patch of [{ currentMps: 0.6, turbidity: NaN }, { temperature: 2 }, { currentMps: 0.6, constructor: 2 }, null, []]) assert.throws(() => sim.setEnvironment(patch), TypeError);
  assert.equal(JSON.stringify(snapshot(sim)), before);
  sim.setEnvironment({ currentMps: 5, turbidity: -1, foodSupply: 8, hour: -1 });
  assert.deepEqual(sim.environment, { currentMps: 1.2, deformationCurrentMps: 0.18, turbidity: 0, foodSupply: 3, hour: 23 });
});

test('crawlers remain on a connected support and snails stay exactly attached to moving leaves', () => {
  const sim = new KelpSimulation('support');
  sim.setEnvironment({ currentMps: 0.9 });
  const initial = new Map(sim.agents.map((agent) => [agent.id, { ...agent.position }]));
  sim.step(180);
  for (const agent of sim.agents) {
    if (agent.speciesId === 'giant-kelp') {
      assert.deepEqual(agent.position, initial.get(agent.id));
      assert.deepEqual(agent.velocity, { x: 0, y: 0, z: 0 });
      assert.deepEqual(kelpStipePosition(sim.getKelpAnchor(agent.id), 0, sim.timeSec, sim.environment), agent.position);
      assert(kelpStipePosition(sim.getKelpAnchor(agent.id), 1, sim.timeSec, sim.environment).y < WORLD_BOUNDS.y[1]);
    } else if (agent.speciesId === 'brown-turban-snail') {
      assert.deepEqual(agent.position, leafAttachmentPosition(sim.getKelpAnchor(agent.attachment.hostId), agent.attachment, sim.timeSec, sim.environment));
      assert(agent.position.y > habitatHeight(agent.position.x, agent.position.z) + 6);
      assert.notDeepEqual(agent.position, initial.get(agent.id));
    } else if (agent.speciesId !== 'giant-kelpfish') {
      assert(Math.abs(agent.position.y - habitatHeight(agent.position.x, agent.position.z) - 0.003) < 1e-10);
      if (agent.rockIndex !== null) assert(Math.abs(rockSurfaceHeight(agent.rockIndex, agent.position.x, agent.position.z) - habitatHeight(agent.position.x, agent.position.z)) < 1e-8);
      const traveled = Math.hypot(agent.position.x - initial.get(agent.id).x, agent.position.z - initial.get(agent.id).z);
      assert(traveled <= KELP_MODEL_PARAMETERS.crawlSpeedMps[agent.speciesId] * 180 + 1e-8);
    }
  }
});

test('strong current changes leaf deformation and fish cost while keeping holdfasts attached', () => {
  const calm = run({ currentMps: 0 }, 420);
  const strong = run({ currentMps: 0.9 }, 420);
  assert(strong.metrics.currentEnergyCost > calm.metrics.currentEnergyCost);
  assert(fishEnergy(strong) < fishEnergy(calm));
  for (const plant of strong.agents.filter((agent) => agent.speciesId === 'giant-kelp')) assert.deepEqual(plant.position, calm.agents.find((agent) => agent.id === plant.id).position);
  assert.notDeepEqual(strong.agents.find((agent) => agent.speciesId === 'brown-turban-snail').position, calm.agents.find((agent) => agent.speciesId === 'brown-turban-snail').position);
  assert.notDeepEqual(strong.agents.find((agent) => agent.speciesId === 'giant-kelpfish').position, calm.agents.find((agent) => agent.speciesId === 'giant-kelpfish').position);
});

test('turbidity reduces visibility and light-backed production without instant forest loss', () => {
  const clear = run({ turbidity: 0 });
  const murky = run({ turbidity: 1 });
  assert(murky.metrics.visibilityM < clear.metrics.visibilityM);
  assert(murky.metrics.lightLevel < clear.metrics.lightLevel);
  assert(murky.metrics.totalPrimaryProduction < clear.metrics.totalPrimaryProduction * 0.2);
  assert(murky.metrics.totalKelpExtensionM < clear.metrics.totalKelpExtensionM);
  assert(murky.agents.filter((agent) => agent.speciesId === 'giant-kelp').every((agent) => agent.alive));
});

test('external food supply changes local prey stocks before improving fish condition', () => {
  const scarce = new KelpSimulation(42);
  const fed = new KelpSimulation(42);
  scarce.setEnvironment({ foodSupply: 0 });
  fed.setEnvironment({ foodSupply: 1.4 });
  assert.deepEqual(scarce.resources, fed.resources);
  assert.equal(fishEnergy(scarce), fishEnergy(fed));
  scarce.step(900);
  fed.step(900);
  assert(scarce.metrics.smallPrey < fed.metrics.smallPrey * 0.25);
  assert(fishEnergy(scarce) < fishEnergy(fed));
  assert(fed.metrics.feedingCount > 0 && fed.ledger.ingested > 0);
});

test('empty local food cannot supply energy remotely or fabricate feeding timestamps', () => {
  const sim = new KelpSimulation('empty-local');
  const eater = sim.agents.find((agent) => agent.speciesId === 'purple-urchin');
  for (const agent of sim.agents) if (agent !== eater) agent.alive = false;
  for (const patch of sim.rockPatches.filter((patch) => patch.rockIndex === eater.rockIndex)) patch.algae = 0;
  // Other rocks retain food; a grounded grazer cannot consume those remote pools.
  sim.ledger.initial = Object.values(sim.resources).reduce((total, value) => total + value, 0);
  eater.nextBite = 0;
  const before = eater.energy;
  sim.setEnvironment({ hour: 0, foodSupply: 0 });
  sim.step(10);
  assert.equal(eater.lastFeedAt, null);
  assert.equal(sim.counters.feedingCount, 0);
  assert.equal(sim.ledger.ingested, 0);
  assert.equal(eater.state, 'surface-searching');
  assert(eater.energy < before);
  assert(Math.abs(sim.metrics.resourceBudgetError) < 1e-8);
});

test('several seeds keep finite bounded state and a closed arithmetic resource ledger', () => {
  for (const seed of [1, 42, 2026]) {
    const sim = run({ currentMps: 0.8, turbidity: 0.7, foodSupply: 0.6 }, 180, seed);
    for (const agent of sim.agents) {
      assert(agent.energy >= 0.02 && agent.energy <= 1);
      assert(Number.isFinite(agent.heading) && Number.isFinite(agent.sizeM));
      for (const axis of ['x', 'y', 'z']) {
        assert(Number.isFinite(agent.position[axis]) && Number.isFinite(agent.velocity[axis]));
        assert(agent.position[axis] >= WORLD_BOUNDS[axis][0] && agent.position[axis] <= WORLD_BOUNDS[axis][1]);
      }
      if (agent.speciesId === 'giant-kelpfish') {
        for (const fraction of [-0.5, 0, 0.5]) {
          const x = agent.position.x + Math.cos(agent.heading) * agent.sizeM * fraction;
          const z = agent.position.z + Math.sin(agent.heading) * agent.sizeM * fraction;
          assert(agent.position.y >= habitatHeight(x, z) + 0.08 + agent.sizeM * 0.18 - 1e-8);
        }
      }
    }
    assert(Object.values(sim.resources).every((amount) => Number.isFinite(amount) && amount >= 0));
    assert(Math.abs(sim.metrics.resourceBudgetError) < 1e-8);
    assert(sim.events.every((event) => Number.isFinite(event.timeSec) && event.label && event.cause));
    assert(sim.metrics.grazingCount > 0 && sim.metrics.feedingCount > 0);
  }
});

test('night has no photosynthesis and minute-scale time cannot grow a new forest', () => {
  const night = run({ hour: 0 }, 60);
  assert.equal(night.metrics.lightLevel, 0);
  assert.equal(night.metrics.totalPrimaryProduction, 0);
  assert.equal(night.metrics.totalKelpExtensionM, 0);
  const day = run({ hour: 12, turbidity: 0 }, 300);
  for (const plant of day.agents.filter((agent) => agent.speciesId === 'giant-kelp')) {
    const maximumExtension = KELP_MODEL_PARAMETERS.kelpExtensionMPerDay * 300 / 86400;
    assert(plant.sizeM >= plant.initialSizeM);
    assert(plant.sizeM - plant.initialSizeM <= maximumExtension + 1e-9);
  }
  assert.equal(day.metrics.simulatedGrowthDays, 300 / 86400);
  assert.equal(day.agents.length, 46);
});

test('flow deformation responds gradually without the first-step leaf attachment velocity spike', () => {
  const sim = new KelpSimulation(42);
  const initialRoots = sim.agents.filter((agent) => agent.speciesId === 'giant-kelp').map((agent) => ({ id: agent.id, position: { ...agent.position } }));
  sim.setEnvironment({ currentMps: 0.9 });
  assert.equal(sim.environment.currentMps, 0.9);
  assert.equal(sim.environment.deformationCurrentMps, 0.18);
  sim.step(0.1);
  assert(sim.environment.deformationCurrentMps > 0.18 && sim.environment.deformationCurrentMps < 0.21);
  for (const snail of sim.agents.filter((agent) => agent.speciesId === 'brown-turban-snail')) {
    assert(Math.hypot(snail.velocity.x, snail.velocity.y, snail.velocity.z) < 0.5);
    assert.deepEqual(snail.position, leafAttachmentPosition(sim.getKelpAnchor(snail.attachment.hostId), snail.attachment, sim.timeSec, sim.environment));
  }
  sim.step(3.9);
  const expected = 0.9 + (0.18 - 0.9) * Math.exp(-4 / KELP_MODEL_PARAMETERS.deformationResponseTauSec);
  assert(Math.abs(sim.environment.deformationCurrentMps - expected) < 1e-12);
  for (const root of initialRoots) assert.deepEqual(sim.agents.find((agent) => agent.id === root.id).position, root.position);
  sim.reset(42);
  assert.equal(sim.environment.deformationCurrentMps, 0.18);
  assert.throws(() => sim.setEnvironment({ deformationCurrentMps: 0.9 }), TypeError);
});

test('chiton nocturnal activity changes actual feeding, retains daylight bouts and cannot create food', () => {
  const runChitons = (hour, empty = false) => {
    const sim = new KelpSimulation(42);
    let feeding = 0;
    let removed = 0;
    const original = sim._feed;
    sim._feed = function (agent, ...args) {
      const result = original.call(this, agent, ...args);
      if (agent.speciesId === 'gumboot-chiton' && result > 0) { feeding += 1; removed += result; }
      return result;
    };
    if (empty) {
      for (const agent of sim.agents) if (agent.speciesId !== 'gumboot-chiton') agent.alive = false;
      for (const patch of sim.rockPatches) patch.algae = 0;
      sim.ledger.initial = Object.values(sim.resources).reduce((sum, value) => sum + value, 0);
    }
    sim.setEnvironment({ hour, foodSupply: 0, turbidity: 0 });
    const activityAtStart = sim.chitonActivityLevel;
    sim.step(420);
    return { sim, feeding, removed, activityAtStart };
  };
  const day = runChitons(12);
  const night = runChitons(0);
  assert(day.activityAtStart > 0 && day.activityAtStart < night.activityAtStart);
  assert(day.feeding > 0, 'the approximation permits occasional daytime feeding, rather than an absolute biological switch');
  assert(night.feeding > day.feeding && night.removed > day.removed);
  assert(day.sim.agents.filter((agent) => agent.speciesId === 'gumboot-chiton').some((agent) => agent.state === 'daytime-resting'));
  const empty = runChitons(0, true);
  assert.equal(empty.feeding, 0);
  assert.equal(empty.removed, 0);
  assert(empty.sim.agents.filter((agent) => agent.speciesId === 'gumboot-chiton').every((agent) => agent.lastFeedAt === null));
  assert(Math.abs(empty.sim.metrics.resourceBudgetError) < 1e-8);
  const murkyDay = new KelpSimulation(42);
  murkyDay.setEnvironment({ hour: 12, turbidity: 1 });
  assert.equal(murkyDay.chitonActivityLevel, day.activityAtStart);
});
