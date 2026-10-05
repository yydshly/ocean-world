import { OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS, OCEAN_SURFACE_Y } from './oceanGeneration.js';
import { oceanRockHeight } from './oceanRockShape.js';
import { habitatSceneMesh } from './oceanHabitatScenes.js';

export const OCEAN_MACRO_LANDSCAPE_VERSION = 2;
export const OCEAN_MACRO_LANDSCAPE_LIMITS = Object.freeze({ 'reef-mass': 2, 'meadow-shoot': 600,
  'reef-colony': 64, total: 666, massGridCells: 256 });
const STEP = 1.25, SIDE = 16, TAU = Math.PI * 2, ROOT_GAP = .006;
const KINDS = ['reef-mass', 'meadow-shoot', 'reef-colony'], COLONIES = ['coral-branch', 'coral-table', 'sea-fan'];
const meshCache = new WeakMap(), plantCache = new Map();
const finite = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
const radius = element => .5 * Math.max(element.scale?.x ?? 0, element.scale?.z ?? 0);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function hash(value) {
  let h = 2166136261; for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function ownerValid(region) {
  return region && Number.isSafeInteger(region.cx) && Number.isSafeInteger(region.cz) && region.id === `${region.cx},${region.cz}`;
}
function rowsFor(generator, region) {
  const rows = [];
  for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) rows.push(...generator.chunk(region.cx + x, region.cz + z).elements);
  return rows;
}
function indexed(rows, extent) {
  const bins = new Map();
  for (const row of rows) {
    const r = extent(row);
    for (let z = Math.floor((row.z - r) / 4); z <= Math.floor((row.z + r) / 4); z++)
      for (let x = Math.floor((row.x - r) / 4); x <= Math.floor((row.x + r) / 4); x++) {
        const key = `${x},${z}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(row);
      }
  }
  return (x, z, r = 0) => {
    const found = new Set();
    for (let iz = Math.floor((z - r) / 4); iz <= Math.floor((z + r) / 4); iz++)
      for (let ix = Math.floor((x - r) / 4); ix <= Math.floor((x + r) / 4); ix++)
        for (const row of bins.get(`${ix},${iz}`) ?? []) found.add(row);
    return found;
  };
}
function baseContext(generator, region) {
  const rows = rowsFor(generator, region), rocks = rows.filter(e => e.kind === 'rock' || e.kind === 'formation');
  const rockAt = indexed(rocks, e => .5 * Math.hypot(e.scale.x, e.scale.z)), memo = new Map();
  const solid = (x, z) => {
    const key = `${x},${z}`; if (memo.has(key)) return memo.get(key);
    let top = generator.floorSurface(x, z).height;
    for (const rock of rockAt(x, z)) { const value = oceanRockHeight(rock, x, z); if (value !== null) top = Math.max(top, value); }
    memo.set(key, top); return top;
  };
  const native = rows.filter(e => ['coral', 'seagrass', 'algae'].includes(e.kind)).map(e => ({
    id: e.id, x: e.x, z: e.z, r: Math.max(.22, .68 * Math.max(e.scale.x, e.scale.z)), low: e.y - .04, high: e.y + e.scale.y * 1.1,
  }));
  for (const e of [...(region.sceneElements ?? []), ...(region.habitatSceneElements ?? [])]) native.push({
    id: e.id, x: e.x, z: e.z, r: .5 * Math.hypot(e.scale.x, e.scale.z) + .08, low: e.y - .04, high: e.y + e.scale.y + .08,
  });
  return { rows, rocks, solid, native, nativeAt: indexed(native, e => e.r) };
}
function distanceSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length)) : 0;
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
function pointList(value, out, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return;
  if (finite(value)) { out.push(value); return; }
  for (const child of Object.values(value)) pointList(child, out, depth + 1);
}
function biologicalGuards(region) {
  const guards = [];
  const add = (a, b, r, low, high) => { if (finite(a) && finite(b)) guards.push({ a, b, r, low, high }); };
  for (const agent of [...(region.agents ?? []), ...(region.turtleAgents ?? [])]) {
    const r = Math.max(.38, (agent.sizeM ?? .5) * .68 + .18), half = Math.max(.18, (agent.sizeM ?? .5) * .55);
    const points = [];
    for (const [key, value] of Object.entries(agent)) if (/position|home|target|refuge|school|anchor/i.test(key)) pointList(value, points);
    for (const p of points) add(p, p, r, p.y - half - .2, p.y + half);
    for (const [a, b] of [[agent.position, agent.home], [agent.position, agent.target], [agent.home, agent.target]])
      if (finite(a) && finite(b)) add(a, b, r, Math.min(a.y, b.y) - half - .2, Math.max(a.y, b.y) + half);
    for (const key of ['schoolHome', 'patrolHome']) if (finite(agent[key])) {
      const p = agent[key], orbit = Math.max(agent.orbitRadiusM ?? 0, agent.roamingRadiusM ?? 0, agent.roamingSchoolRadiusM ?? 0);
      add(p, p, r + orbit, p.y - half - .3, p.y + half + .3);
    }
    for (const [key, value] of Object.entries(agent)) if (/waypoint|path|route/i.test(key) && Array.isArray(value)) {
      const route = []; pointList(value, route);
      for (let i = 0; i < route.length; i++) {
        const a = route[i], b = route[(i + 1) % route.length];
        const turtle = agent.speciesId === 'green-turtle';
        add(a, b, turtle ? r + .5 : r, turtle ? -Infinity : Math.min(a.y, b.y) - half - .2,
          turtle ? Infinity : Math.max(a.y, b.y) + half);
      }
    }
  }
  for (const [key, value] of Object.entries(region)) if (/food|patch|parcel/i.test(key)) {
    const points = []; pointList(value, points); for (const p of points) add(p, p, .6, p.y - .25, p.y + .5);
  }
  return guards;
}
function plantClear(element, context, guards, nativeRootsOnly = false) {
  const r = radius(element), low = element.y, high = element.y + element.scale.y;
  for (const guard of context.nativeAt(element.x, element.z, r)) {
    const exclusion = nativeRootsOnly && guard.id.startsWith('seagrass:') ? .18 : guard.r;
    if (Math.hypot(element.x - guard.x, element.z - guard.z) < r + exclusion && low <= guard.high && high >= guard.low) return false;
  }
  return !guards.some(g => low <= g.high && high >= g.low && distanceSegment(element.x, element.z, g.a, g.b) < r + g.r);
}
function inside(element, region, margin = 1) {
  const r = radius(element);
  return element.x - r >= region.cx * 64 + margin && element.x + r <= (region.cx + 1) * 64 - margin &&
    element.z - r >= region.cz * 64 + margin && element.z + r <= (region.cz + 1) * 64 - margin &&
    Math.hypot(element.x, element.z) - r > OCEAN_AUTHORED_RADIUS + 1;
}
function largestComponent(cells) {
  const remaining = new Map(cells.map(cell => [`${cell.i},${cell.j}`, cell])); let largest = [];
  while (remaining.size) {
    const first = remaining.values().next().value, queue = [first]; remaining.delete(`${first.i},${first.j}`);
    for (let index = 0; index < queue.length; index++) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${queue[index].i + di},${queue[index].j + dj}`, next = remaining.get(key);
      if (next) { queue.push(next); remaining.delete(key); }
    }
    if (queue.length > largest.length) largest = queue;
  }
  return largest.sort((a, b) => a.j - b.j || a.i - b.i);
}
function massCandidate(generator, region, context, guards, random, index) {
  const cx = region.cx * 64 + 16 + random(`mass:${index}:x`) * 32, cz = region.cz * 64 + 16 + random(`mass:${index}:z`) * 32;
  const state = generator.sample(cx, cz); if (state.depthM < 4 || state.depthM > 35 || Math.hypot(cx, cz) < 56) return null;
  const origin = { x: cx - SIDE * STEP / 2, z: cz - SIDE * STEP / 2 }, heading = random(`mass:${index}:angle`) * TAU;
  const c = Math.cos(heading), s = Math.sin(heading), lobes = Array.from({ length: 4 }, (_, i) => ({
    x: (i - 1.5) * 3.3, z: (random(`mass:${index}:lobe:${i}`) - .5) * 3.4,
    rx: 4 + random(`mass:${index}:rx:${i}`) * 1.2, rz: 3.2 + random(`mass:${index}:rz:${i}`) * 1.8,
  })), cells = [];
  for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
    const x = origin.x + (i + .5) * STEP, z = origin.z + (j + .5) * STEP, dx = x - cx, dz = z - cz;
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    const q = Math.min(...lobes.map(l => ((Math.abs(u - l.x) / l.rx) ** 4 + (Math.abs(v - l.z) / l.rz) ** 4) ** .25));
    if (q > 1) continue;
    const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([ix, iz]) => context.solid(origin.x + ix * STEP, origin.z + iz * STEP));
    if (!corners.every(Number.isFinite)) continue;
    const baseHigh = Math.max(...corners), baseLow = Math.min(...corners);
    let riseM = (q < .35 ? 3.2 : q < .62 ? 2.45 : q < .83 ? 1.65 : .75) + (random(`mass:${index}:${i}:${j}`) - .5) * .24;
    riseM = Math.min(riseM, OCEAN_SURFACE_Y - .7 - baseHigh);
    for (const guard of context.nativeAt(x, z, STEP * .71)) if (Math.hypot(x - guard.x, z - guard.z) < guard.r + STEP * .71 && baseLow <= guard.high)
      riseM = Math.min(riseM, guard.low - .06 - baseHigh);
    for (const guard of guards) if (distanceSegment(x, z, guard.a, guard.b) < guard.r + STEP * .71 && baseLow <= guard.high)
      riseM = Math.min(riseM, guard.low - .06 - baseHigh);
    if (riseM >= .14) cells.push({ i, j, riseM: Math.floor(riseM * 100) / 100 });
  }
  const connected = largestComponent(cells); if (connected.length < 24) return null;
  const spanX = (Math.max(...connected.map(cell => cell.i)) - Math.min(...connected.map(cell => cell.i)) + 1) * STEP;
  const spanZ = (Math.max(...connected.map(cell => cell.j)) - Math.min(...connected.map(cell => cell.j)) + 1) * STEP;
  if (Math.max(spanX, spanZ) < 8) return null;
  const mass = { id: `macro-landscape:${region.id}:mass:${index}`, regionId: region.id, kind: 'reef-mass',
    x: cx, y: generator.floorSurface(cx, cz).height, z: cz, rotation: 0, scale: { x: 20, y: 8, z: 20 },
    grid: { topology: 'continuous-v1', origin, step: STEP, columns: SIDE, rows: SIDE, cells: connected } };
  return { mass, score: connected.length + connected.reduce((sum, cell) => sum + cell.riseM, 0) * .2 };
}
function descriptorStamp(element) {
  if (Object.isFrozen(element) && Object.isFrozen(element.grid) && Object.isFrozen(element.grid?.cells)) return element;
  const grid = element.grid; return `${element.regionId}|${grid.topology ?? 'legacy-prismatic'}|${grid.origin.x},${grid.origin.z}|${grid.step}|${grid.columns},${grid.rows}|` +
    grid.cells.map(cell => `${cell.i},${cell.j},${cell.riseM}`).join(';');
}
function preparedMass(element, generator) {
  let byElement = meshCache.get(generator); if (!byElement) { byElement = new WeakMap(); meshCache.set(generator, byElement); }
  const stamp = descriptorStamp(element), cached = byElement.get(element); if (cached?.stamp === stamp) return cached;
  const [cx, cz] = element.regionId.split(',').map(Number), owner = { x: cx * 64, z: cz * 64 };
  const context = baseContext(generator, { cx, cz }), grid = element.grid, p = [], indices = [], cells = new Map();
  const descriptors = new Map(grid.cells.map(cell => [`${cell.i},${cell.j}`, cell])), vertices = new Map();
  const vertex = (i, j) => {
    const key = `${i},${j}`; if (vertices.has(key)) return vertices.get(key);
    const x = grid.origin.x + i * grid.step, z = grid.origin.z + j * grid.step;
    let rise = Infinity;
    for (const di of [-1, 0]) for (const dj of [-1, 0]) rise = Math.min(rise, descriptors.get(`${i + di},${j + dj}`)?.riseM ?? 0);
    const top = p.length / 3;
    p.push(Math.fround(x - owner.x), Math.fround(context.solid(x, z) + rise), Math.fround(z - owner.z));
    const bottom = p.length / 3;
    p.push(Math.fround(x - owner.x), Math.fround(generator.floorSurface(x, z).height - .05), Math.fround(z - owner.z));
    const pair = { top, bottom }; vertices.set(key, pair); return pair;
  };
  for (const descriptor of grid.cells) {
    const { i, j } = descriptor;
    if (grid.topology === undefined) {
      // The first preview saved plant anchors on independent prisms. An
      // unmarked historic descriptor retains those precise original heights.
      const start = p.length / 3, corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
      const top = corners.map(([ix, iz]) => Math.fround(context.solid(grid.origin.x + ix * grid.step, grid.origin.z + iz * grid.step) + descriptor.riseM));
      for (let layer = 0; layer < 2; layer++) corners.forEach(([ix, iz], k) => {
        const x = grid.origin.x + ix * grid.step, z = grid.origin.z + iz * grid.step;
        p.push(Math.fround(x - owner.x), layer ? Math.fround(generator.floorSurface(x, z).height - .05) : top[k], Math.fround(z - owner.z));
      });
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3,
        start + 4, start + 5, start + 6, start + 5, start + 7, start + 6);
      for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) indices.push(start + a, start + b, start + a + 4, start + a + 4, start + b, start + b + 4);
      cells.set(`${i},${j}`, { x: p[start * 3], z: p[start * 3 + 2], right: p[(start + 1) * 3], far: p[(start + 2) * 3 + 2], top });
      continue;
    }
    const v = [vertex(i, j), vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1)];
    indices.push(v[0].top, v[2].top, v[1].top, v[1].top, v[2].top, v[3].top,
      v[0].bottom, v[1].bottom, v[2].bottom, v[1].bottom, v[3].bottom, v[2].bottom);
    for (const [a, b, di, dj] of [[0, 1, 0, -1], [1, 3, 1, 0], [3, 2, 0, 1], [2, 0, -1, 0]])
      if (!descriptors.has(`${i + di},${j + dj}`)) indices.push(v[a].top, v[b].top, v[a].bottom, v[a].bottom, v[b].top, v[b].bottom);
    cells.set(`${i},${j}`, { x: p[v[0].top * 3], z: p[v[0].top * 3 + 2],
      right: p[v[1].top * 3], far: p[v[2].top * 3 + 2], top: v.map(pair => p[pair.top * 3 + 1]) });
  }
  const result = { stamp, owner, originX: Math.fround(grid.origin.x - owner.x), originZ: Math.fround(grid.origin.z - owner.z),
    step: grid.step, cells, mesh: freeze({ positions: p, indices }) };
  byElement.set(element, result); return result;
}
/** Exact Float32-valued triangles; X/Z are relative to the owning 64m cell,
 * while Y remains absolute world height. Saved descriptors determine the cuts. */
