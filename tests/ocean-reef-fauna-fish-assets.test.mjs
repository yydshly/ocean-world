import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_FAUNA_SPECIES, OCEAN_REEF_FAUNA_IDS, oceanReefFaunaSpeciesById } from '../src/oceanReefFaunaSpecies.js';
import { OCEAN_REEF_RESIDENT_IDS } from '../src/oceanReefResidentsSpecies.js';
import { OCEAN_REEF_DIVERSITY_IDS } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_COMMUNITY_IDS } from '../src/oceanReefCommunitySpecies.js';
import { OCEAN_REEF_LIFE_IDS } from '../src/oceanReefLifeSpecies.js';
import { createReefFaunaFish, animateReefFaunaFish, disposeReefFaunaFish, isReefFaunaFish,
  reefFaunaFishAssetStats } from '../src/world/OceanReefFaunaFishAssets.js';

// Native Three CPU geometry/pose evidence only, without GPU visibility claims.
const FISH = ['humphead-wrasse', 'bluespine-unicornfish', 'clown-triggerfish'];
const meshes = root => { const found = []; root.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const vertices = root => { root.updateMatrixWorld(true); const found = []; for (const mesh of meshes(root)) {
  const positions = mesh.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++)
    found.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)); } return found; };
const pose = root => { root.updateMatrixWorld(true); const result = []; root.traverse(o => result.push(o.matrix.toArray())); return result; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const animal = id => freeze({ id: `fauna:${id}`, speciesId: id, alive: true, sizeM: oceanReefFaunaSpeciesById[id].lengthM,
  position: { x: 13050, y: -8, z: 305 }, velocity: { x: .04, y: 0, z: .01 }, pitch: .05, heading: .6,
  state: 'foraging', organicUnits: .004, timeSec: 12 });
const anyColor = (mesh, predicate) => { const c = mesh.geometry.getAttribute('color');
  return Array.from({ length: c.count }, (_, i) => i).some(i => predicate(c.getX(i), c.getY(i), c.getZ(i), i)); };

test('six new fauna identities retain honest adult selections, FL versus TL, depths, food proxies and actual bottom contacts', () => {
  assert.deepEqual(OCEAN_REEF_FAUNA_IDS, [...FISH, 'shame-faced-crab', 'wedge-sea-hare', 'varicose-phyllidia']);
  const old = [...OCEAN_REEF_RESIDENT_IDS, ...OCEAN_REEF_DIVERSITY_IDS, ...OCEAN_REEF_COMMUNITY_IDS, ...OCEAN_REEF_LIFE_IDS];
  assert.equal(old.length, 20); assert.ok(OCEAN_REEF_FAUNA_IDS.every(id => !old.includes(id)));
  assert.deepEqual(OCEAN_REEF_FAUNA_SPECIES.map(s => s.scientificName), ['Cheilinus undulatus', 'Naso unicornis',
    'Balistoides conspicillum', 'Calappa hepatica', 'Dolabella auricularia', 'Phyllidia varicosa']);
  assert.deepEqual(OCEAN_REEF_FAUNA_SPECIES.map(s => s.foodPool), ['reefGuild.preyOrganicUnits', 'resources.algae',
    'reefGuild.preyOrganicUnits', 'reefGuild.preyOrganicUnits', 'resources.algae', 'reefGuild.preyOrganicUnits']);
  for (const s of OCEAN_REEF_FAUNA_SPECIES) {
    assert.equal(oceanReefFaunaSpeciesById[s.id], s); assert.ok(Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, `region.${s.foodPool}`); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => typeof item.url === 'string' && item.url.startsWith('https://') && item.label));
    assert.deepEqual(s.sourceLinks, s.sources); assert.equal(s.calibratedMovementMPerS, null); assert.equal(s.naturalPopulationDensity, null);
    assert.deepEqual(s.admissionDepthM.range, s.depthSelectionM); assert.deepEqual(s.depthRangeM, s.depthSelectionM);
    assert.ok(s.sizeRangeM[0] <= s.lengthM && s.lengthM <= s.sizeRangeM[1]); assert.ok(s.description && s.diet && s.behavior);
  }
  assert.deepEqual(oceanReefFaunaSpeciesById['humphead-wrasse'].depthSelectionM, [10, 18]);
  const unicorn = oceanReefFaunaSpeciesById['bluespine-unicornfish'];
  assert.equal(unicorn.sizeMeasure, 'total-length'); assert.equal(unicorn.referenceSizeM.measure, 'fork-length');
  assert.equal(unicorn.referenceSizeM.directlyConvertedToTotalLength, false);
  const crab = oceanReefFaunaSpeciesById['shame-faced-crab'], hare = oceanReefFaunaSpeciesById['wedge-sea-hare'], slug = oceanReefFaunaSpeciesById['varicose-phyllidia'];
  assert.equal(crab.support.footContacts.length, 8); assert.equal(crab.sizeMeasure, 'carapace-width');
  assert.deepEqual(crab.morphology.shellMeasuredZ, [-.5, .5]); assert.deepEqual(crab.sizeRangeM, [.05, .075]);
  for (const s of [hare, slug]) { assert.equal(s.support.footContacts.length, 6); assert.equal(s.morphology.continuousMuscularSole, true);
    assert.ok(s.support.footContacts.every(p => p.y === 0)); }
  assert.deepEqual(hare.depthSelectionM, [3, 15]); assert.deepEqual(slug.depthSelectionM, [5, 18]);
  assert.equal(slug.morphology.radulaPresent, false); assert.equal(slug.morphology.jawPresent, false);
  assert.equal(slug.morphology.dorsalGillPlumePresent, false); assert.ok(slug.diet.includes('海绵'));
});

