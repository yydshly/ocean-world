import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { LIVING_SHALLOWS_ASSET_VERSION, LIVING_SHALLOWS_PALETTE,
  livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';

const names = ['coral-branching', 'coral-table', 'coral-fan', 'rubble'];
function kitFor(t) {
  const kit = livingShallowsAssetGeometries(); t.after(() => Object.values(kit).forEach(geometry => geometry.dispose())); return kit;
}
function hash(geometry) {
  const digest = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name]; digest.update(name); digest.update(String(attribute.itemSize));
    digest.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  if (geometry.index) digest.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
  return digest.digest('hex');
}

test('the complete outer-reef kit has finite triangles, normals and bounded attached metre envelopes', t => {
  const kit = kitFor(t); assert.equal(LIVING_SHALLOWS_ASSET_VERSION, 4);
  for (const name of names) {
    const shape = kit[name], positions = shape.attributes.position;
    assert.equal(shape.userData.assetVersion, LIVING_SHALLOWS_ASSET_VERSION); assert.ok(shape.userData.assetShape);
    assert.equal(shape.boundingBox.min.y, 0); assert.equal(shape.boundingBox.max.y, 1);
    assert.ok(Number.isFinite(shape.boundingSphere.radius));
    for (const attribute of Object.values(shape.attributes)) {
      assert.equal(attribute.count, positions.count); assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
    assert.ok(Array.from(shape.index.array).every(index => Number.isInteger(index) && index >= 0 && index < positions.count));
    for (let vertex = 0; vertex < positions.count; vertex++) {
      assert.ok(positions.getY(vertex) >= 0 && positions.getY(vertex) <= 1);
      assert.ok(Math.hypot(positions.getX(vertex), positions.getZ(vertex)) <= .500001);
    }
  }
});

test('the branching crown has a broad low connected foundation and distributed elevated stems instead of one central inverted cone', t => {
  const branching = kitFor(t)['coral-branching'], positions = branching.attributes.position;
  let hasRoot = false, lowRadius = 0, outerHigh = 0; const upperQuadrants = new Set();
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex), radius = Math.hypot(x, z);
    if (x === 0 && y === 0 && z === 0) hasRoot = true;
    if (y < .16) lowRadius = Math.max(lowRadius, radius);
    if (y > .60 && radius > .23) { outerHigh++; upperQuadrants.add(`${x >= 0},${z >= 0}`); }
  }
  assert.equal(hasRoot, true); assert.ok(lowRadius > .37, 'the attached colony begins with a wide low crust');
  assert.ok(outerHigh > 300); assert.equal(upperQuadrants.size, 4, 'the whole crown fills different sides at ordinary view scale');
  assert.match(branching.userData.assetShape, /multiroot/);
});

test('table and fan remain distinct whole forms: thin overlapping horizontal crowns and a branching web with genuine holes', t => {
  const kit = kitFor(t), table = kit['coral-table'], fan = kit['coral-fan'];
  assert.notEqual(hash(table), hash(fan)); assert.notEqual(hash(table), hash(kit['coral-branching']));
  const tableSize = table.boundingBox.getSize(new THREE.Vector3()), fanSize = fan.boundingBox.getSize(new THREE.Vector3());
  assert.ok(tableSize.z > .65); assert.ok(fanSize.z < .12);
  const tablePositions = table.attributes.position, crownHeights = [];
  for (let vertex = 0; vertex < tablePositions.count; vertex++) {
    if (Math.hypot(tablePositions.getX(vertex), tablePositions.getZ(vertex)) > .25 && tablePositions.getY(vertex) > .2)
      crownHeights.push(tablePositions.getY(vertex));
  }
  assert.ok(Math.max(...crownHeights) - Math.min(...crownHeights) > .60, 'broad lateral growth occupies unequal layers and actual crown depth');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); t.after(() => material.dispose());
  const object = new THREE.Mesh(fan, material); object.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(); let holes = 0, web = 0;
  // The mid-crown contains both genuine passages and connected coral tissue,
  // independently checked against actual triangles rather than metadata.
  for (let y = .43; y < .85; y += .025) for (let x = -.13; x <= .13; x += .026) {
    ray.set(new THREE.Vector3(x, y, -1), new THREE.Vector3(0, 0, 1));
    if (ray.intersectObject(object, false).length) web++; else holes++;
  }
  assert.ok(holes > 20 && web > 20, 'the complete fan has connected walls and open perforations');
  assert.match(table.userData.assetShape, /layered/); assert.match(fan.userData.assetShape, /perforated/);
});

test('coarse angular rubble and all three complete crowns keep finite shared-prototype triangle budgets', t => {
  const kit = kitFor(t), other = kitFor(t);
  for (const name of names) {
    const triangles = kit[name].index.count / 3;
    assert.ok(triangles <= (name === 'rubble' ? 160 : 2500), `${name}: no large per-instance triangle expansion`);
    assert.equal(hash(kit[name]), hash(other[name]), 'a fixed shared prototype does not depend on seed or construction order');
  }
  const rubble = kit.rubble; assert.equal(rubble.userData.pieceCount, 5); assert.match(rubble.userData.assetShape, /broken-angular/);
  const positions = rubble.attributes.position; let grounded = 0;
  assert.equal(rubble.attributes.uv.itemSize, 2); assert.equal(rubble.attributes.uv.count, positions.count,
    'the original stone-map material receives a complete UV reference for every rubble vertex');
  for (let vertex = 0; vertex < positions.count; vertex++) if (positions.getY(vertex) === 0) grounded++;
  assert.ok(grounded > 20, 'broken pieces have broad polygonal ground contacts rather than one rounded bottom');
});

test('the completed meadow, rootXZ grounding references, discovery props and palette remain byte-exact', t => {
  // Captured directly from the delivered version-2 geometry before this change.
  const unchanged = {
    seagrass: '471c5ad5a31f57c2235a3b21b71b4eb1552d000648a745912bb66ed7e24b8648',
    driftwood: 'f487bb7a5fb3b6d5680a55814e394e6652731c78e59222b3abf530bd83585cfd',
    bottle: '2b2f9d132381b6f8cdd8b39928d83c5db2bdfcc5f8872c88466a8aca2a3c10e6',
  };
  const kit = kitFor(t);
  for (const [name, expected] of Object.entries(unchanged)) assert.equal(hash(kit[name]), expected, `${name}: all attributes and triangle indices remain exact`);
  assert.equal(kit.seagrass.attributes.rootXZ.itemSize, 2); assert.equal(kit.seagrass.userData.bladeCount, 96);
  assert.deepEqual(LIVING_SHALLOWS_PALETTE, { rock: '#a29a80', branching: '#a3997e', table: '#a88b83', fan: '#947659',
    seagrass: '#536c3d', rubble: '#ada48e', algae: '#657047', driftwood: '#756a56', bottle: '#8aaba1' });
});
