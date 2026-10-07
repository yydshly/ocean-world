import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { deepHardLifeSpeciesCatalog, deepHardLifeSpeciesById } from '../src/deepHardLifeSpecies.js';
import { DEEP_HARD_LIFE_IDS, DEEP_HARD_LIFE_MODEL as M, DEEP_HARD_LIFE_FOOD_SCOPE,
  createDeepHardLifePlan, initializeDeepHardLife, deepHardLifeRole, captureDeepHardLife,
  tickDeepHardLife, validateDeepHardLifeRecord, deepHardLifePositionValid, deepHardLifeFeedingPosition,
  deepHardLifeFoodBudgetError, deepHardLifeEnergyBudgetError, deepHardLifeSnapshot } from '../src/deepHardLife.js';

const clone = v => structuredClone(v), close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function fixture(cx = 156, cz = 8, seed = '42') {
  const generator = createDeepOceanGenerator(seed), ecology = new DeepOceanEcology(seed, generator, { hardLife: true });
  return { generator, ecology, region: ecology._create(cx, cz) };
}
function born(cx = 156, cz = 8) { const f = fixture(cx, cz); assert.equal(initializeDeepHardLife(f.generator, f.region, { fresh: true }), true); return f; }
const record = r => ({ state: { agents: clone(r.sim.agents) }, predatorAgents: clone(r.predatorAgents ?? []), deepBenthicAgents: clone(r.deepBenthicAgents ?? []), ...captureDeepHardLife(r) });
const native = s => clone({ agents: s.agents, rng: s._rngState, ticks: s._ticks, time: s.timeSec, counters: s.counters, events: s.events,
  ledger: s.ledger, energyLedger: s.energyLedger, resources: s.resources, surfacePatches: s.surfacePatches, benthicPatches: s.benthicPatches, suspendedPatches: s.suspendedPatches });
function advance(f, ticks, environment = {}) {
  Object.assign(f.region.sim.environment, environment);
  for (let i = 0; i < ticks; i++) { f.region.sim.step(.1); const before = native(f.region.sim);
    assert.equal(tickDeepHardLife(f.region, f.generator, .1), true, `${f.region.id} native tick ${f.region.sim.timeSec}`);
    assert.deepEqual(native(f.region.sim), before, 'new community may not mutate original simulation');
    close(deepHardLifeFoodBudgetError(f.region), 0); close(deepHardLifeEnergyBudgetError(f.region), 0);
  }
}
function frame(a) {
  const n = a.supportNormal, dot = Math.cos(a.heading) * n.x + Math.sin(a.heading) * n.z,
    raw = { x: Math.cos(a.heading) - dot * n.x, y: -dot * n.y, z: Math.sin(a.heading) - dot * n.z }, length = Math.hypot(raw.x, raw.y, raw.z),
    f = { x: raw.x / length, y: raw.y / length, z: raw.z / length }, side = { x: f.y * n.z - f.z * n.y, y: f.z * n.x - f.x * n.z, z: f.x * n.y - f.y * n.x };
  return p => Object.fromEntries(['x', 'y', 'z'].map(k => [k, a.position[k] + a.sizeM * (f[k] * p.x + n[k] * p.y + side[k] * p.z)]));
}

test('frozen sourced measures produce deterministic actual-rock full-body and upstream-channel plans without native stock or RNG draws', () => {
  assert.deepEqual(deepHardLifeSpeciesCatalog.map(s => s.id), DEEP_HARD_LIFE_IDS);
  assert.deepEqual(deepHardLifeSpeciesCatalog.map(s => s.sizeMeasure), ['arm-length', 'colony-height']);
  const seen = new Set();
  for (const [cx, cz] of [[156, 8], [157, 7], [160, 8], [161, 8]]) {
    const { generator: g, region: r } = fixture(cx, cz), before = native(r.sim), roleBefore = deepHardLifeRole(g, cx, cz), plan = createDeepHardLifePlan(g, r, { availableSlots: 4 });
    assert.equal(roleBefore, deepHardLifeRole(g, cx, cz)); assert.equal(typeof roleBefore, 'boolean');
    assert.deepEqual(plan, createDeepHardLifePlan(g, r, { availableSlots: 4 })); assert.deepEqual(native(r.sim), before);
    assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements)); assert.ok(plan.placements.length <= 4);
    for (const a of plan.placements) {
      seen.add(a.speciesId); const s = deepHardLifeSpeciesById[a.speciesId], transform = frame(a);
      assert.ok(deepHardLifePositionValid(g, r, a)); assert.equal(g.supportAt(a.position.x, a.position.z).elementId, a.deepHardHostId);
      for (const x of s.normalizedEnvelope.x) for (const y of s.normalizedEnvelope.y) for (const z of s.normalizedEnvelope.z) {
        const p = transform({ x, y, z }), depth = g.surfaceY - p.y; assert.ok(depth >= s.depthSelectionM[0] && depth <= s.depthSelectionM[1]);
      }
      const organ = deepHardLifeFeedingPosition(a); close(organ.x - a.sourcePosition.x, M.sourceDistanceM); close(organ.y, a.sourcePosition.y); close(organ.z, a.sourcePosition.z);
    }
    assert.equal(createDeepHardLifePlan(g, r, { availableSlots: 0 }).placements.length, 0);
  }
  assert.deepEqual([...seen].sort(), [...DEEP_HARD_LIFE_IDS].sort());
  assert.equal(createDeepHardLifePlan(fixture(161, 8).generator, fixture(161, 8).region, { availableSlots: 4 }).placements.some(a => a.speciesId === DEEP_HARD_LIFE_IDS[0]), false);
});

