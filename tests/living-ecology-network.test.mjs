import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanTurtlePositionValid } from '../src/oceanTurtleCommunity.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance,
  recordLivingIngestion, recordLivingDeath, recordLivingPredation, recordLivingTransfer,
  tickLivingNetwork, LIVING_NETWORK_PROFILE } from '../src/livingEcologyNetwork.js';

class MemoryStore {
  available = true;
  records = new Map();
  async load(world, id) { return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) { this.records.set(`${world}|${id}`, structuredClone(state)); }
  async saveMany(world, entries) { for (const [id, state] of entries) await this.save(world, id, state); }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}
function fixtureGenerator(profile = LIVING_NETWORK_PROFILE) {
  return {
    ...(profile ? { profile } : {}),
    sample: () => ({ floorY: -5, depthM: 13, substrate: 'sand', habitat: 'reef', rockiness: .7, seagrassSuitability: .25 }),
    chunk(cx, cz) {
      const elements = [];
      for (const [index, [dx, dz]] of [[20, 22], [43, 40]].entries()) {
        const x = cx * 64 + dx, z = cz * 64 + dz;
        const rock = { id: `rock:${cx},${cz}:${index}`, kind: 'rock', x, y: -5, z, scale: { x: 10, y: 2.5, z: 8 }, rotation: 0 };
        elements.push(rock, { id: `coral:${cx},${cz}:${index}`, kind: 'coral', morphotype: 'branching', x, y: oceanRockHeight(rock, x, z), z,
          scale: { x: 4, y: 1.2, z: 3.5 }, rotation: 0, attachmentId: rock.id },
        { id: `algae:${cx},${cz}:${index}`, kind: 'algae', x: x + 3.2, y: oceanRockHeight(rock, x + 3.2, z), z,
          scale: { x: 1, y: .02, z: 1 }, rotation: 0, attachmentId: rock.id, surfaceRadius: .18, patchRadius: .09 });
      }
      for (let i = 0; i < 24; i++) elements.push({ id: `grass:${cx},${cz}:${i}`, kind: 'seagrass',
        x: cx * 64 + 8 + (i % 8) * 3, y: -5, z: cz * 64 + 49 + Math.floor(i / 8) * 3,
        scale: { x: .7, y: .4, z: .7 }, rotation: 0 });
      return { id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
        bounds: { minX: cx * 64, maxX: (cx + 1) * 64, minZ: cz * 64, maxZ: (cz + 1) * 64 },
        counts: { rock: 2, coral: 2, algae: 2, seagrass: 24 }, elements };
    },
  };
}
const environment = { lightAtDepth: .7, foodSupply: 1, currentMps: .15 };
function bareRegion() {
  const region = { id: '3,3', timeSec: 0, resources: { algae: .4, plankton: .5, detritus: .3 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 },
    agents: [{ id: 'fish-a', speciesId: 'green-chromis', alive: true, energy: .8 },
      { id: 'fish-b', speciesId: 'honeycomb-grouper', alive: true, energy: .2 },
      { id: 'old-death', speciesId: 'green-chromis', alive: false, energy: 100 }] };
  initializeLivingNetwork(region, fixtureGenerator().chunk(3, 3));
  return region;
}
const close = value => assert.ok(Math.abs(value) < 1e-10, `balance ${value}`);
const frozenRegion = model => structuredClone(model._active.get('3,3'));

test('reference material inventory is independent of energy; historical deaths gain no fabricated carcass', () => {
  const region = bareRegion();
  assert.equal(region.agents[0].organicUnits, region.agents[1].organicUnits);
  assert.equal(region.agents[2].organicUnits, 0);
  assert.equal(region.agents[2].organicDeathRecorded, true);
  const before = structuredClone(region);
  assert.equal(initializeLivingNetwork(region, fixtureGenerator().chunk(3, 3)), false);
  assert.deepEqual(region, before);
  close(livingNetworkBalance(region));
  assert.ok(validateLivingNetworkRecord(region));
});

