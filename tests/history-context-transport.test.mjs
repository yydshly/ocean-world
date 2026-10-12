import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOceanPreparationJobs} from '../src/oceanPreparationJobs.js';
import {createLivingShallowsGenerator} from '../src/livingShallowsGeneration.js';
import {withWholeSeabedGenerator} from '../src/wholeSeabedComposition.js';
import {createLivingRidgeGenerator} from '../src/livingRidgeGeology.js';
import {livingShallowsSeed} from '../src/livingShallows.js';
import {nativePreparation} from './helpers/ocean-preparation-node.mjs';
const seed=livingShallowsSeed('55'),run=createOceanPreparationJobs();
const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
const start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
class Capture{constructor(s,g,options){this.options=options;}}
const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:{}}},Capture,seed).options;
let fixture;
function data(){
 if(!fixture){
  const plans=run('generate',{seed,wholeSeabed:true,version:8,cx:204,cz:4});
  const rows=run('birth',{seed,wholeSeabed:true,plans,ecologySeed:seed,options,environment:{hour:10,currentMps:.15,turbidity:.25,foodSupply:1}});
  fixture={plans,rows};
 }
 return structuredClone(fixture);
}
test('retained terrain checks the complete source once, isolates immutable plans and reruns every mutable history check',()=>{
 const {plans,rows}=data(),payload={seed,wholeSeabed:true,plans},before=structuredClone({plans,rows});
 const ack=run('validate-group',{...payload,retainContext:true});
 assert.equal(ack.valid,true);assert.equal(typeof ack.contextToken,'string');
 const compact={seed,wholeSeabed:true,contextToken:ack.contextToken,ecologySeed:seed};
 const habitats=run('resident-habitats',{...compact,rows:structuredClone(rows)});
 assert.deepEqual(habitats,run('resident-habitats',{...payload,ecologySeed:seed,rows:structuredClone(rows)}));
 assert.equal(run('history',{...compact,rows:structuredClone(rows)}),true);
 for(const mutate of [r=>r.agents[0].energy=-1,r=>r.timeSec+=.1,r=>r.basicNetwork.nutrients=-1]){
  const changed=structuredClone(rows);mutate(changed.find(r=>r.agents.length));
  assert.equal(run('history',{...compact,rows:changed}),false);
  assert.equal(run('history',{...payload,ecologySeed:seed,rows:structuredClone(changed)}),false);
 }
 const changed=structuredClone(plans);changed[0].floorPatch.heights[2000]+=.2;
 assert.throws(()=>run('validate-group',{...payload,plans:changed,retainContext:true}),/Invalid/);
 assert.throws(()=>run('history',{...compact,plans:changed,rows}),/retained physical/);
 const exposed=structuredClone(rows);assert.equal(run('history',{...compact,rows:exposed}),true);
 assert.ok(Object.isFrozen(exposed[0].livingRidgePlan.floorPatch.heights));
 assert.throws(()=>exposed[0].livingRidgePlan.floorPatch.heights[0]++,TypeError);
 assert.equal(run('history',{...compact,rows:structuredClone(rows)}),true);
 assert.deepEqual({plans,rows},before);
});
test('retained contexts expire with LRU eviction, seed/profile changes and worker lifetime',()=>{
 const {plans}=data(),jobs=createOceanPreparationJobs(),payload={seed,wholeSeabed:true,plans};
 const first=jobs('validate-group',{...payload,retainContext:true});
 for(let offset=1;offset<=6;offset++)jobs('validate-group',{...payload,plans:[...plans.slice(offset),...plans.slice(0,offset)]});
 assert.equal(jobs.stats().contexts,6);assert.equal(jobs.stats().contextLimit,6);
 const compact={seed,wholeSeabed:true,contextToken:first.contextToken,rows:[]};
 assert.throws(()=>jobs('history',compact),/expired/);
 const current=jobs('validate-group',{...payload,retainContext:true});
 assert.throws(()=>jobs('history',{...compact,seed:seed+1,contextToken:current.contextToken}),/expired/);
 const next=jobs('validate-group',{...payload,retainContext:true});
 assert.throws(()=>jobs('history',{...compact,wholeSeabed:false,contextToken:next.contextToken}),/expired/);
 const restarted=createOceanPreparationJobs();restarted('validate-group',{...payload,retainContext:true});
 assert.throws(()=>restarted('history',{...compact,contextToken:next.contextToken}),/expired/);
});
test('real worker transports terrain only at acknowledgement, keeps native history verdicts and rejects stale handles',async()=>{
 const {plans,rows}=data(),worker=nativePreparation(),requests=[];
 const preparation={run(kind,payload){requests.push({kind,bytes:Buffer.byteLength(JSON.stringify(payload)),hasPlans:Object.hasOwn(payload,'plans')});return worker.run(kind,payload);}};
 const generator=createLivingRidgeGenerator(withWholeSeabedGenerator(createLivingShallowsGenerator(seed),true),{preparation});
 try{
  const context=await generator.prepareReefValleyContextAsync(plans);
  await context.prepareResidentHabitats(rows,seed);
  assert.equal(await context.validateHistory(rows,seed),true);
  assert.deepEqual(requests.map(r=>r.hasPlans),[true,false,false]);
  assert.ok(requests[1].bytes<requests[0].bytes*.2);assert.ok(requests[2].bytes<requests[0].bytes*.2);
  assert.equal(generator.registryStats().size,0);
  const changed=structuredClone(rows);changed.find(r=>r.agents.length).agents[0].energy=-1;
  assert.equal(await context.validateHistory(changed,seed),false);
  assert.equal(await context.validateHistory(rows,seed),true);
  worker.cancel();worker.dispose();
  await assert.rejects(context.validateHistory(rows,seed),/disposed/);
 }finally{worker.dispose();}
});
test('complete meadow histories use the same retained terrain and still reject corrupt community resources',()=>{
 const jobs=createOceanPreparationJobs(),plans=jobs('generate',{seed,wholeSeabed:true,version:9,cx:228,cz:4});
 const payload={seed,wholeSeabed:true,plans,ecologySeed:seed};
 const rows=jobs('birth',{...payload,options,environment:{hour:10,currentMps:.15,turbidity:.25,foodSupply:1}}),before=structuredClone(rows);
 const ack=jobs('validate-group',{...payload,retainContext:true});
 const compact={seed,wholeSeabed:true,ecologySeed:seed,contextToken:ack.contextToken};
 assert.equal(jobs('history',{...compact,rows:structuredClone(rows)}),true);
 assert.equal(jobs('history',{...payload,rows:structuredClone(rows)}),true);
 const changed=structuredClone(rows);changed[0].resources.detritus=-1;
 assert.equal(jobs('history',{...compact,rows:changed}),false);
 assert.equal(jobs('history',{...payload,rows:structuredClone(changed)}),false);
 assert.deepEqual(rows,before);
});
