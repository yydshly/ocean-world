import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { createKelpForestBeltPlans } from '../src/kelpForestBelt.js';

const position = {x:-352,z:-96};
const meshOf = (record,kind) => record.instances.filter(mesh=>mesh.userData.landscapeKind===kind);
const arrays = geometry => Object.fromEntries(['position','normal','uv'].map(name=>[name,geometry.attributes[name].array.slice()]));

// CPU Three geometry, matrices and static triangle queries are evidence of
// renderer inputs. They are not browser/WebGL or animated visual acceptance.
test('same-center publication reloads only changed owners, preserving every old bed/solid/root instance and shared resource', t => {
  const old = new KelpOceanChunks('42'), scene = new KelpOceanChunks('42',{forestBelt:true});
  t.after(()=>{old.dispose();scene.dispose();});
  old.update(position); scene.update(position);
  const plans = createKelpForestBeltPlans(scene.generator,-6,-2), snapshots = new Map(), geometries = Object.values(scene._geometries);
  for (const [id,record] of scene._chunks) {
    const baseline = old._chunks.get(id);
    assert.deepEqual(arrays(record.terrainGeometry),arrays(baseline.terrainGeometry));
    assert.deepEqual(record.instances.map(mesh=>mesh.instanceMatrix.array),baseline.instances.map(mesh=>mesh.instanceMatrix.array));
    snapshots.set(id,{record,bed:arrays(record.terrainGeometry),indices:record.terrainGeometry.index.array.slice(),
      matrices:new Map(record.instances.map(mesh=>[mesh.name,mesh.instanceMatrix.array.slice()]))});
  }
  assert.equal(Object.hasOwn(old.stats,'forestBeltRevision'),false);
  const loads = scene.stats.loads, nativeKelps = scene.stats.elementCounts.kelp;
  scene.generator.setForestPlans(plans); assert.equal(scene.update(position),true);
  assert.equal(scene.stats.loads,loads+4); assert.equal(scene.stats.activeChunks,9);
  assert.equal(scene.stats.forestBeltRevision,1); assert.equal(scene.stats.forestBeltAddedRoots,16);
  assert.equal(scene.stats.elementCounts.kelp,nativeKelps+16);
  assert.deepEqual(Object.values(scene._geometries),geometries);
  for (const [id,snapshot] of snapshots) {
    const record = scene._chunks.get(id), changed = plans.some(p=>p.id===id);
    assert.equal(record===snapshot.record,!changed);
    assert.deepEqual(arrays(record.terrainGeometry),snapshot.bed);
    assert.deepEqual(record.terrainGeometry.index.array,snapshot.indices);
    for (const mesh of record.instances) {
      const original = snapshot.matrices.get(mesh.name);
      if (original) assert.deepEqual(mesh.instanceMatrix.array.slice(0,original.length),original);
    }
  }
  const afterLoads=scene.stats.loads; assert.equal(scene.update(position),false);assert.equal(scene.stats.loads,afterLoads);
  const kept=scene._chunks.get('-6,-1');
  scene.generator.setForestPlans([structuredClone(plans[2])]);scene.update(position);
  assert.equal(scene._chunks.get('-6,-1'),kept,'equal saved plan retains matrix/terrain resource identity when the halo changes');
  assert.ok(scene.stats.drawCalls<=81&&scene.stats.elementCounts.kelp<=9*72);
});

