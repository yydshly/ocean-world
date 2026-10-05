import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { speciesCatalog } from '../src/species.js';
import { createOrganism, animateOrganism, disposeOrganism } from '../src/world/organisms.js';
import { REEF_GUILD_ENVELOPES, createReefGuildOrganism, animateReefGuildOrganism,
  updateReefGuildDetail, disposeReefGuildOrganism, reefGuildAssetStats } from '../src/world/reefGuildAssets.js';

const guild = [
  { id: 'day-octopus', kind: 'octopus', lengthM: .65 },
  { id: 'spotted-reef-crab', kind: 'crab', lengthM: .16 },
  { id: 'tube-sponge', kind: 'sponge', lengthM: .60 },
];
const meshes = root => { const result = []; root.traverse(child => { if (child.isMesh) result.push(child); }); return result; };
const pose = root => root.userData.motion.parts.map(part => part.rotation.toArray());
const agent = (species, overrides = {}) => ({ id: `guild:${species.id}`, regionId: '3,3', speciesId: species.id,
  position: { x: 224, y: -2.004, z: 224 }, heading: .2, timeSec: 10, sizeM: species.lengthM,
  velocity: { x: .02, y: 0, z: .012 }, state: 'foraging', alive: true, ...overrides });
const visibleMeshes = root => meshes(root).filter(object => {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
});

test('the three actual silhouettes retain distinct complete anatomy and conservative metre footprints in all display poses', t => {
  for (const species of guild) {
    const root = createReefGuildOrganism(species); t.after(() => disposeReefGuildOrganism(root));
    const bounds = REEF_GUILD_ENVELOPES[species.id], vertex = new THREE.Vector3();
    assert.equal(root.userData.sizeMeasure, bounds.sizeMeasure);
    assert.equal(root.userData.motion.parts.length, species.id === 'tube-sponge' ? 0 : 8);
    assert.equal(visibleMeshes(root).length, species.id === 'tube-sponge' ? 1 : 9);
    let triangles = 0;
    for (const mesh of visibleMeshes(root)) triangles += mesh.geometry.index.count / 3;
    assert.ok(triangles <= 3000, `${species.id}: finite whole-silhouette triangle budget`);
    for (const time of [0, .4, 1.7, 20, 1200]) for (const state of ['foraging', 'resting', 'sheltering']) {
      animateReefGuildOrganism(root, time, agent(species, { state })); root.updateMatrixWorld(true);
      for (const mesh of visibleMeshes(root)) {
        const positions = mesh.geometry.attributes.position;
        assert.ok(Array.from(positions.array).every(Number.isFinite));
        assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.hypot(vertex.x, vertex.z) <= bounds.horizontalRadius + 1e-7,
            `${species.id}: the animated whole body stays within ecological support probes`);
          assert.ok(vertex.y >= -1e-7 && vertex.y <= bounds.height + 1e-7,
            `${species.id}: sampled support is never penetrated by the yaw-only gait`);
        }
      }
    }
    root.scale.setScalar(species.lengthM); root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    if (species.id === 'tube-sponge') assert.ok(Math.abs(size.y - species.lengthM) < 1e-7);
    if (species.id === 'day-octopus') assert.ok(size.z <= species.lengthM && size.z >= species.lengthM * .97);
    if (species.id === 'spotted-reef-crab') {
      const shell = meshes(root).find(mesh => /Broad spotted carapace/.test(mesh.name)).geometry.attributes.position;
      assert.ok(Array.from({ length: shell.count }, (_, i) => shell.getZ(i)).some(z => Math.abs(z - .5) < 1e-7));
      assert.ok(size.z <= species.lengthM * 2.2, 'carapace width is not mistaken for complete leg width');
    }
  }
});

test('regional time owns gait, fixed sponge remains stationary, and rendering never changes support or durable agents', t => {
  const animals = new OceanAnimals([...speciesCatalog, ...guild]); t.after(() => animals.dispose());
  const origin = { x: 1e9, z: -1e9 };
  const agents = guild.map(species => agent(species, { position: { x: origin.x + 3, y: -2.004, z: origin.z - 4 } }));
  const saved = structuredClone(agents);
  animals.update(agents, 90, origin, new THREE.Vector3(3, -2, -4));
  const frozen = agents.map(a => pose(animals.getObject(a.id)));
  for (const a of agents) {
    const root = animals.getObject(a.id);
    assert.equal(root.userData.speciesId, a.speciesId); assert.equal(root.userData.regionId, a.regionId);
    assert.equal(root.rotation.y, -a.heading); assert.equal(root.rotation.x, 0); assert.equal(root.rotation.z, 0);
    assert.equal(root.scale.x, a.sizeM); assert.equal(root.position.y, a.position.y);
    assert.deepEqual(root.getWorldPosition(new THREE.Vector3()).toArray(), [3, -2.004, -4]);
    assert.ok(animals.pickableObjects.includes(root));
  }
  animals.update(agents, 999000, { x: origin.x + 64, z: origin.z });
  assert.deepEqual(agents.map(a => pose(animals.getObject(a.id))), frozen, 'world time cannot animate paused regional records');
  const later = agents.map(a => ({ ...a, timeSec: 10.4 })); animals.update(later, 999000, origin);
  assert.notDeepEqual(pose(animals.getObject(agents[0].id)), frozen[0]);
  assert.notDeepEqual(pose(animals.getObject(agents[1].id)), frozen[1]);
  assert.deepEqual(pose(animals.getObject(agents[2].id)), frozen[2]);
  animals.reset(); animals.update(agents, 999000, origin);
  assert.deepEqual(agents.map(a => pose(animals.getObject(a.id))), frozen, 'identity hash reproduces limb phase on revisit');
  assert.deepEqual(agents, saved);
});

