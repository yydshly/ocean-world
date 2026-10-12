import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanBenthicLifePlan, initializeOceanBenthicLife, tickOceanBenthicLifeAgent,
  validateOceanBenthicLifeRecord, OCEAN_BENTHIC_LIFE_IDS } from '../src/oceanBenthicLife.js';
import { oceanBenthicLifeSpeciesById } from '../src/oceanBenthicLifeSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

const allPresent = () => .1, clone = value => JSON.parse(JSON.stringify(value));
function fixture({ floorY = -3, rocks = true, grass = true } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64,
    bounds: { minX: 192, maxX: 256, minZ: 192, maxZ: 256 }, counts: {}, elements: [] };
  if (rocks) for (const [i, [x, z]] of [[209, 211], [234, 229]].entries()) chunk.elements.push({ id: `rock:${i}`,
    kind: 'rock', profile: 'terrace', x, y: floorY, z, scale: { x: 18, y: 1, z: 16 }, rotation: .2 });
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6, y: floorY, z: 248,
    scale: { x: .7, y: .4, z: .7 }, rotation: 0 });
  const bed = () => floorY;
  const surface = (x, z) => chunk.elements.reduce((height, e) => {
    const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : null; return h === null ? height : Math.max(height, h);
  }, floorY);
  const generator = { seed: 'benthic-fixture-2', profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand' }) };
  return { generator, chunk, bed, surface };
}
function regionFor(chunk, count = 0, turtleCount = 0) {
  const region = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae: .4, plankton: .5, detritus: .3 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 }, turtleAgents: [] };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: chunk.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .5, sizeM: .075, position: { x: 254, y: -1, z: 254 }, home: { x: 254, y: -1, z: 254 } });
  for (let i = 0; i < turtleCount; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(region, chunk); return region;
}
function initialized(options = {}, count = 0, turtleCount = 0, smallAnimals = true) {
  const f = fixture(options), region = regionFor(f.chunk, count, turtleCount);
  assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent, smallAnimals }), true);
  return { ...f, region };
}
const balanced = region => { assert.ok(Math.abs(livingNetworkBalance(region)) < 1e-9); assert.ok(validateLivingNetworkRecord(region)); };


import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { OCEAN_SMALL_BOTTOM_SPECIES, OCEAN_SMALL_BOTTOM_IDS } from '../src/oceanSmallBottomSpecies.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOceanBenthicLifeAsset, animateOceanBenthicLifeAsset, disposeOceanBenthicLifeAsset,
  OCEAN_BENTHIC_LIFE_ENVELOPES, oceanBenthicLifeAssetStats } from '../src/world/OceanBenthicLifeAssets.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';

test('fresh small-bottom palette produces real soft-bed records inside existing capacity; v1 and dead records never refill',()=>{
 const f=initialized();assert.equal(f.region.benthicLifeVersion,2);assert.equal(f.region.agents.length,4);
 for(const id of OCEAN_SMALL_BOTTOM_IDS){const a=f.region.agents.find(a=>a.speciesId===id);assert.ok(a);assert.equal(a.benthicLifeMode,'soft');assert.equal(a.benthicLifeHostId,null);assert.equal(a.benthicLifeIndividualVersion,2);}
 assert.ok(validateOceanBenthicLifeRecord(f.region,f.generator,f));balanced(f.region);
 const old=initialized({},0,0,false),saved=clone(old.region);
 assert.equal(initializeOceanBenthicLife(old.region,old.generator,{...old,fresh:true,smallAnimals:true}),false);assert.deepEqual(old.region,saved);
 assert.deepEqual(old.region.agents.map(a=>a.speciesId),['blue-spotted-ray','reef-goatfish','tiger-cowrie','spotted-hermit-crab']);
 const cap=initialized({},17,2);assert.equal(cap.region.agents.length+cap.region.turtleAgents.length,20);balanced(cap.region);
 for(const id of OCEAN_SMALL_BOTTOM_IDS){const r=clone(f.region);r.benthicLifeVersion=1;r.benthicLife.version=1;for(const a of r.agents)a.benthicLifeIndividualVersion=1;assert.equal(validateOceanBenthicLifeRecord(r,f.generator,f),false,id);}
 const wrong=clone(f.region);wrong.agents.find(a=>a.speciesId===OCEAN_SMALL_BOTTOM_IDS[0]).benthicLifeIndividualVersion=1;assert.equal(validateOceanBenthicLifeRecord(wrong,f.generator,f),false);
 const empty=initialized({floorY:-35});assert.equal(empty.region.benthicLifeVersion,2);assert.equal(empty.region.agents.length,0);assert.ok(validateOceanBenthicLifeRecord(empty.region,empty.generator,empty));
});

