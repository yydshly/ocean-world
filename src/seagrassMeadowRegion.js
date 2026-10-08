import { livingSeabedFloorSurface } from './livingSeabedRelief.js';
import { oceanRockHeight, oceanRockMesh, oceanRockSurface } from './oceanRockShape.js';
import { sceneElementHeight } from './oceanSceneElements.js';
import { LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites, livingShallowsPropGroundY } from './livingShallowsGeneration.js';

const OWNER = 64, WIDTH = 384, DEPTH = 128, ROW = WIDTH + 1, GUARD = 16, TAU = Math.PI * 2;
const models = new WeakMap(), coverCaches = new WeakMap(), expectedStamps = new WeakMap();
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const stamp = value => JSON.stringify(value), clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const radial = e => Math.hypot(e.scale.x, e.scale.z) * .6 + .15;
const ring = (x, z, r) => [{ x, z }, ...Array.from({ length: 12 }, (_, i) => ({ x: x + Math.cos(i * TAU / 12) * r, z: z + Math.sin(i * TAU / 12) * r }))];
export const SEAGRASS_MEADOW_REGION_LAYOUT = Object.freeze({ ownerColumns: 6, ownerRows: 2, ownerSizeM: 64, widthM: 384, depthM: 128, outerGuardM: 16, maximumCachedGroups: 6 });
export const SEAGRASS_MEADOW_REGION_ROUTE_STOPS = freeze([{ id: 'seagrass-meadow-region', label: '热带海草草甸生活带', x: 228 * OWNER, z: 4 * OWNER + 64, heading: 0, entryAcrossM: 1 }]);
export function seagrassMeadowRegionOrigin(cx, cz) {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || !Number.isSafeInteger(cx * OWNER + WIDTH + OWNER) || !Number.isSafeInteger(cz * OWNER + DEPTH + OWNER)) return null;
  const ax = Math.floor(cx / 6) * 6, az = Math.floor(cz / 2) * 2; if (ax < 228 || (ax / 6 - 38) % 5 !== 0) return null;
  const ownerIds = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${ax + dx},${az + dz}`));
  return freeze({ cx: ax, cz: az, id: `seagrass-meadow-region:${ax},${az}`, ownerIds });
}
const controls = [[24, 64], [112, 50], [200, 80], [284, 52], [360, 64]];
function random(seed, salt) { let h = 2166136261; for (const c of `${typeof seed}:${seed}|seagrass-meadow-v9|${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function source(input, cx, cz) { const base = input.baseGenerator ?? input;
  const macro = seagrassMeadowRegionOrigin(cx, cz); if (base.profile !== 'living-shallows-v1' || !macro || macro.cx !== cx || macro.cz !== cz) throw new TypeError('Seagrass meadows require an aligned eligible six-by-two living-shallows macro origin.');
  const chunks = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => base.chunk(cx + dx, cz + dz))), ids = new Set(chunks.map(c => c.id)), halo = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) { const c = base.chunk(cx + dx, cz + dz); if (!ids.has(c.id)) halo.push(...c.elements); }
  return { base, chunks, halo, origin: { x: cx * OWNER, z: cz * OWNER } };
}
/** Shared world-coordinate composition. Labels alone do not create support. */
export function seagrassMeadowFacies(plan, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Seagrass-meadow facies requires finite world metres.');
  const lx = x - plan.group.origin.x, lz = z - plan.group.origin.z, edge = Math.min(lx, WIDTH - lx, lz, DEPTH - lz), influence = smooth((edge - GUARD) / 18),
    phase = random(plan.seed ?? plan.group.seed, `facies:${plan.group.origin.x},${plan.group.origin.z}`) * TAU,
    channelZ = 64 + 10 * Math.sin(lx / 68 + phase), channel = Math.exp(-(((lz - channelZ) / 8) ** 2)),
    grassField = smooth((edge - 22) / 14) * (1 - channel * .95), island = .13 * (1 + Math.sin(lx / 42 + phase)) * smooth((Math.abs(lz - 64) - 17) / 14),
    outer = .15 * smooth((lx - 318) / 50), values = [island, .20 + .95 * channel + .45 * (1 - grassField), .35 + 1.40 * grassField, outer],
    names = ['reef', 'sand', 'meadow', 'slope'], sum = values.reduce((a, b) => a + b, 0), result = { influence, grassCore: grassField, sandChannel: channel };
  names.forEach((name, i) => result[name] = values[i] / sum); result.dominant = names[values.indexOf(Math.max(...values))]; return result;
}
export function seagrassMeadowAllocation(plan) {
  const field = seagrassMeadowFacies(plan, plan.cx * OWNER + 32, plan.cz * OWNER + 32),
    facies = field.sandChannel > .35 ? 'sandLane' : field.grassCore > .78 ? 'grassCore' : field.grassCore > .25 ? 'grassEdge' : 'openWater',
    recipe = {
      grassCore: { native: 4, guild: 2, openWater: 2, diversity: 3, benthic: 4, meadow: 4, turtles: 1, shoal: 0 },
      grassEdge: { native: 3, guild: 2, openWater: 3, diversity: 3, benthic: 4, meadow: 4, turtles: 1, shoal: 0 },
      sandLane: { native: 6, guild: 1, openWater: 3, diversity: 2, benthic: 4, meadow: 4, turtles: 0, shoal: 0 },
      openWater: { native: 2, guild: 1, openWater: 4, diversity: 2, benthic: 1, meadow: 2, turtles: 0, shoal: 8 },
    };
  return freeze({ facies, ...recipe[facies], total: 20 });
}
function world(e, x, z) { const c = Math.cos(e.rotation), s = Math.sin(e.rotation); return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c }; }
function within(e, origin, margin = GUARD) { const r = radial(e); return e.x - r >= origin.x + margin && e.x + r <= origin.x + WIDTH - margin && e.z - r >= origin.z + margin && e.z + r <= origin.z + DEPTH - margin; }
function floorView(base, plans) { const byId = new Map(plans.map(p => [p.id, p])); return { floorSurface: (x, z) => livingSeabedFloorSurface(base, byId.get(`${Math.floor(x / OWNER)},${Math.floor(z / OWNER)}`), x, z) }; }
function nearbyRows(rows, kinds, padding = 0) { const bins = new Map(), size = 16;
  // Candidate-only culling: retain source order and the exact radial/mesh
  // predicates below. The tiny indexing guard cannot create physical room.
  for (const e of rows) { if (!kinds.includes(e.kind)) continue; const reach = radial(e) + padding + 1e-6;
    for (let iz = Math.floor((e.z - reach) / size); iz <= Math.floor((e.z + reach) / size); iz++) for (let ix = Math.floor((e.x - reach) / size); ix <= Math.floor((e.x + reach) / size); ix++) {
      const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(e);
    }
  }
  return (x, z) => bins.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) ?? [];
}
function hardHeight(view, rows, x, z) { let height = view.floorSurface(x, z).height;
  for (const e of typeof rows === 'function' ? rows(x, z) : rows) { if (!['rock', 'driftwood', 'bottle'].includes(e.kind) || Math.hypot(e.x - x, e.z - z) > radial(e)) continue; const y = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true); if (y !== null) height = Math.max(height, y); } return height; }
