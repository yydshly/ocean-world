import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirectorState, directorReducer, DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { directorSceneReady } from '../src/directorReadiness.js';
import { isDirectorPlaybackRate } from '../src/directorCameraMotion.js';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';
import { directorTourProgress } from '../src/directorTourProgress.js';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';

// Execute the production hook with finite, controlled hook commits, effects,
// RAF and timers. World interfaces are explicit test doubles. This is not a
// React mount, actual terrain traversal, WebGL or browser acceptance test.
const source = readFileSync(new URL('../src/useDirectorTour.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function useDirectorTour', 'function useDirectorTour');
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const around = (cx, cz) => [-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx => ({ id: `${cx + dx},${cz + dz}` })));

function worldFixture({ biomeId = 'reef', living = true, entryKind = 'cut' } = {}) {
  const log = [], environment = { currentMps: .17, turbidity: .3, foodSupply: .8, hour: 17 };
  const protectedState = { seed: 'saved-world-seed', timeSec: 132.4, animals: [{ id: 'old-death', alive: false }],
    stock: { plankton: .75 }, ledger: { input: .1, ingested: .05 }, environment: clone(environment) };
  const world = { biomeId, isLivingShallows: living, disposed: false, paused: false, speed: 2,
    center: [3, 3], ready: true, missingOwner: false, position: { x: 208, y: 3, z: 208 }, target: { x: 216, y: 1, z: 208 },
    protectedState, bridge: { kind: null, active: false, complete: false, error: null, elapsedSec: 0, durationSec: 2 },
    shot: { kind: null, active: false, complete: false, error: null, elapsedSec: 0, durationSec: 0 },
    planDirectorEntry(action) { log.push(['plan', action.id]); return { kind: entryKind, reason: 'finite-test-entry', choiceId: action.id,
      worldKey: `${this.biomeId}:${this.isLivingShallows ? 'living' : 'original'}`, view: { position: { x: 214, y: 3, z: 208 }, target: this.target },
      motion: { durationSec: 2 } }; },
    async setPaused(value) { this.paused = value; log.push(['paused', value]); if (this.pauseGate) await this.pauseGate.promise; return value; },
    setEnvironment(value) { log.push(['environment', clone(value)]); Object.assign(environment, value); },
    snapshot() {
      const regions = around(...this.center); if (this.missingOwner) regions.pop();
      return { biomeId: this.biomeId, ...(this.isLivingShallows ? { sceneProfile: LIVING_SHALLOWS_PROFILE } : {}), runId: `world-${this.biomeId}-${this.isLivingShallows}`,
        environment: clone(environment), ocean: { exploring: true, chunkId: this.center.join(','),
          ecology: { metrics: { loadingRegions: this.ready ? 0 : 2, activeRegions: regions.length, alive: 4 }, regions },
          localHabitat: { status: this.ready ? 'ready' : 'loading' } } };
    },
    beginDirectorEntry(plan, playback) { log.push(['bridge-begin', plan, clone(playback)]); this.bridge = { ...this.bridge, kind: 'continuous', active: true, complete: false,
      playing: playback?.playing, playbackRate: playback?.playbackRate }; return true; },
    directorEntrySnapshot() { return clone(this.bridge); },
    setDirectorEntryPlayback(playback) { log.push(['bridge-playback', clone(playback)]); Object.assign(this.bridge, playback); this.onEntryPlayback?.(); return true; },
    stopDirectorEntry() { log.push(['bridge-stop']); this.bridge.active = false; },
    prepareDirectorObservation(motion) { log.push(['prepare', clone(motion)]); this.onPrepare?.(); return this.prepareResult ?? true; },
    beginDirectorMotion(motion) { log.push(['shot-begin', clone(motion)]); this.shot = { kind: motion.kind, active: true, complete: false, error: null,
      elapsedSec: 0, durationSec: motion.durationSec }; return true; },
    directorMotionSnapshot() { return clone(this.shot); },
    setDirectorPlaybackRate(rate) { log.push(['shot-rate', rate]); return true; },
    stopDirectorMotion() { log.push(['shot-stop']); this.shot.active = false; },
  };
  for (const name of ['reset', 'step', 'resetResources']) world[name] = () => assert.fail(`The hook must not call ${name}`);
  return { world, log, protectedState: clone(protectedState) };
}

