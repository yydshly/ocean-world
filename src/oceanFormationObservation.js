// A camera plan from actual loaded geometry, not a list of authored destinations.
export function oceanFormationObservation(elements, observer, { floorHeight, safeHeight } = {}) {
  const groups = new Map();
  for (const element of elements) {
    if (element.kind !== 'formation' || !element.groupId) continue;
    if (!groups.has(element.groupId)) groups.set(element.groupId, []);
    groups.get(element.groupId).push(element);
  }
  let nearest = null;
  for (const [groupId, members] of groups) {
    if (members.length < 2) continue;
    const rotation = members[0].rotation, cos = Math.cos(rotation), sin = Math.sin(rotation);
    const ordered = members.toSorted((a, b) => (a.x * sin + a.z * cos) - (b.x * sin + b.z * cos));
    for (let index = 1; index < ordered.length; index++) {
      const a = ordered[index - 1], b = ordered[index];
      const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const entryDistance = Math.max(a.scale.x, b.scale.x) * .5 + 4;
      for (const side of [-1, 1]) {
        const x = center.x + cos * entryDistance * side, z = center.z - sin * entryDistance * side;
        const distanceM = Math.hypot(x - observer.x, z - observer.z);
        const key = `${groupId}:${index}:${side}`;
        if (distanceM > 96 || (nearest && (distanceM > nearest.distanceM ||
          (distanceM === nearest.distanceM && key >= nearest.key)))) continue;
        nearest = { key, groupId, count: members.length, distanceM, x, z,
          targetX: center.x - cos * 8 * side, targetZ: center.z + sin * 8 * side };
      }
    }
  }
  if (!nearest) return null;
  const floor = floorHeight(nearest.x, nearest.z), safe = safeHeight(nearest.x, nearest.z);
  const targetFloor = floorHeight(nearest.targetX, nearest.targetZ);
  return { groupId: nearest.groupId, count: nearest.count, distanceM: nearest.distanceM,
    position: { x: nearest.x, y: Math.max(floor + 3.2, safe + 1), z: nearest.z },
    target: { x: nearest.targetX, y: targetFloor + 1, z: nearest.targetZ } };
}
