import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

// Independently inspect actual browser diagnostics. This script does not
// instantiate a second ecology or replace the receipt with synthetic agents.
const input = process.argv[2] ?? fileURLToPath(new URL('../output/validation/deep-continuous-check.json', import.meta.url));
const output = process.argv[3] ?? fileURLToPath(new URL('../output/validation/deep-continuous-independent-check.json', import.meta.url));
const bytes = readFileSync(input), receipt = JSON.parse(bytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const rows = receipt.snapshots ?? [], byLabel = new Map(rows.map(row => [row.label, row.data]));
const failures = [], comparisons = [], optionalEvidence = [], checkpoints = [];
const pools = ['surfaceDetritus', 'benthicAnimalFood', 'suspendedPrey'];
const taxonomy = { 'sea-pig-group': 'genus', 'rattail-family': 'family', 'pom-pom-anemone': 'species' };
const check = (condition, message) => { if (!condition) failures.push(message); };
const finite = value => Number.isFinite(value);
const close = (a, b, tolerance = 1e-8) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;
const sorted = values => [...values].sort((a, b) => a.id.localeCompare(b.id));
const owned = (data, regionId) => ({
  region: data.ocean.ecology.regions.find(region => region.id === regionId),
  agents: sorted(data.ocean.ecology.agents.filter(agent => agent.regionId === regionId)),
});
const activeRecords = data => ({ regions: sorted(data.ocean.ecology.regions), agents: sorted(data.ocean.ecology.agents) });
check(rows.length > 0, 'Receipt has no snapshots.');
check(byLabel.size === rows.length, 'Snapshot labels are not unique.');

function compareOwners(beforeLabel, betweenLabel, afterLabel, regionId, { optional = false } = {}) {
  const before = byLabel.get(beforeLabel), between = byLabel.get(betweenLabel), after = byLabel.get(afterLabel);
  if (optional && (!before || !between || !after)) { optionalEvidence.push(`Awaiting ${afterLabel}`); return; }
  check(before && between && after, `Missing owner-comparison snapshots ${beforeLabel}/${betweenLabel}/${afterLabel}.`);
  if (!before || !between || !after) return;
  const a = owned(before, regionId), b = owned(after, regionId);
  const absentDuringUnload = !between.ocean.ecology.regions.some(region => region.id === regionId)
    && !between.ocean.ecology.agents.some(agent => agent.regionId === regionId);
  const allOwnedAnimalsExact = isDeepStrictEqual(a.agents, b.agents);
  const entireRegionExact = isDeepStrictEqual(a.region, b.region);
  const entireLoadedWindowExact = isDeepStrictEqual(activeRecords(before), activeRecords(after));
  check(a.region && b.region && a.agents.length > 0, `${regionId}: empty or missing comparison owners.`);
  check(before.paused && between.paused && after.paused, `${regionId}: comparison was not paused.`);
  check(absentDuringUnload, `${regionId}: intermediate snapshot did not unload the owner.`);
  check(allOwnedAnimalsExact && entireRegionExact, `${regionId}: owner records changed across unload/revisit.`);
  check(entireLoadedWindowExact, `${regionId}: full matching active window changed across paused revisit.`);
  comparisons.push({ regionId, beforeLabel, betweenLabel, afterLabel, ownedAnimals: a.agents.length,
    absentDuringUnload, allOwnedAnimalsExact, entireRegionExact, entireLoadedWindowExact,
    beforeClockSec: a.region?.timeSec, afterClockSec: b.region?.timeSec,
    beforeRunId: before.runId, afterRunId: after.runId });
}

const pauseBefore = byLabel.get('pause-stable-1'), pauseAfter = byLabel.get('pause-stable-2');
const pauseExact = Boolean(pauseBefore && pauseAfter && pauseBefore.paused && pauseAfter.paused
  && isDeepStrictEqual(pauseBefore.ocean.ecology, pauseAfter.ocean.ecology));
check(pauseExact, 'Pause/layer changes did not preserve the complete regional ecology diagnostics.');
compareOwners('near-returned', 'far-returned', 'near-returned-again', '2,-1');
compareOwners('far-before-unload', 'near-returned', 'far-returned', '4,-1');
compareOwners('far-before-unload', 'home-unloaded', 'far-after-refresh', '4,-1', { optional: true });
let journalExact = null;
if (receipt.journalBeforeRefresh && receipt.journalAfterRefresh) {
  journalExact = isDeepStrictEqual(receipt.journalBeforeRefresh, receipt.journalAfterRefresh);
  check(journalExact, 'Observation journal changed after refresh.');
}
let memoryExact = null;
if (byLabel.has('home-unloaded') && byLabel.has('far-after-refresh')) {
  memoryExact = isDeepStrictEqual(byLabel.get('home-unloaded').explorationMemory,
    byLabel.get('far-after-refresh').explorationMemory);
  check(memoryExact, 'Exported observation-memory object changed after refresh.');
}

const generators = new Map();
function generatorFor(seed) {
  const key = `${typeof seed}:${seed}`;
  if (!generators.has(key)) generators.set(key, createDeepOceanGenerator(seed));
  return generators.get(key);
}
const probes = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.707, .707], [.707, -.707], [-.707, .707], [-.707, -.707]];
const support = { snapshotCount: rows.length, liveRootSamples: 0, seaPigFootSamples: 0, fishProbeSamples: 0,
  anemoneAnchorSamples: 0, cameraCenterSamples: 0, maxSeaPigFootErrorM: 0, maxFishRootErrorM: 0,
  minFishProbeClearanceM: Infinity, minCameraCenterClearanceM: Infinity };
