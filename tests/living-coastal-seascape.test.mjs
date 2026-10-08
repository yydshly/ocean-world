import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites } from '../src/livingShallowsGeneration.js';
import { createLivingCoastalSeascapePlans, validateLivingCoastalSeascapePlan, sampleLivingCoastalSeascape,
  coastalSeascapeFacies, coastalSeascapeAnimalAllocation, COASTAL_SEASCAPE_ANCHOR, COASTAL_SEASCAPE_ROUTE_STOPS } from '../src/livingCoastalSeascape.js';
import { livingSeabedFloorSurface, livingSeabedFloorVertex } from '../src/livingSeabedRelief.js';
import { oceanRockHeight, oceanRockMesh, oceanRockSurface } from '../src/oceanRockShape.js';

const seed = 'living-shallows-v1|string:42', base = createLivingShallowsGenerator(seed), cx = 150, cz = 4, x0 = cx * 64, z0 = cz * 64;
const originals = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => base.chunk(cx + dx, cz + dz)));
const before = originals.map(c => JSON.stringify(c)), plans = createLivingCoastalSeascapePlans(base, cx, cz), group = plans[0].group;
const byId = new Map(plans.map(p => [p.id, p])), all = plans.flatMap(p => p.elements), added = all.filter(e => e.id.startsWith('coastal:'));
const originalRows = new Map(originals.flatMap(c => c.elements.map(e => [e.id, e]))), owner = (x, z) => byId.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
const floor = (x, z) => livingSeabedFloorSurface(base, owner(x, z), x, z);
const vertex = (x, z) => livingSeabedFloorVertex(base, owner(x, z), x, z);
const radial = e => Math.hypot(e.scale.x, e.scale.z) * .6 + .15;
const ring = (x, z, r) => [{ x, z }, ...Array.from({ length: 12 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 6) * r, z: z + Math.sin(i * Math.PI / 6) * r }))];
function world(e, x, z) { const c = Math.cos(e.rotation), s = Math.sin(e.rotation); return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c }; }
const rocks = all.filter(e => e.kind === 'rock');
function support(x, z) { let y = floor(x, z).height; for (const e of rocks) { if (Math.hypot(e.x - x, e.z - z) > radial(e)) continue; const h = oceanRockHeight(e, x, z); if (h !== null) y = Math.max(y, h); } return y; }
const count = (rows, kind) => rows.filter(e => e.kind === kind).length;
const receipt = { scope: 'CPU native fixed 150,4 twelve-owner geometry; no rendered screenshot or ecological intake claim', sourceSeed: seed };

