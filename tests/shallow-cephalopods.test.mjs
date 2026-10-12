import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShallowCephalopodAssets, SHALLOW_CEPHALOPOD_IDS } from '../src/world/ShallowCephalopodAssets.js';

test('whole cephalopod family preserves catalogue measures, full animated footprint and single resource ownership', () => {
  const kit = new ShallowCephalopodAssets(), models = SHALLOW_CEPHALOPOD_IDS.map(id => kit.create(id));
  const resources = [...kit.resources], disposed = new Map(resources.map(r => [r, 0]));
  resources.forEach(r => r.addEventListener('dispose', () => disposed.set(r, disposed.get(r) + 1)));
  const point = new THREE.Vector3(), footprints = new Map();
  try {
    assert.equal(kit.create('abalone'), null, 'non-cephalopod is not a fish or cephalopod replacement');
    assert.equal(models[0].root.userData.sizeMeasure, 'mantle-length');
    assert.equal(models[1].root.userData.sizeMeasure, 'arm-envelope');
    for (const model of models) {
      assert.equal(kit.create(model.id), model, 'shared per-species template was rebuilt');
      assert.equal(model.root.userData.appendageCounts.arms, 8);
      assert.equal(model.root.userData.appendageCounts.feedingTentacles, model.kind === 1 ? 2 : 0);
      let triangles = 0; const materials = new Set();
      model.root.traverse(mesh => { if (!mesh.isMesh) return;
        triangles += mesh.geometry.index.count / 3; materials.add(mesh.material);
        assert.ok(mesh.geometry.attributes.color && mesh.geometry.attributes.normal, `${mesh.name} has no shaded vertex colours`);
      });
      assert.ok(triangles <= 12000, `${model.id} costs ${triangles} triangles`);
      assert.equal(materials.size, 1, 'one material must serve body, cups, fins and eyes');
      assert.equal([...materials][0], kit.material, 'material ownership is not shared across the family');
      // Inspect a complete interior tube ring, before its merged cup field.
      // Inward winding can pass position bounds while making soft skin dark.
      const armGeometry = model.arms[0].children[0].geometry, positions = armGeometry.attributes.position, normals = armGeometry.attributes.normal;
      const ringStart = 5 * 11, center = new THREE.Vector3();
      for (let j = 0; j < 10; j++) center.add(new THREE.Vector3().fromBufferAttribute(positions, ringStart + j));
      center.multiplyScalar(.1);
      for (let j = 0; j < 10; j++) {
        const radial = new THREE.Vector3().fromBufferAttribute(positions, ringStart + j).sub(center);
        const n = new THREE.Vector3().fromBufferAttribute(normals, ringStart + j);
        assert.ok(radial.dot(n) > 0, `${model.id} continuous arm is shaded inside out`);
      }
      footprints.set(model.id, new THREE.Box3().setFromObject(model.root));
    }
    const cuttleBody = models[0].root.children.find(m => m.name.startsWith('closed mantle'));
    assert.ok(Math.abs(cuttleBody.geometry.boundingBox.min.x + .5) < 1e-6, 'mantle posterior endpoint is not the catalogue unit');
    // Mantle surface terminates at +.5; separate head/arms are deliberately
    // larger than a unit, so full-length normalization would fail this check.
    assert.ok(footprints.get('reef-cuttlefish').max.x > 1.2, 'complete tentacles were cropped into mantle length');
    let movingVertices = 0;
    for (const speed of [0, .4, 1]) for (let time = 0; time <= 75; time += 1.25) {
      kit.update(time, new Map(SHALLOW_CEPHALOPOD_IDS.map(id => [id, speed])));
      for (const model of models) {
        const bounds = model.root.userData.displayEnvelope;
        model.root.traverse(mesh => { if (!mesh.isMesh) return; const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z), `${model.id} has invalid actual transformed vertex`);
            assert.ok(Math.hypot(point.x, point.z) <= bounds.radius + 1e-6, `${model.id} exceeds full motion radius`);
            assert.ok(point.y >= bounds.minY - 1e-6 && point.y <= bounds.maxY + 1e-6, `${model.id} leaves complete motion height`);
            const rest = footprints.get(model.id), pad = model.motionPadding;
            assert.ok(point.y >= rest.min.y - pad.bottom - 1e-6 && point.y <= rest.max.y + pad.top + 1e-6, `${model.id} motion padding does not reserve its actual transform`);
            movingVertices++;
          }
        });
      }
    }
    assert.ok(movingVertices > 500000, 'whole movement envelope was not inspected');
  } finally { kit.dispose(); kit.dispose(); }
  for (const count of disposed.values()) assert.equal(count, 1, 'a shared geometry or material was leaked/double released');
  assert.equal(kit.create('day-octopus'), null, 'disposed family was recreated');
});