const clearSoft = (view, rows, p, radius) => ring(p.x, p.z, radius).every(q => hardHeight(view, rows, q.x, q.z) <= view.floorSurface(q.x, q.z).height + .035);
function protection(rows) { const bins = new Map();
  // Preserve the vertices of each one-metre triangle under a retained full
  // footprint, so interpolation also preserves the original support normal.
  for (const e of rows) { const r = radial(e) + 1.5, reach = r + 18, p = { x: e.x, z: e.z, r }; for (let iz = Math.floor((e.z - reach) / 16); iz <= Math.floor((e.z + reach) / 16); iz++) for (let ix = Math.floor((e.x - reach) / 16); ix <= Math.floor((e.x + reach) / 16); ix++) { const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p); } }
  return (x, z) => (bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []).reduce((m, p) => Math.min(m, smooth((Math.hypot(x - p.x, z - p.z) - p.r) / 18)), 1);
}
function amplitudeLimit(baseline, unit) { let a = 1; const permitted = .6499 ** 2;
  for (let z = 0; z < DEPTH; z++) for (let x = 0; x < WIDTH; x++) { const i = z * ROW + x; for (const [p, q, r] of [[i, i + 1, i + ROW], [i + ROW + 1, i + ROW, i + 1]]) { const bx = baseline[q] - baseline[p], bz = baseline[r] - baseline[p], ux = unit[q] - unit[p], uz = unit[r] - unit[p], bb = bx * bx + bz * bz, uu = ux * ux + uz * uz, dot = bx * ux + bz * uz;
    if (bb > permitted) throw new RangeError('Original seagrass-meadow bed exceeds the finite slope gate.'); if (uu > 1e-16) a = Math.min(a, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu); } }
  return clamp(a * .999);
}
function measurements(heights, baseline, width, depth, row, origin, surfaceY) { let deltaMinM = Infinity, deltaMaxM = -Infinity, minDepthM = Infinity, maxDepthM = -Infinity, maxSlope = 0, mostDisplaced = null;
  for (let i = 0; i < heights.length; i++) { const delta = heights[i] - baseline[i]; deltaMinM = Math.min(deltaMinM, delta); deltaMaxM = Math.max(deltaMaxM, delta); minDepthM = Math.min(minDepthM, surfaceY - heights[i]); maxDepthM = Math.max(maxDepthM, surfaceY - heights[i]); if (!mostDisplaced || Math.abs(delta) > Math.abs(mostDisplaced.deltaM)) mostDisplaced = { x: origin.x + i % row, z: origin.z + Math.floor(i / row), deltaM: delta }; }
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) { const i = z * row + x; maxSlope = Math.max(maxSlope, Math.hypot(heights[i + 1] - heights[i], heights[i + row] - heights[i]), Math.hypot(heights[i + row + 1] - heights[i + row], heights[i + row + 1] - heights[i + 1])); }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, minDepthM, maxDepthM, maxSlope, mostDisplaced };
}
function distanceToPath(p, points) { let best = Infinity; for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)); best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)); } return best; }
function sharedPort(base, boundaryX, originZ) {
  const rows = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 0; dx++) rows.push(...base.chunk(Math.floor(boundaryX / OWNER) + dx, Math.floor(originZ / OWNER) + dz).elements);
  const view = { floorSurface: (x, z) => base.floorSurface(x, z) }, blockers = rows.filter(e => ['coral', 'seagrass', 'algae', 'driftwood', 'bottle'].includes(e.kind));
  for (const offset of [0, ...Array.from({ length: 20 }, (_, i) => [2 * (i + 1), -2 * (i + 1)]).flat()]) {
    const point = { x: boundaryX, z: originZ + 64 + offset };
    if (clearSoft(view, rows, point, 1.1) && blockers.every(e => Math.hypot(e.x - point.x, e.z - point.z) > radial(e) + 1.1)) return { ...point, bedY: base.floorSurface(point.x, point.z).height, radiusM: 1 };
  }
  throw new RangeError('The original seagrass-meadow boundary has no physical one-metre shared port; hosts were not moved.');
}
function route(base, view, retained, origin) {
  const west = sharedPort(base, origin.x, origin.z), east = sharedPort(base, origin.x + WIDTH, origin.z), ports = { west, east },
    hardRows = nearbyRows(retained, ['rock', 'driftwood', 'bottle']), blockers = nearbyRows(retained, ['coral', 'seagrass', 'algae', 'driftwood', 'bottle'], 1.1),
    cache = new Map(), allowed = (x, z) => { const key = x + ',' + z; if (cache.has(key)) return cache.get(key); const p = { x: origin.x + x, z: origin.z + z }, depth = base.surfaceY - view.floorSurface(p.x, p.z).height,
      yes = x >= 0 && x <= WIDTH && z >= 4 && z <= DEPTH - 4 && depth >= 3 && depth <= 28 && clearSoft(view, hardRows, p, 1.1) && blockers(p.x, p.z).every(e => Math.hypot(e.x - p.x, e.z - p.z) > radial(e) + 1.1); cache.set(key, yes); return yes; };
  const snap = point => { for (const r of [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32]) for (const [dx, dz] of r ? [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] : [[0, 0]]) if (allowed(point[0] + dx, point[1] + dz)) return [point[0] + dx, point[1] + dz]; throw new RangeError('A seagrass-meadow landmark has no retained-host clearance inside its bounded local neighbourhood.'); };
  const goals = [[0, west.z - origin.z], ...controls.map(snap)];
  function join(start, end) { const key = (x, z) => x + ',' + z, costs = new Map([[key(...start), 0]]), parents = new Map(), open = [{ p: start, score: Math.hypot(end[0] - start[0], end[1] - start[1]) }], closed = new Set();
    while (open.length) { open.sort((a, b) => b.score - a.score); const current = open.pop().p, id = key(...current); if (closed.has(id)) continue; if (id === key(...end)) { const output = [current]; let k = id; while (parents.has(k)) { const p = parents.get(k); output.push(p); k = key(...p); } return output.reverse(); } closed.add(id);
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) { const p = [current[0] + dx, current[1] + dz], next = key(...p); if (closed.has(next) || !allowed(...p) || !allowed(current[0] + dx / 2, current[1] + dz / 2)) continue; const cost = costs.get(id) + Math.hypot(dx, dz); if (cost >= (costs.get(next) ?? Infinity)) continue; costs.set(next, cost); parents.set(next, current); open.push({ p, score: cost + Math.hypot(end[0] - p[0], end[1] - p[1]) }); }
    } throw new RangeError(`The seagrass-meadow route cannot connect ${start} to ${end} around unchanged boundary hosts.`); }
  const smoothPath = original => { let points = original; for (let n = 0; n < 2; n++) { const next = [points[0]]; for (let i = 1; i < points.length; i++) for (const t of [.25, .75]) next.push([points[i - 1][0] * (1 - t) + points[i][0] * t, points[i - 1][1] * (1 - t) + points[i][1] * t]); next.push(points.at(-1)); points = next; } return points.some(p => !allowed(...p)) ? original : points; };
  const frame = points => { const full = smoothPath(points).map(([x, z]) => { const p = { x: origin.x + x, z: origin.z + z }, bedY = view.floorSurface(p.x, p.z).height; return { ...p, y: bedY + 2, bedY }; }); let sM = 0;
    full.forEach((p, i) => { if (i) sM += Math.hypot(p.x - full[i - 1].x, p.y - full[i - 1].y, p.z - full[i - 1].z); p.sM = sM; const q = full[Math.min(full.length - 1, i + 1)], prev = full[Math.max(0, i - 1)]; p.heading = Math.atan2(q.z - prev.z, q.x - prev.x); }); return full; };
  let raw = []; for (let i = 1; i < goals.length; i++) raw.push(...join(goals[i - 1], goals[i]).slice(i === 1 ? 0 : 1));
  const path = frame(raw), branches = [];
  const attachBranch = rows => { const full = frame(rows), nearest = point => path.reduce((best, q) => Math.hypot(point.x - q.x, point.z - q.z) < Math.hypot(point.x - best.x, point.z - best.z) ? q : best, path[0]);
    full[0] = { ...nearest(full[0]) }; full[full.length - 1] = { ...nearest(full.at(-1)) }; let distanceM = 0;
    full.forEach((p, i) => { if (i) distanceM += Math.hypot(p.x - full[i - 1].x, p.y - full[i - 1].y, p.z - full[i - 1].z); p.sM = distanceM; const a = full[Math.max(0, i - 1)], b = full[Math.min(full.length - 1, i + 1)]; p.heading = Math.atan2(b.z - a.z, b.x - a.x); }); return full; };
  for (const [fraction, side] of [[.31, -1], [.62, 1]]) { const i = Math.floor(raw.length * fraction), start = raw[i], end = raw[Math.min(raw.length - 1, i + 26)];
    for (const reach of [20, 16, 12]) { const via = [Math.round((start[0] + end[0]) / 4) * 2, Math.round((start[1] + end[1]) / 4) * 2 + side * reach]; if (!allowed(...via)) continue; try { const rows = [...join(start, via), ...join(via, end).slice(1)]; if (rows.length > 24 && rows.some(p => Math.min(...raw.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))) >= 6)) { branches.push(attachBranch(rows)); break; } } catch (error) { if (!(error instanceof RangeError)) throw error; } }
  }
  if (path.at(-1).sM < 300 || path.at(-1).sM > 500) throw new RangeError('Actual seagrass-meadow primary path exceeds its bounded 300–500m contract.');
  return { path, branches, ports };
}
function build(base, chunks, halo, origin) {
  const original = chunks.flatMap(c => c.elements), protectedIds = new Set(original.filter(e => !within(e, origin)).map(e => e.id));
  for (const e of original) if (e.attachmentId && protectedIds.has(e.attachmentId)) protectedIds.add(e.id);
  const retained = original.filter(e => protectedIds.has(e.id)), external = halo, mask = protection([...retained, ...external]), skeleton = { seed: base.seed, group: { origin, seed: base.seed } }, baseline = [], unit = [];
  for (let z = 0; z <= DEPTH; z++) for (let x = 0; x <= WIDTH; x++) { const wx = origin.x + x, wz = origin.z + z, y = base.floorVertex(wx, wz), f = seagrassMeadowFacies(skeleton, wx, wz), target = 1.8 * f.reef + .4 * f.sand + 1.6 * f.meadow - 4.0 * f.slope + .22 * Math.sin((wx * .77 + wz * .51) / 32); baseline.push(y); unit.push((target - y) * f.influence * mask(wx, wz)); }
  const amplitude = amplitudeLimit(baseline, unit), heights = baseline.map((y, i) => Math.fround(y + unit[i] * amplitude)), measured = measurements(heights, baseline, WIDTH, DEPTH, ROW, origin, base.surfaceY),
    group = { id: `seagrass-meadow-region:${chunks[0].cx},${chunks[0].cz}`, cx: chunks[0].cx, cz: chunks[0].cz, seed: base.seed, origin, ownerIds: chunks.map(c => c.id), widthM: WIDTH, depthM: DEPTH, outerGuardM: GUARD, gridSizeX: ROW, gridSizeZ: DEPTH + 1,
      facies: ['reef', 'sand', 'meadow', 'slope'], ...measured, controls: { amplitude, protectionRampM: 18, pathBodyRadiusM: 1, cameraHeightM: 2 }, retainedBoundaryIds: retained.map(e => e.id), coverElements: [] },
    plans = chunks.map(c => { const local = [], old = [], ox = (c.cx - chunks[0].cx) * OWNER, oz = (c.cz - chunks[0].cz) * OWNER; for (let z = 0; z <= OWNER; z++) for (let x = 0; x <= OWNER; x++) { const i = (oz + z) * ROW + ox + x; local.push(heights[i]); old.push(baseline[i]); }
      return { version: 9, id: c.id, cx: c.cx, cz: c.cz, seed: base.seed, theme: 'seagrass-meadow-region', baseStamp: stamp(c), group,
        floorPatch: { gridSize: 65, spacingM: 1, widthM: OWNER, boundaryGuardM: 0, groupOuterGuardM: GUARD, heights: local, ...measurements(local, old, OWNER, OWNER, 65, c.origin, base.surfaceY) },
        elements: c.elements.filter(e => protectedIds.has(e.id)), retainedRockIds: c.elements.filter(e => e.kind === 'rock' && protectedIds.has(e.id)).map(e => e.id), newRockIds: [], ridgeIds: [],
        overview: { center: { x: c.origin.x + 32, z: c.origin.z + 32 }, heading: 0, extentM: 52 }, displayScope: 'Coordinate-seeded fresh-only twelve-owner tropical seagrass meadow: broad rooted grass cores, thin edges, connected soft sediment channels and small irregular hard islands are real native descriptors, organized before animal birth. Outer bed and retained support remain literal; plants are scenery, not simulated biomass. No forced animals or complete food web.' }; });
  const view = floorView(base, plans), routing = route(base, view, [...retained, ...external], origin), path = routing.path, paths = [path, ...routing.branches], all = [...retained], rocks = all.filter(e => e.kind === 'rock');
  const ownerAt = p => plans.find(q => q.cx === Math.floor(p.x / OWNER) && q.cz === Math.floor(p.z / OWNER));
  const fullFit = (e, plan) => { const r = radial(e); return within(e, origin) && e.x - r >= plan.cx * OWNER + .4 && e.x + r <= (plan.cx + 1) * OWNER - .4 && e.z - r >= plan.cz * OWNER + .4 && e.z + r <= (plan.cz + 1) * OWNER - .4; };
  const add = e => { const p = ownerAt(e); if (!p || p.elements.filter(q => q.kind === e.kind).length >= LIVING_SHALLOWS_ELEMENT_LIMITS[e.kind] || !fullFit(e, p) || Math.min(...paths.map(rows => distanceToPath(e, rows))) < radial(e) + 1.25) return false; p.elements.push(e); all.push(e); return true; };
  function at(s) { const i = path.findIndex(p => p.sM >= s); if (i <= 0) return path[Math.max(0, i)]; const a = path[i - 1], b = path[i], t = (s - a.sM) / (b.sM - a.sM); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.z - a.z, b.x - a.x) }; }
  for (let s = 8; s < path.at(-1).sM - 6; s += 72 + random(base.seed, `station:${Math.floor(s)}:gap`) * 14) { const station = at(s); for (const side of [-1, 1]) for (const reach of [17, 21, 25, 29]) {
    const salt = `shoulder:${Math.floor(s)}:${side}`, heading = station.heading, width = 5 + random(base.seed, `${group.id}:${salt}:width`) * 4, e = { id: `meadow:${group.cx},${group.cz}:${salt}`, kind: 'rock', profile: ['natural-a', 'natural-b', 'natural-c'][Math.floor(random(base.seed, `${salt}:profile`) * 3)],
      x: station.x - Math.sin(heading) * reach * side, z: station.z + Math.cos(heading) * reach * side, rotation: -heading + (random(base.seed, `${salt}:turn`) - .5) * .5, scale: { x: width, y: 1.1 + random(base.seed, `${group.id}:${salt}:height`) * 1.1, z: width * (.30 + random(base.seed, `${group.id}:${salt}:depth`) * .20) }, landformRole: 'small-hard-island' };
    const mesh = oceanRockMesh(e.profile); let ground = Infinity; for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) { const q = world(e, mesh.positions[i], mesh.positions[i + 2]); ground = Math.min(ground, view.floorSurface(q.x, q.z).height); } e.y = ground - .06;
    if (all.some(q => Math.hypot(q.x - e.x, q.z - e.z) < radial(q) + radial(e) + .3)) continue; if (!add(e)) continue; const p = ownerAt(e); p.newRockIds.push(e.id); p.ridgeIds.push(e.id); rocks.push(e); break;
  } }
  for (const host of rocks.filter(e => e.id.startsWith('meadow:'))) { const count = 2;
    for (let index = 0; index < count; index++) { const angle = index * TAU / count + .31, q = world(host, Math.cos(angle) * .21, Math.sin(angle) * .21), y = oceanRockHeight(host, q.x, q.z), morphotype = ['branching', 'table', 'fan', 'branching'][index], width = 1.0 + random(base.seed, `${host.id}:coral:${index}`) * .5,
        e = { id: `${host.id}:coral:${index}`, kind: 'coral', attachmentId: host.id, morphotype, ...q, y, rotation: random(base.seed, `${host.id}:coral-turn:${index}`) * TAU, scale: { x: width, y: morphotype === 'table' ? .5 : .7 + random(base.seed, `${host.id}:coral-height:${index}`) * .3, z: width * .72 } };
      if (y === null || y < view.floorSurface(q.x, q.z).height + .25 || base.surfaceY - y < 3 || base.surfaceY - y > 22 || all.some(a => ['coral', 'algae'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) + .1)) continue; add(e);
    }
    for (let index = 0; index < 3; index++) { const a = index * TAU / 3 + .67, local = { x: Math.cos(a) * .30, z: Math.sin(a) * .30 }, srf = oceanRockSurface(host.profile, local.x, local.z); if (!srf) continue; const q = world(host, local.x, local.z), y = host.y + srf.height * host.scale.y, radius = .035, nx = srf.normal.x / host.scale.x, ny = srf.normal.y / host.scale.y, nz = srf.normal.z / host.scale.z, length = Math.hypot(nx, ny, nz), c = Math.cos(host.rotation), s = Math.sin(host.rotation),
        e = { id: `${host.id}:algae:${index}`, kind: 'algae', attachmentId: host.id, ...q, y, rotation: host.rotation, surfaceLocal: local, patchRadius: radius, normal: { x: (nx * c + nz * s) / length, y: ny / length, z: (-nx * s + nz * c) / length }, scale: { x: host.scale.x * radius * 2, y: .018, z: host.scale.z * radius * 2 } };
      if (y < view.floorSurface(q.x, q.z).height + .12 || all.some(a => ['coral', 'algae'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e))) continue; add(e);
    }
  }
  for (const p of plans) { const activity = livingShallowsSoftActivitySites(base.seed, p.cx, p.cz);
    for (let z = p.cz * OWNER + 2; z < (p.cz + 1) * OWNER - 2; z += 2.6) for (let x = p.cx * OWNER + 2; x < (p.cx + 1) * OWNER - 2; x += 2.6) { const salt = `grass:${x.toFixed(1)},${z.toFixed(1)}`, q = { x: x + (random(base.seed, `${salt}:x`) - .5) * .45, z: z + (random(base.seed, `${salt}:z`) - .5) * .45 }, f = seagrassMeadowFacies(skeleton, q.x, q.z), core = smooth((f.grassCore - .28) / .55);
      if (f.grassCore < .12 || random(base.seed, `${salt}:present`) > .16 + .81 * core) continue; const width = 1.12 + core * .48 + random(base.seed, `${salt}:width`) * .13, e = { id: `meadow:${group.cx},${group.cz}:${salt}`, kind: 'seagrass', ...q, y: view.floorSurface(q.x, q.z).height, rotation: random(base.seed, `${salt}:rotation`) * TAU,
        scale: { x: width, y: .32 + core * .39 + random(base.seed, `${salt}:height`) * .10, z: width }, meadowBand: core > .7 ? 'dense-core' : 'thin-edge' };
      if (!ring(e.x, e.z, radial(e)).every(r => base.surfaceY - view.floorSurface(r.x, r.z).height >= 3 && base.surfaceY - view.floorSurface(r.x, r.z).height <= 20) || !clearSoft(view, rocks, e, radial(e)) || activity.some(a => Math.hypot(a.x - e.x, a.z - e.z) < radial(e) + .32) || all.some(a => ['coral', 'seagrass', 'driftwood', 'bottle'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) - .35)) continue; add(e);
    }
    for (let index = 0; index < 48; index++) { const salt = `${p.id}:rubble:${index}`, x = p.cx * OWNER + 3 + random(base.seed, `${salt}:x`) * 58, z = p.cz * OWNER + 3 + random(base.seed, `${salt}:z`) * 58, width = .30 + random(base.seed, `${salt}:width`) * .50,
        e = { id: `meadow:${group.cx},${group.cz}:${salt}`, kind: 'rubble', x, y: view.floorSurface(x, z).height, z, rotation: random(base.seed, `${salt}:turn`) * TAU, scale: { x: width, y: .08 + random(base.seed, `${salt}:height`) * .07, z: width * .75 } }; if (clearSoft(view, rocks, e, radial(e))) add(e); }
  }
  for (const [kind, sM, side] of [['bottle', 142, -1], ['driftwood', 213, 1]]) { const point = at(sM); for (const reach of [4, 6, 8, 10]) { const e = { id: `meadow:${group.cx},${group.cz}:${kind}`, kind, x: point.x - Math.sin(point.heading) * reach * side, z: point.z + Math.cos(point.heading) * reach * side, rotation: -point.heading + .3, variant: 0,
      scale: kind === 'bottle' ? { x: .32, y: .078, z: .078 } : { x: 1.8, y: .16, z: .25 }, physicalState: kind === 'bottle' ? 'grounded-flooded' : 'grounded', ...(kind === 'bottle' ? { flooded: true, sealed: false } : {}) };
    if (!clearSoft(view, rocks, e, radial(e)) || all.some(a => Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) + .2)) continue; e.y = livingShallowsPropGroundY(view, e); if (add(e)) break; } }
  group.coverElements = all.filter(e => ['rock', 'seagrass'].includes(e.kind));
  group.routeExit = { ...path.at(-1), scope: 'interior-safe-observation-end' }; group.eastBoundaryPortConnected = false;
  group.routePath = path; group.branchPaths = routing.branches; group.sharedPorts = routing.ports; group.routeLengthM = path.at(-1).sM; group.route = [{ id: 'seagrass-meadow-region', label: '连续海草草甸', x: path[0].x, y: path[0].y, z: path[0].z, heading: path[0].heading, entryAcrossM: 1, macroId: group.id }];
  const newRows = all.filter(e => e.id.startsWith('meadow:')), count = (rows, kind) => rows.filter(e => e.kind === kind).length;
  group.metrics = { rockCount: count(all, 'rock'), coralCount: count(all, 'coral'), grassCount: count(all, 'seagrass'), addedRockCount: count(newRows, 'rock'), addedCoralCount: count(newRows, 'coral'), addedAlgaeCount: count(newRows, 'algae'), addedGrassCount: count(newRows, 'seagrass'),
    hardIslandCount: newRows.filter(e => e.landformRole === 'small-hard-island').length,
    driftwoodCount: count(all, 'driftwood'), bottleCount: count(all, 'bottle'), denseGrassCount: all.filter(e => e.meadowBand === 'dense-core').length, edgeGrassCount: all.filter(e => e.meadowBand === 'thin-edge').length,
    byFacies: Object.fromEntries(group.facies.map(f => [f, Object.fromEntries(['rock', 'coral', 'seagrass', 'algae', 'rubble'].map(kind => [kind, all.filter(e => e.kind === kind && seagrassMeadowFacies(skeleton, e.x, e.z).dominant === f).length]))])) };
  const pathRows = paths.flat(), pathChecks = pathRows.flatMap(p => ring(p.x, p.z, 1)), finalRows = [...all, ...external], finalHardRows = nearbyRows(finalRows, ['rock', 'driftwood', 'bottle']), finalBlockers = nearbyRows(finalRows, ['coral', 'seagrass', 'algae', 'bottle', 'driftwood'], 1);
  if (pathChecks.some(p => !clearSoft(view, finalHardRows, p, .1)) || pathRows.some(p => finalBlockers(p.x, p.z).some(e => Math.hypot(e.x - p.x, e.z - p.z) <= radial(e) + 1))) throw new RangeError('Final seagrass-meadow entities block the physical body corridor.');
  group.pathMetrics = { lengthM: group.routeLengthM, pointCount: path.length, bodyRadiusM: 1, cameraHeightM: 2, maximumPointGapM: Math.max(...path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y, p.z - path[i].z))),
    clearChecks: pathChecks.length, branchCount: routing.branches.length, branchLengthsM: routing.branches.map(rows => rows.at(-1).sM), minimumDepthM: Math.min(...path.map(p => base.surfaceY - p.bedY)), maximumDepthM: Math.max(...path.map(p => base.surfaceY - p.bedY)), actualEntityClearance: true };
  if (group.metrics.hardIslandCount < 4 || routing.branches.length < 2 || group.metrics.addedCoralCount < 4 || group.metrics.addedGrassCount < 300 || !group.metrics.denseGrassCount || !group.metrics.edgeGrassCount) throw new RangeError(`The seagrass-meadow plan has no complete admitted macro structure: ${stamp(group.metrics)}`);
  for (const p of plans) { if (Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS).some(([kind, limit]) => p.elements.filter(e => e.kind === kind).length > limit)) throw new RangeError(`Seagrass-meadow owner ${p.id} exceeds a native element budget.`);
    const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 }; let minDepthM = Infinity, maxDepthM = -Infinity;
    for (let z = 4; z < OWNER; z += 8) for (let x = 4; x < OWNER; x += 8) { const s = sampleSeagrassMeadowRegion(base, p, p.cx * OWNER + x, p.cz * OWNER + z); habitats[s.habitat]++; minDepthM = Math.min(minDepthM, s.depthM); maxDepthM = Math.max(maxDepthM, s.depthM); }
    const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]); p.habitatComposition = { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
    p.animalAllocation = seagrassMeadowAllocation(p);
  }
  return freeze(plans);
}
function model(input, cx, cz) { const base = input.baseGenerator ?? input, macro = seagrassMeadowRegionOrigin(cx, cz);
  if (base.profile !== 'living-shallows-v1' || !macro || macro.cx !== cx || macro.cz !== cz) throw new TypeError('Seagrass meadows require an aligned eligible six-by-two living-shallows macro origin.');
  let entries = models.get(base); if (!entries) { entries = new Map(); models.set(base, entries); } const key = `${cx},${cz}`;
  if (!entries.has(key)) { const { chunks, halo, origin } = source(base, cx, cz); if (entries.size >= SEAGRASS_MEADOW_REGION_LAYOUT.maximumCachedGroups) entries.delete(entries.keys().next().value); let entry; try { entry = { plans: build(base, chunks, halo, origin) }; } catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; } entries.set(key, entry); }
  const entry = entries.get(key); if (entry.declined) throw new RangeError(entry.declined); return entry.plans;
}
/** Only the calling persistence adapter may publish all twelve absent owners. */
export function createSeagrassMeadowRegionPlans(base, cx, cz) { return model(base, cx, cz); }
export function validateSeagrassMeadowRegionPlan(base, plan) { try { if (!plan || plan.version !== 9 || plan.theme !== 'seagrass-meadow-region' || !plan.group || plan.id !== `${plan.cx},${plan.cz}` || !seagrassMeadowRegionOrigin(plan.group.cx, plan.group.cz) || seagrassMeadowRegionOrigin(plan.group.cx, plan.group.cz).cx !== plan.group.cx || seagrassMeadowRegionOrigin(plan.group.cx, plan.group.cz).cz !== plan.group.cz) return false;
  const expected = model(base, plan.group.cx, plan.group.cz).find(p => p.id === plan.id); if (!expected) return false;
  if (!expectedStamps.has(expected)) expectedStamps.set(expected, stamp(expected));
  return stamp(plan) === expectedStamps.get(expected); } catch { return false; } }
