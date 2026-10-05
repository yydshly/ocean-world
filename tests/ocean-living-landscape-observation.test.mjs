import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanLivingLandscapeObservation, estimatedOceanAnimalLengthPixels } from '../src/oceanLivingLandscapeObservation.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanRockMesh } from '../src/oceanRockShape.js';
import { sceneElementHeight, sceneElementMesh } from '../src/oceanSceneElements.js';
import { habitatSceneHeight } from '../src/oceanHabitatScenes.js';
import { macroLandscapeHeight, macroLandscapeMesh } from '../src/oceanMacroLandscape.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';

const vector = p => new THREE.Vector3(p.x, p.y, p.z);
const flat = { floorSurface: () => ({ height: 0 }) };
const animals = [0, 1, 2].map(i => ({ id: `fish:${i}`, regionId: '0,0', alive: true, sizeM: .25,
  heading: Math.PI / 2, position: { x: 31 + i * .8, y: 1, z: 32 + i * .2 }, velocity: { x: 0, y: 0, z: .1 } }));
const plants = [0, 1].map(i => ({ id: `plant:${i}`, regionId: '0,0', kind: 'reef-colony',
  x: 32 + i, y: 0, z: 32 + i, scale: { x: 1, y: .7, z: 1 } }));
const options = { agents: animals, elements: plants, regionId: '0,0', generator: flat, safeHeight: () => 0, visible: () => true };
function cameraFor(view, fov = 50, aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, .05, 65);
  camera.position.copy(vector(view.position)); camera.lookAt(vector(view.target)); camera.updateMatrixWorld(true);
  return camera;
}

test('the actual saved offshore community gets an ordinary supported view clear of exact floor, old rocks and new mass triangles', t => {
  const receipt = JSON.parse(readFileSync(new URL('../output/validation/natural-community-extension-after.json', import.meta.url), 'utf8'));
  const generator = createOceanGenerator(receipt.ocean.ecology.seed), regions = receipt.ocean.ecology.regions;
  const elements = regions.flatMap(r => [...generator.chunk(r.cx, r.cz).elements.map(e => ({ ...e, regionId: r.id })),
    ...(r.habitatSceneElements ?? []), ...(r.macroLandscapeElements ?? [])]);
  const props = regions.flatMap(r => r.sceneElements ?? []), masses = elements.filter(e => e.kind === 'reef-mass');
  const snapshot = structuredClone({ agents: receipt.ocean.ecology.agents, elements, props });
  const solids = [], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  t.after(() => { for (const mesh of solids) mesh.geometry.dispose(); material.dispose(); });
  const addMesh = (data, position, rotation = 0, scale = { x: 1, y: 1, z: 1 }) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(vector(position)); mesh.rotation.y = rotation; mesh.scale.copy(vector(scale));
    mesh.updateMatrixWorld(true); enableStaticRayQueries(mesh); solids.push(mesh);
  };
  for (const r of regions) {
    const positions = [], indices = [], ox = r.cx * 64, oz = r.cz * 64;
    for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++) positions.push(x, generator.floorVertex(ox + x, oz + z), z);
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) { const a = z * 65 + x, b = a + 1, c = a + 65, d = c + 1; indices.push(a, c, b, b, c, d); }
    addMesh({ positions, indices }, { x: ox, y: 0, z: oz });
  }
  for (const e of elements.filter(e => ['rock', 'formation'].includes(e.kind))) addMesh(oceanRockMesh(e.profile ?? 'mound'), e, e.rotation, e.scale);
  for (const e of masses) { const [cx, cz] = e.regionId.split(',').map(Number); addMesh(macroLandscapeMesh(e, generator), { x: cx * 64, y: 0, z: cz * 64 }); }
  for (const e of props.filter(e => ['stone', 'driftwood', 'bottle'].includes(e.kind))) addMesh(sceneElementMesh(e.kind, e.variant), e, e.rotation, e.scale);
  const safeHeight = (x, z) => Math.max(generator.heightForCamera(x, z),
    ...masses.map(e => macroLandscapeHeight(e, generator, x, z, true) ?? -Infinity),
    ...props.map(e => sceneElementHeight(e, x, z, true) ?? -Infinity),
    ...regions.flatMap(r => r.habitatSceneElements ?? []).map(e => habitatSceneHeight(e, x, z, true) ?? -Infinity));
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const visible = (from, to) => { const delta = vector(to).sub(vector(from)), distance = delta.length(); ray.set(vector(from), delta.multiplyScalar(1 / distance)); ray.near = .01; ray.far = distance - .02; return ray.intersectObjects(solids, false).length === 0; };
  const view = createOceanLivingLandscapeObservation({ agents: receipt.ocean.ecology.agents, elements, regionId: '4,1',
    generator, currentPosition: receipt.ocean.worldPosition, safeHeight, visible, surfaceY: receipt.surfaceY, fov: 49, aspect: 1280 / 720 });
  assert.ok(view); assert.ok(view.animalIds.length >= 2); assert.ok(view.elementIds.length >= 2);
  assert.equal(`${Math.floor(view.position.x / 64)},${Math.floor(view.position.z / 64)}`, '4,1');
  assert.ok(view.position.y >= safeHeight(view.position.x, view.position.z) + 1.25 - 1e-9);
  assert.ok(view.position.y - view.target.y <= 3.3); assert.ok(view.position.y < receipt.surfaceY - .8);
  assert.ok(Math.abs(Math.hypot(view.position.x - view.target.x, view.position.z - view.target.z) - 7.5) < 1e-8);
  assert.ok(visible(view.position, view.target));
  const camera = cameraFor(view, 49, 1280 / 720), frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const id of view.animalIds) {
    const animal = receipt.ocean.ecology.agents.find(a => a.id === id); assert.ok(animal.alive && animal.regionId === '4,1');
    assert.ok(estimatedOceanAnimalLengthPixels(animal, camera, 720) >= 8); assert.ok(visible(view.position, animal.position));
    for (const plane of frustum.planes) assert.ok(plane.distanceToPoint(vector(animal.position)) >= animal.sizeM * .6);
  }
  assert.ok(view.prominentAnimalIds.length >= 1);
  for (const id of view.prominentAnimalIds) {
    const animal = receipt.ocean.ecology.agents.find(a => a.id === id);
    assert.ok(view.animalIds.includes(id) && estimatedOceanAnimalLengthPixels(animal, camera, 720) >= 16);
  }
  assert.equal(view.evidence.fullBodyVisibilityCertified, false, 'finite centre rays and axial pixels do not certify animated body or leaf occlusion');
  assert.deepEqual({ agents: receipt.ocean.ecology.agents, elements, props }, snapshot);
});

