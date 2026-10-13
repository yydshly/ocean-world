import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample,updateShallowSample} from '../src/shallowSample.js';
import {createShallowJourney,SHALLOW_JOURNEY_CHAPTERS} from '../src/shallowJourney.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

const legacy=createShallowSample(55),scene=new ShallowSampleScene(55,{livingCommunities:true}),model=scene.model,route=createShallowJourney(model);
test.after(()=>scene.dispose());

test('three communities retain the finite population and opt out of the 75-second sample',()=>{
  const identity=m=>m.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
  assert.deepEqual(identity(model),identity(legacy));
  assert.equal(model.agents.length,293);assert.equal(new Set(model.agents.map(a=>a.speciesId)).size,38);
  assert.equal(legacy.journeyLife,undefined);assert.equal(legacy.journeyHabitat,undefined);
  assert.equal(model.journeyHabitat.reefs.moved.length,4);
  assert.equal(model.journeyLife.kinds['sand-probe'],9);
  assert.equal(model.journeyLife.kinds['grass-edge'],18);
});

test('actual renderer selects five differentiated animal families and one bounded sediment response',()=>{
  const upgraded=scene.animals.batches.filter(b=>b.assetFamily?.startsWith('journey-species'));
  assert.equal(upgraded.length,5);
  for(const batch of upgraded){assert.equal(batch.parts.length,5);assert.ok(batch.parts.some(p=>p.mesh.material.transparent));}
  assert.equal(scene.activity.geometry.attributes.position.count,72);
});

test('full journey has continuous camera motion and supported animal bodies in the new habitats',()=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180);let last=null,maxSpeed=0,maxTurn=0,minClearance=Infinity;
  const activities=new Set();
  for(let time=0;time<=240;time+=.5){
    updateShallowSample(model,time);const v=route.view(time);camera.position.copy(v.position);camera.lookAt(v.target);
    minClearance=Math.min(minClearance,v.position.y-model.surface(v.position.x,v.position.z,true));
    if(last){maxSpeed=Math.max(maxSpeed,v.position.distanceTo(last.p)/.5);maxTurn=Math.max(maxTurn,camera.quaternion.angleTo(last.q)/.5);}
    last={p:v.position.clone(),q:camera.quaternion.clone()};
    for(const a of model.agents){
      if(a.journeyActivity)activities.add(a.journeyActivity);
      assert.ok(Number.isFinite(a.position.y));
      const bottom=a.position.y-a.clearance.bottom-(a.journeyLife?Math.abs(Math.sin(a.pitch))*a.sizeM*.55:0);
      assert.ok(bottom>=model.surface(a.position.x,a.position.z,a.mode==='school'||a.mode==='cruise')-.001,`${a.id} unsupported at ${time}`);
    }
  }
  assert.ok(minClearance>=.85,`clearance ${minClearance}`);
  assert.ok(maxSpeed<2,`camera speed ${maxSpeed}`);assert.ok(maxTurn<1.3,`camera turn ${maxTurn}`);
  for(const name of ['school-turn','school-spread','sand-probe','sand-transit','grass-edge-hold','reef-hold'])assert.ok(activities.has(name),name);
});

test('six chapters retain readable-sized actual focus animals throughout observation windows',()=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();
  for(const [i,c]of SHALLOW_JOURNEY_CHAPTERS.entries()){
    let longest=0,streak=0;
    for(let t=c.start+4;t<c.end-2;t++){
      updateShallowSample(model,t);const v=route.view(t);camera.position.copy(v.position);camera.lookAt(v.target);camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const visible=route.groups[i].some(a=>{
        const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),d=p.distanceTo(v.position);
        return frustum.containsPoint(p)&&d>1.3&&a.sizeM/d*720/(2*Math.tan(THREE.MathUtils.degToRad(29)))>=14;
      });
      streak=visible?streak+1:0;longest=Math.max(longest,streak);
    }
    assert.ok(longest>=8,`${c.title}: ${longest}s projected-size visibility, not full occlusion proof`);
  }
});