test('strict fresh time-zero initialization preserves native records, counts dead old slots, and seals full and empty histories', () => {
  const f = fixture(), before = native(f.region.sim);
  assert.equal(initializeDeepHardLife(f.generator, f.region), false); assert.equal(initializeDeepHardLife(f.generator, f.region, { fresh: true }), true);
  assert.deepEqual(native(f.region.sim), before); assert.ok(validateDeepHardLifeRecord(record(f.region), f.region, { generator: f.generator }));
  assert.equal(f.region.deepHardLife.parcels.length, 0); assert.equal(f.region.deepHardLife.foodLedger.initial, 0);
  const saved = captureDeepHardLife(f.region); assert.equal(initializeDeepHardLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(captureDeepHardLife(f.region), saved);
  const later = fixture(); later.region.sim.step(.1); assert.equal(initializeDeepHardLife(later.generator, later.region, { fresh: true }), false);
  const full = fixture(); full.region.predatorAgents = Array.from({ length: 20 - full.region.sim.agents.length }, (_, i) => ({ id: `dead:${i}`, alive: false }));
  assert.equal(initializeDeepHardLife(full.generator, full.region, { fresh: true }), true); assert.deepEqual(full.region.deepHardLifeAgents, []);
  assert.ok(validateDeepHardLifeRecord(record(full.region), full.region, { generator: full.generator })); assert.equal(initializeDeepHardLife(full.generator, full.region, { fresh: true }), false);
  const cap = fixture(); assert.equal(initializeDeepHardLife(cap.generator, cap.region, { fresh: true, capacity: cap.region.sim.agents.length - 1 }), false);
  const empty = fixture(155, 7); assert.equal(initializeDeepHardLife(empty.generator, empty.region, { fresh: true }), true); assert.equal(empty.region.deepHardLifeAgents.length, 0);
  advance(empty, 2); assert.ok(validateDeepHardLifeRecord(record(empty.region), empty.region, { generator: empty.generator }));
});

test('actual native clocks advect only new logged inputs to fixed visible feeding organs and reconcile each typed pool and separate condition account', async () => {
  const f = born(), home = f.region.deepHardLifeAgents.map(a => clone(a.position)); assert.equal(f.region.deepHardLifeAgents.length, 2);
  advance(f, 140);
  for (const [i, a] of f.region.deepHardLifeAgents.entries()) {
    assert.deepEqual(a.position, home[i]); assert.equal(a.timeSec, 14); assert.ok(deepHardLifePositionValid(f.generator, f.region, a));
    const p = a.lastHardLifeIntake; assert.ok(p); close(p.timeSec, 11.5); close(p.stockBefore - p.stockAfter, p.removedUnits);
    close(p.foodPosition.x - p.sourcePosition.x, p.parcelTravelM); close(p.foodPosition.y, p.sourcePosition.y); close(p.foodPosition.z, p.sourcePosition.z);
    assert.ok(p.contactDistanceM <= M.maximumFoodDistanceM); assert.equal(p.scope, DEEP_HARD_LIFE_FOOD_SCOPE); assert.equal(p.pool, deepHardLifeSpeciesById[a.speciesId].foodPool);
    close(p.energyAfter - p.energyBefore, p.removedUnits * M.energyGainPerUnit);
  }
  const s = deepHardLifeSnapshot(f.region); assert.equal(s.counters.ticks, 140); assert.equal(s.counters.feedings, 2); close(s.foodLedger.input, .00112); close(s.foodLedger.ingested, .00016);
  assert.ok(validateDeepHardLifeRecord(record(f.region), f.region, { generator: f.generator }));
  if (process.env.DEEP_HARD_LIFE_CONTINUATION_RECEIPT) await writeFile(process.env.DEEP_HARD_LIFE_CONTINUATION_RECEIPT, JSON.stringify({ owner: f.region.id, nativeSeconds: f.region.sim.timeSec,
    fixedHostPositions: home, resources: s.resources, foodLedger: s.foodLedger, counters: s.counters, foodBudgetError: s.foodBudgetError, energyBudgetError: s.energyBudgetError,
    individuals: f.region.deepHardLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId, host: a.deepHardHostId, timeSec: a.timeSec, lastHardLifeIntake: a.lastHardLifeIntake })) }, null, 2));
});

