import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { oceanOverviewObservation } from '../src/oceanOverview.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createKelpOceanGenerator, KELP_OCEAN_SURFACE_Y } from '../src/kelpOceanGeneration.js';
import { createDeepOceanGenerator, DEEP_OCEAN_SURFACE_Y } from '../src/deepOceanGeneration.js';
import { ReefSimulation } from '../src/simulation.js';
import { KelpSimulation } from '../src/kelpSimulation.js';
import { DeepSimulation } from '../src/deepSimulation.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { deepOceanLayerHeight } from '../src/deepOceanNavigation.js';
import { reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY } from '../src/habitat.js';

const biomes = [
  { biome: 'reef', create: createOceanGenerator, surfaceY: OCEAN_SURFACE_Y, height: 5, distance: 12, targetClearance: 1 },
  { biome: 'kelp', create: createKelpOceanGenerator, surfaceY: KELP_OCEAN_SURFACE_Y, height: 8, distance: 18, targetClearance: 4 },
  { biome: 'deep', create: createDeepOceanGenerator, surfaceY: DEEP_OCEAN_SURFACE_Y, height: 2.5, distance: 7, targetClearance: .2 },
];
const slopeLimit = Math.tan(35 * Math.PI / 180);
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} versus ${expected}`);
const finitePoint = point => ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
function terrainOptions(definition, generator) {
  return { biome: definition.biome, surfaceY: definition.surfaceY,
    floorHeight: (x, z) => generator.floorSurface(x, z).height,
    safeHeight: (x, z) => generator.heightForCamera(x, z) };
}
const flat = { biome: 'reef', surfaceY: 8, floorHeight: () => -10, safeHeight: () => -10 };

test('three actual seeded seas retain world X/Z and clear their triangle floor, solids and water ceiling along a finite route', () => {
  const route = [[131, 5], [259, -123], [-203.1, -84.25], [1000259, -1000123]];
  let checked = 0;
  for (const definition of biomes) for (const seed of [42, '42', 'overview']) {
    const generator = definition.create(seed), duplicate = definition.create(seed);
    const options = terrainOptions(definition, generator), otherOptions = terrainOptions(definition, duplicate);
    const region = structuredClone(generator.chunk(2, 0));
    // Visit in reverse order on the independent generator to challenge cache
    // and load-order dependence without changing any ecological record.
    for (const [x, z] of [...route].reverse()) duplicate.chunk(Math.floor(x / 64), Math.floor(z / 64));
    for (const [x, z] of route) for (const direction of [{ x: 1, z: 0 }, { x: -1, z: 1 }, { x: 0, z: -1 }]) {
      const position = { x, y: -100, z }, before = structuredClone(position);
      const view = oceanOverviewObservation(position, direction, options);
      assert.ok(view, `${definition.biome}/${typeof seed}:${seed} at ${x},${z}`);
      assert.ok(finitePoint(view.position) && finitePoint(view.target));
      assert.equal(view.position.x, x); assert.equal(view.position.z, z);
      assert.ok(view.position.y >= generator.floorSurface(x, z).height + .7 - 1e-8);
      assert.ok(view.position.y >= generator.heightForCamera(x, z) + .7 - 1e-8);
      assert.ok(view.position.y <= definition.surfaceY - .5 + 1e-8);
      close(Math.hypot(view.target.x - x, view.target.z - z), definition.distance, 'forward span');
      const down = view.position.y - view.target.y;
      assert.ok(down >= .5 - 1e-8 && down <= definition.distance * slopeLimit + 1e-8);
      assert.deepEqual(view, oceanOverviewObservation(position, direction, otherOptions));
      assert.deepEqual(position, before);
      checked++;
    }
    assert.deepEqual(generator.chunk(2, 0), region, 'view queries do not alter generated scenery');
  }
  assert.equal(checked, 108);
});

test('the three whole-scene scales show an actual forward bed rather than reuse a fixed authored camera', () => {
  for (const definition of biomes) {
    const view = oceanOverviewObservation({ x: 91, y: 500, z: -72 }, { x: 3, y: -900, z: 4 },
      { ...flat, biome: definition.biome, surfaceY: definition.surfaceY });
    assert.ok(view);
    close(view.position.y, -10 + definition.height);
    close(view.target.x, 91 + definition.distance * .6);
    close(view.target.z, -72 + definition.distance * .8);
    close(view.target.y, -10 + definition.targetClearance);
    assert.deepEqual(Object.keys(view).sort(), ['position', 'target']);
  }
});

test('opposite headings read their own forward terrain and bound steep downward sightlines', () => {
  const options = { ...flat, floorHeight: x => -10 + x * .6 };
  const position = { x: 0, y: -10, z: 0 };
  const east = oceanOverviewObservation(position, { x: 1, z: 0 }, options);
  const west = oceanOverviewObservation(position, { x: -1, z: 0 }, options);
  assert.ok(east && west);
  assert.equal(east.target.x, 12); assert.equal(west.target.x, -12);
  close(east.target.y, -5.5, 'rising terrain does not turn the overview upward');
  close(west.target.y, -5 - 12 * slopeLimit, 'deep forward bed does not create a top-down view');
  assert.ok(east.target.y > west.target.y);
  assert.deepEqual(east.position, west.position);
});

test('solid clearance takes precedence over preferred height and a closed water column is refused', () => {
  const position = { x: 8, y: -10, z: -8 }, direction = { x: 0, z: -1 };
  const raised = oceanOverviewObservation(position, direction, { ...flat, safeHeight: () => 6.6 });
  assert.ok(raised); close(raised.position.y, 7.3);
  const shallow = oceanOverviewObservation(position, direction, { ...flat, floorHeight: () => 6.7, safeHeight: () => 6.7 });
  assert.ok(shallow); close(shallow.position.y, 7.5, 'preferred height clips at the submerged ceiling');
  assert.equal(oceanOverviewObservation(position, direction, { ...flat, safeHeight: () => 6.81 }), null);
  assert.equal(oceanOverviewObservation(position, direction, { ...flat, floorHeight: () => 7 }), null);
});

test('horizontal headings normalize finite extreme magnitudes and a vertical view has a stable forward fallback', () => {
  const position = { x: 1000259, y: -10, z: -1000123 };
  const ordinary = oceanOverviewObservation(position, { x: 1, y: 0, z: 1 }, flat);
  for (const direction of [{ x: Number.MAX_VALUE, y: Infinity, z: Number.MAX_VALUE },
    { x: Number.MIN_VALUE, y: NaN, z: Number.MIN_VALUE }, { x: 20, y: -999, z: 20 }]) {
    assert.deepEqual(oceanOverviewObservation(position, direction, flat), ordinary);
  }
  const fallback = oceanOverviewObservation(position, { x: 0, y: 1, z: 0 }, flat);
  assert.ok(fallback); assert.equal(fallback.target.x, position.x); assert.equal(fallback.target.z, position.z - 12);
  assert.equal(oceanOverviewObservation({ ...position, x: Number.MAX_VALUE, z: Number.MAX_VALUE }, { x: 1, z: 1 }, flat), null,
    'unrepresentable forward travel must not publish a degenerate view');
});

test('invalid poses, unsupported seas and failed current or forward terrain queries return null without mutation', () => {
  const position = { x: 8, y: -10, z: -8 }, direction = { x: 1, z: 0 };
  const cases = [
    [null, direction, flat], [{ ...position, x: NaN }, direction, flat], [{ ...position, y: Infinity }, direction, flat],
    [position, null, flat], [position, { x: Infinity, z: 0 }, flat], [position, { x: 1, z: NaN }, flat],
    [position, direction, null], [position, direction, { ...flat, biome: 'unknown' }],
    [position, direction, { ...flat, surfaceY: NaN }], [position, direction, { ...flat, safeHeight: null }],
    [position, direction, { ...flat, floorHeight: () => NaN }], [position, direction, { ...flat, safeHeight: () => Infinity }],
    [position, direction, { ...flat, safeHeight() { throw new Error('support read failed'); } }],
    [position, direction, { ...flat, floorHeight(x) { if (x !== position.x) throw new Error('forward read failed'); return -10; } }],
    [position, direction, { ...flat, floorHeight: x => x === position.x ? -10 : NaN }],
  ];
  const original = structuredClone({ position, direction });
  for (const args of cases) assert.equal(oceanOverviewObservation(...args), null);
  assert.deepEqual({ position, direction }, original);
});

test('an overview performs only bounded current-support and single forward-floor reads', () => {
  const queries = [], position = { x: -65, y: -100, z: 64 };
  const view = oceanOverviewObservation(position, { x: 0, z: 1 }, { ...flat,
    floorHeight(x, z) { queries.push(['floor', x, z]); return -10; },
    safeHeight(x, z) { queries.push(['solid', x, z]); return -9; } });
  assert.ok(view);
  assert.deepEqual(queries, [['floor', -65, 64], ['solid', -65, 64], ['floor', -65, 76]]);
  assert.equal(position.y, -100, 'view placement never mutates the observer input');
});

// Execute shipped World actions with real OrbitControls and generators. This
// omits WebGL construction, not the production camera or clearance methods.
const worldSource = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function worldMethod(name) {
  const start = worldSource.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `World method ${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(worldSource.slice(start + 2));
  return worldSource.slice(start, next ? start + 2 + next.index : worldSource.lastIndexOf('\n}'));
}
const WorldFixture = new Function('THREE', 'clamp', 'oceanOverviewObservation', 'oceanLayerHeight', 'deepOceanLayerHeight',
  'reefRockFootprintContains', 'reefRockCanonicalCoordinates', 'reefRockSurfaceY',
  `return class {${['floorY', 'habitatY', 'select', 'oceanWorldPosition', 'oceanLayerY', 'setOceanOverview',
    'setOceanRenderOrigin', 'startOceanExploration', 'clearCameraPosition', 'enforceCameraClearance'].map(worldMethod).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, oceanOverviewObservation, oceanLayerHeight, deepOceanLayerHeight,
  reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY);
const nativeClasses = { reef: ReefSimulation, kelp: KelpSimulation, deep: DeepSimulation };
const serialNative = sim => ({ state: JSON.parse(JSON.stringify(sim, (_key, value) => value instanceof Map ? [...value] : value)),
  metrics: structuredClone(sim.metrics), resources: structuredClone(sim.resources) });
function worldFixture({ definition = biomes[0], x = 259, z = -123, origin = { x: 256, z: -128 }, generator = definition.create('42') } = {}) {
  const calls = [], camera = new THREE.PerspectiveCamera(49, 1, .01, 123);
  camera.position.set(x - origin.x, generator.floorSurface(x, z).height + 3, z - origin.z);
  const controls = new OrbitControls(camera);
  controls.minDistance = definition.biome === 'deep' ? .11 : .18;
  controls.maxDistance = definition.biome === 'deep' ? 14 : 30;
  controls.minPolarAngle = Math.PI * .15; controls.maxPolarAngle = Math.PI * .55;
  controls.enableDamping = true; controls.dampingFactor = .065;
  controls.target.copy(camera.position).add(new THREE.Vector3(3, -2, 4)); controls.update();
  const sim = new nativeClasses[definition.biome]('42'); sim.step(.3);
  const ecologyData = { regions: [{ id: '4,-2', timeSec: 350.2,
    resources: { algae: .6, biofilm: .3, detritus: .2, smallPrey: .4, kelpTissue: .8, kelpDrift: .00001 },
    ledger: { initial: 2.4, input: .1, ingested: .19999, exported: 0 },
    driftCommunityVersion: 1, driftLedger: { transferredIn: .00003, ingested: .00002, returnedToDetritus: 0 },
    driftPatches: [{ id: 'saved-food', stock: .00001, hostId: 'saved-host', lastTransfer: { timeSec: 350.2, transferredUnits: .00003 } }],
    _rngState: 371781, _ticks: 3502 }],
    agents: [{ id: 'live', regionId: '4,-2', speciesId: 'blue-rockfish', alive: true, state: 'schooling',
      position: { x: 273, y: -15, z: -92 }, mobileTimeSec: 812.4, birthRegionId: '3,-2', groupId: 'existing-school', energy: .87, lastFeedAt: 800.2 },
    { id: 'dead', regionId: '4,-2', speciesId: 'purple-urchin', alive: false, state: 'dead',
      position: { x: 274, y: -15, z: -93 }, diedAt: 211.7, energy: 0 }],
    events: [{ type: 'feeding', timeSec: 340.2, agentId: 'live' }] };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    camera, controls, biomeId: definition.biome, surfaceY: definition.surfaceY,
    isKelp: definition.biome === 'kelp', isDeep: definition.biome === 'deep',
    oceanRenderOrigin: { ...origin }, oceanExploring: true, oceanObservationLayer: 'bed', oceanFreeDepthM: 3,
    oceanTravel: { x: x + 64, z }, oceanCruising: true, following: true,
    transition: { agentId: 'live', position: new THREE.Vector3(2, 3, 4), target: new THREE.Vector3(4, 3, 2) },
    followOffsetY: 2, lastFocusAssessment: { agentId: 'live', visibleSamples: 5 },
    keys: new Set(['KeyW', 'ShiftLeft']), selectedId: 'live', highlight: { visible: true, position: new THREE.Vector3() },
    reefRoot: new THREE.Group(), cameraRocks: [], paused: true, speed: 12, disposed: false, oceanEcologyResetting: false, sim,
    oceanEcology: { data: ecologyData, step() { throw new Error('overview must not step ecology'); },
      reset() { throw new Error('overview must not reset ecology'); }, checkpoint() { throw new Error('overview must not save ecology'); } },
    oceanChunks: { generator, update() { calls.push(['chunks']); }, setRenderOrigin(value) { calls.push(['chunk-origin', value]); } },
    oceanAnimals: { setObservationAgent(id) { calls.push(['observation', id]); }, setRenderOrigin(value) { calls.push(['animal-origin', value]); } },
    requestOceanEcology() { calls.push(['ecology-request']); }, onSelect(id) { calls.push(['onSelect', id]); },
    emitSnapshot(force) { calls.push(['snapshot', force]); },
  });
  return { world, calls, ecologyData };
}
function fixedWorld(world) {
  return { position: world.camera.position.toArray(), target: world.controls.target.toArray(), quaternion: world.camera.quaternion.toArray(),
    far: world.camera.far, origin: { ...world.oceanRenderOrigin }, layer: world.oceanObservationLayer, freeDepthM: world.oceanFreeDepthM,
    travel: structuredClone(world.oceanTravel), cruising: world.oceanCruising, following: world.following,
    transition: structuredClone(world.transition), followOffsetY: world.followOffsetY, assessment: structuredClone(world.lastFocusAssessment),
    keys: [...world.keys], selectedId: world.selectedId, highlight: { visible: world.highlight.visible, position: world.highlight.position.toArray() },
    damping: world.controls.enableDamping, paused: world.paused, speed: world.speed, exploring: world.oceanExploring,
    sim: serialNative(world.sim), ecology: structuredClone(world.oceanEcology.data) };
}
function closePoint(actual, expected, label) {
  for (const axis of ['x', 'y', 'z']) close(actual[axis], expected[axis], `${label} ${axis}`);
}

test('actual World overview retains logical position and heading through rebasing and preserves complete model records', () => {
  for (const definition of biomes) for (const origin of [{ x: 0, z: 0 }, { x: 256, z: -128 }, { x: -640, z: 896 }]) {
    const { world, calls, ecologyData } = worldFixture({ definition, origin });
    const native = serialNative(world.sim), regional = structuredClone(ecologyData), ecology = world.oceanEcology;
    const originalPosition = world.oceanWorldPosition(), direction = world.camera.getWorldDirection(new THREE.Vector3());
    const expected = oceanOverviewObservation(originalPosition, direction, terrainOptions(definition, world.oceanChunks.generator));
    assert.ok(expected); assert.equal(world.setOceanOverview(), true);
    closePoint(world.oceanWorldPosition(), expected.position, 'actual logical camera');
    closePoint(world.controls.target.clone().add(new THREE.Vector3(origin.x, 0, origin.z)), expected.target, 'logical target');
    assert.deepEqual(world.oceanRenderOrigin, origin); assert.equal(world.camera.far, 123);
    assert.equal(world.oceanObservationLayer, 'free'); close(world.oceanFreeDepthM, world.surfaceY - expected.position.y);
    assert.equal(world.oceanExploring, true); assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    assert.equal(world.following, false); assert.equal(world.transition, null); assert.equal(world.followOffsetY, 0);
    assert.equal(world.lastFocusAssessment, null); assert.equal(world.selectedId, null); assert.equal(world.highlight.visible, false);
    assert.equal(world.keys.size, 0); assert.equal(world.paused, true); assert.equal(world.speed, 12);
    assert.equal(world.oceanEcology, ecology); assert.deepEqual(ecologyData, regional); assert.deepEqual(serialNative(world.sim), native);
    assert.equal(calls.some(call => ['chunks', 'chunk-origin', 'animal-origin', 'ecology-request'].includes(call[0])), false,
      'same-position overview never initiates region load or replacement');
    assert.deepEqual(calls.filter(call => call[0] === 'observation'), [['observation', null]]);
    assert.deepEqual(calls.filter(call => call[0] === 'onSelect'), [['onSelect', null]]);
  }
});

test('pending actual OrbitControls damping is settled and later frames cannot slide the whole-scene view', () => {
  for (const definition of biomes) {
    const { world } = worldFixture({ definition });
    world.controls.rotateLeft(.9); world.controls.rotateUp(.2);
    const native = serialNative(world.sim), regional = structuredClone(world.oceanEcology.data), xz = world.oceanWorldPosition();
    assert.equal(world.setOceanOverview(), true);
    close(world.oceanWorldPosition().x, xz.x); close(world.oceanWorldPosition().z, xz.z);
    const position = world.camera.position.clone(), target = world.controls.target.clone();
    for (let frame = 0; frame < 60; frame++) { world.controls.update(); world.enforceCameraClearance(); }
    closePoint(world.camera.position, position, 'stable camera'); closePoint(world.controls.target, target, 'stable target');
    assert.equal(world.controls.enableDamping, true); assert.deepEqual(serialNative(world.sim), native);
    assert.deepEqual(world.oceanEcology.data, regional);
  }
});

test('unready World or failed terrain rejects the overview before clearing observation or changing any state', () => {
  const mutations = [world => { world.oceanChunks = null; }, world => { world.oceanExploring = false; },
    world => { world.disposed = true; }, world => { world.biomeId = 'unknown'; },
    world => { world.floorY = () => NaN; }, world => { world.habitatY = () => Infinity; },
    world => { world.floorY = () => { throw new Error('terrain unavailable'); }; },
    world => { world.habitatY = () => world.surfaceY; }];
  for (const mutate of mutations) {
    const { world, calls } = worldFixture(); mutate(world);
    const before = fixedWorld(world);
    assert.equal(world.setOceanOverview(), false); assert.deepEqual(fixedWorld(world), before); assert.deepEqual(calls, []);
  }
});

test('the existing start-exploration action keeps its old near-bed height and target instead of silently becoming overview', () => {
  for (const definition of biomes) {
    const { world, calls } = worldFixture({ definition });
    world.oceanExploring = false; world.controls.enableDamping = false;
    const p = world.oceanWorldPosition(), native = serialNative(world.sim), regional = structuredClone(world.oceanEcology.data);
    const expectedY = world.isDeep ? world.oceanLayerY(p.x, p.z, 'bed') : Math.max(p.y, world.habitatY(p.x, p.z) + 2.4);
    world.startOceanExploration();
    closePoint(world.oceanWorldPosition(), { x: p.x, y: expectedY, z: p.z }, 'original exploration placement');
    close(Math.hypot(world.controls.target.x - world.camera.position.x, world.controls.target.z - world.camera.position.z), 8);
    close(world.controls.target.y - world.camera.position.y, -2.4);
    assert.equal(world.oceanObservationLayer, 'bed'); assert.equal(world.oceanExploring, true);
    assert.deepEqual(serialNative(world.sim), native); assert.deepEqual(world.oceanEcology.data, regional);
    assert.equal(calls.some(call => ['chunks', 'ecology-request'].includes(call[0])), false);
  }
});

test('actual UI routes exploration-wide to the local overview and reserves authored return for the explicit home action', () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const extract = (startText, endText) => {
    const start = app.indexOf(startText), end = app.indexOf(endText, start);
    assert.ok(start >= 0 && end > start, 'actual UI handler exists');
    return app.slice(start + startText.indexOf('=') + 1, end).trim().replace(/;$/, '');
  };
  const cameraCode = extract('setCamera=v=>{', '\n  const explore=');
  const startCode = extract('const startOcean=()=>{', '\n  const returnReef=');
  const homeCode = extract('const returnReef=()=>{', '\n  const returnObservation=');
  const calls = [], state = { current: { oceanExploring: true,
    setOceanOverview() { calls.push(['overview']); return true; }, startOceanExploration() { calls.push(['start']); },
    setView(value) { calls.push(['authored-view', value]); }, select(id) { calls.push(['select', id]); },
    returnToReef() { calls.push(['home']); } } };
  const bind = code => new Function('world', 'setToast', 'setView', 'setSelected', 'setObservationId', 'setExplorationIndex',
    'rememberOcean', 'setPanel', 'setHelp', `return ${code}`)(state,
    value => calls.push(['toast', value]), value => calls.push(['view', value]), value => calls.push(['selected', value]),
    value => calls.push(['observation', value]), value => calls.push(['exploration', value]),
    () => calls.push(['remember']), value => calls.push(['panel', value]), value => calls.push(['help', value]));
  const setCamera = bind(cameraCode), startOcean = bind(startCode), home = bind(homeCode);
  setCamera('wide');
  assert.deepEqual(calls, [['overview'], ['view', 'wide'], ['selected', null], ['observation', null], ['exploration', null], ['remember']]);
  calls.length = 0; startOcean();
  assert.deepEqual(calls.filter(call => ['start', 'overview', 'view'].includes(call[0])), [['start'], ['overview'], ['view', 'wide']]);
  assert.equal(calls.some(call => call[0] === 'home' || call[0] === 'authored-view'), false);
  calls.length = 0; home(); assert.equal(calls.at(-1)[0], 'home');
  calls.length = 0; state.current.oceanExploring = false; setCamera('wide');
  assert.equal(calls.some(call => call[0] === 'overview'), false); assert.deepEqual(calls.at(-1), ['authored-view', 'wide']);
  calls.length = 0; state.current.oceanExploring = true; state.current.setOceanOverview = () => { calls.push(['overview']); return false; };
  setCamera('wide');
  assert.equal(calls.length, 2); assert.equal(calls[1][0], 'toast');
  assert.equal(calls.some(call => ['view', 'selected', 'home', 'authored-view'].includes(call[0])), false);
});
