// A small author-selected collection footprint. Its area, vertices and visible
// pieces are not biomass, surveyed litter density or a transport simulation.
export const KELP_DRIFT_RADIUS_M = .032;
export const KELP_DRIFT_CLEARANCE_M = .001;
export const KELP_DRIFT_MOUTH_REACH_M = .004;
export const KELP_DRIFT_VERTEX_COUNT = 7;
// Unchanged canonical shell underside Float32 Y times its existing whole-
// diameter normalization, independently checked against the actual renderer.
export const KELP_DRIFT_URCHIN_MOUTH_LOCAL_Y = .030946875440609325;
const vector = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function kelpDriftFootprint(patch, generator) {
  const supportHeight = typeof generator === 'function' ? generator : (x, z) => generator.heightAt(x, z);
  const center = { x: patch.position.x, y: supportHeight(patch.position.x, patch.position.z) + KELP_DRIFT_CLEARANCE_M, z: patch.position.z };
  const verticesWorld = [center];
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3, radius = KELP_DRIFT_RADIUS_M * (index % 2 ? .68 : 1);
    const x = center.x + Math.cos(angle) * radius, z = center.z + Math.sin(angle) * radius;
    verticesWorld.push({ x, y: supportHeight(x, z) + KELP_DRIFT_CLEARANCE_M, z });
  }
  return { center, verticesWorld, indices: Array.from({ length: 6 }, (_, index) => [0, index + 1, (index + 1) % 6 + 1]).flat() };
}

// The oral underside is a finite reference, not the urchin's full diameter.
// The existing renderer supplies the same terrain normal and metre root.
export function kelpDriftUrchinMouthWorld(agent) {
  const input = vector(agent.supportNormal) ? agent.supportNormal : { x: 0, y: 1, z: 0 };
  const length = Math.hypot(input.x, input.y, input.z) || 1, height = agent.sizeM * KELP_DRIFT_URCHIN_MOUTH_LOCAL_Y;
  return { x: agent.position.x + input.x / length * height,
    y: agent.position.y + input.y / length * height, z: agent.position.z + input.z / length * height };
}

export function kelpDriftContact(agent, patch, generator) {
  const mouth = kelpDriftUrchinMouthWorld(agent), footprint = kelpDriftFootprint(patch, generator);
  let point = null, distanceM = Infinity, referenceIndex = null;
  for (let index = 0; index < footprint.verticesWorld.length; index++) {
    const candidate = footprint.verticesWorld[index], gap = distance(mouth, candidate);
    if (gap < distanceM) { point = candidate; distanceM = gap; referenceIndex = index; }
  }
  return { mouth, point, distanceM, referenceIndex, allowedDistanceM: KELP_DRIFT_MOUTH_REACH_M };
}