test('length projection follows actual metre scale and model yaw/pitch rather than counting head-on fish as broad silhouettes', () => {
  const camera = cameraFor({ position: { x: 0, y: 0, z: 0 }, target: { x: 1, y: 0, z: 0 } });
  const agent = { position: { x: 10, y: 0, z: 0 }, sizeM: .25, heading: 0, velocity: { x: 1, y: 0, z: 0 } };
  assert.ok(estimatedOceanAnimalLengthPixels(agent, camera, 720) < 1e-7);
  assert.ok(estimatedOceanAnimalLengthPixels({ ...agent, heading: Math.PI / 2 }, camera, 720) > 19);
  const pitched = { ...agent, heading: .7, pitch: .12 }, object = new THREE.Object3D();
  object.position.copy(vector(agent.position)); object.rotation.set(0, -pitched.heading, pitched.pitch); object.scale.setScalar(pitched.sizeM); object.updateMatrixWorld(true);
  const head = new THREE.Vector3(.5, 0, 0).applyMatrix4(object.matrixWorld).project(camera), tail = new THREE.Vector3(-.5, 0, 0).applyMatrix4(object.matrixWorld).project(camera);
  const independentPixels = Math.hypot((head.x - tail.x) * 640, (head.y - tail.y) * 360);
  assert.ok(Math.abs(estimatedOceanAnimalLengthPixels(pitched, camera, 720) - independentPixels) < 1e-10);
});

test('selection keeps actual complete references stable under agent order, excludes deaths, tiny and wrong-owner life, and stays finite', () => {
  let cameraChecks = 0;
  const extra = [ { ...animals[0], id: 'dead', alive: false }, { ...animals[0], id: 'small', sizeM: .075 },
    { ...animals[0], id: 'other', regionId: '1,0' }, { ...animals[0], id: 'high', position: { x: 32, y: 7.1, z: 32 } } ];
  const args = { ...options, agents: [...animals, ...extra], safeHeight: () => { cameraChecks++; return 0; } };
  const before = structuredClone({ agents: args.agents, elements: args.elements }), view = createOceanLivingLandscapeObservation(args);
  assert.ok(view); assert.ok(view.animalIds.length >= 2); assert.ok(view.animalIds.every(id => id.startsWith('fish:')));
  assert.ok(cameraChecks <= 24); assert.deepEqual(createOceanLivingLandscapeObservation({ ...args, agents: [...args.agents].reverse() }), view);
  assert.deepEqual({ agents: args.agents, elements: args.elements }, before);
});

test('blocked solids, excessive foreground height, no plants and one survivor reject honestly instead of creating or moving life', () => {
  assert.equal(createOceanLivingLandscapeObservation({ ...options, visible: () => false }), null);
  assert.equal(createOceanLivingLandscapeObservation({ ...options, safeHeight: () => 7.9 }), null);
  assert.equal(createOceanLivingLandscapeObservation({ ...options, elements: [] }), null);
  assert.equal(createOceanLivingLandscapeObservation({ ...options, agents: [animals[0]] }), null);
  assert.equal(createOceanLivingLandscapeObservation({ ...options, regionId: 'bad' }), null);
  assert.equal(createOceanLivingLandscapeObservation({ ...options, fov: NaN }), null);
});
