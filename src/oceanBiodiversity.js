import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { recordLivingAdmission, recordLivingIngestion } from './livingEcologyNetwork.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { oceanBiodiversitySpeciesById } from './oceanBiodiversitySpecies.js';

export const OCEAN_BIODIVERSITY_VERSION = 1;
export const OCEAN_BIODIVERSITY_PROFILE = 'living-shallows-v1';
export const OCEAN_BIODIVERSITY_PATCH_LIMIT = 20;
export const OCEAN_BIODIVERSITY_AGENT_LIMIT = 6;
export const OCEAN_BIODIVERSITY_IDS = Object.freeze(['tropical-urchin', 'feather-duster', 'sand-goby',
  'reef-parrotfish', 'shallow-anemone', 'clown-anemonefish']);
export const OCEAN_BIODIVERSITY_PATCH_SCOPE = 'static-habitat-descriptor-not-additional-simulated-biomass';
const TAU = Math.PI * 2, OFFSET = .004;
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const ranges = Object.freeze(Object.fromEntries(OCEAN_BIODIVERSITY_IDS.map(id => [id, oceanBiodiversitySpeciesById[id].sizeRangeM])));
const fishIds = new Set(['sand-goby', 'reef-parrotfish', 'clown-anemonefish']);
const fixedIds = new Set(['feather-duster', 'shallow-anemone']);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const hash = value => { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; };
const defaultRandom = (generator, region) => salt => hash(`biodiversity-v1|${typeof generator.seed}:${generator.seed}|${region.id}|${salt}`) / 4294967296;
export const isOceanBiodiversityAgent = agent => OCEAN_BIODIVERSITY_IDS.includes(agent?.speciesId);

// Correlated preference is sampled in world metres and never from the camera.
// Actual generated niches remain the admission gate; this is not a density law.
function patchPreference(generator, x, z) {
  const spacing = 192, gx = Math.floor(x / spacing), gz = Math.floor(z / spacing);
  const smooth = t => t * t * (3 - 2 * t), tx = smooth(x / spacing - gx), tz = smooth(z / spacing - gz);
  const at = (ix, iz) => hash(`${generator.seed}|biodiversity-preference:${ix},${iz}`) / 4294967296;
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(at(gx, gz), at(gx + 1, gz), tx), mix(at(gx, gz + 1), at(gx + 1, gz + 1), tx), tz);
}
const probes = (x, z, radius) => [{ x, z }, ...[.5, 1].flatMap(factor => Array.from({ length: 8 }, (_, i) =>
  ({ x: x + Math.cos(i * TAU / 8) * radius * factor, z: z + Math.sin(i * TAU / 8) * radius * factor })))];
