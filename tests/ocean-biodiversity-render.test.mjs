import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOceanBiodiversityAsset, animateOceanBiodiversityAsset, disposeOceanBiodiversityAsset,
  oceanBiodiversityAssetStats, OCEAN_BIODIVERSITY_IDS, OCEAN_BIODIVERSITY_ENVELOPES,
  OceanBiodiversityPatches } from '../src/world/OceanBiodiversityAssets.js';
import { oceanBiodiversityPatchMesh, oceanBiodiversityPatchHeight } from '../src/oceanBiodiversityShape.js';
import { oceanBiodiversitySpeciesCatalog } from '../src/oceanBiodiversitySpecies.js';
import { speciesCatalog } from '../src/species.js';
import { oceanReefGuildSpeciesCatalog } from '../src/oceanReefGuildSpecies.js';
import { openWaterSpeciesCatalog } from '../src/oceanOpenWaterSpecies.js';
import { oceanTurtleSpeciesCatalog } from '../src/oceanTurtleSpecies.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createOceanBiodiversityPlan } from '../src/oceanBiodiversity.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { oceanRockMesh } from '../src/oceanRockShape.js';

// Static CPU Three meshes and React-world dispatch inputs, not GPU appearance,
// measured anatomy, actual ecological births or photogrammetry acceptance.
const catalog = [...speciesCatalog, ...oceanReefGuildSpeciesCatalog, ...openWaterSpeciesCatalog,
  ...oceanTurtleSpeciesCatalog, ...oceanBiodiversitySpeciesCatalog];
const meshes = root => { const rows = []; root.traverse(object => { if (object.isMesh) rows.push(object); }); return rows; };
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const shapeDigest = root => {
  const hash = createHash('sha256');
  for (const mesh of meshes(root)) {
    for (const [name, attr] of Object.entries(mesh.geometry.attributes).sort()) { hash.update(name); hash.update(bytes(attr.array)); }
    if (mesh.geometry.index) hash.update(bytes(mesh.geometry.index.array)); hash.update(JSON.stringify(mesh.matrix.toArray()));
  }
  return hash.digest('hex');
};
const animalIds = OCEAN_BIODIVERSITY_IDS.slice(2);
const agents = () => animalIds.map((speciesId, i) => ({ id: `live:${speciesId}`, speciesId, regionId: '96,2', alive: true,
  sizeM: oceanBiodiversitySpeciesCatalog.find(species => species.id === speciesId).lengthM,
  position: { x: 6146 + i * 2, y: -6, z: 132 }, heading: .3, velocity: { x: .08, y: 0, z: 0 }, timeSec: 2, state: 'feeding',
  ...(speciesId === 'clown-anemonefish' ? { clownHostId: 'live:shallow-anemone' } : {}) }));
const patch = (id, speciesId, x, z) => ({ id, speciesId, kind: 'biodiversity-patch', x, y: -5.5, z, rotation: .43,
  scale: speciesId === 'biodiversity-massive-coral' ? { x: .8, y: .44, z: .7 } : { x: .28, y: .035, z: .24 }, hostId: 'retained-hard-cap',
  scope: 'static-habitat-descriptor-not-additional-simulated-biomass' });

