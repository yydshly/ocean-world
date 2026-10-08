import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
import { isReefLifeBenthic, createReefLifeBenthic, animateReefLifeBenthic,
  disposeReefLifeBenthic, reefLifeBenthicAssetStats } from '../src/world/OceanReefLifeBenthicAssets.js';

const ids = ['banded-coral-shrimp', 'chocolate-chip-sea-star'], tolerance = 2e-7;
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
  const s = oceanReefLifeSpeciesById[root.userData.speciesId], e = s.normalizedEnvelope;
  for (const p of vertices(root)) {
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - tolerance && p[axis] <= e[axis][1] + tolerance,
      `${s.id}: actual animated ${axis} ${p[axis]} stays in the complete shared envelope`);
    assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + tolerance);
  }
}
test('new true species retain distinct complete form, actual body measure and an unscaled foot-plane root', () => {
  const before = reefLifeBenthicAssetStats(), shrimp = createReefLifeBenthic(ids[0]), star = createReefLifeBenthic(ids[1]);
  try {
    for (const root of [shrimp, star]) {
      const s = oceanReefLifeSpeciesById[root.userData.speciesId];
      assert.equal(root.userData.scientificName, s.scientificName); assert.equal(root.userData.sizeMeasure, s.sizeMeasure);
      assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
      assert.equal(root.userData.rootReference, 'neutral-foot-plane'); assert.equal(root.userData.forwardAxis, '+X');
    }
    assert.equal(shrimp.userData.scientificName, 'Stenopus hispidus'); assert.equal(star.userData.scientificName, 'Protoreaster nodosus');
    const shrimpBox = new THREE.Box3().setFromPoints(vertices(shrimp)), starBox = new THREE.Box3().setFromPoints(vertices(star));
    assert.ok(shrimpBox.max.x > 2.2 && shrimpBox.getSize(new THREE.Vector3()).z > 1.8, 'the four full antennae are not shortened to fit the old shrimp envelope');
    assert.ok(starBox.getSize(new THREE.Vector3()).x > .9 && starBox.getSize(new THREE.Vector3()).z > .9 && starBox.max.y > .28);
    let body; shrimp.traverse(o => { if (o.userData.bodyMeasuredX) body = o; });
    const measure = new THREE.Box3().setFromBufferAttribute(body.geometry.getAttribute('position'));
    assert.ok(Math.abs(measure.min.x + .5) < tolerance && Math.abs(measure.max.x - .5) < tolerance);
    assert.equal(shrimp.userData.anatomy.chelateLegPairs, 3); assert.equal(shrimp.userData.anatomy.largestChelipedPair, 3);
    assert.equal(shrimp.userData.anatomy.groundWalkingLegPairs, 2); assert.equal(shrimp.userData.anatomy.antennaePairs, 2);
    assert.ok(shrimp.userData.anatomy.antennaCenterlineLengthsUnits.every(n => n >= 1.9 && n <= 2.3));
    assert.equal(shrimp.userData.anatomy.cleaningInteractionImplemented, false);
    assert.equal(star.userData.anatomy.armCount, 5); assert.equal(star.userData.anatomy.raisedConicalTubercles, 11);
    assert.equal(star.userData.anatomy.speciesDuplicateOfExistingBlueStar, false);
  } finally { disposeReefLifeBenthic(shrimp); disposeReefLifeBenthic(star); }
  assert.deepEqual(reefLifeBenthicAssetStats(), before);
});
test('actual body, complete antennae, raised chelae and star geometry stay in the physical envelope throughout bounded display motion', () => {
  for (const id of ids) {
    const root = createReefLifeBenthic(id);
    try {
      for (const phase of [0, .8, 4.2]) for (const clock of [0, .3, 1, 3.5, 8, 17, 31, 63, 117]) {
        root.userData.phase = phase; animateReefLifeBenthic(root, { alive: true, state: 'resident-proxy-feeding' }, clock); fits(root);
      }
      for (const agent of [{ alive: true, state: 'resting' }, { alive: false, state: 'dead' }]) {
        animateReefLifeBenthic(root, agent, 117); fits(root);
      }
    } finally { disposeReefLifeBenthic(root); }
  }
});
test('shrimp four posterior walking tips and star ten actual tube feet remain planted; raised claws and central mouth never become contacts', () => {
  for (const id of ids) {
    const root = createReefLifeBenthic(id);
    try {
      let feet; root.traverse(o => { if (o.userData.contactTips) feet = o; }); assert.ok(feet?.isMesh);
      const s = oceanReefLifeSpeciesById[id], raw = feet.geometry.getAttribute('position'), original = Array.from(raw.array);
      assert.equal(s.support.footContacts.length, id === ids[0] ? 4 : 10);
      for (const p of s.support.footContacts) {
        assert.equal(p.y, 0); let closest = Infinity;
        for (let i = 0; i < raw.count; i++) closest = Math.min(closest, Math.hypot(raw.getX(i) - p.x, raw.getY(i) - p.y, raw.getZ(i) - p.z));
        assert.ok(closest < tolerance, `${id}: every declared physical tip exists in actual geometry`);
      }
      for (const clock of [0, .7, 3.2, 19, 51]) {
        animateReefLifeBenthic(root, { alive: true }, clock); root.updateMatrixWorld(true);
        assert.deepEqual(Array.from(raw.array), original); assert.ok(feet.matrixWorld.equals(new THREE.Matrix4()));
        for (const claw of root.userData.motion.chelae) assert.ok(new THREE.Box3().setFromObject(claw).min.y > .10, 'the enlarged anterior claws stay above actual ground support');
      }
      if (id === ids[1]) {
        assert.ok(s.support.footContacts.every(p => Math.hypot(p.x, p.z) > .17));
        assert.ok(new THREE.Box3().setFromObject(root.userData.motion.mouth).min.y > .02);
      }
    } finally { disposeReefLifeBenthic(root); }
  }
});
test('native indexed geometry has finite lighting normals, natural actual vertex colors and nonemissive standard materials', () => {
  for (const id of ids) {
    const root = createReefLifeBenthic(id);
    try {
      let count = 0; const colors = new Set();
      root.traverse(o => {
        if (!o.isMesh) return; count++;
        const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal'), c = o.geometry.getAttribute('color');
        assert.ok(p.count > 2 && o.geometry.index.count > 2); assert.equal(n.count, p.count); assert.equal(c.count, p.count);
        for (const a of [p, n, c]) assert.ok(Array.from(a.array).every(Number.isFinite));
        for (const index of o.geometry.index.array) assert.ok(index >= 0 && index < p.count);
        for (let i = 0; i < c.count; i++) colors.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join(','));
        assert.equal(o.material.type, 'MeshStandardMaterial'); assert.equal(o.material.vertexColors, true);
        assert.equal(o.material.emissive.getHex(), 0); assert.equal(o.material.map, null); assert.ok(o.material.roughness > .6);
      });
      assert.ok(count >= 3); assert.ok(colors.size >= 3, 'whole anatomy carries distinct body, appendage and oral colors');
    } finally { disposeReefLifeBenthic(root); }
  }
});
test('saved native clock and phase reproduce independent display poses without touching ecology or root movement', () => {
  for (const id of ids) {
    const a = createReefLifeBenthic(id), b = createReefLifeBenthic(id);
    const agent = { alive: true, state: 'reef-foraging', timeSec: 31, position: { x: 12, y: -3, z: 5 }, velocity: { x: .01, y: 0, z: 0 } }, saved = structuredClone(agent);
    try {
      a.userData.phase = b.userData.phase = .76;
      animateReefLifeBenthic(a, agent, agent.timeSec); animateReefLifeBenthic(b, agent, agent.timeSec);
      const snapshot = root => vertices(root).map(p => p.toArray()); assert.deepEqual(snapshot(a), snapshot(b));
      const old = snapshot(b); animateReefLifeBenthic(a, agent, 57);
      assert.deepEqual(snapshot(b), old); assert.notDeepEqual(snapshot(a), old); assert.deepEqual(agent, saved);
      assert.deepEqual(a.position.toArray(), [0, 0, 0]); assert.deepEqual(a.scale.toArray(), [1, 1, 1]);
    } finally { disposeReefLifeBenthic(a); disposeReefLifeBenthic(b); }
  }
});
test('identity guards, shared resources and repeated attached-root disposal keep independent animals and parents balanced', () => {
  const before = reefLifeBenthicAssetStats();
  assert.equal(isReefLifeBenthic('blue-starfish'), false); assert.throws(() => createReefLifeBenthic('blue-starfish'), /Unknown/);
  assert.throws(() => createReefLifeBenthic({ id: ids[1], scientificName: 'Linckia laevigata' }), /Conflicting/);
  assert.deepEqual(reefLifeBenthicAssetStats(), before);
  for (const id of ids) {
    const a = createReefLifeBenthic(id), b = createReefLifeBenthic(id), parent = new THREE.Group(); parent.add(a, b);
    const during = reefLifeBenthicAssetStats(); assert.equal(during.instances, before.instances + 2);
    assert.equal(disposeReefLifeBenthic(a), true); assert.equal(disposeReefLifeBenthic(a), false);
    assert.equal(a.parent, null); assert.deepEqual(parent.children, [b]); fits(b);
    assert.equal(reefLifeBenthicAssetStats().resources, during.resources);
    assert.equal(disposeReefLifeBenthic(b), true); assert.equal(b.parent, null); assert.equal(parent.children.length, 0);
    assert.deepEqual(reefLifeBenthicAssetStats(), before);
  }
});
