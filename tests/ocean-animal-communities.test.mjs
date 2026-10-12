import { animalCommunityAllocation, ANIMAL_COMMUNITIES_SCOPE } from '../src/oceanAnimalCommunities.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';
import { readFileSync } from 'node:fs';
import { prepareReefSchoolFrames, reefSchoolTarget, validateReefSchools, reefSchoolSpeciesSites, REEF_SCHOOLING_MODEL, REEF_SCHOOLING_IDS } from '../src/oceanReefSchooling.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
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
  const schoolFrames=prepareReefSchoolFrames(f.region);
  for (const a of f.region.agents.filter(isReefResidentAgent)) if (a.alive)
    assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, { ...options(f), schoolFrames, environment: { lightAtDepth } }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
}


test('fresh habitat budgets preserve twenty actual records and give each complete community a bottom and water layer',()=>{
 for(const facies of ['reef','sand','meadow','slope']){
  const old=Object.freeze({facies,total:20,native:20}), allocation=animalCommunityAllocation(old);
  assert.equal(Object.entries(allocation).filter(([k])=>!['facies','total'].includes(k)).reduce((n,[,v])=>n+v,0),20);
  assert.ok(allocation.benthic>=2);assert.ok(allocation.residents>=1);assert.equal(old.native,20);assert.ok(Object.isFrozen(allocation));
 }
 assert.equal(readOceanWorldVariant('?world=animal-communities'),'animal-communities');
 assert.equal(readOceanWorldVariant('?world=reef-bottom-life'),'reef-bottom-life');
});

test('new recipe gives real habitat-compatible schooling fish their turn without displacing historical animals',()=>{
 let grouped=0;
 for(const seed of ['colour-reef','colour-reef-2','colour-reef-3']){
  const f=fixture({seed,count:14});assert.ok(initializeReefResidents(f.region,f.generator,{...f,fresh:true,version:20,capacity:20}));
  const r=f.region;assert.equal(r.reefResidentsVersion,20);assert.equal(r.reefResidents.scope,ANIMAL_COMMUNITIES_SCOPE);
  assert.ok(r.agents.length<=20);assert.equal(r.agents.filter(a=>a.id.startsWith('old:')).length,14);
  assert.ok(validateReefResidentsRecord(r,f.generator,{...f,capacity:20}));
  for(const school of r.reefResidents.schools){
   grouped++;assert.ok(school.memberIds.length>=3);assert.ok(school.memberIds.length<=5);
   assert.ok(school.memberIds.every(id=>r.agents.some(a=>a.id===id&&a.groupId===school.id)));
  }
  const saved=clone(r);assert.equal(initializeReefResidents(r,f.generator,{...f,fresh:true,version:20}),false);assert.deepEqual(r,saved);
 }
 assert.ok(grouped>=2,'actual saved cohorts across distinct owners, not decorative replicas');
});

test('new cohorts retain full-body movement, independent rendering, food balance and exact cold decisions',()=>{
 const f=fixture({seed:'colour-reef'});assert.ok(initializeReefResidents(f.region,f.generator,{...f,fresh:true,version:20}));
 const before=clone(f.region), renderer=new OceanAnimals(livingShallowsSpeciesCatalog);
 for(let i=0;i<32;i++)step(f,{network:true,extra:true});
 assert.ok(f.region.agents.some(a=>gap(a.position,before.agents.find(b=>b.id===a.id).position)>0));
 assert.ok(f.region.agents.some(a=>a.lastResidentIntake?.removedUnits>0));
 const cold=fixture({seed:'colour-reef'});cold.region=clone(f.region);
 for(let i=0;i<8;i++){step(f,{network:true,extra:true});step(cold,{network:true,extra:true});}assert.deepEqual(cold.region,f.region);
 const saved=clone(f.region), members=f.region.agents.filter(a=>a.groupId!==null);
 try{renderer.update(members,999);assert.equal(renderer.entities.size,members.length);assert.deepEqual(f.region,saved);}
 finally{renderer.dispose();}
 const corrupt=clone(f.region);corrupt.reefResidents.schools[0].memberIds.push('fake-fish');
 assert.equal(validateReefResidentsRecord(corrupt,f.generator,f),false);
});

test('latest scene opts in while explicit older worlds and reset retain their own recipe selection',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 const assignment=source.slice(source.indexOf('this.oceanWorldVariant = '),source.indexOf(';',source.indexOf('this.oceanWorldVariant = '))+1);
 const seed=livingShallowsSeed('55'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 class Capture{constructor(_seed,_generator,options){this.options=options;}}
 for(const variant of [null,'animal-communities','reef-bottom-life','reef-foraging','reef-schooling']){
  const scene={isLivingShallows:true,oceanChunks:{generator}};new Function('worldVariant','HABITAT_LAYERS_WORLD_VARIANT',assignment).call(scene,variant,'habitat-layers');
  const {options}=new Function('OceanEcology','seed','return '+source.slice(start,end)).call(scene,Capture,seed);
  const enabled=variant===null||variant==='animal-communities';assert.equal(options.animalCommunities,enabled);
  const model=new OceanEcology(seed,generator,options);assert.equal(model.animalCommunitiesEnabled,enabled);
  if(variant==='animal-communities')for(const flag of ['reefBottomLife','coastalSchools','meadowWaterLife','sandBottomLife','smallBottomLife','meadowFoodWeb','meadowForaging'])assert.equal(options[flag],true,flag);
  const key=model._world;await model.reset(seed);assert.equal(model._world,key);assert.equal(model.animalCommunitiesEnabled,enabled);await model.dispose();
 }
});
