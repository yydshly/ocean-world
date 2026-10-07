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
import { validateOceanMeadowLifeRecord } from '../src/oceanMeadowLife.js';
import { OCEAN_SHOAL_LIFE_IDS, isOceanShoalLifeAgent, oceanShoalLifePositionValid,
  validateOceanShoalLifeRecord } from '../src/oceanShoalLife.js';
import { oceanShoalLifeSpeciesCatalog, oceanShoalLifeSpeciesById } from '../src/oceanShoalLifeSpecies.js';

const seed = livingShallowsSeed('42'), at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// These are ordinary native generation windows, not authored animal fixtures.
// All production flags, pre-existing animals and unchanged food pools are used.
const windows = [at(205, 20), at(188, 14)], opening = windows[0], far = at(-38, 25);
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const newAnimals = row => row.agents.filter(isOceanShoalLifeAgent);
const ownerWindow = point => new Set([-1, 0, 1].flatMap(dz => [-1, 0, 1].map(dx =>
  `${Math.floor(point.x / 64) + dx},${Math.floor(point.z / 64) + dz}`)));

class MemoryStore {
  available = true; records = new Map(); commits = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('shoal-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.commits.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), shoalLife = true) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    sceneElements: false, habitatScenes: false, macroLandscape: false,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife });
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
    if (row.meadowLifeVersion !== undefined) assert.ok(validateOceanMeadowLifeRecord(row, f.generator, supports(f)), row.id);
    if (row.shoalLifeVersion !== undefined) {
      assert.equal(row.shoalLifeVersion, 1); assert.ok(newAnimals(row).length <= 8);
      assert.ok(validateOceanShoalLifeRecord(row, f.generator, supports(f)), row.id);
      const school = row.shoalLife.school;
      if (school) {
        assert.ok(school.memberIds.length >= 5 && school.memberIds.length <= 7);
        assert.equal(new Set(school.memberIds).size, school.memberIds.length);
        const members = school.memberIds.map(id => row.agents.find(a => a.id === id));
        assert.ok(members.every(a => a && a.speciesId === school.speciesId));
        assert.equal(new Set(members).size, members.length, 'independent agent objects');
      } else assert.equal(newAnimals(row).length, 0);
      for (const a of newAnimals(row)) assert.ok(oceanShoalLifePositionValid(row, f.generator, a, a.position, supports(f)), a.id);
    }
  }
}
// Observe writes without changing random choices, food or timing. The events
// occur after native ingestion, so the pool's last write is the actual debit.
function observeNativeDebits(row, traces) {
  const lastWrites = new Map(), organicWrites = new Map(), cleanup = [];
  for (const [pool, object, key] of [['plankton', row.resources, 'plankton'],
    ['openWaterLife.preyOrganicUnits', row.openWaterLife, 'preyOrganicUnits']]) {
    let value = object[key];
    Object.defineProperty(object, key, { configurable: true, enumerable: true, get: () => value,
      set: next => { lastWrites.set(pool, { stockBefore: value, stockAfter: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value }));
  }
  for (const a of newAnimals(row)) {
    let value = a.organicUnits;
    Object.defineProperty(a, 'organicUnits', { configurable: true, enumerable: true, get: () => value,
      set: next => { organicWrites.set(a.id, { individualOrganicBefore: value, individualOrganicAfter: next }); value = next; } });
    cleanup.push(() => Object.defineProperty(a, 'organicUnits', { configurable: true, enumerable: true, writable: true, value }));
  }
  const events = row.shoalLife.events;
  Object.defineProperty(events, 'push', { configurable: true, enumerable: false, value: function (...entries) {
    for (const e of entries) {
      const a = row.agents.find(a => a.id === e.agentId), debit = lastWrites.get(e.pool), organic = organicWrites.get(a?.id);
      assert.ok(a && debit && organic); close(debit.stockBefore - debit.stockAfter - e.removedUnits, 'native individual food debit');
      assert.equal(e.pool, a.shoalLifeFoodPool); assert.ok(debit.stockBefore > 0);
      assert.ok(organic.individualOrganicAfter > organic.individualOrganicBefore, 'the real consumer retains material');
      assert.equal(a.lastFeedAt, row.timeSec); assert.equal(a.timeSec, row.timeSec);
      close(livingNetworkBalance(row), 'owner organic balance immediately after actual bite');
      traces.push({ owner: row.id, speciesId: a.speciesId, ...clone(e), ...debit, ...organic,
        individualClockSec: a.timeSec, regionalClockSec: row.timeSec, organicBalanceError: livingNetworkBalance(row) });
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
    const f = fixture(), initial = new Map(), union = new Set(), owners = [], windowActivity = [];
    for (const position of windows) {
      assert.notEqual(await f.model.update(position), false); bounded(f);
      const before = new Map(), traces = [], cleanups = [];
      const offscreen = [...f.store.records].filter(([, row]) => !f.model._active.has(row.id)).map(([id, row]) => [id, clone(row)]);
      for (const [id, row] of f.model._active) {
        assert.equal(row.timeSec, 0); assert.equal(row.shoalLifeVersion, 1); assert.equal(row.shoalLife.lastTickSec, 0);
        assert.equal(row.shoalLife.counters.consumedUnits, 0);
        if (!initial.has(`${f.model._world}|${id}`)) initial.set(`${f.model._world}|${id}`, clone(row));
        const animals = newAnimals(row); animals.forEach(a => { union.add(a.speciesId); before.set(a.id, clone(a)); });
        owners.push({ id, role: row.shoalLife.role, animalRecordCount: row.agents.length + (row.turtleAgents?.length ?? 0),
          actualHabitatComposition: clone(f.generator.chunk(row.cx, row.cz).habitatComposition), initialStocks: rawStocks(row),
          roster: clone(row.shoalLife.school?.memberIds ?? []), newAgents: animals.map(a => ({ id: a.id, speciesId: a.speciesId,
            sizeM: a.sizeM, sizeMeasure: oceanShoalLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
            actualRootDepthM: (f.generator.surfaceY ?? 8) - a.position.y, individualOrganicUnits: a.organicUnits,
            groupId: a.shoalLifeGroupId, slot: a.shoalLifeSlot, existingPool: a.shoalLifeFoodPool })) });
        cleanups.push(observeNativeDebits(row, traces));
      }
      const started = performance.now();
      try { f.model.step(4, { hour: 12 }); } finally { cleanups.forEach(done => done()); }
      bounded(f); await f.model.checkpoint();
      for (const [id, row] of offscreen) assert.deepEqual(f.store.records.get(id), row, 'offscreen complete records and clocks freeze');
      for (const row of f.model._active.values()) for (const a of newAnimals(row)) {
        assert.equal(a.timeSec, row.timeSec); assert.equal(row.shoalLife.ticks, row.ticks);
        assert.equal(row.shoalLife.lastTickSec, row.timeSec); assert.equal(a.sizeM, before.get(a.id).sizeM);
      }
      windowActivity.push({ position, observedSec: 4, actualCpuWallTimeMs: performance.now() - started,
        activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.registryStats().size,
        supportOwnerCount: f.model._supportCells.size, newAnimalCount: before.size, actualFeedings: traces.length,
        nativeIntakeTraces: traces, owners: [...f.model._active.values()].map(row => ({ id: row.id, role: row.shoalLife.role,
          clockSec: row.timeSec, ticks: row.ticks, shoalClock: { ticks: row.shoalLife.ticks, lastTickSec: row.shoalLife.lastTickSec },
          finalStocks: rawStocks(row), foodLedger: clone(row.ledger), organicLedger: clone(row.basicNetwork.ledger),
          balanceErrors: balances(row), roster: clone(row.shoalLife.school?.memberIds ?? []), counters: clone(row.shoalLife.counters),
          agents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, alive: a.alive, state: a.state, timeSec: a.timeSec,
            organicUnits: a.organicUnits, energy: a.energy, lastFeedAt: a.lastFeedAt, position: clone(a.position) })) })) });
    }
    const births = owners.flatMap(row => row.newAgents), final = windowActivity.flatMap(window => window.owners.flatMap(row => row.agents));
    const intake = windowActivity.flatMap(window => window.nativeIntakeTraces), birthById = new Map(births.map(a => [a.id, a]));
    const countsBySpecies = Object.fromEntries(OCEAN_SHOAL_LIFE_IDS.map(id => [id, {
      bornIndividuals: births.filter(a => a.speciesId === id).length,
      aliveAfterObservation: final.filter(a => a.speciesId === id && a.alive).length,
      nativeClockObservedIndividuals: final.filter(a => a.speciesId === id && a.timeSec > 0).length,
      fedIndividuals: new Set(intake.filter(e => e.speciesId === id).map(e => e.agentId)).size,
      successfulBites: intake.filter(e => e.speciesId === id).length,
      movedIndividuals: final.filter(a => { const b = birthById.get(a.id); return a.speciesId === id &&
        Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) > 1e-8; }).length,
    }]));
    return { initial: capture(initial), windows, union: [...union], countsBySpecies, owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary production windows admit four sourced forms as independent actors, native clocks and balanced existing-stock bites', async () => {
  const actual = await sample(), { initial, ...evidence } = actual;
  assert.deepEqual(new Set(actual.union), new Set(OCEAN_SHOAL_LIFE_IDS));
  const ids = actual.owners.flatMap(row => row.newAgents.map(a => a.id)); assert.equal(new Set(ids).size, ids.length);
  for (const id of OCEAN_SHOAL_LIFE_IDS) {
    assert.ok(actual.countsBySpecies[id].bornIndividuals > 0, id);
    assert.ok(actual.countsBySpecies[id].fedIndividuals > 0, id);
    assert.ok(actual.countsBySpecies[id].movedIndividuals > 0, id);
  }
  assert.ok(actual.owners.some(row => row.newAgents.length === 0 && row.role === false), 'naturally empty roles are retained');
  assert.ok(actual.owners.every(row => new Set(row.newAgents.map(a => a.speciesId)).size <= 2), 'one real same-species school, optional shark');
  if (process.env.OCEAN_SHOAL_LIFE_RECEIPT) await writeFile(process.env.OCEAN_SHOAL_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'finite actual CPU production generation, independent animals, stocks, native debit writes and persistence; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalRecordLimit: 8,
      sourceSpecies: oceanShoalLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName,
        identityLevel: s.identityLevel, sizeMeasure: s.sizeMeasure, selectedDepthM: s.depthSelectionM, sourceLinks: s.sourceLinks })),
      ...evidence }, null, 2)}\n`);
});

test('complete dead-school rosters and naturally empty roles freeze through unload, revisit and exact cold restoration without refill', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.notEqual(await f.model.update(opening), false);
  const row = [...f.model._active.values()].find(r => r.shoalLife.school); assert.ok(row);
  const originalRoster = clone(row.shoalLife.school.memberIds), originalIds = newAnimals(row).map(a => a.id);
  for (const id of originalRoster) row.agents.find(a => a.id === id).energy = 0;
  f.model.step(.1, { hour: 12 }); assert.equal(row.shoalLife.school.activeLeaderId, null);
  assert.ok(originalRoster.every(id => !row.agents.find(a => a.id === id).alive));
  assert.equal(row.shoalLife.counters.deaths, originalRoster.length); assert.deepEqual(row.shoalLife.school.memberIds, originalRoster);
  row.historyExtension = { retained: ['independent-roster', 'whole-school-death'], sentinel: 17 };
  await f.model.checkpoint(); bounded(f); const before = capture(f.model._active), ids = [...f.model._active.keys()];
  assert.notEqual(await f.model.update(far), false); assert.ok(ids.every(id => !f.model._active.has(id)));
  assert.notEqual(await f.model.update(opening), false); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); assert.notEqual(await cold.model.update(opening), false);
  assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  const restored = cold.model._active.get(row.id), dead = originalRoster.map(id => clone(restored.agents.find(a => a.id === id)));
  assert.deepEqual(newAnimals(restored).map(a => a.id), originalIds); cold.model.step(.1, { hour: 12 });
  assert.deepEqual(originalRoster.map(id => restored.agents.find(a => a.id === id)), dead, 'all dead individuals freeze, including individual clocks');
  assert.deepEqual(restored.shoalLife.school.memberIds, originalRoster);
  for (const a of dead) assert.equal(cold.model.snapshot().agents.find(x => x.id === a.id).timeSec, a.timeSec);
  const empty = data.initial.find(([, r]) => r.shoalLife?.role === false && newAnimals(r).length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.notEqual(await emptyCold.model.update(at(empty.cx, empty.cz)), false);
  assert.deepEqual(emptyCold.model._active.get(empty.id), empty); assert.equal(newAnimals(emptyCold.model._active.get(empty.id)).length, 0);
});

test('enabling the package preserves complete legacy raw records, paused clocks and the exact next native step', async () => {
  const legacy = fixture(fromRecords(await oldBirth()), false); assert.notEqual(await legacy.model.update(opening), false);
  legacy.model.step(.4, { hour: 12 });
  const row = [...legacy.model._active.values()].find(r => r.agents.some(a => a.alive)), a = row.agents.find(a => a.alive);
  a.alive = false; a.energy = 0; a.state = 'dead'; a.stateSince = row.timeSec; a.velocity = { x: 0, y: 0, z: 0 };
  recordLivingDeath(row, a); row.counters.deaths++; row.historyExtension = { previousPackages: true, sentinel: [11, 4] };
  await legacy.model.checkpoint(); const saved = capture(legacy.store.records);
  const enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.notEqual(await enabled.model.update(opening), false); assert.notEqual(await disabled.model.update(opening), false);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); assert.deepEqual(capture(enabled.store.records), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.shoalLifeVersion === undefined && newAnimals(r).length === 0));
  enabled.model.step(0, { hour: 12 }); assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  for (const dt of [.1, .2]) { enabled.model.step(dt, { hour: 12 }); disabled.model.step(dt, { hour: 12 }); }
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); bounded(enabled); bounded(disabled);
});

test('strict-null pending, null-refused and thrown atomic births expose no actors or scenery before successful commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.shoalLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('atomic shoal births were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.model.scenery.length, 0); assert.equal(store.records.size, 0);
    assert.ok(offered.some(([, row]) => newAnimals(row).length >= 5));
    for (const [, row] of offered) if (row.shoalLifeVersion === 1) {
      assert.equal(row.timeSec, 0); assert.equal(row.shoalLifeInitializedAtSec, 0); assert.equal(row.shoalLife.lastTickSec, 0);
    }
  } finally { permit.resolve(); assert.notEqual(await pending, false); }
  bounded(f); for (const [id, row] of f.model._active) assert.deepEqual(row, store.records.get(`${f.model._world}|${id}`));
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false); assert.equal(attempt.model._active.size, 0);
    assert.equal(attempt.model.agents.length, 0); assert.equal(attempt.model.scenery.length, 0); assert.equal(failed.records.size, 0);
  }
});

test('undefined and thrown historical reads refuse activation without treating unread owners as virgin null records', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('historical read failed'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.model.scenery.length, 0); assert.equal(store.records.size, 0);
  }
});

test('offscreen prefixes, rosters, stocks and full historical communities reject corruption without replacing or repairing saved owners', async () => {
  const data = await sample(), old = await oldBirth(), activeIds = ownerWindow(opening);
  const target = data.initial.find(([, row]) => activeIds.has(row.id) && row.shoalLife.school)?.[1]; assert.ok(target);
  const damageCases = [
    ['missing-descriptor', row => delete row.shoalLife],
    ['missing-individual-marker', row => delete newAnimals(row)[0].shoalLifeIndividualVersion],
    ['unexpected-individual-prefix', row => { newAnimals(row)[0].shoalLifeUnrecognized = true; }],
    ['missing-roster-member', row => { row.shoalLife.school.memberIds.pop(); }],
    ['duplicate-roster-member', row => { row.shoalLife.school.memberIds[1] = row.shoalLife.school.memberIds[0]; }],
    ['missing-birth-placement', row => { row.shoalLife.birthPlacements.pop(); }],
    ['negative-animal-stock', row => { row.openWaterLife.preyOrganicUnits = -1; }],
    ['nonfinite-plankton-stock', row => { row.resources.plankton = NaN; }],
    ['baseline-version', row => { row.communityVersion = -1; }],
    ['old-agent', row => { row.agents.find(a => !isOceanShoalLifeAgent(a)).speciesId = 'not-a-sourced-species'; }],
    ['guild-category', row => { delete row.reefGuildVersion; }],
    ['open-water-category', row => { delete row.openWaterLife; }],
    ['previous-meadow-category', row => { delete row.meadowLifeVersion; }],
    ['owner-prefix-only-legacy', row => { row.shoalLifeUnexpected = true; }, true],
    ['old-individual-prefix-only-legacy', row => { row.agents[0].shoalLifeUnexpected = true; }, true],
  ];
  for (const [label, damage, legacy] of damageCases) {
    const store = fromRecords(legacy ? old : data.initial), f = fixture(store), row = [...store.records.values()].find(r => r.id === target.id);
    assert.ok(row); damage(row); const position = at(row.cx - 2, row.cz);
    assert.equal(ownerWindow(position).has(row.id), false, 'damaged owner is read as offscreen support');
    const before = capture(store.records); await assert.rejects(f.model.update(position), /Invalid saved/, label);
    assert.deepEqual(capture(store.records), before, label); assert.equal(f.model._active.has(row.id), false);
    for (const [id, neighbour] of f.model._active) assert.deepEqual(neighbour, store.records.get(`${f.model._world}|${id}`), label);
  }
});
