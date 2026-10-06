import test from 'node:test';
import assert from 'node:assert/strict';
import { livingShallowsPresentation } from '../src/livingShallowsPresentation.js';

test('shallow display retains directional relief while water turbidity still removes distant contrast', () => {
  const clear = livingShallowsPresentation({ hour: 12, depthM: 8, turbidity: 0 });
  const murky = livingShallowsPresentation({ hour: 12, depthM: 8, turbidity: 1 });
  assert.ok(clear.sunIntensity > clear.skyIntensity * 4);
  const contrast = (look, metres) => Math.exp(-Math.pow(look.fogDensity * metres, 2));
  assert.ok(contrast(clear, 10) > .9);
  assert.ok(contrast(murky, 30) < .2);
  assert.ok(contrast(clear, 30) > contrast(murky, 30));
  assert.ok(contrast(clear, 100) < contrast(clear, 30));
});

test('day/night and depth change only display output and preserve the entire supplied forcing object', () => {
  const input = Object.freeze({ hour: 12, depthM: 8, turbidity: .25, attenuationPerM: .04,
    foodSupply: .6, clockSec: 341, history: Object.freeze(['original']) });
  const original = structuredClone(input), noon = livingShallowsPresentation(input);
  const night = livingShallowsPresentation({ ...input, hour: 0 });
  const deep = livingShallowsPresentation({ ...input, depthM: 30 });
  assert.deepEqual(input, original);
  assert.ok(night.sunIntensity < noon.sunIntensity * .02);
  assert.ok(night.skyIntensity < noon.skyIntensity * .15);
  assert.ok(deep.sunIntensity < noon.sunIntensity);
  assert.ok(deep.skyIntensity < noon.skyIntensity);
  assert.deepEqual(livingShallowsPresentation({ ...input, hour: 36 }), noon);
});

test('display boundary inputs always produce finite nonnegative settings', () => {
  for (const input of [{}, { hour: NaN, depthM: Infinity, turbidity: -1, attenuationPerM: NaN },
    { hour: -100, depthM: -5, turbidity: 2, attenuationPerM: -1 },
    { hour: 0, depthM: 10000, turbidity: 1, attenuationPerM: 20 }]) {
    const result = livingShallowsPresentation(input);
    for (const key of ['daylight', 'transmission', 'fogDensity', 'sunIntensity', 'skyIntensity'])
      assert.ok(Number.isFinite(result[key]) && result[key] >= 0);
    assert.ok(result.sunColor.every(value => Number.isFinite(value) && value > 0 && value <= 1));
  }
});
