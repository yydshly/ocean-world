import { isBenchmarkViewport } from './soak-assessment.mjs';

const finite = Number.isFinite;
const positive = value => finite(value) && value > 0;
const count = value => Number.isInteger(value) && value >= 0;
const range = values => values.length && values.every(finite)
  ? { minimum: Math.min(...values), maximum: Math.max(...values) } : { minimum: null, maximum: null };

// Assess observed data only; callers decide where to save the resulting report.
// Missing values cannot silently turn arithmetic into NaN and bypass a gate.
export function summarizePerformanceReport(report, { runId = report.runId, source = null } = {}) {
  const samples = Array.isArray(report.samples) ? report.samples : [];
  const violations = [];
  if (!positive(report.wallSeconds) || report.wallSeconds < 120 || samples.length < 4)
    violations.push('Fewer than 120 actual seconds or four interval samples, or invalid wall duration.');
  if (samples.some(sample => sample.paused !== false || sample.speed !== 1 || sample.visibility !== 'visible'))
    violations.push('The workload was paused, hidden, accelerated or lacks its running-state record.');
  const numericKeys = ['mobilePopulation', 'population', 'averageEnergy', 'timeSec', 'resourceBudgetError'];
  if (samples.some(sample => numericKeys.some(key => !finite(sample.metrics?.[key])) ||
      !finite(sample.fps) || !count(sample.drawCalls) || !count(sample.triangles) || !count(sample.entities)))
    violations.push('A required performance metric or renderer count is missing, null, nonfinite or invalid.');
  if (samples.some(sample => !finite(sample.metrics?.mobilePopulation) || sample.metrics.mobilePopulation < 100))
    violations.push('Fewer than 100 living mobile individuals, or missing mobile count, at an interval sample.');
  if (samples.some(sample => sample.fps < 0 || sample.metrics?.timeSec < 0 ||
      sample.metrics?.population < 0 || Math.abs(sample.metrics?.resourceBudgetError) > 1e-6))
    violations.push('A population, timing, FPS or resource-ledger invariant was violated.');
  if (!isBenchmarkViewport(report.viewport))
    violations.push('The final viewport is not 1920×1080 with one drawing-buffer pixel per viewport pixel.');
  const samplesWithViewport = samples.filter(sample => Object.hasOwn(sample, 'viewport')).length;
  const checkpointViewportRecorded = samples.length > 0 && samplesWithViewport === samples.length;
  if (samplesWithViewport > 0 && (!checkpointViewportRecorded || samples.some(sample => !isBenchmarkViewport(sample.viewport))))
    violations.push('A checkpoint viewport is missing or differs from 1920×1080, DPR1.');
  if (!Array.isArray(report.errors)) violations.push('The runtime-error record is missing or invalid.');
  else if (report.errors.length) violations.push('Runtime errors were recorded.');

  const fps = samples.map(sample => sample.fps);
  const fpsValid = samples.length > 0 && fps.every(finite);
  const mean = fpsValid ? fps.reduce((sum, value) => sum + value, 0) / fps.length : null;
  if (mean !== null && mean < 30) violations.push('Mean interval-sampled FPS below 30.');
  const cumulativeRecorded = Number.isInteger(report.actualFrameCount) && positive(report.actualFrameCount) &&
    positive(report.actualFrameSeconds) && positive(report.overallMeanFPS);
  const fullRunTiming = cumulativeRecorded ? {
    actualFrameCount: report.actualFrameCount, actualFrameSeconds: report.actualFrameSeconds,
    overallMeanFPS: report.overallMeanFPS, minFrameTimeMs: report.minFrameTimeMs,
    maxFrameTimeMs: report.maxFrameTimeMs, frameTimeBuckets: report.frameTimeBuckets,
  } : null;
  if (!cumulativeRecorded) violations.push('Cumulative actual frame count, duration and FPS must be positive and finite.');
  else {
    if (report.overallMeanFPS < 30) violations.push('Full-run mean actual FPS below 30.');
    const recomputed = report.actualFrameCount / report.actualFrameSeconds;
    if (Math.abs(recomputed - report.overallMeanFPS) > Math.max(1e-6, recomputed * 1e-6))
      violations.push('Cumulative FPS does not match the recorded actual frame count and duration.');
  }
  const gaps = samples.map((sample, index) => index ? sample.wallSeconds - samples[index - 1].wallSeconds : sample.wallSeconds);
  if (samples.some(sample => !positive(sample.wallSeconds)) || gaps.some(seconds => !positive(seconds) || seconds > 45))
    violations.push('A checkpoint wall time is invalid, non-increasing or has a gap exceeding 45 actual seconds.');
  if (samples.length && samples.at(-1).wallSeconds > report.wallSeconds)
    violations.push('The final checkpoint is later than the reported wall duration.');
  const mobileRange = range(samples.map(sample => sample.metrics?.mobilePopulation));
  const ledgerErrors = samples.map(sample => sample.metrics?.resourceBudgetError);
  const viewportScope = checkpointViewportRecorded ? 'final-and-every-checkpoint' : samplesWithViewport ? 'incomplete-checkpoint-history' : 'final-only';
  return {
    schema: 'tidal-browser-performance-v2', runId, source,
    actualWallSeconds: report.wallSeconds, simulatedSeconds: samples.at(-1)?.metrics?.timeSec ?? null,
    hardware: report.hardware, viewport: report.viewport, intervalSampleCount: samples.length,
    viewportHistory: {
      scope: viewportScope, checkpointCount: samplesWithViewport,
      limit: checkpointViewportRecorded
        ? 'Viewport recorded at thirty-second checkpoints; this does not prove no changes between samples.'
        : 'Only the final viewport is established when historical checkpoints omit viewport; full-run resolution is not established.',
    },
    minimumLivingMobileIndividuals: mobileRange.minimum, maximumLivingMobileIndividuals: mobileRange.maximum,
    rendererAllocationCounts: [...new Set(samples.map(sample => sample.entities))],
    fps: { mean, ...range(fps) }, fullRunTiming,
    maximumCheckpointGapSeconds: gaps.length && gaps.every(finite) ? Math.max(...gaps) : null,
    drawCalls: range(samples.map(sample => sample.drawCalls)), triangles: range(samples.map(sample => sample.triangles)),
    maxResourceLedgerError: ledgerErrors.length && ledgerErrors.every(finite) ? Math.max(...ledgerErrors.map(Math.abs)) : null,
    runtimeErrors: Array.isArray(report.errors) ? report.errors : null, violations, passed: violations.length === 0,
    limits: [fullRunTiming
      ? 'Cumulative mean uses all recorded actual frame intervals; fixed time buckets are bounded summaries, not exact percentile timings.'
      : 'Cumulative frame timing is missing or invalid; this assessment cannot establish full-run performance.',
      checkpointViewportRecorded
        ? '1920×1080/DPR1 is checked at every recorded window; intervening resolution changes are not observed.'
        : 'Historical viewport records establish the final resolution only, not the resolution throughout the run.',
      'Additional chromis are a stated performance workload, not a calibrated community density.',
      'The frozen build manifest identifies this version; results are specific to its settings and this GPU.'],
  };
}