test('native adult humphead wrasse has a broad thick body, genuine forehead volume, thick lips and complete rounded tail', t => {
  const root = createReefFaunaFish('humphead-wrasse'); t.after(() => disposeReefFaunaFish(root));
  const body = root.getObjectByName('large thick green wrasse body with curved scale lines'),
    hump = root.getObjectByName('adult forehead hump joined to head'), lips = root.getObjectByName('thick rubbery paired lips and terminal mouth');
  assert.ok(body && hump && lips && root.getObjectByName('two dark curved lines behind each wrasse eye'));
  assert.ok(body.geometry.boundingBox.max.z - body.geometry.boundingBox.min.z > .30);
  assert.ok(hump.geometry.boundingBox.max.y > .30 && hump.geometry.boundingBox.min.y < .11);
  assert.ok(lips.geometry.boundingBox.max.x > .499 && lips.geometry.boundingBox.max.z > .043);
  for (const name of ['complete long low dorsal anal and pelvic wrasse fins', 'complete caudal fin',
    'paired pectoral fin -1', 'paired pectoral fin 1']) assert.ok(root.getObjectByName(name));
  assert.ok(oceanReefFaunaSpeciesById['humphead-wrasse'].lengthM > .8);
});

test('native bluespine unicornfish has a short horn behind its mouth and actual blue plates with anterior scalpels', t => {
  const root = createReefFaunaFish('bluespine-unicornfish'); t.after(() => disposeReefFaunaFish(root));
  const horn = root.getObjectByName('short forehead horn ending behind mouth'), mouth = root.getObjectByName('small terminal mouth beyond horn'),
    plates = root.getObjectByName('paired blue peduncle plates and forward directed scalpel spines');
  assert.ok(horn && mouth && plates); assert.ok(horn.geometry.boundingBox.max.x < mouth.geometry.boundingBox.min.x);
  assert.ok(horn.geometry.boundingBox.max.y > .24); assert.ok(plates.geometry.boundingBox.min.z < -.03 && plates.geometry.boundingBox.max.z > .03);
  assert.ok(anyColor(plates, (r, g, b) => b > g && g > r));
  assert.ok(root.getObjectByName('long yellow median fins with narrow blue outer margins'));
  assert.ok(root.getObjectByName('complete caudal fin')); assert.equal(root.userData.motion.pectorals.length, 2);
});

test('native clown triggerfish uses the distinct adult lower white spots upper network orange lips and trigger spine', t => {
  const root = createReefFaunaFish('clown-triggerfish'); t.after(() => disposeReefFaunaFish(root));
  const body = root.getObjectByName('deep black adult triggerfish with white lower spots and yellow upper network'),
    positions = body.geometry.getAttribute('position'), lips = root.getObjectByName('orange thick lips and short terminal mouth');
  assert.ok(anyColor(body, (r, g, b, i) => positions.getY(i) < 0 && r > .8 && b > .6));
  assert.ok(anyColor(body, (r, g, b, i) => positions.getY(i) < 0 && r < .2 && b < .2));
  assert.ok(anyColor(body, (r, g, b, i) => positions.getY(i) > .14 && r > .6 && b < .3));
  assert.ok(anyColor(lips, (r, g, b) => r > .7 && b < .15));
  assert.ok(root.getObjectByName('pale band across adult snout in front of eyes'));
  assert.ok(root.getObjectByName('separate upright trigger spine and complete soft median fins').geometry.boundingBox.max.y > .39);
  assert.ok(anyColor(root.getObjectByName('complete caudal fin'), (r, g, b) => r > .7 && b > .3));
});

