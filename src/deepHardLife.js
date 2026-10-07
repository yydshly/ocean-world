import { deepHardLifeSpeciesCatalog, deepHardLifeSpeciesById } from './deepHardLifeSpecies.js';

// This module owns only the independent new community, food and condition.
// Native DeepSimulation agents, RNG, parcels and ledgers are never mutated.
export const DEEP_HARD_LIFE_VERSION = 1;
export const DEEP_HARD_LIFE_IDS = Object.freeze(deepHardLifeSpeciesCatalog.map(s => s.id));
export const DEEP_HARD_LIFE_FOOD_POOLS = Object.freeze(['particulateOrganicFood', 'smallSuspendedAnimals']);
export const DEEP_HARD_LIFE_FOOD_SCOPE = 'Independent bounded external local control-volume input at actual hard-host feeding-organ height: selected particulate organic or small suspended animal nutrition components, not lifted legacy anemone food, measured biomass or complete natural diets. Zero initial stock; observer light and hour provide no food.';
export const DEEP_HARD_LIFE_MODEL = Object.freeze({ maximumAdded: 4, maximumChannels: 4, maximumParcels: 32, maximumParcelsPerChannel: 4,
  sourceDistanceM: .8, sourceReleaseIntervalSec: 2, sourceInputUnitsPerSec: .00004, transportProbeSpacingM: .01,
  wholeBodyClearanceM: .004, maximumFootGapM: .018, minimumNormalY: .94, maximumFoodDistanceM: .12,
  biteAmount: .00012, biteIntervalSec: 5, energyGainPerUnit: 2, maintenanceDebitPerSec: .000018, flowDebitPerSec: .000025,
  note: 'Uncalibrated sparse attached individuals/colonies, source input, intake and relative condition. Actual fixed native hard supports and finite whole-form probes; independent constant-Y, positive-X food parcels use actual support-hit and owner-outlet export. Not field density, a reconstructed food web, turbulence or complete collision proof. No recruitment, migration, offline evolution or refill.',
});
const MODEL = DEEP_HARD_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2, SALT = 'deep-hard-life-v1';
const FIELDS = ['deepHardLifeVersion', 'deepHardLifeInitializedAtSec', 'deepHardLife', 'deepHardLifeAgents', 'deepHardEnergyLedger'];
const AGENT_FIELDS = ['deepHardIndividualVersion', 'deepHardHostId', 'deepHardSiteId', 'deepHardChannelId'];
const clone = x => structuredClone(x), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const plus = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const marked = x => x && Object.keys(x).some(k => k.startsWith('deepHard'));
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const isDeepHardLifeAgent = a => DEEP_HARD_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`${SALT}|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const ownerGeometry = (g, r) => g?.surfaceY === 3500 && typeof g.chunk === 'function' && typeof g.supportAt === 'function' && typeof g.heightAt === 'function' &&
  Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`;
const nativeOwner = (g, r) => ownerGeometry(g, r) && r.sim && Array.isArray(r.sim.agents) && Array.isArray(r.sim.suspendedPatches) &&
  Number.isSafeInteger(r.sim._ticks) && r.sim._ticks >= 0 && close(r.sim.timeSec, r.sim._ticks * .1);
const oldResidents = r => [...(r.sim?.agents ?? []), ...(r.predatorAgents ?? []), ...(r.deepBenthicAgents ?? [])];
const owns = (r, p, margin = 0) => vector(p) && p.x >= r.cx * SIZE + margin && p.x <= (r.cx + 1) * SIZE - margin &&
  p.z >= r.cz * SIZE + margin && p.z <= (r.cz + 1) * SIZE - margin && Math.hypot(p.x, p.z) > 42;
