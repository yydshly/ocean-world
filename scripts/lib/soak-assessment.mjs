const assetKinds = ['geometries', 'materials', 'textures'];
const isCount = value => Number.isInteger(value) && value >= 0;
const isDuration = value => Number.isFinite(value) && value >= 0;
const unique = values => [...new Set(values)];
const finiteVector = vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
const finiteCamera = camera => finiteVector(camera?.position) && finiteVector(camera?.target);
const environmentKeys = ['currentMps', 'turbidity', 'foodSupply', 'hour'];
const finiteEnvironment = environment => environmentKeys.every(key => Number.isFinite(environment?.[key]));
export const isBenchmarkViewport = viewport => viewport?.width === 1920 && viewport?.height === 1080 && viewport?.pixelRatio === 1;

// Pure evidence assessment: synthetic tests never write into the captured
// telemetry directory, and historical reports keep their original records.
export function assessSoakResources(samples, { requirePrewarmedResources = false, lodUploadWarmup = null, biomeId = 'reef' } = {}) {
  const violations = [];
  const gpuCountsRecorded = samples.length > 0 && samples.every(sample =>
    isCount(sample.memory?.geometries) && isCount(sample.memory?.textures) && isCount(sample.entities));
  const geometryCounts = unique(samples.map(sample => sample.memory?.geometries));
  const textureCounts = unique(samples.map(sample => sample.memory?.textures));
  const entityCounts = unique(samples.map(sample => sample.entities));
  if (!gpuCountsRecorded) violations.push('A renderer resource count is missing or invalid.');

  const selectionUpload = gpuCountsRecorded && geometryCounts.length === 2 &&
    geometryCounts[1] === geometryCounts[0] + 1 &&
    samples.slice(2).every(sample => sample.memory.geometries === geometryCounts[1]);
  const geometryChangeAccepted = !requirePrewarmedResources && (selectionUpload || lodUploadWarmup?.accepted === true);
  if ((geometryCounts.length > 1 && !geometryChangeAccepted) || textureCounts.length > 1 || entityCounts.length > 1)
    violations.push('Renderer resource counts changed; inspect their cause.');

  const inventories = samples.map(sample => sample.resourceInventory);
  const inventoryRecorded = samples.length > 0 && inventories.every(inventory => inventory &&
    assetKinds.every(kind => ['counts', 'initialCounts', 'addedSinceInit', 'missingSinceInit']
      .every(field => isCount(inventory[field]?.[kind]))) && typeof inventory.identitiesUnchanged === 'boolean');
  const cpuIdentitiesStable = inventoryRecorded && inventories.every(inventory =>
    inventory.identitiesUnchanged === true && assetKinds.every(kind =>
      inventory.addedSinceInit[kind] === 0 && inventory.missingSinceInit[kind] === 0 &&
      inventory.counts[kind] === inventory.initialCounts[kind] &&
      inventory.counts[kind] === inventories[0].initialCounts[kind]));

  const validWarmup = sample => sample.gpuWarmup?.offscreenPasses === 1 &&
    sample.gpuWarmup.targetWidth === 1 && sample.gpuWarmup.targetHeight === 1 &&
    sample.gpuWarmup.shadowRendering === false && sample.gpuWarmup.canvasProgramsPrecompiled === true &&
    isDuration(sample.initializationMs) && isDuration(sample.gpuWarmup.dispatchAndCompileMs) &&
    sample.initializationMs >= sample.gpuWarmup.dispatchAndCompileMs;
  const warmupRecorded = samples.length > 0 && samples.every(validWarmup);
  const warmupRecordsUnchanged = warmupRecorded && samples.every(sample =>
    sample.initializationMs === samples[0].initializationMs &&
    JSON.stringify(sample.gpuWarmup) === JSON.stringify(samples[0].gpuWarmup));
  if (requirePrewarmedResources && !cpuIdentitiesStable)
    violations.push('Prewarmed run lacks an unchanged CPU asset identity inventory at every checkpoint.');
  if (requirePrewarmedResources && !warmupRecordsUnchanged)
    violations.push('Prewarmed run lacks one consistent initialization and offscreen upload record at every checkpoint.');
  const camerasRecorded = samples.length > 0 && samples.every(sample => finiteCamera(sample.camera));
  const environmentsRecorded = samples.length > 0 && samples.every(sample => finiteEnvironment(sample.environment));
  const viewportRecorded = samples.length > 0 && samples.every(sample => isBenchmarkViewport(sample.viewport));
  if (requirePrewarmedResources && !camerasRecorded)
    violations.push('Prewarmed run lacks a finite camera position and target at every checkpoint.');
  if (requirePrewarmedResources && !environmentsRecorded)
    violations.push('Prewarmed run lacks finite currentMps, turbidity, foodSupply and hour at every checkpoint.');
  if (requirePrewarmedResources && biomeId === 'reef' && !viewportRecorded)
    violations.push('Prewarmed reef benchmark lacks a 1920×1080, DPR1 viewport at every checkpoint.');
  if (requirePrewarmedResources && biomeId === 'reef' && samples.some(sample =>
      !Number.isFinite(sample.metrics?.mobilePopulation) || sample.metrics.mobilePopulation < 100))
    violations.push('Prewarmed reef benchmark lacks at least 100 finite living mobile individuals at every checkpoint.');

  const resourceCountNotes = selectionUpload ? [requirePrewarmedResources
    ? 'An extra geometry appeared after prewarming; the prewarmed resource-count check rejects this change.'
    : 'One geometry was first uploaded by the third checkpoint and all later counts remained constant; attribution to selection is inferred, not logged.'] : [];
  if (lodUploadWarmup) resourceCountNotes.push(geometryChangeAccepted && lodUploadWarmup.accepted
    ? 'GPU counts changed during early cached-LOD upload and then remained stable; CPU geometry-tree evidence and the strict report are retained separately.'
    : 'The candidate cached-LOD explanation did not meet this run’s resource requirements; the resource-count failure remains.');
  return {
    violations, geometryCounts, textureCounts, entityCounts, selectionUpload, resourceCountNotes,
    cpuAssetInventory: {
      recorded: inventoryRecorded, identitiesUnchanged: inventoryRecorded ? cpuIdentitiesStable : null,
      initial: inventoryRecorded ? inventories[0] : null, final: inventoryRecorded ? inventories.at(-1) : null,
      scope: 'CPU scene/owned-asset identity inventory; excludes renderer internal GPU targets and JavaScript heap profiling.',
    },
    prewarmValidation: {
      required: requirePrewarmedResources, recorded: warmupRecorded, recordsUnchanged: warmupRecordsUnchanged,
      initializationMs: warmupRecorded ? samples[0].initializationMs : null,
      uploadAndCompile: warmupRecorded ? samples[0].gpuWarmup : null,
    },
  };
}

