import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { speciesCatalog } from '../src/species.js';
import { oceanSlopeSpeciesCatalog } from '../src/oceanSlopeSpecies.js';
import { oceanMantaSpeciesCatalog } from '../src/oceanMantaSpecies.js';
import { oceanPelagicSpeciesCatalog } from '../src/oceanPelagicSpecies.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';

const species = oceanPelagicSpeciesCatalog.find(item => item.id === 'yellowtail-fusilier');
const animal = (id, overrides = {}) => ({ id, regionId: '8,-2', speciesId: species.id,
  position: { x: 550, y: -3.5, z: -95 }, velocity: { x: .25, y: 0, z: 0 },
  heading: 0, sizeM: .25, state: 'schooling', timeSec: 10, alive: true, ...overrides });
const meshes = root => {
  const result = []; root.traverse(item => { if (item.isMesh) result.push(item); }); return result;
};
const body = root => root.userData.detail.near.children.find(item => item.isMesh && item.material.map?.image.width === 528);

test('reef catalog appends the pelagic representative without altering legacy catalog order or objects', () => {
  assert.deepEqual(sceneCatalogs.reef.slice(0, speciesCatalog.length), speciesCatalog);
  speciesCatalog.forEach((item, index) => assert.equal(sceneCatalogs.reef[index], item));
  assert.deepEqual(sceneCatalogs.reef.slice(speciesCatalog.length), [...oceanSlopeSpeciesCatalog, ...oceanPelagicSpeciesCatalog, ...oceanMantaSpeciesCatalog]);
  assert.equal(new Set(sceneCatalogs.reef.map(item => item.id)).size, sceneCatalogs.reef.length);
  assert.equal(species.lengthM, .25);
  assert.equal(species.regionalOnly, true);
});

test('the actual regional renderer exposes a selectable metre-scaled grey-blue fish with a pink belly and yellow forked caudal region', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef);
  t.after(() => animals.dispose());
  const agent = animal('pelagic-school:0'), saved = structuredClone(agent);
  animals.update([agent], 200, { x: 512, z: -128 }, new THREE.Vector3(38, -3.5, 33.5));
  const object = animals.getObject(agent.id);
  assert.ok(object);
  assert.equal(object.scale.x, .25);
  assert.deepEqual(object.userData.sourceLinks, species.sources);
  assert.deepEqual(animals.stats.speciesCounts, { 'yellowtail-fusilier': 1 });
  assert.equal(object.userData.detail.level, 'near');
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  assert.ok(size.x > .24 && size.x < .29, 'rendered complete fish is approximately the 25 cm regional display length');
  const bodySize = new THREE.Box3().setFromObject(body(object)).getSize(new THREE.Vector3());
  assert.ok(bodySize.x > bodySize.y * 2.5 && bodySize.x > bodySize.z * 6,
    'body has an elongated, laterally compressed silhouette independently of its spread fins');
  const point = object.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0, .3)), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(animals.pickableObjects, true).some(hit => hit.object === body(object)),
    'the new body works with the existing animal observation ray');
  const { data, width } = body(object).material.map.image;
  const rgb = (x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3));
  const flank = rgb(256, 0), belly = rgb(256, 192), stalk = rgb(20, 64);
  assert.ok(flank[2] > flank[1] && flank[1] > flank[0], 'flank is grey-blue');
  assert.ok(belly[0] > belly[1] && belly[1] > belly[2] && belly[0] - belly[2] < 35,
    'lower third has a restrained pink-white tint');
  assert.ok(stalk[0] > stalk[1] && stalk[1] > stalk[2] + 50, 'upper caudal stalk is yellow');
  const fin = object.userData.detail.near.children.find(item => item.isMesh && item.material.vertexColors && item.material.map?.image.width === 128);
  assert.ok(fin.geometry.hasAttribute('color'));
  let yellowRear = 0, greyFront = 0;
  const positions = fin.geometry.attributes.position, colors = fin.geometry.attributes.color;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) < -.18 && positions.getY(i) > .08 && colors.getX(i) > colors.getY(i) && colors.getY(i) > colors.getZ(i) * 2) yellowRear++;
    if (positions.getX(i) > .02 && colors.getZ(i) > colors.getX(i)) greyFront++;
  }
  assert.ok(yellowRear > 0 && greyFront > 0, 'only the rear soft dorsal region has yellow fin colour');
  const tail = object.userData.animation.tails[0].children.find(item => item.isMesh);
  assert.ok(tail.material.color.r > tail.material.color.g && tail.material.color.g > tail.material.color.b * 2);
  const vertices = tail.geometry.attributes.position;
  let upper = Infinity, lower = Infinity, notch = Infinity;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i);
    if (y > .1) upper = Math.min(upper, x);
    if (y < -.1) lower = Math.min(lower, x);
    if (Math.abs(y) < .006 && x < -.05) notch = Math.min(notch, x);
  }
  assert.ok(upper < notch - .05 && lower < notch - .05, 'both yellow tail lobes extend beyond the central fork');
  assert.deepEqual(agent, saved, 'display construction does not alter ecology');
});

