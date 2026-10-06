import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { createKelpForestBeltPlans } from '../src/kelpForestBelt.js';
import { createKelpSeascapePlans, KELP_SEASCAPE_ANCHOR, KELP_SEASCAPE_OWNERS } from '../src/kelpSeascape.js';

// These tests execute native Three geometry and instance matrices on the CPU.
// They do not establish WebGL appearance, animated leaf contact or GPU speed.
const SEED = '42', center = cx => ({ x: (cx + .5) * 64, z: -32 });
const scene = () => new KelpOceanChunks(SEED, { forestBelt: true });
const plansFor = renderer => createKelpSeascapePlans(renderer.generator.baseGenerator,
  KELP_SEASCAPE_ANCHOR.cx, KELP_SEASCAPE_ANCHOR.cz);
const meshOf = (record, kind) => record.instances.filter(mesh => mesh.userData.landscapeKind === kind);
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const bed = geometry => Object.fromEntries(['position', 'normal', 'uv'].map(name => [name, geometry.attributes[name].array.slice()]));
function digest(record) {
  const hash = createHash('sha256');
  for (const [name, attribute] of Object.entries(record.terrainGeometry.attributes).sort()) {
    hash.update(name); hash.update(bytes(attribute.array));
  }
  hash.update(bytes(record.terrainGeometry.index.array));
  for (const mesh of record.instances) {
    hash.update(mesh.name); hash.update(JSON.stringify(mesh.userData.elementIds)); hash.update(bytes(mesh.instanceMatrix.array));
    if (mesh.instanceColor) hash.update(bytes(mesh.instanceColor.array));
  }
  return hash.digest('hex');
}
const nativeGolden = {
  '-6,-2': 'd3477eba18d216f35e2754eb570a5d74ad683d4fb728af8b3c217173d60f06ce',
  '-5,-2': '8437a7c46cf134b207ff35cd18ff680047301cf8e3b454ea2195fc348e85b967',
  '-6,-1': 'ee83747d426e0924e50b8a5427b482677d4746b7252d8b2ccb6beacdec059dca',
  '-5,-1': 'ccb7f5ddc28a1a390648a49510a2e7e479d686e96ddc5feeebbb0f856ae7f4c8',
};
const forestGolden = { ...nativeGolden,
  '-6,-1': 'c9e6c815283fc90c91193ef6b98ca0188977fdbe2a2e1ba126b76d63720157d9',
  '-5,-1': '31dc5ad75dcd0977dfd9c4045b53b0b3609926d2ca291b99a71cab3bc9cbca7c',
};
function budget(renderer) {
  assert.equal(renderer.stats.activeChunks, 9);
  assert.equal(renderer.stats.maxActiveChunks, 9);
  assert.equal(renderer.stats.prototypeGeometries, 4);
  assert.equal(renderer.stats.prototypeMaterials, 3);
  assert.equal(renderer.stats.maxDrawCalls, 81);
  assert.ok(renderer.stats.drawCalls <= 81);
  assert.ok(renderer.stats.elementCounts.kelp <= 9 * 72);
  assert.ok(renderer.stats.elementCounts.rock <= 9 * 32);
  assert.ok(renderer.stats.elementCounts.formation <= 9 * 2);
  assert.equal(renderer.stats.ownedOverlayGeometries, 0);
  assert.ok(renderer.generator.forestBeltRegistryStats().size <= 25);
}

