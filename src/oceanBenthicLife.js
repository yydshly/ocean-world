import { oceanRockHeight } from './oceanRockShape.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { recordLivingAdmission, recordLivingIngestion } from './livingEcologyNetwork.js';
import { oceanBenthicLifeSpeciesById } from './oceanBenthicLifeSpecies.js';

export const OCEAN_BENTHIC_LIFE_VERSION = 1;
export const OCEAN_BENTHIC_LIFE_PROFILE = 'living-shallows-v1';
export const OCEAN_BENTHIC_LIFE_AGENT_LIMIT = 4;
export const OCEAN_BENTHIC_LIFE_IDS = Object.freeze(['tiger-cowrie', 'spotted-hermit-crab', 'blue-spotted-ray', 'reef-goatfish']);
export const OCEAN_BENTHIC_LIFE_FOOD_SCOPE = 'relative unresolved benthic-animal and sponge nutrition proxy supported by the existing detritus pool; no rendered prey kills or measured biomass';
const SALT = 'benthic-life-v1', TAU = Math.PI * 2, OFFSET = .004;
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const hasIndividualMarker = agent => agent && ['benthicLifeIndividualVersion', 'benthicLifeHostId', 'benthicLifeSiteId', 'benthicLifeMode'].some(k => Object.hasOwn(agent, k));
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const hash = text => { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; };
const defaultRandom = (generator, region) => salt => hash(`${SALT}|${typeof generator.seed}:${generator.seed}|${region.id}|${salt}`) / 4294967296;
const randomFor = (generator, region, random) => random ? salt => random(`${SALT}|${salt}`) : defaultRandom(generator, region);
export const isOceanBenthicLifeAgent = agent => OCEAN_BENTHIC_LIFE_IDS.includes(agent?.speciesId);
// Conservative whole-model envelopes, including borrowed shells, antennae,
// the stingray's complete tail, and the goatfish's paired barbels.
const traits = Object.freeze({
  'tiger-cowrie': { radius: .80, speed: .003, extent: .60, lift: OFFSET, spread: .025, night: true },
  'spotted-hermit-crab': { radius: 1.20, speed: .010, extent: 1.0, lift: OFFSET, spread: .025, night: true },
  'blue-spotted-ray': { radius: 2.30, speed: .10, extent: 3.5, lift: OFFSET, spread: .055, night: true },
  'reef-goatfish': { radius: .65, speed: .16, extent: 5.5, lift: .18, spread: .20, night: false },
});
const inBounds = (bounds, x, z, radius) => x >= bounds.minX + radius + .1 && x <= bounds.maxX - radius - .1 &&
  z >= bounds.minZ + radius + .1 && z <= bounds.maxZ - radius - .1;
const depthValid = (generator, speciesId, y) => { const [low, high] = oceanBenthicLifeSpeciesById[speciesId].depthSelectionM;
  const depth = (generator.surfaceY ?? 8) - y; return depth >= low && depth <= high; };
const rings = radius => [{ x: 0, z: 0 }, ...[.5, 1].flatMap(f => Array.from({ length: 12 }, (_, i) =>
  ({ x: Math.cos(i * TAU / 12) * radius * f, z: Math.sin(i * TAU / 12) * radius * f })))];
function footprint(speciesId, sizeM, heading) {
  const points = rings(traits[speciesId].radius * sizeM);
  if (speciesId === 'blue-spotted-ray') {
    // Full tail centreline plus both sides, not a disc-radius shortcut.
    for (let i = 0; i <= 24; i++) for (const side of [-1, 0, 1]) {
      const x = (-2.20 + 2.8 * i / 24) * sizeM;
      const z = (x < -.45 * sizeM ? .10 : .55) * sizeM * side;
      points.push({ x, z });
    }
  }
  const c = Math.cos(heading), s = Math.sin(heading);
  return points.map(p => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c }));
}
const actualSurface = (region, surface) => (x, z, crown = false) => {
  let height = surface(x, z, crown);
  if (crown) for (const patch of region.biodiversity?.patches ?? []) {
    const top = oceanBiodiversityPatchHeight(patch, x, z);
    if (top !== null) height = Math.max(height, top);
  }
  return height;
};
const plantOverlap = (elements, x, z, radius) => elements.some(e => ['coral', 'seagrass'].includes(e.kind) &&
  Math.hypot(e.x - x, e.z - z) < Math.max(e.scale.x, e.scale.z) * .5 + radius + .04);
