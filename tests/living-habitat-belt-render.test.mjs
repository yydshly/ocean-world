import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createLivingHabitatBeltPlans } from '../src/livingHabitatBelt.js';
import { createLivingSeascapePlans } from '../src/livingSeascape.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { meadowInstanceData } from '../src/world/livingMeadowEnvironment.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

// CPU execution of shipped Three.js meshes and their actual triangles. These
// checks do not attest to browser playback or whole-scene visual acceptance.
const SEED = 'living-shallows-v1|string:42';
const BELT = { cx: 74, cz: 2 };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const position = ({ cx, cz }) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
function fixture(t) {
  const ocean = new OceanChunks(SEED, { livingGeology: true });
  t.after(() => ocean.dispose());
  const plans = createLivingHabitatBeltPlans(ocean.generator.baseGenerator, BELT.cx, BELT.cz);
  return { ocean, plans, base: ocean.generator.baseGenerator };
}
function disposalReceipt(records) {
  const resources = new Set(records.flatMap(record => [record.terrainGeometry, record.footingGeometry,
    ...record.ownedGeometries, ...record.instances,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry)]).filter(Boolean));
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1, 'each owner resource releases once'); };
}
function rockBatch(record, plan, rock) {
  const mesh = record.instances.find(mesh => mesh.name === `generated-rock-${rock.profile}`);
  const instanceId = plan.elements.filter(element => element.kind === 'rock' && element.profile === rock.profile)
    .findIndex(element => element.id === rock.id);
  assert.ok(mesh); assert.ok(instanceId >= 0);
  return { mesh, instanceId };
}
function rockPoint(rock, x, z) {
  const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
  return { x: rock.x + x * rock.scale.x * c + z * rock.scale.z * s,
    z: rock.z - x * rock.scale.x * s + z * rock.scale.z * c };
}
function rockHit(ocean, record, plan, rock, point) {
  const { mesh, instanceId } = rockBatch(record, plan, rock);
  const ray = new THREE.Raycaster(new THREE.Vector3(point.x - ocean.renderOrigin.x, 20,
    point.z - ocean.renderOrigin.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(mesh, false).find(hit => hit.instanceId === instanceId);
  assert.ok(hit, `actual instance ${rock.id} provides triangle support`);
  assert.ok(Math.abs(hit.point.y - oceanRockHeight(rock, point.x, point.z)) < 2e-5);
  return hit;
}

test('a complete committed belt renders four real sources through the existing readiness gate', t => {
  const { ocean, plans } = fixture(t), at = position(BELT), generator = ocean.generator;
  assert.equal(plans.length, 4);
  ocean.update(at); assert.equal(ocean.stats.activeChunks, 0);
  generator.withRidgePlans(plans, () => {
    for (const plan of plans) {
      assert.equal(generator.isRidgeOwnerReady(plan.id), false);
      ocean._load(plan.cx, plan.cz);
    }
    assert.equal(ocean._chunks.size, 0); assert.equal(generator.ridgeRevision, 0);
  });
  assert.throws(() => generator.registerRidgePlans(plans.slice(0, 3)), /all four/);
  assert.equal(generator.ridgeRevision, 0); assert.equal(ocean._chunks.size, 0);
  assert.equal(generator.registerRidgePlans(plans), true); assert.equal(generator.ridgeRevision, 1);
  ocean.update(at); assert.equal(ocean.stats.activeChunks, 4);
  for (const plan of plans) {
    const record = ocean._chunks.get(plan.id), source = generator.chunk(plan.cx, plan.cz);
    assert.equal(record.ridgePlan, plan); assert.equal(record.sourceChunk, source);
    assert.equal(source.ridgeGeologyVersion, 5); assert.equal(source.elements, plan.elements);
    for (const [kind, count] of Object.entries(source.counts)) assert.equal(record.elementCounts[kind], count);
    for (const mesh of record.instances) {
      const kind = mesh.userData.landscapeKind;
      const elements = plan.elements.filter(element => element.kind === kind &&
        (kind !== 'rock' || mesh.name === `generated-rock-${element.profile}`) &&
        (kind !== 'coral' || mesh.userData.morphotype === element.morphotype));
      assert.equal(mesh.count, elements.length);
      for (const [index, element] of elements.entries()) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        const actual = new THREE.Vector3().setFromMatrixPosition(matrix);
        assert.ok(Math.abs(actual.x - (element.x - source.origin.x)) < 2e-5);
        assert.ok(Math.abs(actual.y - element.y) < 2e-5);
        assert.ok(Math.abs(actual.z - (element.z - source.origin.z)) < 2e-5);
      }
    }
  }
  assert.equal(generator.registerRidgePlans(copy(plans)), false);
  assert.equal(generator.ridgeRevision, 1); assert.equal(ocean.update(at), false);
});

test('belt reef colonies and added meadow roots use real rock and unchanged floor triangles', t => {
  const { ocean, plans, base } = fixture(t);
  ocean.generator.registerRidgePlans(plans); ocean.update(position(BELT));
  ocean.root.updateMatrixWorld(true);
  let addedRocks = 0, addedGrasses = 0, attachedColonies = 0;
  for (const plan of plans) {
    const record = ocean._chunks.get(plan.id), original = base.chunk(plan.cx, plan.cz);
    const ids = new Set(original.elements.map(element => element.id));
    const terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed');
    const positions = record.terrainGeometry.attributes.position;
    for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++)
      assert.equal(positions.getY(z * 65 + x), base.floorVertex(plan.cx * 64 + x, plan.cz * 64 + z));
    const grasses = plan.elements.filter(element => element.kind === 'seagrass');
    const meadow = record.instances.find(mesh => mesh.name === 'generated-seagrass');
    for (const old of original.elements.filter(element => ['seagrass', 'driftwood', 'bottle'].includes(element.kind)))
      assert.deepEqual(plan.elements.find(element => element.id === old.id), old);
    for (const [index, grass] of grasses.entries()) {
      if (ids.has(grass.id)) continue;
      assert.ok(meadow);
      const ray = new THREE.Raycaster(new THREE.Vector3(grass.x, 20, grass.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
      assert.ok(Math.abs(hit.point.y - grass.y) < 2e-5);
      const data = meadowInstanceData(ocean.generator, ocean._meadowWater, grass);
      for (let component = 0; component < 4; component++)
        assert.ok(Math.abs(meadow.geometry.attributes.meadowGround.array[index * 4 + component] - data.ground[component]) < 1e-6);
      addedGrasses++;
    }
    const rocks = plan.elements.filter(element => element.kind === 'rock' && !ids.has(element.id));
    for (const rock of rocks) {
      assert.equal(rockBatch(record, plan, rock).mesh.geometry, ocean._geometries[`rock-${rock.profile}`]);
      for (const [x, z] of [[0, 0], [.12, -.08], [-.18, .09]]) rockHit(ocean, record, plan, rock, rockPoint(rock, x, z));
      addedRocks++;
    }
    for (const coral of plan.elements.filter(element => element.kind === 'coral' && !ids.has(element.id))) {
      const host = plan.elements.find(element => element.id === coral.attachmentId);
      assert.ok(host); const hit = rockHit(ocean, record, plan, host, coral);
      assert.ok(Math.abs(hit.point.y - coral.y) < 2e-5); attachedColonies++;
    }
  }
  assert.ok(addedRocks >= 3, 'whole belt contains added reef mounds');
  assert.ok(addedGrasses >= 16, 'whole belt contains an added sediment meadow');
  assert.ok(attachedColonies >= 3, 'whole belt uses attached coral forms rather than floating decoration');
});

test('belt rebase, unload and saved-plan restore keep bounded resources and exact instance matrices', t => {
  const { ocean, plans } = fixture(t), generator = ocean.generator, at = position(BELT);
  const shared = ocean._geometries.seagrass, rootXZ = shared.attributes.rootXZ, vertices = shared.attributes.position;
  let sharedDisposals = 0; shared.addEventListener('dispose', () => sharedDisposals++);
  const halo = [];
  for (let z = BELT.cz - 2; z <= BELT.cz + 2; z++) for (let x = BELT.cx - 2; x <= BELT.cx + 2; x++) halo.push(`${x},${z}`);
  for (const id of halo) generator.registerLegacyRidgeOwner(id);
  generator.registerRidgePlans(plans); ocean.update(at);
  assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.ridgeReadyOwners, 25);
  const snapshots = plans.map(plan => ({ id: plan.id, source: digest(ocean._chunks.get(plan.id).sourceChunk),
    terrain: ocean._chunks.get(plan.id).terrainGeometry.attributes.position.array.slice(),
    matrices: ocean._chunks.get(plan.id).instances.map(mesh => mesh.instanceMatrix.array.slice()) }));
  const loads = ocean.stats.loads;
  ocean.setRenderOrigin({ x: BELT.cx * 64, z: BELT.cz * 64 }); ocean.root.updateMatrixWorld(true);
  assert.equal(ocean.stats.loads, loads);
  for (const snapshot of snapshots) {
    const record = ocean._chunks.get(snapshot.id);
    record.instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, snapshot.matrices[index]));
  }
  const plan = plans.find(plan => plan.elements.some(element => element.kind === 'rock'));
  const rock = plan.elements.find(element => element.kind === 'rock');
  rockHit(ocean, ocean._chunks.get(plan.id), plan, rock, rock);
  const disposed = disposalReceipt([...ocean._chunks.values()]);
  generator.retainRidgeOwners([]); ocean.update(at); disposed();
  assert.equal(ocean.stats.activeChunks, 0); assert.equal(sharedDisposals, 0);
  assert.equal(shared.attributes.rootXZ, rootXZ); assert.equal(shared.attributes.position, vertices);
  for (const id of halo) generator.registerLegacyRidgeOwner(id);
  generator.registerRidgePlans(copy(plans)); ocean.update(at);
  for (const snapshot of snapshots) {
    const record = ocean._chunks.get(snapshot.id);
    assert.equal(digest(record.sourceChunk), snapshot.source);
    assert.deepEqual(record.terrainGeometry.attributes.position.array, snapshot.terrain);
    record.instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, snapshot.matrices[index]));
  }
  assert.equal(ocean.stats.activeChunks, 9); assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
  assert.ok(ocean.stats.ownedMeadowGeometries <= 9); assert.ok(ocean.stats.ownedOverlayGeometries <= 9);
  assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
  assert.ok(generator.cacheStats().size <= 32);
  ocean.dispose(); assert.equal(sharedDisposals, 1);
});

