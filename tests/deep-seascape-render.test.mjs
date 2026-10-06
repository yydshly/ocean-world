import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeepOceanChunks } from '../src/world/DeepOceanChunks.js';
import { createDeepSeascapePlans } from '../src/deepSeascape.js';

const position={x:-320,z:-576};
// CPU Three matrix/triangle checks verify renderer inputs, not actual browser
// frames, observer-lamp presentation or documentary visual acceptance.
test('same-center committed bed revision refreshes four owners without altering native matrices, prototype assets or outer floor bands',t=>{
  const old=new DeepOceanChunks('42'),scene=new DeepOceanChunks('42',{seascape:true});t.after(()=>{old.dispose();scene.dispose();});
  old.update(position);scene.update(position);const plans=createDeepSeascapePlans(scene.generator,-6,-10),snapshots=new Map();
  for(const[id,record]of scene._chunks){const baseline=old._chunks.get(id);assert.deepEqual(record.terrainGeometry.attributes.position.array,baseline.terrainGeometry.attributes.position.array);
    assert.deepEqual(record.instances.map(m=>m.instanceMatrix.array),baseline.instances.map(m=>m.instanceMatrix.array));
    snapshots.set(id,{record,matrices:new Map(record.instances.map(m=>[m.name,m.instanceMatrix.array.slice()])),bed:record.terrainGeometry.attributes.position.array.slice()});}
  const prototypes=Object.values(scene._geometries),loads=scene.stats.loads,nativeCount=scene.stats.elementCounts.rock;
  assert.equal(Object.hasOwn(old.stats,'seascapeRevision'),false);scene.generator.setSeascapePlans(plans);assert.equal(scene.update(position),true);
  assert.equal(scene.stats.loads,loads+4);assert.equal(scene.stats.seascapeAddedRocks,2);assert.equal(scene.stats.elementCounts.rock,nativeCount+2);
  assert.deepEqual(Object.values(scene._geometries),prototypes);assert.equal(scene.stats.prototypeGeometries,2);assert.equal(scene.stats.prototypeMaterials,3);
  for(const[id,s]of snapshots){const record=scene._chunks.get(id),plan=plans.find(p=>p.id===id);assert.equal(record===s.record,!plan);
    for(const mesh of record.instances){const prior=s.matrices.get(mesh.name);if(prior)assert.deepEqual(mesh.instanceMatrix.array.slice(0,prior.length),prior);}
    const vertices=record.terrainGeometry.attributes.position;
    if(plan)for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){const lx=record.origin.x+x+384,lz=record.origin.z+z+640;
      if(lx<=16||lx>=112||lz<=16||lz>=112||plan.role==='plain')assert.equal(vertices.getY(z*65+x),s.bed[(z*65+x)*3+1]);}
    else assert.deepEqual(vertices.array,s.bed);
  }
  assert.ok(scene.stats.drawCalls<=36&&scene.stats.elementCounts.rock<=72&&scene.stats.elementCounts.rubble<=216);
  assert.equal(scene.stats.naturalLight,0);assert.equal(scene.stats.photosyntheticScenery,0);assert.equal(scene.update(position),false);
  const kept=scene._chunks.get('-6,-9');scene.generator.setSeascapePlans([structuredClone(plans[2])]);scene.update(position);
  assert.equal(scene._chunks.get('-6,-9'),kept);
});

