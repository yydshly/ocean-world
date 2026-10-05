const KINDS = new Set(['stone', 'plant-clump', 'bottle', 'driftwood']);
const finitePoint = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
const cellOf = point => `${Math.floor(point.x / 64)},${Math.floor(point.z / 64)}`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

function framedSphere(position, target, point, radius, tangent, aspect) {
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  const length = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz);
  if (!(horizontal > 0 && length > 0)) return false;
  const forward = { x: dx / length, y: dy / length, z: dz / length };
  const right = { x: -dz / horizontal, z: dx / horizontal };
  const up = { x: -forward.x * forward.y / (horizontal / length), y: horizontal / length,
    z: -forward.z * forward.y / (horizontal / length) };
  const relative = { x: point.x - position.x, y: point.y - position.y, z: point.z - position.z };
  const depth = relative.x * forward.x + relative.y * forward.y + relative.z * forward.z;
  const width = relative.x * right.x + relative.z * right.z;
  const height = relative.x * up.x + relative.y * up.y + relative.z * up.z;
  const horizontalTangent = tangent * aspect;
  return depth >= radius + .05 &&
    (depth * horizontalTangent - Math.abs(width)) / Math.hypot(1, horizontalTangent) >= radius &&
    (depth * tangent - Math.abs(height)) / Math.hypot(1, tangent) >= radius;
}

/** One ordinary view of an actual current-cell scene combination. The finite
 * sphere references certify framing; they do not assert terrain/plant occlusion
 * or keep moving animals in view. Nothing in the world is created or moved. */
export function createOceanSceneObservation({ elements, agents = [], generator, regionId, surfaceY = 8,
  fov = 50, aspect = 16 / 9, safeHeight, candidateClear } = {}) {
  try {
    if (!Array.isArray(elements) || !Array.isArray(agents) || typeof generator?.floorSurface !== 'function' ||
      typeof regionId !== 'string' || !/^-?\d+,-?\d+$/.test(regionId) ||
      !Number.isFinite(surfaceY) || !Number.isFinite(fov) || fov < 25 || fov > 90 ||
      !Number.isFinite(aspect) || aspect <= 0 || aspect > 8 ||
      candidateClear !== undefined && typeof candidateClear !== 'function') return null;
    const [cx, cz] = regionId.split(',').map(Number);
    if (![cx, cz].every(Number.isSafeInteger)) return null;
    const cluster = elements.filter(element => element?.regionId === regionId || finitePoint(element) && cellOf(element) === regionId)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (cluster.length < 3 || cluster.length > 17) return null;
    const seen = new Set();
    for (const element of cluster) {
      if (!finitePoint(element) || !KINDS.has(element.kind) || typeof element.id !== 'string' || !element.id || seen.has(element.id) ||
        cellOf(element) !== regionId || element.regionId !== undefined && element.regionId !== regionId ||
        !['x', 'y', 'z'].every(axis => Number.isFinite(element.scale?.[axis]) && element.scale[axis] > 0)) return null;
      seen.add(element.id);
    }
    const center = { x: cluster.reduce((sum, element) => sum + element.x, 0) / cluster.length,
      z: cluster.reduce((sum, element) => sum + element.z, 0) / cluster.length };
    const floor = generator.floorSurface(center.x, center.z).height;
    const target = { x: center.x, y: floor + .8, z: center.z };
    if (!finitePoint(target) || target.y >= surfaceY - .75) return null;
    const references = cluster.map(element => ({ point: { x: element.x, y: element.y + element.scale.y * .5, z: element.z },
      radius: Math.hypot(element.scale.x, element.scale.y, element.scale.z) * .5 }));
    const extent = Math.max(...cluster.map(element => Math.hypot(element.x - center.x, element.z - center.z) +
      Math.hypot(element.scale.x, element.scale.z) * .5));
    const tangent = Math.tan(fov * Math.PI / 360), viewDistance = Math.max(12, Math.min(20, extent / (tangent * Math.min(1, aspect)) * 1.1));
    const nearbyIds = new Set(), nearby = agents.filter(agent => {
      if (agent?.alive !== true || typeof agent.id !== 'string' || nearbyIds.has(agent.id) || !finitePoint(agent.position) ||
        !Number.isFinite(agent.sizeM) || agent.sizeM <= 0 || distance(agent.position, target) > 15) return false;
      nearbyIds.add(agent.id); return true;
    }).sort((a, b) => distance(a.position, target) - distance(b.position, target) || a.id.localeCompare(b.id));
    // Stand on the opposite side of the nearest real animal so the broad
    // heading looks through the scene toward it, then try only eight headings.
    const preferred = nearby[0] ? Math.atan2(center.z - nearby[0].position.z, center.x - nearby[0].position.x) : 0;
    const guard = typeof safeHeight === 'function' ? safeHeight : typeof generator.heightForCamera === 'function'
      ? (x, z) => generator.heightForCamera(x, z) : (x, z) => generator.floorSurface(x, z).height;
    let chosen = null;
    for (let index = 0; index < 8; index++) {
      const heading = preferred + index * Math.PI / 4, x = center.x + Math.cos(heading) * viewDistance,
        z = center.z + Math.sin(heading) * viewDistance;
      if (x < cx * 64 + 1 || x > (cx + 1) * 64 - 1 || z < cz * 64 + 1 || z > (cz + 1) * 64 - 1) continue;
      const floorY = generator.floorSurface(x, z).height, solidY = guard(x, z);
      if (![floorY, solidY].every(Number.isFinite)) continue;
      const minimumY = Math.max(floorY, solidY) + 1.3, ceilingY = surfaceY - .75;
      if (minimumY > ceilingY) continue;
      const position = { x, y: Math.min(ceilingY, Math.max(minimumY, floorY + 4.5)), z };
      if (!references.every(reference => framedSphere(position, target, reference.point, reference.radius, tangent, aspect))) continue;
      if (candidateClear && candidateClear(position, target, references) !== true) continue;
      const visible = nearby.filter(agent => framedSphere(position, target, agent.position, agent.sizeM * .6, tangent, aspect));
      if (!chosen || visible.length > chosen.sourceAgentIds.length) chosen = { position, target,
        sourceElementIds: cluster.map(element => element.id), sourceAgentIds: visible.map(agent => agent.id).sort(),
        evidence: { scope: 'frustum-reference-only', candidateCount: 8, chosenHeadingIndex: index, horizontalDistanceM: viewDistance,
          ...(candidateClear ? { oldSolidReferenceRayCheck: true } : {}) } };
    }
    return chosen ? freeze(chosen) : null;
  } catch { return null; }
}