function supportAt(generator, surface, bed, speciesId, sizeM, heading, x, z, mode, host = null) {
  const heights = [];
  for (const offset of footprint(speciesId, sizeM, heading)) {
    const px = x + offset.x, pz = z + offset.z, h = surface(px, pz), floor = bed(px, pz), crown = surface(px, pz, true);
    if (![h, floor, crown].every(Number.isFinite) || !depthValid(generator, speciesId, h) || crown > h + .01 ||
      (mode === 'soft' && (generator.sample(px, pz).substrate === 'rock' || h - floor > .025)) ||
      (mode === 'hard' && h - floor < .06)) return null;
    if (host) { const own = oceanRockHeight(host, px, pz); if (own === null || Math.abs(own - h) > 1e-7) return null; }
    heights.push(h);
  }
  const height = Math.max(...heights), spread = height - Math.min(...heights);
  return spread <= traits[speciesId].spread + 1e-10 ? { height, spread } : null;
}
function preferenceFor(generator, x, z) {
  const spacing = 192, ix = Math.floor(x / spacing), iz = Math.floor(z / spacing);
  const smooth = t => t * t * (3 - 2 * t), tx = smooth(x / spacing - ix), tz = smooth(z / spacing - iz);
  const at = (gx, gz) => hash(`${SALT}|${typeof generator.seed}:${generator.seed}|community:${gx},${gz}`) / 4294967296;
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(at(ix, iz), at(ix + 1, iz), tx), mix(at(ix, iz + 1), at(ix + 1, iz + 1), tx), tz);
}
function candidateSites(generator, region, surface, bed) {
  const layout = defaultRandom(generator, region), chunk = generator.chunk(region.cx, region.cz), sites = [];
  const plants = chunk.elements.filter(e => ['coral', 'seagrass'].includes(e.kind));
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const id = `soft:${ix},${iz}`, x = chunk.origin.x + (ix + .2 + layout(`${id}:x`) * .6) * 8;
    const z = chunk.origin.z + (iz + .2 + layout(`${id}:z`) * .6) * 8;
    const h = surface(x, z), floor = bed(x, z);
    if (!inBounds(chunk.bounds, x, z, .15) || ![h, floor].every(Number.isFinite) || h - floor > .025 ||
      generator.sample(x, z).substrate === 'rock' || surface(x, z, true) > h + .01 || plantOverlap(plants, x, z, .05)) continue;
    sites.push({ siteId: id, x, z, mode: 'soft', hostId: null, grassNear: plants.some(e => e.kind === 'seagrass' && Math.hypot(x - e.x, z - e.z) < 5),
      order: layout(`order:${id}`) });
  }
  for (const host of chunk.elements.filter(e => e.kind === 'rock')) for (const fraction of [.12, .25, .38]) for (let i = 0; i < 8; i++) {
    const siteId = `hard:${host.id}:${fraction}:${i}`, angle = (i / 8 + layout(`angle:${host.id}`)) * TAU;
    const lx = Math.cos(angle) * host.scale.x * fraction, lz = Math.sin(angle) * host.scale.z * fraction;
    const c = Math.cos(host.rotation), s = Math.sin(host.rotation), x = host.x + lx * c + lz * s, z = host.z - lx * s + lz * c;
    const own = oceanRockHeight(host, x, z), h = surface(x, z);
    if (!inBounds(chunk.bounds, x, z, .15) || own === null || Math.abs(own - h) > 1e-7 || h - bed(x, z) < .06 ||
      surface(x, z, true) > h + .01 || plantOverlap(plants, x, z, .05)) continue;
    sites.push({ siteId, x, z, mode: 'hard', hostId: host.id, grassNear: false, order: layout(`order:${siteId}`) });
  }
  sites.sort((a, b) => Number(b.grassNear) - Number(a.grassNear) || a.order - b.order || a.siteId.localeCompare(b.siteId));
  return { chunk, sites, plants };
}
function validOwner(generator, region, surface, bed) {
  return generator?.profile === OCEAN_BENTHIC_LIFE_PROFILE && Number.isSafeInteger(region?.cx) && Number.isSafeInteger(region?.cz) &&
    region.id === `${region.cx},${region.cz}` && typeof surface === 'function' && typeof bed === 'function';
}
/** Finite owner-local planning in the ordinary generated scene. Empty niches
 * remain empty; this package adds actual records and no static scenery. */
