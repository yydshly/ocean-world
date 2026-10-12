import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shallowLiveReefGeometries, shallowReefRubbleGeometry } from '../src/world/ShallowLiveReefAssets.js';
import { createShallowSample } from '../src/shallowSample.js';
import { ShallowSampleScene } from '../src/world/ShallowSampleScene.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

test('whole live crown family keeps actual physical envelope and finite shaded vertices at both LODs', () => {
  const near = shallowLiveReefGeometries(), far = shallowLiveReefGeometries('distant');
  try {
    assert.deepEqual(Object.keys(near).sort(), ['branching-0', 'branching-1', 'fan-0', 'massive-0', 'massive-1', 'table-0', 'table-1']);
    for (const [id, geometry] of [...Object.entries(near), ...Object.entries(far)]) {
      const p = geometry.attributes.position, color = geometry.attributes.color, normal = geometry.attributes.normal;
      assert.ok(geometry.index.count / 3 <= 4000, `${id} needs an unexpected expensive crown`);
      assert.ok(geometry.userData.rootRadius > 0 && geometry.userData.rootRadius <= .5);
      assert.equal(geometry.userData.role, 'living-colony-display-not-biomass');
      for (let i = 0; i < p.count; i++) {
        assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
        assert.ok(p.getY(i) >= -1e-7 && p.getY(i) <= 1 + 1e-7);
        assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= .5);
        assert.ok([normal.getX(i), normal.getY(i), normal.getZ(i)].every(Number.isFinite));
        assert.ok([color.getX(i), color.getY(i), color.getZ(i)].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
      }
    }
    for (const id of Object.keys(near)) assert.ok(far[id].index.count < near[id].index.count, `${id} distant LOD is not cheaper`);
  } finally { Object.values(near).forEach(g => g.dispose()); Object.values(far).forEach(g => g.dispose()); }
});

test('closed massive crowns face outward and separate fan plane from volumetric hard colony', () => {
  const family = shallowLiveReefGeometries();
  try {
    for (const id of ['massive-0', 'massive-1']) {
      const g = family[id], p = g.attributes.position, n = g.attributes.normal;
      let valid = 0, out = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < .08 || p.getY(i) > .95) continue;
        valid++; if (p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i) > 0) out++;
      }
      assert.ok(out / valid > .97, `${id} crown normals point into the living-display envelope`);
    }
    const fan = family['fan-0'].boundingBox.getSize(new THREE.Vector3()), massive = family['massive-0'].boundingBox.getSize(new THREE.Vector3());
    assert.ok(fan.z / fan.x < .35, 'sea fan ceased being a flat branching canopy');
    assert.ok(massive.z / massive.x > .75, 'massive coral became a flattened sheet');
    assert.ok(family['massive-0'].userData.rootRadius > .45, 'broad massive contact cannot be silently labeled a narrow stem');
    assert.ok(family['table-0'].userData.rootRadius < .15);
  } finally { Object.values(family).forEach(g => g.dispose()); }
});

test('new shared rubble has actual angular fragments and stays floor-rooted in its envelope', () => {
  const g = shallowReefRubbleGeometry();
  try {
    const p = g.attributes.position;
    assert.equal(g.userData.pieceCount, 5); assert.ok(g.index.count / 3 < 300);
    assert.equal(g.userData.role, 'reef-skeleton-rubble-display-not-biomass');
    assert.ok(g.boundingBox.min.y === 0 && g.boundingBox.max.y === 1);
    for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= .5 && p.getY(i) >= 0 && p.getY(i) <= 1);
  } finally { g.dispose(); }
});