test('complete antenna and leg envelopes reject crown obstructions and hard-only bottoms rather than floating through plants',()=>{
 const f=initialized({rocks:false,grass:false}),a=f.region.agents.find(a=>a.speciesId==='green-tiger-prawn');
 const reach=1.22*a.sizeM,x=a.home.x+Math.cos(a.heading)*reach,z=a.home.z+Math.sin(a.heading)*reach;
 const blocked=(px,pz,crown=false)=>f.surface(px,pz)+(crown&&Math.hypot(px-x,pz-z)<.001?.20:0);
 assert.equal(validateOceanBenthicLifeRecord(f.region,f.generator,{surface:blocked,bed:f.bed}),false);
 const plan=createOceanBenthicLifePlan(f.generator,{id:'3,3',cx:3,cz:3,agents:[]},{...f,smallAnimals:true,availableSlots:4,random:allPresent,surface:blocked});
 assert.ok(!plan.placements.some(p=>p.speciesId===a.speciesId&&p.siteId===a.benthicLifeSiteId));
 const g={...f.generator,sample:()=>({floorY:-3,depthM:11,substrate:'rock'})};
 const hard=createOceanBenthicLifePlan(g,{id:'3,3',cx:3,cz:3,agents:[]},{...f,smallAnimals:true,availableSlots:4,random:allPresent});
 assert.ok(!hard.placements.some(p=>OCEAN_SMALL_BOTTOM_IDS.includes(p.speciesId)));
});

test('new animals move at bounded real clock speeds and debit local food; crab travels sideways and cold replay preserves future',()=>{
 const f=initialized({rocks:false,grass:false}),r=f.region,starts=new Map(r.agents.map(a=>[a.id,clone(a.position)]));
 const step=(row,i)=>{row.timeSec=i*.1;row.ticks=i;for(const a of row.agents)tickOceanBenthicLifeAgent(row,f.generator,a,.1,{...f,random:allPresent,environment:{lightAtDepth:i<=40?.8:.01}});};
 for(let i=1;i<=80;i++){step(r,i);balanced(r);}
 assert.ok(validateOceanBenthicLifeRecord(r,f.generator,f));
 for(const id of OCEAN_SMALL_BOTTOM_IDS){const a=r.agents.find(a=>a.speciesId===id);assert.ok(a.lastFeedAt!==null);assert.ok(Math.hypot(a.position.x-starts.get(a.id).x,a.position.z-starts.get(a.id).z)>.001);}
 const c=r.agents.find(a=>a.speciesId==='flower-swimming-crab'),dx=c.position.x-starts.get(c.id).x,dz=c.position.z-starts.get(c.id).z;
 assert.ok(Math.abs(dx*Math.cos(c.heading)+dz*Math.sin(c.heading))<1e-8,'carapace forward is perpendicular to walking displacement');
 assert.ok(r.resources.detritus<.3);const copy=clone(r);
 for(let i=81;i<=112;i++){step(r,i);step(copy,i);}assert.deepEqual(copy,r);
 const before=clone(r);for(const a of r.agents)tickOceanBenthicLifeAgent(r,f.generator,a,0,f);assert.deepEqual(r,before);
 const empty=initialized({rocks:false,grass:false}),e=empty.region,food=e.resources.detritus;
 e.resources.detritus=0;e.ledger.exported+=food;e.basicNetwork.ledger.output+=food;e.basicNetwork.processTotals.systemOutput+=food;
 e.timeSec=4;for(const a of e.agents){a.nextBite=0;tickOceanBenthicLifeAgent(e,empty.generator,a,.1,{...empty,environment:{lightAtDepth:a.speciesId==='flower-swimming-crab'?.8:.01}});}
 assert.equal(e.benthicLife.counters.consumedUnits,0);balanced(e);
});