const radiusFor = (speciesId, size) => fishIds.has(speciesId) ? size * .55 : size * .5;
const baseRadiusFor = (speciesId, size) => speciesId === 'shallow-anemone' ? size * .21 : speciesId === 'tropical-urchin' ? size * .10 : radiusFor(speciesId, size);
const depthValid = (generator, speciesId, height) => {
  const [low, high] = oceanBiodiversitySpeciesById[speciesId].depthSelectionM;
  const depth = (generator.surfaceY ?? 8) - height; return depth >= low && depth <= high;
};
function inBounds(bounds, x, z, radius = .2) {
  return x >= bounds.minX + radius + .1 && x <= bounds.maxX - radius - .1 &&
    z >= bounds.minZ + radius + .1 && z <= bounds.maxZ - radius - .1;
}
function supportAt(generator, surface, bed, x, z, radius, mode = 'hard', maxSpread = .035, host = null) {
  const heights = [];
  for (const p of probes(x, z, radius)) {
    const s = generator.sample(p.x, p.z), floor = bed(p.x, p.z), h = surface(p.x, p.z), crown = surface(p.x, p.z, true);
    if (![floor, h, crown, s.depthM].every(Number.isFinite) || s.depthM < 3 || s.depthM > 22 || crown > h + .01 ||
        (mode === 'hard' && h - floor < .06) || (mode === 'soft' && (s.substrate === 'rock' || h - floor > .025))) return null;
    if (host) { const own = oceanRockHeight(host, p.x, p.z); if (own === null || Math.abs(own - h) > 1e-7) return null; }
    heights.push(h);
  }
  const height = Math.max(...heights), spread = height - Math.min(...heights);
  return spread <= maxSpread + 1e-10 ? { height, minHeight: Math.min(...heights), spread } : null;
}
function plantOverlap(elements, x, z, radius) {
  return elements.some(e => ['coral', 'seagrass'].includes(e.kind) &&
    Math.hypot(x - e.x, z - e.z) < Math.max(e.scale.x, e.scale.z) * .5 + radius + .06);
}
function animalSupport(generator, surface, bed, x, z, speciesId, size, host = null) {
  const support = supportAt(generator, surface, bed, x, z, baseRadiusFor(speciesId, size), speciesId === 'sand-goby' ? 'soft' : 'hard',
    speciesId === 'reef-parrotfish' ? .25 : .035, host);
  if (!support || !depthValid(generator, speciesId, support.height)) return null;
  // Bases, oral discs and long spines have different footprints. The actual
  // procedural base is supported; an overhanging crown must clear native rock.
  if (['shallow-anemone', 'tropical-urchin'].includes(speciesId)) {
    const crownBottom = support.height + OFFSET + size * (speciesId === 'shallow-anemone' ? .13 : .08);
    if (!probes(x, z, radiusFor(speciesId, size)).every(p => surface(p.x, p.z, true) <= crownBottom + 1e-8)) return null;
  }
  return support;
}
function grapePatchSupport(generator, surface, bed, host, x, z, width, rotation) {
  if (!host) return null;
  const c = Math.cos(host.rotation), s = Math.sin(host.rotation), dx = x - host.x, dz = z - host.z;
  const local = oceanRockSurface(host.profile || 'mound', (dx * c - dz * s) / host.scale.x, (dx * s + dz * c) / host.scale.z);
  if (!local) return null;
  const scaled = { x: local.normal.x / host.scale.x, y: local.normal.y / host.scale.y, z: local.normal.z / host.scale.z };
  const length = Math.hypot(scaled.x, scaled.y, scaled.z);
  const normal = { x: (scaled.x * c + scaled.z * s) / length, y: scaled.y / length, z: (-scaled.x * s + scaled.z * c) / length };
  if (normal.y <= .35) return null;
  const center = surface(x, z), denominator = 1 + normal.y, cy = Math.cos(rotation), sy = Math.sin(rotation), residuals = [];
  for (const p of probes(0, 0, width * .5)) {
    // Same transform as Three's align(+Y, normal) * yaw(rotation).
    const lx = p.x * cy + p.z * sy, lz = -p.x * sy + p.z * cy;
    const wx = x + lx * (1 - normal.x ** 2 / denominator) - lz * normal.x * normal.z / denominator;
    const wz = z - lx * normal.x * normal.z / denominator + lz * (1 - normal.z ** 2 / denominator);
    const planeY = center - lx * normal.x - lz * normal.z;
    const h = surface(wx, wz), own = oceanRockHeight(host, wx, wz), floor = bed(wx, wz), crown = surface(wx, wz, true);
    if (own === null || ![h, floor, crown].every(Number.isFinite) || Math.abs(own - h) > 1e-7 || h - floor < .06 || crown > h + .01 ||
        !depthValid(generator, 'biodiversity-grape-algae', h)) return null;
    residuals.push(h - planeY);
  }
  if (Math.max(...residuals) - Math.min(...residuals) > .008 + 1e-10) return null;
  return { height: center + Math.max(...residuals) + OFFSET, surfaceNormal: normal };
}

/** Pure, finite candidate planning on native supports. Patches and actual
 * individuals have separate budgets. Empty niches are an ordinary result. */
