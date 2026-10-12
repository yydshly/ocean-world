import React, { lazy, Suspense } from 'react';
const OceanApp = lazy(() => import('./OceanApp.jsx').then(module => ({ default: module.OceanApp })));
const ShallowSample = lazy(() => import('./ShallowSampleApp.jsx').then(module => ({ default: module.ShallowSampleApp })));

class SceneLoadBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main style={{padding:30}} role="alert">
      <h1>场景未能加载</h1><p>请检查网络后重新载入。已保存的探索记录会保留。</p>
      <button onClick={() => window.location.reload()}>重新载入</button>
    </main>;
    return this.props.children;
  }
}

export function App(){
  const sample = new URLSearchParams(window.location.search).get('demo') === 'shallow-sample';
  return <SceneLoadBoundary><Suspense fallback={<p style={{padding:30}} role="status">正在打开海底世界…首次访问需要准备模型，之后可使用缓存。</p>}>{sample ? <ShallowSample/> : <OceanApp/>}</Suspense></SceneLoadBoundary>;
}
