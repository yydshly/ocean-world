import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { createKelpBenthicLifeAsset, animateKelpBenthicLifeAsset, disposeKelpBenthicLifeAsset,
  kelpBenthicLifeAssetStats, KELP_BENTHIC_LIFE_IDS, KELP_BENTHIC_LIFE_ENVELOPES } from '../src/world/KelpBenthicLifeAssets.js';
import { kelpBenthicLifeSpeciesCatalog } from '../src/kelpBenthicLifeSpecies.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { kelpWaterSpeciesCatalog } from '../src/kelpWaterSpecies.js';
import { kelpVisitorSpeciesCatalog } from '../src/kelpVisitorSpecies.js';

// Native mesh, bounds, clocks and lifecycle evidence only. Fixture poses are
// not population admission, measured anatomy or browser/GPU visual evidence.
const oldCatalog = [...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog, ...kelpVisitorSpeciesCatalog];
const catalog = [...oldCatalog, ...kelpBenthicLifeSpeciesCatalog];
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
const agents = () => kelpBenthicLifeSpeciesCatalog.map((species, i) => ({ id: `new:${species.id}`, speciesId: species.id,
  regionId: '6,-2', alive: true, sizeM: species.lengthM, position: { x: 400 + i * 2, y: 2, z: -96 },
  velocity: { x: .012, y: .001, z: 0 }, heading: .35, state: 'foraging', timeSec: 8.2,
  supportNormal: { x: .12, y: .98, z: .15 }, localEnvironment: { currentMps: .18 } }));

test('four whole native kits retain source-size measures and full footprint bounds through finite state motion', t => {
  const objects = kelpBenthicLifeSpeciesCatalog.map(species => createKelpBenthicLifeAsset(species)), hashes = new Set(), receipt = {};
  t.after(() => objects.forEach(disposeKelpBenthicLifeAsset));
  assert.deepEqual(kelpBenthicLifeSpeciesCatalog.map(s => s.id), KELP_BENTHIC_LIFE_IDS);
  for (const [i, object] of objects.entries()) {
    const species = kelpBenthicLifeSpeciesCatalog[i], envelope = KELP_BENTHIC_LIFE_ENVELOPES[species.id], parts = object.userData.kelpBenthicLifeParts;
    assert.equal(object.userData.sizeMeasure, species.sizeMeasure);
    assert.equal(object.userData.speciesId, species.id); assert.equal(envelope.pitchLimit, 0);
    assert.deepEqual([envelope.localBounds.minX, envelope.localBounds.maxX], species.normalizedEnvelope.x);
    assert.deepEqual([envelope.minY, envelope.maxY], species.normalizedEnvelope.y);
    assert.equal(envelope.horizontalRadius, species.normalizedEnvelope.horizontalRadiusUnits);
    const triangles = meshes(object).reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    assert.ok(triangles > 500 && triangles < 3500); assert.ok(meshes(object).length <= 11);
    receipt[species.id] = { triangles, meshes: meshes(object).length, sizeMeasure: species.sizeMeasure };
    object.updateMatrixWorld(true); hashes.add(digest(object));
    for (const mesh of meshes(object)) for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
    for (const state of ['resting', 'foraging', 'kelp-benthic-feeding', 'fixed', 'blocked']) for (let frame = 0; frame < 24; frame++) {
      animateKelpBenthicLifeAsset(object, frame * .41, { state, velocity: { x: state === 'fixed' ? 0 : .012 } }); object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object), b = envelope.localBounds;
      assert.ok(bounds.min.y >= envelope.minY - 1e-6 && bounds.max.y <= envelope.maxY + 1e-6, `${species.id} vertical envelope`);
      assert.ok(bounds.min.x >= b.minX - 1e-6 && bounds.max.x <= b.maxX + 1e-6 && bounds.min.z >= b.minZ - 1e-6 && bounds.max.z <= b.maxZ + 1e-6,
        `${species.id} complete shell/legs/foot/crown envelope`);
      for (const mesh of meshes(object)) {
        const p = mesh.geometry.attributes.position;
        for (let vertex = 0; vertex < p.count; vertex++) {
          const point = new THREE.Vector3().fromBufferAttribute(p, vertex).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.hypot(point.x, point.z) <= envelope.horizontalRadius + 1e-6);
        }
      }
    }
    animateKelpBenthicLifeAsset(object, 0, { state: 'resting' }); object.updateMatrixWorld(true);
    if (species.id === 'red-abalone') {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(parts.shell).getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.ok(parts.foot, 'exposed broad foot is included beyond shell length');
    } else if (species.id === 'northern-kelp-crab') {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(parts.carapace).getSize(new THREE.Vector3()).z - 1) < 1e-6);
      assert.equal(parts.legs.length, 8); assert.equal(parts.claws.length, 2);
      assert.ok(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).z > 3, 'full legs are distinct from unit carapace width');
      const p = parts.carapace.geometry.attributes.position, indices = parts.carapace.geometry.index.array;
      const faceY = offset => {
        const a = new THREE.Vector3().fromBufferAttribute(p, indices[offset]), b = new THREE.Vector3().fromBufferAttribute(p, indices[offset + 1]), c = new THREE.Vector3().fromBufferAttribute(p, indices[offset + 2]);
        return b.sub(a).cross(c.sub(a)).y;
      };
      assert.ok(faceY(0) > 0 && faceY(3) < 0, 'carapace top and underside normals point outward');
    } else if (species.id === 'california-sea-hare') {
      assert.equal(parts.parapodia.length, 2); assert.ok(new THREE.Box3().setFromObject(parts.body).max.y > .42, 'rhinophores remain part of the soft animal');
      assert.equal(Object.hasOwn(parts, 'shell'), false);
    } else {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(parts.column).max.y - 1) < 1e-6);
      assert.ok(new THREE.Box3().setFromObject(parts.crown).max.y > 1.33, 'expanded crown adds height beyond the column-height measure');
      const p = parts.column.geometry.attributes.position, indices = parts.column.geometry.index.array;
      for (let face = 0; face < indices.length; face += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, indices[face]), b = new THREE.Vector3().fromBufferAttribute(p, indices[face + 1]), c = new THREE.Vector3().fromBufferAttribute(p, indices[face + 2]);
        const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        if (center.y > .2 && center.y < .9) assert.ok(b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(center.x, 0, center.z)) > 0, 'native column side normals point outward');
      }
    }
    for (const size of species.sizeRangeM) {
      object.scale.setScalar(size); object.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(object);
      assert.ok(bounds.max.y <= envelope.maxY * size + 1e-6); assert.ok(bounds.min.y >= -1e-6);
    }
    object.scale.setScalar(1);
  }
  assert.equal(hashes.size, 4); t.diagnostic(JSON.stringify({ prototypes: receipt, scope: 'whole procedural representatives; native CPU geometry only' }));
});

