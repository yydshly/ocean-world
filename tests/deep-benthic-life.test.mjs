import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { upgradeDeepPredators } from '../src/deepPredatorEcology.js';
import { deepBenthicLifeSpeciesCatalog } from '../src/deepBenthicLifeSpecies.js';
import { createDeepBenthicLifePlan, initializeDeepBenthicLife, tickDeepBenthicLife, captureDeepBenthicLife,
  validateDeepBenthicLifeRecord, deepBenthicLifePositionValid, deepBenthicLifeEnergyBudgetError,
  deepBenthicLifeFeedingPosition, deepBenthicLifeFeedingReachM, DEEP_BENTHIC_LIFE_IDS,
  DEEP_BENTHIC_LIFE_FOOD_SCOPE, DEEP_BENTHIC_LIFE_MODEL } from '../src/deepBenthicLife.js';

const clone = value => structuredClone(value), close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(cx = 140, cz = 8, seed = '42') {
  const generator = createDeepOceanGenerator(seed), ecology = new DeepOceanEcology(seed, generator), region = ecology._create(cx, cz);
  return { generator, ecology, region };
}
const record = region => ({ state: { agents: clone(region.sim.agents) }, predatorAgents: clone(region.predatorAgents ?? []), ...captureDeepBenthicLife(region) });
const nativeState = sim => clone({ agents: sim.agents, rng: sim._rngState, clock: sim.timeSec, ticks: sim._ticks,
  ledger: sim.ledger, energyLedger: sim.energyLedger, counters: sim.counters, events: sim.events, resources: sim.resources,
  surfacePatches: sim.surfacePatches, benthicPatches: sim.benthicPatches, suspendedPatches: sim.suspendedPatches });
function born(cx = 140, cz = 8) { const f = fixture(cx, cz); assert.equal(initializeDeepBenthicLife(f.generator, f.region, { fresh: true }), true); return f; }
const totalFood = sim => Object.values(sim.resources).reduce((sum, v) => sum + v, 0);
const energyExpected = sim => sim.energyLedger.initial + sim.energyLedger.feedingGain - sim.energyLedger.maintenanceAndMotionDebit + sim.energyLedger.clampCorrection - (sim.energyLedger.predationTransferredOut ?? 0);
const owners = [[139, 8], [140, 8], [141, 8], [139, 9], [140, 9], [141, 9]];

test('four source-qualified selected measures yield frozen deterministic native soft-bottom plans without old RNG or stock draws', () => {
  assert.deepEqual(deepBenthicLifeSpeciesCatalog.map(s => s.id), DEEP_BENTHIC_LIFE_IDS);
  const seen = new Set();
  for (const [cx, cz] of owners) {
    const { generator, region } = fixture(cx, cz), before = nativeState(region.sim), a = createDeepBenthicLifePlan(generator, region, { availableSlots: 4 }), b = createDeepBenthicLifePlan(generator, region, { availableSlots: 4 });
    assert.deepEqual(a, b); assert.deepEqual(nativeState(region.sim), before); assert.ok(Object.isFrozen(a) && Object.isFrozen(a.placements));
    assert.ok(a.placements.length <= 4);
    for (const p of a.placements) {
      seen.add(p.speciesId); const source = deepBenthicLifeSpeciesCatalog.find(s => s.id === p.speciesId);
      assert.ok(p.sizeM >= source.sizeRangeM[0] && p.sizeM <= source.sizeRangeM[1]); assert.ok(Object.isFrozen(p.position));
      const depth = generator.surfaceY - p.position.y; assert.ok(depth >= source.depthSelectionM[0] && depth <= source.depthSelectionM[1]);
      assert.equal(generator.supportAt(p.position.x, p.position.z).elementId, null); assert.equal(generator.supportAt(p.position.x, p.position.z).substrate, 'mud');
      assert.equal(p.habitat, 'deep-native-soft-bottom');
    }
    assert.equal(createDeepBenthicLifePlan(generator, region, { availableSlots: 0 }).placements.length, 0);
    assert.ok(createDeepBenthicLifePlan(generator, region, { availableSlots: 1 }).placements.length <= 1);
  }
  assert.deepEqual([...seen].sort(), [...DEEP_BENTHIC_LIFE_IDS].sort());
  const a = fixture(), b = fixture(140, 8, 42);
  assert.notDeepEqual(createDeepBenthicLifePlan(a.generator, a.region, { availableSlots: 4 }), createDeepBenthicLifePlan(b.generator, b.region, { availableSlots: 4 }));
});

