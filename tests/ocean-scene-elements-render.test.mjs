import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanSceneElements } from '../src/world/OceanSceneElements.js';
import { sceneElementMesh, sceneElementHeight } from '../src/oceanSceneElements.js';

const clone = value => structuredClone(value), generator = { heightAt: () => 0 };
const close = (a, b, label = '', tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
const dimensions = { stone: { x: 1.7, y: .42, z: 1.2 }, 'plant-clump': { x: 1.6, y: .8, z: 1.4 },
  bottle: { x: .35, y: .09, z: .09 }, driftwood: { x: 1.4, y: .14, z: .2 } };
function elementsForCell(cx, cz) {
  const elements = [];
  for (const [kind, amount] of [['stone', 8], ['plant-clump', 6], ['bottle', 1], ['driftwood', 2]])
    for (let index = 0; index < amount; index++) elements.push({ id: `scene-element:${cx},${cz}:${kind}:${index}`,
      kind, variant: kind === 'stone' ? index % 2 : 0, x: cx * 64 + 9 + index * 3,
      y: 0, z: cz * 64 + 9 + index * 2, rotation: .47 + index * .2, scale: { ...dimensions[kind] } });
  return elements;
}
function meshFor(layer, element) { return [...layer._instances.values()].find(mesh => mesh.userData.elementIds.includes(element.id)); }
function instanceMatrix(mesh, id) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(mesh.userData.elementIds.indexOf(id), matrix); return matrix.premultiply(mesh.matrixWorld);
}
function logicalPoint(layer, mesh, id, point = new THREE.Vector3()) {
  const result = point.clone().applyMatrix4(instanceMatrix(mesh, id)); result.x += layer.renderOrigin.x; result.z += layer.renderOrigin.z;
  return result;
}

test('all nine supplied owners share exactly five geometry batches and four materials without animal or resource allocation', () => {
  const layer = new OceanSceneElements(), elements = [];
  for (let z = -1; z <= 1; z++) for (let x = 1; x <= 3; x++) elements.push(...elementsForCell(x, z));
  const before = clone(elements); assert.equal(layer.update(elements, generator, { x: 128, z: 0 }), true);
  const stats = layer.stats; assert.equal(stats.instances, 153); assert.equal(stats.drawCalls, 5);
  assert.deepEqual(stats.typeCounts, { stone: 72, 'plant-clump': 54, bottle: 9, driftwood: 18 });
  assert.deepEqual(stats.counts, stats.typeCounts); assert.equal(stats.prototypeGeometries, 5); assert.equal(stats.prototypeMaterials, 4);
  assert.equal(stats.maxInstances, 153); assert.equal(stats.maxDrawCalls, 5); assert.equal(stats.pickable, false);
  assert.match(stats.role, /scenery.*not.*animals.*food.*biomass/); assert.equal(stats.animals, undefined); assert.equal(stats.food, undefined);
  const objects = [...layer._instances.values()], geometry = [...layer._geometries.values()], materials = Object.values(layer._materials);
  assert.equal(new Set(objects.map(mesh => mesh.geometry)).size, 5); assert.equal(new Set(objects.map(mesh => mesh.material)).size, 4);
  const matrices = objects.map(mesh => mesh.instanceMatrix.array.slice());
  assert.equal(layer.update(clone(elements).reverse(), generator, { x: 128, z: 0 }), false, 'same scenery does not rebuild instance buffers');
  for (let index = 0; index < 30; index++) layer.setEnvironment({ currentMps: .18 }, 31.4);
  assert.deepEqual([...layer._instances.values()], objects); assert.deepEqual([...layer._geometries.values()], geometry);
  assert.deepEqual(Object.values(layer._materials), materials);
  objects.forEach((mesh, index) => { assert.deepEqual(mesh.instanceMatrix.array, matrices[index]); assert.equal(mesh.castShadow, false); });
  assert.equal(layer.stats.visualTimeSec, 31.4); assert.deepEqual(elements, before); layer.dispose();
});

