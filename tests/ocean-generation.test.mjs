import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanGenerator, OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS, OCEAN_ELEMENT_LIMITS,
  OCEAN_CHUNK_CACHE_LIMIT } from '../src/oceanGeneration.js';
import { floorHeight, habitatHeight } from '../src/habitat.js';
import { oceanRockSurface, oceanRockHeight, OCEAN_ROCK_PROFILES, OCEAN_ROCK_SURFACE_VERSION } from '../src/oceanRockShape.js';

test('same seed reproduces chunk identity and terrain independently of visitation order', () => {
  const first = createOceanGenerator(42), reordered = createOceanGenerator(42);
  const coordinates = [[0, 0], [2, -3], [-4, 1], [18, 9]];
  const expected = coordinates.map(([cx, cz]) => first.chunk(cx, cz));
  for (const [cx, cz] of coordinates.toReversed()) reordered.chunk(cx, cz);
  coordinates.forEach(([cx, cz], index) => assert.deepEqual(reordered.chunk(cx, cz), expected[index]));
  for (const [x, z] of [[160.4, -91.2], [-201.8, 17.3], [899, 425]]) {
    assert.deepEqual(first.sample(x, z), reordered.sample(x, z));
  }
  assert.notDeepEqual(createOceanGenerator(7).chunk(2, -3), expected[1]);
  assert.notDeepEqual(createOceanGenerator(7).sample(160.4, -91.2), first.sample(160.4, -91.2));
});

test('authored reef floor and camera protection survive inside the complete 40 metre circle', () => {
  const world = createOceanGenerator(91);
  for (let radius = 0; radius <= OCEAN_AUTHORED_RADIUS; radius += 4) {
    for (let angle = 0; angle < Math.PI * 2; angle += .37) {
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      assert.equal(world.sample(x, z).floorY, floorHeight(x, z));
      assert.ok(world.heightForCamera(x, z) >= habitatHeight(x, z) - 1e-12);
    }
  }
  for (let cz = -1; cz <= 0; cz++) for (let cx = -1; cx <= 0; cx++) {
    for (const element of world.chunk(cx, cz).elements) {
      assert.ok(Math.hypot(element.x, element.z) - .5 * Math.hypot(element.scale.x, element.scale.z) >= OCEAN_AUTHORED_RADIUS);
    }
  }
});

test('shared-coordinate terrain joins across positive and negative chunk seams without cliffs', () => {
  const west = createOceanGenerator('seams'), east = createOceanGenerator('seams');
  for (const cx of [-7, -1, 0, 4, 17]) {
    const a = west.chunk(cx, -2), b = east.chunk(cx + 1, -2);
    assert.equal(a.bounds.maxX, b.bounds.minX);
    for (let step = 0; step <= 32; step++) {
      const zA = a.origin.z + step * a.size / 32, zB = b.origin.z + step * b.size / 32;
      assert.equal(west.sample(a.bounds.maxX, zA).floorY, east.sample(b.bounds.minX, zB).floorY);
      const left = west.sample(a.bounds.maxX - .001, zA).floorY;
      const right = east.sample(b.bounds.minX + .001, zB).floorY;
      assert.ok(Math.abs(left - right) < .002, `seam at ${a.bounds.maxX},${zA}`);
    }
  }
  const edge = OCEAN_AUTHORED_RADIUS;
  assert.ok(Math.abs(west.sample(edge - .001, 0).floorY - west.sample(edge + .001, 0).floorY) < .002);
});

