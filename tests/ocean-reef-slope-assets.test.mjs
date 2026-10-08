import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OCEAN_REEF_SLOPE_SPECIES } from '../src/oceanReefSlopeSpecies.js';
import { createReefSlopeAnimal, animateReefSlopeAnimal, disposeReefSlopeAnimal, reefSlopeAnimalAssetStats } from '../src/world/OceanReefSlopeAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

const sBottom=id=>OCEAN_REEF_SLOPE_SPECIES.find(s=>s.id===id)?.bottom;
function points(root){root.updateMatrixWorld(true);const values=[];root.traverse(o=>{
  if(o.isMesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)values.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}
});return values;}
for(const s of OCEAN_REEF_SLOPE_SPECIES)test(`${s.id}: complete independent form and bounded animation remain inside native admission envelope`,()=>{
  const root=createReefSlopeAnimal(s);try{
    assert.equal(root.userData.sizeMeasure,s.sizeMeasure);assert.equal(root.userData.independentAnimal,true);
    assert.equal(root.userData.emissionEnabled,false);assert.ok(root.children.length>=6);
    const original=points(root);const box=new THREE.Box3().setFromPoints(original);
    if(s.kind==='ray'){assert.ok(Math.abs(box.max.z-.5)<1e-6&&Math.abs(box.min.z+.5)<1e-6);assert.ok(box.min.x<-2.30);}
    else {assert.ok(Math.abs(box.min.x+.5)<1e-6);assert.ok(Math.abs(box.max.x-.5)<1e-6);}
    for(let i=0;i<24;i++){
      animateReefSlopeAnimal(root,{alive:true,state:i%2?'resting':'reef-cruising',velocity:{x:.2,y:0,z:0}},i*.43);
      for(const p of points(root))for(const [axis,span]of[['x',s.normalizedEnvelope.x],['y',s.normalizedEnvelope.y],['z',s.normalizedEnvelope.z]]){
        assert.ok(Number.isFinite(p[axis]));assert.ok(p[axis]>=span[0]-1e-6&&p[axis]<=span[1]+1e-6,`${s.id} ${axis} ${p[axis]}`);
      }
    }
    animateReefSlopeAnimal(root,{alive:false},8);const dead=points(root).map(p=>p.toArray());animateReefSlopeAnimal(root,{alive:false},19);
    assert.deepEqual(points(root).map(p=>p.toArray()),dead);
  }finally{disposeReefSlopeAnimal(root);}
  assert.deepEqual(reefSlopeAnimalAssetStats(),{resources:0,instances:0});
});
test('shared immutable resources have independent poses, deterministic clocks and complete release',()=>{
  const a=createReefSlopeAnimal('bigscale-soldierfish'),b=createReefSlopeAnimal('bigscale-soldierfish'),c=createReefSlopeAnimal('banded-lizardfish');
  const state=r=>r.userData.motion.tail.rotation.y, before=state(b),geometry=a.children.find(o=>o.isMesh).geometry;
  const raw=Array.from(geometry.getAttribute('position').array);
  assert.equal(geometry,b.children.find(o=>o.isMesh).geometry);
  animateReefSlopeAnimal(a,{alive:true,velocity:{x:1}},3.2);assert.equal(state(b),before);assert.deepEqual(Array.from(geometry.getAttribute('position').array),raw);
  const at=state(a);animateReefSlopeAnimal(a,{alive:true,velocity:{x:1}},3.2);assert.equal(state(a),at);
  disposeReefSlopeAnimal(a);assert.equal(reefSlopeAnimalAssetStats().instances,2);disposeReefSlopeAnimal(b);disposeReefSlopeAnimal(c);
  assert.deepEqual(reefSlopeAnimalAssetStats(),{resources:0,instances:0});assert.equal(disposeReefSlopeAnimal(c),false);
});
test('actual regional dispatcher renders all four using saved scale, heading, pitch and owner clock without writing records',()=>{
  const agents=OCEAN_REEF_SLOPE_SPECIES.map((s,i)=>({id:`visitor:${i}`,speciesId:s.id,regionId:'204,4',alive:true,
    sizeM:s.lengthM,position:{x:13100+i*3,y:-3,z:280},heading:.7,pitch:s.bottom?0:.08,supportNormal:{x:.04,y:Math.sqrt(1-.04**2),z:0},timeSec:3.1,
    velocity:{x:.1,y:0,z:0},state:'reef-cruising'})),before=structuredClone(agents),renderer=new OceanAnimals(livingShallowsSpeciesCatalog);
  try{
    renderer.update(agents,999,{x:13056,z:256});assert.equal(renderer.entities.size,4);
    for(const a of agents){const o=renderer.getObject(a.id);assert.equal(o.userData.speciesId,a.speciesId);assert.equal(o.scale.x,a.sizeM);
      if(!sBottom(a.speciesId))assert.equal(o.rotation.z,a.pitch);
      else {const up=new THREE.Vector3(0,1,0).applyQuaternion(o.quaternion);assert.ok(up.distanceTo(new THREE.Vector3(...Object.values(a.supportNormal)))<1e-8);}assert.equal(o.position.x,a.position.x);
      const expected=createReefSlopeAnimal(a.speciesId);expected.userData.phase=o.userData.phase;animateReefSlopeAnimal(expected,a,a.timeSec);
      assert.equal(o.userData.motion.tail.rotation.y,expected.userData.motion.tail.rotation.y);disposeReefSlopeAnimal(expected);
    }
    assert.deepEqual(agents,before);renderer.update(agents,2000,{x:13056,z:256});assert.deepEqual(agents,before);
    renderer.update([],2000);assert.equal(renderer.root.children.length,0);assert.equal(renderer.entities.size,0);
    renderer.update(agents,2000);assert.equal(renderer.entities.size,4);
  }finally{renderer.dispose();}
  assert.deepEqual(reefSlopeAnimalAssetStats(),{resources:0,instances:0});
});
test('shipped constructor gates slope recipe to living shallows and preserves it through reset',async()=>{
  assert.equal(livingShallowsSpeciesCatalog.length,85);
  for(const s of OCEAN_REEF_SLOPE_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);
    for(const biome of ['reef','kelp','deep'])assert.ok(!sceneCatalogs[biome].some(x=>x.id===s.id));}
  const src=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=src.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=src.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('57'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  for(const living of [true,false])for(const variant of[null,'habitat-layers','sand-corridor','reef-slope']){
    const captured=new Function('OceanEcology','seed',`return ${src.slice(start,end)};`).call({isLivingShallows:living,oceanWorldVariant:variant,oceanChunks:{generator}},Capture,seed);
    const expected=living&&!['habitat-layers','sand-corridor'].includes(variant);assert.equal(captured.options.reefSlopeCommunity,expected);
    const model=new OceanEcology(seed,generator,{...captured.options,store:{load:async()=>null,saveMany:async()=>{},save:async()=>{}}});
    try{assert.equal(model.reefSlopeCommunityEnabled,expected);model.reset(seed,generator);assert.equal(model.reefSlopeCommunityEnabled,expected);assert.equal(model._active.size,0);if(living&&variant)assert.ok(model._world.startsWith(`ecology-v1-copy:${variant}:`));assert.equal(model._randomWorld,`ecology-v1:string:${seed}`);}
    finally{await model.dispose();}
  }
  const disabled=new OceanEcology(seed,generator,{reefSlopeCommunity:true,store:{load:async()=>null,saveMany:async()=>{},save:async()=>{}}});
  try{assert.equal(disabled.reefSlopeCommunityEnabled,false);}finally{await disabled.dispose();}
});
