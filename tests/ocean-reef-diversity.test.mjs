import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { initializeReefResidents, validateReefResidentsRecord, tickReefResidentAgent, isReefResidentAgent,
  reefResidentPositionValid, reefResidentConsumerCount, reefResidentPreyConsumerCount, REEF_RESIDENTS_MODEL, REEF_RESIDENTS_LEGACY_IDS, REEF_DIVERSITY_NEW_IDS } from '../src/oceanReefResidents.js';
import { tickReefGuildPool } from '../src/oceanReefGuild.js';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../src/oceanReefResidentsSpecies.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanReefDiversitySpeciesById } from '../src/oceanReefDiversitySpecies.js';
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

test('v2 preserves every original birth then admits real owner-rotated new kinds within natural capacity', () => {
  const seen = new Set();
  for (let ownerIndex = 0; ownerIndex < 12; ownerIndex++) {
    const f = diversityInventory[ownerIndex], baseline = diversityFixture({ ownerIndex, seed: '49' });
    initializeReefResidents(baseline.region, baseline.generator, { ...options(baseline), fresh: true });
    assert.deepEqual(f.region.agents.filter(a => REEF_RESIDENTS_LEGACY_IDS.includes(a.speciesId)), baseline.region.agents);
    assert.deepEqual(f.region.reefResidents.legacyAddedIds, baseline.region.reefResidents.addedIds);
    assert.deepEqual(f.region.resources, baseline.region.resources); assert.deepEqual(f.region.ledger, baseline.region.ledger);
    assert.equal(f.region.reefGuild.preyOrganicUnits, baseline.region.reefGuild.preyOrganicUnits);
    assert.ok(f.region.reefResidents.addedIds.length <= 4); assert.ok(f.region.agents.length + f.region.turtleAgents.length <= 20);
    assert.equal(f.region.reefResidents.candidateOrder[0], REEF_DIVERSITY_NEW_IDS[ownerIndex % 6]);
    for (const a of f.region.agents) if (a.reefResidentIndividualVersion === 2) seen.add(a.speciesId);
  }
  assert.deepEqual(seen, new Set(REEF_DIVERSITY_NEW_IDS));
  const limited = diverse({ count: 18, turtles: 1 }); assert.equal(limited.region.agents.length + limited.region.turtleAgents.length, 20);
  assert.equal(limited.region.reefResidents.addedIds.length, 1);
  const full = diverse({ count: 18, turtles: 2 }); assert.equal(full.region.reefResidents.addedIds.length, 0);
  const absent = diverse({ reef: false }); assert.equal(absent.region.reefResidents.addedIds.length, 0);
});

test('all whole fish silhouettes and actual benthic tips require physical clearance and proper habitat', () => {
  const fs = savedInventory();
  for (const id of REEF_DIVERSITY_NEW_IDS) {
    const row = newAgent(fs, id); assert.ok(row, id); const { f, a } = row;
    assert.ok(reefResidentPositionValid(f.region, f.generator, a, a.position, f));
    const s = oceanReefDiversitySpeciesById[id];
    assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, pitch: s.support.pitchLimitRad + .001 }), false);
    if (s.support.footContacts.length) {
      const up = new Vector3(a.supportNormal.x, a.supportNormal.y, a.supportNormal.z).normalize();
      const forward = new Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)); forward.addScaledVector(up, -forward.dot(up)).normalize();
      const side = new Vector3().crossVectors(forward, up).normalize();
      for (const foot of s.support.footContacts) {
        const tip = new Vector3(a.position.x, a.position.y, a.position.z).addScaledVector(forward, foot.x * a.sizeM).addScaledVector(side, foot.z * a.sizeM);
        const intrusion = (x, z, crown) => f.surface(x, z, crown) + (Math.hypot(x - tip.x, z - tip.z) < .0005 ? .04 : 0);
        assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: intrusion }), false, `${id} foot`);
      }
    } else {
      const localX = s.normalizedEnvelope.x[1] * a.sizeM, localZ = s.normalizedEnvelope.z[1] * a.sizeM;
      const x = a.position.x + Math.cos(a.heading) * localX - Math.sin(a.heading) * localZ;
      const z = a.position.z + Math.sin(a.heading) * localX + Math.cos(a.heading) * localZ;
      const intrusion = (px, pz, crown) => f.surface(px, pz, crown) + (Math.hypot(px - x, pz - z) < .0005 ? 3 : 0);
      assert.equal(reefResidentPositionValid(f.region, f.generator, a, a.position, { ...f, surface: intrusion }), false, id);
    }
  }
  const { f, a } = newAgent(fs, 'leopard-sea-cucumber');
  assert.equal(f.generator.sample(a.position.x, a.position.z).substrate, 'sand');
  const hard = { ...f.generator, sample: (x, z) => ({ ...f.generator.sample(x, z), substrate: 'rock' }) };
  assert.equal(reefResidentPositionValid(f.region, hard, a, a.position, f), false);
  const missingCoral = diverse({ ownerIndex: 4, seed: '49', coral: false });
  assert.ok(missingCoral.region.agents.every(a => a.speciesId !== 'cushion-sea-star'));
});

