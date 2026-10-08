import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_RESIDENT_SPECIES, OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { createReefResidentAnimal, animateReefResidentAnimal, disposeReefResidentAnimal, isReefResidentSpecies,
  reefResidentAssetStats } from '../src/world/OceanReefResidentsAssets.js';

// Native Three CPU geometry/pose evidence. This is neither GPU visibility nor
// field-calibrated anatomy, physical ecological admission or visual acceptance.
const meshes = root => { const result = []; root.traverse(o => { if (o.isMesh) result.push(o); }); return result; };
const vertices = root => { root.updateMatrixWorld(true); const result = []; for (const mesh of meshes(root)) {
  const positions = mesh.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++)
    result.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)); } return result; };
const pose = root => { root.updateMatrixWorld(true); const result = []; root.traverse(o => result.push(o.matrix.toArray())); return result; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const agent = id => ({ id: `resident:${id}`, speciesId: id, alive: true, sizeM: id === 'coral-trout' ? .55 : .26,
  position: { x: 13065, y: -4, z: 313 }, velocity: { x: .07, y: 0, z: .01 }, heading: .7, pitch: 0,
  timeSec: 8.2, state: 'foraging', lastFeedAt: 8, organicUnits: .004 });

test('two sourced species retain distinct body-length units, food limits and deeply immutable whole-form data', () => {
  assert.deepEqual(OCEAN_REEF_RESIDENT_IDS, ['coral-trout', 'painted-spiny-lobster']);
  assert.deepEqual(OCEAN_REEF_RESIDENT_SPECIES.map(s => s.sizeRangeM), [[.45, .65], [.22, .30]]);
  for (const s of OCEAN_REEF_RESIDENT_SPECIES) {
    assert.equal(oceanReefResidentsSpeciesById[s.id], s); assert.ok(Object.isFrozen(s) && Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, 'region.reefGuild.preyOrganicUnits'); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => typeof item.url === 'string' && item.url.startsWith('https://') && typeof item.label === 'string'));
    assert.deepEqual(s.sourceLinks, s.sources); assert.ok(s.sourceLinks.every(item => !item.url.includes('australian.museum')));
    assert.ok(s.description && s.diet && s.behavior); assert.equal(s.calibratedMovementMPerS, null);
  }
  assert.equal(OCEAN_REEF_RESIDENT_SPECIES[0].referenceSizeM.measure, 'standard-length');
  assert.equal(OCEAN_REEF_RESIDENT_SPECIES[0].referenceSizeM.convertedToDisplayTotalLength, false);
  const lobster = OCEAN_REEF_RESIDENT_SPECIES[1]; assert.equal(lobster.sizeMeasure, 'body-total-length-excluding-antennae');
  assert.equal(lobster.morphology.legPairCount, 5); assert.equal(lobster.morphology.longAntennaCount, 2); assert.equal(lobster.morphology.largeChelae, false);
  assert.equal(lobster.support.footContacts.length, 10); assert.ok(lobster.support.footContacts.every(p => p.y === 0));
});

test('native coral trout has thick blue-spotted body, wide mouth and complete named fins without emission', t => {
  const root = createReefResidentAnimal('coral-trout'); t.after(() => disposeReefResidentAnimal(root));
  const names = meshes(root).map(o => o.name);
  for (const name of ['thick blue-spotted body', 'wide mouth rim and cavity', 'complete spiny and soft dorsal',
    'anal and paired pelvic fins', 'near-truncate complete caudal fin', 'complete pectoral fin -1', 'complete pectoral fin 1']) assert.ok(names.includes(name));
  const colors = root.getObjectByName('thick blue-spotted body').geometry.getAttribute('color');
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getZ(i) > colors.getX(i) * 2));
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1) < .015); assert.ok(size.y > .4 && size.z > .25);
  for (const mesh of meshes(root)) {
    assert.ok(mesh.geometry.index.count >= 3); assert.ok(mesh.geometry.getAttribute('normal').array.every(Number.isFinite));
    assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.emissiveIntensity, 0);
    assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite));
  }
});

