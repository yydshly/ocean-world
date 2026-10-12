import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {oceanRockMesh} from '../src/oceanRockShape.js';
import {shallowCoveredRockPatches,shallowFolioseGeometries} from '../src/world/ShallowHabitatForms.js';

test('attached-cover rock rendering preserves every original supporting vertex and triangle with bounded spatial batches',()=>{
  const rocks=[{profile:'sample-slope-a',x:7.2,y:-.15,z:8.3,scale:{x:15.2,y:2.9,z:7.6},rotation:.037},
    {profile:'sample-slope-b',x:14,y:-.1,z:8.5,scale:{x:15.2,y:3,z:7.6},rotation:-.029}];
  const patches=shallowCoveredRockPatches(rocks);assert.equal(patches.length,1);
  const g=patches[0],p=g.attributes.position,v=new THREE.Vector3(),m=new THREE.Matrix4();let vertex=0,index=0;
  for(const r of rocks){
    const src=oceanRockMesh(r.profile);m.compose(new THREE.Vector3(r.x,r.y,r.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r.rotation),new THREE.Vector3(r.scale.x,r.scale.y,r.scale.z));
    const offset=vertex;
    for(let i=0;i<src.positions.length;i+=3){v.fromArray(src.positions,i).applyMatrix4(m);assert.ok(v.distanceTo(new THREE.Vector3().fromBufferAttribute(p,vertex++))<2e-6);}
    for(const id of src.indices)assert.equal(g.index.getX(index++),id+offset);
  }
  assert.equal(vertex,p.count);assert.equal(index,g.index.count);
  const colors=g.attributes.color;assert.ok(new Set(Array.from({length:colors.count},(_,i)=>colors.getX(i).toFixed(2))).size>12,'attached cover must vary over the physical surface');
  patches.forEach(g=>g.dispose());
});

test('foliose front-slope cover and upgraded patrol animals share the actual habitat and finite scene budget',()=>{
  const world=new ShallowSampleScene(),near=shallowFolioseGeometries(),far=shallowFolioseGeometries('distant');
  try{
    for(const key of Object.keys(near)){
      assert.ok(far[key].index.count<near[key].index.count);assert.ok(near[key].index.count/3<3000);
      for(const g of [near[key],far[key]]){const p=g.attributes.position;for(let i=0;i<p.count;i++){assert.ok(p.getY(i)>=0&&p.getY(i)<=1);assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.5);}}
    }
    assert.equal(world.model.rocks.filter(r=>r.fieldAsset==='habitat-bank').length,12);
    assert.ok(!world.model.rocks.some(r=>r.profile.startsWith('sample-slope-')),'obsolete broad ramp returned');
    for(const id of ['longfin-batfish','humphead-wrasse']){
      const batch=world.animals.batches.find(b=>b.id===id);assert.equal(batch.assetFamily,'community-fish');
      assert.ok(!world.animals.templatesAgents.some(a=>a.speciesId===id),'legacy body still renders beside its replacement');
    }
    assert.equal(world.model.agents.length,293);let meshes=0;world.scene.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<350);
  }finally{world.dispose();Object.values(near).forEach(g=>g.dispose());Object.values(far).forEach(g=>g.dispose());}
});
