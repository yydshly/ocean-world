/** Independent long-term functional-group experiment.
 * Biomass: g organic C / m² of a notional, well-mixed reef patch.
 * Time: explicitly simulated DAYS; a model month is exactly 30 days.
 * Parameters are illustrative, not measured species or reef forecasts.
 * No imports from the real-time ReefSimulation or its individual agents.
 */
export const BIOMASS_POOLS = Object.freeze([
  'benthicProducers', 'planktonProducers', 'grazers', 'planktivores',
  'predators', 'detritus', 'decomposers',
]);
export const EXPERIMENT_TIME_STEP_DAYS = 0.05;
export const EXPERIMENT_MONTH_DAYS = 30;

export const MODEL_SOURCES = Object.freeze([
  { label: 'Holling (1959): functional response to prey density', url: 'https://www.cambridge.org/core/journals/canadian-entomologist/article/abs/some-characteristics-of-simple-types-of-predation-and-parasitism1/9E1E7D2CCC314766A424680444F4EA9F', doi: '10.4039/Ent91385-7' },
  { label: 'Rosenzweig & MacArthur (1963): resource limits and predator–prey stability', url: 'https://www.journals.uchicago.edu/doi/abs/10.1086/282272', doi: '10.1086/282272' },
  { label: 'Monod (1949): substrate-dependent microbial growth', url: 'https://garcialab.berkeley.edu/courses/papers/Monod1949.pdf', doi: '10.1146/annurev.mi.03.100149.002103' },
]);

export const DEFAULT_POPULATION_PARAMETERS = Object.freeze({
  benthicGrowthPerDay: 0.06, planktonGrowthPerDay: 0.25,
  benthicCapacityGCM2: 85, planktonCapacityGCM2: 25,
  grazerCapacityGCM2: 12, planktivoreCapacityGCM2: 10,
  predatorCapacityGCM2: 4, decomposerCapacityGCM2: 8,
  grazerMaxIntakePerDay: 0.35, planktivoreMaxIntakePerDay: 0.45,
  predatorMaxIntakePerDay: 0.25, decomposerMaxIntakePerDay: 0.5,
  grazerHalfSaturationGCM2: 15, planktivoreHalfSaturationGCM2: 5,
  predatorHalfSaturationGCM2: 3, decomposerHalfSaturationGCM2: 3,
  grazerAssimilationFraction: 0.35, planktivoreAssimilationFraction: 0.3,
  predatorAssimilationFraction: 0.3, decomposerAssimilationFraction: 0.35,
  egestionFraction: 0.2, recruitmentFraction: 0.25,
  producerMortalityPerDay: 0.004, planktonMortalityPerDay: 0.015,
  grazerMortalityPerDay: 0.01, planktivoreMortalityPerDay: 0.015,
  predatorMortalityPerDay: 0.008, decomposerMortalityPerDay: 0.05,
  grazerCrowdingPerDay: 0.012, planktivoreCrowdingPerDay: 0.02,
  predatorCrowdingPerDay: 0.014, decomposerCrowdingPerDay: 0.025,
  producerRespirationPerDay: 0.007, planktonRespirationPerDay: 0.01,
  grazerRespirationPerDay: 0.018, planktivoreRespirationPerDay: 0.024,
  predatorRespirationPerDay: 0.013, decomposerRespirationPerDay: 0.025,
  planktonInputGCM2Day: 0.12, detritusInputGCM2Day: 0.08,
  planktonExchangePerDay: 0.045, detritusExchangePerDay: 0.04,
  seasonalAmplitude: 0.12,
});

export const DEFAULT_POPULATION_ENVIRONMENT = Object.freeze({
  lightMultiplier: 1, turbidityIndex: 0.15, planktonInputMultiplier: 1,
  exchangeMultiplier: 1, predatorHarvestPerDay: 0,
});

const INITIAL_REFERENCE = Object.freeze({ benthicProducers: 40, planktonProducers: 12, grazers: 3, planktivores: 2, predators: 0.8, detritus: 8, decomposers: 1.2 });
const ZERO_GROUPS = () => Object.fromEntries(BIOMASS_POOLS.map((key) => [key, 0]));
const total = (state) => BIOMASS_POOLS.reduce((sum, key) => sum + state[key], 0);
const clone = (value) => JSON.parse(JSON.stringify(value));
const saturate = (resource, half) => resource / (half + resource);
function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
}
function seedHash(seed) {
  let value = 2166136261;
  for (const letter of String(seed)) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
  return value >>> 0;
}

