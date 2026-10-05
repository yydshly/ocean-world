import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanExplorationMemory, normalizeOceanObservationView, oceanObservationView,
  OCEAN_OBSERVATION_POINT_LIMIT } from '../src/oceanExplorationMemory.js';

const makeView = (x = 273.25, z = -92.75) => ({ position: { x, y: -5, z },
  target: { x: x + 8, y: -7, z: z - 3 }, layer: 'free', freeDepthM: 13, habitat: 'slope' });
const empty = () => ({ version: 1, last: null, points: [], nextId: 1 });
const key = seed => `continuous-ocean-observation-v1:${typeof seed}:${seed}`;
function fakeStorage(entries = []) {
  const data = new Map(entries), calls = [];
  return { data, calls,
    getItem(id) { calls.push(['get', id]); return data.get(id) ?? null; },
    setItem(id, value) { calls.push(['set', id]); data.set(id, value); },
    removeItem(id) { calls.push(['remove', id]); data.delete(id); },
  };
}

test('snapshot conversion stores logical target across floating origins and all actual camera layers', () => {
  for (const layer of ['bed', 'midwater', 'surface', 'free']) {
    const snapshot = { ocean: { worldPosition: [273.25, -5, -92.75], renderOrigin: { x: 256, z: -128 },
      observationLayer: layer, habitat: 'slope' }, camera: { position: [17.25, -5, 35.25], target: [25.25, -7, 32.25] } };
    const before = structuredClone(snapshot);
    assert.deepEqual(oceanObservationView(snapshot), { ...makeView(), layer });
    assert.deepEqual(snapshot, before);
    const shifted = structuredClone(snapshot);
    shifted.ocean.renderOrigin = { x: -256, z: 256 };
    shifted.camera.position = [529.25, -5, -348.75];
    shifted.camera.target = [537.25, -7, -351.75];
    assert.deepEqual(oceanObservationView(shifted), { ...makeView(), layer });
  }
  assert.equal(oceanObservationView(null), null);
  assert.equal(oceanObservationView({ ocean: { worldPosition: [0, 0, 0] }, camera: { target: [1, 0, 0] } }), null);
});

test('view normalization removes unknown fields and accepts distant safe logical coordinates without imposing a map boundary', () => {
  const source = { ...makeView(1e12 + .25, -1e12 - .75), habitat: '  slope  ', private: 'discard',
    position: { x: 1e12 + .25, y: -1000000, z: -1e12 - .75, id: 'discard' } };
  assert.deepEqual(normalizeOceanObservationView(source), { ...makeView(1e12 + .25, -1e12 - .75),
    habitat: 'slope', position: { x: 1e12 + .25, y: -1000000, z: -1e12 - .75 } });
  const extremeY = makeView(); extremeY.position.y = Number.MAX_VALUE;
  assert.equal(normalizeOceanObservationView(extremeY).position.y, Number.MAX_VALUE,
    'vertical terrain and surface safety is resolved by the world, not the camera-note store');
});

test('invalid views cannot produce degenerate or numerically unsafe navigation', () => {
  for (const value of [null, {}, { ...makeView(), layer: 'unknown' }, { ...makeView(), freeDepthM: -1 },
    { ...makeView(), freeDepthM: '13' }, { ...makeView(), habitat: null },
    { ...makeView(), target: { ...makeView().position } }]) assert.equal(normalizeOceanObservationView(value), null);
  for (const component of ['position', 'target']) {
    for (const coordinate of ['x', 'y', 'z']) {
      for (const value of [NaN, Infinity, -Infinity, '8', null]) {
        const view = makeView(); view[component][coordinate] = value;
        assert.equal(normalizeOceanObservationView(view), null, `${component}.${coordinate}:${value}`);
      }
    }
    for (const coordinate of ['x', 'z']) {
      const view = makeView(); view[component][coordinate] = Number.MAX_SAFE_INTEGER * 64;
      assert.equal(normalizeOceanObservationView(view), null, 'unsafe neighbouring chunk identities are rejected');
    }
  }
  assert.equal(normalizeOceanObservationView({ get layer() { throw new Error('hostile accessor'); } }), null);
});

