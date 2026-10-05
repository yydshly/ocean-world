import { OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS } from './oceanGeneration.js';
import { oceanRockHeight } from './oceanRockShape.js';

export const OCEAN_HABITAT_SCENE_VERSION = 1;
export const OCEAN_HABITAT_SCENE_LIMIT = 36;
const KINDS = ['coral-branch', 'coral-table', 'sea-fan', 'grass-meadow'];
const THEMES = ['reef-garden', 'grass-meadow', 'outer-slope', 'open-sand'];
const TAU = Math.PI * 2, OFFSET = .004, MARGIN = 4, meshes = new Map();
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const radius = e => Math.max(e.scale.x, e.scale.z) * .5;
const oldRadius = e => Math.hypot(e.scale.x, e.scale.z) * .5;
function hash(value) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function branch(p, ix, a, b, bottom = .014, top = .008) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz), n = [dx / length, dy / length, dz / length];
  const q = Math.hypot(n[0], n[1]) > .01 ? [-n[1], n[0], 0] : [0, -n[2], n[1]], qLength = Math.hypot(...q);
  const u = q.map(v => v / qLength), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]], start = p.length / 3;
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5, r = ring ? top : bottom, center = ring ? b : a;
    for (let k = 0; k < 3; k++) p.push(center[k] + r * (Math.cos(angle) * u[k] + Math.sin(angle) * v[k]));
  }
  for (let i = 0; i < 5; i++) { const j = (i + 1) % 5; ix.push(start + i, start + j, start + j + 5, start + i, start + j + 5, start + i + 5); }
}
/** Static shared triangles. Every kind has a common root at the origin,
 * radial XZ <= .5 and Y in [0,1]; no shader or leaf deformation. */