export function createOceanBiodiversityPlan(generator, region, { random, surface, bed, availableSlots = 0, maxAdded = 6 } = {}) {
  const empty = () => freeze({ version: 1, placements: [], patches: [], communityType: 'unoccupied', preference: 0 });
  if (generator?.profile !== OCEAN_BIODIVERSITY_PROFILE || !Number.isSafeInteger(region?.cx) || !Number.isSafeInteger(region?.cz) ||
      region.id !== `${region.cx},${region.cz}` || typeof surface !== 'function' || typeof bed !== 'function') return empty();
  const rng = random ?? defaultRandom(generator, region), layoutRng = defaultRandom(generator, region);
  const chunk = generator.chunk(region.cx, region.cz), bounds = chunk.bounds;
  const slots = Math.min(OCEAN_BIODIVERSITY_AGENT_LIMIT, Math.max(0, Math.floor(availableSlots)), Math.max(0, Math.floor(maxAdded)));
  const preference = patchPreference(generator, chunk.origin.x + 32, chunk.origin.z + 32);
  const rocks = chunk.elements.filter(e => e.kind === 'rock'), plants = chunk.elements.filter(e => ['coral', 'seagrass', 'algae'].includes(e.kind));
  const hardSites = [], softSites = [];
  for (const rock of rocks) for (const fraction of [.14, .27, .40]) for (let i = 0; i < 12; i++) {
    const angle = (i / 12 + layoutRng(`rock:${rock.id}:angle`)) * TAU, c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
    const lx = Math.cos(angle) * fraction * rock.scale.x, lz = Math.sin(angle) * fraction * rock.scale.z;
    const x = rock.x + lx * c + lz * s, z = rock.z - lx * s + lz * c;
    const own = oceanRockHeight(rock, x, z);
    if (!inBounds(bounds, x, z) || own === null || Math.abs(own - surface(x, z)) > .01 || plantOverlap(plants, x, z, .08)) continue;
    const support = supportAt(generator, surface, bed, x, z, .05);
    if (!support) continue;
    const algaeNear = plants.some(e => e.kind === 'algae' && e.attachmentId === rock.id && Math.hypot(x - e.x, z - e.z) <= 3);
    hardSites.push({ id: `${rock.id}:${fraction}:${i}`, x, z, hostId: rock.id, y: support.height, algaeNear,
      order: layoutRng(`hard:${rock.id}:${fraction}:${i}`) });
  }
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const id = `soft:${ix},${iz}`, x = chunk.origin.x + (ix + .25 + layoutRng(`${id}:x`) * .5) * 8;
    const z = chunk.origin.z + (iz + .25 + layoutRng(`${id}:z`) * .5) * 8;
    if (!inBounds(bounds, x, z) || plantOverlap(plants, x, z, .08)) continue;
    const support = supportAt(generator, surface, bed, x, z, .055, 'soft');
    if (support) softSites.push({ id, x, z, hostId: null, y: support.height,
      grassNear: plants.some(e => e.kind === 'seagrass' && Math.hypot(x - e.x, z - e.z) < 5), order: layoutRng(`soft-order:${id}`) });
  }
  hardSites.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  softSites.sort((a, b) => Number(b.grassNear) - Number(a.grassNear) || a.order - b.order || a.id.localeCompare(b.id));
  const communityType = !hardSites.length ? softSites.some(p => p.grassNear) ? 'meadow-edge' : 'sediment' :
    softSites.length > 30 && preference > .55 ? 'reef-sand-edge' : 'hard-reef';
  const placements = [], patches = [], used = [];
  const patchCounts = { 'biodiversity-massive-coral': 0, 'biodiversity-grape-algae': 0 };
  for (const site of hardSites) {
    if (patches.length >= OCEAN_BIODIVERSITY_PATCH_LIMIT) break;
    const speciesId = layoutRng(`patch:${site.id}:kind`) < .5 ? 'biodiversity-massive-coral' : 'biodiversity-grape-algae';
    if (patchCounts[speciesId] >= (speciesId === 'biodiversity-massive-coral' ? 4 : 16) || layoutRng(`patch:${site.id}:present`) > .55 + preference * .2) continue;
    const massive = speciesId === 'biodiversity-massive-coral';
    const width = massive ? .55 + layoutRng(`patch:${site.id}:width`) * .55 : .18 + layoutRng(`patch:${site.id}:width`) * .18;
    const radius = width * .5, rotation = layoutRng(`patch:${site.id}:heading`) * TAU;
    const host = rocks.find(r => r.id === site.hostId);
    const support = massive ? supportAt(generator, surface, bed, site.x, site.z, radius, 'hard', Math.min(.24, width * .25), host) :
      grapePatchSupport(generator, surface, bed, host, site.x, site.z, width, rotation);
    if (!support || !depthValid(generator, speciesId, surface(site.x, site.z)) || used.some(p => Math.hypot(p.x - site.x, p.z - site.z) < p.radius + radius + .1) ||
        plantOverlap(plants, site.x, site.z, radius) || !inBounds(bounds, site.x, site.z, radius)) continue;
    // A rigid colony base is buried in the whole surveyed native footprint.
    // Short flexible shoots require an almost flat root patch instead.
    const patch = { id: `ocean:${region.id}:biodiversity-patch:${speciesId}:${site.id}`, speciesId, kind: 'biodiversity-patch',
      x: site.x, y: massive ? support.minHeight - .012 : support.height, z: site.z, hostId: site.hostId, rotation,
      scale: { x: width, y: massive ? width * .55 : .02 + layoutRng(`patch:${site.id}:height`) * .03, z: width },
      scope: OCEAN_BIODIVERSITY_PATCH_SCOPE, ...(!massive ? { surfaceNormal: support.surfaceNormal } : {}) };
    if (massive && oceanBiodiversityPatchHeight(patch, patch.x, patch.z) < support.height + .1) continue;
    patches.push(patch);
    used.push({ x: site.x, z: site.z, radius }); patchCounts[speciesId]++;
  }
  const clear = (site, radius) => !used.some(p => Math.hypot(p.x - site.x, p.z - site.z) < p.radius + radius + .1) &&
    !(region.agents ?? []).some(a => a.alive && !fishIds.has(a.speciesId) && point(a.position) &&
      Math.hypot(a.position.x - site.x, a.position.z - site.z) < radius + (a.sizeM ?? .1) * .55 + .12 &&
      Math.abs(a.position.y - site.y) < .4);
  const place = (speciesId, sites, probability, mode = 'hard') => {
    if (placements.length >= slots || rng(`${speciesId}:present`) >= probability ||
        (region.agents ?? []).some(a => a.speciesId === speciesId)) return null;
    const [low, high] = ranges[speciesId], sizeM = low + rng(`${speciesId}:size`) * (high - low), radius = radiusFor(speciesId, sizeM);
    for (const site of sites) {
      if (!inBounds(bounds, site.x, site.z, radius) || !clear(site, radius)) continue;
      if (plantOverlap(plants, site.x, site.z, radius)) continue;
      const support = animalSupport(generator, surface, bed, site.x, site.z, speciesId, sizeM, rocks.find(r => r.id === site.hostId));
      if (!support || (site.hostId && Math.abs(oceanRockHeight(rocks.find(r => r.id === site.hostId), site.x, site.z) - surface(site.x, site.z)) > .01)) continue;
      const y = support.height + (fishIds.has(speciesId) ? speciesId === 'sand-goby' ? sizeM * .35 : .32 + sizeM * .3 : OFFSET);
      if (y + sizeM * .4 >= (generator.surfaceY ?? 8) - .6 || (fishIds.has(speciesId) && !depthValid(generator, speciesId, y))) continue;
      const placement = { speciesId, siteId: site.id, hostId: site.hostId, x: site.x, y, z: site.z, sizeM,
        habitat: mode === 'soft' ? 'biodiversity-sand-edge' : 'biodiversity-hard-reef', supportOffset: y - support.height };
      placements.push(placement); used.push({ x: site.x, z: site.z, radius }); return placement;
    }
    return null;
  };
  // Each role competes for actual habitat; a cell is not an all-species checklist.
  const anemone = place('shallow-anemone', hardSites, .62 + preference * .25);
  if (anemone && placements.length < slots && rng('clown-anemonefish:present') < .82) {
    const sizeM = .05 + rng('clown-anemonefish:size') * .025;
    const x = anemone.x, z = anemone.z, y = anemone.y + anemone.sizeM * .48 + sizeM * .2 + .05;
    if (y + sizeM * .4 < (generator.surfaceY ?? 8) - .6 && depthValid(generator, 'clown-anemonefish', y)) placements.push({ speciesId: 'clown-anemonefish', siteId: `${anemone.siteId}:resident`,
      hostId: anemone.hostId, clownHostSiteId: anemone.siteId, x, y, z, sizeM, supportOffset: y - surface(x, z), habitat: 'biodiversity-anemone-resident' });
  }
  place('sand-goby', softSites, softSites.some(p => p.grassNear) ? .95 : .65 + preference * .2, 'soft');
  place('tropical-urchin', hardSites.filter(p => p.algaeNear), .80 - preference * .15);
  place('feather-duster', hardSites, .76 + preference * .12);
  place('reef-parrotfish', hardSites.filter(p => p.algaeNear), .85 - preference * .15);
  return freeze({ version: 1, communityType, preference, placements, patches });
}

