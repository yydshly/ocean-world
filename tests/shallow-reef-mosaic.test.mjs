import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {unifyMarineMaterial,gradeMarineColour} from '../src/world/ShallowMarineAppearance.js';
import {deformMaterial} from '../src/world/ShallowSourcedFishAssets.js';
import {shallowSampleCoralGeometries,shallowSampleCoralKey} from '../src/world/shallowSampleCoralAssets.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('shared animal appearance preserves source swim shader, maps, alpha and bounded RGB',()=>{
  const clock={value:4},map=new THREE.Texture(),m=deformMaterial(new THREE.MeshStandardMaterial({map,transparent:true,opacity:.8,alphaTest:.12}),clock);
  const key=m.customProgramCacheKey();unifyMarineMaterial(m);const once=m.onBeforeCompile;unifyMarineMaterial(m);assert.equal(m.onBeforeCompile,once);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.sampleSwimTime,clock);assert.ok(shader.vertexShader.includes('transformed.z+=sourcedWave()'));
  assert.equal(shader.fragmentShader.split('float marineLuma=').length,2);assert.ok(m.customProgramCacheKey().startsWith(key));
  assert.equal(m.map,map);assert.equal(m.opacity,.8);assert.equal(m.alphaTest,.12);assert.equal(m.transparent,true);
  for(const value of ['#000000','#ffffff','#ff0033','#0011ff']){
    const c=new THREE.Color(value),l=c.r*.2126+c.g*.7152+c.b*.0722;gradeMarineColour(c);
    assert.ok(Math.abs(c.r*.2126+c.g*.7152+c.b*.0722-l)<1e-12);
    assert.ok([c.r,c.g,c.b].every(n=>n>=0&&n<=1));
  }m.dispose();map.dispose();
});

test('lower continuous hard reef retains open branching sources, four fitted lamina forms and a bounded complete community',()=>{
  const near=shallowSampleCoralGeometries(),far=shallowSampleCoralGeometries('distant'),world=new ShallowSampleScene();
  try{
    const branch=Object.entries(near).filter(([k])=>k.startsWith('branching-'));
    assert.equal(new Set(branch.map(([,g])=>g.userData.sourceKey)).size,2);
    const forms=new Set(world.model.corals.filter(c=>c.form==='table').map(c=>c.assetVariant));assert.equal(forms.size,4);
    const branching=world.model.corals.filter(c=>c.form==='branching');
    assert.ok(branching.every(c=>c.assetVariant<2),'rejected compact stone-like source returned');
    // Whole source reefs already include many colonies. Keep the original
    // minimum for fitted front cover without stacking the old 579 separate
    // crowns through the new source mesh just to preserve its old counter.
    assert.ok(world.model.corals.length>=150,'unreplaced outer reef cover retained');
    assert.equal(world.model.rocks.filter(r=>r.fieldAsset==='habitat-bank').length,12);
    assert.equal(world.model.rocks.filter(r=>r.fieldAsset).length,70);
    for(const c of world.model.corals){const key=shallowSampleCoralKey(c);assert.ok(near[key]&&far[key]);assert.ok(far[key].index.count<near[key].index.count);}
    let meshes=0;world.scene.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<350);
    assert.equal(world.model.agents.length,293);assert.equal(new Set(world.model.agents.map(a=>a.speciesId)).size,38);
    for(const batch of world.animals.batches)for(const {mesh}of batch.parts)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])
      if(m.isMeshStandardMaterial||m.isMeshPhongMaterial)assert.ok(m.userData.sampleMarineAppearance);
  }finally{world.dispose();[...Object.values(near),...Object.values(far)].forEach(g=>g.dispose());}
});
