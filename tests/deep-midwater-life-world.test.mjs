import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DeepOceanAnimals } from '../src/world/DeepOceanAnimals.js';
import { DEFAULT_ENVIRONMENT } from '../src/deepSimulation.js';
import { DEEP_MIDWATER_LIFE_IDS, deepMidwaterLifeBodyPoints, deepMidwaterLifePositionValid, validateDeepMidwaterLifeRecord } from '../src/deepMidwaterLife.js';
import { DEEP_MIDWATER_LIFE_ROUTE_STOPS } from '../src/deepMidwaterLifeRoutes.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { deepOceanLayerHeight } from '../src/deepOceanNavigation.js';
import { oceanOverviewObservation } from '../src/oceanOverview.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_DEEP_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';

// Actual shipped methods, native generation, atomic store and ecology. These
// finite CPU cases establish neither browser/GPU appearance nor a whole tour.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes('  async ' + name + '(') ? '  async ' + name + '(' : '  ' + name + '(';
  const start = source.indexOf(marker); assert.ok(start >= 0, 'shipped ' + name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight', 'deepOceanLayerHeight', 'oceanOverviewObservation',
  'isDirectorPlaybackRate', 'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed',
  'return class {' + ['oceanWorldPosition', 'enterDeepMidwaterLife', 'deepMidwaterLifeObservation', 'enterDeepSeascape', 'travelDeepSeascape',
    'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries', 'updateDirectorMotion', 'findAgent',
    'restoreOceanObservation', 'captureOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY', 'floorY', 'habitatY',
    'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology', 'setOceanOverview', 'updateDeepOceanWater', 'setPaused'].map(method).join('\n') + '}')(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, deepOceanLayerHeight, oceanOverviewObservation,
  isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed);
