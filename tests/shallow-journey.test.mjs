import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample,updateShallowSample} from '../src/shallowSample.js';
import {createShallowJourney,SHALLOW_JOURNEY_SECONDS,SHALLOW_JOURNEY_CHAPTERS,shallowJourneyChapter,constrainShallowExploration} from '../src/shallowJourney.js';

const model=createShallowSample(55),before=JSON.stringify({rocks:model.rocks,corals:model.corals,grass:model.grass,agents:model.agents});
const route=createShallowJourney(model);
test('four-minute integration retains every existing habitat and animal and has no region loading',()=>{
  assert.equal(SHALLOW_JOURNEY_SECONDS,240);
  assert.equal(JSON.stringify({rocks:model.rocks,corals:model.corals,grass:model.grass,agents:model.agents}),before);
  assert.ok(route.length>85&&route.length<125);
  assert.deepEqual([...new Set(SHALLOW_JOURNEY_CHAPTERS.map(c=>c.habitat))],['礁谷','沙道','草床']);
  assert.equal(shallowJourneyChapter(240),SHALLOW_JOURNEY_CHAPTERS.at(-1));
});
test('entire camera route clears the actual reef and has continuous speed and direction',()=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180);let previous=null,maxSpeed=0,maxTurn=0,minClearance=Infinity;
  for(let t=0;t<=240;t+=.25){
    updateShallowSample(model,t);const v=route.view(t);camera.position.copy(v.position);camera.lookAt(v.target);
    const clearance=v.position.y-model.surface(v.position.x,v.position.z,true);minClearance=Math.min(minClearance,clearance);
    if(previous){maxSpeed=Math.max(maxSpeed,v.position.distanceTo(previous.position)/.25);maxTurn=Math.max(maxTurn,camera.quaternion.angleTo(previous.quaternion)/.25);}
    previous={position:v.position.clone(),quaternion:camera.quaternion.clone()};
  }
  assert.ok(minClearance>=.85,`camera clearance ${minClearance}`);
  assert.ok(maxSpeed<2,`camera speed ${maxSpeed} m/s`);
  assert.ok(maxTurn<1.3,`camera turn ${maxTurn} rad/s`);
});
test('each section has its actual focus community in the view, not only a chapter label',()=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  for(let index=0;index<SHALLOW_JOURNEY_CHAPTERS.length;index++){
    const c=SHALLOW_JOURNEY_CHAPTERS[index];let moments=0;
    for(let t=c.start+8;t<c.end-4;t+=2){updateShallowSample(model,t);const v=route.view(t);camera.position.copy(v.position);camera.lookAt(v.target);camera.updateMatrixWorld();frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      if(route.groups[index].some(a=>{const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z);return frustum.containsPoint(p)&&p.distanceTo(v.position)<16;}))moments++;
    }
    assert.ok(moments>=3,`${c.title}: only ${moments} visible samples (frustum, not occlusion proof)`);
  }
});
test('free exploration constrains the finite habitat and keeps the camera above actual surfaces',()=>{
  for(const p of [[-500,-10,-500],[500,50,500],[-17,-10,1],[25,-3,9]]){
    const v=constrainShallowExploration(model,new THREE.Vector3(...p));assert.ok(v.x>=-49&&v.x<=56&&v.z>=-7&&v.z<=17);
    assert.ok(v.y>=model.surface(v.x,v.z,true)+.8-1e-9);
  }
});
