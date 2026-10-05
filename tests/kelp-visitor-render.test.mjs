import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kelpVisitorSpeciesCatalog, kelpVisitorSpeciesById } from '../src/kelpVisitorSpecies.js';
import { kelpWaterSpeciesCatalog } from '../src/kelpWaterSpecies.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { createKelpVisitorOrganism, animateKelpVisitorOrganism, disposeKelpVisitorOrganism } from '../src/world/kelpVisitorOrganism.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from '../src/world/kelpOrganisms.js';
import { createKelpWaterOrganism, animateKelpWaterOrganism, disposeKelpWaterOrganism } from '../src/world/kelpWaterOrganisms.js';

const catalog = [...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog, ...kelpVisitorSpeciesCatalog];
const species = kelpVisitorSpeciesById['leopard-shark'];
const shark = (id, extras = {}) => ({ id, speciesId: 'leopard-shark', regionId: '-5,-2',
  position: { x: -289, y: 4, z: -98 }, velocity: { x: .28, y: 0, z: 0 },
  heading: 0, sizeM: 1.35, alive: true, state: 'patrolling', timeSec: 12,
  individualPhaseRad: .35, localEnvironment: { currentMps: .18 }, ...extras });
const meshes = object => { const result = []; object.traverse(item => { if (item.isMesh) result.push(item); }); return result; };
const shape = object => meshes(object).map(item => ({ name: item.name,
  vertices: Array.from(item.geometry.attributes.position.array),
  color: item.geometry.attributes.color ? Array.from(item.geometry.attributes.color.array) : null,
  scale: item.scale.toArray(), position: item.position.toArray(), rotation: item.rotation.toArray() }));
const pose = object => object.userData.motion.tail.rotation.toArray();

test('the regional visitor is a separate sourced total-length representative, excluded from the authored species catalog', () => {
  assert.equal(kelpVisitorSpeciesCatalog.length, 1);
  assert.equal(species.id, 'leopard-shark'); assert.equal(species.scientificName, 'Triakis semifasciata');
  assert.equal(species.kind, 'fish'); assert.equal(species.regionalOnly, true);
  assert.equal(species.sizeMeasure, 'total-length'); assert.deepEqual(species.displaySizeM.range, [1.2, 1.5]);
  assert.ok(Object.isFrozen(kelpVisitorSpeciesCatalog));
  assert.ok(species.sources.length && species.sources.every(source => /^https:\/\//.test(source.url)));
  assert.equal(kelpSpeciesCatalog.some(item => item.id === species.id), false);
  assert.equal(kelpWaterSpeciesCatalog.some(item => item.id === species.id), false);
  assert.match(species.behavior, /未校准|定性|展示/);
});

test('the neutral shared shape measures one metre before individual total-length scaling', () => {
  const object = createKelpVisitorOrganism(species);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1) < .002, `unit total length was ${size.x}`);
  for (const length of [1.2, 1.5]) {
    object.scale.setScalar(length); object.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    assert.ok(Math.abs(scaled.x - length) < .003);
  }
  assert.equal(meshes(object).length, 4, 'one bounded whole-animal shape; no per-frame geometry allocation');
  disposeKelpVisitorOrganism(object);
});

test('the visitor renders its actual size, owner and heading and is pickable without mutating biological records', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const animal = shark('shark:actual'), original = structuredClone(animal);
  animals.update([animal], 9000, { x: -320, z: -128 });
  const object = animals.getObject(animal.id);
  assert.equal(object.userData.motion.type, 'leopard-shark'); assert.equal(object.scale.x, 1.35);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [31, 4, 30]);
  assert.ok(Math.abs(object.rotation.y) < 1e-12); assert.equal(object.userData.agentId, animal.id);
  assert.equal(object.userData.regionId, animal.regionId); assert.deepEqual(animals.stats.speciesCounts, { 'leopard-shark': 1 });
  assert.deepEqual(animals.pickableObjects, [object]);
  const point = object.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(.1, 0, 2)), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(animals.pickableObjects, true).length, 'the actual body has outward picking triangles');
  assert.deepEqual(animal, original);
});

test('regional time gives deterministic tail motion through pause, unload/rebuild and million-metre floating origins', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const animal = shark('shark:persistent', { position: { x: 1e6 + 8, y: 3, z: -1e6 - 6 }, heading: Math.PI / 2,
    velocity: { x: 0, y: .014, z: .28 } });
  animals.update([animal], 20, { x: 1e6, z: -1e6 });
  const object = animals.getObject(animal.id), frozen = pose(object), resources = meshes(object).map(item => item.geometry);
  assert.equal(object.userData.motion.lastTimeSec, 12);
  assert.equal(object.rotation.y, -Math.PI / 2); assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [8, 3, -6]);
  animals.update([animal], 9999, { x: 1e6 + 64, z: -1e6 - 64 });
  assert.deepEqual(pose(object), frozen); assert.deepEqual(meshes(object).map(item => item.geometry), resources);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-56, 3, 58]);
  animals.sync([]); animals.update([animal], 9999, { x: 1e6 + 64, z: -1e6 - 64 });
  assert.deepEqual(pose(animals.getObject(animal.id)), frozen);
  animals.update([{ ...animal, timeSec: 12.1 }], 9999);
  assert.notDeepEqual(pose(animals.getObject(animal.id)), frozen);
  const direct = createKelpVisitorOrganism(species);
  direct.userData.phase = animals.getObject(animal.id).userData.phase;
  animateKelpVisitorOrganism(direct, 12, animal); assert.deepEqual(pose(direct), frozen);
  disposeKelpVisitorOrganism(direct);
});

