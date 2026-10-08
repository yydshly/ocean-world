// A fresh-only animal placement policy on the unchanged v9 seagrass meadow.
// These are deterministic geographical candidates, not accepted physical poses.
// Every animal controller must still admit its whole body and ordinary patrol.
const SIZE = 64, MARGIN = 6, MAX_SITES = 24, MAX_ROUTE_DISTANCE = 10;
const TOP = ['meadowAnimalBeltVersion', 'meadowAnimalBelt'];
const FIELDS = ['version', 'initializedAtSec', 'groupId', 'recipe'];
const candidates = new WeakMap();
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const allocation = freeze({ native: 2, guild: 1, openWater: 1, diversity: 2, benthic: 4, meadow: 2, turtles: 1, shoal: 7, total: 20 });
// Four independent grass/reef-edge/soft-bottom niches share the same total
// budget with a five-member school. The saved v1 recipe keeps its old budget.
const communityAllocation = freeze({ ...allocation, meadow: 4, shoal: 5 });

export function meadowAnimalBeltMarked(r) {
  return Boolean(r && Object.keys(r).some(k => k.startsWith('meadowAnimalBelt')));
}

function actualGroup(g, r) {
  if (g?.profile !== 'living-shallows-v1' || typeof g.chunk !== 'function' || !Number.isSafeInteger(r?.cx) || !Number.isSafeInteger(r?.cz) || r.id !== `${r.cx},${r.cz}`) return null;
  try {
    const plan = g.chunk(r.cx, r.cz)?.ridgePlan, group = plan?.group;
    if (plan?.version !== 9 || plan.theme !== 'seagrass-meadow-region' || plan.id !== r.id || plan.cx !== r.cx || plan.cz !== r.cz || plan.seed !== g.seed ||
        !group || !Number.isSafeInteger(group.cx) || !Number.isSafeInteger(group.cz) || group.cx < 228 || group.cx % 6 || group.cz % 2 ||
        (group.cx / 6 - 38) % 5 || group.id !== `seagrass-meadow-region:${group.cx},${group.cz}` || group.seed !== g.seed ||
        !Array.isArray(group.ownerIds) || group.ownerIds.length !== 12 || new Set(group.ownerIds).size !== 12 || !group.ownerIds.includes(r.id) ||
        !Array.isArray(group.routePath) || group.routePath.length < 2 || !group.routePath.every(point)) return null;
    const expected = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${group.cx + dx},${group.cz + dz}`));
    return expected.every(id => group.ownerIds.includes(id)) ? group : null;
  } catch { return null; }
}

export function validateMeadowAnimalBelt(r, g) {
  if (!meadowAnimalBeltMarked(r)) return true;
  const group = actualGroup(g, r), d = r.meadowAnimalBelt, version = r.meadowAnimalBeltVersion;
  return Boolean(group && [1, 2].includes(version) && d && typeof d === 'object' && !Array.isArray(d) &&
    Object.keys(r).filter(k => k.startsWith('meadowAnimalBelt')).every(k => TOP.includes(k)) &&
    Object.keys(d).length === FIELDS.length && FIELDS.every(k => Object.hasOwn(d, k)) && d.version === version && d.initializedAtSec === 0 &&
    d.groupId === `${group.cx},${group.cz}` && d.recipe === (version === 2 ? 'habitat-community-v2' : 'route-neighborhood-v1'));
}

function routeDistance(p, path) {
  let closest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
    const t = n > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / n)) : 0;
    closest = Math.min(closest, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
  }
  return closest;
}

function buildSites(group, r) {
  const path = group.routePath, distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances.at(-1) + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const result = [], minX = r.cx * SIZE + MARGIN, maxX = (r.cx + 1) * SIZE - MARGIN, minZ = r.cz * SIZE + MARGIN, maxZ = (r.cz + 1) * SIZE - MARGIN;
  let index = 1;
  for (let station = 0, sM = 6; sM < distances.at(-1) - 6; station++, sM += 12) {
    while (index < distances.length - 1 && distances[index] < sM) index++;
    const a = path[index - 1], b = path[index], span = distances[index] - distances[index - 1]; if (!(span > 0)) continue;
    const t = (sM - distances[index - 1]) / span, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t,
      dx = (b.x - a.x) / span, dz = (b.z - a.z) / span;
    for (const [offsetIndex, across] of [0, -4, 4, -8, 8].entries()) {
      const p = { x: x - dz * across, z: z + dx * across };
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ || routeDistance(p, path) > MAX_ROUTE_DISTANCE) continue;
      const id = `animal-belt:${r.id}:${station}:${offsetIndex}`;
      result.push({ id, siteId: id, ...p, sM });
    }
  }
  // A uniform sample retains the whole owner-local route when it contains
  // more than the finite candidate budget, rather than only its first bend.
  const selected = result.length <= MAX_SITES ? result : Array.from({ length: MAX_SITES }, (_, i) => result[Math.floor(i * (result.length - 1) / (MAX_SITES - 1))]);
  return freeze(selected);
}

export function meadowAnimalBeltSites(g, r) {
  if (!meadowAnimalBeltMarked(r) || !validateMeadowAnimalBelt(r, g)) return [];
  const group = actualGroup(g, r);
  // Native plans are immutable; custom mutable fixtures are recomputed so a
  // changed route cannot survive through a cached candidate list.
  if (!Object.isFrozen(group)) return buildSites(group, r);
  let byOwner = candidates.get(group); if (!byOwner) { byOwner = new Map(); candidates.set(group, byOwner); }
  if (!byOwner.has(r.id)) byOwner.set(r.id, buildSites(group, r));
  return byOwner.get(r.id);
}

export function meadowAnimalBeltRank(g, r, sites) {
  if (!Array.isArray(sites)) return [];
  if (!meadowAnimalBeltMarked(r)) return [...sites];
  if (!validateMeadowAnimalBelt(r, g)) return [];
  const path = actualGroup(g, r).routePath, hosts = new Map(g.chunk(r.cx, r.cz).elements.map(e => [e.id, e]));
  const position = s => Number.isFinite(s.x) && Number.isFinite(s.z) ? s : s.position ?? hosts.get(s.hostId);
  return sites.map((site, index) => { const p = position(site), distanceM = Number.isFinite(p?.x) && Number.isFinite(p?.z) ? routeDistance(p, path) : Infinity;
    return { site, index, distanceM }; }).sort((a, b) => Number(a.distanceM > MAX_ROUTE_DISTANCE) - Number(b.distanceM > MAX_ROUTE_DISTANCE) ||
      a.distanceM - b.distanceM || a.index - b.index).map(row => row.site);
}

export function meadowAnimalBeltAllocation(g, r) {
  return meadowAnimalBeltMarked(r) && validateMeadowAnimalBelt(r, g) && meadowAnimalBeltSites(g, r).length ? (r.meadowAnimalBeltVersion === 2 ? communityAllocation : allocation) : null;
}
