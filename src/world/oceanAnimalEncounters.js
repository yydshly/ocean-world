// A short look at a resident community along an existing safe camera path.
// All coordinates are absolute world metres. This changes the view direction
// only: no organism, camera position, ecological clock or persistence is changed.
const radians = degrees => degrees * Math.PI / 180;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const point = p => !!p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const copy = p => ({ x: p.x, y: p.y, z: p.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = p => Math.hypot(p.x, p.y, p.z);
const distance = (a, b) => length(sub(a, b));
const direction = p => { const n = length(p); return n > 1e-9 ? { x: p.x / n, y: p.y / n, z: p.z / n } : null; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const species = (catalog, id) => catalog instanceof Map ? catalog.get(id) : Array.isArray(catalog) ? catalog.find(s => s.id === id) : catalog?.[id];
const group = a => typeof a.groupId === 'string' && a.groupId ? a.groupId : null;
const feeding = a => /feed|graz|forag|prob/i.test(a.state ?? '');

function category(a, s) {
  if (/meadow|seagrass|tail-hold|grass/i.test(`${a.habitat ?? ''} ${a.state ?? ''}`)) return 'grass-edge';
  if (s?.kind === 'ray' || /benthic|sediment|bottom|substrate|sand/i.test(a.habitat ?? '') ||
      ['reef-goatfish', 'black-cucumber', 'hermit-crab', 'spider-conch'].includes(a.speciesId)) return 'near-bottom';
  return 'water-column';
}

/** Read-only local selection. Framing tests below are angular/CPU estimates;
 * they do not establish WebGL visibility or scenery occlusion. An optional
 * clearance callback receives absolute from/to/agent and must return true. */
export function sampleOceanAnimalEncounter({ position, routeTarget, agents, catalog, activeOwnerIds,
  visibilityM = 14, fovDeg = 49, aspect = 1, candidateClearance = null, excludeIds = [] } = {}) {
  const empty = { desiredTarget: point(routeTarget) ? copy(routeTarget) : null, ids: [], groupId: null, category: null,
    score: 0, stats: { candidateCount: 0, selectedCount: 0, maxDistanceM: 0, scope: 'local-live-record-angular-estimate' } };
  if (!point(position) || !point(routeTarget) || !Array.isArray(agents)) return empty;
  const forward = direction(sub(routeTarget, position)); if (!forward) return empty;
  const owners = activeOwnerIds instanceof Set ? activeOwnerIds : new Set(activeOwnerIds ?? []), excluded = new Set(excludeIds);
  const safeFov = clamp(Number.isFinite(fovDeg) ? fovDeg : 49, 20, 90), safeAspect = clamp(Number.isFinite(aspect) ? aspect : 1, .4, 3);
  const halfHorizontal = Math.atan(Math.tan(radians(safeFov / 2)) * safeAspect);
  const allowedAngle = Math.min(radians(54), halfHorizontal + radians(12));
  const allowedPitch = radians(safeFov / 2 + 8);
  const rangeLimit = clamp(Number.isFinite(visibilityM) ? visibilityM : 14, 0, 14);
  const candidates = [];
  for (const a of agents) {
    if (a.alive !== true || a.state === 'dead' || !owners.has(a.regionId) || typeof a.id !== 'string' || excluded.has(a.id) || !point(a.position)) continue;
    const s = species(catalog, a.speciesId), sizeM = Number.isFinite(a.sizeM) && a.sizeM > 0 ? a.sizeM : s?.lengthM ?? .1;
    const delta = sub(a.position, position), distanceM = length(delta), unit = direction(delta);
    const maxDistanceM = Math.min(rangeLimit, clamp(5 + sizeM * 10, 8, 14));
    if (!unit || distanceM < .55 || distanceM > maxDistanceM || Math.acos(clamp(dot(unit, forward), -1, 1)) > allowedAngle) continue;
    if (Math.abs(Math.asin(clamp(unit.y, -1, 1)) - Math.asin(clamp(forward.y, -1, 1))) > allowedPitch) continue;
    if (candidateClearance) { try { if (candidateClearance(copy(position), copy(a.position), a) !== true) continue; } catch { continue; } }
    candidates.push({ a, sizeM, distanceM, category: category(a, s), angularSize: sizeM / distanceM,
      score: .5 * dot(unit, forward) + Math.min(.75, sizeM / distanceM * 3) + (feeding(a) ? .12 : 0) + .25 * (1 - distanceM / maxDistanceM) });
  }
  empty.stats.candidateCount = candidates.length;
  if (!candidates.length) return empty;
  // Prefer existing school membership, then nearby residents of the same
  // habitat layer. Keep at most six IDs and never retain unloaded individuals.
  let best = null;
  for (const leader of candidates) {
    const members = candidates.filter(row => row === leader || (group(leader.a) ? group(row.a) === group(leader.a)
      : !group(row.a) && row.category === leader.category && distance(row.a.position, leader.a.position) <= 3.5))
      .sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id)).slice(0, 6);
    const score = leader.score + Math.min(.7, (members.length - 1) * .18) + (group(leader.a) && members.length > 1 ? .3 : 0);
    if (!best || score > best.score || score === best.score && leader.a.id < best.leader.a.id) best = { leader, members, score };
  }
  let total = 0; const centre = { x: 0, y: 0, z: 0 };
  for (const row of best.members) { const weight = clamp(Math.sqrt(row.sizeM), .2, 1.2); total += weight;
    for (const k of ['x', 'y', 'z']) centre[k] += row.a.position[k] * weight; }
  for (const k of ['x', 'y', 'z']) centre[k] /= total;
  const desired = direction(sub(centre, position)), angle = Math.acos(clamp(dot(forward, desired), -1, 1));
  // Blend toward the community, while retaining the route's forward view.
  const influence = angle > 1e-9 ? Math.min(.72, radians(18) / angle) : .72;
  const unit = direction({ x: forward.x * (1 - influence) + desired.x * influence,
    y: forward.y * (1 - influence) + desired.y * influence, z: forward.z * (1 - influence) + desired.z * influence });
  const viewLength = length(sub(routeTarget, position)), desiredTarget = copy(position);
  for (const k of ['x', 'y', 'z']) desiredTarget[k] += unit[k] * viewLength;
  return { desiredTarget, ids: best.members.map(row => row.a.id), groupId: group(best.leader.a), category: best.leader.category, score: best.score,
    stats: { ...empty.stats, selectedCount: best.members.length, maxDistanceM: Math.max(...best.members.map(row => row.distanceM)),
      angularSizeRange: [Math.min(...best.members.map(row => row.angularSize)), Math.max(...best.members.map(row => row.angularSize))] } };
}

export class OceanAnimalEncounters {
  constructor() { this.reset(); }
  reset() { this._elapsedSec = null; this._selected = null; this._blocked = []; this._blockedUntil = 0; this._offset = { x: 0, y: 0, z: 0 };
    this._stats = { ids: [], groupId: null, category: null, candidateCount: 0, selectedCount: 0, scope: 'local-live-record-angular-estimate' }; }
  stats() { return structuredClone(this._stats); }
  update({ frame, agents, catalog, activeOwnerIds, elapsedSec, paused = false, ecologyAvailable = true,
    visibilityM = 14, fovDeg = 49, aspect = 1, candidateClearance = null } = {}) {
    if (!frame || !point(frame.position) || !point(frame.target)) { this.reset(); return frame; }
    const base = { ...frame, position: copy(frame.position), target: copy(frame.target) };
    const fallback = () => { this.reset(); return { ...base, encounter: this.stats() }; };
    if (distance(frame.position, frame.target) < .01) return fallback();
    if (paused || !ecologyAvailable || !Number.isFinite(elapsedSec) || elapsedSec <= 6 || !Array.isArray(agents)) return fallback();
    if (this._elapsedSec !== null && elapsedSec < this._elapsedSec) this.reset();
    const owners = activeOwnerIds instanceof Set ? activeOwnerIds : new Set(activeOwnerIds ?? []);
    const dt = this._elapsedSec === null ? 0 : clamp(elapsedSec - this._elapsedSec, 0, .5); this._elapsedSec = elapsedSec;
    // Death/unload clears selected IDs immediately. Any old direction offset
    // relaxes back toward the current route; it never reads an absent animal.
    const liveIds = new Set(agents.filter(a => a.alive === true && a.state !== 'dead' && owners.has(a.regionId)).map(a => a.id));
    if (this._selected?.ids.some(id => !liveIds.has(id))) {
      this._blocked = this._selected.ids; this._blockedUntil = elapsedSec + 2; this._selected = null;
    }
    if (this._selected && elapsedSec - this._selected.sinceSec >= 5) {
      this._blocked = this._selected.ids; this._blockedUntil = elapsedSec + 2; this._selected = null;
    }
    if (elapsedSec >= this._blockedUntil) this._blocked = [];
    const options = { position: frame.position, routeTarget: frame.target, agents, catalog, activeOwnerIds: owners,
      visibilityM, fovDeg, aspect, candidateClearance, excludeIds: this._blocked };
    let sample;
    if (this._selected) {
      sample = sampleOceanAnimalEncounter({ ...options, agents: agents.filter(a => this._selected.groupId
        ? group(a) === this._selected.groupId : !group(a) && this._selected.ids.includes(a.id)) });
      if (!sample.ids.length) { this._blocked = this._selected.ids; this._blockedUntil = elapsedSec + 2; this._selected = null; }
      else this._selected.ids = [...sample.ids];
    } else {
      sample = sampleOceanAnimalEncounter(options);
      if (sample.ids.length) this._selected = { ids: [...sample.ids], groupId: sample.groupId, sinceSec: elapsedSec };
    }
    // Keep the short release interval even if this window contains only the
    // community just observed; gradually return to the route without a cut.
    if (!sample.ids.length) this._selected = null;
    const blend = smooth((elapsedSec - 6) / 2), desiredOffset = sub(sample.desiredTarget, frame.target), alpha = 1 - Math.exp(-dt * 1.6);
    for (const k of ['x', 'y', 'z']) this._offset[k] += (desiredOffset[k] * blend - this._offset[k]) * alpha;
    // Apply the small direction offset to this frame's route target rather
    // than retaining a previous absolute target or modifying the safe path.
    for (const k of ['x', 'y', 'z']) base.target[k] += this._offset[k];
    const original = direction(sub(frame.target, frame.position)), adjusted = direction(sub(base.target, frame.position)),
      adjustedAngle = Math.acos(clamp(dot(original, adjusted), -1, 1));
    if (adjustedAngle > radians(18)) {
      const t = radians(18) / adjustedAngle, unit = direction({ x: original.x * (1 - t) + adjusted.x * t,
        y: original.y * (1 - t) + adjusted.y * t, z: original.z * (1 - t) + adjusted.z * t }), viewLength = distance(frame.position, frame.target);
      for (const k of ['x', 'y', 'z']) base.target[k] = frame.position[k] + unit[k] * viewLength;
    }
    this._stats = { ...sample.stats, ids: [...sample.ids], groupId: sample.groupId, category: sample.category };
    return { ...base, encounter: this.stats() };
  }
}
