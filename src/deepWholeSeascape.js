import { oceanRockHeight } from './oceanRockShape.js';

const OWNER = 64, WIDTH = 384, DEPTH = 128, ROW = 385, GUARD = 16, TAU = Math.PI * 2, CACHE_LIMIT = 4;
const models = new WeakMap();
const stamp = value => JSON.stringify(value);
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
export const DEEP_WHOLE_SEASCAPE_ANCHOR = Object.freeze({ cx: 132, cz: 8 });
export const DEEP_WHOLE_SEASCAPE_OWNERS = Object.freeze(Array.from({ length: 12 }, (_, i) =>
  `${DEEP_WHOLE_SEASCAPE_ANCHOR.cx + i % 6},${DEEP_WHOLE_SEASCAPE_ANCHOR.cz + Math.floor(i / 6)}`));
export const DEEP_WHOLE_SEASCAPE_ROUTE_STOPS = freeze([
  { id: 'deep-scene-plain', label: '整景沉积平原', x: 8544, z: 544 },
  { id: 'deep-scene-slope', label: '整景宽缓坡', x: 8608, z: 572 },
  { id: 'deep-scene-outcrop', label: '整景岩露头', x: 8728.518119847402, z: 600.6534576958511 },
  { id: 'deep-scene-outer', label: '整景开放海床', x: 8800, z: 608 },
]);
function random(base, salt) {
  let h = 2166136261;
  for (const ch of `${typeof base.seed}:${base.seed}|deep-whole-seascape-v2|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(generator, cx, cz) {
  const base = generator.baseGenerator ?? generator;
  if (base.surfaceY !== 3500 || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 6 || cz % 2)
    throw new TypeError('A deep whole seascape requires 6 by 2 aligned native owner coordinates.');
  const origin = { x: cx * OWNER, z: cz * OWNER }, nearX = Math.max(origin.x, Math.min(0, origin.x + WIDTH)),
    nearZ = Math.max(origin.z, Math.min(0, origin.z + DEPTH));
  if (Math.hypot(nearX, nearZ) <= 96) throw new RangeError('Deep whole seascapes preserve the authored transition.');
  const chunks = [];
  for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) chunks.push(base.chunk(cx + dx, cz + dz));
  return { base, chunks, origin };
}
function halo(base, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) rows.push(...base.chunk(cx + dx, cz + dz).elements);
  return rows;
}
function protection(rows, plain) {
  const bins = new Map();
  for (const e of rows) {
    const radius = Math.hypot(e.scale.x, e.scale.z) * .5 + 1.5, reach = radius + 16, p = { x: e.x, z: e.z, radius };
    for (let iz = Math.floor((e.z - reach) / 16); iz <= Math.floor((e.z + reach) / 16); iz++)
      for (let ix = Math.floor((e.x - reach) / 16); ix <= Math.floor((e.x + reach) / 16); ix++) {
        const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p);
      }
  }
  return (x, z) => {
    const dx = Math.max(plain.origin.x - x, 0, x - plain.origin.x - OWNER),
      dz = Math.max(plain.origin.z - z, 0, z - plain.origin.z - OWNER);
    let result = smooth(Math.hypot(dx, dz) / 16);
    for (const p of bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      result = Math.min(result, smooth((Math.hypot(x - p.x, z - p.z) - p.radius) / 16)); if (!result) break;
    }
    return result;
  };
}
function envelope(x, width) {
  if (x <= GUARD || x >= width - GUARD) return 0;
  return Math.sin(Math.PI * (x - GUARD) / (width - GUARD * 2)) ** 2;
}
function amplitudeLimit(baseline, unit) {
  let limit = 4; const permitted = .11999 ** 2;
  for (let z = 0; z < DEPTH; z++) for (let x = 0; x < WIDTH; x++) {
    const a = z * ROW + x, b = a + 1, c = a + ROW, d = c + 1;
    for (const [i, j, k] of [[a, b, c], [d, c, b]]) {
      const bx = baseline[j] - baseline[i], bz = baseline[k] - baseline[i], ux = unit[j] - unit[i], uz = unit[k] - unit[i],
        bb = bx * bx + bz * bz, uu = ux * ux + uz * uz, dot = bx * ux + bz * uz;
      if (bb > permitted) return 0;
      if (uu > 1e-16) limit = Math.min(limit, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu);
    }
  }
  return Math.max(0, limit * .999);
}
function metrics(heights, baseline, width, depth, row) {
  let deltaMinM = Infinity, deltaMaxM = -Infinity, maxTriangleGrade = 0;
  for (let i = 0; i < heights.length; i++) {
    const delta = heights[i] - baseline[i]; deltaMinM = Math.min(deltaMinM, delta); deltaMaxM = Math.max(deltaMaxM, delta);
  }
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const a = z * row + x, b = a + 1, c = a + row, d = c + 1;
    maxTriangleGrade = Math.max(maxTriangleGrade, Math.hypot(heights[b] - heights[a], heights[c] - heights[a]),
      Math.hypot(heights[d] - heights[c], heights[d] - heights[b]));
  }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, maxTriangleGrade };
}
function surface(vertex, x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz,
    a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1), lower = tx + tz <= 1,
    dx = lower ? b - a : d - c, dz = lower ? c - a : d - b, length = Math.hypot(dx, 1, dz);
  return { height: lower ? a + dx * tx + dz * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
    normal: { x: -dx / length, y: 1 / length, z: -dz / length }, substrate: 'mud', elementId: null };
}
function hardHeight(vertex, rows, x, z) {
  let y = surface(vertex, x, z).height;
  for (const e of rows) {
    if (Math.hypot(e.x - x, e.z - z) > Math.hypot(e.scale.x, e.scale.z) * .5 + .1) continue;
    const h = oceanRockHeight(e, x, z); if (h !== null) y = Math.max(y, h);
  }
  return y;
}
function clearDisk(vertex, rows, p, radius) {
  for (let i = 0; i < 9; i++) {
    const x = p.x + (i ? Math.cos((i - 1) * TAU / 8) * radius : 0), z = p.z + (i ? Math.sin((i - 1) * TAU / 8) * radius : 0);
    if (hardHeight(vertex, rows, x, z) > surface(vertex, x, z).height + .035) return false;
  }
  return true;
}
function wideRocks(base, chunks, cx, cz, vertex, native, origin) {
  const additions = new Map(chunks.map(c => [c.id, []])), all = [];
  const hardOwners = chunks.filter(c => c.cx - cx >= 3 && c.cx - cx <= 4 && c.counts.rock < 8)
    .sort((a, b) => b.composition.habitats['deep-hard-bottom'] - a.composition.habitats['deep-hard-bottom'] || a.id.localeCompare(b.id));
  for (const chunk of hardOwners) {
    const candidates = [];
    for (let z = 16; z <= 48; z += 8) for (let x = 16; x <= 48; x += 8) {
      const salt = `${chunk.id}:${x},${z}`;
      candidates.push({ x: chunk.origin.x + x + (random(base, `${salt}:x`) - .5) * 2,
        z: chunk.origin.z + z + (random(base, `${salt}:z`) - .5) * 2, salt });
    }
    candidates.sort((a, b) => base.sample(b.x, b.z).rockiness - base.sample(a.x, a.z).rockiness || a.salt.localeCompare(b.salt));
    const chosen = additions.get(chunk.id);
    for (const p of candidates) {
      if (chosen.length >= Math.min(2, 8 - chunk.counts.rock) || all.length >= 6) break;
      if (base.sample(p.x, p.z).rockiness < .60) continue;
      const width = 12 + random(base, `${p.salt}:width`) * 6, scale = { x: width, y: 1.4 + random(base, `${p.salt}:height`) * .8,
        z: width * (.58 + random(base, `${p.salt}:depth`) * .2) }, radius = Math.hypot(scale.x, scale.z) * .5;
      if (p.x - radius < chunk.origin.x + 8 || p.x + radius > chunk.origin.x + 56 ||
        p.z - radius < chunk.origin.z + 8 || p.z + radius > chunk.origin.z + 56 ||
        Math.min(p.x - origin.x, origin.x + WIDTH - p.x, p.z - origin.z, origin.z + DEPTH - p.z) < GUARD + radius ||
        [...native, ...all].some(e => Math.hypot(e.x - p.x, e.z - p.z) < radius + Math.hypot(e.scale.x, e.scale.z) * .5 + 2)) continue;
      let y = Infinity;
      for (let z = Math.floor(p.z - radius) - 1; z <= Math.ceil(p.z + radius) + 1; z++)
        for (let x = Math.floor(p.x - radius) - 1; x <= Math.ceil(p.x + radius) + 1; x++) y = Math.min(y, vertex(x, z));
      const e = { id: `deep-whole-seascape:${cx},${cz}:${p.salt}`, kind: 'rock', x: p.x, y: y - .015, z: p.z,
        scale, rotation: random(base, `${p.salt}:turn`) * TAU, profile: random(base, `${p.salt}:profile`) < .65 ? 'mound' : 'ridge',
        priority: base.sample(p.x, p.z).rockiness };
      if (oceanRockHeight(e, e.x, e.z) < surface(vertex, e.x, e.z).height + .5) continue;
      chosen.push(e); all.push(e);
    }
  }
  if (all.length < 3) throw new RangeError(`Deep whole group ${cx},${cz} has no supported sparse broad-rock composition.`);
  return { additions, all };
}
function plainPoint(vertex, rows, chunk) {
  for (const z of [32, 24, 40, 16, 48]) for (const x of [32, 24, 40, 16, 48]) {
    const p = { x: chunk.origin.x + x, z: chunk.origin.z + z }, s = surface(vertex, p.x, p.z), grade = Math.hypot(s.normal.x, s.normal.z) / s.normal.y;
    if (grade <= .03 && clearDisk(vertex, rows, p, 1)) return { ...p, grade, floorY: s.height };
  }
  return null;
}
function slopePoint(base, vertex, rows, origin) {
  const candidates = [];
  for (let z = 28; z <= 100; z += 4) for (let x = 100; x <= 216; x += 4) {
    const p = { x: origin.x + x, z: origin.z + z }, s = surface(vertex, p.x, p.z), grade = Math.hypot(s.normal.x, s.normal.z) / s.normal.y,
      deltaM = s.height - base.floorSurface(p.x, p.z).height;
    if (deltaM < .25 || grade <= .038 || grade > .11 || !clearDisk(vertex, rows, p, 1)) continue;
    candidates.push({ ...p, floorY: s.height, grade, deltaM, score: Math.abs(grade - .065) + Math.abs(x - 160) * .0001 });
  }
  candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.z - b.z);
  if (!candidates.length) return null; const { score, ...point } = candidates[0]; return point;
}
function outerPoint(vertex, rows, chunks) {
  for (const chunk of chunks) for (const z of [32, 24, 40, 16, 48]) for (const x of [32, 24, 40, 16, 48]) {
    const p = { x: chunk.origin.x + x, z: chunk.origin.z + z }, s = surface(vertex, p.x, p.z),
      rubble = chunk.elements.filter(e => e.kind === 'rubble' && Math.hypot(e.x - p.x, e.z - p.z) <= 24);
    if (rubble.length < 3 || !clearDisk(vertex, rows, p, .8)) continue;
    return { ...p, floorY: s.height, sourceRubbleIds: rubble.map(e => e.id), ownerId: chunk.id };
  }
  return null;
}
function build(base, chunks, origin, cx, cz) {
  const plain = chunks.filter(c => c.cx - cx <= 1).sort((a, b) =>
    b.composition.habitats['deep-soft-bottom'] - a.composition.habitats['deep-soft-bottom'] ||
    a.elements.length - b.elements.length || a.id.localeCompare(b.id))[0];
  if (plain.composition.habitats['deep-soft-bottom'] < 48) throw new RangeError(`Deep whole group ${cx},${cz} has no complete native sediment plain.`);
  const rows = halo(base, cx, cz), mask = protection(rows, plain), baseline = [], unit = [];
  for (let z = 0; z <= DEPTH; z++) for (let x = 0; x <= WIDTH; x++) {
    const wx = origin.x + x, wz = origin.z + z; baseline.push(base.floorVertex(wx, wz));
    unit.push(mask(wx, wz) * envelope(x, WIDTH) * envelope(z, DEPTH));
  }
  const amplitudeM = amplitudeLimit(baseline, unit), heights = baseline.map((y, i) => Math.fround(y + amplitudeM * unit[i])),
    measured = metrics(heights, baseline, WIDTH, DEPTH, ROW);
  if (measured.deltaSpanM < .75 || measured.maxTriangleGrade > .12)
    throw new RangeError(`Deep whole group ${cx},${cz} has no continuous gentle shared bed around its native supports.`);
  const vertex = (x, z) => x >= origin.x && x <= origin.x + WIDTH && z >= origin.z && z <= origin.z + DEPTH ?
    heights[(z - origin.z) * ROW + x - origin.x] : base.floorVertex(x, z);
  const added = wideRocks(base, chunks, cx, cz, vertex, rows, origin), actualRows = [...rows, ...added.all],
    plainCenter = plainPoint(vertex, actualRows, plain), slopeCenter = slopePoint(base, vertex, actualRows, origin),
    outerCenter = outerPoint(vertex, actualRows, [chunks[11], chunks[5]]);
  if (!plainCenter || !slopeCenter || !outerCenter) throw new RangeError(`Deep whole group ${cx},${cz} has no surveyed plain/slope/rubble transition.`);
  const hard = chunks.filter(c => added.additions.get(c.id).length).sort((a, b) => added.additions.get(b.id).length - added.additions.get(a.id).length || a.id.localeCompare(b.id))[0],
    hardRocks = added.additions.get(hard.id), outcropCenter = { x: hardRocks.reduce((n, e) => n + e.x, 0) / hardRocks.length,
      z: hardRocks.reduce((n, e) => n + e.z, 0) / hardRocks.length };
  const group = { id: `deep-whole-seascape:${cx},${cz}`, cx, cz, ownerIds: chunks.map(c => c.id), widthM: WIDTH, depthM: DEPTH,
    gridSizeX: ROW, gridSizeZ: DEPTH + 1, outerGuardM: GUARD, plainOwnerId: plain.id,
    slopeOwnerId: `${Math.floor(slopeCenter.x / OWNER)},${Math.floor(slopeCenter.z / OWNER)}`, hardOwnerId: hard.id, outerOwnerId: outerCenter.ownerId,
    plainCenter, slopeCenter, outcropCenter, outerCenter, addedRockCount: added.all.length,
    nativeRockCount: chunks.reduce((n, c) => n + c.counts.rock, 0), nativeRubbleCount: chunks.reduce((n, c) => n + c.counts.rubble, 0),
    outcropSourceIds: hardRocks.map(e => e.id), ...measured, controls: { amplitudeM, protectionRampM: 16 }, originalElementsRetained: true,
    route: [
      { id: 'deep-scene-plain', label: '整景沉积平原', x: plainCenter.x, z: plainCenter.z },
      { id: 'deep-scene-slope', label: '整景宽缓坡', x: slopeCenter.x, z: slopeCenter.z },
      { id: 'deep-scene-outcrop', label: '整景岩露头', ...outcropCenter },
      { id: 'deep-scene-outer', label: '整景开放海床', x: outerCenter.x, z: outerCenter.z },
    ] };
  return freeze(chunks.map(chunk => {
    const local = [], old = [], ox = (chunk.cx - cx) * OWNER, oz = (chunk.cz - cz) * OWNER;
    for (let z = 0; z <= OWNER; z++) for (let x = 0; x <= OWNER; x++) {
      const i = (oz + z) * ROW + ox + x; local.push(heights[i]); old.push(baseline[i]);
    }
    const additions = added.additions.get(chunk.id);
    return { version: 2, theme: 'deep-whole-seascape', id: chunk.id, cx: chunk.cx, cz: chunk.cz, seed: base.seed, baseStamp: stamp(chunk), group,
      role: chunk.id === group.plainOwnerId ? 'plain' : additions.length ? 'sparse-hard-bottom' :
        chunk.id === group.slopeOwnerId ? 'slope' : chunk.id === group.outerOwnerId ? 'rubble-transition' : 'native-sediment',
      floorPatch: { gridSize: 65, spacingM: 1, widthM: OWNER, groupOuterGuardM: GUARD, heights: local, ...metrics(local, old, OWNER, OWNER, 65) },
      addedRockIds: additions.map(e => e.id), elements: [...chunk.elements, ...additions],
      displayScope: 'one shared twelve-owner gentle sediment bed and sparse actual solids; native ecological births and food stocks persisted separately' };
  }));
}
function model(generator, cx, cz) {
  const { base, chunks, origin } = source(generator, cx, cz); let cache = models.get(base);
  if (!cache) { cache = new Map(); models.set(base, cache); }
  const key = `${cx},${cz}`;
  if (!cache.has(key)) {
    let entry; try { entry = { plans: build(base, chunks, origin, cx, cz) }; }
    catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; }
    cache.set(key, entry); if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  const entry = cache.get(key); cache.delete(key); cache.set(key, entry);
  if (entry.declined) throw new RangeError(entry.declined); return entry.plans;
}
export function createDeepWholeSeascapePlans(base, cx, cz) { return model(base, cx, cz); }
export function validateDeepWholeSeascapePlan(base, plan) {
  try {
    if (!plan || plan.version !== 2 || plan.theme !== 'deep-whole-seascape' || !plan.group ||
      !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz) || plan.id !== `${plan.cx},${plan.cz}`) return false;
    const expected = model(base, plan.group.cx, plan.group.cz).find(p => p.id === plan.id);
    return !!expected && stamp(expected) === stamp(plan);
  } catch { return false; }
}
export function deepWholeSeascapeRoute(base) {
  try { return model(base, DEEP_WHOLE_SEASCAPE_ANCHOR.cx, DEEP_WHOLE_SEASCAPE_ANCHOR.cz)[0].group.route; }
  catch (error) { if (error instanceof RangeError) return Object.freeze([]); throw error; }
}
