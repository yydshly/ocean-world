import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOceanBenthicLifeAsset, animateOceanBenthicLifeAsset, disposeOceanBenthicLifeAsset,
  oceanBenthicLifeAssetStats, OCEAN_BENTHIC_LIFE_IDS, OCEAN_BENTHIC_LIFE_ENVELOPES } from '../src/world/OceanBenthicLifeAssets.js';
import { oceanBenthicLifeSpeciesCatalog } from '../src/oceanBenthicLifeSpecies.js';
import { speciesCatalog } from '../src/species.js';
import { oceanReefGuildSpeciesCatalog } from '../src/oceanReefGuildSpecies.js';
import { openWaterSpeciesCatalog } from '../src/oceanOpenWaterSpecies.js';
import { oceanTurtleSpeciesCatalog } from '../src/oceanTurtleSpecies.js';
import { oceanMantaSpeciesCatalog } from '../src/oceanMantaSpecies.js';
import { oceanBiodiversitySpeciesCatalog } from '../src/oceanBiodiversitySpecies.js';

// Native Three silhouettes, transforms and picking are CPU evidence. These
// fixture agents are not admission, measured anatomy or GPU visual evidence.
const catalog = [...speciesCatalog, ...oceanReefGuildSpeciesCatalog, ...openWaterSpeciesCatalog,
  ...oceanTurtleSpeciesCatalog, ...oceanMantaSpeciesCatalog, ...oceanBiodiversitySpeciesCatalog, ...oceanBenthicLifeSpeciesCatalog];
const meshes = root => { const rows = []; root.traverse(object => { if (object.isMesh) rows.push(object); }); return rows; };
const digest = root => {
  const hash = createHash('sha256');
  for (const mesh of meshes(root)) {
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes).sort()) {
      hash.update(name); hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    if (mesh.geometry.index) { const a = mesh.geometry.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    hash.update(JSON.stringify(mesh.matrix.toArray()));
  }
  return hash.digest('hex');
};
const agents = () => OCEAN_BENTHIC_LIFE_IDS.map((speciesId, i) => ({ id: `benthic:${speciesId}`, speciesId,
  regionId: '188,14', alive: true, sizeM: oceanBenthicLifeSpeciesCatalog.find(row => row.id === speciesId).lengthM,
  position: { x: 12064 + i * 2, y: -5.2, z: 928 }, velocity: { x: .05, y: .01, z: 0 }, heading: .35,
  pitch: 0, timeSec: 2, state: 'foraging' }));

