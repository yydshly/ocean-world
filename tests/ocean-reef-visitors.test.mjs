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

import { REEF_VISITORS_NEW_IDS, REEF_VISITOR_COMMUNITY_IDS, REEF_VISITORS_FOOD_SCOPE } from '../src/oceanReefResidents.js';
import { OCEAN_REEF_VISITORS_SPECIES } from '../src/oceanReefVisitorsSpecies.js';

function visitors(ownerIndex=0,layout={}){
  const f=diversityFixture({seed:'57',ownerIndex,...layout});f.generator.surfaceY=13;

  assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:8}));
  assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);return f;
}
const fixtures=Array.from({length:12},(_,i)=>visitors(i));
const saved=()=>fixtures.map(f=>({...f,region:clone(f.region)}));
test('four sourced visitor body types share the36-type habitat recipe without added capacity or food',()=>{
  assert.equal(OCEAN_REEF_VISITORS_SPECIES.length,4);assert.equal(REEF_VISITOR_COMMUNITY_IDS.length,36);
  for(const f of saved()){
    assert.equal(f.region.reefResidentsVersion,8);assert.equal(f.region.reefResidents.recipe,'reef-residents-v8');
    assert.equal(f.region.reefResidents.candidateOrder.length,36);assert.ok(f.region.agents.length<=10);
    assert.deepEqual(f.region.resources,{algae:.4,plankton:.5,detritus:.3});
    assert.ok(!Object.hasOwn(f.region.reefResidents,'reservedPaletteSlots'));
    for(const a of f.region.agents)assert.equal(a.reefResidentIndividualVersion,8);
  }
  for(const s of OCEAN_REEF_VISITORS_SPECIES){
    assert.ok(s.sources.every(x=>x.url.startsWith('https://')));assert.ok(s.feedingProxy.visiblePreyKillImplemented===false);
    assert.equal(s.foodPool,'reefGuild.preyOrganicUnits');assert.equal(s.support.footContacts.length,0);
  }
  const ray=OCEAN_REEF_VISITORS_SPECIES.find(s=>s.kind==='ray');assert.equal(ray.scientificName,'Aetobatus ocellatus');
  assert.equal(ray.sizeMeasure,'disc-width');assert.equal(ray.referenceSizeM.maximum,null);
});
test('fixed57 unit habitat records actual three selected forms and native day/night movement consumes existing inventory',()=>{
  const present=new Set(),moved=new Set(),fed=new Set(),speeds={'great-barracuda':.22,'bluefin-trevally':.20,'oriental-sweetlips':.08,'spotted-eagle-ray':.16};
  for(const f of saved()){
    const begins=new Map(f.region.agents.map(a=>[a.id,clone(a.position)]));
    for(let i=0;i<64;i++){
      const before=new Map(f.region.agents.map(a=>[a.id,clone(a.position)]));step(f,{lightAtDepth:i<32?.8:.01});
      for(const a of f.region.agents.filter(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId))) {
        present.add(a.speciesId);assert.ok(gap(a.position,before.get(a.id))<=speeds[a.speciesId]*.1+1e-10);
        if(a.speciesId==='oriental-sweetlips'&&i<32){assert.deepEqual(a.position,begins.get(a.id));assert.equal(a.lastFeedAt,null);assert.equal(a.state,'resting');}
        if(gap(a.position,begins.get(a.id))>1e-8)moved.add(a.speciesId);
        if(a.lastResidentIntake){fed.add(a.speciesId);assert.equal(a.lastResidentIntake.scope,REEF_VISITORS_FOOD_SCOPE);assert.equal(a.lastResidentIntake.pool,'reefGuild.preyOrganicUnits');}
      }
    }
    assert.ok(validateReefResidentsRecord(clone(f.region),f.generator,f));balanced(f.region);
  }
  assert.deepEqual(present,new Set(['great-barracuda','bluefin-trevally','oriental-sweetlips']));assert.deepEqual(moved,present);assert.deepEqual(fed,present);
});
test('selected fish fins and an isolated full long ray tail respect owner, real depth and obstacles',()=>{
  for(const id of REEF_VISITORS_NEW_IDS.filter(id=>id!=='spotted-eagle-ray')){const f=saved().find(f=>f.region.agents.some(a=>a.speciesId===id));assert.ok(f,id);
    const a=f.region.agents.find(a=>a.speciesId===id);
    assert.ok(reefResidentPositionValid(f.region,f.generator,a,a.position,f));
    assert.equal(reefResidentPositionValid(f.region,f.generator,a,{...a.position,y:-1},f),false);
    assert.equal(reefResidentPositionValid(f.region,f.generator,a,{...a.position,x:f.x0+.01},f),false);
    const missing={...f.generator,chunk:()=>({...f.chunk,elements:[]})};assert.equal(reefResidentPositionValid(f.region,missing,a,a.position,f),false);
  }
  const f=fixture();f.generator.surfaceY=13;
  const a={id:'isolated-ray',speciesId:'spotted-eagle-ray',sizeM:.7,reefResidentHostId:f.chunk.elements[0].id,reefResidentIndividualVersion:8,heading:0,pitch:0};
  const p={x:f.x0+32,y:2,z:f.z0+32};assert.ok(reefResidentPositionValid(f.region,f.generator,a,p,f));
  // The disc center alone clears the floor at .8 m; the complete envelope does not.
  assert.equal(reefResidentPositionValid(f.region,f.generator,a,{...p,y:.8},f),false);
  assert.equal(reefResidentPositionValid(f.region,f.generator,a,{...p,x:f.x0+.5},f),false);
});
test('saved recipes1–7, dead records, pause and empty stocks never refill or gain food',()=>{
  for(let version=1;version<=7;version++){
    const f=diversityFixture({seed:'57'});f.generator.surfaceY=13;
    assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version}));const before=clone(f.region);
    assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:8}),false);assert.deepEqual(f.region,before);
  }
  const f=saved().find(f=>f.region.agents.some(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId))),r=f.region;
  const old=clone(r);for(const a of r.agents)assert.equal(tickReefResidentAgent(r,f.generator,a,0,f),false);assert.deepEqual(r,old);
  const a=r.agents.find(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId));a.energy=0;step(f);const corpse=clone(a);step(f);assert.deepEqual(a,corpse);
  const food=r.resources.algae+r.resources.plankton+r.resources.detritus,removed=food+r.reefGuild.preyOrganicUnits+r.basicNetwork.coralOrganicUnits;
  r.resources={algae:0,plankton:0,detritus:0};r.ledger.exported+=food;r.reefGuild.preyOrganicUnits=0;r.basicNetwork.coralOrganicUnits=0;
  r.basicNetwork.ledger.output+=removed;r.basicNetwork.processTotals.systemOutput+=removed;
  const before=r.reefResidents.counters.feedings,input=r.basicNetwork.ledger.externalInput;
  for(let i=0;i<64;i++)step(f,{lightAtDepth:.01});assert.equal(r.reefResidents.counters.feedings,before);assert.equal(r.basicNetwork.ledger.externalInput,input);balanced(r);
});
test('corrupt recipe, biological identity, saved food, geometry and epoch reject restoration',()=>{
  const f=saved().find(f=>f.region.agents.some(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId)));
  const first=r=>r.agents.find(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId));
  for(const change of [r=>{r.reefResidentsVersion=7;},r=>{r.reefResidents.candidateOrder.reverse();},r=>{r.reefResidents.habitatEvidence.softCenters++;},
    r=>{first(r).reefResidentIndividualVersion=7;},r=>{first(r).reefResidentFoodPool='resources.plankton';},r=>{first(r).sizeM+=.1;},r=>{first(r).position.y-=5;}]){
    const copy=clone(f.region);change(copy);assert.equal(validateReefResidentsRecord(copy,f.generator,f),false);
  }
});

