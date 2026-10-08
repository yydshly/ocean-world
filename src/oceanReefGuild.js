import { createReefGuildPlan, reefGuildSupportHeight } from './reefGuildHabitat.js';
import { recordLivingIngestion } from './livingEcologyNetwork.js';
import { oceanRockHeight } from './oceanRockShape.js';

export const OCEAN_REEF_GUILD_VERSION = 1;
export const OCEAN_REEF_GUILD_PROFILE = 'living-shallows-v1';
export const OCEAN_REEF_GUILD_IDS = Object.freeze(['day-octopus', 'spotted-reef-crab', 'tube-sponge']);
export const REEF_GUILD_PREY_SCOPE = 'relative unresolved small benthic animals and animal-remains food pool; detrital support is a group food-web approximation; no rendered prey kills or measured biomass';
const TAU = Math.PI * 2;
const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const isReefGuildAgent = agent => OCEAN_REEF_GUILD_IDS.includes(agent.speciesId);
export function reefGuildFootRadius(agent) {
  return agent.sizeM * (agent.speciesId === 'day-octopus' ? .5 : agent.speciesId === 'spotted-reef-crab' ? 1.1 : .35);
}
function crawlerSupport(surface, x, z, radius) {
  return reefGuildSupportHeight(surface, x, z, radius, { avoidCoral: true });
}

/** Append-only model admission, never population replacement. The supplied
 * shared-host plan consumes only remaining slots, including historical deaths.
 * Storage commits this whole record before any added individual is displayed. */
export function initializeReefGuild(region, generator, { random, surface, bed, capacity = 20 }) {
  if (generator.profile !== OCEAN_REEF_GUILD_PROFILE || region.reefGuildVersion !== undefined || !region.basicNetwork) return false;
  const residentCount = region.agents.length + (region.turtleAgents?.length ?? 0);
  const plan = createReefGuildPlan(generator, region, { random, surface, bed, availableSlots: Math.max(0, capacity - residentCount) });
  const born = [];
  for (const placement of plan.placements) {
    if (residentCount + born.length >= capacity) break;
    const id = `ocean:${region.id}:reef-guild:${placement.speciesId}:${placement.siteId}`;
    if (region.agents.some(agent => agent.id === id || agent.speciesId === placement.speciesId)) continue;
    const radius = reefGuildFootRadius(placement);
    const support = crawlerSupport(surface, placement.x, placement.z, radius);
    if (!support) continue;
    const position = { x: placement.x, y: support.height + .004, z: placement.z };
    const anchored = placement.speciesId === 'tube-sponge';
    born.push({ id, regionId: region.id, speciesId: placement.speciesId,
      position, home: { ...position }, target: { ...position }, refuge: { ...position }, velocity: { x: 0, y: 0, z: 0 },
      heading: placement.heading ?? random(`${id}:heading`) * TAU, sizeM: placement.sizeM,
      state: anchored ? 'filtering' : 'foraging', stateSince: region.timeSec,
      energy: .68 + random(`${id}:energy`) * .1, alive: true, parasites: 0,
      lastFeedAt: null, nextBite: region.timeSec + random(`${id}:bite`) * 3,
      nextDecision: region.timeSec, decisions: 0, fleeUntil: 0,
      habitat: placement.habitat, groupId: null, supportOffset: .004,
      refugeHostId: placement.hostId, guildHostId: placement.hostId, reefGuildIndividualVersion: 1,
      organicUnits: .004, organicDeathRecorded: false,
      ...(anchored ? { attached: true } : { dietProxy: REEF_GUILD_PREY_SCOPE,
        activityScope: 'qualitative day/night light preference; not a calibrated field activity threshold' }) });
  }
  region.agents.push(...born);
  const consumers = born.filter(agent => agent.speciesId !== 'tube-sponge').length;
  const initialPrey = consumers * .012;
  const initialInput = born.reduce((n, agent) => n + agent.organicUnits, initialPrey);
  region.reefGuildVersion = OCEAN_REEF_GUILD_VERSION;
  region.reefGuildInitializedAtSec = region.timeSec;
  region.reefGuild = { version: 1, preyScope: REEF_GUILD_PREY_SCOPE, preyOrganicUnits: initialPrey,
    preySupportScope: 'organic detrital support to unresolved benthic food group; not direct detritus feeding by octopus or crab',
    initialInputUnits: initialInput, addedIds: born.map(agent => agent.id),
    counters: { proxyFeedings: 0, filterFeedings: 0, proxyConsumedUnits: 0, filterConsumedUnits: 0, preySupportedUnits: 0 } };
  // Explicit external admission is the only permitted inventory augmentation.
  // The old food ledger/resources and every old individual remain exact.
  region.basicNetwork.ledger.externalInput += initialInput;
  region.basicNetwork.processTotals.externalInput += initialInput;
  return true;
}

