import test from 'node:test';
import assert from 'node:assert/strict';
import { directorSceneReady } from '../src/directorReadiness.js';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';

const choice = { kind: 'living-stop', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE, stopId: 'reef-garden' };
const world = { biomeId: 'reef', isLivingShallows: true };
const regionsAround = (cx, cz) => [-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx => ({ id: `${cx + dx},${cz + dz}` })));
const snapshot = () => ({ biomeId: 'reef', sceneProfile: LIVING_SHALLOWS_PROFILE, ocean: {
  exploring: true, chunkId: '3,3', ecology: { metrics: { loadingRegions: 0, activeRegions: 9 },
    regions: regionsAround(3, 3) }, localHabitat: { status: 'ready' },
} });

test('readiness rejects absent, disposed, wrong-biome and stale-profile renderers or snapshots', () => {
  assert.equal(directorSceneReady(choice, world, snapshot()), true);
  for (const [candidateWorld, candidateSnapshot] of [[null, snapshot()], [world, null],
    [{ ...world, disposed: true }, snapshot()], [{ biomeId: 'deep' }, { biomeId: 'deep' }],
    [world, { ...snapshot(), biomeId: 'kelp' }], [world, { ...snapshot(), sceneProfile: null }],
    [{ ...world, isLivingShallows: false }, snapshot()]]) {
    assert.equal(directorSceneReady(choice, candidateWorld, candidateSnapshot), false);
  }
  assert.equal(directorSceneReady({ kind: 'panel' }, world, { ...snapshot(), sceneProfile: null }), false);
  assert.equal(directorSceneReady({ kind: 'panel' }, { biomeId: 'reef', isLivingShallows: false }, snapshot()), false);
  assert.equal(directorSceneReady(null, world, snapshot()), false);
});

test('fixed authored scenes need only an actual match and never wait for a moving focus transition', () => {
  for (const biomeId of ['reef', 'kelp', 'deep']) {
    const actual = { biomeId, isLivingShallows: false, transition: { agentId: 'real-moving-animal' } };
    const fixed = { biomeId, ocean: { exploring: false, ecology: { metrics: { loadingRegions: 9, activeRegions: 0 } } } };
    assert.equal(directorSceneReady({ kind: 'view', biome: biomeId, ...(biomeId === 'reef' ? { profile: 'legacy' } : {}) }, actual, fixed), true);
  }
});

test('new regional births and pending requests cannot be acknowledged from an older visible community', () => {
  const loading = snapshot(); loading.ocean.ecology.metrics.loadingRegions = 2;
  assert.equal(directorSceneReady(choice, world, loading), false, 'some old loaded records do not finish a new birth batch');
  loading.ocean.ecology.metrics.loadingRegions = 0; loading.ocean.localHabitat.status = 'loading';
  assert.equal(directorSceneReady(choice, world, loading), false);
  delete loading.ocean.localHabitat;
  assert.equal(directorSceneReady(choice, world, loading), false, 'missing local completion evidence is not ready');
  loading.ocean.localHabitat = { status: 'ready' }; delete loading.ocean.ecology.metrics.loadingRegions;
  assert.equal(directorSceneReady(choice, world, loading), false, 'missing loading telemetry cannot imply a completed request');
});

test('only the actual current region completes exploration, and a loaded empty region is a valid outcome', () => {
  const current = snapshot(); current.ocean.chunkId = '7,0';
  assert.equal(directorSceneReady(choice, world, current), false, 'loaded neighbours cannot stand in for the current owner');
  current.ocean.ecology.regions = regionsAround(7, 0); current.ocean.localHabitat.status = 'empty';
  assert.equal(directorSceneReady(choice, world, current), true, 'no live animal is a completed ecological result');
  for (const biomeId of ['kelp', 'deep']) {
    assert.equal(directorSceneReady({ kind: 'layer', biome: biomeId }, { biomeId }, { ...current, biomeId }), true);
  }
});

test('an older nine-owner window containing the new centre cannot acknowledge its pending neighbour births', () => {
  const moved = snapshot(); moved.ocean.chunkId = '4,3';
  assert.ok(moved.ocean.ecology.regions.some(region => region.id === moved.ocean.chunkId));
  assert.equal(moved.ocean.ecology.metrics.activeRegions, 9);
  assert.equal(moved.ocean.ecology.metrics.loadingRegions, 0);
  assert.equal(directorSceneReady(choice, world, moved), false, 'the three missing eastern owners have not committed yet');
  moved.ocean.ecology.regions = regionsAround(4, 3);
  assert.equal(directorSceneReady(choice, world, moved), true);
});

test('failed loading and missing region/metric evidence remain unready', () => {
  const failed = snapshot(); failed.ocean.ecology.metrics.activeRegions = 0;
  assert.equal(directorSceneReady(choice, world, failed), false);
  failed.ocean.ecology.metrics.activeRegions = 9; failed.ocean.ecology.regions = [];
  assert.equal(directorSceneReady(choice, world, failed), false);
  delete failed.ocean.ecology;
  assert.equal(directorSceneReady(choice, world, failed), false);
  const missingId = snapshot(); delete missingId.ocean.chunkId;
  assert.equal(directorSceneReady(choice, world, missingId), false);
  for (const chunkId of ['03,3', '3.5,3', '3,', '3,not-a-number']) {
    assert.equal(directorSceneReady(choice, world, { ...snapshot(), ocean: { ...snapshot().ocean, chunkId } }), false);
  }
});

test('population chapters require their actual panel result as well as the matching loaded scene', () => {
  const panel = { kind: 'population', model: 'age' };
  assert.equal(directorSceneReady(panel, world, snapshot()), false);
  assert.equal(directorSceneReady(panel, world, snapshot(), { panelReady: false }), false);
  assert.equal(directorSceneReady(panel, world, snapshot(), { panelReady: true }), true);
  const loading = snapshot(); loading.ocean.ecology.metrics.loadingRegions = 1;
  assert.equal(directorSceneReady(panel, world, loading, { panelReady: true }), false);
  assert.equal(directorSceneReady(panel, world, { biomeId: 'deep' }, { panelReady: true }), false);
  assert.equal(directorSceneReady(panel, { biomeId: 'deep' }, { biomeId: 'deep' }, { panelReady: true }), true);
});
