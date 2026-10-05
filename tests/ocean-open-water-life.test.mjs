import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { initializeOpenWaterLife, validateOpenWaterLifeRecord, openWaterLifePositionValid,
  consumeOpenWaterLifePrey, tickOpenWaterLifePool, tickOpenWaterLifeAgent, isOpenWaterLifeAgent } from '../src/oceanOpenWaterLife.js';

class Store {
  records = new Map(); available = true;
  async load(w, id) { return structuredClone(this.records.get(`${w}|${id}`) ?? null); }
  async save(w, id, state) { this.records.set(`${w}|${id}`, structuredClone(state)); }
  async saveMany(w, entries) { for (const [id, state] of entries) await this.save(w, id, state); }
}
const seed = livingShallowsSeed('42'), random = () => .1;
function fixture(profile = 'living-shallows-v1') {
  const g = { ...(profile ? { profile } : {}),
    sample: () => ({ floorY: -5, depthM: 13, substrate: 'sand', habitat: 'reef', rockiness: .8, seagrassSuitability: .2 }),
    chunk(cx, cz) {
      const rock = { id: `rock:${cx},${cz}`, kind: 'rock', x: cx * 64 + 30, y: -5, z: cz * 64 + 30, rotation: 0,
        scale: { x: 8, y: 1, z: 8 } };
      return { id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
        bounds: { minX: cx * 64, maxX: (cx + 1) * 64, minZ: cz * 64, maxZ: (cz + 1) * 64 },
        counts: { rock: 1, coral: 0, algae: 0, seagrass: 0 }, elements: [rock] };
    } };
  const pose = { x: 224, y: -3, z: 224 };
  const agent = { id: 'original-fish', regionId: '3,3', speciesId: 'green-chromis', alive: true, energy: .8,
    position: { ...pose }, home: { ...pose }, target: { ...pose }, refuge: { ...pose }, velocity: { x: 0, y: 0, z: 0 },
    sizeM: .075, state: 'schooling', heading: 0, decisions: 0, nextDecision: 0, nextBite: 0, refugeHostId: null };
  const r = { id: '3,3', cx: 3, cz: 3, timeSec: 2, ticks: 20, agents: [agent],
    resources: { algae: .3, plankton: .5, detritus: .2 }, ledger: { initial: 1, input: 0, exported: 0, ingested: 0 },
    counters: { feeding: 0, deaths: 0, predation: 0, escapes: 0, cleaning: 0 }, events: [] };
  initializeLivingNetwork(r, g.chunk(3, 3));
  const options = { random, surface: (x, z, coral) => oceanSupportHeight(g, x, z, { avoidCoral: coral }) };
  return { g, r, options };
}
function admit() {
  const f = fixture(); assert.ok(initializeOpenWaterLife(f.r, f.g, f.options));
  assert.equal(f.r.agents.filter(isOpenWaterLifeAgent).length, 2); return f;
}
const close = error => assert.ok(Math.abs(error) < 1e-9, `material balance ${error}`);

test('open-water admission preserves original fields and independent reef guild state; all initial material is explicitly accounted', () => {
  const { g, r, options } = fixture();
  r.reefGuildVersion = 1; r.reefGuild = { preyOrganicUnits: .01, unchanged: 'historical guild marker' };
  r.basicNetwork.ledger.initial += .01;
  const before = structuredClone(r);
  assert.ok(initializeOpenWaterLife(r, g, options));
  assert.ok(validateOpenWaterLifeRecord(r, g, options));
  const current = structuredClone(r), input = current.openWaterLife.initialInputUnits;
  delete current.openWaterLife; delete current.openWaterLifeVersion; delete current.openWaterLifeInitializedAtSec;
  current.agents = current.agents.filter(a => !isOpenWaterLifeAgent(a));
  assert.equal(current.basicNetwork.ledger.externalInput - before.basicNetwork.ledger.externalInput, input);
  assert.equal(current.basicNetwork.processTotals.externalInput - before.basicNetwork.processTotals.externalInput, input);
  current.basicNetwork.ledger.externalInput = before.basicNetwork.ledger.externalInput;
  current.basicNetwork.processTotals.externalInput = before.basicNetwork.processTotals.externalInput;
  assert.deepEqual(current, before);
  close(livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r));
  const once = structuredClone(r); assert.equal(initializeOpenWaterLife(r, g, options), false); assert.deepEqual(r, once);
});

test('historical deaths and turtle records occupy the shared cap; seeded-empty admissions are marked and never refilled', () => {
  const { g, r, options } = fixture();
  const original = r.agents[0];
  r.agents.push(...Array.from({ length: 18 }, (_, index) => ({ ...structuredClone(original), id: `old-death:${index}`,
    alive: false, energy: 0, organicUnits: 0, organicDeathRecorded: true })));
  r.turtleAgents = [{ id: 'old-dead-turtle', alive: false }];
  const old = structuredClone(r.agents);
  assert.ok(initializeOpenWaterLife(r, g, options)); assert.deepEqual(r.agents, old);
  assert.equal(r.openWaterLife.addedIds.length, 0); assert.equal(r.openWaterLife.initialInputUnits, 0);
  assert.equal(initializeOpenWaterLife(r, g, options), false); assert.ok(validateOpenWaterLifeRecord(r, g, options));
});

