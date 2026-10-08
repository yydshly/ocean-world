import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_LIFE_SPECIES, OCEAN_REEF_LIFE_IDS, oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
import { OCEAN_REEF_RESIDENT_IDS } from '../src/oceanReefResidentsSpecies.js';
import { OCEAN_REEF_DIVERSITY_IDS } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_COMMUNITY_IDS } from '../src/oceanReefCommunitySpecies.js';
import { createReefLifeFish, animateReefLifeFish, disposeReefLifeFish, isReefLifeFish,
  reefLifeFishAssetStats } from '../src/world/OceanReefLifeFishAssets.js';

// Native Three CPU form/pose evidence only. Ecological admission is verified
// separately; these checks do not establish GPU visibility or field calibration.
const FISH = ['copperband-butterflyfish', 'longnose-butterflyfish', 'fire-goby', 'pajama-cardinalfish'];
const meshes = root => { const found = []; root.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const vertices = root => { root.updateMatrixWorld(true); const found = []; for (const mesh of meshes(root)) {
  const positions = mesh.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++)
    found.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)); } return found; };
const pose = root => { root.updateMatrixWorld(true); const result = []; root.traverse(o => result.push(o.matrix.toArray())); return result; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const animal = id => freeze({ id: `life:${id}`, speciesId: id, alive: true, sizeM: oceanReefLifeSpeciesById[id].lengthM,
  position: { x: 13050, y: -8, z: 305 }, velocity: { x: .04, y: 0, z: .01 }, pitch: .05, heading: .6,
  state: 'foraging', organicUnits: .004, timeSec: 12 });

test('new six catalog avoids duplicate Linckia and preserves sourced depth, distinct units and actual support contacts', () => {
  assert.deepEqual(OCEAN_REEF_LIFE_IDS, [...FISH, 'banded-coral-shrimp', 'chocolate-chip-sea-star']);
  const old = [...OCEAN_REEF_RESIDENT_IDS, ...OCEAN_REEF_DIVERSITY_IDS, ...OCEAN_REEF_COMMUNITY_IDS];
  assert.equal(old.length, 14); assert.ok(OCEAN_REEF_LIFE_IDS.every(id => !old.includes(id)));
  assert.deepEqual(OCEAN_REEF_LIFE_SPECIES.map(s => s.foodPool), ['reefGuild.preyOrganicUnits', 'reefGuild.preyOrganicUnits',
    'resources.plankton', 'resources.plankton', 'reefGuild.preyOrganicUnits', 'resources.detritus']);
  for (const s of OCEAN_REEF_LIFE_SPECIES) {
    assert.equal(oceanReefLifeSpeciesById[s.id], s); assert.ok(Object.isFrozen(s) && Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, `region.${s.foodPool}`); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => typeof item.url === 'string' && item.url.startsWith('https://') && typeof item.label === 'string'));
    assert.deepEqual(s.sourceLinks, s.sources); assert.equal(s.calibratedMovementMPerS, null); assert.equal(s.naturalPopulationDensity, null);
    assert.deepEqual(s.admissionDepthM.range, s.depthSelectionM); assert.deepEqual(s.depthRangeM, s.depthSelectionM);
    assert.ok(s.sizeRangeM[0] <= s.lengthM && s.lengthM <= s.sizeRangeM[1]); assert.ok(s.description && s.diet && s.behavior);
  }
  assert.deepEqual(oceanReefLifeSpeciesById['fire-goby'].depthSelectionM, [6, 18]);
  assert.deepEqual(oceanReefLifeSpeciesById['pajama-cardinalfish'].depthSelectionM, [3, 14]);
  const shrimp = oceanReefLifeSpeciesById['banded-coral-shrimp'], star = oceanReefLifeSpeciesById['chocolate-chip-sea-star'];
  assert.equal(shrimp.morphology.chelatePairCount, 3); assert.equal(shrimp.morphology.groundWalkingPairCount, 2);
  assert.equal(shrimp.morphology.longAntennaCount, 4); assert.equal(shrimp.support.footContacts.length, 4);
  assert.equal(star.scientificName, 'Protoreaster nodosus'); assert.equal(star.sizeMeasure, 'body-diameter');
  assert.equal(star.support.footContacts.length, 10); assert.ok(star.support.footContacts.every(p => p.y === 0 && Math.hypot(p.x, p.z) > .17));
  assert.ok(star.substrate.includes('real-soft-sand')); assert.ok(!OCEAN_REEF_LIFE_SPECIES.some(s => s.scientificName === 'Linckia laevigata'));
});

test('native copperband retains silver copper bars, tubular snout, square backed fins and dorsal eyespot', t => {
  const root = createReefLifeFish('copperband-butterflyfish'); t.after(() => disposeReefLifeFish(root));
  for (const name of ['silver deep copperband body', 'copperband shorter tubular snout and terminal mouth',
    'complete square backed copperband dorsal and anal fins', 'rear dorsal false eyespot on both sides',
    'complete caudal fin', 'paired pectoral fin -1', 'paired pectoral fin 1']) assert.ok(root.getObjectByName(name));
  const colors = root.getObjectByName('silver deep copperband body').geometry.getAttribute('color');
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getZ(i) > .6));
  assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i => colors.getX(i) > .6 && colors.getZ(i) < .2));
  assert.ok(root.getObjectByName('rear dorsal false eyespot on both sides').geometry.boundingBox.min.y > .2);
});

