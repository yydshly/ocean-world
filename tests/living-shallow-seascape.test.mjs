import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites,
  livingShallowsPropWorldVertex } from '../src/livingShallowsGeneration.js';
import { createLivingShallowSeascapePlans, validateLivingShallowSeascapePlan, sampleLivingShallowSeascape,
  shallowSeascapeFacies, SHALLOW_SEASCAPE_ANCHOR, SHALLOW_SEASCAPE_ROUTE_STOPS } from '../src/livingShallowSeascape.js';
import { livingSeabedFloorSurface, livingSeabedFloorVertex } from '../src/livingSeabedRelief.js';
import { oceanRockHeight, oceanRockSurface, oceanRockMesh } from '../src/oceanRockShape.js';
import { sceneElementHeight, sceneElementMesh } from '../src/oceanSceneElements.js';

const seed = 'living-shallows-v1|string:42', base = createLivingShallowsGenerator(seed);
const cx = 96, cz = 2, x0 = cx * 64, z0 = cz * 64;
const originals = [], ids = [];
for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) {
  const c = base.chunk(cx + dx, cz + dz); originals.push(c); ids.push(c.id);
}
const before = originals.map(c => JSON.stringify(c));
const plans = createLivingShallowSeascapePlans(base, cx, cz), byId = new Map(plans.map(p => [p.id, p]));
const originalIds = new Set(originals.flatMap(c => c.elements.map(e => e.id))), all = plans.flatMap(p => p.elements);
const added = all.filter(e => !originalIds.has(e.id));
const owner = (x, z) => byId.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
const floor = (x, z) => livingSeabedFloorSurface(base, owner(x, z), x, z);
const vertex = (x, z) => livingSeabedFloorVertex(base, owner(x, z), x, z);
const ring = (x, z, r) => [{ x, z }, ...Array.from({ length: 8 }, (_, i) => ({
  x: x + Math.cos(i * Math.PI / 4) * r, z: z + Math.sin(i * Math.PI / 4) * r }))];
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s,
    z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}
function support(rows, x, z) {
  let y = floor(x, z).height;
  for (const e of rows) {
    if (!['rock', 'bottle', 'driftwood'].includes(e.kind)) continue;
    const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true);
    if (h !== null) y = Math.max(y, h);
  }
  return y;
}

test('one deterministic aligned twelve-owner group contains real macroscopic geometry and native budgets', t => {
  assert.deepEqual(SHALLOW_SEASCAPE_ANCHOR, { cx, cz }); assert.deepEqual(plans.map(p => p.id), ids);
  assert.deepEqual(plans[0].group.ownerIds, ids); assert.equal(plans[0].group.widthM, 384); assert.equal(plans[0].group.depthM, 128);
  assert.equal(plans.length, 12); assert.ok(Object.isFrozen(plans));
  assert.deepEqual(SHALLOW_SEASCAPE_ROUTE_STOPS, plans[0].group.route);
  assert.equal(JSON.stringify(createLivingShallowSeascapePlans(base, cx, cz)), JSON.stringify(plans));
  assert.throws(() => createLivingShallowSeascapePlans(base, 97, cz), TypeError);
  assert.throws(() => createLivingShallowSeascapePlans(base, cx, 3), TypeError);
  assert.throws(() => createLivingShallowSeascapePlans({ profile: 'wrong' }, cx, cz), TypeError);
  for (const p of plans) {
    assert.equal(p.version, 6); assert.equal(p.theme, 'complete-shallow-seascape'); assert.equal(p.floorPatch.heights.length, 65 * 65);
    assert.equal(new Set(p.elements.map(e => e.id)).size, p.elements.length);
    for (const [kind, limit] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(p.elements.filter(e => e.kind === kind).length <= limit);
  }
  const counts = kind => added.filter(e => e.kind === kind).length;
  assert.ok(counts('rock') >= 8); assert.ok(counts('coral') >= 20); assert.ok(counts('seagrass') >= 200);
  assert.equal(counts('rock'), plans[0].group.metrics.addedRockCount);
  assert.equal(counts('coral'), plans[0].group.metrics.addedCoralCount);
  assert.equal(counts('seagrass'), plans[0].group.metrics.addedGrassCount);
  t.diagnostic(`actual additions: rocks=${counts('rock')}, attached corals=${counts('coral')}, algae=${counts('algae')}, rooted grass=${counts('seagrass')}`);
});

test('the full shared Float32 bed has real relief, all sixteen internal seams match, and outer sixteen metres are baseline', t => {
  let min = Infinity, max = -Infinity, grade = 0, changedInternal = 0;
  for (let z = 0; z <= 128; z++) for (let x = 0; x <= 384; x++) {
    const y = vertex(x0 + x, z0 + z), old = base.floorVertex(x0 + x, z0 + z), delta = y - old;
    assert.equal(Math.fround(y), y); min = Math.min(min, delta); max = Math.max(max, delta);
    if (x <= 16 || x >= 368 || z <= 16 || z >= 112) assert.equal(y, old);
    if (x > 0 && x < 384 && x % 64 === 0 && Math.abs(delta) > .1) changedInternal++;
    if (x < 384 && z < 128) {
      const b = vertex(x0 + x + 1, z0 + z), c = vertex(x0 + x, z0 + z + 1), d = vertex(x0 + x + 1, z0 + z + 1);
      grade = Math.max(grade, Math.hypot(b - y, c - y), Math.hypot(d - c, d - b));
    }
  }
  assert.equal(max - min, plans[0].group.deltaSpanM); assert.ok(max - min > 3);
  assert.equal(grade, plans[0].group.maxSlope); assert.ok(grade <= .65); assert.ok(changedInternal > 20);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
    const a = plans[row * 6 + col], b = plans[row * 6 + col + 1];
    for (let i = 0; i < 65; i++) assert.equal(a.floorPatch.heights[i * 65 + 64], b.floorPatch.heights[i * 65]);
  }
  for (let col = 0; col < 6; col++) for (let i = 0; i < 65; i++)
    assert.equal(plans[col].floorPatch.heights[64 * 65 + i], plans[col + 6].floorPatch.heights[i]);
  t.diagnostic(`384 by 128m actual bed: delta span=${max - min}m, maximum triangle grade=${grade}, changed internal seam vertices=${changedInternal}`);
});

