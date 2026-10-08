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
import { reefValleyRegionOrigin, REEF_VALLEY_REGION_ROUTE_STOPS } from '../src/reefValleyRegion.js';
import { COASTAL_SEASCAPE_ROUTE_STOPS } from '../src/livingCoastalSeascape.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

// Actual seeded ecology, durable source registry, native Three renderers and
// shipped camera methods. CPU evidence does not certify browser/GPU appearance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, 'shipped ' + name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE','clamp','normalizeOceanObservationView','oceanLayerHeight',
  'isDirectorPlaybackRate','createDirectorCameraMotion','sampleDirectorCameraMotion','advanceDirectorCameraElapsed',
  'createCoastalSeascapeMotion','sampleCoastalSeascapeMotion','coastalSeascapeWindowReady','reefValleyRegionOrigin',
  `return class {${['oceanWorldPosition','currentReefValleyRegionPlan','enterReefValleyRegion','createReefValleyRegionSegment',
    'sampleReefValleyRegionSegment','updateReefValleyRegionMotion','currentCoastalSeascapePlan','enterCoastalLifeBelt','enterLivingShallows',
    'prepareDirectorObservation','beginDirectorMotion','directorMotionQueries','updateDirectorMotion','directorMotionSnapshot',
    'setDirectorPlaybackRate','findAgent','restoreOceanObservation','setOceanRenderOrigin','oceanLayerY','floorY','habitatY',
    'clearCameraPosition','enforceCameraClearance','requestOceanEcology','setPaused','persistLivingWorld'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, isDirectorPlaybackRate,
  createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed,
  createCoastalSeascapeMotion, sampleCoastalSeascapeMotion, coastalSeascapeWindowReady, reefValleyRegionOrigin);
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
    livingBelt:true,shallowSeascape:true,coastalSeascape:true,reefValleyRegion,turtleGrazing:true,biodiversity:true,benthicLife:true,meadowLife:true,shoalLife:true});
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

test('ordinary reef valley publishes one complete durable group before native render and restores exact saved history',async t=>{
  const f=fixture(),resume=deferred();let cold;try{
    const reached=deferred();let groupCommits=0;
    f.store.beforeSave=async rows=>{if(groupCommits===0&&rows.length===12&&rows.every(([,row])=>row.reefValleyRegionVersion===1)){
      groupCommits++;reached.resolve();await resume.promise;}};
    const started=performance.now(),pending=f.world.enterReefValleyRegion();await reached.promise;
    assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);assert.equal(f.chunks.stats.activeChunks,0);
    assert.equal(f.world.currentReefValleyRegionPlan(),null);assert.ok(f.reads.includes('209,5'));
    resume.resolve();assert.equal(await pending,true);await settle(f);t.diagnostic(JSON.stringify({entryWallSeconds:(performance.now()-started)/1000,withinDirector45Seconds:(performance.now()-started)<45000}));assert.ok(groupCommits>=1);bounds(f);assert.ok(ready(f));
    const plan=f.world.currentReefValleyRegionPlan();assert.ok(plan&&plan.version===8);assert.equal(plan.group.ownerIds.length,12);
    assert.ok(plan.group.ownerIds.every(id=>f.records.get(id)?.reefValleyRegionVersion===1));
    const frame=f.world.sampleReefValleyRegionSegment(f.world.createReefValleyRegionSegment(plan),0,200);
    assert.ok(f.world.oceanWorldPosition().distanceTo(new THREE.Vector3(...Object.values(frame.position)))<1e-6);
    assert.ok(target(f.world).distanceTo(new THREE.Vector3(...Object.values(frame.target)))<1e-6);
    assert.equal(f.world.prepareDirectorObservation({routeId:'reef-valley-region'}),true);await settle(f);
    const initialIds=new Set(f.ecology.agents.filter(a=>a.alive!==false).map(a=>a.id));
    f.animals.update(f.ecology.agents,1e9,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);
    same(new Set(f.animals.entities.keys()),initialIds,'dispatcher only renders independently saved actual alive records');
    assert.ok(initialIds.size>0);assert.ok(f.chunks.stats.reefValleyOwners>0);
    f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;await f.ecology.checkpoint();
    const existing=new Map([...f.records].map(([id,row])=>[id,structuredClone(row)]));
    cold=fixture({records:f.records});const startedCold=performance.now();assert.equal(await cold.world.enterReefValleyRegion(),true);t.diagnostic(JSON.stringify({coldEntryWallSeconds:(performance.now()-startedCold)/1000}));await settle(cold);
    for(const[id,row]of existing)same(cold.records.get(id),row,'cold entry preserves every existing raw record '+id);
    assert.equal(cold.world.currentReefValleyRegionPlan().group.cx,plan.group.cx);assert.equal(cold.world.currentReefValleyRegionPlan().group.cz,plan.group.cz);bounds(cold);
    t.diagnostic('one native12-owner commit before public; current9/source<=25/animal<=20; cold records exact, one actual0.1s tick');
  }finally{resume.resolve();if(cold)await release(cold);await release(f);}
});

test('historical owners and missing complete history cannot refill or claim an empty continuous scene',async()=>{
  const old=fixture({reefValleyRegion:false});let enabled;try{
    const id='207,5';await old.ecology.update({x:207*64+32,z:5*64+1});old.ecology.agents;await old.ecology.checkpoint();
    const saved=structuredClone(old.records.get(id));assert.ok(saved&&!saved.reefValleyRegionVersion);
    enabled=fixture({records:old.records});assert.equal(await enabled.world.enterReefValleyRegion(),false);await settle(enabled);
    same(enabled.records.get(id),saved,'existing owner cannot be reshaped or repopulated');
    assert.ok(![...enabled.records.values()].some(r=>r.reefValleyRegionVersion===1));assert.equal(enabled.world.currentReefValleyRegionPlan(),null);
    const position=enabled.world.oceanWorldPosition(),aim=target(enabled.world);
    assert.equal(enabled.world.prepareDirectorObservation({routeId:'reef-valley-region'}),false);
    assert.equal(enabled.world.beginDirectorMotion({routeId:'reef-valley-region',kind:'reef-valley-route',durationSec:800,groups:4}),false);
    same(enabled.world.oceanWorldPosition(),position,'no empty proxy camera');same(target(enabled.world),aim,'no empty proxy aim');
    enabled.world.oceanEcologyResetting=true;assert.equal(enabled.world.currentReefValleyRegionPlan(),null);
  }finally{if(enabled)await release(enabled);await release(old);}
});

test('native pending entry cannot overwrite manual controls and the same shipped late guards reject other takeovers',async()=>{
  const f=fixture();try{
    const blocked=deferred(),resume=deferred();let first=true;
    f.store.beforeRead=async()=>{if(first){first=false;blocked.resolve();await resume.promise;}};
    const pending=f.world.enterReefValleyRegion();await blocked.promise;f.world.controlStartCount++;f.world.camera.position.x+=1.25;
    const position=f.world.oceanWorldPosition(),aim=target(f.world),count=f.views.length;resume.resolve();assert.equal(await pending,false);await settle(f);
    same(f.world.oceanWorldPosition(),position,'no late camera takeover');same(target(f.world),aim,'no late target takeover');assert.equal(f.views.length,count);
    // The second native window must also respect a stopped director token.
    const second=fixture(),atSecond=deferred(),allowSecond=deferred();let valid=true;
    try{const update=second.ecology.update.bind(second.ecology);second.ecology.update=async p=>{
      if(Math.floor(p.x/64)===204){atSecond.resolve();await allowSecond.promise;}return update(p);};
      const late=second.world.enterReefValleyRegion({isCurrent:()=>valid});await atSecond.promise;valid=false;
      second.world.controls.target.z+=1;const p=second.world.oceanWorldPosition(),a=target(second.world),count=second.views.length;
      allowSecond.resolve();assert.equal(await late,false);await settle(second);
      same(second.world.oceanWorldPosition(),p,'stopped second-window director preserves current camera');
      same(target(second.world),a,'stopped second-window director preserves current target');assert.equal(second.views.length,count);
    }finally{allowSecond.resolve();await release(second);}
    const actualUpdate=f.ecology.update,request=f.world.requestOceanEcology;f.world.requestOceanEcology=()=>{};
    for(const change of[w=>w.camera.position.x+=2,w=>w.controls.target.z+=2,w=>w.sim.seed='other',w=>w.keys.add('KeyW'),
      w=>w.oceanEcologyResetting=true,w=>w.disposed=true,w=>w.directorMotion={},w=>w.directorEntry={active:true},w=>w._shallowSceneEntryToken++]){
      let done;f.ecology.update=()=>new Promise(yes=>{done=yes;});f.world.disposed=false;f.world.oceanEcologyResetting=false;
      f.world.sim.seed=livingShallowsSeed('42');f.world.directorMotion=null;f.world.directorEntry=null;f.world.keys.clear();
      const late=f.world.enterReefValleyRegion();change(f.world);const p=f.world.oceanWorldPosition(),a=target(f.world),n=f.views.length;done(true);
      assert.equal(await late,false);same(f.world.oceanWorldPosition(),p,'guarded current camera');same(target(f.world),a,'guarded current aim');assert.equal(f.views.length,n);
    }f.ecology.update=actualUpdate;f.world.requestOceanEcology=request;
  }finally{await release(f);}
});

test('unreadable owner or refused atomic save stays private and a failed pause save still freezes immediately',async()=>{
  for(const failure of['undefined','save']){const f=fixture();try{
    if(failure==='undefined')f.store.undefinedId='209,5';else f.store.rejectSave=true;
    let result;try{result=await f.world.enterReefValleyRegion();}catch(error){assert.match(error.message,/read|saved|save|owner|coastal|record/i);}
    assert.notEqual(result,true);await settle(f);assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);
    assert.equal(f.chunks.stats.activeChunks,0);assert.equal(f.world.currentReefValleyRegionPlan(),null);
  }finally{await release(f);}}
  const f=fixture();try{
    assert.equal(await f.world.enterReefValleyRegion(),true);await settle(f);assert.equal(f.world.beginDirectorMotion({routeId:'reef-valley-region',kind:'reef-valley-route',durationSec:800,groups:4}),true);
    f.store.rejectSave=true;await assert.rejects(()=>f.world.setPaused(true),/暂停已生效/);assert.equal(f.world.paused,true);
    const p=f.world.oceanWorldPosition();f.world.updateDirectorMotion(10);same(f.world.oceanWorldPosition(),p,'pause remains effective after save failure');assert.equal(f.world.directorMotion.elapsedSec,0);
    f.store.rejectSave=false;await f.world.setPaused(false);
    const initialCentre=`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;
    for(let i=0;i<45;i++){f.world.updateDirectorMotion(1);const now=f.world.oceanWorldPosition();if(`${Math.floor(now.x/64)},${Math.floor(now.z/64)}`!==initialCentre)break;}
    const current=f.world.oceanWorldPosition(),cx=Math.floor(current.x/64),cz=Math.floor(current.z/64);
    assert.notEqual(`${cx},${cz}`,initialCentre,'native shot first moves into a resident adjacent centre');
    const unreadable=[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>`${cx+dx},${cz+dz}`)).find(id=>!f.ecology._active.has(id));assert.ok(unreadable);
    f.store.undefinedId=unreadable;const seconds=f.world.directorMotion.elapsedSec;
    f.chunks.update(current);f.world.requestOceanEcology(current);await settle(f);
    assert.ok(f.world.directorMotion.error,'actual current-window refusal terminates the shot instead of waiting forever');
    assert.equal(f.world.directorMotion.active,false);assert.equal(f.world.directorMotion.elapsedSec,seconds);
    same(f.world.oceanWorldPosition(),current,'failed current-window loading keeps the actual camera');
    assert.equal(f.world.oceanEcologyCenter,null);assert.ok(f.world.oceanEcologyRetryAt>=f.world.elapsed+2);
    f.world.updateDirectorMotion(20);same(f.world.oceanWorldPosition(),current,'errored camera cannot continue');assert.equal(f.world.directorMotion.elapsedSec,seconds);
  }finally{await release(f);}
});

