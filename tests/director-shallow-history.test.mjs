import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {OceanChunks} from '../src/world/OceanChunks.js';
import {OceanEcology} from '../src/oceanEcology.js';
import {OceanBackgroundRuntime} from '../src/oceanBackgroundRuntime.js';
import {createOceanRuntimeJobs} from '../src/oceanRuntimeJobs.js';
import {livingShallowsSeed} from '../src/livingShallows.js';

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
    const damaged=structuredClone(shallow);damaged.find(([id])=>id==='101,2')[1].biodiversity.preference=-1;
    assert.throws(()=>e._validateSupportHistory(damaged),/Invalid saved biodiversity owner 101,2/);
    await assert.rejects(e.backgroundRuntime.withBarrier(()=>e.backgroundRuntime.validateHistory('support',damaged)),/Invalid saved biodiversity owner 101,2/);
    assert.equal(damaged.find(([id])=>id==='101,2')[1].biodiversity.preference,-1,'corruption remains rejected, never healed');
  }finally{await e.dispose();chunks.dispose();}
});
