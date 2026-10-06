import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createLivingShallowSeascapePlans, shallowSeascapeFacies } from '../src/livingShallowSeascape.js';
import { createLivingHabitatBeltPlans } from '../src/livingHabitatBelt.js';
import { OceanChunks } from '../src/world/OceanChunks.js';

// Native Three geometry checks, not WebGL/browser whole-scene acceptance.
const SEED = 'living-shallows-v1|string:42', GROUP = { cx: 96, cz: 2 }, ROW = 65;
const copy = value => JSON.parse(JSON.stringify(value));
const at = (cx = GROUP.cx + 2, cz = GROUP.cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
function hash(geometry) {
  const h = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[name]; h.update(name); h.update(String(a.itemSize));
    h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  }
  if (geometry.index) h.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
  return h.digest('hex');
}
function fixture(t) {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const plans = createLivingShallowSeascapePlans(ocean.generator.baseGenerator, GROUP.cx, GROUP.cz);
  assert.equal(plans.length, 12); return { ocean, plans, generator: ocean.generator };
}
function haloExtras(plans, position) {
  const ids = new Set(plans.map(plan => plan.id)), output = [];
  const cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
  for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
    const id = `${x},${z}`; if (!ids.has(id)) output.push(id);
  }
  return output;
}
function publishWindow(ocean, plans, position) {
  ocean.generator.replaceRidgeOwners(plans, haloExtras(plans, position)); ocean.update(position);
  assert.equal(ocean.stats.activeChunks, 9); assert.ok(ocean.stats.ridgeReadyOwners <= 25);
  assert.ok(ocean.stats.drawCalls <= ocean.stats.maxDrawCalls);
  assert.equal(ocean.stats.maxDrawCalls, 117);
  assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
}
function disposalReceipt(records) {
  const resources = new Set(records.flatMap(record => [record.terrainGeometry, record.footingGeometry,
    ...record.ownedGeometries, ...record.instances,
    ...record.instances.filter(mesh => mesh.geometry.userData.meadowInstanceBuffers).map(mesh => mesh.geometry)]).filter(Boolean));
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => { for (const count of counts.values()) assert.equal(count, 1); };
}

test('a twelve-owner source stays private until publication and refreshes the unchanged camera window', t => {
  const { ocean, plans, generator } = fixture(t), position = at();
  ocean.update(position); assert.equal(ocean.stats.activeChunks, 0);
  generator.withShallowSeascapePlans(plans, () => {
    for (const plan of plans) { assert.equal(generator.isRidgeOwnerReady(plan.id), false); ocean._load(plan.cx, plan.cz); }
    assert.equal(ocean.stats.activeChunks, 0); assert.equal(generator.ridgeRevision, 0);
  });
  const ids = [];
  const cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
  for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) ids.push(`${x},${z}`);
  for (const id of ids) generator.registerLegacyRidgeOwner(id);
  ocean.update(position); assert.equal(ocean.stats.activeChunks, 9);
  const oldPlanRecords = [...ocean._chunks].filter(([id]) => plans.some(plan => plan.id === id)).map(([, record]) => record);
  const released = disposalReceipt(oldPlanRecords);
  const untouchedId = haloExtras(plans, position)[0], untouched = ocean._chunks.get(untouchedId);
  const revision = generator.ridgeRevision;
  assert.equal(generator.registerRidgePlans(plans), true); assert.equal(generator.ridgeRevision, revision + 1);
  assert.equal(ocean.update(position), true); released();
  assert.equal(ocean._chunks.get(untouchedId), untouched);
  const visible = [...ocean._chunks.values()].filter(record => record.ridgePlan?.version === 6);
  assert.ok(visible.length > 0); assert.equal(ocean.stats.completeShallowSeascapeOwners, visible.length);
  assert.equal(ocean.stats.activePlanVersions[6], visible.length);
  for (const record of visible) {
    const source = record.sourceChunk;
    assert.equal(source.ridgePlan, record.ridgePlan); assert.equal(source.elements, record.ridgePlan.elements);
    for (const [kind, count] of Object.entries(source.counts)) assert.equal(record.elementCounts[kind], count);
    for (const mesh of record.instances) {
      const kind = mesh.userData.landscapeKind;
      const rows = source.elements.filter(element => element.kind === kind &&
        (kind !== 'rock' || mesh.name === `generated-rock-${element.profile}`) &&
        (kind !== 'coral' || mesh.userData.morphotype === element.morphotype));
      assert.equal(mesh.count, rows.length, 'the scene uses real source rows, never extra renderer-only bodies');
      for (const [index, row] of rows.entries()) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        for (const [component, expected] of [[12, row.x - source.origin.x], [13, row.y], [14, row.z - source.origin.z]])
          assert.ok(Math.abs(matrix.elements[component] - expected) < 2e-5);
      }
    }
  }
  assert.equal(generator.registerRidgePlans(copy(plans)), false); assert.equal(ocean.update(position), false);
});

