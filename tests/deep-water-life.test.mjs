import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { deepWaterLifeSpeciesCatalog, deepWaterLifeSpeciesById } from '../src/deepWaterLifeSpecies.js';
import { initializeDeepHardLife, captureDeepHardLife, tickDeepHardLife } from '../src/deepHardLife.js';
import { DEEP_WATER_LIFE_IDS, DEEP_WATER_LIFE_MODEL as M, DEEP_WATER_LIFE_FOOD_SCOPE,
  deepWaterLifeRole, createDeepWaterLifePlan, initializeDeepWaterLife, captureDeepWaterLife,
  validateDeepWaterLifeRecord, tickDeepWaterLife, deepWaterLifePositionValid, deepWaterLifeFeedingPosition,
  deepWaterLifeFoodBudgetError, deepWaterLifeEnergyBudgetError, deepWaterLifeSnapshot } from '../src/deepWaterLife.js';

const clone = v => structuredClone(v), close = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function fixture(cx = 173, cz = 8, seed = '42') {
  const generator = createDeepOceanGenerator(seed), ecology = new DeepOceanEcology(seed, generator, { waterLife: true, hardLife: true });
  return { generator, ecology, region: ecology._create(cx, cz) };
}
function born(cx = 173, cz = 8, hard = false) {
  const f = fixture(cx, cz); if (hard) assert.equal(initializeDeepHardLife(f.generator, f.region, { fresh: true, maxAdded: 2 }), true);
  assert.equal(initializeDeepWaterLife(f.generator, f.region, { fresh: true }), true); return f;
}
const record = r => ({ state: { agents: clone(r.sim.agents) }, predatorAgents: clone(r.predatorAgents ?? []), deepBenthicAgents: clone(r.deepBenthicAgents ?? []), deepHardLifeAgents: clone(r.deepHardLifeAgents ?? []), ...captureDeepWaterLife(r) });
const native = s => clone({ agents: s.agents, rng: s._rngState, ticks: s._ticks, timeSec: s.timeSec, events: s.events, counters: s.counters,
  ledger: s.ledger, energyLedger: s.energyLedger, resources: s.resources, surfacePatches: s.surfacePatches, benthicPatches: s.benthicPatches, suspendedPatches: s.suspendedPatches });
function advance(f, count, environment = {}, clearBenthicFood = false) {
  Object.assign(f.region.sim.environment, environment);
  for (let i = 0; i < count; i++) {
    f.region.sim.step(.1); if (f.region.deepHardLifeVersion === 1) assert.equal(tickDeepHardLife(f.region, f.generator, .1), true);
    if (clearBenthicFood) for (const p of f.region.sim.benthicPatches) f.region.sim._remove(p, 'benthicAnimalFood', p.benthicAnimalFood, 'exported');
    const before = native(f.region.sim), closedHard = captureDeepHardLife(f.region), intake = f.region.deepWaterLife.counters.consumedUnits;
    assert.equal(tickDeepWaterLife(f.region, f.generator, .1), true, `${f.region.id} tick ${f.region.sim.timeSec}`);
    const after = native(f.region.sim), consumed = f.region.deepWaterLife.counters.consumedUnits - intake;
    for (const key of ['agents', 'rng', 'ticks', 'timeSec', 'events', 'counters', 'energyLedger', 'surfacePatches', 'suspendedPatches']) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(captureDeepHardLife(f.region), closedHard, 'closed hard community and independent stocks untouched');
    close(after.ledger.ingested - before.ledger.ingested, consumed); close(before.resources.benthicAnimalFood - after.resources.benthicAnimalFood, consumed);
    close(after.ledger.byPool.benthicAnimalFood.ingested - before.ledger.byPool.benthicAnimalFood.ingested, consumed);
    assert.equal(after.ledger.input, before.ledger.input); assert.equal(after.ledger.exported, before.ledger.exported);
    close(deepWaterLifeFoodBudgetError(f.region), 0); close(deepWaterLifeEnergyBudgetError(f.region), 0);
  }
}
function world(a, p) { const c = Math.cos(a.heading), s = Math.sin(a.heading), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
  return { x: a.position.x + a.sizeM * (p.x * c * cp - p.y * c * sp - p.z * s), y: a.position.y + a.sizeM * (p.x * sp + p.y * cp),
    z: a.position.z + a.sizeM * (p.x * s * cp - p.y * s * sp + p.z * c) }; }

