import { kelpUnderstoryLifeSpeciesCatalog, kelpUnderstoryLifeSpeciesById } from './kelpUnderstoryLifeSpecies.js';
import { kelpWaterElements } from './kelpWaterCommunity.js';

export const KELP_UNDERSTORY_LIFE_VERSION = 1;
export const KELP_UNDERSTORY_LIFE_IDS = Object.freeze(kelpUnderstoryLifeSpeciesCatalog.map(s => s.id));
export const KELP_UNDERSTORY_LIFE_PLANT_IDS = Object.freeze(kelpUnderstoryLifeSpeciesCatalog.filter(s => s.kind === 'kelp').map(s => s.id));
export const KELP_UNDERSTORY_LIFE_ANIMAL_IDS = Object.freeze(kelpUnderstoryLifeSpeciesCatalog.filter(s => s.kind !== 'kelp').map(s => s.id));
export const KELP_UNDERSTORY_LIFE_FOOD_SCOPE = 'Independent zero-initialized bounded local upstream suspendedOrganicFood control volumes: selected unresolved suspended microalgal/organic-particle nutrition, with foodSupply/current-dependent external input, constant-Y positive-X transport, actual incurrent pore/siphon contact and accounted support-hit/outlet export. Not mouths, relocated host prey, DOM uptake, measured plankton, complete natural diets or animal/plant biomass.';
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const KELP_UNDERSTORY_LIFE_MODEL = freeze({ maximumAdded: 4, maximumPlants: 12, allocationProbability: .70,
  maximumChannels: 4, maximumParcels: 32, maximumParcelsPerChannel: 4, sourceDistanceM: .6, outletDistanceM: .6,
  sourceReleaseIntervalTicks: 20, sourceInputUnitsPerSec: .00004, referenceFlowMps: .18, maximumParcelAmount: .0016,
  transportProbeSpacingM: .01, wholeBodyClearanceM: .003, maximumFootGapM: .018, minimumNormalY: .94,
  maximumFoodDistanceM: .045, biteAmount: .00012, biteIntervalSec: 5, energyGainPerUnit: 2,
  maintenanceDebitPerSec: .000018, flowDebitPerSec: .000025,
  note: 'Persistent attached scenery plants are not simulated biomass; independent fixed sponge/tunicate representatives have native clocks and relative condition. Selected sizes, source/input/transport/intake and rates are uncalibrated. Full conservative forms and holdfast probes use actual rocks and maximal native kelp sweep. Birth reserves old animal bodies, home/target/patrol references and selected home extents; legacy controllers are unchanged and unknown future trajectories can still approach new scenery, so no global collision proof. No recruitment, migration, offline growth, original-stock transfer or refill.',
});
const M = KELP_UNDERSTORY_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2, POOL = 'suspendedOrganicFood', CONDITION = 'dimensionless relative condition; independent ledger, not biomass or food inventory';
const FIELDS = ['kelpUnderstoryLifeVersion', 'kelpUnderstoryLifeInitializedAtSec', 'kelpUnderstoryLife', 'kelpUnderstoryLifeAgents', 'kelpUnderstoryEnergyLedger'];
const AGENT_FIELDS = ['kelpUnderstoryIndividualVersion', 'kelpUnderstorySiteId', 'kelpUnderstoryHostId', 'kelpUnderstoryFoodChannelId'];
const PLANT_FIELDS = ['kelpUnderstoryPlantVersion', 'kelpUnderstorySiteId', 'kelpUnderstoryHostId'];
const clone = x => structuredClone(x), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), plus = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const marked = x => x && Object.keys(x).some(k => k.startsWith('kelpUnderstory'));
const oldMarked = x => x && Object.keys(x).some(k => k.startsWith('kelpBenthic') || k.startsWith('kelpWaterLife') || k.startsWith('kelpNearBottom') || k.startsWith('deep'));
const exactKeys = (x, keys) => x && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const sourceOf = a => kelpUnderstoryLifeSpeciesById[a?.speciesId];
export const isKelpUnderstoryLifeAgent = a => KELP_UNDERSTORY_LIFE_ANIMAL_IDS.includes(a?.speciesId);
export const isKelpUnderstoryLifePlant = a => KELP_UNDERSTORY_LIFE_PLANT_IDS.includes(a?.speciesId);
const isSpecies = a => KELP_UNDERSTORY_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`kelp-understory-life-v1|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const geometryOwner = (g, r) => g?.supportVersion === 2 && typeof g.chunk === 'function' && typeof g.heightAt === 'function' && typeof g.supportAt === 'function' && Number.isFinite(g.surfaceY) && Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`;
const nativeOwner = (g, r) => geometryOwner(g, r) && r.sim && Array.isArray(r.sim.agents) && Number.isSafeInteger(r.sim._ticks) && r.sim._ticks >= 0 && close(r.sim.timeSec, r.sim._ticks * .1);
const allOld = r => [...(r.sim?.agents ?? []), ...(r.waterAgents ?? []), ...(r.visitorAgents ?? []), ...(r.kelpBenthicAgents ?? []), ...(r.kelpWaterLifeAgents ?? []), ...(r.kelpNearBottomLifeAgents ?? [])];
const oldResidents = r => allOld(r).filter(a => a.speciesId !== 'giant-kelp');
const owns = (r, p, margin = .5) => vector(p) && p.x >= r.cx * SIZE + margin && p.x <= (r.cx + 1) * SIZE - margin && p.z >= r.cz * SIZE + margin && p.z <= (r.cz + 1) * SIZE - margin && Math.hypot(p.x, p.z) > 46;
function bodyFrame(normal, heading) {
  if (!vector(normal) || !Number.isFinite(heading)) return null; const n = Math.hypot(normal.x, normal.y, normal.z); if (!(n > 0)) return null;
  const up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / n])), d = Math.cos(heading) * up.x + Math.sin(heading) * up.z,
    forward = { x: Math.cos(heading) - d * up.x, y: -d * up.y, z: Math.sin(heading) - d * up.z }, length = Math.hypot(forward.x, forward.y, forward.z); if (length < 1e-9) return null;
  for (const k of ['x', 'y', 'z']) forward[k] /= length;
  return { forward, up, side: { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x } };
}
const offset = (f, p, size) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, size * (f.forward[k] * p.x + f.up[k] * p.y + f.side[k] * p.z)]));
export function kelpUnderstoryLifeBodyPoints(a, root = a?.position) {
  const e = sourceOf(a)?.normalizedEnvelope, f = bodyFrame(a?.supportNormal, a?.heading); if (!e || !f || !vector(root) || !(a.sizeM > 0)) return [];
  const out = []; for (const x of [e.x[0], (e.x[0] + e.x[1]) / 2, e.x[1]]) for (const y of [e.y[0], (e.y[0] + e.y[1]) / 2, e.y[1]]) for (const z of [e.z[0], (e.z[0] + e.z[1]) / 2, e.z[1]]) out.push(plus(root, offset(f, { x, y, z }, a.sizeM))); return out;
}
export function kelpUnderstoryLifeBounds(a) { const points = kelpUnderstoryLifeBodyPoints(a); return points.length ? Object.fromEntries(['x', 'y', 'z'].map(k => [k, [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))]])) : null; }
export function kelpUnderstoryLifePointClearance(p, a) { const b = kelpUnderstoryLifeBounds(a); if (!vector(p) || !b) return -Infinity; return Math.hypot(...['x', 'y', 'z'].map(k => Math.max(b[k][0] - p[k], 0, p[k] - b[k][1]))); }
export function kelpUnderstoryLifeFeedingPosition(a) { const f = bodyFrame(a?.supportNormal, a?.heading), s = sourceOf(a), ref = s?.foodCapturePointLocal ?? s?.morphology?.foodCapturePointLocal ?? s?.morphology?.feedingPointLocal; return isKelpUnderstoryLifeAgent(a) && f && vector(a.position) && vector(ref) ? plus(a.position, offset(f, ref, a.sizeM)) : null; }
function supportedPose(g, r, a, x, z) {
  const native = g.supportAt(x, z), f = bodyFrame(native.normal, a.heading), e = sourceOf(a)?.normalizedEnvelope, hostId = a.kelpUnderstoryHostId ?? a.hostId;
  if (!f || !e || native.substrate !== 'rock' || native.elementId !== hostId || f.up.y < M.minimumNormalY || !nonnegative(e.footprintRadiusUnits)) return null;
  let min = Infinity, max = -Infinity, y = native.height + M.wholeBodyClearanceM;
  const refs = [{ x: 0, y: 0, z: 0 }, ...Array.from({ length: 12 }, (_, i) => ({ x: Math.cos(i * TAU / 12) * e.footprintRadiusUnits, y: 0, z: Math.sin(i * TAU / 12) * e.footprintRadiusUnits })), ...(sourceOf(a).support?.footprintContactPointsLocal ?? [])];
  for (const ref of refs) { const q = offset(f, ref, a.sizeM), p = g.supportAt(x + q.x, z + q.z);
    if (p.substrate !== 'rock' || p.elementId !== hostId || !Number.isFinite(p.height)) return null; min = Math.min(min, p.height - q.y); max = Math.max(max, p.height - q.y); y = Math.max(y, p.height - q.y + M.wholeBodyClearanceM); }
  if (max - min > M.maximumFootGapM || y - native.height > M.maximumFootGapM + M.wholeBodyClearanceM) return null;
  const pose = { position: { x, y, z }, supportNormal: f.up, supportOffset: y - native.height }, trial = { ...a, ...pose }, [lo, hi] = sourceOf(a).depthSelectionM;
  if (kelpUnderstoryLifeBodyPoints(trial).some(p => !owns(r, p) || p.y < g.heightAt(p.x, p.z) - 1e-8 || g.surfaceY - p.y < lo || g.surfaceY - p.y > hi)) return null; return pose;
}
// Same conservative authored stipe sweep used by the existing bottom kits.
// It includes all clocks/allowed flows and the lowest reachable blade.
function plantSweepRadius(anchor, highY) { const high = Math.max(0, highY - anchor.y), length = anchor.lengthM * .94; if (!(length > 0)) return 4.8;
  const horizontal = u => 2.3 * u ** 5 + (u < .5 ? 1.12 * u * (1 - u) : .28) + .284 * u + .648 * u ** 1.8 + .715 * u ** 2; let radius = 4;
  for (let i = 0; i < 5; i++) radius = horizontal(Math.min(1, Math.sqrt(high * high + radius * radius) / length));
  const lowestBlade = Math.sqrt(Math.max(0, (length * .1) ** 2 - horizontal(.1) ** 2)); return radius + .025 + (high >= lowestBlade - .75 ? .75 : 0);
}
function vegetationClear(g, r, a, elements = null) { const b = kelpUnderstoryLifeBounds(a), radius = Math.max(...kelpUnderstoryLifeBodyPoints(a).map(p => Math.hypot(p.x - a.position.x, p.z - a.position.z)));
  for (const p of r.understoryPlants ?? []) if (b.y[1] >= p.y - .02 && b.y[0] <= p.y + p.heightM + .02 && Math.hypot(a.position.x - p.x, a.position.z - p.z) < radius + p.radiusM + .025) return false;
  for (const e of elements ?? kelpWaterElements(g, r.cx, r.cz)) { const plant = r.sim?.agents?.find(p => p.speciesId === 'giant-kelp' && p.sceneryId === e.id), anchor = plant ? r.sim.getKelpAnchor(plant.id) : e.anchor;
    if (!anchor || b.y[1] < anchor.y - .04 || b.y[0] > anchor.y + anchor.lengthM + .8) continue;
    if (Math.hypot(a.position.x - anchor.x, a.position.z - anchor.z) < radius + (plant ? plantSweepRadius(anchor, b.y[1]) : 3.8)) return false;
  } return true;
}
function boxesOverlap(a, b, margin = .025) { return ['x', 'y', 'z'].every(k => a[k][1] + margin > b[k][0] && b[k][1] + margin > a[k][0]); }
function segmentBox(a, b, box, radius) { let low = 0, high = 1; for (const k of ['x', 'y', 'z']) { const d = b[k] - a[k], min = box[k][0] - radius, max = box[k][1] + radius;
  if (Math.abs(d) < 1e-12) { if (a[k] < min || a[k] > max) return false; continue; } let l = (min - a[k]) / d, h = (max - a[k]) / d; if (l > h) [l, h] = [h, l]; low = Math.max(low, l); high = Math.min(high, h); if (low > high) return false; } return true; }
