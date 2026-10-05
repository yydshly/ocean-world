import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { OCEAN_OBSERVATION_LAYERS, oceanLayerHeight } from '../src/oceanLayerNavigation.js';

const layerIds = OCEAN_OBSERVATION_LAYERS.map(layer => layer.id);
const allLayers = [...layerIds, 'free'];

test('the three observation entries have immutable identities and human labels', () => {
  assert.deepEqual(OCEAN_OBSERVATION_LAYERS, [
    { id: 'bed', label: '海床' }, { id: 'midwater', label: '中层' }, { id: 'surface', label: '近水面' },
  ]);
  assert.ok(Object.isFrozen(OCEAN_OBSERVATION_LAYERS));
  assert.ok(OCEAN_OBSERVATION_LAYERS.every(Object.isFrozen));
  assert.throws(() => OCEAN_OBSERVATION_LAYERS.push({ id: 'free', label: '自由' }), TypeError);
  assert.throws(() => { OCEAN_OBSERVATION_LAYERS[0].label = 'changed'; }, TypeError);
});

test('a deep open column separates bed, midwater and near-surface views, with a free-depth choice', () => {
  const heights = Object.freeze({ surfaceY: 8, floorY: -20, safeY: -20, freeDepthM: 12 });
  assert.equal(oceanLayerHeight('bed', heights), -17.2);
  assert.equal(oceanLayerHeight('midwater', heights), -6);
  assert.equal(oceanLayerHeight('surface', heights), 6.5);
  assert.equal(oceanLayerHeight('free', heights), -4);
  const resolved = layerIds.map(layer => oceanLayerHeight(layer, heights));
  assert.ok(resolved[0] < resolved[1] && resolved[1] < resolved[2]);
  assert.equal(oceanLayerHeight('free', { ...heights, freeDepthM: -2 }), 7.5,
    'a depth request above water is clamped below the water surface');
  assert.equal(oceanLayerHeight('free', { ...heights, freeDepthM: 100 }), -19.6,
    'a depth request through the floor is clamped to the existing solid guard');
  assert.equal(oceanLayerHeight('free', { surfaceY: 8, floorY: -20, safeY: -20 }), 7.5,
    'the default free depth is bounded by the same water ceiling');
});

test('a protruding solid guard lifts lower views; an impossible shallow column collapses at the ceiling', () => {
  const guarded = { surfaceY: 8, floorY: -20, safeY: 1, freeDepthM: 25 };
  for (const layer of ['bed', 'midwater', 'free']) assert.equal(oceanLayerHeight(layer, guarded), 1.4);
  assert.equal(oceanLayerHeight('surface', guarded), 6.5);
  for (const safeY of [7.3, 7.6, 12]) {
    const shallow = { surfaceY: 8, floorY: 7.4, safeY, freeDepthM: 20 };
    for (const layer of allLayers) assert.equal(oceanLayerHeight(layer, shallow), 7.5);
    assert.deepEqual(shallow, { surfaceY: 8, floorY: 7.4, safeY, freeDepthM: 20 },
      'height resolution does not invent horizontal travel or change the input');
  }
});

test('unknown layers, absent heights and non-finite inputs are rejected without numeric coercion', () => {
  const valid = { surfaceY: 8, floorY: -20, safeY: -20, freeDepthM: 12 };
  for (const layer of ['unknown', '', undefined, null, 0, { id: 'bed' }]) {
    assert.throws(() => oceanLayerHeight(layer, valid), RangeError);
  }
  assert.throws(() => oceanLayerHeight('bed'), TypeError);
  for (const key of ['surfaceY', 'floorY', 'safeY', 'freeDepthM']) {
    for (const value of [NaN, Infinity, -Infinity, '8', null]) {
      assert.throws(() => oceanLayerHeight('bed', { ...valid, [key]: value }), TypeError, `${key}:${value}`);
    }
  }
  for (const key of ['surfaceY', 'floorY', 'safeY']) {
    const missing = { ...valid }; delete missing[key];
    assert.throws(() => oceanLayerHeight('surface', missing), TypeError);
  }
});