test('holdfast, whole crown and species depth checks reject support substitution and off-centre native obstructions', () => {
  const { generator: g, region: r } = born(), a = r.deepHardLifeAgents[0], e = deepHardLifeSpeciesById[a.speciesId].normalizedEnvelope,
    corner = frame(a)({ x: e.x[1], y: e.y[1], z: e.z[1] });
  const blocked = { ...g, heightAt: (x, z) => Math.hypot(x - corner.x, z - corner.z) < .00001 ? corner.y + .1 : g.heightAt(x, z) };
  assert.equal(blocked.heightAt(a.position.x, a.position.z), g.heightAt(a.position.x, a.position.z)); assert.equal(deepHardLifePositionValid(blocked, r, a), false);
  const soft = { ...g, supportAt: (x, z) => ({ ...g.supportAt(x, z), substrate: 'mud', elementId: null }) };
  assert.equal(deepHardLifePositionValid(soft, r, a), false); assert.equal(createDeepHardLifePlan(soft, r, { availableSlots: 4 }).placements.length, 0);
  const crooked = clone(a); crooked.supportNormal.y = .5; assert.equal(deepHardLifePositionValid(g, r, crooked), false);
  const lifted = clone(a); lifted.position.y += .01; assert.equal(deepHardLifePositionValid(g, r, lifted), false);
  const other = r.sim.agents[0], home = clone(other.position); other.position = clone(a.position);
  assert.equal(deepHardLifePositionValid(g, r, a, a.position, { occupancy: true }), false); other.position = home;
});

test('foodSupply zero and observer light provide no food while stationary flow exports bounded overflow after exactly four parcels per channel', () => {
  const dark = born(), light = born(); advance(dark, 50, { foodSupply: 0, currentMps: .18, observerLight: 0, hour: 0 });
  advance(light, 50, { foodSupply: 0, currentMps: .18, observerLight: 1, hour: 12 }); assert.deepEqual(captureDeepHardLife(dark.region), captureDeepHardLife(light.region));
  assert.equal(dark.region.deepHardLife.foodLedger.input, 0); assert.equal(dark.region.deepHardLife.foodLedger.ingested, 0); assert.equal(dark.region.deepHardLife.parcels.length, 0);
  const stopped = born(); advance(stopped, 200, { foodSupply: 3, currentMps: 0 });
  assert.equal(stopped.region.deepHardLife.parcels.length, stopped.region.deepHardLife.channels.length * M.maximumParcelsPerChannel);
  assert.ok(stopped.region.deepHardLife.parcels.every(p => p.travelM === 0)); assert.equal(stopped.region.deepHardLife.counters.feedings, 0);
  assert.ok(stopped.region.deepHardLife.foodLedger.exported > 0); close(deepHardLifeFoodBudgetError(stopped.region), 0);
  assert.ok(validateDeepHardLifeRecord(record(stopped.region), stopped.region, { generator: stopped.generator }));
});

test('duplicate, skipped, invalid duration and unknown runtime markers reject before any new history mutation', () => {
  const f = born(); advance(f, 1); const saved = captureDeepHardLife(f.region);
  assert.equal(tickDeepHardLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepHardLife(f.region), saved);
  f.region.sim.step(.2); assert.equal(tickDeepHardLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepHardLife(f.region), saved);
  for (const dt of [0, .2, Infinity, NaN]) assert.equal(tickDeepHardLife(f.region, f.generator, dt), false);
  const marker = born(); marker.region.deepHardUnknown = 1; marker.region.sim.step(.1); const before = captureDeepHardLife(marker.region);
  assert.equal(tickDeepHardLife(marker.region, marker.generator, .1), false); assert.deepEqual(captureDeepHardLife(marker.region), before);
  const env = born(); env.region.sim.step(.1); env.region.sim.environment.foodSupply = NaN; const good = captureDeepHardLife(env.region);
  assert.equal(tickDeepHardLife(env.region, env.generator, .1), false); assert.deepEqual(captureDeepHardLife(env.region), good);
});

