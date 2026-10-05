import { OCEAN_AUTHORED_RADIUS, OCEAN_CHUNK_SIZE } from './oceanGeneration.js';
import { oceanRockHeight } from './oceanRockShape.js';

export const OCEAN_SLOPE_COMMUNITY_VERSION = 1;
const TAU = Math.PI * 2;
const probes = Object.freeze([[0, 0], [.18, 0], [-.18, 0], [0, .18], [0, -.18],
  [.27, .12], [-.27, -.12], [.12, -.27], [-.12, .27]].map(Object.freeze));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** A small illustrative occupancy of actual outer-slope formations. Depth
 * limits refer to the sampled bottom, not a fish's eventual water-column Y.
 * Existing animal state, display labels and observer coordinates are not inputs.
 * Birth Y, persistence and one-time missing-category upgrades belong to ecology. */
export function createOceanSlopeCommunityPlan(generator, chunk, { random, surface }) {
  const bounds = chunk.bounds;
  const hosts = chunk.elements.filter(element => element.kind === 'formation' &&
    Number.isFinite(element.x) && Number.isFinite(element.z) && Number.isFinite(element.rotation) &&
    Object.values(element.scale || {}).length === 3 && Object.values(element.scale).every(value => Number.isFinite(value) && value > 0) &&
    Math.floor(element.x / OCEAN_CHUNK_SIZE) === chunk.cx && Math.floor(element.z / OCEAN_CHUNK_SIZE) === chunk.cz).toSorted(byId);
  const vegetation = chunk.elements.filter(element => element.kind === 'seagrass');
  const inBounds = (x, z) => x >= bounds.minX + .6 && x <= bounds.maxX - .6 &&
    z >= bounds.minZ + .6 && z <= bounds.maxZ - .6 && Math.hypot(x, z) > OCEAN_AUTHORED_RADIUS + 1;
  const legalSite = (host, x, z) => {
    if (!inBounds(x, z)) return false;
    const environment = generator.sample(x, z), own = oceanRockHeight(host, x, z);
    if (!Number.isFinite(environment.depthM) || environment.depthM < 22 || environment.depthM > 35 || own === null) return false;
    const support = surface(x, z);
    if (!Number.isFinite(support) || Math.abs(own - support) > .03 || support - environment.floorY <= .06 ||
      surface(x, z, true) > support + .02) return false;
    return !vegetation.some(element => Math.hypot(x - element.x, z - element.z) <
      Math.hypot(element.scale.x, element.scale.z) * .5);
  };
  const localPoint = (host, x, z) => {
    const cos = Math.cos(host.rotation), sin = Math.sin(host.rotation);
    return { x: host.x + x * host.scale.x * cos + z * host.scale.z * sin,
      z: host.z - x * host.scale.x * sin + z * host.scale.z * cos };
  };
  const legalHosts = hosts.map(host => ({ host, score: random(`slope:host:${host.id}`), sites: probes.flatMap(([x, z], index) => {
    const site = localPoint(host, x, z);
    return legalSite(host, site.x, site.z) ? [{ ...site, id: `${host.id}:probe:${index}`, index }] : [];
  }) })).filter(entry => entry.sites.length).sort((a, b) => a.score - b.score || byId(a.host, b.host));
  const placements = [];
  let fishCount = 0, shoalCount = 0;
  for (const { host, sites } of legalHosts) {
    if (shoalCount >= 2 || 10 - fishCount < 4) break;
    const ranked = sites.toSorted((a, b) => random(`slope:anchor:${a.id}`) - random(`slope:anchor:${b.id}`) || byId(a, b));
    let candidates = [];
    for (const anchor of ranked) {
      const phase = random(`slope:phase:${host.id}`) * TAU;
      const radius = .44 + random(`slope:radius:${host.id}`) * .22;
      const proposed = Array.from({ length: 6 }, (_, slot) => {
        // Fixed six slots preserve host/slot coordinates when quotas vary.
        const angle = phase + slot * TAU / 6;
        return { siteId: `slope:${host.id}:fish:${slot}`, hostId: host.id,
          groupId: `slope-school:${host.id}`, speciesId: 'lyretail-anthias',
          x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius,
          habitat: 'slope-water-column' };
      }).filter(site => legalSite(host, site.x, site.z));
      if (proposed.length >= 4) { candidates = proposed; break; }
    }
    if (candidates.length < 4) continue;
    const requested = 4 + Math.floor(random(`slope:school-size:${host.id}`) * 3);
    const count = Math.min(requested, candidates.length, 10 - fishCount);
    placements.push(...candidates.slice(0, count)); fishCount += count; shoalCount++;
  }
  let starCount = 0;
  const starQuota = legalHosts.length ? 1 + (legalHosts.length > 1 && random('slope:star-count') > .35 ? 1 : 0) : 0;
  for (const { host, sites } of legalHosts) {
    if (starCount >= starQuota) break;
    const ranked = sites.toSorted((a, b) => random(`slope:star:${a.id}`) - random(`slope:star:${b.id}`) || byId(a, b));
    const site = ranked.find(candidate => placements.filter(placement => placement.speciesId === 'blue-starfish').every(other =>
      Math.hypot(other.x - candidate.x, other.z - candidate.z) >= .4));
    if (!site) continue;
    placements.push({ siteId: `slope:${host.id}:star:${site.index}`, hostId: host.id, groupId: null,
      speciesId: 'blue-starfish', x: site.x, z: site.z, habitat: 'slope-hard-surface' });
    starCount++;
  }
  return Object.freeze({ version: OCEAN_SLOPE_COMMUNITY_VERSION, eligible: legalHosts.length > 0,
    placements: Object.freeze(placements.map(Object.freeze)), niches: Object.freeze({ formationHosts: hosts.length,
      legalHosts: legalHosts.length, hardSites: legalHosts.reduce((sum, entry) => sum + entry.sites.length, 0),
      shoalCount, fishCount, starCount }) });
}
