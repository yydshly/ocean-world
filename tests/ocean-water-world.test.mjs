import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
import { OceanWaterParticles } from '../src/world/OceanWaterParticles.js';

// Evaluate the actual World methods without browser-only capture imports or a
// WebGL constructor. This verifies CPU integration, not GPU visual fidelity.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const start = source.indexOf('  updateOceanWater(dt){'), end = source.indexOf('  setEnvironment(', start);
const worldPosition = source.match(/  oceanWorldPosition\(\)\{[^\n]*\}/)?.[0];
assert.ok(start >= 0 && end > start && worldPosition);
const WaterWorldFixture = new Function('THREE', 'clamp', `return class {${worldPosition}\n${source.slice(start, end)}}`)(THREE, THREE.MathUtils.clamp);

function fixture(worldX, worldZ, y, origin = { x: 0, z: 0 }, hour = 10) {
  const generator = createOceanGenerator('42'), scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(worldX - origin.x, y, worldZ - origin.z);
  scene.background = new THREE.Color('#236b87'); scene.fog = new THREE.FogExp2(scene.background, .06475);
  return Object.assign(Object.create(WaterWorldFixture.prototype), {
    scene, surfaceY: 8, camera,
    oceanRenderOrigin: origin, paused: false, visualTimeSec: 4,
    sim: { environment: { currentMps: .15, turbidity: .25, foodSupply: 1, hour } },
    oceanChunks: { generator, setEnvironment(value, time) { this.lastEnvironment = value; this.lastTime = time; } },
    oceanWaterField: createOceanEnvironment('42', generator),
    oceanWaterParticles: new OceanWaterParticles(scene, { seed: '42' }),
    sun: { intensity: 3 }, ambient: { intensity: 1 },
    waterNightColor: new THREE.Color().setRGB(.009, .031, .049),
    waterColors: { horizon: { value: new THREE.Color('#236b87') }, bottom: { value: new THREE.Color('#236b87') }, top: { value: new THREE.Color('#64bac9') } },
    oceanWaterPalette: { clear: new THREE.Color('#195e7a'), green: new THREE.Color('#466e61'), topClear: new THREE.Color('#64afc2'), topGreen: new THREE.Color('#9bb4a3'), night: new THREE.Color('#071e2b'), day: new THREE.Color(), tone: new THREE.Color(), top: new THREE.Color() },
    particleUniforms: { opacity: { value: .185 } }, visualEnvironment: {},
  });
}

test('floating origin changes rendering only; local water uses world coordinates and observer depth', () => {
  const plain = fixture(259, -59, -10), shifted = fixture(259, -59, -10, { x: 256, z: -64 });
  const baseline = structuredClone(shifted.sim.environment);
  plain.updateOceanWater(.1); shifted.updateOceanWater(.1);
  assert.deepEqual(shifted.oceanLocalWater, plain.oceanLocalWater);
  assert.notDeepEqual(shifted.oceanLocalWater, shifted.oceanWaterField.sample(3, 5, baseline, 18));
  assert.deepEqual(shifted.sim.environment, baseline);
  assert.deepEqual(shifted.oceanWaterParticles.root.position.toArray(), [3, -10, 5]);
  assert.equal(shifted.oceanChunks.lastEnvironment, shifted.oceanLocalWater);
  plain.oceanWaterParticles.dispose(); shifted.oceanWaterParticles.dispose();
});

test('authored reef lighting and water remain intact and its new particle volume is invisible', () => {
  const reef = fixture(3, 5, 2.8), background = reef.scene.background.clone(), top = reef.waterColors.top.value.clone();
  reef.updateOceanWater(.1);
  assert.equal(reef.oceanLocalWater.authoredBlend, 0);
  assert.ok(reef.scene.background.equals(background)); assert.ok(reef.waterColors.top.value.equals(top));
  assert.equal(reef.sun.intensity, 3); assert.equal(reef.ambient.intensity, 1);
  assert.equal(reef.particleUniforms.opacity.value, .185); assert.equal(reef.oceanWaterParticles.root.visible, false);
  reef.oceanWaterParticles.dispose();
});

test('deeper observer receives dimmer regional light while nearby water remains readable', () => {
  const shallow = fixture(259, -59, 5), deep = fixture(259, -59, -10);
  shallow.updateOceanWater(.1); deep.updateOceanWater(.1);
  assert.ok(deep.sun.intensity < shallow.sun.intensity);
  assert.ok(deep.ambient.intensity < shallow.ambient.intensity);
  assert.ok(deep.oceanLocalWater.lightAtDepth < shallow.oceanLocalWater.lightAtDepth);
  assert.ok(deep.ambient.intensity >= .45);
  assert.ok(deep.waterColors.top.value.r > deep.waterNightColor.r);
  shallow.oceanWaterParticles.dispose(); deep.oceanWaterParticles.dispose();
});

test('paused navigation resamples conditions without advancing particle clock or drift', () => {
  const reef = fixture(67, 5, -2); reef.updateOceanWater(.2);
  const before = reef.oceanWaterParticles.stats;
  reef.paused = true; reef.camera.position.x += 64; reef.updateOceanWater(.1);
  const after = reef.oceanWaterParticles.stats;
  assert.equal(after.clockSec, before.clockSec); assert.deepEqual(after.drift, before.drift);
  assert.notDeepEqual(after.cameraPosition, before.cameraPosition);
  reef.oceanWaterParticles.dispose();
});
