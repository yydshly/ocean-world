import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, REEF_RESIDENTS_MODEL } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
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

test('two actual fresh v8 residents use independent births and exact original record capacity', () => {
  const f = fixture(), saved = clone(f.region), oldRandom = () => { throw new Error('original RNG must not be consumed'); };
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, random: oldRandom }), true);
  assert.deepEqual(new Set(f.region.agents.map(a => a.speciesId)), new Set(OCEAN_REEF_RESIDENT_IDS));
  assert.deepEqual(f.region.resources, saved.resources); assert.deepEqual(f.region.ledger, saved.ledger);
  assert.equal(f.region.reefGuild.preyOrganicUnits, saved.reefGuild.preyOrganicUnits);
  assert.equal(f.region.reefResidents.initialInputUnits, .008); assert.equal(f.region.basicNetwork.ledger.externalInput, .008);
  assert.equal(f.region.reefResidents.groupId, '204,4');
  assert.ok(validateReefResidentsRecord(f.region, f.generator, f)); balanced(f.region);
  const equivalent = initialized(); assert.deepEqual(equivalent.region, f.region);
  const full = initialized({ count: 18, turtles: 2 });
  assert.equal(full.region.reefResidents.addedIds.length, 0); assert.equal(full.region.reefResidents.initialInputUnits, 0);
  const single = initialized({ count: 18, turtles: 1 }); assert.equal(single.region.agents.length + single.region.turtleAgents.length, 20);
  assert.equal(single.region.reefResidents.addedIds.length, 1);
});

test('fresh-only admission seals histories and genuine empty niches without moving old records', () => {
  for (const [configure, fresh] of [[f => {}, false], [f => { f.region.timeSec = .1; f.region.ticks = 1; }, true],
    [f => { f.chunk.ridgePlan.version = 9; }, true], [f => { f.chunk.ridgePlan.group.ownerIds.pop(); }, true], [f => { f.region.reefResidentsUnknown = 1; }, true]]) {
    const f = fixture({ count: 2 }); configure(f); const before = clone(f.region);
    assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh }), false);
    assert.deepEqual(f.region, before);
  }
  for (const f of [initialized({ reef: false }), initialized({ count: 20 })]) {
    assert.equal(f.region.reefResidents.addedIds.length, 0); const before = clone(f.region);
    assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true }), false); assert.deepEqual(f.region, before);
  }
});

test('whole fish, all ten lobster feet and long antenna envelope reject physical intrusions', () => {
  const f = initialized(), fish = f.region.agents.find(a => a.speciesId === 'coral-trout'), lobster = f.region.agents.find(a => a.speciesId === 'painted-spiny-lobster');
  assert.ok(fish && lobster);
  for (const a of f.region.agents) assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f));
  assert.equal(reefResidentPositionValid(f.region, f.generator, fish, fish.position, { ...f, pitch: .101 }), false);
  assert.equal(reefResidentPositionValid(f.region, f.generator, lobster, lobster.position, { ...f, pitch: .001 }), false);
  const floorIntrusion = (x, z, crown = false) => f.surface(x, z) + (crown && Math.hypot(x - fish.position.x, z - fish.position.z) < .003 ? 2 : 0);
  assert.equal(reefResidentPositionValid(f.region, f.generator, fish, fish.position, { ...f, surface: floorIntrusion }), false);
  const reach = lobster.sizeM * 2.25, x = lobster.position.x + Math.cos(lobster.heading) * reach, z = lobster.position.z + Math.sin(lobster.heading) * reach;
  const antennaIntrusion = (px, pz, crown = false) => f.surface(px, pz) + (crown && Math.hypot(px - x, pz - z) < .003 ? 1 : 0);
  assert.equal(reefResidentPositionValid(f.region, f.generator, lobster, lobster.position, { ...f, surface: antennaIntrusion }), false);
  assert.equal(validateReefResidentsRecord(f.region, f.generator, { surface: antennaIntrusion, bed: f.bed }), false);
  const steep = { ...f.generator, floorSurface: () => ({ height: 0, normal: { x: .7, y: .6, z: 0 } }) };
  const f2 = initialized({ reef: false }); assert.equal(f2.region.agents.length, 0);
  // Current support normals are saved in the same frame used by the model.
  const badNormal = clone(f.region); badNormal.agents.find(a => a.id === lobster.id).supportNormal.x += .1;
  assert.equal(validateReefResidentsRecord(badNormal, steep, f), false);
});

test('every one of ten actual lobster foot tips requires independent unobstructed support', () => {
  const f = initialized(), a = f.region.agents.find(a => a.speciesId === 'painted-spiny-lobster');
  const feet = oceanReefResidentsSpeciesById[a.speciesId].support.footContacts;
  assert.equal(feet.length, 10);
  const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
  const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading));
  forward.addScaledVector(up, -forward.dot(up)).normalize();
  const side = new Vector3().crossVectors(forward, up).normalize();
  const tips = feet.map(foot => new Vector3(a.position.x, a.position.y, a.position.z)
    .addScaledVector(forward, foot.x * a.sizeM).addScaledVector(side, foot.z * a.sizeM));
  const visited = new Set(), before = clone(f.region);
  const observedSurface = (x, z) => {
    for (let i = 0; i < tips.length; i++) if (Math.hypot(x - tips[i].x, z - tips[i].z) < 1e-7) visited.add(i);
    return f.surface(x, z);
  };
  assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: observedSurface }));
  assert.equal(visited.size, 10);
  for (const tip of tips) {
    const obstruction = (x, z) => f.surface(x, z) + (Math.hypot(x - tip.x, z - tip.z) < .0005 ? .04 : 0);
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: obstruction }), false);
  }
  assert.deepEqual(f.region, before);
});

