import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {updateShallowSample} from '../src/shallowSample.js';
import {createShallowJourney,SHALLOW_JOURNEY_CHAPTERS} from '../src/shallowJourney.js';

// Use the rendered scene's actual animal envelopes and composed habitat.
const scene=new ShallowSampleScene(55,{livingCommunities:true});
const model=scene.model,route=createShallowJourney(model),schoolChapters=[0,1,2,5];
test.after(()=>scene.dispose());

test('water-column framing retains the archived camera positions on the same integrated habitat',()=>{
  // Captured from b37ab314731782d11b7ef312c8ec4aa99bb6102b's route factory
  // against this integrated seed-55 scene. Exact doubles, no rounding: framing
  // may change, but the full 240-second movement and support envelope may not.
  const positions=[];let previous=null;
  for(let t=0;t<=240;t+=.25){
    const p=route.view(t).position;
    positions.push([t,...p.toArray()]);
    assert.ok(p.y-model.surface(p.x,p.z,true)>=.85,`camera support at ${t}`);
    if(previous)assert.ok(p.distanceTo(previous)/.25<2,`camera displacement at ${t}`);
    previous=p;
  }
  assert.equal(route.seconds,240);
  assert.equal(createHash('sha256').update(JSON.stringify(positions)).digest('hex'),
    'f1cc4dcf9db7545492697dfec33b30f9583a667581a678e4d98e2e251060fa53');
});

test('all four rendered schools retain height, lateral depth and supported motion throughout the journey',()=>{
  for(let t=0;t<=240;t+=2){
    updateShallowSample(model,t);
    for(const chapter of schoolChapters){
      const agents=route.groups[chapter],n=agents.length,label=agents[0].speciesId;
      const center=agents.reduce((sum,a)=>sum.add(new THREE.Vector3(a.position.x,a.position.y,a.position.z)),new THREE.Vector3()).multiplyScalar(1/n);
      let xx=0,zz=0,xz=0,yy=0,xy=0,yz=0;
      const heights=agents.map(a=>a.position.y).sort((a,b)=>a-b);
      for(const a of agents){
        const {x,y,z}=a.position,dx=x-center.x,dy=y-center.y,dz=z-center.z;
        assert.ok([x,y,z,a.velocity.x,a.velocity.z].every(Number.isFinite),`${a.id}: invalid pose at ${t}`);
        assert.ok(Math.hypot(a.velocity.x,a.velocity.z)<.75,`${a.id}: excessive horizontal speed at ${t}`);
        // Match the integrated whole-body support envelope, including its rim.
        for(let j=0;j<9;j++){
          const radius=j===8?0:a.clearance.radius,angle=j*Math.PI/4;
          assert.ok(y-a.clearance.bottom>=model.surface(x+radius*Math.cos(angle),z+radius*Math.sin(angle),true),
            `${a.id}: body support at ${t}`);
        }
        xx+=dx*dx/n;zz+=dz*dz/n;xz+=dx*dz/n;yy+=dy*dy/n;xy+=dx*dy/n;yz+=dy*dz/n;
      }
      // The middle half of the group must span a substantial vertical layer.
      assert.ok(heights[Math.floor((n-1)*.75)]-heights[Math.floor((n-1)*.25)]>.45,`${label}: flat height distribution at ${t}`);
      // The smaller horizontal principal axis rejects a thin, rotated ribbon.
      const minor=Math.sqrt((xx+zz-Math.sqrt((xx-zz)**2+4*xz*xz))/2);
      assert.ok(minor>.3,`${label}: no lateral depth at ${t}`);
      // Residual vertical spread after fitting an X/Z plane rejects a school
      // that only appears tall because every fish follows the same bed slope.
      const residual=Math.sqrt(Math.max(0,yy-(zz*xy*xy-2*xz*xy*yz+xx*yz*yz)/(xx*zz-xz*xz)));
      assert.ok(residual>.2,`${label}: planar school at ${t}`);
    }
  }
});

test('each school chapter sustains readable groups in both upper and middle screen thirds',t=>{
  const camera=new THREE.PerspectiveCamera(58,16/9,.08,180),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  const step=.5,pixelsPerRadian=720/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  for(const index of schoolChapters){
    const chapter=SHALLOW_JOURNEY_CHAPTERS[index];let streak=0,longest=0;
    for(let time=chapter.start;time<=chapter.end;time+=step){
      updateShallowSample(model,time);const view=route.view(time);
      camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      let readable=0,upper=0,middle=0;
      for(const a of route.groups[index]){
        const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=p.distanceTo(view.position);
        if(!frustum.containsPoint(p)||distance<=1.3||a.sizeM/distance*pixelsPerRadian<14)continue;
        readable++;const screen=p.project(camera);
        if(screen.y>1/3)upper++;
        else if(screen.y>=-1/3)middle++;
      }
      const occupied=readable>=8&&upper>=3&&middle>=3;
      streak=occupied?streak+1:0;longest=Math.max(longest,streak);
    }
    const seconds=Math.max(0,(longest-1)*step),required=(chapter.end-chapter.start)*.2;
    t.diagnostic(`${chapter.title}: ${seconds}s sustained upper/middle groups; minimum ${required}s`);
    // New composition contract: one continuous observation covers at least a
    // fifth of each chapter. This is projected size/frustum evidence only;
    // it does not establish occlusion, individual silhouettes or visual quality.
    assert.ok(seconds>=required,`${chapter.title}: only ${seconds}s of projected groups; expected ${required}s`);
  }
});
