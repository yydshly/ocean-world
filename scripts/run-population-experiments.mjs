import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  PopulationExperiment, BIOMASS_POOLS, EXPERIMENT_TIME_STEP_DAYS,
  EXPERIMENT_MONTH_DAYS, DEFAULT_POPULATION_PARAMETERS,
  DEFAULT_POPULATION_ENVIRONMENT, MODEL_SOURCES,
} from '../src/ecology/PopulationExperiment.js';

const outputUrl = new URL('../output/validation/population-experiments.json', import.meta.url);
const seeds = [1, 9, 42, 77, 2026];
const durationDays = 365;
const interventionDay = 90;
const ticks = Math.round(durationDays / EXPERIMENT_TIME_STEP_DAYS);
const interventionTick = Math.round(interventionDay / EXPERIMENT_TIME_STEP_DAYS);
const carbonToleranceGCM2 = 1e-7;
const scenarios = [
  { id: 'increasedTurbidity', label: '高混浊', intervention: { turbidityIndex: 0.85 }, focusMetrics: ['cumulativePrimaryProductionC', 'finalProducers', 'finalPlanktivores'] },
  { id: 'reducedPlanktonInput', label: '减少外部浮游生产者输入', intervention: { planktonInputMultiplier: 0.2 }, focusMetrics: ['cumulativeExternalInputC', 'finalPlanktonProducers', 'finalPlanktivores'] },
  { id: 'predatorRemoval', label: '持续移除捕食群', intervention: { predatorHarvestPerDay: 0.08 }, focusMetrics: ['cumulativeHarvestOutputC', 'finalPredators', 'finalGrazers', 'finalPlanktivores'] },
];

const metricDefinitions = {
  finalBenthicProducers: { label: '终态附着生产者', unit: 'g C/m²' },
  finalPlanktonProducers: { label: '终态浮游生产者', unit: 'g C/m²' },
  finalGrazers: { label: '终态草食群', unit: 'g C/m²' },
  finalPlanktivores: { label: '终态浮游摄食群', unit: 'g C/m²' },
  finalPredators: { label: '终态捕食群', unit: 'g C/m²' },
  finalDetritus: { label: '终态碎屑', unit: 'g C/m²' },
  finalDecomposers: { label: '终态分解群', unit: 'g C/m²' },
  finalProducers: { label: '终态两类生产者合计', unit: 'g C/m²' },
  finalTotalOrganicC: { label: '终态全部有机碳', unit: 'g C/m²' },
  cumulativePrimaryProductionC: { label: '累计光合固定碳输入', unit: 'g C/m²' },
  cumulativeExternalInputC: { label: '累计外部有机碳输入', unit: 'g C/m²' },
  cumulativeRespirationOutputC: { label: '累计呼吸有机碳流出', unit: 'g C/m²' },
  cumulativeExchangeOutputC: { label: '累计水体交换有机碳流出', unit: 'g C/m²' },
  cumulativeHarvestOutputC: { label: '累计移除有机碳流出', unit: 'g C/m²' },
  cumulativeRecruitmentC: { label: '累计补充生物量代理', unit: 'g C/m²' },
  cumulativeMortalityC: { label: '累计死亡转入碎屑', unit: 'g C/m²' },
};
const sum = (values) => Object.values(values).reduce((result, value) => result + value, 0);
const direction = (difference) => Math.abs(difference) <= 1e-9 ? 'unchanged' : difference < 0 ? 'lower' : 'higher';

function keyMetrics(snapshot) {
  const b = snapshot.biomass;
  const l = snapshot.ledger;
  return {
    finalBenthicProducers: b.benthicProducers, finalPlanktonProducers: b.planktonProducers,
    finalGrazers: b.grazers, finalPlanktivores: b.planktivores, finalPredators: b.predators,
    finalDetritus: b.detritus, finalDecomposers: b.decomposers,
    finalProducers: snapshot.producers, finalTotalOrganicC: snapshot.totalOrganicC,
    cumulativePrimaryProductionC: l.primaryProductionC, cumulativeExternalInputC: l.externalInputC,
    cumulativeRespirationOutputC: l.respirationOutputC, cumulativeExchangeOutputC: l.exchangeOutputC,
    cumulativeHarvestOutputC: l.harvestOutputC, cumulativeRecruitmentC: sum(l.recruitmentCByGroup),
    cumulativeMortalityC: sum(l.mortalityCByGroup),
  };
}

