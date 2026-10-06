import React, { useEffect, useRef } from 'react';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from './sceneCatalog.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';
import { DEMO_WORLDS, DEMO_LIVING_STOPS, DEMO_KELP_STOPS, DEMO_LEGACY_VIEWS, DEMO_CURRENT_TOOLS,
  DEMO_RECORD_TOOLS, DEMO_WORKBENCHES, demoLayerEntries, demoNeedsSceneChange } from './demoCapabilities.js';
import './demoOverview.css';

const finite = value => Number.isFinite(value) ? value : null;

function CapabilityButton({ entry, onChoose, disabled, selected = false, compact = false }) {
  return <button type="button" className={`demo-capability${compact ? ' demo-capability-compact' : ''}`}
    disabled={disabled} aria-pressed={selected} onClick={() => onChoose(entry.action)}>
    {entry.number && <span className="demo-item-number" aria-hidden="true">{entry.number}</span>}
    <span className="demo-item-copy"><strong>{entry.title}</strong><span>{entry.description}</span></span>
    <span className="demo-item-arrow" aria-hidden="true">↗</span>
  </button>;
}

export function DemoOverview({ onChoose, onClose, onStartDirector, worldReady, recording = false,
  currentBiome = 'reef', currentProfile = LIVING_SHALLOWS_PROFILE, snapshot, pending = false, notice = '' }) {
  const heading = useRef(null);
  const living = currentBiome === 'reef' && currentProfile === LIVING_SHALLOWS_PROFILE;
  const currentWorld = DEMO_WORLDS.find(item => item.biome === currentBiome &&
    (item.biome !== 'reef' || item.profile === currentProfile));
  const ocean = snapshot?.ocean;
  const metrics = ocean?.ecology?.metrics;
  const recordCount = finite(metrics?.activeIndividuals);
  const aliveCount = finite(metrics?.alive);
  const regionCount = finite(metrics?.activeRegions);
  const loadingCount = finite(metrics?.loadingRegions);
  const catalogCount = (living ? livingShallowsSpeciesCatalog : sceneCatalogs[currentBiome])?.length ?? 0;
  const layers = demoLayerEntries(currentBiome);
  const ready = !!worldReady;
  const disabled = entry => (entry.action.kind !== 'world' && !ready) || (recording && demoNeedsSceneChange(entry.action));

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  return <section className="demo-overview glass" role="dialog" aria-modal="false"
    aria-labelledby="demo-overview-title" aria-describedby="demo-overview-intro"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="demo-overview-heading">
      <div><p className="eyebrow">EXPLORE THE CURRENT OCEAN</p>
        <h2 id="demo-overview-title" ref={heading} tabIndex={-1}>能力总览</h2></div>
      <button type="button" className="demo-close" onClick={onClose}>回到观察 <span aria-hidden="true">×</span></button>
    </header>
    <p id="demo-overview-intro" className="demo-intro">先看四类海域 → 宏观地貌 → 生物与环境 → 工作台与记录。选择入口进入实际场景，随时从顶部“能力总览”返回。</p>

    <div className="demo-director-entry">
      <button type="button" disabled={recording} aria-describedby="demo-director-intro" onClick={onStartDirector}>
        <span aria-hidden="true">▶</span>一键导演演示
      </button>
      <p id="demo-director-intro">约 7 分半，镜头前进、转向和升降，依次巡游各观察点并展示现有工具。跨海域时切换场景，可暂停、跳章或退出。</p>
    </div>

    <div className="demo-current-status" role="status" aria-live="polite">
      <span className={`demo-status-dot${ready ? ' is-ready' : ''}`} aria-hidden="true"/>
      <strong>{ready ? `当前 · ${currentWorld?.title || '海域'}` : '海域加载中'}</strong>
      {ready && <span>{catalogCount} 个目录条目</span>}
      {ready && ocean?.exploring && recordCount !== null && <span>活动窗口 {regionCount ?? '—'} 区 · {recordCount} 条记录{aliveCount !== null ? ` / ${aliveCount} 活体` : ''}</span>}
      {ready && !ocean?.exploring && <span>当前为固定观察点</span>}
      {ready && loadingCount > 0 && <span>还有 {loadingCount} 区正在加载</span>}
    </div>
    {(pending || notice) && <p className="demo-loading-note" role="status">{notice || '正在加载对应海域…'}</p>}
    {recording && <p className="demo-recording-note" role="status">正在录像。请先结束录像，再切换海域或地貌观察点。</p>}

    <section className="demo-section" aria-labelledby="demo-worlds-title">
      <div className="demo-section-heading"><h3 id="demo-worlds-title"><span>1</span> 四类海域</h3><p>每类进入对应的真实探索海域</p></div>
      <div className="demo-world-grid">{DEMO_WORLDS.map(item => {
        const selected = item.id === currentWorld?.id;
        const count = (item.profile === LIVING_SHALLOWS_PROFILE ? livingShallowsSpeciesCatalog : sceneCatalogs[item.biome]).length;
        return <button key={item.id} type="button" className="demo-world-card" data-world={item.id}
          disabled={disabled(item)} aria-pressed={selected} onClick={() => onChoose(item.action)}>
          <span className="demo-world-top"><span className="demo-world-number">{item.number}</span><span>{selected ? '当前海域' : `${count} 个目录条目`}</span></span>
          <strong>{item.title}</strong><span className="demo-world-tag">{item.tag}</span>
          <p>{item.description}</p><span className="demo-world-enter">进入探索 <span aria-hidden="true">↗</span></span>
        </button>;
      })}</div>
      <div className="demo-legacy-views"><span>原浅礁固定视角</span>{DEMO_LEGACY_VIEWS.map(item =>
        <button key={item.id} type="button" disabled={disabled(item)} onClick={() => onChoose(item.action)}>{item.title}</button>)}</div>
    </section>

    <section className="demo-section" aria-labelledby="demo-landforms-title">
      <div className="demo-section-heading"><h3 id="demo-landforms-title"><span>2</span> 宏观地貌与生活带</h3><p>{DEMO_LIVING_STOPS.length + DEMO_KELP_STOPS.length} 个观察点直达</p></div>
      <p className="demo-section-note">这些按钮直接进入观察点；沿途探索使用场景内的航行、路线与自由移动。地形取决于种子、适宜条件和已有存档。</p>
      <div className="demo-stops-grid">{DEMO_LIVING_STOPS.map(item =>
        <CapabilityButton key={item.id} entry={item} onChoose={onChoose} disabled={disabled(item)} compact/>)}</div>
      <p className="demo-section-note">巨藻林生活带：适宜的新区域连接高巨藻、林下植物和天然沉积空隙；已有区域读取原存档。</p>
      <div className="demo-stops-grid">{DEMO_KELP_STOPS.map(item =>
        <CapabilityButton key={item.id} entry={item} onChoose={onChoose} disabled={disabled(item)} compact/>)}</div>
    </section>

    <section className="demo-section" aria-labelledby="demo-life-title">
      <div className="demo-section-heading"><h3 id="demo-life-title"><span>3</span> 生物与环境</h3><p>读取当前海域的真实状态</p></div>
      <div className="demo-tools-grid">{DEMO_CURRENT_TOOLS.map(item =>
        <CapabilityButton key={item.id} entry={item} onChoose={onChoose} disabled={disabled(item)}/>)}</div>
      <div className="demo-layers" role="group" aria-label={currentBiome === 'deep' ? '总览近底观察高度' : '总览观察水层'}>
        <span>{currentBiome === 'deep' ? '近底观察高度' : '观察水层'}</span>{layers.map(item =>
          <button key={item.id} type="button" disabled={!ready} aria-pressed={(ocean?.observationLayer || 'bed') === item.id}
            onClick={() => onChoose(item.action)}>{item.title}</button>)}
        <small>{currentBiome === 'deep' ? '改变观察器离底高度' : '保持当前水平位置'}</small>
      </div>
    </section>

    <section className="demo-section" aria-labelledby="demo-record-title">
      <div className="demo-section-heading"><h3 id="demo-record-title"><span>4</span> 工作台与记录</h3><p>长期实验独立于 3D 生态</p></div>
      <div className="demo-tools-grid">{DEMO_WORKBENCHES.map(item =>
        <CapabilityButton key={item.id} entry={item} onChoose={onChoose} disabled={false}/>)}</div>
      <div className="demo-tools-grid demo-record-tools">{DEMO_RECORD_TOOLS.map(item =>
        <CapabilityButton key={item.id} entry={item} onChoose={onChoose} disabled={!ready}/>)}</div>
    </section>

    <footer className="demo-scope"><p>生物按实际生境分布，附近为空或个体死亡后不会为展示补生；目录含物种、类群和代理，不代表全部生物同屏。</p>
      <p>工作台结果不改动 3D 群落。存档、观察点和发现记录保存在当前浏览器来源；线上与本机使用独立存档。</p></footer>
  </section>;
}
