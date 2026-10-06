import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepSimulation } from '../src/deepSimulation.js';
import { deepSpeciesCatalog } from '../src/deepSpecies.js';
import { deepOceanLayerHeight } from '../src/deepOceanNavigation.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanCommunityReading } from '../src/oceanCommunityReading.js';
import { normalizeOceanObservationView, oceanObservationView, createOceanExplorationMemory } from '../src/oceanExplorationMemory.js';
import { reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY } from '../src/habitat.js';

// Run the shipped World methods with actual terrain and OrbitControls. The
// WebGL constructor is deliberately omitted; movement is never reimplemented.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`); assert.ok(start >= 0, `World method ${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const methods = ['floorY', 'habitatY', 'select', 'oceanWorldPosition', 'oceanLayerY',
  'captureOceanObservation', 'restoreOceanObservation', 'captureOceanFreeDepth',
  'setOceanObservationLayer', 'setOceanRenderOrigin', 'startOceanExploration',
  'travelOcean', 'toggleOceanCruise', 'moveCamera', 'clearCameraPosition',
  'enforceCameraClearance', 'oceanSnapshot', 'makeLighting', 'updateObserverLighting',
  'makeSurface', 'makeDeepParticles', 'updateDeepOceanWater', 'enterDeepSeascape', 'travelDeepSeascape'];
