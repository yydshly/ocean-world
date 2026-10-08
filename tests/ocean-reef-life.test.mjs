import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS, REEF_LIFE_NEW_IDS } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
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

test('v4 preserves all v3 births before six genuinely new kinds use remaining slots in staggered owner order', () => {
  const seen = new Set();
  for (let ownerIndex = 0; ownerIndex < 12; ownerIndex++) {
    const f = lifeInventory[ownerIndex], prior = community({ ownerIndex, seed: '51' });
    assert.deepEqual(f.region.agents.filter(a => !REEF_LIFE_NEW_IDS.includes(a.speciesId)), prior.region.agents);
    assert.deepEqual(f.region.reefResidents.priorCommunityAddedIds, prior.region.reefResidents.addedIds);
    for (const key of ['legacyAddedIds', 'candidateOrder', 'priorAddedIds', 'communityCandidateOrder']) assert.deepEqual(f.region.reefResidents[key], prior.region.reefResidents[key]);
    assert.deepEqual(f.region.resources, prior.region.resources); assert.deepEqual(f.region.ledger, prior.region.ledger);
    assert.equal(f.region.reefGuild.preyOrganicUnits, prior.region.reefGuild.preyOrganicUnits);
    assert.equal(f.region.reefResidents.lifeCandidateOrder[0], REEF_LIFE_NEW_IDS[(ownerIndex % 6 + 3 * Math.floor(ownerIndex / 6)) % 6]);
    assert.ok(f.region.reefResidents.addedIds.length <= 8); assert.ok(f.region.agents.length + f.region.turtleAgents.length <= 20);
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 4)) seen.add(a.speciesId);
  }
  assert.deepEqual(seen, new Set(REEF_LIFE_NEW_IDS));
  const single = reefLife({ count: 18, turtles: 1 }); assert.equal(single.region.reefResidents.addedIds.length, 1);
  const full = reefLife({ count: 18, turtles: 2 }); assert.equal(full.region.reefResidents.addedIds.length, 0);
  const absent = reefLife({ reef: false }); assert.equal(absent.region.reefResidents.addedIds.length, 0);
});

test('v4 whole-body envelope and true four walking contacts or ten tube tips reject intrusions', () => {
  const fs = savedLife();
  for (const id of REEF_LIFE_NEW_IDS) {
    const row = newAgent(fs, id); assert.ok(row, id); const { f, a } = row, s = oceanReefLifeSpeciesById[id];
    assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f));
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, pitch: s.support.pitchLimitRad + .001 }), false);
    const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
    const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)); forward.addScaledVector(up, -forward.dot(up)).normalize();
    const side = new Vector3().crossVectors(forward, up).normalize();
    const contacts = s.support.footContacts.length ? s.support.footContacts : [{ x: s.normalizedEnvelope.x[1], z: s.normalizedEnvelope.z[1] }];
    if (id === 'banded-coral-shrimp') assert.equal(contacts.length, 4);
    if (id === 'chocolate-chip-sea-star') assert.equal(contacts.length, 10);
    for (const contact of contacts) {
      const p = new Vector3(a.position.x, a.position.y, a.position.z).addScaledVector(forward, contact.x * a.sizeM).addScaledVector(side, contact.z * a.sizeM);
      const obstruction = (x, z, crown) => f.surface(x, z, crown) + (Math.hypot(x - p.x, z - p.z) < .0005 ? 3 : 0);
      assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false, id);
    }
  }
  const { f, a } = newAgent(fs, 'chocolate-chip-sea-star');
  const hard = { ...f.generator, sample: (x, z) => ({ ...f.generator.sample(x, z), substrate: 'rock' }) };
  assert.equal(reefResidentPositionValid(f.region, hard, a, a.position, f), false);
});

test('finite ticks move all six new kinds, conserve typed food and keep every actual step within its speed', () => {
  const pools = new Set(), moved = new Set(), fed = new Set();
  const speeds = { 'copperband-butterflyfish': .08, 'longnose-butterflyfish': .08, 'fire-goby': .055,
    'pajama-cardinalfish': .045, 'banded-coral-shrimp': .004, 'chocolate-chip-sea-star': .002 };
  for (const f of savedLife()) {
    const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
    for (let i = 0; i < 31; i++) {
      const before = new Map(f.region.agents.map(a => [a.id, clone(a.position)])); step(f);
      for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 4)) assert.ok(gap(a.position, before.get(a.id)) <= speeds[a.speciesId] * .1 + 1e-10, a.speciesId);
    }
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 4)) {
      if (gap(a.position, starts.get(a.id)) > 1e-8) moved.add(a.speciesId);
      if (a.lastResidentIntake) { const e = a.lastResidentIntake; fed.add(a.speciesId); pools.add(e.pool);
        assert.equal(e.pool, oceanReefLifeSpeciesById[a.speciesId].foodPool); assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12); }
    }
    assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
  }
  assert.deepEqual(moved, new Set(REEF_LIFE_NEW_IDS)); assert.deepEqual(fed, new Set(REEF_LIFE_NEW_IDS));
  assert.deepEqual(pools, new Set(['reefGuild.preyOrganicUnits', 'resources.plankton', 'resources.detritus']));
});

