import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { OCEAN_CHUNK_SIZE, OCEAN_CHUNK_CACHE_LIMIT } from '../src/oceanGeneration.js';
import { OCEAN_ROCK_PROFILES, oceanRockHeight, oceanRockSurface } from '../src/oceanRockShape.js';

const ROW = 65;

function assertSharedVertex(a, ai, b, bi) {
  const pa = a.terrainGeometry.attributes.position, pb = b.terrainGeometry.attributes.position;
  assert.equal(pa.getX(ai) + a.origin.x, pb.getX(bi) + b.origin.x);
  assert.equal(pa.getY(ai), pb.getY(bi));
  assert.equal(pa.getZ(ai) + a.origin.z, pb.getZ(bi) + b.origin.z);
  for (const name of ['normal', 'color', 'uv']) {
    const aa = a.terrainGeometry.attributes[name], ba = b.terrainGeometry.attributes[name];
    for (let component = 0; component < aa.itemSize; component++) {
      assert.equal(aa.array[ai * aa.itemSize + component], ba.array[bi * ba.itemSize + component], `${name} component ${component}`);
    }
  }
}

test('positive and negative 64 metre edges share height, normals, colors and world UVs', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  ocean.update({ x: 2, z: 2 });
  for (const west of [-1, 0]) {
    const a = ocean._chunks.get(`${west},0`), b = ocean._chunks.get(`${west + 1},0`);
    for (let row = 0; row < ROW; row++) assertSharedVertex(a, row * ROW + ROW - 1, b, row * ROW);
  }
  for (const north of [-1, 0]) {
    const a = ocean._chunks.get(`0,${north}`), b = ocean._chunks.get(`0,${north + 1}`);
    for (let column = 0; column < ROW; column++) assertSharedVertex(a, (ROW - 1) * ROW + column, b, column);
  }
});

test('near movement, negative crossings and far jumps retain at most nine chunks and a bounded generator cache', t => {
  const ocean = new OceanChunks('streaming');
  t.after(() => ocean.dispose());
  assert.equal(ocean.update({ x: 3, z: 5 }), true);
  const loads = ocean.stats.loads;
  assert.equal(ocean.update({ x: 4, z: 6 }), false);
  assert.equal(ocean.stats.loads, loads);
  const positions = [{ x: -1, z: -65 }, { x: 64, z: 64 }, { x: 1e7, z: -1e7 }];
  for (let index = 0; index < 20; index++) positions.push({ x: index * 641 - 1600, z: -index * 121 });
  for (const position of positions) {
    ocean.update(position);
    assert.equal(ocean.stats.activeChunks, 9);
    assert.equal(ocean.root.children.length, 9);
    assert.equal(ocean.stats.maxActiveChunks, 9);
    assert.equal(ocean.stats.center.cx, Math.floor(position.x / OCEAN_CHUNK_SIZE));
    assert.equal(ocean.stats.center.cz, Math.floor(position.z / OCEAN_CHUNK_SIZE));
    assert.ok(ocean.stats.drawCalls <= 108, 'at most seven legacy scenery, three formation batches, buried rock sides and terrain per chunk');
    assert.equal(ocean.stats.prototypeGeometries, 6);
    assert.equal(ocean.stats.prototypeMaterials, 5);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9);
    ocean.generator.heightForCamera(position.x, position.z);
    assert.ok(ocean.generator.cacheStats().size <= OCEAN_CHUNK_CACHE_LIMIT);
  }
});

