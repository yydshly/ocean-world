import test from 'node:test';
import assert from 'node:assert/strict';
import { AgeStructuredExperiment, runPairedAgeExperiment } from '../src/ecology/AgeStructuredExperiment.js';

const snapshot = sim => ({ current: sim.snapshot(), environment: sim.environment, curve: sim.exportCurve(), interventions: sim.interventions, pending: sim._pendingDays });
const noFlux = {
  foodInputGCM2Day: 0, detritusInputGCM2Day: 0, foodExchangePerDay: 0, detritusExchangePerDay: 0, foodDecayPerDay: 0,
  juvenileMaxIntakePerDay: 0, adultMaxIntakePerDay: 0,
  juvenileMaintenancePerDay: 0, adultMaintenancePerDay: 0, reserveMobilisationPerDay: 0,
  juvenileMortalityPerDay: 0, adultMortalityPerDay: 0, crowdingMortalityPerDay: 0, starvationMortalityPerDay: 0,
};
const initial = { foodC: 0, detritusC: 0, juvenileDensityM2: 1, adultDensityM2: 0, juvenileAgeDays: 0, reserveRatio: 0 };
const near = (actual, expected, epsilon = 1e-9) => assert(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);

test('seed, frame batches and reset reproduce full cohort state and sampled curves', () => {
  const whole = new AgeStructuredExperiment({ seed: 'age-replay' }), frames = new AgeStructuredExperiment({ seed: 'age-replay' });
  whole.stepDays(60);
  for (let index = 0; index < 6000; index++) frames.stepDays(.01);
  assert.deepEqual(snapshot(whole), snapshot(frames));
  assert.notDeepEqual(whole.initial, new AgeStructuredExperiment({ seed: 'different' }).initial);
  whole.reset('age-replay');
  assert.deepEqual(snapshot(whole), snapshot(new AgeStructuredExperiment({ seed: 'age-replay' })));
});

test('biomass and expected density are separate units and no 3D counts are claimed', () => {
  const a = new AgeStructuredExperiment({ initial: { ...initial, juvenileDensityM2: 4, juvenileStructureGC: .05 } });
  const b = new AgeStructuredExperiment({ initial: { ...initial, juvenileDensityM2: 2, juvenileStructureGC: .10 } });
  near(a.snapshot().juvenile.biomassC, b.snapshot().juvenile.biomassC);
  assert.equal(a.snapshot().juvenile.densityM2, 4); assert.equal(b.snapshot().juvenile.densityM2, 2);
  assert.equal(a.exportData().countsAreContinuous, true); assert.equal(a.exportData().mapsTo3DIndividuals, false);
  assert.equal(a.exportData().densityUnit, 'expected model individuals/m²');
  assert.equal(a.exportData().parameterUnits.newbornStructureGC, 'g organic C/model individual');
});

test('maturation requires both actual minimum age and structural size, with no carbon or count creation', () => {
  const readySize = new AgeStructuredExperiment({ parameters: noFlux, initial: { ...initial, juvenileStructureGC: .10 } });
  const carbon = readySize.totalOrganicC;
  readySize.stepDays(19.95);
  assert.equal(readySize.snapshot().adult.densityM2, 0);
  readySize.stepDays(.05);
  assert.equal(readySize.snapshot().adult.densityM2, 1); assert.equal(readySize.cohorts[0].maturedAtDay, 20);
  near(readySize.totalOrganicC, carbon); assert.equal(readySize.snapshot().totalDensityM2, 1);
  near(readySize.ledger.maturationC, .10); assert.equal(readySize.ledger.birthsExpectedM2, 0);
  const tooSmall = new AgeStructuredExperiment({ parameters: noFlux, initial: { ...initial, juvenileAgeDays: 100, juvenileStructureGC: .01 } });
  tooSmall.stepDays(30);
  assert.equal(tooSmall.snapshot().adult.densityM2, 0);
});

