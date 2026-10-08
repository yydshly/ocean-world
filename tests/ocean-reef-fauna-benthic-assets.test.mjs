import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { oceanReefFaunaSpeciesById } from '../src/oceanReefFaunaSpecies.js';
import { isReefFaunaBenthic, createReefFaunaBenthic, animateReefFaunaBenthic,
  disposeReefFaunaBenthic, reefFaunaBenthicAssetStats } from '../src/world/OceanReefFaunaBenthicAssets.js';

const ids = ['shame-faced-crab', 'wedge-sea-hare', 'varicose-phyllidia'], tolerance = 2e-7;
function vertices(root) {
  root.updateMatrixWorld(true); const result = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) result.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  return result;
}
function fits(root) {
  const s = oceanReefFaunaSpeciesById[root.userData.speciesId], e = s.normalizedEnvelope;
  for (const p of vertices(root)) {
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - tolerance && p[axis] <= e[axis][1] + tolerance,
      `${s.id}: actual animated ${axis} ${p[axis]} stays in the complete shared envelope`);
    assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + tolerance);
    assert.ok(p.y >= -tolerance, 'whole form and appendage animation remain above the actual support plane');
  }
}
function find(root, predicate) { let result; root.traverse(o => { if (predicate(o)) result = o; }); return result; }
function connectedGeometry(g) {
  const count = g.getAttribute('position').count, parent = Array.from({ length: count }, (_, i) => i);
  const ancestor = i => parent[i] === i ? i : (parent[i] = ancestor(parent[i]));
  const edge = (a, b) => { parent[ancestor(a)] = ancestor(b); };
  for (let i = 0; i < g.index.count; i += 3) { edge(g.index.array[i], g.index.array[i + 1]); edge(g.index.array[i], g.index.array[i + 2]); }
  return new Set(parent.map((_, i) => ancestor(i))).size === 1;
}

test('three new species have distinct full anatomy and the actual catalogue size measure on an unscaled foot-plane root', () => {
  const before = reefFaunaBenthicAssetStats(), roots = ids.map(createReefFaunaBenthic);
  try {
    const expected = ['Calappa hepatica', 'Dolabella auricularia', 'Phyllidia varicosa'];
    roots.forEach((root, index) => {
      const s = oceanReefFaunaSpeciesById[ids[index]];
      assert.equal(root.userData.scientificName, expected[index]); assert.equal(root.userData.sizeMeasure, s.sizeMeasure);
      assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
      assert.equal(root.userData.rootReference, 'neutral-foot-plane'); assert.equal(root.userData.forwardAxis, '+X');
      assert.deepEqual(root.userData.supportContacts, s.support.footContacts);
      const measured = find(root, o => o.userData.shellMeasuredZ || o.userData.bodyMeasuredX);
      const box = new THREE.Box3().setFromBufferAttribute(measured.geometry.getAttribute('position')), axis = index === 0 ? 'z' : 'x';
      assert.ok(Math.abs(box.min[axis] + .5) < tolerance && Math.abs(box.max[axis] - .5) < tolerance);
    });
    const [crab, hare, phyllidia] = roots, a = crab.userData.anatomy;
    assert.equal(a.groundWalkingLegPairs, 4); assert.equal(a.raisedChelipedCount, 2); assert.equal(a.actualGroundContactTips, 8);
    assert.equal(a.posterolateralCanopies, true); assert.equal(a.realBurialImplemented, false); assert.equal(a.realPreyBreakingImplemented, false);
    const hareBody = find(hare, o => o.userData.bodyMeasuredX), p = hareBody.geometry.getAttribute('position');
    const rear = [], front = [];
    for (let i = 0; i < p.count; i++) { if (p.getX(i) < -.31) rear.push(new THREE.Vector3().fromBufferAttribute(p, i));
      if (p.getX(i) > .30) front.push(new THREE.Vector3().fromBufferAttribute(p, i)); }
    const rearSize = new THREE.Box3().setFromPoints(rear).getSize(new THREE.Vector3()), frontSize = new THREE.Box3().setFromPoints(front).getSize(new THREE.Vector3());
    assert.ok(rearSize.z > frontSize.z * 2 && rearSize.y > frontSize.y * 1.7, 'real wedge widens into the large flattened posterior disk');
    assert.equal(hare.userData.anatomy.oralTentacleCount, 2); assert.equal(hare.userData.anatomy.rhinophoreCount, 2);
    assert.equal(hare.userData.anatomy.exposedSpiralShell, false); assert.equal(hare.userData.anatomy.fusedParapodia, true);
    const openings = []; hare.traverse(o => { if (o.userData.siphonOpening) openings.push(o); }); assert.equal(openings.length, 2);
    for (const o of openings) assert.equal(o.geometry.getAttribute('position').count, 99, 'annular siphon has actual rings, no filled aperture centre');
    const anatomy = phyllidia.userData.anatomy;
    assert.equal(anatomy.longitudinalRidgeCount, 3); assert.equal(anatomy.yellowTippedTubercles, 15);
    assert.equal(anatomy.ventralLateralGillLamellae, true); assert.equal(anatomy.dorsalGillPlume, false); assert.equal(anatomy.radula, false);
  } finally { roots.forEach(disposeReefFaunaBenthic); }
  assert.deepEqual(reefFaunaBenthicAssetStats(), before);
});