function harness(world, { execute: executeOverride, samplePreparation = false } = {}) {
  let state = createDirectorState(), refCursor = 0, dirty = true, now = 0, nextId = 1, api;
  const refs = [], committed = [], queued = [], events = [], execution = [], notices = [], controls = [];
  const frames = new Map(), cancelledFrames = [], timers = new Map();
  const document = { visibilityState: 'visible' }, window = { location: { search: '' } };
  const requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id; };
  const cancelAnimationFrame = id => { if (frames.has(id)) cancelledFrames.push(frames.get(id)); frames.delete(id); };
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  const setTimer = (callback, delay, repeat = false) => { const id = nextId++; timers.set(id, { callback, delay, due: now + delay, repeat }); return id; };
  const useRef = value => refs[refCursor++] ?? (refs[refCursor - 1] = { current: value });
  const useReducer = () => [state, event => { events.push(clone(event)); const next = directorReducer(state, event); if (next !== state) { state = next; dirty = true; } }];
  const useEffect = (callback, dependencies) => queued.push({ callback, dependencies });
  // The public opening now walks the complete scene directly. Keep the
  // supported source-based nearby route's second-window contract covered too.
  const testedSteps = samplePreparation ? [{ ...DIRECTOR_STEPS[0],
    motion: { ...DIRECTOR_STEPS[0].motion, routeId: 'living-visual' } }, ...DIRECTOR_STEPS.slice(1)] : DIRECTOR_STEPS;
  const hook = new Function('useEffect', 'useReducer', 'useRef', 'createDirectorState', 'directorReducer',
    'DIRECTOR_STEPS', 'directorStepAction', 'directorSceneReady', 'isDirectorPlaybackRate', 'directorMotionCompletionEvent', 'directorTourProgress',
    'window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    `${source}\nreturn useDirectorTour;`)(useEffect, useReducer, useRef, createDirectorState, directorReducer, testedSteps,
    directorStepAction, directorSceneReady, isDirectorPlaybackRate, directorMotionCompletionEvent, directorTourProgress,
    window, document, { now: () => now }, requestAnimationFrame, cancelAnimationFrame,
    (fn, delay) => setTimer(fn, delay), id => timers.delete(id), (fn, delay) => setTimer(fn, delay, true), id => timers.delete(id));
  const inputs = { worldRef: { current: world }, snapshot: world.snapshot(), worldReady: true, error: null, recording: false,
    paused: world.paused, speed: world.speed, onControls: (...args) => controls.push(args), onNotice: value => notices.push(value),
    execute(action) {
      execution.push({ action: clone(action), transition: clone(state.transition), phase: state.phase, now });
      executeOverride?.(action, run);
      if (action.directorEntryPlan) assert.equal(navigateDemoEntry(action, inputs.worldRef.current, {
        movingDirector: true, directorEntryPlan: action.directorEntryPlan, playing: state.playing, playbackRate: state.playbackRate,
      }), true, 'the actual navigation adapter must acquire the accepted nearby bridge');
      api.applied(action.directorToken);
    } };
  function render() {
    dirty = false; refCursor = 0; queued.length = 0; api = hook(inputs);
    for (let index = 0; index < queued.length; index++) {
      const item = queued[index], old = committed[index];
      if (!old || item.dependencies?.length !== old.dependencies?.length ||
          item.dependencies?.some((value, i) => !Object.is(value, old.dependencies[i]))) {
        old?.cleanup?.(); committed[index] = { dependencies: item.dependencies && [...item.dependencies], cleanup: item.callback() };
      }
    }
  }
  async function flush() {
    for (let i = 0; i < 50; i++) {
      if (dirty) render(); await Promise.resolve(); await Promise.resolve();
      if (!dirty) { await Promise.resolve(); if (!dirty) return; }
    }
    assert.fail('The finite hook commits did not settle.');
  }
  function publish(snapshot = inputs.worldRef.current.snapshot()) { inputs.snapshot = snapshot; dirty = true; }
  async function advance(ms, { snapshot = true } = {}) {
    now += ms;
    const callbacks = [...frames]; frames.clear(); for (const [, callback] of callbacks) callback(now);
    const due = [...timers].filter(([, timer]) => timer.due <= now);
    for (const [id, timer] of due) {
      if (!timers.has(id)) continue;
      if (timer.repeat) timer.due = now + timer.delay; else timers.delete(id);
      timer.callback();
    }
    if (snapshot) publish(); await flush();
  }
  async function until(predicate, label, limitMs = 5000) {
    for (let elapsed = 0; elapsed <= limitMs; elapsed += 25) { await flush(); if (predicate()) return; await advance(25); }
    assert.fail(`${label}: ${JSON.stringify(state)}`);
  }
  const run = { inputs, events, execution, notices, controls, document, frames, cancelledFrames,
    flush, advance, until, publish, get api() { return api; }, get state() { return state; }, get now() { return now; },
    async runCancelledFrames() { for (const callback of cancelledFrames.splice(0)) callback(now); await flush(); } };
  render(); return run;
}
const count = (log, name) => log.filter(row => row[0] === name).length;
const nearbyEntryIndex = DIRECTOR_STEPS.findIndex(step => step.id === 'shallows-habitat-belt-reef');
const start = async (run, index = 0) => { run.api.start(index); await run.flush(); };

