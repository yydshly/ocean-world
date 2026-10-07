import { deepBenthicLifeSpeciesCatalog, deepBenthicLifeSpeciesById } from './deepBenthicLifeSpecies.js';

export const DEEP_BENTHIC_LIFE_VERSION = 1;
export const DEEP_BENTHIC_LIFE_AGENT_LIMIT = 4;
export const DEEP_BENTHIC_LIFE_IDS = Object.freeze(deepBenthicLifeSpeciesCatalog.map(s => s.id));
export const DEEP_BENTHIC_LIFE_FOOD_SCOPE = 'existing owner-local surfaceDetritus or benthicAnimalFood relative nutrition proxy; actual finite contact debits only; not new carcasses, rendered prey capture, measured biomass or a complete natural diet';
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const genericTraits = {
  worm: { speedMps: .003, homeExtentM: .8, pool: 'surfaceDetritus', mouth: { x: .44, y: .025, z: 0 }, reachM: .025 },
  cucumber: { speedMps: .0015, homeExtentM: .7, pool: 'surfaceDetritus', mouth: { x: .44, y: .035, z: 0 }, reachM: .035 },
  'brittle-star': { speedMps: .004, homeExtentM: .8, pool: 'surfaceDetritus', mouth: { x: 0, y: .025, z: 0 }, reachM: .025 },
  urchin: { speedMps: .001, homeExtentM: .6, pool: 'surfaceDetritus', mouth: { x: 0, y: .015, z: 0 }, reachM: .025 },
  crustacean: { speedMps: .01, homeExtentM: 1, pool: 'benthicAnimalFood', mouth: { x: .4, y: .06, z: 0 }, reachM: .025 },
};
const traits = Object.fromEntries(deepBenthicLifeSpeciesCatalog.map(species => [species.id,
  { ...genericTraits[species.kind], radius: species.normalizedEnvelope.horizontalRadiusUnits,
    height: species.normalizedEnvelope.y[1], mouth: { ...genericTraits[species.kind]?.mouth } }]));
