import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { openWaterSpeciesCatalog } from '../src/oceanOpenWaterSpecies.js';
import { oceanReefGuildSpeciesCatalog } from '../src/oceanReefGuildSpecies.js';
import { speciesCatalog } from '../src/species.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { createReefGuildOrganism, animateReefGuildOrganism, disposeReefGuildOrganism } from '../src/world/reefGuildAssets.js';
import { OPEN_WATER_ASSET_ENVELOPES, createOpenWaterOrganism, animateOpenWaterOrganism,
  updateOpenWaterDetail, disposeOpenWaterOrganism, openWaterAssetStats } from '../src/world/openWaterLifeAssets.js';

const meshes = root => { const result = []; root.traverse(object => { if (object.isMesh) result.push(object); }); return result; };
const visibleMeshes = root => meshes(root).filter(object => {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
});
const animal = (species, overrides = {}) => ({ id: `water:${species.id}`, regionId: '3,3', speciesId: species.id,
  position: { x: 230, y: 3.4, z: 226 }, sizeM: species.lengthM, heading: -.4, pitch: .12, timeSec: 20,
  velocity: { x: .12, y: .01, z: -.02 }, pulsePhase: .8, state: 'swimming', alive: true, ...overrides });
const motionPose = root => root.userData.waterMotion.type === 'squid-fin' ? root.userData.waterMotion.fins.map(part => part.rotation.toArray())
  : [root.userData.waterMotion.bell.scale.toArray(), root.userData.waterMotion.oral.rotation.toArray()];

test('whole actual metre silhouettes contain eight arms/two tentacles or a translucent spotted bell/eight oral arms', t => {
  for (const species of openWaterSpeciesCatalog) {
    const root = createOpenWaterOrganism(species); t.after(() => disposeOpenWaterOrganism(root)); root.updateMatrixWorld(true);
    assert.equal(root.userData.sizeMeasure, species.sizeMeasure);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const motion = root.userData.waterMotion;
    if (species.id === 'reef-squid') {
      assert.ok(Math.abs(size.x - 1) < 1e-7, 'total length includes both full tentacle clubs');
      assert.equal(motion.armCount, 8); assert.equal(motion.tentacleCount, 2); assert.equal(motion.fins.length, 2);
      assert.ok(size.z > .5, 'whole fin silhouette is wide rather than a thin fish-like tube');
      assert.equal(visibleMeshes(root).length, 3);
    } else {
      const bellBox = new THREE.Box3().setFromObject(motion.bell), bellSize = bellBox.getSize(new THREE.Vector3());
      assert.ok(Math.abs(bellSize.x - 1) < 1e-7); assert.ok(Math.abs(bellSize.z - 1) < 1e-7);
      assert.ok(Math.abs(bellBox.getCenter(new THREE.Vector3()).y) < 1e-7, 'neutral bell geometric centre is ecological root Y');
      assert.equal(motion.oralArmCount, 8); assert.equal(motion.marginalTentacleCount, 0);
      assert.equal(motion.bell.material.transparent, true); assert.equal(motion.bell.material.depthWrite, false);
      const colors = motion.bell.geometry.attributes.color;
      assert.ok(Array.from({ length: colors.count }, (_, i) => colors.getX(i)).some(value => value > .8), 'white surface spots belong to the bell');
      assert.equal(visibleMeshes(root).length, 2);
    }
    root.scale.setScalar(species.lengthM); root.updateMatrixWorld(true);
    const realSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    if (species.id === 'reef-squid') assert.ok(Math.abs(realSize.x - species.lengthM) < 1e-7);
    else assert.ok(Math.abs(realSize.x - species.lengthM) < 1e-7);
  }
});

test('all finite pulse/fin poses and squid pitch fit the declared ecology collision envelope', t => {
  const vertex = new THREE.Vector3();
  for (const species of openWaterSpeciesCatalog) {
    const root = createOpenWaterOrganism(species); t.after(() => disposeOpenWaterOrganism(root));
    const limits = OPEN_WATER_ASSET_ENVELOPES[species.id];
    for (const time of [0, .5, 1.2, 2.7, 1000]) for (const phase of [0, 1.5, Math.PI]) for (const pitch of [-limits.pitchLimit, 0, limits.pitchLimit]) {
      animateOpenWaterOrganism(root, time, { pulsePhase: phase, state: 'swimming' });
      root.rotation.z = pitch; root.updateMatrixWorld(true);
      for (const mesh of visibleMeshes(root)) {
        const positions = mesh.geometry.attributes.position;
        assert.ok(Array.from(positions.array).every(Number.isFinite));
        assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
        for (let index = 0; index < positions.count; index++) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          assert.ok(Math.hypot(vertex.x, vertex.z) <= limits.horizontalRadius + 1e-7, 'the complete fins/arms fit full-body horizontal clearance');
          assert.ok(vertex.y >= limits.minY - 1e-7 && vertex.y <= limits.maxY + 1e-7, 'pulse cannot cross the ecological bottom/surface clearance');
        }
      }
    }
    assert.deepEqual(root.position.toArray(), [0, 0, 0], 'display motion never bobs the persisted root');
    const triangles = visibleMeshes(root).reduce((total, mesh) => total + mesh.geometry.index.count / 3, 0);
    assert.ok(triangles <= 3200, 'finite full-body triangle budget');
  }
});

