import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpWaterLifeSpeciesCatalog, kelpWaterLifeSpeciesById } from '../src/kelpWaterLifeSpecies.js';
import { KELP_WATER_LIFE_IDS, KELP_WATER_LIFE_MODEL as MODEL, KELP_WATER_LIFE_FOOD_SCOPE,
  kelpWaterLifeRole, createKelpWaterLifePlan, initializeKelpWaterLife, validateKelpWaterLifeRecord,
  tickKelpWaterLife, captureKelpWaterLife, kelpWaterLifePositionValid, kelpWaterLifeFeedingPosition,
  kelpWaterLifeSnapshot } from '../src/kelpWaterLife.js';

const clone = x => structuredClone(x), close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function fixture(cx = 41, cz = -5, seed = '42') {
  const generator = createKelpOceanGenerator(seed, { supportVersion: 2 }), ecology = new KelpOceanEcology(seed, generator, { waterLife: true });
  return { generator, ecology, region: ecology._create(cx, cz, { waterLifeFresh: true }) };
}
const record = r => ({ state: { agents: clone(r.sim.agents) }, waterAgents: clone(r.waterAgents), visitorAgents: clone(r.visitorAgents),
  kelpBenthicAgents: clone(r.kelpBenthicAgents ?? []), ...captureKelpWaterLife(r) });
const oldState = r => clone({ simAgents: r.sim.agents, time: r.sim.timeSec, ticks: r.sim._ticks, rng: r.sim._rngState,
  ledger: r.sim.ledger, counters: r.sim.counters, events: r.sim.events, prey: r.sim.preyPatches, rocks: r.sim.rockPatches,
  floors: r.sim.floorPatches, leaves: r.sim.leafPatches, kelp: r.sim.kelpPatches, water: r.waterAgents, visitors: r.visitorAgents });
function born(cx = 41, cz = -5) { const f = fixture(cx, cz); assert.equal(initializeKelpWaterLife(f.generator, f.region, { fresh: true }), true); return f; }
function nativeTick(f) { f.region.sim.step(.1); assert.equal(tickKelpWaterLife(f.region, f.generator, .1), true); }
const patchFor = (r, a) => (a.nutritionPool === 'algae' ? r.sim.rockPatches : r.sim.preyPatches).find(p => p.id === a.kelpWaterLifeFoodPatchId);
const totals = r => Object.values(r.sim.resources).reduce((sum, n) => sum + n, 0);

test('native geometry-only pre-budget role and deterministic bounded plan admit four distinct full-form taxa and a real school', () => {
  const f = fixture(), r = f.region, before = oldState(r);
  assert.equal(kelpWaterLifeRole(f.generator, r.cx, r.cz), true);
  assert.equal(kelpWaterLifeRole(f.generator, 32, -4), false);
  assert.equal(kelpWaterLifeRole({ ...f.generator, supportVersion: 1 }, r.cx, r.cz), false);
  assert.deepEqual(kelpWaterLifeSpeciesCatalog.map(s => s.id), KELP_WATER_LIFE_IDS);
  const first = createKelpWaterLifePlan(f.generator, r, { availableSlots: 7 }), next = createKelpWaterLifePlan(f.generator, r, { availableSlots: 7 });
  assert.deepEqual(first, next); assert.deepEqual(oldState(r), before); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.placements));
  assert.equal(first.placements.length, 7); assert.equal(first.groups.length, 1); assert.equal(first.groups[0].memberIds.length, 4);
  assert.deepEqual([...new Set(first.placements.map(a => a.speciesId))].sort(), [...KELP_WATER_LIFE_IDS].sort());
  assert.equal(new Set(first.placements.map(a => a.id)).size, first.placements.length);
  for (const a of first.placements) {
    const s = kelpWaterLifeSpeciesById[a.speciesId]; assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
    assert.ok(kelpWaterLifePositionValid(f.generator, r, a)); assert.deepEqual(MODEL.traits[a.speciesId].feedingPointLocal, s.morphology.feedingPointLocal);
  }
  assert.equal(createKelpWaterLifePlan(f.generator, r, { availableSlots: 3 }).placements.length, 0);
  const typed = fixture(41, -5, 42); assert.notDeepEqual(createKelpWaterLifePlan(typed.generator, typed.region, { availableSlots: 7 }), first);
});