test('production consumes finite nutrients; litter and decomposition feed measured transfer ledgers', () => {
  const region = bareRegion();
  tickLivingNetwork(region, environment, 20);
  assert.ok(region.basicNetwork.processTotals.primaryProduction > 0);
  assert.ok(region.basicNetwork.processTotals.plantLitter > 0);
  assert.ok(region.basicNetwork.processTotals.decomposition > 0);
  assert.ok(region.basicNetwork.processTotals.mineralisation > 0);
  assert.ok(region.basicNetwork.processTotals.systemOutput > 0);
  close(livingNetworkBalance(region));
  assert.ok(validateLivingNetworkRecord(region));
  // Accounted removal gives a closed zero-nutrient/zero-detritus boundary.
  const depleted = bareRegion();
  depleted.resources = { algae: 0, plankton: 0, detritus: 0 };
  depleted.basicNetwork.nutrients = 0;
  depleted.basicNetwork.plantOrganicUnits = 0;
  depleted.basicNetwork.coralOrganicUnits = 0;
  depleted.ledger.initial = 0;
  depleted.basicNetwork.ledger.initial = depleted.agents.reduce((n, a) => n + a.organicUnits, 0);
  tickLivingNetwork(depleted, { ...environment, foodSupply: 0 }, .1);
  assert.equal(depleted.basicNetwork.processTotals.primaryProduction, 0);
  close(livingNetworkBalance(depleted));
});

test('actual ingestion partitions tracked intake into retention, detritus and explicit output', () => {
  const region = bareRegion(), fish = region.agents[0], quantity = .002;
  region.resources.plankton -= quantity;
  region.ledger.ingested += quantity;
  recordLivingIngestion(region, fish, quantity);
  assert.equal(fish.organicUnits, .004 + quantity * .6);
  assert.equal(region.basicNetwork.processTotals.feedingDetritus, quantity * .25);
  assert.equal(region.basicNetwork.processTotals.systemOutput, quantity * .15);
  close(livingNetworkBalance(region));
  assert.ok(validateLivingNetworkRecord(region));
});

test('death enters detritus once, and predation transfers the prey stock without energy-to-mass conversion', () => {
  const region = bareRegion();
  const prey = region.agents[0], predator = region.agents[1];
  prey.energy = 999;
  prey.alive = false;
  assert.equal(recordLivingPredation(region, predator, prey), .004);
  const after = structuredClone(region);
  recordLivingDeath(region, prey);
  assert.deepEqual(region, after);
  predator.alive = false;
  const quantity = predator.organicUnits;
  recordLivingDeath(region, predator);
  assert.equal(region.basicNetwork.processTotals.deathDetritus, .004 * .25 + quantity);
  const twice = structuredClone(region);
  recordLivingDeath(region, predator);
  assert.deepEqual(region, twice);
  close(livingNetworkBalance(region));
  assert.ok(validateLivingNetworkRecord(region));
});

test('consumer geographic ownership carries material and preserves each region balance', () => {
  const source = bareRegion(), destination = bareRegion(), agent = source.agents[0];
  destination.agents.forEach((a, i) => { a.id = `dest-${i}`; });
  source.agents.shift(); destination.agents.push(agent);
  recordLivingTransfer(source, destination, agent.organicUnits);
  close(livingNetworkBalance(source)); close(livingNetworkBalance(destination));
});

test('integrated new profile covers roles, consumes real food and conserves both ledgers across local and transport steps', async () => {
  const model = new OceanEcology(livingShallowsSeed('42'), fixtureGenerator(), { store: new MemoryStore() });
  await model.update({ x: 224, z: 224 });
  const initial = model.snapshot();
  assert.ok(Object.values(initial.ecosystem.coverage).every(Boolean));
  assert.ok(initial.regions.every(r => r.agentCount <= 20));
  model.step(12);
  const after = model.snapshot();
  assert.ok(after.agents.some(a => a.lastFeedAt !== null));
  assert.ok(after.ecosystem.processTotals.ingestion > 0);
  close(after.metrics.balanceError); close(after.ecosystem.balanceError);
  assert.ok([...model._active.values()].every(validateLivingNetworkRecord));
  const paused = model.snapshot(); model.step(0);
  assert.deepEqual(model.snapshot(), paused);
});

