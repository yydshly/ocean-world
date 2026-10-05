import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { livingShallowsTerrainColor } from '../src/world/livingShallowsAssets.js';
import { createLivingReefSubstrateIndex, livingReefSubstrateCover, livingReefSubstrateColor } from '../src/world/livingReefSubstrate.js';

const SEED = 'living-shallows-v1|string:42';
const ROW = 65;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value
  : Buffer.from(value.buffer, value.byteOffset, value.byteLength)).digest('hex');
// Captured immediately before the substrate renderer was connected. Only the
// living terrain colour is intentionally allowed to differ from this baseline.
const BASELINE = {
  '9,4': {
    descriptor: 'bf699fd79c663f5d7fa0a55562c3097f895de745033d9c3f296a9c3107cebd1d',
    position: 'e0a9bb438cf8be208e30af10a48a13655d9034cde69bc8f255c228a31ed3d15d',
    normal: 'f88e803519fb279a2432349442b52b2019b22a6c3195534724fba589123ee034',
    uv: '323adf65f9044003fab2074e6bb8dfd645e6371aa66b68ce0c053e91be226108',
    color: '64c5e35fad7002d76f941a75a8b5417a8b3fc3f07174e4d61a4c0142d9eae29b',
  },
  '-1,-1': {
    descriptor: '8ceaf42e0dc9ed15bcd93ca03cb4bd44b3cb9b20b6767b8ccab0a05ae6bfb910',
    position: '74f69cf372fbf96e73200569eac0304ba7002940102a1303d541fff27013dd56',
    normal: 'e0f310a6e4c6f1eda253332c4a88d1b2d85645f3bda49090a543639b206423e2',
    uv: '52ba3bebc6f59d29629f2ef52d1b3b05ed91a2db770ab359e5050b654e940682',
    color: '76d8f3a98ea58c573e0b5cf55fd69c5bd6f768e4ea26fbb0132962b917aeb630',
  },
};
const INDEX_HASH = '64e93ae8b695a7ac9bfa1e07ffac13a58de07b7e63191dc382139f6ab995153a';
const LEGACY = {
  position: '2732a5278e7395738954464677104d72ae73e904d7bfe1d775e96c8a5c0e8697',
  normal: 'ec63f9f7e8b19caadda77004945f3afae509409118b7938c6a84b486916635c3',
  uv: BASELINE['9,4'].uv,
  color: '1dab915ea32084bd66a8cb6504a3febf17f242600920c53bebc80c3ee58ec041',
};
const allEntries = index => [...index.values()].flat();

test('substrate index contains only the actual neighbouring rubble anchors and their existing metre footprints', () => {
  const generator = createLivingShallowsGenerator(SEED), chunk = generator.chunk(9, 4);
  const original = hash(JSON.stringify(chunk)), expected = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    expected.push(...generator.chunk(9 + dx, 4 + dz).elements.filter(e => e.kind === 'rubble'));
  const index = createLivingReefSubstrateIndex(generator, chunk), entries = allEntries(index);
  assert.equal(entries.length, expected.length); assert.ok(expected.length > 500);
  for (const anchor of expected) {
    const width = Math.max(anchor.scale.x, anchor.scale.z);
    const entry = entries.find(e => e.x === anchor.x && e.z === anchor.z);
    assert.ok(entry); assert.equal(entry.radius, .6 + width * 1.5);
    assert.equal(entry.strength, Math.min(1, width / .5) * .65);
    assert.ok(livingReefSubstrateCover(index, anchor.x, anchor.z) >= entry.strength);
    assert.ok(index.get(`${Math.floor(anchor.x / 8)},${Math.floor(anchor.z / 8)}`).includes(entry));
  }
  assert.equal(hash(JSON.stringify(chunk)), original);
});

