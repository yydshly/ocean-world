import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { createDeepSeascapePlans, validateDeepSeascapePlan, deepSeascapeRoute } from '../src/deepSeascape.js';
import { createDeepWholeSeascapePlans, validateDeepWholeSeascapePlan, deepWholeSeascapeRoute,
  DEEP_WHOLE_SEASCAPE_ANCHOR, DEEP_WHOLE_SEASCAPE_OWNERS, DEEP_WHOLE_SEASCAPE_ROUTE_STOPS } from '../src/deepWholeSeascape.js';
import { oceanRockHeight, oceanRockMesh } from '../src/oceanRockShape.js';

const { cx, cz } = DEEP_WHOLE_SEASCAPE_ANCHOR, x0 = cx * 64, z0 = cz * 64;
const g = createDeepOceanGenerator('42', { seascape: true }), base = g.baseGenerator, original = [], before = [];
for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) {
  const c = base.chunk(cx + dx, cz + dz); original.push(c); before.push(JSON.stringify(c));
}
const plans = createDeepWholeSeascapePlans(base, cx, cz), group = plans[0].group,
  byId = new Map(plans.map(p => [p.id, p])), added = plans.flatMap(p => p.elements.filter(e => p.addedRockIds.includes(e.id)));
function vertex(x, z) {
  const ox = Math.min(cx + 5, Math.floor(x / 64)), oz = Math.min(cz + 1, Math.floor(z / 64)), p = byId.get(`${ox},${oz}`);
  return p ? p.floorPatch.heights[(z - oz * 64) * 65 + x - ox * 64] : base.floorVertex(x, z);
}
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}
const publish = () => { g.setSeascapePlans(plans); };

test('one deterministic far aligned group contains actual plain, gentle slope, wide sparse solids and native rubble transition', t => {
  assert.deepEqual(DEEP_WHOLE_SEASCAPE_ANCHOR, { cx: 132, cz: 8 });
  assert.deepEqual(plans.map(p => p.id), DEEP_WHOLE_SEASCAPE_OWNERS); assert.deepEqual(group.ownerIds, DEEP_WHOLE_SEASCAPE_OWNERS);
  assert.equal(plans.length, 12); assert.equal(group.widthM, 384); assert.equal(group.depthM, 128);
  assert.equal(group.nativeRockCount, 52); assert.equal(group.nativeRubbleCount, 142); assert.equal(group.addedRockCount, 4);
  assert.equal(added.length, 4); assert.ok(Object.isFrozen(plans)); assert.ok(Object.isFrozen(plans[0].floorPatch.heights));
  assert.deepEqual(createDeepWholeSeascapePlans(createDeepOceanGenerator('42'), cx, cz), plans);
  assert.throws(() => createDeepWholeSeascapePlans(base, cx + 1, cz), TypeError);
  assert.throws(() => createDeepWholeSeascapePlans(base, cx, cz + 1), TypeError);
  assert.throws(() => createDeepWholeSeascapePlans(base, 0, 0), RangeError);
  assert.throws(() => createDeepWholeSeascapePlans(base, 192, 16), RangeError);
  for (const p of plans) {
    assert.equal(p.version, 2); assert.equal(p.theme, 'deep-whole-seascape'); assert.equal(p.floorPatch.heights.length, 65 * 65);
    assert.equal(p.floorPatch.spacingM, 1); assert.equal(p.elements.filter(e => e.kind === 'rock').length, original.find(c => c.id === p.id).counts.rock + p.addedRockIds.length);
    assert.ok(p.elements.filter(e => e.kind === 'rock').length <= 8); assert.ok(p.elements.filter(e => e.kind === 'rubble').length <= 24);
    assert.equal(new Set(p.elements.map(e => e.id)).size, p.elements.length);
  }
  t.diagnostic(`actual complete source: 52 original rocks/142 rubble; four new 12–18m solids; canonical owner group ${cx},${cz}`);
});

