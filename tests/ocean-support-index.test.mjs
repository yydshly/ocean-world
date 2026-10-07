import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanSupportIndex, oceanSupportCandidates } from '../src/oceanSupportIndex.js';

const feature = (id, x, z, size = 1) => ({ element: Object.freeze({ id, kind: 'rock', x, y: -4, z,
  rotation: 0, scale: Object.freeze({ x: size, y: 1, z: size }) }) });

test('four-metre owner bins discard distant native supports and retain source order', () => {
  const features = [];
  for (let z = -32; z < 96; z += 8) for (let x = -32; x < 96; x += 8) features.push(feature(`${x},${z}`, x + 2, z + 2));
  const overlap = feature('overlap', 2, 2);
  features.push(overlap);
  const index = createOceanSupportIndex(features, 0, 0);
  assert.equal(index.bins.length, 256);
  const candidates = oceanSupportCandidates(index, 2, 2);
  assert.deepEqual(candidates.map(entry => entry.element.id), ['0,0', 'overlap']);
  assert.ok(candidates.length < features.length / 100);
  assert.equal(oceanSupportCandidates(index, 3, 3), candidates);
  assert.deepEqual(oceanSupportCandidates(index, 5, 5), []);
  assert.equal(oceanSupportCandidates(index, 64, 2), features);
});

test('a giant native support never creates more than the finite owner bin budget', () => {
  const native = feature('giant', -32, -32, 1e8), index = createOceanSupportIndex([native], -1, -1);
  assert.equal(index.bins.length, 256);
  assert.equal(index.bins.filter(Boolean).length, 256);
  assert.deepEqual(oceanSupportCandidates(index, -64, -64), [native]);
  assert.deepEqual(oceanSupportCandidates(index, -Number.EPSILON, -Number.EPSILON), [native]);
});

test('mutable and malformed descriptors stay candidates so validation and updates remain observable', () => {
  const moving = { element: { id: 'moving', kind: 'rock', x: 300, y: 0, z: 300, rotation: 0, scale: { x: 1, y: 1, z: 1 } } };
  const invalid = { element: Object.freeze({ kind: 'rock', x: 900, z: 900, rotation: 0,
    scale: Object.freeze({ x: -1, y: 1, z: 1 }) }) };
  const near = feature('near', 2, 2), index = createOceanSupportIndex([moving, near, invalid], 0, 0);
  assert.deepEqual(oceanSupportCandidates(index, 2, 2), [moving, near, invalid]);
  moving.element.x = 2; moving.element.z = 2; moving.element.scale.x = 12;
  assert.deepEqual(oceanSupportCandidates(index, 62, 62), [moving, invalid]);
});

test('nonfinite queries and unrepresentable owners fall back to the original feature list', () => {
  const features = [feature('near', 2, 2)], index = createOceanSupportIndex(features, 0, 0);
  assert.equal(oceanSupportCandidates(index, NaN, 2), features);
  assert.equal(oceanSupportCandidates(index, 2, Infinity), features);
  const enormous = createOceanSupportIndex(features, Number.MAX_VALUE, 0);
  assert.equal(enormous.bins, null);
  assert.equal(oceanSupportCandidates(enormous, 2, 2), features);
});