/** Only a caller proving a genuinely new owner can admit this package. Saved
 * owners, including examined-empty and dead records, never receive a refill. */
export function initializeOceanBiodiversity(region, generator, { fresh = false, random, surface, bed, capacity = 20, maxAdded = 6 } = {}) {
  if (!fresh || generator?.profile !== OCEAN_BIODIVERSITY_PROFILE || region.timeSec !== 0 || !region.basicNetwork ||
      region.biodiversityVersion !== undefined || region.biodiversity !== undefined || !Array.isArray(region.agents)) return false;
  const randomFor = random ?? defaultRandom(generator, region);
  const residentCount = region.agents.length + (region.turtleAgents?.length ?? 0);
  const plan = createOceanBiodiversityPlan(generator, region, { random: randomFor, surface, bed, availableSlots: Math.max(0, capacity - residentCount), maxAdded });
  const idFor = p => `ocean:${region.id}:biodiversity:${p.speciesId}:${p.siteId}`;
  const born = plan.placements.map(p => {
    const id = idFor(p), position = { x: p.x, y: p.y, z: p.z };
    const host = p.clownHostSiteId ? plan.placements.find(q => q.speciesId === 'shallow-anemone' && q.siteId === p.clownHostSiteId) : null;
    return { id, regionId: region.id, speciesId: p.speciesId, position, home: { ...position }, target: { ...position }, refuge: { ...position },
      velocity: { x: 0, y: 0, z: 0 }, heading: randomFor(`${id}:heading`) * TAU, pitch: 0, sizeM: p.sizeM,
      state: fixedIds.has(p.speciesId) ? 'filtering' : p.speciesId === 'clown-anemonefish' ? 'host-sheltering' : 'foraging', stateSince: 0,
      energy: .72 + randomFor(`${id}:energy`) * .12, alive: true, parasites: 0, lastFeedAt: null, nextBite: randomFor(`${id}:bite`) * 3,
      nextDecision: 0, decisions: 0, fleeUntil: 0, groupId: null, habitat: p.habitat, supportOffset: p.supportOffset,
      refugeHostId: p.hostId, biodiversityHostId: p.hostId, biodiversityIndividualVersion: 1,
      ...(host ? { clownHostId: idFor(host) } : {}) };
  });
  region.agents.push(...born);
  const initialInputUnits = recordLivingAdmission(region, born);
  region.biodiversityVersion = 1; region.biodiversityInitializedAtSec = 0;
  region.biodiversity = { version: 1, communityType: plan.communityType, preference: plan.preference,
    addedIds: born.map(a => a.id), patches: plan.patches.map(p => ({ ...p, scale: { ...p.scale } })), initialInputUnits,
    scope: 'habitat-weighted fresh-owner representatives; relative food pools; no reproduction or population refill',
    counters: { feedings: 0, consumedUnits: 0 } };
  return true;
}

