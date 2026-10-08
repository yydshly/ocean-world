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

import { createReefHabitatLayerSites, reefHabitatLayerSpeciesSites, REEF_HABITAT_LAYERS_MODEL } from '../src/oceanReefHabitatLayers.js';
import { REEF_VISITOR_COMMUNITY_IDS } from '../src/oceanReefResidents.js';
import { readFileSync } from 'node:fs';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';

test('explicit preview URL reaches shipped constructors while ordinary worlds keep their save identity',async()=>{
  const variant=readOceanWorldVariant('?demo=reef-valley-region&seed=55&world=habitat-layers');assert.equal(variant,'habitat-layers');
  for(const query of['','?world=other','?world=','?world=habitat-layers-extra'])assert.equal(readOceanWorldVariant(query),null);
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
  assert.ok(app.includes('const [worldVariant]=useState(()=>readOceanWorldVariant(window.location.search));'));
  const start=app.indexOf('{biomeId:biome,mobileIndividuals:'),end=app.indexOf('});',start)+1;
  const fromUi=new Function('biome','performanceCount','scan','appliedSeed','initialPaused','livingShallows','LIVING_SHALLOWS_PROFILE','worldVariant',`return (${app.slice(start,end)});`);
  for(const living of[true,false])assert.equal(fromUi('reef',null,null,'55',false,living,'living-shallows-v1',variant).worldVariant,living?variant:null);
  const seed=livingShallowsSeed('55'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),store={load:async()=>null,save:async()=>{},saveMany:async()=>{},clear:async()=>{}};
  const ordinary=new OceanEcology(seed,generator,{store}),copy=new OceanEcology(seed,generator,{store,worldVariant:variant}),unknown=new OceanEcology(seed,generator,{store,worldVariant:'other'});
  try{
    assert.equal(ordinary._world,`ecology-v1:string:${seed}`);assert.equal(unknown._world,ordinary._world);
    assert.equal(copy._world,`ecology-v1-copy:habitat-layers:string:${seed}`);assert.notEqual(copy._world,ordinary._world);
    assert.equal(copy._random({id:'204,4'},'initial-plankton'),ordinary._random({id:'204,4'},'initial-plankton'));
    assert.equal(copy.generator.seed,ordinary.generator.seed);await copy.reset(seed,generator);assert.equal(copy.worldVariant,variant);
    assert.equal(copy._world,`ecology-v1-copy:habitat-layers:string:${seed}`);
    assert.equal(copy._random({id:'204,4'},'initial-plankton'),ordinary._random({id:'204,4'},'initial-plankton'));
  }finally{await ordinary.dispose();await copy.dispose();await unknown.dispose();}
});

