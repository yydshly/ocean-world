import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectShoulderContract } from '../scripts/lib/inspect-asymmetric-shoulder-contract.mjs';
import { inspectAsymmetricReefShoulder } from '../scripts/inspect-asymmetric-reef-shoulder.mjs';

test('authorized current low-mound revision preserves rounded-baseline footprint/lower shell and explicitly changes nine high cores',async()=>{
  const report=await inspectShoulderContract();
  assert.equal(report.footprintPointSamples,31248);assert.equal(report.preservedLowerPointSamples,31248);
  assert.equal(report.changedUpperCorePointSamples,3240);assert.equal(report.unchangedRockPointSamples,22176);
  assert.deepEqual(report.revisedRockIndices,[0,1,2,3,4,5,6,10,11]);
  assert.ok(report.meanAbsoluteUpperHeightChangeM>.10);assert.ok(report.maxAbsUpperHeightChangeM>.35);
});

test('current31 hard-substrate meshes retain closed winding/bridge and refit coral48/scan Y with the original XZ and scale',async()=>{
  const report=await inspectAsymmetricReefShoulder();
  assert.equal(report.summary.rockCount,31);assert.equal(report.summary.auxiliaryRocks,19);
  assert.equal(report.summary.footRaySamples,264);assert.equal(report.summary.upperRaySamples,2112);
  assert.equal(report.summary.coralRootSamples,48);assert.ok(report.summary.minimumCoralRootGapM>=.002);
  assert.equal(report.summary.changedUpperMeshPositionBuffers,9);assert.equal(report.summary.unchangedMeshPositionBuffers,22);
  assert.ok(report.rocks.every(rock=>rock.weldedBoundaryOrNonManifoldEdges===0));
  assert.ok(report.rocks.every(rock=>rock.upperFaces+rock.lowerFaces===rock.triangles));
  assert.equal(report.bridgeCap.unchanged,true);assert.equal(report.scanDisplay.triangles,19146);
  assert.equal(report.scanPlacement.rootPositionM[0],4.8);assert.equal(report.scanPlacement.rootPositionM[2],-4.8);
  assert.ok(report.scanRefit.rootDeltaYM<0);assert.ok(report.fullScanRefit.rootDeltaYM<0);
  assert.ok(Math.abs(report.scanPlacement.minVertexGapM-.004)<1e-10);
});
