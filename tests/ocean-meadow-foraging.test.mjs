import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {initializeOceanMeadowLife,tickOceanMeadowLife,validateOceanMeadowLifeRecord,oceanMeadowLifePositionValid,oceanMeadowLifeBalance,oceanMeadowLifeSnapshot,oceanMeadowForagingReady} from '../src/oceanMeadowLife.js';
import {MEADOW_FORAGING_IDS,meadowForagingCandidates} from '../src/oceanMeadowForaging.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';
import {initializeLivingNetwork,tickLivingNetwork,livingNetworkBalance,validateLivingNetworkRecord} from '../src/livingEcologyNetwork.js';
import {OceanAnimals} from '../src/world/OceanAnimals.js';
import {livingShallowsSpeciesCatalog} from '../src/sceneCatalog.js';
import {OceanEcology} from '../src/oceanEcology.js';
import {createLivingShallowsGenerator} from '../src/livingShallowsGeneration.js';
import {createLivingRidgeGenerator} from '../src/livingRidgeGeology.js';
import {livingShallowsSeed} from '../src/livingShallows.js';
import {readOceanWorldVariant} from '../src/oceanWorldVariant.js';
const clone = value => structuredClone(value), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function fixture({ floorY = 0, grass = true, rocks = true, seed = 'meadow-fixture-0' } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64, elements: [] };
  if (rocks) chunk.elements.push({ id: 'reef-rock', kind: 'rock', profile: 'terrace', x: 210, y: floorY, z: 211,
    scale: { x: 12, y: 2, z: 12 }, rotation: .2 });
  chunk.elements.push({ id: 'algal-descriptor', kind: 'algae', x: 215, y: floorY, z: 220, scale: { x: 1, y: .1, z: 1 }, rotation: 0 });
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6, y: floorY, z: 248,
    scale: { x: .7, y: .4, z: .7 }, rotation: .1 });
  const bed = () => floorY;
  const surface = (x, z) => chunk.elements.reduce((y, e) => e.kind === 'rock' ? Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity) : y, floorY);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand' }) };
  return { generator, chunk, surface, bed };
}
function regionFor(chunk, { count = 0, turtles = 0, prey = .05, algae = .4, plankton = .5 } = {}) {
  const r = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae, plankton, detritus: .3 },
    ledger: { initial: algae + plankton + .3, input: 0, ingested: 0, exported: 0 },
    reefGuildVersion: 1, reefGuild: { preyOrganicUnits: prey } };
  for (let i = 0; i < count; i++) r.agents.push({ id: `old:${i}`, regionId: r.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .5, sizeM: .075, position: { x: chunk.origin.x + 62, y: 2, z: chunk.origin.z + 62 }, timeSec: 0 });
  for (let i = 0; i < turtles; i++) r.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(r, chunk); return r;
}
function initialized(options = {}, population = {}) {
  const f = fixture(options), region = regionFor(f.chunk, population);
  assert.equal(initializeOceanMeadowLife(region, f.generator, { fresh: true, foraging: true, surface: f.surface, bed: f.bed }), true);
  assert.ok(validateOceanMeadowLifeRecord(region, f.generator, f)); return { ...f, region };
}
function balanced(r) { assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); assert.equal(oceanMeadowLifeBalance(r), livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r)); }
function step(f, { hour = 2, lightAtDepth = 0, network = true } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  const environment = { hour, lightAtDepth, foodSupply: 0, currentMps: 0 };
  if (network) tickLivingNetwork(f.region, environment, .1);
  assert.equal(tickOceanMeadowLife(f.region, f.generator, .1, { surface: f.surface, bed: f.bed, environmentAt: () => environment }), true);
  assert.ok(validateOceanMeadowLifeRecord(f.region, f.generator, f));
}


