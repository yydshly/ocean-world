import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanMeadowLifePlan, initializeOceanMeadowLife, tickOceanMeadowLife, validateOceanMeadowLifeRecord,
  oceanMeadowLifePositionValid, oceanMeadowLifeBalance, oceanMeadowLifeSnapshot, OCEAN_MEADOW_LIFE_IDS } from '../src/oceanMeadowLife.js';
import { oceanMeadowLifeSpeciesById } from '../src/oceanMeadowLifeSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { livingShallowsMeadowGeometry } from '../src/world/livingShallowsAssets.js';
import { initializeLivingNetwork, tickLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

const clone = value => structuredClone(value), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function fixture({ floorY = 0, grass = true, rocks = true, seed = 'meadow-fixture-0' } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64, elements: [] };
  if (rocks) chunk.elements.push({ id: 'reef-rock', kind: 'rock', profile: 'terrace', x: 210, y: floorY, z: 211,
    scale: { x: 12, y: 2, z: 12 }, rotation: .2 });
  chunk.elements.push({ id: 'algal-descriptor', kind: 'algae', x: 215, y: floorY, z: 220, scale: { x: 1, y: .1, z: 1 }, rotation: 0 });
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6, y: floorY, z: 248,
    scale: { x: .7, y: .4, z: .7 }, rotation: .1 });
  const bed = () => floorY;
  const surface = (x, z) => chunk.elements.reduce((y, e) => e.kind === 'rock' ? Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity) : y, floorY);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand' }) };
  return { generator, chunk, surface, bed };
}
function regionFor(chunk, { count = 0, turtles = 0, prey = .05, algae = .4, plankton = .5 } = {}) {
  const r = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae, plankton, detritus: .3 },
    ledger: { initial: algae + plankton + .3, input: 0, ingested: 0, exported: 0 },
    reefGuildVersion: 1, reefGuild: { preyOrganicUnits: prey } };
  for (let i = 0; i < count; i++) r.agents.push({ id: `old:${i}`, regionId: r.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .5, sizeM: .075, position: { x: chunk.origin.x + 62, y: 2, z: chunk.origin.z + 62 }, timeSec: 0 });
  for (let i = 0; i < turtles; i++) r.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(r, chunk); return r;
}
function initialized(options = {}, population = {}) {
  const f = fixture(options), region = regionFor(f.chunk, population);
  assert.equal(initializeOceanMeadowLife(region, f.generator, { fresh: true, surface: f.surface, bed: f.bed }), true);
  assert.ok(validateOceanMeadowLifeRecord(region, f.generator, f)); return { ...f, region };
}
function balanced(r) { assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); assert.equal(oceanMeadowLifeBalance(r), livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r)); }
function step(f, { hour = 2, lightAtDepth = 0, network = true } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  const environment = { hour, lightAtDepth, foodSupply: 0, currentMps: 0 };
  if (network) tickLivingNetwork(f.region, environment, .1);
  assert.equal(tickOceanMeadowLife(f.region, f.generator, .1, { surface: f.surface, bed: f.bed, environmentAt: () => environment }), true);
  assert.ok(validateOceanMeadowLifeRecord(f.region, f.generator, f));
}

test('independent finite planning selects four source-sized whole forms and leaves old records and food intact', () => {
  const f = fixture(), r = regionFor(f.chunk, { count: 2 }), before = clone(r);
  const plan = createOceanMeadowLifePlan(f.generator, r, { ...f, availableSlots: 4 });
  assert.deepEqual(new Set(plan.placements.map(a => a.speciesId)), new Set(OCEAN_MEADOW_LIFE_IDS));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements[0])); assert.equal(plan.patches, undefined);
  assert.deepEqual(createOceanMeadowLifePlan(f.generator, r, { ...f, availableSlots: 4 }), plan); assert.deepEqual(r, before);
  assert.equal(createOceanMeadowLifePlan(f.generator, r, { ...f, availableSlots: 0 }).placements.length, 0);
  assert.equal(initializeOceanMeadowLife(r, f.generator, { ...f, fresh: true }), true);
  assert.deepEqual(r.agents.slice(0, 2), before.agents); assert.deepEqual(r.resources, before.resources); assert.deepEqual(r.ledger, before.ledger);
  assert.equal(r.meadowLife.initialInputUnits, .016); assert.equal(r.basicNetwork.ledger.externalInput, .016);
  for (const a of r.agents.slice(2)) {
    const s = oceanMeadowLifeSpeciesById[a.speciesId]; assert.ok(a.sizeM >= s.sizeRangeM[0] && a.sizeM <= s.sizeRangeM[1]);
    assert.ok(oceanMeadowLifePositionValid(r, f.generator, a, a.position, f));
    if (a.speciesId === 'spider-conch') assert.equal(a.meadowLifeHostId, 'reef-rock');
  }
  balanced(r);
});

