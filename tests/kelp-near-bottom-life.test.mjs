import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpNearBottomLifeSpeciesCatalog, kelpNearBottomLifeSpeciesById } from '../src/kelpNearBottomLifeSpecies.js';
import { KELP_NEAR_BOTTOM_LIFE_IDS as IDS, KELP_NEAR_BOTTOM_LIFE_MODEL as M, KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE,
  kelpNearBottomLifeRole, createKelpNearBottomLifePlan, initializeKelpNearBottomLife, captureKelpNearBottomLife,
  validateKelpNearBottomLifeRecord, tickKelpNearBottomLife, kelpNearBottomLifePositionValid, kelpNearBottomLifeFeedingPosition,
  kelpNearBottomLifeSnapshot, kelpNearBottomLifeFoodBudgetError, kelpNearBottomLifeEnergyBudgetError } from '../src/kelpNearBottomLife.js';

const clone = x => structuredClone(x), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (a, b = 0, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(cx = 53, cz = -4) { const generator = createKelpOceanGenerator('42', { supportVersion: 2 }), ecology = new KelpOceanEcology('42', generator, { waterLife: true });
  return { generator, ecology, region: ecology._create(cx, cz, { waterLifeFresh: true }) }; }
const old = r => clone({ rng: r.sim._rngState, time: r.sim.timeSec, ticks: r.sim._ticks, agents: r.sim.agents, ledger: r.sim.ledger, counters: r.sim.counters,
  events: r.sim.events, prey: r.sim.preyPatches, rocks: r.sim.rockPatches, floors: r.sim.floorPatches, leaves: r.sim.leafPatches, kelp: r.sim.kelpPatches,
  water: r.waterAgents, visitors: r.visitorAgents, benthic: r.kelpBenthicAgents ?? [], waterLife: r.kelpWaterLifeAgents ?? [] });
const record = r => ({ state: { agents: clone(r.sim.agents) }, waterAgents: clone(r.waterAgents), visitorAgents: clone(r.visitorAgents),
  kelpBenthicAgents: clone(r.kelpBenthicAgents ?? []), kelpWaterLifeAgents: clone(r.kelpWaterLifeAgents ?? []), ...captureKelpNearBottomLife(r) });
function born(cx = 53, cz = -4) { const f = fixture(cx, cz); assert.equal(initializeKelpNearBottomLife(f.generator, f.region, { fresh: true }), true); return f; }
function step(f) { f.region.sim.step(.1); const before = old(f.region); assert.equal(tickKelpNearBottomLife(f.region, f.generator, .1), true); assert.deepEqual(old(f.region), before); }

test('one geometry-only kit deterministically admits four distinct independently measured taxa without touching old RNG, geometry or food', () => {
  const f = fixture(), r = f.region, previous = old(r);
  assert.equal(kelpNearBottomLifeRole(f.generator, r.cx, r.cz), true); assert.equal(kelpNearBottomLifeRole(f.generator, 52, -4), false);
  assert.equal(kelpNearBottomLifeRole({ ...f.generator, supportVersion: 1 }, r.cx, r.cz), false);
  assert.deepEqual(kelpNearBottomLifeSpeciesCatalog.map(s => s.id), IDS);
  const first = createKelpNearBottomLifePlan(f.generator, r, { availableSlots: 4 }), next = createKelpNearBottomLifePlan(f.generator, r, { availableSlots: 4 });
  assert.deepEqual(first, next); assert.deepEqual(old(r), previous); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.placements));
  assert.deepEqual(first.placements.map(a => a.speciesId), IDS); assert.equal(new Set(first.placements.map(a => a.id)).size, 4);
  assert.ok(first.foodPatches.every(p => p.amount === 0 && p.pool === 'benthicAnimalFood'));
  for (const a of first.placements) { const s = kelpNearBottomLifeSpeciesById[a.speciesId]; assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
    assert.ok(kelpNearBottomLifePositionValid(f.generator, r, a)); assert.equal(a.pitch === 0, ['crab', 'ray'].includes(s.kind)); }
  assert.equal(createKelpNearBottomLifePlan(f.generator, r, { availableSlots: 0 }).placements.length, 0);
});