test('finite actual ticks exercise four existing stocks with exact receipts, motion and organic balance', () => {
  const fs = savedInventory(), pools = new Set();
  for (const f of fs) {
    const starts = new Map(f.region.agents.map(a => [a.id, clone(a.position)]));
    for (let i = 0; i < 31; i++) {
      const prior = new Map(f.region.agents.map(a => [a.id, clone(a.position)])); step(f);
      for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 2)) {
        const speed = a.speciesId === 'cushion-sea-star' ? .002 : a.speciesId === 'leopard-sea-cucumber' ? .003 :
          a.speciesId === 'lionfish' ? .075 : a.speciesId === 'chinese-trumpetfish' ? .11 : .10;
        assert.ok(gap(a.position, prior.get(a.id)) <= speed * .1 + 1e-10, a.speciesId);
      }
    }
    for (const a of f.region.agents.filter(a => a.reefResidentIndividualVersion === 2)) {
      assert.ok(gap(a.position, starts.get(a.id)) > 0, a.speciesId);
      const e = a.lastResidentIntake; assert.ok(e, a.speciesId);
      assert.equal(e.pool, oceanReefDiversitySpeciesById[a.speciesId].foodPool);
      assert.ok(Math.abs(e.stockBefore - e.stockAfter - e.removedUnits) < 1e-12); pools.add(e.pool);
    }
    assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
  }
  assert.deepEqual(pools, new Set(['reefGuild.preyOrganicUnits', 'resources.algae', 'resources.detritus', 'basicNetwork.coralOrganicUnits']));
});

test('v1 and historical v2 markers, death and empty niches never refill and restore deterministically', () => {
  const old = initialized(), before = clone(old.region);
  assert.equal(initializeReefResidents(old.region, old.generator, { ...options(old), fresh: true, version: 2 }), false);
  assert.deepEqual(old.region, before);
  const f = diverse({ seed: '49' }), equivalent = diverse({ seed: '49' }); assert.deepEqual(f.region, equivalent.region);
  const zero = clone(f.region); for (const a of f.region.agents) assert.equal(tickReefResidentAgent(f.region, f.generator, a, 0, f), false);
  assert.deepEqual(f.region, zero);
  const a = f.region.agents.find(a => a.reefResidentIndividualVersion === 2); assert.ok(a); a.energy = 0; step(f);
  const dead = clone(a); for (let i = 0; i < 3; i++) step(f); assert.deepEqual(a, dead);
  const historical = clone(f.region);
  assert.equal(initializeReefResidents(f.region, f.generator, { ...options(f), fresh: true, version: 2 }), false); assert.deepEqual(f.region, historical);
  assert.ok(validateReefResidentsRecord(clone(f.region), f.generator, f)); balanced(f.region);
});

