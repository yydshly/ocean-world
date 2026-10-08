import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS, REEF_COMMUNITY_NEW_IDS, REEF_LIFE_NEW_IDS, REEF_FAUNA_NEW_IDS, REEF_ASSEMBLAGE_NEW_IDS, REEF_ASSEMBLAGE_PALETTE_IDS, REEF_ASSEMBLAGE_FOOD_SCOPE, REEF_FAUNA_FOOD_SCOPE, REEF_HABITAT_COMMUNITY_IDS, REEF_HABITAT_COMMUNITY_SCOPE, REEF_HABITAT_COMMUNITY_FOOD_SCOPE } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
import { oceanReefCommunitySpeciesById } from '../src/oceanReefCommunitySpecies.js';
import { oceanReefLifeSpeciesById } from '../src/oceanReefLifeSpecies.js';
import { oceanReefFaunaSpeciesById } from '../src/oceanReefFaunaSpecies.js';
import { oceanReefAssemblageSpeciesById } from '../src/oceanReefAssemblageSpecies.js';
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

function reefAssemblage(layout = {}) {
  const f = faunaFixture(layout);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 6 }), true);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f), f.region.id); balanced(f.region); return f;
}
const assemblageInventory = Array.from({ length: 12 }, (_, ownerIndex) => reefAssemblage({ ownerIndex, seed: '54' }));
const savedAssemblage = () => assemblageInventory.map(f => ({ ...f, region: clone(f.region) }));

const allResidentSpeciesById = { ...oceanReefResidentsSpeciesById, ...oceanReefDiversitySpeciesById, ...oceanReefCommunitySpeciesById,
  ...oceanReefLifeSpeciesById, ...oceanReefFaunaSpeciesById, ...oceanReefAssemblageSpeciesById };
function freshCommunity({ depth = 13, ...layout } = {}) {
  const f = faunaFixture(layout), sample = f.generator.sample; f.generator.surfaceY = depth;
  f.generator.sample = (x, z) => ({ ...sample(x, z), depthM: depth });
  const originals = clone(f.region.agents), turtles = clone(f.region.turtleAgents);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 7 }), true);
  assert.deepEqual(f.region.agents.filter(a => !isReefResidentAgent(a)), originals); assert.deepEqual(f.region.turtleAgents, turtles);
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f), f.region.id); balanced(f.region); return f;
}
const community7Inventory = Array.from({ length: 12 }, (_, ownerIndex) => freshCommunity({ ownerIndex, seed: '55' }));
const savedCommunity7 = () => community7Inventory.map(f => ({ ...f, region: clone(f.region) }));

test('fresh habitat community shares all32 candidates directly within true spare slots without tier reservations', () => {
  assert.equal(REEF_HABITAT_COMMUNITY_IDS.length, 32); assert.equal(new Set(REEF_HABITAT_COMMUNITY_IDS).size, 32);
  const classes = new Set(), kinds = new Set();
  for (const f of savedCommunity7()) {
    const d = f.region.reefResidents, agents = f.region.agents.filter(isReefResidentAgent);
    assert.equal(d.version, 7); assert.equal(d.recipe, 'reef-residents-v7'); assert.equal(d.scope, REEF_HABITAT_COMMUNITY_SCOPE);
    assert.deepEqual(new Set(d.candidateOrder), new Set(REEF_HABITAT_COMMUNITY_IDS)); assert.equal(d.candidateOrder.length, 32);
    for (const field of ['legacyAddedIds', 'priorAddedIds', 'priorLifeAddedIds', 'priorCapacityLimit', 'reservedPaletteSlots', 'reservedFaunaSlots']) assert.equal(Object.hasOwn(d, field), false);
    assert.ok(agents.length <= 10); assert.ok(f.region.agents.length + f.region.turtleAgents.length <= 20);
    for (const a of agents) {
      assert.equal(a.reefResidentIndividualVersion, 7); assert.ok(a.id.includes(':reef-residents-v7:')); assert.equal(a.dietProxy, REEF_HABITAT_COMMUNITY_FOOD_SCOPE);
      assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f)); kinds.add(allResidentSpeciesById[a.speciesId].kind);
      classes.add(a.reefResidentMode); assert.equal(a.reefResidentFoodPool, allResidentSpeciesById[a.speciesId].foodPool ?? 'reefGuild.preyOrganicUnits');
    }
  }
  assert.deepEqual(classes, new Set(['reef-water', 'reef-foot'])); assert.ok(kinds.has('fish') && kinds.has('mollusc') && kinds.has('echinoderm'));
  const sparse = freshCommunity({ count: 18, turtles: 1 }); assert.ok(sparse.region.reefResidents.addedIds.length <= 1);
  const full = freshCommunity({ count: 18, turtles: 2 }); assert.equal(full.region.reefResidents.addedIds.length, 0);
  const missing = freshCommunity({ reef: false }); assert.equal(missing.region.reefResidents.addedIds.length, 0);
});

