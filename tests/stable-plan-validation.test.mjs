import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgePlan, validateLivingRidgePlan } from '../src/livingRidgeGeology.js';
import { createLivingCoastalSeascapePlans } from '../src/livingCoastalSeascape.js';
import { createOceanPreparationJobs } from '../src/oceanPreparationJobs.js';

test('background restore checks retain the native verdict for older terrain and reject corrupted saved geometry', () => {
  const seed = 'living-shallows-v1|string:42', base = createLivingShallowsGenerator(seed);
  const original = createLivingRidgePlan(base, 14, 4);
  const coastal = createLivingCoastalSeascapePlans(base, 150, 4)[0];
  const corrupted = structuredClone(original); corrupted.corridor.openingM = -1;
  const corruptedCoastal = structuredClone(coastal); corruptedCoastal.elements[0].x += .5;
  const plans = [original, coastal, corrupted, corruptedCoastal];
  const native = plans.map(plan => validateLivingRidgePlan(plan, base));
  assert.deepEqual(native, [true, true, false, false]);
  const run = createOceanPreparationJobs();
  assert.deepEqual(run('validate-plans', { seed, plans }), native);
  assert.throws(() => run('validate-plans', { seed, plans: Array(26).fill(original) }), /saved-plan/);
  assert.throws(() => run('validate-plans', { seed, plans: [{ ...original, version: 100 }] }), /saved-plan/);
  assert.throws(() => run('birth', { seed, plans: [original] }), /plan batch/);
});
