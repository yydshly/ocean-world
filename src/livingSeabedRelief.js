const SIZE = 64, GRID = 65, GUARD = 16, LIMIT = 25, SLOPE_LIMIT = .65;
const THEMES = ['shelf-rise', 'sand-basin'];
const cache = new WeakMap();
const stamp = value => JSON.stringify(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
function random(seed, x, z, salt) {
  let h = 2166136261;
  for (const ch of `${seed}|living-seabed-v3|${x},${z}|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(baseGenerator, cx, cz) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz))
    throw new TypeError('Seabed relief requires living shallows and integer owner coordinates.');
  return { base, chunk: base.chunk(cx, cz) };
}
function themeField(base, x, z) {
  const phase = random(base.seed, 0, 0, 'broad-relief-phase') * Math.PI * 2;
  return Math.sin((x * .73 + z * .68) / 180 + phase);
}
function admissible(base, chunk) {
  if (chunk.counts.seagrass > 64 || chunk.counts.rock > 8) return false;
  let sediment = 0;
  for (const dz of [-16, 0, 16]) for (const dx of [-16, 0, 16]) {
    const s = base.sample(chunk.origin.x + 32 + dx, chunk.origin.z + 32 + dz);
    if (s.depthM < 7 || s.depthM > 18) return false;
    if (s.substrate !== 'rock') sediment++;
  }
  return sediment >= 4;
}

/** Selection is a broad seeded world field over physically suitable owners,
 * not a forced landmark or a change to saved regions. Full feasibility is
 * checked by the finite relief planner and may still decline with RangeError. */
export function selectLivingSeabedReliefTheme(baseGenerator, cx, cz) {
  const { base, chunk } = source(baseGenerator, cx, cz);
  if (!admissible(base, chunk)) return null;
  return themeField(base, chunk.origin.x + 32, chunk.origin.z + 32) >= 0 ? 'shelf-rise' : 'sand-basin';
}
function protectedFootprints(base, chunk) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const e of base.chunk(chunk.cx + dx, chunk.cz + dz).elements) {
      if (!['rock', 'coral', 'algae', 'seagrass', 'bottle', 'driftwood'].includes(e.kind)) continue;
      // The full rectangle's half diagonal bounds the existing yawed mesh.
      // sqrt(2) plus rounding room also locks every vertex of triangles under
      // the complete footprint, rather than preserving only a single root.
      const radius = Math.hypot(e.scale.x, e.scale.z) * .5 + 1.5, reach = radius + 12;
      if (e.x + reach < chunk.origin.x + GUARD || e.x - reach > chunk.origin.x + SIZE - GUARD ||
        e.z + reach < chunk.origin.z + GUARD || e.z - reach > chunk.origin.z + SIZE - GUARD) continue;
      rows.push({ x: e.x, z: e.z, radius });
    }
  }
  return rows;
}
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function axisProfile(x, peak) {
  if (x <= GUARD || x >= SIZE - GUARD) return 0;
  const width = x <= peak ? peak - GUARD : SIZE - GUARD - peak;
  return Math.cos(Math.PI * .5 * Math.abs(x - peak) / width) ** 2;
}
function gradientLimits(baseline, unit, requested) {
  let amplitude = requested;
  const permitted = .64999 ** 2;
  for (let iz = 0; iz < SIZE; iz++) for (let ix = 0; ix < SIZE; ix++) {
    const a = iz * GRID + ix, b = a + 1, c = a + GRID, d = c + 1;
    for (const [i, j, k] of [[a, b, c], [d, c, b]]) {
      const bx = baseline[j] - baseline[i], bz = baseline[k] - baseline[i];
      const ux = unit[j] - unit[i], uz = unit[k] - unit[i], bb = bx * bx + bz * bz, uu = ux * ux + uz * uz;
      if (bb > permitted) return 0;
      if (uu > 1e-16) {
        const dot = bx * ux + bz * uz;
        amplitude = Math.min(amplitude, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu);
      }
    }
  }
  return Math.max(0, amplitude);
}
function measurements(heights, baseline, origin) {
  let deltaMinM = Infinity, deltaMaxM = -Infinity, maxSlope = 0, mostDisplaced = null;
  for (let i = 0; i < heights.length; i++) {
    const delta = heights[i] - baseline[i];
    deltaMinM = Math.min(deltaMinM, delta); deltaMaxM = Math.max(deltaMaxM, delta);
    if (!mostDisplaced || Math.abs(delta) > Math.abs(mostDisplaced.deltaM))
      mostDisplaced = { x: origin.x + i % GRID, z: origin.z + Math.floor(i / GRID), deltaM: delta };
  }
  for (let iz = 0; iz < SIZE; iz++) for (let ix = 0; ix < SIZE; ix++) {
    const a = iz * GRID + ix, b = a + 1, c = a + GRID, d = c + 1;
    maxSlope = Math.max(maxSlope, Math.hypot(heights[b] - heights[a], heights[c] - heights[a]),
      Math.hypot(heights[d] - heights[c], heights[d] - heights[b]));
  }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, maxSlope, mostDisplaced };
}
function model(base, chunk, theme) {
  let entries = cache.get(base); if (!entries) { entries = new Map(); cache.set(base, entries); }
  const key = `${chunk.id}:${theme}`, previous = entries.get(key);
  if (previous) { entries.delete(key); entries.set(key, previous); return previous; }
  const footprints = protectedFootprints(base, chunk), baseline = [], masks = [], sign = theme === 'shelf-rise' ? 1 : -1;
  for (let iz = 0; iz < GRID; iz++) for (let ix = 0; ix < GRID; ix++) {
    const x = chunk.origin.x + ix, z = chunk.origin.z + iz;
    baseline.push(base.floorVertex(x, z));
    let mask = 1;
    for (const p of footprints) {
      mask = Math.min(mask, smooth((Math.hypot(x - p.x, z - p.z) - p.radius) / 12));
      if (!mask) break;
    }
    masks.push(mask);
  }
  const requested = 4 + random(base.seed, chunk.cx, chunk.cz, 'amplitude'); let chosen = null;
  // A finite nine-site plan finds usable bed between unchanged whole hosts.
  // These are bathymetry candidates, never camera or single-object edits.
  for (const pz of [24, 32, 40]) for (const px of [24, 32, 40]) {
    const unit = masks.map((mask, i) => sign * mask * axisProfile(i % GRID, px) * axisProfile(Math.floor(i / GRID), pz));
    const amplitudeM = gradientLimits(baseline, unit, requested);
    const heights = baseline.map((y, i) => Math.fround(y + unit[i] * amplitudeM));
    const metrics = measurements(heights, baseline, chunk.origin);
    if (base.sample(metrics.mostDisplaced.x, metrics.mostDisplaced.z).substrate === 'rock') continue;
    if (!chosen || metrics.deltaSpanM > chosen.metrics.deltaSpanM)
      chosen = { heights, metrics, controls: { peakLocal: { x: px, z: pz }, amplitudeM, requestedAmplitudeM: requested, protectionRampM: 12 } };
  }
  if (!chosen || chosen.metrics.deltaSpanM < 2.3 || chosen.metrics.maxSlope > SLOPE_LIMIT)
    throw new RangeError(`Owner ${chunk.id} cannot support a whole, gentle seabed relief around its unchanged hosts.`);
  const result = freeze({ ...chosen, baseStamp: stamp(chunk) }); entries.set(key, result);
  if (entries.size > LIMIT) entries.delete(entries.keys().next().value);
  return result;
}
function owns(plan, x, z, inclusive = false) {
  return x >= plan.cx * SIZE && z >= plan.cz * SIZE && (inclusive ? x <= (plan.cx + 1) * SIZE && z <= (plan.cz + 1) * SIZE :
    x < (plan.cx + 1) * SIZE && z < (plan.cz + 1) * SIZE);
}
function assertPoint(x, z) { if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Ocean coordinates must be finite metres.'); }
function vertex(base, plan, x, z) {
  if (!owns(plan, x, z, true)) return base.floorVertex(x, z);
  return plan.floorPatch.heights[(z - plan.cz * SIZE) * GRID + x - plan.cx * SIZE];
}

export function livingSeabedFloorVertex(baseGenerator, plan, x, z) {
  assertPoint(x, z); const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (!plan || !owns(plan, x, z, true)) return base.floorVertex(x, z);
  if (!Number.isInteger(x) || !Number.isInteger(z)) return livingSeabedFloorSurface(base, plan, x, z).height;
  return vertex(base, plan, x, z);
}

/** The unchanged one-metre diagonal and the actual persisted Float32 vertices
 * are used by terrain, normals, physical support and all fresh ecology. */
export function livingSeabedFloorSurface(baseGenerator, plan, x, z) {
  assertPoint(x, z); const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (!plan || !owns(plan, x, z)) return base.floorSurface(x, z);
  const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
  const a = vertex(base, plan, ix, iz), b = vertex(base, plan, ix + 1, iz), c = vertex(base, plan, ix, iz + 1), d = vertex(base, plan, ix + 1, iz + 1);
  const lower = tx + tz <= 1, dx = lower ? b - a : d - c, dz = lower ? c - a : d - b, length = Math.hypot(dx, 1, dz);
  return { height: lower ? a + dx * tx + dz * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
    normal: { x: -dx / length, y: 1 / length, z: -dz / length }, elementId: null };
}

export function sampleLivingSeabedRelief(baseGenerator, plan, x, z) {
  assertPoint(x, z); const base = baseGenerator.baseGenerator ?? baseGenerator, original = base.sample(x, z);
  if (!plan || !owns(plan, x, z)) return original;
  const ix = Math.floor(x), iz = Math.floor(z);
  if ([[ix, iz], [ix + 1, iz], [ix, iz + 1], [ix + 1, iz + 1]].every(([vx, vz]) => vertex(base, plan, vx, vz) === base.floorVertex(vx, vz)))
    return original; // old exact sample/normal behavior in the protected band
  const surface = livingSeabedFloorSurface(base, plan, x, z), depthM = base.surfaceY - surface.height;
  const habitat = depthM > 18.5 ? 'slope' : original.rockiness > .52 ? 'reef' : original.seagrassSuitability > .40 ? 'seagrass' : 'sand';
  return { ...original, floorY: surface.height, depthM, habitat,
    bedSlope: Math.hypot(surface.normal.x, surface.normal.z) / surface.normal.y };
}

function habitatSummary(base, chunk, plan) {
  const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 };
  let minDepthM = Infinity, maxDepthM = -Infinity;
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const state = sampleLivingSeabedRelief(base, plan, chunk.origin.x + 4 + ix * 8, chunk.origin.z + 4 + iz * 8);
    habitats[state.habitat]++; minDepthM = Math.min(minDepthM, state.depthM); maxDepthM = Math.max(maxDepthM, state.depthM);
  }
  const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
  return { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
}

/** No flora, host, species or food stock is added. The existing rubble alone
 * is grounded to the new triangles; every other native descriptor stays exact. */
export function createLivingSeabedRelief(baseGenerator, cx, cz, { theme = selectLivingSeabedReliefTheme(baseGenerator, cx, cz) } = {}) {
  const { base, chunk } = source(baseGenerator, cx, cz);
  if (!THEMES.includes(theme) || !admissible(base, chunk)) throw new RangeError(`Owner ${chunk.id} has no admitted seabed-relief theme.`);
  const shape = model(base, chunk, theme);
  const plan = { version: 3, id: chunk.id, cx, cz, seed: base.seed, theme, baseStamp: shape.baseStamp,
    floorPatch: { gridSize: GRID, spacingM: 1, widthM: SIZE, boundaryGuardM: GUARD, coreSpanM: 32,
      heights: shape.heights, controls: shape.controls, ...shape.metrics },
    overview: { center: { x: shape.metrics.mostDisplaced.x, z: shape.metrics.mostDisplaced.z }, heading: 0, extentM: 64 },
    retainedRockIds: chunk.elements.filter(e => e.kind === 'rock').map(e => e.id), newRockIds: [], ridgeIds: [],
    elements: [], displayScope: 'one real bed and unchanged native hosts; ecological stocks are initialized separately' };
  plan.elements = chunk.elements.map(e => e.kind === 'rubble' ? { ...e, y: livingSeabedFloorSurface(base, plan, e.x, e.z).height } : e);
  plan.habitatComposition = habitatSummary(base, chunk, plan);
  if (!validateLivingSeabedRelief(plan, base)) throw new RangeError(`Owner ${chunk.id} has no physically admissible seabed-relief plan.`);
  return freeze(plan);
}

/** Validation compares the independent finite height model, never calls the
 * public plan factory, and rejects edited saved grids or native anchors. */
export function validateLivingSeabedRelief(plan, baseGenerator) {
  try {
    if (!plan || plan.version !== 3 || !THEMES.includes(plan.theme) || !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz)) return false;
    const { base, chunk } = source(baseGenerator, plan.cx, plan.cz);
    if (plan.id !== chunk.id || plan.seed !== base.seed || plan.baseStamp !== stamp(chunk) || !admissible(base, chunk) ||
      !plan.floorPatch || plan.floorPatch.gridSize !== GRID || plan.floorPatch.spacingM !== 1 || plan.floorPatch.widthM !== SIZE ||
      plan.floorPatch.boundaryGuardM !== GUARD || plan.floorPatch.coreSpanM !== 32 || !Array.isArray(plan.floorPatch.heights) ||
      plan.floorPatch.heights.length !== GRID * GRID || plan.floorPatch.heights.some(y => !Number.isFinite(y) || Math.fround(y) !== y) ||
      !Array.isArray(plan.elements) || plan.elements.length !== chunk.elements.length ||
      stamp(plan.newRockIds) !== '[]' || stamp(plan.ridgeIds) !== '[]') return false;
    const expected = model(base, chunk, plan.theme);
    if (plan.floorPatch.heights.some((y, i) => y !== expected.heights[i]) || stamp(plan.floorPatch.controls) !== stamp(expected.controls) ||
      ['deltaMinM', 'deltaMaxM', 'deltaSpanM', 'maxSlope'].some(k => plan.floorPatch[k] !== expected.metrics[k]) ||
      stamp(plan.floorPatch.mostDisplaced) !== stamp(expected.metrics.mostDisplaced) ||
      plan.floorPatch.deltaSpanM < 2.3 || plan.floorPatch.maxSlope > SLOPE_LIMIT ||
      stamp(plan.overview) !== stamp({ center: { x: expected.metrics.mostDisplaced.x, z: expected.metrics.mostDisplaced.z }, heading: 0, extentM: 64 }) ||
      stamp(plan.habitatComposition) !== stamp(habitatSummary(base, chunk, plan)) ||
      stamp(plan.retainedRockIds) !== stamp(chunk.elements.filter(e => e.kind === 'rock').map(e => e.id))) return false;
    const ids = new Set();
    for (let i = 0; i < chunk.elements.length; i++) {
      const e = plan.elements[i], old = chunk.elements[i]; if (!e || ids.has(e.id)) return false; ids.add(e.id);
      const expectedElement = old.kind === 'rubble' ? { ...old, y: livingSeabedFloorSurface(base, plan, old.x, old.z).height } : old;
      if (stamp(e) !== stamp(expectedElement)) return false;
    }
    return true;
  } catch { return false; }
}
