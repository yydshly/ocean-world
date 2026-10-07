import test from 'node:test';
import assert from 'node:assert/strict';
import { OCEAN_SHOAL_LIFE_IDS, OCEAN_SHOAL_LIFE_MODEL, oceanShoalLifeRole, createOceanShoalLifePlan, initializeOceanShoalLife,
  validateOceanShoalLifeRecord, tickOceanShoalLife, oceanShoalLifePositionValid, oceanShoalLifeSnapshot, oceanShoalLifeBalance } from '../src/oceanShoalLife.js';
import { initializeLivingNetwork, tickLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';

const clone = v => structuredClone(v), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const SHARK = 'blacktip-reef-shark', FISH = OCEAN_SHOAL_LIFE_IDS.filter(id => id !== SHARK);
function fixture(seed = 'shoal-fixture-0', { floorY = -8, plankton = .5, prey = .08, count = 0, turtles = 0 } = {}) {
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64, elements: [] };
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }), sample: () => ({ floorY, depthM: 8 - floorY, substrate: 'sand' }) };
  const region = { id: chunk.id, cx: 3, cz: 3, ticks: 0, timeSec: 0, agents: [], turtleAgents: [], events: [], counters: { feeding: 0, deaths: 0 },
    resources: { algae: .3, plankton, detritus: .2 }, ledger: { initial: .5 + plankton, input: 0, ingested: 0, exported: 0 },
    openWaterLifeVersion: 1, openWaterLife: { preyOrganicUnits: prey } };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, speciesId: 'green-chromis', regionId: region.id, sizeM: .075,
    alive: i % 2 === 0, energy: .5, timeSec: 0, position: { x: 254, y: -6, z: 254 } });
  for (let i = 0; i < turtles; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  initializeLivingNetwork(region, chunk);
  return { generator, region, chunk, bed: () => floorY, surface: () => floorY };
}
function chosen(id, { shark = false, ...options } = {}) {
  for (let i = 0; i < 180; i++) { const f = fixture(`shoal-fixture-${i}`, options);
    if (!oceanShoalLifeRole(f.region, f.generator)) continue;
    const plan = createOceanShoalLifePlan(f.generator, f.region, { ...f, availableSlots: 8 });
    if (plan.school?.speciesId !== id || (shark && !plan.placements.some(a => a.speciesId === SHARK))) continue;
    assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true, role: true }), true);
    assert.ok(validateOceanShoalLifeRecord(f.region, f.generator, f)); return f;
  } throw new Error(`No finite fixture for ${id}`);
}
function balanced(r) { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); assert.equal(oceanShoalLifeBalance(r), livingNetworkBalance(r)); }
function step(f, { network = true } = {}) {
  const environment = { foodSupply: 0, currentMps: 0, lightAtDepth: 1, hour: 10 };
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  if (network) tickLivingNetwork(f.region, environment, .1);
  assert.equal(tickOceanShoalLife(f.region, f.generator, .1, { ...f, environmentAt: () => environment }), true);
  assert.ok(validateOceanShoalLifeRecord(f.region, f.generator, f)); balanced(f.region);
}

test('one finite native school contains separate source-sized agents, organic stocks and immutable stable membership', () => {
  const f = chosen(FISH[0], { shark: true, count: 2 }), r = f.region, school = r.shoalLife.school;
  assert.ok(school.memberIds.length >= 5 && school.memberIds.length <= 7); assert.ok(r.shoalLife.addedIds.length <= 8);
  assert.equal(r.agents.filter(a => a.speciesId === SHARK).length, 1); assert.equal(school.leaderId, school.memberIds[0]);
  assert.equal(new Set(school.memberIds).size, school.memberIds.length);
  assert.deepEqual(r.resources, { algae: .3, plankton: .5, detritus: .2 }); assert.equal(r.openWaterLife.preyOrganicUnits, .08);
  assert.equal(r.basicNetwork.ledger.externalInput, r.shoalLife.addedIds.length * .004);
  for (const id of r.shoalLife.addedIds) { const a = r.agents.find(a => a.id === id);
    assert.equal(a.organicUnits, .004); assert.ok(oceanShoalLifePositionValid(r, f.generator, a, a.position, { ...f, occupancy: true })); }
  const fresh = fixture(f.generator.seed, { count: 2 }), before = clone(fresh.region), plan = createOceanShoalLifePlan(fresh.generator, fresh.region, { ...fresh, availableSlots: 8 });
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements[0])); assert.deepEqual(createOceanShoalLifePlan(fresh.generator, fresh.region, { ...fresh, availableSlots: 8 }), plan);
  assert.deepEqual(fresh.region, before); assert.deepEqual(r.agents.slice(0, 2), before.agents); balanced(r);
});

