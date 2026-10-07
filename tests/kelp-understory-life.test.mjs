import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpUnderstoryLifeSpeciesCatalog, kelpUnderstoryLifeSpeciesById } from '../src/kelpUnderstoryLifeSpecies.js';
import { KELP_UNDERSTORY_LIFE_IDS as IDS, KELP_UNDERSTORY_LIFE_PLANT_IDS as PLANTS, KELP_UNDERSTORY_LIFE_ANIMAL_IDS as ANIMALS,
  KELP_UNDERSTORY_LIFE_MODEL as M, KELP_UNDERSTORY_LIFE_FOOD_SCOPE, kelpUnderstoryLifeRole, createKelpUnderstoryLifePlan,
  initializeKelpUnderstoryLife, captureKelpUnderstoryLife, validateKelpUnderstoryLifeRecord, tickKelpUnderstoryLife,
  kelpUnderstoryLifeBodyPoints, kelpUnderstoryLifeBounds, kelpUnderstoryLifePointClearance, kelpUnderstoryLifePositionValid,
  kelpUnderstoryLifeFeedingPosition, kelpUnderstoryLifeSnapshot, kelpUnderstoryLifeFoodBudgetError,
  kelpUnderstoryLifeEnergyBudgetError } from '../src/kelpUnderstoryLife.js';

const clone = x => structuredClone(x), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (a, b = 0, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(cx = 58, cz = -4) {
  const generator = createKelpOceanGenerator('42', { forestBelt: true, kelpSeascape: true }),
    ecology = new KelpOceanEcology('42', generator, { store: { async load() { return null; }, async saveMany() {} },
      visitors: true, understory: true, forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife: true, nearBottomLife: true });
  return { generator, ecology, region: ecology._prepareForestOwner(null, cx, cz).region };
}
const old = f => Object.fromEntries(Object.entries(clone(f.ecology._record(f.region))).filter(([k]) => !k.startsWith('kelpUnderstory')));
const record = f => f.ecology._record(f.region);
function born(cx = 58, cz = -4) { const f = fixture(cx, cz); assert.equal(initializeKelpUnderstoryLife(f.generator, f.region, { fresh: true }), true); return f; }
function step(f) { f.region.sim.step(.1); const before = old(f); assert.equal(tickKelpUnderstoryLife(f.region, f.generator, .1), true); assert.deepEqual(old(f), before); }
const valid = f => validateKelpUnderstoryLifeRecord(record(f), f.region, { generator: f.generator });

test('native seeded rock community deterministically adds persistent plants and independent attached animals without changing old generation, RNG or pools', () => {
  const f = fixture(), r = f.region, before = old(f);
  assert.deepEqual(kelpUnderstoryLifeSpeciesCatalog.map(s => s.id), IDS); assert.equal(kelpUnderstoryLifeRole(f.generator, 58, -4), true);
  assert.equal(kelpUnderstoryLifeRole(f.generator, 59, -4), true); assert.equal(kelpUnderstoryLifeRole({ ...f.generator, supportVersion: 1 }, 58, -4), false);
  const first = createKelpUnderstoryLifePlan(f.generator, r, { availableSlots: 4 }), next = createKelpUnderstoryLifePlan(f.generator, r, { availableSlots: 4 });
  assert.deepEqual(first, next); assert.deepEqual(old(f), before); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.plants));
  assert.equal(first.placements.length, 4); assert.ok(first.plants.length > 0 && first.plants.length <= 12);
  assert.deepEqual([...new Set(first.placements.map(a => a.speciesId))], ANIMALS); assert.deepEqual([...new Set(first.plants.map(a => a.speciesId))], PLANTS);
  for (const a of [...first.placements, ...first.plants]) { const s = kelpUnderstoryLifeSpeciesById[a.speciesId]; assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
    assert.equal(a.pitch, 0); assert.ok(kelpUnderstoryLifePositionValid(f.generator, r, a)); assert.equal(kelpUnderstoryLifeBodyPoints(a).length, 27);
    for (const p of kelpUnderstoryLifeBodyPoints(a)) assert.ok(f.generator.surfaceY - p.y >= s.depthSelectionM[0] && f.generator.surfaceY - p.y <= s.depthSelectionM[1]); }
  assert.equal(createKelpUnderstoryLifePlan(f.generator, r, { availableSlots: 0 }).placements.length, 0);
});

