import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createKelpOceanGenerator, KELP_OCEAN_ELEMENT_LIMITS, kelpOceanRockMesh } from '../src/kelpOceanGeneration.js';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanRockFootingMesh } from '../src/world/oceanRockFooting.js';
import { KELP_ANCHORS } from '../src/kelpHabitat.js';

const SEEDS = [42, '42', 'other'];
const CELLS = [[1, -1], [4, -1], [10, 5], [-8, -8], [8, 2], [-5, 4]];
const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} vs ${b}`);
const rawOriginal = readFileSync(new URL('../output/validation/kelp-macro-landscape-generation-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(rawOriginal).digest('hex'),
  '3a1c041aa18c83dafa0f454a318e3937648960c5dc942b07a74bc1b84bb09c28', 'the independent original landscape must stay frozen');
const originalSource = rawOriginal.replace(/from (['"])([^'"]+)\1/g, (_all, _quote, dependency) =>
  `from ${JSON.stringify(new URL(dependency, new URL('../src/kelpOceanGeneration.js', import.meta.url)).href)}`);
const { createKelpOceanGenerator: originalGenerator } = await import(`data:text/javascript;base64,${Buffer.from(originalSource).toString('base64')}`);
function nonGeometric(element) {
  const copy = structuredClone(element); delete copy.y; delete copy.lengthM;
  if (copy.anchor) { delete copy.anchor.y; delete copy.anchor.lengthM; }
  return copy;
}
function makeSolid(element) {
  const data = kelpOceanRockMesh(element.profile), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(element.x, element.y, element.z); mesh.rotation.y = element.rotation;
  mesh.scale.set(element.scale.x, element.scale.y, element.scale.z); mesh.updateMatrixWorld(true);
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}
function boundedFormations(generator) {
  const elements = [];
  // A fixed one-kilometre region is sampled once. No scene is reseeded or
  // tuned until an attractive landmark appears.
  for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++)
    elements.push(...generator.chunk(cx, cz).elements.filter(element => element.kind === 'formation'));
  return elements;
}

test('the explicit v1 generator retains every frozen scenery record and support query for all three typed seeds', () => {
  for (const seed of SEEDS) {
    const current = createKelpOceanGenerator(seed, { supportVersion: 1 }), old = originalGenerator(seed);
    assert.equal(current.supportVersion, 1);
    for (const [cx, cz] of CELLS) assert.deepEqual(current.chunk(cx, cz), old.chunk(cx, cz));
    for (const [x, z] of [[0, 0], [39.7, -1], [64, -64], [157.3, 62.7], [-450.1, 74.3], [1000259, -1000123]]) {
      for (const method of ['sample', 'floorVertex', 'floorSurface', 'supportAt', 'supportNormal', 'heightAt', 'heightForCamera'])
        assert.deepEqual(current[method](x, z), old[method](x, z), `${typeof seed}:${seed} ${method} ${x},${z}`);
    }
  }
});

test('new large geology preserves the full authored disk including triangles touching its boundary and actual native roots', () => {
  for (const seed of SEEDS) {
    const current = createKelpOceanGenerator(seed), old = originalGenerator(seed);
    assert.equal(current.supportVersion, 2); assert.equal(current.authoredAnchors, KELP_ANCHORS);
    for (let z = -40; z <= 40; z += 2) for (let x = -40; x <= 40; x += 2) {
      if (Math.hypot(x, z) > 40) continue;
      close(current.sample(x, z).floorY, old.sample(x, z).floorY);
      assert.deepEqual(current.floorSurface(x + .23, z + .17), old.floorSurface(x + .23, z + .17));
      assert.deepEqual(current.supportAt(x, z), old.supportAt(x, z));
    }
    for (const anchor of KELP_ANCHORS) close(current.heightAt(anchor.x, anchor.z), old.heightAt(anchor.x, anchor.z));
    for (const [cx, cz] of [[-1, -1], [0, 0], [-1, 0], [0, -1]])
      assert.ok(current.chunk(cx, cz).elements.filter(element => element.kind === 'formation').every(element =>
        Math.hypot(element.x, element.z) - Math.hypot(element.scale.x, element.scale.z) * .5 > 96));
  }
});

test('every retained old rock and plant keeps its seeded identity, owner, allocation, shape, phase and ordering', () => {
  for (const seed of SEEDS) {
    const current = createKelpOceanGenerator(seed), old = originalGenerator(seed);
    for (const [cx, cz] of CELLS) {
      const before = old.chunk(cx, cz), after = current.chunk(cx, cz), retained = after.elements.filter(element => element.kind !== 'formation');
      assert.deepEqual(retained.map(nonGeometric), before.elements.map(nonGeometric));
      assert.equal(after.counts.rock, before.counts.rock); assert.equal(after.counts.kelp, before.counts.kelp);
      assert.deepEqual(after.composition.habitats, before.composition.habitats); assert.equal(after.composition.primary, before.composition.primary);
      assert.equal(after.agents, undefined); assert.equal(after.resources, undefined);
    }
  }
});

test('all existing root hosts remain the real highest solid support and preserve their submerged canopy depth fraction', () => {
  let roots = 0;
  for (const seed of SEEDS) {
    const generator = createKelpOceanGenerator(seed), old = originalGenerator(seed);
    // Include the new steeper shelf slope, both signs and genuine new outcrops.
    for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) {
      const chunk = generator.chunk(cx, cz), before = new Map(old.chunk(cx, cz).elements.map(element => [element.id, element]));
      const rocks = new Map(chunk.elements.filter(element => element.kind === 'rock').map(element => [element.id, element]));
      for (const plant of chunk.elements.filter(element => element.kind === 'kelp')) {
        roots++; const host = rocks.get(plant.hostId), original = before.get(plant.id); assert.ok(host && original);
        close(plant.y, oceanRockHeight(host, plant.x, plant.z), 'real original host cap');
        close(plant.y, generator.heightAt(plant.x, plant.z), 'root is not buried in the new slope or outcrop');
        assert.ok(plant.y >= generator.floorSurface(plant.x, plant.z).height + .02, 'root stays above the physical floor');
        close(plant.lengthM / (generator.surfaceY - plant.y), original.lengthM / (generator.surfaceY - original.y), 'original depth fraction');
        close(plant.anchor.y, plant.y); close(plant.anchor.lengthM, plant.lengthM);
        assert.ok(plant.lengthM > 4 && plant.y + plant.lengthM <= generator.surfaceY - .20);
      }
    }
  }
  assert.ok(roots > 1000);
});

test('the kilometre-scale world has broad raised forest shelves and lower open sediment channels for every typed seed', () => {
  for (const seed of SEEDS) {
    const generator = createKelpOceanGenerator(seed); let min = Infinity, max = -Infinity, shelf = 0, channel = 0;
    const rows = [];
    for (let z = -512; z <= 512; z += 8) {
      let consecutiveShelf = 0, broadestShelf = 0;
      for (let x = -512; x <= 512; x += 8) {
        const sample = generator.sample(x, z), shape = sample.landscape;
        min = Math.min(min, shape.reliefM); max = Math.max(max, shape.reliefM);
        if (shape.shelfWeight > .55) { shelf++; consecutiveShelf++; broadestShelf = Math.max(broadestShelf, consecutiveShelf); }
        else consecutiveShelf = 0;
        if (shape.channelWeight > .55) channel++;
        assert.ok(sample.depthM >= 11.5 && sample.depthM < 28, 'whole landscape remains a submerged temperate shelf');
      }
      rows.push(broadestShelf);
    }
    assert.ok(max > 4.5 && min < -.7, 'both macro lift and sediment lows must exist');
    assert.ok(shelf > 1000 && channel > 1000, 'whole kilometre has substantial coherent habitats');
    assert.ok(Math.max(...rows) >= 6, 'raised shelf is at least 40 metres across a real transect');
  }
});

test('floor samples and real Float32 triangle seams remain continuous across positive/negative chunk boundaries and the authored transition', () => {
  for (const seed of SEEDS) {
    const generator = createKelpOceanGenerator(seed);
    for (const coordinate of [-256, -128, -64, -44, -40, 40, 44, 64, 96, 128, 256]) for (const z of [-233, -64, 0, 61, 133]) {
      const a = generator.sample(coordinate - 1e-5, z), b = generator.sample(coordinate + 1e-5, z);
      assert.ok(Math.abs(a.floorY - b.floorY) < 1e-3);
      assert.ok(Math.abs(generator.floorSurface(coordinate - 1e-5, z).height - generator.floorSurface(coordinate + 1e-5, z).height) < 1e-3);
      assert.ok(Math.abs(a.forestCover - b.forestCover) < 1e-4, 'smooth habitat field crosses the same seam');
    }
  }
});

test('support height and triangle normal agree with actual rendered v2 floor triangles through floating-origin rebases', t => {
  const chunks = new KelpOceanChunks('42'), ray = new THREE.Raycaster(); t.after(() => chunks.dispose());
  const positions = [[157.263, 62.727], [310.543, -467.755], [-450.781, -455.557], [191.99999, 64.00001], [-127.99999, -63.99999]];
  for (const [x, z] of positions) {
    chunks.update({ x, z }); chunks.setRenderOrigin({ x: Math.floor(x / 64) * 64, z: Math.floor(z / 64) * 64 });
    chunks.root.updateMatrixWorld(true);
    const record = chunks._chunks.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
    const floor = record.group.children.find(mesh => mesh.userData.landscapeKind === 'floor');
    ray.set(new THREE.Vector3(x - chunks.renderOrigin.x, 30, z - chunks.renderOrigin.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(floor)[0]; assert.ok(hit);
    const support = chunks.generator.floorSurface(x, z); close(hit.point.y, support.height, 'actual v2 triangle ray');
    for (const axis of ['x', 'y', 'z']) close(hit.face.normal[axis], support.normal[axis], 'actual unsmoothed triangle normal');
  }
});

test('new sparse outcrops are co-oriented actual pairs with a physically open channel and retain every old occupied root host', () => {
  for (const seed of SEEDS) {
    const generator = createKelpOceanGenerator(seed), formations = boundedFormations(generator);
    assert.ok(formations.length >= 4, 'a fixed one-kilometre domain contains actual sparse paired geology');
    const groups = Map.groupBy(formations, element => element.groupId);
    let complete = 0;
    for (const members of groups.values()) {
      if (members.length !== 2) continue; complete++;
      const [a, b] = members; assert.equal(a.rotation, b.rotation); assert.equal(a.channelWidth, b.channelWidth);
      assert.ok(a.scale.x >= 20 && a.scale.z >= 6 && a.scale.y >= 3.6);
      const middle = { x: (a.x + b.x) * .5, z: (a.z + b.z) * .5 };
      for (const u of [-.20, -.10, 0, .10, .20]) {
        const x = middle.x + Math.sin(a.rotation) * a.channelWidth * u,
          z = middle.z + Math.cos(a.rotation) * a.channelWidth * u;
        assert.equal(oceanRockHeight(a, x, z), null); assert.equal(oceanRockHeight(b, x, z), null);
      }
      for (const element of members) {
        const cx = Math.floor(element.x / 64), cz = Math.floor(element.z / 64);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const chunk = generator.chunk(cx + dx, cz + dz);
          for (const host of chunk.elements.filter(item => item.kind === 'rock')) {
            // Independent finite downward support references cover the entire
            // old rock cap, rather than forbidding harmless bounding-circle overlap.
            for (let index = -1; index < 32; index++) {
              const angle = index * Math.PI / 16, radius = index < 0 ? 0 : .5;
              const lx = Math.cos(angle) * host.scale.x * radius, lz = Math.sin(angle) * host.scale.z * radius;
              const x = host.x + lx * Math.cos(host.rotation) + lz * Math.sin(host.rotation),
                z = host.z - lx * Math.sin(host.rotation) + lz * Math.cos(host.rotation);
              assert.equal(oceanRockHeight(element, x, z), null, 'a new footprint cannot cover an old actual cap');
            }
          }
        }
      }
    }
    assert.ok(complete >= 2);
  }
});

test('formation support and conservative camera clearance agree with the genuine scaled and rotated triangle mesh', () => {
  const generator = createKelpOceanGenerator('42'), formations = boundedFormations(generator), ray = new THREE.Raycaster(); let checked = 0;
  for (const element of formations.slice(0, 12)) {
    const solid = makeSolid(element);
    for (const [lx, lz] of [[0, 0], [.15, .1], [-.18, .17], [.29, -.09]]) {
      const point = new THREE.Vector3(lx, 0, lz).applyMatrix4(solid.mesh.matrixWorld);
      ray.set(new THREE.Vector3(point.x, 30, point.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(solid.mesh)[0]; assert.ok(hit);
      close(oceanRockHeight(element, point.x, point.z), hit.point.y, 'formation Float32 triangle surface');
      assert.ok(generator.heightAt(point.x, point.z) >= hit.point.y - 1e-8, 'actual solid belongs in support queries');
      assert.ok(generator.heightForCamera(point.x, point.z) >= hit.point.y - 1e-8, 'actual camera ceiling includes the whole outcrop cap'); checked++;
    }
    solid.dispose();
  }
  assert.ok(checked >= 24);
});

test('buried side meshes for old rocks and new outcrops close all real slopes without changing their upper triangle profiles', () => {
  const generator = createKelpOceanGenerator('42'), formations = boundedFormations(generator); let checked = 0;
  const ids = [...new Set(formations.slice(0, 8).map(element => `${Math.floor(element.x / 64)},${Math.floor(element.z / 64)}`))];
  for (const id of ids) {
    const chunk = generator.chunk(...id.split(',').map(Number)), elements = chunk.elements.filter(element => ['rock', 'formation'].includes(element.kind));
    const base = oceanRockFootingMesh(elements, chunk.origin, (x, z) => generator.floorSurface(x, z).height);
    assert.equal(base.footings.length, elements.length);
    elements.forEach((element, index) => {
      for (const rim of base.footings[index].rim) assert.ok(base.footings[index].burialY < rim.floorY - .0149);
      for (let sector = 0; sector < 16; sector++) close(base.positions[(index * 32 + sector * 2) * 3 + 1], element.y, 'old upper profile starts at unchanged element origin');
      checked++;
    });
  }
  assert.ok(checked >= formations.length, 'every real sampled outcrop has a closed footing');
});

test('ordinary 3 by 3 streaming keeps finite geometry, accurate actual-owner group metadata and disposes departed geometry', () => {
  const chunks = new KelpOceanChunks('42'); let disposedTerrain = 0, disposedInstances = 0;
  const watched = new Set();
  for (const position of [{ x: -450, z: -450 }, { x: 315, z: -455 }, { x: 160, z: 32 }, { x: 640, z: 320 }]) {
    chunks.update(position);
    const stats = chunks.stats; assert.equal(stats.activeChunks, 9); assert.ok(stats.elementCounts.formation <= 18);
    assert.ok(stats.sceneryInstances <= 9 * (32 + 72 + 2)); assert.ok(stats.drawCalls <= stats.maxDrawCalls && stats.maxDrawCalls <= 81);
    assert.equal(stats.prototypeGeometries, 4); assert.equal(stats.prototypeMaterials, 3); assert.equal(stats.ownedOverlayGeometries, 0);
    const actualIds = [...chunks._chunks].flatMap(([, record]) => record.instances.filter(mesh => mesh.userData.landscapeKind === 'formation').flatMap(mesh => mesh.userData.elementIds));
    assert.deepEqual(stats.landformGroups.flatMap(group => group.elementIds).sort(), actualIds.sort());
    assert.equal(stats.landformGroups.reduce((sum, group) => sum + group.residentFormationCount, 0), stats.elementCounts.formation);
    for (const group of stats.landformGroups) for (const owner of group.ownerChunkIds) assert.ok(stats.loadedChunks.includes(owner));
    for (const record of chunks._chunks.values()) if (!watched.has(record)) {
      watched.add(record); record.terrainGeometry.addEventListener('dispose', () => { disposedTerrain++; });
      for (const mesh of record.instances) mesh.addEventListener('dispose', () => { disposedInstances++; });
    }
  }
  chunks.dispose(); assert.equal(disposedTerrain, watched.size); assert.ok(disposedInstances >= watched.size);
  assert.equal(chunks.stats.activeChunks, 0);
});

test('landscape geometry is stable after cache eviction and load-order reversal with bounded caches at very large coordinates', () => {
  for (const seed of SEEDS) {
    const generator = createKelpOceanGenerator(seed), reversed = createKelpOceanGenerator(seed);
    const expected = CELLS.map(([cx, cz]) => generator.chunk(cx, cz));
    for (const [cx, cz] of [...CELLS].reverse()) reversed.chunk(cx, cz);
    for (let index = 0; index < 60; index++) {
      reversed.chunk(15625 + index, -15625 - index);
      reversed.heightAt((15625 + index) * 64 + 25.4, (-15625 - index) * 64 + 40.8);
      const stats = reversed.cacheStats();
      assert.ok(stats.chunks <= 32 && stats.vertices <= 16384 && stats.neighborhoods <= 32);
      assert.ok(stats.legacyChunks <= 32 && stats.landformUnits <= 32);
    }
    assert.deepEqual(CELLS.map(([cx, cz]) => reversed.chunk(cx, cz)), expected);
    reversed.clearCache(); assert.deepEqual(CELLS.map(([cx, cz]) => reversed.chunk(cx, cz)), expected);
    assert.ok(Object.isFrozen(expected[0]) && Object.isFrozen(expected[0].elements));
    assert.throws(() => reversed.sample(Infinity, 0)); assert.throws(() => reversed.chunk(.5, 1));
    assert.throws(() => createKelpOceanGenerator(seed, { supportVersion: 77 }));
  }
  assert.equal(KELP_OCEAN_ELEMENT_LIMITS.formation, 2);
  assert.notDeepEqual(createKelpOceanGenerator(42).chunk(4, -1), createKelpOceanGenerator('42').chunk(4, -1));
});