export function assessObservationHistory(samples) {
  const camerasRecorded = samples.length > 0 && samples.every(sample => finiteCamera(sample.camera));
  const environmentsRecorded = samples.length > 0 && samples.every(sample => finiteEnvironment(sample.environment));
  const controlsRecorded = samples.length > 0 && samples.every(sample => isCount(sample.controlStartCount));
  const cameraStates = camerasRecorded ? unique(samples.map(sample => JSON.stringify(sample.camera))) : [];
  const running = samples.length > 0 && samples.every(sample => !sample.paused && sample.speed === 1 && sample.visibility === 'visible');
  const history = `${camerasRecorded ? 'camera saved' : 'no complete camera history'}; ${environmentsRecorded ? 'environment saved' : 'no complete environment history'} at thirty-second checkpoints`;
  return {
    observationMode: `${running ? 'unpaused 1x, visible' : 'contains paused, accelerated, hidden or unspecified intervals'}; ${history}`,
    cameraCheckpoints: {
      recorded: camerasRecorded, distinctStates: camerasRecorded ? cameraStates.length : null,
      first: camerasRecorded ? samples[0].camera : null, last: camerasRecorded ? samples.at(-1).camera : null,
      controlStartCountRange: controlsRecorded ? [Math.min(...samples.map(sample => sample.controlStartCount)), Math.max(...samples.map(sample => sample.controlStartCount))] : null,
      limit: 'Checkpoint equality does not prove no motion between samples; control-start counts cover OrbitControls start events only.',
    },
    environmentCheckpoints: {
      recorded: environmentsRecorded,
      first: environmentsRecorded ? samples[0].environment : null,
      last: environmentsRecorded ? samples.at(-1).environment : null,
      limit: 'Checkpoint snapshots do not establish unchanged environmental settings between samples.',
    },
  };
}
