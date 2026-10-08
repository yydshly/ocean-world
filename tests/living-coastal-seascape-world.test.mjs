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
import { COASTAL_SEASCAPE_ROUTE_STOPS } from '../src/livingCoastalSeascape.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';

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
  'createCoastalSeascapeMotion','sampleCoastalSeascapeMotion','coastalSeascapeWindowReady',
  `return class {${['oceanWorldPosition','currentCoastalSeascapePlan','enterCoastalLifeBelt','enterLivingShallows',
    'prepareDirectorObservation','beginDirectorMotion','directorMotionQueries','updateDirectorMotion','directorMotionSnapshot',
    'setDirectorPlaybackRate','findAgent','restoreOceanObservation','setOceanRenderOrigin','oceanLayerY','floorY','habitatY',
    'clearCameraPosition','enforceCameraClearance','requestOceanEcology','setPaused','persistLivingWorld'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, isDirectorPlaybackRate,
  createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed,
  createCoastalSeascapeMotion, sampleCoastalSeascapeMotion, coastalSeascapeWindowReady);
const same = (a,b,label) => assert.ok(isDeepStrictEqual(a,b),label);
const plain = v => ({x:v.x,y:v.y,z:v.z});
const target = w => w.controls.target.clone().add(new THREE.Vector3(w.oceanRenderOrigin.x,0,w.oceanRenderOrigin.z));
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject}; }
function fixture({records=new Map(),coastalSeascape=true}={}) {
  const seed=livingShallowsSeed('42'),chunks=new OceanChunks(seed,{livingGeology:true}),generator=chunks.generator;
  const commits=[],reads=[],requests=[],updates=[],views=[],store={available:true,beforeRead:null,beforeSave:null,rejectSave:false,undefinedId:null,
    async load(_world,id){reads.push(id);if(this.beforeRead)await this.beforeRead(id);if(this.undefinedId===id)return undefined;return structuredClone(records.get(id)??null);},
    async saveMany(_world,rows){if(this.beforeSave)await this.beforeSave(rows);if(this.rejectSave)throw new Error('native atomic save refused');
      commits.push(rows.map(([id,row])=>({id,version:row.livingRidgePlan?.version,coastal:row.coastalSeascapeVersion})));
      for(const[id,row]of rows)records.set(id,structuredClone(row));}
  };
  const ecology=new OceanEcology(seed,generator,{store,turtles:true,livingGeology:true,habitatMosaic:true,seabedRelief:true,seascape:true,
    livingBelt:true,shallowSeascape:true,coastalSeascape,turtleGrazing:true,biodiversity:true,benthicLife:true,meadowLife:true,shoalLife:true});
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
  const stop=generator.routeStops.find(s=>s.id==='coastal-life-belt');assert.ok(stop);
  return{world,chunks,generator,ecology,animals,store,records,commits,reads,requests,updates,views,stop};
}
async function settle(f) {await f.ecology._pending;await nextTurn();f.chunks.update(f.world.oceanWorldPosition());}
async function release(f) {f.world.disposed=true;f.store.beforeRead=null;f.store.beforeSave=null;f.store.rejectSave=false;
  await f.ecology._pending?.catch(()=>{});f.animals.dispose();await f.ecology.dispose();f.chunks.dispose();f.generator.clearCache?.();}
function ready(f) {return coastalSeascapeWindowReady(f.world.oceanWorldPosition(),{loadedOwnerIds:f.chunks.stats.loadedChunks,activeOwnerIds:[...f.ecology._active.keys()]});}
function bounds(f) {assert.equal(f.ecology._active.size,9);assert.equal(f.chunks.stats.activeChunks,9);assert.ok(f.chunks.stats.ridgeReadyOwners<=25);
  assert.ok([...f.ecology._active.values()].every(r=>r.agents.length+(r.turtleAgents?.length??0)<=20));}

test('ordinary continuous belt publishes one complete durable group before native render and restores exact saved history',async t=>{
  const f=fixture(),resume=deferred();let cold;try{
    const reached=deferred();let groupCommits=0;
    f.store.beforeSave=async rows=>{if(rows.length===12&&rows.every(([,row])=>row.coastalSeascapeVersion===1)){
      groupCommits++;reached.resolve();await resume.promise;}};
    const pending=f.world.enterCoastalLifeBelt();await reached.promise;
    assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);assert.equal(f.chunks.stats.activeChunks,0);
    assert.equal(f.world.currentCoastalSeascapePlan(),null);assert.ok(f.reads.includes('155,5'));
    resume.resolve();assert.equal(await pending,true);await settle(f);assert.equal(groupCommits,1);bounds(f);assert.ok(ready(f));
    const plan=f.world.currentCoastalSeascapePlan();assert.ok(plan&&plan.version===7);assert.equal(plan.group.ownerIds.length,12);
    assert.ok(plan.group.ownerIds.every(id=>f.records.get(id)?.coastalSeascapeVersion===1));
    const frame=sampleCoastalSeascapeMotion(createCoastalSeascapeMotion(plan),0);
    assert.ok(f.world.oceanWorldPosition().distanceTo(new THREE.Vector3(...Object.values(frame.position)))<1e-6);
    assert.ok(target(f.world).distanceTo(new THREE.Vector3(...Object.values(frame.target)))<1e-6);
    assert.equal(f.world.prepareDirectorObservation({routeId:'coastal-life-belt'}),true);await settle(f);
    const initialIds=new Set(f.ecology.agents.filter(a=>a.alive!==false).map(a=>a.id));
    f.animals.update(f.ecology.agents,1e9,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);
    same(new Set(f.animals.entities.keys()),initialIds,'dispatcher only renders independently saved actual alive records');
    assert.ok(initialIds.size>0);assert.ok(f.chunks.stats.coastalSeascapeOwners>0);
    f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;await f.ecology.checkpoint();
    const existing=new Map([...f.records].map(([id,row])=>[id,structuredClone(row)]));
    cold=fixture({records:f.records});assert.equal(await cold.world.enterCoastalLifeBelt(),true);await settle(cold);
    for(const[id,row]of existing)same(cold.records.get(id),row,'cold entry preserves every existing raw record '+id);
    assert.equal(cold.world.currentCoastalSeascapePlan().group.cx,plan.group.cx);assert.equal(cold.world.currentCoastalSeascapePlan().group.cz,plan.group.cz);bounds(cold);
    t.diagnostic('one native12-owner commit before public; current9/source<=25/animal<=20; cold records exact, one actual0.1s tick');
  }finally{resume.resolve();if(cold)await release(cold);await release(f);}
});

test('historical owners and missing complete history cannot refill or claim an empty continuous scene',async()=>{
  const old=fixture({coastalSeascape:false});let enabled;try{
    const id='150,4';await old.ecology.update({x:old.stop.x,z:old.stop.z});old.ecology.agents;await old.ecology.checkpoint();
    const saved=structuredClone(old.records.get(id));assert.ok(saved&&!saved.coastalSeascapeVersion);
    enabled=fixture({records:old.records});assert.equal(await enabled.world.enterCoastalLifeBelt(),false);await settle(enabled);
    same(enabled.records.get(id),saved,'existing owner cannot be reshaped or repopulated');
    assert.ok(![...enabled.records.values()].some(r=>r.coastalSeascapeVersion===1));assert.equal(enabled.world.currentCoastalSeascapePlan(),null);
    const position=enabled.world.oceanWorldPosition(),aim=target(enabled.world);
    assert.equal(enabled.world.prepareDirectorObservation({routeId:'coastal-life-belt'}),false);
    assert.equal(enabled.world.beginDirectorMotion({routeId:'coastal-life-belt',kind:'coastal-route',durationSec:200}),false);
    same(enabled.world.oceanWorldPosition(),position,'no empty proxy camera');same(target(enabled.world),aim,'no empty proxy aim');
    enabled.world.oceanEcologyResetting=true;assert.equal(enabled.world.currentCoastalSeascapePlan(),null);
  }finally{if(enabled)await release(enabled);await release(old);}
});

test('native pending entry cannot overwrite manual controls and the same shipped late guards reject other takeovers',async()=>{
  const f=fixture();try{
    const blocked=deferred(),resume=deferred();let first=true;
    f.store.beforeRead=async()=>{if(first){first=false;blocked.resolve();await resume.promise;}};
    const pending=f.world.enterCoastalLifeBelt();await blocked.promise;f.world.controlStartCount++;f.world.camera.position.x+=1.25;
    const position=f.world.oceanWorldPosition(),aim=target(f.world),count=f.views.length;resume.resolve();assert.equal(await pending,false);await settle(f);
    same(f.world.oceanWorldPosition(),position,'no late camera takeover');same(target(f.world),aim,'no late target takeover');assert.equal(f.views.length,count);
    const actualUpdate=f.ecology.update,request=f.world.requestOceanEcology;f.world.requestOceanEcology=()=>{};
    for(const change of[w=>w.camera.position.x+=2,w=>w.controls.target.z+=2,w=>w.sim.seed='other',w=>w.keys.add('KeyW'),
      w=>w.oceanEcologyResetting=true,w=>w.disposed=true,w=>w.directorMotion={},w=>w.directorEntry={active:true},w=>w._shallowSceneEntryToken++]){
      let done;f.ecology.update=()=>new Promise(yes=>{done=yes;});f.world.disposed=false;f.world.oceanEcologyResetting=false;
      f.world.sim.seed=livingShallowsSeed('42');f.world.directorMotion=null;f.world.directorEntry=null;f.world.keys.clear();
      const late=f.world.enterCoastalLifeBelt();change(f.world);const p=f.world.oceanWorldPosition(),a=target(f.world),n=f.views.length;done(true);
      assert.equal(await late,false);same(f.world.oceanWorldPosition(),p,'guarded current camera');same(target(f.world),a,'guarded current aim');assert.equal(f.views.length,n);
    }f.ecology.update=actualUpdate;f.world.requestOceanEcology=request;
  }finally{await release(f);}
});

test('unreadable owner or refused atomic save stays private and a failed pause save still freezes immediately',async()=>{
  for(const failure of['undefined','save']){const f=fixture();try{
    if(failure==='undefined')f.store.undefinedId='155,5';else f.store.rejectSave=true;
    let result;try{result=await f.world.enterCoastalLifeBelt();}catch(error){assert.match(error.message,/read|saved|save|owner|coastal|record/i);}
    assert.notEqual(result,true);await settle(f);assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);
    assert.equal(f.chunks.stats.activeChunks,0);assert.equal(f.world.currentCoastalSeascapePlan(),null);
  }finally{await release(f);}}
  const f=fixture();try{
    assert.equal(await f.world.enterCoastalLifeBelt(),true);await settle(f);assert.equal(f.world.beginDirectorMotion({routeId:'coastal-life-belt',kind:'coastal-route',durationSec:200}),true);
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

test('full200s camera follows actual401m path with current-window loading holds pause rate rebase and frozen unloaded ecology',async t=>{
  const f=fixture();try{
    assert.equal(await f.world.enterCoastalLifeBelt(),true);await settle(f);
    assert.equal(f.world.beginDirectorMotion({routeId:'coastal-life-belt',kind:'coastal-route',durationSec:200}),true);
    const shot=f.world.directorMotion.shot,sourcePaths=new Map([...f.records].filter(([,r])=>r.coastalSeascapeVersion===1).map(([id,r])=>[id,JSON.stringify(r.livingRidgePlan)]));
    assert.equal(await f.world.setPaused(true),true);const paused=f.world.oceanWorldPosition();f.world.updateDirectorMotion(10);
    same(f.world.oceanWorldPosition(),paused,'paused camera exact');assert.equal(f.world.directorMotion.elapsedSec,0);await f.world.setPaused(false);
    assert.equal(f.world.setDirectorPlaybackRate(2),true);f.world.updateDirectorMotion(1);assert.equal(f.world.directorMotion.elapsedSec,2);
    assert.equal(f.world.setDirectorPlaybackRate(1),true);assert.equal(f.world.setDirectorPlaybackRate(0),false);
    let held=false,holds=0,rebase=0,movedFrames=0;const visited=new Set(),tickOwners=new Set();
    for(let attempts=0;attempts<240&&!f.world.directorMotion.complete;attempts++){
      const before=f.world.oceanWorldPosition(),priorSec=f.world.directorMotion.elapsedSec;
      f.world.updateDirectorMotion(1);const now=f.world.oceanWorldPosition(),m=f.world.directorMotion;
      assert.equal(m.error,null,'actual committed camera path remains passable');
      if(m.waitingForRegions){holds++;same(now,before,'loading holds actual camera');assert.equal(m.elapsedSec,priorSec,'loading adds no observation seconds');}
      else if(m.elapsedSec!==priorSec){movedFrames++;assert.ok(now.distanceTo(before)<3,'continuous metre movement, no scene cut');
        const expected=sampleCoastalSeascapeMotion(shot,m.elapsedSec);assert.ok(now.distanceTo(new THREE.Vector3(expected.position.x,expected.position.y,expected.position.z))<1e-6);}
      const id=`${Math.floor(now.x/64)},${Math.floor(now.z/64)}`;visited.add(id);
      // The shipped ordinary frame requests only its current camera centre.
      f.chunks.update(now);f.world.requestOceanEcology(now);
      if(!held&&m.elapsedSec>15&&f.ecology._pending){
        // A pending native load may already have started. Hold the next actual
        // current-centre read, rather than pre-requesting a future centre.
        const waiting=deferred();let stopped=false;f.store.beforeRead=async()=>{stopped=true;await waiting.promise;};
        if(!ready(f)){await nextTurn();const p=f.world.oceanWorldPosition(),seconds=m.elapsedSec;f.world.updateDirectorMotion(10);
          same(f.world.oceanWorldPosition(),p,'native current window wait');assert.equal(m.elapsedSec,seconds);assert.equal(m.waitingForRegions,true);holds++;held=true;}
        waiting.resolve();f.store.beforeRead=null;
      }
      await settle(f);bounds(f);assert.ok(ready(f));
      if(visited.size<=3&&!tickOwners.has(id)){tickOwners.add(id);f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;}
      if(Math.abs(f.world.camera.position.x)>256||Math.abs(f.world.camera.position.z)>256){const p=f.world.oceanWorldPosition(),a=target(f.world);
        f.world.setOceanRenderOrigin(Math.round(p.x/64)*64,Math.round(p.z/64)*64);same(f.world.oceanWorldPosition(),p,'rebase preserves actual position');same(target(f.world),a,'rebase preserves actual aim');rebase++;}
    }
    const snap=f.world.directorMotionSnapshot();assert.equal(snap.complete,true);assert.equal(snap.active,false);assert.equal(snap.elapsedSec,200);
    assert.equal(snap.scope,'committed-continuous-habitat-belt');assert.equal(snap.error,null);assert.ok(snap.travelledM>390&&snap.travelledM<=shot.distanceM+1e-5);
    assert.ok(visited.size>=6&&rebase>0&&movedFrames>100);assert.ok(held||holds>0,'at least one genuine cross-centre current-window hold');
    const end=sampleCoastalSeascapeMotion(shot,200);assert.ok(f.world.oceanWorldPosition().distanceTo(new THREE.Vector3(end.position.x,end.position.y,end.position.z))<1e-6);
    for(const[id,stamp]of sourcePaths)assert.equal(JSON.stringify(f.records.get(id).livingRidgePlan),stamp,'path/scenery cannot change during observation');
    const unloaded=[...sourcePaths.keys()].find(id=>!f.ecology._active.has(id));assert.ok(unloaded);const frozen=structuredClone(f.records.get(unloaded));
    f.ecology.step(.1,f.world.sim.environment);f.ecology.agents;await f.ecology.checkpoint();same(f.records.get(unloaded),frozen,'unloaded owner native time and raw state frozen');
    t.diagnostic(JSON.stringify({cameraSeconds:200,pathM:shot.distanceM,travelledM:snap.travelledM,visitedOwners:[...visited],holds,rebase,
      ecologicalTicksPerVisitedCentre:1,ecologicalCentres:[...tickOwners],scope:'few actual0.1s native ticks; camera200s is not all-owner ecology200s; unloaded owners frozen'}));
  }finally{await release(f);}
});

test('ordinary URL and director use the same native route with guarded asynchronous completion',async()=>{
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8'),hook=readFileSync(new URL('../src/useDirectorTour.js',import.meta.url),'utf8');
  assert.ok(source.includes('coastalSeascape:this.isLivingShallows'));assert.match(app,/get\('demo'\)==='coastal-life-belt'[\s\S]{0,220}coastalLifeBeltEntry:true/);
  assert.ok(hook.includes("['coastal-life-belt', 'living-visual'"));assert.deepEqual(COASTAL_SEASCAPE_ROUTE_STOPS.map(s=>s.id),['coastal-life-belt']);
  const entry=DEMO_LIVING_STOPS.find(s=>s.id==='coastal-life-belt'),chapter=DIRECTOR_STEPS.find(s=>s.action.stopId==='coastal-life-belt');
  assert.ok(entry&&chapter);assert.equal(entry.action.coastalLifeBeltEntry,true);assert.equal(chapter.motion.routeId,'coastal-life-belt');
  assert.equal(chapter.motion.kind,'coastal-route');assert.equal(chapter.durationMs,200000);assert.equal(DIRECTOR_STEPS.find(s=>s.id===chapter.id),chapter);
  const start=app.indexOf('    if(choice.coastalLifeBeltEntry&&choice.directorToken===undefined)'),end=app.indexOf('    if(choice.biodiversityEntry',start);
  assert.ok(start>=0&&end>start);const branch=`return function(choice){${app.slice(start,end)}}`;
  const f=fixture();try{
    const receipts=[],current={current:f.world};const invoke=new Function('world','setView','setOceanToolsOpen','setPanel','rememberOcean','setToast',branch)(
      current,()=>{},()=>{},()=>{},()=>receipts.push('remembered'),text=>receipts.push(text));
    invoke(entry.action);await settle(f);assert.deepEqual(receipts,['remembered']);assert.ok(f.world.currentCoastalSeascapePlan());
    // The director generic stop dispatch enters the same geographic owner;
    // its real preparation subsequently places the exact durable path start.
    assert.equal(navigateDemoEntry(directorStepAction(chapter),f.world),true);await settle(f);
    assert.equal(f.world.prepareDirectorObservation(chapter.motion),true);await settle(f);assert.equal(f.world.beginDirectorMotion(chapter.motion),true);
  }finally{await release(f);}
  for(const change of[w=>w.disposed=true,w=>w.sim.seed='new',w=>w.controlStartCount++,w=>w._shallowSceneEntryToken++,(_w,r)=>r.current={}]){
    let done;const notices=[],actual={sim:{seed:'42'},controlStartCount:0,disposed:false,_shallowSceneEntryToken:0,
      enterCoastalLifeBelt(){this._shallowSceneEntryToken++;return new Promise(yes=>{done=yes;});}},ref={current:actual};
    const invoke=new Function('world','setView','setOceanToolsOpen','setPanel','rememberOcean','setToast',branch)(ref,()=>{},()=>{},()=>{},()=>notices.push('remembered'),text=>notices.push(text));
    invoke(entry.action);change(actual,ref);done(true);await nextTurn();assert.equal(notices.length,0,'stale completion cannot store memory or toast');
  }
  assert.equal(DIRECTOR_STEPS.length,66);assert.equal(new Set(DIRECTOR_STEPS.map(s=>s.action.id)).size,60);
  assert.equal(DIRECTOR_STEPS.reduce((n,s)=>n+s.durationMs,0),1794000);
});
