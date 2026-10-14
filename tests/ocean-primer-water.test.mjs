import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPrimerWater, samplePrimerWaterSurface, PRIMER_WATER_WAVES,
  PRIMER_WATER_OPTICS } from '../src/world/OceanPrimerWater.js';

const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
function fixture(t, options = {}, scene = new THREE.Scene()) {
  const rig = createPrimerWater(scene, options); t.after(() => rig.dispose());
  return {rig, scene, water: rig.root.getObjectByName('Primer gentle swells and fine surface ripples')};
}

test('one frozen directional spectrum obeys gravity-wave dispersion and a bounded non-overturning swell budget', () => {
  assert.equal(PRIMER_WATER_WAVES.length, 6); assert.ok(Object.isFrozen(PRIMER_WATER_WAVES));
  close(PRIMER_WATER_WAVES.reduce((sum, wave) => sum + wave.amplitudeM, 0), .42);
  let steepness = 0;
  for (const wave of PRIMER_WATER_WAVES) {
    assert.ok(Object.isFrozen(wave) && Object.isFrozen(wave.direction));
    close(wave.k, Math.PI * 2 / wave.wavelengthM);
    close(wave.omega ** 2, 9.81 * wave.k * Math.tanh(wave.k * 12));
    close(wave.omega * wave.periodSec, Math.PI * 2);
    close(Math.hypot(...wave.direction), 1);
    steepness += wave.steepness * wave.amplitudeM * wave.k;
  }
  assert.ok(steepness < .1, 'the sum of horizontal Jacobian perturbations stays safely below one');
});

