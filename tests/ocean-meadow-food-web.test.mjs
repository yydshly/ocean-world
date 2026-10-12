import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeOceanMeadowLife,tickOceanMeadowLife,validateOceanMeadowLifeRecord,oceanMeadowLifeBalance,oceanMeadowForagingReady} from '../src/oceanMeadowLife.js';
import {meadowPreyConsumerCount} from '../src/oceanMeadowForaging.js';
import {tickReefGuildPool} from '../src/oceanReefGuild.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';
import {initializeLivingNetwork,tickLivingNetwork,livingNetworkBalance,validateLivingNetworkRecord} from '../src/livingEcologyNetwork.js';
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
  assert.equal(initializeOceanMeadowLife(region, f.generator, { fresh: true, foraging: true, foodWeb: true, surface: f.surface, bed: f.bed }), true);
  region.reefGuild.counters = { preySupportedUnits: 0 }; assert.ok(validateOceanMeadowLifeRecord(region, f.generator, f)); return { ...f, region };
}
function balanced(r) { assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); assert.equal(oceanMeadowLifeBalance(r), livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r)); }
function step(f, { hour = 2, lightAtDepth = 0, network = true } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  const environment = { hour, lightAtDepth, foodSupply: 0, currentMps: 0 };
  if (network) tickLivingNetwork(f.region, environment, .1);
  tickReefGuildPool(f.region,.1,{meadowConsumers:meadowPreyConsumerCount(f.region)});
  assert.equal(tickOceanMeadowLife(f.region, f.generator, .1, { surface: f.surface, bed: f.bed, environmentAt: () => environment }), true);
  assert.ok(validateOceanMeadowLifeRecord(f.region, f.generator, f));
}



test('new food-web phase preserves exact births and initial food while sealed v1 history keeps its original equation',()=>{
 const f=initialized({}, {prey:0}),old=regionFor(f.chunk,{prey:0});
 assert.equal(initializeOceanMeadowLife(old,f.generator,{...f,fresh:true,foraging:true}),true);
 assert.equal(f.region.meadowLifeForagingVersion,2);assert.equal(old.meadowLifeForagingVersion,1);
 assert.deepEqual(f.region.meadowLife,old.meadowLife);assert.deepEqual(f.region.resources,old.resources);assert.deepEqual(f.region.agents.map(({meadowLifeForagingVersion,...a})=>a),old.agents.map(({meadowLifeForagingVersion,...a})=>a));
 const saved=clone(old);assert.equal(initializeOceanMeadowLife(old,f.generator,{...f,fresh:true,foraging:true,foodWeb:true}),false);assert.deepEqual(old,saved);
 assert.equal(meadowPreyConsumerCount(old),0);assert.equal(meadowPreyConsumerCount(f.region),2);
 for(const value of [0,3,null]){const r=clone(f.region);r.meadowLifeForagingVersion=value;for(const a of r.agents)a.meadowLifeForagingVersion=value;assert.equal(validateOceanMeadowLifeRecord(r,f.generator,f),false);}
});

