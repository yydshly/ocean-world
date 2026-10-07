import { deepWaterLifeSpeciesCatalog, deepWaterLifeSpeciesById } from './deepWaterLifeSpecies.js';

// Independent selected near-bottom swimmers. No new food is initialized,
// imported or lifted: actual bounded mouth contact uses native benthic stock.
export const DEEP_WATER_LIFE_VERSION = 1;
export const DEEP_WATER_LIFE_IDS = Object.freeze(deepWaterLifeSpeciesCatalog.map(s => s.id));
export const DEEP_WATER_LIFE_FOOD_SCOPE = 'Actual mouth contact with existing owner-local benthicAnimalFood selected benthic animal nutrition proxy; not floating food, rendered prey capture, complete natural diet or measured biomass. Octopus diet is a qualified congeneric inference retained in its catalog, not species stomach evidence. No observer light or hour input.';
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const DEEP_WATER_LIFE_MODEL = freeze({ maximumAdded: 4, allocationProbability: .30, maximumPitchRad: .12,
  wholeBodyClearanceM: .015, maximumBodyHeightM: 8, maximumHomeExtentM: 4, pathProbeSpacingM: .02,
  turnRadiansPerSec: .6, pitchRadiansPerSec: .15, feedingDistanceM: .10, biteAmount: .00012, biteIntervalSec: 6,
  energyGainPerUnit: 2, maintenanceDebitPerSec: .000025, motionDebitPerM: .00015, flowDebitPerSec: .00002,
  traits: Object.fromEntries(deepWaterLifeSpeciesCatalog.map(s => [s.id, { speedMps: s.kind === 'fish' ? .08 : .04 }])),
  note: 'Uncalibrated sparse independent swimmers, finite whole-envelope turn/path/target support and depth checks, selected native mouth capture distance and relative condition. Not surveyed density, measured swimming/metabolism, global collision proof, complete food webs or biomass. Owner-local motion only; no recruitment, migration, offline growth, refill or duplicate organic stocks.',
});
const M = DEEP_WATER_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2, CONDITION = 'dimensionless relative condition in independent energy ledger; not biomass or organic food stock';
const FIELDS = ['deepWaterLifeVersion', 'deepWaterLifeInitializedAtSec', 'deepWaterLife', 'deepWaterLifeAgents', 'deepWaterEnergyLedger'];
const AGENT_FIELDS = ['deepWaterIndividualVersion', 'deepWaterSiteId', 'deepWaterFoodPatchId'];
const clone = x => structuredClone(x), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const marked = x => x && Object.keys(x).some(k => k.startsWith('deepWater'));
const oldMarked = x => x && Object.keys(x).some(k => k.startsWith('deepHard') || k.startsWith('deepBenthic') || k.startsWith('predator'));
export const isDeepWaterLifeAgent = a => DEEP_WATER_LIFE_IDS.includes(a?.speciesId);
const sourceOf = a => deepWaterLifeSpeciesById[a?.speciesId];
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`deep-water-life-v1|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const geometryOwner = (g, r) => g?.surfaceY === 3500 && typeof g.heightAt === 'function' && typeof g.supportAt === 'function' && typeof g.floorSurface === 'function' &&
  Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`;
const nativeOwner = (g, r) => geometryOwner(g, r) && r.sim && Array.isArray(r.sim.agents) && Array.isArray(r.sim.benthicPatches) &&
  typeof r.sim._remove === 'function' && Number.isSafeInteger(r.sim._ticks) && r.sim._ticks >= 0 && close(r.sim.timeSec, r.sim._ticks * .1);
const oldResidents = r => [...(r.sim?.agents ?? []), ...(r.predatorAgents ?? []), ...(r.deepBenthicAgents ?? []), ...(r.deepHardLifeAgents ?? [])];
const owns = (r, p, margin = .5) => vector(p) && p.x >= r.cx * SIZE + margin && p.x <= (r.cx + 1) * SIZE - margin &&
  p.z >= r.cz * SIZE + margin && p.z <= (r.cz + 1) * SIZE - margin && Math.hypot(p.x, p.z) > 46;