test('a distant reposition executes only under full cover and begins its shot only after reveal', async () => {
  const f = worldFixture(), run = harness(f.world);
  await start(run); assert.equal(run.execution.length, 0); assert.equal(run.state.elapsedMs, 0);
  await run.until(() => run.execution.length === 1, 'the finite cover must execute the requested entry');
  assert.equal(run.execution[0].transition.phase, 'covered'); assert.equal(run.execution[0].transition.opacity, 1);
  assert.equal(count(f.log, 'shot-begin'), 0);
  await run.until(() => run.state.phase === 'showing', 'the finite reveal must finish before observing');
  assert.equal(run.state.transition.phase, 'none'); assert.equal(run.state.transition.opacity, 0);
  assert.equal(count(f.log, 'prepare'), 0); assert.equal(count(f.log, 'shot-begin'), 1);
  assert.equal(run.state.elapsedMs, 0); assert.deepEqual(f.world.protectedState, f.protectedState);
});

test('cross-world loading and a second physical window requested by preparation remain covered until truly ready', async () => {
  const old = worldFixture({ living: false }), fresh = worldFixture(); fresh.world.ready = false;
  let preparedUnder;
  const run = harness(old.world, { samplePreparation: true, execute(_action, h) { h.inputs.worldRef.current = fresh.world; h.publish(); } });
  fresh.world.onPrepare = () => { preparedUnder = clone(run.state.transition); fresh.world.missingOwner = true; run.publish(); };
  await start(run); await run.until(() => run.execution.length === 1, 'cross-world cut must execute');
  assert.equal(run.execution[0].transition.kind, 'cross-world');
  await run.advance(1000); assert.equal(run.state.transition.phase, 'covered'); assert.equal(count(fresh.log, 'prepare'), 0);
  fresh.world.ready = true; run.publish(); await run.flush();
  await run.until(() => count(fresh.log, 'prepare') === 1, 'the first actual window must permit covered preparation');
  assert.equal(preparedUnder.phase, 'covered'); assert.equal(preparedUnder.opacity, 1);
  await run.advance(1000); assert.equal(run.state.phase, 'loading'); assert.equal(run.state.transition.phase, 'covered');
  assert.equal(count(fresh.log, 'shot-begin'), 0); assert.equal(run.state.elapsedMs, 0);
  fresh.world.missingOwner = false; run.publish(); await run.flush();
  await run.until(() => run.state.phase === 'showing', 'the post-positioning complete window must unlock reveal');
  assert.equal(count(fresh.log, 'prepare'), 1); assert.equal(count(fresh.log, 'shot-begin'), 1);
  assert.deepEqual(old.world.protectedState, old.protectedState); assert.deepEqual(fresh.world.protectedState, fresh.protectedState);
});

