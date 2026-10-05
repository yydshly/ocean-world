import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { createOceanCommunityPlan } from '../src/oceanCommunity.js';
import { createOceanSlopeCommunityPlan, OCEAN_SLOPE_COMMUNITY_VERSION } from '../src/oceanSlopeCommunity.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const setup = (seed, cx, cz) => {
  const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator), chunk = generator.chunk(cx, cz);
  const options = { random: salt => ecology._random({ id: chunk.id }, salt),
    surface: (x, z, fish) => ecology._surface(x, z, fish) };
  return { generator, ecology, chunk, options, plan: () => createOceanSlopeCommunityPlan(generator, chunk, options) };
};
const counts = plan => plan.placements.reduce((result, placement) => {
  result[placement.speciesId] = (result[placement.speciesId] || 0) + 1; return result;
}, {});
const assertFrozen = value => {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
};

function fixture(depth = 25) {
  const elements = [86, 107].map((z, index) => ({ id: `formation:fixture:${index}`, kind: 'formation', x: 96, z,
    y: -17, rotation: 0, profile: 'terrace', scale: { x: 24, y: 3, z: 8 } }));
  const chunk = { id: '1,1', cx: 1, cz: 1, bounds: { minX: 64, maxX: 128, minZ: 64, maxZ: 128 }, elements };
  const generator = { sample: (x, z) => ({ floorY: -17, depthM: typeof depth === 'function' ? depth(x, z) : depth,
    habitat: 'any-label', substrate: 'sand' }) };
  const support = (x, z) => Math.max(-17, ...elements.map(host => oceanRockHeight(host, x, z) ?? -17));
  const options = { random: () => .5, surface: support };
  return { generator, chunk, options, support };
}

test('actual string-seed outer slope has two host-stable shoals and an existing-species surface feeder', () => {
  const { generator, chunk, options, plan } = setup('42', 4, -2), result = plan();
  assert.equal(result.version, OCEAN_SLOPE_COMMUNITY_VERSION);
  assert.equal(result.eligible, true);
  assert.deepEqual(counts(result), { 'lyretail-anthias': 10, 'blue-starfish': 1 });
  assert.equal(result.niches.shoalCount, 2);
  const groups = new Map();
  for (const animal of result.placements) {
    const host = chunk.elements.find(element => element.id === animal.hostId);
    assert.equal(host.kind, 'formation');
    assert.ok(animal.siteId.startsWith(`slope:${host.id}:`));
    assert.ok(animal.x >= chunk.bounds.minX + .6 && animal.x <= chunk.bounds.maxX - .6);
    assert.ok(animal.z >= chunk.bounds.minZ + .6 && animal.z <= chunk.bounds.maxZ - .6);
    const environment = generator.sample(animal.x, animal.z), support = options.surface(animal.x, animal.z);
    assert.ok(environment.depthM >= 22 && environment.depthM <= 35);
    assert.ok(Math.abs(oceanRockHeight(host, animal.x, animal.z) - support) <= .03);
    assert.ok(support - environment.floorY > .06);
    assert.ok(options.surface(animal.x, animal.z, true) <= support + .02);
    if (animal.speciesId === 'lyretail-anthias') {
      assert.equal(animal.groupId, `slope-school:${host.id}`);
      assert.equal(animal.habitat, 'slope-water-column');
      if (!groups.has(animal.groupId)) groups.set(animal.groupId, []);
      groups.get(animal.groupId).push(animal);
    } else { assert.equal(animal.groupId, null); assert.equal(animal.habitat, 'slope-hard-surface'); }
  }
  assert.deepEqual([...groups.values()].map(group => group.length), [6, 4]);
  for (const group of groups.values()) for (const animal of group) {
    assert.ok(group.some(peer => peer !== animal && Math.hypot(peer.x - animal.x, peer.z - animal.z) < .7));
  }
  assertFrozen(result);
});

test('multi-seed formations yield bounded real-supported plans, including negative owners near a seam', () => {
  const signatures = new Set();
  let eligible = 0, negative = 0;
  for (const seed of [42, '42', 91, 'seams']) for (const [cx, cz] of [[4, -2], [7, 1], [1, 7], [-2, 1], [-5, -2], [-11, -29], [1, 1]]) {
    const { generator, chunk, options, plan } = setup(seed, cx, cz), result = plan();
    signatures.add(hash(result));
    const groups = new Map();
    assert.ok((counts(result)['lyretail-anthias'] || 0) <= 10 && (counts(result)['blue-starfish'] || 0) <= 2);
    assert.equal(new Set(result.placements.map(site => site.siteId)).size, result.placements.length);
    if (result.eligible) { eligible++; if (cx < 0 || cz < 0) negative++; assert.ok(result.placements.length >= 1); }
    for (const site of result.placements) {
      const host = chunk.elements.find(element => element.id === site.hostId);
      assert.equal(host?.kind, 'formation');
      assert.equal(Math.floor(host.x / 64), cx); assert.equal(Math.floor(host.z / 64), cz);
      assert.ok(site.x >= chunk.bounds.minX + .6 && site.x <= chunk.bounds.maxX - .6);
      assert.ok(site.z >= chunk.bounds.minZ + .6 && site.z <= chunk.bounds.maxZ - .6);
      const sample = generator.sample(site.x, site.z), support = options.surface(site.x, site.z);
      assert.ok(sample.depthM >= 22 && sample.depthM <= 35);
      assert.ok(support - sample.floorY > .06 && Math.abs(oceanRockHeight(host, site.x, site.z) - support) <= .03);
      if (site.groupId) { if (!groups.has(site.groupId)) groups.set(site.groupId, []); groups.get(site.groupId).push(site); }
    }
    assert.ok(groups.size <= 2);
    for (const group of groups.values()) assert.ok(group.length >= 4 && group.length <= 6);
    assertFrozen(result);
  }
  assert.ok(eligible >= 8 && negative >= 4 && signatures.size > 8);
});

