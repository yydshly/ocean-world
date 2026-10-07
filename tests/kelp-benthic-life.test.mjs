import test from 'node:test';
import assert from 'node:assert/strict';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { kelpBenthicLifeSpeciesCatalog } from '../src/kelpBenthicLifeSpecies.js';
import { createKelpBenthicLifePlan, initializeKelpBenthicLife, tickKelpBenthicLife, captureKelpBenthicLife,
  validateKelpBenthicLifeRecord, kelpBenthicLifePositionValid, KELP_BENTHIC_LIFE_IDS,
  KELP_BENTHIC_LIFE_FOOD_SCOPE, KELP_BENTHIC_LIFE_MODEL } from '../src/kelpBenthicLife.js';

const clone = value => structuredClone(value), close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(cx = 7, cz = -2, seed = '42', supportVersion = 2) {
  const generator = createKelpOceanGenerator(seed, { supportVersion });
  const ecology = new KelpOceanEcology(seed, generator), region = ecology._create(cx, cz);
  return { generator, ecology, region };
}
const record = region => ({ state: { agents: clone(region.sim.agents) }, waterAgents: clone(region.waterAgents),
  visitorAgents: clone(region.visitorAgents), ...captureKelpBenthicLife(region) });
const nativeState = sim => clone({ agents: sim.agents, rng: sim._rngState, clock: sim.timeSec, ticks: sim._ticks,
  ledger: sim.ledger, counters: sim.counters, events: sim.events, resources: sim.resources,
  rockPatches: sim.rockPatches, floorPatches: sim.floorPatches, leafPatches: sim.leafPatches, kelpPatches: sim.kelpPatches, preyPatches: sim.preyPatches });
function born(cx = 7, cz = -2) { const f = fixture(cx, cz); assert.equal(initializeKelpBenthicLife(f.generator, f.region, { fresh: true }), true); return f; }
const totals = sim => Object.values(sim.resources).reduce((sum, v) => sum + v, 0);

test('four source-checked hard-bottom taxa use exact selected measures, deterministic typed seeds and frozen bounded plans', () => {
  assert.deepEqual(kelpBenthicLifeSpeciesCatalog.map(s => s.id), KELP_BENTHIC_LIFE_IDS);
  const seen = new Set();
  for (const [cx, cz] of [[6, -2], [7, -2], [6, -1], [7, -1], [14, -2], [14, -1]]) {
    const { generator, region } = fixture(cx, cz), before = nativeState(region.sim);
    const first = createKelpBenthicLifePlan(generator, region, { availableSlots: 4 }), second = createKelpBenthicLifePlan(generator, region, { availableSlots: 4 });
    assert.deepEqual(first, second); assert.deepEqual(nativeState(region.sim), before); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.placements));
    assert.ok(first.placements.length <= 4);
    for (const p of first.placements) {
      seen.add(p.speciesId); assert.ok(Object.isFrozen(p.position));
      const source = kelpBenthicLifeSpeciesCatalog.find(s => s.id === p.speciesId);
      assert.ok(p.sizeM >= source.sizeRangeM[0] && p.sizeM <= source.sizeRangeM[1]);
      const depth = generator.surfaceY - p.position.y;
      assert.ok(depth >= source.depthSelectionM[0] && depth <= source.depthSelectionM[1]);
      assert.equal(generator.supportAt(p.position.x, p.position.z).elementId, p.hostId);
      assert.equal(p.habitat, 'kelp-native-hard-bottom');
    }
    assert.equal(createKelpBenthicLifePlan(generator, region, { availableSlots: 0 }).placements.length, 0);
    assert.ok(createKelpBenthicLifePlan(generator, region, { availableSlots: 1 }).placements.length <= 1);
  }
  assert.deepEqual([...seen].sort(), [...KELP_BENTHIC_LIFE_IDS].sort());
  const string = fixture(), number = fixture(7, -2, 42);
  assert.notDeepEqual(createKelpBenthicLifePlan(string.generator, string.region, { availableSlots: 4 }), createKelpBenthicLifePlan(number.generator, number.region, { availableSlots: 4 }));
});