function frame(heading, pitch) { const c = Math.cos(heading), s = Math.sin(heading), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { forward: { x: c * cp, y: sp, z: s * cp }, up: { x: -c * sp, y: cp, z: -s * sp }, side: { x: -s, y: 0, z: c } }; }
function offset(a, p, heading = a.heading, pitch = a.pitch) { const f = frame(heading, pitch);
  return Object.fromEntries(['x', 'y', 'z'].map(k => [k, a.sizeM * (f.forward[k] * p.x + f.up[k] * p.y + f.side[k] * p.z)])); }
const localPoints = a => { const e = sourceOf(a)?.normalizedEnvelope; if (!e) return [];
  const points = []; for (const x of [e.x[0], (e.x[0] + e.x[1]) / 2, e.x[1]]) for (const y of [e.y[0], (e.y[0] + e.y[1]) / 2, e.y[1]])
    for (const z of [e.z[0], (e.z[0] + e.z[1]) / 2, e.z[1]]) points.push({ x, y, z }); return points; };
const bodyPoints = (a, p = a.position, h = a.heading, t = a.pitch) => localPoints(a).map(v => { const q = offset(a, v, h, t); return { x: p.x + q.x, y: p.y + q.y, z: p.z + q.z }; });
export function deepWaterLifeFeedingPosition(a) { const ref = sourceOf(a)?.morphology?.feedingPointLocal;
  if (!vector(a?.position) || !vector(ref) || !Number.isFinite(a.heading) || !Number.isFinite(a.pitch)) return null;
  const q = offset(a, ref); return { x: a.position.x + q.x, y: a.position.y + q.y, z: a.position.z + q.z }; }
function bounds(a) { const points = isDeepWaterLifeAgent(a) ? bodyPoints(a) : [];
  return Object.fromEntries(['x', 'y', 'z'].map(k => [k, points.length ? [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))] :
    [a.position[k] - (a.sizeM ?? .3) * .6, a.position[k] + (a.sizeM ?? .3) * .6]])); }
function peersClear(r, a, extra = []) { const ab = bounds(a);
  return [...oldResidents(r), ...(r.deepWaterLifeAgents ?? []), ...extra].every(b => { if (a.id === b.id || !b.alive || !vector(b.position)) return true;
    const bb = bounds(b); return ['x', 'y', 'z'].some(k => ab[k][1] + .015 <= bb[k][0] || bb[k][1] + .015 <= ab[k][0]); }); }
