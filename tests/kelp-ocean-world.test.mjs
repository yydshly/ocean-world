import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createKelpOceanGenerator, KELP_OCEAN_SURFACE_Y } from '../src/kelpOceanGeneration.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanCommunityReading } from '../src/oceanCommunityReading.js';
import { normalizeOceanObservationView, oceanObservationView, createOceanExplorationMemory } from '../src/oceanExplorationMemory.js';
import { reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY } from '../src/habitat.js';

// Execute the existing World methods with real CPU terrain and OrbitControls.
// No WebGL constructor, replacement movement, or ecological ticking is needed.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `World method ${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const methods = ['floorY', 'habitatY', 'select', 'oceanWorldPosition', 'oceanLayerY',
  'captureOceanObservation', 'restoreOceanObservation', 'captureOceanFreeDepth',
  'setOceanObservationLayer', 'setOceanRenderOrigin', 'startOceanExploration',
  'travelOcean', 'toggleOceanCruise', 'moveCamera', 'clearCameraPosition',
  'enforceCameraClearance', 'oceanSnapshot', 'makeSurface', 'enterKelpForestBelt', 'travelKelpForestBelt'];
const WorldFixture = new Function('THREE', 'clamp', 'oceanLayerHeight', 'normalizeOceanObservationView',
  'oceanCommunityReading', 'reefRockFootprintContains', 'reefRockCanonicalCoordinates', 'reefRockSurfaceY',
  `return class {${methods.map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp,
  oceanLayerHeight, normalizeOceanObservationView, oceanCommunityReading,
  reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY);

function fixture({ biome = 'kelp', x = 259, z = -123, y = 3, origin = { x: 256, z: -128 } } = {}) {
  const generator = biome === 'kelp' ? createKelpOceanGenerator('42') : createOceanGenerator('42');
  const camera = new THREE.PerspectiveCamera(), calls = [];
  camera.position.set(x - origin.x, y, z - origin.z);
  const controls = new OrbitControls(camera);
  controls.target.copy(camera.position).add(new THREE.Vector3(-4, -2, -8));
  controls.minDistance = .18; controls.maxDistance = 30;
  controls.minPolarAngle = Math.PI * .15; controls.maxPolarAngle = Math.PI * .55;
  controls.enableDamping = true; controls.dampingFactor = .065; controls.update();
  const ecologyData = {
    regions: [{ id: '4,-2', timeSec: 350.2, resources: { algae: .6, plankton: .4, detritus: .2 },
      ledger: { initial: 1.3, input: .1, ingested: .1, exported: .1 } }],
    agents: [{ id: 'live', regionId: '4,-2', speciesId: 'giant-kelpfish', alive: true,
      position: { x: 273, y: -2, z: -92 }, lastFeedAt: 340.2, energy: .87 },
    { id: 'dead', regionId: '4,-2', speciesId: 'bat-star', alive: false,
      position: { x: 274, y: -3, z: -93 }, diedAt: 211.7, energy: 0 }], events: [], metrics: { activeRegions: 1 },
  };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    biomeId: biome, isKelp: biome === 'kelp', isDeep: false,
    surfaceY: biome === 'kelp' ? KELP_OCEAN_SURFACE_Y : OCEAN_SURFACE_Y,
    scene: new THREE.Scene(), camera, controls, oceanRenderOrigin: { ...origin }, oceanExploring: true,
    oceanObservationLayer: 'bed', oceanFreeDepthM: 1, oceanTravel: { x: x + 64, z }, oceanCruising: true,
    following: true, transition: { agentId: 'live', position: new THREE.Vector3(2, 3, 4), target: new THREE.Vector3(4, 3, 2) },
    followOffsetY: 2, lastFocusAssessment: { agentId: 'live' }, selectedId: 'live', keys: new Set(['KeyW']),
    highlight: { visible: true, position: new THREE.Vector3() }, reefRoot: new THREE.Group(), cameraRocks: [],
    paused: true, speed: 12, disposed: false, oceanEcologyResetting: false,
    sim: { seed: '42', metrics: { timeSec: 800.2 }, environment: { hour: 10, currentMps: .18, turbidity: .35 } },
    oceanChunks: { generator, stats: { activeChunks: 9 },
      update(position) { calls.push(['chunks', ...position.toArray()]); },
      setRenderOrigin(value) { calls.push(['chunk-origin', { ...value }]); } },
    oceanEcology: { data: ecologyData, snapshot: () => ecologyData },
    oceanAnimals: { stats: {}, setRenderOrigin(value) { calls.push(['animal-origin', { ...value }]); } },
    catalog: new Map(), errors: [], surfaceTime: { value: 0 }, waterColors: { daylight: { value: 1 } },
    ownGeometry: value => value, ownMaterial: value => value,
    requestOceanEcology(position) { calls.push(['ecology-request', ...position.toArray()]); },
    onSelect(id) { calls.push(['onSelect', id]); }, emitSnapshot(force) { calls.push(['snapshot', force]); },
  });
  return { world, calls, generator, ecologyData };
}
const preserved = world => ({ sim: structuredClone(world.sim), ecology: structuredClone(world.oceanEcology.data),
  paused: world.paused, speed: world.speed });
function close(actual, expected, message = 'value') {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, received ${actual}`);
}
function closeVector(actual, expected) { actual.forEach((value, index) => close(value, expected[index], `axis ${index}`)); }
function view(surfaceY, x = 453, z = -277, y = 3, layer = 'free') {
  return { position: { x, y, z }, target: { x: x - 4, y: y - 2, z: z - 8 },
    layer, freeDepthM: surfaceY - y, habitat: 'kelp-forest' };
}
function storageFixture() {
  const records = new Map();
  return { records, getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
}

test('native kelp belt arrival and ordinary travel use absolute seed stops and preserve full saved ecology', () => {
  const {world,calls}=fixture(),before=preserved(world);
  world.oceanChunks.generator=createKelpOceanGenerator('42',{forestBelt:true});
  const stops=world.oceanChunks.generator.forestRouteStops;
  assert.equal(stops.length,2);
  assert.equal(world.enterKelpForestBelt(stops[0].id),true);
  const p=world.oceanWorldPosition();
  assert.ok(Math.hypot(p.x-stops[0].x,p.z-stops[0].z)<=6.000001);
  assert.ok(p.y<=world.surfaceY-.6);
  assert.ok(calls.some(row=>row[0]==='ecology-request'));
  assert.deepEqual(preserved(world),before);
  const arrived=world.oceanWorldPosition().toArray();
  assert.equal(world.travelKelpForestBelt(stops[1].id),true);
  assert.deepEqual(world.oceanWorldPosition().toArray(),arrived,'ordinary route selects travel without teleporting');
  assert.deepEqual(world.oceanTravel,{x:stops[1].x,z:stops[1].z});
  assert.equal(world.oceanObservationLayer,'bed');
  assert.deepEqual(preserved(world),before);
  assert.equal(world.enterKelpForestBelt('missing'),false);
  assert.equal(world.travelKelpForestBelt('missing'),false);
  world.isKelp=false;
  assert.equal(world.enterKelpForestBelt(stops[0].id),false);
  assert.equal(world.travelKelpForestBelt(stops[0].id),false);
  assert.deepEqual(preserved(world),before);
});

test('real kelp World water layers use surface 12 without changing logical X/Z or model records', () => {
  assert.equal(KELP_OCEAN_SURFACE_Y, 12); assert.equal(OCEAN_SURFACE_Y, 8);
  for (const biome of ['kelp', 'reef']) for (const layer of ['bed', 'midwater', 'surface']) {
    const { world, generator } = fixture({ biome }), before = preserved(world);
    const expected = oceanLayerHeight(layer, { surfaceY: biome === 'kelp' ? 12 : 8,
      floorY: generator.floorSurface(259, -123).height, safeY: generator.heightForCamera(259, -123) });
    assert.equal(world.setOceanObservationLayer(layer), true);
    closeVector(world.oceanWorldPosition().toArray(), [259, expected, -123]);
    assert.deepEqual(preserved(world), before); assert.equal(world.oceanObservationLayer, layer);
    if (layer === 'surface') close(world.camera.position.y, biome === 'kelp' ? 10.5 : 6.5);
    assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
  }
});

test('continuous kelp neighbor travel and cruise cross cells and rebase through actual World methods', () => {
  for (const layer of ['midwater', 'surface', 'free']) {
    const { world } = fixture({ x: 255.2, z: -123, origin: { x: 0, z: 0 } }), before = preserved(world);
    world.setOceanObservationLayer(layer); const chosenDepth = 12 - world.camera.position.y;
    world.travelOcean(1, 0); let rebased = false;
    for (let i = 0; i < 45; i++) {
      world.moveCamera(.1);
      if (Math.abs(world.camera.position.x) > 256) {
        const logical = world.oceanWorldPosition(), target = world.controls.target.clone()
          .add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));
        world.setOceanRenderOrigin(Math.round(logical.x / 64) * 64, Math.round(logical.z / 64) * 64);
        closeVector(world.oceanWorldPosition().toArray(), logical.toArray());
        closeVector(world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z)).toArray(), target.toArray());
        rebased = true;
      }
      world.enforceCameraClearance();
    }
    const arrival = world.oceanWorldPosition();
    close(arrival.x, 319.2); close(arrival.z, -123); assert.equal(world.oceanTravel, null); assert.equal(rebased, true);
    close(arrival.y, world.oceanLayerY(arrival.x, arrival.z));
    if (layer === 'free') close(12 - arrival.y, chosenDepth);
    assert.deepEqual(preserved(world), before);
    world.paused = false; world.toggleOceanCruise();
    for (let i = 0; i < 60; i++) { world.moveCamera(.1); world.enforceCameraClearance(); }
    const cruise = world.oceanWorldPosition(); assert.ok(cruise.x > arrival.x + 64);
    close(cruise.y, world.oceanLayerY(cruise.x, cruise.z));
    world.paused = true; const pausedPosition = world.oceanWorldPosition().toArray(); world.moveCamera(.1);
    closeVector(world.oceanWorldPosition().toArray(), pausedPosition);
    assert.deepEqual(world.sim, before.sim); assert.deepEqual(world.oceanEcology.data, before.ecology);
  }
});

