import { OCEAN_AUTHORED_RADIUS, OCEAN_CHUNK_SIZE, OCEAN_SURFACE_Y } from './oceanGeneration.js';
import { oceanRockHeight, OCEAN_ROCK_PROFILES } from './oceanRockShape.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';

export const OCEAN_PELAGIC_COMMUNITY_VERSION = 1;
const TAU = Math.PI * 2;
const SLOT_COUNT = 8;
const OWNER_MARGIN_M = 12;
const CLEARANCE_M = 2;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Sparse representative fusilier schools over actual reef structures. Counts,
 * depths and patrol radii are display-model allocations, not measured density.
 * Surface probes include coral tops; movement must still query its actual next
 * position because these finite probes do not certify every patrol point.
 * Animal records, camera state and display habitat labels are not inputs. */
export function createOceanPelagicCommunityPlan(generator, chunk, { random, surface }) {
  const bounds = chunk.bounds;
  const inBounds = (x, z, margin = .6) => Number.isFinite(x) && Number.isFinite(z) &&
    x >= bounds.minX + margin && x <= bounds.maxX - margin &&
    z >= bounds.minZ + margin && z <= bounds.maxZ - margin &&
    Math.hypot(x, z) > OCEAN_AUTHORED_RADIUS + 1;
  const hosts = chunk.elements.filter(element => ['rock', 'formation'].includes(element.kind) &&
    inBounds(element.x, element.z, OWNER_MARGIN_M) && typeof element.id === 'string' &&
    Math.floor(element.x / OCEAN_CHUNK_SIZE) === chunk.cx &&
    Math.floor(element.z / OCEAN_CHUNK_SIZE) === chunk.cz &&
    Number.isFinite(element.y) && Number.isFinite(element.rotation) &&
    (OCEAN_ROCK_PROFILES.includes(element.profile || 'mound') ||
      (generator.profile === LIVING_SHALLOWS_PROFILE && generator.rockProfiles?.includes(element.profile))) &&
    Object.values(element.scale || {}).length === 3 &&
    Object.values(element.scale).every(value => Number.isFinite(value) && value > 0)).toSorted(byId);
  const legalColumn = (x, z) => {
    if (!inBounds(x, z)) return null;
    const environment = generator.sample(x, z), top = surface(x, z, true);
    if (!Number.isFinite(environment.depthM) || environment.depthM < 12 || environment.depthM > 35 ||
      !Number.isFinite(top) || OCEAN_SURFACE_Y - top < 8) return null;
    return OCEAN_SURFACE_Y - top;
  };
  const ranked = hosts.map(host => ({ host, score: random(`pelagic:host:${host.id}`) }))
    .sort((a, b) => a.score - b.score || byId(a.host, b.host));
  let legalHosts = 0;
  const candidates = [];
  for (const { host } of ranked) {
    const hostEnvironment = generator.sample(host.x, host.z);
    const hostTop = oceanRockHeight(host, host.x, host.z), actualTop = surface(host.x, host.z, true);
    if (!Number.isFinite(hostEnvironment.floorY) || !Number.isFinite(hostTop) ||
      hostTop <= hostEnvironment.floorY + .06 || !Number.isFinite(actualTop) || actualTop < hostTop - .03) continue;
    const orbitRadiusM = 5 + random(`pelagic:orbit-radius:${host.id}`) * 3;
    const schoolRadiusM = .8 + random(`pelagic:school-radius:${host.id}`) * .55;
    const schoolPhaseRad = random(`pelagic:phase:${host.id}`) * TAU;
    const patrolRadius = orbitRadiusM + schoolRadiusM + .5;
    const patrol = [{ x: host.x, z: host.z }, ...Array.from({ length: 16 }, (_, index) => {
      const angle = schoolPhaseRad + index * TAU / 16;
      return { x: host.x + Math.cos(angle) * patrolRadius, z: host.z + Math.sin(angle) * patrolRadius };
    })];
    const columns = patrol.map(site => legalColumn(site.x, site.z));
    if (columns.some(value => value === null)) continue;
    const columnDepthM = Math.min(...columns);
    const depthM = Math.max(3.14, Math.min(15.86, columnDepthM - CLEARANCE_M - .2,
      columnDepthM * (.43 + random(`pelagic:depth:${host.id}`) * .17)));
    const schoolHome = Object.freeze({ x: host.x, z: host.z, depthM });
    const placements = Array.from({ length: SLOT_COUNT }, (_, schoolSlot) => {
      const angle = schoolPhaseRad + schoolSlot * TAU / SLOT_COUNT;
      return { speciesId: 'yellowtail-fusilier', siteId: `pelagic:${host.id}:fish:${schoolSlot}`,
        hostId: host.id, groupId: `pelagic-school:${host.id}`, habitat: 'pelagic-water-column',
        x: host.x + Math.cos(angle) * schoolRadiusM,
        z: host.z + Math.sin(angle) * schoolRadiusM,
        depthM: depthM + Math.sin(angle) * .14, schoolHome, orbitRadiusM,
        schoolPhaseRad, schoolSlot };
    });
    // Validate the whole fixed-slot cohort before taking its requested quota;
    // a failed slot cannot silently turn a school into scattered single fish.
    if (placements.some(site => {
      const column = legalColumn(site.x, site.z);
      return column === null || site.depthM < 3 || site.depthM > 16 || column - site.depthM < CLEARANCE_M;
    })) continue;
    legalHosts++;
    const count = 5 + Math.min(3, Math.floor(random(`pelagic:school-size:${host.id}`) * 4));
    candidates.push(placements.slice(0, count));
  }
  const selected = candidates.length > 0 && random('pelagic:present') < .6 ? candidates[0] : [];
  return Object.freeze({ version: OCEAN_PELAGIC_COMMUNITY_VERSION, eligible: legalHosts > 0,
    placements: Object.freeze(selected.map(Object.freeze)),
    niches: Object.freeze({ structureHosts: hosts.length, legalHosts,
      shoalCount: selected.length ? 1 : 0, fishCount: selected.length }) });
}
