import { OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS } from './oceanGeneration.js';

export const OCEAN_SCENE_ELEMENTS_VERSION = 1;
export const OCEAN_SCENE_ELEMENT_LIMITS = Object.freeze({ stone: 8, 'plant-clump': 6, bottle: 1, driftwood: 2 });
export const OCEAN_SCENE_ELEMENT_LIMIT = 17;
const TAU = Math.PI * 2, MARGIN = 4, CANDIDATES = 64;
const meshes = new Map();
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const radius = e => Math.hypot(e.scale.x, e.scale.z) * .5;
const ranges = Object.freeze({ stone: [[.4, 2], [.1, .5], [.3, 1.9]],
  'plant-clump': [[1.1, 2], [.55, .95], [.825, 2.3]],
  bottle: [[.35, .35], [.085, .085], [.085, .085]], driftwood: [[1, 2], [.1, .2], [.15, .28]] });

function hash(value) {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function normalizeMesh(positions, indices) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const k = i % 3; low[k] = Math.min(low[k], positions[i]); high[k] = Math.max(high[k], positions[i]); }
  const normalized = positions.map((value, i) => Math.fround((value - low[i % 3]) / (high[i % 3] - low[i % 3]) - (i % 3 === 1 ? 0 : .5)));
  return Object.freeze({ positions: Object.freeze(normalized), indices: Object.freeze(indices) });
}
function angularStone(positions, indices, x, z, sx, sy, sz, phase) {
  const offset = positions.length / 3, sides = 7;
  positions.push(x, 0, z, x + sx * .04, sy, z - sz * .06);
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < sides; i++) {
    const a = i * TAU / sides + phase, r = .42 + .065 * Math.sin(i * 2.17 + phase);
    positions.push(x + Math.cos(a) * sx * r * (ring ? .79 : 1), ring ? sy * (.55 + .17 * Math.cos(i * 1.71 + phase)) : 0,
      z + Math.sin(a) * sz * r * (ring ? .79 : 1));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = offset + 2 + i, b = offset + 2 + j, c = a + sides, d = b + sides;
    indices.push(offset, a, b, offset + 1, d, c, a, c, d, a, d, b);
  }
}
function tube(positions, indices, rings, sectors = 10, openEnd = false) {
  for (const [x, r, cy] of rings) for (let i = 0; i < sectors; i++) {
    const a = i * TAU / sectors;
    positions.push(x, cy + Math.sin(a) * r, Math.cos(a) * r);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < sectors; i++) {
    const j = (i + 1) % sectors, a = ring * sectors + i, b = a + sectors, c = (ring + 1) * sectors + j, d = ring * sectors + j;
    indices.push(a, b, c, a, c, d);
  }
  for (const end of openEnd ? [0] : [0, rings.length - 1]) {
    const center = positions.length / 3; positions.push(rings[end][0], rings[end][2], 0);
    for (let i = 0; i < sectors; i++) {
      const a = end * sectors + i, b = end * sectors + (i + 1) % sectors;
      indices.push(...(end ? [center, b, a] : [center, a, b]));
    }
  }
}

/** Unit extents [-.5,.5] in X/Z and [0,1] in Y. All rigid support uses these
 * same Float32 triangles. Plants share one grounded root; no leaf dynamics. */