test('negative and far coordinates remain finite without an artificial world boundary', () => {
  const world = createOceanGenerator(123);
  for (const [x, z] of [[-1, -65], [-1250, 2200], [1e7, -1e7], [-1e9, 1e9]]) {
    const sample = world.sample(x, z);
    for (const key of ['floorY', 'depthM', 'rockiness', 'seagrassSuitability']) assert.ok(Number.isFinite(sample[key]));
    if (Math.hypot(x, z) >= 96) assert.ok(sample.floorY >= -22 && sample.floorY <= -2);
    const chunk = world.chunk(Math.floor(x / OCEAN_CHUNK_SIZE), Math.floor(z / OCEAN_CHUNK_SIZE));
    assert.ok(x >= chunk.bounds.minX && x < chunk.bounds.maxX);
    assert.ok(z >= chunk.bounds.minZ && z < chunk.bounds.maxZ);
    assert.ok(Number.isFinite(world.heightForCamera(x, z)));
  }
  assert.throws(() => world.sample(Infinity, 0), RangeError);
  assert.throws(() => world.chunk(.5, 0), RangeError);
});

test('generated elements are bounded and habitat-linked; camera guards include cross-seam footprints', () => {
  const world = createOceanGenerator(42), kinds = new Set();
  let checkedCrossSeam = false;
  for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
    const chunk = world.chunk(cx, cz);
    for (const [kind, maximum] of Object.entries(OCEAN_ELEMENT_LIMITS)) assert.ok(chunk.counts[kind] <= maximum);
    assert.equal(chunk.elements.length, Object.values(chunk.counts).reduce((sum, count) => sum + count, 0));
    for (const element of chunk.elements) {
      kinds.add(element.kind);
      assert.ok(Object.isFrozen(element) && Object.isFrozen(element.scale));
      assert.ok(Object.values(element.scale).every(value => Number.isFinite(value) && value > 0));
      assert.ok(world.heightForCamera(element.x, element.z) >= element.y + element.scale.y);
      if (element.kind === 'coral') {
        const attachment = chunk.elements.find(candidate => candidate.id === element.attachmentId);
        assert.equal(attachment?.kind, 'rock');
        assert.ok(world.sample(attachment.x, attachment.z).depthM <= 22);
      } else if (element.kind === 'seagrass') {
        assert.ok(world.sample(element.x, element.z).substrate !== 'rock');
        assert.ok(world.sample(element.x, element.z).depthM < 23);
      } else if (element.kind === 'rubble') {
        assert.equal(element.y, world.floorSurface(element.x, element.z).height);
        assert.notEqual(world.sample(element.x, element.z).substrate, 'rock');
        assert.ok(element.scale.x <= .6 && element.scale.z <= .6 && element.scale.y <= .12);
      } else if (element.kind === 'algae') {
        const attachment = chunk.elements.find(candidate => candidate.id === element.attachmentId);
        assert.equal(attachment?.kind, 'rock');
        assert.ok(world.sample(attachment.x, attachment.z).depthM <= 22);
        assert.ok(element.scale.y <= .025);
      } else if (element.kind === 'formation') {
        assert.ok(element.scale.x >= 12 && element.scale.x <= 30 && element.scale.z >= 4 && element.scale.z <= 9);
        assert.ok(element.scale.y >= 1 && element.scale.y <= 3);
      } else {
        assert.ok(element.scale.x <= 10 && element.scale.z <= 10 && element.scale.y <= 3.4);
        if (element.x + element.scale.x * .5 > chunk.bounds.maxX && Math.abs(element.rotation) < .6) {
          const x = chunk.bounds.maxX + .01, z = element.z;
          const dx = x - element.x, dz = z - element.z, c = Math.cos(element.rotation), s = Math.sin(element.rotation);
          if (((dx * c - dz * s) / (element.scale.x * .5)) ** 2 +
            ((dx * s + dz * c) / (element.scale.z * .5)) ** 2 <= 1) {
            assert.ok(world.heightForCamera(x, z) >= element.y + element.scale.y);
            checkedCrossSeam = true;
          }
        }
      }
    }
  }
  // This original bounded seed survey still contains all five prior kinds;
  // additional outer-slope structures are verified in their dedicated suite.
  assert.deepEqual([...kinds].filter(kind => kind !== 'formation').sort(), ['algae', 'coral', 'rock', 'rubble', 'seagrass']);
  assert.ok(checkedCrossSeam, 'the tested region includes a rock that crosses a chunk boundary');
});