test('qualified ML and SL catalogs make frozen deterministic native near-bed plans and pure sparse geometry roles without stock or RNG draws', () => {
  assert.deepEqual(deepWaterLifeSpeciesCatalog.map(s => s.id), DEEP_WATER_LIFE_IDS); assert.deepEqual(deepWaterLifeSpeciesCatalog.map(s => s.sizeMeasure), ['mantle-length', 'standard-length']);
  assert.equal(deepWaterLifeSpeciesById['abyssal-dumbo-octopus'].feedingEvidenceLevel, 'explicit-congener-diet-inference-species-gut-contents-unverified');
  const seen = new Set();
  for (const [cx, cz] of [[173, 8], [174, 8], [180, 8]]) {
    const f = fixture(cx, cz), before = native(f.region.sim), pure = { ...f.region }; delete pure.sim;
    assert.equal(deepWaterLifeRole(f.generator, cx, cz), deepWaterLifeRole(f.generator, pure.cx, pure.cz));
    const a = createDeepWaterLifePlan(f.generator, f.region, { availableSlots: 4 }), b = createDeepWaterLifePlan(f.generator, f.region, { availableSlots: 4 });
    assert.deepEqual(a, b); assert.deepEqual(native(f.region.sim), before); assert.ok(Object.isFrozen(a) && Object.isFrozen(a.placements)); assert.ok(a.placements.length <= 4);
    for (const p of a.placements) {
      seen.add(p.speciesId); const s = deepWaterLifeSpeciesById[p.speciesId]; assert.ok(p.sizeM >= s.sizeRangeM[0] && p.sizeM <= s.sizeRangeM[1]); assert.ok(deepWaterLifePositionValid(f.generator, f.region, p));
      assert.ok(f.region.sim.benthicPatches.some(x => x.id === p.deepWaterFoodPatchId)); assert.equal(p.nutritionPool, 'benthicAnimalFood');
      for (const x of s.normalizedEnvelope.x) for (const y of s.normalizedEnvelope.y) for (const z of s.normalizedEnvelope.z) {
        const q = world(p, { x, y, z }), depth = f.generator.surfaceY - q.y; assert.ok(depth >= s.depthSelectionM[0] && depth <= s.depthSelectionM[1]);
        assert.ok(q.y >= f.generator.heightAt(q.x, q.z) + M.wholeBodyClearanceM - 1e-8); assert.ok(q.y <= f.generator.floorSurface(q.x, q.z).height + 8);
      }
    }
    assert.equal(createDeepWaterLifePlan(f.generator, f.region, { availableSlots: 0 }).placements.length, 0);
  }
  assert.deepEqual([...seen].sort(), [...DEEP_WATER_LIFE_IDS].sort()); assert.equal(deepWaterLifeRole(fixture().generator, 174, 8), false);
});

