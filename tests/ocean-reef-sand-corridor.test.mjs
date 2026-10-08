import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS, REEF_LIFE_NEW_IDS, REEF_FAUNA_NEW_IDS, REEF_ASSEMBLAGE_NEW_IDS, REEF_ASSEMBLAGE_PALETTE_IDS, REEF_ASSEMBLAGE_FOOD_SCOPE, REEF_FAUNA_FOOD_SCOPE } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
import { oceanReefFaunaSpeciesById } from '../src/oceanReefFaunaSpecies.js';
import { oceanReefAssemblageSpeciesById } from '../src/oceanReefAssemblageSpecies.js';
import { initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance, tickLivingNetwork } from '../src/livingEcologyNetwork.js';

const clone = v => structuredClone(v), gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture({ seed = 'residents-1', count = 0, turtles = 0, prey = .05, reef = true } = {}) {
  const cx = 204, cz = 4, x0 = cx * 64, z0 = cz * 64;
  const chunk = { id: `${cx},${cz}`, cx, cz, origin: { x: x0, z: z0 }, size: 64,
    bounds: { minX: x0, maxX: x0 + 64, minZ: z0, maxZ: z0 + 64 }, elements: [] };
  if (reef) chunk.elements.push({ id: 'resident-rock', kind: 'rock', profile: 'terrace', x: x0 + 32, y: 0, z: z0 + 32,
    scale: { x: 18, y: 1, z: 16 }, rotation: .2 });
  chunk.ridgePlan = { version: 8, theme: 'reef-valley-region', id: chunk.id, cx, cz, seed,
    group: { id: 'reef-valley-region:204,4', cx, cz, seed,
      ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${cx + dx},${cz + dz}`)),
      routePath: [{ x: x0 + 2, y: 2, z: z0 + 26 }, { x: x0 + 62, y: 2, z: z0 + 26 }] } };
  const bed = () => 0, surface = (x, z) => chunk.elements.reduce((h, e) => e.kind === 'rock' ? Math.max(h, oceanRockHeight(e, x, z) ?? -Infinity) : h, 0);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY: 0, depthM: 8, substrate: surface(x, z) > .06 ? 'rock' : 'sand' }) };
  const region = { id: chunk.id, cx, cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    resources: { algae: .4, plankton: .5, detritus: .3 }, ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 },
    counters: { feeding: 0, deaths: 0 }, reefGuildVersion: 1, reefGuild: { preyOrganicUnits: prey,
      counters: { proxyFeedings: 0, proxyConsumedUnits: 0, filterFeedings: 0, filterConsumedUnits: 0, preySupportedUnits: 0 } } };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: region.id, speciesId: 'green-chromis', alive: i % 2 === 0,
    energy: .5, sizeM: .075, position: { x: x0 + 60, y: 2, z: z0 + 60 }, timeSec: 0 });
  initializeLivingNetwork(region, chunk);
  for (let i = 0; i < turtles; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  return { generator, chunk, region, surface, bed, x0, z0 };
}
const options = f => ({ surface: f.surface, bed: f.bed });
function initialized(layout = {}) {
  const f = fixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f));
  return f;
}
const balanced = r => { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); };
function step(f, { lightAtDepth = .8, network = false, extra = false } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  if (network) tickLivingNetwork(f.region, { lightAtDepth, foodSupply: 0, currentMps: 0 }, .1);
  if (extra) tickReefGuildPool(f.region, .1, { extraConsumers: reefResidentConsumerCount(f.region) });
  for (const a of f.region.agents.filter(isReefResidentAgent)) if (a.alive)
    assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, { ...options(f), environment: { lightAtDepth } }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
}

function diversityFixture({ ownerIndex = 0, coral = true, ...layout } = {}) {
  const f = fixture(layout), dx = ownerIndex % 6, dz = Math.floor(ownerIndex / 6), sx = dx * 64, sz = dz * 64;
  for (const e of f.chunk.elements) { e.x += sx; e.z += sz; }
  for (const a of f.region.agents) { a.position.x += sx; a.position.z += sz; }
  f.x0 += sx; f.z0 += sz; f.chunk.cx += dx; f.chunk.cz += dz;
  f.chunk.id = `${f.chunk.cx},${f.chunk.cz}`; f.chunk.origin = { x: f.x0, z: f.z0 };
  f.chunk.bounds = { minX: f.x0, maxX: f.x0 + 64, minZ: f.z0, maxZ: f.z0 + 64 };
  Object.assign(f.region, { id: f.chunk.id, cx: f.chunk.cx, cz: f.chunk.cz });
  Object.assign(f.chunk.ridgePlan, { id: f.chunk.id, cx: f.chunk.cx, cz: f.chunk.cz });
  if (coral && f.chunk.elements.length) for (let i = 0; i < 8; i++) {
    const h = i * Math.PI / 4, x = f.x0 + 32 + Math.cos(h) * 5.5, z = f.z0 + 32 + Math.sin(h) * 5.5;
    f.chunk.elements.push({ id: `actual-coral:${i}`, kind: 'coral', x, y: f.surface(x, z), z, scale: { x: .2, y: .4, z: .2 } });
  }
  const rockSurface = f.surface;
  f.surface = (x, z, crown = false) => f.chunk.elements.reduce((height, e) => crown && e.kind === 'coral' &&
    Math.hypot(x - e.x, z - e.z) < Math.max(e.scale.x, e.scale.z) * .55 ? Math.max(height, e.y + e.scale.y) : height, rockSurface(x, z));
  // This is a new test fixture's initial boundary, initialized from its actual
  // coral descriptors before either resident birth recipe runs.
  delete f.region.basicNetwork; initializeLivingNetwork(f.region, f.chunk);
  return f;
}
function diverse(layout = {}) {
  const f = diversityFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 2 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f), f.region.id); balanced(f.region);
  return f;
}


import { createReefSandCorridorSites, reefSandCorridorSpeciesSites, isReefSandCorridorAnchor, REEF_SAND_CORRIDOR_IDS } from '../src/oceanReefSandCorridor.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
function sandFixture(layout={}) {
  const f=diversityFixture({seed:'55',...layout});f.generator.surfaceY=13;
  const sample=f.generator.sample;f.generator.sample=(x,z)=>({...sample(x,z),depthM:13});
  // Open bed is deliberately physically far from the existing attachment rock.
  f.chunk.ridgePlan.group.routePath=[{x:f.x0+4,y:2,z:f.z0+7},{x:f.x0+60,y:2,z:f.z0+7}];
  return f;
}
function sand(layout={}) {
  const f=sandFixture(layout);assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:10}));
  assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);return f;
}
test('real sand sites are deterministic owner-local bounded and require no attachment rock',()=>{
  const f=sandFixture({reef:false,coral:false}),before=clone({chunk:f.chunk,region:f.region});
  const sites=createReefSandCorridorSites(f.region,f.chunk,f.chunk.ridgePlan.group,f.generator);
  assert.ok(sites.length>0&&sites.length<=32);assert.ok(sites.every(p=>p.hostId===null));
  assert.ok(sites.some(p=>p.layer==='bed')&&sites.some(p=>p.layer==='water'));
  assert.deepEqual(sites,createReefSandCorridorSites(f.region,f.chunk,f.chunk.ridgePlan.group,f.generator));
  assert.deepEqual({chunk:f.chunk,region:f.region},before);
  assert.deepEqual(createReefSandCorridorSites(f.region,{...f.chunk,id:'foreign'},f.chunk.ridgePlan.group,f.generator),[]);
  const rock={...f.generator,sample:()=>({substrate:'rock'})};assert.deepEqual(createReefSandCorridorSites(f.region,f.chunk,f.chunk.ridgePlan.group,rock),[]);
});
test('finite candidates cover the entire owner corridor and eligible species use genuine free-bed references',()=>{
  const f=sandFixture(),sites=createReefSandCorridorSites(f.region,f.chunk,f.chunk.ridgePlan.group,f.generator);
  const high=Math.max(...sites.map(p=>p.x)),low=Math.min(...sites.map(p=>p.x));assert.ok(high-low>=40);
  assert.equal(reefSandCorridorSpeciesSites(sites,'collector-urchin',()=>0).length,0);
  const own=reefSandCorridorSpeciesSites(sites,'peacock-flounder',()=>0,[{alive:true,position:{x:low,y:0,z:f.z0+7}}]);
  assert.ok(own[0].x>=high-1e-8,'existing real occupied positions drive finite dispersal');
  const r=sand({reef:false,coral:false}).region,free=r.agents.filter(a=>a.reefResidentHostId===null);
  assert.ok(free.length>0);assert.ok(free.every(a=>REEF_SAND_CORRIDOR_IDS.includes(a.speciesId)&&isReefSandCorridorAnchor(r,a)));
  assert.equal(r.reefResidents.habitatEvidence.version,3);assert.ok(r.reefResidents.habitatEvidence.sandBedSites>0);
});
test('sand animals preserve whole contact support food and bounded living movement on a day/night clock',()=>{
  const f=sand({reef:false,coral:false}),before=new Map(f.region.agents.map(a=>[a.id,clone(a.position)]));
  for(let i=0;i<64;i++)step(f,{lightAtDepth:i<32?.8:.01});
  assert.ok(f.region.agents.some(a=>gap(a.position,before.get(a.id))>1e-8));assert.ok(f.region.agents.some(a=>a.lastResidentIntake));
  const saved=clone(f.region);for(const a of f.region.agents)assert.equal(tickReefResidentAgent(f.region,f.generator,a,0,f),false);
  assert.deepEqual(f.region,saved);assert.ok(validateReefResidentsRecord(saved,f.generator,f));
  assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:10}),false);assert.deepEqual(f.region,saved);
});
test('a free sand reference cannot bypass substrate full body capacity or record integrity',()=>{
  const f=sand({reef:false,coral:false});assert.ok(f.region.agents.length>0);
  const first=r=>r.agents[0];
  for(const mutate of[r=>{first(r).reefResidentSiteId='sand-layer:foreign:0:1:water';},r=>{first(r).reefResidentHostId='imaginary-rock';},
    r=>{first(r).position.y-=3;},r=>{r.reefResidents.habitatEvidence.sandBedSites++;},r=>{first(r).reefResidentFoodPool='invented.food';}]){
    const r=clone(f.region);mutate(r);assert.equal(validateReefResidentsRecord(r,f.generator,f),false);
  }
  const full=sand({reef:false,coral:false,count:19,turtles:1});assert.equal(full.region.reefResidents.addedIds.length,0);
  assert.equal(full.region.agents.length+full.region.turtleAgents.length,20);
  const deep=sandFixture({reef:false,coral:false});deep.generator.surfaceY=50;assert.ok(initializeReefResidents(deep.region,deep.generator,{...options(deep),fresh:true,version:10}));
  assert.equal(deep.region.reefResidents.addedIds.length,0,'chosen animal depth limits remain physical constraints');
});
test('the sand preview token is explicit and does not change the previous preview or ordinary token',()=>{
  assert.equal(readOceanWorldVariant('?world=sand-corridor'),'sand-corridor');assert.equal(readOceanWorldVariant('?world=habitat-layers'),'habitat-layers');
  assert.equal(readOceanWorldVariant(''),null);assert.equal(readOceanWorldVariant('?world=sand-corridor-extra'),null);
});

import { readFileSync } from 'node:fs';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
test('shipped sand recipe respects existing opt-ins reset and both independent preview identities',async()=>{
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('55'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const store={load:async()=>null,save:async()=>{},saveMany:async()=>{},clear:async()=>{}};
  for(const living of[true,false])for(const variant of[null,'habitat-layers','sand-corridor']) {
    const c=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:living,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed);
    const expected=living&&variant!=='habitat-layers';assert.equal(c.options.reefSandCorridor,expected);
    const m=new OceanEcology(seed,g,{...c.options,store});
    try {
      assert.equal(m.reefSandCorridorEnabled,expected);const world=m._world;await m.reset(seed,g);
      assert.equal(m.reefSandCorridorEnabled,expected);assert.equal(m._world,world);assert.equal(m._active.size,0);
      if(variant)assert.ok(m._world.startsWith(`ecology-v1-copy:${variant}:`));
      assert.equal(m._randomWorld,`ecology-v1:string:${seed}`);
    } finally {await m.dispose();}
  }
  const no=new OceanEcology(seed,g,{store,reefSandCorridor:true});try{assert.equal(no.reefSandCorridorEnabled,false);}finally{await no.dispose();}
});