test('swimming-prey support debits real plankton, ingestion partitions material, empty stock gives neither food nor energy', () => {
  const { r } = admit(), squid = r.agents.find(a => a.speciesId === 'reef-squid');
  const plankton = r.resources.plankton, prey = r.openWaterLife.preyOrganicUnits;
  tickOpenWaterLifePool(r, 25);
  const supported = r.openWaterLife.counters.preySupportedUnits;
  assert.equal(r.resources.plankton, plankton - supported); assert.equal(r.openWaterLife.preyOrganicUnits, prey + supported);
  const alive = r.agents.map(a => a.alive), taken = consumeOpenWaterLifePrey(r, squid, .001);
  assert.equal(taken, .001); assert.deepEqual(r.agents.map(a => a.alive), alive);
  close(livingNetworkBalance(r)); assert.ok(validateLivingNetworkRecord(r));
  const remaining = r.openWaterLife.preyOrganicUnits;
  r.openWaterLife.preyOrganicUnits = 0; r.basicNetwork.ledger.output += remaining; r.basicNetwork.processTotals.systemOutput += remaining;
  const energy = squid.energy, organic = squid.organicUnits;
  assert.equal(consumeOpenWaterLifePrey(r, squid, .01), 0); assert.equal(squid.energy, energy); assert.equal(squid.organicUnits, organic);
  close(livingNetworkBalance(r));
});

test('whole animated envelope stays below surface and above terrain/coral; owner bounds and finite movement obey current plus pulse budget', () => {
  const { g, r, options } = admit(), squid = r.agents.find(a => a.speciesId === 'reef-squid'), jelly = r.agents.find(a => a.speciesId === 'spotted-jelly');
  assert.equal(openWaterLifePositionValid(g, r, jelly, { ...jelly.position, y: 7.6 }, options), false);
  assert.equal(openWaterLifePositionValid(g, r, jelly, { ...jelly.position, y: -5 }, options), false);
  assert.equal(openWaterLifePositionValid(g, r, squid, { ...squid.position, x: 256 }, options), false);
  const previous = structuredClone(squid.position);
  squid.target = { ...previous, x: previous.x + 2 }; squid.nextDecision = 100; squid.nextBite = 100;
  const context = { ...options, state: (a, state) => { a.state = state; }, feedPlankton: () => 0,
    environment: { lightAtDepth: .6, currentVector: { x: .12, z: .04 } } };
  tickOpenWaterLifeAgent(r, g, squid, .1, context);
  assert.ok(Math.hypot(squid.position.x - previous.x, squid.position.y - previous.y, squid.position.z - previous.z) <= (.26 + Math.hypot(.12, .04)) * .1 + 1e-10);
  assert.ok(openWaterLifePositionValid(g, r, squid, squid.position, options)); assert.ok(Math.abs(squid.pitch) <= .2);
  squid.position = { ...previous }; squid.nextDecision = 100;
  const wall = (x, z, coral) => coral && x >= previous.x + squid.sizeM * .6 + .0001 ? 7.8 : options.surface(x, z, coral);
  tickOpenWaterLifeAgent(r, g, squid, .1, { ...context, surface: wall }); assert.deepEqual(squid.position, previous);
});

test('reef squid night-foraging preference does not fabricate morning meals; empty plankton cannot feed a jelly', () => {
  const { g, r, options } = admit(), squid = r.agents.find(a => a.speciesId === 'reef-squid'), jelly = r.agents.find(a => a.speciesId === 'spotted-jelly');
  const context = { ...options, state: (a, state) => { a.state = state; }, feedPlankton: () => 0,
    environment: { lightAtDepth: .7, currentVector: { x: 0, z: 0 } } };
  squid.nextBite = 0; tickOpenWaterLifeAgent(r, g, squid, .1, context); assert.equal(squid.lastFeedAt, null);
  tickOpenWaterLifeAgent(r, g, squid, .1, { ...context, environment: { ...context.environment, lightAtDepth: .01 } });
  assert.equal(squid.lastFeedAt, r.timeSec); assert.equal(squid.state, 'prey-pool-feeding');
  r.resources.plankton = 0; tickOpenWaterLifeAgent(r, g, jelly, .1, context);
  assert.equal(jelly.lastFeedAt, null); assert.equal(r.openWaterLife.counters.planktonFeedings, 0);
  assert.match(jelly.symbiosisScope, /not simulated/);
});

