import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgeGenerator, createLivingRidgePlan, validateLivingRidgePlan } from '../src/livingRidgeGeology.js';
import { createLivingHabitatMosaic } from '../src/livingHabitatMosaic.js';
import { createLivingSeabedRelief } from '../src/livingSeabedRelief.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

const SEED = 'living-shallows-v1|string:42';
const THEMES = ['shelf-rise', 'sand-basin'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const position = plan => ({ x: plan.cx * 64 + 32, z: plan.cz * 64 + 32 });
function fixture(theme) {
  const base = createOceanGenerator(SEED), generator = createLivingRidgeGenerator(base);
  const route = generator.routeStops.find(stop => stop.id === theme); assert.ok(route, `committed example route for ${theme}`);
  const cx = Math.floor(route.x / 64), cz = Math.floor(route.z / 64);
  return { base, plan: createLivingSeabedRelief(base, cx, cz, { theme }) };
}
function oldPlans(base) {
  return [createLivingRidgePlan(base, 14, 4), createLivingHabitatMosaic(base, 21, 7, { theme: 'patch-reef' }),
    createLivingHabitatMosaic(base, 19, 4, { theme: 'meadow-edge' })];
}
function halo(plan, radius = 2) {
  const ids = [];
  for (let z = plan.cz - radius; z <= plan.cz + radius; z++) for (let x = plan.cx - radius; x <= plan.cx + radius; x++) ids.push(`${x},${z}`);
  return ids;
}
function disposalReceipt(records) {
  const resources = records.flatMap(record => [record.terrainGeometry, record.footingGeometry, ...record.ownedGeometries,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry), ...record.instances]).filter(Boolean);
  const counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1); };
}

test('v3 facade preserves the exact saved v1/v2 plans, sources and floor/habitat/cover/camera query values', () => {
  const base = createOceanGenerator(SEED), generator = createLivingRidgeGenerator(base), plans = oldPlans(base);
  const golden = [
    ['53f89362ce3de698e14b7c90bb216a2aae67236cd8d348f41cef0ebdf4b107ea', '967ef970ce9801e198e9235661389d4ec4a89d46c4cdafa4682819ca1bae7a1d'],
    ['c3def38b6eae453f90ab2a76fe431ccdf112e7b3546400328b3ff27f9bd48800', '95ddf4418def26bb64e66165a8091de00da8587e590987902f2195a4a74ececd'],
    ['532c8ca87c1cb049b4f7d343604f77b8faa0fd42a7ac7576cb4876ad279fa26c', '8b842686ed174b700fe3f9aed4fd055b546d1a038328c6f5be4bbae9b31ebbac'],
  ];
  for (const [index, plan] of plans.entries()) {
    assert.equal(validateLivingRidgePlan(plan, base), true); assert.equal(digest(plan), golden[index][0]);
    generator.registerRidgePlan(copy(plan)); assert.equal(digest(generator.chunk(plan.cx, plan.cz)), golden[index][1]);
  }
  const points = plans.flatMap(plan => [[plan.cx * 64 + 32, plan.cz * 64 + 32], [plan.cx * 64 + 31.18, plan.cz * 64 + 29.27],
    [plan.cx * 64, plan.cz * 64 + 16.9], [plan.cx * 64 - .125, plan.cz * 64 + 20.75]]);
  const queries = points.map(([x, z]) => ({ x, z, sample: generator.sample(x, z), vertex: generator.floorVertex(x, z),
    surface: generator.floorSurface(x, z), cover: generator.coverAt(x, z), camera: generator.heightForCamera(x, z) }));
  assert.equal(digest(queries), 'b397b0f776a99a2b3f2c7323229013cc0c313935a22599e4fa37dad56e00e039');
  assert.equal(generator.floorSurfaceVersion, 1); assert.deepEqual(generator.routeStops.slice(0, 4), base.routeStops);
  assert.deepEqual(generator.routeStops.slice(4, 7), [
    { id: 'ridge-gully', label: '礁脊岩沟', x: 928, z: 288 }, { id: 'patch-reef', label: '分散礁丘', x: 1376, z: 480 },
    { id: 'meadow-edge', label: '草床边缘', x: 1248, z: 288 },
  ]);
});

