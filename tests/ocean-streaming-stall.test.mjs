import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';
import { advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const clone = value => structuredClone(value);
function extract(source, name) {
  const plain = source.indexOf(`  ${name}(`), start = plain >= 0 ? plain : source.indexOf(`  async ${name}(`); assert.ok(start >= 0, name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const ecologySource = readFileSync(new URL('../src/oceanEcology.js', import.meta.url), 'utf8');
const Queue = new Function('STEP', 'clone', `return class {${['step', 'checkpoint', '_enqueue', '_storage', '_saveRecords'].map(name => extract(ecologySource, name)).join('\n')}}`)(.5, clone);

test('a stalled save queues only one automatic checkpoint and an explicit pause save still captures the latest full records', async () => {
  const gate = deferred(), disk = new Map(), commits = [], q = new Queue();
  const original = { id: '0,0', timeSec: 0, agents: [{ id: 'old-death', alive: false }], resources: { plankton: .4 }, ledger: { ingested: .2 } };
  Object.assign(q, { _disposed: false, _generation: 0, _world: 'world', _active: new Map([['0,0', clone(original)]]),
    _queue: Promise.resolve(), _accumulator: 0, _activeTime: 0, _checkpointAt: 10, _lockedRegions: new Set(), _counts: { saved: 0, persistenceErrors: 0 },
    setEnvironment: value => value, _regionEnvironment: () => ({}), _tick: region => { region.timeSec += .5; },
    _preparePelagicFrames() {}, _applyMantaTransfers() {}, _transportPlankton() {},
    store: { async saveMany(world, rows) {
      commits.push(clone(rows)); if (commits.length === 1) await gate.promise;
      for (const [id, row] of rows) disk.set(id, clone(row));
    } } });
  q.step(10); await flush(); assert.equal(commits.length, 1);
  const operations = [], loaded = q._enqueue(() => operations.push('window'));
  for (let i = 0; i < 12; i++) q.step(10);
  const explicit = q.checkpoint(); await flush(); assert.equal(commits.length, 1);
  gate.resolve(); await Promise.all([loaded, explicit]);
  assert.deepEqual(operations, ['window']); assert.equal(commits.length, 2, 'twelve intervals did not create twelve extra saves');
  assert.deepEqual(disk.get('0,0'), { ...original, timeSec: 130 });
  q.step(10); await q._queue; assert.equal(commits.length, 3);
  assert.deepEqual(disk.get('0,0'), { ...original, timeSec: 140 });
});

test('a failed automatic save releases its slot and cannot poison a queued window or explicit checkpoint', async () => {
  const q = new Queue(); let count = 0;
  Object.assign(q, { _disposed: false, _generation: 0, _world: 'world', _active: new Map([['0,0', { id: '0,0', agents: [] }]]),
    _queue: Promise.resolve(), _accumulator: 0, _activeTime: 0, _checkpointAt: 10, _lockedRegions: new Set(), _counts: { saved: 0, persistenceErrors: 0 },
    setEnvironment: value => value, _regionEnvironment: () => ({}), _tick() {},
    _preparePelagicFrames() {}, _applyMantaTransfers() {}, _transportPlankton() {},
    store: { async saveMany() { if (++count === 1) throw new Error('injected slow disk failure'); } } });
  q.step(10); await flush(); assert.equal(q._automaticCheckpoint, null); assert.equal(q._counts.persistenceErrors, 1);
  assert.equal(await q._enqueue(() => 'next-window'), 'next-window');
  await q.checkpoint(); assert.equal(count, 2); assert.equal(q._counts.saved, 1);
});

test('the actual asynchronous ecology request keeps its old window on a failed read and admits the same next window on retry', async () => {
  const gate = deferred(), disk = new Map(); let blocked = false, fail = false;
  const seed = livingShallowsSeed('77'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const store = { available: true, async load(world, id) {
    if (blocked) { blocked = false; await gate.promise; if (fail) throw Error('injected read timeout'); }
    return clone(disk.get(id) ?? null);
  }, async saveMany(world, rows) { for (const [id, row] of rows) disk.set(id, clone(row)); } };
  const ecology = new OceanEcology(seed, generator, { store, livingGeology: true });
  await ecology.update({ x: 32, z: 32 }); const old = clone([...ecology._active]);
  blocked = true; fail = true; const pending = ecology.update({ x: 96, z: 32 }); await flush();
  assert.ok(isDeepStrictEqual([...ecology._active], old), 'the camera need not await the load to retain its prior window');
  gate.resolve(); assert.equal(await pending, false); assert.ok(isDeepStrictEqual([...ecology._active], old));
  fail = false; await ecology.update({ x: 96, z: 32 });
  assert.equal(ecology._active.size, 9); assert.ok(ecology._active.has('2,0')); assert.ok(!ecology._active.has('-1,0'));
  const existing = ecology._active.get('0,0'); assert.ok(isDeepStrictEqual(existing, old.find(([id]) => id === '0,0')[1]));
  await ecology.dispose();
});

test('the shipped native camera waits without an advance while a window is pending, then moves from the same position after publication', async () => {
  const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  const World = new Function('THREE', 'coastalSeascapeWindowReady', 'advanceDirectorCameraElapsed',
    `return class {${extract(source, 'updateReefValleyRegionMotion')}}`)(THREE, coastalSeascapeWindowReady, advanceDirectorCameraElapsed);
  const ids = [-1, 0, 1].flatMap(z => [-1, 0, 1].map(x => `${x},${z}`));
  const gate = deferred(), world = new World(), agents = [{ id: 'existing-death', alive: false }];
  const motion = { active: true, complete: false, reefValleyRoute: {}, elapsedSec: 5, travelledM: 0, playbackRate: 1,
    lastPosition: { x: 32, y: -2, z: 32 }, reefValleySegments: [{}], shot: { groups: 1, kind: 'reef-valley-route', durationSec: 240, segmentDurationSec: 240 } };
  Object.assign(world, { directorMotion: motion, paused: false, surfaceY: 8, oceanRenderOrigin: { x: 0, z: 0 },
    camera: { position: new THREE.Vector3(32, -2, 32) }, controls: { target: new THREE.Vector3(42, -2, 32), enableDamping: true, update() {} },
    oceanEcology: { _active: new Map(ids.slice(1).map(id => [id, {}])), agents }, oceanChunks: { stats: { loadedChunks: ids }, generator: {} },
    oceanWorldPosition: () => world.camera.position.clone(),
    sampleReefValleyRegionSegment: () => ({ position: { x: 33, y: -2, z: 32 }, target: { x: 43, y: -2, z: 32 } }),
    floorY: () => -5, habitatY: () => -5, clearCameraPosition: p => p, enforceCameraClearance() {} });
  const publishing = gate.promise.then(() => world.oceanEcology._active.set(ids[0], {}));
  for (let i = 0; i < 20; i++) world.updateReefValleyRegionMotion(.12);
  assert.equal(motion.waitingForRegions, true); assert.equal(motion.elapsedSec, 5); assert.equal(motion.travelledM, 0);
  assert.deepEqual(world.camera.position.toArray(), [32, -2, 32]);
  gate.resolve(); await publishing; world.updateReefValleyRegionMotion(.12);
  assert.equal(motion.waitingForRegions, false); assert.equal(motion.elapsedSec, 5.12); assert.equal(motion.travelledM, 1);
  assert.deepEqual(agents, [{ id: 'existing-death', alive: false }]); assert.equal(world.directorMotion, motion);
});
