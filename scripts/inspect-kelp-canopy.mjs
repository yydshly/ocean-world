import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { KelpSimulation, kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { KELP_ANCHORS, KELP_FROND_COUNT, KELP_LEAF_COUNT, kelpStipePosition,
  kelpLeafFraction, kelpLeafLength, kelpLeafFrame, kelpLeafNormal, leafAttachmentPosition } from '../src/kelpHabitat.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from '../src/world/kelpOrganisms.js';

// This inspects actual generated CPU vertices and sheet contacts. It is not a
// screenshot, renderer FPS measurement, full kelp model experiment or field
// calibration. Keep its result separate from historical browser evidence.
const sourceFiles = ['src/kelpHabitat.js', 'src/world/kelpOrganisms.js', 'src/kelpSimulation.js'];
const hashSources = () => Object.fromEntries(sourceFiles.map(path => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const beforeSources = hashSources();
const species = kelpSpeciesCatalog.find(item => item.id === 'giant-kelp');
const plants = KELP_ANCHORS.map(anchor => createKelpOrganism(species, { anchor }));
const geometrySet = new Set(), materialSet = new Set(), textureSet = new Set();
const disposalCounts = new Map();
for (const plant of plants) plant.traverse(object => {
  if (!object.isMesh) return;
  geometrySet.add(object.geometry);
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    materialSet.add(material);
    for (const value of Object.values(material)) if (value?.isTexture) textureSet.add(value);
  }
});
for (const resource of [...geometrySet, ...materialSet, ...textureSet]) {
  disposalCounts.set(resource, 0);
  resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1));
}
const range = () => [Infinity, -Infinity];
const expand = (interval, value) => { interval[0] = Math.min(interval[0], value); interval[1] = Math.max(interval[1], value); };
const bladeArcRangeM = range(), stipeArcRelativeToFrondLength = range(), tipBendDegrees = range();
const worldBounds = { x: range(), y: range(), z: range() };
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), target = new THREE.Vector3();
const triangle = new THREE.Triangle(a, b, c), nearest = new THREE.Vector3();
let leafRowsChecked = 0, contactSamples = 0, maximumCentreVertexErrorM = 0, maximumNormalError = 0;
let maximumSheetContactErrorM = 0, maximumAnalyticTangentError = 0, minimumLeafSeparationFraction = Infinity;
const timesSec = [0, 7.5, 30, 120], currentsMps = [0, .18, .9, 1.2];
const start = performance.now();
for (const timeSec of timesSec) for (const currentMps of currentsMps) for (let plantIndex = 0; plantIndex < plants.length; plantIndex++) {
  const anchor = KELP_ANCHORS[plantIndex], plant = plants[plantIndex], environment = { currentMps };
  animateKelpOrganism(plant, timeSec, environment, anchor);
  const motion = plant.userData.motion, vertices = motion.blades.geometry.attributes.position,
    normals = motion.blades.geometry.attributes.normal;
  for (const object of [motion.stem, motion.blades]) for (const attribute of Object.values(object.geometry.attributes)) {
    for (const value of attribute.array) assert(Number.isFinite(value));
  }
  for (const value of motion.bulbs.instanceMatrix.array) assert(Number.isFinite(value));
  for (let frond = 0; frond < KELP_FROND_COUNT; frond++) {
    assert.deepEqual(kelpStipePosition(anchor, 0, timeSec, environment, frond), { x: anchor.x, y: anchor.y, z: anchor.z });
    const sortedFractions = Array.from({ length: KELP_LEAF_COUNT }, (_, leaf) => kelpLeafFraction(leaf, anchor, frond)).sort((x, y) => x - y);
    for (let leaf = 1; leaf < sortedFractions.length; leaf++) minimumLeafSeparationFraction = Math.min(minimumLeafSeparationFraction, sortedFractions[leaf] - sortedFractions[leaf - 1]);
    let prior = kelpStipePosition(anchor, 0, timeSec, environment, frond), stemArc = 0;
    for (let row = 1; row <= 100; row++) {
      const point = kelpStipePosition(anchor, row / 100, timeSec, environment, frond);
      stemArc += Math.hypot(point.x - prior.x, point.y - prior.y, point.z - prior.z); prior = point;
    }
    expand(stipeArcRelativeToFrondLength, stemArc / (anchor.lengthM * [1, .982, .96, .94][frond]));
    const endBefore = kelpStipePosition(anchor, .99, timeSec, environment, frond);
    expand(tipBendDegrees, Math.atan2(Math.hypot(prior.x - endBefore.x, prior.z - endBefore.z), prior.y - endBefore.y) * 180 / Math.PI);
    for (let leaf = 0; leaf < KELP_LEAF_COUNT; leaf++) {
      let previous, arc = 0;
      for (let row = 0; row <= motion.leafRows; row++) {
        const along = row / motion.leafRows;
        const frame = kelpLeafFrame(anchor, leaf, along, timeSec, environment, frond);
        const i = (frond * KELP_LEAF_COUNT + leaf) * (motion.leafRows + 1) * 2 + row * 2;
        const renderedCentre = new THREE.Vector3().fromBufferAttribute(vertices, i).add(new THREE.Vector3().fromBufferAttribute(vertices, i + 1)).multiplyScalar(.5).add(plant.position);
        target.set(frame.position.x, frame.position.y, frame.position.z);
        maximumCentreVertexErrorM = Math.max(maximumCentreVertexErrorM, renderedCentre.distanceTo(target));
        maximumNormalError = Math.max(maximumNormalError, new THREE.Vector3().fromBufferAttribute(normals, i).distanceTo(new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z)));
        assert.deepEqual(frame.normal, kelpLeafNormal(anchor, leaf, along, timeSec, environment, frond));
        for (const direction of [frame.normal, frame.across, frame.tangent]) assert(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
        const dot = (first, second) => first.x * second.x + first.y * second.y + first.z * second.z;
        assert(Math.abs(dot(frame.normal, frame.tangent)) < 1e-12);
        assert(Math.abs(dot(frame.across, frame.tangent)) < 1e-12);
        if (row > 0 && row < motion.leafRows) {
          const epsilon = 1e-5, earlier = kelpLeafFrame(anchor, leaf, along - epsilon, timeSec, environment, frond).position;
          const later = kelpLeafFrame(anchor, leaf, along + epsilon, timeSec, environment, frond).position;
          const numeric = new THREE.Vector3(later.x - earlier.x, later.y - earlier.y, later.z - earlier.z).normalize();
          maximumAnalyticTangentError = Math.max(maximumAnalyticTangentError, numeric.distanceTo(new THREE.Vector3(frame.tangent.x, frame.tangent.y, frame.tangent.z)));
        }
        for (const axis of ['x', 'y', 'z']) expand(worldBounds[axis], frame.position[axis]);
        if (previous) arc += Math.hypot(frame.position.x - previous.x, frame.position.y - previous.y, frame.position.z - previous.z);
        previous = frame.position; leafRowsChecked++;
      }
      const tip = kelpLeafFrame(anchor, leaf, 1, timeSec, environment, frond).position;
      const base = kelpLeafFrame(anchor, leaf, 0, timeSec, environment, frond).position;
      assert(Math.abs(Math.hypot(tip.x - base.x, tip.y - base.y, tip.z - base.z) - kelpLeafLength(leaf)) < 1e-12);
      expand(bladeArcRangeM, arc);
    }
  }
  // Check the actual triangulated sheet under the three ecological snail leaf
  // identities, at arbitrary along positions rather than just vertex rows.
  const index = motion.blades.geometry.index.array;
  for (const leafIndex of [12, 15, 17]) for (const along of [.37, .58, .72]) {
    const attachment = { leafIndex, along, clearanceM: .003 };
    const attached = leafAttachmentPosition(anchor, attachment, timeSec, environment);
    target.set(attached.x, attached.y - .003, attached.z).sub(plant.position);
    let minimum = Infinity;
    for (let face = leafIndex * motion.leafRows * 2; face < (leafIndex + 1) * motion.leafRows * 2; face++) {
      a.fromBufferAttribute(vertices, index[face * 3]); b.fromBufferAttribute(vertices, index[face * 3 + 1]); c.fromBufferAttribute(vertices, index[face * 3 + 2]);
      // The existing strip closes to one point at its base/tip. Such collapsed
      // endpoint faces carry no surface and are ignored by ray intersections.
      if (triangle.getArea() < 1e-14) continue;
      triangle.closestPointToPoint(target, nearest); minimum = Math.min(minimum, nearest.distanceTo(target));
    }
    maximumSheetContactErrorM = Math.max(maximumSheetContactErrorM, minimum); contactSamples++;
  }
  const pausedPositionsVersion = vertices.version, pausedNormalsVersion = normals.version, pausedBulbsVersion = motion.bulbs.instanceMatrix.version;
  animateKelpOrganism(plant, timeSec, environment, anchor);
  assert.equal(vertices.version, pausedPositionsVersion); assert.equal(normals.version, pausedNormalsVersion);
  assert.equal(motion.bulbs.instanceMatrix.version, pausedBulbsVersion);
}
assert(maximumCentreVertexErrorM < 1e-6);
assert(maximumNormalError < 1e-6);
console.log(JSON.stringify({ maximumSheetContactErrorM, maximumCentreVertexErrorM, maximumNormalError,
  maximumAnalyticTangentError, bladeArcRangeM, stipeArcRelativeToFrondLength, tipBendDegrees }));
