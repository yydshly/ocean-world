import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanBenthicLifePlan, initializeOceanBenthicLife, tickOceanBenthicLifeAgent,
  validateOceanBenthicLifeRecord, OCEAN_BENTHIC_LIFE_IDS } from '../src/oceanBenthicLife.js';
import { oceanBenthicLifeSpeciesById } from '../src/oceanBenthicLifeSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

const allPresent = () => .1, clone = value => JSON.parse(JSON.stringify(value));
function fixture({ floorY = -3, rocks = true, grass = true } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64,
    bounds: { minX: 192, maxX: 256, minZ: 192, maxZ: 256 }, counts: {}, elements: [] };
  if (rocks) for (const [i, [x, z]] of [[209, 211], [234, 229]].entries()) chunk.elements.push({ id: `rock:${i}`,
    kind: 'rock', profile: 'terrace', x, y: floorY, z, scale: { x: 18, y: 1, z: 16 }, rotation: .2 });
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6, y: floorY, z: 248,
    scale: { x: .7, y: .4, z: .7 }, rotation: 0 });
  const bed = () => floorY;
  const surface = (x, z) => chunk.elements.reduce((height, e) => {
    const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : null; return h === null ? height : Math.max(height, h);
  }, floorY);
  const generator = { seed: 'benthic-fixture-2', profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand' }) };
  return { generator, chunk, bed, surface };
}
function regionFor(chunk, count = 0, turtleCount = 0) {
  const region = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae: .4, plankton: .5, detritus: .3 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 }, turtleAgents: [] };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: chunk.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .5, sizeM: .075, position: { x: 254, y: -1, z: 254 }, home: { x: 254, y: -1, z: 254 } });
  for (let i = 0; i < turtleCount; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  region.reefGuild = { preyOrganicUnits: .08 }; initializeLivingNetwork(region, chunk); return region;
}
function initialized(options = {}, count = 0, turtleCount = 0, smallAnimals = true) {
  const f = fixture(options), region = regionFor(f.chunk, count, turtleCount);
  assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent, smallAnimals }), true);
  return { ...f, region };
}
const balanced = region => { assert.ok(Math.abs(livingNetworkBalance(region)) < 1e-9); assert.ok(validateLivingNetworkRecord(region)); };


import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { OCEAN_SMALL_BOTTOM_SPECIES, OCEAN_SMALL_BOTTOM_IDS } from '../src/oceanSmallBottomSpecies.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOceanBenthicLifeAsset, animateOceanBenthicLifeAsset, disposeOceanBenthicLifeAsset,
  OCEAN_BENTHIC_LIFE_ENVELOPES, oceanBenthicLifeAssetStats } from '../src/world/OceanBenthicLifeAssets.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';


import { OCEAN_SAND_BOTTOM_IDS, OCEAN_SAND_BOTTOM_SPECIES, sandBottomFoodPool } from '../src/oceanSandBottomSpecies.js';

