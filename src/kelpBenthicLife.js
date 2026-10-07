import { oceanRockHeight } from './oceanRockShape.js';
import { kelpBenthicLifeSpeciesById } from './kelpBenthicLifeSpecies.js';

export const KELP_BENTHIC_LIFE_VERSION = 1;
export const KELP_BENTHIC_LIFE_AGENT_LIMIT = 4;
export const KELP_BENTHIC_LIFE_IDS = Object.freeze(['red-abalone', 'northern-kelp-crab', 'california-sea-hare', 'giant-plumose-anemone']);
export const KELP_BENTHIC_LIFE_FOOD_SCOPE = 'existing owner-local rock algae nutrition proxy for abalone, crab and juvenile sea hare; existing near-bed detritus nutrition proxy for anemone, not plankton or rendered prey capture; no extra food input, measured biomass or complete natural diet';
export const KELP_BENTHIC_LIFE_MODEL = Object.freeze({
  maximumFootGapM: .018, minimumNormalY: .94, clearanceM: .004,
  maximumFoodDistanceM: .32, biteAmount: .00016, biteIntervalSec: 6, energyGainPerUnit: 2,
  traits: Object.freeze({
    'red-abalone': Object.freeze({ radius: .87, height: .38, speedMps: .0015, homeExtentM: .32, pool: 'algae' }),
    'northern-kelp-crab': Object.freeze({ radius: 2.15, height: .72, speedMps: .008, homeExtentM: .50, pool: 'algae' }),
    'california-sea-hare': Object.freeze({ radius: .76, height: .50, speedMps: .004, homeExtentM: .40, pool: 'algae' }),
    'giant-plumose-anemone': Object.freeze({ radius: .84, height: 1.40, speedMps: 0, homeExtentM: 0, pool: 'detritus' }),
  }),
  note: 'Uncalibrated sparse representatives and movement/intake/condition rates; anemone stays attached. Finite whole-envelope native support probes and conservative birth/new-animal movement avoidance; legacy animals retain their old controllers and can approach shared food patches, so no global pair-collision proof. No reproduction, migration, starvation forecast, offline evolution or population refill.',
});
const MODEL = KELP_BENTHIC_LIFE_MODEL, TAU = Math.PI * 2, SIZE = 64, SALT = 'kelp-benthic-life-v1';
const clone = value => structuredClone(value), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const close = (a, b, tolerance = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const markedAgent = a => a && ['kelpBenthicIndividualVersion', 'kelpBenthicHostId', 'kelpBenthicSiteId', 'kelpBenthicFoodPatchId'].some(k => Object.hasOwn(a, k));
const recordFields = ['kelpBenthicLifeVersion', 'kelpBenthicLifeInitializedAtSec', 'kelpBenthicLife', 'kelpBenthicAgents'];
export const isKelpBenthicLifeAgent = a => KELP_BENTHIC_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (generator, region) => salt => hash(`${SALT}|${typeof generator.seed}:${generator.seed}|${region.id}|${salt}`) / 4294967296;
const owns = (region, p, radius = 0) => vector(p) && p.x >= region.cx * SIZE + radius + .15 && p.x <= (region.cx + 1) * SIZE - radius - .15 &&
  p.z >= region.cz * SIZE + radius + .15 && p.z <= (region.cz + 1) * SIZE - radius - .15 && Math.hypot(p.x, p.z) > 46 + radius;
const validOwner = (generator, region) => generator?.supportVersion === 2 && typeof generator.supportAt === 'function' &&
  typeof generator.heightAt === 'function' && Number.isSafeInteger(region?.cx) && Number.isSafeInteger(region?.cz) &&
  region.id === `${region.cx},${region.cz}` && region.sim && Array.isArray(region.sim.agents) && Array.isArray(region.sim.rockPatches);
const residents = region => [...region.sim.agents.filter(a => a.speciesId !== 'giant-kelp'), ...(region.waterAgents ?? []), ...(region.visitorAgents ?? []), ...(region.kelpBenthicAgents ?? [])];
function depthValid(generator, speciesId, y) { const [low, high] = kelpBenthicLifeSpeciesById[speciesId].depthSelectionM;
  const depth = generator.surfaceY - y; return depth >= low && depth <= high; }

// This is exactly the renderer's forward/up/side frame, not a flat disc on a
// sloping rock. It covers the leg, shell, rhinophore and expanded-crown radii.
function basis(normal, heading) {
  if (!vector(normal)) return null;
  const length = Math.hypot(normal.x, normal.y, normal.z); if (!(length > 0)) return null;
  const up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / length]));
  const dot = Math.cos(heading) * up.x + Math.sin(heading) * up.z;
  const f = { x: Math.cos(heading) - up.x * dot, y: -up.y * dot, z: Math.sin(heading) - up.z * dot }, fl = Math.hypot(f.x, f.y, f.z);
  if (fl < 1e-8) return null;
  const forward = Object.fromEntries(['x', 'y', 'z'].map(k => [k, f[k] / fl]));
  return { up, forward, side: { x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x } };
}
const worldOffset = (frame, x, y, z) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, frame.forward[k] * x + frame.up[k] * y + frame.side[k] * z]));
function bodyProbes(speciesId, sizeM, frame) {
  const trait = MODEL.traits[speciesId], radius = trait.radius * sizeM, height = trait.height * sizeM;
  const points = [{ x: 0, y: 0, z: 0, foot: true }];
  for (const fraction of [.5, 1]) for (let i = 0; i < 12; i++) {
    const angle = i * TAU / 12, offset = worldOffset(frame, Math.cos(angle) * radius * fraction, 0, Math.sin(angle) * radius * fraction);
    points.push({ ...offset, foot: true });
  }
  for (const vertical of [.5, 1]) for (let i = 0; i < 12; i++) {
    const angle = i * TAU / 12, offset = worldOffset(frame, Math.cos(angle) * radius, height * vertical, Math.sin(angle) * radius);
    points.push({ ...offset, foot: false });
  }
  return points;
}
function nearbyPlants(generator, region) {
  const plants = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    plants.push(...generator.chunk(region.cx + dx, region.cz + dz).elements.filter(e => e.kind === 'kelp'));
  return plants;
}
// Absolute bounds on the existing stipe formula, across all clocks and the
// permitted 0–1.2m/s display flow. Chord length bounds tighten the low-height
// envelope; it never borrows an unloaded neighbour's clock. A blade allowance
// is included whenever the lowest possible blade can intersect the body.
function stipeRadiusAtHeight(anchor, highY) {
  const high = Math.max(0, highY - anchor.y), length = anchor.lengthM * .94;
  if (!(length > 0)) return 4.8;
  const horizontal = u => 2.30 * u ** 5 + (u < .5 ? 1.12 * u * (1 - u) : .28) + .284 * u + .648 * u ** 1.8 + .715 * u ** 2;
  let radius = 4.0;
  for (let i = 0; i < 5; i++) radius = horizontal(Math.min(1, Math.sqrt(high * high + radius * radius) / length));
  const leafBase = Math.sqrt(Math.max(0, (length * .10) ** 2 - horizontal(.10) ** 2));
  return radius + .045 + (high >= leafBase - .75 ? .75 : 0);
}
function plantsClear(region, position, radius, height, plants) {
  for (const e of plants) {
    const a = e.anchor; if (!a || position.y + height < a.y - .04 || position.y - radius > a.y + a.lengthM + .75) continue;
    if (Math.hypot(position.x - a.x, position.z - a.z) < radius + .025 + stipeRadiusAtHeight(a, position.y + height + radius * .35)) return false;
  }
  for (const p of region.understoryPlants ?? []) {
    if (position.y + height < p.y - .02 || position.y - radius > p.y + p.heightM + .02) continue;
    if (Math.hypot(position.x - p.x, position.z - p.z) < radius + p.radiusM + .025) return false;
  }
  return true;
}
function bodyClear(region, agent, position, radius, height) {
  return residents(region).every(other => {
    if (other.id === agent?.id || !other.alive || !vector(other.position)) return true;
    const otherTrait = MODEL.traits[other.speciesId], r = (otherTrait?.radius ?? .65) * (other.sizeM ?? .1);
    const h = (otherTrait?.height ?? .55) * (other.sizeM ?? .1);
    if (position.y + height + .025 < other.position.y - r * .35 || position.y - radius * .35 > other.position.y + h + .025) return true;
    return Math.hypot(position.x - other.position.x, position.z - other.position.z) >= radius + height * .35 + r + h * .35 + .035;
  });
}
function survey(generator, region, speciesId, sizeM, heading, x, z, host, plants, agent = null, occupancy = true) {
  if (!host || !Number.isFinite(heading)) return null;
  const trait = MODEL.traits[speciesId], radius = trait.radius * sizeM, height = trait.height * sizeM;
  const center = generator.supportAt(x, z), frame = basis(center.normal, heading);
  if (!frame || frame.up.y < MODEL.minimumNormalY || center.elementId !== host.id || center.substrate !== 'rock') return null;
  let rootY = center.height + MODEL.clearanceM, minimumFoot = Infinity, maximumFoot = -Infinity;
  const probes = bodyProbes(speciesId, sizeM, frame);
  for (const p of probes) {
    const px = x + p.x, pz = z + p.z, terrain = generator.heightAt(px, pz);
    if (!Number.isFinite(terrain)) return null;
    if (p.foot) {
      const own = oceanRockHeight(host, px, pz);
      if (!Number.isFinite(own) || !close(own, terrain)) return null;
      minimumFoot = Math.min(minimumFoot, terrain - p.y); maximumFoot = Math.max(maximumFoot, terrain - p.y);
    }
    rootY = Math.max(rootY, terrain - p.y + MODEL.clearanceM);
  }
  if (maximumFoot - minimumFoot > MODEL.maximumFootGapM || rootY - center.height > MODEL.maximumFootGapM + MODEL.clearanceM) return null;
  const position = { x, y: rootY, z };
  if (!owns(region, position, radius + height * .35) || !depthValid(generator, speciesId, position.y) ||
      position.y + height + radius * .35 > generator.surfaceY - .5 ||
      !plantsClear(region, position, radius + height * .35, height, plants) || (occupancy && !bodyClear(region, agent, position, radius, height))) return null;
  return { position, supportNormal: frame.up, supportOffset: position.y - center.height };
}
function foodSites(generator, region) {
  const chunk = generator.chunk(region.cx, region.cz), rocks = chunk.elements.filter(e => ['rock', 'formation'].includes(e.kind)), sites = [];
  const random = randomFor(generator, region);
  for (const patch of region.sim.rockPatches) {
    if (!vector(patch.position) || !owns(region, { ...patch.position, y: patch.position.y }, .15)) continue;
    const hostId = generator.supportAt(patch.position.x, patch.position.z).elementId, host = rocks.find(e => e.id === hostId);
    if (!host) continue;
    for (let i = 0; i < 12; i++) for (const reach of [.12, .22]) {
      const angle = (i / 12 + random(`site-phase:${patch.id}`)) * TAU, x = patch.position.x + Math.cos(angle) * reach, z = patch.position.z + Math.sin(angle) * reach;
      const siteId = `${patch.id}:${i}:${reach}`;
      sites.push({ siteId, patchId: patch.id, hostId, x, z, host, order: random(`order:${siteId}`) });
    }
  }
  sites.sort((a, b) => a.order - b.order || a.siteId.localeCompare(b.siteId));
  return { sites, plants: nearbyPlants(generator, region) };
}

