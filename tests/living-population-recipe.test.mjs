import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanCommunityPlan } from '../src/oceanCommunity.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { OceanEcology } from '../src/oceanEcology.js';

function planAt(generator, ecology, cx, cz) {
  const chunk = generator.chunk(cx, cz);
  return createOceanCommunityPlan(generator, chunk, { random: salt => ecology._random({ id: chunk.id }, salt),
    surface: (x, z, coral) => ecology._surface(x, z, coral) });
}
const counts = plan => plan.placements.reduce((n, animal) => { n[animal.speciesId] = (n[animal.speciesId] ?? 0) + 1; return n; }, {});

test('new living recipe retains actual functional roles while making room for a complete water layer', () => {
  const seed = 'living-shallows-v1|string:42', generator = createLivingShallowsGenerator(seed), ecology = new OceanEcology(seed, generator);
  const plan = planAt(generator, ecology, 4, 2), species = counts(plan);
  assert.equal(plan.populationRecipeVersion, 'living-open-water-v2');
  assert.equal(species['green-chromis'], 3);
  assert.equal(species['lined-tang'], 1);
  assert.equal(species['cleaner-wrasse'], 1);
  assert.equal(species['honeycomb-grouper'], 1);
  assert.equal(species['blue-starfish'], 1);
  assert.equal(species['black-cucumber'], 2);
  assert.ok(plan.placements.length + 4 + 3 + 2 + 2 <= 20,
    'primary life + minimum fusilier school + reef guild + open-water types + clam/shrimp fit the shared capacity');
});

test('new birth quotas stay bounded and never split a refuge school into isolated leftover fish', () => {
  const seed = 'living-shallows-v1|string:42', generator = createLivingShallowsGenerator(seed), ecology = new OceanEcology(seed, generator);
  for (const [cx, cz] of [[3, 2], [3, 3], [4, 2], [3, 4], [7, 3], [9, 4]]) {
    const before = structuredClone(generator.chunk(cx, cz)), plan = planAt(generator, ecology, cx, cz), species = counts(plan);
    assert.ok(plan.placements.length <= 9);
    assert.ok((species['black-cucumber'] ?? 0) <= 2);
    assert.ok((species['lined-tang'] ?? 0) <= 1);
    const groups = new Map();
    for (const animal of plan.placements.filter(a => a.speciesId === 'green-chromis')) groups.set(animal.groupId, (groups.get(animal.groupId) ?? 0) + 1);
    for (const count of groups.values()) assert.ok(count >= 3);
    assert.deepEqual(generator.chunk(cx, cz), before);
    assert.deepEqual(planAt(generator, ecology, cx, cz), plan);
  }
});

test('legacy population plans gain no living recipe metadata', () => {
  const generator = createOceanGenerator('42'), ecology = new OceanEcology('42', generator);
  const plan = planAt(generator, ecology, 9, -2);
  assert.equal(Object.hasOwn(plan, 'populationRecipeVersion'), false);
});
