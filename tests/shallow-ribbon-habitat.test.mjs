import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shallowMeadowRibbonGeometry} from '../src/world/ShallowMeadowRibbonAssets.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('curved ribbon leaves retain exact substrate roots, finite shared topology and the existing geometry budget',()=>{
  const g=shallowMeadowRibbonGeometry(),p=g.attributes.position,r=g.attributes.rootXZ;
  try{
    assert.equal(g.index.count/3,768);assert.equal(p.count,960);
    assert.ok(g.index.array.every(i=>i<p.count));assert.ok(g.attributes.normal.array.every(Number.isFinite));
    let curved=0;
    for(let leaf=0;leaf<96;leaf++){
      const start=leaf*10,rx=r.getX(start),rz=r.getY(start);
      for(let i=start;i<start+10;i++){
        assert.equal(r.getX(i),rx);assert.equal(r.getY(i),rz);
        assert.ok(p.getY(i)>=0&&p.getY(i)<=1);
        assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.52);
      }
      assert.equal(p.getX(start),rx);assert.equal(p.getZ(start),rz);assert.equal(p.getY(start),0);
      if(Math.hypot(p.getX(start+8)-rx,p.getZ(start+8)-rz)>.12)curved++;
    }
    assert.equal(curved,96,'whole family regressed to vertical brush blades');
  }finally{g.dispose();}
});

test('moving animal batch culling contains complete posed mesh bounds and skips offscreen draws without deleting animals',()=>{
  const world=new ShallowSampleScene(),v=new THREE.Vector3(),instance=new THREE.Matrix4(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  let totalDraws=0,visibleDraws=0;
  try{
    const identities=world.model.agents.map(a=>a.id);
    for(const t of [0,18,24,39,58,69,75]){
      world.update(t);world.scene.updateMatrixWorld(true);world.camera.updateMatrixWorld(true);world.camera.aspect=16/9;world.camera.updateProjectionMatrix();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse));
      for(const batch of world.animals.batches)for(const {mesh}of batch.parts){
        assert.equal(mesh.frustumCulled,true);assert.ok(mesh.boundingSphere.radius>0);totalDraws++;
        if(frustum.intersectsObject(mesh))visibleDraws++;
        mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,instance);
          for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
            v.set(x,y,z).applyMatrix4(instance);
            assert.ok(v.distanceTo(mesh.boundingSphere.center)<=mesh.boundingSphere.radius+1e-4,`${batch.id}: culling clips posed body`);
          }
        }
      }
    }
    assert.deepEqual(world.model.agents.map(a=>a.id),identities);assert.equal(identities.length,293);
    assert.ok(visibleDraws<totalDraws*.8,'offscreen batches still all submit draw calls');
    // Source meshes for these selected families must not be instantiated twice.
    for(const batch of world.animals.batches.filter(b=>b.assetFamily==='cohesive-fish'))assert.ok(!world.animals.natural.models.has(batch.id));
  }finally{world.dispose();}
});
