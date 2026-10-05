import { oceanRockHeight } from './oceanRockShape.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';

const TAU = Math.PI * 2;
export const REEF_GUILD_SUPPORT_SPREAD_M = .025;
export const REEF_GUILD_SUPPORT_OFFSET_M = .004;
export const REEF_GUILD_SPECIES = Object.freeze(['day-octopus', 'spotted-reef-crab', 'tube-sponge']);
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const footprintPoints = (x, z, radius) => [{ x, z }, ...[.5, 1].flatMap(factor =>
  Array.from({ length: 8 }, (_, index) => ({ x: x + Math.cos(index * TAU / 8) * radius * factor,
    z: z + Math.sin(index * TAU / 8) * radius * factor })))];

/** The finite horizontal kit rests above the highest actual support probe.
 * This shared 17-point test is a conservative attachment/crawler envelope,
 * not a claim of deforming arms, flexible legs or a new geological crevice. */
export function reefGuildSupportHeight(surface, x, z, radius, { avoidCoral = false } = {}) {
  if (typeof surface !== 'function' || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) return null;
  const heights = [];
  for (const point of footprintPoints(x, z, radius)) {
    const height = surface(point.x, point.z);
    if (!Number.isFinite(height)) return null;
    if (avoidCoral) {
      const crown = surface(point.x, point.z, true);
      if (!Number.isFinite(crown) || crown > height + .01) return null;
    }
    heights.push(height);
  }
  const height = Math.max(...heights), spread = height - Math.min(...heights);
  return spread <= REEF_GUILD_SUPPORT_SPREAD_M + 1e-10 ? { height, spread } : null;
}

function transform(rock, angle, radius) {
  const lx = Math.cos(angle) * radius * rock.scale.x, lz = Math.sin(angle) * radius * rock.scale.z;
  const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
  return { x: rock.x + lx * c + lz * s, z: rock.z - lx * s + lz * c };
}
function plantOverlap(plant, x, z, radius) {
  if (!['coral', 'seagrass', 'algae'].includes(plant.kind)) return false;
  const c = Math.cos(plant.rotation ?? 0), s = Math.sin(plant.rotation ?? 0), dx = x - plant.x, dz = z - plant.z;
  const rx = plant.scale.x * .5 + radius + .04, rz = plant.scale.z * .5 + radius + .04;
  return ((dx * c - dz * s) / rx) ** 2 + ((dx * s + dz * c) / rz) ** 2 <= 1;
}

/** One real reef neighbourhood, chosen from saved homes and generated hosts.
 * It neither moves existing life nor consumes scenery RNG. Missing categories
 * are considered once by the caller; dead identities still occupy categories
 * and capacity. No suitable shared host means no new decorative substitutes. */