test('open reef-water habitat admits all four and gives the long-tailed ray real movement and intake',()=>{
  // Same fixed57, a separate physically defined unit habitat: low rock hosts
  // in a plant-substrate water layer. Bottom animals still have to pass their
  // own real substrate/contact gates; no candidate is forcibly admitted.
  const present=new Set(),moved=new Set(),fed=new Set();
  for(let ownerIndex=0;ownerIndex<12;ownerIndex++){
    const f=diversityFixture({ownerIndex,seed:'57',coral:false});f.generator.surfaceY=13;
    f.chunk.elements.find(e=>e.kind==='rock').scale.y=.02;
    const sample=f.generator.sample;f.generator.sample=(x,z)=>({...sample(x,z),substrate:'seagrass',habitat:'seagrass'});
    assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:8}));
    const starts=new Map(f.region.agents.map(a=>[a.id,clone(a.position)]));
    for(let i=0;i<64;i++)step(f,{lightAtDepth:i<32?.8:.01});
    for(const a of f.region.agents.filter(a=>REEF_VISITORS_NEW_IDS.includes(a.speciesId))){
      present.add(a.speciesId);if(gap(a.position,starts.get(a.id))>1e-8)moved.add(a.speciesId);
      if(a.lastResidentIntake){fed.add(a.speciesId);assert.equal(a.lastResidentIntake.pool,'reefGuild.preyOrganicUnits');}
    }
    assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);
  }
  assert.deepEqual(present,new Set(REEF_VISITORS_NEW_IDS));assert.deepEqual(moved,present);assert.deepEqual(fed,present);
});

test('entire previous v7 habitat recipe retains its32-step saved records',()=>{
  const rows=[];for(let ownerIndex=0;ownerIndex<12;ownerIndex++){
    const f=diversityFixture({ownerIndex,seed:'55'});f.generator.surfaceY=13;
    const sample=f.generator.sample;f.generator.sample=(x,z)=>({...sample(x,z),depthM:13});
    assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:7}));
    for(let i=0;i<16;i++)step(f);for(let i=0;i<16;i++)step(f,{lightAtDepth:.01});rows.push(f.region);
  }
  assert.equal(hash(rows),'5492b586d823b673a4a7b0327ccb325ecc6fb60cd59f1d6d3770f746ea434c6f');
});
