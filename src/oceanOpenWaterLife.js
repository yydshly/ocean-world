import { recordLivingIngestion } from './livingEcologyNetwork.js';
import { OCEAN_CHUNK_SIZE, OCEAN_SURFACE_Y } from './oceanGeneration.js';

export const OPEN_WATER_LIFE_VERSION = 1;
export const OPEN_WATER_LIFE_PROFILE = 'living-shallows-v1';
export const OPEN_WATER_LIFE_IDS = Object.freeze(['reef-squid', 'spotted-jelly']);
export const OPEN_WATER_PREY_SCOPE = 'unresolved small swimming animals prey stock; plankton support is a group food-web approximation; no visible prey kills or measured biomass';
const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const isOpenWaterLifeAgent = agent => OPEN_WATER_LIFE_IDS.includes(agent.speciesId);

/** Conservative envelopes include finite animated fin/bell/arm extents and
 * squid pitch up to .2rad. Position is squid root / jelly bell centre. */
export function openWaterLifeEnvelope(agent) {
  const jelly = agent.speciesId === 'spotted-jelly';
  return { radius: agent.sizeM * (jelly ? .7 : .6),
    down: agent.sizeM * (jelly ? 1.2 : .35), up: agent.sizeM * (jelly ? .55 : .35) };
}
export function openWaterLifeColumn(generator, region, agent, x, z, { surface }) {
  const envelope = openWaterLifeEnvelope(agent), bounds = generator.chunk(region.cx, region.cz).bounds;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < bounds.minX + envelope.radius + .2 || x > bounds.maxX - envelope.radius - .2 ||
      z < bounds.minZ + envelope.radius + .2 || z > bounds.maxZ - envelope.radius - .2) return null;
  let support = surface(x, z, true);
  for (let index = 0; index < 8; index++) support = Math.max(support,
    surface(x + Math.cos(index * TAU / 8) * envelope.radius, z + Math.sin(index * TAU / 8) * envelope.radius, true));
  const low = support + envelope.down + .18;
  const high = OCEAN_SURFACE_Y - .55 - envelope.up;
  return Number.isFinite(low) && low <= high ? { low, high } : null;
}
export function openWaterLifePositionValid(generator, region, agent, position, options) {
  if (!point(position)) return false;
  const column = openWaterLifeColumn(generator, region, agent, position.x, position.z, options);
  return !!column && position.y >= column.low - 1e-8 && position.y <= column.high + 1e-8;
}

/** Sparse coordinate-seeded open-water representatives. Whole owner capacity
 * includes historical deaths and turtles. No camera input, scenery respawn or
 * invented capture of a saved animal is used to populate these layers. */
export function initializeOpenWaterLife(region, generator, { random, surface, capacity = 20 }) {
  if (generator.profile !== OPEN_WATER_LIFE_PROFILE || region.openWaterLifeVersion !== undefined || !region.basicNetwork) return false;
  const chunk = generator.chunk(region.cx, region.cz), born = [], residents = region.agents.length + (region.turtleAgents?.length ?? 0);
  const reefHomes = region.agents.filter(a => a.alive && ['green-chromis', 'yellowtail-fusilier', 'honeycomb-grouper'].includes(a.speciesId) && point(a.home))
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const centre = { x: (region.cx + .5) * OCEAN_CHUNK_SIZE, z: (region.cz + .5) * OCEAN_CHUNK_SIZE };
  const anchor = reefHomes[0]?.home ?? centre;
  for (const speciesId of OPEN_WATER_LIFE_IDS) {
    if (residents + born.length >= capacity || region.agents.some(a => a.speciesId === speciesId)) continue;
    const present = random(`open-water:${speciesId}:present`) < (speciesId === 'reef-squid' ? .7 : .55);
    if (!present) continue;
    const sizeM = speciesId === 'reef-squid' ? .3 + random('open-water:squid:size') * .2 : .25 + random('open-water:jelly:size') * .2;
    const envelopeAgent = { speciesId, sizeM }, envelope = openWaterLifeEnvelope(envelopeAgent);
    const phase = random(`open-water:${speciesId}:phase`) * TAU;
    let position = null, site = null;
    for (let index = 0; index < 12; index++) {
      const angle = phase + index * TAU / 12, radius = 2 + index % 3 * 2;
      const x = clamp(anchor.x + Math.cos(angle) * radius, chunk.bounds.minX + envelope.radius + 2, chunk.bounds.maxX - envelope.radius - 2);
      const z = clamp(anchor.z + Math.sin(angle) * radius, chunk.bounds.minZ + envelope.radius + 2, chunk.bounds.maxZ - envelope.radius - 2);
      const sampled = generator.sample(x, z), column = openWaterLifeColumn(generator, region, envelopeAgent, x, z, { surface });
      if (!column || sampled.depthM < 8 || sampled.depthM > 30 || column.high - column.low < 2 ||
          (speciesId === 'reef-squid' && sampled.rockiness < .2)) continue;
      const y = clamp(OCEAN_SURFACE_Y - (speciesId === 'reef-squid' ? 3.5 + random('open-water:squid:depth') * 3 : 2 + random('open-water:jelly:depth') * 2), column.low + .5, column.high - .3);
      if (born.some(other => distance(other.position, { x, y, z }) < .8)) continue;
      position = { x, y, z }; site = index; break;
    }
    if (!position) continue;
    const id = `ocean:${region.id}:open-water:${speciesId}:site:${site}`;
    born.push({ id, regionId: region.id, speciesId, position, home: { ...position }, target: { ...position }, refuge: { ...position },
      velocity: { x: 0, y: 0, z: 0 }, heading: phase, pitch: 0, sizeM,
      state: speciesId === 'reef-squid' ? 'cruising' : 'drifting', stateSince: region.timeSec,
      energy: .70 + random(`${id}:energy`) * .1, alive: true, parasites: 0,
      lastFeedAt: null, nextBite: region.timeSec + random(`${id}:bite`) * 3,
      nextDecision: region.timeSec, decisions: 0, refugeHostId: null, groupId: null,
      habitat: 'open-water-representative', supportOffset: 0, fleeUntil: 0, openWaterLifeIndividualVersion: 1,
      pulsePhase: random(`${id}:pulse-phase`) * TAU, organicUnits: .004, organicDeathRecorded: false,
      ...(speciesId === 'reef-squid' ? { dietProxy: OPEN_WATER_PREY_SCOPE } :
        { symbiosisScope: 'photosymbiont production not simulated; plankton food debit only' }),
      movementScope: 'bounded owner-local water-column proxy; unloaded owners freeze; no long-range drift migration' });
  }
  region.agents.push(...born);
  const squidCount = born.filter(a => a.speciesId === 'reef-squid').length, initialPrey = .018 * squidCount;
  const input = born.reduce((sum, agent) => sum + agent.organicUnits, initialPrey);
  region.openWaterLifeVersion = 1; region.openWaterLifeInitializedAtSec = region.timeSec;
  region.openWaterLife = { version: 1, preyScope: OPEN_WATER_PREY_SCOPE, preyOrganicUnits: initialPrey,
    initialInputUnits: input, addedIds: born.map(a => a.id),
    counters: { proxyFeedings: 0, proxyConsumedUnits: 0, planktonFeedings: 0, planktonConsumedUnits: 0, preySupportedUnits: 0 } };
  region.basicNetwork.ledger.externalInput += input;
  region.basicNetwork.processTotals.externalInput += input;
  return true;
}

