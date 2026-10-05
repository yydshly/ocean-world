import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { speciesCatalog } from '../src/species.js';

// Independent catalog fixture keeps this renderer check separate from the
// species allocation recipe and its one-time persistence supplement.
const anthias = { id: 'lyretail-anthias', commonName: '海金鱼（雌鱼代表）',
  scientificName: 'Pseudanthias squamipinnis s.l.', kind: 'fish', guild: 'planktivore',
  lengthM: .065, colors: ['#dc9632'], sources: [{ label: 'fixture source', url: 'https://example.org/anthias' }] };
const catalog = [...speciesCatalog, anthias];
const animal = (id, overrides = {}) => ({ id, regionId: '4,-2', speciesId: anthias.id,
  position: { x: 280, y: -13.7, z: -99 }, velocity: { x: .1, y: 0, z: 0 },
  heading: 0, sizeM: .065, state: 'schooling', timeSec: 12.4, alive: true, ...overrides });
const meshes = root => { const result = []; root.traverse(object => { if (object.isMesh) result.push(object); }); return result; };
const animationPose = object => {
  const { anatomy, tails, pectorals } = object.userData.animation;
  return [anatomy, ...tails, ...pectorals].map(part => part.rotation.toArray());
};

test('the real regional renderer loads, picks and displays the small golden-orange fork-tailed fish', t => {
  const animals = new OceanAnimals(catalog);
  t.after(() => animals.dispose());
  const agent = animal('slope-school:0'), before = structuredClone(agent);
  const origin = { x: 256, z: -128 };
  animals.update([agent, animal('dead', { alive: false })], 900, origin, new THREE.Vector3(24, -13.7, 29.3));
  const object = animals.getObject(agent.id), { detail, animation } = object.userData;
  assert.deepEqual(agent, before, 'rendering does not alter population state');
  assert.equal(animals.stats.activeAnimals, 1);
  assert.deepEqual(animals.stats.speciesCounts, { 'lyretail-anthias': 1 });
  assert.deepEqual(animals.pickableObjects, [object]);
  assert.equal(object.userData.agentId, agent.id);
  assert.equal(object.userData.regionId, agent.regionId);
  assert.equal(object.userData.speciesId, anthias.id);
  assert.deepEqual(object.userData.sourceLinks, anthias.sources);
  assert.equal(object.scale.x, .065);
  assert.equal(detail.level, 'near');
  assert.equal(detail.nearDraws, 6);
  assert.equal(detail.farDraws, 3);
  const point = object.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0, .2)), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(animals.pickableObjects, true);
  assert.ok(hits.length > 0, 'a rendered body can be selected by the existing ray path');
  let picked = hits[0].object;
  while (!picked.userData.agentId && picked.parent) picked = picked.parent;
  assert.equal(picked.userData.agentId, agent.id);
  const body = detail.near.children.find(child => child.isMesh && child.material.map?.image.width === 528);
  const { data, width } = body.material.map.image;
  for (const [x, y] of [[30, 30], [140, 90], [280, 180], [460, 225]]) {
    const index = (y * width + x) * 4;
    assert.ok(data[index] > data[index + 1] + 20 && data[index + 1] > data[index + 2] + 20,
      'body colour is gold-orange without borrowing another species pattern');
  }
  const tail = animation.tails[0].children.find(child => child.isMesh);
  assert.ok(tail.material.color.r > tail.material.color.g && tail.material.color.g > tail.material.color.b);
  const vertices = tail.geometry.attributes.position;
  let upper = Infinity, lower = Infinity, notch = Infinity;
  for (let index = 0; index < vertices.count; index++) {
    const x = vertices.getX(index), y = vertices.getY(index);
    if (y > .1) upper = Math.min(upper, x);
    if (y < -.1) lower = Math.min(lower, x);
    if (Math.abs(y) < .006 && x < -.05) notch = Math.min(notch, x);
  }
  assert.ok(upper < notch - .05 && lower < notch - .05, 'upper and lower lobes extend beyond the central fork');
});

test('floating origin and regional pause retain position, phase and geometry while the existing LOD changes only visibility', t => {
  const animals = new OceanAnimals(catalog);
  t.after(() => animals.dispose());
  const origin = { x: 1e9, z: -1e9 }, agent = animal('persistent-slope-fish', {
    position: { x: origin.x + 3, y: -13.7, z: origin.z + 2 } });
  const before = structuredClone(agent);
  animals.update([agent], 900, origin, new THREE.Vector3(3, -13.7, 2.2));
  const object = animals.getObject(agent.id), geometries = meshes(object).map(mesh => mesh.geometry);
  const pose = animationPose(object), phase = object.userData.phase;
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [3, -13.7, 2]);
  animals.update([agent], 990, origin, new THREE.Vector3(3, -13.7, 4));
  assert.deepEqual(animationPose(object), pose, 'changing the authored reef clock cannot advance a paused regional clock');
  assert.equal(object.userData.detail.level, 'far');
  assert.equal(object.userData.phase, phase);
  animals.setRenderOrigin({ x: origin.x + 64, z: origin.z });
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-61, -13.7, 2]);
  animals.update([agent], 1000, animals.renderOrigin, new THREE.Vector3(-61, -13.7, 2.2));
  assert.equal(object.userData.detail.level, 'near');
  assert.deepEqual(animationPose(object), pose);
  assert.deepEqual(meshes(object).map(mesh => mesh.geometry), geometries);
  assert.deepEqual(agent, before);
  animals.update([{ ...agent, timeSec: 12.5 }], 1000, animals.renderOrigin);
  assert.notDeepEqual(animationPose(object), pose, 'only the regional clock advances the shared fish animation');
  animals.sync([]);
  animals.update([agent], 1000, animals.renderOrigin);
  assert.equal(animals.getObject(agent.id).userData.phase, phase, 'unload and reload keeps the identity-seeded phase');
});