export const DEEP_BENTHIC_LIFE_MODEL = freeze({
  maximumFootGapM: .018, minimumNormalY: .94, clearanceM: .003,
  biteAmount: .00016, biteIntervalSec: 6, energyGainPerUnit: 2,
  metabolismPerSec: .00003, motionDebitPerM: .0002, turnRadiansPerSec: .35,
  traits, note: 'Uncalibrated sparse soft-bottom representatives and condition rates; finite native full-envelope support/turn/path references, not a rigid-body solver or surveyed co-occurrence. No light-derived energy, reproduction, migration, offline stock growth or refill.',
});
const MODEL = DEEP_BENTHIC_LIFE_MODEL, SIZE = 64, STEP = .1, TAU = Math.PI * 2;
const recordFields = ['deepBenthicLifeVersion', 'deepBenthicLifeInitializedAtSec', 'deepBenthicLife', 'deepBenthicAgents', 'deepBenthicEnergyLedger'];
const clone = value => structuredClone(value), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const vector = value => value && ['x', 'y', 'z'].every(k => Number.isFinite(value[k]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const markedAgent = a => a && Object.keys(a).some(k => k.startsWith('deepBenthic'));
export const isDeepBenthicLifeAgent = a => DEEP_BENTHIC_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (generator, region) => salt => hash(`deep-bottom-life-v1|${typeof generator.seed}:${generator.seed}|${region.id}|${salt}`) / 4294967296;
const owns = (region, p, radius = 0) => vector(p) && p.x >= region.cx * SIZE + radius + .15 && p.x <= (region.cx + 1) * SIZE - radius - .15 &&
  p.z >= region.cz * SIZE + radius + .15 && p.z <= (region.cz + 1) * SIZE - radius - .15 && Math.hypot(p.x, p.z) > 46 + radius;
const validOwner = (generator, region) => generator?.surfaceY === 3500 && typeof generator.supportAt === 'function' &&
  typeof generator.floorSurface === 'function' && typeof generator.heightAt === 'function' && Number.isSafeInteger(region?.cx) && Number.isSafeInteger(region?.cz) &&
  region.id === `${region.cx},${region.cz}` && region.sim && Array.isArray(region.sim.agents) && Array.isArray(region.sim.surfacePatches) && Array.isArray(region.sim.benthicPatches);
const residents = region => [...region.sim.agents, ...(region.predatorAgents ?? []), ...(region.deepBenthicAgents ?? [])];
function depthValid(generator, speciesId, y) { const [low, high] = deepBenthicLifeSpeciesById[speciesId].depthSelectionM;
  const depth = generator.surfaceY - y; return depth >= low && depth <= high; }

// New assets use this projected forward/up/side frame. Original deep animals
// retain their independent yaw-only support convention and source geometry.
function basis(normal, heading) {
  if (!vector(normal) || !Number.isFinite(heading)) return null;
  const length = Math.hypot(normal.x, normal.y, normal.z); if (!(length > 0)) return null;
  const up = Object.fromEntries(['x', 'y', 'z'].map(k => [k, normal[k] / length]));
  const dot = Math.cos(heading) * up.x + Math.sin(heading) * up.z;
  const f = { x: Math.cos(heading) - up.x * dot, y: -up.y * dot, z: Math.sin(heading) - up.z * dot }, fl = Math.hypot(f.x, f.y, f.z);
  if (fl < 1e-8) return null;
  const forward = Object.fromEntries(['x', 'y', 'z'].map(k => [k, f[k] / fl]));
  return { up, forward, side: { x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z, z: forward.x * up.y - forward.y * up.x } };
}
const offset = (frame, x, y, z) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, frame.forward[k] * x + frame.up[k] * y + frame.side[k] * z]));
function bodyProbes(speciesId, sizeM, frame) {
  const trait = MODEL.traits[speciesId], radius = trait.radius * sizeM, height = trait.height * sizeM;
  const points = [{ x: 0, y: 0, z: 0, foot: true }];
  for (const fraction of [.5, 1]) for (let i = 0; i < 16; i++) {
    const angle = i * TAU / 16;
    points.push({ ...offset(frame, Math.cos(angle) * radius * fraction, 0, Math.sin(angle) * radius * fraction), foot: true });
  }
  for (const vertical of [.5, 1]) for (let i = 0; i < 16; i++) {
    const angle = i * TAU / 16;
    points.push({ ...offset(frame, Math.cos(angle) * radius, height * vertical, Math.sin(angle) * radius), foot: false });
  }
  return points;
}
function bodyClear(region, agent, position, radius, height) {
  return residents(region).every(other => {
    if (other.id === agent?.id || !other.alive || !vector(other.position)) return true;
    const trait = MODEL.traits[other.speciesId];
    // Conservative finite whole envelopes include the old fish tail, sea-pig
    // feet, sea-spider legs and expanded anemone. Old controllers are unchanged.
    const r = (trait?.radius ?? (other.speciesId === 'pom-pom-anemone' ? .272 : .65)) * (other.sizeM ?? .1);
    const h = (trait?.height ?? (other.speciesId === 'pom-pom-anemone' ? .361 : .6)) * (other.sizeM ?? .1);
    if (position.y + height + radius * .35 + .025 < other.position.y - r * .35 || position.y - radius * .35 > other.position.y + h + r * .35 + .025) return true;
    return Math.hypot(position.x - other.position.x, position.z - other.position.z) >= radius + height * .35 + r + h * .35 + .025;
  });
}
function survey(generator, region, speciesId, sizeM, heading, x, z, agent = null, occupancy = true) {
  const trait = MODEL.traits[speciesId]; if (!trait || !Number.isFinite(sizeM) || sizeM <= 0) return null;
  const radius = trait.radius * sizeM, height = trait.height * sizeM, center = generator.supportAt(x, z), frame = basis(center.normal, heading);
  const sample = generator.sample(x, z), bed = generator.floorSurface(x, z);
  if (!frame || frame.up.y < MODEL.minimumNormalY || center.substrate !== 'mud' || center.elementId !== null || !close(center.height, bed.height) || sample.substrate !== 'mud') return null;
  let rootY = center.height + MODEL.clearanceM, minimumFoot = Infinity, maximumFoot = -Infinity;
  for (const p of bodyProbes(speciesId, sizeM, frame)) {
    const px = x + p.x, pz = z + p.z, terrain = generator.heightAt(px, pz), support = generator.supportAt(px, pz);
    if (!Number.isFinite(terrain)) return null;
    if (p.foot) {
      if (support.substrate !== 'mud' || support.elementId !== null || !close(terrain, generator.floorSurface(px, pz).height)) return null;
      minimumFoot = Math.min(minimumFoot, terrain - p.y); maximumFoot = Math.max(maximumFoot, terrain - p.y);
    }
    rootY = Math.max(rootY, terrain - p.y + MODEL.clearanceM);
  }
  if (maximumFoot - minimumFoot > MODEL.maximumFootGapM || rootY - center.height > MODEL.maximumFootGapM + MODEL.clearanceM) return null;
  const position = { x, y: rootY, z };
  if (!owns(region, position, radius + height * .35) || !depthValid(generator, speciesId, position.y) ||
      occupancy && !bodyClear(region, agent, position, radius, height)) return null;
  return { position, supportNormal: frame.up, supportOffset: position.y - center.height };
}
function foodSites(generator, region, pool) {
  const patches = pool === 'surfaceDetritus' ? region.sim.surfacePatches : region.sim.benthicPatches, sites = [], random = randomFor(generator, region);
  for (const patch of patches) {
    if (!vector(patch.position) || !owns(region, patch.position, .2)) continue;
    for (let i = 0; i < 12; i++) for (const reach of [.02, .08, .16, .28, .44]) {
      const angle = (i / 12 + random(`site-phase:${patch.id}`)) * TAU;
      const x = patch.position.x + Math.cos(angle) * reach, z = patch.position.z + Math.sin(angle) * reach, siteId = `${patch.id}:${i}:${reach}`;
      sites.push({ siteId, patchId: patch.id, x, z, order: random(`order:${siteId}`) });
    }
  }
  return sites.sort((a, b) => a.order - b.order || a.siteId.localeCompare(b.siteId));
}
const patchFor = (region, agent) => (agent.nutritionPool === 'surfaceDetritus' ? region.sim.surfacePatches : region.sim.benthicPatches).find(p => p.id === agent.deepBenthicFoodPatchId);
export function deepBenthicLifeFeedingPosition(agent) {
  const trait = MODEL.traits[agent?.speciesId], frame = trait && basis(agent.supportNormal, agent.heading);
  if (!trait || !frame || !vector(agent.position)) return null;
  const p = offset(frame, trait.mouth.x * agent.sizeM, trait.mouth.y * agent.sizeM, trait.mouth.z * agent.sizeM);
  return Object.fromEntries(['x', 'y', 'z'].map(k => [k, agent.position[k] + p[k]]));
}
export const deepBenthicLifeFeedingReachM = agent => MODEL.traits[agent?.speciesId]?.reachM ?? 0;
function foodApproach(generator, region, speciesId, sizeM, position, patch, agent = null) {
  if (!patch || !vector(patch.position)) return null;
  const heading = Math.atan2(patch.position.z - position.z, patch.position.x - position.x), frame = basis(generator.supportAt(patch.position.x, patch.position.z).normal, heading);
  if (!frame) return null;
  const mouth = MODEL.traits[speciesId].mouth, p = offset(frame, mouth.x * sizeM, 0, mouth.z * sizeM);
  const support = survey(generator, region, speciesId, sizeM, heading, patch.position.x - p.x, patch.position.z - p.z, agent);
  return support ? { ...support, heading } : null;
}

