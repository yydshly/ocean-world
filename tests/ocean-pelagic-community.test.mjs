import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator, OCEAN_AUTHORED_RADIUS, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanCommunityPlan } from '../src/oceanCommunity.js';
import { createOceanPelagicCommunityPlan, OCEAN_PELAGIC_COMMUNITY_VERSION } from '../src/oceanPelagicCommunity.js';
import { oceanPelagicSpeciesCatalog, oceanPelagicSpeciesById } from '../src/oceanPelagicSpecies.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const setup = (seed, cx, cz) => {
  const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator), chunk = generator.chunk(cx, cz);
  const options = { random: salt => ecology._random({ id: chunk.id }, salt),
    surface: (x, z, fish) => ecology._surface(x, z, fish) };
  return { generator, ecology, chunk, options, plan: () => createOceanPelagicCommunityPlan(generator, chunk, options) };
};
const assertFrozen = value => {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
};
function fixture(depth = 25) {
  const floorY = OCEAN_SURFACE_Y - depth;
  const host = { id: 'rock:fixture', kind: 'rock', x: 96, y: floorY - .06, z: 96,
    rotation: 0, profile: 'mound', scale: { x: 6, y: 2, z: 6 } };
  const chunk = { id: '1,1', cx: 1, cz: 1, bounds: { minX: 64, maxX: 128, minZ: 64, maxZ: 128 }, elements: [host] };
  const generator = { sample: () => ({ floorY, depthM: depth, habitat: 'arbitrary-label' }) };
  const surface = (x, z) => Math.max(floorY, oceanRockHeight(host, x, z) ?? floorY);
  const options = { random: () => .5, surface };
  return { generator, chunk, options, host };
}

test('the new regional catalog identifies a sourced 25cm planktivore without changing the shallow catalog', () => {
  assert.equal(oceanPelagicSpeciesCatalog.length, 1);
  const species = oceanPelagicSpeciesById['yellowtail-fusilier'];
  assert.equal(species, oceanPelagicSpeciesCatalog[0]);
  assert.equal(species.scientificName, 'Caesio cuning');
  assert.equal(species.lengthM, .25); assert.equal(species.kind, 'fish');
  assert.equal(species.guild, 'planktivore'); assert.equal(species.regionalOnly, true);
  assert.ok(species.sources.some(source => new URL(source.url).hostname === 'australian.museum'));
  assert.match(species.behavior, /5–8/);
  assert.match(species.behavior, /已加载的相邻海域之间巡游/);
  assert.match(species.behavior, /未加载海域暂停演化/);
  assert.match(species.behavior, /未模拟[^。；]*季节迁徙/);
});

test('a reachable real seed has one complete host-stable midwater school over actual coral-inclusive surfaces', () => {
  const { generator, chunk, options, plan } = setup('42', 9, -2), result = plan();
  assert.equal(result.version, OCEAN_PELAGIC_COMMUNITY_VERSION);
  assert.equal(result.eligible, true); assert.equal(result.placements.length, 7);
  assert.equal(result.niches.shoalCount, 1);
  const host = chunk.elements.find(element => element.id === result.placements[0].hostId);
  assert.equal(host.id, 'rock:73,-12');
  assert.deepEqual(result.placements[0].schoolHome, { x: host.x, z: host.z, depthM: 9.339095888026865 });
  assert.ok(host.x >= chunk.bounds.minX + 12 && host.x <= chunk.bounds.maxX - 12);
  assert.ok(host.z >= chunk.bounds.minZ + 12 && host.z <= chunk.bounds.maxZ - 12);
  for (const fish of result.placements) {
    assert.equal(fish.speciesId, 'yellowtail-fusilier');
    assert.equal(fish.habitat, 'pelagic-water-column');
    assert.equal(fish.siteId, `pelagic:${host.id}:fish:${fish.schoolSlot}`);
    assert.equal(fish.groupId, `pelagic-school:${host.id}`);
    assert.ok(fish.depthM >= 3 && fish.depthM <= 16);
    assert.ok(OCEAN_SURFACE_Y - fish.depthM >= options.surface(fish.x, fish.z, true) + 2);
    assert.ok(generator.sample(fish.x, fish.z).depthM >= 12);
    assert.ok(Math.hypot(fish.x, fish.z) > OCEAN_AUTHORED_RADIUS + 1);
    assert.ok(fish.orbitRadiusM >= 5 && fish.orbitRadiusM < 8);
    assert.equal(fish.schoolHome, result.placements[0].schoolHome);
  }
  assertFrozen(result);
});

