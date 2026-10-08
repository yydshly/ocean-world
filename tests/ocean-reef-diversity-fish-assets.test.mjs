import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_DIVERSITY_SPECIES, OCEAN_REEF_DIVERSITY_IDS, oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_RESIDENT_IDS } from '../src/oceanReefResidentsSpecies.js';
import { createReefDiversityFish, animateReefDiversityFish, disposeReefDiversityFish, isReefDiversityFish,
  reefDiversityFishAssetStats } from '../src/world/OceanReefDiversityFishAssets.js';

// Native Three CPU shape/pose evidence, not GPU visibility, field anatomy or
// ecological admission. Controller/native integration owns live-world checks.
const FISH = ['lionfish', 'chinese-trumpetfish', 'moorish-idol', 'sailfin-tang'];
const meshes = root => { const found = []; root.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const vertices = root => { root.updateMatrixWorld(true); const found = []; for (const mesh of meshes(root)) {
  const positions = mesh.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++)
    found.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)); } return found; };
const pose = root => { root.updateMatrixWorld(true); const result = []; root.traverse(o => result.push(o.matrix.toArray())); return result; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const animal = id => freeze({ id: `diversity:${id}`, speciesId: id, alive: true, sizeM: .25, position: { x: 13050, y: -5, z: 305 },
  velocity: { x: .04, y: 0, z: .01 }, pitch: .05, heading: .6, state: 'foraging', organicUnits: .004, timeSec: 12 });

test('six new sourced species preserve the legacy two and have four precise local food pools and immutable full forms', () => {
  assert.deepEqual(OCEAN_REEF_RESIDENT_IDS, ['coral-trout', 'painted-spiny-lobster']);
  assert.deepEqual(OCEAN_REEF_DIVERSITY_IDS, [...FISH, 'cushion-sea-star', 'leopard-sea-cucumber']);
  assert.deepEqual(OCEAN_REEF_DIVERSITY_SPECIES.map(s => s.foodPool), ['reefGuild.preyOrganicUnits', 'reefGuild.preyOrganicUnits',
    'reefGuild.preyOrganicUnits', 'resources.algae', 'basicNetwork.coralOrganicUnits', 'resources.detritus']);
  for (const s of OCEAN_REEF_DIVERSITY_SPECIES) {
    assert.equal(oceanReefDiversitySpeciesById[s.id], s); assert.ok(Object.isFrozen(s) && Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, `region.${s.foodPool}`); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => typeof item.url === 'string' && item.url.startsWith('https://') && typeof item.label === 'string'));
    assert.deepEqual(s.sourceLinks, s.sources); assert.equal(s.calibratedMovementMPerS, null); assert.equal(s.naturalPopulationDensity, null);
    assert.ok(s.description && s.diet && s.behavior); assert.ok(s.sizeRangeM[0] <= s.lengthM && s.lengthM <= s.sizeRangeM[1]);
  }
  const star = oceanReefDiversitySpeciesById['cushion-sea-star'], cucumber = oceanReefDiversitySpeciesById['leopard-sea-cucumber'];
  assert.equal(star.sizeMeasure, 'body-diameter'); assert.equal(star.support.footContacts.length, 10);
  assert.ok(star.support.footContacts.every(p => Math.hypot(p.x, p.z) > .15 && p.y === 0));
  assert.equal(cucumber.support.footContacts.length, 10); assert.equal(cucumber.referenceSizeM.driedLengthUsed, false);
  assert.match(oceanReefDiversitySpeciesById['moorish-idol'].feedingProxy.selectedFoodComponent, /sponge/);
});

test('native lionfish has broad bilateral radiating fans and thirteen complete dorsal spines', t => {
  const root = createReefDiversityFish('lionfish'); t.after(() => disposeReefDiversityFish(root));
  assert.ok(root.getObjectByName('thirteen long dorsal spines with membranes'));
  for (const side of [-1, 1]) assert.ok(root.getObjectByName(`wide radiating pectoral fan ${side}`));
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  assert.ok(size.z > 1.1 && box.max.y > .7); assert.ok(root.getObjectByName('broad mouth and head appendages'));
});

test('native trumpetfish retains long tubular snout, narrow body, short spines and posterior paired median fins', t => {
  const root = createReefDiversityFish('chinese-trumpetfish'); t.after(() => disposeReefDiversityFish(root));
  assert.ok(root.getObjectByName('long tubular snout and small terminal mouth'));
  assert.ok(root.getObjectByName('ten isolated short dorsal spines')); assert.ok(root.getObjectByName('posterior dorsal and anal fins'));
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1) < .012 && size.y < .23 && size.z < .15);
});

