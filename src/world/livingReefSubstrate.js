// A display-only sediment/reef-fragment transition around actual planned
// rubble. It creates no stones, raised floor, food, cover stock or individuals.
// Logical world bins include adjacent owners so rendering order and floating
// origin cannot move the ground pattern or create a cell-edge discontinuity.
const BIN_M = 8;
export const LIVING_REEF_SUBSTRATE_VERSION = 1;

export function createLivingReefSubstrateIndex(generator, chunk) {
  const bins = new Map();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const element of generator.chunk(chunk.cx + dx, chunk.cz + dz).elements) {
      if (element.kind !== 'rubble') continue;
      const width = Math.max(element.scale.x, element.scale.z);
      const key = `${Math.floor(element.x / BIN_M)},${Math.floor(element.z / BIN_M)}`;
      let entries = bins.get(key);
      if (!entries) { entries = []; bins.set(key, entries); }
      entries.push({ x: element.x, z: element.z, radius: .6 + width * 1.5,
        strength: Math.min(1, width / .5) * .65 });
    }
  }
  return bins;
}

export function livingReefSubstrateCover(bins, x, z) {
  const bx = Math.floor(x / BIN_M), bz = Math.floor(z / BIN_M);
  let cover = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const patch of bins.get(`${bx + dx},${bz + dz}`) || []) {
      const t = Math.max(0, 1 - Math.hypot(x - patch.x, z - patch.z) / patch.radius);
      cover += t * t * (3 - 2 * t) * patch.strength;
    }
  }
  return Math.min(1, cover);
}

export function livingReefSubstrateColor(base, cover, target = [0, 0, 0]) {
  // A broad mineral-toned ground transition, not a claim of living coating or
  // simulated deposition. Empty sand retains its existing colour exactly.
  const c = Math.max(0, Math.min(1, cover));
  target[0] = base[0] * (1 - .20 * c);
  target[1] = base[1] * (1 - .21 * c);
  target[2] = base[2] * (1 - .24 * c);
  return target;
}
