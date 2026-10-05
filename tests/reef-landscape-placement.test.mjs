import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { fitReefLandscapeBoulder } from '../src/world/reefLandscapePlacement.js';
import { createCoralLandscape, disposeOrganism } from '../src/world/organisms.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { REEF_ROCKS } from '../src/habitat.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';

function buffers(group){
  const result=[];group.traverse(object=>{if(!object.isMesh)return;
    for(const [name,attribute]of Object.entries({...object.geometry.attributes,index:object.geometry.index}))if(attribute)
      result.push([name,createHash('sha256').update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)).digest('hex')]);
  });return result;
}
function track(group){
  const resources=new Set();group.traverse(object=>{if(!object.isMesh)return;resources.add(object.geometry);resources.add(object.material);
    for(const value of Object.values(object.material))if(value?.isTexture)resources.add(value);});
  const counts=new Map([...resources].map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  return counts;
}
function disposeExactlyOnce(group,counts){disposeOrganism(group);disposeOrganism(group);
  assert.equal(group.children.length,0);assert.equal(group.userData.resources.size,0);
  for(const count of counts.values())assert.equal(count,1);}

test('actual boulder basal vertices fit a flat hard surface without mutating transforms, buffers or resource ownership',()=>{
  const group=createCoralLandscape('boulder',undefined,2,'low'),counts=track(group);
  const geometry=new THREE.PlaneGeometry(8,8).rotateX(-Math.PI/2),material=new THREE.MeshBasicMaterial(),substrate=new THREE.Mesh(geometry,material);
  group.position.set(3,7,-2);group.scale.setScalar(1.3);group.rotation.y=.9;
  const before={position:group.position.toArray(),scale:group.scale.toArray(),quaternion:group.quaternion.toArray(),buffers:buffers(group),keys:[...group.userData.resources]};
  try{
    const fit=fitReefLandscapeBoulder(group,substrate,{x:.2,z:-.3,scale:.85,yaw:.4});
    assert.equal(fit.ok,true);assert.equal(fit.basalVertexSamples,72);
    assert.ok(Math.abs(fit.minBasalGapM+.003)<1e-9);assert.ok(Math.abs(fit.maxBasalGapM+.003)<1e-9);
    assert.ok(fit.visibleCrownAboveHighestSubstrateM>0);
    assert.deepEqual(group.position.toArray(),before.position);assert.deepEqual(group.scale.toArray(),before.scale);
    assert.deepEqual(group.quaternion.toArray(),before.quaternion);assert.deepEqual(buffers(group),before.buffers);
    assert.deepEqual([...group.userData.resources],before.keys);assert.ok([...counts.values()].every(count=>count===0));
    // Independently apply the returned pose and raycast actual scene vertices.
    group.position.fromArray(fit.rootPositionM);group.scale.setScalar(fit.scale);group.rotation.set(0,fit.yaw,0);group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),point=new THREE.Vector3();let checked=0;
    group.traverse(object=>{if(!object.isMesh)return;const p=object.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld);
        if(point.y>-.003+fit.basalBandM+1e-9)continue;
        ray.set(new THREE.Vector3(point.x,1,point.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(substrate,false)[0];assert.ok(hit);assert.ok(Math.abs(point.y-hit.point.y+.003)<1e-8);checked++;
      }
    });assert.ok(checked>=72);
  }finally{disposeExactlyOnce(group,counts);geometry.dispose();material.dispose();}
});

test('current curved reef crown accepts a smaller rigid boulder while steep shoulders, absent hard bottom and unsupported roots fail safely',()=>{
  const group=createCoralLandscape('boulder',undefined,0,'low'),counts=track(group);
  const rock=REEF_ROCKS[0],geometry=createReefRockGeometry(rock,{bedSupported:true}),material=new THREE.MeshBasicMaterial();
  const substrate=new THREE.Mesh(geometry,material);enableStaticRayQueries(substrate);
  const before=buffers(group);
  try{
    // The authorized low-mound crown has curvature across a .9-scale base;
    // keep the same span limit and use a genuinely fitting smaller candidate.
    const centre=fitReefLandscapeBoulder(group,substrate,{x:rock[0],z:rock[2],scale:.65,yaw:.4});assert.equal(centre.ok,true);
    assert.ok(centre.maxBasalGapM<=-.002999999);assert.ok(centre.hardSubstrateSpanM<=centre.crownHeightM*.35);
    const steep=fitReefLandscapeBoulder(group,substrate,{x:rock[0]+rock[3]*.55,z:rock[2],scale:1.1,yaw:.4});
    assert.equal(steep.ok,false);assert.equal(steep.reason,'excessive-hard-substrate-span');
    assert.ok(steep.hardSubstrateSpanM>steep.crownHeightM*.35);
    assert.equal(fitReefLandscapeBoulder(group,substrate,{x:40,z:40,scale:.9}).reason,'missing-hard-substrate');
    assert.equal(fitReefLandscapeBoulder(group,substrate,{x:0,z:0,scale:NaN}).reason,'invalid-options');
    const parent=new THREE.Group();parent.add(group);
    assert.equal(fitReefLandscapeBoulder(group,substrate,{x:0,z:0,scale:.9}).reason,'unsupported-boulder-root');group.removeFromParent();
    assert.deepEqual(group.position.toArray(),[0,0,0]);assert.deepEqual(group.scale.toArray(),[1,1,1]);
    assert.deepEqual(buffers(group),before);assert.ok([...counts.values()].every(count=>count===0));
  }finally{disposeExactlyOnce(group,counts);geometry.dispose();material.dispose();}
});
