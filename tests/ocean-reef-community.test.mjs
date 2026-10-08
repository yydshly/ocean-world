import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
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

test('v3 retains the complete v2 roster before six real owner-rotated new forms use natural spare slots', () => {
  const seen = new Set();
  for (let ownerIndex = 0; ownerIndex < 12; ownerIndex++) {
    const f = communityInventory[ownerIndex], old = diverse({ ownerIndex, seed: '50' });
    assert.deepEqual(f.region.agents.filter(a => !REEF_COMMUNITY_NEW_IDS.includes(a.speciesId)), old.region.agents);
    assert.deepEqual(f.region.reefResidents.priorAddedIds, old.region.reefResidents.addedIds);
    assert.deepEqual(f.region.reefResidents.legacyAddedIds, old.region.reefResidents.legacyAddedIds);
    assert.deepEqual(f.region.reefResidents.candidateOrder, old.region.reefResidents.candidateOrder);
    assert.deepEqual(f.region.resources, old.region.resources); assert.deepEqual(f.region.ledger, old.region.ledger);
    assert.equal(f.region.reefGuild.preyOrganicUnits, old.region.reefGuild.preyOrganicUnits);
    assert.equal(f.region.reefResidents.communityCandidateOrder[0], REEF_COMMUNITY_NEW_IDS[ownerIndex % 6]);
    assert.ok(f.region.reefResidents.addedIds.length <= 6); assert.ok(f.region.agents.length + f.region.turtleAgents.length <= 20);
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 3)) seen.add(a.speciesId);
  }
  assert.deepEqual(seen, new Set(REEF_COMMUNITY_NEW_IDS));
  const single = community({ count: 18, turtles: 1 }); assert.equal(single.region.reefResidents.addedIds.length, 1);
  const full = community({ count: 18, turtles: 2 }); assert.equal(full.region.reefResidents.addedIds.length, 0);
  const absent = community({ reef: false }); assert.equal(absent.region.reefResidents.addedIds.length, 0);
});

test('new whole fish forms and six true contact samples require complete support and clearances', () => {
  const fs = savedCommunity();
  for (const id of REEF_COMMUNITY_NEW_IDS) {
    const row = newAgent(fs, id); assert.ok(row, id); const { f, a } = row, s = oceanReefCommunitySpeciesById[id];
    assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f));
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, pitch: s.support.pitchLimitRad + .001 }), false);
    const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
    const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)); forward.addScaledVector(up, -forward.dot(up)).normalize();
    const side = new Vector3().crossVectors(forward, up).normalize();
    const contacts = s.support.footContacts.length ? s.support.footContacts : [{ x: s.normalizedEnvelope.x[1], z: s.normalizedEnvelope.z[1] }];
    if (s.support.footContacts.length) assert.equal(contacts.length, 6);
    for (const contact of contacts) {
      const p = new Vector3(a.position.x, a.position.y, a.position.z).addScaledVector(forward, contact.x * a.sizeM).addScaledVector(side, contact.z * a.sizeM);
      const obstruction = (x, z, crown) => f.surface(x, z, crown) + (Math.hypot(x - p.x, z - p.z) < .0005 ? 3 : 0);
      assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false, id);
    }
  }
  const { f, a } = newAgent(fs, 'green-turban-snail'), p = { ...a.position, y: .004 }, posed = { ...a, home: p };
  const sandy = { ...f.generator, sample: () => ({ depthM: 8, substrate: 'sand' }) };
  assert.equal(reefResidentPositionValid(f.region, sandy, posed, p, { surface: () => 0, bed: () => 0 }), false);
});

test('finite v3 ticks really move all six kinds and consume only their three selected existing food stocks', () => {
  const pools = new Set(), moved = new Set(), fed = new Set(), fs = savedCommunity();
  const speeds = { 'yellow-boxfish': .065, 'red-toothed-triggerfish': .12, 'longfin-batfish': .075,
    'valentini-puffer': .06, 'peacock-mantis-shrimp': .009, 'green-turban-snail': .0015 };
  for (const f of fs) {
    const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
    for (let i = 0; i < 31; i++) {
      const prior = new Map(f.region.agents.map(a => [a.id, clone(a.position)])); step(f);
      for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 3)) assert.ok(gap(a.position, prior.get(a.id)) <= speeds[a.speciesId] * .1 + 1e-10, a.speciesId);
    }
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 3)) {
      if (gap(a.position, starts.get(a.id)) > 1e-8) moved.add(a.speciesId);
      if (a.lastResidentIntake) {
        const e = a.lastResidentIntake; fed.add(a.speciesId); pools.add(e.pool);
        assert.equal(e.pool, oceanReefCommunitySpeciesById[a.speciesId].foodPool);
        assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12);
      }
    }
    assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
  }
  assert.deepEqual(moved, new Set(REEF_COMMUNITY_NEW_IDS)); assert.deepEqual(fed, new Set(REEF_COMMUNITY_NEW_IDS));
  assert.deepEqual(pools, new Set(['reefGuild.preyOrganicUnits', 'resources.plankton', 'resources.algae']));
});

