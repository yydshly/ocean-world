import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShallowSample } from '../src/shallowSample.js';
import { arrangeShallowSandHabitat } from '../src/shallowSampleSandHabitat.js';
import { shallowMeadowRibbonGeometry as livingShallowsMeadowGeometry } from '../src/world/ShallowMeadowRibbonAssets.js';
import { shallowReefRubbleGeometry } from '../src/world/ShallowLiveReefAssets.js';

function withoutAddition(model) {
  // This test exercises the module both before and after factory integration.
  if (model.sandHabitat) {
    model.grass.splice(0, model.grass.length, ...model.grass.filter(g => !g.sandHabitatPatch));
    model.rubble.splice(0, model.rubble.length, ...model.rubble.filter(r => !r.sandHabitatPatch));
    delete model.sandHabitat;
  }
  return model;
}

test('sediment-edge composition is deterministic, sparse and preserves the authored population and original habitat', () => {
  const a = withoutAddition(createShallowSample(55)), b = withoutAddition(createShallowSample(55));
  const original = JSON.stringify({ agents: a.agents, rocks: a.rocks, corals: a.corals, bed: a.bed,
    grass: a.grass, rubble: a.rubble });
  const grassLength = a.grass.length, rubbleLength = a.rubble.length;
  const result = arrangeShallowSandHabitat(a);
  assert.deepEqual(result, arrangeShallowSandHabitat(b));
  assert.ok(result.grass.length >= 20 && result.grass.length <= 70);
  assert.ok(result.rubble.length >= 25 && result.rubble.length <= 100);
  assert.equal(result.patches.length, 6);
  assert.ok(result.patches.every(p => p.grassCount + p.rubbleCount > 0));
  assert.ok(result.newGrassBatches <= 4, 'short grass must reuse a bounded number of spatial draws');
  assert.equal(JSON.stringify({ agents: a.agents, rocks: a.rocks, corals: a.corals, bed: a.bed,
    grass: a.grass.slice(0, grassLength), rubble: a.rubble.slice(0, rubbleLength) }), original);
  assert.equal(arrangeShallowSandHabitat(a), result);
  assert.equal(a.grass.length, grassLength + result.grass.length, 'repeated integration duplicated grass');
  assert.equal(a.rubble.length, rubbleLength + result.rubble.length, 'repeated integration duplicated fragments');
});

test('new grass roots and complete swaying leaves stay on soft bed; actual broken skeleton vertices fit the bed outside the camera corridor', () => {
  const model = createShallowSample(55), result = arrangeShallowSandHabitat(model);
  const grass = livingShallowsMeadowGeometry(), rubble = shallowReefRubbleGeometry();
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), q = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), path = Array.from({ length: 1001 }, (_, i) => model.path.getPointAt(i / 1000));
  const residents = model.agents.filter(a => a.mode === 'crawl' || a.mode === 'fixed'
    || ['blue-spotted-ray', 'reef-goatfish', 'reef-cuttlefish'].includes(a.speciesId));
  try {
    for (const g of result.grass) {
      assert.equal(g.y, model.floor(g.x, g.z));
      assert.ok(g.height >= .16 && g.height <= .30, 'sand transitions should remain visibly short');
      const p = grass.attributes.position, roots = grass.attributes.rootXZ, co = Math.cos(g.rotation), si = Math.sin(g.rotation);
      for (let i = 0; i < p.count; i++) {
        const rx = g.x + (roots.getX(i) * co + roots.getY(i) * si) * g.width;
        const rz = g.z + (-roots.getX(i) * si + roots.getY(i) * co) * g.width;
        assert.ok(model.surface(rx, rz) - model.floor(rx, rz) <= .002);
        const y = model.floor(rx, rz) + p.getY(i) * g.height;
        for (const sign of [-1, 1]) {
          const localX = p.getX(i) + sign * .07 * p.getY(i) ** 2, localZ = p.getZ(i);
          const x = g.x + (localX * co + localZ * si) * g.width, z = g.z + (-localX * si + localZ * co) * g.width;
          assert.ok(model.surface(x, z) - model.floor(x, z) <= .002);
          assert.ok(y >= model.floor(x, z) - .00200001, 'swaying leaf penetrated the real bed');
        }
      }
    }
    for (const r of result.rubble) {
      q.setFromUnitVectors(up, new THREE.Vector3().fromArray(r.supportNormal)).multiply(turn.setFromAxisAngle(up, r.rotation));
      matrix.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.width, r.height, r.depth));
      const p = rubble.attributes.position;
      let contact = Infinity;
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(matrix);
        const floor = model.floor(point.x, point.z), burial = p.getY(i) < .14 ? .005 : .001;
        assert.ok(model.surface(point.x, point.z) - floor <= .002, 'rubble lies inside a hard reef');
        assert.ok(point.y >= floor - burial - 1e-7, 'fragment penetrated a bed triangle');
        contact = Math.min(contact, point.y - floor);
      }
      assert.ok(contact <= .001, 'fragment pile floats above all bed vertices');
    }
    for (const row of [...result.grass, ...result.rubble]) {
      const radius = row.width * .56, grassRow = result.grass.includes(row);
      assert.ok(path.every(p => Math.hypot(p.x - row.x, p.z - row.z) >= 2.1 + radius - .002));
      for (const a of residents) {
        const sweep = a.mode === 'fixed' ? 0 : a.radius, body = a.clearance?.radius ?? a.sizeM * .7;
        assert.ok(Math.hypot(row.x - a.home.x, row.z - a.home.z) >= radius + sweep + body + (grassRow ? .25 : .12));
      }
    }
  } finally {
    grass.dispose(); rubble.dispose();
  }
});
