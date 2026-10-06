import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { ReefSimulation } from '../src/simulation.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { recordLivingDeath, livingNetworkBalance } from '../src/livingEcologyNetwork.js';
import { createLivingVisualRoute, sampleLivingVisualRoute } from '../src/livingVisualRoute.js';
import { createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed,
  isDirectorPlaybackRate } from '../src/directorCameraMotion.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';

// Run the shipped camera and observation methods. WebGL allocation and the
// asynchronous request scheduler are outside this finite CPU fixture; the
// descriptors, populations, complete records and food inventories are real.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(`) >= 0 ? source.indexOf(`  ${name}(`) : source.indexOf(`  async ${name}(`);
  assert.ok(start >= 0, `Production World ${name} exists`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const methods = ['oceanWorldPosition', 'findAgent', 'currentLivingVisualRoute', 'enterLivingVisualScene', 'enterLivingVisualSample', 'enterLivingShallows',
  'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries', 'updateDirectorMotion', 'setDirectorPlaybackRate',
  'stopDirectorMotion', 'directorMotionSnapshot', 'restoreOceanObservation', 'oceanLayerY',
  'clearCameraPosition', 'enforceCameraClearance', 'setOceanRenderOrigin'];
const WorldCPU = new Function('THREE', 'createLivingVisualRoute', 'sampleLivingVisualRoute',
  'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed', 'isDirectorPlaybackRate',
  'normalizeOceanObservationView', 'oceanLayerHeight', 'clamp', `return class {${methods.map(method).join('\n')}}`)(
  THREE, createLivingVisualRoute, sampleLivingVisualRoute, createDirectorCameraMotion, sampleDirectorCameraMotion,
  advanceDirectorCameraElapsed, isDirectorPlaybackRate, normalizeOceanObservationView, oceanLayerHeight, THREE.MathUtils.clamp);
const seed = livingShallowsSeed('42'), START = { x: 4758, z: 150 }, CAMERA = { x: 4756, z: 157 };
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(...['x', 'y', 'z'].map(key => a[key] - b[key]));
const nearPoint = (actual, expected, label) => assert.ok(distance(actual, expected) < 1e-7, `${label}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
const finite = point => ['x', 'y', 'z'].every(key => Number.isFinite(point[key]));
const receipt = { scope: 'finite CPU production-World observation methods and real ecology; not WebGL, browser streaming or visual acceptance', seed };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class MemoryStore {
  available = true; records = new Map(); commits = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async saveMany(world, entries) {
    const rows = clone(entries); this.commits.push(rows);
    for (const [id, record] of rows) this.records.set(`${world}|${id}`, record);
  }
}
function preserved(f) {
  const sim = Object.fromEntries(Object.entries(f.world.sim).filter(([, value]) => typeof value !== 'function'));
  return clone({ records: [...f.model._active.values()].sort((a, b) => a.id.localeCompare(b.id)),
    stored: [...f.store.records].sort(([a], [b]) => a.localeCompare(b)), sim, regionalEnvironment: f.model._environment,
    regionalAccumulator: f.model._accumulator, livingClockSec: f.world.livingClockSec, visualTimeSec: f.world.visualTimeSec,
    speed: f.world.speed, paused: f.world.paused });
}
async function fixture({ renderOrigin = { x: 0, z: 0 } } = {}) {
  const store = new MemoryStore(), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const model = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, turtleGrazing: true });
  assert.notEqual(await model.update(START), false);
  assert.equal(model._active.size, 9, 'the real complete ecology window finished loading');
  assert.equal(model.snapshot().metrics.storageError, null);
  model.step(.3, { currentMps: .18, turbidity: .3, foodSupply: .8, hour: 14 });
  // Publishing the existing official getter gives clocks their normal public
  // fields before observation; the subsequent comparisons include them.
  model.snapshot();
  const deathOwner = [...model._active.values()].find(row => row.agents.some(agent => agent.alive && agent.speciesId === 'black-cucumber'));
  assert.ok(deathOwner, 'a real existing soft-bottom individual is available');
  const dead = deathOwner.agents.find(agent => agent.alive && agent.speciesId === 'black-cucumber');
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; recordLivingDeath(deathOwner, dead); deathOwner.counters.deaths++;
  for (const row of model._active.values()) {
    row.opaqueObservationHistory = { owner: row.id, notes: ['preserve', 'all'] };
    assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8);
  }
  await model.checkpoint(); model.snapshot();
  const world = new WorldCPU(), calls = [], completions = [], sim = new ReefSimulation(seed);
  sim.timeSec = 123.25; sim.environment = { ...model._environment };
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, disposed: false, oceanEcologyResetting: false,
    oceanExploring: true, camera: new THREE.PerspectiveCamera(49, 16 / 9), controls: { target: new THREE.Vector3(), enableDamping: true,
      update() { world.camera.lookAt(this.target); } }, oceanRenderOrigin: { ...renderOrigin }, surfaceY: generator.surfaceY,
    cameraRocks: [], keys: new Set(), highlight: { visible: false, position: new THREE.Vector3() }, reefRoot: new THREE.Group(),
    sim, catalog: new Map(livingShallowsSpeciesCatalog.map(species => [species.id, species])), oceanEcology: model,
    oceanChunks: { generator, stats: { loadedChunks: [...model._active.keys()] }, update(position) { calls.push(['chunk-update', { ...position }]); },
      setRenderOrigin(origin) { calls.push(['chunk-origin', { ...origin }]); } },
    floorY: (x, z) => generator.floorSurface(x, z).height, habitatY: (x, z) => generator.heightForCamera(x, z),
    paused: false, speed: 1.5, selectedId: null, livingClockSec: 321.4, visualTimeSec: 17.2, livingVisualRoute: null,
    requestOceanEcology(position) { calls.push(['ecology-request', { ...position }]); },
    onSelect(id) { calls.push(['select', id]); }, emitSnapshot() { calls.push(['snapshot']); },
    onDirectorMotionComplete(value) { completions.push(clone(value)); },
  });
  const y = Math.min(generator.surfaceY - .6, generator.heightForCamera(CAMERA.x, CAMERA.z) + 3);
  world.camera.position.set(CAMERA.x - renderOrigin.x, y, CAMERA.z - renderOrigin.z);
  world.controls.target.set(CAMERA.x + 8 - renderOrigin.x, y - 1, CAMERA.z - renderOrigin.z); world.controls.update();
  return { world, model, generator, store, calls, completions, dead };
}
function provenance(f, route) {
  assert.equal(route.status, 'ready', route.reason);
  assert.equal(route.stops.length, 3); assert.ok(route.path.length >= 3);
  const loaded = new Set(f.world.oceanChunks.stats.loadedChunks), elements = new Map();
  for (const id of loaded) for (const element of f.generator.chunk(...id.split(',').map(Number)).elements) elements.set(element.id, element);
  const actual = new Map(f.model.agents.map(agent => [agent.id, agent]));
  assert.ok(route.sourceChunkIds.length > 0 && route.sourceChunkIds.every(id => loaded.has(id)));
  assert.ok(route.sourceElementIds.length > 0 && route.sourceElementIds.every(id => elements.has(id)));
  const kinds = new Set(route.sourceElementIds.map(id => elements.get(id).kind));
  assert.ok(kinds.has('rock') && kinds.has('coral') && kinds.has('seagrass'));
  assert.ok(route.sourceAgentIds.length > 0);
  for (const id of route.sourceAgentIds) {
    const agent = actual.get(id); assert.ok(agent?.alive && loaded.has(agent.regionId));
    assert.equal(f.world.catalog.get(agent.speciesId)?.kind, 'fish');
    assert.ok(!f.world.sim.agents.some(hidden => hidden.id === id), 'hidden authored individuals cannot be visual-route sources');
  }
  assert.ok(!route.sourceAgentIds.includes(f.dead.id), 'the actual existing death is excluded');
  for (const stop of route.stops) {
    assert.ok(finite(stop.position) && finite(stop.target));
    assert.ok(stop.position.y >= f.generator.heightForCamera(stop.position.x, stop.position.z) + .25 - 1e-7);
    assert.ok(stop.position.y <= f.generator.surfaceY - .5);
  }
  assert.equal(route.evidence.actualRenderedOcclusion, false);
}

test('the production whole-scene route uses only loaded real descriptors and alive actual fish', async () => {
  const f = await fixture(), before = preserved(f), route = f.world.currentLivingVisualRoute();
  provenance(f, route); assert.deepEqual(preserved(f), before);
  Object.assign(receipt, { loadedOwners: f.model._active.size, actualDeathId: f.dead.id, sourceChunkIds: route.sourceChunkIds,
    sourceElementIds: route.sourceElementIds, sourceAgentIds: route.sourceAgentIds, routeStops: route.stops,
    actualOriginalRecordsPreserved: before.records.length, completeStatePreservedOnRead: true });
});

test('entering the ordinary whole-scene view changes observation only and keeps complete ecology and clocks', async () => {
  const f = await fixture(), route = f.world.currentLivingVisualRoute(); provenance(f, route);
  const before = preserved(f), oldPosition = f.world.oceanWorldPosition();
  assert.equal(f.world.enterLivingVisualScene(), true); assert.equal(f.world.livingVisualRoute.status, 'ready');
  nearPoint(f.world.oceanWorldPosition(), route.stops[0].position, 'first actual route stop');
  assert.ok(distance(oldPosition, f.world.oceanWorldPosition()) > .1);
  assert.equal(f.world.oceanObservationLayer, 'free'); assert.equal(f.world.directorMotion, undefined);
  assert.ok(f.calls.some(call => call[0] === 'ecology-request'), 'ordinary streaming is requested rather than replacing ecology');
  assert.deepEqual(preserved(f), before); assert.equal(f.world.oceanEcology, f.model);
  receipt.completeStatePreservedOnEntry = true;
});

test('the real director advances across all three admitted stops and completes once without altering ecology', async () => {
  const f = await fixture(), before = preserved(f);
  assert.equal(f.world.prepareDirectorObservation({ routeId: 'living-visual' }), true);
  const positioned = f.world.oceanWorldPosition(), requests = f.calls.filter(call => call[0] === 'ecology-request').length;
  assert.equal(f.world.beginDirectorMotion({ routeId: 'living-visual', kind: 'walk', durationSec: 12 }), true);
  nearPoint(f.world.oceanWorldPosition(), positioned, 'starting observation does not repeat the covered positioning');
  assert.equal(f.calls.filter(call => call[0] === 'ecology-request').length, requests, 'starting observation does not request a second relocation');
  const route = f.world.directorMotion.livingRoute; provenance(f, route);
  nearPoint(f.world.oceanWorldPosition(), route.stops[0].position, 'director first stop');
  f.world.updateDirectorMotion(6);
  nearPoint(f.world.oceanWorldPosition(), route.stops[1].position, 'director actually reaches the middle observation');
  f.world.updateDirectorMotion(6);
  nearPoint(f.world.oceanWorldPosition(), route.stops[2].position, 'director actually reaches the final observation');
  const completed = f.world.directorMotionSnapshot();
  assert.equal(completed.complete, true); assert.equal(completed.active, false); assert.equal(completed.error, null);
  assert.ok(completed.travelledM > 10); assert.ok(completed.observationRoute.pathLengthM > 10);
  f.world.updateDirectorMotion(1); assert.deepEqual(f.world.directorMotionSnapshot(), completed);
  f.world.stopDirectorMotion(); f.world.stopDirectorMotion();
  assert.equal(f.completions.length, 1); assert.deepEqual(f.completions[0], completed);
  assert.deepEqual(preserved(f), before);
  Object.assign(receipt, { actualDirectorTravelledM: completed.travelledM, actualDirectorPathLengthM: completed.observationRoute.pathLengthM,
    actualThreeStopCompletion: true, completeStatePreservedOnPlayback: true });
});

test('pause and camera playback rates control the same admitted path without changing ecology speed or stocks', async () => {
  const f = await fixture(), before = preserved(f);
  assert.equal(f.world.prepareDirectorObservation({ routeId: 'living-visual' }), true);
  assert.equal(f.world.beginDirectorMotion({ routeId: 'living-visual', durationSec: 12, playbackRate: 2 }), true);
  const shot = f.world.directorMotion.shot, route = f.world.directorMotion.livingRoute;
  f.world.updateDirectorMotion(1); assert.equal(f.world.directorMotionSnapshot().elapsedSec, 2);
  const position = f.world.oceanWorldPosition();
  assert.equal(f.world.setDirectorPlaybackRate(.5), true); nearPoint(f.world.oceanWorldPosition(), position, 'rate change does not jump camera');
  f.world.updateDirectorMotion(1); assert.equal(f.world.directorMotionSnapshot().elapsedSec, 2.5);
  f.world.paused = true; const paused = f.world.directorMotionSnapshot();
  assert.equal(f.world.setDirectorPlaybackRate(4), true); f.world.updateDirectorMotion(1);
  assert.equal(f.world.directorMotionSnapshot().elapsedSec, 2.5); nearPoint(f.world.oceanWorldPosition(), paused.worldPosition, 'paused path is frozen');
  f.world.paused = false; f.world.updateDirectorMotion(1); assert.equal(f.world.directorMotionSnapshot().elapsedSec, 6.5);
  assert.equal(f.world.directorMotion.shot, shot); assert.equal(f.world.directorMotion.livingRoute, route);
  for (const invalid of [0, -1, 3, NaN, Infinity, '2']) {
    const state = f.world.directorMotionSnapshot(); assert.equal(f.world.setDirectorPlaybackRate(invalid), false);
    assert.deepEqual(f.world.directorMotionSnapshot(), state);
  }
  assert.deepEqual(preserved(f), before); receipt.pauseAndCameraRatesPreserveEcology = true;
});

test('source paths and actual camera positions remain in world metres through a floating-origin change', async () => {
  const a = await fixture(), b = await fixture({ renderOrigin: { x: 4736, z: 128 } });
  const beforeA = preserved(a), beforeB = preserved(b);
  assert.deepEqual(a.world.currentLivingVisualRoute(), b.world.currentLivingVisualRoute());
  assert.equal(a.world.prepareDirectorObservation({ routeId: 'living-visual' }), true);
  assert.equal(b.world.prepareDirectorObservation({ routeId: 'living-visual' }), true);
  assert.equal(a.world.beginDirectorMotion({ routeId: 'living-visual', durationSec: 12 }), true);
  assert.equal(b.world.beginDirectorMotion({ routeId: 'living-visual', durationSec: 12 }), true);
  a.world.updateDirectorMotion(3); b.world.updateDirectorMotion(3);
  const position = a.world.oceanWorldPosition(), target = a.world.directorMotionSnapshot().worldTarget;
  a.world.setOceanRenderOrigin(5376, -512);
  nearPoint(a.world.oceanWorldPosition(), position, 'rebase retains actual position');
  nearPoint(a.world.directorMotionSnapshot().worldTarget, target, 'rebase retains actual target');
  for (let i = 0; i < 18; i++) {
    a.world.updateDirectorMotion(.5); b.world.updateDirectorMotion(.5);
    nearPoint(a.world.oceanWorldPosition(), b.world.oceanWorldPosition(), 'origin-independent actual path');
    nearPoint(a.world.directorMotionSnapshot().worldTarget, b.world.directorMotionSnapshot().worldTarget, 'origin-independent target');
    assert.ok(finite(a.world.oceanWorldPosition()));
  }
  assert.equal(a.world.directorMotionSnapshot().complete, true);
  assert.deepEqual(preserved(a), beforeA); assert.deepEqual(preserved(b), beforeB);
  receipt.floatingOriginRetainsWorldPath = true;
});

test('missing composition or living sources stays honestly empty and never invents a full-scene demonstration', async () => {
  const f = await fixture(); f.world.oceanChunks.stats.loadedChunks = [];
  const before = preserved(f), position = f.world.oceanWorldPosition();
  assert.equal(f.world.enterLivingVisualScene(), false); assert.equal(f.world.livingVisualRoute.status, 'empty');
  nearPoint(f.world.oceanWorldPosition(), position, 'empty scene does not relocate camera');
  assert.equal(f.world.prepareDirectorObservation({ routeId: 'living-visual' }), true);
  assert.equal(f.world.beginDirectorMotion({ routeId: 'living-visual', durationSec: 12 }), true);
  assert.equal(f.world.livingVisualRoute.status, 'empty'); assert.equal(f.world.directorMotion.livingRoute, undefined);
  assert.equal(f.world.directorMotionSnapshot().observationRoute, undefined, 'ordinary fallback is not reported as a complete combination');
  f.world.updateDirectorMotion(1); assert.deepEqual(preserved(f), before);
  f.world.stopDirectorMotion(); f.world.oceanChunks.stats.loadedChunks = [...f.model._active.keys()];
  for (const row of f.model._active.values()) for (const agent of row.agents.concat(row.turtleAgents ?? [])) {
    if (!agent.alive) continue;
    agent.alive = false; agent.state = 'dead'; agent.energy = 0; recordLivingDeath(row, agent);
  }
  f.model.snapshot(); const noLife = preserved(f);
  assert.equal(f.world.currentLivingVisualRoute().status, 'empty'); assert.equal(f.world.enterLivingVisualScene(), false);
  assert.deepEqual(preserved(f), noLife);
  f.world.isLivingShallows = false; assert.equal(f.world.enterLivingVisualScene(), false);
  assert.equal(f.world.livingVisualRoute.status, 'empty'); assert.deepEqual(preserved(f), noLife);
  receipt.missingCompositionAndDeadSourcesRemainEmpty = true;
});

async function leaveLoadedSample(f) {
  const originals = clone([...f.model._active.values()]);
  assert.notEqual(await f.model.update({ x: 208, z: 176 }), false);
  assert.equal(f.model._active.size, 9);
  assert.ok(originals.every(row => !f.model._active.has(row.id)), 'the previous sample is genuinely unloaded');
  for (const row of originals) assert.deepEqual(f.store.records.get(`${f.model._world}|${row.id}`), row);
  f.world.camera.position.set(208 - f.world.oceanRenderOrigin.x, 3, 176 - f.world.oceanRenderOrigin.z);
  f.world.controls.target.set(216 - f.world.oceanRenderOrigin.x, 2, 176 - f.world.oceanRenderOrigin.z);
  // The renderer has not yet supplied a complete local view. Its ordinary
  // update publishes the actual current active owners after awaited loading.
  f.world.oceanChunks.stats.loadedChunks = [];
  f.world.oceanChunks.update = position => {
    f.calls.push(['chunk-update', { ...position }]);
    f.world.oceanChunks.stats.loadedChunks = [...f.model._active.keys()];
  };
  return originals;
}

test('the async sample entry actually loads its existing habitat stop and preserves every prior saved owner', async () => {
  const f = await fixture(), originals = await leaveLoadedSample(f), calls = [], entryCalls = [];
  const update = f.model.update.bind(f.model), environment = clone(f.model._environment), sim = clone(f.world.sim.agents);
  const enter = f.world.enterLivingShallows.bind(f.world);
  f.world.enterLivingShallows = index => {
    const result = enter(index);
    entryCalls.push({ id: f.generator.routeStops[index]?.id, result, position: { ...f.world.oceanWorldPosition() } });
    return result;
  };
  f.model.update = async position => { calls.push({ ...position }); return update(position); };
  assert.equal(await f.world.enterLivingVisualSample(), true);
  assert.equal(calls.length, 1, 'the adapter awaited the real ordinary ecology loader');
  assert.equal(entryCalls.length, 1); assert.equal(entryCalls[0].id, 'habitat-belt-reef'); assert.equal(entryCalls[0].result, true);
  assert.ok(Math.abs(entryCalls[0].position.x - 4760) < 1e-7 && Math.abs(entryCalls[0].position.z - 157) < 1e-7,
    'the sample starts from the exact existing normal/director habitat entry');
  provenance(f, f.world.livingVisualRoute);
  for (const row of originals) assert.deepEqual(f.model._active.get(row.id) ?? f.store.records.get(`${f.model._world}|${row.id}`), row);
  assert.deepEqual(f.model._environment, environment); assert.deepEqual(f.world.sim.agents, sim);
  assert.equal(f.world.livingClockSec, 321.4); assert.equal(f.world.speed, 1.5);
  receipt.asyncSampleEntryLoadsActualSavedOwners = true; receipt.sampleUsesExactExistingHabitatEntry = entryCalls[0];
});

test('manual camera or target takeover rejects a late async sample without undoing the user view', async () => {
  for (const takeover of ['position', 'target']) {
    const f = await fixture(), originals = await leaveLoadedSample(f), entered = deferred(), gate = deferred();
    const update = f.model.update.bind(f.model);
    f.model.update = async position => { entered.resolve(); await gate.promise; return update(position); };
    const pending = f.world.enterLivingVisualSample(); await entered.promise;
    if (takeover === 'position') f.world.camera.position.x += .3;
    else f.world.controls.target.z += .3;
    const position = f.world.oceanWorldPosition(), target = f.world.controls.target.clone();
    gate.resolve(); assert.equal(await pending, false);
    nearPoint(f.world.oceanWorldPosition(), position, 'late source arrival retains the manually chosen position');
    nearPoint(f.world.controls.target, target, 'late source arrival retains the manually chosen target');
    assert.equal(f.world.livingVisualRoute.status, 'empty', 'rejected late arrival is not advertised as an applied scene');
    for (const row of originals) assert.deepEqual(f.model._active.get(row.id) ?? f.store.records.get(`${f.model._world}|${row.id}`), row);
    assert.equal(f.world.livingClockSec, 321.4); assert.equal(f.world.speed, 1.5);
  }
  receipt.manualCameraAndTargetRejectLateAsyncEntry = true;
});

after(() => {
  if (process.env.LIVING_VISUAL_WORLD_RECEIPT) writeFileSync(process.env.LIVING_VISUAL_WORLD_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
});