test('extreme finite inputs still return finite values within the water ceiling', () => {
  for (const heights of [
    { surfaceY: Number.MAX_VALUE, floorY: Number.MAX_VALUE, safeY: 0, freeDepthM: -Number.MAX_VALUE },
    { surfaceY: -Number.MAX_VALUE, floorY: -Number.MAX_VALUE, safeY: -Number.MAX_VALUE, freeDepthM: Number.MAX_VALUE },
    { surfaceY: Number.MAX_VALUE, floorY: -Number.MAX_VALUE, safeY: -Number.MAX_VALUE, freeDepthM: Number.MAX_VALUE },
  ]) {
    for (const layer of allLayers) {
      const value = oceanLayerHeight(layer, heights);
      assert.ok(Number.isFinite(value));
      assert.ok(value <= heights.surfaceY - .5);
    }
  }
});

test('actual authored, rock and outer-slope supports constrain every layer without changing world fields', () => {
  const world = createOceanGenerator('42');
  const coordinates = [[0, 0], [39, 2], [259, -123], [-201.75, 17.25]];
  const chunks = [[4, -2], [-4, 1], [2, -3]].map(([cx, cz]) => world.chunk(cx, cz));
  const supports = chunks.flatMap(chunk => chunk.elements.filter(element => ['rock', 'formation'].includes(element.kind)));
  assert.ok(supports.some(element => element.kind === 'formation'), 'the test includes actual new outer-slope hard geometry');
  assert.ok(supports.some(element => element.kind === 'rock'), 'the test also includes pre-existing rocky terrain');
  coordinates.push(...supports.map(element => [element.x, element.z]));
  const beforeChunks = structuredClone(chunks);
  const beforeSamples = coordinates.map(([x, z]) => world.sample(x, z));
  for (const [index, [x, z]] of coordinates.entries()) {
    const environment = beforeSamples[index], safeY = world.heightForCamera(x, z);
    const heights = Object.freeze({ surfaceY: OCEAN_SURFACE_Y, floorY: environment.floorY, safeY, freeDepthM: 15 });
    const lower = Math.min(OCEAN_SURFACE_Y - .5, safeY + .4);
    for (const layer of allLayers) {
      const height = oceanLayerHeight(layer, heights);
      assert.ok(Number.isFinite(height) && height >= lower && height <= OCEAN_SURFACE_Y - .5,
        `${layer} respects the existing guard at ${x},${z}`);
    }
  }
  for (const element of supports) {
    const safeY = world.heightForCamera(element.x, element.z);
    assert.ok(safeY >= element.y + element.scale.y, 'the guard includes the actual generated solid footprint');
  }
  assert.deepEqual(chunks, beforeChunks, 'identities, placements, shapes and habitat summaries remain unchanged');
  assert.deepEqual(coordinates.map(([x, z]) => world.sample(x, z)), beforeSamples,
    'layer choices do not alter depth, habitat, substrate or vegetation fields');
});

test('positive, negative and distant logical coordinates resolve identically after floating-origin conversion', () => {
  const direct = createOceanGenerator('42'), restored = createOceanGenerator('42');
  const coordinates = [[273.25, -92.75], [-273.25, 92.75], [1000000.25, -1000000.75], [-1000000.25, 1000000.75]];
  for (const [x, z] of coordinates) {
    const origin = { x: Math.floor(x / 256) * 256, z: Math.floor(z / 256) * 256 };
    const local = { x: x - origin.x, z: z - origin.z };
    const logical = { x: local.x + origin.x, z: local.z + origin.z };
    assert.deepEqual(logical, { x, z });
    const fields = generator => ({ surfaceY: OCEAN_SURFACE_Y, floorY: generator.sample(x, z).floorY,
      safeY: generator.heightForCamera(x, z), freeDepthM: 8 });
    const originalHeights = fields(direct);
    const shiftedHeights = { surfaceY: OCEAN_SURFACE_Y, floorY: restored.sample(logical.x, logical.z).floorY,
      safeY: restored.heightForCamera(logical.x, logical.z), freeDepthM: 8 };
    assert.deepEqual(shiftedHeights, originalHeights);
    for (const layer of allLayers) {
      assert.equal(oceanLayerHeight(layer, shiftedHeights), oceanLayerHeight(layer, originalHeights));
    }
  }
});
