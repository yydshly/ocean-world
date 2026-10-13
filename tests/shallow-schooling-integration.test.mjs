import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createShallowSample,updateShallowSample,setSampleAnimalEnvelope} from '../src/shallowSample.js';
import {createShallowJourney,SHALLOW_JOURNEY_SECONDS} from '../src/shallowJourney.js';
import {createShallowSchooling,prepareShallowSchooling,shallowSchoolingDiagnostics} from '../src/shallowSchooling.js';

const species='blue-and-gold-fusilier';
// Exercise the real composed habitat and an explicit conservative fish envelope.
// These projected-centre checks do not certify mesh occlusion or every dynamic
// collision. The actual rendered assets and 1x playback are reviewed separately.
function fixture(){
  const model=createShallowSample(55,{livingCommunities:true});
  const envelope=new THREE.Box3(new THREE.Vector3(-.55,-.16,-.12),new THREE.Vector3(.55,.16,.12));
  for(const a of model.agents.filter(a=>a.speciesId===species))setSampleAnimalEnvelope(a,envelope);
  updateShallowSample(model,0);
  return model;
}
const baseline=fixture(),model=fixture();
const originalRecords=model.agents.map(a=>[a.id,a.speciesId,a.kind,a.sizeM,a.mode,a.alive]);
const originalHabitat=JSON.stringify({rocks:model.rocks,corals:model.corals,grass:model.grass,rubble:model.rubble,attachedReef:model.attachedReef});
model.schoolingSystem=createShallowSchooling(model);
await prepareShallowSchooling(model.schoolingSystem);
const route=createShallowJourney(model),oldRoute=createShallowJourney(baseline);
const members=model.agents.filter(a=>a.speciesId===species);
function poses(){return members.map(a=>({id:a.id,position:{...a.position},velocity:{...a.velocity},heading:a.heading,pitch:a.pitch,state:a.state,activity:a.journeyActivity}));}
function orientation(view,camera){camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld();return camera.quaternion.clone();}

test('schooling preserves all identities and scenery, and every non-fusilier output is unchanged',()=>{
  assert.equal(members.length,38);
  assert.equal(model.agents.length,293);
  assert.equal(new Set(model.agents.map(a=>a.speciesId)).size,38);
  assert.deepEqual(model.agents.map(a=>[a.id,a.speciesId,a.kind,a.sizeM,a.mode,a.alive]),originalRecords);
  assert.equal(JSON.stringify({rocks:model.rocks,corals:model.corals,grass:model.grass,rubble:model.rubble,attachedReef:model.attachedReef}),originalHabitat);
  const other=model.agents.filter(a=>a.speciesId!==species);
  assert.equal(other.length,255);
  const oldById=new Map(baseline.agents.map(a=>[a.id,a]));
  for(const time of [0,7.5,16.25,28,33.5,39.75,55,60,68,88,120,164,210,239.975,240]){
    updateShallowSample(baseline,time);updateShallowSample(model,time);
    for(const a of other)assert.deepEqual(a,oldById.get(a.id),`${a.id}: unexpected change at ${time}`);
  }
});

test('all 961 camera positions remain exact and the schooling view turns continuously',t=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180);let previous=null,maxTurn=0,maxTurnTime=0,minClearance=Infinity;
  assert.equal(route.seconds,SHALLOW_JOURNEY_SECONDS);
  assert.equal(route.length,oldRoute.length);
  let samples=0;
  for(let time=0;time<=240;time+=.25){
    updateShallowSample(model,time);updateShallowSample(baseline,time);
    const view=route.view(time),before=oldRoute.view(time);
    assert.deepEqual(view.position.toArray(),before.position.toArray(),`route moved at ${time}`);
    const quaternion=orientation(view,camera);
    if(previous){const turn=previous.angleTo(quaternion)/.25;if(turn>maxTurn){maxTurn=turn;maxTurnTime=time;}}
    previous=quaternion;
    minClearance=Math.min(minClearance,view.position.y-model.surface(view.position.x,view.position.z,true));samples++;
  }
  assert.equal(samples,961);
  assert.ok(minClearance>=.85,`camera clearance ${minClearance}`);
  assert.ok(maxTurn<1.3,`camera turn ${maxTurn} rad/s at ${maxTurnTime}s`);
  t.diagnostic(`961 positions exact; maximum turn ${maxTurn.toFixed(3)} rad/s`);
});