test('strict fresh zero-clock admission counts all dead/live old records, leaves old scenery separate and seals full or complete empty owners', () => {
  const f = fixture(), before = old(f); assert.equal(initializeKelpUnderstoryLife(f.generator, f.region), false);
  assert.equal(initializeKelpUnderstoryLife(f.generator, f.region, { fresh: true }), true); assert.deepEqual(old(f), before); assert.ok(valid(f));
  assert.equal(f.region.kelpUnderstoryLifeAgents.length, 4); assert.equal(f.region.kelpUnderstoryLife.foodParcels.length, 0); assert.equal(f.region.kelpUnderstoryLife.foodLedger.initial, 0);
  const saved = record(f); assert.equal(initializeKelpUnderstoryLife(f.generator, f.region, { fresh: true }), false); assert.deepEqual(record(f), saved);
  const natural = born(59, -4); assert.ok(natural.region.kelpUnderstoryLife.plants.length > 0); assert.deepEqual(natural.region.kelpUnderstoryLifeAgents, []); step(natural); assert.ok(valid(natural));
  const empty = fixture(59, -4), oldTotal = [empty.region.sim.agents.filter(a => a.speciesId !== 'giant-kelp'), empty.region.waterAgents, empty.region.visitorAgents,
    empty.region.kelpBenthicAgents ?? [], empty.region.kelpWaterLifeAgents ?? [], empty.region.kelpNearBottomLifeAgents ?? []].reduce((n, list) => n + list.length, 0);
  assert.equal(initializeKelpUnderstoryLife(empty.generator, empty.region, { fresh: true, capacity: oldTotal, maxAdded: 0, maxPlants: 0 }), true);
  assert.deepEqual(empty.region.kelpUnderstoryLife.plants, []); assert.deepEqual(empty.region.kelpUnderstoryLifeAgents, []); step(empty); assert.ok(valid(empty));
  const crowded = fixture(); crowded.region.kelpNearBottomLifeAgents.push(...Array.from({ length: 4 }, (_, i) => ({ id: `dead-budget:${i}`, speciesId: 'red-rock-crab', alive: false })));
  assert.equal(initializeKelpUnderstoryLife(crowded.generator, crowded.region, { fresh: true }), true); assert.equal(crowded.region.kelpUnderstoryLifeAgents.length, 0);
  assert.ok(crowded.region.kelpUnderstoryLife.plants.length > 0); assert.ok(valid(crowded));
  const late = fixture(); late.region.sim.step(.1); assert.equal(initializeKelpUnderstoryLife(late.generator, late.region, { fresh: true }), false);
  const marker = fixture(); marker.region.kelpUnderstoryUnknown = true; assert.equal(initializeKelpUnderstoryLife(marker.generator, marker.region, { fresh: true }), false);
  const partial = fixture(); assert.equal(initializeKelpUnderstoryLife(partial.generator, partial.region, { fresh: true, maxAdded: 1, maxPlants: 2 }), true);
  assert.equal(partial.region.kelpUnderstoryLifeAgents.length, 1); assert.equal(partial.region.kelpUnderstoryLife.plants.length, 2);
});