test('both new relief themes render actual Float32 floor vertices and the same four-vertex triangles used by contact queries', t => {
  let contacts = 0;
  for (const theme of THEMES) {
    const { base, plan } = fixture(theme), ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
    ocean.generator.registerRidgePlan(plan); ocean.update(position(plan)); ocean.root.updateMatrixWorld(true);
    assert.equal(plan.version, 3); assert.ok(plan.floorPatch); assert.equal(ocean.generator.floorSurfaceVersion, 1);
    const record = ocean._chunks.get(plan.id), terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed');
    assert.deepEqual(record.sourceChunk.habitatComposition, plan.habitatComposition);
    assert.equal(record.sourceChunk.habitatComposition.samples, 64);
    const positions = terrain.geometry.attributes.position; assert.equal(positions.count, 65 * 65);
    let changed = { delta: 0, x: 0, z: 0 };
    for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++) {
      const wx = plan.cx * 64 + x, wz = plan.cz * 64 + z, height = ocean.generator.floorVertex(wx, wz);
      assert.equal(positions.getY(z * 65 + x), height); assert.equal(Math.fround(height), height);
      const delta = Math.abs(height - base.floorVertex(wx, wz)); if (delta > changed.delta) changed = { delta, x: wx, z: wz };
    }
    assert.ok(changed.delta >= .5, 'the true sea bed has visible relief rather than an added decoration');
    const ix = Math.floor(changed.x), iz = Math.floor(changed.z), ray = new THREE.Raycaster();
    for (const [tx, tz] of [[.18, .27], [.75, .71], [.43, .43]]) {
      const x = ix + tx, z = iz + tz, a = ocean.generator.floorVertex(ix, iz), b = ocean.generator.floorVertex(ix + 1, iz),
        c = ocean.generator.floorVertex(ix, iz + 1), d = ocean.generator.floorVertex(ix + 1, iz + 1);
      const expected = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
      const surface = ocean.generator.floorSurface(x, z); assert.ok(Math.abs(surface.height - expected) < 1e-12);
      ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
      assert.ok(Math.abs(hit.point.y - surface.height) < 2e-5);
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(hit.face.normal[axis] - surface.normal[axis]) < 1e-7);
      const sample = ocean.generator.sample(x, z); assert.ok(Math.abs(sample.floorY - surface.height) < 1e-12);
      assert.ok(Math.abs(sample.depthM - (base.surfaceY - surface.height)) < 1e-12);
      assert.deepEqual(ocean.generator.coverAt(x, z), base.coverAt(x, z, sample));
      assert.ok(ocean.generator.heightForCamera(x, z) >= surface.height); contacts++;
    }
    for (const [x, z] of [[plan.cx * 64, plan.cz * 64 + 32], [plan.cx * 64 + 1, plan.cz * 64 + 32],
      [plan.cx * 64 + 63, plan.cz * 64 + 32], [plan.cx * 64 + 64, plan.cz * 64 + 32]]) {
      assert.deepEqual(ocean.generator.sample(x, z), base.sample(x, z));
      assert.equal(ocean.generator.floorVertex(x, z), base.floorVertex(x, z));
      assert.deepEqual(ocean.generator.floorSurface(x, z), base.floorSurface(x, z));
    }
  }
  assert.equal(contacts, 6);
});

