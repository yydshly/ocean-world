import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator, OCEAN_CHUNK_SIZE, OCEAN_CHUNK_CACHE_LIMIT, OCEAN_ELEMENT_LIMITS,
  OCEAN_FORMATIONS_VERSION } from '../src/oceanGeneration.js';
import { createOceanFormations, oceanFormationFootprint, OCEAN_FORMATION_UNIT_SIZE,
  OCEAN_FORMATION_LIMIT } from '../src/oceanFormations.js';
import { oceanRockHeight, OCEAN_ROCK_PROFILES } from '../src/oceanRockShape.js';

const formationsOf = chunk => chunk.elements.filter(element => element.kind === 'formation');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const synthetic = (scenery = [], sample = () => ({ floorY: -17, depthM: 25 })) => createOceanFormations({
  randomAt: () => .5, noise: () => .5, sample,
}).forChunk(1, 1, () => ({ elements: scenery }));
const allSamples = [];
for (const seed of [42, '42', 91, 'seams']) {
  const generator = createOceanGenerator(seed), chunks = [];
  // Complete 192m units: no partially sampled boundary group is counted.
  for (let cz = -6; cz <= 8; cz++) for (let cx = -6; cx <= 8; cx++) chunks.push(generator.chunk(cx, cz));
  allSamples.push({ seed, generator, chunks });
}

test('large outcrops are sparse, bounded, frozen and use the actual existing mesh profiles', () => {
  const counts = [];
  for (const { generator, chunks } of allSamples) {
    let occupied = 0, total = 0;
    for (const chunk of chunks) {
      const formations = formationsOf(chunk);
      assert.equal(chunk.formationsVersion, OCEAN_FORMATIONS_VERSION);
      assert.equal(chunk.counts.formation, formations.length);
      assert.equal(chunk.formationSummary.count, formations.length);
      assert.equal(chunk.formationSummary.groups.reduce((sum, group) => sum + group.count, 0), formations.length);
      assert.ok(formations.length <= OCEAN_FORMATION_LIMIT && OCEAN_ELEMENT_LIMITS.formation === OCEAN_FORMATION_LIMIT);
      if (formations.length) occupied++;
      total += formations.length;
      for (const formation of formations) {
        assert.ok(Object.isFrozen(formation) && Object.isFrozen(formation.scale));
        assert.ok(OCEAN_ROCK_PROFILES.includes(formation.profile));
        assert.ok(formation.scale.x >= 12 && formation.scale.x <= 30);
        assert.ok(formation.scale.z >= 4 && formation.scale.z <= 9 && formation.scale.y >= 1 && formation.scale.y <= 3);
        assert.ok(Math.hypot(formation.scale.x, formation.scale.z) * .5 < OCEAN_CHUNK_SIZE * .5);
        assert.equal(Math.floor(formation.x / OCEAN_CHUNK_SIZE), chunk.cx);
        assert.equal(Math.floor(formation.z / OCEAN_CHUNK_SIZE), chunk.cz);
        for (const point of oceanFormationFootprint(formation)) {
          assert.ok(Math.hypot(point.x, point.z) > 40);
          assert.ok(generator.sample(point.x, point.z).depthM > 22);
        }
      }
    }
    assert.ok(total >= 2 && occupied < chunks.length * .2, 'the bounded survey contains groups and substantial open water');
    counts.push(total);
  }
  assert.ok(new Set(counts).size > 1, 'the independent seed stream does not repeat one global layout');
});

test('retained groups contain two to four co-oriented strips with open crosswise channels', () => {
  let checked = 0;
  for (const { chunks } of allSamples) {
    const groups = new Map();
    for (const chunk of chunks) for (const formation of formationsOf(chunk)) {
      if (!groups.has(formation.groupId)) groups.set(formation.groupId, []);
      groups.get(formation.groupId).push(formation);
    }
    for (const group of groups.values()) {
      checked++;
      assert.ok(group.length >= 2 && group.length <= 4);
      group.sort((a, b) => a.formationIndex - b.formationIndex);
      for (const formation of group) {
        assert.equal(formation.rotation, group[0].rotation);
        assert.equal(formation.profile, group[0].profile);
        assert.equal(formation.channelWidth, group[0].channelWidth);
        assert.ok(formation.channelWidth >= 8 && formation.channelWidth <= 14);
      }
      const sin = Math.sin(group[0].rotation), cos = Math.cos(group[0].rotation);
      for (let index = 1; index < group.length; index++) {
        const a = group[index - 1], b = group[index];
        const separation = (b.x - a.x) * sin + (b.z - a.z) * cos;
        const gap = separation - (a.scale.z + b.scale.z) * .5;
        assert.ok(gap >= a.channelWidth - 1e-9);
        if (b.formationIndex === a.formationIndex + 1) assert.ok(Math.abs(gap - a.channelWidth) < 1e-9);
      }
    }
  }
  assert.ok(checked >= 10);
});

test('formation safety uses footprint depth and existing plants/host footprints, and never keeps a single survivor', () => {
  const initial = synthetic();
  assert.equal(initial.length, 3);
  const plant = formation => ({ id: `plant:${formation.id}`, kind: 'seagrass', x: formation.x, z: formation.z,
    scale: { x: 1, y: .5, z: 1 } });
  const kept = synthetic([plant(initial[1])]);
  assert.deepEqual(kept.map(formation => formation.formationIndex), [0, 2]);
  assert.equal(synthetic([plant(initial[0]), plant(initial[2])]).length, 0);
  const host = { id: 'occupied-host', kind: 'rock', x: initial[1].x, z: initial[1].z, scale: { x: 5, y: 2, z: 4 } };
  const coral = { id: 'colony', kind: 'coral', attachmentId: host.id, x: 1000, z: 1000, scale: { x: 1, y: 1, z: 1 } };
  assert.deepEqual(synthetic([host, coral]).map(formation => formation.formationIndex), [0, 2]);
  assert.equal(synthetic([], (x, z) => ({ floorY: -17, depthM: z > 100 ? 21 : 25 })).length, 0,
    'a shallow footprint cannot be accepted from a deep centre alone');
});

