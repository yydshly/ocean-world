import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createOceanPrimerSurface, sampleOceanPrimerSurface, oceanPrimerNearshoreHeight,
  OCEAN_PRIMER_SURFACE_SWELLS, OCEAN_PRIMER_COAST_TEXTURES } from '../src/world/OceanPrimerSurface.js';

const finite = p => ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
const digest = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
function fixture(t, seed = 55, scene = new THREE.Scene()) {
  const chapter = createOceanPrimerSurface(scene, { seed }); t.after(() => chapter.dispose());
  const water = chapter.root.getObjectByName('Primer gentle swells and fine surface ripples');
  const coast = chapter.root.getObjectByName('Primer continuous irregular nearshore coast');
  const boat = chapter.root.getObjectByName('Primer fourteen metre reference boat');
  assert.ok(water?.isWater && coast?.isMesh && boat?.isGroup); return { scene, chapter, water, coast, boat };
}
const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const expectedPoints = [[-18, 4.8, 42], [-12, 4, 22], [-8, 2.2, 2], [-12, .45, -18], [-9, -2.3, -33], [-1, -4.3, -51]].map(p => new THREE.Vector3(...p));
const expectedTargets = [[5, .3, -75], [10, .05, -82], [-4, -.6, -54], [-5, -4, -43], [-3, -6.8, -54], [0, -7, -65]].map(p => new THREE.Vector3(...p));
const path = new THREE.CatmullRomCurve3(expectedPoints), targetPath = new THREE.CatmullRomCurve3(expectedTargets);

test('finite metre swell samples obey the gentle amplitude budget and their actual surface gradients', () => {
  const limit = OCEAN_PRIMER_SURFACE_SWELLS.reduce((sum, w) => sum + w.amplitudeM, 0);
  close(limit, .42); assert.equal(OCEAN_PRIMER_SURFACE_SWELLS.length, 6);
  for (const time of [0, 1.25, 12, 29.5, 45]) for (const [x, z] of [[0, 0], [-25, 8], [48, -92], [450, 160], [900, 0]]) {
    const sample = sampleOceanPrimerSurface(x, z, time), h = sample.heightM, e = .001;
    assert.ok(Number.isFinite(h) && Math.abs(h) <= limit + 1e-10);
    assert.ok(Object.values(sample.gradient).every(Number.isFinite));
    close(sample.gradient.x, (sampleOceanPrimerSurface(x + e, z, time).heightM - sampleOceanPrimerSurface(x - e, z, time).heightM) / (2 * e), 1e-7);
    close(sample.gradient.z, (sampleOceanPrimerSurface(x, z + e, time).heightM - sampleOceanPrimerSurface(x, z - e, time).heightM) / (2 * e), 1e-7);
    assert.ok(Math.hypot(sample.gradient.x, sample.gradient.z) < .14, 'gentle long-swell gradient');
  }
  assert.notEqual(sampleOceanPrimerSurface(0, 0, 0).heightM, sampleOceanPrimerSurface(0, 0, 2).heightM,
    'the real wave field advances rather than moving only a normal texture');
  assert.notEqual(sampleOceanPrimerSurface(900, 0, 12).heightM, 0, 'physical sampling keeps the shared sea field beyond the near mesh');
  assert.throws(() => sampleOceanPrimerSurface(NaN, 0, 0), TypeError);
  assert.throws(() => sampleOceanPrimerSurface(0, 0, Infinity), TypeError);
});

test('one continuous water mesh and one nearshore bed contain finite indexed geometry, real relief and shader swells', t => {
  const { chapter, water, coast, boat } = fixture(t);
  assert.ok(water.geometry.attributes.position.count < 30000, 'finite adapted near/far water mesh');
  assert.ok(water.geometry.attributes.position.count > 10000, 'nearby wave surface has actual geometry support');
  assert.ok(coast.geometry.attributes.position.count < 40000, 'finite original coast mesh');
  for (const geometry of [water.geometry, coast.geometry]) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) assert.ok(finite(new THREE.Vector3().fromBufferAttribute(positions, i)));
    for (const index of geometry.index.array) assert.ok(index >= 0 && index < positions.count);
  }
  const p = coast.geometry.attributes.position, c = coast.geometry.attributes.color;
  let minimum = Infinity, maximum = -Infinity, colourMin = Infinity, colourMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    close(p.getY(i), oceanPrimerNearshoreHeight(p.getX(i), p.getZ(i)), 2e-6);
    minimum = Math.min(minimum, p.getY(i)); maximum = Math.max(maximum, p.getY(i));
    colourMin = Math.min(colourMin, c.getY(i)); colourMax = Math.max(colourMax, c.getY(i));
  }
  assert.ok(minimum < -7 && maximum > 28 && maximum < 45, 'continuous coastal relief and submerged bed');
  assert.ok(colourMax - colourMin > .10, 'sand and stratified exposed rock colour layers');
  assert.match(water.material.vertexShader, /primerWave\(baseWorld\.xz,primerSpacing/);
  assert.match(water.material.vertexShader, /normal=normalize\(cross\(tz,tx\)\)/);
  assert.match(water.material.vertexShader, /projectionMatrix\*viewMatrix\*vec4\(vWorld/);
  assert.match(water.material.fragmentShader, /vVariance/);
  assert.match(water.material.fragmentShader, /float ripple/);
  assert.match(water.material.fragmentShader, /exp\(-sigma\*path\)/);
  const hull = boat.children[0]; hull.geometry.computeBoundingBox();
  close((hull.geometry.boundingBox.max.z - hull.geometry.boundingBox.min.z) * hull.scale.z, 14);
  assert.equal(chapter.diagnostics().referenceBoatLengthM, 14);
});