test('actual floor triangles and continuous facies meet across all twelve source owners', t => {
  const { ocean, plans, generator } = fixture(t), seen = new Set(), seams = new Set();
  let changedColours = 0, zeroInfluenceColours = 0, raySamples = 0, maximumRayError = 0;
  let modifiedFloorSamples = 0, preservedFloorSamples = 0;
  for (const cx of [GROUP.cx, GROUP.cx + 2, GROUP.cx + 4]) {
    publishWindow(ocean, plans, at(cx)); ocean.root.updateMatrixWorld(true);
    for (const [id, record] of ocean._chunks) {
      const plan = record.ridgePlan; if (plan?.version !== 6) continue;
      if (!seen.has(id)) {
        seen.add(id);
        const geometry = record.terrainGeometry, p = geometry.attributes.position, c = geometry.attributes.color;
        const withoutFacies = ocean._terrainGeometry({ ...record.sourceChunk, ridgePlan: null });
        try {
          for (const name of ['position', 'normal', 'uv']) assert.deepEqual(geometry.attributes[name].array, withoutFacies.attributes[name].array);
          assert.deepEqual(geometry.index.array, withoutFacies.index.array, 'facies colours cannot alter physical floor triangles');
          for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++) {
            const index = z * ROW + x, wx = plan.cx * 64 + x, wz = plan.cz * 64 + z;
            assert.equal(p.getY(index), plan.floorPatch.heights[index]);
            assert.equal(p.getY(index), generator.floorVertex(wx, wz));
            const facies = shallowSeascapeFacies(plan, wx, wz);
            for (let channel = 0; channel < 3; channel++) {
              const value = c.array[index * 3 + channel], old = withoutFacies.attributes.color.array[index * 3 + channel];
              assert.ok(Number.isFinite(value) && value > 0 && value < 1.2);
              if (facies.influence === 0) { assert.equal(value, old); zeroInfluenceColours++; }
              else if (Math.abs(value - old) > .001) changedColours++;
            }
          }
        } finally { withoutFacies.dispose(); }
        const terrain = record.group.children.find(mesh => mesh.name === 'sampled-seabed');
        for (const [x, z] of [[18.23, 20.37], [31.81, 32.12], [46.18, 42.39]]) {
          const wx = plan.cx * 64 + x, wz = plan.cz * 64 + z;
          const ray = new THREE.Raycaster(new THREE.Vector3(wx, 30, wz), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(terrain, false)[0]; assert.ok(hit);
          const surface = generator.floorSurface(wx, wz), error = Math.abs(hit.point.y - surface.height);
          assert.ok(error < 2e-5); maximumRayError = Math.max(maximumRayError, error); raySamples++;
          const ix = Math.floor(wx), iz = Math.floor(wz);
          const unchanged = [[ix, iz], [ix + 1, iz], [ix, iz + 1], [ix + 1, iz + 1]]
            .every(([x, z]) => generator.floorVertex(x, z) === generator.baseGenerator.floorVertex(x, z));
          if (unchanged) {
            // The protected original four-corner patch keeps its historical
            // analytic sample, which can differ slightly from its old mesh.
            assert.equal(generator.sample(wx, wz).floorY, generator.baseGenerator.sample(wx, wz).floorY);
            preservedFloorSamples++;
          } else { assert.equal(generator.sample(wx, wz).floorY, surface.height); modifiedFloorSamples++; }
        }
      }
      for (const axis of ['x', 'z']) {
        const neighbourId = axis === 'x' ? `${plan.cx + 1},${plan.cz}` : `${plan.cx},${plan.cz + 1}`;
        const neighbour = ocean._chunks.get(neighbourId);
        if (neighbour?.ridgePlan?.version !== 6) continue;
        const key = `${id}/${neighbourId}`; if (seams.has(key)) continue; seams.add(key);
        for (let offset = 0; offset < ROW; offset++) {
          const ia = axis === 'x' ? offset * ROW + 64 : 64 * ROW + offset;
          const ib = axis === 'x' ? offset * ROW : offset;
          for (const name of ['position', 'normal', 'color', 'uv']) {
            const a = record.terrainGeometry.attributes[name], b = neighbour.terrainGeometry.attributes[name];
            for (let component = 0; component < a.itemSize; component++) {
              let av = a.array[ia * a.itemSize + component], bv = b.array[ib * b.itemSize + component];
              if (name === 'position' && component === 0) { av += record.origin.x; bv += neighbour.origin.x; }
              if (name === 'position' && component === 2) { av += record.origin.z; bv += neighbour.origin.z; }
              assert.equal(av, bv, `${key}: actual ${name} seam`);
            }
          }
        }
      }
    }
  }
  assert.equal(seen.size, 12); assert.equal(seams.size, 16);
  assert.ok(changedColours > 1000); assert.ok(zeroInfluenceColours > 1000); assert.equal(raySamples, 36);
  assert.ok(modifiedFloorSamples > 0); assert.ok(preservedFloorSamples > 0);
  t.diagnostic(`actual owners=${seen.size}, seams=${seams.size}, floor rays=${raySamples}, maximum error=${maximumRayError}m; modified floor samples=${modifiedFloorSamples}, original protected samples=${preservedFloorSamples}; changed colour channels=${changedColours}, guarded exact channels=${zeroInfluenceColours}`);
});

