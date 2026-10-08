import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { deepMidwaterLifeSpeciesCatalog as catalog, deepMidwaterLifeSpeciesById as byId } from '../src/deepMidwaterLifeSpecies.js';
import { DEEP_MIDWATER_LIFE_IDS as IDS, DEEP_MIDWATER_LIFE_MODEL as M, DEEP_MIDWATER_LIFE_FOOD_SCOPE,
  deepMidwaterLifeRole, createDeepMidwaterLifePlan, initializeDeepMidwaterLife, captureDeepMidwaterLife,
  validateDeepMidwaterLifeRecord, tickDeepMidwaterLife, deepMidwaterLifePositionValid, deepMidwaterLifeBodyPoints,
  deepMidwaterLifeFeedingPosition, deepMidwaterLifeFoodBudgetError, deepMidwaterLifeEnergyBudgetError, deepMidwaterLifeSnapshot } from '../src/deepMidwaterLife.js';

const clone = x => structuredClone(x), close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function fixture(cx = 192, cz = 8) { const generator = createDeepOceanGenerator('42'), ecology = new DeepOceanEcology('42', generator, { midwaterLife: true });
  return { generator, ecology, region: ecology._create(cx, cz) }; }
function born(options = {}) { const f = fixture(); assert.equal(initializeDeepMidwaterLife(f.generator, f.region, { fresh: true, ...options }), true); return f; }
const native = s => clone({ agents: s.agents, rng: s._rngState, ticks: s._ticks, timeSec: s.timeSec, events: s.events, counters: s.counters,
  ledger: s.ledger, energyLedger: s.energyLedger, resources: s.resources, surfacePatches: s.surfacePatches, benthicPatches: s.benthicPatches, suspendedPatches: s.suspendedPatches });
const record = f => f.ecology._record(f.region);
function advance(f, count, environment = {}) {
  Object.assign(f.region.sim.environment, environment);
  for (let i = 0; i < count; i++) {
    f.region.sim.step(.1); const old = native(f.region.sim);
    assert.equal(tickDeepMidwaterLife(f.region, f.generator, .1), true, `${f.region.id} tick ${f.region.sim._ticks}`);
    assert.deepEqual(native(f.region.sim), old, 'new suspension channel never changes original native animals, food, RNG or ledgers');
    close(deepMidwaterLifeFoodBudgetError(f.region), 0); close(deepMidwaterLifeEnergyBudgetError(f.region), 0);
    assert.ok(validateDeepMidwaterLifeRecord(record(f), f.region, { generator: f.generator }));
  }
}
let continuation;

test('three qualified whole midwater forms make pure deterministic compact plans at actual 650–750m depth, independently of the 3500m bed and native RNG', () => {
  const f = fixture(), old = native(f.region.sim); assert.deepEqual(catalog.map(s => s.id), IDS);
  assert.deepEqual(catalog.map(s => s.sizeMeasure), ['bell-diameter', 'mantle-length', 'rostrum-to-telson-length']);
  assert.equal(deepMidwaterLifeRole(f.generator, 192, 8), true);
  const p = createDeepMidwaterLifePlan(f.generator, f.region, { availableSlots: 20 }), q = createDeepMidwaterLifePlan(f.generator, f.region, { availableSlots: 20 });
  assert.deepEqual(p, q); assert.deepEqual(native(f.region.sim), old); assert.equal(p.placements.length, 3); assert.ok(Object.isFrozen(p) && Object.isFrozen(p.placements));
  for (const a of p.placements) { const s = byId[a.speciesId]; assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
    assert.ok(deepMidwaterLifePositionValid(f.generator, f.region, a)); assert.equal(deepMidwaterLifeBodyPoints(a).length, 27);
    for (const b of deepMidwaterLifeBodyPoints(a)) { assert.ok(3500 - b.y >= 650 && 3500 - b.y <= 750); assert.ok(b.y > f.generator.heightAt(b.x, b.z) + 2500); }
    assert.ok(Math.hypot(a.position.x - 12320, a.position.z - 544) <= 2.000001);
    close(a.referencePosition.x - a.sourcePosition.x, M.sourceDistanceM); close(a.referencePosition.y, a.sourcePosition.y); close(a.referencePosition.z, a.sourcePosition.z);
  }
  assert.equal(createDeepMidwaterLifePlan(f.generator, f.region, { availableSlots: 0 }).placements.length, 0);
  assert.equal(deepMidwaterLifeRole({ ...f.generator, surfaceY: 0 }, 192, 8), false);
});