test('all 91 half-second camera samples keep the revised open-sea path and original nearshore clearance budget', t => {
  const { chapter, water, coast, boat } = fixture(t);
  const staticGeometry = [water.geometry, coast.geometry].map(g => ({ version: g.attributes.position.version, hash: digest(g.attributes.position.array) }));
  for (let tick = 0; tick <= 90; tick++) {
    const time = tick * .5; chapter.update(time);
    const pose = chapter.cameraPose(time), expected = path.getPoint(time / 45), target = targetPath.getPoint(time / 45);
    assert.ok(finite(pose.position) && finite(pose.target)); assert.equal(pose.fov, 54);
    assert.deepEqual(pose.position, { x: expected.x, y: expected.y, z: expected.z });
    assert.deepEqual(pose.target, { x: target.x, y: target.y, z: target.z });
    assert.ok(expected.distanceTo(target) > 5);
    assert.ok(pose.position.y > oceanPrimerNearshoreHeight(pose.position.x, pose.position.z) + 1,
      'the whole path clears the new coast and nearshore bed by at least one metre');
    assert.equal(water.material.uniforms.time.value, time);
    const sample = sampleOceanPrimerSurface(boat.position.x, boat.position.z, time);
    close(boat.position.y, .15 + sample.heightM);
    assert.ok(boat.matrixWorld.elements.every(Number.isFinite));
    assert.ok(Math.abs(boat.rotation.x) < .07 && Math.abs(boat.rotation.z) < .07);
  }
  [water.geometry, coast.geometry].forEach((g, i) => {
    assert.equal(g.attributes.position.version, staticGeometry[i].version);
    assert.equal(digest(g.attributes.position.array), staticGeometry[i].hash, 'updates never edit mesh vertices on the CPU');
  });
  assert.equal(chapter.diagnostics().timeSec, 45);
});

test('arbitrary surface seeks and another same-seed scene restore the entire authored display deterministically', t => {
  const first = fixture(t), second = fixture(t), expected = new Map();
  function capture(f, time) {
    f.chapter.update(time); const matrices = [];
    f.chapter.root.traverse(node => matrices.push(node.matrixWorld.toArray()));
    return { matrices, waterTime: f.water.material.uniforms.time.value,
      phase: f.water.material.uniforms.primerPhase.value, camera: f.chapter.cameraPose(time),
      coast: digest(f.coast.geometry.attributes.position.array), background: f.scene.background.toArray(),
      fog: [f.scene.fog.color.toArray(), f.scene.fog.density] };
  }
  for (const time of [0, 8.75, 27.25, 45]) expected.set(time, capture(first, time));
  for (const time of [45, 0, 27.25, 8.75, 45, 0]) {
    assert.deepEqual(capture(first, time), expected.get(time));
    assert.deepEqual(capture(second, time), expected.get(time));
  }
});