test('salted boolean role and strict fresh admission retain dead/turtle capacity and seal complete empty owners', () => {
  const selected = chosen(FISH[0]), f = fixture(selected.generator.seed, { count: 15, turtles: 2 }), before = clone(f.region);
  assert.equal(oceanShoalLifeRole({ id: f.region.id, cx: f.region.cx, cz: f.region.cz }, f.generator), oceanShoalLifeRole(f.region, f.generator));
  assert.equal(initializeOceanShoalLife(f.region, f.generator, f), false); assert.deepEqual(f.region, before);
  assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true }), true);
  assert.equal(f.region.shoalLife.addedIds.length, 0); assert.equal(f.region.shoalLife.admissionSlots, 3); assert.equal(f.region.agents.length + f.region.turtleAgents.length, 17);
  assert.ok(validateOceanShoalLifeRecord(f.region, f.generator, f)); const empty = clone(f.region);
  assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true }), false); assert.deepEqual(f.region, empty);
  let inactive; for (let i = 0; i < 30; i++) { const q = fixture(`inactive-${i}`); if (!oceanShoalLifeRole(q.region, q.generator)) { inactive = q; break; } }
  assert.ok(inactive); assert.equal(initializeOceanShoalLife(inactive.region, inactive.generator, { ...inactive, fresh: true }), true);
  assert.equal(inactive.region.shoalLife.role, false); assert.equal(inactive.region.shoalLife.addedIds.length, 0);
  for (const mutate of [r => { r.shoalLifeUnknown = 1; }, r => { r.agents[0].shoalLifeUnknown = 1; }, r => { r.turtleAgents[0].shoalLifeUnknown = 1; }]) {
    const q = fixture(selected.generator.seed, { count: 1, turtles: 1 }); mutate(q.region); const prior = clone(q.region);
    assert.equal(initializeOceanShoalLife(q.region, q.generator, { ...q, fresh: true }), false); assert.equal(validateOceanShoalLifeRecord(q.region, q.generator, q), false); assert.deepEqual(q.region, prior);
  }
  const delayed = fixture(selected.generator.seed); delayed.region.ticks = 1; delayed.region.timeSec = .1;
  assert.equal(initializeOceanShoalLife(delayed.region, delayed.generator, { ...delayed, fresh: true }), false); balanced(f.region); balanced(inactive.region);
});

test('whole neutral and pitched bodies obey actual water depth, reef clearance and current peer spacing', () => {
  const f = chosen(FISH[2]), a = f.region.agents[0];
  assert.ok(oceanShoalLifePositionValid(f.region, f.generator, a, a.position, { ...f, pitch: .12 }));
  assert.equal(oceanShoalLifePositionValid(f.region, f.generator, a, a.position, { ...f, pitch: .13 }), false);
  assert.equal(oceanShoalLifePositionValid(f.region, f.generator, a, { ...a.position, y: 7 }, f), false);
  assert.equal(oceanShoalLifePositionValid(f.region, f.generator, a, { ...a.position, y: 5 }, f), false);
  const end = { x: a.position.x + Math.cos(a.heading) * a.sizeM * .55, z: a.position.z + Math.sin(a.heading) * a.sizeM * .55 };
  const obstruction = (x, z) => Math.hypot(x - end.x, z - end.z) < .002 ? a.position.y : -8;
  assert.equal(oceanShoalLifePositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false);
  const wrong = clone(f.region); wrong.agents[1].position = clone(wrong.agents[0].position);
  assert.equal(validateOceanShoalLifeRecord(wrong, f.generator, f), false);
});

