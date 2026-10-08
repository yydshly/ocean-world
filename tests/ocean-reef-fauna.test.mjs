import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS, REEF_LIFE_NEW_IDS, REEF_FAUNA_NEW_IDS } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
import { oceanReefFaunaSpeciesById } from '../src/oceanReefFaunaSpecies.js';
import { initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance, tickLivingNetwork } from '../src/livingEcologyNetwork.js';

const clone = v => structuredClone(v), gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture({ seed = 'residents-1', count = 0, turtles = 0, prey = .05, reef = true } = {}) {
  const cx = 204, cz = 4, x0 = cx * 64, z0 = cz * 64;
  const chunk = { id: `${cx},${cz}`, cx, cz, origin: { x: x0, z: z0 }, size: 64,
    bounds: { minX: x0, maxX: x0 + 64, minZ: z0, maxZ: z0 + 64 }, elements: [] };
  if (reef) chunk.elements.push({ id: 'resident-rock', kind: 'rock', profile: 'terrace', x: x0 + 32, y: 0, z: z0 + 32,
    scale: { x: 18, y: 1, z: 16 }, rotation: .2 });
  chunk.ridgePlan = { version: 8, theme: 'reef-valley-region', id: chunk.id, cx, cz, seed,
    group: { id: 'reef-valley-region:204,4', cx, cz, seed,
      ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${cx + dx},${cz + dz}`)),
      routePath: [{ x: x0 + 2, y: 2, z: z0 + 26 }, { x: x0 + 62, y: 2, z: z0 + 26 }] } };
  const bed = () => 0, surface = (x, z) => chunk.elements.reduce((h, e) => e.kind === 'rock' ? Math.max(h, oceanRockHeight(e, x, z) ?? -Infinity) : h, 0);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY: 0, depthM: 8, substrate: surface(x, z) > .06 ? 'rock' : 'sand' }) };
  const region = { id: chunk.id, cx, cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    resources: { algae: .4, plankton: .5, detritus: .3 }, ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 },
    counters: { feeding: 0, deaths: 0 }, reefGuildVersion: 1, reefGuild: { preyOrganicUnits: prey,
      counters: { proxyFeedings: 0, proxyConsumedUnits: 0, filterFeedings: 0, filterConsumedUnits: 0, preySupportedUnits: 0 } } };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: region.id, speciesId: 'green-chromis', alive: i % 2 === 0,
    energy: .5, sizeM: .075, position: { x: x0 + 60, y: 2, z: z0 + 60 }, timeSec: 0 });
  initializeLivingNetwork(region, chunk);
  for (let i = 0; i < turtles; i++) region.turtleAgents.push({ id: `turtle:${i}`, alive: i % 2 === 0 });
  return { generator, chunk, region, surface, bed, x0, z0 };
}
const options = f => ({ surface: f.surface, bed: f.bed });
function initialized(layout = {}) {
  const f = fixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f));
  return f;
}
const balanced = r => { assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-9); };
function step(f, { lightAtDepth = .8, network = false, extra = false } = {}) {
  f.region.ticks++; f.region.timeSec = f.region.ticks * .1;
  if (network) tickLivingNetwork(f.region, { lightAtDepth, foodSupply: 0, currentMps: 0 }, .1);
  if (extra) tickReefGuildPool(f.region, .1, { extraConsumers: reefResidentConsumerCount(f.region) });
  for (const a of f.region.agents.filter(isReefResidentAgent)) if (a.alive)
    assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, { ...options(f), environment: { lightAtDepth } }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
}

function diversityFixture({ ownerIndex = 0, coral = true, ...layout } = {}) {
  const f = fixture(layout), dx = ownerIndex % 6, dz = Math.floor(ownerIndex / 6), sx = dx * 64, sz = dz * 64;
  for (const e of f.chunk.elements) { e.x += sx; e.z += sz; }
  for (const a of f.region.agents) { a.position.x += sx; a.position.z += sz; }
  f.x0 += sx; f.z0 += sz; f.chunk.cx += dx; f.chunk.cz += dz;
  f.chunk.id = `${f.chunk.cx},${f.chunk.cz}`; f.chunk.origin = { x: f.x0, z: f.z0 };
  f.chunk.bounds = { minX: f.x0, maxX: f.x0 + 64, minZ: f.z0, maxZ: f.z0 + 64 };
  Object.assign(f.region, { id: f.chunk.id, cx: f.chunk.cx, cz: f.chunk.cz });
  Object.assign(f.chunk.ridgePlan, { id: f.chunk.id, cx: f.chunk.cx, cz: f.chunk.cz });
  if (coral && f.chunk.elements.length) for (let i = 0; i < 8; i++) {
    const h = i * Math.PI / 4, x = f.x0 + 32 + Math.cos(h) * 5.5, z = f.z0 + 32 + Math.sin(h) * 5.5;
    f.chunk.elements.push({ id: `actual-coral:${i}`, kind: 'coral', x, y: f.surface(x, z), z, scale: { x: .2, y: .4, z: .2 } });
  }
  const rockSurface = f.surface;
  f.surface = (x, z, crown = false) => f.chunk.elements.reduce((height, e) => crown && e.kind === 'coral' &&
    Math.hypot(x - e.x, z - e.z) < Math.max(e.scale.x, e.scale.z) * .55 ? Math.max(height, e.y + e.scale.y) : height, rockSurface(x, z));
  // This is a new test fixture's initial boundary, initialized from its actual
  // coral descriptors before either resident birth recipe runs.
  delete f.region.basicNetwork; initializeLivingNetwork(f.region, f.chunk);
  return f;
}
function diverse(layout = {}) {
  const f = diversityFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 2 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f), f.region.id); balanced(f.region);
  return f;
}
const diversityInventory = Array.from({ length: 12 }, (_, ownerIndex) => diverse({ ownerIndex, seed: '49' }));
const savedInventory = () => diversityInventory.map(f => ({ ...f, region: clone(f.region) }));
const newAgent = (fs, id) => fs.map(f => ({ f, a: f.region.agents.find(a => a.speciesId === id) })).find(row => row.a);

function community(layout = {}) {
  const f = diversityFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 3 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region); return f;
}
const communityInventory = Array.from({ length: 12 }, (_, ownerIndex) => community({ ownerIndex, seed: '50' }));
const savedCommunity = () => communityInventory.map(f => ({ ...f, region: clone(f.region) }));

function reefLife(layout = {}) {
  const f = diversityFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 4 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region); return f;
}
const lifeInventory = Array.from({ length: 12 }, (_, ownerIndex) => reefLife({ ownerIndex, seed: '51' }));
const savedLife = () => lifeInventory.map(f => ({ ...f, region: clone(f.region) }));

function faunaFixture(layout = {}) {
  const f = diversityFixture(layout);
  // A physically deeper unit fixture: retain actual terrain/support and set
  // its initial water boundary before any birth. Adult wrasse requires 10 m.
  f.generator.surfaceY = 13;
  const sample = f.generator.sample; f.generator.sample = (x, z) => ({ ...sample(x, z), depthM: 13 });
  return f;
}
function reefFauna(layout = {}) {
  const f = faunaFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 5 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f), f.region.id); balanced(f.region); return f;
}
const faunaInventory = Array.from({ length: 12 }, (_, ownerIndex) => reefFauna({ ownerIndex, seed: '52' }));
const savedFauna = () => faunaInventory.map(f => ({ ...f, region: clone(f.region) }));

test('v5 fresh palette reserves natural room while preserving original records and exact retained v4 births', () => {
  const seen = new Set();
  for (let ownerIndex = 0; ownerIndex < 12; ownerIndex++) {
    const f = faunaInventory[ownerIndex], prior = faunaFixture({ ownerIndex, seed: '52' }), full = faunaFixture({ ownerIndex, seed: '52' });
    assert.equal(initializeReefResidents(prior.region, prior.generator, { ...options(prior), fresh: true, version: 4, capacity: 18 }), true);
    assert.equal(initializeReefResidents(full.region, full.generator, { ...options(full), fresh: true, version: 4 }), true);
    assert.deepEqual(f.region.agents.filter(a => !REEF_FAUNA_NEW_IDS.includes(a.speciesId)), prior.region.agents);
    for (const a of prior.region.agents.filter(isReefResidentAgent)) assert.deepEqual(a, full.region.agents.find(old => old.id === a.id));
    assert.deepEqual(f.region.reefResidents.priorLifeAddedIds, prior.region.reefResidents.addedIds);
    for (const key of ['legacyAddedIds', 'candidateOrder', 'priorAddedIds', 'communityCandidateOrder', 'priorCommunityAddedIds', 'lifeCandidateOrder']) assert.deepEqual(f.region.reefResidents[key], prior.region.reefResidents[key]);
    assert.deepEqual(f.region.resources, prior.region.resources); assert.deepEqual(f.region.ledger, prior.region.ledger);
    assert.equal(f.region.reefGuild.preyOrganicUnits, prior.region.reefGuild.preyOrganicUnits);
    assert.equal(f.region.reefResidents.reservedFaunaSlots, 2); assert.equal(f.region.reefResidents.priorCapacityLimit, 18);
    assert.equal(f.region.reefResidents.faunaCandidateOrder[0], REEF_FAUNA_NEW_IDS[(ownerIndex % 6 + 3 * Math.floor(ownerIndex / 6)) % 6]);
    assert.ok(f.region.reefResidents.addedIds.length <= 10); assert.ok(f.region.agents.length + f.region.turtleAgents.length <= 20);
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 5)) seen.add(a.speciesId);
  }
  assert.deepEqual(seen, new Set(REEF_FAUNA_NEW_IDS));
  for (const layout of [{ count: 18, turtles: 2 }, { count: 20 }, { reef: false }]) {
    const initial = faunaFixture(layout), original = clone(initial.region.agents), turtles = clone(initial.region.turtleAgents);
    assert.equal(initializeReefResidents(initial.region, initial.generator, { ...options(initial), fresh: true, version: 5 }), true);
    assert.deepEqual(initial.region.agents, original); assert.deepEqual(initial.region.turtleAgents, turtles);
    assert.equal(initial.region.reefResidents.addedIds.length, 0); assert.ok(validateReefResidentsRecord(initial.region, initial.generator, initial));
  }
  // Invalid soft/hard substrates and inadequate adult depth leave reserved
  // slots empty; the prior recipe is never rerun to backfill failed new births.
  const failed = faunaFixture({ count: 18 }); failed.generator.surfaceY = 2;
  failed.generator.sample = () => ({ floorY: 0, depthM: 2, substrate: 'mud' });
  failed.chunk.elements = failed.chunk.elements.filter(e => e.kind !== 'rock'); failed.surface = () => 0;
  assert.equal(initializeReefResidents(failed.region, failed.generator, { ...options(failed), fresh: true, version: 5 }), true);
  assert.equal(failed.region.agents.length, 18); assert.equal(failed.region.reefResidents.reservedFaunaSlots, 2);
  assert.equal(failed.region.reefResidents.priorLifeAddedIds.length, 0); assert.ok(validateReefResidentsRecord(failed.region, failed.generator, failed));
});

test('whole bodies, eight true crab walking feet and six continuous sole samples require real support', () => {
  const fs = savedFauna();
  for (const id of REEF_FAUNA_NEW_IDS) {
    const row = newAgent(fs, id); assert.ok(row, id); const { f, a } = row, s = oceanReefFaunaSpeciesById[id];
    assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f));
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, pitch: s.support.pitchLimitRad + .001 }), false);
    const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
    const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)); forward.addScaledVector(up, -forward.dot(up)).normalize();
    const side = new Vector3().crossVectors(forward, up).normalize();
    const contacts = s.support.footContacts.length ? s.support.footContacts : [{ x: s.normalizedEnvelope.x[1], z: s.normalizedEnvelope.z[1] }];
    if (id === 'shame-faced-crab') assert.equal(contacts.length, 8);
    if (['wedge-sea-hare', 'varicose-phyllidia'].includes(id)) assert.equal(contacts.length, 6);
    for (const contact of contacts) {
      const p = new Vector3(a.position.x, a.position.y, a.position.z).addScaledVector(forward, contact.x * a.sizeM).addScaledVector(side, contact.z * a.sizeM);
      const obstruction = (x, z, crown) => f.surface(x, z, crown) + (Math.hypot(x - p.x, z - p.z) < .0005 ? 3 : 0);
      assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false, id);
    }
    const body = s.normalizedEnvelope;
    if (!s.support.footContacts.length) for (const y of body.y) assert.ok(f.generator.surfaceY - a.position.y - y * a.sizeM >= s.depthSelectionM[0]);
  }
  for (const id of ['shame-faced-crab', 'wedge-sea-hare']) {
    const { f, a } = newAgent(fs, id), hard = { ...f.generator, sample: (x, z) => ({ ...f.generator.sample(x, z), substrate: 'rock' }) };
    assert.equal(reefResidentPositionValid(f.region, hard, a, a.position, f), false);
  }
  const { f, a } = newAgent(fs, 'varicose-phyllidia');
  const noRock = { ...f.generator, chunk: () => ({ ...f.chunk, elements: f.chunk.elements.filter(e => e.kind !== 'rock') }) };
  assert.equal(reefResidentPositionValid(f.region, noRock, a, a.position, f), false);
});

test('finite real ticks move and debit each new kind with complete swept steps inside its speed', () => {
  const pools = new Set(), moved = new Set(), fed = new Set();
  const speeds = { 'humphead-wrasse': .18, 'bluespine-unicornfish': .12, 'clown-triggerfish': .10,
    'shame-faced-crab': .005, 'wedge-sea-hare': .003, 'varicose-phyllidia': .002 };
  for (const f of savedFauna()) {
    const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
    for (let i = 0; i < 31; i++) {
      const before = new Map(f.region.agents.map(a => [a.id, clone(a.position)])); step(f);
      for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 5)) assert.ok(gap(a.position, before.get(a.id)) <= speeds[a.speciesId] * .1 + 1e-10, a.speciesId);
    }
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 5)) {
      if (gap(a.position, starts.get(a.id)) > 1e-8) moved.add(a.speciesId);
      if (a.lastResidentIntake) { const e = a.lastResidentIntake; fed.add(a.speciesId); pools.add(e.pool);
        assert.equal(e.pool, oceanReefFaunaSpeciesById[a.speciesId].foodPool); assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12); }
    }
    assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
  }
  assert.deepEqual(moved, new Set(REEF_FAUNA_NEW_IDS)); assert.deepEqual(fed, new Set(REEF_FAUNA_NEW_IDS));
  assert.deepEqual(pools, new Set(['reefGuild.preyOrganicUnits', 'resources.algae']));
});

test('old four epochs, v5 death and zero clocks retain historical records without refill', () => {
  for (const f of [initialized(), diverse(), community(), reefLife()]) {
    const prior = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 5 }), false); assert.deepEqual(f.region, prior);
  }
  const f = savedFauna().find(f => f.region.agents.some(a => a.reefResidentIndividualVersion === 5));
  const twin = reefFauna({ ownerIndex: (f.region.cz - 4) * 6 + f.region.cx - 204, seed: '52' }); assert.deepEqual(f.region, twin.region);
  const zero = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false); assert.deepEqual(f.region, zero);
  const a = f.region.agents.find(a => a.reefResidentIndividualVersion === 5); a.energy = 0; step(f);
  const corpse = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, corpse);
  const saved = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 5 }), false); assert.deepEqual(f.region, saved);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('empty typed stocks never create food, ingestion or additional admission', () => {
  for (const f of savedFauna()) {
    const r = f.region, food = r.resources.algae + r.resources.plankton + r.resources.detritus;
    const removed = food + r.reefGuild.preyOrganicUnits + r.basicNetwork.coralOrganicUnits;
    r.resources.algae = 0; r.resources.plankton = 0; r.resources.detritus = 0; r.ledger.exported += food;
    r.reefGuild.preyOrganicUnits = 0; r.basicNetwork.coralOrganicUnits = 0;
    r.basicNetwork.ledger.output += removed; r.basicNetwork.processTotals.systemOutput += removed;
    balanced(r); const input = r.basicNetwork.ledger.externalInput;
    for (let i = 0; i < 31; i++) step(f);
    assert.equal(r.reefResidents.counters.feedings, 0); assert.ok(r.agents.every(a => a.lastResidentIntake === null));
    assert.equal(r.basicNetwork.ledger.externalInput, input); balanced(r);
  }
});

test('ten-limit prey support uses actual consumers and preserves every prior explicit limit', () => {
  const f = savedFauna().sort((a, b) => reefResidentPreyConsumerCount(b.region) - reefResidentPreyConsumerCount(a.region))[0]; assert.ok(reefResidentPreyConsumerCount(f.region) > 0);
  for (const row of savedFauna()) assert.equal(reefResidentPreyConsumerCount(row.region), row.region.agents.filter(a => a.alive && a.reefResidentFoodPool === 'reefGuild.preyOrganicUnits').length);
  const r = f.region, removed = r.reefGuild.preyOrganicUnits; r.reefGuild.preyOrganicUnits = 0;
  r.basicNetwork.ledger.output += removed; r.basicNetwork.processTotals.systemOutput += removed;
  // The pool's standalone numerical boundary is tested with an over-limit
  // request, without adding fake animals; actual membership is checked above.
  const input = r.basicNetwork.ledger.externalInput, count = 12;
  for (const limit of [2, 4, 6, 8, 10]) {
    const copy = clone(r); tickReefGuildPool(copy, .1, { extraConsumers: count, maxExtraConsumers: limit });
    assert.equal(copy.reefGuild.preyOrganicUnits, Math.min(count, limit) * .000025 * .1);
    assert.equal(copy.basicNetwork.ledger.externalInput, input); balanced(copy);
  }
  const defaultPool = clone(r), twoPool = clone(r); tickReefGuildPool(defaultPool, .1, { extraConsumers: count }); tickReefGuildPool(twoPool, .1, { extraConsumers: count, maxExtraConsumers: 2 });
  assert.deepEqual(defaultPool, twoPool);
});

test('restoration rejects forged reservation, prior identities, epochs, typed pool routes and support', () => {
  const f = savedFauna().find(f => f.region.agents.some(a => a.reefResidentIndividualVersion === 5)); for (let i = 0; i < 31; i++) step(f);
  const first = r => r.agents.find(a => a.reefResidentIndividualVersion === 5);
  const bad = [r => { r.reefResidentsVersion = 4; }, r => { r.reefResidents.version = 4; }, r => { r.reefResidents.recipe = 'reef-residents-v4'; },
    r => { r.reefResidents.priorLifeAddedIds.pop(); }, r => { r.reefResidents.priorCommunityAddedIds.pop(); }, r => { r.reefResidents.priorAddedIds.pop(); }, r => { r.reefResidents.faunaCandidateOrder.reverse(); },
    r => { r.reefResidents.reservedFaunaSlots = 3; }, r => { r.reefResidents.priorCapacityLimit++; },
    r => { r.reefResidents.unknown = 1; }, r => { first(r).reefResidentIndividualVersion = 4; }, r => { first(r).reefResidentFoodPool = 'resources.plankton'; },
    r => { first(r).timeSec -= .1; }, r => { first(r).lastResidentIntake.stockBefore += .01; }, r => { first(r).supportNormal.y -= .01; },
    r => { r.reefResidents.birthPlacements.at(-1).position.x += .001; }, r => { r.agents.push({ speciesId: 'humphead-wrasse', reefResidentIndividualVersion: 5 }); }];
  for (const corrupt of bad) { const row = clone(f.region); corrupt(row); assert.equal(validateReefResidentsRecord(row, f.generator, f), false); }
});

test('complete prior v1–4 day/night records remain byte-frozen after the fresh v5 palette', () => {
  const v1 = [], v2 = [], v3 = [], v4 = [];
  for (const f of savedLife()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v4.push(f.region); }
  for (const f of savedCommunity()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v3.push(f.region); }
  for (const f of savedInventory()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v2.push(f.region); }
  for (const layout of [{ seed: 'residents-0' }, { seed: 'residents-1' }, { seed: 'residents-2' }, { count: 18, turtles: 1 }, { reef: false }, { count: 20 }]) {
    const f = initialized(layout); for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v1.push(f.region);
  }
  assert.equal(hash(v1), '55c891dcf4aed4973549c7efeabbe6034ff11fef88a316785b813a7b40377ee3');
  assert.equal(hash(v2), '54ae776cffcbc4bad511189a65ac33b93a3aba21d845d096f19aaf465a530b3f');
  assert.equal(hash(v3), '379ed4a0285a75f0fc63bfadb0fdd48d32de919de3eb864372679acfb92991f3');
  assert.equal(hash(v4), 'e06d34f2d1605074837c8fa7ddf7a9a9e6cb655304c08c3b1c40fde8bd6e34ae');
});
