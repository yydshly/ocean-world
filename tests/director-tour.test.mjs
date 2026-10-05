import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ACTIONS, DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, createDirectorState, directorReducer } from '../src/directorTour.js';

const send = (state, type, data = {}) => directorReducer(state, { type, ...data });
const enter = state => send(state, 'entered', { token: state.token });
const tick = (state, deltaMs) => send(state, 'tick', { token: state.token, deltaMs });

test('the finite tour covers every existing entry without invented or destructive actions', () => {
  const included = new Set(DIRECTOR_STEPS.map(step => step.action.id));
  assert.deepEqual([...included].sort(), DEMO_ACTIONS.map(action => action.id).sort());
  assert.equal(new Set(DIRECTOR_STEPS.map(step => step.id)).size, DIRECTOR_STEPS.length);
  assert.ok(Object.isFrozen(DIRECTOR_STEPS));
  for (const step of DIRECTOR_STEPS) {
    assert.ok(Object.isFrozen(step));
    assert.ok(DEMO_ACTIONS.includes(step.action), `${step.id} must use an existing native entry`);
    assert.ok(step.title && step.caption && Number.isFinite(step.durationMs) && step.durationMs > 0);
    assert.ok(!['reset', 'environment', 'record', 'download'].includes(step.action.kind));
  }
  const duration = DIRECTOR_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
  assert.ok(duration >= 210000 && duration <= 270000, 'viewing time stays approximately four minutes');
});

test('macro scenes and native route entries precede workbenches, and layers/animals run in their intended worlds', () => {
  let biome = null, profile = null;
  const routes = [], observedBiomes = new Set(), layeredBiomes = new Set();
  for (const step of DIRECTOR_STEPS) {
    if (step.action.biome) biome = step.action.biome;
    if (step.action.profile) profile = step.action.profile;
    if (step.action.kind === 'living-stop') {
      assert.equal(biome, 'reef');
      assert.equal(profile, 'living-shallows-v1');
      assert.match(step.caption, /观察点直达/);
      routes.push(step.action.stopId);
    }
    if (step.action.kind === 'local-life') observedBiomes.add(biome);
    if (step.action.kind === 'layer') layeredBiomes.add(biome);
  }
  assert.deepEqual(routes, DEMO_LIVING_STOPS.map(stop => stop.id));
  assert.deepEqual([...observedBiomes].sort(), ['deep', 'kelp', 'reef']);
  assert.deepEqual([...layeredBiomes].sort(), ['deep', 'kelp']);
  const firstWorkbench = DIRECTOR_STEPS.findIndex(step => step.action.kind === 'population');
  assert.ok(DIRECTOR_STEPS.slice(0, firstWorkbench).some(step => step.action.id === 'world-deep'));
  assert.match(DIRECTOR_STEPS[firstWorkbench].caption, /独立/);
});

test('loading and pausing never consume viewing time', () => {
  let state = send(createDirectorState(), 'start');
  assert.equal(state.phase, 'loading');
  assert.strictEqual(tick(state, 120000), state);
  state = send(state, 'pause');
  const token = state.token;
  state = enter(state);
  assert.equal(state.phase, 'showing');
  assert.equal(state.playing, false);
  assert.equal(state.token, token);
  assert.strictEqual(tick(state, 120000), state);
  state = send(state, 'resume');
  state = tick(state, 1000);
  assert.equal(state.elapsedMs, 1000);
  state = send(state, 'pause');
  assert.strictEqual(tick(state, 120000), state);
  state = send(state, 'resume');
  assert.equal(state.elapsedMs, 1000);
});

test('late callbacks cannot enter, fail, or count a replaced step after seek, stop, or restart', () => {
  let state = send(createDirectorState(), 'start');
  const firstToken = state.token;
  state = send(state, 'seek', { index: 5 });
  assert.equal(state.index, 5);
  for (const type of ['entered', 'failed', 'tick', 'finish']) {
    assert.strictEqual(send(state, type, { token: firstToken, deltaMs: 120000, error: 'old failure' }), state);
  }
  const seekToken = state.token;
  state = send(state, 'stop');
  assert.equal(state.phase, 'idle');
  assert.equal(state.active, false);
  state = send(state, 'start');
  assert.ok(state.token > seekToken);
  assert.strictEqual(send(state, 'entered', { token: seekToken }), state);
  assert.strictEqual(send(state, 'entered'), state);
  state = enter(state);
  assert.equal(state.phase, 'showing');
});