test('all original native and blue-rockfish mesh vertices and animation remain exact alongside the visitor', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const originals = [...kelpSpeciesCatalog.filter(item => item.kind !== 'kelp'), ...kelpWaterSpeciesCatalog].map((item, index) =>
    shark(`old:${index}`, { speciesId: item.id, sizeM: item.lengthM || .1, position: { x: index * 2, y: 2, z: 3 }, timeSec: 8.2 }));
  const all = [...originals, shark('visitor:alongside')], before = structuredClone(all);
  animals.update(all, 700);
  for (const old of originals) {
    const info = catalog.find(item => item.id === old.speciesId), water = old.speciesId === 'blue-rockfish';
    const baseline = water ? createKelpWaterOrganism(info) : createKelpOrganism(info);
    baseline.userData.phase = animals.getObject(old.id).userData.phase;
    if (water) animateKelpWaterOrganism(baseline, old.timeSec, old);
    else animateKelpOrganism(baseline, old.timeSec, old.localEnvironment);
    assert.deepEqual(shape(animals.getObject(old.id)), shape(baseline), `old shape ${old.speciesId}`);
    if (water) disposeKelpWaterOrganism(baseline); else disposeKelpOrganism(baseline);
  }
  assert.deepEqual(all, before);
  const oldObjects = originals.map(item => animals.getObject(item.id));
  animals.update(originals, 900);
  assert.deepEqual(originals.map(item => animals.getObject(item.id)), oldObjects);
});

test('visitor geometries/materials are shared and released once, with old native and water assets independent', () => {
  const animals = new KelpOceanAnimals(catalog), a = shark('visitor:a'), b = shark('visitor:b');
  const old = shark('native', { speciesId: 'giant-kelpfish' }), water = shark('water', { speciesId: 'blue-rockfish', sizeM: .3 });
  animals.update([a, b, old, water], 0);
  const first = animals.getObject(a.id), second = animals.getObject(b.id), legacy = animals.getObject(old.id);
  assert.deepEqual(meshes(first).map(item => item.geometry), meshes(second).map(item => item.geometry));
  assert.deepEqual(meshes(first).map(item => item.material), meshes(second).map(item => item.material));
  const owned = new Set(meshes(first).flatMap(item => [item.geometry, item.material]));
  const oldResources = new Set([legacy, animals.getObject(water.id)].flatMap(object => meshes(object).flatMap(item => [item.geometry, item.material])));
  assert.ok([...owned].every(resource => !oldResources.has(resource)));
  const disposed = new Map([...owned].map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  let oldDisposals = 0; for (const resource of oldResources) resource.addEventListener('dispose', () => oldDisposals++);
  animals.update([b, old, water], 0); assert.ok([...disposed.values()].every(count => count === 0));
  assert.equal(first.parent, null); assert.equal(first.children.length, 0);
  animals.update([old, water], 0); assert.ok([...disposed.values()].every(count => count === 1));
  assert.equal(oldDisposals, 0); assert.equal(animals.getObject(old.id), legacy);
  animals.dispose(); animals.dispose(); assert.ok([...disposed.values()].every(count => count === 1));
  assert.equal(animals.root.children.length, 0); assert.equal(animals.update([a], 10), false);
});

test('dead/unknown visitors are not selectable; changing species and resetting release the correct resources', () => {
  const animals = new KelpOceanAnimals(catalog), animal = shark('same:id');
  animals.update([animal, shark('dead', { alive: false }), shark('unknown', { speciesId: 'unknown' })], 0);
  const first = animals.getObject(animal.id); assert.equal(animals.stats.activeAnimals, 1);
  animals.update([{ ...animal, speciesId: 'giant-kelpfish' }], 0);
  assert.equal(first.children.length, 0); assert.equal(first.parent, null);
  assert.equal(animals.getObject(animal.id).userData.motion.type, 'fish');
  animals.update([animal], 0); const rebuilt = animals.getObject(animal.id);
  assert.equal(rebuilt.userData.motion.type, 'leopard-shark');
  animals.reset(); assert.equal(rebuilt.children.length, 0); assert.equal(animals.pickableObjects.length, 0);
  assert.equal(animals.stats.activeAnimals, 0); animals.dispose();
  assert.throws(() => createKelpVisitorOrganism({ id: 'giant-kelpfish' }), /Unsupported/);
  const standalone = createKelpVisitorOrganism(species); disposeKelpVisitorOrganism(standalone); disposeKelpVisitorOrganism(standalone);
});
