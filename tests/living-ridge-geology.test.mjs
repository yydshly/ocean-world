import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { oceanRockHeight, oceanRockMesh } from '../src/oceanRockShape.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingRidgePlan, createLivingRidgeGenerator, validateLivingRidgePlan } from '../src/livingRidgeGeology.js';

const SEED = 'living-shallows-v1|string:42';
const fixture = () => {
  const base = createLivingShallowsGenerator(SEED), facade = createLivingRidgeGenerator(base);
  return { base, facade, plan: createLivingRidgePlan(base, 14, 4) };
};
function world(rock, x, z) {
  const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
  return { x: rock.x + x * rock.scale.x * c + z * rock.scale.z * s,
    z: rock.z - x * rock.scale.x * s + z * rock.scale.z * c };
}
function boundaryRock(e, bounds) {
  return Math.min(e.x - bounds.minX, bounds.maxX - e.x, e.z - bounds.minZ, bounds.maxZ - e.z) <= Math.hypot(e.scale.x, e.scale.z) * .5 + 6;
}
function insideBox(e, bounds) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  const x = .5 * (Math.abs(c) * e.scale.x + Math.abs(s) * e.scale.z), z = .5 * (Math.abs(s) * e.scale.x + Math.abs(c) * e.scale.z);
  return e.x - x >= bounds.minX + 6 && e.x + x <= bounds.maxX - 6 && e.z - z >= bounds.minZ + 6 && e.z + z <= bounds.maxZ - 6;
}

test('one-owner plan is deterministic, seed-specific and leaves all unregistered base descriptors and floor functions exact', () => {
  const base = createLivingShallowsGenerator(SEED), original = JSON.stringify(base.chunk(14, 4));
  const plan = createLivingRidgePlan(base, 14, 4), again = createLivingRidgePlan(base, 14, 4), facade = createLivingRidgeGenerator(base);
  assert.equal(JSON.stringify(plan), JSON.stringify(again)); assert.equal(JSON.stringify(base.chunk(14, 4)), original);
  assert.equal(facade.chunk(14, 4), base.chunk(14, 4)); assert.equal(facade.isRidgeOwnerReady('14,4'), false);
  for (const key of ['seed', 'profile', 'rockProfiles']) assert.equal(facade[key], base[key]);
  for (const [x,z] of [[928,288],[912.25,286.75],[-70.3,-66.2]])
    for (const key of ['sample','floorVertex','floorSurface','coverAt']) assert.deepEqual(facade[key](x,z),base[key](x,z));
  assert.equal(base.routeStops.length, 4); assert.ok(facade.routeStops.length >= 5);
  assert.deepEqual(facade.routeStops.slice(0,4), base.routeStops); assert.equal(facade.routeStops[4].x, 928);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.elements)); assert.ok(validateLivingRidgePlan(plan, base));
  const other = createLivingShallowsGenerator('living-shallows-v1|string:73'), otherPlan = createLivingRidgePlan(other, 14, 4);
  assert.ok(validateLivingRidgePlan(otherPlan, other)); assert.notEqual(JSON.stringify(plan.corridor), JSON.stringify(otherPlan.corridor));
});

test('all old boundary hosts and their attachments stay byte exact while every new footprint retreats six metres', () => {
  const { base, plan } = fixture(), chunk = base.chunk(14, 4), originals = new Map(chunk.elements.map(e => [e.id, e]));
  const retained = chunk.elements.filter(e => e.kind === 'rock' && boundaryRock(e, chunk.bounds));
  assert.equal(retained.length, 5); assert.deepEqual(plan.retainedRockIds, retained.map(e => e.id));
  for (const rock of retained) for (const e of chunk.elements.filter(e => e.id === rock.id || e.attachmentId === rock.id))
    assert.equal(JSON.stringify(plan.elements.find(p => p.id === e.id)), JSON.stringify(e));
  for (const e of plan.elements.filter(e => !originals.has(e.id))) assert.ok(insideBox(e, chunk.bounds), e.id);
  const ridges = plan.elements.filter(e => plan.ridgeIds.includes(e.id)); assert.equal(ridges.length, 2);
  assert.ok(ridges.every(r => ['natural-b', 'natural-c'].includes(r.profile) && r.scale.x >= 38 && r.scale.x <= 40 && r.scale.y >= 4 && r.scale.y <= 7));
  assert.ok(plan.corridor.openingM >= 8 && plan.corridor.openingM <= 14);
});

