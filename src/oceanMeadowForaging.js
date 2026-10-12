// Selected activity phases for existing animals. Targets are suitable physical
// locations, not resolved prey or measured red-algal patches. Old records omit
// the marker and keep their original controller and nutrition timing.
export const MEADOW_FORAGING_VERSION = 2;
export const MEADOW_FORAGING_MODEL = Object.freeze({
  candidates: 6, travelSeconds: 10, pauseSeconds: 5, turnAllowanceSeconds: 2,
  cuttlefishClearanceM: .08, maximumFeedingClearanceM: .12,
  scope: 'finite approach and pause at actual supported habitat; existing owner nutrition, no visible prey capture or mapped algal biomass; rates uncalibrated',
});
const profiles = Object.freeze({
  'reef-cuttlefish': Object.freeze({ speed: .055, extent: 1.5, arrivalM: .008, daylightOnly: true }),
  'spider-conch': Object.freeze({ speed: .006, extent: .6, arrivalM: .002, daylightOnly: false }),
});
export const MEADOW_FORAGING_IDS = Object.freeze(Object.keys(profiles));
export const meadowForagingProfile = a => [1, MEADOW_FORAGING_VERSION].includes(a?.meadowLifeForagingVersion) ? profiles[a.speciesId] ?? null : null;
// Version 2 closes the existing detritus -> unresolved animal-nutrition path
// for these actual consumers. Version 1 history keeps its old pool equation.
export function meadowPreyConsumerCount(r) {
  if (r?.meadowLifeForagingVersion !== 2) return 0;
  return Math.min(2, (r.agents ?? []).filter(a => a.alive && a.meadowLifeIndividualVersion === 1 &&
    a.meadowLifeForagingVersion === 2 && a.meadowLifeFoodPool === 'reefGuild.preyOrganicUnits' &&
    ['sand-edge-seahorse', 'reef-cuttlefish'].includes(a.speciesId)).length);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function meadowForagingCandidates(a, random, positionAt) {
  const p = meadowForagingProfile(a); if (!p) return [];
  const candidates = [];
  for (let i = 0; i < MEADOW_FORAGING_MODEL.candidates; i++) {
    const heading = random(`heading:${i}`) * Math.PI * 2;
    const reach = (.35 + .65 * random(`reach:${i}`)) * p.speed * MEADOW_FORAGING_MODEL.travelSeconds;
    const x = a.position.x + Math.cos(heading) * reach, z = a.position.z + Math.sin(heading) * reach;
    const position = positionAt(x, z, heading);
    if (position && distance(position, a.home) <= p.extent + 1e-8) candidates.push({ position, heading });
  }
  const position = positionAt(a.position.x, a.position.z, a.heading);
  if (position && distance(position, a.home) <= p.extent + 1e-8) candidates.push({ position, heading: a.heading });
  return candidates;
}
export function meadowForagingArrived(a) {
  const p = meadowForagingProfile(a);
  return Boolean(p && a.position && a.target && distance(a.position, a.target) <= p.arrivalM);
}
export function meadowForagingReady(a, { physicallyValid, bodyClearance }) {
  return meadowForagingArrived(a) && physicallyValid() &&
    (a.speciesId !== 'reef-cuttlefish' || bodyClearance() <= MEADOW_FORAGING_MODEL.maximumFeedingClearanceM);
}