test('old three epochs, v4 deaths and zero clocks never refill or change historical individuals', () => {
  for (const f of [initialized(), diverse(), community()]) {
    const prior = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 4 }), false); assert.deepEqual(f.region, prior);
  }
  const f = reefLife({ seed: '51' }), twin = reefLife({ seed: '51' }); assert.deepEqual(f.region, twin.region);
  const zero = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false); assert.deepEqual(f.region, zero);
  const a = f.region.agents.find(a => a.reefResidentIndividualVersion === 4); assert.ok(a); a.energy = 0; step(f);
  const corpse = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, corpse);
  const saved = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 4 }), false); assert.deepEqual(f.region, saved);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('empty existing stocks yield no intake, replacement food or further organic admission', () => {
  for (const f of savedLife()) {
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

test('eight-limit prey support counts actual users and preserves all original transfer limits', () => {
  const f = savedLife().find(f => reefResidentPreyConsumerCount(f.region) > 6); assert.ok(f);
  for (const row of savedLife()) assert.equal(reefResidentPreyConsumerCount(row.region), row.region.agents.filter(a => a.alive && a.reefResidentFoodPool === 'reefGuild.preyOrganicUnits').length);
  const r = f.region, removed = r.reefGuild.preyOrganicUnits; r.reefGuild.preyOrganicUnits = 0;
  r.basicNetwork.ledger.output += removed; r.basicNetwork.processTotals.systemOutput += removed;
  const input = r.basicNetwork.ledger.externalInput, count = reefResidentPreyConsumerCount(r);
  for (const limit of [2, 4, 6, 8]) {
    const copy = clone(r); tickReefGuildPool(copy, .1, { extraConsumers: count, maxExtraConsumers: limit });
    assert.equal(copy.reefGuild.preyOrganicUnits, Math.min(count, limit) * .000025 * .1);
    assert.equal(copy.basicNetwork.ledger.externalInput, input); balanced(copy);
  }
});

test('v4 restoration rejects mixed epochs, forged prior identities, pool routes, body support and clocks', () => {
  const f = reefLife({ seed: '51' }); for (let i = 0; i < 31; i++) step(f);
  const first = r => r.agents.find(a => a.reefResidentIndividualVersion === 4);
  const bad = [r => { r.reefResidentsVersion = 3; }, r => { r.reefResidents.version = 3; }, r => { r.reefResidents.recipe = 'reef-residents-v3'; },
    r => { r.reefResidents.priorCommunityAddedIds.pop(); }, r => { r.reefResidents.priorAddedIds.pop(); }, r => { r.reefResidents.lifeCandidateOrder.reverse(); },
    r => { r.reefResidents.unknown = 1; }, r => { first(r).reefResidentIndividualVersion = 3; }, r => { first(r).reefResidentFoodPool = 'resources.algae'; },
    r => { first(r).timeSec -= .1; }, r => { first(r).lastResidentIntake.stockBefore += .01; }, r => { first(r).supportNormal.y -= .01; },
    r => { r.reefResidents.birthPlacements.at(-1).position.x += .001; }, r => { r.agents.push({ speciesId: 'fire-goby', reefResidentIndividualVersion: 4 }); }];
  for (const corrupt of bad) { const row = clone(f.region); corrupt(row); assert.equal(validateReefResidentsRecord(row, f.generator, f), false); }
});

test('entire previous v1, v2 and v3 day/night records remain frozen after the v4 extension', () => {
  const v1 = [], v2 = [], v3 = [];
  for (const f of savedCommunity()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v3.push(f.region); }
  for (const f of savedInventory()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v2.push(f.region); }
  for (const layout of [{ seed: 'residents-0' }, { seed: 'residents-1' }, { seed: 'residents-2' }, { count: 18, turtles: 1 }, { reef: false }, { count: 20 }]) {
    const f = initialized(layout); for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v1.push(f.region);
  }
  assert.equal(hash(v1), '55c891dcf4aed4973549c7efeabbe6034ff11fef88a316785b813a7b40377ee3');
  assert.equal(hash(v2), '54ae776cffcbc4bad511189a65ac33b93a3aba21d845d096f19aaf465a530b3f');
  assert.equal(hash(v3), '379ed4a0285a75f0fc63bfadb0fdd48d32de919de3eb864372679acfb92991f3');
});
