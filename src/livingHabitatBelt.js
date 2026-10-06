import { createLivingHabitatMosaic, selectLivingHabitatMosaicTheme } from './livingHabitatMosaic.js';
import { oceanRockHeight } from './oceanRockShape.js';
import { sceneElementHeight } from './oceanSceneElements.js';

const OWNER = 64, GUARD = 6, CACHE_LIMIT = 32, TAU = Math.PI * 2;
const models = new WeakMap(), sampleIndices = new WeakMap();
const stamp = value => JSON.stringify(value);
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
function random(seed, salt) {
  let h = 2166136261;
  for (const ch of `${seed}|living-habitat-belt-v5|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(generator, cx, cz) {
  const base = generator.baseGenerator ?? generator;
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 2 || cz % 2)
    throw new TypeError('A habitat belt starts at even living-shallows owner coordinates.');
  return { base, chunks: [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => base.chunk(cx + dx, cz + dz)) };
}
const count = (rows, kind) => rows.filter(e => e.kind === kind).length;
function candidateRows(base, chunks, components) {
  const ids = new Set(chunks.map(c => c.id)), rows = components.flatMap((plan, i) => plan?.elements ?? chunks[i].elements);
  const gx = chunks[0].cx, gz = chunks[0].cz;
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) {
    const chunk = base.chunk(gx + dx, gz + dz); if (!ids.has(chunk.id)) rows.push(...chunk.elements);
  }
  return rows;
}
function sandPoint(base, rows, x, z, radius = .6) {
  const environment = base.sample(x, z), floor = base.floorSurface(x, z).height;
  if (environment.substrate === 'rock' || environment.depthM < 3 || environment.depthM > 22) return false;
  for (const e of rows) {
    const reach = Math.hypot(e.scale.x, e.scale.z) * .5 + radius + .2;
    if (Math.hypot(x - e.x, z - e.z) > reach) continue;
    if (e.kind === 'seagrass' && Math.hypot(x - e.x, z - e.z) < Math.max(e.scale.x, e.scale.z) * .5 + radius + .2) return false;
    if (e.kind === 'coral' && Math.hypot(x - e.x, z - e.z) < reach) return false;
    for (let i = 0; i < 9; i++) {
      const px = x + (i ? Math.cos((i - 1) * TAU / 8) * radius : 0);
      const pz = z + (i ? Math.sin((i - 1) * TAU / 8) * radius : 0);
      const y = e.kind === 'rock' ? oceanRockHeight(e, px, pz) :
        ['driftwood', 'bottle'].includes(e.kind) ? sceneElementHeight(e, px, pz, true) : null;
      if (y !== null && y > base.floorSurface(px, pz).height + .035) return false;
    }
  }
  return Number.isFinite(floor);
}
function sandCorridor(base, chunk, rows) {
  // A bounded survey of an existing sediment opening. No grass/rock is moved
  // to manufacture a passage. Each point checks a finite nine-point body
  // envelope; this is a conservative support survey, not analytic collision.
  for (const lengthM of [28, 24, 20]) for (const heading of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4])
    for (const dz of [0, -10, 10, -18, 18]) for (const dx of [0, -10, 10, -18, 18]) {
      const center = { x: chunk.origin.x + 32 + dx, z: chunk.origin.z + 32 + dz }, samples = [];
      const c = Math.cos(heading), s = Math.sin(heading); let clear = true;
      for (let along = -lengthM / 2; along <= lengthM / 2 && clear; along += 2) for (const across of [-2, 0, 2]) {
        const x = center.x + along * c + across * s, z = center.z - along * s + across * c;
        if (x < chunk.bounds.minX + GUARD + .6 || x > chunk.bounds.maxX - GUARD - .6 ||
          z < chunk.bounds.minZ + GUARD + .6 || z > chunk.bounds.maxZ - GUARD - .6 || !sandPoint(base, rows, x, z)) { clear = false; break; }
        samples.push({ x, z, y: base.floorSurface(x, z).height });
      }
      if (clear) return { ownerId: chunk.id, center, heading, lengthM, openingM: 4, bodyRadiusM: .6,
        spacingM: 2, clearSamples: samples.length, samples, floorUnchanged: true };
    }
  return null;
}
function nativePlan(base, chunk) {
  return { id: chunk.id, cx: chunk.cx, cz: chunk.cz, seed: base.seed, baseStamp: stamp(chunk),
    elements: chunk.elements, retainedRockIds: chunk.elements.filter(e => e.kind === 'rock').map(e => e.id),
    newRockIds: [], ridgeIds: [], floorUnchanged: true, boundaryGuardM: GUARD,
    overview: { center: { x: chunk.origin.x + 32, z: chunk.origin.z + 32 }, heading: 0, extentM: 52 } };
}
function habitatSummary(base, plan) {
  const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 };
  let minDepthM = Infinity, maxDepthM = -Infinity;
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const sample = sampleLivingHabitatBelt(base, plan, plan.cx * OWNER + 4 + ix * 8, plan.cz * OWNER + 4 + iz * 8);
    habitats[sample.habitat]++; minDepthM = Math.min(minDepthM, sample.depthM); maxDepthM = Math.max(maxDepthM, sample.depthM);
  }
  const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
  return { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
}
function build(base, chunks, cx, cz) {
  const themes = chunks.map(c => selectLivingHabitatMosaicTheme(base, c.cx, c.cz));
  const ordered = theme => chunks.map((c, i) => ({ i, score: random(base.seed, `${cx},${cz}|${theme}|${c.id}`) }))
    .filter(p => themes[p.i] === theme).sort((a, b) => a.score - b.score || a.i - b.i);
  const components = new Map();
  const component = i => {
    if (!components.has(i)) {
      try { components.set(i, createLivingHabitatMosaic(base, chunks[i].cx, chunks[i].cz, { theme: themes[i] })); }
      catch (error) { if (!(error instanceof RangeError)) throw error; components.set(i, null); }
    }
    return components.get(i);
  };
  for (const reef of ordered('patch-reef')) for (const meadow of ordered('meadow-edge')) {
    const reefPlan = component(reef.i), meadowPlan = component(meadow.i); if (!reefPlan || !meadowPlan) continue;
    const selected = chunks.map((_, i) => i === reef.i ? reefPlan : i === meadow.i ? meadowPlan : null);
    const rows = candidateRows(base, chunks, selected), native = chunks.map((_, i) => i).filter(i => !selected[i]);
    for (const corridorIndex of native) {
      const corridor = sandCorridor(base, chunks[corridorIndex], rows); if (!corridor) continue;
      const waterIndex = native.find(i => i !== corridorIndex), water = chunks[waterIndex];
      const group = { id: `living-habitat-belt:${cx},${cz}`, cx, cz, ownerIds: chunks.map(c => c.id), widthM: 128,
        reefOwnerId: chunks[reef.i].id, meadowOwnerId: chunks[meadow.i].id, corridorOwnerId: chunks[corridorIndex].id,
        waterOwnerId: water.id, floorUnchanged: true, boundaryGuardM: GUARD, corridor,
        reefRockCount: count(reefPlan.elements, 'rock'), newReefRockCount: reefPlan.newRockIds.length,
        reefCoralCount: count(reefPlan.elements, 'coral'), meadowRootCount: count(meadowPlan.elements, 'seagrass'),
        addedMeadowRootCount: count(meadowPlan.elements, 'seagrass') - count(chunks[meadow.i].elements, 'seagrass'),
        route: [
          { id: 'belt-reef', label: '生活带礁群', ...reefPlan.overview.center },
          { id: 'belt-sand', label: '生活带砂道', ...corridor.center },
          { id: 'belt-meadow', label: '生活带草床', ...meadowPlan.overview.center },
          { id: 'belt-water', label: '生活带水层', x: water.origin.x + 32, z: water.origin.z + 32 },
        ] };
      const plans = chunks.map((chunk, i) => ({ ...(selected[i] ?? nativePlan(base, chunk)), version: 5,
        theme: 'living-habitat-belt', componentTheme: selected[i]?.theme ?? 'native', group,
        displayScope: 'one four-owner scene plan; real ecological births and inventories are admitted atomically, never display populations' }));
      for (const plan of plans) plan.habitatComposition = habitatSummary(base, plan);
      return freeze(plans);
    }
  }
  throw new RangeError(`Group ${cx},${cz} has no complete reef, sediment passage, meadow and native water-column habitat belt.`);
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

/** Only four truly virgin owners may publish these complete plans together. */
export function createLivingHabitatBeltPlans(baseGenerator, evenCx, evenCz) {
  return model(baseGenerator, evenCx, evenCz);
}
export function validateLivingHabitatBeltPlan(plan, baseGenerator) {
  try {
    if (!plan || plan.version !== 5 || plan.theme !== 'living-habitat-belt' || !plan.group ||
      !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz) || plan.id !== `${plan.cx},${plan.cz}`) return false;
    const expected = model(baseGenerator, plan.group.cx, plan.group.cz).find(p => p.id === plan.id);
    return !!expected && stamp(plan) === stamp(expected);
  } catch { return false; }
}
function sampleIndex(plan) {
  if (sampleIndices.has(plan)) return sampleIndices.get(plan);
  const bins = new Map();
  for (const element of plan.elements) if (element.kind === 'rock' || element.kind === 'seagrass') {
    const reach = Math.hypot(element.scale.x, element.scale.z) * .5 + 8;
    for (let iz = Math.floor((element.z - reach) / 8); iz <= Math.floor((element.z + reach) / 8); iz++)
      for (let ix = Math.floor((element.x - reach) / 8); ix <= Math.floor((element.x + reach) / 8); ix++) {
        const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(element);
      }
  }
  sampleIndices.set(plan, bins); return bins;
}

/** Habitat/cover comes from the same committed descriptors as actual support.
 * The original floor, depth and environmental forcing are never changed. */
export function sampleLivingHabitatBelt(baseGenerator, plan, x, z) {
  const base = baseGenerator.baseGenerator ?? baseGenerator, original = base.sample(x, z);
  const edge = Math.min(x - plan.cx * OWNER, (plan.cx + 1) * OWNER - x, z - plan.cz * OWNER, (plan.cz + 1) * OWNER - z);
  if (edge <= GUARD) return original;
  const blend = smooth((edge - GUARD) / 3), floor = base.floorSurface(x, z).height;
  let hard = 0, grass = 0, bareRock = false;
  for (const e of sampleIndex(plan).get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? []) {
    const distance = Math.hypot(x - e.x, z - e.z);
    if (e.kind === 'rock') {
      const y = oceanRockHeight(e, x, z); if (y !== null && y > floor + .06) { bareRock = true; hard = 1; }
      // Nearby reef cues must remain below coverAt's hard-bottom threshold.
      // Only a real rock contact suppresses sediment meadow vegetation.
      hard = Math.max(hard, .30 * smooth(1 - Math.max(0, distance - Math.max(e.scale.x, e.scale.z) * .5) / 8));
    } else grass = Math.max(grass, .92 * smooth(1 - Math.max(0, distance - e.scale.x * .5) / 5));
  }
  if (bareRock) grass = 0;
  const rockiness = original.rockiness + (hard - original.rockiness) * blend;
  const seagrassSuitability = original.seagrassSuitability + (grass - original.seagrassSuitability) * blend;
  const sandOpening = original.sandOpening + ((1 - hard) * (1 - grass) - original.sandOpening) * blend;
  return { ...original, rockiness, seagrassSuitability, sandOpening,
    substrate: blend < .5 ? original.substrate : bareRock ? 'rock' : 'sand',
    habitat: original.depthM > 18.5 ? 'slope' : blend < .5 ? original.habitat : bareRock ? 'reef' : grass > .4 ? 'seagrass' : 'sand' };
}