/** Sparse whole-body representatives in actual ordinary generated hard-bottom
 * niches. Empty suitable niches remain empty; no food or scenery is created. */
export function createKelpBenthicLifePlan(generator, region, { availableSlots = 0, maxAdded = 4 } = {}) {
  const empty = { version: 1, placements: [] };
  if (!validOwner(generator, region)) return freeze(empty);
  const slots = Math.min(4, Math.max(0, Number.isFinite(availableSlots) ? Math.floor(availableSlots) : 0), Math.max(0, Number.isFinite(maxAdded) ? Math.floor(maxAdded) : 0));
  if (!slots) return freeze(empty);
  const random = randomFor(generator, region), { sites, plants } = foodSites(generator, region), placements = [];
  for (const speciesId of KELP_BENTHIC_LIFE_IDS) {
    if (placements.length >= slots || random(`${speciesId}:present`) > .86 || residents(region).some(a => a.speciesId === speciesId)) continue;
    const [low, high] = kelpBenthicLifeSpeciesById[speciesId].sizeRangeM, sizeM = low + random(`${speciesId}:size`) * (high - low), heading = random(`${speciesId}:heading`) * TAU;
    const trait = MODEL.traits[speciesId];
    for (const site of sites) {
      const support = survey(generator, region, speciesId, sizeM, heading, site.x, site.z, site.host, plants);
      if (!support || placements.some(p => Math.hypot(p.position.x - site.x, p.position.z - site.z) <
        (trait.radius + trait.height * .35) * sizeM + (MODEL.traits[p.speciesId].radius + MODEL.traits[p.speciesId].height * .35) * p.sizeM + .035)) continue;
      if (distance(support.position, region.sim.rockPatches.find(p => p.id === site.patchId).position) > MODEL.maximumFoodDistanceM) continue;
      placements.push({ id: `kelp-benthic:${region.id}:${speciesId}:${site.siteId}`, speciesId, siteId: site.siteId, hostId: site.hostId, foodPatchId: site.patchId,
        sizeM, heading, position: support.position, supportNormal: support.supportNormal, supportOffset: support.supportOffset, habitat: 'kelp-native-hard-bottom' });
      break;
    }
  }
  return freeze({ version: 1, placements });
}
export function initializeKelpBenthicLife(generator, region, { fresh = false, capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !validOwner(generator, region) || region.sim.timeSec !== 0 || recordFields.some(k => Object.hasOwn(region, k)) || residents(region).some(a => isKelpBenthicLifeAgent(a) || markedAgent(a))) return false;
  const cap = Math.min(20, Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0);
  const plan = createKelpBenthicLifePlan(generator, region, { availableSlots: cap - residents(region).length, maxAdded });
  const random = randomFor(generator, region);
  region.kelpBenthicAgents = plan.placements.map(p => ({ id: p.id, regionId: region.id, speciesId: p.speciesId,
    position: clone(p.position), home: clone(p.position), target: clone(p.position), velocity: { x: 0, y: 0, z: 0 },
    heading: p.heading, targetHeading: p.heading, pitch: 0, sizeM: p.sizeM, supportNormal: clone(p.supportNormal), supportOffset: p.supportOffset,
    energy: .70 + random(`${p.id}:condition`) * .10, alive: true, state: MODEL.traits[p.speciesId].speedMps ? 'foraging' : 'fixed',
    stateSince: 0, createdAtSec: 0, timeSec: 0, lastFeedAt: null, nextBite: random(`${p.id}:bite`) * 3, nextDecision: 0, decisions: 0,
    kelpBenthicIndividualVersion: 1, kelpBenthicHostId: p.hostId, kelpBenthicSiteId: p.siteId, kelpBenthicFoodPatchId: p.foodPatchId,
    habitat: p.habitat, foodScope: KELP_BENTHIC_LIFE_FOOD_SCOPE, nutritionPool: MODEL.traits[p.speciesId].pool,
    conditionScope: 'relative condition index; no new biomass or food inventory', lastBenthicIntake: null }));
  region.kelpBenthicLifeVersion = 1; region.kelpBenthicLifeInitializedAtSec = 0;
  region.kelpBenthicLife = { version: 1, birthPlacements: clone(plan.placements), addedIds: region.kelpBenthicAgents.map(a => a.id),
    foodScope: KELP_BENTHIC_LIFE_FOOD_SCOPE, scope: MODEL.note, lastTickSec: 0,
    counters: { ticks: 0, feedings: 0, consumedUnits: 0 } };
  return true;
}
export function captureKelpBenthicLife(region) {
  return Object.hasOwn(region, 'kelpBenthicLifeVersion') ? Object.fromEntries(recordFields.map(k => [k, clone(region[k])])) : {};
}
function supportFor(generator, region, agent, position, heading, plants, occupancy = true) {
  if (!vector(position) || Math.hypot(position.x - agent.home.x, position.z - agent.home.z) > MODEL.traits[agent.speciesId].homeExtentM + 1e-8) return null;
  const host = generator.chunk(region.cx, region.cz).elements.find(e => e.id === agent.kelpBenthicHostId && ['rock', 'formation'].includes(e.kind));
  return survey(generator, region, agent.speciesId, agent.sizeM, heading, position.x, position.z, host, plants, agent, occupancy);
}
export function kelpBenthicLifePositionValid(generator, region, agent, position = agent.position, heading = agent.heading, { occupancy = false } = {}) {
  if (!validOwner(generator, region) || !isKelpBenthicLifeAgent(agent)) return false;
  const support = supportFor(generator, region, agent, position, heading, nearbyPlants(generator, region), occupancy);
  return Boolean(support && close(position.y, support.position.y));
}
function setState(agent, state, clock) { if (agent.state !== state) { agent.state = state; agent.stateSince = clock; } }
/** One owner's existing 0.1s clock owns movement, condition and intake. Only
 * actual physically nearby finite food stocks are removed and accounted. */