export function sceneElementMesh(kind, variant = 0) {
  if (!Object.hasOwn(OCEAN_SCENE_ELEMENT_LIMITS, kind) || !Number.isInteger(variant) || variant < 0 || variant > (kind === 'stone' ? 1 : 0))
    throw new RangeError('Unknown scene-element kind or variant.');
  const key = `${kind}:${variant}`;
  if (meshes.has(key)) return meshes.get(key);
  const p = [], ix = [];
  if (kind === 'stone') {
    angularStone(p, ix, -.12, .04, .78, 1, .85, .23 + variant * .71);
    angularStone(p, ix, .30, -.19, .38, .58 + variant * .13, .46, .8 + variant);
  } else if (kind === 'bottle') {
    // Horizontal, flooded, open glass bottle: body, shoulder and open neck.
    tube(p, ix, [[-.5, .33, .5], [-.46, .5, .5], [.18, .5, .5], [.30, .19, .5], [.48, .19, .5], [.5, .21, .5]], 12, true);
  } else if (kind === 'driftwood') {
    tube(p, ix, [[-.5, .25, .48], [-.31, .46, .50], [.03, .5, .50], [.29, .41, .46], [.5, .22, .42]], 8);
  } else {
    for (let blade = 0; blade < 12; blade++) {
      const a = blade * 2.3999632297, height = .72 + .28 * ((blade % 4) / 3), reach = .35 + (blade % 3) * .07;
      const start = p.length / 3, sideX = Math.cos(a + Math.PI / 2), sideZ = Math.sin(a + Math.PI / 2);
      for (let level = 0; level <= 3; level++) {
        const t = level / 3, width = level === 0 ? 0 : .036 * (1 - t * .8);
        for (const side of [-1, 1]) p.push(Math.cos(a) * reach * t * t + sideX * width * side,
          t * height, Math.sin(a) * reach * t * t + sideZ * width * side);
        if (level < 3) { const k = start + level * 2; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    }
    // Keep the common actual root at (0,0,0); no independent spread roots.
    const extent = Math.max(...p.filter((_v, i) => i % 3 !== 1).map(Math.abs));
    for (let i = 0; i < p.length; i++) p[i] = Math.fround(i % 3 === 1 ? p[i] : p[i] / (extent * 2));
    const mesh = Object.freeze({ positions: Object.freeze(p), indices: Object.freeze(ix) }); meshes.set(key, mesh); return mesh;
  }
  const mesh = normalizeMesh(p, ix); meshes.set(key, mesh); return mesh;
}

function triangleY(p, a, b, c, x, z) {
  const d = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
  if (Math.abs(d) < 1e-12) return null;
  const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / d;
  const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / d, w = 1 - u - v;
  return u >= -1e-9 && v >= -1e-9 && w >= -1e-9 ? u * p[a + 1] + v * p[b + 1] + w * p[c + 1] : null;
}
export function sceneElementHeight(element, x, z, swimmer = false) {
  if (!element || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (element.kind === 'plant-clump') return swimmer && Math.hypot(x - element.x, z - element.z) <= radius(element) ? element.y + element.scale.y : null;
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation), dx = x - element.x, dz = z - element.z;
  const lx = (dx * c - dz * s) / element.scale.x, lz = (dx * s + dz * c) / element.scale.z;
  if (Math.abs(lx) > .5 + 1e-9 || Math.abs(lz) > .5 + 1e-9) return null;
  const mesh = sceneElementMesh(element.kind, element.variant); let highest = -Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const y = triangleY(mesh.positions, mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3, lx, lz);
    if (y !== null) highest = Math.max(highest, y);
  }
  return Number.isFinite(highest) ? element.y + highest * element.scale.y : null;
}
function worldVertex(e, p, i) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation), x = p[i] * e.scale.x, z = p[i + 2] * e.scale.z;
  return { x: e.x + x * c + z * s, y: p[i + 1] * e.scale.y, z: e.z - x * s + z * c };
}
function groundY(generator, e) {
  if (e.kind === 'plant-clump') return generator.floorSurface(e.x, e.z).height;
  const p = sceneElementMesh(e.kind, e.variant).positions; let y = -Infinity;
  for (let i = 0; i < p.length; i += 3) { const v = worldVertex(e, p, i); y = Math.max(y, generator.floorSurface(v.x, v.z).height - v.y); }
  return y;
}
function owns(e, cx, cz) {
  const r = radius(e);
  return e.x - r >= cx * OCEAN_CHUNK_SIZE + MARGIN && e.x + r <= (cx + 1) * OCEAN_CHUNK_SIZE - MARGIN &&
    e.z - r >= cz * OCEAN_CHUNK_SIZE + MARGIN && e.z + r <= (cz + 1) * OCEAN_CHUNK_SIZE - MARGIN &&
    Math.hypot(e.x, e.z) - r > OCEAN_AUTHORED_RADIUS;
}
function surroundings(generator, cx, cz) {
  const elements = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) elements.push(...generator.chunk(cx + dx, cz + dz).elements);
  return elements;
}
function clearScenery(e, rows) {
  return !rows.some(p => ['rock', 'formation', 'coral', 'seagrass'].includes(p.kind) && Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + radius(p) + .15);
}
function viableGround(generator, e, surface) {
  const state = generator.sample(e.x, e.z);
  if (!Number.isFinite(state.depthM) || state.depthM < 3 || state.depthM > (e.kind === 'stone' ? 30 : 23) ||
      (e.kind !== 'stone' && state.substrate === 'rock')) return false;
  if (e.kind === 'plant-clump' && (state.seagrassSuitability <= .36 || state.depthM >= 23)) return false;
  const p = sceneElementMesh(e.kind, e.variant).positions;
  for (let i = 0; i < p.length; i += 3) {
    const v = worldVertex(e, p, i), floor = generator.floorSurface(v.x, v.z).height;
    if (Math.abs(surface(v.x, v.z) - floor) > .025) return false;
  }
  return true;
}
function collectPoints(value, points, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return;
  if (finitePoint(value)) { points.push(value); return; }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectPoints(child, points, depth + 1);
}
function segmentDistance(e, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = dx * dx + dz * dz;
  const t = d ? Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.z - a.z) * dz) / d)) : 0;
  return Math.hypot(e.x - a.x - dx * t, e.z - a.z - dz * t);
}
function protections(region) {
  const guards = [];
  for (const a of [...(region.agents || []), ...(region.turtleAgents || [])]) {
    const points = [];
    for (const [key, value] of Object.entries(a)) if (/(position|home|target|refuge|school|patrol|waypoint|path|route|anchor)/i.test(key)) collectPoints(value, points);
    const r = Math.max(.7, (Number.isFinite(a.sizeM) ? a.sizeM : .5) * .65), h = Math.max(.15, (a.sizeM || .5) * .55);
    for (let i = 0; i < points.length; i++) for (let j = i; j < points.length; j++) guards.push({ a: points[i], b: points[j], r, low: Math.min(points[i].y, points[j].y) - h, high: Math.max(points[i].y, points[j].y) + h });
    for (const key of ['schoolHome', 'patrolHome']) if (finitePoint(a[key])) {
      const rOrbit = Math.max(a.orbitRadiusM || 0, a.roamingRadiusM || 0, a.roamingSchoolRadiusM || 0);
      guards.push({ a: a[key], b: a[key], r: rOrbit + r, low: a[key].y - h - .3, high: a[key].y + h + .3 });
    }
    if (a.speciesId === 'green-turtle' && Array.isArray(a.patrolWaypoints)) for (let i = 0; i < a.patrolWaypoints.length; i++)
      guards.push({ a: a.patrolWaypoints[i], b: a.patrolWaypoints[(i + 1) % a.patrolWaypoints.length], r: .64 * a.sizeM + .37, low: -Infinity, high: Infinity });
  }
  for (const [key, value] of Object.entries(region)) if (/(food|patch|parcel)/i.test(key)) {
    const points = []; collectPoints(value, points);
    for (const p of points) guards.push({ a: p, b: p, r: .75, low: p.y - .5, high: p.y + .5 });
  }
  return guards;
}
function clearBiology(e, guards) {
  return !guards.some(g => e.y <= g.high + .1 && e.y + e.scale.y >= g.low - .1 && segmentDistance(e, g.a, g.b) < radius(e) + g.r);
}
function freezeElement(e) { Object.freeze(e.scale); if (e.sourceGrassIds) Object.freeze(e.sourceGrassIds); return Object.freeze(e); }

