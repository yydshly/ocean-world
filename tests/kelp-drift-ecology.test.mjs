import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { KelpSimulation } from '../src/kelpSimulation.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { feedKelpDrift, kelpDriftBalanceError } from '../src/kelpDriftEcology.js';
import { kelpDriftContact, kelpDriftFootprint, kelpDriftUrchinMouthWorld } from '../src/kelpDriftGeometry.js';

const clone = value => structuredClone(value);
const baseline = JSON.parse(fs.readFileSync(new URL('../output/validation/kelp-drift-default-before.json', import.meta.url), 'utf8'));
const serializableState = sim => clone(Object.fromEntries(Object.entries(sim).filter(([, value]) => typeof value !== 'function')
  .map(([key, value]) => [key, value instanceof Map ? [...value] : value])));
const start = { x: 259, z: 3 }, away = { x: 963, z: -315 }, world = 'kelp-ecology-v1:string:42';
const REPLAY_SECONDS = 600;
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => ecology._record(region));
const driftKeys = ['driftCommunityVersion', 'driftPatches', 'driftLedger'];
const withoutDrift = record => { const copy = clone(record); for (const key of driftKeys) delete copy[key]; return copy; };
function memoryStore() {
  const records = new Map();
  return { available: true, records, load: async (namespace, id) => clone(records.get(`${namespace}|${id}`) ?? null),
    async saveMany(namespace, entries) { for (const [id, state] of entries) records.set(`${namespace}|${id}`, clone(state)); },
    async clear(namespace) { for (const key of records.keys()) if (key.startsWith(`${namespace}|`)) records.delete(key); } };
}
async function model(storage = memoryStore(), seed = '42', position = start) {
  const ecology = new KelpOceanEcology(seed, createKelpOceanGenerator(seed), { store: storage });
  assert.equal(await ecology.update(position), true); return ecology;
}
async function oldWindow() {
  const ecology = await model(), storage = memoryStore();
  for (const record of records(ecology)) storage.records.set(`${world}|${record.id}`, withoutDrift(record));
  return { ecology, storage };
}
const nativeTotal = sim => ['algae', 'biofilm', 'detritus', 'smallPrey', 'kelpTissue'].reduce((sum, key) => sum + sim.resources[key], 0);

test('three frozen authored seeds retain every serialized initial and ten-second state, Map entry, food, RNG and metric', () => {
  for (const path of ['../src/kelpHabitat.js', '../src/biomes.js']) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(path, import.meta.url))).digest('hex'), baseline.sourceHashes[path]);
  }
  for (const entry of baseline.cases) {
    const sim = new KelpSimulation(entry.seed);
    assert.deepEqual(serializableState(sim), entry.initial); assert.deepEqual(sim.metrics, entry.initialMetrics);
    assert.equal(sim.agents.length, 46); assert.equal(Object.keys(sim.resources).length, 5);
    sim.step(entry.seconds); assert.deepEqual(serializableState(sim), entry.after); assert.deepEqual(sim.metrics, entry.metrics);
  }
});

test('one-time zero-stock drift metadata preserves the whole old record, native deaths, water identities, opaque state and native RNG', async () => {
  const { storage } = await oldWindow();
  const old = clone(storage.records.get(`${world}|3,-1`)); old.archivalMetadata = { retain: 'whole old record', values: [1, 2] };
  old.state.extraLegacyField = { retain: 'unknown native extension' };
  old.state.agents.find(agent => agent.speciesId === 'purple-urchin').alive = false;
  storage.records.set(`${world}|3,-1`, clone(old));
  const ecology = await model(storage), upgraded = ecology._record(ecology._active.get('3,-1'));
  assert.deepEqual(withoutDrift(upgraded), old); assert.equal(upgraded.driftCommunityVersion, 1);
  assert.ok(upgraded.driftPatches.every(patch => patch.stock === 0));
  assert.ok(Object.values(upgraded.driftLedger).every(value => value === 0));
  const paused = records(ecology); ecology.step(0, { currentMps: 1, hour: 0 }); assert.deepEqual(records(ecology), paused);
  await ecology.checkpoint(); assert.deepEqual(storage.records.get(`${world}|3,-1`), upgraded);
  const reopened = await model(storage); assert.deepEqual(records(reopened), records(ecology));
});

