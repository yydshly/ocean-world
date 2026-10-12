import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialLivingEntry} from '../src/initialLivingEntry.js';
import {reefValleyRegionOrigin,REEF_VALLEY_REGION_ROUTE_STOPS} from '../src/reefValleyRegion.js';
import {seagrassMeadowRegionOrigin,SEAGRASS_MEADOW_REGION_ROUTE_STOPS} from '../src/seagrassMeadowRegion.js';
import {OceanBackgroundPreparation} from '../src/oceanBackgroundPreparation.js';
import {OceanEcology,REEF_VALLEY_PREFETCH_OWNER_LIMIT} from '../src/oceanEcology.js';
import {createOceanPreparationJobs} from '../src/oceanPreparationJobs.js';
import {createLivingShallowsGenerator} from '../src/livingShallowsGeneration.js';
import {withWholeSeabedGenerator} from '../src/wholeSeabedComposition.js';
import {createLivingRidgeGenerator} from '../src/livingRidgeGeology.js';
import {livingShallowsSeed} from '../src/livingShallows.js';

test('direct entry initialization selects the same native macro staging view and ordinary exploration keeps its original entry',()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
 const start=source.indexOf('  initializeLivingDemoEntry('),end=source.indexOf('  enterLivingShallows(',start);
 const World=new Function('reefValleyRegionOrigin','seagrassMeadowRegionOrigin',`return class {${source.slice(start,end)}}`)(reefValleyRegionOrigin,seagrassMeadowRegionOrigin);
 const views=[],world=new World();world.isLivingShallows=true;world.surfaceY=8;world.habitatY=()=>-5;
 world.oceanChunks={generator:{routeStops:[...REEF_VALLEY_REGION_ROUTE_STOPS,...SEAGRASS_MEADOW_REGION_ROUTE_STOPS],sample:()=>({habitat:'reef'})}};
 world.restoreOceanObservation=view=>{views.push(view);return true;};
 for(const demo of ['director','life-expedition','reef-valley-region','seagrass-meadow-region']){
  const entry=initialLivingEntry(`?demo=${demo}&seed=55`);assert.equal(world.initializeLivingDemoEntry(entry),true);
  const cx=demo==='seagrass-meadow-region'?228:204,view=views.at(-1);
  assert.deepEqual(view,{position:{x:cx*64+192,y:-3,z:320},target:{x:cx*64+200,y:-3.65,z:320},layer:'bed',freeDepthM:11,habitat:'reef'});
 }
 for(const search of ['', '?demo=all','?demo=shallow-sample','?demo=kelp-life'])assert.equal(initialLivingEntry(search),null);
 assert.equal(world.initializeLivingDemoEntry(null),false);assert.equal(world.initializeLivingDemoEntry('unknown'),false);
 world.isLivingShallows=false;assert.equal(world.initializeLivingDemoEntry('reef-valley-region'),false);
 assert.equal(views.length,4);
 assert.match(source,/initializeLivingDemoEntry\(initialEntryStopId\)\)this\.enterLivingShallows\(\)/);
});
test('worker timing attaches to the current reused job and stays bounded without altering values or accepting stale replies',async()=>{
 let worker;const preparation=new OceanBackgroundPreparation({workerFactory:()=>worker={messages:[],postMessage(m){this.messages.push(m);},terminate(){}}});
 try{
  for(let i=0;i<70;i++){
   const promise=preparation.run(i%2?'step':'history',{}),id=worker.messages.at(-1).id;
   worker.onmessage({data:{id:id-1,value:'stale',diagnostics:{durationMs:9999}}});
   worker.onmessage({data:{id,value:i,diagnostics:{durationMs:i,contexts:{contexts:2}}}});
   assert.equal(await promise,i);assert.equal(preparation.stats().jobs.at(-1).workerMs,i);
  }
  const stats=preparation.stats();assert.equal(stats.jobs.length,64);assert.equal(stats.transitionJobs.length,24);
  stats.jobs.length=0;assert.equal(preparation.stats().jobs.length,64);
  assert.equal(stats.transitionJobs.at(-1).workerMs,68);assert.ok(stats.transitionJobs.every(j=>j.kind==='history'));
 }finally{preparation.dispose();}
});

