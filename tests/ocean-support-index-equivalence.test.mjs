import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology } from '../src/oceanEcology.js';
import { OCEAN_CHUNK_SIZE } from '../src/oceanGeneration.js';
import { oceanRockHeight, oceanRockMesh } from '../src/oceanRockShape.js';
import { sceneElementHeight, sceneElementMesh } from '../src/oceanSceneElements.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

// Independent pre-index full scan: keep the existing narrow-phase arithmetic
// and source-owner order as the oracle instead of reusing candidate bounds.
function originalSurface(model, x, z, fish = false, includeFormations = true, actualFloor = true,
  includeScene = true, includeHabitat = true, includeMacro = true, includeBiodiversity = true) {
  const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE);
  let height = actualFloor ? model._bed(x, z) : model.generator.sample(x, z).floorY;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const element of model.generator.chunk(cx + dx, cz + dz).elements) {
      if (!['rock', 'formation', 'coral'].includes(element.kind) &&
        !(model.livingNetworkEnabled && ['bottle', 'driftwood'].includes(element.kind))) continue;
      if (element.kind === 'bottle' || element.kind === 'driftwood') {
        const top = sceneElementHeight(element, x, z);
        if (top !== null) height = Math.max(height, top);
        continue;
      }
      if (element.kind === 'coral' && !fish) continue;
      if (element.kind === 'formation' && !includeFormations) continue;
      if (element.kind === 'rock' || element.kind === 'formation') {
        const top = oceanRockHeight(element, x, z);
        if (top !== null) height = Math.max(height, top);
        continue;
      }
      const c = Math.cos(element.rotation), s = Math.sin(element.rotation), wx = x - element.x, wz = z - element.z;
      const radius = ((wx * c - wz * s) * (2 / element.scale.x)) ** 2 +
        ((wx * s + wz * c) * (2 / element.scale.z)) ** 2;
      if (radius <= 1) height = Math.max(height, element.y + element.scale.y);
    }
  }
  return Math.max(height, includeScene ? model.sceneSupportHeight(x, z, fish) : -Infinity,
    includeHabitat ? model.habitatSceneSupportHeight(x, z, fish) : -Infinity,
    includeMacro ? model.macroLandscapeSupportHeight(x, z, fish) : -Infinity,
    includeBiodiversity && fish ? model.biodiversitySupportHeight(x, z) : -Infinity);
}

function queryModel(generator, livingNetworkEnabled = true) {
  return Object.assign(Object.create(OceanEcology.prototype), { generator, livingNetworkEnabled,
    _supportCells: new Map(), sceneSupportHeight: () => -Infinity,
    habitatSceneSupportHeight: () => -Infinity, macroLandscapeSupportHeight: () => -Infinity,
    biodiversitySupportHeight: () => -Infinity });
}

function source(entries, floor = -100, sampleFloor = -120, freezeDescriptors = true) {
  if (freezeDescriptors) for (const [, elements] of entries) for (const element of elements) {
    Object.freeze(element.scale); Object.freeze(element);
  }
  const owners = new Map(entries);
  return { chunk(cx, cz) { return { elements: owners.get(`${cx},${cz}`) ?? [] }; },
    floorSurface() { return { height: floor }; }, sample() { return { floorY: sampleFloor }; } };
}

function world(element, x, z) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  return { x: element.x + x * element.scale.x * c + z * element.scale.z * s,
    z: element.z - x * element.scale.x * s + z * element.scale.z * c };
}

function compare(model, point, options = []) {
  const expected = originalSurface(model, point.x, point.z, ...options);
  const actual = model._surface(point.x, point.z, ...options);
  assert.equal(actual, expected, `support at ${point.x},${point.z}; switches ${options}`);
  return expected;
}

