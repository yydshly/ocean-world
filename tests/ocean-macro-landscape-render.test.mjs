import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanMacroLandscape } from '../src/world/OceanMacroLandscape.js';
import { macroLandscapeMesh, macroLandscapeHeight, macroPlantMesh, OCEAN_MACRO_LANDSCAPE_LIMITS } from '../src/oceanMacroLandscape.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';

const clone = value => structuredClone(value), generator = createOceanGenerator('42');
const colonyKinds = ['coral-branch', 'coral-table', 'sea-fan'];
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} vs ${expected}`);
function field(cx, cz, full = false) {
  const regionId = `${cx},${cz}`, x = cx * 64, z = cz * 64;
  const masses = Array.from({ length: full ? 2 : 1 }, (_, index) => ({
    id: `mass:${regionId}:${index}`, regionId, kind: 'reef-mass', x: x + 12 + index * 26, y: -5, z: z + 12,
    rotation: 0, scale: { x: 20, y: 2, z: 20 },
    grid: { ...(index === 0 ? { topology: 'continuous-v1' } : {}), origin: { x: x + 8 + index * 26, z: z + 8 }, step: 1.25, columns: 16, rows: 16,
      cells: [{ i: 1, j: 1, riseM: .6 }, { i: 2, j: 1, riseM: .8 }, { i: 1, j: 2, riseM: .7 }, { i: 2, j: 2, riseM: .9 }] },
  }));
  const shoots = Array.from({ length: full ? 600 : 1 }, (_, index) => ({
    id: `shoot:${regionId}:${index}`, regionId, kind: 'meadow-shoot', x: x + 3 + index % 25 * 2, y: -4,
    z: z + 3 + Math.floor(index / 25) * 2, rotation: index * .37, scale: { x: .7, y: .9, z: .6 },
  }));
  const colonies = Array.from({ length: full ? 64 : 3 }, (_, index) => ({
    id: `colony:${regionId}:${index}`, regionId, kind: 'reef-colony', colonyKind: colonyKinds[index % 3],
    x: x + 5 + index % 8 * 6, y: -3, z: z + 5 + Math.floor(index / 8) * 6, rotation: index * .31,
    scale: { x: 1.9, y: 1.2, z: 1.6 },
  }));
  return [...masses, ...shoots, ...colonies];
}
function worldRoot(layer, element) {
  const kind = element.kind === 'meadow-shoot' ? element.kind : element.colonyKind;
  const mesh = layer._instances.get(kind).mesh, matrix = new THREE.Matrix4();
  mesh.getMatrixAt(mesh.userData.elementIds.indexOf(element.id), matrix);
  const point = new THREE.Vector3().applyMatrix4(matrix.premultiply(mesh.matrixWorld));
  point.x += layer.renderOrigin.x; point.z += layer.renderOrigin.z; return point;
}

test('nine fully allocated owners remain eighteen exact reef masses in nine merged ray-query meshes plus four shared plant batches', () => {
  const layer = new OceanMacroLandscape(), elements = [];
  for (let z = -1; z <= 1; z++) for (let x = 1; x <= 3; x++) elements.push(...field(x, z, true));
  const before = clone(elements); layer.update(elements, generator, { x: 128, z: 0 });
  assert.equal(layer.stats.instances, 5994); assert.equal(layer.stats.owners, 9); assert.equal(layer.stats.maxPerOwner, 666);
  assert.deepEqual(layer.stats.typeCounts, { 'reef-mass': 18, 'meadow-shoot': 5400, 'reef-colony': 576 });
  assert.deepEqual(layer.stats.limits, OCEAN_MACRO_LANDSCAPE_LIMITS);
  assert.equal(layer.stats.drawCalls, 13); assert.equal(layer.stats.massDrawCalls, 9); assert.equal(layer.stats.plantDrawCalls, 4);
  assert.equal(layer.stats.geometries, 13); assert.equal(layer.stats.materials, 5); assert.equal(layer.stats.textures, 0);
  assert.match(layer.stats.role, /scenery.*not.*animals.*food.*biomass/); assert.equal(layer.stats.pickable, false);
  for (const [owner, { mesh }] of layer._masses) {
    const massElements = elements.filter(element => element.regionId === owner && element.kind === 'reef-mass');
    const source = massElements.map(element => macroLandscapeMesh(element, generator));
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), source.flatMap(row => Array.from(row.positions)));
    let offset = 0; const expected = source.flatMap(row => { const values = Array.from(row.indices, index => index + offset); offset += row.positions.length / 3; return values; });
    assert.deepEqual(Array.from(mesh.geometry.index.array), expected);
    assert.ok(mesh.geometry.boundsTree); assert.equal(mesh.userData.elementIds.length, 2);
    for (let s = 0; s < source.length; s++) {
      const { positions, indices } = source[s], element = massElements[s]; let rayVerified = false;
      for (let i = 0; i < indices.length && !rayVerified; i += 3) {
        const a = new THREE.Vector3().fromArray(positions, indices[i] * 3);
        const b = new THREE.Vector3().fromArray(positions, indices[i + 1] * 3);
        const c = new THREE.Vector3().fromArray(positions, indices[i + 2] * 3);
        if (b.clone().sub(a).cross(c.clone().sub(a)).y <= .01) continue;
        const centroid = a.clone().add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrixWorld);
        const topology = element.grid.topology ?? 'historical-prism';
        const ray = new THREE.Raycaster(new THREE.Vector3(centroid.x, centroid.y + 20, centroid.z), new THREE.Vector3(0, -1, 0)); ray.firstHitOnly = true;
        const hit = ray.intersectObject(mesh)[0]; assert.ok(hit, `${topology} merged top remains ray-queryable`);
        close(hit.point.y, centroid.y, `${topology} real ray matches persisted shared triangle`);
        close(hit.point.y, macroLandscapeHeight(element, generator, centroid.x + layer.renderOrigin.x,
          centroid.z + layer.renderOrigin.z, false), `${topology} real ray matches physics support`); rayVerified = true;
      }
      assert.ok(rayVerified);
    }
    assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
  }
  for (const [kind, { mesh }] of layer._instances) {
    const source = macroPlantMesh(kind);
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), Array.from(source.positions));
    assert.deepEqual(Array.from(mesh.geometry.index.array), Array.from(source.indices));
    assert.equal(mesh.castShadow, false); assert.ok(mesh.boundingBox && mesh.boundingSphere);
  }
  assert.equal(new Set([...layer._instances.values()].map(row => row.mesh.geometry)).size, 4);
  for (const material of Object.values(layer._materials)) {
    assert.ok(material.roughness >= .9); assert.equal(material.metalness, 0); assert.equal(material.transparent, false);
    assert.equal(material.emissive.getHex(), 0); assert.equal(material.map, null); assert.equal(material.normalMap, null);
  }
  assert.deepEqual(elements, before); layer.dispose();
});

test('descriptor clones, neighbouring owner changes and floating-origin rebases preserve unchanged real geometry and GPU matrices', () => {
  const layer = new OceanMacroLandscape(), origin = { x: 1000192, z: -1000128 }, elements = field(15628, -15627);
  layer.update(elements, generator, origin);
  const mass = layer._masses.get('15628,-15627').mesh, batches = [...layer._instances.values()].map(row => row.mesh);
  const buffers = batches.map(mesh => mesh.instanceMatrix.array.slice());
  assert.equal(layer.update(clone(elements).reverse(), generator, origin), false);
  assert.equal(layer._masses.get('15628,-15627').mesh, mass); assert.deepEqual([...layer._instances.values()].map(row => row.mesh), batches);
  const massBuffer = mass.geometry.attributes.position.array.slice();
  layer.setRenderOrigin({ x: origin.x + 128, z: origin.z - 64 });
  for (const element of elements.filter(element => element.kind !== 'reef-mass')) {
    const point = worldRoot(layer, element); for (const axis of ['x', 'y', 'z']) close(point[axis], element[axis], `rebased ${element.id} ${axis}`);
  }
  batches.forEach((mesh, i) => assert.deepEqual(mesh.instanceMatrix.array, buffers[i]));
  assert.deepEqual(mass.geometry.attributes.position.array, massBuffer);
  close(mass.position.x + layer.renderOrigin.x, 15628 * 64, 'absolute mass owner X');
  close(mass.position.z + layer.renderOrigin.z, -15627 * 64, 'absolute mass owner Z');
  const neighbour = field(15629, -15627), all = [...elements, ...neighbour]; layer.update(all, generator, layer.renderOrigin);
  assert.equal(layer._masses.get('15628,-15627').mesh, mass, 'adding another owner retains this owner geometry');
  const otherMass = layer._masses.get('15629,-15627').mesh, changed = clone(all);
  changed.find(element => element.id === elements[0].id).grid.cells[0].riseM += .2;
  let oldGeometryDisposals = 0; mass.geometry.addEventListener('dispose', () => oldGeometryDisposals++);
  layer.update(changed, generator, layer.renderOrigin);
  assert.equal(oldGeometryDisposals, 1); assert.equal(mass.geometry.boundsTree, null);
  assert.equal(layer._masses.get('15629,-15627').mesh, otherMass, 'editing one saved mass retains its neighbour');
  layer.dispose();
});

test('invalid finite allocations retain the active layer, unloading releases owned mass trees, and reset/final dispose release shared resources once', () => {
  const layer = new OceanMacroLandscape(), elements = field(3, 1); layer.update(elements, generator, { x: 192, z: 64 });
  const stats = layer.stats, children = [...layer.root.children], invalidMass = clone(elements[0]); invalidMass.grid.cells.push(clone(invalidMass.grid.cells[0]));
  const unknownTopology = clone(elements[0]); unknownTopology.grid.topology = 'unrecognized-future';
  for (const invalid of [null, [...elements, clone(elements[0])], [invalidMass], [unknownTopology], [{ ...elements[1], regionId: '0,0' }],
    [{ ...elements[1], x: NaN }], [{ ...elements[1], scale: { x: 1, y: 0, z: 1 } }],
    Array.from({ length: 601 }, (_, i) => ({ ...elements[1], id: `over:${i}` })),
    Array.from({ length: 10 }, (_, i) => ({ ...elements[1], id: `owner:${i}`, regionId: `${i},1`, x: i * 64 + 4 }))]) {
    assert.throws(() => layer.update(invalid, generator, { x: 0, z: 0 }));
    assert.deepEqual(layer.stats, stats); assert.deepEqual(layer.root.children, children);
  }
  assert.throws(() => layer.setRenderOrigin({ x: Infinity, z: 0 }));
  let massDisposals = 0, instanceDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
  const massGeometry = [...layer._masses.values()][0].mesh.geometry;
  massGeometry.addEventListener('dispose', () => massDisposals++);
  for (const { mesh } of layer._instances.values()) mesh.addEventListener('dispose', () => instanceDisposals++);
  for (const geometry of layer._geometries.values()) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of Object.values(layer._materials)) material.addEventListener('dispose', () => materialDisposals++);
  layer.update([], generator, layer.renderOrigin);
  assert.equal(massDisposals, 1); assert.equal(massGeometry.boundsTree, null); assert.equal(instanceDisposals, 4);
  assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0); assert.equal(layer.root.children.length, 0);
  layer.update(elements, generator, layer.renderOrigin); layer.reset();
  assert.equal(layer.stats.instances, 0); assert.equal(layer.stats.prototypeGeometries, 4);
  layer.dispose(); layer.dispose();
  assert.equal(geometryDisposals, 4); assert.equal(materialDisposals, 5); assert.equal(layer.stats.geometries, 0); assert.equal(layer.stats.materials, 0);
  assert.equal(layer.update(elements, generator), false); assert.equal(layer.setRenderOrigin({ x: 0, z: 0 }), false);
});