function stateFor(agent, value, time, callback) {
  if (callback) callback(agent, value, time);
  else if (agent.state !== value) { agent.state = value; agent.stateSince = time; }
}
const obstacleSurface = (region, surface) => (x, z, fish = false) => {
  let height = surface(x, z, fish);
  if (fish) for (const patch of region.biodiversity?.patches ?? []) {
    const top = oceanBiodiversityPatchHeight(patch, x, z); if (top !== null) height = Math.max(height, top);
  }
  return height;
};
function positionValid(region, generator, agent, p, { surface, bed }) {
  if (!point(p)) return false;
  const bounds = generator.chunk(region.cx, region.cz).bounds, r = radiusFor(agent.speciesId, agent.sizeM);
  if (!inBounds(bounds, p.x, p.z, r) || p.y + agent.sizeM * .4 > (generator.surfaceY ?? 8) - .6) return false;
  if (fishIds.has(agent.speciesId) && !depthValid(generator, agent.speciesId, p.y)) return false;
  const extent = agent.speciesId === 'sand-goby' ? .7 : agent.speciesId === 'tropical-urchin' ? .3 :
    agent.speciesId === 'clown-anemonefish' ? .38 : fixedIds.has(agent.speciesId) ? 0 : 1.5;
  if (Math.hypot(p.x - agent.home.x, p.z - agent.home.z) > extent + 1e-8) return false;
  if (agent.speciesId === 'sand-goby') {
    const support = animalSupport(generator, surface, bed, p.x, p.z, agent.speciesId, agent.sizeM);
    return support && Math.abs(p.y - support.height - agent.supportOffset) < 1e-7;
  }
  if (!fishIds.has(agent.speciesId)) {
    const host = generator.chunk(region.cx, region.cz).elements.find(e => e.id === agent.biodiversityHostId && e.kind === 'rock');
    const support = host && animalSupport(generator, surface, bed, p.x, p.z, agent.speciesId, agent.sizeM, host);
    return support && Math.abs(p.y - support.height - OFFSET) < 1e-7;
  }
  if (!probes(p.x, p.z, r).every(q => p.y - agent.sizeM * .20 >= surface(q.x, q.z, true) + .04)) return false;
  if (agent.speciesId === 'clown-anemonefish') {
    const host = region.agents.find(a => a.id === agent.clownHostId && a.speciesId === 'shallow-anemone');
    if (!host || (Math.hypot(p.x - host.position.x, p.z - host.position.z) < host.sizeM * .5 + r &&
        p.y - agent.sizeM * .2 < host.position.y + host.sizeM * .48 + .01)) return false;
  }
  return true;
}

