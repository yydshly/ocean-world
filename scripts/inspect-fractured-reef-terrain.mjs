import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX, floorHeight, habitatHeight, reefRockRelief, reefRockSurfaceY, reefRockSurfacePoint, reefRockFootprintContains } from '../src/habitat.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';
import { ReefSimulation } from '../src/simulation.js';
import { decodeReefScanForInspection } from './lib/decode-reef-scan.mjs';
import { prepareReefSkeletonDisplay } from '../src/world/reefScanDisplay.js';
import { placeReefSkeletonOnSubstrate } from '../src/world/reefScanPlacement.js';

const root=new URL('../',import.meta.url);
const sourceFiles=['src/habitat.js','src/world/reefTerrain.js','src/world/reefSpatialQueries.js',
  'src/world/reefScanPlacement.js','src/world/reefScanDisplay.js','src/simulation.js',
  'scripts/inspect-fractured-reef-terrain.mjs','tests/reef-fractured-footprint.test.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>
  [name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex')])));

export async function inspectFracturedReefTerrain(){
  const sourceSha256=await hashes(),material=new THREE.MeshBasicMaterial();
  const meshes=REEF_ROCKS.map((rock,index)=>new THREE.Mesh(createReefRockGeometry(rock,
    {bedSupported:index!==REEF_BRIDGE_ROCK_INDEX}),material));
  for(const mesh of meshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
  ray.firstHitOnly=true;
  const report={schema:'fractured-reef-terrain-inspection-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,
    scope:'Actual Three geometry, triangle raycasts and official local Draco geometry in Node; no browser, GPU or final visual judgement',
    rocks:[],coralContacts:[],footContacts:[],upperSamples:[],limits:[
      'Weathered fractures, shelves and sediment edge heights are authored terrain, not a measured geological model.',
      'Main rock rims are nonelliptical within the original ellipse envelope; the central coral sites and bridge cap remain.',
      'Local grid and vertex rays are not proof of all continuous surface contact, physical stability or fish-body collision.',
      'Node Draco geometry decoding does not exercise the browser GLTFLoader, JPEG, WebGL or GPU performance.',
      'Frozen review-three/review-four files and their formal browser runs are independent of this later source change.']};
  let scan=null,merged=null;
  try{
    for(const [index,mesh]of meshes.entries()){
      const rock=REEF_ROCKS[index],geometry=mesh.geometry,p=geometry.attributes.position,n=geometry.attributes.normal;
      const uv=geometry.attributes.uv,indices=geometry.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      let upperFaces=0,lowerFaces=0,minNormalLength=Infinity,maxNormalLength=0,minArea=Infinity;
      const welded=new Map(),vertexIds=[],edgeCounts=new Map(),seamNormals=new Map();
      for(let i=0;i<p.count;i++){
        const point=[p.getX(i),p.getY(i),p.getZ(i)],normal=[n.getX(i),n.getY(i),n.getZ(i)];
        assert.ok([...point,...normal].every(Number.isFinite));
        const length=Math.hypot(...normal);minNormalLength=Math.min(minNormalLength,length);maxNormalLength=Math.max(maxNormalLength,length);
        const key=point.map(value=>Math.round(value*1e6)).join('/');
        if(!welded.has(key))welded.set(key,welded.size);vertexIds[i]=welded.get(key);
        if(seamNormals.has(key))assert.ok(normal.every((value,j)=>Math.abs(value-seamNormals.get(key)[j])<1e-6));else seamNormals.set(key,normal);
      }
      for(let k=0;k<indices.count;k+=3){
        const vertices=[indices.getX(k),indices.getX(k+1),indices.getX(k+2)];
        a.fromBufferAttribute(p,vertices[0]);b.fromBufferAttribute(p,vertices[1]);c.fromBufferAttribute(p,vertices[2]);
        const cross=b.clone().sub(a).cross(c.clone().sub(a)),area=cross.length()/2;
        assert.ok(area>1e-12);minArea=Math.min(minArea,area);
        if(vertices.every(i=>uv.getY(i)>=.5-1e-8)){assert.ok(cross.y>0);upperFaces++;}
        if(vertices.every(i=>uv.getY(i)<=.5+1e-8)){assert.ok(cross.y<0);lowerFaces++;}
        for(let j=0;j<3;j++){const u=vertexIds[vertices[j]],v=vertexIds[vertices[(j+1)%3]],key=u<v?`${u}/${v}`:`${v}/${u}`;
          assert.notEqual(u,v);edgeCounts.set(key,(edgeCounts.get(key)||0)+1);}
      }
      const boundaryEdges=[...edgeCounts.values()].filter(count=>count!==2).length;assert.equal(boundaryEdges,0);
      assert.ok(minNormalLength>.999999&&maxNormalLength<1.000001);
      const rimHeights=[],oppositeDifferences=[];
      for(let j=0;j<32;j++){
        const angle=j*Math.PI/16,nx=Math.cos(angle),nz=Math.sin(angle),rimPoint=reefRockSurfacePoint(rock,nx,0,nz,true),pointX=rimPoint.x,pointZ=rimPoint.z;
        rimHeights.push(rimPoint.y-floorHeight(pointX,pointZ));
        oppositeDifferences.push(Math.abs(reefRockSurfaceY(rock,nx*.72,1,nz*.72)-reefRockSurfaceY(rock,-nx*.72,1,-nz*.72)));
      }
      report.rocks.push({index,triangles:indices.count/3,vertices:p.count,upperFaces,lowerFaces,minArea,minNormalLength,maxNormalLength,
        weldedBoundaryOrNonManifoldEdges:boundaryEdges,geometryPositionSha256:createHash('sha256').update(Buffer.from(p.array.buffer)).digest('hex'),
        rimAboveSedimentRangeM:[Math.min(...rimHeights),Math.max(...rimHeights)],maxOppositeShoulderDifferenceM:Math.max(...oppositeDifferences)});
      if(index===REEF_BRIDGE_ROCK_INDEX)continue;
      assert.ok(Math.min(...rimHeights)>=.045-1e-10&&Math.max(...rimHeights)<=.085+1e-10);
      for(const radius of [.5,.75,.9])for(let j=0;j<8;j++){
        const angle=j*Math.PI/4,mapped=reefRockSurfacePoint(rock,Math.cos(angle)*radius,-Math.sqrt(1-radius*radius),Math.sin(angle)*radius,true),x=mapped.x,z=mapped.z;
        ray.set(new THREE.Vector3(x,floorHeight(x,z)-2,z),up);const hit=ray.intersectObject(mesh,false)[0];assert.ok(hit);
        const gap=hit.point.y-floorHeight(x,z);assert.ok(gap<-.04);report.footContacts.push({rockIndex:index,radius,angle,meshBottomMinusFloorM:gap});
      }
      for(const radius of [.25,.4,.55,.7,.85,.95])for(let j=0;j<32;j++){
        const angle=j*Math.PI/16,mapped=reefRockSurfacePoint(rock,radius*Math.cos(angle),Math.sqrt(1-radius*radius),radius*Math.sin(angle),true),x=mapped.x,z=mapped.z,nx=(x-rock[0])/rock[3],nz=(z-rock[2])/rock[5];
        ray.set(new THREE.Vector3(x,7,z),down);const hit=ray.intersectObject(mesh,false)[0];assert.ok(hit);
        assert.ok(reefRockFootprintContains(rock,nx,nz));const difference=reefRockSurfaceY(rock,nx,1,nz)-hit.point.y;
        report.upperSamples.push({rockIndex:index,radius,angle,analyticMinusTriangleM:difference});
      }
    }
    const previous=JSON.parse(await readFile(new URL('output/validation/coral-bed-supported-inspection-v2.json',root),'utf8'));
    for(const seed of previous.seeds){
      const sim=new ReefSimulation(seed),rows=previous.rows.filter(row=>row.seed===seed);
      for(const row of rows){
        const colony=sim.agents.find(agent=>agent.id===row.id);assert.ok(colony);
        assert.deepEqual(colony.position,row.positionM,'Protected coral site position unchanged');
        assert.equal(colony.sizeM,row.sizeM);
        ray.set(new THREE.Vector3(colony.position.x,7,colony.position.z),down);const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit);
        const rootGap=colony.position.y-hit.point.y;assert.ok(rootGap>=.003&&rootGap<.01);
        report.coralContacts.push({seed,id:colony.id,rootAboveTriangleM:rootGap,analyticMinusTriangleM:habitatHeight(colony.position.x,colony.position.z)-hit.point.y});
      }
    }
    const bridge=REEF_ROCKS[REEF_BRIDGE_ROCK_INDEX];ray.set(new THREE.Vector3(bridge[0],.30,bridge[2]),up);
    const bridgeHit=ray.intersectObject(meshes[REEF_BRIDGE_ROCK_INDEX],false)[0];assert.ok(bridgeHit);assert.ok(Math.abs(bridgeHit.point.y-.5)<1e-6);
    report.bridgeCap={openEyePointM:[bridge[0],.30,bridge[2]],actualUndersideY:bridgeHit.point.y,unchanged:true};
    scan=await decodeReefScanForInspection();const display=prepareReefSkeletonDisplay(scan.group);
    merged=mergeGeometries(meshes.map(mesh=>mesh.geometry),false);const substrate=new THREE.Mesh(merged,material);
    report.scanPlacement=placeReefSkeletonOnSubstrate(scan.group,substrate);assert.equal(report.scanPlacement.vertexSamples,22909);
    assert.ok(Math.abs(report.scanPlacement.minVertexGapM-.004)<1e-10);
    report.scanDisplay={triangles:display.meshes[0].displayTriangles,vertices:display.meshes[0].displayVertices,physicalScaleMultiplier:1};
    report.summary={rockCount:report.rocks.length,weatheredRocks:11,footRaySamples:report.footContacts.length,
      upperRaySamples:report.upperSamples.length,coralRootSamples:report.coralContacts.length,
      maximumUpperAnalyticMinusTriangleM:Math.max(...report.upperSamples.map(row=>row.analyticMinusTriangleM)),
      minimumUpperAnalyticMinusTriangleM:Math.min(...report.upperSamples.map(row=>row.analyticMinusTriangleM)),
      maximumCoralRootGapM:Math.max(...report.coralContacts.map(row=>row.rootAboveTriangleM)),
      minimumCoralRootGapM:Math.min(...report.coralContacts.map(row=>row.rootAboveTriangleM))};
    assert.ok(report.summary.maximumUpperAnalyticMinusTriangleM<.06&&report.summary.minimumUpperAnalyticMinusTriangleM>-.06);
    report.sourceSha256After=await hashes();assert.deepEqual(report.sourceSha256After,sourceSha256);
    report.passed=true;return report;
  }finally{scan?.dispose();merged?.dispose();for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const target=new URL('output/validation/reef-fractured-terrain-inspection-v1.json',root);
  try{await access(target);throw new Error('Preserve existing terrain evidence; choose a new version before another saved inspection');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const report=await inspectFracturedReefTerrain();await writeFile(target,`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify({passed:report.passed,summary:report.summary,scanPlacement:report.scanPlacement},null,2));
}