export function tickOpenWaterLifePool(region, dt) {
  if (region.openWaterLifeVersion !== 1) return;
  const count = region.agents.filter(a => a.alive && a.speciesId === 'reef-squid').length, pool = region.openWaterLife;
  const supported = Math.min(region.resources.plankton, count * .00004 * dt, Math.max(0, count * .026 - pool.preyOrganicUnits));
  region.resources.plankton -= supported; region.ledger.networkRemoved += supported;
  pool.preyOrganicUnits += supported; pool.counters.preySupportedUnits += supported;
}
export function consumeOpenWaterLifePrey(region, agent, amount) {
  const pool = region.openWaterLife, taken = Math.min(pool.preyOrganicUnits, amount);
  if (taken <= 1e-10) return 0;
  pool.preyOrganicUnits -= taken; recordLivingIngestion(region, agent, taken);
  pool.counters.proxyFeedings++; pool.counters.proxyConsumedUnits += taken;
  region.counters.feeding++; agent.energy = Math.min(1, agent.energy + taken * 8); agent.lastFeedAt = region.timeSec;
  return taken;
}

function moveInWater(region, generator, agent, dt, { surface, environment }) {
  const squid = agent.speciesId === 'reef-squid', clock = region.timeSec;
  const pulse = .5 + .5 * Math.sin(clock * (squid ? 3.5 : 2.2) + agent.pulsePhase);
  const speed = squid ? .09 + .17 * pulse ** 3 : .018 + .04 * pulse ** 3;
  const delta = { x: agent.target.x - agent.position.x, y: agent.target.y - agent.position.y, z: agent.target.z - agent.position.z };
  const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
  const current = environment.currentVector ?? { x: 0, z: 0 };
  const swim = Math.min(speed, length / dt);
  const displacement = { x: (squid ? delta.x / length * swim : 0) * dt + current.x * dt,
    y: (squid ? delta.y / length * swim : Math.sign(delta.y) * Math.min(speed, Math.abs(delta.y) / dt)) * dt,
    z: (squid ? delta.z / length * swim : 0) * dt + current.z * dt };
  const previous = agent.position;
  let next = null;
  for (const fraction of [1, .5, .25, .125]) {
    const candidate = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, previous[axis] + displacement[axis] * fraction]));
    const midpoint = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (previous[axis] + candidate[axis]) * .5]));
    if (openWaterLifePositionValid(generator, region, agent, candidate, { surface }) &&
      openWaterLifePositionValid(generator, region, agent, midpoint, { surface })) { next = candidate; break; }
  }
  if (!next) { agent.velocity = { x: 0, y: 0, z: 0 }; agent.nextDecision = 0; return; }
  agent.position = next;
  agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (next[axis] - previous[axis]) / dt]));
  if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-5) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  agent.pitch = squid ? clamp(Math.atan2(agent.velocity.y, Math.hypot(agent.velocity.x, agent.velocity.z)), -.2, .2) : 0;
}