function run(seed, scenario = null) {
  const experiment = new PopulationExperiment({ seed, sampleEveryDays: 1 });
  const hash = createHash('sha256');
  const extrema = Object.fromEntries([...BIOMASS_POOLS, 'totalOrganicC'].map((pool) => [pool, { min: Infinity, max: -Infinity }]));
  const violations = [];
  let checkedStates = 0;
  let maxAbsCarbonBudgetErrorGCM2 = 0;
  const check = () => {
    checkedStates += 1;
    let totalOrganicC = 0;
    for (const pool of BIOMASS_POOLS) {
      const value = experiment.biomass[pool];
      if (!Number.isFinite(value) || value < 0) violations.push({ timeDays: experiment.timeDays, type: 'nonfinite-or-negative-biomass', pool, value });
      extrema[pool].min = Math.min(extrema[pool].min, value);
      extrema[pool].max = Math.max(extrema[pool].max, value);
      totalOrganicC += value;
    }
    extrema.totalOrganicC.min = Math.min(extrema.totalOrganicC.min, totalOrganicC);
    extrema.totalOrganicC.max = Math.max(extrema.totalOrganicC.max, totalOrganicC);
    const error = Math.abs(experiment.carbonBudgetError);
    maxAbsCarbonBudgetErrorGCM2 = Math.max(maxAbsCarbonBudgetErrorGCM2, error);
    if (!Number.isFinite(error) || error > carbonToleranceGCM2) violations.push({ timeDays: experiment.timeDays, type: 'carbon-budget-error', error });
    if (experiment.timeDays <= interventionDay) {
      // Check every internal step, including its complete cumulative ledger.
      hash.update(`${JSON.stringify([experiment.timeDays, experiment.biomass, experiment.ledger])}\n`);
    }
  };
  check();
  for (let tick = 0; tick < ticks; tick += 1) {
    if (scenario && tick === interventionTick) experiment.setEnvironment(scenario.intervention);
    experiment.stepDays(EXPERIMENT_TIME_STEP_DAYS);
    check();
  }
  const data = experiment.exportData();
  const finiteNonnegative = !violations.some((entry) => entry.type === 'nonfinite-or-negative-biomass');
  const carbonBudgetBalanced = !violations.some((entry) => entry.type === 'carbon-budget-error');
  return {
    id: `seed-${seed}-${scenario?.id ?? 'baseline'}`, seed, scenario: scenario?.id ?? 'baseline',
    initialBiomass: data.initialBiomass, finalEnvironment: data.environment,
    interventions: data.interventions,
    final: data.current, keyMetrics: keyMetrics(data.current), curve: data.curve,
    preIntervention: { throughDay: interventionDay, checkedStates: interventionTick + 1, stateAndLedgerSha256: hash.digest('hex') },
    validation: {
      checkedStates, checkedEveryDays: EXPERIMENT_TIME_STEP_DAYS,
      finiteNonnegative, carbonBudgetBalanced, carbonToleranceGCM2, maxAbsCarbonBudgetErrorGCM2,
      durationCorrect: data.current.timeDays === durationDays && data.pendingDays === 0,
      extrema, violations,
    },
  };
}

const started = performance.now();
const runs = [];
const comparisons = [];
for (const seed of seeds) {
  const baseline = run(seed);
  runs.push(baseline);
  for (const scenario of scenarios) {
    const perturbed = run(seed, scenario);
    runs.push(perturbed);
    const differences = Object.fromEntries(Object.keys(metricDefinitions).map((metric) => {
      const baselineValue = baseline.keyMetrics[metric];
      const perturbedValue = perturbed.keyMetrics[metric];
      const difference = perturbedValue - baselineValue;
      return [metric, { baseline: baselineValue, perturbed: perturbedValue, difference, direction: direction(difference), unit: metricDefinitions[metric].unit }];
    }));
    const initialBiomassIdentical = JSON.stringify(baseline.initialBiomass) === JSON.stringify(perturbed.initialBiomass);
    const preInterventionStateAndLedgerIdentical = baseline.preIntervention.stateAndLedgerSha256 === perturbed.preIntervention.stateAndLedgerSha256;
    const history = (record) => record.curve.rows.filter((row) => row[0] <= interventionDay);
    const preInterventionDailyCurveIdentical = JSON.stringify(history(baseline)) === JSON.stringify(history(perturbed));
    comparisons.push({
      seed, scenario: scenario.id, baselineRun: baseline.id, perturbedRun: perturbed.id,
      interventionDay, intervention: scenario.intervention,
      initialBiomassIdentical, preInterventionStateAndLedgerIdentical, preInterventionDailyCurveIdentical,
      differences,
    });
    console.log(`seed ${seed}, ${scenario.id}: ${durationDays} simulated days; pre-intervention identical ${initialBiomassIdentical && preInterventionStateAndLedgerIdentical && preInterventionDailyCurveIdentical}; ${perturbed.validation.violations.length} numeric violations`);
  }
}

