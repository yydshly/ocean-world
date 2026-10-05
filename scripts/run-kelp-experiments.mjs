// Reproducible observational experiments; no renderer or model source is edited.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KelpSimulation, KELP_MODEL_PARAMETERS, DEFAULT_ENVIRONMENT, WORLD_BOUNDS } from '../src/kelpSimulation.js';
import { biomeById } from '../src/biomes.js';
import { habitatHeight, leafAttachmentPosition, kelpLeafLength } from '../src/kelpHabitat.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validationDirectory = resolve(projectRoot, 'output', 'validation');
const outputName = process.argv[2];
if (process.argv.length > 3 || (outputName && !/^[a-z0-9][a-z0-9-]*$/i.test(outputName))) throw new Error('Usage: node scripts/run-kelp-experiments.mjs [report-subdirectory-name]');
const outputDirectory = outputName ? resolve(validationDirectory, outputName) : validationDirectory;
if (outputName && !outputDirectory.startsWith(`${validationDirectory}${sep}`)) throw new Error('Report directory must stay inside output/validation.');
const outputFile = resolve(outputDirectory, 'kelp-experiments.json');
const reportFile = relative(projectRoot, outputFile).split(sep).join('/');
const command = `node scripts/run-kelp-experiments.mjs${outputName ? ` ${outputName}` : ''}`;
const seeds = [1, 42, 2026];
const durationSec = 600;
const sampleEverySec = 60;
const cases = [
  { id: 'baseline', patch: {} },
  { id: 'enhanced-current', patch: { currentMps: 0.9 } },
  { id: 'high-turbidity', patch: { turbidity: 1 } },
  { id: 'stopped-supply', patch: { foodSupply: 0 } },
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const totalEnergy = (sim) => sim.agents.reduce((sum, agent) => sum + agent.energy, 0);
const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const stateSnapshot = (sim) => ({ agents: sim.agents, environment: sim.environment, metrics: sim.metrics, events: sim.events, groundPatches: sim.groundPatches, leafPatches: sim.leafPatches, preyPatches: sim.preyPatches, kelpPatches: sim.kelpPatches, ledger: sim.ledger });
const sourceFiles = ['src/kelpSimulation.js', 'src/kelpHabitat.js', 'src/biomes.js', 'src/species.js', 'tests/kelp-simulation.test.mjs', 'scripts/run-kelp-experiments.mjs'];
async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [path, hash(await readFile(resolve(projectRoot, path)))])));
}

