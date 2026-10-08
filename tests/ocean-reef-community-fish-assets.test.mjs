import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_COMMUNITY_SPECIES, OCEAN_REEF_COMMUNITY_IDS, oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { OCEAN_REEF_RESIDENT_IDS } from '../src/oceanReefResidentsSpecies.js';
import { OCEAN_REEF_DIVERSITY_IDS } from '../src/oceanReefDiversitySpecies.js';
import { createReefCommunityFish, animateReefCommunityFish, disposeReefCommunityFish, isReefCommunityFish,
  reefCommunityFishAssetStats } from '../src/world/OceanReefCommunityFishAssets.js';

// Native Three CPU form, animation, metadata and ownership checks. This is not
// GPU visibility, field anatomy calibration or live-world ecological admission.
const FISH = ['yellow-boxfish', 'red-toothed-triggerfish', 'longfin-batfish', 'valentini-puffer'];
const meshes = root => { const found = []; root.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const vertices = root => { root.updateMatrixWorld(true); const found = []; for (const mesh of meshes(root)) {
  const positions = mesh.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++)
    found.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)); } return found; };
const pose = root => { root.updateMatrixWorld(true); const result = []; root.traverse(o => result.push(o.matrix.toArray())); return result; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const animal = id => freeze({ id: `community:${id}`, speciesId: id, alive: true, sizeM: oceanReefCommunitySpeciesById[id].lengthM,
  position: { x: 13050, y: -5, z: 305 }, velocity: { x: .04, y: 0, z: .01 }, pitch: .05, heading: .6,
  state: 'foraging', organicUnits: .004, timeSec: 12 });

test('six genuinely new sourced species retain old catalogs and expose three distinct selected food pools', () => {
  assert.deepEqual(OCEAN_REEF_RESIDENT_IDS, ['coral-trout', 'painted-spiny-lobster']);
  assert.deepEqual(OCEAN_REEF_DIVERSITY_IDS, ['lionfish', 'chinese-trumpetfish', 'moorish-idol', 'sailfin-tang', 'cushion-sea-star', 'leopard-sea-cucumber']);
  assert.deepEqual(OCEAN_REEF_COMMUNITY_IDS, [...FISH, 'peacock-mantis-shrimp', 'green-turban-snail']);
  assert.deepEqual(OCEAN_REEF_COMMUNITY_SPECIES.map(s => s.foodPool), ['reefGuild.preyOrganicUnits', 'resources.plankton',
    'resources.algae', 'reefGuild.preyOrganicUnits', 'reefGuild.preyOrganicUnits', 'resources.algae']);
  for (const s of OCEAN_REEF_COMMUNITY_SPECIES) {
    assert.equal(oceanReefCommunitySpeciesById[s.id], s); assert.ok(Object.isFrozen(s) && Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, `region.${s.foodPool}`); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => typeof item.url === 'string' && item.url.startsWith('https://') && typeof item.label === 'string'));
    assert.deepEqual(s.sourceLinks, s.sources); assert.equal(s.calibratedMovementMPerS, null); assert.equal(s.naturalPopulationDensity, null);
    assert.deepEqual(s.depthSelectionM, [3, 18]); assert.ok(s.sizeRangeM[0] <= s.lengthM && s.lengthM <= s.sizeRangeM[1]);
    assert.ok(s.description && s.diet && s.behavior); assert.ok(![...OCEAN_REEF_RESIDENT_IDS, ...OCEAN_REEF_DIVERSITY_IDS].includes(s.id));
  }
  const mantis = oceanReefCommunitySpeciesById['peacock-mantis-shrimp'], snail = oceanReefCommunitySpeciesById['green-turban-snail'];
  assert.equal(mantis.morphology.legPairCount, 3); assert.equal(mantis.morphology.raptorialAppendageCount, 2);
  assert.equal(mantis.support.footContacts.length, 6); assert.ok(mantis.support.footContacts.every(p => p.y === 0));
  assert.equal(snail.sizeMeasure, 'shell-width'); assert.equal(snail.support.footContacts.length, 6);
  assert.equal(snail.morphology.supportContactType, 'samples-of-continuous-muscular-foot-not-six-legs');
});

test('native boxfish has a volumetric rounded rectangular rigid carapace and complete small fins', t => {
  const root = createReefCommunityFish('yellow-boxfish'); t.after(() => disposeReefCommunityFish(root));
  const body = root.getObjectByName('rounded rectangular rigid boxfish carapace'); assert.ok(body);
  const positions = body.geometry.getAttribute('position');
  assert.ok(Array.from({ length: positions.count }, (_, i) => i).some(i => Math.abs(positions.getY(i)) > .17 && Math.abs(positions.getZ(i)) > .14),
    'cross section reaches rectangular corners rather than an elliptical replacement');
  for (const name of ['small terminal mouth and forehead bump', 'small posterior dorsal and anal fins', 'complete caudal fin',
    'paired pectoral fin -1', 'paired pectoral fin 1']) assert.ok(root.getObjectByName(name));
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()); assert.ok(size.y > .45 && size.z > .4);
});

