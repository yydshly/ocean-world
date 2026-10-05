import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BIOMASS_POOLS, MODEL_SOURCES, runPairedExperiment } from './ecology/PopulationExperiment.js';
import { saveJson } from './capture.js';
import './population.css';
import { EcologyModelSwitch } from './AgeWorkbench.jsx';

const labels={benthicProducers:'附着生产者',planktonProducers:'浮游生产者',grazers:'草食群',planktivores:'浮游摄食群',predators:'捕食群',detritus:'碎屑',decomposers:'分解群'};
const interventions={turbidity:{label:'浑浊度增加',patch:{turbidityIndex:.85},detail:'光照减弱，先降低光合输入，再沿食物关系传播。'},food:{label:'浮游输入减半',patch:{planktonInputMultiplier:.5},detail:'改变外部浮游生产者输入；模型中的浮游摄食群不是某一种鱼。'},harvest:{label:'捕食群持续移除',patch:{predatorHarvestPerDay:.02},detail:'每天移除当前捕食群生物量的 2%，同时记录系统外流。'},dark:{label:'停止光合',patch:{lightMultiplier:0},detail:'光合输入设为零，外部有机碳输入仍然存在。'}};

function ComparisonPlot({result,pool}){
  const width=720,height=255,left=50,right=14,top=20,bottom=38;
  const column=result.baseline.curve.columns.indexOf(pool),curves=[result.baseline.curve.rows,result.perturbed.curve.rows];
  const maximum=Math.max(...curves.flatMap(rows=>rows.map(r=>r[column])),.1)*1.12;
  const x=day=>left+day/result.durationDays*(width-left-right),y=value=>height-bottom-value/maximum*(height-top-bottom);
  const line=rows=>rows.map((r,i)=>`${i?'L':'M'}${x(r[0]).toFixed(2)},${y(r[column]).toFixed(2)}`).join(' ');
  return <svg className="population-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${labels[pool]}的基线与干预生物量曲线，横轴模拟天，纵轴克有机碳每平方米`}>
    {[0,.25,.5,.75,1].map(v=><g key={v}><line x1={left} y1={y(v*maximum)} x2={width-right} y2={y(v*maximum)} stroke="#c4d6c621"/><text x={left-9} y={y(v*maximum)+4} textAnchor="end">{(v*maximum).toFixed(1)}</text></g>)}
    {[0,.25,.5,.75,1].map(v=><text key={v} x={x(v*result.durationDays)} y={height-14} textAnchor="middle">{Math.round(v*result.durationDays)}</text>)}
    <line x1={x(result.interventionDay)} x2={x(result.interventionDay)} y1={top} y2={height-bottom} stroke="#e8d8b080" strokeDasharray="4 5"/><text x={x(result.interventionDay)+7} y={top+10}>第 {result.interventionDay} 天干预</text>
    <path d={line(curves[0])} stroke="#9ac8c0" fill="none" strokeWidth="2.5"/><path d={line(curves[1])} stroke="#e9c18a" fill="none" strokeWidth="2.5"/>
    <text x={left} y={11}>g C/m²</text><text x={width-right} y={height-1} textAnchor="end">模拟天</text>
  </svg>;
}

