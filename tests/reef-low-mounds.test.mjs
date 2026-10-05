import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLowReefMounds} from '../scripts/inspect-low-reef-mounds.mjs';

test('authorized lower mound crowns change nine upper cores while keeping31 finite closed shells, all XZ/lower shapes and22 other meshes',async()=>{
  const r=await inspectLowReefMounds();
  assert.deepEqual(r.revisedRockIndices,[0,1,2,3,4,5,6,10,11]);
  assert.equal(r.summary.rocks,31);assert.equal(r.summary.revisedMounds,9);assert.equal(r.summary.unchangedMeshPositionBuffers,22);
  assert.equal(r.summary.footprintSamples,2976);assert.equal(r.summary.lowerSamples,2976);
  assert.ok(r.rocks.filter(rock=>rock.revised).every(rock=>rock.adoptedCoreRiseRatio>=.55-1e-12&&rock.adoptedCoreRiseRatio<=.65+1e-12));
  assert.ok(r.rocks.every(rock=>rock.closedWeldedEdges&&rock.upperFaces+rock.lowerFaces===rock.triangles));
  assert.ok(r.pending.length>=4); // No old scan/coral invariance or visual pass is inferred here.
});