/** Pool support approximates unresolved small benthic animals using detrital
 * organic food. It does not spawn visible animals, reproduce guild members or
 * assert a field-calibrated density. Every transfer uses the network units. */
export function tickReefGuildPool(region, dt, { extraConsumers = 0, maxExtraConsumers = 2 } = {}) {
  if (region.reefGuildVersion !== 1) return;
  const pool = region.reefGuild;
  // New, independently admitted reef residents may share this unresolved
  // animal-food field. Its support is still an actual transfer from detritus;
  // the default leaves every original owner and food equation unchanged.
  const extraLimit = maxExtraConsumers === 4 ? 4 : 2;
  const added = Number.isSafeInteger(extraConsumers) ? Math.max(0, Math.min(extraLimit, extraConsumers)) : 0;
  const consumers = region.agents.filter(agent => isReefGuildAgent(agent) && agent.speciesId !== 'tube-sponge' && agent.alive).length + added;
  const transferred = Math.min(region.resources.detritus, consumers * .000025 * dt,
    Math.max(0, consumers * .018 - pool.preyOrganicUnits));
  region.resources.detritus -= transferred;
  region.ledger.networkRemoved += transferred;
  pool.preyOrganicUnits += transferred;
  pool.counters.preySupportedUnits += transferred;
}

export function consumeReefGuildPrey(region, agent, amount) {
  const pool = region.reefGuild;
  const taken = Math.min(pool.preyOrganicUnits, amount);
  if (taken <= 1e-10) return 0;
  pool.preyOrganicUnits -= taken;
  recordLivingIngestion(region, agent, taken);
  agent.energy = Math.min(1, agent.energy + taken * 8);
  agent.lastFeedAt = region.timeSec;
  region.counters.feeding++;
  pool.counters.proxyFeedings++;
  pool.counters.proxyConsumedUnits += taken;
  return taken;
}

/** A conservative crawler checks its full planar body envelope at the target
 * and the midpoint. Shortening XYZ together obeys speed on slopes; a steep
 * ledge causes a new local decision rather than snapping through its surface. */
function moveCrawler(region, generator, agent, dt, { surface }) {
  const speed = agent.speciesId === 'day-octopus' ? .025 : .008;
  const budget = speed * dt;
  const previous = agent.position;
  const delta = { x: agent.target.x - previous.x, y: agent.target.y - previous.y, z: agent.target.z - previous.z };
  const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
  const step = Math.min(budget, length), radius = reefGuildFootRadius(agent);
  const bounds = generator.chunk(region.cx, region.cz).bounds;
  let next = null;
  for (const fraction of [1, .5, .25, .125]) {
    const x = previous.x + delta.x / length * step * fraction;
    const z = previous.z + delta.z / length * step * fraction;
    if (x < bounds.minX + radius + .1 || x > bounds.maxX - radius - .1 ||
      z < bounds.minZ + radius + .1 || z > bounds.maxZ - radius - .1) continue;
    const support = crawlerSupport(surface, x, z, radius);
    const midway = crawlerSupport(surface, (previous.x + x) * .5, (previous.z + z) * .5, radius);
    if (!support || !midway) continue;
    const candidate = { x, y: support.height + agent.supportOffset, z };
    if (distance(previous, candidate) > budget + 1e-12 || (previous.y + candidate.y) * .5 < midway.height + agent.supportOffset - 1e-8) continue;
    next = candidate; break;
  }
  if (!next) { agent.velocity = { x: 0, y: 0, z: 0 }; agent.nextDecision = 0; return; }
  agent.position = next;
  agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (next[axis] - previous[axis]) / dt]));
  if (Math.hypot(agent.velocity.x, agent.velocity.z) > .00001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
}

