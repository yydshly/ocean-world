import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {compressedModelDataPlugin} from '../scripts/compressed-model-data.mjs';
import {navigateDemoEntry} from '../src/demoNavigation.js';
import {createKelpOceanGenerator} from '../src/kelpOceanGeneration.js';
import {createDeepOceanGenerator} from '../src/deepOceanGeneration.js';

test('empty animal observations stay strict unless the ready director explicitly requests a disclosed habitat fallback', async()=>{
 const source=await readFile('src/world/ReefWorld.js','utf8');
 const start=source.indexOf('  prepareDirectorObservation(');
 const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start+2));
 const World=new Function(`return class {${source.slice(start,start+2+next.index)}}`)();
 for(const [routeId,method,biome]of [
  ['shoal-life','oceanShoalLifeObservation','isLivingShallows'],['meadow-life','oceanMeadowLifeObservation','isLivingShallows'],
  ['kelp-understory-life','kelpUnderstoryLifeObservation','isKelp'],['kelp-near-bottom-life','kelpNearBottomLifeObservation','isKelp'],['kelp-water-life','kelpWaterLifeObservation','isKelp'],
  ['deep-midwater-life','deepMidwaterLifeObservation','isDeep'],['deep-water-life','deepWaterLifeObservation','isDeep'],['deep-hard-life','deepHardLifeObservation','isDeep']
 ]){
  const world=new World();world[biome]=true;world[method]=()=>null;
  world.restoreOceanObservation=()=>assert.fail('empty view cannot fabricate a camera target');
  assert.equal(world.prepareDirectorObservation({routeId}),false,routeId);
  assert.equal(world.directorEntryNotice,undefined);
  assert.equal(world.prepareDirectorObservation({routeId},{allowHabitatFallback:true}),true);
  assert.match(world.directorEntryNotice,/继续观察已有生境/);
  world.oceanEcologyResetting=true;
  assert.equal(world.prepareDirectorObservation({routeId},{allowHabitatFallback:true}),false);
  world.oceanEcologyResetting=false;world.disposed=true;
  assert.equal(world.prepareDirectorObservation({routeId},{allowHabitatFallback:true}),false);
  world.disposed=false;world[method]=()=>({position:{x:1,y:2,z:3}});world.restoreOceanObservation=()=>false;
  assert.equal(world.prepareDirectorObservation({routeId},{allowHabitatFallback:true}),false,'unsafe real framing must still fail');
 }
});

test('packaged model data round-trips every authored source exactly and remains content-cacheable', async()=>{
 const plugin=compressedModelDataPlugin();let before=0,after=0,count=0;
 for(const file of (await readdir('src/world')).filter(name=>/shallow\w+Data\.js$/i.test(name))){
  const id=path.resolve('src/world',file).replaceAll('\\','/'),code=await readFile(id,'utf8');let asset;
  const result=await plugin.transform.call({emitFile(value){asset=value;return 'test';}},code,id);
  if(!result)continue;
  const original=await import(pathToFileURL(id));
  assert.deepEqual(JSON.parse(gunzipSync(asset.source)),JSON.parse(JSON.stringify(original)),file);
  assert.ok(!result.code.includes('base64,'));assert.ok(result.code.length<700,file);
  assert.equal(asset.name,file.replace(/\.js$/,'.bin'));
  before+=Buffer.byteLength(code);after+=asset.source.length;count++;
 }
 assert.equal(count,12);assert.ok(after<before*.65,{before,after});
});
for(const [biome,create,options,ids]of [
 ['kelp',createKelpOceanGenerator,{forestBelt:true},['kelp-scene-forest','kelp-scene-rockbed','kelp-scene-opening','kelp-scene-outer']],
 ['deep',createDeepOceanGenerator,{seascape:true},['deep-scene-plain','deep-scene-slope','deep-scene-outcrop','deep-scene-outer']]
])test(`director crosses into ${biome} for seed55 without inventing an absent macro scene`,()=>{
 const generator=create('55',options),calls=[],world={biomeId:biome,oceanChunks:{generator},protectedState:{seed:'55',animals:['existing']}};
 const keys=biome==='kelp'?['forestRouteStops','kelpSeascapeRouteStops','kelpBenthicLifeRouteStops','kelpUnderstoryLifeRouteStops','kelpNearBottomLifeRouteStops','kelpWaterLifeRouteStops']:['seascapeRouteStops','wholeSeascapeRouteStops','deepBenthicLifeRouteStops','deepHardLifeRouteStops','deepWaterLifeRouteStops'];
 const actual=keys.flatMap(key=>generator[key]??[]),state=structuredClone(world.protectedState);
 world[biome==='kelp'?'enterKelpForestBelt':'enterDeepSeascape']=id=>{calls.push(id);return actual.some(stop=>stop.id===id);};
 for(const id of ids){
  assert.equal(navigateDemoEntry({kind:`${biome}-stop`,stopId:id},world,{movingDirector:true}),true,id);
  assert.ok(actual.some(stop=>stop.id===calls.at(-1)));
  if(!actual.some(stop=>stop.id===id))assert.match(world.directorEntryNotice,/当前种子未形成/);
 }
 assert.deepEqual(world.protectedState,state);
 assert.equal(navigateDemoEntry({kind:`${biome}-stop`,stopId:'not-a-real-stop'},world,{movingDirector:true}),false);
 assert.equal(world.directorEntryNotice,null);
});