test('private twelve-owner candidates stay undrawn; publication refreshes actual batches at the same center without touching native matrices or bed', t => {
  const renderer = scene(), original = new KelpOceanChunks(SEED);
  t.after(() => { renderer.dispose(); original.dispose(); });
  const position = center(7); renderer.update(position); original.update(position);
  const plans = plansFor(renderer), prior = new Map(renderer._chunks), priorStats = renderer.stats;
  assert.equal(plans.length, 12); assert.deepEqual(plans.map(plan => plan.id), KELP_SEASCAPE_OWNERS);
  assert.equal(plans[0].version, 2); assert.equal(plans[0].group.widthM, 384); assert.equal(plans[0].group.depthM, 128);
  const prototypes = Object.values(renderer._geometries), materials = Object.values(renderer._materials);
  assert.throws(() => renderer.generator.withForestPlans(plans, () => {
    assert.ok(plans.some(plan => renderer.generator.chunk(plan.cx, plan.cz).counts.kelp > original.generator.chunk(plan.cx, plan.cz).counts.kelp));
    assert.equal(renderer.update(center(11)), false);
    assert.deepEqual(new Map(renderer._chunks), prior);
    assert.equal(renderer.stats, priorStats);
    throw new Error('abort before source publication');
  }), /abort before source publication/);
  assert.equal(renderer.generator.forestBeltRevision, 0);
  assert.deepEqual(new Map(renderer._chunks), prior);
  renderer.generator.setForestPlans(plans);
  assert.equal(renderer.update(position), true);
  const activeAdded = plans.filter(plan => renderer._chunks.has(plan.id)).reduce((sum, plan) => sum + plan.addedRootIds.length, 0);
  assert.equal(renderer.stats.forestBeltAddedRoots, activeAdded);
  assert.equal(renderer.stats.elementCounts.kelp, original.stats.elementCounts.kelp + activeAdded);
  assert.deepEqual(Object.values(renderer._geometries), prototypes); assert.deepEqual(Object.values(renderer._materials), materials);
  for (const [id, record] of renderer._chunks) {
    const old = original._chunks.get(id), changed = plans.some(plan => plan.id === id);
    assert.equal(record === prior.get(id), !changed);
    assert.deepEqual(bed(record.terrainGeometry), bed(old.terrainGeometry));
    assert.deepEqual(record.terrainGeometry.index.array, old.terrainGeometry.index.array);
    for (const oldMesh of old.instances) {
      const current = record.instances.find(mesh => mesh.name === oldMesh.name); assert.ok(current);
      assert.deepEqual(current.userData.elementIds.slice(0, oldMesh.count), oldMesh.userData.elementIds);
      assert.deepEqual(current.instanceMatrix.array.slice(0, oldMesh.count * 16), oldMesh.instanceMatrix.array);
      assert.deepEqual(current.instanceColor.array.slice(0, oldMesh.count * 3), oldMesh.instanceColor.array);
    }
    for (const mesh of record.instances) {
      const expected = renderer.generator.chunk(...id.split(',').map(Number)).elements.filter(element =>
        element.kind === mesh.userData.landscapeKind && (element.kind === 'kelp' || `rock-${element.profile}` === mesh.geometry.name ||
          renderer._geometries[`rock-${element.profile}`] === mesh.geometry));
      assert.deepEqual(mesh.userData.elementIds, expected.map(element => element.id));
    }
  }
  const records = new Map(renderer._chunks), revision = renderer.generator.forestBeltRevision;
  assert.equal(renderer.generator.setForestPlans(structuredClone(plans)), false);
  assert.equal(renderer.update(position), false); assert.equal(renderer.generator.forestBeltRevision, revision);
  assert.deepEqual(new Map(renderer._chunks), records); budget(renderer);
});