/** One finite macro combination near an existing grass bed. Independent salts
 * never consume biology RNG; creation protects old records but never edits them. */
export function createOceanSceneElements(generator, region, { seed = generator.seed, surface } = {}) {
  if (!Number.isSafeInteger(region.cx) || !Number.isSafeInteger(region.cz) || region.id !== `${region.cx},${region.cz}` || typeof surface !== 'function')
    throw new TypeError('Scene elements require a valid owner and baseline solid surface.');
  const random = salt => hash(`${typeof seed}:${seed}|scene-elements-v1|${region.id}|${salt}`);
  const rows = surroundings(generator, region.cx, region.cz), grass = rows.filter(e => e.kind === 'seagrass'), guards = protections(region);
  const anchors = grass.filter(p => p.x >= region.cx * 64 + 15 && p.x <= (region.cx + 1) * 64 - 15 && p.z >= region.cz * 64 + 15 && p.z <= (region.cz + 1) * 64 - 15)
    .sort((a, b) => random(`anchor:${a.id}`) - random(`anchor:${b.id}`));
  const anchor = anchors[0] || { x: region.cx * 64 + 32 + (random('center-x') - .5) * 16, z: region.cz * 64 + 32 + (random('center-z') - .5) * 16 };
  const elements = [];
  for (const kind of ['plant-clump', 'stone', 'driftwood', 'bottle']) {
    if (kind === 'bottle' && random('bottle-present') > .32 || kind === 'driftwood' && random('wood-present') > .68) continue;
    let count = 0;
    for (let index = 0; index < CANDIDATES && count < OCEAN_SCENE_ELEMENT_LIMITS[kind]; index++) {
      const rng = salt => random(`${kind}:${index}:${salt}`), angle = rng('angle') * TAU, r = 2 + 10 * Math.sqrt(rng('radius'));
      const e = { id: `scene-element:${region.id}:${kind}:${index}`, regionId: region.id, kind,
        x: anchor.x + Math.cos(angle) * r, y: 0, z: anchor.z + Math.sin(angle) * r,
        rotation: rng('rotation') * TAU, scale: {}, variant: kind === 'stone' ? Math.floor(rng('variant') * 2) : 0 };
      const bounds = ranges[kind]; ['x', 'y', 'z'].forEach((axis, i) => { e.scale[axis] = bounds[i][0] + rng(`scale-${axis}`) * (bounds[i][1] - bounds[i][0]); });
      e.habitat = generator.sample(e.x, e.z).habitat;
      if (!owns(e, region.cx, region.cz) || !clearScenery(e, rows) || elements.some(p => Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + radius(p) + .25)) continue;
      if (kind === 'plant-clump') {
        const sources = grass.filter(p => Math.hypot(e.x - p.x, e.z - p.z) <= 7 && generator.sample(p.x, p.z).substrate !== 'rock').sort((a, b) => a.id.localeCompare(b.id));
        if (sources.length < 2) continue;
        e.sourceGrassId = sources[0].id; e.sourceGrassIds = sources.map(p => p.id);
      }
      if (kind === 'bottle') { e.physicalState = 'grounded-flooded'; e.flooded = true; e.sealed = false; }
      e.y = groundY(generator, e);
      if (!viableGround(generator, e, surface) || !clearBiology(e, guards)) continue;
      elements.push(freezeElement(e)); count++;
    }
  }
  return elements;
}