const seed=livingShallowsSeed('55'),base=withWholeSeabedGenerator(createLivingShallowsGenerator(seed),true);
const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
class Capture{constructor(s,g,options){this.options=options;}}
const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:{}}},Capture,seed).options;
const fixtures=new Map();
function savedRows(version=8){
 if(!fixtures.has(version)){const run=createOceanPreparationJobs(),plans=run('generate',{seed,wholeSeabed:true,version,cx:version===9?228:204,cz:4});
  fixtures.set(version,run('birth',{seed,wholeSeabed:true,plans,ecologySeed:seed,options,environment:{hour:10,currentMps:.15,turbidity:.25,foodSupply:1}}));
 }
 return structuredClone(fixtures.get(version));
}
function setup(batch,change,version=8){
 const records=new Map(savedRows(version).map(r=>[r.id,r])),reads=[],writes=[];
 const store={async load(w,id){reads.push([id]);return structuredClone(records.get(id)??null);},async saveMany(w,rows){writes.push(structuredClone(rows));for(const [id,row]of rows)records.set(id,structuredClone(row));}};
 if(batch)store.loadMany=async(w,ids)=>{assert.ok(ids.length<=25);reads.push([...ids]);const result=new Map(ids.map(id=>[id,structuredClone(records.get(id)??null)]));return change?change(result,ids,reads.length):result;};
 const generator=createLivingRidgeGenerator(base),model=new OceanEcology(seed,generator,{...options,reefValleyRegion:false,meadowRegion:false,store});
 return{model,generator,records,reads,writes};
}
test('complete historical macro batches retain exact serial-read records, public sources and admission bounds',async()=>{
 const serial=setup(false),batch=setup(true),position={x:204*64+24,z:320};
 try{
  await serial.model.update(position);await batch.model.update(position);
  assert.deepEqual([...batch.model._active],[...serial.model._active]);assert.deepEqual([...batch.records],[...serial.records]);
  assert.deepEqual(batch.generator.registryStats(),serial.generator.registryStats());
  assert.ok(batch.reads.length<serial.reads.length);assert.ok(batch.reads.some(ids=>ids.length>1&&ids.length<25));
  assert.ok(batch.model._reefValleyAdmission.privateOwnerCount<=REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  assert.ok(batch.model._active.size<=9);assert.ok(batch.generator.registryStats().size<=25);
 }finally{await serial.model.dispose();await batch.model.dispose();}
});
test('missing or corrupt extra historical owners fail before terrain publication without replacing records',async()=>{
 for(const mode of ['missing','corrupt']){
  const f=setup(true,(rows,ids,count)=>{if(count===2){if(mode==='missing')rows.delete(ids[0]);else rows.get(ids.find(id=>id==='208,4')??ids[0]).resources.detritus=-1;}return rows;});
  const before=structuredClone([...f.records]);
  try{
   if(mode==='missing')assert.equal(await f.model.update({x:204*64+24,z:320}),false);
   else await assert.rejects(f.model.update({x:204*64+24,z:320}),/Invalid saved reef-valley/);
   assert.equal(f.generator.registryStats().size,0);assert.equal(f.model._active.size,0);assert.equal(f.writes.length,0);
   assert.deepEqual([...f.records],before);
  }finally{await f.model.dispose();}
 }
});
test('batched complete meadow histories preserve exact serial-read records and the combined private owner bound',async()=>{
 const serial=setup(false,null,9),batch=setup(true,null,9),position={x:228*64+24,z:320};
 try{
  await serial.model.update(position);await batch.model.update(position);
  assert.deepEqual([...batch.model._active],[...serial.model._active]);assert.deepEqual([...batch.records],[...serial.records]);
  assert.deepEqual(batch.generator.registryStats(),serial.generator.registryStats());
  assert.ok(batch.reads.length<serial.reads.length);assert.ok(batch.model._meadowRegionAdmission.privateOwnerCount<=REEF_VALLEY_PREFETCH_OWNER_LIMIT);
 }finally{await serial.model.dispose();await batch.model.dispose();}
});
test('the six-context working set keeps exact geometry across consecutive complete scans and still rechecks corrupt history',()=>{
 const rows=savedRows(),plans=rows.map(row=>row.livingRidgePlan),jobs=createOceanPreparationJobs(),tokens=[];
 for(let offset=0;offset<6;offset++){
  const rotated=[...plans.slice(offset),...plans.slice(0,offset)];
  const ack=jobs('validate-group',{seed,wholeSeabed:true,plans:rotated,retainContext:true});tokens.push(ack.contextToken);
  jobs('resident-habitats',{seed,wholeSeabed:true,contextToken:ack.contextToken,ecologySeed:seed,rows:structuredClone(rows)});
 }
 assert.equal(jobs.stats().contexts,6);assert.equal(jobs.stats().contextValidations,6);
 for(const token of tokens){
  const payload={seed,wholeSeabed:true,contextToken:token,ecologySeed:seed};
  jobs('resident-habitats',{...payload,rows:structuredClone(rows)});
  assert.equal(jobs('history',{...payload,rows:structuredClone(rows)}),true);
 }
 assert.equal(jobs.stats().contextValidations,6,'a complete working-set scan must not evict its first entries');
 const corrupted=structuredClone(rows);corrupted.find(row=>row.agents.length).agents[0].energy=-1;
 assert.equal(jobs('history',{seed,wholeSeabed:true,contextToken:tokens[0],ecologySeed:seed,rows:corrupted}),false);
});