test('empty and non-rubble owners contribute nothing while overlap stays bounded with exact finite falloff', () => {
  const chunk = { cx: -1, cz: -1 };
  const fake = elements => ({ chunk: () => ({ elements }) });
  const other = ['rock', 'coral', 'seagrass', 'algae', 'bottle', 'driftwood'].map(kind =>
    ({ kind, x: -8, z: -8, scale: { x: 1, y: 1, z: 1 } }));
  for (const generator of [fake([]), fake(other)]) {
    const index = createLivingReefSubstrateIndex(generator, chunk);
    assert.equal(index.size, 0); assert.equal(livingReefSubstrateCover(index, -8, -8), 0);
  }
  const patch = { x: -8.1, z: -.1, radius: 1.8, strength: .65 };
  const one = new Map([['-2,-1', [patch]]]);
  assert.equal(livingReefSubstrateCover(one, patch.x, patch.z), .65);
  let previous = .65;
  for (const fraction of [.1, .25, .5, .75, .99, 1, 1.1]) {
    const cover = livingReefSubstrateCover(one, patch.x + patch.radius * fraction, patch.z);
    assert.ok(Number.isFinite(cover) && cover >= 0 && cover <= previous); previous = cover;
  }
  assert.equal(livingReefSubstrateCover(one, patch.x, patch.z + patch.radius), 0);
  assert.equal(livingReefSubstrateCover(one, patch.x - patch.radius - 1e-9, patch.z), 0);
  const overlap = new Map([['-2,-1', [patch, { ...patch }, { ...patch }]]]);
  assert.equal(livingReefSubstrateCover(overlap, patch.x, patch.z), 1);
});

test('positive and negative owner seams retain exact world cover after generator eviction and reversed load order', () => {
  const generator = createLivingShallowsGenerator(SEED), samples = [];
  for (const [cx, cz] of [[9, 4], [-1, -1]]) for (const axis of ['x', 'z']) {
    const left = generator.chunk(cx, cz), right = generator.chunk(cx + (axis === 'x' ? 1 : 0), cz + (axis === 'z' ? 1 : 0));
    const a = createLivingReefSubstrateIndex(generator, left), b = createLivingReefSubstrateIndex(generator, right);
    for (let offset = 0; offset <= 64; offset++) {
      const x = left.origin.x + (axis === 'x' ? 64 : offset), z = left.origin.z + (axis === 'z' ? 64 : offset);
      const cover = livingReefSubstrateCover(a, x, z);
      assert.equal(cover, livingReefSubstrateCover(b, x, z), `${axis} seam at ${x},${z}`);
      samples.push({ cx, cz, x, z, cover });
    }
  }
  for (let i = 0; i < 40; i++) generator.chunk(100 + i, -100 - i);
  assert.ok(generator.cacheStats().size <= 32);
  const rebuilt = new Map();
  for (const sample of samples.slice().reverse()) {
    const id = `${sample.cx},${sample.cz}`;
    if (!rebuilt.has(id)) rebuilt.set(id, createLivingReefSubstrateIndex(generator, generator.chunk(sample.cx, sample.cz)));
    assert.equal(livingReefSubstrateCover(rebuilt.get(id), sample.x, sample.z), sample.cover);
  }
  for (const [id, baseline] of Object.entries(BASELINE)) {
    const [cx, cz] = id.split(',').map(Number);
    assert.equal(hash(JSON.stringify(generator.chunk(cx, cz))), baseline.descriptor);
  }
});

test('colour modulation is finite, preserves empty sand exactly and can safely reuse the existing RGB buffer', () => {
  for (const base of [[1, 1, 1], [.3, .6, .9], [0, 0, 0]]) {
    assert.deepEqual(livingReefSubstrateColor(base, 0), base);
    for (const cover of [-1, .25, .8, 1, 2]) {
      const original = base.slice(), target = [];
      assert.equal(livingReefSubstrateColor(base, cover, target), target); assert.deepEqual(base, original);
      assert.ok(target.every((value, i) => Number.isFinite(value) && value >= 0 && value <= base[i]));
      const inplace = base.slice(); assert.equal(livingReefSubstrateColor(inplace, cover, inplace), inplace);
      assert.deepEqual(inplace, target);
    }
  }
});