export function macroLandscapeMesh(element, generator) {
  if (element?.kind !== 'reef-mass') throw new TypeError('Only reef masses have owner-relative rigid meshes.');
  return preparedMass(element, generator).mesh;
}
export function macroPlantMesh(kind) {
  if (kind === 'reef-colony') kind = 'coral-branch';
  if (COLONIES.includes(kind)) return habitatSceneMesh(kind);
  if (kind !== 'meadow-shoot') throw new RangeError('Unknown macro plant kind.');
  if (plantCache.has(kind)) return plantCache.get(kind);
  const p = [], indices = [];
  for (let blade = 0; blade < 6; blade++) {
    const angle = blade * 2.3999632297, start = p.length / 3, height = .76 + blade * .048;
    for (let level = 0; level <= 4; level++) {
      const t = level / 4, reach = (.30 + blade * .024) * t ** 3, width = level ? .025 * Math.sin(Math.PI * t) * t + .003 * t : 0;
      for (const side of [-1, 1]) p.push(Math.fround(Math.cos(angle) * reach - Math.sin(angle) * side * width),
        Math.fround(height * t), Math.fround(Math.sin(angle) * reach + Math.cos(angle) * side * width));
      if (level < 4) { const a = start + level * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  // The tallest blade reaches Y=1, and the six narrow crowns fit radius .5.
  const mesh = freeze({ positions: p, indices }); plantCache.set(kind, mesh); return mesh;
}
/** One indexed top-cell lookup, never a scan over all landscape triangles.
 * Plant crowns are swimmer-only; reef mass triangles remain real solids. */
export function macroLandscapeHeight(element, generator, x, z, swimmer = true) {
  if (!element || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (element.kind !== 'reef-mass') return swimmer && ['meadow-shoot', 'reef-colony'].includes(element.kind) &&
    Math.hypot(x - element.x, z - element.z) <= radius(element) + 1e-8 ? element.y + element.scale.y : null;
  const data = preparedMass(element, generator), lx = x - data.owner.x, lz = z - data.owner.z;
  const i = Math.floor((lx - data.originX) / data.step), j = Math.floor((lz - data.originZ) / data.step); let height = null;
  for (const di of [0, -1, 1]) for (const dj of [0, -1, 1]) {
    const cell = data.cells.get(`${i + di},${j + dj}`); if (!cell) continue;
    const tx = (lx - cell.x) / (cell.right - cell.x), tz = (lz - cell.z) / (cell.far - cell.z);
    if (tx < -1e-8 || tx > 1 + 1e-8 || tz < -1e-8 || tz > 1 + 1e-8) continue;
    const [a, b, c, d] = cell.top, value = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz :
      d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    height = height === null ? value : Math.max(height, value);
  }
  return height;
}
function actualSurface(context, masses, generator, x, z) {
  let top = context.solid(x, z); for (const mass of masses) { const y = macroLandscapeHeight(mass, generator, x, z, false); if (y !== null) top = Math.max(top, y); } return top;
}
function plantGeometryValid(element, generator, solid) {
  const mesh = macroPlantMesh(element.kind === 'reef-colony' ? element.colonyKind : element.kind), c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const px = mesh.positions[i] * element.scale.x, pz = mesh.positions[i + 2] * element.scale.z;
    if (element.y + mesh.positions[i + 1] * element.scale.y < solid(element.x + px * c + pz * s, element.z - px * s + pz * c) - 1e-6) return false;
  }
  return true;
}

/** Additive scenery only. Existing sources/organisms are protection inputs,
 * never rewritten or interpreted as newly allocated food or biomass. */
export function createOceanMacroLandscape(generator, region, { seed = generator.seed, surface } = {}) {
  if (!ownerValid(region) || typeof surface !== 'function') throw new TypeError('Macro landscape needs a valid owner and baseline support query.');
  const random = salt => hash(`${typeof seed}:${seed}|ocean-macro-landscape-v1|${region.id}|${salt}`);
  const context = baseContext(generator, region), guards = biologicalGuards(region), masses = [];
  const candidates = Array.from({ length: 20 }, (_, index) => massCandidate(generator, region, context, guards, random, index))
    .filter(Boolean).sort((a, b) => b.score - a.score || a.mass.id.localeCompare(b.mass.id));
  for (const candidate of candidates) {
    if (masses.some(mass => Math.hypot(mass.x - candidate.mass.x, mass.z - candidate.mass.z) < 22)) continue;
    masses.push(freeze(candidate.mass)); if (masses.length === OCEAN_MACRO_LANDSCAPE_LIMITS['reef-mass']) break;
  }
  const elements = [...masses], solid = (x, z) => actualSurface(context, masses, generator, x, z), shoots = [];
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
    const key = `shoot:${i}:${j}`, x = region.cx * 64 + 2 + i * 1.25 + random(`${key}:x`) * .55,
      z = region.cz * 64 + 2 + j * 1.25 + random(`${key}:z`) * .55;
    const state = generator.sample(x, z), cover = generator.coverAt?.(x, z, state);
    if (state.substrate === 'rock' || state.depthM < 3 || state.depthM > 22 || state.seagrassSuitability <= .36 ||
      cover && (cover.seagrass < .12 || cover.sandOpening > .6)) continue;
    const y = generator.floorSurface(x, z).height;
    if (solid(x, z) > y + .02 || surface(x, z) > y + .02) continue;
    const width = .24 + random(`${key}:width`) * .18, element = { id: `macro-landscape:${region.id}:${key}`,
      regionId: region.id, kind: 'meadow-shoot', x, y: y + ROOT_GAP, z, rotation: random(`${key}:rotation`) * TAU,
      scale: { x: width, y: .45 + random(`${key}:height`) * .55, z: width } };
    if (inside(element, region) && plantClear(element, context, guards, true) && plantGeometryValid(element, generator, solid))
      shoots.push({ element, priority: (cover?.seagrass ?? state.seagrassSuitability) + random(`${key}:priority`) * .08 });
  }
  shoots.sort((a, b) => b.priority - a.priority || a.element.id.localeCompare(b.element.id));
  elements.push(...shoots.slice(0, OCEAN_MACRO_LANDSCAPE_LIMITS['meadow-shoot']).map(item => freeze(item.element)));
  const hosts = [...masses, ...context.rocks.filter(rock => Math.floor(rock.x / 64) === region.cx && Math.floor(rock.z / 64) === region.cz)];
  let colonies = 0;
  for (const host of hosts) for (let index = 0; index < (host.kind === 'reef-mass' ? 96 : 12); index++) {
    if (colonies >= OCEAN_MACRO_LANDSCAPE_LIMITS['reef-colony']) break;
    const key = `colony:${host.id}:${index}`, angle = random(`${key}:angle`) * TAU;
    let x, z;
    if (host.kind === 'reef-mass') {
      const cell = host.grid.cells[index % host.grid.cells.length];
      x = host.grid.origin.x + (cell.i + .2 + random(`${key}:x`) * .6) * STEP;
      z = host.grid.origin.z + (cell.j + .2 + random(`${key}:z`) * .6) * STEP;
    } else {
      const r = .12 + random(`${key}:distance`) * .25, lx = Math.cos(angle) * host.scale.x * r, lz = Math.sin(angle) * host.scale.z * r;
      x = host.x + lx * Math.cos(host.rotation) + lz * Math.sin(host.rotation); z = host.z - lx * Math.sin(host.rotation) + lz * Math.cos(host.rotation);
    }
    const state = generator.sample(x, z); if (state.depthM < 3 || state.depthM > 30) continue;
    const colonyKind = state.depthM > 22 ? 'sea-fan' : COLONIES[Math.floor(random(`${key}:kind`) * 3)];
    const y = host.kind === 'reef-mass' ? macroLandscapeHeight(host, generator, x, z, false) : oceanRockHeight(host, x, z);
    if (y === null || Math.abs(solid(x, z) - y) > .01) continue;
    const width = 1.2 + random(`${key}:width`) * 1.2, element = { id: `macro-landscape:${region.id}:${key}`,
      regionId: region.id, kind: 'reef-colony', colonyKind, hostId: host.id, x, y: y + ROOT_GAP, z,
      rotation: random(`${key}:rotation`) * TAU, scale: { x: width, y: .65 + random(`${key}:height`) * .9,
        z: colonyKind === 'sea-fan' ? .3 : width * .86 } };
    if (element.y + element.scale.y >= OCEAN_SURFACE_Y - .4 || !inside(element, region) || !plantClear(element, context, guards) ||
      elements.some(old => old.kind === 'reef-colony' && Math.hypot(old.x - x, old.z - z) < radius(old) + radius(element) + .12) ||
      !plantGeometryValid(element, generator, solid)) continue;
    elements.push(freeze(element)); colonies++;
  }
  return freeze(elements);
}

/** Saved cuts are historical geometry. Moving animals never cause a saved
 * plan to be regenerated or retrospectively rejected at their new positions. */
export function validateOceanMacroLandscapeRecord(record, generator, { surface } = {}) {
  try {
    if (!record || typeof record !== 'object') return false;
    const fields = ['macroLandscapeVersion', 'macroLandscapeInitializedAtSec', 'macroLandscapeElements'];
    if (fields.every(key => record[key] === undefined)) return true;
    if (!ownerValid(record) || ![1, 2].includes(record.macroLandscapeVersion) || !Number.isFinite(record.timeSec) || record.timeSec < 0 ||
      !Number.isFinite(record.macroLandscapeInitializedAtSec) || record.macroLandscapeInitializedAtSec < 0 ||
      record.macroLandscapeInitializedAtSec > record.timeSec || typeof surface !== 'function' ||
      !Array.isArray(record.macroLandscapeElements) || record.macroLandscapeElements.length > OCEAN_MACRO_LANDSCAPE_LIMITS.total) return false;
    const context = baseContext(generator, record), counts = Object.fromEntries(KINDS.map(kind => [kind, 0])), ids = new Set();
    const masses = record.macroLandscapeElements.filter(e => e?.kind === 'reef-mass'), hosts = new Map([...context.rocks, ...masses].map(e => [e.id, e]));
    for (const e of record.macroLandscapeElements) {
      if (!e || !KINDS.includes(e.kind) || !finite(e) || e.regionId !== record.id || typeof e.id !== 'string' ||
        !e.id.startsWith(`macro-landscape:${record.id}:`) || ids.has(e.id) || !Number.isFinite(e.rotation) || e.rotation < 0 || e.rotation >= TAU ||
        !['x', 'y', 'z'].every(axis => Number.isFinite(e.scale?.[axis]) && e.scale[axis] > 0) || !inside(e, record) ||
        ++counts[e.kind] > OCEAN_MACRO_LANDSCAPE_LIMITS[e.kind] || ['food', 'biomass', 'energy', 'oxygen', 'foodStock'].some(key => Object.hasOwn(e, key))) return false;
      ids.add(e.id);
      if (e.kind === 'reef-mass') {
        const g = e.grid;
        if (!g || (g.topology !== undefined && g.topology !== 'continuous-v1') || record.macroLandscapeVersion === 2 && g.topology !== 'continuous-v1' ||
          g.step !== STEP || g.columns !== SIDE || g.rows !== SIDE || !Number.isFinite(g.origin?.x) || !Number.isFinite(g.origin?.z) ||
          e.rotation !== 0 || e.scale.x !== 20 || e.scale.z !== 20 || e.scale.y !== 8 || e.x !== g.origin.x + 10 || e.z !== g.origin.z + 10 ||
          Math.abs(e.y - generator.floorSurface(e.x, e.z).height) > 1e-8 || !Array.isArray(g.cells) || g.cells.length < 24 || g.cells.length > 256) return false;
        const keys = new Set();
        for (const cell of g.cells) {
          const key = `${cell.i},${cell.j}`;
          if (!Number.isInteger(cell.i) || !Number.isInteger(cell.j) || cell.i < 0 || cell.j < 0 || cell.i >= SIDE || cell.j >= SIDE ||
            keys.has(key) || !Number.isFinite(cell.riseM) || cell.riseM < .14 || cell.riseM > 3.4) return false;
          keys.add(key);
          const x = g.origin.x + (cell.i + .5) * STEP, z = g.origin.z + (cell.j + .5) * STEP;
          const tops = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => context.solid(g.origin.x + (cell.i + dx) * STEP,
            g.origin.z + (cell.j + dz) * STEP) + cell.riseM);
          if (Math.max(...tops) >= OCEAN_SURFACE_Y - .69) return false;
          for (const guard of context.nativeAt(x, z, STEP * .71)) if (Math.hypot(x - guard.x, z - guard.z) < guard.r + STEP * .71 &&
            Math.max(...tops) > guard.low - .05 && Math.min(...tops) <= guard.high) return false;
        }
        if (largestComponent(g.cells).length !== g.cells.length) return false;
        const spanX = (Math.max(...g.cells.map(c => c.i)) - Math.min(...g.cells.map(c => c.i)) + 1) * STEP;
        const spanZ = (Math.max(...g.cells.map(c => c.j)) - Math.min(...g.cells.map(c => c.j)) + 1) * STEP;
        if (Math.max(spanX, spanZ) < 8) return false;
      }
    }
    // Restore inputs are mutable plain JSON. Freeze a private descriptor copy,
    // preserving caller records and avoiding O(cells) stamps at each leaf point.
    const stableMasses = masses.map(mass => freeze({ id: mass.id, regionId: mass.regionId, kind: mass.kind,
      x: mass.x, y: mass.y, z: mass.z, rotation: mass.rotation, scale: { ...mass.scale },
      grid: { ...mass.grid, origin: { ...mass.grid.origin }, cells: mass.grid.cells.map(cell => ({ ...cell })) } }));
    const stableHosts = new Map([...context.rocks, ...stableMasses].map(e => [e.id, e]));
    const solid = (x, z) => actualSurface(context, stableMasses, generator, x, z);
    for (const e of record.macroLandscapeElements) if (e.kind !== 'reef-mass') {
      const state = generator.sample(e.x, e.z);
      if (e.kind === 'meadow-shoot') {
        const floor = generator.floorSurface(e.x, e.z).height, cover = generator.coverAt?.(e.x, e.z, state);
        if (state.substrate === 'rock' || state.seagrassSuitability <= .36 || state.depthM < 3 || state.depthM > 22 ||
          e.scale.x < .24 || e.scale.x > .42 || e.scale.z !== e.scale.x || e.scale.y < .45 || e.scale.y > 1 ||
          Math.abs(e.y - floor - ROOT_GAP) > 1e-8 || solid(e.x, e.z) > floor + .02 || surface(e.x, e.z) > floor + .02 ||
          cover && (cover.seagrass < .12 || cover.sandOpening > .6) || !plantClear(e, context, [], true)) return false;
      } else {
        const host = stableHosts.get(e.hostId);
        if (!host || !COLONIES.includes(e.colonyKind) || state.depthM < 3 || state.depthM > 30 || state.depthM > 22 && e.colonyKind !== 'sea-fan' ||
          e.scale.x < 1.2 || e.scale.x > 2.4 || e.scale.y < .65 || e.scale.y > 1.55 ||
          e.scale.z !== (e.colonyKind === 'sea-fan' ? .3 : e.scale.x * .86) || e.y + e.scale.y >= OCEAN_SURFACE_Y - .4 ||
          !plantClear(e, context, [])) return false;
        const root = host.kind === 'reef-mass' ? macroLandscapeHeight(host, generator, e.x, e.z, false) : oceanRockHeight(host, e.x, e.z);
        if (root === null || Math.abs(e.y - root - ROOT_GAP) > 1e-8 || Math.abs(solid(e.x, e.z) - root) > .01) return false;
      }
      if (!plantGeometryValid(e, generator, solid)) return false;
    }
    return true;
  } catch { return false; }
}

/** Pure once-only migration plan for the early preview topology. Callers commit
 * all three fields before activation; original biological records stay exact. */
export function upgradeOceanMacroLandscape(record, generator, { surface } = {}) {
  if (record?.macroLandscapeVersion !== 1 || !validateOceanMacroLandscapeRecord(record, generator, { surface })) return null;
  const elements = createOceanMacroLandscape(generator, record, { seed: generator.seed, surface });
  const fields = { macroLandscapeVersion: OCEAN_MACRO_LANDSCAPE_VERSION,
    macroLandscapeInitializedAtSec: record.macroLandscapeInitializedAtSec, macroLandscapeElements: elements };
  return validateOceanMacroLandscapeRecord({ ...record, ...fields }, generator, { surface }) ? freeze(fields) : null;
}