test('the finite fixed twelve-owner group is deterministic, closed and uses exact twenty-record allocation recipes', t => {
  assert.deepEqual(COASTAL_SEASCAPE_ANCHOR, { cx, cz }); assert.equal(plans.length, 12);
  assert.deepEqual(plans.map(p => p.id), originals.map(c => c.id)); assert.deepEqual(group.ownerIds, originals.map(c => c.id));
  assert.equal(group.widthM, 384); assert.equal(group.depthM, 128); assert.ok(Object.isFrozen(plans));
  assert.equal(createLivingCoastalSeascapePlans(base, cx, cz), plans);
  assert.throws(() => createLivingCoastalSeascapePlans(base, 151, cz), TypeError);
  assert.throws(() => createLivingCoastalSeascapePlans(base, cx, 5), TypeError);
  assert.throws(() => createLivingCoastalSeascapePlans({ profile: 'wrong' }, cx, cz), TypeError);
  const recipes = { reef: [8, 4, 0, 4, 4, 0, 0, 0], sand: [8, 0, 0, 4, 4, 4, 0, 0], meadow: [6, 0, 0, 3, 4, 4, 3, 0], slope: [4, 0, 3, 3, 2, 0, 0, 8] };
  for (const p of plans) {
    assert.equal(p.version, 7); assert.equal(p.theme, 'living-coastal-seascape'); assert.equal(p.floorPatch.heights.length, 65 * 65);
    assert.equal(new Set(p.elements.map(e => e.id)).size, p.elements.length); assert.ok(Object.isFrozen(p.elements));
    for (const [kind, cap] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(count(p.elements, kind) <= cap, `${p.id}:${kind}`);
    const a = coastalSeascapeAnimalAllocation(p); assert.deepEqual(p.animalAllocation, a);
    assert.deepEqual(['native', 'guild', 'openWater', 'diversity', 'benthic', 'meadow', 'turtles', 'shoal'].map(k => a[k]), recipes[a.facies]);
    assert.equal(Object.entries(a).filter(([k]) => !['facies', 'total'].includes(k)).reduce((sum, [, n]) => sum + n, 0), 20);
    assert.equal(a.total, 20); assert.ok(Object.isFrozen(a));
  }
  for (const [kind, field] of [['rock', 'addedRockCount'], ['coral', 'addedCoralCount'], ['algae', 'addedAlgaeCount'], ['seagrass', 'addedGrassCount']]) assert.equal(count(added, kind), group.metrics[field]);
  assert.ok(count(added, 'rock') >= 12); assert.ok(count(added, 'coral') >= 20); assert.ok(count(added, 'seagrass') >= 80);
  receipt.owners = plans.map(p => ({ id: p.id, allocation: p.animalAllocation, counts: Object.fromEntries(Object.keys(LIVING_SHALLOWS_ELEMENT_LIMITS).map(k => [k, count(p.elements, k)])) }));
  receipt.entities = group.metrics; t.diagnostic(`actual added rocks=${count(added, 'rock')}, corals=${count(added, 'coral')}, rooted grass=${count(added, 'seagrass')}`);
});

test('shared Float32 relief joins all internal seams and preserves the outer sixteen metres of original bed', t => {
  let min = Infinity, max = -Infinity, grade = 0, displacedSeamVertices = 0;
  for (let z = 0; z <= 128; z++) for (let x = 0; x <= 384; x++) {
    const y = vertex(x0 + x, z0 + z), old = base.floorVertex(x0 + x, z0 + z), delta = y - old;
    assert.equal(Math.fround(y), y); min = Math.min(min, delta); max = Math.max(max, delta);
    if (x <= 16 || x >= 368 || z <= 16 || z >= 112) assert.equal(y, old);
    if (x > 0 && x < 384 && x % 64 === 0 && Math.abs(delta) > .1) displacedSeamVertices++;
    if (x < 384 && z < 128) { const b = vertex(x0 + x + 1, z0 + z), c = vertex(x0 + x, z0 + z + 1), d = vertex(x0 + x + 1, z0 + z + 1); grade = Math.max(grade, Math.hypot(b - y, c - y), Math.hypot(d - c, d - b)); }
  }
  assert.equal(max - min, group.deltaSpanM); assert.ok(max - min > 3); assert.equal(grade, group.maxSlope); assert.ok(grade <= .65); assert.ok(displacedSeamVertices > 20);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) for (let i = 0; i < 65; i++) assert.equal(plans[row * 6 + col].floorPatch.heights[i * 65 + 64], plans[row * 6 + col + 1].floorPatch.heights[i * 65]);
  for (let col = 0; col < 6; col++) for (let i = 0; i < 65; i++) assert.equal(plans[col].floorPatch.heights[64 * 65 + i], plans[col + 6].floorPatch.heights[i]);
  receipt.floor = { deltaSpanM: max - min, maximumTriangleGrade: grade, displacedSeamVertices, outerGuardM: 16 };
  t.diagnostic(`actual bed delta span=${max - min}m, max grade=${grade}`);
});

test('retained boundary hosts and their attachments keep literal descriptors and complete original support footprints', () => {
  const retainedIds = new Set(group.retainedBoundaryIds);
  for (const id of retainedIds) { const e = originalRows.get(id), saved = all.find(q => q.id === id); assert.ok(e); assert.deepEqual(saved, e);
    for (const q of ring(e.x, e.z, radial(e))) assert.deepEqual(floor(q.x, q.z), base.floorSurface(q.x, q.z), `${id}:complete footprint`);
    for (const attached of originalRows.values()) if (attached.attachmentId === id) assert.ok(retainedIds.has(attached.id));
  }
  for (const e of originalRows.values()) {
    const r = radial(e), boundary = e.x - r < x0 + 16 || e.x + r > x0 + 368 || e.z - r < z0 + 16 || e.z + r > z0 + 112;
    if (boundary) assert.ok(retainedIds.has(e.id));
    if (!retainedIds.has(e.id)) assert.ok(!all.some(q => q.id === e.id), 'reorganized interior must not move an original ID');
  }
  for (let i = 0; i < originals.length; i++) assert.equal(JSON.stringify(base.chunk(originals[i].cx, originals[i].cz)), before[i]);
  for (const p of [[x0 - .1, z0 + 48], [x0 + 384.1, z0 + 75], [x0 + 130, z0 - .1], [x0 + 220, z0 + 128.1]]) assert.deepEqual(floor(...p), base.floorSurface(...p));
  receipt.retainedBoundaryCount = retainedIds.size;
});