test('native dispatcher uses recorded support normals, size, identity and clocks without changing live records', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = agents(), before = structuredClone(rows), origin = { x: 384, z: -128 };
  animals.update([...rows, { ...rows[0], id: 'dead', alive: false }], 9000, origin);
  assert.equal(animals.stats.activeAnimals, 4); assert.equal(animals.pickableObjects.length, 4); assert.equal(animals.getObject('dead'), null);
  for (const row of rows) {
    const object = animals.getObject(row.id), normal = new THREE.Vector3(row.supportNormal.x, row.supportNormal.y, row.supportNormal.z).normalize();
    assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]);
    assert.equal(object.scale.x, row.sizeM); assert.equal(object.userData.regionId, row.regionId);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion).distanceTo(normal) < 1e-12);
    assert.equal(object.userData.kelpBenthicLifeLastTimeSec, row.timeSec);
    const mesh = meshes(object)[0], p = mesh.geometry.attributes.position, indices = mesh.geometry.index.array;
    let hit = null;
    for (let face = 0; !hit && face < Math.min(indices.length, 120); face += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, indices[face]).applyMatrix4(mesh.matrixWorld), b = new THREE.Vector3().fromBufferAttribute(p, indices[face + 1]).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(p, indices[face + 2]).applyMatrix4(mesh.matrixWorld), n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (n.lengthSq() < .9) continue;
      const target = a.clone().add(b).add(c).multiplyScalar(1 / 3), ray = new THREE.Raycaster(target.clone().addScaledVector(n, .2), n.clone().negate());
      hit = ray.intersectObject(object, true)[0];
    }
    assert.ok(hit, `${row.speciesId} native mesh picking`);
    let parent = hit.object; while (parent && !parent.userData.agentId) parent = parent.parent; assert.equal(parent.userData.agentId, row.id);
  }
  const crab = animals.getObject(rows[1].id), pose = crab.userData.kelpBenthicLifeParts.legs[0].rotation.y;
  animals.update(rows, 50000, { x: 448, z: -64 }); assert.equal(crab.userData.kelpBenthicLifeParts.legs[0].rotation.y, pose);
  assert.equal(crab.userData.kelpBenthicLifeLastTimeSec, 8.2); assert.deepEqual(rows, before);
  rows[1].timeSec += .1; animals.update(rows, 50000); assert.notEqual(crab.userData.kelpBenthicLifeParts.legs[0].rotation.y, pose);
  rows[1].state = 'resting'; animals.update(rows, 90000); assert.equal(crab.userData.kelpBenthicLifeParts.legs[0].rotation.y, 0);
  const expectedNormal = new THREE.Vector3(rows[1].supportNormal.x, rows[1].supportNormal.y, rows[1].supportNormal.z).normalize();
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(crab.quaternion).distanceTo(expectedNormal) < 1e-12);
});