test('fresh time-zero birth preserves all original food and animals while counting dead and closed hard records toward 20 and sealing empty categories', () => {
  const f = fixture(), before = native(f.region.sim);
  assert.equal(initializeDeepWaterLife(f.generator, f.region), false); assert.equal(initializeDeepWaterLife(f.generator, f.region, { fresh: true }), true);
  assert.deepEqual(native(f.region.sim), before); assert.ok(validateDeepWaterLifeRecord(record(f.region), f.region, { generator: f.generator }));
  const saved = captureDeepWaterLife(f.region); assert.equal(initializeDeepWaterLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(captureDeepWaterLife(f.region), saved);
  const later = fixture(); later.region.sim.step(.1); assert.equal(initializeDeepWaterLife(later.generator, later.region, { fresh: true }), false);
  const full = fixture(); full.region.deepHardLifeAgents = Array.from({ length: 20 - full.region.sim.agents.length }, (_, i) => ({ id: `closed-dead:${i}`, alive: false }));
  assert.equal(initializeDeepWaterLife(full.generator, full.region, { fresh: true }), true); assert.equal(full.region.deepWaterLifeAgents.length, 0); assert.ok(validateDeepWaterLifeRecord(record(full.region), full.region, { generator: full.generator }));
  const small = fixture(); assert.equal(initializeDeepWaterLife(small.generator, small.region, { fresh: true, capacity: small.region.sim.agents.length - 1 }), false);
  const cap = fixture(); assert.equal(initializeDeepWaterLife(cap.generator, cap.region, { fresh: true, capacity: cap.region.sim.agents.length + 1 }), true); assert.equal(cap.region.deepWaterLifeAgents.length, 1);
  const empty = born(174, 8); assert.deepEqual(empty.region.deepWaterLifeAgents, []); advance(empty, 2); assert.equal(initializeDeepWaterLife(empty.generator, empty.region, { fresh: true }), false);
});

test('24 seconds of actual native swimming yield both natural mouth contacts, exact existing pool debits, clocks and independent condition without guaranteed feeding for every animal', async () => {
  const f = born(), homes = new Map(f.region.deepWaterLifeAgents.map(a => [a.id, clone(a.home)])); advance(f, 240, { currentMps: .18 });
  const fed = new Set();
  for (const a of f.region.deepWaterLifeAgents) {
    assert.equal(a.timeSec, 24); assert.ok(a.travelledM > .1); assert.ok(Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) <= M.traits[a.speciesId].speedMps + 1e-8);
    assert.ok(deepWaterLifePositionValid(f.generator, f.region, a)); assert.deepEqual(a.home, homes.get(a.id));
    if (!a.lastWaterLifeIntake) continue; fed.add(a.speciesId); const p = a.lastWaterLifeIntake;
    close(p.stockBefore - p.stockAfter, p.removedUnits); assert.ok(p.contactDistanceM <= M.feedingDistanceM); assert.equal(p.pool, 'benthicAnimalFood'); assert.equal(p.scope, DEEP_WATER_LIFE_FOOD_SCOPE);
    const organ = deepWaterLifeFeedingPosition({ ...a, position: p.agentPosition, heading: p.agentHeading, pitch: p.agentPitch }); assert.deepEqual(p.feedingPosition, organ);
    close(p.energyAfter - p.energyBefore, p.removedUnits * M.energyGainPerUnit); assert.ok(deepWaterLifePositionValid(f.generator, f.region, a, p.agentPosition, p.agentHeading, p.agentPitch));
  }
  assert.deepEqual([...fed].sort(), [...DEEP_WATER_LIFE_IDS].sort()); assert.equal(f.region.deepWaterLife.counters.feedings, 2);
  assert.ok(f.region.deepWaterLifeAgents.some(a => a.feedingCount === 0)); assert.ok(validateDeepWaterLifeRecord(record(f.region), f.region, { generator: f.generator }));
  const s = deepWaterLifeSnapshot(f.region); assert.deepEqual(s.resources, {}); assert.equal(s.foodLedger, null);
  if (process.env.DEEP_WATER_LIFE_CONTINUATION_RECEIPT) await writeFile(process.env.DEEP_WATER_LIFE_CONTINUATION_RECEIPT, JSON.stringify({ owner: f.region.id, nativeSeconds: f.region.sim.timeSec,
    counters: s.counters, nativeResources: f.region.sim.resources, nativeFoodLedger: f.region.sim.ledger, newEnergyLedger: f.region.deepWaterEnergyLedger,
    foodBudgetError: s.foodBudgetError, energyBudgetError: s.energyBudgetError, individuals: f.region.deepWaterLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId,
      sizeM: a.sizeM, sizeMeasure: deepWaterLifeSpeciesById[a.speciesId].sizeMeasure, home: a.home, position: a.position, timeSec: a.timeSec, travelledM: a.travelledM, feedingCount: a.feedingCount,
      lastWaterLifeIntake: a.lastWaterLifeIntake })) }, null, 2));
});