function fixture({ records = new Map(), midwaterLife = true } = {}) {
  const generator = createDeepOceanGenerator('42', { seascape: true }), commits = [], updates = [], requests = [], views = [], environments = [];
  const store = { available: true,
    async load(_world, id) { store.onRead?.(id); if (store.beforeRead) await store.beforeRead;
      if (store.readFault === 'undefined') return undefined;
      if (store.readFault === 'throw') throw new Error('native store read failure');
      return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { if (store.saveFault) return null;
      commits.push(rows.map(([id]) => id)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
    async clear() { records.clear(); },
  };
  const ecology = new DeepOceanEcology('42', generator, { store, seascape: true, wholeSeascape: true,
    benthicLife: true, hardLife: true, waterLife: true, midwaterLife });
  const world = new World(), animals = new DeepOceanAnimals(sceneCatalogs.deep);
  Object.assign(world, { biomeId: 'deep', isDeep: true, isKelp: false, isLivingShallows: false, disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed: '42', agents: [], environment: { ...DEFAULT_ENVIRONMENT },
      metrics: { timeSec: 0, visibilityM: 5.67 }, timeSec: 0 }, elapsed: 0, errors: [], controlStartCount: 0, keys: new Set(),
    surfaceY: generator.surfaceY, oceanRenderOrigin: { x: 0, z: 0 }, camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30,
      enableDamping: true, update() {} }, highlight: new THREE.Group(), cameraRocks: [], deepParticles: new THREE.Group(), visualEnvironment: {},
    oceanEcology: ecology, oceanAnimals: animals, catalog: new Map(sceneCatalogs.deep.map(s => [s.id, s])),
    oceanChunks: { generator, update(p) { updates.push(p.clone()); }, setRenderOrigin() {}, setDetailedHosts() {},
      setEnvironment(env, time) { environments.push({ env: structuredClone(env), time }); } },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {} });
  const request = world.requestOceanEcology.bind(world), restore = world.restoreOceanObservation.bind(world);
  world.requestOceanEcology = p => { requests.push(p.clone()); return request(p); };
  world.restoreOceanObservation = view => { views.push(structuredClone(view)); return restore(view); };
  const stop = generator.deepMidwaterLifeRouteStops.find(row => row.id === 'deep-midwater-life'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, updates, requests, views, environments, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
async function release(f) { f.animals.dispose(); await f.ecology.dispose(); f.generator.clearCache(); }
const target = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));
const owner = f => Math.floor(f.stop.x / 64) + ',' + Math.floor(f.stop.z / 64);
const life = f => f.ecology.agents.filter(a => a.regionId === owner(f) && a.alive && a.deepMidwaterIndividualVersion === 1);
const rawBefore = f => new Map(structuredClone([...f.records]));
function existingExact(f, before) {
  for (const [id, row] of before) assert.ok(isDeepStrictEqual(f.records.get(id), row), 'exact already-saved owner ' + id);
}
function fullBounds(agents) { return new THREE.Box3().setFromPoints(agents.flatMap(a => deepMidwaterLifeBodyPoints(a).map(p => new THREE.Vector3(p.x, p.y, p.z)))); }
function assertColumn(f) {
  const p = f.world.oceanWorldPosition(), depth = f.generator.surfaceY - p.y;
  assert.equal(f.world.deepMidwaterObservation, true); assert.ok(depth > 650 && depth < 750);
  assert.ok(p.y > f.generator.heightAt(p.x, p.z) + 2000, 'actual open water, far above the former floor+8 band');
  assert.ok(Math.abs(p.y - 2800) < 4); assert.equal(f.world.oceanObservationLayer, 'free');
}

test('ordinary real-column entrance, whole community overview and origin rebase retain exact native cold records', async () => {
  const f = fixture(); let cold;
  try {
    assert.equal(await f.world.enterDeepMidwaterLife(), true); await settle(f); assertColumn(f);
    const id = owner(f), row = f.records.get(id), animals = life(f); assert.equal(row.deepMidwaterLifeVersion, 1);
    assert.equal(f.ecology._active.size, 9); assert.equal(animals.length, 3); assert.equal(new Set(animals.map(a => a.speciesId)).size, 3);
    assert.ok(f.commits.some(ids => ids.includes(id)), 'saved before successful public focus');
    const bounds = fullBounds(animals), centre = bounds.getCenter(new THREE.Vector3()); assert.ok(target(f.world).distanceTo(centre) < 1e-9);
    f.animals.update(f.ecology.agents, 99999, f.world.oceanRenderOrigin);
    assert.ok(animals.every(a => f.animals.getObject(a.id)));
    const p = f.world.oceanWorldPosition(), t = target(f.world), origin = { ...f.world.oceanRenderOrigin };
    f.world.setOceanRenderOrigin(origin.x + 64, origin.z - 64); assert.deepEqual(f.world.oceanWorldPosition(), p); assert.deepEqual(target(f.world), t);
    const before = f.ecology.snapshot(); assert.equal(f.world.setOceanOverview(), true); await settle(f); assertColumn(f);
    assert.ok(target(f.world).distanceTo(centre) < 1e-9); assert.ok(isDeepStrictEqual(f.ecology.snapshot(), before), 'overview reads the actual community without evolving food or clocks');
    f.world.updateDeepOceanWater(); const env = f.world.oceanLocalWater;
    assert.equal(env.waterZone, 'mesopelagic-twilight'); assert.equal(env.observerDepthM, f.generator.surfaceY - f.world.oceanWorldPosition().y);
    assert.ok(env.clearanceAboveSeafloorM > 2000); assert.equal(env.lightAtDepth, null); assert.equal(env.naturalSunlight, null);
    for (const key of ['temperatureC', 'salinityPSU', 'oxygenMgPerL']) assert.equal(env[key], null);
    assert.equal(env.localPhotosynthesis, false); assert.equal(env.photosyntheticLightAvailable, false);
    // Same XY can still change the vertical layer: the travel short-distance
    // return must not suppress bed -> column, or column -> legacy bed.
    const sx = f.stop.x, sz = f.stop.z, bedY = f.world.oceanLayerY(sx, sz, 'bed', 0, false);
    assert.equal(f.world.restoreOceanObservation({ position: { x: sx, y: bedY, z: sz }, target: { x: sx + 3, y: bedY, z: sz }, layer: 'bed',
      freeDepthM: f.generator.surfaceY - bedY, habitat: f.generator.sample(sx, sz).habitat }), true);
    assert.equal(f.world.deepMidwaterObservation, false); assert.equal(f.world.travelDeepSeascape(f.stop.id), true); await settle(f); assertColumn(f);
    const old = f.generator.wholeSeascapeRouteStops[0] ?? f.generator.seascapeRouteStops[0]; assert.ok(old);
    assert.equal(f.world.travelDeepSeascape(old.id), true); await settle(f); assert.equal(f.world.deepMidwaterObservation, false);
    const floorP = f.world.oceanWorldPosition(); assert.ok(floorP.y <= f.generator.heightAt(floorP.x, floorP.z) + 8);
    f.world.updateDeepOceanWater(); assert.equal(f.world.oceanLocalWater.lightAtDepth, 0); assert.equal(f.world.oceanLocalWater.naturalSunlight, false);
    assert.equal(await f.world.enterDeepMidwaterLife(), true); await settle(f);
    f.ecology.step(.4); assert.equal(await f.world.setPaused(true), true); assert.equal(f.world.paused, true);
    for (const a of life(f)) { assert.equal(a.timeSec, .4); assert.ok(deepMidwaterLifePositionValid(f.generator, f.ecology._active.get(id), a)); }
    f.animals.update(f.ecology.agents, 1000000, f.world.oceanRenderOrigin);
    for (const a of life(f)) assert.equal(f.animals.getObject(a.id).userData.deepMidwaterLifeLastTimeSec, .4);
    const persisted = rawBefore(f); f.animals.dispose(); f.generator.clearCache();
    cold = fixture({ records: new Map(structuredClone([...persisted])) });
    assert.equal(await cold.world.enterDeepMidwaterLife(), true); await settle(cold); assertColumn(cold); existingExact(cold, persisted);
    assert.ok(life(cold).every(a => a.timeSec === .4)); assert.equal(cold.world.errors.length, 0);
  } finally { if (cold) await release(cold); await release(f); }
});

test('old histories and dead-only saved water communities neither refill nor become proxy director targets', async () => {
  const old = fixture({ midwaterLife: false }); let enabled, warm, dead;
  try {
    // Native old floor history at exactly the new geographic owner.
    const x = old.stop.x, z = old.stop.z, y = old.world.oceanLayerY(x, z, 'bed', 0, false);
    assert.equal(old.world.restoreOceanObservation({ position: { x, y, z }, target: { x: x + 3, y, z }, layer: 'bed',
      freeDepthM: old.generator.surfaceY - y, habitat: old.generator.sample(x, z).habitat }), true);
    await settle(old); await old.ecology.checkpoint(); const before = rawBefore(old);
    enabled = fixture({ records: new Map(structuredClone([...before])) });
    assert.equal(await enabled.world.enterDeepMidwaterLife(), false); await settle(enabled); existingExact(enabled, before);
    assert.equal(enabled.world.deepMidwaterLifeObservation(), null); assert.equal(enabled.world.prepareDirectorObservation({ routeId: old.stop.id }), false);
    assert.ok(!enabled.ecology.agents.some(a => a.deepMidwaterIndividualVersion === 1));
    await release(enabled); enabled = null; await release(old);
    warm = fixture(); assert.equal(await warm.world.enterDeepMidwaterLife(), true); await settle(warm); warm.ecology.step(.1);
    for (const r of warm.ecology._active.values()) for (const a of r.deepMidwaterLifeAgents ?? []) {
      r.deepMidwaterEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead'; a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 };
    }
    await warm.ecology.checkpoint(); const frozen = rawBefore(warm); warm.animals.dispose(); warm.generator.clearCache();
    dead = fixture({ records: new Map(structuredClone([...frozen])) }); assert.equal(await dead.world.enterDeepMidwaterLife(), false); await settle(dead);
    existingExact(dead, frozen); assert.equal(dead.world.deepMidwaterLifeObservation(), null); assert.equal(dead.world.prepareDirectorObservation({ routeId: dead.stop.id }), false);
    const bodies = dead.ecology.agents.filter(a => a.deepMidwaterIndividualVersion === 1).map(a => structuredClone(a));
    dead.ecology.step(.1); assert.ok(isDeepStrictEqual(dead.ecology.agents.filter(a => a.deepMidwaterIndividualVersion === 1), bodies), 'dead time and full pose remain frozen');
    dead.animals.update(dead.ecology.agents, 50000, dead.world.oceanRenderOrigin);
    assert.ok(bodies.every(a => !dead.animals.getObject(a.id)), 'dead saved records produce no substitute renderer');
  } finally { for (const f of [dead, warm, enabled, old]) if (f) await release(f); }
});

test('actual pending cold loads cannot overwrite later controls, seeds, keys, navigation or disposal', async () => {
  const base = fixture(); let before;
  try { assert.equal(await base.world.enterDeepMidwaterLife(), true); await settle(base); before = rawBefore(base); }
  finally { await release(base); }
  const takeovers = [w => { w.camera.position.x += 2; }, w => { w.controls.target.z += 2; }, w => { w.controlStartCount++; },
    w => { w.sim.seed = 'other'; }, w => { w.disposed = true; }, w => { w.oceanEcologyResetting = true; }, w => { w.keys.add('KeyW'); },
    w => { w.directorMotion = {}; }, w => { w.directorEntry = { active: true }; }, w => { w._deepSceneEntryToken++; },
    w => { w.enterDeepSeascape('deep-midwater-life'); }];
  for (const takeover of takeovers) {
    const f = fixture({ records: new Map(structuredClone([...before])) });
    try {
      let resume, started; f.store.beforeRead = new Promise(resolve => { resume = resolve; });
      const reading = new Promise(resolve => { started = resolve; }); f.store.onRead = () => started();
      const pending = f.world.enterDeepMidwaterLife(); await reading; takeover(f.world);
      const p = f.world.oceanWorldPosition(), t = target(f.world), views = f.views.length; resume();
      assert.equal(await pending, false); await settle(f); assert.deepEqual(f.world.oceanWorldPosition(), p); assert.deepEqual(target(f.world), t);
      assert.equal(f.views.length, views); existingExact(f, before);
    } finally { await release(f); }
  }
});

test('undefined reads, rejected commits and pause save failure preserve strict publication and readiness', async () => {
  for (const fault of ['undefined', 'throw', 'save-refused']) {
    const f = fixture(); try {
      if (fault === 'save-refused') f.store.saveFault = true; else f.store.readFault = fault;
      assert.equal(await f.world.enterDeepMidwaterLife(), false); await settle(f); assert.equal(f.views.length, 1);
      assert.equal(f.records.size, 0); assert.equal(f.ecology._active.size, 0); assert.equal(f.animals.stats.activeAnimals, 0);
      assert.equal(f.world.deepMidwaterLifeObservation(), null); assert.equal(f.world.prepareDirectorObservation({ routeId: f.stop.id }), false);
    } finally { await release(f); }
  }
  for (const block of [w => { w.isDeep = false; }, w => { w.disposed = true; }, w => { w.oceanEcologyResetting = true; }, w => { w.oceanEcology = null; }]) {
    const f = fixture(); try { block(f.world); assert.equal(await f.world.enterDeepMidwaterLife(), false); assert.equal(f.views.length, 0); assert.equal(f.records.size, 0); }
    finally { await release(f); }
  }
  const f = fixture(); try {
    assert.equal(await f.world.enterDeepMidwaterLife(), true); await settle(f); const before = rawBefore(f);
    f.store.saveFault = true; await assert.rejects(f.world.setPaused(true), /保存失败/); assert.equal(f.world.paused, true); existingExact(f, before);
    f.store.saveFault = false;
  } finally { await release(f); }
});

test('real midwater route and a finite director orbit frame the three whole forms at true depth with paused native clocks', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.match(app, /get\('demo'\)==='deep-midwater-life'[\s\S]{0,240}deepMidwaterLifeEntry:true/);
  assert.match(app, /onClick=\{enterDeepMidwaterCommunity\}>中层水体群落/); assert.ok(source.includes('midwaterLife:true'));
  assert.equal(sceneCatalogs.deep.length, 15); assert.equal(sceneCatalogs.deep.filter(s => DEEP_MIDWATER_LIFE_IDS.includes(s.id)).length, 3);
  assert.deepEqual(DEEP_MIDWATER_LIFE_ROUTE_STOPS.map(s => s.id), ['deep-midwater-life']);
  const entry = DEMO_DEEP_STOPS.find(s => s.id === 'deep-midwater-life'), chapter = DIRECTOR_STEPS.find(s => s.action.stopId === 'deep-midwater-life');
  assert.ok(entry && chapter); assert.equal(chapter.motion.kind, 'orbit'); assert.equal(chapter.durationMs, 16000);
  assert.equal(chapter.motion.routeId, 'deep-midwater-life'); assert.equal(chapter.context.biome, 'deep');
  const f = fixture(); try {
    assert.equal(navigateDemoEntry(directorStepAction(chapter), f.world), true); assertColumn(f);
    assert.equal(await f.ecology.update(f.world.oceanWorldPosition()), true); await settle(f);
    const actual = life(f); assert.equal(actual.length, 3); const centre = fullBounds(actual).getCenter(new THREE.Vector3());
    assert.equal(f.world.prepareDirectorObservation(chapter.motion), true); await settle(f);
    assert.ok(target(f.world).distanceTo(centre) < 1e-9); assertColumn(f);
    const snapshot = f.ecology.snapshot(), records = rawBefore(f);
    assert.equal(f.world.beginDirectorMotion(chapter.motion), true); const shot = f.world.directorMotion.shot, queries = f.world.directorMotionQueries();
    for (const seconds of [0, 4, 8, 16]) {
      const frame = sampleDirectorCameraMotion(shot, seconds, queries); assert.ok(Object.values(frame.position).every(Number.isFinite));
      const depth = f.generator.surfaceY - frame.position.y; assert.ok(depth >= 600 && depth <= 1000);
      const camera = new THREE.PerspectiveCamera(49, 16 / 9, .05, 60); camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.target.x, frame.target.y, frame.target.z); camera.updateMatrixWorld(true);
      for (const a of actual) { const p = new THREE.Vector3(a.position.x, a.position.y, a.position.z).project(camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1, 'actual ' + a.speciesId + ' enters sampled CPU frustum'); }
    }
    const start = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(8); assert.ok(f.world.oceanWorldPosition().distanceTo(start) > .1);
    await f.world.setPaused(true); const paused = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(2); assert.deepEqual(f.world.oceanWorldPosition(), paused);
    assert.equal(f.ecology.snapshot().metrics.saved, snapshot.metrics.saved + 9, 'pause atomically acknowledges exactly the nine active records');
    snapshot.metrics.saved += 9;
    assert.ok(life(f).every(a => a.timeSec === 0)); await f.world.setPaused(false); f.world.updateDirectorMotion(8);
    assert.equal(f.world.directorMotion.elapsedSec, 16); assert.equal(f.world.directorMotion.complete, true); assert.equal(f.world.directorMotion.error, null);
    assert.ok(isDeepStrictEqual(f.ecology.snapshot(), snapshot)); existingExact(f, records);
    // Explicit 160 native updates establish activity, independently of the
    // camera path; no all-species-feeding or full GPU-tour claim is made.
    const initial = new Map(actual.map(a => [a.id, structuredClone(a.position)])); f.ecology.step(16); await f.ecology.checkpoint();
    for (const a of life(f)) { assert.equal(a.timeSec, 16); assert.ok(deepMidwaterLifePositionValid(f.generator, f.ecology._active.get(owner(f)), a)); }
    assert.ok(life(f).some(a => Math.hypot(a.position.x - initial.get(a.id).x, a.position.y - initial.get(a.id).y, a.position.z - initial.get(a.id).z) > 1e-5));
    for (const a of life(f)) assert.equal(f.records.get(owner(f)).deepMidwaterLifeAgents.find(saved => saved.id === a.id).timeSec, 16);
    assert.equal(f.world.errors.length, 0);
  } finally { await release(f); }
  assert.equal(DIRECTOR_STEPS.length, 66); assert.equal(new Set(DIRECTOR_STEPS.map(s => s.action.id)).size, 60);
  assert.equal(DIRECTOR_STEPS.reduce((sum, s) => sum + s.durationMs, 0), 1794000);
});

