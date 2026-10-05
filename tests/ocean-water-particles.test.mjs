import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanWaterParticles } from '../src/world/OceanWaterParticles.js';

const frame = overrides => ({ cameraPosition: { x: 130, y: -6, z: -240 },
  renderOrigin: { x: 128, z: -256 }, dtSec: 1, paused: false,
  currentVector: { x: .3, z: -.2 }, turbidity: .25, lightAtDepth: .65, floorY: -12,
  ...overrides });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('seeded fixed volume is deterministic and reset reuses every GPU resource and attribute', t => {
  const scene = new THREE.Scene(), a = new OceanWaterParticles(scene, { seed: 'reef' });
  const b = new OceanWaterParticles(scene, { seed: 'reef' });
  t.after(() => { a.dispose(); b.dispose(); });
  const geometry = a.root.geometry, material = a.root.material;
  const positions = geometry.attributes.position, sizes = geometry.attributes.pointScale;
  assert.equal(positions.count, 240);
  assert.equal(sizes.count, 240);
  assert.deepEqual(positions.array, b.root.geometry.attributes.position.array);
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Math.abs(positions.getX(index)) <= 12);
    assert.ok(Math.abs(positions.getY(index)) <= 5);
    assert.ok(Math.abs(positions.getZ(index)) <= 12);
  }
  a.update(frame());
  assert.equal(a.reset('reef'), true);
  assert.equal(a.root.geometry, geometry);
  assert.equal(a.root.material, material);
  assert.equal(geometry.attributes.position, positions);
  assert.equal(geometry.attributes.pointScale, sizes);
  assert.deepEqual(positions.array, b.root.geometry.attributes.position.array);
  assert.equal(a.stats.clockSec, 0);
  assert.deepEqual(a.stats.drift, { x: 0, z: 0 });
  a.reset('different');
  assert.notDeepEqual(positions.array, b.root.geometry.attributes.position.array);
  assert.equal(a.root.userData.oceanStreaming, true);
  assert.equal(a.stats.geometryCount, 1);
  assert.equal(a.stats.materialCount, 1);
  assert.equal(a.stats.textureCount, 0);
});

test('camera-local volume preserves logical position across a floating rendering origin', t => {
  const scene = new THREE.Scene(), particles = new OceanWaterParticles(scene);
  t.after(() => particles.dispose());
  const positions = particles.root.geometry.attributes.position.array.slice();
  particles.update(frame({ cameraPosition: { x: 1e9 + 8, y: -4, z: -1e9 + 3 },
    renderOrigin: { x: 1e9, z: -1e9 }, dtSec: 0 }));
  particles.root.updateMatrixWorld(true);
  assert.deepEqual(particles.root.getWorldPosition(new THREE.Vector3()).toArray(), [8, -4, 3]);
  assert.equal(particles.root.parent, scene);
  particles.update(frame({ cameraPosition: { x: 1e9 + 8, y: -4, z: -1e9 + 3 },
    renderOrigin: { x: 1e9 + 64, z: -1e9 - 64 }, dtSec: 0 }));
  particles.root.updateMatrixWorld(true);
  assert.deepEqual(particles.root.getWorldPosition(new THREE.Vector3()).toArray(), [-56, -4, 67]);
  assert.deepEqual(particles.root.geometry.attributes.position.array, positions);
  assert.deepEqual(particles.stats.drift, { x: 0, z: 0 });
});

test('advection accumulates wall seconds and changing flow cannot jump previous displacement', t => {
  const particles = new OceanWaterParticles(new THREE.Scene());
  t.after(() => particles.dispose());
  particles.update(frame());
  near(particles.stats.clockSec, 1);
  near(particles.stats.drift.x, .3);
  near(particles.stats.drift.z, -.2);
  particles.update(frame({ dtSec: 0, currentVector: { x: -.4, z: .1 } }));
  near(particles.stats.drift.x, .3);
  near(particles.stats.drift.z, -.2);
  particles.update(frame({ dtSec: .5, currentVector: { x: -.4, z: .1 } }));
  near(particles.stats.clockSec, 1.5);
  near(particles.stats.drift.x, .1);
  near(particles.stats.drift.z, -.15);
  near(particles.root.material.uniforms.drift.value.x, .1);
  near(particles.root.material.uniforms.drift.value.y, -.15);
});

