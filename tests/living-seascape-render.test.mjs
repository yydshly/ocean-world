import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgeGenerator, createLivingRidgePlan, validateLivingRidgePlan } from '../src/livingRidgeGeology.js';
import { createLivingHabitatMosaic } from '../src/livingHabitatMosaic.js';
import { createLivingSeabedRelief, sampleLivingSeabedRelief, livingSeabedFloorVertex, livingSeabedFloorSurface } from '../src/livingSeabedRelief.js';
import { createLivingSeascapePlans } from '../src/livingSeascape.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

const SEED = 'living-shallows-v1|string:42';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(generator) {
  const route = generator.routeStops.find(stop => stop.id === 'connected-seascape');
  assert.ok(route, 'the finite connected-seascape example has an actual entry route');
  const cx = Math.floor(Math.floor(route.x / 64) / 2) * 2, cz = Math.floor(Math.floor(route.z / 64) / 2) * 2;
  const plans = createLivingSeascapePlans(generator.baseGenerator, cx, cz);
  return { plans, group: plans[0].group, position: { x: cx * 64 + 32, z: cz * 64 + 32 } };
}
function disposalReceipt(records) {
  const resources = records.flatMap(record => [record.terrainGeometry, record.footingGeometry, ...record.ownedGeometries,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry), ...record.instances]).filter(Boolean);
  const counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1, 'owner resources release once'); };
}
function contact(ocean, x, z) {
  const record = ocean._chunks.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
  const terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed'), surface = ocean.generator.floorSurface(x, z);
  const ray = new THREE.Raycaster(new THREE.Vector3(x - ocean.renderOrigin.x, 20, z - ocean.renderOrigin.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
  assert.ok(Math.abs(hit.point.y - surface.height) < 2e-5);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(hit.face.normal[axis] - surface.normal[axis]) < 1e-7);
  const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
  const a = ocean.generator.floorVertex(ix, iz), b = ocean.generator.floorVertex(ix + 1, iz),
    c = ocean.generator.floorVertex(ix, iz + 1), d = ocean.generator.floorVertex(ix + 1, iz + 1);
  const expected = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  assert.ok(Math.abs(surface.height - expected) < 1e-12);
  assert.equal(ocean.generator.sample(x, z).floorY, surface.height);
  assert.deepEqual(ocean.generator.coverAt(x, z), ocean.generator.baseGenerator.coverAt(x, z, ocean.generator.sample(x, z)));
}

test('v4 retains saved v1/v2/v3 plans, sources, queries and the original nine routes exactly', () => {
  const base = createOceanGenerator(SEED), generator = createLivingRidgeGenerator(base);
  const plans = [createLivingRidgePlan(base, 14, 4), createLivingHabitatMosaic(base, 21, 7, { theme: 'patch-reef' }),
    createLivingHabitatMosaic(base, 19, 4, { theme: 'meadow-edge' }), createLivingSeabedRelief(base, 35, 7, { theme: 'shelf-rise' }),
    createLivingSeabedRelief(base, 27, 9, { theme: 'sand-basin' })];
  const golden = [
    ['53f89362ce3de698e14b7c90bb216a2aae67236cd8d348f41cef0ebdf4b107ea', '967ef970ce9801e198e9235661389d4ec4a89d46c4cdafa4682819ca1bae7a1d'],
    ['c3def38b6eae453f90ab2a76fe431ccdf112e7b3546400328b3ff27f9bd48800', '95ddf4418def26bb64e66165a8091de00da8587e590987902f2195a4a74ececd'],
    ['532c8ca87c1cb049b4f7d343604f77b8faa0fd42a7ac7576cb4876ad279fa26c', '8b842686ed174b700fe3f9aed4fd055b546d1a038328c6f5be4bbae9b31ebbac'],
    ['5ded10989dbf931911dfb7ab6c8b6ed3238a9032a7570b9a6a332c38b4300c8c', 'a3a44e7a088d1fd63f5793dc54c45083990a9a4851f236b990c2594da459f37d'],
    ['f072c0a39d9ba291e2e7f5fefc6db3898992a5e2562f8637cdb8ea6a53c10aa8', '813b4985ef8a9739abb500899b8482c1d871b97e80220535a89a0422666fdd01'],
  ];
  for (const [index, plan] of plans.entries()) {
    assert.equal(validateLivingRidgePlan(plan, base), true); assert.equal(digest(plan), golden[index][0]);
    generator.registerRidgePlan(copy(plan)); assert.equal(digest(generator.chunk(plan.cx, plan.cz)), golden[index][1]);
  }
  const points = plans.slice(0, 3).flatMap(plan => [[plan.cx * 64 + 32, plan.cz * 64 + 32], [plan.cx * 64 + 31.18, plan.cz * 64 + 29.27],
    [plan.cx * 64, plan.cz * 64 + 16.9], [plan.cx * 64 - .125, plan.cz * 64 + 20.75]]);
  const queries = points.map(([x, z]) => ({ x, z, sample: generator.sample(x, z), vertex: generator.floorVertex(x, z),
    surface: generator.floorSurface(x, z), cover: generator.coverAt(x, z), camera: generator.heightForCamera(x, z) }));
  assert.equal(digest(queries), 'b397b0f776a99a2b3f2c7323229013cc0c313935a22599e4fa37dad56e00e039');
  for (const plan of plans.slice(3)) for (const [x, z] of [[plan.overview.center.x + .18, plan.overview.center.z + .27],
    [plan.cx * 64, plan.cz * 64 + 32], [plan.cx * 64 - .125, plan.cz * 64 + 32]]) {
    assert.deepEqual(generator.sample(x, z), sampleLivingSeabedRelief(base, plan, x, z));
    assert.equal(generator.floorVertex(x, z), livingSeabedFloorVertex(base, plan, x, z));
    assert.deepEqual(generator.floorSurface(x, z), livingSeabedFloorSurface(base, plan, x, z));
  }
  assert.equal(generator.floorSurfaceVersion, 1);
  assert.deepEqual(generator.routeStops.slice(0, 4), base.routeStops);
  assert.deepEqual(generator.routeStops.slice(4, 9), [
    { id: 'ridge-gully', label: '礁脊岩沟', x: 928, z: 288 }, { id: 'patch-reef', label: '分散礁丘', x: 1376, z: 480 },
    { id: 'meadow-edge', label: '草床边缘', x: 1248, z: 288 }, { id: 'shelf-rise', label: '海床缓坡', x: 2272, z: 480 },
    { id: 'sand-basin', label: '宽缓砂盆', x: 1760, z: 608 },
  ]);
});

test('the four persisted floor slices have equal internal vertices/normals and actual raycast support across the continuous relief', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const { plans, group, position } = fixture(ocean.generator); ocean.generator.registerRidgePlans(plans); ocean.update(position);
  assert.equal(ocean.stats.activeChunks, 4); assert.equal(ocean.generator.ridgeRevision, 1);
  for (const plan of plans) {
    const record = ocean._chunks.get(plan.id), geometry = record.terrainGeometry, positions = geometry.attributes.position;
    assert.equal(record.ridgePlan, plan); assert.equal(record.sourceChunk.ridgeGeologyVersion, 4);
    assert.deepEqual(record.sourceChunk.habitatComposition, plan.habitatComposition); assert.equal(positions.count, 65 * 65);
    for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++) {
      assert.equal(positions.getY(z * 65 + x), plan.floorPatch.heights[z * 65 + x]);
      assert.equal(positions.getY(z * 65 + x), ocean.generator.floorVertex(plan.cx * 64 + x, plan.cz * 64 + z));
    }
  }
  for (const [a, b, axis] of [[0, 1, 'x'], [2, 3, 'x'], [0, 2, 'z'], [1, 3, 'z']]) {
    const left = ocean._chunks.get(plans[a].id).terrainGeometry, right = ocean._chunks.get(plans[b].id).terrainGeometry;
    for (let i = 0; i <= 64; i++) {
      const ai = axis === 'x' ? i * 65 + 64 : 64 * 65 + i, bi = axis === 'x' ? i * 65 : i;
      assert.equal(left.attributes.position.getY(ai), right.attributes.position.getY(bi));
      for (const get of ['getX', 'getY', 'getZ']) assert.equal(left.attributes.normal[get](ai), right.attributes.normal[get](bi));
    }
  }
  const seam = group.seams.find(value => value.lengthM >= 12); assert.ok(seam);
  const center = seam.center, along = .18;
  assert.ok(Math.abs(ocean.generator.floorVertex(Math.floor(center.x), Math.floor(center.z)) -
    ocean.generator.baseGenerator.floorVertex(Math.floor(center.x), Math.floor(center.z))) >= 1);
  const bytes = plans.map(plan => ocean._chunks.get(plan.id).terrainGeometry.attributes.position.array.slice());
  const matrices = plans.map(plan => ocean._chunks.get(plan.id).instances.map(mesh => mesh.instanceMatrix.array.slice()));
  for (const origin of [{ x: 0, z: 0 }, { x: group.cx * 64, z: group.cz * 64 }]) {
    ocean.setRenderOrigin(origin); ocean.root.updateMatrixWorld(true);
    for (const offset of [-.73, -.27, .27]) contact(ocean, seam.axis === 'x' ? center.x + offset : center.x + along,
      seam.axis === 'x' ? center.z + along : center.z + offset);
    plans.forEach((plan, index) => {
      const record = ocean._chunks.get(plan.id); assert.deepEqual(record.terrainGeometry.attributes.position.array, bytes[index]);
      record.instances.forEach((mesh, i) => assert.deepEqual(mesh.instanceMatrix.array, matrices[index][i]));
    });
  }
  for (const [x, z] of [[group.cx * 64 + 1, group.cz * 64 + 64], [group.cx * 64 + 127, group.cz * 64 + 64],
    [group.cx * 64 + 64, group.cz * 64 + 1], [group.cx * 64 + 64, group.cz * 64 + 127]]) {
    assert.deepEqual(ocean.generator.sample(x, z), ocean.generator.baseGenerator.sample(x, z));
    assert.equal(ocean.generator.floorVertex(x, z), ocean.generator.baseGenerator.floorVertex(x, z));
  }
});