test('all real shared Float32 vertices obey the low-grade bed, sixteen exact seams and original outer sixteen-metre boundary', t => {
  let min = Infinity, max = -Infinity, grade = 0, changedSeamVertices = 0;
  for (let z = 0; z <= 128; z++) for (let x = 0; x <= 384; x++) {
    const y = vertex(x0 + x, z0 + z), old = base.floorVertex(x0 + x, z0 + z), delta = y - old;
    assert.equal(Math.fround(y), y); min = Math.min(min, delta); max = Math.max(max, delta);
    if (x <= 16 || x >= 368 || z <= 16 || z >= 112) assert.equal(y, old);
    if (x > 0 && x < 384 && x % 64 === 0 && Math.abs(delta) > .25) changedSeamVertices++;
    if (x < 384 && z < 128) {
      const b = vertex(x0 + x + 1, z0 + z), c = vertex(x0 + x, z0 + z + 1), d = vertex(x0 + x + 1, z0 + z + 1);
      grade = Math.max(grade, Math.hypot(b - y, c - y), Math.hypot(d - c, d - b));
    }
  }
  assert.equal(max - min, group.deltaSpanM); assert.ok(max - min > .75); assert.equal(grade, group.maxTriangleGrade); assert.ok(grade <= .12);
  assert.ok(changedSeamVertices > 24);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) for (let i = 0; i < 65; i++)
    assert.equal(plans[row * 6 + col].floorPatch.heights[i * 65 + 64], plans[row * 6 + col + 1].floorPatch.heights[i * 65]);
  for (let col = 0; col < 6; col++) for (let i = 0; i < 65; i++)
    assert.equal(plans[col].floorPatch.heights[64 * 65 + i], plans[col + 6].floorPatch.heights[i]);
  t.diagnostic(`actual 385 by 129 Float32 field: relief=${max - min}m; maximum triangle grade=${grade}; changed shared seam vertices=${changedSeamVertices}`);
});

test('every original complete host and rubble footprint plus all vertices of the retained plain owner remain exact', () => {
  publish();
  const plain = byId.get(group.plainOwnerId);
  for (let z = 0; z <= 64; z++) for (let x = 0; x <= 64; x++)
    assert.equal(plain.floorPatch.heights[z * 65 + x], base.floorVertex(plain.cx * 64 + x, plain.cz * 64 + z));
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i], old = original[i]; assert.equal(p.baseStamp, before[i]); assert.deepEqual(p.elements.slice(0, old.elements.length), old.elements);
    assert.equal(JSON.stringify(base.chunk(p.cx, p.cz)), before[i]);
  }
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) for (const e of base.chunk(cx + dx, cz + dz).elements) {
    for (let i = -1; i < 16; i++) {
      const a = i * Math.PI / 8, r = i < 0 ? 0 : .49, p = world(e, Math.cos(a) * r, Math.sin(a) * r);
      assert.deepEqual(g.floorSurface(p.x, p.z), base.floorSurface(p.x, p.z));
      assert.deepEqual(g.supportAt(p.x, p.z), base.supportAt(p.x, p.z), e.id);
    }
  }
});

test('each broad actual rock rim is buried below the same bed and hard support/sample/camera share its physical triangles', () => {
  publish();
  for (const e of added) {
    assert.ok(['mound', 'ridge'].includes(e.profile)); assert.ok(e.scale.x >= 12 && e.scale.x <= 18);
    assert.ok(e.scale.y >= 1.4 && e.scale.y <= 2.2);
    const actual = g.supportAt(e.x, e.z); assert.equal(actual.elementId, e.id); assert.equal(actual.substrate, 'rock');
    assert.equal(actual.height, oceanRockHeight(e, e.x, e.z)); assert.ok(actual.height > g.floorSurface(e.x, e.z).height + .5);
    assert.equal(g.sample(e.x, e.z).habitat, 'deep-hard-bottom'); assert.equal(g.sample(e.x, e.z).floorY, g.floorSurface(e.x, e.z).height);
    assert.ok(g.heightForCamera(e.x, e.z) >= actual.height);
    const mesh = oceanRockMesh(e.profile);
    for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) {
      const p = world(e, mesh.positions[i], mesh.positions[i + 2]); assert.ok(e.y <= g.floorSurface(p.x, p.z).height - .015 + 1e-9);
    }
  }
});

test('four routes are actual seed-derived geometry references with plain/slope support and real outcrop/rubble source IDs', () => {
  publish(); assert.deepEqual(group.route, DEEP_WHOLE_SEASCAPE_ROUTE_STOPS);
  assert.equal(deepWholeSeascapeRoute(base), group.route); assert.deepEqual(g.wholeSeascapeRouteStops, group.route);
  const plain = g.sample(group.plainCenter.x, group.plainCenter.z), slope = g.sample(group.slopeCenter.x, group.slopeCenter.z);
  assert.equal(plain.substrate, 'mud'); assert.ok(plain.slope <= .03); assert.equal(plain.habitat, 'deep-soft-bottom');
  assert.equal(slope.substrate, 'mud'); assert.equal(slope.habitat, 'deep-slope'); assert.ok(slope.slope > .038 && slope.slope <= .11);
  assert.equal(slope.slope, group.slopeCenter.grade);
  assert.ok(g.floorSurface(group.slopeCenter.x, group.slopeCenter.z).height - base.floorSurface(group.slopeCenter.x, group.slopeCenter.z).height >= .25);
  for (const id of group.outcropSourceIds) {
    const e = added.find(e => e.id === id); assert.ok(e); assert.ok(Math.hypot(e.x - group.outcropCenter.x, e.z - group.outcropCenter.z) <= 24);
  }
  const nativeOuter = original.find(c => c.id === group.outerOwnerId);
  assert.ok(group.outerCenter.sourceRubbleIds.length >= 3);
  assert.ok(group.outerCenter.sourceRubbleIds.every(id => nativeOuter.elements.some(e => e.id === id && e.kind === 'rubble')));
  assert.equal(g.supportAt(group.outerCenter.x, group.outerCenter.z).substrate, 'mud');
  for (const [i, p] of group.route.entries()) {
    const id = [group.plainOwnerId, group.slopeOwnerId, group.hardOwnerId, group.outerOwnerId][i];
    assert.equal(`${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`, id);
    assert.equal(`${Math.floor((p.x - 6) / 64)},${Math.floor(p.z / 64)}`, id);
  }
});

