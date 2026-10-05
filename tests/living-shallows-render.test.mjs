import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { sceneElementMesh, sceneElementHeight } from '../src/oceanSceneElements.js';
import { LIVING_SHALLOWS_CORAL_FORMS, livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';

const SEED = 'living-shallows-v1|42';
const ROW = 65;

test('whole-scene asset kit has three distinct attached colony forms in metre-scaled envelopes', () => {
  const geometries = livingShallowsAssetGeometries();
  try {
    assert.deepEqual(Object.keys(geometries).sort(), ['bottle', 'coral-branching', 'coral-fan', 'coral-table', 'driftwood', 'rubble', 'seagrass']);
    const triangles = [];
    for (const form of LIVING_SHALLOWS_CORAL_FORMS) {
      const geometry = geometries[`coral-${form}`], positions = geometry.attributes.position;
      assert.equal(geometry.userData.morphotype, form);
      assert.equal(geometry.boundingBox.min.y, 0);
      assert.equal(geometry.boundingBox.max.y, 1);
      assert.equal(geometry.attributes.color.count, positions.count);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        assert.ok(Number.isFinite(positions.getX(vertex) + positions.getY(vertex) + positions.getZ(vertex)));
        assert.ok(Math.hypot(positions.getX(vertex), positions.getZ(vertex)) <= .500001);
      }
      assert.ok(geometry.index.count / 3 < 2500, 'bounded colony geometry, shared by every instance');
      triangles.push(geometry.index.count);
    }
    assert.equal(new Set(triangles).size, 3, 'forms use different complete geometry, not just colours');
    assert.ok(geometries['coral-fan'].boundingBox.max.z - geometries['coral-fan'].boundingBox.min.z < .12);
    assert.ok(geometries.seagrass.boundingBox.max.y <= 1);
    assert.ok(geometries.seagrass.boundingBox.min.y >= 0);
  } finally { for (const geometry of Object.values(geometries)) geometry.dispose(); }
});

test('new plan renders every colony in its morphotype batch and retains actual metre transforms', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  ocean.update({ x: 2, z: 2 });
  assert.equal(ocean.stats.sceneProfile, 'living-shallows-v1');
  assert.equal(ocean.stats.prototypeGeometries, 10);
  assert.equal(ocean.stats.prototypeMaterials, 7);
  let colonies = 0;
  for (const [id, record] of ocean._chunks) {
    const [cx, cz] = id.split(',').map(Number), chunk = ocean.generator.chunk(cx, cz);
    for (const form of LIVING_SHALLOWS_CORAL_FORMS) {
      const rows = chunk.elements.filter(e => e.kind === 'coral' && e.morphotype === form);
      const mesh = record.instances.find(mesh => mesh.name === `generated-coral-${form}`);
      if (!rows.length) { assert.equal(mesh, undefined); continue; }
      assert.equal(mesh.count, rows.length); assert.equal(mesh.geometry, ocean._geometries[`coral-${form}`]);
      assert.equal(mesh.material, ocean._materials.coral); assert.equal(mesh.userData.morphotype, form);
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index], matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        assert.ok(Math.abs(matrix.elements[12] + chunk.origin.x - row.x) < 1e-5);
        assert.ok(Math.abs(matrix.elements[13] - row.y) < 1e-5);
        assert.ok(Math.abs(matrix.elements[14] + chunk.origin.z - row.z) < 1e-5);
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
        matrix.decompose(position, rotation, scale);
        for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(scale[axis] - row.scale[axis]) < 1e-5);
      }
      colonies += rows.length;
    }
    assert.equal(record.elementCounts.coral, chunk.elements.filter(e => e.kind === 'coral').length);
    const footing = record.group.children.find(mesh => mesh.name === 'generated-buried-rock-sides');
    if (footing) assert.equal(footing.geometry.attributes.color.count, footing.geometry.attributes.position.count);
    assert.ok(record.footings.every(footing => footing.rim.length === 32));
  }
  assert.ok(colonies > 20, 'the ordinary active scene contains complete colonies');
});