function actualBoxes(f){
  const w=f.world;f.chunks.root.updateMatrixWorld(true);f.animals.root.updateMatrixWorld(true);w.camera.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(w.camera.projectionMatrix,w.camera.matrixWorldInverse));
  const whole={rock:0,coral:0,seagrass:0,animal:0},intersection={...whole};
  const count=(kind,box)=>{if(box.isEmpty()||box.getCenter(new THREE.Vector3()).distanceTo(w.camera.position)>=30)return;
    if(frustum.intersectsBox(box))intersection[kind]++;let full=true;
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])full&&=frustum.containsPoint(new THREE.Vector3(x,y,z));
    if(full)whole[kind]++;};
  for(const r of f.chunks._chunks.values())for(const mesh of r.instances){const kind=mesh.userData.landscapeKind;
    if(!['rock','coral','seagrass'].includes(kind))continue;
    for(let i=0;i<mesh.count;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);
      count(kind,mesh.geometry.boundingBox.clone().applyMatrix4(m));}}
  for(const entity of f.animals.entities.values())count('animal',new THREE.Box3().setFromObject(entity.object));
  return{wholeSourceBoxes:whole,intersectingSourceBoxes:intersection,actualAnimalIds:[...f.animals.entities.keys()]};
}

test('full800s actual camera lazily crosses four committed regions with honest window waits native pause rate rebase and frozen unloaded owners',async t=>{
  const f=fixture();try{
    const entryStart=performance.now();assert.equal(await f.world.enterReefValleyRegion(),true);await settle(f);
    const entryWallSeconds=(performance.now()-entryStart)/1000;
    assert.equal(f.world.beginDirectorMotion({routeId:'reef-valley-region',kind:'reef-valley-route',groups:4,durationSec:800}),true);
    const plan=f.world.currentReefValleyRegionPlan(),initialIds=plan.group.ownerIds;
    const paths=new Map(initialIds.map(id=>[id,JSON.stringify(f.records.get(id).livingRidgePlan)]));
    assert.equal(f.world.directorMotion.reefValleySegments.length,1,'only currently committed group is prepared');
    await f.world.setPaused(true);const paused=f.world.oceanWorldPosition();f.world.updateDirectorMotion(10);
    same(f.world.oceanWorldPosition(),paused,'paused actual camera');assert.equal(f.world.directorMotion.elapsedSec,0);await f.world.setPaused(false);
    assert.equal(f.world.setDirectorPlaybackRate(2),true);f.world.updateDirectorMotion(1);assert.equal(f.world.directorMotion.elapsedSec,2);
    assert.equal(f.world.setDirectorPlaybackRate(1),true);assert.equal(f.world.setDirectorPlaybackRate(0),false);
    let holds=0,rebases=0,movedFrames=0,nextSample=0,maximumLoadWallSec=0;
    const centres=new Set(),tickOwners=new Set(),samples=[],loadTimes=[];
    for(let attempt=0;attempt<1100&&!f.world.directorMotion.complete;attempt++){
      const before=f.world.oceanWorldPosition(),seconds=f.world.directorMotion.elapsedSec;
      f.world.updateDirectorMotion(1);const now=f.world.oceanWorldPosition(),motion=f.world.directorMotion;
      if(motion.error){
        const index=Math.min(3,Math.floor((seconds+1)/200)),segment=motion.reefValleySegments[index];
        const frame=segment?f.world.sampleReefValleyRegionSegment(segment,seconds+1-index*200,200):null,p=frame?.position??now;
        const diagnostic={error:motion.error,seconds,before:plain(before),expected:frame,groupIds:motion.reefValleySegments.map(s=>s.groupId),
          expectedOwner:`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`,floorY:f.world.floorY(p.x,p.z),habitatY:f.world.habitatY(p.x,p.z),
          expectedBedY:p.y-2,publicOwnerIds:f.generator.registryStats().ids,
          currentPlanVersion:f.generator.getRidgePlan(`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`)?.version,
          currentPlanGroupId:f.generator.getRidgePlan(`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`)?.group?.id,
          generatorHeightForCamera:f.generator.heightForCamera(p.x,p.z),
          sceneSupport:f.ecology.sceneSupportHeight?.(p.x,p.z,true),habitatSceneSupport:f.ecology.habitatSceneSupportHeight?.(p.x,p.z,true),
          macroLandscapeSupport:f.ecology.macroLandscapeSupportHeight?.(p.x,p.z,true),biodiversitySupport:f.ecology.biodiversitySupportHeight?.(p.x,p.z),
          nearbySourceElements:[...f.chunks._chunks.values()].flatMap(r=>r.sourceChunk.elements).filter(e=>Math.hypot(e.x-p.x,e.z-p.z)<12)
            .slice(0,12).map(e=>({id:e.id,kind:e.kind,x:e.x,y:e.y,z:e.z,scale:e.scale,rotation:e.rotation}))};
        writeFileSync('output/validation/reef-valley-region-world-path-failure.json',JSON.stringify(diagnostic,null,2)+'\n');
        t.diagnostic(JSON.stringify(diagnostic));
      }
      assert.equal(motion.error,null,'actual connected path remains physically passable');
      if(motion.waitingForRegions){holds++;same(now,before,'loading holds camera');assert.equal(motion.elapsedSec,seconds,'no loading observation clock');}
      else if(motion.elapsedSec!==seconds){movedFrames++;assert.ok(now.distanceTo(before)<3,'continuous metre travel, no scene cut');
        const index=Math.min(3,Math.floor(motion.elapsedSec/200));
        const expected=f.world.sampleReefValleyRegionSegment(motion.reefValleySegments[index],motion.elapsedSec-index*200,200);
        assert.ok(now.distanceTo(new THREE.Vector3(expected.position.x,expected.position.y,expected.position.z))<1e-6);}
      const centre=`${Math.floor(now.x/64)},${Math.floor(now.z/64)}`;centres.add(centre);
      f.chunks.update(now);const start=performance.now();f.world.requestOceanEcology(now);
      if(!ready(f)){const p=f.world.oceanWorldPosition(),clock=motion.elapsedSec;f.world.updateDirectorMotion(10);
        assert.equal(motion.waitingForRegions,true);same(f.world.oceanWorldPosition(),p,'genuine pending current-window hold');assert.equal(motion.elapsedSec,clock);holds++;}
      await settle(f);const wall=(performance.now()-start)/1000;
      if(wall>.05){loadTimes.push({centre,wallSeconds:wall});maximumLoadWallSec=Math.max(maximumLoadWallSec,wall);}
      bounds(f);assert.ok(ready(f));
      // A finite ecology probe is separate from the complete camera clock.
      if(centres.size<=3&&!tickOwners.has(centre)){tickOwners.add(centre);f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;}
      const agents=f.ecology.agents;f.animals.update(agents,1e9,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);
      same(new Set(f.animals.entities.keys()),new Set(agents.filter(a=>a.alive!==false&&f.animals.catalog.has(a.speciesId)).map(a=>a.id)),
        'each displayed animal is a real independently saved record');
      if(motion.travelledM>=nextSample||motion.complete){samples.push({cameraSeconds:motion.elapsedSec,travelledM:motion.travelledM,
        position:plain(now),...actualBoxes(f)});nextSample=motion.travelledM+60;}
      if(Math.abs(f.world.camera.position.x)>256||Math.abs(f.world.camera.position.z)>256){const p=f.world.oceanWorldPosition(),a=target(f.world);
        f.world.setOceanRenderOrigin(Math.round(p.x/64)*64,Math.round(p.z/64)*64);
        same(f.world.oceanWorldPosition(),p,'rebase world position');same(target(f.world),a,'rebase world target');rebases++;}
    }
    const snap=f.world.directorMotionSnapshot();assert.equal(snap.complete,true);assert.equal(snap.active,false);assert.equal(snap.error,null);
    assert.equal(snap.elapsedSec,800);assert.equal(snap.scope,'committed-continuous-reef-valley-regions');assert.equal(snap.observationRoute.groupIds.length,4);
    assert.deepEqual(f.world.directorMotion.reefValleySegments.map(s=>[s.cx,s.cz]),[[204,4],[210,4],[216,4],[222,4]]);
    assert.ok(snap.distanceM>=1500&&snap.distanceM<=2000);assert.ok(snap.travelledM>snap.distanceM-30&&snap.travelledM<=snap.distanceM+1e-5);
    assert.ok(holds>0&&rebases>0&&movedFrames>700&&centres.size>=20);assert.ok(samples.length>=25);
    const end=f.world.directorMotion.reefValleySegments.at(-1).points.at(-1);
    assert.ok(f.world.oceanWorldPosition().distanceTo(new THREE.Vector3(end.x,end.y,end.z))<1e-6);
    for(const[id,stamp]of paths)assert.equal(JSON.stringify(f.records.get(id).livingRidgePlan),stamp,'durable scenery remains exact');
    const unloaded=initialIds.find(id=>!f.ecology._active.has(id));assert.ok(unloaded);const frozen=structuredClone(f.records.get(unloaded));
    f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;await f.ecology.checkpoint();same(f.records.get(unloaded),frozen,'unloaded raw body food time remains frozen');
    const whole={rock:0,coral:0,seagrass:0,animal:0},intersection={...whole};let longestEmptySampleSpanM=0,emptyStart=null;
    for(const s of samples){for(const k of Object.keys(whole)){whole[k]+=s.wholeSourceBoxes[k];intersection[k]+=s.intersectingSourceBoxes[k];}
      const empty=Object.values(s.intersectingSourceBoxes).every(n=>n===0);if(empty&&emptyStart===null)emptyStart=s.travelledM;
      if(!empty&&emptyStart!==null){longestEmptySampleSpanM=Math.max(longestEmptySampleSpanM,s.travelledM-emptyStart);emptyStart=null;}}
    if(emptyStart!==null)longestEmptySampleSpanM=Math.max(longestEmptySampleSpanM,snap.travelledM-emptyStart);
    const receipt={cameraSeconds:800,pathM:snap.distanceM,travelledM:snap.travelledM,mainRouteGroupIds:snap.observationRoute.groupIds,
      allOrdinaryBornGroupIds:[...new Set([...f.records.values()].filter(r=>r.reefValleyRegionVersion===1).map(r=>r.reefValleyRegionGroupId))],
      visitedCentres:[...centres],holds,rebases,entryWallSeconds,loadTimes,maximumLoadWallSec,
      withinDirector45Seconds:Math.max(entryWallSeconds,maximumLoadWallSec)<45,
      ecologicalCentres:[...tickOwners],ecologicalTickPerCentreSec:.1,finalTickSec:.1,sampleSpacingApproxM:60,samples,whole,intersection,longestEmptySampleSpanM,
      scope:'800s native moving camera, few actual0.1s ecological ticks, unloaded owners frozen; CPU boxes within30m, no occlusion or GPU appearance proof'};
    writeFileSync(process.env.REEF_VALLEY_WORLD_RECEIPT??'output/validation/reef-valley-region-world-native.json',JSON.stringify(receipt,null,2)+'\n');
    t.diagnostic(JSON.stringify({...receipt,samples:undefined}));
  }finally{await release(f);}
});