test('one slow tick cannot skip viewing/loading of the next scene', () => {
  let state = enter(send(createDirectorState(), 'start'));
  state = tick(state, 600000);
  assert.equal(state.index, 1);
  assert.equal(state.phase, 'loading');
  assert.equal(state.elapsedMs, 0);
  assert.strictEqual(tick(state, 600000), state);
  state = enter(state);
  state = tick(state, 1000);
  assert.equal(state.elapsedMs, 1000);
  assert.equal(state.index, 1);
});

test('an entry failure pauses visibly until a retry or explicit skip', () => {
  let state = send(createDirectorState(), 'start', { index: 4 });
  state = send(state, 'failed', { token: state.token, error: new Error('海域加载超时') });
  assert.equal(state.playing, false);
  assert.equal(state.error, '海域加载超时');
  assert.strictEqual(enter(state), state, 'late readiness does not hide the failure');
  const failedToken = state.token;
  const retry = send(state, 'resume');
  assert.equal(retry.index, 4);
  assert.equal(retry.phase, 'loading');
  assert.equal(retry.playing, true);
  assert.equal(retry.error, null);
  assert.ok(retry.token > failedToken);
  assert.strictEqual(send(retry, 'entered', { token: failedToken }), retry);
  const skipped = send(state, 'next');
  assert.equal(skipped.index, 5);
  assert.equal(skipped.phase, 'loading');
  assert.equal(skipped.error, null);
  assert.equal(skipped.playing, false, 'a skip does not silently resume autoplay');
});

test('manual navigation stays finite and preserves a paused playback preference', () => {
  let state = send(createDirectorState(), 'start');
  state = send(state, 'pause');
  state = send(state, 'prev');
  assert.equal(state.index, 0);
  assert.equal(state.playing, false);
  state = send(state, 'next');
  assert.equal(state.index, 1);
  state = send(state, 'prev');
  assert.equal(state.index, 0);
  for (const index of [-1, DIRECTOR_STEPS.length, 1.5, NaN, Infinity]) {
    assert.strictEqual(send(state, 'seek', { index }), state);
  }
  state = send(state, 'seek', { index: DIRECTOR_STEPS.length - 1 });
  state = send(state, 'next');
  assert.equal(state.phase, 'complete');
  assert.equal(state.active, false);
  assert.strictEqual(send(state, 'next'), state);
  assert.strictEqual(send(state, 'prev'), state);
});

test('a complete automatic traversal visits every step once and stops at its end', () => {
  let state = send(createDirectorState(), 'start');
  const visited = [];
  while (state.active) {
    assert.equal(state.phase, 'loading');
    assert.equal(state.index, visited.length);
    assert.equal(state.elapsedMs, 0);
    assert.strictEqual(tick(state, 45000), state);
    visited.push(DIRECTOR_STEPS[state.index].id);
    state = enter(state);
    state = tick(state, DIRECTOR_STEPS[state.index].durationMs);
    assert.ok(visited.length <= DIRECTOR_STEPS.length);
  }
  assert.deepEqual(visited, DIRECTOR_STEPS.map(step => step.id));
  assert.equal(state.phase, 'complete');
  assert.equal(state.playing, false);
  assert.equal(state.index, DIRECTOR_STEPS.length - 1);
  assert.equal(state.elapsedMs, DIRECTOR_STEPS.at(-1).durationMs);
  const completeToken = state.token;
  state = send(state, 'start');
  assert.equal(state.index, 0);
  assert.equal(state.phase, 'loading');
  assert.ok(state.token > completeToken);
});

test('invalid timer input and duplicate readiness cannot distort a showing step', () => {
  let state = enter(send(createDirectorState(), 'start'));
  state = tick(state, 500);
  assert.strictEqual(enter(state), state);
  for (const deltaMs of [0, -1, NaN, Infinity, '1000']) assert.strictEqual(tick(state, deltaMs), state);
  assert.strictEqual(send(state, 'unknown'), state);
  assert.strictEqual(directorReducer(state, null), state);
  assert.equal(state.elapsedMs, 500);
});