test('floating origin relocates resident groups without regeneration and keeps geometry in local coordinates', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  ocean.update({ x: 3, z: 5 });
  const record = ocean._chunks.get('0,0'), geometry = record.terrainGeometry;
  const matrix = record.instances[0].instanceMatrix.array.slice();
  const overlayPositions = record.overlays[0]?.geometry.attributes.position.array.slice();
  const loads = ocean.stats.loads;
  assert.equal(ocean.setRenderOrigin({ x: 512, z: -256 }), true);
  assert.equal(ocean.setRenderOrigin({ x: 512, z: -256 }), false);
  assert.equal(ocean.stats.loads, loads);
  assert.equal(record.terrainGeometry, geometry);
  assert.deepEqual(record.instances[0].instanceMatrix.array, matrix);
  if (overlayPositions) assert.deepEqual(record.overlays[0].geometry.attributes.position.array, overlayPositions);
  assert.deepEqual(record.group.position.toArray(), [-512, 0, 256]);

  const origin = { x: 1e9, z: -1e9 };
  ocean.update({ x: origin.x + 8, z: origin.z + 8 });
  const farLoads = ocean.stats.loads;
  ocean.setRenderOrigin(origin);
  assert.equal(ocean.stats.loads, farLoads);
  for (const rec of ocean._chunks.values()) {
    assert.ok(Math.abs(rec.group.position.x) <= OCEAN_CHUNK_SIZE * 2);
    assert.ok(Math.abs(rec.group.position.z) <= OCEAN_CHUNK_SIZE * 2);
    const positions = rec.terrainGeometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      assert.ok(positions.getX(vertex) >= 0 && positions.getX(vertex) <= OCEAN_CHUNK_SIZE);
      assert.ok(positions.getZ(vertex) >= 0 && positions.getZ(vertex) <= OCEAN_CHUNK_SIZE);
      assert.ok(Number.isFinite(positions.getY(vertex)));
    }
    for (const mesh of rec.instances) for (let index = 0; index < mesh.count; index++) {
      assert.ok(Math.abs(mesh.instanceMatrix.array[index * 16 + 12]) < OCEAN_CHUNK_SIZE + 2);
      assert.ok(Math.abs(mesh.instanceMatrix.array[index * 16 + 14]) < OCEAN_CHUNK_SIZE + 2);
    }
    for (const mesh of rec.overlays) {
      const vertices = mesh.geometry.attributes.position;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        assert.ok(Math.abs(vertices.getX(vertex)) < OCEAN_CHUNK_SIZE + 8);
        assert.ok(Math.abs(vertices.getZ(vertex)) < OCEAN_CHUNK_SIZE + 8);
      }
    }
  }
});

test('unloading disposes terrain and instance resources while retaining shared prototypes', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  ocean.update({ x: 3, z: 5 });
  const oldRecords = [...ocean._chunks.values()];
  const expectedInstances = oldRecords.reduce((sum, rec) => sum + rec.instances.length, 0);
  const expectedOverlays = oldRecords.reduce((sum, rec) => sum + rec.ownedGeometries.length, 0);
  let terrainDisposals = 0, overlayDisposals = 0, instanceDisposals = 0, prototypeDisposals = 0;
  for (const record of oldRecords) {
    record.terrainGeometry.addEventListener('dispose', () => terrainDisposals++);
    for (const geometry of record.ownedGeometries) geometry.addEventListener('dispose', () => overlayDisposals++);
    for (const mesh of record.instances) mesh.addEventListener('dispose', () => instanceDisposals++);
  }
  for (const prototype of Object.values(ocean._geometries)) prototype.addEventListener('dispose', () => prototypeDisposals++);
  ocean.update({ x: 1600, z: 1600 });
  assert.equal(terrainDisposals, oldRecords.length);
  assert.equal(instanceDisposals, expectedInstances);
  assert.equal(overlayDisposals, expectedOverlays);
  assert.ok(instanceDisposals > 0);
  assert.equal(prototypeDisposals, 0);
  assert.ok(oldRecords.every(record => record.group.parent === null && record.group.children.length === 0));
  assert.equal(ocean.stats.activeChunks, 9);
});

test('changing the seed replaces resident scenery while retaining the logical location and render origin', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  const position = { x: 171, z: -305 }, origin = { x: 128, z: -256 };
  ocean.update(position);
  ocean.setRenderOrigin(origin);
  const oldRecords = [...ocean._chunks.values()], before = ocean.generator.sample(200, -300);
  let terrainDisposals = 0;
  for (const rec of oldRecords) rec.terrainGeometry.addEventListener('dispose', () => terrainDisposals++);
  assert.equal(ocean.reset(73), true);
  assert.equal(ocean.stats.seed, 73);
  assert.equal(ocean.generator.seed, 73);
  assert.notDeepEqual(ocean.generator.sample(200, -300), before);
  assert.deepEqual(ocean.renderOrigin, origin);
  assert.deepEqual(ocean.stats.center, { cx: Math.floor(position.x / 64), cz: Math.floor(position.z / 64) });
  assert.equal(ocean.stats.activeChunks, 9);
  assert.equal(terrainDisposals, 9);
  assert.ok([...ocean._chunks.values()].every(rec => !oldRecords.includes(rec)));
});