export function deepWaterLifePositionValid(g, r, a, p = a?.position, heading = a?.heading, pitch = a?.pitch, { occupancy = false, extra = [] } = {}) {
  if (!geometryOwner(g, r) || !isDeepWaterLifeAgent(a) || !vector(p) || !Number.isFinite(a.sizeM) || a.sizeM <= 0 || !Number.isFinite(heading) || !Number.isFinite(pitch) || Math.abs(pitch) > M.maximumPitchRad + 1e-10 ||
      (vector(a.home) && distance(p, a.home) > M.maximumHomeExtentM + 1e-8)) return false;
  const s = sourceOf(a), points = bodyPoints(a, p, heading, pitch); if (points.length !== 27) return false;
  if (points.some(q => !owns(r, q) || !Number.isFinite(g.heightAt(q.x, q.z)) || q.y < g.heightAt(q.x, q.z) + M.wholeBodyClearanceM - 1e-8 ||
      q.y > g.floorSurface(q.x, q.z).height + M.maximumBodyHeightM || g.surfaceY - q.y < s.depthSelectionM[0] || g.surfaceY - q.y > s.depthSelectionM[1])) return false;
  return !occupancy || peersClear(r, { ...a, position: p, heading, pitch }, extra);
}
function floatingPose(g, r, a, x, z, heading, pitch, lift = 0) {
  let y = -Infinity; for (const local of localPoints(a)) { const q = offset(a, local, heading, pitch); y = Math.max(y, g.heightAt(x + q.x, z + q.z) + M.wholeBodyClearanceM - q.y); }
  const p = { x, y: y + lift, z }; return deepWaterLifePositionValid(g, r, a, p, heading, pitch) ? p : null;
}
/** Geometry-only sparse eligibility, computable before any native population. */
export function deepWaterLifeRole(g, cx, cz) {
  const r = { id: `${cx},${cz}`, cx, cz }; if (!geometryOwner(g, r) || randomFor(g, r)('role') >= M.allocationProbability) return false;
  for (const u of [.2, .5, .8]) for (const v of [.2, .5, .8]) for (const s of deepWaterLifeSpeciesCatalog) {
    const x = (cx + u) * SIZE, z = (cz + v) * SIZE, sample = g.supportAt(x, z), bed = g.floorSurface(x, z);
    if (sample.elementId !== null || sample.substrate !== 'mud' || Math.abs(sample.height - bed.height) > .04) continue;
    const a = { speciesId: s.id, sizeM: s.sizeRangeM[0], heading: 0, pitch: 0 };
    if (floatingPose(g, r, a, x, z, 0, 0, .03)) return true;
  }
  return false;
}
function foodSites(r) { const out = [];
  for (const p of r.sim.benthicPatches) for (const ring of [.35, .8, 1.3]) for (let i = 0; i < 8; i++)
    out.push({ id: `${p.id}:${ring}:${i}`, patchId: p.id, ring, angleIndex: i, foodPosition: clone(p.position) }); return out; }