test('new ridge support and attached roots share the actual existing Float32 triangles used by a rendered mesh', () => {
  const { base, facade, plan } = fixture(); facade.registerRidgePlan(plan);
  const ridges = plan.elements.filter(e => plan.ridgeIds.includes(e.id)), ray = new THREE.Raycaster(); let samples = 0;
  for (const rock of ridges) {
    const data = oceanRockMesh(rock.profile), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(rock.x, rock.y, rock.z); mesh.rotation.y = rock.rotation; mesh.scale.set(rock.scale.x, rock.scale.y, rock.scale.z); mesh.updateMatrixWorld(true);
    try {
      for (const [x, z] of [[0, 0], [.10, -.08], [-.20, .10], [.28, -.06]]) {
        const p = world(rock, x, z), expected = oceanRockHeight(rock, p.x, p.z);
        ray.set(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObject(mesh, false)[0];
        assert.ok(hit); assert.ok(Math.abs(hit.point.y - expected) < 2e-5); samples++;
      }
      for (const e of plan.elements.filter(e => e.attachmentId === rock.id)) {
        assert.ok(Math.abs(oceanRockHeight(rock, e.x, e.z) - e.y) < 1e-6);
        assert.ok(Math.abs(oceanSupportHeight(facade, e.x, e.z) - e.y) < 1e-6);
      }
    } finally { geometry.dispose(); material.dispose(); }
  }
  assert.equal(samples, 8);
});

test('the open gully remains original floor and new rocks cannot grow under retained meadow or rubble roots', () => {
  const { base, facade, plan } = fixture(); facade.registerRidgePlan(plan); const { center, heading, lengthM, openingM } = plan.corridor;
  let clear = 0;
  for (const along of [-.32, -.16, 0, .16, .32]) for (const across of [-.30, 0, .30]) {
    const x = center.x + along * lengthM * Math.cos(heading) + across * openingM * Math.sin(heading);
    const z = center.z - along * lengthM * Math.sin(heading) + across * openingM * Math.cos(heading);
    assert.deepEqual(facade.floorSurface(x, z), base.floorSurface(x, z));
    if (oceanSupportHeight(facade, x, z) <= base.floorSurface(x, z).height + .04) clear++;
  }
  assert.equal(clear, 15); assert.equal(plan.corridor.clearSamples, clear);
  const newRocks = plan.elements.filter(e => plan.ridgeIds.includes(e.id));
  for (const e of plan.elements.filter(e => ['seagrass', 'rubble'].includes(e.kind))) {
    const radius = Math.max(e.scale.x, e.scale.z) * .5;
    for (let i = 0; i < 9; i++) {
      const x = e.x + (i ? Math.cos((i - 1) * Math.PI / 4) * radius : 0), z = e.z + (i ? Math.sin((i - 1) * Math.PI / 4) * radius : 0);
      for (const rock of newRocks) assert.ok((oceanRockHeight(rock, x, z) ?? -Infinity) <= base.floorSurface(x, z).height + .035);
    }
  }
  for (const coordinate of [895.5, 896, 960, 960.5]) for (const z of [260, 288, 316])
    assert.equal(oceanSupportHeight(facade, coordinate, z), oceanSupportHeight(base, coordinate, z), 'old adjacent support stays exact');
});

test('record validation rejects seed, base, retained-host, footprint, root, ID and type corruption', () => {
  const { base, plan } = fixture();
  const reject = mutate => { const next = structuredClone(plan); mutate(next); assert.equal(validateLivingRidgePlan(next, base), false); };
  reject(p => p.seed = 'living-shallows-v1|string:99'); reject(p => p.baseStamp += 'changed');
  reject(p => p.elements.push(structuredClone(p.elements[0])));
  reject(p => p.elements = p.elements.filter(e => e.id !== p.retainedRockIds[0]));
  reject(p => p.elements.find(e => e.id === p.ridgeIds[0]).x = 897);
  reject(p => p.elements.find(e => e.id === p.ridgeIds[0]).profile = 'fake-ridge');
  reject(p => p.elements.find(e => e.attachmentId === p.ridgeIds[0] && e.kind === 'coral').y += .2);
  reject(p => p.elements.find(e => e.kind === 'rubble').kind = 'food');
  reject(p => p.corridor.openingM = 1);
});

test('temporary candidate queries never activate owners or alter revision and restore previous source after success or failure', () => {
  const { facade, plan } = fixture(); const original = facade.chunk(14, 4);
  assert.equal(facade.ridgeRevision, 0);
  facade.withRidgePlan(plan, generator => {
    assert.equal(generator.chunk(14, 4).ridgePlan, plan); assert.equal(generator.isRidgeOwnerReady('14,4'), false);
    assert.equal(generator.ridgeRevision, 0); assert.equal(generator.registryStats().size, 0);
  });
  assert.equal(facade.chunk(14, 4), original); assert.equal(facade.getRidgePlan('14,4'), undefined);
  assert.throws(() => facade.withRidgePlan(plan, () => { throw new Error('candidate failed'); }), /candidate failed/);
  assert.equal(facade.chunk(14, 4), original); assert.equal(facade.ridgeRevision, 0);
  assert.throws(() => facade.withRidgePlan(plan, async () => 1), /synchronous/);
  assert.throws(() => facade.withRidgePlan(plan, () => Promise.resolve(1)), /asynchronous/);
  facade.registerRidgePlan(plan); const committed = facade.chunk(14, 4), revision = facade.ridgeRevision;
  assert.equal(facade.isRidgeOwnerReady('14,4'), true); assert.equal(facade.registerRidgePlan(structuredClone(plan)), false);
  assert.equal(facade.chunk(14, 4), committed); assert.equal(facade.ridgeRevision, revision);
  facade.withRidgePlan(structuredClone(plan), generator => assert.notEqual(generator.chunk(14, 4), committed));
  assert.equal(facade.chunk(14, 4), committed); assert.equal(facade.ridgeRevision, revision);
  assert.equal(facade.unregisterRidgePlan('14,4'), true); assert.equal(facade.isRidgeOwnerReady('14,4'), false);
  assert.equal(facade.chunk(14, 4), original);
});

test('legacy readiness and registered plan owners share a bounded halo with deterministic negative-owner restoration', () => {
  const { base, facade, plan } = fixture(); facade.registerRidgePlan(plan);
  for (let i = 0; i < 24; i++) assert.equal(facade.registerLegacyRidgeOwner(`${i},-2`), true);
  assert.equal(facade.registryStats().size, 25); assert.equal(facade.registryStats().limit, 25);
  const revision = facade.ridgeRevision; assert.equal(facade.registerLegacyRidgeOwner('0,-2'), false); assert.equal(facade.ridgeRevision, revision);
  assert.throws(() => facade.registerLegacyRidgeOwner('99,99'), /25-owner/);
  assert.deepEqual(facade.registryStats().ridgePlanOwnerIds, ['14,4']);
  assert.equal(facade.retainRidgeOwners(['14,4']), 24); assert.equal(facade.registryStats().size, 1);
  const negative = createLivingRidgePlan(base, -1, -1); assert.ok(validateLivingRidgePlan(negative, base));
  facade.registerRidgePlan(negative); const source = JSON.stringify(facade.chunk(-1, -1));
  facade.retainRidgeOwners(['14,4']); assert.equal(facade.isRidgeOwnerReady('-1,-1'), false);
  for (let i = 0; i < 40; i++) base.chunk(100 + i, -100 - i);
  facade.registerRidgePlan(structuredClone(negative)); assert.equal(JSON.stringify(facade.chunk(-1, -1)), source);
  assert.ok(base.cacheStats().size <= 32); assert.equal(facade.registryStats().size, 2);
});
