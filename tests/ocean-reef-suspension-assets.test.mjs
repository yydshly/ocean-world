import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OCEAN_REEF_SUSPENSION_SPECIES } from '../src/oceanReefSuspensionSpecies.js';
import { createReefSuspensionAnimal, animateReefSuspensionAnimal, disposeReefSuspensionAnimal, reefSuspensionAnimalAssetStats } from '../src/world/OceanReefSuspensionAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
function points(root) { root.updateMatrixWorld(true); const out=[]; root.traverse(o=>{if(o.isMesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});return out; }
for(const s of OCEAN_REEF_SUSPENSION_SPECIES)test(`${s.id}: complete model and all arm or siphon motion stay inside physical admission envelope`,()=>{
  const root=createReefSuspensionAnimal(s);
  try{
    assert.equal(root.userData.independentAnimal,true);assert.equal(root.userData.emissionEnabled,false);assert.equal(root.userData.sizeMeasure,s.sizeMeasure);
    const box=new THREE.Box3().setFromPoints(points(root));assert.ok(box.min.y>=-1e-7&&box.min.y<1e-7);
    if(s.kind==='crinoid'){assert.equal(root.userData.motion.sectors.length,5);assert.ok(box.max.x-box.min.x>.95);assert.ok(root.getObjectByName('basal gripping cirri'));}
    else{assert.equal(root.userData.motion.mouths.length,2);assert.ok(box.max.y>.93&&box.max.y<=1);assert.ok(root.getObjectByName('atrial exhalant siphon'));}
    const before=points(root).map(p=>p.toArray());animateReefSuspensionAnimal(root,{alive:true},3.1);assert.notDeepEqual(points(root).map(p=>p.toArray()),before);
    for(let i=0;i<18;i++){animateReefSuspensionAnimal(root,{alive:true},i*.77);for(const p of points(root))for(const axis of ['x','y','z'])assert.ok(p[axis]>=s.normalizedEnvelope[axis][0]-1e-6&&p[axis]<=s.normalizedEnvelope[axis][1]+1e-6,`${axis}=${p[axis]}`);}
    animateReefSuspensionAnimal(root,{alive:false},3);const dead=points(root).map(p=>p.toArray());animateReefSuspensionAnimal(root,{alive:false},999);assert.deepEqual(points(root).map(p=>p.toArray()),dead);
  }finally{disposeReefSuspensionAnimal(root);}assert.deepEqual(reefSuspensionAnimalAssetStats(),{resources:0,instances:0});
});
test('fan geometry is shared immutably, poses have independent ecological clocks and unload releases all resources',()=>{
  const a=createReefSuspensionAnimal('shallow-feather-star'),b=createReefSuspensionAnimal('shallow-feather-star');
  try{const mesh=r=>r.getObjectByName('eight arms and paired pinnules 0');assert.equal(mesh(a).geometry,mesh(b).geometry);
    const raw=[...mesh(a).geometry.attributes.position.array],before=b.userData.motion.sectors[0].rotation.y;
    animateReefSuspensionAnimal(a,{alive:true},3.1);assert.equal(b.userData.motion.sectors[0].rotation.y,before);assert.deepEqual([...mesh(a).geometry.attributes.position.array],raw);
    const pose=a.userData.motion.sectors[0].rotation.y;animateReefSuspensionAnimal(a,{alive:true},3.1);assert.equal(a.userData.motion.sectors[0].rotation.y,pose);
    assert.equal(a.children.length,7,'five merged sectors plus disc and cirri, no mesh per pinnule');
    disposeReefSuspensionAnimal(a);assert.equal(reefSuspensionAnimalAssetStats().instances,1);
  }finally{disposeReefSuspensionAnimal(a);disposeReefSuspensionAnimal(b);}assert.deepEqual(reefSuspensionAnimalAssetStats(),{resources:0,instances:0});assert.equal(disposeReefSuspensionAnimal(b),false);
});
test('real regional dispatcher respects saved size support tilt and owner time without changing animal records',()=>{
  const agents=OCEAN_REEF_SUSPENSION_SPECIES.map((s,i)=>({id:`suspension:${i}`,speciesId:s.id,alive:true,sizeM:s.lengthM,regionId:'204,4',position:{x:13100+i,y:-4,z:280},heading:.7,pitch:0,
    supportNormal:{x:.04,y:Math.sqrt(1-.04**2),z:0},velocity:{x:0,y:0,z:0},state:i?'sessile-filtering':'perched-suspension-feeding',timeSec:3.1}));
  const before=structuredClone(agents),animals=new OceanAnimals(livingShallowsSpeciesCatalog);
  try{animals.update(agents,999,{x:13056,z:256});assert.equal(animals.entities.size,2);
    for(const a of agents){const o=animals.getObject(a.id);assert.equal(o.scale.x,a.sizeM);const up=new THREE.Vector3(0,1,0).applyQuaternion(o.quaternion);assert.ok(up.distanceTo(new THREE.Vector3(a.supportNormal.x,a.supportNormal.y,a.supportNormal.z))<1e-8);
      const ref=createReefSuspensionAnimal(a.speciesId);ref.userData.phase=o.userData.phase;animateReefSuspensionAnimal(ref,a,a.timeSec);
      assert.deepEqual(o.userData.motion.sectors?.map(p=>p.rotation.y)??o.userData.motion.mouths.map(p=>p.scale.x),ref.userData.motion.sectors?.map(p=>p.rotation.y)??ref.userData.motion.mouths.map(p=>p.scale.x));disposeReefSuspensionAnimal(ref);}
    assert.deepEqual(agents,before);animals.update([],1000);assert.equal(animals.root.children.length,0);
  }finally{animals.dispose();}assert.deepEqual(reefSuspensionAnimalAssetStats(),{resources:0,instances:0});
});
test('87-entry catalog ships the new phase behind all prior preview gates and keeps the same policy across reset',async()=>{
  assert.equal(livingShallowsSpeciesCatalog.length,87);for(const s of OCEAN_REEF_SUSPENSION_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);for(const biome of ['reef','kelp','deep'])assert.ok(!sceneCatalogs[biome].some(x=>x.id===s.id));}
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('55'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),store={load:async()=>null,save:async()=>{},saveMany:async()=>{}};
  for(const living of[true,false])for(const variant of[null,'habitat-layers','sand-corridor','reef-slope','depth-community','reef-filter-life','reef-suspension-life']){
    const c=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:living,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed);
    const want=living&&[null,'reef-suspension-life'].includes(variant);assert.equal(c.options.reefSuspensionLife,want);const m=new OceanEcology(seed,g,{...c.options,store});
    try{assert.equal(m.reefSuspensionLifeEnabled,want);const world=m._world;m.reset(seed,g);assert.equal(m.reefSuspensionLifeEnabled,want);assert.equal(m._world,world);assert.equal(m._randomWorld,`ecology-v1:string:${seed}`);}finally{await m.dispose();}
  }
  assert.equal(readOceanWorldVariant('?world=reef-suspension-life'),'reef-suspension-life');assert.equal(readOceanWorldVariant('?world=reef-suspension-life-extra'),null);
  const m=new OceanEcology(seed,g,{reefSuspensionLife:true,store});try{assert.equal(m.reefSuspensionLifeEnabled,false);}finally{await m.dispose();}
});
