import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { decodeReefScanForInspection } from '../scripts/lib/decode-reef-scan.mjs';
import { prepareReefSkeletonDisplay, REEF_SCAN_MOUNT_CUT_Y_M } from '../src/world/reefScanDisplay.js';

test('actual immutable museum scan retains every triangle above the display cut with UV and metre scale',async()=>{
  const scan=await decodeReefScanForInspection();
  try{
    const oldPosition=scan.geometry.attributes.position.clone(),oldNormal=scan.geometry.attributes.normal.clone(),oldUv=scan.geometry.attributes.uv.clone(),oldIndex=scan.geometry.index.clone();
    const record=prepareReefSkeletonDisplay(scan.group),row=record.meshes[0],position=scan.geometry.attributes.position,normal=scan.geometry.attributes.normal,uv=scan.geometry.attributes.uv,index=scan.geometry.index;
    assert.equal(row.sourceTriangles,20000);assert.equal(row.removedTriangles,892);assert.equal(row.clippedSourceTriangles,70);
    assert.equal(row.unchangedSourceTriangles,19038);assert.equal(row.displayTriangles,19146);assert.equal(row.physicalScaleMultiplier,1);
    assert.ok(Math.abs(row.boundsM.size[0]-.6265922784805298)<1e-12);assert.ok(Math.abs(row.boundsM.size[2]-.4115196466445923)<1e-12);
    assert.equal(row.boundsM.min[1],0);assert.ok(Math.abs(row.boundsM.max[1]-.2832714319229126)<1e-12);
    const key=(p,n,u,i,yOffset=0)=>[p.getX(i),Math.fround(p.getY(i)+yOffset),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),u.getX(i),u.getY(i)].join('/');
    const triangleKey=(p,n,u,indices,k,yOffset=0)=>[0,1,2].map(j=>key(p,n,u,indices.getX(k+j),yOffset)).join('|');
    const actual=new Set();for(let k=0;k<index.count;k+=3)actual.add(triangleKey(position,normal,uv,index,k));
    let checked=0;
    for(let k=0;k<oldIndex.count;k+=3){
      if([0,1,2].some(j=>oldPosition.getY(oldIndex.getX(k+j))<REEF_SCAN_MOUNT_CUT_Y_M))continue;
      assert.ok(actual.has(triangleKey(oldPosition,oldNormal,oldUv,oldIndex,k,-REEF_SCAN_MOUNT_CUT_Y_M)),'Original upper triangle, winding, normal and UV retained');checked++;
    }
    assert.equal(checked,19038);
    for(const attribute of Object.values(scan.geometry.attributes)){
      assert.equal(attribute.count,position.count);for(const value of attribute.array)assert.ok(Number.isFinite(value));
    }
    for(const value of index.array)assert.ok(value>=0&&value<position.count);
    assert.throws(()=>prepareReefSkeletonDisplay(scan.group),/只执行一次/);
  }finally{scan.dispose();}
});

test('crossing triangles clip to the plane with their winding preserved',()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,.12,0,0,.12,1],3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,-1,0,0,-1,0,0,-1,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));geometry.setIndex([0,1,2]);
  const material=new THREE.MeshStandardMaterial(),group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));
  try{
    const record=prepareReefSkeletonDisplay(group);assert.equal(record.meshes[0].displayTriangles,2);
    const p=geometry.attributes.position,triangle=new THREE.Triangle();
    for(let i=0;i<geometry.index.count;i+=3){triangle.setFromAttributeAndIndices(p,geometry.index.getX(i),geometry.index.getX(i+1),geometry.index.getX(i+2));assert.ok(triangle.getNormal(new THREE.Vector3()).y<0);assert.ok(triangle.getArea()>0);}
    assert.ok(p.array.every(Number.isFinite));assert.equal(geometry.boundingBox.min.y,0);
  }finally{geometry.dispose();material.dispose();}
});

test('150k display preserves every original upper triangle and its normal/UV at the original metre scale',async()=>{
  const scan=await decodeReefScanForInspection({detail:'low'});
  try{
    const p=scan.geometry.attributes.position.clone(),n=scan.geometry.attributes.normal.clone(),uv=scan.geometry.attributes.uv.clone(),indices=scan.geometry.index.clone();
    const record=prepareReefSkeletonDisplay(scan.group),cut=record.meshes[0];
    assert.deepEqual([cut.sourceTriangles,cut.removedTriangles,cut.clippedSourceTriangles,cut.unchangedSourceTriangles,cut.displayTriangles,cut.displayVertices],[150000,9330,206,140464,140772,115927]);
    assert.equal(cut.basalCutCapped,false);assert.equal(cut.physicalScaleMultiplier,1);assert.deepEqual(scan.group.scale.toArray(),[1,1,1]);
    assert.equal(cut.boundsM.min[1],0);
    for(const [axis,size] of [[0,.6287682056427002],[1,.28441500663757324],[2,.4138900935649872]])assert.ok(Math.abs(cut.boundsM.size[axis]-size)<1e-12);
    const key=(position,normal,tex,index,k,offset=0)=>[0,1,2].map(j=>{
      const i=index.getX(k+j);return [position.getX(i),Math.fround(position.getY(i)+offset),position.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i),tex.getX(i),tex.getY(i)].join('/');
    }).join('|');
    const after=scan.geometry,actual=new Set();
    for(let k=0;k<after.index.count;k+=3)actual.add(key(after.attributes.position,after.attributes.normal,after.attributes.uv,after.index,k));
    let retained=0;
    for(let k=0;k<indices.count;k+=3){
      if([0,1,2].some(j=>p.getY(indices.getX(k+j))<REEF_SCAN_MOUNT_CUT_Y_M))continue;
      assert.ok(actual.has(key(p,n,uv,indices,k,-REEF_SCAN_MOUNT_CUT_Y_M)));retained++;
    }
    assert.equal(retained,140464);
    for(const attribute of Object.values(after.attributes))assert.ok(attribute.array.every(Number.isFinite));
    for(const value of after.index.array)assert.ok(value>=0&&value<after.attributes.position.count);
  }finally{scan.dispose();}
});
