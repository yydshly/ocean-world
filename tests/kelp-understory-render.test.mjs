import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpUnderstory } from '../src/world/KelpUnderstory.js';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';

const region = (cx, cz, count = 3, timeSec = 5, currentMps = .18) => ({ id: `${cx},${cz}`, cx, cz, timeSec,
  localEnvironment: { currentMps }, understoryPlants: Array.from({ length: count }, (_, i) => ({
    id: `low:${cx},${cz}:${i}`, regionId: `${cx},${cz}`, hostId: `real-rock:${i}`,
    x: cx * 64 + 3 + i * 1.4, y: -4 + i * .03, z: cz * 64 + 4 + i * .3,
    heightM: 1.2 + (i % 7) * .1, radiusM: .7 + (i % 8) * .05, phase: i * .7,
  })) });
const matrixArray = mesh => Array.from(mesh.instanceMatrix.array);
const shaderState = renderer => Object.fromEntries(['understoryTime', 'understoryFlow', 'understoryPhase']
  .map(key => [key, renderer.material.uniforms[key].value]));

test('actual static and maximum animated prototype fit the finite physical envelope with roots fixed on real instance matrices', t => {
  const renderer = new KelpUnderstory(); t.after(() => renderer.dispose());
  const owner = region(-5, -2); renderer.update([owner], { x: -320, z: -128 });
  const mesh = renderer.objects.get(owner.id).mesh, positions = renderer.geometry.attributes.position;
  const vertex = new THREE.Vector3(), maximumSway = Math.hypot(.044 + .014, .026);
  let actualHeight = 0, actualRadius = 0;
  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index);
    assert.ok(vertex.y >= 0 && vertex.y <= 1);
    const sway = maximumSway * Math.max(0, Math.min(1, vertex.y)) ** 2;
    assert.ok(Math.hypot(vertex.x, vertex.z) + sway < 1, 'every animated vertex fits the root-cylinder collision radius');
    actualRadius = Math.max(actualRadius, Math.hypot(vertex.x, vertex.z)); actualHeight = Math.max(actualHeight, vertex.y);
  }
  assert.ok(actualHeight > .85 && actualRadius > .7, 'a real metre-scale crown is rendered, not a zero-area placeholder');
  assert.match(renderer.material.vertexShader, /pow\(clamp\(position.y, 0.0, 1.0\), 2.0\)/);
  assert.ok(renderer.geometry.index.count / 3 < 400 && positions.count < 300, 'one finite shared whole-plant outline');
  assert.equal(renderer.stats.pickable, false); assert.equal(mesh.userData.pickable, false);
  const ray = new THREE.Raycaster(), transform = new THREE.Matrix4();
  for (let index = 0; index < owner.understoryPlants.length; index++) {
    const plant = owner.understoryPlants[index]; mesh.getMatrixAt(index, transform); transform.premultiply(mesh.matrixWorld);
    const root = new THREE.Vector3(0, 0, 0).applyMatrix4(transform);
    assert.ok(root.distanceTo(new THREE.Vector3(plant.x + 320, plant.y, plant.z + 128)) < 1e-5);
    ray.set(root.clone().add(new THREE.Vector3(0, -.2, 0)), new THREE.Vector3(0, 1, 0));
    const hits = ray.intersectObject(mesh).filter(hit => hit.instanceId === index); assert.ok(hits.length, 'actual root triangles exist at the saved physical root');
    assert.ok(Math.abs(hits[0].point.y - plant.y) < 1e-5);
  }
});

