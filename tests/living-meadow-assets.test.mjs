import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LIVING_SHALLOWS_ASSET_VERSION, LIVING_SHALLOWS_PALETTE,
  livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';

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

test('the single meadow prototype has complete finite positions, normals, colours, UVs and indices in its unit height', t => {
  const grass = kitFor(t).seagrass, positions = grass.attributes.position;
  assert.equal(LIVING_SHALLOWS_ASSET_VERSION, 4); assert.equal(grass.userData.assetVersion, LIVING_SHALLOWS_ASSET_VERSION);
  assert.equal(grass.boundingBox.min.y, 0); assert.equal(grass.boundingBox.max.y, 1);
  assert.ok(Number.isFinite(grass.boundingSphere.radius));
  for (const [name, attribute] of Object.entries(grass.attributes)) {
    assert.equal(attribute.count, positions.count, `${name}: complete per-vertex attribute`);
    assert.ok(Array.from(attribute.array).every(Number.isFinite), `${name}: no invalid display values`);
  }
  assert.ok(Array.from(grass.index.array).every(index => Number.isInteger(index) && index >= 0 && index < positions.count));
  for (let vertex = 0; vertex < positions.count; vertex++) assert.ok(positions.getY(vertex) >= 0 && positions.getY(vertex) <= 1);
});

test('every blade retains one exact fixed rootXZ reference and a zero-height substrate root', t => {
  const grass = kitFor(t).seagrass, positions = grass.attributes.position, rootXZ = grass.attributes.rootXZ;
  assert.equal(rootXZ.itemSize, 2);
  const verticesPerBlade = (grass.userData.bladeSegments + 1) * 2;
  for (let blade = 0; blade < grass.userData.bladeCount; blade++) {
    const first = blade * verticesPerBlade, root = [rootXZ.getX(first), rootXZ.getY(first)];
    for (let vertex = first; vertex < first + verticesPerBlade; vertex++) {
      assert.deepEqual([rootXZ.getX(vertex), rootXZ.getY(vertex)], root, 'the shader samples each actual blade root rather than its displaced tip');
    }
    for (const firstVertex of [first, first + 1]) {
      assert.equal(positions.getY(firstVertex), 0);
      assert.deepEqual([positions.getX(firstVertex), positions.getZ(firstVertex)], root);
    }
  }
});

test('roots cover the existing broad patch in all quadrants with one sand opening and finite current-bend reserve', t => {
  const grass = kitFor(t).seagrass, positions = grass.attributes.position, rootXZ = grass.attributes.rootXZ;
  const quadrants = new Set(), roots = new Set(); let outerRoots = 0, maxRootRadius = 0;
  for (let blade = 0; blade < grass.userData.bladeCount; blade++) {
    const first = blade * 10, x = rootXZ.getX(first), z = rootXZ.getY(first), radius = Math.hypot(x, z);
    roots.add(`${x},${z}`); quadrants.add(`${x >= 0},${z >= 0}`); maxRootRadius = Math.max(maxRootRadius, radius);
    if (radius > .25) outerRoots++;
    const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    if (radius > .12) assert.ok(Math.abs(angle - .35) >= .14, 'narrow substrate opening survives dispersed shoots');
  }
  assert.equal(roots.size, 96); assert.equal(quadrants.size, 4); assert.ok(outerRoots >= 35);
  assert.ok(maxRootRadius >= .34 && maxRootRadius <= .36, 'roots spread across the authored unit patch');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    assert.ok(Math.hypot(positions.getX(vertex), positions.getZ(vertex)) <= .44,
      'the full undeformed blade silhouette leaves additional local-current bending room');
  }
});

test('a deterministic multi-shoot meadow retains height and width variation within one bounded 768-triangle geometry', t => {
  const grass = kitFor(t).seagrass, other = kitFor(t).seagrass, positions = grass.attributes.position;
  assert.equal(grass.userData.shootCount, 32); assert.equal(grass.userData.bladeCount, 96); assert.equal(grass.userData.bladeSegments, 4);
  assert.equal(positions.count, 960); assert.equal(grass.index.count / 3, 768); assert.ok(grass.index.count / 3 <= 900);
  const heights = [], widths = [];
  for (let blade = 0; blade < 96; blade++) {
    const first = blade * 10; heights.push(positions.getY(first + 8));
    widths.push(Math.hypot(positions.getX(first + 4) - positions.getX(first + 5), positions.getZ(first + 4) - positions.getZ(first + 5)));
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > .45); assert.ok(Math.max(...widths) / Math.min(...widths) > 1.5);
  assert.equal(hash(grass), hash(other)); assert.match(grass.userData.role, /not-individual-biomass/);
});

test('grounded discovery props and the original palette survive later whole-reef kit upgrades byte-exact', t => {
  // These attribute/index hashes predate the meadow change. Coral and rubble
  // intentionally receive new complete forms in asset version 3; their current
  // envelope and budget checks belong to living-reef-assets.test.mjs.
  const before = {
    driftwood: 'f487bb7a5fb3b6d5680a55814e394e6652731c78e59222b3abf530bd83585cfd',
    bottle: '2b2f9d132381b6f8cdd8b39928d83c5db2bdfcc5f8872c88466a8aca2a3c10e6',
  };
  const kit = kitFor(t);
  for (const [name, expected] of Object.entries(before)) assert.equal(hash(kit[name]), expected, `${name}: all original vertex attributes and indices stay exact`);
  assert.deepEqual(LIVING_SHALLOWS_PALETTE, { rock: '#a29a80', branching: '#a3997e', table: '#a88b83', fan: '#947659',
    seagrass: '#536c3d', rubble: '#ada48e', algae: '#657047', driftwood: '#756a56', bottle: '#8aaba1' });
});
