import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDirectorEntryMotion, sampleDirectorEntryMotion, advanceDirectorEntryElapsed } from '../src/directorEntryMotion.js';
import { createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed, isDirectorPlaybackRate } from '../src/directorCameraMotion.js';
import { sampleLivingVisualRoute } from '../src/livingVisualRoute.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanOverviewObservation } from '../src/oceanOverview.js';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';

const pointDistance = (a, b) => Math.hypot(...['x', 'y', 'z'].map(key => a[key] - b[key]));
const near = (a, b) => assert.ok(pointDistance(a, b) < 1e-7, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
const ids = ['-1,-1','0,-1','1,-1','-1,0','0,0','1,0','-1,1','0,1','1,1'];
const bridge = options => createDirectorEntryMotion({ position: { x: 8, y: 3, z: 10 }, target: { x: 18, y: 2, z: 10 },
  destination: { position: { x: 24, y: 4, z: 10 }, target: { x: 14, y: 3, z: 10 } },
  loadedOwnerIds: ids, safeHeight: () => 0, ceilingHeight: () => 8, ...options });

test('the actual bridge translates and turns 180 degrees with a positive look direction and exact endpoints', () => {
  const path = bridge(), first = sampleDirectorEntryMotion(path, 0), last = sampleDirectorEntryMotion(path, path.durationSec);
  near(first.position, path.position); near(first.target, path.target);
  near(last.position, path.destination.position); near(last.target, path.destination.target);
  let previous = first, moved = 0;
  for (let i = 1; i <= 80; i++) {
    const frame = sampleDirectorEntryMotion(path, path.durationSec * i / 80);
    assert.ok(pointDistance(frame.position, frame.target) > 9, 'opposing headings never make a zero target');
    assert.ok([...Object.values(frame.position), ...Object.values(frame.target)].every(Number.isFinite));
    assert.ok(pointDistance(frame.position, previous.position) < .4, 'translation remains continuous');
    moved += pointDistance(frame.position, previous.position); previous = frame;
  }
  assert.ok(moved > 16 && moved < 16.1);
  assert.equal(last.complete, true); assert.deepEqual(sampleDirectorEntryMotion(path, 99), last);
});

test('bounded paths reject unloaded owners, intermediate rock barriers, insufficient water and nonfinite requests', () => {
  assert.throws(() => bridge({ destination: { position: { x: 41, y: 3, z: 10 }, target: { x: 51, y: 2, z: 10 } } }), /32/);
  assert.throws(() => bridge({ loadedOwnerIds: ids.filter(id => id !== '0,0') }), /resident/);
  assert.throws(() => bridge({ safeHeight: x => x > 14 && x < 17 ? 5 : 0 }), /clearance/);
  assert.throws(() => bridge({ ceilingHeight: () => 3.2 }), /clearance/);
  assert.throws(() => bridge({ safeHeight: () => NaN }), /clearance/);
  assert.throws(() => bridge({ loadedOwnerIds: ['0,0', '0,0'] }), /malformed/);
  assert.throws(() => bridge({ target: { x: 8, y: 3, z: 10 } }), /nonzero/);
});

test('absolute path sampling survives far translations and the independent entry clock honors guide controls', () => {
  const path = bridge(), offset = { x: 640000, z: -1280000 }, shift = p => ({ x: p.x + offset.x, y: p.y, z: p.z + offset.z });
  const far = bridge({ position: shift(path.position), target: shift(path.target),
    destination: { position: shift(path.destination.position), target: shift(path.destination.target) },
    loadedOwnerIds: ids.map(id => { const [x,z] = id.split(',').map(Number); return `${x + offset.x / 64},${z + offset.z / 64}`; }) });
  for (const u of [0,.1,.5,.8,1]) {
    const a = sampleDirectorEntryMotion(path, u * path.durationSec), b = sampleDirectorEntryMotion(far, u * far.durationSec);
    near(shift(a.position), b.position); near(shift(a.target), b.target);
  }
  assert.equal(advanceDirectorEntryElapsed(2,10,1,{playing:false}),2);
  assert.equal(advanceDirectorEntryElapsed(2,10,1,{hidden:true}),2);
  assert.equal(advanceDirectorEntryElapsed(2,10,1,{playbackRate:2,paused:true}),4, 'ecological loading pause does not freeze the independent camera clock');
  assert.equal(advanceDirectorEntryElapsed(9,10,99,{playbackRate:4}),10);
  assert.equal(advanceDirectorEntryElapsed(2,10,1,{playbackRate:3}),2);
});

// Execute the shipped World methods without constructing WebGL. These tests
// cover camera ownership and unchanged opaque ecological records, not image QA.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`); assert.ok(start >= 0, name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const names = ['oceanWorldPosition','planDirectorEntry','beginDirectorEntry','setDirectorEntryPlayback','updateDirectorEntry',
  'directorEntrySnapshot','stopDirectorEntry','prepareDirectorObservation','beginDirectorMotion','directorMotionQueries',
  'updateDirectorMotion','directorMotionSnapshot','findAgent','restoreOceanObservation','oceanLayerY',
  'clearCameraPosition','enforceCameraClearance','setOceanRenderOrigin'];
