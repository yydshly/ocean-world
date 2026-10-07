import { oceanMeadowLifeSpeciesCatalog, oceanMeadowLifeSpeciesById } from './oceanMeadowLifeSpecies.js';
import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { oceanTurtleSeagrassLeafPose } from './oceanTurtleGrazing.js';
import { recordLivingAdmission, recordLivingIngestion, recordLivingDeath, livingNetworkBalance, validateLivingNetworkRecord, LIVING_NETWORK_UNITS } from './livingEcologyNetwork.js';

export const OCEAN_MEADOW_LIFE_VERSION = 1;
export const OCEAN_MEADOW_LIFE_PROFILE = 'living-shallows-v1';
export const OCEAN_MEADOW_LIFE_AGENT_LIMIT = 4;
export const OCEAN_MEADOW_LIFE_IDS = Object.freeze(oceanMeadowLifeSpeciesCatalog.map(s => s.id));
export const OCEAN_MEADOW_LIFE_FOOD_SCOPE = 'existing owner-local mixed fields: unresolved reefGuild animal nutrition for seahorse/cuttlefish, plankton for sea pen, algae for conch; no resolved prey capture, new pool, seagrass consumption or complete natural diet';
export const OCEAN_MEADOW_LIFE_MODEL = Object.freeze({ stepSec: .1, clearanceM: .004, maximumFootGapM: .025,
  minimumNormalY: .94, maximumEvents: 32, biteUnits: .00018, biteIntervalSec: 4,
  conditionGainPerUnit: 8, maximumTurnRadiansPerSec: .65, nightLightMaximum: .08,
  grassContactScope: 'actual shared static leaf-tip mesh with original four-corner grounding; shader bend omitted, at most .05 local XZ units',
  scope: 'fresh sparse representatives; native owner clock, bounded full-body support and new-controller avoidance; legacy controllers unchanged, no global pair-collision proof; no reproduction, population refill or offline evolution' });
const M = OCEAN_MEADOW_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2;
const traits = Object.freeze({
  'sand-edge-seahorse': { mode: 'grass-tail', pool: 'reefGuild.preyOrganicUnits', speed: 0, extent: 0, pitch: 0 },
  'reef-cuttlefish': { mode: 'reef-water', pool: 'reefGuild.preyOrganicUnits', speed: .055, extent: 1.5, pitch: .15 },
  'barrel-sea-pen': { mode: 'soft-buried', pool: 'plankton', speed: 0, extent: 0, pitch: 0 },
  'spider-conch': { mode: 'rubble-floor', pool: 'algae', speed: .006, extent: .6, pitch: 0 },
});
const clone = v => structuredClone(v), point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const close = (a, b, t = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const topFields = ['meadowLifeVersion', 'meadowLifeInitializedAtSec', 'meadowLife'];
const individualFields = ['meadowLifeIndividualVersion', 'meadowLifeSiteId', 'meadowLifeHostId', 'meadowLifeLeafIndex', 'meadowLifeMode', 'meadowLifeFoodPool'];
const marked = a => a && Object.keys(a).some(k => k.startsWith('meadowLife'));
export const isOceanMeadowLifeAgent = a => OCEAN_MEADOW_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`meadow-life-v1|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const nativeOwner = (r, g) => g?.profile === OCEAN_MEADOW_LIFE_PROFILE && typeof g.chunk === 'function' && typeof g.sample === 'function' &&
  typeof g.floorSurface === 'function' && Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}` &&
  Array.isArray(r.agents) && r.basicNetwork && nonnegative(r.timeSec) && Number.isSafeInteger(r.ticks) && close(r.timeSec, r.ticks * .1);
function elements(g, r) { const rows = new Map(); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
  for (const e of g.chunk(r.cx + dx, r.cz + dz).elements) rows.set(e.id, e); return [...rows.values()]; }
function queries(g, r, supplied = {}) {
  const bed = supplied.bed ?? ((x, z) => g.floorSurface(x, z).height);
  const nearby = elements(g, r);
  const surface = supplied.surface ?? ((x, z, crown = false) => nearby.reduce((y, e) => {
    if (['rock', 'formation'].includes(e.kind)) return Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity);
    if (crown && e.kind === 'coral' && Math.hypot(x - e.x, z - e.z) <= Math.max(e.scale.x, e.scale.z) * .5) return Math.max(y, e.y + e.scale.y);
    return y;
  }, bed(x, z)));
  const obstacle = (x, z, crown = false) => {
    let y = surface(x, z, crown);
    if (crown) for (const p of r.biodiversity?.patches ?? []) y = Math.max(y, oceanBiodiversityPatchHeight(p, x, z) ?? -Infinity);
    return y;
  };
  return { bed, surface: obstacle, nearby };
}
const envelope = id => oceanMeadowLifeSpeciesById[id].normalizedEnvelope;
const depthValid = (g, id, y) => { const [low, high] = oceanMeadowLifeSpeciesById[id].depthSelectionM, d = (g.surfaceY ?? 8) - y; return d >= low && d <= high; };
function frame(normal, heading, pitch, tangent) {
  let up = { x: 0, y: 1, z: 0 };
  if (tangent) { if (!point(normal)) return null; const l = Math.hypot(normal.x, normal.y, normal.z); if (!(l > 0)) return null;
    up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / l])); }
  const dot = up.x * Math.cos(heading) + up.z * Math.sin(heading);
  let forward = { x: Math.cos(heading) - up.x * dot, y: -up.y * dot, z: Math.sin(heading) - up.z * dot };
  const l = Math.hypot(forward.x, forward.y, forward.z); if (l < 1e-8) return null;
  forward = Object.fromEntries(['x', 'y', 'z'].map(k => [k, forward[k] / l]));
  const side = { x: forward.y * up.z - forward.z * up.y, y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x };
  const f = Object.fromEntries(['x', 'y', 'z'].map(k => [k, forward[k] * Math.cos(pitch) + up[k] * Math.sin(pitch)]));
  const u = Object.fromEntries(['x', 'y', 'z'].map(k => [k, up[k] * Math.cos(pitch) - forward[k] * Math.sin(pitch)]));
  return { forward: f, up: u, side };
}
function bodyPoints(id, size, pose) {
  const e = envelope(id), points = [];
  for (const x of [e.x[0], (e.x[0] + e.x[1]) * .5, e.x[1]]) for (const y of [e.y[0], 0, e.y[1]]) for (const z of [e.z[0], 0, e.z[1]])
    points.push({ localY: y, ...Object.fromEntries(['x', 'y', 'z'].map(k => [k, size * (pose.forward[k] * x + pose.up[k] * y + pose.side[k] * z)])) });
  return points;
}
function owned(r, p, radius) { return point(p) && p.x >= r.cx * SIZE + radius + .1 && p.x <= (r.cx + 1) * SIZE - radius - .1 &&
  p.z >= r.cz * SIZE + radius + .1 && p.z <= (r.cz + 1) * SIZE - radius - .1; }