test('integrated seed55 living crowns support both actual LODs and reserve their complete displayed envelopes', () => {
  const model = createShallowSample(55), world = new ShallowSampleScene(55);
  const matrix = new THREE.Matrix4(), transform = new THREE.Matrix4(), point = new THREE.Vector3(), root = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), renderedUp = new THREE.Vector3();
  const rocks = new Map(model.rocks.map(r => [r.id, r])), colonies = new Map(model.corals.map(c => [`${c.host}/${c.x}/${c.z}`, c]));
  const failures = [], record = (condition, message) => { if (!condition && failures.length < 20) failures.push(message); };
  // instanceMatrix is Float32: this tolerance is solely matrix round-off in
  // world metres, not an additional physical burial allowance.
  const matrixEpsilon = 6e-6;
  let checkedColonies = 0, checkedVertices = 0;
  try {
    assert.deepEqual(world.model.corals, model.corals, 'standalone sample and rendered scene choose different crown placements');
    world.scene.updateMatrixWorld(true);
    for (const batch of world.coralBatches) {
      assert.equal(batch.visibility.matrices.length, batch.rows.length, 'live-crown batch lost its authored row/instance correspondence');
      // Inspect every authored near/far instance, including those outside the
      // current camera. Culling must never reduce physical validation coverage.
      for (let i = 0; i < batch.rows.length; i++) {
        const row = batch.rows[i], id = `${row.host}/${row.x}/${row.z}`, c = colonies.get(id), host = rocks.get(row.host);
        assert.ok(c && host, `rendered colony has no physical host: ${id}`);
        matrix.copy(batch.visibility.matrices[i]); transform.multiplyMatrices(batch.mesh.matrixWorld, matrix);
        root.set(0, 0, 0).applyMatrix4(transform);
        record(root.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) <= matrixEpsilon, `${id}: rendered basal root differs from physical root`);
        record(Math.abs(c.y - oceanRockHeight(host, c.x, c.z)) <= 1e-7, `${id}: physical root is not its actual host triangle height`);
        record(Math.abs(root.y - oceanRockHeight(host, root.x, root.z)) <= matrixEpsilon * 2, `${id}: displayed basal root moved off the host`);
        assert.ok(Array.isArray(c.supportNormal) && c.supportNormal.length === 3, `${id}: support normal missing`);
        const support = new THREE.Vector3().fromArray(c.supportNormal);
        const minimumUp=c.form==='table'?.45:.78;
        record(Math.abs(support.length() - 1) < 1e-7 && support.y >= minimumUp, `${id}: invalid support normal for this attachment form`);
        renderedUp.copy(up).transformDirection(transform);
        record(renderedUp.distanceTo(support) < 1e-6, `${id}: rendered crown tilt differs from physical support normal`);
        record(Number.isFinite(c.radius) && Number.isFinite(c.clearanceHeight), `${id}: physical display envelope is missing`);
        for (const geometry of [batch.nearGeometry, batch.farGeometry]) {
        const p = geometry.attributes.position;
        for (let vertex = 0; vertex < p.count; vertex++) {
          const basal = p.getY(vertex) <= .18, allowedBurial = basal ? .025 : .001;
          point.fromBufferAttribute(p, vertex).applyMatrix4(transform);
          const surface = model.surface(point.x, point.z), penetration = surface - point.y;
          record(penetration <= allowedBurial + matrixEpsilon, `${id}: vertex${vertex} localY=${p.getY(vertex).toFixed(5)} penetrates actual substrate by ${penetration.toFixed(6)}m (allowed ${allowedBurial}m)`);
          record(Math.hypot(point.x - c.x, point.z - c.z) <= c.radius + matrixEpsilon, `${id}: vertex${vertex} leaves reserved horizontal radius`);
          record(point.y - c.y <= c.clearanceHeight + matrixEpsilon, `${id}: vertex${vertex} exceeds reserved top height`);
          checkedVertices++;
        }
        }
        checkedColonies++;
      }
    }
    assert.equal(checkedColonies, model.corals.length, 'some physical live crowns were never checked as actual render instances');
    assert.ok(checkedVertices > 100000, 'integration check did not traverse the whole actual crown family');
    assert.deepEqual(failures, [], `whole living-cover fit failed:\n${failures.join('\n')}`);
  } finally { world.dispose(); }
});
