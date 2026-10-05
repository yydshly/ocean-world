import { isLivingShallowsSeed } from './livingShallows.js';

export const LIVING_DISCOVERY_LIMIT = 64;
export const LIVING_DISCOVERY_RADIUS_M = 5.5;
const labels = { driftwood: '海床沉木', bottle: '沉底旧瓶' };
const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const valid = row => row && typeof row.id === 'string' && row.id.startsWith(`living-${row.kind}:`) &&
  Object.hasOwn(labels, row.kind) && point(row.position) && Number.isFinite(row.discoveredAtSec) && row.discoveredAtSec >= 0;

// Only actual loaded descriptors are candidates. Saved marks never create,
// relocate or change the rigid props, terrain or ecological individuals.
export function livingDiscoveryCandidates(generator, chunkIds, observer) {
  if (!point(observer) || !isLivingShallowsSeed(generator?.seed)) return [];
  const seen = new Set(), result = [];
  for (const id of chunkIds ?? []) {
    const [cx, cz] = String(id).split(',').map(Number);
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) continue;
    for (const element of generator.chunk(cx, cz).elements) {
      if (!Object.hasOwn(labels, element.kind) || seen.has(element.id)) continue;
      const position = { x: element.x, y: element.y, z: element.z };
      if (!point(position)) continue;
      const distanceM = distance(observer, position);
      if (distanceM > 128) continue;
      seen.add(element.id);
      result.push({ id: element.id, kind: element.kind, title: labels[element.kind], position,
        lengthM: element.scale.x, physicalState: element.physicalState, distanceM });
    }
  }
  return result.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
}

export function createLivingDiscoveries(seed, options = {}) {
  if (!isLivingShallowsSeed(seed)) throw new TypeError('Discovery marks require the versioned shallow-sea world.');
  const key = `tidal-living-discoveries-v1:${seed}`;
  let rows = [], status = 'saved', storage, writable = true;
  try {
    storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    if (!storage) status = 'session-only';
    const raw = storage?.getItem(key);
    if (raw != null) {
      const value = JSON.parse(raw);
      if (value?.version !== 1 || value.seed !== seed || !Array.isArray(value.records) ||
        value.records.length > LIVING_DISCOVERY_LIMIT || !value.records.every(valid) ||
        new Set(value.records.map(row => row.id)).size !== value.records.length) {
        status = 'invalid'; writable = false;
      } else rows = structuredClone(value.records);
    }
  } catch { status = 'session-only'; writable = false; }
  const save = () => {
    if (!storage || !writable) return false;
    try { storage.setItem(key, JSON.stringify({ version: 1, seed, records: rows })); status = 'saved'; return true; }
    catch { status = 'session-only'; return false; }
  };
  return {
    get status() { return status; },
    get records() { return structuredClone(rows); },
    has(id) { return rows.some(row => row.id === id); },
    observe(candidates, observer, timeSec) {
      if (!point(observer) || !Number.isFinite(timeSec) || timeSec < 0) return [];
      const added = [];
      for (const candidate of candidates) {
        if (!candidate || !Object.hasOwn(labels, candidate.kind) || !point(candidate.position) ||
          distance(candidate.position, observer) > LIVING_DISCOVERY_RADIUS_M || rows.some(row => row.id === candidate.id)) continue;
        const record = { id: candidate.id, kind: candidate.kind, position: { ...candidate.position }, discoveredAtSec: timeSec };
        if (!valid(record)) continue;
        rows.push(record); added.push(record);
      }
      if (added.length) { rows = rows.slice(-LIVING_DISCOVERY_LIMIT); save(); }
      return structuredClone(added);
    },
  };
}
