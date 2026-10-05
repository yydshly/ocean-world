import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createDeepOceanGenerator, DEEP_OCEAN_ELEMENT_LIMITS, DEEP_OCEAN_CACHE_LIMIT,
  DEEP_OCEAN_SURFACE_Y, DEEP_OCEAN_VERTEX_CACHE_LIMIT, DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT,
  deepOceanRockMesh } from '../src/deepOceanGeneration.js';
import { DEEP_ANEMONE_ANCHORS, deepFloorHeight } from '../src/deepHabitat.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

test('the forty metre authored floor survives and generated footprints stay outside it', () => {
  for (const seed of [42, '42', 'deep-other']) {
    const world = createDeepOceanGenerator(seed);
    for (let x = -40; x <= 40; x += 4) for (let z = -40; z <= 40; z += 4) {
      if (Math.hypot(x, z) > 40) continue;
      assert.equal(world.sample(x, z).floorY, deepFloorHeight(x, z));
      assert.equal(world.heightAt(x, z), Math.fround(deepFloorHeight(x, z)));
      assert.equal(world.heightForCamera(x, z), world.heightAt(x, z));
    }
    assert.equal(world.authoredAnchors, DEEP_ANEMONE_ANCHORS);
    for (const anchor of world.authoredAnchors) {
      assert.equal(world.sample(anchor.x, anchor.z).floorY, anchor.y);
      assert.ok(Math.abs(world.heightAt(anchor.x, anchor.z) - anchor.y) < .002, 'one metre ground triangles preserve the original soft relief');
    }
    for (let cx = -1; cx <= 0; cx++) for (let cz = -1; cz <= 0; cz++) {
      for (const element of world.chunk(cx, cz).elements) {
        assert.ok(Math.hypot(element.x, element.z) - .5 * Math.hypot(element.scale.x, element.scale.z) > 40);
      }
    }
  }
});

test('typed coordinate seeds reproduce terrain and immutable scenery independently of visiting order and eviction', () => {
  const first = createDeepOceanGenerator('42'), reverse = createDeepOceanGenerator('42');
  const coordinates = [[1, -1], [-1, -10], [8, 2], [-5, 4], [18, -9]];
  const expected = coordinates.map(pair => first.chunk(...pair));
  for (const pair of [...coordinates].reverse()) reverse.chunk(...pair);
  for (let index = 0; index < coordinates.length; index++) assert.deepEqual(reverse.chunk(...coordinates[index]), expected[index]);
  for (let index = 0; index < 80; index++) reverse.chunk(100 + index, -100 - index);
  assert.equal(reverse.cacheStats().chunks, DEEP_OCEAN_CACHE_LIMIT);
  for (let index = 0; index < coordinates.length; index++) assert.deepEqual(reverse.chunk(...coordinates[index]), expected[index]);
  assert.notDeepEqual(createDeepOceanGenerator(42).chunk(-1, -10), expected[1]);
  assert.notDeepEqual(createDeepOceanGenerator('another').sample(210, -310), first.sample(210, -310));
  assert.ok(Object.isFrozen(expected[1]) && Object.isFrozen(expected[1].elements));
  assert.throws(() => expected[1].elements.push({}));
  reverse.clearCache(); assert.equal(reverse.cacheStats().chunks, 0);
});

test('floor, retention and hard-site fields join without a chunk rim or an authored transition cliff', () => {
  const world = createDeepOceanGenerator('42');
  for (const x of [-192, -96, -64, -40, 40, 64, 96, 128, 640]) for (const z of [-91, 0, 37, 111]) {
    const left = world.sample(x - 1e-5, z), right = world.sample(x + 1e-5, z);
    for (const field of ['floorY', 'rockiness', 'organicPatchSuitability']) assert.ok(Math.abs(left[field] - right[field]) < 1e-4);
    assert.ok(Math.abs(world.heightAt(x - 1e-5, z) - world.heightAt(x + 1e-5, z)) < 1e-4);
  }
  assert.equal(world.chunk(-1, -1).bounds.maxX, world.chunk(0, -1).bounds.minX);
  assert.equal(world.chunk(0, -1).bounds.maxZ, world.chunk(0, 0).bounds.minZ);
});