test('real shallow owners retain exact native support at habitat, triangle and owner boundaries', () => {
  const generator = createLivingRidgeGenerator(createLivingShallowsGenerator(livingShallowsSeed('42')));
  const model = queryModel(generator);
  const options = [[], [true], [true, false], [false, true, false], [true, true, true, false, false, false, false]];
  let rocks = 0, coral = 0, queries = 0;
  for (const [cx, cz] of [[176, 7], [188, 17], [-12, -5]]) {
    const points = [];
    for (const offset of [-1e-8, 0, 1e-8, 4, 16, 32, 48, 60, 64 - 1e-8, 64, 64 + 1e-8]) {
      points.push({ x: cx * 64 + offset, z: cz * 64 + 4 },
        { x: cx * 64 + 32, z: cz * 64 + offset });
    }
    const elements = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      elements.push(...generator.chunk(cx + dx, cz + dz).elements);
    for (const element of elements.filter(e => ['rock', 'formation', 'coral'].includes(e.kind)).slice(0, 12)) {
      points.push({ x: element.x, z: element.z });
      if (element.kind === 'coral') { coral++; points.push(world(element, .499999999, 0)); continue; }
      rocks++;
      const p = oceanRockMesh(element.profile || 'mound').positions;
      for (const index of [3, 15, 42, p.length - 9, p.length - 3]) points.push(world(element, p[index], p[index + 2]));
    }
    for (const point of points) for (const switches of options) { compare(model, point, switches); queries++; }
  }
  assert.ok(rocks > 0 && coral > 0 && queries > 600);
  assert.ok(model._supportCells.size <= 25);
});

test('all support switches preserve optional channels and native prop gating', () => {
  const bottle = { id: 'bottle', kind: 'bottle', x: 4, y: -20, z: -4, rotation: .73,
    variant: 0, scale: { x: 3, y: .6, z: .9 } };
  for (const living of [false, true]) {
    const model = queryModel(source([['0,-1', [bottle]]]), living), calls = [];
    model.sceneSupportHeight = (...args) => { calls.push(['scene', ...args]); return -13; };
    model.habitatSceneSupportHeight = (...args) => { calls.push(['habitat', ...args]); return -12; };
    model.macroLandscapeSupportHeight = (...args) => { calls.push(['macro', ...args]); return -11; };
    model.biodiversitySupportHeight = (...args) => { calls.push(['biodiversity', ...args]); return -10; };
    for (let mask = 0; mask < 128; mask++) {
      const switches = Array.from({ length: 7 }, (_, bit) => !!(mask & (1 << bit)));
      calls.length = 0; const expected = originalSurface(model, 4, -4, ...switches);
      const expectedCalls = structuredClone(calls); calls.length = 0;
      assert.equal(model._surface(4, -4, ...switches), expected);
      assert.deepEqual(calls, expectedCalls);
    }
    const floorOnly = [false, false, true, false, false, false, false];
    assert.equal(model._surface(4, -4, ...floorOnly), living ? sceneElementHeight(bottle, 4, -4) : -100);
  }
});

test('rotated native Float32 rim vertices and tiny exterior tolerance survive candidate bins', () => {
  let supported = 0;
  for (const profile of ['mound', 'terrace', 'ridge', 'natural-a', 'natural-b', 'natural-c']) {
    for (const [x, z, rotation] of [[4, -4, .73], [-64, -64, -2.41], [1e9, -1e9, 1.2]]) {
      const rock = { id: profile, kind: 'rock', profile, x, y: -8.4, z, rotation,
        scale: { x: 7.8, y: 2.1, z: 3.6 } };
      const owner = `${Math.floor(x / 64)},${Math.floor(z / 64)}`;
      const model = queryModel(source([[owner, [rock]]]));
      const p = oceanRockMesh(profile).positions;
      for (let index = 0; index < p.length; index += 3) {
        for (const adjustment of [0, -1e-9, 1e-9]) {
          const point = world(rock, p[index] * (1 + adjustment), p[index + 2] * (1 + adjustment));
          if (compare(model, point) > -100) supported++;
        }
      }
      for (const offset of [-1e-9, 0, 1e-9]) {
        compare(model, { x: x + offset, z: z + 4 }); compare(model, { x: x + 4, z: z + offset });
      }
    }
  }
  assert.ok(supported > 5000, 'the oracle actually intersected native hard support');
});

