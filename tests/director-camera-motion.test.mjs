import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import * as THREE from 'three';

const shot = options => createDirectorCameraMotion({position:{x:0,y:3,z:0},target:{x:8,y:1,z:0},durationSec:12,...options});
const sample = (path,time,options={}) => sampleDirectorCameraMotion(path,time,{surfaceY:20,...options});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('walking genuinely advances and turns through a finite local path, ending without extrapolation',()=>{
  const path=shot(),start=sample(path,0),middle=sample(path,6),end=sample(path,12);
  assert.deepEqual(start.position,{x:0,y:3,z:0});
  assert.ok(distance(start.position,middle.position)>5);
  assert.ok(distance(start.position,end.position)>11&&distance(start.position,end.position)<12.1);
  assert.ok(end.position.z>1.5,'the walk turns rather than repeating a static preset');
  assert.ok(end.target.z>end.position.z);
  assert.equal(middle.complete,false);assert.equal(end.complete,true);
  assert.deepEqual(sample(path,120),end);
});

test('absolute geographical paths remain translation invariant across far floating origins',()=>{
  const offset={x:1000000,z:-3200000};
  const near=shot(),far=shot({position:{x:offset.x,y:3,z:offset.z},target:{x:offset.x+8,y:1,z:offset.z}});
  for(const time of [0,1,4,8,12]){
    const a=sample(near,time),b=sample(far,time);
    assert.ok(Math.abs(b.position.x-offset.x-a.position.x)<1e-8);
    assert.ok(Math.abs(b.position.z-offset.z-a.position.z)<1e-8);
    assert.ok(Math.abs(b.target.x-offset.x-a.target.x)<1e-8);
    assert.ok(Math.abs(b.target.z-offset.z-a.target.z)<1e-8);
    assert.equal(a.position.y,b.position.y);
  }
});

test('camera conforms to real floor and hard support while staying beneath the water ceiling',()=>{
  const path=shot(),floorHeight=x=>.15*x,safeHeight=(x,z)=>floorHeight(x,z)+(x>4&&x<9?2:0);
  for(let time=0;time<=12;time+=.1){
    const frame=sample(path,time,{floorHeight,safeHeight,surfaceY:6});
    assert.ok(frame.position.y>=safeHeight(frame.position.x,frame.position.z)+path.clearanceM-1e-9);
    assert.ok(frame.position.y<=5.5);
    assert.ok(Object.values(frame.position).every(Number.isFinite));
  }
  assert.throws(()=>sample(path,6,{safeHeight:()=>8,surfaceY:6}),/净空/);
  assert.throws(()=>sample(path,6,{floorHeight:()=>NaN}),/nonfinite/);
});

test('layer changes approach the requested safe height continuously along a moving shot',()=>{
  const path=shot();
  const frames=[0,3,6,9,12].map(time=>sample(path,time,{layerHeight:()=>10}));
  assert.equal(frames[0].position.y,3);
  assert.equal(frames.at(-1).position.y,10);
  assert.ok(frames[1].position.y>3&&frames[1].position.y<frames[2].position.y);
  assert.ok(frames[3].position.y<10);
  assert.ok(distance(frames[0].position,frames.at(-1).position)>12);
});

test('follow motion approaches actual framing gently and tracks the actual moving target',()=>{
  const path=shot({kind:'follow',focusPosition:{x:4,y:1.5,z:1},focusTarget:{x:5,y:.5,z:0}});
  assert.deepEqual(sample(path,0,{trackingTarget:{x:5,y:.5,z:0}}).position,path.position);
  const first=sample(path,.1,{trackingTarget:{x:5,y:.5,z:0}});
  assert.ok(distance(first.position,path.position)<.05,'the initial focusing placement is not a teleport');
  const end=sample(path,12,{trackingTarget:{x:6,y:.6,z:2}});
  assert.deepEqual(end.target,{x:6,y:.6,z:2});
  assert.ok(distance(end.position,path.position)>2);
  assert.equal(end.complete,true);
});

test('pause and hidden tabs freeze elapsed time, and a slow frame cannot exceed the finite end',()=>{
  assert.equal(advanceDirectorCameraElapsed(4,12,1,{paused:true}),4);
  assert.equal(advanceDirectorCameraElapsed(4,12,1,{hidden:true}),4);
  assert.equal(advanceDirectorCameraElapsed(4,12,1),5);
  assert.equal(advanceDirectorCameraElapsed(4,12,50),12);
  for(const dt of [NaN,Infinity,0,-1])assert.equal(advanceDirectorCameraElapsed(4,12,dt),4);
});