test('new natural rocks render the exact shared triangular support surface', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  ocean.update({ x: 2, z: 2 }); ocean.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), profiles = new Set();
  let samples = 0;
  for (const [id, record] of ocean._chunks) {
    const [cx, cz] = id.split(',').map(Number), chunk = ocean.generator.chunk(cx, cz);
    for (const rock of chunk.elements.filter(e => e.kind === 'rock')) {
      if (profiles.has(rock.profile)) continue;
      const mesh = record.instances.find(mesh => mesh.name === `generated-rock-${rock.profile}`);
      for (const [x, z] of [[0, 0], [.08, -.11], [-.13, .07], [.20, .10]]) {
        const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
        const wx = rock.x + x * rock.scale.x * c + z * rock.scale.z * s;
        const wz = rock.z - x * rock.scale.x * s + z * rock.scale.z * c;
        const expected = oceanRockHeight(rock, wx, wz);
        ray.set(new THREE.Vector3(wx, 5, wz), new THREE.Vector3(0, -1, 0));
        const intersection = ray.intersectObject(mesh, false)[0];
        assert.ok(intersection); assert.ok(Math.abs(intersection.point.y - expected) < 2e-5); samples++;
      }
      profiles.add(rock.profile);
    }
  }
  assert.deepEqual([...profiles].sort(), ['natural-a', 'natural-b', 'natural-c']);
  assert.equal(samples, 12);
});

test('continuous new sea bed keeps matching geometry, normal, colour and UV vertices across both chunk seams', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  ocean.update({ x: 2, z: 2 });
  for (const axis of ['x', 'z']) for (const owner of [-1, 0]) {
    const a = ocean._chunks.get(axis === 'x' ? `${owner},0` : `0,${owner}`);
    const b = ocean._chunks.get(axis === 'x' ? `${owner + 1},0` : `0,${owner + 1}`);
    for (let offset = 0; offset < ROW; offset++) {
      const ia = axis === 'x' ? offset * ROW + ROW - 1 : (ROW - 1) * ROW + offset;
      const ib = axis === 'x' ? offset * ROW : offset;
      for (const attribute of ['position', 'normal', 'color', 'uv']) {
        const aa = a.terrainGeometry.attributes[attribute], ba = b.terrainGeometry.attributes[attribute];
        for (let component = 0; component < aa.itemSize; component++) {
          let av = aa.array[ia * aa.itemSize + component], bv = ba.array[ib * ba.itemSize + component];
          if (attribute === 'position' && component === 0) { av += a.origin.x; bv += b.origin.x; }
          if (attribute === 'position' && component === 2) { av += a.origin.z; bv += b.origin.z; }
          assert.equal(av, bv, `${attribute} seam ${axis}`);
        }
      }
    }
  }
});

test('whole-scene streaming remains bounded and rebase changes no resident geometry or instances', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  for (const position of [{ x: 2, z: 2 }, { x: 320, z: 3 }, { x: -200, z: -200 }, { x: 1e7, z: -1e7 }]) {
    ocean.update(position);
    assert.equal(ocean.stats.activeChunks, 9); assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9); assert.ok(ocean.generator.cacheStats().size <= 32);
  }
  const records = [...ocean._chunks.values()], matrices = records.map(record => record.instances.map(mesh => mesh.instanceMatrix.array.slice()));
  const loadCount = ocean.stats.loads;
  ocean.setRenderOrigin({ x: 1e7, z: -1e7 });
  assert.equal(ocean.stats.loads, loadCount);
  records.forEach((record, index) => record.instances.forEach((mesh, batch) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index][batch])));
  assert.ok(records.every(record => Math.abs(record.group.position.x) <= 128 && Math.abs(record.group.position.z) <= 128));
});

