import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { speciesCatalog } from '../src/species.js';
import { oceanSlopeSpeciesCatalog } from '../src/oceanSlopeSpecies.js';
import { oceanPelagicSpeciesCatalog } from '../src/oceanPelagicSpecies.js';
import { oceanMantaSpeciesCatalog } from '../src/oceanMantaSpecies.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { createOrganism, disposeOrganism } from '../src/world/organisms.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';

const species = oceanMantaSpeciesCatalog.find(item => item.id === 'reef-manta');
const animal = (id, overrides = {}) => ({ id, regionId: '4,-2', speciesId: species.id,
  position: { x: 282, y: -2, z: -96 }, velocity: { x: .4, y: .02, z: 0 },
  heading: 0, sizeM: 3.15, state: 'gliding', timeSec: 24, alive: true, ...overrides });
const meshes = root => {
  const result = []; root.traverse(item => { if (item.isMesh) result.push(item); }); return result;
};
const pose = object => [object.rotation, object.userData.animation.anatomy.rotation,
  ...object.userData.animation.wings.map(wing => wing.rotation), object.userData.animation.tail.rotation]
  .map(rotation => rotation.toArray());

test('reef catalog appends the disc-width representative while retaining every prior entry object and order', () => {
  const prior = [...speciesCatalog, ...oceanSlopeSpeciesCatalog, ...oceanPelagicSpeciesCatalog];
  assert.deepEqual(sceneCatalogs.reef.slice(0, prior.length), prior);
  prior.forEach((item, index) => assert.equal(sceneCatalogs.reef[index], item));
  assert.deepEqual(sceneCatalogs.reef.slice(prior.length), oceanMantaSpeciesCatalog);
  assert.equal(new Set(sceneCatalogs.reef.map(item => item.id)).size, sceneCatalogs.reef.length);
  assert.equal(species.kind, 'ray');
  assert.equal(species.sizeMeasure, 'disc-width');
  assert.equal(species.regionalOnly, true);
});

test('ray anatomy has a metre-normalized thin disc, swept wings, terminal mouth, cephalic lobes and a slender short tail', t => {
  const ray = createOrganism(species); t.after(() => disposeOrganism(ray));
  const animation = ray.userData.animation;
  const width = new THREE.Box3().setFromObject(ray).getSize(new THREE.Vector3()).z;
  assert.ok(Math.abs(width - 1) < 1e-7, 'unanimated extended tip-to-tip width is one unit');
  ray.scale.setScalar(3.15); ray.updateMatrixWorld(true);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(ray).getSize(new THREE.Vector3()).z - 3.15) < 1e-6);
  const disc = ray.getObjectByName('Manta central disc');
  const size = new THREE.Box3().setFromObject(disc).getSize(new THREE.Vector3());
  assert.ok(size.y < size.z * .35 && size.x > size.z, 'central body is dorsoventrally flat');
  assert.equal(animation.wings.length, 2);
  assert.equal(animation.wings[0].children[0].geometry, animation.wings[1].children[0].geometry);
  assert.equal(animation.wings[0].children[0].scale.z, -1);
  assert.equal(animation.wings[1].children[0].scale.z, 1);
  const wing = animation.wings[0].children[0].geometry.attributes.position;
  let tipX = 0, tipSpan = -Infinity, rootFront = -Infinity;
  for (let i = 0; i < wing.count; i++) {
    const x = wing.getX(i), z = wing.getZ(i);
    if (z > tipSpan) { tipSpan = z; tipX = x; }
    if (z < .005) rootFront = Math.max(rootFront, x);
  }
  assert.ok(tipX < rootFront - .12, 'wing tips sweep aft from the shoulder');
  const tailSize = new THREE.Box3().setFromObject(animation.tail).getSize(new THREE.Vector3());
  assert.ok(tailSize.x < 3.15 && tailSize.x > 1 && tailSize.z < .09);
  assert.equal(meshes(ray).filter(item => item.geometry === disc.geometry).length, 1);
  const skinColors = disc.geometry.attributes.color, positions = disc.geometry.attributes.position;
  let dorsal = 0, ventral = 0, dorsalN = 0, ventralN = 0;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) > .015) { dorsal += skinColors.getX(i); dorsalN++; }
    if (positions.getY(i) < -.015) { ventral += skinColors.getX(i); ventralN++; }
  }
  assert.ok(ventral / ventralN > dorsal / dorsalN * 3, 'pale underside differs from the dark dorsal surface');
  const mouth = ray.getObjectByName('Manta terminal mouth');
  const mouthBox = new THREE.Box3().setFromObject(mouth), mouthSize = mouthBox.getSize(new THREE.Vector3());
  assert.ok(mouthBox.min.x > .7 && mouthSize.z > mouthSize.y * 5, 'mouth is broad and faces +X');
  for (const side of [-1, 1]) {
    const lobe = ray.getObjectByName(`Manta cephalic lobe ${side}`);
    assert.ok(lobe);
    const box = new THREE.Box3().setFromObject(lobe);
    assert.ok(box.max.x > mouthBox.max.x && box.min.x < mouthBox.min.x,
      'cephalic lobes extend from the front of the head alongside the terminal mouth');
    assert.ok((box.min.z + box.max.z) * side > 0, 'one lobe on each side of the mouth');
  }
  for (const item of meshes(ray)) for (const name of ['position', 'normal']) {
    assert.ok(Array.from(item.geometry.attributes[name].array).every(Number.isFinite), `finite ${name}`);
  }
});

