import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { floorHeight } from '../src/kelpHabitat.js';

test('streaming keeps exactly nine chunks and bounded draw/instance/prototype counts along positive and negative routes', () => {
  const chunks=new KelpOceanChunks('42'),geometries=Object.values(chunks._geometries);let actualPairChecked=false;
  for(const [x,z]of [[3,5],[67,-59],[323,-59],[641,321],[-519,-383],[-305,-80],[1000259,-1000123]]){
    assert.equal(chunks.update({x,z}),true);assert.equal(chunks.root.children.length,9);assert.equal(chunks.stats.activeChunks,9);
    const formationMeshes=[...chunks._chunks.values()].flatMap(record=>record.instances.filter(mesh=>mesh.userData.landscapeKind==='formation'));
    assert.equal(chunks.stats.formationDrawCalls,formationMeshes.length);
    assert.ok(chunks.stats.drawCalls-chunks.stats.formationDrawCalls<=54,'original floor/base/rock/kelp draw budget remains bounded');
    assert.ok(chunks.stats.drawCalls<=81&&chunks.stats.drawCalls<=chunks.stats.maxDrawCalls);assert.ok(chunks.stats.ownedRockBaseGeometries<=9);
    assert.ok(chunks.stats.elementCounts.rock<=9*32&&chunks.stats.elementCounts.kelp<=9*72);
    assert.equal(chunks.stats.elementCounts.formation,formationMeshes.reduce((count,mesh)=>count+mesh.count,0));
    assert.ok(chunks.stats.elementCounts.formation<=18);
    const pair=chunks.stats.landformGroups.find(group=>group.residentFormationCount===2);
    if(pair){
      chunks.root.updateMatrixWorld(true);const ray=new THREE.Raycaster();
      for(const id of pair.elementIds){
        const mesh=formationMeshes.find(item=>item.userData.elementIds.includes(id));assert.ok(mesh);
        const matrix=new THREE.Matrix4();mesh.getMatrixAt(mesh.userData.elementIds.indexOf(id),matrix);matrix.premultiply(mesh.matrixWorld);
        const point=new THREE.Vector3(0,0,0).applyMatrix4(matrix);
        ray.set(new THREE.Vector3(point.x,30,point.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
        assert.ok(Math.abs(chunks.generator.heightAt(point.x,point.z)-hit.point.y)<1e-5,'actual paired instanced mesh belongs to solid support');
      }
      actualPairChecked=true;
    }
    assert.equal(chunks.stats.prototypeGeometries,4);assert.deepEqual(Object.values(chunks._geometries),geometries);
    assert.ok(chunks.generator.cacheStats().chunks<=32);
  }
  assert.equal(actualPairChecked,true,'the route exercises a real co-oriented paired outcrop');
  const loads=chunks.stats.loads;assert.equal(chunks.update({x:1000260,z:-1000124}),false);assert.equal(chunks.stats.loads,loads);
  assert.throws(()=>chunks.update({x:NaN,z:0}));assert.equal(chunks.stats.activeChunks,9);chunks.dispose();
});

test('actual terrain vertices, normals and texture coordinates match across chunk seams and keep the original central floor', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:67,z:-59});
  const a=chunks._chunks.get('1,-1').terrainGeometry,b=chunks._chunks.get('2,-1').terrainGeometry;
  for(let row=0;row<=32;row++){
    const left=row*33+32,right=row*33;
    assert.equal(a.attributes.position.getY(left),b.attributes.position.getY(right));
    for(const axis of ['X','Y','Z'])assert.equal(a.attributes.normal[`get${axis}`](left),b.attributes.normal[`get${axis}`](right));
    for(const axis of ['X','Y'])assert.equal(a.attributes.uv[`get${axis}`](left),b.attributes.uv[`get${axis}`](right));
  }
  const central=chunks._chunks.get('0,0').terrainGeometry;
  for(let row=0;row<15;row++)for(let col=0;col<15;col++){
    const index=row*33+col,x=central.attributes.position.getX(index),z=central.attributes.position.getZ(index);
    assert.equal(central.attributes.position.getY(index),Math.fround(floorHeight(x,z)));
  }
  chunks.dispose();
});