test('fresh addon preserves exact four-class births, original food and budget; old records cannot be upgraded or refilled',()=>{
 const f=initialized(),old=regionFor(f.chunk);
 assert.equal(initializeOceanMeadowLife(old,f.generator,{...f,fresh:true}),true);
 assert.equal(f.region.meadowLifeForagingVersion,1);assert.equal(old.meadowLifeForagingVersion,undefined);
 assert.deepEqual(f.region.meadowLife,old.meadowLife);assert.deepEqual(f.region.resources,old.resources);
 assert.deepEqual(f.region.agents.map(({meadowLifeForagingVersion,...a})=>a),old.agents);
 const saved=clone(old);assert.equal(initializeOceanMeadowLife(old,f.generator,{...f,fresh:true,foraging:true}),false);assert.deepEqual(old,saved);
 const capped=regionFor(f.chunk,{count:18,turtles:2});assert.equal(initializeOceanMeadowLife(capped,f.generator,{...f,fresh:true,foraging:true}),true);
 assert.equal(capped.agents.length,18);assert.equal(capped.meadowLife.addedIds.length,0);assert.ok(validateOceanMeadowLifeRecord(capped,f.generator,f));
 for(const mutate of [r=>delete r.meadowLifeForagingVersion,r=>r.meadowLifeForagingVersion=2,r=>delete r.agents[0].meadowLifeForagingVersion,r=>r.agents[0].meadowLifeForagingVersion=2]){const r=clone(f.region);mutate(r);assert.equal(validateOceanMeadowLifeRecord(r,f.generator,f),false);}
});

test('both actual moving classes approach, pause and debit only after whole-body arrival; fixed animals retain their real anchors',()=>{
 const f=initialized(),originals=new Map(f.region.agents.map(a=>[a.id,clone(a)])),moved=new Set(),paused=new Set(),fed=new Set();
 for(const a of f.region.agents)a.nextBite=0;
 step(f,{hour:10});
 for(const a of f.region.agents.filter(a=>MEADOW_FORAGING_IDS.includes(a.speciesId)))assert.equal(a.lastFeedAt,null,a.speciesId+' no intake en route');
 for(let i=0;i<240;i++){
  step(f,{hour:10});
  for(const a of f.region.agents.filter(a=>MEADOW_FORAGING_IDS.includes(a.speciesId))){
   if(distance(a.position,originals.get(a.id).position)>.001)moved.add(a.speciesId);
   if(a.state==='meadow-forage-paused'){paused.add(a.speciesId);assert.equal(Math.hypot(...Object.values(a.velocity)),0);}
   if(a.lastFeedAt===a.timeSec){fed.add(a.speciesId);assert.ok(oceanMeadowForagingReady(f.region,f.generator,a,f));assert.ok(a.lastMeadowIntake.foraging);}
  }
 }
 assert.deepEqual(moved,new Set(MEADOW_FORAGING_IDS));assert.deepEqual(paused,new Set(MEADOW_FORAGING_IDS));assert.deepEqual(fed,new Set(MEADOW_FORAGING_IDS));
 for(const a of f.region.agents.filter(a=>!MEADOW_FORAGING_IDS.includes(a.speciesId)))assert.deepEqual(a.position,originals.get(a.id).position);
 balanced(f.region);
});

test('native daylight controls cuttlefish rest and sea-pen extension without camera time or invented food',()=>{
 const f=initialized(),a=f.region.agents.find(a=>a.speciesId==='reef-cuttlefish'),pen=f.region.agents.find(a=>a.speciesId==='barrel-sea-pen'),start=clone(a.position);
 a.nextBite=0;for(let i=0;i<30;i++)step(f,{hour:2});
 assert.equal(a.state,'meadow-resting');assert.deepEqual(a.position,start);assert.equal(a.lastFeedAt,null);assert.ok(pen.colonyExtension>=.9&&pen.lastFeedAt!==null);
 for(let i=0;i<15;i++)step(f,{hour:10,lightAtDepth:0});assert.ok(distance(a.position,start)>.001);assert.equal(pen.colonyExtension<.9,true);
 const empty=initialized({}, {prey:0,algae:0,plankton:0});for(let i=0;i<170;i++)step(empty,{hour:10,network:false});
 assert.equal(empty.region.meadowLife.counters.consumedUnits,0);assert.equal(empty.region.reefGuild.preyOrganicUnits,0);assert.equal(empty.region.ledger.ingested,0);balanced(empty.region);
});

