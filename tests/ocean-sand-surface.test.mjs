import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { OCEAN_SAND_SURFACE_PERIOD_M, applyOceanSandSurface, oceanSandSurfaceCoordinates,
  createOceanSandHardCoverIndex, oceanSandHardCover, oceanSandSurfaceMask } from '../src/world/oceanSandSurface.js';

const phase = value => ((value % OCEAN_SAND_SURFACE_PERIOD_M) + OCEAN_SAND_SURFACE_PERIOD_M) % OCEAN_SAND_SURFACE_PERIOD_M;
const shader = () => ({ vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} });
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const start = source.indexOf('  caustics(material) {'), end = source.indexOf('  bindAuthoredSurface()', start);
assert.ok(start >= 0 && end > start);
const NativeCaustics = new Function(`return class { ${source.slice(start, end)} }`)();

test('wrapped logical sediment coordinates agree across positive, negative and distant chunk seams', () => {
  for (const cx of [-15628, -9, -8, -1, 0, 7, 8, 15628]) {
    const a = oceanSandSurfaceCoordinates(new Float32Array([64, -7.75, 19.625]), `${cx},-15627`);
    const b = oceanSandSurfaceCoordinates(new Float32Array([0, -7.75, 19.625]), `${cx + 1},-15627`);
    assert.equal(phase(a[0]), phase(b[0])); assert.equal(a[1], b[1]);
    assert.equal(phase(a[0]), phase((cx + 1) * 64));
    assert.equal(a[1], phase(-15627 * 64) + 19.625);
    // Whole-world rebase is absent from this coordinate function by design.
    assert.deepEqual(oceanSandSurfaceCoordinates(new Float32Array([64, -7.75, 19.625]), `${cx},-15627`), a);
  }
});

test('sediment permission excludes hard bottom and deep water; roots and rubble use actual bounded envelopes', () => {
  const sand = { substrate: 'sand', depthM: 12, rockiness: .04 };
  assert.deepEqual(oceanSandSurfaceMask(sand, 0, 0, 0), [1, 0, 0]);
  assert.deepEqual(oceanSandSurfaceMask(sand, 1, .8, .3), [0, .8, .3]);
  assert.deepEqual(oceanSandSurfaceMask({ ...sand, substrate: 'rock' }, 0, 0, 0), [0, 0, 0]);
  assert.deepEqual(oceanSandSurfaceMask({ ...sand, depthM: 3500 }, 0, 0, 0), [0, 0, 0]);
  const mixed = oceanSandSurfaceMask({ ...sand, substrate: 'mixed', rockiness: .41 }, 0, 9, -2);
  assert.ok(mixed[0] > 0 && mixed[0] < 1); assert.equal(mixed[1], 1); assert.equal(mixed[2], 0);
});

test('hard masks use real rotated instances with neighbour-owner support at a chunk boundary', () => {
  const rock = { id: 'actual-rock', kind: 'rock', x: 63, z: 10, rotation: Math.PI / 4,
    scale: { x: 8, y: 3, z: 3 } };
  const frozen = JSON.stringify(rock);
  const generator = { chunk: (cx, cz) => ({ elements: cx === 0 && cz === 0 ? [rock] : [] }) };
  const west = createOceanSandHardCoverIndex(generator, { cx: 0, cz: 0 });
  const east = createOceanSandHardCoverIndex(generator, { cx: 1, cz: 0 });
  assert.equal(oceanSandHardCover(west, rock.x, rock.z), 1);
  for (const z of [6, 8, 10, 12, 14]) assert.equal(oceanSandHardCover(west, 64, z), oceanSandHardCover(east, 64, z));
  assert.equal(oceanSandHardCover(west, 40, 40), 0);
  const along = { x: rock.x + Math.cos(rock.rotation) * 3, z: rock.z - Math.sin(rock.rotation) * 3 };
  assert.equal(oceanSandHardCover(west, along.x, along.z), 1, 'rotated long axis remains masked');
  assert.equal(JSON.stringify(rock), frozen, 'source rock unchanged');
});

