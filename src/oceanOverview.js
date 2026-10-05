const overviewScales = Object.freeze({
  kelp: Object.freeze({ height: 8, distance: 18, targetClearance: 4 }),
  reef: Object.freeze({ height: 5, distance: 12, targetClearance: 1 }),
  deep: Object.freeze({ height: 2.5, distance: 7, targetClearance: .2 }),
});
const maxDownwardSlope = Math.tan(35 * Math.PI / 180);

/** A bed-aware observation pose at the observer's existing world X/Z.
 * Heights are display choices in metres; the supplied terrain queries remain
 * authoritative. No habitat, animal, saved view or terrain is changed here. */
export function oceanOverviewObservation(position, direction, options = {}) {
  try {
    const { biome, surfaceY, floorHeight, safeHeight } = options ?? {};
    if (!Object.hasOwn(overviewScales, biome) || !Number.isFinite(surfaceY) ||
        typeof floorHeight !== 'function' || typeof safeHeight !== 'function' ||
        ![position?.x, position?.y, position?.z, direction?.x, direction?.z].every(Number.isFinite)) {
      return null;
    }

    const scale = overviewScales[biome];
    const x = position.x, z = position.z;
    const floorY = floorHeight(x, z), safeY = safeHeight(x, z);
    if (![floorY, safeY].every(Number.isFinite)) return null;
    const minimumY = Math.max(floorY, safeY) + .7;
    const maximumY = surfaceY - .5;
    if (!Number.isFinite(minimumY) || minimumY > maximumY) return null;
    const cameraY = Math.min(maximumY, Math.max(minimumY, floorY + scale.height));

    // Scale first so even large finite headings normalize without overflow.
    const headingScale = Math.max(Math.abs(direction.x), Math.abs(direction.z));
    let headingX = 0, headingZ = -1;
    if (headingScale > 0) {
      const dx = direction.x / headingScale, dz = direction.z / headingScale;
      const length = Math.hypot(dx, dz);
      headingX = dx / length; headingZ = dz / length;
    }
    const targetX = x + headingX * scale.distance;
    const targetZ = z + headingZ * scale.distance;
    if (![targetX, targetZ].every(Number.isFinite) || (targetX === x && targetZ === z)) return null;
    const targetFloorY = floorHeight(targetX, targetZ);
    if (!Number.isFinite(targetFloorY)) return null;
    const targetY = Math.min(cameraY - .5, Math.max(cameraY - scale.distance * maxDownwardSlope,
      targetFloorY + scale.targetClearance));
    if (![cameraY, targetY].every(Number.isFinite)) return null;

    return {
      position: { x, y: cameraY, z },
      target: { x: targetX, y: targetY, z: targetZ },
    };
  } catch {
    // A failed terrain query cannot authorize an unsupported camera pose.
    return null;
  }
}