test('a nearby continuous bridge stays visible and waits for both movement completion and its actual loaded window', async () => {
  const f = worldFixture({ entryKind: 'continuous' }), run = harness(f.world);
  f.world.onEntryPlayback = () => run.publish(); // The production setter emits a new snapshot.
  await start(run, nearbyEntryIndex); await run.until(() => run.execution.length === 1, 'nearby entry must execute without a fade');
  assert.equal(run.execution[0].action.directorEntryPlan.kind, 'continuous');
  assert.equal(run.state.transition.phase, 'move'); assert.equal(run.state.transition.opacity, 0);
  assert.equal(count(f.log, 'bridge-begin'), 1); assert.equal(count(f.log, 'prepare'), 0);
  run.publish(); await run.flush(); // Commit the applied token once before ordinary setter-emitted snapshots.
  const playbackUpdates = count(f.log, 'bridge-playback');
  for (let i = 0; i < 5; i++) { run.publish(); await run.flush(); }
  assert.equal(count(f.log, 'bridge-playback'), playbackUpdates, 'ordinary snapshot publication must not feed back into the playback setter');
  await run.advance(1000); assert.equal(run.state.phase, 'loading'); assert.equal(run.state.elapsedMs, 0);
  f.world.bridge.active = false; f.world.bridge.complete = true; f.world.missingOwner = true;
  await run.advance(1000); assert.equal(run.state.phase, 'loading'); assert.equal(count(f.log, 'shot-begin'), 0);
  f.world.missingOwner = false; run.publish(); await run.flush();
  await run.until(() => run.state.phase === 'showing', 'completed nearby movement and all actual owners must admit its shot');
  assert.equal(run.state.transition.opacity, 0); assert.equal(count(f.log, 'shot-begin'), 1); assert.equal(run.state.elapsedMs, 0);
  assert.deepEqual(f.world.protectedState, f.protectedState);
});

test('a keep entry opens its existing tool without fading or acquiring an entry camera path', async () => {
  const f = worldFixture({ entryKind: 'keep' }), run = harness(f.world), position = clone(f.world.position);
  const index = DIRECTOR_STEPS.findIndex(step => step.id === 'tools-catalog'); assert.ok(index >= 0);
  await start(run, index); await run.until(() => run.execution.length === 1, 'the existing tool must be applied');
  assert.equal(directorSceneReady(run.execution[0].action, f.world, run.inputs.snapshot, { panelReady: true }), true);
  run.api.panelReady(run.state.token); run.publish(); await run.flush();
  await run.until(() => run.state.phase === 'showing', 'a ready existing tool must begin observation');
  assert.equal(run.execution.length, 1); assert.equal(run.execution[0].transition.opacity, 0);
  assert.equal(count(f.log, 'bridge-begin'), 0); assert.deepEqual(f.world.position, position);
  assert.equal(run.state.transition.phase, 'none'); assert.deepEqual(f.world.protectedState, f.protectedState);
  const oldToken = run.state.token; run.api.next(); await run.flush();
  await run.until(() => run.execution.length === 2 && run.state.phase === 'showing', 'the next keep entry must execute once despite the same phase and kind');
  assert.equal(run.state.index, index + 1); assert.ok(run.state.token > oldToken);
  assert.equal(run.execution[1].action.id, DIRECTOR_STEPS[index + 1].action.id);
  assert.equal(run.execution[1].transition.phase, 'none'); assert.equal(run.execution[1].transition.opacity, 0);
  assert.equal(count(f.log, 'bridge-begin'), 0); assert.equal(count(f.log, 'shot-begin'), 2);
  assert.deepEqual(f.world.position, position); assert.deepEqual(f.world.protectedState, f.protectedState);
});

test('playing, hidden state and playback rate control the transition while preserving chapter time', async () => {
  const f = worldFixture(), run = harness(f.world); await start(run);
  await run.until(() => run.state.transition.phase === 'out', 'the outgoing fade must start');
  await run.advance(50); const opacity = run.state.transition.opacity; assert.ok(opacity > 0 && opacity < 1);
  run.api.pause(); await run.flush(); await run.advance(1000);
  assert.equal(run.state.transition.opacity, opacity); assert.equal(run.execution.length, 0);
  run.api.setPlaybackRate(4); await run.flush(); assert.equal(run.state.playbackRate, 4);
  run.api.resume(); await run.flush(); run.document.visibilityState = 'hidden'; await run.advance(1000);
  assert.equal(run.state.transition.opacity, opacity); assert.equal(run.execution.length, 0);
  run.document.visibilityState = 'visible'; await run.advance(50);
  assert.ok(run.state.transition.opacity > opacity); assert.equal(run.state.elapsedMs, 0);
  const bridge = worldFixture({ entryKind: 'continuous' }), nearby = harness(bridge.world);
  await start(nearby, nearbyEntryIndex); await nearby.until(() => count(bridge.log, 'bridge-begin') === 1, 'bridge must acquire its path');
  nearby.api.pause(); nearby.api.setPlaybackRate(.5); await nearby.flush();
  await nearby.advance(250);
  assert.equal(bridge.world.bridge.playing, false); assert.equal(bridge.world.bridge.playbackRate, .5);
  assert.equal(count(bridge.log, 'bridge-begin'), 1); assert.equal(nearby.state.elapsedMs, 0);
});

