import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ACTIONS, DEMO_LIVING_STOPS, DEMO_KELP_STOPS, DEMO_DEEP_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, DIRECTOR_PLAYBACK_RATES, createDirectorState, directorReducer, directorStepAction } from '../src/directorTour.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { createLivingVisualRoute } from '../src/livingVisualRoute.js';
import { OceanEcology } from '../src/oceanEcology.js';

const send = (state, type, data = {}) => directorReducer(state, { type, ...data });
const enter = state => send(state, 'entered', { token: state.token });
const tick = (state, deltaMs) => send(state, 'tick', { token: state.token, deltaMs });

test('the chosen camera rate survives chapter changes, pauses, completion and another tour', () => {
  let state = createDirectorState();
  assert.equal(state.playbackRate, 1);
  assert.deepEqual(DIRECTOR_PLAYBACK_RATES, [0.5, 1, 1.5, 2, 4]);
  assert.ok(Object.isFrozen(DIRECTOR_PLAYBACK_RATES));
  state = send(state, 'set-rate', { playbackRate: 2 });
  state = send(state, 'start');
  state = enter(state);
  state = tick(state, 500);
  const token = state.token;
  state = send(state, 'set-rate', { playbackRate: 4 });
  assert.equal(state.token, token, 'changing rate cannot start another shot');
  assert.equal(state.elapsedMs, 500, 'the current camera path position is retained');
  state = tick(state, 500);
  assert.equal(state.elapsedMs, 1000, 'rendered camera time is not multiplied a second time');
  state = send(state, 'pause');
  state = send(state, 'set-rate', { playbackRate: 0.5 });
  assert.equal(state.playing, false, 'a rate change cannot resume a paused shot');
  state = send(state, 'resume');
  state = send(state, 'next');
  state = send(state, 'prev');
  state = send(state, 'seek', { index: DIRECTOR_STEPS.length - 1 });
  assert.equal(state.playbackRate, 0.5);
  state = send(state, 'next');
  assert.equal(state.phase, 'complete');
  assert.equal(state.playbackRate, 0.5);
  state = send(state, 'stop');
  assert.equal(state.playbackRate, 0.5);
  state = send(state, 'start', { index: 3 });
  assert.equal(state.playbackRate, 0.5);
});

test('unsupported playback rates leave the actual shot and playback state untouched', () => {
  const state = enter(send(createDirectorState(), 'start'));
  for (const playbackRate of [0, -1, 0.75, 8, NaN, Infinity, '2', null, undefined]) {
    assert.strictEqual(send(state, 'set-rate', { playbackRate }), state);
  }
  assert.strictEqual(send(state, 'set-rate', { playbackRate: 1 }), state);
  for (const playbackRate of DIRECTOR_PLAYBACK_RATES) {
    assert.equal(send(state, 'set-rate', { playbackRate }).playbackRate, playbackRate);
  }
});

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
  assert.ok(duration >= 360000 && duration <= 660000, 'finite local moving observation stays approximately six to eleven minutes');
  assert.equal(duration, 642000); assert.equal(included.size, 48);
});

