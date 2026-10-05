import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';
import { createReefQueryFixture, createReefQueryRays, queryNearest } from './helpers/reef-query-fixture.mjs';

function compareNearest(expected, actual) {
  assert.equal(Boolean(actual), Boolean(expected), 'obstruction classification');
  if (!expected) return;
  assert.equal(actual.object, expected.object, 'nearest obstructing mesh');
  assert.ok(Math.abs(actual.distance - expected.distance) < 1e-7, 'nearest world-space distance');
  assert.ok(actual.point.distanceTo(expected.point) < 1e-7, 'nearest world-space point');
  assert.equal(actual.faceIndex, expected.faceIndex, 'authored triangle identity');
}

test('real reef terrain and all coral morphologies retain 1000 nearest/obstruction results', () => {
  const fixture = createReefQueryFixture();
  try {
    const rays = createReefQueryRays(), baseline = queryNearest(fixture.meshes, rays);
    const originalIndices = new Map(fixture.meshes.map(mesh => [mesh.geometry, mesh.geometry.index.array.slice()]));
    const prototypeRaycast = THREE.Mesh.prototype.raycast;
    const result = enableStaticRayQueries(fixture.root);
    assert.equal(result.meshes, fixture.meshes.length);
    assert.equal(result.geometriesBuilt, originalIndices.size);
    assert.equal(result.skippedMeshes, 0);
    assert.equal(THREE.Mesh.prototype.raycast, prototypeRaycast);
    for (const [geometry, indices] of originalIndices) assert.deepEqual(geometry.index.array, indices);
    const accelerated = queryNearest(fixture.meshes, rays, { firstHitOnly: true });
    baseline.forEach((expected, i) => compareNearest(expected, accelerated[i]));
    const blocked = baseline.filter(Boolean).length;
    assert.ok(blocked > 100 && blocked < rays.length - 20, `fixture must exercise hits and misses: ${blocked}`);
    // Full-hit mode also remains available to placement and ordinary picking.
    const full = queryNearest(fixture.meshes, rays.slice(0, 32));
    full.forEach((actual, i) => compareNearest(baseline[i], actual));
  } finally { fixture.dispose(); }
});

test('a shared tree survives one mesh removal and clears once at geometry disposal', () => {
  const geometry = new THREE.SphereGeometry(1, 20, 12), material = new THREE.MeshBasicMaterial();
  const first = new THREE.Mesh(geometry, material), second = new THREE.Mesh(geometry, material), root = new THREE.Group();
  root.add(first, second);
  const result = enableStaticRayQueries(root), tree = geometry.boundsTree;
  assert.equal(result.geometriesBuilt, 1);
  assert.equal(result.geometriesReused, 1);
  assert.equal(enableStaticRayQueries(root).geometriesBuilt, 0);
  assert.equal(second.geometry.boundsTree, tree);
  first.removeFromParent();
  assert.equal(second.geometry.boundsTree, tree);
  let current = tree, clears = 0;
  Object.defineProperty(geometry, 'boundsTree', {
    get: () => current,
    set: value => { if (value === null) clears++; current = value; }, configurable: true,
  });
  geometry.dispose(); geometry.dispose();
  assert.equal(geometry.boundsTree, null);
  assert.equal(clears, 1);
  // The per-mesh extension falls back safely after disposal of its tree.
  second.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(second).length > 0);
  material.dispose();
});

test('transforms, material sides and finite query intervals keep ordinary results', () => {
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometry = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(2, .4, -1); mesh.rotation.set(.18, .71, -.23); mesh.scale.set(2, .8, 1.3);
  root.add(mesh); root.updateMatrixWorld(true);
  const rays = [];
  for (let i = 0; i < 40; i++) {
    const origin = new THREE.Vector3(-3, -.8 + i * .06, .25);
    rays.push({ origin, direction: mesh.position.clone().sub(origin).normalize(), near: i % 3 === 0 ? 5 : .003,
      far: i % 4 === 0 ? 4 : 20 });
  }
  const baseline = queryNearest([mesh], rays); enableStaticRayQueries(root);
  const actual = queryNearest([mesh], rays, { firstHitOnly: true });
  actual.forEach((hit, i) => compareNearest(baseline[i], hit));
  mesh.position.x += 1.7; mesh.rotation.y += .3; root.updateMatrixWorld(true);
  const changed = queryNearest([mesh], rays, { firstHitOnly: true });
  const fastRaycast = mesh.raycast; mesh.raycast = THREE.Mesh.prototype.raycast;
  const changedBaseline = queryNearest([mesh], rays); mesh.raycast = fastRaycast;
  changed.forEach((hit, i) => compareNearest(changedBaseline[i], hit));
  geometry.dispose(); material.dispose();
});

test('dynamic positions, morphs, skinned/instanced meshes and custom raycasts are excluded', () => {
  const material = new THREE.MeshBasicMaterial(), root = new THREE.Group();
  const dynamic = new THREE.Mesh(new THREE.BoxGeometry(), material);
  dynamic.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const morph = new THREE.Mesh(new THREE.BoxGeometry(), material);
  morph.geometry.morphAttributes.position = [morph.geometry.attributes.position.clone()];
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);
  const custom = new THREE.Mesh(new THREE.BoxGeometry(), material); custom.raycast = () => {};
  const untouched = new THREE.Mesh(new THREE.BoxGeometry(), material);
  root.add(dynamic, morph, skinned, instanced, custom);
  const original = root.children.map(mesh => mesh.raycast), prototypeRaycast = THREE.Mesh.prototype.raycast;
  const result = enableStaticRayQueries(root);
  assert.deepEqual(result, { meshes: 0, geometriesBuilt: 0, geometriesReused: 0, skippedMeshes: 5 });
  root.children.forEach((mesh, i) => {
    assert.equal(mesh.raycast, original[i]); assert.equal(mesh.geometry.boundsTree, undefined); mesh.geometry.dispose();
  });
  assert.equal(untouched.raycast, prototypeRaycast);
  untouched.geometry.dispose(); material.dispose();
});
