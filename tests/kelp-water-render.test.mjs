import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kelpWaterSpeciesCatalog, kelpWaterSpeciesById } from '../src/kelpWaterSpecies.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from '../src/world/kelpOrganisms.js';
import { createKelpWaterOrganism, disposeKelpWaterOrganism } from '../src/world/kelpWaterOrganisms.js';
import { KELP_ANCHORS, leafAttachmentPosition } from '../src/kelpHabitat.js';

const catalog = [...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog];
const species = kelpWaterSpeciesById['blue-rockfish'];
const agent = (id, overrides = {}) => ({ id, regionId: '4,-2', speciesId: species.id,
  groupId: '4,-2:blue-school', individualPhaseRad: .35, position: { x: 286, y: 5.5, z: -91 },
  velocity: { x: .18, y: 0, z: 0 }, heading: 0, sizeM: .3, energy: .7,
  timeSec: 12, state: 'schooling', alive: true, localEnvironment: { currentMps: .18 }, ...overrides });
const meshes = root => {
  const found = []; root.traverse(item => { if (item.isMesh) found.push(item); }); return found;
};
const shape = root => meshes(root).map(item => ({ name: item.name,
  vertices: Array.from(item.geometry.attributes.position.array),
  scale: item.scale.toArray(), position: item.position.toArray(), rotation: item.rotation.toArray() }));
const pose = root => [root.userData.motion.anatomy.rotation.toArray(), root.userData.motion.tail.rotation.toArray()];

test('continuous water catalog keeps a distinct approximately 30 cm rockfish with explicit source and display limits', () => {
  assert.equal(kelpWaterSpeciesCatalog.length, 1); assert.equal(species.id, 'blue-rockfish');
  assert.equal(species.scientificName, 'Sebastes mystinus'); assert.equal(species.kind, 'fish');
  assert.equal(species.lengthM, .3); assert.equal(species.sizeMeasure, 'total-length');
  assert.equal(species.regionalOnly, true); assert.equal(kelpSpeciesCatalog.some(s => s.id === species.id), false);
  assert.match(species.nameNote, /描述性/); assert.match(species.behavior, /未校准/);
  assert.match(species.diet, /相对参考量/); assert.match(species.sources[0].url, /nmfs\.noaa\.gov/);
  assert.ok(Object.isFrozen(kelpWaterSpeciesCatalog));
});

test('actual metre-scaled rockfish has a deep ordinary fish body, continuous dorsal and broad shallow-notched tail, with working picking', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const fish = agent('rockfish:0', { timeSec: 0, individualPhaseRad: 0 }), saved = structuredClone(fish);
  animals.update([fish], 300, { x: 256, z: -128 });
  const object = animals.getObject(fish.id), motion = object.userData.motion;
  assert.equal(motion.type, 'rockfish'); assert.equal(object.scale.x, .3);
  assert.deepEqual(object.userData.sources, species.sources);
  assert.deepEqual(animals.stats.speciesCounts, { 'blue-rockfish': 1 });
  assert.equal(animals.stats.detailedHosts, 0); assert.equal(meshes(object).length, 4);
  const full = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  assert.ok(full.x > .299 && full.x < .302, 'total length is head to tail, in metres');
  const bodySize = new THREE.Box3().setFromObject(motion.body).getSize(new THREE.Vector3());
  assert.ok(bodySize.y / bodySize.x > .32 && bodySize.z / bodySize.x > .17,
    'rounded deep forebody is not the thin leaf-shaped kelpfish');
  const color = motion.body.geometry.attributes.color, p = motion.body.geometry.attributes.position;
  const values = Array.from({ length: color.count }, (_, i) => ({ y: p.getY(i), r: color.getX(i), g: color.getY(i), b: color.getZ(i) }));
  assert.ok(values.some(v => v.b > v.g && v.g > v.r), 'the body includes restrained grey-blue sides');
  assert.ok(Math.min(...values.map(v => v.r)) < Math.max(...values.map(v => v.r)) * .4, 'broad dark patches remain readable');
  const fins = motion.fins.geometry.attributes.position;
  assert.ok(Array.from({ length: fins.count }, (_, i) => [fins.getX(i), fins.getY(i)])
    .some(([x, y]) => x > .1 && y > .22), 'front spinous dorsal rises above the body');
  assert.ok(Array.from({ length: fins.count }, (_, i) => [fins.getX(i), fins.getY(i)])
    .some(([x, y]) => x < -.1 && y > .19), 'continuous sheet includes rear soft dorsal lobe');
  const tail = motion.tail.children[0].geometry.attributes.position;
  const tips = Array.from({ length: tail.count }, (_, i) => [tail.getX(i), tail.getY(i)]);
  const centerEdge = tips.find(([x, y]) => x < -.1 && Math.abs(y) < .001)[0];
  assert.ok(tips.some(([x, y]) => y > .09 && centerEdge - x > .02 && centerEdge - x < .03));
  assert.ok(tips.some(([x, y]) => y < -.09 && centerEdge - x > .02 && centerEdge - x < .03));
  const point = object.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(.03, 0, .25)), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(animals.pickableObjects, true).some(hit => hit.object === motion.body),
    'outward body triangles support the existing observation ray');
  assert.equal(object.userData.agentId, fish.id); assert.equal(object.userData.regionId, fish.regionId);
  assert.deepEqual(fish, saved, 'renderer preserves ecology fields');
});

