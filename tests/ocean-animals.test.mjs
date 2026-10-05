import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { speciesCatalog } from '../src/species.js';

function animal(id, overrides = {}) {
  return { id, regionId: '3,-2', speciesId: 'green-chromis',
    position: { x: 205, y: -4.2, z: -85 }, velocity: { x: .12, y: 0, z: 0 },
    heading: 0, sizeM: .075, state: 'schooling', alive: true, ...overrides };
}

function meshes(root) {
  const result = [];
  root.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}

test('only known living regional agents are loaded and carry picking metadata', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const agents = [animal('a'), animal('b'), animal('dead', { alive: false }),
    animal('unknown', { speciesId: 'unknown' })];
  animals.update(agents, 0, { x: 0, z: 0 });
  assert.equal(animals.entities.size, 2);
  assert.equal(animals.root.children.length, 2);
  assert.equal(animals.root.userData.oceanStreaming, true);
  assert.deepEqual(animals.pickableObjects.map(object => object.userData.agentId), ['a', 'b']);
  assert.equal(animals.getObject('a').userData.regionId, '3,-2');
  assert.equal(animals.getObject('a').userData.speciesId, 'green-chromis');
  assert.equal(animals.getObject('dead'), null);
  assert.deepEqual(animals.stats.speciesCounts, { 'green-chromis': 2 });
});

test('floating origin preserves logical coordinates, support height and local LOD distance', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const origin = { x: 1e9, z: -1e9 };
  const agent = animal('far-origin', { position: { x: origin.x + 3, y: -9.14, z: origin.z + 2 } });
  const originalPosition = { ...agent.position };
  animals.update([agent], 2, origin, new THREE.Vector3(3, -9.14, 2.2));
  const object = animals.getObject(agent.id);
  assert.deepEqual(agent.position, originalPosition);
  assert.deepEqual(object.position.toArray(), [origin.x + 3, -9.14, origin.z + 2]);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [3, -9.14, 2]);
  assert.equal(object.userData.detail.level, 'near');
  assert.equal(animals.setRenderOrigin(origin), false);
  assert.equal(animals.setRenderOrigin({ x: origin.x + 64, z: origin.z }), true);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-61, -9.14, 2]);
});

test('fish yaw and bounded pitch match +X models, while bottom organisms keep their sampled Y', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const fish = animal('fish', { heading: Math.PI / 2, velocity: { x: 0, y: 2, z: .1 } });
  const bottom = animal('bottom', { speciesId: 'black-cucumber', sizeM: .3,
    position: { x: 206, y: -8.83, z: -84 }, heading: -.4 });
  animals.update([fish, bottom], 4);
  assert.equal(animals.getObject('fish').rotation.y, -Math.PI / 2);
  assert.equal(animals.getObject('fish').rotation.z, .25);
  assert.equal(animals.getObject('bottom').position.y, -8.83);
  assert.equal(animals.getObject('bottom').rotation.z, 0);
  assert.equal(animals.getObject('bottom').scale.x, .3);
  assert.equal(animals.getObject('bottom').rotation.y, .4);
});

test('death and region eviction release instances without releasing another animal shared geometry', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const a = animal('a'), b = animal('b');
  animals.update([a, b], 0);
  const object = animals.getObject('a');
  const sharedGeometry = meshes(object).find(mesh => meshes(animals.getObject('b')).some(other => other.geometry === mesh.geometry)).geometry;
  let disposals = 0;
  sharedGeometry.addEventListener('dispose', () => disposals++);
  animals.update([{ ...a, alive: false }, b], 1);
  assert.equal(animals.getObject('a'), null);
  assert.equal(object.parent, null);
  assert.equal(object.children.length, 0);
  assert.equal(object.userData.resources.size, 0);
  assert.equal(disposals, 0);
  animals.sync([]);
  assert.equal(disposals, 1);
  assert.equal(animals.root.children.length, 0);
});

test('unchanged active agents reuse all objects and geometry across updates', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const agents = Array.from({ length: 18 }, (_, index) => animal(`school-${index}`));
  animals.update(agents, 0);
  const objects = animals.pickableObjects.slice();
  const geometries = objects.map(object => meshes(object).map(mesh => mesh.geometry));
  for (let step = 1; step <= 80; step++) {
    assert.equal(animals.update(agents, step / 10, { x: step * 64, z: 0 }, new THREE.Vector3()), false);
    assert.deepEqual(animals.pickableObjects, objects);
    for (let index = 0; index < objects.length; index++) {
      assert.deepEqual(meshes(objects[index]).map(mesh => mesh.geometry), geometries[index]);
    }
  }
  assert.equal(animals.stats.activeAnimals, 18);
});

test('a regional clock controls feeding and paused animation independently of the original reef clock', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const grazer = animal('regional-grazer', { speciesId: 'lined-tang', state: 'grazing',
    timeSec: 10.35, lastFeedAt: 10 });
  animals.update([grazer], 900);
  const object = animals.getObject(grazer.id);
  assert.ok(Math.abs(object.rotation.z + .18) < 1e-12);
  const tail = object.userData.animation.tails[0];
  const pausedTailAngle = tail.rotation.y;
  animals.update([grazer], 901);
  assert.equal(tail.rotation.y, pausedTailAngle);
  assert.ok(Math.abs(object.rotation.z + .18) < 1e-12);
  animals.update([{ ...grazer, timeSec: 11 }], 901);
  assert.equal(object.rotation.z, 0);
  assert.notEqual(tail.rotation.y, pausedTailAngle);
  animals.update([{ ...grazer, timeSec: NaN, lastFeedAt: 1000 }], 1000.35);
  assert.ok(Math.abs(object.rotation.z + .18) < 1e-12);
});

test('reloaded identity retains animation phase and reset/dispose are repeatable', () => {
  const animals = new OceanAnimals(speciesCatalog);
  const a = animal('persistent-animal');
  animals.update([a], 0);
  const phase = animals.getObject(a.id).userData.phase;
  animals.reset();
  animals.reset();
  animals.update([a], 0);
  assert.equal(animals.getObject(a.id).userData.phase, phase);
  const scene = new THREE.Scene();
  scene.add(animals.root);
  animals.dispose();
  animals.dispose();
  animals.reset();
  assert.equal(animals.entities.size, 0);
  assert.equal(animals.root.parent, null);
  assert.equal(animals.update([a], 1), false);
});
