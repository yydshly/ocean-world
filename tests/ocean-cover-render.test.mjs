import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanChunks, oceanTerrainColor } from '../src/world/OceanChunks.js';
import { historicalGroundContactMatrices } from './reefGroundContactProjection.mjs';

const ROW = 65;
const syntheticBed = ocean => {
  const sample = () => ({ floorY: -7, rockiness: 0, seagrassSuitability: .8 });
  ocean.generator = { sample, coverAt: () => ({ seagrass: 1, sandOpening: 0, hardBottom: 0, authoredBlend: 1 }),
    chunk: (cx, cz) => ({ id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
      elements: cx === 2 && cz === 0 ? [{ id: 'real-grass', kind: 'seagrass', x: 145, y: -7, z: 5,
        scale: { x: 1.8, y: .6, z: 1.8 } }] : [] }) };
};

test('unoccupied potential grass fields keep the open-sand colour and real roots form a gradual fringe', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  syntheticBed(ocean);
  const chunk = ocean.generator.chunk(2, 0), geometry = ocean._terrainGeometry(chunk);
  t.after(() => geometry.dispose());
  const colors = geometry.attributes.color;
  const sampledColor = (x, z) => {
    const index = z * ROW + x - chunk.origin.x;
    return [colors.getX(index), colors.getY(index), colors.getZ(index)];
  };
  const tint = (x, z) => {
    const open = oceanTerrainColor(x, z, ocean.generator.sample(x, z), ocean.generator.coverAt(x, z), 0);
    const actual = sampledColor(x, z);
    return open[0] - actual[0];
  };
  assert.ok(tint(145, 5) > .3, 'actual grass root carries the strongest bed cue');
  assert.ok(tint(146, 5) > tint(147, 5), 'fringe fades with distance from the root');
  assert.ok(tint(147, 5) > 0);
  assert.ok(Math.abs(tint(148, 5)) < 1e-7, 'three metres away stays open sand despite high potential cover');
  assert.ok(Math.abs(tint(180, 5)) < 1e-7, 'distant unoccupied floor is not painted as a grass bed');
});

test('potential field suppresses turf-coloured floor in the open corridor even beside actual grass', () => {
  const sample = { rockiness: .15, seagrassSuitability: .8 };
  const open = oceanTerrainColor(145, 5, sample, { seagrass: 0 }, 1);
  const bed = oceanTerrainColor(145, 5, sample, { seagrass: .8 }, 1);
  const empty = oceanTerrainColor(145, 5, sample, { seagrass: .8 }, 0);
  assert.deepEqual(open, empty, 'actual roots alone cannot override a sand-opening field');
  assert.ok(bed[0] < open[0] && bed[2] < open[2]);
  assert.ok((bed[1] - bed[0]) > (open[1] - open[0]), 'grass bed cue uses a restrained grey-green difference');
});

test('root envelopes and terrain colour agree across both axes and negative chunk seams', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  for (const [cx, cz, axis] of [[-5, -5, 'x'], [-5, -5, 'z'], [0, 0, 'x'], [0, 0, 'z']]) {
    const a = ocean._terrainGeometry(ocean.generator.chunk(cx, cz));
    const b = ocean._terrainGeometry(ocean.generator.chunk(cx + (axis === 'x' ? 1 : 0), cz + (axis === 'z' ? 1 : 0)));
    try {
      for (let offset = 0; offset < ROW; offset++) {
        const ia = axis === 'x' ? offset * ROW + ROW - 1 : (ROW - 1) * ROW + offset;
        const ib = axis === 'x' ? offset * ROW : offset;
        const ac = a.attributes.color, bc = b.attributes.color;
        assert.equal(ac.getX(ia), bc.getX(ib));
        assert.equal(ac.getY(ia), bc.getY(ib));
        assert.equal(ac.getZ(ia), bc.getZ(ib));
      }
    } finally { a.dispose(); b.dispose(); }
  }
});

test('every authored-reef vertex keeps its exact old white multiplier', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  const geometry = ocean._terrainGeometry(ocean.generator.chunk(0, 0));
  t.after(() => geometry.dispose());
  const positions = geometry.attributes.position, colors = geometry.attributes.color;
  let checked = 0;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    if (Math.hypot(positions.getX(vertex), positions.getZ(vertex)) > 40) continue;
    assert.equal(colors.getX(vertex), 1);
    assert.equal(colors.getY(vertex), 1);
    assert.equal(colors.getZ(vertex), 1);
    checked++;
  }
  assert.ok(checked > 1000);
});

test('recorded bed terrain and scenery bytes survive with explicitly corrected contact Y projected', t => {
  const ocean = new OceanChunks('42');
  t.after(() => ocean.dispose());
  ocean.update({ x: -257, z: -257 });
  const record = ocean._chunks.get('-5,-5'), hash = createHash('sha256');
  for (const name of ['position', 'normal', 'uv']) hash.update(Buffer.from(record.terrainGeometry.attributes[name].array.buffer));
  hash.update(Buffer.from(record.terrainGeometry.index.array.buffer));
  for (const mesh of record.instances) {
    hash.update(mesh.name);
    hash.update(Buffer.from(historicalGroundContactMatrices(mesh, ocean.generator.chunk(-5, -5), ocean.generator).buffer));
    hash.update(Buffer.from(mesh.instanceColor.array.buffer));
  }
  for (const mesh of record.overlays) for (const name of ['position', 'normal', 'color', 'uv']) {
    hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
  }
  assert.equal(hash.digest('hex'), '3a0e299c9ad6f71f72e3e5c44f6be9a6282f2addc6c5624858cc02f34a0571fc',
    'captured before changing the ground-cover colours');
  assert.equal(ocean.stats.prototypeGeometries, 6);
  assert.equal(ocean.stats.prototypeMaterials, 5);
  assert.equal(Object.keys(ocean._textures).length, 1);
  assert.ok(ocean.generator.cacheStats().size <= 32);
});