test('near scene arcs move modestly and invalid requests cannot create endless or nonfinite shots',()=>{
  const path=shot({kind:'orbit',distanceM:3});
  const start=sample(path,0),end=sample(path,12);
  assert.ok(distance(start.position,end.position)>2.8&&distance(start.position,end.position)<3.1);
  assert.deepEqual(end.target,start.target);
  for(const options of [{durationSec:Infinity},{durationSec:0},{durationSec:61},{distanceM:Infinity},{distanceM:0},{kind:'jump'}]){
    assert.throws(()=>shot(options));
  }
});

// As in living-shallows-world.test.mjs, execute the shipped CPU methods rather
// than import the browser-only capture environment or construct WebGL.
const worldSource=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
const nativeMethod=name=>{
  const start=worldSource.indexOf(`  ${name}(`);
  assert.ok(start>=0,`${name} must exist on the production world`);
  const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(worldSource.slice(start+2));
  return worldSource.slice(start,next?start+2+next.index:worldSource.lastIndexOf('\n}'));
};
const NativeWorld=new Function('THREE','createDirectorCameraMotion','sampleDirectorCameraMotion','advanceDirectorCameraElapsed','clamp',
  `return class {${['oceanWorldPosition','findAgent','beginDirectorMotion','directorMotionQueries','updateDirectorMotion',
    'stopDirectorMotion','directorMotionSnapshot','clearCameraPosition','enforceCameraClearance','setOceanRenderOrigin'].map(nativeMethod).join('\n')}}`)(
  THREE,createDirectorCameraMotion,sampleDirectorCameraMotion,advanceDirectorCameraElapsed,THREE.MathUtils.clamp);
const nativeWorld = () => {
  // Exercise the production methods without constructing a WebGL renderer.
  const world=new NativeWorld();
  Object.assign(world,{camera:new THREE.PerspectiveCamera(),controls:{target:new THREE.Vector3(100008,1,-200000),enableDamping:true,update(){}},
    oceanRenderOrigin:{x:100000,z:-200000},oceanExploring:true,oceanObservationLayer:'bed',surfaceY:20,
    sim:{agents:[],environment:{hour:10},timeSec:44},selectedId:null,cameraRocks:[],keys:new Set(),paused:false,disposed:false,
    oceanChunks:{setRenderOrigin(){}},floorY:()=>0,habitatY:()=>0,emitSnapshot(){}});
  world.camera.position.set(0,3,0);world.controls.target.set(8,1,0);
  return world;
};

test('native camera methods move in absolute space through a rebase, pause, complete and stop without touching simulation',()=>{
  const world=nativeWorld(),model=structuredClone(world.sim);
  assert.equal(world.beginDirectorMotion({kind:'walk',durationSec:12}),true);
  const start=world.directorMotionSnapshot();
  world.paused=true;world.updateDirectorMotion(3);
  assert.deepEqual(world.directorMotionSnapshot().worldPosition,start.worldPosition);
  assert.equal(world.directorMotionSnapshot().elapsedSec,0);
  world.paused=false;world.updateDirectorMotion(3);
  const before=world.directorMotionSnapshot();
  assert.ok(distance(before.worldPosition,start.worldPosition)>1);
  world.setOceanRenderOrigin(100064,-200000);
  assert.deepEqual(world.directorMotionSnapshot().worldPosition,before.worldPosition);
  world.updateDirectorMotion(3);
  assert.equal(world.directorMotionSnapshot().elapsedSec,6);
  world.updateDirectorMotion(6);
  const end=world.directorMotionSnapshot();
  assert.equal(end.complete,true);assert.equal(end.active,false);
  assert.ok(distance(start.worldPosition,end.worldPosition)>11);
  world.updateDirectorMotion(3);
  assert.deepEqual(world.directorMotionSnapshot(),end);
  assert.deepEqual(world.sim,model);
  world.stopDirectorMotion();
  assert.equal(world.directorMotionSnapshot().kind,null);
  assert.equal(world.directorMotionSnapshot().elapsedSec,0);
});

