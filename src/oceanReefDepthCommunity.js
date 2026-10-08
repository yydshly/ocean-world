// Model admission bands, not natural zonation or a population-density survey.
// Inputs are geometry-derived centers already checked against the selected
// species' complete vertical envelope. Full physical admission follows later.
export const REEF_DEPTH_COMMUNITY_MODEL = Object.freeze({ shallowBoundaryM: 12, slopeBoundaryM: 18 });
export const reefDepthBand = depth => !Number.isFinite(depth) || depth < 3 ? -1 :
  depth >= REEF_DEPTH_COMMUNITY_MODEL.slopeBoundaryM ? 2 : depth >= REEF_DEPTH_COMMUNITY_MODEL.shallowBoundaryM ? 1 : 0;
export function orderReefDepthCommunity(previousOrder, maximumCenterDepthBySpecies) {
  const band = id => reefDepthBand(maximumCenterDepthBySpecies.get(id));
  const counts = { shallow: 0, transitional: 0, slope: 0, unavailable: 0 };
  for (const id of previousOrder) counts[['shallow', 'transitional', 'slope'][band(id)] ?? 'unavailable']++;
  // Stable ties retain the existing habitat-role order. No IDs, slots, species
  // quotas or extra birth attempts are introduced by the depth preference.
  return { candidateOrder: previousOrder.toSorted((a, b) => band(b) - band(a)),
    depthBandCandidates: counts };
}