test('all eight complete representatives have distinct finite full-size silhouettes, physical support origins and bounded prototype triangles', t => {
  const digests = new Set(), receipt = {}, assets = OCEAN_BIODIVERSITY_IDS.map(id => createOceanBiodiversityAsset(id));
  t.after(() => assets.forEach(asset => disposeOceanBiodiversityAsset(asset.group)));
  for (let i = 0; i < assets.length; i++) {
    const { group, parts } = assets[i], id = OCEAN_BIODIVERSITY_IDS[i];
    assert.equal(group.userData.speciesId, id); assert.ok(parts && Object.keys(parts).length > 0);
    group.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(group), count = meshes(group)
      .reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    assert.ok(count > 30 && count < 4500); receipt[id] = { triangles: count, meshes: meshes(group).length };
    for (const mesh of meshes(group)) for (const attr of Object.values(mesh.geometry.attributes)) assert.ok([...attr.array].every(Number.isFinite));
    digests.add(shapeDigest(group));
    if (['sand-goby', 'reef-parrotfish', 'clown-anemonefish'].includes(id)) {
      assert.ok(Math.abs(bounds.max.x - .5) < 1e-6); assert.ok(Math.abs(bounds.min.x + .5) < 1e-6);
      assert.ok(bounds.max.y <= .26 && bounds.min.y >= -.26);
    } else {
      assert.ok(bounds.min.y >= -1e-8, `${id} never invents a sub-support footing`);
      const envelope = OCEAN_BIODIVERSITY_ENVELOPES[id];
      if (envelope) { assert.ok(bounds.max.y <= envelope.top); assert.ok(Math.max(Math.abs(bounds.min.x), bounds.max.x, Math.abs(bounds.min.z), bounds.max.z) <= envelope.radius); }
      if (id === 'biodiversity-grape-algae') {
        group.scale.set(.28, .035, .28); group.updateMatrixWorld(true);
        const actual = new THREE.Box3().setFromObject(group);
        assert.ok(Math.abs(actual.max.y - .035) < 1e-6, 'the actual patch shoot-height scale produces 3.5cm low creeping grapes');
      }
    }
  }
  assert.equal(digests.size, 8); t.diagnostic(JSON.stringify({ prototypeTriangles: receipt, scope: 'procedural representatives; CPU geometry only' }));
});

test('actual OceanAnimals dispatch preserves positions, real per-agent clocks, host metadata and ray-picking for the six living types', t => {
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = agents(), original = structuredClone(rows), origin = { x: 6144, z: 128 };
  animals.update([...rows, { ...rows[0], id: 'dead', alive: false }, { ...rows[0], id: 'unknown', speciesId: 'missing' }], 99, origin);
  assert.equal(animals.stats.activeAnimals, 6); assert.equal(animals.pickableObjects.length, 6); assert.equal(animals.getObject('dead'), null);
  const ray = new THREE.Raycaster();
  for (const row of rows) {
    const object = animals.getObject(row.id); assert.equal(object.userData.speciesId, row.speciesId); assert.equal(object.userData.regionId, row.regionId);
    assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]); assert.equal(object.scale.x, row.sizeM);
    const mesh = meshes(object)[0], attribute = mesh.geometry.attributes.position, index = mesh.geometry.index.array;
    const a = new THREE.Vector3().fromBufferAttribute(attribute, index[0]).applyMatrix4(mesh.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(attribute, index[1]).applyMatrix4(mesh.matrixWorld);
    const c = new THREE.Vector3().fromBufferAttribute(attribute, index[2]).applyMatrix4(mesh.matrixWorld);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(), target = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    ray.set(target.clone().addScaledVector(normal, .15), normal.clone().negate());
    const hit = ray.intersectObject(object, true)[0]; assert.ok(hit, `${row.speciesId} actual geometry is pickable`);
    let ancestor = hit.object; while (ancestor && !ancestor.userData.agentId) ancestor = ancestor.parent;
    assert.equal(ancestor.userData.agentId, row.id);
  }
  assert.deepEqual(rows, original, 'display motion never changes durable ecological state');
  const fish = animals.getObject('live:sand-goby'), tail = fish.userData.biodiversityParts.tail;
  const pose = tail.rotation.y; animals.update(rows, 999, origin); assert.equal(tail.rotation.y, pose, 'individual clock freezes motion despite wall clock');
  rows.find(row => row.speciesId === 'sand-goby').timeSec = 3;
  animals.update(rows, 999, origin); assert.notEqual(tail.rotation.y, pose);
  const worm = animals.getObject('live:feather-duster'); rows.find(row => row.speciesId === 'feather-duster').state = 'sheltering';
  animals.update(rows, 999, origin); assert.equal(worm.userData.biodiversityParts.crown.scale.y, .35); assert.equal(worm.position.y, -6);
});