test('zero-stock metadata is not public until committed; throwing and null upgrade writes preserve old records for retry', async () => {
  for (const rejection of ['throw', 'null']) {
    const { storage } = await oldWindow(), save = storage.saveMany, original = clone(storage.records.get(`${world}|3,-1`));
    let reject = true;
    storage.saveMany = async (...args) => { if (reject) { if (rejection === 'throw') throw new Error('drift upgrade failed'); return null; } return save(...args); };
    const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: storage });
    assert.equal(await ecology.update(start), false); assert.equal(ecology.agents.length, 0); assert.ok(!ecology._active.has('3,-1'));
    assert.deepEqual(storage.records.get(`${world}|3,-1`), original);
    reject = false; assert.equal(await ecology.update(start), true);
    assert.deepEqual(withoutDrift(ecology._record(ecology._active.get('3,-1'))), original);
  }
  const { storage } = await oldWindow(), save = storage.saveMany; let release, offered;
  storage.saveMany = async (namespace, entries) => {
    if (!offered) { offered = clone(entries); await new Promise(resolve => { release = resolve; }); }
    return save(namespace, entries);
  };
  const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: storage }), pending = ecology.update(start);
  for (let turn = 0; turn < 10 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(offered[0][1].driftCommunityVersion, 1);
  assert.ok(offered[0][1].driftPatches.every(patch => patch.stock === 0));
  assert.equal(ecology._active.size, 0); ecology.step(.1); assert.equal(ecology.agents.length, 0);
  release(); assert.equal(await pending, true);
});

test('sequential legacy stores preserve the original local five-pool model without allocating or sourcing drift', async () => {
  const storage = memoryStore(); delete storage.saveMany;
  storage.save = async (namespace, id, state) => storage.records.set(`${namespace}|${id}`, clone(state));
  const ecology = await model(storage), controls = new Map([...ecology._active.values()].map(region => [region.id, ecology._create(region.cx, region.cz).sim]));
  ecology.step(3, { foodSupply: 0, currentMps: .2, hour: 0 });
  for (const region of ecology._active.values()) {
    const control = controls.get(region.id);
    for (let tick = 0; tick < 30; tick++) {
      for (const key of ['currentMps', 'foodSupply', 'turbidity', 'hour']) control.environment[key] = ecology.environment[key];
      control.step(.1);
    }
    assert.deepEqual(ecology._record(region).state, ecology._record({ ...region, sim: control }).state);
    assert.equal(region.driftCommunityVersion, undefined); assert.equal(Object.keys(region.sim.resources).length, 5);
  }
});

function occupied(ecology) {
  const region = [...ecology._active.values()].find(region => region.driftPatches?.length && region.sim.agents.some(agent => agent.speciesId === 'purple-urchin' && agent.alive));
  assert.ok(region, 'The fixed generated window must contain a supported drift site and an existing urchin.'); return region;
}
function originalControl(ecology, region) {
  return ecology._restore(withoutDrift(ecology._record(region)), region.cx, region.cz).sim;
}
const sumDrift = region => region.driftPatches.reduce((sum, patch) => sum + patch.stock, 0);
function assertBudget(region) {
  close(nativeTotal(region.sim) + sumDrift(region), region.sim.ledger.initial + region.sim.ledger.input - region.sim.ledger.ingested - region.sim.ledger.exported, 1e-8);
  close(sumDrift(region), region.driftLedger.transferredIn - region.driftLedger.ingested - region.driftLedger.returnedToDetritus, 1e-8);
  close(kelpDriftBalanceError(region), 0, 1e-8);
  close(region.sim.metrics.resourceBudgetError, 0, 1e-8);
}

