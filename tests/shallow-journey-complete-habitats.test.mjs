import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {updateShallowSample} from '../src/shallowSample.js';
import {createShallowJourney} from '../src/shallowJourney.js';

const scene=new ShallowSampleScene(55,{livingCommunities:true}),model=scene.model,route=createShallowJourney(model);
test.after(()=>scene.dispose());

test('each complete habitat offers a sustained multi-species view including habitat-linked activity',t=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  const windows=[
    {name:'reef',start:0,end:88,linked:a=>a.journeyLife?.habitat==='reef'},
    {name:'sand',start:120,end:164,linked:a=>a.journeyLife?.kind==='sand-probe'},
    {name:'grass',start:164,end:210,linked:a=>a.journeyLife?.kind==='grass-edge'},
  ];
  for(const window of windows){
    let streak=0,longest=0;
    for(let time=window.start;time<=window.end;time+=.5){
      updateShallowSample(model,time);const v=route.view(time);
      camera.position.copy(v.position);camera.lookAt(v.target);camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const visible=model.agents.filter(a=>{
        const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=p.distanceTo(camera.position);
        return distance>1.3&&frustum.containsPoint(p)&&a.sizeM/distance*720/(2*Math.tan(THREE.MathUtils.degToRad(29)))>=14;
      });
      const occupied=new Set(visible.map(a=>a.speciesId)).size>=2&&visible.some(window.linked);
      streak=occupied?streak+1:0;longest=Math.max(longest,streak);
    }
    const seconds=Math.max(0,(longest-1)*.5);
    t.diagnostic(`${window.name}: ${seconds}s with two readable categories and a habitat-linked animal`);
    assert.ok(seconds>=12,`${window.name}: ${seconds}s, requires 12s`);
  }
  // This measures projection and existing action selection; real scenery,
  // occlusion and habitat transitions still require the five-view browser review.
});
