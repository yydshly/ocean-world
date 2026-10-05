// Paired observational experiments. No renderer, model or UI source is edited.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DeepSimulation, DEFAULT_ENVIRONMENT, DEEP_MODEL_PARAMETERS, WORLD_BOUNDS } from '../src/deepSimulation.js';
import { deepSpeciesCatalog, deepModelScope } from '../src/deepSpecies.js';
import { deepFloorHeight } from '../src/deepHabitat.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = resolve(projectRoot, 'output/validation/deep-experiments.json');
const durationSec = 600;
const seeds = [1, 42, 2026];
const cases = [
  { id: 'baseline', patch: {} }, { id: 'enhanced-current', patch: { currentMps: 0.4 } },
  { id: 'high-turbidity', patch: { turbidity: 1 } }, { id: 'stopped-supply', patch: { foodSupply: 0 } },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const sourceFiles = ['src/deepSimulation.js', 'src/deepHabitat.js', 'src/deepSpecies.js', 'src/biomes.js', 'tests/deep-simulation.test.mjs', 'scripts/run-deep-experiments.mjs'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [path, hash(await readFile(resolve(projectRoot, path)))])));
const state = (sim) => ({ agents: sim.agents, environment: sim.environment, events: sim.events,
  ledger: sim.ledger, energyLedger: sim.energyLedger, surfacePatches: sim.surfacePatches,
  benthicPatches: sim.benthicPatches, suspendedPatches: sim.suspendedPatches, counters: sim.counters,
  rngState: sim._rngState, timeSec: sim.timeSec, accumulator: sim._accumulator, ticks: sim._ticks,
  nextRelease: sim._nextRelease, nextParcelId: sim._nextParcelId, nextSummary: sim._nextSummary });
const ecologyState = (sim) => ({ agents: sim.agents, ledger: sim.ledger, energyLedger: sim.energyLedger,
  surface: sim.surfacePatches, benthic: sim.benthicPatches, suspended: sim.suspendedPatches, counters: sim.counters });

