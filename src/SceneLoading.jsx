import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { sceneLoadingProgress } from './sceneLoadingProgress.js';
import { ExperienceNavigation } from './ExperienceNavigation.jsx';
import './sceneLoading.css';
import { captureShallowEntryDiagnostics } from './shallowEntryDiagnostics.js';

const preparationLabels = {
  geometry: '准备礁体',
  scene: '布置场景',
  textures: '准备材质与贴图',
  render: '准备首幅画面',
};

// This view reports completed work, never an estimated percentage or deadline.
// Its subscription disappears when the scene replaces the loading view.
export function SceneLoading({ experience = 'world', phase = 'opening', error = '' }) {
  const loading = useSyncExternalStore(sceneLoadingProgress.subscribe, sceneLoadingProgress.getSnapshot, sceneLoadingProgress.getSnapshot);
  const [entryDiagnostics,setEntryDiagnostics]=useState(()=>captureShallowEntryDiagnostics());
  useEffect(()=>{const update=()=>setEntryDiagnostics(captureShallowEntryDiagnostics());update();
    const interval=setInterval(update,1000);return()=>clearInterval(interval);
  },[]);
  const shallow = experience === 'journey' || experience === 'sample' || experience === 'school';
  const base = import.meta.env.BASE_URL;
  const activeStep = phase !== 'opening' ? 2 : loading.started > 0 ? 1 : 0;
  const status = preparationLabels[phase] || (loading.started > 0 ? '正在下载并准备模型' : '正在打开体验');
  return <section className={`scene-loading${shallow ? ' has-preview' : ''}${error ? ' has-error' : ''}`} aria-label={error ? '场景加载错误' : '场景加载'}>
    <output id="scene-loading-diagnostics" hidden>{JSON.stringify(entryDiagnostics)}</output>
    {phase === 'opening' && <ExperienceNavigation research={!shallow}/>}
    {shallow && <img className="scene-loading-preview" src={`${base}overview/stage-04/after-96.jpg`} alt="" decoding="async"/>}
    <div className="scene-loading-content">
      <div className="scene-loading-brand">TIDAL <span>海底世界</span></div>
      <p className="scene-loading-eyebrow">{experience === 'school' ? '乌尾鮗协同观察 · 连续60秒' : experience === 'journey' ? '4分钟浅海体验 · 三个栖息地' : experience === 'sample' ? '浅海样板 · 连续巡游75秒' : '观察生命，探索海洋'}</p>
      <h1>{error ? '场景未能加载' : shallow ? '即将进入这片浅海' : '正在打开海底世界'}</h1>
      <p className="scene-loading-intro">{error ? '请检查网络后重新载入。已保存的探索记录会保留。' : shallow ? '准备完成后自动开始巡游。你可以沿途观察，也可以随时暂停。' : '正在准备这片海域，完成后即可进入观察与探索。'}</p>
      {error ? <div className="scene-loading-error" role="alert">{error}</div> : <div className="scene-loading-status">
        <ol aria-label="加载阶段">{['打开体验', '下载模型', '准备画面'].map((label, index) => <li key={label} className={index < activeStep ? 'is-complete' : ''} aria-current={index === activeStep ? 'step' : undefined}><span>{index < activeStep ? '✓' : `0${index + 1}`}</span>{label}</li>)}</ol>
        <p className="scene-loading-current" role="status">{status}…</p>
        {phase === 'opening' && loading.started > 0 ? <p className="scene-loading-count">模型准备 {loading.complete} / {loading.started} 项 · 已接收 {(loading.bytes / 1048576).toFixed(1)} MB</p> : <p className="scene-loading-count">{phase === 'opening' ? '首次访问需要下载场景资源，后续访问可使用浏览器缓存。' : '正在完成场景显示准备，巡游计时尚未开始。'}</p>}
      </div>}
      {experience === 'journey' && <p className="scene-loading-route">礁谷 <span>→</span> 沙道 <span>→</span> 草床 <small>进入后可开启中文讲解 · 展开控制可自由探索</small></p>}
      {experience === 'school' && <p className="scene-loading-route">遇礁分流 → 汇合 → 受扰散开 → 重新聚集<small>沿用浅海路线的前60秒 · 展开控制可跳段和自由观察</small></p>}
      <div className="scene-loading-actions">
        {error && <button onClick={() => window.location.reload()}>重新载入</button>}
        <a href={`${base}overview/`}>返回产品导览</a>
        {!error && <details><summary>长时间未出现画面？</summary><p>首次下载和画面准备会受到网络与设备影响。如果进度长时间没有变化，可检查网络后重新载入。</p><button onClick={() => window.location.reload()}>重新载入</button></details>}
      </div>
      {shallow && <p className="scene-loading-caption">背景为本项目实景预览，当前画面尚未开始播放。</p>}
    </div>
  </section>;
}