test('kelp Q/E and free-depth navigation use the actual 12 m surface and its 11.5 m camera ceiling', () => {
  const { world } = fixture(); world.setOceanObservationLayer('midwater');
  world.keys.add('KeyE'); world.moveCamera(.1); world.keys.clear();
  assert.equal(world.oceanObservationLayer, 'free'); close(world.oceanFreeDepthM, 12 - world.camera.position.y);
  const depth = world.oceanFreeDepthM; world.travelOcean(1, 0);
  for (let i = 0; i < 45; i++) { world.moveCamera(.1); world.enforceCameraClearance(); }
  close(world.oceanFreeDepthM, depth); close(12 - world.camera.position.y, depth);
  world.setOceanObservationLayer('surface'); world.keys.add('KeyE');
  for (let i = 0; i < 10; i++) world.moveCamera(.1);
  close(world.camera.position.y, 11.5); close(world.oceanFreeDepthM, .5);
});

test('kelp capture and return preserve actual depth across origins, named layers, and pending real damping', () => {
  for (const layer of ['bed', 'midwater', 'surface', 'free']) {
    const { world, calls } = fixture({ origin: { x: -640, z: 896 } }), before = preserved(world);
    world.oceanObservationLayer = layer; world.oceanFreeDepthM = 1;
    const captured = world.captureOceanObservation(); close(captured.freeDepthM, 9);
    closeVector(Object.values(captured.position), [259, 3, -123]);
    world.controls.rotateLeft(.9); world.controls.rotateUp(.2);
    assert.equal(world.restoreOceanObservation(view(12, 453, -277, 4, layer)), true);
    closeVector(world.oceanWorldPosition().toArray(), [453, 4, -277]);
    assert.deepEqual(world.oceanRenderOrigin, { x: 448, z: -256 });
    closeVector(world.controls.target.clone().sub(world.camera.position).toArray(), [-4, -2, -8]);
    assert.equal(world.oceanObservationLayer, layer);
    if (layer === 'free') close(world.oceanFreeDepthM, 8); else assert.equal(world.oceanFreeDepthM, null);
    assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    assert.equal(world.following, false); assert.equal(world.transition, null); assert.equal(world.keys.size, 0);
    const actual = world.oceanWorldPosition().toArray();
    for (let i = 0; i < 60; i++) { world.controls.update(); world.enforceCameraClearance(); }
    closeVector(world.oceanWorldPosition().toArray(), actual);
    assert.deepEqual(preserved(world), before);
    assert.deepEqual(calls.filter(call => call[0] === 'ecology-request'), [['ecology-request', 453, 4, -277]]);
  }
});

