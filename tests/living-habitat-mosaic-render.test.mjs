import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgePlan, createLivingRidgeGenerator, validateLivingRidgePlan } from '../src/livingRidgeGeology.js';
import { createLivingHabitatMosaic } from '../src/livingHabitatMosaic.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { meadowInstanceData } from '../src/world/livingMeadowEnvironment.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

const SEED = 'living-shallows-v1|string:42';
const SAMPLES = [{ theme: 'patch-reef', cx: 21, cz: 7 }, { theme: 'meadow-edge', cx: 19, cz: 4 }];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const position = ({ cx, cz }) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
function halo(cx, cz, radius = 2) {
  const ids = [];
  for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++) ids.push(`${x},${z}`);
  return ids;
}
function fixture(sample) {
  const base = createOceanGenerator(SEED);
  return { base, plan: createLivingHabitatMosaic(base, sample.cx, sample.cz, { theme: sample.theme }) };
}
function disposalReceipt(records) {
  const resources = records.flatMap(record => [record.terrainGeometry, record.footingGeometry, ...record.ownedGeometries,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry), ...record.instances]).filter(Boolean);
  const counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1); };
}
function world(rock, x, z) {
  const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
  return { x: rock.x + x * rock.scale.x * c + z * rock.scale.z * s,
    z: rock.z - x * rock.scale.x * s + z * rock.scale.z * c };
}

test('version-one saved geology and its source remain exact while the route prefix is retained', () => {
  const base = createOceanGenerator(SEED), plan = createLivingRidgePlan(base, 14, 4), facade = createLivingRidgeGenerator(base);
  assert.equal(digest(plan), '53f89362ce3de698e14b7c90bb216a2aae67236cd8d348f41cef0ebdf4b107ea');
  assert.equal(validateLivingRidgePlan(plan, base), true); facade.registerRidgePlan(copy(plan));
  const source = facade.chunk(14, 4);
  assert.equal(digest(source), '967ef970ce9801e198e9235661389d4ec4a89d46c4cdafa4682819ca1bae7a1d');
  assert.equal(source.ridgeGeologyVersion, 1);
  assert.deepEqual(facade.routeStops.slice(0, 4), base.routeStops);
  assert.deepEqual(facade.routeStops[4], { id: 'ridge-gully', label: '礁脊岩沟', x: 928, z: 288 });
  assert.equal(facade.routeStops.length, 7);
  for (const [x,z] of [[928,288],[912.25,286.75],[-70.3,-66.2]])
    for (const field of ['sample','floorVertex','floorSurface','coverAt']) assert.deepEqual(facade[field](x,z),base[field](x,z));
  const invalid = copy(plan); invalid.corridor.openingM = 1;
  assert.equal(validateLivingRidgePlan(invalid, base), false);
  assert.equal(validateLivingRidgePlan({ ...plan, version: 3 }, base), false);
});

test('both mosaic themes use the existing readiness gate and same-center committed source replacement', t => {
  for (const sample of SAMPLES) {
    const { plan } = fixture(sample), ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
    assert.equal(plan.version, 2); assert.equal(plan.theme, sample.theme); assert.ok(plan.overview);
    assert.equal(validateLivingRidgePlan(plan, ocean.generator), true);
    ocean.update(position(sample)); assert.equal(ocean.stats.activeChunks, 0);
    ocean.generator.withRidgePlan(plan, () => {
      assert.equal(ocean.generator.isRidgeOwnerReady(plan.id), false);
      ocean._load(sample.cx, sample.cz); assert.equal(ocean._chunks.size, 0);
      assert.equal(ocean.generator.chunk(sample.cx, sample.cz).ridgeGeologyVersion, 2);
    });
    assert.equal(ocean.generator.ridgeRevision, 0);
    ocean.generator.registerLegacyRidgeOwner(plan.id); ocean.update(position(sample));
    const old = ocean._chunks.get(plan.id), disposed = disposalReceipt([old]);
    ocean.generator.registerRidgePlan(plan); assert.equal(ocean.update(position(sample)), true); disposed();
    const record = ocean._chunks.get(plan.id), chunk = ocean.generator.chunk(sample.cx, sample.cz), revision = ocean.generator.ridgeRevision;
    assert.notEqual(record, old); assert.equal(record.sourceChunk, chunk); assert.equal(record.ridgePlan, plan);
    assert.equal(chunk.ridgeGeologyVersion, 2); assert.equal(chunk.elements, plan.elements);
    for (const [kind, count] of Object.entries(chunk.counts)) assert.equal(record.elementCounts[kind], count);
    assert.equal(ocean.generator.registerRidgePlan(copy(plan)), false); assert.equal(ocean.generator.ridgeRevision, revision);
    assert.equal(ocean.update(position(sample)), false); assert.equal(ocean._chunks.get(plan.id), record);
    const invalid = copy(plan); invalid.overview.heading = NaN;
    assert.equal(validateLivingRidgePlan(invalid, ocean.generator), false);
    assert.throws(() => ocean.generator.registerRidgePlan(invalid), /Invalid/);
    assert.equal(ocean._chunks.get(plan.id), record);
  }
});