export function createReefGuildPlan(generator, region, { random, surface, bed, availableSlots = 0 } = {}) {
  const none = reason => ({ placements: [], eligible: false, completeGroup: false, summary: { reason, hostId: null } });
  if (generator?.profile !== LIVING_SHALLOWS_PROFILE) return none('different-scene-profile');
  if (typeof random !== 'function' || typeof surface !== 'function' || typeof bed !== 'function' ||
      !Number.isInteger(availableSlots) || availableSlots < 1 || !Number.isSafeInteger(region?.cx) || !Number.isSafeInteger(region?.cz)) return none('no-capacity-or-support');
  const agents = [...(region.agents ?? []), ...(region.turtleAgents ?? [])];
  const capacity = Math.min(availableSlots, Math.max(0, 20 - agents.length));
  if (capacity < 1) return none('no-capacity-or-support');
  const missing = REEF_GUILD_SPECIES.filter(id => !agents.some(agent => agent.speciesId === id));
  if (!missing.length) return none('categories-already-occupied');
  const chunk = generator.chunk(region.cx, region.cz), surroundings = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) surroundings.push(...generator.chunk(region.cx + dx, region.cz + dz).elements);
  const plants = surroundings.filter(element => ['coral', 'seagrass', 'algae'].includes(element.kind));
  const colonies = new Map(surroundings.filter(element => element.kind === 'coral').map(element => [element.id, element]));
  const neighbours = agents.filter(agent => agent.alive && ['green-chromis', 'honeycomb-grouper', 'lined-tang'].includes(agent.speciesId) && finitePoint(agent.home));
  const hostScore = rock => {
    let score = Infinity;
    for (const agent of neighbours) {
      const relatedHost = colonies.get(agent.refugeHostId)?.attachmentId ?? agent.refugeHostId;
      const distance = Math.hypot(agent.home.x - rock.x, agent.home.z - rock.z);
      score = Math.min(score, distance + (relatedHost === rock.id ? -100 : 0));
    }
    return score;
  };
  const rocks = chunk.elements.filter(element => element.kind === 'rock' &&
    generator.sample(element.x, element.z).depthM <= 22 && surroundings.some(colony => colony.kind === 'coral' && colony.attachmentId === element.id))
    .sort((a, b) => hostScore(a) - hostScore(b) || random(`reef-guild:host:${a.id}`) - random(`reef-guild:host:${b.id}`) || a.id.localeCompare(b.id));
  const dimensions = {
    'day-octopus': { sizeM: .5 + random('reef-guild:octopus:size') * .3, radiusFactor: .5 },
    'spotted-reef-crab': { sizeM: .12 + random('reef-guild:crab:size') * .08, radiusFactor: 1.1 },
    'tube-sponge': { sizeM: .3 + random('reef-guild:sponge:size') * .6, radiusFactor: .35 },
  };
  const bounds = chunk.bounds;
  const acceptedSite = (speciesId, rock, point, selected) => {
    const { sizeM, radiusFactor } = dimensions[speciesId], radius = sizeM * radiusFactor;
    if (point.x < bounds.minX + radius + .1 || point.x > bounds.maxX - radius - .1 ||
        point.z < bounds.minZ + radius + .1 || point.z > bounds.maxZ - radius - .1 ||
        generator.sample(point.x, point.z).depthM > 22) return null;
    if (plants.some(plant => (speciesId === 'tube-sponge' || plant.kind !== 'algae') && plantOverlap(plant, point.x, point.z, radius))) return null;
    if (selected.some(row => Math.hypot(row.x - point.x, row.z - point.z) < row.supportRadius + radius + .2)) return null;
    if (agents.some(agent => agent.alive && finitePoint(agent.position) && !['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'golden-sweep', 'reef-manta', 'green-turtle'].includes(agent.speciesId) &&
      Math.hypot(agent.position.x - point.x, agent.position.z - point.z) < radius + Math.max(.10, (agent.sizeM ?? .1) * .5))) return null;
    const center = surface(point.x, point.z), relief = center - bed(point.x, point.z);
    if (!Number.isFinite(center) || !Number.isFinite(relief)) return null;
    if (speciesId === 'tube-sponge') {
      const own = oceanRockHeight(rock, point.x, point.z);
      if (own === null || relief <= .06 || Math.abs(own - center) > .01) return null;
    } else if (relief > .45) return null;
    // Precheck the actual host triangle before expensive neighbouring-support
    // probes. Bare shoulder attachment never uses the colony's proxy crown.
    if (speciesId === 'tube-sponge') {
      const heights = footprintPoints(point.x, point.z, radius).map(p => oceanRockHeight(rock, p.x, p.z));
      if (heights.some(y => y === null) || Math.max(...heights) - Math.min(...heights) > REEF_GUILD_SUPPORT_SPREAD_M) return null;
    }
    const support = reefGuildSupportHeight(surface, point.x, point.z, radius, { avoidCoral: true });
    if (!support) return null;
    return { ...point, y: support.height + REEF_GUILD_SUPPORT_OFFSET_M, sizeM, supportRadius: radius, supportSpreadM: support.spread };
  };
  // Fixed finite candidate order uses existing reef shoulders and open feet.
  // Prefer a complete package on one host; preserve sparse/blocked regions.
  for (const rock of rocks.slice(0, 8)) {
    const selected = [], phase = random(`reef-guild:phase:${rock.id}`) * TAU;
    for (const speciesId of ['tube-sponge', 'day-octopus', 'spotted-reef-crab'].filter(id => missing.includes(id))) {
      const radii = speciesId === 'tube-sponge' ? [.14, .22, .30, .37, .42, .46] : [.45, .50, .56, .62, .68, .74];
      const candidates = radii.flatMap((radius, ring) => Array.from({ length: 24 }, (_, index) => ({
        ...transform(rock, phase + index * TAU / 24, radius), index: ring * 24 + index })));
      const anchor = selected[0] ?? neighbours.reduce((best, agent) => !best ||
        Math.hypot(agent.home.x - rock.x, agent.home.z - rock.z) < Math.hypot(best.x - rock.x, best.z - rock.z) ? agent.home : best, null);
      if (anchor) candidates.sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z) || a.index - b.index);
      let site = null;
      for (const point of candidates) {
        const valid = acceptedSite(speciesId, rock, point, selected);
        if (valid) { site = { ...valid, speciesId, hostId: rock.id, siteId: `${rock.id}:${speciesId}:${point.index}`,
          heading: random(`reef-guild:heading:${rock.id}:${speciesId}`) * TAU,
          habitat: speciesId === 'tube-sponge' ? 'reef-bare-shoulder' : 'reef-open-foot' }; break; }
      }
      if (site) selected.push(site);
    }
    if (selected.length !== missing.length) continue;
    const placements = selected.slice(0, capacity).map(Object.freeze);
    return { placements: Object.freeze(placements), eligible: true, completeGroup: placements.length === missing.length,
      summary: { hostId: rock.id, existingReefNeighbours: neighbours.length, missingCategories: missing.length,
        placedCategories: placements.length, supportMethod: 'center+two-eight-point-rings', trueCrevice: false } };
  }
  return none('no-common-physical-host');
}