test('actual instanced rock matrices expose the same support triangles as the generator under rotations', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:323,z:-59});chunks.root.updateMatrixWorld(true);
  const record=chunks._chunks.get('4,-1'),ray=new THREE.Raycaster();let checked=0;
  for(const mesh of record.instances.filter(mesh=>mesh.userData.landscapeKind==='rock')){
    for(let index=0;index<mesh.count;index++){
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);matrix.premultiply(mesh.matrixWorld);
      const position=new THREE.Vector3(0,0,0).applyMatrix4(matrix);
      ray.set(new THREE.Vector3(position.x,20,position.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
      // Instance matrices are Float32; the same shared triangles can differ by
      // a few micrometres after their translated/rotated transform is rounded.
      assert.ok(Math.abs(chunks.generator.heightAt(position.x,position.z)-hit.point.y)<1e-5);checked++;
    }
  }
  assert.ok(checked>10);chunks.dispose();
});

test('floating render origins move chunk groups while logical anchors, local matrices and landscape motion phase remain stable', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:1000259,z:-1000123});
  const records=[...chunks._chunks.values()],matrices=records.map(r=>r.instances.map(mesh=>Array.from(mesh.instanceMatrix.array)));
  const elements=JSON.stringify(records.map(r=>chunks.generator.chunk(...r.group.userData.chunkId.split(',').map(Number)).elements));
  chunks.setEnvironment({currentMps:.42},14.2);assert.equal(chunks.setRenderOrigin({x:1000192,z:-1000128}),true);
  for(let i=0;i<records.length;i++){
    const record=records[i];assert.equal(record.group.position.x+chunks.renderOrigin.x,record.origin.x);
    assert.equal(record.group.position.z+chunks.renderOrigin.z,record.origin.z);
    assert.deepEqual(record.instances.map(mesh=>Array.from(mesh.instanceMatrix.array)),matrices[i]);
  }
  assert.equal(JSON.stringify(records.map(r=>chunks.generator.chunk(...r.group.userData.chunkId.split(',').map(Number)).elements)),elements);
  assert.equal(chunks.stats.animation.clockSec,14.2);assert.equal(chunks.setRenderOrigin({x:1000192,z:-1000128}),false);
  chunks.dispose();
});

test('a paused visual clock leaves sway uniforms unchanged and updates never regenerate plants or GPU prototypes', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:67,z:-59});
  const geometries=[...Object.values(chunks._geometries),...[...chunks._chunks.values()].map(r=>r.terrainGeometry)];
  const matrix=JSON.stringify([...chunks._chunks.values()].map(r=>r.instances.map(mesh=>Array.from(mesh.instanceMatrix.array))));
  chunks.setEnvironment({currentMps:.18},31.4);
  for(let i=0;i<30;i++)chunks.setEnvironment({currentMps:.18},31.4);
  assert.equal(chunks._uniforms.time.value,31.4);assert.equal(chunks.stats.animation.clockSec,31.4);
  assert.deepEqual([...Object.values(chunks._geometries),...[...chunks._chunks.values()].map(r=>r.terrainGeometry)],geometries);
  assert.equal(JSON.stringify([...chunks._chunks.values()].map(r=>r.instances.map(mesh=>Array.from(mesh.instanceMatrix.array)))),matrix);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>'};chunks._materials.kelp.onBeforeCompile(shader);
  assert.equal(shader.uniforms.kelpOceanTime,chunks._uniforms.time);assert.ok(shader.vertexShader.includes('kelpTip=kelpFraction*kelpFraction'));
  chunks.setEnvironment({currentMps:.65},32.4);assert.equal(chunks._uniforms.flow.value,.65);assert.equal(chunks._uniforms.time.value,32.4);
  assert.equal(chunks.stats.landscapeRole,'decorative-plants-not-simulated-biomass');chunks.dispose();
});