/** Ticked by the real owner clock. Movement and ingestion do not use a camera,
 * scene entry or a display particle. The diet pools are explicit proxies. */
export function tickOceanBiodiversityAgent(region, generator, agent, dt, { random, surface, bed, environment = {}, state } = {}) {
  if (!isOceanBiodiversityAgent(agent) || !agent.alive || region.biodiversityVersion !== 1 || !region.basicNetwork || !Number.isFinite(dt) || dt <= 0) return;
  surface = obstacleSurface(region, surface);
  const rng = random ?? defaultRandom(generator, region), clock = region.timeSec, attached = fixedIds.has(agent.speciesId);
  const host = agent.speciesId === 'clown-anemonefish' ? region.agents.find(a => a.id === agent.clownHostId && a.speciesId === 'shallow-anemone') : null;
  if (agent.speciesId === 'clown-anemonefish' && (!host?.alive || host.regionId !== region.id)) {
    agent.velocity = { x: 0, y: 0, z: 0 }; stateFor(agent, 'host-unavailable', clock, state); return;
  }
  const light = environment.lightAtDepth ?? 1;
  if (agent.speciesId === 'tropical-urchin' && light >= .15) {
    agent.velocity = { x: 0, y: 0, z: 0 }; stateFor(agent, 'resting', clock, state); return;
  }
  if (fishIds.has(agent.speciesId) && light < .04) {
    agent.velocity = { x: 0, y: 0, z: 0 }; stateFor(agent, 'resting', clock, state); return;
  }
  if (!attached && clock >= agent.nextDecision) {
    const key = `${agent.id}:decision:${agent.decisions++}`, extent = agent.speciesId === 'clown-anemonefish' ? .30 : agent.speciesId === 'tropical-urchin' ? .30 : agent.speciesId === 'sand-goby' ? .7 : 1.3;
    agent.nextDecision = clock + 4 + rng(`${key}:time`) * 5;
    for (let i = 0; i < 8; i++) {
      const angle = rng(`${key}:angle:${i}`) * TAU, reach = rng(`${key}:reach:${i}`) * extent;
      const x = agent.home.x + Math.cos(angle) * reach, z = agent.home.z + Math.sin(angle) * reach;
      let y = agent.home.y;
      if (agent.speciesId === 'sand-goby' || agent.speciesId === 'tropical-urchin') {
        const support = animalSupport(generator, surface, bed, x, z, agent.speciesId, agent.sizeM);
        if (!support) continue; y = support.height + agent.supportOffset;
      } else y += (rng(`${key}:height:${i}`) - .5) * .12;
      const target = { x, y, z }; if (positionValid(region, generator, agent, target, { surface, bed })) { agent.target = target; break; }
    }
  }
  agent.velocity = { x: 0, y: 0, z: 0 };
  if (!attached) {
    const previous = agent.position, delta = { x: agent.target.x - previous.x, y: agent.target.y - previous.y, z: agent.target.z - previous.z };
    const length = Math.hypot(delta.x, delta.y, delta.z) || 1, speed = agent.speciesId === 'tropical-urchin' ? .002 : agent.speciesId === 'sand-goby' ? .025 : agent.speciesId === 'clown-anemonefish' ? .06 : .10;
    for (const fraction of [1, .5, .25, .125]) {
      const step = Math.min(length, speed * dt) * fraction;
      const next = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, previous[axis] + delta[axis] / length * step]));
      if (agent.speciesId === 'sand-goby' || agent.speciesId === 'tropical-urchin') {
        const support = animalSupport(generator, surface, bed, next.x, next.z, agent.speciesId, agent.sizeM);
        if (!support) continue; next.y = support.height + agent.supportOffset;
      }
      const mid = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (previous[axis] + next[axis]) * .5]));
      if (agent.speciesId === 'sand-goby' || agent.speciesId === 'tropical-urchin') {
        const support = animalSupport(generator, surface, bed, mid.x, mid.z, agent.speciesId, agent.sizeM);
        if (!support || mid.y < support.height + agent.supportOffset - 1e-8) continue;
      }
      if (Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z) > speed * dt + 1e-10 ||
          !positionValid(region, generator, agent, next, { surface, bed }) ||
          (fishIds.has(agent.speciesId) && agent.speciesId !== 'sand-goby' && !positionValid(region, generator, agent, mid, { surface, bed }))) continue;
      agent.position = next; agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (next[axis] - previous[axis]) / dt]));
      if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-6) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x); break;
    }
  }
  stateFor(agent, attached ? 'filtering' : agent.speciesId === 'clown-anemonefish' ? 'host-sheltering' : 'foraging', clock, state);
  if (clock < agent.nextBite) return;
  const grazing = ['tropical-urchin', 'reef-parrotfish'].includes(agent.speciesId), goby = agent.speciesId === 'sand-goby';
  if (grazing && !generator.chunk(region.cx, region.cz).elements.some(e => e.kind === 'algae' &&
      e.attachmentId === agent.biodiversityHostId && Math.hypot(e.x - agent.position.x, e.z - agent.position.z) <= 3)) return;
  if (goby && !positionValid(region, generator, agent, agent.position, { surface, bed })) return;
  const pool = grazing ? 'algae' : goby ? 'detritus' : 'plankton';
  // Goby food is an unresolved small sediment-animal proxy, not a claimed
  // detritus-only natural diet. Rates and allocations are display parameters.
  const taken = Math.min(region.resources[pool], grazing ? .00035 : goby ? .00018 : .00022);
  agent.nextBite = clock + 3 + rng(`${agent.id}:bite:${agent.decisions}:${region.ticks}`) * 3;
  if (taken <= 1e-10) { stateFor(agent, 'searching', clock, state); return; }
  region.resources[pool] -= taken; region.ledger.ingested += taken; recordLivingIngestion(region, agent, taken);
  agent.energy = Math.min(1, agent.energy + taken * 8); agent.lastFeedAt = clock;
  region.counters.feeding++; region.biodiversity.counters.feedings++; region.biodiversity.counters.consumedUnits += taken;
  stateFor(agent, grazing ? 'grazing' : goby ? 'sediment-proxy-feeding' : agent.speciesId === 'clown-anemonefish' ? 'plankton-feeding' : 'filter-feeding', clock, state);
  region.events.push({ id: `${region.id}:${region.ticks}:biodiversity:${agent.id}`, regionId: region.id, timeSec: clock,
    type: 'feeding', agentId: agent.id, targetId: host?.id ?? null, pool, amount: taken,
    title: `${oceanBiodiversitySpeciesById[agent.speciesId].commonName}实际摄食`, detail: '当地相对食物代理库存已扣减' });
  if (region.events.length > 32) region.events.splice(0, region.events.length - 32);
}