test('all chapters declare finite frozen camera motion, with enough time to walk through scenes', () => {
  assert.equal(DIRECTOR_STEPS.length, 54);
  for (const step of DIRECTOR_STEPS) {
    assert.ok(Object.isFrozen(step.motion), `${step.id} motion is immutable`);
    assert.ok(['walk', 'orbit', 'follow'].includes(step.motion.kind));
    assert.ok(Number.isFinite(step.motion.durationSec) && step.motion.durationSec > 0);
    assert.equal(step.motion.durationSec * 1000, step.durationMs);
    const scene = ['world', 'living-stop', 'kelp-stop', 'deep-stop', 'view', 'layer', 'local-life', 'discoveries'].includes(step.action.kind);
    assert.ok(scene ? step.durationMs >= 12000 && step.durationMs <= 14000
      : step.durationMs >= 6000 && step.durationMs <= 8000, `${step.id} has appropriate walkthrough/read time`);
  }
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
      routes.push(step.action.stopId);
    }
    if (step.action.kind === 'local-life') observedBiomes.add(biome);
    if (step.action.kind === 'layer') layeredBiomes.add(biome);
  }
  assert.deepEqual(routes, ['biodiversity-reef', 'benthic-community', 'shallow-scene-reef', 'shallow-scene-sand', 'shallow-scene-meadow', 'shallow-scene-slope',
    'habitat-belt-reef', 'habitat-belt-meadow', 'seascape-transition', 'connected-seascape',
    'shelf-rise', 'sand-basin', 'patch-reef', 'meadow-edge', 'ridge-gully', 'outer-reef',
    'seagrass-meadow', 'sand-channel', 'reef-garden']);
  assert.deepEqual([...routes].sort(), DEMO_LIVING_STOPS.map(stop => stop.id).sort(), 'all ordinary route entries remain available');
  assert.deepEqual(DIRECTOR_STEPS.filter(step=>step.action.kind==='kelp-stop').map(step=>step.action.stopId),
    ['kelp-scene-forest','kelp-scene-rockbed','kelp-scene-opening','kelp-scene-outer','forest-belt-interior','forest-belt-opening']);
  assert.ok(DIRECTOR_STEPS.filter(step=>step.action.kind==='kelp-stop').every(step=>step.action.biome==='kelp'));
  assert.deepEqual(DIRECTOR_STEPS.filter(step=>step.action.kind==='deep-stop').map(step=>step.action.stopId),
    ['deep-scene-plain','deep-scene-slope','deep-scene-outcrop','deep-scene-outer','deep-plain-community','deep-slope-outcrop']);
  assert.deepEqual(DIRECTOR_STEPS.filter(step=>step.action.kind==='deep-stop').map(step=>step.action.stopId).sort(),
    DEMO_DEEP_STOPS.map(stop=>stop.id).sort(), 'both original deep entries and all four new macro entries remain covered');
  assert.ok(DIRECTOR_STEPS.filter(step=>step.action.kind==='deep-stop').every(step=>step.action.biome==='deep'));
  assert.deepEqual([...observedBiomes].sort(), ['deep', 'kelp', 'reef']);
  assert.deepEqual([...layeredBiomes].sort(), ['deep', 'kelp']);
  const firstWorkbench = DIRECTOR_STEPS.findIndex(step => step.action.kind === 'population');
  assert.ok(DIRECTOR_STEPS.slice(0, firstWorkbench).some(step => step.action.id === 'world-deep'));
  assert.match(DIRECTOR_STEPS[firstWorkbench].caption, /独立/);
});

test('the opening observes actual nearby life and discoveries before repositioning to the thirteen geographic stops', () => {
  assert.deepEqual(DIRECTOR_STEPS.slice(0, 3).map(step => step.id), ['shallows-opening', 'shallows-life', 'shallows-discoveries']);
  assert.deepEqual(DIRECTOR_STEPS.slice(1, 3).map(step => step.action.kind), ['local-life', 'discoveries']);
  for (const step of DIRECTOR_STEPS.slice(0, 3)) {
    const action = directorStepAction(step);
    assert.equal(action.biome, 'reef'); assert.equal(action.profile, 'living-shallows-v1');
  }
  assert.equal(DIRECTOR_STEPS[3].action.stopId, 'biodiversity-reef');
  assert.deepEqual(DEMO_LIVING_STOPS.map(stop => stop.id), ['reef-garden', 'sand-channel', 'seagrass-meadow', 'outer-reef',
    'ridge-gully', 'patch-reef', 'meadow-edge', 'shelf-rise', 'sand-basin', 'connected-seascape', 'seascape-transition',
    'habitat-belt-reef', 'habitat-belt-meadow', 'shallow-scene-reef', 'shallow-scene-sand', 'shallow-scene-meadow', 'shallow-scene-slope', 'biodiversity-reef', 'benthic-community'], 'ordinary capability buttons retain their original order, with the complete package appended');
});

test('opening actions resolve existing shallow, kelp and deep stops without changing their native action references', () => {
  const generators = {
    reef: createLivingRidgeGenerator(createLivingShallowsGenerator(livingShallowsSeed('42'))),
    kelp: createKelpOceanGenerator('42', { forestBelt: true }), deep: createDeepOceanGenerator('42', { seascape: true }),
  };
  for (const [id, biome, expectedId, key] of [
    ['shallows-opening', 'reef', 'shallow-scene-reef', 'routeStops'],
    ['kelp-opening', 'kelp', 'kelp-scene-forest', 'kelpSeascapeRouteStops'],
    ['deep-opening', 'deep', 'deep-scene-plain', 'wholeSeascapeRouteStops'],
  ]) {
    const step = DIRECTOR_STEPS.find(step => step.id === id), action = directorStepAction(step);
    assert.equal(step.action.kind, 'world'); assert.ok(DEMO_ACTIONS.includes(step.action));
    assert.equal(action.id, step.action.id); assert.equal(action.biome, biome); assert.equal(action.entryStopId, expectedId);
    const stop = generators[biome][key].find(stop => stop.id === action.entryStopId);
    assert.ok(stop && Number.isFinite(stop.x) && Number.isFinite(stop.z), `${id} uses a real generator entry`);
  }
  assert.equal(Object.hasOwn(directorStepAction(DIRECTOR_STEPS.find(step => step.id === 'tools-return')), 'entryStopId'), false,
    'the ordinary shallow return retains its existing entry');
});