test('new display hooks chain the actual shipped caustics and fit the installed Three standard shader chunks', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0xe1d8bd, roughness: .99 });
  let calls = 0, rendererSeen;
  material.onBeforeCompile = function (_shader, renderer) { calls++; rendererSeen = renderer; };
  material.customProgramCacheKey = () => 'borrowed-sand-key';
  const world = new NativeCaustics(); Object.assign(world, { isDeep: false, isKelp: false, biomeId: 'reef', causticUniforms: [] });
  world.caustics(material);
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const restore = applyOceanSandSurface(material), current = shader(), renderer = { sentinel: true };
  material.onBeforeCompile(current, renderer);
  assert.equal(calls, 1); assert.equal(rendererSeen, renderer);
  assert.equal(current.uniforms.uReefTime, world.causticUniforms[0]);
  assert.ok(current.fragmentShader.includes('gl_FragColor.rgb*=1.0+c*.14;'));
  assert.ok(current.vertexShader.includes('vReefWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'));
  for (const [token, variable] of [['color_fragment', 'diffuseColor'], ['roughnessmap_fragment', 'roughnessFactor'],
    ['normal_fragment_maps', 'normal']]) {
    assert.ok(THREE.ShaderLib.standard.fragmentShader.includes(`#include <${token}>`));
    assert.ok(THREE.ShaderChunk[token].includes(variable));
    assert.ok(current.fragmentShader.includes(`#include <${token}>`));
  }
  assert.ok(THREE.ShaderChunk.normal_fragment_begin.includes('float faceDirection'));
  assert.ok(THREE.ShaderLib.standard.fragmentShader.includes('varying vec3 vViewPosition'));
  assert.ok(current.fragmentShader.includes('vec3 sandNormal = oceanSandNormal(-vViewPosition, normal, sandHeight, faceDirection)'));
  assert.ok(current.fragmentShader.includes('sandWaveVisible = 1.0 - smoothstep'));
  assert.ok(current.fragmentShader.indexOf('float sandHeight') < current.fragmentShader.indexOf('vec3 sandNormal'));
  assert.ok(current.vertexShader.includes('#include <project_vertex>'));
  assert.ok(current.fragmentShader.includes('#include <lights_fragment_begin>'));
  assert.equal(material.customProgramCacheKey(), 'reef-caustic-v2/borrowed-sand-key/ocean-sand-surface-v1');
  assert.equal(material.userData.sandSurface.extraTextures, 0); assert.equal(material.userData.sandSurface.physicalRelief, false);
  restore(); assert.equal(material.onBeforeCompile, previousCompile); assert.equal(material.customProgramCacheKey, previousKey);
  assert.equal(material.userData.sandSurface, undefined); material.dispose();
  // This is a native hook/chunk check, not GPU shader compilation or appearance acceptance.
});

