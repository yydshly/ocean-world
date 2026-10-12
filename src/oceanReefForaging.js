// These coordinates describe suitable surfaces, not resolved food patches.
// Admission and every movement still use the resident's full-body checks.
export const REEF_FORAGING_VERSION = 19;
export const REEF_FORAGING_SCOPE = 'fresh reef cohorts and eight existing surface-foraging representatives; actual hard or soft support, approach and pause before owner-local proxy intake; unchanged birth capacity and historical recipes';
export const REEF_FORAGING_MODEL = Object.freeze({ candidateCount: 8, travelSeconds: 12,
  maximumReachM: .35, arrivalM: .012, pauseSec: 3, fishClearanceM: .035,
  scope: 'selected exposed near-surface phase; illustrative timing, no mapped food biomass, scraping damage, sediment processing or resolved prey' });
const profiles = {
  'sailfin-tang': { substrate: 'hard', pool: 'resources.algae', swimming: true },
  'green-turban-snail': { substrate: 'hard', pool: 'resources.algae' },
  'collector-urchin': { substrate: 'hard', pool: 'resources.algae' },
  'long-spined-diadem-urchin': { substrate: 'hard', pool: 'resources.algae' },
  'leopard-sea-cucumber': { substrate: 'soft', pool: 'resources.detritus' },
  'humble-sea-biscuit': { substrate: 'soft', pool: 'resources.detritus' },
  'chocolate-chip-sea-star': { substrate: 'soft', pool: 'resources.detritus' },
  'shame-faced-crab': { substrate: 'soft', pool: 'reefGuild.preyOrganicUnits' }
};
export const REEF_FORAGING_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(profiles).map(([id, profile]) => [id, Object.freeze(profile)])));
export const REEF_FORAGING_IDS = Object.freeze(Object.keys(profiles));
const M = REEF_FORAGING_MODEL;
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
export const reefForagingProfile = a => [REEF_FORAGING_VERSION, 20].includes(a?.reefResidentIndividualVersion) ?
  REEF_FORAGING_PROFILES[a.speciesId] ?? null : null;
export function reefForageSiteValid(a, p, context) {
  const profile = reefForagingProfile(a);
  if (!profile || !point(p)) return false;
  const ground = context.ground(p.x, p.z), bed = context.bed(p.x, p.z), solid = context.surface(p.x, p.z);
  if (!ground || !Number.isFinite(ground.height) || !Number.isFinite(bed) || !Number.isFinite(solid) ||
    !point(ground.normal) || ground.normal.y < .92 || solid > ground.height + .01) return false;
  const substrate = context.sample(p.x, p.z).substrate;
  return profile.substrate === 'soft' ? substrate === 'sand' && ground.height <= bed + .025 :
    ground.height > bed + .025 || substrate === 'rock';
}
export function reefForageCandidates(a, traits, random, context) {
  if (!reefForagingProfile(a)) return [];
  const reach = reefForagingProfile(a).swimming ? traits.extent : Math.min(traits.extent, traits.speed * M.travelSeconds, M.maximumReachM), sites = [];
  for (let i = 0; i < M.candidateCount; i++) {
    const heading = random(`${a.id}:forage:${a.decisions}:heading:${i}`) * Math.PI * 2,
      radius = reach * (.4 + random(`${a.id}:forage:${a.decisions}:reach:${i}`) * .6);
    const p = context.positionAt(a.position.x + Math.cos(heading) * radius,
      a.position.z + Math.sin(heading) * radius, heading);
    if (p && reefForageSiteValid(a, p, context)) sites.push(p);
  }
  const same = context.positionAt(a.position.x, a.position.z, a.heading);
  if (same && reefForageSiteValid(a, same, context)) sites.push(same);
  return sites;
}
export function reefForageReady(a, context) {
  const profile = reefForagingProfile(a);
  if (!profile || !reefForageSiteValid(a, a.position, context) || !point(a.target) ||
    distance(a.position, a.target) > M.arrivalM) return false;
  if (!profile.swimming) return true;
  const gap = context.bodyClearance ? context.bodyClearance() : a.position.y + context.bodyBottomOffset - context.surface(a.position.x, a.position.z);
  return gap >= -.00000001 && gap <= M.fishClearanceM + .015;
}