test('the real shallow landmark order reduces repeated relocation while retaining every distant native destination', () => {
  const generator = createLivingRidgeGenerator(createLivingShallowsGenerator(livingShallowsSeed('42')));
  const stops = new Map(generator.routeStops.map(stop => [stop.id, stop]));
  const origin = stops.get('habitat-belt-reef');
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const lengths = ids => ids.map((id, index) => distance(index ? stops.get(ids[index - 1]) : origin, stops.get(id)));
  const allIds = DIRECTOR_STEPS.filter(step => step.action.kind === 'living-stop').map(step => step.action.stopId);
  assert.deepEqual([...allIds].sort(), [...stops.keys()].sort());
  const oldIds = DEMO_LIVING_STOPS.filter(stop => !stop.id.startsWith('shallow-scene-') && !['biodiversity-reef', 'benthic-community'].includes(stop.id)).map(stop => stop.id);
  const ids = allIds.filter(id => !id.startsWith('shallow-scene-') && !['biodiversity-reef', 'benthic-community'].includes(id));
  const oldLengths = lengths(oldIds), revisedLengths = lengths(ids), total = legs => legs.reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total(oldLengths) - 10780.567) < .001); assert.ok(Math.abs(total(revisedLengths) - 4977.384) < .001);
  assert.ok(total(revisedLengths) < total(oldLengths) * .47);
  assert.ok(revisedLengths.slice(1).every(length => length >= 64), 'the remaining geographic stop pairs still require distant transfers');
  // These sums measure horizontal landmark repositioning, never travelled or
  // simulated swimming. A repeated opening landmark is not a resident bridge.
});

test('the retained nearby source-based sample remains too far from its native entry to invent a continuous bridge', async () => {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed)), saved = new Map();
  const store = { available: true, async load(_world, id) { return structuredClone(saved.get(id) ?? null); },
    async saveMany(_world, rows) { for (const [id, record] of rows) saved.set(id, structuredClone(record)); } };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true, habitatMosaic: true,
    seabedRelief: true, seascape: true, livingBelt: true, turtleGrazing: true });
  const stop = generator.routeStops.find(stop => stop.id === 'habitat-belt-reef');
  const heading = stop.heading ?? 0, across = stop.entryAcrossM ?? 8;
  const entry = { x: stop.x - 7 * Math.cos(heading) + across * Math.sin(heading),
    z: stop.z + 7 * Math.sin(heading) + across * Math.cos(heading) };
  assert.notEqual(await ecology.update(entry), false); assert.equal(ecology._active.size, 9);
  const cameraPosition = { ...entry, y: Math.min(generator.surfaceY - .6, generator.heightForCamera(entry.x, entry.z) + 2.8) };
  const agents = ecology.agents, before = structuredClone({ active: [...ecology._active], saved: [...saved], environment: ecology._environment });
  const route = createLivingVisualRoute({ generator, agents, loadedChunkIds: [...ecology._active.keys()], cameraPosition,
    surfaceY: generator.surfaceY, fov: 49, aspect: 16 / 9, safeHeight: (x, z) => generator.heightForCamera(x, z) });
  assert.equal(route.status, 'ready', route.reason); assert.equal(route.stops.length, 3);
  const tail = route.stops.at(-1).position, distanceM = Math.hypot(tail.x - entry.x, tail.z - entry.z);
  assert.ok(distanceM > 32, `The actual route tail is ${distanceM} m from its native entry; no continuous bridge is admitted.`);
  assert.deepEqual({ active: [...ecology._active], saved: [...saved], environment: ecology._environment }, before,
    'reading the real route leaves full actual ecological records and inventory untouched');
});

