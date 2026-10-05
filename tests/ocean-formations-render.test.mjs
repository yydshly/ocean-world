import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { historicalGroundContactMatrices } from './reefGroundContactProjection.mjs';
import { OCEAN_FORMATION_LIMIT } from '../src/oceanGeneration.js';
import { OCEAN_ROCK_PROFILES, oceanRockHeight, oceanRockSurface } from '../src/oceanRockShape.js';

function formationFixture(ocean) {
  const origin = { x: 64, z: 128 }, generator = ocean.generator;
  const formations = OCEAN_ROCK_PROFILES.map((profile, index) => ({ id: `macro-${profile}`, kind: 'formation',
    x: 127, y: -16, z: 139 + index * 19, profile, rotation: .37,
    scale: { x: 30, y: 2.2, z: 7 }, groupId: 'macro-group', formationIndex: index }));
  const chunk = { id: '1,2', cx: 1, cz: 2, origin, size: 64, elements: formations };
  ocean.generator = { ...generator, chunk: () => chunk };
  ocean._load(1, 2);
  ocean._refreshStats();
  return { formations, record: ocean._chunks.get('1,2') };
}

test('macro formations reuse existing rock prototypes and exact triangular support across a seam', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const { formations, record } = formationFixture(ocean);
  const ray = new THREE.Raycaster();
  ocean.root.updateMatrixWorld(true);
  for (const formation of formations) {
    const mesh = record.instances.find(instance => instance.name === `generated-formation-rock-${formation.profile}`);
    assert.ok(mesh);
    assert.equal(mesh.geometry, ocean._geometries[`rock-${formation.profile}`]);
    assert.equal(mesh.material, ocean._materials.rock);
    assert.ok(mesh.boundingBox.max.x > 64, 'owner mesh keeps its footprint across the chunk edge');
    let crossed = false;
    for (let z = -.31; z <= .31; z += .113) for (let x = -.39; x <= .39; x += .137) {
      if (!oceanRockSurface(formation.profile, x, z)) continue;
      const wx = formation.x + x * formation.scale.x * Math.cos(formation.rotation) + z * formation.scale.z * Math.sin(formation.rotation);
      const wz = formation.z - x * formation.scale.x * Math.sin(formation.rotation) + z * formation.scale.z * Math.cos(formation.rotation);
      ray.set(new THREE.Vector3(wx, 10, wz), new THREE.Vector3(0, -1, 0));
      const intersection = ray.intersectObject(mesh, false)[0];
      assert.ok(intersection);
      assert.ok(Math.abs(intersection.point.y - oceanRockHeight(formation, wx, wz)) < 2e-5);
      crossed ||= wx > 128;
    }
    assert.ok(crossed, 'the real mesh/support comparison samples the neighbouring chunk');
  }
  assert.equal(ocean.stats.elementCounts.formation, 3);
  assert.equal(ocean.stats.formationDrawCalls, 3);
  assert.equal(ocean.stats.formationTriangles, 176 * 3);
  assert.equal(ocean.stats.prototypeGeometries, 6);
  assert.equal(ocean.stats.prototypeMaterials, 5);
});

test('floating origin moves formations without regeneration, buffer changes or support displacement', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const { formations, record } = formationFixture(ocean);
  const matrices = record.instances.map(mesh => mesh.instanceMatrix.array.slice()), loads = ocean.stats.loads;
  ocean.setRenderOrigin({ x: 128, z: 128 });
  ocean.root.updateMatrixWorld(true);
  assert.deepEqual(record.group.position.toArray(), [-64, 0, 0]);
  assert.equal(ocean.stats.loads, loads);
  const ray = new THREE.Raycaster();
  record.instances.forEach((mesh, index) => {
    assert.deepEqual(mesh.instanceMatrix.array, matrices[index]);
    const formation = formations[index];
    ray.set(new THREE.Vector3(formation.x - 128, 10, formation.z - 128), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh, false)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y - oceanRockHeight(formation, formation.x, formation.z)) < 2e-5);
  });
});

test('unloading releases formation instance buffers while shared rock resources dispose once at final teardown', () => {
  const ocean = new OceanChunks('42');
  const { record } = formationFixture(ocean);
  let instanceDisposals = 0, rockMaterialDisposals = 0, prototypeDisposals = 0;
  for (const mesh of record.instances) mesh.addEventListener('dispose', () => instanceDisposals++);
  ocean._materials.rock.addEventListener('dispose', () => rockMaterialDisposals++);
  for (const profile of OCEAN_ROCK_PROFILES) ocean._geometries[`rock-${profile}`].addEventListener('dispose', () => prototypeDisposals++);
  ocean._unload('1,2'); ocean._refreshStats();
  assert.equal(instanceDisposals, 3);
  assert.equal(rockMaterialDisposals, 0);
  assert.equal(prototypeDisposals, 0);
  assert.equal(ocean.stats.elementCounts.formation, 0);
  assert.equal(ocean.stats.formationTriangles, 0);
  assert.equal(record.group.parent, null);
  ocean.dispose(); ocean.dispose();
  assert.equal(rockMaterialDisposals, 1);
  assert.equal(prototypeDisposals, 3);
});

