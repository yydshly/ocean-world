import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizePerformanceReport } from '../scripts/lib/performance-assessment.mjs';

// Synthetic data tests acceptance logic; none is real performance evidence.
function syntheticReport() {
  return {
    runId: 'browser-run-123456789', wallSeconds: 120, actualFrameCount: 7200,
    actualFrameSeconds: 120, overallMeanFPS: 60, errors: [],
    viewport: { width: 1920, height: 1080, pixelRatio: 1 }, hardware: 'synthetic fixture only',
    samples: Array.from({ length: 4 }, (_, index) => ({
      wallSeconds: (index + 1) * 30, fps: 60, entities: 136, drawCalls: 700, triangles: 1700000,
      paused: false, speed: 1, visibility: 'visible',
      viewport: { width: 1920, height: 1080, pixelRatio: 1 },
      metrics: { mobilePopulation: 120, population: 136, averageEnergy: 70,
        timeSec: (index + 1) * 30, resourceBudgetError: 0 },
    })),
  };
}
const failsFor = (result, fragment) => {
  assert.equal(result.passed, false);
  assert.ok(result.violations.some(violation => violation.includes(fragment)), result.violations.join('\n'));
};

test('complete finite synthetic performance checkpoints satisfy the guarded assessment', () => {
  const result = summarizePerformanceReport(syntheticReport());
  assert.equal(result.passed, true);
  assert.equal(result.fps.mean, 60);
  assert.equal(result.fullRunTiming.overallMeanFPS, 60);
  assert.equal(result.viewportHistory.scope, 'final-and-every-checkpoint');
});

test('missing, null and nonfinite mobile populations never bypass the 100 individual gate', () => {
  for (const invalid of [undefined, null, NaN, Infinity, 99]) {
    const report = syntheticReport();
    report.samples[1].metrics.mobilePopulation = invalid;
    failsFor(summarizePerformanceReport(report), '100 living mobile');
  }
});

test('missing, null or nonfinite sample FPS cannot silently create a passing NaN mean', () => {
  for (const invalid of [undefined, null, NaN, Infinity]) {
    const report = syntheticReport();
    report.samples[1].fps = invalid;
    const result = summarizePerformanceReport(report);
    failsFor(result, 'required performance metric');
    assert.equal(result.fps.mean, null);
  }
});

test('required metrics and render counts must be finite at every checkpoint', () => {
  for (const key of ['population', 'averageEnergy', 'timeSec', 'resourceBudgetError']) {
    for (const invalid of [undefined, null, NaN, Infinity]) {
      const report = syntheticReport();
      report.samples[1].metrics[key] = invalid;
      failsFor(summarizePerformanceReport(report), 'required performance metric');
    }
  }
  for (const key of ['drawCalls', 'triangles', 'entities']) {
    for (const invalid of [undefined, null, NaN, Infinity, -1, 1.5]) {
      const report = syntheticReport();
      report.samples[1][key] = invalid;
      failsFor(summarizePerformanceReport(report), 'required performance metric');
    }
  }
});

test('cumulative frame count, duration and FPS must all be positive finite values', () => {
  for (const key of ['actualFrameCount', 'actualFrameSeconds', 'overallMeanFPS']) {
    for (const invalid of [undefined, null, NaN, Infinity, 0, -1]) {
      const report = syntheticReport();
      report[key] = invalid;
      const result = summarizePerformanceReport(report);
      failsFor(result, 'Cumulative actual frame count');
      assert.equal(result.fullRunTiming, null);
    }
  }
});

test('cumulative FPS must agree with its count/duration and meet the 30 FPS target', () => {
  const mismatch = syntheticReport();
  mismatch.overallMeanFPS = 120;
  failsFor(summarizePerformanceReport(mismatch), 'does not match');
  const slow = syntheticReport();
  slow.actualFrameCount = 2400;
  slow.overallMeanFPS = 20;
  failsFor(summarizePerformanceReport(slow), 'Full-run mean actual FPS below 30');
});

test('every recorded viewport must remain at 1920×1080 and DPR1', () => {
  const mutations = [
    sample => { delete sample.viewport; },
    sample => { sample.viewport = null; },
    sample => { sample.viewport.width = 1280; },
    sample => { sample.viewport.height = 720; },
    sample => { sample.viewport.pixelRatio = 1.5; },
  ];
  for (const mutate of mutations) {
    const report = syntheticReport();
    mutate(report.samples[1]);
    failsFor(summarizePerformanceReport(report), 'checkpoint viewport');
  }
});

test('historical runs without any per-checkpoint viewport explicitly establish final resolution only', () => {
  const report = syntheticReport();
  report.samples.forEach(sample => { delete sample.viewport; });
  const result = summarizePerformanceReport(report);
  assert.equal(result.passed, true);
  assert.equal(result.viewportHistory.scope, 'final-only');
  assert.match(result.viewportHistory.limit, /full-run resolution is not established/);
  assert.ok(result.limits.some(limit => limit.includes('final resolution only')));
});

test('ledger, wall timing and running-state failures remain report failures', () => {
  const changes = [
    report => { report.samples[1].metrics.resourceBudgetError = .01; },
    report => { report.samples[1].wallSeconds = 30; },
    report => { report.samples[1].wallSeconds = null; },
    report => { report.wallSeconds = null; },
    report => { report.samples[1].paused = true; },
    report => { delete report.errors; },
    report => { report.samples = []; },
  ];
  for (const change of changes) {
    const report = syntheticReport();
    change(report);
    assert.equal(summarizePerformanceReport(report).passed, false);
  }
});

test('performance CLI rejects an isolated synthetic missing FPS record without altering real evidence', async t => {
  const tempBase = path.resolve(os.tmpdir());
  const fixtureRoot = await mkdtemp(path.join(tempBase, 'tidal-synthetic-performance-'));
  assert.equal(path.dirname(path.resolve(fixtureRoot)), tempBase);
  assert.ok(path.basename(fixtureRoot).startsWith('tidal-synthetic-performance-'));
  t.after(async () => {
    const resolved = path.resolve(fixtureRoot);
    assert.equal(path.dirname(resolved), tempBase);
    assert.ok(path.basename(resolved).startsWith('tidal-synthetic-performance-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const telemetryRoot = path.join(fixtureRoot, 'output', 'validation', 'telemetry');
  await mkdir(telemetryRoot, { recursive: true });
  const report = syntheticReport();
  delete report.samples[1].fps;
  await writeFile(path.join(telemetryRoot, report.runId + '-synthetic.json'), JSON.stringify(report));
  const cliPath = fileURLToPath(new URL('../scripts/summarize-performance.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, report.runId, 'synthetic-performance-check'],
    { cwd: fixtureRoot, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  const summary = JSON.parse(await readFile(path.join(fixtureRoot, 'output', 'validation', 'synthetic-performance-check.json'), 'utf8'));
  failsFor(summary, 'required performance metric');
  assert.equal(summary.fps.mean, null);
});
