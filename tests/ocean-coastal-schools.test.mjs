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
function chosen(id, { shark = false, meadowWater = true, coastalSchools = true, ...options } = {}) {
  for (let i = 0; i < 180; i++) { const f = fixture(`shoal-fixture-${i}`, options);
    if (!oceanShoalLifeRole(f.region, f.generator)) continue;
    const plan = createOceanShoalLifePlan(f.generator, f.region, { ...f, availableSlots: 5, meadowWater, coastalSchools });
    if (plan.school?.speciesId !== id || (shark && !plan.placements.some(a => a.speciesId === SHARK))) continue;
    assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true, role: true, meadowWater, coastalSchools, maxAdded: 5 }), true);
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


import { OCEAN_COASTAL_SCHOOL_IDS, OCEAN_COASTAL_SCHOOL_SPECIES } from '../src/oceanCoastalSchoolSpecies.js';

test('two sourced coastal schools extend shallow regional catalog once and retain old public four IDs and v1/v2 populations',()=>{
 assert.equal(livingShallowsSpeciesCatalog.length,106);assert.equal(OCEAN_SHOAL_LIFE_IDS.length,4);assert.equal(oceanShoalLifeSpeciesCatalog.length,4);
 for(const s of OCEAN_COASTAL_SCHOOL_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);assert.equal(s.sizeMeasure,'total-length');assert.equal(s.calibratedMovementMPerS,null);assert.ok(Object.isFrozen(s));assert.ok(s.sources.length>=2);for(const list of Object.values(sceneCatalogs))assert.ok(!list.some(x=>x.id===s.id));}
 for(const version of [1,2]){const f=chosen(FISH[0],{coastalSchools:false,meadowWater:version===2}),saved=clone(f.region);assert.equal(f.region.shoalLifeVersion,version);assert.equal(initializeOceanShoalLife(f.region,f.generator,{...f,fresh:true,coastalSchools:true}),false);assert.deepEqual(f.region,saved);}
});
test('v3 schools have five real independent individuals under the existing dead/turtle cap, and empty old/new niches are sealed without refill',()=>{
 for(const id of OCEAN_COASTAL_SCHOOL_IDS){const f=chosen(id),r=f.region;assert.equal(r.shoalLifeVersion,3);assert.equal(r.agents.length,5);assert.equal(r.shoalLife.school.memberIds.length,5);assert.equal(new Set(r.agents.map(a=>a.id)).size,5);assert.ok(r.agents.every(a=>a.speciesId===id&&a.shoalLifeIndividualVersion===3));balanced(r);assert.ok(validateOceanShoalLifeRecord(r,f.generator,f));}
 const f=fixture('shoal-fixture-0',{count:17,turtles:2});assert.equal(initializeOceanShoalLife(f.region,f.generator,{...f,fresh:true,coastalSchools:true}),true);assert.equal(f.region.agents.length+f.region.turtleAgents.length,19);assert.equal(f.region.shoalLife.school,null);const saved=clone(f.region);assert.equal(initializeOceanShoalLife(f.region,f.generator,{...f,fresh:true,coastalSchools:true}),false);assert.deepEqual(f.region,saved);
 for(const id of OCEAN_COASTAL_SCHOOL_IDS){const f=chosen(id),r=clone(f.region);r.shoalLifeVersion=2;r.shoalLife.version=2;for(const a of r.agents)a.shoalLifeIndividualVersion=2;assert.equal(validateOceanShoalLifeRecord(r,f.generator,f),false);}
});
test('yellowstripe scad whole-body poses require real soft open bottom and near-bottom range, while mackerel keeps a clear pelagic body',()=>{
 const f=chosen('yellowstripe-scad'),a=f.region.agents[0];assert.ok(oceanShoalLifePositionValid(f.region,f.generator,a,a.position,f));
 assert.equal(oceanShoalLifePositionValid(f.region,{...f.generator,sample:()=>({substrate:'rock'})},a,a.position,f),false);
 assert.equal(oceanShoalLifePositionValid(f.region,f.generator,a,a.position,{...f,surface:(x,z)=>f.bed(x,z)+.2}),false);
 const raised={...a,position:{...a.position,y:f.bed()+3.2}};assert.equal(oceanShoalLifePositionValid(f.region,f.generator,raised,raised.position,f),false);
 const m=chosen('indian-mackerel'),ma=m.region.agents[0];assert.ok(oceanShoalLifePositionValid(m.region,m.generator,ma,ma.position,m));assert.equal(oceanShoalLifePositionValid(m.region,m.generator,ma,{...ma.position,y:8},m),false);
 const changed=clone(f.region);changed.agents[0].position.y+=.3;assert.equal(validateOceanShoalLifeRecord(changed,f.generator,f),false);
});
test('both school types really move and debit separate pools; scad night gates, pause and depletion retain food/organic balance',()=>{
 for(const id of OCEAN_COASTAL_SCHOOL_IDS){const f=chosen(id),r=f.region,before=clone(r),external=r.basicNetwork.ledger.externalInput;
  for(let i=0;i<36;i++)step(f,10,false);assert.ok(r.agents.every(a=>distance(a.position,before.agents.find(b=>b.id===a.id).position)>.001));
  if(id==='yellowstripe-scad'){assert.ok(r.agents.every(a=>a.lastFeedAt===null));assert.equal(r.openWaterLife.preyOrganicUnits,before.openWaterLife.preyOrganicUnits);for(let i=0;i<36;i++)step(f,2,false);}
  assert.ok(r.agents.every(a=>a.lastFeedAt!==null));assert.ok(r.agents.every(a=>a.lastShoalIntake.pool===(id==='indian-mackerel'?'plankton':'openWaterLife.preyOrganicUnits')));assert.equal(r.resources.algae,before.resources.algae);assert.equal(r.basicNetwork.ledger.externalInput,external);balanced(r);
  const saved=clone(r);assert.equal(tickOceanShoalLife(r,f.generator,0,f),false);assert.deepEqual(r,saved);
  const wrong=clone(r);wrong.agents[0].lastShoalIntake.removedUnits+=.01;assert.equal(validateOceanShoalLifeRecord(wrong,f.generator,f),false);
  const empty=chosen(id,{plankton:0,prey:0});for(let i=0;i<40;i++)step(empty,2,false);assert.ok(empty.region.agents.every(a=>a.lastFeedAt===null));assert.equal(empty.region.shoalLife.counters.consumedUnits,0);balanced(empty.region);
 }
});
test('complete distinct body/fin kits fit their whole-body envelopes across native-clock animation and release shared resources',()=>{
 const before=oceanShoalLifeAssetStats();
 for(const s of OCEAN_COASTAL_SCHOOL_SPECIES){const {group}=createOceanShoalLifeAsset(s),second=createOceanShoalLifeAsset(s),e=OCEAN_SHOAL_LIFE_ENVELOPES[s.id];
  try{const neutral=new THREE.Box3().setFromObject(group);assert.ok(Math.abs(neutral.min.x+.5)<1e-6&&Math.abs(neutral.max.x-.5)<1e-6);assert.equal(group.userData.anatomy.dorsalFins,2);assert.equal(group.userData.anatomy.dorsalFinlets,s.id==='indian-mackerel'?5:0);
   let vertices=0;group.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;assert.ok(o.geometry.index.count>0);assert.ok([...o.geometry.attributes.position.array,...o.geometry.attributes.normal.array].every(Number.isFinite));}});assert.ok(vertices>500);
   for(let i=0;i<32;i++){animateOceanShoalLifeAsset(group,i*.1,{alive:true,velocity:i<16?{x:0,y:0,z:0}:{x:.18,y:0,z:0}});group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group);assert.ok(box.min.y>=e.minY&&box.max.y<=e.maxY);for(const axis of ['X','Z'])assert.ok(box.min[axis.toLowerCase()]>=e.localBounds['min'+axis]&&box.max[axis.toLowerCase()]<=e.localBounds['max'+axis]);}
   const pose=group.children.map(o=>o.matrix.toArray());animateOceanShoalLifeAsset(group,5000,{alive:false});group.updateMatrixWorld(true);assert.deepEqual(group.children.map(o=>o.matrix.toArray()),pose);
   disposeOceanShoalLifeAsset(group);assert.equal(second.group.userData.shoalLifeDisposed,false);
  }finally{disposeOceanShoalLifeAsset(group);disposeOceanShoalLifeAsset(second.group);}
 }assert.deepEqual(oceanShoalLifeAssetStats(),before);
});
test('actual animal renderer and native shoal observation use v3 real school records, clocks, picking and safe empty/death handling',()=>{
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('  oceanShoalLifeObservation(){'),end=source.indexOf('  oceanMeadowLifeObservation(){',start);
 const observe=new Function('THREE',source.slice(start,end).trim().replace('oceanShoalLifeObservation()', 'return function()'))(THREE);
 for(const id of OCEAN_COASTAL_SCHOOL_IDS){const f=chosen(id),rows=f.region.agents,before=clone(f.region),layer=new OceanAnimals(livingShallowsSpeciesCatalog),origin={x:192,z:192};
  try{layer.update(rows,100,origin);const world={isLivingShallows:true,disposed:false,oceanEcologyResetting:false,oceanChunks:{generator:f.generator},oceanEcology:{agents:rows,snapshot:()=>({regions:[f.region]})},oceanWorldPosition:()=>new THREE.Vector3(224,0,224),surfaceY:8,habitatY:()=>-8};
   const view=observe.call(world);assert.ok(view);assert.deepEqual(f.region,before);const camera=new THREE.PerspectiveCamera(52,16/9,.03,200);camera.position.set(view.position.x-origin.x,view.position.y,view.position.z-origin.z);camera.lookAt(view.target.x-origin.x,view.target.y,view.target.z-origin.z);camera.updateMatrixWorld(true);const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   for(const a of rows){const o=layer.getObject(a.id);assert.ok(o.userData.shoalLifeParts.body);assert.equal(o.scale.x,a.sizeM);assert.ok(layer.pickableObjects.includes(o));assert.ok(frustum.intersectsBox(new THREE.Box3().setFromObject(o)));}
   const a=rows[0],o=layer.getObject(a.id);a.velocity={x:.18,y:0,z:0};a.timeSec=1;layer.update(rows,100);const angle=o.userData.shoalLifeParts.tail.rotation.y;layer.update(rows,500);assert.equal(o.userData.shoalLifeParts.tail.rotation.y,angle);
   a.alive=false;layer.update(rows,500);assert.equal(layer.getObject(a.id),null);world.oceanEcology.agents=[];assert.equal(observe.call(world),null);
  }finally{layer.dispose();}
 }
});
test('latest coastal URL production constructor/reset preserve terrain and all previous layers while old aliases keep shoal v1/v2 options',async()=>{
 assert.equal(readOceanWorldVariant('?world=coastal-schools'),'coastal-schools');const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,generator,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed)),options=variant=>new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator}},Capture,seed).options;
 const p=options('coastal-schools');for(const key of ['coastalSchools','meadowWaterLife','sandBottomLife','smallBottomLife','meadowFoodWeb','reefForaging'])assert.equal(p[key],true,key);assert.equal(options(null).coastalSchools,true);for(const variant of ['sand-bottom-life','meadow-water-life','small-bottom-life','reef-mobile-benthos'])assert.equal(options(variant).coastalSchools,false);
 const store={available:true,async load(){return null;},async save(){},async saveMany(){},async clear(){}};const model=new OceanEcology(seed,generator,{...p,store}),old=new OceanEcology(seed,generator,{...options('sand-bottom-life'),store});
 try{assert.equal(model._randomWorld,old._randomWorld);assert.ok(model._world.includes('copy:coastal-schools:'));assert.equal(model.coastalSchoolsEnabled,true);assert.equal(old.coastalSchoolsEnabled,false);model.reset();await model._pending;assert.equal(model.coastalSchoolsEnabled,true);}finally{await model.dispose();await old.dispose();}
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("url.searchParams.set('world','whole-seabed')"));assert.ok(app.includes('[1,2,3].includes(agent.shoalLifeIndividualVersion)'));
});