test('physics corrections preserve the recorded hard layout, profiles and seed identities', () => {
  const coordinates = [[0, 0], [2, -3], [-4, 1], [18, 9], [-1, -1], [100, -99]];
  // This hard-layout projection was captured before the physics correction.
  // Invalid scenery grass is deliberately removed; roots and sediment rubble
  // follow actual triangles. Neither change licenses moving hard habitat.
  const records = [42, '42', 91, 'seams'].flatMap(seed => {
    const world = createOceanGenerator(seed);
    return coordinates.map(([cx, cz]) => {
        const chunk = world.chunk(cx, cz), elements = chunk.elements.filter(element => ['rock', 'coral'].includes(element.kind)).map(element => {
          const record = { ...element };
          delete record.profile;
          if (record.kind === 'coral') delete record.y;
          return record;
        });
        return { seed, cx, cz, elements };
      });
  });
  assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    '52c2619c9e090d7ad23f2ab1c672eb6c44c3d5a3f179ade012575e510d5b166e');
  let reanchored = 0;
  for (const [cx, cz] of coordinates) {
    const chunk = createOceanGenerator('42').chunk(cx, cz);
    for (const coral of chunk.elements.filter(element => element.kind === 'coral')) {
      const rock = chunk.elements.find(element => element.id === coral.attachmentId);
      assert.equal(coral.y, oceanRockHeight(rock, coral.x, coral.z));
      const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation), wx = coral.x - rock.x, wz = coral.z - rock.z;
      const radius = ((wx * c - wz * s) / (rock.scale.x * .5)) ** 2 + ((wx * s + wz * c) / (rock.scale.z * .5)) ** 2;
      const oldY = rock.y + rock.scale.y * Math.sqrt(1 - radius);
      if (Math.abs(oldY - coral.y) > 1e-8) reanchored++;
    }
  }
  assert.ok(reanchored > 20, 'Y changes are acknowledged and verified against the real new support');
});

test('algae patches sit on the actual shared rock mesh with correct transformed normals and avoid coral bases', () => {
  const world = createOceanGenerator('42');
  let checked = 0;
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
    const chunk = world.chunk(cx, cz);
    for (const algae of chunk.elements.filter(element => element.kind === 'algae')) {
      const rock = chunk.elements.find(element => element.id === algae.attachmentId);
      const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
      const wx = algae.x - rock.x, wz = algae.z - rock.z;
      const lx = wx * c - wz * s, lz = wx * s + wz * c;
      const surface = oceanRockSurface(rock.profile, lx / rock.scale.x, lz / rock.scale.z);
      const expectedY = rock.y + rock.scale.y * surface.height;
      assert.ok(Math.abs(algae.y - expectedY) < 1e-10);
      assert.ok(Object.isFrozen(algae.normal) && Object.isFrozen(algae.surfaceDirection) && Object.isFrozen(algae.surfaceLocal));
      assert.ok(Math.abs(lx / rock.scale.x - algae.surfaceLocal.x) < 1e-12);
      assert.ok(Math.abs(lz / rock.scale.z - algae.surfaceLocal.z) < 1e-12);
      assert.equal(algae.patchRadius, Math.sin(algae.surfaceRadius) * .5);
      const direction = algae.surfaceDirection;
      assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
      assert.ok([.12, .18, .24].includes(algae.surfaceRadius));
      const nx = surface.normal.x / rock.scale.x, ny = surface.normal.y / rock.scale.y, nz = surface.normal.z / rock.scale.z;
      const length = Math.hypot(nx, ny, nz);
      assert.ok(Math.abs(algae.normal.x - (nx * c + nz * s) / length) < 1e-12);
      assert.ok(Math.abs(algae.normal.y - ny / length) < 1e-12);
      assert.ok(Math.abs(algae.normal.z - (-nx * s + nz * c) / length) < 1e-12);
      const projectionRadius = Math.max(rock.scale.x, rock.scale.z) * Math.sin(algae.surfaceRadius / 2);
      for (const coral of chunk.elements.filter(element => element.kind === 'coral' && element.attachmentId === rock.id)) {
        assert.ok(Math.hypot(algae.x - coral.x, algae.z - coral.z) >=
          Math.max(coral.scale.x, coral.scale.z) * .5 + projectionRadius + .08);
      }
      for (const other of chunk.elements.filter(element => element.kind === 'algae' && element.attachmentId === rock.id && element.id !== algae.id)) {
        const b = other.surfaceDirection;
        assert.ok(Math.acos(Math.min(1, direction.x * b.x + direction.y * b.y + direction.z * b.z)) >=
          algae.surfaceRadius + other.surfaceRadius + .02);
      }
      checked++;
    }
  }
  assert.ok(checked > 100, 'multiple habitats and rock orientations have attached surface cover');
});

