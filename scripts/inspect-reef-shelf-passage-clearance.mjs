import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {REEF_ROCKS,floorHeight,reefRockFootprintContains,reefRockCanonicalCoordinates,reefRockSurfaceY} from '../src/habitat.js';
import {REEF_AUXILIARY_ROCKS} from '../src/reefScenery.js';
import {createReefRockGeometry} from '../src/world/reefTerrain.js';
import {enableStaticRayQueries} from '../src/world/reefSpatialQueries.js';

const files=['scripts/inspect-reef-shelf-passage-clearance.mjs','src/habitat.js','src/reefScenery.js',
  'src/world/reefTerrain.js','src/world/reefSpatialQueries.js',
  'output/validation/reef-shelf-passage-correction-v2.json','output/validation/reef-shelf-passage-risk-v2.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>
  [file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const sourceSha256=await hashes(),rocks=[...REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
const material=new THREE.MeshBasicMaterial(),meshes=rocks.map((rock,index)=>
  new THREE.Mesh(createReefRockGeometry(rock,{bedSupported:index<12&&index!==9}),material));
for(const mesh of meshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
const ray=new THREE.Raycaster();ray.firstHitOnly=true;
const down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
const samples=[];let minimumActualGapM=Infinity,minimumAnalyticGapM=Infinity,minimumFloorGapM=Infinity;
try{
  for(const x of [1.30,1.35,1.40])for(let j=0;j<=34;j++){
    const y=.30,z=-3.2+j*.05,actualIntervals=[],analyticIntervals=[];
    const floorGap=y-floorHeight(x,z);assert.ok(floorGap>.03);minimumFloorGapM=Math.min(minimumFloorGapM,floorGap);
    for(const [index,rock]of rocks.entries()){
      // Analytic evaluation is independent of triangle-ray hit availability.
      const nx=(x-rock[0])/rock[3],nz=(z-rock[2])/rock[5];
      if(reefRockFootprintContains(rock,nx,nz)){
        const canonical=reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-canonical.radius**2));
        const low=reefRockSurfaceY(rock,nx,-ny,nz,index<12&&index!==9),high=reefRockSurfaceY(rock,nx,ny,nz,index<12&&index!==9);
        const gap=y<low?low-y:y>high?y-high:0;assert.ok(gap>.03);
        minimumAnalyticGapM=Math.min(minimumAnalyticGapM,gap);analyticIntervals.push({rockIndex:index,lowerM:low,upperM:high,gapM:gap});
      }
      ray.set(new THREE.Vector3(x,7,z),down);const top=ray.intersectObject(meshes[index])[0];if(!top)continue;
      ray.set(new THREE.Vector3(x,-2,z),up);const bottom=ray.intersectObject(meshes[index])[0];assert.ok(bottom);
      const gap=y<bottom.point.y?bottom.point.y-y:y>top.point.y?y-top.point.y:0;assert.ok(gap>.03);
      minimumActualGapM=Math.min(minimumActualGapM,gap);
      actualIntervals.push({rockIndex:index,lowerM:bottom.point.y,upperM:top.point.y,gapM:gap});
    }
    samples.push({pointM:[x,y,z],actualIntervals,analyticIntervals,floorGapM:floorGap});
  }
  const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,sourceSha256);
  const report={schema:'reef-shelf-passage-independent-clearance-v1',passed:true,observedAtUtc:new Date().toISOString(),
    scope:'105 y=.30m corridor points; independently evaluated all31 analytic footprints and all31 actual triangle intervals,30mm vertical point margin.',
    sourceSha256,sourceSha256After,summary:{points:samples.length,rocks:rocks.length,
      actualRockIntervals:samples.reduce((sum,row)=>sum+row.actualIntervals.length,0),
      analyticRockIntervals:samples.reduce((sum,row)=>sum+row.analyticIntervals.length,0),
      minimumActualGapM,minimumAnalyticGapM,minimumFloorGapM},samples,
    limits:['Finite sampled points and30 forward/back rays in the companion report do not prove a complete swept animal/camera volume.',
      'The necessary raised upper boundary lip changes95 upper vertices relative to the preserved v2 baseline; upper surface is not globally unchanged.',
      'No new aesthetic visual pass, ecology long run or physical stability claim.']};
  await writeFile('output/validation/reef-shelf-passage-clearance-v1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report.summary));
}finally{for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}
