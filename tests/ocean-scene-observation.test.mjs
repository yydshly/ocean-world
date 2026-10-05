import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { sceneElementHeight, sceneElementMesh } from '../src/oceanSceneElements.js';
import { createOceanSceneObservation } from '../src/oceanSceneObservation.js';

const clone = value => structuredClone(value);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);
const point = value => new THREE.Vector3(value.x, value.y, value.z);
const flatGenerator = { floorSurface: () => ({ height: 0 }), heightForCamera: () => 0 };
const smallCluster = [
  { id: 'stone', regionId: '0,0', kind: 'stone', variant: 0, x: 30, y: 0, z: 31, rotation: .2, scale: { x: 1.8, y: .5, z: 1.3 } },
  { id: 'plant', regionId: '0,0', kind: 'plant-clump', variant: 0, x: 32, y: 0, z: 34, rotation: 1, scale: { x: 1.4, y: .8, z: 1.6 } },
  { id: 'wood', regionId: '0,0', kind: 'driftwood', variant: 0, x: 34, y: 0, z: 31, rotation: 2, scale: { x: 1.5, y: .2, z: .3 } },
];
function cameraFrustum(pose, fov = 50, aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, .05, 160);
  camera.position.copy(point(pose.position)); camera.lookAt(point(pose.target)); camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
function containedSphere(frustum, center, radius) {
  for (const plane of frustum.planes) assert.ok(plane.distanceToPoint(point(center)) >= radius - 1e-8,
    `complete reference sphere crosses camera plane by ${radius - plane.distanceToPoint(point(center))}m`);
}

test('one real upgraded owner frames its complete current scene and existing nearby animals with physically supported camera placement', () => {
  const receipt = JSON.parse(readFileSync(new URL('../output/validation/ocean-scene-browser-upgrade.json', import.meta.url), 'utf8'));
  const generator = createOceanGenerator(receipt.ocean.ecology.seed);
  const elements = receipt.ocean.ecology.regions.flatMap(region => region.sceneElements ?? []), agents = receipt.ocean.ecology.agents;
  const before = clone({ elements, agents });
  const safeHeight = (x, z) => Math.max(generator.heightForCamera(x, z),
    ...elements.map(element => sceneElementHeight(element, x, z, true) ?? -Infinity));
  const pose = createOceanSceneObservation({ elements, agents, generator, regionId: '3,1', surfaceY: receipt.surfaceY, safeHeight });
  assert.ok(pose); const local = elements.filter(element => element.regionId === '3,1');
  assert.equal(local.length, 12); assert.deepEqual(pose.sourceElementIds, local.map(element => element.id).sort());
  assert.deepEqual(new Set(local.map(element => element.kind)), new Set(['stone', 'plant-clump', 'bottle', 'driftwood']));
  assert.equal(`${Math.floor(pose.position.x / 64)},${Math.floor(pose.position.z / 64)}`, '3,1');
  assert.ok(pose.position.y >= safeHeight(pose.position.x, pose.position.z) + 1.3 - 1e-9);
  assert.ok(pose.position.y <= receipt.surfaceY - .75);
  close(pose.target.x, local.reduce((sum, element) => sum + element.x, 0) / local.length, 'actual cluster centroid X');
  close(pose.target.z, local.reduce((sum, element) => sum + element.z, 0) / local.length, 'actual cluster centroid Z');
  close(pose.target.y, generator.floorSurface(pose.target.x, pose.target.z).height + .8, 'actual target floor clearance');
  assert.ok(Math.hypot(pose.position.x - pose.target.x, pose.position.z - pose.target.z) >= 12);
  assert.ok(Math.hypot(pose.position.x - pose.target.x, pose.position.z - pose.target.z) <= 20 + 1e-9);
  const frustum = cameraFrustum(pose); let vertices = 0;
  for (const element of local) {
    containedSphere(frustum, { x: element.x, y: element.y + element.scale.y / 2, z: element.z },
      Math.hypot(element.scale.x, element.scale.y, element.scale.z) / 2);
    const mesh = sceneElementMesh(element.kind, element.variant), matrix = new THREE.Matrix4().compose(point(element),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), element.rotation), point(element.scale));
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const vertex = new THREE.Vector3(...mesh.positions.slice(index, index + 3)).applyMatrix4(matrix);
      assert.ok(frustum.containsPoint(vertex), `${element.id} actual vertex outside complete broad view`); vertices++;
    }
  }
  assert.ok(vertices > 100); assert.ok(pose.sourceAgentIds.length >= 1);
  for (const id of pose.sourceAgentIds) {
    const actual = agents.find(agent => agent.id === id); assert.ok(actual?.alive);
    assert.ok(point(actual.position).distanceTo(point(pose.target)) <= 15);
    containedSphere(frustum, actual.position, actual.sizeM * .6);
  }
  assert.equal(pose.evidence.scope, 'frustum-reference-only'); assert.equal(pose.evidence.candidateCount, 8);
  assert.ok(Object.isFrozen(pose) && Object.isFrozen(pose.position) && Object.isFrozen(pose.sourceElementIds));
  assert.deepEqual({ elements, agents }, before, 'framing does not move, recreate or modify scenery or organisms');
});

