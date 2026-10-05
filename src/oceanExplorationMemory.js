import { OCEAN_CHUNK_SIZE, OCEAN_SURFACE_Y } from './oceanGeneration.js';
import { OCEAN_OBSERVATION_LAYERS } from './oceanLayerNavigation.js';

// Camera notes have their own namespace; they never own ecological records.
export const OCEAN_OBSERVATION_POINT_LIMIT = 12;
const namespace = 'continuous-ocean-observation-v1:';
const layers = new Set([...OCEAN_OBSERVATION_LAYERS.map(layer => layer.id), 'free']);
const emptyState = () => ({ version: 1, last: null, points: [], nextId: 1 });
const clone = value => JSON.parse(JSON.stringify(value));
const text = (value, limit) => Array.from(value.trim()).slice(0, limit).join('');

function safeHorizontal(value) {
  if (!Number.isFinite(value)) return false;
  const chunk = Math.floor(value / OCEAN_CHUNK_SIZE);
  // The loaded neighbourhood also needs representable integer identities.
  // This is a numerical guard, not an authored outer ocean boundary.
  return Number.isSafeInteger(chunk - 1) && Number.isSafeInteger(chunk + 1);
}

function vector(value) {
  if (!value) return null;
  const { x, y, z } = value;
  if (!safeHorizontal(x) || !Number.isFinite(y) || !safeHorizontal(z)) return null;
  return { x, y, z };
}

export function normalizeOceanObservationView(value) {
  try {
    if (!value) return null;
    const { layer, freeDepthM, habitat } = value;
    if (!layers.has(layer) || !Number.isFinite(freeDepthM) ||
        freeDepthM < 0 || typeof habitat !== 'string') return null;
    const position = vector(value.position), target = vector(value.target);
    if (!position || !target || (position.x === target.x && position.y === target.y && position.z === target.z)) return null;
    return { position, target, layer, freeDepthM, habitat: text(habitat, 64) };
  } catch {
    return null;
  }
}

// Diagnostics expose camera target in the current floating render frame.
// Store logical world coordinates so revisits survive origin rebasing.
export function oceanObservationView(snapshot) {
  try {
    const ocean = snapshot?.ocean, camera = snapshot?.camera;
    const position = ocean?.worldPosition, target = camera?.target, origin = ocean?.renderOrigin;
    if (!Array.isArray(position) || position.length !== 3 || !Array.isArray(target) || target.length !== 3 ||
        !Array.isArray(camera?.position) || camera.position.length !== 3 ||
        !Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) return null;
    const surfaceY = snapshot.surfaceY ?? OCEAN_SURFACE_Y;
    if (!Number.isFinite(surfaceY) || !Number.isFinite(camera.position[1])) return null;
    return normalizeOceanObservationView({
      position: { x: position[0], y: position[1], z: position[2] },
      target: { x: target[0] + origin.x, y: target[1], z: target[2] + origin.z },
      layer: ocean.observationLayer ?? 'bed',
      freeDepthM: Math.max(0, surfaceY - camera.position[1]),
      habitat: ocean.habitat,
    });
  } catch {
    return null;
  }
}

function normalizeState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.points) ||
      value.points.length > OCEAN_OBSERVATION_POINT_LIMIT ||
      !Number.isSafeInteger(value.nextId) || value.nextId < 1 || value.nextId >= Number.MAX_SAFE_INTEGER) return emptyState();
  const last = value.last === null ? null : normalizeOceanObservationView(value.last);
  if (value.last !== null && !last) return emptyState();
  const points = [], ids = new Set();
  for (const item of value.points) {
    const match = typeof item?.id === 'string' && /^point:([1-9]\d*)$/.exec(item.id);
    const index = match ? Number(match[1]) : NaN;
    const view = normalizeOceanObservationView(item?.view);
    if (!Number.isSafeInteger(index) || index >= value.nextId || ids.has(item.id) ||
        !view || typeof item.label !== 'string') return emptyState();
    ids.add(item.id);
    points.push({ id: item.id, label: text(item.label, 32) || text(`${view.habitat || '海域'}观察点`, 32), view });
  }
  return { version: 1, last, points, nextId: value.nextId };
}

export function createOceanExplorationMemory(seed, options = {}) {
  if ((typeof seed !== 'number' && typeof seed !== 'string') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('The ocean observation seed must be a finite number or a string.');
  }
  const biome = options.biome ?? 'reef';
  if (!['reef', 'kelp', 'deep'].includes(biome)) throw new TypeError('Unknown continuous observation biome.');
  const key = `${biome === 'deep' ? 'continuous-deep-observation-v1:' : biome === 'kelp' ? 'continuous-kelp-observation-v1:' : namespace}${typeof seed}:${seed}`;
  let storage, available = false, initialized = false, state = emptyState();
  try {
    // Even accessing localStorage can throw in a restricted browser context.
    storage = options.storage === undefined ? globalThis.localStorage : options.storage;
    available = Boolean(storage && ['getItem', 'setItem', 'removeItem'].every(method => typeof storage[method] === 'function'));
  } catch {
    available = false;
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    if (!available) return;
    let raw;
    try { raw = storage.getItem(key); }
    catch { available = false; return; }
    if (raw === null) return;
    try { state = normalizeState(JSON.parse(raw)); }
    catch { state = emptyState(); }
  }
  function result(ok, reason, point) {
    return { ok, ...(reason ? { reason } : {}), ...(point ? { point: clone(point) } : {}), state: clone(state) };
  }
  function persist(point) {
    if (available) {
      try { storage.setItem(key, JSON.stringify(state)); }
      catch { available = false; }
    }
    return available ? result(true, null, point) : result(false, 'unavailable', point);
  }
  return {
    get available() { return available; },
    get status() { return available ? 'saved' : 'session-only'; },
    load() { initialize(); return clone(state); },
    remember(value) {
      initialize();
      const view = normalizeOceanObservationView(value);
      if (!view) return result(false, 'invalid');
      if (JSON.stringify(state.last) === JSON.stringify(view)) {
        return available ? result(true) : result(false, 'unavailable');
      }
      state.last = view;
      return persist();
    },
    mark(value, label) {
      initialize();
      const view = normalizeOceanObservationView(value);
      if (!view) return result(false, 'invalid');
      if (state.points.length >= OCEAN_OBSERVATION_POINT_LIMIT) return result(false, 'full');
      if (state.nextId >= Number.MAX_SAFE_INTEGER - 1) return result(false, 'invalid');
      const point = { id: `point:${state.nextId++}`,
        label: (typeof label === 'string' ? text(label, 32) : '') || text(`${view.habitat || '海域'}观察点`, 32), view };
      state.points.push(point);
      return persist(point);
    },
    remove(id) {
      initialize();
      const index = state.points.findIndex(point => point.id === id);
      if (index < 0) return available ? result(true) : result(false, 'unavailable');
      state.points.splice(index, 1);
      return persist();
    },
    clear() {
      initialize();
      state = emptyState();
      if (available) {
        try { storage.removeItem(key); }
        catch { available = false; }
      }
      return available ? result(true) : result(false, 'unavailable');
    },
  };
}