test('fresh-only once birth preserves every old agent, RNG, clock, inventory, ledger and capped dead/water/visitor slots', () => {
  const { generator, region } = fixture(), before = nativeState(region.sim);
  assert.equal(initializeKelpBenthicLife(generator, region), false); assert.deepEqual(nativeState(region.sim), before);
  assert.equal(initializeKelpBenthicLife(generator, region, { fresh: true }), true); assert.deepEqual(nativeState(region.sim), before);
  const saved = record(region); assert.equal(validateKelpBenthicLifeRecord(saved, region, { generator }), true);
  assert.equal(initializeKelpBenthicLife(generator, region, { fresh: true }), false); assert.deepEqual(record(region), saved);
  const count = born(14, -2), residents = count.region.sim.agents.filter(a => a.speciesId !== 'giant-kelp').length;
  delete count.region.kelpBenthicLifeVersion; delete count.region.kelpBenthicLifeInitializedAtSec; delete count.region.kelpBenthicLife; delete count.region.kelpBenthicAgents;
  count.region.waterAgents = Array.from({ length: 20 - residents - 1 }, (_, i) => ({ id: `saved-dead:${i}`, alive: false, speciesId: 'blue-rockfish' }));
  count.region.visitorAgents = [{ id: 'saved-dead-visitor', alive: false, speciesId: 'leopard-shark' }];
  assert.equal(initializeKelpBenthicLife(count.generator, count.region, { fresh: true }), true); assert.equal(count.region.kelpBenthicAgents.length, 0);
  assert.equal(validateKelpBenthicLifeRecord(record(count.region), count.region, { generator: count.generator }), true);
  const legacy = fixture(7, -2, '42', 1); assert.equal(initializeKelpBenthicLife(legacy.generator, legacy.region, { fresh: true }), false);
  const later = fixture(); later.region.sim.step(.1); assert.equal(initializeKelpBenthicLife(later.generator, later.region, { fresh: true }), false);
});

test('ordinary native clocks move whole bodies within budget and consume all four local nutrition proxies with exact old food ledger', () => {
  const moved = new Set(), fed = new Set();
  for (const [cx, cz] of [[7, -2], [6, -1]]) {
    const { generator, region } = born(cx, cz), anemone = region.kelpBenthicAgents.find(a => a.speciesId === 'giant-plumose-anemone'), fixed = clone(anemone?.position);
    for (let i = 0; i < 40; i++) {
      const positions = new Map(region.kelpBenthicAgents.map(a => [a.id, clone(a.position)]));
      region.sim.step(.1); assert.equal(tickKelpBenthicLife(region, generator, .1), true);
      for (const a of region.kelpBenthicAgents) {
        const previous = positions.get(a.id), gap = Math.hypot(a.position.x - previous.x, a.position.y - previous.y, a.position.z - previous.z);
        assert.ok(gap <= KELP_BENTHIC_LIFE_MODEL.traits[a.speciesId].speedMps * .1 + 1e-8);
        if (gap > 1e-10) moved.add(a.speciesId);
        if (a.lastFeedAt !== null) fed.add(a.speciesId);
        assert.ok(kelpBenthicLifePositionValid(generator, region, a)); assert.equal(a.timeSec, region.sim.timeSec);
        if (a.lastBenthicIntake) {
          close(a.lastBenthicIntake.stockBefore - a.lastBenthicIntake.stockAfter, a.lastBenthicIntake.removedUnits);
          assert.ok(a.lastBenthicIntake.contactDistanceM <= .32); assert.equal(a.foodScope, KELP_BENTHIC_LIFE_FOOD_SCOPE);
        }
      }
      close(totals(region.sim), region.sim.ledger.initial + region.sim.ledger.input - region.sim.ledger.ingested - region.sim.ledger.exported);
      assert.ok(validateKelpBenthicLifeRecord(record(region), region, { generator }));
    }
    if (anemone) assert.deepEqual(anemone.position, fixed);
    close(region.kelpBenthicLife.counters.consumedUnits, region.kelpBenthicLife.counters.feedings * KELP_BENTHIC_LIFE_MODEL.biteAmount);
  }
  assert.deepEqual([...fed].sort(), [...KELP_BENTHIC_LIFE_IDS].sort());
  assert.deepEqual([...moved].sort(), KELP_BENTHIC_LIFE_IDS.filter(id => id !== 'giant-plumose-anemone').sort());
});