function validateParameters(patch, base = DEFAULT_POPULATION_PARAMETERS) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_POPULATION_PARAMETERS)) throw new TypeError(`Unknown model parameter: ${key}`);
    finiteNonnegative(value, key);
    if ((key.includes('Capacity') || key.includes('HalfSaturation')) && value === 0) throw new RangeError(`${key} must be positive.`);
    if ((key.includes('Fraction') || key === 'seasonalAmplitude') && value > 1) throw new RangeError(`${key} must not exceed 1.`);
    if (value > 10000) throw new RangeError(`${key} exceeds this teaching model's supported range.`);
  }
  const merged = { ...base, ...patch };
  for (const prefix of ['grazer', 'planktivore', 'predator', 'decomposer']) {
    if (merged[`${prefix}AssimilationFraction`] + merged.egestionFraction > 1) throw new RangeError('Assimilation plus egestion cannot exceed ingested organic carbon.');
  }
  return merged;
}

function validateEnvironment(patch, base = DEFAULT_POPULATION_ENVIRONMENT) {
  const limits = { lightMultiplier: [0, 2], turbidityIndex: [0, 1], planktonInputMultiplier: [0, 3], exchangeMultiplier: [0, 3], predatorHarvestPerDay: [0, 0.1] };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in limits)) throw new TypeError(`Unknown long-term environment parameter: ${key}`);
    if (!Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]) throw new RangeError(`${key} must be between ${limits[key][0]} and ${limits[key][1]}.`);
  }
  return { ...base, ...patch };
}

export class PopulationExperiment {
  constructor({ seed = 42, parameters = {}, initialBiomass = {}, environment = {}, sampleEveryDays = 1 } = {}) {
    this.parameters = validateParameters(parameters);
    this._initialOverrides = { ...initialBiomass };
    for (const [pool, value] of Object.entries(initialBiomass)) {
      if (!BIOMASS_POOLS.includes(pool)) throw new TypeError(`Unknown biomass pool: ${pool}`);
      finiteNonnegative(value, pool);
      if (value > 10000) throw new RangeError('Initial biomass above 10000 g C/m² is outside the supported range.');
    }
    finiteNonnegative(sampleEveryDays, 'sampleEveryDays');
    this._sampleEveryTicks = Math.round(sampleEveryDays / EXPERIMENT_TIME_STEP_DAYS);
    if (this._sampleEveryTicks < 1 || Math.abs(this._sampleEveryTicks * EXPERIMENT_TIME_STEP_DAYS - sampleEveryDays) > 1e-8) throw new RangeError('Sample spacing must be a positive multiple of 0.05 simulated days.');
    this._initialEnvironment = validateEnvironment(environment);
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this._rngState = seedHash(seed);
    this._ticks = 0;
    this._pendingDays = 0;
    this.timeDays = 0;
    this.environment = { ...this._initialEnvironment };
    this.biomass = Object.fromEntries(BIOMASS_POOLS.map((pool) => [pool, this._initialOverrides[pool] ?? INITIAL_REFERENCE[pool] * (0.88 + this._random() * 0.24)]));
    this.initialBiomass = { ...this.biomass };
    this.ledger = {
      initialOrganicC: total(this.biomass), primaryProductionC: 0, externalInputC: 0,
      respirationOutputC: 0, exchangeOutputC: 0, harvestOutputC: 0,
      internalTransferC: 0, ingestedC: 0,
      recruitmentCByGroup: ZERO_GROUPS(), growthCByGroup: ZERO_GROUPS(), mortalityCByGroup: ZERO_GROUPS(),
    };
    this.interventions = [];
    this.curve = [this.snapshot()];
    return this;
  }

  _random() {
    this._rngState = (this._rngState + 0x6d2b79f5) >>> 0;
    let value = this._rngState;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  setEnvironment(patch) {
    const next = validateEnvironment(patch, this.environment);
    this.environment = next;
    this.interventions.push({ timeDays: this.timeDays, patch: { ...patch }, environment: { ...next } });
    return { ...this.environment };
  }

  stepDays(days) {
    finiteNonnegative(days, 'stepDays(days)');
    if (days > 36500) throw new RangeError('Advance at most 100 simulated years per call.');
    this._pendingDays += days;
    const ticks = Math.floor((this._pendingDays + 1e-10) / EXPERIMENT_TIME_STEP_DAYS);
    this._pendingDays -= ticks * EXPERIMENT_TIME_STEP_DAYS;
    if (this._pendingDays < 0 && this._pendingDays > -1e-8) this._pendingDays = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      this._advance(EXPERIMENT_TIME_STEP_DAYS);
      this._ticks += 1;
      this.timeDays = this._ticks * EXPERIMENT_TIME_STEP_DAYS;
      if (this._ticks % this._sampleEveryTicks === 0) this.curve.push(this.snapshot());
    }
    return this.snapshot();
  }

  runDays(days) { return this.stepDays(days); }
  runMonths(months) {
    finiteNonnegative(months, 'runMonths(months)');
    return this.stepDays(months * EXPERIMENT_MONTH_DAYS);
  }