export function createOceanBenthicLifePlan(generator, region, { random, surface, bed, availableSlots = 0, maxAdded = 4 } = {}) {
  if (!validOwner(generator, region, surface, bed)) return freeze({ version: 1, placements: [], communityType: 'unoccupied', preference: 0 });
  surface = actualSurface(region, surface);
  const rng = randomFor(generator, region, random), { chunk, sites, plants } = candidateSites(generator, region, surface, bed);
  const preference = preferenceFor(generator, chunk.origin.x + 32, chunk.origin.z + 32);
  const soft = sites.filter(s => s.mode === 'soft'), hard = sites.filter(s => s.mode === 'hard');
  const communityType = soft.some(s => s.grassNear) ? 'meadow-edge' : soft.length && hard.length ? 'reef-sand-edge' :
    soft.length ? 'sediment' : hard.length ? 'hard-reef' : 'unoccupied';
  const slots = Math.min(4, Math.max(0, Number.isFinite(availableSlots) ? Math.floor(availableSlots) : 0),
    Math.max(0, Number.isFinite(maxAdded) ? Math.floor(maxAdded) : 0));
  const placements = [], rocks = new Map(chunk.elements.filter(e => e.kind === 'rock').map(e => [e.id, e]));
  const place = (speciesId, choices, probability) => {
    if (placements.length >= slots || rng(`${speciesId}:present`) >= probability || (region.agents ?? []).some(a => a.speciesId === speciesId)) return;
    const [low, high] = oceanBenthicLifeSpeciesById[speciesId].sizeRangeM;
    const sizeM = low + rng(`${speciesId}:size`) * (high - low), heading = rng(`${speciesId}:heading`) * TAU;
    const radius = traits[speciesId].radius * sizeM;
    for (const site of choices) {
      if (!inBounds(chunk.bounds, site.x, site.z, radius) || plantOverlap(plants, site.x, site.z, radius) ||
        placements.some(p => Math.hypot(p.x - site.x, p.z - site.z) < radius + traits[p.speciesId].radius * p.sizeM + .12) ||
        (region.agents ?? []).some(a => a.alive && point(a.position) && Math.abs(a.position.y - surface(site.x, site.z)) < .7 &&
          Math.hypot(a.position.x - site.x, a.position.z - site.z) < radius + (a.sizeM ?? .1) * .65 + .12)) continue;
      const support = supportAt(generator, surface, bed, speciesId, sizeM, heading, site.x, site.z, site.mode, rocks.get(site.hostId));
      if (!support) continue;
      const supportOffset = traits[speciesId].lift + (speciesId === 'reef-goatfish' ? sizeM * .32 : 0), y = support.height + supportOffset;
      if (!depthValid(generator, speciesId, y) || y + sizeM * .6 >= (generator.surfaceY ?? 8) - .6) continue;
      placements.push({ speciesId, siteId: site.siteId, hostId: site.hostId, mode: site.mode, x: site.x, y, z: site.z,
        sizeM, heading, supportOffset, habitat: site.mode === 'hard' ? 'benthic-life-hard-reef' : site.grassNear ? 'benthic-life-meadow-edge' : 'benthic-life-sediment' });
      return;
    }
  };
  place('blue-spotted-ray', soft, .42 + preference * .25);
  place('reef-goatfish', soft, .66 + preference * .18);
  place('tiger-cowrie', [...hard, ...soft], .72 + preference * .16);
  place('spotted-hermit-crab', [...soft, ...hard], .76 + preference * .12);
  return freeze({ version: 1, placements, communityType, preference });
}