test('strict fresh zero-clock admission preserves five old arrays, counts dead records and permanently marks full or naturally empty owners', () => {
  const f = fixture(), previous = old(f.region); assert.equal(initializeKelpNearBottomLife(f.generator, f.region), false);
  assert.equal(initializeKelpNearBottomLife(f.generator, f.region, { fresh: true }), true); assert.deepEqual(old(f.region), previous);
  assert.ok(validateKelpNearBottomLifeRecord(record(f.region), f.region, { generator: f.generator })); const saved = record(f.region);
  assert.equal(initializeKelpNearBottomLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(record(f.region), saved);
  const empty = born(52, -4); assert.equal(empty.region.kelpNearBottomLifeAgents.length, 0); assert.equal(empty.region.kelpNearBottomLife.foodPatches.length, 0); step(empty);
  assert.ok(validateKelpNearBottomLifeRecord(record(empty.region), empty.region, { generator: empty.generator }));
  const crowded = fixture(), n = crowded.region.sim.agents.filter(a => a.speciesId !== 'giant-kelp').length;
  crowded.region.kelpWaterLifeAgents = Array.from({ length: 20 - n }, (_, i) => ({ id: `dead:${i}`, speciesId: 'opaleye', alive: false }));
  assert.equal(initializeKelpNearBottomLife(crowded.generator, crowded.region, { fresh: true }), true); assert.equal(crowded.region.kelpNearBottomLifeAgents.length, 0);
  const partial = fixture(); assert.equal(initializeKelpNearBottomLife(partial.generator, partial.region, { fresh: true, maxAdded: 1 }), true); assert.equal(partial.region.kelpNearBottomLifeAgents.length, 1);
  const late = fixture(); late.region.sim.step(.1); assert.equal(initializeKelpNearBottomLife(late.generator, late.region, { fresh: true }), false);
  const marker = fixture(); marker.region.kelpNearBottomUnknown = true; assert.equal(initializeKelpNearBottomLife(marker.generator, marker.region, { fresh: true }), false);
});

test('a finite actual 24-second native run moves every whole animal and accounts real mouth contact without changing any original pool or ledger', async () => {
  const f = born(), r = f.region, starts = new Map(r.kelpNearBottomLifeAgents.map(a => [a.id, clone(a.position)]));
  for (let i = 0; i < 240; i++) { const prior = new Map(r.kelpNearBottomLifeAgents.map(a => [a.id, { position: clone(a.position), heading: a.heading, pitch: a.pitch }])); step(f);
    for (const a of r.kelpNearBottomLifeAgents) { const p = prior.get(a.id); assert.equal(a.timeSec, r.sim._ticks * .1); close(a.timeSec, r.sim.timeSec);
      assert.ok(distance(a.position, p.position) <= M.traits[a.speciesId].speedMps * .1 + 1e-8);
      assert.ok(Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) <= M.traits[a.speciesId].speedMps + 1e-8);
      assert.ok(Math.abs(Math.atan2(Math.sin(a.heading - p.heading), Math.cos(a.heading - p.heading))) <= M.maximumTurnRadSec * .1 + 1e-8);
      assert.ok(Math.abs(a.pitch - p.pitch) <= M.maximumPitchTurnRadSec * .1 + 1e-8);
      assert.ok(kelpNearBottomLifePositionValid(f.generator, r, a, a.position, a.heading, a.pitch, { future: false })); }
    close(kelpNearBottomLifeFoodBudgetError(r)); close(kelpNearBottomLifeEnergyBudgetError(r));
  }
  assert.equal(r.kelpNearBottomLife.counters.ticks, 240); assert.ok(r.kelpNearBottomLifeAgents.every(a => a.travelledM > 0 && distance(a.position, starts.get(a.id)) > 0));
  assert.deepEqual(r.kelpNearBottomLifeAgents.filter(a => a.feedingCount > 0).map(a => a.speciesId), IDS);
  assert.ok(validateKelpNearBottomLifeRecord(record(r), r, { generator: f.generator }));
  if (process.env.KELP_NEAR_BOTTOM_CONTINUATION_RECEIPT) await writeFile(process.env.KELP_NEAR_BOTTOM_CONTINUATION_RECEIPT, JSON.stringify({ version: 1,
    status: 'passed-native-single-owner-continuation', ownerId: r.id, seed: '42', durationSec: 24, ticks: 240,
    source: 'actual generated owner and KelpSimulation; selected new bed control volumes initially zero; no browser/GPU claim',
    counters: clone(r.kelpNearBottomLife.counters), foodLedger: clone(r.kelpNearBottomLife.foodLedger), foodPatches: clone(r.kelpNearBottomLife.foodPatches), energyLedger: clone(r.kelpNearBottomEnergyLedger),
    foodBalanceError: kelpNearBottomLifeFoodBudgetError(r), energyBalanceError: kelpNearBottomLifeEnergyBudgetError(r), foodScope: KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE,
    agents: r.kelpNearBottomLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM, sizeMeasure: kelpNearBottomLifeSpeciesById[a.speciesId].sizeMeasure,
      timeSec: a.timeSec, state: a.state, travelledM: a.travelledM, displacementM: distance(a.position, starts.get(a.id)), position: clone(a.position), feedingCount: a.feedingCount, consumedUnits: a.consumedUnits, lastNearBottomIntake: clone(a.lastNearBottomIntake) })) }, null, 2));
});

