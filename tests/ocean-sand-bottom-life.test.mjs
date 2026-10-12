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
import { OCEAN_SMALL_BOTTOM_SPECIES, OCEAN_SMALL_BOTTOM_IDS } from '../src/oceanSmallBottomSpecies.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOceanBenthicLifeAsset, animateOceanBenthicLifeAsset, disposeOceanBenthicLifeAsset,
  OCEAN_BENTHIC_LIFE_ENVELOPES, oceanBenthicLifeAssetStats } from '../src/world/OceanBenthicLifeAssets.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';


import { OCEAN_SAND_BOTTOM_IDS, OCEAN_SAND_BOTTOM_SPECIES, sandBottomFoodPool } from '../src/oceanSandBottomSpecies.js';
// Specific unit fixtures exercise each addition; native tests use unmodified
// coordinate-seeded allocation and report absent classes without forcing them.
const sandOnly = salt => salt.endsWith(':present') && !OCEAN_SAND_BOTTOM_IDS.some(id => salt.includes(id)) ? 1 : .1;
function sandFixture(options = {}, count = 0, turtles = 0) {
 const f=fixture(options),region=regionFor(f.chunk,count,turtles);
 assert.equal(initializeOceanBenthicLife(region,f.generator,{...f,fresh:true,smallAnimals:true,sandAnimals:true,random:sandOnly}),true);
 return {...f,region};
}