test('finite actual 24-second native continuation transports zero-initial food into real incurrent structures while all attachment roots and old stocks remain exact', async () => {
  const f = born(), r = f.region, fixed = clone([...r.kelpUnderstoryLife.plants, ...r.kelpUnderstoryLifeAgents].map(a => ({ id: a.id, position: a.position, heading: a.heading, supportNormal: a.supportNormal }))), plants = clone(r.kelpUnderstoryLife.plants);
  for (let i = 0; i < 240; i++) { step(f); assert.equal(r.kelpUnderstoryLife.lastTickSec, r.sim._ticks * .1); assert.ok(r.kelpUnderstoryLifeAgents.every(a => a.timeSec === r.sim._ticks * .1));
    assert.ok(valid(f)); close(kelpUnderstoryLifeFoodBudgetError(r)); close(kelpUnderstoryLifeEnergyBudgetError(r)); }
  assert.deepEqual(r.kelpUnderstoryLife.plants, plants); assert.deepEqual([...r.kelpUnderstoryLife.plants, ...r.kelpUnderstoryLifeAgents].map(a => ({ id: a.id, position: a.position, heading: a.heading, supportNormal: a.supportNormal })), fixed);
  assert.equal(r.kelpUnderstoryLife.counters.ticks, 240); assert.ok(r.kelpUnderstoryLife.counters.feedings > 0); assert.ok(r.kelpUnderstoryLife.foodLedger.input > 0 && r.kelpUnderstoryLife.foodLedger.exported > 0);
  for (const a of r.kelpUnderstoryLifeAgents.filter(a => a.lastUnderstoryIntake)) { const w = a.lastUnderstoryIntake; close(distance(kelpUnderstoryLifeFeedingPosition(a), w.foodPosition), w.contactDistanceM);
    assert.ok(w.contactDistanceM <= M.maximumFoodDistanceM); close(w.stockBefore - w.stockAfter, w.removedUnits); assert.equal(w.scope, KELP_UNDERSTORY_LIFE_FOOD_SCOPE); assert.ok(w.removedUnits > 0);
    assert.ok(w.parcelCreatedAtSec < w.timeSec); close(w.foodPosition.x, w.sourcePosition.x + w.parcelTravelM); }
  if (process.env.KELP_UNDERSTORY_CONTINUATION_RECEIPT) await writeFile(process.env.KELP_UNDERSTORY_CONTINUATION_RECEIPT, JSON.stringify({ version: 1, status: 'passed-native-single-owner-continuation',
    ownerId: r.id, seed: '42', durationSec: 24, ticks: 240, source: 'actual generated full-flags owner; independent initially-zero suspension control volumes; no browser/GPU claim',
    foodScope: KELP_UNDERSTORY_LIFE_FOOD_SCOPE, counters: clone(r.kelpUnderstoryLife.counters), foodLedger: clone(r.kelpUnderstoryLife.foodLedger), foodChannels: clone(r.kelpUnderstoryLife.foodChannels),
    foodParcels: clone(r.kelpUnderstoryLife.foodParcels), energyLedger: clone(r.kelpUnderstoryEnergyLedger), foodBalanceError: kelpUnderstoryLifeFoodBudgetError(r), energyBalanceError: kelpUnderstoryLifeEnergyBudgetError(r),
    plants: clone(r.kelpUnderstoryLife.plants), kindSummary: Object.fromEntries(IDS.map(id => [id, { kind: kelpUnderstoryLifeSpeciesById[id].kind, count: [...plants, ...r.kelpUnderstoryLifeAgents].filter(a => a.speciesId === id).length }])),
    agents: r.kelpUnderstoryLifeAgents.map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM, sizeMeasure: kelpUnderstoryLifeSpeciesById[a.speciesId].sizeMeasure,
      timeSec: a.timeSec, state: a.state, position: clone(a.position), feedingCount: a.feedingCount, consumedUnits: a.consumedUnits, lastUnderstoryIntake: clone(a.lastUnderstoryIntake) })) }, null, 2));
});

test('whole forms, real rock holdfasts, native vegetation, old bodies/home/target reservations and new peers share one collision kernel', () => {
  const f = born(), r = f.region, a = r.kelpUnderstoryLife.plants[0], points = kelpUnderstoryLifeBodyPoints(a), far = points.find(p => p.y > a.position.y + .1); assert.ok(far);
  const hazard = { ...f.generator, heightAt: (x, z) => Math.hypot(x - far.x, z - far.z) < 1e-8 ? far.y + .1 : f.generator.heightAt(x, z) };
  assert.equal(hazard.heightAt(a.position.x, a.position.z), f.generator.heightAt(a.position.x, a.position.z)); assert.equal(kelpUnderstoryLifePositionValid(hazard, r, a), false);
  assert.equal(kelpUnderstoryLifePositionValid(f.generator, r, a, { ...a.position, y: a.position.y + .03 }), false); assert.equal(kelpUnderstoryLifePositionValid(f.generator, r, { ...a, pitch: .01 }), false);
  const unsupported = { ...f.generator, supportAt: (x, z) => ({ ...f.generator.supportAt(x, z), elementId: 'different-rock' }) }; assert.equal(kelpUnderstoryLifePositionValid(unsupported, r, a), false);
  r.understoryPlants.push({ x: a.position.x, y: a.position.y, z: a.position.z, radiusM: .2, heightM: 2 }); assert.equal(kelpUnderstoryLifePositionValid(f.generator, r, a), false); r.understoryPlants.pop();
  const resident = r.sim.agents.find(p => p.speciesId !== 'giant-kelp'), previousTarget = clone(resident.target); resident.target = clone(a.position);
  assert.equal(kelpUnderstoryLifePositionValid(f.generator, r, a, a.position, { occupancy: true }), false); resident.target = previousTarget;
  assert.equal(kelpUnderstoryLifePositionValid(f.generator, r, a, a.position, { occupancy: true, paths: r.kelpUnderstoryLife.reservedPaths, extra: [{ ...a, id: 'overlapping-peer' }] }), false);
  const box = kelpUnderstoryLifeBounds(a); assert.equal(kelpUnderstoryLifePointClearance(a.position, a), 0); assert.ok(kelpUnderstoryLifePointClearance({ x: box.x[1] + 1, y: a.position.y, z: a.position.z }, a) >= 1);
  const s = kelpUnderstoryLifeSpeciesById[a.speciesId]; assert.equal(s.support.footprintContactPointsLocal.length, 4); assert.ok(r.kelpUnderstoryLife.reservedPaths.every(p => p.scope.includes('home-target-patrol')));
});