test('food shortage prevents intake and energy gain; new light production obeys the resource boundary', async () => {
  const model = new OceanEcology(livingShallowsSeed('42'), fixtureGenerator(), { store: new MemoryStore() });
  await model.update({ x: 224, z: 224 });
  const region = model._active.get('3,3');
  const fish = region.agents.find(a => a.speciesId === 'green-chromis');
  const energy = fish.energy, organic = fish.organicUnits;
  // This is a deliberate depleted experiment, with the withdrawn material
  // recorded as output instead of silently breaking the stock identity.
  const removed = region.resources.plankton;
  region.resources.plankton = 0; region.ledger.exported += removed;
  region.basicNetwork.ledger.output += removed;
  region.basicNetwork.processTotals.systemOutput += removed;
  fish.nextBite = region.timeSec;
  assert.equal(model._feed(region, fish, 'plankton', .0012), 0);
  assert.equal(fish.energy, energy); assert.equal(fish.organicUnits, organic);
  close(livingNetworkBalance(region));
  assert.ok(validateLivingNetworkRecord(region));
  for (const owner of model._active.values()) {
    const withdrawn = owner.resources.plankton + owner.basicNetwork.nutrients;
    owner.ledger.exported += owner.resources.plankton;
    owner.resources.plankton = 0; owner.basicNetwork.nutrients = 0;
    owner.basicNetwork.ledger.output += withdrawn;
    owner.basicNetwork.processTotals.systemOutput += withdrawn;
    for (const agent of owner.agents) {
      agent.lastFeedAt = null;
      if (agent.speciesId === 'green-chromis') { agent.nextBite = owner.timeSec; agent.nextDecision = 0; }
    }
  }
  model.step(.1, { foodSupply: 0 });
  const planktivores = model.agents.filter(a => a.speciesId === 'green-chromis');
  assert.ok(planktivores.every(a => a.lastFeedAt === null));
  assert.ok(planktivores.some(a => a.state === 'foraging'));
  close(model.snapshot().ecosystem.balanceError);
});

test('death, complete network and individual identities survive actual unload, revisit and paused refresh without refilling', async () => {
  const store = new MemoryStore(), seed = livingShallowsSeed('42'), generator = fixtureGenerator();
  const model = new OceanEcology(seed, generator, { store });
  await model.update({ x: 224, z: 224 }); model.step(8);
  const region = model._active.get('3,3'), dead = region.agents.find(a => a.speciesId === 'green-chromis');
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  model.step(.1);
  const expected = frozenRegion(model);
  await model.update({ x: 900, z: 900 }); model.step(2);
  assert.equal(model._active.has('3,3'), false);
  await model.update({ x: 224, z: 224 });
  assert.deepEqual(frozenRegion(model), expected);
  await model.checkpoint();
  const reload = new OceanEcology(seed, generator, { store });
  await reload.update({ x: 224, z: 224 });
  assert.deepEqual(frozenRegion(reload), expected);
  assert.equal(reload.agents.find(a => a.id === dead.id).alive, false);
  assert.ok(validateLivingNetworkRecord(reload._active.get('3,3')));
});

test('new-profile partial/corrupt saved networks reject before regeneration or replacement', async () => {
  const seed = livingShallowsSeed('42');
  const corruptions = [r => { r.basicNetwork.nutrients = -1; }, r => { r.agents[0].organicUnits += .4; },
    r => { r.basicNetwork.version = 999; }, r => { delete r.basicNetwork; },
    r => { r.basicNetwork.processTotals.systemOutput += .1; }, r => { r.agents[0].position.y = NaN; }];
  for (const corrupt of corruptions) {
    const store = new MemoryStore(), first = new OceanEcology(seed, fixtureGenerator(), { store });
    await first.update({ x: 224, z: 224 }); await first.checkpoint();
    const key = `${first._world}|2,2`, record = store.records.get(key);
    corrupt(record);
    const preserved = structuredClone(record);
    const reload = new OceanEcology(seed, fixtureGenerator(), { store });
    await assert.rejects(reload.update({ x: 224, z: 224 }), /Invalid saved living-shallows/);
    assert.equal(reload._active.size, 0);
    assert.deepEqual(store.records.get(key), preserved);
  }
});