function observe(sim) {
  const initialAgents = clone(sim.agents);
  const evidence = Object.fromEntries(initialAgents.map((agent) => [agent.id, {
    speciesId: agent.speciesId, taxonomicLevel: agent.taxonomicLevel,
    initialPosition: agent.position, initialEnergy: agent.energy, sizeM: agent.sizeM,
    pathM: 0, maximumSpeedMps: 0, feedingCount: 0, actualIntake: 0,
    feedingGain: 0, firstFeedAt: null, lastFeedAt: null, maximumFeedDistanceM: 0,
  }]));
  const feedingTrace = [];
  const samples = [{ timeSec: 0, metrics: clone(sim.metrics), ledger: clone(sim.ledger), energyLedger: clone(sim.energyLedger) }];
  const checks = { sampledTicks: 0, maximumResourceBudgetError: 0, maximumPoolBudgetError: 0,
    maximumEnergyBudgetError: 0, maximumGroundAttachmentErrorM: 0, maximumFootContactErrorM: 0,
    maximumAnemoneDisplacementM: 0, feedingLocalityViolations: 0, feedingRemovalViolations: 0,
    feedingGainViolations: 0, nonfiniteValues: 0, outOfBoundsAgents: 0, maximumSuspendedParcelCount: 0 };
  let nextSample = 60;
  const originalFeed = sim._feed;
  sim._feed = function (agent, patch, pool, requested, interval, gain) {
    const beforeFood = patch[pool], beforeEnergy = agent.energy;
    const feedPosition = this.feedingPosition(agent, pool), foodPosition = { ...patch.position };
    const feedDistanceM = Math.hypot(feedPosition.x - foodPosition.x, feedPosition.y - foodPosition.y, feedPosition.z - foodPosition.z);
    const allowedDistanceM = this.feedingReachM(agent, pool);
    const actualIntake = originalFeed.call(this, agent, patch, pool, requested, interval, gain);
    if (actualIntake > 0) {
      const actualRemoval = beforeFood - patch[pool], actualGain = agent.energy - beforeEnergy;
      if (feedDistanceM > allowedDistanceM + 1e-10) checks.feedingLocalityViolations += 1;
      if (Math.abs(actualRemoval - actualIntake) > 1e-12) checks.feedingRemovalViolations += 1;
      if (Math.abs(actualGain - actualIntake * gain) > 1e-12) checks.feedingGainViolations += 1;
      const entry = evidence[agent.id];
      entry.feedingCount += 1; entry.actualIntake += actualIntake; entry.feedingGain += actualGain;
      entry.firstFeedAt ??= this.timeSec; entry.lastFeedAt = this.timeSec;
      entry.maximumFeedDistanceM = Math.max(entry.maximumFeedDistanceM, feedDistanceM);
      feedingTrace.push({ timeSec: this.timeSec, agentId: agent.id, speciesId: agent.speciesId, pool,
        patchId: patch.id, requestedAmount: requested, actualIntake, actualRemoval, actualGain,
        feedDistanceM, allowedDistanceM, feedPosition, foodPosition });
    }
    return actualIntake;
  };
  const originalAdvance = sim._advance;
  sim._advance = function (dt) {
    const previous = this.agents.map((agent) => ({ ...agent.position }));
    originalAdvance.call(this, dt);
    checks.sampledTicks += 1;
    const metrics = this.metrics;
    checks.maximumResourceBudgetError = Math.max(checks.maximumResourceBudgetError, Math.abs(metrics.resourceBudgetError));
    checks.maximumEnergyBudgetError = Math.max(checks.maximumEnergyBudgetError, Math.abs(metrics.energyBudgetError));
    checks.maximumSuspendedParcelCount = Math.max(checks.maximumSuspendedParcelCount, this.suspendedPatches.length);
    for (const [pool, stock] of Object.entries(this.resources)) {
      const ledger = this.ledger.byPool[pool];
      const expected = ledger.initial + ledger.input + ledger.transferredIn - ledger.transferredOut - ledger.ingested - ledger.exported;
      checks.maximumPoolBudgetError = Math.max(checks.maximumPoolBudgetError, Math.abs(stock - expected));
      if (!Number.isFinite(stock) || stock < 0) checks.nonfiniteValues += 1;
    }
    this.agents.forEach((agent, index) => {
      const path = Math.hypot(agent.position.x - previous[index].x, agent.position.y - previous[index].y, agent.position.z - previous[index].z);
      evidence[agent.id].pathM += path;
      evidence[agent.id].maximumSpeedMps = Math.max(evidence[agent.id].maximumSpeedMps, path / dt);
      for (const value of [agent.energy, agent.sizeM, agent.heading, ...Object.values(agent.position), ...Object.values(agent.velocity)]) {
        if (!Number.isFinite(value)) checks.nonfiniteValues += 1;
      }
      if (Object.entries(agent.position).some(([axis, value]) => value < WORLD_BOUNDS[axis][0] || value > WORLD_BOUNDS[axis][1])) checks.outOfBoundsAgents += 1;
      if (agent.speciesId === 'sea-pig-group') {
        checks.maximumGroundAttachmentErrorM = Math.max(checks.maximumGroundAttachmentErrorM, Math.abs(agent.position.y - deepFloorHeight(agent.position.x, agent.position.z)));
        const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
        for (const point of agent.contactPointsLocal) {
          const x = agent.position.x + agent.sizeM * (point.x * c - point.z * s);
          const z = agent.position.z + agent.sizeM * (point.x * s + point.z * c);
          checks.maximumFootContactErrorM = Math.max(checks.maximumFootContactErrorM, Math.abs(agent.position.y + agent.sizeM * point.y - deepFloorHeight(x, z)));
        }
      } else if (agent.speciesId === 'pom-pom-anemone') {
        const start = evidence[agent.id].initialPosition;
        checks.maximumAnemoneDisplacementM = Math.max(checks.maximumAnemoneDisplacementM, Math.hypot(agent.position.x - start.x, agent.position.y - start.y, agent.position.z - start.z));
      }
    });
    if (this.timeSec + 1e-8 >= nextSample) {
      nextSample += 60;
      samples.push({ timeSec: this.timeSec, metrics: clone(metrics), ledger: clone(this.ledger), energyLedger: clone(this.energyLedger) });
    }
  };
  return { evidence, feedingTrace, samples, checks };
}