test('actual instanced hard-coral triangles match the pure support query through large rebases while soft patches stay separate from animals and food', t => {
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const origin = { x: 1e9, z: -1e9 }, patches = [patch('coral', OCEAN_BIODIVERSITY_IDS[0], origin.x + 3.2, origin.z + 2.1),
    patch('algae', OCEAN_BIODIVERSITY_IDS[1], origin.x + 5, origin.z + 2)];
  animals.update([], 0, origin, null, patches); assert.equal(animals.stats.activeAnimals, 0); assert.equal(animals.pickableObjects.length, 0);
  assert.equal(animals.stats.biodiversityScenery.count, 2); assert.equal(animals.stats.biodiversityScenery.drawCalls, 2);
  const scene = animals._biodiversityPatches, mesh = scene._meshes.get(OCEAN_BIODIVERSITY_IDS[0]);
  const shared = oceanBiodiversityPatchMesh(OCEAN_BIODIVERSITY_IDS[0]);
  assert.deepEqual([...mesh.geometry.attributes.position.array], shared.positions); assert.deepEqual([...mesh.geometry.index.array], shared.indices);
  const ray = new THREE.Raycaster(); let maxError = 0;
  for (const rebase of [origin, { x: origin.x + 64, z: origin.z - 64 }]) {
    animals.update([], 0, rebase, null, patches); animals.root.updateMatrixWorld(true);
    for (const [dx, dz] of [[0, 0], [.13, .08], [-.12, -.09], [.20, -.04]]) {
      const x = patches[0].x + dx, z = patches[0].z + dz;
      ray.set(new THREE.Vector3(x - rebase.x, 0, z - rebase.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit);
      const height = oceanBiodiversityPatchHeight(patches[0], x, z), error = Math.abs(hit.point.y - height);
      maxError = Math.max(maxError, error); assert.ok(error < 1e-6);
    }
  }
  assert.equal(oceanBiodiversityPatchHeight(patches[0], patches[0].x + 2, patches[0].z), null);
  assert.equal(oceanBiodiversityPatchHeight(patches[1], patches[1].x, patches[1].z), null);
  t.diagnostic(`actual colony hard-surface max triangle error=${maxError}m; no GPU appearance acceptance`);
});

test('a naturally admitted grape patch follows its actual native sloping rock triangles with bounded root-plane clearance', t => {
  const generator = createLivingShallowsGenerator(livingShallowsSeed('42'));
  const bed = (x, z) => generator.floorSurface(x, z).height;
  const surface = (x, z, crown = false) => oceanSupportHeight(generator, x, z, { avoidCoral: crown });
  let selected, owner;
  for (const [cx, cz] of [[184, -16]]) {
    const plan = createOceanBiodiversityPlan(generator, { id: `${cx},${cz}`, cx, cz, agents: [] }, { bed, surface, availableSlots: 6 });
    selected = plan.patches.find(p => p.speciesId === 'biodiversity-grape-algae' && p.surfaceNormal?.y < .995);
    if (selected) { owner = generator.chunk(cx, cz); break; }
  }
  assert.ok(selected, 'the ordinary native window admits a real sloping grape patch, without forced spawn');
  const host = owner.elements.find(e => e.id === selected.hostId), data = oceanRockMesh(host.profile);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), native = new THREE.Mesh(geometry, material);
  const origin = { x: owner.cx * 64, z: owner.cz * 64 };
  native.position.set(host.x - origin.x, host.y, host.z - origin.z); native.rotation.y = host.rotation;
  native.scale.set(host.scale.x, host.scale.y, host.scale.z); native.updateMatrixWorld(true);
  const animals = new OceanAnimals(catalog); t.after(() => { animals.dispose(); geometry.dispose(); material.dispose(); });
  animals.update([], 0, origin, null, [selected]); animals.root.updateMatrixWorld(true);
  const mesh = animals._biodiversityPatches._meshes.get('biodiversity-grape-algae'), matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  const actualUp = new THREE.Vector3(0, 1, 0).transformDirection(matrix), normal = new THREE.Vector3(selected.surfaceNormal.x, selected.surfaceNormal.y, selected.surfaceNormal.z);
  assert.ok(actualUp.distanceTo(normal) < 1e-6); assert.equal(animals.stats.biodiversityScenery.drawCalls, 1);
  const positions = mesh.geometry.attributes.position, ray = new THREE.Raycaster(); let minGap = Infinity, maxGap = -Infinity;
  const visited = new Set();
  for (let i = 0; i < positions.count; i++) {
    const key = `${positions.getX(i)},${positions.getZ(i)}`; if (visited.has(key)) continue; visited.add(key);
    const root = new THREE.Vector3(positions.getX(i), 0, positions.getZ(i)).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld);
    ray.set(new THREE.Vector3(root.x, generator.surfaceY + 1, root.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(native)[0]; assert.ok(hit, 'the whole creeping footprint remains on its actual host');
    const gap = root.y - hit.point.y; minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
    assert.ok(gap >= .004 - 2e-6 && gap <= .012 + 2e-6, `actual native root-plane gap ${gap}m`);
  }
  const shape = mesh.geometry, before = matrix.clone();
  assert.equal(animals._biodiversityPatches.update([selected], origin), false);
  mesh.getMatrixAt(0, matrix); assert.deepEqual(matrix, before); assert.equal(mesh.geometry, shape);
  const flat = { ...selected }; delete flat.surfaceNormal;
  animals.update([], 0, origin, null, [flat]); mesh.getMatrixAt(0, matrix);
  assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(matrix).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8, 'normal-absent historic yaw remains upright');
  t.diagnostic(JSON.stringify({ owner: owner.id, hostId: host.id, grapeId: selected.id,
    actualRootPoints: visited.size, minNativeGapM: minGap, maxNativeGapM: maxGap, normal: selected.surfaceNormal, scope: 'CPU native triangle attachment' }));
});