test('complete appendages, grounded eight feet, pitched fins and ray soft-floor footprint reject real support and plant hazards', async () => {
  const f = born(), r = f.region, shark = r.kelpNearBottomLifeAgents.find(a => a.speciesId === 'horn-shark'), ray = r.kelpNearBottomLifeAgents.find(a => a.speciesId === 'round-stingray'), crab = r.kelpNearBottomLifeAgents[0], e = kelpNearBottomLifeSpeciesById[shark.speciesId].normalizedEnvelope;
  const c = Math.cos(shark.heading), s = Math.sin(shark.heading), cp = Math.cos(shark.pitch), sp = Math.sin(shark.pitch), x = shark.position.x + shark.sizeM * (c * cp * e.x[1] - c * sp * e.y[1] - s * e.z[1]), z = shark.position.z + shark.sizeM * (s * cp * e.x[1] - s * sp * e.y[1] + c * e.z[1]);
  const hazard = { ...f.generator, heightAt: (px, pz) => Math.hypot(px - x, pz - z) < 1e-5 ? shark.position.y + 1 : f.generator.heightAt(px, pz) };
  assert.equal(hazard.heightAt(shark.position.x, shark.position.z), f.generator.heightAt(shark.position.x, shark.position.z)); assert.equal(kelpNearBottomLifePositionValid(hazard, r, shark), false);
  assert.equal(kelpNearBottomLifePositionValid(f.generator, r, shark, shark.position, shark.heading, .13), false);
  assert.equal(kelpNearBottomLifePositionValid(f.generator, r, ray, ray.position, ray.heading, .01), false);
  assert.equal(kelpNearBottomLifePositionValid(f.generator, r, ray, { ...ray.position, y: ray.position.y + 2 }), false);
  assert.equal(kelpNearBottomLifePositionValid(f.generator, r, crab, { ...crab.position, y: crab.position.y + .03 }), false);
  const rock = f.generator.chunk(r.cx, r.cz).elements.find(p => p.kind === 'rock' && f.generator.supportAt(p.x, p.z).elementId === p.id); assert.ok(rock);
  const aboveRock = { ...ray, position: { x: rock.x, y: f.generator.heightAt(rock.x, rock.z) + .6, z: rock.z }, home: { x: rock.x, y: f.generator.heightAt(rock.x, rock.z) + .6, z: rock.z } };
  assert.equal(f.generator.supportAt(aboveRock.position.x, aboveRock.position.z).substrate, 'rock'); assert.equal(kelpNearBottomLifePositionValid(f.generator, r, aboveRock, aboveRock.position, aboveRock.heading, 0, { checkPlants: false }), false);
  r.understoryPlants.push({ x: shark.position.x, y: shark.position.y - .2, z: shark.position.z, radiusM: .5, heightM: 1 }); assert.equal(kelpNearBottomLifePositionValid(f.generator, r, shark), false); r.understoryPlants.pop();
  const oldPosition = clone(crab.position); crab.position = clone(shark.position); assert.equal(kelpNearBottomLifePositionValid(f.generator, r, shark, shark.position, shark.heading, shark.pitch, { occupancy: true }), false); crab.position = oldPosition;
  // Actual 53,-3 first-round horn pose was clear at birth, then a native
  // stipe reached its stationary envelope at 2.2s. Static terrain remains
  // legal; the complete plant sweep must reject that original pose at birth.
  const former = fixture(53, -3), unsafe = { speciesId: 'horn-shark', sizeM: .7071310651488603, alive: true, heading: 2.8810167491713647, pitch: -.06,
    supportNormal: { x: 0, y: 1, z: 0 }, position: { x: 3415.620423883837, y: -3.3282988892263807, z: -146.04125626866312 } };
  assert.equal(kelpNearBottomLifePositionValid(former.generator, former.region, unsafe, unsafe.position, unsafe.heading, unsafe.pitch, { checkPlants: false }), true);
  assert.equal(kelpNearBottomLifePositionValid(former.generator, former.region, unsafe, unsafe.position, unsafe.heading, unsafe.pitch), false);
  const ordinaryGenerator = createKelpOceanGenerator('42', { forestBelt: true, kelpSeascape: true }), store = { async load() { return null; }, async saveMany() {} },
    ordinary = new KelpOceanEcology('42', ordinaryGenerator, { store, visitors: true, understory: true, forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife: true, nearBottomLife: true });
  await ordinary.update({ x: 3424, z: -224 });
  for (let tick = 0; tick < 22; tick++) ordinary.step(.1, { foodSupply: 1, currentMps: .18, hour: 12 });
  const formerOwner = ordinary._active.get('53,-3'); assert.ok(formerOwner); assert.equal(formerOwner.kelpNearBottomLife.counters.ticks, 22);
  assert.equal(formerOwner.kelpNearBottomLife.lastTickSec, 22 * .1); assert.ok(validateKelpNearBottomLifeRecord(ordinary._record(formerOwner), formerOwner, { generator: ordinaryGenerator }));
  assert.ok(formerOwner.kelpNearBottomLifeAgents.every(a => !a.alive || (a.timeSec === 22 * .1 && kelpNearBottomLifePositionValid(ordinaryGenerator, formerOwner, a, a.position, a.heading, a.pitch, { future: false }))));
});

