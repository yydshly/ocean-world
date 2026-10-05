import test from 'node:test';
import assert from 'node:assert/strict';
import { livingShallowsSeed, isLivingShallowsSeed } from '../src/livingShallows.js';
import { createLivingWorldState, normalizeLivingWorldState, loadLivingInputSeed, saveLivingInputSeed } from '../src/livingWorldState.js';

const state = { version: 1, timeSec: 901.25, environment: { currentMps: 0.17, turbidity: 0.34, foodSupply: 1.2, hour: 17.25 } };
function memoryStorage() {
  const records = new Map();
  return { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
}

test('refresh restores the applied input seed and preserves string versus number identities', () => {
  const storage = memoryStorage();
  assert.equal(loadLivingInputSeed({ storage }), '42');
  for (const seed of ['91', 42, '']) {
    assert.equal(saveLivingInputSeed(seed, { storage }), true);
    assert.equal(loadLivingInputSeed({ storage }), seed);
    assert.equal(livingShallowsSeed(loadLivingInputSeed({ storage })), livingShallowsSeed(seed));
  }
  assert.equal(saveLivingInputSeed(Infinity, { storage }), false);
  assert.equal(saveLivingInputSeed('91', { storage: null }), false);
});

test('new scene forcing survives a new store without crossing typed seeds or legacy worlds', () => {
  const storage = memoryStorage();
  const seed = livingShallowsSeed('42');
  assert.equal(createLivingWorldState(seed, { storage }).save(state), true);
  assert.deepEqual(createLivingWorldState(seed, { storage }).load(), state);
  assert.equal(createLivingWorldState(livingShallowsSeed(42), { storage }).load(), null);
  assert.throws(() => createLivingWorldState('42', { storage }), TypeError);
  assert.equal(livingShallowsSeed(seed), seed);
  assert.equal(isLivingShallowsSeed('42'), false);
});

test('malformed time and environmental records are rejected without silently supplying new defaults', () => {
  for (const malformed of [null, { ...state, version: 2 }, { ...state, timeSec: -1 }, { ...state, environment: { ...state.environment, hour: 24 } }, { ...state, environment: { ...state.environment, foodSupply: NaN } }]) {
    assert.equal(normalizeLivingWorldState(malformed), null);
  }
  const storage = { getItem: () => JSON.stringify({ ...state, timeSec: -1 }) };
  const store = createLivingWorldState(livingShallowsSeed('42'), { storage });
  assert.equal(store.load(), null);
  assert.equal(store.status, 'invalid');
});

test('denied storage keeps a usable session instead of blocking scene creation', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  const store = createLivingWorldState(livingShallowsSeed('42'), { storage });
  assert.equal(store.load(), null);
  assert.equal(store.save(state), false);
  assert.equal(store.status, 'session-only');
  const absent = createLivingWorldState(livingShallowsSeed('42'), { storage: null });
  assert.equal(absent.save(state), false);
  assert.equal(absent.status, 'session-only');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('SecurityError'); } });
  try {
    const restricted = createLivingWorldState(livingShallowsSeed('42'));
    assert.equal(restricted.load(), null);
    assert.equal(restricted.status, 'session-only');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
