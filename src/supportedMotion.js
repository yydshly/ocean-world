// Metre-scale contact constraints, not a rigid-body or fluid solver. A support
// projection spends the same XYZ distance budget as ordinary movement.
export function supportedMotion(from, proposed, { maxDistance, minimumY, maximumY = Infinity, attached = false } = {}) {
  const distance = point => Math.hypot(point.x - from.x, point.y - from.y, point.z - from.z);
  if (!(maxDistance > 0)) return { ...from };
  for (const fraction of [1, .5, .25, .125, .0625, .03125]) {
    const point = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, from[axis] + (proposed[axis] - from[axis]) * fraction]));
    const floor = minimumY(point.x, point.z);
    point.y = attached ? floor : Math.max(point.y, floor);
    if (!Number.isFinite(point.y) || point.y > maximumY || distance(point) > maxDistance + 1e-10) continue;
    // Swimming must not tunnel through a narrow rise between accepted poses.
    // These four checks cover the finite step; they are not full-body collision.
    if (!attached && [.25, .5, .75].some(t => {
      const x = from.x + (point.x - from.x) * t, z = from.z + (point.z - from.z) * t;
      const y = from.y + (point.y - from.y) * t;
      return y < minimumY(x, z) - 1e-8;
    })) continue;
    return point;
  }
  // Historical poses that are already below a revised support recover upward
  // within the budget; no frame or food record is reset to hide the overlap.
  const floor = minimumY(from.x, from.z);
  if (!attached && Number.isFinite(floor) && from.y < floor) {
    return { ...from, y: Math.min(floor, from.y + maxDistance, maximumY) };
  }
  return { ...from };
}
