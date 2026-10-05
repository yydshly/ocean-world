import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { initializeReefGuild, validateReefGuildRecord, consumeReefGuildPrey, tickReefGuildPool,
  tickReefGuildAgent, isReefGuildAgent, reefGuildFootRadius } from '../src/oceanReefGuild.js';
import { reefGuildSupportHeight } from '../src/reefGuildHabitat.js';

class MemoryStore {
  available = true; records = new Map();
  async load(world, id) { return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) { this.records.set(`${world}|${id}`, structuredClone(state)); }
  async saveMany(world, entries) { for (const [id, state] of entries) await this.save(world, id, state); }
}
const seed = livingShallowsSeed('42');
function generatorFixture() {
  return { profile: 'living-shallows-v1',
    sample: () => ({ floorY: -5, depthM: 13, habitat: 'reef', substrate: 'sand', rockiness: .8, seagrassSuitability: .2 }),
    chunk(cx, cz) {
      const x = cx * 64 + 32, z = cz * 64 + 32;
      const rock = { id: `rock:${cx},${cz}`, kind: 'rock', x, y: -5, z,
        scale: { x: 12, y: 1, z: 12 }, rotation: 0 };
      const coral = { id: `coral:${cx},${cz}`, kind: 'coral', x, y: oceanRockHeight(rock, x, z), z,
        scale: { x: 2, y: .8, z: 2 }, rotation: 0, attachmentId: rock.id };
      return { id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
        bounds: { minX: cx * 64, maxX: (cx + 1) * 64, minZ: cz * 64, maxZ: (cz + 1) * 64 },
        counts: { rock: 1, coral: 1, seagrass: 0, algae: 0 }, elements: [rock, coral] };
    } };
}
const random = salt => [...salt].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1000 / 1000;
function baseRegion(g = generatorFixture()) {
  const position = { x: 224, y: -3.1, z: 224 };
  const agent = (id, alive) => ({ id, regionId: '3,3', speciesId: alive ? 'green-chromis' : 'top-shell',
    alive, energy: alive ? .8 : 0, position: { ...position }, home: { ...position }, target: { ...position }, refuge: { ...position },
    velocity: { x: 0, y: 0, z: 0 }, refugeHostId: 'coral:3,3', sizeM: .075, heading: 0,
    state: alive ? 'schooling' : 'dead', nextBite: 0, nextDecision: 0, decisions: 0, parasites: 0 });
  const region = { version: 1, id: '3,3', cx: 3, cz: 3, ticks: 20, timeSec: 2,
    agents: [agent('old-fish', true), agent('old-death', false)], events: [],
    resources: { algae: .3, plankton: .5, detritus: .3 }, ledger: { initial: 1.1, input: 0, ingested: 0, exported: 0 },
    counters: { feeding: 0, escapes: 0, cleaning: 0, predation: 0, deaths: 1 } };
  initializeLivingNetwork(region, g.chunk(3, 3));
  return region;
}
const options = g => ({ random, surface: (x, z, coral) => oceanSupportHeight(g, x, z, { avoidCoral: coral }), bed: () => -5 });
const close = value => assert.ok(Math.abs(value) < 1e-9, `balance ${value}`);
function admit() {
  const g = generatorFixture(), r = baseRegion(g), opts = options(g);
  assert.equal(initializeReefGuild(r, g, opts), true);
  assert.deepEqual(r.agents.filter(isReefGuildAgent).map(a => a.speciesId).sort(), ['day-octopus', 'spotted-reef-crab', 'tube-sponge']);
  return { g, r, opts };
}

test('one-time guild admission preserves every previous field, including historical deaths, with explicit initial stock input', () => {
  const g = generatorFixture(), r = baseRegion(g), before = structuredClone(r);
  assert.ok(initializeReefGuild(r, g, options(g)));
  const added = r.reefGuild.initialInputUnits, comparison = structuredClone(r);
  delete comparison.reefGuildVersion; delete comparison.reefGuildInitializedAtSec; delete comparison.reefGuild;
  comparison.agents = comparison.agents.filter(a => !isReefGuildAgent(a));
  assert.equal(comparison.basicNetwork.ledger.externalInput - before.basicNetwork.ledger.externalInput, added);
  assert.equal(comparison.basicNetwork.processTotals.externalInput - before.basicNetwork.processTotals.externalInput, added);
  comparison.basicNetwork.ledger.externalInput = before.basicNetwork.ledger.externalInput;
  comparison.basicNetwork.processTotals.externalInput = before.basicNetwork.processTotals.externalInput;
  assert.deepEqual(comparison, before);
  assert.ok(validateReefGuildRecord(r, g, options(g)));
  assert.ok(validateLivingNetworkRecord(r)); close(livingNetworkBalance(r));
  const accepted = structuredClone(r);
  assert.equal(initializeReefGuild(r, g, options(g)), false); assert.deepEqual(r, accepted);
});

