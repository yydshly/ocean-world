import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { DeepOceanAnimals } from '../src/world/DeepOceanAnimals.js';
import { createDeepBenthicLifeAsset, animateDeepBenthicLifeAsset, disposeDeepBenthicLifeAsset,
  deepBenthicLifeAssetStats, DEEP_BENTHIC_LIFE_IDS, DEEP_BENTHIC_LIFE_ENVELOPES } from '../src/world/DeepBenthicLifeAssets.js';
import { deepBenthicLifeSpeciesCatalog } from '../src/deepBenthicLifeSpecies.js';
import { deepSpeciesCatalog } from '../src/deepSpecies.js';
import { deepPredatorSpeciesCatalog } from '../src/deepPredatorSpecies.js';

// Native CPU mesh/bounds/lifecycle evidence. These poses are not population
// admission, measured anatomy, GPU/FPS or actual browser visual acceptance.
const oldCatalog = [...deepSpeciesCatalog, ...deepPredatorSpeciesCatalog];
const catalog = [...oldCatalog, ...deepBenthicLifeSpeciesCatalog];
const meshes = object => { const result = []; object.traverse(item => { if (item.isMesh) result.push(item); }); return result; };
const digest = object => {
  const hash = createHash('sha256');
  for (const mesh of meshes(object)) {
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes).sort()) {
      hash.update(name); hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    if (mesh.geometry.index) { const a = mesh.geometry.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    hash.update(JSON.stringify(mesh.matrix.toArray()));
  }
  return hash.digest('hex');
};
const agents = () => deepBenthicLifeSpeciesCatalog.map((species, i) => ({ id: `new:${species.id}`, speciesId: species.id,
  regionId: '132,8', alive: true, sizeM: species.lengthM, position: { x: 8480 + i * 2, y: -3500, z: 608 },
  velocity: { x: .008, y: .001, z: 0 }, heading: .35, state: 'foraging', timeSec: 8.2,
  supportNormal: { x: .12, y: .98, z: .15 }, localEnvironment: { currentMps: .04 } }));
const pose = object => { const out = []; object.updateMatrixWorld(true); object.traverse(child => out.push(child.matrix.toArray())); return out; };

test('four whole native kits preserve declared size measures and complete finite state envelopes', t => {
  const objects = deepBenthicLifeSpeciesCatalog.map(createDeepBenthicLifeAsset), hashes = new Set(), receipt = {};
  t.after(() => objects.forEach(disposeDeepBenthicLifeAsset));
  assert.deepEqual(deepBenthicLifeSpeciesCatalog.map(s => s.id), DEEP_BENTHIC_LIFE_IDS);
  for (const [i, object] of objects.entries()) {
    const species = deepBenthicLifeSpeciesCatalog[i], envelope = DEEP_BENTHIC_LIFE_ENVELOPES[species.id];
    assert.equal(object.userData.sizeMeasure, species.sizeMeasure); assert.equal(object.userData.speciesId, species.id);
    assert.deepEqual([envelope.localBounds.minX, envelope.localBounds.maxX], species.normalizedEnvelope.x);
    assert.deepEqual([envelope.minY, envelope.maxY], species.normalizedEnvelope.y);
    assert.equal(envelope.horizontalRadius, species.normalizedEnvelope.horizontalRadiusUnits);
    const triangles = meshes(object).reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    assert.ok(triangles > 350 && triangles < 4500); assert.ok(meshes(object).length <= 9);
    receipt[species.id] = { triangles, meshes: meshes(object).length, sizeMeasure: species.sizeMeasure };
    object.updateMatrixWorld(true); hashes.add(digest(object));
    for (const mesh of meshes(object)) {
      assert.ok(mesh.material.isMeshStandardMaterial); assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.emissiveIntensity, 0);
      for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
    }
    object.traverse(child => assert.ok(!child.isLight));
    for (const state of ['resting', 'foraging', 'deep-benthic-feeding', 'fixed', 'blocked']) for (let frame = 0; frame < 24; frame++) {
      animateDeepBenthicLifeAsset(object, frame * .41, { state, lastFeedAt: frame * .41 - .2, velocity: { x: state === 'fixed' ? 0 : .008 } });
      object.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(object), b = envelope.localBounds;
      assert.ok(bounds.min.y >= envelope.minY - 1e-6 && bounds.max.y <= envelope.maxY + 1e-6, `${species.id} vertical envelope`);
      assert.ok(bounds.min.x >= b.minX - 1e-6 && bounds.max.x <= b.maxX + 1e-6 && bounds.min.z >= b.minZ - 1e-6 && bounds.max.z <= b.maxZ + 1e-6,
        `${species.id} complete appendage/spine/body envelope`);
      for (const mesh of meshes(object)) {
        const p = mesh.geometry.attributes.position;
        for (let vertex = 0; vertex < p.count; vertex++) {
          const point = new THREE.Vector3().fromBufferAttribute(p, vertex).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.hypot(point.x, point.z) <= envelope.horizontalRadius + 1e-6);
        }
      }
    }
    animateDeepBenthicLifeAsset(object, 0, { state: 'resting' }); object.updateMatrixWorld(true);
    const parts = object.userData.deepBenthicLifeParts;
    if (species.id === 'abyssal-brittle-star') {
      assert.equal(parts.arms.length, 5); assert.ok(parts.disc);
      const tips = parts.arms.map(arm => {
        const m = meshes(arm)[0], p = m.geometry.attributes.position; let farthest = new THREE.Vector3(), radius = 0;
        for (let v = 0; v < p.count; v++) { const point = new THREE.Vector3().fromBufferAttribute(p, v).applyMatrix4(m.matrixWorld);
          if (Math.hypot(point.x, point.z) > radius) { radius = Math.hypot(point.x, point.z); farthest = point; } }
        return farthest;
      });
      const span = Math.max(...tips.flatMap(a => tips.map(b => a.distanceTo(b))));
      assert.ok(Math.abs(span - 1) < .003, 'unit measure is farthest arm-tip span, not small disc width');
    } else if (species.id === 'pyramid-urchin') {
      const box = new THREE.Box3().setFromObject(parts.test), size = box.getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x - 1) < 1e-6, 'unit test length excludes the separate spines'); assert.ok(size.y > .7);
      assert.ok(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x > 1);
    } else if (species.id === 'acorn-worm-group') {
      const box = new THREE.Box3().setFromObject(object); assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x - 1) < .003);
      assert.ok(new THREE.Box3().setFromObject(parts.anterior).getSize(new THREE.Vector3()).z > .35, 'paired lateral veils broaden the anterior');
      assert.equal(Object.hasOwn(parts, 'legs'), false); assert.equal(Object.hasOwn(parts, 'eyes'), false);
    } else {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(parts.body).getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.ok(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x > 1.3, 'antennae/uropods extend beyond body-length measure');
      assert.deepEqual(object.userData.appendagePairs, { antennae: 2, pereiopods: 7, gnathopodsWithinPereiopods: 2, pleopods: 3, uropods: 3 });
    }
    for (const size of species.sizeRangeM) {
      object.scale.setScalar(size); object.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(object);
      assert.ok(bounds.max.y <= envelope.maxY * size + 1e-6); assert.ok(bounds.min.y >= -1e-6);
    }
    object.scale.setScalar(1);
  }
  assert.equal(hashes.size, 4); t.diagnostic(JSON.stringify({ prototypes: receipt, scope: 'whole procedural representatives; native CPU geometry only' }));
});