test('original 0.01-per-simulated-day tissue shedding moves into drift, never creates input and never credits detritus twice', async () => {
  const ecology = await model(), region = occupied(ecology), sim = region.sim;
  for (const animal of sim.agents) if (animal.speciesId !== 'giant-kelp') animal.alive = false;
  region.waterAgents.forEach(animal => { animal.alive = false; });
  const control = originalControl(ecology, region), tissueBefore = sim.resources.kelpTissue, ledgerBefore = clone(sim.ledger);
  const admittedHosts = new Set(region.driftPatches.map(patch => patch.hostId));
  const expected = sim.kelpPatches.filter(patch => admittedHosts.has(patch.hostId)).reduce((sum, patch) => sum + patch.kelpTissue * .01 / 86400 * .1, 0);
  ecology.step(.1, { currentMps: 0, foodSupply: 0, hour: 0 });
  Object.assign(control.environment, ecology.environment); control.step(.1);
  close(sumDrift(region), expected, 1e-12); close(region.driftLedger.transferredIn, expected, 1e-12);
  close(sim.resources.kelpTissue, control.resources.kelpTissue, 1e-12);
  close(tissueBefore - sim.resources.kelpTissue, tissueBefore * .01 / 86400 * .1, 1e-12);
  close(control.resources.detritus - sim.resources.detritus, expected, 1e-12);
  assert.equal(sim.ledger.initial, ledgerBefore.initial); assert.equal(sim.ledger.input, control.ledger.input);
  assert.equal(sim.ledger.ingested, control.ledger.ingested); assert.equal(sim.ledger.exported, control.ledger.exported);
  assert.equal(sim._rngState, control._rngState); assertBudget(region);
});

test('a dead host retains the original detritus fallback rather than sourcing an active drift patch or losing its original shedding amount', async () => {
  const ecology = await model(), region = occupied(ecology);
  for (const agent of region.sim.agents) agent.alive = false;
  for (const agent of region.waterAgents) agent.alive = false;
  const control = originalControl(ecology, region);
  ecology.step(.1, { foodSupply: 0, currentMps: 0, hour: 0 }); Object.assign(control.environment, ecology.environment); control.step(.1);
  assert.equal(sumDrift(region), 0); assert.equal(region.driftLedger.transferredIn, 0);
  assert.deepEqual(region.sim.resources, control.resources); assert.deepEqual(region.sim.ledger, control.ledger);
  assertBudget(region);
});

let naturalPromise;
function naturalReplay() {
  return naturalPromise ??= (async () => {
    const ecology = await model(), first = new Map(), initial = new Map();
    for (const region of ecology._active.values()) for (const agent of region.sim.agents.filter(agent => agent.speciesId === 'purple-urchin')) initial.set(agent.id, clone(agent.position));
    // This is one finite generated replay, never a route or spawn tuning loop.
    for (let tick = 0; tick < REPLAY_SECONDS * 10; tick++) {
      const before = new Map([...ecology._active.values()].flatMap(region => region.sim.agents.filter(agent => agent.speciesId === 'purple-urchin').map(agent => [agent.id, clone(agent.position)])));
      ecology.step(.1, { foodSupply: 0, hour: 0 });
      for (const region of ecology._active.values()) {
        assertBudget(region);
        for (const urchin of region.sim.agents.filter(agent => agent.speciesId === 'purple-urchin' && agent.alive)) {
          const old = before.get(urchin.id), travel = Math.hypot(urchin.position.x - old.x, urchin.position.y - old.y, urchin.position.z - old.z);
          assert.ok(travel <= .00006 + 1e-10, `Old full XYZ crawl budget exceeded: ${travel}`);
          close(urchin.position.y, ecology.generator.heightAt(urchin.position.x, urchin.position.z) + .003, 1e-8);
          assert.ok(region.sim.rockHeight(urchin.rockIndex, urchin.position.x, urchin.position.z) >= ecology.generator.heightAt(urchin.position.x, urchin.position.z) - 1e-8);
          assert.equal(Math.floor(urchin.position.x / 64), region.cx); assert.equal(Math.floor(urchin.position.z / 64), region.cz);
          if (urchin.lastDriftIntake && !first.has(urchin.id)) first.set(urchin.id, ecology._record(region));
        }
      }
    }
    await ecology.checkpoint(); return { ecology, first, initial };
  })();
}

