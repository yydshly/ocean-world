import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator, OCEAN_AUTHORED_RADIUS, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanCommunityPlan } from '../src/oceanCommunity.js';
import { createOceanPelagicCommunityPlan } from '../src/oceanPelagicCommunity.js';
import { createOceanMantaCommunityPlan, OCEAN_MANTA_COMMUNITY_VERSION,
  OCEAN_MANTA_MAX_DISC_WIDTH_M, OCEAN_MANTA_SUPPORT_CLEARANCE_M,
  OCEAN_MANTA_FOOTPRINT_RADIUS_M } from '../src/oceanMantaCommunity.js';
import { oceanMantaSpeciesCatalog, oceanMantaSpeciesById } from '../src/oceanMantaSpecies.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const TAU = Math.PI * 2;
const setup = (seed, cx, cz) => {
  const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator), chunk = generator.chunk(cx, cz);
  const options = { random: salt => ecology._random({ id: chunk.id }, salt),
    surface: (x, z, water) => ecology._surface(x, z, water) };
  return { generator, chunk, options, plan: () => createOceanMantaCommunityPlan(generator, chunk, options) };
};
function assertFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  Object.values(value).forEach(assertFrozen);
}
function fixture(depth = 25) {
  const floorY = OCEAN_SURFACE_Y - depth;
  const host = { id: 'rock:fixture', kind: 'rock', x: 96, y: floorY - .06, z: 96,
    rotation: 0, profile: 'mound', scale: { x: 6, y: 2, z: 6 } };
  const chunk = { id: '1,1', cx: 1, cz: 1, bounds: { minX: 64, maxX: 128, minZ: 64, maxZ: 128 }, elements: [host] };
  const generator = { sample: () => ({ floorY, depthM: depth, habitat: 'arbitrary-label' }) };
  const surface = (x, z) => Math.max(floorY, oceanRockHeight(host, x, z) ?? floorY);
  const options = { random: salt => salt === 'manta:present' ? .1 : .5, surface };
  return { generator, chunk, options, host };
}
function patrolProbes(ray) {
  const home = ray.patrolHome;
  const centres = [home, ...Array.from({ length: 24 }, (_, index) => {
    const angle = ray.patrolPhaseRad + index * TAU / 24;
    return { x: home.x + Math.cos(angle) * ray.orbitRadiusM, z: home.z + Math.sin(angle) * ray.orbitRadiusM };
  })];
  return centres.flatMap(centre => [centre, ...Array.from({ length: 8 }, (_, index) => ({
    x: centre.x + Math.cos(index * TAU / 8) * OCEAN_MANTA_FOOTPRINT_RADIUS_M,
    z: centre.z + Math.sin(index * TAU / 8) * OCEAN_MANTA_FOOTPRINT_RADIUS_M,
  }))]);
}

test('the sourced regional manta catalog measures disc width and discloses local-model limitations', () => {
  assert.equal(oceanMantaSpeciesCatalog.length, 1);
  const ray = oceanMantaSpeciesById['reef-manta'];
  assert.equal(ray, oceanMantaSpeciesCatalog[0]); assert.equal(ray.kind, 'ray');
  assert.equal(ray.scientificName, 'Mobula alfredi'); assert.equal(ray.guild, 'planktivore');
  assert.equal(ray.lengthM, 3.15); assert.equal(ray.discWidthM, 3.15);
  assert.equal(ray.sizeMeasure, 'disc-width'); assert.equal(ray.regionalOnly, true);
  assert.ok(ray.sources.some(source => new URL(source.url).hostname === 'www.mantatrust.org'));
  assert.ok(ray.sources.some(source => new URL(source.url).hostname === 'fishesofaustralia.net.au'));
  assert.match(ray.description, /3.0–3.3米/); assert.match(ray.behavior, /不代表真实季节迁徙/);
  assert.match(ray.behavior, /已加载的相邻分区/); assert.match(ray.behavior, /未加载区冻结/);
  assert.match(ray.behavior, /未校准/); assert.match(ray.behavior, /完整身体碰撞/);
});