test('dead identities and turtles occupy shared capacity; a full region is marked once without refilling', () => {
  const g = generatorFixture(), r = baseRegion(g);
  r.agents.push(...Array.from({ length: 17 }, (_, i) => ({ ...structuredClone(r.agents[1]), id: `historical-death:${i}` })));
  r.turtleAgents = [{ id: 'old-turtle', alive: false }];
  const agents = structuredClone(r.agents), turtles = structuredClone(r.turtleAgents);
  assert.ok(initializeReefGuild(r, g, options(g)));
  assert.equal(r.agents.length + r.turtleAgents.length, 20);
  assert.deepEqual(r.agents, agents); assert.deepEqual(r.turtleAgents, turtles);
  assert.equal(r.reefGuild.addedIds.length, 0); assert.equal(r.reefGuild.initialInputUnits, 0);
  assert.equal(initializeReefGuild(r, g, options(g)), false);
});

test('proxy prey is actually consumed; detrital support and ingestion retain exact network and food-stock balances', () => {
  const { r } = admit(), octopus = r.agents.find(a => a.speciesId === 'day-octopus');
  const previousFood = r.resources.detritus, previousPrey = r.reefGuild.preyOrganicUnits;
  tickReefGuildPool(r, 20);
  const supported = r.reefGuild.counters.preySupportedUnits;
  assert.ok(supported > 0); assert.equal(r.resources.detritus, previousFood - supported);
  assert.equal(r.reefGuild.preyOrganicUnits, previousPrey + supported);
  const deadStates = r.agents.map(a => a.alive);
  const taken = consumeReefGuildPrey(r, octopus, .0006);
  assert.equal(taken, .0006); assert.equal(r.reefGuild.counters.proxyConsumedUnits, taken);
  assert.deepEqual(r.agents.map(a => a.alive), deadStates, 'proxy meals never fabricate visible prey kills');
  close(livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r));
  const remaining = r.reefGuild.preyOrganicUnits;
  r.reefGuild.preyOrganicUnits = 0; r.basicNetwork.ledger.output += remaining; r.basicNetwork.processTotals.systemOutput += remaining;
  const energy = octopus.energy, organic = octopus.organicUnits, count = r.reefGuild.counters.proxyFeedings;
  assert.equal(consumeReefGuildPrey(r, octopus, .01), 0);
  assert.equal(octopus.energy, energy); assert.equal(octopus.organicUnits, organic); assert.equal(r.reefGuild.counters.proxyFeedings, count);
  close(livingNetworkBalance(r));
});

test('crab day/night preference is qualitative, while attached sponge remains fixed and intake needs real plankton', () => {
  const { g, r, opts } = admit(), crab = r.agents.find(a => a.speciesId === 'spotted-reef-crab'), sponge = r.agents.find(a => a.speciesId === 'tube-sponge');
  const state = (agent, state) => { agent.state = state; }, pose = structuredClone(sponge.position), crabPose = structuredClone(crab.position);
  const context = { ...opts, state, environment: { lightAtDepth: .7 }, feedPlankton: () => 0 };
  crab.nextBite = 0; tickReefGuildAgent(r, g, crab, .1, context);
  assert.equal(crab.state, 'resting'); assert.deepEqual(crab.position, crabPose); assert.equal(crab.lastFeedAt, null);
  tickReefGuildAgent(r, g, crab, .1, { ...context, environment: { lightAtDepth: .01 } });
  assert.equal(crab.state, 'prey-pool-feeding'); assert.equal(crab.lastFeedAt, r.timeSec);
  r.resources.plankton = 0;
  tickReefGuildAgent(r, g, sponge, .1, context);
  assert.equal(sponge.state, 'resting'); assert.deepEqual(sponge.position, pose); assert.equal(sponge.lastFeedAt, null);
  assert.equal(r.reefGuild.counters.filterFeedings, 0);
});

test('full-footprint steep ledge and coral crown block crawler steps; accepted displacement obeys XYZ speed and anchor range', () => {
  const { g, r, opts } = admit(), octopus = r.agents.find(a => a.speciesId === 'day-octopus');
  const original = structuredClone(octopus.position), radius = reefGuildFootRadius(octopus), state = (a, s) => { a.state = s; };
  octopus.nextBite = 100; octopus.nextDecision = 100; octopus.target = { ...original, x: original.x + 1 };
  const cliff = (x, z, coral) => x >= original.x + radius + .0001 ? opts.surface(x, z, coral) + .4 : opts.surface(x, z, coral);
  tickReefGuildAgent(r, g, octopus, .1, { random, surface: cliff, state, environment: { lightAtDepth: .7 } });
  assert.deepEqual(octopus.position, original);
  octopus.nextDecision = 100;
  const crown = (x, z, coral) => coral && x >= original.x + radius + .0001 ? opts.surface(x, z) + .4 : opts.surface(x, z, coral);
  tickReefGuildAgent(r, g, octopus, .1, { random, surface: crown, state, environment: { lightAtDepth: .7 } });
  assert.deepEqual(octopus.position, original);
  octopus.nextDecision = 100;
  tickReefGuildAgent(r, g, octopus, .1, { ...opts, state, environment: { lightAtDepth: .7 } });
  assert.ok(Math.hypot(octopus.position.x - original.x, octopus.position.y - original.y, octopus.position.z - original.z) <= .0025 + 1e-12);
  const support = reefGuildSupportHeight(opts.surface, octopus.position.x, octopus.position.z, radius);
  assert.ok(support); assert.equal(octopus.position.y, support.height + .004);
  assert.ok(validateReefGuildRecord(r, g, opts));
});