test('load order, scenery order and displayed habitat or old-agent metadata do not change the plan or geometry', () => {
  const first = setup('42', 4, -2), reordered = setup('42', 4, -2);
  const before = hash(first.chunk), expected = first.plan();
  for (const [cx, cz] of [[50, -20], [-7, 4], [0, 0], [4, -2]]) reordered.generator.chunk(cx, cz);
  const relabelled = { ...reordered.generator, sample: (x, z) => ({ ...reordered.generator.sample(x, z),
    habitat: 'seagrass', substrate: 'sand', rockiness: 0, seagrassSuitability: 1 }) };
  const reverseChunk = { ...reordered.chunk, elements: reordered.chunk.elements.toReversed(),
    counts: { formation: 0, rock: 99999 }, agents: [{ speciesId: 'lyretail-anthias', alive: false }] };
  Object.defineProperty(reverseChunk, 'camera', { get() { throw new Error('camera is not a planner input'); } });
  assert.deepEqual(createOceanSlopeCommunityPlan(relabelled, reverseChunk, reordered.options), expected);
  assert.equal(hash(first.chunk), before);
  assert.equal(hash(reordered.generator.chunk(4, -2)), before);
});

test('depth bounds, ownership, occluding surfaces, vegetation and absent structures reject unsupported sites', () => {
  for (const depth of [21.99, 35.01]) {
    const { generator, chunk, options } = fixture(depth);
    const result = createOceanSlopeCommunityPlan(generator, chunk, options);
    assert.equal(result.eligible, false); assert.equal(result.placements.length, 0); assertFrozen(result);
  }
  for (const depth of [22, 35]) {
    const { generator, chunk, options } = fixture(depth);
    assert.equal(createOceanSlopeCommunityPlan(generator, chunk, options).eligible, true);
  }
  const { generator, chunk, options, support } = fixture();
  assert.equal(createOceanSlopeCommunityPlan(generator, { ...chunk, elements: [] }, options).eligible, false);
  assert.equal(createOceanSlopeCommunityPlan(generator, { ...chunk, cx: 2, id: '2,1' }, options).eligible, false,
    'a neighbouring cell cannot populate another owner by copying its footprint');
  assert.equal(createOceanSlopeCommunityPlan(generator, chunk, { ...options, surface: (x, z) => support(x, z) + .2 }).eligible, false);
  assert.equal(createOceanSlopeCommunityPlan(generator, chunk, { ...options, surface: (x, z, fish) => support(x, z) + (fish ? .1 : 0) }).eligible, false);
  const grassy = { ...chunk, elements: [...chunk.elements,
    { kind: 'seagrass', x: 96, z: 96, scale: { x: 100, y: 1, z: 100 } }] };
  assert.equal(createOceanSlopeCommunityPlan(generator, grassy, options).eligible, false);
});

test('a partial exposed site remains eligible for a star without inventing an undersized shoal', () => {
  const { generator, chunk, options, support } = fixture();
  const tinySurface = (x, z) => Math.hypot(x - 96, z - 86) < .2 ? support(x, z) : -17;
  const partial = createOceanSlopeCommunityPlan(generator, chunk, { ...options, surface: tinySurface });
  assert.equal(partial.eligible, true);
  assert.equal(partial.niches.legalHosts, 1);
  assert.equal(partial.niches.shoalCount, 0);
  assert.deepEqual(counts(partial), { 'blue-starfish': 1 });
  assertFrozen(partial);
});

test('host-slot positions stay stable when school-size quotas change', () => {
  const { generator, chunk, options } = fixture();
  const small = createOceanSlopeCommunityPlan(generator, chunk, { ...options,
    random: salt => salt.startsWith('slope:school-size:') ? 0 : .5 });
  const large = createOceanSlopeCommunityPlan(generator, chunk, { ...options,
    random: salt => salt.startsWith('slope:school-size:') ? .99 : .5 });
  assert.equal(counts(small)['lyretail-anthias'], 8);
  assert.equal(counts(large)['lyretail-anthias'], 10);
  for (const site of small.placements) {
    const same = large.placements.find(other => other.siteId === site.siteId);
    assert.deepEqual(same, site, 'stable slots are not moved by a change from four to six school members');
  }
});

test('the original complete shallow community plans retain their recorded hash after slope planning', () => {
  const records = [42, '42', 91, 'seams'].map(seed => {
    const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator);
    return { seed, plans: [[-2, -1], [-1, -2], [1, 0], [3, -1]].map(([cx, cz]) => {
      const chunk = generator.chunk(cx, cz), options = { random: salt => ecology._random({ id: chunk.id }, salt),
        surface: (x, z, fish) => ecology._surface(x, z, fish) };
      const beforeGeometry = hash(chunk), plan = createOceanCommunityPlan(generator, chunk, options);
      createOceanSlopeCommunityPlan(generator, chunk, options);
      assert.equal(hash(generator.chunk(cx, cz)), beforeGeometry);
      assert.deepEqual(createOceanCommunityPlan(generator, chunk, options), plan);
      return { cx, cz, plan };
    }) };
  });
  // Recorded before slope planner integration. No fields of the old plan omit.
  assert.equal(hash(records), '3db6ddc87617dbd1fdc52477b83dd645d2c1db260000a95fedc0372e2a0e33df');
});
