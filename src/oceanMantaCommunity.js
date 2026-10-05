import { OCEAN_AUTHORED_RADIUS, OCEAN_CHUNK_SIZE, OCEAN_SURFACE_Y } from './oceanGeneration.js';
import { oceanRockHeight, OCEAN_ROCK_PROFILES } from './oceanRockShape.js';

export const OCEAN_MANTA_COMMUNITY_VERSION = 1;
export const OCEAN_MANTA_MAX_DISC_WIDTH_M = 3.3;
export const OCEAN_MANTA_SUPPORT_CLEARANCE_M = 2.5;
export const OCEAN_MANTA_FOOTPRINT_RADIUS_M = OCEAN_MANTA_MAX_DISC_WIDTH_M / 2 + .45;
const TAU = Math.PI * 2;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** A sparse representative in reef-adjacent open water. Seeded allocation,
 * depth and local circular patrols are display-model rules, not measured manta
 * density or migration. Finite wing-sized probes reject unsuitable sites;
 * movement still needs its own clearance query and is not swept-body physics. */
export function createOceanMantaCommunityPlan(generator, chunk, { random, surface }) {
  const bounds = chunk.bounds;
  const inBounds = (x, z, margin = .6) => Number.isFinite(x) && Number.isFinite(z) &&
    x >= bounds.minX + margin && x <= bounds.maxX - margin &&
    z >= bounds.minZ + margin && z <= bounds.maxZ - margin &&
    Math.hypot(x, z) > OCEAN_AUTHORED_RADIUS + 1;
  const hosts = chunk.elements.filter(element => ['rock', 'formation'].includes(element.kind) &&
    inBounds(element.x, element.z, 10 + OCEAN_MANTA_FOOTPRINT_RADIUS_M + .6) &&
    typeof element.id === 'string' && Math.floor(element.x / OCEAN_CHUNK_SIZE) === chunk.cx &&
    Math.floor(element.z / OCEAN_CHUNK_SIZE) === chunk.cz &&
    Number.isFinite(element.y) && Number.isFinite(element.rotation) &&
    OCEAN_ROCK_PROFILES.includes(element.profile || 'mound') &&
    Object.values(element.scale || {}).length === 3 &&
    Object.values(element.scale).every(value => Number.isFinite(value) && value > 0)).toSorted(byId);
  const legalColumn = (x, z) => {
    if (!inBounds(x, z)) return null;
    const environment = generator.sample(x, z), top = surface(x, z, true);
    if (!Number.isFinite(environment.depthM) || environment.depthM < 12 || environment.depthM > 35 ||
      !Number.isFinite(top) || OCEAN_SURFACE_Y - top < 10) return null;
    return OCEAN_SURFACE_Y - top;
  };
  const ranked = hosts.map(host => ({ host, score: random(`manta:host:${host.id}`) }))
    .sort((a, b) => a.score - b.score || byId(a.host, b.host));
  const candidates = [];
  for (const { host } of ranked) {
    const hostEnvironment = generator.sample(host.x, host.z);
    const hostTop = oceanRockHeight(host, host.x, host.z), actualTop = surface(host.x, host.z, true);
    if (!Number.isFinite(hostEnvironment.floorY) || !Number.isFinite(hostTop) ||
      hostTop <= hostEnvironment.floorY + .06 || !Number.isFinite(actualTop) || actualTop < hostTop - .03) continue;
    const orbitRadiusM = 10 + random(`manta:orbit-radius:${host.id}`) * 4;
    const patrolPhaseRad = random(`manta:phase:${host.id}`) * TAU;
    // Every probe lies in the owner; radial footprint probes cover both wings
    // independently of future heading, with a conservative horizontal margin.
    const patrolCentres = [{ x: host.x, z: host.z }, ...Array.from({ length: 24 }, (_, index) => {
      const angle = patrolPhaseRad + index * TAU / 24;
      return { x: host.x + Math.cos(angle) * orbitRadiusM, z: host.z + Math.sin(angle) * orbitRadiusM };
    })];
    const probes = patrolCentres.flatMap(centre => [centre, ...Array.from({ length: 8 }, (_, index) => {
      const angle = index * TAU / 8;
      return { x: centre.x + Math.cos(angle) * OCEAN_MANTA_FOOTPRINT_RADIUS_M,
        z: centre.z + Math.sin(angle) * OCEAN_MANTA_FOOTPRINT_RADIUS_M };
    })]);
    const columns = probes.map(site => legalColumn(site.x, site.z));
    if (columns.some(value => value === null)) continue;
    const minimumColumnM = Math.min(...columns);
    const depthM = Math.max(3, Math.min(16, minimumColumnM - OCEAN_MANTA_SUPPORT_CLEARANCE_M - .3,
      minimumColumnM * (.42 + random(`manta:depth:${host.id}`) * .1)));
    if (minimumColumnM - depthM < OCEAN_MANTA_SUPPORT_CLEARANCE_M) continue;
    const patrolHome = Object.freeze({ x: host.x, z: host.z, depthM });
    candidates.push(Object.freeze({ speciesId: 'reef-manta', siteId: `manta:${host.id}:ray:0`,
      hostId: host.id, habitat: 'manta-water-column',
      x: host.x + Math.cos(patrolPhaseRad) * orbitRadiusM,
      z: host.z + Math.sin(patrolPhaseRad) * orbitRadiusM,
      depthM, patrolHome, orbitRadiusM, patrolPhaseRad }));
  }
  const selected = candidates.length > 0 && random('manta:present') < .22 ? [candidates[0]] : [];
  return Object.freeze({ version: OCEAN_MANTA_COMMUNITY_VERSION, eligible: candidates.length > 0,
    placements: Object.freeze(selected), niches: Object.freeze({ structureHosts: hosts.length,
      legalHosts: candidates.length, rayCount: selected.length }) });
}