test('reset and repeated disposal release owned resources exactly once without disposing borrowed material or texture', t => {
  const texture = new THREE.Texture();
  const borrowed = new THREE.MeshStandardMaterial({ color: 0xe1d8bd, map: texture });
  const ocean = new OceanChunks(42, { sandMaterial: borrowed });
  t.after(() => { ocean.dispose(); borrowed.dispose(); texture.dispose(); });
  let borrowedDisposals = 0, textureDisposals = 0, ownTextureDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
  borrowed.addEventListener('dispose', () => borrowedDisposals++);
  texture.addEventListener('dispose', () => textureDisposals++);
  ocean._textures.stone.addEventListener('dispose', () => ownTextureDisposals++);
  for (const geometry of Object.values(ocean._geometries)) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of [ocean._terrainMaterial, ...Object.values(ocean._materials)]) {
    material.addEventListener('dispose', () => materialDisposals++);
  }
  assert.notEqual(ocean._terrainMaterial, borrowed);
  assert.equal(ocean._terrainMaterial.map, texture);
  ocean.update({ x: 3, z: 5 });
  ocean.reset(11);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 0);
  ocean.dispose();
  ocean.dispose();
  assert.equal(ocean.stats.activeChunks, 0);
  assert.equal(ocean.root.children.length, 0);
  assert.equal(geometryDisposals, 6);
  assert.equal(materialDisposals, 6);
  assert.equal(ownTextureDisposals, 1);
  assert.equal(borrowedDisposals, 0);
  assert.equal(textureDisposals, 0);
});

test('all three rock profiles agree with actual rendered triangle ray heights', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  const origin = { x: 192, z: -256 };
  const rocks = OCEAN_ROCK_PROFILES.map((profile, index) => ({ id: `support-${profile}`, kind: 'rock',
    x: 207 + index * 14, y: -9, z: -222, profile,
    rotation: .73, scale: { x: 8, y: 2.5, z: 5 } }));
  const generator = ocean.generator;
  ocean.generator = { ...generator, chunk: () => ({ id: '3,-4', cx: 3, cz: -4, origin, size: 64, elements: rocks }) };
  ocean._load(3, -4);
  ocean.root.updateMatrixWorld(true);
  const record = ocean._chunks.get('3,-4'), ray = new THREE.Raycaster();
  for (const rock of rocks) {
    const mesh = record.instances.find(instance => instance.name === `generated-rock-${rock.profile}`);
    assert.ok(mesh);
    for (let z = -.4; z <= .4; z += .097) for (let x = -.4; x <= .4; x += .093) {
      const surface = oceanRockSurface(rock.profile, x, z);
      if (!surface) continue;
      const wx = rock.x + x * rock.scale.x * Math.cos(rock.rotation) + z * rock.scale.z * Math.sin(rock.rotation);
      const wz = rock.z - x * rock.scale.x * Math.sin(rock.rotation) + z * rock.scale.z * Math.cos(rock.rotation);
      ray.set(new THREE.Vector3(wx, 20, wz), new THREE.Vector3(0, -1, 0));
      const intersection = ray.intersectObject(mesh, false)[0];
      assert.ok(intersection, `${rock.profile} rendered face at ${x},${z}`);
      assert.ok(Math.abs(intersection.point.y - oceanRockHeight(rock, wx, wz)) < 1e-5,
        `${rock.profile} rendered and support height at an interior point`);
    }
  }
});

