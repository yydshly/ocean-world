import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { createReefGuildPlan, reefGuildSupportHeight, REEF_GUILD_SUPPORT_SPREAD_M } from '../src/reefGuildHabitat.js';

const seed = 'living-shallows-v1|string:42';
function setup() {
  const generator = createLivingShallowsGenerator(seed), ecology = new OceanEcology(seed, generator);
  const region = ecology._createRegion(3, 3);
  const options = { random: salt => ecology._random(region, salt),
    surface: (x, z, avoidCoral) => oceanSupportHeight(generator, x, z, { avoidCoral }),
    bed: (x, z) => generator.floorSurface(x, z).height, availableSlots: 20 - region.agents.length };
  return { generator, ecology, region, options };
}

test('shared support rejects steep feet, intermediate protrusions and invalid probes', () => {
  assert.deepEqual(reefGuildSupportHeight(() => -4, 2, 3, .2), { height: -4, spread: 0 });
  assert.ok(reefGuildSupportHeight(x => x * .04, 0, 0, .2));
  assert.equal(reefGuildSupportHeight(x => x * .10, 0, 0, .2), null);
  assert.equal(reefGuildSupportHeight((x, z) => Math.abs(x - .1) < 1e-8 && Math.abs(z) < 1e-8 ? .1 : 0, 0, 0, .2), null);
  assert.equal(reefGuildSupportHeight(() => NaN, 0, 0, .2), null);
  assert.equal(reefGuildSupportHeight(() => 0, 0, 0, 0), null);
  const crownOnly = (x, z, crown) => crown && Math.abs(x - .1) < 1e-8 && Math.abs(z) < 1e-8 ? .04 : 0;
  assert.deepEqual(reefGuildSupportHeight(crownOnly, 0, 0, .2), { height: 0, spread: 0 });
  assert.equal(reefGuildSupportHeight(crownOnly, 0, 0, .2, { avoidCoral: true }), null);
});

test('one deterministic actual host admits the three categories without changing existing life or scenery', () => {
  const { generator, region, options } = setup(), before = structuredClone(region), scene = structuredClone(generator.chunk(3, 3));
  const first = createReefGuildPlan(generator, region, options), second = createReefGuildPlan(generator, region, options);
  assert.deepEqual(second, first);
  assert.equal(first.completeGroup, true);
  assert.deepEqual(first.placements.map(a => a.speciesId), ['tube-sponge', 'day-octopus', 'spotted-reef-crab']);
  assert.equal(new Set(first.placements.map(a => a.hostId)).size, 1);
  assert.equal(first.summary.trueCrevice, false);
  assert.deepEqual(region, before);
  assert.deepEqual(generator.chunk(3, 3), scene);
});

test('real generated placements have finite complete support, bare shoulders and physical owner bounds', () => {
  const { generator, region, options } = setup(), plan = createReefGuildPlan(generator, region, options);
  const host = generator.chunk(3, 3).elements.find(a => a.id === plan.summary.hostId);
  for (const placement of plan.placements) {
    assert.ok(placement.x - placement.supportRadius > 3 * 64);
    assert.ok(placement.z - placement.supportRadius > 3 * 64);
    assert.ok(placement.x + placement.supportRadius < 4 * 64);
    assert.ok(placement.z + placement.supportRadius < 4 * 64);
    const support = reefGuildSupportHeight(options.surface, placement.x, placement.z, placement.supportRadius);
    assert.ok(support && support.spread <= REEF_GUILD_SUPPORT_SPREAD_M + 1e-10);
    assert.ok(Math.abs(placement.y - (support.height + .004)) < 1e-12);
    assert.ok(options.surface(placement.x, placement.z, true) <= options.surface(placement.x, placement.z) + .01);
    if (placement.speciesId === 'tube-sponge') {
      assert.ok(Math.abs(oceanRockHeight(host, placement.x, placement.z) - options.surface(placement.x, placement.z)) < .01);
      assert.ok(options.surface(placement.x, placement.z) - options.bed(placement.x, placement.z) > .06);
    } else assert.ok(options.surface(placement.x, placement.z) - options.bed(placement.x, placement.z) <= .45);
  }
});

test('dead categories and turtle identities count towards the shared capacity without resurrection', () => {
  const { generator, region, options } = setup();
  region.agents.push({ id: 'historical-octopus', speciesId: 'day-octopus', alive: false });
  const before = structuredClone(region);
  const missingPlan = createReefGuildPlan(generator, region, { ...options, availableSlots: 20 });
  assert.ok(missingPlan.placements.length > 0);
  assert.ok(missingPlan.placements.every(a => a.speciesId !== 'day-octopus'));
  assert.deepEqual(region, before);
  while (region.agents.length < 18) region.agents.push({ id: `historical:${region.agents.length}`, speciesId: 'green-chromis', alive: false });
  region.turtleAgents = [{ id: 'historical-turtle', speciesId: 'green-turtle', alive: false }];
  assert.equal(createReefGuildPlan(generator, region, { ...options, availableSlots: 20 }).placements.length, 1);
  region.turtleAgents.push({ id: 'second-turtle', speciesId: 'green-turtle', alive: false });
  assert.equal(createReefGuildPlan(generator, region, { ...options, availableSlots: 20 }).placements.length, 0);
});

test('old profiles and physically blocked reefs produce no substitute animals', () => {
  const { generator, region, options } = setup();
  assert.equal(createReefGuildPlan({ ...generator, profile: 'old-reef' }, region, options).placements.length, 0);
  assert.equal(createReefGuildPlan(generator, region, { ...options, availableSlots: 0 }).placements.length, 0);
  assert.equal(createReefGuildPlan(generator, region, { ...options, surface: () => NaN }).placements.length, 0);
});