test('all actual full-form vertices stay inside complete catalogue envelopes throughout bounded display poses and rest', () => {
  for (const id of ids) {
    const root = createReefFaunaBenthic(id);
    try {
      for (const phase of [0, .8, 4.2]) for (const clock of [0, .3, 1, 3.5, 8, 17, 31, 63, 117]) {
        root.userData.phase = phase; animateReefFaunaBenthic(root, { alive: true, state: 'resident-proxy-feeding' }, clock); fits(root);
      }
      for (const agent of [{ alive: true, state: 'resting' }, { alive: false, state: 'dead' }]) { animateReefFaunaBenthic(root, agent, 117); fits(root); }
    } finally { disposeReefFaunaBenthic(root); }
  }
});

test('eight actual crab tips and six samples of each continuous sole stay planted; raised chelae and oral organs are not feet', () => {
  for (const id of ids) {
    const root = createReefFaunaBenthic(id);
    try {
      const feet = find(root, o => o.userData.contactTips), s = oceanReefFaunaSpeciesById[id]; assert.ok(feet?.isMesh);
      const raw = feet.geometry.getAttribute('position'), original = Array.from(raw.array), transform = feet.matrixWorld.elements.slice();
      assert.equal(s.support.footContacts.length, id === ids[0] ? 8 : 6);
      for (const p of s.support.footContacts) {
        assert.equal(p.y, 0); let closest = Infinity;
        for (let i = 0; i < raw.count; i++) closest = Math.min(closest, Math.hypot(raw.getX(i) - p.x, raw.getY(i) - p.y, raw.getZ(i) - p.z));
        assert.ok(closest < tolerance, 'shared support point is a true mesh vertex, not an empty reference marker');
      }
      if (id !== ids[0]) { assert.equal(feet.userData.continuousSole, true); assert.equal(connectedGeometry(feet.geometry), true);
        assert.equal(root.userData.anatomy.groundLegCount, 0); }
      for (const clock of [0, 2, 13, 79]) {
        animateReefFaunaBenthic(root, { alive: true }, clock); root.updateMatrixWorld(true);
        assert.deepEqual(feet.matrixWorld.elements, transform); assert.deepEqual(Array.from(raw.array), original);
        root.traverse(o => { if (o.userData.raisedChela) assert.ok(new THREE.Box3().setFromObject(o).min.y > .05); });
      }
    } finally { disposeReefFaunaBenthic(root); }
  }
});

