import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanHabitatScenes } from '../src/world/OceanHabitatScenes.js';
import { habitatSceneMesh, habitatSceneHeight } from '../src/oceanHabitatScenes.js';

const kinds = ['coral-branch', 'coral-table', 'sea-fan', 'grass-meadow'];
const dimensions = {
  'coral-branch': { x: 1.8, y: 1.3, z: 1.6 }, 'coral-table': { x: 2.4, y: .9, z: 2.1 },
  'sea-fan': { x: 2.1, y: 1.1, z: .3 }, 'grass-meadow': { x: 3.2, y: 1, z: 2.4 },
};
const generator = {}, clone = value => structuredClone(value);
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-5, `${label}: ${a} vs ${b}`);
function ownerElements(cx, cz) {
  return kinds.flatMap((kind, row) => Array.from({ length: 9 }, (_, index) => ({
    id: `habitat:${cx},${cz}:${kind}:${index}`, regionId: `${cx},${cz}`, kind,
    x: cx * 64 + 9 + index * 3, y: -8, z: cz * 64 + 10 + row * 8,
    rotation: .29 + index * .3, scale: { ...dimensions[kind] },
  })));
}
const meshOf = (layer, element) => layer._instances.get(element.kind);
function worldMatrix(mesh, id) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(mesh.userData.elementIds.indexOf(id), matrix);
  return matrix.premultiply(mesh.matrixWorld);
}
function logicalRoot(layer, element) {
  const point = new THREE.Vector3().applyMatrix4(worldMatrix(meshOf(layer, element), element.id));
  point.x += layer.renderOrigin.x; point.z += layer.renderOrigin.z; return point;
}

test('the maximum nine-owner habitat field uses four shared opaque rough materials and four geometry batches without repeated layout allocation', () => {
  const layer = new OceanHabitatScenes(), elements = [];
  for (let z = -1; z <= 1; z++) for (let x = 1; x <= 3; x++) elements.push(...ownerElements(x, z));
  const before = clone(elements); assert.equal(layer.update(elements, generator, { x: 128, z: 0 }), true);
  assert.equal(layer.stats.instances, 324); assert.equal(layer.stats.drawCalls, 4); assert.equal(layer.stats.owners, 9);
  assert.equal(layer.stats.maxInstances, 324); assert.equal(layer.stats.maxPerOwner, 36);
  assert.deepEqual(layer.stats.typeCounts, Object.fromEntries(kinds.map(kind => [kind, 81])));
  assert.equal(layer.stats.prototypeGeometries, 4); assert.equal(layer.stats.prototypeMaterials, 4);
  assert.match(layer.stats.role, /scenery.*not.*animals.*food.*biomass/); assert.equal(layer.stats.pickable, false);
  const instances = [...layer._instances.values()], geometries = [...layer._geometries.values()], materials = Object.values(layer._materials);
  assert.equal(new Set(instances.map(mesh => mesh.geometry)).size, 4); assert.equal(new Set(instances.map(mesh => mesh.material)).size, 4);
  assert.equal(layer.root.children.length, 4); assert.ok(layer.root.children.every(child => child.isInstancedMesh));
  for (const mesh of instances) {
    assert.equal(mesh.castShadow, false); assert.equal(mesh.userData.pickable, false);
    assert.ok(mesh.material.roughness >= .85 && mesh.material.metalness === 0);
    assert.equal(mesh.material.transparent, false); assert.equal(mesh.material.emissive.getHex(), 0);
  }
  assert.equal(meshOf(layer, { kind: 'sea-fan' }).material.side, THREE.DoubleSide);
  assert.equal(meshOf(layer, { kind: 'grass-meadow' }).material.side, THREE.DoubleSide);
  const matrices = instances.map(mesh => mesh.instanceMatrix.array.slice());
  for (let iteration = 0; iteration < 10; iteration++)
    assert.equal(layer.update(clone(elements).reverse(), generator, { x: 128, z: 0 }), false);
  assert.deepEqual([...layer._instances.values()], instances); assert.deepEqual([...layer._geometries.values()], geometries);
  assert.deepEqual(Object.values(layer._materials), materials);
  instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index]));
  assert.deepEqual(elements, before); layer.dispose();
});