test('generated groups avoid all actual prior vegetation and colonies across owner seams', () => {
  let checked = 0;
  for (const { generator, chunks } of allSamples) for (const chunk of chunks) for (const formation of formationsOf(chunk)) {
    checked++;
    const radius = Math.hypot(formation.scale.x, formation.scale.z) * .5;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const scenery = generator.chunk(chunk.cx + dx, chunk.cz + dz).elements;
      const hosts = new Set(scenery.filter(element => element.kind === 'coral').map(element => element.attachmentId));
      for (const element of scenery) if (['seagrass', 'coral'].includes(element.kind) ||
        (element.kind === 'rock' && hosts.has(element.id))) {
        assert.ok(Math.hypot(element.x - formation.x, element.z - formation.z) >=
          radius + Math.hypot(element.scale.x, element.scale.z) * .5 + .75);
      }
    }
  }
  assert.ok(checked > 20);
});

test('seeded complete formation records and summaries survive load order and bounded eviction', () => {
  const coordinates = [[4, -2], [1, 7], [-5, -2], [1, 1], [7, 1], [-2, 4], [100, -99]];
  for (const seed of ['42', 91, 'seams']) {
    const first = createOceanGenerator(seed), reordered = createOceanGenerator(seed);
    const expected = coordinates.map(([cx, cz]) => first.chunk(cx, cz));
    for (const [cx, cz] of coordinates.toReversed()) reordered.chunk(cx, cz);
    for (let index = 0; index <= OCEAN_CHUNK_CACHE_LIMIT; index++) reordered.chunk(index + 30, -30);
    assert.equal(reordered.cacheStats().size, OCEAN_CHUNK_CACHE_LIMIT);
    assert.equal(hash(coordinates.map(([cx, cz]) => reordered.chunk(cx, cz))), hash(expected));
  }
});

test('world strike is continuous rather than a camera, chunk-label or load-history direction', () => {
  const a = createOceanGenerator('42'), b = createOceanGenerator('42');
  b.chunk(4, -2);
  for (const [x, z] of [[64, -128], [-192, 64], [420, -420], [1e9, -1e9]]) {
    const direction = a.formationDirectionAt(x, z);
    assert.deepEqual(direction, b.formationDirectionAt(x, z));
    assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-12);
    const near = a.formationDirectionAt(x + .001, z - .001);
    assert.ok(Math.hypot(near.x - direction.x, near.z - direction.z) < .001);
  }
  assert.throws(() => a.formationDirectionAt(NaN, 0), RangeError);
});

test('shared actual surfaces and camera guards include structures owned across a neighbouring seam', () => {
  let crossSeam = 0;
  const far = createOceanGenerator('seams');
  const surveys = [...allSamples, { generator: far, chunks: [far.chunk(-11, -29)] }];
  for (const { generator, chunks } of surveys) for (const chunk of chunks) for (const formation of formationsOf(chunk)) {
    const cos = Math.cos(formation.rotation), sin = Math.sin(formation.rotation);
    assert.ok(generator.heightForCamera(formation.x, formation.z) >= oceanRockHeight(formation, formation.x, formation.z));
    for (let index = 0; index < 32; index++) {
      const angle = index * Math.PI / 16, lx = Math.cos(angle) * .4 * formation.scale.x,
        lz = Math.sin(angle) * .4 * formation.scale.z;
      const x = formation.x + lx * cos + lz * sin, z = formation.z - lx * sin + lz * cos;
      const ownerX = Math.floor(x / OCEAN_CHUNK_SIZE), ownerZ = Math.floor(z / OCEAN_CHUNK_SIZE);
      const support = oceanRockHeight(formation, x, z);
      if ((ownerX !== chunk.cx || ownerZ !== chunk.cz) && support > generator.sample(x, z).floorY + .01) {
        crossSeam++;
        assert.ok(Math.abs(ownerX - chunk.cx) <= 1 && Math.abs(ownerZ - chunk.cz) <= 1);
        assert.ok(generator.heightForCamera(x, z) >= support);
      }
    }
  }
  assert.ok(crossSeam > 0, 'the actual sample includes exposed geometry crossing its centre-owned seam');
});

test('a fixed navigable string-seed route reaches a complete outer-slope group without a world boundary', () => {
  const generator = createOceanGenerator('42'), formations = formationsOf(generator.chunk(4, -2));
  assert.deepEqual(formations.map(formation => formation.id), ['formation:1,-1:0', 'formation:1,-1:1']);
  const endpoint = { x: 3 + 4 * 64, z: 5 - 2 * 64 };
  assert.ok(formations.every(formation => Math.hypot(formation.x - endpoint.x, formation.z - endpoint.z) < 40));
  assert.equal(generator.sample(endpoint.x, endpoint.z).habitat, 'slope');
  assert.equal(OCEAN_FORMATION_UNIT_SIZE, 192);
  assert.ok(Number.isFinite(generator.heightForCamera(1e7, -1e7)));
});