test('regional ray remains selectable, casts broad shadows and follows regional time through pause, origins and reload', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef); t.after(() => animals.dispose());
  const agent = animal('manta-persistent'), saved = structuredClone(agent), origin = { x: 256, z: -128 };
  animals.update([agent], 100, origin);
  const ray = animals.getObject(agent.id), frozen = pose(ray), phase = ray.userData.phase;
  assert.equal(ray.scale.x, 3.15);
  assert.deepEqual(ray.userData.sourceLinks, species.sources);
  assert.deepEqual(animals.stats.speciesCounts, { 'reef-manta': 1 });
  assert.deepEqual(ray.getWorldPosition(new THREE.Vector3()).toArray(), [26, -2, 32]);
  const point = ray.getWorldPosition(new THREE.Vector3());
  const cast = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 4, 0)), new THREE.Vector3(0, -1, 0));
  assert.ok(cast.intersectObjects(animals.pickableObjects, true).length > 0);
  assert.ok(meshes(ray).every(item => item.castShadow));
  animals.update([agent], 1000, { x: 320, z: -64 });
  assert.deepEqual(ray.getWorldPosition(new THREE.Vector3()).toArray(), [-38, -2, -32]);
  assert.deepEqual(pose(ray), frozen, 'changing fallback/global time does not animate a frozen regional animal');
  animals.sync([]); animals.update([agent], 1000, origin);
  assert.equal(animals.getObject(agent.id).userData.phase, phase);
  assert.deepEqual(pose(animals.getObject(agent.id)), frozen);
  animals.update([{ ...agent, timeSec: 24.5 }], 1000, origin);
  const moving = animals.getObject(agent.id);
  assert.notDeepEqual(pose(moving), frozen);
  assert.equal(moving.userData.animation.wings[0].rotation.x, -moving.userData.animation.wings[1].rotation.x,
    'mirrored hinges raise and lower both wings together');
  assert.deepEqual(agent, saved, 'renderer never edits biological records');
});

test('ray pitch follows vertical swimming without changing fish pitch or benthic support transforms', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef); t.after(() => animals.dispose());
  const ray = animal('ray', { velocity: { x: .4, y: 2, z: 0 }, heading: Math.PI / 2 });
  const fish = animal('fish', { speciesId: 'green-chromis', sizeM: .075, velocity: { x: .4, y: 2, z: 0 } });
  const star = animal('star', { speciesId: 'blue-starfish', sizeM: .25, velocity: { x: .4, y: 2, z: 0 } });
  animals.update([ray, fish, star], 0);
  assert.equal(animals.getObject(ray.id).rotation.y, -Math.PI / 2);
  assert.equal(animals.getObject(ray.id).rotation.z, .2);
  assert.equal(animals.getObject(fish.id).rotation.z, .25);
  assert.equal(animals.getObject(star.id).rotation.z, 0);
  assert.equal(animals.getObject(star.id).position.y, star.position.y);
});

test('rays share cached resources and release them after the last owner without evicting an existing fish', () => {
  const animals = new OceanAnimals(sceneCatalogs.reef);
  const a = animal('first'), b = animal('second');
  const old = animal('old', { speciesId: 'green-chromis', sizeM: .075 });
  animals.update([a, b, old], 0);
  const first = animals.getObject(a.id), second = animals.getObject(b.id), fish = animals.getObject(old.id);
  assert.deepEqual(meshes(first).map(item => item.geometry), meshes(second).map(item => item.geometry));
  assert.deepEqual(meshes(first).map(item => item.material), meshes(second).map(item => item.material));
  const geometry = meshes(first)[0].geometry, skin = meshes(first)[0].material;
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  skin.addEventListener('dispose', () => materialDisposals++);
  animals.update([b, old], 1);
  assert.equal(geometryDisposals + materialDisposals, 0);
  assert.equal(animals.getObject(old.id), fish);
  animals.update([old], 2);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(animals.getObject(old.id), fish);
  animals.dispose(); assert.equal(animals.root.children.length, 0);
});
