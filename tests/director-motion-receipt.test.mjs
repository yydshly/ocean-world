import test from 'node:test';
import assert from 'node:assert/strict';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';
import { createDirectorState, directorReducer, DIRECTOR_STEPS } from '../src/directorTour.js';

const send = (state, type, data = {}) => directorReducer(state, { type, ...data });
const showing = () => {
  const loading = send(createDirectorState(), 'start');
  return send(loading, 'entered', { token: loading.token });
};
const completedShot = state => ({ kind: 'walk', complete: true, error: null,
  durationSec: DIRECTOR_STEPS[state.index].motion.durationSec,
  elapsedSec: DIRECTOR_STEPS[state.index].motion.durationSec });

test('a real completed clock can be recorded before manual navigation without advancing twice', () => {
  const before = send(showing(), 'tick', { token: 1, deltaMs: 13750 });
  const receipt = directorMotionCompletionEvent(completedShot(before), before, before.token, DIRECTOR_STEPS);
  assert.deepEqual(receipt, { type: 'record-complete', token: before.token });
  const recorded = directorReducer(before, receipt);
  assert.equal(recorded.index, 0);
  assert.equal(recorded.elapsedMs, 13750, 'a receipt marks coverage without changing the renderer clock');
  assert.deepEqual(recorded.completedStepIds, [DIRECTOR_STEPS[0].id]);
  const navigated = send(recorded, 'next');
  assert.equal(navigated.index, 1);
  assert.equal(navigated.phase, 'loading');
  assert.deepEqual(navigated.completedStepIds, recorded.completedStepIds);
  assert.strictEqual(directorReducer(navigated, receipt), navigated, 'a late old callback cannot record the replacement chapter');
});

test('paused completion is confirmed, but missing, short, failed, wrong-length and stale shots cannot claim viewing', () => {
  const state = send(showing(), 'pause'), shot = completedShot(state);
  assert.ok(directorMotionCompletionEvent(shot, state, state.token, DIRECTOR_STEPS));
  for (const candidate of [null, { ...shot, complete: false }, { ...shot, error: 'collision path failed' },
    { ...shot, kind: null }, { ...shot, elapsedSec: 13.9 }, { ...shot, elapsedSec: Infinity },
    { ...shot, durationSec: 12 }]) {
    assert.equal(directorMotionCompletionEvent(candidate, state, state.token, DIRECTOR_STEPS), null);
  }
  assert.equal(directorMotionCompletionEvent(shot, state, state.token - 1, DIRECTOR_STEPS), null);
  for (const unavailable of [send(state, 'next'), send(state, 'stop'),
    send(state, 'failed', { token: state.token, error: 'world failed' })]) {
    assert.equal(directorMotionCompletionEvent(shot, unavailable, unavailable.token, DIRECTOR_STEPS), null);
  }
});
