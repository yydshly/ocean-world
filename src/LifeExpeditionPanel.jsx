import React from 'react';

const habitats = { reef: '礁谷', sand: '沙沟', meadow: '草床边缘', slope: '外礁坡' };
export function LifeExpeditionPanel({ report, catalog = [], active = false, onObserve }) {
  if (!report) return <p className="life-expedition-summary">正在准备整片海区与连续路线…</p>;
  const names = new Map(catalog.map(s => [s.id, s.commonName]));
  const local = active ? (report.nearby ?? []).filter((a, i, rows) => rows.findIndex(b => b.speciesId === a.speciesId) === i).slice(0, 3) : [];
  return <div className="life-expedition-notes" aria-label="生命巡游记录">
    <p className="life-expedition-summary">{habitats[report.habitat] || '海区入口'} · 已前进 {Math.round(report.travelledM || 0)} m · 途中附近出现 {report.speciesIds?.length || 0} 类动物</p>
    <div className="life-expedition-habitats" aria-label="已经过的生境">{Object.entries(habitats).map(([id, label]) => <span key={id} data-visited={report.habitats?.includes(id) || false}>{label}</span>)}</div>
    {active && <div className="life-expedition-animals" aria-label="附近实际动物">{local.length ? local.map(a => <button type="button" key={a.id} onClick={() => onObserve?.(a.id)} title="退出巡游，跟随这个实际个体">{names.get(a.speciesId) || a.speciesId}<span>{a.distanceM.toFixed(1)} m · 跟随观察 ↗</span></button>) : <p>继续沿海床观察，附近有动物时会在这里出现。</p>}</div>}
  </div>;
}
