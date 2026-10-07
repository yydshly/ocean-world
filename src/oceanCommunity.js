import { OCEAN_AUTHORED_RADIUS } from './oceanGeneration.js';
import { oceanRockHeight } from './oceanRockShape.js';

export const OCEAN_COMMUNITY_VERSION = 2;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const byScore = (random, salt) => (a, b) => random(`${salt}:${a.id}`) - random(`${salt}:${b.id}`) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Illustrative initial occupancy of actual local niches. This is neither a
 * measured density law nor a regeneration rule for existing saved populations.
 * Placement streams do not consume scenery seeds or use a camera/cell label. */
export function createOceanCommunityPlan(generator, chunk, { random, surface, biodiversity = false }) {
  const living = generator.profile === 'living-shallows-v1';
  const diverse = living && biodiversity === true;
  const rocks = chunk.elements.filter(element => element.kind === 'rock');
  const hosts = new Map(rocks.map(rock => [rock.id, rock]));
  const grass = chunk.elements.filter(element => element.kind === 'seagrass');
  const bounds = chunk.bounds;
  const inBounds = (x, z, margin = .6) => x >= bounds.minX + margin && x <= bounds.maxX - margin &&
    z >= bounds.minZ + margin && z <= bounds.maxZ - margin && (living || Math.hypot(x, z) > OCEAN_AUTHORED_RADIUS + 1);
  const hardSites = [], algaeSites = [], softSites = [];
  const addHard = (id, rock, x, z, algae) => {
    if (!inBounds(x, z)) return;
    const sample = generator.sample(x, z), support = surface(x, z);
    const ownHeight = oceanRockHeight(rock, x, z);
    if (sample.depthM > 22 || ownHeight === null || Math.abs(ownHeight - support) > .03 ||
      support - sample.floorY <= .06 || surface(x, z, true) > support + .02) return;
    const site = { id, x, z, hostId: rock.id, depthM: sample.depthM };
    hardSites.push(site); if (algae) algaeSites.push(site);
  };
  for (const algae of chunk.elements.filter(element => element.kind === 'algae')) {
    const rock = hosts.get(algae.attachmentId);
    if (!rock) continue;
    const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
    const wx = algae.x - rock.x, wz = algae.z - rock.z;
    const localX = (wx * cos - wz * sin) / rock.scale.x, localZ = (wx * sin + wz * cos) / rock.scale.z;
    const radius = algae.patchRadius || Math.sin(algae.surfaceRadius || .18) * .5;
    for (const [index, [dx, dz]] of [[0, 0], [.32, 0], [-.32, 0], [0, .32], [0, -.32]].entries()) {
      const lx = (localX + dx * radius) * rock.scale.x, lz = (localZ + dz * radius) * rock.scale.z;
      addHard(`${algae.id}:site:${index}`, rock, rock.x + lx * cos + lz * sin, rock.z - lx * sin + lz * cos, true);
    }
  }
  for (const rock of rocks) {
    const angle = random(`hard-probes:${rock.id}`) * TAU, cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
    for (let index = 0; index < 6; index++) {
      const theta = angle + index * TAU / 6, radius = index % 2 ? .35 : .22;
      const lx = Math.cos(theta) * radius * rock.scale.x, lz = Math.sin(theta) * radius * rock.scale.z;
      addHard(`${rock.id}:site:${index}`, rock, rock.x + lx * cos + lz * sin, rock.z - lx * sin + lz * cos, false);
    }
  }
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const id = `soft:${ix},${iz}`;
    const x = chunk.origin.x + (ix + .2 + random(`${id}:x`) * .6) * 8;
    const z = chunk.origin.z + (iz + .2 + random(`${id}:z`) * .6) * 8;
    if (!inBounds(x, z)) continue;
    const sample = generator.sample(x, z), support = surface(x, z);
    if (sample.depthM > 22 || sample.substrate === 'rock' || support - sample.floorY >= .03 ||
      surface(x, z, true) > support + .02) continue;
    // The candidate is sediment between tufts, not an animal placed through a
    // grass root. Nearby actual vegetation supplies a qualitative cover cue.
    let grassNear = false, inRoot = false;
    for (const patch of grass) {
      const distance = Math.hypot(x - patch.x, z - patch.z);
      if (distance < Math.max(patch.scale.x, patch.scale.z) * .16) inRoot = true;
      if (distance < 3.2) grassNear = true;
    }
    if (!inRoot) softSites.push({ id, x, z, depthM: sample.depthM, grassNear,
      suitability: .35 + .65 * clamp((24 - sample.depthM) / 14, 0, 1) });
  }
  const corals = chunk.elements.filter(element => element.kind === 'coral' &&
    (!element.morphotype || element.morphotype === 'branching')).filter(coral => {
    const host = hosts.get(coral.attachmentId);
    if (!host || !inBounds(coral.x, coral.z, 1.6) || generator.sample(coral.x, coral.z).depthM > 22) return false;
    const height = oceanRockHeight(host, coral.x, coral.z);
    return height !== null && Math.abs(height - coral.y) < .04;
  }).sort(byScore(random, 'colony'));
  const colonies = [];
  for (const coral of corals) {
    if (colonies.some(other => other.attachmentId === coral.attachmentId || Math.hypot(other.x - coral.x, other.z - coral.z) < 6)) continue;
    colonies.push(coral);
  }
  const algaeHosts = new Set(algaeSites.map(site => site.hostId));
  const grassRatio = softSites.length ? softSites.filter(site => site.grassNear).length / softSites.length : 0;
  const softScore = softSites.reduce((total, site) => total + site.suitability * (site.grassNear ? 1.35 : 1), 0) / 64;
  const legacySoftQuota = Math.min(7, Math.floor(softScore * (2.6 + 2 * random('deposit-occupancy')) + (grassRatio > .4 ? 1 : 0)));
  const softQuota = living ? Math.min(2, Math.max(softSites.length ? 2 : 0, legacySoftQuota)) : legacySoftQuota;
  const grazerQuota = algaeHosts.size ? living ? 1 : 1 + (algaeHosts.size >= 8 && random('grazer-occupancy') > .5 ? 1 : 0) : 0;
  const surfaceQuota = living ? (hardSites.length ? 1 : 0) : Math.min(3, Math.floor(Math.min(1, hardSites.length / 12) * 3.8 * random('surface-occupancy')));
  const reefSites = hardSites.filter(site => colonies.some(coral => coral.attachmentId === site.hostId));
  const cleanerQuota = reefSites.length && (living || random('cleaner-occupancy') < .48) ? 1 : 0;
  const predatorQuota = reefSites.length && corals.length >= 2 && (living || random('predator-occupancy') < .45) ? 1 : 0;
  // Always leave two slots for the unchanged clam/shrimp compatibility pass.
  // The independent scene keeps a minimum three-fish refuge school and each
  // benthic role, reserving room for four fusiliers, three reef-life types and
  // two open-water representatives. Admission still shares the total capacity,
  // including visitors and deaths; this recipe is used only for new owners.
  const PRIMARY_LIMIT = living ? 9 : 18;
  let schoolBudget = Math.min(12, PRIMARY_LIMIT - softQuota - grazerQuota - surfaceQuota - cleanerQuota - predatorQuota);
  const coralFootprint = corals.reduce((total, coral) => total + coral.scale.x * coral.scale.z, 0);
  let schoolCapacity = Math.min(3, colonies.length, Math.ceil(coralFootprint / 12), Math.floor(schoolBudget / 3));
  if (grassRatio > .45 || (softSites.length > 42 && corals.length < 12)) schoolCapacity = Math.min(1, schoolCapacity);
  const schoolCount = schoolCapacity > 1 ? schoolCapacity - (random('school-occupancy') < .55 ? 1 : 0) : schoolCapacity;
  const placements = [];
  const push = (speciesId, site, habitat, groupId = null) => {
    if (!site || placements.length >= PRIMARY_LIMIT) return false;
    const minimumDistance = speciesId === 'green-chromis' ? .12 : .28;
    if (placements.some(other => Math.hypot(other.x - site.x, other.z - site.z) < minimumDistance)) return false;
    placements.push({ speciesId, x: site.x, z: site.z, habitat, hostId: site.hostId || null, groupId });
    return true;
  };
  for (let group = 0; group < schoolCount; group++) {
    const coral = colonies[group];
    const requested = 3 + Math.floor(clamp(coral.scale.x * coral.scale.z / 4, 0, 1) * 2) +
      Math.floor(random(`${coral.id}:school-size`) * 2);
    const count = Math.min(requested, schoolBudget - (schoolCount - group - 1) * 3);
    const schoolSpecies = diverse && random(`${coral.id}:resident-school`) < .35 ? 'blue-tang' : 'green-chromis';
    const offset = random(`${coral.id}:school-angle`) * TAU;
    for (let index = 0; index < count; index++) {
      const angle = offset + index / count * TAU;
      const radius = .40 + random(`${coral.id}:school-radius:${index}`) * .38;
      push(schoolSpecies, { x: coral.x + Math.cos(angle) * radius, z: coral.z + Math.sin(angle) * radius,
        hostId: coral.id }, 'coral-refuge', coral.id);
    }
    schoolBudget -= count;
  }
  const placeHard = (speciesId, sites, quota, habitat) => {
    let placed = 0;
    for (const site of [...sites].sort(byScore(random, `${speciesId}:site`))) {
      if (push(speciesId, site, habitat)) placed++;
      if (placed >= quota) break;
    }
  };
  if (grazerQuota) placeHard('lined-tang', algaeSites, grazerQuota, 'hard-substrate');
  if (cleanerQuota) placeHard('cleaner-wrasse', reefSites, cleanerQuota, 'cleaning-station');
  if (predatorQuota) {
    if (living && schoolCount && colonies[0]) {
      // A resident ambush predator shares an actual school colony. This uses
      // habitat coordinates, never the observer or a timed encounter script.
      const coral = colonies[0];
      const resident = diverse && random(`${coral.id}:reef-resident`) < .45 ? 'butterflyfish' : 'honeycomb-grouper';
      push(resident, { x: coral.x + .85, z: coral.z, hostId: coral.id }, resident === 'butterflyfish' ? 'reef-benthic-feeder' : 'reef-ambush');
    } else placeHard('honeycomb-grouper', reefSites, predatorQuota, 'reef-ambush');
  }
  for (let index = 0; index < surfaceQuota; index++) {
    const species = algaeSites.length && random(`surface-species:${index}`) < .55 ? 'top-shell' : 'blue-starfish';
    placeHard(species, species === 'top-shell' ? algaeSites : hardSites, 1, 'hard-substrate');
  }
  let deposited = 0;
  const rankedSoft = [...softSites].sort((a, b) => (b.grassNear ? 1 : 0) - (a.grassNear ? 1 : 0) ||
    random(`deposit-site:${a.id}`) - random(`deposit-site:${b.id}`));
  for (const site of rankedSoft) {
    if (deposited >= softQuota) break;
    if (push('black-cucumber', site, site.grassNear ? 'sand-with-seagrass' : 'sand')) deposited++;
  }
  return Object.freeze({ version: OCEAN_COMMUNITY_VERSION,
    ...(living ? { populationRecipeVersion: diverse ? 'living-biodiversity-v1' : 'living-open-water-v2' } : {}), placements: Object.freeze(placements.map(Object.freeze)),
    niches: Object.freeze({ coralColonies: corals.length, separateCoralHosts: colonies.length, algaeHosts: algaeHosts.size,
      hardSites: hardSites.length, openSoftSites: softSites.length, grassSoftSites: softSites.filter(site => site.grassNear).length,
      schoolCount, softQuota, grassRatio }) });
}