function reservations(r) { return oldResidents(r).filter(a => a.alive && vector(a.position)).map(a => {
  const points = [a.position, a.home, a.target, a.schoolHome, ...(a.patrolWaypoints ?? [])].filter(vector).map(clone), extent = a.kelpWaterLifeIndividualVersion === 1 ? 4.5 : a.kelpNearBottomIndividualVersion === 1 ? 3 : a.kelpBenthicIndividualVersion === 1 ? .5 : 0;
  const radiusM = (a.speciesId === 'pacific-sea-nettle' ? 8.6 : a.speciesId === 'california-market-squid' ? 1.7 : 1.25) * (a.sizeM ?? .2) + extent + .08;
  if (vector(a.schoolHome) && Number.isFinite(a.orbitRadiusM)) return { agentId: a.id, points: [clone(a.schoolHome)], radiusM: radiusM + a.orbitRadiusM + (a.schoolRadiusM ?? 0), scope: 'birth-known-body-home-target-patrol-reference' };
  return { agentId: a.id, points, radiusM, scope: 'birth-known-body-home-target-patrol-reference' };
}); }
function reservedClear(a, paths) { const b = kelpUnderstoryLifeBounds(a); return paths.every(p => p.points.every(q => !segmentBox(q, q, b, p.radiusM)) && p.points.every((q, i) => !i || !segmentBox(p.points[i - 1], q, b, p.radiusM))); }
function peersClear(r, a, extra = []) { const b = kelpUnderstoryLifeBounds(a); return [...(r.kelpUnderstoryLife?.plants ?? []), ...(r.kelpUnderstoryLifeAgents ?? []), ...extra].every(p => p.id === a.id || !isSpecies(p) || !boxesOverlap(b, kelpUnderstoryLifeBounds(p))); }
export function kelpUnderstoryLifePositionValid(g, r, a, position = a?.position, { occupancy = false, extra = [], paths = null, elements = null } = {}) {
  if (!geometryOwner(g, r) || !isSpecies(a) || !vector(position) || !(a.sizeM > 0) || a.pitch !== 0) return false;
  const pose = supportedPose(g, r, a, position.x, position.z); if (!pose || !close(position.y, pose.position.y) || !['x', 'y', 'z'].every(k => close(a.supportNormal?.[k], pose.supportNormal[k])) || !vegetationClear(g, r, { ...a, position }, elements)) return false;
  return !occupancy || (reservedClear({ ...a, position }, paths ?? reservations(r)) && peersClear(r, { ...a, position }, extra));
}
export const kelpUnderstoryLifePlantPositionValid = kelpUnderstoryLifePositionValid;
function nativeSites(g, r) { const random = randomFor(g, r), out = []; for (const host of g.chunk(r.cx, r.cz).elements.filter(e => ['rock', 'formation'].includes(e.kind))) for (let i = 0; i < 13; i++) {
  const radius = i ? .20 : 0, angle = (i - 1) * TAU / 12, lx = Math.cos(angle) * host.scale.x * radius, lz = Math.sin(angle) * host.scale.z * radius, c = Math.cos(host.rotation), s = Math.sin(host.rotation), id = `${host.id}:${i}`;
  out.push({ id, hostId: host.id, x: host.x + lx * c + lz * s, z: host.z - lx * s + lz * c, order: random(`site:${id}`) }); }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }
