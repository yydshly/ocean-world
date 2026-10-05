import { isLivingShallowsSeed } from './livingShallows.js';

const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24] };
const inputSeedKey = 'tidal-living-input-seed-v1';
const validInputSeed = seed => typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed));
export function loadLivingInputSeed(options = {}) {
  try {
    const storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(inputSeedKey) ?? 'null');
    return saved?.version === 1 && validInputSeed(saved.seed) ? saved.seed : '42';
  } catch { return '42'; }
}
export function saveLivingInputSeed(seed, options = {}) {
  if (!validInputSeed(seed)) return false;
  try {
    const storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(inputSeedKey, JSON.stringify({ version: 1, seed }));
    return true;
  } catch { return false; }
}
export function normalizeLivingWorldState(value) {
  if (!value || value.version !== 1 || !Number.isFinite(value.timeSec) || value.timeSec < 0) return null;
  const environment = {};
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const number = value.environment?.[name];
    if (!Number.isFinite(number) || number < min || number > max || (name === 'hour' && number === 24)) return null;
    environment[name] = number;
  }
  return { version: 1, timeSec: value.timeSec, environment };
}

// World forcing is separate from the local food/population records. Synchronous
// pause/pagehide writes preserve the selected hour; unavailable storage is honest.
export function createLivingWorldState(seed, options = {}) {
  if (!isLivingShallowsSeed(seed)) throw new TypeError('World state requires a versioned shallow-sea seed.');
  const key = `tidal-world-forcing-v1:${seed}`;
  let status = 'saved';
  let storage;
  try { storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage; }
  catch { status = 'session-only'; }
  return {
    get status() { return status; },
    load() {
      try {
        if (!storage) { status = 'session-only'; return null; }
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const state = normalizeLivingWorldState(JSON.parse(raw));
        if (!state) status = 'invalid';
        return state;
      } catch { status = 'session-only'; return null; }
    },
    save(value) {
      const state = normalizeLivingWorldState(value);
      if (!state) return false;
      try {
        if (!storage) { status = 'session-only'; return false; }
        storage.setItem(key, JSON.stringify(state)); status = 'saved'; return true;
      } catch { status = 'session-only'; return false; }
    },
  };
}