test('renderer changes only intended living colours and retains baseline terrain triangles, normals, UVs and descriptors', t => {
  const ocean = new OceanChunks(SEED), legacy = new OceanChunks('42');
  t.after(() => { ocean.dispose(); legacy.dispose(); });
  let changedVertices = 0;
  for (const [id, baseline] of Object.entries(BASELINE)) {
    const [cx, cz] = id.split(',').map(Number), chunk = ocean.generator.chunk(cx, cz), geometry = ocean._terrainGeometry(chunk);
    try {
      assert.equal(hash(JSON.stringify(chunk)), baseline.descriptor);
      for (const attribute of ['position', 'normal', 'uv']) assert.equal(hash(geometry.attributes[attribute].array), baseline[attribute]);
      assert.equal(hash(geometry.index.array), INDEX_HASH);
      const grass = ocean._terrainCoverIndex(chunk), rubble = createLivingReefSubstrateIndex(ocean.generator, chunk);
      const color = geometry.attributes.color, position = geometry.attributes.position;
      for (let rz = 0; rz < ROW; rz++) for (let rx = 0; rx < ROW; rx++) {
        const i = rz * ROW + rx, x = chunk.origin.x + rx, z = chunk.origin.z + rz;
        assert.equal(position.getY(i), ocean.generator.floorVertex(x, z));
        const sample = ocean.generator.sample(x, z), base = livingShallowsTerrainColor(x, z, sample,
          ocean.generator.coverAt(x, z, sample), ocean._grassRootEnvelope(grass, x, z));
        const cover = livingReefSubstrateCover(rubble, x, z), expected = livingReefSubstrateColor(base, cover);
        for (let component = 0; component < 3; component++) assert.equal(color.array[i * 3 + component], Math.fround(expected[component]));
        if (cover > 0) changedVertices++;
      }
      assert.notEqual(hash(color.array), baseline.color, 'living colour changes are the declared display effect');
    } finally { geometry.dispose(); }
  }
  const geometry = legacy._terrainGeometry(legacy.generator.chunk(9, 4));
  try {
    for (const [attribute, expected] of Object.entries(LEGACY)) assert.equal(hash(geometry.attributes[attribute].array), expected);
    assert.equal(hash(geometry.index.array), INDEX_HASH);
  } finally { geometry.dispose(); }
  assert.ok(changedVertices > 200); t.diagnostic(`intentional living colour vertices=${changedVertices}; all geometry/support hashes exact`);
});

test('nine-owner streaming adds no draw, material or owned geometry and rebase/unload/revisit retain all substrate colours', t => {
  const ocean = new OceanChunks(SEED); t.after(() => ocean.dispose()); ocean.update({ x: 576, z: 272 });
  const originals = [...ocean._chunks.keys()], colors = new Map([...ocean._chunks].map(([id, record]) => [id, hash(record.terrainGeometry.attributes.color.array)]));
  let terrainDisposals = 0;
  const checkBudget = () => {
    assert.equal(ocean.stats.activeChunks, 9); assert.equal(ocean.stats.maxDrawCalls, 117);
    assert.ok(ocean.stats.drawCalls <= 117); assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
    assert.ok(ocean.stats.ownedOverlayGeometries <= 9); assert.ok(ocean.stats.ownedMeadowGeometries <= 9);
    for (const [id, record] of ocean._chunks) {
      const [cx, cz] = id.split(',').map(Number), elements = ocean.generator.chunk(cx, cz).elements;
      const batches = new Set(elements.filter(e => e.kind !== 'algae').map(e =>
        e.kind === 'rock' ? `rock-${e.profile}` : e.kind === 'coral' ? `coral-${e.morphotype}` : e.kind));
      assert.equal(record.instances.length, batches.size);
      assert.deepEqual(Object.keys(record.terrainGeometry.attributes).sort(), ['color', 'normal', 'position', 'uv']);
      assert.equal(record.ownedGeometries.length, record.overlays.length);
      assert.ok(record.overlays.every(mesh => mesh.name === 'generated-algae-cover'));
      assert.equal(record.group.children.length, 1 + record.instances.length + record.overlays.length + (record.footingGeometry ? 1 : 0));
    }
  };
  checkBudget();
  for (const record of ocean._chunks.values()) record.terrainGeometry.addEventListener('dispose', () => terrainDisposals++);
  ocean.setRenderOrigin({ x: 576, z: 256 });
  for (const [id, record] of ocean._chunks) assert.equal(hash(record.terrainGeometry.attributes.color.array), colors.get(id));
  ocean.update({ x: -300, z: -300 }); checkBudget();
  assert.ok([...ocean._chunks.keys()].every(id => !originals.includes(id))); assert.equal(terrainDisposals, 9);
  ocean.update({ x: 576, z: 272 }); checkBudget();
  for (const [id, record] of ocean._chunks) assert.equal(hash(record.terrainGeometry.attributes.color.array), colors.get(id));
});
