import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpDriftFood, kelpDriftFoodResourceStats } from '../src/world/KelpDriftFood.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { kelpDriftFootprint, kelpDriftUrchinMouthWorld, KELP_DRIFT_CLEARANCE_M } from '../src/kelpDriftGeometry.js';

const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(actual.distanceTo(expected) < tolerance,
  `${actual.distanceTo(expected)} exceeds ${tolerance}`);
function realPatch(generator) {
  const rock = generator.chunk(2, 0).elements.find(element => element.kind === 'rock');
  assert.ok(rock);
  return { id: 'drift:2,0:host:0', hostId: 'actual-host:2,0', regionId: '2,0', rockIndex: 0,
    aliveHost: true, stock: .001, timeSec: 16.3,
    position: { x: rock.x, y: generator.heightAt(rock.x, rock.z), z: rock.z } };
}
const vertices = object => Array.from(object.geometry.attributes.position.array);

test('all seven actual drift mesh vertices share the controller food references and true rock support through floating origins', t => {
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), food = new KelpDriftFood();
  t.after(() => food.dispose()); const saved = structuredClone(patch), references = kelpDriftFootprint(patch, generator);
  const heights = references.verticesWorld.map(point => point.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0, 'the fixture uses a real nonflat rock');
  for (const origin of [{ x: 128, z: 0 }, { x: 320, z: -128 }]) {
    food.update([patch], generator, origin); const object = food.objects.get(patch.id);
    assert.ok(object); assert.deepEqual(Array.from(object.geometry.index.array), references.indices);
    for (let index = 0; index < references.verticesWorld.length; index++) {
      const actual = object.localToWorld(new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position, index))
        .add(new THREE.Vector3(origin.x, 0, origin.z));
      close(actual, vector(references.verticesWorld[index]));
      assert.ok(Math.abs(actual.y - generator.heightAt(actual.x, actual.z) - KELP_DRIFT_CLEARANCE_M) < 1e-8);
    }
    close(vector(object.userData.contactPointWorld), vector(references.center));
    assert.equal(object.material.emissiveIntensity, 0); assert.equal(object.userData.agentId, undefined);
    food.root.traverse(child => assert.ok(!child.isLight, 'food adds no illumination'));
  }
  assert.deepEqual(patch, saved, 'rendering does not modify model stock, clock or placement');
});

test('zero stock and unavailable live hosts remove and dispose patches while positive quantity does not invent biomass-scaled geometry', t => {
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), food = new KelpDriftFood();
  t.after(() => food.dispose()); food.update([patch], generator); const object = food.objects.get(patch.id), shape = vertices(object);
  const material = object.material, geometry = object.geometry; let released = 0;
  geometry.addEventListener('dispose', () => released++);
  food.update([{ ...patch, stock: .1 }], generator);
  assert.equal(food.objects.get(patch.id), object); assert.deepEqual(vertices(object), shape); assert.equal(object.userData.stock, .1);
  food.update([{ ...patch, stock: 0 }], generator); assert.equal(food.objects.size, 0); assert.equal(released, 1); assert.equal(object.parent, null);
  food.update([{ ...patch, aliveHost: false }], generator); assert.equal(food.objects.size, 0);
  food.update([{ ...patch, stock: -1 }, { ...patch, id: 'bad-stock', stock: NaN }], generator); assert.equal(food.objects.size, 0);
  food.update([patch], generator); assert.equal(food.objects.get(patch.id).material, material);
  assert.equal(food.stats.storedRelativeUnits, patch.stock);
});

test('paused records keep geometry and clocks unchanged and sampled geometry is reused between fixed steps', t => {
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), food = new KelpDriftFood();
  t.after(() => food.dispose()); let queries = 0;
  const sampler = { heightAt(x, z) { queries++; return generator.heightAt(x, z); } };
  food.update([patch], sampler); const object = food.objects.get(patch.id), shape = vertices(object), firstQueries = queries;
  for (let index = 0; index < 25; index++) food.update([structuredClone(patch)], sampler);
  assert.equal(queries, firstQueries, 'identical food placements do not resample static rock every display frame');
  assert.deepEqual(vertices(object), shape); assert.equal(object.userData.timeSec, patch.timeSec);
  food.update([{ ...patch, stock: patch.stock / 2, timeSec: patch.timeSec + .1 }], sampler);
  assert.deepEqual(vertices(object), shape); assert.equal(queries, firstQueries);
  assert.equal(object.userData.timeSec, patch.timeSec + .1);
});