test('actual route open-water stock, original animal identities and deaths survive all-owner unload, revisit and paused reload', async () => {
  const g = createLivingShallowsGenerator(seed), store = new Store(), first = new OceanEcology(seed, g, { store, turtles: true });
  await first.update(g.routeStops[0]); first.step(4);
  assert.ok([...first._active.values()].every(r => r.populationRecipeVersion === 'living-open-water-v2'));
  assert.ok(first.agents.some(a => a.speciesId === 'spotted-jelly' && a.lastFeedAt !== null));
  first.setEnvironment({ hour: 22 }); first.step(4);
  assert.ok(first.agents.some(a => a.speciesId === 'reef-squid' && a.lastFeedAt !== null));
  const dead = first.agents.find(a => a.speciesId === 'reef-squid'), owner = first._active.get(dead.regionId);
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; recordLivingDeath(owner, dead);
  close(first.snapshot().ecosystem.balanceError);
  const before = structuredClone([...first._active]);
  await first.update({ x: 1500, z: -900 }); assert.ok(before.every(([id]) => !first._active.has(id)));
  await first.update(g.routeStops[0]); assert.deepEqual([...first._active], before); await first.checkpoint();
  const reload = new OceanEcology(seed, createLivingShallowsGenerator(seed), { store, turtles: true });
  reload.setEnvironment({ hour: 22 }); await reload.update(g.routeStops[0]);
  assert.deepEqual([...reload._active], before); assert.equal(reload.agents.find(a => a.id === dead.id).alive, false);
  assert.ok(reload.snapshot().regions.every(r => r.agentCount <= 20)); close(reload.snapshot().ecosystem.balanceError);
});

test('open-water upgrade is atomic; failed commit leaves previous records exact and malformed new marker never regenerates', async () => {
  const { g } = fixture(), store = new Store(), first = new OceanEcology(seed, g, { store });
  await first.update({ x: 224, z: 224 }); await first.checkpoint();
  for (const r of store.records.values()) {
    const initial = r.openWaterLife.initialInputUnits;
    r.agents = r.agents.filter(a => !isOpenWaterLifeAgent(a));
    r.basicNetwork.ledger.externalInput -= initial; r.basicNetwork.processTotals.externalInput -= initial;
    delete r.openWaterLife; delete r.openWaterLifeVersion; delete r.openWaterLifeInitializedAtSec;
    assert.ok(validateLivingNetworkRecord(r));
  }
  const before = structuredClone([...store.records]), saveMany = store.saveMany;
  store.saveMany = async () => { throw new Error('atomic open-water admission rejected'); };
  const pending = new OceanEcology(seed, g, { store });
  assert.equal(await pending.update({ x: 224, z: 224 }), false); assert.equal(pending._active.size, 0); assert.deepEqual([...store.records], before);
  store.saveMany = saveMany;
  const upgraded = new OceanEcology(seed, g, { store }); await upgraded.update({ x: 224, z: 224 });
  const record = store.records.get(`${upgraded._world}|2,2`); record.openWaterLifeVersion = 999;
  const corrupt = structuredClone(record), reload = new OceanEcology(seed, g, { store });
  await assert.rejects(reload.update({ x: 224, z: 224 }), /Invalid saved open-water life/);
  assert.equal(reload._active.size, 0); assert.deepEqual(store.records.get(`${upgraded._world}|2,2`), corrupt);
});

test('existing-network fusilier admission has tracked organic stock and independent initial input without changing existing agents', async () => {
  const g = createLivingShallowsGenerator(seed), store = new Store(), model = new OceanEcology(seed, g, { store, turtles: true });
  await model.update(g.routeStops[0]);
  const r = model._active.get('3,4');
  // A validated prior generation may have a sparse eligible owner. Retain its
  // actual members; this setup examines only a previously unexamined school.
  const school = r.agents.filter(a => a.speciesId === 'yellowtail-fusilier');
  for (const a of school) { r.agents.splice(r.agents.indexOf(a), 1); r.basicNetwork.ledger.externalInput -= a.organicUnits; r.basicNetwork.processTotals.externalInput -= a.organicUnits; }
  delete r.pelagicCommunityVersion; delete r.pelagicEverOccupied;
  const before = structuredClone(r.agents), initial = r.basicNetwork.ledger.externalInput;
  assert.ok(model._supplementPelagicRegion(r));
  const added = r.agents.filter(a => a.speciesId === 'yellowtail-fusilier');
  assert.ok(added.length >= 4, 'eligible sparse owner receives an actual school');
  assert.deepEqual(r.agents.filter(a => a.speciesId !== 'yellowtail-fusilier'), before);
  assert.ok(added.every(a => a.organicUnits === .004 && a.organicDeathRecorded === false));
  close(r.basicNetwork.ledger.externalInput - initial - added.length * .004); close(livingNetworkBalance(r));
  assert.ok(validateLivingNetworkRecord(r));
});
