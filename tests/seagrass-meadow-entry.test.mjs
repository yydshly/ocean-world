import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';
import { DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, createDirectorState, directorReducer, directorStepAction } from '../src/directorTour.js';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';
import * as THREE from 'three';
import { seagrassMeadowRegionOrigin } from '../src/seagrassMeadowRegion.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';
import { isDirectorPlaybackRate, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';

// Execute shipped UI initialization and dispatch logic. These interface doubles
// verify delegation and stale ownership; the separate native World suite owns
// durable terrain, animal and moving-camera evidence. No React/GPU acceptance.
const source = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
function initializer(name, setter) {
  const prefix = `[${name},${setter}]=useState(`, begin = source.indexOf(prefix);
  assert.ok(begin >= 0); let quote = null, escaped = false, depth = 1, i = begin + prefix.length;
  const start = i;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++; else if (c === ')' && !--depth) break;
  }
  assert.equal(depth, 0);
  return new Function('window', 'localStorage', 'URLSearchParams', 'LIVING_SHALLOWS_PROFILE', `return (${source.slice(start, i)});`);
}
const initializers = [['pendingDemo', 'setPendingDemo'], ['biome', 'setBiome'], ['reefProfile', 'setReefProfile']]
  .map(([name, setter]) => initializer(name, setter));
const begin = source.indexOf('    if(choice.reefValleyRegionEntry||choice.seagrassMeadowRegionEntry){');
const end = source.indexOf('    if(choice.coastalLifeBeltEntry', begin);
assert.ok(begin >= 0 && end > begin);
const runEntry = new Function('choice', 'world', 'director', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', source.slice(begin, end));
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function entryFixture({ guided = false } = {}) {
  let resolve, reject, valid = true;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; }), log = [];
  const history = { timeSec: 132.4, dead: { id: 'retained-death', alive: false }, stocks: { plankton: .14 }, rng: 88 };
  const actual = { sim: { seed: 'retained-seed' }, disposed: false, controlStartCount: 2, _shallowSceneEntryToken: 10, history,
    enterReefValleyRegion() { throw new Error('meadow action dispatched to old reef entrance'); },
    enterSeagrassMeadowRegion(options) { this.options = options; this._shallowSceneEntryToken++; log.push(['native']); return pending; } };
  const world = { current: actual }, director = { isCurrent: token => valid && token === 37,
    applied: token => log.push(['applied', token]), fail: (token, message) => log.push(['failed', token, message]) };
  const choice = { seagrassMeadowRegionEntry: true, ...(guided ? { directorToken: 37 } : {}) };
  runEntry(choice, world, director, value => log.push(['view', value]), value => log.push(['tools', value]),
    value => log.push(['panel', value]), () => log.push(['remember']), value => log.push(['toast', value]));
  return { actual, world, log, resolve, reject, history, before: structuredClone(history), invalidate: () => valid = false };
}

test('direct meadow URL selects the living reef and its native action without rewriting stored world preferences', () => {
  const writes = [], storage = { getItem: key => key === 'tidal-observation-biome-v1' ? 'kelp' : 'legacy', setItem: (...args) => writes.push(args) };
  const values = search => initializers.map(make => make({ location: { search } }, storage, URLSearchParams, LIVING_SHALLOWS_PROFILE)());
  assert.deepEqual(values('?demo=seagrass-meadow-region'), [{ kind: 'living-stop', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE,
    stopId: 'seagrass-meadow-region', seagrassMeadowRegionEntry: true }, 'reef', LIVING_SHALLOWS_PROFILE]);
  assert.deepEqual(values(''), [null, 'kelp', 'legacy']); assert.deepEqual(writes, []);
  const pickSeed=initializer('seed','setSeed');
  assert.equal(pickSeed({location:{search:'?demo=seagrass-meadow-region&seed=44'}},storage,URLSearchParams,LIVING_SHALLOWS_PROFILE)(),'44');
  assert.equal(pickSeed({location:{search:''}},storage,URLSearchParams,LIVING_SHALLOWS_PROFILE)(),'42');
  assert.deepEqual(writes,[], 'URL seed selection never clears or rewrites stored world histories');
  const capability = DEMO_LIVING_STOPS.find(row => row.id === 'seagrass-meadow-region');
  const index = DIRECTOR_STEPS.findIndex(row => row.id === 'seagrass-meadow-region');
  assert.ok(capability && index > 0); assert.equal(capability.action.seagrassMeadowRegionEntry, true);
  assert.equal(DIRECTOR_STEPS[index - 1].id, 'reef-valley-region');
  assert.equal(DIRECTOR_STEPS[index].action, capability.action);
  const action = directorStepAction(DIRECTOR_STEPS[index]);
  assert.equal(action.biome, 'reef'); assert.equal(action.profile, LIVING_SHALLOWS_PROFILE);
  assert.equal(action.seagrassMeadowRegionEntry, true); assert.equal(action.reefValleyRegionEntry, undefined);
});