function layerFixture({ownerIndex=0,...layout}={}){
  const f=diversityFixture({ownerIndex,seed:'55',...layout});f.generator.surfaceY=13;
  const sample=f.generator.sample;f.generator.sample=(x,z)=>({...sample(x,z),depthM:13});return f;
}
function layered(layout={}){
  const f=layerFixture(layout);assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:9}));
  assert.ok(validateReefResidentsRecord(f.region,f.generator,f));balanced(f.region);return f;
}
test('actual-route layer centers are deterministic bounded owner-local possibilities tied to real hosts',()=>{
  const f=fixture(),before=clone({chunk:f.chunk,region:f.region});
  const sites=createReefHabitatLayerSites(f.region,f.chunk,f.chunk.ridgePlan.group);
  assert.ok(sites.length>0);assert.ok(sites.length<=REEF_HABITAT_LAYERS_MODEL.maximumAddedSitesPerOwner);
  assert.deepEqual(sites,createReefHabitatLayerSites(f.region,f.chunk,f.chunk.ridgePlan.group));
  assert.equal(new Set(sites.map(p=>p.siteId)).size,sites.length);
  for(const p of sites){const host=f.chunk.elements.find(h=>h.id===p.hostId);assert.ok(host);
    assert.ok(p.x>=f.x0+4&&p.x<=f.x0+60&&p.z>=f.z0+4&&p.z<=f.z0+60);
    assert.ok(Math.hypot(host.x-p.x,host.z-p.z)<=Math.max(host.scale.x,host.scale.z)*.6+5);
    assert.ok(p.layer==='bed'||p.layer==='water');if(p.layer==='water')assert.ok([.8,1.8].includes(p.waterHeightM));
  }
  assert.deepEqual({chunk:f.chunk,region:f.region},before);
  const long=clone(f.chunk.ridgePlan.group);long.routePath=[{x:f.x0,y:2,z:f.z0+26},{x:f.x0+100000,y:2,z:f.z0+26}];
  assert.ok(createReefHabitatLayerSites(f.region,f.chunk,long).length<=32);
});
test('missing hosts malformed routes and foreign owners produce no synthetic reef layer sites',()=>{
  const f=fixture();assert.deepEqual(createReefHabitatLayerSites(f.region,{...f.chunk,elements:[]},f.chunk.ridgePlan.group),[]);
  assert.deepEqual(createReefHabitatLayerSites(f.region,f.chunk,{routePath:[]}),[]);
  assert.deepEqual(createReefHabitatLayerSites(f.region,f.chunk,{routePath:[{x:NaN,y:2,z:0},{x:1,y:2,z:1}]}),[]);
  assert.deepEqual(createReefHabitatLayerSites(f.region,{...f.chunk,id:'other'},f.chunk.ridgePlan.group),[]);
});
test('per-species layer neighborhoods rotate only new sites and preserve original fallback identity and order',()=>{
  const f=fixture(),added=createReefHabitatLayerSites(f.region,f.chunk,f.chunk.ridgePlan.group),old=[{siteId:'old-a'},{siteId:'old-b'}],sites=[...added,...old],before=clone(sites);
  const sorted=reefHabitatLayerSpeciesSites(sites,'great-barracuda',()=>.4);
  assert.deepEqual(sorted.slice(-2),old);assert.deepEqual(new Set(sorted.map(s=>s.siteId)),new Set(sites.map(s=>s.siteId)));
  assert.deepEqual(sites,before);assert.equal(reefHabitatLayerSpeciesSites(old,'old',()=>.4),old);
});
test('new shared recipe admits actual bed or water locations within complete bodies and existing capacity',()=>{
  const f=layered(),r=f.region;assert.equal(r.reefResidentsVersion,9);assert.equal(r.reefResidents.recipe,'reef-residents-v9');
  assert.equal(r.reefResidents.candidateOrder.length,36);assert.equal(r.reefResidents.habitatEvidence.version,2);
  assert.ok(r.reefResidents.habitatEvidence.bedLayerSites>0);assert.ok(r.reefResidents.habitatEvidence.waterLayerSites>0);
  const admitted=r.agents.filter(a=>a.reefResidentSiteId.startsWith('reef-layer:'));assert.ok(admitted.length>0);
  for(const a of admitted){assert.equal(a.reefResidentIndividualVersion,9);
    assert.equal(a.reefResidentSiteId.endsWith(':water'),a.reefResidentMode==='reef-water');
    assert.ok(reefResidentPositionValid(r,f.generator,a,a.position,f));
    assert.equal(reefResidentPositionValid(r,f.generator,a,{...a.position,y:-2},f),false);
  }
  assert.ok(r.agents.length<=10);assert.deepEqual(r.resources,{algae:.4,plankton:.5,detritus:.3});
  const full=layered({count:19,turtles:1});assert.equal(full.region.reefResidents.addedIds.length,0);
  assert.equal(full.region.agents.length+full.region.turtleAgents.length,20);balanced(full.region);
});
test('layered animals retain real support movement and inventory during day/night, pause and cold validation',()=>{
  const f=layered(),starts=new Map(f.region.agents.map(a=>[a.id,clone(a.position)]));
  for(let i=0;i<64;i++)step(f,{lightAtDepth:i<32?.8:.01});
  assert.ok(f.region.agents.some(a=>gap(a.position,starts.get(a.id))>1e-8));assert.ok(f.region.agents.some(a=>a.lastResidentIntake));
  const before=clone(f.region);for(const a of f.region.agents)assert.equal(tickReefResidentAgent(f.region,f.generator,a,0,f),false);
  assert.deepEqual(f.region,before);assert.ok(validateReefResidentsRecord(clone(f.region),f.generator,f));balanced(f.region);
  assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:9}),false);assert.deepEqual(f.region,before);
});
test('forged layer source version site host geometry and food reject native restoration',()=>{
  const f=layered(),first=r=>r.agents.find(a=>a.reefResidentSiteId.startsWith('reef-layer:'));
  for(const mutate of [r=>{r.reefResidentsVersion=8;},r=>{r.reefResidents.habitatEvidence.waterLayerSites++;},r=>{first(r).reefResidentSiteId+=':forged';},
    r=>{first(r).reefResidentHostId='imaginary-rock';},r=>{first(r).position.y-=5;},r=>{first(r).reefResidentFoodPool='invented.food';}]){
    const row=clone(f.region);mutate(row);assert.equal(validateReefResidentsRecord(row,f.generator,f),false);
  }
});
test('shipped shallow constructor and reset enable habitat layers only behind existing visitor support',async()=>{
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture{constructor(seed,generator,options){this.options=options;}}
  const seed=livingShallowsSeed('55'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  for(const living of[true,false]){
    const c=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:living,oceanChunks:{generator}},Capture,seed);
    assert.equal(c.options.reefHabitatLayers,living);
    const model=new OceanEcology(seed,generator,{...c.options,store:{load:async()=>null,save:async()=>{},saveMany:async()=>{}}});
    try{assert.equal(model.reefHabitatLayersEnabled,living);model.reset(seed,generator);assert.equal(model.reefHabitatLayersEnabled,living);assert.equal(model._active.size,0);}
    finally{await model.dispose();}
  }
  const no=new OceanEcology(seed,generator,{reefHabitatLayers:true});try{assert.equal(no.reefHabitatLayersEnabled,false);}finally{await no.dispose();}
});

test('entire historical v8 recipe keeps complete32-step records and refuses new-layer regeneration',()=>{
  const rows=[];for(let ownerIndex=0;ownerIndex<12;ownerIndex++){
    const f=layerFixture({ownerIndex,seed:'57'});assert.ok(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:8}));
    const before=clone(f.region);assert.equal(initializeReefResidents(f.region,f.generator,{...options(f),fresh:true,version:9}),false);assert.deepEqual(f.region,before);
    for(let i=0;i<16;i++)step(f);for(let i=0;i<16;i++)step(f,{lightAtDepth:.01});rows.push(f.region);
  }
  assert.equal(hash(rows),'df4f51e7b2c9079b5fcad28473ad21c17a7cf8ba2c966e7588c0073ed2c80d8e');
});