test('bounded shared kits retain active references and release geometry/materials exactly once', t => {
  const a = KELP_BENTHIC_LIFE_IDS.map(createKelpBenthicLifeAsset), b = KELP_BENTHIC_LIFE_IDS.map(createKelpBenthicLifeAsset), events = new Map();
  t.after(() => [...a, ...b].forEach(disposeKelpBenthicLifeAsset));
  for (let i = 0; i < a.length; i++) {
    const first = meshes(a[i]), second = meshes(b[i]); assert.equal(first.length, second.length);
    for (let mesh = 0; mesh < first.length; mesh++) {
      assert.equal(first[mesh].geometry, second[mesh].geometry); assert.equal(first[mesh].material, second[mesh].material);
      for (const resource of [first[mesh].geometry, first[mesh].material]) if (!events.has(resource)) {
        events.set(resource, 0); resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1));
      }
    }
  }
  const stats = kelpBenthicLifeAssetStats(); assert.equal(stats.instances, 8); assert.ok(stats.resources <= 21);
  for (let frame = 0; frame < 48; frame++) {
    for (const object of b) animateKelpBenthicLifeAsset(object, frame * .1, { state: 'kelp-benthic-feeding', velocity: { x: .01 } });
    assert.deepEqual(kelpBenthicLifeAssetStats(), stats);
  }
  a.forEach(disposeKelpBenthicLifeAsset); a.forEach(disposeKelpBenthicLifeAsset); assert.ok([...events.values()].every(n => n === 0));
  b.forEach(disposeKelpBenthicLifeAsset); b.forEach(disposeKelpBenthicLifeAsset); assert.ok([...events.values()].every(n => n === 1));
  assert.deepEqual(kelpBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  assert.ok([...a, ...b].every(object => !object.parent && object.children.length === 0));
});

test('the seven original kelp animal geometry and animation receipts remain exact with the new native dispatch', t => {
  const expected = {
    'purple-urchin': '70133c1c48bdf4db9459f0236379714503c845cd18e4b3b94eeea3e4fba7aa60',
    'bat-star': 'd50f1418c9797a2988f5c0bc515121d990304be10798aab226fb0ef596920bf2',
    'giant-kelpfish': '5fc8f3a77717905c38e387125455caff9ced95f1336b681d05f91fb92811f8e1',
    'brown-turban-snail': '80cbfa4a998f77a5475257166a35ec4487cf928b218510db8f715dd41e114ab0',
    'gumboot-chiton': '2365c667d99ff68b580d2f387ca5b70510176a0384fd25f779696c8c0ee64fd8',
    'blue-rockfish': '1507bcb63ca167dc85f1cc3625af68441c20bc70cb5229947633048883b09e9a',
    'leopard-shark': '1d16cae8f71622a39ca453989c2ef95938c841153d492b9922b3e26c43117bf9',
  };
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = oldCatalog.filter(species => species.kind !== 'kelp').map((species, i) => ({ id: `baseline:${species.id}`, speciesId: species.id,
    alive: true, sizeM: species.lengthM || .1, position: { x: 400 + i * 2, y: 2, z: -96 },
    velocity: { x: .08, y: .01, z: 0 }, heading: .35, timeSec: 8.2, state: 'foraging', localEnvironment: { currentMps: .18 } }));
  const before = structuredClone(rows), fresh = agents(); animals.update([...rows, ...fresh], 999, { x: 384, z: -128 });
  assert.equal(rows.length, 7); const originals = rows.map(row => animals.getObject(row.id));
  for (const row of rows) {
    const object = animals.getObject(row.id); assert.equal(digest(object), expected[row.speciesId]);
    assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]); assert.equal(object.rotation.y, -.35);
    assert.equal(object.scale.x, row.sizeM);
    if (catalog.find(s => s.id === row.speciesId).kind === 'fish') assert.equal(object.rotation.z, Math.atan2(.01, .08));
  }
  animals.update(rows, 50000); assert.deepEqual(rows.map(row => animals.getObject(row.id)), originals);
  assert.deepEqual(rows, before); assert.deepEqual(kelpBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId]);
});

test('dead and unsupported individuals stay absent; species replacement, unload and reset release their correct kit', () => {
  const animals = new KelpOceanAnimals(catalog), row = agents()[1];
  animals.update([row, { ...row, id: 'dead', alive: false }, { ...row, id: 'unknown', speciesId: 'unknown' }], 0);
  assert.equal(animals.stats.activeAnimals, 1); const old = animals.getObject(row.id);
  animals.update([{ ...row, speciesId: 'giant-kelpfish' }], 0); assert.equal(old.children.length, 0); assert.equal(old.parent, null);
  assert.equal(animals.getObject(row.id).userData.motion.type, 'fish'); assert.deepEqual(kelpBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  animals.update([row], 500); const rebuilt = animals.getObject(row.id), pose = rebuilt.userData.kelpBenthicLifeParts.legs[0].rotation.y;
  animals.update([], 500); animals.update([row], 9000); assert.equal(animals.getObject(row.id).userData.kelpBenthicLifeParts.legs[0].rotation.y, pose);
  animals.reset(); assert.equal(animals.pickableObjects.length, 0); assert.equal(animals.stats.activeAnimals, 0);
  assert.deepEqual(kelpBenthicLifeAssetStats(), { resources: 0, instances: 0 });
  animals.dispose(); animals.dispose(); assert.equal(animals.update([row], 9000), false);
  assert.throws(() => createKelpBenthicLifeAsset('giant-kelpfish'), /Unknown/);
});