const World = new Function('THREE','createDirectorEntryMotion','sampleDirectorEntryMotion','advanceDirectorEntryElapsed',
  'createDirectorCameraMotion','sampleDirectorCameraMotion','advanceDirectorCameraElapsed','isDirectorPlaybackRate',
  'normalizeOceanObservationView','oceanLayerHeight','oceanOverviewObservation','LIVING_SHALLOWS_PROFILE','sampleLivingVisualRoute','clamp',
  `return class {${names.map(method).join('\n')}}`)(THREE,createDirectorEntryMotion,sampleDirectorEntryMotion,advanceDirectorEntryElapsed,
  createDirectorCameraMotion,sampleDirectorCameraMotion,advanceDirectorCameraElapsed,isDirectorPlaybackRate,
  normalizeOceanObservationView,oceanLayerHeight,oceanOverviewObservation,LIVING_SHALLOWS_PROFILE,sampleLivingVisualRoute,THREE.MathUtils.clamp);
function fixture() {
  const world = new World(), calls = [];
  const records = new Map(ids.map(id => [id, { id,timeSec:112.3,agents:[{id:`old:${id}`,alive:false,state:'dead',history:{opaque:true}}],
    food:{detritus:.013},extra:{unknown:['keep']}}]));
  const generator = { sample: () => ({habitat:'sand'}), heightForCamera: () => 0, routeStops: [
    {id:'near',x:20,z:20}, {id:'far',x:300,z:20}], forestRouteStops:[{id:'forest',x:20,z:20}], seascapeRouteStops:[{id:'deep',x:20,z:20}] };
  Object.assign(world,{biomeId:'reef',isLivingShallows:true,isKelp:false,isDeep:false,disposed:false,oceanEcologyResetting:false,
    oceanExploring:true,oceanRenderOrigin:{x:0,z:0},surfaceY:8,camera:new THREE.PerspectiveCamera(49,16/9),
    controls:{target:new THREE.Vector3(18,1.2,28),enableDamping:true,update(){world.camera.lookAt(this.target);}},
    cameraRocks:[],keys:new Set(),paused:true,sim:{seed:'42',timeSec:88,agents:[],environment:{hour:12,foodSupply:.8}},
    oceanEcology:{_active:records,agents:[]},oceanChunks:{generator,stats:{loadedChunks:[...ids]},update(p){calls.push(['chunks',{...p}]);},setRenderOrigin(){}},
    floorY:()=>0,habitatY:()=>0,highlight:{visible:false,position:new THREE.Vector3()},reefRoot:new THREE.Group(),
    requestOceanEcology(p){calls.push(['ecology',{...p}]);},emitSnapshot(){},onSelect(){},
    onDirectorMotionComplete(){calls.push(['chapter-complete']);},enterLivingShallows(){throw new Error('planning may not enter');},
    presets:{wide:{position:[3,2.8,5],target:[-2.5,.65,-2]}}});
  world.camera.position.set(8,2.8,28);world.controls.update();
  return {world,calls,records};
}
const preserved = f => structuredClone({sim:f.world.sim,records:[...f.records]});

test('native entry planning is read-only, distinguishes near/remote/world/mode, and keeps local tools in place', () => {
  const f = fixture(), before = preserved(f), position = {...f.world.oceanWorldPosition()}, target = f.world.controls.target.clone();
  const choice = {kind:'living-stop',id:'near-action',stopId:'near',biome:'reef',profile:LIVING_SHALLOWS_PROFILE};
  const plan = f.world.planDirectorEntry(choice); assert.equal(plan.kind,'continuous');
  near(plan.view.position,{x:13,y:2.8,z:28}); assert.ok(plan.motion.distanceM < 6);
  assert.equal(f.world.planDirectorEntry({...choice,stopId:'far'}).kind,'cut');
  assert.equal(f.world.planDirectorEntry({...choice,stopId:'missing'}).kind,'cut');
  assert.equal(f.world.planDirectorEntry({...choice,biome:'deep'}).reason,'different-world');
  for(const kind of ['layer','local-life','panel','population','capture','discoveries'])assert.equal(f.world.planDirectorEntry({kind}).kind,'keep');
  f.world.oceanExploring=false;assert.equal(f.world.planDirectorEntry(choice).reason,'different-observation-mode');f.world.oceanExploring=true;
  f.world.oceanChunks.stats.loadedChunks=[];assert.equal(f.world.planDirectorEntry(choice).kind,'cut');
  f.world.oceanChunks.stats.loadedChunks=[...ids];const guard=f.world.clearCameraPosition;
  f.world.clearCameraPosition=function(p){guard.call(this,p);if(p.x>10&&p.x<11)p.y+=2;return p;};
  assert.equal(f.world.planDirectorEntry(choice).reason,'camera-rock-guard-blocks-bridge','fixed-scene guards also reject the complete intermediate path');
  near(f.world.oceanWorldPosition(),position);near(f.world.controls.target,target);assert.deepEqual(preserved(f),before);assert.deepEqual(f.calls,[]);
});

