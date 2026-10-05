import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { DeepOceanAnimals } from '../src/world/DeepOceanAnimals.js';
import { deepSpeciesCatalog } from '../src/deepSpecies.js';
import { deepPredatorSpeciesCatalog } from '../src/deepPredatorSpecies.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { deepSeaSpiderResourceStats } from '../src/world/deepSeaSpiderOrganism.js';
import { SEA_SPIDER_BODY_LOCAL, seaSpiderReferencePose, seaSpiderMouthWorld,
  ANEMONE_TENTACLE_REFERENCES_LOCAL, anemoneTentacleReferences } from '../src/deepSeaSpiderGeometry.js';

const catalog = [...deepSpeciesCatalog, ...deepPredatorSpeciesCatalog];
const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(actual.distanceTo(expected) < tolerance,
  `reference distance ${actual.distanceTo(expected)} exceeds ${tolerance}`);
const shape = object => object.children.map(child => ({ position: child.position.toArray(),
  quaternion: child.quaternion.toArray(), scale: child.scale.toArray() }));

test('16 shared Liponema references remain actual canonical animated vertices under yaw, flow and feeding', t => {
  const oldSource = new URL('../src/world/deepOrganisms.js', import.meta.url);
  const hash = () => createHash('sha256').update(readFileSync(oldSource)).digest('hex');
  const sourceHash = hash();
  const animals = new DeepOceanAnimals(catalog); t.after(() => animals.dispose());
  const origin = { x: 256, z: -128 };
  for (const current of [0, .06, .3]) for (const heading of [0, .63, -2.2])
    for (const feeding of [false, true]) for (const contraction of [0, .8]) {
      const agent = { id: 'canonical-reference-host', speciesId: 'pom-pom-anemone', regionId: '4,-2', alive: true,
        position: { x: 283, y: -1.3, z: -99 }, sizeM: .36, heading, timeSec: 31.4,
        state: 'attached-waiting', lastFeedAt: feeding ? 29.1 : null, contraction,
        localEnvironment: { currentMps: { x: current, y: 0, z: -current * .4 } } };
      animals.update([agent], 1234, origin);
      const object = animals.getObject(agent.id);
      const record = object.userData.animation.find(item => item.channel === 'anemone-tentacles');
      const references = anemoneTentacleReferences(agent);
      assert.equal(references.length, 16);
      references.forEach((reference, index) => {
        const vertex = ANEMONE_TENTACLE_REFERENCES_LOCAL[index].tentacleIndex * 35 + 28;
        assert.equal(record.tags[vertex * 4 + 1], reference.tentacleIndex);
        assert.equal(record.tags[vertex * 4 + 2], 1);
        const actual = object.localToWorld(new THREE.Vector3().fromBufferAttribute(record.item.geometry.attributes.position, vertex));
        const expected = vector(reference).sub(new THREE.Vector3(origin.x, 0, origin.z));
        close(actual, expected, 2e-8);
      });
  }
  assert.equal(hash(), sourceHash, 'the original canonical morphology source remains untouched');
});

function spiderOnTerrain(generator, heading = .73, lift = .013) {
  const agent = { id: 'spider-contact-reference', speciesId: 'giant-sea-spider-group', regionId: '4,1', alive: true,
    position: { x: 272.23, y: generator.heightAt(272.23, 112.37) + lift, z: 112.37 }, sizeM: .31,
    heading, timeSec: 20.3, state: 'approaching-anemone', velocity: { x: .005, y: .0002, z: .002 } };
  agent.contactPointsLocal = seaSpiderReferencePose(agent, generator.heightAt).contactPointsLocal;
  return agent;
}