test('historical v1 and v2, v3 deaths, zero clocks and empty records never regenerate individuals', () => {
  for (const f of [initialized(), diverse()]) {
    const prior = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 3 }), false); assert.deepEqual(f.region, prior);
  }
  const f = community({ seed: '50' }), duplicate = community({ seed: '50' }); assert.deepEqual(f.region, duplicate.region);
  const zero = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false); assert.deepEqual(f.region, zero);
  const a = f.region.agents.find(a => a.reefResidentIndividualVersion === 3); assert.ok(a); a.energy = 0; step(f);
  const corpse = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, corpse);
  const historical = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 3 }), false); assert.deepEqual(f.region, historical);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('empty pre-existing stocks provide no v3 intake, organic admission or replacement food', () => {
  for (const f of savedCommunity()) {
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

test('explicit six-consumer support transfers real detritus while old two and four limits remain exact', () => {
  const f = savedCommunity().find(f => reefResidentPreyConsumerCount(f.region) > 4); assert.ok(f);
  for (const row of savedCommunity()) assert.equal(reefResidentPreyConsumerCount(row.region), row.region.agents.filter(a => a.alive && a.reefResidentFoodPool === 'reefGuild.preyOrganicUnits').length);
  const r = f.region, removed = r.reefGuild.preyOrganicUnits; r.reefGuild.preyOrganicUnits = 0;
  r.basicNetwork.ledger.output += removed; r.basicNetwork.processTotals.systemOutput += removed;
  const old2 = clone(r), old4 = clone(r), input = r.basicNetwork.ledger.externalInput, count = reefResidentPreyConsumerCount(r);
  tickReefGuildPool(r, .1, { extraConsumers: count, maxExtraConsumers: 6 });
  tickReefGuildPool(old2, .1, { extraConsumers: count }); tickReefGuildPool(old4, .1, { extraConsumers: count, maxExtraConsumers: 4 });
  assert.equal(r.reefGuild.preyOrganicUnits, count * .000025 * .1); assert.equal(old2.reefGuild.preyOrganicUnits, .000005); assert.equal(old4.reefGuild.preyOrganicUnits, .00001);
  assert.equal(r.basicNetwork.ledger.externalInput, input); balanced(r); balanced(old2); balanced(old4);
});

test('full v3 cold validation rejects forged epoch, prior identity, rotation, food stock and support state', () => {
  const f = community({ seed: '50' }); for (let i = 0; i < 31; i++) step(f);
  const first = r => r.agents.find(a => a.reefResidentIndividualVersion === 3);
  const bad = [r => { r.reefResidentsVersion = 2; }, r => { r.reefResidents.version = 2; }, r => { r.reefResidents.recipe = 'reef-residents-v2'; },
    r => { r.reefResidents.priorAddedIds.pop(); }, r => { r.reefResidents.communityCandidateOrder.reverse(); }, r => { r.reefResidents.unknown = 1; },
    r => { first(r).reefResidentIndividualVersion = 2; }, r => { first(r).reefResidentFoodPool = 'resources.detritus'; },
    r => { first(r).timeSec -= .1; }, r => { first(r).lastResidentIntake.stockBefore += .01; }, r => { first(r).supportNormal.y -= .01; },
    r => { r.reefResidents.birthPlacements.at(-1).position.x += .001; }, r => { r.agents.push({ speciesId: 'yellow-boxfish', reefResidentIndividualVersion: 3 }); }];
  for (const corrupt of bad) { const row = clone(f.region); corrupt(row); assert.equal(validateReefResidentsRecord(row, f.generator, f), false); }
});

test('before-v3 complete v1 and v2 future records stay frozen across finite original day/night layouts', () => {
  const v1 = [], v2 = [];
  for (const f of savedInventory()) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v2.push(f.region); }
  for (const layout of [{ seed: 'residents-0' }, { seed: 'residents-1' }, { seed: 'residents-2' }, { count: 18, turtles: 1 }, { reef: false }, { count: 20 }]) {
    const f = initialized(layout); for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); v1.push(f.region);
  }
  assert.equal(hash(v1), '55c891dcf4aed4973549c7efeabbe6034ff11fef88a316785b813a7b40377ee3');
  assert.equal(hash(v2), '54ae776cffcbc4bad511189a65ac33b93a3aba21d845d096f19aaf465a530b3f');
});