export function createDeepBenthicLifePlan(generator, region, { availableSlots = 0, maxAdded = 4 } = {}) {
  const placements = [];
  if (!validOwner(generator, region)) return freeze({ version: 1, placements });
  const slots = Math.min(4, Math.max(0, Number.isFinite(availableSlots) ? Math.floor(availableSlots) : 0), Math.max(0, Number.isFinite(maxAdded) ? Math.floor(maxAdded) : 0));
  if (!slots) return freeze({ version: 1, placements });
  const random = randomFor(generator, region);
  for (const speciesId of DEEP_BENTHIC_LIFE_IDS) {
    if (placements.length >= slots || random(`${speciesId}:present`) > .86 || residents(region).some(a => a.speciesId === speciesId)) continue;
    const species = deepBenthicLifeSpeciesById[speciesId], [low, high] = species.sizeRangeM,
      sizeM = low + random(`${speciesId}:size`) * (high - low), heading = random(`${speciesId}:heading`) * TAU, trait = MODEL.traits[speciesId];
    const patches = trait.pool === 'surfaceDetritus' ? region.sim.surfacePatches : region.sim.benthicPatches;
    const sites = foodSites(generator, region, trait.pool).map(site => {
      const patch = patches.find(p => p.id === site.patchId), native = generator.supportAt(site.x, site.z);
      const mouth = deepBenthicLifeFeedingPosition({ speciesId, sizeM, heading, supportNormal: native.normal,
        position: { x: site.x, y: native.height + MODEL.clearanceM, z: site.z } });
      return { ...site, accessibleFood: Boolean(foodApproach(generator, region, speciesId, sizeM, { x: site.x, y: 0, z: site.z }, patch)),
        foodGap: mouth ? distance(mouth, patch.position) : Infinity };
    });
    // Prefer usable existing nutrition niches before occupied ones. This is
    // independent allocation, never a relocation of an original resident.
    sites.sort((a, b) => Number(b.accessibleFood) - Number(a.accessibleFood) || a.foodGap - b.foodGap || a.order - b.order || a.siteId.localeCompare(b.siteId));
    for (const site of sites) {
      const support = survey(generator, region, speciesId, sizeM, heading, site.x, site.z);
      if (!support || placements.some(p => Math.hypot(p.position.x - site.x, p.position.z - site.z) <
        (trait.radius + trait.height * .35) * sizeM + (MODEL.traits[p.speciesId].radius + MODEL.traits[p.speciesId].height * .35) * p.sizeM + .025)) continue;
      placements.push({ id: `deep-benthic:${region.id}:${speciesId}:${site.siteId}`, speciesId, siteId: site.siteId, foodPatchId: site.patchId,
        sizeM, heading, ...support, habitat: 'deep-native-soft-bottom', initialEnergy: .54 + random(`${speciesId}:energy`) * .1 });
      break;
    }
  }
  return freeze({ version: 1, placements });
}
export function initializeDeepBenthicLife(generator, region, { fresh = false, capacity = 20, maxAdded = 4 } = {}) {
  if (!fresh || !validOwner(generator, region) || region.sim.timeSec !== 0 || recordFields.some(k => Object.hasOwn(region, k)) || residents(region).some(a => isDeepBenthicLifeAgent(a) || markedAgent(a))) return false;
  const cap = Math.min(20, Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0), plan = createDeepBenthicLifePlan(generator, region, { availableSlots: cap - residents(region).length, maxAdded });
  region.deepBenthicLifeVersion = 1; region.deepBenthicLifeInitializedAtSec = 0;
  region.deepBenthicAgents = plan.placements.map(p => ({ id: p.id, speciesId: p.speciesId, taxonomicLevel: deepBenthicLifeSpeciesById[p.speciesId].taxonomicLevel,
    regionId: region.id, habitat: p.habitat, deepBenthicIndividualVersion: 1, deepBenthicSiteId: p.siteId, deepBenthicFoodPatchId: p.foodPatchId,
    position: clone(p.position), home: clone(p.position), target: clone(p.position), heading: p.heading, targetHeading: p.heading, pitch: 0,
    sizeM: p.sizeM, supportNormal: clone(p.supportNormal), supportOffset: p.supportOffset, velocity: { x: 0, y: 0, z: 0 },
    energy: p.initialEnergy, hunger: 1 - p.initialEnergy, alive: true, state: 'searching', stateSince: 0, timeSec: 0, createdAtSec: 0,
    nextBite: 0, nextDecision: 0, decisions: 0, feedingCount: 0, consumedUnits: 0, lastFeedAt: null, lastBenthicIntake: null,
    nutritionPool: MODEL.traits[p.speciesId].pool, foodScope: DEEP_BENTHIC_LIFE_FOOD_SCOPE,
    conditionScope: 'dimensionless condition index in a separate conserved ledger; not biomass or organic food stock' }));
  region.deepBenthicLife = { version: 1, birthPlacements: clone(plan.placements), addedIds: plan.placements.map(p => p.id),
    foodScope: DEEP_BENTHIC_LIFE_FOOD_SCOPE, scope: MODEL.note, lastTickSec: 0, counters: { ticks: 0, feedings: 0, consumedUnits: 0 }, events: [] };
  region.deepBenthicEnergyLedger = { initial: region.deepBenthicAgents.reduce((sum, a) => sum + a.energy, 0), feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0 };
  return true;
}
export function captureDeepBenthicLife(region) { return Object.hasOwn(region, 'deepBenthicLifeVersion') ? Object.fromEntries(recordFields.map(k => [k, clone(region[k])])) : {}; }
function supportFor(generator, region, agent, position, heading, occupancy = true) {
  if (!vector(position) || Math.hypot(position.x - agent.home.x, position.z - agent.home.z) > MODEL.traits[agent.speciesId].homeExtentM + 1e-8) return null;
  return survey(generator, region, agent.speciesId, agent.sizeM, heading, position.x, position.z, agent, occupancy);
}
export function deepBenthicLifePositionValid(generator, region, agent, position = agent.position, heading = agent.heading, { occupancy = false } = {}) {
  if (!validOwner(generator, region) || !isDeepBenthicLifeAgent(agent)) return false;
  const support = supportFor(generator, region, agent, position, heading, occupancy);
  return Boolean(support && close(position.y, support.position.y));
}
function setState(agent, state, clock) { if (agent.state !== state) { agent.state = state; agent.stateSince = clock; } }
function move(agent, region, generator, dt) {
  const previous = clone(agent.position), trait = MODEL.traits[agent.speciesId], dx = agent.target.x - previous.x, dz = agent.target.z - previous.z, horizontal = Math.hypot(dx, dz);
  const difference = Math.atan2(Math.sin(agent.targetHeading - agent.heading), Math.cos(agent.targetHeading - agent.heading));
  const heading = agent.heading + Math.max(-MODEL.turnRadiansPerSec * dt, Math.min(MODEL.turnRadiansPerSec * dt, difference));
  if (horizontal > 1e-8) for (const fraction of [1, .5, .25]) {
    const step = Math.min(horizontal, trait.speedMps * dt) * fraction;
    const point = { x: previous.x + dx / horizontal * step, y: previous.y, z: previous.z + dz / horizontal * step }, next = supportFor(generator, region, agent, point, heading);
    if (!next || distance(previous, next.position) > trait.speedMps * dt + 1e-10) continue;
    let clear = true, prior = previous, pathLength = 0;
    for (const f of [.25, .5, .75, 1]) {
      const p = { x: previous.x + (next.position.x - previous.x) * f, y: previous.y + (next.position.y - previous.y) * f, z: previous.z + (next.position.z - previous.z) * f };
      const support = supportFor(generator, region, agent, p, agent.heading + (heading - agent.heading) * f);
      if (!support || p.y < support.position.y - 1e-8 || distance(previous, support.position) > trait.speedMps * dt * f + 1e-10) { clear = false; break; }
      pathLength += distance(prior, support.position); prior = support.position;
    }
    if (!clear || pathLength > trait.speedMps * dt + 1e-10) continue;
    agent.position = next.position; agent.heading = heading; agent.supportNormal = next.supportNormal; agent.supportOffset = next.supportOffset; break;
  }
  if (distance(previous, agent.position) < 1e-12 && Math.abs(difference) > 1e-8) {
    const turn = supportFor(generator, region, agent, previous, heading);
    if (turn && close(previous.y, turn.position.y)) { agent.heading = heading; agent.supportNormal = turn.supportNormal; agent.supportOffset = turn.supportOffset; }
  }
  agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (agent.position[k] - previous[k]) / dt]));
  return distance(previous, agent.position);
}
/** Exactly one native 0.1s step owns movement, intake and condition. The
 * original organic ledger receives debits; its animal energy ledger does not. */
