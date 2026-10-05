import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCoralLimbSurfaceV3 } from '../scripts/lib/inspect-coral-limb-surface-v3.mjs';
const report=inspectCoralLimbSurfaceV3();
test('saved v3c refinement preserves original growth vertices, cup microdimensions and source scope',()=>{
  assert.equal(report.outsideCoralLimbUnchanged,true);assert.equal(report.rows.length,40);
  assert.ok(report.rows.every(r=>r.originalVerticesPreserved>0&&r.boundsMaximumAbsoluteDeltaM<.002));
  assert.ok(report.rows.filter(r=>r.corallites).every(r=>r.unchangedInnerCupNormals>0&&r.minimumCupDepression>.0006));
});
test('saved v3c shaft normals face outward with seamless lighting while recessed cup normals face inward',()=>{
  for(const row of report.rows.filter(r=>r.corallites)){assert.ok(row.minimumOutwardShaftDot>.15);assert.ok(row.maximumInwardCupDot<-.1);assert.ok(row.maximumSeamNormalDifference<1e-6);assert.equal(row.boundaryEdges,0);assert.equal(row.nonManifoldEdges,0);assert.ok(row.minimumDoubleArea>1e-9);}
});
test('saved v3c rounded shoulders fit its named and low-detail geometry/resource budgets',()=>{
  for(const row of report.rows){assert.equal(row.mainDraws,1);assert.deepEqual(row.resources,{geometry:1,material:1,textures:2});if(row.id.startsWith('named/'))assert.ok(row.triangles<36500);if(row.id.endsWith('/low')){assert.ok(row.triangles<6000);assert.equal(row.triangleChange,0);assert.equal(row.roundedShoulders,0);}}
  assert.ok(report.rows.filter(r=>r.id.startsWith('named/')).every(r=>r.roundedShoulders>0));
});