test('the actual connected 3D route is 300–500m with bed+2m camera height and full one-metre entity clearance', t => {
  const path = group.routePath, blockers = all.filter(e => ['coral', 'seagrass', 'algae', 'bottle', 'driftwood'].includes(e.kind));
  let length = 0, maximumGap = 0, probes = 0;
  for (const [i, p] of path.entries()) {
    assert.ok(owner(p.x, p.z)); assert.equal(p.bedY, floor(p.x, p.z).height); assert.equal(p.y, p.bedY + 2);
    if (i) { const a = path[i - 1], gap = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z); length += gap; maximumGap = Math.max(maximumGap, gap); assert.ok(gap <= 2); }
    assert.equal(p.sM, length);
    for (const q of ring(p.x, p.z, 1)) { probes++; assert.ok(support(q.x, q.z) <= floor(q.x, q.z).height + .035); }
    for (const e of blockers) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) > radial(e) + 1, `${e.id}:route body`);
  }
  assert.ok(length >= 300 && length <= 500); assert.equal(length, group.routeLengthM); assert.equal(maximumGap, group.pathMetrics.maximumPointGapM);
  assert.equal(probes, group.pathMetrics.clearChecks); assert.equal(group.pathMetrics.bodyRadiusM, 1); assert.equal(group.pathMetrics.cameraHeightM, 2);
  const stop = COASTAL_SEASCAPE_ROUTE_STOPS[0]; assert.equal(stop.id, 'coastal-life-belt'); assert.equal(stop.x, path[0].x); assert.equal(stop.z, path[0].z); assert.equal(stop.heading, path[0].heading);
  assert.equal(group.route[0].y, path[0].y); assert.equal(group.route[0].heading, path[0].heading);
  receipt.route = { first: path[0], last: path.at(-1), lengthM: length, pointCount: path.length, maximumGapM: maximumGap, bodyRadiusM: 1, cameraHeightM: 2, actualSupportProbes: probes };
  t.diagnostic(`actual 3D connected route=${length}m, ${path.length} points, maximum point gap=${maximumGap}m`);
});

test('new irregular rock shoulders are grounded and attached coral or algae roots use the same actual host surface', () => {
  const newRocks = added.filter(e => e.kind === 'rock');
  for (const e of newRocks) {
    assert.ok(['natural-a', 'natural-b', 'natural-c'].includes(e.profile)); assert.ok(e.scale.x >= 8 && e.scale.x <= 12);
    let closest = Infinity; const mesh = oceanRockMesh(e.profile);
    for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) { const q = world(e, mesh.positions[i], mesh.positions[i + 2]), gap = floor(q.x, q.z).height - e.y; assert.ok(gap >= .06 - 1e-9); closest = Math.min(closest, gap); }
    assert.ok(Math.abs(closest - .06) < 1e-9);
  }
  for (const e of added.filter(e => ['coral', 'algae'].includes(e.kind))) {
    const host = newRocks.find(r => r.id === e.attachmentId); assert.ok(host); assert.ok(Math.abs(oceanRockHeight(host, e.x, e.z) - e.y) < 1e-6);
    if (e.kind === 'algae') { const s = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z), q = world(host, e.surfaceLocal.x, e.surfaceLocal.z); assert.equal(e.x, q.x); assert.equal(e.z, q.z); assert.equal(e.y, host.y + s.height * host.scale.y); assert.ok(Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) < 1e-12); }
  }
});

test('the meadow has a thick core, a thin edge and full soft-floor root support while native activity gaps remain open', () => {
  const grass = added.filter(e => e.kind === 'seagrass'), dense = grass.filter(e => e.meadowBand === 'dense-core'), edge = grass.filter(e => e.meadowBand === 'thin-edge');
  assert.ok(dense.length > 0 && edge.length > 0); assert.equal(dense.length, group.metrics.denseGrassCount); assert.equal(edge.length, group.metrics.edgeGrassCount);
  const mean = rows => rows.reduce((sum, e) => sum + e.scale.y, 0) / rows.length; assert.ok(mean(dense) > mean(edge));
  const sites = new Map(plans.map(p => [p.id, livingShallowsSoftActivitySites(seed, p.cx, p.cz)]));
  for (const e of grass) { const r = radial(e); assert.equal(e.y, floor(e.x, e.z).height);
    for (const q of ring(e.x, e.z, r)) { const d = base.surfaceY - floor(q.x, q.z).height; assert.ok(d >= 3 && d <= 20); assert.ok(support(q.x, q.z) <= floor(q.x, q.z).height + .035); }
    for (const q of sites.get(owner(e.x, e.z).id)) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) >= r + .32);
    for (const [x, z] of [[-.5, -.5], [-.5, .5], [.5, -.5], [.5, .5]]) { const q = world(e, x, z); assert.ok(support(q.x, q.z) <= floor(q.x, q.z).height + .035); }
  }
  receipt.meadow = { denseCount: dense.length, thinEdgeCount: edge.length, denseMeanHeightM: mean(dense), edgeMeanHeightM: mean(edge), softRootCount: grass.length };
});