test('adult reserves pay birth carbon and every new cohort waits its minimum age', () => {
  const sim = new AgeStructuredExperiment({ parameters: { ...noFlux, reserveMobilisationPerDay: .5, reproductionAllocationFraction: 1 },
    initial: { ...initial, juvenileDensityM2: 0, adultDensityM2: 2, adultStructureGC: .20, adultAgeDays: 60, reserveRatio: .4 } });
  sim.stepDays(19.95);
  assert(sim.ledger.birthsExpectedM2 > 0); assert.equal(sim.ledger.maturationsExpectedM2, 0);
  near(sim.ledger.birthsExpectedM2 * sim.parameters.newbornStructureGC, sim.ledger.newbornStructureC);
  near(sim.ledger.reproductionPaidC * sim.parameters.offspringYieldFraction, sim.ledger.newbornStructureC);
  assert(Math.abs(sim.carbonBudgetError) < 1e-9);
  const newborns = sim.cohorts.filter(c => c.id.startsWith('birth-'));
  assert(newborns.every(c => c.stage === 'juvenile'));
  assert(newborns.every(c => sim.timeDays - c.latestBirthDay < sim.parameters.minMaturityAgeDays));
});

test('empty reserve without food produces no offspring, and empty population never refills itself', () => {
  const emptyReserve = new AgeStructuredExperiment({ parameters: { foodInputGCM2Day: 0 }, initial: { ...initial, juvenileDensityM2: 0, adultDensityM2: 2, reserveRatio: 0 } });
  emptyReserve.stepDays(120);
  assert.equal(emptyReserve.ledger.birthsExpectedM2, 0); assert.equal(emptyReserve.ledger.reproductionPaidC, 0);
  assert(emptyReserve.snapshot().totalDensityM2 < 2);
  const extinct = new AgeStructuredExperiment({ initial: { juvenileDensityM2: 0, adultDensityM2: 0 } });
  extinct.stepDays(365);
  assert.equal(extinct.snapshot().totalDensityM2, 0); assert.equal(extinct.ledger.birthsExpectedM2, 0); assert.equal(extinct.cohorts.length, 0);
  assert(extinct.foodC > extinct.initial.foodC); assert(Math.abs(extinct.carbonBudgetError) < 1e-9);
});

test('natural mortality synchronously removes density, structure and reserve and returns carbon to detritus', () => {
  const sim = new AgeStructuredExperiment({ parameters: { ...noFlux, juvenileMortalityPerDay: .1, adultMortalityPerDay: .2 },
    initial: { ...initial, juvenileDensityM2: 2, juvenileStructureGC: .05, adultDensityM2: 3, adultStructureGC: .20, adultAgeDays: 60, reserveRatio: .2 } });
  const carbon = sim.totalOrganicC;
  sim.stepDays(1);
  near(sim.snapshot().juvenile.densityM2, 2 * Math.exp(-.1)); near(sim.snapshot().adult.densityM2, 3 * Math.exp(-.2));
  for (const c of sim.cohorts) { near(c.structureC / c.densityM2, c.stage === 'juvenile' ? .05 : .20); near(c.reserveC / c.structureC, .2); }
  near(sim.totalOrganicC, carbon); near(sim.detritusC, sim.ledger.mortalityReturnC);
  near(sim.snapshot().demographicBudgetErrorM2.juvenile, 0); near(sim.snapshot().demographicBudgetErrorM2.adult, 0);
});

test('stage harvest exports whole-body carbon and records demographic removal', () => {
  const sim = new AgeStructuredExperiment({ parameters: noFlux, initial: { ...initial, juvenileDensityM2: 0, adultDensityM2: 3, reserveRatio: .2 }, environment: { adultHarvestPerDay: .1 } });
  const carbon = sim.totalOrganicC;
  sim.stepDays(1);
  near(sim.snapshot().adult.densityM2, 3 * Math.exp(-.1)); near(sim.totalOrganicC + sim.ledger.harvestOutputC, carbon);
  assert.equal(sim.detritusC, 0); assert.equal(sim.ledger.mortalityReturnC, 0);
  near(sim.ledger.harvestedExpectedM2ByStage.adult, 3 * (1 - Math.exp(-.1)));
});