  _advance(dt) {
    const s = this.biomass;
    const p = this.parameters;
    const e = this.environment;
    const seasonal = 1 + p.seasonalAmplitude * Math.sin(2 * Math.PI * this.timeDays / 365);
    const light = e.lightMultiplier * Math.exp(-1.5 * e.turbidityIndex) * seasonal;
    const edges = [];
    const add = (from, to, rate, reason, metadata = {}) => {
      if (rate > 0) edges.push({ from, to, rate, reason, ...metadata });
    };
    for (const [pool, growth, capacity, mortality, respiration] of [
      ['benthicProducers', p.benthicGrowthPerDay, p.benthicCapacityGCM2, p.producerMortalityPerDay, p.producerRespirationPerDay],
      ['planktonProducers', p.planktonGrowthPerDay, p.planktonCapacityGCM2, p.planktonMortalityPerDay, p.planktonRespirationPerDay],
    ]) {
      // Logistic-style net production expressed as two explicit carbon fluxes,
      // rather than allowing a negative external photosynthesis input above K.
      add(null, pool, growth * light * s[pool], 'photosynthesis');
      add(pool, 'detritus', growth * light * s[pool] ** 2 / capacity + mortality * s[pool], 'mortality');
      add(pool, null, respiration * s[pool], 'respiration');
    }
    add(null, 'planktonProducers', p.planktonInputGCM2Day * e.planktonInputMultiplier, 'external');
    add(null, 'detritus', p.detritusInputGCM2Day, 'external');
    add('planktonProducers', null, p.planktonExchangePerDay * e.exchangeMultiplier * s.planktonProducers, 'exchange');
    add('detritus', null, p.detritusExchangePerDay * e.exchangeMultiplier * s.detritus, 'exchange');
    add('predators', null, e.predatorHarvestPerDay * s.predators, 'harvest');

    const feeding = (prey, consumer, rate, efficiency, capacity) => {
      const reproduction = p.recruitmentFraction / (1 + s[consumer] / capacity);
      add(prey, consumer, rate * efficiency, 'assimilation', { consumer, reproduction });
      add(prey, 'detritus', rate * p.egestionFraction, 'egestion', { consumer });
      add(prey, null, rate * (1 - efficiency - p.egestionFraction), 'feeding-respiration', { consumer });
    };
    feeding('benthicProducers', 'grazers', p.grazerMaxIntakePerDay * s.grazers * saturate(s.benthicProducers, p.grazerHalfSaturationGCM2), p.grazerAssimilationFraction, p.grazerCapacityGCM2);
    feeding('planktonProducers', 'planktivores', p.planktivoreMaxIntakePerDay * s.planktivores * saturate(s.planktonProducers, p.planktivoreHalfSaturationGCM2), p.planktivoreAssimilationFraction, p.planktivoreCapacityGCM2);
    const preySum = s.grazers + s.planktivores;
    const predatorIntake = p.predatorMaxIntakePerDay * s.predators * saturate(preySum, p.predatorHalfSaturationGCM2);
    if (preySum > 0) {
      feeding('grazers', 'predators', predatorIntake * s.grazers / preySum, p.predatorAssimilationFraction, p.predatorCapacityGCM2);
      feeding('planktivores', 'predators', predatorIntake * s.planktivores / preySum, p.predatorAssimilationFraction, p.predatorCapacityGCM2);
    }
    feeding('detritus', 'decomposers', p.decomposerMaxIntakePerDay * s.decomposers * saturate(s.detritus, p.decomposerHalfSaturationGCM2), p.decomposerAssimilationFraction, p.decomposerCapacityGCM2);
    for (const [pool, prefix, capacity] of [
      ['grazers', 'grazer', p.grazerCapacityGCM2], ['planktivores', 'planktivore', p.planktivoreCapacityGCM2],
      ['predators', 'predator', p.predatorCapacityGCM2], ['decomposers', 'decomposer', p.decomposerCapacityGCM2],
    ]) {
      const mortality = p[`${prefix}MortalityPerDay`] * s[pool] + p[`${prefix}CrowdingPerDay`] * s[pool] ** 2 / capacity;
      add(pool, 'detritus', mortality, 'mortality');
      add(pool, null, p[`${prefix}RespirationPerDay`] * s[pool], 'respiration');
    }
    const requested = ZERO_GROUPS();
    for (const edge of edges) if (edge.from) requested[edge.from] += edge.rate * dt;
    const scale = Object.fromEntries(BIOMASS_POOLS.map((pool) => [pool, requested[pool] > s[pool] ? s[pool] / requested[pool] : 1]));
    const delta = ZERO_GROUPS();
    for (const edge of edges) {
      const amount = edge.rate * dt * (edge.from ? scale[edge.from] : 1);
      if (edge.from) delta[edge.from] -= amount;
      if (edge.to) delta[edge.to] += amount;
      const l = this.ledger;
      if (!edge.from) {
        if (edge.reason === 'photosynthesis') l.primaryProductionC += amount;
        else l.externalInputC += amount;
      } else if (!edge.to) {
        if (edge.reason === 'exchange') l.exchangeOutputC += amount;
        else if (edge.reason === 'harvest') l.harvestOutputC += amount;
        else l.respirationOutputC += amount;
      } else l.internalTransferC += amount;
      if (edge.consumer) l.ingestedC += amount;
      if (edge.reason === 'mortality') l.mortalityCByGroup[edge.from] += amount;
      if (edge.reason === 'assimilation') {
        l.recruitmentCByGroup[edge.consumer] += amount * edge.reproduction;
        l.growthCByGroup[edge.consumer] += amount * (1 - edge.reproduction);
      }
    }
    for (const pool of BIOMASS_POOLS) {
      const next = s[pool] + delta[pool];
      if (!Number.isFinite(next) || next < -1e-8) throw new Error(`Nonfinite or negative biomass in ${pool}.`);
      // Only remove floating-point residue, never restore a preferred biomass.
      s[pool] = next < 0 ? 0 : next;
    }
  }

