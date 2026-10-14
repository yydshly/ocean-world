import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DeepSimulation, DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { deepSpeciesCatalog } from '../src/deepSpecies.js';
import { deepFloorHeight } from '../src/deepHabitat.js';
import { deepMidwaterLifeSpeciesCatalog } from '../src/deepMidwaterLifeSpecies.js';
import { deepMidwaterLifeAssetStats } from '../src/world/DeepMidwaterLifeAssets.js';
import { createOceanPrimerDeep, oceanPrimerDeepFloorHeight } from '../src/world/OceanPrimerDeep.js';

// Before stage 06, every byte below matches the original committed source.
// These pins preserve all original rules and entire asset kits rather than
// blessing a shortened or rewritten model as a new primer fixture.
const originalHashes = {
  'src/deepSimulation.js': '3ed350e678bb89002445d1c9c6b376aa7dcae5780a04c5d4d4a1c853bfe7623b',
  'src/deepSpecies.js': '9da0e1b41bbb9c4b61c26d082bd8a3090b0d1350fef626836ecdb44ea2a88c8a',
  'src/deepHabitat.js': '8dae6cd5f9b0c6b1dc95246b8a5d586d063ad36bf64fe087d8ef850e93cb0da1',
  'src/world/deepOrganisms.js': 'afd05b3a2c5d3ddc9d6989ccd599c716a98640b7bd8307e5859689791345f950',
  'src/world/DeepOceanAnimals.js': '1e150686a05eececbec52882f21cdfd3f77bf206f6374c2e050c8e4fe48479de',
  'src/world/DeepMidwaterLifeAssets.js': '4bc47dba8e1f53d20195e6283733463da7a24d5e986f6e25401499f546070671',
  'src/deepMidwaterLifeSpecies.js': '634b6c05c73c25af2510af03e906e576b4d46b13e5e896d122b7f850ace3141f',
};
const sourceUrl = new URL('../src/world/OceanPrimerDeep.js', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const finitePoint = p => ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
const dataSnapshot = sim => structuredClone({ agents: sim.agents, events: sim.events, environment: sim.environment,
  surface: sim.surfacePatches, benthic: sim.benthicPatches, suspended: sim.suspendedPatches,
  ledger: sim.ledger, energy: sim.energyLedger, metrics: sim.metrics });
const fixture = (t, seed = 55, scene = new THREE.Scene()) => {
  const chapter = createOceanPrimerDeep(scene, { seed });
  t.after(() => chapter.dispose()); return { scene, chapter };
};
const animalRoots = root => {
  const roots = []; root.traverse(node => { if (node.userData.agentId && node.userData.speciesId) roots.push(node); });
  return roots.filter(node => { for (let p = node; p; p = p.parent) if (!p.visible) return false; return true; });
};
function visualSnapshot(chapter) {
  const digest = createHash('sha256');
  chapter.root.updateMatrixWorld(true);
  for (const animal of animalRoots(chapter.root)) animal.traverse(node => {
    digest.update(JSON.stringify(node.matrixWorld.toArray()));
    if (node.isMesh) {
      const array = node.geometry.attributes.position.array;
      digest.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
  });
  const d = chapter.diagnostics();
  return { animals: d.animals, pose: chapter.cameraPose(d.timeSec), environment: chapter.environmentAt(d.timeSec),
    nativeSample: { ...d.nativeLocalModel, preparationMs: 0 }, geometry: digest.digest('hex') };
}

test('stage 06 leaves all native deep rules, original whole assets and metre ranges byte-for-byte intact', () => {
  for (const [path, expected] of Object.entries(originalHashes))
    assert.equal(hash(readFileSync(new URL(`../${path}`, import.meta.url))), expected, path);
  assert.deepEqual(deepSpeciesCatalog.map(s => [s.id, s.displaySizeM.range, s.taxonomicLevel]), [
    ['sea-pig-group', [.08, .16], 'genus'], ['rattail-family', [.35, .75], 'family'],
    ['pom-pom-anemone', [.12, .28], 'species'],
  ]);
  assert.equal(DEEP_MODEL_PARAMETERS.fixedStepSec, .1);
  assert.equal(DEEP_MODEL_PARAMETERS.seaPigCrawlMps, .0007);
  assert.equal(DEEP_MODEL_PARAMETERS.fishSearchMps, .035);
});

test('primer import graph contains no persistence, research-owner ecology or browser storage access', () => {
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return; visited.add(url.href);
    const source = readFileSync(url, 'utf8');
    assert.doesNotMatch(source, /\b(?:indexedDB|localStorage|sessionStorage|OceanEcology|DeepOceanEcology|EcologyStore)\b/,
      `storage or research controller reachable through ${url.pathname}`);
    for (const match of source.matchAll(/(?:import|export)[\s\S]*?\bfrom\s*['"](\.[^'"]+)['"]/g))
      visit(new URL(match[1], url));
  }
  visit(sourceUrl); assert.ok(visited.size > 3, 'actual transitive imports were checked');
});

test('creating and seeking the representative chapter does not change a live original local simulation', t => {
  const old = new DeepSimulation('old-deep-instance'); old.step(3.7);
  const oldBefore = dataSnapshot(old), catalogBefore = structuredClone(deepSpeciesCatalog);
  const { chapter } = fixture(t);
  for (const time of [65, 3, 42, 0]) chapter.update(time);
  assert.deepEqual(dataSnapshot(old), oldBefore); assert.deepEqual(deepSpeciesCatalog, catalogBefore);
  assert.equal(chapter.diagnostics().noPersistence, true);
  assert.equal(chapter.diagnostics().researchOwnersConnected, 0);
  const reference = new DeepSimulation('old-deep-instance'); reference.step(4.2); old.step(.5);
  assert.deepEqual(dataSnapshot(old), dataSnapshot(reference), 'native future continuation retains exact RNG, food and behavior');
  assert.ok(Math.abs(reference.metrics.resourceBudgetError) < 1e-10);
  assert.ok(Math.abs(reference.metrics.energyBudgetError) < 1e-10);
});

test('actual finite terrain keeps the native support region and has finite, upward-facing metre geometry', t => {
  const { chapter } = fixture(t), terrain = chapter.root.getObjectByName('Finite deep soft bottom and surrounding slopes');
  assert.ok(terrain?.isMesh);
  for (let x = -3; x <= 3; x += .25) for (let z = -2.8; z <= 2.8; z += .25)
    assert.equal(oceanPrimerDeepFloorHeight(x, z), deepFloorHeight(x, z));
  const geometry = terrain.geometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
  assert.ok(positions.count < 20000, 'finite display terrain budget');
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    assert.ok(finitePoint(p)); assert.ok(Math.abs(p.y - oceanPrimerDeepFloorHeight(p.x, p.z)) < 1e-6);
    assert.ok(normals.getY(i) > Math.cos(Math.PI / 4), 'all scenery slopes stay upward and below 45 degrees');
  }
  for (const index of geometry.index.array) assert.ok(index >= 0 && index < positions.count);
  assert.ok(oceanPrimerDeepFloorHeight(0, -14) > deepFloorHeight(0, -14) + 2,
    'the background relief is real geometry, beyond the native animal support');
});