/** Historical scenery has no stock, food, clocks or metabolism to regenerate.
 * Validate persisted geometry, not the original allocation exclusion against
 * later moving animals. Turtle body validation follows support registration. */
export function validateOceanSceneElementsRecord(record, generator, { surface } = {}) {
  if (record.sceneElementsVersion === undefined && record.sceneElementsInitializedAtSec === undefined && record.sceneElements === undefined) return true;
  if (record.sceneElementsVersion !== 1 || !Number.isSafeInteger(record.cx) || !Number.isSafeInteger(record.cz) || record.id !== `${record.cx},${record.cz}` ||
      !Number.isFinite(record.timeSec) || record.timeSec < 0 || !Number.isFinite(record.sceneElementsInitializedAtSec) || record.sceneElementsInitializedAtSec < 0 ||
      record.sceneElementsInitializedAtSec > record.timeSec || !Array.isArray(record.sceneElements) || record.sceneElements.length > OCEAN_SCENE_ELEMENT_LIMIT || typeof surface !== 'function') return false;
  const rows = surroundings(generator, record.cx, record.cz), grass = new Map(rows.filter(p => p.kind === 'seagrass').map(p => [p.id, p]));
  const counts = Object.fromEntries(Object.keys(OCEAN_SCENE_ELEMENT_LIMITS).map(k => [k, 0])), ids = new Set();
  for (const e of record.sceneElements) {
    if (!e || !Object.hasOwn(counts, e.kind) || !finitePoint(e) || !e.scale || !Number.isFinite(e.rotation) || e.rotation < 0 || e.rotation >= TAU ||
        !Number.isInteger(e.variant) || e.variant < 0 || e.variant > (e.kind === 'stone' ? 1 : 0) || e.regionId !== record.id || typeof e.id !== 'string' ||
        !e.id.startsWith(`scene-element:${record.id}:${e.kind}:`) || ids.has(e.id)) return false;
    const suffix = e.id.slice(`scene-element:${record.id}:${e.kind}:`.length);
    if (!/^(0|[1-9]\d*)$/.test(suffix) || Number(suffix) >= CANDIDATES || ++counts[e.kind] > OCEAN_SCENE_ELEMENT_LIMITS[e.kind] ||
        !['x', 'y', 'z'].every((axis, i) => Number.isFinite(e.scale[axis]) && e.scale[axis] >= ranges[e.kind][i][0] && e.scale[axis] <= ranges[e.kind][i][1]) ||
        !owns(e, record.cx, record.cz) || !clearScenery(e, rows) || Math.abs(e.y - groundY(generator, e)) > 1e-8 || !viableGround(generator, e, surface) ||
        e.habitat !== generator.sample(e.x, e.z).habitat) return false;
    if (record.sceneElements.some(p => p !== e && p?.scale && finitePoint(p) && Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + radius(p) + .25)) return false;
    if (e.kind === 'plant-clump') {
      if (!Array.isArray(e.sourceGrassIds) || e.sourceGrassIds.length < 2 || e.sourceGrassIds.length > grass.size || !e.sourceGrassIds.includes(e.sourceGrassId) || new Set(e.sourceGrassIds).size !== e.sourceGrassIds.length ||
          !e.sourceGrassIds.every(id => { const p = grass.get(id); return p && Math.hypot(e.x - p.x, e.z - p.z) <= 7 && generator.sample(p.x, p.z).substrate !== 'rock'; })) return false;
    } else if (e.sourceGrassId !== undefined || e.sourceGrassIds !== undefined) return false;
    if (e.kind === 'bottle' && (e.physicalState !== 'grounded-flooded' || e.flooded !== true || e.sealed !== false)) return false;
    if (['energy', 'oxygen', 'biomass', 'foodStock', 'lastFeedAt'].some(key => Object.hasOwn(e, key))) return false;
    ids.add(e.id);
  }
  return true;
}
