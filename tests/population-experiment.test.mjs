import test from 'node:test';
import assert from 'node:assert/strict';
import { PopulationExperiment, runPairedExperiment, BIOMASS_POOLS, DEFAULT_POPULATION_PARAMETERS } from '../src/ecology/PopulationExperiment.js';

test('long-term time uses explicit days and explicit 30-day months', () => {
  const byDays = new PopulationExperiment({ seed: 42 });
  const byMonths = new PopulationExperiment({ seed: 42 });
  byDays.runDays(60);
  byMonths.runMonths(2);
  assert.equal(byDays.timeDays, 60);
  assert.deepEqual(byDays.exportData(), byMonths.exportData());
  const fractional = new PopulationExperiment();
  fractional.stepDays(0.02);
  assert.equal(fractional.timeDays, 0);
  fractional.stepDays(0.03);
  assert.equal(fractional.timeDays, 0.05);
  assert.equal(fractional.exportData().simulatedTimeUnit, 'day');
  assert.equal(fractional.exportData().biomassUnit, 'g organic C/m²');
});

test('same seed reproduces curves and ledger regardless of advance batching', () => {
  const bulk = new PopulationExperiment({ seed: 'long-term', sampleEveryDays: 0.5 });
  const small = new PopulationExperiment({ seed: 'long-term', sampleEveryDays: 0.5 });
  bulk.stepDays(90);
  for (let tick = 0; tick < 3600; tick += 1) small.stepDays(0.025);
  assert.deepEqual(bulk.exportData(), small.exportData());
  const other = new PopulationExperiment({ seed: 'another' });
  assert.notDeepEqual(other.initialBiomass, bulk.initialBiomass);
  bulk.reset('long-term');
  assert.deepEqual(bulk.initialBiomass, new PopulationExperiment({ seed: 'long-term' }).initialBiomass);
});

test('five seeds across five years remain nonnegative, finite and bounded without biomass clamps', () => {
  for (const seed of [1, 9, 42, 77, 2026]) {
    const sim = new PopulationExperiment({ seed, sampleEveryDays: 5 });
    sim.runDays(1825);
    assert.equal(sim.timeDays, 1825);
    for (const sample of sim.curve) {
      assert(sample.totalOrganicC > 0 && sample.totalOrganicC < 300);
      assert(Object.values(sample.biomass).every((value) => Number.isFinite(value) && value >= 0));
      assert(Math.abs(sample.carbonBudgetError) < 1e-7);
    }
    assert(sim.ledger.primaryProductionC > 0);
    assert(sim.ledger.externalInputC > 0 && sim.ledger.respirationOutputC > 0 && sim.ledger.exchangeOutputC > 0);
    assert(sim.ledger.mortalityCByGroup.grazers > 0 && sim.ledger.recruitmentCByGroup.grazers > 0);
    assert.notDeepEqual(sim.biomass, sim.initialBiomass);
  }
});

test('same-seed interventions share their pre-intervention history and reduce photosynthetic carbon input', () => {
  const pair = runPairedExperiment({ seed: 77, durationDays: 365, interventionDay: 90, intervention: { turbidityIndex: 0.9 } });
  const before = (run) => run.curve.rows.filter((row) => row[0] <= 90);
  assert.deepEqual(pair.baseline.initialBiomass, pair.perturbed.initialBiomass);
  assert.deepEqual(before(pair.baseline), before(pair.perturbed));
  assert(pair.perturbed.current.ledger.primaryProductionC < pair.baseline.current.ledger.primaryProductionC);
  assert(pair.perturbed.current.producers < pair.baseline.current.producers);
  assert.notDeepEqual(pair.perturbed.current.biomass, pair.baseline.current.biomass);
  assert(Math.abs(pair.perturbed.current.carbonBudgetError) < 1e-7);
});