test('native tick moves the full school together with per-individual physical velocity and a preserved roster', () => {
  const f = chosen(FISH[1], { shark: true }), r = f.region, members = clone(r.shoalLife.school.memberIds), births = new Map(r.agents.map(a => [a.id, clone(a.position)]));
  for (let i = 0; i < 240; i++) step(f);
  assert.deepEqual(r.shoalLife.school.memberIds, members); assert.equal(r.shoalLife.ticks, 240); assert.equal(r.shoalLife.lastTickSec, 24);
  assert.ok(r.shoalLife.counters.moved > 0);
  for (const a of r.agents) { assert.ok(distance(a.position, births.get(a.id)) > .005); assert.equal(a.timeSec, r.timeSec);
    const speed = Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z); assert.ok(speed > 0 && speed <= .39 + 1e-8);
    assert.ok(Math.abs(Math.atan2(Math.sin(a.heading - Math.atan2(a.velocity.z, a.velocity.x)), Math.cos(a.heading - Math.atan2(a.velocity.z, a.velocity.x)))) < 1e-8); }
  balanced(r);
});

test('each individual produces a truthful existing-pool debit receipt; empty and tiny stocks never create nutrition', () => {
  for (const id of FISH) { const f = chosen(id, { shark: true }); for (const a of f.region.agents) a.nextBite = 0;
    step(f, { network: false }); assert.equal(f.region.shoalLife.events.length, f.region.agents.length);
    let raw = 0, prey = 0; for (const a of f.region.agents) { const e = a.lastShoalIntake;
      assert.equal(e.ownerId, f.region.id); assert.equal(e.timeSec, a.timeSec); assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12);
      assert.equal(e.pool, a.shoalLifeFoodPool); if (e.pool === 'plankton') raw += e.removedUnits; else prey += e.removedUnits; }
    assert.ok(prey > 0); assert.ok(Math.abs(f.region.ledger.ingested - raw) < 1e-12); assert.ok(Math.abs(.08 - f.region.openWaterLife.preyOrganicUnits - prey) < 1e-12); balanced(f.region);
  }
  for (const quantity of [0, 1e-13]) { const f = chosen(FISH[0], { shark: true, plankton: quantity, prey: quantity }); const input = f.region.basicNetwork.ledger.externalInput;
    for (const a of f.region.agents) a.nextBite = 0; step(f, { network: false });
    assert.equal(f.region.resources.plankton, 0); assert.equal(f.region.openWaterLife.preyOrganicUnits, 0); assert.equal(f.region.shoalLife.counters.consumedUnits, quantity * 2);
    assert.equal(f.region.basicNetwork.ledger.externalInput, input); assert.equal(f.region.shoalLife.events.length, quantity ? 2 : 0); balanced(f.region);
  }
});

test('duplicate, skipped and corrupt ticks are rejected before any ecological or movement mutation', () => {
  const f = chosen(FISH[0]), original = clone(f.region);
  assert.equal(tickOceanShoalLife(f.region, f.generator, .1, f), false); assert.deepEqual(f.region, original);
  for (const [ticks, dt] of [[2, .1], [1, .2]]) { const r = clone(original); r.ticks = ticks; r.timeSec = ticks * .1; const before = clone(r);
    assert.equal(tickOceanShoalLife(r, f.generator, dt, f), false); assert.deepEqual(r, before); }
  const partial = clone(original); partial.ticks = 1; partial.timeSec = .1; partial.agents[0].shoalLifeUnknown = true; const before = clone(partial);
  assert.equal(tickOceanShoalLife(partial, f.generator, .1, f), false); assert.deepEqual(partial, before);
});