test('physics corrections preserve recorded nonplant scenery dimensions, order and styles', () => {
  const coordinates = [[0, 0], [2, -3], [-4, 1], [18, 9], [-1, -1], [100, -99]];
  // Captured before physics edits, excluding the explicitly corrected grass
  // and sediment contact Y, with old coral/algae support metadata projected.
  const records = [42, '42', 91, 'seams'].flatMap(seed => {
    const world = createOceanGenerator(seed);
    return coordinates.map(([cx, cz]) => {
      const chunk = world.chunk(cx, cz);
      return { seed, cx, cz, elements: chunk.elements.filter(element => !['formation', 'seagrass'].includes(element.kind)).map(element => {
        const record = { ...element };
        delete record.profile;
        if (['coral', 'algae', 'rubble'].includes(record.kind)) delete record.y;
        if (record.kind === 'algae') {
          delete record.normal; delete record.surfaceLocal; delete record.patchRadius;
        }
        return record;
      }) };
    });
  });
  assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    '613e8d4174ee1b98530f9164e27ca9486eabd28f9db9df70ec48183ce68e1730');
});

test('chunk macro summaries describe fixed existing habitat samples and spatially coherent diverse rock profiles', () => {
  const world = createOceanGenerator('42'), profileCounts = { mound: 0, terrace: 0, ridge: 0 };
  let mixed = 0, related = 0, closePairs = 0;
  for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
    const chunk = world.chunk(cx, cz), composition = chunk.habitatComposition;
    assert.equal(chunk.surfaceVersion, OCEAN_ROCK_SURFACE_VERSION);
    assert.ok(Object.isFrozen(chunk.landform) && Object.isFrozen(composition) && Object.isFrozen(composition.habitats));
    assert.equal(composition.samples, 64);
    assert.equal(Object.values(composition.habitats).reduce((sum, count) => sum + count, 0), 64);
    const expected = { reef: 0, seagrass: 0, sand: 0, slope: 0, 'authored-reef': 0 }, depths = [];
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const sample = world.sample(chunk.origin.x + (ix + .5) * 8, chunk.origin.z + (iz + .5) * 8);
      expected[sample.habitat]++; depths.push(sample.depthM);
    }
    assert.deepEqual(composition.habitats, expected);
    assert.equal(composition.minDepthM, Math.min(...depths)); assert.equal(composition.maxDepthM, Math.max(...depths));
    const ranked = Object.keys(expected).sort((a, b) => expected[b] - expected[a]);
    assert.equal(composition.primary, ranked[0]);
    assert.equal(composition.secondary, expected[ranked[1]] >= 64 * .2 ? ranked[1] : null);
    if (composition.secondary) mixed++;
    const rocks = chunk.elements.filter(element => element.kind === 'rock');
    assert.equal(Object.values(chunk.landform).reduce((sum, count) => sum + count, 0), chunk.counts.rock);
    for (const profile of OCEAN_ROCK_PROFILES) {
      assert.equal(chunk.landform[profile], rocks.filter(rock => rock.profile === profile).length);
      profileCounts[profile] += chunk.landform[profile];
    }
    for (let a = 0; a < rocks.length; a++) for (let b = a + 1; b < rocks.length; b++) {
      if (Math.hypot(rocks[a].x - rocks[b].x, rocks[a].z - rocks[b].z) < 15) {
        closePairs++; if (rocks[a].profile === rocks[b].profile) related++;
      }
    }
  }
  assert.ok(Object.values(profileCounts).every(count => count > 40), 'all broad forms appear without isolated per-rock dice rolls');
  assert.ok(mixed > 10, 'transitional cells carry a meaningful secondary habitat');
  assert.ok(related / closePairs > .8, 'nearby outcrops mostly share their broad geology field');
});