test('complete distant outline has bounded draws, identical support bounds and stable size-based LOD hysteresis', t => {
  for (const species of guild.slice(0, 2)) {
    const root = createReefGuildOrganism(species); t.after(() => disposeReefGuildOrganism(root));
    root.scale.setScalar(species.lengthM); root.updateMatrixWorld(true);
    assert.equal(updateReefGuildDetail(root, species.lengthM * 25), 'far');
    assert.equal(visibleMeshes(root).length, 1);
    assert.equal(updateReefGuildDetail(root, species.lengthM * 20), 'far');
    assert.equal(updateReefGuildDetail(root, species.lengthM * 17), 'near');
    assert.equal(visibleMeshes(root).length, 9);
    assert.equal(updateReefGuildDetail(root, species.lengthM * 20), 'near');
    const detailedParts = meshes(root.userData.guildDetail.near).map(mesh => mesh.geometry.attributes.position.array.length)
      .reduce((a, b) => a + b, 0);
    assert.equal(meshes(root.userData.guildDetail.far)[0].geometry.attributes.position.array.length, detailedParts,
      'LOD merging retains all limbs, mantle/claws and their actual vertices');
    const ray = new THREE.Raycaster(new THREE.Vector3(0, species.lengthM * 2, 0), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObjects(visibleMeshes(root), false).length, 'whole body triangles remain selectable');
  }
});

test('death, owner unload, replacement and reset release shared assets once without releasing another instance', () => {
  const animals = new OceanAnimals([...speciesCatalog, ...guild]), a = agent(guild[0]), b = { ...a, id: 'guild:second' };
  animals.update([a, b], 0); const first = animals.getObject(a.id), second = animals.getObject(b.id);
  assert.deepEqual(meshes(first).map(mesh => mesh.geometry), meshes(second).map(mesh => mesh.geometry));
  const shared = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material]));
  const counts = new Map([...shared].map(resource => [resource, 0]));
  for (const resource of shared) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  const firstResources = reefGuildAssetStats().resources;
  for (let i = 0; i < 40; i++) {
    animals.update([a, b], i / 5, { x: i * 64, z: -i * 64 });
    assert.equal(animals.getObject(a.id), first); assert.equal(reefGuildAssetStats().resources, firstResources);
  }
  animals.update([{ ...a, alive: false }, b], 2); assert.equal(first.children.length, 0);
  assert.ok([...counts.values()].every(count => count === 0));
  animals.update([{ ...b, speciesId: 'green-chromis', sizeM: .075 }], 3);
  assert.ok([...counts.values()].every(count => count === 1)); assert.equal(second.children.length, 0);
  assert.equal(animals.getObject(b.id).userData.speciesId, 'green-chromis');
  animals.update(guild.map(species => agent(species)), 4); animals.reset(); animals.reset(); animals.dispose(); animals.dispose();
  assert.deepEqual(reefGuildAssetStats(), { resources: 0, instances: 0 });
  assert.equal(animals.update([a], 5), false);
});

test('only the new species use the kit; original animals retain exact geometry, materials and animation dispatch', t => {
  const animals = new OceanAnimals([...speciesCatalog, ...guild]); t.after(() => animals.dispose());
  const originals = ['green-chromis', 'lined-tang', 'reef-crab', 'blue-starfish'].map(id => agent(speciesCatalog.find(s => s.id === id)));
  animals.update([...originals, ...guild.map(species => agent(species))], 50);
  const shape = root => meshes(root).map(mesh => ({ name: mesh.name,
    positions: Array.from(mesh.geometry.attributes.position.array),
    normals: Array.from(mesh.geometry.attributes.normal.array),
    colors: mesh.geometry.attributes.color ? Array.from(mesh.geometry.attributes.color.array) : null,
    position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray() }));
  for (const a of originals) {
    const rendered = animals.getObject(a.id), direct = createOrganism(speciesCatalog.find(s => s.id === a.speciesId));
    direct.userData.phase = rendered.userData.phase; animateOrganism(direct, a.timeSec, 1);
    assert.deepEqual(shape(rendered), shape(direct), `${a.speciesId}: exact original prototype and animation`);
    assert.equal(rendered.userData.guildResources, undefined); disposeOrganism(direct);
  }
  assert.throws(() => createReefGuildOrganism({ id: 'reef-crab' }), /Unknown/);
});
