import test from 'node:test';
import assert from 'node:assert/strict';
import { OCEAN_SHOAL_LIFE_IDS, OCEAN_SHOAL_LIFE_MODEL, oceanShoalLifeRole, createOceanShoalLifePlan, initializeOceanShoalLife,
  validateOceanShoalLifeRecord, tickOceanShoalLife, oceanShoalLifePositionValid, oceanShoalLifeSnapshot, oceanShoalLifeBalance } from '../src/oceanShoalLife.js';
import { initializeLivingNetwork, tickLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

const clone = v => structuredClone(v), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const SHARK = 'blacktip-reef-shark', FISH = OCEAN_SHOAL_LIFE_IDS.filter(id => id !== SHARK);
function fixture(seed = 'shoal-fixture-0', { floorY = -8, plankton = .5, prey = .08, count = 0, turtles = 0 } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64, elements: [] };
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }), sample: () => ({ floorY, depthM: 8 - floorY, substrate: 'sand' }) };
  const region = { id: chunk.id, cx: 3, cz: 3, ticks: 0, timeSec: 0, agents: [], turtleAgents: [], events: [], counters: { feeding: 0, deaths: 0 },
    resources: { algae: .3, plankton, detritus: .2 }, ledger: { initial: .5 + plankton, input: 0, ingested: 0, exported: 0 },
    openWaterLifeVersion: 1, openWaterLife: { preyOrganicUnits: prey } };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, speciesId: 'green-chromis', regionId: region.id, sizeM: .075,
    alive: i % 2 === 0, energy: .5, timeSec: 0, position: { x: 254, y: -6, z: 254 } });
  for (let i = 0; i < turtles; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(region, chunk);
  return { generator, region, chunk, bed: () => floorY, surface: () => floorY };
}
function chosen(id, { shark = false, meadowWater = true, ...options } = {}) {
  for (let i = 0; i < 180; i++) { const f = fixture(`shoal-fixture-${i}`, options);
    if (!oceanShoalLifeRole(f.region, f.generator)) continue;
    const plan = createOceanShoalLifePlan(f.generator, f.region, { ...f, availableSlots: 5, meadowWater });
    if (plan.school?.speciesId !== id || (shark && !plan.placements.some(a => a.speciesId === SHARK))) continue;
    assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true, role: true, meadowWater, maxAdded: 5 }), true);
    assert.ok(validateOceanShoalLifeRecord(f.region, f.generator, f)); return f;
  } throw new Error(`No finite fixture for ${id}`);
}
function balanced(r) { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); assert.equal(oceanShoalLifeBalance(r), livingNetworkBalance(r)); }

function step(f,hour=10,network=true){const environment={foodSupply:0,currentMps:0,lightAtDepth:hour===2?.01:1,hour};
 f.region.ticks++;f.region.timeSec=f.region.ticks*.1;
 if(network)tickLivingNetwork(f.region,environment,.1);
 assert.equal(tickOceanShoalLife(f.region,f.generator,.1,{...f,environmentAt:()=>environment}),true);
 assert.ok(validateOceanShoalLifeRecord(f.region,f.generator,f));balanced(f.region);
}
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OCEAN_MEADOW_WATER_IDS, OCEAN_MEADOW_WATER_SPECIES } from '../src/oceanMeadowWaterSpecies.js';
import { oceanShoalLifeSpeciesCatalog } from '../src/oceanShoalLifeSpecies.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { createOceanShoalLifeAsset, animateOceanShoalLifeAsset, disposeOceanShoalLifeAsset, oceanShoalLifeAssetStats, OCEAN_SHOAL_LIFE_ENVELOPES } from '../src/world/OceanShoalLifeAssets.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';