test('mosaic grass roots share real floor triangles and new mound instances share actual rock support', t => {
  let grassSamples = 0, rockSamples = 0;
  for (const sample of SAMPLES) {
    const { base, plan } = fixture(sample), ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
    ocean.generator.registerRidgePlan(plan); ocean.update(position(sample)); ocean.root.updateMatrixWorld(true);
    const record = ocean._chunks.get(plan.id), terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed');
    const originalIds = new Set(base.chunk(sample.cx, sample.cz).elements.map(e => e.id)), ray = new THREE.Raycaster();
    const grasses = plan.elements.filter(e => e.kind === 'seagrass'), meadow = record.instances.find(mesh => mesh.name === 'generated-seagrass');
    for (const oldGrass of base.chunk(sample.cx, sample.cz).elements.filter(e => e.kind === 'seagrass'))
      assert.deepEqual(grasses.find(e => e.id === oldGrass.id), oldGrass, 'previous plant references keep their complete source');
    if (sample.theme === 'meadow-edge') assert.ok(grasses.length > 0);
    assert.equal(Boolean(meadow), grasses.length > 0);
    if (meadow) {
      assert.equal(meadow.geometry.attributes.position, ocean._geometries.seagrass.attributes.position);
      assert.equal(meadow.geometry.attributes.rootXZ, ocean._geometries.seagrass.attributes.rootXZ);
    }
    for (const [index, grass] of grasses.entries()) {
      assert.ok(Math.abs(grass.y - base.floorSurface(grass.x, grass.z).height) < 1e-7);
      ray.set(new THREE.Vector3(grass.x, 10, grass.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
      assert.ok(Math.abs(hit.point.y - grass.y) < 2e-5);
      const expected = meadowInstanceData(ocean.generator, ocean._meadowWater, grass);
      for (let j = 0; j < 4; j++) assert.ok(Math.abs(meadow.geometry.attributes.meadowGround.array[index * 4 + j] - expected.ground[j]) < 1e-6);
      grassSamples++;
    }
    const newRocks = plan.elements.filter(e => e.kind === 'rock' && !originalIds.has(e.id));
    assert.ok(sample.theme === 'patch-reef' ? newRocks.length >= 3 : newRocks.length === 0);
    for (const rock of newRocks) {
      const batch = plan.elements.filter(e => e.kind === 'rock' && e.profile === rock.profile), instance = batch.findIndex(e => e.id === rock.id);
      const mesh = record.instances.find(mesh => mesh.name === `generated-rock-${rock.profile}`);
      assert.equal(mesh.geometry, ocean._geometries[`rock-${rock.profile}`]);
      for (const [x, z] of [[0, 0], [.12, -.08], [-.18, .09]]) {
        const point = world(rock, x, z);
        ray.set(new THREE.Vector3(point.x, 10, point.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false).find(hit => hit.instanceId === instance); assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - oceanRockHeight(rock, point.x, point.z)) < 2e-5); rockSamples++;
      }
    }
  }
  assert.ok(grassSamples >= 20); assert.ok(rockSamples >= 12);
});

test('saved mosaics restore, rebase and unload within the existing renderer and registry resource budgets', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const kit = ocean._geometries, positionAttribute = kit.seagrass.attributes.position, rootAttribute = kit.seagrass.attributes.rootXZ;
  let sharedDisposed = 0; kit.seagrass.addEventListener('dispose', () => sharedDisposed++);
  for (const sample of SAMPLES) {
    const { plan } = fixture(sample), restored = copy(plan);
    const ids = halo(sample.cx, sample.cz); ocean.generator.retainRidgeOwners(ids);
    for (const id of ids) ocean.generator.registerLegacyRidgeOwner(id);
    ocean.generator.registerRidgePlan(restored); ocean.update(position(sample));
    assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.ridgeReadyOwners, 25);
    assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls); assert.ok(ocean.stats.ownedMeadowGeometries <= 9);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9); assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
    const record = ocean._chunks.get(plan.id), matrices = record.instances.map(mesh => mesh.instanceMatrix.array.slice());
    assert.deepEqual(record.sourceChunk.elements, plan.elements); assert.equal(record.sourceChunk.ridgeGeologyVersion, 2);
    const loads = ocean.stats.loads; ocean.setRenderOrigin({ x: sample.cx * 64, z: sample.cz * 64 });
    assert.equal(ocean.stats.loads, loads); assert.equal(ocean._chunks.get(plan.id), record);
    record.instances.forEach((mesh, i) => assert.deepEqual(mesh.instanceMatrix.array, matrices[i]));
    assert.equal(record.group.position.x, 0); assert.equal(record.group.position.z, 0);
    ocean.root.updateMatrixWorld(true);
    const originals = new Set(ocean.generator.baseGenerator.chunk(sample.cx, sample.cz).elements.map(e => e.id));
    const rock = plan.elements.find(e => e.kind === 'rock' && !originals.has(e.id)) ?? plan.elements.find(e => e.kind === 'rock');
    const mesh = record.instances.find(mesh => mesh.name === `generated-rock-${rock.profile}`);
    const instance = plan.elements.filter(e => e.kind === 'rock' && e.profile === rock.profile).findIndex(e => e.id === rock.id);
    const ray = new THREE.Raycaster(new THREE.Vector3(rock.x - ocean.renderOrigin.x, 10, rock.z - ocean.renderOrigin.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(mesh, false).find(hit => hit.instanceId === instance); assert.ok(hit);
    assert.ok(Math.abs(hit.point.y - oceanRockHeight(rock, rock.x, rock.z)) < 2e-5);
    const disposed = disposalReceipt([...ocean._chunks.values()]);
    ocean.generator.retainRidgeOwners([]); assert.equal(ocean.update(position(sample)), true); disposed();
    assert.equal(ocean.stats.activeChunks, 0); assert.equal(ocean.stats.ridgeReadyOwners, 0);
    assert.equal(kit.seagrass.attributes.position, positionAttribute); assert.equal(kit.seagrass.attributes.rootXZ, rootAttribute); assert.equal(sharedDisposed, 0);
    assert.ok(ocean.generator.cacheStats().size <= 32);
  }
  ocean.dispose(); assert.equal(sharedDisposed, 1);
});
