import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createReefHabitatValidationCache,reefHabitatCacheKey} from '../src/oceanReefHabitatCache.js';
import {createOceanPreparationJobs} from '../src/oceanPreparationJobs.js';
import {createLivingShallowsGenerator} from '../src/livingShallowsGeneration.js';
import {withWholeSeabedGenerator} from '../src/wholeSeabedComposition.js';
import {createLivingRidgeGenerator} from '../src/livingRidgeGeology.js';
import {OceanEcology} from '../src/oceanEcology.js';
import {OceanPreparation} from '../src/oceanPreparation.js';
import {nativePreparation} from './helpers/ocean-preparation-node.mjs';
import {livingShallowsSeed} from '../src/livingShallows.js';
import {prepareReefResidentHabitat,isReefResidentAgent} from '../src/oceanReefResidents.js';
const order={candidateOrder:['one'],habitatEvidence:{sampledCenters:1}};
const r={id:'204,4',cx:204,cz:4,reefResidentsVersion:20,biodiversity:{patches:[]},agents:[],timeSec:0};
test('only terrain-derived ranking is cached; geometry, owner and recipe changes invalidate it and entries remain bounded and immutable',()=>{
 const cache=createReefHabitatValidationCache();let computations=0;
 const compute=()=>{computations++;return order;};const first=cache(r,20,compute);
 assert.ok(Object.isFrozen(first.habitatEvidence));r.agents.push({position:{y:-999}});r.timeSec=10;
 assert.equal(cache(r,20,compute),first);assert.equal(computations,1);
 const patch={...r,biodiversity:{patches:[{speciesId:'biodiversity-massive-coral',x:1,y:0,z:2,scale:{x:1,y:1,z:1}}]}};
 cache(patch,20,compute);patch.biodiversity.patches[0].y=2;cache(patch,20,compute);cache(r,19,compute);assert.equal(computations,4);
 for(let i=0;i<20;i++)cache({...r,id:`${204+i},4`,cx:204+i},20,compute);
 assert.equal(cache.stats().entries,12);assert.equal(cache.stats().limit,12);cache(r,20,compute);assert.equal(computations,24);
});
test('worker geometry replies must match every requested key; malformed or partial replies never install an entry',()=>{
 const cache=createReefHabitatValidationCache(),entry={key:reefHabitatCacheKey(r),order};
 for(const input of [[],[{...entry,key:'other'}],[entry,entry],[{...entry,order:null}]])assert.throws(()=>cache.importEntries(input,[r]),/background reef habitat/);
 assert.equal(cache.stats().entries,0);cache.importEntries([entry],[r]);entry.order.candidateOrder.push('tampered');
 assert.deepEqual(cache(r,20,()=>assert.fail()).candidateOrder,['one']);assert.equal(cache.stats().computations,0);
});
const seed=livingShallowsSeed('55'),run=createOceanPreparationJobs();
let fixturePromise;
async function fixture(){
 return fixturePromise??=(async()=>{
  const plans=run('generate',{seed,wholeSeabed:true,version:8,cx:204,cz:4});
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(_seed,_g,options){this.options=options;}}
  const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:{}}},Capture,seed).options;
  const rows=run('birth',{seed,wholeSeabed:true,plans,ecologySeed:seed,options,environment:{hour:10,currentMps:.15,turbidity:.25,foodSupply:1}});
  return {plans,rows,options};
 })();
}
async function setup(){
 const f=await fixture(),preparation=nativePreparation(),g=createLivingRidgeGenerator(withWholeSeabedGenerator(createLivingShallowsGenerator(seed),true),{preparation});
 const context=await g.prepareReefValleyContextAsync(f.plans),ecology=new OceanEcology(seed,g,{...f.options,store:{saveMany:async()=>{}}});
 const rows=structuredClone(f.rows);for(const row of rows)ecology._active.set(row.id,row);
 return {...f,rows,preparation,g,context,ecology};
}
test('actual full native history keeps exact ranking and all records while background preparation removes fixed geometry work from live checks',async()=>{
 const f=await setup(),before=structuredClone(f.rows),timer=setInterval(()=>beats++,2);let beats=0;
 try{
  const cold=new OceanPreparation({yieldTask:async()=>{}});assert.equal(await f.ecology._validatePreparedHistory(f.rows,check=>f.context(check),cold,()=>true),true);
  const start=performance.now();await f.context.prepareResidentHabitats(f.rows,seed);const workerMs=performance.now()-start;
  assert.ok(beats>20);assert.equal(f.context.cacheReefHabitatOrder.stats().computations,0,'ranking computed in real Worker');
  for(const row of f.rows){const expected=f.context(()=>prepareReefResidentHabitat(row,f.g,{surface:(x,z,c)=>f.ecology._surface(x,z,c,true,true,true,true,true,false),bed:(x,z)=>f.ecology._bed(x,z)}));
   const cached=f.context.cacheReefHabitatOrder(row,20,()=>assert.fail('background rank missing'));
   assert.ok(isDeepStrictEqual(expected,cached),'entire original geometric ranking exact');f.ecology._supportCells.clear();}
  const warm=new OceanPreparation({yieldTask:async()=>{}});assert.equal(await f.ecology._validatePreparedHistory(f.rows,f.context,warm,()=>true),true);
  assert.ok(isDeepStrictEqual(f.rows,before),'complete actual records unchanged');assert.equal(f.g.registryStats().size,0);assert.ok(f.ecology._supportCells.size<=25);
  const receipt={scope:'actual native Worker and full main-thread validation, not browser FPS',inputHash:createHash('sha256').update(JSON.stringify({plans:f.plans,rows:f.rows})).digest('hex'),hostBeats:beats,workerMs,cold:cold.stats(),warm:warm.stats(),completeRowsExact:true,rankingExact:true};
  mkdirSync(new URL('../output/validation/',import.meta.url),{recursive:true});writeFileSync(new URL('../output/validation/active-history-worker-native.json',import.meta.url),JSON.stringify(receipt,null,2));
 }finally{clearInterval(timer);f.preparation.dispose();}
});
test('a warmed ranking cannot accept corrupt live positions, births, clocks, habitat evidence or food history',async()=>{
 const f=await setup();try{
  await f.context.prepareResidentHabitats(f.rows,seed);const source=f.rows.find(row=>row.agents.some(isReefResidentAgent));assert.ok(source);
  const mutations=[row=>row.agents.find(isReefResidentAgent).position.y=-999,row=>row.agents[0].energy=-1,
   row=>row.reefResidents.birthPlacements[0].position.y-=10,row=>row.timeSec+=.1,
   row=>row.reefResidents.habitatEvidence.sampledCenters++,row=>row.basicNetwork.nutrients=-1];
  for(const mutate of mutations){const row=structuredClone(source);mutate(row);
   const cached=f.context(()=>f.ecology._validCoastalHistory(row,row.id,true,f.context.cacheReefHabitatOrder));
   const original=f.context(()=>f.ecology._validCoastalHistory(row,row.id,true));
   assert.equal(cached,original);assert.equal(cached,false,'full live validation still rejects corruption');f.ecology._supportCells.clear();}
 }finally{f.preparation.dispose();}
});
test('changes to a live animal during background ranking are checked after the reply; cancellation leaves public terrain and caches isolated',async()=>{
 const f=await setup();try{
  let resume,ranked;const done=new Promise(resolve=>ranked=resolve),gate=new Promise(resolve=>resume=resolve);
  const context=Object.assign(check=>f.context(check),{cacheReefHabitatOrder:f.context.cacheReefHabitatOrder,
   prepareResidentHabitats:async(rows,s)=>{await f.context.prepareResidentHabitats(rows,s);ranked();await gate;}});
  const validation=f.ecology._validatePreparedHistory(f.rows,context,new OceanPreparation(),()=>true);
  await done;f.rows.find(row=>row.agents.some(isReefResidentAgent)).agents.find(isReefResidentAgent).position.y=-999;resume();
  assert.equal(await validation,false);assert.equal(f.g.registryStats().size,0);
  const p=new OceanPreparation();assert.equal(await f.ecology._validatePreparedHistory(f.rows,f.context,p,()=>false),false);assert.equal(p.stats().units,0);
  assert.equal(f.g.registryStats().size,0);assert.equal(f.ecology._supportCells.size,0);
 }finally{f.preparation.dispose();}
});
test('extra scene supports retain complete uncached geometry checks and do not use the native background ranking',async()=>{
 const f=await setup();try{
  f.ecology._sceneSupports.set('extra',[]);let calls=0;
  const context=Object.assign(check=>f.context(check),{prepareResidentHabitats:()=>assert.fail('extra supports must not use native ranking'),cacheReefHabitatOrder:()=>assert.fail('extra supports must not use native ranking')});
  const p=new OceanPreparation({yieldTask:async()=>{calls++;}});assert.equal(await f.ecology._validatePreparedHistory(f.rows,context,p,()=>true),true);assert.ok(calls>0);
 }finally{f.preparation.dispose();}
});
test('adding scene supports while the Worker is running also disables the native cache before live validation',async()=>{
 const f=await setup();try{
  let nativeCalls=0;
  const context=Object.assign(check=>f.context(check),{cacheReefHabitatOrder:()=>{nativeCalls++;assert.fail('changed supports must use full geometry');},
   prepareResidentHabitats:async(rows,s)=>{await f.context.prepareResidentHabitats(rows,s);f.ecology._sceneSupports.set('late-extra',[]);}});
  const p=new OceanPreparation({yieldTask:async()=>{}});assert.equal(await f.ecology._validatePreparedHistory(f.rows,context,p,()=>true),true);
  assert.equal(nativeCalls,0);assert.equal(f.g.registryStats().size,0);
 }finally{f.preparation.dispose();}
});