test('deep reference depth is independent of local relief and chunks remain mostly open sediment scenery', () => {
  const world = createDeepOceanGenerator('42');
  assert.equal(DEEP_OCEAN_SURFACE_Y, 3500); assert.equal(world.surfaceY, 3500);
  const soft = world.chunk(4, -1), hard = world.chunk(-1, -10), slope = world.chunk(0, 0);
  assert.equal(soft.composition.primary, 'deep-soft-bottom');
  assert.equal(hard.composition.primary, 'deep-hard-bottom');
  assert.equal(slope.composition.primary, 'deep-slope');
  assert.ok(hard.counts.rock > soft.counts.rock);
  for (const chunk of [soft, hard, slope, world.chunk(-5, 4)]) {
    assert.equal(Object.values(chunk.composition.habitats).reduce((sum, count) => sum + count, 0), 64);
    assert.equal(chunk.composition.samples, 64); assert.equal(chunk.habitatComposition, chunk.composition);
    assert.ok(chunk.composition.minDepthM > 3490 && chunk.composition.maxDepthM < 3510);
    assert.equal(chunk.agents, undefined); assert.equal(chunk.resources, undefined);
    assert.ok(chunk.counts.rock <= DEEP_OCEAN_ELEMENT_LIMITS.rock && chunk.counts.rubble <= DEEP_OCEAN_ELEMENT_LIMITS.rubble);
    let footprintArea = 0;
    for (const element of chunk.elements) {
      assert.ok(['rock', 'rubble'].includes(element.kind));
      assert.ok(Object.isFrozen(element.scale));
      assert.equal(Math.floor(element.x / 64), chunk.cx); assert.equal(Math.floor(element.z / 64), chunk.cz);
      assert.ok(element.scale.x <= 2.6 && element.scale.z <= 2.6 && element.scale.y <= .72);
      footprintArea += Math.PI * element.scale.x * element.scale.z / 4;
    }
    assert.ok(footprintArea < 64 * 64 * .02, 'even hard-site scenery leaves more than 98% of the planar patch open');
  }
  for (const [x, z] of [[260, -40], [-60, -620]]) {
    const sample = world.sample(x, z);
    assert.equal(sample.depthM, 3500 - sample.floorY);
    assert.ok(sample.organicPatchSuitability >= 0 && sample.organicPatchSuitability <= 1);
    assert.equal(sample.foodPatchiness, sample.organicPatchSuitability);
  }
});