test('actual re-based 1m floor triangles and two real wide instanced rock caps agree with physical height and normals',t=>{
  const scene=new DeepOceanChunks('42',{seascape:true});t.after(()=>scene.dispose());const plans=createDeepSeascapePlans(scene.generator,-6,-10);
  scene.generator.setSeascapePlans(plans);scene.update(position);scene.setRenderOrigin({x:-384,z:-640});scene.root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();let rockError=0,floorError=0,checked=0;
  const group=plans[0].group;
  for(const[x,z]of[[group.seam.center.x-.17,group.seam.center.z+.29],[group.seam.center.x+.23,group.seam.center.z-.19],[-351.37,-612.29],[-289.61,-607.14]]){
    const record=scene._chunks.get(`${Math.floor(x/64)},${Math.floor(z/64)}`),floor=record.group.children.find(m=>m.userData.landscapeKind==='floor');
    ray.set(new THREE.Vector3(x-scene.renderOrigin.x,30,z-scene.renderOrigin.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(floor)[0];assert.ok(hit);
    const support=scene.generator.floorSurface(x,z),error=Math.abs(hit.point.y-support.height);floorError=Math.max(floorError,error);assert.ok(error<1e-8);
    for(const axis of['x','y','z'])assert.ok(Math.abs(hit.face.normal[axis]-support.normal[axis])<1e-8);}
  for(const plan of plans)for(const id of plan.addedRockIds){const rock=plan.elements.find(e=>e.id===id),record=scene._chunks.get(plan.id);
    const mesh=record.instances.find(m=>m.userData.elementIds.includes(id)),index=mesh.userData.elementIds.indexOf(id);
    for(const[dx,dz]of[[0,0],[.17,.09],[-.15,-.08]]){const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);matrix.premultiply(mesh.matrixWorld);
      const p=new THREE.Vector3(dx,0,dz).applyMatrix4(matrix);ray.set(new THREE.Vector3(p.x,30,p.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(mesh).find(h=>h.instanceId===index);assert.ok(hit);
      const x=p.x+scene.renderOrigin.x,z=p.z+scene.renderOrigin.z,actual=scene.generator.supportAt(x,z);
      assert.equal(actual.elementId,rock.id);const error=Math.abs(actual.height-hit.point.y);rockError=Math.max(rockError,error);assert.ok(error<1e-5);
      assert.ok(scene.generator.heightForCamera(x,z)>=hit.point.y-1e-5);checked++;}}
  assert.equal(checked,6);t.diagnostic(`seed=string:42 group=-6,-10 floor triangle max error=${floorError}m wide-rock cap max error=${rockError}m`);
});

test('temporary complete birth views are undrawn; unload/revisit/reset preserve opt-in and release owned resources exactly once',t=>{
  const scene=new DeepOceanChunks('42',{seascape:true});t.after(()=>scene.dispose());scene.update(position);
  const plans=createDeepSeascapePlans(scene.generator,-6,-10),initial=[...scene._chunks.values()],released=new Map();
  const track=()=>{for(const record of scene._chunks.values())for(const resource of[record.terrainGeometry,...record.instances])if(!released.has(resource)){
    released.set(resource,0);resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)+1));}};track();
  let prototypes=0,materials=0;Object.values(scene._geometries).forEach(r=>r.addEventListener('dispose',()=>prototypes++));
  [...Object.values(scene._materials),scene._terrainMaterial].forEach(r=>r.addEventListener('dispose',()=>materials++));
  scene.generator.withSeascapePlans(plans,()=>{assert.equal(scene.update({x:1500,z:-1500}),false);assert.deepEqual([...scene._chunks.values()],initial);
    assert.equal(scene.stats.seascapeRevision,0);assert.equal(scene.stats.seascapeAddedRocks,0);});
  scene.generator.setSeascapePlans(plans);scene.update(position);track();scene.update({x:1500,z:-1500});track();scene.update(position);track();
  assert.equal(scene.stats.seascapeAddedRocks,2);assert.equal(prototypes,0);assert.equal(materials,0);
  scene.reset('42');track();assert.equal(scene.generator.seascapeRevision,0);assert.equal(scene.stats.activeChunks,9);
  assert.ok(Array.isArray(scene.generator.seascapeRouteStops));scene.dispose();scene.dispose();
  assert.ok([...released.values()].every(n=>n===1));assert.equal(prototypes,2);assert.equal(materials,3);assert.equal(scene.stats.activeChunks,0);
});
