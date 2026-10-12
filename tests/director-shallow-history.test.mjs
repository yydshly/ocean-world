import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {OceanChunks} from '../src/world/OceanChunks.js';
import {OceanEcology} from '../src/oceanEcology.js';
import {OceanBackgroundRuntime} from '../src/oceanBackgroundRuntime.js';
import {createOceanRuntimeJobs} from '../src/oceanRuntimeJobs.js';
import {livingShallowsSeed} from '../src/livingShallows.js';
import {createOceanBiodiversityPlan} from '../src/oceanBiodiversity.js';

const difference = (a,b,path='') => {
  if(isDeepStrictEqual(a,b)) return null;
  if(!a||!b||typeof a!=='object'||typeof b!=='object') return {path,actual:a,expected:b};
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
    const diff=difference(a[key],b[key],`${path}.${key}`);if(diff)return diff;
  }
  return {path,actualType:a.constructor.name,expectedType:b.constructor.name};
};
const equal=(a,b,label)=>assert.ok(isDeepStrictEqual(a,b),label+' '+JSON.stringify(difference(a,b)));


test('seed55 director return validates all twelve original shallow owners privately and preserves history', async () => {
  const seed=livingShallowsSeed('55'),chunks=new OceanChunks(seed,{livingGeology:true,wholeSeabed:true});
  const source=readFileSync('src/world/ReefWorld.js','utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Options{constructor(s,g,options){this.options=options;}}
  const options=new Function('OceanEcology','seed','return '+source.slice(start,end)).call({isLivingShallows:true,oceanWorldVariant:'whole-seabed',oceanChunks:{generator:chunks.generator}},Options,seed).options;
  const records=new Map(),store={async load(w,id){return structuredClone(records.get(w+'|'+id)??null);},async saveMany(w,rows){for(const [id,row] of rows)records.set(w+'|'+id,structuredClone(row));}};
  const e=new OceanEcology(seed,chunks.generator,{...options,store}),run=createOceanRuntimeJobs();
  e.backgroundRuntime=new OceanBackgroundRuntime(e,{preparation:{async run(kind,payload){return structuredClone(run(structuredClone(payload)));},dispose(){}}});
  const opening={x:6220,z:170},far={x:11296,z:480};
  try{
    await e.update(opening);
    e._active.values().next().value.historyExtension={evidence:'original director visit'};
    const capture=()=>structuredClone([...e._active].sort(([a],[b])=>a.localeCompare(b)));
    const full=e.snapshot(),display=e.snapshot({detailedTerrain:false});
    assert.deepEqual(display.agents,full.agents);
    assert.ok(full.regions.some(row=>row.livingRidgePlan?.floorPatch));
    assert.ok(display.regions.every(row=>!row.livingRidgePlan||row.livingRidgePlan.geometryIncluded===false));
    console.log('snapshot bytes',JSON.stringify(full).length,JSON.stringify(display).length);
    assert.ok(display.regions.every(row=>!row.livingRidgePlan||(!row.livingRidgePlan.floorPatch&&!row.livingRidgePlan.elements)));
    assert.ok(JSON.stringify(display).length<JSON.stringify(full).length,'display excludes geometry; exports retain it');
    const original=capture();
    await e.update(far);
    const saved=structuredClone([...records]);
    await e.update(opening);
    equal(capture(),original,'return retains every individual, resource, clock and opaque history field');
    for(const position of [{x:6308,z:192},{x:6408,z:170},{x:6504,z:224},opening]) await e.update(position);
    equal(capture(),original,'all existing whole-scene stops return to the same unchanged historical population');
    assert.ok(chunks.generator.registryStats().size<=25,'private history never expands the published halo');
    const shallow=saved.map(([,row])=>row).filter(row=>row.shallowSeascapeVersion===1).map(row=>[row.id,row]);
    assert.equal(shallow.length,12);
    assert.ok(shallow.some(([id])=>id==='101,2'));
    const before=structuredClone(shallow),registry=chunks.generator.registryStats();
    assert.equal(e._validateSupportHistory(shallow),true);
    assert.ok(isDeepStrictEqual(shallow,before));
    assert.deepEqual(chunks.generator.registryStats(),registry);
    const plans=shallow.map(([,row])=>row.livingRidgePlan),context=chunks.generator.prepareShallowSeascapeContext(plans);
    assert.equal(chunks.generator.prepareShallowSeascapeContext(structuredClone(plans)),context,'the entire physical source must match');
    assert.ok(Object.isFrozen(context.immutablePlans[0].floorPatch.heights));
    const sourceRow=shallow.find(([,row])=>row.biodiversity?.patches.length&&row.shoalLifeVersion&&row.agents.some(a=>a.biodiversityIndividualVersion))[1];
    const compute=()=>createOceanBiodiversityPlan(chunks.generator,{id:sourceRow.id,cx:sourceRow.cx,cz:sourceRow.cz,agents:[]},
      {surface:(x,z,coral)=>e._surface(x,z,coral,true,true,true,true,true,false),bed:(x,z)=>e._bed(x,z),availableSlots:0});
    const originalCanonical=context(compute),cachedCanonical=context.cacheBiodiversityPlan(sourceRow,e.livingNetworkEnabled,()=>assert.fail('complete terrain expectation already cached'));
    assert.deepEqual(cachedCanonical,originalCanonical);assert.ok(Object.isFrozen(cachedCanonical.patches));
    for(const mutate of [r=>r.biodiversity.patches[0].y-=1,r=>r.biodiversity.preference=-1,r=>r.agents[0].energy=-1,
      r=>r.timeSec+=.1,r=>r.basicNetwork.nutrients=-1,r=>r.agents.find(a=>a.biodiversityIndividualVersion).position.y=-999]){
      const changed=structuredClone(shallow),row=changed.find(([id])=>id===sourceRow.id)[1];mutate(row);
      assert.throws(()=>e._validateSupportHistory(changed),/Invalid saved/,'cached geometry must reject current mutable corruption');
    }
    let cacheCalls=0;const cache=context.cacheBiodiversityPlan;
    context.cacheBiodiversityPlan=(...args)=>{cacheCalls++;return cache(...args);};
    try{e._sceneSupports.set('extra-empty',[]);assert.equal(e._validateSupportHistory(shallow),true);assert.equal(cacheCalls,0,'extra supports disable retained canonical geometry');}
    finally{e._sceneSupports.delete('extra-empty');context.cacheBiodiversityPlan=cache;}
    const changedPlans=structuredClone(plans);changedPlans[0].floorPatch.heights[2000]+=.2;
    assert.throws(()=>chunks.generator.prepareShallowSeascapeContext(changedPlans),/Invalid/);
    const oldBed=new Map(),oldSurface=new Map(),oldCanonical=()=>null;
    e._stepBedMemo=oldBed;e._stepSurfaceMemo=oldSurface;e._historyBiodiversityCanonical=oldCanonical;
    assert.throws(()=>e._withHistoryQueries(sourceRow,()=>{throw Error('interrupted validation');}),/interrupted/);
    assert.equal(e._stepBedMemo,oldBed);assert.equal(e._stepSurfaceMemo,oldSurface);assert.equal(e._historyBiodiversityCanonical,oldCanonical);
    e._stepBedMemo=null;e._stepSurfaceMemo=null;e._historyBiodiversityCanonical=null;
    assert.ok(isDeepStrictEqual(shallow,before),'complete original records unchanged after cached validation and rejected candidates');
    const damaged=structuredClone(shallow);damaged.find(([id])=>id==='101,2')[1].biodiversity.preference=-1;
    assert.throws(()=>e._validateSupportHistory(damaged),/Invalid saved biodiversity owner 101,2/);
    await assert.rejects(e.backgroundRuntime.withBarrier(()=>e.backgroundRuntime.validateHistory('support',damaged)),/Invalid saved biodiversity owner 101,2/);
    assert.equal(damaged.find(([id])=>id==='101,2')[1].biodiversity.preference,-1,'corruption remains rejected, never healed');
  }finally{await e.dispose();chunks.dispose();}
});