test('predator removal has an explicit organic-carbon export and feedback, not rebalanced biomass', () => {
  const pair = runPairedExperiment({ seed: 42, durationDays: 180, interventionDay: 45, intervention: { predatorHarvestPerDay: 0.08 } });
  assert(pair.perturbed.current.ledger.harvestOutputC > 0);
  assert.equal(pair.baseline.current.ledger.harvestOutputC, 0);
  assert(pair.perturbed.current.biomass.predators < pair.baseline.current.biomass.predators);
  assert(pair.perturbed.current.biomass.grazers > pair.baseline.current.biomass.grazers);
  assert(Math.abs(pair.perturbed.current.carbonBudgetError) < 1e-7);
});

test('a closed, unproductive setup conserves carbon through recruitment, mortality and decomposition', () => {
  const parameters = { benthicGrowthPerDay: 0, planktonGrowthPerDay: 0, planktonInputGCM2Day: 0, detritusInputGCM2Day: 0, planktonExchangePerDay: 0, detritusExchangePerDay: 0 };
  for (const name of Object.keys(DEFAULT_POPULATION_PARAMETERS)) if (name.includes('RespirationPerDay')) parameters[name] = 0;
  // Setting respiration fractions to zero requires all ingested carbon to be
  // assimilated or egested. The biological transfer model still runs.
  for (const group of ['grazer', 'planktivore', 'predator', 'decomposer']) parameters[`${group}AssimilationFraction`] = 0.8;
  const sim = new PopulationExperiment({ parameters });
  const initial = sim.snapshot().totalOrganicC;
  sim.runDays(180);
  assert(Math.abs(sim.snapshot().totalOrganicC - initial) < 1e-8);
  assert.equal(sim.ledger.primaryProductionC, 0);
  assert.equal(sim.ledger.externalInputC, 0);
  assert.equal(sim.ledger.respirationOutputC, 0);
  assert(sim.ledger.internalTransferC > 0);
  assert(sim.ledger.recruitmentCByGroup.planktivores > 0);
});

test('absent consumer groups remain absent and darkness can produce decline', () => {
  const empty = new PopulationExperiment({ initialBiomass: { predators: 0, grazers: 0 } });
  empty.runDays(365);
  assert.equal(empty.biomass.predators, 0);
  assert.equal(empty.biomass.grazers, 0);
  const dark = new PopulationExperiment({ environment: { lightMultiplier: 0, planktonInputMultiplier: 0 } });
  dark.runDays(365);
  assert.equal(dark.ledger.primaryProductionC, 0);
  assert(dark.biomass.benthicProducers < dark.initialBiomass.benthicProducers * 0.1);
});

test('flux limiter preserves positive pools under extreme crowding and accounts for all carbon', () => {
  const extreme = new PopulationExperiment({ initialBiomass: { benthicProducers: 10000, grazers: 2000, predators: 1000, detritus: 0 } });
  extreme.stepDays(5);
  assert(Object.values(extreme.biomass).every((value) => Number.isFinite(value) && value >= 0));
  assert(Math.abs(extreme.carbonBudgetError) < 1e-7);
});

test('invalid input is rejected atomically and exported data do not mutate the experiment', () => {
  const sim = new PopulationExperiment();
  const before = sim.exportData();
  assert.throws(() => sim.setEnvironment({ lightMultiplier: 0.5, turbidityIndex: NaN }), RangeError);
  assert.deepEqual(sim.exportData(), before);
  assert.throws(() => sim.setEnvironment({ hour: 10 }), TypeError);
  for (const value of [-1, NaN, Infinity, 36501]) assert.throws(() => sim.stepDays(value), RangeError);
  assert.throws(() => new PopulationExperiment({ parameters: { grazerAssimilationFraction: 0.9 } }), RangeError);
  assert.throws(() => new PopulationExperiment({ parameters: { grazerHalfSaturationGCM2: 0 } }), RangeError);
  assert.throws(() => new PopulationExperiment({ initialBiomass: { namedFish: 1 } }), TypeError);
  assert.throws(() => runPairedExperiment({ interventionDay: 0.03 }), RangeError);
  const exported = sim.exportData();
  exported.current.biomass.grazers = -100;
  assert(sim.biomass.grazers > 0);
  assert.equal(BIOMASS_POOLS.length, 7);
});