export function PopulationWorkbench({onClose,onToast,onModelChange,onReady,onFailure}){
  const callbacks=useRef({onReady,onFailure});
  callbacks.current={onReady,onFailure};
  const[seed,setSeed]=useState('42'),[scenario,setScenario]=useState('turbidity'),[duration,setDuration]=useState(365),[pool,setPool]=useState('benthicProducers'),[result,setResult]=useState(()=>runPairedExperiment());
  useEffect(()=>{callbacks.current.onReady?.(result);},[result]);
  const run=()=>setResult(runPairedExperiment({seed,durationDays:duration,interventionDay:90,intervention:interventions[scenario].patch}));
  const chosen=useMemo(()=>Object.keys(interventions).find(k=>JSON.stringify(interventions[k].patch)===JSON.stringify(result.intervention))||'turbidity',[result]);
  const base=result.baseline.current,changed=result.perturbed.current,ledger=changed.ledger;
  const exportData=async()=>{try{const file=await saveJson(result,`population-seed-${result.seed}-${result.durationDays}days`);onToast(`长期实验已保存：${file}`);}catch(e){onToast(e.message);callbacks.current.onFailure?.(e);}};
  return <section className="population-workbench glass" aria-label="长期生态实验工作台">
    <div className="panel-heading"><div><p className="eyebrow">ECOLOGICAL TIMESCALES</p><h2>看见一个变化，如何传遍食物网。</h2></div><button onClick={onClose}>回到观察</button></div>
    <EcologyModelSwitch value="foodweb" onChange={onModelChange}/>
    <p className="population-intro">从相同初始状态出发，在第 90 个模拟天改变一个条件。对照组保持基线环境，比较之后的演化。</p>
    <div className="population-layout">
      <div className="population-results">
        <div className="population-chart-heading"><label htmlFor="population-pool">观察对象</label><select id="population-pool" value={pool} onChange={e=>setPool(e.target.value)}>{BIOMASS_POOLS.map(key=><option key={key} value={key}>{labels[key]}</option>)}</select><span>种子 {result.seed} · {result.durationDays} 天</span></div>
        <ComparisonPlot result={result} pool={pool}/><p className="population-legend"><span>基线</span><span>干预</span></p>
        <div className="population-explanation"><strong>{interventions[chosen].label}</strong><p>{interventions[chosen].detail}</p><small>当前图中的差异来自模型通量与反馈，没有强制恢复同一个平衡。</small></div>
        <table className="biomass-table"><caption>第 {result.durationDays} 天的有机碳存量 · g C/m²</caption><thead><tr><th>功能群 / 存量</th><th>基线</th><th>干预</th><th>变化</th></tr></thead><tbody>{BIOMASS_POOLS.map(key=>{const d=changed.biomass[key]-base.biomass[key];return <tr key={key}><th>{labels[key]}</th><td>{base.biomass[key].toFixed(2)}</td><td>{changed.biomass[key].toFixed(2)}</td><td className={d<0?'negative':'positive'}>{d>=0?'+':''}{d.toFixed(2)}</td></tr>;})}</tbody></table>
      </div>
      <aside className="population-settings" aria-label="长期实验设置">
        <label htmlFor="population-seed">随机种子<input id="population-seed" value={seed} onChange={e=>setSeed(e.target.value)}/></label>
        <label htmlFor="population-scenario">第 90 天的干预<select id="population-scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>{Object.entries(interventions).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
        <label htmlFor="population-duration">实验总时长<select id="population-duration" value={duration} onChange={e=>setDuration(+e.target.value)}>{[[180,'180 天 · 6 个模型月'],[365,'365 天 · 1 个模型年'],[730,'730 天 · 2 个模型年']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button className="export-data" onClick={run}>运行同种子对照</button>
        <section className="carbon-ledger"><h3>干预组 · 有机碳账本</h3><dl>{[['初始存量',ledger.initialOrganicC],['光合输入',ledger.primaryProductionC],['外部输入',ledger.externalInputC],['呼吸流出',ledger.respirationOutputC],['水体交换流出',ledger.exchangeOutputC],['移除流出',ledger.harvestOutputC],['当前存量',changed.totalOrganicC]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toFixed(2)}</dd></div>)}</dl><p>账本误差 {changed.carbonBudgetError.toExponential(1)} g C/m²</p></section>
        <button className="export-data" onClick={exportData}>导出曲线、参数和账本</button>
        <p className="model-note">此工作台使用独立的概念性礁区功能群模型。参数是教学示例；结果不代表当前画面中的物种数量。1 个模型月 = 30 天，补充生物量不能解释成出生条数。</p>
        <details className="population-sources"><summary>机制依据与范围</summary><p>摄食饱和、密度反馈和底物限制的形式有原始研究依据。当前数值未经野外校准，营养盐、氧气和无机碳不在本账本内。</p>{MODEL_SOURCES.map(source=><a key={source.doi} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</details>
      </aside>
    </div>
  </section>;
}

