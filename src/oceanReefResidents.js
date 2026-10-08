import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from './oceanReefResidentsSpecies.js';
import { oceanReefDiversitySpeciesById } from './oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from './oceanReefCommunitySpecies.js';
import { recordLivingAdmission, recordLivingIngestion, recordLivingDeath, validateLivingNetworkRecord, LIVING_NETWORK_UNITS } from './livingEcologyNetwork.js';

export const REEF_RESIDENTS_VERSION = 1;
export const REEF_DIVERSITY_VERSION = 2;
export const REEF_COMMUNITY_VERSION = 3;
export const REEF_RESIDENTS_LEGACY_IDS = Object.freeze(['coral-trout', 'painted-spiny-lobster']);
export const REEF_DIVERSITY_NEW_IDS = Object.freeze(['lionfish', 'chinese-trumpetfish', 'moorish-idol', 'sailfin-tang', 'cushion-sea-star', 'leopard-sea-cucumber']);
export const REEF_COMMUNITY_NEW_IDS = Object.freeze(['yellow-boxfish', 'red-toothed-triggerfish', 'longfin-batfish', 'valentini-puffer', 'peacock-mantis-shrimp', 'green-turban-snail']);
export const REEF_COMMUNITY_FOOD_SCOPE = 'selected existing owner-local animal, zooplankton or algal nutrition component; no resolved visible prey kill, new food stock or complete natural diet';
export const REEF_COMMUNITY_SCOPE = 'fresh v8 reef-valley representatives; complete v2 births followed by finite owner-rotated community in natural residual capacity; no history refill, reproduction or offline evolution';
export const REEF_DIVERSITY_FOOD_SCOPE = 'selected existing owner-local animal, algae, coral-organic or detrital nutrition component; no resolved visible prey kill, new food stock or complete natural diet';
export const REEF_DIVERSITY_SCOPE = 'fresh v8 reef-valley representatives; original v1 births followed by finite owner-rotated diversity in natural residual capacity; no history refill, reproduction or offline evolution';
export const REEF_RESIDENTS_FOOD_SCOPE = 'existing owner-local unresolved reefGuild animal-nutrition component; no resolved visible prey capture, new stock or complete natural diet';
export const REEF_RESIDENTS_SCOPE = 'fresh v8 reef-valley representatives using natural residual capacity; bounded whole-form support and owner clock; no real cave, reproduction, refill or offline evolution';
export const REEF_RESIDENTS_MODEL = Object.freeze({ stepSec: .1, limit: 2, clearanceM: .004, maximumFootGapM: .025,
  maximumEvents: 32, biteUnits: .00024, biteIntervalSec: 4, maximumTurnRadPerSec: .55 });
const M = REEF_RESIDENTS_MODEL, SIZE = 64, TAU = Math.PI * 2, POOL = 'reefGuild.preyOrganicUnits';
const speciesById = { ...oceanReefResidentsSpeciesById, ...oceanReefDiversitySpeciesById, ...oceanReefCommunitySpeciesById };
const TOP = ['reefResidentsVersion', 'reefResidentsInitializedAtSec', 'reefResidents'];
const INDIVIDUAL = ['reefResidentIndividualVersion', 'reefResidentSiteId', 'reefResidentHostId', 'reefResidentMode', 'reefResidentFoodPool'];
const FIELDS = ['version', 'groupId', 'recipe', 'addedIds', 'birthPlacements', 'initialInputUnits', 'scope', 'foodScope', 'counters', 'events'];
const V2_FIELDS = [...FIELDS, 'legacyAddedIds', 'candidateOrder'];
const V3_FIELDS = [...V2_FIELDS, 'priorAddedIds', 'communityCandidateOrder'];
const traits = Object.freeze({ 'coral-trout': { mode: 'reef-water', speed: .14, extent: 4, night: false },
  'painted-spiny-lobster': { mode: 'reef-foot', speed: .015, extent: 1.1, night: true },
  lionfish: { mode: 'reef-water', speed: .075, extent: 3, night: false, pool: POOL },
  'chinese-trumpetfish': { mode: 'reef-water', speed: .11, extent: 4, night: false, pool: POOL },
  'moorish-idol': { mode: 'reef-water', speed: .10, extent: 3, night: false, pool: POOL },
  'sailfin-tang': { mode: 'reef-water', speed: .10, extent: 3, night: false, pool: 'resources.algae' },
  'cushion-sea-star': { mode: 'reef-foot', speed: .002, extent: .5, night: false, pool: 'basicNetwork.coralOrganicUnits', coral: true },
  'leopard-sea-cucumber': { mode: 'reef-foot', speed: .003, extent: .7, night: false, pool: 'resources.detritus', soft: true },
  'yellow-boxfish': { mode: 'reef-water', speed: .065, extent: 3, night: false, pool: POOL },
  'red-toothed-triggerfish': { mode: 'reef-water', speed: .12, extent: 4, night: false, pool: 'resources.plankton' },
  'longfin-batfish': { mode: 'reef-water', speed: .075, extent: 3, night: false, pool: 'resources.algae' },
  'valentini-puffer': { mode: 'reef-water', speed: .06, extent: 2, night: false, pool: POOL },
  'peacock-mantis-shrimp': { mode: 'reef-foot', speed: .009, extent: .7, night: false, pool: POOL, bare: true },
  'green-turban-snail': { mode: 'reef-foot', speed: .0015, extent: .4, night: false, pool: 'resources.algae', hard: true } });
const clone = v => structuredClone(v), point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, t = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const individualMarked = a => a && Object.keys(a).some(k => k.startsWith('reefResident'));
export const isReefResidentAgent = a => OCEAN_REEF_RESIDENT_IDS.includes(a?.speciesId) || REEF_DIVERSITY_NEW_IDS.includes(a?.speciesId) || REEF_COMMUNITY_NEW_IDS.includes(a?.speciesId);
export const reefResidentsMarked = r => Boolean(r && (Object.keys(r).some(k => k.startsWith('reefResidents')) ||
  [...(r.agents ?? []), ...(r.turtleAgents ?? [])].some(a => individualMarked(a) || isReefResidentAgent(a))));
