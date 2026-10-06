import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTOR_STEPS, createDirectorState, directorReducer } from '../src/directorTour.js';
import { directorTourProgress } from '../src/directorTourProgress.js';

const steps = [{ id: 'a', durationMs: 10000 }, { id: 'b', durationMs: 20000 }, { id: 'c', durationMs: 30000 }];

test('route progress uses elapsed shot time and excludes unknown loading delays from the estimate', () => {
  const showing = { ...createDirectorState(), active: true, phase: 'showing', index: 1, elapsedMs: 5000, playbackRate: 2,
    completedStepIds: ['a'] };
  assert.deepEqual(directorTourProgress(showing, steps), {
    timelinePercent: 25, remainingSec: 23, completedCount: 1, totalCount: 3, unfinishedCount: 2,
    completed: false, allCompleted: false,
  });
  const paused = { ...showing, playing: false };
  assert.deepEqual(directorTourProgress(paused, steps), directorTourProgress(showing, steps), 'pause freezes progress rather than clearing it');
  const loading = directorTourProgress({ ...showing, phase: 'loading', elapsedMs: 19000 }, steps);
  assert.equal(loading.timelinePercent, 100 / 6, 'a loading chapter starts at its route boundary');
  assert.equal(loading.remainingSec, 25, 'estimate includes this whole shot and future shots, not asynchronous loading');
  assert.equal(loading.completedCount, 1);
});

test('a speed change only changes the remaining wall-time estimate; invalid rates and elapsed values stay bounded', () => {
  const state = { ...createDirectorState(), phase: 'showing', index: 1, elapsedMs: 5000 };
  for (const playbackRate of [0.5, 1, 1.5, 2, 4]) {
    const progress = directorTourProgress({ ...state, playbackRate }, steps);
    assert.equal(progress.timelinePercent, 25);
    assert.equal(progress.remainingSec, Math.ceil(45 / playbackRate));
  }
  for (const playbackRate of [0, -1, NaN, Infinity, '4', 0.75]) {
    assert.equal(directorTourProgress({ ...state, playbackRate }, steps).remainingSec, 45, 'unsupported rate falls back to 1x');
  }
  assert.equal(directorTourProgress({ ...state, elapsedMs: -100 }, steps).remainingSec, 50);
  assert.equal(directorTourProgress({ ...state, elapsedMs: Infinity }, steps).remainingSec, 50);
  assert.equal(directorTourProgress({ ...state, elapsedMs: 90000 }, steps).remainingSec, 30);
});

test('skipping to the end cannot claim whole-tour playback, while distinct complete chapters can', () => {
  let state = directorReducer(createDirectorState(), { type: 'start', index: DIRECTOR_STEPS.length - 1 });
  state = directorReducer(state, { type: 'finish' });
  const skipped = directorTourProgress(state);
  assert.equal(skipped.completedCount, 0);
  assert.equal(skipped.unfinishedCount, DIRECTOR_STEPS.length);
  assert.equal(skipped.remainingSec, 0, 'finished playback no longer has a running ETA');
  assert.equal(skipped.allCompleted, false);
  assert.equal(skipped.completed, false);
  assert.ok(skipped.timelinePercent < 100, 'end state alone cannot fabricate the last shot time');
  const partial = directorTourProgress({ ...state, completedStepIds: [DIRECTOR_STEPS[0].id, DIRECTOR_STEPS[0].id, 'unknown-step'] });
  assert.equal(partial.completedCount, 1, 'duplicates and foreign IDs cannot inflate coverage');
  const full = directorTourProgress({ ...createDirectorState(), phase: 'showing', completedStepIds: DIRECTOR_STEPS.map(step => step.id) });
  assert.equal(full.completedCount, DIRECTOR_STEPS.length);
  assert.equal(full.unfinishedCount, 0);
  assert.equal(full.timelinePercent, 0, 'revisiting the first chapter retains coverage but moves route position back');
  const revisiting = directorTourProgress({ ...createDirectorState(), phase: 'showing', index: 1,
    elapsedMs: 5000, completedStepIds: steps.map(step => step.id) }, steps);
  assert.equal(revisiting.timelinePercent, 25, 'full playback history never overrides the actual current route position');
  assert.equal(revisiting.allCompleted, true);
  assert.equal(full.allCompleted, true);
  assert.equal(full.completed, true);
  assert.equal(directorTourProgress(createDirectorState(), []).allCompleted, false, 'an empty route is not an observed tour');
});