export function tickDeepBenthicLife(region, generator, dt) {
  if (!validOwner(generator, region) || region.deepBenthicLifeVersion !== 1 || !close(dt, STEP) ||
      region.sim.timeSec <= region.deepBenthicLife.lastTickSec + 1e-9 || !close(region.sim.timeSec - region.deepBenthicLife.lastTickSec, STEP)) return false;
  const clock = region.sim.timeSec, descriptor = region.deepBenthicLife, ledger = region.deepBenthicEnergyLedger, random = randomFor(generator, region);
  descriptor.lastTickSec = clock; descriptor.counters.ticks++;
  for (const agent of region.deepBenthicAgents) {
    if (!agent.alive) continue;
    const trait = MODEL.traits[agent.speciesId], patch = patchFor(region, agent);
    agent.timeSec = clock; agent.velocity = { x: 0, y: 0, z: 0 };
    if (clock >= agent.nextDecision) {
      const key = `${agent.id}:decision:${agent.decisions++}`; agent.nextDecision = clock + 4 + random(`${key}:time`) * 4;
      const approach = patch && patch[trait.pool] > 1e-12 && foodApproach(generator, region, agent.speciesId, agent.sizeM, agent.position, patch, agent);
      if (approach && Math.hypot(approach.position.x - agent.home.x, approach.position.z - agent.home.z) <= trait.homeExtentM + 1e-8) {
        agent.target = approach.position; agent.targetHeading = approach.heading;
      } else for (let attempt = 0; attempt < 6; attempt++) {
        const angle = random(`${key}:angle:${attempt}`) * TAU, reach = random(`${key}:reach:${attempt}`) * trait.homeExtentM;
        const p = { x: agent.home.x + Math.cos(angle) * reach, y: agent.home.y, z: agent.home.z + Math.sin(angle) * reach }, heading = Math.atan2(p.z - agent.position.z, p.x - agent.position.x), support = supportFor(generator, region, agent, p, heading);
        if (support) { agent.target = support.position; agent.targetHeading = heading; break; }
      }
    }
    const traveledM = move(agent, region, generator, dt);
    const debit = Math.min(agent.energy, dt * (MODEL.metabolismPerSec + (region.sim.environment.currentMps ?? 0) ** 2 * .00004) + traveledM * MODEL.motionDebitPerM);
    agent.energy -= debit; ledger.maintenanceAndMotionDebit += debit; agent.hunger = 1 - agent.energy;
    if (agent.energy <= 0) { agent.energy = 0; agent.alive = false; agent.velocity = { x: 0, y: 0, z: 0 }; setState(agent, 'dead', clock); continue; }
    setState(agent, traveledM > 1e-12 ? 'foraging' : distance(agent.position, agent.target) > 1e-8 ? 'blocked' : 'searching', clock);
    if (clock < agent.nextBite || !patch || !(patch[trait.pool] > 1e-12) || !deepBenthicLifePositionValid(generator, region, agent, agent.position, agent.heading, { occupancy: true })) continue;
    const feedingPosition = deepBenthicLifeFeedingPosition(agent), reach = deepBenthicLifeFeedingReachM(agent), gap = distance(feedingPosition, patch.position);
    if (gap > reach + 1e-10) continue;
    const stockBefore = patch[trait.pool], energyBefore = agent.energy, removedUnits = region.sim._remove(patch, trait.pool, MODEL.biteAmount, 'ingested');
    if (!(removedUnits > 0)) continue;
    const raw = energyBefore + removedUnits * MODEL.energyGainPerUnit; agent.energy = Math.min(1, raw);
    ledger.feedingGain += removedUnits * MODEL.energyGainPerUnit; ledger.clampCorrection += agent.energy - raw;
    agent.hunger = 1 - agent.energy; agent.lastFeedAt = clock; agent.nextBite = clock + MODEL.biteIntervalSec; agent.feedingCount++; agent.consumedUnits += removedUnits;
    descriptor.counters.feedings++; descriptor.counters.consumedUnits += removedUnits;
    agent.lastBenthicIntake = { timeSec: clock, patchId: patch.id, pool: trait.pool, stockBefore, stockAfter: patch[trait.pool], removedUnits,
      energyBefore, energyAfter: agent.energy, agentPosition: clone(agent.position), agentHeading: agent.heading,
      supportNormal: clone(agent.supportNormal), supportOffset: agent.supportOffset, feedingPosition, foodPosition: clone(patch.position),
      contactDistanceM: gap, allowedDistanceM: reach, unit: 'relative-organic-food-proxy-unit' };
    setState(agent, 'deep-benthic-feeding', clock);
    descriptor.events.push({ timeSec: clock, type: 'deep-benthic-feeding', label: `${deepBenthicLifeSpeciesById[agent.speciesId].commonName}摄食局部营养代理`,
      agentId: agent.id, cause: DEEP_BENTHIC_LIFE_FOOD_SCOPE, ...clone(agent.lastBenthicIntake) });
    if (descriptor.events.length > 40) descriptor.events.shift();
  }
  return true;
}
export function deepBenthicLifeEnergyBudgetError(region) {
  const l = region.deepBenthicEnergyLedger; if (!l) return 0;
  return (region.deepBenthicAgents ?? []).reduce((sum, a) => sum + a.energy, 0) - (l.initial + l.feedingGain - l.maintenanceAndMotionDebit + l.clampCorrection);
}
function validIntake(agent, region, clock, generator) {
  const a = agent.lastBenthicIntake;
  if (a === null) return agent.lastFeedAt === null && agent.feedingCount === 0 && agent.consumedUnits === 0;
  if (!a || !nonnegative(a.timeSec) || a.timeSec > clock || a.timeSec !== agent.lastFeedAt || a.patchId !== agent.deepBenthicFoodPatchId ||
      a.pool !== MODEL.traits[agent.speciesId].pool || !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(k => nonnegative(a[k])) ||
      a.removedUnits <= 0 || a.removedUnits > MODEL.biteAmount + 1e-10 || !close(a.stockBefore - a.stockAfter, a.removedUnits) ||
      a.energyBefore > 1 || a.energyAfter > 1 || !close(a.energyAfter, Math.min(1, a.energyBefore + a.removedUnits * MODEL.energyGainPerUnit)) ||
      !vector(a.agentPosition) || !Number.isFinite(a.agentHeading) || !vector(a.supportNormal) || !nonnegative(a.supportOffset) ||
      !vector(a.feedingPosition) || !vector(a.foodPosition) || !close(distance(a.feedingPosition, a.foodPosition), a.contactDistanceM) ||
      a.allowedDistanceM !== deepBenthicLifeFeedingReachM(agent) || a.contactDistanceM > a.allowedDistanceM + 1e-10 || a.unit !== 'relative-organic-food-proxy-unit' ||
      agent.feedingCount <= 0 || agent.consumedUnits < a.removedUnits - 1e-10) return false;
  const patch = patchFor(region, agent), historical = { ...agent, position: a.agentPosition, heading: a.agentHeading, supportNormal: a.supportNormal }, feeding = deepBenthicLifeFeedingPosition(historical), support = supportFor(generator, region, historical, a.agentPosition, a.agentHeading, false);
  return Boolean(patch && feeding && support && close(support.position.y, a.agentPosition.y) && close(support.supportOffset, a.supportOffset) &&
    ['x', 'y', 'z'].every(k => a.foodPosition[k] === patch.position[k] && close(a.feedingPosition[k], feeding[k]) && close(support.supportNormal[k], a.supportNormal[k])));
}
/** Absence is old history, never refill permission. Every partial reserved
 * marker, unsupported footprint or unbalanced condition record rejects. */
