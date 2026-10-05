import test from 'node:test';
import assert from 'node:assert/strict';
import { REEF_ROCKS, reefRockSurfacePoint, reefRockSurfaceY, reefRockFootprintContains, reefRockCanonicalCoordinates } from '../src/habitat.js';
import { inspectLowMoundSupport as inspectFracturedReefTerrain } from '../scripts/inspect-low-mound-support.mjs';

test('fractured rims remain inside their envelope and invert a monotone identity-core map',()=>{
  let maxInverseError=0,minBoundary=1,maxBoundary=0;
  for(const [index,rock]of REEF_ROCKS.entries())for(let j=0;j<144;j++){
    const angle=j*Math.PI/72,c=Math.cos(angle),s=Math.sin(angle);let previous=-1;
    for(let i=0;i<=100;i++){
      const radius=i/100,point=reefRockSurfacePoint(rock,c*radius,Math.sqrt(1-radius*radius),s*radius,true);
      const nx=(point.x-rock[0])/rock[3],nz=(point.z-rock[2])/rock[5],mapped=Math.hypot(nx,nz);
      assert.ok(mapped>=previous-1e-12);previous=mapped;assert.ok(mapped<=1+1e-12);
      assert.ok(reefRockFootprintContains(rock,nx,nz));const inverse=reefRockCanonicalCoordinates(rock,nx,nz);
      const error=Math.hypot(inverse.nx-c*radius,inverse.nz-s*radius);maxInverseError=Math.max(maxInverseError,error);assert.ok(error<1e-6);
      assert.ok(Math.abs(reefRockSurfaceY(rock,nx,Math.sqrt(1-radius*radius),nz,true)-point.y)<1e-5);
      if(radius<=.38){assert.ok(Math.abs(nx-c*radius)<1e-12);assert.ok(Math.abs(nz-s*radius)<1e-12);}
    }
    if(index!==9){minBoundary=Math.min(minBoundary,previous);maxBoundary=Math.max(maxBoundary,previous);
      assert.equal(reefRockFootprintContains(rock,c*(previous+.001),s*(previous+.001)),false);}
  }
  assert.ok(maxInverseError<1e-6);assert.ok(minBoundary<.75&&maxBoundary>.93);
});

test('current low-mound shells retain the fractured footprint/XZ sites and refit48 roots/scan Y at original scale',async()=>{
  const report=await inspectFracturedReefTerrain();
  assert.equal(report.summary.footRaySamples,264);assert.equal(report.summary.upperRaySamples,2112);
  assert.equal(report.summary.coralRootSamples,48);assert.ok(report.summary.minimumCoralRootGapM>=.002);
  assert.ok(report.rocks.every(rock=>rock.weldedBoundaryOrNonManifoldEdges===0));
  assert.ok(report.rocks.every(rock=>rock.upperFaces+rock.lowerFaces===rock.triangles));
  assert.equal(report.bridgeCap.unchanged,true);assert.equal(report.scanDisplay.triangles,19146);
  assert.ok(Math.abs(report.scanPlacement.minVertexGapM-.004)<1e-10);
});
