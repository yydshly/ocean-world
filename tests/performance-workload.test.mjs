import test from 'node:test';
import assert from 'node:assert/strict';
import { ReefSimulation, DEFAULT_MOBILE_INDIVIDUALS } from '../src/simulation.js';

test('performance workload counts mobile living individuals and preserves reset reproducibility', () => {
  assert.equal(DEFAULT_MOBILE_INDIVIDUALS, 62);
  const normal = new ReefSimulation(42);
  const workload = new ReefSimulation(42, { mobileIndividuals: 120 });
  assert.equal(normal.agents.length, 78);
  assert.equal(normal.metrics.mobilePopulation, 62);
  assert.equal(workload.agents.length, 136);
  assert.equal(workload.metrics.mobilePopulation, 120);
  const initial = JSON.stringify(workload.agents);
  workload.step(120);
  assert(workload.metrics.mobilePopulation >= 100);
  assert(workload.metrics.mobilePopulation <= 120);
  assert(Math.abs(workload.metrics.resourceBudgetError) < 1e-8);
  workload.reset(42);
  assert.equal(JSON.stringify(workload.agents), initial);
  for (const count of [61, 251, 100.5, NaN]) assert.throws(() => new ReefSimulation(42, { mobileIndividuals: count }), RangeError);
});
