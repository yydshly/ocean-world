import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createOceanPreparationJobs } from '../src/oceanPreparationJobs.js';
import { createOceanTerrainJobs } from '../src/oceanTerrainJobs.js';
import { nativeTerrainWorkerFactory } from './helpers/ocean-terrain-node.mjs';
import { expeditionPreparationPosition } from '../src/lifeExpedition.js';
const seed=livingShallowsSeed('55'),position={x:206*64+24,z:4*64+30};
function fixture(factory=nativeTerrainWorkerFactory) {
 const c=new OceanChunks(seed,{livingGeology:true,sandHabitat:true,wholeSeabed:true,progressiveStreaming:true,backgroundTerrain:true,terrainWorkerFactory:factory});
 const plans=createReefValleyRegionPlans(c.generator.baseGenerator,204,4);c.generator.replaceRidgeOwners(plans);
 return {c,plans};
}
const hash=g=>{
 const h=createHash('sha256');for(const [k,a]of Object.entries(g.attributes)){h.update(k);h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 h.update(new Uint8Array(g.index.array.buffer));return h.digest('hex');
};
function fakeFactory(workers) { return ()=>{const w={messages:[],postMessage(m){this.messages.push(m);},terminate(){this.closed=true;}};workers.push(w);return w;}; }
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

test('real terrain Worker transfers the complete original sampled surface and masks while the host remains responsive',async()=>{
 const {c,plans}=fixture(),before=JSON.stringify(plans);let beats=0;const timer=setInterval(()=>beats++,2),samples=[];
 try {
  const start=performance.now();c.update(position);assert.equal(c.stats.activeChunks,0);assert.equal(c.stats.streaming.backgroundTerrain,true);
  samples.push({ms:performance.now()-start,loads:0});let calls=0;
  while(c._pendingLoads.length) {
   await new Promise(resolve=>setTimeout(resolve,3));const start=performance.now(),loads=c.stats.loads;c.update(position);
   if(c.stats.loads!==loads)samples.push({ms:performance.now()-start,loads:c.stats.loads});
   assert.ok(c.stats.loads-loads<=1);assert.ok(c.stats.activeChunks<=9);assert.ok(++calls<3000);
  }
  assert.ok(beats>20);assert.equal(c.stats.activeChunks,6);assert.equal(c.stats.streaming.maxLoadsPerUpdate,1);
  // Literal pre-change full buffer receipts; no ignored local file dependency.
  const baseline={terrain:[
   {id:'206,4',bufferHash:'9e00f7525a45b7e2f47d8039f0024854546524b92c53a0a48f8637dc67bfd18d'},
   {id:'207,5',bufferHash:'847fb4a073f5db1c664963d4c75da9343a17eb26831f446fd003e6e39ff41770'}
  ]};
  const verified=[];
  for(const r of c._chunks.values()) {
   const expected=c._terrainGeometry(r.sourceChunk);
   try {assert.equal(hash(r.terrainGeometry),hash(expected));
    const old=baseline.terrain.find(row=>row.id===r.sourceChunk.id);if(old)assert.equal(hash(expected),old.bufferHash);
    verified.push({id:r.sourceChunk.id,hash:hash(expected)});
   }finally{expected.dispose();}
  }
  assert.equal(JSON.stringify(plans),before);
  const records=new Map(c._chunks),loads=c.stats.loads;c.generator.replaceRidgeOwners(structuredClone(plans));
  assert.equal(c.update(position),false);assert.equal(c.stats.loads,loads);for(const [id,r]of records)assert.equal(c._chunks.get(id),r);
  c.setRenderOrigin({x:206*64,z:4*64});for(const r of records.values())assert.equal(r.group.position.x,r.origin.x-206*64);
  mkdirSync(new URL('../output/validation/',import.meta.url),{recursive:true});
  writeFileSync(new URL('../output/validation/cruise-background-terrain-native.json',import.meta.url),JSON.stringify({scope:'serial native Worker and real Three construction, not browser frames/FPS',hostBeats:beats,samples,completeBuffersExact:verified},null,2));
 } finally {clearInterval(timer);c.dispose();}
});

test('the actual blocked next owner takes priority over speculative lookahead and still respects pause, hidden and adjacent-window bounds',()=>{
 const p={x:63,y:-3,z:63},blocked={x:65,y:-3,z:61},options={elapsedSec:12,durationSec:240,playbackRate:4,blockedPosition:blocked,
  sample:()=>({position:{x:61,y:-3,z:65}})};
 assert.deepEqual(expeditionPreparationPosition(p,options),blocked);
 assert.equal(expeditionPreparationPosition(p,{...options,paused:true}),p);
 assert.equal(expeditionPreparationPosition(p,{...options,hidden:true}),p);
 assert.deepEqual(expeditionPreparationPosition(p,{...options,blockedPosition:{...blocked,x:200}}),options.sample().position);
 assert.deepEqual(blocked,{x:65,y:-3,z:61});
});

test('background terrain cancels obsolete windows and reset/dispose reject late replies without publishing them',async()=>{
 const workers=[],{c,plans}=fixture(fakeFactory(workers));const run=createOceanTerrainJobs();
 try {
  c.update(position);const old=workers[0],message=old.messages[0],value=run(message.payload);
  const moved={x:208*64+24,z:5*64+30};c.update(moved);assert.equal(old.closed,true);assert.equal(c.stats.activeChunks,0);
  old.onmessage({data:{id:message.id,value}});await turn();c.update(moved);assert.equal(c.stats.activeChunks,0);
  const current=workers[1],m=current.messages[0];current.onmessage({data:{id:m.id,value:run(m.payload)}});await turn();c.update(moved);
  assert.deepEqual(c.stats.loadedChunks,['208,5']);assert.equal(c._chunks.get('208,5').terrainGeometry.attributes.position.count,4225);
  const late=current.messages.at(-1),lateValue=run(late.payload);c.reset(seed);assert.equal(current.closed,true);
  current.onmessage({data:{id:late.id,value:lateValue}});await turn();assert.equal(c.stats.activeChunks,0);
  c.generator.replaceRidgeOwners(plans);c.update(moved);const final=workers.at(-1),last=final.messages.at(-1),finalValue=run(last.payload);
  c.dispose();final.onmessage({data:{id:last.id,value:finalValue}});await turn();assert.equal(c.stats.activeChunks,0);assert.equal(final.closed,true);
 }finally{c.dispose();}
});

test('terrain failures and malformed replies surface promptly and the same static entrance can retry with the original sources',async()=>{
 const workers=[],{c}=fixture(fakeFactory(workers));const run=createOceanTerrainJobs();
 try {
  c.update(position);workers[0].onerror({message:'terrain CPU failed'});await turn();assert.throws(()=>c.update(position),/terrain CPU failed/);
  let current=true;const retry=c.prepareWindow(position,{isCurrent:()=>current});current=false;assert.equal(await retry,false);
  const w=workers[1],m=w.messages[0];w.onmessage({data:{id:m.id,value:{positions:new Float32Array(1)}}});await turn();assert.throws(()=>c.update(position),/Invalid prepared/);
  const again=c.prepareWindow(position);let calls=0;
  while(c._pendingLoads.length) {
   const worker=workers.at(-1),message=worker.messages.at(-1);
   if(c._terrainPreparation.pending)worker.onmessage({data:{id:message.id,value:run(message.payload)}});
   await turn();assert.ok(++calls<30);
  }
  assert.equal(await again,true);assert.equal(c.stats.activeChunks,6);
 }finally{c.dispose();}
});

test('a changed adjacent committed source cancels an in-flight surface and never mixes old masks with the new neighbourhood',async()=>{
 const workers=[],{c,plans}=fixture(fakeFactory(workers)),run=createOceanTerrainJobs();
 try {
  c.update(position);const w=workers[0],m=w.messages[0],old=run(m.payload);
  c.generator.replaceRidgeOwners(plans.filter(p=>p.cx!==205),['205,4','205,5']);c.update(position);assert.equal(w.closed,true);
  w.onmessage({data:{id:m.id,value:old}});await turn();c.update(position);assert.equal(c.stats.activeChunks,0);
  const current=workers[1],msg=current.messages[0];current.onmessage({data:{id:msg.id,value:run(msg.payload)}});await turn();c.update(position);
  const record=c._chunks.get('206,4'),expected=c._terrainGeometry(record.sourceChunk);
  try{assert.equal(hash(record.terrainGeometry),hash(expected));}finally{expected.dispose();}
  c.generator.replaceRidgeOwners(plans);c.update(position);
  assert.equal(c._chunks.get('206,4'),record,'unchanged physical owner remains visible during neighbour refresh');
  const swapWorker=workers.at(-1),swap=swapWorker.messages.at(-1);
  swapWorker.onmessage({data:{id:swap.id,value:run(swap.payload)}});await turn();c.update(position);
  const replacement=c._chunks.get('206,4');assert.notEqual(replacement,record);assert.equal(record.group.parent,null);
  const fresh=c._terrainGeometry(replacement.sourceChunk);
  try{assert.equal(hash(replacement.terrainGeometry),hash(fresh));}finally{fresh.dispose();}
  assert.ok(c.stats.activeChunks<=9);
 }finally{c.dispose();}
});

test('bounded immutable worker contexts reuse terrain only and recheck each full mutable history, corruption, seed and profile',()=>{
 const run=createOceanPreparationJobs(),plans=run('generate',{seed,wholeSeabed:true,version:8,cx:204,cz:4}),payload={seed,wholeSeabed:true,plans};
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture { constructor(_seed,_generator,options){this.options=options;} }
 const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:{}}},Capture,seed).options;
 const rows=run('birth',{...payload,ecologySeed:seed,options,environment:{hour:10,currentMps:.15,turbidity:.25,foodSupply:1}});
 assert.equal(run('validate-group',payload),true);assert.equal(run('history',{...payload,ecologySeed:seed,rows:structuredClone(rows)}),true);
 assert.equal(run.stats().contextValidations,1);assert.equal(run.stats().contextHits,2);
 const corrupt=structuredClone(rows);corrupt.find(row=>row.agents.length).agents[0].energy=-1;
 assert.equal(run('history',{...payload,ecologySeed:seed,rows:corrupt}),false,'no mutable-history verdict is cached');
 const changed=structuredClone(plans);changed[0].floorPatch.heights[2000]+=.2;
 assert.throws(()=>run('validate-group',{...payload,plans:changed}),/Invalid/);
 for(let offset=1;offset<=7;offset++)assert.equal(run('validate-group',{...payload,plans:[...plans.slice(offset),...plans.slice(0,offset)]}),true);
 assert.equal(run.stats().contexts,6);assert.equal(run.stats().contextLimit,6);
 assert.throws(()=>run('validate-group',{...payload,seed:seed+1}),/Invalid/);assert.equal(run.stats().contexts,0);
 assert.throws(()=>run('validate-group',{...payload,wholeSeabed:false}),/Invalid/);assert.equal(run.stats().contexts,0);
 assert.equal(run('validate-group',payload),true);assert.equal(run('history',{...payload,ecologySeed:seed,rows:structuredClone(rows)}),true);
 assert.ok(isDeepStrictEqual(plans,rows.map(r=>r.livingRidgePlan)));
});