const budgets = { regionSamples: 0, poolSamples: 0, maxPoolError: 0, maxTotalFoodError: 0, maxEnergyError: 0 };
for (const { label, data } of rows) {
  const ecology = data.ocean?.ecology;
  check(ecology && Array.isArray(ecology.agents) && Array.isArray(ecology.regions), `${label}: missing real ecology diagnostics.`);
  if (!ecology) continue;
  const generator = generatorFor(ecology.seed), regions = new Map(ecology.regions.map(region => [region.id, region]));
  check(data.biomeId === 'deep' && data.surfaceY === 3500, `${label}: unexpected biome/depth reference.`);
  check(ecology.regions.length <= 9 && regions.size === ecology.regions.length, `${label}: active-region cap/uniqueness failure.`);
  check(data.ocean.streaming.activeChunks <= 9, `${label}: scenery streaming exceeded nine chunks.`);
  const cache = data.ocean.generatorCache;
  for (const [countKey, limitKey] of [['chunks', 'maxChunks'], ['vertices', 'maxVertices'], ['neighborhoods', 'maxNeighborhoods']]) {
    if (cache?.[countKey] !== undefined || cache?.[limitKey] !== undefined) {
      check(Number.isInteger(cache[countKey]) && cache[countKey] >= 0 && Number.isInteger(cache[limitKey])
        && cache[countKey] <= cache[limitKey], `${label}: ${countKey} cache exceeded its recorded bound.`);
    }
  }
  check(new Set(ecology.agents.map(agent => agent.id)).size === ecology.agents.length, `${label}: duplicate agent identities.`);
  check((data.errors ?? []).length === 0, `${label}: browser recorded errors.`);
  check(ecology.metrics.primaryProduction === 0 && ecology.metrics.totalPrimaryProduction === 0
    && ecology.metrics.naturalLightLevel === 0 && ecology.metrics.lightLevel === 0, `${label}: solar/production leakage.`);
  const [x, y, z] = data.ocean.worldPosition, camera = data.camera?.position, origin = data.ocean.renderOrigin;
  const floor = generator.heightAt(x, z), safeHeight = generator.heightForCamera(x, z), cameraClearance = y - floor;
  support.cameraCenterSamples++; support.minCameraCenterClearanceM = Math.min(support.minCameraCenterClearanceM, cameraClearance);
  check([x, y, z, floor, safeHeight].every(finite) && cameraClearance >= -1e-8, `${label}: unsafe/nonfinite camera center.`);
  check(y <= generator.sample(x, z).floorY + 8 + 1e-8, `${label}: camera outside near-bed eight-metre ceiling.`);
  check(camera && origin && close(camera[0] + origin.x, x) && close(camera[1], y)
    && close(camera[2] + origin.z, z), `${label}: render origin changed logical camera coordinates.`);
  for (const region of ecology.regions) {
    const agents = ecology.agents.filter(agent => agent.regionId === region.id);
    check(agents.length === region.agentCount && agents.length <= 20, `${label}/${region.id}: record cap/count mismatch.`);
    check(agents.filter(agent => agent.alive).length === region.alive, `${label}/${region.id}: live count mismatch.`);
    check(region.primaryProduction === 0 && region.localEnvironment.lightLevel === 0
      && region.localEnvironment.naturalLightLevel === 0, `${label}/${region.id}: regional light/production leakage.`);
    let food = 0;
    for (const pool of pools) {
      const stock = region.resources[pool], ledger = region.ledger.byPool[pool];
      const expected = ledger.initial + ledger.input + ledger.transferredIn - ledger.transferredOut - ledger.ingested - ledger.exported;
      const error = Math.abs(stock - expected); budgets.poolSamples++; budgets.maxPoolError = Math.max(budgets.maxPoolError, error);
      check(finite(stock) && stock >= 0 && close(stock, expected), `${label}/${region.id}/${pool}: food ledger imbalance.`);
      food += stock;
    }
    const expectedFood = region.ledger.initial + region.ledger.input - region.ledger.ingested - region.ledger.exported;
    const energy = agents.reduce((sum, agent) => sum + agent.energy, 0), ledger = region.energyLedger;
    const expectedEnergy = ledger.initial + ledger.feedingGain - ledger.maintenanceAndMotionDebit + ledger.clampCorrection;
    budgets.regionSamples++; budgets.maxTotalFoodError = Math.max(budgets.maxTotalFoodError, Math.abs(food - expectedFood));
    budgets.maxEnergyError = Math.max(budgets.maxEnergyError, Math.abs(energy - expectedEnergy));
    check(close(food, expectedFood) && close(energy, expectedEnergy), `${label}/${region.id}: total food/energy imbalance.`);
  }
  for (const agent of ecology.agents) {
    const region = regions.get(agent.regionId), p = agent.position;
    check(region && Math.floor(p.x / 64) === region.cx && Math.floor(p.z / 64) === region.cz,
      `${label}/${agent.id}: root outside its owner.`);
    check(taxonomy[agent.speciesId] === agent.taxonomicLevel && region && close(agent.timeSec, region.timeSec),
      `${label}/${agent.id}: taxonomy/individual regional clock mismatch.`);
    if (!agent.alive) continue;
    const rootHeight = generator.heightAt(p.x, p.z); support.liveRootSamples++;
    check([p.x, p.y, p.z, agent.heading, agent.sizeM, rootHeight].every(finite), `${label}/${agent.id}: nonfinite pose/support.`);
    if (agent.speciesId === 'sea-pig-group') {
      check(close(p.y, rootHeight) && agent.contactPointsLocal?.length === 12, `${label}/${agent.id}: sea-pig root/feet mismatch.`);
      const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
      for (const foot of agent.contactPointsLocal ?? []) {
        const fx = p.x + agent.sizeM * (foot.x * c - foot.z * s);
        const fz = p.z + agent.sizeM * (foot.x * s + foot.z * c);
        const fy = p.y + agent.sizeM * foot.y, terrain = generator.heightAt(fx, fz), error = Math.abs(fy - terrain);
        support.seaPigFootSamples++; support.maxSeaPigFootErrorM = Math.max(support.maxSeaPigFootErrorM, error);
        check([fx, fy, fz, terrain].every(finite) && close(fy, terrain), `${label}/${agent.id}: foot misses real generator support.`);
      }
    } else if (agent.speciesId === 'rattail-family') {
      const heights = probes.map(([dx, dz]) => generator.heightAt(p.x + dx * agent.sizeM * .5, p.z + dz * agent.sizeM * .5));
      const expected = Math.max(...heights) + .03, error = Math.abs(p.y - expected);
      support.fishProbeSamples += 9; support.maxFishRootErrorM = Math.max(support.maxFishRootErrorM, error);
      support.minFishProbeClearanceM = Math.min(support.minFishProbeClearanceM, ...heights.map(height => p.y - height));
      check(heights.every(finite) && close(p.y, expected), `${label}/${agent.id}: fish nine-probe support mismatch.`);
    } else if (agent.speciesId === 'pom-pom-anemone') {
      support.anemoneAnchorSamples++;
      check(close(p.y, rootHeight) && ['x', 'y', 'z'].every(axis => close(p[axis], agent.anchor?.[axis])),
        `${label}/${agent.id}: attached anchor/support mismatch.`);
    }
  }
  checkpoints.push({ label, runId: data.runId, paused: data.paused, chunkId: data.ocean.chunkId,
    worldPosition: data.ocean.worldPosition, renderOrigin: origin,
    currentRegionClockSec: regions.get(data.ocean.chunkId)?.timeSec ?? null,
    activeRegions: regions.size, allRecords: ecology.agents.length, actualFrameCount: data.actualFrameCount,
    actualFrameSeconds: data.actualFrameSeconds, overallMeanFPS: data.overallMeanFPS,
    reportedRecentFPS: data.fps, simulationSpeed: data.speed,
    drawCalls: data.drawCalls, triangles: data.triangles, viewport: data.viewport,
    activeChunks: data.ocean.streaming.activeChunks, generatorCache: cache });
}

