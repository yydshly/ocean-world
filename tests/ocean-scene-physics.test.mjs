import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { speciesById } from '../src/species.js';

class MemoryStore {
  available = true;
  records = new Map();
  async load(world, id) { return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) {
    if (this.rejectId === id) throw new Error('test contact migration disk failure');
    this.records.set(`${world}|${id}`, structuredClone(state));
  }
  async clear() {}
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('actual reef Float32 triangle support agrees with rendered terrain ray hits at both grid triangles and negative seams', t => {
  const ocean = new OceanChunks('42'); t.after(() => ocean.dispose());
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); t.after(() => material.dispose());
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let mismatch = 0, checked = 0;
  for (const [cx, cz] of [[0, 0], [-2, -1], [2, -3], [100, -99]]) {
    const chunk = ocean.generator.chunk(cx, cz), geometry = ocean._terrainGeometry(chunk);
    t.after(() => geometry.dispose());
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(chunk.origin.x, 0, chunk.origin.z); mesh.updateMatrixWorld(true);
    for (const [lx, lz] of [[.23, .19], [.71, .82], [10.26, 31.47], [63.999, 9.4], [9.1, .001]]) {
      const x = chunk.origin.x + lx, z = chunk.origin.z + lz;
      ray.set(new THREE.Vector3(x, 20, z), down);
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit);
      const surface = ocean.generator.floorSurface(x, z);
      assert.ok(Math.abs(hit.point.y - surface.height) < 1e-8, `${x},${z}`);
      assert.ok(Math.abs(Math.hypot(surface.normal.x, surface.normal.y, surface.normal.z) - 1) < 1e-12);
      if (Math.abs(surface.height - ocean.generator.sample(x, z).floorY) > .0001) mismatch++;
      checked++;
    }
  }
  assert.equal(checked, 20); assert.ok(mismatch >= 5, 'the check covers actual analytic/triangle differences');
});

test('historic grass failures are removed and retained seeded roots are soft-bottom, unoccupied and on actual bed triangles', () => {
  const fixtures = [
    [42, 'seagrass:17,10:0', 141.9704729857389, 86.69529416137374],
    ['42', 'seagrass:-11,18:2', -82.7932291714009, 149.47594452658666],
    ['42', 'seagrass:14,29:0', 113.05360951251352, 234.7101678314619],
  ];
  let checked = 0;
  for (const [seed, forbiddenId, x, z] of fixtures) {
    const generator = createOceanGenerator(seed), chunk = generator.chunk(Math.floor(x / 64), Math.floor(z / 64));
    assert.ok(!chunk.elements.some(element => element.id === forbiddenId));
    for (const element of chunk.elements.filter(element => element.kind === 'seagrass')) {
      assert.notEqual(generator.sample(element.x, element.z).substrate, 'rock');
      assert.equal(element.y, generator.floorSurface(element.x, element.z).height);
      assert.ok(Math.abs(oceanSupportHeight(generator, element.x, element.z) - element.y) < 1e-12);
      checked++;
    }
  }
  assert.ok(checked > 150);
});

test('a seeded crawling snail follows a steep rock inside its complete XYZ speed budget', async () => {
  const generator = createOceanGenerator(42), ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
  await ecology.update({ x: 96, z: -96 });
  const snail = ecology.agents.find(agent => agent.id === 'ocean:2,-2:top-shell:6'); assert.ok(snail);
  const start = { ...snail.position };
  let moved = 0;
  for (let i = 0; i < 80; i++) {
    const previous = { ...snail.position };
    ecology._move(snail, { x: start.x - .2, y: start.y + .2, z: start.z + .05 }, .002, .1);
    const displacement = distance(snail.position, previous);
    assert.ok(displacement <= .0002 + 1e-12, `snail step ${i}: ${displacement}`);
    assert.ok(Math.abs(snail.position.y - oceanSupportHeight(generator, snail.position.x, snail.position.z) - .004) < 1e-12);
    moved += displacement;
  }
  assert.ok(moved > .002, 'speed correction does not freeze a valid climbing path');
});

test('a swimmer cannot jump onto a raised reef surface and can recover a retained old intrusion at its ordinary speed', async () => {
  const generator = createOceanGenerator('42'), ecology = new OceanEcology('42', generator, { store: new MemoryStore() });
  await ecology.update({ x: -96, z: -96 });
  const fish = ecology.agents.find(agent => speciesById[agent.speciesId]?.kind === 'fish'); assert.ok(fish);
  const surface = ecology._surface(fish.position.x, fish.position.z, true);
  fish.position.y = surface - .1; // A retained historical pose, not a new birth.
  const original = structuredClone(fish), budget = .08 * .1;
  ecology._move(fish, { ...fish.position, x: fish.position.x + 2, y: surface + .3 }, .08, .1);
  assert.ok(distance(fish.position, original.position) <= budget + 1e-12);
  assert.ok(fish.position.y > original.position.y);
  assert.deepEqual(fish.home, original.home); assert.deepEqual(fish.target, original.target); assert.equal(fish.id, original.id);
  for (let i = 0; i < 40; i++) {
    const previous = { ...fish.position };
    ecology._move(fish, { ...fish.position, y: surface + .3 }, .08, .1);
    assert.ok(distance(fish.position, previous) <= budget + 1e-12);
  }
  assert.ok(fish.position.y >= surface + .08 - 1e-12);
});

