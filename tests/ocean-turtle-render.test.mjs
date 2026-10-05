import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { speciesCatalog } from '../src/species.js';
import { oceanSlopeSpeciesCatalog } from '../src/oceanSlopeSpecies.js';
import { oceanPelagicSpeciesCatalog } from '../src/oceanPelagicSpecies.js';
import { oceanMantaSpeciesCatalog } from '../src/oceanMantaSpecies.js';
import { oceanTurtleSpeciesCatalog } from '../src/oceanTurtleSpecies.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createOrganism, animateOrganism, disposeOrganism } from '../src/world/organisms.js';
import { createOceanTurtleOrganism, animateOceanTurtleOrganism, disposeOceanTurtleOrganism } from '../src/world/OceanTurtleOrganisms.js';

const species = oceanTurtleSpeciesCatalog[0], prior = [...speciesCatalog, ...oceanSlopeSpeciesCatalog, ...oceanPelagicSpeciesCatalog, ...oceanMantaSpeciesCatalog];
const meshes = object => { const rows = []; object.traverse(child => { if (child.isMesh) rows.push(child); }); return rows; };
const pose = object => [...object.userData.motion.frontFlippers, ...object.userData.motion.rearFlippers].map(pivot => pivot.rotation.toArray());
const shape = object => meshes(object).map(mesh => ({ name: mesh.name,
  positions: Array.from(mesh.geometry.attributes.position.array), normals: Array.from(mesh.geometry.attributes.normal.array),
  colors: mesh.geometry.attributes.color ? Array.from(mesh.geometry.attributes.color.array) : null,
  position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray() }));
const turtle = (id, overrides = {}) => ({ id, regionId: '3,1', speciesId: 'green-turtle', sizeM: 1.4,
  position: { x: 220, y: -3, z: 96 }, velocity: { x: .2, y: .01, z: 0 }, heading: 0, pitch: .04,
  timeSec: 24.5, alive: true, state: 'seagrass-cruising', ...overrides });

test('the appended sourced total-length representative has a bounded whole animated outline and a fixed physical nostril', () => {
  assert.equal(species.id, 'green-turtle'); assert.equal(species.scientificName, 'Chelonia mydas'); assert.equal(species.kind, 'turtle');
  assert.equal(species.sizeMeasure, 'total-length'); assert.equal(species.regionalOnly, true);
  assert.ok(species.sources.some(source => new URL(source.url).hostname === 'www.fisheries.noaa.gov'));
  assert.match(species.behavior, /未模拟氧气|未校准/); assert.match(species.diet, /未接入摄食/);
  assert.deepEqual(sceneCatalogs.reef.slice(0, prior.length), prior); prior.forEach((item, index) => assert.equal(sceneCatalogs.reef[index], item));
  assert.deepEqual(sceneCatalogs.reef.slice(prior.length), oceanTurtleSpeciesCatalog); assert.equal(speciesCatalog.some(s => s.id === species.id), false);
  const object = createOceanTurtleOrganism(species); object.updateMatrixWorld(true);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x - 1) < 1e-7, 'neutral full total length is one metre');
  assert.equal(meshes(object).length, 7); assert.equal(new Set(meshes(object).map(mesh => mesh.geometry)).size, 5);
  assert.equal(new Set(meshes(object).map(mesh => mesh.material)).size, 3);
  assert.deepEqual(object.userData.nostrilReference.toArray(), [.49, .055, 0]);
  const vertex = new THREE.Vector3();
  for (const state of ['seagrass-cruising', 'surfacing', 'breathing', 'diving']) for (const time of [0, 1, 2, 4.37, 17]) for (const pitch of [-.15, 0, .15]) {
    object.rotation.z = pitch; animateOceanTurtleOrganism(object, time, { state }); object.updateMatrixWorld(true);
    for (const mesh of meshes(object)) {
      const positions = mesh.geometry.attributes.position;
      assert.ok(Array.from(positions.array).every(Number.isFinite)); assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
        assert.ok(Math.hypot(vertex.x, vertex.z) <= .64 + 1e-8, 'the complete animated front/rear flippers fit the declared horizontal body radius');
        assert.ok(Math.abs(vertex.y) <= .25 + 1e-8, 'actual pitched shell, rigid head and flippers fit the whole-body vertical half-height');
      }
    }
  }
  object.rotation.set(0, 0, 0); object.position.set(2, 8 - .055 * 1.4, 3); object.scale.setScalar(1.4); object.updateMatrixWorld(true);
  const nose = object.localToWorld(object.userData.nostrilReference.clone()); assert.ok(Math.abs(nose.y - 8) < 1e-12);
  animateOceanTurtleOrganism(object, 900, { state: 'breathing' }); object.updateMatrixWorld(true);
  assert.deepEqual(object.localToWorld(object.userData.nostrilReference.clone()).toArray(), nose.toArray(), 'breathing animation never bobs the reference away from the actual head');
  disposeOceanTurtleOrganism(object);
});

