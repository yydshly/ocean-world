import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { computeOceanPlanktonTransport } from '../src/oceanPlanktonTransport.js';

const SEED = '42', WORLD = 'ecology-v1:string:42', SOURCE = '4,-2', DESTINATION = '5,-2';
const CENTER = { x: 288, z: -96 }, FAR = { x: 2048, z: 2048 };
const BASE = { currentMps: .5, foodSupply: 0, turbidity: 0, hour: 12 };
const clone = value => structuredClone(value);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${label}: expected ${expected}, received ${actual}`);
const raw = (cx, cz, plankton = 0) => ({ id: `${cx},${cz}`, cx, cz, resources: { plankton } });
const flow = (regions, x = .5, z = 0, extra = {}) => computeOceanPlanktonTransport(regions,
  { dt: .1, cellSizeM: 64, currentAt: () => ({ x, z }), ...extra });
const sent = (result, fromId, toId) => result.transfers.filter(item => item.fromId === fromId && item.toId === toId)
  .reduce((total, item) => total + item.amount, 0);
const exited = (result, fromId) => result.exports.filter(item => item.fromId === fromId).reduce((total, item) => total + item.amount, 0);

class MemoryStore {
  available = true; records = new Map(); batches = []; singles = [];
  async load(world, id) { await this.onLoad?.(world, id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) {
    const snapshot = clone(record), result = await this.onSave?.(world, id, snapshot); if (result === null) return null;
    this.records.set(`${world}|${id}`, snapshot); this.singles.push({ world, id, record: clone(snapshot) });
  }
  async saveMany(world, entries) {
    const snapshot = entries.map(([id, record]) => [id, clone(record)]); this.batches.push({ world, records: clone(snapshot) });
    const result = await this.onBatch?.(world, snapshot); if (result === null) return null;
    const next = new Map(this.records); for (const [id, record] of snapshot) next.set(`${world}|${id}`, record); this.records = next;
  }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function gateNextBatch(store) {
  const entered = deferred(), release = deferred();
  store.onBatch = async () => { store.onBatch = null; entered.resolve(); await release.promise; };
  return { entered: entered.promise, release: release.resolve };
}
function stock(region, plankton) {
  region.resources = { algae: .2, plankton, detritus: .3 };
  region.ledger = { initial: .5 + plankton, input: 0, ingested: 0, exported: 0 };
  region.events = []; region.agents = [];
}
function desiredWindow(ecology, cx, cz) {
  ecology._center = { cx, cz }; ecology._planktonDesiredRegions = new Set();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ecology._planktonDesiredRegions.add(`${cx + dx},${cz + dz}`);
}
function fixture({ reverse = false, upgrade = true, legacy = false, sourceStock = .8, destinationStock = 0,
  x = .5, z = 0, store = new MemoryStore() } = {}) {
  const generator = createOceanGenerator(SEED), ecology = new OceanEcology(SEED, generator, { store });
  const source = ecology._createRegion(4, -2), destination = ecology._createRegion(5, -2);
  stock(source, sourceStock); stock(destination, destinationStock);
  for (const region of [source, destination]) {
    region.slopeCommunityVersion = region.pelagicCommunityVersion = region.mantaCommunityVersion = 1;
    region.timeSec = region.id === SOURCE ? 17.4 : 1220; region.ticks = Math.round(region.timeSec * 10);
  }
  if (legacy) store.saveMany = undefined;
  if (upgrade) { ecology._upgradePlanktonTransport(source); ecology._upgradePlanktonTransport(destination); }
  ecology._active = new Map(reverse ? [[DESTINATION, destination], [SOURCE, source]] : [[SOURCE, source], [DESTINATION, destination]]);
  desiredWindow(ecology, 4, -2);
  ecology.environmentField = { sample: (px, pz, baseline) => ({ currentMps: Math.hypot(x, z), currentVector: { x, z },
    lightAtDepth: 1, foodSupply: baseline.foodSupply, turbidity: 0, hour: baseline.hour, visibilityM: 19 }) };
  return { ecology, generator, source, destination, store };
}
function assertBalance(region) {
  close(region.ledger.initial + region.ledger.input + (region.ledger.transferredIn ?? 0) - region.ledger.ingested - region.ledger.exported - (region.ledger.transferredOut ?? 0),
    Object.values(region.resources).reduce((sum, value) => sum + value, 0), `regional ledger ${region.id}`);
}
function originalFields(actual, before, label) {
  for (const [key, value] of Object.entries(before)) assert.deepEqual(actual[key], value, `${label}: ${key}`);
}

test('signed face flow moves the upwind fraction speed times dt over actual 64m width without mutating input', () => {
  const regions = [raw(4, -2, .8), raw(5, -2, .2)], before = clone(regions);
  const result = flow(regions);
  close(sent(result, SOURCE, DESTINATION), .8 * .5 * .1 / 64, 'upwind donor amount');
  close(sent(result, DESTINATION, SOURCE), 0, 'no reverse donation');
  close(exited(result, DESTINATION), .2 * .5 * .1 / 64, 'only the downwind exterior exports');
  close(exited(result, SOURCE), 0, 'missing upstream supplies no flow');
  assert.deepEqual(regions, before, 'the transport calculation is a common immutable snapshot');
  const doubledTime = flow(regions, .5, 0, { dt: .2 });
  const doubledSpeed = flow(regions, 1, 0);
  close(sent(doubledTime, SOURCE, DESTINATION), 2 * sent(result, SOURCE, DESTINATION), 'time units');
  close(sent(doubledSpeed, SOURCE, DESTINATION), 2 * sent(result, SOURCE, DESTINATION), 'speed units');
});

test('zero, inverse and diagonal X/Z currents have the appropriate signed owners and separate face debits', () => {
  const a = [raw(4, -2, .8), raw(5, -2, .2)];
  const zero = flow(a, 0, 0); close(zero.transferred, 0, 'zero exchange'); close(zero.exported, 0, 'zero exterior loss');
  const west = flow(a, -.5, 0);
  close(sent(west, DESTINATION, SOURCE), .2 * .5 * .1 / 64, 'negative X carries western donor');
  close(exited(west, SOURCE), .8 * .5 * .1 / 64, 'western boundary exterior loss');
  const corner = [raw(4, -2, .8), raw(5, -2, 0), raw(4, -1, 0)];
  const diagonal = flow(corner, .4, .3);
  close(sent(diagonal, SOURCE, DESTINATION), .8 * .4 * .1 / 64, 'X normal component');
  close(sent(diagonal, SOURCE, '4,-1'), .8 * .3 * .1 / 64, 'Z normal component');
  close(exited(diagonal, SOURCE), 0, 'both downwind faces are loaded');
});

test('shared-face current is sampled once at the geographic seam rather than borrowed from either region center', () => {
  const calls = [], regions = [raw(4, -2, .8), raw(5, -2, 0)];
  const result = flow(regions, 0, 0, { currentAt: (x, z) => { calls.push([x, z]); return { x: x === 320 && z === -96 ? .3 : 0, z: 0 }; } });
  close(sent(result, SOURCE, DESTINATION), .8 * .3 * .1 / 64, 'actual shared face velocity');
  assert.equal(calls.filter(([x, z]) => x === 320 && z === -96).length, 1, 'the signed shared face has one velocity');
});

test('a simultaneous snapshot is independent of region order and cannot relay a received pool across two cells in one step', () => {
  const regions = [raw(4, -2, .8), raw(5, -2, 0), raw(6, -2, 0)];
  const forward = flow(regions), reverse = flow([...regions].reverse());
  close(sent(forward, SOURCE, DESTINATION), .000625, 'first face');
  close(sent(forward, DESTINATION, '6,-2'), 0, 'new arrival is unavailable to the second face until next snapshot');
  assert.deepEqual(forward, reverse, 'face order and output order are deterministic');
});

test('opposing face flows never withdraw more than a donor stock and all emitted quantities remain nonnegative', () => {
  const regions = [raw(4, -2, .0000001), raw(5, -2, 0), raw(3, -2, 0), raw(4, -1, 0), raw(4, -3, 0)];
  const result = flow(regions, 0, 0, { dt: 1000, currentAt: (x, z) => ({ x: x < 288 ? -1 : 1, z: z < -96 ? -1 : 1 }) });
  const removed = result.transfers.filter(item => item.fromId === SOURCE).reduce((sum, item) => sum + item.amount, 0) + exited(result, SOURCE);
  assert.ok(removed <= .0000001 + 1e-18);
  for (const item of [...result.transfers, ...result.exports]) assert.ok(Number.isFinite(item.amount) && item.amount >= 0);
});

test('a locked owner isolates both sides of its face and never becomes a substitute exterior sink', () => {
  const regions = [raw(4, -2, .8), raw(5, -2, .2)];
  for (const locked of [SOURCE, DESTINATION]) {
    const result = flow(regions, .5, 0, { lockedRegionIds: new Set([locked]) });
    close(sent(result, SOURCE, DESTINATION), 0, 'locked paired face is sealed');
    close(exited(result, SOURCE), 0, 'a present locked downstream owner is not an unloaded boundary');
    assert.equal(result.transfers.some(item => item.fromId === locked || item.toId === locked), false);
    assert.equal(result.exports.some(item => item.fromId === locked), false);
  }
});

test('shared water-column restrictions scale face flow and a shallow support on the receiving side seals the seam', () => {
  const partial = flow([raw(4, -2, .8), raw(5, -2, 0)], .5, 0, { openFractionAt: () => .25 });
  close(sent(partial, SOURCE, DESTINATION), .8 * .5 * .1 / 64 * .25, 'quarter open face');
  const { ecology, source, destination } = fixture();
  const probes = [];
  // A raised receiving-side ridge leaves only a 1m water column. The centre
  // of the geographic seam is deep, so a centre-only check would leak food.
  ecology._surface = (x, z, includeCoral) => {
    probes.push({ x, z, includeCoral });
    return x > 320.15 && x < 320.35 ? 11 : 0;
  };
  ecology._transportPlankton(BASE);
  close(source.resources.plankton, .8, 'the raised shared support seals cross-face flow');
  close(destination.resources.plankton, 0, 'food cannot pass a sealed water reference');
  assert.ok(probes.some(probe => probe.x > 320.15 && probe.x < 320.35), 'actual receiving-side support was read');
  assert.ok(probes.every(probe => probe.includeCoral === true), 'rocks and attached coral share the ecological support query');
  assertBalance(source); assertBalance(destination);
});

test('transport integration conserves every region and the active-window sum while attributing paired input and output', () => {
  const { ecology, source, destination } = fixture();
  ecology._transportPlankton(BASE);
  close(source.resources.plankton, .8 - .000625, 'source remaining stock');
  close(destination.resources.plankton, .000625, 'actual downstream stock');
  close(source.ledger.transferredOut, .000625, 'source transfer annotation');
  close(destination.ledger.transferredIn, .000625, 'destination transfer annotation');
  close(source.resources.plankton + destination.resources.plankton, .8, 'no hidden off-window input');
  assertBalance(source); assertBalance(destination);
  assert.equal(source.resources.algae, .2); assert.equal(destination.resources.detritus, .3);
});

test('regional capacity overflow is an explicit accounted export rather than a clipped or hidden downstream stock', () => {
  const { ecology, source, destination } = fixture({ destinationStock: 1 });
  // Convergent face field feeds this full owner without an exterior donor loss.
  ecology.environmentField = { sample: (x, z, base) => ({ currentMps: .5, currentVector: { x: x === 320 ? .5 : 0, z: 0 },
    lightAtDepth: 1, foodSupply: base.foodSupply, turbidity: 0, hour: base.hour, visibilityM: 19 }) };
  ecology._transportPlankton(BASE);
  close(source.resources.plankton, .8 - .000625, 'upstream debit survives recipient saturation');
  close(destination.resources.plankton, 1, 'reference capacity retained');
  close(destination.ledger.exported, .000625, 'excess is explicit export');
  close(source.ledger.transferredOut, destination.ledger.transferredIn, 'same paired transfer before overflow');
  assertBalance(source); assertBalance(destination);
});

test('loaded-window exterior exports never mutate a saved unloaded neighbour or create invented inflow', () => {
  const { ecology, store, source, destination } = fixture(); ecology._active.delete(DESTINATION);
  desiredWindow(ecology, 3, -2);
  const offscreen = clone(destination); offscreen.resources.plankton = .73; offscreen.ledger.initial = 1.23;
  store.records.set(`${WORLD}|${DESTINATION}`, offscreen);
  const disk = clone([...store.records]); ecology._transportPlankton(BASE);
  close(source.resources.plankton, .8 - .000625, 'outside-window export');
  close(source.ledger.exported, .000625, 'outside-window export ledger');
  assert.deepEqual([...store.records], disk, 'offscreen ecology has no evolution or deposit');
  assertBalance(source);
});

test('post-local-tick snapshots produce the same stock, clocks and ledger across fixed partitions and Map order', () => {
  const a = fixture(), b = fixture({ reverse: true });
  a.ecology.step(1, BASE); for (let i = 0; i < 60; i++) b.ecology.step(1 / 60, BASE);
  for (const [id, region] of a.ecology._active) assert.deepEqual(region, b.ecology._active.get(id));
  assertBalance(a.source); assertBalance(a.destination);
  close(a.source.timeSec, 18.4, 'source clock advances ordinarily'); close(a.destination.timeSec, 1221, 'destination age retained');
  assert.ok(a.destination.resources.plankton > 0); assert.ok(a.source.resources.plankton < .8);
});

test('downstream fish receive no fabricated intake from an empty local pool and later consume actual transported local stock', () => {
  const { ecology, source, destination } = fixture();
  const schoolRegion = ecology._createRegion(4, -2); schoolRegion.agents = [];
  ecology._supplementPelagicRegion(schoolRegion); assert.equal(schoolRegion.agents.length, 6);
  const fish = clone(schoolRegion.agents[0]);
  fish.regionId = DESTINATION; fish.position = { x: 340, y: 4, z: -96 }; fish.schoolHome = { ...fish.position };
  fish.target = { ...fish.position }; fish.nextBite = 0; fish.energy = .5; fish.lastFeedAt = null;
  destination.agents.push(fish); ecology._pelagicTarget = (region, animal) => ({ ...animal.position });
  ecology.step(.1, BASE);
  assert.equal(fish.lastFeedAt, null, 'fish tick cannot consume transport that has not reached its owner yet');
  assert.equal(destination.ledger.ingested, 0); assert.ok(destination.resources.plankton > 0);
  const upstreamIngested = source.ledger.ingested, previousFood = destination.resources.plankton;
  fish.nextBite = 0; ecology.step(.1, BASE);
  assert.ok(fish.lastFeedAt > 0); assert.ok(destination.ledger.ingested > 0);
  assert.ok(destination.ledger.ingested <= previousFood + 1e-10, 'actual bite cannot debit more than received local stock');
  assert.equal(source.ledger.ingested, upstreamIngested); assertBalance(source); assertBalance(destination);
});

test('one-time optional transfer metadata preserves old ledger shape and every historical field without resetting existing counters', () => {
  const { ecology, source } = fixture({ upgrade: false });
  source.events = [{ id: 'old-feed', timeSec: 8.4, type: 'feeding' }]; source.counters.feeding = 7;
  const before = clone(source); assert.equal(ecology._upgradePlanktonTransport(source), true);
  for (const [key, value] of Object.entries(before)) if (key !== 'ledger') assert.deepEqual(source[key], value);
  assert.deepEqual(source.ledger, before.ledger, 'metadata does not add zero keys or change the historical ledger shape');
  close(source.ledger.transferredIn ?? 0, 0, 'absent incoming counter means zero');
  close(source.ledger.transferredOut ?? 0, 0, 'absent outgoing counter means zero');
  source.ledger.transferredIn = .012; source.ledger.transferredOut = .004;
  const upgraded = clone(source); assert.equal(ecology._upgradePlanktonTransport(source), false); assert.deepEqual(source, upgraded);
  const existing = fixture({ upgrade: false }); existing.source.ledger.transferredIn = .25; existing.source.ledger.transferredOut = .19;
  const old = clone(existing.source); existing.ecology._upgradePlanktonTransport(existing.source);
  originalFields(existing.source.ledger, old.ledger, 'pre-existing optional annotations');
});

test('a non-atomic legacy adapter keeps the original local food exchange formula and does not activate transport metadata', () => {
  const { ecology, source, destination } = fixture({ legacy: true, upgrade: false });
  const before = clone([source, destination]);
  assert.equal(ecology._upgradePlanktonTransport(source), false); assert.deepEqual([source, destination], before);
  ecology.step(.1, BASE);
  close(source.resources.plankton, .8 * (1 - (.0008 + .5 * .003) * .1), 'original local current-loss formula');
  close(destination.resources.plankton, 0, 'no non-atomic inter-region receiver');
  assert.equal(source.planktonTransportVersion, undefined); assert.equal(source.ledger.transferredOut, undefined);
  assertBalance(source); assertBalance(destination);
});

test('restored annotated records preserve prior transfers when an adapter loses atomic capability and falls back to local exchange', async () => {
  const { ecology, source, destination, generator, store } = fixture(); ecology._transportPlankton(BASE);
  await ecology.checkpoint(); const records = clone([source, destination]); store.saveMany = undefined;
  const reopened = new OceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  const currentSource = reopened._active.get(SOURCE), currentDestination = reopened._active.get(DESTINATION);
  assert.deepEqual(currentSource, records[0]); assert.deepEqual(currentDestination, records[1]);
  reopened.environmentField = ecology.environmentField;
  reopened.step(.1, BASE);
  for (const [region, record] of [[currentSource, records[0]], [currentDestination, records[1]]]) {
    close(region.resources.plankton, record.resources.plankton * (1 - (.0008 + .5 * .003) * .1), 'legacy stock loss');
    assert.equal(region.ledger.transferredIn, record.ledger.transferredIn); assert.equal(region.ledger.transferredOut, record.ledger.transferredOut);
    assert.deepEqual(region.planktonTransport, record.planktonTransport, 'saved transfer summary does not become a new non-atomic transfer');
    assertBalance(region);
  }
});

test('checkpoint, zero-step pause, true unload/revisit and reopen retain all transfer history and paired inventories', async () => {
  const { ecology, generator, source, destination, store } = fixture(); ecology.step(.7, BASE);
  const expected = clone([source, destination]); await ecology.checkpoint();
  assert.equal(store.batches.length, 1); assert.equal(store.singles.length, 0);
  ecology.step(0, { ...BASE, currentMps: 0, foodSupply: 3 }); assert.deepEqual([source, destination], expected);
  await ecology.update(FAR); ecology.step(.4, BASE); await ecology.update(CENTER);
  assert.deepEqual(ecology._active.get(SOURCE), expected[0]); assert.deepEqual(ecology._active.get(DESTINATION), expected[1]);
  await ecology.checkpoint();
  const reopened = new OceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  assert.deepEqual(reopened._active.get(SOURCE), expected[0]); assert.deepEqual(reopened._active.get(DESTINATION), expected[1]);
});

test('all-active atomic unload pairs retained and exiting inventories, while rejected writes lock and retain both owners for retry', async () => {
  const { ecology, source, destination, store } = fixture(); ecology.step(.1, BASE); await ecology.checkpoint();
  store.batches.length = 0; await ecology.update({ x: 224, z: -96 });
  const batch = store.batches[0]; assert.ok(batch.records.some(([id]) => id === SOURCE)); assert.ok(batch.records.some(([id]) => id === DESTINATION));
  assert.equal(ecology._active.has(SOURCE), true); assert.equal(ecology._active.has(DESTINATION), false);
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), source); assert.deepEqual(store.records.get(`${WORLD}|${DESTINATION}`), destination);
  for (const failure of ['throw', 'null']) {
    const context = fixture(); context.ecology.step(.1, BASE); await context.ecology.checkpoint();
    const disk = clone([...context.store.records]), expected = clone([...context.ecology._active]);
    const entered = deferred(), release = deferred();
    context.store.onBatch = async () => { entered.resolve(); await release.promise; if (failure === 'throw') throw new Error('transport-paired-save-denied'); return null; };
    const leaving = context.ecology.update(FAR); await entered.promise;
    assert.ok(context.ecology._lockedRegions.has(SOURCE)); assert.ok(context.ecology._lockedRegions.has(DESTINATION));
    context.ecology.step(.2, BASE); assert.deepEqual([...context.ecology._active], expected);
    release.resolve(); assert.equal(await leaving, false);
    assert.deepEqual([...context.store.records], disk, 'rejected paired transaction leaves every old record intact');
    assert.deepEqual([...context.ecology._active], expected); assert.equal(context.ecology._lockedRegions.size, 0);
    assert.equal(context.ecology._center, null);
    context.store.onBatch = null; await context.ecology.update(FAR);
    assert.equal(context.ecology._active.has(SOURCE), false); assert.equal(context.ecology._active.has(DESTINATION), false);
    assert.ok(disk.length > 0);
  }
});

test('new optional transfer ledger fields commit before an old region activates without modifying historical saved fields', async () => {
  const { ecology, source, generator, store } = fixture({ upgrade: false });
  const previous = clone(source); store.records.set(`${WORLD}|${SOURCE}`, previous);
  const entered = deferred(), release = deferred(), reopened = new OceanEcology(SEED, generator, { store });
  store.onSave = async (world, id, record) => {
    if (id !== SOURCE) return;
    assert.equal(record.planktonTransportVersion, 1); assert.deepEqual(record.ledger, previous.ledger);
    close(record.ledger.transferredIn ?? 0, 0, 'new incoming view'); close(record.ledger.transferredOut ?? 0, 0, 'new outgoing view');
    assert.equal(reopened._active.has(SOURCE), false); entered.resolve(); await release.promise;
  };
  const loading = reopened.update(CENTER); await entered.promise;
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous);
  release.resolve(); await loading;
  const after = reopened._active.get(SOURCE);
  for (const [key, value] of Object.entries(previous)) if (key !== 'ledger') assert.deepEqual(after[key], value);
  assert.deepEqual(after.ledger, previous.ledger, 'historical saved ledger shape and values');
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), after);
});

test('failed additive metadata saves expose the complete old record and a later revisit initializes without changing old inventory', async () => {
  for (const failure of ['throw', 'null']) {
    const { source, generator, store } = fixture({ upgrade: false }); const previous = clone(source);
    store.records.set(`${WORLD}|${SOURCE}`, previous);
    store.onSave = (world, id) => { if (id !== SOURCE) return; if (failure === 'throw') throw new Error('transport-metadata-denied'); return null; };
    const reopened = new OceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
    assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous);
    assert.deepEqual(reopened._active.get(SOURCE), previous);
    store.onSave = null; await reopened.update(FAR); await reopened.update(CENTER);
    const after = reopened._active.get(SOURCE); assert.equal(after.planktonTransportVersion, 1);
    for (const [key, value] of Object.entries(previous)) if (key !== 'ledger') assert.deepEqual(after[key], value);
    originalFields(after.ledger, previous.ledger, 'successful retry original ledger');
  }
});

test('a missing desired neighbour stays sealed while loading or retrying rather than masquerading as the active-window exterior', () => {
  const { ecology, source } = fixture(); ecology._active.delete(DESTINATION);
  ecology._transportPlankton(BASE);
  close(source.resources.plankton, .8, 'a pending downstream owner is sealed');
  close(source.ledger.exported, 0, 'missing desired cell is not an exterior export');
  close(source.ledger.transferredOut ?? 0, 0, 'no queued unsaved transfer to a missing owner');
});

test('ordinary ticks after a real partial-window read failure keep pending faces sealed while the actual exterior still exports', async () => {
  const { ecology: template, generator, store } = fixture();
  for (let cz = -3; cz <= -1; cz++) for (let cx = 3; cx <= 5; cx++) {
    const region = template._createRegion(cx, cz); stock(region, `${cx},${cz}` === SOURCE ? .8 : `${cx},${cz}` === '5,-3' ? .4 : 0);
    region.slopeCommunityVersion = region.pelagicCommunityVersion = region.mantaCommunityVersion = 1;
    template._upgradePlanktonTransport(region); store.records.set(`${WORLD}|${region.id}`, clone(region));
  }
  const disk = clone([...store.records]), ecology = new OceanEcology(SEED, generator, { store });
  ecology.environmentField = template.environmentField;
  store.onLoad = (world, id) => { if (id === DESTINATION) throw new Error('downstream-window-read-denied'); };
  assert.equal(await ecology.update(CENTER), false); assert.equal(ecology._center, null);
  assert.equal(ecology._active.size, 5); assert.equal(ecology._active.has(DESTINATION), false);
  const paused = clone([...ecology._active]); ecology.step(0, { ...BASE, foodSupply: 3 });
  assert.deepEqual([...ecology._active], paused); assert.deepEqual([...store.records], disk);
  const source = ecology._active.get(SOURCE), edge = ecology._active.get('5,-3');
  ecology.step(.1, BASE);
  close(source.resources.plankton, .8 * (1 - .0008 * .1), 'pending downstream face adds no advection loss');
  close(source.planktonTransport.lastBoundaryExportedUnits, 0, 'read failure is not a world-window exterior');
  close(source.ledger.transferredOut ?? 0, 0, 'failed downstream owner receives no unsaved transfer');
  assert.ok(edge.planktonTransport.lastBoundaryExportedUnits > 0, 'a true exterior face retains its explicit export policy');
  assert.deepEqual([...store.records], disk, 'ordinary partial-window activity never evolves or writes missing saved neighbours');
  assertBalance(source); assertBalance(edge);
  store.onLoad = null; assert.notEqual(await ecology.update(CENTER), false);
  assert.equal(ecology._active.has(DESTINATION), true); ecology.step(.1, BASE);
  assert.ok(ecology._active.get(DESTINATION).resources.plankton > 0, 'successful retry opens the same paired face');
});

test('queued checkpoints snapshot paired inventories at execution rather than persisting a mixed earlier transport phase', async () => {
  const { ecology, source, destination, store } = fixture();
  const gate = gateNextBatch(store), first = ecology.checkpoint(); await gate.entered;
  const second = ecology.checkpoint(); ecology._transportPlankton(BASE);
  const expected = clone([source, destination]); gate.release(); await Promise.all([first, second]);
  assert.equal(store.batches.length, 2);
  close(store.batches[0].records.find(([id]) => id === SOURCE)[1].resources.plankton, .8, 'first complete snapshot');
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), expected[0]);
  assert.deepEqual(store.records.get(`${WORLD}|${DESTINATION}`), expected[1]);
});
