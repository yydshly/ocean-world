import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingSeascapePlans, validateLivingSeascapePlan } from '../src/livingSeascape.js';
import { livingSeabedFloorVertex, livingSeabedFloorSurface, sampleLivingSeabedRelief } from '../src/livingSeabedRelief.js';

const SEED = 'living-shallows-v1|string:42', CX = 54, CZ = 8, X0 = CX * 64, Z0 = CZ * 64;
const base = createLivingShallowsGenerator(SEED);
const ids = ['54,8', '55,8', '54,9', '55,9'];
const original = ids.map(id => { const [cx, cz] = id.split(',').map(Number); return base.chunk(cx, cz); });
const before = original.map(c => JSON.stringify(c));
const plans = createLivingSeascapePlans(base, CX, CZ), byId = new Map(plans.map(p => [p.id, p]));
const ownerAt = (x, z) => byId.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
const surfaceAt = (x, z) => livingSeabedFloorSurface(base, ownerAt(x, z), x, z);
const sampleAt = (x, z) => sampleLivingSeabedRelief(base, ownerAt(x, z), x, z);
const vertexAt = (x, z) => livingSeabedFloorVertex(base, ownerAt(x, z), x, z);
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s,
    z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}

test('one deterministic complete group carries actual gentle macro relief and finite unsuitable groups decline', t => {
  assert.deepEqual(plans.map(p => p.id), ids);
  assert.deepEqual(plans[0].group.ownerIds, ids);
  assert.deepEqual(plans[0].group.nativeHabitatKinds, ['reef', 'sand', 'slope', 'seagrass']);
  assert.equal(plans[0].group.widthM, 128); assert.equal(plans[0].group.outerGuardM, 16);
  assert.equal(plans[0].group.fieldScaleM, 160);
  const independent = createLivingShallowsGenerator(SEED);
  assert.equal(JSON.stringify(createLivingSeascapePlans(independent, CX, CZ)), JSON.stringify(plans));
  assert.equal(createLivingSeascapePlans(base, CX, CZ), plans);
  assert.throws(() => createLivingSeascapePlans(base, CX + 1, CZ), TypeError);
  assert.throws(() => createLivingSeascapePlans(base, 48, 10), RangeError, 'a previously measured unsuitable group declines rather than fabricating a small seam');
  for (const [i, p] of plans.entries()) {
    assert.equal(p.version, 4); assert.equal(p.theme, 'connected-seascape');
    assert.equal(JSON.stringify(base.chunk(p.cx, p.cz)), before[i]);
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.floorPatch.heights));
    assert.equal(p.floorPatch.heights.length, 65 * 65);
    assert.ok(p.floorPatch.heights.every(y => Number.isFinite(y) && Math.fround(y) === y));
    assert.ok(validateLivingSeascapePlan(p, base));
    assert.equal(p.habitatComposition.samples, 64);
    assert.equal(Object.values(p.habitatComposition.habitats).reduce((a, b) => a + b, 0), 64);
    assert.deepEqual(p.newRockIds, []); assert.deepEqual(p.ridgeIds, []);
  }
  let min = Infinity, max = -Infinity, maxSlope = 0;
  for (let z = Z0; z <= Z0 + 128; z++) for (let x = X0; x <= X0 + 128; x++) {
    const delta = vertexAt(x, z) - base.floorVertex(x, z); min = Math.min(min, delta); max = Math.max(max, delta);
    if (x < X0 + 128 && z < Z0 + 128) {
      const a = vertexAt(x, z), b = vertexAt(x + 1, z), c = vertexAt(x, z + 1), d = vertexAt(x + 1, z + 1);
      maxSlope = Math.max(maxSlope, Math.hypot(b - a, c - a), Math.hypot(d - c, d - b));
    }
  }
  assert.equal(max - min, plans[0].group.deltaSpanM); assert.ok(max - min >= 2.3);
  assert.equal(maxSlope, plans[0].group.maxSlope); assert.ok(maxSlope <= .65);
  t.diagnostic(`group ${CX},${CZ}: actual span=${max - min}m; maximum triangle grade=${maxSlope}; original scene descriptors unchanged`);
});

