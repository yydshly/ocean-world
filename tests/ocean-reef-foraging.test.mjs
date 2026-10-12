import { readFileSync } from 'node:fs';
import { REEF_FORAGING_IDS, REEF_FORAGING_MODEL, reefForagingProfile, reefForageSiteValid, reefForageReady } from '../src/oceanReefForaging.js';
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
  reefResidentPositionValid, reefResidentForagingReady, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS, REEF_LIFE_NEW_IDS, REEF_FAUNA_NEW_IDS, REEF_ASSEMBLAGE_NEW_IDS, REEF_ASSEMBLAGE_PALETTE_IDS, REEF_ASSEMBLAGE_FOOD_SCOPE, REEF_FAUNA_FOOD_SCOPE } from '../src/oceanReefResidents.js';
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
 for(const e of f.chunk.elements){e.x+=sx;e.z+=sz;}assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:19}));assert.ok(validateReefResidentsRecord(f.region,f.generator,f));return f;}));


const cohorts=fs=>fs.flatMap(f=>f.region.reefResidents.schools.map(s=>({f,s,agents:s.memberIds.map(id=>f.region.agents.find(a=>a.id===id))})));

const selected=fs=>[...new Set(REEF_FORAGING_IDS.map(id=>fs.find(f=>f.region.agents.some(a=>a.speciesId===id))))];
const profileAgents=f=>f.region.agents.filter(a=>reefForagingProfile(a));
test('recipe19 retains actual recipe18 births and finite population while enabling eight selected surface-foraging profiles',()=>{
 const fs=inventory(),old=fixture({seed:'colour-reef'});assert.ok(initializeReefResidents(old.region,old.generator,{...options(old),fresh:true,version:18}));
 const omitId=r=>r.reefResidents.birthPlacements.map(({id,...rest})=>rest);assert.deepEqual(omitId(fs[0].region),omitId(old.region));assert.deepEqual(fs[0].region.resources,old.region.resources);
 assert.deepEqual([...new Set(fs.flatMap(profileAgents).map(a=>a.speciesId))].sort(),[...REEF_FORAGING_IDS].sort());
 for(const f of fs){assert.ok(f.region.agents.length<=20);assert.ok(f.region.reefResidents.addedIds.length<=10);assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);}
 const full=fixture({count:19,turtles:1});assert.ok(initializeReefResidents(full.region,full.generator,{...options(full),fresh:true,version:19}));assert.equal(full.region.agents.length,19);assert.deepEqual(full.region.reefResidents.schools,[]);
});
test('selected real animals approach, hold on arrival and ingest only at a valid actual surface with intact body and food accounts',()=>{
 const fs=selected(inventory()),before=new Map(fs.flatMap(profileAgents).map(a=>[a.id,clone(a)])),moved=new Set(),held=new Set(),fed=new Set();
 const tick=(f,light)=>{const last=new Map(profileAgents(f).map(a=>[a.id,a.lastFeedAt]));step(f,{lightAtDepth:light});
  for(const a of profileAgents(f)){if(gap(a.position,before.get(a.id).position)>1e-6)moved.add(a.id);
   if(a.state==='reef-forage-paused'&&Math.hypot(a.velocity.x,a.velocity.y,a.velocity.z)===0)held.add(a.speciesId);
   if(a.lastFeedAt!==last.get(a.id)){assert.ok(reefResidentForagingReady(f.region,f.generator,a,f),a.speciesId);assert.equal(a.lastResidentIntake.pool,a.reefResidentFoodPool);fed.add(a.id);}}};
 for(const f of fs)for(let i=0;i<160;i++)tick(f,.8);
 const swimmers=fs.filter(f=>profileAgents(f).some(a=>a.speciesId==='sailfin-tang'));for(const f of swimmers)for(let i=0;i<260;i++)tick(f,.8);
 const nocturnal=fs.find(f=>profileAgents(f).some(a=>a.speciesId==='long-spined-diadem-urchin'));for(let i=0;i<160;i++)tick(nocturnal,.01);
 for(const id of REEF_FORAGING_IDS){const animals=fs.flatMap(profileAgents).filter(a=>a.speciesId===id);assert.ok(animals.some(a=>moved.has(a.id)),`movement ${id}`);assert.ok(animals.some(a=>fed.has(a.id)),`intake ${id}`);assert.ok(held.has(id),`pause ${id}`);}
 for(const f of fs)balanced(f.region);
});
test('grazers and sand feeders reject incompatible substrate, covered surfaces, slopes, false arrivals and suspended feeding',()=>{
 const soft={reefResidentIndividualVersion:19,speciesId:'humble-sea-biscuit',position:{x:0,y:.004,z:0},target:{x:0,y:.004,z:0}},hard={...soft,speciesId:'green-turban-snail'};
 const sand={ground:()=>({height:0,normal:{x:0,y:1,z:0}}),bed:()=>0,surface:()=>0,sample:()=>({substrate:'sand'})};
 const rock={...sand,ground:()=>({height:1,normal:{x:0,y:1,z:0}}),surface:()=>1};
 assert.ok(reefForageSiteValid(soft,soft.position,sand));assert.equal(reefForageSiteValid(soft,soft.position,rock),false);
 assert.ok(reefForageSiteValid(hard,hard.position,rock));assert.equal(reefForageSiteValid(hard,hard.position,sand),false);
 assert.equal(reefForageSiteValid(hard,hard.position,{...rock,surface:()=>1.2}),false);assert.equal(reefForageSiteValid(hard,hard.position,{...rock,ground:()=>({height:1,normal:{x:0,y:.6,z:0}})}),false);
 assert.ok(reefForageReady(soft,sand));assert.equal(reefForageReady({...soft,target:{x:1,y:.004,z:0}},sand),false);
 const fish={...soft,speciesId:'sailfin-tang',position:{x:0,y:1.6,z:0},target:{x:0,y:1.6,z:0}};assert.equal(reefForageReady(fish,{...rock,bodyBottomOffset:-.1}),false);
 const fs=inventory(),f=fs.find(f=>f.region.agents.some(a=>a.speciesId==='sailfin-tang')),a=f.region.agents.find(a=>a.speciesId==='sailfin-tang');
 a.nextBite=0;a.nextDecision=0;const resources=clone(f.region.resources),last=a.lastFeedAt;f.region.ticks++;f.region.timeSec=.1;
 assert.ok(tickReefResidentAgent(f.region,f.generator,a,.1,{...options(f),environment:{lightAtDepth:.8}}));assert.equal(a.lastFeedAt,last);assert.deepEqual(f.region.resources,resources);
});
test('finite food exhaustion, deaths and complete cold future preserve persistent targets without food or animal refill',()=>{
 const fs=inventory(),f=fs.find(f=>f.region.agents.some(a=>a.speciesId==='green-turban-snail')),a=f.region.agents.find(a=>a.speciesId==='green-turban-snail');
 a.energy=0;step(f);assert.equal(a.alive,false);assert.ok(a.organicDeathRecorded);
 const cold={...f,region:clone(f.region)};for(let i=0;i<10;i++){step(f,{network:true,extra:true});step(cold,{network:true,extra:true});}assert.deepEqual(f.region,cold.region);
 recordLivingFoodExchange(f.region,{exported:f.region.resources.algae});f.region.ledger.exported+=f.region.resources.algae;f.region.resources.algae=0;
 const grazers=profileAgents(f).filter(a=>a.reefResidentFoodPool==='resources.algae'&&a.alive),last=grazers.map(a=>a.lastFeedAt);for(const a of grazers)a.nextBite=0;
 for(let i=0;i<10;i++)step(f);assert.equal(f.region.resources.algae,0);assert.deepEqual(grazers.map(a=>a.lastFeedAt),last);
 const saved=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:19}),false);assert.deepEqual(f.region,saved);
});
test('new forage states and readiness remain read-only in actual independent animal rendering',()=>{
 const f=selected(inventory())[0];for(let i=0;i<4;i++)step(f);const agents=profileAgents(f),renderer=new OceanAnimals(livingShallowsSpeciesCatalog),saved=clone(f.region);
 for(const a of agents)reefResidentForagingReady(f.region,f.generator,a,f);assert.deepEqual(f.region,saved);
 try{renderer.update(agents,999,{x:0,z:0});assert.equal(renderer.entities.size,agents.length);for(const a of agents){const o=renderer.getObject(a.id);assert.equal(o.position.y,a.position.y);assert.equal(o.scale.x,a.sizeM);}assert.deepEqual(f.region,saved);renderer.update([],999);assert.equal(renderer.entities.size,0);}finally{renderer.dispose();}
});
test('URL flows through actual scene constructor into fresh-only forage option, isolated history and reset while old previews retain old flags',async()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 const assignment=source.slice(source.indexOf('this.oceanWorldVariant = '),source.indexOf(';',source.indexOf('this.oceanWorldVariant = '))+1),seed=livingShallowsSeed('55'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 class Capture{constructor(seed,g,options){this.options=options;}}
 for(const living of[true,false])for(const variant of[null,'reef-foraging','reef-schooling','reef-color-fish','reef-grazers','reef-mobile-benthos','reef-suspension-life','reef-filter-life','depth-community','reef-slope','sand-corridor','habitat-layers']){
  const scene={isLivingShallows:living,oceanChunks:{generator}};new Function('worldVariant','HABITAT_LAYERS_WORLD_VARIANT',assignment).call(scene,variant,'habitat-layers');
  const captured=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call(scene,Capture,seed);assert.equal(captured.options.worldVariant,living?variant:null);
  const enabled=living&&(variant===null||variant==='reef-foraging');assert.equal(captured.options.reefForaging,enabled);
  const model=new OceanEcology(seed,generator,captured.options);assert.equal(model.reefForagingEnabled,enabled);const world=model._world,random=model._randomWorld;await model.reset(seed);assert.equal(model.reefForagingEnabled,enabled);assert.equal(model._world,world);assert.equal(model._randomWorld,random);await model.dispose();
 }
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes('最新海域')&&app.includes("url.searchParams.set('world','whole-seabed')")&&app.includes("'reef-forage-paused':'停留探食'"));
});