test('native indexed whole forms have finite lighting normals, outward body surfaces and natural nonemissive vertex colours', () => {
  for (const id of ids) {
    const root = createReefFaunaBenthic(id);
    try {
      let count = 0; const colours = new Set();
      root.traverse(o => {
        if (!o.isMesh) return; count++;
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal'), c = o.geometry.getAttribute('color');
        assert.ok(p.count > 2 && o.geometry.index.count > 2); assert.equal(n.count, p.count); assert.equal(c.count, p.count);
        for (const attribute of [p, n, c]) assert.ok(Array.from(attribute.array).every(Number.isFinite));
        for (const index of o.geometry.index.array) assert.ok(index >= 0 && index < p.count);
        for (let i = 0; i < c.count; i++) colours.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join(','));
        assert.equal(o.material.type, 'MeshStandardMaterial'); assert.equal(o.material.vertexColors, true);
        assert.equal(o.material.emissive.getHex(), 0); assert.equal(o.material.map, null); assert.ok(o.material.roughness > .6);
      });
      assert.ok(count >= 3 && colours.size >= 3);
      const body = find(root, o => o.userData.bodyMeasuredX || o.userData.shellMeasuredZ), p = body.geometry.getAttribute('position'), n = body.geometry.getAttribute('normal');
      let sampled = 0, yNormal = 0, exteriorTopY = -Infinity;
      for (let i = 0; i < p.count; i++) exteriorTopY = Math.max(exteriorTopY, p.getY(i));
      // Highest exterior vertices face upward. Embedded tubercle undersides also
      // lie above the main shell and correctly face downward; exclude those.
      for (let i = 0; i < p.count; i++) if (p.getY(i) > exteriorTopY - .002) {
        sampled++; yNormal += n.getY(i);
      }
      assert.ok(sampled > 0 && yNormal / sampled > .3, `${id}: actual exterior-top lighting normals point outward`);
    } finally { disposeReefFaunaBenthic(root); }
  }
});

test('saved native clock and phase reproduce independent poses without changing ecology or native root movement', () => {
  for (const id of ids) {
    const a = createReefFaunaBenthic(id), b = createReefFaunaBenthic(id);
    const agent = { alive: true, state: 'reef-foraging', timeSec: 31, position: { x: 12, y: -3, z: 5 }, velocity: { x: .01, y: 0, z: 0 } }, saved = structuredClone(agent);
    try {
      a.userData.phase = b.userData.phase = .76; animateReefFaunaBenthic(a, agent, agent.timeSec); animateReefFaunaBenthic(b, agent, agent.timeSec);
      const snapshot = root => vertices(root).map(p => p.toArray()); assert.deepEqual(snapshot(a), snapshot(b));
      const old = snapshot(b); animateReefFaunaBenthic(a, agent, 57);
      assert.deepEqual(snapshot(b), old); assert.notDeepEqual(snapshot(a), old); assert.deepEqual(agent, saved);
      assert.deepEqual(a.position.toArray(), [0, 0, 0]); assert.deepEqual(a.scale.toArray(), [1, 1, 1]);
    } finally { disposeReefFaunaBenthic(a); disposeReefFaunaBenthic(b); }
  }
});

test('identity guards and idempotent attached-root disposal preserve shared resources and independent surviving animals', () => {
  const before = reefFaunaBenthicAssetStats();
  assert.equal(isReefFaunaBenthic('green-turban-snail'), false); assert.throws(() => createReefFaunaBenthic('green-turban-snail'), /Unknown/);
  assert.throws(() => createReefFaunaBenthic({ id: ids[1], scientificName: 'Aplysia californica' }), /Conflicting/);
  assert.deepEqual(reefFaunaBenthicAssetStats(), before);
  for (const id of ids) {
    const a = createReefFaunaBenthic(id), b = createReefFaunaBenthic(id), parent = new THREE.Group(); parent.add(a, b);
    const during = reefFaunaBenthicAssetStats(); assert.equal(during.instances, before.instances + 2);
    assert.equal(disposeReefFaunaBenthic(a), true); assert.equal(disposeReefFaunaBenthic(a), false);
    assert.equal(a.parent, null); assert.deepEqual(parent.children, [b]); fits(b);
    assert.equal(reefFaunaBenthicAssetStats().resources, during.resources);
    assert.equal(disposeReefFaunaBenthic(b), true); assert.equal(b.parent, null); assert.equal(parent.children.length, 0);
    assert.deepEqual(reefFaunaBenthicAssetStats(), before);
  }
});