test('owner-clock day and night produce actual bounded motion, receipts and conserved food', () => {
  const f = initialized(), starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)])), births = clone(f.region.reefResidents.birthPlacements), oldCounters = clone(f.region.reefGuild.counters);
  const lobster = f.region.agents.find(a => a.speciesId === 'painted-spiny-lobster');
  for (let i = 0; i < 31; i++) step(f);
  assert.deepEqual(lobster.position, starts.get(lobster.id)); assert.equal(lobster.lastFeedAt, null); assert.equal(lobster.state, 'resting');
  for (let i = 0; i < 31; i++) step(f, { lightAtDepth: .01 });
  assert.ok(f.region.reefResidents.counters.feedings >= 2);
  for (const a of f.region.agents) {
    assert.ok(gap(a.position, starts.get(a.id)) > .001, a.speciesId);
    const e = a.lastResidentIntake; assert.ok(e); assert.equal(e.pool, 'reefGuild.preyOrganicUnits'); assert.equal(e.ownerId, f.region.id);
    assert.equal(e.timeSec, a.lastFeedAt); assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12);
    assert.ok(gap(a.position, a.home) <= (a.speciesId === 'coral-trout' ? 4 : 1.1));
  }
  assert.deepEqual(f.region.reefResidents.birthPlacements, births); assert.deepEqual(f.region.reefGuild.counters, oldCounters);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('zero or duplicate clocks, empty prey, and recorded deaths never move or refill individuals', () => {
  const f = initialized({ prey: 0 }), before = clone(f.region);
  for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false);
  assert.deepEqual(f.region, before);
  for (let i = 0; i < 31; i++) step(f, { lightAtDepth: .01 });
  assert.equal(f.region.reefResidents.counters.feedings, 0); assert.equal(f.region.reefResidents.counters.consumedUnits, 0);
  assert.ok(f.region.agents.every(a => a.lastResidentIntake === null));
  const duplicate = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, .1, f), false);
  assert.deepEqual(f.region, duplicate);
  const dead = f.region.agents[0]; dead.energy = 0; step(f);
  assert.equal(dead.alive, false); assert.equal(dead.organicUnits, 0); assert.equal(f.region.reefResidents.counters.deaths, 1);
  const corpse = clone(dead); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(dead, corpse);
  const saved = clone(f.region); assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true }), false); assert.deepEqual(f.region, saved); balanced(f.region);
});

test('extra consumers only transfer existing detritus, and old default pool outputs stay frozen', () => {
  const f = initialized({ prey: 0 }), input = f.region.basicNetwork.ledger.externalInput, before = f.region.resources.detritus;
  tickReefGuildPool(f.region, .1, { extraConsumers: reefResidentConsumerCount(f.region) });
  assert.ok(f.region.reefGuild.preyOrganicUnits > 0); assert.ok(f.region.resources.detritus < before);
  assert.equal(f.region.basicNetwork.ledger.externalInput, input); balanced(f.region);
  const outputs = [];
  for (const [count, prey, detritus] of [[0, 0, .3], [2, .012, .3], [2, .06, 0]]) {
    const r = { reefGuildVersion: 1, agents: Array.from({ length: count }, (_, i) => ({ speciesId: i ? 'spotted-reef-crab' : 'day-octopus', alive: true })),
      resources: { detritus }, ledger: { networkRemoved: 0 }, reefGuild: { preyOrganicUnits: prey, counters: { preySupportedUnits: 0 } } };
    for (let i = 0; i < 6; i++) tickReefGuildPool(r, .1); outputs.push(r);
  }
  // Frozen from the unmodified HEAD implementation, before the optional
  // extra-consumer parameter. The fixture covers empty, fed and capped pools.
  assert.equal(hash(outputs), '7f67307c6420896fac851ff29163adbd37534f22a3613571d5d6936407a25c81');
});

test('cold validation rejects grafted histories and inconsistent births, normal, size, clocks and receipts', () => {
  const f = initialized(); for (let i = 0; i < 31; i++) step(f);
  const corruptions = [r => { r.reefResidentsVersion = 2; }, r => { r.reefResidents.groupId = 'wrong'; }, r => { r.reefResidents.unknown = 1; },
    r => { r.agents[0].reefResidentUnknown = 1; }, r => { r.agents[0].sizeM += .01; }, r => { r.agents[0].home.x += .01; },
    r => { r.reefResidents.birthPlacements[0].position.x += .01; }, r => { r.agents[0].timeSec -= .1; },
    r => { r.agents[0].supportNormal.y -= .01; }, r => { r.agents[0].targetHeading = NaN; },
    r => { r.agents[0].lastResidentIntake.stockBefore += .001; }, r => { r.reefResidents.counters.feedings = 0; },
    r => { r.agents.push({ speciesId: 'green-chromis', reefResidentIndividualVersion: 1 }); }];
  for (const corrupt of corruptions) { const r = clone(f.region); corrupt(r); assert.equal(validateReefResidentsRecord(r, f.generator, f), false); }
  const saved = clone(f.region); assert.ok(validateReefResidentsRecord(saved, f.generator, f));
  assert.equal(initializeReefResidents(saved, f.generator, { ...options(f), fresh: true }), false); assert.deepEqual(saved, f.region);
});