test('empty animal, algae, detrital and coral stocks yield no food or invented intake', () => {
  for (const f of savedInventory()) {
    const r = f.region, food = r.resources.algae + r.resources.detritus;
    const removed = food + r.reefGuild.preyOrganicUnits + r.basicNetwork.coralOrganicUnits;
    // Explicit fixture boundary export empties pre-existing stocks while both
    // material ledgers remain balanced; the controller never creates food.
    r.resources.algae = 0; r.resources.detritus = 0; r.ledger.exported += food;
    r.reefGuild.preyOrganicUnits = 0; r.basicNetwork.coralOrganicUnits = 0;
    r.basicNetwork.ledger.output += removed; r.basicNetwork.processTotals.systemOutput += removed;
    balanced(r); const input = r.basicNetwork.ledger.externalInput;
    for (let i = 0; i < 31; i++) step(f);
    assert.equal(r.reefResidents.counters.feedings, 0); assert.equal(r.reefResidents.counters.consumedUnits, 0);
    assert.ok(r.agents.every(a => a.lastResidentIntake === null && a.lastFeedAt === null));
    assert.equal(r.basicNetwork.ledger.externalInput, input); balanced(r);
  }
});

test('v2 prey support counts only actual animal-food users and uses existing detritus with explicit four limit', () => {
  const f = savedInventory().find(f => reefResidentPreyConsumerCount(f.region) === 4); assert.ok(f);
  assert.equal(reefResidentConsumerCount(f.region), 4);
  for (const row of savedInventory()) assert.equal(reefResidentPreyConsumerCount(row.region), row.region.agents.filter(a => a.alive && a.reefResidentFoodPool === 'reefGuild.preyOrganicUnits').length);
  const removed = f.region.reefGuild.preyOrganicUnits; f.region.reefGuild.preyOrganicUnits = 0;
  f.region.basicNetwork.ledger.output += removed; f.region.basicNetwork.processTotals.systemOutput += removed;
  const capped = clone(f.region), input = f.region.basicNetwork.ledger.externalInput;
  tickReefGuildPool(f.region, .1, { extraConsumers: 4, maxExtraConsumers: 4 }); tickReefGuildPool(capped, .1, { extraConsumers: 4 });
  assert.equal(f.region.reefGuild.preyOrganicUnits, .00001); assert.equal(capped.reefGuild.preyOrganicUnits, .000005);
  assert.equal(f.region.basicNetwork.ledger.externalInput, input); balanced(f.region); balanced(capped);
  assert.equal(reefResidentPreyConsumerCount(initialized().region), 2);
});

test('v2 full restoration rejects mixed schemas, forged pool routes, births, rotation and individual clocks', () => {
  const f = diverse({ seed: '49' }); for (let i = 0; i < 31; i++) step(f);
  const modify = change => { const r = clone(f.region); change(r); assert.equal(validateReefResidentsRecord(r, f.generator, f), false); };
  for (const change of [r => { r.reefResidentsVersion = 1; }, r => { r.reefResidents.version = 1; }, r => { r.reefResidents.recipe = 'reef-residents-v1'; },
    r => { r.reefResidents.candidateOrder.reverse(); }, r => { r.reefResidents.legacyAddedIds.pop(); }, r => { r.reefResidents.unknown = 1; },
    r => { r.agents.find(a => a.reefResidentIndividualVersion === 2).reefResidentIndividualVersion = 1; },
    r => { r.agents.find(a => a.reefResidentIndividualVersion === 2).reefResidentFoodPool = 'resources.detritus'; },
    r => { r.agents.find(a => a.reefResidentIndividualVersion === 2).timeSec -= .1; },
    r => { r.agents.find(a => a.reefResidentIndividualVersion === 2).lastResidentIntake.stockBefore += .01; },
    r => { r.reefResidents.birthPlacements.at(-1).position.x += .001; }, r => { r.agents.push({ speciesId: 'lionfish', reefResidentIndividualVersion: 2 }); }]) modify(change);
});

test('entire v1 records after finite day and night ticks remain frozen across six original layouts', () => {
  const outputs = [];
  for (const layout of [{ seed: 'residents-0' }, { seed: 'residents-1' }, { seed: 'residents-2' }, { count: 18, turtles: 1 }, { reef: false }, { count: 20 }]) {
    const f = initialized(layout); for (let i = 0; i < 16; i++) step(f); for (let i = 0; i < 16; i++) step(f, { lightAtDepth: .01 }); outputs.push(f.region);
  }
  // Captured from the complete v1 implementation before any v2 edits.
  assert.equal(hash(outputs), '55c891dcf4aed4973549c7efeabbe6034ff11fef88a316785b813a7b40377ee3');
});