export function habitatSceneMesh(kind) {
  if (!KINDS.includes(kind)) throw new RangeError('Unknown habitat-scene kind.');
  if (meshes.has(kind)) return meshes.get(kind);
  const p = [], ix = [];
  if (kind === 'grass-meadow') {
    // Tall inner leaves fill the crown; the broad outer leaves bend only after
    // rising clear of the bed, rather than radiating as a flat star at the root.
    for (let blade = 0; blade < 64; blade++) {
      const angle = blade * 2.3999632297 + .18 * Math.sin(blade * 1.73), inner = blade < 22;
      const height = (inner ? .82 : .69) + .16 * (.5 + .5 * Math.sin(blade * 2.17));
      const reach = (inner ? .07 : .29) + (inner ? .15 : .18) * (.5 + .5 * Math.sin(blade * 1.41));
      const breadth = .034 + .025 * (.5 + .5 * Math.sin(blade * 3.11)), start = p.length / 3;
      for (let level = 0; level <= 8; level++) {
        const t = level / 8, bend = reach * t * t * t, twist = angle + .28 * Math.sin(blade * .81) * t;
        const width = level ? breadth * t * Math.pow(Math.sin(Math.PI * t), .7) + .004 * t * t : 0;
        for (const side of [-1, 1]) p.push(Math.cos(twist) * bend - Math.sin(twist) * width * side,
          height * t + .055 * Math.sin(Math.PI * t), Math.sin(twist) * bend + Math.cos(twist) * width * side);
        if (level < 8) { const a = start + level * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
  } else if (kind === 'coral-branch') {
    branch(p, ix, [0, 0, 0], [0, .89, 0], 0, .037);
    for (let i = 0; i < 21; i++) {
      const angle = i * 2.3999632297, root = [0, .49 + (i % 4) * .045, 0];
      const reach = .20 + .04 * Math.sin(i * 1.71), fork = [Math.cos(angle) * reach, .67 + (i % 4) * .048, Math.sin(angle) * reach];
      branch(p, ix, root, fork, .031, .024);
      for (const side of [-1, 1]) {
        const tipAngle = angle + side * (.24 + .09 * Math.sin(i * 1.31));
        const tipReach = .39 + .07 * (.5 + .5 * Math.sin(i * 2.23 + side));
        const tip = [Math.cos(tipAngle) * tipReach, .86 + .14 * (.5 + .5 * Math.sin(i * 1.61 + side)), Math.sin(tipAngle) * tipReach];
        branch(p, ix, fork, tip, .022, .012);
        const twig = [tip[0] * .85, .93 + .08 * (.5 + .5 * Math.sin(i * 2.71 + side)), tip[2] * .85];
        branch(p, ix, tip.map((value, axis) => axis === 1 ? value - .10 : value * .81), twig, .013, .007);
      }
    }
  } else if (kind === 'coral-table') {
    branch(p, ix, [0, 0, 0], [0, .92, 0], 0, .045);
    // Several off-centre shelves share the same root and leave visible gaps
    // between tiers, producing a colony silhouette instead of one mushroom.
    const tiers = [[.11, .87, .03, .30], [-.08, .91, -.04, .37], [.12, .95, .02, .31], [-.035, .99, .03, .29]];
    for (let tier = 0; tier < tiers.length; tier++) {
      const [x, y, z, radius] = tiers[tier], segments = 28;
      branch(p, ix, [0, Math.max(.48, y - .14), 0], [x, y, z], .035, .027);
      const plate = p.length / 3; p.push(x, y + .013, z, x, y - .017, z);
      for (let i = 0; i < segments; i++) {
        const angle = i * TAU / segments, r = radius * (1 + .085 * Math.sin(i * 2.13 + tier));
        const rimY = y + .013 * Math.sin(i * 1.31 + tier);
        p.push(x + Math.cos(angle) * r, rimY, z + Math.sin(angle) * r,
          x + Math.cos(angle) * r, rimY - .018, z + Math.sin(angle) * r);
      }
      for (let i = 0; i < segments; i++) {
        const a = plate + 2 + i * 2, b = plate + 2 + (i + 1) % segments * 2;
        ix.push(plate, b, a, plate + 1, a + 1, b + 1, a, b, a + 1, a + 1, b, b + 1);
      }
    }
  } else {
    branch(p, ix, [0, 0, 0], [0, .58, 0], 0, .023);
    const ribs = 23, rings = 6, points = [];
    for (let i = 0; i < ribs; i++) {
      const angle = -1.1 + i * 2.2 / (ribs - 1), row = [[0, .58, 0]];
      const tip = [Math.sin(angle) * .56, .55 + Math.cos(angle) * .45, .025 * Math.sin(i * 1.17)];
      for (let ring = 1; ring <= rings; ring++) {
        const t = ring / rings, next = [tip[0] * t, .58 + (tip[1] - .58) * t,
          tip[2] * t + .018 * Math.sin(i * .77) * Math.sin(Math.PI * t)];
        branch(p, ix, row[ring - 1], next, .019 - .007 * t, .018 - .008 * t); row.push(next);
      }
      points.push(row);
    }
    for (let i = 0; i < ribs - 1; i++) for (let ring = 1; ring <= rings; ring++) {
      branch(p, ix, points[i][ring], points[i + 1][ring], .011, .011);
      if (ring < rings && (i + ring) % 2 === 0) branch(p, ix, points[i][ring], points[i + 1][ring + 1], .009, .009);
    }
  }
  let extent = 0, height = 0;
  for (let i = 0; i < p.length; i += 3) { extent = Math.max(extent, Math.hypot(p[i], p[i + 2])); height = Math.max(height, p[i + 1]); }
  for (let i = 0; i < p.length; i++) p[i] = Math.fround(p[i] / (i % 3 === 1 ? height : extent * 2));
  const mesh = Object.freeze({ positions: Object.freeze(p), indices: Object.freeze(ix) }); meshes.set(kind, mesh); return mesh;
}
/** A conservative static crown for swimmers, never a new rock for crawlers. */
export function habitatSceneHeight(e, x, z, swimmer = true) {
  return swimmer && e && KINDS.includes(e.kind) && Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x - e.x, z - e.z) <= radius(e) + 1e-8 ? e.y + e.scale.y : null;
}
function surroundings(generator, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) rows.push(...generator.chunk(cx + dx, cz + dz).elements);
  return rows;
}
function owns(e, cx, cz) {
  const r = radius(e);
  return e.x - r >= cx * 64 + MARGIN && e.x + r <= (cx + 1) * 64 - MARGIN && e.z - r >= cz * 64 + MARGIN && e.z + r <= (cz + 1) * 64 - MARGIN && Math.hypot(e.x, e.z) - r > OCEAN_AUTHORED_RADIUS;
}
function points(value, out, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return;
  if (finitePoint(value)) { out.push(value); return; }
  for (const child of Array.isArray(value) ? value : Object.values(value)) points(child, out, depth + 1);
}
function guardsFor(region) {
  const guards = [], near = [];
  for (const a of [...(region.agents || []), ...(region.turtleAgents || [])]) {
    const list = [];
    for (const [k, v] of Object.entries(a)) if (/(position|home|target|refuge|school|patrol|waypoint|path|route|anchor)/i.test(k)) points(v, list);
    if (finitePoint(a.position)) near.push(a.position); if (finitePoint(a.home)) near.push(a.home);
    const r = Math.max(.7, (a.sizeM || .5) * .65), h = Math.max(.15, (a.sizeM || .5) * .55);
    for (let i = 0; i < list.length; i++) for (let j = i; j < list.length; j++) guards.push({ a: list[i], b: list[j], r, low: Math.min(list[i].y, list[j].y) - h, high: Math.max(list[i].y, list[j].y) + h });
    for (const k of ['schoolHome', 'patrolHome']) if (finitePoint(a[k])) guards.push({ a: a[k], b: a[k],
      r: Math.max(a.orbitRadiusM || 0, a.roamingRadiusM || 0, a.roamingSchoolRadiusM || 0) + r, low: a[k].y - h - .3, high: a[k].y + h + .3 });
    if (a.speciesId === 'green-turtle' && Array.isArray(a.patrolWaypoints)) for (let i = 0; i < a.patrolWaypoints.length; i++) guards.push({ a: a.patrolWaypoints[i], b: a.patrolWaypoints[(i + 1) % a.patrolWaypoints.length], r: .64 * a.sizeM + .37, low: -Infinity, high: Infinity });
  }
  for (const [k, v] of Object.entries(region)) if (/(food|patch|parcel)/i.test(k)) { const list = []; points(v, list); for (const p of list) guards.push({ a: p, b: p, r: .75, low: p.y - .5, high: p.y + .5 }); }
  return { guards, near };
}
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = dx * dx + dz * dz;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / d)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function clearBiology(e, guards) { return !guards.some(g => e.y <= g.high + .1 && e.y + e.scale.y >= g.low - .1 && distanceToSegment(e, g.a, g.b) < radius(e) + g.r); }
function clearScenery(e, rows, macro, placed) {
  return !rows.some(p => p.id !== e.hostId && ['coral', 'seagrass'].includes(p.kind) && Math.hypot(e.x - p.x, e.z - p.z) <
    // Meadow leaf crowns may mingle with the existing bed. Retain distinct
    // actual root patches; full new crowns still protect animals and props.
    (e.kind === 'grass-meadow' && p.kind === 'seagrass' ? .18 + Math.min(.35, Math.max(p.scale.x, p.scale.z) * .2) : radius(e) + oldRadius(p) + .1)) &&
    !macro.some(p => Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + oldRadius(p) + .1) &&
    !placed.some(p => Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + radius(p) + .12);
}
function rootAndGeometryValid(e, generator, hosts, surface) {
  const state = generator.sample(e.x, e.z), meadow = e.kind === 'grass-meadow';
  if (state.depthM < 3 || state.depthM > (e.kind === 'sea-fan' ? 35 : meadow ? 23 : 22)) return false;
  let root;
  if (meadow) {
    if (state.substrate === 'rock' || state.seagrassSuitability <= .36 || state.depthM >= 23) return false;
    root = generator.floorSurface(e.x, e.z).height;
    if (Math.abs(surface(e.x, e.z) - root) > .025) return false;
  } else {
    const host = hosts.get(e.hostId); if (!host) return false;
    if (state.depthM > 22 && (e.kind !== 'sea-fan' || host.kind !== 'formation')) return false;
    const top = oceanRockHeight(host, e.x, e.z); if (top === null || !Number.isFinite(top) || Math.abs(surface(e.x, e.z) - top) > .025) return false;
    root = top + OFFSET;
  }
  if (Math.abs(e.y - root) > 1e-8) return false;
  const mesh = habitatSceneMesh(e.kind), c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] * e.scale.x, z = mesh.positions[i + 2] * e.scale.z;
    if (e.y + mesh.positions[i + 1] * e.scale.y < surface(e.x + x * c + z * s, e.z - x * s + z * c) - 1e-8) return false;
  }
  return true;
}
function themeFor(generator, region, chunk, hosts, grass) {
  const primary = chunk.habitatComposition?.primary, center = generator.sample(region.cx * 64 + 32, region.cz * 64 + 32);
  if (primary === 'slope' || center.depthM > 22) return hosts.some(p => p.kind === 'formation') ? 'outer-slope' : 'open-sand';
  if (primary === 'seagrass' || (grass.length >= 8 && (primary === 'sand' || center.seagrassSuitability > .36))) return 'grass-meadow';
  if (primary === 'reef' || hosts.some(p => p.kind === 'rock' && generator.sample(p.x, p.z).depthM <= 22)) return 'reef-garden';
  return 'open-sand';
}
function freezeElement(e) { Object.freeze(e.scale); if (e.sourceGrassIds) Object.freeze(e.sourceGrassIds); return Object.freeze(e); }

