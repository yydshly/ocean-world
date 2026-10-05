import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import * as current from '../src/habitat.js';
import * as old from '../output/validation/sources/reef-rounded-v1/src/habitat.js';
import {REEF_AUXILIARY_ROCKS} from '../src/reefScenery.js';
import {createReefRockGeometry} from '../src/world/reefTerrain.js';
import {createReefRockGeometry as createOldGeometry} from '../output/validation/sources/reef-rounded-v1/src/world/reefTerrain.js';

const root=new URL('../',import.meta.url),indices=[0,1,2,3,4,5,6,10,11];
const sourceFiles=['src/habitat.js','src/reefScenery.js','src/world/reefTerrain.js',
  'scripts/inspect-low-reef-mounds.mjs','tests/reef-low-mounds.test.mjs',
  'output/validation/sources/reef-rounded-v1/src/habitat.js',
  'output/validation/sources/reef-rounded-v1/src/reefScenery.js',
  'output/validation/sources/reef-rounded-v1/src/world/reefTerrain.js'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,hash(await readFile(new URL(name,root)))])));

export async function inspectLowReefMounds(){
  const sourceSha256=await sourceHashes(),rocks=[...current.REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
  assert.deepEqual(current.REEF_ROCKS,old.REEF_ROCKS,'Original authored arrays, positions and scales remain unchanged');
  assert.equal(sourceSha256['output/validation/sources/reef-rounded-v1/src/habitat.js'],'bbad15ee12a57c2349146a4f6b2e5bda879582cda982c680d50907f2668b4bbb');
  assert.equal(sourceSha256['output/validation/sources/reef-rounded-v1/src/world/reefTerrain.js'],'f256a0b70493f12ad50dd07a671702e7c086559eed4c8913054321c81414c912');
  const material=new THREE.MeshBasicMaterial(),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  const report={schema:'reef-low-mounds-preview-sanity-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,
    revisedRockIndices:indices,rocks:[],scope:'Quick actual31-rock finite/closed/winding and adopted-height sanity before actual visual preview',
    pending:['Actual browser documentary visual review','Current coral48 attachment/complete scan115927 rigid placement','Current camera and mobile-organism collision integration','Current ecological and frozen20-minute browser checks'],
    limits:['A quick local geometry pass is not a final contact/visual/performance claim.','Previous exact core/coral-position/scan-rootY invariance is intentionally superseded for nine broad mounds.','No source scan geometry, physical scale, XZ footprint, seed/RNG, bridge7–9 or auxiliary geometry changes are authorized here.']};
  let footprintSamples=0,lowerSamples=0,unchangedBuffers=0,totalTriangles=0;
  try{for(const [index,rock] of rocks.entries()){
    const bedSupported=index<12&&index!==9,geometry=createReefRockGeometry(rock,{bedSupported}),baseline=createOldGeometry(rock,{bedSupported});
    try{
      const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,faces=geometry.index;
      const welded=new Map(),vertexIds=[],edges=new Map();let minArea=Infinity,upperFaces=0,lowerFaces=0;
      for(let i=0;i<p.count;i++){
        assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
        const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join('/');
        if(!welded.has(key))welded.set(key,welded.size);vertexIds[i]=welded.get(key);
      }
      for(let i=0;i<faces.count;i+=3){
        const v=[faces.getX(i),faces.getX(i+1),faces.getX(i+2)];
        const [a,b,c]=v.map(j=>new THREE.Vector3().fromBufferAttribute(p,j)),cross=b.sub(a).cross(c.sub(a));
        assert.ok(cross.length()>2e-12);minArea=Math.min(minArea,cross.length()/2);
        if(v.every(j=>uv.getY(j)>=.5-1e-8)){assert.ok(cross.y>0);upperFaces++;}
        if(v.every(j=>uv.getY(j)<=.5+1e-8)){assert.ok(cross.y<0);lowerFaces++;}
        for(let j=0;j<3;j++){const u=vertexIds[v[j]],w=vertexIds[v[(j+1)%3]];assert.notEqual(u,w);
          const key=u<w?u+'/'+w:w+'/'+u;edges.set(key,(edges.get(key)||0)+1);}
      }
      assert.ok([...edges.values()].every(count=>count===2));assert.equal(upperFaces+lowerFaces,faces.count/3);
      const positionSha256=hash(Buffer.from(p.array.buffer)),baselinePositionSha256=hash(Buffer.from(baseline.attributes.position.array.buffer));
      if(!indices.includes(index)){assert.equal(positionSha256,baselinePositionSha256);unchangedBuffers++;}
      let maximumHeightRoundTripErrorM=0;
      for(let j=0;j<16;j++)for(const radius of [0,.2,.38,.6,.9,1]){
        const angle=j*Math.PI/8,nx=radius*Math.cos(angle),nz=radius*Math.sin(angle),ny=Math.sqrt(1-radius*radius);
        const point=current.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported),oldPoint=old.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported);
        assert.equal(point.x,oldPoint.x);assert.equal(point.z,oldPoint.z);footprintSamples++;
        // -0 selects the upper branch in JavaScript. An explicit negative
        // sign probes the shared lower rim rather than cancellation in the
        // separately reauthored upper formula at exactly r=1.
        const lowerSign=ny===0?-Number.EPSILON:-ny;
        const lower=current.reefRockSurfacePoint(rock,nx,lowerSign,nz,bedSupported),oldLower=old.reefRockSurfacePoint(rock,nx,lowerSign,nz,bedSupported);
        assert.deepEqual(lower,oldLower);lowerSamples++;assert.ok(point.y>=lower.y-1e-12);
        const inverseY=current.reefRockSurfaceY(rock,(point.x-rock[0])/rock[3],ny,(point.z-rock[2])/rock[5],bedSupported);
        maximumHeightRoundTripErrorM=Math.max(maximumHeightRoundTripErrorM,Math.abs(inverseY-point.y));
      }
      assert.ok(maximumHeightRoundTripErrorM<1e-5);
      const floor=current.floorHeight(rock[0],rock[2]),oldCrown=old.reefRockSurfacePoint(rock,0,1,0,bedSupported).y,
        crown=current.reefRockSurfacePoint(rock,0,1,0,bedSupported).y;
      const adoptedCoreRiseRatio=(crown-floor)/(oldCrown-floor);
      if(indices.includes(index)){assert.ok(adoptedCoreRiseRatio>=.55-1e-12&&adoptedCoreRiseRatio<=.65+1e-12);assert.notEqual(positionSha256,baselinePositionSha256);}
      const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(rock[0],7,rock[2]),down);const hit=ray.intersectObject(mesh,false)[0];assert.ok(hit);
      assert.ok(Math.abs(hit.point.y-crown)<1e-6);
      report.rocks.push({index,revised:indices.includes(index),triangles:faces.count/3,upperFaces,lowerFaces,closedWeldedEdges:true,minArea,
        positionSha256,baselinePositionSha256,crownAboveFloorM:crown-floor,oldCrownAboveFloorM:oldCrown-floor,
        adoptedCoreRiseRatio,actualCrownY:hit.point.y,maximumHeightRoundTripErrorM});
      totalTriangles+=faces.count/3;
    }finally{geometry.dispose();baseline.dispose();}
  }}finally{material.dispose();}
  report.summary={rocks:31,revisedMounds:9,unchangedMeshPositionBuffers:unchangedBuffers,totalTriangles,footprintSamples,lowerSamples};
  report.sourceSha256After=await sourceHashes();assert.deepEqual(report.sourceSha256After,sourceSha256);
  report.passed=true;return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await inspectLowReefMounds();
  await writeFile(new URL('output/validation/reef-low-mounds-preview-v1.json',root),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:report.passed,summary:report.summary,crowns:report.rocks.filter(r=>r.revised).map(({index,crownAboveFloorM,oldCrownAboveFloorM,adoptedCoreRiseRatio})=>({index,crownAboveFloorM,oldCrownAboveFloorM,adoptedCoreRiseRatio}))},null,2));
}
