import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import React from 'react';
import { DIRECTOR_STEPS, DIRECTOR_LIFE_STEPS, createDirectorState, directorReducer, directorStepAction } from '../src/directorTour.js';
import { directorTourProgress } from '../src/directorTourProgress.js';
import { directorSceneReady } from '../src/directorReadiness.js';
import { isDirectorPlaybackRate } from '../src/directorCameraMotion.js';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';
import { OceanLifeExpedition, expeditionTerrainClear } from '../src/lifeExpedition.js';

test('the finite life stage enters the real reef, traverses one group and completes independently of the full 67 chapter tour', () => {
  assert.equal(DIRECTOR_STEPS.length, 67); assert.equal(DIRECTOR_LIFE_STEPS.length, 1);
  const step = DIRECTOR_LIFE_STEPS[0], action = directorStepAction(step);
  assert.equal(action.reefValleyRegionEntry, true); assert.equal(step.motion.groups, 1);
  assert.equal(step.motion.expedition, true); assert.equal(step.motion.durationSec, 240);
  const send = (s, type, data = {}) => directorReducer(s, { type, ...data }, DIRECTOR_LIFE_STEPS);
  let state = send(createDirectorState(), 'start');
  state = send(state, 'entered', { token: state.token }); state = send(state, 'set-rate', { playbackRate: 4 });
  assert.equal(directorTourProgress(state, DIRECTOR_LIFE_STEPS).remainingSec, 60);
  state = send(state, 'pause'); const frozen = state;
  assert.equal(send(state, 'tick', { token: state.token, deltaMs: 240000 }), frozen);
  state = send(state, 'resume'); state = send(state, 'tick', { token: state.token, deltaMs: 240000 });
  assert.equal(state.active, false); assert.equal(state.phase, 'complete');
  assert.deepEqual(state.completedStepIds, ['life-expedition']);
  assert.equal(directorTourProgress(state, DIRECTOR_LIFE_STEPS).allCompleted, true);
});