test('every original host, attached colony, grass root and prop retains its full support footprint and original descriptor', () => {
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i], old = originals[i];
    assert.deepEqual(p.retainedRockIds, old.elements.filter(e => e.kind === 'rock').map(e => e.id));
    for (const e of old.elements) {
      const saved = p.elements.find(q => q.id === e.id); assert.ok(saved);
      assert.deepEqual(saved, e.kind === 'rubble' ? { ...e, y: floor(e.x, e.z).height } : e);
      if (e.kind === 'rubble') continue;
      for (const [lx, lz] of [[0, 0], [-.5, -.5], [-.5, .5], [.5, -.5], [.5, .5], [-.49, 0], [.49, 0], [0, -.49], [0, .49]]) {
        const q = world(e, lx, lz); assert.deepEqual(floor(q.x, q.z), base.floorSurface(q.x, q.z), e.id);
      }
    }
    assert.equal(JSON.stringify(base.chunk(p.cx, p.cz)), before[i]);
  }
});

test('new actual irregular rock meshes are grounded and their new coral and algae attach to the same physical surface', () => {
  const rocks = added.filter(e => e.kind === 'rock');
  for (const e of rocks) {
    assert.ok(['natural-a', 'natural-b', 'natural-c'].includes(e.profile)); assert.ok(e.scale.x >= 9 && e.scale.x <= 14);
    let tightest = Infinity; const mesh = oceanRockMesh(e.profile);
    for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) {
      const p = world(e, mesh.positions[i], mesh.positions[i + 2]), clearance = floor(p.x, p.z).height - e.y;
      assert.ok(clearance >= .06 - 1e-9); tightest = Math.min(tightest, clearance);
    }
    assert.ok(Math.abs(tightest - .06) < 1e-9);
  }
  for (const e of added.filter(e => e.kind === 'coral' || e.kind === 'algae')) {
    const host = rocks.find(r => r.id === e.attachmentId); assert.ok(host);
    assert.ok(Math.abs(oceanRockHeight(host, e.x, e.z) - e.y) < 1e-6);
    assert.ok(Math.abs(support(all, e.x, e.z) - e.y) < 1e-6);
    if (e.kind === 'algae') {
      const s = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z), p = world(host, e.surfaceLocal.x, e.surfaceLocal.z);
      assert.ok(Math.abs(p.x - e.x) < 1e-9); assert.ok(Math.abs(p.z - e.z) < 1e-9);
      assert.equal(e.y, host.y + s.height * host.scale.y); assert.ok(Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) < 1e-12);
    }
  }
});

test('the new meadow has actual nine-point soft support and activity gaps; the measured sand corridor has body clearance', t => {
  const sitesById = new Map(plans.map(p => [p.id, livingShallowsSoftActivitySites(seed, p.cx, p.cz).filter(s =>
    ring(s.x, s.z, .6).every(q => support(all, q.x, q.z) <= floor(q.x, q.z).height + .035))]));
  for (const e of added.filter(e => e.kind === 'seagrass')) {
    const r = Math.max(e.scale.x, e.scale.z) * .5;
    assert.equal(e.y, floor(e.x, e.z).height);
    for (const p of ring(e.x, e.z, r)) {
      const s = sampleLivingShallowSeascape(base, owner(p.x, p.z), p.x, p.z);
      assert.notEqual(s.substrate, 'rock'); assert.ok(s.depthM >= 3 && s.depthM <= 20);
      assert.ok(support(all, p.x, p.z) <= floor(p.x, p.z).height + .035);
    }
    for (const [x, z] of [[-.5, -.5], [-.5, .5], [.5, -.5], [.5, .5]]) {
      const p = world(e, x, z); assert.ok(support(all, p.x, p.z) <= floor(p.x, p.z).height + .035);
    }
    for (const p of sitesById.get(owner(e.x, e.z).id)) assert.ok(Math.hypot(p.x - e.x, p.z - e.z) >= r + .32);
  }
  const corridor = plans[0].group.corridor; assert.equal(corridor.lengthM, 32); assert.equal(corridor.openingM, 4);
  assert.equal(corridor.clearSamples, corridor.samples.length);
  for (const p of corridor.samples) for (const q of ring(p.x, p.z, corridor.bodyRadiusM)) {
    assert.equal(p.y, floor(p.x, p.z).height); assert.ok(support(all, q.x, q.z) <= floor(q.x, q.z).height + .035);
  }
  t.diagnostic(`actual continuous sand opening=${corridor.lengthM}m by ${corridor.openingM}m; nine-probe positions=${corridor.samples.length}`);
});