test('upstream respiration occurs once, a dead leader stays in the historical roster and all its clocks freeze', () => {
  const f = chosen(FISH[0]), a = f.region.agents[0]; for (const b of f.region.agents) b.nextBite = 100;
  f.region.ticks = 1; f.region.timeSec = .1; const beforeOrganic = a.organicUnits;
  tickLivingNetwork(f.region, { foodSupply: 0, currentMps: 0, lightAtDepth: 1 }, .1); const respired = a.organicUnits;
  assert.ok(Math.abs(respired - beforeOrganic * (1 - .0001 * .1)) < 1e-12);
  assert.equal(tickOceanShoalLife(f.region, f.generator, .1, f), true); assert.equal(a.organicUnits, respired); balanced(f.region);
  a.energy = 1e-8; step(f); assert.equal(a.alive, false); assert.equal(a.organicUnits, 0); assert.equal(a.state, 'dead'); assert.equal(f.region.shoalLife.school.leaderId, a.id);
  assert.ok(f.region.shoalLife.school.memberIds.includes(a.id)); assert.notEqual(f.region.shoalLife.school.activeLeaderId, a.id); const dead = clone(a);
  for (let i = 0; i < 8; i++) step(f); assert.deepEqual(a, dead); assert.equal(f.region.counters.deaths, 1); balanced(f.region);
  assert.equal(initializeOceanShoalLife(f.region, f.generator, { ...f, fresh: true }), false);
});

test('cold next-step restoration is exact, damaged roster/history is rejected and finite native owners admit the whole content pack', () => {
  const f = chosen(FISH[1], { shark: true }); for (let i = 0; i < 8; i++) step(f);
  const restored = { ...f, region: clone(f.region) }, snapshot = oceanShoalLifeSnapshot(f.region); snapshot.shoalLife.school.center.x++;
  assert.notDeepEqual(snapshot, oceanShoalLifeSnapshot(f.region)); step(f); step(restored); assert.deepEqual(restored.region, f.region);
  for (const mutate of [r => { r.shoalLife.school.memberIds.pop(); }, r => { r.shoalLife.birthPlacements[0].sizeM *= 1.1; }, r => { r.shoalLife.school.leaderId = 'other'; },
    r => { r.agents[0].lastShoalIntake.removedUnits *= 2; }, r => { r.shoalLifeUnknown = 1; }, r => { r.agents[0].timeSec -= .1; }, r => { r.shoalLife.birthPlacements[0].position = null; }]) {
    const bad = clone(f.region); if (!bad.agents[0].lastShoalIntake) { for (const a of bad.agents) a.nextBite = 0; const temporary = { ...f, region: bad }; step(temporary, { network: false }); }
    mutate(bad); assert.equal(validateOceanShoalLifeRecord(bad, f.generator, f), false);
  }
  const g = createLivingShallowsGenerator(livingShallowsSeed('42')), seen = new Set(), owners = [];
  for (let z = 14; z <= 22; z++) for (let x = 186; x <= 196; x++) { const chunk = g.chunk(x, z), r = fixture().region;
    r.id = `${x},${z}`; r.cx = x; r.cz = z; r.basicNetwork = undefined; initializeLivingNetwork(r, chunk);
    const role = oceanShoalLifeRole(r, g); if (!role) continue;
    assert.equal(initializeOceanShoalLife(r, g, { fresh: true, role }), true); assert.ok(validateOceanShoalLifeRecord(r, g));
    if (r.shoalLife.addedIds.length) { owners.push(r.id); for (const a of r.agents) { seen.add(a.speciesId); assert.ok(oceanShoalLifePositionValid(r, g, a)); } } balanced(r);
  }
  assert.ok(owners.length > 3); assert.deepEqual(seen, new Set(OCEAN_SHOAL_LIFE_IDS));
});