test('strict fresh time-zero admission preserves every old stock and clock, writes complete empty owners, and counts dead legacy slots', () => {
  const f = fixture(), before = oldState(f.region);
  assert.equal(initializeKelpWaterLife(f.generator, f.region), false);
  assert.equal(initializeKelpWaterLife(f.generator, f.region, { fresh: true }), true); assert.deepEqual(oldState(f.region), before);
  const saved = record(f.region); assert.equal(validateKelpWaterLifeRecord(saved, f.region, { generator: f.generator }), true);
  assert.equal(initializeKelpWaterLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(record(f.region), saved);
  const empty = born(32, -4); assert.equal(empty.region.kelpWaterLifeAgents.length, 0); assert.equal(empty.region.kelpWaterLife.role, false);
  nativeTick(empty); assert.equal(empty.region.kelpWaterLife.counters.ticks, 1); assert.ok(validateKelpWaterLifeRecord(record(empty.region), empty.region, { generator: empty.generator }));
  const crowded = fixture(), residents = crowded.region.sim.agents.filter(a => a.speciesId !== 'giant-kelp').length;
  crowded.region.waterAgents = Array.from({ length: 20 - residents }, (_, i) => ({ id: `dead:${i}`, speciesId: 'blue-rockfish', alive: false }));
  assert.equal(initializeKelpWaterLife(crowded.generator, crowded.region, { fresh: true }), true); assert.equal(crowded.region.kelpWaterLifeAgents.length, 0);
  const later = fixture(); later.region.sim.step(.1); assert.equal(initializeKelpWaterLife(later.generator, later.region, { fresh: true }), false);
  const marked = fixture(); marked.region.kelpWaterLifeUnknown = {}; assert.equal(initializeKelpWaterLife(marked.generator, marked.region, { fresh: true }), false);
});

test('one finite actual 24-second run advances every individual and real leader, checks full bodies and keeps exact native food accounting', async () => {
  const f = born(), r = f.region, initial = new Map(r.kelpWaterLifeAgents.map(a => [a.id, clone(a.position)])), fed = new Set();
  for (let i = 0; i < 240; i++) {
    const previous = new Map(r.kelpWaterLifeAgents.map(a => [a.id, { position: clone(a.position), heading: a.heading, pitch: a.pitch }]));
    nativeTick(f);
    for (const a of r.kelpWaterLifeAgents) {
      const old = previous.get(a.id); close(a.timeSec, r.sim.timeSec);
      assert.ok(gap(a.position, old.position) <= MODEL.traits[a.speciesId].speedMps * .1 + 1e-8);
      assert.ok(Math.abs(Math.atan2(Math.sin(a.heading - old.heading), Math.cos(a.heading - old.heading))) <= MODEL.maximumTurnRadSec * .1 + 1e-8);
      assert.ok(Math.abs(a.pitch - old.pitch) <= MODEL.maximumPitchTurnRadSec * .1 + 1e-8);
      assert.ok(kelpWaterLifePositionValid(f.generator, r, a, a.position, a.heading, a.pitch, { future: false }));
      if (a.lastWaterLifeIntake) { fed.add(a.speciesId); close(a.lastWaterLifeIntake.stockBefore - a.lastWaterLifeIntake.stockAfter, a.lastWaterLifeIntake.removedUnits); }
    }
    close(totals(r), r.sim.ledger.initial + r.sim.ledger.input - r.sim.ledger.ingested - r.sim.ledger.exported);
  }
  assert.equal(r.kelpWaterLife.counters.ticks, 240); assert.deepEqual([...fed].sort(), [...KELP_WATER_LIFE_IDS].sort());
  assert.ok(r.kelpWaterLifeAgents.every(a => gap(initial.get(a.id), a.position) > 1e-6));
  const group = r.kelpWaterLife.groups[0]; assert.equal(group.memberIds[0], group.leaderId); assert.ok(r.kelpWaterLifeAgents.find(a => a.id === group.leaderId).lastFeedAt !== null);
  assert.ok(validateKelpWaterLifeRecord(record(r), r, { generator: f.generator }));
  if (process.env.KELP_WATER_LIFE_CONTINUATION_RECEIPT) await writeFile(process.env.KELP_WATER_LIFE_CONTINUATION_RECEIPT, JSON.stringify({
    version: 1, status: 'passed-native-model-continuation', ownerId: r.id, seed: '42', durationSec: 24,
    source: 'actual generated owner and original KelpSimulation; no GPU/browser inspection',
    ticks: r.kelpWaterLife.counters.ticks, counters: clone(r.kelpWaterLife.counters), groups: clone(r.kelpWaterLife.groups),
    totalAnimalRecords: r.sim.agents.filter(a => a.speciesId !== 'giant-kelp').length + r.waterAgents.length + r.visitorAgents.length + (r.kelpBenthicAgents?.length ?? 0) + r.kelpWaterLifeAgents.length,
    traits: { maximumPitchRad: MODEL.maximumPitchRad, maximumTurnRadSec: MODEL.maximumTurnRadSec, contactDistanceM: MODEL.contactDistanceM },
    actualFoodLedger: clone(r.sim.ledger), actualFoodTotals: clone(r.sim.resources), resourceBudgetError: r.sim.metrics.resourceBudgetError,
    intakeSpecies: [...fed], agents: r.kelpWaterLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId, timeSec: a.timeSec, state: a.state,
      sizeM: a.sizeM, sizeMeasure: kelpWaterLifeSpeciesById[a.speciesId].sizeMeasure, movedM: gap(initial.get(a.id), a.position),
      position: clone(a.position), velocity: clone(a.velocity), heading: a.heading, pitch: a.pitch, energy: a.energy,
      lastFeedAt: a.lastFeedAt, lastWaterLifeIntake: clone(a.lastWaterLifeIntake) })),
    foodScope: KELP_WATER_LIFE_FOOD_SCOPE, scope: MODEL.note,
  }, null, 2));
});