test('missing whole network initializes once at preactivation; failed commit activates no new owner', async () => {
  const seed = livingShallowsSeed('42'), store = new MemoryStore();
  const legacy = new OceanEcology(seed, fixtureGenerator(null), { store });
  await legacy.update({ x: 224, z: 224 }); legacy.step(3); await legacy.checkpoint();
  const legacyRegion = frozenRegion(legacy);
  const upgraded = new OceanEcology(seed, fixtureGenerator(), { store });
  await upgraded.update({ x: 224, z: 224 });
  const region = upgraded._active.get('3,3');
  assert.equal(region.basicNetwork.initializedAtSec, 3);
  const oldAgent = legacyRegion.agents[0];
  assert.deepEqual(region.agents.find(a => a.id === oldAgent.id).position, oldAgent.position);
  assert.deepEqual(region.resources, legacyRegion.resources);
  assert.ok(validateLivingNetworkRecord(region));
  const fail = new MemoryStore(); fail.saveMany = async () => { throw new Error('commit failed'); };
  const pending = new OceanEcology(seed, fixtureGenerator(), { store: fail });
  assert.equal(await pending.update({ x: 224, z: 224 }), false);
  assert.equal(pending._active.size, 0);
});

test('old profile remains outside the network; defaults preserve complete records and public shape', async () => {
  const seed = '42', first = new OceanEcology(seed, createOceanGenerator(seed), { store: new MemoryStore() });
  const second = new OceanEcology(seed, createOceanGenerator(seed), { store: new MemoryStore() });
  await first.update({ x: 224, z: 224 }); await second.update({ x: 224, z: 224 });
  first.step(2); for (let i = 0; i < 20; i++) second.step(.1);
  assert.deepEqual([...first._active], [...second._active]);
  assert.equal(Object.hasOwn(first.snapshot(), 'ecosystem'), false);
  assert.ok(first.snapshot().regions.every(r => !Object.hasOwn(r, 'basicNetwork')));
  assert.ok(first.agents.every(a => !Object.hasOwn(a, 'organicUnits')));
});

test('production route links living habitat to four spontaneous animal relationships, with reproducible new births', async () => {
  const seed = livingShallowsSeed('42'), generator = createLivingShallowsGenerator(seed);
  const first = new OceanEcology(seed, generator, { store: new MemoryStore(), turtles: true });
  const reordered = new OceanEcology(seed, createLivingShallowsGenerator(seed), { store: new MemoryStore(), turtles: true });
  await first.update(generator.routeStops[0]);
  const birth = frozenRegion(first);
  await reordered.update({ x: 1500, z: -900 });
  await reordered.update(generator.routeStops[0]);
  assert.deepEqual(frozenRegion(reordered), birth);
  first.step(12);
  const scene = first.snapshot();
  for (const state of ['grazing', 'filtering', 'deposit-feeding', 'fleeing'])
    assert.ok(scene.agents.some(a => a.alive && a.state === state), `ordinary population has ${state}`);
  assert.ok(scene.regions.some(r => r.counters.escapes > 0));
  assert.ok(scene.agents.some(a => a.lastFeedAt !== null && a.speciesId === 'giant-clam'));
  assert.ok(scene.agents.some(a => a.lastFeedAt !== null && a.speciesId === 'black-cucumber'));
  assert.ok(scene.agents.some(a => a.lastFeedAt !== null && a.speciesId === 'lined-tang'));
  assert.ok(scene.agents.some(a => a.lastFeedAt !== null && a.speciesId === 'green-chromis'));
  assert.ok(Object.values(scene.ecosystem.coverage).every(Boolean));
  close(scene.metrics.balanceError); close(scene.ecosystem.balanceError);
  await first.update(generator.routeStops[2]);
  assert.ok(first.agents.some(a => a.speciesId === 'green-turtle'));
  assert.ok(first.snapshot().ecosystem.plantOrganicUnits > 0);
  assert.ok(first.snapshot().regions.every(r => r.agentCount <= 20));
  await first.update({ x: 0, z: 0 });
  assert.ok(first.agents.some(a => Math.hypot(a.position.x, a.position.z) < 40), 'new scene has no reserved authored-origin circle');
  const position = { x: 10, y: -3.8, z: 10 }, support = { cx: 0, cz: 0, surface: () => -5, grass: [] };
  assert.equal(oceanTurtlePositionValid(fixtureGenerator(), position, 1.3, support), true);
  assert.equal(oceanTurtlePositionValid(fixtureGenerator(null), position, 1.3, support), false);
});