test('saved target, successful feed pose, deaths and future decisions survive cold restoration; corrupt or suspended feeding is rejected',()=>{
 const f=initialized();for(let i=0;i<170;i++)step(f,{hour:10});
 const cut=f.region.agents.find(a=>a.speciesId==='reef-cuttlefish');assert.ok(cut.lastMeadowIntake);
 const suspended={...cut,position:{...cut.position,y:cut.position.y+.3},target:{...cut.position,y:cut.position.y+.3}};
 assert.ok(oceanMeadowLifePositionValid(f.region,f.generator,suspended,suspended.position,f));assert.equal(oceanMeadowForagingReady(f.region,f.generator,suspended,f),false);
 for(const mutate of [a=>delete a.lastMeadowIntake.foraging,a=>a.lastMeadowIntake.foraging.target.x+=.2,a=>a.lastMeadowIntake.foraging.pitch=.2,a=>a.lastMeadowIntake.agentPosition.y+=.3]){
  const r=clone(f.region);mutate(r.agents.find(a=>a.id===cut.id));assert.equal(validateOceanMeadowLifeRecord(r,f.generator,f),false);
 }
 const snapshot=oceanMeadowLifeSnapshot(f.region);assert.equal(snapshot.meadowLifeForagingVersion,1);snapshot.meadowLife.counters.feedings=999;assert.notEqual(f.region.meadowLife.counters.feedings,999);
 cut.energy=0;step(f,{hour:10});const dead=clone(cut),cold={...f,region:clone(f.region)};
 const duplicate=clone(f.region);assert.equal(tickOceanMeadowLife(f.region,f.generator,.1,f),false);assert.deepEqual(f.region,duplicate);
 for(let i=0;i<8;i++){step(f,{hour:10});step(cold,{hour:10});}assert.deepEqual(cold.region,f.region);assert.deepEqual(cut,dead);
});

test('independent actual renderer reads approach/pause/rest poses without changing biology or using wall-clock time',t=>{
 const f=initialized();for(let i=0;i<130;i++)step(f,{hour:10});
 const animals=new OceanAnimals(livingShallowsSpeciesCatalog);t.after(()=>animals.dispose());
 const before=clone(f.region),origin={x:192,z:192};animals.update(f.region.agents,9999,origin,new THREE.Vector3(210,2,211));
 for(const a of f.region.agents){const obj=animals.getObject(a.id);assert.ok(obj,a.speciesId);const p=obj.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(p.x-(a.position.x-origin.x))<1e-8);assert.ok(Math.abs(p.z-(a.position.z-origin.z))<1e-8);}
 const matrices=()=>f.region.agents.map(a=>{const obj=animals.getObject(a.id);obj.updateMatrixWorld(true);const rows=[];obj.traverse(o=>rows.push(o.matrix.toArray()));return rows;});
 const first=matrices();animals.update(f.region.agents,999999,origin,new THREE.Vector3(210,2,211));assert.deepEqual(matrices(),first);assert.deepEqual(f.region,before);
});

test('actual URL and shipped constructor select isolated meadow history and reset; latest button preserves seed and entry',async()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),source=read('src/world/ReefWorld.js');
 const start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,g,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 for(const variant of [null,'reef-foraging','reef-mobile-benthos','meadow-foraging']){
  assert.equal(readOceanWorldVariant('?world='+variant),variant);
  const shipped=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed).options;
  assert.equal(shipped.meadowForaging,variant===null||variant==='meadow-foraging');
  const m=new OceanEcology(seed,g,{...shipped,store:{load:async()=>null,save:async()=>{},saveMany:async()=>{},clear:async()=>{}}});
  try{assert.equal(m.meadowForagingEnabled,shipped.meadowForaging);if(variant)assert.ok(m._world.includes('copy:'+variant+':'));await m.reset(seed,g);assert.equal(m.meadowForagingEnabled,shipped.meadowForaging);}finally{await m.dispose();}
 }
 const constructor=source.slice(source.indexOf('this.oceanWorldVariant ='),source.indexOf('this.inputSeed ='));assert.ok(constructor.includes("worldVariant === 'meadow-foraging'"));
 const app=read('src/OceanApp.jsx'),button=app.slice(app.indexOf("worldVariant!=='meadow-water-life'"),app.indexOf('>最新海域</button>'));
 assert.ok(button.includes("url.searchParams.set('world','meadow-water-life')"));assert.ok(button.includes('window.location.assign(url.href)'));
 const url=new URL('http://127.0.0.1:4175/ocean-world/?demo=seagrass-meadow-region&seed=56&world=reef-foraging');
 const run=button.slice(button.indexOf('const url='),button.indexOf('window.location.assign(url.href);')+'window.location.assign(url.href);'.length);
 let assigned;new Function('window',run)({location:{href:url.href,assign:value=>assigned=value}});
 assert.equal(new URL(assigned).searchParams.get('demo'),'seagrass-meadow-region');assert.equal(new URL(assigned).searchParams.get('seed'),'56');assert.equal(new URL(assigned).searchParams.get('world'),'meadow-food-web');
});
