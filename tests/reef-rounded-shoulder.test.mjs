import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLowMoundContract as inspectRoundedShoulderContract } from '../scripts/lib/inspect-low-mound-contract.mjs';
import { inspectLowMoundSupport as inspectRoundedReefShoulder } from '../scripts/inspect-low-mound-support.mjs';

test('authorized low mounds supersede old core protection while retaining all rounded-baseline XZ/lower shapes and22 other rocks',async()=>{
  const r=await inspectRoundedShoulderContract();
  assert.deepEqual(r.revisedRockIndices,[0,1,2,3,4,5,6,10,11]);assert.equal(r.footprintPointSamples,31248);
  assert.equal(r.preservedLowerPointSamples,31248);assert.equal(r.changedUpperCorePointSamples,3240);
  assert.equal(r.unchangedRockPointSamples,22176);assert.equal(r.revisedUpperPointSamples,6480);
  assert.ok(r.meanAbsoluteUpperHeightChangeM>.10&&r.maxAbsUpperHeightChangeM>.35);
  assert.ok(r.rocks.every(rock=>rock.sampledRimBelowSedimentRangeM[0]>=-.025000001&&rock.sampledRimBelowSedimentRangeM[1]<=-.014999999));
});

test('actual current31-rock low mounds refit coral48/scan115927 Y and retain closed outward shells and the original crevice',async()=>{
  const r=await inspectRoundedReefShoulder();
  assert.equal(r.summary.rockCount,31);assert.equal(r.summary.roundedShoulderRocks,9);
  assert.equal(r.summary.footRaySamples,264);assert.equal(r.summary.upperRaySamples,2112);assert.equal(r.summary.coralRootSamples,48);
  assert.equal(r.summary.changedUpperMeshPositionBuffers,9);assert.equal(r.summary.unchangedMeshPositionBuffers,22);
  assert.ok(r.summary.maximumUpperAnalyticMinusTriangleM<.04&&r.summary.minimumUpperAnalyticMinusTriangleM>-.04);
  assert.ok(r.rocks.every(rock=>rock.weldedBoundaryOrNonManifoldEdges===0&&rock.upperFaces+rock.lowerFaces===rock.triangles));
  assert.equal(r.bridgeCap.unchanged,true);assert.ok(r.summary.minimumCoralRootGapM>=.002);
  assert.equal(r.fullScanPlacement.vertexSamples,115927);assert.equal(r.fullScanVerification.independentlyCheckedVertices,115927);
  assert.ok(r.fullScanVerification.minActualVertexGapM>=.004-1e-9);
  assert.ok(r.fullScanRefit.rootDeltaYM<0);
});