test('loads are readonly and missing, malformed or structurally corrupt JSON yields a safe empty state', () => {
  const corrupt = [null, '[1,2]', '{broken', JSON.stringify({ ...empty(), version: 2 }),
    JSON.stringify({ ...empty(), last: {} }), JSON.stringify({ ...empty(), nextId: 0 }),
    JSON.stringify({ ...empty(), points: [{ id: 'point:1', label: 'a', view: makeView() }] }),
    JSON.stringify({ ...empty(), nextId: 3, points: [{ id: 'point:1', label: 'a', view: makeView() },
      { id: 'point:1', label: 'b', view: makeView() }] }),
    JSON.stringify({ ...empty(), nextId: 99, points: Array.from({ length: 13 }, (_, index) =>
      ({ id: `point:${index + 1}`, label: 'a', view: makeView() })) })];
  for (const raw of corrupt) {
    const storage = fakeStorage(raw === null ? [] : [[key('42'), raw]]);
    const memory = createOceanExplorationMemory('42', { storage });
    assert.deepEqual(memory.load(), empty());
    assert.equal(memory.available, true);
    assert.deepEqual(memory.load(), empty());
    assert.deepEqual(storage.calls, [['get', key('42')]], 'no corruption repair or implicit save on read');
  }
});

test('valid saved notes restore sanitized records while leaving the original serialized value untouched', () => {
  const state = { ...empty(), last: { ...makeView(), extension: 1 }, nextId: 2, extension: true,
    points: [{ id: 'point:1', label: '  远处坡地  ', view: { ...makeView(), extension: 'drop' }, extension: 'drop' }] };
  const raw = JSON.stringify(state), storage = fakeStorage([[key('42'), raw]]);
  const restored = createOceanExplorationMemory('42', { storage }).load();
  assert.deepEqual(restored, { version: 1, last: makeView(), nextId: 2,
    points: [{ id: 'point:1', label: '远处坡地', view: makeView() }] });
  assert.equal(storage.data.get(key('42')), raw);
});

test('numeric and string seeds are isolated; clear and remove never delete another seed or ecological keys', () => {
  const ecologyKey = 'continuous-ocean-ecology-v1:any-record';
  const storage = fakeStorage([[ecologyKey, 'ecology untouched']]);
  const numeric = createOceanExplorationMemory(42, { storage }), string = createOceanExplorationMemory('42', { storage });
  numeric.mark(makeView(100, 100), 'numeric'); string.mark(makeView(-100, -100), 'string');
  numeric.remember(makeView(101, 101)); string.remember(makeView(-101, -101));
  assert.equal(numeric.remove('point:1').ok, true);
  assert.equal(string.load().points.length, 1);
  assert.equal(numeric.clear().ok, true);
  assert.equal(storage.data.has(key(42)), false);
  assert.equal(storage.data.has(key('42')), true);
  assert.equal(storage.data.get(ecologyKey), 'ecology untouched');
  assert.ok(storage.calls.every(([, id]) => id === key(42) || id === key('42')));
});

test('remember updates only the last view; marks trim labels and apply a bounded Unicode-safe fallback', () => {
  const storage = fakeStorage(), memory = createOceanExplorationMemory('42', { storage });
  const first = memory.mark(makeView(), '  礁区观察  ');
  assert.equal(first.point.label, '礁区观察');
  assert.equal(first.state.last, null);
  const beforePoints = structuredClone(first.state.points);
  const last = makeView(500, -500);
  assert.deepEqual(memory.remember(last).state, { version: 1, last, points: beforePoints, nextId: 2 });
  const writes = storage.calls.length;
  const unchanged = memory.remember({ ...last, extension: 'ignored', habitat: '  slope  ' });
  assert.equal(unchanged.ok, true);
  assert.equal(storage.calls.length, writes, 'stationary normalized last views do not rewrite localStorage');
  unchanged.state.last.position.x = -500;
  assert.deepEqual(memory.load().last, last, 'deduplicated returns are still independent clones');
  assert.equal(memory.mark(makeView(), '  ').point.label, 'slope观察点');
  const long = memory.mark(makeView(), `  ${'🐟'.repeat(40)}  `).point.label;
  assert.equal(Array.from(long).length, 32);
  assert.equal(long, '🐟'.repeat(32));
  const fallback = memory.mark({ ...makeView(), habitat: '珊'.repeat(64) }).point.label;
  assert.equal(Array.from(fallback).length, 32);
});

test('the twelve-point cap preserves existing notes without writes; removing a point leaves stable monotonic identities', () => {
  const storage = fakeStorage(), memory = createOceanExplorationMemory('42', { storage });
  assert.equal(OCEAN_OBSERVATION_POINT_LIMIT, 12);
  for (let index = 0; index < 12; index++) assert.equal(memory.mark(makeView(index * 64, index * 64)).ok, true);
  const full = memory.load(), writes = storage.calls.length;
  assert.deepEqual(memory.mark(makeView(1000, 1000), 'overflow'), { ok: false, reason: 'full', state: full });
  assert.equal(storage.calls.length, writes);
  assert.equal(memory.remove('point:4').ok, true);
  const replacement = memory.mark(makeView(1000, 1000), 'replacement');
  assert.equal(replacement.point.id, 'point:13');
  assert.equal(replacement.state.points.length, 12);
  assert.equal(replacement.state.nextId, 14);
  assert.equal(replacement.state.points.filter(point => point.id === 'point:13').length, 1);
  assert.deepEqual(replacement.state.points.slice(0, 3), full.points.slice(0, 3));
});

