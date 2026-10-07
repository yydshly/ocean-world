import { kelpNearBottomLifeSpeciesCatalog, kelpNearBottomLifeSpeciesById } from './kelpNearBottomLifeSpecies.js';
import { kelpStipePosition, kelpLeafFraction, kelpLeafPosition, kelpLeafWidth } from './kelpHabitat.js';
import { kelpWaterElements } from './kelpWaterCommunity.js';

export const KELP_NEAR_BOTTOM_LIFE_VERSION = 1;
export const KELP_NEAR_BOTTOM_LIFE_IDS = Object.freeze(kelpNearBottomLifeSpeciesCatalog.map(s => s.id));
export const KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE = 'Independent bounded owner-local bed control volumes for unresolved benthic small-animal nutrition. Initially zero, with foodSupply-dependent accounted external input, actual fixed-mouth contact and accounted export. Actual native floor/rock supports; no changes to legacy host prey, algae, detritus, food points or ledgers. Selected dietary component, not measured density, biomass, complete food webs or visible prey kills.';
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const KELP_NEAR_BOTTOM_LIFE_MODEL = freeze({ maximumAdded: 4, allocationProbability: .65, maximumPitchRad: .12,
  maximumTurnRadSec: .55, maximumPitchTurnRadSec: .15, clearanceM: .008, groundClearanceM: .003, maximumFootGapM: .024,
  minimumGroundNormalY: .94, predictionSec: .4, maximumHomeExtentM: 3, maximumRayBedHeightM: 2,
  foodHeightM: .055, maximumFoodDistanceM: .16, maximumFoodPatches: 4, maximumPatchStock: .006,
  inputPerPatchSec: .00006, exportFractionPerSec: .015, biteAmount: .00012, biteIntervalSec: 6,
  energyGainPerUnit: 2, maintenanceDebitPerSec: .000025, motionDebitPerM: .00015, flowDebitPerSec: .00002,
  traits: Object.fromEntries(kelpNearBottomLifeSpeciesCatalog.map(s => [s.id, { speedMps: s.kind === 'crab' ? .012 : s.kind === 'shark' ? .10 : s.kind === 'ray' ? .055 : .075 }])),
  note: 'Sparse independent representatives with uncalibrated movement, capture distance, intake, supply/export and relative condition. One whole-envelope pose kernel checks actual supports, feet, bounded turns, intermediate positions, targets and native plants at current/predicted clocks. Legacy controllers are unchanged, so this is not a global collision proof. Fixed bed control-volume input is an explicit external selected nutrition flux, not a resolved prey population. No recruitment, migration, offline growth or refill.',
});
const M = KELP_NEAR_BOTTOM_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2, POOL = 'benthicAnimalFood', CONDITION = 'dimensionless relative condition; independent condition ledger, not food or biomass';
const FIELDS = ['kelpNearBottomLifeVersion', 'kelpNearBottomLifeInitializedAtSec', 'kelpNearBottomLife', 'kelpNearBottomLifeAgents', 'kelpNearBottomEnergyLedger'];
const AGENT_FIELDS = ['kelpNearBottomIndividualVersion', 'kelpNearBottomSiteId', 'kelpNearBottomFoodPatchId'];
const clone = x => structuredClone(x), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const marked = x => x && Object.keys(x).some(k => k.startsWith('kelpNearBottom'));
const oldMarked = x => x && Object.keys(x).some(k => k.startsWith('kelpBenthic') || k.startsWith('kelpWaterLife') || k.startsWith('deep'));
const sourceOf = a => kelpNearBottomLifeSpeciesById[a?.speciesId];
export const isKelpNearBottomLifeAgent = a => KELP_NEAR_BOTTOM_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`kelp-near-bottom-v1|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const geometryOwner = (g, r) => g?.supportVersion === 2 && typeof g.heightAt === 'function' && typeof g.supportAt === 'function' && typeof g.chunk === 'function' && Number.isFinite(g.surfaceY) && Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`;
const nativeOwner = (g, r) => geometryOwner(g, r) && r.sim && Array.isArray(r.sim.agents) && Array.isArray(r.sim.rockPatches) && Array.isArray(r.sim.floorPatches) && Number.isSafeInteger(r.sim._ticks) && r.sim._ticks >= 0 && close(r.sim.timeSec, r.sim._ticks * .1);
const allOld = r => [...(r.sim?.agents ?? []), ...(r.waterAgents ?? []), ...(r.visitorAgents ?? []), ...(r.kelpBenthicAgents ?? []), ...(r.kelpWaterLifeAgents ?? [])];
const oldResidents = r => allOld(r).filter(a => a.speciesId !== 'giant-kelp');
const owns = (r, p) => vector(p) && p.x >= r.cx * SIZE + .5 && p.x <= (r.cx + 1) * SIZE - .5 && p.z >= r.cz * SIZE + .5 && p.z <= (r.cz + 1) * SIZE - .5 && Math.hypot(p.x, p.z) > 46;
function frame(a, heading = a.heading, pitch = a.pitch, normal = a.supportNormal) {
  const c = Math.cos(heading), s = Math.sin(heading);
  if (sourceOf(a)?.kind === 'crab') {
    if (!vector(normal)) return null; const n = Math.hypot(normal.x, normal.y, normal.z); if (!(n > 0)) return null;
    const up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / n])), d = c * up.x + s * up.z,
      forward = { x: c - d * up.x, y: -d * up.y, z: s - d * up.z }, length = Math.hypot(forward.x, forward.y, forward.z);
    if (length < 1e-9) return null; for (const k of ['x', 'y', 'z']) forward[k] /= length;
    return { forward, up, side: { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x } };
  }
  const cp = Math.cos(pitch), sp = Math.sin(pitch); return { forward: { x: c * cp, y: sp, z: s * cp }, up: { x: -c * sp, y: cp, z: -s * sp }, side: { x: -s, y: 0, z: c } };
}
function offset(a, p, h = a.heading, t = a.pitch, normal = a.supportNormal) { const f = frame(a, h, t, normal); if (!f) return null; return Object.fromEntries(['x', 'y', 'z'].map(k => [k, a.sizeM * (f.forward[k] * p.x + f.up[k] * p.y + f.side[k] * p.z)])); }
function localPoints(a) { const e = sourceOf(a)?.normalizedEnvelope; if (!e) return []; const out = [];
  for (const x of [e.x[0], (e.x[0] + e.x[1]) / 2, e.x[1]]) for (const y of [e.y[0], (e.y[0] + e.y[1]) / 2, e.y[1]]) for (const z of [e.z[0], (e.z[0] + e.z[1]) / 2, e.z[1]]) out.push({ x, y, z }); return out; }
