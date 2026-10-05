// These are camera-local near-bed viewing heights, not biological depth zones.
export const DEEP_OCEAN_OBSERVATION_LAYERS = Object.freeze([
  Object.freeze({ id: 'bed', label: '近底' }),
  Object.freeze({ id: 'midwater', label: '离底' }),
  Object.freeze({ id: 'surface', label: '上方' }),
]);

export function deepOceanLayerHeight(layer, { surfaceY = 3500, floorY, safeY, freeDepthM = 0 } = {}) {
  if (!['bed', 'midwater', 'surface', 'free'].includes(layer)) throw new RangeError('Unknown deep observation layer.');
  if (![surfaceY, floorY, safeY, freeDepthM].every(Number.isFinite)) throw new TypeError('Deep observation heights must be finite.');
  const minimum = safeY + .4, maximum = Math.max(floorY + 8, minimum);
  const desired = layer === 'free' ? surfaceY - freeDepthM : floorY + ({ bed: 1.8, midwater: 3.5, surface: 6 })[layer];
  return Math.min(maximum, Math.max(minimum, desired));
}
