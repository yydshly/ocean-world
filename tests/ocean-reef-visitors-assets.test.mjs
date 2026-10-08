import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OCEAN_REEF_VISITORS_SPECIES } from '../src/oceanReefVisitorsSpecies.js';
import { createReefVisitor, animateReefVisitor, disposeReefVisitor, reefVisitorAssetStats } from '../src/world/OceanReefVisitorsAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

function points(root){root.updateMatrixWorld(true);const values=[];root.traverse(o=>{
  if(o.isMesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)values.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}
});return values;}
for(const s of OCEAN_REEF_VISITORS_SPECIES)test(`${s.id}: complete independent form and bounded animation remain inside native admission envelope`,()=>{
  const root=createReefVisitor(s);try{
    assert.equal(root.userData.sizeMeasure,s.sizeMeasure);assert.equal(root.userData.independentAnimal,true);
    assert.equal(root.userData.emissionEnabled,false);assert.ok(root.children.length>=6);
    const original=points(root);const box=new THREE.Box3().setFromPoints(original);
    if(s.kind==='ray'){assert.ok(Math.abs(box.max.z-.5)<1e-6&&Math.abs(box.min.z+.5)<1e-6);assert.ok(box.min.x<-2.30);}
    else {assert.ok(Math.abs(box.min.x+.5)<1e-6);assert.ok(Math.abs(box.max.x-.5)<1e-6);}
    for(let i=0;i<24;i++){
      animateReefVisitor(root,{alive:true,state:i%2?'resting':'reef-cruising',velocity:{x:.2,y:0,z:0}},i*.43);
      for(const p of points(root))for(const [axis,span]of[['x',s.normalizedEnvelope.x],['y',s.normalizedEnvelope.y],['z',s.normalizedEnvelope.z]]){
        assert.ok(Number.isFinite(p[axis]));assert.ok(p[axis]>=span[0]-1e-6&&p[axis]<=span[1]+1e-6,`${s.id} ${axis} ${p[axis]}`);
      }
    }
    animateReefVisitor(root,{alive:false},8);const dead=points(root).map(p=>p.toArray());animateReefVisitor(root,{alive:false},19);
    assert.deepEqual(points(root).map(p=>p.toArray()),dead);
  }finally{disposeReefVisitor(root);}
  assert.deepEqual(reefVisitorAssetStats(),{resources:0,instances:0});
});
test('shared immutable resources have independent poses, deterministic clocks and complete release',()=>{
  const a=createReefVisitor('bluefin-trevally'),b=createReefVisitor('bluefin-trevally'),c=createReefVisitor('spotted-eagle-ray');
  const state=r=>r.userData.motion.tail.rotation.y, before=state(b),geometry=a.children.find(o=>o.isMesh).geometry;
  const raw=Array.from(geometry.getAttribute('position').array);
  assert.equal(geometry,b.children.find(o=>o.isMesh).geometry);
  animateReefVisitor(a,{alive:true,velocity:{x:1}},3.2);assert.equal(state(b),before);assert.deepEqual(Array.from(geometry.getAttribute('position').array),raw);
  const at=state(a);animateReefVisitor(a,{alive:true,velocity:{x:1}},3.2);assert.equal(state(a),at);
  disposeReefVisitor(a);assert.equal(reefVisitorAssetStats().instances,2);disposeReefVisitor(b);disposeReefVisitor(c);
  assert.deepEqual(reefVisitorAssetStats(),{resources:0,instances:0});assert.equal(disposeReefVisitor(c),false);
});
test('actual regional dispatcher renders all four using saved scale, heading, pitch and owner clock without writing records',()=>{
  const agents=OCEAN_REEF_VISITORS_SPECIES.map((s,i)=>({id:`visitor:${i}`,speciesId:s.id,regionId:'204,4',alive:true,
    sizeM:s.lengthM,position:{x:13100+i*3,y:-3,z:280},heading:.7,pitch:.08,timeSec:3.1,
    velocity:{x:.1,y:0,z:0},state:'reef-cruising'})),before=structuredClone(agents),renderer=new OceanAnimals(livingShallowsSpeciesCatalog);
  try{
    renderer.update(agents,999,{x:13056,z:256});assert.equal(renderer.entities.size,4);
    for(const a of agents){const o=renderer.getObject(a.id);assert.equal(o.userData.speciesId,a.speciesId);assert.equal(o.scale.x,a.sizeM);
      assert.equal(o.rotation.z,a.pitch);assert.equal(o.position.x,a.position.x);
      const expected=createReefVisitor(a.speciesId);expected.userData.phase=o.userData.phase;animateReefVisitor(expected,a,a.timeSec);
      assert.equal(o.userData.motion.tail.rotation.y,expected.userData.motion.tail.rotation.y);disposeReefVisitor(expected);
    }
    assert.deepEqual(agents,before);renderer.update(agents,2000,{x:13056,z:256});assert.deepEqual(agents,before);
    renderer.update([],2000);assert.equal(renderer.root.children.length,0);assert.equal(renderer.entities.size,0);
    renderer.update(agents,2000);assert.equal(renderer.entities.size,4);
  }finally{renderer.dispose();}
  assert.deepEqual(reefVisitorAssetStats(),{resources:0,instances:0});
});
test('shipped constructor gates visitor recipe to living shallows and preserves it through reset',async()=>{
  assert.equal(livingShallowsSpeciesCatalog.length,85);
  for(const s of OCEAN_REEF_VISITORS_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);
    for(const biome of ['reef','kelp','deep'])assert.ok(!sceneCatalogs[biome].some(x=>x.id===s.id));}
  const src=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=src.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=src.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('57'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  for(const living of [true,false]){
    const captured=new Function('OceanEcology','seed',`return ${src.slice(start,end)};`).call({isLivingShallows:living,oceanChunks:{generator}},Capture,seed);
    assert.equal(captured.options.reefVisitors,living);
    const model=new OceanEcology(seed,generator,{...captured.options,store:{load:async()=>null,saveMany:async()=>{},save:async()=>{}}});
    try{assert.equal(model.reefVisitorsEnabled,living);model.reset(seed,generator);assert.equal(model.reefVisitorsEnabled,living);assert.equal(model._active.size,0);}
    finally{await model.dispose();}
  }
});