test('two named meadow-water representatives extend only shallow catalog and retain the original four-school identity list',()=>{
 assert.equal(livingShallowsSpeciesCatalog.length,106);assert.equal(oceanShoalLifeSpeciesCatalog.length,4);assert.equal(OCEAN_SHOAL_LIFE_IDS.length,4);
 for(const s of OCEAN_MEADOW_WATER_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);assert.equal(s.sizeMeasure,'total-length');assert.equal(s.calibratedMovementMPerS,null);assert.ok(s.sources.every(x=>x.url.startsWith('https://')));for(const list of Object.values(sceneCatalogs))assert.ok(!list.some(x=>x.id===s.id));}
 assert.equal(OCEAN_MEADOW_WATER_SPECIES[0].feedingProxy.stock,'algae');assert.equal(OCEAN_MEADOW_WATER_SPECIES[1].feedingProxy.stock,'plankton');
});
test('v2 schools consist of real independent whole-body agents under the unchanged dead-and-turtle admission cap',()=>{
 for(const id of OCEAN_MEADOW_WATER_IDS){const f=chosen(id),r=f.region;assert.equal(r.shoalLifeVersion,2);assert.ok(r.agents.every(a=>a.shoalLifeIndividualVersion===2));
  assert.ok(r.agents.length>=5&&r.agents.length<=8);for(const a of r.agents)assert.ok(oceanShoalLifePositionValid(r,f.generator,a,a.position,{...f,occupancy:true}));
  const busy=fixture(f.generator.seed,{count:15,turtles:2});assert.equal(initializeOceanShoalLife(busy.region,busy.generator,{...busy,fresh:true,meadowWater:true}),true);assert.equal(busy.region.shoalLife.addedIds.length,0);assert.equal(busy.region.agents.length+busy.region.turtleAgents.length,17);
  const saved=clone(r);assert.equal(initializeOceanShoalLife(r,f.generator,{...f,fresh:true,meadowWater:true}),false);assert.deepEqual(r,saved);
 }
});
test('real school motion and opposite illustrative feeding phases debit only the selected existing owner food',()=>{
 for(const [id,allowed,blocked,pool] of [[OCEAN_MEADOW_WATER_IDS[0],10,2,'algae'],[OCEAN_MEADOW_WATER_IDS[1],2,10,'plankton']]){
  const f=chosen(id),r=f.region,initial=clone(r),before=r.resources[pool];for(let i=0;i<35;i++)step(f,blocked,false);
  assert.equal(r.shoalLife.counters.feedings,0);assert.equal(r.resources[pool],before);assert.ok(r.shoalLife.counters.moved>0);
  for(let i=0;i<35;i++)step(f,allowed,false);assert.ok(r.shoalLife.counters.feedings>0);assert.ok(r.resources[pool]<before);
  assert.equal(r.resources[pool==='algae'?'plankton':'algae'],initial.resources[pool==='algae'?'plankton':'algae']);assert.equal(r.openWaterLife.preyOrganicUnits,initial.openWaterLife.preyOrganicUnits);
  assert.ok(Math.abs(before-r.resources[pool]-r.shoalLife.counters.consumedUnits)<1e-9);
  for(const a of r.agents.filter(a=>a.lastShoalIntake)){const e=a.lastShoalIntake;assert.equal(e.pool,pool);assert.equal(e.ownerId,r.id);assert.ok(e.stockAfter<e.stockBefore);}
 }
});
test('v2 saved records reject mixed versions, changed species pools, impossible full-body geometry and false food receipts',()=>{
 const f=chosen(OCEAN_MEADOW_WATER_IDS[0]);step(f,10,false);const saved=clone(f.region);
 for(const mutate of [r=>{r.shoalLifeVersion=1;},r=>{r.agents[0].shoalLifeIndividualVersion=1;},r=>{r.agents[0].shoalLifeFoodPool='plankton';},r=>{r.agents[0].position.y=8;},r=>{r.shoalLife.foodScope='complete-natural-diet';}]){const r=clone(saved);mutate(r);assert.equal(validateOceanShoalLifeRecord(r,f.generator,f),false);}
 for(let i=0;i<32;i++)step(f,10,false);const fed=f.region.agents.find(a=>a.lastShoalIntake);assert.ok(fed);const r=clone(f.region);r.agents.find(a=>a.id===fed.id).lastShoalIntake.stockAfter+=.001;assert.equal(validateOceanShoalLifeRecord(r,f.generator,f),false);
 const a=f.region.agents[0];assert.equal(oceanShoalLifePositionValid(f.region,f.generator,a,a.position,{...f,surface:()=>a.position.y,occupancy:true}),false);
});
test('dead v2 members remain saved and cold continuation retains the complete independent clocks and food',()=>{
 const f=chosen(OCEAN_MEADOW_WATER_IDS[1]);f.region.agents[0].energy=0;step(f,2);assert.ok(!f.region.agents[0].alive&&f.region.agents[0].organicDeathRecorded);const roster=f.region.shoalLife.addedIds.slice(),saved=clone(f.region);
 const restored={...f,region:clone(saved)};assert.equal(initializeOceanShoalLife(restored.region,restored.generator,{...restored,fresh:true,meadowWater:true}),false);
 for(let i=0;i<12;i++){step(f,2);step(restored,2);}assert.deepEqual(restored.region,f.region);assert.deepEqual(f.region.shoalLife.addedIds,roster);assert.equal(f.region.agents.filter(a=>!a.alive).length,1);
});
test('two complete distinct bodies, native-clock fins and production animal dispatch fit whole-body envelopes and release shared resources',t=>{
 const before=oceanShoalLifeAssetStats(),animals=new OceanAnimals(livingShallowsSpeciesCatalog);t.after(()=>animals.dispose());
 for(const id of OCEAN_MEADOW_WATER_IDS){const {group}=createOceanShoalLifeAsset(id),e=OCEAN_SHOAL_LIFE_ENVELOPES[id];const neutral=new THREE.Box3().setFromObject(group);assert.ok(Math.abs(neutral.min.x+.5)<1e-6&&Math.abs(neutral.max.x-.5)<1e-6);
  assert.equal(group.userData.anatomy.dorsalFins,id===OCEAN_MEADOW_WATER_IDS[0]?1:2);
  for(let i=0;i<32;i++){animateOceanShoalLifeAsset(group,i*.1,{alive:true,velocity:{x:.18,y:0,z:0}});group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group);assert.ok(bounds.min.x>=e.localBounds.minX&&bounds.max.x<=e.localBounds.maxX);assert.ok(bounds.min.y>=e.minY&&bounds.max.y<=e.maxY);assert.ok(bounds.min.z>=e.localBounds.minZ&&bounds.max.z<=e.localBounds.maxZ);}
  animateOceanShoalLifeAsset(group,100,{alive:true,velocity:{x:0,y:0,z:0}});assert.equal(group.userData.shoalLifeParts.tail.rotation.y,0);disposeOceanShoalLifeAsset(group);
 }
 const rows=OCEAN_MEADOW_WATER_IDS.map((speciesId,i)=>({id:'new:'+i,speciesId,regionId:'3,3',alive:true,sizeM:.1,position:{x:200+i,y:-6,z:202},heading:.3,pitch:.06,timeSec:1,velocity:{x:.18,y:0,z:0},state:'school-cruising'}));
 animals.update(rows,999,{x:192,z:192});for(const a of rows){const object=animals.getObject(a.id);assert.ok(object?.userData.shoalLifeParts);assert.equal(object.userData.shoalLifeLastTimeSec,a.timeSec);}
 animals.update([],999,{x:192,z:192});assert.deepEqual(oceanShoalLifeAssetStats(),before);
});
test('shared observation reads actual v2 school members and frames them without changing saved ecology or inventing empty schools',()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  oceanShoalLifeObservation(){'),source.indexOf('  oceanMeadowLifeObservation(){'));
 const observe=new Function('THREE',`return function ${method.trim()};`)(THREE);
 for(const id of OCEAN_MEADOW_WATER_IDS){const f=chosen(id),saved=clone(f.region),world={isLivingShallows:true,disposed:false,oceanEcologyResetting:false,oceanChunks:{generator:f.generator},surfaceY:8,habitatY:()=>-8,oceanWorldPosition:()=>({x:210,y:-6,z:210}),oceanEcology:{agents:f.region.agents,snapshot:()=>({regions:[f.region]})}};
  const view=observe.call(world);assert.ok(view);const school=f.region.agents.filter(a=>a.alive&&a.groupId),anchor=school.reduce((p,a)=>({x:p.x+a.position.x/school.length,y:p.y+a.position.y/school.length,z:p.z+a.position.z/school.length}),{x:0,y:0,z:0});assert.deepEqual(view.target,anchor);assert.deepEqual(f.region,saved);
  const camera=new THREE.PerspectiveCamera(50,1,.05,60);camera.position.set(view.position.x,view.position.y,view.position.z);camera.lookAt(view.target.x,view.target.y,view.target.z);camera.updateMatrixWorld(true);
  assert.ok(school.some(a=>{const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z).project(camera);return Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1;}));
  world.oceanEcology.agents=[];assert.equal(observe.call(world),null);
 }
});
test('latest URL, actual production constructor and reset retain previous layers, history keys and old alias options',async()=>{
 assert.equal(readOceanWorldVariant('?world=meadow-water-life'),'meadow-water-life');const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');const start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,g,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),options=variant=>new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator:g}},Capture,seed).options;
 for(const variant of ['small-bottom-life','meadow-food-web','meadow-foraging','reef-foraging','reef-mobile-benthos'])assert.equal(options(variant).meadowWaterLife,false);
 const p=options('meadow-water-life');for(const key of ['meadowWaterLife','smallBottomLife','meadowForaging','meadowFoodWeb'])assert.equal(p[key],true);assert.equal(options(null).meadowWaterLife,true);
 const store={available:true,async load(){return null;},async save(){},async saveMany(){},async clear(){}};const model=new OceanEcology(seed,g,{...p,store}),old=new OceanEcology(seed,g,{...options('small-bottom-life'),store});
 try{assert.ok(model._world.includes('copy:meadow-water-life:'));assert.equal(model._randomWorld,old._randomWorld);assert.equal(model.meadowWaterLifeEnabled,true);model.reset();await model._pending;assert.equal(model.meadowWaterLifeEnabled,true);}finally{await model.dispose();await old.dispose();}
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("livingShallows&&worldVariant!=='whole-seabed'"));assert.ok(app.includes("url.searchParams.set('world','whole-seabed')"));assert.ok(source.includes('region=>region.id===centre&&[1,2,3].includes(region.shoalLifeVersion)'));
});