test('manual and director meadow entries wait for native durable preparation before confirming or remembering', async () => {
  for (const guided of [false, true]) {
    const f = entryFixture({ guided });
    assert.equal(f.log.filter(row => row[0] === 'native').length, 1); assert.equal(f.actual.options.isCurrent(), true);
    assert.equal(f.log.some(row => ['remember', 'applied'].includes(row[0])), false);
    f.resolve(true); await settle();
    assert.equal(f.log.filter(row => row[0] === 'remember').length, 1);
    assert.equal(f.log.filter(row => row[0] === 'applied').length, guided ? 1 : 0);
    assert.deepEqual(f.history, f.before);
  }
});

test('late meadow completion and errors lose ownership after stop, seek, manual controls, world, seed or native entry changes', async () => {
  const changes = [f => f.invalidate(), f => f.actual.controlStartCount++, f => f.world.current = {},
    f => f.actual.sim.seed = 'replacement', f => f.actual._shallowSceneEntryToken++, f => f.actual.disposed = true];
  for (const change of changes) for (const failed of [false, true]) {
    const f = entryFixture({ guided: true }); change(f);
    if (failed) f.reject(new Error('stale-durable-save-failed')); else f.resolve(true);
    await settle();
    assert.equal(f.log.some(row => ['remember', 'applied', 'failed', 'toast'].includes(row[0])), false);
    assert.deepEqual(f.history, f.before);
  }
  const stopped = entryFixture({ guided: true }); stopped.invalidate();
  assert.equal(stopped.actual.options.isCurrent(), false, 'native camera preparation also receives live chapter ownership');
  stopped.resolve(true); await settle();
});

test('preserved or failed meadow entries report the current attempt without claiming a generated replacement', async () => {
  for (const guided of [false, true]) for (const failed of [false, true]) {
    const f = entryFixture({ guided });
    if (failed) f.reject(new Error('durable-save-failed')); else f.resolve(false);
    await settle(); assert.equal(f.log.some(row => ['remember', 'applied'].includes(row[0])), false);
    const reports = f.log.filter(row => row[0] === (guided ? 'failed' : 'toast')); assert.equal(reports.length, 1);
    if (failed) assert.equal(reports[0].at(-1), 'durable-save-failed');
    else assert.match(reports[0].at(-1), /已有海域/);
    assert.deepEqual(f.history, f.before);
  }
});

test('the meadow chapter confirms only its completed 200-second native shot with current ownership', () => {
  const index = DIRECTOR_STEPS.findIndex(row => row.id === 'seagrass-meadow-region');
  let state = directorReducer(createDirectorState(), { type: 'start', index });
  state = directorReducer(state, { type: 'entered', token: state.token });
  const shot = { kind: 'reef-valley-route', durationSec: 200, elapsedSec: 200, complete: true };
  assert.equal(DIRECTOR_STEPS[index].motion.routeId, 'seagrass-meadow-region');
  assert.deepEqual(directorMotionCompletionEvent(shot, state, state.token, DIRECTOR_STEPS), { type: 'record-complete', token: state.token });
  for (const invalid of [{ ...shot, durationSec: 800 }, { ...shot, elapsedSec: 199.9 }, { ...shot, complete: false },
    { ...shot, error: 'loading-failed' }]) assert.equal(directorMotionCompletionEvent(invalid, state, state.token, DIRECTOR_STEPS), null);
  assert.equal(directorMotionCompletionEvent(shot, state, state.token - 1, DIRECTOR_STEPS), null);
  state = directorReducer(state, { type: 'record-complete', token: state.token });
  assert.deepEqual(state.completedStepIds, ['seagrass-meadow-region']);
  const stopped = directorReducer(state, { type: 'stop' });
  assert.equal(directorMotionCompletionEvent(shot, stopped, stopped.token, DIRECTOR_STEPS), null);
});

