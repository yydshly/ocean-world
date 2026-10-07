import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanBenthicLifePlan, initializeOceanBenthicLife, tickOceanBenthicLifeAgent,
  validateOceanBenthicLifeRecord, OCEAN_BENTHIC_LIFE_IDS } from '../src/oceanBenthicLife.js';
import { oceanBenthicLifeSpeciesById } from '../src/oceanBenthicLifeSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

const allPresent = () => .1, clone = value => JSON.parse(JSON.stringify(value));
function fixture({ floorY = -3, rocks = true, grass = true } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64,
    bounds: { minX: 192, maxX: 256, minZ: 192, maxZ: 256 }, counts: {}, elements: [] };
  if (rocks) for (const [i, [x, z]] of [[209, 211], [234, 229]].entries()) chunk.elements.push({ id: `rock:${i}`,
    kind: 'rock', profile: 'terrace', x, y: floorY, z, scale: { x: 18, y: 1, z: 16 }, rotation: .2 });
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6, y: floorY, z: 248,
    scale: { x: .7, y: .4, z: .7 }, rotation: 0 });
  const bed = () => floorY;
  const surface = (x, z) => chunk.elements.reduce((height, e) => {
    const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : null; return h === null ? height : Math.max(height, h);
  }, floorY);
  const generator = { seed: 'benthic-fixture-2', profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand' }) };
  return { generator, chunk, bed, surface };
}
function regionFor(chunk, count = 0, turtleCount = 0) {
  const region = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae: .4, plankton: .5, detritus: .3 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 }, turtleAgents: [] };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: chunk.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .5, sizeM: .075, position: { x: 254, y: -1, z: 254 }, home: { x: 254, y: -1, z: 254 } });
  for (let i = 0; i < turtleCount; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(region, chunk); return region;
}
function initialized(options = {}, count = 0, turtleCount = 0) {
  const f = fixture(options), region = regionFor(f.chunk, count, turtleCount);
  assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent }), true);
  return { ...f, region };
}
const balanced = region => { assert.ok(Math.abs(livingNetworkBalance(region)) < 1e-9); assert.ok(validateLivingNetworkRecord(region)); };

test('four source-scaled actual animals use independent deterministic habitat planning without scenery', () => {
  const f = fixture(), stub = { id: '3,3', cx: 3, cz: 3, agents: [] }, salts = [];
  const plan = createOceanBenthicLifePlan(f.generator, stub, { ...f, random: salt => { salts.push(salt); return .1; }, availableSlots: 4 });
  assert.equal(plan.placements.length, 4); assert.deepEqual(new Set(plan.placements.map(p => p.speciesId)), new Set(OCEAN_BENTHIC_LIFE_IDS));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements[0])); assert.equal(plan.patches, undefined);
  assert.ok(salts.every(s => s.startsWith('benthic-life-v1|')));
  assert.deepEqual(createOceanBenthicLifePlan(f.generator, stub, { ...f, random: allPresent, availableSlots: 4 }), plan);
  assert.equal(createOceanBenthicLifePlan(f.generator, stub, { ...f, availableSlots: 0 }).placements.length, 0);
  for (const p of plan.placements) {
    const [low, high] = oceanBenthicLifeSpeciesById[p.speciesId].sizeRangeM;
    assert.ok(p.sizeM >= low && p.sizeM <= high);
    if (['blue-spotted-ray', 'reef-goatfish'].includes(p.speciesId)) assert.equal(p.mode, 'soft');
  }
});

