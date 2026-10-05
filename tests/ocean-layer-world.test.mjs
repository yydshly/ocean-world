import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanFormationObservation } from '../src/oceanFormationObservation.js';
import { oceanCommunityReading } from '../src/oceanCommunityReading.js';

// Execute the actual World actions on CPU fixtures; no substitute navigation
// implementation and no WebGL constructor or ecological writes are involved.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `World method ${name} exists`);
  const rest = source.slice(start + 2), next = /\n  [A-Za-z_]\w*\(/.exec(rest);
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const methods = ['oceanWorldPosition', 'oceanLayerY', 'setOceanObservationLayer', 'setOceanRenderOrigin',
  'beginOceanManualObservation', 'captureOceanFreeDepth', 'select',
  'startOceanExploration', 'travelOcean', 'toggleOceanCruise', 'focusNearbyOceanFormation',
  'stopOceanTravel', 'returnToReef', 'setView', 'moveCamera', 'applyFocus', 'oceanSnapshot', 'reset', 'makeSurface'];
const WorldFixture = new Function('THREE', 'clamp', 'oceanLayerHeight', 'oceanFormationObservation', 'oceanCommunityReading',
  'createOceanEnvironment', `return class {${methods.map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp,
  oceanLayerHeight, oceanFormationObservation, oceanCommunityReading, () => ({}));

function fixture({ x = 259, z = -123, y = -10, origin = { x: 0, z: 0 }, generator = createOceanGenerator('42') } = {}) {
  const calls = [], scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(x - origin.x, y, z - origin.z);
  const ecologyData = { regions: [{ id: '4,-2', timeSec: 350.2, resources: { algae: .6, plankton: .4 },
    ledger: { ingested: .03 }, slopeCommunityVersion: 1 }], agents: [
    { id: 'live', regionId: '4,-2', speciesId: 'lyretail-anthias', alive: true, position: { x: 273, y: -15, z: -92 } },
    { id: 'dead', regionId: '4,-2', speciesId: 'blue-starfish', alive: false, position: { x: 274, y: -15, z: -93 } },
  ] };
  const sim = { seed: '42', metrics: { timeSec: 800.2 }, environment: { hour: 10, currentMps: .15 },
    reset(seed) { calls.push(['sim-reset', seed]); this.seed = seed; } };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    scene, camera, surfaceY: 8, oceanRenderOrigin: { ...origin }, oceanExploring: true,
    oceanObservationLayer: 'bed', oceanFreeDepthM: null, oceanTravel: { x: x + 64, z }, oceanCruising: true,
    following: true, transition: { agentId: 'live' }, lastFocusAssessment: { visibleSamples: 5 },
    keys: new Set(['KeyW']), selectedId: 'live', paused: true, speed: 1,
    controls: { target: new THREE.Vector3(camera.position.x, y - 2.4, camera.position.z - 8),
      update() { camera.lookAt(this.target); calls.push(['controls']); } },
    oceanChunks: { generator, stats: { loadedChunks: ['3,-3', '4,-3', '5,-3', '3,-2', '4,-2', '5,-2', '3,-1', '4,-1', '5,-1'] },
      update(position) { calls.push(['chunks', ...position.toArray?.() || [position.x, position.y, position.z]]); },
      reset(seed) { calls.push(['chunk-reset', seed]); }, setRenderOrigin() {} },
    oceanEcology: { data: ecologyData, snapshot: () => ecologyData,
      reset() { calls.push(['ecology-reset']); return Promise.resolve(); } },
    oceanAnimals: { stats: {}, reset() {}, setRenderOrigin() {} },
    oceanWaterParticles: { stats: {}, reset() {} }, catalog: new Map(),
    highlight: { visible: true, position: new THREE.Vector3() }, sim,
    floorY: (wx, wz) => generator.sample(wx, wz).floorY,
    habitatY: (wx, wz) => generator.heightForCamera(wx, wz),
    select(id) { this.selectedId = id; calls.push(['select', id]); },
    onSelect(id) { calls.push(['onSelect', id]); },
    emitSnapshot(force) { calls.push(['snapshot', force]); },
    requestOceanEcology(position = this.oceanWorldPosition()) { calls.push(['ecology-request', position.x, position.y, position.z]); },
    syncPopulation() {}, presets: { wide: { position: [3, 2.8, 5], target: [-2.5, .65, -2] } },
    errors: [], ownGeometry: geometry => geometry, ownMaterial: material => material,
    waterColors: { daylight: { value: 1 } }, isDeep: false, isKelp: false,
  });
  camera.lookAt(world.controls.target);
  return { world, calls, ecologyData, generator };
}

const fixedState = world => ({ position: world.camera.position.toArray(), target: world.controls.target.toArray(),
  origin: { ...world.oceanRenderOrigin }, layer: world.oceanObservationLayer, freeDepthM: world.oceanFreeDepthM,
  travel: structuredClone(world.oceanTravel), cruising: world.oceanCruising, following: world.following,
  transition: structuredClone(world.transition), selectedId: world.selectedId, keys: [...world.keys],
  paused: world.paused, speed: world.speed, sim: { seed: world.sim.seed, metrics: { ...world.sim.metrics },
    environment: { ...world.sim.environment } }, ecology: structuredClone(world.oceanEcology.data) });

test('actual World presets change only viewing height at the same world X/Z and preserve live/dead ecology and pause', () => {
  for (const layer of ['bed', 'midwater', 'surface']) {
    const { world, calls, ecologyData, generator } = fixture();
    const records = structuredClone(ecologyData), sim = structuredClone(fixedState(world).sim), originalEcology = world.oceanEcology;
    const expected = oceanLayerHeight(layer, { surfaceY: 8, floorY: generator.sample(259, -123).floorY,
      safeY: generator.heightForCamera(259, -123) });
    assert.equal(world.setOceanObservationLayer(layer), true);
    assert.deepEqual(world.oceanWorldPosition().toArray(), [259, expected, -123]);
    assert.equal(world.oceanObservationLayer, layer); assert.equal(world.oceanFreeDepthM, null);
    assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    assert.equal(world.following, false); assert.equal(world.transition, null); assert.equal(world.lastFocusAssessment, null);
    assert.equal(world.selectedId, null); assert.equal(world.keys.size, 0);
    assert.equal(world.paused, true); assert.equal(world.speed, 1); assert.equal(world.oceanExploring, true);
    assert.equal(world.oceanEcology, originalEcology); assert.deepEqual(ecologyData, records);
    assert.deepEqual(fixedState(world).sim, sim);
    assert.deepEqual(calls, [['select', null], ['onSelect', null], ['controls'], ['snapshot', true]],
      'height choices never request regional replacement, model stepping or ecological forcing');
    assert.ok(Math.abs(Math.hypot(world.controls.target.x - world.camera.position.x,
      world.controls.target.z - world.camera.position.z) - 8) < 1e-12);
    const tilt = world.controls.target.y - world.camera.position.y;
    assert.ok(layer === 'surface' ? tilt > 0 : tilt < 0);
  }
});

test('positive, negative and distant floating origins preserve the same actual logical height and X/Z', () => {
  for (const [x, z, origin] of [[259, -123, { x: 256, z: -128 }], [-259, 123, { x: -256, z: 128 }],
    [1000259, -1000123, { x: 1000192, z: -1000128 }]]) {
    for (const layer of ['bed', 'midwater', 'surface']) {
      const plain = fixture({ x, z }), shifted = fixture({ x, z, origin });
      plain.world.setOceanObservationLayer(layer); shifted.world.setOceanObservationLayer(layer);
      assert.deepEqual(shifted.world.oceanWorldPosition().toArray(), plain.world.oceanWorldPosition().toArray());
      assert.deepEqual(shifted.world.controls.target.clone().add(new THREE.Vector3(origin.x, 0, origin.z)).toArray(),
        plain.world.controls.target.toArray());
      assert.deepEqual(shifted.world.oceanRenderOrigin, origin);
    }
  }
});

test('neighbor travel and running cruise retain near-surface and midwater observation instead of descending to the bed', () => {
  const generator = { sample: (x, z) => ({ floorY: -20 - (x - 259) * .02, habitat: 'sand' }),
    heightForCamera: x => -20 - (x - 259) * .02 };
  for (const layer of ['surface', 'midwater']) {
    const { world, ecologyData } = fixture({ generator }), saved = structuredClone(ecologyData);
    world.setOceanObservationLayer(layer); world.travelOcean(1, 0);
    assert.equal(world.paused, true, 'manual neighboring navigation remains available while ecology is paused');
    for (let i = 0; i < 45; i++) world.moveCamera(.1);
    const arrival = world.oceanWorldPosition();
    assert.ok(Math.abs(arrival.x - 323) < 1e-9); assert.equal(world.oceanTravel, null);
    assert.ok(Math.abs(arrival.y - world.oceanLayerY(arrival.x, arrival.z)) < 1e-9);
    assert.equal(world.oceanObservationLayer, layer); assert.deepEqual(ecologyData, saved);
    world.paused = false; world.toggleOceanCruise();
    for (let i = 0; i < 30; i++) world.moveCamera(.1);
    const cruise = world.oceanWorldPosition();
    assert.ok(cruise.x > arrival.x); assert.equal(world.oceanCruising, true);
    assert.ok(Math.abs(cruise.y - world.oceanLayerY(cruise.x, cruise.z)) < 1e-9);
    world.paused = true; const before = world.camera.position.clone(); world.moveCamera(.1);
    assert.deepEqual(world.camera.position.toArray(), before.toArray(), 'paused cruise stays still');
  }
});

test('Q/E creates a bounded free depth and later manual, neighboring and cruise navigation preserve that depth', () => {
  const generator = { sample: x => ({ floorY: -20 - (x - 259) * .04, habitat: 'sand' }),
    heightForCamera: x => -20 - (x - 259) * .04 };
  for (const key of ['KeyQ', 'KeyE']) {
    const { world } = fixture({ generator });
    world.setOceanObservationLayer('midwater'); const beforeY = world.camera.position.y;
    world.keys.add(key); world.moveCamera(.1); world.keys.clear();
    assert.equal(world.oceanObservationLayer, 'free');
    assert.ok(key === 'KeyQ' ? world.camera.position.y < beforeY : world.camera.position.y > beforeY);
    const chosenY = world.camera.position.y, depth = world.oceanFreeDepthM;
    assert.equal(depth, 8 - chosenY);
    world.keys.add('KeyD'); world.moveCamera(.1); world.keys.clear();
    assert.ok(Math.abs(world.camera.position.y - chosenY) < 1e-12, 'free manual travel does not follow the changing floor');
    world.travelOcean(1, 0); for (let i = 0; i < 45; i++) world.moveCamera(.1);
    assert.equal(world.oceanObservationLayer, 'free'); assert.equal(world.oceanFreeDepthM, depth);
    assert.ok(Math.abs(world.camera.position.y - chosenY) < 1e-12);
    world.paused = false; world.toggleOceanCruise(); for (let i = 0; i < 10; i++) world.moveCamera(.1);
    assert.ok(Math.abs(world.camera.position.y - chosenY) < 1e-12);
  }
  const { world } = fixture({ generator });
  world.setOceanObservationLayer('surface'); world.keys.add('KeyE');
  for (let i = 0; i < 10; i++) world.moveCamera(.1);
  assert.equal(world.camera.position.y, 7.5); assert.equal(world.oceanFreeDepthM, .5);
  world.keys.clear(); world.camera.position.y = -19.5; world.keys.add('KeyQ'); world.moveCamera(.1);
  assert.ok(world.camera.position.y >= -19.6); assert.equal(world.oceanFreeDepthM, 8 - world.camera.position.y);
});

test('bed defaults retain old manual slope following and automatic support clearance', () => {
  const generator = { sample: x => ({ floorY: -20 + (x - 259) * .1, habitat: 'sand' }),
    heightForCamera: x => -20 + (x - 259) * .1 + 1 };
  const { world } = fixture({ generator });
  world.keys.clear(); world.oceanTravel = null; world.oceanCruising = false; delete world.oceanObservationLayer;
  const before = world.camera.position.clone(); world.keys.add('KeyD'); world.moveCamera(.1);
  const deltaFloor = world.floorY(world.camera.position.x, world.camera.position.z) - world.floorY(before.x, before.z);
  assert.ok(Math.abs(world.camera.position.y - before.y - deltaFloor) < 1e-12);
  world.keys.clear(); world.setOceanObservationLayer('bed'); world.travelOcean(1, 0);
  for (let i = 0; i < 45; i++) world.moveCamera(.1);
  const p = world.oceanWorldPosition();
  assert.ok(Math.abs(p.y - Math.max(world.floorY(p.x, p.z) + 2.8, world.habitatY(p.x, p.z) + .4)) < 1e-9);
  assert.equal(world.oceanObservationLayer, 'bed');
});

test('unready, inactive, invalid layer and invalid coordinates leave all camera and interaction state untouched', () => {
  const unready = fixture(); unready.world.oceanChunks = null;
  const inactive = fixture(); inactive.world.oceanExploring = false;
  const invalid = fixture(); const nan = fixture(); nan.world.camera.position.x = NaN;
  const invalidHeight = fixture(); invalidHeight.world.habitatY = () => NaN;
  for (const [entry, layer] of [[unready, 'surface'], [inactive, 'surface'], [invalid, 'unknown'], [invalid, null],
    [invalid, { id: 'surface' }], [nan, 'surface'], [invalidHeight, 'surface']]) {
    const before = fixedState(entry.world);
    assert.equal(entry.world.setOceanObservationLayer(layer), false);
    assert.deepEqual(fixedState(entry.world), before); assert.equal(entry.calls.length, 0);
  }
});

test('animal and formation observation report free depth; returning to the original reef or reset restores bed mode', async () => {
  const { world, ecologyData } = fixture(); world.setOceanObservationLayer('surface');
  const saved = structuredClone(ecologyData), agent = ecologyData.agents[0];
  const assessment = { position: new THREE.Vector3(270, -13.5, -90), target: new THREE.Vector3(273, -15, -92),
    visibleSamples: 5, totalSamples: 5, centerVisible: true, candidateCount: 20, obstacleMeshes: 1 };
  world.applyFocus(agent, assessment); assert.equal(world.oceanObservationLayer, 'free');
  assert.equal(world.oceanFreeDepthM, null, 'focus has not yet reached its proposed depth'); assert.equal(world.transition.position, assessment.position);
  world.setOceanObservationLayer('surface'); assert.equal(world.focusNearbyOceanFormation(), true);
  assert.equal(world.oceanObservationLayer, 'free'); assert.equal(world.oceanFreeDepthM, 8 - world.camera.position.y);
  assert.deepEqual(ecologyData, saved);
  world.returnToReef(); assert.equal(world.oceanObservationLayer, 'bed'); assert.equal(world.oceanFreeDepthM, null);
  assert.equal(world.oceanExploring, false); assert.deepEqual(world.camera.position.toArray(), [3, 2.8, 5]);
  world.oceanObservationLayer = 'surface'; world.oceanFreeDepthM = 2;
  world.reset('42'); await Promise.resolve();
  assert.equal(world.oceanObservationLayer, 'bed'); assert.equal(world.oceanFreeDepthM, null);
});

test('interrupting an unfinished animal focus freezes actual camera depth when manual, map or cruise navigation starts', () => {
  const generator = { sample: () => ({ floorY: -30, habitat: 'sand' }), heightForCamera: () => -30 };
  for (const action of ['map', 'cruise', 'key']) {
    const { world, ecologyData } = fixture({ generator }); world.setOceanObservationLayer('surface');
    const assessment = { position: new THREE.Vector3(270, -13.5, -90), target: new THREE.Vector3(273, -15, -92),
      visibleSamples: 5, totalSamples: 5, centerVisible: true, candidateCount: 20, obstacleMeshes: 1 };
    world.applyFocus(ecologyData.agents[0], assessment);
    assert.equal(world.camera.position.y, 6.5); assert.equal(world.oceanFreeDepthM, null);
    if(action === 'map') {
      WorldFixture.prototype.select.call(world, null); assert.equal(world.transition, null);
      world.travelOcean(1, 0);
    } else if(action === 'cruise') { world.paused = false; world.toggleOceanCruise(); }
    else world.keys.add('KeyD');
    world.moveCamera(.1);
    assert.equal(world.oceanObservationLayer, 'free'); assert.equal(world.oceanFreeDepthM, 1.5);
    assert.equal(world.camera.position.y, 6.5, `${action} must not use the unreached -13.5m focus proposal`);
    assert.equal(world.following, false); assert.equal(world.transition, null);
  }
});

test('ordinary camera controls release the preset and the next navigation preserves the new actual camera height', () => {
  const generator = { sample: () => ({ floorY: -30, habitat: 'sand' }), heightForCamera: () => -30 };
  for (const action of ['map', 'cruise', 'key']) {
    const { world } = fixture({ generator }); world.setOceanObservationLayer('surface');
    world.oceanTravel = { x: 323, z: -123 }; world.oceanCruising = true;
    world.beginOceanManualObservation();
    assert.equal(world.oceanObservationLayer, 'free'); assert.equal(world.oceanFreeDepthM, null);
    assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    // OrbitControls changes the actual camera during drag/wheel after start.
    world.camera.position.y = -3;
    if(action === 'map') world.travelOcean(1, 0);
    else if(action === 'cruise') { world.paused = false; world.toggleOceanCruise(); }
    else world.keys.add('KeyD');
    world.moveCamera(.1);
    assert.equal(world.oceanFreeDepthM, 11); assert.equal(world.camera.position.y, -3);
    assert.equal(world.oceanObservationLayer, 'free');
  }
  const { world } = fixture({ generator }); world.oceanExploring = false;
  const before = fixedState(world); world.beginOceanManualObservation(); assert.deepEqual(fixedState(world), before);
});

test('the real snapshot reports current layer and the actual water surface shares the existing day/night uniform', () => {
  const { world } = fixture();
  assert.equal(world.oceanSnapshot().observationLayer, 'bed');
  world.setOceanObservationLayer('midwater'); assert.equal(world.oceanSnapshot().observationLayer, 'midwater');
  world.makeSurface();
  assert.equal(world.waterSurface.material.uniforms.daylight, world.waterColors.daylight);
  assert.match(world.waterSurface.material.fragmentShader, /mix\(\.035,1\.,daylight\)/);
  assert.match(world.waterSurface.material.fragmentShader, /vec4\(colour,\.27\*fade\)/);
  world.waterColors.daylight.value = 0;
  assert.equal(world.waterSurface.material.uniforms.daylight.value, 0);
  assert.equal(world.waterSurface.position.y, 8);
  world.waterSurface.geometry.dispose(); world.waterSurface.material.dispose();
});
