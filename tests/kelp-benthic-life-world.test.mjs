import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { KELP_BENTHIC_LIFE_IDS } from '../src/kelpBenthicLife.js';
import { KELP_BENTHIC_LIFE_ROUTE_STOPS } from '../src/kelpBenthicLifeRoutes.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_KELP_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';

// Shipped native navigation/normal camera methods with actual persistence and
// regional ecology. CPU/Three fixtures do not establish browser/GPU acceptance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight', 'KELP_BENTHIC_LIFE_IDS',
  'isDirectorPlaybackRate', 'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed',
  `return class {${['oceanWorldPosition', 'enterKelpBenthicLife', 'enterKelpForestBelt', 'travelKelpForestBelt',
    'kelpBenthicLifeObservation', 'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries', 'updateDirectorMotion', 'findAgent',
    'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY', 'floorY', 'habitatY',
    'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, KELP_BENTHIC_LIFE_IDS,
  isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed);
function fixture({ records = new Map(), benthicLife = true } = {}) {
  const generator = createKelpOceanGenerator('42', { forestBelt: true }), commits = [];
  const store = { available: true,
    async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new KelpOceanEcology('42', generator, { store, forestBelt: true, kelpSeascape: true, understory: true, visitors: true, benthicLife });
  const world = new World(), animals = new KelpOceanAnimals(sceneCatalogs.kelp), updates = [], requests = [], views = [];
  Object.assign(world, { biomeId: 'kelp', isKelp: true, isDeep: false, isLivingShallows: false, disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed: '42', agents: [], environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY, oceanRenderOrigin: { x: 0, z: 0 },
    camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30,
      enableDamping: true, update() {} }, highlight: new THREE.Group(), cameraRocks: [],
    oceanEcology: ecology, oceanAnimals: animals,
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {}, setDetailedHosts() {} },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {},
  });
  const request = world.requestOceanEcology.bind(world), restore = world.restoreOceanObservation.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  world.restoreOceanObservation = view => { views.push(structuredClone(view)); return restore(view); };
  const stop = generator.kelpBenthicLifeRouteStops.find(row => row.id === 'kelp-bottom-life'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, updates, requests, views, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const target = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));

test('ordinary forest-bottom entry awaits persisted native life and focuses a real animal, with exact cold revisit records', async t => {
  const f = fixture(); t.after(() => f.animals.dispose());
  assert.equal(await f.world.enterKelpBenthicLife(), true); await settle(f);
  const id = `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`, row = f.records.get(id);
  assert.equal(row.kelpBenthicLifeVersion, 1); assert.equal(f.ecology._active.size, 9);
  assert.ok(f.commits.some(rows => rows.some(([key, r]) => key === id && r.kelpBenthicLifeVersion === 1)));
  const actual = f.ecology.agents.filter(agent => agent.regionId === id && agent.alive && agent.kelpBenthicIndividualVersion === 1);
  assert.ok(actual.length > 0 && actual.every(agent => KELP_BENTHIC_LIFE_IDS.includes(agent.speciesId)));
  const anchor = actual.find(agent => agent.speciesId === 'giant-plumose-anemone')?.position ??
    actual.find(agent => agent.speciesId === 'red-abalone')?.position ?? actual[0].position;
  assert.ok(Math.hypot(target(f.world).x - anchor.x, target(f.world).z - anchor.z) < .05);
  f.animals.update(f.ecology.agents, 99999, f.world.oceanRenderOrigin, f.world.camera.position);
  for (const agent of actual) assert.ok(f.animals.entities.has(agent.id), `${agent.speciesId} actual native instance`);
  const p = f.world.oceanWorldPosition(); assert.ok(p.y >= f.generator.heightForCamera(p.x, p.z) + .25 - 1e-8); assert.ok(p.y <= f.generator.surfaceY - .5);
  const before = structuredClone([...f.records]), cold = fixture({ records: f.records }); t.after(() => cold.animals.dispose());
  assert.equal(await cold.world.enterKelpBenthicLife(), true); await settle(cold);
  assert.deepEqual([...cold.records], before, 'entry does not replace saved animals, clocks, hosts or food');
  assert.equal(f.world.errors.length + cold.world.errors.length, 0);
  const start = cold.world.oceanWorldPosition(); assert.equal(cold.world.travelKelpForestBelt(cold.stop.id), true);
  assert.deepEqual(cold.world.oceanWorldPosition(), start); assert.deepEqual(cold.world.oceanTravel, { x: cold.stop.x, z: cold.stop.z });
});

test('an old native forest remains exact and cannot report new life entry success or refill a complete saved population', async t => {
  const old = fixture({ benthicLife: false }); t.after(() => old.animals.dispose());
  assert.equal(old.world.enterKelpForestBelt(old.stop.id), true); await settle(old); await old.ecology.checkpoint();
  const before = structuredClone([...old.records]), enabled = fixture({ records: old.records }); t.after(() => enabled.animals.dispose());
  assert.equal(await enabled.world.enterKelpBenthicLife(), false); await settle(enabled);
  assert.deepEqual([...enabled.records], before); assert.ok(!enabled.ecology.agents.some(agent => agent.kelpBenthicIndividualVersion === 1));
  assert.ok(![...enabled.records.values()].some(row => row.kelpBenthicLifeVersion === 1));
  const position = enabled.world.oceanWorldPosition(), viewTarget = target(enabled.world), viewCount = enabled.views.length;
  assert.equal(enabled.world.kelpBenthicLifeObservation(), null);
  assert.equal(enabled.world.prepareDirectorObservation({ routeId: 'kelp-benthic-life' }), true);
  assert.deepEqual(enabled.world.oceanWorldPosition(), position); assert.deepEqual(target(enabled.world), viewTarget);
  assert.equal(enabled.views.length, viewCount); assert.deepEqual([...enabled.records], before, 'a director chapter cannot create absent historical animals');
});

test('pending native preparation cannot take the camera back after control, seed, view, reset, disposal or newer navigation', async t => {
  const takeovers = [world => { world.camera.position.x += 2; }, world => { world.controls.target.z += 2; },
    world => { world.controlStartCount++; }, world => { world.sim.seed = 'other'; }, world => { world.disposed = true; },
    world => { world.oceanEcologyResetting = true; }, world => { world.keys.add('KeyW'); }, world => { world.directorMotion = {}; },
    world => { world.directorEntry = { active: true }; }, world => { world._kelpSceneEntryToken++; },
    world => { world.enterKelpForestBelt('kelp-bottom-life'); }, world => { world.travelKelpForestBelt('kelp-bottom-life'); }];
  for (const takeover of takeovers) {
    const f = fixture(); t.after(() => f.animals.dispose()); let resume;
    f.world.requestOceanEcology = () => {}; f.ecology.update = () => new Promise(resolve => { resume = resolve; });
    const pending = f.world.enterKelpBenthicLife(); takeover(f.world);
    const position = f.world.oceanWorldPosition(), viewTarget = target(f.world), views = f.views.length; resume(true);
    assert.equal(await pending, false); assert.deepEqual(f.world.oceanWorldPosition(), position); assert.deepEqual(target(f.world), viewTarget);
    assert.equal(f.views.length, views, 'no stale animal focus after takeover'); assert.equal(f.records.size, 0);
  }
});

test('failed, unreadable, unready and historical-empty native loads never invent an animal focus', async t => {
  for (const status of ['failed', 'unready', 'empty', 'rejected']) {
    const f = fixture(); t.after(() => f.animals.dispose()); f.world.requestOceanEcology = () => {};
    const id = `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`;
    f.world.oceanEcology = { async update() { if (status === 'rejected') throw new Error('unreadable native store'); return status !== 'failed'; },
      agents: [], snapshot() { return { regions: status === 'empty' ? [{ id, kelpBenthicLifeVersion: 1 }] : [] }; } };
    if (status === 'rejected') await assert.rejects(() => f.world.enterKelpBenthicLife(), /unreadable native store/);
    else assert.equal(await f.world.enterKelpBenthicLife(), false);
    assert.equal(f.views.length, 1, 'only the normal native stop placement occurred'); assert.equal(f.records.size, 0);
  }
  for (const block of [world => { world.isKelp = false; }, world => { world.disposed = true; }, world => { world.oceanEcologyResetting = true; }, world => { world.oceanEcology = null; }]) {
    const f = fixture(); t.after(() => f.animals.dispose()); block(f.world);
    assert.equal(await f.world.enterKelpBenthicLife(), false); assert.equal(f.views.length, 0); assert.equal(f.records.size, 0);
  }
});

test('direct URL, ordinary control and moving director use the native route and frame actual life before a finite moving shot', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('kelpSeascape:true,benthicLife:true'));
  assert.match(app, /get\('demo'\)==='kelp-life'[\s\S]{0,260}kelpBenthicLifeEntry:true/);
  assert.match(app, /onClick=\{enterKelpBottomLife\}>林底新群落/);
  const branchStart = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    const entered=navigateDemoEntry', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.ok(app.slice(branchStart, branchEnd).includes('actual.enterKelpBenthicLife()'));
  assert.equal(sceneCatalogs.kelp.length, 12); assert.equal(sceneCatalogs.kelp.filter(species => species.kind !== 'kelp').length, 11);
  assert.deepEqual(KELP_BENTHIC_LIFE_ROUTE_STOPS.map(stop => stop.id), ['kelp-bottom-life']);
  const entry = DEMO_KELP_STOPS.find(stop => stop.id === 'kelp-bottom-life'), chapter = DIRECTOR_STEPS.find(step => step.action.stopId === 'kelp-bottom-life');
  assert.ok(entry && chapter); assert.equal(chapter.motion.kind, 'walk'); assert.equal(chapter.durationMs, 14000);
  assert.equal(chapter.motion.routeId, 'kelp-benthic-life');
  assert.equal(chapter.context.biome, 'kelp'); assert.equal(entry.action.kind, 'kelp-stop');
  const f = fixture(); try {
    f.world.requestOceanEcology = () => {};
    assert.equal(navigateDemoEntry(directorStepAction(chapter), f.world), true);
    assert.ok(Math.hypot(f.world.oceanWorldPosition().x - f.stop.x, f.world.oceanWorldPosition().z - f.stop.z) < 20);
    for (const stop of [...f.generator.forestRouteStops, ...f.generator.kelpSeascapeRouteStops]) assert.ok(DIRECTOR_STEPS.some(step => step.action.stopId === stop.id));
    assert.equal(await f.ecology.update(f.world.oceanWorldPosition()), true); await settle(f);
    assert.equal(f.ecology._active.size, 9);
    const id = `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`;
    const life = f.ecology.agents.filter(agent => agent.regionId === id && agent.alive && agent.kelpBenthicIndividualVersion === 1);
    const anchor = life.find(agent => agent.speciesId === 'giant-plumose-anemone')?.position ?? life.find(agent => agent.speciesId === 'red-abalone')?.position ?? life[0]?.position;
    assert.ok(anchor);
    const records = structuredClone([...f.records]), snapshot = structuredClone(f.ecology.snapshot());
    const nativePosition = f.world.oceanWorldPosition(), nativeTarget = target(f.world), view = f.world.kelpBenthicLifeObservation();
    assert.ok(view); assert.ok(Math.hypot(view.target.x - anchor.x, view.target.z - anchor.z) < .05);
    assert.deepEqual(f.world.oceanWorldPosition(), nativePosition); assert.deepEqual(target(f.world), nativeTarget);
    assert.deepEqual(f.ecology.snapshot(), snapshot, 'the shared observation helper is read-only');
    assert.equal(f.world.prepareDirectorObservation(chapter.motion), true);
    assert.ok(Math.hypot(target(f.world).x - anchor.x, target(f.world).z - anchor.z) < .05);
    assert.equal(f.world.beginDirectorMotion(chapter.motion), true);
    const shot = f.world.directorMotion.shot, queries = f.world.directorMotionQueries(), first = sampleDirectorCameraMotion(shot, 0, queries);
    const forward = new THREE.Vector3(first.target.x - first.position.x, 0, first.target.z - first.position.z).normalize();
    const towardLife = new THREE.Vector3(anchor.x - first.position.x, 0, anchor.z - first.position.z).normalize();
    assert.ok(forward.dot(towardLife) > .99, 'the animals behind the generic +X stop are in front of the actual director shot');
    const camera = new THREE.PerspectiveCamera(f.world.camera.fov, f.world.camera.aspect, .05, 60);
    camera.position.set(first.position.x, first.position.y, first.position.z); camera.lookAt(first.target.x, first.target.y, first.target.z); camera.updateMatrixWorld(true);
    const projected = new THREE.Vector3(anchor.x, anchor.y + .15, anchor.z).project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1, 'actual animal anchor enters the initial native camera frustum');
    for (const seconds of [0, 3.5, 7, 14]) {
      const frame = sampleDirectorCameraMotion(shot, seconds, queries);
      assert.ok(frame.position.y >= f.world.habitatY(frame.position.x, frame.position.z) + .25 - 1e-8);
      assert.ok(frame.position.y <= f.generator.surfaceY - .5); assert.ok(Object.values(frame.position).every(Number.isFinite));
    }
    const start = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(7);
    assert.equal(f.world.directorMotion.elapsedSec, 7); assert.ok(f.world.oceanWorldPosition().distanceTo(start) > 1);
    f.world.paused = true; const paused = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(2); assert.deepEqual(f.world.oceanWorldPosition(), paused);
    f.world.paused = false; f.world.updateDirectorMotion(7); assert.equal(f.world.directorMotion.elapsedSec, 14);
    assert.equal(f.world.directorMotion.complete, true); assert.equal(f.world.directorMotion.error, null);
    assert.deepEqual(f.ecology.snapshot(), snapshot); assert.deepEqual([...f.records], records, 'director movement retains actual population, owner clocks and food history');
  } finally { f.animals.dispose(); }
  assert.equal(DIRECTOR_STEPS.length, 55); assert.equal(new Set(DIRECTOR_STEPS.map(step => step.action.id)).size, 49);
  assert.equal(DIRECTOR_STEPS.reduce((sum, step) => sum + step.durationMs, 0), 656000);
});

test('ordinary and direct-URL asynchronous UI results cannot overwrite a newer world, seed, control, disposal or entry toast', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const enterKelpBottomLife=async()=>'), end = app.indexOf('  const enterKelpScene=', start);
  assert.ok(start >= 0 && end > start); const fn = app.slice(start, end).trim().replace('const enterKelpBottomLife=', 'return ');
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpBenthicLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
    const pending = invoke(); takeover(actual); resume(false); await pending;
    assert.equal(toast.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let reject; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpBenthicLife() { return new Promise((_resolve, no) => { reject = no; }); } }, current = { current: actual };
  const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
  const pending = invoke(); current.current = { sim: { seed: 'new-world' } }; reject(new Error('old pending failure')); await pending;
  assert.deepEqual(toast, []);
  const branchStart = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    const entered=navigateDemoEntry', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  const branch = `return function(choice){${app.slice(branchStart, branchEnd)}}`;
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpBenthicLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
      current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text));
    invoke({ kelpBenthicLifeEntry: true }); takeover(actual); resume(true); await Promise.resolve(); await Promise.resolve();
    assert.equal(receipts.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let fail; const directToast = [], direct = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpBenthicLife() { return new Promise((_resolve, reject) => { fail = reject; }); } }, directCurrent = { current: direct };
  const directInvoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
    directCurrent, () => {}, () => {}, () => {}, () => directToast.push('remembered'), text => directToast.push(text));
  directInvoke({ kelpBenthicLifeEntry: true }); directCurrent.current = { sim: { seed: 'new-world' } }; fail(new Error('old direct URL failure'));
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(directToast, []);
});