test('native triggerfish has two upper red teeth, visible dorsal trigger and complete elevated fins and lyre tail', t => {
  const root = createReefCommunityFish('red-toothed-triggerfish'); t.after(() => disposeReefCommunityFish(root));
  for (const name of ['upturned mouth with two long red upper teeth', 'distinct first dorsal trigger spine',
    'elevated complete soft dorsal and anal fins', 'posterior lateral small spines', 'complete caudal fin']) assert.ok(root.getObjectByName(name));
  const toothColors = root.getObjectByName('upturned mouth with two long red upper teeth').geometry.getAttribute('color');
  assert.ok(Array.from({ length: toothColors.count }, (_, i) => i).some(i => toothColors.getX(i) > toothColors.getY(i) * 2));
  const box = new THREE.Box3().setFromObject(root); assert.ok(box.max.y > .44 && box.min.y < -.38);
  const tail = root.getObjectByName('complete caudal fin').geometry.boundingBox; assert.ok(tail.max.y > .33 && tail.min.y < -.33);
});

test('native batfish uses non juvenile wide silver body with eye and pectoral bars and complete rounded adult fins', t => {
  const root = createReefCommunityFish('longfin-batfish'); t.after(() => disposeReefCommunityFish(root));
  for (const name of ['non juvenile deep rounded silver batfish body', 'near vertical roundface and small terminal mouth',
    'complete adult rounded dorsal fin without juvenile filament', 'complete adult anal and yellow pelvic fins']) assert.ok(root.getObjectByName(name));
  const box = new THREE.Box3().setFromObject(root); assert.ok(box.max.y > .70 && box.min.y < -.63);
  const species = oceanReefCommunitySpeciesById['longfin-batfish']; assert.equal(species.lifeStage, 'non-juvenile-adult-form-representative');
  assert.equal(species.referenceSizeM.adultHumpReference.measure, 'standard-length');
  assert.equal(species.referenceSizeM.adultHumpReference.convertedToDisplayTotalLength, false);
  const colors = root.getObjectByName('non juvenile deep rounded silver batfish body').geometry.getAttribute('color');
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) < .2));
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) > .6));
});

test('native Valentini toby keeps four dark saddles, small sharp snout, natural small size and no inflated or spined substitute', t => {
  const root = createReefCommunityFish('valentini-puffer'); t.after(() => disposeReefCommunityFish(root));
  const body = root.getObjectByName('small uninflated rounded toby with four black saddles'); assert.ok(body);
  const positions = body.geometry.getAttribute('position'), colors = body.geometry.getAttribute('color');
  for (const x of [-.25, -.065, .135, .31]) assert.ok(Array.from({ length: positions.count }, (_, i) => i).some(i =>
    Math.abs(positions.getX(i) - x) < .02 && positions.getY(i) > .02 && colors.getX(i) < .2));
  assert.ok(root.getObjectByName('sharp small puffer snout without spines'));
  assert.ok(root.getObjectByName('small posterior dorsal and anal fins without pelvic fins'));
  const species = oceanReefCommunitySpeciesById['valentini-puffer']; assert.deepEqual(species.sizeRangeM, [.07, .10]);
  assert.equal(species.referenceSizeM.maximum, .11);
});

test('all native fish finite vertices and bounded poses fit shared full envelopes and horizontal admission disks', t => {
  const roots = FISH.map(createReefCommunityFish); t.after(() => roots.forEach(disposeReefCommunityFish));
  for (const root of roots) {
    const species = oceanReefCommunitySpeciesById[root.userData.speciesId], actual = animal(species.id), before = structuredClone(actual), e = species.normalizedEnvelope;
    for (const moving of [true, false]) for (const clock of [0, .6, 1.2, 2.4, 5, 9, 21]) {
      animateReefCommunityFish(root, moving ? actual : { ...actual, velocity: { x: 0, y: 0, z: 0 } }, clock);
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

test('native fin animation uses only explicit model clock and leaves actual agent records and root scale unchanged', t => {
  for (const id of FISH) {
    const root = createReefCommunityFish(oceanReefCommunitySpeciesById[id]), actual = animal(id), before = structuredClone(actual);
    t.after(() => disposeReefCommunityFish(root)); animateReefCommunityFish(root, actual, 3); const first = pose(root);
    animateReefCommunityFish(root, actual, 19); assert.notDeepEqual(pose(root), first);
    animateReefCommunityFish(root, actual, 3); assert.deepEqual(pose(root), first); assert.deepEqual(actual, before);
    assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    assert.ok(root.userData.sourceLinks.every(s => s.url));
    const box = new THREE.Box3().setFromObject(root); assert.ok(Math.abs(box.max.x - .5) < .012 && Math.abs(box.min.x + .5) < .012);
  }
});

test('shared native resources survive remaining owners and dispose exactly once without accepting previous species', () => {
  const initial = reefCommunityFishAssetStats(), first = createReefCommunityFish('yellow-boxfish'), second = createReefCommunityFish('yellow-boxfish');
  const geometry = meshes(first)[0].geometry; assert.equal(meshes(second)[0].geometry, geometry); let disposals = 0;
  geometry.addEventListener('dispose', () => disposals++); assert.equal(disposeReefCommunityFish(first), true); assert.equal(disposals, 0);
  assert.equal(disposeReefCommunityFish(first), false); assert.equal(animateReefCommunityFish(first, animal('yellow-boxfish'), 4), false);
  assert.equal(disposeReefCommunityFish(second), true); assert.equal(disposals, 1); assert.deepEqual(reefCommunityFishAssetStats(), initial);
  for (const id of ['coral-trout', 'lionfish', 'green-turban-snail', undefined]) {
    assert.equal(isReefCommunityFish(id), false); assert.throws(() => createReefCommunityFish(id), RangeError);
  }
  assert.deepEqual(reefCommunityFishAssetStats(), initial);
});
