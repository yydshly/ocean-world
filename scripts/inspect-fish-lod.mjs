import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { speciesCatalog } from '../src/species.js';
import { createOrganism, animateOrganism, updateOrganismDetail, disposeOrganism } from '../src/world/organisms.js';

// This inspects actual Three.js subtrees and resource disposal in Node. It does
// not initialize WebGL and cannot establish GPU frame rate or image quality.
function inspectVisible(root) {
  root.updateMatrixWorld(true);
  let draws = 0, triangles = 0, renderPasses = 0, shadowCasters = 0;
  const bounds = new THREE.Box3();
  root.traverseVisible(object => {
    if (!object.isMesh && !object.isLine) return;
    draws++;
    if (object.isMesh && object.castShadow) shadowCasters++;
    const geometry = object.geometry;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    renderPasses += materials.reduce((sum, material) => sum +
      (material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1), 0);
    if (object.isMesh) triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(geometry.attributes)) {
      assert([...attribute.array].every(Number.isFinite), `${object.name}: non-finite attribute`);
    }
    if (geometry.index) assert(Math.max(...geometry.index.array) < geometry.attributes.position.count);
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  return { draws, estimatedMainRenderPasses: renderPasses, shadowCasters, triangles,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

function subtreeResources(root) {
  const result = new Set();
  root.traverse(object => {
    if (object.geometry) result.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      result.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) result.add(value);
    }
  });
  return result;
}

const records = [];
for (const species of speciesCatalog.filter(species => species.kind === 'fish')) {
  const fish = createOrganism(species);
  fish.scale.setScalar(species.lengthM);
  fish.position.set(2, 3, -1); fish.rotation.set(.03, .4, -.06);
  fish.userData.lastFeedAt = 7.2;
  const pose = { position: fish.position.toArray(), rotation: fish.rotation.toArray(), scale: fish.scale.toArray() };
  animateOrganism(fish, 8, 1);
  const near = inspectVisible(fish);
  assert.equal(near.draws, 6); assert.equal(near.estimatedMainRenderPasses, 6);
  assert.equal(near.shadowCasters, 5);
  assert.equal(updateOrganismDetail(fish, species.lengthM * 20), 'near');
  assert.equal(updateOrganismDetail(fish, species.lengthM * 21), 'far');
  const far = inspectVisible(fish);
  assert.equal(far.draws, 3); assert.equal(far.estimatedMainRenderPasses, 3);
  assert.equal(far.shadowCasters, 1);
  fish.traverse(object => { if (object.isMesh) object.castShadow = true; });
  assert.equal(updateOrganismDetail(fish, species.lengthM * 21), 'far');
  assert.equal(inspectVisible(fish).shadowCasters, 1, 'generic world-caster setup overrode far detail');
  assert(far.triangles < near.triangles * .3);
  // Neutral x/y/z extents retain the head, dorsal/anal, chest and tail outline.
  // Far pectorals share the static fin mesh; only their tiny flapping is lost.
  const localNear = fish.userData.detail.near;
  const localFar = fish.userData.detail.far;
  fish.position.set(0, 0, 0); fish.rotation.set(0, 0, 0); fish.scale.setScalar(1);
  fish.userData.animation.anatomy.rotation.set(0, 0, 0);
  fish.userData.animation.tails.forEach(tail => tail.rotation.set(0, 0, 0));
  fish.userData.animation.pectorals.forEach(pec => pec.rotation.set(0, 0, 0));
  localNear.visible = true; localFar.visible = false;
  const localNearBounds = inspectVisible(fish).bounds;
  localNear.visible = false; localFar.visible = true;
  const localFarBounds = inspectVisible(fish).bounds;
  for (const axis of [0, 1, 2]) for (const endpoint of ['min', 'max']) {
    assert(Math.abs(localNearBounds[endpoint][axis] - localFarBounds[endpoint][axis]) < .004,
      `${species.id}: distant outline moved`);
  }
  fish.position.fromArray(pose.position); fish.rotation.fromArray(pose.rotation); fish.scale.fromArray(pose.scale);
  assert.equal(updateOrganismDetail(fish, species.lengthM * 18), 'far');
  assert.equal(updateOrganismDetail(fish, species.lengthM * 15), 'near');
  assert.equal(updateOrganismDetail(fish, species.lengthM * 18), 'near');
  assert.equal(updateOrganismDetail(fish, -1), undefined);
  const animation = fish.userData.animation;
  animateOrganism(fish, 11, 2);
  assert.equal(animation.tails[0].rotation.y, animation.tails[1].rotation.y);
  const tailAngle = animation.tail.rotation.y;
  animateOrganism(fish, 11, 2);
  assert.equal(animation.tail.rotation.y, tailAngle, 'paused timestamp changed tail pose');
  animateOrganism(fish, 11.1, 2);
  assert.notEqual(animation.tail.rotation.y, tailAngle, 'tail failed to move');
  assert.equal(fish.userData.lastFeedAt, 7.2, 'render animation changed ecological feed time');
  assert.deepEqual(fish.position.toArray(), pose.position);
  assert.deepEqual(fish.rotation.toArray(), pose.rotation);
  assert.deepEqual(fish.scale.toArray(), pose.scale);
  const body = fish.userData.detail.near.children.find(object => object.isMesh && object.material.map?.image.width === 528);
  assert(body.material.vertexColors);
  const texture = body.material.map.image;
  assert.equal(texture.width, 528); assert.equal(texture.height, 256);
  const originalPattern = new Uint8Array(512 * 256 * 4);
  for (let row = 0; row < 256; row++) originalPattern.set(texture.data.subarray(row * 528 * 4, (row * 528 + 512) * 4), row * 512 * 4);
  records.push({ speciesId: species.id, lengthM: species.lengthM, near, far,
    distantTriangleReductionPercent: (1 - far.triangles / near.triangles) * 100,
    bodyPatternSHA256: createHash('sha256').update(originalPattern).digest('hex'),
    checks: { finite: true, closeAndFarOutline: true, tailBothLevels: true,
      pauseStable: true, worldPoseUnchanged: true, ecologicalFeedTimeUnchanged: true, hysteresis: true } });
  disposeOrganism(fish);
}
assert.equal(new Set(records.map(record => record.bodyPatternSHA256)).size, 6, 'species skin patterns collapsed');

const first = createOrganism(speciesCatalog[0]), second = createOrganism(speciesCatalog[0]);
const firstResources = subtreeResources(first), secondResources = subtreeResources(second);
assert.equal(firstResources.size, secondResources.size);
assert([...firstResources].every(resource => secondResources.has(resource)), 'resources are not shared by species');
const disposed = new Map([...firstResources].map(resource => [resource, 0]));
for (const resource of firstResources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
disposeOrganism(first);
assert([...disposed.values()].every(count => count === 0), 'first organism released a shared resource prematurely');
disposeOrganism(first);
assert([...disposed.values()].every(count => count === 0), 'double disposal changed resource references');
disposeOrganism(second);
assert([...disposed.values()].every(count => count === 1), 'last reference did not dispose each resource exactly once');
const rebuilt = createOrganism(speciesCatalog[0]);
assert([...subtreeResources(rebuilt)].every(resource => !firstResources.has(resource)), 'disposed cache entries survived rebuild');
disposeOrganism(rebuilt);

const population = Array.from({ length: 120 }, (_, index) => createOrganism(speciesCatalog.filter(s => s.kind === 'fish')[index % 6]));
population.forEach(fish => { fish.scale.setScalar(.2); updateOrganismDetail(fish, 10); });
const started = performance.now();
for (let frame = 0; frame < 360; frame++) for (const fish of population) animateOrganism(fish, frame / 60, 1);
const cpuAnimationDurationMs = performance.now() - started;
population.forEach(disposeOrganism);
const report = { schema: 'tidal-fish-lod-node-inspection-v1', inspectedAt: new Date().toISOString(),
  sourceSHA256: createHash('sha256').update(readFileSync('src/world/organisms.js')).digest('hex'),
  records, sharing: { inspectedResources: firstResources.size, identicalSpeciesShared: true,
    firstReleaseDisposed: 0, finalReleaseEachDisposed: 1, doubleReleaseStable: true, rebuildFresh: true },
  cpuAnimation: { population: 120, frames: 360, durationMs: cpuAnimationDurationMs },
  notes: ['Node inspects actual visible Three.js mesh and line subtrees and finite indexed geometry.',
    'Estimated main render passes account for transparent DoubleSide two-pass materials. They exclude lights, shadows and other scene objects.',
    'Near meshes keep five shadow casters; the far body alone remains a caster so a distant fish retains its shadow depth cue.',
    'No WebGL context or GPU benchmark was used. Close visual quality and actual frame rate still require browser evidence.',
    'The 512-pixel species skin pattern is unchanged; a white sixteen-pixel strip allows colored eye geometry to share its material.',
    'LOD changes geometry detail only. It does not alter species identity, biological state, feeding timestamps, world pose or model stepping.'] };
writeFileSync('output/validation/fish-lod-smoke.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ records: records.map(record => ({ species: record.speciesId, nearDraws: record.near.draws,
  farDraws: record.far.draws, nearTriangles: record.near.triangles, farTriangles: record.far.triangles })),
  sharedResources: firstResources.size, cpuAnimationDurationMs, passed: true }, null, 2));
