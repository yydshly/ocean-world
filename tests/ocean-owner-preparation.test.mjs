import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {OceanChunks} from '../src/world/OceanChunks.js';
import {OceanEcology} from '../src/oceanEcology.js';
import {OceanBackgroundRuntime} from '../src/oceanBackgroundRuntime.js';
import {OceanBackgroundPreparation} from '../src/oceanBackgroundPreparation.js';
import {livingShallowsSeed} from '../src/livingShallows.js';
import {createLivingSeascapePlans} from '../src/livingSeascape.js';
import {createLivingHabitatBeltPlans} from '../src/livingHabitatBelt.js';
import {createLivingShallowSeascapePlans} from '../src/livingShallowSeascape.js';
import {createLivingCoastalSeascapePlans} from '../src/livingCoastalSeascape.js';

test('real worker owner preparation retains complete native records, flags, environment and main publication barrier',async()=>{
  const seed=livingShallowsSeed('55'),chunks=new OceanChunks(seed,{livingGeology:true,wholeSeabed:true});
  const source=readFileSync('src/world/ReefWorld.js','utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Options{constructor(s,g,options){this.options=options;}}
  const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:chunks.generator}},Options,seed).options;
  const store={async load(){return null;},async saveMany(){throw Error('preparation may not save');}};
  const native=new OceanEcology(seed,chunks.generator,{...options,store});
  native._environment={...native._environment,hour:15,currentMps:.4,foodSupply:.7};
  const preparation=new OceanBackgroundPreparation({workerFactory:()=>{
    const worker=new Worker(new URL('./helpers/ocean-runtime-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};
    worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.({message:e.message}));return adapter;
  }}),runtime=new OceanBackgroundRuntime(native,{preparation});
  try{
    await assert.rejects(runtime.prepareOwner(null,[3,3],false),/publication barrier/);
    for(const coordinates of [[3,3],[204,4]]){
      native._supportCells.clear();native._runtimePoseCache=null;
      const expected=native._prepareRegion(null,coordinates,false),registry=chunks.generator.registryStats();
      const actual=await runtime.withBarrier(()=>runtime.prepareOwner(null,coordinates,false));
      assert.ok(isDeepStrictEqual(actual,expected),'complete fresh owner and all rollback/initialization flags match native');
      assert.equal(native._active.size,0);assert.deepEqual(chunks.generator.registryStats(),registry);
      const saved=structuredClone(expected.region);saved.opaqueHistory={note:'original input'};
      native._supportCells.clear();native._runtimePoseCache=null;
      const restored=native._prepareRegion(structuredClone(saved),coordinates,true);
      const workerRestored=await runtime.withBarrier(()=>runtime.prepareOwner(saved,coordinates,true));
      assert.ok(isDeepStrictEqual(workerRestored,restored),'restoration and rollback records match native');
      assert.deepEqual(workerRestored.region.opaqueHistory,saved.opaqueHistory);
      assert.deepEqual(chunks.generator.registryStats(),registry);
    }
  }finally{await runtime.shutdown();await native.dispose();chunks.dispose();}
});

test('real worker four-owner and complete twelve-owner births exactly retain native populations before atomic publication',async()=>{
  const seed=livingShallowsSeed('42'),chunks=new OceanChunks(seed,{livingGeology:true,wholeSeabed:true});
  const source=readFileSync('src/world/ReefWorld.js','utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Options{constructor(s,g,options){this.options=options;}}
  const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:chunks.generator}},Options,seed).options;
  const native=new OceanEcology(seed,chunks.generator,{...options,store:{saveMany(){throw Error('uncommitted group may not save');}}});
  const preparation=new OceanBackgroundPreparation({workerFactory:()=>{
    const worker=new Worker(new URL('./helpers/ocean-runtime-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};
    worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.({message:e.message}));return adapter;
  }}),runtime=new OceanBackgroundRuntime(native,{preparation});
  try{
    await assert.rejects(runtime.prepareGroup([]),/publication barrier/);
    const base=chunks.generator.baseGenerator;
    for(const [plans,context] of [
      [createLivingSeascapePlans(base,54,8),'withRidgePlans'],
      [createLivingHabitatBeltPlans(base,74,2),'withRidgePlans'],
      [createLivingShallowSeascapePlans(base,96,2),'withShallowSeascapePlans'],
      [createLivingCoastalSeascapePlans(base,150,4),'withCoastalSeascapePlans'],
    ]){
      native._supportCells.clear();native._runtimePoseCache=null;
      const registry=chunks.generator.registryStats();
      const expected=chunks.generator[context](plans,()=>plans.map(plan=>native._prepareRegion(null,[plan.cx,plan.cz],false).region));
      const actual=await runtime.withBarrier(()=>runtime.prepareGroup(plans));
      assert.ok(isDeepStrictEqual(actual,expected),`complete native v${plans[0].version} birth records match`);
      assert.equal(native._active.size,0);assert.deepEqual(chunks.generator.registryStats(),registry);
      // The worker cannot silently substitute a partial or unsupported group.
      await assert.rejects(runtime.withBarrier(()=>runtime.prepareGroup(plans.slice(0,1))),/group|candidate|owners|Incomplete/);
    }
  }finally{await runtime.shutdown();await native.dispose();chunks.dispose();}
});

test('worker-backed region update publishes the same whole habitat transactions and finite timings as native update',async()=>{
  const seed=livingShallowsSeed('42');
  const make=()=>{
    const chunks=new OceanChunks(seed,{livingGeology:true,wholeSeabed:true});
    const source=readFileSync('src/world/ReefWorld.js','utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
    class Options{constructor(s,g,options){this.options=options;}}
    const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:chunks.generator}},Options,seed).options;
    const records=new Map(),store={async load(world,id){return structuredClone(records.get(id)??null);},async loadMany(world,ids){return new Map(ids.map(id=>[id,structuredClone(records.get(id)??null)]));},
      async saveMany(world,rows){for(const [id,row]of rows)records.set(id,structuredClone(row));}};
    return {chunks,records,ecology:new OceanEcology(seed,chunks.generator,{...options,store})};
  };
  const native=make(),background=make();
  const preparation=new OceanBackgroundPreparation({workerFactory:()=>{
    const worker=new Worker(new URL('./helpers/ocean-runtime-node-worker.mjs',import.meta.url)),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};
    worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.({message:e.message}));return adapter;
  }});
  background.ecology.backgroundRuntime=new OceanBackgroundRuntime(background.ecology,{preparation});
  const sorted=map=>[...map].sort(([a],[b])=>a.localeCompare(b));
  try{
    const position={x:74*64+32,z:2*64+32};
    await native.ecology.update(position);await background.ecology.update(position);
    assert.ok(background.records.has('74,2'),'the real whole habitat group was saved');
    assert.deepEqual(sorted(background.records),sorted(native.records),'exact full persisted records, not just drawn animals');
    assert.deepEqual(sorted(background.ecology._active),sorted(native.ecology._active),'exact authoritative active owners');
    for(const value of Object.values(background.ecology._reefValleyTiming))if(typeof value==='number')assert.ok(Number.isFinite(value));
  }finally{await native.ecology.dispose();await background.ecology.dispose();native.chunks.dispose();background.chunks.dispose();}
});
