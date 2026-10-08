import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { createReefDiversityBenthic, animateReefDiversityBenthic, disposeReefDiversityBenthic,
  isReefDiversityBenthic, reefDiversityBenthicAssetStats } from '../src/world/OceanReefDiversityBenthicAssets.js';

const ids = ['cushion-sea-star', 'leopard-sea-cucumber'], epsilon = 2e-7;
function vertices(root) {
  root.updateMatrixWorld(true); const points = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const p = object.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) points.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(object.matrixWorld));
  });
  return points;
}
function envelopeContains(id, root) {
  const e = oceanReefDiversitySpeciesById[id].normalizedEnvelope;
  for (const p of vertices(root)) {
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - epsilon && p[axis] <= e[axis][1] + epsilon,
      `${id} animated ${axis}=${p[axis]} stays in the actual shared support envelope`);
    assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + epsilon, `${id}: full radial envelope`);
  }
}

test('the two new benthic forms retain distinct whole silhouettes and exact unscaled species identities', () => {
  const before = reefDiversityBenthicAssetStats(), star = createReefDiversityBenthic(ids[0]), cucumber = createReefDiversityBenthic(ids[1]);
  try {
    for (const group of [star, cucumber]) {
      assert.deepEqual(group.scale.toArray(), [1, 1, 1]); assert.deepEqual(group.position.toArray(), [0, 0, 0]);
      const species = oceanReefDiversitySpeciesById[group.userData.speciesId];
      assert.equal(group.userData.scientificName, species.scientificName);
      assert.equal(group.userData.sizeMeasure, species.sizeMeasure); assert.equal(group.userData.supportContacts.length, 10);
    }
    const s = new THREE.Box3().setFromPoints(vertices(star)).getSize(new THREE.Vector3());
    const c = new THREE.Box3().setFromPoints(vertices(cucumber)).getSize(new THREE.Vector3());
    assert.ok(s.x > .9 && s.z > .9 && s.y > .3, 'an inflated, broad cushion rather than a thin generic star');
    assert.ok(c.x > 1.1 && c.z < .36 && c.y < .3, 'an elongated body with distinct anterior feeding crown');
    assert.equal(star.userData.anatomy.shortArmCount, 5); assert.equal(star.userData.anatomy.largeDorsalHorns, false);
    assert.equal(cucumber.userData.anatomy.ocelli, true); assert.equal(cucumber.userData.anatomy.oralTentacles, 10);
    assert.equal(cucumber.userData.anatomy.anteriorTentaclesIncludedInBodySize, false);
  } finally { disposeReefDiversityBenthic(star); disposeReefDiversityBenthic(cucumber); }
  assert.deepEqual(reefDiversityBenthicAssetStats(), before);
});

test('every actual body, foot and feeding appendage vertex remains above the foot plane inside the shared animated envelope', () => {
  for (const id of ids) {
    const root = createReefDiversityBenthic(id);
    try {
      for (const phase of [0, .7, 3.8]) for (const time of [0, .8, 2.3, 4.5, 7, 11, 23, 46, 79]) {
        root.userData.phase = phase;
        animateReefDiversityBenthic(root, { alive: true, state: 'resident-proxy-feeding' }, time);
        envelopeContains(id, root);
      }
      animateReefDiversityBenthic(root, { alive: true, state: 'resting' }, 79); envelopeContains(id, root);
      animateReefDiversityBenthic(root, { alive: false, state: 'dead' }, 79); envelopeContains(id, root);
    } finally { disposeReefDiversityBenthic(root); }
  }
});

test('all declared support contacts are actual fixed tube-foot tips while the central star mouth stays off the substrate', () => {
  for (const id of ids) {
    const root = createReefDiversityBenthic(id);
    try {
      const species = oceanReefDiversitySpeciesById[id];
      let feet; root.traverse(object => { if (object.userData.contactTips) feet = object; });
      assert.ok(feet?.isMesh); const raw = feet.geometry.getAttribute('position');
      const original = Array.from(raw.array);
      for (const contact of species.support.footContacts) {
        assert.equal(contact.y, 0); let minimum = Infinity;
        for (let i = 0; i < raw.count; i++) minimum = Math.min(minimum,
          Math.hypot(raw.getX(i) - contact.x, raw.getY(i) - contact.y, raw.getZ(i) - contact.z));
        assert.ok(minimum < epsilon, `${id}: physically modeled declared tube-foot contact`);
      }
      for (const time of [0, 1, 4, 13, 47]) {
        animateReefDiversityBenthic(root, { alive: true, state: 'feeding' }, time); root.updateMatrixWorld(true);
        assert.deepEqual(Array.from(raw.array), original, 'foot-tip geometry never follows the soft-body display animation');
        assert.ok(feet.matrixWorld.equals(new THREE.Matrix4()), 'contact tips have no animated transform');
      }
      if (id === ids[0]) {
        assert.ok(species.support.footContacts.every(p => Math.hypot(p.x, p.z) > .1));
        const mouth = root.userData.motion.mouth;
        assert.ok(new THREE.Box3().setFromObject(mouth).min.y > .02, 'central oral membrane is separate from actual support tips');
      }
    } finally { disposeReefDiversityBenthic(root); }
  }
});