test('a reachable real seeded manta starts on a stable, wing-clear sampled patrol', () => {
  const { generator, chunk, options, plan } = setup('42', 4, -2), result = plan();
  assert.equal(result.version, OCEAN_MANTA_COMMUNITY_VERSION); assert.equal(result.eligible, true);
  assert.equal(result.placements.length, 1); assert.equal(result.niches.rayCount, 1);
  const ray = result.placements[0], host = chunk.elements.find(element => element.id === ray.hostId);
  assert.equal(ray.hostId, 'rock:35,-13'); assert.equal(ray.siteId, `manta:${host.id}:ray:0`);
  assert.equal(ray.speciesId, 'reef-manta'); assert.equal(ray.habitat, 'manta-water-column');
  assert.deepEqual(ray.patrolHome, { x: host.x, z: host.z, depthM: 10.00379483570621 });
  assert.ok(Math.abs(Math.hypot(ray.x - host.x, ray.z - host.z) - ray.orbitRadiusM) < 1e-12);
  assert.ok(ray.orbitRadiusM >= 10 && ray.orbitRadiusM < 14);
  assert.equal(OCEAN_MANTA_MAX_DISC_WIDTH_M, 3.3);
  for (const probe of patrolProbes(ray)) {
    assert.ok(probe.x >= chunk.bounds.minX + .6 && probe.x <= chunk.bounds.maxX - .6);
    assert.ok(probe.z >= chunk.bounds.minZ + .6 && probe.z <= chunk.bounds.maxZ - .6);
    assert.ok(Math.hypot(probe.x, probe.z) > OCEAN_AUTHORED_RADIUS + 1);
    assert.ok(generator.sample(probe.x, probe.z).depthM >= 12);
    assert.ok(generator.sample(probe.x, probe.z).depthM <= 35);
    assert.ok(OCEAN_SURFACE_Y - options.surface(probe.x, probe.z, true) >= 10);
    assert.ok(OCEAN_SURFACE_Y - ray.depthM >= options.surface(probe.x, probe.z, true) + OCEAN_MANTA_SUPPORT_CLEARANCE_M);
  }
  assert.ok(ray.depthM >= 3 && ray.depthM <= 16); assertFrozen(result);
});

test('independent seeded presence is genuinely sparse while eligible empty cells stay eligible', () => {
  const empty = setup('42', 5, -2).plan();
  assert.equal(empty.eligible, true); assert.equal(empty.placements.length, 0);
  let present = 0, sparse = 0, negative = 0;
  const signatures = new Set();
  for (const seed of [42, '42', 91, 'seams']) for (const [cx, cz] of
    [[4, -2], [5, -2], [4, -1], [8, -3], [9, -4], [-2, 1], [-5, -2], [-11, -29], [1, 1]]) {
    const { chunk, options, plan } = setup(seed, cx, cz), result = plan();
    signatures.add(hash(result));
    if (result.eligible && !result.placements.length) sparse++;
    if (result.placements.length) { present++; if (cx < 0 || cz < 0) negative++; }
    assert.ok(result.placements.length <= 1);
    for (const ray of result.placements) {
      const host = chunk.elements.find(element => element.id === ray.hostId);
      assert.ok(['rock', 'formation'].includes(host.kind));
      assert.equal(Math.floor(host.x / 64), cx); assert.equal(Math.floor(host.z / 64), cz);
      assert.ok(OCEAN_SURFACE_Y - ray.depthM >= options.surface(ray.x, ray.z, true) + OCEAN_MANTA_SUPPORT_CLEARANCE_M);
    }
    assertFrozen(result);
  }
  assert.ok(present > 2 && sparse > 8 && negative > 2 && signatures.size > 15);
  assert.notEqual(hash(setup(42, 4, -2).plan()), hash(setup('42', 4, -2).plan()));
});

test('load order, reversed scenery, label changes and observer metadata never change the plan or geometry', () => {
  const first = setup('42', 4, -2), second = setup('42', 4, -2), geometry = hash(first.chunk), expected = first.plan();
  for (const [cx, cz] of [[0, 0], [-50, 30], [20, -8], [4, -2]]) second.generator.chunk(cx, cz);
  const labelled = { ...second.generator, sample: (x, z) => ({ ...second.generator.sample(x, z),
    habitat: 'authored-reef', substrate: 'sand', rockiness: 0 }) };
  const reordered = { ...second.chunk, elements: second.chunk.elements.toReversed(), agents: [{ alive: false }] };
  Object.defineProperty(reordered, 'camera', { get() { throw new Error('observer must not affect manta plans'); } });
  assert.deepEqual(createOceanMantaCommunityPlan(labelled, reordered, second.options), expected);
  assert.equal(hash(first.chunk), geometry); assert.equal(hash(second.generator.chunk(4, -2)), geometry);
});

