import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { demoWorldMatches, navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_ACTIONS, DEMO_KELP_STOPS, DEMO_DEEP_STOPS, demoLayerEntries } from '../src/demoCapabilities.js';
import { LIVING_SHALLOWS_PROFILE, livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

const worldAction = biome => DEMO_ACTIONS.find(action => action.kind === 'world' && action.biome === biome &&
  (biome !== 'reef' || action.profile === LIVING_SHALLOWS_PROFILE));

test('deep belt and whole-scene shortcuts match native seed routes and preserve protected ecology on arrival and invalid entries', () => {
  const generator=createDeepOceanGenerator('42',{seascape:true});
  const stops=[...generator.seascapeRouteStops,...generator.wholeSeascapeRouteStops,...generator.deepBenthicLifeRouteStops,...generator.deepHardLifeRouteStops,...generator.deepWaterLifeRouteStops];
  assert.deepEqual(DEMO_DEEP_STOPS.map(entry=>entry.id),stops.map(stop=>stop.id));
  assert.deepEqual(stops.map(stop=>stop.id),['deep-plain-community','deep-slope-outcrop',
    'deep-scene-plain','deep-scene-slope','deep-scene-outcrop','deep-scene-outer','deep-bottom-life','deep-hard-life','deep-water-life']);
  const hard = DEMO_DEEP_STOPS.find(entry => entry.id === 'deep-hard-life');
  const chapter = DIRECTOR_STEPS.find(step => step.action.stopId === hard.id);
  assert.equal(hard.action.deepHardLifeEntry, true); assert.equal(hard.action.biome, 'deep');
  assert.equal(chapter.motion.routeId, 'deep-hard-life'); assert.equal(chapter.durationMs, 14000);
  const water = DEMO_DEEP_STOPS.find(entry => entry.id === 'deep-water-life');
  const swimming = DIRECTOR_STEPS.find(step => step.action.stopId === water.id);
  assert.equal(water.action.deepWaterLifeEntry, true); assert.equal(water.action.biome, 'deep');
  assert.equal(swimming.motion.routeId, 'deep-water-life'); assert.equal(swimming.durationMs, 16000);
  for(const entry of DEMO_DEEP_STOPS){
    const {world,protectedState}=observationWorld({biomeId:'deep'}),calls=[];
    world.enterDeepSeascape=id=>{calls.push(id);return stops.some(stop=>stop.id===id);};
    assert.equal(navigateDemoEntry(entry.action,world),true);
    assert.deepEqual(calls,[entry.id]);assert.strictEqual(world.protectedState,protectedState);
    assert.equal(navigateDemoEntry({...entry.action,stopId:'missing'},world),false);
    world.biomeId='kelp';assert.equal(navigateDemoEntry(entry.action,world),false);
    world.biomeId='deep';delete world.enterDeepSeascape;assert.equal(navigateDemoEntry(entry.action,world),false);
  }
});

test('kelp belt and whole-scene shortcuts resolve native seed routes without changing protected ecology', () => {
  const generator=createKelpOceanGenerator('42',{forestBelt:true});
  assert.deepEqual(DEMO_KELP_STOPS.map(entry=>entry.id),[...generator.forestRouteStops,...generator.kelpSeascapeRouteStops,...generator.kelpBenthicLifeRouteStops,...generator.kelpWaterLifeRouteStops].map(stop=>stop.id));
  for(const entry of DEMO_KELP_STOPS){
    const {world,protectedState}=observationWorld({biomeId:'kelp'}),calls=[];
    world.enterKelpForestBelt=id=>{calls.push(id);return [...generator.forestRouteStops,...generator.kelpSeascapeRouteStops,...generator.kelpBenthicLifeRouteStops,...generator.kelpWaterLifeRouteStops].some(stop=>stop.id===id);};
    assert.equal(navigateDemoEntry(entry.action,world),true);
    assert.deepEqual(calls,[entry.id]);assert.strictEqual(world.protectedState,protectedState);
    assert.equal(navigateDemoEntry({...entry.action,stopId:'missing'},world),false);
    world.biomeId='reef';assert.equal(navigateDemoEntry(entry.action,world),false);
    world.biomeId='kelp';delete world.enterKelpForestBelt;assert.equal(navigateDemoEntry(entry.action,world),false);
  }
});

function observationWorld({ biomeId = 'reef', living = false, exploring = false, stops = [], startSucceeds = true } = {}) {
  const calls = [];
  const protectedState = Object.freeze({ seed: 'retained-seed', paused: true, speed: 4, timeSec: 123,
    environment: Object.freeze({ hour: 17, currentMps: .32, turbidity: .61, foodSupply: .7 }),
    animals: Object.freeze([{ id: 'saved-dead-individual', alive: false }]),
    resources: Object.freeze({ plankton: 2.75 }), notes: Object.freeze(['user-observation']) });
  const world = {
    biomeId, isLivingShallows: living, oceanExploring: exploring,
    oceanChunks: { generator: { routeStops: stops } },
    protectedState,
    position: { x: 512, y: -18, z: -64 },
    startOceanExploration() { calls.push(['startOceanExploration']); this.oceanExploring = startSucceeds; },
    setOceanOverview() { calls.push(['setOceanOverview']); },
    enterLivingShallows(index) { calls.push(['enterLivingShallows', index]); this.oceanExploring = true; return true; },
    setView(view) { calls.push(['setView', view]); },
    setOceanObservationLayer(layer) { calls.push(['setOceanObservationLayer', layer]); this.position.y = -8; return true; },
    focusNearbyOceanAnimal(speciesId) { calls.push(['focusNearbyOceanAnimal', speciesId]); return false; },
  };
  for (const name of ['reset', 'setEnvironment', 'setPaused', 'setSpeed', 'step', 'resetResources', 'markObservation']) {
    world[name] = () => assert.fail(`A demonstration entry must not call ${name}`);
  }
  return { world, calls, protectedState };
}

test('matching requires the loaded renderer and snapshot to agree on the requested shallow profile', () => {
  const livingChoice = worldAction('reef');
  const legacyChoice = DEMO_ACTIONS.find(action => action.id === 'world-legacy-reef');
  const livingWorld = { biomeId: 'reef', isLivingShallows: true };
  const legacyWorld = { biomeId: 'reef', isLivingShallows: false };
  const livingSnapshot = { biomeId: 'reef', sceneProfile: LIVING_SHALLOWS_PROFILE };
  const legacySnapshot = { biomeId: 'reef' };
  assert.equal(demoWorldMatches(livingChoice, livingWorld, livingSnapshot), true);
  assert.equal(demoWorldMatches(legacyChoice, legacyWorld, legacySnapshot), true);
  assert.equal(demoWorldMatches(legacyChoice, legacyWorld, livingSnapshot), false,
    'a previous living snapshot must not consume a pending legacy action');
  assert.equal(demoWorldMatches(livingChoice, livingWorld, legacySnapshot), false,
    'a previous legacy snapshot must not consume a pending living action');
  assert.equal(demoWorldMatches(livingChoice, legacyWorld, livingSnapshot), false);
  assert.equal(demoWorldMatches(legacyChoice, livingWorld, legacySnapshot), false);
});

test('missing, disposed, wrong-biome or stale-world snapshots cannot execute a queued entry', () => {
  const kelpChoice = worldAction('kelp');
  const world = { biomeId: 'kelp', isLivingShallows: false };
  assert.equal(demoWorldMatches(kelpChoice, world, { biomeId: 'kelp' }), true);
  assert.equal(demoWorldMatches(kelpChoice, null, { biomeId: 'kelp' }), false);
  assert.equal(demoWorldMatches(kelpChoice, world, null), false);
  assert.equal(demoWorldMatches(kelpChoice, { ...world, disposed: true }, { biomeId: 'kelp' }), false);
  assert.equal(demoWorldMatches(kelpChoice, world, { biomeId: 'deep' }), false);
  assert.equal(demoWorldMatches(kelpChoice, { biomeId: 'deep' }, { biomeId: 'deep' }), false);
});

test('the public observation shortcuts cover the actual living generator route once each', () => {
  const generator = createLivingRidgeGenerator(createLivingShallowsGenerator(livingShallowsSeed('42')));
  const choices = DEMO_ACTIONS.filter(action => action.kind === 'living-stop');
  assert.deepEqual(choices.map(action => action.stopId), generator.routeStops.map(stop => stop.id));
  assert.equal(choices.length, 21);
  assert.equal(new Set(choices.map(action => action.stopId)).size, choices.length);
  assert.equal(new Set(DEMO_ACTIONS.map(action => action.id)).size, DEMO_ACTIONS.length);
  for (const choice of choices) {
    assert.equal(choice.biome, 'reef');
    assert.equal(choice.profile, LIVING_SHALLOWS_PROFILE);
  }
});

test('stop selection resolves the loaded route by ID and never substitutes the first stop', () => {
  const choice = DEMO_ACTIONS.find(action => action.stopId === 'sand-basin');
  const { world, calls } = observationWorld({ living: true,
    stops: [{ id: 'sand-basin' }, { id: 'reef-garden' }, { id: 'other-saved-stop' }] });
  assert.equal(navigateDemoEntry(choice, world), true);
  assert.deepEqual(calls, [['enterLivingShallows', 0]], 'the loaded route order wins over the menu order');
  calls.length = 0;
  assert.equal(navigateDemoEntry({ ...choice, stopId: 'missing-stop' }, world), false);
  assert.deepEqual(calls, [], 'a missing route must not silently jump to another observation point');
  delete world.oceanChunks;
  assert.equal(navigateDemoEntry(choice, world), false);
  assert.deepEqual(calls, []);
});

test('kelp and deep world entries start continuous exploration and report an actual startup failure', () => {
  for (const biomeId of ['kelp', 'deep']) {
    const { world, calls, protectedState } = observationWorld({ biomeId });
    assert.equal(navigateDemoEntry(worldAction(biomeId), world), true);
    assert.equal(world.oceanExploring, true);
    assert.deepEqual(calls, [['startOceanExploration'], ['setOceanOverview']]);
    assert.equal(world.protectedState, protectedState);
    assert.deepEqual(protectedState.animals, [{ id: 'saved-dead-individual', alive: false }]);
    const failed = observationWorld({ biomeId, startSucceeds: false });
    assert.equal(navigateDemoEntry(worldAction(biomeId), failed.world), false);
    assert.equal(failed.world.protectedState.timeSec, 123);
  }
});

test('anchored kelp and deep openings use actual native habitat entries without a preliminary overview', () => {
  for (const [biomeId, entryStopId, methodName] of [
    ['kelp', 'forest-belt-interior', 'enterKelpForestBelt'],
    ['deep', 'deep-plain-community', 'enterDeepSeascape'],
    ['deep', 'deep-scene-plain', 'enterDeepSeascape'],
  ]) {
    const { world, calls, protectedState } = observationWorld({ biomeId });
    const before = structuredClone(protectedState);
    world[methodName] = id => {
      calls.push([methodName, id]);
      if (id !== entryStopId) return false;
      world.oceanExploring = true;
      return true;
    };
    const choice = { ...worldAction(biomeId), entryStopId };
    assert.equal(navigateDemoEntry(choice, world, { movingDirector: true }), true);
    assert.deepEqual(calls, [[methodName, entryStopId]]);
    assert.deepEqual(world.protectedState, before);
    calls.length = 0;
    assert.equal(navigateDemoEntry({ ...choice, entryStopId: 'missing' }, world, { movingDirector: true }), false);
    assert.deepEqual(calls, [[methodName, 'missing']], 'unavailable habitat must not fall back to another view');
    delete world[methodName]; calls.length = 0;
    assert.equal(navigateDemoEntry(choice, world, { movingDirector: true }), false);
    assert.deepEqual(calls, []);
    assert.deepEqual(world.protectedState, before);
  }
});

test('director animal entry delegates selection and camera preparation while manual focus retains its native call', () => {
  const choice = DEMO_ACTIONS.find(action => action.kind === 'local-life');
  const { world, calls, protectedState } = observationWorld({ biomeId: 'kelp', exploring: true });
  const before = structuredClone({ position: world.position, protectedState });
  world.focusNearbyOceanAnimal = (...args) => { calls.push(args); return true; };
  assert.equal(navigateDemoEntry(choice, world, { movingDirector: true }), true);
  assert.deepEqual(calls, [[null, null, { director: true }]]);
  assert.deepEqual({ position: world.position, protectedState }, before);
  calls.length = 0;
  assert.equal(navigateDemoEntry(choice, world), true);
  assert.deepEqual(calls, [[null]]);
});

test('living and legacy world entries use their own observation operations without rebuilding populations', () => {
  const living = observationWorld({ living: true });
  assert.equal(navigateDemoEntry(worldAction('reef'), living.world), true);
  assert.deepEqual(living.calls, [['enterLivingShallows', 0]]);
  const legacy = observationWorld();
  const legacyChoice = DEMO_ACTIONS.find(action => action.id === 'world-legacy-reef');
  assert.equal(navigateDemoEntry(legacyChoice, legacy.world), true);
  assert.deepEqual(legacy.calls, [['setView', 'wide']]);
  const skeletonChoice = DEMO_ACTIONS.find(action => action.id === 'legacy-skeleton');
  assert.equal(navigateDemoEntry(skeletonChoice, legacy.world), true);
  assert.deepEqual(legacy.calls.at(-1), ['setView', 'skeleton']);
  assert.equal(legacy.world.protectedState, legacy.protectedState);
});

test('director fixed-view shots start at the requested view even before a slow transition could finish', () => {
  const choices = ['world-legacy-reef', 'legacy-wide', 'legacy-skeleton']
    .map(id => DEMO_ACTIONS.find(action => action.id === id));
  for (const choice of choices) {
    const { world, protectedState } = observationWorld();
    const expected = choice.kind === 'world' ? 'wide' : choice.view;
    world.actualView = 'previous-view';
    world.setView = (view, immediate = false) => {
      if (immediate) { world.actualView = view; world.transition = null; }
      else world.transition = { view };
    };
    // Acquiring a native director shot clears transitions, so an unfinished
    // ordinary view change cannot be relied on to supply its starting pose.
    assert.equal(navigateDemoEntry(choice, world, { movingDirector: true }), true);
    world.transition = null;
    assert.equal(world.actualView, expected, `${choice.id} must not retain the previous shot's view`);
    assert.equal(world.protectedState, protectedState);

    world.actualView = 'manual-start';
    assert.equal(navigateDemoEntry(choice, world), true);
    assert.equal(world.actualView, 'manual-start', 'ordinary manual navigation keeps its animated transition');
    assert.deepEqual(world.transition, { view: expected });
  }
});

test('water-layer entries preserve horizontal location and do not call overview or an observation shortcut', () => {
  for (const biomeId of ['reef', 'kelp', 'deep']) {
    const choices = demoLayerEntries(biomeId).map(entry => entry.action);
    assert.deepEqual(choices.map(choice => choice.layer), ['bed', 'midwater', 'surface']);
    for (const choice of choices) {
      const { world, calls, protectedState } = observationWorld({ biomeId, exploring: true });
      const horizontal = { x: world.position.x, z: world.position.z };
      assert.equal(navigateDemoEntry(choice, world), true);
      assert.deepEqual(calls, [['setOceanObservationLayer', choice.layer]]);
      assert.deepEqual({ x: world.position.x, z: world.position.z }, horizontal);
      assert.equal(world.protectedState, protectedState);
    }
    const initial = observationWorld({ biomeId });
    assert.equal(navigateDemoEntry(choices[1], initial.world), true);
    assert.deepEqual(initial.calls, [['startOceanExploration'], ['setOceanObservationLayer', 'midwater']]);
  }
});

test('current-world tools do not select a biome or shallow profile; shallow discoveries are explicit', () => {
  const currentKinds = new Set(['panel', 'population', 'capture', 'local-life', 'layer']);
  const choices = DEMO_ACTIONS.filter(action => currentKinds.has(action.kind));
  assert.ok(choices.length > 0);
  for (const choice of choices) {
    assert.equal(Object.hasOwn(choice, 'biome'), false, choice.id);
    assert.equal(Object.hasOwn(choice, 'profile'), false, choice.id);
  }
  const discoveries = DEMO_ACTIONS.find(action => action.kind === 'discoveries');
  assert.equal(discoveries.biome, 'reef');
  assert.equal(discoveries.profile, LIVING_SHALLOWS_PROFILE);
});

test('director layer entry defers vertical movement to the rendered shot and leaves manual switching intact', () => {
  const choice = demoLayerEntries('kelp')[1].action;
  const { world, calls, protectedState } = observationWorld({ biomeId: 'kelp', exploring: true });
  const before = { ...world.position };
  assert.equal(navigateDemoEntry(choice, world, { movingDirector: true }), true);
  assert.deepEqual(world.position, before, 'loading a director chapter must not teleport its height');
  assert.deepEqual(calls, []);
  assert.equal(navigateDemoEntry({ ...choice, layer: 'invalid' }, world, { movingDirector: true }), false);
  assert.equal(world.protectedState, protectedState);
  assert.equal(navigateDemoEntry(choice, world), true);
  assert.equal(world.position.y, -8, 'ordinary observation button behavior remains available');
  assert.deepEqual(calls, [['setOceanObservationLayer', 'midwater']]);
  const failed = observationWorld({ biomeId: 'kelp', startSucceeds: false });
  assert.equal(navigateDemoEntry(choice, failed.world, { movingDirector: true }), false);
});

test('a missing local animal remains absent and the navigation adapter ignores UI-only tools', () => {
  const local = DEMO_ACTIONS.find(action => action.kind === 'local-life');
  const { world, calls, protectedState } = observationWorld({ biomeId: 'kelp', exploring: true });
  assert.equal(navigateDemoEntry(local, world), false);
  assert.deepEqual(calls, [['focusNearbyOceanAnimal', null]]);
  calls.length = 0;
  for (const choice of DEMO_ACTIONS.filter(action => ['panel', 'population', 'capture'].includes(action.kind))) {
    assert.equal(navigateDemoEntry(choice, world), false);
  }
  assert.deepEqual(calls, []);
  assert.equal(world.protectedState, protectedState);
});

test('discovery entry starts only the living observation world and preserves an existing exploration location', () => {
  const choice = DEMO_ACTIONS.find(action => action.kind === 'discoveries');
  const existing = observationWorld({ living: true, exploring: true });
  const position = { ...existing.world.position };
  assert.equal(navigateDemoEntry(choice, existing.world), true);
  assert.deepEqual(existing.calls, []);
  assert.deepEqual(existing.world.position, position);
  const waiting = observationWorld({ living: true });
  assert.equal(navigateDemoEntry(choice, waiting.world), true);
  assert.deepEqual(waiting.calls, [['enterLivingShallows', 0]]);
  const legacy = observationWorld();
  assert.equal(navigateDemoEntry(choice, legacy.world), false);
  assert.deepEqual(legacy.calls, []);
});

test('the director opening resolves the complete scene start while the ordinary default retains its original entry', () => {
  const generator = createLivingRidgeGenerator(createLivingShallowsGenerator(livingShallowsSeed('42')));
  const stops = [...generator.routeStops].reverse();
  const opening = DIRECTOR_STEPS[0], action = directorStepAction(opening);
  assert.equal(opening.id, 'shallows-opening');
  assert.equal(opening.motion.routeId, undefined);
  assert.equal(action.entryStopId, 'shallow-scene-reef');
  assert.equal(Object.hasOwn(opening.action, 'entryStopId'), false);
  const { world, calls, protectedState } = observationWorld({ living: true, stops });
  const before = structuredClone(protectedState);
  assert.equal(navigateDemoEntry(action, world, { movingDirector: true }), true);
  assert.deepEqual(calls, [['enterLivingShallows', stops.findIndex(stop => stop.id === action.entryStopId)]]);
  calls.length = 0;
  assert.equal(navigateDemoEntry({ ...action, entryStopId: 'missing-sample' }, world), false);
  assert.deepEqual(calls, []);
  assert.equal(navigateDemoEntry(opening.action, world), true);
  assert.deepEqual(calls, [['enterLivingShallows', 0]]);
  assert.deepEqual(protectedState, before);
});