test('finite tangent-foot and upper-volume support rejects a non-centre obstacle while exact original native pose remains valid', () => {
  const { generator, region } = born(), agent = region.kelpBenthicAgents.find(a => a.speciesId === 'red-abalone'); assert.ok(agent);
  assert.equal(kelpBenthicLifePositionValid(generator, region, agent), true);
  const n = agent.supportNormal, heading = agent.heading, dot = Math.cos(heading) * n.x + Math.sin(heading) * n.z;
  const f = { x: Math.cos(heading) - n.x * dot, y: -n.y * dot, z: Math.sin(heading) - n.z * dot }, length = Math.hypot(f.x, f.y, f.z);
  const radius = agent.sizeM * KELP_BENTHIC_LIFE_MODEL.traits[agent.speciesId].radius;
  const obstacle = { x: agent.position.x + f.x / length * radius, z: agent.position.z + f.z / length * radius };
  const fault = { ...generator, heightAt: (x, z) => generator.heightAt(x, z) + (Math.hypot(x - obstacle.x, z - obstacle.z) < .00001 ? .2 : 0) };
  assert.equal(fault.heightAt(agent.position.x, agent.position.z), generator.heightAt(agent.position.x, agent.position.z));
  assert.equal(kelpBenthicLifePositionValid(fault, region, agent), false);
  assert.equal(validateKelpBenthicLifeRecord(record(region), region, { generator: fault }), false);
});

test('conservative complete plant and existing animal envelopes prevent birth or movement overlap at actual feeding supports', () => {
  const { generator, region } = born(), agent = region.kelpBenthicAgents[0];
  const other = region.sim.agents.find(a => a.speciesId !== 'giant-kelp'); assert.ok(other);
  const prior = clone(other.position); other.position = clone(agent.position);
  assert.equal(kelpBenthicLifePositionValid(generator, region, agent, agent.position, agent.heading, { occupancy: true }), false);
  other.position = prior;
  assert.equal(kelpBenthicLifePositionValid(generator, region, agent, agent.position, agent.heading, { occupancy: true }), true);
  region.understoryPlants.push({ id: 'fault-overlapping-canopy', x: agent.position.x, y: agent.position.y, z: agent.position.z, radiusM: 1, heightM: 1.5 });
  assert.equal(kelpBenthicLifePositionValid(generator, region, agent), false);
  const recordBefore = record(region), energy = agent.energy, ingested = region.sim.ledger.ingested;
  agent.nextBite = 0; region.sim.step(.1); tickKelpBenthicLife(region, generator, .1);
  assert.equal(agent.lastFeedAt, null); assert.ok(agent.energy < energy); assert.ok(region.sim.ledger.ingested - ingested < .002);
  assert.deepEqual(agent.position, recordBefore.kelpBenthicAgents[0].position);
});

test('empty finite food patches and repeated or skipped clocks cannot produce new intake, condition gain or duplicate tick', () => {
  const { generator, region } = born(), agents = region.kelpBenthicAgents;
  for (const a of agents) { const patch = region.sim.rockPatches.find(p => p.id === a.kelpBenthicFoodPatchId), pool = a.nutritionPool;
    region.sim._remove(patch, pool, patch[pool]); a.nextBite = 0; }
  region.sim.environment.foodSupply = 0; region.sim.environment.hour = 0;
  region.sim.step(.1);
  // The old model can legitimately transfer a tiny quantity from a different
  // algal pool into this detritus patch during its step. Empty the actual stock
  // again after that native transfer, with the ordinary export ledger intact.
  for (const a of agents) { const patch = region.sim.rockPatches.find(p => p.id === a.kelpBenthicFoodPatchId), pool = a.nutritionPool;
    region.sim._remove(patch, pool, patch[pool]); }
  const ledgerBefore = clone(region.sim.ledger), energies = agents.map(a => a.energy);
  assert.equal(tickKelpBenthicLife(region, generator, .1), true); assert.deepEqual(region.sim.ledger, ledgerBefore);
  assert.ok(agents.every((a, i) => a.lastFeedAt === null && a.energy < energies[i]));
  const frozen = captureKelpBenthicLife(region); assert.equal(tickKelpBenthicLife(region, generator, .1), false); assert.deepEqual(captureKelpBenthicLife(region), frozen);
  region.sim.step(.2); assert.equal(tickKelpBenthicLife(region, generator, .1), false); assert.deepEqual(captureKelpBenthicLife(region), frozen);
  assert.equal(tickKelpBenthicLife(region, generator, 0), false); assert.equal(tickKelpBenthicLife(region, generator, Infinity), false);
});