test('all eight actual sea-spider toe vertices and the actual mouth follow model support under yaw and rebase', t => {
  const generator = createDeepOceanGenerator('42'), agent = spiderOnTerrain(generator);
  const saved = structuredClone(agent), animals = new DeepOceanAnimals(catalog); t.after(() => animals.dispose());
  for (const origin of [{ x: 256, z: 64 }, { x: -128, z: 320 }]) {
    animals.update([agent], 9000, origin);
    const object = animals.getObject(agent.id), pose = seaSpiderReferencePose(agent);
    assert.equal(object.userData.sizeMeasure, 'leg-span'); assert.equal(object.userData.identityLevel, 'genus-group');
    assert.equal(object.userData.legs.length, 8); assert.equal(object.rotation.x, 0); assert.equal(object.rotation.z, 0);
    object.userData.legs.forEach((leg, index) => {
      const toe = leg.segments[3], attr = toe.geometry.attributes.position;
      const tipVertex = new THREE.Vector3().fromBufferAttribute(attr, 0);
      assert.equal(tipVertex.y, .5); assert.equal(tipVertex.x, 0); assert.equal(tipVertex.z, 0);
      const actual = toe.localToWorld(tipVertex).add(new THREE.Vector3(origin.x, 0, origin.z));
      close(actual, vector(pose.feetWorld[index]));
      assert.ok(Math.abs(actual.y - generator.heightAt(actual.x, actual.z)) < 1e-8);
      close(leg.footAnchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(origin.x, 0, origin.z)), actual);
    });
    const mouth = object.userData.mouth;
    close(mouth.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(origin.x, 0, origin.z)), vector(seaSpiderMouthWorld(agent)));
    close(object.userData.bodyAnchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(origin.x, 0, origin.z)), vector(pose.bodyWorld));
    assert.deepEqual(agent, saved, 'rendering never rewrites supported model contacts');
    object.traverse(child => assert.ok(!child.isLight, 'the non-luminous animal adds no illumination'));
    assert.ok(animals.pickableObjects.includes(object));
  }
});

test('model feeding freezes middle joints and regional clocks freeze walking independently of display time', t => {
  const agent = spiderOnTerrain(createDeepOceanGenerator('42'));
  const animals = new DeepOceanAnimals(catalog), reload = new DeepOceanAnimals(catalog);
  t.after(() => { animals.dispose(); reload.dispose(); });
  animals.update([agent], 1); const object = animals.getObject(agent.id), walking = shape(object);
  animals.update([agent], 3000); assert.deepEqual(shape(object), walking);
  reload.update([agent], 77); assert.deepEqual(shape(reload.getObject(agent.id)), walking);
  const feeding = { ...agent, state: 'proboscis-feeding' };
  animals.update([feeding], 3000); const before = shape(object);
  animals.update([{ ...feeding, timeSec: feeding.timeSec + 20 }], 9000); assert.deepEqual(shape(object), before);
  animals.update([{ ...agent, timeSec: agent.timeSec + .8 }], 10000); assert.notDeepEqual(shape(object), walking);
  assert.equal(animals.getObject(agent.id), object, 'the same logical animal keeps its picking identity');
});

test('the shipped World focusTarget aims at the shared tiny body through floating origins', t => {
  const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  const extract = name => {
    const start = source.indexOf(`  ${name}(`); assert.ok(start >= 0);
    const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
    return source.slice(start, start + 2 + next.index);
  };
  const World = new Function('THREE', 'SEA_SPIDER_BODY_LOCAL',
    `return class { ${extract('focusUp')} ${extract('focusTarget')} }`)(THREE, SEA_SPIDER_BODY_LOCAL);
  const generator = createDeepOceanGenerator('42'), agent = spiderOnTerrain(generator, -1.23);
  const animals = new DeepOceanAnimals(catalog); t.after(() => animals.dispose());
  for (const origin of [{ x: 256, z: 64 }, { x: 320, z: -128 }]) {
    const world = Object.assign(new World(), { isDeep: true, isKelp: false,
      catalog: new Map(catalog.map(species => [species.id, species])), oceanChunks: {}, oceanRenderOrigin: origin });
    animals.update([agent], 99, origin);
    const actual = world.focusTarget(agent), anchor = animals.getObject(agent.id).userData.bodyAnchor.getWorldPosition(new THREE.Vector3());
    close(actual, anchor);
    close(actual.add(new THREE.Vector3(origin.x, 0, origin.z)), vector(seaSpiderReferencePose(agent).bodyWorld));
  }
});

test('shared sea-spider assets are bounded and released once after the final animal', () => {
  const animals = new DeepOceanAnimals(catalog), agent = spiderOnTerrain(createDeepOceanGenerator('42'));
  animals.update([agent, { ...agent, id: 'other-spider' }], 100);
  assert.deepEqual(deepSeaSpiderResourceStats(), { assets: 6, instances: 2 });
  const first = animals.getObject(agent.id), second = animals.getObject('other-spider');
  const material = first.userData.legs[0].segments[0].material;
  assert.equal(second.userData.legs[0].segments[0].material, material);
  let disposed = 0; material.addEventListener('dispose', () => disposed++);
  animals.update([{ ...agent, id: 'other-spider' }], 100); assert.equal(disposed, 0); assert.equal(first.parent, null);
  assert.deepEqual(deepSeaSpiderResourceStats(), { assets: 6, instances: 1 });
  animals.dispose(); animals.dispose(); assert.equal(disposed, 1);
  assert.deepEqual(deepSeaSpiderResourceStats(), { assets: 0, instances: 0 });
  assert.equal(second.parent, null);
});