const beforeHashes = await sourceHashes();
const tests = spawnSync(process.execPath, ['--test', 'tests/deep-simulation.test.mjs'], { cwd: projectRoot, encoding: 'utf8' });
if (tests.status !== 0) {
  process.stderr.write(tests.stdout + tests.stderr);
  throw new Error('Deep numerical tests did not pass; no successful experiment report was written.');
}
const runs = [];
for (const seed of seeds) {
  const initialHash = hash({ agents: new DeepSimulation(seed).agents, resources: new DeepSimulation(seed).resources });
  for (const experiment of cases) {
    const sim = new DeepSimulation(seed);
    const pairedInitialStateHash = hash({ agents: sim.agents, resources: sim.resources });
    sim.setEnvironment(experiment.patch);
    const observation = observe(sim);
    sim.step(durationSec);
    const control = new DeepSimulation(seed); control.setEnvironment(experiment.patch); control.step(durationSec);
    const perSpecies = deepSpeciesCatalog.map((species) => {
      const individuals = sim.agents.filter((agent) => agent.speciesId === species.id);
      const stats = individuals.map((agent) => observation.evidence[agent.id]);
      return { speciesId: species.id, taxonomicLevel: species.taxonomicLevel, population: individuals.length,
        averageEnergy: individuals.reduce((sum, agent) => sum + agent.energy, 0) / individuals.length,
        actualIntake: stats.reduce((sum, entry) => sum + entry.actualIntake, 0),
        feedingCount: stats.reduce((sum, entry) => sum + entry.feedingCount, 0),
        pathM: stats.reduce((sum, entry) => sum + entry.pathM, 0) };
    });
    for (const agent of sim.agents) Object.assign(observation.evidence[agent.id], { finalPosition: clone(agent.position), finalEnergy: agent.energy, finalState: agent.state });
    const run = { seed, case: experiment.id, durationSec, patch: experiment.patch, initialStateHash: pairedInitialStateHash,
      pairedInitialStateMatches: initialHash === pairedInitialStateHash,
      observationDidNotChangeState: hash(state(sim)) === hash(state(control)),
      finalEcologyStateHash: hash(ecologyState(sim)), environment: clone(sim.environment),
      metrics: clone(sim.metrics), ledger: clone(sim.ledger), energyLedger: clone(sim.energyLedger),
      perSpecies, ...observation };
    runs.push(run);
    process.stdout.write(`${seed} ${experiment.id}: intake=${sim.ledger.ingested.toFixed(6)}, captures=${sim.counters.captureCount}, error=${sim.metrics.resourceBudgetError.toExponential(2)}\n`);
  }
}
const comparisons = [];
for (const seed of seeds) {
  const baseline = runs.find((run) => run.seed === seed && run.case === 'baseline');
  for (const run of runs.filter((item) => item.seed === seed && item.case !== 'baseline')) comparisons.push({
    seed, case: run.case, ecologyStateIdenticalToBaseline: run.finalEcologyStateHash === baseline.finalEcologyStateHash,
    intakeDelta: run.ledger.ingested - baseline.ledger.ingested,
    inputDelta: run.ledger.input - baseline.ledger.input, exportDelta: run.ledger.exported - baseline.ledger.exported,
    averageEnergyDelta: run.metrics.averageEnergy - baseline.metrics.averageEnergy,
    visibilityDeltaM: run.metrics.visibilityM - baseline.metrics.visibilityM,
    perPoolIntakeDelta: Object.fromEntries(Object.keys(run.ledger.byPool).map((pool) => [pool, run.ledger.byPool[pool].ingested - baseline.ledger.byPool[pool].ingested])),
  });
}
const afterHashes = await sourceHashes();
const report = { generatedAtUtc: new Date().toISOString(), scope: deepModelScope, seeds, durationSec, fixedStepSec: DEEP_MODEL_PARAMETERS.fixedStepSec,
  cases, defaultEnvironment: DEFAULT_ENVIRONMENT, modelParameters: DEEP_MODEL_PARAMETERS,
  limitations: ['3500m and abundance are authored; no shared-site occurrence or density calibration.',
    'Resource quantities are common relative organic-proxy units, not grams, calories or measured fluxes.',
    'Condition costs, speeds, sensing distances, capture intervals and breakdown rates are uncalibrated.',
    'Current is one-dimensional and suspended prey is a functional parcel, not a resolved plankton community.',
    'Turbidity affects observer visibility only in this explicitly nonvisual first model.',
    'No population forecast, local photosynthesis or automatic animal bioluminescence.'],
  sources: deepSpeciesCatalog.map(({ id, scientificName, taxonomicLevel, sourceLinks }) => ({ id, scientificName, taxonomicLevel, sourceLinks })),
  sourceHashesBefore: beforeHashes, sourceHashesAfter: afterHashes,
  sourceFilesUnchangedDuringRun: JSON.stringify(beforeHashes) === JSON.stringify(afterHashes),
  tests: { command: 'node --test tests/deep-simulation.test.mjs', exitCode: tests.status, output: tests.stdout + tests.stderr },
  allInitialStatesPaired: runs.every((run) => run.pairedInitialStateMatches),
  observationDidNotChangeAnyState: runs.every((run) => run.observationDidNotChangeState),
  comparisons, runs };
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(`Saved ${outputFile}\n`);