export function validateOceanBiodiversityRecord(region, generator, { surface, bed, capacity = 20 } = {}) {
  const descriptor = region?.biodiversity, agents = region?.agents?.filter(isOceanBiodiversityAgent) ?? [];
  if (generator?.profile !== OCEAN_BIODIVERSITY_PROFILE || !region || !Number.isSafeInteger(region.cx) || !Number.isSafeInteger(region.cz) ||
      region.id !== `${region.cx},${region.cz}` || !nonnegative(region.timeSec) || !region.basicNetwork ||
      region.biodiversityVersion !== 1 || region.biodiversityInitializedAtSec !== 0 ||
      !descriptor || descriptor.version !== 1 || !['unoccupied', 'sediment', 'meadow-edge', 'reef-sand-edge', 'hard-reef'].includes(descriptor.communityType) ||
      !nonnegative(descriptor.preference) || descriptor.preference > 1 || !nonnegative(descriptor.initialInputUnits) ||
      !Array.isArray(descriptor.addedIds) || new Set(descriptor.addedIds).size !== descriptor.addedIds.length || agents.length !== descriptor.addedIds.length ||
      agents.length > OCEAN_BIODIVERSITY_AGENT_LIMIT || new Set(agents.map(a => a.speciesId)).size !== agents.length ||
      region.agents.length + (region.turtleAgents?.length ?? 0) > capacity ||
      !Number.isSafeInteger(descriptor.counters?.feedings) || descriptor.counters.feedings < 0 || !nonnegative(descriptor.counters?.consumedUnits) ||
      !Array.isArray(descriptor.patches) || descriptor.patches.length > OCEAN_BIODIVERSITY_PATCH_LIMIT ||
      new Set(descriptor.patches.map(p => p.id)).size !== descriptor.patches.length || typeof surface !== 'function' || typeof bed !== 'function') return false;
  const canonical = createOceanBiodiversityPlan(generator, { id: region.id, cx: region.cx, cz: region.cz, agents: [] }, { surface, bed, availableSlots: 0 });
  if (JSON.stringify(descriptor.patches) !== JSON.stringify(canonical.patches) || descriptor.communityType !== canonical.communityType || descriptor.preference !== canonical.preference ||
      Math.abs(descriptor.initialInputUnits - descriptor.addedIds.length * .004) > 1e-10) return false;
  const chunk = generator.chunk(region.cx, region.cz), hosts = new Map(chunk.elements.filter(e => e.kind === 'rock').map(e => [e.id, e]));
  if (!descriptor.patches.every(p => {
    const massive = p.speciesId === 'biodiversity-massive-coral', width = p.scale?.x;
    if (!['biodiversity-massive-coral', 'biodiversity-grape-algae'].includes(p.speciesId) || p.kind !== 'biodiversity-patch' ||
        !p.id.startsWith(`ocean:${region.id}:biodiversity-patch:${p.speciesId}:`) || p.scope !== OCEAN_BIODIVERSITY_PATCH_SCOPE || !hosts.has(p.hostId) ||
        !point(p) || !Number.isFinite(p.rotation) || !point(p.scale) || width < (massive ? .55 : .18) || width > (massive ? 1.1 : .36) ||
        p.scale.z !== width || (massive ? Math.abs(p.scale.y - width * .55) > 1e-10 : p.scale.y < .02 || p.scale.y > .05) ||
        !inBounds(chunk.bounds, p.x, p.z, width * .5)) return false;
    const support = massive ? supportAt(generator, surface, bed, p.x, p.z, width * .5, 'hard', Math.min(.24, width * .25), hosts.get(p.hostId)) :
      grapePatchSupport(generator, surface, bed, hosts.get(p.hostId), p.x, p.z, width, p.rotation);
    return support && Math.abs(p.y - (massive ? support.minHeight - .012 : support.height)) < 1e-7;
  })) return false;
  const actualSurface = obstacleSurface(region, surface);
  return agents.every(agent => {
    const range = ranges[agent.speciesId];
    if (agent.biodiversityIndividualVersion !== 1 || !descriptor.addedIds.includes(agent.id) ||
        !agent.id.startsWith(`ocean:${region.id}:biodiversity:${agent.speciesId}:`) || agent.regionId !== region.id ||
        agent.sizeM < range[0] || agent.sizeM > range[1] || ![agent.position, agent.home, agent.target, agent.refuge, agent.velocity].every(point) ||
        !Number.isFinite(agent.heading) || !Number.isFinite(agent.pitch) || !nonnegative(agent.nextBite) || !nonnegative(agent.nextDecision) || !nonnegative(agent.supportOffset) ||
        !Number.isSafeInteger(agent.decisions) || agent.decisions < 0 || typeof agent.alive !== 'boolean' ||
        !nonnegative(agent.organicUnits) || typeof agent.organicDeathRecorded !== 'boolean' ||
        (agent.speciesId !== 'sand-goby' && !hosts.has(agent.biodiversityHostId)) ||
        !positionValid(region, generator, agent, agent.position, { surface: actualSurface, bed }) ||
        !positionValid(region, generator, agent, agent.target, { surface: actualSurface, bed }) ||
        !positionValid(region, generator, agent, agent.home, { surface: actualSurface, bed }) ||
        !positionValid(region, generator, agent, agent.refuge, { surface: actualSurface, bed })) return false;
    if (fixedIds.has(agent.speciesId) && (Math.hypot(agent.position.x - agent.home.x, agent.position.y - agent.home.y, agent.position.z - agent.home.z) > 1e-10 ||
        Math.hypot(agent.target.x - agent.home.x, agent.target.y - agent.home.y, agent.target.z - agent.home.z) > 1e-10)) return false;
    if (agent.speciesId === 'clown-anemonefish') {
      const host = agents.find(a => a.id === agent.clownHostId && a.speciesId === 'shallow-anemone');
      if (!host || host.regionId !== region.id || Math.hypot(agent.home.x - host.home.x, agent.home.z - host.home.z) > 1e-10) return false;
    }
    return true;
  });
}