test('additional grass forms dense coherent beds while sand and reef keep lower cover density', () => {
  const world = createOceanGenerator('42'), groups = {};
  for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
    const chunk = world.chunk(cx, cz), habitat = world.sample((cx + .5) * 64, (cz + .5) * 64).habitat;
    const group = groups[habitat] ||= { chunks: 0, grass: 0 };
    group.chunks++; group.grass += chunk.counts.seagrass;
  }
  const density = habitat => groups[habitat].grass / groups[habitat].chunks;
  assert.ok(density('seagrass') > density('sand') * 3);
  assert.ok(density('seagrass') > density('reef') * 5);
  assert.equal(density('slope'), 0, 'the sampled deep slope remains outside grass suitability');
  const bed = world.chunk(-5, -5);
  assert.equal(bed.counts.seagrass, OCEAN_ELEMENT_LIMITS.seagrass);
  const extra = bed.elements.filter(element => element.id.includes(':bed-'));
  assert.ok(extra.length >= 160);
  const neighbours = extra.filter(a => extra.some(b => a.id !== b.id && Math.hypot(a.x - b.x, a.z - b.z) < 1.8));
  assert.ok(neighbours.length / extra.length > .75, 'most added tufts have nearby bed neighbours');
  assert.ok(bed.elements.filter(element => element.kind === 'seagrass' && !element.id.includes(':bed-')).length === 96,
    'the original grass remains present rather than being moved into new beds');
});

test('new bottom cover stays within owner bounds, out of authored reef and away from neighbouring rock footprints', () => {
  const world = createOceanGenerator('cover-support');
  let checked = 0;
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
    const chunk = world.chunk(cx, cz), rocks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      rocks.push(...world.chunk(cx + dx, cz + dz).elements.filter(element => element.kind === 'rock'));
    }
    for (const element of chunk.elements.filter(element => element.kind === 'rubble' || element.id.includes(':bed-'))) {
      const padding = Math.max(element.scale.x, element.scale.z) * .5;
      assert.ok(element.x - padding >= chunk.bounds.minX && element.x + padding < chunk.bounds.maxX);
      assert.ok(element.z - padding >= chunk.bounds.minZ && element.z + padding < chunk.bounds.maxZ);
      assert.ok(Math.hypot(element.x, element.z) - .5 * Math.hypot(element.scale.x, element.scale.z) >= OCEAN_AUTHORED_RADIUS);
      assert.equal(element.y, world.floorSurface(element.x, element.z).height);
      if (element.kind === 'seagrass') assert.ok(world.sample(element.x, element.z).seagrassSuitability > .36);
      for (const rock of rocks) {
        const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
        const wx = element.x - rock.x, wz = element.z - rock.z;
        assert.ok(((wx * c - wz * s) / (rock.scale.x * .5 + padding)) ** 2 +
          ((wx * s + wz * c) / (rock.scale.z * .5 + padding)) ** 2 > 1,
        `cover ${element.id} must not grow through neighbour ${rock.id}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 500);
});

test('streaming cache stays bounded and eviction does not change revisited scenery', () => {
  const world = createOceanGenerator('cache');
  const original = world.chunk(-2, 3);
  for (let index = 0; index < OCEAN_CHUNK_CACHE_LIMIT * 3; index++) world.chunk(index, index + 1);
  assert.equal(world.cacheStats().size, OCEAN_CHUNK_CACHE_LIMIT);
  assert.deepEqual(world.chunk(-2, 3), original);
  assert.notEqual(world.chunk(-2, 3), original, 'eviction should recreate data, not retain every visited chunk');
});