function baseAt(g, r, id, slot, site) { const random = randomFor(g, r), s = kelpUnderstoryLifeSpeciesById[id], plant = KELP_UNDERSTORY_LIFE_PLANT_IDS.includes(id),
    a = { id: `kelp-understory-life${plant ? '-plant' : ''}:${r.id}:${id}:${slot}`, speciesId: id, slot, sizeM: s.sizeRangeM[0] + random(`${id}:${slot}:size`) * (s.sizeRangeM[1] - s.sizeRangeM[0]), heading: random(`${id}:${slot}:heading`) * TAU, pitch: 0,
      siteId: site.id, hostId: site.hostId, kelpUnderstorySiteId: site.id, kelpUnderstoryHostId: site.hostId, habitat: 'native-kelp-rock-understory', attached: true };
  const pose = supportedPose(g, r, a, site.x, site.z); return pose ? { ...a, ...pose } : null;
}
function sourceClear(g, r, source, organ) { if (!owns(r, source, .8) || !owns(r, organ) || !close(source.y, organ.y) || !close(source.z, organ.z) || !close(organ.x - source.x, M.sourceDistanceM)) return false;
  for (let i = 0; i <= Math.ceil(M.sourceDistanceM / M.transportProbeSpacingM); i++) { const x = source.x + Math.min(M.sourceDistanceM, i * M.transportProbeSpacingM); if (g.heightAt(x, source.z) >= source.y - M.wholeBodyClearanceM) return false; } return true; }
function animalAt(g, r, id, slot, site) { const a = baseAt(g, r, id, slot, site); if (!a) return null; const organ = kelpUnderstoryLifeFeedingPosition(a), source = { x: organ.x - M.sourceDistanceM, y: organ.y, z: organ.z };
  return sourceClear(g, r, source, organ) ? { ...a, alive: true, nutritionPool: POOL, feedingPosition: organ, sourcePosition: source, kelpUnderstoryFoodChannelId: `kelp-understory-life-channel:${r.id}:${id}:${slot}` } : null; }
