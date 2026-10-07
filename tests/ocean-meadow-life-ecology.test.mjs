import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { validateOceanBiodiversityRecord } from '../src/oceanBiodiversity.js';
import { validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { OCEAN_MEADOW_LIFE_IDS, isOceanMeadowLifeAgent, oceanMeadowLifePositionValid,
  validateOceanMeadowLifeRecord } from '../src/oceanMeadowLife.js';
import { oceanMeadowLifeSpeciesCatalog, oceanMeadowLifeSpeciesById } from '../src/oceanMeadowLifeSpecies.js';

const seed = livingShallowsSeed('42'), at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Finite native geometry scan qualified these locations; production birth still
// has its original animals, occupancy, descriptor plans and original food stocks.
const windows = [at(194, 20), at(188, 14)], opening = windows[0], far = at(-38, 25);
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const newAnimals = row => row.agents.filter(isOceanMeadowLifeAgent);
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));

class MemoryStore {
  available = true; records = new Map(); commits = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('meadow-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.commits.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), meadowLife = true) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  // Match the actual living-shallows ReefWorld constructor, including the
  // explicitly disabled authored-world overlays and both previous animal packs.
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    sceneElements: false, habitatScenes: false, macroLandscape: false,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, biodiversity: true, benthicLife: true, meadowLife });
  return { base, generator, model, store };
}
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false),
    bed: (x, z) => f.model._bed(x, z), capacity: 20 };
}
function balances(row) {
  return { organic: livingNetworkBalance(row),
    food: row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus };
}
function rawStocks(row) { return { ...clone(row.resources), reefGuildAnimalNutrition: row.reefGuild.preyOrganicUnits,
  openWaterAnimalNutrition: row.openWaterLife.preyOrganicUnits, plants: row.basicNetwork.plantOrganicUnits,
  coral: row.basicNetwork.coralOrganicUnits, nutrients: row.basicNetwork.nutrients }; }
function bounded(f) {
  assert.equal(f.model._active.size, 9); assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, row.id);
    assert.ok(validateLivingNetworkRecord(row), row.id);
    for (const [name, error] of Object.entries(balances(row))) close(error, `${row.id} ${name} balance`);
    if (row.biodiversityVersion !== undefined) assert.ok(validateOceanBiodiversityRecord(row, f.generator, supports(f)), row.id);
    if (row.benthicLifeVersion !== undefined) assert.ok(validateOceanBenthicLifeRecord(row, f.generator, supports(f)), row.id);
    if (row.meadowLifeVersion !== undefined) {
      assert.equal(row.meadowLifeVersion, 1); assert.ok(newAnimals(row).length <= 4);
      assert.ok(validateOceanMeadowLifeRecord(row, f.generator, supports(f)), row.id);
      for (const agent of newAnimals(row)) assert.ok(oceanMeadowLifePositionValid(row, f.generator, agent, agent.position, supports(f)), agent.id);
    }
  }
}
function killActual(row, meadow = true) {
  const agent = row.agents.find(a => a.alive && isOceanMeadowLifeAgent(a) === meadow);
  assert.ok(agent); agent.alive = false; agent.energy = 0; agent.state = 'dead';
  agent.stateSince = meadow ? agent.timeSec : row.timeSec; agent.velocity = { x: 0, y: 0, z: 0 };
  recordLivingDeath(row, agent); row.counters.deaths++;
  if (meadow) row.meadowLife.counters.deaths++;
  return agent.id;
}
// Observe production writes without changing values, deadlines or random input.
// The native event is pushed after its raw debit and organic material transfer;
// the last write to that same pool proves the removed quantity of that bite.
function observeNativeDebits(row, traces) {
  const lastWrites = new Map(), cleanup = [];
  for (const [pool, object, key] of [['algae', row.resources, 'algae'], ['plankton', row.resources, 'plankton'],
    ['reefGuild.preyOrganicUnits', row.reefGuild, 'preyOrganicUnits']]) {
    let value = object[key];
    Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value,
      set: next => { lastWrites.set(pool, { stockBefore: value, stockAfter: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value }));
  }
  const events = row.meadowLife.events;
  Object.defineProperty(events, 'push', { configurable: true, enumerable: false, value: function (...entries) {
    for (const entry of entries) {
      const agent = row.agents.find(a => a.id === entry.agentId), debit = lastWrites.get(entry.pool);
      assert.ok(agent && debit); close(debit.stockBefore - debit.stockAfter - entry.removedUnits, 'actual native bite debit');
      const expected = ['sand-edge-seahorse', 'reef-cuttlefish'].includes(agent.speciesId) ? 'reefGuild.preyOrganicUnits' :
        agent.speciesId === 'barrel-sea-pen' ? 'plankton' : 'algae';
      assert.equal(entry.pool, expected); assert.ok(debit.stockBefore > 0);
      close(livingNetworkBalance(row), 'organic balance immediately after real bite');
      traces.push({ owner: row.id, speciesId: agent.speciesId, ...clone(entry), ...debit,
        individualOrganicUnits: agent.organicUnits, regionalClockSec: row.timeSec, organicBalanceError: livingNetworkBalance(row) });
    }
    return Array.prototype.push.apply(this, entries);
  } });
  cleanup.push(() => delete events.push);
  return () => cleanup.forEach(done => done());
}

