import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { isReefCommunityBenthic, createReefCommunityBenthic, animateReefCommunityBenthic,
  disposeReefCommunityBenthic, reefCommunityBenthicAssetStats } from '../src/world/OceanReefCommunityBenthicAssets.js';

const ids = ['peacock-mantis-shrimp', 'green-turban-snail'], tolerance = 2e-7;
function vertices(root) {
  root.updateMatrixWorld(true); const result = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const p = object.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) result.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld));
  });
  return result;
}
function fits(root) {
  const s = oceanReefCommunitySpeciesById[root.userData.speciesId], e = s.normalizedEnvelope;
  for (const p of vertices(root)) {
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - tolerance && p[axis] <= e[axis][1] + tolerance,
      `${s.id}: actual animated ${axis} ${p[axis]} remains in shared whole-form envelope`);
    assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + tolerance);
  }
}
test('two distinct true species retain measured body and shell size with an unscaled foot-plane basis', () => {
  const before = reefCommunityBenthicAssetStats(), mantis = createReefCommunityBenthic(ids[0]), snail = createReefCommunityBenthic(ids[1]);
  try {
    for (const root of [mantis, snail]) {
      const s = oceanReefCommunitySpeciesById[root.userData.speciesId];
      assert.equal(root.userData.scientificName, s.scientificName); assert.equal(root.userData.sizeMeasure, s.sizeMeasure);
      assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
      assert.equal(root.userData.rootReference, 'neutral-foot-plane'); assert.equal(root.userData.forwardAxis, '+X');
    }
    const m = new THREE.Box3().setFromPoints(vertices(mantis)).getSize(new THREE.Vector3());
    const s = new THREE.Box3().setFromPoints(vertices(snail)).getSize(new THREE.Vector3());
    assert.ok(m.x > 1.2 && m.y < .38 && m.z < .65, 'elongated crustacean, tail fan and anterior antennae');
    assert.ok(s.y > .85 && s.z > .99 && s.x > 1.1, 'a large coiled shell above the extended muscular sole');
    let body, shell;
    mantis.traverse(o => { if (o.userData.bodyMeasuredX) body = o; }); snail.traverse(o => { if (o.userData.shellMeasuredZ) shell = o; });
    const bodyBox = new THREE.Box3().setFromBufferAttribute(body.geometry.getAttribute('position'));
    const shellBox = new THREE.Box3().setFromBufferAttribute(shell.geometry.getAttribute('position'));
    assert.ok(Math.abs(bodyBox.min.x + .5) < tolerance && Math.abs(bodyBox.max.x - .5) < tolerance);
    assert.ok(Math.abs(shellBox.min.z + .5) < tolerance && Math.abs(shellBox.max.z - .5) < tolerance);
    assert.equal(mantis.userData.anatomy.walkingLegPairs, 3); assert.equal(mantis.userData.anatomy.raptorialAppendages, 2);
    assert.equal(mantis.userData.anatomy.swimmeretPairs, 5); assert.equal(mantis.userData.anatomy.fabricatedBurrow, false);
    assert.equal(snail.userData.anatomy.continuousMuscularFoot, true); assert.equal(snail.userData.anatomy.walkingLegs, 0);
    assert.equal(snail.userData.anatomy.cephalicTentacles, 2); assert.equal(snail.userData.anatomy.recessedShellAperture, true);
  } finally { disposeReefCommunityBenthic(mantis); disposeReefCommunityBenthic(snail); }
  assert.deepEqual(reefCommunityBenthicAssetStats(), before);
});
test('every actual body, shell, appendage and bounded display vertex stays inside the shared physical envelope', () => {
  for (const id of ids) {
    const root = createReefCommunityBenthic(id);
    try {
      for (const phase of [0, .8, 4.2]) for (const clock of [0, .3, 1, 3.5, 8, 17, 31, 63, 117]) {
        root.userData.phase = phase; animateReefCommunityBenthic(root, { alive: true, state: 'resident-proxy-feeding' }, clock); fits(root);
      }
      for (const agent of [{ alive: true, state: 'resting' }, { alive: false, state: 'dead' }]) {
        animateReefCommunityBenthic(root, agent, 117); fits(root);
      }
    } finally { disposeReefCommunityBenthic(root); }
  }
});
test('all six contacts are actual fixed leg tips or points of the one continuous snail sole', () => {
  for (const id of ids) {
    const root = createReefCommunityBenthic(id);
    try {
      let sole; root.traverse(o => { if (o.userData.contactTips) sole = o; }); assert.ok(sole?.isMesh);
      const s = oceanReefCommunitySpeciesById[id], raw = sole.geometry.getAttribute('position');
      assert.equal(s.support.footContacts.length, 6); const original = Array.from(raw.array);
      for (const p of s.support.footContacts) {
        assert.equal(p.y, 0); let nearest = Infinity;
        for (let i = 0; i < raw.count; i++) nearest = Math.min(nearest, Math.hypot(raw.getX(i) - p.x, raw.getY(i) - p.y, raw.getZ(i) - p.z));
        assert.ok(nearest < tolerance, `${id}: every physical support contact exists in the model`);
      }
      for (const clock of [0, .7, 3.2, 19, 51]) {
        animateReefCommunityBenthic(root, { alive: true }, clock); root.updateMatrixWorld(true);
        assert.deepEqual(Array.from(raw.array), original); assert.ok(sole.matrixWorld.equals(new THREE.Matrix4()));
      }
      if (id === ids[1]) assert.ok(raw.count > 40 && raw.count === 50, 'one closed, connected sole surface rather than contact-marker dots');
    } finally { disposeReefCommunityBenthic(root); }
  }
});
test('native indexed whole geometry has finite normals, real color variation and natural nonemissive materials', () => {
  for (const id of ids) {
    const root = createReefCommunityBenthic(id);
    try {
      let meshes = 0; const colors = new Set();
      root.traverse(o => {
        if (!o.isMesh) return; meshes++;
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal'), c = o.geometry.getAttribute('color');
        assert.ok(p.count > 2 && o.geometry.index.count > 2); assert.equal(n.count, p.count); assert.equal(c.count, p.count);
        for (const a of [p, n, c]) assert.ok(Array.from(a.array).every(Number.isFinite));
        for (const index of o.geometry.index.array) assert.ok(index >= 0 && index < p.count);
        for (let i = 0; i < c.count; i++) colors.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join(','));
        assert.equal(o.material.type, 'MeshStandardMaterial'); assert.equal(o.material.vertexColors, true);
        assert.equal(o.material.emissive.getHex(), 0); assert.equal(o.material.map, null); assert.ok(o.material.roughness > .6);
      });
      assert.ok(meshes >= 5); assert.ok(colors.size > 8);
    } finally { disposeReefCommunityBenthic(root); }
  }
});
test('native clock and phase reconstruct independent appendage poses without mutating saved ecology or root movement', () => {
  for (const id of ids) {
    const a = createReefCommunityBenthic(id), b = createReefCommunityBenthic(id);
    const agent = { alive: true, state: 'reef-foraging', timeSec: 31, position: { x: 12, y: -3, z: 5 }, velocity: { x: .01, y: 0, z: 0 } };
    const saved = structuredClone(agent);
    try {
      a.userData.phase = b.userData.phase = .76;
      animateReefCommunityBenthic(a, agent, agent.timeSec); animateReefCommunityBenthic(b, agent, agent.timeSec);
      const snapshot = root => vertices(root).map(p => p.toArray()); assert.deepEqual(snapshot(a), snapshot(b));
      const old = snapshot(b); animateReefCommunityBenthic(a, agent, 57);
      assert.deepEqual(snapshot(b), old); assert.notDeepEqual(snapshot(a), old); assert.deepEqual(agent, saved);
      assert.deepEqual(a.position.toArray(), [0, 0, 0]); assert.deepEqual(a.scale.toArray(), [1, 1, 1]);
    } finally { disposeReefCommunityBenthic(a); disposeReefCommunityBenthic(b); }
  }
});
test('identity guards, shared immutable resources and repeated attached-root disposal preserve balanced ownership', () => {
  const before = reefCommunityBenthicAssetStats();
  assert.equal(isReefCommunityBenthic('painted-spiny-lobster'), false);
  assert.throws(() => createReefCommunityBenthic('painted-spiny-lobster'), /Unknown/);
  assert.throws(() => createReefCommunityBenthic({ id: ids[0], scientificName: 'Panulirus versicolor' }), /Conflicting/);
  assert.deepEqual(reefCommunityBenthicAssetStats(), before);
  for (const id of ids) {
    const a = createReefCommunityBenthic(id), b = createReefCommunityBenthic(id), parent = new THREE.Group(); parent.add(a, b);
    const during = reefCommunityBenthicAssetStats(); assert.equal(during.instances, before.instances + 2);
    assert.equal(disposeReefCommunityBenthic(a), true); assert.equal(disposeReefCommunityBenthic(a), false);
    assert.equal(a.parent, null); assert.deepEqual(parent.children, [b]); fits(b);
    assert.equal(reefCommunityBenthicAssetStats().resources, during.resources, 'live sibling still owns shared immutable resources');
    assert.equal(disposeReefCommunityBenthic(b), true); assert.equal(b.parent, null); assert.equal(parent.children.length, 0);
    assert.deepEqual(reefCommunityBenthicAssetStats(), before);
  }
});
