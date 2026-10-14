import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOceanPrimerPelagic } from '../src/world/OceanPrimerPelagic.js';

const samples = Array.from({ length: 161 }, (_, i) => i * .5);
const fixture = () => {
  const scene = new THREE.Scene(), world = createOceanPrimerPelagic(scene, { seed: 55 });
  const whale = world.root.children.find(o => o.name.includes('humpback whale /'));
  const dolphins = world.root.children.filter(o => o.name.includes('bottlenose dolphin '));
  const spray = world.root.children.find(o => o.name.includes('breath mist'));
  assert.ok(whale?.isMesh); assert.equal(dolphins.length, 6); assert.ok(spray?.isPoints);
  return { scene, world, whale, dolphins, spray };
};
const update = (f, t) => { f.world.update(t); f.scene.updateMatrixWorld(true); };
const cameraAt = (f, t) => {
  const pose = f.world.cameraPose(t), c = new THREE.PerspectiveCamera(pose.fov, 16 / 9, .08, 300);
  c.position.set(pose.position.x, pose.position.y, pose.position.z);
  c.lookAt(pose.target.x, pose.target.y, pose.target.z); c.updateMatrixWorld(true);
  return { pose, camera: c };
};
const close = (actual, expected, message, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);

// Inspect the actual black paired-blowhole surface vertices, not a nominal
// whale centre or the breath effect's own declared attachment point.
const blowholeCentre = whale => {
  const position = whale.geometry.attributes.position, rgb = whale.geometry.attributes.color;
  const blowholeColour = new THREE.Color('#1b2b30'), centre = new THREE.Vector3();
  let count = 0, left = false, right = false;
  for (let i = 0; i < rgb.count; i++) {
    if (Math.abs(rgb.getX(i) - blowholeColour.r) > 1e-6 ||
        Math.abs(rgb.getY(i) - blowholeColour.g) > 1e-6 ||
        Math.abs(rgb.getZ(i) - blowholeColour.b) > 1e-6) continue;
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    assert.ok(p.x > .2 && p.y > .05 && Math.abs(p.z) < .03, 'blowhole vertices must be on the front upper head');
    centre.add(p); count++; left ||= p.z < 0; right ||= p.z > 0;
  }
  assert.ok(count > 20 && left && right, 'actual paired blowhole surfaces exist');
  return centre.divideScalar(count).applyMatrix4(whale.matrixWorld);
};

test('actual longitudinal whale and dolphin meshes have metre scale and a readable five-to-one size ratio', () => {
  const f = fixture();
  try {
    const length = mesh => { mesh.geometry.computeBoundingBox(); return (mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x) * mesh.scale.x; };
    close(length(f.whale), 13.8, 'whale total length');
    for (const dolphin of f.dolphins) close(length(dolphin), 2.65, 'dolphin total length');
    const ratio = length(f.whale) / length(f.dolphins[0]);
    assert.ok(ratio > 5 && ratio < 5.3, `whale/dolphin actual length ratio ${ratio}`);
    // Dolphins share one complete mesh; they are not progressively reduced
    // silhouettes or scaled differently to manufacture perspective depth.
    assert.equal(new Set(f.dolphins.map(d => d.geometry)).size, 1);
  } finally { f.world.dispose(); }
});

test('all 161 chapter camera samples produce finite, nondegenerate rendered camera matrices', () => {
  const f = fixture();
  try {
    for (const t of samples) {
      update(f, t); const { pose, camera } = cameraAt(f, t);
      assert.ok([...Object.values(pose.position), ...Object.values(pose.target), pose.fov].every(Number.isFinite), `finite camera at ${t}s`);
      assert.ok(pose.fov >= 40 && pose.fov <= 75, `usable camera field of view at ${t}s`);
      assert.ok(camera.position.distanceTo(new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z)) > 5, `nondegenerate camera target at ${t}s`);
      for (const matrix of [camera.matrixWorld, camera.matrixWorldInverse, camera.projectionMatrix]) assert.ok(matrix.elements.every(Number.isFinite), `finite rendered matrices at ${t}s`);
      for (const animal of [f.whale, ...f.dolphins]) assert.ok(animal.matrixWorld.elements.every(Number.isFinite), `finite animal world transform at ${t}s`);
    }
  } finally { f.world.dispose(); }
});