const activityBefore = byLabel.get('activity-before'), activityAfter = byLabel.get('activity-after-running');
let activity = null;
if (activityBefore && activityAfter) {
  const a = owned(activityBefore, '2,-1'), b = owned(activityAfter, '2,-1');
  const beforeAgents = new Map(a.agents.map(agent => [agent.id, agent]));
  const animals = b.agents.map(agent => {
    const before = beforeAgents.get(agent.id);
    check(before, `Activity animal ${agent.id} did not exist before running.`);
    if (!before) return { id: agent.id, missingBefore: true };
    const netDisplacementM = Math.hypot(...['x', 'y', 'z'].map(axis => agent.position[axis] - before.position[axis]));
    const feedTimestampAdvanced = finite(agent.lastFeedAt) && (before.lastFeedAt === null || agent.lastFeedAt > before.lastFeedAt);
    check(feedTimestampAdvanced, `Activity animal ${agent.id} has no later actual feeding timestamp.`);
    return { id: agent.id, speciesId: agent.speciesId, aliveBefore: before.alive, aliveAfter: agent.alive,
      stateBefore: before.state, stateAfter: agent.state, netDisplacementM,
      lastFeedBeforeSec: before.lastFeedAt, lastFeedAfterSec: agent.lastFeedAt, feedTimestampAdvanced };
  });
  const food = pools.map(pool => ({ pool, stockBefore: a.region.resources[pool], stockAfter: b.region.resources[pool],
    ingestedIncrease: b.region.ledger.byPool[pool].ingested - a.region.ledger.byPool[pool].ingested,
    inputIncrease: b.region.ledger.byPool[pool].input - a.region.ledger.byPool[pool].input,
    exportedIncrease: b.region.ledger.byPool[pool].exported - a.region.ledger.byPool[pool].exported }));
  for (const item of food) check(item.ingestedIncrease > 0, `${item.pool}: no recorded intake during actual activity.`);
  activity = { regionId: '2,-1', elapsedRegionalSec: b.region.timeSec - a.region.timeSec,
    food, feedingCountIncrease: b.region.counters.feedingCount - a.region.counters.feedingCount,
    animals, stationarySeaPigs: animals.filter(agent => agent.speciesId === 'sea-pig-group' && agent.netDisplacementM === 0).length,
    note: 'These sea pigs were already in reach of sediment food and fed while stationary. Attached anemones also stay fixed. Fish endpoint displacement is not path length or evidence of movement by every animal.' };
} else check(false, 'Missing actual activity endpoints.');