export const reefResidentConsumerCount = r => [1, 2, 3].includes(r?.reefResidentsVersion) ? (r.agents ?? []).filter(a => isReefResidentAgent(a) && a.alive).length : 0;
export const reefResidentPreyConsumerCount = r => r?.reefResidentsVersion === 1 ? reefResidentConsumerCount(r) : [2, 3].includes(r?.reefResidentsVersion) ?
  (r.agents ?? []).filter(a => isReefResidentAgent(a) && a.alive && a.reefResidentFoodPool === POOL).length : 0;
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
// New births/decisions have an independent salt. Caller RNG is never consumed,
// and static sizes, sites and birth headings can be verified after restoration.
const randomFor = (g, r) => salt => hash(`reef-residents-v1|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const randomForV2 = (g, r) => salt => hash(`reef-residents-v2|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const randomForV3 = (g, r) => salt => hash(`reef-residents-v3|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const individualVersion = id => REEF_RESIDENTS_LEGACY_IDS.includes(id) ? 1 : REEF_DIVERSITY_NEW_IDS.includes(id) ? 2 : REEF_COMMUNITY_NEW_IDS.includes(id) ? 3 : 0;
const individualRandom = (g, r, a) => a.reefResidentIndividualVersion === 3 ? randomForV3(g, r) : a.reefResidentIndividualVersion === 2 ? randomForV2(g, r) : randomFor(g, r);
const individualFoodScope = a => a.reefResidentIndividualVersion === 3 ? REEF_COMMUNITY_FOOD_SCOPE : a.reefResidentIndividualVersion === 2 ? REEF_DIVERSITY_FOOD_SCOPE : REEF_RESIDENTS_FOOD_SCOPE;
function actualGroup(r, g) {
  try {
    if (g?.profile !== 'living-shallows-v1' || typeof g.chunk !== 'function' || typeof g.sample !== 'function' || typeof g.floorSurface !== 'function' ||
      !Number.isSafeInteger(r?.cx) || !Number.isSafeInteger(r?.cz) || r.id !== `${r.cx},${r.cz}`) return null;
    const plan = g.chunk(r.cx, r.cz)?.ridgePlan, group = plan?.group;
    if (plan?.version !== 8 || plan.theme !== 'reef-valley-region' || plan.id !== r.id || plan.cx !== r.cx || plan.cz !== r.cz || plan.seed !== g.seed ||
      !group || !Number.isSafeInteger(group.cx) || !Number.isSafeInteger(group.cz) || group.cx % 6 || group.cz % 2 ||
      (group.cx < 204 && group.cx > -12) || group.id !== `reef-valley-region:${group.cx},${group.cz}` || group.seed !== g.seed ||
      !Array.isArray(group.ownerIds) || group.ownerIds.length !== 12 || new Set(group.ownerIds).size !== 12 || !group.ownerIds.includes(r.id) ||
      !Array.isArray(group.routePath) || group.routePath.length < 2 || !group.routePath.every(point)) return null;
    const expected = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${group.cx + dx},${group.cz + dz}`));
    return expected.every(id => group.ownerIds.includes(id)) ? group : null;
  } catch { return null; }
}
function nativeOwner(r, g) { return actualGroup(r, g) && Array.isArray(r.agents) && Array.isArray(r.turtleAgents ?? []) &&
  nonnegative(r.timeSec) && Number.isSafeInteger(r.ticks) && r.ticks >= 0 && close(r.timeSec, r.ticks * M.stepSec) &&
  r.reefGuildVersion === 1 && nonnegative(r.reefGuild?.preyOrganicUnits) && r.basicNetwork; }
function queries(r, g, { surface, bed } = {}) {
  const nearby = new Map();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const e of g.chunk(r.cx + dx, r.cz + dz).elements) nearby.set(e.id, e);
  const rows = [...nearby.values()], memo = query => { const cache = new Map(); return (x, z, crown = false) => {
    const key = `${x},${z},${crown ? 1 : 0}`; if (!cache.has(key)) cache.set(key, query(x, z, crown)); return cache.get(key); }; };
  const floor = memo(bed ?? ((x, z) => g.floorSurface(x, z).height));
  const nativeSurface = surface ?? ((x, z, crown = false) => rows.reduce((height, e) => {
    if (['rock', 'formation'].includes(e.kind)) return Math.max(height, oceanRockHeight(e, x, z) ?? -Infinity);
    if (crown && e.kind === 'coral' && Math.hypot(x - e.x, z - e.z) < Math.max(e.scale.x, e.scale.z) * .55) return Math.max(height, e.y + e.scale.y);
    return height;
  }, floor(x, z)));
  const solid = memo((x, z, crown = false) => {
    let height = nativeSurface(x, z, crown);
    if (crown) for (const p of r.biodiversity?.patches ?? []) height = Math.max(height, oceanBiodiversityPatchHeight(p, x, z) ?? -Infinity);
    return height;
  });
  return { nearby: rows, bed: floor, surface: solid };
}
function frame(normal, heading, pitch, grounded) {
  let up = { x: 0, y: 1, z: 0 };
  if (grounded) { if (!point(normal)) return null; const length = Math.hypot(normal.x, normal.y, normal.z); if (!(length > 0)) return null;
    up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / length])); }
  const dot = up.x * Math.cos(heading) + up.z * Math.sin(heading);
  let forward = { x: Math.cos(heading) - up.x * dot, y: -up.y * dot, z: Math.sin(heading) - up.z * dot };
  const length = Math.hypot(forward.x, forward.y, forward.z); if (!(length > 1e-8)) return null;
  forward = Object.fromEntries(['x', 'y', 'z'].map(k => [k, forward[k] / length]));
  const side = { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x };
  return { forward: Object.fromEntries(['x', 'y', 'z'].map(k => [k, forward[k] * Math.cos(pitch) + up[k] * Math.sin(pitch)])),
    up: Object.fromEntries(['x', 'y', 'z'].map(k => [k, up[k] * Math.cos(pitch) - forward[k] * Math.sin(pitch)])), side };
}
const transform = (p, size, pose) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, size * (pose.forward[k] * p.x + pose.up[k] * p.y + pose.side[k] * p.z)]));
function bodyOffsets(a, pose) {
  const e = speciesById[a.speciesId].normalizedEnvelope, rows = [];
  for (const x of [e.x[0], 0, e.x[1]]) for (const y of [e.y[0], 0, e.y[1]]) for (const z of [e.z[0], 0, e.z[1]]) rows.push(transform({ x, y, z }, a.sizeM, pose));
  return rows;
}
function rockGround(e, x, z) {
  const c = Math.cos(e.rotation ?? 0), s = Math.sin(e.rotation ?? 0), dx = x - e.x, dz = z - e.z;
  const local = oceanRockSurface(e.profile || 'mound', (dx * c - dz * s) / e.scale.x, (dx * s + dz * c) / e.scale.z); if (!local) return null;
  const n = local.normal, nx = n.x / e.scale.x, ny = n.y / e.scale.y, nz = n.z / e.scale.z;
  const normal = { x: nx * c + nz * s, y: ny, z: -nx * s + nz * c }, length = Math.hypot(normal.x, normal.y, normal.z);
  return { height: e.y + local.height * e.scale.y, normal: Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / length])) };
}
function groundAt(g, q, x, z) {
  const height = q.surface(x, z), floor = q.bed(x, z); if (![height, floor].every(Number.isFinite)) return null;
  if (height - floor <= .025) return { height, normal: g.floorSurface(x, z).normal };
  for (const e of q.nearby.filter(e => ['rock', 'formation'].includes(e.kind))) {
    const support = rockGround(e, x, z); if (support && close(support.height, height, 1e-7)) return support;
  }
  return null;
}
function reefHost(r, g, a) { return g.chunk(r.cx, r.cz).elements.find(e => e.id === a.reefResidentHostId && ['rock', 'coral', 'formation'].includes(e.kind)); }
const nearHost = (host, p) => host && Math.hypot(host.x - p.x, host.z - p.z) <= Math.max(host.scale.x, host.scale.z) * .6 + 5;
const owned = (r, p, radius) => point(p) && p.x >= r.cx * SIZE + radius + .1 && p.x <= (r.cx + 1) * SIZE - radius - .1 &&
  p.z >= r.cz * SIZE + radius + .1 && p.z <= (r.cz + 1) * SIZE - radius - .1;