test('native follow uses the actual selected living target and approaches its existing focus placement gradually',()=>{
  const world=nativeWorld(),agent={id:'real-live-agent',alive:true,position:{x:100005,y:.5,z:-200000}};
  world.sim.agents=[agent];world.selectedId=agent.id;world.following=true;
  world.focusTarget=value=>new THREE.Vector3(value.position.x-world.oceanRenderOrigin.x,value.position.y,value.position.z-world.oceanRenderOrigin.z);
  world.transition={position:new THREE.Vector3(4,1.5,1),target:new THREE.Vector3(5,.5,0),agentId:agent.id};
  assert.equal(world.beginDirectorMotion({kind:'follow',durationSec:12}),true);
  assert.equal(world.following,false,'the finite shot takes ownership from ordinary following');
  const start=world.directorMotionSnapshot();world.updateDirectorMotion(.1);
  assert.ok(distance(start.worldPosition,world.directorMotionSnapshot().worldPosition)<.05);
  agent.position.x+=1;agent.position.z+=2;world.updateDirectorMotion(11.9);
  assert.deepEqual(world.directorMotionSnapshot().worldTarget,agent.position);
  assert.equal(world.directorMotionSnapshot().agentId,agent.id);
  assert.equal(world.directorMotionSnapshot().complete,true);
  world.stopDirectorMotion();
  assert.equal(world.following,false,'exiting the director does not restart an old animal follow');
});

test('a centimetre species focus becomes a visible habitat pullback and metre arc without moving its real animal',()=>{
  const world=nativeWorld(),agent={id:'real-cleaner-shrimp',alive:true,position:{x:100005,y:.5,z:-200000}};
  world.sim.agents=[agent];world.selectedId=agent.id;
  world.camera.position.set(5.05,.6,0);world.controls.target.set(5,.5,0);
  world.focusTarget=value=>new THREE.Vector3(value.position.x-world.oceanRenderOrigin.x,value.position.y,value.position.z-world.oceanRenderOrigin.z);
  world.transition={position:new THREE.Vector3(5.08,.6,0),target:new THREE.Vector3(5,.5,0),agentId:agent.id};
  const unchanged=structuredClone(agent);
  assert.equal(world.beginDirectorMotion({kind:'follow',durationSec:14}),true);
  const framing=world.directorMotion.shot;
  assert.ok(Math.hypot(framing.focusPosition.x-agent.position.x,framing.focusPosition.z-agent.position.z)>=3-1e-9);
  assert.ok(framing.focusPosition.y>=agent.position.y+1);
  const start=world.directorMotionSnapshot();world.updateDirectorMotion(.1);
  assert.ok(distance(start.worldPosition,world.directorMotionSnapshot().worldPosition)<.01,'the pullback begins smoothly');
  world.updateDirectorMotion(1.47);
  assert.ok(world.directorMotionSnapshot().travelledM>.6,'visible metre-scale movement replaces the old centimetre-only orbit');
  world.updateDirectorMotion(3.33);
  const wide=world.directorMotionSnapshot();
  world.updateDirectorMotion(9.1);
  const end=world.directorMotionSnapshot();
  assert.ok(distance(wide.worldPosition,end.worldPosition)>.9,'the widened camera performs a visible later arc');
  assert.ok(end.travelledM>3);
  assert.deepEqual(end.worldTarget,agent.position);
  assert.deepEqual(agent,unchanged);
  assert.equal(end.complete,true);
});

test('widening an already settled animal focus does not mutate the shot starting position or teleport the camera',()=>{
  const world=nativeWorld(),agent={id:'settled-live-agent',alive:true,position:{x:100005,y:.5,z:-200000}};
  world.sim.agents=[agent];world.selectedId=agent.id;
  world.camera.position.set(5.05,.6,0);world.controls.target.set(5,.5,0);
  world.focusTarget=value=>new THREE.Vector3(value.position.x-world.oceanRenderOrigin.x,value.position.y,value.position.z-world.oceanRenderOrigin.z);
  const before={...world.oceanWorldPosition()};
  assert.equal(world.beginDirectorMotion({kind:'follow',durationSec:14}),true);
  assert.deepEqual(world.directorMotion.shot.position,before);
  assert.deepEqual(world.directorMotionSnapshot().worldPosition,before);
  world.updateDirectorMotion(.1);
  assert.ok(distance(before,world.directorMotionSnapshot().worldPosition)<.01);
  world.updateDirectorMotion(13.9);
  assert.ok(distance(before,world.directorMotionSnapshot().worldPosition)>2.9);
});