test('only fresh exact time-zero records initialise, all old dead records count toward twenty, and legitimate reduced or empty allocations are sealed', () => {
  const f = fixture(), before = native(f.region.sim); assert.equal(initializeDeepMidwaterLife(f.generator, f.region), false);
  assert.equal(initializeDeepMidwaterLife(f.generator, f.region, { fresh: true }), true); assert.deepEqual(native(f.region.sim), before);
  const saved = captureDeepMidwaterLife(f.region); assert.equal(initializeDeepMidwaterLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(captureDeepMidwaterLife(f.region), saved);
  const late = fixture(); late.region.sim.step(.1); assert.equal(initializeDeepMidwaterLife(late.generator, late.region, { fresh: true }), false);
  const full = fixture(); full.region.deepHardLifeAgents = Array.from({ length: 20 - full.region.sim.agents.length }, (_, i) => ({ id: `old-dead:${i}`, alive: false }));
  assert.equal(initializeDeepMidwaterLife(full.generator, full.region, { fresh: true }), true); assert.deepEqual(full.region.deepMidwaterLifeAgents, []);
  assert.ok(validateDeepMidwaterLifeRecord(record(full), full.region, { generator: full.generator })); advance(full, 2); assert.equal(initializeDeepMidwaterLife(full.generator, full.region, { fresh: true }), false);
  const limited = fixture(); assert.equal(initializeDeepMidwaterLife(limited.generator, limited.region, { fresh: true, capacity: limited.region.sim.agents.length + 1 }), true);
  assert.equal(limited.region.deepMidwaterLifeAgents.length, 1); assert.ok(validateDeepMidwaterLifeRecord(record(limited), limited.region, { generator: limited.generator, allocation: { capacity: limited.region.sim.agents.length + 1, maxAdded: 3 } }));
  for (const maxAdded of [-1, 4, .5, NaN]) { const bad = fixture(); assert.equal(initializeDeepMidwaterLife(bad.generator, bad.region, { fresh: true, maxAdded }), false); }
});

test('one native 24-second continuation records meaningful real movement, typed parcel contacts and balanced condition, and actual event UI formatting accepts feeding and death labels', async () => {
  const f = born(), homes = f.region.deepMidwaterLifeAgents.map(a => clone(a.home)); advance(f, 240, { currentMps: .18, foodSupply: 1 });
  const s = deepMidwaterLifeSnapshot(f.region), fed = new Set();
  for (const [i, a] of f.region.deepMidwaterLifeAgents.entries()) { assert.equal(a.timeSec, 24); assert.ok(a.travelledM > .1); assert.deepEqual(a.home, homes[i]);
    if (!a.lastMidwaterIntake) continue; fed.add(a.speciesId); const w = a.lastMidwaterIntake;
    close(w.stockBefore - w.stockAfter, w.removedUnits); assert.ok(w.contactDistanceM <= M.captureDistanceM); assert.equal(w.scope, DEEP_MIDWATER_LIFE_FOOD_SCOPE);
    assert.equal(w.pool, byId[a.speciesId].foodPool); assert.deepEqual(w.feedingPosition, deepMidwaterLifeFeedingPosition({ ...a, position: w.agentPosition, heading: w.agentHeading, pitch: w.agentPitch }));
    close(w.energyAfter, Math.min(1, w.energyBefore + w.removedUnits * M.energyGainPerUnit));
  }
  assert.ok(fed.size > 0, 'natural contacts are required, every animal is not guaranteed a meal'); assert.ok(s.foodLedger.input > 0 && s.foodLedger.ingested > 0 && s.foodLedger.exported > 0);
  continuation = { raw: record(f), snapshot: s, generator: f.generator };
  const ui = await readFile(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8'), expression = ui.match(/const eventLabel=([^;]+);/)[1], eventLabel = Function('conditionNames', `return (${expression});`)({});
  for (const e of f.region.deepMidwaterLife.events) { assert.equal(typeof eventLabel(e.label || e.title), 'string'); assert.ok(e.cause.length); }
  const dying = born(), a = dying.region.deepMidwaterLifeAgents[0], initial = a.energy; a.energy = 1e-10; dying.region.deepMidwaterEnergyLedger.maintenanceAndMotionDebit += initial - a.energy;
  advance(dying, 1); const death = dying.region.deepMidwaterLife.events.find(e => e.type === 'death'); assert.ok(death); assert.equal(typeof eventLabel(death.label || death.title), 'string'); assert.ok(death.cause.length);
  if (process.env.DEEP_MIDWATER_LIFE_CONTINUATION_RECEIPT) await writeFile(process.env.DEEP_MIDWATER_LIFE_CONTINUATION_RECEIPT, JSON.stringify({ owner: f.region.id, nativeSeconds: 24,
    resources: s.resources, foodLedger: s.foodLedger, energyLedger: s.energyLedger, counters: s.counters, foodBudgetError: deepMidwaterLifeFoodBudgetError(f.region), energyBudgetError: deepMidwaterLifeEnergyBudgetError(f.region),
    individuals: f.region.deepMidwaterLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM, sizeMeasure: byId[a.speciesId].sizeMeasure, home: a.home, position: a.position,
      timeSec: a.timeSec, travelledM: a.travelledM, feedingCount: a.feedingCount, lastMidwaterIntake: a.lastMidwaterIntake })) }, null, 2));
});