test('kelp safe return height uses current terrain clearance and surface 12 while old reef stays at 8', () => {
  for (const biome of ['kelp', 'reef']) {
    const { world } = fixture({ biome }), surfaceY = biome === 'kelp' ? 12 : 8;
    const high = view(surfaceY, 453, -277, 100, 'surface'); high.freeDepthM = 0;
    assert.equal(world.restoreOceanObservation(high), true); close(world.camera.position.y, surfaceY - .5);
    assert.equal(world.restoreOceanObservation(view(surfaceY, 453, -277, -99)), true);
    const expected = Math.max(world.floorY(453, -277), world.habitatY(453, -277)) + .4;
    close(world.camera.position.y, expected); close(world.captureOceanObservation().freeDepthM, surfaceY - expected);
  }
});

test('real kelp snapshot and observation adapter report depth from surface 12, preserving old reef fallback', () => {
  const { world } = fixture(); world.oceanObservationLayer = 'free';
  const ocean = world.oceanSnapshot();
  assert.equal(ocean.chunkId, '4,-2'); assert.equal(ocean.observationLayer, 'free');
  const camera = { position: world.camera.position.toArray(), target: world.controls.target.toArray() };
  const kelp = oceanObservationView({ surfaceY: 12, ocean, camera });
  close(kelp.freeDepthM, 9); closeVector(Object.values(kelp.position), [259, 3, -123]);
  closeVector(Object.values(kelp.target), [255, 1, -131]);
  close(oceanObservationView({ ocean, camera }).freeDepthM, 5);
  assert.deepEqual(Object.keys(kelp).sort(), ['freeDepthM', 'habitat', 'layer', 'position', 'target']);
});