test('habitat evidence uses actual supports and depths, ignores moving occupancy, and leaves unusable habitats empty', () => {
  const f = freshCommunity({ count: 1 }), d = f.region.reefResidents;
  assert.ok(d.habitatEvidence.softCenters > 0); assert.ok(d.habitatEvidence.hardCenters > 0);
  assert.ok(d.habitatEvidence.marginCenters >= d.habitatEvidence.softCenters);
  assert.equal(Object.values(d.habitatEvidence.habitats).reduce((a, b) => a + b, 0), d.habitatEvidence.sampledCenters);
  const before = clone(d.habitatEvidence), order = clone(d.candidateOrder), original = f.region.agents.find(a => !isReefResidentAgent(a));
  original.position.x -= 1; assert.ok(validateReefResidentsRecord(f.region, f.generator, f));
  for (let i = 0; i < 5; i++) step(f); assert.deepEqual(d.habitatEvidence, before); assert.deepEqual(d.candidateOrder, order);
  const deep = freshCommunity({ depth: 23 }); assert.equal(deep.region.reefResidents.addedIds.length, 0);
  assert.ok(deep.region.reefResidents.habitatEvidence.depthRangeM[0] > 18);
  const flat = faunaFixture(); flat.chunk.elements = flat.chunk.elements.filter(e => e.kind !== 'rock'); flat.surface = () => 0;
  flat.generator.sample = () => ({ substrate: 'mud', habitat: 'sand', floorY: 0, depthM: 13 });
  assert.equal(initializeReefResidents(flat.region, flat.generator, { ...options(flat), fresh: true, version: 7 }), true);
  assert.equal(flat.region.reefResidents.habitatEvidence.softCenters, 0); assert.equal(flat.region.reefResidents.habitatEvidence.hardCenters, 0);
  assert.ok(flat.region.agents.filter(a => a.reefResidentMode === 'reef-foot').every(a => a.speciesId === 'painted-spiny-lobster'));
});

test('whole forms and actual contacts remain strict including only the real four-contact shrimp exception', () => {
  const fs = savedCommunity7();
  const tested = new Set();
  for (const f of fs) for (const a of f.region.agents.filter(isReefResidentAgent)) {
    if (tested.has(a.speciesId)) continue; tested.add(a.speciesId); const s = allResidentSpeciesById[a.speciesId];
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, pitch: s.support.pitchLimitRad + .001 }), false);
    const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
    const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)); forward.addScaledVector(up, -forward.dot(up)).normalize();
    const side = new Vector3().crossVectors(forward, up).normalize();
    const contacts = s.support.footContacts.length ? s.support.footContacts : [{ x: s.normalizedEnvelope.x[1], z: s.normalizedEnvelope.z[1] }];
    if (a.speciesId === 'banded-coral-shrimp') assert.equal(contacts.length, 4);
    for (const contact of contacts) {
      const p = new Vector3(a.position.x, a.position.y, a.position.z).addScaledVector(forward, contact.x * a.sizeM).addScaledVector(side, contact.z * a.sizeM);
      const obstruction = (x, z, crown) => f.surface(x, z, crown) + (Math.hypot(x - p.x, z - p.z) < .0005 ? 3 : 0);
      assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false, a.speciesId);
    }
  }
  assert.ok(tested.has('banded-coral-shrimp')); assert.ok(tested.has('collector-urchin'));
  const row = newAgent(fs, 'collector-urchin'); assert.ok(row);
  const noRock = { ...row.f.generator, chunk: () => ({ ...row.f.chunk, elements: row.f.chunk.elements.filter(e => e.kind !== 'rock') }) };
  assert.equal(reefResidentPositionValid(row.f.region, noRock, row.a, row.a.position, row.f), false);
});

test('finite day/night steps preserve actual movement limits, species food routes and both existing ledgers', () => {
  const pools = new Set(), moved = new Set(), fed = new Set();
  const speeds = { 'coral-trout': .14, 'painted-spiny-lobster': .015, lionfish: .075, 'chinese-trumpetfish': .11, 'moorish-idol': .10,
    'sailfin-tang': .10, 'cushion-sea-star': .002, 'leopard-sea-cucumber': .003, 'yellow-boxfish': .065, 'red-toothed-triggerfish': .12,
    'longfin-batfish': .075, 'valentini-puffer': .06, 'peacock-mantis-shrimp': .009, 'green-turban-snail': .0015,
    'copperband-butterflyfish': .08, 'longnose-butterflyfish': .08, 'fire-goby': .055, 'pajama-cardinalfish': .045,
    'banded-coral-shrimp': .004, 'chocolate-chip-sea-star': .002, 'humphead-wrasse': .18, 'bluespine-unicornfish': .12,
    'clown-triggerfish': .10, 'shame-faced-crab': .005, 'wedge-sea-hare': .003, 'varicose-phyllidia': .002,
    'giant-moray': .10, 'banded-pipefish': .04, 'spot-fin-porcupinefish': .08, 'peacock-flounder': .01, 'textile-cone': .002, 'collector-urchin': .002 };
  for (const f of savedCommunity7()) {
    const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
    for (let i = 0; i < 32; i++) {
      const before = new Map(f.region.agents.map(a => [a.id, clone(a.position)])); step(f, { lightAtDepth: i < 16 ? .8 : .01 });
      for (const a of f.region.agents.filter(isReefResidentAgent)) assert.ok(gap(a.position, before.get(a.id)) <= speeds[a.speciesId] * .1 + 1e-10, a.speciesId);
    }
    for (const a of f.region.agents.filter(isReefResidentAgent)) {
      if (gap(a.position, starts.get(a.id)) > 1e-8) moved.add(a.speciesId);
      if (a.lastResidentIntake) { const e = a.lastResidentIntake; fed.add(a.speciesId); pools.add(e.pool);
        assert.equal(e.pool, allResidentSpeciesById[a.speciesId].foodPool ?? 'reefGuild.preyOrganicUnits');
        assert.equal(e.scope, REEF_HABITAT_COMMUNITY_FOOD_SCOPE); assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12); }
    }
    assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
    assert.equal(reefResidentPreyConsumerCount(f.region), f.region.agents.filter(a => a.alive && a.reefResidentFoodPool === 'reefGuild.preyOrganicUnits').length);
  }
  assert.ok(moved.size > 15); assert.ok(fed.size > 15);
  assert.deepEqual(pools, new Set(['reefGuild.preyOrganicUnits', 'resources.algae', 'resources.plankton', 'resources.detritus', 'basicNetwork.coralOrganicUnits']));
});

