import React, { useEffect, useRef, useState } from 'react';
import { AGE_MODEL_SOURCES } from './ecology/AgeStructuredExperiment.js';
import { saveJson } from './capture.js';
import './population.css';

const scenarios = {
  food: { label: '停止食物输入', patch: { foodInputMultiplier: 0 }, detail: '已有食物和成体储备仍可短期支付出生；随后由实际摄取、维持和储备决定变化。' },
  juvenile: { label: '幼体获取食物减半', patch: { juvenileFoodAccessMultiplier: .5 }, detail: '幼体的摄食请求降低。成熟同时需要年龄和体型达标，食物不足可能推迟成熟。' },
  adult: { label: '成体获取食物减半', patch: { adultFoodAccessMultiplier: .5 }, detail: '成体的摄食请求降低。每次出生必须由成体实际储备支付，幼体不能繁殖。' },
  harvest: { label: '持续移除成体', patch: { adultHarvestPerDay: .02 }, detail: '成体的移除风险为每天 0.02；移出的个体密度、结构和储备一起离开系统，并单独记账。' },
};
const series = {
  juvenileDensityM2: { label: '幼体密度', unit: '预期个体/m²' },
  adultDensityM2: { label: '成体密度', unit: '预期个体/m²' },
  birthsExpectedM2: { label: '累计出生密度', unit: '预期个体/m²' },
  maturationsExpectedM2: { label: '累计成熟密度', unit: '预期个体/m²' },
  deathsExpectedM2: { label: '累计自然死亡密度', unit: '预期个体/m²' },
  juvenileBiomassC: { label: '幼体有机碳', unit: 'g C/m²' },
  adultBiomassC: { label: '成体有机碳', unit: 'g C/m²' },
  foodC: { label: '食物有机碳', unit: 'g C/m²' },
};
function AgePlot({ result, metric }) {
  const w = 720, h = 255, left = 53, right = 16, top = 23, bottom = 38;
  const index = result.baseline.curve.columns.indexOf(metric);
  const curves = [result.baseline.curve.rows, result.perturbed.curve.rows];
  const max = Math.max(.1, ...curves.flatMap(rows => rows.map(r => r[index]))) * 1.1;
  const x = day => left + day / result.durationDays * (w-left-right);
  const y = value => h-bottom-value/max*(h-top-bottom);
  const path = rows => rows.map((r,i) => `${i?'L':'M'}${x(r[0]).toFixed(2)},${y(r[index]).toFixed(2)}`).join(' ');
  return <svg className="population-plot" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${series[metric].label}的同种子对照，横轴模拟天，纵轴${series[metric].unit}`}>
    {[0,.25,.5,.75,1].map(v=><g key={v}><line x1={left} x2={w-right} y1={y(v*max)} y2={y(v*max)} stroke="#c4d6c621"/><text x={left-8} y={y(v*max)+4} textAnchor="end">{(v*max).toFixed(1)}</text><text x={x(v*result.durationDays)} y={h-13} textAnchor="middle">{Math.round(v*result.durationDays)}</text></g>)}
    <line x1={x(result.interventionDay)} x2={x(result.interventionDay)} y1={top} y2={h-bottom} stroke="#e8d8b080" strokeDasharray="4 5"/>
    <text x={x(result.interventionDay)+6} y={top+11}>第 {result.interventionDay} 天干预</text>
    <path d={path(curves[0])} fill="none" stroke="#9ac8c0" strokeWidth="2.5"/><path d={path(curves[1])} fill="none" stroke="#e9c18a" strokeWidth="2.5"/>
    <text x={left} y={12}>{series[metric].unit}</text><text x={w-right} y={h-1} textAnchor="end">模拟天</text>
  </svg>;
}
const formatDensity = value => value === 0 ? '0' : Math.abs(value) < .001 ? value.toExponential(2) : value.toFixed(3);
export function EcologyModelSwitch({ value, onChange }) {
  return <div className="ecology-model-switch" role="group" aria-label="长期模型类型">
    <button className={value==='foodweb'?'selected':''} onClick={()=>onChange('foodweb')}>食物网通量</button>
    <button className={value==='age'?'selected':''} onClick={()=>onChange('age')}>出生与成熟</button>
  </div>;
}
export function AgeWorkbench({ onClose, onToast, onModelChange, onReady, onFailure }) {
  const worker = useRef(null), nextRequest = useRef(0), activeRequest = useRef(0);
  const callbacks = useRef({ onReady, onFailure });
  callbacks.current = { onReady, onFailure };
  const [seed,setSeed] = useState('42'), [scenario,setScenario] = useState('food'), [duration,setDuration] = useState(365), [metric,setMetric] = useState('juvenileDensityM2');
  const [result,setResult] = useState(null), [busy,setBusy] = useState(true), [error,setError] = useState(null);
  useEffect(()=>{
    const w = new Worker(new URL('./ecology/ageExperimentWorker.js', import.meta.url), {type:'module'});
    worker.current = w;
    w.onmessage = ({data}) => {
      if(data.requestId!==activeRequest.current)return;
      setBusy(false);setError(data.error||null);
      if(data.error)callbacks.current.onFailure?.(data.error);
      if(data.result){setResult(data.result);callbacks.current.onReady?.(data.result);}
    };
    w.onerror = () => {const message='实验计算未完成，请重新运行。';setBusy(false);setError(message);callbacks.current.onFailure?.(message);};
    const requestId=++nextRequest.current;activeRequest.current=requestId;
    w.postMessage({requestId,options:{seed:'42',durationDays:365,interventionDay:90,intervention:scenarios.food.patch}});
    return()=>{w.terminate();worker.current=null;};
  },[]);
  const run = () => {
    if(!worker.current)return;
    const requestId=++nextRequest.current;activeRequest.current=requestId;setBusy(true);setError(null);
    worker.current.postMessage({requestId,options:{seed,durationDays:duration,interventionDay:90,intervention:scenarios[scenario].patch}});
  };
  const chosen = result ? Object.values(scenarios).find(s=>JSON.stringify(s.patch)===JSON.stringify(result.intervention)) : null;
  const current=result?.perturbed.current, base=result?.baseline.current, ledger=current?.ledger;
  const exportData=async()=>{try{const file=await saveJson(result,`age-seed-${result.seed}-${result.durationDays}days`);onToast(`出生与成熟实验已保存：${file}`);}catch(e){onToast(e.message);}};
  return <section className="population-workbench glass" aria-label="出生与成熟实验工作台">
    <div className="panel-heading"><div><p className="eyebrow">LIFE HISTORY</p><h2>食物如何影响出生与成熟。</h2></div><button onClick={onClose}>回到观察</button></div>
    <EcologyModelSwitch value="age" onChange={onModelChange}/>
    <p className="population-intro">一个匿名消费者的独立教学模型。出生消耗成体储备；幼体同时达到年龄和体型条件才成熟。数密度可为小数，单位为预期个体/m²。</p>
    <div className="population-layout"><div className="population-results">
      {busy&&<p className="experiment-status" role="status">正在计算同种子对照，海底观察继续运行…</p>}
      {error&&<p className="experiment-error" role="alert">{error}</p>}
      {result&&<>
        <div className="population-chart-heading"><label htmlFor="age-metric">观察指标</label><select id="age-metric" value={metric} onChange={e=>setMetric(e.target.value)}>{Object.entries(series).map(([key,s])=><option key={key} value={key}>{s.label}</option>)}</select><span>种子 {result.seed} · {result.durationDays} 天</span></div>
        <AgePlot result={result} metric={metric}/><p className="population-legend"><span>基线</span><span>干预</span></p>
        <div className="population-explanation"><strong>{chosen?.label}</strong><p>{chosen?.detail}</p><small>干预前状态{result.preInterventionEqual?'完全一致':'未能匹配'}。曲线来自实际资源收支与阶段转换。</small></div>
        <table className="biomass-table"><caption>第 {result.durationDays} 天 · 预期个体/m²</caption><thead><tr><th>阶段</th><th>基线</th><th>干预</th><th>变化</th></tr></thead><tbody>{[['juvenile','幼体'],['adult','成体']].map(([key,label])=>{const delta=current[key].densityM2-base[key].densityM2;return <tr key={key}><th>{label}</th><td>{formatDensity(base[key].densityM2)}</td><td>{formatDensity(current[key].densityM2)}</td><td>{delta>0?'+':''}{formatDensity(delta)}</td></tr>;})}</tbody></table>
        <div className="population-explanation age-ledger-note"><strong>成熟的两道条件</strong><p>最小年龄 {result.perturbed.parameters.minMaturityAgeDays} 模拟天；队列平均结构碳至少 {result.perturbed.parameters.maturityStructureGC.toFixed(2)} g C/模型个体。出生按 {result.perturbed.parameters.cohortBinDays} 天窗口合并，年龄判断可能保守延后一个窗口；食物与体型增长还可继续推迟成熟。</p></div>
      </>}
    </div><aside className="population-settings" aria-label="出生与成熟实验设置">
      <label htmlFor="age-seed">随机种子<input id="age-seed" value={seed} onChange={e=>setSeed(e.target.value)}/></label>
      <label htmlFor="age-scenario">第 90 天的干预<select id="age-scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>{Object.entries(scenarios).map(([key,s])=><option key={key} value={key}>{s.label}</option>)}</select></label>
      <label htmlFor="age-duration">实验总时长<select id="age-duration" value={duration} onChange={e=>setDuration(+e.target.value)}>{[180,365,730].map(n=><option key={n} value={n}>{n} 个模拟天</option>)}</select></label>
      <button className="export-data" disabled={busy} onClick={run}>{busy?'计算中…':'运行出生与成熟对照'}</button>
      {ledger&&<section className="carbon-ledger"><h3>干预组 · 有机碳账本 · g C/m²</h3><dl>{[['初始存量',ledger.initialOrganicC],['外部输入',ledger.externalInputC],['呼吸流出',ledger.respirationOutputC],['交换流出',ledger.exchangeOutputC],['移除流出',ledger.harvestOutputC],['当前存量',current.totalOrganicC]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toFixed(3)}</dd></div>)}</dl><p>碳误差 {current.carbonBudgetError.toExponential(1)} g C/m²<br/>幼体 / 成体人口平衡误差 {Object.values(current.demographicBudgetErrorM2).map(v=>v.toExponential(1)).join(' / ')} 预期个体/m²</p></section>}
      <button className="export-data" disabled={!result||busy} onClick={exportData}>导出生命周期曲线与账本</button>
      <p className="model-note">教学参数未经具名物种校准。此实验独立于当前三维生物和七池食物网，没有长度—碳量换算、卵阶段或野外丰度预测。</p>
      <details className="population-sources"><summary>机制依据与范围</summary><p>借鉴食物依赖的体型增长、阶段结构和储备分配机制。死亡回碎屑、采收流出，灭绝后不自动补回。</p>{AGE_MODEL_SOURCES.map(s=><a key={s.doi} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</details>
    </aside></div>
  </section>;
}
