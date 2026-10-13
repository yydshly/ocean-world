import React, { lazy, Suspense } from 'react';
import { SceneLoading } from './SceneLoading.jsx';
const OceanApp = lazy(() => import('./OceanApp.jsx').then(module => ({ default: module.OceanApp })));
const ShallowSample = lazy(() => import('./ShallowSampleApp.jsx').then(module => ({ default: module.ShallowSampleApp })));

class SceneLoadBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <SceneLoading experience={this.props.experience} error={this.state.error.message || '场景资源未能载入。'}/>;
    return this.props.children;
  }
}

export function App(){
  const demo = new URLSearchParams(window.location.search).get('demo');
  const sample = demo === 'shallow-sample' || demo === 'shallow-journey';
  const experience = demo === 'shallow-journey' ? 'journey' : sample ? 'sample' : 'world';
  return <SceneLoadBoundary experience={experience}><Suspense fallback={<SceneLoading experience={experience}/>}>{sample ? <ShallowSample journey={demo === 'shallow-journey'}/> : <OceanApp/>}</Suspense></SceneLoadBoundary>;
}
