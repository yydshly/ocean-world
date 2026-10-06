import { oceanRockHeight } from './oceanRockShape.js';

export const KELP_FOREST_BELT_VERSION = 1;
export const KELP_FOREST_BELT_OWNER_LIMIT = 25;
const SIZE = 64, MARGIN = 10, ROOT_LIMIT = 72, TAU = Math.PI * 2;
const models = new WeakMap(), routes = new WeakMap();
const stamp = value => JSON.stringify(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
function random(base, salt) {
  let h = 2166136261;
  for (const char of `${typeof base.seed}:${base.seed}|kelp-forest-belt-v1|${salt}`) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(generator, cx, cz) {
  const base = generator.baseGenerator ?? generator;
  if (base.supportVersion !== 2 || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 2 || cz % 2 ||
    typeof base.supportAt !== 'function') throw new TypeError('A kelp forest belt requires even v2 owner coordinates.');
  const chunks = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => base.chunk(cx + dx, cz + dz));
  return { base, chunks };
}
function pointOnRock(host, x, z) {
  const c = Math.cos(host.rotation), s = Math.sin(host.rotation);
  return { x: host.x + x * host.scale.x * c + z * host.scale.z * s,
    z: host.z - x * host.scale.x * s + z * host.scale.z * c };
}
const mean = points => ({ x: points.reduce((n, p) => n + p.x, 0) / points.length,
  z: points.reduce((n, p) => n + p.z, 0) / points.length });
function nativeOpening(base, chunk, roots) {
  const candidates = [];
  for (let z = 16; z <= 48; z += 8) for (let x = 16; x <= 48; x += 8)
    candidates.push({ x: chunk.origin.x + x, z: chunk.origin.z + z });
  candidates.sort((a, b) => Math.hypot(a.x - chunk.origin.x - 32, a.z - chunk.origin.z - 32) -
    Math.hypot(b.x - chunk.origin.x - 32, b.z - chunk.origin.z - 32) ||
    random(base, `opening:${a.x},${a.z}`) - random(base, `opening:${b.x},${b.z}`));
  for (const p of candidates) {
    if (roots.some(root => Math.hypot(root.x - p.x, root.z - p.z) < 8)) continue;
    const probes = [p, ...Array.from({ length: 8 }, (_, i) => ({ x: p.x + Math.cos(i * TAU / 8) * 3,
      z: p.z + Math.sin(i * TAU / 8) * 3 }))];
    if (probes.every(q => base.supportAt(q.x, q.z).substrate === 'sediment')) return p;
  }
  throw new RangeError(`Kelp owner ${chunk.id} has no surveyed native sediment opening.`);
}
function cluster(base, chunk, requested, allRoots) {
  const plants = [], groups = [];
  const hosts = chunk.elements.filter(e => e.kind === 'rock' && base.sample(e.x, e.z).forestCover >= .30)
    .sort((a, b) => random(base, `host:${a.id}`) - random(base, `host:${b.id}`) || a.id.localeCompare(b.id));
  const available = Math.min(requested, ROOT_LIMIT - chunk.counts.kelp);
  for (const host of hosts) {
    const added = [];
    for (let slot = 0; slot < 12 && added.length < 4 && plants.length < available; slot++) {
      const angle = slot * TAU / 12 + random(base, `phase:${host.id}`) * TAU;
      const radius = .28 + .10 * random(base, `radius:${host.id}:${slot}`);
      const p = pointOnRock(host, Math.cos(angle) * radius, Math.sin(angle) * radius);
      if (p.x < chunk.origin.x + MARGIN || p.x > chunk.origin.x + SIZE - MARGIN ||
        p.z < chunk.origin.z + MARGIN || p.z > chunk.origin.z + SIZE - MARGIN || Math.hypot(p.x, p.z) <= 96 ||
        base.sample(p.x, p.z).forestCover < .30) continue;
      if ([...allRoots, ...plants].some(root => Math.hypot(root.x - p.x, root.z - p.z) < .70)) continue;
      const support = base.supportAt(p.x, p.z), y = oceanRockHeight(host, p.x, p.z), depth = base.surfaceY - y;
      if (!Number.isFinite(y) || support.elementId !== host.id || support.substrate !== 'rock' ||
        Math.abs(support.height - y) > 1e-7 || y < base.floorSurface(p.x, p.z).height + .035 || depth < 5 || depth > 25) continue;
      // The original hard cap is also present beneath a finite holdfast disk.
      // This does not claim deforming holdfast contact over an entire surface.
      let supported = true;
      for (let i = 0; i < 8; i++) {
        const x = p.x + Math.cos(i * TAU / 8) * .10, z = p.z + Math.sin(i * TAU / 8) * .10;
        if (base.supportAt(x, z).elementId !== host.id) { supported = false; break; }
      }
      if (!supported) continue;
      const id = `kelp-forest-belt:${chunk.id}:${host.id}:${slot}`;
      const lengthM = (depth - .45) * (.92 + .05 * random(base, `length:${id}`));
      const anchor = { id, ...p, y, lengthM, phase: random(base, `sway:${id}`) * TAU, hostId: host.id };
      const plant = { id, kind: 'kelp', ...p, y, lengthM, hostId: host.id, anchor };
      plants.push(plant); added.push(plant);
    }
    if (added.length) groups.push({ hostId: host.id, rootIds: added.map(p => p.id), center: mean(added) });
    if (plants.length >= available) break;
  }
  return { plants, groups };
}
function build(base, chunks, cx, cz) {
  const ranked = chunks.map((chunk, i) => ({ i, cover: chunk.composition.forestCover }))
    .sort((a, b) => a.cover - b.cover || a.i - b.i);
  const clearing = ranked[0], forest = ranked[3], edge = ranked[2];
  if (forest.cover < .45 || clearing.cover > .32 || forest.cover - clearing.cover < .25 || edge.cover < .30)
    throw new RangeError(`Kelp group ${cx},${cz} has no natural forest-to-clearing transition.`);
  const allRoots = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++)
    allRoots.push(...base.chunk(cx + dx, cz + dz).elements.filter(e => e.kind === 'kelp'));
  const allocations = chunks.map(() => ({ plants: [], groups: [] }));
  allocations[forest.i] = cluster(base, chunks[forest.i], 10, allRoots);
  allocations[edge.i] = cluster(base, chunks[edge.i], 6, [...allRoots, ...allocations[forest.i].plants]);
  const added = allocations.flatMap(a => a.plants), clusters = allocations.flatMap(a => a.groups);
  if (added.length < 12 || clusters.length < 4 || allocations[forest.i].plants.length < 6 || allocations[edge.i].plants.length < 4)
    throw new RangeError(`Kelp group ${cx},${cz} has no safe complete forest/edge root clusters.`);
  const forestCenter = mean(allocations[forest.i].plants), edgeCenter = mean(allocations[edge.i].plants);
  const clearChunk = chunks[clearing.i], clearingCenter = nativeOpening(base, clearChunk, allRoots);
  const group = { id: `kelp-forest-belt:${cx},${cz}`, cx, cz, ownerIds: chunks.map(c => c.id), widthM: 128,
    forestOwnerId: chunks[forest.i].id, edgeOwnerId: chunks[edge.i].id, clearingOwnerId: clearChunk.id,
    forestCoverMin: clearing.cover, forestCoverMax: forest.cover, forestCenter, edgeCenter, clearingCenter,
    addedRootCount: added.length, rootClusterCount: clusters.length, clusters, floorUnchanged: true, ownerMarginM: MARGIN,
    openingSurvey: { radiusM: 3, supportProbes: 9, minimumRootDistanceM: 8, scope: 'finite sediment support probes; no flora removed' } };
  return freeze(chunks.map((chunk, i) => ({ version: 1, theme: 'kelp-forest-belt', id: chunk.id,
    cx: chunk.cx, cz: chunk.cz, seed: base.seed, baseStamp: stamp(chunk), group,
    addedRootIds: allocations[i].plants.map(e => e.id), elements: [...chunk.elements, ...allocations[i].plants],
    role: i === forest.i ? 'forest' : i === edge.i ? 'edge' : i === clearing.i ? 'clearing' : 'native',
    displayScope: 'complete scene descriptors; original bed/solids/roots retained; actual ecological representatives initialized separately' })));
}
function model(generator, cx, cz) {
  const { base, chunks } = source(generator, cx, cz);
  let cache = models.get(base); if (!cache) { cache = new Map(); models.set(base, cache); }
  const key = `${cx},${cz}`;
  if (!cache.has(key)) {
    let entry; try { entry = { plans: build(base, chunks, cx, cz) }; }
    catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; }
    cache.set(key, entry); if (cache.size > 32) cache.delete(cache.keys().next().value);
  }
  const result = cache.get(key); cache.delete(key); cache.set(key, result);
  if (result.declined) throw new RangeError(result.declined);
  return result.plans;
}
export function createKelpForestBeltPlans(baseGenerator, evenCx, evenCz) {
  return model(baseGenerator, evenCx, evenCz);
}
export function validateKelpForestBeltPlan(plan, baseGenerator) {
  try {
    if (!plan || plan.version !== 1 || plan.theme !== 'kelp-forest-belt' || !plan.group ||
      plan.id !== `${plan.cx},${plan.cz}` || !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz)) return false;
    const expected = model(baseGenerator, plan.group.cx, plan.group.cz).find(p => p.id === plan.id);
    return !!expected && stamp(expected) === stamp(plan);
  } catch { return false; }
}