test('regional time and individual phase govern motion, while pause, floating origin and reload preserve the exact pose', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const fish = agent('rockfish:persistent'); animals.update([fish], 100, { x: 256, z: -128 });
  const object = animals.getObject(fish.id), frozen = pose(object), geometry = meshes(object).map(item => item.geometry);
  assert.equal(object.userData.motion.lastTimeSec, 12); assert.equal(object.userData.motion.phaseRad, .35);
  animals.update([fish], 9999, { x: 320, z: -64 });
  assert.equal(animals.getObject(fish.id), object); assert.deepEqual(pose(object), frozen);
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-34, 5.5, -27]);
  assert.deepEqual(meshes(object).map(item => item.geometry), geometry);
  animals.sync([]); animals.update([fish], 9999, { x: 320, z: -64 });
  assert.deepEqual(pose(animals.getObject(fish.id)), frozen);
  animals.update([{ ...fish, timeSec: 12.1 }], 9999);
  assert.notDeepEqual(pose(animals.getObject(fish.id)), frozen);
  const other = agent('rockfish:different-phase', { individualPhaseRad: 1.9 });
  animals.update([fish, other], 9999);
  assert.notDeepEqual(pose(animals.getObject(other.id)), frozen, 'school members are not driven by one identical tail phase');
});

test('far logical coordinates render correctly with their heading and vertical motion through repeated origin shifts', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  for (const sign of [-1, 1]) {
    const fish = agent(`rockfish:far:${sign}`, { position: { x: sign * 1000000 + 8, y: 3, z: sign * 1000000 - 6 },
      heading: Math.PI / 2, velocity: { x: 0, y: .015, z: .18 } });
    animals.update([fish], 10, { x: sign * 1000000, z: sign * 1000000 });
    const object = animals.getObject(fish.id), frozen = pose(object);
    assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [8, 3, -6]);
    assert.equal(object.rotation.y, -Math.PI / 2); assert.ok(object.rotation.z > 0 && object.rotation.z < .25);
    animals.update([fish], 100, { x: sign * 1000000 + 64, z: sign * 1000000 - 64 });
    assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-56, 3, 58]);
    assert.deepEqual(pose(object), frozen);
  }
});