function placementAt(g, r, speciesId, slot, site, extra = [], occupancy = true) {
  const random = randomFor(g, r), s = deepWaterLifeSpeciesById[speciesId], sizeM = s.sizeRangeM[0] + random(`${speciesId}:${slot}:size`) * (s.sizeRangeM[1] - s.sizeRangeM[0]), heading = site.angleIndex * TAU / 8, pitch = -.06,
    a = { id: `deep-water:${r.id}:${speciesId}:${slot}`, speciesId, slot, sizeM, heading, pitch, deepWaterSiteId: site.id, deepWaterFoodPatchId: site.patchId,
      nutritionPool: 'benthicAnimalFood', alive: true, habitat: 'native-deep-near-bottom-water' }, mouth = offset(a, s.morphology.feedingPointLocal);
  const x = site.foodPosition.x - mouth.x - Math.cos(heading) * site.ring, z = site.foodPosition.z - mouth.z - Math.sin(heading) * site.ring,
    position = floatingPose(g, r, a, x, z, heading, pitch, .03);
  if (!position || (occupancy && !peersClear(r, { ...a, position }, extra))) return null;
  return { ...a, position, siteId: site.id, foodPosition: clone(site.foodPosition) };
}
export function createDeepWaterLifePlan(g, r, { availableSlots = 0, maxAdded = 4 } = {}) {
  if (!nativeOwner(g, r) || !deepWaterLifeRole(g, r.cx, r.cz)) return freeze({ version: 1, placements: [] });
  const count = Math.min(4, Math.max(0, Math.floor(Number.isFinite(availableSlots) ? availableSlots : 0)), Math.max(0, Math.floor(Number.isFinite(maxAdded) ? maxAdded : 0))), placements = [], random = randomFor(g, r),
    sites = foodSites(r).sort((a, b) => random(`site:${a.id}`) - random(`site:${b.id}`) || a.id.localeCompare(b.id));
  for (let slot = 0; slot < 2; slot++) for (const id of DEEP_WATER_LIFE_IDS) {
    if (placements.length >= count) break;
    for (const site of sites) { const p = placementAt(g, r, id, slot, site, placements); if (p) { placements.push(p); break; } }
  }
  return freeze({ version: 1, placements });
}
export function initializeDeepWaterLife(g, r, { fresh = false, capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !nativeOwner(g, r) || r.sim.timeSec !== 0 || r.sim._ticks !== 0 || marked(r) || oldResidents(r).some(a => isDeepWaterLifeAgent(a) || marked(a)) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || oldResidents(r).length > capacity) return false;
  const plan = createDeepWaterLifePlan(g, r, { availableSlots: capacity - oldResidents(r).length, maxAdded }), random = randomFor(g, r);
  r.deepWaterLifeAgents = plan.placements.map(p => ({ ...clone(p), deepWaterIndividualVersion: 1, regionId: r.id, home: clone(p.position), target: clone(p.position), targetHeading: p.heading, targetPitch: p.pitch,
    velocity: { x: 0, y: 0, z: 0 }, createdAtSec: 0, timeSec: 0, stateSince: 0, state: 'hovering', energy: .68 + random(`${p.id}:condition`) * .12, nextDecision: 0, decisions: 0, nextBite: 0,
    travelledM: 0, feedingCount: 0, consumedUnits: 0, lastFeedAt: null, lastWaterLifeIntake: null, foodScope: DEEP_WATER_LIFE_FOOD_SCOPE, conditionScope: CONDITION }));
  r.deepWaterLifeVersion = 1; r.deepWaterLifeInitializedAtSec = 0;
  r.deepWaterLife = { version: 1, role: deepWaterLifeRole(g, r.cx, r.cz), scope: M.note, foodScope: DEEP_WATER_LIFE_FOOD_SCOPE, birthPlacements: clone(plan.placements), addedIds: plan.placements.map(p => p.id),
    lastTickSec: 0, counters: { ticks: 0, feedings: 0, consumedUnits: 0, deaths: 0 }, events: [] };
  r.deepWaterEnergyLedger = { initial: r.deepWaterLifeAgents.reduce((sum, a) => sum + a.energy, 0), feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 }; return true;
}
export function captureDeepWaterLife(r) { return Object.hasOwn(r, 'deepWaterLifeVersion') ? Object.fromEntries(FIELDS.map(k => [k, clone(r[k])])) : {}; }
export function deepWaterLifeEnergyBudgetError(r) { const l = r?.deepWaterEnergyLedger; if (!l) return 0;
  return (r.deepWaterLifeAgents ?? []).reduce((sum, a) => sum + a.energy, 0) - (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection - l.deathLoss); }