test('whole pitched body and complete hanging tentacles reject non-root native support, depth, plant and peer overlaps', () => {
  const f = born(), r = f.region, squid = r.kelpWaterLifeAgents.find(a => a.speciesId === 'california-market-squid'), nettle = r.kelpWaterLifeAgents.find(a => a.speciesId === 'pacific-sea-nettle');
  assert.ok(kelpWaterLifePositionValid(f.generator, r, squid));
  const e = kelpWaterLifeSpeciesById[squid.speciesId].normalizedEnvelope, x = squid.position.x + Math.cos(squid.heading) * e.x[1] * squid.sizeM - Math.sin(squid.heading) * e.z[1] * squid.sizeM,
    z = squid.position.z + Math.sin(squid.heading) * e.x[1] * squid.sizeM + Math.cos(squid.heading) * e.z[1] * squid.sizeM;
  const fault = { ...f.generator, heightAt: (px, pz) => Math.hypot(px - x, pz - z) < .00001 ? squid.position.y + 1 : f.generator.heightAt(px, pz) };
  assert.equal(fault.heightAt(squid.position.x, squid.position.z), f.generator.heightAt(squid.position.x, squid.position.z));
  assert.equal(kelpWaterLifePositionValid(fault, r, squid), false);
  assert.equal(kelpWaterLifePositionValid(f.generator, r, nettle, { ...nettle.position, y: .2 }, nettle.heading, 0), false);
  assert.equal(kelpWaterLifePositionValid(f.generator, r, nettle, nettle.position, nettle.heading, .01), false);
  assert.equal(kelpWaterLifePositionValid(f.generator, r, squid, squid.position, squid.heading, .13), false);
  r.understoryPlants.push({ x: squid.position.x, y: squid.position.y - .1, z: squid.position.z, radiusM: .5, heightM: 1 });
  assert.equal(kelpWaterLifePositionValid(f.generator, r, squid), false); r.understoryPlants.pop();
  const peer = r.kelpWaterLifeAgents[0], saved = clone(peer.position); peer.position = clone(squid.position);
  assert.equal(kelpWaterLifePositionValid(f.generator, r, squid, squid.position, squid.heading, squid.pitch, { occupancy: true }), false); peer.position = saved;
});

