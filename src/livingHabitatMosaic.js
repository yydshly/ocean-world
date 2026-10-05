import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites } from './livingShallowsGeneration.js';

const SIZE = 64, GUARD = 6, TAU = Math.PI * 2;
const THEMES = ['patch-reef', 'meadow-edge'];
const KINDS = Object.keys(LIVING_SHALLOWS_ELEMENT_LIMITS);
const stamp = value => JSON.stringify(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const finite = p => p && ['x', 'y', 'z'].every(a => Number.isFinite(p[a]));
function random(seed, x, z, salt) {
  let h = 2166136261;
  for (const ch of `${seed}|living-mosaic-v2|${x},${z}|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function field(base, x, z) {
  const gx = x / 180, gz = z / 180, ix = Math.floor(gx), iz = Math.floor(gz);
  const smooth = t => t * t * (3 - 2 * t), tx = smooth(gx - ix), tz = smooth(gz - iz);
  const mix = (a, b, t) => a + (b - a) * t, r = (dx, dz) => random(base.seed, ix + dx, iz + dz, 'meadow-field');
  return mix(mix(r(0, 0), r(1, 0), tx), mix(r(0, 1), r(1, 1), tx), tz);
}
function source(baseGenerator, cx, cz) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz))
    throw new TypeError('Habitat mosaics require living shallows and integer owner coordinates.');
  return { base, chunk: base.chunk(cx, cz) };
}
function boundaryRock(e, bounds) {
  return Math.min(e.x - bounds.minX, bounds.maxX - e.x, e.z - bounds.minZ, bounds.maxZ - e.z) <= Math.hypot(e.scale.x, e.scale.z) * .5 + GUARD;
}
function fits(e, b) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  const hx = .5 * (Math.abs(c) * e.scale.x + Math.abs(s) * e.scale.z), hz = .5 * (Math.abs(s) * e.scale.x + Math.abs(c) * e.scale.z);
  return e.x - hx >= b.minX + GUARD && e.x + hx <= b.maxX - GUARD && e.z - hz >= b.minZ + GUARD && e.z + hz <= b.maxZ - GUARD;
}
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}
function ring(x, z, radius, n = 8) {
  return [{ x, z }, ...Array.from({ length: n }, (_, i) => ({ x: x + Math.cos(i * TAU / n) * radius, z: z + Math.sin(i * TAU / n) * radius }))];
}
function neighbourhood(base, cx, cz) {
  const elements = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) elements.push(...base.chunk(cx + dx, cz + dz).elements);
  return elements;
}
function height(base, rocks, x, z) {
  let value = base.floorSurface(x, z).height;
  for (const r of rocks) { const y = oceanRockHeight(r, x, z); if (y !== null) value = Math.max(value, y); }
  return value;
}
function clearFloor(base, rocks, p, radius, tolerance = .035) {
  return ring(p.x, p.z, radius).every(q => height(base, rocks, q.x, q.z) <= base.floorSurface(q.x, q.z).height + tolerance);
}
function soft(base, p, maxDepth = 20) {
  const s = base.sample(p.x, p.z); return s.substrate !== 'rock' && s.depthM >= 3 && s.depthM <= maxDepth;
}
function groundPoints(e) {
  return [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, z]) => world(e, x, z));
}
function protects(rows, rocks) {
  return rows.every(e => ring(e.x, e.z, Math.hypot(e.scale.x, e.scale.z) * .5).every(p => rocks.every(r => {
    const y = oceanRockHeight(r, p.x, p.z);
    return y === null || y <= e.y + (e.kind === 'seagrass' || e.kind === 'rubble' ? .035 : .012);
  })));
}
function count(elements, kind) { return elements.filter(e => e.kind === kind).length; }
function grassDescriptor(base, chunk, gx, gz) {
  const x = gx * 3 + (random(base.seed, gx, gz, 'grass-x') - .5) * 1.1, z = gz * 3 + (random(base.seed, gx, gz, 'grass-z') - .5) * 1.1;
  const width = 1.6 + .3 * random(base.seed, gx, gz, 'grass-width');
  return { id: `living-mosaic:${chunk.id}:grass:${gx},${gz}`, kind: 'seagrass', x, y: base.floorSurface(x, z).height, z,
    rotation: random(base.seed, gx, gz, 'grass-turn') * TAU, scale: { x: width, y: .6 + .3 * random(base.seed, gx, gz, 'grass-height'), z: width } };
}
function grassFieldAdmits(base, x, z) {
  const phase = random(base.seed, 0, 0, 'sand-gap-phase') * TAU;
  return field(base, x, z) >= .30 && Math.abs(Math.sin((x * .86 + z * .51) / 24 + phase)) >= .09;
}
function sedimentWindow(base, chunk, rocks) {
  const candidates = [];
  for (const dz of [-12, 0, 12]) for (const dx of [-12, 0, 12]) {
    const p = { x: chunk.origin.x + 32 + dx, z: chunk.origin.z + 32 + dz };
    if (field(base, p.x, p.z) < .30) continue;
    if (!ring(p.x, p.z, 9, 16).every(q => soft(base, q) && clearFloor(base, rocks, q, .9))) continue;
    candidates.push({ ...p, score: field(base, p.x, p.z) + .1 * random(base.seed, chunk.cx, chunk.cz, `window:${dx},${dz}`) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

/** Coordinate fields choose a theme; neither saved owners nor camera position
 * enter this decision. The 180 m meadow field is sampled in world coordinates.
 * Admission can decline when the actual bed/retained hosts leave no whole bed. */
export function selectLivingHabitatMosaicTheme(baseGenerator, cx, cz) {
  const { base, chunk } = source(baseGenerator, cx, cz), all = neighbourhood(base, cx, cz), rocks = all.filter(e => e.kind === 'rock');
  let sediment = 0, usableDepth = 0;
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const p = { x: chunk.origin.x + 4 + ix * 8, z: chunk.origin.z + 4 + iz * 8 }, s = base.sample(p.x, p.z);
    if (s.depthM >= 3 && s.depthM <= 22) usableDepth++;
    if (soft(base, p)) sediment++;
  }
  if (sediment >= 36 && sedimentWindow(base, chunk, rocks)) return 'meadow-edge';
  if (sediment >= 8 && usableDepth >= 48 && chunk.counts.rock >= 3 && chunk.counts.seagrass <= 64 &&
    chunk.elements.some(e => e.kind === 'rock' && !boundaryRock(e, chunk.bounds))) return 'patch-reef';
  return null;
}

function corridorPoints(center, heading) {
  const c = Math.cos(heading), s = Math.sin(heading), points = [];
  for (const along of [-14, -7, 0, 7, 14]) for (const across of [-3, 0, 3])
    points.push({ x: center.x + along * c + across * s, z: center.z - along * s + across * c });
  return points;
}
function patchRocks(base, chunk, retainedRows, nearbyRows, oldRocks) {
  const removed = new Set(oldRocks.filter(e => !boundaryRock(e, chunk.bounds)).map(e => e.id));
  const hard = nearbyRows.filter(e => e.kind === 'rock' && !removed.has(e.id));
  const oldHard = nearbyRows.filter(e => e.kind === 'rock');
  const sites = livingShallowsSoftActivitySites(base.seed, chunk.cx, chunk.cz)
    .filter(p => soft(base, p) && clearFloor(base, oldHard, p, .6));
  const protectedRows = retainedRows.filter(e => e.attachmentId || ['seagrass', 'driftwood', 'bottle'].includes(e.kind));
  const corridors = [];
  for (const dz of [-10, 0, 10]) for (const dx of [-10, 0, 10]) for (const heading of [0, Math.PI / 2]) {
    const center = { x: chunk.origin.x + 32 + dx, z: chunk.origin.z + 32 + dz }, points = corridorPoints(center, heading);
    const suitable = points.filter(p => soft(base, p, 22) && clearFloor(base, hard, p, .7)).length;
    if (suitable >= 9) corridors.push({ center, heading, points, suitable });
  }
  corridors.sort((a, b) => b.suitable - a.suitable);
  for (const corridor of corridors.slice(0, 8)) {
    const candidates = oldRocks.filter(e => removed.has(e.id)).map(e => ({ x: e.x, z: e.z, salt: `old:${e.id}` }));
    for (const z of [15, 23, 31, 39, 47]) for (const x of [15, 23, 31, 39, 47]) {
      const salt = `grid:${x},${z}`;
      candidates.push({ x: chunk.origin.x + x + (random(base.seed, chunk.cx, chunk.cz, `${salt}:x`) - .5) * 3,
        z: chunk.origin.z + z + (random(base.seed, chunk.cx, chunk.cz, `${salt}:z`) - .5) * 3, salt });
    }
    candidates.sort((a, b) => random(base.seed, chunk.cx, chunk.cz, a.salt) - random(base.seed, chunk.cx, chunk.cz, b.salt));
    const selected = [];
    for (const p of candidates) {
      const index = selected.length, width = 10 + random(base.seed, chunk.cx, chunk.cz, `${p.salt}:width`) * 5;
      const rock = { id: `living-mosaic:${chunk.id}:rock:${index}`, kind: 'rock', profile: index % 2 ? 'natural-a' : 'natural-c',
        x: p.x, y: base.floorSurface(p.x, p.z).height - .18, z: p.z,
        rotation: random(base.seed, chunk.cx, chunk.cz, `${p.salt}:turn`) * TAU,
        scale: { x: width, y: 3 + 2 * random(base.seed, chunk.cx, chunk.cz, `${p.salt}:height`), z: width * (.62 + .23 * random(base.seed, chunk.cx, chunk.cz, `${p.salt}:depth`)) } };
      if (!fits(rock, chunk.bounds) || !protects(protectedRows, [rock]) || selected.some(r =>
        Math.hypot(r.x - rock.x, r.z - rock.z) < (Math.max(r.scale.x, r.scale.z) + width) * .5 + 2.2)) continue;
      if (sites.some(s => !clearFloor(base, [rock], s, .6))) continue;
      const clear = corridor.points.filter(q => soft(base, q, 22) && clearFloor(base, [...hard, ...selected, rock], q, .7)).length;
      if (clear < 9) continue;
      selected.push(rock); if (selected.length === 4) break;
    }
    if (selected.length >= 3) return { rocks: selected, hard: [...hard, ...selected], corridor, sites };
  }
  throw new RangeError(`Owner ${chunk.id} has no safe dispersed reef and sediment passage.`);
}
function attach(base, chunk, elements, rocks, allHard) {
  for (const [ri, host] of rocks.entries()) {
    for (let index = 0; index < 4 && count(elements, 'coral') < 36; index++) {
      const angle = index * TAU / 4 + .17, p = world(host, Math.cos(angle) * .16, Math.sin(angle) * .16);
      const y = oceanRockHeight(host, p.x, p.z), width = 2 + .9 * random(base.seed, chunk.cx, chunk.cz, `coral:${ri}:${index}`);
      const morphotype = ['branching', 'table', 'fan', 'branching'][index];
      const e = { id: `living-mosaic:${chunk.id}:coral:${ri}:${index}`, kind: 'coral', morphotype, attachmentId: host.id,
        x: p.x, y, z: p.z, rotation: random(base.seed, chunk.cx, chunk.cz, `coral-turn:${ri}:${index}`) * TAU,
        scale: { x: width, y: morphotype === 'table' ? 1 : 1.5 + .5 * random(base.seed, chunk.cx, chunk.cz, `coral-height:${ri}:${index}`), z: width * .75 } };
      if (y === null || base.sample(p.x, p.z).depthM > 22 || y < base.floorSurface(p.x, p.z).height + .25 || !fits(e, chunk.bounds) ||
        height(base, allHard, p.x, p.z) > y + 1e-6 || elements.some(q => ['coral', 'algae'].includes(q.kind) &&
          Math.hypot(q.x - p.x, q.z - p.z) < (Math.max(q.scale.x, q.scale.z) + width) * .5 + .2)) continue;
      elements.push(e);
    }
    for (let index = 0; index < 3 && count(elements, 'algae') < 48; index++) {
      const angle = index * TAU / 3 + .8, localPoint = { x: Math.cos(angle) * .29, z: Math.sin(angle) * .29 };
      const surface = oceanRockSurface(host.profile, localPoint.x, localPoint.z); if (!surface) continue;
      const p = world(host, localPoint.x, localPoint.z), y = host.y + surface.height * host.scale.y, patchRadius = .037;
      const c = Math.cos(host.rotation), s = Math.sin(host.rotation), nx = surface.normal.x / host.scale.x,
        ny = surface.normal.y / host.scale.y, nz = surface.normal.z / host.scale.z, n = Math.hypot(nx, ny, nz);
      const e = { id: `living-mosaic:${chunk.id}:algae:${ri}:${index}`, kind: 'algae', attachmentId: host.id,
        x: p.x, y, z: p.z, surfaceLocal: localPoint, patchRadius, rotation: host.rotation,
        normal: { x: (nx * c + nz * s) / n, y: ny / n, z: (-nx * s + nz * c) / n },
        scale: { x: host.scale.x * patchRadius * 2, y: .018, z: host.scale.z * patchRadius * 2 } };
      if (!fits(e, chunk.bounds) || y < base.floorSurface(p.x, p.z).height + .12 || height(base, allHard, p.x, p.z) > y + 1e-6 ||
        elements.some(q => ['coral', 'algae'].includes(q.kind) && Math.hypot(q.x - p.x, q.z - p.z) <
          Math.max(q.scale.x, q.scale.z) * .5 + Math.max(e.scale.x, e.scale.z) * .5 + .1)) continue;
      elements.push(e);
    }
  }
}
function grassLegal(base, rocks, obstacleRows, sites, e) {
  if (!soft(base, e) || Math.abs(e.y - base.floorSurface(e.x, e.z).height) > 1e-7 || !clearFloor(base, rocks, e, Math.max(e.scale.x, e.scale.z) * .5)) return false;
  if (!groundPoints(e).every(p => soft(base, p) && clearFloor(base, rocks, p, .05))) return false;
  const r = Math.max(e.scale.x, e.scale.z) * .5;
  return !obstacleRows.some(q => Math.hypot(q.x - e.x, q.z - e.z) < Math.hypot(q.scale.x, q.scale.z) * .5 + r + .2) &&
    !sites.some(p => Math.hypot(p.x - e.x, p.z - e.z) < r + .32);
}
function meadowGrass(base, chunk, elements, allRows, center) {
  const rocks = allRows.filter(e => e.kind === 'rock'), obstacles = allRows.filter(e => ['coral', 'driftwood', 'bottle'].includes(e.kind));
  const sites = livingShallowsSoftActivitySites(base.seed, chunk.cx, chunk.cz).filter(p => soft(base, p) && clearFloor(base, rocks, p, .6));
  const candidates = [], oldGrass = elements.filter(e => e.kind === 'seagrass');
  for (let gz = Math.floor(chunk.bounds.minZ / 3); gz * 3 < chunk.bounds.maxZ; gz++) for (let gx = Math.floor(chunk.bounds.minX / 3); gx * 3 < chunk.bounds.maxX; gx++) {
    const e = grassDescriptor(base, chunk, gx, gz), { x, z } = e, width = e.scale.x;
    // Broad patch edges and a narrow world-oriented sand gap do not restart at
    // owner boundaries. Root spacing leaves body-sized soft-site gaps as well.
    if (!grassFieldAdmits(base, x, z)) continue;
    if (!fits(e, chunk.bounds) || !grassLegal(base, rocks, obstacles, sites, e) || oldGrass.some(q =>
      Math.hypot(q.x - x, q.z - z) < (q.scale.x + width) * .46)) continue;
    candidates.push({ e, score: Math.hypot(x - center.x, z - center.z) + random(base.seed, gx, gz, 'grass-order') * .5 });
  }
  candidates.sort((a, b) => a.score - b.score);
  elements.push(...candidates.slice(0, Math.max(0, 256 - oldGrass.length)).map(p => p.e));
  const roots = elements.filter(e => e.kind === 'seagrass' && Math.hypot(e.x - center.x, e.z - center.z) <= 9);
  if (roots.length < 16) throw new RangeError(`Owner ${chunk.id} cannot form a complete sediment meadow around its retained hosts.`);
  return { diameterM: 18, rootsWithin9m: roots.length, worldFieldM: 180, sandGapWidthM: 4.3, softSites: sites };
}

/** Replacement descriptors are a scene plan, not counts of organisms/biomass.
 * Only an unvisited owner's successful atomic birth may publish this record. */
export function createLivingHabitatMosaic(baseGenerator, cx, cz, { theme = selectLivingHabitatMosaicTheme(baseGenerator, cx, cz) } = {}) {
  const { base, chunk } = source(baseGenerator, cx, cz);
  if (!THEMES.includes(theme)) throw new RangeError(`Owner ${chunk.id} has no admitted habitat-mosaic theme.`);
  const all = neighbourhood(base, cx, cz), oldRocks = chunk.elements.filter(e => e.kind === 'rock');
  const retained = theme === 'meadow-edge' ? oldRocks : oldRocks.filter(e => boundaryRock(e, chunk.bounds));
  const keep = new Set(retained.map(e => e.id));
  let elements = theme === 'meadow-edge' ? [...chunk.elements] : chunk.elements.filter(e => e.kind !== 'rock' && !e.attachmentId || keep.has(e.id) || keep.has(e.attachmentId));
  let newRocks = [], overview, meadow = null, corridor = null;
  if (theme === 'patch-reef') {
    const chosen = patchRocks(base, chunk, elements, all, oldRocks); newRocks = chosen.rocks;
    elements = elements.filter(e => e.kind !== 'rubble' || clearFloor(base, chosen.hard, e, Math.max(e.scale.x, e.scale.z) * .5));
    elements.push(...newRocks); attach(base, chunk, elements, newRocks, chosen.hard);
    const clearSamples = chosen.corridor.points.filter(p => soft(base, p, 22) && clearFloor(base, chosen.hard, p, .7)).length;
    corridor = { center: chosen.corridor.center, heading: chosen.corridor.heading, lengthM: 28, openingM: 6, clearSamples, floorUnchanged: true };
    overview = { center: corridor.center, heading: corridor.heading, extentM: 52 };
  } else {
    const window = sedimentWindow(base, chunk, all.filter(e => e.kind === 'rock'));
    if (!window) throw new RangeError(`Owner ${chunk.id} has no legal 18 metre sediment meadow.`);
    const center = { x: window.x, z: window.z }; meadow = meadowGrass(base, chunk, elements, all, center);
    overview = { center, heading: Math.atan2(.51, .86), extentM: 52 };
  }
  const plan = { version: 2, id: chunk.id, cx, cz, seed: base.seed, theme, baseStamp: stamp(chunk),
    retainedRockIds: retained.map(e => e.id), newRockIds: newRocks.map(e => e.id), ridgeIds: newRocks.map(e => e.id),
    elements, overview, meadow, corridor, floorUnchanged: true, boundaryGuardM: GUARD,
    displayScope: 'scene descriptors; ecological populations and representative resource inventories are initialized separately' };
  if (!validateLivingHabitatMosaic(plan, base)) throw new RangeError(`Owner ${chunk.id} has no physically admissible ${theme} mosaic.`);
  return freeze(plan);
}

export function validateLivingHabitatMosaic(plan, baseGenerator) {
  try {
    const { base, chunk } = source(baseGenerator, plan.cx, plan.cz);
    if (!plan || plan.version !== 2 || plan.seed !== base.seed || !THEMES.includes(plan.theme) || plan.id !== chunk.id ||
      plan.baseStamp !== stamp(chunk) || plan.floorUnchanged !== true || plan.boundaryGuardM !== GUARD ||
      !Array.isArray(plan.elements) || plan.elements.length > 600 || !Array.isArray(plan.newRockIds) || !Array.isArray(plan.ridgeIds) ||
      stamp(plan.newRockIds) !== stamp(plan.ridgeIds) || !plan.overview || !finite({ ...plan.overview.center, y: 0 }) ||
      !Number.isFinite(plan.overview.heading) || plan.overview.extentM !== 52 ||
      plan.overview.center.x < chunk.bounds.minX + 15 || plan.overview.center.x > chunk.bounds.maxX - 15 ||
      plan.overview.center.z < chunk.bounds.minZ + 15 || plan.overview.center.z > chunk.bounds.maxZ - 15) return false;
    const originals = new Map(chunk.elements.map(e => [e.id, e])), rows = new Map();
    for (const e of plan.elements) {
      if (!e || typeof e.id !== 'string' || rows.has(e.id) || !KINDS.includes(e.kind) || !finite(e) ||
        !Number.isFinite(e.rotation) || !e.scale || !['x', 'y', 'z'].every(a => Number.isFinite(e.scale[a]) && e.scale[a] > 0)) return false;
      const original = originals.get(e.id);
      if (original ? stamp(original) !== stamp(e) : !e.id.startsWith(`living-mosaic:${plan.id}:`) || !fits(e, chunk.bounds) ||
        !['rock', 'coral', 'algae', 'seagrass'].includes(e.kind)) return false;
      rows.set(e.id, e);
    }
    if (KINDS.some(k => count(plan.elements, k) > LIVING_SHALLOWS_ELEMENT_LIMITS[k])) return false;
    const oldRocks = chunk.elements.filter(e => e.kind === 'rock');
    const retained = plan.theme === 'meadow-edge' ? oldRocks : oldRocks.filter(e => boundaryRock(e, chunk.bounds));
    if (stamp(plan.retainedRockIds) !== stamp(retained.map(e => e.id))) return false;
    const retainedIds = new Set(retained.map(e => e.id));
    if (plan.elements.some(e => originals.has(e.id) && ((e.kind === 'rock' && !retainedIds.has(e.id)) ||
      (e.attachmentId && !retainedIds.has(e.attachmentId))))) return false;
    for (const e of chunk.elements.filter(e => retainedIds.has(e.id) || retainedIds.has(e.attachmentId) || ['seagrass', 'driftwood', 'bottle'].includes(e.kind)))
      if (!rows.has(e.id) || stamp(rows.get(e.id)) !== stamp(e)) return false;
    if (plan.theme === 'meadow-edge' && chunk.elements.some(e => !rows.has(e.id))) return false;
    const newRocks = plan.newRockIds.map(id => rows.get(id));
    if (new Set(plan.newRockIds).size !== newRocks.length || (plan.theme === 'meadow-edge' ? newRocks.length !== 0 : newRocks.length < 3 || newRocks.length > 5) ||
      newRocks.some(e => !e || e.kind !== 'rock' || originals.has(e.id) || !base.rockProfiles.includes(e.profile) ||
        e.scale.y < 3 || e.scale.y > 5 || e.scale.x < 10 || e.scale.x > 15 || e.scale.z < 6 || e.scale.z > 13 ||
        Math.abs(e.y - base.floorSurface(e.x, e.z).height + .18) > 1e-7)) return false;
    const removed = new Set(oldRocks.filter(e => !retainedIds.has(e.id)).map(e => e.id)), all = neighbourhood(base, plan.cx, plan.cz);
    const rocks = [...all.filter(e => e.kind === 'rock' && !removed.has(e.id)), ...newRocks];
    const protectedRows = plan.elements.filter(e => originals.has(e.id) && (e.attachmentId || ['seagrass', 'driftwood', 'bottle'].includes(e.kind)));
    if (!protects(protectedRows, newRocks)) return false;
    const sites = livingShallowsSoftActivitySites(base.seed, plan.cx, plan.cz).filter(p => soft(base, p) && clearFloor(base, all.filter(e => e.kind === 'rock'), p, .6));
    if (sites.some(p => !clearFloor(base, newRocks, p, .6))) return false;
    const obstacleRows = all.filter(e => ['coral', 'driftwood', 'bottle'].includes(e.kind));
    for (const e of plan.elements.filter(e => !originals.has(e.id))) {
      if (e.kind === 'rock' && !plan.newRockIds.includes(e.id)) return false;
      if (e.kind === 'seagrass') {
        const match = e.id.slice(`living-mosaic:${plan.id}:grass:`.length).match(/^(-?\d+),(-?\d+)$/);
        if (plan.theme !== 'meadow-edge' || !match || !match.slice(1).map(Number).every(Number.isSafeInteger) ||
          stamp(e) !== stamp(grassDescriptor(base, chunk, Number(match[1]), Number(match[2]))) ||
          !grassFieldAdmits(base, e.x, e.z) || !grassLegal(base, rocks, obstacleRows, sites, e)) return false;
      }
      if (['coral', 'algae'].includes(e.kind)) {
        const host = rows.get(e.attachmentId), y = host && oceanRockHeight(host, e.x, e.z);
        if (!host || !plan.newRockIds.includes(host.id) || y === null || Math.abs(y - e.y) > 1e-6 || height(base, rocks, e.x, e.z) > y + 1e-6) return false;
        if (e.kind === 'coral' && (!['branching', 'table', 'fan'].includes(e.morphotype) || base.sample(e.x, e.z).depthM > 22)) return false;
        if (e.kind === 'algae') {
          if (!e.surfaceLocal || !finite(e.normal) || !Number.isFinite(e.patchRadius) || e.patchRadius <= 0 || e.patchRadius > .06) return false;
          const local = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z), p = world(host, e.surfaceLocal.x, e.surfaceLocal.z);
          if (!local || Math.hypot(p.x - e.x, p.z - e.z) > 1e-7 || Math.abs(host.y + local.height * host.scale.y - e.y) > 1e-7 ||
            Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) > 1e-7 || e.rotation !== host.rotation ||
            Math.abs(e.scale.x - host.scale.x * e.patchRadius * 2) > 1e-7 || Math.abs(e.scale.z - host.scale.z * e.patchRadius * 2) > 1e-7) return false;
        }
      }
    }
    if (plan.theme === 'patch-reef') {
      if (!plan.corridor || plan.corridor.floorUnchanged !== true || plan.corridor.lengthM !== 28 || plan.corridor.openingM !== 6 ||
        !finite({ ...plan.corridor.center, y: 0 }) || !Number.isFinite(plan.corridor.heading) ||
        stamp(plan.overview.center) !== stamp(plan.corridor.center) || plan.overview.heading !== plan.corridor.heading) return false;
      const n = corridorPoints(plan.corridor.center, plan.corridor.heading).filter(p => soft(base, p, 22) && clearFloor(base, rocks, p, .7)).length;
      if (n < 9 || n !== plan.corridor.clearSamples) return false;
      for (const e of plan.elements.filter(e => e.kind === 'rubble')) if (!clearFloor(base, newRocks, e, Math.max(e.scale.x, e.scale.z) * .5)) return false;
    } else {
      if (!plan.meadow || plan.meadow.diameterM !== 18 || plan.meadow.worldFieldM !== 180 ||
        !ring(plan.overview.center.x, plan.overview.center.z, 9, 16).every(p => soft(base, p) && clearFloor(base, rocks, p, .9))) return false;
      const n = plan.elements.filter(e => e.kind === 'seagrass' && Math.hypot(e.x - plan.overview.center.x, e.z - plan.overview.center.z) <= 9).length;
      if (n < 16 || n !== plan.meadow.rootsWithin9m) return false;
    }
    return true;
  } catch { return false; }
}
