import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { sampleLifeExpeditionView } from '../src/lifeExpedition.js';
import { livingShallowsPresentation } from '../src/livingShallowsPresentation.js';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
const seed=livingShallowsSeed('55');
const position={x:206*64+24,z:4*64+30};
function scene(progressive=true){
 const c=new OceanChunks(seed,{livingGeology:true,sandHabitat:true,wholeSeabed:true,progressiveStreaming:progressive});
 const plans=createReefValleyRegionPlans(c.generator.baseGenerator,204,4);
 c.generator.replaceRidgeOwners(plans);
 return {c,plans};
}
function drain(c,p=position){for(let i=0;i<9;i++)c.update(p);}

test('overlapping restored canonical halos retain actual terrain and scenery resources, while removed or changed sources release',()=>{
 const {c,plans}=scene(false);
 try{
  c.update(position);
  const source=new Map([...c._chunks].map(([id,r])=>[id,{r,plan:c.generator.getRidgePlan(id),chunk:c.generator.chunk(r.sourceChunk.cx,r.sourceChunk.cz)}]));
  const loads=c.stats.loads,unloads=c.stats.unloads;
  assert.equal(c.stats.activeChunks,6);
  c.generator.replaceRidgeOwners(structuredClone(plans.filter(p=>p.cx>=205)));
  assert.equal(c.update(position),false);
  assert.equal(c.stats.loads,loads);assert.equal(c.stats.unloads,unloads);
  for(const [id,{r,plan,chunk}]of source){assert.equal(c._chunks.get(id),r);assert.equal(c.generator.getRidgePlan(id),plan);assert.equal(c.generator.chunk(chunk.cx,chunk.cz),chunk);}
  const corrupt=structuredClone(plans.filter(p=>p.cx>=205));corrupt[0].floorPatch.heights[2000]+=.1;
  assert.throws(()=>c.generator.replaceRidgeOwners(corrupt),/Invalid/);
  for(const [id,{r}]of source)assert.equal(c._chunks.get(id),r);
  c.generator.replaceRidgeOwners([],['206,4']);c.update(position);
  assert.equal(c.stats.activeChunks,1);assert.notEqual(c._chunks.get('206,4'),source.get('206,4').r);
  assert.equal(c._chunks.get('206,4').ridgePlan,null);
  for(const [id,{r}]of source)assert.equal(r.group.parent,null,`${id} old source released`);
 }finally{c.dispose();}
});

test('progressive rendering prioritizes the camera owner, creates at most one real chunk per update and cancels stale windows',()=>{
 const {c,plans}=scene();
 try{
  let loads=c.stats.loads;c.update(position);
  assert.equal(c.stats.loads-loads,1);assert.deepEqual(c.stats.loadedChunks,['206,4']);
  assert.equal(c.stats.streaming.pendingChunks,5);
  const moved={x:208*64+24,z:5*64+30};
  c.update(moved);assert.ok(c.stats.loadedChunks.includes('208,5'));
  for(let i=0;i<9;i++){loads=c.stats.loads;c.update(moved);assert.ok(c.stats.loads-loads<=1);assert.ok(c.stats.activeChunks<=9);}
  assert.equal(c.stats.streaming.pendingChunks,0);
  assert.ok(c.stats.loadedChunks.every(id=>{const [x,z]=id.split(',').map(Number);return Math.abs(x-208)<=1&&Math.abs(z-5)<=1;}));
  assert.equal(c.stats.streaming.maxLoadsPerUpdate,1);
  assert.equal(c.update(moved),false);
  c.setRenderOrigin({x:208*64,z:5*64});
  for(const r of c._chunks.values()){assert.equal(r.group.position.x,r.origin.x-208*64);assert.equal(r.group.position.z,r.origin.z-5*64);}
  c.reset(seed);assert.equal(c.stats.activeChunks,0);assert.equal(c.stats.streaming.pendingChunks,0);
  c.generator.replaceRidgeOwners(plans);drain(c,moved);assert.equal(c.stats.streaming.maxLoadsPerUpdate,1);
  c.dispose();assert.equal(c.update(position),false);
 }finally{c.dispose();}
});

test('reuse of an already sampled habitat preserves complete terrain buffers against the original resampling path',()=>{
 const {c,plans}=scene(false),hashes=[];
 try{
  const generator=c.generator;
  for(const plan of [plans[0],plans[2],plans[9]]){
   const chunk=generator.chunk(plan.cx,plan.cz),a=c._terrainGeometry(chunk);
   c.generator={...generator,baseGenerator:undefined};const b=c._terrainGeometry(chunk);c.generator=generator;
   try{for(const [name,attribute]of Object.entries(a.attributes))assert.ok(isDeepStrictEqual(attribute.array,b.attributes[name].array),name);
    assert.ok(isDeepStrictEqual(a.index.array,b.index.array));hashes.push({id:plan.id,vertices:a.attributes.position.count,completeBuffersExact:true});
   }finally{a.dispose();b.dispose();}
  }
  writeFileSync(new URL('../output/validation/whole-scene-terrain-buffer-check.json',import.meta.url),JSON.stringify(hashes,null,2));
 }finally{c.dispose();}
});

test('static entrance yields between real chunk creation, can cancel, and retries without publishing a stale camera window',async()=>{
 const {c}=scene();let current=true,turns=0;
 const ticker=setInterval(()=>turns++,1);
 try{
  const cancelled=c.prepareWindow(position,{isCurrent:()=>current});current=false;
  assert.equal(await cancelled,false);assert.equal(c.stats.activeChunks,1);
  current=true;assert.equal(await c.prepareWindow(position,{isCurrent:()=>current}),true);
  assert.equal(c.stats.activeChunks,6);assert.ok(turns>0);assert.equal(c.stats.streaming.maxLoadsPerUpdate,1);
  const stale=c.prepareWindow({x:208*64+24,z:5*64+30});c.update(position);
  assert.equal(await stale,false);assert.deepEqual(c.stats.center,{cx:206,cz:4});
 }finally{clearInterval(ticker);c.dispose();}
});