test('all four world facies remain continuous across owners; actual support decides substrate and sparse discoveries are grounded', () => {
  for (const p of plans) for (const q of plans) for (const point of SHALLOW_SEASCAPE_ROUTE_STOPS)
    assert.deepEqual(shallowSeascapeFacies(p, point.x, point.z), shallowSeascapeFacies(q, point.x, point.z));
  for (const [i, stop] of SHALLOW_SEASCAPE_ROUTE_STOPS.entries()) {
    const p = owner(stop.x, stop.z), f = shallowSeascapeFacies(p, stop.x, stop.z);
    assert.equal(f.dominant, ['reef', 'sand', 'meadow', 'slope'][i]);
    assert.ok(Math.abs(f.reef + f.sand + f.meadow + f.slope - 1) < 1e-12);
    const kinds = i === 0 || i === 3 ? ['rock', 'coral'] : i === 2 ? ['seagrass'] : ['rock'];
    assert.ok(all.some(e => kinds.includes(e.kind) && Math.hypot(e.x - stop.x, e.z - stop.z) <= 40));
    if (i === 3) {
      const actual = floor(stop.x, stop.z), grade = Math.hypot(actual.normal.x, actual.normal.z) / actual.normal.y;
      assert.ok(actual.height - base.floorSurface(stop.x, stop.z).height < -.6);
      assert.ok(grade > .12 && grade <= .65);
      assert.equal(sampleLivingShallowSeascape(base, p, stop.x, stop.z).substrate, 'sand');
    }
  }
  for (const e of added.filter(e => e.kind === 'rock')) assert.equal(sampleLivingShallowSeascape(base, owner(e.x, e.z), e.x, e.z).substrate, 'rock');
  for (const p of [[x0 + 8.1, z0 + 61.2], [x0 + 371.2, z0 + 63.3]]) {
    assert.equal(shallowSeascapeFacies(plans[0], ...p).influence, 0);
    assert.deepEqual(sampleLivingShallowSeascape(base, owner(...p), ...p), base.sample(...p));
  }
  const far = shallowSeascapeFacies(plans[0], 1e9, -1e9); assert.equal(far.influence, 0);
  assert.ok(['reef', 'sand', 'meadow', 'slope'].every(k => Number.isFinite(far[k])));
  for (const e of all.filter(e => e.kind === 'bottle' || e.kind === 'driftwood')) {
    if (e.kind === 'bottle') { assert.equal(e.physicalState, 'grounded-flooded'); assert.equal(e.flooded, true); assert.equal(e.sealed, false); }
    const mesh = sceneElementMesh(e.kind, e.variant); let nearest = Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = livingShallowsPropWorldVertex(e, mesh.positions, i), gap = e.y + p.y - floor(p.x, p.z).height;
      assert.ok(gap >= -1e-9); nearest = Math.min(nearest, gap);
    }
    assert.ok(nearest < 1e-9);
  }
});

test('canonical saved plans reject fabricated terrain, group members, new roots, attachment and prop physics without mutating base', () => {
  for (const p of plans) assert.ok(validateLivingShallowSeascapePlan(base, structuredClone(p)));
  const p = plans.find(q => q.newRockIds.length), reject = mutate => {
    const q = structuredClone(p); mutate(q); assert.equal(validateLivingShallowSeascapePlan(base, q), false);
  };
  reject(q => q.floorPatch.heights[65 * 30 + 30] += .01); reject(q => q.group.ownerIds.pop());
  reject(q => q.group.controls.amplitude += .01); reject(q => q.elements.find(e => q.newRockIds.includes(e.id)).profile = 'mound');
  reject(q => q.elements.find(e => e.kind === 'coral' && e.id.startsWith('shallow-seascape:')).attachmentId = 'fake-host');
  reject(q => q.group.addedCoverElements.pop()); reject(q => q.seed += ':wrong'); reject(q => q.baseStamp += ':changed');
  const bottleOwner = plans.find(q => q.elements.some(e => e.kind === 'bottle'));
  const badBottle = structuredClone(bottleOwner); badBottle.elements.find(e => e.kind === 'bottle').flooded = false;
  assert.equal(validateLivingShallowSeascapePlan(base, badBottle), false); assert.equal(validateLivingShallowSeascapePlan(base, null), false);
  for (let i = 0; i < plans.length; i++) assert.equal(JSON.stringify(base.chunk(plans[i].cx, plans[i].cz)), before[i]);
});
