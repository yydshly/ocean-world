import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { LIVING_SHALLOWS_ROUTE, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites,
  livingShallowsPropWorldVertex } from '../src/livingShallowsGeneration.js';
import { sceneElementMesh, sceneElementHeight } from '../src/oceanSceneElements.js';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { OCEAN_ROCK_PROFILES, LIVING_SHALLOWS_ROCK_PROFILES, oceanRockMesh, oceanRockSurface, oceanRockHeight } from '../src/oceanRockShape.js';

const create = seed => createOceanGenerator(livingShallowsSeed(seed));
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b}`);
const hardHeight = (world, x, z) => {
  let height = world.floorSurface(x, z).height;
  const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const rock of world.chunk(cx + dx, cz + dz).elements.filter(row => row.kind === 'rock')) {
    const support = oceanRockHeight(rock, x, z);
    if (support !== null) height = Math.max(height, support);
  }
  return height;
};

test('new profile dispatch is explicit and legacy terrain and profile registry remain unchanged', () => {
  const old = createOceanGenerator('42');
  const digest = createHash('sha256').update(JSON.stringify([[3, 3], [4, 3], [-2, -3]].map(([x, z]) => old.chunk(x, z)))).digest('hex');
  assert.equal(digest, '03ceb0326b1abfa19113e3237c94f1541853edbc823688446cf90d20ddc2984a');
  assert.equal(old.profile, undefined);
  assert.deepEqual(OCEAN_ROCK_PROFILES, ['mound', 'terrace', 'ridge']);
  for (const profile of OCEAN_ROCK_PROFILES) assert.equal(oceanRockMesh(profile).positions.length / 3, 97);
  const world = create('42');
  assert.equal(world.profile, 'living-shallows-v1');
  assert.strictEqual(world.rockProfiles, LIVING_SHALLOWS_ROCK_PROFILES);
  assert.equal(world.chunkSize, 64); assert.equal(world.surfaceY, 8);
});

test('ordinary starter route spans 300–500m and naturally crosses reef, sand, grass and slope', () => {
  for (const seed of ['42', 'documentary', 17]) {
    const world = create(seed);
    assert.strictEqual(world.routeStops, LIVING_SHALLOWS_ROUTE);
    assert.deepEqual(world.routeStops.map(stop => world.sample(stop.x, stop.z).habitat), ['reef', 'sand', 'seagrass', 'slope']);
    const distance = world.routeStops.slice(1).reduce((sum, stop, index) => sum + Math.hypot(stop.x - world.routeStops[index].x, stop.z - world.routeStops[index].z), 0);
    assert.ok(distance >= 300 && distance <= 500);
    assert.ok(world.routeStops.every(stop => Math.hypot(stop.x, stop.z) > 192 && stop.id && stop.label));
    const first = world.chunk(3, 3), meadow = world.chunk(7, 3);
    assert.ok(first.counts.rock >= 6 && first.counts.coral >= 8 && first.counts.algae >= 6, 'reef has actual attachment and grazing niches');
    assert.ok(first.elements.filter(row => row.kind === 'coral' && row.morphotype === 'branching').length >= 4);
    assert.ok(meadow.counts.seagrass >= 100, 'ordinary route contains a bed, not isolated tufts');
  }
});

test('continuous terrain and shared Float32 triangles have no positive or negative chunk seam', () => {
  const world = create('seams');
  for (const x of [-128, -64, 64, 256, 448, 576]) for (const z of [-74, 211, 240, 283]) {
    const left = world.sample(x - .001, z), right = world.sample(x + .001, z);
    assert.ok(Math.abs(left.floorY - right.floorY) < .001);
    assert.ok(Math.abs(left.rockiness - right.rockiness) < .001);
    near(world.floorVertex(x, z), Math.fround(world.sample(x, z).floorY), 0);
    near(world.floorSurface(x, z).height, world.floorVertex(x, z), 0);
  }
  for (const [x, z] of [[224.18, 230.27], [336.75, 225.71], [-65.37, -128.44]]) {
    const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
    const a = world.floorVertex(ix, iz), b = world.floorVertex(ix + 1, iz), c = world.floorVertex(ix, iz + 1), d = world.floorVertex(ix + 1, iz + 1);
    const expected = tx + tz <= 1 ? a * (1 - tx - tz) + b * tx + c * tz : d * (tx + tz - 1) + b * (1 - tz) + c * (1 - tx);
    near(world.floorSurface(x, z).height, expected);
    near(Math.hypot(...Object.values(world.floorSurface(x, z).normal)), 1);
  }
});

test('coordinate plans are seed-sensitive and independent of visiting and eviction order', () => {
  const first = create('42'), reordered = create('42');
  const coordinates = [[3, 3], [5, 3], [7, 3], [9, 4], [-2, -7], [14, 9]];
  const expected = coordinates.map(([x, z]) => first.chunk(x, z));
  for (const [x, z] of coordinates.toReversed()) reordered.chunk(x, z);
  for (let index = 0; index < 39; index++) reordered.chunk(20 + index, -20);
  coordinates.forEach(([x, z], index) => assert.deepEqual(reordered.chunk(x, z), expected[index]));
  assert.notDeepEqual(create(17).chunk(3, 3), expected[0]);
  assert.notDeepEqual(create(17).sample(192.1, 201.3), first.sample(192.1, 201.3));
  assert.ok(reordered.cacheStats().size <= 32);
  assert.ok(reordered.cacheStats().vertices <= reordered.cacheStats().maxVertices);
});

test('natural rocks share exact support triangles, irregular rims and varied unflattened summits', () => {
  for (const profile of LIVING_SHALLOWS_ROCK_PROFILES) {
    const mesh = oceanRockMesh(profile), { positions: p, indices } = mesh;
    assert.ok(Object.isFrozen(mesh) && Object.isFrozen(p) && Object.isFrozen(indices));
    assert.equal(mesh.rimSectors, 32);
    const rim = p.slice(-mesh.rimSectors * 3), radii = [];
    for (let index = 0; index < rim.length; index += 3) {
      assert.equal(rim[index + 1], 0); radii.push(Math.hypot(rim[index], rim[index + 2]));
    }
    assert.ok(Math.max(...radii) - Math.min(...radii) > .05, 'noncircular boundary');
    assert.ok(Math.max(...radii) <= .5);
    for (let index = 0; index < p.length; index += 3) for (let axis = 0; axis < 3; axis++) assert.equal(p[index + axis], Math.fround(p[index + axis]));
    for (let index = 0; index < indices.length; index += 3) {
      const [a, b, c] = indices.slice(index, index + 3).map(vertex => vertex * 3);
      const point = [0, 1, 2].map(axis => .21 * p[a + axis] + .37 * p[b + axis] + .42 * p[c + axis]);
      const surface = oceanRockSurface(profile, point[0], point[2]);
      assert.ok(surface, `${profile} face ${index / 3}`); near(surface.height, point[1]);
      assert.ok(surface.normal.y > 0);
    }
    for (let index = 0; index < p.length; index += 3) near(oceanRockSurface(profile, p[index], p[index + 2]).height, p[index + 1]);
    assert.equal(oceanRockSurface(profile, .51, 0), null);
    assert.equal(oceanRockSurface(profile, -.51, 0), null);
    const innerHeights = new Set(p.filter((_, index) => index % 3 === 1).slice(0, 32 * 5));
    assert.ok(innerHeights.size > 100, 'no common broad flat platform');
  }
});

test('every new colony, algae patch and grass root uses its actual local substrate and support', () => {
  const world = create('42'), ids = new Set(), kinds = new Set(), coralTypes = new Set();
  for (const [cx, cz] of [[3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [9, 4]]) {
    const chunk = world.chunk(cx, cz), rocks = new Map(chunk.elements.filter(row => row.kind === 'rock').map(rock => [rock.id, rock]));
    assert.equal(chunk.elements.length, Object.values(chunk.counts).reduce((sum, value) => sum + value, 0));
    for (const [kind, limit] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(chunk.counts[kind] <= limit);
    assert.equal(chunk.formationSummary.count, 0);
    for (const row of chunk.elements) {
      assert.ok(!ids.has(row.id)); ids.add(row.id); kinds.add(row.kind);
      assert.ok(Object.isFrozen(row) && Object.isFrozen(row.scale));
      assert.ok(Object.values(row.scale).every(value => Number.isFinite(value) && value > 0));
      assert.ok(row.x >= chunk.bounds.minX && row.x < chunk.bounds.maxX && row.z >= chunk.bounds.minZ && row.z < chunk.bounds.maxZ);
      if (row.kind === 'coral' || row.kind === 'algae') {
        const host = rocks.get(row.attachmentId); assert.ok(host);
        near(row.y, oceanRockHeight(host, row.x, row.z));
        near(row.y, hardHeight(world, row.x, row.z));
        assert.ok(row.y > world.floorSurface(row.x, row.z).height + .10);
        if (row.kind === 'coral') coralTypes.add(row.morphotype);
        else assert.ok(row.surfaceLocal && row.patchRadius > 0 && row.normal.y > 0);
      } else if (row.kind === 'seagrass') {
        assert.notEqual(world.sample(row.x, row.z).substrate, 'rock');
        near(row.y, world.floorSurface(row.x, row.z).height, 0);
        near(row.y, hardHeight(world, row.x, row.z));
        assert.ok(row.scale.y >= .45 && row.scale.y <= .9);
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['algae', 'bottle', 'coral', 'driftwood', 'rock', 'rubble', 'seagrass']);
  assert.deepEqual([...coralTypes].sort(), ['branching', 'fan', 'table']);
});

test('unbounded exploration remains finite and camera guards include actual cross-owner rocks', () => {
  const world = create('42');
  for (const [x, z] of [[-1, -65], [-1250, 2200], [1e7, -1e7], [-1e9, 1e9]]) {
    const state = world.sample(x, z);
    for (const key of ['floorY', 'depthM', 'rockiness', 'seagrassSuitability']) assert.ok(Number.isFinite(state[key]));
    assert.ok(Number.isFinite(world.heightForCamera(x, z)));
  }
  let crossSeam = false;
  for (const [cx, cz] of [[3, 3], [4, 3], [9, 4]]) for (const rock of world.chunk(cx, cz).elements.filter(row => row.kind === 'rock')) {
    const mesh = oceanRockMesh(rock.profile), c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const x = rock.x + mesh.positions[index] * rock.scale.x * c + mesh.positions[index + 2] * rock.scale.z * s;
      const z = rock.z - mesh.positions[index] * rock.scale.x * s + mesh.positions[index + 2] * rock.scale.z * c;
      if (Math.floor(x / 64) === cx && Math.floor(z / 64) === cz) continue;
      assert.ok(world.heightForCamera(x, z) >= oceanRockHeight(rock, x, z) - 1e-7); crossSeam = true; break;
    }
  }
  assert.ok(crossSeam);
  assert.ok(world.cacheStats().size <= 32);
  assert.throws(() => world.sample(Infinity, 0), RangeError);
  assert.throws(() => world.chunk(.5, 0), RangeError);
  assert.throws(() => world.coverAt(200, 200, { rockiness: NaN }), TypeError);
});

test('sparse grounded discoveries preserve ecological activity space and exact rigid contact without every-cell clutter', () => {
  const world = create('42'), keys = [], props = [];
  for (let cz = 2; cz <= 4; cz++) for (let cx = 3; cx <= 9; cx++) {
    const chunk = world.chunk(cx, cz), activity = livingShallowsSoftActivitySites(world.seed, cx, cz);
    const localProps = chunk.elements.filter(row => row.kind === 'driftwood' || row.kind === 'bottle');
    if (localProps.length) keys.push(chunk.id);
    for (const prop of localProps) {
      props.push(prop); const radius = Math.hypot(prop.scale.x, prop.scale.z) * .5;
      assert.ok(activity.every(point => Math.hypot(prop.x - point.x, prop.z - point.z) >= radius + 3.2));
      for (const other of chunk.elements.filter(row => row !== prop)) {
        const exclusion = other.kind === 'seagrass' ? 6.5 : Math.hypot(other.scale.x, other.scale.z) * .5 + .3;
        assert.ok(Math.hypot(prop.x - other.x, prop.z - other.z) >= radius + exclusion);
      }
      assert.notEqual(world.sample(prop.x, prop.z).substrate, 'rock');
      const positions = sceneElementMesh(prop.kind, prop.variant).positions;
      let contact = Infinity;
      for (let index = 0; index < positions.length; index += 3) {
        const point = livingShallowsPropWorldVertex(prop, positions, index);
        const clearance = prop.y + point.y - world.floorSurface(point.x, point.z).height;
        assert.ok(clearance >= -1e-10); contact = Math.min(contact, clearance);
        near(hardHeight(world, point.x, point.z), world.floorSurface(point.x, point.z).height);
      }
      assert.ok(contact <= 1e-10);
      if (prop.kind === 'bottle') {
        assert.equal(prop.physicalState, 'grounded-flooded'); assert.equal(prop.flooded, true); assert.equal(prop.sealed, false);
        assert.ok(prop.scale.x >= .25 && prop.scale.x <= .35);
      } else { assert.equal(prop.physicalState, 'grounded'); assert.ok(prop.scale.x >= 1 && prop.scale.x <= 2); }
    }
  }
  assert.ok(keys.length < 21 / 2, 'most sampled chunks contain no artificial discovery');
  assert.deepEqual(world.chunk(5, 3).elements.filter(row => row.kind === 'bottle' || row.kind === 'driftwood').map(row => row.kind).sort(), ['bottle', 'driftwood']);
  assert.ok(props.length >= 2);
  const reloaded = create('42');
  for (const [cx, cz] of [[7, 4], [3, 2], [5, 3]]) reloaded.chunk(cx, cz);
  assert.deepEqual(reloaded.chunk(5, 3), world.chunk(5, 3));
});

test('discovery exclusion reserves the actual ecological random candidate sites', () => {
  const world = create('42'), ecology = new OceanEcology(world.seed, world, { store: { available: false } });
  for (const [cx, cz] of [[5, 3], [-4, 7]]) {
    const rows = livingShallowsSoftActivitySites(world.seed, cx, cz);
    for (let index = 0; index < 64; index++) {
      const ix = index % 8, iz = Math.floor(index / 8), id = `soft:${ix},${iz}`;
      const region = { id: `${cx},${cz}` };
      assert.equal(rows[index].x, cx * 64 + (ix + .2 + ecology._random(region, `${id}:x`) * .6) * 8);
      assert.equal(rows[index].z, cz * 64 + (iz + .2 + ecology._random(region, `${id}:z`) * .6) * 8);
    }
  }
});

test('prop render triangles, camera height and actual regional/exported support agree at finite body probes', () => {
  const world = create('42'), ecology = new OceanEcology(world.seed, world, { store: { available: false } });
  const props = world.chunk(5, 3).elements.filter(row => row.kind === 'bottle' || row.kind === 'driftwood');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), ray = new THREE.Raycaster();
  try {
    for (const prop of props) {
      const data = sceneElementMesh(prop.kind, 0), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(prop.x, prop.y, prop.z);
      mesh.scale.set(prop.scale.x, prop.scale.y, prop.scale.z); mesh.rotation.y = prop.rotation; mesh.updateMatrixWorld(true);
      try {
        for (const [lx, lz] of [[0, 0], [-.2, 0], [.1, .1]]) {
          const c = Math.cos(prop.rotation), s = Math.sin(prop.rotation), x = prop.x + lx * prop.scale.x * c + lz * prop.scale.z * s,
            z = prop.z - lx * prop.scale.x * s + lz * prop.scale.z * c;
          const actual = sceneElementHeight(prop, x, z); assert.ok(actual !== null);
          ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit);
          near(hit.point.y, actual, 1e-8); near(world.heightForCamera(x, z), actual);
          near(oceanSupportHeight(world, x, z), actual); near(ecology._surface(x, z), actual); near(ecology._surface(x, z, true), actual);
        }
      } finally { geometry.dispose(); }
    }
  } finally { material.dispose(); }
  assert.ok(props.length === 2);
});