test('guild death returns existing organic stock once and never recreates the category', () => {
  const { g, r, opts } = admit(), dead = r.agents.find(a => a.speciesId === 'day-octopus'), quantity = dead.organicUnits;
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; recordLivingDeath(r, dead);
  assert.equal(r.basicNetwork.processTotals.deathDetritus, quantity);
  recordLivingDeath(r, dead); assert.equal(r.basicNetwork.processTotals.deathDetritus, quantity);
  assert.equal(initializeReefGuild(r, g, opts), false); assert.equal(r.agents.filter(a => a.speciesId === dead.speciesId).length, 1);
  assert.equal(dead.organicUnits, 0); assert.ok(validateLivingNetworkRecord(r)); close(livingNetworkBalance(r));
});

test('actual generated guild, pool and deaths survive complete unload/revisit and paused reload without regeneration', async () => {
  const g = createLivingShallowsGenerator(seed), store = new MemoryStore(), first = new OceanEcology(seed, g, { store, turtles: true });
  await first.update(g.routeStops[0]);
  const residents = first._active.get('3,3'), added = residents.agents.filter(isReefGuildAgent);
  assert.equal(added.length, 3); first.step(4);
  assert.ok(added.find(a => a.speciesId === 'day-octopus').lastFeedAt !== null);
  assert.ok(added.find(a => a.speciesId === 'tube-sponge').lastFeedAt !== null);
  const dead = added.find(a => a.speciesId === 'spotted-reef-crab'); dead.alive = false; dead.energy = 0; dead.state = 'dead'; recordLivingDeath(residents, dead);
  close(first.snapshot().ecosystem.balanceError); const before = structuredClone(residents);
  await first.update({ x: 1500, z: -900 }); assert.equal(first._active.has('3,3'), false);
  await first.update(g.routeStops[0]); assert.deepEqual(first._active.get('3,3'), before);
  await first.checkpoint();
  const reload = new OceanEcology(seed, createLivingShallowsGenerator(seed), { store, turtles: true });
  await reload.update(g.routeStops[0]); assert.deepEqual(reload._active.get('3,3'), before);
  assert.equal(reload.agents.find(a => a.id === dead.id).alive, false);
  assert.ok(reload.snapshot().regions.every(r => r.agentCount <= 20)); close(reload.snapshot().ecosystem.balanceError);
});

test('upgrade commits before activation; failed atomic commit preserves the old saved record, corrupt guild does not regenerate', async () => {
  const store = new MemoryStore(), g = generatorFixture(), first = new OceanEcology(seed, g, { store });
  await first.update({ x: 224, z: 224 }); await first.checkpoint();
  for (const record of store.records.values()) {
    const input = record.reefGuild.initialInputUnits;
    record.agents = record.agents.filter(a => !isReefGuildAgent(a));
    record.basicNetwork.ledger.externalInput -= input; record.basicNetwork.processTotals.externalInput -= input;
    delete record.reefGuildVersion; delete record.reefGuildInitializedAtSec; delete record.reefGuild;
    assert.ok(validateLivingNetworkRecord(record));
  }
  const baseline = structuredClone([...store.records]);
  const saveMany = store.saveMany; store.saveMany = async () => { throw new Error('atomic admission rejected'); };
  const pending = new OceanEcology(seed, g, { store });
  assert.equal(await pending.update({ x: 224, z: 224 }), false); assert.equal(pending._active.size, 0);
  assert.deepEqual([...store.records], baseline);
  store.saveMany = saveMany;
  const upgraded = new OceanEcology(seed, g, { store }); await upgraded.update({ x: 224, z: 224 });
  const record = store.records.get(`${upgraded._world}|2,2`); record.reefGuildVersion = 999;
  const corrupted = structuredClone(record), reload = new OceanEcology(seed, g, { store });
  await assert.rejects(reload.update({ x: 224, z: 224 }), /Invalid saved reef-life guild/);
  assert.equal(reload._active.size, 0); assert.deepEqual(store.records.get(`${upgraded._world}|2,2`), corrupted);
});

test('legacy shallow profile has no guild fields or new categories', async () => {
  const g = createOceanGenerator('42'), model = new OceanEcology('42', g, { store: new MemoryStore() });
  await model.update({ x: 224, z: 224 }); model.step(.2);
  assert.equal(model.agents.some(isReefGuildAgent), false);
  assert.ok([...model._active.values()].every(r => !Object.hasOwn(r, 'reefGuild') && !Object.hasOwn(r, 'reefGuildVersion')));
  assert.ok(model.snapshot().regions.every(r => !Object.hasOwn(r, 'reefGuild')));
});