test('partial markers, invented sizes, hosts, food receipts, counters, target support and old-array taxonomy reject without normalization', () => {
  const { generator, region } = born(), good = record(region); assert.ok(good.kelpBenthicAgents.length);
  assert.equal(validateKelpBenthicLifeRecord({ state: { agents: region.sim.agents } }, region, { generator }), true);
  for (const field of ['kelpBenthicLifeVersion', 'kelpBenthicLifeInitializedAtSec', 'kelpBenthicLife', 'kelpBenthicAgents']) {
    const partial = { [field]: clone(good[field]), state: clone(good.state) }; assert.equal(validateKelpBenthicLifeRecord(partial, region, { generator }), false);
  }
  const mutations = [
    r => r.kelpBenthicAgents[0].sizeM *= 1.1, r => r.kelpBenthicAgents[0].kelpBenthicHostId = 'invented-rock',
    r => r.kelpBenthicAgents[0].target.y += .05, r => r.kelpBenthicAgents[0].supportNormal.y = .5,
    r => r.kelpBenthicAgents[0].home.x += .01, r => r.kelpBenthicAgents[0].kelpBenthicFoodPatchId = 'remote-food',
    r => r.kelpBenthicLife.birthPlacements[0].position.y += .02, r => r.kelpBenthicLife.counters.consumedUnits = 10,
    r => r.kelpBenthicAgents[0].lastFeedAt = 0, r => r.kelpBenthicAgents[0].state = 'dead',
    r => r.kelpBenthicLife.lastTickSec = NaN, r => r.kelpBenthicAgents.push(clone(r.kelpBenthicAgents[0])),
    r => r.state.agents[0].kelpBenthicIndividualVersion = 1,
    r => r.state.agents.push(clone(r.kelpBenthicAgents[0])),
  ];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.equal(validateKelpBenthicLifeRecord(bad, region, { generator }), false); }
  assert.equal(validateKelpBenthicLifeRecord(good, region, { generator, capacity: NaN }), false);
  assert.deepEqual(record(region), good);
});

test('dead full identities freeze on actual later ticks, remain in capture and cannot be refilled or exceed combined animal capacity', () => {
  const { generator, region } = born(), agent = region.kelpBenthicAgents[0];
  agent.alive = false; agent.energy = 0; agent.state = 'dead'; agent.velocity = { x: 0, y: 0, z: 0 };
  const dead = clone(agent), ids = region.kelpBenthicLife.addedIds.slice();
  for (let i = 0; i < 5; i++) { region.sim.step(.1); tickKelpBenthicLife(region, generator, .1); }
  assert.deepEqual(agent, dead); assert.deepEqual(region.kelpBenthicLife.addedIds, ids);
  assert.equal(validateKelpBenthicLifeRecord(record(region), region, { generator }), true);
  assert.equal(initializeKelpBenthicLife(generator, region, { fresh: true }), false);
  const many = record(region); many.waterAgents.push(...Array.from({ length: 20 }, (_, i) => ({ id: `dead:${i}`, speciesId: 'blue-rockfish', alive: false })));
  assert.equal(validateKelpBenthicLifeRecord(many, region, { generator }), false);
  const snapshot = captureKelpBenthicLife(region); snapshot.kelpBenthicAgents[0].position.x += 100;
  assert.deepEqual(agent, dead);
});