test('render objects and support buffers stay bounded to nine regions, three hosts and three food points per host', t => {
  const food = new KelpDriftFood(); t.after(() => food.dispose()); const heightAt = () => 0;
  const inputs = Array.from({ length: 10 }, (_, region) => Array.from({ length: 4 }, (_, host) =>
    Array.from({ length: 4 }, (_, slot) => ({ id: `r${region}:h${host}:p${slot}`, regionId: `${region},0`, hostId: `host:${host}`,
      aliveHost: true, stock: .01, timeSec: 0, position: { x: region * 64 + host + slot * .1, y: 0, z: 0 } })))).flat(2);
  food.update(inputs, heightAt); assert.equal(food.stats.activePatches, 81); assert.equal(food.stats.activeHosts, 27);
  assert.equal(food.stats.activeRegions, 9); assert.equal(food.root.children.length, 81);
  const first = [...food.objects.values()]; let released = 0;
  for (const object of first) object.geometry.addEventListener('dispose', () => released++);
  const matrices = first.map(object => object.matrixWorld.toArray());
  food.update([...inputs].reverse(), heightAt); assert.deepEqual([...food.objects.values()].map(object => object.matrixWorld.toArray()), matrices);
  food.update(inputs.map(patch => ({ ...patch, id: `next:${patch.id}` })), heightAt);
  assert.equal(released, 81); assert.equal(food.stats.ownedGeometries, 81);
  assert.equal(kelpDriftFoodResourceStats().assets, 2, 'one material and one fixed template serve the bounded owned buffers');
});

test('the food contact uses the unchanged real urchin oral underside under support normal and yaw', t => {
  const baseline = JSON.parse(readFileSync(new URL('../output/validation/kelp-drift-before-hashes.json', import.meta.url), 'utf8'));
  // Landscape sampling changes independently of the real feeding anatomy.
  // Native anatomy stays byte-exact. The regional dispatcher now also accepts
  // visitors, so its old whole-file hash is no longer an applicable guard.
  // The actual oral transform below still runs through that live dispatcher;
  // visitor-render tests additionally compare every old mesh/pose in full.
  for (const path of ['src/world/kelpOrganisms.js', 'src/world/kelpWaterOrganisms.js']) {
    const before = baseline.find(entry => entry.file === path); assert.ok(before);
    const actual = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
    assert.equal(actual, before.sha256, `${path} remains unchanged`);
  }
  const animals = new KelpOceanAnimals(kelpSpeciesCatalog); t.after(() => animals.dispose());
  const agent = { id: 'oral-reference', speciesId: 'purple-urchin', alive: true, regionId: '2,0', sizeM: .09,
    position: { x: 135, y: -2.3, z: 23 }, supportNormal: { x: .25, y: .9, z: -.13 }, heading: 1.13,
    timeSec: 20.3, localEnvironment: { currentMps: .18 } };
  const origin = { x: 128, z: 64 }; animals.update([agent], 9000, origin);
  const object = animals.getObject(agent.id); let body;
  object.traverse(child => { if (!body && child.isMesh && !child.isInstancedMesh) body = child; });
  assert.ok(body, 'the actual oral-side shell is nested under the unchanged normalization group');
  const attr = body.geometry.attributes.position; let bottom = 0;
  for (let index = 1; index < attr.count; index++) if (attr.getY(index) < attr.getY(bottom)) bottom = index;
  const actual = body.localToWorld(new THREE.Vector3().fromBufferAttribute(attr, bottom)).add(new THREE.Vector3(origin.x, 0, origin.z));
  close(actual, vector(kelpDriftUrchinMouthWorld(agent)));
});

const worldSource = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function shippedMethod(name) {
  const start = worldSource.indexOf(`  ${name}(`); assert.ok(start >= 0);
  const next = /\n  [A-Za-z_]\w*\(/.exec(worldSource.slice(start + 2));
  return worldSource.slice(start, next ? start + 2 + next.index : worldSource.lastIndexOf('\n}'));
}

test('the shipped World updates only controller patches, freezes during reset and rebases the actual food renderer', t => {
  const World = new Function('THREE', `return class { ${['updateKelpDriftFood', 'setOceanRenderOrigin'].map(shippedMethod).join('\n')} }`)(THREE);
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), food = new KelpDriftFood(); t.after(() => food.dispose());
  const world = Object.assign(new World(), { oceanKelpDriftFood: food, oceanEcologyResetting: false,
    oceanEcology: { driftFoodPatches: [patch] }, oceanChunks: { generator, setRenderOrigin() {} },
    oceanRenderOrigin: { x: 0, z: 0 }, camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3() } });
  world.updateKelpDriftFood(); assert.equal(food.stats.activePatches, 1); const object = food.objects.get(patch.id);
  world.setOceanRenderOrigin(128, 64); assert.deepEqual(food.stats.renderOrigin, { x: 128, z: 64 });
  close(object.getWorldPosition(new THREE.Vector3()), vector(kelpDriftFootprint(patch, generator).center).sub(new THREE.Vector3(128, 0, 64)));
  world.oceanEcologyResetting = true; world.oceanEcology.driftFoodPatches = [];
  world.updateKelpDriftFood(); assert.equal(food.stats.activePatches, 1, 'a pending reset never renders a partial model');
  food.reset(); assert.equal(food.stats.activePatches, 0); world.oceanEcologyResetting = false; world.updateKelpDriftFood();
  assert.equal(food.stats.activePatches, 0);
});

