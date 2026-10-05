export const OCEAN_PLANKTON_TRANSPORT_VERSION = 1;
export const OCEAN_PLANKTON_FACE_SAMPLE_COUNT = 5;
export const OCEAN_PLANKTON_MINIMUM_WATER_COLUMN_M = 1.5;
export const OCEAN_PLANKTON_TRANSPORT_METHOD = 'first-order-upwind relative stocks; 64 m equal-area reference cells; five shared-column face probes';
export const OCEAN_PLANKTON_TRANSPORT_SCOPE = 'loaded reef regions only; unknown upstream supplies no food; downstream outside the active window is exported; locked or pending faces are closed';

/** Pure relative-stock exchange, not measured concentration or a fluid solver.
 * All donor stocks belong to one common post-local-tick snapshot. A receiving
 * cell cannot forward its newly received stock again in this fixed step. */
export function computeOceanPlanktonTransport(regions, {
  dt = .1, cellSizeM = 64, lockedRegionIds = new Set(),
  currentAt = () => ({ x: 0, z: 0 }), openFractionAt = () => 1,
} = {}) {
  if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(cellSizeM) || cellSizeM <= 0) {
    throw new RangeError('Transport step and cell size must be finite and non-negative/positive.');
  }
  const cells = [...regions].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(cells.map(region => [region.id, region]));
  for (const region of cells) if (!Number.isInteger(region.cx) || !Number.isInteger(region.cz) ||
    !Number.isFinite(region.resources?.plankton) || region.resources.plankton < 0) {
    throw new RangeError('Transport cells require integer coordinates and a non-negative finite plankton stock.');
  }
  const faces = [], proposals = [];
  let sampledFaces = 0;
  const visit = (axis, lowerId, upperId, x, z) => {
    if (lockedRegionIds.has(lowerId) || lockedRegionIds.has(upperId)) return;
    const current = currentAt(x, z);
    const normalVelocityMps = current?.[axis];
    if (!Number.isFinite(normalVelocityMps)) throw new TypeError('Shared face current must have finite horizontal components.');
    sampledFaces++;
    if (normalVelocityMps === 0 || dt === 0) return;
    const fromId = normalVelocityMps > 0 ? lowerId : upperId;
    const toId = normalVelocityMps > 0 ? upperId : lowerId;
    const source = byId.get(fromId);
    if (!source || source.resources.plankton <= 0) return;
    const openness = openFractionAt({ axis, x, z, lowerId, upperId });
    if (!Number.isFinite(openness) || openness < 0 || openness > 1) throw new RangeError('Shared face openness must be between zero and one.');
    if (openness === 0) return;
    const amount = source.resources.plankton * Math.abs(normalVelocityMps) * dt / cellSizeM * openness;
    if (!(amount > 0)) return;
    proposals.push({ fromId, toId: byId.has(toId) ? toId : null, amount, axis, x, z,
      normalVelocityMps, openFraction: openness });
  };
  for (const region of cells) {
    const { cx, cz } = region;
    // Every interior face is visited once (east/north); missing west/south
    // faces complete the boundary without treating an unknown inflow as food.
    faces.push(['x', region.id, `${cx + 1},${cz}`, (cx + 1) * cellSizeM, (cz + .5) * cellSizeM]);
    faces.push(['z', region.id, `${cx},${cz + 1}`, (cx + .5) * cellSizeM, (cz + 1) * cellSizeM]);
    if (!byId.has(`${cx - 1},${cz}`)) faces.push(['x', `${cx - 1},${cz}`, region.id, cx * cellSizeM, (cz + .5) * cellSizeM]);
    if (!byId.has(`${cx},${cz - 1}`)) faces.push(['z', `${cx},${cz - 1}`, region.id, (cx + .5) * cellSizeM, cz * cellSizeM]);
  }
  for (const face of faces) visit(...face);
  const requestedOut = new Map();
  for (const flow of proposals) requestedOut.set(flow.fromId, (requestedOut.get(flow.fromId) ?? 0) + flow.amount);
  const transfers = [], exports = [];
  let transferred = 0, exported = 0;
  for (const proposal of proposals) {
    const available = byId.get(proposal.fromId).resources.plankton;
    const scale = Math.min(1, available / requestedOut.get(proposal.fromId));
    const flow = { ...proposal, amount: proposal.amount * scale };
    if (flow.toId === null) { exports.push(flow); exported += flow.amount; }
    else { transfers.push(flow); transferred += flow.amount; }
  }
  return { transfers, exports, transferred, exported, sampledFaces };
}