function coverRows(base, group, x, z) { let index = coverCaches.get(group); if (!index) { index = new Map(); const rows = [...group.coverElements];
    for (const e of rows) { const reach = radial(e) + 5; for (let iz = Math.floor((e.z - reach) / 8); iz <= Math.floor((e.z + reach) / 8); iz++) for (let ix = Math.floor((e.x - reach) / 8); ix <= Math.floor((e.x + reach) / 8); ix++) { const k = `${ix},${iz}`; if (!index.has(k)) index.set(k, []); index.get(k).push(e); } } coverCaches.set(group, index); }
  return index.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []; }
export function sampleSeagrassMeadowRegion(input, plan, x, z) { const base = input.baseGenerator ?? input, original = base.sample(x, z), f = seagrassMeadowFacies(plan, x, z); if (!f.influence) return original;
  const floor = livingSeabedFloorSurface(base, plan, x, z); let hard = 0, grass = 0, bare = false;
  for (const e of coverRows(base, plan.group, x, z)) { const d = Math.hypot(e.x - x, e.z - z); if (e.kind === 'rock') { const height = oceanRockHeight(e, x, z); if (height !== null && height > floor.height + .06) { bare = true; hard = 1; } hard = Math.max(hard, .28 * smooth(1 - Math.max(0, d - radial(e) * .75) / 5)); }
    else grass = Math.max(grass, .94 * smooth(1 - Math.max(0, d - e.scale.x * .5) / 4)); }
  if (bare) grass = 0; const mix = (a, b) => a + (b - a) * f.influence, rockiness = mix(original.rockiness, hard), seagrassSuitability = mix(original.seagrassSuitability, grass), depthM = base.surfaceY - floor.height;
  return { ...original, floorY: floor.height, depthM, rockiness, seagrassSuitability, sandOpening: mix(original.sandOpening, (1 - hard) * (1 - grass)),
    substrate: f.influence < .5 ? original.substrate : bare ? 'rock' : 'sand', habitat: depthM > 18.5 ? 'slope' : f.influence < .5 ? original.habitat : bare ? 'reef' : grass > .4 ? 'seagrass' : 'sand', bedSlope: Math.hypot(floor.normal.x, floor.normal.z) / floor.normal.y };
}