test('merged algae clips to each actual rock face and follows its world normal offset', t => {
  const ocean = new OceanChunks(42);
  t.after(() => ocean.dispose());
  const generator = ocean.generator, origin = { x: 192, z: -256 };
  const rocks = OCEAN_ROCK_PROFILES.map((profile, index) => ({ id: `support-${profile}`, kind: 'rock',
    x: 207 + index * 14, y: -9, z: -222, profile,
    rotation: .73, scale: { x: 8, y: 2.5, z: 5 } }));
  const algae = rocks.map((rock, index) => ({ id: `cover-${index}`, kind: 'algae',
    x: rock.x, y: rock.y + rock.scale.y, z: rock.z, rotation: 0,
    scale: { x: .7, y: .02, z: .7 }, attachmentId: rock.id,
    surfaceLocal: { x: .22, z: .1 }, patchRadius: .12 }));
  const chunk = { id: '3,-4', cx: 3, cz: -4, origin, size: 64, elements: [...rocks, ...algae] };
  ocean.generator = { ...generator, chunk: () => chunk };
  ocean._load(3, -4);
  const record = ocean._chunks.get(chunk.id);
  assert.equal(record.overlays.length, 1);
  assert.equal(record.ownedGeometries.length, 1);
  const mesh = record.overlays[0], positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal;
  const offset = mesh.userData.surfaceOffsetM;
  assert.ok(positions.count > 90, 'cover is split at underlying triangle edges');
  for (let index = 0; index < positions.count; index++) {
    const wx = positions.getX(index) + origin.x - normals.getX(index) * offset;
    const wy = positions.getY(index) - normals.getY(index) * offset;
    const wz = positions.getZ(index) + origin.z - normals.getZ(index) * offset;
    const rock = rocks.find(candidate => Math.abs(wx - candidate.x) < candidate.scale.x * .6);
    assert.ok(rock);
    const expected = oceanRockHeight(rock, wx, wz);
    assert.notEqual(expected, null);
    assert.ok(Math.abs(wy - expected) < 5e-5, 'every offset vertex lies on an actual shared face');
  }
});
test('new coverage uses finite shared geometry and preserves every resident generator count', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const geometries = Object.values(ocean._geometries), materials = Object.values(ocean._materials);
  let observedGrass = false, observedRubble = false, observedAlgae = false;
  for (const position of [{ x: 128, z: 128 }, { x: 512, z: 0 }, { x: -768, z: 256 }]) {
    ocean.update(position);
    const counts = { rock: 0, coral: 0, seagrass: 0, rubble: 0, algae: 0, formation: 0 };
    for (const [id, record] of ocean._chunks) {
      const [cx, cz] = id.split(',').map(Number), chunk = ocean.generator.chunk(cx, cz);
      for (const element of chunk.elements) counts[element.kind]++;
      for (const mesh of record.instances) {
        assert.ok(geometries.includes(mesh.geometry));
        assert.ok(materials.includes(mesh.material));
      }
      assert.ok(record.ownedGeometries.length <= 1);
      for (const mesh of record.overlays) {
        assert.ok(record.ownedGeometries.includes(mesh.geometry));
        assert.ok(materials.includes(mesh.material));
      }
    }
    assert.deepEqual(ocean.stats.elementCounts, counts);
    assert.equal(ocean.stats.sceneryInstances, Object.values(counts).reduce((sum, count) => sum + count, 0));
    assert.ok(ocean.stats.drawCalls <= 108);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9);
    observedGrass ||= counts.seagrass > 0;
    observedRubble ||= counts.rubble > 0;
    observedAlgae ||= counts.algae > 0;
    assert.deepEqual(Object.values(ocean._geometries), geometries);
    assert.deepEqual(Object.values(ocean._materials), materials);
  }
  assert.ok(observedGrass && observedRubble && observedAlgae, 'streamed regions include grass, rubble and attached cover');
});

test('flow updates shared grass uniforms with a bounded bend and no clock or resource allocation', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  ocean.update({ x: 128, z: 128 });
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
  ocean._materials.seagrass.onBeforeCompile(shader);
  const geometries = Object.values(ocean._geometries), materials = Object.values(ocean._materials), loads = ocean.stats.loads;
  ocean.setEnvironment({ currentMps: .4 }, 12);
  assert.equal(shader.uniforms.oceanGrassTime.value, 12);
  assert.equal(shader.uniforms.oceanGrassBend.value, .5);
  ocean.setEnvironment({ currentMps: 1.2 }, 12);
  assert.equal(shader.uniforms.oceanGrassTime.value, 12, 'paused clock stays at the supplied visual time');
  assert.equal(shader.uniforms.oceanGrassBend.value, 1, 'strong flow cannot exceed the geometry bend bound');
  ocean.setEnvironment({ currentMps: 0 }, 13);
  assert.equal(shader.uniforms.oceanGrassBend.value, 0);
  assert.equal(ocean.stats.loads, loads);
  assert.deepEqual(Object.values(ocean._geometries), geometries);
  assert.deepEqual(Object.values(ocean._materials), materials);
});