import { OCEAN_REEF_BOTTOM_IDS, OCEAN_REEF_BOTTOM_SPECIES, reefBottomFoodPool } from '../src/oceanReefBottomSpecies.js';
const reefOnly=salt=>salt.endsWith(':present')&&!OCEAN_REEF_BOTTOM_IDS.some(id=>salt.includes(id))?1:.1;
function reefFixture(options={},count=0,turtles=0){
 const f=fixture(options),region=regionFor(f.chunk,count,turtles);
 assert.equal(initializeOceanBenthicLife(region,f.generator,{...f,fresh:true,reefAnimals:true,random:reefOnly}),true);
 return {...f,region};
}
function step(f){f.region.timeSec+=.1;f.region.ticks++;for(const a of f.region.agents)tickOceanBenthicLifeAgent(f.region,f.generator,a,.1,{...f,random:allPresent,environment:{lightAtDepth:1}});}
test('three sourced distinct hard-reef bodies extend only the shallow regional catalog while old fresh v1/v2/v3 never refill',()=>{
 assert.equal(livingShallowsSpeciesCatalog.length,106);assert.equal(OCEAN_BENTHIC_LIFE_IDS.length,4);
 assert.equal(new Set(OCEAN_REEF_BOTTOM_SPECIES.map(s=>s.scientificName)).size,3);
 for(const s of OCEAN_REEF_BOTTOM_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);assert.ok(s.sources.length>=2);assert.ok(Object.isFrozen(s));assert.equal(s.calibratedMovementMPerS,null);for(const list of Object.values(sceneCatalogs))assert.ok(!list.some(x=>x.id===s.id));}
 for(const version of[1,2,3]){const f=fixture(),r=regionFor(f.chunk);assert.equal(initializeOceanBenthicLife(r,f.generator,{...f,fresh:true,smallAnimals:version>=2,sandAnimals:version>=3}),true);const saved=clone(r);assert.ok(!r.agents.some(a=>OCEAN_REEF_BOTTOM_IDS.includes(a.speciesId)));assert.equal(initializeOceanBenthicLife(r,f.generator,{...f,fresh:true,reefAnimals:true}),false);assert.deepEqual(r,saved);assert.ok(validateOceanBenthicLifeRecord(r,f.generator,f));}
});
test('v4 births use real whole hard-body support and unchanged dead/turtle cap; empty, steep, planted or false rock niches stay empty',()=>{
 const f=reefFixture();assert.deepEqual(new Set(f.region.agents.map(a=>a.speciesId)),new Set(OCEAN_REEF_BOTTOM_IDS));assert.equal(f.region.benthicLifeVersion,4);assert.ok(f.region.agents.every(a=>a.benthicLifeMode==='hard'));assert.ok(validateOceanBenthicLifeRecord(f.region,f.generator,f));balanced(f.region);
 const cap=reefFixture({},17,2);assert.equal(cap.region.agents.length,18);assert.ok(validateOceanBenthicLifeRecord(cap.region,cap.generator,cap));
 const empty=reefFixture({rocks:false});assert.equal(empty.region.agents.length,0);const saved=clone(empty.region);assert.equal(initializeOceanBenthicLife(empty.region,empty.generator,{...empty,fresh:true,reefAnimals:true}),false);assert.deepEqual(empty.region,saved);
 for(const change of['height','plant','mode','version','perimeter-support']){const r=clone(f.region);const a=r.agents.find(a=>a.speciesId==='giant-triton');if(change==='height')a.position.y+=.1;if(change==='mode')a.benthicLifeMode='soft';if(change==='version'){r.benthicLifeVersion=3;r.benthicLife.version=3;}const g=change==='plant'?{...f.generator,chunk:()=>({...f.chunk,elements:[...f.chunk.elements,{kind:'seagrass',x:a.position.x,z:a.position.z,scale:{x:1,z:1,y:1}}]})}:f.generator;const q=change==='perimeter-support'?{...f,surface:(x,z)=>f.surface(x,z)+(Math.hypot(x-a.position.x,z-a.position.z)>a.sizeM*.6?.1:0)}:f;assert.equal(validateOceanBenthicLifeRecord(r,g,q),false,change);}
});
test('hard-reef agents actually move and debit three separate existing pools, retain exact receipts, and stop at death, pause or depletion',()=>{
 const f=reefFixture(),r=f.region,start=new Map(r.agents.map(a=>[a.id,clone(a.position)])),input=r.basicNetwork.ledger.externalInput;
 for(let i=0;i<40;i++)step(f);
 for(const a of r.agents){assert.ok(Math.hypot(a.position.x-start.get(a.id).x,a.position.z-start.get(a.id).z)>.001,a.speciesId);assert.ok(a.lastFeedAt!==null);assert.equal(a.lastReefBottomIntake.pool,reefBottomFoodPool(a.speciesId));assert.ok(a.lastReefBottomIntake.removedUnits>0);}
 assert.ok(r.resources.algae<.4&&r.resources.detritus<.3&&r.reefGuild.preyOrganicUnits<.08);assert.equal(r.basicNetwork.ledger.externalInput,input);assert.ok(validateOceanBenthicLifeRecord(r,f.generator,f));balanced(r);
 const wrong=clone(r);wrong.agents[0].lastReefBottomIntake.removedUnits+=.01;assert.equal(validateOceanBenthicLifeRecord(wrong,f.generator,f),false);
 const dead=r.agents[0];dead.alive=false;recordLivingDeath(r,dead);const prior=clone(dead);tickOceanBenthicLifeAgent(r,f.generator,dead,.1,f);assert.deepEqual(dead,prior);balanced(r);
 const paused=clone(r);for(const a of r.agents)tickOceanBenthicLifeAgent(r,f.generator,a,0,f);assert.deepEqual(r,paused);
 const empty=reefFixture(),n=empty.region;n.resources.algae=0;n.resources.detritus=0;n.reefGuild.preyOrganicUnits=0;n.basicNetwork.ledger.initial-=.78;n.ledger.initial-=.7;
 for(let i=0;i<40;i++)step(empty);assert.ok(n.agents.every(a=>a.lastFeedAt===null&&a.lastReefBottomIntake===null));assert.equal(n.benthicLife.counters.consumedUnits,0);balanced(n);
});
test('complete blue arms, papillae and whorled shell kits remain inside the whole support envelope through own-clock motion and release resources',()=>{
 const before=oceanBenthicLifeAssetStats();
 for(const s of OCEAN_REEF_BOTTOM_SPECIES){const {group}=createOceanBenthicLifeAsset(s),second=createOceanBenthicLifeAsset(s),e=OCEAN_BENTHIC_LIFE_ENVELOPES[s.id];
  try{let vertices=0;group.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;assert.ok(o.geometry.index.count>0);assert.ok([...o.geometry.attributes.position.array,...o.geometry.attributes.normal.array].every(Number.isFinite));}});assert.ok(vertices>500);const neutral=new THREE.Box3().setFromObject(group);assert.ok(neutral.min.y>=-1e-8&&neutral.min.y<.003);
   if(s.id==='blue-linckia-star')assert.ok(Math.abs(neutral.max.z-neutral.min.z-1)<.015);if(s.id==='prickly-redfish')assert.ok(Math.abs(neutral.min.x+.5)<1e-6&&Math.abs(neutral.max.x-.5)<1e-6);
   for(let i=0;i<32;i++){animateOceanBenthicLifeAsset(group,i*.1,{state:'benthic-proxy-feeding',alive:true});group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group);assert.ok(box.min.y>=e.minY-1e-7&&box.max.y<=e.maxY+1e-7,s.id+' Y');for(const axis of['X','Z'])assert.ok(box.min[axis.toLowerCase()]>=e.localBounds['min'+axis]-1e-7&&box.max[axis.toLowerCase()]<=e.localBounds['max'+axis]+1e-7,s.id+' '+axis);group.traverse(o=>{if(o.isMesh){const attr=o.geometry.attributes.position;for(let k=0;k<attr.count;k++){const p=new THREE.Vector3().fromBufferAttribute(attr,k).applyMatrix4(o.matrixWorld);assert.ok(Math.hypot(p.x,p.z)<=e.horizontalRadius+1e-7);}}});}
   const frozen=group.children.map(o=>o.matrix.toArray());animateOceanBenthicLifeAsset(group,999,{alive:false});group.updateMatrixWorld(true);assert.deepEqual(group.children.map(o=>o.matrix.toArray()),frozen);disposeOceanBenthicLifeAsset(group);assert.equal(second.group.userData.benthicLifeDisposed,false);
  }finally{disposeOceanBenthicLifeAsset(group);disposeOceanBenthicLifeAsset(second.group);}
 }assert.deepEqual(oceanBenthicLifeAssetStats(),before);
});
test('actual native renderer dispatches all three whole bodies with picking, independent clocks, origin changes, death removal and disposal',()=>{
 const f=reefFixture(),rows=f.region.agents.map(a=>({...clone(a),timeSec:1})),layer=new OceanAnimals(livingShallowsSpeciesCatalog),before=oceanBenthicLifeAssetStats();
 try{layer.update(rows,100,{x:192,z:192});for(const a of rows){const o=layer.getObject(a.id);assert.ok(o.userData.benthicLifeParts.body);assert.equal(o.userData.speciesId,a.speciesId);assert.equal(o.scale.x,a.sizeM);assert.ok(layer.pickableObjects.some(m=>m.userData.agentId===a.id));assert.deepEqual(o.position.toArray(),[a.position.x,a.position.y,a.position.z]);}
  const a=rows.find(a=>a.speciesId==='giant-triton'),o=layer.getObject(a.id);a.state='benthic-proxy-feeding';layer.update(rows,100);const angle=o.userData.benthicLifeParts.appendages.rotation.y;layer.update(rows,999);assert.equal(o.userData.benthicLifeParts.appendages.rotation.y,angle);a.alive=false;layer.update(rows,1000);assert.equal(layer.getObject(a.id),null);
 }finally{layer.dispose();}assert.deepEqual(oceanBenthicLifeAssetStats(),before);
});
test('latest reef-bottom URL production and reset include the previous coastal, sand, crustacean and meadow layers with independent animal history',async()=>{
 assert.equal(readOceanWorldVariant('?world=reef-bottom-life'),'reef-bottom-life');const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,generator,options){this.options=options;}}const seed=livingShallowsSeed('56'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),options=variant=>new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator}},Capture,seed).options;
 const fresh=options('reef-bottom-life');for(const key of['reefBottomLife','coastalSchools','sandBottomLife','smallBottomLife','meadowWaterLife','meadowFoodWeb','reefForaging'])assert.equal(fresh[key],true,key);assert.equal(options(null).reefBottomLife,true);for(const variant of['coastal-schools','sand-bottom-life','meadow-water-life','small-bottom-life'])assert.equal(options(variant).reefBottomLife,false);
 const store={available:true,async load(){return null;},async save(){},async saveMany(){},async clear(){}};const model=new OceanEcology(seed,generator,{...fresh,store}),old=new OceanEcology(seed,generator,{...options('coastal-schools'),store});try{assert.equal(model._randomWorld,old._randomWorld);assert.ok(model._world.includes('copy:reef-bottom-life:'));assert.equal(model.reefBottomLifeEnabled,true);model.reset();await model._pending;assert.equal(model.reefBottomLifeEnabled,true);}finally{await model.dispose();await old.dispose();}
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("url.searchParams.set('world','whole-seabed')"));assert.ok(app.includes('agent.lastReefBottomIntake'));
});
test('actual benthic observation method accepts live v2/v3/v4 bodies without replacing populations and rejects empty niches',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('  async enterOceanBenthicLife(){'),end=source.indexOf('  async enterOceanShoalLife(){',start);
 const enter=new Function(source.slice(start,end).trim().replace('async enterOceanBenthicLife()', 'return async function()'))();
 for(const f of [reefFixture()]){
  const position=new THREE.Vector3(224,0,224),before=clone(f.region);let view,updates=0;
  const world={isLivingShallows:true,disposed:false,oceanEcologyResetting:false,sim:{seed:1},controlStartCount:0,_shallowSceneEntryToken:1,keys:new Set(),controls:{target:new THREE.Vector3()},surfaceY:8,
   oceanChunks:{generator:{...f.generator,routeStops:[{id:'benthic-community'}]},update(){updates++;}},oceanWorldPosition:()=>position.clone(),enterLivingShallows:()=>true,habitatY:()=>-3,
   oceanEcology:{agents:f.region.agents,async update(){return true;},snapshot(){return{regions:[f.region]};}},restoreOceanObservation(v){view=v;return true;}};
  assert.equal(await enter.call(world),true);assert.equal(updates,1);assert.ok(Object.values(view.position).every(Number.isFinite));assert.ok(f.region.agents.some(a=>a.position.x===view.target.x&&a.position.z===view.target.z));assert.deepEqual(f.region,before);
  world.oceanEcology.agents=[];assert.equal(await enter.call(world),false);assert.deepEqual(f.region,before);
 }
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
 const a=app.indexOf('function SandBottomObservation'),b=app.indexOf('function OpenWaterObservation',a),compiled=transformSync(app.slice(a,b),{loader:'jsx'}).code;
 const SandObservation=new Function('React',compiled+';return SandBottomObservation;')({createElement:(type,props,...children)=>({type,props,children})});
 for(const version of[3,4])assert.ok(SandObservation({agent:{benthicLifeIndividualVersion:version,speciesId:'sandfish-sea-cucumber',lastSandIntake:null}}));
 assert.equal(SandObservation({agent:{benthicLifeIndividualVersion:2,speciesId:'sandfish-sea-cucumber'}}),null);assert.equal(SandObservation({agent:{benthicLifeIndividualVersion:4,speciesId:'giant-triton'}}),null);
 assert.ok(app.includes('<SandBottomObservation agent={agent}/>'));assert.ok(app.includes('此个体尚无成功摄食记录'));
});
