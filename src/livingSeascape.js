import { livingSeabedFloorSurface, sampleLivingSeabedRelief } from './livingSeabedRelief.js';

const SIZE = 128, GRID = 129, GUARD = 16, OWNER = 64, CACHE_LIMIT = 8;
const models = new WeakMap();
const stamp = value => JSON.stringify(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
function random(seed, salt) {
  let h = 2166136261;
  for (const ch of `${seed}|connected-seascape-v4|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(baseGenerator, cx, cz) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 2 || cz % 2)
    throw new TypeError('A seascape starts at even living-shallows owner coordinates.');
  const chunks = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => base.chunk(cx + dx, cz + dz));
  return { base, chunks, origin: { x: cx * OWNER, z: cz * OWNER } };
}
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function envelope(x, peak) {
  if (x <= GUARD || x >= SIZE - GUARD) return 0;
  return Math.cos(Math.PI * .5 * Math.abs(x - peak) / (x <= peak ? peak - GUARD : SIZE - GUARD - peak)) ** 2;
}
function footprintIndex(base, cx, cz, origin) {
  const bins = new Map();
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) for (const e of base.chunk(cx + dx, cz + dz).elements) {
    if (!['rock', 'coral', 'algae', 'seagrass', 'driftwood', 'bottle'].includes(e.kind)) continue;
    const radius = Math.hypot(e.scale.x, e.scale.z) * .5 + 1.5, reach = radius + 12;
    if (e.x + reach < origin.x + GUARD || e.x - reach > origin.x + SIZE - GUARD ||
      e.z + reach < origin.z + GUARD || e.z - reach > origin.z + SIZE - GUARD) continue;
    const circle = { x: e.x, z: e.z, radius };
    for (let iz = Math.floor((e.z - reach) / 16); iz <= Math.floor((e.z + reach) / 16); iz++)
      for (let ix = Math.floor((e.x - reach) / 16); ix <= Math.floor((e.x + reach) / 16); ix++) {
        const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(circle);
      }
  }
  return (x, z) => {
    let result = 1;
    for (const p of bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      result = Math.min(result, smooth((Math.hypot(x - p.x, z - p.z) - p.radius) / 12));
      if (!result) break;
    }
    return result;
  };
}
function maximumAmplitude(baseline, unit, requested) {
  let maximum = requested; const permitted = .64999 ** 2;
  for (let iz = 0; iz < SIZE; iz++) for (let ix = 0; ix < SIZE; ix++) {
    const a = iz * GRID + ix, b = a + 1, c = a + GRID, d = c + 1;
    for (const [i, j, k] of [[a, b, c], [d, c, b]]) {
      const bx = baseline[j] - baseline[i], bz = baseline[k] - baseline[i], ux = unit[j] - unit[i], uz = unit[k] - unit[i];
      const bb = bx * bx + bz * bz, uu = ux * ux + uz * uz, dot = bx * ux + bz * uz;
      if (bb > permitted) return 0;
      if (uu > 1e-16) maximum = Math.min(maximum, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu);
    }
  }
  return Math.max(0, maximum);
}
function metrics(heights, baseline, origin, width = SIZE, row = GRID) {
  let deltaMinM = Infinity, deltaMaxM = -Infinity, maxSlope = 0, mostDisplaced = null, minDepthM = Infinity;
  for (let i = 0; i < heights.length; i++) {
    const deltaM = heights[i] - baseline[i]; deltaMinM = Math.min(deltaMinM, deltaM); deltaMaxM = Math.max(deltaMaxM, deltaM);
    minDepthM = Math.min(minDepthM, 8 - heights[i]);
    if (!mostDisplaced || Math.abs(deltaM) > Math.abs(mostDisplaced.deltaM))
      mostDisplaced = { x: origin.x + i % row, z: origin.z + Math.floor(i / row), deltaM };
  }
  for (let iz = 0; iz < width; iz++) for (let ix = 0; ix < width; ix++) {
    const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
    maxSlope = Math.max(maxSlope, Math.hypot(heights[b] - heights[a], heights[c] - heights[a]),
      Math.hypot(heights[d] - heights[c], heights[d] - heights[b]));
  }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, maxSlope, minDepthM, mostDisplaced };
}
function seamRuns(heights, baseline, origin) {
  const output = [];
  for (const axis of ['x', 'z']) {
    let start = null, sign = 0, best = null;
    const finish = end => {
      if (start !== null && (!best || end - start > best.lengthM)) best = { axis, startM: start, endM: end, lengthM: end - start, sign,
        center: axis === 'x' ? { x: origin.x + 64, z: origin.z + (start + end) * .5 } : { x: origin.x + (start + end) * .5, z: origin.z + 64 } };
      start = null; sign = 0;
    };
    for (let t = GUARD; t <= SIZE - GUARD; t++) {
      const i = axis === 'x' ? t * GRID + 64 : 64 * GRID + t;
      const deltas = [heights[i] - baseline[i]];
      const currentSign = deltas.every(d => d >= 1) ? 1 : deltas.every(d => d <= -1) ? -1 : 0;
      if (!currentSign || currentSign !== sign) { finish(t - 1); if (currentSign) { start = t; sign = currentSign; } }
    }
    finish(SIZE - GUARD); if (best) output.push(best);
  }
  return output;
}
function habitatSummary(base, plan) {
  const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 }; let minDepthM = Infinity, maxDepthM = -Infinity;
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const s = sampleLivingSeabedRelief(base, plan, plan.cx * OWNER + 4 + ix * 8, plan.cz * OWNER + 4 + iz * 8);
    habitats[s.habitat]++; minDepthM = Math.min(minDepthM, s.depthM); maxDepthM = Math.max(maxDepthM, s.depthM);
  }
  const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
  return { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
}
function model(baseGenerator, cx, cz) {
  const { base, chunks, origin } = source(baseGenerator, cx, cz);
  let entries = models.get(base); if (!entries) { entries = new Map(); models.set(base, entries); }
  const key = `${cx},${cz}`, cached = entries.get(key); if (cached) { entries.delete(key); entries.set(key, cached); return cached; }
  const maskAt = footprintIndex(base, cx, cz, origin), baseline = [], field = [], masks = [];
  const phaseA = random(base.seed, 'broad-phase-a') * Math.PI * 2, phaseB = random(base.seed, 'broad-phase-b') * Math.PI * 2;
  for (let iz = 0; iz < GRID; iz++) for (let ix = 0; ix < GRID; ix++) {
    const x = origin.x + ix, z = origin.z + iz;
    baseline.push(base.floorVertex(x, z)); masks.push(maskAt(x, z));
    field.push(.85 * Math.sin((x * .82 + z * .58) / 160 + phaseA) + .15 * Math.cos((-x * .58 + z * .82) / 235 + phaseB));
  }
  let chosen = null, rejectedBest = null;
  for (const pz of [48, 64, 80]) for (const px of [48, 64, 80]) {
    const unit = field.map((f, i) => f * masks[i] * envelope(i % GRID, px) * envelope(Math.floor(i / GRID), pz));
    const amplitudeM = maximumAmplitude(baseline, unit, 8), heights = baseline.map((y, i) => Math.fround(y + unit[i] * amplitudeM));
    const measured = metrics(heights, baseline, origin), seams = seamRuns(heights, baseline, origin);
    const longest = Math.max(0, ...seams.map(s => s.lengthM));
    if (!rejectedBest || longest + measured.deltaSpanM > rejectedBest.longest + rejectedBest.deltaSpanM)
      rejectedBest = { longest, deltaSpanM: measured.deltaSpanM };
    if (measured.deltaSpanM < 2.3 || measured.maxSlope > .65 || measured.minDepthM < 3 || longest < 12) continue;
    const score = longest + measured.deltaSpanM;
    if (!chosen || score > chosen.score) chosen = { heights, measured, seams, score, controls: { peakLocal: { x: px, z: pz }, amplitudeM, protectionRampM: 12, worldFieldM: [160, 235] } };
  }
  if (!chosen) throw new RangeError(`Group ${key} has no complete continuous seascape around its unchanged native hosts (delta ${rejectedBest.deltaSpanM.toFixed(3)}m, seam ${rejectedBest.longest}m).`);
  const nativeHabitatKinds = [...new Set(chunks.flatMap(c => {
    const kinds = []; if (c.counts.rock) kinds.push('reef'); if (c.counts.seagrass) kinds.push('seagrass');
    if (c.habitatComposition.habitats.sand) kinds.push('sand'); if (c.habitatComposition.habitats.slope) kinds.push('slope'); return kinds;
  }))];
  const group = { id: `connected-seascape:${key}`, cx, cz, ownerIds: chunks.map(c => c.id), widthM: SIZE, outerGuardM: GUARD,
    gridSize: GRID, fieldScaleM: 160, nativeHabitatKinds, ...chosen.measured,
    longestInternalSeamM: Math.max(...chosen.seams.map(s => s.lengthM)), seams: chosen.seams, controls: chosen.controls };
  const plans = chunks.map(chunk => {
    const offsetX = chunk.cx - cx, offsetZ = chunk.cz - cz, heights = [], oldHeights = [];
    for (let iz = 0; iz <= OWNER; iz++) for (let ix = 0; ix <= OWNER; ix++) {
      const i = (offsetZ * OWNER + iz) * GRID + offsetX * OWNER + ix; heights.push(chosen.heights[i]); oldHeights.push(baseline[i]);
    }
    const local = metrics(heights, oldHeights, chunk.origin, OWNER, 65);
    const plan = { version: 4, id: chunk.id, cx: chunk.cx, cz: chunk.cz, seed: base.seed, theme: 'connected-seascape', baseStamp: stamp(chunk), group,
      floorPatch: { gridSize: 65, spacingM: 1, widthM: OWNER, boundaryGuardM: 0, groupOuterGuardM: GUARD, coreSpanM: 96, heights, ...local },
      overview: { center: { x: local.mostDisplaced.x, z: local.mostDisplaced.z }, heading: 0, extentM: SIZE },
      retainedRockIds: chunk.elements.filter(e => e.kind === 'rock').map(e => e.id), newRockIds: [], ridgeIds: [], elements: [],
      displayScope: 'four atomically born owners share real terrain; unchanged native hosts and separately initialized ecological inventories' };
    plan.elements = chunk.elements.map(e => e.kind === 'rubble' ? { ...e, y: livingSeabedFloorSurface(base, plan, e.x, e.z).height } : e);
    plan.habitatComposition = habitatSummary(base, plan); return plan;
  });
  const result = freeze({ plans }); entries.set(key, result); if (entries.size > CACHE_LIMIT) entries.delete(entries.keys().next().value); return result;
}

/** The arguments are even OWNER origins. All four saved records must be truly
 * absent before the caller atomically commits this complete group. */
export function createLivingSeascapePlans(baseGenerator, evenCx, evenCz) {
  return model(baseGenerator, evenCx, evenCz).plans;
}

/** Independent deterministic group reconstruction is bounded and cached;
 * validation never recursively calls the public plan factory. */
export function validateLivingSeascapePlan(plan, baseGenerator) {
  try {
    if (!plan || plan.version !== 4 || plan.theme !== 'connected-seascape' || !plan.group || !Array.isArray(plan.floorPatch?.heights) ||
      !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz) || plan.id !== `${plan.cx},${plan.cz}`) return false;
    const expected = model(baseGenerator, plan.group.cx, plan.group.cz).plans.find(p => p.id === plan.id);
    return !!expected && stamp(plan) === stamp(expected);
  } catch { return false; }
}