test('the complete 65-second half-second sample keeps camera, animal bodies and source-size budgets finite and clear', t => {
  const { chapter } = fixture(t), catalogue = new Map([...deepSpeciesCatalog, ...deepMidwaterLifeSpeciesCatalog].map(s => [s.id, s]));
  const vertex = new THREE.Vector3(), camera = new THREE.Vector3();
  let sampledBodies = 0, sampledVertices = 0, previousPose = null;
  for (let tick = 0; tick <= 130; tick++) {
    const time = tick * .5; chapter.update(time);
    const pose = chapter.cameraPose(time), environment = chapter.environmentAt(time), diagnostic = chapter.diagnostics();
    assert.ok(finitePoint(pose.position) && finitePoint(pose.target));
    assert.ok(pose.fov >= 35 && pose.fov <= 60);
    camera.set(pose.position.x, pose.position.y, pose.position.z);
    assert.ok(camera.distanceTo(new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z)) > .2);
    if (time >= 26) assert.ok(camera.y >= oceanPrimerDeepFloorHeight(camera.x, camera.z) + .239999);
    if (previousPose && time !== 26)
      assert.ok(camera.distanceTo(previousPose) < .4, 'ordinary shot motion stays continuous in local metres');
    previousPose = camera.clone();
    assert.equal(environment.naturalLight, 0); assert.equal(diagnostic.nativeLocalModel.preparationSteps, 650);
    assert.ok(Math.abs(diagnostic.nativeLocalModel.resourceBudgetError) < 1e-10);
    assert.ok(Math.abs(diagnostic.nativeLocalModel.energyBudgetError) < 1e-10);
    const roots = animalRoots(chapter.root);
    assert.equal(roots.length, time < 26 ? 2 : 16);
    for (const animal of roots) {
      const species = catalogue.get(animal.userData.speciesId), size = animal.scale.x, bounds = new THREE.Box3();
      assert.equal(animal.userData.identityLevel, species.identityLevel);
      assert.ok(size >= species.displaySizeM.range[0] && size <= species.displaySizeM.range[1]);
      assert.deepEqual(animal.scale.toArray(), [size, size, size]);
      animal.traverse(mesh => {
        if (!mesh.isMesh) return;
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(finitePoint(vertex)); bounds.expandByPoint(vertex); sampledVertices++;
          if (time >= 26) assert.ok(vertex.y >= oceanPrimerDeepFloorHeight(vertex.x, vertex.z) - .006,
            `${animal.userData.speciesId} body vertex basic mud clearance at ${time}s`);
        }
      });
      assert.ok(!bounds.containsPoint(camera), `camera remains outside ${animal.userData.speciesId}'s complete body`);
      sampledBodies++;
    }
  }
  assert.ok(sampledBodies > 1000 && sampledVertices > 1000000);
  assert.equal(chapter.diagnostics().nativeLocalModel.preparedFrames, 131, 'bounded seek preparation');
});