test('actual turtle dispatch preserves size, owner, pitch, picking and its regional clock through pause and distant rebasing', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef); t.after(() => animals.dispose());
  const agent = turtle('turtle:actual', { position: { x: 1e6 + 3, y: -3, z: -1e6 - 4 }, heading: Math.PI / 2, pitch: -.15 });
  const saved = structuredClone(agent); animals.update([agent], 900, { x: 1e6, z: -1e6 });
  const object = animals.getObject(agent.id), frozen = pose(object); assert.equal(object.userData.kind, 'turtle');
  assert.equal(object.rotation.y, -Math.PI / 2); assert.equal(object.rotation.z, -.15); assert.equal(object.scale.x, 1.4);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [3, -3, -4]);
  assert.equal(object.userData.regionId, agent.regionId); assert.deepEqual(animals.pickableObjects, [object]);
  const ray = new THREE.Raycaster(new THREE.Vector3(3, 1, -4), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObjects(animals.pickableObjects, true).length, 'the actual outward shell triangles remain selectable');
  animals.update([agent], 99000, { x: 1e6 + 64, z: -1e6 - 64 }); assert.deepEqual(pose(object), frozen);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-61, -3, 60]);
  animals.sync([]); animals.update([agent], 999000, { x: 1e6 + 64, z: -1e6 - 64 }); assert.deepEqual(pose(animals.getObject(agent.id)), frozen);
  animals.update([{ ...agent, timeSec: agent.timeSec + .3 }], 999000); assert.notDeepEqual(pose(animals.getObject(agent.id)), frozen);
  const breathing = turtle('turtle:breathing', { position: { x: 220, y: 8 - .055 * 1.4, z: 96 }, state: 'breathing', pitch: 0,
    velocity: { x: 0, y: 0, z: 0 }, heading: 1.23 });
  animals.update([breathing], 100, { x: 192, z: 64 }); const shell = animals.getObject(breathing.id);
  assert.equal(shell.rotation.z, 0); assert.ok(Math.abs(shell.localToWorld(shell.userData.nostrilReference.clone()).y - 8) < 1e-12);
  assert.deepEqual(agent, saved, 'display animation never rewrites the durable ecological animal');
});

test('shared turtle resources release once and remain independent of original animals through deaths, species changes and reset', () => {
  const animals = new OceanAnimals(sceneCatalogs.reef), a = turtle('turtle:a'), b = turtle('turtle:b'), old = turtle('native', { speciesId: 'green-chromis', sizeM: .075 });
  animals.update([a, b, old], 0); const first = animals.getObject(a.id), second = animals.getObject(b.id), native = animals.getObject(old.id);
  assert.deepEqual(meshes(first).map(mesh => mesh.geometry), meshes(second).map(mesh => mesh.geometry));
  assert.deepEqual(meshes(first).map(mesh => mesh.material), meshes(second).map(mesh => mesh.material));
  const resources = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material])), counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  const nativeResources = new Set(meshes(native).flatMap(mesh => [mesh.geometry, mesh.material])); assert.ok([...resources].every(r => !nativeResources.has(r)));
  animals.update([b, old, { ...a, alive: false }], 0); assert.ok([...counts.values()].every(value => value === 0));
  assert.equal(first.parent, null); assert.equal(first.children.length, 0); assert.equal(animals.getObject(a.id), null);
  animals.update([old], 0); assert.ok([...counts.values()].every(value => value === 1)); assert.equal(animals.getObject(old.id), native);
  animals.update([a, old], 0); const replacement = animals.getObject(a.id); animals.update([{ ...a, speciesId: 'reef-manta', sizeM: 3.15 }, old], 0);
  assert.equal(replacement.children.length, 0); assert.equal(animals.getObject(a.id).userData.kind, 'ray');
  animals.reset(); assert.equal(animals.pickableObjects.length, 0); animals.dispose(); animals.dispose(); assert.ok([...counts.values()].every(value => value === 1));
  assert.equal(animals.update([a], 0), false);
});

test('all delivered native, pelagic and manta geometry and animation remain exact beside the turtle and immutable source hashes', t => {
  const frozen = JSON.parse(readFileSync(new URL('../output/validation/ocean-turtle-source-hashes-before.json', import.meta.url), 'utf8'));
  for (const file of ['src/oceanGeneration.js', 'src/oceanRockShape.js', 'src/simulation.js', 'src/species.js', 'src/world/organisms.js',
    'src/kelpOceanGeneration.js', 'src/kelpOceanEcology.js', 'src/kelpSimulation.js', 'src/world/kelpOrganisms.js']) {
    const expected = frozen.find(row => row.file === file); assert.ok(expected);
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex'), expected.sha256, `${file}: old physical world and bodies stay exact`);
  }
  const animals = new OceanAnimals(sceneCatalogs.reef); t.after(() => animals.dispose());
  const representatives = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'black-cucumber', 'blue-starfish', 'yellowtail-fusilier', 'reef-manta']
    .map((id, index) => turtle(`old:${id}`, { speciesId: id, sizeM: prior.find(s => s.id === id).lengthM, pitch: 0, position: { x: 220 + index * 2, y: -1, z: 96 } }));
  animals.update([...representatives, turtle('turtle:alongside')], 500);
  for (const agent of representatives) {
    const direct = createOrganism(prior.find(s => s.id === agent.speciesId)); direct.userData.phase = animals.getObject(agent.id).userData.phase;
    animateOrganism(direct, agent.timeSec, 1); assert.deepEqual(shape(animals.getObject(agent.id)), shape(direct), `${agent.speciesId}: complete original mesh and animated parts`);
    disposeOrganism(direct);
  }
});