export function tickKelpBenthicLife(region, generator, dt) {
  if (!validOwner(generator, region) || region.kelpBenthicLifeVersion !== 1 || !Number.isFinite(dt) || dt <= 0 || dt > .1 + 1e-9 ||
      region.sim.timeSec <= region.kelpBenthicLife.lastTickSec + 1e-9 || !close(region.sim.timeSec - region.kelpBenthicLife.lastTickSec, dt)) return false;
  const clock = region.sim.timeSec, descriptor = region.kelpBenthicLife, random = randomFor(generator, region), plants = nearbyPlants(generator, region);
  descriptor.lastTickSec = clock; descriptor.counters.ticks++;
  for (const agent of region.kelpBenthicAgents) {
    if (!agent.alive) continue;
    const trait = MODEL.traits[agent.speciesId], previous = clone(agent.position);
    agent.timeSec = clock; agent.velocity = { x: 0, y: 0, z: 0 };
    if (clock >= agent.nextDecision && trait.speedMps > 0) {
      const key = `${agent.id}:decision:${agent.decisions++}`; agent.nextDecision = clock + 4 + random(`${key}:time`) * 4;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = random(`${key}:angle:${attempt}`) * TAU, reach = random(`${key}:reach:${attempt}`) * trait.homeExtentM;
        const p = { x: agent.home.x + Math.cos(angle) * reach, y: agent.home.y, z: agent.home.z + Math.sin(angle) * reach }, heading = Math.atan2(p.z - previous.z, p.x - previous.x);
        const support = supportFor(generator, region, agent, p, heading, plants);
        if (support) { agent.target = support.position; agent.targetHeading = heading; break; }
      }
    }
    const dx = agent.target.x - previous.x, dz = agent.target.z - previous.z, horizontal = Math.hypot(dx, dz);
    if (trait.speedMps > 0 && horizontal > 1e-8) for (const fraction of [1, .5, .25]) {
      const step = Math.min(horizontal, trait.speedMps * dt) * fraction;
      const p = { x: previous.x + dx / horizontal * step, y: previous.y, z: previous.z + dz / horizontal * step }, heading = agent.targetHeading;
      const next = supportFor(generator, region, agent, p, heading, plants), turn = supportFor(generator, region, agent, previous, heading, plants);
      if (!next || !turn || previous.y < turn.position.y - 1e-8 || distance(next.position, previous) > trait.speedMps * dt + 1e-8) continue;
      const mid = { x: (previous.x + next.position.x) / 2, y: (previous.y + next.position.y) / 2, z: (previous.z + next.position.z) / 2 };
      const middle = supportFor(generator, region, agent, mid, heading, plants);
      if (!middle || mid.y < middle.position.y - 1e-8) continue;
      agent.position = next.position; agent.heading = heading; agent.supportNormal = next.supportNormal; agent.supportOffset = next.supportOffset;
      agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (agent.position[k] - previous[k]) / dt])); break;
    }
    agent.energy = Math.max(.02, agent.energy - dt * (.000025 + (region.sim.environment.currentMps ?? 0) ** 2 * .00004));
    setState(agent, trait.speedMps ? horizontal > 1e-8 && distance(previous, agent.position) < 1e-12 ? 'blocked' : 'foraging' : 'fixed', clock);
    if (clock < agent.nextBite) continue;
    const support = supportFor(generator, region, agent, agent.position, agent.heading, plants);
    const patch = region.sim.rockPatches.find(p => p.id === agent.kelpBenthicFoodPatchId);
    if (!support || !close(agent.position.y, support.position.y) || !patch || !vector(patch.position) ||
        distance(agent.position, patch.position) > MODEL.maximumFoodDistanceM || !(patch[trait.pool] > 1e-10)) { setState(agent, 'searching', clock); continue; }
    const stockBefore = patch[trait.pool], energyBefore = agent.energy;
    const removedUnits = region.sim._remove(patch, trait.pool, MODEL.biteAmount, 'ingested');
    if (!(removedUnits > 0)) continue;
    agent.energy = Math.min(1, agent.energy + removedUnits * MODEL.energyGainPerUnit); agent.lastFeedAt = clock; agent.nextBite = clock + MODEL.biteIntervalSec;
    region.sim.counters.feedingCount++; descriptor.counters.feedings++; descriptor.counters.consumedUnits += removedUnits;
    agent.lastBenthicIntake = { timeSec: clock, patchId: patch.id, pool: trait.pool, stockBefore, stockAfter: patch[trait.pool], removedUnits,
      energyBefore, energyAfter: agent.energy, agentPosition: clone(agent.position), foodPosition: clone(patch.position),
      contactDistanceM: distance(agent.position, patch.position), allowedDistanceM: MODEL.maximumFoodDistanceM, unit: 'relative-organic-food-proxy-unit' };
    setState(agent, 'kelp-benthic-feeding', clock);
    if (!agent.hasExplainedBenthicFeeding) {
      agent.hasExplainedBenthicFeeding = true;
      region.sim.events.push({ timeSec: clock, type: 'kelp-benthic-feeding', label: `${kelpBenthicLifeSpeciesById[agent.speciesId].commonName}摄食局部营养代理`,
        agentId: agent.id, cause: KELP_BENTHIC_LIFE_FOOD_SCOPE, ...clone(agent.lastBenthicIntake) });
      if (region.sim.events.length > 60) region.sim.events.shift();
    }
  }
  return true;
}
function validIntake(agent, region, clock) {
  const a = agent.lastBenthicIntake;
  if (a === null) return agent.lastFeedAt === null;
  if (!a || !nonnegative(a.timeSec) || a.timeSec > clock || a.timeSec !== agent.lastFeedAt || a.patchId !== agent.kelpBenthicFoodPatchId ||
      a.pool !== MODEL.traits[agent.speciesId].pool || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(k => nonnegative(a[k])) ||
      a.removedUnits <= 0 || a.removedUnits > MODEL.biteAmount + 1e-10 || !close(a.stockBefore - a.stockAfter, a.removedUnits) ||
      a.energyBefore > 1 || a.energyAfter > 1 || !close(a.energyAfter, Math.min(1, a.energyBefore + a.removedUnits * MODEL.energyGainPerUnit)) ||
      !vector(a.agentPosition) || !vector(a.foodPosition) || !close(distance(a.agentPosition, a.foodPosition), a.contactDistanceM) ||
      a.allowedDistanceM !== MODEL.maximumFoodDistanceM || a.contactDistanceM > a.allowedDistanceM || a.unit !== 'relative-organic-food-proxy-unit') return false;
  const patch = region.sim.rockPatches.find(p => p.id === a.patchId);
  return Boolean(patch && ['x', 'y', 'z'].every(k => a.foodPosition[k] === patch.position[k]));
}
/** Absence is an old record, never an invitation to refill it. Any reserved
 * partial marker rejects. Births, dead identities and finite stocks persist. */
