import { oceanRockHeight } from './oceanRockShape.js';
import { KELP_SURFACE_Y } from './kelpHabitat.js';

export const KELP_UNDERSTORY_SCENERY_VERSION = 1;
export const KELP_UNDERSTORY_LIMIT = 32;
const TAU = Math.PI * 2, finite = p => p && ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function hull(points) {
  const sorted = points.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))
    .map(p => ({ x: p.x, z: p.z })).sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return sorted;
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const half = rows => { const result = []; for (const p of rows) {
    while (result.length >= 2 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop(); result.push(p);
  } return result; };
  const lower = half(sorted), upper = half([...sorted].reverse()); lower.pop(); upper.pop(); return [...lower, ...upper];
}
function hullDistance(p, polygon) {
  if (!polygon.length) return Infinity;
  if (polygon.length === 1) return Math.hypot(p.x - polygon[0].x, p.z - polygon[0].z);
  let positive = false, negative = false, minimum = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const c = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (c > 1e-10) positive = true; if (c < -1e-10) negative = true;
    minimum = Math.min(minimum, segmentDistance(p, a, b));
  }
  return polygon.length >= 3 && !(positive && negative) ? 0 : minimum;
}

/** A conservative finite cylinder containing the complete display canopy and
 * its shader sway. It is a soft-vegetation avoidance reference, not leaf-level
 * collision or force/drag. Pitch/fin/body margins cover the regional fish. */
export function understoryWaterClearance(point, sizeM, plants = []) {
  if (!finite(point) || !Number.isFinite(sizeM) || sizeM <= 0) return -Infinity;
  let gap = Infinity;
  const halfHeight = .33 * sizeM, bodyRadius = .58 * sizeM + .12;
  for (const plant of plants) {
    if (point.y + halfHeight < plant.y - .02 || point.y - halfHeight > plant.y + plant.heightM + .02) continue;
    gap = Math.min(gap, Math.hypot(point.x - plant.x, point.z - plant.z) - plant.radiusM - bodyRadius);
  }
  return gap;
}

/** Seeded low-canopy scenery on actual hard caps. Old feeding supports and
 * native host/foraging corridors are reserved. Current saved swimmers and the
 * complete local shark patrol are protected before the once-only allocation. */