test('all moving and resting native full vertices remain finite inside shared axis and horizontal disk envelopes', t => {
  const roots = FISH.map(createReefFaunaFish); t.after(() => roots.forEach(disposeReefFaunaFish));
  for (const root of roots) {
    const species = oceanReefFaunaSpeciesById[root.userData.speciesId], actual = animal(species.id), before = structuredClone(actual), e = species.normalizedEnvelope;
    for (const moving of [true, false]) for (const clock of [0, .6, 1.2, 2.4, 5, 9, 21]) {
      animateReefFaunaFish(root, moving ? actual : { ...actual, velocity: { x: 0, y: 0, z: 0 } }, clock);
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

test('native true total length is one unit and external world scaling remains unchanged by fish animation', t => {
  for (const id of FISH) {
    const root = createReefFaunaFish(id), actual = animal(id), e = oceanReefFaunaSpeciesById[id].normalizedEnvelope;
    t.after(() => disposeReefFaunaFish(root)); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    const box = new THREE.Box3().setFromObject(root); assert.ok(Math.abs(box.max.x - .5) < .012 && Math.abs(box.min.x + .5) < .012);
    root.scale.setScalar(actual.sizeM); root.position.set(100, -8, 70); animateReefFaunaFish(root, actual, 3);
    assert.deepEqual(root.position.toArray(), [100, -8, 70]); assert.deepEqual(root.scale.toArray(), [actual.sizeM, actual.sizeM, actual.sizeM]);
    for (const p of vertices(root)) for (const [axis, origin] of [['x', 100], ['y', -8], ['z', 70]]) {
      assert.ok(p[axis] >= origin + e[axis][0] * actual.sizeM - 1e-6 && p[axis] <= origin + e[axis][1] * actual.sizeM + 1e-6);
    }
    assert.ok(root.userData.sourceLinks.every(item => item.url));
  }
});

test('native explicit clock replay and fixed clock preserve ecology and exactly freeze the local pose', t => {
  for (const id of FISH) {
    const root = createReefFaunaFish(oceanReefFaunaSpeciesById[id]), actual = animal(id), before = structuredClone(actual);
    t.after(() => disposeReefFaunaFish(root)); root.userData.phase = .42; animateReefFaunaFish(root, actual, 3); const first = pose(root);
    animateReefFaunaFish(root, actual, 19); assert.notDeepEqual(pose(root), first);
    animateReefFaunaFish(root, actual, 3); assert.deepEqual(pose(root), first);
    animateReefFaunaFish(root, actual, 3); assert.deepEqual(pose(root), first); assert.deepEqual(actual, before);
    assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  }
});

test('native resources release at the last animal once and reject historical or bottom identities', () => {
  const initial = reefFaunaFishAssetStats(), first = createReefFaunaFish('bluespine-unicornfish'), second = createReefFaunaFish('bluespine-unicornfish');
  const parent = new THREE.Group(); parent.add(first, second);
  const geometry = meshes(first)[0].geometry; assert.equal(meshes(second)[0].geometry, geometry); let disposals = 0;
  geometry.addEventListener('dispose', () => disposals++); assert.equal(disposeReefFaunaFish(first), true); assert.equal(disposals, 0);
  assert.equal(first.parent, null); assert.equal(disposeReefFaunaFish(first), false); assert.equal(animateReefFaunaFish(first, animal('bluespine-unicornfish'), 4), false);
  assert.equal(disposeReefFaunaFish(second), true); assert.equal(disposals, 1); assert.equal(parent.children.length, 0); assert.deepEqual(reefFaunaFishAssetStats(), initial);
  for (const id of ['day-octopus', 'reef-cuttlefish', 'clown-anemonefish', 'red-toothed-triggerfish', 'shame-faced-crab', 'varicose-phyllidia', undefined]) {
    assert.equal(isReefFaunaFish(id), false); assert.throws(() => createReefFaunaFish(id), RangeError);
  }
  assert.deepEqual(reefFaunaFishAssetStats(), initial);
});
