import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { ReefSimulation, WORLD_BOUNDS } from '../src/simulation.js';
import { speciesById } from '../src/species.js';
import { habitatHeight, floorHeight } from '../src/habitat.js';

const validationDirectory = fileURLToPath(new URL('../output/validation/', import.meta.url));
const outputName = process.argv[2];
if (process.argv.length > 3 || (outputName && !/^[a-z0-9][a-z0-9-]*$/i.test(outputName))) throw new Error('Usage: node scripts/run-experiments.mjs [report-subdirectory-name]');
const outputDirectory = outputName ? resolve(validationDirectory, outputName) : validationDirectory;
if (outputName && !outputDirectory.startsWith(`${resolve(validationDirectory)}${sep}`)) throw new Error('Report directory must stay inside output/validation.');
for (const filename of ['ocean-experiments.json', 'model-soak.json']) {
  const path = resolve(outputDirectory, filename);
  try { await access(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw new Error(`Preserving existing ${path}; pass a fresh report subdirectory.`);
}
const sourceFiles = ['simulation.js', 'habitat.js', 'species.js', 'reefScenery.js'];
const sourceHashes = async () => ({ ...Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
  [file, createHash('sha256').update(await readFile(new URL(`../src/${file}`, import.meta.url))).digest('hex')]))),
  'scripts/run-experiments.mjs': createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex') });
const sourceSha256 = await sourceHashes();
const seeds = [1, 42, 2026];
const scenarios = {
  baseline: {},
  reducedFood: { foodSupply: 0 },
  strongerCurrent: { currentMps: 0.8 },
  increasedTurbidity: { turbidity: 1 },
};
const timeNotice = '所有时长均为模型模拟时间。1200 模拟秒不代表浏览器连续实际运行 20 分钟；本脚本不检验 WebGL、帧率或浏览器内存。';

function conditionCohort(sim, guild = null, kind = null) {
  const members = sim.agents.filter((agent) => (!guild || speciesById[agent.speciesId].guild === guild) && (!kind || speciesById[agent.speciesId].kind === kind));
  const survivors = members.filter((agent) => agent.alive);
  const conditionTotal = survivors.reduce((sum, agent) => sum + agent.energy, 0);
  return {
    initialCount: members.length, survivingCount: survivors.length, deadCount: members.length - survivors.length,
    initialCohortMean: members.length ? conditionTotal / members.length : null,
    survivorOnlyMean: survivors.length ? conditionTotal / survivors.length : null,
  };
}

// Observation wrappers keep the original return values, random draws and
// ecological updates unchanged. They measure actual transfers, not a second
// implementation of input/feeding formulas.
function observeTransfers(sim) {
  const zeros = () => Object.fromEntries(Object.keys(sim.resources).map((pool) => [pool, 0]));
  const telemetry = { inputByPool: zeros(), ingestionByPool: zeros(), ingestionByGuild: {}, grossFeedConditionGainByGuild: {}, feedingEventsByGuild: {} };
  const input = sim._input.bind(sim);
  sim._input = (pool, amount) => {
    const before = sim.ledger.input;
    const result = input(pool, amount);
    telemetry.inputByPool[pool] += sim.ledger.input - before;
    return result;
  };
  const feed = sim._feed.bind(sim);
  sim._feed = (agent, pool, rate, dt, efficiency) => {
    const before = agent.energy;
    const eventsBefore = sim.counters.feedingCount;
    const taken = feed(agent, pool, rate, dt, efficiency);
    const guild = speciesById[agent.speciesId].guild;
    telemetry.ingestionByPool[pool] += taken;
    telemetry.ingestionByGuild[guild] = (telemetry.ingestionByGuild[guild] || 0) + taken;
    telemetry.grossFeedConditionGainByGuild[guild] = (telemetry.grossFeedConditionGainByGuild[guild] || 0) + (agent.energy - before);
    telemetry.feedingEventsByGuild[guild] = (telemetry.feedingEventsByGuild[guild] || 0) + sim.counters.feedingCount - eventsBefore;
    return taken;
  };
  return telemetry;
}

function record(sim, telemetry) {
  const planktivores = conditionCohort(sim, 'planktivore');
  const fish = conditionCohort(sim, null, 'fish');
  return {
    ...sim.metrics,
    // These legacy keys have always used the complete initial cohort.
    planktivoreCondition: planktivores.initialCohortMean,
    fishCondition: fish.initialCohortMean,
    conditionCohorts: { planktivores, fish },
    cumulativeTransfers: JSON.parse(JSON.stringify(telemetry)),
    resourceLedger: { ...sim.ledger },
  };
}

const metricDefinitions = {
  planktonInput: 'Actual cumulative _input transfers into plankton; currently all are external food input. Unit: relative resource amount.',
  ingestionByPool: 'Actual cumulative resource amount returned by _feed, summed by pool. Not a percentage or feeding-event count.',
  ingestionByGuild: 'Actual cumulative _feed intake by all initial guild members, including intake before an individual dies. Unit: relative resource amount.',
  grossFeedConditionGainByGuild: 'Sum of immediate condition increases inside _feed, before later clamping, metabolism, escape cost or death. Proxy condition units, not joules or final net condition.',
  feedingEventsByGuild: 'Resource-backed, nextBite-gated feeding events. A state such as schooling/foraging alone is not an event.',
  initialCohortMean: 'Sum of living members\' condition divided by the entire initial same-guild cohort; each dead member contributes zero. Initial cohort remains fixed.',
  survivorOnlyMean: 'Mean of currently living members only; null if none survive. Subject to survivor selection, so reported separately.',
  outcomeLimits: 'Final condition combines supply, intake, movement, escape, parasites and predation. Its direction is an observation, not a guaranteed single-input mechanism.',
};

function checkState(sim, telemetry) {
  const errors = [];
  for (const agent of sim.agents) {
    if (!Number.isFinite(agent.energy) || agent.energy < 0 || agent.energy > 1) errors.push(`condition: ${agent.id}`);
    if (!Number.isFinite(agent.heading)) errors.push(`heading: ${agent.id}`);
    if (agent.lastFeedAt !== null && (!Number.isFinite(agent.lastFeedAt) || agent.lastFeedAt < 0 || agent.lastFeedAt > sim.timeSec)) errors.push(`feeding timestamp: ${agent.id}`);
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(agent.position[axis]) || !Number.isFinite(agent.velocity[axis])) errors.push(`finite: ${agent.id}.${axis}`);
      if (agent.position[axis] < WORLD_BOUNDS[axis][0] - 1e-8 || agent.position[axis] > WORLD_BOUNDS[axis][1] + 1e-8) errors.push(`bounds: ${agent.id}.${axis}`);
    }
    const kind = speciesById[agent.speciesId].kind;
    if (agent.alive && kind === 'fish' && agent.position.y - agent.sizeM * 0.3 < habitatHeight(agent.position.x, agent.position.z) + 0.099) errors.push(`reef intersection: ${agent.id}`);
    if (kind === 'shrimp' && Math.abs(agent.position.y - floorHeight(agent.position.x, agent.position.z)) > 0.015) errors.push(`crevice attachment: ${agent.id}`);
    if (kind !== 'fish' && kind !== 'shrimp' && agent.position.y < habitatHeight(agent.position.x, agent.position.z) - 1e-8) errors.push(`benthic intersection: ${agent.id}`);
  }
  if (Object.values(sim.resources).some((amount) => !Number.isFinite(amount) || amount < 0)) errors.push('negative/nonfinite resource');
  if (Math.abs(sim.metrics.resourceBudgetError) > 1e-8) errors.push('resource ledger mismatch');
  if (Math.abs(Object.values(telemetry.inputByPool).reduce((sum, amount) => sum + amount, 0) - sim.ledger.input) > 1e-8) errors.push('observed input does not match ledger');
  if (Math.abs(Object.values(telemetry.ingestionByPool).reduce((sum, amount) => sum + amount, 0) - sim.ledger.ingested) > 1e-8) errors.push('observed intake does not match ledger');
  return errors;
}

