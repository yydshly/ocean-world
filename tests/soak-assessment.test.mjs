import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessSoakResources, assessObservationHistory } from '../scripts/lib/soak-assessment.mjs';

// These are deliberately synthetic in-memory checkpoints, not observations of
// the browser or GPU. They test report acceptance rules, never performance.
function syntheticSamples() {
  return Array.from({ length: 40 }, (_, index) => ({
    wallSeconds: (index + 1) * 30, fps: 60, entities: 136,
    paused: false, speed: 1, visibility: 'visible',
    memory: { geometries: 115, textures: 21 },
    metrics: { timeSec: (index + 1) * 30, averageEnergy: 70, population: 136,
      mobilePopulation: 120, resourceBudgetError: 0, algae: 1, plankton: 1, detritus: 1, microfauna: 1 },
    initializationMs: 500,
    gpuWarmup: { offscreenPasses: 1, targetWidth: 1, targetHeight: 1,
      shadowRendering: false, canvasProgramsPrecompiled: true, dispatchAndCompileMs: 150 },
    resourceInventory: { counts: { geometries: 1294, materials: 110, textures: 16 },
      initialCounts: { geometries: 1294, materials: 110, textures: 16 },
      addedSinceInit: { geometries: 0, materials: 0, textures: 0 },
      missingSinceInit: { geometries: 0, materials: 0, textures: 0 }, identitiesUnchanged: true },
    camera: { position: [3, 3.6, 5], target: [-2.5, .5, -2] },
    environment: { currentMps: .15, turbidity: .25, foodSupply: 1, hour: 10 }, controlStartCount: 0,
    viewport: { width: 1920, height: 1080, pixelRatio: 1 },
  }));
}
const assess = samples => assessSoakResources(samples, { requirePrewarmedResources: true });
const failsFor = (result, fragment) => assert.ok(result.violations.some(violation => violation.includes(fragment)), result.violations.join('\n'));

test('a complete stable prewarmed synthetic history satisfies the resource gates', () => {
  const result = assess(syntheticSamples());
  assert.deepEqual(result.violations, []);
  assert.equal(result.cpuAssetInventory.identitiesUnchanged, true);
  assert.equal(result.prewarmValidation.recordsUnchanged, true);
});

test('prewarming rejects a single early geometry upload even if legacy selection would allow it', () => {
  const samples = syntheticSamples();
  samples[0].memory.geometries--;
  assert.deepEqual(assessSoakResources(samples).violations, []);
  const result = assess(samples);
  failsFor(result, 'Renderer resource counts changed');
  assert.ok(result.resourceCountNotes.some(note => note.includes('rejects this change')));
});

test('prewarming rejects any late geometry growth, and cannot inherit an accepted LOD exception', () => {
  const samples = syntheticSamples();
  samples.at(-1).memory.geometries++;
  const result = assessSoakResources(samples, { requirePrewarmedResources: true,
    lodUploadWarmup: { accepted: true } });
  failsFor(result, 'Renderer resource counts changed');
  assert.ok(result.resourceCountNotes.some(note => note.includes('failure remains')));
});

test('replacement at the same geometry/material/texture counts fails by identity evidence', () => {
  for (const kind of ['geometries', 'materials', 'textures']) {
    const samples = syntheticSamples();
    const inventory = samples[15].resourceInventory;
    inventory.addedSinceInit[kind] = 1;
    inventory.missingSinceInit[kind] = 1;
    inventory.identitiesUnchanged = false;
    assert.deepEqual(inventory.counts, samples[0].resourceInventory.counts);
    const result = assess(samples);
    failsFor(result, 'CPU asset identity');
    assert.equal(result.cpuAssetInventory.identitiesUnchanged, false);
  }
});

test('zero identity deltas cannot conceal a changed count or changed initialization baseline', () => {
  for (const field of ['counts', 'initialCounts']) {
    const samples = syntheticSamples();
    samples[15].resourceInventory[field].geometries++;
    failsFor(assess(samples), 'CPU asset identity');
  }
});

test('every checkpoint must have complete identity evidence with an actual boolean flag', () => {
  for (const field of ['counts', 'initialCounts', 'addedSinceInit', 'missingSinceInit', 'identitiesUnchanged']) {
    const samples = syntheticSamples();
    delete samples[15].resourceInventory[field];
    const result = assess(samples);
    failsFor(result, 'CPU asset identity');
    assert.equal(result.cpuAssetInventory.recorded, false);
  }
  const samples = syntheticSamples();
  samples[15].resourceInventory.identitiesUnchanged = 'true';
  failsFor(assess(samples), 'CPU asset identity');
});

test('a missing, incomplete, impossible or repeated warmup record fails the prewarming gate', () => {
  const changes = [
    sample => { delete sample.gpuWarmup; },
    sample => { delete sample.initializationMs; },
    sample => { delete sample.gpuWarmup.canvasProgramsPrecompiled; },
    sample => { sample.gpuWarmup.targetWidth = 0; },
    sample => { sample.gpuWarmup.offscreenPasses = 2; },
    sample => { sample.gpuWarmup.dispatchAndCompileMs = -1; },
    sample => { sample.initializationMs = 100; },
    sample => { sample.gpuWarmup.dispatchAndCompileMs++; },
  ];
  for (const change of changes) {
    const samples = syntheticSamples();
    change(samples[15]);
    failsFor(assess(samples), 'initialization and offscreen upload');
  }
});

test('missing or invalid GPU counts never pass just because all checkpoints have the same value', () => {
  for (const invalid of [undefined, null, NaN, -1, 1.5]) {
    const samples = syntheticSamples();
    for (const sample of samples) sample.memory.geometries = invalid;
    failsFor(assess(samples), 'resource count is missing or invalid');
  }
});

