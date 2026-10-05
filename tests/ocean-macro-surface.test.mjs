import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { macroSurfaceCoordinates, createOceanMacroSurfaceMaterial, MACRO_SURFACE_PERIOD_M } from '../src/world/oceanMacroSurfaceMaterial.js';
import { OceanMacroLandscape } from '../src/world/OceanMacroLandscape.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

const phase = value => ((value % MACRO_SURFACE_PERIOD_M) + MACRO_SURFACE_PERIOD_M) % MACRO_SURFACE_PERIOD_M;
test('adjacent owners have the same metre-space phase at shared boundaries, including negative and distant coordinates', () => {
  for (const cx of [-15628, -9, -8, -1, 0, 7, 8, 15628]) {
    const left = macroSurfaceCoordinates(new Float32Array([64, -11.375, 19.625]), `${cx},-15627`);
    const right = macroSurfaceCoordinates(new Float32Array([0, -11.375, 19.625]), `${cx + 1},-15627`);
    assert.equal(phase(left[0]), phase(right[0]));
    assert.equal(left[1], right[1]); assert.equal(left[2], right[2]);
    assert.equal(phase(left[0]), phase((cx + 1) * 64));
    assert.equal(left[2], phase(-15627 * 64) + 19.625);
  }
});

test('display coordinates survive an actual floating-origin rebase without changing saved geometry or allocating materials', () => {
  const generator = createOceanGenerator('42'), layer = new OceanMacroLandscape(), owner = '15628,-15627';
  const x = 15628 * 64, z = -15627 * 64;
  const mass = { id: 'surface:fixed', regionId: owner, kind: 'reef-mass', x: x + 14, y: -7, z: z + 14,
    rotation: 0, scale: { x: 20, y: 8, z: 20 }, grid: { topology: 'continuous-v1',
      origin: { x: x + 8, z: z + 8 }, step: 1.25, columns: 16, rows: 16,
      cells: [{ i: 1, j: 1, riseM: 1 }, { i: 2, j: 1, riseM: 1.4 }, { i: 1, j: 2, riseM: 1.2 }, { i: 2, j: 2, riseM: 1.5 }] } };
  layer.update([mass], generator, { x, z });
  const mesh = layer._masses.get(owner).mesh, attribute = mesh.geometry.attributes.macroSurfacePosition;
  const phaseBefore = attribute.array.slice(), positions = mesh.geometry.attributes.position.array.slice();
  const material = mesh.material, stats = layer.stats;
  layer.setRenderOrigin({ x: x + 192, z: z - 256 });
  assert.equal(mesh.geometry.attributes.macroSurfacePosition, attribute);
  assert.deepEqual(attribute.array, phaseBefore); assert.deepEqual(mesh.geometry.attributes.position.array, positions);
  assert.equal(mesh.material, material); assert.equal(layer.stats.drawCalls, stats.drawCalls);
  assert.equal(layer.stats.materials, 5); assert.equal(layer.stats.textures, 0);

  // Exercise the real current Three standard-shader hooks. Browser compilation
  // remains a separate GPU check; this guards missing hooks after library edits.
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vMacroSurfacePosition = macroSurfacePosition;'));
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= reefSurface'));
  assert.ok(shader.fragmentShader.includes('#include <fog_fragment>'));
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'));
  assert.ok(shader.vertexShader.includes('#include <project_vertex>'));
  assert.deepEqual(shader.uniforms, {});
  assert.equal(material.emissive.getHex(), 0); assert.equal(material.map, null);
  layer.dispose();
  const fresh = createOceanMacroSurfaceMaterial(); assert.equal(fresh.customProgramCacheKey(), material.customProgramCacheKey()); fresh.dispose();
});

test('actual generated rock and formation batches carry logical metre coordinates without shared-uniform or prototype allocation', () => {
  const ocean = new OceanChunks('42');
  ocean.update({ x: 248, z: 110 }); ocean.root.updateMatrixWorld(true);
  const prototypes = Object.values(ocean._geometries), material = ocean._materials.rock;
  assert.equal(material.map, ocean._textures.stone);
  assert.equal(material.vertexColors, false);
  const before = [], point = new THREE.Vector3(), worldPoint = new THREE.Vector3(), instance = new THREE.Matrix4();
  let rocks = 0, staticSides = 0;
  for (const [owner, record] of ocean._chunks) {
    for (const mesh of record.instances.filter(row => ['rock', 'formation'].includes(row.userData.landscapeKind))) {
      assert.ok(prototypes.includes(mesh.geometry)); assert.equal(mesh.material, material);
      assert.equal(mesh.onBeforeRender, THREE.Object3D.prototype.onBeforeRender);
      const localPosition = mesh.geometry.attributes.position;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, instance);
        const stored = new THREE.Color(); mesh.getColorAt(i, stored);
        assert.ok(stored.b >= .9 && stored.b <= 1.1);
        for (const vertex of [0, Math.floor(localPosition.count / 2), localPosition.count - 1]) {
          point.fromBufferAttribute(localPosition, vertex).applyMatrix4(instance);
          worldPoint.copy(point).applyMatrix4(mesh.matrixWorld);
          const shaderPoint = point.clone().add(new THREE.Vector3(stored.r, 0, stored.g));
          assert.ok(Math.abs(phase(shaderPoint.x) - phase(worldPoint.x)) < 1e-5, `${owner} instance logical X`);
          assert.ok(Math.abs(phase(shaderPoint.z) - phase(worldPoint.z)) < 1e-5, `${owner} instance logical Z`);
          assert.equal(shaderPoint.y, worldPoint.y);
        }
        rocks++;
      }
      before.push({ mesh, positions: mesh.geometry.attributes.position.array.slice(), indices: mesh.geometry.index.array.slice(),
        instances: mesh.instanceMatrix.array.slice(), phase: mesh.instanceColor.array.slice() });
    }
    if (record.footingGeometry) {
      const positions = record.footingGeometry.attributes.position.array;
      const coordinates = record.footingGeometry.attributes.macroSurfacePosition.array;
      assert.deepEqual(coordinates, macroSurfaceCoordinates(positions, owner)); staticSides++;
    }
  }
  assert.ok(rocks > 0 && staticSides > 0);
  const draws = ocean.stats.drawCalls;
  ocean.setRenderOrigin({ x: 1000192, z: -1000128 });
  for (const row of before) {
    assert.deepEqual(row.mesh.geometry.attributes.position.array, row.positions);
    assert.deepEqual(row.mesh.geometry.index.array, row.indices);
    assert.deepEqual(row.mesh.instanceMatrix.array, row.instances);
    assert.deepEqual(row.mesh.instanceColor.array, row.phase);
  }
  assert.deepEqual(Object.values(ocean._geometries), prototypes); assert.equal(ocean.stats.prototypeGeometries, 6);
  assert.equal(ocean.stats.prototypeMaterials, 5); assert.equal(ocean.stats.drawCalls, draws);
  ocean.dispose();
});