test('midwater fish animation stays on its regional clock through floating origins and LOD transitions', t => {
  const animals = new OceanAnimals(sceneCatalogs.reef);
  t.after(() => animals.dispose());
  const agent = animal('pelagic-persistent'), origin = { x: 512, z: -128 };
  animals.update([agent], 200, origin, new THREE.Vector3(38, -3.5, 33.5));
  const object = animals.getObject(agent.id), phase = object.userData.phase;
  const pose = () => {
    const rendered = animals.getObject(agent.id);
    return [rendered.userData.animation.anatomy, ...rendered.userData.animation.tails]
      .map(item => item.rotation.toArray());
  };
  const frozen = pose(), shapes = meshes(object).map(item => item.geometry);
  animals.update([agent], 1000, origin, new THREE.Vector3(38, -3.5, 39));
  assert.equal(object.userData.detail.level, 'far');
  assert.deepEqual(pose(), frozen);
  assert.deepEqual(meshes(object).map(item => item.geometry), shapes);
  animals.update([agent], 1000, { x: 576, z: -128 }, new THREE.Vector3(-26, -3.5, 33.5));
  assert.equal(object.userData.detail.level, 'near');
  assert.deepEqual(object.getWorldPosition(new THREE.Vector3()).toArray(), [-26, -3.5, 33]);
  assert.deepEqual(pose(), frozen);
  animals.sync([]);
  animals.update([agent], 1000, origin);
  assert.equal(animals.getObject(agent.id).userData.phase, phase);
  assert.deepEqual(pose(), frozen);
  animals.update([{ ...agent, timeSec: 10.1 }], 1000, origin);
  assert.notDeepEqual(pose(), frozen, 'regional clock advancement resumes the new fish animation');
});

test('school members share resources and eviction releases them only after the final owner leaves', () => {
  const animals = new OceanAnimals(sceneCatalogs.reef);
  const first = animal('first'), second = animal('second'), old = animal('old', { speciesId: 'green-chromis', sizeM: .075 });
  animals.update([first, second, old], 0);
  const a = animals.getObject(first.id), b = animals.getObject(second.id);
  assert.deepEqual(meshes(a).map(item => item.geometry), meshes(b).map(item => item.geometry));
  assert.deepEqual(meshes(a).map(item => item.material), meshes(b).map(item => item.material));
  const skin = body(a).material.map, shape = body(a).geometry;
  const sharedFin = a.userData.animation.tails[0].children[0].material.map;
  assert.ok(meshes(animals.getObject(old.id)).some(item => item.material.map === sharedFin));
  let skinDisposals = 0, shapeDisposals = 0, sharedDisposals = 0;
  skin.addEventListener('dispose', () => skinDisposals++);
  shape.addEventListener('dispose', () => shapeDisposals++);
  sharedFin.addEventListener('dispose', () => sharedDisposals++);
  animals.update([second, old], 1);
  assert.equal(skinDisposals + shapeDisposals + sharedDisposals, 0);
  animals.update([old], 2);
  assert.equal(skinDisposals, 1);
  assert.equal(shapeDisposals, 1);
  assert.equal(sharedDisposals, 0);
  animals.dispose();
  assert.equal(sharedDisposals, 1);
  assert.equal(animals.root.children.length, 0);
});