test('native dispatcher follows recorded support normals, regional clocks, stable identity and picking without model mutation', t => {
  const animals = new DeepOceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = agents(), before = structuredClone(rows); animals.update([...rows, { ...rows[0], id: 'dead', alive: false }], 9000, { x: 8448, z: 576 });
  assert.equal(animals.stats.activeAnimals, 4); assert.equal(animals.pickableObjects.length, 4); assert.equal(animals.getObject('dead'), null);
  for (const row of rows) {
    const object = animals.getObject(row.id), normal = new THREE.Vector3(row.supportNormal.x, row.supportNormal.y, row.supportNormal.z).normalize();
    assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]);
    assert.equal(object.scale.x, row.sizeM); assert.equal(object.userData.regionId, row.regionId);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion).distanceTo(normal) < 1e-12);
    assert.equal(object.userData.deepBenthicLifeLastTimeSec, row.timeSec);
    const mesh = meshes(object)[0], p = mesh.geometry.attributes.position, indices = mesh.geometry.index.array;
    let hit = null;
    for (let face = 0; !hit && face < Math.min(indices.length, 120); face += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, indices[face]).applyMatrix4(mesh.matrixWorld), b = new THREE.Vector3().fromBufferAttribute(p, indices[face + 1]).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(p, indices[face + 2]).applyMatrix4(mesh.matrixWorld), n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (n.lengthSq() < .9) continue;
      const target = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      hit = new THREE.Raycaster(target.clone().addScaledVector(n, .2), n.clone().negate()).intersectObject(object, true)[0];
    }
    assert.ok(hit, `${row.speciesId} actual native mesh picking`);
    let parent = hit.object; while (parent && !parent.userData.agentId) parent = parent.parent; assert.equal(parent.userData.agentId, row.id);
  }
  const original = rows.map(row => animals.getObject(row.id)), poses = original.map(pose);
  animals.update(rows, 50000, { x: 8512, z: 640 });
  assert.deepEqual(rows.map(row => animals.getObject(row.id)), original); assert.deepEqual(original.map(pose), poses); assert.deepEqual(rows, before);
  for (const row of rows) row.timeSec += .2;
  animals.update(rows, 50000); assert.ok(original.some((object, i) => JSON.stringify(pose(object)) !== JSON.stringify(poses[i])), 'actual regional time advances appendage motion');
});