test('zero supply and empty initial bed volumes give no free food, while actual receipts retain fixed organs, positive tiny debits and bounded stocks', () => {
  const zero = born(), r = zero.region; r.sim.environment.foodSupply = 0; for (let i = 0; i < 20; i++) step(zero);
  assert.equal(r.kelpNearBottomLife.foodLedger.input, 0); assert.equal(r.kelpNearBottomLife.foodLedger.ingested, 0); assert.ok(r.kelpNearBottomLifeAgents.every(a => a.feedingCount === 0));
  assert.ok(r.kelpNearBottomLife.foodPatches.every(p => p.amount === 0));
  const maximumSupply = born(); maximumSupply.region.sim.setEnvironment({ foodSupply: 3 }); step(maximumSupply);
  close(maximumSupply.region.kelpNearBottomLife.foodLedger.input, maximumSupply.region.kelpNearBottomLife.foodPatches.length * M.inputPerPatchSec * 3 * .1);
  const f = born(); for (let i = 0; i < 150; i++) step(f);
  for (const a of f.region.kelpNearBottomLifeAgents.filter(a => a.lastNearBottomIntake)) { const w = a.lastNearBottomIntake;
    assert.equal(w.scope, KELP_NEAR_BOTTOM_LIFE_FOOD_SCOPE); assert.ok(w.removedUnits > 0); close(w.stockBefore - w.stockAfter, w.removedUnits);
    close(distance(kelpNearBottomLifeFeedingPosition(a, w.agentPosition, w.heading, w.pitch, w.supportNormal), w.foodPosition), w.contactDistanceM);
    assert.ok(w.contactDistanceM <= M.maximumFoodDistanceM); assert.equal(w.allowedDistanceM, M.maximumFoodDistanceM); }
  assert.ok(f.region.kelpNearBottomLife.foodPatches.every(p => p.amount <= M.maximumPatchStock));
  assert.ok(f.region.kelpNearBottomLife.foodLedger.exported > 0); close(kelpNearBottomLifeFoodBudgetError(f.region));
  const small = born(), crab = small.region.kelpNearBottomLifeAgents[0]; small.region.sim.environment.foodSupply = 1e-8;
  for (let i = 0; i < 25; i++) step(small);
  assert.ok(crab.lastNearBottomIntake?.removedUnits > 0); assert.ok(crab.lastNearBottomIntake.removedUnits < 1e-10); close(kelpNearBottomLifeFoodBudgetError(small.region), 0, 1e-16);
});

test('integer native clock prevalidation refuses duplicate, skipped, fractional and corrupt ticks before any state or stock mutation', () => {
  const f = born(); step(f); const captured = captureKelpNearBottomLife(f.region), legacy = old(f.region);
  for (const dt of [.1, .05, 0, NaN, Infinity]) { assert.equal(tickKelpNearBottomLife(f.region, f.generator, dt), false); assert.deepEqual(captureKelpNearBottomLife(f.region), captured); assert.deepEqual(old(f.region), legacy); }
  f.region.sim.step(.2); assert.equal(tickKelpNearBottomLife(f.region, f.generator, .1), false); assert.deepEqual(captureKelpNearBottomLife(f.region), captured);
  const bad = born(); bad.region.kelpNearBottomLifeAgents[0].kelpNearBottomUnknown = true; bad.region.sim.step(.1); const before = captureKelpNearBottomLife(bad.region), native = old(bad.region);
  assert.equal(tickKelpNearBottomLife(bad.region, bad.generator, .1), false); assert.deepEqual(captureKelpNearBottomLife(bad.region), before); assert.deepEqual(old(bad.region), native);
  const precision = born(); for (let i = 0; i < 162; i++) step(precision); assert.equal(precision.region.kelpNearBottomLife.lastTickSec, 162 * .1);
});

