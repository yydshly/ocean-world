import { KELP_SURFACE_Y, kelpStipePosition } from './kelpHabitat.js';
import { understoryWaterClearance } from './kelpUnderstory.js';

export const KELP_WATER_COMMUNITY_VERSION = 1;
export const KELP_WATER_MODEL = Object.freeze({ speedMps: .18, feedingDistanceM: .20,
  feedingAmount: .0008, feedingIntervalSec: 7, energyGain: 1.4, ownerMarginM: .6,
  avoidanceMarginM: .012, predictionSec: .4 });
const TAU = Math.PI * 2, SIZE = 64;
function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  result ^= result >>> 16; result = Math.imul(result, 0x7feb352d); result ^= result >>> 15;
  return (result >>> 0) / 4294967296;
}

export function kelpWaterElements(generator, cx, cz) {
  const elements = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    elements.push(...generator.chunk(cx + dx, cz + dz).elements.filter(item => item.kind === 'kelp'));
  }
  return elements;
}

/** Nine finite support probes and a conservative root/crown envelope. This is
 * a display controller, not swept fish-body or animated leaf collision. */
export function kelpWaterPositionValid(generator, point, sizeM, { cx, cz, elements, timeSec = 0, environment = {}, dynamicMarginM = 0,
  ownerMarginM = KELP_WATER_MODEL.ownerMarginM, elementContext, understoryPlants = [] } = {}) {
  if (!point || !['x', 'y', 'z'].every(axis => Number.isFinite(point[axis])) || !Number.isFinite(sizeM) || sizeM <= 0) return false;
  if (Math.floor(point.x / SIZE) !== cx || Math.floor(point.z / SIZE) !== cz ||
      point.x < cx * SIZE + ownerMarginM || point.x > (cx + 1) * SIZE - ownerMarginM ||
      point.z < cz * SIZE + ownerMarginM || point.z > (cz + 1) * SIZE - ownerMarginM || Math.hypot(point.x, point.z) <= 41) return false;
  const radius = sizeM * .5 + .12;
  if (point.y + sizeM * .22 > KELP_SURFACE_Y - .8) return false;
  for (let index = 0; index < 9; index++) {
    const angle = (index - 1) * TAU / 8, r = index ? radius : 0;
    const support = generator.heightAt(point.x + Math.cos(angle) * r, point.z + Math.sin(angle) * r);
    if (!Number.isFinite(support) || point.y < support + .8 + sizeM * .22) return false;
  }
  return kelpWaterDynamicClearance(point, sizeM, { elements: elements ?? kelpWaterElements(generator, cx, cz),
    timeSec, environment, elementContext, understoryPlants }) >= dynamicMarginM;
}

// Signed horizontal clearance to the four-frond reference and crown envelope.
// Historical poses can be temporarily negative; movement must improve them
// within its speed budget rather than snapping to an invented safe position.
export function kelpWaterDynamicClearance(point, sizeM, { elements, timeSec = 0, environment = {}, elementContext, understoryPlants = [] } = {}) {
  let clearance = understoryPlants.length ? understoryWaterClearance(point, sizeM, understoryPlants) : Infinity;
  const radius = sizeM * .5 + .12;
  for (const element of elements ?? []) {
    const local = elementContext?.(element), anchor = local?.anchor ?? element.anchor;
    if (!anchor || point.y < anchor.y - .2 || point.y > anchor.y + anchor.lengthM + .5) continue;
    const rootDistance = Math.hypot(point.x - anchor.x, point.z - anchor.z);
    // A neighbouring unloaded plant has no active geographic animation clock.
    // Its conservative root/crown envelope is used instead of borrowing the
    // swimmer's clock or inventing offscreen evolution.
    if (local?.conservative) { clearance = Math.min(clearance, rootDistance - 3.8 - radius); continue; }
    if (point.y > anchor.y + anchor.lengthM * .7) clearance = Math.min(clearance, rootDistance - 3.8 - radius);
    if (rootDistance > 3.8 + radius) continue;
    for (let frond = 0; frond < 4; frond++) {
      const fraction = Math.max(0, Math.min(1, (point.y - anchor.y) / (anchor.lengthM * [1, .982, .96, .94][frond])));
      const stipe = kelpStipePosition(anchor, fraction, local?.timeSec ?? timeSec, local?.environment ?? environment, frond);
      clearance = Math.min(clearance, Math.hypot(point.x - stipe.x, point.z - stipe.z) - sizeM * .5 - .045);
    }
  }
  return clearance;
}

