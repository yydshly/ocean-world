import { livingSeabedFloorSurface } from './livingSeabedRelief.js';
import { oceanRockHeight, oceanRockMesh, oceanRockSurface } from './oceanRockShape.js';
import { sceneElementHeight, sceneElementMesh } from './oceanSceneElements.js';
import { LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites, livingShallowsPropGroundY, livingShallowsPropWorldVertex } from './livingShallowsGeneration.js';

const OWNER = 64, WIDTH = 384, DEPTH = 128, ROW = WIDTH + 1, GUARD = 16, TAU = Math.PI * 2;
const models = new WeakMap(), coverCaches = new WeakMap();
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const stamp = value => JSON.stringify(value), clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const radial = e => Math.hypot(e.scale.x, e.scale.z) * .6 + .15;
const ring = (x, z, r) => [{ x, z }, ...Array.from({ length: 12 }, (_, i) => ({ x: x + Math.cos(i * TAU / 12) * r, z: z + Math.sin(i * TAU / 12) * r }))];
export const COASTAL_SEASCAPE_ANCHOR = Object.freeze({ cx: 150, cz: 4 });
const controls = [[24, 48], [90, 38], [148, 62], [192, 92], [258, 70], [314, 40], [360, 90]];
export const COASTAL_SEASCAPE_ROUTE_STOPS = freeze([{ id: 'coastal-life-belt', label: '连续浅海生活带', x: 150 * OWNER + controls[0][0], z: 4 * OWNER + controls[0][1], heading: 0, entryAcrossM: 1 }]);
function random(seed, salt) { let h = 2166136261; for (const c of `${typeof seed}:${seed}|living-coastal-v7|${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function source(input, cx, cz) { const base = input.baseGenerator ?? input;
  if (base.profile !== 'living-shallows-v1' || cx !== COASTAL_SEASCAPE_ANCHOR.cx || cz !== COASTAL_SEASCAPE_ANCHOR.cz) throw new TypeError('The finite coastal sample requires its explicit 150,4 twelve-owner living-shallows origin.');
  const chunks = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => base.chunk(cx + dx, cz + dz))), ids = new Set(chunks.map(c => c.id)), halo = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) { const c = base.chunk(cx + dx, cz + dz); if (!ids.has(c.id)) halo.push(...c.elements); }
  return { base, chunks, halo, origin: { x: cx * OWNER, z: cz * OWNER } };
}
/** Shared world-coordinate composition. Labels alone do not create support. */
export function coastalSeascapeFacies(plan, x, z) { if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Coastal facies requires finite world metres.');
  const lx = x - plan.group.origin.x, lz = z - plan.group.origin.z, edge = Math.min(lx, WIDTH - lx, lz, DEPTH - lz), influence = smooth((edge - GUARD) / 18), along = clamp(lx + 5 * Math.sin((lz - 64) / 42), 0, WIDTH),
    values = [Math.exp(-(((along - 58) / 57) ** 2)), Math.exp(-(((along - 151) / 49) ** 2)), Math.exp(-(((along - 242) / 55) ** 2)), Math.exp(-(((along - 340) / 47) ** 2))], names = ['reef', 'sand', 'meadow', 'slope'], sum = values.reduce((a, b) => a + b, 0), result = { influence };
  names.forEach((name, i) => result[name] = values[i] / sum); result.dominant = names[values.indexOf(Math.max(...values))]; return result;
}
export function coastalSeascapeAnimalAllocation(plan) { const f = coastalSeascapeFacies(plan, plan.cx * OWNER + 32, plan.cz * OWNER + 32).dominant,
    recipe = { reef: { native: 8, guild: 4, diversity: 4, benthic: 4 }, sand: { native: 8, diversity: 4, benthic: 4, meadow: 4 },
      meadow: { native: 6, diversity: 3, benthic: 4, meadow: 4, turtles: 3 }, slope: { native: 4, openWater: 3, diversity: 3, benthic: 2, shoal: 8 } };
  return freeze({ facies: f, native: 0, guild: 0, openWater: 0, diversity: 0, benthic: 0, meadow: 0, turtles: 0, shoal: 0, ...recipe[f], total: 20 });
}
function world(e, x, z) { const c = Math.cos(e.rotation), s = Math.sin(e.rotation); return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c }; }
function within(e, origin, margin = GUARD) { const r = radial(e); return e.x - r >= origin.x + margin && e.x + r <= origin.x + WIDTH - margin && e.z - r >= origin.z + margin && e.z + r <= origin.z + DEPTH - margin; }
function floorView(base, plans) { const byId = new Map(plans.map(p => [p.id, p])); return { floorSurface: (x, z) => livingSeabedFloorSurface(base, byId.get(`${Math.floor(x / OWNER)},${Math.floor(z / OWNER)}`), x, z) }; }
function hardHeight(view, rows, x, z) { let height = view.floorSurface(x, z).height;
  for (const e of rows) { if (!['rock', 'driftwood', 'bottle'].includes(e.kind) || Math.hypot(e.x - x, e.z - z) > radial(e)) continue; const y = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true); if (y !== null) height = Math.max(height, y); } return height; }
const clearSoft = (view, rows, p, radius) => ring(p.x, p.z, radius).every(q => hardHeight(view, rows, q.x, q.z) <= view.floorSurface(q.x, q.z).height + .035);
function protection(rows) { const bins = new Map();
  // Preserve the vertices of each one-metre triangle under a retained full
  // footprint, so interpolation also preserves the original support normal.
  for (const e of rows) { const r = radial(e) + 1.5, reach = r + 18, p = { x: e.x, z: e.z, r }; for (let iz = Math.floor((e.z - reach) / 16); iz <= Math.floor((e.z + reach) / 16); iz++) for (let ix = Math.floor((e.x - reach) / 16); ix <= Math.floor((e.x + reach) / 16); ix++) { const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p); } }
  return (x, z) => (bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []).reduce((m, p) => Math.min(m, smooth((Math.hypot(x - p.x, z - p.z) - p.r) / 18)), 1);
}
function amplitudeLimit(baseline, unit) { let a = 1; const permitted = .6499 ** 2;
  for (let z = 0; z < DEPTH; z++) for (let x = 0; x < WIDTH; x++) { const i = z * ROW + x; for (const [p, q, r] of [[i, i + 1, i + ROW], [i + ROW + 1, i + ROW, i + 1]]) { const bx = baseline[q] - baseline[p], bz = baseline[r] - baseline[p], ux = unit[q] - unit[p], uz = unit[r] - unit[p], bb = bx * bx + bz * bz, uu = ux * ux + uz * uz, dot = bx * ux + bz * uz;
    if (bb > permitted) throw new RangeError('Original coastal bed exceeds the finite slope gate.'); if (uu > 1e-16) a = Math.min(a, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu); } }
  return clamp(a * .999);
}
function measurements(heights, baseline, width, depth, row, origin, surfaceY) { let deltaMinM = Infinity, deltaMaxM = -Infinity, minDepthM = Infinity, maxDepthM = -Infinity, maxSlope = 0, mostDisplaced = null;
  for (let i = 0; i < heights.length; i++) { const delta = heights[i] - baseline[i]; deltaMinM = Math.min(deltaMinM, delta); deltaMaxM = Math.max(deltaMaxM, delta); minDepthM = Math.min(minDepthM, surfaceY - heights[i]); maxDepthM = Math.max(maxDepthM, surfaceY - heights[i]); if (!mostDisplaced || Math.abs(delta) > Math.abs(mostDisplaced.deltaM)) mostDisplaced = { x: origin.x + i % row, z: origin.z + Math.floor(i / row), deltaM: delta }; }
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) { const i = z * row + x; maxSlope = Math.max(maxSlope, Math.hypot(heights[i + 1] - heights[i], heights[i + row] - heights[i]), Math.hypot(heights[i + row + 1] - heights[i + row], heights[i + row + 1] - heights[i + 1])); }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, minDepthM, maxDepthM, maxSlope, mostDisplaced };
}
function distanceToPath(p, points) { let best = Infinity; for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)); best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)); } return best; }
function route(base, view, retained, origin) {
  const cache = new Map(), allowed = (x, z) => { const key = `${x},${z}`; if (cache.has(key)) return cache.get(key); const p = { x: origin.x + x, z: origin.z + z }, d = base.surfaceY - view.floorSurface(p.x, p.z).height,
      yes = x >= 22 && x <= WIDTH - 22 && z >= 22 && z <= DEPTH - 22 && d >= 3 && d <= 28 && clearSoft(view, retained, p, 1.1) && retained.every(e => !['coral', 'seagrass', 'algae', 'driftwood', 'bottle'].includes(e.kind) || Math.hypot(e.x - p.x, e.z - p.z) > radial(e) + 1.1); cache.set(key, yes); return yes; };
  const snap = point => { for (const r of [0, 2, 4, 6, 8, 10, 12]) for (const [dx, dz] of r ? [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] : [[0, 0]]) if (allowed(point[0] + dx, point[1] + dz)) return [point[0] + dx, point[1] + dz]; throw new RangeError('A coastal path landmark has no retained-host clearance.'); };
  const goals = controls.map(snap); if (stamp(goals[0]) !== stamp(controls[0])) throw new RangeError('The explicit coastal entry has no actual one-metre clearance.');
  function join(start, end) { const key = (x, z) => `${x},${z}`, costs = new Map([[key(...start), 0]]), parents = new Map(), open = [{ p: start, score: Math.hypot(end[0] - start[0], end[1] - start[1]) }], closed = new Set();
    while (open.length) { open.sort((a, b) => b.score - a.score); const current = open.pop().p, id = key(...current); if (closed.has(id)) continue; if (id === key(...end)) { const output = [current]; let k = id; while (parents.has(k)) { const p = parents.get(k); output.push(p); k = key(...p); } return output.reverse(); } closed.add(id);
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) { const p = [current[0] + dx, current[1] + dz], next = key(...p); if (closed.has(next) || !allowed(...p) || !allowed(current[0] + dx / 2, current[1] + dz / 2)) continue; const cost = costs.get(id) + Math.hypot(dx, dz); if (cost >= (costs.get(next) ?? Infinity)) continue; costs.set(next, cost); parents.set(next, current); open.push({ p, score: cost + Math.hypot(end[0] - p[0], end[1] - p[1]) }); }
    } throw new RangeError('The coastal sand path cannot connect around retained boundary hosts.'); }
  let points = []; for (let i = 1; i < goals.length; i++) points.push(...join(goals[i - 1], goals[i]).slice(i === 1 ? 0 : 1));
  const original = points; for (let iteration = 0; iteration < 2; iteration++) { const next = [points[0]]; for (let i = 1; i < points.length; i++) for (const t of [.25, .75]) next.push([points[i - 1][0] * (1 - t) + points[i][0] * t, points[i - 1][1] * (1 - t) + points[i][1] * t]); next.push(points.at(-1)); points = next; }
  if (points.some(p => !allowed(...p))) points = original;
  const full = points.map(([x, z]) => { const p = { x: origin.x + x, z: origin.z + z }, bedY = view.floorSurface(p.x, p.z).height; return { ...p, y: bedY + 2, bedY }; });
  let sM = 0; full.forEach((p, i) => { if (i) sM += Math.hypot(p.x - full[i - 1].x, p.y - full[i - 1].y, p.z - full[i - 1].z); p.sM = sM; const q = full[Math.min(full.length - 1, i + 1)], prev = full[Math.max(0, i - 1)]; p.heading = Math.atan2(q.z - prev.z, q.x - prev.x); });
  if (sM < 300 || sM > 500) throw new RangeError(`Actual coastal path length ${sM}m is outside its finite 300–500m contract.`); return full;
}
function build(base, chunks, halo, origin) {
  const original = chunks.flatMap(c => c.elements), protectedIds = new Set(original.filter(e => !within(e, origin)).map(e => e.id));
  for (const e of original) if (e.attachmentId && protectedIds.has(e.attachmentId)) protectedIds.add(e.id);
  const retained = original.filter(e => protectedIds.has(e.id)), external = halo.filter(e => !within(e, origin, -24)), mask = protection([...retained, ...external]), skeleton = { group: { origin } }, baseline = [], unit = [];
  for (let z = 0; z <= DEPTH; z++) for (let x = 0; x <= WIDTH; x++) { const wx = origin.x + x, wz = origin.z + z, y = base.floorVertex(wx, wz), f = coastalSeascapeFacies(skeleton, wx, wz), target = -4.8 * f.reef - 6.3 * f.sand - 4.7 * f.meadow - 15.5 * f.slope + .22 * Math.sin((wx * .77 + wz * .51) / 32); baseline.push(y); unit.push((target - y) * f.influence * mask(wx, wz)); }
  const amplitude = amplitudeLimit(baseline, unit), heights = baseline.map((y, i) => Math.fround(y + unit[i] * amplitude)), measured = measurements(heights, baseline, WIDTH, DEPTH, ROW, origin, base.surfaceY),
    group = { id: 'living-coastal-seascape:150,4', cx: 150, cz: 4, seed: base.seed, origin, ownerIds: chunks.map(c => c.id), widthM: WIDTH, depthM: DEPTH, outerGuardM: GUARD, gridSizeX: ROW, gridSizeZ: DEPTH + 1,
      facies: ['reef', 'sand', 'meadow', 'slope'], ...measured, controls: { amplitude, protectionRampM: 18, pathBodyRadiusM: 1, cameraHeightM: 2 }, retainedBoundaryIds: retained.map(e => e.id), coverElements: [] },
    plans = chunks.map(c => { const local = [], old = [], ox = (c.cx - 150) * OWNER, oz = (c.cz - 4) * OWNER; for (let z = 0; z <= OWNER; z++) for (let x = 0; x <= OWNER; x++) { const i = (oz + z) * ROW + ox + x; local.push(heights[i]); old.push(baseline[i]); }
      return { version: 7, id: c.id, cx: c.cx, cz: c.cz, seed: base.seed, theme: 'living-coastal-seascape', baseStamp: stamp(c), group,
        floorPatch: { gridSize: 65, spacingM: 1, widthM: OWNER, boundaryGuardM: 0, groupOuterGuardM: GUARD, heights: local, ...measurements(local, old, OWNER, OWNER, 65, c.origin, base.surfaceY) },
        elements: c.elements.filter(e => protectedIds.has(e.id)), retainedRockIds: c.elements.filter(e => e.kind === 'rock' && protectedIds.has(e.id)).map(e => e.id), newRockIds: [], ridgeIds: [],
        overview: { center: { x: c.origin.x + 32, z: c.origin.z + 32 }, heading: 0, extentM: 52 }, displayScope: 'Finite fresh-only twelve-owner coastal community: interior scenery is newly organized before ecological birth, outer bed and boundary host descriptors remain exact. Plants are scenery, not additional simulated biomass.' }; });
  const view = floorView(base, plans), path = route(base, view, [...retained, ...external], origin), all = [...retained], rocks = all.filter(e => e.kind === 'rock');
  const ownerAt = p => plans.find(q => q.cx === Math.floor(p.x / OWNER) && q.cz === Math.floor(p.z / OWNER));
  const fullFit = (e, plan) => { const r = radial(e); return within(e, origin) && e.x - r >= plan.cx * OWNER + .4 && e.x + r <= (plan.cx + 1) * OWNER - .4 && e.z - r >= plan.cz * OWNER + .4 && e.z + r <= (plan.cz + 1) * OWNER - .4; };
  const add = e => { const p = ownerAt(e); if (!p || p.elements.filter(q => q.kind === e.kind).length >= LIVING_SHALLOWS_ELEMENT_LIMITS[e.kind] || !fullFit(e, p) || distanceToPath(e, path) < radial(e) + 1.25) return false; p.elements.push(e); all.push(e); return true; };
  function at(s) { const i = path.findIndex(p => p.sM >= s); if (i <= 0) return path[Math.max(0, i)]; const a = path[i - 1], b = path[i], t = (s - a.sM) / (b.sM - a.sM); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.z - a.z, b.x - a.x) }; }
  for (let s = 8; s < path.at(-1).sM - 6; s += 18 + random(base.seed, `station:${Math.floor(s)}:gap`) * 8) { const station = at(s); for (const side of [-1, 1]) for (const reach of [11, 15, 19]) {
    const salt = `shoulder:${Math.floor(s)}:${side}`, heading = station.heading, width = 8 + random(base.seed, `${salt}:width`) * 4, e = { id: `coastal:150,4:${salt}`, kind: 'rock', profile: ['natural-a', 'natural-b', 'natural-c'][Math.floor(random(base.seed, `${salt}:profile`) * 3)],
      x: station.x - Math.sin(heading) * reach * side, z: station.z + Math.cos(heading) * reach * side, rotation: -heading + (random(base.seed, `${salt}:turn`) - .5) * .5, scale: { x: width, y: 2.4 + random(base.seed, `${salt}:height`) * 2.8, z: width * (.55 + random(base.seed, `${salt}:depth`) * .25) } };
    const mesh = oceanRockMesh(e.profile); let ground = Infinity; for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) { const q = world(e, mesh.positions[i], mesh.positions[i + 2]); ground = Math.min(ground, view.floorSurface(q.x, q.z).height); } e.y = ground - .06;
    if (all.some(q => Math.hypot(q.x - e.x, q.z - e.z) < radial(q) + radial(e) + .3)) continue; if (!add(e)) continue; const p = ownerAt(e); p.newRockIds.push(e.id); p.ridgeIds.push(e.id); rocks.push(e); break;
  } }
  for (const host of rocks.filter(e => e.id.startsWith('coastal:'))) { const f = coastalSeascapeFacies(skeleton, host.x, host.z), count = f.meadow > .55 ? 2 : 4;
    for (let index = 0; index < count; index++) { const angle = index * TAU / count + .31, q = world(host, Math.cos(angle) * .21, Math.sin(angle) * .21), y = oceanRockHeight(host, q.x, q.z), morphotype = ['branching', 'table', 'fan', 'branching'][index], width = 1.8 + random(base.seed, `${host.id}:coral:${index}`) * .9,
        e = { id: `${host.id}:coral:${index}`, kind: 'coral', attachmentId: host.id, morphotype, ...q, y, rotation: random(base.seed, `${host.id}:coral-turn:${index}`) * TAU, scale: { x: width, y: morphotype === 'table' ? .7 : 1.35 + random(base.seed, `${host.id}:coral-height:${index}`) * .5, z: width * .72 } };
      if (y === null || y < view.floorSurface(q.x, q.z).height + .25 || base.surfaceY - y < 3 || base.surfaceY - y > 22 || all.some(a => ['coral', 'algae'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) + .1)) continue; add(e);
    }
    for (let index = 0; index < 3; index++) { const a = index * TAU / 3 + .67, local = { x: Math.cos(a) * .30, z: Math.sin(a) * .30 }, srf = oceanRockSurface(host.profile, local.x, local.z); if (!srf) continue; const q = world(host, local.x, local.z), y = host.y + srf.height * host.scale.y, radius = .035, nx = srf.normal.x / host.scale.x, ny = srf.normal.y / host.scale.y, nz = srf.normal.z / host.scale.z, length = Math.hypot(nx, ny, nz), c = Math.cos(host.rotation), s = Math.sin(host.rotation),
        e = { id: `${host.id}:algae:${index}`, kind: 'algae', attachmentId: host.id, ...q, y, rotation: host.rotation, surfaceLocal: local, patchRadius: radius, normal: { x: (nx * c + nz * s) / length, y: ny / length, z: (-nx * s + nz * c) / length }, scale: { x: host.scale.x * radius * 2, y: .018, z: host.scale.z * radius * 2 } };
      if (y < view.floorSurface(q.x, q.z).height + .12 || all.some(a => ['coral', 'algae'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e))) continue; add(e);
    }
  }
  for (const p of plans) { const activity = livingShallowsSoftActivitySites(base.seed, p.cx, p.cz);
    for (let z = p.cz * OWNER + 2; z < (p.cz + 1) * OWNER - 2; z += 2.6) for (let x = p.cx * OWNER + 2; x < (p.cx + 1) * OWNER - 2; x += 2.6) { const salt = `grass:${x.toFixed(1)},${z.toFixed(1)}`, q = { x: x + (random(base.seed, `${salt}:x`) - .5) * .45, z: z + (random(base.seed, `${salt}:z`) - .5) * .45 }, f = coastalSeascapeFacies(skeleton, q.x, q.z), core = smooth((f.meadow - .24) / .43);
      if (f.meadow < .24 || random(base.seed, `${salt}:present`) > .18 + .79 * core) continue; const width = 1.20 + core * .55 + random(base.seed, `${salt}:width`) * .13, e = { id: `coastal:150,4:${salt}`, kind: 'seagrass', ...q, y: view.floorSurface(q.x, q.z).height, rotation: random(base.seed, `${salt}:rotation`) * TAU,
        scale: { x: width, y: .40 + core * .45 + random(base.seed, `${salt}:height`) * .10, z: width }, meadowBand: core > .7 ? 'dense-core' : 'thin-edge' };
      if (!ring(e.x, e.z, radial(e)).every(r => base.surfaceY - view.floorSurface(r.x, r.z).height >= 3 && base.surfaceY - view.floorSurface(r.x, r.z).height <= 20) || !clearSoft(view, rocks, e, radial(e)) || activity.some(a => Math.hypot(a.x - e.x, a.z - e.z) < radial(e) + .32) || all.some(a => ['coral', 'seagrass', 'driftwood', 'bottle'].includes(a.kind) && Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) - .35)) continue; add(e);
    }
    for (let index = 0; index < 48; index++) { const salt = `${p.id}:rubble:${index}`, x = p.cx * OWNER + 3 + random(base.seed, `${salt}:x`) * 58, z = p.cz * OWNER + 3 + random(base.seed, `${salt}:z`) * 58, width = .30 + random(base.seed, `${salt}:width`) * .50,
        e = { id: `coastal:150,4:${salt}`, kind: 'rubble', x, y: view.floorSurface(x, z).height, z, rotation: random(base.seed, `${salt}:turn`) * TAU, scale: { x: width, y: .08 + random(base.seed, `${salt}:height`) * .07, z: width * .75 } }; if (clearSoft(view, rocks, e, radial(e))) add(e); }
  }
  for (const [kind, sM, side] of [['bottle', 142, -1], ['driftwood', 213, 1]]) { const point = at(sM); for (const reach of [4, 6, 8, 10]) { const e = { id: `coastal:150,4:${kind}`, kind, x: point.x - Math.sin(point.heading) * reach * side, z: point.z + Math.cos(point.heading) * reach * side, rotation: -point.heading + .3, variant: 0,
      scale: kind === 'bottle' ? { x: .32, y: .078, z: .078 } : { x: 1.8, y: .16, z: .25 }, physicalState: kind === 'bottle' ? 'grounded-flooded' : 'grounded', ...(kind === 'bottle' ? { flooded: true, sealed: false } : {}) };
    if (!clearSoft(view, rocks, e, radial(e)) || all.some(a => Math.hypot(a.x - e.x, a.z - e.z) < radial(a) + radial(e) + .2)) continue; e.y = livingShallowsPropGroundY(view, e); if (add(e)) break; } }
  group.coverElements = all.filter(e => ['rock', 'seagrass'].includes(e.kind));
  group.routePath = path; group.routeLengthM = path.at(-1).sM; group.route = [{ ...COASTAL_SEASCAPE_ROUTE_STOPS[0], x: path[0].x, y: path[0].y, z: path[0].z, heading: path[0].heading }];
  const newRows = all.filter(e => e.id.startsWith('coastal:')), count = (rows, kind) => rows.filter(e => e.kind === kind).length;
  group.metrics = { rockCount: count(all, 'rock'), coralCount: count(all, 'coral'), grassCount: count(all, 'seagrass'), addedRockCount: count(newRows, 'rock'), addedCoralCount: count(newRows, 'coral'), addedAlgaeCount: count(newRows, 'algae'), addedGrassCount: count(newRows, 'seagrass'),
    driftwoodCount: count(all, 'driftwood'), bottleCount: count(all, 'bottle'), denseGrassCount: all.filter(e => e.meadowBand === 'dense-core').length, edgeGrassCount: all.filter(e => e.meadowBand === 'thin-edge').length,
    byFacies: Object.fromEntries(group.facies.map(f => [f, Object.fromEntries(['rock', 'coral', 'seagrass', 'algae', 'rubble'].map(kind => [kind, all.filter(e => e.kind === kind && coastalSeascapeFacies(skeleton, e.x, e.z).dominant === f).length]))])) };
  const pathChecks = path.flatMap(p => ring(p.x, p.z, 1)); if (pathChecks.some(p => !clearSoft(view, all, p, .1)) || path.some(p => all.some(e => ['coral', 'seagrass', 'algae', 'bottle', 'driftwood'].includes(e.kind) && Math.hypot(e.x - p.x, e.z - p.z) <= radial(e) + 1))) throw new RangeError('Final coastal entities block the physical body corridor.');
  group.pathMetrics = { lengthM: group.routeLengthM, pointCount: path.length, bodyRadiusM: 1, cameraHeightM: 2, maximumPointGapM: Math.max(...path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y, p.z - path[i].z))),
    clearChecks: pathChecks.length, minimumDepthM: Math.min(...path.map(p => base.surfaceY - p.bedY)), maximumDepthM: Math.max(...path.map(p => base.surfaceY - p.bedY)), actualEntityClearance: true };
  if (group.metrics.addedRockCount < 12 || group.metrics.addedCoralCount < 20 || group.metrics.addedGrassCount < 80 || !group.metrics.denseGrassCount || !group.metrics.edgeGrassCount || group.facies.some(f => !group.metrics.byFacies[f].rock)) throw new RangeError(`The coastal plan has no complete admitted community: ${stamp(group.metrics)}`);
  for (const p of plans) { if (Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS).some(([kind, limit]) => p.elements.filter(e => e.kind === kind).length > limit)) throw new RangeError(`Coastal owner ${p.id} exceeds a native element budget.`);
    const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 }; let minDepthM = Infinity, maxDepthM = -Infinity;
    for (let z = 4; z < OWNER; z += 8) for (let x = 4; x < OWNER; x += 8) { const s = sampleLivingCoastalSeascape(base, p, p.cx * OWNER + x, p.cz * OWNER + z); habitats[s.habitat]++; minDepthM = Math.min(minDepthM, s.depthM); maxDepthM = Math.max(maxDepthM, s.depthM); }
    const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]); p.habitatComposition = { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
    p.animalAllocation = coastalSeascapeAnimalAllocation(p);
  }
  return freeze(plans);
}
function model(input, cx, cz) { const { base, chunks, halo, origin } = source(input, cx, cz); let entries = models.get(base); if (!entries) { entries = new Map(); models.set(base, entries); } const key = `${cx},${cz}`;
  if (!entries.has(key)) { let entry; try { entry = { plans: build(base, chunks, halo, origin) }; } catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; } entries.set(key, entry); }
  const entry = entries.get(key); if (entry.declined) throw new RangeError(entry.declined); return entry.plans;
}
/** Only the calling persistence adapter may publish all twelve absent owners. */
export function createLivingCoastalSeascapePlans(base, cx = 150, cz = 4) { return model(base, cx, cz); }
export function validateLivingCoastalSeascapePlan(base, plan) { try { if (!plan || plan.version !== 7 || plan.theme !== 'living-coastal-seascape' || !plan.group || plan.id !== `${plan.cx},${plan.cz}` || plan.group.cx !== 150 || plan.group.cz !== 4) return false;
  const expected = model(base, plan.group.cx, plan.group.cz).find(p => p.id === plan.id); return Boolean(expected && stamp(plan) === stamp(expected)); } catch { return false; } }
function coverRows(base, group, x, z) { let index = coverCaches.get(group); if (!index) { index = new Map(); const rows = [...group.coverElements];
    for (const e of rows) { const reach = radial(e) + 5; for (let iz = Math.floor((e.z - reach) / 8); iz <= Math.floor((e.z + reach) / 8); iz++) for (let ix = Math.floor((e.x - reach) / 8); ix <= Math.floor((e.x + reach) / 8); ix++) { const k = `${ix},${iz}`; if (!index.has(k)) index.set(k, []); index.get(k).push(e); } } coverCaches.set(group, index); }
  return index.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []; }
export function sampleLivingCoastalSeascape(input, plan, x, z) { const base = input.baseGenerator ?? input, original = base.sample(x, z), f = coastalSeascapeFacies(plan, x, z); if (!f.influence) return original;
  const floor = livingSeabedFloorSurface(base, plan, x, z); let hard = 0, grass = 0, bare = false;
  for (const e of coverRows(base, plan.group, x, z)) { const d = Math.hypot(e.x - x, e.z - z); if (e.kind === 'rock') { const height = oceanRockHeight(e, x, z); if (height !== null && height > floor.height + .06) { bare = true; hard = 1; } hard = Math.max(hard, .28 * smooth(1 - Math.max(0, d - radial(e) * .75) / 5)); }
    else grass = Math.max(grass, .94 * smooth(1 - Math.max(0, d - e.scale.x * .5) / 4)); }
  if (bare) grass = 0; const mix = (a, b) => a + (b - a) * f.influence, rockiness = mix(original.rockiness, hard), seagrassSuitability = mix(original.seagrassSuitability, grass), depthM = base.surfaceY - floor.height;
  return { ...original, floorY: floor.height, depthM, rockiness, seagrassSuitability, sandOpening: mix(original.sandOpening, (1 - hard) * (1 - grass)),
    substrate: f.influence < .5 ? original.substrate : bare ? 'rock' : 'sand', habitat: depthM > 18.5 ? 'slope' : f.influence < .5 ? original.habitat : bare ? 'reef' : grass > .4 ? 'seagrass' : 'sand', bedSlope: Math.hypot(floor.normal.x, floor.normal.z) / floor.normal.y };
}
