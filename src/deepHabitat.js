// Shared authored soft sediment: metres, not a measured bathymetric survey.
export const DEEP_DEPTH_M = 3500;
export const DEEP_WORLD_BOUNDS = Object.freeze({ x: [-9, 9], y: [-0.4, 2.5], z: [-8, 8] });
export const DEEP_ANEMONE_ANCHORS = Object.freeze([
  [-3.6, -1.3], [0.1, -1.1], [3.7, -0.8], [-2.4, 2.4], [2.5, 3.6],
].map(([x, z], index) => Object.freeze({ id: `deep-anemone-anchor-${index + 1}`, x, z, y: deepFloorHeight(x, z) })));

export function deepFloorHeight(x, z) {
  return -0.16 + 0.038 * Math.sin(x * 0.34) * Math.cos(z * 0.29)
    + 0.011 * Math.sin(x * 0.73 + z * 0.47);
}
export const floorHeight = deepFloorHeight;

export function deepFloorNormal(x, z) {
  const dx = 0.038 * 0.34 * Math.cos(x * 0.34) * Math.cos(z * 0.29)
    + 0.011 * 0.73 * Math.cos(x * 0.73 + z * 0.47);
  const dz = -0.038 * 0.29 * Math.sin(x * 0.34) * Math.sin(z * 0.29)
    + 0.011 * 0.47 * Math.cos(x * 0.73 + z * 0.47);
  const length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}

export function sampleDeepSupportPose(x, z, heading = 0) {
  const normal = deepFloorNormal(x, z);
  const tangent = { x: Math.cos(heading), y: 0, z: Math.sin(heading) };
  tangent.y = -(normal.x * tangent.x + normal.z * tangent.z) / normal.y;
  const length = Math.hypot(tangent.x, tangent.y, tangent.z);
  for (const axis of ['x', 'y', 'z']) tangent[axis] /= length;
  return { position: { x, y: deepFloorHeight(x, z), z }, normal, tangent };
}

// Representative 12-foot template; not a taxonomic assertion for every
// Scotoplanes species. Ordering agrees with deepOrganisms: front to rear,
// each pair -Z then +Z. Heading maps local +X to (cos heading, sin heading).
export const DEEP_SEA_PIG_CONTACTS_LOCAL = Object.freeze(Array.from({ length: 6 }, (_, index) => [-1, 1].map((side) =>
  Object.freeze({ x: 0.34 - index * 0.142, y: 0, z: side * (0.265 + Math.sin(index / 5 * Math.PI) * 0.066) }),
)).flat());

export function seaPigContactPointsLocal(agent) {
  const c = Math.cos(agent.heading);
  const s = Math.sin(agent.heading);
  return DEEP_SEA_PIG_CONTACTS_LOCAL.map((point) => {
    const x = agent.position.x + agent.sizeM * (point.x * c - point.z * s);
    const z = agent.position.z + agent.sizeM * (point.x * s + point.z * c);
    return { ...point, y: (deepFloorHeight(x, z) - agent.position.y) / agent.sizeM };
  });
}
