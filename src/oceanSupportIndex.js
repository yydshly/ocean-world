// Broadphase only: every candidate still uses the original exact support query.
// Each cached owner has at most 16 x 16 four-metre bins, with the same lifetime
// and invalidation as the old nine-owner support-feature list.
const BIN_SIZE = 4;
const OWNER_SIZE = 64;
const BINS_PER_SIDE = OWNER_SIZE / BIN_SIZE;
const EMPTY = Object.freeze([]);
const ROCK_RADIUS = Math.sqrt(.25 + 1e-7);

function footprintBounds(feature) {
  const { element } = feature, { x, z, scale } = element;
  // Custom generators may mutate a descriptor while its owner cache survives.
  // Keep those references in every bin so native rock transform updates remain
  // visible exactly as before; production descriptors and scales are frozen.
  if (!Object.isFrozen(element) || !Object.isFrozen(scale)) return null;
  const rotation = element.kind === 'rock' || element.kind === 'formation' ? element.rotation ?? 0 : element.rotation;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation) ||
    !scale || !Number.isFinite(scale.x) || !Number.isFinite(scale.z)) return null;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  let reachX, reachZ;
  if (element.kind === 'rock' || element.kind === 'formation' || element.kind === 'coral') {
    if ((element.kind === 'rock' || element.kind === 'formation') &&
      (!(scale.x > 0) || !(scale.z > 0) || !(scale.y > 0) || !Number.isFinite(scale.y))) return null;
    const radius = element.kind === 'coral' ? .5 : ROCK_RADIUS;
    reachX = Math.hypot(cos * scale.x, sin * scale.z) * radius;
    reachZ = Math.hypot(sin * scale.x, cos * scale.z) * radius;
  } else if (element.kind === 'bottle' || element.kind === 'driftwood') {
    // sceneElementHeight first accepts a rotated local box of .5 + 1e-9.
    reachX = (Math.abs(cos * scale.x) + Math.abs(sin * scale.z)) * (.5 + 1e-9);
    reachZ = (Math.abs(sin * scale.x) + Math.abs(cos * scale.z)) * (.5 + 1e-9);
  } else return null;
  // Do not lose edge candidates when world-space transformation rounds onto
  // an adjacent bin. This padding does not alter the narrowphase tolerance.
  const padding = Math.max(1e-9, Math.abs(x) * Number.EPSILON * 32,
    Math.abs(z) * Number.EPSILON * 32, reachX * Number.EPSILON * 32, reachZ * Number.EPSILON * 32);
  const bounds = { minX: x - reachX - padding, maxX: x + reachX + padding,
    minZ: z - reachZ - padding, maxZ: z + reachZ + padding };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}

export function createOceanSupportIndex(features, cx, cz) {
  const index = { features, cx, cz, bins: Array(BINS_PER_SIDE * BINS_PER_SIDE) };
  if (!Number.isSafeInteger(cx * BINS_PER_SIDE) || !Number.isSafeInteger(cz * BINS_PER_SIDE)) {
    index.bins = null; return index;
  }
  const firstX = cx * BINS_PER_SIDE, firstZ = cz * BINS_PER_SIDE;
  for (const feature of features) {
    const bounds = footprintBounds(feature);
    // Preserve the old query behavior for malformed/unbounded descriptors,
    // including native validation errors rather than silently hiding them.
    const lowX = bounds ? Math.max(0, Math.floor(bounds.minX / BIN_SIZE) - firstX) : 0;
    const highX = bounds ? Math.min(BINS_PER_SIDE - 1, Math.floor(bounds.maxX / BIN_SIZE) - firstX) : BINS_PER_SIDE - 1;
    const lowZ = bounds ? Math.max(0, Math.floor(bounds.minZ / BIN_SIZE) - firstZ) : 0;
    const highZ = bounds ? Math.min(BINS_PER_SIDE - 1, Math.floor(bounds.maxZ / BIN_SIZE) - firstZ) : BINS_PER_SIDE - 1;
    for (let iz = lowZ; iz <= highZ; iz++) for (let ix = lowX; ix <= highX; ix++) {
      const cell = ix + iz * BINS_PER_SIDE;
      (index.bins[cell] ??= []).push(feature);
    }
  }
  return index;
}

export function oceanSupportCandidates(index, x, z) {
  const ix = Math.floor(x / BIN_SIZE) - index.cx * BINS_PER_SIDE;
  const iz = Math.floor(z / BIN_SIZE) - index.cz * BINS_PER_SIDE;
  if (!index.bins || ix < 0 || ix >= BINS_PER_SIDE || iz < 0 || iz >= BINS_PER_SIDE ||
    !Number.isFinite(ix) || !Number.isFinite(iz)) return index.features;
  return index.bins[ix + iz * BINS_PER_SIDE] ?? EMPTY;
}
