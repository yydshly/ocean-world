import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgePlan } from '../src/livingRidgeGeology.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

const SEED = 'living-shallows-v1|42';
const POSITION = { x: 928, z: 288 };
const OWNER = '14,4';
const base = createOceanGenerator(SEED);
const plan = createLivingRidgePlan(base, 14, 4);
const savedPlan = () => JSON.parse(JSON.stringify(plan));
function idsAround(cx, cz, radius = 1) {
  const ids = [];
  for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++) ids.push(`${x},${z}`);
  return ids;
}
function readyLegacy(ocean, ids) { for (const id of ids) ocean.generator.registerLegacyRidgeOwner(id); }
function ownedResources(record) {
  return [record.terrainGeometry, record.footingGeometry, ...record.ownedGeometries,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry),
    ...record.instances].filter(Boolean);
}
function observeDisposal(resources) {
  const counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1, 'each owner-owned resource released once'); };
}

test('geology is opt-in and preserves both existing scene pipelines', t => {
  const ordinary = new OceanChunks(SEED), legacy = new OceanChunks('42', { livingGeology: true });
  t.after(() => { ordinary.dispose(); legacy.dispose(); });
  ordinary.update(POSITION); legacy.update(POSITION);
  assert.equal(ordinary.generator.baseGenerator, undefined);
  assert.equal(legacy.generator.baseGenerator, undefined);
  assert.equal(ordinary.stats.ridgeGeologyEnabled, undefined);
  assert.equal(ordinary.stats.activeChunks, 9); assert.equal(legacy.stats.activeChunks, 9);
  assert.deepEqual(ordinary.generator.chunk(14, 4), base.chunk(14, 4));
  assert.equal(ordinary._chunks.get(OWNER).ridgePlan, undefined);
  assert.equal(ordinary.update(POSITION), false);
});

test('unknown and provisional owners stay hidden until a formal saved-owner registration', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  ocean.update(POSITION);
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(ocean.stats.loads, 0);
  ocean.generator.withRidgePlan(plan, () => {
    assert.equal(ocean.generator.isRidgeOwnerReady(OWNER), false);
    ocean.update({ x: 929, z: 289 }); ocean._load(14, 4);
    assert.equal(ocean.stats.loads, 0); assert.equal(ocean._chunks.size, 0);
  });
  assert.equal(ocean.generator.ridgeRevision, 0);
  assert.equal(ocean.generator.registerLegacyRidgeOwner(OWNER), true);
  assert.equal(ocean.update(POSITION), true);
  const record = ocean._chunks.get(OWNER), stats = ocean._stats;
  assert.deepEqual(record.sourceChunk, base.chunk(14, 4)); assert.equal(record.ridgePlan, null);
  assert.equal(ocean.stats.ridgeReadyOwners, 1); assert.equal(ocean.stats.ridgePlanOwners, 0);
  assert.deepEqual(ocean.stats.ridgeReadyOwnerIds, [OWNER]); assert.deepEqual(ocean.stats.ridgeRenderedOwnerIds, [OWNER]);
  assert.equal(ocean.generator.registerLegacyRidgeOwner(OWNER), false);
  // LRU eviction of immutable base chunks does not mean a saved source changed.
  for (let x = 30; x < 70; x++) ocean.generator.chunk(x, 8);
  assert.equal(ocean.update(POSITION), false); assert.equal(ocean._chunks.get(OWNER), record); assert.equal(ocean._stats, stats);
  assert.ok(ocean.generator.cacheStats().size <= 32);
});