test('four complete silhouettes use distinct source-size measures and stay inside whole-body envelopes throughout finite state motion', t => {
  const assets = OCEAN_BENTHIC_LIFE_IDS.map(id => createOceanBenthicLifeAsset(id)), hashes = new Set(), receipt = {};
  t.after(() => assets.forEach(row => disposeOceanBenthicLifeAsset(row.group)));
  for (const [i, asset] of assets.entries()) {
    const id = OCEAN_BENTHIC_LIFE_IDS[i], species = oceanBenthicLifeSpeciesCatalog.find(row => row.id === id), envelope = OCEAN_BENTHIC_LIFE_ENVELOPES[id];
    assert.equal(asset.group.userData.sizeMeasure, species.sizeMeasure); assert.equal(asset.group.userData.speciesId, id);
    const triangles = meshes(asset.group).reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    assert.ok(triangles > 150 && triangles < 4500); receipt[id] = { triangles, meshes: meshes(asset.group).length, sizeMeasure: species.sizeMeasure };
    asset.group.updateMatrixWorld(true); hashes.add(digest(asset.group));
    for (const mesh of meshes(asset.group)) for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
    for (const state of ['resting', 'foraging', 'feeding', 'sheltering']) for (let frame = 0; frame < 32; frame++) {
      animateOceanBenthicLifeAsset(asset.group, frame * .37, { state, velocity: { x: .05 } }); asset.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(asset.group), b = envelope.localBounds;
      assert.ok(bounds.min.y >= envelope.minY - 1e-6 && bounds.max.y <= envelope.maxY + 1e-6, `${id} whole vertical envelope`);
      assert.ok(bounds.min.x >= b.minX - 1e-6 && bounds.max.x <= b.maxX + 1e-6 && bounds.min.z >= b.minZ - 1e-6 && bounds.max.z <= b.maxZ + 1e-6, `${id} complete root/feet/tail/barbel envelope`);
      for (const mesh of meshes(asset.group)) {
        const p = mesh.geometry.attributes.position;
        for (let vertex = 0; vertex < p.count; vertex++) {
          const point = new THREE.Vector3().fromBufferAttribute(p, vertex).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.hypot(point.x, point.z) <= envelope.horizontalRadius + 1e-6);
        }
      }
    }
    for (const size of species.sizeRangeM) {
      asset.group.scale.setScalar(size); asset.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(asset.group);
      assert.ok(bounds.max.y <= envelope.maxY * size + 1e-6); assert.ok(bounds.min.y >= envelope.minY * size - 1e-6);
    }
    asset.group.scale.setScalar(1); animateOceanBenthicLifeAsset(asset.group, 0, { state: 'resting' }); asset.group.updateMatrixWorld(true);
    if (id === 'tiger-cowrie' || id === 'spotted-hermit-crab') {
      const shell = new THREE.Box3().setFromObject(asset.parts.shell); assert.ok(Math.abs(shell.max.x - shell.min.x - 1) < 1e-6, 'shell length is not whole exposed-animal length');
      if (id === 'tiger-cowrie') assert.ok(asset.parts.foot && asset.parts.mantle);
      else { assert.equal(asset.parts.legs.length, 4); assert.equal(asset.parts.claws.length, 2); }
    } else if (id === 'blue-spotted-ray') {
      const disc = new THREE.Box3().setFromObject(asset.parts.wings[0]); assert.ok(Math.abs(disc.max.z - disc.min.z - 1) < 1e-6);
      const bounds = new THREE.Box3().setFromObject(asset.group); assert.ok(Math.abs(bounds.max.x - bounds.min.x - 2.57) < .003, 'the disc-width measure also retains the complete long-tail envelope');
      assert.equal(asset.parts.wings.length, 2); assert.ok(asset.parts.tail); assert.equal(envelope.pitchLimit, 0);
    } else {
      const bounds = new THREE.Box3().setFromObject(asset.group); assert.ok(Math.abs(bounds.max.x - bounds.min.x - 1) < 1e-6);
      assert.ok(asset.parts.barbels); assert.ok(bounds.min.y < -.25, 'both downward chin barbels enter the clearance envelope');
    }
  }
  assert.equal(hashes.size, 4); t.diagnostic(JSON.stringify({ prototypes: receipt, scope: 'procedural representative assets; CPU only' }));
});

test('actual dispatch preserves recorded pose, clocks and picking; long-tail bottom ray stays horizontal while existing rays retain velocity pitch', t => {
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = agents(), before = structuredClone(rows), oldRaySpecies = oceanMantaSpeciesCatalog.find(row => row.kind === 'ray'); assert.ok(oldRaySpecies);
  const oldRay = { ...rows[2], id: 'old:ray', speciesId: oldRaySpecies.id, sizeM: .3 };
  animals.update([...rows, oldRay, { ...rows[0], id: 'dead', alive: false }], 999, { x: 12032, z: 896 });
  assert.equal(animals.stats.activeAnimals, 5); assert.equal(animals.pickableObjects.length, 5); assert.equal(animals.getObject('dead'), null);
  for (const row of rows) {
    const object = animals.getObject(row.id); assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]);
    assert.equal(object.scale.x, row.sizeM); assert.equal(object.rotation.y, -row.heading); assert.equal(object.userData.regionId, row.regionId);
    const mesh = meshes(object)[0], p = mesh.geometry.attributes.position, indices = mesh.geometry.index.array;
    const a = new THREE.Vector3().fromBufferAttribute(p, indices[0]).applyMatrix4(mesh.matrixWorld), b = new THREE.Vector3().fromBufferAttribute(p, indices[1]).applyMatrix4(mesh.matrixWorld);
    const c = new THREE.Vector3().fromBufferAttribute(p, indices[2]).applyMatrix4(mesh.matrixWorld), normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const target = a.clone().add(b).add(c).multiplyScalar(1 / 3), ray = new THREE.Raycaster(target.clone().addScaledVector(normal, .2), normal.clone().negate());
    const hit = ray.intersectObject(object, true)[0]; assert.ok(hit, `${row.speciesId} native whole mesh is pickable`);
    let parent = hit.object; while (parent && !parent.userData.agentId) parent = parent.parent; assert.equal(parent.userData.agentId, row.id);
  }
  assert.equal(animals.getObject(rows[2].id).rotation.z, 0, 'all tail support was admitted in a horizontal pose');
  assert.ok(Math.abs(animals.getObject(oldRay.id).rotation.z - Math.atan2(.01, .08)) < 1e-12, 'old ray pitch remains unchanged');
  const tail = animals.getObject(rows[3].id).userData.benthicLifeParts.tail, pose = tail.rotation.y;
  animals.update([...rows, oldRay], 5000); assert.equal(tail.rotation.y, pose);
  rows[3].timeSec = 3; animals.update([...rows, oldRay], 5000); assert.notEqual(tail.rotation.y, pose);
  rows[1].state = 'sheltering'; animals.update([...rows, oldRay], 5000);
  assert.equal(animals.getObject(rows[1].id).userData.benthicLifeParts.legs[0].scale.x, .82);
  assert.deepEqual(rows.slice(0, 1), before.slice(0, 1), 'display never changes recorded world position or food');
});

