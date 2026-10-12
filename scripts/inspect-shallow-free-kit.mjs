// Model-time sampling and actual displayed vertices, never a browser/FPS test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {ShallowSampleScene as Before} from '../output/validation/shallow-free-kit/before-src/world/ShallowSampleScene.js';
import {sampleArtistVertex} from '../src/world/ShallowArtistFish.js';
const folder='output/validation/shallow-free-kit',before=new Before(55),after=new ShallowSampleScene(55);
const counts=w=>({animals:w.model.agents.length,species:new Set(w.model.agents.map(a=>a.speciesId)).size,corals:w.model.corals.length,slopeCorals:w.model.corals.filter(c=>c.growthPatch).length,rocks:w.model.rocks.length});
try{
  const oldIds=new Map(before.model.agents.map(a=>[a.id,a])),newIds=new Map(after.model.agents.map(a=>[a.id,a]));
  const removed=before.model.agents.filter(a=>!newIds.has(a.id)),added=after.model.agents.filter(a=>!oldIds.has(a.id));
  assert.equal(removed.length,2);assert.ok(removed.every(a=>a.speciesId==='green-turtle'&&a.home.x>0));
  assert.equal(added.length,10);assert.equal(added.filter(a=>a.speciesId==='yellow-tang').length,8);
  for(const a of after.model.agents)if(oldIds.has(a.id)){const old=oldIds.get(a.id);assert.equal(a.speciesId,old.speciesId);assert.equal(a.sizeM,old.sizeM);}
  assert.deepEqual(after.model.rocks,before.model.rocks);assert.deepEqual(after.model.bed.heights,before.model.bed.heights);
  let meshes=0;after.scene.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<350);
  const sourceColonies=after.coralBatches.filter(b=>b.nearGeometry.userData.sourceKey).reduce((n,b)=>n+b.mesh.count,0);assert.ok(sourceColonies>100);
  const point=new THREE.Vector3(),part=new THREE.Vector3(),matrix=new THREE.Matrix4();let vertices=0,minGap=Infinity;
  const batches=after.animals.batches.filter(b=>['yellow-tang','hawksbill-turtle'].includes(b.id));
  for(let t=0;t<=75;t+=2.5){
    after.update(t);after.scene.updateMatrixWorld(true);
    for(const batch of batches)for(const {mesh} of batch.parts)for(let instance=0;instance<mesh.count;instance++){
      mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld);const g=mesh.geometry;
      const weights=mesh.morphTexture?.source.data.data.slice(instance*9+1,instance*9+9);
      for(let i=0;i<g.attributes.position.count;i++){
        if(weights){point.set(0,0,0);for(let k=0;k<8;k++)if(weights[k])point.addScaledVector(part.fromBufferAttribute(g.morphAttributes.position[k],i),weights[k]);}
        else sampleArtistVertex(g,i,t,g.attributes.artistPhase.getX(instance),point);
        point.applyMatrix4(matrix);const gap=point.y-after.model.surface(point.x,point.z,true);minGap=Math.min(minGap,gap);vertices++;assert.ok(gap>=-6e-6,`${batch.id} at ${t}: ${gap}`);
      }
    }
  }
  const result={date:'2026-10-11',before:counts(before),after:counts(after),removed:removed.map(a=>[a.id,a.speciesId]),added:added.map(a=>[a.id,a.speciesId]),unchangedOriginalIdentityAndSize:after.model.agents.length-added.length,bedAnd85RocksExact:true,sourceColonies,meshObjects:meshes,motionCheck:{modelSeconds:75,stepSeconds:2.5,vertices,minGapM:minGap,continuousCollision:false},acceptance:{nativeGeometry:'passed',wholeScene:'pending',webgl75SecondPlayback:'unverified',fps:'unverified'}};
  fs.writeFileSync(`${folder}/stage.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{before.dispose();after.dispose();}