test('every appended root across the actual 384m scene contacts its original rendered hard-cap triangle through rebases, with shared native floor and real root coverage', t => {
  const renderer = scene(), original = new KelpOceanChunks(SEED);
  t.after(() => { renderer.dispose(); original.dispose(); });
  const plans = plansFor(renderer); renderer.generator.setForestPlans(plans);
  renderer.setRenderOrigin({ x: 384, z: -128 }); original.setRenderOrigin({ x: 384, z: -128 });
  const ray = new THREE.Raycaster(), matrix = new THREE.Matrix4(), checked = new Set(), owners = new Set();
  let maxRootError = 0, maxContactError = 0, coverChanged = 0, floorRays = 0;
  for (const cx of [7, 9, 11]) {
    renderer.update(center(cx)); original.update(center(cx)); renderer.root.updateMatrixWorld(true); original.root.updateMatrixWorld(true);
    for (const plan of plans.filter(plan => renderer._chunks.has(plan.id))) {
      if (owners.has(plan.id)) continue; owners.add(plan.id);
      const record = renderer._chunks.get(plan.id), native = original._chunks.get(plan.id);
      assert.deepEqual(bed(record.terrainGeometry), bed(native.terrainGeometry));
      assert.deepEqual(record.terrainGeometry.index.array, native.terrainGeometry.index.array);
      const currentCover = record.terrainGeometry.attributes.kelpHabitatCover.array, oldCover = native.terrainGeometry.attributes.kelpHabitatCover.array;
      for (let i = 0; i < currentCover.length; i++) if (currentCover[i] !== oldCover[i]) coverChanged++;
      for (const [dx, dz] of [[16, 16], [32, 32], [48, 48]]) {
        const x = record.origin.x + dx, z = record.origin.z + dz;
        ray.set(new THREE.Vector3(x - renderer.renderOrigin.x, 30, z - renderer.renderOrigin.z), new THREE.Vector3(0, -1, 0));
        const floor = record.group.children.find(object => object.userData.landscapeKind === 'floor');
        const hit = ray.intersectObject(floor)[0]; assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - renderer.generator.floorSurface(x, z).height) < 1e-6); floorRays++;
      }
      const kelp = meshOf(record, 'kelp')[0];
      for (const id of plan.addedRootIds) {
        const plant = plan.elements.find(element => element.id === id), index = kelp.userData.elementIds.indexOf(id); assert.ok(index >= 0);
        kelp.getMatrixAt(index, matrix); matrix.premultiply(kelp.matrixWorld);
        const root = new THREE.Vector3().applyMatrix4(matrix), logical = root.clone().add(new THREE.Vector3(renderer.renderOrigin.x, 0, renderer.renderOrigin.z));
        const rootError = logical.distanceTo(new THREE.Vector3(plant.x, plant.y, plant.z));
        maxRootError = Math.max(maxRootError, rootError); assert.ok(rootError < 1e-5);
        const host = meshOf(record, 'rock').find(mesh => mesh.userData.elementIds.includes(plant.hostId)); assert.ok(host);
        ray.set(new THREE.Vector3(root.x, 30, root.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(host).find(hit => hit.instanceId === host.userData.elementIds.indexOf(plant.hostId)); assert.ok(hit);
        const error = Math.abs(hit.point.y - root.y); maxContactError = Math.max(maxContactError, error); assert.ok(error < 1e-5);
        assert.equal(renderer.generator.supportAt(plant.x, plant.z).elementId, plant.hostId);
        assert.ok(renderer._geometries.kelp.boundingBox.max.y * plant.lengthM + plant.y < renderer.generator.surfaceY);
        checked.add(id);
      }
      budget(renderer);
    }
  }
  assert.equal(owners.size, 12); assert.equal(floorRays, 36);
  assert.equal(checked.size, plans.reduce((sum, plan) => sum + plan.addedRootIds.length, 0)); assert.ok(checked.size > 0);
  assert.ok(coverChanged > 0, 'committed real root groups change the existing habitat-cover terrain input');
  t.diagnostic(JSON.stringify({ seed: 'string:42', group: '6,-2', owners: owners.size, addedRoots: checked.size, floorRays,
    maxRootErrorM: maxRootError, maxHardCapTriangleContactErrorM: maxContactError, changedCoverChannels: coverChanged,
    scope: 'CPU static renderer input and shared support; no WebGL visual acceptance' }));
});