test('all four actual Float32 internal edges match and an independently measured shared seam spans at least twelve metres', t => {
  const [nw, ne, sw, se] = plans;
  for (const [west, east] of [[nw, ne], [sw, se]]) for (let i = 0; i < 65; i++)
    assert.equal(west.floorPatch.heights[i * 65 + 64], east.floorPatch.heights[i * 65]);
  for (const [north, south] of [[nw, sw], [ne, se]]) for (let i = 0; i < 65; i++)
    assert.equal(north.floorPatch.heights[64 * 65 + i], south.floorPatch.heights[i]);
  let longest = 0;
  for (const axis of ['x', 'z']) {
    let start = null, sign = 0;
    for (let i = 16; i <= 113; i++) {
      const x = axis === 'x' ? X0 + 64 : X0 + i, z = axis === 'x' ? Z0 + i : Z0 + 64;
      const delta = i <= 112 ? vertexAt(x, z) - base.floorVertex(x, z) : 0;
      const nextSign = delta >= 1 ? 1 : delta <= -1 ? -1 : 0;
      if (nextSign !== sign || !nextSign) {
        if (start !== null) longest = Math.max(longest, i - 1 - start);
        start = nextSign ? i : null; sign = nextSign;
      }
    }
  }
  assert.equal(longest, plans[0].group.longestInternalSeamM); assert.ok(longest >= 12);
  const seam = plans[0].group.seams.find(s => s.axis === 'z' && s.lengthM >= 12);
  assert.ok(seam); assert.equal(seam.center.z, 576);
  for (const z of [575.23, 575.78, 576.23, 576.78]) {
    const x = seam.center.x, floor = surfaceAt(x, z), fresh = sampleAt(x, z), old = base.sample(x, z);
    assert.ok(Math.abs(floor.height - base.floorSurface(x, z).height) >= 1);
    assert.equal(fresh.floorY, floor.height); assert.equal(fresh.depthM, base.surfaceY - floor.height);
    assert.equal(fresh.bedSlope, Math.hypot(floor.normal.x, floor.normal.z) / floor.normal.y);
    for (const field of ['rockiness', 'seagrassSuitability', 'sandOpening', 'substrate']) assert.equal(fresh[field], old[field]);
    assert.deepEqual(base.coverAt(x, z, fresh), base.coverAt(x, z, old));
  }
  t.diagnostic(`four shared edges: 260 exact Float32 vertex comparisons; actual continuous >=1m internal seam=${longest}m`);
});