test('whale breath occurs only in the near-surface window, with actual nose holes clear of the sea', () => {
  const f = fixture(); let breathSamples = 0, deepSamples = 0;
  try {
    for (const t of samples) {
      update(f, t); const nose = blowholeCentre(f.whale), opacity = f.spray.material.uniforms.opacity.value;
      const surfaceY = f.world.environmentAt(t).surfaceY;
      if (f.spray.visible && opacity > 0) {
        breathSamples++;
        assert.ok(t >= 16 && t <= 22, `breath should be inside the surface visit at ${t}s`);
        assert.ok(nose.y >= surfaceY -.04 && nose.y <= surfaceY + 1, `actual blowholes near and above the sea at ${t}s: ${nose.y}m`);
      } else if (nose.y < surfaceY - 1) {
        deepSamples++;
        assert.equal(f.spray.visible, false, `no false underwater breath at ${t}s`);
        assert.equal(opacity, 0, `underwater breath has no visible opacity at ${t}s`);
      }
      if (t < 16 || t > 22) {
        assert.equal(f.spray.visible, false, `no spray outside surface breathing window at ${t}s`);
        assert.equal(opacity, 0, `no spray opacity outside surface window at ${t}s`);
      }
    }
    assert.ok(breathSamples >= 4 && deepSamples > 100, 'both actual breathing and submerged portions were inspected');
  } finally { f.world.dispose(); }
});

test('visible breath mist is attached to the actual metre-scaled whale blowholes', () => {
  const f = fixture();
  try {
    for (const t of [18, 19, 20]) {
      update(f, t); assert.ok(f.spray.visible && f.spray.material.uniforms.opacity.value > 0);
      const nose = blowholeCentre(f.whale), sprayBase = f.spray.getWorldPosition(new THREE.Vector3());
      assert.ok(nose.distanceTo(sprayBase) < .15, `breath base must attach to actual blowholes at ${t}s; observed ${nose.distanceTo(sprayBase).toFixed(3)}m gap`);
    }
  } finally { f.world.dispose(); }
});

test('six dolphins occupy actual near/far and vertical layers with no intersecting padded body bounds', () => {
  const f = fixture(); let nearFarSamples = 0;
  try {
    for (const t of samples) {
      update(f, t); const { camera } = cameraAt(f, t);
      const bounds = f.dolphins.map(d => d.geometry.boundingBox.clone().applyMatrix4(d.matrixWorld)
        // This covers the full authored vertical tail and pectoral offsets
        // (less than .13m after metre scaling), not just the undeformed body.
        .expandByVector(new THREE.Vector3(.02, .15, .02)));
      for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
        assert.equal(bounds[i].intersectsBox(bounds[j]), false, `dolphins ${i + 1}/${j + 1} body envelopes overlap at ${t}s`);
      }
      const depths = f.dolphins.map(d => d.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse).z);
      const heights = f.dolphins.map(d => d.position.y);
      assert.ok(Math.max(...depths) - Math.min(...depths) > 5, `actual camera-depth separation at ${t}s`);
      assert.ok(Math.max(...heights) - Math.min(...heights) > 1, `actual vertical layering at ${t}s`);
      if (t >= 43 && t <= 65) {
        nearFarSamples++;
        for (const dolphin of f.dolphins) {
          const projected = dolphin.getWorldPosition(new THREE.Vector3()).project(camera);
          assert.ok(Math.abs(projected.x) < .85 && Math.abs(projected.y) < .85 && projected.z < 1, `whole-pod camera includes dolphin at ${t}s`);
        }
      }
    }
    assert.equal(nearFarSamples, 45);
  } finally { f.world.dispose(); }
});

test('actual animal geometry attributes and indices are finite, and scene resources dispose exactly once', () => {
  const f = fixture(), resources = new Set(), disposed = new Map();
  f.world.root.traverse(o => {
    if (o.geometry) resources.add(o.geometry);
    for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) resources.add(material);
  });
  for (const resource of resources) {
    disposed.set(resource, 0); resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  }
  for (const animal of [f.whale, ...f.dolphins]) {
    const g = animal.geometry, p = g.attributes.position;
    for (const attribute of Object.values(g.attributes)) assert.ok(Array.from(attribute.array).every(Number.isFinite), `${animal.name} has finite geometry attributes`);
    assert.ok(Array.from(g.index.array).every(i => Number.isInteger(i) && i >= 0 && i < p.count), `${animal.name} has in-range indices`);
    assert.ok(g.index.count / 3 > 10_000, `${animal.name} includes a complete surface mesh`);
  }
  f.world.dispose(); f.world.dispose(); f.world.update(18);
  assert.equal(f.scene.children.length, 0, 'independent scene root detached');
  assert.equal(f.world.root.children.length, 0, 'no retained render objects');
  for (const [resource, count] of disposed) assert.equal(count, 1, `${resource.type} disposed exactly once`);
});