test('owned patch buffers release on unload and shared template/material release only after the last renderer', () => {
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), first = new KelpDriftFood(), second = new KelpDriftFood();
  first.update([patch], generator); second.update([patch], generator);
  assert.equal(first.material, second.material); assert.deepEqual(kelpDriftFoodResourceStats(), { assets: 2, instances: 2 });
  let materialReleases = 0, bufferReleases = 0;
  first.material.addEventListener('dispose', () => materialReleases++);
  first.objects.get(patch.id).geometry.addEventListener('dispose', () => bufferReleases++);
  first.update([], generator); assert.equal(bufferReleases, 1); assert.equal(materialReleases, 0);
  first.dispose(); first.dispose(); assert.equal(materialReleases, 0); assert.equal(first.update([patch], generator), false);
  second.dispose(); second.dispose(); assert.equal(materialReleases, 1); assert.deepEqual(kelpDriftFoodResourceStats(), { assets: 0, instances: 0 });
});

test('the real loaded controller starts invisible and its existing sloughing stock alone creates supported food displays', async t => {
  const generator = createKelpOceanGenerator('42'), store = { available: true, load: async () => null,
    saveMany: async () => {}, clear: async () => {} };
  const ecology = new KelpOceanEcology('42', generator, { store }), food = new KelpDriftFood();
  t.after(async () => { food.dispose(); await ecology.dispose(); });
  assert.equal(await ecology.update({ x: 259, z: 3 }), true);
  const oldPatches = ecology.driftFoodPatches; assert.ok(oldPatches.length > 0);
  assert.ok(oldPatches.every(patch => patch.stock === 0)); food.update(oldPatches, generator); assert.equal(food.objects.size, 0);
  ecology.step(1); const patches = ecology.driftFoodPatches, before = ecology.snapshot();
  const positive = patches.filter(patch => patch.stock > 0 && patch.aliveHost);
  assert.ok(positive.length > 0, 'ordinary one-second sloughing creates actual stored units without injected stock');
  food.update(patches, generator); assert.equal(food.objects.size, positive.length);
  for (const patch of positive) {
    const object = food.objects.get(patch.id); assert.ok(object); assert.equal(object.userData.stock, patch.stock);
    assert.equal(object.userData.hostId, patch.hostId); assert.equal(object.userData.timeSec, patch.timeSec);
  }
  ecology.step(0); food.update(ecology.driftFoodPatches, generator);
  assert.deepEqual(ecology.snapshot(), before, 'display and pause preserve the actual model clocks, stocks and ledgers');
});

test('the shipped World reset and partial-constructor disposal release real food buffers and retain no food root', async () => {
  const World = new Function('THREE', 'createOceanEnvironment', 'window', 'document',
    `return class { ${['updateKelpDriftFood', 'setOceanRenderOrigin', 'reset', 'dispose'].map(shippedMethod).join('\n')} }`)(
    THREE, () => ({}), { removeEventListener() {} }, { removeEventListener() {} });
  const generator = createKelpOceanGenerator('42'), patch = realPatch(generator), food = new KelpDriftFood();
  food.update([patch], generator); const material = food.material; let releases = 0;
  material.addEventListener('dispose', () => releases++);
  let bufferReleases = 0; food.objects.get(patch.id).geometry.addEventListener('dispose', () => bufferReleases++);
  const world = Object.assign(new World(), { oceanKelpDriftFood: food, oceanEcologyResetting: false,
    oceanEcology: { driftFoodPatches: [patch], reset: async () => {}, dispose: async () => {} },
    oceanChunks: { generator, setRenderOrigin() {}, reset() {}, dispose() {} }, oceanAnimals: { setRenderOrigin() {}, reset() {}, dispose() {} },
    oceanRenderOrigin: { x: 128, z: 0 }, camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3() },
    sim: { seed: '42', reset(seed) { this.seed = seed; } }, highlight: { visible: false, position: new THREE.Vector3() },
    isDeep: false, isKelp: true, disposed: false, errors: [], setView() {}, syncPopulation() {}, onSelect() {}, emitSnapshot() {},
    requestOceanEcology() {} });
  world.reset('77'); assert.equal(bufferReleases, 1); assert.equal(food.objects.size, 0);
  assert.deepEqual(food.renderOrigin, { x: 0, z: 0 }); assert.equal(world.oceanEcologyResetting, true);
  await Promise.resolve(); assert.equal(world.oceanEcologyResetting, false);
  world.dispose(); world.dispose(); assert.equal(releases, 1); assert.equal(world.oceanKelpDriftFood, null);
  assert.equal(food.root.parent, null); assert.equal(food.root.children.length, 0);
  assert.deepEqual(kelpDriftFoodResourceStats(), { assets: 0, instances: 0 });
});