async function floorMigrationFixture() {
  const store = new MemoryStore(), generator = createOceanGenerator('42');
  const source = new OceanEcology('42', generator, { store });
  await source.update({ x: 96, z: -96 });
  const legacy = structuredClone(source._active.get('1,-2'));
  delete legacy.floorSurfaceVersion;
  legacy.timeSec = 37.8; legacy.ticks = 378;
  legacy.agents[0].alive = false; legacy.agents[0].state = 'dead'; legacy.agents[0].energy = 0;
  for (const agent of legacy.agents) {
    const swimming = speciesById[agent.speciesId]?.kind === 'fish' || agent.habitat?.includes('water-column');
    for (const key of ['position', 'home', 'target', 'refuge']) {
      const point = agent[key]; if (!point) continue;
      const oldSurface = oceanSupportHeight(generator, point.x, point.z, { actualFloor: false, avoidCoral: swimming });
      point.y = oldSurface + (swimming ? .4 : agent.supportOffset ?? .004);
    }
  }
  await store.save('ecology-v1:string:42', legacy.id, legacy);
  return { store, generator, legacy };
}

test('triangle contact migration is saved before activation and preserves identities, deaths, coordinates, clocks and food through revisit', async () => {
  const { store, generator, legacy } = await floorMigrationFixture();
  const restored = new OceanEcology('42', generator, { store });
  let activatedDuringSave = false;
  const save = store.save.bind(store);
  store.save = async (world, id, record) => {
    if (id === legacy.id) activatedDuringSave ||= restored._active.has(id);
    return save(world, id, record);
  };
  await restored.update({ x: 96, z: -96 });
  const migrated = structuredClone(restored._active.get(legacy.id));
  const projection = region => {
    const copy = structuredClone(region); delete copy.floorSurfaceVersion;
    for (const agent of copy.agents) for (const key of ['position', 'home', 'target', 'refuge']) if (agent[key]) delete agent[key].y;
    return copy;
  };
  assert.equal(activatedDuringSave, false);
  assert.equal(migrated.floorSurfaceVersion, 1); assert.deepEqual(projection(migrated), projection(legacy));
  assert.deepEqual(await store.load('ecology-v1:string:42', legacy.id), migrated);
  restored.step(0); assert.deepEqual(restored._active.get(legacy.id), migrated);
  await restored.update({ x: 960, z: 960 }); await restored.update({ x: 96, z: -96 });
  assert.deepEqual(restored._active.get(legacy.id), migrated);
});

test('a failed triangle contact migration never activates or replaces the saved population', async () => {
  const { store, generator, legacy } = await floorMigrationFixture();
  store.rejectId = legacy.id;
  const restored = new OceanEcology('42', generator, { store });
  assert.equal(await restored.update({ x: 96, z: -96 }), false);
  assert.ok(!restored._active.has(legacy.id));
  assert.deepEqual(await store.load('ecology-v1:string:42', legacy.id), legacy);
  assert.ok(restored.snapshot().metrics.persistenceErrors > 0);
  store.rejectId = null; await restored.update({ x: 96, z: -96 });
  assert.equal(restored._active.get(legacy.id).floorSurfaceVersion, 1);
});

test('rock side closures bury all shared rim vertices while preserving original upper supports and dispose on unload', t => {
  const ocean = new OceanChunks('42'); t.after(() => ocean.dispose());
  ocean.update({ x: 96, z: -96 });
  let checked = 0, expectedDisposals = 0, disposals = 0;
  for (const record of ocean._chunks.values()) {
    if (record.footingGeometry) { expectedDisposals++; record.footingGeometry.addEventListener('dispose', () => disposals++); }
    for (const footing of record.footings) {
      const element = ocean.generator.chunk(Math.floor(record.origin.x / 64), Math.floor(record.origin.z / 64)).elements.find(e => e.id === footing.id);
      const low = Math.min(...footing.rim.map(point => point.floorY));
      assert.ok(footing.burialY < low - .01); assert.ok(footing.burialY < element.y);
      for (const point of footing.rim) assert.equal(point.floorY, ocean.generator.floorSurface(point.x, point.z).height);
      checked++;
    }
  }
  assert.ok(checked >= 30); assert.ok(expectedDisposals > 0);
  assert.ok(ocean.stats.drawCalls <= 108);
  ocean.update({ x: 960, z: 960 }); assert.equal(disposals, expectedDisposals);
});