test('multiple seeds and negative owners preserve bounded complete schools and genuine sparse empty cells', () => {
  let groups = 0, sparse = 0, negative = 0;
  const signatures = new Set();
  for (const seed of [42, '42', 91, 'seams']) for (const [cx, cz] of
    [[7, -2], [8, -2], [9, -2], [8, -1], [-2, 1], [-5, -2], [-11, -29], [1, 1]]) {
    const { chunk, options, plan } = setup(seed, cx, cz), result = plan();
    signatures.add(hash(result));
    if (result.eligible && !result.placements.length) sparse++;
    if (result.placements.length) {
      groups++; if (cx < 0 || cz < 0) negative++;
      assert.ok(result.placements.length >= 5 && result.placements.length <= 8);
      assert.equal(new Set(result.placements.map(fish => fish.groupId)).size, 1);
      assert.equal(new Set(result.placements.map(fish => fish.siteId)).size, result.placements.length);
    }
    for (const fish of result.placements) {
      const host = chunk.elements.find(element => element.id === fish.hostId);
      assert.ok(['rock', 'formation'].includes(host.kind));
      assert.equal(Math.floor(host.x / 64), cx); assert.equal(Math.floor(host.z / 64), cz);
      assert.ok(fish.x >= chunk.bounds.minX + .6 && fish.x <= chunk.bounds.maxX - .6);
      assert.ok(fish.z >= chunk.bounds.minZ + .6 && fish.z <= chunk.bounds.maxZ - .6);
      assert.ok(OCEAN_SURFACE_Y - fish.depthM >= options.surface(fish.x, fish.z, true) + 2);
    }
    assertFrozen(result);
  }
  assert.ok(groups > 8 && sparse > 3 && negative > 2 && signatures.size > 15);
});

test('load order, reversed scenery, habitat labels and camera metadata never alter slots or scenery', () => {
  const first = setup('42', 9, -2), second = setup('42', 9, -2), geometry = hash(first.chunk), expected = first.plan();
  for (const [cx, cz] of [[0, 0], [-50, 30], [20, -8], [9, -2]]) second.generator.chunk(cx, cz);
  const labelled = { ...second.generator, sample: (x, z) => ({ ...second.generator.sample(x, z),
    habitat: 'authored-reef', substrate: 'sand', rockiness: 0 }) };
  const reordered = { ...second.chunk, elements: second.chunk.elements.toReversed(), agents: [{ alive: false }] };
  Object.defineProperty(reordered, 'camera', { get() { throw new Error('observer must not affect population plans'); } });
  assert.deepEqual(createOceanPelagicCommunityPlan(labelled, reordered, second.options), expected);
  assert.equal(hash(first.chunk), geometry); assert.equal(hash(second.generator.chunk(9, -2)), geometry);
});