test('independent pre-v6 terrain buffers remain exact for all four saved v5 owners', t => {
  const ocean = new OceanChunks(SEED, { livingGeology: true }); t.after(() => ocean.dispose());
  const plans = createLivingHabitatBeltPlans(ocean.generator.baseGenerator, 74, 2);
  ocean.generator.registerRidgePlans(plans); ocean.update(at(74, 2));
  // Captured before adding the v6 colour path, including actual normals, UVs,
  // colours, positions and triangle indices rather than just old plan JSON.
  const golden = {
    '74,2': 'f655278be23d47452753dadda21fd0b8bfed5784b31d068b4f5a05ff42ceee32',
    '75,2': 'd0691bf18e23523a5b0668ab9c3f4eedb4357ff6a485d989b0f96c178bf73024',
    '74,3': '67ceabd437ea7752dd235bf47541e1ecd3a8c0b16b154231f785b9e02c95531b',
    '75,3': '57049752e1f18b6ba802cb0d0ef48b09782acc8242468ea0f88910311ccd7ace',
  };
  for (const [id, expected] of Object.entries(golden)) assert.equal(hash(ocean._chunks.get(id).terrainGeometry), expected, id);
  assert.equal(ocean.stats.completeShallowSeascapeOwners, 0); assert.equal(ocean.stats.habitatBeltOwners, 4);
});

test('macro travel, floating origin, saved restore and disposal retain bounded shared resources', t => {
  const { ocean, plans, generator } = fixture(t), bytes = new Map();
  publishWindow(ocean, plans, at());
  const shared = [...Object.values(ocean._geometries), ...Object.values(ocean._materials)];
  const counts = new Map(shared.map(resource => [resource, 0]));
  for (const resource of shared) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  const beforeOrigin = [...ocean._chunks.values()].map(record => ({ record, terrain: hash(record.terrainGeometry),
    matrices: record.instances.map(mesh => mesh.instanceMatrix.array.slice()) }));
  const loads = ocean.stats.loads; ocean.setRenderOrigin({ x: 1e7, z: -1e7 });
  assert.equal(ocean.stats.loads, loads);
  for (const old of beforeOrigin) {
    assert.equal(hash(old.record.terrainGeometry), old.terrain);
    old.record.instances.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, old.matrices[index]));
  }
  ocean.setRenderOrigin({ x: 0, z: 0 });
  for (const cx of [GROUP.cx, GROUP.cx + 2, GROUP.cx + 4]) {
    publishWindow(ocean, plans, at(cx));
    for (const [id, record] of ocean._chunks) if (record.ridgePlan?.version === 6) bytes.set(id, hash(record.terrainGeometry));
  }
  assert.equal(bytes.size, 12);
  const released = disposalReceipt([...ocean._chunks.values()]); generator.retainRidgeOwners([]); ocean.update(at(GROUP.cx + 4));
  assert.equal(ocean.stats.activeChunks, 0); released(); assert.ok([...counts.values()].every(count => count === 0));
  for (const cx of [GROUP.cx, GROUP.cx + 2, GROUP.cx + 4]) {
    publishWindow(ocean, copy(plans), at(cx));
    for (const [id, record] of ocean._chunks) if (record.ridgePlan?.version === 6) assert.equal(hash(record.terrainGeometry), bytes.get(id));
    assert.ok(ocean.stats.ownedMeadowGeometries <= 9); assert.ok(ocean.stats.ownedOverlayGeometries <= 9);
  }
  ocean.dispose(); ocean.dispose(); assert.ok([...counts.values()].every(count => count === 1));
});