/** Sparse plant-edge schools allocated from coordinate seed and actual hosts.
 * A school is 4–6 display animals; counts and patrols are not field density. */
export function createKelpWaterCommunityPlan(generator, chunk, { seed = generator.seed, hosts = [], timeSec = 0, environment = {}, capacity = 20 } = {}) {
  const random = salt => hash(`${typeof seed}:${seed}|kelp-water|${chunk.id}|${salt}`);
  const elements = kelpWaterElements(generator, chunk.cx, chunk.cz);
  const context = { cx: chunk.cx, cz: chunk.cz, elements, timeSec, environment,
    dynamicMarginM: KELP_WATER_MODEL.avoidanceMarginM };
  const candidates = hosts.filter(host => host.anchor && Number.isFinite(host.anchor.lengthM) &&
    chunk.elements.some(item => item.kind === 'kelp' && item.id === host.sceneryId) &&
    generator.sample(host.anchor.x, host.anchor.z).habitat === 'kelp-forest')
    .sort((a, b) => random(`host:${a.sceneryId}`) - random(`host:${b.sceneryId}`) || a.sceneryId.localeCompare(b.sceneryId));
  if (capacity < 4 || random('present') >= .67) return { version: 1, placements: [], eligible: candidates.length > 0 };
  const requested = Math.min(capacity, 4 + Math.floor(random('count') * 3));
  for (const host of candidates) {
    const phase = random(`phase:${host.sceneryId}`) * TAU;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = phase + attempt * TAU / 8;
      const home = { x: host.anchor.x + Math.cos(angle) * 3.6,
        y: host.anchor.y + host.anchor.lengthM * (host.preyFraction ?? .36),
        z: host.anchor.z + Math.sin(angle) * 3.6 };
      const orbitRadiusM = .6, schoolRadiusM = 1 + random(`radius:${host.sceneryId}`) * .2;
      // Finite patrol references include the outer formation extent. Every
      // actual next position is checked separately during simulation.
      const patrolValid = Array.from({ length: 16 }, (_, index) => {
        const a = phase + index * TAU / 16;
        return kelpWaterPositionValid(generator, { x: home.x + Math.cos(a) * (orbitRadiusM + schoolRadiusM),
          y: home.y, z: home.z + Math.sin(a) * (orbitRadiusM + schoolRadiusM) }, .3,
        context);
      }).every(Boolean);
      if (!patrolValid) continue;
      const groupId = `kelp-water-school:${chunk.id}:${host.sceneryId}`;
      const placements = Array.from({ length: requested }, (_, slot) => {
        const individualPhaseRad = slot * TAU / requested, id = `kelp-ocean:${chunk.id}:blue-rockfish:${host.sceneryId}:${slot}`;
        const sizeM = .28 + random(`size:${slot}`) * .06;
        const position = { x: home.x + Math.cos(phase) * orbitRadiusM + Math.cos(individualPhaseRad) * schoolRadiusM,
          y: home.y + Math.sin(individualPhaseRad) * .12,
          z: home.z + Math.sin(phase) * orbitRadiusM + Math.sin(individualPhaseRad) * schoolRadiusM };
        return { id, regionId: chunk.id, speciesId: 'blue-rockfish', groupId, schoolSlot: slot,
          schoolHome: { ...home }, preferredDepthM: KELP_SURFACE_Y - home.y, orbitRadiusM, schoolRadiusM,
          schoolPhaseRad: phase, individualPhaseRad, patrolPeriodSec: 100 + random('period') * 25,
          position, velocity: { x: 0, y: 0, z: 0 }, heading: phase + Math.PI * .5, sizeM,
          energy: .68 + random(`energy:${slot}`) * .14, state: 'schooling', alive: true,
          createdAtSec: timeSec, stateSince: timeSec, lastFeedAt: null,
          nextBite: timeSec + random(`bite:${slot}`) * 3, timeSec,
          habitat: 'kelp-edge-water-column', sourceHostId: host.id, sourceSceneryId: host.sceneryId };
      });
      if (placements.every(agent => kelpWaterPositionValid(generator, agent.position, agent.sizeM,
        context))) return { version: 1, eligible: true, placements };
    }
  }
  return { version: 1, eligible: candidates.length > 0, placements: [] };
}
