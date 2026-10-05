import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLowMoundSupport as inspectWeatheredReefTerrain } from '../scripts/inspect-low-mound-support.mjs';

test('current lowered31-rock reef keeps closed winding, buried rims and refitted roots while retaining crevice supports',async()=>{
  const report=await inspectWeatheredReefTerrain();
  assert.equal(report.rocks.length,31);assert.equal(report.summary.roundedShoulderRocks,9);
  for(const rock of report.rocks){
    assert.equal(rock.weldedBoundaryOrNonManifoldEdges,0);
    assert.equal(rock.upperFaces+rock.lowerFaces,rock.triangles);
  }
  const revised=[0,1,2,3,4,5,6,10,11].map(index=>report.rocks[index]);
  assert.ok(revised.every(rock=>rock.actualMeshRimAboveSedimentRangeM[0]>=-.025001&&rock.actualMeshRimAboveSedimentRangeM[1]<=-.014999));
  assert.ok([7,8].every(index=>report.rocks[index].rimAboveSedimentRangeM[0]>=.045-1e-10));
  assert.equal(report.summary.footRaySamples,264);assert.equal(report.summary.upperRaySamples,2112);
  assert.equal(report.summary.coralRootSamples,48);assert.ok(report.summary.minimumCoralRootGapM>=.002);
  assert.equal(report.bridgeCap.unchanged,true);
  assert.equal(report.scanPlacement.vertexSamples,22909);assert.equal(report.scanDisplay.triangles,19146);
  assert.ok(Math.abs(report.scanPlacement.minVertexGapM-.004)<1e-10);
});