const bodyPoints = (a, p = a.position, h = a.heading, t = a.pitch, normal = a.supportNormal) => localPoints(a).map(v => { const q = offset(a, v, h, t, normal); return q && { x: p.x + q.x, y: p.y + q.y, z: p.z + q.z }; });
export function kelpNearBottomLifeFeedingPosition(a, p = a?.position, h = a?.heading, t = a?.pitch, normal = a?.supportNormal) { const ref = sourceOf(a)?.morphology?.feedingPointLocal; if (!vector(p) || !vector(ref)) return null; const q = offset(a, ref, h, t, normal); return q && { x: p.x + q.x, y: p.y + q.y, z: p.z + q.z }; }
function bounds(a) { const points = isKelpNearBottomLifeAgent(a) ? bodyPoints(a) : []; return Object.fromEntries(['x', 'y', 'z'].map(k => [k, points.length ? [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))] : [a.position[k] - (a.sizeM ?? .2) * .65, a.position[k] + (a.sizeM ?? .2) * .65]])); }
function peersClear(r, a, extra = []) { const b = bounds(a); return [...oldResidents(r), ...(r.kelpNearBottomLifeAgents ?? []), ...extra].every(o => { if (o.id === a.id || !o.alive || !vector(o.position)) return true; const other = bounds(o); return ['x', 'y', 'z'].some(k => b[k][1] + .02 <= other[k][0] || other[k][1] + .02 <= b[k][0]); }); }
function segmentHitsBox(a, b, e, padding) { let lo = 0, hi = 1; for (const axis of ['x', 'y', 'z']) { const min = e[axis][0] - padding, max = e[axis][1] + padding, d = b[axis] - a[axis]; if (Math.abs(d) < 1e-12) { if (a[axis] < min || a[axis] > max) return false; continue; } let start = (min - a[axis]) / d, end = (max - a[axis]) / d; if (start > end) [start, end] = [end, start]; lo = Math.max(lo, start); hi = Math.min(hi, end); if (lo > hi) return false; } return true; }
// The native stipe's authored displacement has a clock-independent upper
// bound over its 0..1.2 m/s flow domain. Starting from the global radius and
// iterating the root-to-point chord bound retains a conservative low-height
// sweep. The blade allowance starts only where the lowest blade can reach.
// This keeps a blocked animal out of an incoming plant's complete sweep;
// actual current/future stipe and blade segment checks still run below.
function plantSweepRadius(anchor, highY) {
  const high = Math.max(0, highY - anchor.y), length = anchor.lengthM * .94;
  if (!(length > 0)) return 4.8;
  const horizontal = u => 2.30 * u ** 5 + (u < .5 ? 1.12 * u * (1 - u) : .28) + .284 * u + .648 * u ** 1.8 + .715 * u ** 2;
  let radius = 4;
  for (let i = 0; i < 5; i++) radius = horizontal(Math.min(1, Math.sqrt(high * high + radius * radius) / length));
  const lowestBlade = Math.sqrt(Math.max(0, (length * .10) ** 2 - horizontal(.10) ** 2));
  return radius + .016 + (high >= lowestBlade - .75 ? .75 : 0);
}
function plantsClear(g, r, a, clock, env, elements) {
  const e = sourceOf(a).normalizedEnvelope, f = frame(a), points = bodyPoints(a), low = Math.min(...points.map(p => p.y)), high = Math.max(...points.map(p => p.y)), radius = Math.max(...points.map(p => Math.hypot(p.x - a.position.x, p.z - a.position.z)));
  // Dot products into the actual yaw/pitch or tangent-normal body frame.
  const toLocal = p => ({ x: ((p.x - a.position.x) * f.forward.x + (p.y - a.position.y) * f.forward.y + (p.z - a.position.z) * f.forward.z) / a.sizeM,
    y: ((p.x - a.position.x) * f.up.x + (p.y - a.position.y) * f.up.y + (p.z - a.position.z) * f.up.z) / a.sizeM,
    z: ((p.x - a.position.x) * f.side.x + (p.y - a.position.y) * f.side.y + (p.z - a.position.z) * f.side.z) / a.sizeM });
  for (const p of r.understoryPlants ?? []) if (high >= p.y - .01 && low <= p.y + p.heightM + .01 && Math.hypot(a.position.x - p.x, a.position.z - p.z) <= radius + p.radiusM + .01) return false;
  for (const element of elements) {
    const plant = r.sim.agents.find(p => p.speciesId === 'giant-kelp' && p.sceneryId === element.id), anchor = plant ? r.sim.getKelpAnchor(plant.id) : element.anchor;
    if (!anchor || high < anchor.y - .04 || low > anchor.y + anchor.lengthM + .8) continue;
    const horizontal = Math.hypot(a.position.x - anchor.x, a.position.z - anchor.z);
    if (!plant) { if (horizontal < 3.8 + radius + .01) return false; continue; } if (horizontal > 4.8 + radius) continue;
    if (horizontal < radius + plantSweepRadius(anchor, high)) return false;
    for (let frond = 0; frond < 4; frond++) {
      const length = anchor.lengthM * [1, .982, .96, .94][frond], min = Math.max(0, (low - anchor.y - .12) / length), max = Math.min(1, (high - anchor.y + .12) / length);
      let last = kelpStipePosition(anchor, min, clock, env, frond);
      for (let i = 1; i <= 8; i++) { const next = kelpStipePosition(anchor, min + (max - min) * i / 8, clock, env, frond); if (segmentHitsBox(toLocal(last), toLocal(next), e, (.008 + M.clearanceM) / a.sizeM)) return false; last = next; }
      for (let leaf = 0; leaf < 54; leaf++) { const stem = kelpStipePosition(anchor, kelpLeafFraction(leaf, anchor, frond), clock, env, frond); if (stem.y < low - .15 || stem.y > high + .8) continue;
        last = kelpLeafPosition(anchor, leaf, 0, clock, env, frond); for (let i = 1; i <= 4; i++) { const next = kelpLeafPosition(anchor, leaf, i / 4, clock, env, frond); if (segmentHitsBox(toLocal(last), toLocal(next), e, (kelpLeafWidth(leaf) / 2 + M.clearanceM) / a.sizeM)) return false; last = next; }
      }
    }
  }
  return true;
}
function groundPose(g, a, x, z, heading) { const support = g.supportAt(x, z); if (!vector(support.normal) || support.normal.y < M.minimumGroundNormalY) return null;
  const normal = clone(support.normal), seed = { ...a, supportNormal: normal }, feet = sourceOf(a)?.morphology?.footContactPointsLocal ?? sourceOf(a)?.support?.footContactPointsLocal;
  if (!Array.isArray(feet) || feet.length !== 8) return null; let y = -Infinity, min = Infinity, max = -Infinity;
  for (const ref of feet) { const q = offset(seed, ref, heading, 0), height = g.heightAt(x + q.x, z + q.z); if (!Number.isFinite(height)) return null; min = Math.min(min, height - q.y); max = Math.max(max, height - q.y); }
  for (const ref of localPoints(seed)) { const q = offset(seed, ref, heading, 0); y = Math.max(y, g.heightAt(x + q.x, z + q.z) - q.y + M.groundClearanceM); }
  if (max - min > M.maximumFootGapM || y - min > M.maximumFootGapM + M.groundClearanceM) return null;
  return { position: { x, y, z }, supportNormal: normal, heading, pitch: 0 };
}
function floatingPose(g, a, x, z, heading, pitch, lift = 0) { let y = -Infinity; for (const ref of localPoints(a)) { const q = offset(a, ref, heading, pitch); y = Math.max(y, g.heightAt(x + q.x, z + q.z) - q.y + M.clearanceM); } return { position: { x, y: y + lift, z }, supportNormal: { x: 0, y: 1, z: 0 }, heading, pitch }; }
function physicalPose(g, a, x, z, heading, pitch = 0, lift = .06) { return sourceOf(a)?.kind === 'crab' ? groundPose(g, a, x, z, heading) : floatingPose(g, a, x, z, heading, sourceOf(a)?.kind === 'ray' ? 0 : pitch, lift); }
export function kelpNearBottomLifePositionValid(g, r, a, position = a?.position, heading = a?.heading, pitch = a?.pitch, { occupancy = false, extra = [], future = true, checkPlants = true, elements = null, timeSec = r?.sim?.timeSec ?? 0, environment = r?.sim?.environment } = {}) {
  if (!geometryOwner(g, r) || !isKelpNearBottomLifeAgent(a) || !vector(position) || !(a.sizeM > 0) || !Number.isFinite(heading) || !Number.isFinite(pitch) || Math.abs(pitch) > M.maximumPitchRad + 1e-10 || (['crab', 'ray'].includes(sourceOf(a).kind) && pitch !== 0) || (vector(a.home) && gap(position, a.home) > M.maximumHomeExtentM + 1e-8)) return false;
  const pose = { ...a, position, heading, pitch }, grounded = sourceOf(a).kind === 'crab';
  if (grounded) { const actual = groundPose(g, a, position.x, position.z, heading); if (!actual || !close(actual.position.y, position.y) || !['x', 'y', 'z'].every(k => close(actual.supportNormal[k], a.supportNormal?.[k]))) return false; }
  const points = bodyPoints(pose), s = sourceOf(a); if (points.some(q => !q || !owns(r, q) || !Number.isFinite(g.heightAt(q.x, q.z)) || q.y < g.heightAt(q.x, q.z) + (grounded ? M.groundClearanceM : M.clearanceM) - 1e-8 || g.surfaceY - q.y < s.depthSelectionM[0] || g.surfaceY - q.y > s.depthSelectionM[1] || (Number.isFinite(s.maximumHeightAboveBedM) && q.y - g.heightAt(q.x, q.z) > s.maximumHeightAboveBedM))) return false;
  if (s.kind === 'ray' && points.some(q => { const support = g.supportAt(q.x, q.z); return support.elementId !== null || support.substrate !== 'sediment'; })) return false;
  if (checkPlants) { const plants = elements ?? kelpWaterElements(g, r.cx, r.cz); if (!r.sim || !environment) return false;
    for (const dt of future ? [0, .1, .2, M.predictionSec] : [0]) { const env = { ...environment }, current = env.currentMps ?? .18; env.deformationCurrentMps = current + ((env.deformationCurrentMps ?? current) - current) * Math.exp(-dt / 4); if (!plantsClear(g, r, pose, timeSec + dt, env, plants)) return false; }
  }
  return !occupancy || peersClear(r, pose, extra);
}
/** Geometry-only eligibility can be queried before stocks, agents or clocks exist. */
export function kelpNearBottomLifeRole(g, cx, cz) { const r = { id: `${cx},${cz}`, cx, cz }; if (!geometryOwner(g, r) || randomFor(g, r)('role') >= M.allocationProbability) return false;
  return [.3, .7].some(u => [.3, .7].some(v => { const x = (cx + u) * SIZE, z = (cz + v) * SIZE, depth = g.surfaceY - g.heightAt(x, z); return owns(r, { x, y: 0, z }) && depth > 3.5 && depth < 18; })); }