test('strict fresh-only birth preserves all original/predator fields and counts every dead slot toward the combined 20 animal cap', () => {
  const { generator, region } = fixture(); upgradeDeepPredators(region, { seed: generator.seed, supportHeight: generator.heightAt });
  const before = nativeState(region.sim), predators = clone(region.predatorAgents), predatorLedger = clone(region.predatorEnergyLedger);
  assert.equal(initializeDeepBenthicLife(generator, region), false);
  assert.equal(initializeDeepBenthicLife(generator, region, { fresh: true }), true); assert.deepEqual(nativeState(region.sim), before);
  assert.deepEqual(region.predatorAgents, predators); assert.deepEqual(region.predatorEnergyLedger, predatorLedger);
  assert.ok(validateDeepBenthicLifeRecord(record(region), region, { generator }));
  const saved = record(region); assert.equal(initializeDeepBenthicLife(generator, region, { fresh: true }), false); assert.deepEqual(record(region), saved);
  const later = fixture(); later.region.sim.step(.1); assert.equal(initializeDeepBenthicLife(later.generator, later.region, { fresh: true }), false);
  const full = fixture(); full.region.predatorAgents = Array.from({ length: 20 - full.region.sim.agents.length }, (_, i) => ({ id: `dead-slot:${i}`, speciesId: 'giant-sea-spider-group', alive: false }));
  assert.equal(initializeDeepBenthicLife(full.generator, full.region, { fresh: true }), true); assert.equal(full.region.deepBenthicAgents.length, 0);
  assert.ok(validateDeepBenthicLifeRecord(record(full.region), full.region, { generator: full.generator }));
  const cap = fixture(); assert.equal(initializeDeepBenthicLife(cap.generator, cap.region, { fresh: true, capacity: cap.region.sim.agents.length + 1 }), true);
  assert.ok(cap.region.deepBenthicAgents.length <= 1);
});

test('actual 0.1s native steps move complete new bodies and reconcile original organic stocks and separate original/new condition ledgers', () => {
  const moved = new Set(), fed = new Set();
  for (const [cx, cz] of [[139, 8], [140, 8], [141, 8]]) {
    const { generator, region } = born(cx, cz);
    for (let i = 0; i < 240; i++) {
      const positions = new Map(region.deepBenthicAgents.map(a => [a.id, clone(a.position)]));
      region.sim.step(.1); const originalEnergy = clone(region.sim.energyLedger), originalCounters = clone(region.sim.counters);
      assert.equal(tickDeepBenthicLife(region, generator, .1), true); assert.deepEqual(region.sim.energyLedger, originalEnergy); assert.deepEqual(region.sim.counters, originalCounters);
      for (const a of region.deepBenthicAgents) {
        const p = positions.get(a.id), gap = Math.hypot(a.position.x - p.x, a.position.y - p.y, a.position.z - p.z);
        assert.ok(gap <= DEEP_BENTHIC_LIFE_MODEL.traits[a.speciesId].speedMps * .1 + 1e-8);
        if (gap > 1e-10) moved.add(a.speciesId); if (a.lastFeedAt !== null) fed.add(a.speciesId);
        assert.ok(deepBenthicLifePositionValid(generator, region, a)); assert.equal(a.timeSec, region.sim.timeSec);
        if (a.lastBenthicIntake) { close(a.lastBenthicIntake.stockBefore - a.lastBenthicIntake.stockAfter, a.lastBenthicIntake.removedUnits);
          assert.ok(a.lastBenthicIntake.contactDistanceM <= deepBenthicLifeFeedingReachM(a) + 1e-10); assert.equal(a.foodScope, DEEP_BENTHIC_LIFE_FOOD_SCOPE); }
      }
      close(totalFood(region.sim), region.sim.ledger.initial + region.sim.ledger.input - region.sim.ledger.ingested - region.sim.ledger.exported);
      for (const [pool, patches] of [['surfaceDetritus', region.sim.surfacePatches], ['benthicAnimalFood', region.sim.benthicPatches], ['suspendedPrey', region.sim.suspendedPatches]]) {
        const l = region.sim.ledger.byPool[pool]; close(patches.reduce((sum, p) => sum + p[pool], 0), l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported);
      }
      close(region.sim.agents.reduce((sum, a) => sum + a.energy, 0), energyExpected(region.sim)); close(deepBenthicLifeEnergyBudgetError(region), 0);
      if (i % 60 === 0 || i === 239) assert.ok(validateDeepBenthicLifeRecord(record(region), region, { generator }));
    }
  }
  assert.deepEqual([...moved].sort(), [...DEEP_BENTHIC_LIFE_IDS].sort()); assert.deepEqual([...fed].sort(), [...DEEP_BENTHIC_LIFE_IDS].sort());
});