test('both complete models fit envelopes across animation frames and shared geometry is released once',()=>{
 const before=oceanBenthicLifeAssetStats();
 for(const s of OCEAN_SMALL_BOTTOM_SPECIES){const first=createOceanBenthicLifeAsset(s),second=createOceanBenthicLifeAsset(s),bounds=OCEAN_BENTHIC_LIFE_ENVELOPES[s.id];
  try{const one=[],two=[];first.group.traverse(o=>{if(o.isMesh)one.push(o);});second.group.traverse(o=>{if(o.isMesh)two.push(o);});assert.ok(one.length>=2&&one.length<=3);assert.equal(one[0].geometry,two[0].geometry);
   for(let i=0;i<80;i++){animateOceanBenthicLifeAsset(first.group,i*.17,{state:i<40?'foraging':'resting'});first.group.updateMatrixWorld(true);
    first.group.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
     for(let j=0;j<p.count;j++){const v=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld);assert.ok([v.x,v.y,v.z].every(Number.isFinite));assert.ok(v.y>=bounds.minY-1e-6&&v.y<=bounds.maxY+1e-6,`${s.id}: vertical ${v.y}`);assert.ok(v.x>=bounds.localBounds.minX-1e-6&&v.x<=bounds.localBounds.maxX+1e-6&&Math.abs(v.z)<=bounds.localBounds.maxZ+1e-6,`${s.id}: outline`);assert.ok(Math.hypot(v.x,v.z)<=bounds.horizontalRadius+1e-6);}
    });
   }
  }finally{disposeOceanBenthicLifeAsset(first.group);assert.ok(oceanBenthicLifeAssetStats().instances>before.instances);disposeOceanBenthicLifeAsset(first.group);disposeOceanBenthicLifeAsset(second.group);}
 }assert.deepEqual(oceanBenthicLifeAssetStats(),before);
});

test('actual OceanAnimals dispatch renders and picks both saved individuals, respects ecological clock and floating origin',()=>{
 const f=initialized(),rows=f.region.agents.filter(a=>OCEAN_SMALL_BOTTOM_IDS.includes(a.speciesId)).map(a=>({...clone(a),timeSec:1}));
 const layer=new OceanAnimals(livingShallowsSpeciesCatalog),before=clone(rows);
 try{layer.update(rows,999,{x:192,z:192});assert.equal(layer.stats.activeAnimals,2);
  for(const a of rows){const o=layer.getObject(a.id);assert.equal(o.userData.speciesId,a.speciesId);assert.equal(o.userData.agentId,a.id);assert.ok(o.userData.benthicLifeParts.body);assert.deepEqual(o.position.toArray(),[a.position.x,a.position.y,a.position.z]);assert.equal(o.scale.x,a.sizeM);
   const origin=new THREE.Vector3(a.position.x-192,a.position.y+1,a.position.z-192);const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0));layer.root.updateMatrixWorld(true);assert.ok(ray.intersectObject(o,true).length>0,'full body pickable');
   const pose=o.userData.benthicLifeParts.appendages.rotation.y;layer.update(rows,5000);assert.equal(o.userData.benthicLifeParts.appendages.rotation.y,pose);
  }assert.deepEqual(rows,before);rows[0].alive=false;layer.update(rows,5000);assert.equal(layer.stats.activeAnimals,1);
 }finally{layer.dispose();}assert.equal(oceanBenthicLifeAssetStats().instances,0);
});

test('URL enters latest production flags and separate animal history while old aliases and terrain random keys stay fixed',async()=>{
 assert.equal(readOceanWorldVariant('?world=small-bottom-life'),'small-bottom-life');
 const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
 const start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
 class Capture{constructor(seed,generator,options){this.options=options;}}
 const seed=livingShallowsSeed('56'),generator=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
 const options=variant=>new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:variant,oceanChunks:{generator}},Capture,seed).options;
 for(const variant of ['meadow-food-web','meadow-foraging','reef-foraging','reef-mobile-benthos'])assert.equal(options(variant).smallBottomLife,false);
 assert.equal(options(null).smallBottomLife,true);const p=options('small-bottom-life');assert.equal(p.smallBottomLife,true);assert.equal(p.meadowForaging,true);assert.equal(p.meadowFoodWeb,true);
 const store={available:true,async load(){return null;},async save(){},async saveMany(){},async clear(){}};
 const model=new OceanEcology(seed,generator,{...p,store}),old=new OceanEcology(seed,generator,{...options('meadow-food-web'),store});
 try{assert.ok(model._world.includes('copy:small-bottom-life:'));assert.equal(model._randomWorld,old._randomWorld);assert.equal(model.smallBottomLifeEnabled,true);assert.equal(old.smallBottomLifeEnabled,false);model.reset();await model._pending;assert.equal(model.smallBottomLifeEnabled,true);}
 finally{await model.dispose();await old.dispose();}
 assert.ok(source.includes("worldVariant === 'small-bottom-life'"));
 const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');assert.ok(app.includes("worldVariant!=='whole-seabed'"));assert.ok(app.includes("url.searchParams.set('world','whole-seabed')"));
 assert.equal(livingShallowsSpeciesCatalog.length,106);for(const s of OCEAN_SMALL_BOTTOM_SPECIES){assert.equal(livingShallowsSpeciesCatalog.filter(x=>x.id===s.id).length,1);assert.ok(s.sources.length>=3);for(const list of Object.values(sceneCatalogs))assert.ok(!list.some(x=>x.id===s.id));}
});
