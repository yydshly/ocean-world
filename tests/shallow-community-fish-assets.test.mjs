import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShallowCommunityFishAssets, SHALLOW_COMMUNITY_FISH_IDS, SHALLOW_COMMUNITY_MOTION_PADDING } from '../src/world/ShallowCommunityFishAssets.js';

function meshes(root) { const list = []; root.traverse(m => { if (m.isMesh) list.push(m); }); return list; }

test('complete community-fish family has finite outward bodies, distinguishable full forms and natural total-length units within the shared mesh budget', () => {
  const kit = new ShallowCommunityFishAssets(), bounds = new Map();
  try {
    assert.equal(kit.create('spot-fin-porcupinefish'), null, 'Diodon hystrix must not silently borrow a Diodon liturosus model');
    for (const id of SHALLOW_COMMUNITY_FISH_IDS) {
      const { root } = kit.create(id), box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()); bounds.set(id, size);
      assert.ok(Math.abs(size.x - 1) < 1e-6, `${id}: full total length differs from the catalogue metre unit`);
      assert.equal(root.scale.x, 1); assert.equal(root.scale.y, 1); assert.equal(root.scale.z, 1);
      let triangles = 0;
      for (const m of meshes(root)) {
        triangles += m.geometry.index.count / 3;
        const p = m.geometry.attributes.position, n = m.geometry.attributes.normal, c = m.geometry.attributes.color;
        assert.ok(p.count > 0 && n.count === p.count && c.count === p.count);
        for (let i = 0; i < p.count; i++) {
          assert.ok([p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)].every(Number.isFinite));
          assert.ok([c.getX(i), c.getY(i), c.getZ(i)].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
        }
      }
      assert.ok(triangles <= 9000, `${id}: ${triangles} triangles exceed the complete model budget`);
      const body = meshes(root).find(m => m.geometry.userData.role === 'body'), p = body.geometry.attributes.position, n = body.geometry.attributes.normal;
      let outward = 0, checked = 0;
      // The head/body flank should face the water. Test actual normals away
      // from mouths, end caps and small appended eyes/spines.
      const bodyVertexLimit = id === 'cleaner-wrasse' ? 45 * 29 : id === 'lionfish' ? 49 * 33 : 49 * 37;
      for (let i = 0; i < bodyVertexLimit; i++) {
        if (p.getX(i) < -.19 || p.getX(i) > .26 || Math.abs(p.getZ(i)) < .012) continue;
        checked++; if (p.getZ(i) * n.getZ(i) > 0) outward++;
      }
      assert.ok(checked > 100 && outward / checked > .98, `${id}: main flanks have inward-facing normals`);
    }
    assert.ok(bounds.get('cleaner-wrasse').y < .23, 'slender cleanerfish lost its low silhouette');
    assert.ok(bounds.get('black-blotched-porcupinefish').y > bounds.get('cleaner-wrasse').y * 1.7);
    assert.ok(bounds.get('black-blotched-porcupinefish').y < .50, 'ordinary porcupinefish became an inflated ball');
    assert.ok(bounds.get('lionfish').z > .9 && bounds.get('lionfish').y > .7, 'lionfish lost the widely radiating whole fin silhouette');
  } finally { kit.dispose(); }
});

test('entire animated forms stay inside the advertised physical motion padding at low and maximum accepted speed', () => {
  const kit = new ShallowCommunityFishAssets(), point = new THREE.Vector3();
  try {
    for (const id of SHALLOW_COMMUNITY_FISH_IDS) {
      const { root } = kit.create(id), baseline = new THREE.Box3().setFromObject(root).expandByScalar(SHALLOW_COMMUNITY_MOTION_PADDING[id]);
      for (const speed of [0, 1]) for (let step = 0; step < 100; step++) {
        kit.update(step * .23, new Map([[id, speed]]));
        for (const mesh of meshes(root)) {
          const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
            assert.ok(baseline.containsPoint(point), `${id}: moving complete vertex escaped the reserved envelope at ${step * .23}s / ${speed}m/s`);
          }
        }
      }
    }
  } finally { kit.dispose(); }
});

test('repeated community-fish creation shares resources while retaining independent transforms and releases every owned resource once', () => {
  const kit = new ShallowCommunityFishAssets(), first = kit.create('lionfish'), second = kit.create('lionfish'), disposed = new Map();
  const a = meshes(first.root), b = meshes(second.root);
  assert.notEqual(first.root, second.root); assert.notEqual(first.tail, second.tail); assert.notEqual(first.fins[0], second.fins[0]);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) { assert.equal(a[i].geometry, b[i].geometry); assert.equal(a[i].material, b[i].material); }
  for (const r of kit.resources) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) ?? 0) + 1));
  const count = kit.resources.size;
  kit.dispose(); kit.dispose(); kit.update(100, new Map([['lionfish', 1]]));
  assert.equal(disposed.size, count); assert.ok([...disposed.values()].every(v => v === 1));
  assert.equal(kit.resources.size, 0); assert.equal(kit.models.size, 0); assert.equal(kit.create('cleaner-wrasse'), null);
});
