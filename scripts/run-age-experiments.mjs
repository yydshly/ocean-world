import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AgeStructuredExperiment, DEFAULT_AGE_PARAMETERS, AGE_MODEL_SOURCES } from '../src/ecology/AgeStructuredExperiment.js';

const root = new URL('../', import.meta.url);
const seeds = [1, 7, 42, 2026, 'age-five'];
const durationDays = 365, interventionDay = 90;
const scenarios = [
  { id: 'baseline', label: '持续外部食物输入', patch: null },
  { id: 'stopExternalFood', label: '第90天停止外部食物输入', patch: { foodInputMultiplier: 0 } },
  { id: 'reducedJuvenileAccess', label: '第90天将幼体食物可获得倍率降至0.25', patch: { juvenileFoodAccessMultiplier: .25 } },
  { id: 'adultHarvest', label: '第90天开始成体采收0.03/天', patch: { adultHarvestPerDay: .03 } },
];
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const direction = value => Math.abs(value) < 1e-9 ? 'within 1e-9 tolerance' : value < 0 ? 'lower' : 'higher';
function audited(options) {
  const sim = new AgeStructuredExperiment(options);
  const audit = { stepChecks: 0, finiteNonnegative: true, minOrganicC: sim.totalOrganicC, maxOrganicC: sim.totalOrganicC,
    minDensityM2: Infinity, maxDensityM2: 0, maxCohortCount: sim.cohorts.length,
    maxCarbonBudgetErrorGCM2: 0, maxDemographicBudgetErrorM2: 0, minNewbornMaturationAgeDays: null, minStructureGC: Infinity };
  const advance = sim._advance.bind(sim);
  sim._advance = (dt, endDay) => {
    advance(dt, endDay); audit.stepChecks++;
    const l = sim.ledger, n = { juvenile: 0, adult: 0 };
    for (const c of sim.cohorts) {
      if (![c.densityM2, c.structureC, c.reserveC].every(value => Number.isFinite(value) && value >= 0)) audit.finiteNonnegative = false;
      n[c.stage] += c.densityM2;
      if (c.densityM2 > 0) audit.minStructureGC = Math.min(audit.minStructureGC, c.structureC / c.densityM2);
      if (c.id.startsWith('birth-') && c.maturedAtDay !== null) {
        const age = c.maturedAtDay - c.latestBirthDay;
        audit.minNewbornMaturationAgeDays = Math.min(audit.minNewbornMaturationAgeDays ?? Infinity, age);
        if (age < sim.parameters.minMaturityAgeDays - 1e-8) throw new Error('Matured before minimum age.');
      }
    }
    const expectedJ = l.initialDensityM2ByStage.juvenile + l.birthsExpectedM2 - l.maturationsExpectedM2 - l.deathsExpectedM2ByStage.juvenile - l.harvestedExpectedM2ByStage.juvenile;
    const expectedA = l.initialDensityM2ByStage.adult + l.maturationsExpectedM2 - l.deathsExpectedM2ByStage.adult - l.harvestedExpectedM2ByStage.adult;
    audit.maxDemographicBudgetErrorM2 = Math.max(audit.maxDemographicBudgetErrorM2, Math.abs(n.juvenile - expectedJ), Math.abs(n.adult - expectedA));
    const carbon = sim.totalOrganicC;
    audit.maxCarbonBudgetErrorGCM2 = Math.max(audit.maxCarbonBudgetErrorGCM2, Math.abs(sim.carbonBudgetError));
    audit.minOrganicC = Math.min(audit.minOrganicC, carbon); audit.maxOrganicC = Math.max(audit.maxOrganicC, carbon);
    audit.minDensityM2 = Math.min(audit.minDensityM2, n.juvenile + n.adult); audit.maxDensityM2 = Math.max(audit.maxDensityM2, n.juvenile + n.adult);
    audit.maxCohortCount = Math.max(audit.maxCohortCount, sim.cohorts.length);
    if (![sim.foodC, sim.detritusC, carbon].every(value => Number.isFinite(value) && value >= 0)) audit.finiteNonnegative = false;
    if (!audit.finiteNonnegative || carbon > l.initialOrganicC + l.externalInputC + 1e-7 || sim.cohorts.length > Math.floor(endDay / sim.parameters.cohortBinDays) + 3) throw new Error('Bounded state audit failed.');
    if (audit.maxCarbonBudgetErrorGCM2 >= 1e-7 || audit.maxDemographicBudgetErrorM2 >= 1e-8) throw new Error('Budget audit failed.');
  };
  return { sim, audit };
}
function indicators(data) {
  const c = data.current, l = c.ledger;
  const birthsColumn = data.curve.columns.indexOf('birthsExpectedM2');
  const beforeLate = data.curve.rows.find(row => row[0] === 305);
  return { juvenileBiomassGCM2: c.juvenile.biomassC, adultBiomassGCM2: c.adult.biomassC,
    juvenileExpectedDensityM2: c.juvenile.densityM2, adultExpectedDensityM2: c.adult.densityM2,
    cumulativeBirthsExpectedM2: l.birthsExpectedM2, final60DayBirthsExpectedM2: l.birthsExpectedM2 - beforeLate[birthsColumn],
    cumulativeMaturationsExpectedM2: l.maturationsExpectedM2,
    cumulativeNaturalDeathsExpectedM2: l.deathsExpectedM2ByStage.juvenile + l.deathsExpectedM2ByStage.adult,
    reproductionPaidGCM2: l.reproductionPaidC, externalInputGCM2: l.externalInputC, harvestOutputGCM2: l.harvestOutputC };
}

