import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OCEAN_REEF_ASSEMBLAGE_SPECIES, OCEAN_REEF_ASSEMBLAGE_IDS, oceanReefAssemblageSpeciesById } from '../src/oceanReefAssemblageSpecies.js';
import { OCEAN_REEF_RESIDENT_IDS } from '../src/oceanReefResidentsSpecies.js';
import { OCEAN_REEF_DIVERSITY_IDS } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_COMMUNITY_IDS } from '../src/oceanReefCommunitySpecies.js';
import { OCEAN_REEF_LIFE_IDS } from '../src/oceanReefLifeSpecies.js';
import { OCEAN_REEF_FAUNA_IDS } from '../src/oceanReefFaunaSpecies.js';
import { createReefAssemblageFish, animateReefAssemblageFish, disposeReefAssemblageFish, isReefAssemblageFish,
  reefAssemblageFishAssetStats } from '../src/world/OceanReefAssemblageFishAssets.js';

// Native CPU Three evidence: real vertices and transforms, not GPU visibility.
const FISH = ['giant-moray', 'banded-pipefish', 'spot-fin-porcupinefish'];
const meshes = root => { const result = []; root.traverse(o => { if (o.isMesh) result.push(o); }); return result; };
const vertices = root => { root.updateMatrixWorld(true); const result = []; for (const mesh of meshes(root)) {
  const a = mesh.geometry.getAttribute('position'); for (let i = 0; i < a.count; i++)
    result.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld)); } return result; };
const snapshot = root => { root.updateMatrixWorld(true); const matrices = []; root.traverse(o => matrices.push(o.matrix.toArray()));
  return { matrices, deformed: root.userData.deformableParts.map(({ mesh }) => Array.from(mesh.geometry.getAttribute('position').array)) }; };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const animal = id => freeze({ id: `assemblage:${id}`, speciesId: id, alive: true, sizeM: oceanReefAssemblageSpeciesById[id].lengthM,
  position: { x: 13050, y: -8, z: 305 }, velocity: { x: .04, y: 0, z: .01 }, pitch: .05, heading: .6,
  state: 'foraging', organicUnits: .004, timeSec: 12 });
const anyColor = (mesh, predicate) => { const c = mesh.geometry.getAttribute('color');
  return Array.from({ length: c.count }, (_, i) => i).some(i => predicate(c.getX(i), c.getY(i), c.getZ(i), i)); };

