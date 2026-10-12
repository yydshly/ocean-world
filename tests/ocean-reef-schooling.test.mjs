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





import { OCEAN_REEF_COLOR_FISH_SPECIES, OCEAN_REEF_COLOR_FISH_IDS } from '../src/oceanReefColorFishSpecies.js';
const inventory=()=>['colour-reef','colour-reef-2','colour-reef-3'].flatMap(seed=>Array.from({length:12},(_,i)=>{const f=fixture({seed}),sx=i%6*64,sz=Math.floor(i/6)*64;
 f.x0+=sx;f.z0+=sz;f.chunk.cx+=i%6;f.chunk.cz+=Math.floor(i/6);f.chunk.id=`${f.chunk.cx},${f.chunk.cz}`;f.chunk.origin={x:f.x0,z:f.z0};
 f.chunk.bounds={minX:f.x0,maxX:f.x0+64,minZ:f.z0,maxZ:f.z0+64};Object.assign(f.region,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});Object.assign(f.chunk.ridgePlan,{id:f.chunk.id,cx:f.chunk.cx,cz:f.chunk.cz});
 for(const e of f.chunk.elements){e.x+=sx;e.z+=sz;}assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:18}));assert.ok(validateReefResidentsRecord(f.region,f.generator,f));return f;}));


