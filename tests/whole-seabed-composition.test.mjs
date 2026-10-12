import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS } from '../src/livingShallowsGeneration.js';
import { createReefValleyRegionPlans, validateReefValleyRegionPlan } from '../src/reefValleyRegion.js';
import { livingSeabedFloorSurface } from '../src/livingSeabedRelief.js';
import { createWholeSeabedComposition, withWholeSeabedGenerator } from '../src/wholeSeabedComposition.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createOceanPreparationJobs } from '../src/oceanPreparationJobs.js';
import { nativePreparation } from './helpers/ocean-preparation-node.mjs';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
const seed=livingShallowsSeed('55'), original=createLivingShallowsGenerator(seed), base=withWholeSeabedGenerator(original);
const packs=[204,210].map(cx=>createReefValleyRegionPlans(base,cx,4));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows=packs.flat(), byId=new Map(rows.map(p=>[p.id,p]));
const floor=(x,z)=>livingSeabedFloorSurface(base,byId.get(`${Math.floor(x/64)},${Math.floor(z/64)}`),x,z);

test('whole seabed profile leaves the complete original twelve-owner plan literal and rejects foreign-profile history',()=>{
 const old=createReefValleyRegionPlans(original,204,4);
 assert.equal(hash(old),'be5e1a0fc50e473a9f9248a011816f29c7cad1dff0836bb2e29fc57c96e4aa6c');
 assert.equal(withWholeSeabedGenerator(original,false),original);
 assert.equal(original.wholeSeabedVersion,undefined);assert.equal(base.wholeSeabedVersion,1);
 assert.ok(validateReefValleyRegionPlan(original,old[0]));assert.ok(validateReefValleyRegionPlan(base,packs[0][0]));
 assert.equal(validateReefValleyRegionPlan(original,packs[0][0]),false);
 assert.equal(validateReefValleyRegionPlan(base,old[0]),false);
 assert.equal(readOceanWorldVariant('?world=whole-seabed'),'whole-seabed');
});

test('admitted sand ridges, rock aprons and patchy grass change whole habitats within original element and slope budgets',()=>{
 for(const pack of packs){const g=pack[0].group;
  assert.equal(g.wholeSeabedVersion,1);assert.ok(g.metrics.apronRockCount>=10);assert.ok(g.metrics.apronRubbleCount>=100);
  assert.ok(g.metrics.denseGrassCount>0&&g.metrics.edgeGrassCount>0);assert.equal(g.branchPaths.length,2);assert.ok(g.maxSlope<=.65001);
  for(const p of pack)for(const [kind,limit]of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS))assert.ok(p.elements.filter(e=>e.kind===kind).length<=limit);
 }
 const old=createReefValleyRegionPlans(original,204,4), differences=packs[0].flatMap((p,i)=>p.floorPatch.heights.map((y,k)=>y-old[i].floorPatch.heights[k]));
 assert.ok(Math.max(...differences)>.6);assert.ok(Math.min(...differences)<-.6);
 const fields=createWholeSeabedComposition(seed,packs[0][0].group.origin);
 const factors=Array.from({length:120},(_,i)=>fields.grassFactor(204*64+205+i,4*64+50));
 assert.ok(Math.min(...factors)<.1&&Math.max(...factors)>.9);
 assert.ok(packs[0][0].group.metrics.grassCount<old[0].group.metrics.grassCount);
 writeFileSync(new URL('../output/validation/whole-seabed-layout.json',import.meta.url),JSON.stringify({
  scope:'native admitted layout, not rendered pixels or hydrodynamic calibration',old:old[0].group.metrics,
  groups:packs.map(p=>({id:p[0].group.id,metrics:p[0].group.metrics,maxSlope:p[0].group.maxSlope,routeM:p[0].group.routeLengthM})),
  floorDifferenceM:[Math.min(...differences),Math.max(...differences)]},null,2));
});

test('all native boundaries and retained supports are exact, with literal internal and adjacent-group bed seams',()=>{
 for(const p of rows){const g=p.group;
  for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){
   const wx=p.cx*64+x,wz=p.cz*64+z,edge=Math.min(wx-g.origin.x,g.origin.x+384-wx,wz-g.origin.z,g.origin.z+128-wz);
   if(edge<=16)assert.equal(p.floorPatch.heights[z*65+x],original.floorVertex(wx,wz));
  }
  const source=original.chunk(p.cx,p.cz);
  for(const id of g.retainedBoundaryIds.filter(id=>source.elements.some(e=>e.id===id)))assert.deepEqual(p.elements.find(e=>e.id===id),source.elements.find(e=>e.id===id));
  for(const axis of ['x','z']){const q=byId.get(axis==='x'?`${p.cx+1},${p.cz}`:`${p.cx},${p.cz+1}`);if(!q)continue;
   for(let k=0;k<=64;k++)assert.equal(p.floorPatch.heights[axis==='x'?k*65+64:64*65+k],q.floorPatch.heights[axis==='x'?k*65:k]);
  }
 }
 assert.deepEqual(packs[0][0].group.sharedPorts.east,packs[1][0].group.sharedPorts.west);
});