test('only strict fresh time-zero network owners admit; deaths and turtles consume the twenty-record cap', () => {
  const f = fixture(), region = regionFor(f.chunk, 16, 2), before = clone(region);
  assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, random: allPresent }), false); assert.deepEqual(region, before);
  assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent }), true);
  assert.equal(region.agents.length + region.turtleAgents.length, 20); assert.deepEqual(region.agents.slice(0, 16), before.agents);
  assert.deepEqual(region.turtleAgents, before.turtleAgents); assert.equal(region.benthicLife.initialInputUnits, .008);
  const saved = clone(region); assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true }), false); assert.deepEqual(region, saved);
  assert.ok(validateOceanBenthicLifeRecord(region, f.generator, f)); balanced(region);
  for (const mutate of [r => { r.timeSec = .1; }, r => { delete r.basicNetwork; }, r => { r.benthicLifeInitializedAtSec = 0; }]) {
    const old = regionFor(f.chunk); mutate(old); const snapshot = clone(old);
    assert.equal(initializeOceanBenthicLife(old, f.generator, { ...f, fresh: true }), false); assert.deepEqual(old, snapshot);
  }
});

test('empty niches and complete historical records receive a durable examined marker without refill', () => {
  for (const { f, count } of [{ f: fixture({ floorY: -35 }), count: 0 }, { f: fixture(), count: 20 }]) {
    const region = regionFor(f.chunk, count);
    assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent }), true);
    assert.equal(region.benthicLife.addedIds.length, 0); assert.equal(region.benthicLife.initialInputUnits, 0);
    assert.ok(validateOceanBenthicLifeRecord(region, f.generator, f)); const before = clone(region);
    assert.equal(initializeOceanBenthicLife(region, f.generator, { ...f, fresh: true, random: allPresent }), false); assert.deepEqual(region, before); balanced(region);
  }
});

test('full stingray tail probes reject an obstruction beyond the disc and admitted coral patches are real obstacles', () => {
  const { generator, region, surface, bed, chunk } = initialized({ rocks: false, grass: false });
  const ray = region.agents.find(a => a.speciesId === 'blue-spotted-ray'), c = Math.cos(ray.heading), s = Math.sin(ray.heading);
  const reach = -1.2666666666666666 * ray.sizeM, x = ray.home.x + reach * c, z = ray.home.z + reach * s;
  assert.ok(Math.hypot(x - ray.home.x, z - ray.home.z) > ray.sizeM * .5);
  const obstructed = (px, pz, crown = false) => surface(px, pz) + (crown && Math.hypot(px - x, pz - z) < .004 ? .3 : 0);
  assert.equal(validateOceanBenthicLifeRecord(region, generator, { surface: obstructed, bed }), false);
  const plan = createOceanBenthicLifePlan(generator, { id: region.id, cx: 3, cz: 3, agents: [] }, { surface: obstructed, bed, random: allPresent, availableSlots: 4 });
  const alternative = plan.placements.find(p => p.speciesId === 'blue-spotted-ray');
  assert.ok(!alternative || alternative.siteId !== ray.benthicLifeSiteId);
  const withPatch = regionFor(chunk);
  withPatch.biodiversity = { patches: [{ id: 'actual-coral-patch', speciesId: 'biodiversity-massive-coral', x, y: bed(x, z) - .012, z,
    rotation: 0, scale: { x: .55, y: .3025, z: .55 } }] };
  const protectedPlan = createOceanBenthicLifePlan(generator, withPatch, { surface, bed, random: allPresent, availableSlots: 4 });
  assert.ok(!protectedPlan.placements.some(p => p.speciesId === ray.speciesId && p.siteId === ray.benthicLifeSiteId));
});

