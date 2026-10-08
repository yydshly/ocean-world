import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites } from '../src/livingShallowsGeneration.js';
import { seagrassMeadowRegionOrigin, createSeagrassMeadowRegionPlans, validateSeagrassMeadowRegionPlan, sampleSeagrassMeadowRegion,
  seagrassMeadowFacies, seagrassMeadowAllocation, SEAGRASS_MEADOW_REGION_LAYOUT, SEAGRASS_MEADOW_REGION_ROUTE_STOPS } from '../src/seagrassMeadowRegion.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { livingSeabedFloorSurface, livingSeabedFloorVertex } from '../src/livingSeabedRelief.js';
import { oceanRockHeight, oceanRockSurface, oceanRockMesh } from '../src/oceanRockShape.js';
import { sceneElementHeight } from '../src/oceanSceneElements.js';
import { createOceanTurtlePlan, oceanTurtlePositionValid } from '../src/oceanTurtleCommunity.js';

const seed = 'living-shallows-v1|string:42', native = createLivingShallowsGenerator(seed);
let reads = 0;
const base = { ...native, chunk: (...args) => { reads++; return native.chunk(...args); } };
const old = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => base.chunk(228 + dx, 4 + dz))), before = old.map(c => JSON.stringify(c));
const oldRows = new Map(old.flatMap(c => c.elements.map(e => [e.id, e]))), started = performance.now();
const plans = createSeagrassMeadowRegionPlans(base, 228, 4), generationMs = performance.now() - started, group = plans[0].group;
const byId = new Map(plans.map(p => [p.id, p])), all = plans.flatMap(p => p.elements), added = all.filter(e => e.id.startsWith('meadow:'));
const owner = (x, z) => byId.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`), floor = (x, z) => livingSeabedFloorSurface(base, owner(x, z), x, z);
const vertex = (x, z) => livingSeabedFloorVertex(base, owner(x, z), x, z), radial = e => Math.hypot(e.scale.x, e.scale.z) * .6 + .15;
const ring = (x, z, radius) => [{ x, z }, ...Array.from({ length: 12 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 6) * radius, z: z + Math.sin(i * Math.PI / 6) * radius }))];
const external = []; for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) if (!byId.has(`${228 + dx},${4 + dz}`)) external.push(...base.chunk(228 + dx, 4 + dz).elements);
const rows = [...all, ...external], solids = rows.filter(e => ['rock', 'bottle', 'driftwood'].includes(e.kind)), blockers = rows.filter(e => ['coral', 'seagrass', 'algae', 'bottle', 'driftwood'].includes(e.kind));
function support(x, z) { let y = floor(x, z).height; for (const e of solids) { if (Math.hypot(e.x - x, e.z - z) > radial(e)) continue; const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true); if (h !== null) y = Math.max(y, h); } return y; }
function world(e, x, z) { const c = Math.cos(e.rotation), s = Math.sin(e.rotation); return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c }; }
const receipt = { scope: 'Fixed native CPU macro geometry and existing turtle-controller admission; no GPU appearance or persistent animal population claim', seed, generationMs, anchor: { cx: 228, cz: 4 } };

test('new positive meadow strips preserve v8 origins and form one immutable twelve-owner budgeted macro meadow', () => {
  assert.equal(SEAGRASS_MEADOW_REGION_LAYOUT.widthM, 384); assert.equal(SEAGRASS_MEADOW_REGION_LAYOUT.depthM, 128); assert.equal(SEAGRASS_MEADOW_REGION_LAYOUT.maximumCachedGroups, 6);
  for (const cx of [204, 210, 216, 222, 234, 240, 246, 252, -12]) assert.equal(seagrassMeadowRegionOrigin(cx, 4), null);
  assert.equal(seagrassMeadowRegionOrigin(258, 4).cx, 258); assert.equal(seagrassMeadowRegionOrigin(233, 5).cx, 228);
  assert.equal(seagrassMeadowRegionOrigin(NaN, 4), null); assert.equal(seagrassMeadowRegionOrigin(Number.MAX_SAFE_INTEGER, 4), null);
  assert.deepEqual(group.ownerIds, seagrassMeadowRegionOrigin(228, 4).ownerIds); assert.equal(plans.length, 12); assert.ok(Object.isFrozen(plans));
  assert.equal(createSeagrassMeadowRegionPlans(base, 228, 4), plans);
  assert.throws(() => createSeagrassMeadowRegionPlans(base, 229, 4), TypeError); assert.throws(() => createSeagrassMeadowRegionPlans(base, 228, 5), TypeError);
  assert.throws(() => createSeagrassMeadowRegionPlans({ profile: 'wrong' }, 228, 4), TypeError);
  for (const p of plans) { assert.equal(p.version, 9); assert.equal(p.theme, 'seagrass-meadow-region'); assert.equal(p.floorPatch.heights.length, 65 * 65);
    for (const [kind, cap] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(p.elements.filter(e => e.kind === kind).length <= cap, `${p.id}:${kind}`);
    assert.deepEqual(p.animalAllocation, seagrassMeadowAllocation(p)); assert.equal(p.animalAllocation.total, 20);
    assert.equal(Object.entries(p.animalAllocation).filter(([key]) => !['facies', 'total'].includes(key)).reduce((n, [, value]) => n + value, 0), 20);
    assert.ok(!Object.hasOwn(p, 'agents') && !Object.hasOwn(p, 'resources'), 'a scenery plan does not manufacture ecological inventory');
  }
  assert.ok(group.metrics.addedGrassCount >= 300); assert.ok(group.metrics.denseGrassCount && group.metrics.edgeGrassCount); assert.ok(group.metrics.hardIslandCount >= 4);
  receipt.metrics = group.metrics; receipt.ownerAllocations = plans.map(p => ({ id: p.id, allocation: p.animalAllocation }));
});

test('shared Float32 bed preserves all literal seams, original outer16m and complete retained host support normals', () => {
  let maximumSlope = 0;
  for (let z = 0; z <= 128; z++) for (let x = 0; x <= 384; x++) { const wx = group.origin.x + x, wz = group.origin.z + z, y = vertex(wx, wz); assert.equal(Math.fround(y), y);
    if (x <= 16 || x >= 368 || z <= 16 || z >= 112) assert.equal(y, base.floorVertex(wx, wz));
    if (x < 384 && z < 128) { const b = vertex(wx + 1, wz), c = vertex(wx, wz + 1), d = vertex(wx + 1, wz + 1); maximumSlope = Math.max(maximumSlope, Math.hypot(b - y, c - y), Math.hypot(d - c, d - b)); }
  }
  assert.equal(maximumSlope, group.maxSlope); assert.ok(maximumSlope <= .65);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) for (let i = 0; i < 65; i++) assert.equal(plans[row * 6 + col].floorPatch.heights[i * 65 + 64], plans[row * 6 + col + 1].floorPatch.heights[i * 65]);
  for (let col = 0; col < 6; col++) for (let i = 0; i < 65; i++) assert.equal(plans[col].floorPatch.heights[64 * 65 + i], plans[col + 6].floorPatch.heights[i]);
  for (const id of group.retainedBoundaryIds) { const e = oldRows.get(id); assert.ok(e); assert.deepEqual(all.find(q => q.id === id), e);
    for (const p of ring(e.x, e.z, radial(e))) assert.deepEqual(floor(p.x, p.z), base.floorSurface(p.x, p.z), id);
  }
  for (let i = 0; i < old.length; i++) assert.equal(JSON.stringify(base.chunk(old[i].cx, old[i].cz)), before[i]);
  receipt.bed = { maximumSlope, preservedOuterGuardM: 16, retainedHostCount: group.retainedBoundaryIds.length };
});

test('actual393m observation route shares the old reef eastern port and every main and branch body corridor is physically open', () => {
  const previous = createReefValleyRegionPlans(base, 222, 4)[0].group;
  assert.deepEqual(previous.sharedPorts.east, group.sharedPorts.west);
  assert.deepEqual({ x: previous.routePath.at(-1).x, y: previous.routePath.at(-1).y, z: previous.routePath.at(-1).z }, { x: group.routePath[0].x, y: group.routePath[0].y, z: group.routePath[0].z });
  assert.equal(group.eastBoundaryPortConnected, false); assert.equal(group.routeExit.scope, 'interior-safe-observation-end');
  assert.equal(group.routeExit.x, group.routePath.at(-1).x); assert.ok(group.routeExit.x < group.sharedPorts.east.x, 'the isolated eastern port is not claimed as part of the tour');
  assert.ok(group.routeLengthM >= 300 && group.routeLengthM <= 500); assert.equal(group.branchPaths.length, 2);
  let probes = 0, maximumGapM = 0;
  for (const path of [group.routePath, ...group.branchPaths]) { let length = 0;
    for (const [i, p] of path.entries()) { assert.equal(p.y, floor(p.x, p.z).height + 2); assert.equal(p.bedY, p.y - 2);
      const checkpoints = [p]; if (i) { const a = path[i - 1], gap = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z); length += gap; maximumGapM = Math.max(maximumGapM, gap); assert.ok(gap <= 3); checkpoints.push({ x: (p.x + a.x) / 2, z: (p.z + a.z) / 2 }); } assert.equal(p.sM, length);
      for (const q of checkpoints) { for (const r of ring(q.x, q.z, 1)) { probes++; assert.ok(support(r.x, r.z) <= floor(r.x, r.z).height + .035); }
        for (const e of blockers) assert.ok(Math.hypot(e.x - q.x, e.z - q.z) > radial(e) + 1, `${e.id}:physical corridor`); }
    }
    if (path !== group.routePath) for (const end of [path[0], path.at(-1)]) assert.ok(group.routePath.some(p => p.x === end.x && p.y === end.y && p.z === end.z));
  }
  const stop = SEAGRASS_MEADOW_REGION_ROUTE_STOPS[0]; assert.equal(stop.x, group.routePath[0].x); assert.equal(stop.z, group.routePath[0].z); assert.equal(stop.heading, group.routePath[0].heading);
  receipt.route = { lengthM: group.routeLengthM, pointCount: group.routePath.length, branchLengthsM: group.branchPaths.map(p => p.at(-1).sM), maximumGapM, oneMetreProbes: probes, westSeamExact: true, eastBoundaryPortConnected: false, actualSafeEnd: group.routeExit };
});

test('broad grass cores and thin edges are rooted over complete soft sediment while real activity gaps and native hard islands remain', () => {
  const grass = added.filter(e => e.kind === 'seagrass'), dense = grass.filter(e => e.meadowBand === 'dense-core'), edge = grass.filter(e => e.meadowBand === 'thin-edge');
  assert.ok(dense.length && edge.length); const mean = values => values.reduce((n, e) => n + e.scale.y, 0) / values.length; assert.ok(mean(dense) > mean(edge));
  for (const e of grass) { assert.equal(e.y, floor(e.x, e.z).height); const radius = radial(e);
    for (const q of ring(e.x, e.z, radius)) { const depth = base.surfaceY - floor(q.x, q.z).height; assert.ok(depth >= 3 && depth <= 20); assert.ok(support(q.x, q.z) <= floor(q.x, q.z).height + .035); }
    const p = owner(e.x, e.z); for (const q of livingShallowsSoftActivitySites(seed, p.cx, p.cz)) assert.ok(Math.hypot(e.x - q.x, e.z - q.z) >= radius + .32);
  }
  const rocks = added.filter(e => e.kind === 'rock');
  for (const e of rocks) { assert.equal(e.landformRole, 'small-hard-island'); assert.ok(e.scale.x >= 5 && e.scale.x <= 9); assert.ok(e.scale.y >= 1.1 && e.scale.y <= 2.2); let closest = Infinity;
    const mesh = oceanRockMesh(e.profile); for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) { const q = world(e, mesh.positions[i], mesh.positions[i + 2]), gap = floor(q.x, q.z).height - e.y; assert.ok(gap >= .06 - 1e-9); closest = Math.min(closest, gap); } assert.ok(Math.abs(closest - .06) < 1e-9);
  }
  for (const e of added.filter(e => ['coral', 'algae'].includes(e.kind))) { const host = rocks.find(q => q.id === e.attachmentId); assert.ok(host); assert.ok(Math.abs(oceanRockHeight(host, e.x, e.z) - e.y) < 1e-6);
    if (e.kind === 'algae') { const surface = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z); assert.equal(e.y, host.y + surface.height * host.scale.y); assert.ok(Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) < 1e-12); }
  }
  receipt.plants = { addedRootedGrass: grass.length, denseCore: dense.length, thinEdge: edge.length, scope: 'persistent scenery, without simulated biomass or forced ecological births' };
});

test('the actual rooted soft grass habitat admits unchanged seed-selected whole turtle patrols without forcing presence', () => {
  const generator = { ...base, chunk: (cx, cz) => { const p = byId.get(`${cx},${cz}`); return p ? { ...base.chunk(cx, cz), elements: p.elements } : base.chunk(cx, cz); }, floorSurface: floor };
  const turtles = plans.flatMap(p => createOceanTurtlePlan(generator, { id: p.id, cx: p.cx, cz: p.cz, timeSec: 0 }, { surface: support, capacity: 1 }).placements);
  assert.ok(turtles.length > 0, 'the fixed sample has actual complete admissible existing turtle geometry');
  for (const turtle of turtles) { assert.equal(turtle.speciesId, 'green-turtle'); assert.ok(turtle.sourceGrassIds.length >= 6); assert.equal(turtle.patrolWaypoints.length, 16);
    const p = byId.get(turtle.regionId); for (const q of turtle.patrolWaypoints) { const depth = base.surfaceY - floor(q.x, q.z).height; assert.ok(depth >= 3 && depth <= 18); assert.ok(support(q.x, q.z) - floor(q.x, q.z).height < .15); assert.ok(oceanTurtlePositionValid(generator, q, turtle.sizeM, { cx: p.cx, cz: p.cz, surface: support })); }
    assert.equal(createOceanTurtlePlan(generator, { id: p.id, cx: p.cx, cz: p.cz, timeSec: 0 }, { surface: support, capacity: 0 }).placements.length, 0);
  }
  receipt.turtleAdmission = { naturallySelectedAdmissiblePatrols: turtles.length, animalBirthClaim: false, owners: turtles.map(t => t.regionId), wholeWaypointsPerPatrol: 16, unchangedExistingController: true };
});

test('world facies and actual cover decide habitats while old outer-band samples and v6–v8 sources remain literal', async () => {
  for (const p of plans) for (const q of group.routePath.filter((_, i) => i % 90 === 0)) assert.deepEqual(seagrassMeadowFacies(p, q.x, q.z), seagrassMeadowFacies(plans[0], q.x, q.z));
  for (const e of added.filter(e => e.kind === 'rock')) assert.equal(sampleSeagrassMeadowRegion(base, owner(e.x, e.z), e.x, e.z).substrate, 'rock');
  for (const q of [{ x: group.origin.x + 8.1, z: group.origin.z + 45.2 }, { x: group.origin.x + 375.1, z: group.origin.z + 73.2 }]) assert.deepEqual(sampleSeagrassMeadowRegion(base, owner(q.x, q.z), q.x, q.z), base.sample(q.x, q.z));
  for (const p of plans) { const x = p.cx * 64 + 32, z = p.cz * 64 + 32, sample = sampleSeagrassMeadowRegion(base, p, x, z); assert.equal(sample.floorY, floor(x, z).height); assert.equal(sample.depthM, base.surfaceY - sample.floorY); }
  assert.throws(() => seagrassMeadowFacies(plans[0], NaN, 0), RangeError);
  const sources = {}; for (const [file, expected] of [['reefValleyRegion.js', '8c3a7e94a78e085986e49601c1dbaa374d57cdd58976edf206a71259ece66439'], ['livingCoastalSeascape.js', '32bbf2cd2a4d413be439f1c26da1d3dd4e706394171c9edcef52e494c53e9d88'], ['livingShallowSeascape.js', '67bc701f098708a64a59372fb7067198b19718700f01e29bd7115957584a5049']]) { const hash = createHash('sha256').update(await readFile(new URL(`../src/${file}`, import.meta.url))).digest('hex'); assert.equal(hash, expected); sources[file] = hash; }
  receipt.immutableSources = sources;
});

test('closed canonical plans reject edited hosts, roots, group metadata, ports, allocation and already-checked mutable histories without cache rereads', async () => {
  const previousReads = reads; assert.equal(createSeagrassMeadowRegionPlans(base, 228, 4), plans);
  for (const p of plans) assert.ok(validateSeagrassMeadowRegionPlan(base, structuredClone(p)));
  assert.equal(reads, previousReads);
  const mutable = structuredClone(plans[0]); assert.ok(validateSeagrassMeadowRegionPlan(base, mutable)); mutable.floorPatch.heights[2000] += .01; assert.equal(validateSeagrassMeadowRegionPlan(base, mutable), false);
  const p = plans.find(q => q.newRockIds.length), reject = change => { const altered = structuredClone(p); change(altered); assert.equal(validateSeagrassMeadowRegionPlan(base, altered), false); };
  reject(q => q.group.ownerIds.pop()); reject(q => q.group.sharedPorts.west.z += 1); reject(q => q.group.routePath[10].y += 1); reject(q => q.group.branchPaths[0][0].x += 1);
  reject(q => q.group.eastBoundaryPortConnected = true); reject(q => q.elements.find(e => e.id === q.newRockIds[0]).y += .01); reject(q => q.animalAllocation.turtles = 20);
  reject(q => q.group.coverElements.pop()); reject(q => q.group.unknownField = true); reject(q => q.seed += ':other'); assert.equal(validateSeagrassMeadowRegionPlan(base, null), false);
  for (let i = 0; i < old.length; i++) assert.equal(JSON.stringify(base.chunk(old[i].cx, old[i].cz)), before[i]);
  receipt.planHash = createHash('sha256').update(JSON.stringify(plans)).digest('hex');
  if (process.env.SEAGRASS_MEADOW_REGION_GEOMETRY_RECEIPT) await writeFile(process.env.SEAGRASS_MEADOW_REGION_GEOMETRY_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});