export function initializeOceanBenthicLife(region, generator, { fresh = false, random, surface, bed, capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !validOwner(generator, region, surface, bed) || region.timeSec !== 0 || !region.basicNetwork || !Array.isArray(region.agents) ||
    ['benthicLifeVersion', 'benthicLifeInitializedAtSec', 'benthicLife'].some(k => Object.hasOwn(region, k)) ||
    region.agents.some(a => isOceanBenthicLifeAgent(a) || hasIndividualMarker(a))) return false;
  const cap = Math.min(20, Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0), residentCount = region.agents.length + (region.turtleAgents?.length ?? 0);
  const plan = createOceanBenthicLifePlan(generator, region, { random, surface, bed, availableSlots: Math.max(0, cap - residentCount), maxAdded });
  const rng = randomFor(generator, region, random), idFor = p => `ocean:${region.id}:benthic-life:${p.speciesId}:${p.siteId}`;
  const born = plan.placements.map(p => { const id = idFor(p), position = { x: p.x, y: p.y, z: p.z };
    return { id, regionId: region.id, speciesId: p.speciesId, position, home: { ...position }, refuge: { ...position }, target: { ...position },
      velocity: { x: 0, y: 0, z: 0 }, heading: p.heading, targetHeading: p.heading, pitch: 0, sizeM: p.sizeM, state: 'foraging', stateSince: 0,
      energy: .72 + rng(`${id}:energy`) * .10, alive: true, parasites: 0, lastFeedAt: null, nextBite: rng(`${id}:bite`) * 3,
      nextDecision: 0, decisions: 0, fleeUntil: 0, groupId: null, habitat: p.habitat, supportOffset: p.supportOffset,
      refugeHostId: p.hostId, benthicLifeHostId: p.hostId, benthicLifeSiteId: p.siteId, benthicLifeMode: p.mode,
      benthicLifeIndividualVersion: 1, dietProxy: OCEAN_BENTHIC_LIFE_FOOD_SCOPE };
  });
  region.agents.push(...born);
  const initialInputUnits = recordLivingAdmission(region, born);
  region.benthicLifeVersion = 1; region.benthicLifeInitializedAtSec = 0;
  region.benthicLife = { version: 1, communityType: plan.communityType, preference: plan.preference,
    addedIds: born.map(a => a.id), birthPlacements: plan.placements.map(p => ({ ...p, id: idFor(p) })), initialInputUnits,
    scope: 'fresh owner-local representatives; unresolved nutrition proxy; no reproduction, migration or population refill',
    foodScope: OCEAN_BENTHIC_LIFE_FOOD_SCOPE, counters: { feedings: 0, consumedUnits: 0 } };
  return true;
}
function supportFor(region, generator, agent, p, surface, bed, heading = agent.heading) {
  const radius = traits[agent.speciesId].radius * agent.sizeM, chunk = generator.chunk(region.cx, region.cz);
  if (!point(p) || !inBounds(chunk.bounds, p.x, p.z, radius) || !depthValid(generator, agent.speciesId, p.y) ||
    p.y + agent.sizeM * .6 >= (generator.surfaceY ?? 8) - .6 ||
    Math.hypot(p.x - agent.home.x, p.z - agent.home.z) > traits[agent.speciesId].extent + 1e-8 ||
    plantOverlap(chunk.elements, p.x, p.z, radius)) return null;
  const host = agent.benthicLifeMode === 'hard' ? chunk.elements.find(e => e.kind === 'rock' && e.id === agent.benthicLifeHostId) : null;
  if (agent.benthicLifeMode === 'hard' && !host) return null;
  return supportAt(generator, surface, bed, agent.speciesId, agent.sizeM, heading, p.x, p.z, agent.benthicLifeMode, host);
}
function positionValid(region, generator, agent, p, surface, bed, heading = agent.heading) {
  const support = supportFor(region, generator, agent, p, surface, bed, heading);
  return support && Math.abs(p.y - support.height - agent.supportOffset) < 1e-7;
}
function setState(agent, value, clock, state) {
  if (state) state(agent, value, clock); else if (agent.state !== value) { agent.state = value; agent.stateSince = clock; }
}
function memoizedQuery(query) {
  const values = new Map();
  return (x, z, crown = false) => {
    const key = `${x},${z},${crown ? 1 : 0}`;
    if (!values.has(key)) values.set(key, query(x, z, crown));
    return values.get(key);
  };
}
const poseKey = (p, heading) => `${p.x},${p.y},${p.z},${heading}`;
/** Called once by the owner's real simulation step. Existing food and organic
 * ledgers are debited; displayed sand, animals and sponge models are not prey. */