function observe(sim) {
  const initialAgents = clone(sim.agents);
  const agentEvidence = Object.fromEntries(initialAgents.map((agent) => [agent.id, {
    speciesId: agent.speciesId, initialEnergy: agent.energy, initialPosition: agent.position,
    initialSizeM: agent.sizeM, worldPathM: 0, activeLeafCrawlM: 0, maximumWorldSpeedMps: 0,
    feedingCount: 0, ingestedRelativeUnits: 0, observedFeedingGain: 0,
    firstFeed: null, lastFeed: null, maximumPositiveFeedDistanceM: 0,
  }]));
  const flows = { inputByPool: {}, ingestedByPool: {}, exportedByPool: {}, transferredByRoute: {} };
  const energy = { initial: totalEnergy(sim), observedFeedingGain: 0, plantRawNetChange: 0, animalMaintenanceAndMotionDebit: 0, rawUpdateNetChange: 0, clampCorrection: 0 };
  const checks = { sampledTicks: 0, maximumLeafAttachmentErrorM: 0, maximumGroundAttachmentErrorM: 0, maximumHoldfastDisplacementM: 0, maximumResourceBudgetError: 0, feedingLocalityViolationCount: 0, nonfiniteValueCount: 0, outOfBoundsPositionCount: 0 };
  const firstTickSnailMotion = [];
  const add = (table, key, value) => { table[key] = (table[key] || 0) + value; };

  const input = sim._input;
  sim._input = function (patch, pool, amount) {
    const before = patch[pool];
    const result = input.call(this, patch, pool, amount);
    add(flows.inputByPool, pool, patch[pool] - before);
    return result;
  };
  const remove = sim._remove;
  sim._remove = function (patch, pool, amount, kind = 'exported') {
    const result = remove.call(this, patch, pool, amount, kind);
    add(kind === 'ingested' ? flows.ingestedByPool : flows.exportedByPool, pool, result);
    return result;
  };
  const transfer = sim._transfer;
  sim._transfer = function (from, fromPool, to, toPool, amount) {
    const before = from[fromPool];
    const result = transfer.call(this, from, fromPool, to, toPool, amount);
    add(flows.transferredByRoute, `${fromPool}->${toPool}`, before - from[fromPool]);
    return result;
  };
  const feed = sim._feed;
  sim._feed = function (agent, patch, pool, amount, intervalSec, gain) {
    const beforeEnergy = agent.energy;
    const result = feed.call(this, agent, patch, pool, amount, intervalSec, gain);
    if (result > 0) {
      let foodPosition;
      let allowedDistanceM;
      let matchingSupport;
      let alongDifference = null;
      let allowedAlongDifference = null;
      if (pool === 'smallPrey') {
        foodPosition = this._preyPosition(patch);
        allowedDistanceM = 0.20;
        matchingSupport = true;
      } else if (pool === 'biofilm') {
        foodPosition = leafAttachmentPosition(this.getKelpAnchor(patch.hostId), { leafIndex: patch.leafIndex, along: 0.55, clearanceM: 0.003 }, this.timeSec, this.environment);
        allowedDistanceM = null;
        alongDifference = Math.abs(agent.attachment.along - 0.55);
        allowedAlongDifference = 0.13;
        matchingSupport = agent.attachment.hostId === patch.hostId && agent.attachment.leafIndex === patch.leafIndex;
      } else {
        foodPosition = patch.position;
        allowedDistanceM = 0.24;
        matchingSupport = agent.rockIndex === patch.rockIndex;
      }
      const foodDistanceM = distance(agent.position, foodPosition);
      const withinLocality = matchingSupport && (allowedAlongDifference === null ? foodDistanceM < allowedDistanceM + 1e-8 : alongDifference < allowedAlongDifference + 1e-8);
      if (!withinLocality) checks.feedingLocalityViolationCount += 1;
      const evidence = agentEvidence[agent.id];
      const gained = agent.energy - beforeEnergy;
      evidence.feedingCount += 1;
      evidence.ingestedRelativeUnits += result;
      evidence.observedFeedingGain += gained;
      evidence.maximumPositiveFeedDistanceM = Math.max(evidence.maximumPositiveFeedDistanceM, foodDistanceM);
      const event = { timeSec: this.timeSec, patchId: patch.id, pool, resourceRemoved: result, conditionGain: gained, foodDistanceM, allowedDistanceM, alongDifference, allowedAlongDifference, matchingSupport, withinLocality, agentPosition: { ...agent.position }, foodPosition: { ...foodPosition } };
      evidence.firstFeed ??= event;
      evidence.lastFeed = event;
      energy.observedFeedingGain += gained;
    }
    return result;
  };
  for (const method of ['_updateKelp', '_updateGround', '_updateSnail', '_updateFish']) {
    const original = sim[method];
    sim[method] = function (agent, dt) {
      const beforeEnergy = agent.energy;
      const beforeGain = agentEvidence[agent.id].observedFeedingGain;
      const result = original.call(this, agent, dt);
      const delta = agent.energy - beforeEnergy;
      const feedGain = agentEvidence[agent.id].observedFeedingGain - beforeGain;
      energy.rawUpdateNetChange += delta;
      if (agent.speciesId === 'giant-kelp') energy.plantRawNetChange += delta;
      else energy.animalMaintenanceAndMotionDebit += feedGain - delta;
      return result;
    };
  }
  const advance = sim._advance;
  sim._advance = function (dt) {
    const beforeEnergy = totalEnergy(this);
    const beforeRaw = energy.rawUpdateNetChange;
    const result = advance.call(this, dt);
    energy.clampCorrection += totalEnergy(this) - beforeEnergy - (energy.rawUpdateNetChange - beforeRaw);
    return result;
  };

  let previous = new Map(sim.agents.map((agent) => [agent.id, { position: { ...agent.position }, along: agent.attachment?.along }]));
  function sampleTick(metrics) {
    checks.sampledTicks += 1;
    checks.maximumResourceBudgetError = Math.max(checks.maximumResourceBudgetError, Math.abs(metrics.resourceBudgetError));
    for (const agent of sim.agents) {
      const evidence = agentEvidence[agent.id];
      const prior = previous.get(agent.id);
      const speed = Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z);
      evidence.maximumWorldSpeedMps = Math.max(evidence.maximumWorldSpeedMps, speed);
      evidence.worldPathM += distance(agent.position, prior.position);
      if (agent.speciesId === 'brown-turban-snail') {
        const expected = leafAttachmentPosition(sim.getKelpAnchor(agent.attachment.hostId), agent.attachment, sim.timeSec, sim.environment);
        checks.maximumLeafAttachmentErrorM = Math.max(checks.maximumLeafAttachmentErrorM, distance(agent.position, expected));
        evidence.activeLeafCrawlM += Math.abs(agent.attachment.along - prior.along) * kelpLeafLength(agent.attachment.leafIndex);
        if (checks.sampledTicks === 1) firstTickSnailMotion.push({ id: agent.id, displacementM: distance(agent.position, prior.position), speedMps: speed });
      } else if (agent.speciesId === 'giant-kelp') {
        checks.maximumHoldfastDisplacementM = Math.max(checks.maximumHoldfastDisplacementM, distance(agent.position, evidence.initialPosition));
      } else if (agent.speciesId !== 'giant-kelpfish') {
        checks.maximumGroundAttachmentErrorM = Math.max(checks.maximumGroundAttachmentErrorM, Math.abs(agent.position.y - habitatHeight(agent.position.x, agent.position.z) - 0.003));
      }
      for (const axis of ['x', 'y', 'z']) {
        if (!Number.isFinite(agent.position[axis]) || !Number.isFinite(agent.velocity[axis])) checks.nonfiniteValueCount += 1;
        if (agent.position[axis] < WORLD_BOUNDS[axis][0] || agent.position[axis] > WORLD_BOUNDS[axis][1]) checks.outOfBoundsPositionCount += 1;
      }
      if (!Number.isFinite(agent.energy) || !Number.isFinite(agent.sizeM)) checks.nonfiniteValueCount += 1;
      previous.set(agent.id, { position: { ...agent.position }, along: agent.attachment?.along });
    }
    for (const value of Object.values(metrics)) if (typeof value === 'number' && !Number.isFinite(value)) checks.nonfiniteValueCount += 1;
  }
  function finish() {
    energy.final = totalEnergy(sim);
    energy.reconstructedFinal = energy.initial + energy.observedFeedingGain + energy.plantRawNetChange - energy.animalMaintenanceAndMotionDebit + energy.clampCorrection;
    energy.residual = energy.final - energy.reconstructedFinal;
    energy.unit = 'relative-condition-index; not joules and not an ecological energy conservation claim';
    const days = sim.timeSec / KELP_MODEL_PARAMETERS.secondsPerGrowthDay;
    const perAgent = sim.agents.map((agent) => ({
      id: agent.id, ...agentEvidence[agent.id], finalEnergy: agent.energy, energyChange: agent.energy - agentEvidence[agent.id].initialEnergy,
      finalSizeM: agent.sizeM, extensionM: agent.sizeM - agentEvidence[agent.id].initialSizeM,
      observedEquivalentExtensionMPerDay: agent.speciesId === 'giant-kelp' ? (agent.sizeM - agentEvidence[agent.id].initialSizeM) / days : null,
      finalState: agent.state, finalPosition: { ...agent.position }, attachment: agent.attachment ? { ...agent.attachment } : null, lastFeedAt: agent.lastFeedAt,
    }));
    return { checks, resourceFlows: flows, conditionLedger: energy, perAgent, firstTickSnailMotion };
  }
  return { sampleTick, finish };
}