export function tickOpenWaterLifeAgent(region, generator, agent, dt, { random, surface, environment, state, feedPlankton }) {
  const squid = agent.speciesId === 'reef-squid';
  if (region.timeSec >= agent.nextDecision) {
    const key = `${agent.id}:open-water:decision:${agent.decisions++}`;
    agent.nextDecision = region.timeSec + 5 + random(`${key}:time`) * 4;
    const angle = random(`${key}:angle`) * TAU, radius = 3 + random(`${key}:reach`) * 4;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = squid ? agent.home.x + Math.cos(angle + attempt * TAU / 6) * radius : agent.position.x;
      const z = squid ? agent.home.z + Math.sin(angle + attempt * TAU / 6) * radius : agent.position.z;
      const column = openWaterLifeColumn(generator, region, agent, x, z, { surface });
      if (!column) continue;
      agent.target = { x, y: clamp(agent.home.y + (random(`${key}:height:${attempt}`) - .5) * (squid ? 1.2 : .7), column.low + .05, column.high - .05), z }; break;
    }
  }
  moveInWater(region, generator, agent, dt, { surface, environment });
  state(agent, squid ? agent.lastFeedAt !== null && region.timeSec - agent.lastFeedAt < .8 ? 'prey-pool-feeding' : 'cruising' : 'drifting', region.timeSec);
  // Reef squid commonly forage near reefs at night. Low-light preference is
  // qualitative; a morning view keeps swimming without forced night meals.
  if (squid && environment.lightAtDepth < .15 && region.timeSec >= agent.nextBite) {
    agent.nextBite = region.timeSec + 5 + random(`${agent.id}:open-water:bite:${region.ticks}`) * 3;
    if (consumeOpenWaterLifePrey(region, agent, .0010) > 0) state(agent, 'prey-pool-feeding', region.timeSec);
    else state(agent, 'searching', region.timeSec);
  } else if (!squid) {
    const intake = feedPlankton(agent, .0003);
    if (intake > 0) { region.openWaterLife.counters.planktonFeedings++; region.openWaterLife.counters.planktonConsumedUnits += intake; }
    if (agent.lastFeedAt !== null && region.timeSec - agent.lastFeedAt < .8) state(agent, 'plankton-feeding', region.timeSec);
  }
}

export function validateOpenWaterLifeRecord(region, generator, { surface, capacity = 20 }) {
  const agents = region.agents.filter(isOpenWaterLifeAgent), pool = region.openWaterLife;
  if (generator.profile !== OPEN_WATER_LIFE_PROFILE || region.openWaterLifeVersion !== 1 || !nonnegative(region.openWaterLifeInitializedAtSec) ||
    region.openWaterLifeInitializedAtSec > region.timeSec || !pool || pool.version !== 1 || pool.preyScope !== OPEN_WATER_PREY_SCOPE ||
    !nonnegative(pool.preyOrganicUnits) || !nonnegative(pool.initialInputUnits) || !Array.isArray(pool.addedIds) ||
    new Set(pool.addedIds).size !== pool.addedIds.length || agents.length !== pool.addedIds.length ||
    new Set(agents.map(a => a.speciesId)).size !== agents.length || region.agents.length + (region.turtleAgents?.length ?? 0) > capacity ||
    !['proxyFeedings', 'proxyConsumedUnits', 'planktonFeedings', 'planktonConsumedUnits', 'preySupportedUnits'].every(key => nonnegative(pool.counters?.[key]))) return false;
  return agents.every(agent => {
    const min = agent.speciesId === 'reef-squid' ? .3 : .25, max = agent.speciesId === 'reef-squid' ? .5 : .45;
    return agent.openWaterLifeIndividualVersion === 1 && agent.regionId === region.id && pool.addedIds.includes(agent.id) &&
      agent.id.startsWith(`ocean:${region.id}:open-water:${agent.speciesId}:site:`) &&
      agent.sizeM >= min && agent.sizeM <= max && agent.habitat === 'open-water-representative' &&
      [agent.position, agent.home, agent.target, agent.refuge, agent.velocity].every(point) &&
      Number.isFinite(agent.heading) && Number.isFinite(agent.pitch) && Math.abs(agent.pitch) <= .2 &&
      Number.isFinite(agent.pulsePhase) && nonnegative(agent.nextBite) && nonnegative(agent.nextDecision) &&
      Number.isInteger(agent.decisions) && agent.decisions >= 0 &&
      openWaterLifePositionValid(generator, region, agent, agent.position, { surface }) &&
      openWaterLifePositionValid(generator, region, agent, agent.home, { surface }) &&
      (agent.speciesId === 'reef-squid' ? agent.dietProxy === OPEN_WATER_PREY_SCOPE :
        agent.symbiosisScope === 'photosymbiont production not simulated; plankton food debit only');
  });
}