test('surface disposal releases all scenery and both captured framebuffers once, then restores the scene', t => {
  const ownScene = new THREE.Scene(), background = new THREE.Color(0x123456), fog = new THREE.Fog(0x334455, 1, 30);
  ownScene.background = background; ownScene.fog = fog;
  const { scene, chapter, water } = fixture(t, 55, ownScene), disposed = new Map();
  const track = resource => {
    if (!resource || disposed.has(resource)) return;
    disposed.set(resource, 0); resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  };
  scene.traverse(node => {
    if (!node.isMesh) return; track(node.geometry);
    for (const material of [].concat(node.material)) {
      track(material); if (material.uniforms?.normalSampler) track(material.uniforms.normalSampler.value);
    }
  });
  let currentTarget = null; const renderTargets = new Set();
  const renderer = { xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
    getRenderTarget() { return currentTarget; },
    setRenderTarget(target) { currentTarget = target; if (target) renderTargets.add(target); },
    state: { buffers: { depth: { setMask() {} } } }, render() {}, clear() {},
  };
  const camera = new THREE.PerspectiveCamera(54, 16 / 9, .1, 4000);
  camera.position.set(0, 5, 35); camera.lookAt(85, 3, -130); camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true); water.onBeforeRender(renderer, scene, camera);
  assert.equal(renderTargets.size, 2, 'actual reflection and underwater refraction framebuffers were captured');
  const mapTextures = [water.material.uniforms.reflectionMap.value, water.material.uniforms.refractionMap.value];
  for (const target of renderTargets) { assert.ok(target.isWebGLRenderTarget); assert.ok(mapTextures.includes(target.texture)); track(target); }
  assert.equal(currentTarget, null, 'shared water restores the caller render target');
  chapter.dispose(); chapter.dispose();
  assert.ok(disposed.size > 20 && [...disposed.values()].every(count => count === 1));
  assert.equal(chapter.update(12), false); assert.equal(chapter.diagnostics().disposed, true);
  assert.equal(scene.children.length, 0); assert.equal(chapter.root.children.length, 0);
  assert.equal(scene.background, background); assert.equal(scene.fog, fog);
});

test('the complete fourteen-metre boat is legible inside the opening frame and actual free-observe depth drives the water', t => {
  const { chapter, boat } = fixture(t); const pose = chapter.cameraPose(0);
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, .1, 4000);
  camera.position.copy(pose.position); camera.lookAt(new THREE.Vector3().copy(pose.target)); camera.updateMatrixWorld(true);
  const hull = boat.children[0]; hull.updateWorldMatrix(true, false);
  const ends = [-1, 1].map(z => new THREE.Vector3(0, 0, z).applyMatrix4(hull.matrixWorld).project(camera));
  for (const point of ends) assert.ok(Math.abs(point.x) < .88 && Math.abs(point.y) < .88 && point.z < 1);
  assert.ok(Math.abs(ends[1].x - ends[0].x) > .20, 'the full hull occupies more than ten percent of frame width');
  chapter.update(40, {position: {x: -18, y: 5, z: 42}}, 400);
  assert.equal(chapter.environmentAt().underwater, false); assert.equal(chapter.waterRig.diagnostics().timeSec, 400);
  chapter.update(2, {position: {x: -18, y: -3, z: 42}}, 400);
  assert.equal(chapter.environmentAt().underwater, true);
});

test('existing rock and sand maps install atomically once and are released without touching their source files', async t => {
  const { chapter, coast } = fixture(t); const calls = [], textures = [];
  const loader = {async loadAsync(url) { calls.push(url); const texture = new THREE.Texture(); textures.push(texture); return texture; }};
  const first = chapter.loadTextures('/ocean-world/', loader), second = chapter.loadTextures('/unused/', loader);
  assert.equal(first, second); const result = await first;
  assert.equal(result.loaded, 4); assert.deepEqual(calls, OCEAN_PRIMER_COAST_TEXTURES.map(item => '/ocean-world/' + item.file));
  assert.equal(coast.material.map, textures[0]); assert.equal(coast.material.normalMap, textures[1]);
  assert.equal(coast.material.roughnessMap, textures[2]); assert.equal(coast.material.userData.sandMap, textures[3]);
  assert.equal(textures[0].colorSpace, THREE.SRGBColorSpace); assert.equal(textures[1].colorSpace, THREE.NoColorSpace);
  assert.equal(chapter.diagnostics().textures.status, 'ready');
  const counts = textures.map(() => 0); textures.forEach((texture, i) => texture.addEventListener('dispose', () => counts[i]++));
  chapter.dispose(); chapter.dispose(); assert.deepEqual(counts, [1, 1, 1, 1]);
});

test('a failed existing coast map prevents partial installation and has a bounded no-retry failure', async t => {
  const { chapter, coast } = fixture(t); let calls = 0; const counts = [];
  const loader = {async loadAsync() { const index = calls++; if (index === 2) throw new Error('missing map');
    const texture = new THREE.Texture(); counts[index] = 0; texture.addEventListener('dispose', () => counts[index]++); return texture; }};
  await assert.rejects(chapter.loadTextures('/', loader), /no replacement asset or automatic retry/);
  await assert.rejects(chapter.loadTextures('/', loader), /no replacement asset or automatic retry/);
  assert.equal(calls, 4); assert.equal(coast.material.map, null); assert.equal(chapter.diagnostics().textures.status, 'error');
  for (const count of counts) if (count !== undefined) assert.equal(count, 1);
});