export function createOceanHabitatScene(generator, region, { seed = generator.seed, surface } = {}) {
  if (!region || !Number.isSafeInteger(region.cx) || !Number.isSafeInteger(region.cz) || region.id !== `${region.cx},${region.cz}` || typeof surface !== 'function') throw new TypeError('Habitat scene requires a valid owner and baseline surface.');
  const seedKey = `${typeof seed}:${seed}|habitat-scenes-v1`, random = salt => hash(`${seedKey}|${salt}`), chunk = generator.chunk(region.cx, region.cz);
  const rows = surroundings(generator, region.cx, region.cz), hostRows = rows.filter(p => p.kind === 'rock' || p.kind === 'formation'), hosts = new Map(hostRows.map(p => [p.id, p]));
  const grass = rows.filter(p => p.kind === 'seagrass'), ownGrass = chunk.elements.filter(p => p.kind === 'seagrass'), { guards, near } = guardsFor(region);
  const theme = themeFor(generator, region, chunk, chunk.elements.filter(p => p.kind === 'rock' || p.kind === 'formation'), ownGrass), macro = region.sceneElements || [], elements = [];
  const proximity = p => near.length ? Math.min(...near.map(a => Math.hypot(p.x - a.x, p.z - a.z))) : Math.hypot(p.x - region.cx * 64 - 32, p.z - region.cz * 64 - 32);
  const admit = e => {
    if (elements.length >= OCEAN_HABITAT_SCENE_LIMIT || !owns(e, region.cx, region.cz) || !clearScenery(e, rows, macro, elements) || !clearBiology(e, guards) || !rootAndGeometryValid(e, generator, hosts, surface)) return false;
    elements.push(freezeElement(e)); return true;
  };
  if (theme === 'grass-meadow' || theme === 'reef-garden') {
    const anchors = ownGrass.slice().sort((a, b) => proximity(a) - proximity(b) + random(`grass:${a.id}`) - random(`grass:${b.id}`)).slice(0, 32);
    const limit = theme === 'grass-meadow' ? 24 : 8;
    for (const plant of anchors) for (let i = 0; i < 8 && elements.length < limit; i++) {
      const key = `meadow:${plant.id}:${i}`, angle = i * TAU / 8 + random(`${key}:angle`) * .6, r = 2.4 + random(`${key}:distance`) * 2.8;
      const x = plant.x + Math.cos(angle) * r, z = plant.z + Math.sin(angle) * r, sources = grass.filter(p => Math.hypot(p.x - x, p.z - z) <= 7 && generator.sample(p.x, p.z).substrate !== 'rock').sort((a, b) => a.id.localeCompare(b.id));
      if (sources.length < 2) continue;
      const width = 2 + random(`${key}:width`) ** 2 * 2;
      admit({ id: `habitat-scene:${region.id}:${key}`, regionId: region.id, kind: 'grass-meadow', x, y: generator.floorSurface(x, z).height, z,
        rotation: random(`${key}:rotation`) * TAU, scale: { x: width, y: .55 + random(`${key}:height`) * .65, z: 2 + random(`${key}:depth`) * 1.2 },
        habitat: generator.sample(x, z).habitat, sourceGrassId: sources[0].id, sourceGrassIds: sources.map(p => p.id) });
    }
  }
  if (theme !== 'open-sand') {
    const sortedHosts = hostRows.slice().sort((a, b) => proximity(a) - proximity(b) + random(`host:${a.id}`) - random(`host:${b.id}`));
    for (const host of sortedHosts) for (let i = 0; i < 16 && elements.length < OCEAN_HABITAT_SCENE_LIMIT; i++) {
      const key = `host:${host.id}:${i}`, theta = i * 2.3999632297 + random(`${key}:angle`) * .25, r = .10 + random(`${key}:distance`) * .31;
      const lx = Math.cos(theta) * host.scale.x * r, lz = Math.sin(theta) * host.scale.z * r, c = Math.cos(host.rotation), s = Math.sin(host.rotation);
      const x = host.x + lx * c + lz * s, z = host.z - lx * s + lz * c, state = generator.sample(x, z), top = oceanRockHeight(host, x, z);
      if (top === null || (theme === 'outer-slope' && (host.kind !== 'formation' || state.depthM < 22))) continue;
      const kind = theme === 'outer-slope' ? 'sea-fan' : ['coral-branch', 'coral-table', 'sea-fan'][Math.floor(random(`${key}:kind`) * 3)];
      if (state.depthM > 22 && kind !== 'sea-fan') continue;
      const width = 1 + random(`${key}:width`);
      admit({ id: `habitat-scene:${region.id}:${key}`, regionId: region.id, kind, x, y: top + OFFSET, z,
        rotation: random(`${key}:rotation`) * TAU, scale: { x: width, y: .55 + random(`${key}:height`) * .85,
          z: kind === 'sea-fan' ? .22 + random(`${key}:depth`) * .18 : width * (.75 + random(`${key}:depth`) * .25) }, habitat: state.habitat, hostId: host.id });
    }
  }
  return { theme, elements };
}