test('all inputs and returned state are independent clones; invalid requests preserve local and durable data', () => {
  const storage = fakeStorage(), memory = createOceanExplorationMemory('42', { storage }), source = makeView();
  const marked = memory.mark(source, 'a'); source.position.x = 999;
  marked.point.view.position.x = 777; marked.state.points[0].view.position.x = 888;
  const read = memory.load(); read.points[0].label = 'modified';
  assert.deepEqual(memory.load().points, [{ id: 'point:1', label: 'a', view: makeView() }]);
  const before = memory.load(), raw = storage.data.get(key('42')), writes = storage.calls.length;
  assert.deepEqual(memory.remember({}), { ok: false, reason: 'invalid', state: before });
  assert.deepEqual(memory.mark({}), { ok: false, reason: 'invalid', state: before });
  assert.equal(memory.remove('absent').ok, true);
  assert.equal(storage.calls.length, writes);
  assert.equal(storage.data.get(key('42')), raw);
});

test('a denied read enters session-only mode and later actions retain coherent local notes without claiming saved storage', () => {
  let reads = 0, writes = 0;
  const storage = { getItem() { reads++; throw new Error('denied'); },
    setItem() { writes++; }, removeItem() { throw new Error('denied'); } };
  const memory = createOceanExplorationMemory('42', { storage });
  assert.deepEqual(memory.load(), empty());
  assert.equal(memory.available, false); assert.equal(memory.status, 'session-only');
  const marked = memory.mark(makeView(), 'temporary');
  assert.equal(marked.ok, false); assert.equal(marked.reason, 'unavailable'); assert.equal(marked.state.points.length, 1);
  assert.deepEqual(marked.point, marked.state.points[0], 'session-only marks return the actual appended point to the UI');
  assert.deepEqual(memory.remember(makeView()).state.last, makeView());
  assert.equal(memory.remember(makeView()).reason, 'unavailable', 'deduplicated session state does not claim persistence');
  assert.equal(memory.remove('point:1').state.points.length, 0);
  assert.deepEqual(memory.clear(), { ok: false, reason: 'unavailable', state: empty() });
  assert.deepEqual(memory.load(), empty()); assert.equal(reads, 1); assert.equal(writes, 0);
});

test('quota or deletion failure keeps a consistent session state and leaves the old durable value intact', () => {
  const storage = fakeStorage(), memory = createOceanExplorationMemory('42', { storage });
  memory.mark(makeView(), 'durable');
  const durable = storage.data.get(key('42'));
  storage.setItem = () => { throw new Error('quota'); };
  const result = memory.remember(makeView(900, -900));
  assert.equal(result.ok, false); assert.equal(result.reason, 'unavailable'); assert.equal(memory.available, false);
  assert.deepEqual(memory.load().last, makeView(900, -900));
  assert.equal(memory.load().points[0].label, 'durable');
  assert.equal(storage.data.get(key('42')), durable);
  const temporaryPoint = memory.mark(makeView(901, -901), 'temporary');
  assert.equal(temporaryPoint.reason, 'unavailable');
  assert.deepEqual(temporaryPoint.point, temporaryPoint.state.points[1]);
  assert.equal(memory.clear().state.points.length, 0);
  assert.equal(storage.data.get(key('42')), durable, 'session clear does not claim failed storage was erased');

  const deleting = fakeStorage([[key('other'), durable]]), other = createOceanExplorationMemory('other', { storage: deleting });
  deleting.removeItem = () => { throw new Error('delete denied'); };
  assert.deepEqual(other.clear(), { ok: false, reason: 'unavailable', state: empty() });
  assert.equal(deleting.data.get(key('other')), durable);
});

test('absent storage supports explicit temporary notes, with no implicit writes or uncaught method failures', () => {
  for (const storage of [null, {}, { getItem: true }]) {
    const memory = createOceanExplorationMemory('42', { storage });
    assert.equal(memory.available, false);
    const result = memory.mark(makeView());
    assert.equal(result.reason, 'unavailable'); assert.equal(result.state.points.length, 1);
    assert.deepEqual(memory.load(), result.state);
  }
  assert.throws(() => createOceanExplorationMemory(Infinity, { storage: null }), TypeError);
  assert.throws(() => createOceanExplorationMemory({}, { storage: null }), TypeError);
});