test('sixteen appended actual kelp matrices are grounded on their existing rendered hard-cap triangles through rebases', t => {
  const scene = new KelpOceanChunks('42',{forestBelt:true});t.after(()=>scene.dispose());
  const plans=createKelpForestBeltPlans(scene.generator,-6,-2);scene.generator.setForestPlans(plans);scene.update(position);
  scene.setRenderOrigin({x:-384,z:-128});scene.root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),matrix=new THREE.Matrix4();let checked=0,maxContactError=0;
  for(const plan of plans){
    const record=scene._chunks.get(plan.id),kelp=meshOf(record,'kelp')[0];
    for(const id of plan.addedRootIds){
      const plant=plan.elements.find(p=>p.id===id),index=kelp.userData.elementIds.indexOf(id);assert.ok(index>=0);
      kelp.getMatrixAt(index,matrix);matrix.premultiply(kelp.matrixWorld);
      const root=new THREE.Vector3().applyMatrix4(matrix),logical=new THREE.Vector3(root.x+scene.renderOrigin.x,root.y,root.z+scene.renderOrigin.z);
      assert.ok(logical.distanceTo(new THREE.Vector3(plant.x,plant.y,plant.z))<1e-5);
      const hostMesh=meshOf(record,'rock').find(mesh=>mesh.userData.elementIds.includes(plant.hostId));assert.ok(hostMesh);
      const hostIndex=hostMesh.userData.elementIds.indexOf(plant.hostId);
      ray.set(new THREE.Vector3(root.x,30,root.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(hostMesh).find(hit=>hit.instanceId===hostIndex);assert.ok(hit);
      const error=Math.abs(hit.point.y-root.y);maxContactError=Math.max(maxContactError,error);assert.ok(error<1e-5);
      const peak=scene._geometries.kelp.boundingBox.max.y*plant.lengthM+plant.y;
      assert.ok(peak<scene.generator.surfaceY,'actual existing static kelp mesh crown remains submerged; sway only changes XZ');checked++;
    }
  }
  assert.equal(checked,16);t.diagnostic(`seed=string:42 group=-6,-2 appended=${checked} hard-cap max triangle contact error=${maxContactError}m`);
  const hidden=plans[2].addedRootIds[0];scene.setDetailedHosts([hidden]);
  const kelp=meshOf(scene._chunks.get('-6,-1'),'kelp')[0],index=kelp.userData.elementIds.indexOf(hidden);
  assert.equal(kelp.instanceMatrix.array[index*16+5],0);scene.setDetailedHosts([]);
  assert.deepEqual(kelp.instanceMatrix.array,kelp.userData.landscapeMatrices);
});

test('temporary candidate scenery stays undrawn and eviction/revisit/reset release owned resources once while retaining opt-in', t => {
  const scene=new KelpOceanChunks('42',{forestBelt:true});t.after(()=>scene.dispose());scene.update(position);
  const plans=createKelpForestBeltPlans(scene.generator,-6,-2),initial=[...scene._chunks.values()],loads=scene.stats.loads;
  const released=new Map(),track=records=>{
    for(const record of records)for(const resource of [record.terrainGeometry,record.rockBaseGeometry,...record.instances].filter(Boolean))
      if(!released.has(resource)){released.set(resource,0);resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)+1));}
  };
  track(initial);let prototypeReleases=0,materialReleases=0;
  Object.values(scene._geometries).forEach(resource=>resource.addEventListener('dispose',()=>prototypeReleases++));
  [...Object.values(scene._materials),scene._terrainMaterial].forEach(resource=>resource.addEventListener('dispose',()=>materialReleases++));
  scene.generator.withForestPlans(plans,()=>{
    assert.equal(scene.generator.chunk(-6,-1).counts.kelp,25);
    assert.equal(scene.update({x:1500,z:1500}),false);
    assert.deepEqual([...scene._chunks.values()],initial);assert.equal(scene.stats.loads,loads);
    assert.equal(scene.stats.forestBeltRevision,0);assert.equal(scene.stats.forestBeltAddedRoots,0);
  });
  scene.generator.setForestPlans(plans);scene.update(position);track([...scene._chunks.values()]);
  scene.update({x:1500,z:1500});track([...scene._chunks.values()]);
  scene.update(position);assert.equal(scene.stats.forestBeltAddedRoots,16);track([...scene._chunks.values()]);
  assert.equal(prototypeReleases,0);assert.equal(materialReleases,0);
  scene.generator.setForestPlans([]);scene.update(position);track([...scene._chunks.values()]);
  assert.equal(scene.stats.forestBeltAddedRoots,0);assert.equal(scene.generator.chunk(-6,-1).counts.kelp,15);
  scene.reset('42');track([...scene._chunks.values()]);assert.equal(scene.generator.forestBeltRevision,0);
  assert.ok(Array.isArray(scene.generator.forestRouteStops));assert.equal(scene.stats.activeChunks,9);
  scene.dispose();scene.dispose();
  assert.ok([...released.values()].every(count=>count===1));assert.equal(prototypeReleases,4);assert.equal(materialReleases,3);
  assert.equal(scene.root.children.length,0);assert.equal(scene.stats.activeChunks,0);
});