await mkdir(outputDirectory, { recursive: true });
const experimentStarted = performance.now();
const runs = [];
for (const seed of seeds) {
  for (const [scenario, patch] of Object.entries(scenarios)) {
    const sim = new ReefSimulation(seed);
    const telemetry = observeTransfers(sim);
    sim.setEnvironment(patch);
    const samples = [record(sim, telemetry)];
    const violations = [];
    for (let elapsed = 30; elapsed <= 600; elapsed += 30) {
      sim.step(30);
      samples.push(record(sim, telemetry));
      violations.push(...checkState(sim, telemetry));
    }
    runs.push({ seed, scenario, patch, simulatedDurationSec: sim.timeSec, finalEnvironment: { ...sim.environment }, samples, final: record(sim, telemetry), invariantViolations: [...new Set(violations)] });
    console.log(`seed ${seed}, ${scenario}: ${sim.timeSec} model simulation seconds; ${violations.length} invariant violations`);
  }
}

const comparisons = seeds.map((seed) => {
  const find = (scenario) => runs.find((run) => run.seed === seed && run.scenario === scenario).final;
  const baseline = find('baseline');
  const food = find('reducedFood');
  const current = find('strongerCurrent');
  const turbidity = find('increasedTurbidity');
  return {
    seed,
    reducedFood: {
      lowerPlankton: food.plankton < baseline.plankton,
      lowerPlanktivoreCondition: food.planktivoreCondition < baseline.planktivoreCondition,
      planktonBaseline: baseline.plankton, planktonPerturbed: food.plankton,
      conditionBaseline: baseline.planktivoreCondition, conditionPerturbed: food.planktivoreCondition,
      planktonInputBaseline: baseline.cumulativeTransfers.inputByPool.plankton,
      planktonInputPerturbed: food.cumulativeTransfers.inputByPool.plankton,
      lowerPlanktonInput: food.cumulativeTransfers.inputByPool.plankton < baseline.cumulativeTransfers.inputByPool.plankton,
      planktivoreIngestedBaseline: baseline.cumulativeTransfers.ingestionByGuild.planktivore || 0,
      planktivoreIngestedPerturbed: food.cumulativeTransfers.ingestionByGuild.planktivore || 0,
      lowerCumulativePlanktivoreIngestion: (food.cumulativeTransfers.ingestionByGuild.planktivore || 0) < (baseline.cumulativeTransfers.ingestionByGuild.planktivore || 0),
      grossFeedConditionGainBaseline: baseline.cumulativeTransfers.grossFeedConditionGainByGuild.planktivore || 0,
      grossFeedConditionGainPerturbed: food.cumulativeTransfers.grossFeedConditionGainByGuild.planktivore || 0,
      lowerGrossFeedConditionGain: (food.cumulativeTransfers.grossFeedConditionGainByGuild.planktivore || 0) < (baseline.cumulativeTransfers.grossFeedConditionGainByGuild.planktivore || 0),
      planktivoreCohortBaseline: baseline.conditionCohorts.planktivores,
      planktivoreCohortPerturbed: food.conditionCohorts.planktivores,
      explanation: 'The terminal cohort condition is a coupled outcome. The legacy condition metric already includes all initial planktivores at a fixed denominator, with deaths at zero; it was never survivor-only.',
    },
    strongerCurrent: {
      higherSwimmingCost: current.currentEnergyCost > baseline.currentEnergyCost,
      lowerFishCondition: current.fishCondition < baseline.fishCondition,
      conditionBaseline: baseline.fishCondition, conditionPerturbed: current.fishCondition,
      fishCohortBaseline: baseline.conditionCohorts.fish, fishCohortPerturbed: current.conditionCohorts.fish,
    },
    increasedTurbidity: {
      lowerVisibility: turbidity.visibilityM < baseline.visibilityM,
      lowerPrimaryProduction: turbidity.totalPrimaryProduction < baseline.totalPrimaryProduction,
      lowerCoralCondition: turbidity.coralHealth < baseline.coralHealth,
      productionBaseline: baseline.totalPrimaryProduction, productionPerturbed: turbidity.totalPrimaryProduction,
    },
  };
});

