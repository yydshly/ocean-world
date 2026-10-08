import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OCEAN_REEF_FILTER_SPECIES } from '../src/oceanReefFilterSpecies.js';
import { createReefFilterAnimal, animateReefFilterAnimal, disposeReefFilterAnimal, reefFilterAnimalAssetStats } from '../src/world/OceanReefFilterAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
function points(root) { root.updateMatrixWorld(true); const out = []; root.traverse(o => {
  if (o.isMesh) { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)); }
}); return out; }
for (const species of OCEAN_REEF_FILTER_SPECIES) test(`${species.id}: both shell valves and mantle opening remain inside complete physical envelope`, () => {
  const root = createReefFilterAnimal(species);
  try {
    assert.equal(root.userData.sizeMeasure, 'shell-length'); assert.equal(root.userData.independentAnimal, true); assert.equal(root.userData.emissionEnabled, false);
    const box = new THREE.Box3().setFromPoints(points(root)); assert.ok(Math.abs(box.min.x + .5) < 1e-6 && Math.abs(box.max.x - .5) < 1e-6);
    assert.ok(box.min.y >= -1e-8 && box.min.y < 1e-6);
    for (let i = 0; i < 24; i++) {
      animateReefFilterAnimal(root, { alive: true }, i * .53);
      for (const point of points(root)) for (const axis of ['x','y','z']) assert.ok(point[axis] >= species.normalizedEnvelope[axis][0] - 1e-6 && point[axis] <= species.normalizedEnvelope[axis][1] + 1e-6);
    }
    animateReefFilterAnimal(root, { alive: false }, 3); const dead = points(root).map(p => p.toArray());
    animateReefFilterAnimal(root, { alive: false }, 99); assert.deepEqual(points(root).map(p => p.toArray()), dead);
  } finally { disposeReefFilterAnimal(root); }
  assert.deepEqual(reefFilterAnimalAssetStats(), { resources: 0, instances: 0 });
});
test('shared shell resources keep per-animal poses and owner clocks independent and release fully', () => {
  const a = createReefFilterAnimal('fluted-giant-clam'), b = createReefFilterAnimal('fluted-giant-clam');
  const mesh = r => r.getObjectByName('mottled exposed living mantle'); const raw = [...mesh(a).geometry.getAttribute('position').array];
  assert.equal(mesh(a).geometry, mesh(b).geometry); const before = b.userData.motion.valves[0].rotation.x;
  animateReefFilterAnimal(a, { alive: true }, 3.1); assert.equal(b.userData.motion.valves[0].rotation.x, before);
  assert.deepEqual([...mesh(a).geometry.getAttribute('position').array], raw);
  const pose = a.userData.motion.valves[0].rotation.x; animateReefFilterAnimal(a, { alive: true }, 3.1); assert.equal(a.userData.motion.valves[0].rotation.x, pose);
  disposeReefFilterAnimal(a); assert.equal(reefFilterAnimalAssetStats().instances, 1); disposeReefFilterAnimal(b);
  assert.deepEqual(reefFilterAnimalAssetStats(), { resources: 0, instances: 0 }); assert.equal(disposeReefFilterAnimal(b), false);
});
test('actual regional dispatcher uses saved shell size support tilt and owner time without touching ecology', () => {
  const agents = OCEAN_REEF_FILTER_SPECIES.map((s,i) => ({ id:`shell:${i}`, speciesId:s.id, alive:true, sizeM:s.lengthM,
    regionId:'204,4', position:{x:13100+i,y:-4,z:280}, heading:.7, pitch:0, supportNormal:{x:.04,y:Math.sqrt(1-.04**2),z:0},
    velocity:{x:0,y:0,z:0}, state:'sessile-filtering', timeSec:3.1 })), before = structuredClone(agents), animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  try {
    animals.update(agents,999,{x:13056,z:256}); assert.equal(animals.entities.size,2);
    for (const a of agents) {
      const object = animals.getObject(a.id); assert.equal(object.scale.x,a.sizeM);
      const up = new THREE.Vector3(0,1,0).applyQuaternion(object.quaternion); assert.ok(up.distanceTo(new THREE.Vector3(...Object.values(a.supportNormal)))<1e-8);
      const reference = createReefFilterAnimal(a.speciesId); reference.userData.phase=object.userData.phase; animateReefFilterAnimal(reference,a,a.timeSec);
      assert.equal(object.userData.motion.valves[0].rotation.x, reference.userData.motion.valves[0].rotation.x); disposeReefFilterAnimal(reference);
    }
    assert.deepEqual(agents,before); animals.update(agents,2000); assert.deepEqual(agents,before); animals.update([],2000); assert.equal(animals.root.children.length,0);
  } finally { animals.dispose(); }
  assert.deepEqual(reefFilterAnimalAssetStats(),{resources:0,instances:0});
});
test('shipped stationary filter layer and 85-entry catalog preserve all prior preview gates across resets',async()=>{
  assert.equal(livingShallowsSpeciesCatalog.length,87);
  for(const s of OCEAN_REEF_FILTER_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);for(const biome of ['reef','kelp','deep'])assert.ok(!sceneCatalogs[biome].some(x=>x.id===s.id));}
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('55'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),store={load:async()=>null,save:async()=>{},saveMany:async()=>{}};
  for(const living of[true,false])for(const variant of[null,'habitat-layers','sand-corridor','reef-slope','depth-community','reef-filter-life']){
    const c=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:living,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed);
    const want=living&&[null,'reef-filter-life'].includes(variant);assert.equal(c.options.reefFilterLife,want);const m=new OceanEcology(seed,g,{...c.options,store});
    try{assert.equal(m.reefFilterLifeEnabled,want);const world=m._world;m.reset(seed,g);assert.equal(m.reefFilterLifeEnabled,want);assert.equal(m._world,world);assert.equal(m._randomWorld,`ecology-v1:string:${seed}`);}finally{await m.dispose();}
  }
  assert.equal(readOceanWorldVariant('?world=reef-filter-life'),'reef-filter-life');assert.equal(readOceanWorldVariant('?world=reef-filter-life-extra'),null);
  const no=new OceanEcology(seed,g,{reefFilterLife:true,store});try{assert.equal(no.reefFilterLifeEnabled,false);}finally{await no.dispose();}
});