test('missing, foreign, unsupported and invalid-depth structures cannot allocate a manta', () => {
  for (const depth of [11.99, 35.01]) {
    const { generator, chunk, options } = fixture(depth);
    assert.equal(createOceanMantaCommunityPlan(generator, chunk, options).eligible, false);
  }
  const { generator, chunk, options, host } = fixture();
  for (const changed of [{ ...chunk, elements: [] }, { ...chunk, cx: 2 },
    { ...chunk, elements: [{ ...host, x: 70 }] },
    { ...chunk, elements: [{ ...host, y: -100 }] },
    { ...chunk, elements: [{ ...host, profile: 'invented' }] },
    { ...chunk, elements: [{ ...host, scale: { x: 6, y: -1, z: 6 } }] }]) {
    const result = createOceanMantaCommunityPlan(generator, changed, options);
    assert.equal(result.eligible, false); assert.equal(result.placements.length, 0);
  }
  for (const surface of [() => Number.NaN, () => OCEAN_SURFACE_Y - 9.99])
    assert.equal(createOceanMantaCommunityPlan(generator, chunk, { ...options, surface }).eligible, false);
  assert.equal(createOceanMantaCommunityPlan(generator, chunk, { ...options,
    surface: () => OCEAN_SURFACE_Y - 10 }).placements.length, 1);
});

test('wing-footprint obstructions and owner-seam patrol overflow reject a centre-clear site', () => {
  const { generator, chunk, options, host } = fixture();
  const base = createOceanMantaCommunityPlan(generator, chunk, options), ray = base.placements[0];
  const wing = { x: ray.x + OCEAN_MANTA_FOOTPRINT_RADIUS_M, z: ray.z };
  assert.ok(options.surface(ray.x, ray.z, true) < OCEAN_SURFACE_Y - ray.depthM - OCEAN_MANTA_SUPPORT_CLEARANCE_M);
  const obstruction = (x, z, water) => Math.hypot(x - wing.x, z - wing.z) < .01 ?
    OCEAN_SURFACE_Y - 9.99 : options.surface(x, z, water);
  assert.equal(createOceanMantaCommunityPlan(generator, chunk, { ...options, surface: obstruction }).eligible, false);
  const nearSeam = { ...host, x: 78 };
  const seamSurface = (x, z) => Math.max(generator.sample(x, z).floorY, oceanRockHeight(nearSeam, x, z) ?? -17);
  const atSeam = createOceanMantaCommunityPlan(generator, { ...chunk, elements: [nearSeam] }, { ...options,
    surface: seamSurface, random: salt => salt.startsWith('manta:orbit-radius:') ? .99 : options.random(salt) });
  assert.equal(atSeam.eligible, false);
});

test('the authored exclusion covers patrol wings, and presence boundary never changes a legal site', () => {
  const { generator, options, host } = fixture();
  const nearAuthoredHost = { ...host, x: 30, z: 30 };
  const chunk = { id: '0,0', cx: 0, cz: 0, bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 64 }, elements: [nearAuthoredHost] };
  const surface = (x, z) => Math.max(-17, oceanRockHeight(nearAuthoredHost, x, z) ?? -17);
  assert.equal(createOceanMantaCommunityPlan(generator, chunk, { ...options, surface }).eligible, false);
  const safe = fixture();
  for (const present of [.22, .99]) {
    const result = createOceanMantaCommunityPlan(safe.generator, safe.chunk, { ...safe.options,
      random: salt => salt === 'manta:present' ? present : .5 });
    assert.equal(result.eligible, true); assert.equal(result.placements.length, 0);
  }
  const nearBoundary = createOceanMantaCommunityPlan(safe.generator, safe.chunk, { ...safe.options,
    random: salt => salt === 'manta:present' ? .219999 : .5 });
  assert.deepEqual(nearBoundary, createOceanMantaCommunityPlan(safe.generator, safe.chunk, safe.options));
});

test('old generated scenery, shallow plans and existing midwater plans remain unchanged', () => {
  const records = [42, '42', 91, 'seams'].map(seed => {
    const generator = createOceanGenerator(seed), ecology = new OceanEcology(seed, generator);
    return { seed, plans: [[-2, -1], [-1, -2], [1, 0], [3, -1]].map(([cx, cz]) => {
      const chunk = generator.chunk(cx, cz), options = { random: salt => ecology._random({ id: chunk.id }, salt),
        surface: (x, z, water) => ecology._surface(x, z, water) };
      const scenery = hash(chunk), plan = createOceanCommunityPlan(generator, chunk, options);
      const midwater = createOceanPelagicCommunityPlan(generator, chunk, options);
      createOceanMantaCommunityPlan(generator, chunk, options);
      assert.equal(hash(generator.chunk(cx, cz)), scenery);
      assert.deepEqual(createOceanCommunityPlan(generator, chunk, options), plan);
      assert.deepEqual(createOceanPelagicCommunityPlan(generator, chunk, options), midwater);
      return { cx, cz, plan };
    }) };
  });
  assert.equal(hash(records), '3db6ddc87617dbd1fdc52477b83dd645d2c1db260000a95fedc0372e2a0e33df');
});