test('the entry uses only eight possible ordinary headings and rejects unsupported water without moving to another owner', () => {
  let floorQueries = 0, supportQueries = 0;
  const generator = { floorSurface: () => { floorQueries++; return { height: 0 }; } };
  const invalid = createOceanSceneObservation({ elements: smallCluster, generator, regionId: '0,0', safeHeight: () => { supportQueries++; return 8; } });
  assert.equal(invalid, null); assert.equal(supportQueries, 8); assert.equal(floorQueries, 9);
  supportQueries = 0;
  const pose = createOceanSceneObservation({ elements: smallCluster, generator, regionId: '0,0',
    safeHeight: (x, z) => { supportQueries++; return x > 43 ? 8 : 0; } });
  assert.ok(pose); assert.equal(supportQueries, 8); assert.ok(pose.position.x <= 43);
  assert.ok(pose.position.x >= 1 && pose.position.x <= 63 && pose.position.z >= 1 && pose.position.z <= 63);
  assert.ok(pose.position.y >= 1.3 && pose.position.y <= 7.25);
});

test('nearby animal references come only from actual alive agents inside the selected frustum and are stable under input order', () => {
  const agents = [
    { id: 'east-live', alive: true, position: { x: 39, y: .8, z: 32 }, sizeM: .4 },
    { id: 'behind-live', alive: true, position: { x: 18, y: .8, z: 32 }, sizeM: .4 },
    { id: 'dead-near', alive: false, position: { x: 33, y: .8, z: 32 }, sizeM: .4 },
    { id: 'far-live', alive: true, position: { x: 49, y: .8, z: 32 }, sizeM: .4 },
  ];
  // Only the preferred west heading has sufficient water above a physical support.
  const safeHeight = (x, z) => Math.abs(x - 20) < .001 && Math.abs(z - 32) < .001 ? 0 : 8;
  const options = { elements: clone(smallCluster), agents: clone(agents), generator: flatGenerator, regionId: '0,0', safeHeight };
  const before = clone({ elements: options.elements, agents: options.agents });
  const pose = createOceanSceneObservation(options); assert.ok(pose);
  assert.deepEqual(pose.sourceAgentIds, ['east-live']);
  assert.deepEqual(createOceanSceneObservation({ ...options, elements: [...options.elements].reverse(), agents: [...options.agents].reverse() }), pose);
  assert.deepEqual({ elements: options.elements, agents: options.agents }, before);
  assert.deepEqual(createOceanSceneObservation({ ...options, agents: [] })?.sourceAgentIds, [],
    'a scenery-only view does not invent an animal reference');
});

test('invalid records and an unframeable complete owner yield no partial or synthetic scene', () => {
  const options = { elements: smallCluster, generator: flatGenerator, regionId: '0,0' };
  for (const change of [
    { elements: smallCluster.slice(0, 2) },
    { elements: [...smallCluster, smallCluster[0]] },
    { elements: smallCluster.map((element, index) => index ? element : { ...element, x: NaN }) },
    { elements: smallCluster.map((element, index) => index ? element : { ...element, regionId: '1,0' }) },
    { elements: smallCluster.map((element, index) => index ? element : { ...element, scale: { x: 1, y: -1, z: 1 } }) },
    { regionId: 'bad-owner' }, { fov: NaN }, { surfaceY: .5 }, { safeHeight: () => NaN },
  ]) assert.equal(createOceanSceneObservation({ ...options, ...change }), null);
  const tooBroad = [[2, 2], [62, 2], [2, 62], [62, 62]].map(([x, z], index) => ({ ...smallCluster[0], id: `corner-${index}`, x, z }));
  assert.equal(createOceanSceneObservation({ ...options, elements: tooBroad }), null,
    'a complete 60m-wide cell cannot be replaced by an undisclosed close-up subset');
  let rayChecks = 0;
  const clearAlternative = createOceanSceneObservation({ ...options, candidateClear: (position, target, references) => {
    assert.ok(['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]) && Number.isFinite(target[axis])));
    assert.equal(references.length, smallCluster.length);
    assert.ok(references.every(reference => Number.isFinite(reference.radius) && reference.radius > 0));
    return ++rayChecks !== 1;
  } });
  assert.ok(clearAlternative); assert.equal(clearAlternative.evidence.chosenHeadingIndex, 1);
  assert.equal(clearAlternative.evidence.oldSolidReferenceRayCheck, true); assert.equal(rayChecks, 8);
  rayChecks = 0;
  assert.equal(createOceanSceneObservation({ ...options, candidateClear: () => { rayChecks++; return false; } }), null);
  assert.equal(rayChecks, 8, 'old solid occlusion refusal cannot restart or extend the bounded heading search');
  assert.equal(createOceanSceneObservation({ ...options, generator: { floorSurface: () => { throw new Error('unavailable terrain'); } } }), null);
});
