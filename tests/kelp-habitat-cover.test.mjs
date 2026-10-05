import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanHabitatCover } from '../src/world/kelpOceanHabitatCover.js';
import { applyKelpOceanHabitatMaterial } from '../src/world/kelpOceanHabitatMaterial.js';

const baseline = JSON.parse(readFileSync(new URL('../output/validation/kelp-habitat-cover-before.json', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rawBefore = readFileSync(new URL('../output/validation/whole-habitat-KelpOceanChunks-before.js', import.meta.url), 'utf8');
assert.equal(digest(Buffer.from(rawBefore)), baseline.oldRenderer.sha256, 'immutable original renderer source');
// Resolve the captured renderer's original dependencies against its original
// source location; no current implementation is substituted for this class.
const originalURL = new URL('../src/world/KelpOceanChunks.js', import.meta.url);
const oldModuleSource = rawBefore.replace(/from (['"])([^'"]+)\1/g, (_all, _quote, dependency) =>
  `from ${JSON.stringify(dependency === 'three' ? import.meta.resolve('three') : new URL(dependency, originalURL).href)}`);
const { KelpOceanChunks: OriginalKelpOceanChunks } = await import(`data:text/javascript;base64,${Buffer.from(oldModuleSource).toString('base64')}`);
const ROW = 33;
const weights = ['forest', 'hardBottom', 'opening', 'authoredBlend'];
const clone = value => structuredClone(value);
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} versus ${b}`);
function compareGeometry(current, original, label) {
  for (const name of ['position', 'normal', 'uv']) {
    if (original.attributes[name]) assert.deepEqual(bytes(current.attributes[name].array), bytes(original.attributes[name].array), `${label} ${name}`);
  }
  assert.deepEqual(bytes(current.index.array), bytes(original.index.array), `${label} index`);
}
function simpleGenerator({ roots = true, host = true } = {}) {
  const calls = [], rock = { id: 'real-rock', kind: 'rock', x: 145, y: -7, z: 5,
    scale: { x: 4, y: 1, z: 3 }, rotation: .6, profile: 'mound' };
  const root = { id: 'real-kelp', kind: 'kelp', x: 145.1, y: -6.1, z: 5.1,
    hostId: rock.id, lengthM: 15, anchor: { id: 'real-kelp', x: 145.1, y: -6.1, z: 5.1, hostId: rock.id, lengthM: 15 } };
  const generator = { sample: () => ({ forestCover: 1, rockiness: 1, floorY: -7, habitat: 'kelp-forest' }),
    chunk(cx, cz) { calls.push([cx, cz]); return { id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
      elements: cx === 2 && cz === 0 ? [...host ? [rock] : [], ...roots ? [root] : []] : [] }; } };
  const chunk = generator.chunk(2, 0); calls.length = 0;
  return { generator, calls, rock, root, chunk };
}

test('historical support-v1 cover queries preserve the frozen three-seed scenery and every recorded physical terrain query', () => {
  assert.equal(baseline.priorSourceCount, 85);
  // This historical colour-only milestone exercises the retained v1 geometry.
  // The evolving v2 generator/ecology have independent full migration tests;
  // their current source cannot be required to equal a past milestone.
  const frozenGenerator = readFileSync(new URL('../output/validation/kelp-macro-landscape-generation-before.js', import.meta.url));
  assert.equal(digest(frozenGenerator), baseline.sourceHashes.find(entry => entry.file === 'src/kelpOceanGeneration.js').sha256);
  for (const entry of baseline.sourceHashes.filter(entry => ['src/kelpSimulation.js','src/kelpHabitat.js','src/oceanRockShape.js','src/world/oceanRockFooting.js'].includes(entry.file))) {
    assert.equal(digest(readFileSync(new URL(`../${entry.file}`, import.meta.url))), entry.sha256, `${entry.file} remains exact`);
  }
  for (const expected of baseline.cases) {
    const generator = createKelpOceanGenerator(expected.seed, { supportVersion: 1 });
    for (const chunk of expected.chunks) {
      const cover = createKelpOceanHabitatCover(generator, generator.chunk(chunk.cx, chunk.cz));
      for (const [dx, dz] of [[0, 0], [16, 48], [64, 64]]) cover.sample(chunk.origin.x + dx, chunk.origin.z + dz);
    }
    for (const before of expected.samples) {
      const { x, z } = before;
      assert.deepEqual({ x, z, sample: generator.sample(x, z), floorVertex: generator.floorVertex(x, z),
        floorSurface: generator.floorSurface(x, z), supportAt: generator.supportAt(x, z),
        heightAt: generator.heightAt(x, z), heightForCamera: generator.heightForCamera(x, z) }, before);
    }
    assert.deepEqual(expected.chunks.map(chunk => generator.chunk(chunk.cx, chunk.cz)), expected.chunks);
  }
});

test('the current renderer retains historical v1 terrain, bases, prototypes and scenery matrices for three seeds', t => {
  for (const seed of baseline.cases.map(item => item.seed)) {
    const current = new KelpOceanChunks(seed), original = new OriginalKelpOceanChunks(seed);
    current.generator = createKelpOceanGenerator(seed, { supportVersion: 1 });
    original.generator = createKelpOceanGenerator(seed, { supportVersion: 1 });
    t.after(() => { current.dispose(); original.dispose(); });
    current.update({ x: 67, z: -59 }); original.update({ x: 67, z: -59 });
    assert.deepEqual([...current._chunks.keys()], [...original._chunks.keys()]);
    for (const [id, before] of original._chunks) {
      const after = current._chunks.get(id);
      compareGeometry(after.terrainGeometry, before.terrainGeometry, `${seed}/${id} bed`);
      if (before.rockBaseGeometry) compareGeometry(after.rockBaseGeometry, before.rockBaseGeometry, `${seed}/${id} buried base`);
      assert.equal(after.instances.length, before.instances.length);
      for (let i = 0; i < before.instances.length; i++) {
        assert.equal(after.instances[i].name, before.instances[i].name);
        assert.deepEqual(bytes(after.instances[i].instanceMatrix.array), bytes(before.instances[i].instanceMatrix.array));
        assert.deepEqual(bytes(after.instances[i].instanceColor.array), bytes(before.instances[i].instanceColor.array));
        assert.deepEqual(after.instances[i].userData.elementIds, before.instances[i].userData.elementIds);
      }
    }
    for (const [name, geometry] of Object.entries(original._geometries)) {
      compareGeometry(current._geometries[name], geometry, `${seed} prototype ${name}`);
      if (geometry.attributes.color) assert.deepEqual(bytes(current._geometries[name].attributes.color.array), bytes(geometry.attributes.color.array));
    }
    assert.equal(current.stats.elementCounts.formation, 0);
    assert.deepEqual({ rock: current.stats.elementCounts.rock, kelp: current.stats.elementCounts.kelp }, original.stats.elementCounts);
    for (const key of ['prototypeGeometries', 'prototypeMaterials', 'sceneryTriangles', 'terrainTriangles', 'drawCalls', 'maxDrawCalls', 'ownedRockBaseGeometries']) {
      assert.deepEqual(current.stats[key], original.stats[key], key);
    }
  }
});

test('high potential forest stays open without actual roots, and missing host rocks cannot create a forest patch', () => {
  for (const options of [{ roots: false, host: false }, { roots: false, host: true }, { roots: true, host: false }]) {
    const fixture = simpleGenerator(options), cover = createKelpOceanHabitatCover(fixture.generator, fixture.chunk);
    for (const [x, z] of [[145.1, 5.1], [145, 5], [151, 5], [180, 40]]) {
      const value = cover.sample(x, z);
      assert.equal(value.forest, 0, 'potential forest fields and orphan roots do not invent occupancy');
      for (const key of weights) assert.ok(Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1);
    }
  }
  const fixture = simpleGenerator(), occupied = createKelpOceanHabitatCover(fixture.generator, fixture.chunk);
  assert.ok(occupied.sample(145.1, 5.1).forest > 0);
  assert.ok(occupied.sample(145.1, 5.1).forest > occupied.sample(149, 5.1).forest);
  assert.equal(occupied.sample(160, 5.1).forest, 0, 'finite root influence cannot tint the whole map cell');
});

test('the forest index reads the complete 3 by 3 neighborhood once and samples only local bins afterward', () => {
  const fixture = simpleGenerator(), cover = createKelpOceanHabitatCover(fixture.generator, fixture.chunk);
  assert.ok(fixture.calls.length >= 8 && fixture.calls.length <= 9);
  assert.equal(new Set(fixture.calls.map(value => value.join(','))).size, fixture.calls.length);
  for (const [cx, cz] of fixture.calls) assert.ok(Math.abs(cx - 2) <= 1 && Math.abs(cz) <= 1);
  const before = clone(fixture.calls);
  for (const [x, z] of [[145.1, 5.1], [128, 0], [192, 64], [160, 5]]) cover.sample(x, z);
  assert.deepEqual(fixture.calls, before, 'no chunk generation or neighborhood scan per floor vertex query');
  assert.ok(Object.isFrozen(cover) && Object.isFrozen(cover.stats));
  assert.equal(cover.stats.sourceChunkCount, 9); assert.equal(cover.stats.queryBinCount, 9);
  assert.equal(cover.stats.binSizeM, 8); assert.ok(cover.stats.actualMaximumRadiusM <= 8);
  assert.equal(cover.stats.validRootCount, 1); assert.equal(cover.stats.rootGroupCount, 1);
});

test('actual host rotation constrains the hard cue and an unrelated root cannot borrow a valid rock identity', () => {
  const fixture = simpleGenerator({ roots: false }), cover = createKelpOceanHabitatCover(fixture.generator, fixture.chunk);
  const localPoint = (lx, lz) => ({ x: fixture.rock.x + lx * Math.cos(fixture.rock.rotation) + lz * Math.sin(fixture.rock.rotation),
    z: fixture.rock.z - lx * Math.sin(fixture.rock.rotation) + lz * Math.cos(fixture.rock.rotation) });
  const inside = localPoint(1.8, 0), fringe = localPoint(1.9, 1.4), outside = localPoint(2.85, 2.35);
  close(cover.sample(inside.x, inside.z).hardBottom, 1, 'actual rotated host interior');
  assert.ok(cover.sample(fringe.x, fringe.z).hardBottom < 1, 'bounding rectangle is not the solid host core');
  assert.equal(cover.sample(outside.x, outside.z).hardBottom, 0);
  const unrelated = simpleGenerator(); unrelated.root.x += 20;
  const invalidCover = createKelpOceanHabitatCover(unrelated.generator, unrelated.chunk);
  assert.equal(invalidCover.stats.validRootCount, 0);
  assert.equal(invalidCover.sample(unrelated.root.x, unrelated.root.z).forest, 0);
  assert.equal(invalidCover.sample(unrelated.rock.x, unrelated.rock.z).forest, 0);
});

test('authored roots retain the original bed colour and habitat weights join continuously at the 40 to 96 metre transition', t => {
  const chunks = new KelpOceanChunks('42'); t.after(() => chunks.dispose());
  const cover = createKelpOceanHabitatCover(chunks.generator, chunks.generator.chunk(0, 0));
  for (const [x, z] of [[0, 0], [20, 20], [40, 0], [-40, 0]]) {
    assert.deepEqual(cover.sample(x, z), { forest: 0, hardBottom: 0, opening: 0, authoredBlend: 0 });
  }
  for (const radius of [40, 96]) {
    const low = cover.sample(radius - .001, 0), high = cover.sample(radius + .001, 0);
    for (const key of weights) assert.ok(Math.abs(low[key] - high[key]) < .003, `${key} transition at ${radius}`);
  }
  const geometry = chunks._terrainGeometry(chunks.generator.chunk(0, 0)); t.after(() => geometry.dispose());
  const position = geometry.attributes.position, color = geometry.attributes.color, mask = geometry.attributes.kelpHabitatCover;
  assert.ok(mask && mask.itemSize === 3);
  let checked = 0;
  for (let i = 0; i < position.count; i++) {
    if (Math.hypot(position.getX(i), position.getZ(i)) > 40) continue;
    for (const axis of ['X', 'Y', 'Z']) { assert.equal(color[`get${axis}`](i), 1); assert.equal(mask[`get${axis}`](i), 0); }
    checked++;
  }
  assert.ok(checked > 250);
});

test('actual RGB and habitat attributes are identical across both positive and negative X and Z seams', t => {
  const chunks = new KelpOceanChunks('habitat-seams'); t.after(() => chunks.dispose());
  for (const [cx, cz, axis] of [[1, -1, 'x'], [1, -1, 'z'], [-5, 4, 'x'], [-5, 4, 'z'], [-1, -1, 'x'], [-1, -1, 'z']]) {
    const a = chunks._terrainGeometry(chunks.generator.chunk(cx, cz));
    const b = chunks._terrainGeometry(chunks.generator.chunk(cx + (axis === 'x' ? 1 : 0), cz + (axis === 'z' ? 1 : 0)));
    try {
      for (let row = 0; row < ROW; row++) {
        const ia = axis === 'x' ? row * ROW + ROW - 1 : (ROW - 1) * ROW + row;
        const ib = axis === 'x' ? row * ROW : row;
        for (const name of ['color', 'kelpHabitatCover']) for (const component of ['X', 'Y', 'Z']) {
          assert.equal(a.attributes[name][`get${component}`](ia), b.attributes[name][`get${component}`](ib), `${cx},${cz}/${axis}/${name}/${row}`);
        }
      }
    } finally { a.dispose(); b.dispose(); }
  }
});

test('cover and actual terrain appearance survive opposite loading order, cache eviction, clearing and floating origins', t => {
  const ordered = new KelpOceanChunks('42'), reordered = new KelpOceanChunks('42');
  t.after(() => { ordered.dispose(); reordered.dispose(); });
  const cell = ordered.generator.chunk(1, -1), before = ordered._terrainGeometry(cell); t.after(() => before.dispose());
  for (const [cx, cz] of [[2, 0], [-5, 4], [10, 5], [4, -1]].reverse()) reordered.generator.chunk(cx, cz);
  for (let i = 0; i < 35; i++) reordered.generator.chunk(100 + i, -100 - i);
  assert.ok(reordered.generator.cacheStats().chunks <= 32);
  const after = reordered._terrainGeometry(reordered.generator.chunk(1, -1)); t.after(() => after.dispose());
  for (const name of ['color', 'kelpHabitatCover']) assert.deepEqual(bytes(after.attributes[name].array), bytes(before.attributes[name].array));
  reordered.generator.clearCache();
  const revisited = reordered._terrainGeometry(reordered.generator.chunk(1, -1)); t.after(() => revisited.dispose());
  for (const name of ['color', 'kelpHabitatCover']) assert.deepEqual(bytes(revisited.attributes[name].array), bytes(before.attributes[name].array));
  ordered.update({ x: 118, z: -5 });
  const resident = ordered._chunks.get('1,-1').terrainGeometry;
  const attributes = Object.fromEntries(['color', 'kelpHabitatCover'].map(name => [name, bytes(resident.attributes[name].array).slice()]));
  ordered.setRenderOrigin({ x: 1000192, z: -1000128 });
  for (const name of ['color', 'kelpHabitatCover']) assert.deepEqual(bytes(resident.attributes[name].array), attributes[name]);
});

test('real detailed-host substitution never removes the occupied floor cue or changes resident cover buffers', t => {
  const chunks = new KelpOceanChunks('42'); t.after(() => chunks.dispose()); chunks.update({ x: 118, z: -5 });
  const region = chunks._chunks.get('1,-1'), host = chunks.generator.chunk(1, -1).elements.find(element => element.kind === 'kelp');
  assert.ok(host);
  const cover = createKelpOceanHabitatCover(chunks.generator, chunks.generator.chunk(1, -1)), before = cover.sample(host.x, host.z);
  assert.ok(before.forest > 0);
  const color = bytes(region.terrainGeometry.attributes.color.array).slice(), mask = bytes(region.terrainGeometry.attributes.kelpHabitatCover.array).slice();
  assert.equal(chunks.setDetailedHosts([host.id]), true);
  assert.deepEqual(cover.sample(host.x, host.z), before);
  assert.deepEqual(bytes(region.terrainGeometry.attributes.color.array), color);
  assert.deepEqual(bytes(region.terrainGeometry.attributes.kelpHabitatCover.array), mask);
  assert.equal(chunks.setDetailedHosts([]), true); assert.deepEqual(cover.sample(host.x, host.z), before);
});

test('historical v1 load-time colours and weights, environment updates, eviction and disposal remain bounded', t => {
  const chunks = new KelpOceanChunks('42'); t.after(() => chunks.dispose());
  chunks.generator = createKelpOceanGenerator('42', { supportVersion: 1 });
  for (const [x, z] of [[118, -5], [-323, 259], [1000259, -1000123]]) {
    chunks.update({ x, z });
    assert.equal(chunks.stats.activeChunks, 9); assert.ok(chunks.stats.drawCalls <= 54);
    assert.equal(chunks.stats.prototypeGeometries, 4); assert.equal(chunks.stats.prototypeMaterials, 3);
    assert.equal(chunks.stats.ownedOverlayGeometries, 0); assert.equal(chunks.stats.terrainTriangles, 9 * 32 * 32 * 2);
    const cache = chunks.generator.cacheStats();
    assert.ok(cache.chunks <= 32 && cache.vertices <= 16384 && cache.neighborhoods <= 32);
  }
  const resident = [...chunks._chunks.values()], buffers = resident.map(record => ({ geometry: record.terrainGeometry,
    color: record.terrainGeometry.attributes.color.array, mask: record.terrainGeometry.attributes.kelpHabitatCover.array }));
  const loads = chunks.stats.loads;
  for (let i = 0; i < 12; i++) { chunks.setEnvironment({ currentMps: .55 }, 31.4); chunks.update({ x: 1000260, z: -1000124 }); }
  assert.equal(chunks.stats.loads, loads);
  for (let i = 0; i < resident.length; i++) {
    assert.equal(resident[i].terrainGeometry, buffers[i].geometry);
    assert.equal(resident[i].terrainGeometry.attributes.color.array, buffers[i].color);
    assert.equal(resident[i].terrainGeometry.attributes.kelpHabitatCover.array, buffers[i].mask);
  }
  let disposed = 0;
  for (const record of resident) record.terrainGeometry.addEventListener('dispose', () => disposed++);
  chunks.dispose(); chunks.dispose(); assert.equal(disposed, 9); assert.equal(chunks.stats.activeChunks, 0);
  assert.deepEqual(chunks.generator.cacheStats(), { chunks: 0, maxChunks: 32, vertices: 0, maxVertices: 16384, neighborhoods: 0, maxNeighborhoods: 32 });
});

test('habitat material chains borrowed caustics with the same time and flow uniforms without adding textures', () => {
  const time = { value: 31.4 }, flow = { value: .42 }, material = new THREE.MeshStandardMaterial({ roughness: .99 });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  let previousCalls = 0;
  material.onBeforeCompile = function (compiled) {
    assert.equal(this, material); previousCalls++;
    compiled.uniforms.existingCausticTime = time; compiled.uniforms.existingCausticFlow = flow;
    compiled.fragmentShader = compiled.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n// existing-caustic-colour');
  };
  material.customProgramCacheKey = function () { assert.equal(this, material); return 'existing-caustics-v1'; };
  const base = { color: material.color.toArray(), roughness: material.roughness,
    textureKeys: Object.keys(material).filter(key => material[key]?.isTexture), geometryKeys: Object.keys(material).filter(key => material[key]?.isBufferGeometry) };
  applyKelpOceanHabitatMaterial(material); material.onBeforeCompile(shader);
  assert.equal(previousCalls, 1); assert.equal(shader.uniforms.existingCausticTime, time); assert.equal(shader.uniforms.existingCausticFlow, flow);
  assert.ok(shader.fragmentShader.includes('// existing-caustic-colour'));
  assert.ok(shader.vertexShader.includes('kelpHabitatCover') && shader.fragmentShader.includes('vKelpHabitatCover'));
  assert.ok(shader.vertexShader.includes('uv'), 'terrain world UVs supply a rebase-independent spatial pattern');
  assert.ok(shader.fragmentShader.includes('#include <roughnessmap_fragment>'));
  assert.ok(material.customProgramCacheKey().startsWith('existing-caustics-v1'));
  assert.deepEqual({ color: material.color.toArray(), roughness: material.roughness,
    textureKeys: Object.keys(material).filter(key => material[key]?.isTexture), geometryKeys: Object.keys(material).filter(key => material[key]?.isBufferGeometry) }, base);
  material.dispose();
});

test('actual material construction retains borrowed texture ownership and exact original shaders before habitat extension', t => {
  const texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1), time = { value: 7.1 };
  const borrowed = new THREE.MeshStandardMaterial({ map: texture }), calls = [];
  borrowed.onBeforeCompile = function (shader) { calls.push(this); shader.uniforms.sharedExistingTime = time; };
  borrowed.customProgramCacheKey = () => 'borrowed-water-light';
  let textureDisposals = 0, borrowedDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++); borrowed.addEventListener('dispose', () => borrowedDisposals++);
  const chunks = new KelpOceanChunks('42', { sandMaterial: borrowed }); t.after(() => { chunks.dispose(); borrowed.dispose(); texture.dispose(); });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  chunks._terrainMaterial.onBeforeCompile(shader);
  assert.deepEqual(calls, [chunks._terrainMaterial]); assert.equal(shader.uniforms.sharedExistingTime, time);
  assert.equal(chunks._terrainMaterial.map, texture); assert.ok(chunks._terrainMaterial.customProgramCacheKey().startsWith('borrowed-water-light'));
  chunks.dispose(); assert.equal(textureDisposals, 0); assert.equal(borrowedDisposals, 0);
});

test('real paused ecological records including deaths, independent clocks, drift stock and all ledgers remain exact through cover rendering', async t => {
  const records = new Map(), storage = { available: true,
    async load(world, id) { return clone(records.get(`${world}|${id}`) ?? null); },
    async saveMany(world, entries) { for (const [id, record] of entries) records.set(`${world}|${id}`, clone(record)); } };
  const chunks = new KelpOceanChunks('42'), ecology = new KelpOceanEcology('42', chunks.generator, { store: storage });
  t.after(() => chunks.dispose()); assert.equal(await ecology.update({ x: 131, z: 5 }), true); ecology.step(.4);
  const owner = ecology._active.get('2,0'), dead = owner.sim.agents.find(agent => agent.speciesId === 'purple-urchin');
  dead.alive = false; dead.state = 'dead'; dead.energy = 0;
  await ecology.checkpoint();
  const before = [...ecology._active].map(([id, region]) => [id, ecology._record(region)]), disk = clone([...records]);
  chunks.update({ x: 131, z: 5 }); chunks.setEnvironment({ currentMps: .42 }, 35);
  chunks.setDetailedHosts([...owner.sim.hostById.values()].map(host => host.sceneryId));
  chunks.setRenderOrigin({ x: 128, z: 0 }); ecology.step(0, { foodSupply: 0, hour: 0 });
  assert.deepEqual([...ecology._active].map(([id, region]) => [id, ecology._record(region)]), before);
  assert.deepEqual([...records], disk);
  const reopened = new KelpOceanEcology('42', chunks.generator, { store: storage });
  assert.equal(await reopened.update({ x: 131, z: 5 }), true);
  assert.deepEqual([...reopened._active].map(([id, region]) => [id, reopened._record(region)]), before);
});