test('shared kit resources survive another live owner, stay bounded on repeated updates and release exactly once including the two fixed scenery buffers', t => {
  const a = OCEAN_BIODIVERSITY_IDS.map(id => createOceanBiodiversityAsset(id).group), b = OCEAN_BIODIVERSITY_IDS.map(id => createOceanBiodiversityAsset(id).group);
  const patches = new OceanBiodiversityPatches(), resources = new Map();
  t.after(() => { a.concat(b).forEach(disposeOceanBiodiversityAsset); patches.dispose(); });
  for (const group of a.concat(b)) for (const mesh of meshes(group)) for (const resource of [mesh.geometry, mesh.material])
    if (!resources.has(resource)) { resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1)); }
  const before = oceanBiodiversityAssetStats();
  const rows = Array.from({ length: 190 }, (_, i) => patch(`patch:${i}`, OCEAN_BIODIVERSITY_IDS[i % 2], 10 + i, 2));
  patches.update(rows); assert.equal(patches.stats.count, 180); assert.equal(patches.stats.maxPatches, 180); assert.equal(patches.stats.drawCalls, 2);
  const buffers = [...patches._meshes.values()].map(mesh => mesh.instanceMatrix.array), shapes = [...patches._meshes.values()].map(mesh => mesh.geometry);
  for (let i = 0; i < 40; i++) {
    for (const group of b) animateOceanBiodiversityAsset(group, i / 10, { state: 'feeding', velocity: { x: .08 } });
    assert.equal(patches.update(rows), false); assert.deepEqual(oceanBiodiversityAssetStats(), before);
    assert.deepEqual([...patches._meshes.values()].map(mesh => mesh.instanceMatrix.array), buffers);
    assert.deepEqual([...patches._meshes.values()].map(mesh => mesh.geometry), shapes);
  }
  a.forEach(disposeOceanBiodiversityAsset); a.forEach(disposeOceanBiodiversityAsset);
  assert.ok([...resources.values()].every(count => count === 0));
  b.forEach(disposeOceanBiodiversityAsset); assert.equal(oceanBiodiversityAssetStats().instances, 0);
  patches.dispose(); patches.dispose(); assert.ok([...resources.values()].every(count => count === 1));
  assert.deepEqual(oceanBiodiversityAssetStats(), { resources: 0, instances: 0 });
});

test('all five original generic, guild, open-water and turtle geometry/pose receipts remain exact with the optional biodiversity renderer', t => {
  // Independently captured from HEAD's original OceanAnimals source before
  // dispatch modification, resolving its unchanged native factory modules.
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
  for (const [id, hash] of Object.entries(expected)) assert.equal(shapeDigest(animals.getObject(`before:${id}`)), hash);
  assert.equal(Object.hasOwn(animals.stats, 'biodiversityScenery'), false); assert.equal(animals.root.children.length, 5);
});
