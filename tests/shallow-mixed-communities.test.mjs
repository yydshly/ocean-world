import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample} from '../src/shallowSample.js';
import {reefAssemblyGeometries,REEF_ASSEMBLY_PROFILES,nearReefFoundationGeometry} from '../src/world/ShallowNearCommunity.js';
import {oceanRockSurface} from '../src/oceanRockShape.js';
import {ShallowCohesiveFish,COHESIVE_FISH_IDS} from '../src/world/ShallowCohesiveFish.js';

test('mixed whole-colony communities reduce repeated survey blocks and share exact visible support',()=>{
  const model=createShallowSample(55),outcrops=model.rocks.filter(r=>r.fieldAsset);
  assert.ok(outcrops.filter(r=>r.communityVariant!==undefined).length/outcrops.filter(r=>r.fieldAsset==='reefscan').length>.65,'source outskirts retain mixed whole communities');
  assert.equal(new Set(outcrops.filter(r=>r.communityVariant!==undefined).map(r=>r.communityVariant)).size,4);
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(let v=0;v<4;v++){
    const near=reefAssemblyGeometries(v),far=reefAssemblyGeometries(v,'distant'),base=nearReefFoundationGeometry(),root=new THREE.Group();
    assert.ok(['branching','table','massive'].every(form=>Object.keys(near).some(k=>k.startsWith(form))));
    assert.ok(near['table-1']||near['massive-1'],'live source family missing from assembled reef');
    [...Object.values(near),base].forEach(g=>root.add(new THREE.Mesh(g,material)));root.updateMatrixWorld(true);
    let hits=0;
    for(let x=-.6;x<=.6;x+=.046)for(let z=-.6;z<=.6;z+=.049){
      ray.set(new THREE.Vector3(x,3,z),down);const hit=ray.intersectObject(root,true)[0],support=oceanRockSurface(REEF_ASSEMBLY_PROFILES[v],x,z);
      if(hit){assert.ok(support&&Math.abs(support.height-hit.point.y)<1e-6);hits++;}else assert.equal(support,null);
    }
    assert.ok(hits>150);
    const sum=family=>Object.values(family).reduce((n,g)=>n+g.index.count,0);
    assert.ok(sum(far)<sum(near)*.55,'distant complete community is too expensive');
    [...Object.values(near),...Object.values(far),base].forEach(g=>g.dispose());
  }
  material.dispose();
});

test('all principal swimmer tail forks are open rather than filled by centroid fan triangles',()=>{
  const kit=new ShallowCohesiveFish(),ray=new THREE.Raycaster();
  try{for(const id of COHESIVE_FISH_IDS){
    const model=kit.create(id),tail=model.tail.children[0],box=tail.geometry.boundingBox;
    const point=new THREE.Vector3(box.min.x*.83,0,.3).applyMatrix4(tail.matrixWorld);
    ray.set(point,new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(tail).length,0,`${id}: fork notch filled`);
    assert.ok(kit.bodyMaterial.isMeshPhysicalMaterial&&kit.bodyMaterial.clearcoat>0);
  }}finally{kit.dispose();}
});