test('recorded macro terrain and legacy scenery survive with corrected contact Y projected', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const fixtures = [
    [0, 0, '7f0695c1bfd7339ff3a7f0f94c6c636d4a143d6e48ba5b6e37f2fa13c26b9acb'],
    [9, 4, '55a2ed8d959a1d5438254ca034344f27ffc5c1bd8105ce91a2cdf02511d55dfc'],
    [-9, -6, '899ea15dab4a1df60ee0987b477dedade1b487fa0716afaf2bca5c27ce3aaa9e'],
  ];
  for (const [cx, cz, expected] of fixtures) {
    ocean._load(cx, cz);
    const record = ocean._chunks.get(`${cx},${cz}`), hash = createHash('sha256');
    for (const name of ['position', 'normal', 'color', 'uv']) hash.update(Buffer.from(record.terrainGeometry.attributes[name].array.buffer));
    hash.update(Buffer.from(record.terrainGeometry.index.array.buffer));
    for (const mesh of record.instances.filter(mesh => mesh.userData.landscapeKind !== 'formation')) {
      hash.update(mesh.name);
      hash.update(Buffer.from(historicalGroundContactMatrices(mesh, ocean.generator.chunk(cx, cz), ocean.generator).buffer));
      hash.update(Buffer.from(mesh.instanceColor.array.buffer));
    }
    for (const mesh of record.overlays) for (const name of ['position', 'normal', 'color', 'uv']) {
      hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
    }
    assert.equal(hash.digest('hex'), expected, `legacy render fixture ${cx},${cz}`);
    ocean._unload(`${cx},${cz}`);
  }
});

test('real seeded formation groups remain bounded and reproduce their instance buffers after unloading and rebasing', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const geometries = Object.values(ocean._geometries), materials = Object.values(ocean._materials);
  const position = { x: 280, z: -99 };
  const formationBuffers = () => [...ocean._chunks.values()].flatMap(record => record.instances
    .filter(mesh => mesh.userData.landscapeKind === 'formation')
    .map(mesh => ({ chunk: record.group.name, name: mesh.name,
      matrix: [...mesh.instanceMatrix.array], color: [...mesh.instanceColor.array] })))
    .sort((a, b) => a.chunk.localeCompare(b.chunk) || a.name.localeCompare(b.name));
  const checkWindow = () => {
    let count = 0, triangles = 0, draws = 0;
    for (const [id, record] of ocean._chunks) {
      const [cx, cz] = id.split(',').map(Number), formations = ocean.generator.chunk(cx, cz).elements
        .filter(element => element.kind === 'formation');
      assert.ok(formations.length <= OCEAN_FORMATION_LIMIT);
      count += formations.length;
      for (const mesh of record.instances.filter(mesh => mesh.userData.landscapeKind === 'formation')) {
        assert.equal(mesh.material, ocean._materials.rock);
        assert.ok(geometries.includes(mesh.geometry));
        triangles += mesh.geometry.index.count / 3 * mesh.count;
        draws++;
      }
    }
    assert.equal(ocean.stats.activeChunks, 9);
    assert.equal(ocean.stats.elementCounts.formation, count);
    assert.equal(ocean.stats.formationTriangles, triangles);
    assert.equal(ocean.stats.formationDrawCalls, draws);
    assert.ok(count <= ocean.stats.maxFormationInstances);
    assert.equal(ocean.stats.maxFormationInstances, 9 * OCEAN_FORMATION_LIMIT);
    assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
    assert.equal(ocean.stats.maxDrawCalls, 108);
    assert.ok(ocean.generator.cacheStats().size <= 32);
    assert.equal(ocean.stats.prototypeGeometries, 6);
    assert.equal(ocean.stats.prototypeMaterials, 5);
    assert.deepEqual(Object.values(ocean._geometries), geometries);
    assert.deepEqual(Object.values(ocean._materials), materials);
  };
  ocean.update(position);
  checkWindow();
  assert.equal(ocean.stats.elementCounts.formation, 2, 'the nearest real seed-42 group has two parallel terraces');
  const original = formationBuffers();
  assert.equal(original.length, 1, 'the two terraces share one instance draw');
  let instanceDisposals = 0;
  for (const record of ocean._chunks.values()) for (const mesh of record.instances
    .filter(mesh => mesh.userData.landscapeKind === 'formation')) mesh.addEventListener('dispose', () => instanceDisposals++);
  for (const next of [{ x: -768, z: 256 }, { x: 1024, z: -896 }, { x: 280, z: -99 }]) {
    ocean.setRenderOrigin({ x: Math.floor(next.x / 256) * 256, z: Math.floor(next.z / 256) * 256 });
    ocean.update(next);
    checkWindow();
  }
  assert.equal(instanceDisposals, original.length);
  assert.deepEqual(formationBuffers(), original, 'revisit restores deterministic chunk-local formation buffers');
});