test('seek and stop invalidate old fades, pause promises and applied callbacks before they can reposition a new token', async () => {
  const f = worldFixture(), run = harness(f.world); await start(run);
  const oldToken = run.state.token;
  await run.until(() => run.state.transition.phase === 'out', 'old fade must be pending');
  const lateApplied = run.api.applied; run.api.seek(2); await run.flush();
  await run.runCancelledFrames(); lateApplied(oldToken); await run.flush();
  assert.ok(run.state.token > oldToken); assert.equal(run.execution.filter(row => row.action.directorToken === oldToken).length, 0);
  run.api.stop(); await run.flush(); await run.runCancelledFrames(); await run.advance(1000);
  assert.equal(run.state.active, false); assert.equal(run.state.phase, 'idle'); assert.equal(run.execution.length, 0);
  const blocked = worldFixture(); blocked.world.pauseGate = deferred();
  const late = harness(blocked.world); await start(late); const token = late.state.token;
  late.api.stop(); await late.flush(); blocked.world.pauseGate.resolve(); await late.flush(); await late.advance(1000);
  late.api.applied(token); await late.flush();
  assert.equal(late.state.active, false); assert.equal(late.execution.length, 0); assert.equal(count(blocked.log, 'shot-begin'), 0);
  const manual = worldFixture(); let previousCalls = 0;
  const previousTakeover = () => previousCalls++; manual.world.onDirectorManualTakeover = previousTakeover;
  const takeover = harness(manual.world); await start(takeover);
  await takeover.until(() => takeover.state.transition.phase === 'out', 'manual takeover must interrupt an actual outgoing fade');
  const manualToken = takeover.state.token, manualApplied = takeover.api.applied;
  manual.world.onDirectorManualTakeover(); await takeover.flush();
  await takeover.runCancelledFrames(); manualApplied(manualToken); await takeover.flush(); await takeover.advance(1000);
  assert.equal(takeover.state.active, false); assert.equal(takeover.state.phase, 'idle');
  assert.equal(takeover.execution.length, 0); assert.equal(count(manual.log, 'shot-begin'), 0);
  assert.equal(manual.world.onDirectorManualTakeover, previousTakeover, 'cleanup restores the actual preceding listener');
  assert.equal(previousCalls, 1); assert.ok(takeover.notices.includes('已切换为自由观察。'));
  assert.deepEqual(manual.world.protectedState, manual.protectedState);
});

test('a failed entry cannot fabricate readiness, chapter time or a started observation shot', async () => {
  const f = worldFixture(), run = harness(f.world, { execute() { throw new Error('Actual entry refused.'); } });
  await start(run); await run.until(() => run.state.error !== null, 'refused navigation must expose an error');
  assert.equal(run.state.playing, false); assert.equal(run.state.elapsedMs, 0); assert.equal(run.state.completedStepIds.length, 0);
  assert.equal(count(f.log, 'shot-begin'), 0); assert.equal(count(f.log, 'prepare'), 0);
  assert.deepEqual(f.world.protectedState, f.protectedState);
  const unsafe = worldFixture(); unsafe.world.prepareResult = false;
  const refused = harness(unsafe.world, { samplePreparation: true }); await start(refused);
  await refused.until(() => refused.state.error !== null, 'a genuinely refused safe observation pose must fail while covered');
  assert.equal(refused.state.transition.phase, 'covered'); assert.equal(refused.state.transition.opacity, 1);
  assert.equal(refused.state.playing, false); assert.equal(refused.state.elapsedMs, 0);
  assert.equal(count(unsafe.log, 'prepare'), 1); assert.equal(count(unsafe.log, 'shot-begin'), 0);
  assert.deepEqual(unsafe.world.protectedState, unsafe.protectedState);
});

