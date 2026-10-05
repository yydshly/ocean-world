import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLowMoundContract} from '../scripts/lib/inspect-low-mound-contract.mjs';
import {inspectLowMoundSupport} from '../scripts/inspect-low-mound-support.mjs';

test('authorized low-mound contract preserves all31 XZ/lower shapes but materially changes3240 old high-core samples',async()=>{
  const r=await inspectLowMoundContract();
  assert.equal(r.footprintPointSamples,31248);assert.equal(r.preservedLowerPointSamples,31248);
  assert.equal(r.changedUpperCorePointSamples,3240);assert.equal(r.unchangedRockPointSamples,22176);
  assert.equal(r.revisedUpperPointSamples,6480);assert.ok(r.meanAbsoluteUpperHeightChangeM>.10&&r.maxAbsUpperHeightChangeM>.35);
  assert.ok(r.rocks.every(rock=>rock.adoptedCoreRiseRatio>=.55-1e-12&&rock.adoptedCoreRiseRatio<=.65+1e-12));
});

test('current actual31-rock low mounds refit coral48 and full scan115927 Y while preserving XZ/scale/assets and closed shells',async()=>{
  const r=await inspectLowMoundSupport();
  assert.equal(r.summary.rockCount,31);assert.equal(r.summary.changedUpperMeshPositionBuffers,9);assert.equal(r.summary.unchangedMeshPositionBuffers,22);
  assert.equal(r.summary.footRaySamples,264);assert.equal(r.summary.upperRaySamples,2112);assert.equal(r.summary.coralRootSamples,48);
  assert.ok(r.rocks.every(rock=>rock.weldedBoundaryOrNonManifoldEdges===0&&rock.upperFaces+rock.lowerFaces===rock.triangles));
  assert.ok(r.summary.maximumUpperAnalyticMinusTriangleM<.04&&r.summary.minimumUpperAnalyticMinusTriangleM>-.04);
  assert.ok(r.summary.minimumCoralRootGapM>=.002&&r.summary.maximumCoralRootGapM<.01);
  assert.ok(r.coralContacts.every(row=>row.rootDeltaYM<0));assert.equal(r.bridgeCap.unchanged,true);
  assert.equal(r.fullScanPlacement.vertexSamples,115927);assert.equal(r.fullScanVerification.independentlyCheckedVertices,115927);
  assert.ok(r.fullScanVerification.minActualVertexGapM>=.004-1e-9);assert.equal(r.fullScanPlacement.physicalScaleMultiplier,1);
  assert.ok(r.fullScanRefit.rootDeltaYM<0);assert.ok(r.scanRefit.rootDeltaYM<0);
});