test('all five original animal meshes and poses keep their original factory; a snail retains its exact regional leaf host beside the new school', t => {
  const animals = new KelpOceanAnimals(catalog); t.after(() => animals.dispose());
  const originals = kelpSpeciesCatalog.filter(s => s.kind !== 'kelp').map((s, i) =>
    agent(`legacy:${i}`, { speciesId: s.id, sizeM: .1, timeSec: 8.2, position: { x: 2 + i, y: 1, z: 3 } }));
  const hostAnchor = { ...KELP_ANCHORS[0], id: 'actual-anchor', x: 5, y: 0, z: 6 };
  const snail = originals.find(a => a.speciesId === 'brown-turban-snail');
  Object.assign(snail, { attachment: { hostId: hostAnchor.id, leafIndex: 8, along: .5, clearanceM: .008 },
    hostSceneryId: 'actual-plant:0', hostAnchor, hostTimeSec: 8.2, hostEnvironment: { deformationCurrentMps: .24 } });
  snail.position = leafAttachmentPosition(hostAnchor, snail.attachment, snail.hostTimeSec, snail.hostEnvironment);
  const all = [...originals, agent('water:alongside')], saved = structuredClone(all);
  animals.update(all, 700, { x: 0, z: 0 }, new THREE.Vector3(5, 2, 6));
  for (const old of originals) {
    const baseline = createKelpOrganism(catalog.find(s => s.id === old.speciesId));
    baseline.userData.phase = animals.getObject(old.id).userData.phase;
    animateKelpOrganism(baseline, old.timeSec, old.localEnvironment);
    assert.deepEqual(shape(animals.getObject(old.id)), shape(baseline)); disposeKelpOrganism(baseline);
  }
  assert.deepEqual(animals.detailedHostIds, ['actual-plant:0']);
  const host = animals.hosts.get('actual-plant:0');
  assert.equal(host.userData.motion.lastGeometry.timeSec, 8.2);
  assert.equal(host.userData.motion.lastGeometry.flow, .24);
  assert.deepEqual(all, saved);
  const animalObjects = originals.map(a => animals.getObject(a.id));
  animals.update(originals, 900, { x: 0, z: 0 }, new THREE.Vector3(5, 2, 6));
  assert.deepEqual(originals.map(a => animals.getObject(a.id)), animalObjects);
  assert.equal(animals.hosts.get('actual-plant:0'), host);
  assert.equal(animals.stats.speciesCounts['blue-rockfish'], undefined);
});

test('school resources are shared and released exactly once after the last water fish leaves, without disposing old animals', () => {
  const animals = new KelpOceanAnimals(catalog), first = agent('water:a'), second = agent('water:b');
  const old = agent('legacy:fish', { speciesId: 'giant-kelpfish' }); animals.update([first, second, old], 0);
  const a = animals.getObject(first.id), b = animals.getObject(second.id), legacy = animals.getObject(old.id);
  assert.deepEqual(meshes(a).map(item => item.geometry), meshes(b).map(item => item.geometry));
  assert.deepEqual(meshes(a).map(item => item.material), meshes(b).map(item => item.material));
  const owned = new Set(meshes(a).flatMap(item => [item.geometry, item.material]));
  const legacyResources = new Set(meshes(legacy).flatMap(item => [item.geometry, item.material]));
  assert.ok([...owned].every(value => !legacyResources.has(value)), 'separate cache cannot release old kelpfish assets');
  const disposed = new Map([...owned].map(value => [value, 0]));
  for (const value of owned) value.addEventListener('dispose', () => disposed.set(value, disposed.get(value) + 1));
  let legacyDisposals = 0; for (const value of legacyResources) value.addEventListener('dispose', () => legacyDisposals++);
  animals.update([second, old], 0); assert.ok([...disposed.values()].every(count => count === 0));
  assert.equal(a.parent, null); assert.equal(a.children.length, 0);
  animals.update([old], 0); assert.ok([...disposed.values()].every(count => count === 1));
  assert.equal(legacyDisposals, 0); assert.equal(animals.getObject(old.id), legacy);
  animals.dispose(); animals.dispose(); assert.equal(animals.root.children.length, 0);
  assert.ok([...disposed.values()].every(count => count === 1)); assert.equal(animals.update([first], 10), false);
});

test('species replacement, dead school members and reset release water meshes and leave only live selectable animals', () => {
  const animals = new KelpOceanAnimals(catalog), water = agent('same:id');
  animals.update([water, agent('dead:id', { alive: false }), agent('unknown', { speciesId: 'unsupported' })], 0);
  const before = animals.getObject(water.id); assert.equal(animals.stats.activeAnimals, 1);
  animals.update([{ ...water, speciesId: 'giant-kelpfish' }], 0);
  assert.equal(before.userData.waterDisposed, true); assert.equal(before.children.length, 0);
  assert.equal(animals.getObject(water.id).userData.motion.type, 'fish');
  animals.update([water], 0); const reloaded = animals.getObject(water.id);
  assert.equal(reloaded.userData.motion.type, 'rockfish');
  animals.reset(); assert.equal(reloaded.userData.waterDisposed, true);
  assert.equal(animals.stats.activeAnimals, 0); assert.equal(animals.pickableObjects.length, 0);
  assert.equal(animals.root.children.length, 0); animals.dispose();
  assert.throws(() => createKelpWaterOrganism({ id: 'giant-kelpfish' }), /Unsupported/);
  const standalone = createKelpWaterOrganism(species); disposeKelpWaterOrganism(standalone); disposeKelpWaterOrganism(standalone);
});
