import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import * as current from '../src/habitat.js';
import * as before from '../output/validation/sources/reef-shelf-round-2-before/src/habitat.js';
import {REEF_AUXILIARY_ROCKS} from '../src/reefScenery.js';
import {createReefRockGeometry} from '../src/world/reefTerrain.js';
import {createReefRockGeometry as createBefore} from '../output/validation/sources/reef-shelf-round-2-before/src/world/reefTerrain.js';
import {enableStaticRayQueries} from '../src/world/reefSpatialQueries.js';

const hash=b=>createHash('sha256').update(b).digest('hex'),changed=[7,8,9];
const files=['src/habitat.js','src/reefScenery.js','src/world/reefTerrain.js','src/world/reefSpatialQueries.js',
  'scripts/inspect-reef-continuous-ledge-v1.mjs','output/validation/sources/reef-shelf-round-2-before/src/habitat.js',
  'output/validation/sources/reef-shelf-round-2-before/src/reefScenery.js','output/validation/sources/reef-shelf-round-2-before/src/world/reefTerrain.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(file))])));
const sourceSha256=await hashes(),rocks=[...current.REEF_ROCKS,...REEF_AUXILIARY_ROCKS],oldRocks=[...before.REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
const material=new THREE.MeshBasicMaterial(),meshes=rocks.map((rock,index)=>
  new THREE.Mesh(createReefRockGeometry(rock,{bedSupported:index<12&&index!==9}),material));
for(const mesh of meshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
const ray=new THREE.Raycaster();ray.firstHitOnly=true;const down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
function interval(mesh,x,z){
  ray.set(new THREE.Vector3(x,7,z),down);const top=ray.intersectObject(mesh)[0];if(!top)return null;
  ray.set(new THREE.Vector3(x,-2,z),up);const bottom=ray.intersectObject(mesh)[0];assert.ok(bottom);
  return {upperM:top.point.y,lowerM:bottom.point.y};
}
const report={schema:'reef-continuous-ledge-preview-v1',observedAtUtc:new Date().toISOString(),sourceSha256,
  scope:'One round2 production shape attempt: finite/closed31-rock geometry,28 exact buffers,432 shared-height samples,105 path points and30 actual forward/back rays.',
  authoredParameterChanges:changed.map(index=>({index,before:oldRocks[index],after:rocks[index],shapeKind:current.reefRockProfile(rocks[index]).shapeKind})),
  terminatedContracts:['Three independently visible bridge pieces,old rock9 center/footprint and support-to-cap overlap fixtures are intentionally retired.',
    'Old9 central-eye fixtures do not describe the new solid crown; only the explicitly world-anchored passage is checked anew.'],
  rocks:[],heightSamples:[],pathSamples:[],corridorRays:[],bedConnections:[],failures:[],
  attemptNotes:['The initial09841976 source had an invalid unary/exponent expression and was not accepted as a valid preview or passed inspection; parentheses were corrected and node --check passed before this report.'],
  limits:['Authored silhouette,not measured geology; visual judgement remains pending actual browser review.',
    'Finite point margins and straight rays do not prove a full swept animal/camera volume or mechanical stability.',
    'No whole-body contact,scan refit,long ecology,old-fixture migration,build or performance test is included.']};
try{
  assert.deepEqual(current.REEF_CORAL_ANCHORS,before.REEF_CORAL_ANCHORS);
  for(const [index,mesh]of meshes.entries()){
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=mesh.geometry.attributes.uv,f=mesh.geometry.index;
    const welded=new Map(),ids=[],edges=new Map();let upper=0,lower=0,maxYMinusFloor=-Infinity;
    for(let i=0;i<p.count;i++){
      assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
      const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join('/');if(!welded.has(key))welded.set(key,welded.size);ids[i]=welded.get(key);
      maxYMinusFloor=Math.max(maxYMinusFloor,p.getY(i)-current.floorHeight(p.getX(i),p.getZ(i)));
    }
    for(let k=0;k<f.count;k+=3){
      const v=[f.getX(k),f.getX(k+1),f.getX(k+2)],a=new THREE.Vector3().fromBufferAttribute(p,v[0]),
        cross=new THREE.Vector3().fromBufferAttribute(p,v[1]).sub(a).cross(new THREE.Vector3().fromBufferAttribute(p,v[2]).sub(a));
      assert.ok(cross.length()>2e-12);
      if(v.every(i=>uv.getY(i)>=.5-1e-8)){assert.ok(cross.y>0);upper++;}
      if(v.every(i=>uv.getY(i)<=.5+1e-8)){assert.ok(cross.y<0);lower++;}
      for(let j=0;j<3;j++){const a=ids[v[j]],b=ids[v[(j+1)%3]];assert.notEqual(a,b);const key=a<b?a+'/'+b:b+'/'+a;edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.equal(upper+lower,f.count/3);assert.ok([...edges.values()].every(value=>value===2));
    const old=createBefore(oldRocks[index],{bedSupported:index<12&&index!==9});let baselinePositionSha256;
    try{baselinePositionSha256=hash(Buffer.from(old.attributes.position.array.buffer));}finally{old.dispose();}
    const positionSha256=hash(Buffer.from(p.array.buffer));
    if(!changed.includes(index)){assert.deepEqual(rocks[index],oldRocks[index]);assert.equal(positionSha256,baselinePositionSha256);}
    else assert.notEqual(positionSha256,baselinePositionSha256);
    if(index===7)assert.ok(maxYMinusFloor<=-.0449999,'Whole old right support must be genuinely below sediment');
    report.rocks.push({index,triangles:f.count/3,closedWeldedEdges:true,positionSha256,baselinePositionSha256,maxYMinusFloor,
      bboxMinM:mesh.geometry.boundingBox.min.toArray(),bboxMaxM:mesh.geometry.boundingBox.max.toArray()});
  }
  for(const index of changed){const rock=rocks[index];
    for(let j=0;j<24;j++)for(const radius of [.15,.35,.55,.75,.90,.97]){
      const angle=j*Math.PI/12,ny=Math.sqrt(1-radius*radius),p=current.reefRockSurfacePoint(rock,radius*Math.cos(angle),ny,radius*Math.sin(angle),index!==9);
      const nx=(p.x-rock[0])/rock[3],nz=(p.z-rock[2])/rock[5],upper=current.reefRockSurfaceY(rock,nx,ny,nz,index!==9),lower=current.reefRockSurfaceY(rock,nx,-ny,nz,index!==9);
      assert.ok(current.reefRockFootprintContains(rock,nx,nz));assert.ok(upper>=lower);assert.ok(Math.abs(upper-p.y)<1e-5);
      const actual=interval(meshes[index],p.x,p.z);assert.ok(actual);
      report.heightSamples.push({index,canonicalRadius:radius,angle,pointM:[p.x,p.y,p.z],upperAnalyticMinusTriangleM:upper-actual.upperM,lowerAnalyticMinusTriangleM:lower-actual.lowerM});
    }
  }
  for(const x of [1.30,1.35,1.40])for(let j=0;j<=34;j++){
    const y=.30,z=-3.2+j*.05,actualIntervals=[],analyticIntervals=[];
    for(const [index,rock]of rocks.entries()){
      const nx=(x-rock[0])/rock[3],nz=(z-rock[2])/rock[5];
      if(current.reefRockFootprintContains(rock,nx,nz)){
        const c=current.reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-c.radius**2));
        const low=current.reefRockSurfaceY(rock,nx,-ny,nz,index<12&&index!==9),high=current.reefRockSurfaceY(rock,nx,ny,nz,index<12&&index!==9),gap=y<low?low-y:y>high?y-high:0;
        analyticIntervals.push({index,low,high,gap});if(gap<=.03)report.failures.push({kind:'analytic-path',index,pointM:[x,y,z],gap});
      }
      const actual=interval(meshes[index],x,z);if(actual){const gap=y<actual.lowerM?actual.lowerM-y:y>actual.upperM?y-actual.upperM:0;
        actualIntervals.push({index,...actual,gap});if(gap<=.03)report.failures.push({kind:'actual-path',index,pointM:[x,y,z],gap});}
    }
    report.pathSamples.push({pointM:[x,y,z],actualIntervals,analyticIntervals});
  }
  for(const x of [1.27,1.30,1.35,1.40,1.43])for(const y of [.27,.30,.33])for(const dir of [-1,1]){
    const origin=new THREE.Vector3(x,y,dir===1?-3.2:-1.5);ray.set(origin,new THREE.Vector3(0,0,dir));ray.far=1.7;const hit=ray.intersectObjects(meshes)[0];
    report.corridorRays.push({originM:origin.toArray(),directionZ:dir,actualHit:hit?{rockIndex:meshes.indexOf(hit.object),pointM:hit.point.toArray(),distanceM:hit.distance}:null});
    if(hit)report.failures.push({kind:'actual-corridor-ray',originM:origin.toArray(),directionZ:dir,hitM:hit.point.toArray()});
  }ray.far=Infinity;
  for(const x of [2.20,2.60,3.00])for(const z of [-2.70,-2.55,-2.30]){
    const actual=interval(meshes[9],x,z),floor=current.floorHeight(x,z),connected=Boolean(actual&&actual.lowerM<floor&&actual.upperM>floor);
    report.bedConnections.push({pointXZ:[x,z],floorM:floor,actualInterval:actual,bedConnected:connected});if(!connected)report.failures.push({kind:'right-bed-connection',pointXZ:[x,z]});
  }
  const upperErrors=report.heightSamples.map(r=>r.upperAnalyticMinusTriangleM),lowerErrors=report.heightSamples.map(r=>r.lowerAnalyticMinusTriangleM);
  report.summary={terrainTriangles:report.rocks.reduce((n,r)=>n+r.triangles,0),unchangedPositionBuffers:28,sharedHeightSamples:432,
    upperErrorRangeM:[Math.min(...upperErrors),Math.max(...upperErrors)],maxAbsLowerErrorM:Math.max(...lowerErrors.map(Math.abs)),
    passagePoints:105,forwardBackActualRays:30,rightBedColumns:9,failures:report.failures.length};
  if(Math.max(...upperErrors.map(Math.abs))>.04||report.summary.maxAbsLowerErrorM>.04)report.failures.push({kind:'shared-height-approximation-above40mm',summary:report.summary});
  report.summary.failures=report.failures.length;
  const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,report.sourceSha256);report.sourceSha256After=sourceSha256After;
  report.passed=report.failures.length===0;
  await writeFile('output/validation/reef-continuous-ledge-v1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:report.passed,summary:report.summary,failures:report.failures,buried7:report.rocks[7].maxYMinusFloor,fragment8:report.rocks[8].maxYMinusFloor},null,2));
}finally{for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}