test('bounded shared kits retain active references and release every resource exactly once at final disposal', t => {
  const a = DEEP_BENTHIC_LIFE_IDS.map(createDeepBenthicLifeAsset), b = DEEP_BENTHIC_LIFE_IDS.map(createDeepBenthicLifeAsset), events = new Map();
  t.after(() => [...a, ...b].forEach(disposeDeepBenthicLifeAsset));
  for (let i = 0; i < a.length; i++) {
    const first = meshes(a[i]), second = meshes(b[i]); assert.equal(first.length, second.length);
    for (let mesh = 0; mesh < first.length; mesh++) {
      assert.equal(first[mesh].geometry, second[mesh].geometry); assert.equal(first[mesh].material, second[mesh].material);
      for (const resource of [first[mesh].geometry, first[mesh].material]) if (!events.has(resource)) {
        events.set(resource, 0); resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1));
      }
    }
  }
  const stats = deepBenthicLifeAssetStats(); assert.equal(stats.instances, 8); assert.ok(stats.resources <= 24);
  for (let frame = 0; frame < 48; frame++) {
    for (const object of b) animateDeepBenthicLifeAsset(object, frame * .1, { state: 'deep-benthic-feeding', lastFeedAt: frame * .1 - .2, velocity: { x: .008 } });
    assert.deepEqual(deepBenthicLifeAssetStats(), stats);
  }
  a.forEach(disposeDeepBenthicLifeAsset); a.forEach(disposeDeepBenthicLifeAsset); assert.ok([...events.values()].every(n => n === 0));
  b.forEach(disposeDeepBenthicLifeAsset); b.forEach(disposeDeepBenthicLifeAsset); assert.ok([...events.values()].every(n => n === 1));
  assert.deepEqual(deepBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  assert.ok([...a, ...b].every(object => !object.parent && object.children.length === 0));
});

test('dead/unsupported animals stay absent; replacement, unload/revisit, reset and disposal release the correct kit', () => {
  const animals = new DeepOceanAnimals(catalog), row = agents()[0];
  animals.update([row, { ...row, id: 'dead', alive: false }, { ...row, id: 'unknown', speciesId: 'unknown' }], 0);
  assert.equal(animals.stats.activeAnimals, 1); const old = animals.getObject(row.id);
  animals.update([{ ...row, speciesId: 'sea-pig-group' }], 0); assert.equal(old.children.length, 0); assert.equal(old.parent, null);
  assert.equal(animals.getObject(row.id).userData.speciesId, 'sea-pig-group'); assert.deepEqual(deepBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  animals.update([row], 500); const rebuilt = animals.getObject(row.id), savedPose = pose(rebuilt);
  animals.update([], 500); animals.update([row], 9000); assert.deepEqual(pose(animals.getObject(row.id)), savedPose);
  animals.reset(); assert.equal(animals.pickableObjects.length, 0); assert.equal(animals.stats.activeAnimals, 0);
  assert.deepEqual(deepBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  animals.dispose(); animals.dispose(); assert.equal(animals.update([row], 9000), false);
  assert.throws(() => createDeepBenthicLifeAsset('sea-pig-group'), /Unknown/);
});

test('four original native deep geometry and animation receipts remain exact with the additional dispatcher', t => {
  const expected = {
    'sea-pig-group': '65faf227dbbed5f4214ba2d107b6337172a6528620abc77fe186e515724a8c70',
    'rattail-family': '934b94c290e1a681edd082c84aa84b04d8675015125e412c6d13e2c1590eb8d1',
    'pom-pom-anemone': '7da70c5d3d00037d039e763c2f82ade1075316e83036a9a036147b007f840d22',
    'giant-sea-spider-group': 'baa45d1a68f6db875f8673bd5b65d35ec4eeb09b3d447e6a847d87d85032c64b',
  };
  const animals = new DeepOceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = oldCatalog.map((species, i) => ({ id: `baseline:${species.id}`, speciesId: species.id,
    alive: true, sizeM: species.lengthM, position: { x: 8480 + i * 2, y: -3500, z: 608 },
    velocity: { x: .008, y: .001, z: 0 }, heading: .35, timeSec: 8.2, state: 'foraging', localEnvironment: { currentMps: .04 } }));
  const before = structuredClone(rows), fresh = agents(); animals.update([...rows, ...fresh], 999, { x: 8448, z: 576 });
  const originals = rows.map(row => animals.getObject(row.id));
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const object = animals.getObject(row.id); assert.equal(digest(object), expected[row.speciesId]);
    assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]);
    assert.equal(object.rotation.y, -.35); assert.equal(object.rotation.x, 0); assert.equal(object.rotation.z, 0);
    assert.equal(object.scale.x, row.sizeM);
  }
  animals.update(rows, 50000); assert.deepEqual(rows.map(row => animals.getObject(row.id)), originals);
  assert.deepEqual(rows, before); assert.deepEqual(deepBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId]);
});
