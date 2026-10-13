import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareShallowRenderer} from '../src/world/prepareShallowRenderer.js';

test('shared image upload overlaps pending compilation and failures restore original visibility',async()=>{
  const scene=new THREE.Scene(),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture,normalMap:texture});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.visible=false;scene.add(mesh);
  let complete;const pending=new Promise(resolve=>complete=resolve),events=[];
  const renderer=statefulRenderer({compileAsync(){events.push('compile-start');return pending;},
    initTexture(value){assert.equal(value,texture);events.push('image');complete();},render(){events.push('draw');}});
  const result=await prepareShallowRenderer(renderer,scene,new THREE.Camera());
  assert.deepEqual(events,['compile-start','image','draw']);assert.equal(result.textureCount,1);assert.equal(mesh.visible,false);
  const failure=statefulRenderer({async compileAsync(){},initTexture(){throw Error('image allocation failed');},render(){assert.fail('must not mark failed upload ready');}});
  await assert.rejects(prepareShallowRenderer(failure,scene,new THREE.Camera()),/image allocation failed/);
  assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);
  mesh.geometry.dispose();material.dispose();texture.dispose();
});

function statefulRenderer(operations){
  const state={viewport:new THREE.Vector4(3,4,1280,720),scissor:new THREE.Vector4(5,6,100,200),test:false};
  return {state,...operations,getViewport:v=>v.copy(state.viewport),getScissor:v=>v.copy(state.scissor),getScissorTest:()=>state.test,
    setViewport:(...v)=>state.viewport.copy(v[0]?.isVector4?v[0]:new THREE.Vector4(...v)),
    setScissor:(...v)=>state.scissor.copy(v[0]?.isVector4?v[0]:new THREE.Vector4(...v)),setScissorTest:v=>state.test=v};
}

test('preparation includes hidden LODs and off-camera animals then restores their exact flags',async()=>{
  const scene=new THREE.Scene(),near=new THREE.Mesh(),far=new THREE.Mesh();far.visible=false;far.frustumCulled=false;scene.add(near,far);
  near.geometry.setDrawRange(3,42);far.geometry.setDrawRange(0,Infinity);
  const events=[],renderer=statefulRenderer({async compileAsync(){events.push('compile');assert.ok(near.visible&&far.visible);},render(){events.push('upload');assert.equal(near.frustumCulled,false);assert.equal(far.frustumCulled,false);assert.deepEqual(renderer.state.viewport.toArray(),[0,0,1,1]);assert.equal(renderer.state.test,true);assert.deepEqual(near.geometry.drawRange,{start:0,count:0});assert.deepEqual(far.geometry.drawRange,{start:0,count:0});}});
  const result=await prepareShallowRenderer(renderer,scene,new THREE.Camera());
  assert.deepEqual(events,['compile','upload']);assert.equal(result.batches,2);
  assert.deepEqual(near.geometry.drawRange,{start:3,count:42});assert.deepEqual(far.geometry.drawRange,{start:0,count:Infinity});assert.equal(result.uploadTriangles,0);
  assert.equal(near.visible,true);assert.equal(near.frustumCulled,true);assert.equal(far.visible,false);assert.equal(far.frustumCulled,false);
  assert.deepEqual(renderer.state.viewport.toArray(),[3,4,1280,720]);assert.deepEqual(renderer.state.scissor.toArray(),[5,6,100,200]);assert.equal(renderer.state.test,false);
  for(const o of [near,far]){o.geometry.dispose();o.material.dispose();}
});

test('failed or cancelled preparation never leaves hidden meshes enabled or renders a disposed scene',async()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh();mesh.visible=false;scene.add(mesh);
  await assert.rejects(prepareShallowRenderer(statefulRenderer({async compileAsync(){throw Error('compile failed');}}),scene,new THREE.Camera()),/compile failed/);
  assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);
  let rendered=false;
  const result=await prepareShallowRenderer(statefulRenderer({async compileAsync(){},render(){rendered=true;}}),scene,new THREE.Camera(),()=>true);
  assert.equal(result,null);assert.equal(rendered,false);assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('an upload exception restores real canvas viewport, scissor and mesh flags',async()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh();mesh.visible=false;mesh.geometry.setDrawRange(9,27);scene.add(mesh);
  const renderer=statefulRenderer({async compileAsync(){},render(){throw Error('upload failed');}});
  await assert.rejects(prepareShallowRenderer(renderer,scene,new THREE.Camera()),/upload failed/);
  assert.deepEqual(renderer.state.viewport.toArray(),[3,4,1280,720]);assert.deepEqual(renderer.state.scissor.toArray(),[5,6,100,200]);assert.equal(renderer.state.test,false);assert.equal(mesh.visible,false);
  assert.deepEqual(mesh.geometry.drawRange,{start:9,count:27});
  mesh.geometry.dispose();mesh.material.dispose();
});