test('strict fresh admission counts dead/turtle records and complete empty owners remain sealed', () => {
  const f = fixture(), r = regionFor(f.chunk, { count: 16, turtles: 2 }), before = clone(r);
  assert.equal(initializeOceanMeadowLife(r, f.generator, f), false); assert.deepEqual(r, before);
  assert.equal(initializeOceanMeadowLife(r, f.generator, { ...f, fresh: true }), true);
  assert.equal(r.agents.length + r.turtleAgents.length, 20); assert.equal(r.meadowLife.initialInputUnits, .008);
  assert.deepEqual(r.agents.slice(0, 16), before.agents); assert.deepEqual(r.turtleAgents, before.turtleAgents); balanced(r);
  for (const mutate of [r => { r.timeSec = .1; r.ticks = 1; }, r => { r.meadowLifeUnknown = 1; },
    r => { r.agents[0].meadowLifeUnknown = 1; }, r => { r.turtleAgents[0].meadowLifeUnknown = 1; }]) {
    const partial = regionFor(f.chunk, { count: 1, turtles: 1 }); mutate(partial); const saved = clone(partial);
    assert.equal(initializeOceanMeadowLife(partial, f.generator, { ...f, fresh: true }), false); assert.deepEqual(partial, saved);
    if (Object.keys(partial).some(k => k.startsWith('meadowLife')) || partial.agents.some(a => a.meadowLifeUnknown) || partial.turtleAgents.some(a => a.meadowLifeUnknown))
      assert.equal(validateOceanMeadowLifeRecord(partial, f.generator, f), false);
  }
  for (const empty of [initialized({ floorY: -30 }), initialized({}, { count: 20 })]) {
    assert.equal(empty.region.meadowLife.addedIds.length, 0); const saved = clone(empty.region);
    assert.equal(initializeOceanMeadowLife(empty.region, empty.generator, { ...empty, fresh: true }), false); assert.deepEqual(empty.region, saved); balanced(empty.region);
  }
});

test('seahorse tail anchors to an actual shared grass vertex while soft pen and hard conch retain different supports', () => {
  const f = initialized(), sea = f.region.agents.find(a => a.speciesId === 'sand-edge-seahorse'), pen = f.region.agents.find(a => a.speciesId === 'barrel-sea-pen'), conch = f.region.agents.find(a => a.speciesId === 'spider-conch');
  const host = f.chunk.elements.find(e => e.id === sea.meadowLifeHostId), geometry = livingShallowsMeadowGeometry();
  try {
    const p = geometry.attributes.position, vertex = sea.meadowLifeLeafIndex * 10 + 8, c = Math.cos(host.rotation), s = Math.sin(host.rotation);
    assert.ok(distance(sea.position, { x: host.x + p.getX(vertex) * host.scale.x * c + p.getZ(vertex) * host.scale.z * s,
      y: host.y + p.getY(vertex) * host.scale.y, z: host.z - p.getX(vertex) * host.scale.x * s + p.getZ(vertex) * host.scale.z * c }) < 1e-10);
  } finally { geometry.dispose(); }
  assert.equal(pen.meadowLifeHostId, null); assert.ok(pen.position.y - pen.sizeM * .25 < f.bed(pen.position.x, pen.position.z));
  assert.ok(conch.position.y > f.bed(conch.position.x, conch.position.z) + 1); assert.equal(conch.pitch, 0);
  const wrongLeaf = clone(f.region); wrongLeaf.agents.find(a => a.id === sea.id).meadowLifeLeafIndex = 1;
  assert.equal(validateOceanMeadowLifeRecord(wrongLeaf, f.generator, f), false);
  const rockBed = { ...f.generator, sample: () => ({ substrate: 'rock' }) };
  assert.equal(oceanMeadowLifePositionValid(f.region, rockBed, pen, pen.position, f), false);
  assert.equal(oceanMeadowLifePositionValid(f.region, f.generator, conch, { ...conch.position, y: 0 }, f), false);
});