export function tickOceanBenthicLifeAgent(region, generator, agent, dt, { random, surface, bed, environment = {}, state } = {}) {
  if (!isOceanBenthicLifeAgent(agent) || !agent.alive || region.benthicLifeVersion !== 1 || !region.basicNetwork ||
    !Number.isFinite(dt) || dt <= 0 || !validOwner(generator, region, surface, bed)) return;
  // These caches exist only during this synchronous tick. A later tick must
  // re-observe native supports and committed habitat changes in full.
  surface = memoizedQuery(actualSurface(region, surface)); bed = memoizedQuery(bed);
  const verifiedPoses = new Set();
  const rng = randomFor(generator, region, random), trait = traits[agent.speciesId], clock = region.timeSec, light = environment.lightAtDepth ?? 1;
  if ((trait.night && light >= .15) || (!trait.night && light < .04)) {
    agent.velocity = { x: 0, y: 0, z: 0 }; setState(agent, 'resting', clock, state); return;
  }
  if (clock >= agent.nextDecision) {
    const key = `${agent.id}:decision:${agent.decisions++}`; agent.nextDecision = clock + 4 + rng(`${key}:time`) * 5;
    for (let i = 0; i < 8; i++) {
      const angle = rng(`${key}:angle:${i}`) * TAU, reach = rng(`${key}:reach:${i}`) * trait.extent;
      const target = { x: agent.home.x + Math.cos(angle) * reach, y: agent.home.y, z: agent.home.z + Math.sin(angle) * reach };
      const heading = Math.atan2(target.z - agent.position.z, target.x - agent.position.x);
      const support = supportFor(region, generator, agent, target, surface, bed, heading);
      if (!support) continue; target.y = support.height + agent.supportOffset;
      // supportFor already surveyed this exact complete footprint. Only the
      // changed Y gate remains; repeating positionValid repeats all probes.
      if (depthValid(generator, agent.speciesId, target.y) && target.y + agent.sizeM * .6 < (generator.surfaceY ?? 8) - .6) {
        agent.target = target; agent.targetHeading = heading; verifiedPoses.add(poseKey(target, heading)); break;
      }
    }
  }
  agent.velocity = { x: 0, y: 0, z: 0 };
  const previous = agent.position, dx = agent.target.x - previous.x, dz = agent.target.z - previous.z, distance = Math.hypot(dx, dz);
  if (distance > 1e-8) for (const fraction of [1, .5, .25, .125]) {
    const length = Math.min(distance, trait.speed * dt) * fraction, heading = agent.targetHeading;
    const next = { x: previous.x + dx / distance * length, y: previous.y, z: previous.z + dz / distance * length };
    const support = supportFor(region, generator, agent, next, surface, bed, heading);
    if (!support) continue; next.y = support.height + agent.supportOffset;
    const mid = { x: (previous.x + next.x) * .5, y: (previous.y + next.y) * .5, z: (previous.z + next.z) * .5 };
    const middle = supportFor(region, generator, agent, mid, surface, bed, heading);
    const oldTurn = heading === agent.heading && verifiedPoses.has(poseKey(previous, heading)) ?
      { height: previous.y - agent.supportOffset } : supportFor(region, generator, agent, previous, surface, bed, heading);
    if (!middle || !oldTurn || previous.y < oldTurn.height + agent.supportOffset - 1e-8 ||
      mid.y < middle.height + agent.supportOffset - 1e-8 || Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z) > trait.speed * dt + 1e-10) continue;
    agent.position = next; agent.heading = heading;
    if (depthValid(generator, agent.speciesId, next.y) && next.y + agent.sizeM * .6 < (generator.surfaceY ?? 8) - .6)
      verifiedPoses.add(poseKey(next, heading));
    agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (next[axis] - previous[axis]) / dt])); break;
  }
  // Ground-following movement keeps this finite model level; source movement
  // and intake rates have not been calibrated from wild observations.
  agent.pitch = 0;
  setState(agent, 'foraging', clock, state);
  if (clock < agent.nextBite || (!verifiedPoses.has(poseKey(agent.position, agent.heading)) &&
    !positionValid(region, generator, agent, agent.position, surface, bed))) return;
  agent.nextBite = clock + 3 + rng(`${agent.id}:bite:${agent.decisions}:${region.ticks}`) * 3;
  const taken = Math.min(region.resources.detritus, agent.speciesId === 'blue-spotted-ray' ? .00035 : .00022);
  if (taken <= 1e-10) { setState(agent, 'searching', clock, state); return; }
  region.resources.detritus -= taken; region.ledger.ingested += taken; recordLivingIngestion(region, agent, taken);
  agent.energy = Math.min(1, agent.energy + taken * 8); agent.lastFeedAt = clock;
  region.counters.feeding++; region.benthicLife.counters.feedings++; region.benthicLife.counters.consumedUnits += taken;
  setState(agent, 'benthic-proxy-feeding', clock, state);
  region.events.push({ id: `${region.id}:${region.ticks}:benthic-life:${agent.id}`, regionId: region.id, timeSec: clock,
    type: 'feeding', agentId: agent.id, targetId: null, pool: 'detritus', amount: taken,
    title: `${oceanBenthicLifeSpeciesById[agent.speciesId].commonName}实际摄食`, detail: '底栖营养代理库存已扣减；未判定可见动物或海绵被捕食' });
  if (region.events.length > 32) region.events.splice(0, region.events.length - 32);
}

