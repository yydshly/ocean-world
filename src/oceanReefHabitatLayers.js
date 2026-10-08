// Candidate centers in actual reef margins. This module supplies possibilities;
// admission still checks the entire body, depth, substrate and other animals.
export const REEF_HABITAT_LAYERS_MODEL = Object.freeze({ stationSpacingM: 10, lateralOffsetM: 3,
  maximumAnchorsPerOwner: 8, maximumAddedSitesPerOwner: 32, maximumRouteStations: 512,
  ownerMarginM: 4, lowerWaterHeightM: .8, upperWaterHeightM: 1.8 });
const M = REEF_HABITAT_LAYERS_MODEL;
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nearHost = (host, p) => Math.hypot(host.x - p.x, host.z - p.z) <= Math.max(host.scale.x, host.scale.z) * .6 + 5;
export function createReefHabitatLayerSites(region, chunk, group) {
  if (!Number.isSafeInteger(region?.cx) || !Number.isSafeInteger(region?.cz) || chunk?.id !== region.id ||
    !Array.isArray(group?.routePath) || group.routePath.length < 2 || !group.routePath.every(point)) return [];
  const hosts = (chunk.elements ?? []).filter(e => ['rock', 'coral', 'formation'].includes(e.kind) &&
    Number.isFinite(e.x) && Number.isFinite(e.z) && e.scale?.x > 0 && e.scale?.z > 0).toSorted((a, b) => a.id.localeCompare(b.id));
  if (!hosts.length) return [];
  const segments = [], path = group.routePath; let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (length > 1e-8) { segments.push({ a, b, start: total, length }); total += length; }
  }
  if (!segments.length || !Number.isFinite(total)) return [];
  const owned = p => p.x >= region.cx * 64 + M.ownerMarginM && p.x <= (region.cx + 1) * 64 - M.ownerMarginM &&
    p.z >= region.cz * 64 + M.ownerMarginM && p.z <= (region.cz + 1) * 64 - M.ownerMarginM;
  const sites = []; let anchors = 0, segmentIndex = 0;
  for (let station = 0; station < M.maximumRouteStations && station * M.stationSpacingM <= total; station++) {
    const s = station * M.stationSpacingM;
    while (segmentIndex < segments.length - 1 && s > segments[segmentIndex].start + segments[segmentIndex].length) segmentIndex++;
    const segment = segments[segmentIndex], { a, b } = segment, t = (s - segment.start) / segment.length,
      dx = b.x - a.x, dz = b.z - a.z, horizontal = Math.hypot(dx, dz);
    if (horizontal < 1e-8) continue;
    const center = { x: a.x + dx * t, z: a.z + dz * t }, added = [];
    for (const side of [-1, 1]) {
      const p = { x: center.x - dz / horizontal * side * M.lateralOffsetM,
        z: center.z + dx / horizontal * side * M.lateralOffsetM };
      if (!owned(p)) continue;
      const host = hosts.filter(h => nearHost(h, p)).toSorted((h, k) =>
        Math.hypot(h.x - p.x, h.z - p.z) - Math.hypot(k.x - p.x, k.z - p.z) || h.id.localeCompare(k.id))[0];
      if (!host) continue;
      const base = { ...p, hostId: host.id, routeStation: station, distanceM: M.lateralOffsetM, order: station * 2 + (side + 1) / 2 };
      added.push({ ...base, siteId: `reef-layer:${host.id}:${station}:${side}:bed`, layer: 'bed' });
      added.push({ ...base, siteId: `reef-layer:${host.id}:${station}:${side}:water`, layer: 'water',
        waterHeightM: side < 0 ? M.lowerWaterHeightM : M.upperWaterHeightM });
    }
    if (added.length) { sites.push(...added); if (++anchors >= M.maximumAnchorsPerOwner) break; }
  }
  return sites;
}

export function reefHabitatLayerSpeciesSites(sites, speciesId, random) {
  const added = sites.filter(s => s.layer), original = sites.filter(s => !s.layer);
  if (!added.length) return sites;
  // Different species start in different real neighborhoods. The existing
  // occupancy check, rather than a preferred cast or count, decides placement.
  const offset = Math.floor(random(`habitat-layer-site:${speciesId}`) * added.length);
  return [...added.slice(offset), ...added.slice(0, offset), ...original];
}