test('native indexed geometry has finite normals, natural color variation and nonemissive standard materials', () => {
  for (const id of ids) {
    const root = createReefDiversityBenthic(id);
    try {
      let count = 0, distinctColors = new Set();
      root.traverse(object => {
        if (!object.isMesh) return; count++;
        const p = object.geometry.getAttribute('position'), n = object.geometry.getAttribute('normal'), c = object.geometry.getAttribute('color');
        assert.ok(p.count > 2 && object.geometry.index?.count > 2);
        assert.equal(n.count, p.count); assert.equal(c.count, p.count);
        for (const attribute of [p, n, c]) assert.ok([...attribute.array].every(Number.isFinite));
        if (object === root.userData.motion.body) {
          const threshold = id === ids[0] ? .28 : .21; let topCount = 0, topNormalY = 0;
          for (let i = 0; i < p.count; i++) if (p.getY(i) > threshold && Math.hypot(p.getX(i), p.getZ(i)) > .05) {
            topCount++; topNormalY += n.getY(i);
          }
          assert.ok(topCount > 0 && topNormalY / topCount > .4, 'the upper skin has outward lighting normals');
        }
        for (let i = 0; i < c.count; i++) distinctColors.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join(','));
        assert.equal(object.material.type, 'MeshStandardMaterial'); assert.equal(object.material.vertexColors, true);
        assert.equal(object.material.emissive.getHex(), 0); assert.equal(object.material.map, null);
      });
      assert.ok(count >= 3); assert.ok(distinctColors.size > 8, 'the whole body carries actual vertex-color pattern variation');
    } finally { disposeReefDiversityBenthic(root); }
  }
});

test('saved native clock and phase reconstruct display animation with independent poses for shared immutable assets', () => {
  const a = createReefDiversityBenthic(ids[1]), b = createReefDiversityBenthic(ids[1]);
  try {
    a.userData.phase = b.userData.phase = 1.37;
    animateReefDiversityBenthic(a, { alive: true, state: 'feeding' }, 15.3);
    animateReefDiversityBenthic(b, { alive: true, state: 'feeding' }, 15.3);
    const snapshot = root => vertices(root).map(p => p.toArray());
    assert.deepEqual(snapshot(a), snapshot(b));
    const before = snapshot(b); animateReefDiversityBenthic(a, { alive: true, state: 'feeding' }, 29);
    assert.deepEqual(snapshot(b), before, 'another individual retains its own animated transforms');
    assert.notDeepEqual(snapshot(a), before);
  } finally { disposeReefDiversityBenthic(a); disposeReefDiversityBenthic(b); }
});

test('identity guards and repeated disposal keep the shared native resources balanced', () => {
  const before = reefDiversityBenthicAssetStats();
  assert.equal(isReefDiversityBenthic('coral-trout'), false);
  assert.throws(() => createReefDiversityBenthic('coral-trout'), /Unknown/);
  assert.throws(() => createReefDiversityBenthic({ id: ids[0], scientificName: 'Protoreaster nodosus' }), /Conflicting/);
  assert.deepEqual(reefDiversityBenthicAssetStats(), before);
  const a = createReefDiversityBenthic(ids[0]), b = createReefDiversityBenthic(ids[0]);
  const parent = new THREE.Group(); parent.add(a, b);
  assert.equal(disposeReefDiversityBenthic(a), true); assert.equal(disposeReefDiversityBenthic(a), false);
  assert.equal(a.parent, null); assert.deepEqual(parent.children, [b]);
  envelopeContains(ids[0], b); assert.equal(disposeReefDiversityBenthic(b), true);
  assert.equal(b.parent, null); assert.equal(parent.children.length, 0);
  assert.deepEqual(reefDiversityBenthicAssetStats(), before);
});