test('real-clock day/night movement conserves food and organic ledgers and restores target orientation', () => {
  const { generator, region, ...support } = initialized(); const starts = new Map(region.agents.map(a => [a.id, { ...a.position }]));
  for (let i = 1; i <= 160; i++) {
    region.timeSec = i * .1; region.ticks = i;
    for (const agent of region.agents) tickOceanBenthicLifeAgent(region, generator, agent, .1,
      { ...support, random: allPresent, environment: { lightAtDepth: i <= 80 ? .8 : .01 } });
    if (i === 80 || i === 160) assert.ok(validateOceanBenthicLifeRecord(region, generator, support));
  }
  assert.ok(region.benthicLife.counters.feedings > 0 && region.ledger.ingested > 0);
  for (const a of region.agents) {
    assert.ok(a.lastFeedAt !== null); assert.equal(a.pitch, 0);
    assert.ok(Math.hypot(a.position.x - starts.get(a.id).x, a.position.z - starts.get(a.id).z) > .001);
  }
  assert.ok(region.events.every(e => e.pool === 'detritus' && e.targetId === null && !e.title.includes(e.agentId)));
  balanced(region); assert.ok(validateOceanBenthicLifeRecord(clone(region), generator, support));
});

test('dead and zero-step animals cannot move or ingest; light gates are qualitative rather than forced feeding', () => {
  const { generator, region, ...support } = initialized(); const before = clone(region);
  for (const a of region.agents) tickOceanBenthicLifeAgent(region, generator, a, 0, support); assert.deepEqual(region, before);
  region.timeSec = 4;
  for (const a of region.agents.filter(a => a.speciesId !== 'reef-goatfish')) tickOceanBenthicLifeAgent(region, generator, a, .1, { ...support, environment: { lightAtDepth: .8 } });
  assert.equal(region.ledger.ingested, 0); assert.ok(region.agents.filter(a => a.speciesId !== 'reef-goatfish').every(a => a.state === 'resting'));
  const dead = region.agents[0]; dead.alive = false; recordLivingDeath(region, dead); const afterDeath = clone(region);
  tickOceanBenthicLifeAgent(region, generator, dead, 1, { ...support, environment: { lightAtDepth: .01 } }); assert.deepEqual(region, afterDeath);
  assert.ok(validateOceanBenthicLifeRecord(region, generator, support)); balanced(region);
});

test('the unresolved nutrition proxy cannot feed from an empty pool or create untracked input', () => {
  const { generator, region, ...support } = initialized(); const removed = region.resources.detritus;
  region.resources.detritus = 0; region.ledger.exported += removed; region.basicNetwork.ledger.output += removed; region.basicNetwork.processTotals.systemOutput += removed;
  const input = region.basicNetwork.ledger.externalInput; region.timeSec = 10;
  for (const a of region.agents) tickOceanBenthicLifeAgent(region, generator, a, .1, { ...support, environment: { lightAtDepth: a.speciesId === 'reef-goatfish' ? .8 : .01 } });
  assert.equal(region.benthicLife.counters.feedings, 0); assert.equal(region.events.length, 0); assert.equal(region.basicNetwork.ledger.externalInput, input); balanced(region);
});

test('cold validators reject grafted markers, changed births, mode, size, target orientation and nonzero ray pitch', () => {
  const { generator, region, ...support } = initialized();
  for (const mutate of [r => { r.agents[0].pitch = .01; }, r => { r.agents[0].sizeM = 9; },
    r => { r.agents[0].home.x += .01; }, r => { r.benthicLife.birthPlacements[0].x += .01; },
    r => { r.agents[0].benthicLifeMode = 'hard'; }, r => { r.agents[0].targetHeading = NaN; },
    r => { r.agents.push({ speciesId: 'green-chromis', benthicLifeIndividualVersion: 1 }); },
    r => { r.benthicLife.addedIds[0] = 'invented'; }, r => { r.benthicLifeVersion = 2; }]) {
    const corrupt = clone(region); mutate(corrupt); assert.equal(validateOceanBenthicLifeRecord(corrupt, generator, support), false);
  }
  assert.ok(validateOceanBenthicLifeRecord(clone(region), generator, support));
});