test('full capture and cold native replay preserve food volumes, future steps and permanently frozen dead records without refilling', () => {
  const f = born(); for (let i = 0; i < 30; i++) step(f); const r = f.region, a = r.kelpNearBottomLifeAgents[0];
  // A recorded pre-test condition loss creates a valid low-condition death
  // fixture; it is not added food, RNG manipulation or a mortality forecast.
  r.kelpNearBottomEnergyLedger.maintenanceAndMotionDebit += a.energy - 1e-10; a.energy = 1e-10; a.nextBite = 999; step(f);
  const dead = clone(a); assert.equal(a.alive, false); assert.equal(a.stateSince, a.timeSec); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, dead);
  const cold = fixture(), state = f.ecology._record(r).state; for (const [k, value] of Object.entries(state)) cold.region.sim[k] = clone(value);
  cold.region.sim.hostById = new Map(cold.region.sim.agents.filter(a => a.speciesId === 'giant-kelp').map(a => [a.id, a])); cold.region.sim.groundPatches = [...cold.region.sim.rockPatches, ...cold.region.sim.floorPatches];
  Object.assign(cold.region, captureKelpNearBottomLife(r)); assert.ok(validateKelpNearBottomLifeRecord(record(cold.region), cold.region, { generator: cold.generator }));
  assert.equal(initializeKelpNearBottomLife(cold.generator, cold.region, { fresh: true }), false); step(f); step(cold); assert.deepEqual(captureKelpNearBottomLife(cold.region), captureKelpNearBottomLife(r));
  const view = kelpNearBottomLifeSnapshot(r); view.agents[0].position.x += 90; view.foodPatches[0].amount = 99; assert.deepEqual(a, dead); close(kelpNearBottomLifeFoodBudgetError(r));
});

test('partial markers, unknown prefixes, wrong arrays, original-controller disguise and corrupted support, food, energy or receipt histories fail closed', () => {
  const f = born(); for (let i = 0; i < 30; i++) step(f); const good = record(f.region), valid = raw => validateKelpNearBottomLifeRecord(raw, f.region, { generator: f.generator });
  assert.equal(valid({ state: good.state }), true); for (const field of Object.keys(captureKelpNearBottomLife(f.region))) assert.equal(valid({ state: good.state, [field]: clone(good[field]) }), false);
  const changes = [x => x.kelpNearBottomUnknown = true, x => x.kelpNearBottomLifeAgents[0].kelpNearBottomUnknown = true,
    x => x.kelpNearBottomLifeAgents[0].kelpBenthicIndividualVersion = 1, x => x.kelpNearBottomLifeAgents[0].kelpWaterLifeIndividualVersion = 1,
    x => x.kelpNearBottomLifeAgents[0].sizeM *= 1.01, x => x.kelpNearBottomLifeAgents[0].target.y = 99,
    x => x.kelpNearBottomLifeAgents[0].timeSec -= .1, x => x.kelpNearBottomLifeAgents[0].supportNormal.y = .5,
    x => x.kelpNearBottomLife.foodPatches[0].position.y += .1, x => x.kelpNearBottomLife.foodPatches[0].amount += .001,
    x => x.kelpNearBottomLife.foodPatches[0].nativePatchId = 'made-up-bed', x => x.kelpNearBottomLife.foodLedger.byPool.benthicAnimalFood.input += .001,
    x => x.kelpNearBottomEnergyLedger.feedingGain += .001, x => x.kelpNearBottomLife.addedIds.pop(), x => x.kelpNearBottomLife.counters.ticks++,
    x => x.kelpNearBottomLifeAgents[0].lastNearBottomIntake.foodPosition.x += .1,
    x => x.kelpNearBottomLifeAgents[0].lastNearBottomIntake.removedUnits *= 2,
    x => x.state.agents.push(clone(x.kelpNearBottomLifeAgents[0])), x => x.state.agents[0].kelpNearBottomUnknown = true,
    ...['waterAgents', 'visitorAgents', 'kelpBenthicAgents', 'kelpWaterLifeAgents'].map(key => x => x[key].push(clone(x.kelpNearBottomLifeAgents[0]))),
    x => x.kelpNearBottomLifeAgents = null];
  for (const change of changes) { const raw = clone(good); change(raw); assert.equal(valid(raw), false); }
  assert.equal(validateKelpNearBottomLifeRecord(good, f.region, { generator: f.generator, capacity: NaN }), false); assert.deepEqual(record(f.region), good);
});
