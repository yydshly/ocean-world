import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator, OCEAN_AUTHORED_RADIUS, OCEAN_CHUNK_CACHE_LIMIT } from '../src/oceanGeneration.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

const fields = ['seagrass', 'sandOpening', 'hardBottom', 'authoredBlend'];
const coordinates = [[0, 0], [2, -3], [-4, -4], [-3, -4], [-2, -4], [18, 9], [-1, -1], [100, -99]];
const sampleCoordinates = [[0, 0], [39, 2], [40, 0], [80, -8], [160.4, -91.2], [-201.8, 17.3], [899, 425], [1e9, -1e9]];
const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const legacyChunk = chunk => {
  const { formationsVersion, formationSummary, ...original } = chunk;
  const { formation, ...counts } = original.counts;
  return { ...original, elements: original.elements.filter(element => element.kind !== 'formation'), counts };
};

test('cover reads preserve complete current scene state and the recorded unrelated hard layout', () => {
  [42, '42', 91, 'seams'].forEach(seed => {
    const world = createOceanGenerator(seed);
    const samples = sampleCoordinates.map(([x, z]) => world.sample(x, z));
    const chunks = coordinates.map(([cx, cz]) => legacyChunk(world.chunk(cx, cz)));
    const before = digest({ samples, chunks });
    for (let z = -300; z <= 100; z += 17) for (let x = -400; x <= 100; x += 19) world.coverAt(x, z);
    assert.equal(digest({ samples: sampleCoordinates.map(([x, z]) => world.sample(x, z)),
      chunks: coordinates.map(([cx, cz]) => legacyChunk(world.chunk(cx, cz))) }), before);
  });
  // The former complete b32b5aee fixture included illegal grass and analytic
  // contact Y. This projection was calculated from reef-physics-legacy-scenery
  // captured BEFORE the repair, not from accepting the new complete hash.
  // Retain all nonplant identity/order/dimensions, bed composition, seed and
  // attachment metadata; omit only removed grass and corrected rubble Y.
  const recordedCoordinates = [[0, 0], [2, -3], [18, 9], [-1, -1], [100, -99]];
  const physicalProjection = chunk => {
    const original = legacyChunk(chunk), { seagrass, ...counts } = original.counts;
    return { ...original, elements: original.elements.filter(element => element.kind !== 'seagrass').map(element => {
      const record = { ...element }; if (record.kind === 'rubble') delete record.y; return record;
    }), counts };
  };
  const preserved = [42, '42', 91, 'seams'].map(seed => {
    const world = createOceanGenerator(seed);
    return { seed, chunks: recordedCoordinates.map(([cx, cz]) => physicalProjection(world.chunk(cx, cz))) };
  });
  assert.equal(digest(preserved), '3980b4d93384404962bf32f9e4d0d2ab7650d8230fb543a066958166c9c6795d');
});

test('cover is coordinate-seeded and independent of chunk order, cache eviction or prior readings', () => {
  const signatures = new Set();
  const points = [...sampleCoordinates, [-312, -280], [64, 96], [-480, -384]];
  for (const seed of [42, '42', 91, 'seams']) {
    const first = createOceanGenerator(seed), reordered = createOceanGenerator(seed);
    const expected = points.map(([x, z]) => first.coverAt(x, z));
    assert.equal(first.cacheStats().size, 0, 'pure cover queries do not create chunk history');
    for (const [cx, cz] of coordinates.toReversed()) reordered.chunk(cx, cz);
    for (let index = 0; index < OCEAN_CHUNK_CACHE_LIMIT + 3; index++) reordered.chunk(30 + index, -20);
    assert.equal(reordered.cacheStats().size, OCEAN_CHUNK_CACHE_LIMIT);
    for (const [x, z] of points.toReversed()) reordered.coverAt(x, z);
    assert.deepEqual(points.map(([x, z]) => reordered.coverAt(x, z)), expected);
    signatures.add(digest(expected));
  }
  assert.equal(signatures.size, 4, 'distinct seeds, including number/string seeds, retain distinct fields');
});

test('cover is continuous at positive and negative chunk seams and noise-cell boundaries', () => {
  const epsilon = .001;
  for (const seed of ['42', 91, 'seams']) {
    const west = createOceanGenerator(seed), east = createOceanGenerator(seed);
    west.chunk(-4, -4); east.chunk(3, 2);
    const points = [];
    for (const boundary of [-448, -192, -64, 0, 64, 256, 1088]) {
      for (const offset of [-278.2, -131, 27.8, 156.4]) points.push([boundary, offset], [offset, boundary]);
    }
    for (const wavelength of [26, 130]) {
      for (const index of [-7, -1, 1, 4]) points.push([index * wavelength, -185.7], [-219.3, index * wavelength]);
    }
    for (const [x, z] of points) {
      assert.deepEqual(west.coverAt(x, z), east.coverAt(x, z));
      const left = west.coverAt(x - epsilon, z - epsilon), right = east.coverAt(x + epsilon, z + epsilon);
      for (const field of fields) assert.ok(Math.abs(left[field] - right[field]) < .003,
        `${seed} ${field} discontinuity at ${x},${z}`);
    }
  }
});