test('switching the independent scene version owns and disposes only the replaced kit', t => {
  const ocean = new OceanChunks('42'); t.after(() => ocean.dispose());
  ocean.update({ x: 2, z: 2 });
  const oldGeometries = Object.values(ocean._geometries), oldMaterials = Object.values(ocean._materials);
  let geometriesDisposed = 0, materialsDisposed = 0;
  for (const geometry of oldGeometries) geometry.addEventListener('dispose', () => geometriesDisposed++);
  for (const material of oldMaterials) material.addEventListener('dispose', () => materialsDisposed++);
  ocean.reset(SEED);
  assert.equal(geometriesDisposed, 6); assert.equal(materialsDisposed, 5);
  assert.equal(ocean.stats.prototypeGeometries, 10);
  const kit = Object.values(ocean._geometries); let newDisposed = 0;
  for (const geometry of kit) geometry.addEventListener('dispose', () => newDisposed++);
  ocean.reset('living-shallows-v1|73'); assert.equal(newDisposed, 0, 'same profile retains the complete shared kit');
  ocean.reset('42'); assert.equal(newDisposed, 10);
  assert.equal(ocean.stats.prototypeGeometries, 6); assert.equal(ocean.stats.prototypeMaterials, 5);
  assert.equal(ocean.stats.sceneProfile, undefined);
});

test('sparse discovery props use exact shared rigid triangles, metre scales and flooded static bottle state in the existing chunk group', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  const seen = new Set(), kinds = new Set(), ray = new THREE.Raycaster();
  for (const position of [{ x: 2, z: 2 }, { x: 130, z: 2 }, { x: 322, z: 194 }]) {
    ocean.update(position); ocean.root.updateMatrixWorld(true);
    assert.ok(ocean.stats.drawCalls <= 117);
    for (const [id, record] of ocean._chunks) {
      const [cx, cz] = id.split(',').map(Number), rows = ocean.generator.chunk(cx, cz).elements;
      for (const kind of ['driftwood', 'bottle']) {
        const props = rows.filter(row => row.kind === kind), mesh = record.instances.find(mesh => mesh.name === `generated-${kind}`);
        if (!props.length) { assert.equal(mesh, undefined); continue; }
        assert.equal(mesh.parent, record.group); assert.equal(mesh.count, props.length);
        assert.equal(mesh.geometry, ocean._geometries[kind]); assert.equal(mesh.material, ocean._materials[kind]);
        assert.deepEqual(mesh.geometry.attributes.position.array, new Float32Array(sceneElementMesh(kind, 0).positions));
        assert.deepEqual(Array.from(mesh.geometry.index.array), sceneElementMesh(kind, 0).indices);
        for (const prop of props) {
          if (seen.has(prop.id)) continue; seen.add(prop.id); kinds.add(kind);
          assert.ok(prop.scale.x >= (kind === 'bottle' ? .25 : 1));
          assert.ok(prop.scale.x <= (kind === 'bottle' ? .35 : 2));
          if (kind === 'bottle') {
            assert.equal(prop.physicalState, 'grounded-flooded'); assert.equal(prop.flooded, true); assert.equal(prop.sealed, false);
            assert.equal(mesh.userData.physicalState, 'grounded-flooded');
          }
          let leastClearance = Infinity;
          const positions = sceneElementMesh(kind, 0).positions, c = Math.cos(prop.rotation), s = Math.sin(prop.rotation);
          for (let vertex = 0; vertex < positions.length; vertex += 3) {
            const lx = positions[vertex] * prop.scale.x, lz = positions[vertex + 2] * prop.scale.z;
            const wx = prop.x + lx * c + lz * s, wz = prop.z - lx * s + lz * c;
            const y = prop.y + positions[vertex + 1] * prop.scale.y;
            const clearance = y - ocean.generator.floorSurface(wx, wz).height;
            assert.ok(clearance >= -1e-6, 'complete rigid prop stays above actual sea-bed triangles');
            leastClearance = Math.min(leastClearance, clearance);
          }
          assert.ok(leastClearance <= .005, 'at least one rigid base vertex actually touches the sea bed');
          ray.set(new THREE.Vector3(prop.x, 5, prop.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit);
          assert.ok(Math.abs(hit.point.y - sceneElementHeight(prop, prop.x, prop.z)) < 2e-5);
        }
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['bottle', 'driftwood']);
});
