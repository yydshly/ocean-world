import { oceanRockHeight } from './oceanRockShape.js';

const OWNER = 64, MARGIN = 10, ROOT_LIMIT = 72, TAU = Math.PI * 2, CACHE_LIMIT = 4;
const models = new WeakMap();
const stamp = value => JSON.stringify(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
export const KELP_SEASCAPE_ANCHOR = Object.freeze({ cx: 6, cz: -2 });
export const KELP_SEASCAPE_OWNERS = Object.freeze(Array.from({ length: 12 }, (_, i) =>
  `${KELP_SEASCAPE_ANCHOR.cx + i % 6},${KELP_SEASCAPE_ANCHOR.cz + Math.floor(i / 6)}`));
// Fixed production-string-42 references. Each seed's public route is derived
// from its own actual admitted group, rather than these point labels.
export const KELP_SEASCAPE_ROUTE_STOPS = freeze([
  { id: 'kelp-scene-forest', label: '整景巨藻群', x: 488.4057673162162, z: -33.90907381948777 },
  { id: 'kelp-scene-rockbed', label: '整景岩底', x: 604.3411620246479, z: -24.885223595192656 },
  { id: 'kelp-scene-opening', label: '整景林间沙地', x: 680, z: -96 },
  { id: 'kelp-scene-outer', label: '整景开放林缘', x: 736, z: -32 },
]);
function random(base, salt) {
  let h = 2166136261;
  for (const ch of `${typeof base.seed}:${base.seed}|kelp-seascape-v2|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(generator, cx, cz) {
  const base = generator.baseGenerator ?? generator;
  if (base.supportVersion !== 2 || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 6 || cz % 2 ||
    typeof base.supportAt !== 'function') throw new TypeError('A kelp seascape requires 6 by 2 aligned v2 native owner coordinates.');
  const chunks = [];
  for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) chunks.push(base.chunk(cx + dx, cz + dz));
  return { base, chunks };
}
function pointOnRock(host, x, z) {
  const c = Math.cos(host.rotation), s = Math.sin(host.rotation);
  return { x: host.x + x * host.scale.x * c + z * host.scale.z * s,
    z: host.z - x * host.scale.x * s + z * host.scale.z * c };
}
const mean = points => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  z: points.reduce((sum, p) => sum + p.z, 0) / points.length });
function nativeRoots(base, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++)
    rows.push(...base.chunk(cx + dx, cz + dz).elements.filter(e => e.kind === 'kelp'));
  return rows;
}
function cluster(base, chunk, requested, existing) {
  const plants = [], clusters = [], available = Math.min(requested, ROOT_LIMIT - chunk.counts.kelp);
  const hosts = chunk.elements.filter(e => e.kind === 'rock' && base.sample(e.x, e.z).forestCover >= .30)
    .sort((a, b) => random(base, `host:${a.id}`) - random(base, `host:${b.id}`) || a.id.localeCompare(b.id));
  for (const host of hosts) {
    const group = [];
    for (let slot = 0; slot < 16 && group.length < 5 && plants.length < available; slot++) {
      const angle = slot * TAU / 16 + random(base, `phase:${host.id}`) * TAU,
        radius = .25 + .12 * random(base, `radius:${host.id}:${slot}`),
        p = pointOnRock(host, Math.cos(angle) * radius, Math.sin(angle) * radius);
      if (p.x < chunk.origin.x + MARGIN || p.x > chunk.origin.x + OWNER - MARGIN ||
        p.z < chunk.origin.z + MARGIN || p.z > chunk.origin.z + OWNER - MARGIN || Math.hypot(p.x, p.z) <= 96 ||
        base.sample(p.x, p.z).forestCover < .30 || [...existing, ...plants].some(q => Math.hypot(q.x - p.x, q.z - p.z) < .70)) continue;
      const y = oceanRockHeight(host, p.x, p.z), support = base.supportAt(p.x, p.z), depth = base.surfaceY - y;
      if (!Number.isFinite(y) || support.elementId !== host.id || support.substrate !== 'rock' ||
        Math.abs(support.height - y) > 1e-7 || y < base.floorSurface(p.x, p.z).height + .035 || depth < 5 || depth > 25) continue;
      if (Array.from({ length: 8 }, (_, i) => ({ x: p.x + Math.cos(i * TAU / 8) * .10,
        z: p.z + Math.sin(i * TAU / 8) * .10 })).some(q => base.supportAt(q.x, q.z).elementId !== host.id)) continue;
      const id = `kelp-seascape:${chunk.id}:${host.id}:${slot}`,
        lengthM = (depth - .45) * (.92 + .05 * random(base, `length:${id}`));
      const anchor = { id, ...p, y, lengthM, phase: random(base, `sway:${id}`) * TAU, hostId: host.id };
      const plant = { id, kind: 'kelp', ...p, y, lengthM, hostId: host.id, anchor };
      plants.push(plant); group.push(plant);
    }
    if (group.length) clusters.push({ ownerId: chunk.id, hostId: host.id, rootIds: group.map(p => p.id), center: mean(group) });
    if (plants.length >= available) break;
  }
  return { plants, clusters };
}
function sedimentOpening(base, chunks, roots, { wide = false } = {}) {
  const sizes = wide ? [[16, 8], [12, 8], [10, 6]] : [[6, 6]];
  for (const [widthM, depthM] of sizes) for (const chunk of chunks) {
    const candidates = [];
    for (let z = 16; z <= 48; z += 8) for (let x = 16; x <= 48; x += 8)
      candidates.push({ x: chunk.origin.x + x, z: chunk.origin.z + z });
    candidates.sort((a, b) => Math.hypot(a.x - chunk.origin.x - 32, a.z - chunk.origin.z - 32) -
      Math.hypot(b.x - chunk.origin.x - 32, b.z - chunk.origin.z - 32) ||
      random(base, `opening:${a.x},${a.z}`) - random(base, `opening:${b.x},${b.z}`));
    for (const center of candidates) {
      if (roots.some(p => Math.hypot(p.x - center.x, p.z - center.z) < Math.hypot(widthM, depthM) * .5 + 2)) continue;
      const samples = []; let valid = true;
      for (let dz = -depthM / 2; dz <= depthM / 2 && valid; dz += 2) for (let dx = -widthM / 2; dx <= widthM / 2; dx += 2) {
        const x = center.x + dx, z = center.z + dz;
        if (x < chunk.origin.x + MARGIN || x > chunk.origin.x + OWNER - MARGIN ||
          z < chunk.origin.z + MARGIN || z > chunk.origin.z + OWNER - MARGIN) { valid = false; break; }
        const support = base.supportAt(x, z), depth = base.surfaceY - support.height;
        if (support.substrate !== 'sediment' || depth < 5 || depth > 25) { valid = false; break; }
        for (let i = 0; i < 8; i++) {
          const qx = x + Math.cos(i * TAU / 8) * .6, qz = z + Math.sin(i * TAU / 8) * .6;
          if (base.supportAt(qx, qz).substrate !== 'sediment') { valid = false; break; }
        }
        if (!valid) break;
        samples.push({ x, z, y: support.height });
      }
      if (valid) return { ownerId: chunk.id, center, widthM, depthM, bodyRadiusM: .6, spacingM: 2,
        samples, clearSamples: samples.length, scope: 'finite native sediment support and body probes; no scenery removed' };
    }
  }
  return null;
}
function rockbed(base, chunks, roots) {
  for (const chunk of chunks) {
    const hosts = chunk.elements.filter(e => e.kind === 'rock' &&
      roots.every(root => Math.hypot(root.x - e.x, root.z - e.z) > 3));
    hosts.sort((a, b) => Math.hypot(a.x - chunk.origin.x - 32, a.z - chunk.origin.z - 32) -
      Math.hypot(b.x - chunk.origin.x - 32, b.z - chunk.origin.z - 32) || a.id.localeCompare(b.id));
    for (const host of hosts) {
      const support = base.supportAt(host.x, host.z);
      if (support.elementId !== host.id || support.substrate !== 'rock' || base.surfaceY - support.height < 5) continue;
      const neighbors = chunk.elements.filter(e => e.kind === 'rock' && Math.hypot(e.x - host.x, e.z - host.z) <= 24);
      if (neighbors.length >= 4) return { ownerId: chunk.id, center: { x: host.x, z: host.z },
        hostId: host.id, sourceRockIds: neighbors.map(e => e.id), actualHardHeight: support.height };
    }
  }
  return null;
}
function build(base, chunks, cx, cz) {
  const roots = nativeRoots(base, cx, cz), allocations = chunks.map(() => ({ plants: [], clusters: [] }));
  const forestCandidates = chunks.map((chunk, i) => ({ chunk, i })).filter(p =>
    p.chunk.cx - cx >= 1 && p.chunk.cx - cx <= 2 && p.chunk.composition.forestCover >= .40)
    .sort((a, b) => (ROOT_LIMIT - b.chunk.counts.kelp) * b.chunk.composition.forestCover -
      (ROOT_LIMIT - a.chunk.counts.kelp) * a.chunk.composition.forestCover || a.i - b.i);
  for (const p of forestCandidates) {
    allocations[p.i] = cluster(base, p.chunk, 24, [...roots, ...allocations.flatMap(a => a.plants)]);
  }
  const added = allocations.flatMap(a => a.plants), clusters = allocations.flatMap(a => a.clusters);
  const forest = forestCandidates.filter(p => allocations[p.i].plants.length >= 5)
    .sort((a, b) => allocations[b.i].plants.length - allocations[a.i].plants.length || a.i - b.i)[0];
  if (!forest || added.length < 16 || clusters.length < 4 ||
    Math.max(...chunks.map(c => c.composition.forestCover)) < .6)
    throw new RangeError(`Kelp group ${cx},${cz} has no complete admitted native hard-bottom root clusters.`);
  const actualRoots = [...roots, ...added], bed = rockbed(base, [chunks[9], chunks[3]], actualRoots),
    opening = sedimentOpening(base, [chunks[10], chunks[4]], actualRoots, { wide: true }),
    outer = sedimentOpening(base, [chunks[11], chunks[5]], actualRoots);
  if (!bed || !opening || !outer || Math.min(chunks[5].composition.forestCover, chunks[11].composition.forestCover) > .25)
    throw new RangeError(`Kelp group ${cx},${cz} has no actual exposed rockbed, sediment opening and quiet outer-water sequence.`);
  const forestCenter = mean(allocations[forest.i].plants), group = { id: `kelp-seascape:${cx},${cz}`, cx, cz,
    ownerIds: chunks.map(c => c.id), widthM: 384, depthM: 128, floorUnchanged: true, ownerMarginM: MARGIN,
    forestOwnerId: chunks[forest.i].id, rockbedOwnerId: bed.ownerId, openingOwnerId: opening.ownerId, outerOwnerId: outer.ownerId,
    forestCenter, rockbed: bed, opening, outer,
    addedRootCount: added.length, addedRockCount: 0, rootClusterCount: clusters.length, clusters,
    nativeRootCount: chunks.reduce((n, c) => n + c.counts.kelp, 0), nativeRockCount: chunks.reduce((n, c) => n + c.counts.rock, 0),
    nativeFormationCount: chunks.reduce((n, c) => n + c.counts.formation, 0),
    minDepthM: Math.min(...chunks.map(c => c.composition.minDepthM)), maxDepthM: Math.max(...chunks.map(c => c.composition.maxDepthM)),
    route: [
      { id: 'kelp-scene-forest', label: '整景巨藻群', ...forestCenter },
      { id: 'kelp-scene-rockbed', label: '整景岩底', ...bed.center },
      { id: 'kelp-scene-opening', label: '整景林间沙地', ...opening.center },
      { id: 'kelp-scene-outer', label: '整景开放林缘', ...outer.center },
    ] };
  return freeze(chunks.map((chunk, i) => ({ version: 2, theme: 'kelp-seascape', id: chunk.id,
    cx: chunk.cx, cz: chunk.cz, seed: base.seed, baseStamp: stamp(chunk), group,
    addedRootIds: allocations[i].plants.map(e => e.id), addedRockIds: [], elements: [...chunk.elements, ...allocations[i].plants],
    role: chunk.id === group.forestOwnerId ? 'forest' : chunk.id === group.rockbedOwnerId ? 'rockbed' :
      chunk.id === group.openingOwnerId ? 'opening' : chunk.id === group.outerOwnerId ? 'outer-water' : allocations[i].plants.length ? 'forest-edge' : 'native',
    displayScope: 'twelve native beds and complete descriptors; real holdfast additions; representative ecology and food initialized separately' })));
}
function model(generator, cx, cz) {
  const { base, chunks } = source(generator, cx, cz); let cache = models.get(base);
  if (!cache) { cache = new Map(); models.set(base, cache); }
  const key = `${cx},${cz}`;
  if (!cache.has(key)) {
    let entry; try { entry = { plans: build(base, chunks, cx, cz) }; }
    catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; }
    cache.set(key, entry); if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  const entry = cache.get(key); cache.delete(key); cache.set(key, entry);
  if (entry.declined) throw new RangeError(entry.declined); return entry.plans;
}
export function createKelpSeascapePlans(base, cx, cz) { return model(base, cx, cz); }
export function validateKelpSeascapePlan(base, plan) {
  try {
    if (!plan || plan.version !== 2 || plan.theme !== 'kelp-seascape' || !plan.group ||
      !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz) || plan.id !== `${plan.cx},${plan.cz}`) return false;
    const expected = model(base, plan.group.cx, plan.group.cz).find(p => p.id === plan.id);
    return !!expected && stamp(expected) === stamp(plan);
  } catch { return false; }
}
export function kelpSeascapeRoute(base) {
  try { return model(base, KELP_SEASCAPE_ANCHOR.cx, KELP_SEASCAPE_ANCHOR.cz)[0].group.route; }
  catch (error) { if (error instanceof RangeError) return Object.freeze([]); throw error; }
}
