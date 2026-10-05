import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeepOceanChunks } from '../src/world/DeepOceanChunks.js';
import { deepFloorHeight } from '../src/deepHabitat.js';

test('actual shared terrain edges match heights, normals, colour and UVs in negative and positive cells', t => {
  const ocean = new DeepOceanChunks('42'); t.after(() => ocean.dispose()); ocean.update({ x: 3, z: 5 });
  for (const cx of [-1, 0]) {
    const a = ocean._chunks.get(`${cx},0`), b = ocean._chunks.get(`${cx + 1},0`);
    for (let row = 0; row <= 64; row++) {
      const left = row * 65 + 64, right = row * 65;
      for (const name of ['position', 'normal', 'color', 'uv']) {
        const aa = a.terrainGeometry.attributes[name], bb = b.terrainGeometry.attributes[name];
        for (let axis = 0; axis < aa.itemSize; axis++) {
          const offsetA = name === 'position' && axis === 0 ? a.origin.x : name === 'position' && axis === 2 ? a.origin.z : 0;
          const offsetB = name === 'position' && axis === 0 ? b.origin.x : name === 'position' && axis === 2 ? b.origin.z : 0;
          assert.equal(aa.array[left * aa.itemSize + axis] + offsetA, bb.array[right * bb.itemSize + axis] + offsetB);
        }
      }
    }
  }
  const central = ocean._chunks.get('0,0').terrainGeometry;
  for (let z = 0; z <= 25; z += 3) for (let x = 0; x <= 25; x += 3) {
    assert.equal(central.attributes.position.getY(z * 65 + x), Math.fround(deepFloorHeight(x, z)));
  }
});

test('actual ground triangles expose the same metre-scale height and support normals as the generator', t => {
  const ocean = new DeepOceanChunks('42'); t.after(() => ocean.dispose()); ocean.update({ x: 323, z: -59 }); ocean.root.updateMatrixWorld(true);
  const terrain = ocean._chunks.get('4,-1').group.children[0], ray = new THREE.Raycaster();
  for (const [x, z] of [[260.31, -59.22], [271.76, -23.83], [287.27, -14.69], [319.12, -2.78]]) {
    ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObject(terrain)[0]; assert.ok(hit);
    const support = ocean.generator.floorSurface(x, z);
    assert.ok(Math.abs(hit.point.y - support.height) < 1e-9);
    assert.ok(hit.face.normal.distanceTo(new THREE.Vector3(support.normal.x, support.normal.y, support.normal.z)) < 1e-9);
  }
});

