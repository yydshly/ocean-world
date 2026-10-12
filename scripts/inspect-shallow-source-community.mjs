// Finite native geometry check; not browser playback or continuous collision.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {ShallowSampleScene as BeforeScene} from '../output/validation/shallow-source-community/before-src/world/ShallowSampleScene.js';

const folder='output/validation/shallow-source-community',before=new BeforeScene(55),after=new ShallowSampleScene(55);
const counts=w=>({animals:w.model.agents.length,species:new Set(w.model.agents.map(a=>a.speciesId)).size,rocks:w.model.rocks.length,corals:w.model.corals.length,slopeCorals:w.model.corals.filter(c=>c.growthPatch).length,grass:w.model.grass.length,rubble:w.model.rubble.length});
try{
  const oldIds=new Set(before.model.agents.map(a=>a.id)),identity=a=>[a.id,a.speciesId,a.sizeM];
  assert.deepEqual(after.model.agents.filter(a=>oldIds.has(a.id)).map(identity),before.model.agents.map(identity));
  assert.deepEqual(after.model.rocks,before.model.rocks);assert.deepEqual(after.model.bed.heights,before.model.bed.heights);
  assert.deepEqual(after.model.corals,before.model.corals);assert.deepEqual(after.model.grass,before.model.grass);assert.deepEqual(after.model.rubble,before.model.rubble);
  const added=after.model.agents.filter(a=>!oldIds.has(a.id));assert.equal(added.length,1);assert.equal(added[0].speciesId,'hawksbill-turtle');
  let meshes=0;after.scene.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<350);
  assert.ok(after.model.corals.every(c=>!c.fieldAsset&&!c.scanAsset));
  const batch=after.animals.batches.find(b=>b.id==='hawksbill-turtle'),matrix=new THREE.Matrix4(),combined=new THREE.Matrix4(),v=new THREE.Vector3(),partVertex=new THREE.Vector3();
  let vertices=0,minGap=Infinity,motionFrames=0;
  for(let frame=0;frame<=150;frame++){
    const time=frame*.5;after.update(time);after.scene.updateMatrixWorld(true);motionFrames++;
    for(const {mesh,source}of batch.parts){
      mesh.getMatrixAt(0,matrix);combined.multiplyMatrices(mesh.matrixWorld,matrix);
      const g=mesh.geometry,weights=source.morphTargetInfluences,gpuWeights=mesh.morphTexture.source.data.data;
      for(let k=0;k<weights.length;k++)assert.ok(Math.abs(weights[k]-gpuWeights[k+1])<1e-6);
      for(let i=0;i<g.attributes.position.count;i++){
        v.set(0,0,0);for(let k=0;k<weights.length;k++)if(weights[k])v.addScaledVector(partVertex.fromBufferAttribute(g.morphAttributes.position[k],i),weights[k]);
        assert.ok(Math.hypot(v.x,v.z)*batch.agents[0].sizeM<=batch.agents[0].clearance.radius+1e-7);
        v.applyMatrix4(combined);const gap=v.y-after.model.surface(v.x,v.z,true);minGap=Math.min(minGap,gap);vertices++;assert.ok(gap>=-6e-6,`turtle enters substrate at ${time}: ${gap}`);
      }
    }
  }
  const reference=JSON.parse(fs.readFileSync('output/validation/shallow-coherent-habitat/final/render.json','utf8'));
  const cameras=reference.frames.map(f=>{after.update(f.time);after.camera.aspect=f.width/f.height;after.camera.updateProjectionMatrix();after.camera.updateMatrixWorld(true);return {time:f.time,defaultMatrixMaxAbsError:Math.max(...after.camera.matrixWorld.toArray().map((v,i)=>Math.abs(v-f.cameraMatrix[i])))};});
  after.update(58);after.camera.updateMatrixWorld(true);const {x,y,z}=added[0].position,p=new THREE.Vector3(x,y,z);
  const ndc=p.clone().project(after.camera);assert.ok(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1&&Math.abs(ndc.z)<1,'new animal absent from 58s frame');
  const receipt={schema:'shallow-source-community-stage-v1',batch:16,date:'2026-10-11',seed:55,scope:'local source-asset candidate; one hawksbill retained, three coral scans rejected',before:counts(before),after:counts(after),preservation:{original284IdentitySpeciesSizeExact:true,bedHeightsExact:true,all85RocksExact:true,defaultCoralsGrassRubbleExact:true,persistentExplorationChanged:false},added:added.map(identity),native:{kind:'native model and actual vertices; no WebGL/GPU/FPS/startup claim',meshObjects:meshes,meshBudgetStrictlyLessThan:350,sourceTurtleClearance:{modelSeconds:75,stepSeconds:.5,motionFrames,vertices,minGapM:minGap,continuousCollision:false},turtleAt58:{ndc:ndc.toArray(),distanceM:p.distanceTo(after.camera.position)}},cameras,coralDecision:{defaultEnabled:false,reason:'Source survey basal patches make the whole reef darker and flatter; rejected after four-frame candidate review. No extra cleanup loop.',candidatePath:'D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-source-community/candidate',trialSelector:null},acceptance:{animals:'one visible source animal improvement; main shoals and two green turtles unchanged',reef:'failed candidate; default previous assets retained',documentaryRealism:false,webgl75SecondPlayback:'unverified'},checks:{suite:'pending',build:'pending'}};
  fs.writeFileSync(`${folder}/stage.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{before.dispose();after.dispose();}