test('six new assemblage identities distinguish accepted pipefish name, measured sizes, food proxies and actual support samples', () => {
  assert.deepEqual(OCEAN_REEF_ASSEMBLAGE_IDS, [...FISH, 'peacock-flounder', 'textile-cone', 'collector-urchin']);
  const old = [...OCEAN_REEF_RESIDENT_IDS, ...OCEAN_REEF_DIVERSITY_IDS, ...OCEAN_REEF_COMMUNITY_IDS, ...OCEAN_REEF_LIFE_IDS, ...OCEAN_REEF_FAUNA_IDS];
  assert.equal(old.length, 26); assert.ok(OCEAN_REEF_ASSEMBLAGE_IDS.every(id => !old.includes(id)));
  assert.deepEqual(OCEAN_REEF_ASSEMBLAGE_SPECIES.map(s => s.scientificName), ['Gymnothorax javanicus', 'Dunckerocampus dactyliophorus',
    'Diodon hystrix', 'Bothus mancus', 'Conus textile', 'Tripneustes gratilla']);
  for (const s of OCEAN_REEF_ASSEMBLAGE_SPECIES) {
    assert.equal(oceanReefAssemblageSpeciesById[s.id], s); assert.ok(Object.isFrozen(s.normalizedEnvelope.x));
    assert.equal(s.feedingProxy.resourcePath, `region.${s.foodPool}`); assert.equal(s.feedingProxy.visiblePreyKillImplemented, false);
    assert.ok(s.sourceLinks.every(item => item.url?.startsWith('https://') && item.label)); assert.deepEqual(s.sourceLinks, s.sources);
    assert.equal(s.calibratedMovementMPerS, null); assert.equal(s.naturalPopulationDensity, null);
    assert.deepEqual(s.admissionDepthM.range, s.depthSelectionM); assert.deepEqual(s.depthRangeM, s.depthSelectionM);
    assert.ok(s.sizeRangeM[0] <= s.lengthM && s.lengthM <= s.sizeRangeM[1]);
  }
  const pipe = oceanReefAssemblageSpeciesById['banded-pipefish'];
  assert.ok(pipe.synonymScientificNames.includes('Doryrhamphus dactyliophorus')); assert.deepEqual(pipe.depthSelectionM, [5, 18]);
  const flounder = oceanReefAssemblageSpeciesById['peacock-flounder'], cone = oceanReefAssemblageSpeciesById['textile-cone'],
    urchin = oceanReefAssemblageSpeciesById['collector-urchin'];
  assert.equal(flounder.kind, 'fish'); assert.equal(flounder.support.contactKind, 'blind-right-side-skin-samples');
  assert.equal(flounder.morphology.supportSamplesAreFeet, false); assert.equal(flounder.support.footContacts.length, 6);
  assert.equal(cone.sizeMeasure, 'shell-length'); assert.equal(cone.support.footContacts.length, 6);
  assert.equal(cone.morphology.respiratorySiphonSeparateFromProboscis, true);
  assert.equal(urchin.sizeMeasure, 'test-diameter-excluding-spines'); assert.equal(urchin.support.footContacts.length, 12);
  assert.equal(urchin.morphology.spinesAreSupportPoints, false); assert.equal(urchin.morphology.mouthIsSupportPoint, false);
  assert.deepEqual(urchin.depthSelectionM, [3, 15]); assert.equal(urchin.foodPool, 'resources.algae');
});

test('native giant moray retains a complete long taper and continuous median fin without invented paired fins or caves', t => {
  const root = createReefAssemblageFish('giant-moray'); t.after(() => disposeReefAssemblageFish(root));
  const body = root.getObjectByName('whole tapered long moray body'), fin = root.getObjectByName('continuous dorsal caudal anal moray fin');
  assert.ok(body && fin && root.getObjectByName('large spotted moray head and upper jaw'));
  assert.ok(root.getObjectByName('two tubular anterior nostrils') && root.getObjectByName('black blotch and small round gill openings'));
  assert.ok(root.getObjectByName('moray lower jaw and bounded visible teeth'));
  assert.equal(root.userData.motion.pectorals.length, 0); assert.equal(root.userData.motion.tail, null);
  assert.equal(root.userData.deformableParts.length, 2);
  const p = body.geometry.getAttribute('position'); assert.ok(p.count > 2000);
  assert.ok(body.geometry.boundingBox.max.x - body.geometry.boundingBox.min.x > .83);
  assert.ok(body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y < .12);
  const before = Array.from(p.array); animateReefAssemblageFish(root, animal('giant-moray'), 1.1);
  assert.notDeepEqual(Array.from(p.array), before);
  for (let i = 0; i < p.count; i++) { assert.equal(p.getX(i), before[i * 3]); assert.equal(p.getY(i), before[i * 3 + 1]);
    assert.ok(Math.abs(p.getZ(i) - root.userData.deformableParts[0].original[i * 3 + 2]) <= .055001); }
});