test('actual Three meshes, floor rays and grass ground buffers use the same published whole seabed',()=>{
 const ocean=new OceanChunks(seed,{livingGeology:true,wholeSeabed:true,sandHabitat:true});let checked=0,rays=0,grass=0,aprons=0;
 try{
  const all=packs.flat();ocean.generator.withReefValleyPlans(packs[0],()=>{ocean.update({x:205*64+32,z:4*64+32});assert.equal(ocean.stats.activeChunks,0);});
  for(const cx of [205,208,211]){
   const x=cx*64+32,z=4*64+32,plans=all.filter(p=>Math.abs(p.cx-cx)<=1&&Math.abs(p.cz-4)<=1);
   ocean.generator.replaceRidgeOwners(plans);ocean.update({x,z});ocean.root.updateMatrixWorld(true);
   for(const r of ocean._chunks.values())if(r.ridgePlan?.group.wholeSeabedVersion===1){
    for(let i=0;i<65*65;i++){assert.equal(r.terrainGeometry.attributes.position.getY(i),ocean.generator.floorVertex(r.origin.x+i%65,r.origin.z+Math.floor(i/65)));checked++;}
    const wx=r.origin.x+19.23,wz=r.origin.z+22.37,terrain=r.group.children.find(m=>m.name==='sampled-seabed');
    const hit=new THREE.Raycaster(new THREE.Vector3(wx,30,wz),new THREE.Vector3(0,-1,0)).intersectObject(terrain,false)[0];
    assert.ok(hit);assert.ok(Math.abs(hit.point.y-floor(wx,wz).height)<2e-5);rays++;
    for(const e of r.sourceChunk.elements){if(e.kind==='seagrass'){assert.ok(Math.abs(e.y-ocean.generator.floorSurface(e.x,e.z).height)<1e-6);grass++;}
      if(e.landformRole==='rubble-apron-rock')aprons++;}
    for(const m of r.instances)if(m.userData.landscapeKind==='seagrass')assert.equal(m.geometry.attributes.meadowGround.count,m.count);
   }
  }
  assert.ok(checked>20000&&rays>10&&grass>100&&aprons>10);
  ocean.reset(seed);assert.equal(ocean.generator.baseGenerator.wholeSeabedVersion,1);
 }finally{ocean.dispose();}
});

test('native Worker profile survives generation, context validation and same-seed profile switches without publishing private terrain',async()=>{
 const preparation=nativePreparation(),g=createLivingRidgeGenerator(base,{preparation});
 try{
  const remote=await g.generateMacroPlans(8,204,4);assert.ok(isDeepStrictEqual(remote,packs[0]));
  const context=await g.prepareReefValleyContextAsync(remote);assert.equal(g.registryStats().size,0);
  context(()=>assert.equal(g.chunk(205,4).ridgePlan.group.wholeSeabedVersion,1));assert.equal(g.registryStats().size,0);
  const changed=structuredClone(remote);changed[0].floorPatch.heights[2000]+=.1;
  await assert.rejects(g.prepareReefValleyContextAsync(changed),/Invalid/);assert.equal(g.registryStats().size,0);
  const run=createOceanPreparationJobs();const first=run('generate',{seed,version:8,cx:204,cz:4});
  const second=run('generate',{seed,wholeSeabed:true,version:8,cx:204,cz:4});
  const last=run('generate',{seed,version:8,cx:204,cz:4});
  assert.ok(isDeepStrictEqual(second,packs[0]));assert.equal(hash(first),hash(last));assert.notEqual(hash(first),hash(second));
 }finally{preparation.dispose();}
});

test('actual scene constructor enables whole terrain only in its new independent entrance and preserves every previous preview',()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanChunks(seed,{'),end=source.indexOf(');',start)+1;
 class Capture{constructor(_seed,options){this.options=options;}}
 for(const variant of [null,'whole-seabed','animal-communities','reef-bottom-life','reef-foraging']){
  const scene={isLivingShallows:true,oceanWorldVariant:variant};
  const result=new Function('OceanChunks','seed','return '+source.slice(start,end)).call(scene,Capture,seed);
  assert.equal(result.options.wholeSeabed,variant==='whole-seabed');assert.equal(result.options.backgroundPreparation,true);assert.equal(result.options.progressiveStreaming,variant==='whole-seabed');
 }
});
