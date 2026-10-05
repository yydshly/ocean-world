import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createOceanPelagicCommunityPlan } from '../src/oceanPelagicCommunity.js';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';

function setup(cx = 3, cz = 2) {
  const seed = 'living-shallows-v1|string:42', generator = createLivingShallowsGenerator(seed);
  const ecology = new OceanEcology(seed, generator), chunk = generator.chunk(cx, cz);
  const options = { random: salt => ecology._random({ id: chunk.id }, salt),
    surface: (x, z, coral) => oceanSupportHeight(generator, x, z, { avoidCoral: coral }) };
  return { generator, chunk, options };
}

test('new-scene natural hosts admit one deterministic school without altering scenery', () => {
  const { generator, chunk, options } = setup(), before = structuredClone(chunk);
  const plan = createOceanPelagicCommunityPlan(generator, chunk, options);
  assert.equal(plan.niches.structureHosts, 3);
  assert.equal(plan.niches.legalHosts, 2);
  assert.equal(plan.placements.length, 8);
  assert.deepEqual(createOceanPelagicCommunityPlan(generator, chunk, options), plan);
  assert.deepEqual(createOceanPelagicCommunityPlan(generator, { ...chunk, elements: [...chunk.elements].reverse() }, options), plan);
  assert.equal(new Set(plan.placements.map(a => a.groupId)).size, 1);
  assert.equal(new Set(plan.placements.map(a => a.siteId)).size, plan.placements.length);
  assert.deepEqual(chunk, before);
});

test('natural host admission requires both explicit living profile and its registered rock profiles', () => {
  const { generator, chunk, options } = setup();
  for (const other of [{ ...generator, profile: 'old-reef' }, { ...generator, profile: undefined },
    { ...generator, rockProfiles: [] }, { ...generator, rockProfiles: undefined }]) {
    const plan = createOceanPelagicCommunityPlan(other, chunk, options);
    assert.equal(plan.niches.structureHosts, 0);
    assert.equal(plan.placements.length, 0);
  }
});

test('actual natural-reef school and entire sampled patrol retain coral-inclusive clear water', () => {
  const { generator, chunk, options } = setup();
  const plan = createOceanPelagicCommunityPlan(generator, chunk, options);
  for (const animal of plan.placements) {
    assert.ok(animal.depthM >= 3 && animal.depthM <= 16);
    assert.ok(8 - animal.depthM >= options.surface(animal.x, animal.z, true) + 2);
    const host = chunk.elements.find(e => e.id === animal.hostId);
    assert.ok(generator.rockProfiles.includes(host.profile));
    assert.equal(animal.schoolHome.x, host.x);
    assert.equal(animal.schoolHome.z, host.z);
  }
  const first = plan.placements[0], home = first.schoolHome;
  const schoolRadius = Math.hypot(first.x - home.x, first.z - home.z);
  const radius = first.orbitRadiusM + schoolRadius + .5;
  const points = [{ x: home.x, z: home.z }, ...Array.from({ length: 16 }, (_, index) => ({
    x: home.x + Math.cos(first.schoolPhaseRad + index * Math.PI / 8) * radius,
    z: home.z + Math.sin(first.schoolPhaseRad + index * Math.PI / 8) * radius }))];
  for (const p of points) {
    const env = generator.sample(p.x, p.z);
    assert.ok(env.depthM >= 12 && env.depthM <= 35);
    assert.ok(8 - options.surface(p.x, p.z, true) >= 8);
    assert.ok(p.x >= chunk.bounds.minX + .6 && p.x <= chunk.bounds.maxX - .6);
    assert.ok(p.z >= chunk.bounds.minZ + .6 && p.z <= chunk.bounds.maxZ - .6);
  }
});

test('real shallow entrance and suitable seeded-empty neighbours remain sparse', () => {
  const entry = setup(3, 3), blocked = createOceanPelagicCommunityPlan(entry.generator, entry.chunk, entry.options);
  assert.ok(blocked.niches.structureHosts > 0);
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.placements.length, 0);
  const neighbour = setup(4, 3), sparse = createOceanPelagicCommunityPlan(neighbour.generator, neighbour.chunk, neighbour.options);
  assert.equal(sparse.eligible, true);
  assert.equal(sparse.placements.length, 0);
});
