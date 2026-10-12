// Fresh-owner composition only. Each slot represents one persisted animal,
// including deaths; scenery and render instances never supply extra members.
export const ANIMAL_COMMUNITIES_VERSION = 20;
export const ANIMAL_COMMUNITIES_WORLD = 'animal-communities';
export const ANIMAL_COMMUNITIES_SCOPE = 'habitat-layered fresh reef communities with reserved real fish cohorts and bottom-life slots; original full-body admission, nutrition and saved history retained';
const recipes = Object.freeze({
  reef: Object.freeze({ native: 2, guild: 2, diversity: 2, benthic: 3, shoal: 5, residents: 6 }),
  sand: Object.freeze({ native: 3, guild: 1, diversity: 2, benthic: 4, meadow: 3, residents: 7 }),
  meadow: Object.freeze({ native: 2, guild: 1, diversity: 2, benthic: 3, meadow: 4, turtles: 2, shoal: 5, residents: 1 }),
  slope: Object.freeze({ native: 2, guild: 1, openWater: 2, diversity: 2, benthic: 2, shoal: 6, residents: 5 })
});
export function animalCommunityAllocation(original) {
  if (!original || !Object.hasOwn(recipes, original.facies)) return original;
  return Object.freeze({ facies: original.facies, native: 0, guild: 0, openWater: 0,
    diversity: 0, benthic: 0, meadow: 0, turtles: 0, shoal: 0,
    ...recipes[original.facies], total: 20 });
}
// Keep the habitat/depth ranking for all other species. A plausible schooling
// species receives its turn before solitary candidates exhaust the slots.
// Plausibility only ranks candidates; original whole-body checks admit them.
export function animalCommunityOrder(order, schoolingIds, plausible, phase = 0) {
  const cohorts = order.filter(id => schoolingIds.includes(id) && plausible(id));
  const offset = Math.floor(Math.max(0, Math.min(.999999, phase)) * cohorts.length);
  const rotated = [...cohorts.slice(offset), ...cohorts.slice(0, offset)];
  return [...rotated, ...order.filter(id => !cohorts.includes(id))];
}
