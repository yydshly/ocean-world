/** Independent, uncalibrated lifecycle teaching model.
 * Time is simulated DAYS; organic carbon is g C/m².
 * One anonymous consumer group. Densities are continuous expected individuals
 * per m², never a list of the 3D scene's named organisms.
 */
export const AGE_TIME_STEP_DAYS = 0.05;
export const AGE_MODEL_MONTH_DAYS = 30;
export const AGE_MODEL_SOURCES = Object.freeze([
  { label: 'De Roos et al. (2008): food-dependent size growth and stage structure', url: 'https://pubmed.ncbi.nlm.nih.gov/18006030/', doi: '10.1016/j.tpb.2007.09.004' },
  { label: 'Lika & Nisbet (2000): maintenance, reserve and reproductive allocation', url: 'https://link.springer.com/article/10.1007/s002850000049', doi: '10.1007/s002850000049' },
  { label: 'Reichstein et al. (2015): experimental stage-specific resource bottlenecks', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4366502/', doi: '10.1038/ncomms7441' },
]);
export const DEFAULT_AGE_PARAMETERS = Object.freeze({
  newbornStructureGC: 0.01, maturityStructureGC: 0.10,
  minMaturityAgeDays: 20, maxAdultStructureGC: 0.30,
  cohortBinDays: 0.5, reserveCapacityRatio: 0.5,
  juvenileMaxIntakePerDay: 0.50, adultMaxIntakePerDay: 0.35,
  foodHalfSaturationGCM2: 2, assimilationFraction: 0.35, egestionFraction: 0.20,
  juvenileMaintenancePerDay: 0.022, adultMaintenancePerDay: 0.018,
  reserveMobilisationPerDay: 0.50, growthYieldFraction: 0.80,
  reproductionAllocationFraction: 0.70, offspringYieldFraction: 0.80,
  juvenileMortalityPerDay: 0.008, adultMortalityPerDay: 0.008,
  starvationMortalityPerDay: 0.18, crowdingMortalityPerDay: 0.018,
  crowdingReferenceGCM2: 4,
  foodInputGCM2Day: 0.20, detritusInputGCM2Day: 0,
  foodExchangePerDay: 0.005, detritusExchangePerDay: 0.015,
  foodDecayPerDay: 0.005,
});
export const AGE_PARAMETER_UNITS = Object.freeze(Object.fromEntries(Object.keys(DEFAULT_AGE_PARAMETERS).map(key => [key,
  key.endsWith('Days') ? 'simulated day' : key.endsWith('GC') ? 'g organic C/model individual' : key.endsWith('GCM2Day') ? 'g organic C/m²/simulated day'
    : key.endsWith('GCM2') ? 'g organic C/m²' : key.endsWith('PerDay') ? '1/simulated day' : 'dimensionless',
])));
export const DEFAULT_AGE_ENVIRONMENT = Object.freeze({
  foodInputMultiplier: 1, juvenileFoodAccessMultiplier: 1, adultFoodAccessMultiplier: 1,
  juvenileHarvestPerDay: 0, adultHarvestPerDay: 0,
});
export const DEFAULT_AGE_INITIAL = Object.freeze({
  foodC: 4, detritusC: 0.5, juvenileDensityM2: 4, adultDensityM2: 4,
  juvenileStructureGC: 0.05, adultStructureGC: 0.20,
  juvenileAgeDays: 10, adultAgeDays: 60, reserveRatio: 0.20,
});
const copy = value => JSON.parse(JSON.stringify(value));
const stages = ['juvenile', 'adult'];
const zeroStages = () => ({ juvenile: 0, adult: 0 });
const finiteNonnegative = (value, name) => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
};
function requirePatch(patch, name) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError(`${name} must be an object.`);
}
function validateParameters(patch, dt) {
  requirePatch(patch, 'parameters');
  const p = { ...DEFAULT_AGE_PARAMETERS };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(p, key)) throw new TypeError(`Unknown age parameter: ${key}`);
    finiteNonnegative(value, key);
    if (value > 10000) throw new RangeError(`${key} exceeds the teaching range.`);
    if ((key.endsWith('Fraction') || key === 'reserveCapacityRatio') && value > 1) throw new RangeError(`${key} must not exceed 1.`);
    if (key.endsWith('PerDay') && value > 10) throw new RangeError(`${key} must not exceed 10/day.`);
    p[key] = value;
  }
  for (const key of ['newbornStructureGC', 'maturityStructureGC', 'maxAdultStructureGC', 'foodHalfSaturationGCM2', 'crowdingReferenceGCM2', 'cohortBinDays']) if (!(p[key] > 0)) throw new RangeError(`${key} must be positive.`);
  if (p.newbornStructureGC < 1e-6) throw new RangeError('newbornStructureGC must be at least 1e-6 g C/model individual.');
  if (p.newbornStructureGC >= p.maturityStructureGC || p.maxAdultStructureGC < p.maturityStructureGC) throw new RangeError('Birth mass < maturation mass <= adult maximum is required.');
  if (p.assimilationFraction + p.egestionFraction > 1) throw new RangeError('Assimilation plus egestion must not exceed intake.');
  if (p.minMaturityAgeDays < dt) throw new RangeError('Minimum maturation age must be at least one model step.');
  if (Math.abs(p.cohortBinDays / dt - Math.round(p.cohortBinDays / dt)) > 1e-8 || p.cohortBinDays < dt) throw new RangeError('Birth bin must be a positive integer number of model steps.');
  return p;
}
function validateEnvironment(patch, base = DEFAULT_AGE_ENVIRONMENT) {
  requirePatch(patch, 'environment');
  const limits = { foodInputMultiplier: 3, juvenileFoodAccessMultiplier: 2, adultFoodAccessMultiplier: 2, juvenileHarvestPerDay: 1, adultHarvestPerDay: 1 };
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(limits, key)) throw new TypeError(`Unknown age environment parameter: ${key}`);
    finiteNonnegative(value, key);
    if (value > limits[key]) throw new RangeError(`${key} exceeds ${limits[key]}.`);
    next[key] = value;
  }
  return next;
}
function validateInitial(patch, p) {
  requirePatch(patch, 'initial');
  const initial = { ...DEFAULT_AGE_INITIAL, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_AGE_INITIAL, key)) throw new TypeError(`Unknown age initial field: ${key}`);
    finiteNonnegative(value, key);
    if (value > 10000) throw new RangeError(`${key} exceeds the teaching range.`);
  }
  if (initial.reserveRatio > p.reserveCapacityRatio) throw new RangeError('Initial reserve ratio exceeds capacity.');
  for (const stage of stages) if (initial[`${stage}DensityM2`] > 0 && !(initial[`${stage}StructureGC`] > 0)) throw new RangeError('A nonempty cohort needs positive structural mass.');
  if (initial.adultDensityM2 > 0 && (initial.adultAgeDays < p.minMaturityAgeDays || initial.adultStructureGC < p.maturityStructureGC || initial.adultStructureGC > p.maxAdultStructureGC)) throw new RangeError('Initial adults must meet maturity and adult mass limits.');
  return initial;
}
function hashSeed(seed) {
  let hash = 2166136261;
  for (const letter of String(seed)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export class AgeStructuredExperiment {
  constructor({ seed = 42, parameters = {}, initial = {}, environment = {}, sampleEveryDays = 1, timeStepDays = AGE_TIME_STEP_DAYS } = {}) {
    if (!Number.isFinite(timeStepDays) || timeStepDays < 0.01 || timeStepDays > 0.1) throw new RangeError('timeStepDays must be 0.01–0.1 simulated day.');
    this.timeStepDays = timeStepDays;
    this.parameters = validateParameters(parameters, timeStepDays);
    this._initial = validateInitial(initial, this.parameters);
    this._initialOverrides = { ...initial };
    this._initialEnvironment = validateEnvironment(environment);
    finiteNonnegative(sampleEveryDays, 'sampleEveryDays');
    this._sampleTicks = Math.round(sampleEveryDays / timeStepDays);
    if (this._sampleTicks < 1 || Math.abs(this._sampleTicks * timeStepDays - sampleEveryDays) > 1e-8) throw new RangeError('Sampling must be a positive integer number of model steps.');
    this.sampleEveryDays = sampleEveryDays;
    this.reset(seed);
  }

  _random() {
    this._rngState = (this._rngState + 0x6d2b79f5) >>> 0;
    let value = this._rngState;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  reset(seed = this.seed) {
    this.seed = seed; this._rngState = hashSeed(seed); this._ticks = 0; this._pendingDays = 0; this.timeDays = 0;
    this.environment = { ...this._initialEnvironment };
    const initial = { ...this._initial };
    for (const key of ['foodC', 'juvenileDensityM2', 'adultDensityM2']) {
      const perturbation = 0.95 + 0.10 * this._random();
      if (!Object.hasOwn(this._initialOverrides, key)) initial[key] *= perturbation;
    }
    this.initial = { ...initial }; this.foodC = initial.foodC; this.detritusC = initial.detritusC;
    this.cohorts = stages.filter(stage => initial[`${stage}DensityM2`] > 0).map(stage => {
      const densityM2 = initial[`${stage}DensityM2`], structureC = densityM2 * initial[`${stage}StructureGC`], birthday = -initial[`${stage}AgeDays`];
      return { id: `initial-${stage}`, stage, densityM2, structureC, reserveC: structureC * initial.reserveRatio,
        earliestBirthDay: birthday, latestBirthDay: birthday, meanBirthDay: birthday, unpaidMaintenanceFraction: 0, maturedAtDay: stage === 'adult' ? 0 : null };
    });
    this._birthBins = new Map(); this.interventions = [];
    this.ledger = {
      initialOrganicC: this.totalOrganicC, externalInputC: 0, respirationOutputC: 0, exchangeOutputC: 0, harvestOutputC: 0,
      internalTransferC: 0, ingestedC: 0, assimilatedC: 0, maintenancePaidC: 0, maintenanceUnpaidC: 0,
      growthStructureC: 0, reproductionPaidC: 0, newbornStructureC: 0, maturationC: 0, mortalityReturnC: 0, reserveOverflowC: 0,
      birthsExpectedM2: 0, maturationsExpectedM2: 0,
      deathsExpectedM2ByStage: zeroStages(), harvestedExpectedM2ByStage: zeroStages(),
      initialDensityM2ByStage: Object.fromEntries(stages.map(stage => [stage, initial[`${stage}DensityM2`]])),
    };
    this.curve = [this.snapshot({ includeCohorts: false })]; return this;
  }
  setEnvironment(patch) {
    const next = validateEnvironment(patch, this.environment);
    this.environment = next; this.interventions.push({ timeDays: this.timeDays, patch: { ...patch }, environment: { ...next } });
    return { ...next };
  }
  stepDays(days) {
    finiteNonnegative(days, 'stepDays');
    if (days > 3650) throw new RangeError('Advance at most 3650 simulated days per call.');
    this._pendingDays += days;
    const ticks = Math.floor((this._pendingDays + 1e-10) / this.timeStepDays);
    this._pendingDays -= ticks * this.timeStepDays;
    if (this._pendingDays < 0 && this._pendingDays > -1e-8) this._pendingDays = 0;
    for (let index = 0; index < ticks; index++) {
      this._advance(this.timeStepDays, (this._ticks + 1) * this.timeStepDays);
      this._ticks++; this.timeDays = this._ticks * this.timeStepDays;
      if (this._ticks % this._sampleTicks === 0) this.curve.push(this.snapshot({ includeCohorts: false }));
    }
    return this.snapshot();
  }
  runDays(days) { return this.stepDays(days); }
  runMonths(months) { finiteNonnegative(months, 'runMonths'); return this.stepDays(months * AGE_MODEL_MONTH_DAYS); }

  _advance(dt, endDay) {
    const p = this.parameters, e = this.environment, l = this.ledger;
    const foodInput = p.foodInputGCM2Day * e.foodInputMultiplier * dt, detritusInput = p.detritusInputGCM2Day * dt;
    this.foodC += foodInput; this.detritusC += detritusInput; l.externalInputC += foodInput + detritusInput;
    const foodOut = this.foodC * (1 - Math.exp(-p.foodExchangePerDay * dt)), detritusOut = this.detritusC * (1 - Math.exp(-p.detritusExchangePerDay * dt));
    this.foodC -= foodOut; this.detritusC -= detritusOut; l.exchangeOutputC += foodOut + detritusOut;
    const decay = this.foodC * (1 - Math.exp(-p.foodDecayPerDay * dt));
    this.foodC -= decay; this.detritusC += decay; l.internalTransferC += decay;
    const liveC = this.cohorts.reduce((sum, c) => sum + c.structureC + c.reserveC, 0);
    for (const c of this.cohorts) {
      const natural = p[`${c.stage}MortalityPerDay`] + p.crowdingMortalityPerDay * liveC / p.crowdingReferenceGCM2 + p.starvationMortalityPerDay * c.unpaidMaintenanceFraction;
      const harvest = e[`${c.stage}HarvestPerDay`], hazard = natural + harvest;
      if (hazard > 0) {
        const fraction = 1 - Math.exp(-hazard * dt), removedN = c.densityM2 * fraction, removedC = (c.structureC + c.reserveC) * fraction;
        const mortalityC = removedC * natural / hazard, harvestC = removedC * harvest / hazard;
        c.densityM2 *= 1 - fraction; c.structureC *= 1 - fraction; c.reserveC *= 1 - fraction;
        this.detritusC += mortalityC; l.mortalityReturnC += mortalityC; l.internalTransferC += mortalityC; l.harvestOutputC += harvestC;
        l.deathsExpectedM2ByStage[c.stage] += removedN * natural / hazard;
        l.harvestedExpectedM2ByStage[c.stage] += removedN * harvest / hazard;
      }
    }
    const food = this.foodC, saturation = food / (p.foodHalfSaturationGCM2 + food);
    const requests = this.cohorts.map(c => p[`${c.stage}MaxIntakePerDay`] * c.structureC * saturation * e[`${c.stage}FoodAccessMultiplier`] * dt);
    const requested = requests.reduce((sum, value) => sum + value, 0), scale = requested > food ? food / requested : 1;
    let birthsN = 0, birthsC = 0;
    for (let index = 0; index < this.cohorts.length; index++) {
      const c = this.cohorts[index], intake = requests[index] * scale;
      const assimilated = intake * p.assimilationFraction, egested = intake * p.egestionFraction;
      this.foodC -= intake; c.reserveC += assimilated; this.detritusC += egested;
      l.ingestedC += intake; l.assimilatedC += assimilated; l.internalTransferC += assimilated + egested;
      l.respirationOutputC += intake - assimilated - egested;
      const demand = p[`${c.stage}MaintenancePerDay`] * c.structureC * dt, paid = Math.min(c.reserveC, demand);
      c.reserveC -= paid; l.maintenancePaidC += paid; l.respirationOutputC += paid; l.maintenanceUnpaidC += demand - paid;
      c.unpaidMaintenanceFraction = demand > 0 ? (demand - paid) / demand : 0;
      const mobilised = c.reserveC * (1 - Math.exp(-p.reserveMobilisationPerDay * dt));
      let growthCost = c.stage === 'juvenile' ? mobilised : mobilised * (1 - p.reproductionAllocationFraction);
      if (c.stage === 'adult' && p.growthYieldFraction > 0) growthCost = Math.min(growthCost, Math.max(0, p.maxAdultStructureGC * c.densityM2 - c.structureC) / p.growthYieldFraction);
      const growth = growthCost * p.growthYieldFraction;
      c.reserveC -= growthCost; c.structureC += growth; l.growthStructureC += growth; l.internalTransferC += growth; l.respirationOutputC += growthCost - growth;
      if (c.stage === 'adult') {
        const reproductionCost = mobilised * p.reproductionAllocationFraction;
        const newbornC = reproductionCost * p.offspringYieldFraction, density = newbornC / p.newbornStructureGC;
        c.reserveC -= reproductionCost; birthsC += newbornC; birthsN += density;
        l.reproductionPaidC += reproductionCost; l.newbornStructureC += newbornC; l.birthsExpectedM2 += density;
        l.internalTransferC += newbornC; l.respirationOutputC += reproductionCost - newbornC;
      }
      const overflow = Math.max(0, c.reserveC - p.reserveCapacityRatio * c.structureC);
      c.reserveC -= overflow; this.detritusC += overflow; l.reserveOverflowC += overflow; l.internalTransferC += overflow;
      if (c.stage === 'juvenile' && c.densityM2 > 0 && endDay - c.latestBirthDay + 1e-10 >= p.minMaturityAgeDays && c.structureC / c.densityM2 + 1e-12 >= p.maturityStructureGC) {
        c.stage = 'adult'; c.maturedAtDay = endDay; l.maturationsExpectedM2 += c.densityM2; l.maturationC += c.structureC + c.reserveC;
      }
    }
    if (birthsN > 0) {
      const bin = Math.floor((endDay + 1e-10) / p.cohortBinDays), previous = this._birthBins.get(bin);
      if (previous) {
        previous.meanBirthDay = (previous.meanBirthDay * previous.densityM2 + endDay * birthsN) / (previous.densityM2 + birthsN);
        previous.densityM2 += birthsN; previous.structureC += birthsC; previous.latestBirthDay = endDay;
      } else {
        const newborn = { id: `birth-${bin}`, stage: 'juvenile', densityM2: birthsN, structureC: birthsC, reserveC: 0,
          earliestBirthDay: endDay, latestBirthDay: endDay, meanBirthDay: endDay, unpaidMaintenanceFraction: 0, maturedAtDay: null };
        this.cohorts.push(newborn); this._birthBins.set(bin, newborn);
      }
    }
    // Only roundoff is tolerated. No population or biomass floors are restored.
    if (this.foodC < 0 && this.foodC > -1e-10) this.foodC = 0;
    for (const value of [this.foodC, this.detritusC, ...this.cohorts.flatMap(c => [c.densityM2, c.structureC, c.reserveC])]) if (!Number.isFinite(value) || value < 0) throw new Error('Nonfinite or negative age-structured state.');
  }

  get totalOrganicC() { return this.foodC + this.detritusC + this.cohorts.reduce((sum, c) => sum + c.structureC + c.reserveC, 0); }
  get carbonBudgetError() { const l = this.ledger; return this.totalOrganicC - (l.initialOrganicC + l.externalInputC - l.respirationOutputC - l.exchangeOutputC - l.harvestOutputC); }
  _stageSummary(stage) {
    const cohorts = this.cohorts.filter(c => c.stage === stage);
    const densityM2 = cohorts.reduce((sum, c) => sum + c.densityM2, 0), structureC = cohorts.reduce((sum, c) => sum + c.structureC, 0), reserveC = cohorts.reduce((sum, c) => sum + c.reserveC, 0);
    return { densityM2, structureC, reserveC, biomassC: structureC + reserveC,
      meanStructureGC: densityM2 > 0 ? structureC / densityM2 : null,
      meanAgeDays: densityM2 > 0 ? cohorts.reduce((sum, c) => sum + c.densityM2 * (this.timeDays - c.meanBirthDay), 0) / densityM2 : null };
  }
  snapshot({ includeCohorts = true } = {}) {
    const juvenile = this._stageSummary('juvenile'), adult = this._stageSummary('adult'), l = this.ledger;
    const expectedJ = l.initialDensityM2ByStage.juvenile + l.birthsExpectedM2 - l.maturationsExpectedM2 - l.deathsExpectedM2ByStage.juvenile - l.harvestedExpectedM2ByStage.juvenile;
    const expectedA = l.initialDensityM2ByStage.adult + l.maturationsExpectedM2 - l.deathsExpectedM2ByStage.adult - l.harvestedExpectedM2ByStage.adult;
    return { timeDays: this.timeDays, modelMonths: this.timeDays / AGE_MODEL_MONTH_DAYS,
      foodC: this.foodC, detritusC: this.detritusC, juvenile, adult,
      totalDensityM2: juvenile.densityM2 + adult.densityM2, totalOrganicC: this.totalOrganicC,
      carbonBudgetError: this.carbonBudgetError, demographicBudgetErrorM2: { juvenile: juvenile.densityM2 - expectedJ, adult: adult.densityM2 - expectedA },
      cohortCount: this.cohorts.length, ledger: copy(l), ...(includeCohorts ? { cohorts: copy(this.cohorts) } : {}) };
  }
  exportCurve() {
    const samples = this.curve.at(-1).timeDays === this.timeDays ? this.curve : [...this.curve, this.snapshot({ includeCohorts: false })];
    return { timeUnit: 'simulated day', biomassUnit: 'g organic C/m²', densityUnit: 'expected model individuals/m²',
      columns: ['timeDays', 'foodC', 'detritusC', 'juvenileBiomassC', 'adultBiomassC', 'juvenileDensityM2', 'adultDensityM2', 'birthsExpectedM2', 'maturationsExpectedM2', 'deathsExpectedM2', 'carbonBudgetError'],
      rows: samples.map(s => [s.timeDays, s.foodC, s.detritusC, s.juvenile.biomassC, s.adult.biomassC, s.juvenile.densityM2, s.adult.densityM2, s.ledger.birthsExpectedM2, s.ledger.maturationsExpectedM2, s.ledger.deathsExpectedM2ByStage.juvenile + s.ledger.deathsExpectedM2ByStage.adult, s.carbonBudgetError]) };
  }
  exportData() {
    return { schema: 'tidal-age-structured-experiment-v1', mode: 'independent anonymous consumer lifecycle teaching model', seed: this.seed,
      simulatedTimeUnit: 'day', modelMonthDays: AGE_MODEL_MONTH_DAYS, fixedStepDays: this.timeStepDays, pendingDays: this._pendingDays,
      biomassUnit: 'g organic C/m²', densityUnit: 'expected model individuals/m²', countsAreContinuous: true, mapsTo3DIndividuals: false,
      calibration: 'uncalibrated teaching parameters; no species, reef or kelp field prediction',
      parameters: { ...this.parameters }, parameterUnits: { ...AGE_PARAMETER_UNITS }, initial: { ...this.initial }, environment: { ...this.environment },
      current: this.snapshot(), interventions: copy(this.interventions), curve: this.exportCurve(), sources: copy(AGE_MODEL_SOURCES),
      limitations: ['One anonymous consumer, generic food and detritus; separate from the existing seven-pool and real-time models.', 'Half-day default birth bins preserve a strict minimum age but approximate within-bin ages and body-size variation.', 'Maintenance deficit raises a mortality proxy; structural catabolism and an explicit egg/embryo stage are absent.', 'Carbon efficiencies and body carbon per model individual are not calibrated; density is not a 3D birth count.', 'Inorganic carbon, nutrients, sex, recruitment dispersal and species-specific spawning are absent.'] };
  }
}

export function runPairedAgeExperiment(seed = 42, durationDays = 365, interventionDay = 90, intervention = { foodInputMultiplier: 0 }) {
  let options = {};
  if (seed && typeof seed === 'object') {
    ({ seed = 42, durationDays = 365, interventionDay = 90, intervention = { foodInputMultiplier: 0 }, ...options } = seed);
  }
  finiteNonnegative(durationDays, 'durationDays'); finiteNonnegative(interventionDay, 'interventionDay');
  const dt = options.timeStepDays ?? AGE_TIME_STEP_DAYS;
  if (interventionDay > durationDays || Math.abs(interventionDay / dt - Math.round(interventionDay / dt)) > 1e-8) throw new RangeError('Intervention must be within the run and align with the model step.');
  validateEnvironment(intervention);
  const baseline = new AgeStructuredExperiment({ ...options, seed }), perturbed = new AgeStructuredExperiment({ ...options, seed });
  baseline.stepDays(interventionDay); perturbed.stepDays(interventionDay);
  const preInterventionEqual = JSON.stringify(baseline.snapshot()) === JSON.stringify(perturbed.snapshot());
  perturbed.setEnvironment(intervention);
  baseline.stepDays(durationDays - interventionDay); perturbed.stepDays(durationDays - interventionDay);
  return { schema: 'tidal-paired-age-experiment-v1', seed, durationDays, interventionDay, intervention: { ...intervention }, preInterventionEqual,
    baseline: baseline.exportData(), perturbed: perturbed.exportData() };
}
