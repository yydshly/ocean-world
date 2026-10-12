import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OCEAN_REEF_MOBILE_BENTHOS_SPECIES } from '../src/oceanReefMobileBenthosSpecies.js';
import { createReefMobileBenthosAnimal, animateReefMobileBenthosAnimal, disposeReefMobileBenthosAnimal, reefMobileBenthosAssetStats } from '../src/world/OceanReefMobileBenthosAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
function points(root){root.updateMatrixWorld(true);const rows=[];root.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)rows.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});return rows;}
for(const s of OCEAN_REEF_MOBILE_BENTHOS_SPECIES)test(`${s.id}: complete arms or living spined test and true contact geometry stay inside moving envelope`,()=>{
  const root=createReefMobileBenthosAnimal(s),moving={alive:true,velocity:{x:.008,y:0,z:0},lastFeedAt:2};
  try{assert.equal(root.userData.sizeMeasure,s.sizeMeasure);assert.equal(root.userData.emissionEnabled,false);const raw=points(root);assert.ok(Math.min(...raw.map(p=>p.y))<1e-7);
    for(const contact of s.support.footContacts){const nearest=Math.min(...raw.map(p=>p.distanceTo(new THREE.Vector3(contact.x,contact.y,contact.z))));assert.ok(nearest<.006,`actual support ${nearest}`);}
    if(s.id==='banded-brittle-star')assert.equal(root.userData.motion.arms.length,5);else assert.ok(root.getObjectByName('merged short spine covering'));
    for(let i=0;i<18;i++){animateReefMobileBenthosAnimal(root,moving,i*.53);for(const p of points(root))for(const axis of['x','y','z'])assert.ok(p[axis]>=s.normalizedEnvelope[axis][0]-1e-6&&p[axis]<=s.normalizedEnvelope[axis][1]+1e-6);}
    animateReefMobileBenthosAnimal(root,{alive:true,velocity:{x:0,y:0,z:0}},1);const resting=points(root).map(p=>p.toArray());animateReefMobileBenthosAnimal(root,{alive:true,velocity:{x:0,y:0,z:0}},99);assert.deepEqual(points(root).map(p=>p.toArray()),resting);
    animateReefMobileBenthosAnimal(root,moving,2.2);assert.notDeepEqual(points(root).map(p=>p.toArray()),resting);
    animateReefMobileBenthosAnimal(root,{...moving,alive:false},1);const dead=points(root).map(p=>p.toArray());animateReefMobileBenthosAnimal(root,{...moving,alive:false},999);assert.deepEqual(points(root).map(p=>p.toArray()),dead);
  }finally{disposeReefMobileBenthosAnimal(root);}assert.deepEqual(reefMobileBenthosAssetStats(),{resources:0,instances:0});
});
test('shared immutable arm geometry keeps support and per-animal gait separate and releases without leaks',()=>{
  const a=createReefMobileBenthosAnimal('banded-brittle-star'),b=createReefMobileBenthosAnimal('banded-brittle-star');
  try{const mesh=r=>r.getObjectByName('banded arm and small side spines 0');assert.equal(mesh(a).geometry,mesh(b).geometry);const raw=[...mesh(a).geometry.attributes.position.array],pose=b.userData.motion.arms[0].pivot.rotation.y;
    animateReefMobileBenthosAnimal(a,{alive:true,velocity:{x:.008,y:0,z:0}},3.1);assert.equal(b.userData.motion.arms[0].pivot.rotation.y,pose);assert.deepEqual([...mesh(a).geometry.attributes.position.array],raw);
    const after=a.userData.motion.arms[0].pivot.rotation.y;animateReefMobileBenthosAnimal(a,{alive:true,velocity:{x:.008,y:0,z:0}},3.1);assert.equal(a.userData.motion.arms[0].pivot.rotation.y,after);
    disposeReefMobileBenthosAnimal(a);assert.equal(reefMobileBenthosAssetStats().instances,1);
  }finally{disposeReefMobileBenthosAnimal(a);disposeReefMobileBenthosAnimal(b);}assert.deepEqual(reefMobileBenthosAssetStats(),{resources:0,instances:0});
});
test('regional renderer dispatches actual animal-clock movement and support orientation without mutating saved agents',()=>{
  const agents=OCEAN_REEF_MOBILE_BENTHOS_SPECIES.map((s,i)=>({id:`mobile:${i}`,speciesId:s.id,alive:true,sizeM:s.lengthM,regionId:'204,4',position:{x:13100+i,y:-4,z:280},heading:.7,pitch:0,
    supportNormal:{x:.04,y:Math.sqrt(1-.04**2),z:0},velocity:{x:.0015,y:0,z:0},state:'reef-foraging',timeSec:3.1,lastFeedAt:2.8})),before=structuredClone(agents),animals=new OceanAnimals(livingShallowsSpeciesCatalog);
  try{animals.update(agents,999,{x:13056,z:256});assert.equal(animals.entities.size,2);for(const a of agents){const o=animals.getObject(a.id);assert.equal(o.scale.x,a.sizeM);assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(o.quaternion).distanceTo(new THREE.Vector3(a.supportNormal.x,a.supportNormal.y,a.supportNormal.z))<1e-8);
    const ref=createReefMobileBenthosAnimal(a.speciesId);ref.userData.phase=o.userData.phase;animateReefMobileBenthosAnimal(ref,a,a.timeSec);assert.deepEqual(o.userData.motion.arms?.map(r=>r.pivot.rotation.y)??o.userData.motion.spines.rotation.y,ref.userData.motion.arms?.map(r=>r.pivot.rotation.y)??ref.userData.motion.spines.rotation.y);disposeReefMobileBenthosAnimal(ref);}
    assert.deepEqual(agents,before);animals.update([],1000);assert.equal(animals.root.children.length,0);
  }finally{animals.dispose();}assert.deepEqual(reefMobileBenthosAssetStats(),{resources:0,instances:0});
});
test('91-entry catalog and production constructor expose fresh mobile benthos while freezing every earlier preview across resets',async()=>{
  assert.equal(livingShallowsSpeciesCatalog.length,106);for(const s of OCEAN_REEF_MOBILE_BENTHOS_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);for(const biome of['reef','kelp','deep'])assert.ok(!sceneCatalogs[biome].some(x=>x.id===s.id));}
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('55'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),store={load:async()=>null,save:async()=>{},saveMany:async()=>{}};
  for(const living of[true,false])for(const variant of[null,'habitat-layers','sand-corridor','reef-slope','depth-community','reef-filter-life','reef-suspension-life','reef-mobile-benthos']){
    const c=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:living,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed),want=living&&[null,'reef-mobile-benthos'].includes(variant);
    assert.equal(c.options.reefMobileBenthos,want);const m=new OceanEcology(seed,g,{...c.options,store});try{assert.equal(m.reefMobileBenthosEnabled,want);const world=m._world;m.reset(seed,g);assert.equal(m.reefMobileBenthosEnabled,want);assert.equal(m._world,world);assert.equal(m._randomWorld,`ecology-v1:string:${seed}`);}finally{await m.dispose();}
  }
  assert.equal(readOceanWorldVariant('?world=reef-mobile-benthos'),'reef-mobile-benthos');assert.equal(readOceanWorldVariant('?world=reef-mobile-benthos-extra'),null);
  const m=new OceanEcology(seed,g,{reefMobileBenthos:true,store});try{assert.equal(m.reefMobileBenthosEnabled,false);}finally{await m.dispose();}
});