let lampBiologyExact = null;
const lampLabels = ['lamp-on-before', 'lamp-off', 'lamp-on-after'];
if (lampLabels.every(label => byLabel.has(label))) {
  const [on, off, again] = lampLabels.map(label => byLabel.get(label));
  lampBiologyExact = isDeepStrictEqual(activeRecords(on), activeRecords(off)) && isDeepStrictEqual(activeRecords(on), activeRecords(again));
  check(lampBiologyExact && on.environment.observerLight === 1 && off.environment.observerLight === 0
    && again.environment.observerLight === 1, 'Observer-lamp toggle changed paused biological records or did not toggle.');
}
let finalEvidence = null;
if (byLabel.has('final')) {
  const narrow = byLabel.get('narrow-far-ready'), geometry = receipt.narrowGeometry;
  const specimen = receipt.narrowSpecimen, sourceFocus = receipt.narrowSourceFocus;
  check(Array.isArray(receipt.finalConsoleErrors) && receipt.finalConsoleErrors.length === 0,
    'Final browser console errors are missing or nonempty.');
  const narrowGeometryPassed = Boolean(narrow && geometry && geometry.scrollWidth <= geometry.width
    && geometry.card.x >= 0 && geometry.card.x + geometry.card.width <= geometry.width
    && geometry.card.y >= 0 && geometry.card.bottom <= narrow.viewport.height);
  const sourceFocusPassed = Boolean(specimen && sourceFocus && specimen.links.length > 0
    && specimen.scrollHeight <= specimen.clientHeight + 1 && sourceFocus.y >= 0
    && sourceFocus.bottom <= sourceFocus.panelBottom && sourceFocus.bottom <= narrow?.viewport.height);
  check(narrowGeometryPassed && sourceFocusPassed, 'Finite narrow-screen card/source geometry check failed.');
  finalEvidence = { narrowReadyLabel: 'narrow-far-ready', narrowViewport: narrow?.viewport,
    narrowGeometryPassed, sourceFocusPassed, geometry, specimen, sourceFocus,
    finalConsoleErrors: receipt.finalConsoleErrors,
    note: 'narrow-near-request-view is an asynchronous camera request, not an owner-record comparison. These measured rectangles do not test all UI states.' };
}
const sourcePaths = ['../src/deepOceanGeneration.js', '../src/oceanRockShape.js', '../src/deepHabitat.js', '../src/deepSimulation.js'];
const result = { schema: 'independent-deep-continuous-verification-v1', status: failures.length ? 'failed' : finalEvidence ? 'passed-final-receipt' : 'passed-current-receipt',
  generatedAtUTC: new Date().toISOString(), input, inputSHA256: hash(bytes), byteLength: bytes.length,
  sourceSHA256: Object.fromEntries(sourcePaths.map(path => [path.replace('../', ''), hash(readFileSync(new URL(path, import.meta.url)))])),
  snapshotLabels: rows.map(row => row.label), pauseExact, comparisons, journalExact,
  journalComparisonScope: 'complete exported DOM text', memoryExact, lampBiologyExact,
  support, budgets, activity, checkpoints, finalEvidence, optionalEvidence, failures,
  limitations: [
    'Exact comparisons cover every owned animal field and every region diagnostic field in the exported receipt, including deaths. Snapshots do not contain individual food-patch arrays or the saved RNG state; this is not a byte comparison of complete IndexedDB records.',
    'Near 2,-1 equality is measured from near-returned to near-returned-again with an intervening unload. Earlier near-paused data legitimately advanced before that later unload and are not asserted equal.',
    'Support is checked only at receipt endpoints: live sea-pig twelve foot endpoints, fish nine reference terrain probes/root height, attached anemone root/anchor and camera center. It proves neither full-body collision exclusion nor every point of a continuous route.',
    'Food and energy ledgers use uncalibrated relative organic-food proxy units. Net endpoint displacement is not path length, swimming speed or a claim that every animal moved.',
    'Camera and origin arithmetic, rendering counters and viewport dimensions are diagnostic samples. They do not independently establish visual acceptance, page-overflow absence or a guaranteed frame rate.',
    'Only recorded paused refresh/revisit intervals are compared. This script does not assert arbitrary browser storage durability or unloaded biological evolution.',
  ] };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, inputSHA256: result.inputSHA256, snapshotCount: rows.length, pauseExact,
  ownerComparisons: comparisons.map(({ regionId, afterLabel, ownedAnimals, entireRegionExact, allOwnedAnimalsExact }) =>
    ({ regionId, afterLabel, ownedAnimals, entireRegionExact, allOwnedAnimalsExact })),
  journalExact, memoryExact, lampBiologyExact, narrowGeometryPassed: finalEvidence?.narrowGeometryPassed,
  sourceFocusPassed: finalEvidence?.sourceFocusPassed, support, budgets, failures, output }, null, 2));
if (failures.length) process.exitCode = 1;
