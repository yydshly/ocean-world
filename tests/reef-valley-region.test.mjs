import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites } from '../src/livingShallowsGeneration.js';
import { reefValleyRegionOrigin, createReefValleyRegionPlans, validateReefValleyRegionPlan, sampleReefValleyRegion,
  reefValleyFacies, reefValleyAllocation, REEF_VALLEY_REGION_LAYOUT, REEF_VALLEY_REGION_ROUTE_STOPS } from '../src/reefValleyRegion.js';
import { livingSeabedFloorSurface, livingSeabedFloorVertex } from '../src/livingSeabedRelief.js';
import { oceanRockHeight, oceanRockSurface, oceanRockMesh } from '../src/oceanRockShape.js';
import { sceneElementHeight } from '../src/oceanSceneElements.js';

const seed = 'living-shallows-v1|string:42', native = createLivingShallowsGenerator(seed), anchors = [204, 210, 216, 222];
let nativeChunkReads = 0;
const base = { ...native, chunk: (...args) => { nativeChunkReads++; return native.chunk(...args); } };
const oldChunks = anchors.flatMap(cx => [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => base.chunk(cx + dx, 4 + dz))));
const before = oldChunks.map(c => JSON.stringify(c)), oldRows = new Map(oldChunks.flatMap(c => c.elements.map(e => [e.id, e])));
const packs = anchors.map(cx => createReefValleyRegionPlans(base, cx, 4)), plans = packs.flat(), groups = packs.map(p => p[0].group);
const byId = new Map(plans.map(p => [p.id, p])), all = plans.flatMap(p => p.elements), added = all.filter(e => e.id.startsWith('valley:'));
const owner = (x, z) => byId.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
const floor = (x, z) => livingSeabedFloorSurface(base, owner(x, z), x, z), vertex = (x, z) => livingSeabedFloorVertex(base, owner(x, z), x, z);
const radial = e => Math.hypot(e.scale.x, e.scale.z) * .6 + .15;
const ring = (x, z, r) => [{ x, z }, ...Array.from({ length: 12 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 6) * r, z: z + Math.sin(i * Math.PI / 6) * r }))];
function world(e, x, z) { const c = Math.cos(e.rotation), s = Math.sin(e.rotation); return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c }; }
function rowsNearGroup(group) { const rows = [...packs[groups.indexOf(group)].flatMap(p => p.elements)]; for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) { const id = `${group.cx + dx},${group.cz + dz}`; if (group.ownerIds.includes(id)) continue; rows.push(...(byId.get(id)?.elements ?? base.chunk(group.cx + dx, group.cz + dz).elements)); } return rows; }
const rowsByGroup = new Map(groups.map(g => [g.id, rowsNearGroup(g)]));
function support(rows, x, z) { let y = floor(x, z).height; for (const e of rows) { if (!['rock', 'bottle', 'driftwood'].includes(e.kind) || Math.hypot(e.x - x, e.z - z) > radial(e)) continue; const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true); if (h !== null) y = Math.max(y, h); } return y; }
const count = (rows, kind) => rows.filter(e => e.kind === kind).length;
const receipt = { scope: 'Finite CPU geometry of four fixed adjacent coordinate-seeded macro groups; no browser/GPU or ecological population claim', seed, anchors: anchors.map(cx => ({ cx, cz: 4 })) };

