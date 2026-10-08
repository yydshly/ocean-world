import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOceanBenthicLifePlan, initializeOceanBenthicLife, tickOceanBenthicLifeAgent,
  validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { createOceanMeadowLifePlan, initializeOceanMeadowLife, validateOceanMeadowLifeRecord,
  oceanMeadowLifePositionValid, tickOceanMeadowLife } from '../src/oceanMeadowLife.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { oceanTurtleSeagrassLeafPose } from '../src/oceanTurtleGrazing.js';

const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture({ seed = 'belt-bottom', marked = true, grass = true, rocks = true, count = 0 } = {}) {
  const cx = 228, cz = 4, x0 = cx * 64, z0 = cz * 64;
  const chunk = { id: `${cx},${cz}`, cx, cz, origin: { x: x0, z: z0 }, size: 64,
    bounds: { minX: x0, maxX: x0 + 64, minZ: z0, maxZ: z0 + 64 }, counts: {}, elements: [] };
  if (rocks) chunk.elements.push({ id: 'belt-island', kind: 'rock', profile: 'terrace', x: x0 + 27, y: 0, z: z0 + 37,
    scale: { x: 12, y: 2, z: 12 }, rotation: .2 });
  if (grass) for (let index = 0; index < 8; index++) chunk.elements.push({ id: `grass:${index}`, kind: 'seagrass',
    x: x0 + 8 + index * 6, y: 0, z: z0 + 36, rotation: .1, scale: { x: .7, y: .4, z: .7 } });
  chunk.elements.push({ id: 'belt-algae', kind: 'algae', x: x0 + 27, y: 2, z: z0 + 37,
    scale: { x: 1, y: .018, z: 1 }, rotation: 0, attachmentId: 'belt-island' });
  const routePath = [{ x: x0 + 2, y: 2, z: z0 + 30, sM: 0 }, { x: x0 + 62, y: 2, z: z0 + 30, sM: 60 }];
  chunk.ridgePlan = { version: 9, theme: 'seagrass-meadow-region', id: chunk.id, cx, cz, seed,
    group: { id: `seagrass-meadow-region:${cx},${cz}`, cx, cz, seed,
      ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${cx + dx},${cz + dz}`)), routePath } };
  const bed = () => 0;
  const surface = (x, z) => chunk.elements.reduce((y, e) => e.kind === 'rock' ? Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity) : y, 0);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY: 0, depthM: 8, substrate: surface(x, z) > .06 ? 'rock' : 'sand' }) };
  const region = { id: chunk.id, cx, cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    resources: { algae: .4, plankton: .5, detritus: .3 }, counters: { feeding: 0, deaths: 0 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 }, reefGuildVersion: 1, reefGuild: { preyOrganicUnits: .05 } };
  for (let index = 0; index < count; index++) region.agents.push({ id: `historic:${index}`, regionId: region.id,
    speciesId: 'green-chromis', alive: index % 2 === 0, energy: .5, sizeM: .075,
    position: { x: x0 + 60, y: 2, z: z0 + 60 }, timeSec: 0 });
  if (marked) Object.assign(region, { meadowAnimalBeltVersion: 1,
    meadowAnimalBelt: { version: 1, initializedAtSec: 0, groupId: `${cx},${cz}`, recipe: 'route-neighborhood-v1' } });
  initializeLivingNetwork(region, chunk);
  return { chunk, generator, region, surface, bed, x0, z0, routePath };
}
const options = f => ({ surface: f.surface, bed: f.bed, random: () => .1 });
function legacyOutputs(seed) {
  return [
    ...[{}, { grass: false }, { rocks: false }].map(layout => {
      const f = fixture({ seed, marked: false, ...layout });
      const plan = createOceanBenthicLifePlan(f.generator, f.region, { ...options(f), availableSlots: 4 });
      initializeOceanBenthicLife(f.region, f.generator, { ...options(f), fresh: true });
      return { plan, region: f.region };
    }),
    ...[{}, { grass: false }, { rocks: false }].map(layout => {
      const f = fixture({ seed, marked: false, ...layout });
      const plan = createOceanMeadowLifePlan(f.generator, f.region, { ...options(f), availableSlots: 4 });
      initializeOceanMeadowLife(f.region, f.generator, { ...options(f), fresh: true });
      return { plan, region: f.region };
    }),
  ];
}

test('unmarked planning and fresh records retain the frozen original outputs', () => {
  const expected = {
    'belt-bottom': 'c7f2fdda012ce15dc01ad3838f0ad025464f1223dafac1e8731776203f399ce4',
    'belt-bottom-1': 'edfa555cc313868186ab8fa5a71c3494036e2a685e4f6daff50e4803b465f1df',
    'belt-bottom-2': '82f4c850456b42410c0705db33889f6205fe6960862a435d254488e88ec69086',
  };
  for (const [seed, hash] of Object.entries(expected)) assert.equal(digest(legacyOutputs(seed)), hash, seed);
});

const balanced = r => {
  assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9);
  assert.ok(validateLivingNetworkRecord(r));
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('fresh marked bottom plans favour route-near feeders while preserving support, obstacles and finite slots', () => {
  const f = fixture(), before = clone(f.region), sceneBefore = clone(f.chunk);
  const plan = createOceanBenthicLifePlan(f.generator, f.region, { ...options(f), availableSlots: 20, maxAdded: 20 });
  assert.equal(plan.placements.length, 4);
  assert.deepEqual(plan.placements.slice(0, 2).map(p => p.speciesId), ['reef-goatfish', 'spotted-hermit-crab']);
  assert.deepEqual(f.region, before); assert.deepEqual(f.chunk, sceneBefore);
  assert.ok(plan.placements.slice(0, 2).every(p => Math.abs(p.z - f.routePath[0].z) <= 10));
  for (const p of plan.placements) {
    assert.ok(p.x >= f.chunk.bounds.minX && p.x <= f.chunk.bounds.maxX && p.z >= f.chunk.bounds.minZ && p.z <= f.chunk.bounds.maxZ);
    assert.ok(p.y >= f.surface(p.x, p.z));
    if (p.mode === 'soft') assert.equal(f.generator.sample(p.x, p.z).substrate, 'sand');
    if (p.speciesId === 'tiger-cowrie') {
      assert.equal(p.mode, 'hard'); assert.equal(p.hostId, 'belt-island');
      assert.ok(f.surface(p.x, p.z) - f.bed(p.x, p.z) > .06);
    }
  }
  assert.equal(createOceanBenthicLifePlan(f.generator, f.region, { ...options(f), availableSlots: 0 }).placements.length, 0);
  assert.equal(createOceanBenthicLifePlan(f.generator, f.region, { ...options(f), availableSlots: 1 }).placements[0].speciesId, 'reef-goatfish');
  assert.ok(Object.isFrozen(plan.placements));
  assert.equal(initializeOceanBenthicLife(f.region, f.generator, { ...options(f), fresh: true }), true);
  assert.ok(validateOceanBenthicLifeRecord(f.region, f.generator, f)); balanced(f.region);
  const goat = f.region.agents.find(a => a.speciesId === 'reef-goatfish');
  const obstruction = (x, z, crown = false) => f.surface(x, z) + (crown && Math.hypot(x - goat.home.x, z - goat.home.z) < .003 ? .2 : 0);
  assert.equal(validateOceanBenthicLifeRecord(f.region, f.generator, { surface: obstruction, bed: f.bed }), false);
  const blocked = createOceanBenthicLifePlan(f.generator, before, { surface: obstruction, bed: f.bed, random: () => .1, availableSlots: 4 });
  assert.ok(!blocked.placements.some(p => p.speciesId === goat.speciesId && p.siteId === goat.benthicLifeSiteId));
});

test('marked bottom births retain actual day/night motion, debit accounting and canonical restore', () => {
  const f = fixture({ rocks: false, grass: false });
  assert.equal(initializeOceanBenthicLife(f.region, f.generator, { ...options(f), fresh: true }), true);
  const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
  const birth = clone(f.region.benthicLife.birthPlacements), input = f.region.basicNetwork.ledger.externalInput;
  for (let step = 1; step <= 20; step++) {
    f.region.timeSec = step * .1; f.region.ticks = step;
    for (const a of f.region.agents) tickOceanBenthicLifeAgent(f.region, f.generator, a, .1,
      { ...options(f), environment: { lightAtDepth: step <= 10 ? .8 : .01 } });
  }
  for (const a of f.region.agents) {
    assert.ok(a.lastFeedAt !== null, a.speciesId);
    assert.ok(distance(starts.get(a.id), a.position) > .001, a.speciesId);
  }
  assert.ok(f.region.ledger.ingested > 0 && f.region.benthicLife.counters.feedings > 0);
  assert.equal(f.region.basicNetwork.ledger.externalInput, input); assert.deepEqual(f.region.benthicLife.birthPlacements, birth);
  assert.ok(validateOceanBenthicLifeRecord(clone(f.region), f.generator, f)); balanced(f.region);
  const snapshot = clone(f.region);
  for (const a of f.region.agents) tickOceanBenthicLifeAgent(f.region, f.generator, a, 0, options(f));
  assert.deepEqual(f.region, snapshot);
  assert.equal(initializeOceanBenthicLife(f.region, f.generator, { ...options(f), fresh: true }), false);
  assert.deepEqual(f.region, snapshot);
});

test('marked meadow births use real route-near grass hosts and remain bounded to two representatives', () => {
  const f = fixture({ seed: 'belt-bottom-1' });
  f.chunk.elements.find(e => e.id === 'grass:0').z = f.z0 + 56;
  const before = clone(f.region);
  const plan = createOceanMeadowLifePlan(f.generator, f.region, { ...options(f), availableSlots: 20, maxAdded: 20 });
  assert.equal(plan.placements.length, 2); assert.deepEqual(f.region, before);
  assert.equal(createOceanMeadowLifePlan(f.generator, f.region, { ...options(f), availableSlots: 0 }).placements.length, 0);
  assert.equal(initializeOceanMeadowLife(f.region, f.generator, { ...options(f), fresh: true }), true);
  assert.ok(validateOceanMeadowLifeRecord(f.region, f.generator, f)); balanced(f.region);
  const sea = f.region.agents.find(a => a.speciesId === 'sand-edge-seahorse');
  assert.ok(sea);
  const host = f.chunk.elements.find(e => e.id === sea.meadowLifeHostId && e.kind === 'seagrass');
  assert.ok(host && Math.abs(host.z - f.routePath[0].z) <= 10);
  assert.equal(host.id, 'grass:1');
  assert.deepEqual(sea.position, oceanTurtleSeagrassLeafPose(f.generator, host, sea.meadowLifeLeafIndex));
  for (const a of f.region.agents) assert.ok(oceanMeadowLifePositionValid(f.region, f.generator, a, a.position, f));
  const restored = clone(f.region); assert.ok(validateOceanMeadowLifeRecord(restored, f.generator, f));
  assert.equal(initializeOceanMeadowLife(restored, f.generator, { ...options(f), fresh: true }), false); assert.deepEqual(restored, f.region);
  const wrongHost = clone(f.region); wrongHost.agents.find(a => a.id === sea.id).meadowLifeHostId = 'invented-grass';
  assert.equal(validateOceanMeadowLifeRecord(wrongHost, f.generator, f), false);
  host.x += .01;
  assert.equal(validateOceanMeadowLifeRecord(f.region, f.generator, f), false);
});

test('missing marked habitats stay empty and all selected meadow supports retain their actual modes', () => {
  const bare = fixture({ grass: false, rocks: false });
  assert.equal(initializeOceanBenthicLife(bare.region, bare.generator, { ...options(bare), fresh: true }), true);
  assert.ok(!bare.region.agents.some(a => a.speciesId === 'tiger-cowrie'));
  const f = fixture({ grass: false });
  assert.equal(initializeOceanMeadowLife(f.region, f.generator, { ...options(f), fresh: true }), true);
  assert.ok(!f.region.agents.some(a => a.speciesId === 'sand-edge-seahorse'));
  assert.ok(validateOceanMeadowLifeRecord(f.region, f.generator, f));
  for (const a of f.region.agents) {
    assert.ok(oceanMeadowLifePositionValid(f.region, f.generator, a, a.position, f));
    if (a.speciesId === 'barrel-sea-pen') {
      assert.equal(a.meadowLifeHostId, null); assert.equal(f.generator.sample(a.position.x, a.position.z).substrate, 'sand');
      assert.ok(a.position.y - a.sizeM * .25 < f.bed(a.position.x, a.position.z));
    } else if (a.speciesId === 'spider-conch') {
      assert.equal(a.meadowLifeHostId, 'belt-island'); assert.ok(a.position.y > f.bed(a.position.x, a.position.z) + .06);
    } else if (a.speciesId === 'reef-cuttlefish') {
      assert.ok(Math.hypot(a.position.x - (f.x0 + 27), a.position.z - (f.z0 + 37)) <= 5);
    }
  }
  balanced(f.region);
});

test('new meadow representatives use original clock, food receipts and finite motion after route ranking', () => {
  const f = fixture({ seed: 'belt-bottom-1' });
  assert.equal(initializeOceanMeadowLife(f.region, f.generator, { ...options(f), fresh: true }), true);
  const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
  const birth = clone(f.region.meadowLife.birthPlacements), input = f.region.basicNetwork.ledger.externalInput;
  for (let step = 1; step <= 35; step++) {
    f.region.timeSec = step * .1; f.region.ticks = step;
    assert.equal(tickOceanMeadowLife(f.region, f.generator, .1,
      { ...options(f), environmentAt: () => ({ hour: 2, lightAtDepth: 0, currentMps: 0 }) }), true);
  }
  assert.ok(f.region.meadowLife.counters.feedings > 0);
  for (const a of f.region.agents) if (a.lastMeadowIntake) {
    const receipt = a.lastMeadowIntake;
    assert.equal(receipt.pool, a.meadowLifeFoodPool); assert.equal(receipt.ownerId, f.region.id);
    assert.ok(Math.abs(receipt.stockBefore - receipt.stockAfter - receipt.removedUnits) < 1e-12);
  }
  const sea = f.region.agents.find(a => a.speciesId === 'sand-edge-seahorse');
  assert.deepEqual(sea.position, starts.get(sea.id));
  const cuttle = f.region.agents.find(a => a.speciesId === 'reef-cuttlefish');
  if (cuttle) assert.ok(distance(cuttle.position, starts.get(cuttle.id)) > .001);
  assert.equal(f.region.basicNetwork.ledger.externalInput, input); assert.deepEqual(f.region.meadowLife.birthPlacements, birth);
  assert.ok(validateOceanMeadowLifeRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('added route sites require genuine sand across the same complete animal footprint', () => {
  const f = fixture({ rocks: false, grass: false }), x = f.x0 + 8, z = f.z0 + 30;
  f.generator.sample = (px, pz) => ({ floorY: 0, depthM: 8, substrate: Math.hypot(px - x, pz - z) < .6 ? 'sand' : 'rock' });
  const plan = createOceanBenthicLifePlan(f.generator, f.region, { ...options(f), availableSlots: 1 });
  assert.equal(plan.placements.length, 1); assert.equal(plan.placements[0].speciesId, 'reef-goatfish');
  assert.match(plan.placements[0].siteId, /^animal-belt:228,4:/);
  assert.equal(plan.placements[0].x, x); assert.equal(plan.placements[0].z, z);
  assert.equal(initializeOceanBenthicLife(f.region, f.generator, { ...options(f), fresh: true, maxAdded: 1 }), true);
  assert.ok(validateOceanBenthicLifeRecord(f.region, f.generator, f));
  f.generator.sample = () => ({ floorY: 0, depthM: 8, substrate: 'rock' });
  assert.equal(validateOceanBenthicLifeRecord(f.region, f.generator, f), false);
});

test('full capacity, histories and deaths remain sealed; malformed belt markers never admit', () => {
  for (const initialize of [initializeOceanBenthicLife, initializeOceanMeadowLife]) {
    const full = fixture({ count: 20 }), history = clone(full.region.agents);
    assert.equal(initialize(full.region, full.generator, { ...options(full), fresh: true }), true);
    assert.deepEqual(full.region.agents, history); assert.equal(full.region.basicNetwork.ledger.externalInput, 0);
    const snapshot = clone(full.region); assert.equal(initialize(full.region, full.generator, { ...options(full), fresh: true }), false);
    assert.deepEqual(full.region, snapshot); balanced(full.region);
    const old = fixture(); old.region.timeSec = .1; old.region.ticks = 1; const saved = clone(old.region);
    assert.equal(initialize(old.region, old.generator, { ...options(old), fresh: true }), false); assert.deepEqual(old.region, saved);
    for (const corrupt of [r => { r.meadowAnimalBeltVersion = 2; }, r => { r.meadowAnimalBelt.groupId = 'wrong'; },
      r => { r.meadowAnimalBeltUnknown = 1; }, r => { delete r.meadowAnimalBelt; }]) {
      const f = fixture(); corrupt(f.region); const before = clone(f.region);
      assert.equal(initialize(f.region, f.generator, { ...options(f), fresh: true }), false); assert.deepEqual(f.region, before);
    }
    const a = fixture(), b = fixture();
    assert.equal(initialize(a.region, a.generator, { ...options(a), fresh: true }), true);
    assert.equal(initialize(b.region, b.generator, { ...options(b), fresh: true }), true); assert.deepEqual(a.region, b.region);
    const dead = a.region.agents[0]; dead.alive = false; recordLivingDeath(a.region, dead);
    const deceased = clone(a.region); assert.equal(initialize(a.region, a.generator, { ...options(a), fresh: true }), false);
    assert.deepEqual(a.region, deceased); balanced(a.region);
  }
});