test('the shipped hook auto-starts the life URL and its actual reducer uses the one-stage duration', () => {
  // Controlled hook callbacks, not a React mount or a browser.
  const source = readFileSync(new URL('../src/useDirectorTour.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function useDirectorTour', 'function useDirectorTour');
  let state = createDirectorState(), actualReducer; const events = [], effects = [];
  const bindings = { useEffect: f => effects.push(f), useRef: v => ({ current: v }),
    useReducer: reducer => { actualReducer = reducer; return [state, event => { events.push(event); state = reducer(state, event); }]; },
    createDirectorState, directorReducer, DIRECTOR_STEPS, directorStepAction, directorSceneReady,
    isDirectorPlaybackRate, directorMotionCompletionEvent, directorTourProgress,
    window: { location: { search: '?demo=life-expedition&seed=55' } } };
  const hook = new Function(...Object.keys(bindings), source + '\nreturn useDirectorTour;')(...Object.values(bindings));
  const result = hook({ worldRef: { current: null }, worldReady: true, snapshot: null, recording: false, paused: false,
    speed: 1, steps: DIRECTOR_LIFE_STEPS, autoDemo: 'life-expedition', onNotice() {}, onControls() {}, execute() {} });
  for (const effect of effects) effect();
  assert.deepEqual(events.map(e => e.type), ['start']); assert.equal(result.steps, DIRECTOR_LIFE_STEPS);
  state = actualReducer(state, { type: 'entered', token: state.token });
  state = actualReducer(state, { type: 'tick', token: state.token, deltaMs: 240000 });
  assert.equal(state.phase, 'complete'); assert.deepEqual(state.completedStepIds, ['life-expedition']);
});

const agent = (id, overrides = {}) => ({ id, speciesId: 'actual-fish', alive: true, regionId: '0,0',
  position: { x: 6, y: 1, z: 5 }, lastFeedAt: 0, state: 'swimming', ...overrides });
const frame = { position: { x: 5, y: 1, z: 5 }, target: { x: 13, y: 1, z: 5 } };
test('expedition notes exclude dead, unloaded, distant and merely catalogued animals and leave the complete input untouched', () => {
  const book = new OceanLifeExpedition(), agents = [agent('live'), agent('dead', { alive: false }),
    agent('away', { regionId: '8,8' }), agent('distant', { position: { x: 30, y: 1, z: 5 } })];
  const before = structuredClone(agents);
  book.update({ frame, agents, encounter: { ids: agents.map(a => a.id) }, activeOwnerIds: ['0,0'], travelledM: 2, elapsedSec: 7 });
  assert.deepEqual(book.stats().nearby.map(a => a.id), ['live']); assert.equal(book.stats().individuals, 1);
  assert.deepEqual(book.stats().speciesIds, ['actual-fish']); assert.deepEqual(agents, before);
  book.update({ frame, agents: [], encounter: { ids: ['live'] }, activeOwnerIds: ['0,0'] });
  assert.equal(book.stats().nearby.length, 0); assert.equal(book.stats().individuals, 1);
});

test('movement and feeding notes require changes in the same actual observed individual and replay resets only observer notes', () => {
  const book = new OceanLifeExpedition(), a = agent('live', { lastFeedAt: 20 });
  const observe = () => book.update({ frame, agents: [a], encounter: { ids: [a.id] }, activeOwnerIds: ['0,0'] });
  observe(); assert.equal(book.stats().feedingIndividuals, 0);
  a.position.x += .1; a.lastFeedAt = 21; observe();
  assert.equal(book.stats().movedIndividuals, 1); assert.equal(book.stats().feedingIndividuals, 1);
  const before = structuredClone(a); book.reset(); assert.equal(book.stats().individuals, 0); assert.deepEqual(a, before);
});

test('terrain rays fail closed on solid obstruction, an absent owner, malformed support and callback errors', () => {
  const from = { x: 60, y: 2, z: 5 }, to = { x: 70, y: 1, z: 5 };
  const options = { activeOwnerIds: ['0,0', '1,0'], surface: () => 0 };
  assert.equal(expeditionTerrainClear(from, to, options), true);
  assert.equal(expeditionTerrainClear(from, to, { ...options, surface: x => x > 63 && x < 65 ? 3 : 0 }), false);
  assert.equal(expeditionTerrainClear(from, to, { ...options, activeOwnerIds: ['0,0'] }), false);
  assert.equal(expeditionTerrainClear(from, to, { ...options, surface: () => NaN }), false);
  assert.equal(expeditionTerrainClear(from, to, { ...options, surface: () => { throw Error('not ready'); } }), false);
});

test('the real React life panel offers the actual individual, handles empty windows and never presents a catalogue as live life', async () => {
  const source = readFileSync(new URL('../src/LifeExpeditionPanel.jsx', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function LifeExpeditionPanel', 'function LifeExpeditionPanel');
  const compiled = await transform(source, { loader: 'jsx', target: 'es2022' });
  const Panel = new Function('React', compiled.code + '\nreturn LifeExpeditionPanel;')(React);
  const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
  const report = { speciesIds: ['actual-fish'], nearby: [{ id: 'real-id', speciesId: 'actual-fish', distanceM: 2.34 }],
    travelledM: 100, habitats: ['reef', 'sand'], habitat: 'sand' };
  const chosen = [], props = { report, active: true, catalog: [{ id: 'actual-fish', commonName: '实际鱼' }, { id: 'absent', commonName: '没有生成' }], onObserve: id => chosen.push(id) };
  const buttons = elements(Panel(props)).filter(e => e.type === 'button'); assert.equal(buttons.length, 1);
  buttons[0].props.onClick(); assert.deepEqual(chosen, ['real-id']);
  assert.equal(elements(Panel({ ...props, active: false })).filter(e => e.type === 'button').length, 0);
  assert.equal(elements(Panel({ ...props, report: { ...report, nearby: [] } })).filter(e => e.type === 'button').length, 0);
});