export function validateDeepBenthicLifeRecord(record, region, { generator, capacity = 20 } = {}) {
  if (Object.hasOwn(record?.state ?? {}, 'agents') && !Array.isArray(record.state.agents) || Object.hasOwn(record ?? {}, 'predatorAgents') && !Array.isArray(record.predatorAgents)) return false;
  const old = [...(record?.state?.agents ?? region?.sim?.agents ?? []), ...(record?.predatorAgents ?? [])];
  if (old.some(a => isDeepBenthicLifeAgent(a) || markedAgent(a))) return false;
  const marked = record && (recordFields.some(k => Object.hasOwn(record, k)) || Object.keys(record).some(k => k.startsWith('deepBenthic')));
  if (!marked) return true;
  if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || !validOwner(generator, region) || record.deepBenthicLifeVersion !== 1 ||
      record.deepBenthicLifeInitializedAtSec !== 0 || !Array.isArray(record.deepBenthicAgents) || record.deepBenthicAgents.length > 4 || old.length + record.deepBenthicAgents.length > capacity ||
      !recordFields.every(k => Object.hasOwn(record, k))) return false;
  const d = record.deepBenthicLife, clock = region.sim.timeSec, agents = record.deepBenthicAgents, ledger = record.deepBenthicEnergyLedger;
  if (!d || d.version !== 1 || d.foodScope !== DEEP_BENTHIC_LIFE_FOOD_SCOPE || d.scope !== MODEL.note ||
      !nonnegative(d.lastTickSec) || !close(d.lastTickSec, clock) || !Number.isSafeInteger(d.counters?.ticks) || d.counters.ticks < 0 || !close(d.counters.ticks * STEP, d.lastTickSec) ||
      !Number.isSafeInteger(d.counters?.feedings) || d.counters.feedings < 0 || !nonnegative(d.counters?.consumedUnits) || d.counters.consumedUnits > region.sim.ledger.ingested + 1e-8 ||
      d.counters.consumedUnits > d.counters.feedings * MODEL.biteAmount + 1e-8 || (d.counters.feedings === 0 ? d.counters.consumedUnits !== 0 : d.counters.consumedUnits <= 0) ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
      new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length || new Set(agents.map(a => a?.speciesId)).size !== agents.length ||
      !Array.isArray(d.events) || d.events.length > 40 || !['initial', 'feedingGain', 'maintenanceAndMotionDebit'].every(k => nonnegative(ledger?.[k])) ||
      !Number.isFinite(ledger.clampCorrection) || ledger.clampCorrection > 0 || !close(ledger.feedingGain, d.counters.consumedUnits * MODEL.energyGainPerUnit) ||
      !close(agents.reduce((sum, a) => sum + (a?.energy ?? NaN), 0), ledger.initial + ledger.feedingGain - ledger.maintenanceAndMotionDebit + ledger.clampCorrection)) return false;
  const ids = new Set(old.map(a => a.id)), validationRegion = { ...region, deepBenthicAgents: agents }, random = randomFor(generator, region);
  for (const agent of agents) {
    if (!isDeepBenthicLifeAgent(agent)) return false;
    const trait = MODEL.traits[agent.speciesId], species = deepBenthicLifeSpeciesById[agent.speciesId], birth = d.birthPlacements.find(p => p.id === agent.id), site = birth && foodSites(generator, region, trait.pool).find(p => p.siteId === birth.siteId);
    if (!site || !birth || ids.has(agent.id) || !d.addedIds.includes(agent.id) || agent.id !== `deep-benthic:${region.id}:${agent.speciesId}:${site.siteId}` ||
        random(`${agent.speciesId}:present`) > .86 || birth.speciesId !== agent.speciesId || birth.foodPatchId !== site.patchId || birth.position?.x !== site.x || birth.position?.z !== site.z ||
        agent.deepBenthicIndividualVersion !== 1 || agent.deepBenthicSiteId !== site.siteId || agent.deepBenthicFoodPatchId !== site.patchId ||
        agent.regionId !== region.id || agent.habitat !== 'deep-native-soft-bottom' || birth.habitat !== agent.habitat || agent.taxonomicLevel !== species.taxonomicLevel || !Number.isFinite(agent.sizeM) ||
        agent.sizeM !== species.sizeRangeM[0] + random(`${agent.speciesId}:size`) * (species.sizeRangeM[1] - species.sizeRangeM[0]) || agent.sizeM !== birth.sizeM ||
        birth.heading !== random(`${agent.speciesId}:heading`) * TAU || birth.initialEnergy !== .54 + random(`${agent.speciesId}:energy`) * .1 ||
        !['position', 'home', 'target', 'velocity', 'supportNormal'].every(k => vector(agent[k])) || !vector(birth.position) || !vector(birth.supportNormal) ||
        !['heading', 'targetHeading', 'supportOffset'].every(k => Number.isFinite(agent[k])) || agent.pitch !== 0 || !['x', 'y', 'z'].every(k => agent.home[k] === birth.position[k]) ||
        agent.createdAtSec !== 0 || typeof agent.alive !== 'boolean' || !['timeSec', 'stateSince', 'energy', 'hunger', 'nextBite', 'nextDecision', 'consumedUnits'].every(k => nonnegative(agent[k])) ||
        agent.timeSec > clock || agent.stateSince > agent.timeSec || agent.energy > 1 || !close(agent.hunger, 1 - agent.energy) ||
        !Number.isSafeInteger(agent.decisions) || agent.decisions < 0 || !Number.isSafeInteger(agent.feedingCount) || agent.feedingCount < 0 || agent.consumedUnits > agent.feedingCount * MODEL.biteAmount + 1e-8 ||
        Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) > trait.speedMps + 1e-8 ||
        !['foraging', 'searching', 'blocked', 'deep-benthic-feeding', 'dead'].includes(agent.state) ||
        (agent.alive ? agent.state === 'dead' || agent.energy <= 0 || !close(agent.timeSec, clock) : agent.state !== 'dead' || agent.energy !== 0 || Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) !== 0) ||
        agent.foodScope !== DEEP_BENTHIC_LIFE_FOOD_SCOPE || agent.nutritionPool !== trait.pool || agent.conditionScope !== 'dimensionless condition index in a separate conserved ledger; not biomass or organic food stock' ||
        !validIntake(agent, region, clock, generator)) return false;
    const born = survey(generator, validationRegion, agent.speciesId, agent.sizeM, birth.heading, site.x, site.z, agent, false),
      current = supportFor(generator, validationRegion, agent, agent.position, agent.heading, false), target = supportFor(generator, validationRegion, agent, agent.target, agent.targetHeading, false);
    if (!born || !current || !target || !close(birth.position.y, born.position.y) || !close(birth.supportOffset, born.supportOffset) ||
        !['x', 'y', 'z'].every(k => close(birth.supportNormal[k], born.supportNormal[k])) || !close(agent.position.y, current.position.y) ||
        !close(agent.supportOffset, current.supportOffset) || !close(agent.target.y, target.position.y) || !['x', 'y', 'z'].every(k => close(agent.supportNormal[k], current.supportNormal[k]))) return false;
    ids.add(agent.id);
  }
  if (!close(ledger.initial, d.birthPlacements.reduce((sum, p) => sum + p.initialEnergy, 0)) ||
      d.counters.feedings !== agents.reduce((sum, a) => sum + a.feedingCount, 0) || !close(d.counters.consumedUnits, agents.reduce((sum, a) => sum + a.consumedUnits, 0))) return false;
  return d.events.every(event => agents.some(a => a.id === event?.agentId) && event.type === 'deep-benthic-feeding' && nonnegative(event.timeSec) && event.timeSec <= clock && event.cause === DEEP_BENTHIC_LIFE_FOOD_SCOPE);
}