export function tickReefGuildAgent(region, generator, agent, dt, { random, surface, feedPlankton, state, environment }) {
  if (agent.speciesId === 'tube-sponge') {
    agent.velocity = { x: 0, y: 0, z: 0 };
    state(agent, region.resources.plankton > 1e-7 ? 'filtering' : 'resting', region.timeSec);
    const intake = feedPlankton(agent, .00025);
    if (intake > 0) { region.reefGuild.counters.filterFeedings++; region.reefGuild.counters.filterConsumedUnits += intake; }
    return;
  }
  // Octopus cyanea is principally day active; the spotted reef crab is
  // principally nocturnal. These light cutoffs express qualitative preference
  // only. Default morning observation must not manufacture nocturnal activity.
  const active = agent.speciesId === 'day-octopus' ? environment.lightAtDepth >= .05 : environment.lightAtDepth < .15;
  if (!active) { agent.velocity = { x: 0, y: 0, z: 0 }; state(agent, 'resting', region.timeSec); return; }
  if (region.timeSec >= agent.nextDecision) {
    const key = `${agent.id}:guild-decision:${agent.decisions++}`;
    agent.nextDecision = region.timeSec + 7 + random(`${key}:time`) * 6;
    const extent = agent.speciesId === 'day-octopus' ? 1.8 : .7;
    const radius = reefGuildFootRadius(agent), bounds = generator.chunk(region.cx, region.cz).bounds;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = random(`${key}:angle:${attempt}`) * TAU, reach = random(`${key}:reach:${attempt}`) * extent;
      const x = clamp(agent.home.x + Math.cos(angle) * reach, bounds.minX + radius + .1, bounds.maxX - radius - .1);
      const z = clamp(agent.home.z + Math.sin(angle) * reach, bounds.minZ + radius + .1, bounds.maxZ - radius - .1);
      const support = crawlerSupport(surface, x, z, radius);
      if (support) { agent.target = { x, y: support.height + agent.supportOffset, z }; break; }
    }
  }
  moveCrawler(region, generator, agent, dt, { surface });
  const available = region.reefGuild.preyOrganicUnits > 1e-7;
  state(agent, available ? agent.lastFeedAt !== null && region.timeSec - agent.lastFeedAt < .7 ? 'prey-pool-feeding' : 'foraging' : 'searching', region.timeSec);
  if (available && region.timeSec >= agent.nextBite) {
    agent.nextBite = region.timeSec + 5 + random(`${agent.id}:guild-bite:${region.ticks}`) * 3;
    if (consumeReefGuildPrey(region, agent, agent.speciesId === 'day-octopus' ? .0006 : .0002) > 0)
      state(agent, 'prey-pool-feeding', region.timeSec);
  }
}

export function validateReefGuildRecord(region, generator, { surface, capacity = 20 }) {
  const agents = region.agents.filter(isReefGuildAgent), g = region.reefGuild;
  if (generator.profile !== OCEAN_REEF_GUILD_PROFILE || region.reefGuildVersion !== 1 ||
    !nonnegative(region.reefGuildInitializedAtSec) || region.reefGuildInitializedAtSec > region.timeSec ||
    !g || g.version !== 1 || g.preyScope !== REEF_GUILD_PREY_SCOPE || !nonnegative(g.preyOrganicUnits) || !nonnegative(g.initialInputUnits) ||
    !Array.isArray(g.addedIds) || new Set(g.addedIds).size !== g.addedIds.length ||
    !['proxyFeedings', 'filterFeedings', 'proxyConsumedUnits', 'filterConsumedUnits', 'preySupportedUnits'].every(key => nonnegative(g.counters?.[key])) ||
    region.agents.length + (region.turtleAgents?.length ?? 0) > capacity || agents.length !== g.addedIds.length ||
    new Set(agents.map(agent => agent.speciesId)).size !== agents.length) return false;
  const bounds = generator.chunk(region.cx, region.cz).bounds;
  return agents.every(agent => {
    const radius = reefGuildFootRadius(agent), support = crawlerSupport(surface, agent.position.x, agent.position.z, radius);
    const host = generator.chunk(region.cx, region.cz).elements.find(element => element.id === agent.guildHostId && element.kind === 'rock');
    const sizeRange = agent.speciesId === 'day-octopus' ? [.5, .8] : agent.speciesId === 'spotted-reef-crab' ? [.12, .2] : [.3, .9];
    return agent.reefGuildIndividualVersion === 1 && g.addedIds.includes(agent.id) &&
      agent.id.startsWith(`ocean:${region.id}:reef-guild:${agent.speciesId}:`) && agent.regionId === region.id &&
      agent.sizeM >= sizeRange[0] && agent.sizeM <= sizeRange[1] && agent.supportOffset === .004 &&
      Number.isFinite(agent.heading) && nonnegative(agent.nextBite) && nonnegative(agent.nextDecision) && Number.isInteger(agent.decisions) && agent.decisions >= 0 && host &&
      [agent.position, agent.home, agent.refuge, agent.target, agent.velocity].every(point) &&
      support && Math.abs(agent.position.y - support.height - agent.supportOffset) < 1e-7 &&
      agent.position.x >= bounds.minX + radius + .1 && agent.position.x <= bounds.maxX - radius - .1 &&
      agent.position.z >= bounds.minZ + radius + .1 && agent.position.z <= bounds.maxZ - radius - .1 &&
      (agent.speciesId === 'tube-sponge' ? agent.attached === true &&
        oceanRockHeight(host, agent.position.x, agent.position.z) !== null &&
        Math.abs(surface(agent.position.x, agent.position.z) - oceanRockHeight(host, agent.position.x, agent.position.z)) < .01 &&
        distance(agent.position, agent.home) < 1e-10 && distance(agent.position, agent.target) < 1e-10 :
        agent.dietProxy === REEF_GUILD_PREY_SCOPE && Math.hypot(agent.position.x - agent.home.x, agent.position.z - agent.home.z) <=
        (agent.speciesId === 'day-octopus' ? 1.8 : .7) + 1e-8);
  });
}