test('the shipped World bridge moves before native entry, preserves records, honors controls and survives rebase', () => {
  const f=fixture(), before=preserved(f), plan=f.world.planDirectorEntry({kind:'living-stop',stopId:'near'});
  assert.equal(f.world.beginDirectorEntry(plan,{playing:true,playbackRate:1}),true);
  const start=f.world.directorEntrySnapshot();f.world.updateDirectorEntry(.5);
  const middle=f.world.directorEntrySnapshot();assert.ok(pointDistance(start.worldPosition,middle.worldPosition)>.1);
  assert.equal(f.calls.length,0,'no native restore or destination ecology load before physical motion');
  assert.equal(f.world.setDirectorEntryPlayback({playing:false,playbackRate:2}),true);f.world.updateDirectorEntry(10);
  assert.equal(f.world.directorEntrySnapshot().elapsedSec,middle.elapsedSec);
  f.world.setOceanRenderOrigin(64,0);near(f.world.directorEntrySnapshot().worldPosition,middle.worldPosition);
  assert.equal(f.world.setDirectorEntryPlayback({playing:true,playbackRate:2}),true);f.world.updateDirectorEntry(99);
  const end=f.world.directorEntrySnapshot();assert.equal(end.complete,true);assert.equal(end.error,null);
  near(end.worldPosition,plan.view.position);near(end.worldTarget,plan.view.target);assert.equal(f.world.oceanObservationLayer,'bed');
  assert.deepEqual(preserved(f),before);assert.equal(f.calls.filter(row=>row[0]==='ecology').length,1);
  assert.equal(f.calls.filter(row=>row[0]==='chapter-complete').length,0);
  f.world.stopDirectorEntry();assert.equal(f.world.directorEntrySnapshot().kind,null);
  assert.equal(f.world.beginDirectorEntry(plan),false,'a stale initial pose cannot be replayed');
});

test('changed resident support stops a bridge without jumping or emitting a chapter completion', () => {
  const f=fixture(),plan=f.world.planDirectorEntry({kind:'living-stop',stopId:'near'});
  assert.equal(f.world.beginDirectorEntry(plan),true);const before={...f.world.oceanWorldPosition()};
  f.world.habitatY=()=>7;f.world.updateDirectorEntry(1);
  assert.equal(f.world.directorEntrySnapshot().active,false);assert.match(f.world.directorEntrySnapshot().error,/净空/);
  near(f.world.oceanWorldPosition(),before);assert.deepEqual(f.calls,[]);
});

test('opaque preparation installs the real route start once and chapter motion never repeats that restore', () => {
  const f=fixture(),world=f.world;const route={status:'ready',scope:'test-prepared-route',sourceElementIds:['source'],sourceAgentIds:['fish'],
    pathLengthM:12,stops:[{position:{x:10,y:2.8,z:28},target:{x:20,y:1.2,z:28}}],
    path:[{position:{x:10,y:2.8,z:28},target:{x:20,y:1.2,z:28}},
      {position:{x:22,y:2.8,z:28},target:{x:32,y:1.2,z:28}}]};
  world.currentLivingVisualRoute=()=>route;
  let restores=0;const restore=world.restoreOceanObservation;
  world.restoreOceanObservation=function(value){restores++;return restore.call(this,value);};
  const motion={routeId:'living-visual',kind:'walk',durationSec:12};
  assert.equal(world.prepareDirectorObservation(motion),true);assert.equal(restores,1);
  const entry={...world.oceanWorldPosition()};assert.equal(world.beginDirectorMotion(motion),true);
  assert.equal(restores,1);near(world.oceanWorldPosition(),entry);assert.equal(world.directorMotion.livingRoute,route);
  world.paused=false;world.updateDirectorMotion(6);assert.ok(pointDistance(world.oceanWorldPosition(),entry)>5);
  world._preparedDirectorObservation=null;world.camera.position.x+=1;
  assert.equal(world.beginDirectorMotion(motion),true);assert.equal(restores,1);
  assert.equal(world.directorMotion.livingRoute,undefined,'an unprepared mismatched view falls back without a second jump');
});