test('finite intermediate support collision and real owner outlets export actual travelling parcel amounts with no native ledger draws', () => {
  const f = born(); for (const a of f.region.deepHardLifeAgents) a.nextBite = 1e6;
  advance(f, 15, { currentMps: 1.2 }); const p = f.region.deepHardLife.parcels[0]; assert.ok(p);
  const x = p.position.x + .06, z = p.position.z, y = p.position.y, stock = p.amount, original = f.generator;
  const barrier = { ...original, heightAt: (px, pz) => Math.abs(px - x) < .006 && Math.abs(pz - z) < .000001 ? y + .01 : original.heightAt(px, pz) };
  f.region.sim.environment.foodSupply = 0; f.region.sim.step(.1); const old = native(f.region.sim), before = f.region.deepHardLife.foodLedger.exported;
  assert.equal(tickDeepHardLife(f.region, barrier, .1), true); assert.deepEqual(native(f.region.sim), old); close(f.region.deepHardLife.foodLedger.exported - before, stock);
  assert.equal(f.region.deepHardLife.parcels.some(q => q.id === p.id), false); close(deepHardLifeFoodBudgetError(f.region), 0);
  const outlet = born(); for (const a of outlet.region.deepHardLifeAgents) a.nextBite = 1e6; advance(outlet, 1, { currentMps: 1.2 });
  const ids = outlet.region.deepHardLife.parcels.map(p => p.id), initial = outlet.region.deepHardLife.foodLedger.input;
  advance(outlet, 520, { currentMps: 1.2, foodSupply: 0 }); assert.equal(outlet.region.deepHardLife.parcels.some(p => ids.includes(p.id)), false);
  close(outlet.region.deepHardLife.foodLedger.exported, initial); assert.ok(validateDeepHardLifeRecord(record(outlet.region), outlet.region, { generator: outlet.generator }));
});

test('cold histories reproduce the exact next native step and preserve dead clocks while malformed roster, channel, parcel, intake or energy fails closed', () => {
  const f = born(); advance(f, 140); const saved = f.ecology._record(f.region), cold = fixture(), restored = cold.ecology._restore(saved, f.region.cx, f.region.cz);
  cold.region = restored; assert.deepEqual(captureDeepHardLife(restored), captureDeepHardLife(f.region)); advance(f, 1); advance(cold, 1);
  assert.deepEqual(captureDeepHardLife(restored), captureDeepHardLife(f.region)); assert.deepEqual(native(restored.sim), native(f.region.sim));
  const a = f.region.deepHardLifeAgents[0]; f.region.deepHardEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead'; a.stateSince = a.timeSec; f.region.deepHardLife.counters.deaths++;
  const corpse = clone(a); advance(f, 10); assert.deepEqual(a, corpse); assert.equal(initializeDeepHardLife(f.generator, f.region, { fresh: true }), false);
  const good = record(f.region); assert.ok(validateDeepHardLifeRecord(good, f.region, { generator: f.generator }));
  for (const key of ['deepHardLifeVersion', 'deepHardLifeInitializedAtSec', 'deepHardLife', 'deepHardLifeAgents', 'deepHardEnergyLedger']) {
    const partial = { state: good.state, [key]: clone(good[key]) }; assert.equal(validateDeepHardLifeRecord(partial, f.region, { generator: f.generator }), false);
  }
  const mutations = [r => r.deepHardUnknown = true, r => r.deepHardLifeAgents.pop(), r => r.deepHardLife.addedIds.pop(),
    r => r.deepHardLife.birthPlacements[0].sizeM *= 1.1, r => r.deepHardLifeAgents[0].deepHardForeign = 1,
    r => r.deepHardLifeAgents[0].home.y += .01, r => r.deepHardLife.channels[0].sourcePosition.x += .1,
    r => r.deepHardLife.channels[0].inputUnits += .001, r => r.deepHardLife.parcels[0].position.y += .02,
    r => r.deepHardLife.parcels[0].amount *= 2, r => r.deepHardLifeAgents[0].lastHardLifeIntake.stockAfter += .01,
    r => r.deepHardLifeAgents[0].lastHardLifeIntake.foodPosition.z += .01, r => r.deepHardEnergyLedger.feedingGain += .1,
    r => r.state.agents[0].deepHardSiteId = 'forged', r => r.predatorAgents.push(clone(r.deepHardLifeAgents[0])),
    r => r.deepBenthicAgents.push({ speciesId: 'other', deepHardPartial: 1 })];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.equal(validateDeepHardLifeRecord(bad, f.region, { generator: f.generator }), false, mutate.toString()); }
  assert.equal(validateDeepHardLifeRecord({ state: good.state, predatorAgents: good.predatorAgents, deepBenthicAgents: good.deepBenthicAgents }, f.region, { generator: f.generator }), true);
});