test('missing, foreign, unsupported, shallow or obstructed structures reject whole cohorts', () => {
  for (const depth of [11.99, 35.01]) {
    const { generator, chunk, options } = fixture(depth);
    const result = createOceanPelagicCommunityPlan(generator, chunk, options);
    assert.equal(result.eligible, false); assert.equal(result.placements.length, 0);
  }
  for (const depth of [12, 35]) {
    const { generator, chunk, options } = fixture(depth);
    assert.equal(createOceanPelagicCommunityPlan(generator, chunk, options).placements.length, 7);
  }
  const { generator, chunk, options, host } = fixture();
  for (const changed of [{ ...chunk, elements: [] }, { ...chunk, cx: 2 },
    { ...chunk, elements: [{ ...host, x: 70 }] },
    { ...chunk, elements: [{ ...host, y: -100 }] },
    { ...chunk, elements: [{ ...host, profile: 'invented' }] }]) {
    const result = createOceanPelagicCommunityPlan(generator, changed, options);
    assert.equal(result.eligible, false); assert.equal(result.placements.length, 0);
  }
  for (const surface of [() => Number.NaN, () => OCEAN_SURFACE_Y - 7.99]) {
    assert.equal(createOceanPelagicCommunityPlan(generator, chunk, { ...options, surface }).placements.length, 0);
  }
  const base = createOceanPelagicCommunityPlan(generator, chunk, { ...options,
    random: salt => salt.startsWith('pelagic:school-size:') ? .99 : .5 });
  const blockedSlot = base.placements[7];
  const obstruction = (x, z, fish) => Math.hypot(x - blockedSlot.x, z - blockedSlot.z) < .01 ?
    OCEAN_SURFACE_Y - 7.99 : options.surface(x, z, fish);
  const incomplete = createOceanPelagicCommunityPlan(generator, chunk, { ...options,
    random: salt => salt.startsWith('pelagic:school-size:') ? 0 : .5, surface: obstruction });
  assert.equal(incomplete.eligible, false);
  assert.equal(incomplete.placements.length, 0, 'even an unrequested eighth slot obstruction invalidates the cohort');
});

test('authored exclusion covers the sampled patrol and seeded presence does not turn every legal cell into a school', () => {
  const { generator, options, host } = fixture();
  const nearAuthoredHost = { ...host, x: 30, z: 30 };
  const chunk = { id: '0,0', cx: 0, cz: 0, bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 64 }, elements: [nearAuthoredHost] };
  const surface = (x, z) => Math.max(-17, oceanRockHeight(nearAuthoredHost, x, z) ?? -17);
  assert.equal(createOceanPelagicCommunityPlan(generator, chunk, { ...options, surface }).eligible, false);
  const safe = fixture();
  for (const present of [.6, .99]) {
    const result = createOceanPelagicCommunityPlan(safe.generator, safe.chunk, { ...safe.options,
      random: salt => salt === 'pelagic:present' ? present : .5 });
    assert.equal(result.eligible, true); assert.equal(result.placements.length, 0);
  }
});

test('quota changes preserve fixed slot identities, coordinates, home and patrol parameters', () => {
  const { generator, chunk, options } = fixture();
  const make = quota => createOceanPelagicCommunityPlan(generator, chunk, { ...options,
    random: salt => salt.startsWith('pelagic:school-size:') ? quota : .5 });
  const small = make(0), large = make(.99);
  assert.equal(small.placements.length, 5); assert.equal(large.placements.length, 8);
  for (const fish of small.placements) assert.deepEqual(large.placements.find(other => other.siteId === fish.siteId), fish);
});

test('the old complete shallow community plan and generated geometry retain their recorded hashes', () => {
  const records = [42, '42', 91, 'seams'].map(seed => {
    const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator);
    return { seed, plans: [[-2, -1], [-1, -2], [1, 0], [3, -1]].map(([cx, cz]) => {
      const chunk = generator.chunk(cx, cz), options = { random: salt => ecology._random({ id: chunk.id }, salt),
        surface: (x, z, fish) => ecology._surface(x, z, fish) };
      const scenery = hash(chunk), plan = createOceanCommunityPlan(generator, chunk, options);
      createOceanPelagicCommunityPlan(generator, chunk, options);
      assert.equal(hash(generator.chunk(cx, cz)), scenery);
      assert.deepEqual(createOceanCommunityPlan(generator, chunk, options), plan);
      return { cx, cz, plan };
    }) };
  });
  assert.equal(hash(records), '3db6ddc87617dbd1fdc52477b83dd645d2c1db260000a95fedc0372e2a0e33df');
});