test('paired stop-food intervention preserves prehistory and later reduces births without an instant cutoff', () => {
  const pair = runPairedAgeExperiment(42, 365, 90, { foodInputMultiplier: 0 });
  assert.equal(pair.preInterventionEqual, true);
  const birthsAt = (run, day) => run.curve.rows.find(row => row[0] === day)[7];
  assert.deepEqual(pair.baseline.curve.rows.filter(row => row[0] <= 90), pair.perturbed.curve.rows.filter(row => row[0] <= 90));
  const baselineLate = birthsAt(pair.baseline, 365) - birthsAt(pair.baseline, 305), stopLate = birthsAt(pair.perturbed, 365) - birthsAt(pair.perturbed, 305);
  assert(stopLate < baselineLate, `${stopLate} late births vs ${baselineLate}`);
  assert(birthsAt(pair.perturbed, 91) > birthsAt(pair.perturbed, 90));
});

test('five seeds retain finite nonnegative state, carbon and demographic budgets and bounded birth-bin counts', () => {
  for (const seed of [1, 7, 42, 2026, 'age-five']) {
    const sim = new AgeStructuredExperiment({ seed });
    for (let day = 1; day <= 365; day++) {
      sim.stepDays(1); const s = sim.snapshot();
      assert(Number.isFinite(s.totalOrganicC) && s.totalOrganicC >= 0);
      assert(s.totalOrganicC <= sim.ledger.initialOrganicC + sim.ledger.externalInputC + 1e-7);
      assert(Math.abs(s.carbonBudgetError) < 1e-7);
      assert(Object.values(s.demographicBudgetErrorM2).every(value => Math.abs(value) < 1e-8));
      assert(s.cohortCount <= Math.floor(day / sim.parameters.cohortBinDays) + 3);
      for (const c of sim.cohorts) {
        assert([c.densityM2, c.structureC, c.reserveC].every(value => Number.isFinite(value) && value >= 0));
        if (c.maturedAtDay !== null && c.id.startsWith('birth-')) assert(c.maturedAtDay - c.latestBirthDay + 1e-8 >= sim.parameters.minMaturityAgeDays);
      }
    }
    assert(sim.ledger.birthsExpectedM2 > 0 && sim.ledger.maturationsExpectedM2 > 0);
  }
});

test('half time step and birth-bin width expose numerical approximation without changing units', () => {
  const regular = new AgeStructuredExperiment({ seed: 42 }), halfStep = new AgeStructuredExperiment({ seed: 42, timeStepDays: .025 }), halfBin = new AgeStructuredExperiment({ seed: 42, parameters: { cohortBinDays: .25 } });
  for (const sim of [regular, halfStep, halfBin]) sim.stepDays(180);
  const base = regular.snapshot();
  for (const sim of [halfStep, halfBin]) {
    const s = sim.snapshot(); assert(Math.abs(s.carbonBudgetError) < 1e-7);
    assert(Math.abs(s.totalDensityM2 - base.totalDensityM2) / base.totalDensityM2 < .1);
    assert(Math.abs(s.adult.biomassC - base.adult.biomassC) / base.adult.biomassC < .1);
  }
});

test('clock units, patch validation and constructor constraints reject invalid state atomically', () => {
  const sim = new AgeStructuredExperiment(); sim.stepDays(.03); assert.equal(sim.timeDays, 0); sim.stepDays(.02); assert.equal(sim.timeDays, .05);
  const before = snapshot(sim);
  for (const patch of [{ foodInputMultiplier: 0, adultFoodAccessMultiplier: NaN }, { constructor: 1 }, null, []]) assert.throws(() => sim.setEnvironment(patch));
  assert.deepEqual(snapshot(sim), before);
  for (const days of [-1, NaN, Infinity, 3651]) assert.throws(() => sim.stepDays(days));
  for (const parameters of [{ newbornStructureGC: 0 }, { newbornStructureGC: .2 }, { assimilationFraction: .9 }, { minMaturityAgeDays: 0 }, { cohortBinDays: .123 }]) assert.throws(() => new AgeStructuredExperiment({ parameters }));
  const months = new AgeStructuredExperiment(); months.runMonths(1); assert.equal(months.timeDays, 30);
  assert.throws(() => runPairedAgeExperiment(42, 365, 90.013, {}));
});