test('rock instance transforms and rotated support queries describe the same actual triangles', t => {
  const ocean = new DeepOceanChunks('42'); t.after(() => ocean.dispose()); ocean.update({ x: -17, z: -617 }); ocean.root.updateMatrixWorld(true);
  const record = ocean._chunks.get('-1,-10'), ray = new THREE.Raycaster(); let checked = 0;
  for (const mesh of record.instances) for (let index = 0; index < mesh.count; index++) {
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
    const point = new THREE.Vector3(.021, 0, .033).applyMatrix4(matrix);
    ray.set(new THREE.Vector3(point.x, 20, point.z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(mesh).filter(hit => hit.instanceId === index); assert.ok(hits.length);
    const expected = Math.max(ocean.generator.floorSurface(point.x, point.z).height, hits[0].point.y);
    assert.ok(Math.abs(ocean.generator.heightAt(point.x, point.z) - expected) < 1e-5); checked++;
  }
  assert.ok(checked >= 20);
});

test('positive, negative and far routes retain nine scenery regions and a bounded cache without adding illumination or plants', t => {
  const ocean = new DeepOceanChunks('42'); t.after(() => ocean.dispose()); const prototypes = Object.values(ocean._geometries);
  for (const [x, z] of [[3, 5], [67, -59], [323, -59], [-17, -617], [1000259, -1000123]]) {
    assert.equal(ocean.update({ x, z }), true); assert.equal(ocean.root.children.length, 9); assert.equal(ocean.stats.activeChunks, 9);
    assert.ok(ocean.stats.drawCalls <= 36 && ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
    assert.ok(ocean.stats.elementCounts.rock <= 72 && ocean.stats.elementCounts.rubble <= 216);
    assert.deepEqual(Object.values(ocean._geometries), prototypes); assert.equal(ocean.stats.prototypeGeometries, 2);
    assert.ok(ocean.generator.cacheStats().chunks <= 32); assert.equal(ocean.stats.naturalLight, 0); assert.equal(ocean.stats.photosyntheticScenery, 0);
    ocean.root.traverse(object => assert.ok(!object.isLight, 'the landscape introduces no daylight or observer-light duplicates'));
  }
  const loads = ocean.stats.loads; assert.equal(ocean.update({ x: 1000260, z: -1000124 }), false); assert.equal(ocean.stats.loads, loads);
  assert.throws(() => ocean.update({ x: NaN, z: 0 })); assert.equal(ocean.stats.activeChunks, 9);
});

test('floating origins and environmental controls leave local geometry and scenery seeds stable', t => {
  const ocean = new DeepOceanChunks('42'); t.after(() => ocean.dispose()); ocean.update({ x: 1000259, z: -1000123 });
  const records = [...ocean._chunks.values()], matrices = records.map(record => record.instances.map(mesh => Array.from(mesh.instanceMatrix.array)));
  const data = records.map(record => JSON.stringify(ocean.generator.chunk(...record.group.userData.chunkId.split(',').map(Number))));
  const loads = ocean.stats.loads; assert.equal(ocean.setRenderOrigin({ x: 1000192, z: -1000128 }), true);
  assert.equal(ocean.setRenderOrigin({ x: 1000192, z: -1000128 }), false); assert.equal(ocean.stats.loads, loads);
  ocean.setEnvironment({ currentMps: .12, observerLight: 1 }, 31.4);
  for (let index = 0; index < records.length; index++) {
    const record = records[index]; assert.equal(record.group.position.x + ocean.renderOrigin.x, record.origin.x);
    assert.equal(record.group.position.z + ocean.renderOrigin.z, record.origin.z);
    assert.ok(Math.abs(record.group.position.x) <= 128 && Math.abs(record.group.position.z) <= 128);
    assert.deepEqual(record.instances.map(mesh => Array.from(mesh.instanceMatrix.array)), matrices[index]);
    assert.equal(JSON.stringify(ocean.generator.chunk(...record.group.userData.chunkId.split(',').map(Number))), data[index]);
    assert.ok([...record.terrainGeometry.attributes.position.array].every(Number.isFinite));
  }
  ocean.setEnvironment({ currentMps: .12, observerLight: 0 }, 31.4);
  assert.equal(ocean.stats.environment.clockSec, 31.4); assert.equal(ocean.stats.environment.observerLight, 0);
  assert.deepEqual(records, [...ocean._chunks.values()]);
});

test('eviction, reset and repeated disposal release owned resources once and preserve borrowed materials/textures', () => {
  const texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1), borrowed = new THREE.MeshStandardMaterial({ map: texture });
  let borrowedDisposed = 0, textureDisposed = 0;
  borrowed.addEventListener('dispose', () => borrowedDisposed++); texture.addEventListener('dispose', () => textureDisposed++);
  const ocean = new DeepOceanChunks('42', { sandMaterial: borrowed }); ocean.update({ x: -17, z: -617 });
  const records = [...ocean._chunks.values()]; let terrainDisposed = 0, instancesDisposed = 0, prototypesDisposed = 0, materialsDisposed = 0;
  const instanceCount = records.reduce((sum, record) => sum + record.instances.length, 0);
  for (const record of records) {
    record.terrainGeometry.addEventListener('dispose', () => terrainDisposed++);
    for (const mesh of record.instances) mesh.addEventListener('dispose', () => instancesDisposed++);
  }
  for (const geometry of Object.values(ocean._geometries)) geometry.addEventListener('dispose', () => prototypesDisposed++);
  for (const material of [...Object.values(ocean._materials), ocean._terrainMaterial]) material.addEventListener('dispose', () => materialsDisposed++);
  assert.notEqual(ocean._terrainMaterial, borrowed); assert.equal(ocean._terrainMaterial.map, texture);
  ocean.update({ x: 1500, z: -1200 }); assert.equal(terrainDisposed, 9); assert.equal(instancesDisposed, instanceCount);
  assert.equal(prototypesDisposed, 0); assert.equal(materialsDisposed, 0);
  ocean.setRenderOrigin({ x: 1472, z: -1216 }); const before = JSON.stringify(ocean.generator.chunk(23, -19));
  assert.equal(ocean.reset('different'), true); assert.notEqual(JSON.stringify(ocean.generator.chunk(23, -19)), before);
  assert.deepEqual(ocean.stats.renderOrigin, { x: 1472, z: -1216 }); assert.equal(ocean.stats.activeChunks, 9);
  ocean.dispose(); ocean.dispose(); assert.equal(prototypesDisposed, 2); assert.equal(materialsDisposed, 3);
  assert.equal(borrowedDisposed, 0); assert.equal(textureDisposed, 0); assert.equal(ocean.root.children.length, 0);
  assert.equal(ocean.generator.cacheStats().chunks, 0); assert.equal(ocean.stats.activeChunks, 0);
  assert.equal(ocean.update({ x: 0, z: 0 }), false); assert.equal(ocean.reset('42'), false);
  borrowed.dispose(); texture.dispose();
});