function bodyClear(r, a, p, radius, low, high) {
  return [...r.agents, ...(r.turtleAgents ?? [])].every(other => {
    if (other.id === a.id || !other.alive || !point(other.position)) return true;
    const size = other.sizeM ?? .1, e = speciesById[other.speciesId]?.normalizedEnvelope;
    const otherRadius = size * (e?.horizontalRadiusUnits ?? (other.speciesId === 'blue-spotted-ray' ? 2.3 : other.speciesId === 'green-turtle' ? .8 : .7));
    const otherLow = other.position.y + size * (e?.y[0] ?? -.35), otherHigh = other.position.y + size * (e?.y[1] ?? .8);
    return p.y + high + .025 < otherLow || p.y + low - .025 > otherHigh || Math.hypot(p.x - other.position.x, p.z - other.position.z) >= radius + otherRadius + .04;
  });
}
function supportSurvey(r, g, a, p, heading, pitch, q, occupancy = false, range = true) {
  const s = speciesById[a.speciesId], t = traits[a.speciesId];
  if (!s || !point(p) || !Number.isFinite(heading) || !Number.isFinite(pitch) || Math.abs(pitch) > s.support.pitchLimitRad ||
    !nearHost(reefHost(r, g, a), p) || (range && point(a.home) && distance(p, a.home) > t.extent + 1e-8)) return null;
  const grounded = t.mode === 'reef-foot', centerGround = grounded ? groundAt(g, q, p.x, p.z) : null;
  const pose = frame(centerGround?.normal, heading, pitch, grounded); if (!pose || (grounded && pose.up.y < s.support.minimumNormalY)) return null;
  const offsets = bodyOffsets(a, pose), radius = Math.max(s.normalizedEnvelope.horizontalRadiusUnits * a.sizeM, ...offsets.map(o => Math.hypot(o.x, o.z)));
  if (!owned(r, p, radius)) return null;
  const depth = y => { const d = (g.surfaceY ?? 8) - y; return d >= s.depthSelectionM[0] && d <= s.depthSelectionM[1]; };
  for (const o of offsets) {
    const x = p.x + o.x, y = p.y + o.y, z = p.z + o.z, floor = q.surface(x, z, true);
    if (!Number.isFinite(floor) || !depth(y) || y >= (g.surfaceY ?? 8) - .5 || y < floor + M.clearanceM - 1e-8) return null;
  }
  if (grounded) {
    const levels = [];
    for (const foot of s.support.footContacts) {
      const o = transform(foot, a.sizeM, pose), support = groundAt(g, q, p.x + o.x, p.z + o.z);
      if (!support || !point(support.normal) || support.normal.y < s.support.minimumNormalY || q.surface(p.x + o.x, p.z + o.z, true) > support.height + .01) return null;
      if (a.reefResidentIndividualVersion >= 2 && t.soft && (g.sample(p.x + o.x, p.z + o.z).substrate !== 'sand' ||
        support.height > q.bed(p.x + o.x, p.z + o.z) + .025)) return null;
      if (a.reefResidentIndividualVersion >= 2 && (t.coral || t.bare) && support.height <= q.bed(p.x + o.x, p.z + o.z) + .025 &&
        !['sand', 'rock'].includes(g.sample(p.x + o.x, p.z + o.z).substrate)) return null;
      if (a.reefResidentIndividualVersion === 3 && t.hard && support.height <= q.bed(p.x + o.x, p.z + o.z) + .025 &&
        g.sample(p.x + o.x, p.z + o.z).substrate !== 'rock') return null;
      levels.push(support.height - o.y);
    }
    const expected = a.reefResidentIndividualVersion >= 2 ? s.support.footContacts.length : 10;
    if (expected < 6 || expected > 12 || levels.length !== expected || Math.max(...levels) - Math.min(...levels) > M.maximumFootGapM || !close(p.y, Math.max(...levels) + M.clearanceM, 1e-7)) return null;
  }
  const low = Math.min(...offsets.map(o => o.y)), high = Math.max(...offsets.map(o => o.y));
  for (const e of q.nearby.filter(e => ['coral', 'seagrass', 'rubble'].includes(e.kind))) {
    if (p.y + high < e.y - .025 || p.y + low > e.y + e.scale.y * 1.02 + .025) continue;
    if (Math.hypot(p.x - e.x, p.z - e.z) < radius + Math.max(e.scale.x, e.scale.z) * .55 + .025) return null;
  }
  if (occupancy && !bodyClear(r, a, p, radius, low, high)) return null;
  return { position: clone(p), supportNormal: grounded ? clone(pose.up) : { x: 0, y: 1, z: 0 } };
}
function groundPosition(g, a, x, z, heading, q) {
  const s = speciesById[a.speciesId], ground = groundAt(g, q, x, z), pose = ground && frame(ground.normal, heading, 0, true);
  if (!pose || pose.up.y < s.support.minimumNormalY) return null;
  let y = -Infinity;
  for (const foot of s.support.footContacts) { const o = transform(foot, a.sizeM, pose), support = groundAt(g, q, x + o.x, z + o.z); if (!support) return null; y = Math.max(y, support.height - o.y); }
  return { x, y: y + M.clearanceM, z };
}
function routeDistance(p, path) {
  let best = Infinity; for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
    const t = n > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / n)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)); } return best;
}
function candidates(r, g) {
  const group = actualGroup(r, g), rng = randomFor(g, r), sites = [];
  if (!group) return sites;
  for (const host of g.chunk(r.cx, r.cz).elements.filter(e => ['rock', 'coral', 'formation'].includes(e.kind))) {
    for (const fraction of [.15, .35, .55]) for (let i = 0; i < 8; i++) {
      const h = (i / 8 + rng(`around:${host.id}`)) * TAU, reach = Math.max(host.scale.x, host.scale.z) * fraction + (fraction === .55 ? .9 : 0);
      const siteId = `reef:${host.id}:${fraction}:${i}`, p = { siteId, hostId: host.id, x: host.x + Math.cos(h) * reach, z: host.z + Math.sin(h) * reach };
      sites.push({ ...p, order: rng(`order:${siteId}`), distanceM: routeDistance(p, group.routePath) });
    }
  }
  return sites.sort((a, b) => a.distanceM - b.distanceM || a.order - b.order || a.siteId.localeCompare(b.siteId));
}
const selectedSize = (id, rng) => { const range = speciesById[id].sizeRangeM; return range[0] + rng(`${id}:size`) * (range[1] - range[0]); };
function sitePose(r, g, a, site, heading, q) {
  return traits[a.speciesId].mode === 'reef-foot' ? groundPosition(g, a, site.x, site.z, heading, q) :
    { x: site.x, z: site.z, y: q.surface(site.x, site.z, true) + .60 + a.sizeM * .25 };
}
export function initializeReefResidents(r, g, { fresh = false, surface, bed, capacity = 20, version = 1 } = {}) {
  if (version === 3) return initializeReefCommunity(r, g, { fresh, surface, bed, capacity });
  if (version === 2) return initializeReefDiversity(r, g, { fresh, surface, bed, capacity });
  if (version !== 1) return false;
  if (!fresh || !nativeOwner(r, g) || r.timeSec !== 0 || r.ticks !== 0 || reefResidentsMarked(r) || !validateLivingNetworkRecord(r)) return false;
  const cap = Math.min(20, Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0), occupied = r.agents.length + (r.turtleAgents?.length ?? 0);
  if (occupied > 20) return false;
  const available = Math.min(M.limit, Math.max(0, cap - occupied)), rng = randomFor(g, r), sites = candidates(r, g), q = queries(r, g, { surface, bed }), born = [], placements = [];
  for (const id of REEF_RESIDENTS_LEGACY_IDS) {
    if (born.length >= available || rng(`${id}:present`) > .88) continue;
    const sizeM = selectedSize(id, rng), heading = rng(`${id}:heading`) * TAU;
    for (const site of sites) {
      const agent = { id: `ocean:${r.id}:reef-residents:${id}:${site.siteId}`, speciesId: id, sizeM, reefResidentHostId: site.hostId };
      const p = sitePose(r, g, agent, site, heading, q), support = supportSurvey({ ...r, agents: r.agents.concat(born) }, g, agent, p, heading, 0, q, true, false);
      if (!support) continue;
      const placement = { id: agent.id, speciesId: id, siteId: site.siteId, hostId: site.hostId, mode: traits[id].mode, sizeM, heading, pitch: 0,
        position: clone(p), supportNormal: clone(support.supportNormal) };
      placements.push(placement); born.push({ ...agent, regionId: r.id, position: clone(p), home: clone(p), refuge: clone(p), target: clone(p), velocity: { x: 0, y: 0, z: 0 },
        supportNormal: clone(support.supportNormal), heading, targetHeading: heading, pitch: 0, timeSec: 0, energy: .75 + rng(`${agent.id}:condition`) * .08,
        alive: true, state: traits[id].night ? 'resting' : 'reef-cruising', stateSince: 0, parasites: 0, groupId: null, fleeUntil: 0,
        lastFeedAt: null, lastResidentIntake: null, nextBite: rng(`${agent.id}:bite`) * 3, nextDecision: 0, decisions: 0,
        habitat: `reef-resident-${traits[id].mode}`, refugeHostId: site.hostId, dietProxy: REEF_RESIDENTS_FOOD_SCOPE,
        reefResidentIndividualVersion: 1, reefResidentSiteId: site.siteId, reefResidentMode: traits[id].mode, reefResidentFoodPool: POOL }); break;
    }
  }
  r.agents.push(...born); const input = recordLivingAdmission(r, born), group = actualGroup(r, g);
  r.reefResidentsVersion = 1; r.reefResidentsInitializedAtSec = 0;
  r.reefResidents = { version: 1, groupId: `${group.cx},${group.cz}`, recipe: 'reef-residents-v1', addedIds: born.map(a => a.id), birthPlacements: placements,
    initialInputUnits: input, scope: REEF_RESIDENTS_SCOPE, foodScope: REEF_RESIDENTS_FOOD_SCOPE,
    counters: { feedings: 0, consumedUnits: 0, deaths: 0, moved: 0, blocked: 0 }, events: [] };
  return true;
}
function diversityOrder(r, g) {
  const group = actualGroup(r, g); if (!group) return [];
  const index = (r.cz - group.cz) * 6 + r.cx - group.cx, offset = index % REEF_DIVERSITY_NEW_IDS.length;
  return [...REEF_DIVERSITY_NEW_IDS.slice(offset), ...REEF_DIVERSITY_NEW_IDS.slice(0, offset)];
}
const nearCoral = (p, q) => q.nearby.some(e => e.kind === 'coral' &&
  Math.hypot(p.x - e.x, p.z - e.z) <= Math.max(e.scale.x, e.scale.z) * .55 + 3);