test('world-space CPU samples invert the same displaced Gerstner field used by the GPU and retain analytic normals', t => {
  const {rig, water} = fixture(t); const phase = water.material.uniforms.primerPhase.value;
  for (const time of [0, 45, 285, 365, 450, 1234.5]) for (const [qx, qz] of [[0, 0], [-18, 2], [30, -55], [1400, -180]]) {
    let x = qx, z = qz, height = 0;
    for (const wave of PRIMER_WATER_WAVES) {
      const [dx, dz] = wave.direction;
      const theta = wave.k * (qx * dx + qz * dz) - wave.omega * time + phase + wave.phaseOffset;
      x += wave.steepness * wave.amplitudeM * dx * Math.cos(theta);
      z += wave.steepness * wave.amplitudeM * dz * Math.cos(theta);
      height += wave.amplitudeM * Math.sin(theta);
      assert.ok(water.material.vertexShader.includes(wave.omega.toFixed(10)));
      assert.ok(water.material.fragmentShader.includes(wave.k.toFixed(10)));
    }
    const sampled = rig.sampleSurface(x, z, time), e = .001;
    close(sampled.heightM, height);
    close(sampled.gradient.x, (rig.sampleSurface(x + e, z, time).heightM - rig.sampleSurface(x - e, z, time).heightM) / (2 * e));
    close(sampled.gradient.z, (rig.sampleSurface(x, z + e, time).heightM - rig.sampleSurface(x, z - e, time).heightM) / (2 * e));
    close(Math.hypot(...Object.values(sampled.normal)), 1);
    assert.ok(sampled.normal.y > .99);
  }
  assert.match(water.material.vertexShader, /unresolved\+=\(1\.0-keep\)/,
    'distant geometry filtering transfers unresolved wave slopes to the reflective variance term');
  assert.match(water.material.fragmentShader, /sqrt\(max\(vVariance/);
  for (const shader of [water.material.vertexShader, water.material.fragmentShader])
    assert.doesNotMatch(shader, /\b(?:float|int|bool|vec[234]|mat[234])\s+(?:flat|sample|patch|input|output|common|filter|namespace)\b/,
      'GLSL ES reserved words cannot be authored variable names');
});

test('surface and pelagic use the same world phase throughout 450 seconds and sea-level changes only translate height', t => {
  const first = fixture(t, {seed: 55}), second = fixture(t, {seed: '55'}), shallow = fixture(t, {seed: 55, seaLevelM: 8, underwaterOnly: true});
  for (const globalTime of [0, 44.99, 45, 285, 365, 430, 450, 900]) {
    first.rig.update(globalTime, {position: {x: 20, y: -2, z: -30}});
    second.rig.update(globalTime, {position: {x: 20, y: -2, z: -30}});
    shallow.rig.update(globalTime, {position: {x: 20, y: 6, z: -30}});
    assert.equal(first.water.material.uniforms.time.value, globalTime);
    assert.deepEqual(first.rig.sampleSurface(20, -30), second.rig.sampleSurface(20, -30));
    const sea = first.rig.sampleSurface(20, -30), reef = shallow.rig.sampleSurface(20, -30);
    close(reef.heightM - sea.heightM, 8); assert.deepEqual(reef.gradient, sea.gradient);
    close(first.rig.diagnostics().depthM, shallow.rig.diagnostics().depthM);
    const seaTransmission = first.rig.environmentAt({x: 20, y: -2, z: -30}).transmissionRGB;
    const reefTransmission = shallow.rig.environmentAt({x: 20, y: 6, z: -30}).transmissionRGB;
    seaTransmission.forEach((value, i) => close(value, reefTransmission[i], 1e-14));
  }
});

test('actual observer world position controls continuous immersion and RGB attenuation, including free-observe reversal', t => {
  const {rig, scene, water} = fixture(t, {nearshore: true});
  const volume = rig.root.getObjectByName('Primer shared underwater absorption and scattering');
  const sharedRadiance = shader => shader.match(/vec3 primerVolumeRadiance[\s\S]*?return colour;\s*\}/)?.[0];
  assert.ok(sharedRadiance(water.material.fragmentShader));
  assert.equal(sharedRadiance(water.material.fragmentShader), sharedRadiance(volume.material.fragmentShader));
  assert.equal(water.material.uniforms.observerDepth, volume.material.uniforms.depth);
  assert.equal(water.material.uniforms.underwaterLightColour, volume.material.uniforms.lightColour);
  assert.match(water.material.fragmentShader, /volumeColour=primerVolumeRadiance\(-view,observerDepth,underwaterLightColour\)/);
  assert.match(water.material.fragmentShader, /rayTransmission=exp\(-sigma\*distanceToEye\)/);
  assert.doesNotMatch(water.material.fragmentShader, /waterRadiance\*\.28/);
  for (const farM of [180, 250]) for (let i = 0; i < 3; i++) {
    const transmission = Math.exp(-(PRIMER_WATER_OPTICS.absorptionRGB[i] + PRIMER_WATER_OPTICS.scatteringRGB[i]) * farM);
    assert.ok(transmission < .001, 'at the original far distances surface/background radiance mismatch falls below 0.1%');
  }
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera(); parent.position.set(10, 3, -6); parent.add(camera);
  camera.position.set(2, -5, 4); parent.updateMatrixWorld(true);
  rig.update(330, camera); const actual = new THREE.Vector3(); camera.getWorldPosition(actual);
  assert.deepEqual(water.material.uniforms.viewer.value.toArray(), actual.toArray());
  assert.equal(rig.environmentAt(actual).underwater, true);
  const surface = rig.sampleSurface(actual.x, actual.z).heightM;
  const densities = [], backgrounds = [];
  for (const signedDepth of [-.15, -.12, -.06, 0, .08, .16, .22, .25]) {
    rig.update(330, {position: {x: actual.x, y: surface - signedDepth, z: actual.z}});
    densities.push(scene.fog.density); backgrounds.push(scene.background.toArray());
  }
  for (let i = 1; i < densities.length; i++) assert.ok(densities[i] >= densities[i - 1]);
  assert.notDeepEqual(backgrounds[2], backgrounds[3]); assert.notDeepEqual(backgrounds[3], backgrounds[4]);
  const shallow = rig.environmentAt({x: 0, y: -1, z: 0}), deep = rig.environmentAt({x: 0, y: -700, z: 0});
  assert.ok(shallow.transmissionRGB[0] < shallow.transmissionRGB[1] && shallow.transmissionRGB[1] < shallow.transmissionRGB[2]);
  assert.ok(deep.naturalLight < 1e-10 && deep.sunIntensity < .00001, 'natural sunlight has no artificial depth floor');
  camera.position.y = 5; parent.updateMatrixWorld(true); rig.update(330, camera);
  assert.equal(rig.environmentAt(camera).underwater, false);
  assert.equal(rig.root.getObjectByName('Primer shared underwater absorption and scattering').visible, false);
});

test('the shallow-only rig supplies isolated sun and hemisphere light with no extra water mesh or framebuffer', t => {
  const {rig, water} = fixture(t, {seaLevelM: 8, underwaterOnly: true});
  assert.equal(water, undefined); assert.ok(rig.sun.isDirectionalLight && rig.ambient.isHemisphereLight);
  assert.equal(rig.sun.castShadow, false); assert.equal(rig.sun.shadow.mapSize.x, 1024);
  assert.ok(rig.sun.shadow.camera.far > rig.sun.position.length());
  rig.update(220, {position: {x: 0, y: 3, z: 0}});
  const diagnostic = rig.diagnostics();
  assert.equal(diagnostic.renderTargets, 0); assert.equal(diagnostic.waterVertices, 0);
  assert.equal(diagnostic.mediumBlend, 1); assert.equal(diagnostic.noEcologicalForcing, true);
  assert.equal(diagnostic.ownedResources, 4);
  const volume = rig.root.getObjectByName('Primer shared underwater absorption and scattering');
  assert.equal(volume.material.depthWrite, false);
  assert.match(volume.material.vertexShader, /gl_Position\.z=gl_Position\.w;/,
    'the directional background reaches the far plane without cutting the original 180m camera');
  assert.match(PRIMER_WATER_OPTICS.status, /not measured site/);
  assert.equal(PRIMER_WATER_OPTICS.references.length, 4);
});

test('reflection/refraction restores scene and renderer state on a failed pass and disposes only owned resources', t => {
  const scene = new THREE.Scene(), previousBackground = new THREE.Color('#123456'), previousFog = new THREE.Fog('#234567', 1, 100);
  const foreign = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(foreign);
  scene.background = previousBackground; scene.fog = previousFog;
  const {rig, water} = fixture(t, {}, scene); const originalTarget = new THREE.WebGLRenderTarget(4, 4);
  let target = originalTarget, renders = 0, fail = true; const targets = new Set();
  const renderer = {xr: {enabled: true}, shadowMap: {autoUpdate: true}, autoClear: true,
    getRenderTarget: () => target, setRenderTarget(value) {target = value; if (value !== originalTarget && value) targets.add(value);},
    state: {buffers: {depth: {setMask() {}}}}, clear() {}, render() {renders++; if (fail) throw new Error('bounded render failure');}};
  const camera = new THREE.PerspectiveCamera(54, 16 / 9, .1, 4000); camera.position.set(0, 5, 35); camera.lookAt(0, 0, -60); camera.updateMatrixWorld(true);
  rig.update(120, camera); scene.updateMatrixWorld(true); const fog = scene.fog, background = scene.background;
  assert.throws(() => water.onBeforeRender(renderer, scene, camera), /bounded render failure/);
  assert.equal(target, originalTarget); assert.equal(renderer.xr.enabled, true); assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(scene.fog, fog); assert.equal(scene.background, background); assert.equal(water.visible, true);
  fail = false; water.onBeforeRender(renderer, scene, camera);
  assert.ok(renders >= 3); assert.equal(targets.size, 2); assert.equal(target, originalTarget);
  const counts = new Map(), track = resource => {
    if (!resource || counts.has(resource)) return; counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  };
  rig.root.traverse(node => {if (node.isMesh) {track(node.geometry); for (const material of [].concat(node.material)) track(material);}});
  for (const target of targets) track(target); track(foreign.geometry); track(foreign.material); track(originalTarget);
  rig.dispose(); rig.dispose();
  assert.equal(counts.get(foreign.geometry), 0); assert.equal(counts.get(foreign.material), 0); assert.equal(counts.get(originalTarget), 0);
  for (const [resource, count] of counts) if (![foreign.geometry, foreign.material, originalTarget].includes(resource)) assert.equal(count, 1);
  assert.deepEqual(scene.children, [foreign]); assert.equal(scene.background, previousBackground); assert.equal(scene.fog, previousFog);
  assert.equal(rig.update(12, camera), false);
  foreign.geometry.dispose(); foreign.material.dispose(); originalTarget.dispose();
});

test('water rejects non-finite input and invalid bounds without silently inventing a camera or sea state', () => {
  assert.throws(() => createPrimerWater({}, {}), TypeError);
  assert.throws(() => createPrimerWater(new THREE.Scene(), {extentM: 99}), TypeError);
  assert.throws(() => createPrimerWater(new THREE.Scene(), {seed: NaN}), TypeError);
  assert.throws(() => samplePrimerWaterSurface(NaN, 0, 0), TypeError);
  assert.throws(() => samplePrimerWaterSurface(0, 0, Infinity), TypeError);
  const rig = createPrimerWater(new THREE.Scene(), {underwaterOnly: true});
  try {
    assert.throws(() => rig.update(0), TypeError);
    assert.throws(() => rig.update(0, {position: {x: 0, y: NaN, z: 0}}), TypeError);
    assert.throws(() => rig.environmentAt({x: 0, y: Infinity, z: 0}), TypeError);
  } finally {rig.dispose();}
});