test('coral ellipses and both rigid prop meshes keep exact support across negative bin edges', () => {
  let supported = 0;
  for (const kind of ['coral', 'bottle', 'driftwood']) {
    for (const rotation of [0, .73, Math.PI / 2, -2.41]) {
      const element = { id: kind, kind, x: -4, y: -20, z: -64, rotation, variant: 0,
        scale: { x: 8.4, y: .9, z: 2.8 } };
      const model = queryModel(source([['-1,-1', [element]]]));
      const points = [world(element, 0, 0)];
      if (kind === 'coral') {
        for (let sector = 0; sector < 32; sector++) for (const adjustment of [-1e-9, 0, 1e-9]) {
          const theta = sector * Math.PI / 16;
          points.push(world(element, Math.cos(theta) * (.5 + adjustment), Math.sin(theta) * (.5 + adjustment)));
        }
      } else {
        const p = sceneElementMesh(kind).positions;
        for (let index = 0; index < p.length; index += 3) points.push(world(element, p[index], p[index + 2]));
      }
      for (const point of points) {
        if (compare(model, point, [true]) > -100) supported++;
        compare(model, point, [false]);
      }
    }
  }
  assert.ok(supported > 150);
});

test('a cached query retains exactly its nine source owners and the 25-owner LRU budget', () => {
  const remote = { id: 'remote', kind: 'rock', profile: 'mound', x: 128, y: 20, z: 0,
    rotation: 0, scale: { x: 600, y: 10, z: 600 } };
  const model = queryModel(source([['2,0', [remote]]]));
  assert.equal(compare(model, { x: 32, z: 0 }), -100, 'a distant-owned solid is outside the original source halo');
  assert.ok(compare(model, { x: 64, z: 0 }) > 20, 'the next owner now includes that source');
  for (let owner = -30; owner <= 30; owner++) compare(model, { x: owner * 64 + 32, z: -32 });
  assert.equal(model._supportCells.size, 25);
  const retained = [...model._supportCells.keys()][0];
  const [cx, cz] = retained.split(',').map(Number);
  compare(model, { x: cx * 64 + 32, z: cz * 64 + 32 });
  compare(model, { x: 100 * 64 + 32, z: 32 });
  assert.ok(model._supportCells.has(retained), 'an accessed owner survives the next LRU eviction');
  assert.equal(model._supportCells.size, 25);
});

test('mutable custom rocks remain visible after crossing cached bin boundaries', () => {
  const rock = { id: 'mutable', kind: 'rock', profile: 'mound', x: 4, y: -8, z: 4,
    rotation: .23, scale: { x: 2, y: 1, z: 2 } };
  const model = queryModel(source([['0,0', [rock]]], -100, -120, false));
  assert.equal(compare(model, { x: 4, z: 4 }), -7);
  assert.equal(compare(model, { x: 32, z: 24 }), -100);
  const index = model._supportCells.get('0,0');
  Object.assign(rock, { x: 32, z: 24, rotation: 1.27 });
  Object.assign(rock.scale, { x: 12, y: 3, z: 5 });
  assert.equal(compare(model, { x: 32, z: 24 }), -5);
  assert.equal(compare(model, { x: 4, z: 4 }), -100);
  compare(model, world(rock, .31, -.05));
  assert.strictEqual(model._supportCells.get('0,0'), index, 'the same cached owner handles mutable custom geometry');
});

test('native reset releases old candidate cells before querying the replacement sea source', async () => {
  const seed = livingShallowsSeed('42');
  const first = createLivingShallowsGenerator(seed), second = createLivingShallowsGenerator(livingShallowsSeed('reset-index'));
  const store = { available: true, async load() { return null; }, async save() {}, async saveMany() {}, async clear() {} };
  const model = new OceanEcology(seed, first, { store });
  const points = [{ x: 11296, z: 480 }, { x: -64, z: -4 }, { x: 12064, z: 1120 }];
  for (const point of points) compare(model, point, [true]);
  assert.ok(model._supportCells.size > 0);
  await model.reset(livingShallowsSeed('reset-index'), second);
  assert.equal(model._supportCells.size, 0);
  assert.strictEqual(model.generator, second);
  for (const point of points) compare(model, point, [true]);
  await model.dispose(); assert.equal(model._supportCells.size, 0);
});