test('kelp observation persistence is isolated from both default and explicit reef namespaces and typed seeds', () => {
  const storage = storageFixture(), reefView = view(8, 453, -277, 3), kelpView = view(12, 453, -277, 4);
  const reef = createOceanExplorationMemory('42', { storage });
  const kelp = createOceanExplorationMemory('42', { storage, biome: 'kelp' });
  assert.equal(reef.remember(reefView).ok, true); assert.equal(reef.mark(reefView, 'reef').ok, true);
  assert.deepEqual(kelp.load().points, []); assert.equal(kelp.load().last, null);
  assert.equal(kelp.remember(kelpView).ok, true); assert.equal(kelp.mark(kelpView, 'kelp').ok, true);
  assert.deepEqual([...storage.records.keys()].sort(), ['continuous-kelp-observation-v1:string:42', 'continuous-ocean-observation-v1:string:42']);
  assert.deepEqual(createOceanExplorationMemory('42', { storage, biome: 'reef' }).load(), reef.load());
  const reopened = createOceanExplorationMemory('42', { storage, biome: 'kelp' });
  assert.deepEqual(reopened.load(), kelp.load()); assert.equal(reopened.load().last.freeDepthM, 8);
  assert.equal(createOceanExplorationMemory(42, { storage, biome: 'kelp' }).load().last, null);
  const reefBefore = reef.load(); assert.equal(reopened.clear().ok, true);
  assert.deepEqual(createOceanExplorationMemory('42', { storage }).load(), reefBefore);
  assert.equal(createOceanExplorationMemory('42', { storage, biome: 'kelp' }).load().last, null);
});

test('shared actual surface construction preserves reef material parameters and uses kelp height 12', () => {
  for (const biome of ['kelp', 'reef']) {
    const { world } = fixture({ biome }); world.makeSurface();
    assert.equal(world.waterSurface.position.y, biome === 'kelp' ? 12 : 8);
    assert.equal(world.waterSurface.material.uniforms.daylight, world.waterColors.daylight);
    if (biome === 'reef') {
      assert.match(world.waterSurface.material.fragmentShader, /1\.-smoothstep\(18\.,36\.,viewDistance\)/);
      assert.match(world.waterSurface.material.fragmentShader, /vec3\(\.58,\.82,\.85\)/);
    }
    world.waterSurface.geometry.dispose(); world.waterSurface.material.dispose();
  }
});
