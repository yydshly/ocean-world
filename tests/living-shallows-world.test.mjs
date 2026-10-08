import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ReefSimulation } from '../src/simulation.js';
import { KelpSimulation } from '../src/kelpSimulation.js';
import { DeepSimulation } from '../src/deepSimulation.js';
import { sceneCatalogs, sceneDefinitions, livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { REEF_ROCKS } from '../src/habitat.js';
import { KELP_ROCKS } from '../src/kelpHabitat.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createLivingHabitatBeltPlans } from '../src/livingHabitatBelt.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { LIVING_SHALLOWS_PROFILE, livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingWorldState } from '../src/livingWorldState.js';
import { createLivingDiscoveries } from '../src/livingDiscoveries.js';

// Execute the shipped pre-GPU constructor and CPU actions, rather than a
// second implementation of world identity, navigation or clock behavior.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`) >= 0 ? source.indexOf(`  ${name}(`) : source.indexOf(`  async ${name}(`);
  assert.ok(start >= 0, `World ${name} exists`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const constructorStart = source.indexOf('  constructor('), constructorEnd = source.indexOf('    // Own the canvas', constructorStart);
const methods = ['oceanWorldPosition', 'enterLivingShallows', 'travelLivingShallows', 'setView', 'moveCamera',
  'captureOceanFreeDepth', 'oceanLayerY', 'persistLivingWorld', 'setEnvironment', 'setPaused', 'stopDirectorEntry', 'reset', 'focusSpecies'];
const constructorHead = `${source.slice(constructorStart, constructorEnd)}\n  }`;
const initialSceneStart = source.indexOf('        if(this.isLivingShallows){', source.indexOf('        this.bindAuthoredSurface();'));
const initialSceneEnd = source.indexOf('        this.oceanWaterField=', initialSceneStart);
assert.ok(initialSceneStart >= 0 && initialSceneEnd > initialSceneStart);
const clockStart = source.indexOf('    const frameTime=', source.indexOf('  tick('));
const clockEnd = source.indexOf('    const metrics=this.sim.metrics;', clockStart);
const clockTick = new Function('clamp', `return function(now){${source.slice(clockStart, clockEnd)}}`)(THREE.MathUtils.clamp);

function storageFixture() {
  const records = new Map();
  return { records, getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
}

function worldFixture({ profile = LIVING_SHALLOWS_PROFILE, seed = '42', biomeId = 'reef', mobileIndividuals = null,
  storage = storageFixture() } = {}) {
  const WorldCPU = new Function('THREE', 'ReefSimulation', 'KelpSimulation', 'DeepSimulation', 'sceneCatalogs', 'sceneDefinitions', 'livingShallowsSpeciesCatalog',
    'REEF_ROCKS', 'KELP_ROCKS', 'reefPresets', 'kelpPresets', 'deepPresets', 'FRAME_TIME_LIMITS_MS',
    'LIVING_SHALLOWS_PROFILE', 'livingShallowsSeed', 'createLivingWorldState', 'clamp', 'oceanLayerHeight', 'createOceanEnvironment', 'createLivingDiscoveries',
    `return class {${constructorHead}\n${methods.map(method).join('\n')}}`)(THREE, ReefSimulation, KelpSimulation, DeepSimulation,
    sceneCatalogs, sceneDefinitions, livingShallowsSpeciesCatalog, REEF_ROCKS, KELP_ROCKS,
    { wide: { position: [3, 2.8, 5], target: [-2.5, .65, -2] } }, {}, {}, [16.67, 25, 33.34, 50, 100, 250, 1000],
    LIVING_SHALLOWS_PROFILE, livingShallowsSeed, actualSeed => createLivingWorldState(actualSeed, { storage }),
    THREE.MathUtils.clamp, oceanLayerHeight, () => ({}), actualSeed => createLivingDiscoveries(actualSeed, { storage }));
  const world = new WorldCPU({}, () => {}, () => {}, () => {}, { seed, sceneProfile: profile, biomeId, mobileIndividuals, paused: true });
  const calls = [], generator = createOceanGenerator(world.sim.seed);
  Object.assign(world, {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(49), reefRoot: new THREE.Group(),
    floorMesh: new THREE.Group(), floorContinuation: new THREE.Group(), highlight: { visible: false, position: new THREE.Vector3() },
    oceanChunks: { generator, root: new THREE.Group(), update() {},
      reset(actualSeed) { calls.push(['chunk-reset', actualSeed]); this.generator = createOceanGenerator(actualSeed); },
      setRenderOrigin() {} },
    controls: { target: new THREE.Vector3(10, -3, 0), update() { world.camera.lookAt(this.target); } },
    oceanAnimals: { root: new THREE.Group(), reset() {}, setRenderOrigin() {} },
    oceanEcology: { agents: [], setEnvironment(env) { calls.push(['ecology-environment', { ...env }]); },
      reset(actualSeed) { calls.push(['ecology-reset', actualSeed]); return Promise.resolve(); },
      checkpoint() { calls.push(['checkpoint']); return Promise.resolve(true); }, step(dt, env) { calls.push(['ecology-step', dt, { ...env }]); } },
    floorY(x, z) { return this.oceanChunks.generator.floorSurface(x, z).height; },
    habitatY(x, z) { return this.oceanChunks.generator.heightForCamera(x, z); },
    restoreOceanObservation(view) {
      this.oceanExploring = true; this.camera.position.set(view.position.x, view.position.y, view.position.z);
      this.controls.target.set(view.target.x, view.target.y, view.target.z); this.controls.update(); return true;
    },
    setOceanRenderOrigin() {}, select(id) { this.selectedId = id; }, emitSnapshot() { calls.push(['snapshot']); },
    requestOceanEcology() { calls.push(['ecology-request']); }, syncPopulation() {}, lastTime: 1000,
  });
  return { world, calls, storage };
}

function initializeScene(world) {
  const allocations = [];
  class StubRenderer { constructor() { this.root = new THREE.Group(); allocations.push(this.constructor.name); } }
  class SceneElements extends StubRenderer {} class HabitatScenes extends StubRenderer {} class MacroLandscape extends StubRenderer {}
  class Ecology {
    constructor(seed, generator, options) { this.seed = seed; this.generator = generator; this.options = options; }
    setEnvironment(environment) { this.environment = { ...environment }; }
  }
  const init = new Function('seed', 'OceanEcology', 'OceanAnimals', 'OceanSceneElements', 'OceanHabitatScenes', 'OceanMacroLandscape',
    'DeepOceanEcology', 'KelpOceanEcology', 'DeepOceanAnimals', 'KelpOceanAnimals', 'KelpDriftFood', 'KelpUnderstory',
    source.slice(initialSceneStart, initialSceneEnd));
  init.call(world, world.sim.seed, Ecology, StubRenderer, SceneElements, HabitatScenes, MacroLandscape,
    Ecology, Ecology, StubRenderer, StubRenderer, StubRenderer, StubRenderer);
  return allocations;
}

test('scene-version opt-in keeps default, other biomes and mobile benchmark identities unchanged', () => {
  const defaultWorld = worldFixture({ profile: null }).world;
  assert.equal(defaultWorld.isLivingShallows, false); assert.equal(defaultWorld.sim.seed, '42');
  assert.equal(defaultWorld.livingWorldState, null);
  const newWorld = worldFixture().world;
  assert.equal(newWorld.isLivingShallows, true); assert.equal(newWorld.sim.seed, livingShallowsSeed('42'));
  assert.equal(newWorld.inputSeed, '42'); assert.equal(newWorld.oceanChunks.generator.profile, LIVING_SHALLOWS_PROFILE);
  for (const id of ['day-octopus', 'spotted-reef-crab', 'tube-sponge', 'reef-squid', 'spotted-jelly']) {
    assert.equal(newWorld.catalog.has(id), true);
    assert.equal(defaultWorld.catalog.has(id), false);
  }
  for (const biomeId of ['kelp', 'deep']) {
    const world = worldFixture({ biomeId }).world;
    assert.equal(world.isLivingShallows, false); assert.equal(world.sim.seed, '42'); assert.equal(world.livingWorldState, null);
    assert.equal(world.catalog.has('day-octopus'), false);
  }
  const benchmark = worldFixture({ mobileIndividuals: 120 }).world;
  assert.equal(benchmark.isLivingShallows, false); assert.equal(benchmark.sim.seed, '42');
  assert.equal(benchmark.catalog.has('day-octopus'), false);
});

test('new scene hides authored terrain and disables all three old additive scenery systems', () => {
  const { world } = worldFixture(); world.cameraRocks = [{ rock: REEF_ROCKS[0], bedSupported: false }];
  const allocations = initializeScene(world);
  assert.equal(world.reefRoot.visible, false); assert.equal(world.floorMesh.visible, false); assert.equal(world.floorContinuation.visible, false);
  assert.deepEqual(world.cameraRocks, [], 'hidden original rocks must not remain as invisible camera collisions');
  assert.deepEqual(world.oceanEcology.options, { turtles: true, sceneElements: false, habitatScenes: false, macroLandscape: false, livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, shallowSeascape: true, coastalSeascape: true, reefValleyRegion: true, reefResidents: true, reefDiversity: true, reefCommunity: true, reefLife: true, reefFauna: true, reefAssemblage: true, meadowRegion: true, meadowAnimalBelt: true, turtleGrazing: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife: true });
  assert.deepEqual(allocations, ['StubRenderer']);
  for (const key of ['oceanSceneElements', 'oceanHabitatScenes', 'oceanMacroLandscape']) assert.equal(world[key], undefined);
  const old = worldFixture({ profile: null }).world;
  const originalGuards = [{ rock: REEF_ROCKS[0], bedSupported: false }]; old.cameraRocks = originalGuards;
  const oldAllocations = initializeScene(old);
  assert.equal(old.reefRoot.visible, true); assert.equal(old.floorMesh.visible, true);
  assert.strictEqual(old.cameraRocks, originalGuards);
  assert.deepEqual(old.oceanEcology.options, { turtles: true, sceneElements: true, habitatScenes: true, macroLandscape: true, livingGeology: false, habitatMosaic: false, seabedRelief: false, seascape: false, livingBelt: false, shallowSeascape: false, coastalSeascape: false, reefValleyRegion: false, reefResidents: false, reefDiversity: false, reefCommunity: false, reefLife: false, reefFauna: false, reefAssemblage: false, meadowRegion: false, meadowAnimalBelt: false, turtleGrazing: false, biodiversity: false, benthicLife: false, meadowLife: false, shoalLife: false });
  assert.deepEqual(oldAllocations, ['StubRenderer', 'SceneElements', 'HabitatScenes', 'MacroLandscape']);
});

test('world restores saved global forcing and clock before handing environment to regional ecology', () => {
  const storage = storageFixture(), saved = { version: 1, timeSec: 901.25,
    environment: { currentMps: .17, turbidity: .34, foodSupply: 1.2, hour: 17.25 } };
  assert.equal(createLivingWorldState(livingShallowsSeed('42'), { storage }).save(saved), true);
  const { world } = worldFixture({ storage }); initializeScene(world);
  assert.equal(world.livingClockSec, saved.timeSec); assert.equal(world.sim.timeSec, saved.timeSec);
  assert.deepEqual(world.sim.environment, saved.environment); assert.deepEqual(world.oceanEcology.environment, saved.environment);
  const old = worldFixture({ storage, profile: null }).world; initializeScene(old);
  assert.equal(old.sim.timeSec, 0); assert.equal(old.sim.environment.hour, 10);
});

test('new clock advances with simulation speed, wraps hour, freezes on pause and never steps hidden authored animals', () => {
  const { world, calls } = worldFixture();
  world.paused = false; world.speed = 12; world.livingClockSec = 3600; world.sim.timeSec = 3600; world.sim.environment.hour = 23.9999;
  world.sim.step = () => assert.fail('hidden authored model advanced');
  const oldAnimals = structuredClone(world.sim.agents);
  clockTick.call(world, 1100);
  assert.equal(world.livingClockSec, 3601.2); assert.equal(world.sim.timeSec, 3601.2);
  assert.ok(world.sim.environment.hour < .001);
  assert.deepEqual(calls.find(call => call[0] === 'ecology-step').slice(0, 2), ['ecology-step', 1.2000000000000002]);
  assert.deepEqual(world.sim.agents, oldAnimals);
  world.paused = true; const frozen = world.livingClockSec, hour = world.sim.environment.hour;
  clockTick.call(world, 1200); assert.equal(world.livingClockSec, frozen); assert.equal(world.sim.environment.hour, hour);
  const legacy = worldFixture({ profile: null }).world; legacy.paused = false; let stepped = 0;
  legacy.sim.step = dt => { stepped += dt; }; clockTick.call(legacy, 1100);
  assert.ok(Math.abs(stepped - .1) < 1e-12); assert.equal(legacy.livingClockSec, 0);
});

test('route controls use finite ordinary travel without teleport or ecology replacement', () => {
  const { world, calls } = worldFixture(); world.enterLivingShallows(0);
  const before = world.oceanWorldPosition().toArray(), seed = world.sim.seed, originalEcology = world.oceanEcology;
  assert.equal(world.travelLivingShallows(1), true);
  assert.deepEqual(world.oceanWorldPosition().toArray(), before);
  let previous = world.oceanWorldPosition(), distance = 0;
  for (let index = 0; index < 180 && world.oceanTravel; index++) {
    world.moveCamera(.1); const next = world.oceanWorldPosition(), step = Math.hypot(next.x - previous.x, next.z - previous.z);
    assert.ok(step <= 1.6000000001); distance += step; previous = next;
  }
  assert.equal(world.oceanTravel, null); assert.ok(distance > 110);
  assert.ok(Math.abs(previous.x - 336) < 1e-7 && Math.abs(previous.z - 224) < 1e-7);
  assert.equal(world.sim.seed, seed); assert.equal(world.oceanEcology, originalEcology);
  assert.equal(calls.some(call => call[0].includes('reset')), false);
  assert.equal(world.travelLivingShallows(-1), false); assert.equal(world.travelLivingShallows(.5), false);
});

test('the two living-belt entries face their planned local spaces and keep original ecological controls', () => {
  const { world, calls } = worldFixture();
  const generator = createLivingRidgeGenerator(world.oceanChunks.generator);
  generator.registerRidgePlans(createLivingHabitatBeltPlans(generator, 74, 2));
  world.oceanChunks.generator = generator;
  const before = { paused: world.paused, time: world.sim.timeSec, environment: { ...world.sim.environment } };
  for (const id of ['habitat-belt-reef', 'habitat-belt-meadow']) {
    const index = generator.routeStops.findIndex(stop => stop.id === id), stop = generator.routeStops[index];
    assert.ok(index >= 0); assert.equal(world.enterLivingShallows(index), true);
    const delta = world.controls.target.clone().sub(world.camera.position);
    assert.ok(delta.x * Math.cos(stop.heading) - delta.z * Math.sin(stop.heading) > 13);
    assert.ok(world.camera.position.y < world.surfaceY);
    assert.ok(world.camera.position.y >= generator.floorSurface(world.camera.position.x, world.camera.position.z).height + .8);
  }
  assert.deepEqual({ paused: world.paused, time: world.sim.timeSec, environment: { ...world.sim.environment } }, before);
  assert.equal(calls.some(call => call[0].includes('reset') || call[0] === 'ecology-step'), false);
});

test('environment updates and pause save the actual global forcing and latest time', async () => {
  const { world, calls, storage } = worldFixture(); world.elapsed = 3.2; world.livingClockSec = 831.4;
  world.setEnvironment({ hour: 18.2, foodSupply: .5 });
  const record = createLivingWorldState(world.sim.seed, { storage }).load();
  assert.equal(record.timeSec, 831.4); assert.equal(record.environment.hour, world.sim.environment.hour); assert.equal(record.environment.foodSupply, .5);
  world.livingClockSec = 832.1; await world.setPaused(true);
  assert.equal(createLivingWorldState(world.sim.seed, { storage }).load().timeSec, 832.1);
  assert.equal(world.paused, true); assert.equal(calls.filter(call => call[0] === 'checkpoint').length, 1);
});

test('explicit reset preserves new scene version, changes typed seed and resets global clock only in the target world', async () => {
  const { world, calls, storage } = worldFixture(); world.livingClockSec = 400;
  world.directorEntry = { active: true }; world._preparedDirectorObservation = { route: {} };
  world.sim.environment.hour = 18.4; world.persistLivingWorld();
  const oldSeed = world.sim.seed, oldRecord = createLivingWorldState(oldSeed, { storage }).load();
  world.reset('91'); await Promise.resolve();
  assert.equal(world.directorEntry, null); assert.equal(world._preparedDirectorObservation, null);
  const nextSeed = livingShallowsSeed('91');
  assert.equal(world.inputSeed, '91'); assert.equal(world.sim.seed, nextSeed);
  assert.equal(world.oceanChunks.generator.profile, LIVING_SHALLOWS_PROFILE);
  assert.equal(world.oceanChunks.generator.seed, nextSeed); assert.equal(world.livingClockSec, 0);
  assert.equal(world.sim.timeSec, 0); assert.equal(world.sim.environment.hour, 10);
  assert.deepEqual(createLivingWorldState(oldSeed, { storage }).load(), oldRecord);
  assert.equal(createLivingWorldState(nextSeed, { storage }).load().timeSec, 0);
  assert.ok(calls.some(call => call[0] === 'ecology-reset' && call[1] === nextSeed));
  assert.equal(world.oceanEcologyResetting, false); assert.equal(world.oceanExploring, true);
  world.reset(''); await Promise.resolve(); assert.equal(world.sim.seed, livingShallowsSeed(42)); assert.equal(world.inputSeed, 42);
  const legacy = worldFixture({ profile: null }).world; legacy.reset('91'); await Promise.resolve();
  assert.equal(legacy.sim.seed, '91'); assert.equal(legacy.oceanChunks.generator.profile, undefined); assert.equal(legacy.livingWorldState, null);
});

test('new-scene catalogue observation uses loaded real animals without selecting hidden authored organisms or leaving the current habitat', () => {
  const { world } = worldFixture(); world.enterLivingShallows(2);
  const previous = world.oceanWorldPosition().toArray(), calls = [];
  const hidden = world.sim.agents.find(agent => agent.speciesId === 'green-chromis');
  world.entities.set(hidden.id, { object: { visible: true } });
  world.returnToReef = () => { calls.push('returned-to-original'); world.enterLivingShallows(0); };
  world.assessFocus = () => ({ score: 0 });
  world.applyFocus = agent => { calls.push(`hidden:${agent.id}`); world.lastFocusAssessment = {}; };
  world.focusNearbyOceanAnimal = speciesId => { calls.push(`loaded:${speciesId}`); return true; };
  assert.equal(world.focusSpecies('green-chromis'), true);
  assert.deepEqual(calls, ['loaded:green-chromis']);
  assert.deepEqual(world.oceanWorldPosition().toArray(), previous);
});