test('ordinary generated steps shed finite tissue and existing urchins reach actual same-rock drift, debit stock and retain all five-pool accounting', async () => {
  const { ecology, first } = await naturalReplay();
  assert.ok(first.size > 0, `A normally generated existing urchin must feed on real shed stock within ${REPLAY_SECONDS} explicit model seconds.`);
  for (const record of first.values()) {
    assert.ok(record.driftLedger.ingested > 0); assert.ok(record.driftLedger.transferredIn >= record.driftLedger.ingested);
    const feeder = record.state.agents.find(agent => agent.lastDriftIntake);
    assert.ok(feeder.alive); assert.equal(feeder.speciesId, 'purple-urchin');
    assert.ok(feeder.lastFeedAt > 0 && feeder.lastFeedAt <= REPLAY_SECONDS);
    assert.equal(record.state._ticks * .1, record.state.timeSec);
    assert.ok(record.driftPatches.every(patch => patch.stock >= 0));
  }
  for (const region of ecology._active.values()) {
    assertBudget(region); assert.equal(region.sim.ledger.input, 0);
    assert.ok(region.sim.agents.filter(agent => agent.speciesId === 'giant-kelp').every(plant => plant.sizeM === plant.initialSizeM));
  }
});

test('paired five-pool and drift records pause, checkpoint, freeze during failed unload, revisit and reopen with an identical next step', async () => {
  const replay = await naturalReplay(), storage = memoryStore();
  for (const [key, record] of replay.ecology.store.records) storage.records.set(key, clone(record));
  const ecology = await model(storage), paused = records(ecology); ecology.step(0, { foodSupply: 3, hour: 12 }); assert.deepEqual(records(ecology), paused);
  const queued = ecology.checkpoint(); ecology.step(.1, { foodSupply: 0, hour: 0 }); const current = records(ecology); await queued;
  for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  const save = storage.saveMany; let release, offered;
  storage.saveMany = (namespace, entries) => { offered = clone(entries); return new Promise(resolve => { release = resolve; }); };
  const pending = ecology.update(away); for (let turn = 0; turn < 10 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(offered.length, 9); assert.equal(ecology._locked.size, 9);
  ecology.step(1); assert.deepEqual(records(ecology), current);
  assert.ok(offered.every(([, record]) => record.driftCommunityVersion === 1 && record.state.ledger));
  release(null); assert.equal(await pending, false); assert.deepEqual(records(ecology), current); assert.equal(ecology._locked.size, 0);
  for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  storage.saveMany = save; assert.equal(await ecology.update(away), true); ecology.step(2, { foodSupply: 0, hour: 0 });
  for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  assert.equal(await ecology.update(start), true); assert.deepEqual(records(ecology), current);
  const reopened = await model(storage); assert.deepEqual(records(ecology), records(reopened));
  ecology.step(.1, { foodSupply: 0, hour: 0 }); reopened.step(.1, { foodSupply: 0, hour: 0 }); assert.deepEqual(records(ecology), records(reopened));
});

test('malformed stock, support, host, owner, duplicates and drift ledger reject restoration without regenerating native or drift state', async () => {
  const replay = await naturalReplay(), source = [...replay.ecology._active.values()].find(region => region.sim.agents.some(agent => agent.lastDriftIntake));
  assert.ok(source); const original = replay.ecology._record(source);
  const mutations = [
    row => { row.driftPatches[0].stock = -1; },
    row => { row.driftPatches[0].position.y += .1; },
    row => { row.driftPatches[0].position.x += 128; },
    row => { row.driftPatches[0].hostId = 'absent-host'; },
    row => { row.driftPatches.push(clone(row.driftPatches[0])); },
    row => { row.driftLedger.transferredIn += .01; },
    row => { row.driftCommunityVersion = 99; },
    row => {
      const intake = row.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake;
      intake.mouthPosition = clone(intake.foodPosition); intake.contactDistanceM = 0;
    },
  ];
  for (const mutate of mutations) {
    const corrupt = clone(original); mutate(corrupt); const storage = memoryStore();
    for (const [key, record] of replay.ecology.store.records) storage.records.set(key, clone(record));
    storage.records.set(`${world}|${original.id}`, corrupt);
    const ecology = new KelpOceanEcology('42', replay.ecology.generator, { store: storage });
    assert.equal(await ecology.update(start), false); assert.ok(!ecology._active.has(original.id)); assert.equal(ecology._counts.generated, 0);
    assert.deepEqual(storage.records.get(`${world}|${original.id}`), corrupt);
    storage.records.set(`${world}|${original.id}`, clone(original)); assert.equal(await ecology.update(start), true);
    assert.deepEqual(ecology._record(ecology._active.get(original.id)), original);
  }
});

async function fedFixture() {
  const replay = await naturalReplay();
  const original = [...replay.ecology._active.values()].find(region => region.sim.agents.some(agent => agent.lastDriftIntake));
  assert.ok(original, 'The finite actual replay must provide a successful contact fixture.');
  const region = replay.ecology._restore(replay.ecology._record(original), original.cx, original.cz);
  const agent = region.sim.agents.find(agent => agent.lastDriftIntake);
  const patch = region.driftPatches.find(patch => patch.id === agent.lastDriftIntake.patchId);
  assert.ok(patch); agent.nextBite = region.sim.timeSec;
  return { ...replay, region, agent, patch };
}

test('actual oral contact moves only available local drift into the original intake ledger; body overlap, wrong rocks and dead or empty food cannot feed', async () => {
  const good = await fedFixture(), { region, agent, patch, ecology } = good;
  const contact = kelpDriftContact(agent, patch, ecology.generator);
  assert.ok(contact.distanceM <= .004 + 1e-10); assert.ok(patch.stock > 0);
  const before = { stock: patch.stock, energy: agent.energy, native: clone(region.sim.ledger), drift: clone(region.driftLedger), tissue: region.sim.resources.kelpTissue, rng: region.sim._rngState };
  const taken = feedKelpDrift(region.sim, agent, patch, region, .1, ecology.generator);
  assert.ok(taken > 0 && taken <= before.stock && taken <= .0009);
  close(patch.stock, before.stock - taken, 1e-12); close(agent.energy, before.energy + taken * 1.8, 1e-12);
  close(region.sim.ledger.ingested - before.native.ingested, taken, 1e-12);
  close(region.driftLedger.ingested - before.drift.ingested, taken, 1e-12);
  assert.equal(region.sim.ledger.input, before.native.input); assert.equal(region.sim.ledger.initial, before.native.initial);
  assert.equal(region.sim.resources.kelpTissue, before.tissue); assert.equal(region.sim._rngState, before.rng);
  assert.equal(agent.lastFeedAt, region.sim.timeSec); assertBudget(region);
  for (const mode of ['remote-mouth', 'unsupported-mouth', 'wrong-rock', 'dead', 'empty', 'nonmember', 'future-bite']) {
    const f = await fedFixture();
    if (mode === 'remote-mouth') {
      const direction = Math.atan2(f.agent.position.z - f.patch.position.z, f.agent.position.x - f.patch.position.x);
      f.agent.position.x += Math.cos(direction) * .012; f.agent.position.z += Math.sin(direction) * .012;
      f.agent.position.y = f.ecology.generator.heightAt(f.agent.position.x, f.agent.position.z) + .003;
      assert.ok(kelpDriftContact(f.agent, f.patch, f.ecology.generator).distanceM > .004);
      assert.ok(Math.hypot(f.agent.position.x - f.patch.position.x, f.agent.position.z - f.patch.position.z) < .032 + f.agent.sizeM / 2);
    }
    if (mode === 'unsupported-mouth') {
      const food = kelpDriftFootprint(f.patch, f.ecology.generator).center;
      f.agent.position = { x: food.x, y: food.y - f.agent.sizeM * .030, z: food.z };
      f.agent.supportNormal = { x: 0, y: 1, z: 0 };
      assert.ok(kelpDriftContact(f.agent, f.patch, f.ecology.generator).distanceM <= .004);
      assert.ok(f.agent.position.y < f.ecology.generator.heightAt(f.agent.position.x, f.agent.position.z) + .003);
    }
    if (mode === 'wrong-rock') f.patch.rockIndex = f.agent.rockIndex + 1;
    if (mode === 'dead') f.agent.alive = false;
    if (mode === 'empty') { f.region.driftLedger.returnedToDetritus += f.patch.stock; f.patch.returnedToDetritus += f.patch.stock; f.patch.stock = 0; }
    if (mode === 'nonmember') f.patch = clone(f.patch);
    if (mode === 'future-bite') f.agent.nextBite = f.region.sim.timeSec + 1;
    const state = clone({ agent: f.agent, patch: f.patch, native: f.region.sim.ledger, drift: f.region.driftLedger });
    assert.equal(feedKelpDrift(f.region.sim, f.agent, f.patch, f.region, .1, f.ecology.generator), 0, mode);
    assert.deepEqual({ agent: f.agent, patch: f.patch, native: f.region.sim.ledger, drift: f.region.driftLedger }, state);
  }
});