test('same-center committed plan replaces only its owner and releases its complete old render resources', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  readyLegacy(ocean, [OWNER, '15,4']); ocean.update(POSITION);
  const old = ocean._chunks.get(OWNER), neighbour = ocean._chunks.get('15,4');
  const disposed = observeDisposal(ownedResources(old));
  const shared = ocean._geometries.seagrass, position = shared.attributes.position, rootXZ = shared.attributes.rootXZ;
  let prototypeDisposals = 0; shared.addEventListener('dispose', () => prototypeDisposals++);
  const loads = ocean.stats.loads, unloads = ocean.stats.unloads;
  ocean.generator.registerRidgePlan(plan);
  assert.equal(ocean.update(POSITION), true); disposed();
  const fresh = ocean._chunks.get(OWNER);
  assert.notEqual(fresh, old); assert.equal(old.group.parent, null); assert.equal(old.group.children.length, 0);
  assert.equal(ocean._chunks.get('15,4'), neighbour);
  assert.equal(fresh.ridgePlan, plan); assert.equal(fresh.sourceChunk.ridgePlan, plan);
  assert.equal(ocean.stats.loads, loads + 1); assert.equal(ocean.stats.unloads, unloads + 1);
  assert.equal(shared.attributes.position, position); assert.equal(shared.attributes.rootXZ, rootXZ); assert.equal(prototypeDisposals, 0);
  assert.deepEqual(ocean.stats.ridgePlanOwnerIds, [OWNER]); assert.equal(ocean.stats.ridgeRenderedOwners, 2);
  assert.equal(ocean.generator.registerRidgePlan(savedPlan()), false, 'same saved content keeps authoritative source identity');
  assert.equal(ocean.update(POSITION), false); assert.equal(ocean._chunks.get(OWNER), fresh);
});

test('saved ridge rocks and attachments use existing metre batches and exact ray support through rebase and unregister', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const restored = savedPlan(); ocean.generator.registerRidgePlan(restored); ocean.update(POSITION);
  const record = ocean._chunks.get(OWNER), chunk = ocean.generator.chunk(14, 4);
  assert.equal(chunk.ridgePlan, restored);
  for (const [kind, count] of Object.entries(chunk.counts)) assert.equal(record.elementCounts[kind], count);
  assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
  assert.equal(ocean.stats.ridgeGenerationVersion, 1);
  const matrixBytes = record.instances.map(mesh => mesh.instanceMatrix.array.slice());
  const floor = ocean.generator.floorSurface(928, 288); assert.deepEqual(floor, base.floorSurface(928, 288));
  const ray = new THREE.Raycaster(); let samples = 0;
  for (const origin of [{ x: 0, z: 0 }, { x: 896, z: 256 }]) {
    ocean.setRenderOrigin(origin); ocean.root.updateMatrixWorld(true);
    for (const rock of chunk.elements.filter(e => plan.ridgeIds.includes(e.id))) {
      const mesh = record.instances.find(mesh => mesh.name === `generated-rock-${rock.profile}`);
      assert.equal(mesh.geometry, ocean._geometries[`rock-${rock.profile}`]); assert.equal(mesh.material, ocean._materials.rock);
      for (const [x, z] of [[0, 0], [.08, -.11], [-.13, .07], [.20, .10]]) {
        const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
        const wx = rock.x + x * rock.scale.x * c + z * rock.scale.z * s;
        const wz = rock.z - x * rock.scale.x * s + z * rock.scale.z * c;
        ray.set(new THREE.Vector3(wx - origin.x, 10, wz - origin.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - oceanRockHeight(rock, wx, wz)) < 2e-5); samples++;
      }
    }
    record.instances.forEach((mesh, i) => assert.deepEqual(mesh.instanceMatrix.array, matrixBytes[i]));
  }
  assert.equal(samples, 16);
  assert.equal(record.origin.x - ocean.renderOrigin.x, record.group.position.x);
  for (const coral of chunk.elements.filter(e => e.id.startsWith('living-ridge:') && e.kind === 'coral')) {
    const rock = chunk.elements.find(e => e.id === coral.attachmentId);
    assert.ok(Math.abs(coral.y - oceanRockHeight(rock, coral.x, coral.z)) < 1e-6);
    assert.ok(record.instances.some(mesh => mesh.name === `generated-coral-${coral.morphotype}`));
  }
  const disposed = observeDisposal(ownedResources(record));
  ocean.generator.unregisterRidgePlan(OWNER); ocean.update(POSITION); disposed();
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(ocean.stats.ridgeReadyOwners, 0);
  ocean.generator.registerLegacyRidgeOwner(OWNER); ocean.update(POSITION);
  assert.equal(ocean._chunks.get(OWNER).ridgePlan, null); assert.deepEqual(ocean._chunks.get(OWNER).sourceChunk.elements, base.chunk(14, 4).elements);
});