function initializeReefDiversity(r, g, { fresh, surface, bed, capacity }) {
  if (!REEF_DIVERSITY_NEW_IDS.every(id => speciesById[id]?.foodPool === traits[id].pool) ||
    !initializeReefResidents(r, g, { fresh, surface, bed, capacity, version: 1 })) return false;
  // The complete old initialization runs first, with its original salt and
  // capacity. New diversity consumes only its untouched natural remainder.
  const d = r.reefResidents, legacyAddedIds = d.addedIds.slice(), candidateOrder = diversityOrder(r, g), rng = randomForV2(g, r);
  const cap = Math.min(20, Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0);
  const available = Math.min(4 - legacyAddedIds.length, Math.max(0, cap - r.agents.length - (r.turtleAgents?.length ?? 0)));
  const q = queries(r, g, { surface, bed }), sites = candidates(r, g), born = [], placements = [];
  for (const id of candidateOrder) {
    if (born.length >= available || rng(`${id}:present`) > .96) continue;
    const sizeM = selectedSize(id, rng), heading = rng(`${id}:heading`) * TAU, t = traits[id];
    for (const site of sites) {
      const agent = { id: `ocean:${r.id}:reef-residents-v2:${id}:${site.siteId}`, speciesId: id, sizeM,
        reefResidentHostId: site.hostId, reefResidentIndividualVersion: 2 };
      const p = sitePose(r, g, agent, site, heading, q);
      if (!p || (t.coral && !nearCoral(p, q))) continue;
      const support = supportSurvey({ ...r, agents: r.agents.concat(born) }, g, agent, p, heading, 0, q, true, false);
      if (!support) continue;
      placements.push({ id: agent.id, speciesId: id, siteId: site.siteId, hostId: site.hostId, mode: t.mode, sizeM,
        heading, pitch: 0, position: clone(p), supportNormal: clone(support.supportNormal) });
      born.push({ ...agent, regionId: r.id, position: clone(p), home: clone(p), refuge: clone(p), target: clone(p), velocity: { x: 0, y: 0, z: 0 },
        supportNormal: clone(support.supportNormal), heading, targetHeading: heading, pitch: 0, timeSec: 0,
        energy: .75 + rng(`${agent.id}:condition`) * .08, alive: true, state: t.mode === 'reef-foot' ? 'reef-foraging' : 'reef-cruising', stateSince: 0, parasites: 0, groupId: null, fleeUntil: 0,
        lastFeedAt: null, lastResidentIntake: null, nextBite: rng(`${agent.id}:bite`) * 3, nextDecision: 0, decisions: 0,
        habitat: `reef-resident-${t.mode}`, refugeHostId: site.hostId, dietProxy: REEF_DIVERSITY_FOOD_SCOPE,
        reefResidentSiteId: site.siteId, reefResidentMode: t.mode, reefResidentFoodPool: t.pool }); break;
    }
  }
  r.agents.push(...born); d.initialInputUnits += recordLivingAdmission(r, born);
  r.reefResidentsVersion = 2; d.version = 2; d.recipe = 'reef-residents-v2'; d.scope = REEF_DIVERSITY_SCOPE; d.foodScope = REEF_DIVERSITY_FOOD_SCOPE;
  d.legacyAddedIds = legacyAddedIds; d.candidateOrder = candidateOrder; d.addedIds.push(...born.map(a => a.id)); d.birthPlacements.push(...placements);
  return true;
}
function communityOrder(r, g) {
  const group = actualGroup(r, g); if (!group) return [];
  const index = (r.cz - group.cz) * 6 + r.cx - group.cx, offset = index % REEF_COMMUNITY_NEW_IDS.length;
  return [...REEF_COMMUNITY_NEW_IDS.slice(offset), ...REEF_COMMUNITY_NEW_IDS.slice(0, offset)];
}
function initializeReefCommunity(r, g, { fresh, surface, bed, capacity }) {
  if (!REEF_COMMUNITY_NEW_IDS.every(id => speciesById[id]?.foodPool === traits[id].pool) ||
    !initializeReefResidents(r, g, { fresh, surface, bed, capacity, version: 2 })) return false;
  const d = r.reefResidents, priorAddedIds = d.addedIds.slice(), communityCandidateOrder = communityOrder(r, g), rng = randomForV3(g, r);
  const cap = Math.min(20, Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0);
  const available = Math.min(6 - priorAddedIds.length, Math.max(0, cap - r.agents.length - (r.turtleAgents?.length ?? 0)));
  const q = queries(r, g, { surface, bed }), sites = candidates(r, g), born = [], placements = [];
  for (const id of communityCandidateOrder) {
    if (born.length >= available || rng(`${id}:present`) > .96) continue;
    const sizeM = selectedSize(id, rng), heading = rng(`${id}:heading`) * TAU, t = traits[id];
    for (const site of sites) {
      const agent = { id: `ocean:${r.id}:reef-residents-v3:${id}:${site.siteId}`, speciesId: id, sizeM,
        reefResidentHostId: site.hostId, reefResidentIndividualVersion: 3 };
      const p = sitePose(r, g, agent, site, heading, q);
      if (!p) continue;
      const support = supportSurvey({ ...r, agents: r.agents.concat(born) }, g, agent, p, heading, 0, q, true, false);
      if (!support) continue;
      placements.push({ id: agent.id, speciesId: id, siteId: site.siteId, hostId: site.hostId, mode: t.mode, sizeM,
        heading, pitch: 0, position: clone(p), supportNormal: clone(support.supportNormal) });
      born.push({ ...agent, regionId: r.id, position: clone(p), home: clone(p), refuge: clone(p), target: clone(p), velocity: { x: 0, y: 0, z: 0 },
        supportNormal: clone(support.supportNormal), heading, targetHeading: heading, pitch: 0, timeSec: 0,
        energy: .75 + rng(`${agent.id}:condition`) * .08, alive: true, state: t.mode === 'reef-foot' ? 'reef-foraging' : 'reef-cruising', stateSince: 0, parasites: 0, groupId: null, fleeUntil: 0,
        lastFeedAt: null, lastResidentIntake: null, nextBite: rng(`${agent.id}:bite`) * 3, nextDecision: 0, decisions: 0,
        habitat: `reef-resident-${t.mode}`, refugeHostId: site.hostId, dietProxy: REEF_COMMUNITY_FOOD_SCOPE,
        reefResidentSiteId: site.siteId, reefResidentMode: t.mode, reefResidentFoodPool: t.pool }); break;
    }
  }
  r.agents.push(...born); d.initialInputUnits += recordLivingAdmission(r, born);
  r.reefResidentsVersion = 3; d.version = 3; d.recipe = 'reef-residents-v3'; d.scope = REEF_COMMUNITY_SCOPE; d.foodScope = REEF_COMMUNITY_FOOD_SCOPE;
  d.priorAddedIds = priorAddedIds; d.communityCandidateOrder = communityCandidateOrder; d.addedIds.push(...born.map(a => a.id)); d.birthPlacements.push(...placements);
  return true;
}
export function reefResidentPositionValid(r, g, a, position = a.position, { surface, bed, heading = a.heading, pitch = a.pitch, occupancy = false } = {}) {
  return Boolean(nativeOwner(r, g) && isReefResidentAgent(a) && supportSurvey(r, g, a, position, heading, pitch, queries(r, g, { surface, bed }), occupancy));
}
function setState(a, value, clock, callback) { if (callback) callback(a, value, clock); else if (a.state !== value) { a.state = value; a.stateSince = clock; } }
function takeFood(r, a) {
  if (a.reefResidentIndividualVersion >= 2) return takeDiversityFood(r, a);
  const stockBefore = r.reefGuild.preyOrganicUnits, taken = Math.min(stockBefore, M.biteUnits); if (!(taken > 0)) return 0;
  r.reefGuild.preyOrganicUnits -= taken; const stockAfter = r.reefGuild.preyOrganicUnits;
  recordLivingIngestion(r, a, taken); a.energy = Math.min(1, a.energy + taken * 8); a.lastFeedAt = r.timeSec;
  a.lastResidentIntake = { timeSec: r.timeSec, pool: POOL, stockBefore, stockAfter, removedUnits: taken, ownerId: r.id,
    unit: LIVING_NETWORK_UNITS, agentPosition: clone(a.position), scope: REEF_RESIDENTS_FOOD_SCOPE };
  r.counters.feeding++; r.reefResidents.counters.feedings++; r.reefResidents.counters.consumedUnits += taken;
  r.reefResidents.events.push({ timeSec: r.timeSec, agentId: a.id, pool: POOL, removedUnits: taken, scope: REEF_RESIDENTS_FOOD_SCOPE });
  if (r.reefResidents.events.length > M.maximumEvents) r.reefResidents.events.splice(0, r.reefResidents.events.length - M.maximumEvents);
  return taken;
}
function takeDiversityFood(r, a) {
  const scope = individualFoodScope(a), t = traits[a.speciesId], pool = t.pool, owner = pool.startsWith('resources.') ? r.resources :
    pool.startsWith('basicNetwork.') ? r.basicNetwork : r.reefGuild;
  const key = pool.split('.')[1], stockBefore = owner?.[key];
  if (!nonnegative(stockBefore)) return 0;
  const taken = Math.min(stockBefore, M.biteUnits); if (!(taken > 0)) return 0;
  owner[key] -= taken; const stockAfter = owner[key];
  if (owner === r.resources) r.ledger.ingested += taken;
  recordLivingIngestion(r, a, taken); a.energy = Math.min(1, a.energy + taken * 8); a.lastFeedAt = r.timeSec;
  a.lastResidentIntake = { timeSec: r.timeSec, pool, stockBefore, stockAfter, removedUnits: taken, ownerId: r.id,
    unit: LIVING_NETWORK_UNITS, agentPosition: clone(a.position), scope };
  r.counters.feeding++; r.reefResidents.counters.feedings++; r.reefResidents.counters.consumedUnits += taken;
  r.reefResidents.events.push({ timeSec: r.timeSec, agentId: a.id, pool, removedUnits: taken, scope });
  if (r.reefResidents.events.length > M.maximumEvents) r.reefResidents.events.splice(0, r.reefResidents.events.length - M.maximumEvents);
  return taken;
}
function trajectoryClear(r, g, a, next, heading, q, budget, tolerance = 1e-8) {
  const turn = angle(heading - a.heading); let previous = a.position, travelled = 0;
  for (const fraction of [0, .25, .5, .75, 1]) {
    const h = a.heading + turn * fraction, x = a.position.x + (next.x - a.position.x) * fraction, z = a.position.z + (next.z - a.position.z) * fraction;
    const p = traits[a.speciesId].mode === 'reef-foot' ? groundPosition(g, a, x, z, h, q) :
      { x, z, y: a.position.y + (next.y - a.position.y) * fraction };
    if (!p || !supportSurvey(r, g, a, p, h, a.pitch, q, true)) return false;
    travelled += distance(previous, p); previous = p;
  }
  return travelled <= budget + tolerance;
}
export function tickReefResidentAgent(r, g, a, dt, { surface, bed, environment = {}, state } = {}) {
  if (!nativeOwner(r, g) || ![1, 2, 3].includes(r.reefResidentsVersion) || !isReefResidentAgent(a) || !a.alive ||
    individualVersion(a.speciesId) > r.reefResidentsVersion ||
    (r.reefResidentsVersion === 1 && !REEF_RESIDENTS_LEGACY_IDS.includes(a.speciesId)) || !close(dt, M.stepSec, 1e-10) ||
    !close(r.timeSec - a.timeSec, dt) || !r.reefResidents?.addedIds?.includes(a.id)) return false;
  const d = r.reefResidents, t = traits[a.speciesId], q = queries(r, g, { surface, bed }), rng = individualRandom(g, r, a);
  a.timeSec = r.timeSec; a.energy = Math.max(0, a.energy - dt * (t.mode === 'reef-water' ? .00012 : .000025));
  if (a.energy <= 0) { a.alive = false; a.velocity = { x: 0, y: 0, z: 0 }; setState(a, 'dead', r.timeSec, state);
    recordLivingDeath(r, a); r.counters.deaths++; d.counters.deaths++; return true; }
  const light = environment.lightAtDepth ?? 1, active = t.night ? light < .15 : light >= .04;
  a.velocity = { x: 0, y: 0, z: 0 };
  if (!active || !supportSurvey(r, g, a, a.position, a.heading, a.pitch, q)) { setState(a, active ? 'blocked' : 'resting', r.timeSec, state); return true; }
  if (r.timeSec >= a.nextDecision) {
    const key = `${a.id}:decision:${a.decisions++}`; a.nextDecision = r.timeSec + 4;
    for (let i = 0; i < 8; i++) {
      const h = rng(`${key}:heading:${i}`) * TAU, reach = rng(`${key}:reach:${i}`) * t.extent;
      const x = a.home.x + Math.cos(h) * reach, z = a.home.z + Math.sin(h) * reach, heading = Math.atan2(z - a.position.z, x - a.position.x);
      const candidate = t.mode === 'reef-foot' ? groundPosition(g, a, x, z, heading, q) : { x, y: a.home.y, z };
      if (candidate && supportSurvey(r, g, a, candidate, heading, 0, q, true)) { a.target = candidate; a.targetHeading = heading; break; }
    }
  }
  const previous = clone(a.position), delta = { x: a.target.x - previous.x, y: a.target.y - previous.y, z: a.target.z - previous.z }, length = Math.hypot(delta.x, delta.y, delta.z);
  const heading = a.heading + Math.max(-M.maximumTurnRadPerSec * dt, Math.min(M.maximumTurnRadPerSec * dt, angle(a.targetHeading - a.heading)));
  // Distance error is divided by dt when converted to saved velocity. Slow v2
  // crawlers need a stricter execution budget; keep original v1 paths exact.
  const movementTolerance = a.reefResidentIndividualVersion >= 2 ? 1e-10 : 1e-8;
  if (length > 1e-8) for (const fraction of [1, .5, .25, .125]) {
    const step = Math.min(length, t.speed * dt) * fraction, x = previous.x + delta.x / length * step, z = previous.z + delta.z / length * step;
    const next = t.mode === 'reef-foot' ? groundPosition(g, a, x, z, heading, q) : { x, y: previous.y + delta.y / length * step, z };
    if (!next || distance(previous, next) > t.speed * dt + movementTolerance || !trajectoryClear(r, g, a, next, heading, q, t.speed * dt, movementTolerance)) continue;
    const support = supportSurvey(r, g, a, next, heading, a.pitch, q, true); if (!support) continue;
    a.position = next; a.heading = heading; a.supportNormal = support.supportNormal; d.counters.moved++; break;
  }
  a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (a.position[k] - previous[k]) / dt]));
  if (length > 1e-8 && distance(a.position, previous) < 1e-12) { d.counters.blocked++; a.nextDecision = 0; }
  setState(a, t.mode === 'reef-water' ? 'reef-cruising' : 'reef-foraging', r.timeSec, state);
  if (r.timeSec >= a.nextBite && supportSurvey(r, g, a, a.position, a.heading, a.pitch, q, true) && (!t.coral || nearCoral(a.position, q))) {
    a.nextBite = r.timeSec + M.biteIntervalSec; setState(a, takeFood(r, a) > 0 ? 'resident-proxy-feeding' : 'searching', r.timeSec, state);
  }
  return true;
}
function intakeValid(r, a) {
  const e = a.lastResidentIntake;
  return e && nonnegative(e.timeSec) && e.timeSec <= a.timeSec && close(e.timeSec, a.lastFeedAt) && e.pool === POOL && e.ownerId === r.id &&
    e.unit === LIVING_NETWORK_UNITS && e.scope === REEF_RESIDENTS_FOOD_SCOPE && [e.stockBefore, e.stockAfter, e.removedUnits].every(nonnegative) &&
    e.removedUnits > 0 && e.removedUnits <= M.biteUnits && close(e.stockBefore - e.stockAfter, e.removedUnits, Number.EPSILON * 8 * Math.max(e.stockBefore, e.stockAfter, e.removedUnits)) &&
    point(e.agentPosition) && distance(e.agentPosition, a.home) <= traits[a.speciesId].extent + 1e-8;
}
export function validateReefResidentsRecord(r, g, { surface, bed, capacity = 20 } = {}) {
  if (!reefResidentsMarked(r)) return true;
  if ([2, 3].includes(r.reefResidentsVersion)) return validateReefDiversityRecord(r, g, { surface, bed, capacity });
  try {
    if (!nativeOwner(r, g) || r.reefResidentsVersion !== 1 || r.reefResidentsInitializedAtSec !== 0 ||
      Object.keys(r).some(k => k.startsWith('reefResidents') && !TOP.includes(k)) || !validateLivingNetworkRecord(r)) return false;
    const d = r.reefResidents, agents = r.agents.filter(isReefResidentAgent), group = actualGroup(r, g);
    if (!d || Object.keys(d).length !== FIELDS.length || !FIELDS.every(k => Object.hasOwn(d, k)) || d.version !== 1 || d.groupId !== `${group.cx},${group.cz}` ||
      d.recipe !== 'reef-residents-v1' || d.scope !== REEF_RESIDENTS_SCOPE || d.foodScope !== REEF_RESIDENTS_FOOD_SCOPE ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || agents.length > M.limit || new Set(agents.map(a => a.speciesId)).size !== agents.length ||
      new Set(d.addedIds).size !== agents.length || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
      new Set(d.birthPlacements.map(b => b.id)).size !== agents.length || !close(d.initialInputUnits, agents.length * .004) ||
      r.agents.length + (r.turtleAgents?.length ?? 0) > Math.min(20, capacity) ||
      r.agents.some(a => individualMarked(a) && !isReefResidentAgent(a)) || (r.turtleAgents ?? []).some(a => individualMarked(a) || isReefResidentAgent(a)) ||
      !['feedings', 'deaths', 'moved', 'blocked'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) ||
      d.counters.deaths !== agents.filter(a => !a.alive).length || !nonnegative(d.counters.consumedUnits) ||
      d.counters.consumedUnits > d.counters.feedings * M.biteUnits + 1e-10 || !Array.isArray(d.events) || d.events.length > M.maximumEvents) return false;
    if (!d.events.every(e => d.addedIds.includes(e.agentId) && nonnegative(e.timeSec) && e.timeSec <= r.timeSec && e.pool === POOL &&
      e.scope === REEF_RESIDENTS_FOOD_SCOPE && e.removedUnits > 0 && e.removedUnits <= M.biteUnits) || d.events.length > d.counters.feedings) return false;
    const q = queries(r, g, { surface, bed }), sites = candidates(r, g), rng = randomFor(g, r);
    return agents.every(a => {
      const b = d.birthPlacements.find(b => b.id === a.id), s = speciesById[a.speciesId], t = traits[a.speciesId], site = b && sites.find(p => p.siteId === b.siteId);
      if (!b || !site || a.id !== `ocean:${r.id}:reef-residents:${a.speciesId}:${site.siteId}` || a.regionId !== r.id || b.speciesId !== a.speciesId ||
        b.hostId !== site.hostId || a.reefResidentHostId !== site.hostId || a.refugeHostId !== site.hostId || a.reefResidentSiteId !== site.siteId ||
        a.reefResidentIndividualVersion !== 1 || a.reefResidentMode !== t.mode || b.mode !== t.mode || a.reefResidentFoodPool !== POOL ||
        Object.keys(a).some(k => k.startsWith('reefResident') && !INDIVIDUAL.includes(k)) || !d.addedIds.includes(a.id) ||
        !close(a.sizeM, selectedSize(a.speciesId, rng), 1e-12) || b.sizeM !== a.sizeM || !close(b.heading, rng(`${a.speciesId}:heading`) * TAU, 1e-12) || b.pitch !== 0 ||
        ![a.position, a.home, a.refuge, a.target, a.velocity, a.supportNormal, b.position, b.supportNormal].every(point) ||
        ![a.heading, a.targetHeading, a.pitch].every(Number.isFinite) || Math.abs(a.pitch) > s.support.pitchLimitRad ||
        distance(a.home, b.position) > 1e-10 || distance(a.refuge, b.position) > 1e-10 || distance(a.position, a.home) > t.extent + 1e-8 || distance(a.target, a.home) > t.extent + 1e-8 ||
        a.habitat !== `reef-resident-${t.mode}` || a.dietProxy !== REEF_RESIDENTS_FOOD_SCOPE || typeof a.alive !== 'boolean' || !nonnegative(a.energy) || a.energy > 1 ||
        !nonnegative(a.timeSec) || !close(a.timeSec, Math.round(a.timeSec * 10) * .1) || a.timeSec > r.timeSec || (a.alive && !close(a.timeSec, r.timeSec)) ||
        !nonnegative(a.stateSince) || a.stateSince > a.timeSec || !['resting', 'blocked', 'reef-cruising', 'reef-foraging', 'resident-proxy-feeding', 'searching', 'dead'].includes(a.state) ||
        !nonnegative(a.nextBite) || !nonnegative(a.nextDecision) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > t.speed + 1e-8 || !nonnegative(a.organicUnits) || typeof a.organicDeathRecorded !== 'boolean' ||
        (a.alive ? a.organicDeathRecorded || a.state === 'dead' : !a.organicDeathRecorded || a.organicUnits !== 0 || a.state !== 'dead' ||
          !close(a.stateSince, a.timeSec) || distance(a.velocity, { x: 0, y: 0, z: 0 }) > 0) ||
        (a.lastResidentIntake === null ? a.lastFeedAt !== null : !intakeValid(r, a))) return false;
      const birthPosition = sitePose(r, g, a, site, b.heading, q);
      if (!birthPosition || distance(b.position, birthPosition) > 1e-10) return false;
      const current = supportSurvey(r, g, a, a.position, a.heading, a.pitch, q), birth = supportSurvey(r, g, a, a.home, b.heading, 0, q);
      return Boolean(current && birth && supportSurvey(r, g, a, a.target, a.targetHeading, 0, q) &&
        distance(a.supportNormal, current.supportNormal) < 1e-8 && distance(b.supportNormal, birth.supportNormal) < 1e-8);
    });
  } catch { return false; }
}
function diversityIntakeValid(r, a) {
  if (a.reefResidentIndividualVersion === 1) return intakeValid(r, a);
  const e = a.lastResidentIntake, t = traits[a.speciesId];
  return e && nonnegative(e.timeSec) && e.timeSec <= a.timeSec && close(e.timeSec, a.lastFeedAt) && e.pool === t.pool && e.ownerId === r.id &&
    e.unit === LIVING_NETWORK_UNITS && e.scope === individualFoodScope(a) && [e.stockBefore, e.stockAfter, e.removedUnits].every(nonnegative) &&
    e.removedUnits > 0 && e.removedUnits <= M.biteUnits && close(e.stockBefore - e.stockAfter, e.removedUnits, Number.EPSILON * 8 * Math.max(e.stockBefore, e.stockAfter, e.removedUnits)) &&
    point(e.agentPosition) && distance(e.agentPosition, a.home) <= t.extent + 1e-8;
}
function validateReefDiversityRecord(r, g, { surface, bed, capacity }) {
  try {
    if (!nativeOwner(r, g) || r.reefResidentsInitializedAtSec !== 0 ||
      Object.keys(r).some(k => k.startsWith('reefResidents') && !TOP.includes(k)) || !validateLivingNetworkRecord(r)) return false;
    const d = r.reefResidents, agents = r.agents.filter(isReefResidentAgent), group = actualGroup(r, g);
    const old = agents.filter(a => REEF_RESIDENTS_LEGACY_IDS.includes(a.speciesId));
    const epoch = r.reefResidentsVersion, fields = epoch === 3 ? V3_FIELDS : V2_FIELDS;
    if (!d || Object.keys(d).length !== fields.length || !fields.every(k => Object.hasOwn(d, k)) || d.version !== epoch ||
      d.groupId !== `${group.cx},${group.cz}` || d.recipe !== `reef-residents-v${epoch}` ||
      d.scope !== (epoch === 3 ? REEF_COMMUNITY_SCOPE : REEF_DIVERSITY_SCOPE) || d.foodScope !== (epoch === 3 ? REEF_COMMUNITY_FOOD_SCOPE : REEF_DIVERSITY_FOOD_SCOPE) ||
      !Array.isArray(d.legacyAddedIds) || d.legacyAddedIds.length !== old.length || old.length > 2 ||
      !close(d.initialInputUnits, agents.length * .004) || !Array.isArray(d.candidateOrder) || JSON.stringify(d.candidateOrder) !== JSON.stringify(diversityOrder(r, g)) ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || agents.length > (epoch === 3 ? 6 : 4) || new Set(agents.map(a => a.speciesId)).size !== agents.length ||
      new Set(d.addedIds).size !== agents.length || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
      new Set(d.birthPlacements.map(b => b.id)).size !== agents.length || new Set(d.legacyAddedIds).size !== old.length || !old.every(a => d.legacyAddedIds.includes(a.id)) ||
      r.agents.length + (r.turtleAgents?.length ?? 0) > Math.min(20, capacity) ||
      r.agents.some(a => individualMarked(a) && !isReefResidentAgent(a)) || (r.turtleAgents ?? []).some(a => individualMarked(a) || isReefResidentAgent(a)) ||
      Object.keys(d.counters ?? {}).length !== 5 || !['feedings', 'deaths', 'moved', 'blocked'].every(k => Number.isSafeInteger(d.counters[k]) && d.counters[k] >= 0) ||
      d.counters.deaths !== agents.filter(a => !a.alive).length || !nonnegative(d.counters.consumedUnits) ||
      d.counters.consumedUnits > d.counters.feedings * M.biteUnits + 1e-10 || !Array.isArray(d.events) || d.events.length > M.maximumEvents || d.events.length > d.counters.feedings) return false;
    if (epoch === 3) {
      const prior = agents.filter(a => !REEF_COMMUNITY_NEW_IDS.includes(a.speciesId)).map(a => a.id);
      if (prior.length > 4 || !Array.isArray(d.priorAddedIds) || JSON.stringify(d.priorAddedIds) !== JSON.stringify(prior) ||
        !Array.isArray(d.communityCandidateOrder) || JSON.stringify(d.communityCandidateOrder) !== JSON.stringify(communityOrder(r, g))) return false;
    }
    if (!d.events.every(e => {
      const a = agents.find(a => a.id === e.agentId); if (!a) return false;
      const newer = a.reefResidentIndividualVersion >= 2;
      return nonnegative(e.timeSec) && e.timeSec <= r.timeSec && e.pool === (newer ? traits[a.speciesId].pool : POOL) &&
        e.scope === individualFoodScope(a) && e.removedUnits > 0 && e.removedUnits <= M.biteUnits;
    })) return false;
    const q = queries(r, g, { surface, bed }), sites = candidates(r, g);
    return agents.every(a => {
      const version = individualVersion(a.speciesId), legacy = version === 1;
      if (!version || version > epoch) return false;
      const rng = version === 3 ? randomForV3(g, r) : version === 2 ? randomForV2(g, r) : randomFor(g, r);
      const b = d.birthPlacements.find(b => b.id === a.id), s = speciesById[a.speciesId], t = traits[a.speciesId], site = b && sites.find(p => p.siteId === b.siteId);
      const scope = version === 3 ? REEF_COMMUNITY_FOOD_SCOPE : version === 2 ? REEF_DIVERSITY_FOOD_SCOPE : REEF_RESIDENTS_FOOD_SCOPE, pool = legacy ? POOL : t.pool;
      if (!b || !site || !s || !t || (!legacy && s.foodPool !== pool) || a.id !== `ocean:${r.id}:${legacy ? 'reef-residents' : `reef-residents-v${version}`}:${a.speciesId}:${site.siteId}` ||
        a.regionId !== r.id || b.speciesId !== a.speciesId || b.hostId !== site.hostId || a.reefResidentHostId !== site.hostId || a.refugeHostId !== site.hostId ||
        a.reefResidentSiteId !== site.siteId || a.reefResidentIndividualVersion !== version || a.reefResidentMode !== t.mode || b.mode !== t.mode || a.reefResidentFoodPool !== pool ||
        Object.keys(a).some(k => k.startsWith('reefResident') && !INDIVIDUAL.includes(k)) || !d.addedIds.includes(a.id) ||
        !close(a.sizeM, selectedSize(a.speciesId, rng), 1e-12) || b.sizeM !== a.sizeM || !close(b.heading, rng(`${a.speciesId}:heading`) * TAU, 1e-12) || b.pitch !== 0 ||
        ![a.position, a.home, a.refuge, a.target, a.velocity, a.supportNormal, b.position, b.supportNormal].every(point) ||
        ![a.heading, a.targetHeading, a.pitch].every(Number.isFinite) || Math.abs(a.pitch) > s.support.pitchLimitRad ||
        distance(a.home, b.position) > 1e-10 || distance(a.refuge, b.position) > 1e-10 || distance(a.position, a.home) > t.extent + 1e-8 || distance(a.target, a.home) > t.extent + 1e-8 ||
        a.habitat !== `reef-resident-${t.mode}` || a.dietProxy !== scope || typeof a.alive !== 'boolean' || !nonnegative(a.energy) || a.energy > 1 ||
        !nonnegative(a.timeSec) || !close(a.timeSec, Math.round(a.timeSec * 10) * .1) || a.timeSec > r.timeSec || (a.alive && !close(a.timeSec, r.timeSec)) ||
        !nonnegative(a.stateSince) || a.stateSince > a.timeSec || !['resting', 'blocked', 'reef-cruising', 'reef-foraging', 'resident-proxy-feeding', 'searching', 'dead'].includes(a.state) ||
        !nonnegative(a.nextBite) || !nonnegative(a.nextDecision) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > t.speed + 1e-8 || !nonnegative(a.organicUnits) || typeof a.organicDeathRecorded !== 'boolean' ||
        (a.alive ? a.organicDeathRecorded || a.state === 'dead' : !a.organicDeathRecorded || a.organicUnits !== 0 || a.state !== 'dead' ||
          !close(a.stateSince, a.timeSec) || distance(a.velocity, { x: 0, y: 0, z: 0 }) > 0) ||
        (a.lastResidentIntake === null ? a.lastFeedAt !== null : !diversityIntakeValid(r, a))) return false;
      const birthPosition = sitePose(r, g, a, site, b.heading, q);
      if (!birthPosition || distance(b.position, birthPosition) > 1e-10 || (!legacy && t.coral && !nearCoral(birthPosition, q))) return false;
      const current = supportSurvey(r, g, a, a.position, a.heading, a.pitch, q), birth = supportSurvey(r, g, a, a.home, b.heading, 0, q);
      return Boolean(current && birth && supportSurvey(r, g, a, a.target, a.targetHeading, 0, q) &&
        distance(a.supportNormal, current.supportNormal) < 1e-8 && distance(b.supportNormal, birth.supportNormal) < 1e-8);
    });
  } catch { return false; }
}
