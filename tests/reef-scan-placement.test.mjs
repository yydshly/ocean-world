import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { placeReefSkeletonOnSubstrate } from '../src/world/reefScanPlacement.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { REEF_ROCKS } from '../src/habitat.js';
import { decodeReefScanForInspection } from '../scripts/lib/decode-reef-scan.mjs';
import { prepareReefSkeletonDisplay } from '../src/world/reefScanDisplay.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';

function synthetic() {
  const geometry=new THREE.BoxGeometry(.626,.343,.411);geometry.translate(0,.343/2,0);
  const material=new THREE.MeshStandardMaterial(),group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));
  return {group,geometry,material,dispose(){geometry.dispose();material.dispose();}};
}

test('rigid original-scale placement clears the actual rendered reef crown at every vertex',()=>{
  const scan=synthetic(),geometry=createReefRockGeometry(REEF_ROCKS[5],{bedSupported:true}),material=new THREE.MeshStandardMaterial();
  const substrate=new THREE.Mesh(geometry,material),before=scan.geometry.getAttribute('position').array.slice();
  try{
    const result=placeReefSkeletonOnSubstrate(scan.group,substrate);
    assert.equal(result.vertexSamples,scan.geometry.getAttribute('position').count);
    assert.ok(Math.abs(result.minVertexGapM-.004)<1e-10);assert.ok(result.nearContactVertices>0);
    assert.equal(result.physicalScaleMultiplier,1);assert.deepEqual(scan.group.scale.toArray(),[1,1,1]);
    assert.deepEqual(scan.geometry.getAttribute('position').array,before);
    assert.ok(result.maxVertexGapM>result.minVertexGapM+.343);
    const ray=new THREE.Raycaster(),point=new THREE.Vector3();ray.firstHitOnly=true;
    const positions=scan.geometry.getAttribute('position');
    scan.group.updateMatrixWorld(true);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(scan.group.children[0].matrixWorld);
      ray.set(new THREE.Vector3(point.x,5,point.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(substrate)[0];assert.ok(hit);assert.ok(point.y-hit.point.y>=.004-1e-10);
    }
    const first=scan.group.position.toArray(),again=placeReefSkeletonOnSubstrate(scan.group,substrate);
    assert.deepEqual(again.rootPositionM,first);assert.deepEqual(again.boundsM,result.boundsM);
  }finally{scan.dispose();geometry.dispose();material.dispose();}
});

test('footprint gaps, invalid values, scaling and mounted roots fail without leaving a shifted scan',()=>{
  const scan=synthetic(),geometry=createReefRockGeometry(REEF_ROCKS[5],{bedSupported:true}),material=new THREE.MeshStandardMaterial();
  const substrate=new THREE.Mesh(geometry,material);scan.group.position.set(1,2,3);
  try{
    assert.throws(()=>placeReefSkeletonOnSubstrate(scan.group,substrate,{x:40,z:30}),/足迹/);
    assert.deepEqual(scan.group.position.toArray(),[1,2,3]);
    assert.throws(()=>placeReefSkeletonOnSubstrate(scan.group,substrate,{clearanceM:-1}),/参数/);
    assert.throws(()=>placeReefSkeletonOnSubstrate(scan.group,substrate,{x:NaN}),/参数/);
    scan.group.scale.setScalar(2);assert.throws(()=>placeReefSkeletonOnSubstrate(scan.group,substrate),/原比例/);
    scan.group.scale.setScalar(1);const parent=new THREE.Group();parent.add(scan.group);
    assert.throws(()=>placeReefSkeletonOnSubstrate(scan.group,substrate),/独立根节点/);
  }finally{scan.dispose();geometry.dispose();material.dispose();}
});

test('all 115927 displayed 150k scan vertices clear actual rendered rock triangles without altering source geometry',async()=>{
  const scan=await decodeReefScanForInspection({detail:'low'}),geometry=createReefRockGeometry(REEF_ROCKS[5],{bedSupported:true}),material=new THREE.MeshStandardMaterial();
  const substrate=new THREE.Mesh(geometry,material);enableStaticRayQueries(substrate);
  try{
    prepareReefSkeletonDisplay(scan.group);
    const position=scan.geometry.attributes.position,before=position.array.slice();
    const placement=placeReefSkeletonOnSubstrate(scan.group,substrate);
    assert.equal(placement.vertexSamples,115927);assert.deepEqual(position.array,before);
    assert.deepEqual(scan.group.scale.toArray(),[1,1,1]);assert.ok(Math.abs(placement.minVertexGapM-.004)<1e-9);
    scan.group.updateMatrixWorld(true);substrate.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),point=new THREE.Vector3();ray.firstHitOnly=true;
    let min=Infinity,max=-Infinity,nearContact=0;
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(scan.group.children[0].matrixWorld);
      ray.set(new THREE.Vector3(point.x,5,point.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(substrate,false)[0];assert.ok(hit);
      const gap=point.y-hit.point.y;assert.ok(gap>=.004-1e-9);
      min=Math.min(min,gap);max=Math.max(max,gap);if(gap<=.005)nearContact++;
    }
    assert.ok(Math.abs(min-placement.minVertexGapM)<1e-9);assert.ok(Math.abs(max-placement.maxVertexGapM)<1e-9);
    assert.equal(nearContact,placement.nearContactVertices);
  }finally{scan.dispose();geometry.dispose();material.dispose();}
});