const cohorts=fs=>fs.flatMap(f=>f.region.reefResidents.schools.map(s=>({f,s,agents:s.memberIds.map(id=>f.region.agents.find(a=>a.id===id))})));
test('fresh recipe18 naturally admits finite 3-5 member cohorts using distinct actual sites within unchanged total capacity',()=>{
 const baseSites=Array.from({length:20},(_,i)=>({siteId:`water:${i}`,hostId:'rock',layer:'water',x:i,z:0,waterHeightM:1}));
 const expanded=reefSchoolSpeciesSites(baseSites,'doubleline-fusilier',.3);
 assert.equal(expanded.length-baseSites.length,REEF_SCHOOLING_MODEL.maximumBirthAnchors*4);
 assert.deepEqual(expanded,reefSchoolSpeciesSites(baseSites,'doubleline-fusilier',.3));assert.equal(new Set(expanded.map(s=>s.siteId)).size,expanded.length);
 assert.deepEqual(reefSchoolSpeciesSites(baseSites,'emperor-angelfish',.3),baseSites);
 assert.deepEqual(reefSchoolSpeciesSites(baseSites.map(s=>({...s,layer:'bed'})),'doubleline-fusilier',.3),baseSites.map(s=>({...s,layer:'bed'})));
 const fs=inventory(),rows=cohorts(fs);assert.ok(rows.length>0);
 assert.deepEqual([...new Set(rows.map(x=>x.s.speciesId))].sort(),[...REEF_SCHOOLING_IDS].sort());
 for(const {f,s,agents}of rows){assert.ok(agents.length>=3&&agents.length<=5);assert.equal(new Set(agents.map(a=>a.id)).size,agents.length);
  assert.equal(new Set(agents.map(a=>a.reefResidentSiteId)).size,agents.length);assert.ok(f.region.agents.length<=20);assert.ok(f.region.reefResidents.addedIds.length<=10);assert.ok(validateReefSchools(f.region));}
 const full=fixture({count:19,turtles:1});assert.ok(initializeReefResidents(full.region,full.generator,{...options(full),fresh:true,version:18}));assert.equal(full.region.agents.length,19);assert.deepEqual(full.region.reefResidents.schools,[]);
});
test('one immutable pre-step neighbour snapshot gives finite order-independent targets and separation without altering agents or saved roster',()=>{
 const {f,s,agents}=cohorts(inventory())[0];f.region.timeSec=1.4;const before=clone(f.region),frames=prepareReefSchoolFrames(f.region);
 const targets=new Map(agents.map(a=>[a.id,reefSchoolTarget(f.region,a,frames)])),reversed=clone(f.region);reversed.agents.reverse();
 const other=prepareReefSchoolFrames(reversed);for(const a of agents)assert.deepEqual(reefSchoolTarget(reversed,a,other),targets.get(a.id));
 assert.deepEqual(f.region,before);for(const p of targets.values())assert.ok(['x','y','z'].every(k=>Number.isFinite(p[k])));
 const close=clone(f.region);close.agents.find(a=>a.id===agents[1].id).position={...agents[0].position,x:agents[0].position.x+.08};
 const altered=prepareReefSchoolFrames(close);assert.notDeepEqual(reefSchoolTarget(close,close.agents.find(a=>a.id===agents[0].id),altered),targets.get(agents[0].id));
});
test('real cohort members move independently, consume the correct owner stock, and remain within whole-body physics',()=>{
 const fs=inventory(),rows=cohorts(fs),before=new Map(rows.flatMap(x=>x.agents).map(a=>[a.id,clone(a)]));
 for(const f of fs)for(let i=0;i<35;i++)step(f,{lightAtDepth:.8});
 for(const id of REEF_SCHOOLING_IDS){const agents=rows.filter(x=>x.s.speciesId===id).flatMap(x=>x.agents);
  assert.ok(agents.some(a=>gap(a.position,before.get(a.id).position)>1e-5),id);assert.ok(agents.some(a=>a.lastResidentIntake?.removedUnits>0),id);}
 for(const {f,s,agents}of rows){assert.deepEqual(s.memberIds,agents.map(a=>a.id));for(const a of agents){assert.ok(reefResidentPositionValid(f.region,f.generator,a,a.position,f));assert.equal(a.lastResidentIntake?.pool,a.reefResidentFoodPool);}balanced(f.region);}
});
test('forged rosters, centers, foreign identities and two-member false schools are rejected, and shared steering cannot cross solids',()=>{
 const {f,s,agents}=cohorts(inventory())[0];
 for(const change of[r=>r.reefResidents.schools[0].memberIds.pop(),r=>r.reefResidents.schools[0].memberIds=['foreign',...s.memberIds.slice(1)],
  r=>r.reefResidents.schools[0].center.y+=.1,r=>r.agents.find(a=>a.id===s.memberIds[0]).groupId='fake',r=>r.reefResidents.schools.push(clone(s))]){
  const r=clone(f.region);change(r);assert.equal(validateReefResidentsRecord(r,f.generator,f),false);}
 const a=agents[0],position=clone(a.position),fed=a.lastFeedAt;f.region.ticks++;f.region.timeSec=.1;
 assert.equal(tickReefResidentAgent(f.region,f.generator,a,.1,{...options(f),schoolFrames:prepareReefSchoolFrames(f.region),surface:()=>a.position.y+1,environment:{lightAtDepth:.8}}),true);
 assert.deepEqual(a.position,position);assert.deepEqual(a.velocity,{x:0,y:0,z:0});assert.equal(a.state,'blocked');assert.equal(a.lastFeedAt,fed);
});
test('deaths stay in the cohort roster and finite food, cold future and occupied history never refill',()=>{
 const fs=inventory(),{f,s,agents}=cohorts(fs).find(x=>x.s.speciesId==='doubleline-fusilier'),roster=clone(s.memberIds);
 agents[0].energy=0;step(f);assert.equal(agents[0].alive,false);assert.deepEqual(s.memberIds,roster);
 const cold={...f,region:clone(f.region)};for(let i=0;i<8;i++){step(f,{network:true,extra:true});step(cold,{network:true,extra:true});}assert.deepEqual(f.region,cold.region);
 recordLivingFoodExchange(f.region,{exported:f.region.resources.plankton});f.region.ledger.exported+=f.region.resources.plankton;f.region.resources.plankton=0;
 for(const a of agents)a.nextBite=0;const fed=agents.map(a=>a.lastFeedAt);step(f);assert.deepEqual(agents.map(a=>a.lastFeedAt),fed);assert.equal(f.region.resources.plankton,0);assert.deepEqual(s.memberIds,roster);
 const saved=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:18}),false);assert.deepEqual(f.region,saved);
});
test('each real saved member is dispatched as an independent animal with its own actual position and clock',()=>{
 const {f,agents}=cohorts(inventory())[0];for(let i=0;i<4;i++)step(f);const saved=clone(agents),renderer=new OceanAnimals(livingShallowsSpeciesCatalog);
 try{renderer.update(agents,999,{x:0,z:0});assert.equal(renderer.entities.size,agents.length);
  const objects=agents.map(a=>renderer.getObject(a.id));assert.equal(new Set(objects).size,agents.length);
  for(let i=0;i<agents.length;i++){assert.equal(objects[i].userData.speciesId,agents[i].speciesId);assert.equal(objects[i].position.x,agents[i].position.x);assert.equal(objects[i].scale.x,agents[i].sizeM);}
  renderer.update(agents,2000,{x:0,z:0});assert.deepEqual(agents,saved);renderer.update([],2000);assert.equal(renderer.entities.size,0);
 }finally{renderer.dispose();}
});
test('production preserves old preview tiers, isolates new animal history and retains the new flag through reset',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,generator,options){this.options=options;}}
 const seed=livingShallowsSeed('55'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 for(const living of[true,false])for(const variant of[null,'reef-schooling','reef-color-fish','reef-grazers','reef-mobile-benthos','reef-suspension-life','reef-filter-life','depth-community','reef-slope','sand-corridor','habitat-layers']){
  const scene={isLivingShallows:living,oceanChunks:{generator}};
  const assignment=source.slice(source.indexOf('this.oceanWorldVariant = '),source.indexOf(';',source.indexOf('this.oceanWorldVariant = '))+1);
  new Function('worldVariant','HABITAT_LAYERS_WORLD_VARIANT',assignment).call(scene,variant,'habitat-layers');
  assert.equal(scene.oceanWorldVariant,living?variant:null);
  const captured=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call(scene,Capture,seed);
  const expected=living&&(variant===null||variant==='reef-schooling');assert.equal(captured.options.reefSchooling,expected);
  assert.equal(captured.options.worldVariant,living?variant:null);
  const model=new OceanEcology(seed,generator,{...captured.options,store:{load:async()=>null,saveMany:async()=>{},save:async()=>{}}});
  try{assert.equal(model.reefSchoolingEnabled,expected);model.reset(seed,generator);assert.equal(model.reefSchoolingEnabled,expected);if(living&&variant)assert.ok(model._world.startsWith(`ecology-v1-copy:${variant}:`));assert.equal(model._randomWorld,`ecology-v1:string:${seed}`);}
  finally{await model.dispose();}
 }
});