test('full tentacles and filaments, peer occupation, depth boundaries and target pitch are checked in the same world pose', () => {
  const f = born();
  for (const a of f.region.deepMidwaterLifeAgents) { const point = deepMidwaterLifeBodyPoints(a).at(-1), g = f.generator,
      obstacle = { ...g, heightAt: (x, z) => Math.hypot(x - point.x, z - point.z) < 1e-7 ? point.y + .1 : g.heightAt(x, z) };
    assert.equal(deepMidwaterLifePositionValid(obstacle, f.region, a), false);
    assert.equal(deepMidwaterLifePositionValid(g, f.region, a, { ...a.position, y: 2850 }), false);
    assert.equal(deepMidwaterLifePositionValid(g, f.region, a, { ...a.position, y: 2750 }), false);
    assert.equal(deepMidwaterLifePositionValid(g, f.region, a, a.position, a.heading, .121), false);
    const peer = { id: 'old-neighbour', alive: true, sizeM: 1, position: clone(a.position) };
    assert.equal(deepMidwaterLifePositionValid(g, f.region, a, a.position, a.heading, a.pitch, { occupancy: true, extra: [peer] }), false);
  }
  const jelly = f.region.deepMidwaterLifeAgents.find(a => a.speciesId === 'helmet-jelly'); assert.equal(deepMidwaterLifePositionValid(f.generator, f.region, jelly, jelly.position, jelly.heading, .01), false);
});

test('zero supply or zero current gives no new food, observer hour and lamp create no flux, and bounded fast flow exports real excess without shadow native stock', () => {
  for (const environment of [{ foodSupply: 0, currentMps: .18 }, { foodSupply: 1, currentMps: 0 }]) { const f = born(); advance(f, 20, environment);
    assert.equal(f.region.deepMidwaterLife.foodLedger.input, 0); assert.equal(f.region.deepMidwaterLife.counters.feedings, 0); assert.equal(f.region.deepMidwaterEnergyLedger.feedingGain, 0); }
  const dark = born(), lit = born(); advance(dark, 20, { currentMps: .18, foodSupply: 1, hour: 0, observerLight: 0 }); advance(lit, 20, { currentMps: .18, foodSupply: 1, hour: 12, observerLight: 1 });
  assert.deepEqual(dark.region.deepMidwaterLife.foodLedger, lit.region.deepMidwaterLife.foodLedger); assert.deepEqual(dark.region.deepMidwaterLife.channels, lit.region.deepMidwaterLife.channels);
  const fast = born(); advance(fast, 40, { currentMps: 1.2, foodSupply: 3 }); assert.ok(fast.region.deepMidwaterLife.foodLedger.exported > 0);
  assert.ok(fast.region.deepMidwaterLife.channels.every(c => c.parcels.length <= M.maximumParcelsPerChannel && c.parcels.every(p => p.amount <= M.maximumParcelAmount + 1e-10)));
  assert.equal(fast.region.sim.resources.midwaterAnimalFood, undefined);
});

test('integer-native pending clocks cross 161 to 162 ticks, while duplicate, skipped or corrupt ticks reject before modifying new or original state', () => {
  const f = born(); advance(f, 161); assert.equal(f.region.deepMidwaterLife.lastTickSec, 16.1); advance(f, 1); assert.equal(f.region.deepMidwaterLife.lastTickSec, 16.2);
  const saved = captureDeepMidwaterLife(f.region), old = native(f.region.sim); assert.equal(tickDeepMidwaterLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepMidwaterLife(f.region), saved); assert.deepEqual(native(f.region.sim), old);
  f.region.sim.step(.2); const afterNative = native(f.region.sim); assert.equal(tickDeepMidwaterLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepMidwaterLife(f.region), saved); assert.deepEqual(native(f.region.sim), afterNative);
  for (const dt of [0, .2, NaN, Infinity]) assert.equal(tickDeepMidwaterLife(f.region, f.generator, dt), false);
  const bad = born(); bad.region.deepMidwaterLifeAgents[0].target.y = 3000; bad.region.sim.step(.1); const before = captureDeepMidwaterLife(bad.region), beforeNative = native(bad.region.sim);
  assert.equal(tickDeepMidwaterLife(bad.region, bad.generator, .1), false); assert.deepEqual(captureDeepMidwaterLife(bad.region), before); assert.deepEqual(native(bad.region.sim), beforeNative);
});