test('school instances share resources and eviction frees the new profile without disposing a legacy fish shared fin texture', () => {
  const animals = new OceanAnimals(catalog);
  const a = animal('a'), b = animal('b'), legacy = animal('legacy', { speciesId: 'green-chromis', sizeM: .075 });
  animals.update([a, b, legacy], 0);
  const first = animals.getObject(a.id), second = animals.getObject(b.id), old = animals.getObject(legacy.id);
  const firstMeshes = meshes(first), secondMeshes = meshes(second);
  assert.deepEqual(firstMeshes.map(mesh => mesh.geometry), secondMeshes.map(mesh => mesh.geometry));
  assert.deepEqual(firstMeshes.map(mesh => mesh.material), secondMeshes.map(mesh => mesh.material));
  const body = first.userData.detail.near.children.find(child => child.isMesh && child.material.map?.image.width === 528);
  const finTexture = first.userData.animation.tails[0].children[0].material.map;
  assert.ok(meshes(old).some(mesh => mesh.material.map === finTexture), 'the existing fin texture is shared across fish profiles');
  let bodyDisposals = 0, materialDisposals = 0, skinDisposals = 0, sharedFinDisposals = 0;
  body.geometry.addEventListener('dispose', () => bodyDisposals++);
  body.material.addEventListener('dispose', () => materialDisposals++);
  body.material.map.addEventListener('dispose', () => skinDisposals++);
  finTexture.addEventListener('dispose', () => sharedFinDisposals++);
  animals.update([b, legacy], 1);
  assert.equal(first.parent, null);
  assert.equal(first.userData.resources.size, 0);
  assert.equal(bodyDisposals + materialDisposals + skinDisposals + sharedFinDisposals, 0);
  animals.update([legacy], 2);
  assert.equal(bodyDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(skinDisposals, 1);
  assert.equal(sharedFinDisposals, 0);
  assert.equal(animals.stats.activeAnimals, 1);
  animals.sync([]);
  assert.equal(sharedFinDisposals, 1);
  assert.equal(animals.root.children.length, 0);
  animals.dispose(); animals.dispose();
  assert.equal(bodyDisposals, 1);
  assert.equal(sharedFinDisposals, 1);
});

function renderHash(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    hash.update(JSON.stringify([object.type, object.name, object.position.toArray(), object.rotation.toArray(), object.scale.toArray()]));
    if (object.geometry) {
      for (const name of Object.keys(object.geometry.attributes).sort()) {
        hash.update(name);
        const array = object.geometry.attributes[name].array;
        hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      }
      if (object.geometry.index) {
        const array = object.geometry.index.array;
        hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      }
    }
    if (object.material) {
      const material = object.material;
      hash.update(JSON.stringify([material.type, material.color?.toArray(), material.roughness, material.metalness,
        material.opacity, material.transparent, material.side, material.vertexColors, material.forceSinglePass, material.depthWrite]));
      if (material.map?.image?.data) {
        const array = material.map.image.data;
        hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      }
    }
  });
  return hash.digest('hex');
}

test('all six pre-existing fish retain their exact geometry, texture, material and animated-transform fixtures', t => {
  const animals = new OceanAnimals(speciesCatalog);
  t.after(() => animals.dispose());
  const fixtures = {
    'blue-tang': '3f0694f1bd3982e6520939b9e67c9355c334683fb7eed414fdd063cb1578c39d',
    'butterflyfish': '2a13e0b9315eea5fbc585a461994bc56d23d5eae48ec6605553c2bf76c5fe0ab',
    'green-chromis': '7980850f36a4b7b14aacb35acf350d1740189d2445dde70680207d7b26b7f39f',
    'lined-tang': '1f5aee96b95f77f3b626b71e164300693882c78f8b69794b5c040e2c24921ece',
    'cleaner-wrasse': '3b99b1a8548ece0a72b37a88004f5471c46ddf369d5fbdc552be79d11889fac3',
    'honeycomb-grouper': '0aa3597a117e4442d8e074f2071b7eb85a36f78a120b6509db8a92452b25e63b',
  };
  for (const species of speciesCatalog.filter(species => species.kind === 'fish')) {
    const agent = animal(`legacy-${species.id}`, { speciesId: species.id,
      position: { x: 280, y: -14, z: -99 }, heading: .6, sizeM: species.lengthM, timeSec: 4 });
    animals.update([agent], 20);
    assert.equal(renderHash(animals.getObject(agent.id)), fixtures[species.id], species.id);
  }
});
