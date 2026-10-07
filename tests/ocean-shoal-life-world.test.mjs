import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { OCEAN_SHOAL_LIFE_IDS } from '../src/oceanShoalLife.js';
import { OCEAN_SHOAL_LIFE_ROUTE_STOPS } from '../src/oceanShoalLifeRoutes.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';

// Execute shipped methods against the actual seeded habitat, regional store,
// native animal dispatcher and Three camera. No browser/GPU or visual claim.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight',
  'isDirectorPlaybackRate', 'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed',
  `return class {${['oceanWorldPosition', 'enterOceanShoalLife', 'enterLivingShallows', 'travelLivingShallows',
    'oceanShoalLifeObservation', 'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries',
    'updateDirectorMotion', 'findAgent', 'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY',
    'floorY', 'habitatY', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight,
  isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed);
function fixture({ records = new Map(), shoalLife = true } = {}) {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const commits = [], store = { available: true,
    async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, shallowSeascape: true,
    turtleGrazing: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife });
  const world = new World(), animals = new OceanAnimals(livingShallowsSpeciesCatalog), updates = [], requests = [], views = [];
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, agents: [], environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY,
    camera: new THREE.PerspectiveCamera(49, 16 / 9), oceanRenderOrigin: { x: 0, z: 0 },
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18,
      maxDistance: 30, enableDamping: true, update() {} }, highlight: new THREE.Group(), cameraRocks: [],
    oceanEcology: ecology, oceanAnimals: animals,
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {}, setDetailedHosts() {} },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {},
  });
  const request = world.requestOceanEcology.bind(world), restore = world.restoreOceanObservation.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  world.restoreOceanObservation = view => { views.push(structuredClone(view)); return restore(view); };
  const stopIndex = generator.routeStops.findIndex(row => row.id === 'shoal-life-community'); assert.ok(stopIndex >= 0);
  return { world, ecology, generator, records, commits, animals, updates, requests, views, stopIndex, stop: generator.routeStops[stopIndex] };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const target = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));
const ownerId = f => `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`;
const actualLife = f => f.ecology.agents.filter(agent => agent.regionId === ownerId(f) && agent.alive && agent.shoalLifeIndividualVersion === 1);
const anchorOf = agents => { const school = agents.filter(a => a.speciesId !== 'blacktip-reef-shark'), watched = school.length ? school : agents;
  return watched.length ? watched.reduce((p,a) => ({ x:p.x+a.position.x/watched.length,y:p.y+a.position.y/watched.length,z:p.z+a.position.z/watched.length }), { x:0,y:0,z:0 }) : null; };

test('ordinary shoal entry persists each actual independent school fish before focus, with exact cold revisit', async t => {
  const f = fixture(); t.after(() => f.animals.dispose());
  assert.equal(await f.world.enterOceanShoalLife(), true); await settle(f);
  const id = ownerId(f), row = f.records.get(id), life = actualLife(f), anchor = anchorOf(life);
  assert.equal(row.shoalLifeVersion, 1); assert.equal(f.ecology._active.size, 9);
  assert.ok(f.commits.some(rows => rows.some(([key, saved]) => key === id && saved.shoalLifeVersion === 1)));
  assert.ok(life.length > 0 && life.length <= 8 && life.every(agent => OCEAN_SHOAL_LIFE_IDS.includes(agent.speciesId)));
  const school=life.filter(a=>a.groupId);assert.ok(school.length>=5 && school.length<=7);assert.equal(new Set(school.map(a=>a.groupId)).size,1);
  assert.equal(new Set(life.map(a=>a.id)).size,life.length);assert.ok(life.every(a=>Number.isFinite(a.organicUnits)&&a.organicUnits>0&&a.timeSec===row.timeSec));
  assert.deepEqual([...school.map(a=>a.id)].sort(),[...row.shoalLife.school.memberIds].sort(),'school is a fixed roster of actual records, not visual children');
  assert.ok(Math.hypot(target(f.world).x - anchor.x, target(f.world).z - anchor.z) < .05);
  f.animals.update(f.ecology.agents, 999999, f.world.oceanRenderOrigin, f.world.camera.position, f.ecology.scenery);
  for (const agent of life) { assert.ok(f.animals.entities.has(agent.id),`${agent.speciesId} actual native instance`);assert.equal(f.animals.getObject(agent.id).userData.agentId,agent.id); }
  assert.equal(new Set(life.map(a=>f.animals.getObject(a.id))).size,life.length);
  const p = f.world.oceanWorldPosition(); assert.ok(p.y >= f.world.habitatY(p.x, p.z) + .25 - 1e-8);
  assert.ok(p.y <= f.generator.surfaceY - .5); assert.ok(f.ecology.snapshot().regions.every(region => region.agentCount <= 20));
  const before = structuredClone([...f.records]), cold = fixture({ records: f.records }); t.after(() => cold.animals.dispose());
  assert.equal(await cold.world.enterOceanShoalLife(), true); await settle(cold);
  assert.deepEqual([...cold.records], before, 'entry cannot replace saved animals, deaths, clocks, plants or food');
  assert.equal(f.world.errors.length + cold.world.errors.length, 0);
  cold.world.oceanEcologyResetting=true;assert.equal(cold.world.oceanShoalLifeObservation(),null);
  cold.world.oceanEcologyResetting=false;cold.world.oceanChunks=null;assert.equal(cold.world.oceanShoalLifeObservation(),null);
});

test('historical native owners cannot refill the new group or report an empty director observation as success', async t => {
  const old = fixture({ shoalLife: false }); t.after(() => old.animals.dispose());
  assert.equal(old.world.enterLivingShallows(old.stopIndex), true); await settle(old); await old.ecology.checkpoint();
  const before = structuredClone([...old.records]), enabled = fixture({ records: old.records }); t.after(() => enabled.animals.dispose());
  assert.equal(await enabled.world.enterOceanShoalLife(), false); await settle(enabled);
  assert.deepEqual([...enabled.records], before); assert.ok(!enabled.ecology.agents.some(agent => agent.shoalLifeIndividualVersion === 1));
  assert.ok(![...enabled.records.values()].some(row => row.shoalLifeVersion === 1));
  const position = enabled.world.oceanWorldPosition(), viewTarget = target(enabled.world), viewCount = enabled.views.length;
  assert.equal(enabled.world.oceanShoalLifeObservation(), null);
  assert.equal(enabled.world.prepareDirectorObservation({ routeId: 'shoal-life' }), false);
  assert.deepEqual(enabled.world.oceanWorldPosition(), position); assert.deepEqual(target(enabled.world), viewTarget);
  assert.equal(enabled.views.length, viewCount); assert.deepEqual([...enabled.records], before);
});

test('pending native entry cannot take back a camera after manual movement, seed, controls, reset, disposal or newer navigation', async t => {
  const takeovers = [world => { world.camera.position.x += 2; }, world => { world.controls.target.z += 2; },
    world => { world.controlStartCount++; }, world => { world.sim.seed = 'other'; }, world => { world.disposed = true; },
    world => { world.oceanEcologyResetting = true; }, world => { world.keys.add('KeyW'); }, world => { world.directorMotion = {}; },
    world => { world.directorEntry = { active: true }; }, world => { world._shallowSceneEntryToken++; },
    world => { world.enterLivingShallows(0); }, world => { world.travelLivingShallows(0); }];
  for (const takeover of takeovers) {
    const f = fixture(); t.after(() => f.animals.dispose()); let resume;
    f.world.requestOceanEcology = () => {}; f.ecology.update = () => new Promise(resolve => { resume = resolve; });
    const pending = f.world.enterOceanShoalLife(); takeover(f.world);
    const position = f.world.oceanWorldPosition(), viewTarget = target(f.world), viewCount = f.views.length; resume(true);
    assert.equal(await pending, false); assert.deepEqual(f.world.oceanWorldPosition(), position); assert.deepEqual(target(f.world), viewTarget);
    assert.equal(f.views.length, viewCount, 'no stale native animal focus'); assert.equal(f.records.size, 0);
  }
});

test('failed, unready, unreadable and empty native loads never invent a focus or success, and blocked worlds do not enter', async t => {
  for (const status of ['failed', 'unready', 'empty', 'rejected']) {
    const f = fixture(); t.after(() => f.animals.dispose()); f.world.requestOceanEcology = () => {};
    f.world.oceanEcology = { async update() { if (status === 'rejected') throw new Error('unreadable native store'); return status !== 'failed'; },
      agents: [], snapshot() { return { regions: status === 'empty' ? [{ id: ownerId(f), shoalLifeVersion: 1 }] : [] }; } };
    if (status === 'rejected') await assert.rejects(() => f.world.enterOceanShoalLife(), /unreadable native store/);
    else assert.equal(await f.world.enterOceanShoalLife(), false);
    assert.equal(f.views.length, 1, 'only the ordinary native stop placement occurred'); assert.equal(f.records.size, 0);
  }
  for (const block of [world => { world.isLivingShallows = false; }, world => { world.disposed = true; },
    world => { world.oceanEcologyResetting = true; }, world => { world.oceanEcology = null; }, world => { world.oceanChunks = null; }]) {
    const f = fixture(); t.after(() => f.animals.dispose()); block(f.world);
    assert.equal(await f.world.enterOceanShoalLife(), false); assert.equal(f.views.length, 0); assert.equal(f.records.size, 0);
  }
});

test('URL, ordinary button and director share native admission and frame real life before a finite continuous moving shot', async t => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('shoalLife:this.isLivingShallows'));
  const hook=readFileSync(new URL('../src/useDirectorTour.js',import.meta.url),'utf8');assert.ok(hook.includes("'shoal-life'"));
  assert.match(app, /get\('demo'\)==='shoal-life'[\s\S]{0,240}shoalLifeEntry:true/);
  assert.match(app, /onClick=\{enterShoalCommunity\}>水层鱼群/);
  assert.equal(livingShallowsSpeciesCatalog.length, 43); assert.deepEqual(OCEAN_SHOAL_LIFE_ROUTE_STOPS.map(stop => stop.id), ['shoal-life-community']);
  const entry = DEMO_LIVING_STOPS.find(stop => stop.id === 'shoal-life-community'), chapter = DIRECTOR_STEPS.find(step => step.action.stopId === 'shoal-life-community');
  assert.ok(entry && chapter); assert.equal(entry.action.kind, 'living-stop'); assert.equal(entry.action.shoalLifeEntry, true);
  assert.equal(chapter.motion.kind, 'walk'); assert.equal(chapter.motion.routeId, 'shoal-life'); assert.equal(chapter.durationMs, 16000);
  const f = fixture(); t.after(() => f.animals.dispose()); f.world.requestOceanEcology = () => {};
  assert.equal(navigateDemoEntry(directorStepAction(chapter), f.world), true);
  assert.notEqual(await f.ecology.update(f.world.oceanWorldPosition()), false); await settle(f);
  assert.equal(f.ecology._active.size, 9); const anchor = anchorOf(actualLife(f)); assert.ok(anchor);
  const records = structuredClone([...f.records]), snapshot = structuredClone(f.ecology.snapshot());
  const nativePosition = f.world.oceanWorldPosition(), nativeTarget = target(f.world), view = f.world.oceanShoalLifeObservation(); assert.ok(view);
  assert.ok(Math.hypot(view.target.x - anchor.x, view.target.z - anchor.z) < .05);
  assert.deepEqual(f.world.oceanWorldPosition(), nativePosition); assert.deepEqual(target(f.world), nativeTarget);
  assert.deepEqual(f.ecology.snapshot(), snapshot, 'the shared native observation helper is read-only');
  assert.equal(f.world.prepareDirectorObservation(chapter.motion), true); assert.equal(f.world.beginDirectorMotion(chapter.motion), true);
  const shot = f.world.directorMotion.shot, queries = f.world.directorMotionQueries(), first = sampleDirectorCameraMotion(shot, 0, queries);
  const camera = new THREE.PerspectiveCamera(f.world.camera.fov, f.world.camera.aspect, .05, 60);
  camera.position.set(first.position.x, first.position.y, first.position.z); camera.lookAt(first.target.x, first.target.y, first.target.z); camera.updateMatrixWorld(true);
  const visible = actualLife(f).filter(a => a.groupId).map(a => new THREE.Vector3(a.position.x,a.position.y,a.position.z).project(camera));
  assert.ok(visible.some(p => Math.abs(p.x)<1 && Math.abs(p.y)<1 && p.z>-1 && p.z<1), 'an actual independently saved school member is in the initial native camera frustum');
  for (const seconds of [0, 4, 8, 16]) {
    const frame = sampleDirectorCameraMotion(shot, seconds, queries);
    assert.ok(frame.position.y >= f.world.habitatY(frame.position.x, frame.position.z) + .25 - 1e-8);
    assert.ok(frame.position.y <= f.generator.surfaceY - .5); assert.ok(Object.values(frame.position).every(Number.isFinite));
  }
  const start = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(8);
  assert.equal(f.world.directorMotion.elapsedSec, 8); assert.ok(f.world.oceanWorldPosition().distanceTo(start) > 1);
  f.world.paused = true; const paused = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(2); assert.deepEqual(f.world.oceanWorldPosition(), paused);
  f.world.paused = false; f.world.updateDirectorMotion(8); assert.equal(f.world.directorMotion.elapsedSec, 16);
  assert.equal(f.world.directorMotion.complete, true); assert.equal(f.world.directorMotion.error, null);
  assert.deepEqual(f.ecology.snapshot(), snapshot); assert.deepEqual([...f.records], records, 'camera shot cannot advance, replenish or replace ecology');
  assert.equal(DIRECTOR_STEPS.length, 59); assert.equal(new Set(DIRECTOR_STEPS.map(step => step.action.id)).size, 53);
  assert.equal(DIRECTOR_STEPS.reduce((sum, step) => sum + step.durationMs, 0), 716000);
});

test('ordinary and URL completion cannot overwrite a newer world, seed, control, disposal or entry toast', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const enterShoalCommunity=async()=>'), end = app.indexOf('  useEffect(', start); assert.ok(start >= 0 && end > start);
  const fn = app.slice(start, end).trim().replace('const enterShoalCommunity=', 'return ');
  const branchStart = app.indexOf('    if(choice.shoalLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    const entered=navigateDemoEntry', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart); const branch = `return function(choice){${app.slice(branchStart, branchEnd)}}`;
  for (const mode of ['ordinary', 'URL']) for (const entered of [true, false]) for (const takeover of [() => {}, world => { world.disposed = true; },
    world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._shallowSceneEntryToken++; },
    (_world, current) => { current.current = { sim: { seed: 'replacement' } }; }]) {
    let resume; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _shallowSceneEntryToken: 0, disposed: false,
      enterOceanShoalLife() { this._shallowSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = mode === 'ordinary' ? new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => receipts.push(text)) :
      new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text));
    const pending = invoke(mode === 'URL' ? { shoalLifeEntry: true } : undefined); takeover(actual, current); resume(entered);
    await pending; await Promise.resolve(); await Promise.resolve();
    const fresh = current.current === actual && !actual.disposed && actual.sim.seed === '42' && actual.controlStartCount === 0 && actual._shallowSceneEntryToken === 1;
    assert.equal(receipts.length, fresh ? 1 : 0);
    if (fresh && mode === 'URL') assert.equal(receipts[0] === 'remembered', entered, 'only a current successful native URL entry stores observation memory');
  }
  for (const mode of ['ordinary', 'URL']) {
    let reject; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _shallowSceneEntryToken: 1, disposed: false,
      enterOceanShoalLife() { return new Promise((_resolve, no) => { reject = no; }); } }, current = { current: actual };
    const invoke = mode === 'ordinary' ? new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => receipts.push(text)) :
      new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text));
    const pending = invoke(mode === 'URL' ? { shoalLifeEntry: true } : undefined); current.current = { sim: { seed: 'new-world' } }; reject(new Error('stale failure'));
    await pending; await Promise.resolve(); await Promise.resolve(); assert.deepEqual(receipts, []);
  }
});