test('native banded pipefish has a long straight tube, rectangular armour rings and complete tiny fins with red white paddle tail', t => {
  const root = createReefAssemblageFish('banded-pipefish'); t.after(() => disposeReefAssemblageFish(root));
  const body = root.getObjectByName('rectangular ringed pipefish trunk and tapering tail body'), snout = root.getObjectByName('long straight tubular snout and tiny terminal mouth');
  assert.ok(body && snout); assert.ok(snout.geometry.boundingBox.max.x >= .499);
  assert.ok(snout.geometry.boundingBox.max.x - snout.geometry.boundingBox.min.x > .24);
  assert.ok(body.geometry.index.count > 6000); assert.ok(anyColor(body, (r, g, b) => r > .8 && b > .6));
  assert.ok(anyColor(body, (r, g, b) => r < .3 && b < .2));
  for (const name of ['complete small pipefish dorsal fin', 'complete tiny pipefish anal fin', 'paired pectoral fin -1',
    'paired pectoral fin 1', 'complete caudal fin', 'white pipefish caudal margins and central white spot']) assert.ok(root.getObjectByName(name));
  const caudal = root.getObjectByName('complete caudal fin'); assert.ok(caudal.geometry.boundingBox.max.y > .06);
  assert.ok(anyColor(caudal, (r, g, b) => r > g * 2));
  assert.ok(anyColor(root.getObjectByName('white pipefish caudal margins and central white spot'), (r, g, b) => r > .85 && b > .65));
});

test('native spotfin porcupinefish is an uninflated elongated thick body with laid long spines and spotted present fins', t => {
  const root = createReefAssemblageFish('spot-fin-porcupinefish'); t.after(() => disposeReefAssemblageFish(root));
  const body = root.getObjectByName('ordinary uninflated spotted porcupinefish body'), spines = root.getObjectByName('complete backward laid long spines including under pectorals');
  assert.ok(body && spines && root.getObjectByName('rounded porcupinefish head and small beaked mouth'));
  assert.ok(body.geometry.boundingBox.max.x - body.geometry.boundingBox.min.x > .75);
  assert.ok(body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y < .36);
  assert.ok(spines.geometry.getAttribute('position').count >= 72 * 16);
  assert.ok(anyColor(body, (r, g, b) => r < .3)); assert.ok(anyColor(body, (r, g, b) => r > .75));
  assert.equal(oceanReefAssemblageSpeciesById['spot-fin-porcupinefish'].morphology.inflationImplemented, false);
  for (const name of ['complete spotted posterior dorsal fin', 'complete spotted posterior anal fin', 'complete caudal fin',
    'paired pectoral fin -1', 'paired pectoral fin 1']) assert.ok(root.getObjectByName(name));
});

test('all moving resting and stopped native full vertices fit shared axis and disk envelopes with finite normals', t => {
  const roots = FISH.map(createReefAssemblageFish); t.after(() => roots.forEach(disposeReefAssemblageFish));
  for (const root of roots) {
    const species = oceanReefAssemblageSpeciesById[root.userData.speciesId], actual = animal(species.id), before = structuredClone(actual), e = species.normalizedEnvelope;
    for (const phase of [0, .9, 2.7]) { root.userData.phase = phase;
      for (const mode of ['moving', 'resting', 'dead']) for (const clock of [0, .6, 1.2, 2.4, 5, 9, 21]) {
        const record = mode === 'moving' ? actual : { ...actual, alive: mode !== 'dead', velocity: { x: 0, y: 0, z: 0 } };
        animateReefAssemblageFish(root, record, clock);
        for (const p of vertices(root)) {
          for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[axis]) && p[axis] >= e[axis][0] - 1e-6 && p[axis] <= e[axis][1] + 1e-6,
            `${species.id} phase=${phase} t=${clock} ${axis}=${p[axis]}`);
          assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadiusUnits + 1e-6, `${species.id} disk`);
        }
      }
    }
    assert.deepEqual(actual, before);
    for (const mesh of meshes(root)) { assert.ok(mesh.geometry.index.count > 0); assert.ok(mesh.geometry.getAttribute('normal').array.every(Number.isFinite));
      assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.emissiveIntensity, 0); }
  }
});