test('support heights and normals agree with actual shared rock triangles under unequal scales and rotations', () => {
  const world = createDeepOceanGenerator('42'), ray = new THREE.Raycaster(); let checked = 0;
  for (const rock of world.chunk(-1, -10).elements) {
    const data = deepOceanRockMesh(rock.profile), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(rock.x, rock.y, rock.z); mesh.rotation.y = rock.rotation;
    mesh.scale.set(rock.scale.x, rock.scale.y, rock.scale.z); mesh.updateMatrixWorld(true);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (const [dx, dz] of [[.041, .016], [.119, .093], [-.15, .114], [.267, -.064]]) {
      const point = new THREE.Vector3(dx, 0, dz).applyMatrix4(mesh.matrixWorld);
      ray.set(new THREE.Vector3(point.x, 20, point.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit);
      const bed = world.floorSurface(point.x, point.z), support = world.supportAt(point.x, point.z);
      assert.ok(Math.abs(support.height - Math.max(bed.height, hit.point.y)) < 1e-8);
      assert.ok(world.heightForCamera(point.x, point.z) >= support.height - 1e-8);
      if (hit.point.y > bed.height) {
        const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        assert.ok(normal.distanceTo(new THREE.Vector3(support.normal.x, support.normal.y, support.normal.z)) < 1e-7);
        assert.equal(support.elementId, rock.id); assert.equal(support.substrate, 'rock'); checked++;
      }
    }
    geometry.dispose(); material.dispose();
  }
  assert.ok(checked >= 40);
});

test('far and negative exploration stays finite with a bounded cache; missing rock intersections never become zero support', () => {
  const world = createDeepOceanGenerator('42');
  for (const [x, z] of [[-1, -65], [1000259, -1000123], [-1000259, 1000123], [1e9 + 19.7, -1e9 + 7.4]]) {
    const state = world.sample(x, z), support = world.supportAt(x, z), normal = world.floorNormal(x, z);
    assert.ok(Number.isFinite(state.floorY) && Number.isFinite(state.depthM) && Number.isFinite(support.height));
    assert.ok(Object.values(normal).every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-12);
    assert.ok(world.heightForCamera(x, z) >= support.height - 1e-12);
    assert.ok(world.cacheStats().chunks <= 32);
  }
  const rock = world.chunk(-1, -10).elements.find(element => element.kind === 'rock');
  const x = rock.x + rock.scale.x, z = rock.z + rock.scale.z;
  assert.equal(oceanRockHeight(rock, x, z), null);
  assert.equal(world.heightAt(x, z), world.floorSurface(x, z).height);
  assert.throws(() => world.sample(NaN, 0)); assert.throws(() => world.heightAt(0, Infinity));
  assert.throws(() => world.chunk(.5, 0)); assert.throws(() => createDeepOceanGenerator({}));
});

test('bounded support caches preserve all pre-cache sample and actual-triangle query fields before and after eviction', () => {
  const world = createDeepOceanGenerator('42');
  // Captured from the uncached generator before this performance-only change.
  // Includes exact samples, Float32 floor triangles, rock faces and normals,
  // negative/remote coordinates, and both safe/actual height query results.
  const expected = 'ba156cd3c0c7497f45fe227d564332a27a4d0b6771c89c3bdb05f9f1f41f89d8';
  function fingerprint() {
    const points = [[0, 0], [3.271, -1.164], [40, 0], [40.1, .037], [96, .157], [131.22, 5.99],
      [-95.471, -672.371], [-1234.827, 2601.164], [1000259.143, -1000123.271], [-1000259.827, 1000123.164],
      [1e9 + 19.7, -1e9 + 7.4]];
    const chunks = [[0, 0], [-1, -10], [4, -1], [15625, -15627]].map(pair => world.chunk(...pair));
    for (const chunk of chunks) for (const element of chunk.elements) {
      points.push([element.x, element.z], [element.x + .071, element.z - .037]);
    }
    const records = points.map(([x, z]) => ({ x, z, sample: world.sample(x, z), floor: world.floorSurface(x, z),
      support: world.supportAt(x, z), normal: world.floorNormal(x, z), heightAt: world.heightAt(x, z), camera: world.heightForCamera(x, z) }));
    assert.equal(points.length, 77);
    return createHash('sha256').update(JSON.stringify({ chunks, records })).digest('hex');
  }
  assert.equal(fingerprint(), expected); assert.equal(fingerprint(), expected, 'cache-hit output is exact');
  for (let index = 0; index < DEEP_OCEAN_VERTEX_CACHE_LIMIT + 256; index++) world.floorVertex(-9000 + index, -8157);
  assert.equal(world.cacheStats().vertices, DEEP_OCEAN_VERTEX_CACHE_LIMIT);
  for (let index = 0; index < DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT + 8; index++) world.heightAt((100 + index) * 64 + .137, -(40 + index) * 64 + .271);
  assert.equal(world.cacheStats().neighborhoods, DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT);
  assert.ok(world.cacheStats().vertices <= DEEP_OCEAN_VERTEX_CACHE_LIMIT);
  assert.ok(world.cacheStats().chunks <= DEEP_OCEAN_CACHE_LIMIT);
  assert.equal(fingerprint(), expected, 'recomputed query fields remain exact after FIFO eviction');
  world.clearCache();
  const cleared = world.cacheStats(); assert.equal(cleared.chunks, 0); assert.equal(cleared.vertices, 0); assert.equal(cleared.neighborhoods, 0);
  assert.equal(fingerprint(), expected, 'clearCache does not alter the scene or support surface');
});