function nativePatches(r) { return [...r.sim.rockPatches.map(p => ({ ...p, sourceType: 'native-rock' })), ...r.sim.floorPatches.map(p => ({ ...p, sourceType: 'native-floor' }))]; }
function foodSite(g, r, p) { if (!vector(p.position) || !owns(r, p.position)) return null; const bed = g.heightAt(p.position.x, p.position.z); if (!close(bed, p.position.y)) return null;
  return { id: `kelp-near-bottom-food:${r.id}:${p.id}`, nativePatchId: p.id, sourceType: p.sourceType, pool: POOL, heightM: M.foodHeightM, position: { x: p.position.x, y: bed + M.foodHeightM, z: p.position.z }, amount: 0 }; }
function candidate(g, r, id, p, attempt, extra, elements) { const s = kelpNearBottomLifeSpeciesById[id], random = randomFor(g, r), heading = (random(`${id}:${p.id}:phase`) + attempt / 16) * TAU,
    sizeM = s.sizeRangeM[0] + random(`${id}:size`) * (s.sizeRangeM[1] - s.sizeRangeM[0]), pitch = ['crab', 'ray'].includes(s.kind) ? 0 : -.06,
    a = { id: `kelp-near-bottom:${r.id}:${id}`, speciesId: id, sizeM, alive: true, heading, pitch, supportNormal: { x: 0, y: 1, z: 0 }, nutritionPool: POOL };
  if (id === 'round-stingray' && p.sourceType !== 'native-floor') return null;
  if (id === 'gopher-rockfish' && p.sourceType !== 'native-rock') return null;
  const mouth = offset(a, s.morphology.feedingPointLocal, heading, pitch), ring = s.kind === 'crab' ? .18 : .5,
    x = p.position.x - mouth.x - Math.cos(heading) * ring, z = p.position.z - mouth.z - Math.sin(heading) * ring,
    pose = physicalPose(g, a, x, z, heading, pitch);
  if (!pose) return null; Object.assign(a, pose);
  if (!kelpNearBottomLifePositionValid(g, r, a, a.position, heading, pitch, { occupancy: true, extra, elements })) return null;
  if (!feedingApproach(g, r, a, p, elements, extra)) return null;
  return { ...a, siteId: `${p.id}:${attempt}`, kelpNearBottomSiteId: `${p.id}:${attempt}`, kelpNearBottomFoodPatchId: p.id, home: clone(a.position), habitat: 'native-kelp-near-bottom' };
}
export function createKelpNearBottomLifePlan(g, r, { availableSlots = 0, maxAdded = 4, role = kelpNearBottomLifeRole(g, r?.cx, r?.cz) } = {}) {
  const empty = { version: 1, role: Boolean(role), placements: [], foodPatches: [] }; if (!nativeOwner(g, r) || !role) return freeze(empty);
  const limit = Math.min(4, Math.max(0, Math.floor(Number.isFinite(availableSlots) ? availableSlots : 0)), Math.max(0, Math.floor(Number.isFinite(maxAdded) ? maxAdded : 0))), random = randomFor(g, r),
    sites = nativePatches(r).map(p => foodSite(g, r, p)).filter(Boolean).sort((a, b) => random(`site:${a.id}`) - random(`site:${b.id}`)), placements = [], used = [], elements = kelpWaterElements(g, r.cx, r.cz);
  for (const id of KELP_NEAR_BOTTOM_LIFE_IDS) { if (placements.length >= limit) break; let done = false;
    for (const p of sites) { for (let attempt = 0; attempt < 16; attempt++) { const a = candidate(g, r, id, p, attempt, placements, elements); if (!a) continue; placements.push(a); if (!used.some(q => q.id === p.id)) used.push(p); done = true; break; } if (done) break; }
  }
  return freeze({ version: 1, role: Boolean(role), placements, foodPatches: used });
}
const freshLedger = () => ({ initial: 0, input: 0, ingested: 0, exported: 0 });
export function initializeKelpNearBottomLife(g, r, { fresh = false, role = kelpNearBottomLifeRole(g, r?.cx, r?.cz), capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !nativeOwner(g, r) || r.sim._ticks !== 0 || r.sim.timeSec !== 0 || marked(r) || allOld(r).some(a => isKelpNearBottomLifeAgent(a) || marked(a)) || typeof role !== 'boolean' || role !== kelpNearBottomLifeRole(g, r.cx, r.cz) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || oldResidents(r).length > capacity) return false;
  const plan = createKelpNearBottomLifePlan(g, r, { availableSlots: capacity - oldResidents(r).length, maxAdded, role }), random = randomFor(g, r);
  r.kelpNearBottomLifeAgents = plan.placements.map(p => ({ ...clone(p), kelpNearBottomIndividualVersion: 1, regionId: r.id, createdAtSec: 0, timeSec: 0, state: 'foraging', stateSince: 0, energy: .68 + random(`${p.id}:condition`) * .12,
    target: clone(p.position), targetHeading: p.heading, targetPitch: p.pitch, targetNormal: clone(p.supportNormal), velocity: { x: 0, y: 0, z: 0 }, travelledM: 0, nextDecision: 0, decisions: 0, nextBite: 0, feedingCount: 0, consumedUnits: 0, lastFeedAt: null, lastNearBottomIntake: null,
    foodScope: KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE, conditionScope: CONDITION, localEnvironment: clone(r.sim.environment) }));
  r.kelpNearBottomLifeVersion = 1; r.kelpNearBottomLifeInitializedAtSec = 0; r.kelpNearBottomLife = { version: 1, role, scope: M.note, foodScope: KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE, birthPlacements: clone(plan.placements), addedIds: plan.placements.map(p => p.id),
    foodPatches: clone(plan.foodPatches), foodLedger: { ...freshLedger(), byPool: { [POOL]: freshLedger() } }, lastTickSec: 0, counters: { ticks: 0, feedings: 0, consumedUnits: 0, deaths: 0 }, events: [] };
  r.kelpNearBottomEnergyLedger = { initial: r.kelpNearBottomLifeAgents.reduce((n, a) => n + a.energy, 0), feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 }; return true;
}
export function captureKelpNearBottomLife(r) { return Object.hasOwn(r, 'kelpNearBottomLifeVersion') ? Object.fromEntries(FIELDS.map(k => [k, clone(r[k])])) : {}; }
export function kelpNearBottomLifeFoodBudgetError(r) { const d = r?.kelpNearBottomLife; if (!d) return 0; const stock = d.foodPatches.reduce((n, p) => n + p.amount, 0), l = d.foodLedger, p = l.byPool[POOL]; return Math.max(Math.abs(stock - (l.initial + l.input - l.ingested - l.exported)), Math.abs(stock - (p.initial + p.input - p.ingested - p.exported))); }
export const kelpNearBottomLifeBudgetError = kelpNearBottomLifeFoodBudgetError;
export function kelpNearBottomLifeEnergyBudgetError(r) { const l = r?.kelpNearBottomEnergyLedger; if (!l) return 0; return (r.kelpNearBottomLifeAgents ?? []).reduce((n, a) => n + a.energy, 0) - (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection - l.deathLoss); }
function patchFor(r, a) { return r.kelpNearBottomLife.foodPatches.find(p => p.id === a.kelpNearBottomFoodPatchId); }
function inputFood(r, dt) { const d = r.kelpNearBottomLife, supply = r.sim.environment.foodSupply; for (const p of d.foodPatches) {
  const input = M.inputPerPatchSec * supply * dt; p.amount += input; d.foodLedger.input += input; d.foodLedger.byPool[POOL].input += input;
  const out = Math.max(0, p.amount - M.maximumPatchStock) + Math.min(p.amount, M.maximumPatchStock) * (1 - Math.exp(-M.exportFractionPerSec * dt)); p.amount -= out; d.foodLedger.exported += out; d.foodLedger.byPool[POOL].exported += out;
} }
function feedingApproach(g, r, a, p, elements, extra = []) { for (let i = 0; i < 12; i++) { const heading = a.heading + i * TAU / 12, pitch = ['crab', 'ray'].includes(sourceOf(a).kind) ? 0 : -.06, q = offset(a, sourceOf(a).morphology.feedingPointLocal, heading, pitch), pose = physicalPose(g, a, p.position.x - q.x, p.position.z - q.z, heading, pitch);
  if (!pose) continue; const candidate = { ...a, ...pose }; if (gap(kelpNearBottomLifeFeedingPosition(candidate), p.position) > M.maximumFoodDistanceM || !kelpNearBottomLifePositionValid(g, r, candidate, candidate.position, heading, pitch, { occupancy: true, elements, extra })) continue; return pose;
} return null; }
const setState = (a, state, clock) => { if (a.state !== state) { a.state = state; a.stateSince = clock; } };
function move(g, r, a, dt, elements) { const previous = clone(a.position), startH = a.heading, startT = a.pitch, turn = Math.atan2(Math.sin(a.targetHeading - startH), Math.cos(a.targetHeading - startH)), h = startH + clamp(turn, -M.maximumTurnRadSec * dt, M.maximumTurnRadSec * dt), t = startT + clamp(a.targetPitch - startT, -M.maximumPitchTurnRadSec * dt, M.maximumPitchTurnRadSec * dt), d = gap(previous, a.target), step = Math.min(d, M.traits[a.speciesId].speedMps * dt);
  for (const scale of [1, .5, .25, 0]) { const p = Object.fromEntries(['x', 'y', 'z'].map(k => [k, previous[k] + (d > 0 ? (a.target[k] - previous[k]) / d * step * scale : 0)])), actualH = startH + (h - startH) * scale, actualT = startT + (t - startT) * scale,
      pose = physicalPose(g, a, p.x, p.z, actualH, actualT); if (!pose || gap(pose.position, previous) > (M.traits[a.speciesId].speedMps + 1e-8) * dt) continue;
    let valid = true; for (const f of [0, .5, 1]) { const x = previous.x + (pose.position.x - previous.x) * f, z = previous.z + (pose.position.z - previous.z) * f,
      mid = physicalPose(g, a, x, z, startH + (actualH - startH) * f, startT + (actualT - startT) * f);
      if (!mid || !kelpNearBottomLifePositionValid(g, r, { ...a, ...mid }, mid.position, mid.heading, mid.pitch, { occupancy: true, elements })) { valid = false; break; } }
    if (valid) { Object.assign(a, pose); break; }
  }
  a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (a.position[k] - previous[k]) / dt])); const travelled = gap(previous, a.position); a.travelledM += travelled; return travelled;
}
function intakeValid(a, r, g) { const w = a.lastNearBottomIntake; if (w === null) return a.lastFeedAt === null && a.feedingCount === 0 && a.consumedUnits === 0; const p = patchFor(r, a);
  if (!w || !p || w.ownerId !== r.id || w.patchId !== p.id || w.nativePatchId !== p.nativePatchId || w.pool !== POOL || w.scope !== KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE || w.unit !== 'relative-organic-food-proxy-unit' || w.allowedDistanceM !== M.maximumFoodDistanceM || !nonnegative(w.timeSec) || w.timeSec !== a.lastFeedAt || w.timeSec > a.timeSec || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(k => nonnegative(w[k])) || w.removedUnits <= 0 || w.removedUnits > M.biteAmount + 1e-10 || !close(w.stockBefore - w.stockAfter, w.removedUnits) || w.energyBefore > 1 || !close(w.energyAfter, Math.min(1, w.energyBefore + w.removedUnits * M.energyGainPerUnit)) || !['agentPosition', 'feedingPosition', 'foodPosition', 'supportNormal'].every(k => vector(w[k])) || !Number.isFinite(w.heading) || !Number.isFinite(w.pitch) || !close(gap(w.feedingPosition, w.foodPosition), w.contactDistanceM) || w.contactDistanceM > M.maximumFoodDistanceM + 1e-10 || !['x', 'y', 'z'].every(k => close(w.foodPosition[k], p.position[k]))) return false;
  const historical = { ...a, position: w.agentPosition, heading: w.heading, pitch: w.pitch, supportNormal: w.supportNormal }; if (!kelpNearBottomLifePositionValid(g, r, historical, historical.position, historical.heading, historical.pitch, { checkPlants: false })) return false; const mouth = kelpNearBottomLifeFeedingPosition(historical); return ['x', 'y', 'z'].every(k => close(mouth[k], w.feedingPosition[k]));
}
function validate(raw, r, g, capacity, pending = false) { const old = [...(raw?.state?.agents ?? r?.sim?.agents ?? []), ...(raw?.waterAgents ?? r?.waterAgents ?? []), ...(raw?.visitorAgents ?? r?.visitorAgents ?? []), ...(raw?.kelpBenthicAgents ?? r?.kelpBenthicAgents ?? []), ...(raw?.kelpWaterLifeAgents ?? r?.kelpWaterLifeAgents ?? [])];
  if (marked(raw?.state) || old.some(a => isKelpNearBottomLifeAgent(a) || marked(a))) return false; if (!marked(raw)) return true;
  if (!nativeOwner(g, r) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || Object.keys(raw).some(k => k.startsWith('kelpNearBottom') && !FIELDS.includes(k)) || !FIELDS.every(k => Object.hasOwn(raw, k)) || raw.kelpNearBottomLifeVersion !== 1 || raw.kelpNearBottomLifeInitializedAtSec !== 0 || !Array.isArray(raw.kelpNearBottomLifeAgents) || raw.kelpNearBottomLifeAgents.length > 4 || old.filter(a => a.speciesId !== 'giant-kelp').length + raw.kelpNearBottomLifeAgents.length > capacity) return false;
  const d = raw.kelpNearBottomLife, agents = raw.kelpNearBottomLifeAgents, l = raw.kelpNearBottomEnergyLedger, clock = (r.sim._ticks - (pending ? 1 : 0)) * .1, candidate = { ...r, kelpNearBottomLife: d, kelpNearBottomLifeAgents: agents, kelpNearBottomEnergyLedger: l };
  if (clock < 0 || !d || marked(d) || d.version !== 1 || typeof d.role !== 'boolean' || d.role !== kelpNearBottomLifeRole(g, r.cx, r.cz) || (!d.role && agents.length) || d.scope !== M.note || d.foodScope !== KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE || d.lastTickSec !== clock || !Array.isArray(d.birthPlacements) || !Array.isArray(d.addedIds) || d.birthPlacements.length !== agents.length || d.addedIds.length !== agents.length || new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.speciesId)).size !== agents.length || !Array.isArray(d.events) || d.events.length > 40 || !Array.isArray(d.foodPatches) || d.foodPatches.length > M.maximumFoodPatches || new Set(d.foodPatches.map(p => p?.id)).size !== d.foodPatches.length || !['ticks', 'feedings', 'deaths'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || d.counters.ticks * .1 !== clock || !nonnegative(d.counters.consumedUnits) || d.counters.deaths !== agents.filter(a => a?.alive === false).length || !l || !['initial', 'feedingGain', 'maintenanceAndMotionDebit', 'deathLoss'].every(k => nonnegative(l[k])) || !Number.isFinite(l.clampCorrection) || l.clampCorrection > 0 || !close(l.feedingGain, d.counters.consumedUnits * M.energyGainPerUnit) || Math.abs(kelpNearBottomLifeEnergyBudgetError(candidate)) > 1e-8) return false;
  const fl = d.foodLedger, pl = fl?.byPool?.[POOL]; if (!fl || !pl || Object.keys(fl.byPool).length !== 1 || !['initial', 'input', 'ingested', 'exported'].every(k => nonnegative(fl[k]) && nonnegative(pl[k]) && close(fl[k], pl[k])) || fl.initial !== 0 || !close(fl.ingested, d.counters.consumedUnits)) return false;
  const original = nativePatches(r); for (const p of d.foodPatches) { const native = original.find(n => n.id === p?.nativePatchId), expected = native && foodSite(g, r, native); if (!expected || p.id !== expected.id || p.pool !== POOL || p.sourceType !== expected.sourceType || p.heightM !== M.foodHeightM || !vector(p.position) || !['x', 'y', 'z'].every(k => close(p.position[k], expected.position[k])) || !nonnegative(p.amount) || p.amount > M.maximumPatchStock + 1e-10 || !agents.some(a => a.kelpNearBottomFoodPatchId === p.id) || marked(p)) return false; }
  if (kelpNearBottomLifeFoodBudgetError(candidate) > 1e-8 || !Number.isFinite(r.sim.environment.foodSupply) || r.sim.environment.foodSupply < 0 || r.sim.environment.foodSupply > 3 || !nonnegative(r.sim.environment.currentMps) || r.sim.environment.currentMps > 1.2) return false;
  const ids = new Set(old.map(a => a?.id)), random = randomFor(g, r); let fed = 0, consumed = 0, initial = 0;
  for (const a of agents) { const birth = d.birthPlacements.find(p => p?.id === a?.id), s = sourceOf(a), p = d.foodPatches.find(p => p.id === a?.kelpNearBottomFoodPatchId); if (!birth || !s || !p || ids.has(a.id) || a.id !== `kelp-near-bottom:${r.id}:${s.id}` || a.regionId !== r.id || a.kelpNearBottomIndividualVersion !== 1 || Object.keys(a).some(k => k.startsWith('kelpNearBottom') && !AGENT_FIELDS.includes(k)) || oldMarked(a) || a.kelpNearBottomSiteId !== birth.siteId || a.kelpNearBottomFoodPatchId !== birth.kelpNearBottomFoodPatchId || a.speciesId !== birth.speciesId || !close(a.sizeM, s.sizeRangeM[0] + random(`${s.id}:size`) * (s.sizeRangeM[1] - s.sizeRangeM[0])) || !close(a.sizeM, birth.sizeM) || a.nutritionPool !== POOL || a.createdAtSec !== 0 || !nonnegative(a.timeSec) || a.timeSec > clock || typeof a.alive !== 'boolean' || (a.alive && a.timeSec !== clock) || (!a.alive && (a.state !== 'dead' || a.energy !== 0 || a.stateSince !== a.timeSec || gap(a.velocity, { x: 0, y: 0, z: 0 }) > 1e-10)) || (a.alive && !['foraging', 'searching', 'resting'].includes(a.state)) || !nonnegative(a.stateSince) || a.stateSince > a.timeSec || !nonnegative(a.energy) || a.energy > 1 || !vector(a.home) || !['x', 'y', 'z'].every(k => close(a.home[k], birth.position[k])) || !vector(a.velocity) || Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > M.traits[s.id].speedMps + 1e-8 || !vector(a.supportNormal) || !vector(a.targetNormal) || !nonnegative(a.travelledM) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 || !Number.isSafeInteger(a.feedingCount) || a.feedingCount < 0 || !nonnegative(a.consumedUnits) || !nonnegative(a.nextBite) || !nonnegative(a.nextDecision) || a.foodScope !== KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE || a.conditionScope !== CONDITION || !intakeValid(a, candidate, g) || !kelpNearBottomLifePositionValid(g, candidate, a, a.position, a.heading, a.pitch, { future: false, checkPlants: a.alive }) || !kelpNearBottomLifePositionValid(g, candidate, { ...a, supportNormal: a.targetNormal }, a.target, a.targetHeading, a.targetPitch, { checkPlants: false }) || !kelpNearBottomLifePositionValid(g, candidate, { ...a, supportNormal: birth.supportNormal }, birth.position, birth.heading, birth.pitch, { checkPlants: false })) return false;
    ids.add(a.id); fed += a.feedingCount; consumed += a.consumedUnits; initial += .68 + random(`${a.id}:condition`) * .12;
  }
  return close(l.initial, initial) && fed === d.counters.feedings && close(consumed, d.counters.consumedUnits) && d.addedIds.every(id => agents.some(a => a.id === id)) && d.events.every(e => nonnegative(e?.timeSec) && e.timeSec <= clock && agents.some(a => a.id === e.agentId) && ['feeding', 'death'].includes(e.type));
}
export function validateKelpNearBottomLifeRecord(record, region, { generator, capacity = 20, pending = false } = {}) { try { return validate(record, region, generator, capacity, pending); } catch { return false; } }
export function tickKelpNearBottomLife(r, g, dt) { if (!nativeOwner(g, r) || dt !== .1 || r.kelpNearBottomLifeVersion !== 1 || r.sim._ticks !== (r.kelpNearBottomLife?.counters?.ticks ?? -2) + 1 || !validateKelpNearBottomLifeRecord(r, r, { generator: g, capacity: 20, pending: true })) return false;
  const d = r.kelpNearBottomLife, l = r.kelpNearBottomEnergyLedger, clock = r.sim._ticks * .1, random = randomFor(g, r), elements = kelpWaterElements(g, r.cx, r.cz); inputFood(r, dt); d.lastTickSec = clock; d.counters.ticks++;
  for (const a of r.kelpNearBottomLifeAgents) { if (!a.alive) continue; a.timeSec = clock; a.localEnvironment = clone(r.sim.environment); const p = patchFor(r, a), approach = feedingApproach(g, r, a, p, elements), mouth = kelpNearBottomLifeFeedingPosition(a);
    if (gap(mouth, p.position) <= M.maximumFoodDistanceM && clock >= a.nextBite) { const removed = Math.min(p.amount, M.biteAmount); if (removed > 0) { const before = p.amount, energy = a.energy; p.amount -= removed; d.foodLedger.ingested += removed; d.foodLedger.byPool[POOL].ingested += removed; a.energy = Math.min(1, energy + removed * M.energyGainPerUnit); l.feedingGain += removed * M.energyGainPerUnit; l.clampCorrection += Math.min(0, 1 - energy - removed * M.energyGainPerUnit);
        a.feedingCount++; a.consumedUnits += removed; a.lastFeedAt = clock; a.nextBite = clock + M.biteIntervalSec; d.counters.feedings++; d.counters.consumedUnits += removed;
        a.lastNearBottomIntake = { timeSec: clock, ownerId: r.id, patchId: p.id, nativePatchId: p.nativePatchId, pool: POOL, stockBefore: before, stockAfter: p.amount, removedUnits: removed, energyBefore: energy, energyAfter: a.energy, agentPosition: clone(a.position), heading: a.heading, pitch: a.pitch, supportNormal: clone(a.supportNormal), feedingPosition: clone(mouth), foodPosition: clone(p.position), contactDistanceM: gap(mouth, p.position), allowedDistanceM: M.maximumFoodDistanceM, unit: 'relative-organic-food-proxy-unit', scope: KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE };
        d.events.push({ type: 'feeding', agentId: a.id, timeSec: clock, amount: removed });
      } }
    if (clock >= a.nextDecision || gap(a.position, a.target) < .02) { let target = null;
      if (a.nextBite <= clock && approach) target = approach;
      else for (let i = 0; i < 8; i++) { const phase = random(`${a.id}:walk:${a.decisions}:${i}`) * TAU, radius = .25 + random(`${a.id}:radius:${a.decisions}:${i}`) * .35, x = a.home.x + Math.cos(phase) * radius, z = a.home.z + Math.sin(phase) * radius, heading = Math.atan2(z - a.position.z, x - a.position.x), pose = physicalPose(g, a, x, z, heading, sourceOf(a).kind === 'fish' || sourceOf(a).kind === 'shark' ? -.04 : 0);
        if (pose && kelpNearBottomLifePositionValid(g, r, { ...a, ...pose }, pose.position, pose.heading, pose.pitch, { occupancy: true, elements })) { target = pose; break; } }
      if (target) { a.target = clone(target.position); a.targetHeading = target.heading; a.targetPitch = target.pitch; a.targetNormal = clone(target.supportNormal); } a.decisions++; a.nextDecision = clock + 3; setState(a, approach && p.amount > 0 ? 'foraging' : 'searching', clock);
    }
    const travelled = move(g, r, a, dt, elements), debit = Math.min(a.energy, dt * (M.maintenanceDebitPerSec + M.flowDebitPerSec * r.sim.environment.currentMps) + travelled * M.motionDebitPerM); a.energy -= debit; l.maintenanceAndMotionDebit += debit;
    if (a.energy <= 1e-9) { l.deathLoss += a.energy; a.energy = 0; a.alive = false; setState(a, 'dead', clock); a.velocity = { x: 0, y: 0, z: 0 }; d.counters.deaths++; d.events.push({ type: 'death', agentId: a.id, timeSec: clock }); }
  }
  d.events = d.events.slice(-40); return true;
}
export function kelpNearBottomLifeSnapshot(r) { if (!r?.kelpNearBottomLife) return null; const d = r.kelpNearBottomLife; return { version: 1, scope: M.note, foodScope: KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE, agents: clone(r.kelpNearBottomLifeAgents),
  resources: { [POOL]: d.foodPatches.reduce((n, p) => n + p.amount, 0) }, foodLedger: clone(d.foodLedger), energyLedger: clone(r.kelpNearBottomEnergyLedger), counters: clone(d.counters), foodPatches: clone(d.foodPatches), foodBalanceError: kelpNearBottomLifeFoodBudgetError(r), energyBalanceError: kelpNearBottomLifeEnergyBudgetError(r) }; }