test('pause freezes clock and drift while navigation and local appearance still update', t => {
  const particles = new OceanWaterParticles(new THREE.Scene());
  t.after(() => particles.dispose());
  particles.update(frame());
  const before = particles.stats;
  particles.update(frame({ cameraPosition: { x: 500, y: -8, z: -400 }, dtSec: 30, paused: true,
    currentVector: { x: -.6, z: .3 }, turbidity: .8, lightAtDepth: .2 }));
  assert.equal(particles.stats.clockSec, before.clockSec);
  assert.deepEqual(particles.stats.drift, before.drift);
  assert.deepEqual(particles.root.position.toArray(), [372, -8, -144]);
  assert.equal(particles.stats.turbidity, .8);
  assert.equal(particles.stats.lightAtDepth, .2);
  particles.update(frame({ dtSec: .5, currentVector: { x: 0, z: 0 } }));
  assert.deepEqual(particles.stats.drift, before.drift);
  near(particles.stats.clockSec, 1.5);
});

test('long advection remains in the finite volume without changing buffer identity or count', t => {
  const particles = new OceanWaterParticles(new THREE.Scene());
  t.after(() => particles.dispose());
  const geometry = particles.root.geometry, material = particles.root.material;
  const positions = geometry.attributes.position.array;
  for (let index = 0; index < 100; index++) particles.update(frame({ dtSec: 500, currentVector: { x: .7, z: -.53 } }));
  assert.equal(particles.stats.clockSec, 50000);
  assert.ok(particles.stats.drift.x >= -12 && particles.stats.drift.x < 12);
  assert.ok(particles.stats.drift.z >= -12 && particles.stats.drift.z < 12);
  assert.equal(particles.root.geometry, geometry);
  assert.equal(particles.root.material, material);
  assert.equal(geometry.attributes.position.array, positions);
  assert.equal(particles.stats.particleCount, 240);
  assert.equal(particles.stats.maxDrawCalls, 1);
});

test('clipping follows world floor and surface; environment and crossfade values are bounded', t => {
  const particles = new OceanWaterParticles(new THREE.Scene(), { surfaceY: 8 });
  t.after(() => particles.dispose());
  particles.update(frame({ cameraPosition: { x: 130, y: 7, z: -240 }, floorY: -3,
    turbidity: 5, lightAtDepth: -1, blend: .37 }));
  assert.deepEqual(particles.stats.clipping, { minY: -2.96, maxY: 7.96 });
  const uniforms = particles.root.material.uniforms;
  assert.equal(uniforms.cameraY.value, 7);
  assert.equal(uniforms.floorY.value, -3);
  assert.equal(uniforms.surfaceY.value, 8);
  assert.equal(uniforms.turbidity.value, 1);
  assert.equal(uniforms.lightAtDepth.value, 0);
  assert.equal(uniforms.blend.value, .37);
  particles.update(frame({ dtSec: 0, blend: -1 }));
  assert.equal(uniforms.blend.value, 0);
  particles.update(frame({ dtSec: 0, blend: 5 }));
  assert.equal(uniforms.blend.value, 1);
});

test('disposal releases owned resources once and removes only its own point volume', () => {
  const scene = new THREE.Scene(), other = new THREE.Group();
  scene.add(other);
  const particles = new OceanWaterParticles(scene);
  let geometryDisposals = 0, materialDisposals = 0;
  particles.root.geometry.addEventListener('dispose', () => geometryDisposals++);
  particles.root.material.addEventListener('dispose', () => materialDisposals++);
  particles.dispose();
  particles.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(particles.root.parent, null);
  assert.equal(other.parent, scene);
  assert.equal(particles.stats.visible, false);
  assert.equal(particles.stats.geometryCount, 0);
  assert.equal(particles.reset(8), false);
  assert.equal(particles.update(frame()), false);
});