test('actual floating-origin instance vertices use the shared normalized mesh and remain within the swimmer crown without becoming rigid bottom support', () => {
  const layer = new OceanHabitatScenes(), elements = ownerElements(15628, -15627), origin = { x: 1000192, z: -1000128 };
  layer.update(elements, generator, origin); layer.root.updateMatrixWorld(true); let vertices = 0;
  for (const element of elements) {
    const mesh = meshOf(layer, element), geometry = mesh.geometry, shared = habitatSceneMesh(element.kind);
    assert.deepEqual(Array.from(geometry.attributes.position.array), Array.from(shared.positions));
    assert.deepEqual(Array.from(geometry.index.array), Array.from(shared.indices));
    const reference = new THREE.Matrix4().compose(new THREE.Vector3(element.x, element.y, element.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), element.rotation),
      new THREE.Vector3(element.scale.x, element.scale.y, element.scale.z));
    const actual = worldMatrix(mesh, element.id), radius = Math.max(element.scale.x, element.scale.z) / 2;
    for (let index = 0; index < geometry.attributes.position.count; index++) {
      const local = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
      const rendered = local.clone().applyMatrix4(actual); rendered.x += origin.x; rendered.z += origin.z;
      const expected = local.clone().applyMatrix4(reference);
      for (const axis of ['x', 'y', 'z']) close(rendered[axis], expected[axis], `${element.kind} shared mesh ${axis}`);
      assert.ok(rendered.y >= element.y - 1e-5 && rendered.y <= element.y + element.scale.y + 1e-5);
      assert.ok(Math.hypot(rendered.x - element.x, rendered.z - element.z) <= radius + 1e-5);
      const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index);
      assert.ok([normal.x, normal.y, normal.z].every(Number.isFinite));
      assert.ok(normal.length() < 1e-8 || Math.abs(normal.length() - 1) < 1e-5); vertices++;
    }
    close(habitatSceneHeight(element, element.x, element.z, true), element.y + element.scale.y, 'complete finite swimmer crown top');
    assert.equal(habitatSceneHeight(element, element.x, element.z, false), null, 'visual colonies are not rigid rock support');
    assert.equal(habitatSceneHeight(element, element.x + radius + .01, element.z, true), null, 'finite crown has no support outside its envelope');
  }
  assert.ok(vertices > 200); layer.dispose();
});

test('rebasing and unload/reset preserve shared prototypes, invalid updates retain the active layer, and final disposal releases every owned resource once', () => {
  const layer = new OceanHabitatScenes(), elements = ownerElements(15628, -15627), origin = { x: 1000192, z: -1000128 };
  layer.update(elements, generator, origin); const instances = [...layer._instances.values()];
  const matrices = instances.map(mesh => mesh.instanceMatrix.array.slice()), before = elements.map(element => logicalRoot(layer, element));
  assert.equal(layer.setRenderOrigin({ x: origin.x + 128, z: origin.z - 64 }), true);
  elements.forEach((element, index) => { const after = logicalRoot(layer, element);
    for (const axis of ['x', 'y', 'z']) close(after[axis], before[index][axis], 'logical root survives rebase'); });
  instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index]));
  const validStats = layer.stats;
  for (const input of [null, [...elements, clone(elements[0])], [{ ...elements[0], x: NaN }],
    [{ ...elements[0], regionId: '0,0' }], [{ ...elements[0], kind: 'fake-animal' }],
    [{ ...elements[0], scale: { x: 1, y: 0, z: 1 } }],
    [...elements, { ...elements[0], id: 'owner-overflow' }],
    Array.from({ length: 10 }, (_, index) => ({ ...elements[0], id: `many-owner:${index}`, regionId: undefined, x: index * 64 + 8, z: 8 }))]) {
    assert.throws(() => layer.update(input, generator, { x: 0, z: 0 }));
    assert.deepEqual(layer.stats, validStats); assert.deepEqual([...layer._instances.values()], instances);
  }
  assert.throws(() => layer.setRenderOrigin({ x: Infinity, z: 0 }));
  let buffers = 0, geometries = 0, materials = 0;
  const watch = () => { for (const mesh of layer._instances.values()) mesh.addEventListener('dispose', () => buffers++); };
  watch(); for (const geometry of layer._geometries.values()) geometry.addEventListener('dispose', () => geometries++);
  for (const material of Object.values(layer._materials)) material.addEventListener('dispose', () => materials++);
  layer.update(elements.filter(element => element.kind === 'grass-meadow'), generator, layer.renderOrigin);
  assert.equal(buffers, 4); assert.equal(geometries, 0); assert.equal(materials, 0); watch();
  layer.update([], generator, layer.renderOrigin); assert.equal(buffers, 5); assert.equal(layer.root.children.length, 0);
  layer.reset(); assert.equal(buffers, 5); assert.equal(layer.stats.prototypeGeometries, 4);
  layer.update(elements, generator, layer.renderOrigin); watch(); layer.reset(); assert.equal(buffers, 9);
  assert.equal(geometries, 0); assert.equal(materials, 0);
  layer.dispose(); layer.dispose(); assert.equal(buffers, 9); assert.equal(geometries, 4); assert.equal(materials, 4);
  assert.equal(layer.stats.instances, 0); assert.equal(layer.stats.prototypeGeometries, 0); assert.equal(layer.stats.prototypeMaterials, 0);
  assert.equal(layer.update(elements, generator, { x: 0, z: 0 }), false); assert.equal(layer.setRenderOrigin({ x: 0, z: 0 }), false);
});