test('full appendage, turn, target and depth tests reject off-centre obstructions and peer occupancy without treating mantle or SL as the whole body', () => {
  const f = born(), a = f.region.deepWaterLifeAgents[0], e = deepWaterLifeSpeciesById[a.speciesId].normalizedEnvelope,
    corner = world(a, { x: e.x[1], y: e.y[1], z: e.z[1] }), g = f.generator;
  const barrier = { ...g, heightAt: (x, z) => Math.hypot(x - corner.x, z - corner.z) < .00001 ? corner.y + .1 : g.heightAt(x, z) };
  assert.equal(barrier.heightAt(a.position.x, a.position.z), g.heightAt(a.position.x, a.position.z)); assert.equal(deepWaterLifePositionValid(barrier, f.region, a), false);
  assert.equal(deepWaterLifePositionValid(g, f.region, a, a.position, a.heading, .121), false);
  const below = { ...a.position, y: a.position.y - .2 }, above = { ...a.position, y: a.position.y + 9 };
  assert.equal(deepWaterLifePositionValid(g, f.region, a, below), false); assert.equal(deepWaterLifePositionValid(g, f.region, a, above), false);
  f.region.deepHardLifeAgents = [{ id: 'closed-live', speciesId: 'alternating-quill-black-coral', position: clone(a.position), sizeM: .4, alive: true }];
  assert.equal(deepWaterLifePositionValid(g, f.region, a, a.position, a.heading, a.pitch, { occupancy: true }), false);
});

test('actual empty native donor food and observer light cannot create condition gain or pools, and closed hard food is never an alternative donor', () => {
  const dark = born(173, 8, true), lit = born(173, 8, true);
  advance(dark, 40, { foodSupply: 0, currentMps: .18, hour: 0, observerLight: 0 }, true); advance(lit, 40, { foodSupply: 0, currentMps: .18, hour: 12, observerLight: 1 }, true);
  assert.deepEqual(captureDeepWaterLife(dark.region), captureDeepWaterLife(lit.region)); assert.equal(dark.region.deepWaterLife.counters.feedings, 0);
  assert.equal(dark.region.deepWaterEnergyLedger.feedingGain, 0); assert.ok(dark.region.deepWaterLifeAgents.every(a => a.energy < .8 && a.lastFeedAt === null));
  assert.equal(deepWaterLifeSnapshot(dark.region).foodLedger, null); assert.equal(deepWaterLifeSnapshot(dark.region).resources.deepWaterAnimalFood, undefined);
});

test('duplicate, skipped and invalid native steps, reserved old markers and partial new runtime state reject before movement or any donor debit', () => {
  const f = born(); advance(f, 1); const saved = captureDeepWaterLife(f.region), stock = native(f.region.sim);
  assert.equal(tickDeepWaterLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepWaterLife(f.region), saved); assert.deepEqual(native(f.region.sim), stock);
  f.region.sim.step(.2); const afterOld = native(f.region.sim); assert.equal(tickDeepWaterLife(f.region, f.generator, .1), false); assert.deepEqual(captureDeepWaterLife(f.region), saved); assert.deepEqual(native(f.region.sim), afterOld);
  for (const dt of [0, .2, NaN, Infinity]) assert.equal(tickDeepWaterLife(f.region, f.generator, dt), false);
  for (const mutate of [r => r.deepWaterUnknown = 1, r => r.deepWaterLifeAgents[0].deepHardIndividualVersion = 1,
    r => r.sim.agents[0].deepWaterSiteId = 'partial', r => r.deepWaterLife.birthPlacements.pop()]) {
    const bad = born(); mutate(bad.region); bad.region.sim.step(.1); const before = captureDeepWaterLife(bad.region), nativeBefore = native(bad.region.sim);
    assert.equal(tickDeepWaterLife(bad.region, bad.generator, .1), false); assert.deepEqual(captureDeepWaterLife(bad.region), before); assert.deepEqual(native(bad.region.sim), nativeBefore);
  }
});