const sourceOf = a => deepHardLifeSpeciesById[a?.speciesId];
function bodyFrame(normal, heading) {
  if (!vector(normal) || !Number.isFinite(heading)) return null;
  const length = Math.hypot(normal.x, normal.y, normal.z); if (!(length > 0)) return null;
  const up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / length])), dot = Math.cos(heading) * up.x + Math.sin(heading) * up.z,
    f = { x: Math.cos(heading) - up.x * dot, y: -up.y * dot, z: Math.sin(heading) - up.z * dot }, fl = Math.hypot(f.x, f.y, f.z);
  if (!(fl > 1e-10)) return null;
  const forward = Object.fromEntries(['x', 'y', 'z'].map(k => [k, f[k] / fl]));
  return { up, forward, side: { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x } };
}
const offset = (f, p, size) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, size * (f.forward[k] * p.x + f.up[k] * p.y + f.side[k] * p.z)]));
function bodyPoints(a, root = a.position) {
  const e = sourceOf(a)?.normalizedEnvelope, f = bodyFrame(a.supportNormal, a.heading); if (!e || !f) return [];
  const points = [];
  for (const x of [e.x[0], (e.x[0] + e.x[1]) / 2, e.x[1]]) for (const y of [e.y[0], (e.y[0] + e.y[1]) / 2, e.y[1]])
    for (const z of [e.z[0], (e.z[0] + e.z[1]) / 2, e.z[1]]) points.push(plus(root, offset(f, { x, y, z }, a.sizeM)));
  return points;
}
export function deepHardLifeFeedingPosition(a) {
  const f = bodyFrame(a?.supportNormal, a?.heading), p = sourceOf(a)?.morphology?.feedingPointLocal;
  return f && vector(a.position) && vector(p) ? plus(a.position, offset(f, p, a.sizeM)) : null;
}
function supportedPose(g, r, a, x, z) {
  const native = g.supportAt(x, z), f = bodyFrame(native.normal, a.heading), e = sourceOf(a)?.normalizedEnvelope;
  if (!f || !e || native.substrate !== 'rock' || native.elementId !== a.deepHardHostId || f.up.y < MODEL.minimumNormalY) return null;
  let low = Infinity, high = -Infinity, rootY = native.height + MODEL.wholeBodyClearanceM;
  for (let i = 0; i < 13; i++) {
    const angle = (i - 1) * TAU / 12, radius = i ? e.footprintRadiusUnits * a.sizeM : 0,
      p = offset(f, { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius }, 1), support = g.supportAt(x + p.x, z + p.z);
    if (support.substrate !== 'rock' || support.elementId !== a.deepHardHostId || !Number.isFinite(support.height)) return null;
    low = Math.min(low, support.height - p.y); high = Math.max(high, support.height - p.y); rootY = Math.max(rootY, support.height - p.y + MODEL.wholeBodyClearanceM);
  }
  if (high - low > MODEL.maximumFootGapM || rootY - native.height > MODEL.maximumFootGapM + MODEL.wholeBodyClearanceM) return null;
  const position = { x, y: rootY, z }, trial = { ...a, position, supportNormal: f.up }, [dmin, dmax] = sourceOf(a).depthSelectionM, points = bodyPoints(trial);
  if (points.length !== 27 || points.some(p => !owns(r, p, .5) || p.y < g.heightAt(p.x, p.z) - 1e-8 || g.surfaceY - p.y < dmin || g.surfaceY - p.y > dmax)) return null;
  return { position, supportNormal: f.up, supportOffset: rootY - native.height };
}
function bounds(a) {
  const p = isDeepHardLifeAgent(a) ? bodyPoints(a) : [];
  return p.length ? Object.fromEntries(['x', 'y', 'z'].map(k => [k, [Math.min(...p.map(v => v[k])), Math.max(...p.map(v => v[k]))]])) :
    Object.fromEntries(['x', 'y', 'z'].map(k => [k, [a.position[k] - (a.sizeM ?? .3) * .6, a.position[k] + (a.sizeM ?? .3) * .6]]));
}
function peersClear(r, a, extra = []) {
  const ab = bounds(a);
  return [...oldResidents(r), ...(r.deepHardLifeAgents ?? []), ...extra].every(b => {
    if (a.id === b.id || !b.alive || !vector(b.position)) return true;
    const bb = bounds(b); return ['x', 'y', 'z'].some(k => ab[k][1] + .015 <= bb[k][0] || bb[k][1] + .015 <= ab[k][0]);
  });
}
export function deepHardLifePositionValid(g, r, a, p = a?.position, { occupancy = false, extra = [] } = {}) {
  if (!ownerGeometry(g, r) || !isDeepHardLifeAgent(a) || !vector(p) || !Number.isFinite(a.sizeM) || a.sizeM <= 0 || a.pitch !== 0) return false;
  const pose = supportedPose(g, r, a, p.x, p.z);
  return Boolean(pose && close(p.y, pose.position.y) && ['x', 'y', 'z'].every(k => close(a.supportNormal?.[k], pose.supportNormal[k])) && (!occupancy || peersClear(r, { ...a, position: p }, extra)));
}
function sourceClear(g, r, source, organ) {
  if (!owns(r, source, .8) || !owns(r, organ, .5) || !close(source.y, organ.y) || !close(source.z, organ.z) || !close(organ.x - source.x, MODEL.sourceDistanceM)) return false;
  const steps = Math.ceil(MODEL.sourceDistanceM / MODEL.transportProbeSpacingM);
  for (let i = 0; i <= steps; i++) if (!(g.heightAt(source.x + (organ.x - source.x) * i / steps, source.z) < source.y - MODEL.wholeBodyClearanceM)) return false;
  return true;
}
function nativeSites(g, r) {
  const sites = [], random = randomFor(g, r);
  for (const rock of g.chunk(r.cx, r.cz).elements.filter(e => e.kind === 'rock')) for (const radius of [0, .20, .35]) for (let i = 0; i < (radius ? 12 : 1); i++) {
    const angle = i * TAU / 12, lx = Math.cos(angle) * rock.scale.x * radius, lz = Math.sin(angle) * rock.scale.z * radius,
      c = Math.cos(rock.rotation), s = Math.sin(rock.rotation), siteId = `${rock.id}:${radius}:${i}`;
    sites.push({ siteId, hostId: rock.id, x: rock.x + lx * c + lz * s, z: rock.z - lx * s + lz * c, order: random(`site:${siteId}`) });
  }
  return sites.sort((a, b) => a.order - b.order || a.siteId.localeCompare(b.siteId));
}
function seedIndividual(g, r, speciesId, slot, site) {
  const random = randomFor(g, r), [lo, hi] = deepHardLifeSpeciesById[speciesId].sizeRangeM;
  return { id: `deep-hard:${r.id}:${speciesId}:${slot}`, speciesId, slot, sizeM: lo + random(`${speciesId}:${slot}:size`) * (hi - lo),
    heading: random(`${speciesId}:${slot}:heading`) * TAU, pitch: 0, deepHardHostId: site.hostId, deepHardSiteId: site.siteId,
    nutritionPool: deepHardLifeSpeciesById[speciesId].foodPool, alive: true };
}
function placementAt(g, r, speciesId, slot, site, extra = [], occupancy = true) {
  const a = seedIndividual(g, r, speciesId, slot, site), pose = supportedPose(g, r, a, site.x, site.z);
  if (!pose) return null;
  Object.assign(a, pose); const organ = deepHardLifeFeedingPosition(a), source = { x: organ.x - MODEL.sourceDistanceM, y: organ.y, z: organ.z };
  if (!sourceClear(g, r, source, organ) || (occupancy && !peersClear(r, a, extra))) return null;
  return { ...a, siteId: site.siteId, feedingPosition: organ, sourcePosition: source, habitat: 'native-deep-hard-substrate', attached: true };
}
/** Pure geometry role, available before native population/food creation. */
export function deepHardLifeRole(g, cx, cz) {
  const r = { id: `${cx},${cz}`, cx, cz }; if (!ownerGeometry(g, r)) return false;
  const sites = nativeSites(g, r); return DEEP_HARD_LIFE_IDS.some(id => sites.some(s => placementAt(g, r, id, 0, s, [], false)));
}
export function createDeepHardLifePlan(g, r, { availableSlots = 0, maxAdded = 4 } = {}) {
  const empty = { version: 1, placements: [], channels: [] }; if (!nativeOwner(g, r)) return freeze(empty);
  const slots = Math.min(4, Math.max(0, Number.isFinite(availableSlots) ? Math.floor(availableSlots) : 0), Math.max(0, Number.isFinite(maxAdded) ? Math.floor(maxAdded) : 0));
  if (!slots) return freeze(empty);
  const placements = [], channels = [], sites = nativeSites(g, r);
  for (let slot = 0; slot < 2; slot++) for (const speciesId of DEEP_HARD_LIFE_IDS) {
    if (placements.length >= slots) break;
    for (const site of sites) {
      const p = placementAt(g, r, speciesId, slot, site, placements); if (!p) continue;
      const channelId = `deep-hard-channel:${r.id}:${speciesId}:${slot}`;
      placements.push({ ...p, deepHardChannelId: channelId });
      channels.push({ id: channelId, agentId: p.id, hostId: p.deepHardHostId, pool: p.nutritionPool, sourcePosition: clone(p.sourcePosition), feedingPosition: clone(p.feedingPosition),
        sourceDistanceM: MODEL.sourceDistanceM, nextReleaseSec: .1, releaseChecks: 0, inputPulses: 0, inputUnits: 0, ingestedUnits: 0, exportedUnits: 0 }); break;
    }
  }
  return freeze({ version: 1, placements, channels });
}
const blankFood = () => ({ initial: 0, input: 0, ingested: 0, exported: 0 });
export function initializeDeepHardLife(g, r, { fresh = false, capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !nativeOwner(g, r) || r.sim.timeSec !== 0 || r.sim._ticks !== 0 || marked(r) || oldResidents(r).some(a => isDeepHardLifeAgent(a) || marked(a)) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || oldResidents(r).length > capacity) return false;
  const plan = createDeepHardLifePlan(g, r, { availableSlots: capacity - oldResidents(r).length, maxAdded }), random = randomFor(g, r);
  r.deepHardLifeAgents = plan.placements.map(p => ({ ...clone(p), regionId: r.id, home: clone(p.position), target: clone(p.position), velocity: { x: 0, y: 0, z: 0 },
    deepHardIndividualVersion: 1, createdAtSec: 0, timeSec: 0, stateSince: 0, state: 'attached-waiting', energy: .68 + random(`${p.id}:condition`) * .12,
    nextBite: 0, lastFeedAt: null, lastHardLifeIntake: null, foodScope: DEEP_HARD_LIFE_FOOD_SCOPE,
    conditionScope: 'dimensionless relative condition in independent energy ledger; not biomass or organic food stock' }));
  r.deepHardLifeVersion = 1; r.deepHardLifeInitializedAtSec = 0;
  r.deepHardLife = { version: 1, role: deepHardLifeRole(g, r.cx, r.cz), foodScope: DEEP_HARD_LIFE_FOOD_SCOPE, scope: MODEL.note,
    birthPlacements: clone(plan.placements), addedIds: plan.placements.map(p => p.id), channels: clone(plan.channels), parcels: [], nextParcelId: 0, lastTickSec: 0,
    foodLedger: { ...blankFood(), byPool: Object.fromEntries(DEEP_HARD_LIFE_FOOD_POOLS.map(pool => [pool, blankFood()])) },
    counters: { ticks: 0, feedings: 0, consumedUnits: 0, inputPulses: 0, deaths: 0 }, events: [] };
  r.deepHardEnergyLedger = { initial: r.deepHardLifeAgents.reduce((sum, a) => sum + a.energy, 0), feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 }; return true;
}
export function captureDeepHardLife(r) { return Object.hasOwn(r, 'deepHardLifeVersion') ? Object.fromEntries(FIELDS.map(k => [k, clone(r[k])])) : {}; }
function resources(r) { return Object.fromEntries(DEEP_HARD_LIFE_FOOD_POOLS.map(pool => [pool, (r.deepHardLife?.parcels ?? []).filter(p => p.pool === pool).reduce((sum, p) => sum + p.amount, 0)])); }
export function deepHardLifeFoodBudgetError(r) {
  const d = r?.deepHardLife; if (!d) return 0;
  const stocks = resources(r), l = d.foodLedger; let error = Math.abs(Object.values(stocks).reduce((a, b) => a + b, 0) - (l.initial + l.input - l.ingested - l.exported));
  for (const pool of DEEP_HARD_LIFE_FOOD_POOLS) { const p = l.byPool[pool]; error = Math.max(error, Math.abs(stocks[pool] - (p.initial + p.input - p.ingested - p.exported))); }
  for (const c of d.channels) error = Math.max(error, Math.abs(d.parcels.filter(p => p.channelId === c.id).reduce((sum, p) => sum + p.amount, 0) - (c.inputUnits - c.ingestedUnits - c.exportedUnits)));
  return error;
}
export function deepHardLifeEnergyBudgetError(r) {
  const l = r?.deepHardEnergyLedger; if (!l) return 0;
  return (r.deepHardLifeAgents ?? []).reduce((sum, a) => sum + a.energy, 0) - (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection - l.deathLoss);
}
function ledgerDelta(d, c, kind, amount) { d.foodLedger[kind] += amount; d.foodLedger.byPool[c.pool][kind] += amount; c[`${kind}Units`] += amount; }
function setState(a, name, clock) { if (a.state !== name) { a.state = name; a.stateSince = clock; } }
function intakeValid(a, r) {
  const p = a.lastHardLifeIntake; if (p === null) return a.lastFeedAt === null;
  const d = r.deepHardLife, c = d?.channels.find(c => c.id === a.deepHardChannelId);
  if (!p || !c || p.ownerId !== r.id || p.channelId !== c.id || p.hostId !== a.deepHardHostId || p.pool !== a.nutritionPool || p.scope !== DEEP_HARD_LIFE_FOOD_SCOPE || p.unit !== 'relative-organic-food-proxy-unit' ||
      !nonnegative(p.timeSec) || p.timeSec !== a.lastFeedAt || p.timeSec > a.timeSec || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM', 'parcelTravelM', 'parcelCreatedAtSec'].every(k => nonnegative(p[k])) ||
      p.removedUnits <= 0 || p.removedUnits > MODEL.biteAmount + 1e-10 || !close(p.stockBefore - p.stockAfter, p.removedUnits) || p.energyBefore > 1 || !close(p.energyAfter, Math.min(1, p.energyBefore + p.removedUnits * MODEL.energyGainPerUnit)) ||
      p.parcelCreatedAtSec > p.timeSec || !['foodPosition', 'feedingPosition', 'agentPosition', 'sourcePosition'].every(k => vector(p[k])) || p.allowedDistanceM !== MODEL.maximumFoodDistanceM ||
      !close(gap(p.foodPosition, p.feedingPosition), p.contactDistanceM) || p.contactDistanceM > MODEL.maximumFoodDistanceM || !['x', 'y', 'z'].every(k => close(p.sourcePosition[k], c.sourcePosition[k]) && close(p.agentPosition[k], a.home[k])) ||
      !close(p.foodPosition.y, c.sourcePosition.y) || !close(p.foodPosition.z, c.sourcePosition.z) || !close(p.foodPosition.x, c.sourcePosition.x + p.parcelTravelM) || !owns(r, p.foodPosition) ||
      !Number.isSafeInteger(p.parcelOrdinal) || p.parcelOrdinal < 1 || p.parcelOrdinal > d.nextParcelId || p.parcelId !== `deep-hard-parcel:${r.id}:${p.parcelOrdinal}`) return false;
  const organ = deepHardLifeFeedingPosition(a); return ['x', 'y', 'z'].every(k => close(organ[k], p.feedingPosition[k]));
}
function validate(record, r, g, capacity, pending = false) {
  const old = [...(record?.state?.agents ?? r?.sim?.agents ?? []), ...(record?.predatorAgents ?? []), ...(record?.deepBenthicAgents ?? [])];
  if (old.some(a => isDeepHardLifeAgent(a) || marked(a))) return false;
  if (!marked(record)) return true;
  if (!nativeOwner(g, r) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || Object.keys(record).some(k => k.startsWith('deepHard') && !FIELDS.includes(k)) || !FIELDS.every(k => Object.hasOwn(record, k)) ||
      record.deepHardLifeVersion !== 1 || record.deepHardLifeInitializedAtSec !== 0 || !Array.isArray(record.deepHardLifeAgents) || record.deepHardLifeAgents.length > 4 || old.length + record.deepHardLifeAgents.length > capacity) return false;
  const d = record.deepHardLife, agents = record.deepHardLifeAgents, energy = record.deepHardEnergyLedger, clock = r.sim.timeSec - (pending ? .1 : 0), candidate = { ...r, deepHardLife: d, deepHardLifeAgents: agents, deepHardEnergyLedger: energy };
  if (!d || d.version !== 1 || d.foodScope !== DEEP_HARD_LIFE_FOOD_SCOPE || d.scope !== MODEL.note || typeof d.role !== 'boolean' || d.role !== deepHardLifeRole(g, r.cx, r.cz) || !nonnegative(d.lastTickSec) || !close(d.lastTickSec, clock) ||
      !Array.isArray(d.parcels) || d.parcels.length > MODEL.maximumParcels || !Array.isArray(d.channels) || d.channels.length !== agents.length || !Number.isSafeInteger(d.nextParcelId) || d.nextParcelId < 0 || !Array.isArray(d.events) || d.events.length > 40 ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length || new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length ||
      !['ticks', 'feedings', 'inputPulses', 'deaths'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || !close(d.counters.ticks * .1, clock) || !nonnegative(d.counters.consumedUnits) ||
      d.counters.consumedUnits > d.counters.feedings * MODEL.biteAmount + 1e-8 || d.counters.deaths !== agents.filter(a => a?.alive === false).length || !energy || !['initial', 'feedingGain', 'maintenanceAndMotionDebit', 'deathLoss'].every(k => nonnegative(energy[k])) ||
      !Number.isFinite(energy.clampCorrection) || Math.abs(deepHardLifeEnergyBudgetError(candidate)) > 1e-8 || !d.foodLedger || d.foodLedger.initial !== 0 || !['input', 'ingested', 'exported'].every(k => nonnegative(d.foodLedger[k])) ||
      !close(d.foodLedger.ingested, d.counters.consumedUnits) || energy.feedingGain > d.foodLedger.ingested * MODEL.energyGainPerUnit + 1e-8 || d.counters.inputPulses > d.channels.reduce((sum, c) => sum + (c.releaseChecks ?? 0), 0)) return false;
  for (const pool of DEEP_HARD_LIFE_FOOD_POOLS) if (d.foodLedger.byPool?.[pool]?.initial !== 0 || !['input', 'ingested', 'exported'].every(k => nonnegative(d.foodLedger.byPool?.[pool]?.[k]))) return false;
  for (const kind of ['input', 'ingested', 'exported']) if (!close(d.foodLedger[kind], DEEP_HARD_LIFE_FOOD_POOLS.reduce((sum, pool) => sum + d.foodLedger.byPool[pool][kind], 0))) return false;
  const ids = new Set(old.map(a => a?.id)), sites = nativeSites(g, r), channels = new Set();
  for (const a of agents) {
    if (!isDeepHardLifeAgent(a) || Object.keys(a).some(k => k.startsWith('deepHard') && !AGENT_FIELDS.includes(k))) return false;
    const birth = d.birthPlacements.find(p => p.id === a.id), site = birth && sites.find(s => s.siteId === birth.siteId), original = site && placementAt(g, r, a.speciesId, a.slot, site, [], false);
    if (!birth || !original || ['speciesId', 'slot', 'sizeM', 'heading', 'pitch', 'deepHardHostId', 'deepHardSiteId', 'siteId', 'nutritionPool', 'alive', 'habitat', 'attached', 'supportOffset'].some(k => birth[k] !== original[k]) ||
        !['feedingPosition', 'sourcePosition', 'supportNormal'].every(k => vector(birth[k]) && ['x', 'y', 'z'].every(axis => close(birth[k][axis], original[k][axis]))) ||
        ids.has(a.id) || !d.addedIds.includes(a.id) || a.id !== original.id || ![0, 1].includes(a.slot) || a.sizeM !== original.sizeM || a.heading !== original.heading || a.pitch !== 0 || a.deepHardIndividualVersion !== 1 ||
        a.deepHardHostId !== original.deepHardHostId || a.deepHardSiteId !== original.siteId || a.deepHardChannelId !== `deep-hard-channel:${r.id}:${a.speciesId}:${a.slot}` || birth.deepHardChannelId !== a.deepHardChannelId || a.regionId !== r.id ||
        a.nutritionPool !== sourceOf(a).foodPool || a.habitat !== 'native-deep-hard-substrate' || a.attached !== true || !['position', 'home', 'target', 'velocity', 'supportNormal'].every(k => vector(a[k])) ||
        !['x', 'y', 'z'].every(k => close(a.position[k], original.position[k]) && close(a.home[k], a.position[k]) && close(a.target[k], a.position[k]) && a.velocity[k] === 0 && close(a.supportNormal[k], original.supportNormal[k]) && close(birth.position?.[k], original.position[k])) ||
        a.createdAtSec !== 0 || !['timeSec', 'stateSince', 'energy', 'nextBite'].every(k => nonnegative(a[k])) || a.energy > 1 || a.timeSec > clock + 1e-8 || a.stateSince > a.timeSec || typeof a.alive !== 'boolean' ||
        !['attached-waiting', 'filtering', 'food-searching', 'attached-feeding', 'dead'].includes(a.state) || (a.alive ? a.state === 'dead' || !close(a.timeSec, clock) : a.state !== 'dead' || a.energy !== 0 || a.stateSince !== a.timeSec) ||
        a.foodScope !== DEEP_HARD_LIFE_FOOD_SCOPE || a.conditionScope !== 'dimensionless relative condition in independent energy ledger; not biomass or organic food stock' || !deepHardLifePositionValid(g, r, a) || !intakeValid(a, candidate)) return false;
    const c = d.channels.find(c => c.id === a.deepHardChannelId);
    if (!c || channels.has(c.id) || c.agentId !== a.id || c.hostId !== a.deepHardHostId || c.pool !== a.nutritionPool || c.sourceDistanceM !== MODEL.sourceDistanceM || !['sourcePosition', 'feedingPosition'].every(k => vector(c[k])) ||
        !['x', 'y', 'z'].every(k => close(c.sourcePosition[k], original.sourcePosition[k]) && close(c.feedingPosition[k], original.feedingPosition[k])) || !sourceClear(g, r, c.sourcePosition, c.feedingPosition) ||
        !Number.isSafeInteger(c.releaseChecks) || c.releaseChecks < 0 || c.releaseChecks !== (clock < .1 - 1e-9 ? 0 : 1 + Math.floor((clock - .1 + 1e-9) / MODEL.sourceReleaseIntervalSec)) ||
        !close(c.nextReleaseSec, .1 + c.releaseChecks * MODEL.sourceReleaseIntervalSec) || !Number.isSafeInteger(c.inputPulses) || c.inputPulses < 0 || c.inputPulses > c.releaseChecks ||
        !['inputUnits', 'ingestedUnits', 'exportedUnits'].every(k => nonnegative(c[k])) || c.inputUnits > c.inputPulses * MODEL.sourceInputUnitsPerSec * MODEL.sourceReleaseIntervalSec * 3 + 1e-8) return false;
    channels.add(c.id); ids.add(a.id);
  }
  if (!close(energy.initial, agents.reduce((sum, a) => sum + .68 + randomFor(g, r)(`${a.id}:condition`) * .12, 0))) return false;
  for (const kind of ['input', 'ingested', 'exported']) if (!close(d.foodLedger[kind], d.channels.reduce((sum, c) => sum + c[`${kind}Units`], 0))) return false;
  if (d.counters.inputPulses !== d.channels.reduce((sum, c) => sum + c.inputPulses, 0) || deepHardLifeFoodBudgetError(candidate) > 1e-8) return false;
  const parcelIds = new Set();
  for (const p of d.parcels) {
    const c = d.channels.find(c => c.id === p.channelId);
    if (!c || !Number.isSafeInteger(p.ordinal) || p.ordinal < 1 || p.ordinal > d.nextParcelId || p.id !== `deep-hard-parcel:${r.id}:${p.ordinal}` || parcelIds.has(p.id) || p.pool !== c.pool || !nonnegative(p.amount) || !(p.amount > 0) ||
        !vector(p.position) || !vector(p.sourcePosition) || !owns(r, p.position) || !nonnegative(p.travelM) || !nonnegative(p.createdAtSec) || p.createdAtSec > clock || !close(p.lastTransportSec, clock) ||
        !['x', 'y', 'z'].every(k => close(p.sourcePosition[k], c.sourcePosition[k])) || !close(p.position.y, c.sourcePosition.y) || !close(p.position.z, c.sourcePosition.z) || !close(p.position.x, c.sourcePosition.x + p.travelM) ||
        g.heightAt(p.position.x, p.position.z) >= p.position.y - 1e-10 || d.parcels.filter(q => q.channelId === c.id).length > MODEL.maximumParcelsPerChannel) return false;
    parcelIds.add(p.id);
  }
  return true;
}
export function validateDeepHardLifeRecord(record, r, { generator, capacity = 20 } = {}) { try { return validate(record, r, generator, capacity); } catch { return false; } }
/** Only independent zero-initialized food receives input and accounted use.
 * Validate the complete previous native clock before mutating any new record. */
export function tickDeepHardLife(r, g, dt) {
  if (!nativeOwner(g, r) || r.deepHardLifeVersion !== 1 || Object.keys(r).some(k => k.startsWith('deepHard') && !FIELDS.includes(k)) || !close(dt, .1) || !close(r.sim.timeSec - r.deepHardLife?.lastTickSec, .1)) return false;
  const raw = { state: { agents: r.sim.agents }, predatorAgents: r.predatorAgents, deepBenthicAgents: r.deepBenthicAgents, ...captureDeepHardLife(r) };
  try { if (!validate(raw, r, g, 20, true)) return false; } catch { return false; }
  const d = r.deepHardLife, clock = r.sim.timeSec, foodSupply = r.sim.environment.foodSupply, flow = r.sim.environment.currentMps, energy = r.deepHardEnergyLedger;
  if (!Number.isFinite(foodSupply) || foodSupply < 0 || foodSupply > 3 || !Number.isFinite(flow) || flow < 0 || flow > 1.2) return false;
  d.lastTickSec = clock; d.counters.ticks++;
  for (const p of d.parcels) {
    const travel = flow * dt, start = p.position.x, probes = Math.max(1, Math.ceil(travel / MODEL.transportProbeSpacingM)); let collision = false;
    for (let i = 1; i <= probes; i++) if (g.heightAt(start + travel * i / probes, p.position.z) >= p.position.y - 1e-10) { collision = true; break; }
    p.position.x += travel; p.travelM += travel; p.lastTransportSec = clock;
    if (collision || !owns(r, p.position)) { ledgerDelta(d, d.channels.find(c => c.id === p.channelId), 'exported', p.amount); p.amount = 0; }
  }
  d.parcels = d.parcels.filter(p => p.amount > 0);
  for (const c of d.channels) {
    if (clock + 1e-9 < c.nextReleaseSec) continue;
    c.releaseChecks++; c.nextReleaseSec = .1 + c.releaseChecks * MODEL.sourceReleaseIntervalSec;
    const input = MODEL.sourceInputUnitsPerSec * MODEL.sourceReleaseIntervalSec * foodSupply; if (!(input > 0)) continue;
    ledgerDelta(d, c, 'input', input); c.inputPulses++; d.counters.inputPulses++;
    if (d.parcels.length >= MODEL.maximumParcels || d.parcels.filter(p => p.channelId === c.id).length >= MODEL.maximumParcelsPerChannel) { ledgerDelta(d, c, 'exported', input); continue; }
    const ordinal = ++d.nextParcelId;
    d.parcels.push({ id: `deep-hard-parcel:${r.id}:${ordinal}`, ordinal, channelId: c.id, pool: c.pool, amount: input,
      position: clone(c.sourcePosition), sourcePosition: clone(c.sourcePosition), travelM: 0, createdAtSec: clock, lastTransportSec: clock });
  }
  for (const a of r.deepHardLifeAgents) {
    if (!a.alive) continue;
    a.timeSec = clock;
    const debit = Math.min(a.energy, dt * (MODEL.maintenanceDebitPerSec + flow * flow * MODEL.flowDebitPerSec)); a.energy -= debit; energy.maintenanceAndMotionDebit += debit;
    if (a.energy <= 0) { a.energy = 0; a.alive = false; setState(a, 'dead', clock); d.counters.deaths++; continue; }
    const organ = deepHardLifeFeedingPosition(a), candidates = d.parcels.filter(p => p.channelId === a.deepHardChannelId && p.pool === a.nutritionPool && p.amount > 0)
      .sort((p, q) => gap(p.position, organ) - gap(q.position, organ) || p.ordinal - q.ordinal), p = candidates[0];
    setState(a, p ? 'filtering' : foodSupply > 0 ? 'attached-waiting' : 'food-searching', clock);
    if (clock < a.nextBite || !p || gap(p.position, organ) > MODEL.maximumFoodDistanceM || !deepHardLifePositionValid(g, r, a, a.position, { occupancy: true })) continue;
    const stockBefore = p.amount, energyBefore = a.energy, taken = Math.min(stockBefore, MODEL.biteAmount), c = d.channels.find(c => c.id === p.channelId); if (!(taken > 0)) continue;
    p.amount -= taken; ledgerDelta(d, c, 'ingested', taken); const gain = Math.min(1 - a.energy, taken * MODEL.energyGainPerUnit); a.energy += gain; energy.feedingGain += gain;
    a.lastFeedAt = clock; a.nextBite = clock + MODEL.biteIntervalSec;
    a.lastHardLifeIntake = { timeSec: clock, ownerId: r.id, channelId: c.id, hostId: a.deepHardHostId, pool: p.pool, parcelId: p.id, parcelOrdinal: p.ordinal,
      parcelCreatedAtSec: p.createdAtSec, parcelTravelM: p.travelM, sourcePosition: clone(p.sourcePosition), stockBefore, stockAfter: p.amount, removedUnits: taken, energyBefore, energyAfter: a.energy,
      agentPosition: clone(a.position), feedingPosition: clone(organ), foodPosition: clone(p.position), contactDistanceM: gap(p.position, organ), allowedDistanceM: MODEL.maximumFoodDistanceM,
      unit: 'relative-organic-food-proxy-unit', scope: DEEP_HARD_LIFE_FOOD_SCOPE };
    d.counters.feedings++; d.counters.consumedUnits += taken; setState(a, 'attached-feeding', clock);
  }
  d.parcels = d.parcels.filter(p => p.amount > 0); return true;
}
export function deepHardLifeSnapshot(r) {
  if (r?.deepHardLifeVersion !== 1) return null;
  return { version: 1, resources: resources(r), foodLedger: clone(r.deepHardLife.foodLedger), counters: clone(r.deepHardLife.counters), channels: clone(r.deepHardLife.channels),
    parcelCount: r.deepHardLife.parcels.length, agents: clone(r.deepHardLifeAgents), foodBudgetError: deepHardLifeFoodBudgetError(r), energyBudgetError: deepHardLifeEnergyBudgetError(r), foodScope: DEEP_HARD_LIFE_FOOD_SCOPE, scope: MODEL.note };
}