test('zero supply or flow creates no free input; real fast transport, positive tiny intakes and accounted outlet exports keep bounded food', () => {
  for (const environment of [{ foodSupply: 0 }, { currentMps: 0 }]) { const f = born(); f.region.sim.setEnvironment(environment); for (let i = 0; i < 15; i++) step(f);
    assert.equal(f.region.kelpUnderstoryLife.foodLedger.input, 0); assert.equal(f.region.kelpUnderstoryLife.foodLedger.ingested, 0); assert.equal(f.region.kelpUnderstoryLife.foodParcels.length, 0); }
  const fast = born(); fast.region.sim.setEnvironment({ foodSupply: 3, currentMps: 1.08 }); for (let i = 0; i < 20; i++) step(fast);
  assert.ok(fast.region.kelpUnderstoryLife.counters.feedings > 0, 'actual .01m transport captures food that crosses a narrow inlet between native tick endpoints');
  assert.ok(fast.region.kelpUnderstoryLife.foodLedger.exported > 0); assert.ok(fast.region.kelpUnderstoryLife.foodParcels.length <= M.maximumParcels);
  assert.ok(fast.region.kelpUnderstoryLife.foodParcels.every(p => p.amount <= M.maximumParcelAmount + 1e-10)); close(kelpUnderstoryLifeFoodBudgetError(fast.region)); assert.ok(valid(fast));
  const tiny = born(); tiny.region.sim.setEnvironment({ foodSupply: 1e-8 }); for (let i = 0; i < 40; i++) step(tiny);
  assert.ok(tiny.region.kelpUnderstoryLifeAgents.some(a => a.lastUnderstoryIntake?.removedUnits > 0 && a.lastUnderstoryIntake.removedUnits < 1e-10)); close(kelpUnderstoryLifeFoodBudgetError(tiny.region), 0, 1e-16);
});

test('pending native integer-clock validation refuses duplicate, skipped, fractional or corrupted steps before any mutation', () => {
  const f = born(); step(f); const captured = captureKelpUnderstoryLife(f.region), native = old(f);
  for (const dt of [.1, .05, 0, NaN, Infinity]) { assert.equal(tickKelpUnderstoryLife(f.region, f.generator, dt), false); assert.deepEqual(captureKelpUnderstoryLife(f.region), captured); assert.deepEqual(old(f), native); }
  f.region.sim.step(.2); assert.equal(tickKelpUnderstoryLife(f.region, f.generator, .1), false); assert.deepEqual(captureKelpUnderstoryLife(f.region), captured);
  const bad = born(); bad.region.kelpUnderstoryLife.plants[0].kelpUnderstoryUnknown = true; bad.region.sim.step(.1); const before = captureKelpUnderstoryLife(bad.region);
  assert.equal(tickKelpUnderstoryLife(bad.region, bad.generator, .1), false); assert.deepEqual(captureKelpUnderstoryLife(bad.region), before);
});