test('v5 integration keeps saved v4 sources, terrain and actual instances byte-identical', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const plans = createLivingSeascapePlans(ocean.generator.baseGenerator, 54, 8);
  const golden = [
    ['504f807de652bd5de4ccbd09f548ea17bc8ca35b74fdf3817fe9c77df95dcb02', 'e86306aa1d523e09c27ebb96f333fa75cdfef0bd5fc63d80bb882d86eb058131', '9e1129f278f977b0dbc0eedff0bcebdaba1c2a6b9b8136deff9deeeede1d09bb', 'ada1c331afd0e5b84ad781f7ebd21a8e469a18d6e1f0b9546b5ef9cecedca107'],
    ['2526e52693ce8e11aaab7a8a065e7a82cd0763d13c7c1c594a065338fbf223a8', 'cd2dbd6c51b21d53d907f4043dd24ad26bc67ed8cf32286d4d15f59e4b7dbe93', 'bb4d1abb86d62d4ced36bca0e4ce249ef7a2ab962db1119eb8947fd09bd3298d', '3d1483d5a1a8c6597e3cd0f12ec38f31b57f196eaf582b526ea84fdda0b2b544'],
    ['324c637f3e04982eafd0f073275ee522e27f1076355f3be5c03ad0621e363525', 'f7bfb1b1f20921935a7ca6e2878aab5009c39104b94971ea3394f21ce41c02f0', '7a66aeb0fab77aeb1270b12d195a493e960b55d85daabc81df4fc106e19369f2', 'e02ddfbe2c611f2cf5395787c5269e3326ed3fba02f508733605e3f6e99d4548'],
    ['3c125c92dcb4b14c0def7746b8549fc447a8da016ccdfb7346e6271a5adffac0', '9acbc3d44897018298f4dfb96b917d590ed68a55c6b0c0fe5d14ba8832aa05dc', '8636250389852b09a07f8740da8d9986fbd58797af2b9b1041d36a1f1d78b243', 'e99bbc4d6ab29fb315a171958800c2899046b3d541c361db73d42168e7a843a4'],
  ];
  ocean.generator.registerRidgePlans(copy(plans)); ocean.update({ x: 3488, z: 544 });
  for (const [index, plan] of plans.entries()) {
    const record = ocean._chunks.get(plan.id);
    assert.equal(digest(plan), golden[index][0]); assert.equal(digest(record.sourceChunk), golden[index][1]);
    assert.equal(digest(Array.from(record.terrainGeometry.attributes.position.array)), golden[index][2]);
    assert.equal(digest(record.instances.map(mesh => ({ name: mesh.name, mat: Array.from(mesh.instanceMatrix.array) }))), golden[index][3]);
  }
  assert.equal(ocean.generator.floorSurfaceVersion, 1);
});