test('whole cuttlefish arms and explicit pitch reject solid overlap beyond the body centre', () => {
  const f = initialized(), a = f.region.agents.find(a => a.speciesId === 'reef-cuttlefish');
  const x = a.position.x + Math.cos(a.heading) * a.sizeM * 1.28, z = a.position.z + Math.sin(a.heading) * a.sizeM * 1.28;
  assert.ok(Math.hypot(x - a.position.x, z - a.position.z) > a.sizeM);
  const obstruction = (px, pz, crown = false) => f.surface(px, pz) + (crown && Math.hypot(px - x, pz - z) < .003 ? 1 : 0);
  assert.equal(oceanMeadowLifePositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false);
  assert.equal(oceanMeadowLifePositionValid(f.region, f.generator, a, a.position, { ...f, pitch: .16 }), false);
  assert.equal(oceanMeadowLifePositionValid(f.region, f.generator, a, a.position, { ...f, pitch: .15 }), true);
  assert.equal(oceanMeadowLifePositionValid(f.region, f.generator, a, { ...a.position, y: f.surface(a.position.x, a.position.z) + .025 }, f), false);
});

test('one native clock drives visible motion and real debit receipts; a dark daytime pen still cannot feed', () => {
  const f = initialized(), starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)])), pen = f.region.agents.find(a => a.speciesId === 'barrel-sea-pen');
  for (let i = 0; i < 35; i++) step(f, { hour: 14, lightAtDepth: 0 });
  assert.equal(pen.colonyExtension, 0); assert.equal(pen.lastFeedAt, null); assert.equal(pen.lastMeadowIntake, null);
  for (let i = 0; i < 35; i++) step(f, { hour: 2, lightAtDepth: 0 });
  assert.ok(pen.colonyExtension > .9 && pen.lastFeedAt !== null);
  let raw = 0, prey = 0;
  for (const e of f.region.meadowLife.events) { if (e.pool === 'reefGuild.preyOrganicUnits') prey += e.removedUnits; else raw += e.removedUnits; }
  assert.ok(raw > 0 && prey > 0); assert.ok(Math.abs(f.region.ledger.ingested - raw) < 1e-12);
  for (const a of f.region.agents) {
    const receipt = a.lastMeadowIntake; assert.equal(receipt.pool, a.meadowLifeFoodPool); assert.equal(receipt.ownerId, f.region.id);
    assert.ok(Math.abs(receipt.stockBefore - receipt.stockAfter - receipt.removedUnits) < 1e-12); assert.equal(receipt.timeSec, a.lastFeedAt);
    assert.equal(a.timeSec, f.region.timeSec);
    if (['reef-cuttlefish', 'spider-conch'].includes(a.speciesId)) assert.ok(distance(starts.get(a.id), a.position) > .001);
    else assert.deepEqual(a.position, starts.get(a.id));
  }
  assert.ok(f.region.events.length === 0); balanced(f.region); assert.ok(validateOceanMeadowLifeRecord(clone(f.region), f.generator, f));
});

test('empty and arbitrarily small actual stocks never create food or lose an unrecorded debit', () => {
  for (const prey of [0, 1e-13]) {
    const f = initialized({}, { prey, algae: 0, plankton: 0 }), input = f.region.basicNetwork.ledger.externalInput;
    for (const a of f.region.agents) a.nextBite = 0;
    step(f, { hour: 14, lightAtDepth: 0, network: false });
    assert.equal(f.region.reefGuild.preyOrganicUnits, 0); assert.equal(f.region.ledger.ingested, 0);
    assert.equal(f.region.basicNetwork.ledger.externalInput, input); assert.equal(f.region.meadowLife.counters.consumedUnits, prey);
    assert.equal(f.region.meadowLife.events.length, prey > 0 ? 1 : 0);
    if (prey > 0) { const e = f.region.agents.find(a => a.lastMeadowIntake).lastMeadowIntake; assert.equal(e.stockBefore, prey); assert.equal(e.stockAfter, 0); assert.equal(e.removedUnits, prey); }
    balanced(f.region);
  }
});