test('complete rotated foot and upper-volume references reject a non-centre native terrain obstruction and hard or mixed habitat', () => {
  const { generator, region } = born(), agent = region.deepBenthicAgents[0]; assert.ok(agent);
  assert.ok(deepBenthicLifePositionValid(generator, region, agent));
  const n = agent.supportNormal, dot = Math.cos(agent.heading) * n.x + Math.sin(agent.heading) * n.z;
  const f = { x: Math.cos(agent.heading) - n.x * dot, y: -n.y * dot, z: Math.sin(agent.heading) - n.z * dot }, length = Math.hypot(f.x, f.y, f.z), radius = agent.sizeM * DEEP_BENTHIC_LIFE_MODEL.traits[agent.speciesId].radius;
  const obstruction = { x: agent.position.x + f.x / length * radius, z: agent.position.z + f.z / length * radius };
  const fault = { ...generator, heightAt: (x, z) => generator.heightAt(x, z) + (Math.hypot(x - obstruction.x, z - obstruction.z) < .00001 ? .2 : 0) };
  assert.equal(fault.heightAt(agent.position.x, agent.position.z), generator.heightAt(agent.position.x, agent.position.z));
  assert.equal(deepBenthicLifePositionValid(fault, region, agent), false); assert.equal(validateDeepBenthicLifeRecord(record(region), region, { generator: fault }), false);
  const mixed = { ...generator, sample: (x, z) => ({ ...generator.sample(x, z), substrate: 'mixed' }) };
  assert.equal(createDeepBenthicLifePlan(mixed, fixture().region, { availableSlots: 4 }).placements.length, 0);
});