test('actual organ-to-original-food receipts debit tiny positive stocks exactly while empty host and algae pools provide no intake', () => {
  const f = born(), r = f.region;
  for (let i = 0; i < 25; i++) nativeTick(f);
  for (const id of KELP_WATER_LIFE_IDS) {
    const a = r.kelpWaterLifeAgents.find(a => a.speciesId === id && a.lastWaterLifeIntake); assert.ok(a, id);
    const intake = a.lastWaterLifeIntake; assert.equal(intake.scope, KELP_WATER_LIFE_FOOD_SCOPE); assert.ok(intake.contactDistanceM <= .20);
    close(gap(kelpWaterLifeFeedingPosition(a, intake.agentPosition, intake.heading, intake.pitch), intake.foodPosition), intake.contactDistanceM);
    close(intake.stockBefore - intake.stockAfter, intake.removedUnits);
  }
  const zero = born(), z = zero.region; z.sim.environment.foodSupply = 0;
  for (const p of z.sim.preyPatches) z.sim._remove(p, 'smallPrey', p.smallPrey);
  for (const p of z.sim.rockPatches) z.sim._remove(p, 'algae', p.algae);
  for (const a of z.kelpWaterLifeAgents) a.nextBite = 0;
  z.sim.step(.1);
  for (const p of z.sim.preyPatches) z.sim._remove(p, 'smallPrey', p.smallPrey);
  for (const p of z.sim.rockPatches) z.sim._remove(p, 'algae', p.algae);
  const emptyLedger = clone(z.sim.ledger), conditions = z.kelpWaterLifeAgents.map(a => a.energy);
  assert.equal(tickKelpWaterLife(z, zero.generator, .1), true); assert.deepEqual(z.sim.ledger, emptyLedger);
  assert.ok(z.kelpWaterLifeAgents.every((a, i) => a.lastFeedAt === null && a.energy < conditions[i]));
  const tiny = born(), t = tiny.region, leader = t.kelpWaterLifeAgents[0], patch = patchFor(t, leader);
  t.sim.environment.foodSupply = 0; t.sim._remove(patch, 'smallPrey', patch.smallPrey - 1e-12); leader.nextBite = 0;
  t.sim.step(.1); const before = patch.smallPrey, ingested = t.sim.ledger.ingested;
  assert.equal(tickKelpWaterLife(t, tiny.generator, .1), true); assert.ok(leader.lastWaterLifeIntake?.removedUnits > 0);
  close(leader.lastWaterLifeIntake.removedUnits, before, 1e-16); close(t.sim.ledger.ingested - ingested, before, 1e-16); assert.equal(patch.smallPrey, 0);
});

test('repeat, skipped, fractional and damaged native tick requests reject before any new-individual or native-ledger mutation', () => {
  const f = born(); nativeTick(f); const snapshot = captureKelpWaterLife(f.region), ledger = clone(f.region.sim.ledger);
  for (const dt of [.1, .05, 0, Infinity, NaN]) { assert.equal(tickKelpWaterLife(f.region, f.generator, dt), false); assert.deepEqual(captureKelpWaterLife(f.region), snapshot); assert.deepEqual(f.region.sim.ledger, ledger); }
  f.region.sim.step(.2); assert.equal(tickKelpWaterLife(f.region, f.generator, .1), false); assert.deepEqual(captureKelpWaterLife(f.region), snapshot);
  const bad = born(); bad.region.kelpWaterLifeAgents[0].kelpWaterLifeUnknown = true; bad.region.sim.step(.1);
  const captured = captureKelpWaterLife(bad.region), native = oldState(bad.region); assert.equal(tickKelpWaterLife(bad.region, bad.generator, .1), false);
  assert.deepEqual(captureKelpWaterLife(bad.region), captured); assert.deepEqual(oldState(bad.region), native);
});