export function validateKelpBenthicLifeRecord(record, region, { generator, capacity = 20 } = {}) {
  const old = [...(record?.state?.agents ?? region?.sim?.agents ?? []), ...(record?.waterAgents ?? []), ...(record?.visitorAgents ?? [])];
  if (old.some(a => isKelpBenthicLifeAgent(a) || markedAgent(a))) return false;
  const marked = record && recordFields.some(k => Object.hasOwn(record, k));
  if (!marked) return true;
  if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || !validOwner(generator, region) || record.kelpBenthicLifeVersion !== 1 || record.kelpBenthicLifeInitializedAtSec !== 0 || !Array.isArray(record.kelpBenthicAgents) ||
      record.kelpBenthicAgents.length > 4 || old.filter(a => a.speciesId !== 'giant-kelp').length + record.kelpBenthicAgents.length > Math.min(20, capacity)) return false;
  const d = record.kelpBenthicLife, clock = region.sim.timeSec, agents = record.kelpBenthicAgents;
  if (!d || d.version !== 1 || d.foodScope !== KELP_BENTHIC_LIFE_FOOD_SCOPE || d.scope !== MODEL.note ||
      !nonnegative(d.lastTickSec) || d.lastTickSec > clock || !Number.isSafeInteger(d.counters?.ticks) || d.counters.ticks < 0 ||
      !close(d.counters.ticks * .1, d.lastTickSec) || !Number.isSafeInteger(d.counters?.feedings) || d.counters.feedings < 0 || !nonnegative(d.counters?.consumedUnits) ||
      d.counters.feedings > region.sim.counters.feedingCount || d.counters.consumedUnits > region.sim.ledger.ingested + 1e-8 ||
      d.counters.consumedUnits > d.counters.feedings * MODEL.biteAmount + 1e-8 || (d.counters.feedings === 0 ? d.counters.consumedUnits !== 0 : d.counters.consumedUnits <= 0) ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
      new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length || new Set(agents.map(a => a?.speciesId)).size !== agents.length) return false;
  const { sites, plants } = foodSites(generator, region), ids = new Set(old.map(a => a.id)), validationRegion = { ...region, kelpBenthicAgents: agents };
  for (const agent of agents) {
    if (!isKelpBenthicLifeAgent(agent)) return false;
    const trait = MODEL.traits[agent.speciesId], birth = d.birthPlacements.find(p => p.id === agent.id), site = birth && sites.find(p => p.siteId === birth.siteId);
    const random = randomFor(generator, region), range = kelpBenthicLifeSpeciesById[agent.speciesId].sizeRangeM;
    if (!site || !birth || ids.has(agent.id) || !d.addedIds.includes(agent.id) || agent.id !== `kelp-benthic:${region.id}:${agent.speciesId}:${site.siteId}` ||
        birth.speciesId !== agent.speciesId || birth.hostId !== site.hostId || birth.foodPatchId !== site.patchId || birth.position?.x !== site.x || birth.position?.z !== site.z ||
        agent.kelpBenthicIndividualVersion !== 1 || agent.kelpBenthicHostId !== site.hostId || agent.kelpBenthicSiteId !== site.siteId || agent.kelpBenthicFoodPatchId !== site.patchId ||
        agent.regionId !== region.id || agent.habitat !== 'kelp-native-hard-bottom' || birth.habitat !== agent.habitat || !Number.isFinite(agent.sizeM) ||
        agent.sizeM !== range[0] + random(`${agent.speciesId}:size`) * (range[1] - range[0]) || agent.sizeM !== birth.sizeM ||
        birth.heading !== random(`${agent.speciesId}:heading`) * TAU || !['position', 'home', 'target', 'velocity', 'supportNormal'].every(k => vector(agent[k])) ||
        !vector(birth.position) || !vector(birth.supportNormal) || !['heading', 'targetHeading', 'supportOffset'].every(k => Number.isFinite(agent[k])) || agent.pitch !== 0 ||
        !['x', 'y', 'z'].every(k => agent.home[k] === birth.position[k]) || agent.createdAtSec !== 0 || typeof agent.alive !== 'boolean' ||
        !['timeSec', 'stateSince', 'energy', 'nextBite', 'nextDecision'].every(k => nonnegative(agent[k])) || agent.timeSec > clock || agent.stateSince > agent.timeSec || agent.energy > 1 ||
        !Number.isSafeInteger(agent.decisions) || agent.decisions < 0 || Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) > trait.speedMps + 1e-8 ||
        !['foraging', 'resting', 'searching', 'fixed', 'blocked', 'kelp-benthic-feeding', 'dead'].includes(agent.state) ||
        (agent.alive ? agent.state === 'dead' : agent.state !== 'dead' || agent.energy !== 0 || Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) !== 0) ||
        agent.foodScope !== KELP_BENTHIC_LIFE_FOOD_SCOPE || agent.nutritionPool !== trait.pool || agent.conditionScope !== 'relative condition index; no new biomass or food inventory' ||
        !validIntake(agent, region, clock)) return false;
    const born = survey(generator, validationRegion, agent.speciesId, agent.sizeM, birth.heading, site.x, site.z, site.host, plants, agent, false);
    const current = supportFor(generator, validationRegion, agent, agent.position, agent.heading, plants, false), target = supportFor(generator, validationRegion, agent, agent.target, agent.targetHeading, plants, false);
    if (!born || !current || !target || !close(birth.position.y, born.position.y) || !close(birth.supportOffset, born.supportOffset) ||
        !['x', 'y', 'z'].every(k => close(birth.supportNormal[k], born.supportNormal[k])) || !close(agent.position.y, current.position.y) ||
        !close(agent.supportOffset, current.supportOffset) || !close(agent.target.y, target.position.y) || !['x', 'y', 'z'].every(k => close(agent.supportNormal[k], current.supportNormal[k]))) return false;
    if (!trait.speedMps && (!['x', 'y', 'z'].every(k => agent.position[k] === agent.home[k] && agent.target[k] === agent.home[k]) || agent.heading !== birth.heading || agent.targetHeading !== birth.heading)) return false;
    ids.add(agent.id);
  }
  return true;
}