test('native true total length is one unit and externally applied world scale and root pose remain untouched', t => {
  for (const id of FISH) {
    const root = createReefAssemblageFish(id), actual = animal(id), e = oceanReefAssemblageSpeciesById[id].normalizedEnvelope;
    t.after(() => disposeReefAssemblageFish(root)); assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
    const box = new THREE.Box3().setFromObject(root); assert.ok(Math.abs(box.max.x - .5) < .012 && Math.abs(box.min.x + .5) < .012, id);
    root.scale.setScalar(actual.sizeM); root.position.set(100, -8, 70); animateReefAssemblageFish(root, actual, 3);
    assert.deepEqual(root.position.toArray(), [100, -8, 70]); assert.deepEqual(root.scale.toArray(), [actual.sizeM, actual.sizeM, actual.sizeM]);
    for (const p of vertices(root)) for (const [axis, origin] of [['x', 100], ['y', -8], ['z', 70]]) {
      assert.ok(p[axis] >= origin + e[axis][0] * actual.sizeM - 1e-6 && p[axis] <= origin + e[axis][1] * actual.sizeM + 1e-6);
    }
    assert.ok(root.userData.sourceLinks.every(item => item.url)); assert.equal(root.userData.independentAnimal, true);
  }
});

test('native explicit clock replay freezes pose and moray deformations remain instance independent and ecology read only', t => {
  for (const id of FISH) {
    const first = createReefAssemblageFish(oceanReefAssemblageSpeciesById[id]), second = createReefAssemblageFish(id), actual = animal(id), before = structuredClone(actual);
    t.after(() => { disposeReefAssemblageFish(first); disposeReefAssemblageFish(second); });
    first.userData.phase = .42; animateReefAssemblageFish(first, actual, 3); const firstPose = snapshot(first), secondPose = snapshot(second);
    animateReefAssemblageFish(first, actual, 19); assert.notDeepEqual(snapshot(first), firstPose); assert.deepEqual(snapshot(second), secondPose);
    animateReefAssemblageFish(first, actual, 3); assert.deepEqual(snapshot(first), firstPose);
    animateReefAssemblageFish(first, actual, 3); assert.deepEqual(snapshot(first), firstPose); assert.deepEqual(actual, before);
    assert.deepEqual(first.position.toArray(), [0, 0, 0]);
    if (id === 'giant-moray') assert.notEqual(first.userData.deformableParts[0].mesh.geometry, second.userData.deformableParts[0].mesh.geometry);
  }
});

test('native shared and privately deformed resources release once at their correct owner and reject bottom or historical IDs', () => {
  const initial = reefAssemblageFishAssetStats(), first = createReefAssemblageFish('giant-moray'), second = createReefAssemblageFish('giant-moray');
  const parent = new THREE.Group(); parent.add(first, second);
  const shared = first.getObjectByName('large spotted moray head and upper jaw').geometry, own = first.userData.deformableParts[0].mesh.geometry;
  assert.equal(second.getObjectByName('large spotted moray head and upper jaw').geometry, shared);
  let sharedDisposals = 0, ownDisposals = 0; shared.addEventListener('dispose', () => sharedDisposals++); own.addEventListener('dispose', () => ownDisposals++);
  assert.equal(disposeReefAssemblageFish(first), true); assert.equal(sharedDisposals, 0); assert.equal(ownDisposals, 1); assert.equal(first.parent, null);
  assert.equal(disposeReefAssemblageFish(first), false); assert.equal(animateReefAssemblageFish(first, animal('giant-moray'), 4), false);
  assert.equal(disposeReefAssemblageFish(second), true); assert.equal(sharedDisposals, 1); assert.equal(ownDisposals, 1);
  assert.equal(parent.children.length, 0); assert.deepEqual(reefAssemblageFishAssetStats(), initial);
  for (const id of ['humphead-wrasse', 'reef-cuttlefish', 'peacock-flounder', 'textile-cone', 'collector-urchin', undefined]) {
    assert.equal(isReefAssemblageFish(id), false); assert.throws(() => createReefAssemblageFish(id), RangeError);
  }
  assert.deepEqual(reefAssemblageFishAssetStats(), initial);
});
