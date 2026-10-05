import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReefSceneryLayout, REEF_AUXILIARY_ROCKS } from '../src/reefScenery.js';
import { inspectAuxiliaryFishContact } from '../scripts/inspect-reef-auxiliary-contact.mjs';
import { habitatHeight } from '../src/habitat.js';

test('shared auxiliary layout retains the historical rock coordinates and subsequent scenery RNG state', () => {
  const layout = createReefSceneryLayout();
  assert.equal(layout.rocks.length, 19);
  assert.deepEqual(layout.rocks, REEF_AUXILIARY_ROCKS);
  assert.equal(createHash('sha256').update(JSON.stringify(layout.rocks)).digest('hex'),
    '7493800060dea3653180171fa04152428c278ab453dc2e7a735b09890a1be2b9');
  assert.deepEqual(Array.from({ length: 5 }, () => layout.random()),
    [.7283667421434075, .5622207331471145, .7346985845360905, .07690558303147554, .8952750966418535]);
  assert.ok(Object.isFrozen(REEF_AUXILIARY_ROCKS) && REEF_AUXILIARY_ROCKS.every(Object.isFrozen));
});

test('organized fish roots clear actual auxiliary triangles and the historical penetration point remains supported', () => {
  const report = inspectAuxiliaryFishContact();
  assert.equal(report.cases.length, 3);
  const initial = report.cases.find(value => value.seed === 42).initialLinedTang;
  assert.ok(initial.y > habitatHeight(initial.x, initial.z) + .1);
  // Habitat organization changes live spawn positions. Preserve the original
  // regression as an explicit spatial fixture instead of pinning that spawn.
  const historical = report.historicalRegression;
  assert.deepEqual(historical.previousRootM, [-4.4435071696527295, .29010900205919804, .7137802274897695]);
  assert.ok(habitatHeight(historical.previousRootM[0], historical.previousRootM[2])
    >= historical.previousAnalyticAuxiliaryTopM - .002);
});