test('duplicate or skipped ticks reject before mutation, upstream respiration is once only, and death clocks freeze', () => {
  const f = initialized(), sea = f.region.agents.find(a => a.speciesId === 'sand-edge-seahorse');
  const before = clone(f.region); assert.equal(tickOceanMeadowLife(f.region, f.generator, .1, f), false); assert.deepEqual(f.region, before);
  for (const [timeSec, ticks, dt] of [[.1, 1, 0], [.1, 1, .2], [.2, 2, .1]]) {
    const r = clone(before); r.timeSec = timeSec; r.ticks = ticks; const saved = clone(r);
    assert.equal(tickOceanMeadowLife(r, f.generator, dt, f), false); assert.deepEqual(r, saved);
  }
  const organic = sea.organicUnits; sea.nextBite = 100; step(f, { hour: 14, lightAtDepth: 0 });
  assert.ok(Math.abs(sea.organicUnits - organic * (1 - .0001 * .1)) < 1e-15);
  const after = clone(f.region); assert.equal(tickOceanMeadowLife(f.region, f.generator, .1, f), false); assert.deepEqual(f.region, after);
  sea.energy = 0; step(f); assert.equal(sea.alive, false); assert.equal(sea.organicUnits, 0); assert.equal(sea.organicDeathRecorded, true);
  const dead = clone(sea); for (let i = 0; i < 3; i++) step(f);
  assert.deepEqual(sea, dead); assert.equal(f.region.meadowLife.counters.deaths, 1); assert.equal(f.region.counters.deaths, 1);
  const saved = clone(f.region); assert.equal(initializeOceanMeadowLife(f.region, f.generator, { ...f, fresh: true }), false); assert.deepEqual(f.region, saved); balanced(f.region);
});

test('cold validation rejects corrupted native births/receipts and twelve real ordinary owners have finite varied admission', () => {
  const f = initialized(); for (let i = 0; i < 35; i++) step(f);
  for (const mutate of [r => { r.meadowLifeUnknown = 1; }, r => { r.agents[0].meadowLifeUnknown = 1; },
    r => { r.agents[0].sizeM += .0001; }, r => { r.agents[0].home.x += .01; }, r => { r.meadowLife.birthPlacements[0].heading += .01; },
    r => { r.agents[0].targetHeading = NaN; }, r => { r.agents[0].meadowLifeFoodPool = 'detritus'; },
    r => { r.agents[0].lastMeadowIntake.stockBefore += .001; }, r => { r.agents[0].lastMeadowIntake.ownerId = '0,0'; },
    r => { r.agents[0].lastMeadowIntake.timeSec = r.timeSec + .1; }, r => { r.meadowLife.ticks--; }]) {
    const corrupt = clone(f.region); mutate(corrupt); assert.equal(validateOceanMeadowLifeRecord(corrupt, f.generator, f), false);
  }
  const snapshot = oceanMeadowLifeSnapshot(f.region); snapshot.meadowLife.counters.feedings = 999; assert.notEqual(f.region.meadowLife.counters.feedings, 999);
  const generator = createLivingShallowsGenerator(livingShallowsSeed('42')), allocations = [], covered = new Set();
  // These production owners prove original terrain/grass/rock eligibility.
  // Empty occupancy here is not a claim about actual local animal density or
  // available old-guild nutrition; the integration suite covers those stocks.
  for (const [cx, cz] of [[194,20],[188,14],[176,4],[182,-16],[193,20],[195,20],[194,19],[194,21],[187,14],[189,14],[188,13],[188,15]]) {
    const chunk = generator.chunk(cx, cz), r = regionFor(chunk, { prey: 0 });
    const plan = createOceanMeadowLifePlan(generator, r, { availableSlots: 4 }); generator.chunk(-4, -4);
    assert.deepEqual(createOceanMeadowLifePlan(generator, r, { availableSlots: 4 }), plan);
    assert.equal(initializeOceanMeadowLife(r, generator, { fresh: true }), true); assert.ok(validateOceanMeadowLifeRecord(clone(r), generator)); balanced(r);
    allocations.push(r.agents.map(a => a.speciesId).join(',')); for (const a of r.agents) { covered.add(a.speciesId); assert.ok(oceanMeadowLifePositionValid(r, generator, a)); }
    r.ticks = 1; r.timeSec = .1; assert.equal(tickOceanMeadowLife(r, generator, .1, { environmentAt: () => ({ hour: 14, lightAtDepth: 0 }) }), true);
    assert.ok(validateOceanMeadowLifeRecord(r, generator)); balanced(r);
  }
  assert.ok(new Set(allocations).size > 1); assert.deepEqual(covered, new Set(OCEAN_MEADOW_LIFE_IDS));
});
