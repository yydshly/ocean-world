import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareShallowRenderer} from '../src/world/prepareShallowRenderer.js';

test('preparation includes hidden LODs and off-camera animals then restores their exact flags',async()=>{
  const scene=new THREE.Scene(),near=new THREE.Mesh(),far=new THREE.Mesh();far.visible=false;far.frustumCulled=false;scene.add(near,far);
  const events=[],renderer={async compileAsync(){events.push('compile');assert.ok(near.visible&&far.visible);},render(){events.push('upload');assert.equal(near.frustumCulled,false);assert.equal(far.frustumCulled,false);}};
  const result=await prepareShallowRenderer(renderer,scene,new THREE.Camera());
  assert.deepEqual(events,['compile','upload']);assert.equal(result.batches,2);
  assert.equal(near.visible,true);assert.equal(near.frustumCulled,true);assert.equal(far.visible,false);assert.equal(far.frustumCulled,false);
  for(const o of [near,far]){o.geometry.dispose();o.material.dispose();}
});

test('failed or cancelled preparation never leaves hidden meshes enabled or renders a disposed scene',async()=>{
  const scene=new THREE.Scene(),mesh=new THREE.Mesh();mesh.visible=false;scene.add(mesh);
  await assert.rejects(prepareShallowRenderer({async compileAsync(){throw Error('compile failed');}},scene,new THREE.Camera()),/compile failed/);
  assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);
  let rendered=false;
  const result=await prepareShallowRenderer({async compileAsync(){},render(){rendered=true;}},scene,new THREE.Camera(),()=>true);
  assert.equal(result,null);assert.equal(rendered,false);assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);
  mesh.geometry.dispose();mesh.material.dispose();
});