  get carbonBudgetError() {
    const l = this.ledger;
    return total(this.biomass) - (l.initialOrganicC + l.primaryProductionC + l.externalInputC - l.respirationOutputC - l.exchangeOutputC - l.harvestOutputC);
  }

  snapshot() {
    return {
      timeDays: this.timeDays, modelMonths: this.timeDays / EXPERIMENT_MONTH_DAYS,
      biomass: { ...this.biomass }, producers: this.biomass.benthicProducers + this.biomass.planktonProducers,
      totalOrganicC: total(this.biomass), carbonBudgetError: this.carbonBudgetError,
      ledger: clone(this.ledger),
    };
  }

  exportCurve() {
    const snapshots = this.curve.at(-1).timeDays === this.timeDays ? this.curve : [...this.curve, this.snapshot()];
    return {
      timeUnit: 'simulated day', biomassUnit: 'g organic C/m² (illustrative)',
      columns: ['timeDays', ...BIOMASS_POOLS, 'carbonBudgetError'],
      rows: snapshots.map((sample) => [sample.timeDays, ...BIOMASS_POOLS.map((pool) => sample.biomass[pool]), sample.carbonBudgetError]),
    };
  }

  exportData() {
    return {
      schema: 'tidal-functional-group-experiment-v1', mode: 'independent long-term biomass experiment',
      seed: this.seed, simulatedTimeUnit: 'day', modelMonthDays: EXPERIMENT_MONTH_DAYS,
      biomassUnit: 'g organic C/m²', calibration: 'illustrative parameters; no species or field forecast',
      fixedStepDays: EXPERIMENT_TIME_STEP_DAYS, pendingDays: this._pendingDays,
      parameters: { ...this.parameters }, environment: { ...this.environment },
      initialBiomass: { ...this.initialBiomass }, current: this.snapshot(),
      interventions: clone(this.interventions), curve: this.exportCurve(), sources: clone(MODEL_SOURCES),
      warning: 'Recruitment is an illustrative allocation of assimilated biomass; actual birth counts and age structure are not resolved. The inorganic carbon and nutrient pools remain outside this organic-carbon budget.',
    };
  }
}

/** Compare identical initial conditions; time arguments are explicitly days. */
export function runPairedExperiment({ seed = 42, durationDays = 365, interventionDay = 90, intervention = { turbidityIndex: 0.85 }, parameters = {}, initialBiomass = {}, environment = {} } = {}) {
  finiteNonnegative(durationDays, 'durationDays');
  finiteNonnegative(interventionDay, 'interventionDay');
  if (interventionDay > durationDays) throw new RangeError('Intervention must occur within the experiment.');
  if (Math.abs(interventionDay / EXPERIMENT_TIME_STEP_DAYS - Math.round(interventionDay / EXPERIMENT_TIME_STEP_DAYS)) > 1e-8) throw new RangeError('Intervention day must align with a 0.05-day model step.');
  validateEnvironment(intervention, validateEnvironment(environment));
  const options = { seed, parameters, initialBiomass, environment };
  const baseline = new PopulationExperiment(options);
  const perturbed = new PopulationExperiment(options);
  baseline.stepDays(interventionDay);
  perturbed.stepDays(interventionDay);
  perturbed.setEnvironment(intervention);
  baseline.stepDays(durationDays - interventionDay);
  perturbed.stepDays(durationDays - interventionDay);
  return {
    schema: 'tidal-paired-functional-group-experiment-v1', seed, durationDays, interventionDay,
    intervention: { ...intervention }, baseline: baseline.exportData(), perturbed: perturbed.exportData(),
  };
}