test('actual dispatch retains regional clock, persisted phase, heading/pitch, picking and huge-origin coordinates through pause/revisit', t => {
  const catalog = [...speciesCatalog, ...oceanReefGuildSpeciesCatalog, ...openWaterSpeciesCatalog];
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const origin = { x: 1e9, z: -1e9 };
  const agents = openWaterSpeciesCatalog.map(species => animal(species, { position: { x: origin.x + 3, y: 3.4, z: origin.z + 4 } }));
  const saved = structuredClone(agents); animals.update(agents, 500, origin, new THREE.Vector3(3, 3.4, 4));
  const frozen = agents.map(a => motionPose(animals.getObject(a.id)));
  for (const a of agents) {
    const root = animals.getObject(a.id);
    assert.equal(root.scale.x, a.sizeM); assert.equal(root.rotation.y, -a.heading);
    assert.equal(root.rotation.z, a.speciesId === 'reef-squid' ? a.pitch : 0);
    assert.deepEqual(root.getWorldPosition(new THREE.Vector3()).toArray(), [3, 3.4, 4]);
    assert.equal(root.userData.regionId, a.regionId); assert.ok(animals.pickableObjects.includes(root));
  }
  animals.update(agents, 999000, { x: origin.x + 64, z: origin.z - 64 });
  assert.deepEqual(agents.map(a => motionPose(animals.getObject(a.id))), frozen);
  assert.deepEqual(animals.getObject(agents[0].id).getWorldPosition(new THREE.Vector3()).toArray(), [-61, 3.4, 68]);
  animals.reset(); animals.update(agents, 999000, origin);
  assert.deepEqual(agents.map(a => motionPose(animals.getObject(a.id))), frozen, 'saved phase and regional time reproduce after unload');
  animals.update(agents.map(a => ({ ...a, timeSec: a.timeSec + .4 })), 999000);
  assert.notDeepEqual(agents.map(a => motionPose(animals.getObject(a.id))), frozen);
  assert.deepEqual(agents, saved);
});

test('whole distant squid silhouette, shared ownership and live replacement remain bounded and release once', () => {
  const animals = new OceanAnimals([...speciesCatalog, ...openWaterSpeciesCatalog]);
  const a = animal(openWaterSpeciesCatalog[0]), b = { ...a, id: 'water:second-squid' }, jelly = animal(openWaterSpeciesCatalog[1]);
  animals.update([a, b, jelly], 0);
  const first = animals.getObject(a.id), second = animals.getObject(b.id);
  assert.deepEqual(meshes(first).map(mesh => mesh.geometry), meshes(second).map(mesh => mesh.geometry));
  first.updateMatrixWorld(true); assert.equal(updateOpenWaterDetail(first, a.sizeM * 25), 'far');
  assert.equal(visibleMeshes(first).length, 1); assert.equal(updateOpenWaterDetail(first, a.sizeM * 20), 'far');
  assert.equal(updateOpenWaterDetail(first, a.sizeM * 17), 'near'); assert.equal(visibleMeshes(first).length, 3);
  const shared = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material]));
  const counts = new Map([...shared].map(resource => [resource, 0]));
  for (const resource of shared) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  const initial = openWaterAssetStats();
  for (let step = 0; step < 30; step++) {
    animals.update([a, b, jelly], step, { x: step * 64, z: -step * 64 }); assert.deepEqual(openWaterAssetStats(), initial);
  }
  animals.update([{ ...a, alive: false }, b, jelly], 1); assert.equal(first.children.length, 0);
  assert.ok([...counts.values()].every(n => n === 0));
  animals.update([{ ...b, speciesId: 'green-chromis', sizeM: .075 }, jelly], 2);
  assert.ok([...counts.values()].every(n => n === 1)); assert.equal(second.children.length, 0);
  animals.reset(); animals.reset(); animals.dispose(); animals.dispose();
  assert.deepEqual(openWaterAssetStats(), { resources: 0, instances: 0 }); assert.equal(animals.update([a], 3), false);
});

test('all three delivered reef-guild prototypes and their animation remain exact beside open-water life', t => {
  const animals = new OceanAnimals([...oceanReefGuildSpeciesCatalog, ...openWaterSpeciesCatalog]); t.after(() => animals.dispose());
  const guildAgents = oceanReefGuildSpeciesCatalog.map(species => animal(species, { pitch: 0, state: 'foraging' }));
  animals.update([...guildAgents, ...openWaterSpeciesCatalog.map(species => animal(species))], 99);
  const shape = root => meshes(root).map(mesh => ({ name: mesh.name,
    positions: Array.from(mesh.geometry.attributes.position.array), normals: Array.from(mesh.geometry.attributes.normal.array),
    colors: Array.from(mesh.geometry.attributes.color.array), position: mesh.position.toArray(),
    rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray() }));
  for (const a of guildAgents) {
    const existing = animals.getObject(a.id), direct = createReefGuildOrganism(oceanReefGuildSpeciesCatalog.find(s => s.id === a.speciesId));
    direct.userData.phase = existing.userData.phase; animateReefGuildOrganism(direct, a.timeSec, a);
    assert.deepEqual(shape(existing), shape(direct), `${a.speciesId}: old body and animation exact`);
    assert.equal(existing.userData.waterLifeResources, undefined); disposeReefGuildOrganism(direct);
  }
});