export function validateOceanBenthicLifeRecord(region, generator, { surface, bed, capacity = 20 } = {}) {
  if (!validOwner(generator, region, surface, bed) || !nonnegative(region.timeSec) || !region.basicNetwork ||
    region.benthicLifeVersion !== 1 || region.benthicLifeInitializedAtSec !== 0 || !Array.isArray(region.agents)) return false;
  const descriptor = region.benthicLife, agents = region.agents.filter(isOceanBenthicLifeAgent);
  if (region.agents.some(a => hasIndividualMarker(a) && !isOceanBenthicLifeAgent(a))) return false;
  if (!descriptor || descriptor.version !== 1 || descriptor.foodScope !== OCEAN_BENTHIC_LIFE_FOOD_SCOPE ||
    !['unoccupied', 'meadow-edge', 'reef-sand-edge', 'sediment', 'hard-reef'].includes(descriptor.communityType) ||
    !nonnegative(descriptor.preference) || descriptor.preference > 1 || !Array.isArray(descriptor.addedIds) || !Array.isArray(descriptor.birthPlacements) ||
    new Set(descriptor.addedIds).size !== agents.length || descriptor.addedIds.length !== agents.length || descriptor.birthPlacements.length !== agents.length ||
    agents.length > 4 || new Set(agents.map(a => a.speciesId)).size !== agents.length ||
    region.agents.length + (region.turtleAgents?.length ?? 0) > Math.min(20, capacity) ||
    !nonnegative(descriptor.initialInputUnits) || Math.abs(descriptor.initialInputUnits - agents.length * .004) > 1e-10 ||
    !Number.isSafeInteger(descriptor.counters?.feedings) || descriptor.counters.feedings < 0 || !nonnegative(descriptor.counters?.consumedUnits)) return false;
  surface = actualSurface(region, surface);
  const { chunk, sites } = candidateSites(generator, region, surface, bed);
  const preference = preferenceFor(generator, chunk.origin.x + 32, chunk.origin.z + 32);
  const soft = sites.filter(s => s.mode === 'soft'), hard = sites.filter(s => s.mode === 'hard');
  const communityType = soft.some(s => s.grassNear) ? 'meadow-edge' : soft.length && hard.length ? 'reef-sand-edge' :
    soft.length ? 'sediment' : hard.length ? 'hard-reef' : 'unoccupied';
  if (descriptor.preference !== preference || descriptor.communityType !== communityType ||
    new Set(descriptor.birthPlacements.map(p => p.id)).size !== agents.length) return false;
  return agents.every(agent => {
    const birth = descriptor.birthPlacements.find(p => p.id === agent.id), range = oceanBenthicLifeSpeciesById[agent.speciesId].sizeRangeM;
    const site = birth && sites.find(s => s.siteId === birth.siteId);
    if (!birth || !site || birth.speciesId !== agent.speciesId || birth.hostId !== site.hostId || birth.mode !== site.mode || birth.x !== site.x || birth.z !== site.z ||
      agent.benthicLifeIndividualVersion !== 1 || !descriptor.addedIds.includes(agent.id) || agent.regionId !== region.id ||
      agent.id !== `ocean:${region.id}:benthic-life:${agent.speciesId}:${birth.siteId}` || agent.sizeM !== birth.sizeM ||
      !Number.isFinite(agent.sizeM) || agent.sizeM < range[0] || agent.sizeM > range[1] ||
      agent.benthicLifeHostId !== site.hostId || agent.refugeHostId !== site.hostId || agent.benthicLifeSiteId !== site.siteId || agent.benthicLifeMode !== site.mode ||
      (['blue-spotted-ray', 'reef-goatfish'].includes(agent.speciesId) && site.mode !== 'soft') ||
      ![agent.position, agent.home, agent.refuge, agent.target, agent.velocity].every(point) || !point(birth) ||
      !Number.isFinite(agent.heading) || !Number.isFinite(agent.targetHeading) || !Number.isFinite(birth.heading) ||
      agent.pitch !== 0 || !nonnegative(agent.supportOffset) || agent.supportOffset !== birth.supportOffset || agent.dietProxy !== OCEAN_BENTHIC_LIFE_FOOD_SCOPE ||
      Math.abs(agent.supportOffset - (traits[agent.speciesId].lift + (agent.speciesId === 'reef-goatfish' ? agent.sizeM * .32 : 0))) > 1e-10 ||
      !nonnegative(agent.nextBite) || !nonnegative(agent.nextDecision) || !Number.isSafeInteger(agent.decisions) || agent.decisions < 0 ||
      typeof agent.alive !== 'boolean' || !nonnegative(agent.organicUnits) || typeof agent.organicDeathRecorded !== 'boolean' ||
      !nonnegative(agent.energy) || agent.energy > 1 || !nonnegative(agent.stateSince) || agent.stateSince > region.timeSec ||
      Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) > traits[agent.speciesId].speed + 1e-8 ||
      agent.home.x !== birth.x || agent.home.y !== birth.y || agent.home.z !== birth.z ||
      agent.refuge.x !== birth.x || agent.refuge.y !== birth.y || agent.refuge.z !== birth.z ||
      !positionValid(region, generator, agent, agent.position, surface, bed) ||
      !positionValid(region, generator, agent, agent.target, surface, bed, agent.targetHeading) ||
      !positionValid(region, generator, agent, agent.home, surface, bed, birth.heading)) return false;
    return true;
  });
}