/** One bounded native route is derived from canonical physically admitted
 * plans. These shortcuts neither commit scenery nor guarantee virgin owners. */
export function kelpForestBeltRoute(baseGenerator) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (routes.has(base)) return routes.get(base);
  const candidates = [];
  for (let z = -6; z <= 4; z += 2) for (let x = -6; x <= 4; x += 2) candidates.push({ x, z });
  candidates.sort((a, b) => random(base, `route:${a.x},${a.z}`) - random(base, `route:${b.x},${b.z}`));
  for (const candidate of candidates) {
    let plans; try { plans = model(base, candidate.x, candidate.z); }
    catch (error) { if (!(error instanceof RangeError)) throw error; continue; }
    const group = plans[0].group;
    const result = freeze([
      { id: 'forest-belt-interior', label: '巨藻林带', ...group.forestCenter },
      { id: 'forest-belt-opening', label: '林缘空地', ...group.clearingCenter },
    ]);
    routes.set(base, result); return result;
  }
  const empty = Object.freeze([]); routes.set(base, empty); return empty;
}

/** Optional source facade. All physical/environmental queries keep the exact
 * old implementation. Complete retained descriptors only become public after
 * the ecology transaction has committed. Temporary birth views are synchronous. */
export function createKelpForestBeltGenerator(baseGenerator) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (base.supportVersion !== 2) throw new TypeError('Forest belts require v2 kelp geometry.');
  let committed = new Map(), view = committed, revision = 0, temporaryDepth = 0;
  const chunks = new Map();
  const inspect = input => {
    if (!Array.isArray(input) || input.length > 25) throw new TypeError('Forest plan registry must contain at most 25 owners.');
    const next = new Map();
    for (const plan of input) {
      if (!validateKelpForestBeltPlan(plan, base)) throw new TypeError('Invalid saved kelp forest belt plan.');
      if (next.has(plan.id)) throw new TypeError('Duplicate forest plan owner.');
      next.set(plan.id, freeze(plan));
    }
    return next;
  };
  const facade = { ...base, baseGenerator: base,
    get forestRouteStops() { return kelpForestBeltRoute(base); },
    get forestBeltRevision() { return revision; },
    get forestBeltCandidatesActive() { return temporaryDepth > 0; },
    forestBeltPlan: (cx, cz) => committed.get(`${cx},${cz}`),
    forestBeltRegistryStats: () => ({ size: committed.size, limit: 25, revision, ids: [...committed.keys()] }),
    setForestPlans(input) {
      if (temporaryDepth) throw new TypeError('Cannot publish forest plans inside a temporary birth view.');
      const next = inspect(input);
      if (next.size === committed.size && [...next].every(([id, plan]) => stamp(plan) === stamp(committed.get(id)))) return false;
      for (const [id, plan] of next) if (stamp(plan) === stamp(committed.get(id))) next.set(id, committed.get(id));
      committed = next; view = committed; chunks.clear(); revision++; return true;
    },
    withForestPlans(input, fn) {
      if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction') throw new TypeError('Forest birth view must be synchronous.');
      const candidates = inspect(input), previous = view, previousChunks = new Map(chunks);
      // Ecology supplies the complete incoming halo, including saved owners.
      // A far journey must not union that halo with an unrelated old window.
      view = candidates;
      chunks.clear(); temporaryDepth++;
      try {
        const result = fn(facade);
        if (result && typeof result.then === 'function') throw new TypeError('Forest birth view returned an asynchronous result.');
        return result;
      } finally { view = previous; chunks.clear(); for (const [id, chunk] of previousChunks) chunks.set(id, chunk); temporaryDepth--; }
    },
    chunk(cx, cz) {
      const id = `${cx},${cz}`, plan = view.get(id); if (!plan) return base.chunk(cx, cz);
      if (!chunks.has(id)) {
        const original = base.chunk(cx, cz);
        chunks.set(id, freeze({ ...original, elements: plan.elements,
          counts: { ...original.counts, kelp: original.counts.kelp + plan.addedRootIds.length },
          forestBeltPlan: plan, forestBeltSummary: { version: 1, groupId: plan.group.id, role: plan.role,
            addedRootCount: plan.addedRootIds.length, widthM: 128, floorUnchanged: true } }));
      }
      return chunks.get(id);
    },
    clearCache() { chunks.clear(); base.clearCache(); },
  };
  return Object.freeze(facade);
}