/** Pure role has no clock, original population, stock or RNG dependency. */
export function kelpUnderstoryLifeRole(g, cx, cz) { const r = { id: `${cx},${cz}`, cx, cz }; if (!geometryOwner(g, r) || randomFor(g, r)('role') >= M.allocationProbability) return false;
  return nativeSites(g, r).some(site => KELP_UNDERSTORY_LIFE_IDS.some(id => baseAt(g, r, id, 0, site))); }
export function createKelpUnderstoryLifePlan(g, r, { availableSlots = 0, maxAdded = 4, maxPlants = 12, role = kelpUnderstoryLifeRole(g, r?.cx, r?.cz) } = {}) {
  const empty = { version: 1, role: Boolean(role), placements: [], plants: [], foodChannels: [], reservedPaths: [] }; if (!nativeOwner(g, r) || !role) return freeze(empty);
  const limit = Math.min(4, Math.max(0, Math.floor(Number.isFinite(availableSlots) ? availableSlots : 0)), Math.max(0, Math.floor(Number.isFinite(maxAdded) ? maxAdded : 0))), plantLimit = Math.min(12, Math.max(0, Math.floor(Number.isFinite(maxPlants) ? maxPlants : 0))),
    sites = nativeSites(g, r), paths = reservations(r), elements = kelpWaterElements(g, r.cx, r.cz), placements = [], plants = [], foodChannels = [], used = new Set();
  for (let slot = 0; slot < 2; slot++) for (const id of KELP_UNDERSTORY_LIFE_ANIMAL_IDS) { if (placements.length >= limit) break; for (const site of sites) {
    if (used.has(site.id)) continue; const a = animalAt(g, r, id, slot, site); if (!a || !kelpUnderstoryLifePositionValid(g, r, a, a.position, { occupancy: true, extra: placements, paths, elements })) continue;
    placements.push(a); used.add(site.id); foodChannels.push({ id: a.kelpUnderstoryFoodChannelId, agentId: a.id, hostId: a.hostId, pool: POOL, sourcePosition: clone(a.sourcePosition), feedingPosition: clone(a.feedingPosition), sourceDistanceM: M.sourceDistanceM,
      nextReleaseTick: 1, releaseChecks: 0, inputPulses: 0, inputUnits: 0, ingestedUnits: 0, exportedUnits: 0 }); break;
  } }
  for (let slot = 0; slot < 6; slot++) for (const id of KELP_UNDERSTORY_LIFE_PLANT_IDS) { if (plants.length >= plantLimit) break; for (const site of sites) {
    if (used.has(site.id)) continue; const a = baseAt(g, r, id, slot, site); if (!a || !kelpUnderstoryLifePositionValid(g, r, a, a.position, { occupancy: true, extra: [...placements, ...plants], paths, elements })) continue;
    const b = kelpUnderstoryLifeBounds(a); if (foodChannels.some(c => segmentBox(c.sourcePosition, c.feedingPosition, b, .02))) continue;
    plants.push({ ...a, regionId: r.id, createdAtSec: 0, kelpUnderstoryPlantVersion: 1 }); used.add(site.id); break;
  } }
  return freeze({ version: 1, role: Boolean(role), placements, plants, foodChannels, reservedPaths: paths });
}
const blankFood = () => ({ initial: 0, input: 0, ingested: 0, exported: 0 });
export function initializeKelpUnderstoryLife(g, r, { fresh = false, role = kelpUnderstoryLifeRole(g, r?.cx, r?.cz), capacity = 20, maxAdded = 4, maxPlants = 12 } = {}) {
  if (!fresh || !nativeOwner(g, r) || r.sim.timeSec !== 0 || r.sim._ticks !== 0 || marked(r) || allOld(r).some(a => isSpecies(a) || marked(a)) || (r.understoryPlants ?? []).some(a => isSpecies(a) || marked(a)) || typeof role !== 'boolean' || role !== kelpUnderstoryLifeRole(g, r.cx, r.cz) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || oldResidents(r).length > capacity) return false;
  const p = createKelpUnderstoryLifePlan(g, r, { availableSlots: capacity - oldResidents(r).length, maxAdded, maxPlants, role }), random = randomFor(g, r);
  r.kelpUnderstoryLifeAgents = p.placements.map(a => ({ ...clone(a), regionId: r.id, kelpUnderstoryIndividualVersion: 1, createdAtSec: 0, timeSec: 0, stateSince: 0, state: 'attached-waiting', energy: .68 + random(`${a.id}:condition`) * .12,
    home: clone(a.position), target: clone(a.position), velocity: { x: 0, y: 0, z: 0 }, nextBite: 0, feedingCount: 0, consumedUnits: 0, lastFeedAt: null, lastUnderstoryIntake: null, foodScope: KELP_UNDERSTORY_LIFE_FOOD_SCOPE, conditionScope: CONDITION, localEnvironment: clone(r.sim.environment) }));
  r.kelpUnderstoryLifeVersion = 1; r.kelpUnderstoryLifeInitializedAtSec = 0; r.kelpUnderstoryLife = { version: 1, role, foodScope: KELP_UNDERSTORY_LIFE_FOOD_SCOPE, scope: M.note, plants: clone(p.plants), plantIds: p.plants.map(a => a.id), birthPlacements: clone(p.placements), addedIds: p.placements.map(a => a.id), reservedPaths: clone(p.reservedPaths),
    foodChannels: clone(p.foodChannels), foodParcels: [], nextParcelId: 0, lastTickSec: 0, foodLedger: { ...blankFood(), byPool: { [POOL]: blankFood() } }, counters: { ticks: 0, feedings: 0, consumedUnits: 0, inputPulses: 0, deaths: 0 }, events: [] };
  r.kelpUnderstoryEnergyLedger = { initial: r.kelpUnderstoryLifeAgents.reduce((n, a) => n + a.energy, 0), feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 }; return true;
}
export function captureKelpUnderstoryLife(r) { return Object.hasOwn(r, 'kelpUnderstoryLifeVersion') ? Object.fromEntries(FIELDS.map(k => [k, clone(r[k])])) : {}; }
const resources = r => ({ [POOL]: (r.kelpUnderstoryLife?.foodParcels ?? []).reduce((n, p) => n + p.amount, 0) });
export function kelpUnderstoryLifeFoodBudgetError(r) { const d = r?.kelpUnderstoryLife; if (!d) return 0; const stock = resources(r)[POOL], l = d.foodLedger, p = l.byPool[POOL]; let error = Math.max(Math.abs(stock - (l.initial + l.input - l.ingested - l.exported)), Math.abs(stock - (p.initial + p.input - p.ingested - p.exported)));
  for (const c of d.foodChannels) error = Math.max(error, Math.abs(d.foodParcels.filter(p => p.channelId === c.id).reduce((n, p) => n + p.amount, 0) - (c.inputUnits - c.ingestedUnits - c.exportedUnits))); return error; }