const aggregates = scenarios.map((scenario) => {
  const matches = comparisons.filter((entry) => entry.scenario === scenario.id);
  const metrics = Object.fromEntries(Object.keys(metricDefinitions).map((metric) => {
    const values = matches.map((entry) => entry.differences[metric]);
    const counts = { lower: 0, higher: 0, unchanged: 0 };
    for (const value of values) counts[value.direction] += 1;
    return [metric, {
      ...metricDefinitions[metric], directionCounts: counts,
      minimumDifference: Math.min(...values.map((value) => value.difference)),
      maximumDifference: Math.max(...values.map((value) => value.difference)),
      meanDifference: values.reduce((result, value) => result + value.difference, 0) / values.length,
    }];
  }));
  const observations = scenario.focusMetrics.map((metric) => {
    const counts = metrics[metric].directionCounts;
    const words = { lower: '低于基线', higher: '高于基线', unchanged: '与基线相同（差值阈值内）' };
    const unanimous = Object.keys(counts).find((key) => counts[key] === seeds.length);
    return {
      metric,
      statement: unanimous
        ? `${scenario.label}：${seeds.length}/${seeds.length} 个 seed 的${metricDefinitions[metric].label}${words[unanimous]}。`
        : `${scenario.label}：${metricDefinitions[metric].label}有 ${counts.lower} 个 seed 低于基线、${counts.higher} 个高于、${counts.unchanged} 个在相同阈值内。`,
      evidence: 'Computed from these paired runs only; final stocks are evaluated on simulated day 365, cumulative fluxes over days 0–365.',
    };
  });
  return { scenario: scenario.id, label: scenario.label, metrics, observations };
});

const numericViolations = runs.reduce((result, entry) => result + entry.validation.violations.length, 0);
const mismatchedPairs = comparisons.filter((entry) => !entry.initialBiomassIdentical || !entry.preInterventionStateAndLedgerIdentical || !entry.preInterventionDailyCurveIdentical);
const sourceBytes = await readFile(new URL('../src/ecology/PopulationExperiment.js', import.meta.url));
const report = {
  schema: 'tidal-population-batch-validation-v1', generatedAt: new Date().toISOString(),
  mode: 'independent long-term functional-group biomass experiment',
  simulatedTimeUnit: 'day', modelMonthDays: EXPERIMENT_MONTH_DAYS, biomassUnit: 'g organic C/m²',
  durationDaysPerRun: durationDays, interventionDay, fixedStepDays: EXPERIMENT_TIME_STEP_DAYS,
  exportedCurveEveryDays: 1, seeds, scenarios, metricDefinitions,
  parameters: { ...DEFAULT_POPULATION_PARAMETERS }, baselineEnvironment: { ...DEFAULT_POPULATION_ENVIRONMENT },
  modelImplementationSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  sources: MODEL_SOURCES,
  limitations: [
    '教学用功能群模型；参数未校准于具名物种或真实礁区，不能用于野外种群预测。',
    '365 天是模型模拟时间，30 天是明确的模型月；本脚本不运行实时 3D 模型，也不验证浏览器实际运行时长、WebGL 或帧率。',
    'seed 只扰动初始存量；5 个 seed 不是参数不确定性、观测误差或预测置信区间的完整分析。',
    '出生仅用同化碳中的补充生物量代理表示，未建年龄阶段或真实个体出生数量。',
    '碳账本仅涵盖有机碳池；无机碳、溶解营养盐和氧气状态未建模。',
    '浮游摄食群消费模型浮游生产者；它不是具名的浮游动物食性鱼类，模型没有浮游动物池。',
    '方向声明由本次配对结果生成；终态方向只代表第 365 天，不保证各时点单调，也不保证换参数后相同。',
    '数值有界性仅报告本次配置的每步极值，模型没有强制平衡、硬容量截断或自动补回消费者。',
  ],
  directionDifferenceToleranceGCM2: 1e-9,
  summary: {
    runs: runs.length, pairedComparisons: comparisons.length,
    numericViolations, mismatchedPreInterventionPairs: mismatchedPairs.length,
    everyRunFiniteNonnegative: runs.every((entry) => entry.validation.finiteNonnegative),
    everyRunCarbonBudgetBalanced: runs.every((entry) => entry.validation.carbonBudgetBalanced),
    everyRunDurationCorrect: runs.every((entry) => entry.validation.durationCorrect),
    maxAbsCarbonBudgetErrorGCM2: Math.max(...runs.map((entry) => entry.validation.maxAbsCarbonBudgetErrorGCM2)),
    totalOrganicCRangeGCM2: {
      minimum: Math.min(...runs.map((entry) => entry.validation.extrema.totalOrganicC.min)),
      maximum: Math.max(...runs.map((entry) => entry.validation.extrema.totalOrganicC.max)),
    },
    numericAndPairingChecksPassed: numericViolations === 0 && mismatchedPairs.length === 0 && runs.every((entry) => entry.validation.durationCorrect),
  },
  aggregates, comparisons, runs,
  executionWallTimeSec: (performance.now() - started) / 1000,
};
await mkdir(new URL('../output/validation/', import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: fileURLToPath(outputUrl), ...report.summary, executionWallTimeSec: report.executionWallTimeSec }, null, 2));
if (!report.summary.numericAndPairingChecksPassed) process.exitCode = 1;