test('the real meadow chapter prepares actual life under cover, forces a safe cut, and waits for its second native window', async () => {
  const index = DIRECTOR_STEPS.findIndex(step => step.id === 'shallows-meadow-life-community');
  assert.ok(index >= 0); assert.equal(DIRECTOR_STEPS[index].motion.routeId, 'meadow-life');

  // Missing new life in an empty or historical owner makes the production
  // world helper refuse preparation. The actual hook must never reveal or
  // start a chapter merely because the ordinary nine-owner window is ready.
  const empty = worldFixture({ entryKind: 'continuous' }); empty.world.prepareResult = false;
  const refused = harness(empty.world); await start(refused, index);
  await refused.until(() => refused.state.error !== null, 'the actual meadow helper refusal must remain covered');
  assert.equal(count(empty.log, 'plan'), 0, 'the source-based meadow observation cannot accept an unprepared nearby bridge');
  assert.equal(refused.execution.length, 1); assert.equal(refused.execution[0].action.directorEntryPlan, undefined);
  assert.equal(refused.execution[0].transition.phase, 'covered'); assert.equal(refused.execution[0].transition.opacity, 1);
  assert.equal(count(empty.log, 'prepare'), 1); assert.equal(count(empty.log, 'bridge-begin'), 0); assert.equal(count(empty.log, 'shot-begin'), 0);
  assert.equal(refused.state.transition.phase, 'covered'); assert.equal(refused.state.playing, false); assert.equal(refused.state.elapsedMs, 0);
  assert.ok(!refused.events.some(event => event.type === 'transition-stage' && event.phase === 'in'));
  assert.deepEqual(empty.world.protectedState, empty.protectedState);

  const f = worldFixture({ entryKind: 'continuous' }), run = harness(f.world); let preparedUnder;
  f.world.onPrepare = () => {
    preparedUnder = clone(run.state.transition);
    f.world.center = [4, 3]; f.world.missingOwner = true; run.publish();
  };
  await start(run, index); await run.until(() => count(f.log, 'prepare') === 1, 'the actual meadow hook must prepare its native animal view');
  assert.equal(count(f.log, 'plan'), 0); assert.equal(count(f.log, 'bridge-begin'), 0);
  assert.equal(preparedUnder.phase, 'covered'); assert.equal(preparedUnder.opacity, 1);
  assert.equal(f.log.find(row => row[0] === 'prepare')[1].routeId, 'meadow-life');
  assert.equal(directorSceneReady(run.execution[0].action, f.world, run.inputs.snapshot), false);
  await run.advance(1000); assert.equal(run.state.phase, 'loading'); assert.equal(run.state.transition.phase, 'covered');
  assert.equal(count(f.log, 'shot-begin'), 0); assert.equal(run.state.elapsedMs, 0);

  // A paused observer stays fully covered even when the true second window
  // arrives. Resume admits one reveal and the existing moving camera path.
  run.api.pause(); await run.flush(); f.world.missingOwner = false; run.publish(); await run.flush(); await run.advance(1000);
  assert.equal(directorSceneReady(run.execution[0].action, f.world, run.inputs.snapshot), true);
  assert.equal(run.state.transition.opacity, 1); assert.equal(count(f.log, 'shot-begin'), 0); assert.equal(run.state.elapsedMs, 0);
  run.api.resume(); await run.flush(); await run.until(() => run.state.phase === 'showing', 'the complete new window must allow one resumed meadow shot');
  assert.equal(count(f.log, 'prepare'), 1); assert.equal(count(f.log, 'shot-begin'), 1); assert.equal(run.state.transition.opacity, 0);
  const shot = f.log.find(row => row[0] === 'shot-begin')[1]; assert.equal(shot.routeId, 'meadow-life'); assert.equal(shot.kind, 'walk'); assert.equal(shot.durationSec, 14);
  assert.equal(run.api.diagnostics.entered.at(-1).absence, false, 'real new life does not inherit an unrelated route absence flag');
  assert.deepEqual(f.world.protectedState, f.protectedState);

  // A cancelled meadow token cannot use late old applied/readiness events to
  // reveal the prepared window or acquire a camera after free observation.
  const cancelled = worldFixture({ entryKind: 'continuous' }), late = harness(cancelled.world);
  cancelled.world.onPrepare = () => { cancelled.world.missingOwner = true; late.publish(); };
  await start(late, index); await late.until(() => count(cancelled.log, 'prepare') === 1, 'a pending meadow window must be cancellable');
  const token = late.state.token, oldApplied = late.api.applied;
  late.api.stop(); await late.flush(); cancelled.world.missingOwner = false; late.publish(); oldApplied(token);
  await late.runCancelledFrames(); await late.flush(); await late.advance(1000);
  assert.equal(late.state.active, false); assert.equal(late.state.phase, 'idle'); assert.equal(count(cancelled.log, 'shot-begin'), 0);
  assert.equal(count(cancelled.log, 'prepare'), 1); assert.deepEqual(cancelled.world.protectedState, cancelled.protectedState);
});
