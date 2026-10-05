import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedMotion } from '../src/supportedMotion.js';
import { ReefSimulation } from '../src/simulation.js';
import { KelpSimulation, KELP_MODEL_PARAMETERS } from '../src/kelpSimulation.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('a swimmer cannot gain free altitude by entering a rock or tunnel through a thin rise', () => {
  const from = { x: 0, y: .1, z: 0 }, proposed = { x: .02, y: .1, z: 0 };
  const result = supportedMotion(from, proposed, { maxDistance: .02, minimumY: x => x > .01 ? 1 : .05 });
  assert.ok(distance(from, result) <= .02 + 1e-10);
  assert.ok(result.x <= .01);
  const blocked = supportedMotion(from, { x: .08, y: .1, z: 0 }, {
    maxDistance: .08, minimumY: x => x > .015 && x < .045 ? 1 : .05,
  });
  assert.ok(blocked.x <= .015);
});

test('crawling on a steep continuous bed spends vertical as well as horizontal distance', () => {
  const from = { x: 0, y: .003, z: 0 };
  const result = supportedMotion(from, { x: .001, y: 0, z: 0 }, {
    maxDistance: .001, minimumY: x => .003 + 4 * x, attached: true,
  });
  assert.ok(result.x > 0);
  assert.ok(distance(from, result) <= .001 + 1e-10);
  assert.equal(result.y, .003 + 4 * result.x);
});

test('both authored swimming models reject a support lift exceeding their actual speed budget', () => {
  const reef = new ReefSimulation(42), fish = reef.agents.find(agent => agent.speciesId === 'green-chromis');
  fish.position = { x: 0, y: .15, z: 0 }; fish.velocity = { x: .2, y: 0, z: 0 };
  reef.setEnvironment({ currentMps: 0 }); reef._fishFloor = (_agent, x = fish.position.x) => x > .001 ? 2 : .1;
  const before = { ...fish.position };
  reef._move(fish, { x: 1, y: 0, z: 0 }, .2, .1, true);
  assert.ok(distance(before, fish.position) <= .02000001);
  const kelp = new KelpSimulation(42), kelpfish = kelp.agents.find(agent => agent.speciesId === 'giant-kelpfish');
  kelpfish.position = { x: 0, y: .15, z: 0 }; kelpfish.velocity = { x: .065, y: 0, z: 0 };
  kelp.setEnvironment({ currentMps: 0 }); kelp._fishFloor = (_agent, x = kelpfish.position.x) => x > .001 ? 2 : .1;
  const old = { ...kelpfish.position };
  kelp._updateFish(kelpfish, .1);
  assert.ok(distance(old, kelpfish.position) <= KELP_MODEL_PARAMETERS.fishApproachMps * .1 + 1e-8);
});

test('a historical support overlap recovers within the distance budget', () => {
  const from = { x: 0, y: 0, z: 0 };
  assert.deepEqual(supportedMotion(from, from, { maxDistance: .01, minimumY: () => .4 }), { x: 0, y: .01, z: 0 });
});

test('authored bottom animals publish velocity from their final supported pose', () => {
  const sim = new ReefSimulation(42), shrimp = sim.agents.find(agent => agent.speciesId === 'cleaner-shrimp');
  const before = { ...shrimp.position };
  sim.step(.1);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(shrimp.velocity[axis] - (shrimp.position[axis] - before[axis]) / .1) < 1e-10);
});