test('temporary/failed batches expose no ready owner, then one commit replaces full owners and restored sources stay bounded', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const { plans, group, position } = fixture(ocean.generator), generator = ocean.generator, base = generator.baseGenerator;
  const originals = plans.map(plan => generator.chunk(plan.cx, plan.cz)); ocean.update(position);
  assert.equal(ocean.stats.activeChunks, 0);
  assert.throws(() => generator.withRidgePlans(plans, () => {
    for (const plan of plans) {
      assert.equal(generator.chunk(plan.cx, plan.cz).ridgePlan, plan); assert.equal(generator.isRidgeOwnerReady(plan.id), false);
      const point = plan.overview.center;
      assert.equal(generator.floorVertex(point.x, point.z), livingSeabedFloorVertex(base, plan, point.x, point.z));
      ocean._load(plan.cx, plan.cz);
    }
    assert.equal(generator.ridgeRevision, 0); assert.equal(ocean._chunks.size, 0);
    assert.throws(() => generator.registerLegacyRidgeOwner('0,0'), /temporary plan batch/);
    assert.throws(() => generator.registerRidgePlans(plans), /temporary plan batch/);
    throw new Error('birth failed');
  }), /birth failed/);
  plans.forEach((plan, index) => assert.equal(generator.chunk(plan.cx, plan.cz), originals[index]));
  assert.throws(() => generator.withRidgePlans(plans, async () => {}), /synchronous/);
  assert.throws(() => generator.withRidgePlans(plans, () => ({ then() {} })), /asynchronous result/);
  const unchanged = digest(generator.registryStats());
  assert.throws(() => generator.registerRidgePlans(plans.slice(0, 3)), /all four/);
  assert.throws(() => generator.registerRidgePlans([...plans, plans[0]]), /duplicate/);
  const damaged = copy(plans); damaged[3].floorPatch.heights[3000] += 1;
  assert.throws(() => generator.registerRidgePlans(damaged), /Invalid ridge plan/);
  assert.equal(digest(generator.registryStats()), unchanged);
  const capped = createLivingRidgeGenerator(createOceanGenerator(SEED));
  for (let i = 0; i < 22; i++) capped.registerLegacyRidgeOwner(`${i},-99`);
  const beforeCap = digest(capped.registryStats());
  assert.throws(() => capped.registerRidgePlans(plans), /25-owner/);
  assert.throws(() => capped.withRidgePlans(plans, () => {}), /25-owner/);
  assert.equal(digest(capped.registryStats()), beforeCap); assert.equal(capped.getRidgePlan(plans[0].id), undefined);
  const ids = [];
  for (let z = group.cz - 2; z <= group.cz + 2; z++) for (let x = group.cx - 2; x <= group.cx + 2; x++) ids.push(`${x},${z}`);
  for (const id of ids) generator.registerLegacyRidgeOwner(id);
  ocean.update(position); assert.equal(ocean.stats.activeChunks, 9);
  const oldRecords = plans.map(plan => ocean._chunks.get(plan.id)), disposedOld = disposalReceipt(oldRecords);
  const neighbour = ocean._chunks.get(`${group.cx - 1},${group.cz}`), revision = generator.ridgeRevision;
  assert.equal(generator.registerRidgePlans(plans), true); assert.equal(generator.ridgeRevision, revision + 1);
  assert.equal(ocean.update(position), true); disposedOld(); assert.equal(ocean._chunks.get(`${group.cx - 1},${group.cz}`), neighbour);
  const sources = plans.map(plan => generator.chunk(plan.cx, plan.cz));
  assert.equal(generator.registerRidgePlans(copy(plans)), false); assert.equal(generator.ridgeRevision, revision + 1);
  assert.equal(ocean.update(position), false);
  assert.throws(() => generator.withRidgePlans(copy(plans), () => { throw new Error('saved candidate failed'); }), /saved candidate failed/);
  plans.forEach((plan, index) => assert.equal(generator.chunk(plan.cx, plan.cz), sources[index]));
  assert.equal(ocean.stats.ridgeReadyOwners, 25); assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
  assert.ok(ocean.stats.ownedMeadowGeometries <= 9); assert.ok(ocean.stats.ownedOverlayGeometries <= 9);
  assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
  const shared = ocean._geometries.seagrass, rootXZ = shared.attributes.rootXZ, vertices = shared.attributes.position;
  let prototypeDisposals = 0; shared.addEventListener('dispose', () => prototypeDisposals++);
  const bytes = plans.map(plan => ocean._chunks.get(plan.id).terrainGeometry.attributes.position.array.slice());
  const disposed = disposalReceipt([...ocean._chunks.values()]); generator.retainRidgeOwners([]); ocean.update(position); disposed();
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(prototypeDisposals, 0);
  assert.equal(shared.attributes.rootXZ, rootXZ); assert.equal(shared.attributes.position, vertices);
  // Single saved-owner restore remains valid; a subsequent complete batch is one publication.
  generator.registerRidgePlan(copy(plans[0])); assert.equal(generator.registryStats().size, 1);
  const restoreRevision = generator.ridgeRevision;
  generator.registerRidgePlans(copy(plans)); assert.equal(generator.ridgeRevision, restoreRevision + 1); ocean.update(position);
  plans.forEach((plan, index) => assert.deepEqual(ocean._chunks.get(plan.id).terrainGeometry.attributes.position.array, bytes[index]));
  assert.equal(ocean.stats.activeChunks, 4); assert.ok(generator.cacheStats().size <= 32);
  ocean.dispose(); assert.equal(prototypeDisposals, 1);
});