export const kelpUnderstoryLifeBudgetError = kelpUnderstoryLifeFoodBudgetError;
export function kelpUnderstoryLifeEnergyBudgetError(r) { const l = r?.kelpUnderstoryEnergyLedger; return l ? (r.kelpUnderstoryLifeAgents ?? []).reduce((n, a) => n + a.energy, 0) - (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection - l.deathLoss) : 0; }
function ledgerDelta(d, c, kind, amount) { d.foodLedger[kind] += amount; d.foodLedger.byPool[POOL][kind] += amount; c[`${kind}Units`] += amount; }
function setState(a, state, clock) { if (a.state !== state) { a.state = state; a.stateSince = clock; } }
function intakeValid(a, r) { const w = a.lastUnderstoryIntake; if (w === null) return a.lastFeedAt === null && a.feedingCount === 0 && a.consumedUnits === 0; const d = r.kelpUnderstoryLife, c = d.foodChannels.find(c => c.id === a.kelpUnderstoryFoodChannelId);
  if (!w || !c || w.ownerId !== r.id || w.channelId !== c.id || w.hostId !== a.kelpUnderstoryHostId || w.pool !== POOL || w.scope !== KELP_UNDERSTORY_LIFE_FOOD_SCOPE || w.unit !== 'relative-organic-food-proxy-unit' || w.allowedDistanceM !== M.maximumFoodDistanceM || !nonnegative(w.timeSec) || w.timeSec !== a.lastFeedAt || w.timeSec > a.timeSec || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM', 'parcelTravelM', 'parcelCreatedAtSec'].every(k => nonnegative(w[k])) || w.removedUnits <= 0 || w.removedUnits > M.biteAmount + 1e-10 || !close(w.stockBefore - w.stockAfter, w.removedUnits) || w.energyBefore > 1 || !close(w.energyAfter, Math.min(1, w.energyBefore + w.removedUnits * M.energyGainPerUnit)) || w.parcelCreatedAtSec > w.timeSec || !['agentPosition', 'foodPosition', 'feedingPosition', 'sourcePosition'].every(k => vector(w[k])) || !close(gap(w.foodPosition, w.feedingPosition), w.contactDistanceM) || w.contactDistanceM > M.maximumFoodDistanceM + 1e-10 || !['x', 'y', 'z'].every(k => close(w.agentPosition[k], a.position[k]) && close(w.sourcePosition[k], c.sourcePosition[k])) || !close(w.foodPosition.y, c.sourcePosition.y) || !close(w.foodPosition.z, c.sourcePosition.z) || !close(w.foodPosition.x, c.sourcePosition.x + w.parcelTravelM) || !Number.isSafeInteger(w.parcelOrdinal) || w.parcelOrdinal < 1 || w.parcelOrdinal > d.nextParcelId || w.parcelId !== `kelp-understory-life-parcel:${r.id}:${w.parcelOrdinal}`) return false;
  const pore = kelpUnderstoryLifeFeedingPosition(a); return ['x', 'y', 'z'].every(k => close(w.feedingPosition[k], pore[k]));
}
function validate(raw, r, g, capacity, pending = false) {
  const old = [...(raw?.state?.agents ?? r?.sim?.agents ?? []), ...(raw?.waterAgents ?? r?.waterAgents ?? []), ...(raw?.visitorAgents ?? r?.visitorAgents ?? []), ...(raw?.kelpBenthicAgents ?? r?.kelpBenthicAgents ?? []), ...(raw?.kelpWaterLifeAgents ?? r?.kelpWaterLifeAgents ?? []), ...(raw?.kelpNearBottomLifeAgents ?? r?.kelpNearBottomLifeAgents ?? [])], oldPlants = raw?.understoryPlants ?? r?.understoryPlants ?? [];
  if (marked(raw?.state) || [...old, ...oldPlants].some(a => isSpecies(a) || marked(a))) return false; if (!marked(raw)) return true;
  if (!nativeOwner(g, r) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || Object.keys(raw).some(k => k.startsWith('kelpUnderstory') && !FIELDS.includes(k)) || !FIELDS.every(k => Object.hasOwn(raw, k)) || raw.kelpUnderstoryLifeVersion !== 1 || raw.kelpUnderstoryLifeInitializedAtSec !== 0 || !Array.isArray(raw.kelpUnderstoryLifeAgents) || raw.kelpUnderstoryLifeAgents.length > 4 || old.filter(a => a.speciesId !== 'giant-kelp').length + raw.kelpUnderstoryLifeAgents.length > capacity) return false;
  const d = raw.kelpUnderstoryLife, agents = raw.kelpUnderstoryLifeAgents, energy = raw.kelpUnderstoryEnergyLedger, clock = (r.sim._ticks - (pending ? 1 : 0)) * .1, candidate = { ...r, kelpUnderstoryLife: d, kelpUnderstoryLifeAgents: agents, kelpUnderstoryEnergyLedger: energy }, random = randomFor(g, r);
  if (clock < 0 || !d || marked(d) || d.version !== 1 || typeof d.role !== 'boolean' || d.role !== kelpUnderstoryLifeRole(g, r.cx, r.cz) || d.scope !== M.note || d.foodScope !== KELP_UNDERSTORY_LIFE_FOOD_SCOPE || d.lastTickSec !== clock || !Array.isArray(d.plants) || d.plants.length > 12 || !Array.isArray(d.plantIds) || d.plantIds.length !== d.plants.length || new Set(d.plantIds).size !== d.plants.length || (!d.role && (agents.length || d.plants.length)) || !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length || new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length || !Array.isArray(d.reservedPaths) || d.reservedPaths.length > 20 || !d.reservedPaths.every(p => typeof p?.agentId === 'string' && p.scope === 'birth-known-body-home-target-patrol-reference' && Array.isArray(p.points) && p.points.length > 0 && p.points.length <= 32 && p.points.every(vector) && nonnegative(p.radiusM) && p.radiusM <= 10) || !Array.isArray(d.foodChannels) || d.foodChannels.length !== agents.length || !Array.isArray(d.foodParcels) || d.foodParcels.length > M.maximumParcels || !Number.isSafeInteger(d.nextParcelId) || d.nextParcelId < 0 || !Array.isArray(d.events) || d.events.length > 40 || !['ticks', 'feedings', 'inputPulses', 'deaths'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || d.counters.ticks * .1 !== clock || !nonnegative(d.counters.consumedUnits) || d.counters.deaths !== agents.filter(a => a?.alive === false).length || !energy || !['initial', 'feedingGain', 'maintenanceAndMotionDebit', 'deathLoss'].every(k => nonnegative(energy[k])) || !Number.isFinite(energy.clampCorrection) || energy.clampCorrection > 0 || !close(energy.feedingGain, d.counters.consumedUnits * M.energyGainPerUnit) || Math.abs(kelpUnderstoryLifeEnergyBudgetError(candidate)) > 1e-8) return false;
  const l = d.foodLedger, p = l?.byPool?.[POOL]; if (!l || !p || Object.keys(l.byPool).length !== 1 || l.initial !== 0 || p.initial !== 0 || !['input', 'ingested', 'exported'].every(k => nonnegative(l[k]) && nonnegative(p[k]) && close(l[k], p[k])) || !close(l.ingested, d.counters.consumedUnits) || !Number.isFinite(r.sim.environment.foodSupply) || r.sim.environment.foodSupply < 0 || r.sim.environment.foodSupply > 3 || !nonnegative(r.sim.environment.currentMps) || r.sim.environment.currentMps > 1.2) return false;
  const sites = nativeSites(g, r), ids = new Set(old.map(a => a?.id)), peers = [...d.plants, ...agents];
  for (const a of d.plants) { const site = sites.find(s => s.id === a?.siteId), original = site && baseAt(g, r, a.speciesId, a.slot, site);
    if (!original || !exactKeys(a, [...Object.keys(original), 'regionId', 'createdAtSec', 'kelpUnderstoryPlantVersion']) || !isKelpUnderstoryLifePlant(a) || ids.has(a.id) || !d.plantIds.includes(a.id) || !Number.isSafeInteger(a.slot) || a.slot < 0 || a.slot >= 6 || Object.keys(a).some(k => k.startsWith('kelpUnderstory') && !PLANT_FIELDS.includes(k)) || oldMarked(a) || a.kelpUnderstoryPlantVersion !== 1 || a.regionId !== r.id || a.createdAtSec !== 0 || ['id', 'speciesId', 'sizeM', 'heading', 'pitch', 'siteId', 'hostId', 'kelpUnderstorySiteId', 'kelpUnderstoryHostId', 'habitat', 'attached', 'supportOffset'].some(k => a[k] !== original[k]) || !['position', 'supportNormal'].every(k => vector(a[k]) && ['x', 'y', 'z'].every(axis => close(a[k][axis], original[k][axis]))) || !kelpUnderstoryLifePositionValid(g, candidate, a, a.position) || !reservedClear(a, d.reservedPaths) || peers.some(b => b.id !== a.id && boxesOverlap(kelpUnderstoryLifeBounds(a), kelpUnderstoryLifeBounds(b)))) return false; ids.add(a.id); }
  let feedings = 0, consumed = 0; const channelIds = new Set();
  for (const a of agents) { const birth = d.birthPlacements.find(b => b?.id === a?.id), site = sites.find(s => s.id === a?.kelpUnderstorySiteId), original = site && animalAt(g, r, a.speciesId, a.slot, site);
    if (!birth || !original || !exactKeys(birth, Object.keys(original)) || !isKelpUnderstoryLifeAgent(a) || ids.has(a.id) || !d.addedIds.includes(a.id) || ![0, 1].includes(a.slot) || Object.keys(a).some(k => k.startsWith('kelpUnderstory') && !AGENT_FIELDS.includes(k)) || oldMarked(a) || a.kelpUnderstoryIndividualVersion !== 1 || a.regionId !== r.id || a.createdAtSec !== 0 || ['id', 'speciesId', 'slot', 'sizeM', 'heading', 'pitch', 'siteId', 'hostId', 'kelpUnderstorySiteId', 'kelpUnderstoryHostId', 'kelpUnderstoryFoodChannelId', 'nutritionPool', 'habitat', 'attached', 'supportOffset'].some(k => a[k] !== original[k] || birth[k] !== original[k]) || !['position', 'home', 'target', 'velocity', 'supportNormal', 'feedingPosition', 'sourcePosition'].every(k => vector(a[k])) || !['x', 'y', 'z'].every(k => close(a.position[k], original.position[k]) && close(a.home[k], a.position[k]) && close(a.target[k], a.position[k]) && a.velocity[k] === 0 && close(a.supportNormal[k], original.supportNormal[k]) && close(birth.position?.[k], original.position[k]) && ['supportNormal', 'feedingPosition', 'sourcePosition'].every(field => close(birth[field]?.[k], original[field][k])) && ['feedingPosition', 'sourcePosition'].every(field => close(a[field]?.[k], original[field][k]))) || !nonnegative(a.timeSec) || a.timeSec > clock || !nonnegative(a.stateSince) || a.stateSince > a.timeSec || !nonnegative(a.energy) || a.energy > 1 || typeof a.alive !== 'boolean' || (a.alive ? a.timeSec !== clock || !['attached-waiting', 'filtering', 'attached-feeding', 'food-searching'].includes(a.state) : a.state !== 'dead' || a.energy !== 0 || a.stateSince !== a.timeSec) || !nonnegative(a.nextBite) || !Number.isSafeInteger(a.feedingCount) || a.feedingCount < 0 || !nonnegative(a.consumedUnits) || a.foodScope !== KELP_UNDERSTORY_LIFE_FOOD_SCOPE || a.conditionScope !== CONDITION || !kelpUnderstoryLifePositionValid(g, candidate, a) || !reservedClear(a, d.reservedPaths) || !intakeValid(a, candidate) || peers.some(b => b.id !== a.id && boxesOverlap(kelpUnderstoryLifeBounds(a), kelpUnderstoryLifeBounds(b)))) return false;
    const c = d.foodChannels.find(c => c.id === a.kelpUnderstoryFoodChannelId), checks = r.sim._ticks - (pending ? 1 : 0) < 1 ? 0 : 1 + Math.floor((r.sim._ticks - (pending ? 1 : 0) - 1) / M.sourceReleaseIntervalTicks);
    if (!c || channelIds.has(c.id) || marked(c) || c.agentId !== a.id || c.hostId !== a.hostId || c.pool !== POOL || c.sourceDistanceM !== M.sourceDistanceM || !['sourcePosition', 'feedingPosition'].every(k => vector(c[k]) && ['x', 'y', 'z'].every(axis => close(c[k][axis], original[k][axis]))) || !sourceClear(g, r, c.sourcePosition, c.feedingPosition) || c.releaseChecks !== checks || c.nextReleaseTick !== 1 + checks * M.sourceReleaseIntervalTicks || !Number.isSafeInteger(c.inputPulses) || c.inputPulses < 0 || c.inputPulses > checks || !['inputUnits', 'ingestedUnits', 'exportedUnits'].every(k => nonnegative(c[k])) || c.inputUnits > c.inputPulses * M.maximumParcelAmount + 1e-8) return false;
    ids.add(a.id); channelIds.add(c.id); feedings += a.feedingCount; consumed += a.consumedUnits;
  }
  if (feedings !== d.counters.feedings || !close(consumed, d.counters.consumedUnits) || !close(energy.initial, agents.reduce((n, a) => n + .68 + random(`${a.id}:condition`) * .12, 0)) || d.counters.inputPulses !== d.foodChannels.reduce((n, c) => n + c.inputPulses, 0) || ['input', 'ingested', 'exported'].some(k => !close(l[k], d.foodChannels.reduce((n, c) => n + c[`${k}Units`], 0))) || kelpUnderstoryLifeFoodBudgetError(candidate) > 1e-8) return false;
  const parcelIds = new Set(); for (const p of d.foodParcels) { const c = d.foodChannels.find(c => c.id === p?.channelId);
    if (!c || marked(p) || !Number.isSafeInteger(p.ordinal) || p.ordinal < 1 || p.ordinal > d.nextParcelId || p.id !== `kelp-understory-life-parcel:${r.id}:${p.ordinal}` || parcelIds.has(p.id) || p.pool !== POOL || !(p.amount > 0) || p.amount > M.maximumParcelAmount + 1e-10 || !vector(p.position) || !vector(p.sourcePosition) || !owns(r, p.position) || !nonnegative(p.travelM) || p.travelM > M.sourceDistanceM + M.outletDistanceM + 1e-10 || !nonnegative(p.createdAtSec) || p.createdAtSec > clock || p.lastTransportSec !== clock || !['x', 'y', 'z'].every(k => close(p.sourcePosition[k], c.sourcePosition[k])) || !close(p.position.y, c.sourcePosition.y) || !close(p.position.z, c.sourcePosition.z) || !close(p.position.x, c.sourcePosition.x + p.travelM) || g.heightAt(p.position.x, p.position.z) >= p.position.y - M.wholeBodyClearanceM || d.foodParcels.filter(q => q.channelId === c.id).length > M.maximumParcelsPerChannel) return false; parcelIds.add(p.id); }
  return d.events.every(e => nonnegative(e?.timeSec) && e.timeSec <= clock && agents.some(a => a.id === e.agentId) && ['feeding', 'death'].includes(e.type));
}
export function validateKelpUnderstoryLifeRecord(record, r, { generator, capacity = 20, pending = false } = {}) { try { return validate(record, r, generator, capacity, pending); } catch { return false; } }
export function tickKelpUnderstoryLife(r, g, dt) {
  if (!nativeOwner(g, r) || dt !== .1 || r.kelpUnderstoryLifeVersion !== 1 || r.sim._ticks !== (r.kelpUnderstoryLife?.counters?.ticks ?? -2) + 1 || !validateKelpUnderstoryLifeRecord(r, r, { generator: g, capacity: 20, pending: true })) return false;
  const d = r.kelpUnderstoryLife, clock = r.sim._ticks * .1, supply = r.sim.environment.foodSupply, flow = r.sim.environment.currentMps, energy = r.kelpUnderstoryEnergyLedger; d.lastTickSec = clock; d.counters.ticks++;
  for (const a of r.kelpUnderstoryLifeAgents) { if (!a.alive) continue; a.timeSec = clock; a.localEnvironment = clone(r.sim.environment);
    const debit = Math.min(a.energy, dt * (M.maintenanceDebitPerSec + flow * flow * M.flowDebitPerSec)); a.energy -= debit; energy.maintenanceAndMotionDebit += debit;
    if (a.energy <= 1e-9) { energy.deathLoss += a.energy; a.energy = 0; a.alive = false; setState(a, 'dead', clock); d.counters.deaths++; d.events.push({ type: 'death', agentId: a.id, timeSec: clock }); continue; }
    setState(a, d.foodParcels.some(p => p.channelId === a.kelpUnderstoryFoodChannelId) ? 'filtering' : supply > 0 && flow > 0 ? 'attached-waiting' : 'food-searching', clock);
  }
  function capture(a, parcel, c) { const pore = a && kelpUnderstoryLifeFeedingPosition(a);
    if (!a?.alive || !(parcel.amount > 0) || clock < a.nextBite || gap(parcel.position, pore) > M.maximumFoodDistanceM) return;
    const before = parcel.amount, energyBefore = a.energy, removed = Math.min(before, M.biteAmount);
    parcel.amount -= removed; ledgerDelta(d, c, 'ingested', removed); a.energy = Math.min(1, energyBefore + removed * M.energyGainPerUnit); energy.feedingGain += removed * M.energyGainPerUnit; energy.clampCorrection += Math.min(0, 1 - energyBefore - removed * M.energyGainPerUnit);
    a.lastFeedAt = clock; a.nextBite = clock + M.biteIntervalSec; a.feedingCount++; a.consumedUnits += removed; d.counters.feedings++; d.counters.consumedUnits += removed; setState(a, 'attached-feeding', clock);
    a.lastUnderstoryIntake = { timeSec: clock, ownerId: r.id, channelId: c.id, hostId: a.hostId, pool: POOL, parcelId: parcel.id, parcelOrdinal: parcel.ordinal, parcelCreatedAtSec: parcel.createdAtSec, parcelTravelM: parcel.travelM, sourcePosition: clone(parcel.sourcePosition), stockBefore: before, stockAfter: parcel.amount, removedUnits: removed, energyBefore, energyAfter: a.energy,
      agentPosition: clone(a.position), feedingPosition: clone(pore), foodPosition: clone(parcel.position), contactDistanceM: gap(parcel.position, pore), allowedDistanceM: M.maximumFoodDistanceM, unit: 'relative-organic-food-proxy-unit', scope: KELP_UNDERSTORY_LIFE_FOOD_SCOPE };
    d.events.push({ type: 'feeding', agentId: a.id, timeSec: clock, amount: removed });
  }
  // Capture uses actual parcel positions during the same bounded .01m
  // transport probes, so permitted fast flow cannot skip over the inlet.
  for (const p of d.foodParcels) { const c = d.foodChannels.find(c => c.id === p.channelId), a = r.kelpUnderstoryLifeAgents.find(a => a.id === c.agentId), travel = flow * dt, priorTravel = p.travelM, steps = Math.max(1, Math.ceil(travel / M.transportProbeSpacingM));
    capture(a, p, c); for (let i = 1; i <= steps && p.amount > 0; i++) { p.travelM = priorTravel + travel * i / steps; p.position.x = p.sourcePosition.x + p.travelM;
      if (g.heightAt(p.position.x, p.position.z) >= p.position.y - M.wholeBodyClearanceM || d.plants.some(a => kelpUnderstoryLifePointClearance(p.position, a) <= .003) || !owns(r, p.position) || p.travelM > M.sourceDistanceM + M.outletDistanceM) { ledgerDelta(d, c, 'exported', p.amount); p.amount = 0; break; }
      capture(a, p, c);
    } p.lastTransportSec = clock;
  } d.foodParcels = d.foodParcels.filter(p => p.amount > 0);
  for (const c of d.foodChannels) { if (r.sim._ticks < c.nextReleaseTick) continue; c.releaseChecks++; c.nextReleaseTick = 1 + c.releaseChecks * M.sourceReleaseIntervalTicks;
    const input = M.sourceInputUnitsPerSec * M.sourceReleaseIntervalTicks * .1 * supply * flow / M.referenceFlowMps; if (!(input > 0)) continue;
    ledgerDelta(d, c, 'input', input); c.inputPulses++; d.counters.inputPulses++; if (d.foodParcels.length >= M.maximumParcels || d.foodParcels.filter(p => p.channelId === c.id).length >= M.maximumParcelsPerChannel) { ledgerDelta(d, c, 'exported', input); continue; }
    const ordinal = ++d.nextParcelId; d.foodParcels.push({ id: `kelp-understory-life-parcel:${r.id}:${ordinal}`, ordinal, channelId: c.id, pool: POOL, amount: input, position: clone(c.sourcePosition), sourcePosition: clone(c.sourcePosition), travelM: 0, createdAtSec: clock, lastTransportSec: clock });
  } d.events = d.events.slice(-40); return true;
}
export function kelpUnderstoryLifeSnapshot(r) { if (r?.kelpUnderstoryLifeVersion !== 1) return null; const d = r.kelpUnderstoryLife; return { version: 1, plants: clone(d.plants), agents: clone(r.kelpUnderstoryLifeAgents), lastTickSec: d.lastTickSec, environment: clone(r.sim.environment), resources: resources(r), foodLedger: clone(d.foodLedger), energyLedger: clone(r.kelpUnderstoryEnergyLedger), counters: clone(d.counters), foodChannels: clone(d.foodChannels), foodParcels: clone(d.foodParcels), foodBudgetError: kelpUnderstoryLifeFoodBudgetError(r), energyBudgetError: kelpUnderstoryLifeEnergyBudgetError(r), foodScope: KELP_UNDERSTORY_LIFE_FOOD_SCOPE, scope: M.note }; }