test('cold saved swimmer histories reproduce the exact next step and dead individuals keep their clocks, mouth receipt and geometry without replacement', () => {
  const f = born(); advance(f, 240); const cold = fixture(); cold.region = cold.ecology._restore(f.ecology._record(f.region), f.region.cx, f.region.cz);
  assert.deepEqual(captureDeepWaterLife(cold.region), captureDeepWaterLife(f.region)); advance(f, 1); advance(cold, 1);
  assert.deepEqual(captureDeepWaterLife(cold.region), captureDeepWaterLife(f.region)); assert.deepEqual(native(cold.region.sim), native(f.region.sim));
  const a = f.region.deepWaterLifeAgents.find(a => a.lastWaterLifeIntake); assert.ok(a);
  f.region.deepWaterEnergyLedger.deathLoss += a.energy; a.energy = 0; a.alive = false; a.state = 'dead'; a.stateSince = a.timeSec; a.velocity = { x: 0, y: 0, z: 0 }; f.region.deepWaterLife.counters.deaths++;
  const corpse = clone(a), ids = f.region.deepWaterLifeAgents.map(a => a.id); advance(f, 10); assert.deepEqual(a, corpse); assert.deepEqual(f.region.deepWaterLifeAgents.map(a => a.id), ids);
  assert.equal(initializeDeepWaterLife(f.generator, f.region, { fresh: true }), false); assert.ok(validateDeepWaterLifeRecord(record(f.region), f.region, { generator: f.generator }));
});

test('partial or masquerading raw states, missing rosters, invented sizes, unreachable targets, food witnesses and broken counters or condition fail closed', () => {
  const f = born(); advance(f, 240); const good = record(f.region), fed = good.deepWaterLifeAgents.findIndex(a => a.lastWaterLifeIntake); assert.ok(fed >= 0);
  for (const key of ['deepWaterLifeVersion', 'deepWaterLifeInitializedAtSec', 'deepWaterLife', 'deepWaterLifeAgents', 'deepWaterEnergyLedger']) {
    const partial = { state: good.state, [key]: clone(good[key]) }; assert.equal(validateDeepWaterLifeRecord(partial, f.region, { generator: f.generator }), false);
  }
  const mutations = [r => r.deepWaterUnknown = 1, r => r.state.deepWaterUnknown = 1, r => r.deepWaterLifeAgents.pop(), r => r.deepWaterLife.addedIds.pop(),
    r => r.deepWaterLife.birthPlacements[0].sizeM *= 1.1, r => r.deepWaterLifeAgents[0].deepBenthicIndividualVersion = 1, r => r.deepWaterLifeAgents[0].predatorSpecies = 'reserved',
    r => r.deepWaterLifeAgents[0].home.y += .01, r => r.deepWaterLifeAgents[0].target.y -= 1, r => r.deepWaterLifeAgents[0].pitch = .13,
    r => r.deepWaterLifeAgents[0].deepWaterFoodPatchId = 'remote', r => r.deepWaterLifeAgents[fed].lastWaterLifeIntake.stockAfter += .00001,
    r => r.deepWaterLifeAgents[fed].lastWaterLifeIntake.feedingPosition.x += .01, r => r.deepWaterLifeAgents[fed].lastWaterLifeIntake.foodPosition.z += .01,
    r => r.deepWaterLifeAgents[fed].lastWaterLifeIntake.agentPitch = 1, r => r.deepWaterEnergyLedger.feedingGain += .1,
    r => r.deepWaterLife.counters.consumedUnits += .1, r => r.deepWaterLifeAgents[0].velocity.x = 2,
    r => r.state.agents[0].deepWaterSiteId = 'partial', r => r.predatorAgents.push(clone(r.deepWaterLifeAgents[0])),
    r => r.deepBenthicAgents.push({ id: 'fake', deepWaterIndividualVersion: 1 }), r => r.deepHardLifeAgents.push({ id: 'fake', speciesId: DEEP_WATER_LIFE_IDS[0] })];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.equal(validateDeepWaterLifeRecord(bad, f.region, { generator: f.generator }), false, mutate.toString()); }
  assert.equal(validateDeepWaterLifeRecord({ state: good.state, predatorAgents: good.predatorAgents, deepBenthicAgents: good.deepBenthicAgents, deepHardLifeAgents: good.deepHardLifeAgents }, f.region, { generator: f.generator }), true);
});