test('arbitrary backward seeks and repeated same-seed instances recover exact animals and complete geometry', t => {
  const { chapter } = fixture(t), checkpoints = [11.25, 32.25, 49.75], expected = new Map();
  for (const time of checkpoints) { chapter.update(time); expected.set(time, visualSnapshot(chapter)); }
  for (const time of [65, 0, 49.75, 11.25, 32.25, 49.75]) {
    chapter.update(time); if (expected.has(time)) assert.deepEqual(visualSnapshot(chapter), expected.get(time));
  }
  const twin = fixture(t).chapter;
  for (const time of checkpoints) { twin.update(time); assert.deepEqual(visualSnapshot(twin), expected.get(time)); }
});

test('only observer lamps illuminate the chapter and the 700m-to-3500m change is explicitly covered', t => {
  const { scene, chapter } = fixture(t), lights = [];
  scene.traverse(node => { if (node.isLight) lights.push(node); });
  assert.equal(lights.length, 3);
  for (const light of lights) {
    assert.equal(light.userData.illuminationRole, 'observer-artificial-light');
    assert.ok(light.isSpotLight || light.isPointLight); assert.equal(light.castShadow, false);
  }
  chapter.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of [].concat(mesh.material)) {
      if (material.emissive) assert.deepEqual(material.emissive.toArray(), [0, 0, 0]);
    }
  });
  for (const time of [24, 25, 26, 27, 28]) {
    chapter.update(time); const e = chapter.environmentAt(time);
    assert.equal(e.depthM, time < 26 ? 700 : 3500); assert.equal(e.locationSwitch, time < 28);
    if (time === 26) {
      assert.equal(e.transitionOpacity, 1); assert.equal(e.observerLight, 0);
      assert.ok(lights.every(light => light.intensity === 0));
    }
  }
  const snow = chapter.root.getObjectByName('Slowly falling observer-lit marine snow');
  assert.equal(snow.userData.role, 'display-only-marine-snow-not-food-ledger-or-particle-ingestion');
  assert.ok(snow.geometry.attributes.position.count <= 512);
  assert.equal(snow.material.uniforms.timeSec.value, 28);
  assert.ok(chapter.diagnostics().limitations.some(note => note.includes('非真实连续下潜')));
});

test('disposal frees all owned and shared resources once and restores the independent scene', t => {
  const originalBackground = new THREE.Color(0x123456), originalFog = new THREE.Fog(0x234567, 2, 25);
  const ownScene = new THREE.Scene(); ownScene.background = originalBackground; ownScene.fog = originalFog;
  const initialAssetStats = deepMidwaterLifeAssetStats(), { scene, chapter } = fixture(t, 55, ownScene);
  chapter.update(65); const resources = new Map();
  scene.traverse(node => {
    if (!node.isMesh && !node.isPoints) return;
    for (const resource of [node.geometry, ...[].concat(node.material)]) {
      if (!resources.has(resource)) { resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1)); }
      if (resource.isMaterial) for (const value of Object.values(resource)) if (value?.isTexture && !resources.has(value)) {
        resources.set(value, 0); value.addEventListener('dispose', () => resources.set(value, resources.get(value) + 1));
      }
    }
  });
  assert.ok(resources.size > 20);
  chapter.dispose(); chapter.dispose();
  assert.equal(scene.children.length, 0); assert.equal(scene.background, originalBackground); assert.equal(scene.fog, originalFog);
  assert.equal(chapter.root.children.length, 0); assert.equal(chapter.diagnostics().disposed, true);
  assert.equal(chapter.update(5), false);
  assert.ok([...resources.values()].every(count => count === 1));
  assert.deepEqual(deepMidwaterLifeAssetStats(), initialAssetStats);
});