test('all native hosts, real hundred-root grass bed and driftwood remain exact on their entire protected floor footprints', t => {
  let grasses = 0, props = 0, hosts = 0, probes = 0, movedRubble = 0;
  for (const [i, p] of plans.entries()) {
    const old = original[i]; assert.equal(p.elements.length, old.elements.length);
    assert.deepEqual(p.elements.map(e => e.id), old.elements.map(e => e.id));
    assert.deepEqual(p.retainedRockIds, old.elements.filter(e => e.kind === 'rock').map(e => e.id));
    for (const [j, e] of p.elements.entries()) {
      if (e.kind === 'rubble') {
        assert.equal(e.y, surfaceAt(e.x, e.z).height);
        assert.deepEqual({ ...e, y: old.elements[j].y }, old.elements[j]);
        if (e.y !== old.elements[j].y) movedRubble++;
      } else assert.deepEqual(e, old.elements[j]);
    }
  }
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) for (const e of base.chunk(CX + dx, CZ + dz).elements) {
    if (!['rock', 'coral', 'algae', 'seagrass', 'driftwood', 'bottle'].includes(e.kind)) continue;
    const r = Math.hypot(e.scale.x, e.scale.z) * .5;
    if (e.x + r < X0 || e.x - r > X0 + 128 || e.z + r < Z0 || e.z - r > Z0 + 128) continue;
    for (const [x, z] of [[0, 0], [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [-.49, 0], [.49, 0], [0, -.49], [0, .49]]) {
      const point = world(e, x, z);
      assert.deepEqual(surfaceAt(point.x, point.z), base.floorSurface(point.x, point.z), `${e.id}: complete original support triangles`);
      assert.deepEqual(sampleAt(point.x, point.z), base.sample(point.x, point.z)); probes++;
    }
    if (e.kind === 'seagrass') grasses++;
    if (e.kind === 'driftwood' || e.kind === 'bottle') props++;
    if (e.kind === 'rock') hosts++;
  }
  assert.ok(grasses >= 100); assert.ok(props >= 1); assert.ok(hosts >= 20); assert.ok(movedRubble > 0);
  for (let z = 0; z <= 128; z++) for (let x = 0; x <= 128; x++) if (x <= 16 || x >= 112 || z <= 16 || z >= 112)
    assert.equal(vertexAt(X0 + x, Z0 + z), base.floorVertex(X0 + x, Z0 + z));
  for (const edge of [-1, -.02, .17, 8.37, 15.29]) for (const along of [4.23, 40.61, 79.32, 123.41]) for (const [x, z] of [
    [X0 + edge, Z0 + along], [X0 + 128 - edge, Z0 + along], [X0 + along, Z0 + edge], [X0 + along, Z0 + 128 - edge]]) {
    assert.deepEqual(surfaceAt(x, z), base.floorSurface(x, z)); assert.deepEqual(sampleAt(x, z), base.sample(x, z));
  }
  t.diagnostic(`protected actual grass=${grasses}; props=${props}; hard hosts=${hosts}; complete footprint probes=${probes}; regrounded original rubble=${movedRubble}`);
});

test('saved validation rejects changed shared grids or hosts, and deterministic replay survives original owner cache eviction', () => {
  const p = plans[0], reject = mutate => { const edited = structuredClone(p); mutate(edited); assert.equal(validateLivingSeascapePlan(edited, base), false); };
  reject(q => q.floorPatch.heights[64 * 65 + 45] = Math.fround(q.floorPatch.heights[64 * 65 + 45] + .01));
  reject(q => q.floorPatch.heights[0] = Infinity); reject(q => q.floorPatch.heights.pop());
  reject(q => q.elements.find(e => e.kind === 'rock').y += .1);
  reject(q => q.elements.find(e => e.kind === 'rubble').y += .1);
  reject(q => q.elements.find(e => e.kind === 'coral').attachmentId = 'invented-host');
  reject(q => q.elements.pop()); reject(q => q.group.ownerIds.pop());
  reject(q => q.group.cx++); reject(q => q.group.longestInternalSeamM = 1);
  reject(q => q.group.controls.amplitudeM += .1); reject(q => q.floorPatch.maxSlope += .1);
  reject(q => q.overview.center.x++); reject(q => q.habitatComposition.minDepthM += .2);
  reject(q => q.seed += '-wrong'); reject(q => q.baseStamp += '-wrong');
  assert.equal(validateLivingSeascapePlan(null, base), false);
  const frozen = JSON.stringify(plans), support = surfaceAt(3502.5, 576.23);
  for (let i = 0; i < 35; i++) base.chunk(100 + i, -100 - i);
  assert.ok(base.cacheStats().size <= 32);
  assert.equal(JSON.stringify(createLivingSeascapePlans(base, CX, CZ)), frozen);
  assert.deepEqual(surfaceAt(3502.5, 576.23), support);
  for (const [i, q] of plans.entries()) {
    assert.equal(JSON.stringify(base.chunk(q.cx, q.cz)), before[i]); assert.ok(validateLivingSeascapePlan(structuredClone(q), base));
  }
});
