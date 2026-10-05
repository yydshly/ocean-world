import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY } from '../src/habitat.js';

// Run the real World observation methods and OrbitControls without creating a
// WebGL world. Fixtures retain full live/dead ecological records for comparison.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `World method ${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const methods = ['oceanWorldPosition', 'captureOceanObservation', 'restoreOceanObservation',
  'oceanLayerY', 'setOceanRenderOrigin', 'clearCameraPosition', 'enforceCameraClearance'];
const WorldFixture = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight',
  'reefRockFootprintContains', 'reefRockCanonicalCoordinates', 'reefRockSurfaceY',
  `return class {${methods.map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp,
  normalizeOceanObservationView, oceanLayerHeight, reefRockFootprintContains,
  reefRockCanonicalCoordinates, reefRockSurfaceY);

const flatGenerator = { sample: () => ({ floorY: -20, habitat: 'sand' }), heightForCamera: () => -20 };
function fixture({ origin = { x: 256, z: -128 }, generator = flatGenerator } = {}) {
  const calls = [], camera = new THREE.PerspectiveCamera();
  camera.position.set(259 - origin.x, -10, -123 - origin.z);
  const controls = new OrbitControls(camera);
  controls.target.copy(camera.position).add(new THREE.Vector3(-4, -2, -8));
  controls.minDistance = .18; controls.maxDistance = 30;
  controls.minPolarAngle = Math.PI * .15; controls.maxPolarAngle = Math.PI * .55;
  controls.enableDamping = true; controls.dampingFactor = .065; controls.update();
  const ecologyData = { regions: [{ id: '4,-2', timeSec: 350.2, resources: { algae: .6, plankton: .4 },
    ledger: { ingested: .03, detritusReturned: .007 }, slopeCommunityVersion: 1, mantaEverOccupied: true }],
    agents: [{ id: 'live', regionId: '4,-2', speciesId: 'reef-manta', alive: true,
      position: { x: 273, y: -15, z: -92 }, mobileTimeSec: 812.4, birthRegionId: '3,-2',
      avoidance: { headingRad: 1.2, untilSec: 819.4 }, lastFeedAt: 800.2, energy: .87 },
    { id: 'dead', regionId: '4,-2', speciesId: 'blue-starfish', alive: false,
      position: { x: 274, y: -15, z: -93 }, diedAt: 211.7, energy: 0 }] };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    camera, controls, surfaceY: 8, oceanRenderOrigin: { ...origin }, oceanExploring: true,
    oceanObservationLayer: 'bed', oceanFreeDepthM: 3,
    oceanTravel: { x: 323, z: -123 }, oceanCruising: true, following: true,
    transition: { agentId: 'live', position: new THREE.Vector3(2, 3, 4), target: new THREE.Vector3(4, 3, 2) },
    followOffsetY: 2, lastFocusAssessment: { agentId: 'live', visibleSamples: 5 },
    keys: new Set(['KeyW', 'ShiftLeft']), selectedId: 'live', highlight: { visible: true, position: new THREE.Vector3() },
    reefRoot: new THREE.Group(), cameraRocks: [], isKelp: false, isDeep: false,
    paused: true, speed: 12, disposed: false, oceanEcologyResetting: false,
    sim: { seed: '42', metrics: { timeSec: 800.2 }, environment: { hour: 10, currentMps: .15, turbidity: .25 } },
    oceanEcology: { data: ecologyData },
    oceanChunks: { generator, update(position) { calls.push(['chunks', ...position.toArray()]); },
      setRenderOrigin(value) { calls.push(['chunk-origin', { ...value }]); } },
    oceanAnimals: { setRenderOrigin(value) { calls.push(['animal-origin', { ...value }]); } },
    floorY: (x, z) => generator.sample(x, z).floorY,
    habitatY: (x, z) => generator.heightForCamera(x, z),
    requestOceanEcology(position) { calls.push(['ecology-request', ...position.toArray()]); },
    onSelect(id) { calls.push(['onSelect', id]); }, emitSnapshot(force) { calls.push(['snapshot', force]); },
  });
  return { world, calls, ecologyData };
}
function view(x = 259, z = -123, y = -10, layer = 'bed') {
  return { position: { x, y, z }, target: { x: x - 4, y: y - 2, z: z - 8 },
    layer, freeDepthM: Math.max(0, 8 - y), habitat: 'sand' };
}
function unchanged(world) {
  return { position: world.camera.position.toArray(), target: world.controls.target.toArray(),
    origin: { ...world.oceanRenderOrigin }, layer: world.oceanObservationLayer, freeDepthM: world.oceanFreeDepthM,
    travel: structuredClone(world.oceanTravel), cruising: world.oceanCruising, following: world.following,
    transition: structuredClone(world.transition), followOffsetY: world.followOffsetY,
    assessment: structuredClone(world.lastFocusAssessment), keys: [...world.keys], selectedId: world.selectedId,
    highlight: { visible: world.highlight.visible, position: world.highlight.position.toArray() },
    reefRoot: world.reefRoot.position.toArray(), damping: world.controls.enableDamping,
    sim: structuredClone(world.sim), ecology: structuredClone(world.oceanEcology.data),
    paused: world.paused, speed: world.speed, exploring: world.oceanExploring };
}
function closeVector(actual, expected, message) {
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 1e-8, `${message}: axis ${i}`);
}

test('capture stores actual logical view and depth across floating origins, with no ecological or elapsed state', () => {
  for (const origin of [{ x: 0, z: 0 }, { x: 256, z: -128 }, { x: -640, z: 896 }]) {
    const { world, calls } = fixture({ origin });
    world.oceanObservationLayer = 'free'; world.oceanFreeDepthM = 3;
    const before = unchanged(world), saved = world.captureOceanObservation();
    closeVector(Object.values(saved.position), [259, -10, -123], 'saved logical position');
    closeVector(Object.values(saved.target), [255, -12, -131], 'saved logical target');
    assert.ok(Math.abs(saved.freeDepthM - 18) < 1e-8, 'use actual position rather than stale free-depth state');
    assert.equal(saved.layer, 'free'); assert.equal(saved.habitat, 'sand');
    assert.deepEqual(Object.keys(saved).sort(), ['freeDepthM', 'habitat', 'layer', 'position', 'target']);
    assert.deepEqual(unchanged(world), before); assert.equal(calls.length, 0);
  }
  const { world } = fixture(); world.oceanExploring = false;
  assert.equal(world.captureOceanObservation(), null);
  world.oceanExploring = true; world.disposed = true; assert.equal(world.captureOceanObservation(), null);
});

test('return restores saved height rather than recomputing the named navigation layer and preserves complete model records', () => {
  for (const layer of ['bed', 'midwater', 'surface', 'free']) {
    const { world, calls, ecologyData } = fixture(), model = structuredClone(world.sim), ecology = structuredClone(ecologyData);
    const previousEcology = world.oceanEcology;
    assert.equal(world.restoreOceanObservation(view(453, -277, -8, layer)), true);
    closeVector(world.oceanWorldPosition().toArray(), [453, -8, -277], 'restored actual height');
    closeVector(world.controls.target.clone().add(new THREE.Vector3(448, 0, -256)).toArray(), [449, -10, -285], 'restored target');
    assert.deepEqual(world.oceanRenderOrigin, { x: 448, z: -256 });
    assert.equal(world.oceanObservationLayer, layer);
    if(layer === 'free')assert.ok(Math.abs(world.oceanFreeDepthM - 16) < 1e-8);else assert.equal(world.oceanFreeDepthM, null);
    assert.equal(world.oceanExploring, true); assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    assert.equal(world.following, false); assert.equal(world.transition, null); assert.equal(world.followOffsetY, 0);
    assert.equal(world.lastFocusAssessment, null); assert.equal(world.selectedId, null);
    assert.equal(world.highlight.visible, false); assert.equal(world.keys.size, 0);
    assert.equal(world.paused, true); assert.equal(world.speed, 12); assert.equal(world.controls.enableDamping, true);
    assert.equal(world.oceanEcology, previousEcology); assert.deepEqual(ecologyData, ecology); assert.deepEqual(world.sim, model);
    const published = calls.filter(call => ['chunks', 'ecology-request', 'onSelect', 'snapshot'].includes(call[0]));
    assert.deepEqual(published.map(call => call[0]), ['chunks', 'ecology-request', 'onSelect', 'snapshot']);
    closeVector(published[0].slice(1), [453, -8, -277], 'loaded destination');
    closeVector(published[1].slice(1), [453, -8, -277], 'requested ecology destination');
    assert.deepEqual(published.slice(2), [['onSelect', null], ['snapshot', true]]);
  }
});

test('actual seeded destinations at positive and negative million-metre coordinates return independently of previous rendering origin', () => {
  const generator = createOceanGenerator('42');
  for (const [x, z] of [[259, -123], [-259, 123], [1000259, -1000123], [-1000259, 1000123]]) {
    const wanted = view(x, z, 5, 'free');
    const plain = fixture({ origin: { x: 0, z: 0 }, generator }), shifted = fixture({ origin: { x: -576, z: 704 }, generator });
    assert.equal(plain.world.restoreOceanObservation(wanted), true); assert.equal(shifted.world.restoreOceanObservation(wanted), true);
    closeVector(plain.world.oceanWorldPosition().toArray(), [x, 5, z], 'logical destination');
    closeVector(shifted.world.oceanWorldPosition().toArray(), plain.world.oceanWorldPosition().toArray(), 'origin independence');
    assert.deepEqual(shifted.world.oceanRenderOrigin, plain.world.oceanRenderOrigin);
    assert.ok(Math.abs(shifted.world.camera.position.x) <= 32 && Math.abs(shifted.world.camera.position.z) <= 32);
    const restored = shifted.world.captureOceanObservation();
    assert.equal(restored.habitat, generator.sample(x, z).habitat, 'capture reads current actual habitat');
    assert.equal(restored.freeDepthM, 3);
  }
});

test('safe vertical placement shifts the saved target equally and retains viewing direction', () => {
  for (const wanted of [view(453, -277, -99, 'free'), { ...view(453, -277, 100, 'surface'), freeDepthM: 0 }]) {
    const { world } = fixture(); assert.equal(world.restoreOceanObservation(wanted), true);
    const expectedY = wanted.position.y < 0 ? -19.6 : 7.5;
    closeVector(world.oceanWorldPosition().toArray(), [453, expectedY, -277], 'safe placement');
    closeVector(world.controls.target.clone().sub(world.camera.position).toArray(), [-4, -2, -8], 'unchanged viewing direction');
    const saved = world.captureOceanObservation(); assert.equal(saved.freeDepthM, 8 - expectedY);
  }
});

test('the actual authored rock guard adjusts a stored camera without losing its logical sightline', () => {
  const { world } = fixture({ origin: { x: 256, z: -128 } });
  world.cameraRocks = [{ rock: [-4.2, .58, -1.4, 2.2, .9, 1.7], bedSupported: true }];
  const wanted = view(-4.2, -1.4, .58, 'free');
  assert.equal(world.restoreOceanObservation(wanted), true);
  const actual = world.oceanWorldPosition(); assert.ok(actual.y > wanted.position.y);
  closeVector(world.controls.target.clone().sub(world.camera.position).toArray(), [-4, -2, -8], 'guard preserves sightline');
  const before = actual.clone(); world.enforceCameraClearance();
  closeVector(world.oceanWorldPosition().toArray(), before.toArray(), 'guarded placement remains stable');
});

test('restoring with pending real OrbitControls damping does not slide on later updates', () => {
  const { world } = fixture(); world.controls.rotateLeft(.9); world.controls.rotateUp(.2);
  assert.equal(world.restoreOceanObservation(view(453, -277, -8)), true);
  const position = world.camera.position.clone(), target = world.controls.target.clone();
  for (let i = 0; i < 60; i++) { world.controls.update(); world.enforceCameraClearance(); }
  closeVector(world.camera.position.toArray(), position.toArray(), 'no position slide');
  closeVector(world.controls.target.toArray(), target.toArray(), 'no target slide');
  assert.equal(world.controls.enableDamping, true);
});

test('views outside existing orbit angle and distance limits adjust the sightline without moving the saved camera', () => {
  for (const target of [{ x: 453, y: 992, z: -277 }, { x: 453, y: -1008, z: -277 },
    { x: 453.00001, y: -8, z: -277 }]) {
    const { world } = fixture(), wanted = { ...view(453, -277, -8), target };
    assert.equal(world.restoreOceanObservation(wanted), true);
    closeVector(world.oceanWorldPosition().toArray(), [453, -8, -277], 'limited view keeps position');
    const offset = world.camera.position.clone().sub(world.controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
    assert.ok(spherical.radius >= world.controls.minDistance - 1e-8 && spherical.radius <= world.controls.maxDistance + 1e-8);
    assert.ok(spherical.phi >= world.controls.minPolarAngle - 1e-8 && spherical.phi <= world.controls.maxPolarAngle + 1e-8);
    for (let i = 0; i < 60; i++) world.controls.update();
    closeVector(world.oceanWorldPosition().toArray(), [453, -8, -277], 'later updates keep position');
  }
});

test('unsupported, malformed, unrepresentable and unready views leave all observation and ecology state unchanged', () => {
  const cases = [null, { ...view(), layer: 'unknown' }, { ...view(), position: { x: NaN, y: -10, z: 0 } },
    { ...view(), target: { x: 1, y: Infinity, z: 0 } }, { ...view(), position: { x: Number.MAX_VALUE, y: 1, z: 0 } },
    { ...view(), target: { ...view().position } }, { ...view(), freeDepthM: -1 }];
  for (const wanted of cases) {
    const { world, calls } = fixture(), before = unchanged(world);
    assert.equal(world.restoreOceanObservation(wanted), false); assert.deepEqual(unchanged(world), before); assert.equal(calls.length, 0);
  }
  for (const flag of ['disposed', 'oceanEcologyResetting']) {
    const { world, calls } = fixture(); world[flag] = true; const before = unchanged(world);
    assert.equal(world.restoreOceanObservation(view()), false); assert.deepEqual(unchanged(world), before); assert.equal(calls.length, 0);
  }
  const { world, calls } = fixture(); world.oceanChunks = null; const before = unchanged(world);
  assert.equal(world.restoreOceanObservation(view()), false); assert.deepEqual(unchanged(world), before); assert.equal(calls.length, 0);
});

test('invalid terrain queries and a blocked water column reject returns before publishing any mutation', () => {
  for (const generator of [{ sample: () => ({ floorY: NaN, habitat: 'sand' }), heightForCamera: () => -20 },
    { sample() { throw new Error('bad terrain'); }, heightForCamera: () => -20 },
    { sample: () => ({ floorY: 8, habitat: 'sand' }), heightForCamera: () => 8 }]) {
    const { world, calls } = fixture({ generator }), before = unchanged(world);
    assert.equal(world.restoreOceanObservation(view()), false); assert.deepEqual(unchanged(world), before); assert.equal(calls.length, 0);
  }
});