test('temporary source rollback, v1 coexistence and repeat publication preserve all old v1 plans, route and public identity', () => {
  const f = createDeepOceanGenerator('42', { seascape: true }), v1 = createDeepSeascapePlans(f, -6, -10), route = deepSeascapeRoute(f);
  const oldSupport = f.supportAt(added[0].x, added[0].z), oldChunk = f.chunk(cx + 4, cz + 1);
  f.setSeascapePlans(v1); const publicV1 = f.seascapePlan(-6, -9), revision = f.seascapeRevision;
  assert.throws(() => f.withSeascapePlans(plans, view => {
    assert.equal(view.seascapeCandidatesActive, true); assert.equal(view.seascapePlan(cx, cz), undefined); assert.equal(view.seascapeRevision, revision);
    assert.equal(view.supportAt(added[0].x, added[0].z).elementId, added[0].id);
    assert.equal(view.chunk(-6, -9), view.baseGenerator.chunk(-6, -9));
    throw new Error('admission failed');
  }), /admission failed/);
  assert.equal(f.seascapePlan(-6, -9), publicV1); assert.equal(f.seascapeRevision, revision);
  assert.deepEqual(f.supportAt(added[0].x, added[0].z), oldSupport); assert.deepEqual(f.chunk(cx + 4, cz + 1), oldChunk);
  f.setSeascapePlans([...v1, ...plans]); assert.equal(f.seascapeRegistryStats().size, 16);
  assert.equal(f.seascapePlan(-6, -9), publicV1); assert.ok(v1.every(p => validateDeepSeascapePlan(p, f.baseGenerator)));
  assert.deepEqual(f.seascapeRouteStops, route); assert.equal(f.seascapeRouteStops.length, 2);
  assert.equal(f.setSeascapePlans(structuredClone([...v1, ...plans]).reverse()), false);
  f.setSeascapePlans(plans); assert.equal(f.seascapeRegistryStats().size, 12); f.clearCache();
  assert.equal(f.supportAt(added[0].x, added[0].z).elementId, added[0].id);
  f.setSeascapePlans([]); assert.deepEqual(f.supportAt(added[0].x, added[0].z), oldSupport);
});

test('saved canonical validation rejects altered shared terrain, native footprints, solids and unsupported route evidence', () => {
  for (const p of plans) assert.ok(validateDeepWholeSeascapePlan(base, structuredClone(p)));
  const p = plans.find(p => p.addedRockIds.length), reject = mutate => {
    const q = structuredClone(p); mutate(q); assert.equal(validateDeepWholeSeascapePlan(base, q), false);
  };
  reject(q => q.floorPatch.heights[32 * 65 + 32] += .01); reject(q => q.floorPatch.heights.pop());
  reject(q => q.group.ownerIds.pop()); reject(q => q.group.maxTriangleGrade = .2); reject(q => q.group.controls.amplitudeM += .1);
  reject(q => q.elements[0].y += .01); reject(q => q.elements.at(-1).y += .01); reject(q => q.elements.at(-1).profile = 'terrace');
  reject(q => q.addedRockIds.pop()); reject(q => q.group.slopeCenter.grade += .1); reject(q => q.group.outerCenter.sourceRubbleIds.push('ghost-rubble'));
  reject(q => q.group.route[0].x += 1); reject(q => q.baseStamp += ':wrong'); reject(q => q.seed = 42);
  assert.equal(validateDeepWholeSeascapePlan(base, null), false); assert.equal(validateDeepWholeSeascapePlan(createDeepOceanGenerator(42), p), false);
  const f = createDeepOceanGenerator('42', { seascape: true }); f.setSeascapePlans(plans); const revision = f.seascapeRevision;
  const corrupt = structuredClone(plans); corrupt[0].floorPatch.heights[0] += .1;
  assert.throws(() => f.setSeascapePlans(corrupt), TypeError); assert.equal(f.seascapeRevision, revision);
  assert.throws(() => f.setSeascapePlans([...plans, plans[0]]), TypeError); assert.throws(() => f.setSeascapePlans(Array(26).fill(plans[0])), TypeError);
});
