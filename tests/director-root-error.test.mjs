import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirectorState, directorReducer, DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { directorSceneReady } from '../src/directorReadiness.js';
import { isDirectorPlaybackRate } from '../src/directorCameraMotion.js';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';
import { directorTourProgress } from '../src/directorTourProgress.js';

const source = readFileSync(new URL('../src/useDirectorTour.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function useDirectorTour', 'function useDirectorTour');

// Run the shipped hook's root-error subscription and public controls. Other
// effects (WebGL entry, timers and browser readiness) are deliberately not run.
// Dependency comparison follows useEffect's Object.is rule; this is a finite
// CPU regression, not a React mount or browser playback acceptance test.
function harness() {
  let state = createDirectorState(), cursor = 0, effects = [], dependencies = null;
  const refs = [], events = [];
  const useEffect = (callback, values) => effects.push({ callback, values });
  const useRef = value => refs[cursor++] ?? (refs[cursor - 1] = { current: value });
  const useReducer = () => [state, event => { events.push(event); state = directorReducer(state, event); }];
  const hook = new Function('useEffect', 'useReducer', 'useRef', 'createDirectorState', 'directorReducer',
    'DIRECTOR_STEPS', 'directorStepAction', 'directorSceneReady', 'isDirectorPlaybackRate', 'directorMotionCompletionEvent', 'directorTourProgress',
    `${source}\nreturn useDirectorTour;`)(useEffect, useReducer, useRef, createDirectorState, directorReducer,
    DIRECTOR_STEPS, directorStepAction, directorSceneReady, isDirectorPlaybackRate, directorMotionCompletionEvent, directorTourProgress);
  const inputs = { worldRef: { current: null }, snapshot: null, worldReady: false, error: null,
    execute() {}, recording: false, paused: true, speed: 12, onControls() {}, onNotice() {} };
  const render = error => {
    cursor = 0; effects = []; inputs.error = error;
    const api = hook(inputs);
    const root = effects.find(effect => /fail\([^,]*,\s*error\)/.test(String(effect.callback)));
    assert.ok(root, 'exercise the actual root-error effect from the production hook');
    if (!dependencies || dependencies.length !== root.values.length
      || root.values.some((value, index) => !Object.is(value, dependencies[index]))) {
      dependencies = [...root.values]; root.callback();
    }
    return api;
  };
  return { render, events, get state() { return state; } };
}

test('the same old constructor error cannot fail a retry or seek before replacement loading clears it', () => {
  for (const operation of ['resume', 'seek']) {
    const run = harness();
    run.render(null).start();
    run.render(null);
    run.render('Original constructor failed');
    assert.equal(run.state.error, 'Original constructor failed');
    const failedToken = run.state.token;
    const controls = run.render('Original constructor failed');
    if (operation === 'resume') controls.resume(); else controls.seek(17);
    run.render('Original constructor failed');
    assert.ok(run.state.token > failedToken);
    assert.equal(run.state.phase, 'loading');
    assert.equal(run.state.error, null, 'an unchanged stale prop must not defeat the new load');
    run.render(null);
    assert.equal(run.events.filter(event => event.type === 'failed').length, 1);
  }
});

test('a fresh repeated error after clearing still fails the current retry token', () => {
  const run = harness();
  run.render(null).start(); run.render(null);
  run.render('Same constructor message');
  run.render('Same constructor message').resume();
  run.render('Same constructor message');
  const retryToken = run.state.token;
  run.render(null);
  run.render('Same constructor message');
  assert.equal(run.state.error, 'Same constructor message');
  assert.equal(run.state.playing, false);
  assert.equal(run.events.at(-1).token, retryToken);
  assert.equal(run.events.filter(event => event.type === 'failed').length, 2);
});

test('an inactive root error does not defeat a deliberate start, and late idle errors do not activate a tour', () => {
  const run = harness();
  const idle = run.render('Previous world failed');
  assert.equal(run.state.active, false);
  assert.equal(run.events.length, 0);
  idle.start(); run.render('Previous world failed');
  assert.equal(run.state.active, true);
  assert.equal(run.state.error, null);
  run.render(null).stop(); run.render(null);
  run.render('Late cancelled world failure');
  assert.equal(run.state.active, false);
  assert.equal(run.state.phase, 'idle');
  assert.equal(run.state.error, null);
});