test('coordinate-aligned dynamic groups preserve legacy ranges and deterministically generate four real budgeted macro communities', t => {
  assert.equal(REEF_VALLEY_REGION_LAYOUT.maximumCachedGroups, 6);
  assert.equal(reefValleyRegionOrigin(203, 4), null); assert.equal(reefValleyRegionOrigin(150, 4), null);
  assert.equal(reefValleyRegionOrigin(96, 2), null); assert.equal(reefValleyRegionOrigin(NaN, 4), null); assert.equal(reefValleyRegionOrigin(Number.MAX_SAFE_INTEGER, 4), null);
  assert.deepEqual(reefValleyRegionOrigin(-7, -1), { cx: -12, cz: -2, id: 'reef-valley-region:-12,-2', ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${-12 + dx},${-2 + dz}`)) });
  for (const [i, pack] of packs.entries()) {
    assert.equal(createReefValleyRegionPlans(base, anchors[i], 4), pack); assert.ok(Object.isFrozen(pack)); assert.equal(pack.length, 12);
    assert.deepEqual(pack.map(p => p.id), reefValleyRegionOrigin(anchors[i] + 3, 5).ownerIds);
    assert.deepEqual(groups[i].ownerIds, pack.map(p => p.id)); assert.equal(groups[i].widthM, 384); assert.equal(groups[i].depthM, 128);
    for (const p of pack) { assert.equal(p.version, 8); assert.equal(p.theme, 'reef-valley-region'); assert.equal(p.floorPatch.heights.length, 65 * 65); assert.ok(Object.isFrozen(p.elements));
      for (const [kind, cap] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(count(p.elements, kind) <= cap, `${p.id}:${kind}`);
      const a = reefValleyAllocation(p); assert.deepEqual(a, p.animalAllocation); assert.equal(a.total, 20); assert.equal(Object.entries(a).filter(([k]) => !['facies', 'total'].includes(k)).reduce((n, [, v]) => n + v, 0), 20);
      if (a.facies === 'reef') assert.equal(a.shoal, 6); if (a.facies === 'slope') assert.equal(a.shoal, 8);
    }
    assert.ok(groups[i].metrics.reefWallCount > 0 && groups[i].metrics.reefPlateauCount > 0); assert.equal(groups[i].branchPaths.length, 2);
  }
  assert.throws(() => createReefValleyRegionPlans(base, 205, 4), TypeError); assert.throws(() => createReefValleyRegionPlans(base, 204, 5), TypeError);
  assert.throws(() => createReefValleyRegionPlans({ profile: 'wrong' }, 204, 4), TypeError);
  receipt.groups = groups.map(g => ({ id: g.id, ownerIds: g.ownerIds, metrics: g.metrics, allocations: packs[groups.indexOf(g)].map(p => ({ id: p.id, allocation: p.animalAllocation })) }));
  t.diagnostic(`actual groups=${groups.length}, source owners=${plans.length}, added irregular rocks=${count(added, 'rock')}, attached coral=${count(added, 'coral')}, rooted grass=${count(added, 'seagrass')}`);
});

test('all twelve-owner bed grids share literal seams and preserve native outer bands, retained supports and old chunks', () => {
  for (const pack of packs) { const g = pack[0].group; let maximumGrade = 0;
    for (let z = 0; z <= 128; z++) for (let x = 0; x <= 384; x++) { const wx = g.origin.x + x, wz = g.origin.z + z, y = vertex(wx, wz); assert.equal(Math.fround(y), y);
      if (x <= 16 || x >= 368 || z <= 16 || z >= 112) assert.equal(y, base.floorVertex(wx, wz));
      if (x < 384 && z < 128) { const b = vertex(wx + 1, wz), c = vertex(wx, wz + 1), d = vertex(wx + 1, wz + 1); maximumGrade = Math.max(maximumGrade, Math.hypot(b - y, c - y), Math.hypot(d - c, d - b)); }
    }
    assert.ok(maximumGrade <= .65); assert.equal(maximumGrade, g.maxSlope);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) for (let i = 0; i < 65; i++) assert.equal(pack[row * 6 + col].floorPatch.heights[i * 65 + 64], pack[row * 6 + col + 1].floorPatch.heights[i * 65]);
    for (let col = 0; col < 6; col++) for (let i = 0; i < 65; i++) assert.equal(pack[col].floorPatch.heights[64 * 65 + i], pack[col + 6].floorPatch.heights[i]);
    for (const id of g.retainedBoundaryIds) { const e = oldRows.get(id), saved = pack.flatMap(p => p.elements).find(q => q.id === id); assert.ok(e); assert.deepEqual(saved, e);
      for (const q of ring(e.x, e.z, radial(e))) assert.deepEqual(floor(q.x, q.z), base.floorSurface(q.x, q.z), id);
    }
  }
  for (let i = 0; i < packs.length - 1; i++) for (let row = 0; row < 2; row++) for (let z = 0; z < 65; z++) assert.equal(packs[i][row * 6 + 5].floorPatch.heights[z * 65 + 64], packs[i + 1][row * 6].floorPatch.heights[z * 65]);
  for (let i = 0; i < oldChunks.length; i++) assert.equal(JSON.stringify(base.chunk(oldChunks[i].cx, oldChunks[i].cz)), before[i]);
});

test('four actual main paths connect at exact shared world ports for a continuous one-to-two-kilometre native route', t => {
  let totalLengthM = 0, probes = 0, maximumGapM = 0;
  for (const [gi, g] of groups.entries()) { const path = g.routePath, rows = rowsByGroup.get(g.id), blockers = rows.filter(e => ['coral', 'seagrass', 'algae', 'bottle', 'driftwood'].includes(e.kind)); let length = 0;
    for (const [i, p] of path.entries()) { assert.equal(p.y, floor(p.x, p.z).height + 2); assert.equal(p.bedY, p.y - 2);
      if (i) { const a = path[i - 1], gap = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z); length += gap; maximumGapM = Math.max(maximumGapM, gap); assert.ok(gap <= 3); } assert.equal(p.sM, length);
      for (const q of ring(p.x, p.z, 1)) { probes++; assert.ok(support(rows, q.x, q.z) <= floor(q.x, q.z).height + .035); }
      for (const e of blockers) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) > radial(e) + 1, `${e.id}:main route`);
    }
    assert.equal(length, g.routeLengthM); assert.ok(length >= 300 && length <= 600); totalLengthM += length;
    const a = path[0], b = path.at(-1); assert.equal(a.x, g.sharedPorts.west.x); assert.equal(a.z, g.sharedPorts.west.z); assert.equal(b.x, g.sharedPorts.east.x); assert.equal(b.z, g.sharedPorts.east.z);
    if (gi) { const prev = groups[gi - 1]; assert.deepEqual(prev.sharedPorts.east, g.sharedPorts.west); assert.deepEqual({ x: prev.routePath.at(-1).x, y: prev.routePath.at(-1).y, z: prev.routePath.at(-1).z }, { x: a.x, y: a.y, z: a.z }); }
  }
  assert.ok(totalLengthM >= 1000 && totalLengthM <= 2000); const stop = REEF_VALLEY_REGION_ROUTE_STOPS[0]; assert.equal(stop.x, groups[0].routePath[0].x); assert.equal(stop.z, groups[0].routePath[0].z); assert.equal(stop.heading, groups[0].routePath[0].heading);
  receipt.primaryRoute = { lengthM: totalLengthM, maximumGapM, oneMetreProbes: probes, start: groups[0].routePath[0], end: groups.at(-1).routePath.at(-1), sharedPorts: groups.map(g => g.sharedPorts), groups: groups.map(g => ({ id: g.id, lengthM: g.routeLengthM, pointCount: g.routePath.length })) };
  t.diagnostic(`actual connected main-route length=${totalLengthM}m, maximum gap=${maximumGapM}m`);
});

test('each real sand fork rejoins exact main-path points and both its body corridor and finite segment midpoints remain open', () => {
  let forkCount = 0, forkLengthM = 0;
  for (const g of groups) { const rows = rowsByGroup.get(g.id), blockers = rows.filter(e => ['coral', 'seagrass', 'algae', 'driftwood', 'bottle'].includes(e.kind));
    for (const branch of g.branchPaths) { forkCount++; let length = 0;
      for (const endpoint of [branch[0], branch.at(-1)]) assert.ok(g.routePath.some(p => p.x === endpoint.x && p.y === endpoint.y && p.z === endpoint.z));
      for (const [i, p] of branch.entries()) { assert.equal(p.y, floor(p.x, p.z).height + 2); if (i) { const a = branch[i - 1]; length += Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z); for (const q of ring((p.x + a.x) / 2, (p.z + a.z) / 2, 1)) assert.ok(support(rows, q.x, q.z) <= floor(q.x, q.z).height + .035); } assert.equal(p.sM, length);
        for (const q of ring(p.x, p.z, 1)) assert.ok(support(rows, q.x, q.z) <= floor(q.x, q.z).height + .035);
        for (const e of blockers) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) > radial(e) + 1, `${e.id}:branch`);
      }
      assert.ok(length > 35 && length < 150); forkLengthM += length;
    }
  }
  assert.equal(forkCount, 8); receipt.forks = { count: forkCount, totalLengthM: forkLengthM, exactMainPathJunctions: true };
});

test('large physical reef-wall and plateau meshes are grounded and their coral/algae use real attachment surfaces', () => {
  const newRocks = added.filter(e => e.kind === 'rock');
  for (const e of newRocks) { assert.ok(['reef-wall', 'reef-plateau'].includes(e.landformRole)); assert.ok(e.scale.x >= 12 && e.scale.x <= 19); assert.ok(e.scale.y >= 3.8 && e.scale.y <= 7); let closest = Infinity;
    const mesh = oceanRockMesh(e.profile); for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) { const q = world(e, mesh.positions[i], mesh.positions[i + 2]), gap = floor(q.x, q.z).height - e.y; assert.ok(gap >= .06 - 1e-9); closest = Math.min(closest, gap); } assert.ok(Math.abs(closest - .06) < 1e-9);
  }
  for (const e of added.filter(e => ['coral', 'algae'].includes(e.kind))) { const host = newRocks.find(r => r.id === e.attachmentId); assert.ok(host); assert.ok(Math.abs(oceanRockHeight(host, e.x, e.z) - e.y) < 1e-6);
    if (e.kind === 'algae') { const s = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z), q = world(host, e.surfaceLocal.x, e.surfaceLocal.z); assert.equal(e.x, q.x); assert.equal(e.z, q.z); assert.equal(e.y, host.y + s.height * host.scale.y); assert.ok(Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) < 1e-12); }
  }
});

test('coordinate-seeded grass cores and edges use actual full soft support without erasing activity gaps or turning scenery into biomass', () => {
  for (const pack of packs) { const g = pack[0].group, rows = rowsByGroup.get(g.id), grass = pack.flatMap(p => p.elements).filter(e => e.kind === 'seagrass' && e.id.startsWith('valley:'));
    const dense = grass.filter(e => e.meadowBand === 'dense-core'), edge = grass.filter(e => e.meadowBand === 'thin-edge'); assert.ok(dense.length > 0 && edge.length > 0);
    const mean = rows => rows.reduce((n, e) => n + e.scale.y, 0) / rows.length; assert.ok(mean(dense) > mean(edge));
    for (const e of grass) { assert.equal(e.y, floor(e.x, e.z).height); const r = radial(e);
      for (const q of ring(e.x, e.z, r)) { const depth = base.surfaceY - floor(q.x, q.z).height; assert.ok(depth >= 3 && depth <= 20); assert.ok(support(rows, q.x, q.z) <= floor(q.x, q.z).height + .035); }
      for (const a of livingShallowsSoftActivitySites(seed, owner(e.x, e.z).cx, owner(e.x, e.z).cz)) assert.ok(Math.hypot(e.x - a.x, e.z - a.z) >= r + .32);
    }
    for (const p of pack) { assert.ok(!Object.hasOwn(p, 'agents')); assert.ok(!Object.hasOwn(p, 'resources')); }
  }
  receipt.plants = { rootedGrass: count(added, 'seagrass'), denseCore: groups.reduce((n, g) => n + g.metrics.denseGrassCount, 0), thinEdge: groups.reduce((n, g) => n + g.metrics.edgeGrassCount, 0), scope: 'persistent scenery, not measured or simulated plant biomass' };
});

test('world-coordinate facies are shared and actual support—not a label—decides substrate across macro boundaries', () => {
  for (const pack of packs) { const g = pack[0].group;
    for (const p of pack) for (const q of g.routePath.filter((_, i) => i % 80 === 0)) assert.deepEqual(reefValleyFacies(p, q.x, q.z), reefValleyFacies(pack[0], q.x, q.z));
    for (const e of pack.flatMap(p => p.elements).filter(e => e.kind === 'rock' && e.id.startsWith('valley:'))) assert.equal(sampleReefValleyRegion(base, owner(e.x, e.z), e.x, e.z).substrate, 'rock');
    for (const q of [{ x: g.origin.x + 8.1, z: g.origin.z + 45.2 }, { x: g.origin.x + 375.1, z: g.origin.z + 73.2 }]) assert.deepEqual(sampleReefValleyRegion(base, owner(q.x, q.z), q.x, q.z), base.sample(q.x, q.z));
    for (const p of pack) { const x = p.cx * 64 + 32, z = p.cz * 64 + 32, s = sampleReefValleyRegion(base, p, x, z); assert.equal(s.floorY, floor(x, z).height); assert.equal(s.depthM, base.surfaceY - s.floorY); }
  }
  assert.throws(() => reefValleyFacies(plans[0], NaN, 0), RangeError); assert.notDeepEqual(packs[0][0].elements, packs[1][0].elements);
});

test('canonical closed plans reject modified roster, terrain, branches, ports and budgets while original v6/v7 sources remain literal', async () => {
  const beforeSpatialIndexHashes = ['619ef98364abe53575cc7585275056b5b2b112a23badc58764f6e860f15859f6', 'dd31f92a8169f8d1bd6eb862763f1ddcb5ca4d0b371af8fca5d3fe10e845bf50', '3d6dd3e7868efd755eb71d19624049a9f695229caf975e8443f457b2abc59941'];
  receipt.planHashes = packs.map((pack, i) => { const hash = createHash('sha256').update(JSON.stringify(pack)).digest('hex');
    if (i < beforeSpatialIndexHashes.length) assert.equal(hash, beforeSpatialIndexHashes[i], 'candidate culling preserves the complete previous deterministic geometry');
    return { cx: anchors[i], cz: 4, hash };
  });
  const readsBeforeCachedModels = nativeChunkReads;
  for (const [i, pack] of packs.entries()) assert.equal(createReefValleyRegionPlans(base, anchors[i], 4), pack);
  for (const pack of packs) for (const p of pack) assert.ok(validateReefValleyRegionPlan(base, structuredClone(p)));
  assert.equal(nativeChunkReads, readsBeforeCachedModels, 'cached immutable models and canonical validation must not reread native chunks');
  const mutable = structuredClone(plans[0]); assert.ok(validateReefValleyRegionPlan(base, mutable)); mutable.floorPatch.heights[2000] += .01;
  assert.equal(validateReefValleyRegionPlan(base, mutable), false, 'an already checked mutable history still receives a complete fresh comparison');
  const p = packs[0].find(q => q.newRockIds.length), reject = mutate => { const q = structuredClone(p); mutate(q); assert.equal(validateReefValleyRegionPlan(base, q), false); };
  reject(q => q.floorPatch.heights[65 * 30 + 30] += .01); reject(q => q.group.ownerIds.pop()); reject(q => q.group.cx += 6);
  reject(q => q.group.sharedPorts.east.z += 1); reject(q => q.group.routePath[10].y += 1); reject(q => q.group.branchPaths[0][0].x += 1);
  reject(q => q.elements.find(e => q.newRockIds.includes(e.id)).y += .01); reject(q => q.elements.find(e => q.newRockIds.includes(e.id)).landformRole = 'fake-cave');
  reject(q => q.animalAllocation.shoal = 20); reject(q => q.group.coverElements.pop()); reject(q => q.group.unknownField = true); reject(q => q.seed += ':other');
  assert.equal(validateReefValleyRegionPlan(base, null), false);
  const hashes = {}; for (const [file, expected] of [['livingShallowSeascape.js', '67bc701f098708a64a59372fb7067198b19718700f01e29bd7115957584a5049'], ['livingCoastalSeascape.js', '32bbf2cd2a4d413be439f1c26da1d3dd4e706394171c9edcef52e494c53e9d88']]) { const hash = createHash('sha256').update(await readFile(new URL(`../src/${file}`, import.meta.url))).digest('hex'); assert.equal(hash, expected); hashes[file] = hash; }
  for (let i = 0; i < oldChunks.length; i++) assert.equal(JSON.stringify(base.chunk(oldChunks[i].cx, oldChunks[i].cz)), before[i]); receipt.immutableSources = hashes;
  if (process.env.REEF_VALLEY_REGION_GEOMETRY_RECEIPT) await writeFile(process.env.REEF_VALLEY_REGION_GEOMETRY_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});