test('historical1–6, fresh deaths and pause never migrate, refill or rewrite actual records', () => {
  for (const f of [initialized(), diverse(), community(), reefLife(), reefFauna(), reefAssemblage()]) {
    const prior = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 7 }), false); assert.deepEqual(f.region, prior);
  }
  const f = savedCommunity7()[0], before = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false); assert.deepEqual(f.region, before);
  const a = f.region.agents[0]; a.energy = 0; step(f); const corpse = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, corpse);
  const historical = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 7 }), false); assert.deepEqual(f.region, historical);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('empty actual stocks create no food, ingestion or additional organic admission in the habitat community', () => {
  for (const f of savedCommunity7()) {
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

test('cold restoration rejects forged geometry evidence, tier claims, identity salt, typed food and physical support', () => {
  const f = savedCommunity7()[0]; for (let i = 0; i < 31; i++) step(f);
  const first = r => r.agents.find(a => a.lastResidentIntake);
  const bad = [r => { r.reefResidentsVersion = 6; }, r => { r.reefResidents.version = 6; }, r => { r.reefResidents.recipe = 'reef-residents-v6'; },
    r => { r.reefResidents.candidateOrder.reverse(); }, r => { r.reefResidents.habitatEvidence.softCenters++; }, r => { r.reefResidents.habitatEvidence.depthRangeM[0] += .01; },
    r => { r.reefResidents.habitatEvidence.habitats.other++; }, r => { r.reefResidents.priorLifeAddedIds = []; }, r => { r.reefResidents.reservedPaletteSlots = 2; },
    r => { first(r).reefResidentIndividualVersion = 6; }, r => { first(r).id = first(r).id.replace('-v7:', '-v6:'); }, r => { first(r).sizeM += .001; },
    r => { first(r).reefResidentFoodPool = 'resources.other'; }, r => { first(r).timeSec -= .1; }, r => { first(r).lastResidentIntake.stockBefore += .01; },
    r => { first(r).supportNormal.y -= .01; }, r => { r.reefResidents.birthPlacements.at(-1).position.x += .001; }];
  for (const corrupt of bad) { const copy = clone(f.region); corrupt(copy); assert.equal(validateReefResidentsRecord(copy, f.generator, f), false); }
});

test('all complete historical v1–6 day/night outputs remain frozen after the fresh habitat recipe', () => {
  const outputs = [[], [], [], [], [], []];
  for (const [index, fixtures] of [[5, savedAssemblage()], [4, savedFauna()], [3, savedLife()], [2, savedCommunity()], [1, savedInventory()]])
    for (const f of fixtures) { for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); outputs[index].push(f.region); }
  for (const layout of [{ seed: 'residents-0' }, { seed: 'residents-1' }, { seed: 'residents-2' }, { count: 18, turtles: 1 }, { reef: false }, { count: 20 }]) {
    const f = initialized(layout); for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); outputs[0].push(f.region);
  }
  const expected = ['55c891dcf4aed4973549c7efeabbe6034ff11fef88a316785b813a7b40377ee3',
    '54ae776cffcbc4bad511189a65ac33b93a3aba21d845d096f19aaf465a530b3f',
    '379ed4a0285a75f0fc63bfadb0fdd48d32de919de3eb864372679acfb92991f3',
    'e06d34f2d1605074837c8fa7ddf7a9a9e6cb655304c08c3b1c40fde8bd6e34ae',
    '944e383ac3367427b63df938b598b7f3ef4ae0fc1ab5710c9cd4b97c387d0d89',
    '91703f067967d204228b420a6c20db1d5f153c9250973c85c40cc7b4c5f54126'];
  outputs.forEach((rows, i) => assert.equal(hash(rows), expected[i]));
});
