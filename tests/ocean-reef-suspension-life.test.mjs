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
const balanced = r => { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); };
function step(f, { lightAtDepth = .8, network = false, extra = false } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  if (network) tickLivingNetwork(f.region, { lightAtDepth, foodSupply: 0, currentMps: 0 }, .1);
  if (extra) tickReefGuildPool(f.region, .1, { extraConsumers: reefResidentConsumerCount(f.region) });
  for (const a of f.region.agents.filter(isReefResidentAgent)) if (a.alive)
    assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, { ...options(f), environment: { lightAtDepth } }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
}




import { OCEAN_REEF_SUSPENSION_SPECIES, OCEAN_REEF_SUSPENSION_IDS } from '../src/oceanReefSuspensionSpecies.js';
const inventory=()=>Array.from({length:12},(_,ownerIndex)=>{const f=fixture({seed:'suspension-hard-reef'});
  // Test real hard support at different owner coordinates, without a forced cast.
  const dx=ownerIndex%6,dz=Math.floor(ownerIndex/6),sx=dx*64,sz=dz*64;
  f.x0+=sx;f.z0+=sz;f.chunk.cx+=dx;f.chunk.cz+=dz;f.chunk.id=`${f.chunk.cx},${f.chunk.cz}`;
  f.chunk.origin={x:f.x0,z:f.z0};f.chunk.bounds={minX:f.x0,maxX:f.x0+64,minZ:f.z0,maxZ:f.z0+64};
  Object.assign(f.region,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});Object.assign(f.chunk.ridgePlan,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});
  for(const e of f.chunk.elements){e.x+=sx;e.z+=sz;}
  assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:14}));
  assert.ok(validateReefResidentsRecord(f.region,f.generator,f));return f;});
test('shallow feather-star group and gold-mouth ascidian keep source identity and observed-phase limits explicit',()=>{
  const [star,squirt]=OCEAN_REEF_SUSPENSION_SPECIES;assert.equal(star.taxonomicLevel,'order');assert.equal(star.adultPermanentlySessile,false);
  assert.equal(star.locomotionImplemented,false);assert.equal(squirt.scientificName,'Polycarpa aurata');
  for(const s of [star,squirt]){assert.equal(s.foodPool,'resources.plankton');assert.equal(s.support.footContacts.length,6);
    assert.equal(s.naturalPopulationDensity,null);assert.equal(s.referenceDepthM.completeNaturalRange,false);assert.ok(Object.isFrozen(s.morphology));}
});
test('naturally admitted full fans and siphon bodies stay on actual hard support and consume owner food in day and night',()=>{
  const fs=inventory(),selected=fs.flatMap(f=>f.region.agents.filter(a=>OCEAN_REEF_SUSPENSION_IDS.includes(a.speciesId)).map(a=>({f,a})));
  assert.deepEqual([...new Set(selected.map(r=>r.a.speciesId))].sort(),[...OCEAN_REEF_SUSPENSION_IDS].sort());
  const births=new Map(selected.map(({a})=>[a.id,clone(a)]));
  for(const f of fs){for(let i=0;i<40;i++)step(f);for(let i=0;i<40;i++)step(f,{lightAtDepth:.01});}
  for(const {f,a} of selected){const b=births.get(a.id);assert.deepEqual(a.position,b.position);assert.deepEqual(a.target,a.home);assert.equal(a.heading,b.heading);
    assert.equal(a.decisions,0);assert.deepEqual(a.velocity,{x:0,y:0,z:0});assert.ok(a.lastResidentIntake.removedUnits>0);assert.equal(a.lastResidentIntake.pool,'resources.plankton');
    assert.ok(reefResidentPositionValid(f.region,f.generator,a,a.position,f));
    const cold={...f,region:clone(f.region)};for(let i=0;i<3;i++){step(f);step(cold);}assert.deepEqual(f.region,cold.region);}
});
test('unsupported sand, forged motion and fabricated food fail admission; capacity and death remain durable',()=>{
  const f=inventory().find(f=>f.region.agents.some(a=>OCEAN_REEF_SUSPENSION_IDS.includes(a.speciesId))),a=f.region.agents.find(a=>OCEAN_REEF_SUSPENSION_IDS.includes(a.speciesId));
  for(const mutate of [a=>a.target.x+=.2,a=>a.position.y-=.1,a=>a.reefResidentFoodPool='reefGuild.preyOrganicUnits',a=>a.heading+=.1,a=>a.decisions=1]){
    const r=clone(f.region);mutate(r.agents.find(x=>x.id===a.id));assert.equal(validateReefResidentsRecord(r,f.generator,f),false);}
  assert.equal(reefResidentPositionValid(f.region,f.generator,a,{x:f.x0+2,y:.004,z:f.z0+2},f),false);
  a.energy=0;step(f);assert.equal(a.alive,false);const dead=clone(a);step(f);assert.deepEqual(a,dead);
  const old=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:14}),false);assert.deepEqual(f.region,old);
  const full=fixture({count:19,turtles:1});assert.ok(initializeReefResidents(full.region,full.generator,{...options(full),fresh:true,version:14}));assert.equal(full.region.agents.length,19);
});