test('each geographic owner uses its own paused clock and current, while rebasing and rebuilding preserve all instance poses', t => {
  const renderer = new KelpUnderstory(); t.after(() => renderer.dispose());
  const a = region(15625, -15625, 3, 14.3, .41), b = region(15626, -15625, 2, 79.1, .04);
  const original = structuredClone([a, b]); renderer.update([a, b], { x: 1e6, z: -1e6 });
  const first = renderer.objects.get(a.id), second = renderer.objects.get(b.id), matrix = matrixArray(first.mesh);
  first.mesh.onBeforeRender(); const frozen = shaderState(renderer);
  assert.equal(frozen.understoryTime, a.timeSec); assert.equal(frozen.understoryFlow, a.localEnvironment.currentMps);
  second.mesh.onBeforeRender(); assert.equal(renderer.material.uniforms.understoryTime.value, b.timeSec);
  assert.equal(renderer.material.uniforms.understoryFlow.value, b.localEnvironment.currentMps);
  renderer.update([a, b], { x: 1e6 + 64, z: -1e6 - 64 });
  assert.equal(renderer.objects.get(a.id), first); assert.deepEqual(matrixArray(first.mesh), matrix);
  first.mesh.onBeforeRender(); assert.deepEqual(shaderState(renderer), frozen);
  assert.deepEqual([a, b], original, 'rendering never alters regional clocks, physical roots or scenery metadata');
  const geo = renderer.geometry, material = renderer.material;
  renderer.update([b]); assert.equal(first.mesh.parent, null); assert.equal(renderer.objects.get(b.id), second);
  renderer.update([a, b]); const rebuilt = renderer.objects.get(a.id); assert.notEqual(rebuilt, first);
  assert.deepEqual(matrixArray(rebuilt.mesh), matrix); rebuilt.mesh.onBeforeRender(); assert.deepEqual(shaderState(renderer), frozen);
  assert.equal(renderer.geometry, geo); assert.equal(renderer.material, material);
  const altered = { ...a, timeSec: 14.4 }; renderer.update([altered, b]); rebuilt.mesh.onBeforeRender();
  assert.equal(renderer.material.uniforms.understoryTime.value, 14.4); assert.deepEqual(matrixArray(rebuilt.mesh), matrix);
});

test('nine owners and 288 plants share one geometry/material and release only evicted instance buffers until final disposal', () => {
  const renderer = new KelpUnderstory(), owners = Array.from({ length: 12 }, (_, i) => region(i, -3, 40));
  renderer.update(owners); assert.equal(renderer.stats.activeRegions, 9); assert.equal(renderer.stats.plantCount, 288);
  assert.equal(renderer.stats.drawCalls, 9); assert.equal(renderer.stats.prototypeGeometries, 1); assert.equal(renderer.stats.prototypeMaterials, 1);
  const records = [...renderer.objects.values()]; assert.ok(records.every(record => record.mesh.geometry === renderer.geometry && record.mesh.material === renderer.material));
  let instanceDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
  for (const record of records) record.mesh.addEventListener('dispose', () => instanceDisposals++);
  renderer.geometry.addEventListener('dispose', () => geometryDisposals++); renderer.material.addEventListener('dispose', () => materialDisposals++);
  renderer.update(owners.slice(1, 10)); assert.equal(instanceDisposals, 1); assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
  renderer.dispose(); renderer.dispose(); assert.equal(instanceDisposals, 9); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(renderer.root.children.length, 0); assert.equal(renderer.stats.plantCount, 0); assert.equal(renderer.update(owners), false);
});

test('the original landscape triangles, roots and all native/water/visitor body prototypes remain byte-exact beside the new layer', t => {
  const before = JSON.parse(readFileSync(new URL('../output/validation/kelp-understory-source-hashes-before.json', import.meta.url), 'utf8'));
  for (const file of ['src/kelpOceanGeneration.js', 'src/kelpHabitat.js', 'src/kelpSimulation.js', 'src/oceanRockShape.js',
    'src/world/KelpOceanChunks.js', 'src/world/kelpOrganisms.js', 'src/world/kelpWaterOrganisms.js', 'src/world/kelpVisitorOrganism.js', 'src/world/KelpOceanAnimals.js']) {
    const entry = before.find(row => row.file === file); assert.ok(entry, `${file} was independently frozen before this milestone`);
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex'), entry.sha256, `${file} preserves the delivered original body/landscape`);
  }
  const chunks = new KelpOceanChunks('42'), renderer = new KelpUnderstory(); t.after(() => { chunks.dispose(); renderer.dispose(); });
  chunks.update({ x: -289, z: -62 });
  const old = [...chunks._chunks.values()].map(record => ({
    terrain: Array.from(record.terrainGeometry.attributes.position.array),
    matrices: record.instances.map(mesh => matrixArray(mesh)),
  }));
  renderer.update([region(-5, -1)]); renderer.update([region(-5, -1, 3, 20, .8)], { x: -320, z: -64 });
  assert.deepEqual([...chunks._chunks.values()].map(record => ({ terrain: Array.from(record.terrainGeometry.attributes.position.array),
    matrices: record.instances.map(mesh => matrixArray(mesh)) })), old);
});