test('finite ordinary native owners vary habitat allocations reproducibly with the production string seed', () => {
  const generator = createLivingShallowsGenerator(livingShallowsSeed('42'));
  const bed = (x, z) => generator.floorSurface(x, z).height;
  const surface = (x, z, crown = false) => oceanSupportHeight(generator, x, z, { avoidCoral: crown });
  const snapshots = [];
  for (const [cx, cz] of [[188, 14], [176, 4], [182, -16]]) {
    const chunk = generator.chunk(cx, cz), region = regionFor(chunk);
    const plan = createOceanBenthicLifePlan(generator, region, { surface, bed, availableSlots: 4 });
    generator.chunk(-4, -4);
    assert.deepEqual(createOceanBenthicLifePlan(generator, region, { surface, bed, availableSlots: 4 }), plan);
    assert.equal(initializeOceanBenthicLife(region, generator, { surface, bed, fresh: true }), true);
    assert.ok(validateOceanBenthicLifeRecord(region, generator, { surface, bed })); balanced(region);
    snapshots.push(plan.placements.map(p => `${p.speciesId}:${p.mode}`).join(','));
    for (let i = 1; i <= 30; i++) {
      region.timeSec = i * .1; region.ticks = i;
      for (const a of region.agents) tickOceanBenthicLifeAgent(region, generator, a, .1,
        { surface, bed, environment: { lightAtDepth: a.speciesId === 'reef-goatfish' ? .8 : .01 } });
    }
    assert.ok(validateOceanBenthicLifeRecord(clone(region), generator, { surface, bed })); balanced(region);
  }
  assert.ok(snapshots.some(s => s.length > 0)); assert.ok(new Set(snapshots).size > 1);
});

test('one synchronous tick queries supports once per coordinate while the next tick sees a new tail obstruction', () => {
  const { generator, region, surface, bed } = initialized({ rocks: false, grass: false });
  const ray = region.agents.find(a => a.speciesId === 'blue-spotted-ray');
  const surfaces = new Map(), floors = new Map(); let obstruction = null;
  const countedSurface = (x, z, crown = false) => {
    const key = `${x},${z},${crown ? 1 : 0}`; surfaces.set(key, (surfaces.get(key) ?? 0) + 1);
    return surface(x, z) + (crown && obstruction && Math.hypot(x - obstruction.x, z - obstruction.z) < .004 ? .3 : 0);
  };
  const countedBed = (x, z) => { const key = `${x},${z}`; floors.set(key, (floors.get(key) ?? 0) + 1); return bed(x, z); };
  region.timeSec = 1; region.ticks = 10; ray.nextDecision = 0; ray.nextBite = 0;
  tickOceanBenthicLifeAgent(region, generator, ray, .1, { surface: countedSurface, bed: countedBed, random: allPresent,
    environment: { lightAtDepth: .01 } });
  assert.ok(ray.lastFeedAt === 1 && Math.hypot(ray.velocity.x, ray.velocity.z) > 0);
  // Four complete surveys remain: selected target, next pose, midpoint and
  // previous pose at the intended heading. Target/feeding duplicates disappear.
  assert.ok(surfaces.size > 500 && surfaces.size <= 800, `unique surface queries ${surfaces.size}`);
  assert.ok(floors.size <= 400); assert.ok([...surfaces.values(), ...floors.values()].every(n => n === 1));
  const previous = { ...ray.position }, food = region.resources.detritus, reach = -1.2666666666666666 * ray.sizeM;
  obstruction = { x: previous.x + Math.cos(ray.heading) * reach, z: previous.z + Math.sin(ray.heading) * reach };
  region.timeSec = 1.1; region.ticks = 11; ray.nextBite = 0; surfaces.clear(); floors.clear();
  tickOceanBenthicLifeAgent(region, generator, ray, .1, { surface: countedSurface, bed: countedBed, random: allPresent,
    environment: { lightAtDepth: .01 } });
  assert.deepEqual(ray.position, previous); assert.equal(region.resources.detritus, food);
  assert.deepEqual(ray.velocity, { x: 0, y: 0, z: 0 }); assert.ok(surfaces.size > 0);
  balanced(region);
});