test('new native route preparation uses current durable geometry and absent neighbour stops without an invented cut',async t=>{
  assert.deepEqual(REEF_VALLEY_REGION_ROUTE_STOPS.map(s=>s.id),['reef-valley-region']);assert.ok(source.includes('reefValleyRegion:this.isLivingShallows'));
  const f=fixture();try{
    const start=performance.now();assert.equal(await f.world.enterReefValleyRegion(),true);await settle(f);
    t.diagnostic(JSON.stringify({entryWallSeconds:(performance.now()-start)/1000}));
    const plan=f.world.currentReefValleyRegionPlan();assert.equal(f.world.prepareDirectorObservation({routeId:'reef-valley-region'}),true);await settle(f);
    const p=f.world.oceanWorldPosition(),a=target(f.world);assert.equal(f.world.prepareDirectorObservation({routeId:'reef-valley-region'}),true);await settle(f);
    same(f.world.oceanWorldPosition(),p,'repeat current committed start');same(target(f.world),a,'repeat current real heading');
    assert.equal(f.world.beginDirectorMotion({routeId:'reef-valley-region',kind:'reef-valley-route',groups:4,durationSec:800}),true);
    assert.equal(f.generator.getRidgePlan('210,4'),undefined,'the future adjacent group is not publicly exposed at entry');
    f.world.directorMotion.elapsedSec=199;const before=f.world.oceanWorldPosition();f.world.updateDirectorMotion(1);
    assert.match(f.world.directorMotion.error,/相邻/);assert.equal(f.world.directorMotion.active,false);assert.equal(f.world.directorMotion.elapsedSec,199);
    same(f.world.oceanWorldPosition(),before,'missing durable neighbour cannot move camera');f.world.directorMotion=null;
    const segment=f.world.createReefValleyRegionSegment(plan);assert.throws(()=>f.world.sampleReefValleyRegionSegment(segment,NaN,200),/有限/);
    assert.throws(()=>f.world.createReefValleyRegionSegment({...plan,version:7}),/路径/);
    assert.equal(await f.world.enterReefValleyRegion({isCurrent:()=>false}),false,'stopped director cannot start takeover');
  }finally{await release(f);}
});
