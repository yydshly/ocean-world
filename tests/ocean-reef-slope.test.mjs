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


import { OCEAN_REEF_SLOPE_SPECIES, OCEAN_REEF_SLOPE_IDS } from '../src/oceanReefSlopeSpecies.js';

function slope(layout={}) {
  const f=fixture({seed:'57',...layout});f.generator.surfaceY=22;
  const sample=f.generator.sample;f.generator.sample=(x,z)=>({...sample(x,z),depthM:22,habitat:'reef'});
  assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:11}));
  assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);return f;
}
test('four source-described forms preserve conservative chosen depths and explicit proxy limits',()=>{
  assert.equal(OCEAN_REEF_SLOPE_SPECIES.length,4);
  for(const s of OCEAN_REEF_SLOPE_SPECIES){assert.ok(Object.isFrozen(s));assert.ok(Object.isFrozen(s.support));
    assert.ok(s.sizeRangeM[1]<=s.referenceSizeM.maximum);assert.ok(s.depthSelectionM[0]>=s.referenceDepthM.reportedRange[0]);
    assert.ok(s.depthSelectionM[1]<=s.referenceDepthM.reportedRange[1]);assert.ok(s.sourceLinks.length>0);
    assert.equal(s.feedingProxy.visiblePreyKillImplemented,false);assert.equal(s.naturalPopulationDensity,null);
    assert.equal(s.support.footContacts.length,s.bottom?6:0);}
});
test('unforced four-type slope fixture needs real bed or reef and refuses impossible whole-body depth',()=>{
  const f=slope(),present=f.region.agents.filter(a=>OCEAN_REEF_SLOPE_IDS.includes(a.speciesId));
  assert.equal(present.length,4);assert.equal(f.region.reefResidents.candidateOrder.length,40);
  for(const a of present){assert.ok(reefResidentPositionValid(f.region,f.generator,a,a.position,f));
    if(OCEAN_REEF_SLOPE_SPECIES.find(s=>s.id===a.speciesId).bottom){assert.equal(a.reefResidentHostId,null);
      assert.ok(a.reefResidentSiteId.startsWith('sand-layer:'));}
    assert.equal(reefResidentPositionValid(f.region,f.generator,a,{...a.position,y:40},f),false);}
  const before=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:11}),false);assert.deepEqual(f.region,before);
  const full=slope({count:19,turtles:1});assert.equal(full.region.reefResidents.addedIds.length,0);
  const no=fixture({reef:false});no.generator.surfaceY=50;assert.ok(initializeReefResidents(no.region,no.generator,{...options(no),fresh:true,version:11}));assert.equal(no.region.reefResidents.addedIds.length,0);
});
test('day and low-light owner clocks enforce waiting and actual local stock removal with exact continuation',()=>{
  const f=slope(),night=f.region.agents.filter(a=>['bigscale-soldierfish','lunartail-bigeye'].includes(a.speciesId));
  const before=night.map(a=>({position:clone(a.position),pool:a.reefResidentFoodPool}));let waiting=0,moving=0;
  const lizard=f.region.agents.find(a=>a.speciesId==='banded-lizardfish');
  for(let i=0;i<100;i++){step(f);if(lizard.state==='ambush-waiting')waiting++;if(gap(lizard.velocity,{x:0,y:0,z:0})>0)moving++;}
  for(const [i,a] of night.entries()){assert.deepEqual(a.position,before[i].position);assert.equal(a.lastFeedAt,null);assert.equal(a.state,'resting');}
  assert.ok(waiting>0);assert.ok(moving>0);
  for(let i=0;i<80;i++)step(f,{lightAtDepth:.01});
  for(const [i,a] of night.entries()){assert.ok(gap(a.position,before[i].position)>0);assert.ok(a.lastResidentIntake.removedUnits>0);
    assert.equal(a.lastResidentIntake.pool,before[i].pool);assert.equal(a.lastResidentIntake.ownerId,f.region.id);}
  const cold={...f,region:clone(f.region)};for(let i=0;i<16;i++){step(f,{lightAtDepth:.01});step(cold,{lightAtDepth:.01});}
  assert.deepEqual(cold.region,f.region);balanced(f.region);
});
test('forged birth contacts food depth and version reject without relaxing sand support',()=>{
  const f=slope(),a=f.region.agents.find(a=>a.speciesId==='banded-lizardfish');
  for(const mutate of[r=>r.agents.find(x=>x.id===a.id).position.y-=.2,
    r=>r.agents.find(x=>x.id===a.id).reefResidentHostId='fabricated-rock',
    r=>r.agents.find(x=>x.id===a.id).reefResidentFoodPool='resources.algae',
    r=>r.agents.find(x=>x.id===a.id).reefResidentIndividualVersion=10]) {
    const r=clone(f.region);mutate(r);assert.equal(validateReefResidentsRecord(r,f.generator,f),false);
  }
  const rockSample=f.generator.sample;f.generator.sample=(x,z)=>({...rockSample(x,z),substrate:'rock'});
  assert.equal(reefResidentPositionValid(f.region,f.generator,a,a.position,f),false);
});