test('cold history reproduces the exact next step, dead native clocks and intake freeze, and complete old histories stay without later births', () => {
  assert.ok(continuation); const f = fixture(); f.region = f.ecology._restore(clone(continuation.raw), 192, 8); const cold = fixture(); cold.region = cold.ecology._restore(clone(continuation.raw), 192, 8);
  advance(f, 1); advance(cold, 1); assert.deepEqual(captureDeepMidwaterLife(f.region), captureDeepMidwaterLife(cold.region)); assert.deepEqual(native(f.region.sim), native(cold.region.sim));
  const a = f.region.deepMidwaterLifeAgents.find(a => a.lastMidwaterIntake); assert.ok(a); f.region.deepMidwaterEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead'; a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 }; f.region.deepMidwaterLife.counters.deaths++;
  const corpse = clone(a); advance(f, 3); assert.deepEqual(a, corpse); assert.equal(initializeDeepMidwaterLife(f.generator, f.region, { fresh: true }), false);
  const old = fixture(); old.region.sim.step(.1); const raw = record(old), restored = old.ecology._restore(raw, 192, 8); assert.equal(restored.deepMidwaterLifeVersion, undefined); assert.equal(initializeDeepMidwaterLife(old.generator, restored, { fresh: true }), false);
});

test('saved deterministic roster erasure, namespace disguises, altered source parcels, capture witnesses, event labels and unbalanced books fail closed', () => {
  assert.ok(continuation); const f = fixture(); f.region = f.ecology._restore(clone(continuation.raw), 192, 8); const good = record(f), fed = good.deepMidwaterLifeAgents.findIndex(a => a.lastMidwaterIntake); assert.ok(fed >= 0);
  for (const key of ['deepMidwaterLifeVersion', 'deepMidwaterLifeInitializedAtSec', 'deepMidwaterLife', 'deepMidwaterLifeAgents', 'deepMidwaterEnergyLedger']) {
    assert.equal(validateDeepMidwaterLifeRecord({ state: good.state, [key]: clone(good[key]) }, f.region, { generator: f.generator }), false);
  }
  const erase = r => { r.deepMidwaterLifeAgents = []; r.deepMidwaterLife.birthPlacements = []; r.deepMidwaterLife.addedIds = []; r.deepMidwaterLife.channels = []; r.deepMidwaterLife.events = [];
    r.deepMidwaterLife.nextParcelId = 0; r.deepMidwaterLife.counters = { ticks: r.state._ticks, inputPulses: 0, feedings: 0, consumedUnits: 0, deaths: 0 };
    r.deepMidwaterLife.foodLedger = { initial: 0, input: 0, ingested: 0, exported: 0, byPool: Object.fromEntries(Object.keys(r.deepMidwaterLife.foodLedger.byPool).map(p => [p, { initial: 0, input: 0, ingested: 0, exported: 0 }])) };
    r.deepMidwaterEnergyLedger = { initial: 0, feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0, deathLoss: 0 }; };
  const mutations = [r => r.deepMidwaterUnknown = 1, r => r.state.deepMidwaterUnknown = 1, r => r.state.agents[0].deepMidwaterSiteId = 'fake',
    r => r.deepMidwaterLifeAgents[0].deepHardIndividualVersion = 1, r => r.deepMidwaterLifeAgents[0].pitch = .13, r => r.deepMidwaterLifeAgents[0].target.y = 2850,
    r => r.deepMidwaterLifeAgents[fed].lastMidwaterIntake.stockAfter += .00001, r => r.deepMidwaterLifeAgents[fed].lastMidwaterIntake.feedingPosition.x += .01,
    r => r.deepMidwaterLife.channels[0].sourcePosition.y += .01, r => r.deepMidwaterLife.foodLedger.input += .1,
    r => r.deepMidwaterEnergyLedger.feedingGain += .1, r => r.deepMidwaterLife.events[0].label = undefined, r => r.deepMidwaterLife.events[0].cause = '',
    r => r.deepMidwaterLife.birthPlacements.pop(), r => r.deepMidwaterLifeAgents.pop(), r => r.deepMidwaterLife.allocation.capacity = 21,
    erase, r => { erase(r); r.deepMidwaterLife.allocation = { capacity: r.state.agents.length, maxAdded: 0 }; }];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.equal(validateDeepMidwaterLifeRecord(bad, f.region, { generator: f.generator }), false, mutate.toString()); }
  const masquerade = clone(good); masquerade.deepWaterLifeAgents = [clone(good.deepMidwaterLifeAgents[0])]; assert.equal(validateDeepMidwaterLifeRecord(masquerade, f.region, { generator: f.generator }), false);
});
