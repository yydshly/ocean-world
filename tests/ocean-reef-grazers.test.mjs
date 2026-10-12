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
import { recordLivingFoodExchange, initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance, tickLivingNetwork } from '../src/livingEcologyNetwork.js';

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
const balanced = r => { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); };
function step(f, { lightAtDepth = .8, network = false, extra = false } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  if (network) tickLivingNetwork(f.region, { lightAtDepth, foodSupply: 0, currentMps: 0 }, .1);
  if (extra) tickReefGuildPool(f.region, .1, { extraConsumers: reefResidentConsumerCount(f.region) });
  for (const a of f.region.agents.filter(isReefResidentAgent)) if (a.alive)
    assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, { ...options(f), environment: { lightAtDepth } }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
}





import { OCEAN_REEF_GRAZERS_SPECIES, OCEAN_REEF_GRAZERS_IDS } from '../src/oceanReefGrazersSpecies.js';
const inventory=()=>Array.from({length:12},(_,i)=>{const f=fixture({seed:'grazer-reef'}),sx=i%6*64,sz=Math.floor(i/6)*64;
 f.x0+=sx;f.z0+=sz;f.chunk.cx+=i%6;f.chunk.cz+=Math.floor(i/6);f.chunk.id=`${f.chunk.cx},${f.chunk.cz}`;f.chunk.origin={x:f.x0,z:f.z0};
 f.chunk.bounds={minX:f.x0,maxX:f.x0+64,minZ:f.z0,maxZ:f.z0+64};Object.assign(f.region,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});Object.assign(f.chunk.ridgePlan,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});
 for(const e of f.chunk.elements){e.x+=sx;e.z+=sz;}assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:16}));assert.ok(validateReefResidentsRecord(f.region,f.generator,f));return f;});
test('fireworm stays a genus representative, diadem is a measured-test species, and mixed diets select only existing algal nutrition',()=>{
 const [w,u]=OCEAN_REEF_GRAZERS_SPECIES;assert.equal(w.taxonomicLevel,'genus');assert.equal(w.scientificName,'Eurythoe spp.');assert.equal(w.morphology.anatomicalTubeFootWalking,false);
 assert.equal(u.scientificName,'Diadema setosum');assert.equal(u.sizeMeasure,'test-diameter-excluding-spines');
 for(const s of[w,u]){assert.equal(s.foodPool,'resources.algae');assert.equal(s.naturalPopulationDensity,null);assert.equal(s.support.footContacts.length,6);assert.ok(Object.isFrozen(s.normalizedEnvelope));assert.ok(s.sourceLinks.length>=2);}
});
test('naturally selected six-contact crawlers rest in daylight and really move and consume finite owner algae in low light',()=>{
 const fs=inventory(),added=fs.flatMap(f=>f.region.agents.filter(a=>OCEAN_REEF_GRAZERS_IDS.includes(a.speciesId)).map(a=>({f,a})));
 assert.deepEqual([...new Set(added.map(x=>x.a.speciesId))].sort(),[...OCEAN_REEF_GRAZERS_IDS].sort());const births=new Map(added.map(x=>[x.a.id,clone(x.a)]));
 for(const f of fs)for(let i=0;i<5;i++)step(f);
 for(const {a}of added){assert.deepEqual(a.position,births.get(a.id).position);assert.equal(a.lastFeedAt,null);assert.equal(a.state,'resting');}
 for(const f of fs)for(let i=0;i<40;i++)step(f,{lightAtDepth:.01});
 for(const id of OCEAN_REEF_GRAZERS_IDS){assert.ok(added.some(({a})=>a.speciesId===id&&gap(a.position,births.get(a.id).position)>1e-6),id);assert.ok(added.some(({a})=>a.speciesId===id&&a.lastResidentIntake?.removedUnits>0),id);}
 for(const {f,a}of added){assert.ok(reefResidentPositionValid(f.region,f.generator,a,a.position,f));assert.equal(a.lastResidentIntake?.pool,'resources.algae');}
});
test('long spines, correct supports, true hard surface, selected depth and history gates reject invalid bodies and preserve dead records',()=>{
 const fs=inventory(),f=fs.find(f=>f.region.agents.some(a=>a.speciesId==='long-spined-diadem-urchin')),u=f.region.agents.find(a=>a.speciesId==='long-spined-diadem-urchin');
 assert.equal(reefResidentPositionValid(f.region,f.generator,u,{x:f.x0+2,y:.004,z:f.z0+2},f),false);
 for(const mutate of[a=>a.reefResidentIndividualVersion=15,a=>a.reefResidentFoodPool='resources.detritus',a=>a.position.y+=.1,a=>a.velocity.x=.5]){const r=clone(f.region);mutate(r.agents.find(a=>a.id===u.id));assert.equal(validateReefResidentsRecord(r,f.generator,f),false);}
 const blocked={...f,surface:(x,z)=>Math.hypot(x-u.position.x,z-u.position.z)>.12?5:f.surface(x,z)};
 assert.equal(reefResidentPositionValid(f.region,f.generator,u,u.position,blocked),false,'whole long-spine body clearance');
 u.energy=0;step(f,{lightAtDepth:.01});assert.equal(u.alive,false);const dead=clone(u);step(f,{lightAtDepth:.01});assert.deepEqual(u,dead);
 const old=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:16}),false);assert.deepEqual(f.region,old);
});
test('recipe16 keeps exact cold future and finite nutrition; original occupancy and zero algae never create replacement food or extra capacity',()=>{
 const f=inventory()[0],cold={...f,region:clone(f.region)};for(let i=0;i<8;i++){step(f,{lightAtDepth:.01,network:true,extra:true});step(cold,{lightAtDepth:.01,network:true,extra:true});}assert.deepEqual(f.region,cold.region);
 const full=fixture({count:19,turtles:1});assert.ok(initializeReefResidents(full.region,full.generator,{...options(full),fresh:true,version:16}));assert.equal(full.region.agents.length,19);
 const fs=inventory(),g=fs.find(f=>f.region.agents.some(a=>OCEAN_REEF_GRAZERS_IDS.includes(a.speciesId)));recordLivingFoodExchange(g.region,{exported:g.region.resources.algae});g.region.ledger.exported+=g.region.resources.algae;g.region.resources.algae=0;
 for(const a of g.region.agents.filter(a=>OCEAN_REEF_GRAZERS_IDS.includes(a.speciesId)))a.nextBite=0;
 step(g,{lightAtDepth:.01});assert.equal(g.region.resources.algae,0);assert.ok(g.region.agents.filter(a=>OCEAN_REEF_GRAZERS_IDS.includes(a.speciesId)).every(a=>a.lastFeedAt===null));
});