test('streamed ready owners and retained registry stay within nine render and twenty-five preflight owners', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const halo = idsAround(14, 4, 2); readyLegacy(ocean, halo); ocean.generator.registerRidgePlan(plan); ocean.update(POSITION);
  assert.equal(ocean.stats.ridgeReadyOwners, 25); assert.equal(ocean.stats.maxRidgeRegistryOwners, 25);
  assert.equal(ocean.stats.activeChunks, 9); assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
  assert.throws(() => ocean.generator.registerLegacyRidgeOwner('99,99'), /25-owner/);
  const oldRecords = [...ocean._chunks.values()], disposed = observeDisposal(oldRecords.flatMap(ownedResources));
  ocean.update({ x: 20 * 64 + 32, z: 4 * 64 + 32 }); disposed();
  assert.equal(ocean.stats.activeChunks, 0, 'new unknown window has no provisional original bodies');
  ocean.generator.retainRidgeOwners(idsAround(20, 4, 2));
  assert.equal(ocean.generator.registryStats().size, 0);
  readyLegacy(ocean, idsAround(20, 4, 2)); ocean.update({ x: 20 * 64 + 32, z: 4 * 64 + 32 });
  assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.ridgeReadyOwners, 25); assert.deepEqual(ocean.stats.ridgePlanOwnerIds, []);
  ocean.generator.retainRidgeOwners([]); ocean.update(POSITION);
  assert.equal(ocean.stats.activeChunks, 0);
  ocean.generator.registerRidgePlan(savedPlan()); ocean.update(POSITION);
  assert.deepEqual(ocean._chunks.get(OWNER).sourceChunk.elements, plan.elements);
  assert.equal(ocean.stats.activeChunks, 1); assert.ok(ocean.stats.ownedMeadowGeometries <= 9);
  assert.ok(ocean.stats.ownedOverlayGeometries <= 9); assert.ok(ocean.generator.cacheStats().size <= 32);
});

test('reset clears readiness while preserving the opt-in and borrowed shared meadow buffers until final disposal', t => {
  const borrowedMap = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: borrowedMap });
  const ocean = new OceanChunks(SEED, { sandMaterial: material, livingGeology: true });
  t.after(() => { ocean.dispose(); material.dispose(); borrowedMap.dispose(); });
  ocean.generator.registerRidgePlan(plan); ocean.update(POSITION);
  const record = ocean._chunks.get(OWNER), disposed = observeDisposal(ownedResources(record));
  const kit = ocean._geometries, prototypePosition = kit.seagrass.attributes.position, prototypeRootXZ = kit.seagrass.attributes.rootXZ;
  let kitDisposals = 0, mapDisposals = 0, terrainDisposals = 0;
  for (const geometry of Object.values(kit)) geometry.addEventListener('dispose', () => kitDisposals++);
  borrowedMap.addEventListener('dispose', () => mapDisposals++);
  ocean._terrainMaterial.addEventListener('dispose', () => terrainDisposals++);
  const oldGenerator = ocean.generator;
  ocean.reset(SEED); disposed();
  assert.notEqual(ocean.generator, oldGenerator); assert.equal(ocean.generator.registryStats().size, 0);
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(ocean._geometries, kit); assert.equal(kitDisposals, 0);
  assert.equal(kit.seagrass.attributes.position, prototypePosition); assert.equal(kit.seagrass.attributes.rootXZ, prototypeRootXZ);
  ocean.reset('42'); assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.ridgeGeologyEnabled, undefined);
  assert.equal(kitDisposals, 10);
  ocean.reset(SEED); assert.equal(ocean.stats.ridgeGeologyEnabled, true); assert.equal(ocean.stats.activeChunks, 0);
  readyLegacy(ocean, [OWNER]); ocean.update(POSITION); ocean.dispose(); ocean.dispose();
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(terrainDisposals, 1); assert.equal(mapDisposals, 0);
  assert.equal(ocean.update(POSITION), false); assert.equal(ocean.root.children.length, 0);
});