test('existing whole animal envelopes block newcontroller contact and cannot grant food by remote root, shadow, span or observer illumination', () => {
  const { generator, region } = born(), agent = region.deepBenthicAgents[0], other = region.sim.agents[0], old = clone(other.position); assert.ok(agent && other);
  other.position = clone(agent.position); assert.equal(deepBenthicLifePositionValid(generator, region, agent, agent.position, agent.heading, { occupancy: true }), false); other.position = old;
  assert.equal(deepBenthicLifePositionValid(generator, region, agent, agent.position, agent.heading, { occupancy: true }), true);
  const patch = agent.nutritionPool === 'surfaceDetritus' ? region.sim.surfacePatches.find(p => p.id === agent.deepBenthicFoodPatchId) : region.sim.benthicPatches.find(p => p.id === agent.deepBenthicFoodPatchId);
  const food = clone(patch.position); patch.position.x += 2; agent.nextDecision = 1e6; agent.nextBite = 0;
  region.sim.environment.observerLight = 1; region.sim.environment.hour = 12; region.sim.step(.1); const before = clone(region.sim.ledger), e = agent.energy, consumed = region.deepBenthicLife.counters.consumedUnits;
  assert.equal(tickDeepBenthicLife(region, generator, .1), true); close(region.sim.ledger.ingested - before.ingested, region.deepBenthicLife.counters.consumedUnits - consumed);
  assert.equal(agent.lastFeedAt, null); assert.ok(agent.energy < e); patch.position = food;
  const paired = born(); paired.region.sim.environment.hour = 0; paired.region.sim.environment.observerLight = 0;
  const lit = born(); lit.region.sim.environment.hour = 12; lit.region.sim.environment.observerLight = 1;
  paired.region.sim.step(.1); lit.region.sim.step(.1); tickDeepBenthicLife(paired.region, paired.generator, .1); tickDeepBenthicLife(lit.region, lit.generator, .1);
  assert.deepEqual(captureDeepBenthicLife(paired.region), captureDeepBenthicLife(lit.region));
});

test('empty local food and duplicate or skipped native clocks produce no condition gain or hidden stock, and starvation removes no organic inventory', () => {
  const { generator, region } = born(); region.sim.environment.foodSupply = 0;
  for (const a of region.deepBenthicAgents) { const patches = a.nutritionPool === 'surfaceDetritus' ? region.sim.surfacePatches : region.sim.benthicPatches, p = patches.find(p => p.id === a.deepBenthicFoodPatchId); region.sim._remove(p, a.nutritionPool, p[a.nutritionPool]); }
  region.sim.step(.1);
  for (const a of region.deepBenthicAgents) { const patches = a.nutritionPool === 'surfaceDetritus' ? region.sim.surfacePatches : region.sim.benthicPatches, p = patches.find(p => p.id === a.deepBenthicFoodPatchId); region.sim._remove(p, a.nutritionPool, p[a.nutritionPool]); }
  const before = clone(region.sim.ledger), energies = region.deepBenthicAgents.map(a => a.energy);
  assert.equal(tickDeepBenthicLife(region, generator, .1), true); assert.deepEqual(region.sim.ledger, before); assert.ok(region.deepBenthicAgents.every((a, i) => a.lastFeedAt === null && a.energy < energies[i]));
  const saved = captureDeepBenthicLife(region); assert.equal(tickDeepBenthicLife(region, generator, .1), false); assert.deepEqual(captureDeepBenthicLife(region), saved);
  region.sim.step(.2); assert.equal(tickDeepBenthicLife(region, generator, .1), false); assert.deepEqual(captureDeepBenthicLife(region), saved);
  assert.equal(tickDeepBenthicLife(region, generator, 0), false); assert.equal(tickDeepBenthicLife(region, generator, Infinity), false);
});