test('full capture and cold native replay preserve complete rosters, actual conditions, future steps and frozen dead leader identity', () => {
  const f = born(), r = f.region; for (let i = 0; i < 25; i++) nativeTick(f);
  r.kelpWaterLifeAgents[0].energy = 1e-10; nativeTick(f);
  const dead = clone(r.kelpWaterLifeAgents[0]), roster = clone(r.kelpWaterLife.groups); assert.equal(dead.alive, false); assert.equal(dead.stateSince, dead.timeSec);
  for (let i = 0; i < 3; i++) nativeTick(f); assert.deepEqual(r.kelpWaterLifeAgents[0], dead); assert.deepEqual(r.kelpWaterLife.groups, roster);
  const cold = fixture(), state = f.ecology._record(r).state;
  for (const [key, value] of Object.entries(state)) cold.region.sim[key] = clone(value);
  cold.region.sim.hostById = new Map(cold.region.sim.agents.filter(a => a.speciesId === 'giant-kelp').map(a => [a.id, a]));
  cold.region.sim.groundPatches = [...cold.region.sim.rockPatches, ...cold.region.sim.floorPatches];
  Object.assign(cold.region, captureKelpWaterLife(r)); assert.ok(validateKelpWaterLifeRecord(record(cold.region), cold.region, { generator: cold.generator }));
  assert.deepEqual(captureKelpWaterLife(cold.region), captureKelpWaterLife(r)); assert.equal(initializeKelpWaterLife(cold.generator, cold.region, { fresh: true }), false);
  nativeTick(f); nativeTick(cold); assert.deepEqual(captureKelpWaterLife(cold.region), captureKelpWaterLife(r));
  const view = kelpWaterLifeSnapshot(r); view.agents[0].position.x += 99; assert.deepEqual(r.kelpWaterLifeAgents[0], dead);
});

test('partial and unknown markers, wrong old arrays, broken rosters, forged hosts, poses and receipts reject without repair', () => {
  const f = born(); for (let i = 0; i < 25; i++) nativeTick(f); const good = record(f.region);
  assert.equal(validateKelpWaterLifeRecord({ state: { agents: f.region.sim.agents } }, f.region, { generator: f.generator }), true);
  for (const field of ['kelpWaterLifeVersion', 'kelpWaterLifeInitializedAtSec', 'kelpWaterLife', 'kelpWaterLifeAgents'])
    assert.equal(validateKelpWaterLifeRecord({ state: good.state, [field]: clone(good[field]) }, f.region, { generator: f.generator }), false);
  const mutate = [
    x => x.kelpWaterLifeUnknown = {}, x => x.kelpWaterLifeAgents[0].kelpWaterLifeUnknown = 1,
    x => x.kelpWaterLifeAgents[0].sizeM *= 1.05, x => x.kelpWaterLifeAgents[0].kelpWaterLifeHostId = 'invented-host',
    x => x.kelpWaterLifeAgents[0].target.y = 999, x => x.kelpWaterLifeAgents[0].timeSec -= .1,
    x => x.kelpWaterLife.groups[0].memberIds.pop(), x => x.kelpWaterLife.groups[0].leaderId = 'invented-leader',
    x => x.kelpWaterLife.counters.ticks++, x => x.kelpWaterLife.counters.consumedUnits = 10,
    x => x.kelpWaterLifeAgents.find(a => a.lastWaterLifeIntake).lastWaterLifeIntake.foodPosition.x += .3,
    x => x.kelpWaterLifeAgents.find(a => a.lastWaterLifeIntake).lastWaterLifeIntake.removedUnits *= 2,
    x => x.kelpWaterLifeAgents.push(clone(x.kelpWaterLifeAgents[0])),
    x => x.state.agents.push(clone(x.kelpWaterLifeAgents[0])), x => x.state.agents[0].kelpWaterLifeUnknown = 1,
    x => x.waterAgents.push(clone(x.kelpWaterLifeAgents[0])), x => x.kelpBenthicAgents.push(clone(x.kelpWaterLifeAgents[0])),
  ];
  for (const change of mutate) { const bad = clone(good); change(bad); assert.equal(validateKelpWaterLifeRecord(bad, f.region, { generator: f.generator }), false); }
  assert.equal(validateKelpWaterLifeRecord(good, f.region, { generator: f.generator, capacity: NaN }), false);
  assert.deepEqual(record(f.region), good);
});