test('native yellow forcepsfish differs in longer beak, black upper white lower head and anal eyespot', t => {
  const root = createReefLifeFish('longnose-butterflyfish'), copper = createReefLifeFish('copperband-butterflyfish');
  t.after(() => { disposeReefLifeFish(root); disposeReefLifeFish(copper); });
  for (const name of ['yellow forcepsfish body with black upper head', 'long narrow forceps snout with white lower head',
    'complete yellow spiny dorsal anal and paired pelvic fins', 'rear anal false eyespot on both sides']) assert.ok(root.getObjectByName(name));
  const forcepsSnout = root.getObjectByName('long narrow forceps snout with white lower head').geometry.boundingBox,
    copperSnout = copper.getObjectByName('copperband shorter tubular snout and terminal mouth').geometry.boundingBox;
  assert.ok(forcepsSnout.max.x - forcepsSnout.min.x > copperSnout.max.x - copperSnout.min.x + .1);
  assert.ok(root.getObjectByName('rear anal false eyespot on both sides').geometry.boundingBox.max.y < -.2);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()); assert.ok(size.y > .75 && size.z < .25);
});

test('native firegoby is a genuinely small white red slender fish with independent tall first dorsal and complete second fins', t => {
  const root = createReefLifeFish('fire-goby'); t.after(() => disposeReefLifeFish(root));
  for (const name of ['small white to red slender firegoby body', 'very long upright first dorsal fin',
    'long second dorsal anal and white paired pelvic fins', 'complete caudal fin']) assert.ok(root.getObjectByName(name));
  const box = new THREE.Box3().setFromObject(root); assert.ok(box.max.y > .65 && box.min.y > -.16);
  const bodyBox = root.getObjectByName('small white to red slender firegoby body').geometry.boundingBox;
  assert.ok(bodyBox.max.y - bodyBox.min.y < .16); assert.deepEqual(oceanReefLifeSpeciesById['fire-goby'].sizeRangeM, [.06, .085]);
  assert.ok(root.userData.motion.firstDorsal.isGroup);
});

test('native pajama cardinalfish retains large red iris eyes, yellow front, mid black bar, spotted rear and two dorsals', t => {
  const root = createReefLifeFish('pajama-cardinalfish'); t.after(() => disposeReefLifeFish(root));
  for (const name of ['yellow head mid black bar and spotted rear cardinal body', 'large paired eyes with red iris',
    'separate first spiny dorsal and second soft dorsal fins', 'complete anal and dark paired pelvic fins', 'complete caudal fin']) assert.ok(root.getObjectByName(name));
  const eyeColors = root.getObjectByName('large paired eyes with red iris').geometry.getAttribute('color');
  assert.ok(Array.from({ length: eyeColors.count }, (_, i) => i).some(i => eyeColors.getX(i) > eyeColors.getY(i) * 2));
  const body = root.getObjectByName('yellow head mid black bar and spotted rear cardinal body'),
    points = body.geometry.getAttribute('position'), colors = body.geometry.getAttribute('color');
  assert.ok(Array.from({ length: points.count }, (_, i) => i).some(i => points.getX(i) < -.03 && colors.getZ(i) > colors.getY(i)));
  assert.ok(Array.from({ length: points.count }, (_, i) => i).some(i => Math.abs(points.getX(i)) < .025 && colors.getX(i) < .2));
});

test('all native animated vertices remain finite and inside shared whole-form envelopes and horizontal disks', t => {
  const roots = FISH.map(createReefLifeFish); t.after(() => roots.forEach(disposeReefLifeFish));
  for (const root of roots) {
    const species = oceanReefLifeSpeciesById[root.userData.speciesId], actual = animal(species.id), before = structuredClone(actual), e = species.normalizedEnvelope;
    for (const moving of [true, false]) for (const clock of [0, .6, 1.2, 2.4, 5, 9, 21]) {
      animateReefLifeFish(root, moving ? actual : { ...actual, velocity: { x: 0, y: 0, z: 0 } }, clock);
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

test('native clock replay is exact and animation cannot edit ecology, root positions or true total-length scaling', t => {
  for (const id of FISH) {
    const root = createReefLifeFish(oceanReefLifeSpeciesById[id]), actual = animal(id), before = structuredClone(actual);
    t.after(() => disposeReefLifeFish(root)); animateReefLifeFish(root, actual, 3); const first = pose(root);
    animateReefLifeFish(root, actual, 19); assert.notDeepEqual(pose(root), first);
    animateReefLifeFish(root, actual, 3); assert.deepEqual(pose(root), first); assert.deepEqual(actual, before);
    assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    assert.ok(root.userData.sourceLinks.every(s => s.url));
    const box = new THREE.Box3().setFromObject(root); assert.ok(Math.abs(box.max.x - .5) < .012 && Math.abs(box.min.x + .5) < .012);
  }
});

test('native resource ownership is shared until the last real animal and rejects old or bottom species', () => {
  const initial = reefLifeFishAssetStats(), first = createReefLifeFish('fire-goby'), second = createReefLifeFish('fire-goby');
  const geometry = meshes(first)[0].geometry; assert.equal(meshes(second)[0].geometry, geometry); let disposals = 0;
  geometry.addEventListener('dispose', () => disposals++); assert.equal(disposeReefLifeFish(first), true); assert.equal(disposals, 0);
  assert.equal(disposeReefLifeFish(first), false); assert.equal(animateReefLifeFish(first, animal('fire-goby'), 4), false);
  assert.equal(disposeReefLifeFish(second), true); assert.equal(disposals, 1); assert.deepEqual(reefLifeFishAssetStats(), initial);
  for (const id of ['blue-starfish', 'yellow-boxfish', 'banded-coral-shrimp', 'chocolate-chip-sea-star', undefined]) {
    assert.equal(isReefLifeFish(id), false); assert.throws(() => createReefLifeFish(id), RangeError);
  }
  assert.deepEqual(reefLifeFishAssetStats(), initial);
});