test('historical checkpoints without camera fields report no complete camera history', () => {
  const samples = syntheticSamples();
  for (const sample of samples) delete sample.camera;
  const result = assessObservationHistory(samples);
  assert.equal(result.cameraCheckpoints.recorded, false);
  assert.equal(result.cameraCheckpoints.first, null);
  assert.equal(result.cameraCheckpoints.distinctStates, null);
  assert.match(result.observationMode, /no complete camera history/);
  assert.doesNotMatch(result.observationMode, /camera saved/);
});

test('a camera history requires finite coordinates at every checkpoint', () => {
  for (const invalid of [null, undefined, NaN, Infinity]) {
    const samples = syntheticSamples();
    samples[15].camera.position[0] = invalid;
    assert.equal(assessObservationHistory(samples).cameraCheckpoints.recorded, false);
  }
});

test('saved cameras alone do not claim saved environments or unchanged controls', () => {
  const samples = syntheticSamples();
  delete samples[15].environment;
  delete samples[15].controlStartCount;
  samples[20].camera.position[0]++;
  const result = assessObservationHistory(samples);
  assert.equal(result.cameraCheckpoints.recorded, true);
  assert.equal(result.cameraCheckpoints.distinctStates, 2);
  assert.equal(result.cameraCheckpoints.controlStartCountRange, null);
  assert.equal(result.environmentCheckpoints.recorded, false);
  assert.match(result.observationMode, /camera saved; no complete environment history/);
  assert.match(result.cameraCheckpoints.limit, /does not prove no motion/);
});

test('empty assessment inputs do not satisfy any evidence gate', () => {
  const result = assess([]);
  failsFor(result, 'CPU asset identity');
  failsFor(result, 'initialization and offscreen upload');
  assert.equal(assessObservationHistory([]).cameraCheckpoints.recorded, false);
});

test('the prewarmed reef benchmark requires 1080p DPR1 at every checkpoint', () => {
  const mutations = [
    sample => { delete sample.viewport; },
    sample => { sample.viewport.width = 1280; },
    sample => { sample.viewport.height = 720; },
    sample => { sample.viewport.pixelRatio = 1.5; },
  ];
  for (const mutate of mutations) {
    const samples = syntheticSamples();
    mutate(samples[15]);
    failsFor(assess(samples), 'DPR1 viewport at every checkpoint');
    assert.deepEqual(assessSoakResources(samples).violations, []);
  }
});

test('all prewarmed biomes require finite camera and complete environment checkpoints', () => {
  for (const biomeId of ['reef', 'kelp', 'deep']) {
    for (const key of ['currentMps', 'turbidity', 'foodSupply', 'hour']) {
      for (const invalid of [undefined, null, NaN, Infinity]) {
        const samples = syntheticSamples();
        samples[15].environment[key] = invalid;
        failsFor(assessSoakResources(samples, { requirePrewarmedResources: true, biomeId }), 'finite currentMps');
      }
    }
    const samples = syntheticSamples();
    samples[15].camera.target[0] = null;
    failsFor(assessSoakResources(samples, { requirePrewarmedResources: true, biomeId }), 'finite camera');
  }
});

test('historical resource assessment does not acquire a 100-mobile-individual requirement', () => {
  const samples = syntheticSamples();
  for (const sample of samples) {
    sample.metrics.mobilePopulation = 62;
    delete sample.viewport;
    delete sample.camera;
    delete sample.environment;
  }
  assert.deepEqual(assessSoakResources(samples).violations, []);
  failsFor(assess(samples), '100 finite living mobile individuals');
});

test('CLI routes prewarmed strictness into the saved summary, using isolated synthetic fixtures', async t => {
  const tempBase = path.resolve(os.tmpdir());
  const fixtureRoot = await mkdtemp(path.join(tempBase, 'tidal-synthetic-soak-'));
  // Keep all fixture writes and recursive cleanup inside a verified temporary
  // directory. Nothing is written to the project's actual evidence folders.
  assert.equal(path.dirname(path.resolve(fixtureRoot)), tempBase);
  assert.ok(path.basename(fixtureRoot).startsWith('tidal-synthetic-soak-'));
  t.after(async () => {
    const resolved = path.resolve(fixtureRoot);
    assert.equal(path.dirname(resolved), tempBase);
    assert.ok(path.basename(resolved).startsWith('tidal-synthetic-soak-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const telemetryRoot = path.join(fixtureRoot, 'output', 'validation', 'telemetry');
  await mkdir(telemetryRoot, { recursive: true });
  const runId = 'browser-run-123456789';
  const samples = syntheticSamples();
  samples[0].memory.geometries--;
  for (const sample of samples) delete sample.camera;
  const report = { runId, wallSeconds: 1200, biomeId: 'reef', samples, errors: [],
    viewport: { width: 1920, height: 1080, pixelRatio: 1 }, hardware: 'synthetic fixture; not GPU evidence' };
  await writeFile(path.join(telemetryRoot, runId + '-synthetic.json'), JSON.stringify(report));
  const cliPath = fileURLToPath(new URL('../scripts/summarize-browser-soak.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, runId, 'synthetic-prewarm-check', '--require-prewarmed-resources'],
    { cwd: fixtureRoot, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  const summary = JSON.parse(await readFile(path.join(fixtureRoot, 'output', 'validation', 'synthetic-prewarm-check.json'), 'utf8'));
  assert.equal(summary.passed, false);
  assert.equal(summary.prewarmValidation.required, true);
  failsFor(summary, 'Renderer resource counts changed');
  assert.equal(summary.cameraCheckpoints.recorded, false);
  assert.doesNotMatch(summary.observationMode, /camera saved/);
});