function hostFor(g, r, agent, kind = 'seagrass') { return g.chunk(r.cx, r.cz).elements.find(e => e.id === agent.meadowLifeHostId && e.kind === kind); }
/** Match the existing rendered Float32 rock triangles. Normals use the
 * inverse-transpose scale and the original +Y instance yaw, never the bed's
 * unrelated normal below a high reef-rock support. */
function rockSupport(rock, x, z) {
  if (!rock) return null;
  const c = Math.cos(rock.rotation ?? 0), s = Math.sin(rock.rotation ?? 0), dx = x - rock.x, dz = z - rock.z;
  const v = oceanRockSurface(rock.profile || 'mound', (dx * c - dz * s) / rock.scale.x, (dx * s + dz * c) / rock.scale.z);
  if (!v) return null;
  const nx = v.normal.x / rock.scale.x, ny = v.normal.y / rock.scale.y, nz = v.normal.z / rock.scale.z;
  const world = { x: nx * c + nz * s, y: ny, z: -nx * s + nz * c }, length = Math.hypot(world.x, world.y, world.z);
  return { height: rock.y + v.height * rock.scale.y, normal: Object.fromEntries(['x', 'y', 'z'].map(k => [k, world[k] / length])) };
}
function supportAt(g, r, a, x, z, q) {
  return a.speciesId === 'spider-conch' ? rockSupport(hostFor(g, r, a, 'rock'), x, z) : { height: q.bed(x, z), normal: g.floorSurface(x, z).normal };
}
function niche(g, r, agent, p, q) {
  const mode = traits[agent.speciesId].mode;
  if (mode === 'grass-tail') return Boolean(hostFor(g, r, agent));
  if (mode === 'soft-buried') return g.sample(p.x, p.z).substrate !== 'rock';
  if (mode === 'rubble-floor') return Boolean(hostFor(g, r, agent, 'rock'));
  return q.nearby.some(e => ['rock', 'coral', 'rubble'].includes(e.kind) && Math.hypot(e.x - p.x, e.z - p.z) <= 5);
}
function bodyClear(r, agent, p, radius, height) { return [...r.agents, ...(r.turtleAgents ?? [])].every(a => {
  if (a.id === agent.id || !a.alive || !point(a.position)) return true;
  const other = isOceanMeadowLifeAgent(a) ? envelope(a.speciesId) : null, size = a.sizeM ?? .1;
  const rad = size * (other?.horizontalRadiusUnits ?? (a.speciesId === 'blue-spotted-ray' ? 2.3 : .7));
  const low = a.position.y + size * (other?.y[0] ?? -.35), high = a.position.y + size * (other?.y[1] ?? .7);
  if (p.y + height + .025 < low || p.y - radius - .025 > high) return true;
  return Math.hypot(p.x - a.position.x, p.z - a.position.z) >= radius + rad + .04;
}); }
function survey(r, g, agent, p, heading, pitch, q, occupancy = false) {
  const t = traits[agent.speciesId], e = envelope(agent.speciesId);
  if (!point(p) || !Number.isFinite(heading) || !Number.isFinite(pitch) || Math.abs(pitch) > t.pitch || !depthValid(g, agent.speciesId, p.y) || !niche(g, r, agent, p, q)) return null;
  const ground = supportAt(g, r, agent, p.x, p.z, q), tangent = ['soft-buried', 'rubble-floor'].includes(t.mode);
  if (!ground) return null;
  const pose = frame(tangent ? ground.normal : null, heading, pitch, tangent); if (!pose || (tangent && pose.up.y < M.minimumNormalY)) return null;
  const offsets = bodyPoints(agent.speciesId, agent.sizeM, pose), radius = Math.max(e.horizontalRadiusUnits * agent.sizeM, ...offsets.map(o => Math.hypot(o.x, o.z)));
  if (!owned(r, p, radius)) return null;
  if (t.mode === 'grass-tail') {
    const host = hostFor(g, r, agent), leaf = oceanTurtleSeagrassLeafPose(g, host, agent.meadowLifeLeafIndex);
    if (!leaf || distance(p, leaf) > 1e-8) return null;
  }
  let low = Infinity, high = -Infinity;
  for (const offset of offsets) {
    const x = p.x + offset.x, y = p.y + offset.y, z = p.z + offset.z, floor = q.bed(x, z), solid = q.surface(x, z, true);
    if (![floor, solid].every(Number.isFinite) || y >= (g.surfaceY ?? 8) - .5 || !depthValid(g, agent.speciesId, y)) return null;
    if (tangent) {
      const supporting = supportAt(g, r, agent, x, z, q);
      if (!supporting || supporting.normal.y < M.minimumNormalY) return null;
      if (t.mode === 'soft-buried' ? g.sample(x, z).substrate === 'rock' || solid - floor > .025 : solid - supporting.height > .025) return null;
      if (close(offset.localY, 0)) { low = Math.min(low, supporting.height - offset.y); high = Math.max(high, supporting.height - offset.y); }
      // Only the source-qualified sea pen peduncle may be inside sediment.
      if (!(t.mode === 'soft-buried' && offset.localY < 0) && y < supporting.height + M.clearanceM - 1e-8) return null;
      if (t.mode === 'rubble-floor' && y < solid + M.clearanceM - 1e-8) return null;
    } else if (y < solid + M.clearanceM) return null;
  }
  if (tangent && (high - low > M.maximumFootGapM || !close(p.y, high + M.clearanceM, 1e-7))) return null;
  for (const plant of q.nearby) {
    if (!['seagrass', 'coral', 'rubble'].includes(plant.kind)) continue;
    if (t.mode === 'grass-tail' && plant.id === agent.meadowLifeHostId) continue;
    const r0 = Math.max(plant.scale?.x ?? 0, plant.scale?.z ?? 0) * (plant.kind === 'seagrass' ? .49 : .55);
    const bottom = p.y + Math.min(...offsets.map(o => o.y)), top = p.y + Math.max(...offsets.map(o => o.y));
    if (bottom < plant.y + (plant.scale?.y ?? 0) * 1.02 + .03 && top > plant.y - .03 && Math.hypot(p.x - plant.x, p.z - plant.z) < radius + r0 + .02) return null;
  }
  if (occupancy && !bodyClear(r, agent, p, radius, (e.y[1] - e.y[0]) * agent.sizeM)) return null;
  return { position: clone(p), supportNormal: tangent ? pose.up : { x: 0, y: 1, z: 0 } };
}
function supportedPosition(g, r, agent, x, z, heading, q) {
  const support = supportAt(g, r, agent, x, z, q), pose = support && frame(support.normal, heading, 0, true); if (!pose) return null;
  let y = -Infinity;
  for (const p of bodyPoints(agent.speciesId, agent.sizeM, pose).filter(p => close(p.localY, 0))) {
    const surface = supportAt(g, r, agent, x + p.x, z + p.z, q); if (!surface) return null;
    y = Math.max(y, surface.height - p.y);
  }
  return { x, y: y + M.clearanceM, z };
}
function nativeSites(g, r, rng) {
  const chunk = g.chunk(r.cx, r.cz), sites = [];
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) { const id = `grid:${x},${z}`;
    sites.push({ siteId: id, x: chunk.origin.x + (x + .2 + rng(`${id}:x`) * .6) * 8, z: chunk.origin.z + (z + .2 + rng(`${id}:z`) * .6) * 8 }); }
  for (const e of chunk.elements.filter(e => ['rock', 'rubble', 'algae'].includes(e.kind))) for (let i = 0; i < 4; i++) {
    const a = (i / 4 + rng(`around:${e.id}`)) * TAU, reach = Math.max(e.scale.x, e.scale.z) * .6 + .5;
    sites.push({ siteId: `edge:${e.id}:${i}`, x: e.x + Math.cos(a) * reach, z: e.z + Math.sin(a) * reach }); }
  sites.sort((a, b) => rng(`order:${a.siteId}`) - rng(`order:${b.siteId}`) || a.siteId.localeCompare(b.siteId));
  const hardSites = [];
  for (const e of chunk.elements.filter(e => e.kind === 'rock')) for (let iz = -2; iz <= 2; iz++) for (let ix = -2; ix <= 2; ix++) {
    const x = ix * .06 * e.scale.x, z = iz * .06 * e.scale.z, c = Math.cos(e.rotation ?? 0), s = Math.sin(e.rotation ?? 0);
    hardSites.push({ siteId: `hard:${e.id}:${ix},${iz}`, hostId: e.id, leafIndex: null, x: e.x + x * c + z * s, z: e.z - x * s + z * c });
  }
  hardSites.sort((a, b) => rng(`order:${a.siteId}`) - rng(`order:${b.siteId}`) || a.siteId.localeCompare(b.siteId));
  return { sites, hardSites, chunk };
}
function sitePose(g, r, id, site, sizeM, heading, q) {
  const t = traits[id], agent = { speciesId: id, sizeM, meadowLifeHostId: site.hostId ?? null, meadowLifeLeafIndex: site.leafIndex ?? null };
  return t.mode === 'grass-tail' ? oceanTurtleSeagrassLeafPose(g, hostFor(g, r, agent), site.leafIndex) :
    t.mode === 'reef-water' ? { x: site.x, z: site.z, y: q.surface(site.x, site.z, true) + .4 + sizeM * .32 } :
      supportedPosition(g, r, agent, site.x, site.z, heading, q);
}
function selectedSize(id, rng) { const s = oceanMeadowLifeSpeciesById[id]; return s.sizeRangeM[0] + rng(`${id}:size`) * (s.sizeRangeM[1] - s.sizeRangeM[0]); }
export function createOceanMeadowLifePlan(g, r, { availableSlots = 0, maxAdded = 4, surface, bed } = {}) {
  if (!nativeOwner(r, g)) return freeze({ version: 1, placements: [] });
  const slots = Math.min(4, Math.max(0, Math.floor(availableSlots)), Math.max(0, Math.floor(maxAdded))), placements = [], rng = randomFor(g, r), q = queries(g, r, { surface, bed });
  const { sites, hardSites, chunk } = nativeSites(g, r, rng);
  for (const id of OCEAN_MEADOW_LIFE_IDS) {
    if (placements.length >= slots || rng(`${id}:present`) > .82) continue;
    const t = traits[id], sizeM = selectedSize(id, rng), heading = rng(`${id}:heading`) * TAU;
    const choices = t.mode === 'grass-tail' ? chunk.elements.filter(e => e.kind === 'seagrass').map(e => ({ siteId: `grass:${e.id}:0`, hostId: e.id, leafIndex: 0 })) :
      t.mode === 'rubble-floor' ? hardSites : sites.map(site => ({ ...site, hostId: null, leafIndex: null }));
    for (const site of choices) {
      const agent = { id: `ocean:${r.id}:meadow-life:${id}:${site.siteId}`, speciesId: id, sizeM, meadowLifeHostId: site.hostId, meadowLifeLeafIndex: site.leafIndex };
      const support = survey({ ...r, agents: r.agents.concat(placements.map(p => ({ ...p, alive: true }))) }, g, agent, sitePose(g, r, id, site, sizeM, heading, q), heading, 0, q, true);
      if (!support) continue;
      placements.push({ ...agent, siteId: site.siteId, mode: t.mode, foodPool: t.pool, position: support.position, supportNormal: support.supportNormal, heading, pitch: 0 }); break;
    }
  }
  return freeze({ version: 1, placements });
}
export function initializeOceanMeadowLife(r, g, { fresh = false, capacity = 20, maxAdded = 4, surface, bed } = {}) {
  if (!fresh || !nativeOwner(r, g) || r.timeSec !== 0 || Object.keys(r).some(k => k.startsWith('meadowLife')) ||
    [...r.agents, ...(r.turtleAgents ?? [])].some(a => isOceanMeadowLifeAgent(a) || marked(a)) || !validateLivingNetworkRecord(r)) return false;
  const cap = Math.min(20, Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0), occupied = r.agents.length + (r.turtleAgents?.length ?? 0);
  if (occupied > 20) return false;
  const plan = createOceanMeadowLifePlan(g, r, { availableSlots: Math.max(0, cap - occupied), maxAdded, surface, bed }), rng = randomFor(g, r);
  const born = plan.placements.map(p => ({ id: p.id, regionId: r.id, speciesId: p.speciesId, sizeM: p.sizeM,
    position: clone(p.position), home: clone(p.position), refuge: clone(p.position), target: clone(p.position), velocity: { x: 0, y: 0, z: 0 },
    heading: p.heading, targetHeading: p.heading, pitch: p.pitch, supportNormal: clone(p.supportNormal), timeSec: 0,
    energy: .72 + rng(`${p.id}:condition`) * .1, alive: true, state: traits[p.speciesId].speed ? 'foraging' : p.speciesId === 'barrel-sea-pen' ? 'contracted' : 'tail-holding', stateSince: 0,
    colonyExtension: p.speciesId === 'barrel-sea-pen' ? 0 : null, parasites: 0, lastFeedAt: null, lastMeadowIntake: null, nextBite: rng(`${p.id}:bite`) * 3,
    nextDecision: 0, decisions: 0, fleeUntil: 0, groupId: null, habitat: `meadow-life-${p.mode}`, refugeHostId: p.meadowLifeHostId,
    meadowLifeIndividualVersion: 1, meadowLifeSiteId: p.siteId, meadowLifeHostId: p.meadowLifeHostId, meadowLifeLeafIndex: p.meadowLifeLeafIndex,
    meadowLifeMode: p.mode, meadowLifeFoodPool: p.foodPool, dietProxy: OCEAN_MEADOW_LIFE_FOOD_SCOPE,
    ...(p.mode === 'grass-tail' ? { grassContactScope: M.grassContactScope } : {}) }));
  r.agents.push(...born); const input = recordLivingAdmission(r, born);
  r.meadowLifeVersion = 1; r.meadowLifeInitializedAtSec = 0;
  r.meadowLife = { version: 1, scope: M.scope, foodScope: OCEAN_MEADOW_LIFE_FOOD_SCOPE, initialInputUnits: input,
    addedIds: born.map(a => a.id), birthPlacements: clone(plan.placements), ticks: 0, lastTickSec: 0,
    counters: { feedings: 0, consumedUnits: 0, deaths: 0, moved: 0 }, events: [] };
  return true;
}
export function oceanMeadowLifePositionValid(r, g, agent, position = agent.position, { surface, bed, heading = agent.heading, pitch = agent.pitch, occupancy = false } = {}) {
  return nativeOwner(r, g) && isOceanMeadowLifeAgent(agent) && Boolean(survey(r, g, agent, position, heading, pitch, queries(g, r, { surface, bed }), occupancy));
}
export function oceanMeadowLifeBalance(r) { return r?.basicNetwork ? livingNetworkBalance(r) : NaN; }
export function oceanMeadowLifeSnapshot(r) { return Object.hasOwn(r, 'meadowLifeVersion') ? Object.fromEntries(topFields.map(k => [k, clone(r[k])])) : {}; }
function setState(a, state, clock) { if (a.state !== state) { a.state = state; a.stateSince = clock; } }
function takeFood(r, a, amount) {
  let taken, stockBefore, stockAfter;
  if (a.meadowLifeFoodPool === 'reefGuild.preyOrganicUnits') { if (r.reefGuildVersion !== 1 || !nonnegative(r.reefGuild?.preyOrganicUnits)) return 0;
    stockBefore = r.reefGuild.preyOrganicUnits; taken = Math.min(stockBefore, amount); if (!(taken > 0)) return 0;
    r.reefGuild.preyOrganicUnits -= taken; stockAfter = r.reefGuild.preyOrganicUnits;
  } else { const pool = a.meadowLifeFoodPool; stockBefore = r.resources[pool]; taken = Math.min(stockBefore, amount); if (!(taken > 0)) return 0;
    r.resources[pool] -= taken; r.ledger.ingested += taken; stockAfter = r.resources[pool]; }
  recordLivingIngestion(r, a, taken); a.energy = Math.min(1, a.energy + taken * M.conditionGainPerUnit); a.lastFeedAt = r.timeSec;
  a.lastMeadowIntake = { timeSec: r.timeSec, pool: a.meadowLifeFoodPool, stockBefore, stockAfter, removedUnits: taken,
    ownerId: r.id, unit: LIVING_NETWORK_UNITS, agentPosition: clone(a.position), scope: OCEAN_MEADOW_LIFE_FOOD_SCOPE };
  r.counters.feeding++; r.meadowLife.counters.feedings++; r.meadowLife.counters.consumedUnits += taken;
  r.meadowLife.events.push({ timeSec: r.timeSec, agentId: a.id, pool: a.meadowLifeFoodPool, removedUnits: taken, scope: OCEAN_MEADOW_LIFE_FOOD_SCOPE });
  if (r.meadowLife.events.length > M.maximumEvents) r.meadowLife.events.splice(0, r.meadowLife.events.length - M.maximumEvents);
  return taken;
}
export function tickOceanMeadowLife(r, g, dt, { surface, bed, environmentAt } = {}) {
  const d = r?.meadowLife;
  if (!nativeOwner(r, g) || r.meadowLifeVersion !== 1 || !close(dt, .1, 1e-10) || !d || !close(r.timeSec - d.lastTickSec, .1) || r.ticks !== d.ticks + 1 ||
    !validateOceanMeadowLifeRecord(r, g, { surface, bed, beforeTick: true })) return false;
  const q = queries(g, r, { surface, bed }), rng = randomFor(g, r);
  for (const a of r.agents.filter(isOceanMeadowLifeAgent)) {
    if (!a.alive) continue;
    const t = traits[a.speciesId], env = environmentAt?.(a.position, a) ?? { lightAtDepth: 1, currentMps: 0 }, light = env.lightAtDepth ?? 1;
    a.timeSec = r.timeSec; a.energy = Math.max(0, a.energy - dt * (t.speed ? .00008 : .000025));
    if (a.energy <= 0) { a.alive = false; a.velocity = { x: 0, y: 0, z: 0 }; setState(a, 'dead', r.timeSec);
      recordLivingDeath(r, a); r.counters.deaths++; d.counters.deaths++; continue; }
    const hour = Number.isFinite(env.hour) ? ((env.hour % 24) + 24) % 24 : 10;
    const night = (hour < 6 || hour >= 18) && light <= M.nightLightMaximum;
    if (a.speciesId === 'barrel-sea-pen') { a.colonyExtension = Math.max(0, Math.min(1, a.colonyExtension + (night ? 1 : -1) * dt * .5));
      a.velocity = { x: 0, y: 0, z: 0 }; setState(a, night ? 'expanding' : 'contracted', r.timeSec); if (!night || a.colonyExtension < .9) continue;
    } else if (t.speed) {
      if (r.timeSec >= a.nextDecision) { const key = `${a.id}:decision:${a.decisions++}`; a.nextDecision = r.timeSec + 4;
        for (let i = 0; i < 6; i++) { const h = rng(`${key}:heading:${i}`) * TAU, reach = rng(`${key}:reach:${i}`) * t.extent;
          const x = a.home.x + Math.cos(h) * reach, z = a.home.z + Math.sin(h) * reach, heading = Math.atan2(z - a.position.z, x - a.position.x);
          const candidate = t.mode === 'rubble-floor' ? supportedPosition(g, r, a, x, z, heading, q) : { x, z, y: a.home.y };
          if (survey(r, g, a, candidate, heading, 0, q, true)) { a.target = candidate; a.targetHeading = heading; break; } }
      }
      const previous = clone(a.position), delta = { x: a.target.x - previous.x, y: a.target.y - previous.y, z: a.target.z - previous.z }, length = Math.hypot(delta.x, delta.y, delta.z);
      const heading = a.heading + Math.max(-M.maximumTurnRadiansPerSec * dt, Math.min(M.maximumTurnRadiansPerSec * dt, angle(a.targetHeading - a.heading)));
      if (survey(r, g, a, previous, heading, a.pitch, q, true)) a.heading = heading;
      if (length > 1e-8) for (const fraction of [1, .5, .25]) { const step = Math.min(length, t.speed * dt) * fraction;
        let next = { x: previous.x + delta.x / length * step, y: previous.y + delta.y / length * step, z: previous.z + delta.z / length * step };
        if (t.mode === 'rubble-floor') next = supportedPosition(g, r, a, next.x, next.z, a.heading, q);
        let mid = next && { x: (previous.x + next.x) * .5, y: (previous.y + next.y) * .5, z: (previous.z + next.z) * .5 };
        if (mid && t.mode === 'rubble-floor') mid = supportedPosition(g, r, a, mid.x, mid.z, a.heading, q);
        const support = next && survey(r, g, a, next, a.heading, a.pitch, q, true);
        if (!support || !mid || distance(previous, mid) + distance(mid, next) > t.speed * dt + 1e-8 || !survey(r, g, a, mid, a.heading, a.pitch, q, true)) continue;
        a.position = next; a.supportNormal = clone(support.supportNormal);
        d.counters.moved++; break; }
      a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (a.position[k] - previous[k]) / dt])); setState(a, 'foraging', r.timeSec);
    } else setState(a, 'tail-holding', r.timeSec);
    if (r.timeSec >= a.nextBite) { a.nextBite = r.timeSec + M.biteIntervalSec;
      setState(a, takeFood(r, a, M.biteUnits) > 0 ? 'meadow-proxy-feeding' : 'searching', r.timeSec); }
  }
  d.ticks = r.ticks; d.lastTickSec = r.timeSec; return true;
}
export function validateOceanMeadowLifeRecord(r, g, { surface, bed, capacity = 20, beforeTick = false } = {}) {
  if (!nativeOwner(r, g)) return false;
  const agents = r.agents.filter(isOceanMeadowLifeAgent), keys = Object.keys(r).filter(k => k.startsWith('meadowLife'));
  const has = keys.length || [...r.agents, ...(r.turtleAgents ?? [])].some(marked) || agents.length || (r.turtleAgents ?? []).some(isOceanMeadowLifeAgent);
  if (!has) return true;
  const d = r.meadowLife;
  if (r.meadowLifeVersion !== 1 || r.meadowLifeInitializedAtSec !== 0 || !d || d.version !== 1 || d.scope !== M.scope || d.foodScope !== OCEAN_MEADOW_LIFE_FOOD_SCOPE ||
    keys.some(k => !topFields.includes(k)) || !Number.isSafeInteger(d.ticks) || d.ticks < 0 || !close(d.lastTickSec, d.ticks * .1) ||
    r.ticks !== d.ticks + (beforeTick ? 1 : 0) || !close(r.timeSec - d.lastTickSec, beforeTick ? .1 : 0) ||
    !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
    new Set(d.addedIds).size !== agents.length || new Set(d.birthPlacements.map(p => p.id)).size !== agents.length || new Set(agents.map(a => a.speciesId)).size !== agents.length ||
    agents.length > 4 || r.agents.length + (r.turtleAgents?.length ?? 0) > Math.min(20, capacity) || !close(d.initialInputUnits, agents.length * .004) ||
    !['feedings', 'deaths', 'moved'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || !nonnegative(d.counters?.consumedUnits) ||
    !Array.isArray(d.events) || d.events.length > 32 || !validateLivingNetworkRecord(r) || r.agents.some(a => marked(a) && !isOceanMeadowLifeAgent(a)) ||
    (r.turtleAgents ?? []).some(a => marked(a) || isOceanMeadowLifeAgent(a))) return false;
  const q = queries(g, r, { surface, bed }), rng = randomFor(g, r), native = nativeSites(g, r, rng);
  if (!d.events.every(e => d.addedIds.includes(e.agentId) && nonnegative(e.timeSec) && e.timeSec <= d.lastTickSec &&
    nonnegative(e.removedUnits) && e.removedUnits > 0 && e.removedUnits <= M.biteUnits && e.pool === traits[agents.find(a => a.id === e.agentId).speciesId].pool && e.scope === OCEAN_MEADOW_LIFE_FOOD_SCOPE)) return false;
  return agents.every(a => {
    const b = d.birthPlacements.find(p => p.id === a.id), s = oceanMeadowLifeSpeciesById[a.speciesId], t = traits[a.speciesId];
    if (!b || a.id !== `ocean:${r.id}:meadow-life:${a.speciesId}:${b.siteId}` || a.regionId !== r.id || b.speciesId !== a.speciesId ||
      a.meadowLifeIndividualVersion !== 1 || a.meadowLifeSiteId !== b.siteId || a.meadowLifeHostId !== b.meadowLifeHostId || a.meadowLifeLeafIndex !== b.meadowLifeLeafIndex ||
      a.meadowLifeMode !== t.mode || b.mode !== t.mode || a.meadowLifeFoodPool !== t.pool || b.foodPool !== t.pool || a.refugeHostId !== a.meadowLifeHostId ||
      Object.keys(a).some(k => k.startsWith('meadowLife') && !individualFields.includes(k)) ||
      !d.addedIds.includes(a.id) || !close(a.sizeM, selectedSize(a.speciesId, rng), 1e-12) || a.sizeM !== b.sizeM || a.sizeM < s.sizeRangeM[0] || a.sizeM > s.sizeRangeM[1] ||
      ![a.position, a.home, a.refuge, a.target, a.velocity, a.supportNormal, b.position, b.supportNormal].every(point) ||
      ![a.heading, a.targetHeading, b.heading, a.pitch, b.pitch].every(Number.isFinite) || Math.abs(a.pitch) > t.pitch || b.pitch !== 0 ||
      distance(a.home, b.position) > 1e-10 || distance(a.refuge, b.position) > 1e-10 || distance(a.position, a.home) > t.extent + 1e-8 || distance(a.target, a.home) > t.extent + 1e-8 ||
      typeof a.alive !== 'boolean' || !nonnegative(a.energy) || a.energy > 1 || !nonnegative(a.timeSec) || a.timeSec > d.lastTickSec + 1e-8 || (a.alive && !close(a.timeSec, d.lastTickSec)) ||
      !['foraging', 'tail-holding', 'contracted', 'expanding', 'meadow-proxy-feeding', 'searching', 'dead'].includes(a.state) || (a.alive && a.state === 'dead') || !close(a.timeSec, Math.round(a.timeSec * 10) * .1) ||
      !nonnegative(a.nextBite) || !nonnegative(a.nextDecision) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 || !nonnegative(a.stateSince) || a.stateSince > a.timeSec + 1e-8 ||
      !nonnegative(a.organicUnits) || typeof a.organicDeathRecorded !== 'boolean' || a.dietProxy !== OCEAN_MEADOW_LIFE_FOOD_SCOPE ||
      Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > t.speed + 1e-8 || (a.lastFeedAt !== null && (!nonnegative(a.lastFeedAt) || a.lastFeedAt > a.timeSec)) ||
      (a.speciesId === 'barrel-sea-pen' ? !nonnegative(a.colonyExtension) || a.colonyExtension > 1 : a.colonyExtension !== null) ||
      (a.alive ? a.organicDeathRecorded : !a.organicDeathRecorded || a.organicUnits !== 0 || a.state !== 'dead' || !close(a.stateSince, a.timeSec) || distance(a.velocity, {x:0,y:0,z:0}) > 0) ||
      (t.mode === 'grass-tail' && (a.meadowLifeLeafIndex !== 0 || a.grassContactScope !== M.grassContactScope))) return false;
    const site = t.mode === 'grass-tail' ? native.chunk.elements.filter(e => e.kind === 'seagrass').map(e => ({ siteId: `grass:${e.id}:0`, hostId: e.id, leafIndex: 0 })).find(p => p.siteId === b.siteId) :
      (t.mode === 'rubble-floor' ? native.hardSites : native.sites).find(p => p.siteId === b.siteId);
    if (!site || (site.hostId ?? null) !== a.meadowLifeHostId || (site.leafIndex ?? null) !== a.meadowLifeLeafIndex || !close(b.heading, rng(`${a.speciesId}:heading`) * TAU, 1e-12)) return false;
    const canonical = sitePose(g, r, a.speciesId, site, a.sizeM, b.heading, q);
    if (!canonical || distance(canonical, b.position) > 1e-10) return false;
    if (a.lastMeadowIntake === null ? a.lastFeedAt !== null : !intakeValid(r, a)) return false;
    const support = survey(r, g, a, a.position, a.heading, a.pitch, q), birth = survey(r, g, a, a.home, b.heading, 0, q);
    return Boolean(support && birth && distance(a.supportNormal, support.supportNormal) < 1e-8 && distance(b.supportNormal, birth.supportNormal) < 1e-8 &&
      survey(r, g, a, a.target, a.targetHeading, 0, q));
  });
}
function intakeValid(r, a) {
  const e = a.lastMeadowIntake;
  return e && nonnegative(e.timeSec) && e.timeSec <= a.timeSec && close(e.timeSec, a.lastFeedAt) && e.pool === a.meadowLifeFoodPool &&
    nonnegative(e.stockBefore) && nonnegative(e.stockAfter) && nonnegative(e.removedUnits) && e.removedUnits > 0 && e.removedUnits <= M.biteUnits &&
    close(e.stockBefore - e.stockAfter, e.removedUnits, Number.EPSILON * 8 * Math.max(e.stockBefore, e.stockAfter, e.removedUnits)) && e.ownerId === r.id && e.unit === LIVING_NETWORK_UNITS &&
    point(e.agentPosition) && owned(r, e.agentPosition, envelope(a.speciesId).horizontalRadiusUnits * a.sizeM) &&
    distance(e.agentPosition, a.home) <= traits[a.speciesId].extent + 1e-8 && e.scope === OCEAN_MEADOW_LIFE_FOOD_SCOPE;
}
