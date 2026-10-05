// Observation heights are camera choices in world metres. They do not alter
// habitat, water fields, populations or the horizontal exploration position.
export const OCEAN_OBSERVATION_LAYERS = Object.freeze([
  Object.freeze({ id: 'bed', label: '海床' }),
  Object.freeze({ id: 'midwater', label: '中层' }),
  Object.freeze({ id: 'surface', label: '近水面' }),
]);

const layerIds = new Set([...OCEAN_OBSERVATION_LAYERS.map(layer => layer.id), 'free']);

/** Resolve a requested observation layer against the existing camera guard.
 * safeY is the generator's conservative solid-height query, not measured bed.
 * When there is no vertical clearance, the water ceiling wins; this helper
 * neither invents an opening nor shifts the observer to a different X/Z. */
export function oceanLayerHeight(layer, { surfaceY, floorY, safeY, freeDepthM = 0 } = {}) {
  if (!layerIds.has(layer)) throw new RangeError('Unknown ocean observation layer.');
  if (![surfaceY, floorY, safeY, freeDepthM].every(Number.isFinite)) {
    throw new TypeError('Ocean observation heights and free depth must be finite world metres.');
  }
  let desired;
  switch (layer) {
    case 'bed': desired = floorY + 2.8; break;
    // Split the sum so extreme but finite same-sign heights cannot overflow.
    case 'midwater': desired = floorY * .5 + surfaceY * .5; break;
    case 'surface': desired = surfaceY - 1.5; break;
    case 'free': desired = surfaceY - freeDepthM; break;
  }
  return Math.min(surfaceY - .5, Math.max(safeY + .4, desired));
}