test('ordinary and direct URL asynchronous results never overwrite a newer world, seed, controls or toast', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const enterDeepMidwaterCommunity=async()=>'), next = /\n  const [A-Za-z_]\w*=/.exec(app.slice(start + 2)), end = next ? start + 2 + next.index : -1;
  assert.ok(start >= 0 && end > start); const fn = app.slice(start, end).trim().replace('const enterDeepMidwaterCommunity=', 'return ');
  const branchStart = app.indexOf('    if(choice.deepMidwaterLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    if(choice.deepWaterLifeEntry', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart); const branch = 'return function(choice){' + app.slice(branchStart, branchEnd) + '}';
  for (const direct of [false, true]) for (const takeover of ['none', 'world', 'seed', 'control', 'disposed', 'token']) {
    let resume; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _deepSceneEntryToken: 0, disposed: false,
      enterDeepMidwaterLife() { this._deepSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = direct ? new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
      current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text))
      : new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => receipts.push(text));
    const pending = invoke(direct ? { deepMidwaterLifeEntry: true } : undefined);
    if (takeover === 'world') current.current = { sim: { seed: 'other-world' } };
    if (takeover === 'seed') actual.sim.seed = 'other'; if (takeover === 'control') actual.controlStartCount++;
    if (takeover === 'disposed') actual.disposed = true; if (takeover === 'token') actual._deepSceneEntryToken++;
    resume(true); if (pending) await pending; await Promise.resolve(); await Promise.resolve();
    assert.equal(receipts.length, takeover === 'none' ? 1 : 0);
  }
  for (const direct of [false, true]) {
    let reject; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _deepSceneEntryToken: 0, disposed: false,
      enterDeepMidwaterLife() { this._deepSceneEntryToken++; return new Promise((_resolve, no) => { reject = no; }); } }, current = { current: actual };
    const invoke = direct ? new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
      current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text))
      : new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => receipts.push(text));
    const pending = invoke(direct ? { deepMidwaterLifeEntry: true } : undefined); current.current = { sim: { seed: 'new-world' } };
    reject(new Error('old pending failure')); if (pending) await pending; await Promise.resolve(); await Promise.resolve(); assert.deepEqual(receipts, []);
  }
});