test('native enabled terrain preserves original triangles, heights, normals, colours, UVs and all source descriptors', t => {
  const seed = livingShallowsSeed('44'), original = new OceanChunks(seed), enabled = new OceanChunks(seed, { sandHabitat: true });
  t.after(() => { original.dispose(); enabled.dispose(); });
  const position = { x: 416, z: 224 };
  original.update(position); enabled.update(position);
  assert.equal(original._terrainMaterial.userData.sandSurface, undefined);
  assert.equal(enabled._terrainMaterial.userData.sandSurface.version, 1);
  let exposed = 0, hard = 0, roots = 0;
  for (const [owner, record] of enabled._chunks) {
    const previous = original._chunks.get(owner), geometry = record.terrainGeometry;
    for (const name of ['position', 'normal', 'color', 'uv']) assert.deepEqual(geometry.attributes[name].array, previous.terrainGeometry.attributes[name].array, `${owner} ${name} unchanged`);
    assert.deepEqual(geometry.index.array, previous.terrainGeometry.index.array);
    assert.deepEqual(enabled.generator.chunk(...owner.split(',').map(Number)), original.generator.chunk(...owner.split(',').map(Number)));
    assert.deepEqual(geometry.attributes.oceanSandPosition.array, oceanSandSurfaceCoordinates(geometry.attributes.position.array, owner));
    assert.equal(original._chunks.get(owner).terrainGeometry.attributes.oceanSandMask, undefined);
    for (let i = 0; i < geometry.attributes.oceanSandMask.count; i++) {
      const permission = geometry.attributes.oceanSandMask.getX(i), root = geometry.attributes.oceanSandMask.getY(i);
      assert.ok(permission >= 0 && permission <= 1); assert.ok(root >= 0 && root <= 1);
      if (permission > .5) exposed++; if (permission === 0) hard++; if (root > .5) roots++;
    }
    assert.deepEqual(record.elementCounts, previous.elementCounts);
    assert.equal(record.instances.length, previous.instances.length);
    for (let i = 0; i < record.instances.length; i++) {
      assert.deepEqual(record.instances[i].instanceMatrix.array, previous.instances[i].instanceMatrix.array);
      assert.equal(record.instances[i].material.userData.sandSurface, undefined);
    }
  }
  assert.ok(exposed > 100 && hard > 100 && roots > 100, `sample has clear sand (${exposed}), excluded hard substrate (${hard}) and actual grass roots (${roots})`);
  assert.equal(enabled.stats.activeChunks, 9); assert.equal(enabled.stats.drawCalls, original.stats.drawCalls);
  assert.equal(enabled.stats.sceneryTriangles, original.stats.sceneryTriangles);
  const west = enabled._chunks.get('6,3').terrainGeometry, east = enabled._chunks.get('7,3').terrainGeometry;
  for (let row = 0; row < 65; row++) {
    for (const name of ['oceanSandPosition', 'oceanSandMask']) {
      const a = west.attributes[name], b = east.attributes[name];
      for (let c = 0; c < a.itemSize; c++) assert.equal(a.array[(row * 65 + 64) * a.itemSize + c], b.array[row * 65 * b.itemSize + c], `${name} edge`);
    }
  }
  const frozen = [...enabled._chunks.values()].map(record => ({ record,
    positions: record.terrainGeometry.attributes.position.array.slice(),
    coordinates: record.terrainGeometry.attributes.oceanSandPosition.array.slice(),
    masks: record.terrainGeometry.attributes.oceanSandMask.array.slice() }));
  enabled.setRenderOrigin({ x: 1e6, z: -1e6 });
  for (const row of frozen) {
    assert.deepEqual(row.record.terrainGeometry.attributes.position.array, row.positions);
    assert.deepEqual(row.record.terrainGeometry.attributes.oceanSandPosition.array, row.coordinates);
    assert.deepEqual(row.record.terrainGeometry.attributes.oceanSandMask.array, row.masks);
  }
});

test('opt-in display layer stays out of ordinary worlds and restores borrowed hooks on profile reset', t => {
  const borrowed = new THREE.MeshStandardMaterial(), priorCompile = borrowed.onBeforeCompile;
  borrowed.customProgramCacheKey = () => 'unchanged-borrowed';
  const requested = new OceanChunks(42, { sandMaterial: borrowed, sandHabitat: true });
  t.after(() => { requested.dispose(); borrowed.dispose(); });
  requested.update({ x: 3, z: 5 });
  assert.equal(requested._terrainMaterial.onBeforeCompile, priorCompile);
  assert.equal(requested._terrainMaterial.userData.sandSurface, undefined);
  for (const row of requested._chunks.values()) assert.equal(row.terrainGeometry.attributes.oceanSandPosition, undefined);
  requested.reset(livingShallowsSeed('44'));
  assert.equal(requested._terrainMaterial.customProgramCacheKey(), 'unchanged-borrowed/ocean-sand-surface-v1');
  assert.equal(borrowed.onBeforeCompile, priorCompile); assert.equal(borrowed.userData.sandSurface, undefined);
  requested.reset(42);
  assert.equal(requested._terrainMaterial.onBeforeCompile, priorCompile);
  assert.equal(requested._terrainMaterial.customProgramCacheKey(), 'unchanged-borrowed');
  assert.equal(requested._terrainMaterial.userData.sandSurface, undefined);
});
