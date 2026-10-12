import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('view selection keeps every visible full instance exactly once, preserves matrices and reduces submitted reef geometry',()=>{
  const world=new ShallowSampleScene(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  let submitted=0,unfiltered=0;
  try{
    const identities=world.model.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
    world.camera.aspect=16/9;world.camera.updateProjectionMatrix();
    for(const time of [0,18,24,39,58,69,75]){
      world.update(time);world.camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse));
      const groups=[...world.nearCommunity.reefBatches,...world.coralBatches.map(b=>b.visibility)];
      for(const batch of groups){
        const indices=[...batch.nearIndices,...batch.farIndices],selected=new Set(indices);
        assert.equal(selected.size,indices.length,'one object is drawn at both detail levels');
        for(let i=0;i<batch.count;i++)if(!batch.excluded.has(i)&&frustum.intersectsSphere(batch.spheres[i]))assert.ok(selected.has(i),'visible object omitted');
        for(const [meshes,ids]of [[batch.nearMeshes,batch.nearIndices],[batch.farMeshes,batch.farIndices]])for(const mesh of meshes){
          assert.equal(mesh.count,ids.length);assert.equal(mesh.visible,ids.length>0);
          for(let i=0;i<ids.length;i++){mesh.getMatrixAt(i,matrix);assert.deepEqual(matrix.elements,batch.matrices[ids[i]].elements,'compaction moved or resized a colony');}
          submitted+=mesh.geometry.index.count/3*mesh.count;
        }
        unfiltered+=batch.nearMeshes.reduce((n,m)=>n+m.geometry.index.count/3,0)*batch.count;
      }
    }
    assert.deepEqual(world.model.agents.map(a=>[a.id,a.speciesId,a.sizeM]),identities);
    assert.ok(submitted<unfiltered*.50,`submitted ${(submitted/unfiltered*100).toFixed(1)}% of full near geometry`);
    assert.equal(world.animals.openCommunity.models.has('giant-trevally'),false,'visually rejected photographic specimen returned');
    assert.equal(world.animals.cohesive.models.has('giant-trevally'),true,'existing coherent swimmer family disappeared');
  }finally{world.dispose();}
});