const mechanismChecks = comparisons.flatMap((comparison) => [
  { seed: comparison.seed, scenario: 'reducedFood', check: 'lower actual external plankton input', passed: comparison.reducedFood.lowerPlanktonInput },
  { seed: comparison.seed, scenario: 'reducedFood', check: 'lower final plankton resource in this run', passed: comparison.reducedFood.lowerPlankton },
  { seed: comparison.seed, scenario: 'strongerCurrent', check: 'higher specified active swimming cost', passed: comparison.strongerCurrent.higherSwimmingCost },
  { seed: comparison.seed, scenario: 'increasedTurbidity', check: 'lower specified visual range', passed: comparison.increasedTurbidity.lowerVisibility },
  { seed: comparison.seed, scenario: 'increasedTurbidity', check: 'lower cumulative modeled primary production in this run', passed: comparison.increasedTurbidity.lowerPrimaryProduction },
]);
const legacyDirectionChecks = comparisons.flatMap((comparison) => [
  { seed: comparison.seed, scenario: 'reducedFood', check: 'lower final plankton', passed: comparison.reducedFood.lowerPlankton },
  { seed: comparison.seed, scenario: 'reducedFood', check: 'lower final initial-cohort planktivore condition', passed: comparison.reducedFood.lowerPlanktivoreCondition },
  { seed: comparison.seed, scenario: 'strongerCurrent', check: 'higher swimming cost', passed: comparison.strongerCurrent.higherSwimmingCost },
  { seed: comparison.seed, scenario: 'strongerCurrent', check: 'lower final initial-cohort fish condition', passed: comparison.strongerCurrent.lowerFishCondition },
  { seed: comparison.seed, scenario: 'increasedTurbidity', check: 'lower visibility', passed: comparison.increasedTurbidity.lowerVisibility },
  { seed: comparison.seed, scenario: 'increasedTurbidity', check: 'lower primary production', passed: comparison.increasedTurbidity.lowerPrimaryProduction },
  { seed: comparison.seed, scenario: 'increasedTurbidity', check: 'lower final coral condition', passed: comparison.increasedTurbidity.lowerCoralCondition },
]);
const feedingObservations = comparisons.flatMap((comparison) => [
  { seed: comparison.seed, scenario: 'reducedFood', observation: 'lower cumulative actual planktivore intake in this run', observed: comparison.reducedFood.lowerCumulativePlanktivoreIngestion },
  { seed: comparison.seed, scenario: 'reducedFood', observation: 'lower cumulative gross feed condition gain in this run', observed: comparison.reducedFood.lowerGrossFeedConditionGain },
]);
assert.deepEqual(await sourceHashes(), sourceSha256, 'Experiment sources changed during execution; preserve results only from a stable revision');
const experimentReport = {
  schema: 'tidal-model-experiments-v2', generatedAt: new Date().toISOString(), timeNotice,
  simulatedTimeUnit: 'second', resourceUnit: 'relative reference amount', conditionUnit: '0–1 proxy condition',
  simulatedDurationSecPerRun: 600, seeds, scenarios, sourceSha256, metricDefinitions, runs, comparisons,
  mechanismChecks, feedingObservations, legacyDirectionChecks,
  summary: {
    mechanismChecksPassed: mechanismChecks.filter((check) => check.passed).length,
    mechanismChecksTotal: mechanismChecks.length,
    feedingDirectionsObserved: feedingObservations.filter((entry) => entry.observed).length,
    feedingDirectionsExamined: feedingObservations.length,
    legacyDirectionChecksPassed: legacyDirectionChecks.filter((check) => check.passed).length,
    legacyDirectionChecksTotal: legacyDirectionChecks.length,
    allLegacyDirectionsConfirmed: legacyDirectionChecks.every((check) => check.passed),
    unconfirmedLegacyDirections: legacyDirectionChecks.filter((check) => !check.passed),
    interpretation: 'Mechanism and invariant checks are separate from terminal ecological outcomes. Unconfirmed legacy directions remain visible; the model was not tuned to force agreement.',
  },
  executionWallTimeSec: (performance.now() - experimentStarted) / 1000,
};
await writeFile(`${outputDirectory}/ocean-experiments.json`, `${JSON.stringify(experimentReport, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

const soakStarted = performance.now();
const soak = new ReefSimulation(42);
const soakTelemetry = observeTransfers(soak);
const soakSamples = [record(soak, soakTelemetry)];
const soakViolations = [];
let maxLedgerError = 0;
for (let elapsed = 20; elapsed <= 1200; elapsed += 20) {
  soak.step(20);
  soakSamples.push(record(soak, soakTelemetry));
  soakViolations.push(...checkState(soak, soakTelemetry));
  maxLedgerError = Math.max(maxLedgerError, Math.abs(soak.metrics.resourceBudgetError));
}
const soakReport = {
  schema: 'tidal-model-soak-v1', generatedAt: new Date().toISOString(), timeNotice,
  seed: 42, simulatedDurationSec: soak.timeSec, executionWallTimeSec: (performance.now() - soakStarted) / 1000,
  initialEntityCount: 78, finalLivingEntityCount: soak.metrics.population,
  maxResourceLedgerError: maxLedgerError,
  sourceSha256, metricDefinitions,
  invariantViolations: [...new Set(soakViolations)],
  passed: soakViolations.length === 0,
  samples: soakSamples, final: record(soak, soakTelemetry), events: soak.events,
  scope: ['pure JavaScript model', 'finite values', 'world bounds', 'nonnegative resources', 'resource ledger', 'deterministic seed'],
  excluded: ['browser wall-clock endurance', 'WebGL rendering', 'FPS', 'GPU memory', 'real ecological calibration'],
};
assert.deepEqual(await sourceHashes(), sourceSha256, 'Model soak sources changed during execution');
await writeFile(`${outputDirectory}/model-soak.json`, `${JSON.stringify(soakReport, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(timeNotice);
console.log(JSON.stringify({ outputDirectory, experimentRuns: runs.length, ...experimentReport.summary, modelSoakPassed: soakReport.passed, maxLedgerError }, null, 2));
if (!soakReport.passed || runs.some((run) => run.invariantViolations.length) || mechanismChecks.some((check) => !check.passed)) process.exitCode = 1;