export function createKelpUnderstoryPlan(generator, chunk, { seed = generator.seed, excludedHostIds = [],
  occupiedAgents = [], floorSites = [], reservedAnchors = [] } = {}) {
  const random = salt => hash(`${typeof seed}:${seed}|kelp-understory-v1|${chunk.id}|${salt}`);
  const excluded = new Set(excludedHostIds), plants = [];
  const native = occupiedAgents.filter(a => !['blue-rockfish', 'leopard-shark', 'giant-kelp'].includes(a.speciesId));
  const reserved = hull([...reservedAnchors, ...floorSites, ...native.flatMap(a => [a.position, a.home, a.target])]);
  const oldRoots = chunk.elements.filter(e => e.kind === 'kelp');
  const hosts = chunk.elements.filter(e => ['rock', 'formation'].includes(e.kind) && !excluded.has(e.id))
    .sort((a, b) => random(`host:${a.id}`) - random(`host:${b.id}`) || a.id.localeCompare(b.id));
  for (const host of hosts) {
    const sample = generator.sample(host.x, host.z);
    if (random(`present:${host.id}`) > .45 + .5 * sample.forestCover || sample.rockiness < .22) continue;
    for (let slot = 0; slot < 3 && plants.length < KELP_UNDERSTORY_LIMIT; slot++) {
      const angle = host.rotation + slot * TAU / 3 + random(`phase:${host.id}`) * .4;
      const lx = Math.cos(angle) * host.scale.x * .28, lz = Math.sin(angle) * host.scale.z * .28;
      const c = Math.cos(host.rotation), s = Math.sin(host.rotation);
      const x = host.x + lx * c + lz * s, z = host.z - lx * s + lz * c;
      if (x < chunk.cx * 64 + 4 || x > (chunk.cx + 1) * 64 - 4 ||
          z < chunk.cz * 64 + 4 || z > (chunk.cz + 1) * 64 - 4 || Math.hypot(x, z) <= 46) continue;
      const heightM = 1.2 + random(`height:${host.id}:${slot}`) * .6, radiusM = .7 + random(`radius:${host.id}:${slot}`) * .35;
      const y = oceanRockHeight(host, x, z), support = generator.supportAt(x, z), depth = KELP_SURFACE_Y - y;
      if (!Number.isFinite(y) || support.substrate !== 'rock' || support.elementId !== host.id ||
          Math.abs(support.height - y) > 1e-6 || depth < 4 || depth > 20 || y + heightM > KELP_SURFACE_Y - .35) continue;
      const plant = { id: `kelp-understory:${chunk.id}:${host.id}:${slot}`, regionId: chunk.id, hostId: host.id,
        x, y: y + .006, z, heightM, radiusM, phase: random(`sway:${host.id}:${slot}`) * TAU };
      if (hullDistance(plant, reserved) < 6 + radiusM || floorSites.some(p => Math.hypot(x - p.x, z - p.z) < 4 + radiusM) ||
          oldRoots.some(p => Math.hypot(x - p.x, z - p.z) < 1) ||
          occupiedAgents.some(a => a.alive && finite(a.position) && understoryWaterClearance(a.position, a.sizeM, [plant]) < .08)) continue;
      let patrolClear = true;
      for (const a of occupiedAgents.filter(a => a.alive && a.speciesId === 'leopard-shark')) {
        const path = a.patrolWaypoints ?? [];
        for (let i = 0; patrolClear && i < path.length; i++) {
          const p = path[i], q = path[(i + 1) % path.length], steps = Math.ceil(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / .3);
          for (let j = 0; j <= steps; j++) {
            const t = steps ? j / steps : 0, point = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t };
            if (understoryWaterClearance(point, a.sizeM * 1.16, [plant]) < .08) { patrolClear = false; break; }
          }
        }
      }
      if (patrolClear) plants.push(plant);
    }
  }
  return plants.sort((a, b) => a.id.localeCompare(b.id));
}

export function validateKelpUnderstoryRecord(record, region, generator) {
  if (record.understorySceneryVersion === undefined && record.understoryPlants === undefined && record.understoryInitializedAtSec === undefined) return true;
  if (record.understorySceneryVersion !== 1 || (record.supportGeometryVersion ?? 1) < 2 ||
      !Number.isFinite(record.understoryInitializedAtSec) || record.understoryInitializedAtSec < 0 ||
      record.understoryInitializedAtSec > region.sim.timeSec + 1e-8 || !Array.isArray(record.understoryPlants) || record.understoryPlants.length > KELP_UNDERSTORY_LIMIT) return false;
  const chunk = generator.chunk(region.cx, region.cz), ids = new Set();
  for (const p of record.understoryPlants) {
    const host = chunk.elements.find(e => e.id === p?.hostId && ['rock', 'formation'].includes(e.kind));
    if (!host || !finite(p) || ![0, 1, 2].some(slot => p.id === `kelp-understory:${region.id}:${host.id}:${slot}`) || ids.has(p.id) ||
        region.sim.rocks.some(rock => rock[0] === host.x && rock[2] === host.z) ||
        p.regionId !== region.id || !Number.isFinite(p.heightM) || p.heightM < 1.2 || p.heightM > 1.8 ||
        !Number.isFinite(p.radiusM) || p.radiusM < .7 || p.radiusM > 1.05 || !Number.isFinite(p.phase) || p.phase < 0 || p.phase >= TAU ||
        p.x < region.cx * 64 + 4 || p.x > (region.cx + 1) * 64 - 4 || p.z < region.cz * 64 + 4 || p.z > (region.cz + 1) * 64 - 4 ||
        Math.hypot(p.x, p.z) <= 46 || p.y + p.heightM > KELP_SURFACE_Y - .35) return false;
    const support = generator.supportAt(p.x, p.z), depth = KELP_SURFACE_Y - p.y;
    if (support.elementId !== host.id || support.substrate !== 'rock' || Math.abs(p.y - support.height - .006) > 1e-6 || depth < 4 - .006 || depth > 20) return false;
    ids.add(p.id);
  }
  return true;
}