test('actual metre transforms and finite normals use the shared CPU mesh, while every plant vertex stays inside its complete crown', () => {
  const layer = new OceanSceneElements(), elements = elementsForCell(15628, -15627), origin = { x: 1000192, z: -1000128 };
  layer.update(elements, generator, origin); layer.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(); let solidRays = 0, crownVertices = 0;
  for (const element of elements) {
    const mesh = meshFor(layer, element), data = sceneElementMesh(element.kind, element.variant), actual = mesh.geometry;
    assert.deepEqual(Array.from(actual.attributes.position.array), data.positions.map(Math.fround));
    assert.deepEqual(Array.from(actual.index.array), Array.from(data.indices));
    const expected = new THREE.Matrix4().compose(new THREE.Vector3(element.x, element.y, element.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), element.rotation),
      new THREE.Vector3(element.scale.x, element.scale.y, element.scale.z));
    const worldMatrix = instanceMatrix(mesh, element.id);
    for (let index = 0; index < actual.attributes.position.count; index++) {
      const local = new THREE.Vector3().fromBufferAttribute(actual.attributes.position, index), logical = logicalPoint(layer, mesh, element.id, local);
      const reference = local.clone().applyMatrix4(expected);
      for (const axis of ['x', 'y', 'z']) close(logical[axis], reference[axis], `${element.kind} actual dimension ${axis}`);
      const normal = new THREE.Vector3().fromBufferAttribute(actual.attributes.normal, index);
      assert.ok([normal.x, normal.y, normal.z].every(Number.isFinite));
      assert.ok(normal.length() < 1e-8 || Math.abs(normal.length() - 1) < 1e-5);
      if (element.kind === 'plant-clump') {
        crownVertices++; assert.ok(logical.y >= element.y - 1e-5 && logical.y <= element.y + element.scale.y + 1e-5);
        assert.ok(Math.hypot(logical.x - element.x, logical.z - element.z) <= .5 * Math.hypot(element.scale.x, element.scale.z) + 1e-5);
      }
    }
    if (['stone', 'bottle', 'driftwood'].includes(element.kind)) {
      const center = new THREE.Vector3(0, 0, 0).applyMatrix4(worldMatrix);
      ray.set(new THREE.Vector3(center.x, element.y + element.scale.y + 2, center.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit, 'a real rigid element has upward solid triangles');
      const support = sceneElementHeight(element, center.x + layer.renderOrigin.x, center.z + layer.renderOrigin.z);
      assert.ok(Number.isFinite(support)); close(hit.point.y, support, 'shared CPU triangle support agrees with actual renderer');
      const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(worldMatrix));
      assert.ok(normal.y > 0 && Number.isFinite(normal.length())); close(normal.length(), 1, 'real support face normal');
      assert.ok(hit.point.y >= element.y - 1e-5 && hit.point.y <= element.y + element.scale.y + 1e-5); solidRays++;
    }
  }
  assert.equal(solidRays, 11); assert.ok(crownVertices > 100);
  const bottle = [...layer._instances.values()].find(mesh => mesh.userData.landscapeKind === 'bottle');
  assert.equal(bottle.material.transparent, true); assert.ok(bottle.material.opacity < .6 && bottle.material.roughness >= .6);
  layer.dispose();
});

test('floating-origin rebases preserve logical world coordinates and matrices, and invalid updates retain the complete current layer', () => {
  const layer = new OceanSceneElements(), elements = elementsForCell(15628, -15627), origin = { x: 1000192, z: -1000128 };
  layer.update(elements, generator, origin); const objects = [...layer._instances.values()], matrices = objects.map(mesh => mesh.instanceMatrix.array.slice());
  const before = elements.map(element => logicalPoint(layer, meshFor(layer, element), element.id));
  assert.equal(layer.setRenderOrigin({ x: origin.x + 64, z: origin.z - 128 }), true);
  elements.forEach((element, index) => {
    const point = logicalPoint(layer, meshFor(layer, element), element.id);
    for (const axis of ['x', 'y', 'z']) close(point[axis], before[index][axis], 'logical pose survives rebase');
  });
  objects.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index]));
  const validStats = layer.stats, invalid = [null, [...elements, clone(elements[0])],
    [{ ...elements[0], x: NaN }], [{ ...elements[0], variant: 3 }], [{ ...elements[0], scale: { x: 0, y: 1, z: 1 } }],
    Array.from({ length: 154 }, (_, index) => ({ ...elements[0], id: `over-limit:${index}` }))];
  for (const input of invalid) {
    assert.throws(() => layer.update(input, generator, { x: 0, z: 0 }));
    assert.deepEqual(layer.stats, validStats); assert.deepEqual([...layer._instances.values()], objects);
  }
  assert.throws(() => layer.setRenderOrigin({ x: Infinity, z: 0 }));
  const shared = [...layer._geometries.values()]; layer.reset();
  assert.equal(layer.stats.instances, 0); assert.equal(layer.stats.drawCalls, 0); assert.deepEqual([...layer._geometries.values()], shared);
  assert.equal(layer.update(elements, generator, layer.renderOrigin), true); assert.equal(layer.stats.prototypeGeometries, 5); layer.dispose();
});

test('unloading and reset release only owned instance buffers, then final repeated disposal releases each shared resource exactly once', () => {
  const layer = new OceanSceneElements(), elements = elementsForCell(2, 0); layer.update(elements, generator, { x: 128, z: 0 });
  let instanceDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
  const watchInstances = () => { for (const mesh of layer._instances.values()) mesh.addEventListener('dispose', () => { instanceDisposals++; }); };
  watchInstances();
  for (const geometry of layer._geometries.values()) geometry.addEventListener('dispose', () => { geometryDisposals++; });
  for (const material of Object.values(layer._materials)) material.addEventListener('dispose', () => { materialDisposals++; });
  const stones = elements.filter(element => element.kind === 'stone'); layer.update(stones, generator, { x: 128, z: 0 });
  assert.equal(instanceDisposals, 5); assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0); watchInstances();
  layer.update([], generator, { x: 128, z: 0 }); assert.equal(instanceDisposals, 7); assert.equal(layer.root.children.length, 0);
  layer.reset(); assert.equal(instanceDisposals, 7);
  layer.update(elements, generator, { x: 128, z: 0 }); watchInstances(); layer.reset(); assert.equal(instanceDisposals, 12);
  assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
  layer.dispose(); layer.dispose(); assert.equal(instanceDisposals, 12); assert.equal(geometryDisposals, 5); assert.equal(materialDisposals, 4);
  assert.equal(layer.stats.prototypeGeometries, 0); assert.equal(layer.stats.prototypeMaterials, 0); assert.equal(layer.stats.instances, 0);
  assert.equal(layer.update(elements, generator, { x: 0, z: 0 }), false); assert.equal(layer.setEnvironment({}, 1), false);
});