test('partial reserved markers, invented taxonomy, condition balance, food witnesses or support targets reject without normalization', () => {
  const { generator, region } = born(139, 8); region.sim.step(.1); tickDeepBenthicLife(region, generator, .1);
  const good = record(region), fed = good.deepBenthicAgents.findIndex(a => a.lastBenthicIntake); assert.ok(good.deepBenthicAgents.length); assert.ok(fed >= 0);
  assert.equal(validateDeepBenthicLifeRecord({ state: { agents: region.sim.agents } }, region, { generator }), true);
  for (const key of ['deepBenthicLifeVersion', 'deepBenthicLifeInitializedAtSec', 'deepBenthicLife', 'deepBenthicAgents', 'deepBenthicEnergyLedger']) {
    const partial = { [key]: clone(good[key]), state: clone(good.state) }; assert.equal(validateDeepBenthicLifeRecord(partial, region, { generator }), false);
  }
  const mutations = [r => r.deepBenthicAgents[0].sizeM *= 1.1, r => r.deepBenthicAgents[0].deepBenthicFoodPatchId = 'remote',
    r => r.deepBenthicAgents[0].target.y += .05, r => r.deepBenthicAgents[0].supportNormal.y = .5, r => r.deepBenthicAgents[0].home.x += .01,
    r => r.deepBenthicLife.birthPlacements[0].position.y += .02, r => r.deepBenthicLife.counters.consumedUnits = 10,
    r => r.deepBenthicEnergyLedger.feedingGain = 1, r => r.deepBenthicEnergyLedger.initial += .1,
    r => r.deepBenthicAgents[fed].lastBenthicIntake.feedingPosition.x += .02,
    r => r.deepBenthicAgents[fed].lastBenthicIntake.agentPosition.y += .02,
    r => r.deepBenthicAgents[fed].lastBenthicIntake.foodPosition.z += .01,
    r => r.deepBenthicAgents[fed].lastBenthicIntake.stockAfter += .00001,
    r => r.deepBenthicAgents[fed].lastBenthicIntake.removedUnits *= 2,
    r => r.deepBenthicAgents[0].taxonomicLevel = 'imaginary-species', r => r.deepBenthicAgents[0].lastFeedAt = 0,
    r => r.deepBenthicAgents[0].state = 'dead', r => r.deepBenthicLife.lastTickSec = NaN,
    r => r.deepBenthicAgents.push(clone(r.deepBenthicAgents[0])), r => r.state.agents[0].deepBenthicIndividualVersion = 1,
    r => r.predatorAgents.push({ id: 'partial', deepBenthicSiteId: 'reserved' }), r => r.state.agents.push(clone(r.deepBenthicAgents[0]))];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.equal(validateDeepBenthicLifeRecord(bad, region, { generator }), false); }
  assert.equal(validateDeepBenthicLifeRecord(good, region, { generator, capacity: NaN }), false); assert.deepEqual(record(region), good);
});

test('condition-ledger-owned starvation freezes dead identities and clocks, retains cap occupancy and never refills on later ticks', () => {
  const { generator, region } = born(), agent = region.deepBenthicAgents[0]; assert.ok(agent);
  // A finite test debit brings one body near exhaustion without changing its
  // deterministic birth or any organic-food inventory. Runtime then owns death.
  region.deepBenthicEnergyLedger.maintenanceAndMotionDebit += agent.energy - 1e-8; agent.energy = 1e-8; agent.hunger = 1 - agent.energy;
  region.sim.step(.1); const food = clone(region.sim.ledger), consumed = region.deepBenthicLife.counters.consumedUnits; tickDeepBenthicLife(region, generator, .1);
  assert.equal(agent.alive, false); assert.equal(agent.energy, 0); assert.equal(agent.state, 'dead'); assert.equal(region.sim.ledger.input, food.input);
  close(region.sim.ledger.ingested - food.ingested, region.deepBenthicLife.counters.consumedUnits - consumed); close(deepBenthicLifeEnergyBudgetError(region), 0);
  const dead = clone(agent), ids = region.deepBenthicLife.addedIds.slice();
  for (let i = 0; i < 5; i++) { region.sim.step(.1); tickDeepBenthicLife(region, generator, .1); }
  assert.deepEqual(agent, dead); assert.deepEqual(region.deepBenthicLife.addedIds, ids); assert.ok(validateDeepBenthicLifeRecord(record(region), region, { generator }));
  assert.equal(initializeDeepBenthicLife(generator, region, { fresh: true }), false);
  const many = record(region); many.predatorAgents.push(...Array.from({ length: 20 }, (_, i) => ({ id: `dead:${i}`, speciesId: 'giant-sea-spider-group', alive: false })));
  assert.equal(validateDeepBenthicLifeRecord(many, region, { generator }), false);
  const capture = captureDeepBenthicLife(region); capture.deepBenthicAgents[0].position.x += 100; assert.deepEqual(agent, dead);
});
