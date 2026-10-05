import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';

const BASE = { currentMps: .15, turbidity: .25, foodSupply: 1, hour: 10 };
const fields = ['currentMps', 'turbidity', 'visibilityM', 'attenuationPerM', 'lightAtDepth', 'waterTint', 'exposure', 'authoredBlend'];

test('the temperate baseline-current option agrees with kelp forcing through seams and at remote coordinates', () => {
  const field = createOceanEnvironment(42, createOceanGenerator(42), { uniformCurrent: true });
  for (const [x, z] of [[0, 0], [64, -123], [259, -59], [-500000, 700000]]) {
    const water = field.sample(x, z, { ...BASE, currentMps: .7 });
    assert.equal(water.currentMps, .7);
    assert.deepEqual(water.currentVector, { x: .7, z: 0 });
  }
});

test('the seeded water field is deterministic at far and negative coordinates regardless of query order', () => {
  const points = [[-64, 31], [64, -25], [-500000.25, 700000.5], [1000000, -1000000], [259, -59]];
  const first = createOceanEnvironment('海流42', createOceanGenerator('海流42'));
  const reordered = createOceanEnvironment('海流42', createOceanGenerator('海流42'));
  const expected = points.map(([x, z]) => first.sample(x, z));
  const reversed = [...points].reverse().map(([x, z]) => reordered.sample(x, z)).reverse();
  assert.deepEqual(reversed, expected);
  const different = createOceanEnvironment('海流43', createOceanGenerator('海流43'));
  assert.notDeepEqual(different.sample(259, -59), first.sample(259, -59));
  for (const sample of expected) {
    assert.ok(fields.every(key => Number.isFinite(sample[key])));
    assert.ok(sample.currentMps >= 0 && sample.currentMps <= 1.2);
    assert.ok(Math.abs(Math.hypot(sample.currentVector.x, sample.currentVector.z) - sample.currentMps) < 1e-14);
    assert.ok(sample.currentMps / BASE.currentMps >= .55 && sample.currentMps / BASE.currentMps <= 1.5);
    assert.ok(sample.turbidity >= 0 && sample.turbidity <= 1);
    assert.ok(sample.waterTint >= 0 && sample.waterTint <= 1);
    assert.ok(sample.exposure >= 0 && sample.exposure <= 1);
  }
});

test('64m loading seams and the 40m/96m transition have continuous water values on both sides', () => {
  const field = createOceanEnvironment(42, createOceanGenerator(42)), epsilon = .0001;
  for (const [x, z] of [[40, 0], [96, 0], [-40, 0], [-96, 0], [64, 37], [-64, 37], [37, 64], [37, -64], [640000, -5000]]) {
    for (const [dx, dz] of [[epsilon, 0], [0, epsilon]]) {
      const before = field.sample(x - dx, z - dz), after = field.sample(x + dx, z + dz);
      for (const key of fields) assert.ok(Math.abs(before[key] - after[key]) < .0001, `${key} at ${x},${z}`);
      assert.ok(Math.abs(before.currentVector.x - after.currentVector.x) < .0001);
      assert.ok(Math.abs(before.currentVector.z - after.currentVector.z) < .0001);
    }
  }
});

test('the authored 40m patch retains its baseline water and original regional light proxy exactly', () => {
  const field = createOceanEnvironment(42, createOceanGenerator(42));
  for (const [x, z] of [[0, 0], [20, -10], [40, 0], [-24, 32]]) {
    const base = { currentMps: .63, turbidity: .72, foodSupply: 2, hour: 11 };
    const sample = field.sample(x, z, base, 19);
    assert.equal(sample.authoredBlend, 0);
    assert.equal(sample.currentMps, base.currentMps);
    assert.deepEqual(sample.currentVector, { x: base.currentMps, z: 0 });
    assert.equal(sample.turbidity, base.turbidity);
    assert.equal(sample.lightAtDepth, Math.sin((base.hour - 6) * Math.PI / 12) * (1 - .8 * base.turbidity));
    assert.equal(sample.foodSupply, 2);
    assert.equal(sample.visibilityM, 3 + (1 - base.turbidity) * 16);
  }
});

test('zero forcing stays zero, turbidity endpoints stay exact, and outside light decreases with actual depth and vanishes at night', () => {
  const field = createOceanEnvironment(42, createOceanGenerator(42));
  for (const [x, z] of [[67, 5], [259, -59], [-400, 200]]) for (const turbidity of [0, 1]) {
    const sample = field.sample(x, z, { currentMps: 0, turbidity, foodSupply: 0, hour: 0 });
    assert.equal(sample.currentMps, 0);
    assert.deepEqual(sample.currentVector, { x: 0, z: 0 });
    assert.equal(sample.turbidity, turbidity);
    assert.equal(sample.foodSupply, 0);
    assert.equal(sample.lightAtDepth, 0);
  }
  const samples = [0, 5, 10, 30].map(depth => field.sample(259, -59, { ...BASE, hour: 12 }, depth));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].lightAtDepth < samples[i - 1].lightAtDepth);
    assert.equal(samples[i].currentMps, samples[0].currentMps);
    assert.equal(samples[i].turbidity, samples[0].turbidity);
  }
  assert.ok(Math.abs(samples[2].lightAtDepth / samples[0].lightAtDepth - Math.exp(-10 * samples[0].attenuationPerM)) < 1e-14);
  for (const hour of [0, 6, 18, 23, 24]) assert.equal(field.sample(259, -59, { ...BASE, hour }).lightAtDepth, 0);
});

test('sampling water leaves generated terrain and element hashes unchanged', () => {
  const generator = createOceanGenerator(42), field = createOceanEnvironment(42, generator);
  const geometryHash = () => createHash('sha256').update(JSON.stringify([generator.chunk(2, 2), generator.chunk(-4, 3)])).digest('hex');
  const before = geometryHash();
  for (let i = -15; i <= 15; i++) field.sample(i * 700, i * -113, { ...BASE, hour: i + 12 });
  assert.equal(geometryHash(), before);
  assert.throws(() => field.sample(Infinity, 0), /finite/);
  assert.throws(() => field.sample(100, 0, { currentMps: NaN }), /finite/);
  assert.throws(() => field.sample(100, 0, BASE, Infinity), /finite/);
  assert.throws(() => createOceanEnvironment(NaN, generator), /seed.*finite/);
});
