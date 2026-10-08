import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { createCoastalSeascapeMotion, sampleCoastalSeascapeMotion, coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';
import { seagrassMeadowRegionOrigin } from '../src/seagrassMeadowRegion.js';
import { createHash } from 'node:crypto';
import { reefValleyRegionOrigin, REEF_VALLEY_REGION_ROUTE_STOPS } from '../src/reefValleyRegion.js';
import { COASTAL_SEASCAPE_ROUTE_STOPS } from '../src/livingCoastalSeascape.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

// Actual seeded ecology, durable source registry, native Three renderers and
// shipped camera methods. CPU evidence does not certify browser/GPU appearance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const tickStart=source.indexOf('    if(!this.paused){this.visualTimeSec+=dt;try{'),tickEnd=source.indexOf('    if(this.isLivingShallows&&this.elapsed-',tickStart);
assert.ok(tickStart>=0&&tickEnd>tickStart);
const nativeTick=new Function('dt',source.slice(tickStart,tickEnd));
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, 'shipped ' + name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE','clamp','normalizeOceanObservationView','oceanLayerHeight',
  'isDirectorPlaybackRate','createDirectorCameraMotion','sampleDirectorCameraMotion','advanceDirectorCameraElapsed',
  'createCoastalSeascapeMotion','sampleCoastalSeascapeMotion','coastalSeascapeWindowReady','reefValleyRegionOrigin','seagrassMeadowRegionOrigin',
  `return class {${['currentSeagrassMeadowRegionPlan','planSeagrassMeadowEntry','enterSeagrassMeadowRegion','oceanWorldPosition','currentReefValleyRegionPlan','enterReefValleyRegion','createReefValleyRegionSegment',
    'sampleReefValleyRegionSegment','updateReefValleyRegionMotion','currentCoastalSeascapePlan','enterCoastalLifeBelt','enterLivingShallows',
    'prepareDirectorObservation','beginDirectorMotion','directorMotionQueries','updateDirectorMotion','directorMotionSnapshot',
    'setDirectorPlaybackRate','findAgent','restoreOceanObservation','setOceanRenderOrigin','oceanLayerY','floorY','habitatY',
    'clearCameraPosition','enforceCameraClearance','requestOceanEcology','setPaused','persistLivingWorld'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, isDirectorPlaybackRate,
  createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed,
  createCoastalSeascapeMotion, sampleCoastalSeascapeMotion, coastalSeascapeWindowReady, reefValleyRegionOrigin, seagrassMeadowRegionOrigin);
const same = (a,b,label) => assert.ok(isDeepStrictEqual(a,b),label);
const plain = v => ({x:v.x,y:v.y,z:v.z});
const target = w => w.controls.target.clone().add(new THREE.Vector3(w.oceanRenderOrigin.x,0,w.oceanRenderOrigin.z));
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject}; }
function fixture({records=new Map(),reefValleyRegion=true}={}) {
  const seed=livingShallowsSeed('42'),chunks=new OceanChunks(seed,{livingGeology:true}),generator=chunks.generator;
  const commits=[],reads=[],requests=[],updates=[],views=[],store={available:true,beforeRead:null,beforeSave:null,rejectSave:false,undefinedId:null,
    async load(_world,id){reads.push(id);if(this.beforeRead)await this.beforeRead(id);if(this.undefinedId===id)return undefined;return structuredClone(records.get(id)??null);},
    async saveMany(_world,rows){if(this.beforeSave)await this.beforeSave(rows);if(this.rejectSave)throw new Error('native atomic save refused');
      commits.push(rows.map(([id,row])=>({id,version:row.livingRidgePlan?.version,reefValley:row.reefValleyRegionVersion})));
      for(const[id,row]of rows)records.set(id,structuredClone(row));}
  };
  const ecology=new OceanEcology(seed,generator,{store,turtles:true,sceneElements:false,habitatScenes:false,macroLandscape:false,
    livingGeology:true,habitatMosaic:true,seabedRelief:true,seascape:true,
    livingBelt:true,shallowSeascape:true,coastalSeascape:true,reefValleyRegion,meadowRegion:true,turtleGrazing:true,biodiversity:true,benthicLife:true,meadowLife:true,shoalLife:true});
  const world=new World(),animals=new OceanAnimals(livingShallowsSpeciesCatalog);
  Object.assign(world,{isLivingShallows:true,isKelp:false,isDeep:false,biomeId:'reef',disposed:false,oceanEcologyResetting:false,
    oceanExploring:true,sim:{seed,agents:[],metrics:{timeSec:0},environment:{hour:12,currentMps:.15,turbidity:.25,foodSupply:1}},
    elapsed:0,errors:[],paused:false,controlStartCount:0,keys:new Set(),surfaceY:generator.surfaceY,
    camera:new THREE.PerspectiveCamera(49,16/9,.05,160),oceanRenderOrigin:{x:0,z:0},
    controls:{target:new THREE.Vector3(),minPolarAngle:0,maxPolarAngle:Math.PI,minDistance:.18,maxDistance:30,enableDamping:true,update(){}},
    highlight:new THREE.Group(),cameraRocks:[],entities:new Map(),catalog:new Map(livingShallowsSpeciesCatalog.map(s=>[s.id,s])),
    oceanEcology:ecology,oceanChunks:chunks,oceanAnimals:animals,select(){},onSelect(){},emitSnapshot(){},updateKelpDriftFood(){}});
  const update=chunks.update.bind(chunks),request=world.requestOceanEcology.bind(world),restore=world.restoreOceanObservation.bind(world);
  chunks.update=p=>{updates.push(plain(p));return update(p);};
  world.requestOceanEcology=(p=world.oceanWorldPosition())=>{requests.push(plain(p));return request(p);};
  world.restoreOceanObservation=v=>{views.push(structuredClone(v));return restore(v);};
  const stop=generator.routeStops.find(s=>s.id==='reef-valley-region');assert.ok(stop);
  return{world,chunks,generator,ecology,animals,store,records,commits,reads,requests,updates,views,stop};
}
async function settle(f) {await f.ecology._pending;await nextTurn();f.chunks.update(f.world.oceanWorldPosition());}
async function release(f) {f.world.disposed=true;f.store.beforeRead=null;f.store.beforeSave=null;f.store.rejectSave=false;f.store.undefinedId=null;
  await f.ecology._pending?.catch(()=>{});f.animals.dispose();await f.ecology.dispose();f.chunks.dispose();f.generator.clearCache?.();}
function ready(f) {return coastalSeascapeWindowReady(f.world.oceanWorldPosition(),{loadedOwnerIds:f.chunks.stats.loadedChunks,activeOwnerIds:[...f.ecology._active.keys()]});}
function bounds(f) {assert.equal(f.ecology._active.size,9);assert.equal(f.chunks.stats.activeChunks,9);assert.ok(f.chunks.stats.ridgeReadyOwners<=25);
  assert.ok(f.ecology._reefValleyAdmission.privateOwnerCount<=97);assert.ok([...f.ecology._active.values()].every(r=>r.agents.length+(r.turtleAgents?.length??0)<=20));}


test('new meadow native entrance, continuous camera, independent animals and exact cold history',async t=>{
  const f=fixture();let cold;const started=performance.now();
  try{
    assert.equal(await f.world.enterSeagrassMeadowRegion(),true);await settle(f);bounds(f);assert.ok(ready(f));
    const entrySeconds=(performance.now()-started)/1000,plan=f.world.currentSeagrassMeadowRegionPlan();assert.equal(plan.version,9);
    assert.equal(plan.group.cx,228);assert.equal(plan.group.ownerIds.length,12);
    assert.ok(plan.group.ownerIds.every(id=>f.records.get(id)?.meadowRegionVersion===1));
    const segment=f.world.createReefValleyRegionSegment(plan);assert.ok(segment.distanceM>=300&&segment.distanceM<=500);
    assert.deepEqual(f.world.planSeagrassMeadowEntry(),{kind:'keep'});
    const initial=structuredClone(f.ecology.agents),ids=new Set(initial.filter(a=>a.alive!==false).map(a=>a.id));
    f.animals.update(f.ecology.agents,0,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);
    same(new Set(f.animals.entities.keys()),ids,'native renderer follows actual saved alive animals');assert.ok(ids.size>0);
    f.ecology.step(.1,f.world.sim.environment);await f.ecology.checkpoint();
    const snapshots=new Map([...f.records].map(([id,row])=>[id,structuredClone(row)]));
    cold=fixture({records:f.records});assert.equal(await cold.world.enterSeagrassMeadowRegion(),true);await settle(cold);
    for(const[id,row]of snapshots)same(cold.records.get(id),row,'cold native entry retains complete record '+id);
    await release(cold);cold=null;
    assert.equal(f.world.beginDirectorMotion({kind:'reef-valley-route',routeId:'seagrass-meadow-region',durationSec:200}),true);
    const centres=new Set(),holds=[];let iterations=0;
    while(f.world.directorMotion.active&&iterations++<1800){
      const before=f.world.directorMotion.elapsedSec,p=f.world.oceanWorldPosition();
      f.world.updateDirectorMotion(1);
      if(f.world.directorMotion.waitingForRegions){assert.equal(f.world.directorMotion.elapsedSec,before);same(plain(f.world.oceanWorldPosition()),plain(p),'loading holds actual camera and shot clock');}
      assert.equal(f.world.directorMotion.error,null);
      const now=f.world.oceanWorldPosition(),key=`${Math.floor(now.x/64)},${Math.floor(now.z/64)}`;
      if(!ready(f)||!centres.has(key)){const at=performance.now();await f.ecology.update(now);f.chunks.update(now);holds.push((performance.now()-at)/1000);centres.add(key);bounds(f);}
      f.world.requestOceanEcology(now);await settle(f);
    }
    const shot=f.world.directorMotionSnapshot();assert.equal(shot.complete,true);assert.equal(shot.error,null);assert.equal(shot.elapsedSec,200);
    assert.ok(shot.travelledM>segment.distanceM*.96);assert.ok(centres.size>=6);
    await f.world.setPaused(true);const frozen=structuredClone(f.ecology.agents);nativeTick.call(f.world,1);same(f.ecology.agents,frozen,'native paused frame stops animals');
    const receipt={scope:'native CPU Three camera, model and saved history; GPU appearance not accepted',entrySeconds,plannedDistanceM:segment.distanceM,
      travelledM:shot.travelledM,centres:[...centres],maximumMeasuredWindowSeconds:Math.max(...holds),initialAliveAnimals:ids.size,
      initialSpecies:[...new Set(initial.filter(a=>a.alive!==false).map(a=>a.speciesId))],durationSec:shot.elapsedSec,
      routeExit:plan.group.routeExit,eastBoundaryPortConnected:plan.group.eastBoundaryPortConnected,oldHistoryPreserved:true};
    writeFileSync(new URL('../output/validation/seagrass-meadow-region-world.json',import.meta.url),JSON.stringify(receipt,null,2));t.diagnostic(JSON.stringify(receipt));
  }finally{if(cold)await release(cold);await release(f);}
});