test('the coordinated shoal remains broadly framed at several phases in wide and narrow views',t=>{
  const matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();
  for(const aspect of [16/9,.85]){
    const camera=new THREE.PerspectiveCamera(58,aspect,.08,180);let lowest=1;
    for(const time of [6,14,21,28,36,46,55,59.5]){
      updateShallowSample(model,time);const view=route.view(time);orientation(view,camera);
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const visible=members.filter(a=>frustum.containsPoint(new THREE.Vector3(a.position.x,a.position.y,a.position.z))).length;
      lowest=Math.min(lowest,visible/members.length);
      assert.ok(visible>=Math.ceil(members.length*.70),`${aspect.toFixed(2)} aspect, ${time}s: only ${visible}/${members.length} centres framed`);
    }
    t.diagnostic(`${aspect.toFixed(2)} aspect: minimum ${(lowest*100).toFixed(1)}% of fish centres in frustum (not an occlusion proof)`);
  }
});

test('pause, reverse seek, replay and long jumps use deterministic bounded checkpoint replay',()=>{
  const system=model.schoolingSystem;
  assert.ok(system.prepared);
  const times=[0,7.517,17.333,28.217,32.717,38.113,47.271,59.917,60,68.117,119.937,185.271,239.987,240];
  const expected=new Map();
  for(const time of times){
    updateShallowSample(model,time);expected.set(time,poses());
    const diagnostics=shallowSchoolingDiagnostics(system);
    assert.equal(diagnostics.pending,false);
    assert.ok(diagnostics.steps<=6,`seek to ${time} replayed ${diagnostics.steps} steps`);
    const paused=poses();updateShallowSample(model,time);assert.deepEqual(poses(),paused,`pause drift at ${time}`);
  }
  for(const time of times.toReversed()){
    updateShallowSample(model,time);assert.deepEqual(poses(),expected.get(time),`reverse seek changed ${time}`);
    assert.ok(shallowSchoolingDiagnostics(system).steps<=6);
  }
  for(const time of times){updateShallowSample(model,time);assert.deepEqual(poses(),expected.get(time),`replay changed ${time}`);}
  // A real-time frame never has to catch up 240 seconds of neighbour solving.
  updateShallowSample(model,0);updateShallowSample(model,239.987);
  assert.ok(shallowSchoolingDiagnostics(system).steps<=6);
});

test('the main four-minute entry keeps finite school poses after the 60-second demonstration',()=>{
  for(const time of [59.99,60,60.01,68,88,120,164,210,239.99,240]){
    updateShallowSample(model,time);
    for(const a of members){
      assert.ok([a.position.x,a.position.y,a.position.z,a.velocity.x,a.velocity.y,a.velocity.z,a.heading,a.pitch].every(Number.isFinite),`${a.id}: invalid pose at ${time}`);
      assert.equal(a.state,'swimming');assert.equal(a.timeSec,time);
    }
  }
  updateShallowSample(model,59.99);const before=poses();updateShallowSample(model,60.01);const after=poses();
  for(let i=0;i<members.length;i++){
    const p=new THREE.Vector3(before[i].position.x,before[i].position.y,before[i].position.z),q=new THREE.Vector3(after[i].position.x,after[i].position.y,after[i].position.z);
    assert.ok(p.distanceTo(q)<.04,`${members[i].id}: reset/teleport at the 60-second boundary`);
  }
});

test('the 75-second sample remains opt-out and retains its archived animal poses',()=>{
  const sample=createShallowSample(55);
  assert.equal(sample.schoolingSystem,undefined);
  const frames=[];
  for(const time of [0,17,34,50,64,75]){
    updateShallowSample(sample,time);
    frames.push(sample.agents.map(a=>[a.id,...[a.position.x,a.position.y,a.position.z,a.velocity.x,a.velocity.y,a.velocity.z,a.heading,a.pitch].map(n=>Number(n.toFixed(8))),a.state,a.journeyActivity??null]));
  }
  assert.equal(sample.schoolingSystem,undefined);
  // Recorded from d7e796d's unchanged 75-second updater and existing assets.
  // Eight-decimal rounding tolerates platform transcendental last-bit noise.
  assert.equal(createHash('sha256').update(JSON.stringify(frames)).digest('hex'),
    'c1dc65f55f68ae44132e758d53a9967a2f418b7c2198316507167afa5c3ca40f');
});