test('three distinct sourced soft-bottom species extend only shallow regional catalog and keep old public palettes',()=>{
 assert.equal(livingShallowsSpeciesCatalog.length,106);assert.equal(OCEAN_BENTHIC_LIFE_IDS.length,4);assert.equal(OCEAN_SMALL_BOTTOM_IDS.length,2);
 const names=new Set(livingShallowsSpeciesCatalog.map(s=>s.scientificName));
 for(const s of OCEAN_SAND_BOTTOM_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);assert.ok(names.has(s.scientificName));assert.ok(s.sources.length>=2);assert.equal(s.calibratedMovementMPerS,null);assert.ok(Object.isFrozen(s));for(const list of Object.values(sceneCatalogs))assert.ok(!list.some(x=>x.id===s.id));}
 assert.notEqual(oceanBenthicLifeSpeciesById['leopard-flounder'].scientificName,livingShallowsSpeciesCatalog.find(s=>s.id==='peacock-flounder').scientificName);
});
test('fresh v3 gives real soft-bottom records under four/20 slots; saved v1/v2 and dead populations never refill',()=>{
 const f=sandFixture();assert.equal(f.region.benthicLifeVersion,3);assert.equal(f.region.agents.length,3);
 assert.ok(OCEAN_SAND_BOTTOM_IDS.every(id=>f.region.agents.some(a=>a.speciesId===id&&a.benthicLifeMode==='soft'&&a.benthicLifeIndividualVersion===3&&a.lastSandIntake===null)));
 assert.ok(validateOceanBenthicLifeRecord(f.region,f.generator,f));balanced(f.region);
 for(const version of [1,2]){const old=initialized({},0,0,version===2),before=clone(old.region);assert.equal(initializeOceanBenthicLife(old.region,old.generator,{...old,fresh:true,sandAnimals:true}),false);assert.deepEqual(old.region,before);}
 const capped=sandFixture({},17,2);assert.equal(capped.region.agents.length+capped.region.turtleAgents.length,20);balanced(capped.region);
 const empty=sandFixture({floorY:-35});assert.equal(empty.region.agents.length,0);assert.equal(empty.region.benthicLifeVersion,3);assert.ok(validateOceanBenthicLifeRecord(empty.region,empty.generator,empty));
 const dead=f.region.agents[0];dead.alive=false;recordLivingDeath(f.region,dead);const saved=clone(f.region);assert.equal(initializeOceanBenthicLife(f.region,f.generator,{...f,fresh:true,sandAnimals:true}),false);assert.deepEqual(f.region,saved);
});
test('new whole-body supports reject rock-only and crown obstructions and validators reject wrong versions/pose/receipts',()=>{
 const f=sandFixture({rocks:false,grass:false}),a=f.region.agents[0],e=OCEAN_BENTHIC_LIFE_ENVELOPES[a.speciesId];
 const radius=e.horizontalRadius*a.sizeM,x=a.home.x+Math.cos(a.heading)*radius,z=a.home.z+Math.sin(a.heading)*radius;
 const blocked=(px,pz,crown=false)=>f.surface(px,pz)+(crown&&Math.hypot(px-x,pz-z)<.001?.20:0);
 assert.equal(validateOceanBenthicLifeRecord(f.region,f.generator,{...f,surface:blocked}),false);
 const hard={...f.generator,sample:(x,z)=>({...f.generator.sample(x,z),substrate:'rock'})};assert.equal(createOceanBenthicLifePlan(hard,regionFor(f.chunk),{...f,availableSlots:4,sandAnimals:true,random:sandOnly}).placements.length,0);
 for(const alter of [r=>r.agents[0].pitch=.2,r=>r.agents[0].position.y+=.1,r=>r.agents[0].lastSandIntake={pool:'sand'},r=>{r.benthicLifeVersion=2;r.benthicLife.version=2;}]){const r=clone(f.region);alter(r);assert.equal(validateOceanBenthicLifeRecord(r,f.generator,f),false);}
});
test('all three really move and debit their own food pool; depletion, deaths, pause and receipt tampering remain honest',()=>{
 const f=sandFixture({rocks:false,grass:false}),r=f.region,starts=new Map(r.agents.map(a=>[a.id,clone(a.position)])),input=r.basicNetwork.ledger.externalInput;
 for(let i=0;i<120;i++){r.timeSec+=.1;r.ticks++;for(const a of r.agents)tickOceanBenthicLifeAgent(r,f.generator,a,.1,{...f,environment:{lightAtDepth:1}});}
 for(const a of r.agents){assert.ok(Math.hypot(a.position.x-starts.get(a.id).x,a.position.z-starts.get(a.id).z)>.001);assert.ok(a.lastFeedAt!==null);assert.equal(a.lastSandIntake.pool,sandBottomFoodPool(a.speciesId));assert.ok(a.lastSandIntake.removedUnits>0);}
 assert.equal(r.basicNetwork.ledger.externalInput,input);assert.ok(r.resources.detritus<.3&&r.reefGuild.preyOrganicUnits<.08);assert.ok(validateOceanBenthicLifeRecord(r,f.generator,f));balanced(r);
 const corrupted=clone(r);corrupted.agents[0].lastSandIntake.removedUnits+=.01;assert.equal(validateOceanBenthicLifeRecord(corrupted,f.generator,f),false);
 const dead=r.agents[0];dead.alive=false;recordLivingDeath(r,dead);const before=clone(dead);tickOceanBenthicLifeAgent(r,f.generator,dead,.1,f);assert.deepEqual(dead,before);balanced(r);
 const paused=clone(r);for(const a of r.agents)tickOceanBenthicLifeAgent(r,f.generator,a,0,f);assert.deepEqual(r,paused);
 const no=sandFixture({rocks:false,grass:false}),n=no.region;
 // A separate zero-food fixture establishes its own initial network boundary.
 n.resources.detritus=0;n.reefGuild.preyOrganicUnits=0;n.basicNetwork.ledger.initial-=.38;n.ledger.initial-=.3;
 for(let i=0;i<10;i++){n.timeSec+=.1;n.ticks++;for(const a of n.agents)tickOceanBenthicLifeAgent(n,no.generator,a,.1,no);}
 assert.ok(n.agents.every(a=>a.lastFeedAt===null&&a.lastSandIntake===null));assert.equal(n.benthicLife.counters.consumedUnits,0);balanced(n);
});
test('complete models and animated appendages stay within declared support envelopes and release shared resources',t=>{
 const before=oceanBenthicLifeAssetStats();
 for(const s of OCEAN_SAND_BOTTOM_SPECIES){const {group}=createOceanBenthicLifeAsset(s),second=createOceanBenthicLifeAsset(s),e=OCEAN_BENTHIC_LIFE_ENVELOPES[s.id];
  t.after(()=>{disposeOceanBenthicLifeAsset(group);disposeOceanBenthicLifeAsset(second.group);});
  let vertices=0;group.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;assert.ok(o.geometry.index.count>0);assert.ok([...o.geometry.attributes.position.array,...o.geometry.attributes.normal.array].every(Number.isFinite));}});assert.ok(vertices>100);
  const neutral=new THREE.Box3().setFromObject(group);assert.ok(neutral.min.y>=-1e-8&&neutral.min.y<.003);
  if(s.id!=='comb-sand-star')assert.ok(Math.abs(neutral.min.x+.5)<1e-6&&Math.abs(neutral.max.x-.5)<1e-6);
  else assert.ok(Math.abs(neutral.max.z-neutral.min.z-1)<1e-6);
  for(let i=0;i<32;i++){animateOceanBenthicLifeAsset(group,i*.1,{state:'benthic-proxy-feeding',velocity:{x:.01,z:0},alive:true});group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group);
   assert.ok(box.min.y>=e.minY-1e-7&&box.max.y<=e.maxY+1e-7,s.id+' vertical');for(const axis of ['X','Z'])assert.ok(box.min[axis.toLowerCase()]>=e.localBounds['min'+axis]-1e-7&&box.max[axis.toLowerCase()]<=e.localBounds['max'+axis]+1e-7,s.id+' '+axis);
   group.traverse(o=>{if(o.isMesh){const attr=o.geometry.attributes.position;for(let k=0;k<attr.count;k++){const p=new THREE.Vector3().fromBufferAttribute(attr,k).applyMatrix4(o.matrixWorld);assert.ok(Math.hypot(p.x,p.z)<=e.horizontalRadius+1e-7);}}});
  }
  const frozen=group.children.map(o=>o.matrix.toArray());animateOceanBenthicLifeAsset(group,999,{alive:false});group.updateMatrixWorld(true);assert.deepEqual(group.children.map(o=>o.matrix.toArray()),frozen);
  disposeOceanBenthicLifeAsset(group);assert.equal(second.group.userData.benthicLifeDisposed,false);disposeOceanBenthicLifeAsset(second.group);
 }
 assert.deepEqual(oceanBenthicLifeAssetStats(),before);
});
test('native OceanAnimals dispatches all new bodies, observes model clocks, floating origins, death removal and disposal',()=>{
 const f=sandFixture({rocks:false,grass:false}),rows=f.region.agents.map(a=>({...clone(a),timeSec:1})),layer=new OceanAnimals(livingShallowsSpeciesCatalog),before=oceanBenthicLifeAssetStats();
 try{layer.update(rows,100,{x:192,z:192});for(const a of rows){const o=layer.getObject(a.id);assert.ok(o.userData.benthicLifeParts.body);assert.equal(o.userData.speciesId,a.speciesId);assert.equal(o.userData.agentId,a.id);assert.equal(o.scale.x,a.sizeM);assert.deepEqual(o.position.toArray(),[a.position.x,a.position.y,a.position.z]);assert.ok(layer.pickableObjects.some(m=>m.userData.agentId===a.id));}
  const a=rows.find(a=>a.speciesId==='leopard-flounder'),o=layer.getObject(a.id);a.velocity={x:.02,y:0,z:0};layer.update(rows,100);const angle=o.userData.benthicLifeParts.appendages.rotation.y;layer.update(rows,999);assert.equal(o.userData.benthicLifeParts.appendages.rotation.y,angle);
  a.alive=false;layer.update(rows,1000);assert.equal(layer.getObject(a.id),null);
 }finally{layer.dispose();}assert.deepEqual(oceanBenthicLifeAssetStats(),before);
});
test('new URL production constructor/reset enable sand v3 plus earlier layers; old aliases preserve their options and world keys',async()=>{
 assert.equal(readOceanWorldVariant('?world=sand-bottom-life'),'sand-bottom-life');
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,generator,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),options=variant=>new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator}},Capture,seed).options;
 for(const variant of ['small-bottom-life','meadow-water-life','reef-mobile-benthos'])assert.equal(options(variant).sandBottomLife,false);
 const fresh=options('sand-bottom-life');for(const key of ['smallBottomLife','meadowWaterLife','meadowForaging','meadowFoodWeb','sandBottomLife'])assert.equal(fresh[key],true,key);assert.equal(options(null).sandBottomLife,true);
 const store={available:true,async load(){return null;},async save(){},async saveMany(){},async clear(){}};const model=new OceanEcology(seed,generator,{...fresh,store}),old=new OceanEcology(seed,generator,{...options('meadow-water-life'),store});
 try{assert.ok(model._world.includes('copy:sand-bottom-life:'));assert.equal(model._randomWorld,old._randomWorld);assert.equal(model.sandBottomLifeEnabled,true);assert.equal(old.sandBottomLifeEnabled,false);model.reset();await model._pending;assert.equal(model.sandBottomLifeEnabled,true);}finally{await model.dispose();await old.dispose();}
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("url.searchParams.set('world','whole-seabed')"));assert.ok(source.includes('[1,2,3,4].includes(agent.benthicLifeIndividualVersion)'));
});
test('actual benthic observation method accepts live v2/v3 bodies without replacing populations and rejects empty niches',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('  async enterOceanBenthicLife(){'),end=source.indexOf('  async enterOceanShoalLife(){',start);
 const enter=new Function(source.slice(start,end).trim().replace('async enterOceanBenthicLife()', 'return async function()'))();
 for(const f of [initialized({rocks:false,grass:false}),sandFixture({rocks:false,grass:false})]){
  const position=new THREE.Vector3(224,0,224),before=clone(f.region);let view,updates=0;
  const world={isLivingShallows:true,disposed:false,oceanEcologyResetting:false,sim:{seed:1},controlStartCount:0,_shallowSceneEntryToken:1,keys:new Set(),controls:{target:new THREE.Vector3()},surfaceY:8,
   oceanChunks:{generator:{...f.generator,routeStops:[{id:'benthic-community'}]},update(){updates++;}},oceanWorldPosition:()=>position.clone(),enterLivingShallows:()=>true,habitatY:()=>-3,
   oceanEcology:{agents:f.region.agents,async update(){return true;},snapshot(){return{regions:[f.region]};}},restoreOceanObservation(v){view=v;return true;}};
  assert.equal(await enter.call(world),true);assert.equal(updates,1);assert.ok(Object.values(view.position).every(Number.isFinite));assert.ok(f.region.agents.some(a=>a.position.x===view.target.x&&a.position.z===view.target.z));assert.deepEqual(f.region,before);
  world.oceanEcology.agents=[];assert.equal(await enter.call(world),false);assert.deepEqual(f.region,before);
 }
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes('<SandBottomObservation agent={agent}/>'));assert.ok(app.includes('此个体尚无成功摄食记录'));
});
