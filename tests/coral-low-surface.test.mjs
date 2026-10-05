import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCoralLowSurfaceV4 } from '../scripts/lib/inspect-coral-low-surface-v4.mjs';
const report=inspectCoralLowSurfaceV4();
test('low axial tips gain real shoulders while preserving colony envelope, growth coordinates and exact triangle budget',()=>{
  assert.equal(report.outsidePermittedCoralEditsUnchanged,true);assert.equal(report.rows.length,40);
  assert.equal(report.rows.filter(r=>r.compactCups).length,8);
  for(const row of report.rows.filter(r=>r.compactCups)){assert.ok(row.compactCups>0);assert.ok(row.minimumShoulderRadiusBulgeFraction>0);assert.equal(row.triangleChange,0);assert.ok(row.triangles<6000);assert.ok(row.boundsMaximumAbsoluteDeltaM<1e-7);assert.equal(row.unchangedMajorGrowthAxesAndLipMouthBasalCoordinates,true);assert.ok(row.unchangedRadialVertices>0);}
});
test('new low cup concavity and outside normals remain oriented, closed and seamless',()=>{
  assert.equal(report.rows.filter(r=>r.corallites).length,28);
  for(const row of report.rows.filter(r=>r.corallites)){assert.equal(row.faceMeanVertexNormalNegativeCount,0);assert.ok(row.minimumFaceMeanVertexNormalDot>0);assert.ok(row.maximumInwardCupDot<-.1);assert.ok(row.minimumOutwardShaftDot>.15);assert.equal(row.boundaryEdges,0);assert.equal(row.nonManifoldEdges,0);assert.ok(row.maximumSeamNormalDifference<1e-6);}
});
test('boulder metre UVs remove crown/seam singularities without changing any shape or material geometry attribute',()=>{
  assert.equal(report.rows.filter(r=>r.xyzTopologyColorNormalsPreserved).length,12);
  for(const row of report.rows.filter(r=>r.xyzTopologyColorNormalsPreserved)){assert.ok(row.maximumUvMappingError<4e-7);assert.ok(row.maximumWeldedSeamUvDifference<1e-6);assert.ok(row.maximumUvDeterminant<0);assert.deepEqual(row.localMetresPerCell,[.00672,.006]);assert.equal(row.triangleChange,0);}
  for(const row of report.rows.filter(r=>r.id.startsWith('named/')||(!r.id.startsWith('boulder/')&&!r.id.endsWith('/low'))))assert.equal(row.allGeometryAttributesAndEcologicalSummariesUnchanged,true);
});