test('prey support debits actual detritus and records an internal transfer; absence, deaths, legacy owners and exhausted source cannot create food',()=>{
 const f=initialized({}, {prey:0}),r=f.region,external=r.basicNetwork.ledger.externalInput,before=clone(r);
 tickReefGuildPool(r,.1,{meadowConsumers:meadowPreyConsumerCount(r)});
 const q=2*.000025*.1;assert.equal(r.reefGuild.preyOrganicUnits,q);assert.equal(r.resources.detritus,before.resources.detritus-q);assert.equal(r.ledger.networkRemoved,before.ledger.networkRemoved+q);assert.equal(r.reefGuild.counters.preySupportedUnits,q);assert.equal(r.basicNetwork.ledger.externalInput,external);assert.equal(r.ledger.ingested,0);balanced(r);
 const old=clone(before);old.meadowLifeForagingVersion=1;for(const a of old.agents)a.meadowLifeForagingVersion=1;
 tickReefGuildPool(old,.1,{meadowConsumers:999});assert.deepEqual(old.resources,before.resources);assert.equal(old.reefGuild.preyOrganicUnits,0);
 for(const a of r.agents)if(['reef-cuttlefish','sand-edge-seahorse'].includes(a.speciesId))a.alive=false;assert.equal(meadowPreyConsumerCount(r),0);
 const exhausted=initialized({}, {prey:0}),source=exhausted.region.resources.detritus;
 exhausted.region.resources.detritus=0;exhausted.region.ledger.exported+=source;exhausted.region.basicNetwork.ledger.output+=source;exhausted.region.basicNetwork.processTotals.systemOutput+=source;
 const empty=clone(exhausted.region);tickReefGuildPool(exhausted.region,1,{meadowConsumers:2});assert.deepEqual(exhausted.region,empty);balanced(exhausted.region);
 const noConsumers=clone(before);noConsumers.agents=[];assert.equal(meadowPreyConsumerCount(noConsumers),0);
});

test('both actual predators starting with no prey obtain only accounted supported nutrition; cuttlefish intake still requires real arrival',()=>{
 const f=initialized({}, {prey:0}),initialExternal=f.region.basicNetwork.ledger.externalInput,feeders=new Set();
 for(const a of f.region.agents)a.nextBite=0;
 step(f,{hour:10,network:false});assert.equal(f.region.agents.find(a=>a.speciesId==='reef-cuttlefish').lastFeedAt,null);
 for(let i=0;i<170;i++){
  step(f,{hour:10,network:false});
  for(const a of f.region.agents.filter(a=>a.meadowLifeFoodPool==='reefGuild.preyOrganicUnits'))if(a.lastFeedAt===a.timeSec){feeders.add(a.speciesId);if(a.speciesId==='reef-cuttlefish')assert.ok(oceanMeadowForagingReady(f.region,f.generator,a,f));assert.equal(a.lastMeadowIntake.foraging?.version??a.meadowLifeForagingVersion,2);}
 }
 assert.deepEqual(feeders,new Set(['sand-edge-seahorse','reef-cuttlefish']));assert.equal(f.region.basicNetwork.ledger.externalInput,initialExternal);assert.ok(f.region.reefGuild.counters.preySupportedUnits>0);balanced(f.region);
 const cold={...f,region:clone(f.region)};for(let i=0;i<8;i++){step(f,{hour:10,network:false});step(cold,{hour:10,network:false});}assert.deepEqual(cold.region,f.region);
 const corrupt=clone(f.region);corrupt.agents.find(a=>a.speciesId==='reef-cuttlefish').lastMeadowIntake.foraging.version=1;assert.equal(validateOceanMeadowLifeRecord(corrupt,f.generator,f),false);
});

test('actual URL and constructor gate the fresh food-web phase, isolate its history, reset correctly and retain old previews',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,g,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 for(const variant of [null,'meadow-foraging','reef-foraging','reef-mobile-benthos','meadow-food-web']){
  assert.equal(readOceanWorldVariant('?world='+variant),variant);const shipped=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed).options;
  const enabled=variant===null||variant==='meadow-food-web';assert.equal(shipped.meadowFoodWeb,enabled);
  const m=new OceanEcology(seed,g,{...shipped,store:{load:async()=>null,save:async()=>{},saveMany:async()=>{},clear:async()=>{}}});
  try{assert.equal(m.meadowFoodWebEnabled,enabled);if(variant)assert.ok(m._world.includes('copy:'+variant+':'));const world=m._world;await m.reset(seed,g);assert.equal(m.meadowFoodWebEnabled,enabled);assert.equal(m._world,world);}finally{await m.dispose();}
 }
 const missing=new OceanEcology(seed,g,{meadowFoodWeb:true});try{assert.equal(missing.meadowFoodWebEnabled,false);}finally{await missing.dispose();}
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("url.searchParams.set('world','meadow-water-life')"));assert.ok(app.includes('动物性食物接入当地食物循环'));
});