export function deepWaterLifeFoodBudgetError(r) { const s = r?.sim; if (!s) return 0;
  const stocks = Object.fromEntries([['surfaceDetritus', s.surfacePatches], ['benthicAnimalFood', s.benthicPatches], ['suspendedPrey', s.suspendedPatches]].map(([pool, rows]) => [pool, rows.reduce((sum, p) => sum + p[pool], 0)]));
  let error = Math.abs(Object.values(stocks).reduce((a, b) => a + b, 0) - (s.ledger.initial + s.ledger.input - s.ledger.ingested - s.ledger.exported));
  for (const [pool, stock] of Object.entries(stocks)) { const l = s.ledger.byPool[pool]; error = Math.max(error, Math.abs(stock - (l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported))); } return error;
}
const patchFor = (r, a) => r.sim.benthicPatches.find(p => p.id === a.deepWaterFoodPatchId);
function feedingApproach(g, r, a, patch) {
  for (let i = 0; i < 8; i++) { const heading = a.heading + i * TAU / 8, pitch = -.06, q = offset(a, sourceOf(a).morphology.feedingPointLocal, heading, pitch),
    p = floatingPose(g, r, a, patch.position.x - q.x, patch.position.z - q.z, heading, pitch);
    if (!p || !deepWaterLifePositionValid(g, r, a, p, heading, pitch, { occupancy: true })) continue;
    const organ = deepWaterLifeFeedingPosition({ ...a, position: p, heading, pitch }); if (distance(organ, patch.position) <= M.feedingDistanceM) return { position: p, heading, pitch };
  }
  return null;
}
const setState = (a, state, time) => { if (a.state !== state) { a.state = state; a.stateSince = time; } };
function move(a, g, r, dt) {
  const start = clone(a.position), turn = Math.atan2(Math.sin(a.targetHeading - a.heading), Math.cos(a.targetHeading - a.heading)),
    h = a.heading + clamp(turn, -M.turnRadiansPerSec * dt, M.turnRadiansPerSec * dt), t = a.pitch + clamp(a.targetPitch - a.pitch, -M.pitchRadiansPerSec * dt, M.pitchRadiansPerSec * dt),
    gap = distance(start, a.target), speed = M.traits[a.speciesId].speedMps, step = Math.min(gap, speed * dt);
  for (const fraction of [1, .5, .25, 0]) {
    const p = Object.fromEntries(['x', 'y', 'z'].map(k => [k, start[k] + (gap > 0 ? (a.target[k] - start[k]) / gap * step * fraction : 0)]));
    let valid = true;
    for (const f of [0, .5, 1]) { const q = Object.fromEntries(['x', 'y', 'z'].map(k => [k, start[k] + (p[k] - start[k]) * f]));
      if (!deepWaterLifePositionValid(g, r, a, q, a.heading + (h - a.heading) * f, a.pitch + (t - a.pitch) * f, { occupancy: true })) { valid = false; break; }
    }
    if (valid) { a.position = p; a.heading = h; a.pitch = t; break; }
  }
  a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (a.position[k] - start[k]) / dt])); const traveled = distance(start, a.position); a.travelledM += traveled; return traveled;
}
function intakeValid(a, r, g) {
  const w = a.lastWaterLifeIntake; if (w === null) return a.lastFeedAt === null && a.feedingCount === 0 && a.consumedUnits === 0;
  const patch = patchFor(r, a);
  if (!w || !patch || w.ownerId !== r.id || w.patchId !== patch.id || w.pool !== 'benthicAnimalFood' || w.scope !== DEEP_WATER_LIFE_FOOD_SCOPE || w.unit !== 'relative-organic-food-proxy-unit' ||
      w.allowedDistanceM !== M.feedingDistanceM || !nonnegative(w.timeSec) || w.timeSec !== a.lastFeedAt || w.timeSec > a.timeSec || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(k => nonnegative(w[k])) ||
      w.removedUnits <= 0 || w.removedUnits > M.biteAmount + 1e-10 || !close(w.stockBefore - w.stockAfter, w.removedUnits) || w.energyBefore > 1 || !close(w.energyAfter, Math.min(1, w.energyBefore + w.removedUnits * M.energyGainPerUnit)) ||
      !['agentPosition', 'feedingPosition', 'foodPosition'].every(k => vector(w[k])) || !Number.isFinite(w.agentHeading) || !Number.isFinite(w.agentPitch) || Math.abs(w.agentPitch) > M.maximumPitchRad ||
      !close(distance(w.foodPosition, w.feedingPosition), w.contactDistanceM) || w.contactDistanceM > M.feedingDistanceM + 1e-10 || !['x', 'y', 'z'].every(k => close(w.foodPosition[k], patch.position[k])) ||
      !deepWaterLifePositionValid(g, r, a, w.agentPosition, w.agentHeading, w.agentPitch)) return false;
  const organ = deepWaterLifeFeedingPosition({ ...a, position: w.agentPosition, heading: w.agentHeading, pitch: w.agentPitch }); return ['x', 'y', 'z'].every(k => close(organ[k], w.feedingPosition[k]));
}
function validate(raw, r, g, capacity, pending = false) {
  const old = [...(raw?.state?.agents ?? r?.sim?.agents ?? []), ...(raw?.predatorAgents ?? []), ...(raw?.deepBenthicAgents ?? []), ...(raw?.deepHardLifeAgents ?? [])];
  if (marked(raw?.state) || old.some(a => isDeepWaterLifeAgent(a) || marked(a))) return false; if (!marked(raw)) return true;
  if (!nativeOwner(g, r) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || Object.keys(raw).some(k => k.startsWith('deepWater') && !FIELDS.includes(k)) || !FIELDS.every(k => Object.hasOwn(raw, k)) ||
      raw.deepWaterLifeVersion !== 1 || raw.deepWaterLifeInitializedAtSec !== 0 || !Array.isArray(raw.deepWaterLifeAgents) || raw.deepWaterLifeAgents.length > 4 || old.length + raw.deepWaterLifeAgents.length > capacity) return false;
  const d = raw.deepWaterLife, agents = raw.deepWaterLifeAgents, l = raw.deepWaterEnergyLedger, clock = r.sim.timeSec - (pending ? .1 : 0), candidate = { ...r, deepWaterLife: d, deepWaterLifeAgents: agents, deepWaterEnergyLedger: l };
  if (!d || Object.keys(d).some(k => k.startsWith('deepWater')) || d.version !== 1 || d.scope !== M.note || d.foodScope !== DEEP_WATER_LIFE_FOOD_SCOPE || typeof d.role !== 'boolean' || d.role !== deepWaterLifeRole(g, r.cx, r.cz) || (!d.role && agents.length > 0) || !close(d.lastTickSec, clock) ||
      !Array.isArray(d.birthPlacements) || !Array.isArray(d.addedIds) || d.birthPlacements.length !== agents.length || d.addedIds.length !== agents.length || new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length ||
      !Array.isArray(d.events) || d.events.length > 40 || !['ticks', 'feedings', 'deaths'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || !close(d.counters.ticks * .1, clock) ||
      !nonnegative(d.counters.consumedUnits) || d.counters.deaths !== agents.filter(a => a?.alive === false).length || !l || !['initial', 'feedingGain', 'maintenanceAndMotionDebit', 'deathLoss'].every(k => nonnegative(l[k])) ||
      !Number.isFinite(l.clampCorrection) || l.clampCorrection > 0 || !close(l.feedingGain, d.counters.consumedUnits * M.energyGainPerUnit) || Math.abs(deepWaterLifeEnergyBudgetError(candidate)) > 1e-8 || deepWaterLifeFoodBudgetError(r) > 1e-8) return false;
  const ids = new Set(old.map(a => a?.id)), sites = foodSites(r), random = randomFor(g, r);
  for (const a of agents) {
    const birth = d.birthPlacements.find(p => p?.id === a?.id), site = birth && sites.find(s => s.id === birth.siteId), original = site && placementAt(g, r, a.speciesId, a.slot, site, [], false);
    if (!isDeepWaterLifeAgent(a) || oldMarked(a) || Object.keys(a).some(k => k.startsWith('deepWater') && !AGENT_FIELDS.includes(k)) || !birth || oldMarked(birth) || Object.keys(birth).some(k => k.startsWith('deepWater') && !AGENT_FIELDS.includes(k)) || !original || ids.has(a.id) || !d.addedIds.includes(a.id) || ![0, 1].includes(a.slot) ||
        a.id !== original.id || a.sizeM !== original.sizeM || a.deepWaterIndividualVersion !== 1 || a.deepWaterSiteId !== original.siteId || a.deepWaterFoodPatchId !== original.deepWaterFoodPatchId || a.regionId !== r.id ||
        a.nutritionPool !== 'benthicAnimalFood' || sourceOf(a).foodPool !== 'benthicAnimalFood' || a.habitat !== original.habitat || ['speciesId', 'slot', 'sizeM', 'heading', 'pitch', 'deepWaterSiteId', 'deepWaterFoodPatchId', 'nutritionPool', 'alive', 'habitat', 'siteId'].some(k => birth[k] !== original[k]) ||
        !['position', 'home', 'target', 'velocity'].every(k => vector(a[k])) || !['x', 'y', 'z'].every(k => close(a.home[k], original.position[k]) && close(birth.position?.[k], original.position[k]) && close(birth.foodPosition?.[k], original.foodPosition[k])) ||
        !Number.isFinite(a.heading) || !Number.isFinite(a.pitch) || Math.abs(a.pitch) > M.maximumPitchRad + 1e-10 || !Number.isFinite(a.targetHeading) || !Number.isFinite(a.targetPitch) || Math.abs(a.targetPitch) > M.maximumPitchRad + 1e-10 ||
        a.createdAtSec !== 0 || !['timeSec', 'stateSince', 'energy', 'nextBite', 'nextDecision', 'travelledM', 'consumedUnits'].every(k => nonnegative(a[k])) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 || !Number.isSafeInteger(a.feedingCount) || a.feedingCount < 0 ||
        a.energy > 1 || a.timeSec > clock + 1e-8 || a.stateSince > a.timeSec || (a.lastFeedAt === null ? a.nextBite !== 0 : !close(a.nextBite, a.lastFeedAt + M.biteIntervalSec)) || typeof a.alive !== 'boolean' || !['hovering', 'swimming', 'foraging', 'feeding', 'searching', 'blocked', 'dead'].includes(a.state) ||
        (a.alive ? a.state === 'dead' || !close(a.timeSec, clock) : a.state !== 'dead' || a.energy !== 0 || a.stateSince !== a.timeSec || ['x', 'y', 'z'].some(k => a.velocity[k] !== 0)) ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > M.traits[a.speciesId].speedMps + 1e-8 || a.travelledM > a.timeSec * M.traits[a.speciesId].speedMps + 1e-8 || a.consumedUnits > a.feedingCount * M.biteAmount + 1e-8 ||
        a.foodScope !== DEEP_WATER_LIFE_FOOD_SCOPE || a.conditionScope !== CONDITION || !deepWaterLifePositionValid(g, r, a) || !deepWaterLifePositionValid(g, r, a, a.target, a.targetHeading, a.targetPitch) || !intakeValid(a, candidate, g)) return false;
    ids.add(a.id);
  }
  return close(l.initial, agents.reduce((sum, a) => sum + .68 + random(`${a.id}:condition`) * .12, 0)) &&
    close(d.counters.consumedUnits, agents.reduce((sum, a) => sum + a.consumedUnits, 0)) && d.counters.feedings === agents.reduce((sum, a) => sum + a.feedingCount, 0);
}
export function validateDeepWaterLifeRecord(record, r, { generator, capacity = 20 } = {}) { try { return validate(record, r, generator, capacity); } catch { return false; } }
export function tickDeepWaterLife(r, g, dt) {
  if (!nativeOwner(g, r) || r.deepWaterLifeVersion !== 1 || Object.keys(r).some(k => k.startsWith('deepWater') && !FIELDS.includes(k)) || !close(dt, .1) || !close(r.sim.timeSec - r.deepWaterLife?.lastTickSec, .1)) return false;
  const raw = { state: { agents: r.sim.agents }, predatorAgents: r.predatorAgents, deepBenthicAgents: r.deepBenthicAgents, deepHardLifeAgents: r.deepHardLifeAgents, ...captureDeepWaterLife(r) };
  try { if (!validate(raw, r, g, 20, true)) return false; } catch { return false; }
  const clock = r.sim.timeSec, flow = r.sim.environment.currentMps; if (!Number.isFinite(flow) || flow < 0 || flow > 1.2) return false;
  const d = r.deepWaterLife, ledger = r.deepWaterEnergyLedger, random = randomFor(g, r); d.lastTickSec = clock; d.counters.ticks++;
  for (const a of r.deepWaterLifeAgents) {
    if (!a.alive) continue; a.timeSec = clock; const patch = patchFor(r, a);
    if (clock >= a.nextDecision || distance(a.position, a.target) < .015) {
      const key = `${a.id}:decision:${a.decisions++}`; a.nextDecision = clock + 3 + random(`${key}:interval`) * 2;
      const approach = clock >= a.nextBite && patch && patch.benthicAnimalFood > 0 && feedingApproach(g, r, a, patch);
      if (approach) { a.target = approach.position; a.targetHeading = approach.heading; a.targetPitch = approach.pitch; }
      else for (let i = 0; i < 6; i++) {
        const angle = random(`${key}:angle:${i}`) * TAU, reach = .25 + random(`${key}:reach:${i}`) * .8, x = a.home.x + Math.cos(angle) * reach, z = a.home.z + Math.sin(angle) * reach,
          h = Math.atan2(z - a.position.z, x - a.position.x), pitch = 0, p = floatingPose(g, r, a, x, z, h, pitch, .03);
        if (p && deepWaterLifePositionValid(g, r, a, p, h, pitch, { occupancy: true })) { a.target = p; a.targetHeading = h; a.targetPitch = pitch; break; }
      }
    }
    const moved = move(a, g, r, dt), debit = Math.min(a.energy, dt * (M.maintenanceDebitPerSec + flow * flow * M.flowDebitPerSec) + moved * M.motionDebitPerM);
    a.energy -= debit; ledger.maintenanceAndMotionDebit += debit;
    if (a.energy <= 0) { a.energy = 0; a.alive = false; a.velocity = { x: 0, y: 0, z: 0 }; setState(a, 'dead', clock); d.counters.deaths++; continue; }
    setState(a, moved > 1e-12 ? patch?.benthicAnimalFood > 0 ? 'foraging' : 'swimming' : distance(a.position, a.target) > .015 ? 'blocked' : 'searching', clock);
    if (clock < a.nextBite || !patch || !(patch.benthicAnimalFood > 0) || !deepWaterLifePositionValid(g, r, a, a.position, a.heading, a.pitch, { occupancy: true })) continue;
    const organ = deepWaterLifeFeedingPosition(a), gap = distance(organ, patch.position); if (gap > M.feedingDistanceM + 1e-10) continue;
    const stockBefore = patch.benthicAnimalFood, energyBefore = a.energy, taken = r.sim._remove(patch, 'benthicAnimalFood', M.biteAmount, 'ingested'); if (!(taken > 0)) continue;
    const unbounded = a.energy + taken * M.energyGainPerUnit; a.energy = Math.min(1, unbounded); ledger.feedingGain += taken * M.energyGainPerUnit; ledger.clampCorrection += a.energy - unbounded;
    a.lastFeedAt = clock; a.nextBite = clock + M.biteIntervalSec; a.feedingCount++; a.consumedUnits += taken; d.counters.feedings++; d.counters.consumedUnits += taken;
    a.lastWaterLifeIntake = { timeSec: clock, ownerId: r.id, patchId: patch.id, pool: 'benthicAnimalFood', stockBefore, stockAfter: patch.benthicAnimalFood, removedUnits: taken,
      energyBefore, energyAfter: a.energy, agentPosition: clone(a.position), agentHeading: a.heading, agentPitch: a.pitch, feedingPosition: organ, foodPosition: clone(patch.position),
      contactDistanceM: gap, allowedDistanceM: M.feedingDistanceM, unit: 'relative-organic-food-proxy-unit', scope: DEEP_WATER_LIFE_FOOD_SCOPE };
    setState(a, 'feeding', clock);
  }
  return true;
}
export function deepWaterLifeSnapshot(r) { if (r?.deepWaterLifeVersion !== 1) return null;
  return { version: 1, resources: {}, foodLedger: null, counters: clone(r.deepWaterLife.counters), agents: clone(r.deepWaterLifeAgents),
    foodBudgetError: deepWaterLifeFoodBudgetError(r), energyBudgetError: deepWaterLifeEnergyBudgetError(r), foodScope: DEEP_WATER_LIFE_FOOD_SCOPE, scope: M.note };
}
