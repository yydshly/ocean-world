import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
import { livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { meadowInstanceData, meadowGroundOffset, meadowBend, MEADOW_BEND_LIMIT,
  createMeadowInstanceGeometry, disposeMeadowInstanceGeometry } from '../src/world/livingMeadowEnvironment.js';

const SEED = 'living-shallows-v1|string:42';
function fixture(t) {
  const generator = createLivingShallowsGenerator(SEED), water = createOceanEnvironment(SEED, generator);
  const kit = livingShallowsAssetGeometries();
  t.after(() => { for (const geometry of Object.values(kit)) geometry.dispose(); });
  const patches = [];
  for (let cz = 2; cz <= 4; cz++) for (let cx = 6; cx <= 8; cx++)
    patches.push(...generator.chunk(cx, cz).elements.filter(e => e.kind === 'seagrass' && Math.hypot(e.x - 448, e.z - 240) <= 40));
  return { generator, water, prototype: kit.seagrass, patches };
}
function worldRoot(element, x, z) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation), lx = x * element.scale.x, lz = z * element.scale.z;
  return { x: element.x + lx * c + lz * s, z: element.z - lx * s + lz * c };
}
const snapshotBuffers = ocean => Object.fromEntries([...ocean._chunks].map(([id, record]) => {
  const mesh = record.instances.find(a => a.name === 'generated-seagrass');
  return [id, mesh ? { ground: mesh.geometry.attributes.meadowGround.array.slice(), flow: mesh.geometry.attributes.meadowFlow.array.slice(),
    matrix: mesh.instanceMatrix.array.slice() } : null];
}));

test('all actual meadow shoot roots stay within one centimetre of the real rotated terrain triangles', t => {
  const { generator, water, prototype, patches } = fixture(t);
  const geometry = createMeadowInstanceGeometry(prototype, patches, generator, water);
  t.after(() => disposeMeadowInstanceGeometry(geometry));
  const references = new Map(), roots = prototype.attributes.rootXZ;
  for (let i = 0; i < roots.count; i++) references.set(`${roots.getX(i)},${roots.getY(i)}`, [roots.getX(i), roots.getY(i)]);
  assert.equal(patches.length, 444); assert.equal(prototype.userData.bladeCount, 96);
  let maxError = 0, samples = 0;
  patches.forEach((element, index) => {
    const corners = Array.from(geometry.attributes.meadowGround.array.slice(index * 4, index * 4 + 4));
    for (const [x, z] of references.values()) {
      const root = worldRoot(element, x, z);
      const shownY = element.y + meadowGroundOffset(x, z, corners) * element.scale.y;
      maxError = Math.max(maxError, Math.abs(shownY - generator.floorSurface(root.x, root.z).height)); samples++;
    }
  });
  t.diagnostic(`real patches=${patches.length}; root samples=${samples}; maximum ground error=${maxError} m`);
  assert.ok(maxError <= .01, `actual maximum grounding error ${maxError} m exceeds 1 cm`);
});

test('local yaw restores the actual coordinate current direction and zero current leaves every root still', t => {
  const { generator, water, patches } = fixture(t), time = 123.45;
  for (const element of patches.filter((_, index) => index % 11 === 0)) {
    const { flow } = meadowInstanceData(generator, water, element), actual = water.sample(element.x, element.z, { currentMps: .15 });
    const c = Math.cos(element.rotation), s = Math.sin(element.rotation), bend = meadowBend(flow, .15, time, 1);
    const direction = [flow[0] * c + flow[1] * s, -flow[0] * s + flow[1] * c];
    assert.ok(Math.abs(direction[0] - actual.currentVector.x / actual.currentMps) < 1e-12);
    assert.ok(Math.abs(direction[1] - actual.currentVector.z / actual.currentMps) < 1e-12);
    const pulse = .82 + .18 * Math.sin(time * .75 + flow[3]);
    assert.ok(Math.abs(Math.hypot(...bend) - MEADOW_BEND_LIMIT * actual.currentMps / 1.2 * pulse) < 1e-12);
    assert.deepEqual(meadowBend(flow, 0, time, 1).map(n => Math.abs(n)), [0, 0]);
    assert.deepEqual(meadowBend(flow, .15, time, 0).map(n => Math.abs(n)), [0, 0]);
  }
});

test('strong current and grounded shoot heights remain inside the previous complete crown envelope', t => {
  const { generator, water, prototype, patches } = fixture(t), position = prototype.attributes.position, roots = prototype.attributes.rootXZ;
  let maxRadius = 0, maxHeight = -Infinity;
  for (const element of patches.filter((_, index) => index % 37 === 0)) {
    const { ground, flow } = meadowInstanceData(generator, water, element);
    for (const time of [0, 2, 9, 50, 1000]) for (let i = 0; i < position.count; i++) {
      const tip = position.getY(i), bend = meadowBend(flow, 1.2, time, tip);
      const radius = Math.hypot(position.getX(i) + bend[0], position.getZ(i) + bend[1]);
      const offset = meadowGroundOffset(roots.getX(i), roots.getY(i), ground);
      const height = offset + tip * (1 - Math.max(0, offset));
      maxRadius = Math.max(maxRadius, radius); maxHeight = Math.max(maxHeight, height);
      assert.ok(radius <= .5 + 1e-7); assert.ok(height <= 1.02 + 1e-7);
    }
  }
  t.diagnostic(`maximum strong-flow unit radius=${maxRadius}; maximum grounded unit height=${maxHeight}`);
});