test('authored reef weights stay zero and the 40–80 metre join remains continuous', () => {
  const world = createOceanGenerator('42');
  for (let radius = 0; radius <= OCEAN_AUTHORED_RADIUS; radius += 4) {
    for (let angle = 0; angle < Math.PI * 2; angle += .31) {
      const weight = world.coverAt(radius * Math.cos(angle), radius * Math.sin(angle));
      // Floating polar round-off at the circle can yield a negligible blend.
      for (const field of fields) assert.ok(weight[field] < 1e-24);
    }
  }
  assert.deepEqual(world.coverAt(40, 0), { seagrass: 0, sandOpening: 0, hardBottom: 0, authoredBlend: 0 });
  assert.equal(world.coverAt(60, 0).authoredBlend, .5);
  assert.equal(world.coverAt(80, 0).authoredBlend, 1);
  for (const radius of [40, 80]) for (let angle = 0; angle < Math.PI * 2; angle += .31) {
    const a = world.coverAt((radius - .001) * Math.cos(angle), (radius - .001) * Math.sin(angle));
    const b = world.coverAt((radius + .001) * Math.cos(angle), (radius + .001) * Math.sin(angle));
    for (const field of fields) assert.ok(Math.abs(a[field] - b[field]) < .003);
  }
});

test('bounded weights share actual soft-bed, depth and hard-bottom constraints rather than cell labels', () => {
  const world = createOceanGenerator('42');
  let supportedGrass = 0, openSand = 0, hardBottom = 0, deep = 0;
  for (let z = -384; z <= 128; z += 8) for (let x = -512; x <= 128; x += 8) {
    const environment = world.sample(x, z), cover = world.coverAt(x, z);
    assert.deepEqual(world.coverAt(x, z, environment), cover, 'the supplied sample path has identical results');
    for (const field of fields) assert.ok(Number.isFinite(cover[field]) && cover[field] >= 0 && cover[field] <= 1);
    if (cover.seagrass > 0) {
      supportedGrass++;
      assert.ok(environment.seagrassSuitability > .36 && environment.rockiness < .54 && environment.depthM < 23);
    }
    if (cover.sandOpening > .98) { openSand++; assert.equal(cover.seagrass, 0); }
    if (cover.hardBottom === 1) { hardBottom++; assert.equal(cover.seagrass, 0); }
    if (environment.depthM >= 23) { deep++; assert.equal(cover.seagrass, 0); }
  }
  assert.ok(supportedGrass > 100 && openSand > 10 && hardBottom > 100 && deep > 10,
    'the bounded sample includes supported beds, open sand, hard substrate and unsupported depth');
});

test('dense-to-mixed-to-hard route retains its cover field with only legal grass roots on shared bed support', () => {
  const world = createOceanGenerator('42');
  const chunks = [[-4, -4], [-3, -4], [-2, -4]].map(([cx, cz]) => world.chunk(cx, cz));
  assert.equal(chunks[0].counts.seagrass, 256);
  // The old middle-cell count142 included four roots overlapping rock beds.
  // Test the route's density relationship and physical contacts, not retention
  // of those invalid scenery records merely to preserve a historic total.
  assert.ok(chunks[1].counts.seagrass > 100 && chunks[1].counts.seagrass < chunks[0].counts.seagrass);
  assert.equal(chunks[2].counts.seagrass, 0);
  for (const chunk of chunks) for (const grass of chunk.elements.filter(element => element.kind === 'seagrass')) {
    const environment = world.sample(grass.x, grass.z);
    assert.notEqual(environment.substrate, 'rock'); assert.ok(environment.depthM < 23);
    assert.equal(grass.y, world.floorSurface(grass.x, grass.z).height);
    assert.ok(Math.abs(oceanSupportHeight(world, grass.x, grass.z) - grass.y) < 1e-12);
  }
  const bedMeans = chunks.slice(0, 2).map(chunk => {
    const bed = chunk.elements.filter(element => element.kind === 'seagrass' && element.id.includes(':bed-'));
    assert.ok(bed.length > 50);
    return bed.reduce((sum, element) => sum + world.coverAt(element.x, element.z).seagrass, 0) / bed.length;
  });
  assert.ok(bedMeans[0] > .7 && bedMeans[1] > .1 && bedMeans[1] < bedMeans[0] * .65);
  assert.equal(world.coverAt(-224, -224).seagrass, 1);
  assert.equal(world.coverAt(-96, -224).hardBottom, 1);
  assert.equal(world.coverAt(-96, -224).seagrass, 0);
  assert.ok(chunks[0].elements.some(element => element.kind === 'seagrass' && !element.id.includes(':bed-')));
});

test('far exploration stays finite and invalid coordinate or environment inputs fail predictably', () => {
  const world = createOceanGenerator('seams');
  for (const [x, z] of [[-1, -65], [-1250, 2200], [1e7, -1e7], [-1e9, 1e9]]) {
    const cover = world.coverAt(x, z);
    for (const field of fields) assert.ok(Number.isFinite(cover[field]) && cover[field] >= 0 && cover[field] <= 1);
  }
  assert.throws(() => world.coverAt(NaN, 100), RangeError);
  assert.throws(() => world.coverAt(100, Infinity), RangeError);
  assert.throws(() => world.coverAt(100, 100, { rockiness: 0, seagrassSuitability: NaN }), TypeError);
  assert.throws(() => world.coverAt(100, 100, {}), TypeError);
  assert.equal(world.cacheStats().size, 0);
});