test('independent pre-v2 native and original four-owner forest scene geometry, colors and matrices remain exact', t => {
  for (const [mode, expected] of [['native', nativeGolden], ['v1', forestGolden]]) {
    const renderer = new KelpOceanChunks(SEED, { forestBelt: mode === 'v1' }); t.after(() => renderer.dispose());
    if (mode === 'v1') renderer.generator.setForestPlans(createKelpForestBeltPlans(renderer.generator, -6, -2));
    renderer.update({ x: -352, z: -96 });
    for (const [id, hash] of Object.entries(expected)) assert.equal(digest(renderer._chunks.get(id)), hash, `${mode} ${id}`);
    if (mode === 'native') assert.equal(Object.hasOwn(renderer.stats, 'forestBeltRevision'), false);
    else assert.equal(renderer.stats.forestBeltAddedRoots, 16);
  }
});

test('cold saved plans and real travel preserve source matrices; eviction and repeated dispose release owned resources once within original budgets', t => {
  const renderer = scene(); t.after(() => renderer.dispose());
  const plans = plansFor(renderer), saved = structuredClone(plans), released = new Map();
  const track = () => { for (const record of renderer._chunks.values()) for (const resource of
    [record.terrainGeometry, record.rockBaseGeometry, ...record.instances].filter(Boolean)) if (!released.has(resource)) {
      released.set(resource, 0); resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
    } };
  let prototypeReleases = 0, materialReleases = 0;
  Object.values(renderer._geometries).forEach(resource => resource.addEventListener('dispose', () => prototypeReleases++));
  [...Object.values(renderer._materials), renderer._terrainMaterial].forEach(resource => resource.addEventListener('dispose', () => materialReleases++));
  renderer.update(center(7)); track(); renderer.generator.setForestPlans(plans); renderer.update(center(7)); track();
  const hashes = new Map();
  for (const cx of [7, 9, 11]) {
    renderer.update(center(cx)); track(); budget(renderer);
    for (const plan of plans.filter(plan => renderer._chunks.has(plan.id))) hashes.set(plan.id, digest(renderer._chunks.get(plan.id)));
  }
  renderer.update({ x: 1500, z: 1500 }); track(); budget(renderer);
  assert.equal(renderer.stats.forestBeltAddedRoots, 0);
  assert.equal(prototypeReleases, 0); assert.equal(materialReleases, 0);
  for (const cx of [11, 9, 7]) {
    renderer.update(center(cx)); track(); budget(renderer);
    for (const plan of plans.filter(plan => renderer._chunks.has(plan.id))) assert.equal(digest(renderer._chunks.get(plan.id)), hashes.get(plan.id));
  }
  const hostPlan = plans.find(plan => plan.addedRootIds.length && renderer._chunks.has(plan.id)); assert.ok(hostPlan);
  const id = hostPlan.addedRootIds[0], kelp = meshOf(renderer._chunks.get(hostPlan.id), 'kelp')[0];
  renderer.setDetailedHosts([id]); assert.equal(kelp.instanceMatrix.array[kelp.userData.elementIds.indexOf(id) * 16 + 5], 0);
  renderer.setDetailedHosts([]); assert.deepEqual(kelp.instanceMatrix.array, kelp.userData.landscapeMatrices);
  const cold = scene(); t.after(() => cold.dispose()); cold.generator.setForestPlans(saved);
  for (const cx of [7, 9, 11]) {
    cold.update(center(cx)); budget(cold);
    for (const plan of plans.filter(plan => cold._chunks.has(plan.id))) assert.equal(digest(cold._chunks.get(plan.id)), hashes.get(plan.id));
  }
  renderer.generator.setForestPlans([]); renderer.update(center(7)); track(); assert.equal(renderer.stats.forestBeltAddedRoots, 0);
  renderer.reset(SEED); track(); assert.equal(renderer.generator.forestBeltRevision, 0); budget(renderer);
  renderer.dispose(); renderer.dispose();
  assert.ok([...released.values()].every(count => count === 1));
  assert.equal(prototypeReleases, 4); assert.equal(materialReleases, 3); assert.equal(renderer.root.children.length, 0);
});