export function validateOceanHabitatSceneRecord(record, generator, { surface } = {}) {
  if (!record || typeof record !== 'object') return false;
  const keys = ['habitatSceneVersion', 'habitatSceneInitializedAtSec', 'habitatSceneTheme', 'habitatSceneElements'];
  if (keys.every(k => record[k] === undefined)) return true;
  if (record.habitatSceneVersion !== 1 || !Number.isSafeInteger(record.cx) || !Number.isSafeInteger(record.cz) || record.id !== `${record.cx},${record.cz}` ||
      !Number.isFinite(record.timeSec) || record.timeSec < 0 || !Number.isFinite(record.habitatSceneInitializedAtSec) || record.habitatSceneInitializedAtSec < 0 || record.habitatSceneInitializedAtSec > record.timeSec ||
      !THEMES.includes(record.habitatSceneTheme) || !Array.isArray(record.habitatSceneElements) || record.habitatSceneElements.length > OCEAN_HABITAT_SCENE_LIMIT || typeof surface !== 'function') return false;
  const rows = surroundings(generator, record.cx, record.cz), hosts = new Map(rows.filter(p => p.kind === 'rock' || p.kind === 'formation').map(p => [p.id, p])), grass = new Map(rows.filter(p => p.kind === 'seagrass').map(p => [p.id, p]));
  const chunk = generator.chunk(record.cx, record.cz);
  if (record.habitatSceneTheme !== themeFor(generator, record, chunk, chunk.elements.filter(p => p.kind === 'rock' || p.kind === 'formation'), chunk.elements.filter(p => p.kind === 'seagrass'))) return false;
  const ids = new Set(), placed = [], macro = record.sceneElements || [];
  for (const e of record.habitatSceneElements) {
    const meadow = e?.kind === 'grass-meadow';
    if (!e || !KINDS.includes(e.kind) || !finitePoint(e) || e.regionId !== record.id || typeof e.id !== 'string' || !e.id.startsWith(`habitat-scene:${record.id}:`) || ids.has(e.id) ||
        !Number.isFinite(e.rotation) || e.rotation < 0 || e.rotation >= TAU || !e.scale || !['x', 'y', 'z'].every(k => Number.isFinite(e.scale[k]) && e.scale[k] > 0) ||
        e.scale.x < (meadow ? 2 : 1) || e.scale.x > (meadow ? 4 : 2) || e.scale.y < .55 || e.scale.y > (meadow ? 1.2 : 1.4) ||
        (meadow ? e.scale.z < 2 || e.scale.z > 3.2 : e.kind === 'sea-fan' ? e.scale.z < .22 || e.scale.z > .4 : e.scale.z < e.scale.x * .75 || e.scale.z > e.scale.x) ||
        !owns(e, record.cx, record.cz) || !clearScenery(e, rows, macro, placed) || !rootAndGeometryValid(e, generator, hosts, surface) || e.habitat !== generator.sample(e.x, e.z).habitat) return false;
    if (meadow) {
      if (e.hostId !== undefined || !Array.isArray(e.sourceGrassIds) || e.sourceGrassIds.length < 2 || e.sourceGrassIds.length > grass.size || !e.sourceGrassIds.includes(e.sourceGrassId) || new Set(e.sourceGrassIds).size !== e.sourceGrassIds.length ||
          !e.sourceGrassIds.every(id => { const p = grass.get(id); return p && Math.hypot(e.x - p.x, e.z - p.z) <= 7 && generator.sample(p.x, p.z).substrate !== 'rock'; })) return false;
      const anchor = /^meadow:(seagrass:-?\d+,-?\d+:(?:\d+|bed-\d+)):[0-7]$/.exec(e.id.slice(`habitat-scene:${record.id}:`.length));
      if (!anchor || !e.sourceGrassIds.includes(anchor[1])) return false;
    } else {
      if (e.sourceGrassId !== undefined || e.sourceGrassIds !== undefined || !hosts.has(e.hostId) || !e.id.startsWith(`habitat-scene:${record.id}:host:${e.hostId}:`) ||
          !/^(?:[0-9]|1[0-5])$/.test(e.id.slice(`habitat-scene:${record.id}:host:${e.hostId}:`.length))) return false;
    }
    if (['energy', 'oxygen', 'foodStock', 'biomass', 'lastFeedAt'].some(k => Object.hasOwn(e, k))) return false;
    ids.add(e.id); placed.push(e);
  }
  return true;
}