test('whole-scene vista follows committed landscape continuously without moving the observer or changing stored sources',()=>{
 const {c,plans}=scene(false);
 try{
  const plan=plans[0],legacy={...plan,group:{...plan.group,wholeSeabedVersion:undefined}},before=JSON.stringify(plan),targets=[];
  for(let x=plan.group.origin.x+30;x<plan.group.origin.x+355;x+=.5){
   const z=plan.group.origin.z+64,bedY=c.generator.floorSurface(x,z).height;
   const frame={position:{x,y:bedY+2.5,z},target:{x:x+8,y:bedY+1.85,z},elapsedSec:120};
   const old=sampleLifeExpeditionView(frame,{plan:legacy,bedY,surfaceY:0,durationSec:240});
   const v=sampleLifeExpeditionView(frame,{plan,bedY,surfaceY:0,durationSec:240});
   assert.deepEqual(v.position,old.position);assert.ok(['x','y','z'].every(k=>Number.isFinite(v.target[k])));
   assert.ok(v.target.x>x,'landscape stays generally ahead');targets.push(v.target);
  }
  const largest=Math.max(...targets.slice(1).map((p,i)=>Math.hypot(...['x','y','z'].map(k=>p[k]-targets[i][k]))));
  assert.ok(largest<2,`continuous target displacement ${largest}`);
  assert.equal(JSON.stringify(plan),before);
  for(const elapsedSec of[0,240]){const frame={position:{x:position.x,y:-3,z:position.z},target:{x:position.x+8,y:-3.65,z:position.z},elapsedSec};
   assert.deepEqual(sampleLifeExpeditionView(frame,{plan,bedY:-6,surfaceY:0,durationSec:240}).target,frame.target);}
 }finally{c.dispose();}
});

test('landscape water treatment separates nearby and distant contrast without changing ecological forcing or night',()=>{
 const input=Object.freeze({hour:12,depthM:8,turbidity:.25,attenuationPerM:.04}),before=structuredClone(input);
 const scene=livingShallowsPresentation({...input,landscape:true}),old=livingShallowsPresentation(input);
 const contrast=d=>Math.exp(-((scene.fogDensity*d)**2));
 assert.ok(contrast(10)>.95);assert.ok(contrast(60)<.3);assert.ok(scene.skyIntensity>old.skyIntensity);
 assert.ok(scene.sunIntensity>scene.skyIntensity*4);assert.ok(scene.fogDensity<old.fogDensity);
 assert.deepEqual(input,before);
 assert.deepEqual(livingShallowsPresentation({...input,landscape:false}),old);
 const night=livingShallowsPresentation({...input,hour:0,landscape:true});assert.ok(night.sunIntensity<scene.sunIntensity*.02);
});

test('shipped water pipeline applies the latest palette and landscape treatment to real Three scene state without changing forcing',()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
 const start=source.indexOf('  updateOceanWater(dt){'),end=source.indexOf('\n  updateDeepOceanWater',start);
 const World=new Function('THREE','clamp','livingShallowsPresentation',`return class {${source.slice(start,end)}}`)(THREE,THREE.MathUtils.clamp,livingShallowsPresentation);
 const paletteStart=source.indexOf('this.oceanWaterPalette = {'),paletteEnd=source.indexOf('};',paletteStart)+2;
 const palette=new Function('THREE',source.slice(paletteStart,paletteEnd)+'return this.oceanWaterPalette;');
 const {c}=scene(false);
 try{
  const environment=Object.freeze({hour:10,currentMps:.15,turbidity:.25,foodSupply:1});
  for(const variant of ['whole-seabed','animal-communities']){
   const w=new World(),p={...position,y:c.generator.floorSurface(position.x,position.z).height+2.5};
   Object.assign(w,{isLivingShallows:true,isKelp:false,oceanWorldVariant:variant,oceanWorldPosition:()=>p,sim:{environment},surfaceY:0,
    oceanChunks:c,oceanWaterField:createOceanEnvironment(seed,c.generator),scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),
    ambient:new THREE.HemisphereLight(),waterNightColor:new THREE.Color('#071e2b'),visualEnvironment:{},
    waterColors:{horizon:{value:new THREE.Color()},bottom:{value:new THREE.Color()},top:{value:new THREE.Color()}},
    particleUniforms:{opacity:{value:.18}},oceanWaterParticles:{root:new THREE.Group(),update(){}},livingClockSec:42,paused:false,oceanRenderOrigin:{x:0,z:0}});
   w.scene.background=new THREE.Color('#378faa');w.scene.fog=new THREE.FogExp2(w.scene.background,.039);
   w.oceanWaterPalette=palette.call(w,THREE);
   assert.equal(w.oceanWaterPalette.clear.getHexString(),variant==='whole-seabed'?'346d78':'126e91');
   const before=JSON.stringify(environment);w.updateOceanWater(.016);
   const expected=livingShallowsPresentation({hour:10,depthM:-p.y,turbidity:w.oceanLocalWater.turbidity,
    attenuationPerM:w.oceanLocalWater.attenuationPerM,landscape:variant==='whole-seabed'});
   assert.equal(w.scene.fog.density,expected.fogDensity);assert.equal(w.sun.intensity,expected.sunIntensity);assert.equal(w.ambient.intensity,expected.skyIntensity);
   assert.equal(JSON.stringify(environment),before);assert.ok(w.scene.fog.color.equals(w.scene.background));
  }
 }finally{c.dispose();}
});