let samplePromise, oldBirthPromise;
async function oldBirth() {
  oldBirthPromise ??= (async () => { const f = fixture(new MemoryStore(), false);
    assert.notEqual(await f.model.update(opening), false); return capture(f.store.records); })();
  return clone(await oldBirthPromise);
}
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), initial = new Map(), union = new Set(), fed = new Set(), moved = new Set(), active = new Set();
    const owners = [], windowActivity = [];
    for (const position of windows) {
      f.store.reads.length = 0; assert.notEqual(await f.model.update(position), false); bounded(f);
      const before = new Map(), traces = [], cleanups = [];
      const offscreen = [...f.store.records].filter(([, row]) => !f.model._active.has(row.id)).map(([id, row]) => [id, clone(row)]);
      for (const [id, row] of f.model._active) {
        if (!initial.has(`${f.model._world}|${id}`)) initial.set(`${f.model._world}|${id}`, clone(row));
        assert.equal(row.timeSec, 0); assert.equal(row.meadowLifeVersion, 1); assert.equal(row.meadowLife.lastTickSec, 0);
        assert.equal(row.meadowLife.counters.consumedUnits, 0);
        const agents = newAnimals(row); agents.forEach(a => { union.add(a.speciesId); before.set(a.id, clone(a)); });
        owners.push({ id, animalRecordCount: row.agents.length + (row.turtleAgents?.length ?? 0),
          actualHabitatComposition: clone(f.generator.chunk(row.cx, row.cz).habitatComposition), initialStocks: rawStocks(row),
          newAgents: agents.map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM,
            sizeMeasure: oceanMeadowLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
            actualRootDepthM: (f.generator.surfaceY ?? 8) - a.position.y,
            actualSubstrate: f.generator.sample(a.position.x, a.position.z).substrate,
            hostId: a.meadowLifeHostId, mode: a.meadowLifeMode, existingPool: a.meadowLifeFoodPool })) });
        cleanups.push(observeNativeDebits(row, traces));
      }
      const started = performance.now();
      try {
        f.model.step(8, { hour: 0 });
        const nightAt = new Map([...f.model._active.values()].flatMap(newAnimals).map(a => [a.id, a.lastFeedAt]));
        f.model.step(4, { hour: 12 });
        for (const row of f.model._active.values()) for (const a of newAnimals(row)) {
          const old = before.get(a.id); assert.equal(a.timeSec, row.timeSec); assert.equal(row.meadowLife.ticks, row.ticks);
          assert.equal(row.meadowLife.lastTickSec, row.timeSec);
          if (a.timeSec > old.timeSec && (a.energy !== old.energy || a.colonyExtension !== old.colonyExtension)) active.add(a.speciesId);
          if (a.lastFeedAt !== null) fed.add(a.speciesId);
          if (Math.hypot(a.position.x - old.position.x, a.position.y - old.position.y, a.position.z - old.position.z) > 1e-8) moved.add(a.speciesId);
          if (a.speciesId === 'sand-edge-seahorse' || a.speciesId === 'barrel-sea-pen') assert.deepEqual(a.position, old.position);
          if (a.speciesId === 'barrel-sea-pen') { assert.equal(a.lastFeedAt, nightAt.get(a.id)); assert.equal(a.colonyExtension, 0); }
        }
      } finally { cleanups.forEach(done => done()); }
      await f.model.checkpoint(); bounded(f);
      for (const [id, row] of offscreen) assert.deepEqual(f.store.records.get(id), row, 'offscreen records and clocks freeze');
      windowActivity.push({ position, simulatedNightSec: 8, simulatedDaySec: 4, observedSec: 12,
        actualCpuWallTimeMs: performance.now() - started, activeOwnerCount: f.model._active.size,
        sourceOwnerCount: f.generator.registryStats().size, supportOwnerCount: f.model._supportCells.size,
        newAnimalCount: before.size, actualFeedings: traces.length, nativeIntakeTraces: traces,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, clockSec: row.timeSec, ticks: row.ticks,
          newClock: { ticks: row.meadowLife.ticks, lastTickSec: row.meadowLife.lastTickSec }, finalStocks: rawStocks(row),
          foodLedger: clone(row.ledger), organicLedger: clone(row.basicNetwork.ledger), balanceErrors: balances(row),
          newCounters: clone(row.meadowLife.counters),
          agents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, alive: a.alive, state: a.state,
            timeSec: a.timeSec, organicUnits: a.organicUnits, energy: a.energy, lastFeedAt: a.lastFeedAt, position: clone(a.position) })) })) });
    }
    const births = owners.flatMap(row => row.newAgents), final = windowActivity.flatMap(window => window.owners.flatMap(row => row.agents));
    const intake = windowActivity.flatMap(window => window.nativeIntakeTraces), birthById = new Map(births.map(a => [a.id, a]));
    const countsBySpecies = Object.fromEntries(OCEAN_MEADOW_LIFE_IDS.map(id => [id, {
      bornIndividuals: births.filter(a => a.speciesId === id).length,
      aliveAfterObservation: final.filter(a => a.speciesId === id && a.alive).length,
      nativeClockObservedIndividuals: final.filter(a => a.speciesId === id && a.timeSec > 0).length,
      fedIndividuals: new Set(intake.filter(e => e.speciesId === id).map(e => e.agentId)).size,
      successfulBites: intake.filter(e => e.speciesId === id).length,
      movedIndividuals: final.filter(a => { const b = birthById.get(a.id); return a.speciesId === id &&
        Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) > 1e-8; }).length,
    }]));
    return { initial: capture(initial), windows, union: [...union], fed: [...fed], moved: [...moved], active: [...active], countsBySpecies, owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary production windows admit four sourced forms, run native clocks and debit existing local stocks with balanced material', async () => {
  const actual = await sample(), { initial, ...evidence } = actual;
  assert.deepEqual(new Set(actual.union), new Set(OCEAN_MEADOW_LIFE_IDS));
  assert.deepEqual(new Set(actual.fed), new Set(OCEAN_MEADOW_LIFE_IDS));
  assert.deepEqual(new Set(actual.active), new Set(OCEAN_MEADOW_LIFE_IDS));
  assert.deepEqual(new Set(actual.moved), new Set(['reef-cuttlefish', 'spider-conch']));
  assert.ok(actual.owners.some(row => row.newAgents.length < 4), 'actual habitats do not force the complete checklist');
  if (process.env.OCEAN_MEADOW_LIFE_RECEIPT) await writeFile(process.env.OCEAN_MEADOW_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'finite actual CPU production generation, stocks, native intake writes and persistence; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalRecordLimit: 4,
      sourceSpecies: oceanMeadowLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName,
        identityLevel: s.identityLevel, sizeMeasure: s.sizeMeasure, selectedDepthM: s.depthSelectionM, sourceLinks: s.sourceLinks })),
      ...evidence }, null, 2)}\n`);
});

test('death and naturally absent species categories freeze through unload, revisit and cold restore without refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.notEqual(await f.model.update(opening), false);
  f.model.step(.4, { hour: 0 });
  const row = [...f.model._active.values()].find(r => newAnimals(r).some(a => a.alive)); assert.ok(row);
  const deadId = killActual(row), originalIds = newAnimals(row).map(a => a.id);
  row.historyExtension = { evidence: ['visited', 'meadow-death'], retained: 17 };
  await f.model.checkpoint(); bounded(f); const before = capture(f.model._active), ids = [...f.model._active.keys()];
  assert.notEqual(await f.model.update(far), false); assert.ok(ids.every(id => !f.model._active.has(id)));
  assert.notEqual(await f.model.update(opening), false); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); assert.notEqual(await cold.model.update(opening), false);
  assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.deepEqual(newAnimals(cold.model._active.get(row.id)).map(a => a.id), originalIds);
  const dead = clone(cold.model._active.get(row.id).agents.find(a => a.id === deadId)); cold.model.step(.1, { hour: 0 });
  assert.deepEqual(cold.model._active.get(row.id).agents.find(a => a.id === deadId), dead);
  assert.equal(cold.model.agents.find(a => a.id === deadId).timeSec, dead.timeSec);
  assert.equal(cold.model.snapshot().agents.find(a => a.id === deadId).timeSec, dead.timeSec);
  const empty = data.initial.find(([, r]) => r.meadowLifeVersion === 1 &&
    OCEAN_MEADOW_LIFE_IDS.some(id => !newAnimals(r).some(a => a.speciesId === id)))?.[1];
  assert.ok(empty, 'a naturally absent species category is retained without requiring a zero-animal owner in these samples');
  const absent = OCEAN_MEADOW_LIFE_IDS.filter(id => !newAnimals(empty).some(a => a.speciesId === id));
  const emptyCold = fixture(fromRecords(data.initial)); assert.notEqual(await emptyCold.model.update(at(empty.cx, empty.cz)), false);
  assert.deepEqual(emptyCold.model._active.get(empty.id), empty);
  assert.ok(absent.every(id => !newAnimals(emptyCold.model._active.get(empty.id)).some(a => a.speciesId === id)));
});

test('turning on the package preserves whole old records, paused clocks and the exact next native step', async () => {
  const old = fixture(fromRecords(await oldBirth()), false); assert.notEqual(await old.model.update(opening), false);
  old.model.step(.4, { hour: 0 });
  const row = [...old.model._active.values()].find(r => r.agents.some(a => a.alive)); killActual(row, false);
  row.historyExtension = { retainedPreviousPackages: true, lineage: [11, 4] }; await old.model.checkpoint();
  const saved = capture(old.store.records), enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.notEqual(await enabled.model.update(opening), false); assert.notEqual(await disabled.model.update(opening), false);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.deepEqual(capture(enabled.store.records), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.meadowLifeVersion === undefined && newAnimals(r).length === 0));
  enabled.model.step(0, { hour: 0 }); assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  for (const dt of [.1, .2]) { enabled.model.step(dt, { hour: 0 }); disabled.model.step(dt, { hour: 0 }); }
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); bounded(enabled); bounded(disabled);
});

test('strict-null pending or refused births expose no actors or scenery before the exact atomic commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.meadowLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('atomic meadow births were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.model.scenery.length, 0);
    assert.equal(store.records.size, 0); assert.ok(offered.some(([, row]) => newAnimals(row).length > 0));
    for (const [, row] of offered) if (row.meadowLifeVersion === 1) {
      assert.equal(row.timeSec, 0); assert.equal(row.meadowLifeInitializedAtSec, 0); assert.equal(row.meadowLife.lastTickSec, 0);
    }
  } finally { permit.resolve(); assert.notEqual(await pending, false); }
  bounded(f);
  for (const [id, row] of f.model._active) assert.deepEqual(row, store.records.get(`${f.model._world}|${id}`));
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.model.scenery.length, 0); assert.equal(failed.records.size, 0);
  }
});

test('undefined and thrown historical reads are refused rather than treated as fresh null owners', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => {
      if (failure === 'throw') throw new Error('historical read failed'); return undefined;
    };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.model.scenery.length, 0); assert.equal(store.records.size, 0);
  }
});

test('offscreen prefix, host, individual and complete old-community corruption reject without replacing historical records', async () => {
  const data = await sample(), old = await oldBirth(), activeIds = ownerWindow(opening);
  const candidates = data.initial.filter(([, row]) => activeIds.has(row.id) && newAnimals(row).length > 0);
  assert.ok(candidates.length);
  const damageCases = [
    ['descriptor', row => delete row.meadowLife],
    ['individual', row => delete newAnimals(row)[0].meadowLifeIndividualVersion],
    ['host', row => { newAnimals(row)[0].meadowLifeHostId = 'missing-native-host'; }],
    ['baseline-version', row => { row.communityVersion = -1; }],
    ['old-agent', row => { row.agents.find(a => !isOceanMeadowLifeAgent(a)).speciesId = 'not-a-sourced-species'; }],
    ['guild', row => { delete row.reefGuildVersion; }],
    ['open-water', row => { delete row.openWaterLife; }],
    ['owner-prefix-only', row => { row.meadowLifeUnexpected = true; }, true],
    ['old-individual-prefix', row => { row.agents[0].meadowLifeUnexpected = true; }, true],
  ];
  for (const [label, damage, legacy] of damageCases) {
    const store = fromRecords(legacy ? old : data.initial), f = fixture(store);
    const targetId = candidates[0][1].id, row = [...store.records.values()].find(r => r.id === targetId);
    assert.ok(row); damage(row);
    const position = at(row.cx - 2, row.cz); assert.equal(ownerWindow(position).has(row.id), false, 'damaged owner is offscreen support');
    const before = capture(store.records); await assert.rejects(f.model.update(position), /Invalid saved/, label);
    assert.deepEqual(capture(store.records), before, label); assert.equal(f.model._active.has(row.id), false);
    for (const [id, neighbour] of f.model._active) assert.deepEqual(neighbour, store.records.get(`${f.model._world}|${id}`), label);
  }
});