test('detailed ecological hosts replace only matching landscape plants and restore their exact original matrices', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:67,z:-59});
  const mesh=[...chunks._chunks.values()].flatMap(r=>r.instances).find(mesh=>mesh.userData.landscapeKind==='kelp'&&mesh.count>=4);
  const [first,second,third,fourth]=mesh.userData.elementIds,original=mesh.instanceMatrix.array.slice();
  assert.equal(chunks.setDetailedHosts([first,second,third,fourth]),true);assert.equal(chunks.stats.detailedHostIds.length,4);
  for(let i=0;i<4;i++){assert.equal(mesh.instanceMatrix.array[i*16],0);assert.equal(mesh.instanceMatrix.array[i*16+5],0);assert.equal(mesh.instanceMatrix.array[i*16+10],0);}
  assert.equal(chunks.setDetailedHosts([fourth,third,second,first]),false);
  assert.equal(chunks.setDetailedHosts([]),true);assert.deepEqual(mesh.instanceMatrix.array,original);
  const future=chunks.generator.chunk(8,2).elements.find(e=>e.kind==='kelp');assert.ok(future);
  chunks.setDetailedHosts([future.id]);chunks.update({x:8*64+10,z:2*64+10});
  const loaded=chunks._chunks.get('8,2').instances.find(mesh=>mesh.userData.landscapeKind==='kelp'),index=loaded.userData.elementIds.indexOf(future.id);
  assert.ok(index>=0);assert.equal(loaded.instanceMatrix.array[index*16+5],0);
  chunks.setDetailedHosts([]);assert.deepEqual(loaded.instanceMatrix.array,loaded.userData.landscapeMatrices);chunks.dispose();
});

test('eviction and dispose release owned terrain and instance resources exactly once without disposing borrowed materials or textures', () => {
  const texture=new THREE.DataTexture(new Uint8Array([1,2,3,255]),1,1),borrowed=new THREE.MeshStandardMaterial({map:texture});
  let borrowedDisposed=0,textureDisposed=0;borrowed.addEventListener('dispose',()=>borrowedDisposed++);texture.addEventListener('dispose',()=>textureDisposed++);
  const chunks=new KelpOceanChunks('42',{sandMaterial:borrowed});chunks.update({x:67,z:-59});
  const old=[...chunks._chunks.values()],terrainCount=old.length,instanceCount=old.reduce((n,r)=>n+r.instances.length,0);
  let terrainDisposed=0,basesDisposed=0,instancesDisposed=0,prototypesDisposed=0,materialsDisposed=0;
  const baseCount=old.filter(record=>record.rockBaseGeometry).length;
  for(const record of old){record.terrainGeometry.addEventListener('dispose',()=>terrainDisposed++);
    record.rockBaseGeometry?.addEventListener('dispose',()=>basesDisposed++);for(const mesh of record.instances)mesh.addEventListener('dispose',()=>instancesDisposed++);}
  for(const geometry of Object.values(chunks._geometries))geometry.addEventListener('dispose',()=>prototypesDisposed++);
  for(const material of [...Object.values(chunks._materials),chunks._terrainMaterial])material.addEventListener('dispose',()=>materialsDisposed++);
  chunks.update({x:1500,z:-1200});assert.equal(terrainDisposed,terrainCount);assert.equal(basesDisposed,baseCount);assert.equal(instancesDisposed,instanceCount);
  assert.equal(prototypesDisposed,0);assert.equal(materialsDisposed,0);
  chunks.dispose();chunks.dispose();assert.equal(prototypesDisposed,4);assert.equal(materialsDisposed,3);
  assert.equal(borrowedDisposed,0);assert.equal(textureDisposed,0);assert.equal(chunks.root.children.length,0);
  assert.equal(chunks.generator.cacheStats().chunks,0);assert.equal(chunks.stats.activeChunks,0);
  borrowed.dispose();texture.dispose();
});

test('reset regenerates only its own landscape seed, clears detailed substitutions and keeps the rendering origin', () => {
  const chunks=new KelpOceanChunks('42');chunks.update({x:67,z:-59});chunks.setRenderOrigin({x:64,z:-64});
  const before=JSON.stringify(chunks.generator.chunk(1,-1).elements);
  chunks.setDetailedHosts([chunks.generator.chunk(1,-1).elements.find(e=>e.kind==='kelp').id]);
  chunks.setEnvironment({currentMps:.18},44);assert.equal(chunks.reset('77'),true);
  assert.notEqual(JSON.stringify(chunks.generator.chunk(1,-1).elements),before);assert.equal(chunks.stats.seed,'77');
  assert.deepEqual(chunks.stats.renderOrigin,{x:64,z:-64});assert.deepEqual(chunks.stats.detailedHostIds,[]);
  assert.equal(chunks.stats.animation.clockSec,0);assert.equal(chunks.stats.activeChunks,9);chunks.dispose();
  assert.equal(chunks.update({x:0,z:0}),false);assert.equal(chunks.reset('42'),false);
});
