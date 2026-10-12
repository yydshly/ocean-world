import React, { lazy, Suspense } from 'react';
const OceanApp = lazy(() => import('./OceanApp.jsx').then(module => ({ default: module.OceanApp })));
const ShallowSample = lazy(() => import('./ShallowSampleApp.jsx').then(module => ({ default: module.ShallowSampleApp })));

export function App(){
  const sample = new URLSearchParams(window.location.search).get('demo') === 'shallow-sample';
  return <Suspense fallback={<p style={{padding:30}}>正在打开海底世界…</p>}>{sample ? <ShallowSample/> : <OceanApp/>}</Suspense>;
}