test('full cold replay retains sealed plants, food parcels and receipts, and keeps dead clocks frozen without regenerating empty categories', () => {
  const f = born(); for (let i = 0; i < 40; i++) step(f); const r = f.region, a = r.kelpUnderstoryLifeAgents[0];
  // A ledger-preserving condition-loss fixture checks death freezing, not a
  // mortality forecast, extra food, replacement births or RNG manipulation.
  r.kelpUnderstoryEnergyLedger.maintenanceAndMotionDebit += a.energy - 1e-10; a.energy = 1e-10; a.nextBite = 999; step(f);
  assert.equal(a.alive, false); assert.equal(a.stateSince, a.timeSec); const dead = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, dead);
  const cold = fixture(), state = record(f).state; for (const [k, v] of Object.entries(state)) cold.region.sim[k] = clone(v);
  cold.region.sim.hostById = new Map(cold.region.sim.agents.filter(p => p.speciesId === 'giant-kelp').map(p => [p.id, p])); cold.region.sim.groundPatches = [...cold.region.sim.rockPatches, ...cold.region.sim.floorPatches];
  Object.assign(cold.region, captureKelpUnderstoryLife(r)); assert.ok(valid(cold)); assert.equal(initializeKelpUnderstoryLife(cold.generator, cold.region, { fresh: true }), false);
  step(f); step(cold); assert.deepEqual(captureKelpUnderstoryLife(cold.region), captureKelpUnderstoryLife(r)); assert.deepEqual(a, dead);
  const view = kelpUnderstoryLifeSnapshot(r); view.plants[0].position.x += 99; view.foodParcels[0].amount += 99; assert.ok(valid(f)); assert.deepEqual(a, dead);
});

test('partial/unknown/disguised records, foreign hosts, plant biomass claims, damaged channels/parcels/food/energy and historical receipts fail closed', () => {
  const f = born(); for (let i = 0; i < 40; i++) step(f); const good = record(f), accepts = raw => validateKelpUnderstoryLifeRecord(raw, f.region, { generator: f.generator });
  const legacy = old(f); assert.equal(accepts(legacy), true); for (const [key, value] of Object.entries(captureKelpUnderstoryLife(f.region))) assert.equal(accepts({ ...legacy, [key]: clone(value) }), false);
  const changes = [x => x.kelpUnderstoryUnknown = true, x => x.state.kelpUnderstoryUnknown = true, x => x.kelpUnderstoryLifeAgents[0].kelpUnderstoryUnknown = true,
    x => x.kelpUnderstoryLifeAgents[0].kelpNearBottomIndividualVersion = 1, x => x.kelpUnderstoryLifeAgents[0].kelpWaterLifeIndividualVersion = 1,
    x => x.kelpUnderstoryLife.plants[0].biomass = 1, x => x.kelpUnderstoryLife.plants[0].sizeM *= 1.01, x => x.kelpUnderstoryLife.plants[0].supportNormal.y = .5,
    x => x.kelpUnderstoryLife.plants[0].hostId = 'foreign-rock', x => x.kelpUnderstoryLife.plants[0].position.y += .03, x => x.kelpUnderstoryLife.plantIds.pop(),
    x => x.kelpUnderstoryLifeAgents[0].timeSec -= .1, x => x.kelpUnderstoryLifeAgents[0].sourcePosition.y += .1, x => x.kelpUnderstoryLifeAgents[0].feedingPosition.x += .1,
    x => x.kelpUnderstoryLife.foodChannels[0].sourcePosition.y += .1, x => x.kelpUnderstoryLife.foodChannels[0].nextReleaseTick++,
    x => x.kelpUnderstoryLife.foodParcels[0].position.x += .1, x => x.kelpUnderstoryLife.foodParcels[0].amount += .001,
    x => x.kelpUnderstoryLife.foodLedger.byPool.suspendedOrganicFood.input += .001, x => x.kelpUnderstoryEnergyLedger.feedingGain += .001,
    x => x.kelpUnderstoryLife.addedIds.pop(), x => x.kelpUnderstoryLife.counters.ticks++, x => x.kelpUnderstoryLife.birthPlacements[0].supportNormal.y = .5,
    x => x.kelpUnderstoryLifeAgents[0].lastUnderstoryIntake.foodPosition.x += .1, x => x.kelpUnderstoryLifeAgents[0].lastUnderstoryIntake.removedUnits *= 2,
    ...['waterAgents', 'visitorAgents', 'kelpBenthicAgents', 'kelpWaterLifeAgents', 'kelpNearBottomLifeAgents'].map(key => x => x[key].push(clone(x.kelpUnderstoryLifeAgents[0]))),
    x => x.state.agents.push(clone(x.kelpUnderstoryLife.plants[0])), x => x.understoryPlants.push(clone(x.kelpUnderstoryLife.plants[0])), x => x.kelpUnderstoryLifeAgents = null];
  for (const change of changes) { const raw = clone(good); change(raw); assert.equal(accepts(raw), false); }
  assert.equal(validateKelpUnderstoryLifeRecord(good, f.region, { generator: f.generator, capacity: NaN }), false); assert.deepEqual(record(f), good);
});