const seedStart = source.indexOf('function seeded(');
const seeded = new Function(`return ${source.slice(seedStart, source.indexOf('\n', seedStart))}`)();
const WorldFixture = new Function('THREE', 'clamp', 'oceanLayerHeight', 'deepOceanLayerHeight', 'normalizeOceanObservationView',
  'oceanCommunityReading', 'reefRockFootprintContains', 'reefRockCanonicalCoordinates', 'reefRockSurfaceY', 'seeded',
  `return class {${methods.map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp, oceanLayerHeight,
  deepOceanLayerHeight, normalizeOceanObservationView, oceanCommunityReading,
  reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY, seeded);

function fixture({ x = 259, z = -123, y = 3, origin = { x: 256, z: -128 } } = {}) {
  const generator = createDeepOceanGenerator('42'), camera = new THREE.PerspectiveCamera(), calls = [];
  camera.position.set(x - origin.x, y, z - origin.z);
  const controls = new OrbitControls(camera);
  controls.target.copy(camera.position).add(new THREE.Vector3(-4, -2, -8));
  controls.minDistance = .11; controls.maxDistance = 14;
  controls.minPolarAngle = Math.PI * .15; controls.maxPolarAngle = Math.PI * .55;
  controls.enableDamping = true; controls.dampingFactor = .065; controls.update();
  const sim = new DeepSimulation('42'); sim.step(11.4);
  const ecologyData = {
    regions: [{ id: '4,-2', timeSec: 350.2, resources: { surfaceDetritus: .6, benthicAnimalFood: .4, suspendedPrey: .2 },
      ledger: { initial: 1.3, input: .1, ingested: .1, exported: .1 } }],
    agents: [{ id: 'live', regionId: '4,-2', speciesId: 'sea-pig-group', alive: true,
      state: 'sediment-probing', position: { x: 273, y: generator.heightAt(273, -92), z: -92 }, lastFeedAt: 340.2, energy: .87 },
    { id: 'dead', regionId: '4,-2', speciesId: 'rattail-family', alive: false,
      position: { x: 274, y: generator.heightAt(274, -93) + .3, z: -93 }, diedAt: 211.7, energy: 0 }],
    events: [{ type: 'feeding', timeSec: 340.2, actualIntake: .0008, agentId: 'live' }], metrics: { activeRegions: 1 },
  };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    biomeId: 'deep', isKelp: false, isDeep: true, surfaceY: 3500, scene: new THREE.Scene(), camera, controls,
    oceanRenderOrigin: { ...origin }, oceanExploring: true, oceanObservationLayer: 'bed', oceanFreeDepthM: 1,
    oceanTravel: { x: x + 64, z }, oceanCruising: true, following: true,
    transition: { agentId: 'live', position: new THREE.Vector3(2, 3, 4), target: new THREE.Vector3(4, 3, 2) },
    followOffsetY: 2, lastFocusAssessment: { agentId: 'live' }, selectedId: 'live', keys: new Set(['KeyW']),
    highlight: { visible: true, position: new THREE.Vector3() }, reefRoot: new THREE.Group(), cameraRocks: [],
    paused: true, speed: 12, disposed: false, oceanEcologyResetting: false, sim,
    oceanChunks: { generator, stats: { activeChunks: 9 },
      update(position) { calls.push(['chunks', ...position.toArray()]); },
      setRenderOrigin(value) { calls.push(['chunk-origin', { ...value }]); },
      setEnvironment(water, time) { calls.push(['landscape-water', { ...water }, time]); } },
    oceanEcology: { data: ecologyData, snapshot: () => ecologyData },
    oceanAnimals: { stats: {}, setRenderOrigin(value) { calls.push(['animal-origin', { ...value }]); } },
    catalog: new Map(deepSpeciesCatalog.map(species => [species.id, species])), errors: [],
    frameVectors: { direction: new THREE.Vector3() }, visualEnvironment: {},
    ownGeometry: value => value, ownMaterial: value => value,
    requestOceanEcology(position) { calls.push(['ecology-request', ...position.toArray()]); },
    onSelect(id) { calls.push(['onSelect', id]); }, emitSnapshot(force) { calls.push(['snapshot', force]); },
  });
  return { world, calls, generator, ecologyData };
}
const clone = value => JSON.parse(JSON.stringify(value));
const preserved = world => ({ sim: clone(world.sim), metrics: clone(world.sim.metrics), ecology: clone(world.oceanEcology.data),
  paused: world.paused, speed: world.speed });
function close(actual, expected, message = 'value') {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, received ${actual}`);
}
function closeVector(actual, expected) { actual.forEach((value, index) => close(value, expected[index], `axis ${index}`)); }
function view(x = 453, z = -277, y = 3, layer = 'free', surfaceY = 3500) {
  return { position: { x, y, z }, target: { x: x - 4, y: y - 2, z: z - 8 },
    layer, freeDepthM: surfaceY - y, habitat: 'deep-soft-bottom' };
}
function storageFixture() {
  const records = new Map(); return { records, getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
}

test('native deep seascape arrival and ordinary travel preserve full ecology and use bounded near-bed coordinates', () => {
  const {world,calls}=fixture(),before=preserved(world);
  world.oceanChunks.generator=createDeepOceanGenerator('42',{seascape:true});
  const stops=world.oceanChunks.generator.seascapeRouteStops;
  assert.equal(stops.length,2);
  assert.equal(world.enterDeepSeascape(stops[0].id),true);
  const p=world.oceanWorldPosition();
  assert.ok(Math.hypot(p.x-stops[0].x,p.z-stops[0].z)<=6.000001);
  assert.ok(p.y<=world.floorY(p.x,p.z)+8);
  assert.ok(calls.some(row=>row[0]==='ecology-request'));
  assert.deepEqual(preserved(world),before);
  const arrived=world.oceanWorldPosition().toArray();
  assert.equal(world.travelDeepSeascape(stops[1].id),true);
  closeVector(world.oceanWorldPosition().toArray(),arrived);
  assert.deepEqual(world.oceanTravel,{x:stops[1].x,z:stops[1].z});
  assert.equal(world.oceanObservationLayer,'bed');
  assert.deepEqual(preserved(world),before);
  assert.equal(world.enterDeepSeascape('missing'),false);
  assert.equal(world.travelDeepSeascape('missing'),false);
  world.isDeep=false;
  assert.equal(world.enterDeepSeascape(stops[0].id),false);
  assert.equal(world.travelDeepSeascape(stops[0].id),false);
  assert.deepEqual(preserved(world),before);
});

test('real deep World layers remain 1.8, 3.5 and 6 metres above local floor, never halfway to the sea surface', () => {
  for (const [layer, height] of [['bed', 1.8], ['midwater', 3.5], ['surface', 6]]) {
    const { world, generator } = fixture(), before = preserved(world);
    const floor = generator.floorSurface(259, -123).height;
    assert.equal(world.setOceanObservationLayer(layer), true);
    closeVector(world.oceanWorldPosition().toArray(), [259, floor + height, -123]);
    assert.equal(world.oceanObservationLayer, layer); assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
    assert.deepEqual(preserved(world), before); assert.ok(world.camera.position.y < floor + 8);
  }
});

test('deep Q/E and free navigation clamp to actual support and the local eight metre observer ceiling', () => {
  const { world, generator } = fixture(); world.setOceanObservationLayer('surface'); const before = preserved(world);
  world.keys.add('KeyE');
  for (let index = 0; index < 30; index++) { world.moveCamera(.1); world.enforceCameraClearance(); }
  world.keys.clear(); assert.equal(world.oceanObservationLayer, 'free');
  close(world.camera.position.y, generator.floorSurface(259, -123).height + 8);
  close(world.oceanFreeDepthM, 3500 - world.camera.position.y);
  world.keys.add('KeyQ');
  for (let index = 0; index < 40; index++) { world.moveCamera(.1); world.enforceCameraClearance(); }
  world.keys.clear(); close(world.camera.position.y, generator.heightForCamera(259, -123) + .4);
  close(world.oceanFreeDepthM, 3500 - world.camera.position.y);
  assert.deepEqual(preserved(world), before);
});

test('real deep neighbor travel and floating rebasing preserve model records and logical camera coordinates', () => {
  for (const layer of ['bed', 'midwater', 'surface', 'free']) {
    const { world } = fixture({ x: 255.2, z: -123, origin: { x: 0, z: 0 } });
    world.setOceanObservationLayer(layer); const before = preserved(world); world.travelOcean(1, 0);
    let rebased = false;
    for (let index = 0; index < 45; index++) {
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
    const arrival = world.oceanWorldPosition(); close(arrival.x, 319.2); close(arrival.z, -123);
    assert.equal(world.oceanTravel, null); assert.equal(rebased, true); close(arrival.y, world.oceanLayerY(arrival.x, arrival.z));
    assert.deepEqual(preserved(world), before);
    world.paused = false; world.toggleOceanCruise();
    for (let index = 0; index < 60; index++) { world.moveCamera(.1); world.enforceCameraClearance(); }
    const cruise = world.oceanWorldPosition(); assert.ok(cruise.x > arrival.x + 64);
    close(cruise.y, world.oceanLayerY(cruise.x, cruise.z));
    world.paused = true; const position = world.oceanWorldPosition().toArray(); world.moveCamera(.1);
    closeVector(world.oceanWorldPosition().toArray(), position); assert.deepEqual(preserved(world), before);
  }
});

test('deep capture and restore retain physical depth and flush real pending OrbitControls damping', () => {
  for (const layer of ['bed', 'midwater', 'surface', 'free']) {
    const { world, calls } = fixture({ origin: { x: -640, z: 896 } }), before = preserved(world);
    world.oceanObservationLayer = layer;
    const captured = world.captureOceanObservation(); close(captured.freeDepthM, 3497);
    closeVector(Object.values(captured.position), [259, 3, -123]);
    world.controls.rotateLeft(.9); world.controls.rotateUp(.2);
    assert.equal(world.restoreOceanObservation(view(453, -277, 4, layer)), true);
    closeVector(world.oceanWorldPosition().toArray(), [453, 4, -277]);
    assert.deepEqual(world.oceanRenderOrigin, { x: 448, z: -256 });
    closeVector(world.controls.target.clone().sub(world.camera.position).toArray(), [-4, -2, -8]);
    assert.equal(world.oceanObservationLayer, layer);
    if (layer === 'free') close(world.oceanFreeDepthM, 3496); else assert.equal(world.oceanFreeDepthM, null);
    assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false); assert.equal(world.following, false);
    assert.equal(world.transition, null); assert.equal(world.keys.size, 0);
    const position = world.oceanWorldPosition().toArray();
    for (let index = 0; index < 60; index++) { world.controls.update(); world.enforceCameraClearance(); }
    closeVector(world.oceanWorldPosition().toArray(), position); assert.deepEqual(preserved(world), before);
    assert.deepEqual(calls.filter(call => call[0] === 'ecology-request'), [['ecology-request', 453, 4, -277]]);
  }
});

test('saved deep views outside the local viewing volume restore above real rocks and below the near-bed ceiling', () => {
  const { world, generator } = fixture(), before = preserved(world);
  const rock = generator.chunk(-1, -10).elements.find(element => element.kind === 'rock'); assert.ok(rock);
  assert.equal(world.restoreOceanObservation(view(rock.x, rock.z, -99)), true);
  close(world.camera.position.y, generator.heightForCamera(rock.x, rock.z) + .4);
  assert.ok(world.camera.position.y >= generator.heightAt(rock.x, rock.z) + .25);
  assert.equal(world.restoreOceanObservation(view(rock.x, rock.z, 999)), true);
  close(world.camera.position.y, generator.floorSurface(rock.x, rock.z).height + 8);
  const actual = world.captureOceanObservation(); close(actual.freeDepthM, 3500 - world.camera.position.y);
  assert.deepEqual(preserved(world), before);
});

test('real deep snapshot observation adapters report 3500 minus Y depth through floating origins', () => {
  const { world } = fixture(); world.oceanObservationLayer = 'free'; const ocean = world.oceanSnapshot();
  const saved = oceanObservationView({ surfaceY: 3500, ocean,
    camera: { position: world.camera.position.toArray(), target: world.controls.target.toArray() } });
  assert.equal(ocean.chunkId, '4,-2'); assert.equal(ocean.observationLayer, 'free');
  close(saved.freeDepthM, 3497); closeVector(Object.values(saved.position), [259, 3, -123]);
  closeVector(Object.values(saved.target), [255, 1, -131]);
  assert.equal(ocean.localHabitat.representatives[0].speciesId, 'sea-pig-group');
  assert.equal(ocean.localHabitat.livingAnimals, 1);
});

test('deep observation memory stays isolated from reef, kelp and differently typed seeds', () => {
  const storage = storageFixture(), reef = createOceanExplorationMemory('42', { storage }),
    kelp = createOceanExplorationMemory('42', { storage, biome: 'kelp' }), deep = createOceanExplorationMemory('42', { storage, biome: 'deep' });
  const reefView = view(453, -277, 3, 'free', 8), kelpView = view(453, -277, 4, 'free', 12), deepView = view();
  assert.equal(reef.remember(reefView).ok, true); assert.equal(reef.mark(reefView, '礁区').ok, true);
  assert.equal(kelp.remember(kelpView).ok, true); assert.equal(kelp.mark(kelpView, '海带林').ok, true);
  assert.equal(deep.load().last, null); assert.deepEqual(deep.load().points, []);
  assert.equal(deep.remember(deepView).ok, true); assert.equal(deep.mark(deepView, '深海').ok, true);
  assert.deepEqual([...storage.records.keys()].sort(), ['continuous-deep-observation-v1:string:42',
    'continuous-kelp-observation-v1:string:42', 'continuous-ocean-observation-v1:string:42']);
  assert.deepEqual(createOceanExplorationMemory('42', { storage, biome: 'deep' }).load(), deep.load());
  assert.equal(createOceanExplorationMemory(42, { storage, biome: 'deep' }).load().last, null);
  const reefBefore = reef.load(), kelpBefore = kelp.load(); assert.equal(deep.clear().ok, true);
  assert.deepEqual(createOceanExplorationMemory('42', { storage }).load(), reefBefore);
  assert.deepEqual(createOceanExplorationMemory('42', { storage, biome: 'kelp' }).load(), kelpBefore);
  assert.equal(createOceanExplorationMemory('42', { storage, biome: 'deep' }).load().last, null);
});

test('actual deep lighting and observer-local marine snow never create sunlight, a surface or ecological food', () => {
  const { world, calls } = fixture(); world.makeLighting(); world.makeSurface(); world.makeDeepParticles();
  try {
    assert.equal(world.sun, undefined); assert.equal(world.ambient, undefined); assert.equal(world.waterSurface, undefined);
    assert.equal(world.deepParticles.geometry.attributes.position.count, 180);
    assert.equal(world.deepParticles.userData.role, 'display-marine-snow-not-resource-pool');
    const vertices = world.deepParticles.geometry.attributes.position.array.slice(), before = preserved(world);
    world.updateObserverLighting(); world.updateDeepOceanWater();
    assert.ok(world.observerSpot.intensity > 0 && world.observerFill.intensity > 0);
    closeVector(world.observerSpot.position.toArray(), world.camera.position.toArray());
    closeVector(world.deepParticles.position.toArray(), [world.camera.position.x, world.camera.position.y - 2, world.camera.position.z]);
    assert.equal(world.oceanLocalWater.lightAtDepth, 0); assert.equal(world.oceanLocalWater.naturalSunlight, false);
    assert.equal(world.oceanLocalWater.localPhotosynthesis, false); assert.deepEqual(preserved(world), before);
    const firstWaterCall = calls.find(call => call[0] === 'landscape-water'); close(firstWaterCall[2], world.sim.timeSec);
    assert.deepEqual(firstWaterCall[1].currentVector, { x: world.sim.environment.currentMps, y: 0, z: 0 });
    // Changing camera origins moves display/lamp coordinates, never food pools.
    world.setOceanRenderOrigin(512, -256); world.updateObserverLighting(); world.updateDeepOceanWater();
    closeVector(world.observerSpot.position.toArray(), world.camera.position.toArray());
    closeVector(world.deepParticles.position.toArray(), [world.camera.position.x, world.camera.position.y - 2, world.camera.position.z]);
    assert.deepEqual(world.deepParticles.geometry.attributes.position.array, vertices); assert.deepEqual(preserved(world), before);
    world.sim.setEnvironment({ observerLight: 0, hour: 23 }); const darkBefore = preserved(world);
    world.updateObserverLighting(); world.updateDeepOceanWater();
    assert.equal(world.observerSpot.intensity, 0); assert.equal(world.observerFill.intensity, 0);
    assert.equal(world.sim.metrics.primaryProduction, 0); assert.equal(world.sim.metrics.totalPrimaryProduction, 0);
    assert.equal(world.oceanLocalWater.lightAtDepth, 0); assert.deepEqual(preserved(world), darkBefore);
    assert.deepEqual(world.deepParticles.geometry.attributes.position.array, vertices);
  } finally { world.deepParticles.geometry.dispose(); world.deepParticles.material.dispose(); }
});