test('rebase and all-owner unload/reload preserve meadow buffers and every generator descriptor', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose());
  ocean.update({ x: 448, z: 240 });
  const before = snapshotBuffers(ocean), descriptors = Object.fromEntries([...ocean._chunks.keys()].map(id => {
    const [cx, cz] = id.split(',').map(Number); return [id, structuredClone(ocean.generator.chunk(cx, cz))];
  }));
  ocean.setRenderOrigin({ x: 384, z: 256 });
  assert.deepEqual(snapshotBuffers(ocean), before);
  ocean.update({ x: 1100, z: 900 });
  assert.ok([...ocean._chunks.keys()].every(id => !Object.hasOwn(before, id)));
  ocean.update({ x: 448, z: 240 });
  assert.deepEqual(snapshotBuffers(ocean), before);
  for (const [id, descriptor] of Object.entries(descriptors)) {
    const [cx, cz] = id.split(',').map(Number); assert.deepEqual(ocean.generator.chunk(cx, cz), descriptor);
  }
});

test('owner disposal releases its own instance buffers without disposing borrowed prototype or another owner', t => {
  const { generator, water, prototype, patches } = fixture(t);
  const first = createMeadowInstanceGeometry(prototype, patches.slice(0, 2), generator, water);
  const second = createMeadowInstanceGeometry(prototype, patches.slice(2, 4), generator, water);
  let prototypeDisposals = 0, ownerDisposals = 0;
  prototype.addEventListener('dispose', () => prototypeDisposals++); first.addEventListener('dispose', () => ownerDisposals++);
  const position = prototype.attributes.position, index = prototype.index, otherGround = second.attributes.meadowGround.array.slice();
  assert.equal(first.attributes.position, position); assert.equal(second.attributes.position, position);
  assert.notEqual(first.attributes.meadowGround, second.attributes.meadowGround);
  disposeMeadowInstanceGeometry(first);
  assert.equal(ownerDisposals, 1); assert.equal(prototypeDisposals, 0);
  assert.equal(first.index, null); assert.equal(first.attributes.position, undefined);
  assert.equal(prototype.attributes.position, position); assert.equal(prototype.index, index);
  assert.equal(second.attributes.position, position); assert.equal(second.index, index);
  assert.deepEqual(second.attributes.meadowGround.array, otherGround);
  disposeMeadowInstanceGeometry(second); assert.equal(prototypeDisposals, 0);
});

test('the nine-owner window uses one meadow batch per owner, shared materials, live clock and the unchanged legacy shader', t => {
  const ocean = new OceanChunks(SEED), legacy = new OceanChunks('42');
  t.after(() => { ocean.dispose(); legacy.dispose(); });
  ocean.update({ x: 448, z: 240 }); ocean.setEnvironment({ currentMps: .42 }, 123.45);
  const stats = ocean.stats, meshes = [...ocean._chunks.values()].flatMap(record => record.instances.filter(mesh => mesh.name === 'generated-seagrass'));
  assert.equal(stats.activeChunks, 9); assert.equal(stats.maxOwnedMeadowGeometries, 9);
  assert.equal(stats.ownedMeadowGeometries, meshes.length); assert.ok(stats.ownedMeadowGeometries <= 9);
  assert.equal(stats.prototypeMaterials, 7); assert.equal(stats.prototypeGeometries, 10);
  assert.equal(stats.maxDrawCalls, 117); assert.ok(stats.drawCalls <= stats.maxDrawCalls);
  assert.equal(stats.meadowEnvironment.clockSec, 123.45); assert.equal(stats.meadowEnvironment.baseCurrentMps, .42);
  for (const mesh of meshes) {
    assert.equal(mesh.material, ocean._materials.seagrass);
    assert.equal(mesh.geometry.attributes.position, ocean._geometries.seagrass.attributes.position);
    assert.equal(mesh.geometry.attributes.meadowGround.count, mesh.count);
    assert.equal(mesh.geometry.attributes.meadowFlow.count, mesh.count);
  }
  for (const record of ocean._chunks.values()) assert.ok(record.instances.filter(mesh => mesh.name === 'generated-seagrass').length <= 1);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
  legacy._materials.seagrass.onBeforeCompile(shader);
  assert.equal(legacy._materials.seagrass.customProgramCacheKey(), 'generated-seagrass-sway-v1');
  assert.ok(!shader.vertexShader.includes('meadowGround') && !shader.vertexShader.includes('meadowFlow'));
});