test('temporary candidate floor queries stay uncommitted and invisible, then same-center commit loads only the complete owner', t => {
  for (const theme of THEMES) {
    const { base, plan } = fixture(theme), ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
    const point = plan.overview.center, original = ocean.generator.floorSurface(point.x, point.z);
    ocean.update(position(plan)); assert.equal(ocean.stats.activeChunks, 0);
    assert.throws(() => ocean.generator.withRidgePlan(plan, () => {
      assert.equal(ocean.generator.chunk(plan.cx, plan.cz).ridgePlan, plan);
      assert.equal(ocean.generator.isRidgeOwnerReady(plan.id), false); assert.equal(ocean.generator.ridgeRevision, 0);
      ocean._load(plan.cx, plan.cz); assert.equal(ocean._chunks.size, 0);
      assert.ok(Number.isFinite(ocean.generator.floorSurface(point.x, point.z).height));
      throw new Error('temporary birth failed');
    }), /temporary birth failed/);
    assert.deepEqual(ocean.generator.floorSurface(point.x, point.z), original);
    assert.deepEqual(ocean.generator.sample(point.x, point.z), base.sample(point.x, point.z));
    assert.equal(ocean.generator.ridgeRevision, 0); assert.equal(ocean.stats.loads, 0);
    ocean.generator.registerRidgePlan(plan); assert.equal(ocean.update(position(plan)), true);
    const record = ocean._chunks.get(plan.id), revision = ocean.generator.ridgeRevision;
    assert.equal(record.sourceChunk.ridgeGeologyVersion, 3); assert.equal(record.ridgePlan, plan); assert.equal(ocean.stats.activeChunks, 1);
    assert.equal(ocean.generator.registerRidgePlan(copy(plan)), false); assert.equal(ocean.generator.ridgeRevision, revision);
    assert.equal(ocean.update(position(plan)), false); assert.equal(ocean._chunks.get(plan.id), record);
  }
});

test('serialized relief restores through rebase and complete same-center unload/reload within existing resource budgets', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const kit = ocean._geometries, positions = kit.seagrass.attributes.position, roots = kit.seagrass.attributes.rootXZ;
  let sharedDisposals = 0; kit.seagrass.addEventListener('dispose', () => sharedDisposals++);
  for (const theme of THEMES) {
    const { plan } = fixture(theme), restored = copy(plan), ids = halo(plan); ocean.generator.retainRidgeOwners(ids);
    for (const id of ids) ocean.generator.registerLegacyRidgeOwner(id);
    ocean.generator.registerRidgePlan(restored); ocean.update(position(plan));
    const record = ocean._chunks.get(plan.id), bytes = record.terrainGeometry.attributes.position.array.slice();
    const matrices = record.instances.map(mesh => mesh.instanceMatrix.array.slice());
    assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.ridgeReadyOwners, 25);
    assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls); assert.ok(ocean.stats.ownedMeadowGeometries <= 9);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9); assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
    ocean.setRenderOrigin({ x: plan.cx * 64, z: plan.cz * 64 }); ocean.root.updateMatrixWorld(true);
    assert.equal(record.group.position.x, 0); assert.equal(record.group.position.z, 0);
    assert.deepEqual(record.terrainGeometry.attributes.position.array, bytes);
    record.instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index]));
    const point = plan.overview.center, ray = new THREE.Raycaster(new THREE.Vector3(point.x - ocean.renderOrigin.x, 20,
      point.z - ocean.renderOrigin.z), new THREE.Vector3(0, -1, 0));
    const terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed'), hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
    assert.ok(Math.abs(hit.point.y - ocean.generator.floorSurface(point.x, point.z).height) < 2e-5);
    const disposed = disposalReceipt([...ocean._chunks.values()]); ocean.generator.retainRidgeOwners([]);
    assert.equal(ocean.update(position(plan)), true); disposed(); assert.equal(ocean.stats.activeChunks, 0);
    assert.equal(kit.seagrass.attributes.position, positions); assert.equal(kit.seagrass.attributes.rootXZ, roots); assert.equal(sharedDisposals, 0);
    ocean.generator.registerRidgePlan(copy(plan)); assert.equal(ocean.update(position(plan)), true);
    assert.deepEqual(ocean._chunks.get(plan.id).terrainGeometry.attributes.position.array, bytes);
    assert.equal(ocean.stats.activeChunks, 1); assert.ok(ocean.generator.cacheStats().size <= 32);
    ocean.generator.retainRidgeOwners([]); ocean.update(position(plan));
  }
  ocean.dispose(); assert.equal(sharedDisposals, 1);
});