assert(maximumSheetContactErrorM < .0015);
assert(maximumAnalyticTangentError < 1e-6);
assert(minimumLeafSeparationFraction > 0);
const shapeCpuMs = performance.now() - start;
const representative = plants[0].userData.motion;
const trianglesPerPlant = representative.stem.geometry.index.count / 3 + representative.blades.geometry.index.count / 3
  + representative.bulbs.geometry.index.count / 3 * representative.bulbs.count + plants[0].children.at(-1).geometry.index.count / 3;
const drawsPerPlant = plants[0].children.filter(object => object.isMesh).length;
assert.equal(drawsPerPlant, 4); assert.equal(geometrySet.size, 26); assert.equal(materialSet.size, 4); assert.equal(textureSet.size, 1);
disposeKelpOrganism(plants[0]);
for (const resource of [representative.bulbs.geometry, ...materialSet, ...textureSet]) assert.equal(disposalCounts.get(resource), 0, 'Other plants retain their shared resources');
for (const plant of plants.slice(1)) disposeKelpOrganism(plant);
for (const count of disposalCounts.values()) assert.equal(count, 1, 'Every unique geometry/material/texture is disposed once');
// Meaningful model regression: gradual current change keeps the existing
// maximum first-step speed and exact shared position, including rolled blades.
const sim = new KelpSimulation(42); sim.setEnvironment({ currentMps: .9 }); sim.step(.1);
let maximumFirstStepSnailSpeedMps = 0;
for (const snail of sim.agents.filter(agent => agent.speciesId === 'brown-turban-snail')) {
  assert.deepEqual(snail.position, leafAttachmentPosition(sim.getKelpAnchor(snail.attachment.hostId), snail.attachment, sim.timeSec, sim.environment));
  maximumFirstStepSnailSpeedMps = Math.max(maximumFirstStepSnailSpeedMps, Math.hypot(snail.velocity.x, snail.velocity.y, snail.velocity.z));
}
assert(maximumFirstStepSnailSpeedMps < .5);
const afterSources = hashSources(); assert.deepEqual(beforeSources, afterSources, 'Sources changed during inspection');
const report = { schema: 'kelp-canopy-shape-smoke-v1', observedAtUtc: new Date().toISOString(), status: 'passed',
  sourceSha256: beforeSources, plantDisplayUnits: 12, representativeFronds: 48, representativeBlades: 2592,
  timesSec, currentsMps, leafRowsChecked, contactSamples, maximumCentreVertexErrorM, maximumNormalError,
  maximumSheetContactErrorM, maximumAnalyticTangentError, maximumFirstStepSnailSpeedMps, minimumLeafSeparationFraction,
  bladeArcRangeM, stipeArcRelativeToFrondLength, tipBendDegrees, worldBounds,
  resources: { drawsPerPlant, trianglesPerPlant, totalPlantTriangles: trianglesPerPlant * 12,
    uniqueGeometries: geometrySet.size, uniqueMaterials: materialSet.size, uniqueTextures: textureSet.size,
    firstDisposeRetainsSharedResources: true, finalDisposeEachOnce: true, pauseSkipsGeometryUploads: true },
  shapeInspectionCpuMs: shapeCpuMs,
  meanings: { shape: 'Authored bowed stipes and staggered, drooping/rolled sheets; not mechanics or a full floating surface canopy.',
    plantLength: 'Existing root-to-point chord lengths retained; curved arc lengths are separately reported.',
    bladeLength: 'Existing nominal 0.45–0.70 m base-to-tip distances retained; curved arc lengths are separately reported.',
    contact: 'Distance from shared leaf centre to the actual CPU triangulated sheet; attachment still uses the existing 3 mm vertical clearance.',
    runtime: 'CPU geometry inspection time includes assertions; not actual browser/GPU performance.',
    scope: 'No ecosystem rates, animal sizes, plant counts, local resource capacities or render passes changed.' },
  sources: ['https://www.fao.org/4/x5819e/x5819e0a.htm', 'https://link.springer.com/article/10.1007/s00227-009-1238-6'],
  visualAcceptance: 'pending actual browser screenshots by root' };
writeFileSync('output/validation/kelp-canopy-shape-smoke.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