test('native Moorish idol retains a compressed black white yellow disc, snout and long complete dorsal pennant', t => {
  const root = createReefDiversityFish('moorish-idol'); t.after(() => disposeReefDiversityFish(root));
  assert.ok(root.getObjectByName('long curved dorsal pennant')); assert.ok(root.getObjectByName('tubular small snout and eye horns'));
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  assert.ok(box.max.y > .85 && box.min.x < -.59 && size.z < .25);
  const colors = root.getObjectByName('black white yellow disc body').geometry.getAttribute('color');
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) < .1));
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) > .85));
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) > .8 && colors.getZ(i) < .25));
});

test('native sailfin tang has tall barred dorsal and anal sails plus complete caudal and paired fins', t => {
  const root = createReefDiversityFish('sailfin-tang'); t.after(() => disposeReefDiversityFish(root));
  for (const name of ['tall complete sail dorsal fin', 'wide complete sail anal and pelvic fins', 'two short caudal peduncle spines',
    'complete caudal fin', 'paired pectoral fin -1', 'paired pectoral fin 1']) assert.ok(root.getObjectByName(name));
  const box = new THREE.Box3().setFromObject(root); assert.ok(box.max.y > .63 && box.min.y < -.55);
  assert.equal(root.userData.sizeMeasure, 'total-length'); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
});

test('all native fish finite vertices and bounded animation fit the shared full-envelope including rays and pennant', t => {
  const roots = FISH.map(createReefDiversityFish); t.after(() => roots.forEach(disposeReefDiversityFish));
  for (const root of roots) {
    const species = oceanReefDiversitySpeciesById[root.userData.speciesId], actual = animal(species.id), before = structuredClone(actual), e = species.normalizedEnvelope;
    for (const moving of [true, false]) for (const clock of [0, .6, 1.2, 2.4, 5, 9, 21]) {
      animateReefDiversityFish(root, moving ? actual : { ...actual, velocity: { x: 0, y: 0, z: 0 } }, clock);
      for (const p of vertices(root)) {
        for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - 1e-6 && p[axis] <= e[axis][1] + 1e-6,
          `${species.id} t=${clock} ${axis}=${p[axis]}`);
        assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + 1e-6, `${species.id} disk`);
      }
    }
    assert.deepEqual(actual, before);
    for (const mesh of meshes(root)) { assert.ok(mesh.geometry.index.count > 0); assert.ok(mesh.geometry.getAttribute('normal').array.every(Number.isFinite));
      assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.emissiveIntensity, 0); }
  }
});

test('native animation uses explicit clock, is repeatable and does not write animal pose, ecology or scale', t => {
  for (const id of FISH) {
    const root = createReefDiversityFish(oceanReefDiversitySpeciesById[id]), actual = animal(id), before = structuredClone(actual);
    t.after(() => disposeReefDiversityFish(root)); animateReefDiversityFish(root, actual, 3); const first = pose(root);
    animateReefDiversityFish(root, actual, 19); assert.notDeepEqual(pose(root), first);
    animateReefDiversityFish(root, actual, 3); assert.deepEqual(pose(root), first); assert.deepEqual(actual, before);
    assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    assert.ok(root.userData.sourceLinks.every(s => s.url));
  }
});

test('shared native resources retain real owners and final dispose happens once without accepting other species', () => {
  const initial = reefDiversityFishAssetStats(), first = createReefDiversityFish('lionfish'), second = createReefDiversityFish('lionfish');
  const geometry = meshes(first)[0].geometry; assert.equal(meshes(second)[0].geometry, geometry); let disposals = 0;
  geometry.addEventListener('dispose', () => disposals++); assert.equal(disposeReefDiversityFish(first), true); assert.equal(disposals, 0);
  assert.equal(disposeReefDiversityFish(first), false); assert.equal(animateReefDiversityFish(first, animal('lionfish'), 4), false);
  assert.equal(disposeReefDiversityFish(second), true); assert.equal(disposals, 1); assert.deepEqual(reefDiversityFishAssetStats(), initial);
  for (const id of ['coral-trout', 'cushion-sea-star', 'green-chromis', undefined]) {
    assert.equal(isReefDiversityFish(id), false); assert.throws(() => createReefDiversityFish(id), RangeError);
  }
  assert.deepEqual(reefDiversityFishAssetStats(), initial);
});