function checkpoint(sim) {
  const fish = sim.agents.filter((agent) => agent.speciesId === 'giant-kelpfish');
  return { timeSec: sim.timeSec, metrics: clone(sim.metrics), meanFishEnergy: mean(fish.map((agent) => agent.energy)), ledger: { ...sim.ledger } };
}

const hashesBefore = await sourceHashes();
let historicalPasses = [];
try {
  const previous = JSON.parse(await readFile(outputFile, 'utf8'));
  historicalPasses = previous.historicalPasses ?? [];
  if (previous.modelSourcesBefore?.['src/kelpSimulation.js'] !== hashesBefore['src/kelpSimulation.js'] || previous.modelSourcesBefore?.['src/kelpHabitat.js'] !== hashesBefore['src/kelpHabitat.js']) {
    const { historicalPasses: older, ...snapshot } = previous;
    historicalPasses.push(snapshot);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const runs = [];
console.log('seed case prey-final fish-condition resource-ingested attachment-error');
for (const seed of seeds) {
  for (const experiment of cases) {
    const sim = new KelpSimulation(seed);
    const initialStateHash = hash(stateSnapshot(sim));
    const measurement = observe(sim);
    sim.setEnvironment(experiment.patch);
    const environmentAtStart = { ...sim.environment };
    const checkpoints = [checkpoint(sim)];
    for (let tick = 1; tick <= durationSec / KELP_MODEL_PARAMETERS.fixedStepSec; tick += 1) {
      const metrics = sim.step(KELP_MODEL_PARAMETERS.fixedStepSec);
      measurement.sampleTick(metrics);
      if (tick % (sampleEverySec / KELP_MODEL_PARAMETERS.fixedStepSec) === 0) checkpoints.push(checkpoint(sim));
    }
    const evidence = measurement.finish();
    const measuredStateHash = hash(stateSnapshot(sim));
    const control = new KelpSimulation(seed);
    control.setEnvironment(experiment.patch);
    control.step(durationSec);
    const controlStateHash = hash(stateSnapshot(control));
    const final = checkpoint(sim);
    const plants = evidence.perAgent.filter((agent) => agent.speciesId === 'giant-kelp');
    const run = {
      seed, case: experiment.id, initialStateHash, environmentAtStart, finalEnvironment: { ...sim.environment }, durationSec,
      observationMatchesUninstrumentedControl: measuredStateHash === controlStateHash, measuredStateHash, controlStateHash,
      final, checkpoints, ...evidence, resourceLedger: { ...sim.ledger },
      growth: { simulatedDays: durationSec / 86400, configuredMPerDayBeforeLightAndCondition: KELP_MODEL_PARAMETERS.kelpExtensionMPerDay, meanExtensionM: mean(plants.map((plant) => plant.extensionM)), meanObservedEquivalentMPerDay: mean(plants.map((plant) => plant.observedEquivalentExtensionMPerDay)), note: 'Short-window observed extension divided by elapsed simulated days; not a 24-hour forecast or measured growth rate.' },
      finalLocalResources: { ground: clone(sim.groundPatches), leaf: clone(sim.leafPatches), prey: clone(sim.preyPatches), kelp: clone(sim.kelpPatches) },
      causalEvents: clone(sim.events),
    };
    runs.push(run);
    console.log(`${seed} ${experiment.id} ${final.metrics.smallPrey.toFixed(6)} ${final.meanFishEnergy.toFixed(6)} ${sim.ledger.ingested.toFixed(6)} ${evidence.checks.maximumLeafAttachmentErrorM.toExponential(2)}`);
  }
}

const comparisons = seeds.flatMap((seed) => {
  const baseline = runs.find((run) => run.seed === seed && run.case === 'baseline');
  return runs.filter((run) => run.seed === seed && run.case !== 'baseline').map((run) => ({
    seed, case: run.case, sameInitialState: run.initialStateHash === baseline.initialStateHash,
    signedDeltaFromBaseline: {
      visibilityM: run.final.metrics.visibilityM - baseline.final.metrics.visibilityM,
      lightLevel: run.final.metrics.lightLevel - baseline.final.metrics.lightLevel,
      totalPrimaryProduction: run.final.metrics.totalPrimaryProduction - baseline.final.metrics.totalPrimaryProduction,
      smallPrey: run.final.metrics.smallPrey - baseline.final.metrics.smallPrey,
      meanFishEnergy: run.final.meanFishEnergy - baseline.final.meanFishEnergy,
      averageAnimalEnergy: run.final.metrics.averageEnergy - baseline.final.metrics.averageEnergy,
      totalResourceIngested: run.resourceLedger.ingested - baseline.resourceLedger.ingested,
      exported: run.resourceLedger.exported - baseline.resourceLedger.exported,
      meanObservedEquivalentExtensionMPerDay: run.growth.meanObservedEquivalentMPerDay - baseline.growth.meanObservedEquivalentMPerDay,
      feedingCount: run.final.metrics.feedingCount - baseline.final.metrics.feedingCount,
    },
  }));
});
const chitonDayNight = [];
for (const [label, hour] of [['day', 12], ['night', 0]]) {
  const sim = new KelpSimulation(42);
  const measurement = observe(sim);
  sim.setEnvironment({ hour, foodSupply: 0 });
  for (let tick = 0; tick < 420 / KELP_MODEL_PARAMETERS.fixedStepSec; tick += 1) measurement.sampleTick(sim.step(KELP_MODEL_PARAMETERS.fixedStepSec));
  const evidence = measurement.finish();
  const chitons = evidence.perAgent.filter((agent) => agent.speciesId === 'gumboot-chiton');
  const control = new KelpSimulation(42);
  control.setEnvironment({ hour, foodSupply: 0 });
  control.step(420);
  chitonDayNight.push({ label, hourAtStart: hour, durationSec: 420, seed: 42, positiveFeedingCount: chitons.reduce((total, agent) => total + agent.feedingCount, 0), ingestedRelativeUnits: chitons.reduce((total, agent) => total + agent.ingestedRelativeUnits, 0), activityLevelAtEnd: sim.chitonActivityLevel ?? null, observationMatchesUninstrumentedControl: hash(stateSnapshot(sim)) === hash(stateSnapshot(control)), perAgent: chitons, final: checkpoint(sim) });
}
const testResult = spawnSync(process.execPath, ['--test', 'tests/kelp-simulation.test.mjs'], { cwd: projectRoot, encoding: 'utf8', timeout: 120000 });
const tap = `${testResult.stdout ?? ''}${testResult.stderr ?? ''}`;
const hashesAfter = await sourceHashes();
const summary = {
  runCount: runs.length,
  pairedInitialStatesMatch: comparisons.every((comparison) => comparison.sameInitialState),
  observationalWrappersPreservedAllFinalStates: runs.every((run) => run.observationMatchesUninstrumentedControl),
  sourceFilesUnchangedDuringRun: JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter),
  maximumLeafAttachmentErrorM: Math.max(...runs.map((run) => run.checks.maximumLeafAttachmentErrorM)),
  maximumGroundAttachmentErrorM: Math.max(...runs.map((run) => run.checks.maximumGroundAttachmentErrorM)),
  maximumHoldfastDisplacementM: Math.max(...runs.map((run) => run.checks.maximumHoldfastDisplacementM)),
  maximumResourceBudgetError: Math.max(...runs.map((run) => run.checks.maximumResourceBudgetError)),
  maximumConditionLedgerResidual: Math.max(...runs.map((run) => Math.abs(run.conditionLedger.residual))),
  feedingLocalityViolationCount: runs.reduce((sum, run) => sum + run.checks.feedingLocalityViolationCount, 0),
  nonfiniteValueCount: runs.reduce((sum, run) => sum + run.checks.nonfiniteValueCount, 0),
  outOfBoundsPositionCount: runs.reduce((sum, run) => sum + run.checks.outOfBoundsPositionCount, 0),
};
const output = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), command, reportFile,
  modelSourcesBefore: hashesBefore, modelSourcesAfter: hashesAfter, modelParameters: KELP_MODEL_PARAMETERS,
  defaultEnvironment: DEFAULT_ENVIRONMENT, seeds, cases, durationSec, checkpointIntervalSec: sampleEverySec, invariantSampleIntervalSec: KELP_MODEL_PARAMETERS.fixedStepSec,
  method: 'Observational instance wrappers forward original calls unchanged. Each measured final state is compared to an uninstrumented run with the same initial seed, intervention and elapsed seconds. Signed treatment effects are retained; no monotonic treatment assertion is made.',
  meanings: { resources: 'relative food indices, not biomass', conditionLedger: 'numeric bookkeeping of relative condition gains, raw updates and clamp corrections; not thermodynamic energy conservation', extension: 'metres per simulated day, short-window equivalent rate; not a calibrated 24h forecast', snailMotion: 'world path and speed include passive leaf deformation; active along-leaf crawl is separately measured', scope: 'pure model validation; no screenshot or visible-mesh verification' },
  scienceSources: biomeById['kelp-forest'].organisms.map((species) => ({ id: species.id, scientificName: species.scientificName, referenceSizeM: species.referenceSizeM, displaySizeM: species.displaySizeM, sourceLinks: species.sourceLinks })),
  summary, runs, comparisons, historicalPasses, focusedMechanisms: { chitonDayNight },
  tests: { command: 'node --test tests/kelp-simulation.test.mjs', exitCode: testResult.status, passed: Number(tap.match(/^# pass (\d+)$/m)?.[1] ?? 0), failed: Number(tap.match(/^# fail (\d+)$/m)?.[1] ?? 0), error: testResult.error?.message ?? null, tap },
};
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ file: reportFile, summary, tests: { passed: output.tests.passed, failed: output.tests.failed, exitCode: output.tests.exitCode } }, null, 2));
if (!summary.pairedInitialStatesMatch || !summary.observationalWrappersPreservedAllFinalStates || !summary.sourceFilesUnchangedDuringRun || summary.nonfiniteValueCount || summary.outOfBoundsPositionCount || summary.feedingLocalityViolationCount || summary.maximumResourceBudgetError > 1e-8 || summary.maximumConditionLedgerResidual > 1e-8 || testResult.status !== 0) process.exitCode = 1;