test('the shared four-facies composition is backed by real entities and actual floor or hard support determines sampled habitat', () => {
  for (const f of ['reef', 'sand', 'meadow', 'slope']) {
    const rows = all.filter(e => coastalSeascapeFacies(plans[0], e.x, e.z).dominant === f); assert.ok(count(rows, 'rock') > 0);
    for (const k of ['rock', 'coral', 'seagrass', 'algae', 'rubble']) assert.equal(count(rows, k), group.metrics.byFacies[f][k]);
  }
  for (const p of plans) for (const q of group.routePath.filter((_, i) => i % 40 === 0)) assert.deepEqual(coastalSeascapeFacies(p, q.x, q.z), coastalSeascapeFacies(plans[0], q.x, q.z));
  for (const e of added.filter(e => e.kind === 'rock')) assert.equal(sampleLivingCoastalSeascape(base, owner(e.x, e.z), e.x, e.z).substrate, 'rock');
  for (const p of plans) for (const q of [{ x: p.cx * 64 + 32, z: p.cz * 64 + 32 }, ...p.elements.filter(e => e.kind === 'seagrass').slice(0, 2)]) { const s = sampleLivingCoastalSeascape(base, p, q.x, q.z); if (coastalSeascapeFacies(p, q.x, q.z).influence) assert.equal(s.floorY, floor(q.x, q.z).height); else assert.deepEqual(s, base.sample(q.x, q.z)); assert.equal(s.depthM, base.surfaceY - s.floorY); }
  for (const q of [[x0 + 8.1, z0 + 48.2], [x0 + 375.1, z0 + 84.2]]) assert.deepEqual(sampleLivingCoastalSeascape(base, owner(...q), ...q), base.sample(...q));
  assert.throws(() => coastalSeascapeFacies(plans[0], NaN, z0), RangeError);
  assert.ok(!Object.hasOwn(plans[0], 'agents')); assert.ok(!Object.hasOwn(plans[0], 'resources'));
});

test('canonical saved geometry rejects fabricated floor, path, roots or allocation and preserves the literal closed v6 source', async () => {
  for (const p of plans) assert.ok(validateLivingCoastalSeascapePlan(base, structuredClone(p)));
  const p = plans.find(q => q.newRockIds.length), reject = mutate => { const q = structuredClone(p); mutate(q); assert.equal(validateLivingCoastalSeascapePlan(base, q), false); };
  reject(q => q.floorPatch.heights[65 * 30 + 30] += .01); reject(q => q.group.ownerIds.pop());
  reject(q => q.group.routePath[0].y += .01); reject(q => q.group.routePath[100].x += .01); reject(q => q.group.routeLengthM = 400);
  reject(q => q.group.controls.amplitude += .01); reject(q => q.elements.find(e => q.newRockIds.includes(e.id)).y += .01);
  reject(q => q.elements.find(e => e.kind === 'coral' && e.id.startsWith('coastal:')).attachmentId = 'fake-host');
  reject(q => q.animalAllocation.native += 1); reject(q => q.group.coverElements.pop()); reject(q => q.group.unknownField = true);
  reject(q => q.seed += ':other'); reject(q => q.baseStamp += ':changed'); assert.equal(validateLivingCoastalSeascapePlan(base, null), false);
  for (let i = 0; i < originals.length; i++) assert.equal(JSON.stringify(base.chunk(originals[i].cx, originals[i].cz)), before[i]);
  const bytes = await readFile(new URL('../src/livingShallowSeascape.js', import.meta.url)), hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, '67bc701f098708a64a59372fb7067198b19718700f01e29bd7115957584a5049'); receipt.immutableV6SHA256 = hash;
  if (process.env.LIVING_COASTAL_SEASCAPE_GEOMETRY_RECEIPT) await writeFile(process.env.LIVING_COASTAL_SEASCAPE_GEOMETRY_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});