test('native lobster separates antenna reach from body length and has ten real stationary contact tips', t => {
  const root = createReefResidentAnimal('painted-spiny-lobster'); t.after(() => disposeReefResidentAnimal(root));
  assert.equal(meshes(root).filter(o => /^walking leg /.test(o.name)).length, 10);
  assert.equal(meshes(root).filter(o => /^long white antenna /.test(o.name)).length, 2);
  assert.ok(root.getObjectByName('six separately banded abdominal segments')); assert.ok(root.getObjectByName('complete five-lobed tail fan'));
  const body = vertices(root).filter(p => p.x <= .501 && Math.abs(p.z) < .2), points = vertices(root);
  assert.ok(Math.abs(Math.max(...body.map(p => p.x)) - Math.min(...body.map(p => p.x)) - 1) < .025);
  assert.ok(Math.max(...points.map(p => p.x)) > 2); assert.ok(Math.min(...points.map(p => p.y)) >= -1e-7);
  for (const foot of root.userData.footContacts) assert.ok(points.some(p => p.distanceTo(new THREE.Vector3(foot.x, foot.y, foot.z)) < 1e-7));
  assert.equal(root.scale.x, 1); assert.equal(root.userData.sizeMeasure, 'body-total-length-excluding-antennae');
});

test('all native vertices stay inside shared animated envelopes including full lobster antennae and foot plane', t => {
  const roots = OCEAN_REEF_RESIDENT_IDS.map(createReefResidentAnimal); t.after(() => roots.forEach(disposeReefResidentAnimal));
  for (const root of roots) { const species = oceanReefResidentsSpeciesById[root.userData.speciesId], moving = freeze(agent(species.id)),
    before = structuredClone(moving), envelope = species.normalizedEnvelope;
    for (const velocity of [moving.velocity, { x: 0, y: 0, z: 0 }]) for (const clock of [0, .7, 1.4, 2.8, 4.2, 8.2]) {
      animateReefResidentAnimal(root, { ...moving, velocity }, clock);
      for (const p of vertices(root)) { for (const axis of ['x', 'y', 'z'])
        assert.ok(p[axis] >= envelope[axis][0] - 1e-6 && p[axis] <= envelope[axis][1] + 1e-6, `${species.id} ${clock} ${axis}=${p[axis]}`);
        assert.ok(Math.hypot(p.x, p.z) <= envelope.horizontalRadiusUnits + 1e-6); }
      if (species.id === 'painted-spiny-lobster') for (const foot of species.support.footContacts)
        assert.ok(vertices(root).some(p => p.distanceTo(new THREE.Vector3(foot.x, 0, foot.z)) < 1e-7));
    }
    assert.deepEqual(moving, before);
  }
});

test('animation consumes explicit model clock without editing agents and replayed same-time poses are exact', t => {
  const root = createReefResidentAnimal('coral-trout'), actual = freeze(agent('coral-trout')), before = structuredClone(actual);
  t.after(() => disposeReefResidentAnimal(root));
  animateReefResidentAnimal(root, actual, 3); const first = pose(root); animateReefResidentAnimal(root, actual, 19); const later = pose(root);
  assert.notDeepEqual(first, later); animateReefResidentAnimal(root, actual, 3); assert.deepEqual(pose(root), first);
  assert.deepEqual(actual, before); assert.ok(root.userData.sourceLinks.every(source => source.url));
});

test('shared native resources survive another real animal and are disposed once after the final owner', () => {
  const initial = reefResidentAssetStats(), first = createReefResidentAnimal('coral-trout'), second = createReefResidentAnimal('coral-trout');
  const geometry = meshes(first)[0].geometry; assert.equal(meshes(second)[0].geometry, geometry);
  let disposals = 0; geometry.addEventListener('dispose', () => disposals++);
  assert.equal(disposeReefResidentAnimal(first), true); assert.equal(disposals, 0); assert.equal(disposeReefResidentAnimal(first), false);
  assert.equal(animateReefResidentAnimal(first, agent('coral-trout'), 10), false);
  assert.equal(disposeReefResidentAnimal(second), true); assert.equal(disposals, 1); assert.deepEqual(reefResidentAssetStats(), initial);
  assert.equal(isReefResidentSpecies('green-chromis'), false); assert.throws(() => createReefResidentAnimal('green-chromis'), RangeError);
  assert.deepEqual(reefResidentAssetStats(), initial);
});