test('shared whole models reuse bounded resources across frames, retain live owners and release each geometry/material once', t => {
  const first = new OceanAnimals(catalog), second = new OceanAnimals(catalog), rows = agents(), resourceEvents = new Map();
  t.after(() => { first.dispose(); second.dispose(); }); first.update(rows, 0); second.update(rows, 0);
  for (const row of rows) {
    const a = meshes(first.getObject(row.id)), b = meshes(second.getObject(row.id)); assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].geometry, b[i].geometry); assert.equal(a[i].material, b[i].material);
      for (const resource of [a[i].geometry, a[i].material]) if (!resourceEvents.has(resource)) {
        resourceEvents.set(resource, 0); resource.addEventListener('dispose', () => resourceEvents.set(resource, resourceEvents.get(resource) + 1));
      }
    }
  }
  const stats = oceanBenthicLifeAssetStats(), objects = rows.map(row => second.getObject(row.id));
  for (let frame = 0; frame < 40; frame++) {
    assert.equal(second.update(rows, frame, { x: frame % 2 ? 12032 : 12096, z: 896 }), false);
    assert.deepEqual(oceanBenthicLifeAssetStats(), stats); assert.deepEqual(rows.map(row => second.getObject(row.id)), objects);
  }
  first.dispose(); first.dispose(); assert.ok([...resourceEvents.values()].every(n => n === 0));
  second.dispose(); second.dispose(); assert.ok([...resourceEvents.values()].every(n => n === 1));
  assert.deepEqual(oceanBenthicLifeAssetStats(), { resources: 0, instances: 0 });
});

test('original authored, guild, open-water and turtle geometry/pose bytes remain independent exact receipts with the new dispatcher', t => {
  const expected = {
    'green-chromis': '5e4fe1616ba8e27bf596668826841a43876ab10e5cd4c841658b8ed8c55fbf24',
    'black-cucumber': '7f35b1abc006ed672b85e058f94e81ce0fdd10f48a70bd05931bb7d36d284edb',
    'tube-sponge': 'b8bf027ac877ed767d250d745ea0495f1a1fd38a68e3e06dc21c0d45c87f86d5',
    'reef-squid': '86611ad72ec0a199316244165730a2e927abe6ca557ed2a4e5becf902aabb37d',
    'green-turtle': 'd913294b8ac2291033294e9bb267ac63f1ddf2794b16abd3cbc7342315b5e6f0',
  };
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = Object.keys(expected).map((speciesId, i) => ({ id: `before:${speciesId}`, speciesId, alive: true, sizeM: .3,
    position: { x: 205 + i, y: -5, z: -85 }, velocity: { x: .08, y: 0, z: 0 }, heading: .3, state: 'resting', timeSec: 2 }));
  animals.update(rows, 2, { x: 192, z: -64 });
  for (const [id, hash] of Object.entries(expected)) assert.equal(digest(animals.getObject(`before:${id}`)), hash);
  assert.equal(Object.hasOwn(animals.stats, 'biodiversityScenery'), false);
});