const runs = [], comparisons = [];
for (const seed of seeds) {
  let baselineIndicators, baselineStateHash, baselineHistoryHash;
  for (const scenario of scenarios) {
    const { sim, audit } = audited({ seed });
    sim.stepDays(interventionDay);
    const stateHash = hash(sim.snapshot()), historyHash = hash(sim.exportCurve());
    if (scenario.id === 'baseline') { baselineStateHash = stateHash; baselineHistoryHash = historyHash; }
    const preInterventionEqual = stateHash === baselineStateHash && historyHash === baselineHistoryHash;
    if (!preInterventionEqual) throw new Error('Paired prehistory differs.');
    if (scenario.patch) sim.setEnvironment(scenario.patch);
    sim.stepDays(durationDays - interventionDay);
    const data = sim.exportData(), metrics = indicators(data);
    runs.push({ seed, scenario: scenario.id, label: scenario.label, preInterventionEqual, preInterventionStateSha256: stateHash,
      preInterventionCurveSha256: historyHash, audit, indicators: metrics, data });
    if (scenario.id === 'baseline') baselineIndicators = metrics;
    else comparisons.push({ seed, scenario: scenario.id, preInterventionEqual,
      indicators: Object.fromEntries(Object.keys(metrics).map(key => [key, { baseline: baselineIndicators[key], intervention: metrics[key],
        difference: metrics[key] - baselineIndicators[key], direction: direction(metrics[key] - baselineIndicators[key]) }])) });
  }
  console.log(`Completed age model seed ${seed}: four 365-simulated-day scenarios.`);
}
const sensitivity = [];
const reference = runs.find(run => run.seed === 42 && run.scenario === 'baseline').data.current;
for (const [id, options] of [['halfTimeStep', { timeStepDays: .025 }], ['halfBirthBin', { parameters: { cohortBinDays: .25 } }]]) {
  const { sim, audit } = audited({ seed: 42, ...options }); sim.stepDays(durationDays); const s = sim.snapshot();
  sensitivity.push({ id, fixedStepDays: sim.timeStepDays, cohortBinDays: sim.parameters.cohortBinDays, audit,
    relativeTotalDensityDifference: (s.totalDensityM2 - reference.totalDensityM2) / reference.totalDensityM2,
    relativeAdultBiomassDifference: (s.adult.biomassC - reference.adult.biomassC) / reference.adult.biomassC,
    current: s });
}
const sourceSha256 = {};
for (const name of ['src/ecology/AgeStructuredExperiment.js', 'tests/age-structured-experiment.test.mjs', 'scripts/run-age-experiments.mjs']) sourceSha256[name] = hash(await readFile(new URL(name, root), 'utf8'));
const allAudits = [...runs.map(run => run.audit), ...sensitivity.map(run => run.audit)];
const directionCounts = Object.fromEntries(scenarios.slice(1).map(scenario => [scenario.id,
  Object.fromEntries(Object.keys(comparisons[0].indicators).map(key => [key,
    comparisons.filter(pair => pair.scenario === scenario.id).reduce((counts, pair) => { const d = pair.indicators[key].direction; counts[d] = (counts[d] ?? 0) + 1; return counts; }, {})]))]));
const report = {
  schema: 'tidal-age-experiment-validation-v1', generatedAtUtc: new Date().toISOString(), sourceSha256,
  mode: 'independent one-consumer lifecycle teaching model; separate from seven-pool and 3D modes',
  simulatedTimeUnit: 'day', modelMonthDays: 30, durationDays, interventionDay, biomassUnit: 'g organic C/m²',
  densityUnit: 'continuous expected model individuals/m²', countsAreContinuous: true, mapsTo3DIndividuals: false,
  seeds, scenarios, sourceMechanisms: AGE_MODEL_SOURCES, parameterCalibration: 'All demographic and carbon-allocation defaults are uncalibrated teaching selections.',
  summary: { runs: runs.length, pairedComparisons: comparisons.length, sensitivityRuns: sensitivity.length,
    finiteNonnegative: allAudits.every(audit => audit.finiteNonnegative), preInterventionEqual: comparisons.every(pair => pair.preInterventionEqual),
    stepChecks: allAudits.reduce((sum, audit) => sum + audit.stepChecks, 0),
    maxCarbonBudgetErrorGCM2: Math.max(...allAudits.map(audit => audit.maxCarbonBudgetErrorGCM2)),
    maxDemographicBudgetErrorM2: Math.max(...allAudits.map(audit => audit.maxDemographicBudgetErrorM2)),
    maxCohortCount: Math.max(...runs.map(run => run.audit.maxCohortCount)),
    minimumObservedNewbornMaturationAgeDays: Math.min(...allAudits.map(audit => audit.minNewbornMaturationAgeDays ?? Infinity)),
    requiredMinimumAgeDays: DEFAULT_AGE_PARAMETERS.minMaturityAgeDays, directionCounts },
  limitations: ['Numerical results describe the chosen teaching model, not wild population numbers or species rates.',
    'Expected density can be fractional; an assumed newborn carbon mass converts allocated carbon to density.',
    'A birth bin uses its latest birthday for maturation; within-bin size distribution is approximate.',
    'Stop-food leaves existing food and reserves, so births may continue temporarily.',
    'Half-step and half-bin comparisons report actual differences; passing positivity does not establish field validity.',
    'These are direct model simulated-day experiments; no browser wall-clock, lifecycle visualization or species calibration is claimed.'],
  runs, comparisons, sensitivity,
};
await mkdir(new URL('output/validation/', root), { recursive: true });
const destination = new URL('output/validation/age-experiments.json', root);
await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ file: fileURLToPath(destination), ...report.summary, directionCounts: undefined }));