test('native keep entry preserves the previous exit pose and turns gradually into the meadow shot', async () => {
  const native = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  const method = name => {
    const marker = native.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
    const start = native.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
    const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(native.slice(start + 2));
    return native.slice(start, next ? start + 2 + next.index : native.lastIndexOf('\n}'));
  };
  const World = new Function('THREE', 'clamp', 'seagrassMeadowRegionOrigin', 'coastalSeascapeWindowReady', 'isDirectorPlaybackRate',
    'advanceDirectorCameraElapsed', `return class {${['oceanWorldPosition', 'currentSeagrassMeadowRegionPlan', 'planSeagrassMeadowEntry',
      'enterSeagrassMeadowRegion', 'createReefValleyRegionSegment', 'sampleReefValleyRegionSegment', 'beginDirectorMotion',
      'updateReefValleyRegionMotion'].map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp, seagrassMeadowRegionOrigin,
    coastalSeascapeWindowReady, isDirectorPlaybackRate, advanceDirectorCameraElapsed);
  // Lightweight fixed geometry isolates native entry/heading behavior. Actual
  // seed-dependent seam support and traversal are covered by the region suites.
  const origin = seagrassMeadowRegionOrigin(228, 4), start = new THREE.Vector3(228 * 64, -4, 320);
  const plan = { version: 9, theme: 'seagrass-meadow-region', group: { id: origin.id, cx: 228, cz: 4, ownerIds: origin.ownerIds,
    routePath: Array.from({ length: 65 }, (_, i) => ({ x: start.x + i * 6, y: start.y, z: start.z })) } };
  const owners = Array.from({ length: 3 }, (_, dz) => Array.from({ length: 3 }, (_, dx) => `${227 + dx},${4 + dz}`)).flat();
  const world = new World(), restores = [], updates = [], history = { clocks: 91, deaths: ['retained'], rng: 67, food: .24 };
  Object.assign(world, { isLivingShallows: true, disposed: false, oceanEcologyResetting: false, surfaceY: 8, controlStartCount: 0,
    keys: new Set(), sim: { seed: 'retained-seed' }, oceanRenderOrigin: { x: 228 * 64 - 32, z: 256 }, paused: false,
    camera: { position: start.clone().sub(new THREE.Vector3(228 * 64 - 32, 0, 256)) },
    controls: { target: start.clone().add(new THREE.Vector3(0, -.65, 8)).sub(new THREE.Vector3(228 * 64 - 32, 0, 256)),
      enableDamping: true, update() {} },
    oceanChunks: { stats: { loadedChunks: owners }, generator: { getRidgePlan: () => plan, sample: () => ({ habitat: 'seagrass' }) }, update() {} },
    oceanEcology: { _active: new Map(owners.map(id => [id, history])), async update(p) { updates.push(p.clone()); return true; } },
    restoreOceanObservation(view) { restores.push(view); return true; }, habitatY: () => -6, floorY: () => -6,
    clearCameraPosition: p => p, enforceCameraClearance() {}, emitSnapshot() {},
    currentReefValleyRegionPlan: () => ({ ...plan, version: 8, theme: 'reef-valley-region' }) });
  const camera = world.camera.position.clone(), target = world.controls.target.clone(), before = structuredClone(history);
  assert.deepEqual(world.planSeagrassMeadowEntry(), { kind: 'keep' });
  assert.equal(await world.enterSeagrassMeadowRegion(), true);
  assert.equal(restores.length, 0); assert.equal(updates.length, 2);
  assert.ok(world.camera.position.equals(camera)); assert.ok(world.controls.target.equals(target)); assert.deepEqual(history, before);
  assert.equal(world.beginDirectorMotion({ kind: 'reef-valley-route', routeId: 'reef-valley-region', groups: 1, durationSec: 200 }), false,
    'the existing reef route still requires its exact prepared target');
  assert.equal(world.beginDirectorMotion({ kind: 'reef-valley-route', routeId: 'seagrass-meadow-region', durationSec: 200 }), true);
  assert.ok(world.controls.target.equals(target));
  let previousDirection = new THREE.Vector3(0, -.65, 8);
  for (let sec = 1; sec <= 6; sec++) {
    world.updateReefValleyRegionMotion(1);
    assert.equal(world.directorMotion.error, null); assert.equal(world.directorMotion.elapsedSec, sec);
    const direction = world.controls.target.clone().sub(world.camera.position);
    assert.ok(direction.x > previousDirection.x, `camera turns toward the new route at second ${sec}`);
    assert.ok(direction.z < previousDirection.z, `camera releases the prior direction at second ${sec}`);
    assert.ok(direction.distanceTo(previousDirection) < 3, `one-second heading transition remains gradual at second ${sec}`);
    previousDirection = direction;
  }
  const frame = world.sampleReefValleyRegionSegment(world.directorMotion.reefValleySegments[0], 6, 200);
  const expected = new THREE.Vector3(frame.target.x - frame.position.x, frame.target.y - frame.position.y, frame.target.z - frame.position.z);
  assert.ok(previousDirection.distanceTo(expected) < 1e-10); assert.deepEqual(history, before);
});