test('direct chapter seeks resolve their intended world from any currently loaded world', () => {
  const currentWorlds = [{ biome: 'reef', profile: 'legacy' }, { biome: 'reef', profile: 'living-shallows-v1' },
    { biome: 'kelp' }, { biome: 'deep' }];
  const chapters = [
    ...['deep-scene-plain','deep-scene-slope','deep-scene-outcrop','deep-scene-outer'].map(stop=>({id:`deep-${stop}`,biome:'deep'})),
    ...['deep-plain-belt','deep-outcrop-belt'].map(id=>({id,biome:'deep'})),
    ...['kelp-forest-belt','kelp-forest-opening'].map(id=>({id,biome:'kelp'})),
    ...['kelp', 'deep'].flatMap(biome => ['bed', 'midwater', 'surface', 'life'].map(name => ({ id: `${biome}-${name}`, biome }))),
    ...['catalog', 'environment', 'journal', 'foodweb', 'age', 'capture'].map(name => ({ id: `tools-${name}`, biome: 'reef', profile: 'living-shallows-v1' })),
  ];
  for (const expected of chapters) {
    const chapter = DIRECTOR_STEPS.find(item => item.id === expected.id);
    assert.ok(chapter, expected.id);
    assert.ok(Object.isFrozen(chapter.context));
    const resolved = directorStepAction(chapter);
    assert.ok(Object.isFrozen(resolved));
    assert.equal(resolved.id, chapter.action.id);
    assert.ok(DEMO_ACTIONS.includes(chapter.action), 'the original native entry reference is retained');
    for (const current of currentWorlds) {
      const target = { ...current, ...resolved };
      assert.equal(target.biome, expected.biome, `${expected.id} from ${current.biome}`);
      if (expected.profile) assert.equal(target.profile, expected.profile);
      else assert.equal(Object.hasOwn(resolved, 'profile'), false, 'kelp/deep do not inherit a reef profile');
    }
  }
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
  assert.deepEqual(state.completedStepIds, visited, 'only each completed native-clock chapter is counted');
  assert.equal(state.phase, 'complete');
  assert.equal(state.playing, false);
  assert.equal(state.index, DIRECTOR_STEPS.length - 1);
  assert.equal(state.elapsedMs, DIRECTOR_STEPS.at(-1).durationMs);
  const completeToken = state.token;
  state = send(state, 'start');
  assert.deepEqual(state.completedStepIds, [], 'another tour begins a new coverage run');
  assert.equal(state.index, 0);
  assert.equal(state.phase, 'loading');
  assert.ok(state.token > completeToken);
});

test('full-shot coverage does not treat loading, skips or a manual finish as completed observation', () => {
  let state = send(createDirectorState(), 'start');
  assert.deepEqual(state.completedStepIds, []);
  state = enter(state);
  state = tick(state, DIRECTOR_STEPS[0].durationMs - 1);
  const previousIds = state.completedStepIds;
  state = tick(state, 1);
  assert.deepEqual(state.completedStepIds, [DIRECTOR_STEPS[0].id]);
  assert.deepEqual(previousIds, [], 'recording coverage never mutates a previous state');
  state = send(state, 'next');
  state = send(state, 'seek', { index: DIRECTOR_STEPS.length - 1 });
  state = enter(state);
  state = send(state, 'pause');
  state = send(state, 'set-rate', { playbackRate: 4 });
  state = send(state, 'finish');
  assert.deepEqual(state.completedStepIds, [DIRECTOR_STEPS[0].id], 'cursor arrival and finish cannot stand in for a full shot');
  const coveredIds = state.completedStepIds;
  state = send(state, 'stop');
  assert.equal(state.phase, 'idle');
  assert.strictEqual(state.completedStepIds, coveredIds, 'exit retains coverage for diagnostics');
  state = send(state, 'start', { index: 2 });
  assert.deepEqual(state.completedStepIds, []);
  assert.equal(state.playbackRate, 4);
});

test('an explicit native completion receipt is token guarded, idempotent and never advances the chapter', () => {
  let state = send(createDirectorState(), 'start');
  const firstToken = state.token;
  assert.strictEqual(send(state, 'record-complete', { token: firstToken }), state, 'loading has not shown the shot');
  state = enter(state);
  state = tick(state, 1000);
  state = send(state, 'pause');
  const prior = state;
  state = send(state, 'record-complete', { token: firstToken });
  assert.deepEqual(state.completedStepIds, [DIRECTOR_STEPS[0].id]);
  assert.deepEqual(prior.completedStepIds, []);
  assert.equal(state.index, prior.index);
  assert.equal(state.token, prior.token);
  assert.equal(state.phase, 'showing');
  assert.equal(state.elapsedMs, 1000, 'receipt marks actual ownership evidence without inventing rendered time');
  assert.equal(state.playing, false);
  assert.strictEqual(send(state, 'record-complete', { token: firstToken }), state, 'duplicate receipt is harmless');
  state = send(state, 'seek', { index: 4 });
  assert.strictEqual(send(state, 'record-complete', { token: firstToken }), state, 'a replaced shot cannot count this chapter');
  state = enter(state);
  state = send(state, 'failed', { token: state.token, error: 'current shot failed' });
  assert.strictEqual(send(state, 'record-complete', { token: state.token }), state, 'a failed shot cannot be recorded');
  assert.strictEqual(send(state, 'record-complete'), state);
  state = send(state, 'stop');
  assert.strictEqual(send(state, 'record-complete', { token: state.token }), state, 'stopped shots cannot produce coverage');
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
