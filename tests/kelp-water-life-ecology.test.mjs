import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';
import { validateKelpBenthicLifeRecord } from '../src/kelpBenthicLife.js';
import { KELP_WATER_LIFE_IDS, KELP_WATER_LIFE_MODEL, isKelpWaterLifeAgent,
  kelpWaterLifePositionValid, kelpWaterLifeFeedingPosition, validateKelpWaterLifeRecord } from '../src/kelpWaterLife.js';
import { kelpWaterLifeSpeciesCatalog, kelpWaterLifeSpeciesById } from '../src/kelpWaterLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
// Ordinary production windows: no authored hosts, extra food, random overrides
// or injected new animals. Existing flags/controllers all remain enabled.
const windows = [at(32, -4), at(40, -4)], opening = windows[0], far = at(-38, 25);
const clone = value => structuredClone(value);
const stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const newAnimals = row => row.kelpWaterLifeAgents ?? [];
const allAnimals = row => row.sim.agents.filter(a => a.speciesId !== 'giant-kelp').concat(
  row.waterAgents, row.visitorAgents, row.kelpBenthicAgents ?? [], newAnimals(row));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { return this.saveMany(world, [[id, record]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('kelp water-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), waterLife = true) {
  const generator = createKelpOceanGenerator(seed, { forestBelt: true, kelpSeascape: true });
  const model = new KelpOceanEcology(seed, generator, { store, visitors: true, understory: true,
    forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife });
  return { generator, model, store };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9);
  assert.ok(f.generator.forestBeltRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, row.id);
    assert.ok(row.sim.hostById.size <= 3); close(row.sim.metrics.resourceBudgetError, `${row.id} complete food ledger`);
    close(kelpDriftBalanceError(row), `${row.id} shed-food ledger`);
    const raw = f.model._record(row);
    assert.ok(validateKelpBenthicLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} old bottom community`);
    assert.ok(validateKelpWaterLifeRecord(raw, row, { generator: f.generator, capacity: 20 }), `${row.id} water-life history`);
    if (row.kelpWaterLifeVersion === undefined) { assert.equal(newAnimals(row).length, 0); continue; }
    assert.equal(row.kelpWaterLifeVersion, 1); assert.ok(newAnimals(row).length <= 7);
    assert.equal(row.kelpWaterLife.counters.ticks, row.sim._ticks);
    assert.equal(row.kelpWaterLife.lastTickSec, row.sim.timeSec);
    for (const group of row.kelpWaterLife.groups) {
      assert.ok(group.memberIds.length >= 4 && group.memberIds.length <= 5);
      assert.equal(new Set(group.memberIds).size, group.memberIds.length);
      const members = group.memberIds.map(id => newAnimals(row).find(a => a.id === id));
      assert.ok(members.every(a => a?.speciesId === 'pacific-jack-mackerel'));
      assert.equal(new Set(members).size, members.length, 'group is made of independent agent objects');
    }
    for (const a of newAnimals(row)) {
      if (a.alive) assert.equal(a.timeSec, row.sim.timeSec);
      assert.ok(kelpWaterLifePositionValid(f.generator, row, a, a.position, a.heading, a.pitch,
        { future: false }), `${row.id}/${a.id} whole current form`);
    }
  }
}
function stocks(row) { return { resources: clone(row.sim.resources),
  prey: row.sim.preyPatches.map(p => ({ id: p.id, hostId: p.hostId, stock: p.smallPrey })),
  algae: row.sim.rockPatches.map(p => ({ id: p.id, position: clone(p.position), stock: p.algae })) }; }

// Passive property observers see the real native debit and ingestion-ledger
// write before the individual receipt. They do not change food, RNG or clocks.
function observeNativeIntakes(row, traces) {
  const sim = row.sim, latest = new Map(), cleanup = []; let lastIngestion;
  for (const [patches, pool] of [[sim.preyPatches, 'smallPrey'], [sim.rockPatches, 'algae']]) {
    for (const patch of patches) {
      let value = patch[pool];
      Object.defineProperty(patch, pool, { configurable: true, enumerable: true, get: () => value,
        set: next => { latest.set(`${patch.id}|${pool}`, { stockBefore: value, stockAfter: next }); value = next; } });
      cleanup.push(() => Object.defineProperty(patch, pool, { configurable: true, enumerable: true, writable: true, value }));
    }
  }
  let ingested = sim.ledger.ingested;
  Object.defineProperty(sim.ledger, 'ingested', { configurable: true, enumerable: true, get: () => ingested,
    set: next => { lastIngestion = { ingestionBefore: ingested, ingestionAfter: next }; ingested = next; } });
  cleanup.push(() => Object.defineProperty(sim.ledger, 'ingested', { configurable: true, enumerable: true, writable: true, value: ingested }));
  for (const a of newAnimals(row)) {
    let value = a.lastWaterLifeIntake;
    Object.defineProperty(a, 'lastWaterLifeIntake', { configurable: true, enumerable: true, get: () => value,
      set: next => {
        value = next; if (next === null) return;
        const debit = latest.get(`${next.patchId}|${next.pool}`), pool = a.nutritionPool;
        const patch = (pool === 'algae' ? sim.rockPatches : sim.preyPatches).find(p => p.id === next.patchId);
        assert.ok(debit && patch && lastIngestion, 'existing patch and native ledger really wrote');
        assert.equal(next.pool, pool); assert.equal(next.ownerId, row.id); assert.ok(debit.stockBefore > 0);
        assert.equal(patch[pool], debit.stockAfter);
        close(debit.stockBefore - debit.stockAfter - next.removedUnits, 'actual patch debit');
        close(lastIngestion.ingestionAfter - lastIngestion.ingestionBefore - next.removedUnits, 'actual native ingestion write');
        assert.equal(next.stockBefore, debit.stockBefore); assert.equal(next.stockAfter, debit.stockAfter);
        assert.equal(a.energy, next.energyAfter); assert.ok(next.energyAfter > next.energyBefore);
        assert.equal(a.lastFeedAt, sim.timeSec); assert.equal(a.timeSec, sim.timeSec);
        assert.deepEqual(next.agentPosition, a.position);
        assert.deepEqual(next.feedingPosition, kelpWaterLifeFeedingPosition(a));
        assert.deepEqual(next.foodPosition, pool === 'algae' ? patch.position : sim._preyPosition(patch));
        close(distance(next.feedingPosition, next.foodPosition) - next.contactDistanceM, 'actual organ-to-native-food contact');
        assert.ok(next.contactDistanceM <= KELP_WATER_LIFE_MODEL.contactDistanceM);
        close(sim.metrics.resourceBudgetError, 'complete food budget immediately after real bite');
        traces.push({ owner: row.id, agentId: a.id, speciesId: a.speciesId, ...clone(next), ...debit, ...lastIngestion,
          individualClockSec: a.timeSec, ownerClockSec: sim.timeSec, wholeFoodBalanceError: sim.metrics.resourceBudgetError });
      } });
    cleanup.push(() => Object.defineProperty(a, 'lastWaterLifeIntake', { configurable: true, enumerable: true, writable: true, value }));
  }
  return () => cleanup.forEach(done => done());
}

let samplePromise, oldBirthPromise;
async function oldBirth() {
  oldBirthPromise ??= (async () => { const f = fixture(new MemoryStore(), false);
    assert.equal(await f.model.update(opening), true); return stored(f.store); })();
  return clone(await oldBirthPromise);
}
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), union = new Set(), initial = new Map(), owners = [], windowActivity = [];
    for (const position of windows) {
      f.store.reads.length = 0; assert.equal(await f.model.update(position), true); bounded(f);
      assert.ok(f.store.reads.length <= 24);
      const before = new Map(), traces = [], cleanup = [], blueIds = new Set();
      const offscreen = [...f.store.records].filter(([, row]) => !f.model._active.has(row.id)).map(([id, row]) => [id, clone(row)]);
      for (const row of f.model._active.values()) {
        assert.equal(row.sim.timeSec, 0); assert.equal(row.kelpWaterLifeVersion, 1);
        assert.equal(row.kelpWaterLife.counters.consumedUnits, 0); assert.equal(row.sim.ledger.ingested, 0);
        initial.set(`${f.model._world}|${row.id}`, f.model._record(row));
        for (const a of row.waterAgents) if (a.speciesId === 'blue-rockfish') blueIds.add(a.id);
        for (const a of newAnimals(row)) { before.set(a.id, clone(a)); union.add(a.speciesId); }
        owners.push({ id: row.id, role: row.kelpWaterLife.role, actualSimulatedHosts: row.sim.hostById.size,
          totalAnimalRecordCount: allAnimals(row).length, oldBlueRockfishCount: row.waterAgents.filter(a => a.speciesId === 'blue-rockfish').length,
          initialStocks: stocks(row), initialFoodLedger: clone(row.sim.ledger), groups: clone(row.kelpWaterLife.groups),
          newAgents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, sizeM: a.sizeM,
            sizeMeasure: kelpWaterLifeSpeciesById[a.speciesId].sizeMeasure, position: clone(a.position),
            actualRootDepthM: f.generator.surfaceY - a.position.y, energy: a.energy, timeSec: a.timeSec,
            pool: a.nutritionPool, foodPatchId: a.kelpWaterLifeFoodPatchId, hostId: a.kelpWaterLifeHostId })) });
        cleanup.push(observeNativeIntakes(row, traces));
      }
      const started = performance.now();
      try { f.model.step(4, { foodSupply: 0, currentMps: .18, hour: 12 }); }
      finally { cleanup.forEach(done => done()); }
      bounded(f); await f.model.checkpoint();
      for (const [id, row] of offscreen) assert.deepEqual(f.store.records.get(id), row, 'offscreen complete history freezes');
      assert.deepEqual(new Set([...f.model._active.values()].flatMap(r => r.waterAgents).filter(a => a.speciesId === 'blue-rockfish').map(a => a.id)), blueIds,
        'actual previously present blue-rockfish identities are retained');
      windowActivity.push({ position, observedSec: 4, actualCpuWallTimeMs: performance.now() - started,
        activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.forestBeltRegistryStats().size,
        newAnimalCount: before.size, successfulBites: traces.length, actualIntakes: traces,
        owners: [...f.model._active.values()].map(row => ({ id: row.id, role: row.kelpWaterLife.role,
          clockSec: row.sim.timeSec, ticks: row.sim._ticks, newClockSec: row.kelpWaterLife.lastTickSec,
          newCounters: clone(row.kelpWaterLife.counters), totalAnimalRecordCount: allAnimals(row).length,
          finalStocks: stocks(row), finalFoodLedger: clone(row.sim.ledger),
          foodBalanceError: row.sim.metrics.resourceBudgetError, driftBalanceError: kelpDriftBalanceError(row),
          agents: newAnimals(row).map(a => ({ id: a.id, speciesId: a.speciesId, alive: a.alive,
            timeSec: a.timeSec, energy: a.energy, state: a.state, position: clone(a.position),
            displacementM: distance(a.position, before.get(a.id).position), lastFeedAt: a.lastFeedAt,
            lastWaterLifeIntake: clone(a.lastWaterLifeIntake) })) })) });
    }
    const births = owners.flatMap(row => row.newAgents), agents = windowActivity.flatMap(w => w.owners.flatMap(r => r.agents));
    const intakes = windowActivity.flatMap(w => w.actualIntakes);
    const countsBySpecies = Object.fromEntries(KELP_WATER_LIFE_IDS.map(id => [id, {
      bornIndividuals: births.filter(a => a.speciesId === id).length,
      aliveAfterObservation: agents.filter(a => a.speciesId === id && a.alive).length,
      movedIndividuals: agents.filter(a => a.speciesId === id && a.displacementM > 1e-8).length,
      nativeClockObservedIndividuals: agents.filter(a => a.speciesId === id && a.timeSec > 0).length,
      fedIndividuals: new Set(intakes.filter(e => e.speciesId === id).map(e => e.agentId)).size,
      successfulBites: intakes.filter(e => e.speciesId === id).length,
    }]));
    return { initial: clone([...initial]), windows, union: [...union], countsBySpecies, owners, windowActivity };
  })();
  return clone(await samplePromise);
}

test('two ordinary production windows contain four independent sourced forms, real native clocks and organ-to-old-stock ingestion', async () => {
  const actual = await sample(), { initial, ...evidence } = actual;
  assert.deepEqual(new Set(actual.union), new Set(KELP_WATER_LIFE_IDS));
  const ids = actual.owners.flatMap(r => r.newAgents.map(a => a.id)); assert.equal(new Set(ids).size, ids.length);
  for (const id of KELP_WATER_LIFE_IDS) {
    assert.ok(actual.countsBySpecies[id].bornIndividuals > 0, id);
    assert.ok(actual.countsBySpecies[id].movedIndividuals > 0, `${id} real movement`);
    // A natural approach can outlast this four-second observation. Actual
    // per-species intake counts remain in the receipt, including zero.
  }
  assert.ok(actual.owners.some(r => r.newAgents.length === 0 && !r.role), 'naturally absent categories are valid');
  assert.ok(actual.owners.some(r => r.oldBlueRockfishCount >= 4), 'pre-existing actual blue-rockfish groups remain present');
  assert.ok(actual.windowActivity.some(w => w.actualIntakes.length > 0), 'native ingestion occurs without extra inventory');
  if (process.env.KELP_WATER_LIFE_RECEIPT) await writeFile(process.env.KELP_WATER_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'finite actual CPU production, independent relative-condition actors, native food points/debit writes and persistence; no browser/GPU/visual acceptance or body-carbon budget',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalRecordLimit: 7,
      sourceSpecies: kelpWaterLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName,
        identityLevel: s.identityLevel, sizeMeasure: s.sizeMeasure, selectedDepthM: s.depthSelectionM,
        unknownEnvironmentRanges: { temperature: s.temperatureRangeC, oxygen: s.oxygenRangeMgPerL, salinity: s.salinityRangePSU }, sourceLinks: s.sourceLinks })),
      ...evidence }, null, 2)}\n`);
});

test('whole-school deaths and naturally empty categories unload, revisit and cold restore exactly without replacing animals', async () => {
  const data = await sample(), f = fixture(fromRecords(data.initial)); assert.equal(await f.model.update(opening), true);
  const row = [...f.model._active.values()].find(r => r.kelpWaterLife.groups.length); assert.ok(row);
  const originalIds = newAnimals(row).map(a => a.id), originalRoster = clone(row.kelpWaterLife.groups[0].memberIds);
  for (const id of originalRoster) newAnimals(row).find(a => a.id === id).energy = 0;
  f.model.step(.1, { foodSupply: 0, currentMps: .18, hour: 12 });
  assert.ok(originalRoster.every(id => !newAnimals(row).find(a => a.id === id).alive));
  assert.equal(row.kelpWaterLife.counters.deaths, originalRoster.length);
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'independent-school-death'], retained: 17 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [2, 9] } };
  await f.model.checkpoint(); bounded(f); const before = records(f.model), ownerIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(ownerIds.every(id => !f.model._active.has(id)));
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  const restored = cold.model._active.get(row.id), dead = originalRoster.map(id => clone(newAnimals(restored).find(a => a.id === id)));
  assert.deepEqual(newAnimals(restored).map(a => a.id), originalIds);
  assert.deepEqual(restored.kelpWaterLife.groups[0].memberIds, originalRoster);
  cold.model.step(.1, { foodSupply: 0, currentMps: .18, hour: 12 });
  assert.deepEqual(originalRoster.map(id => newAnimals(restored).find(a => a.id === id)), dead, 'dead individual clocks and receipts freeze');
  const snapshot = cold.model.snapshot();
  for (const a of dead) assert.equal(snapshot.agents.find(b => b.id === a.id).timeSec, a.timeSec, 'public dead clock retains its last actual tick');
  const empty = data.initial.find(([, r]) => r.kelpWaterLife?.role === false && r.kelpWaterLifeAgents.length === 0)?.[1]; assert.ok(empty);
  const emptyCold = fixture(fromRecords(data.initial)); assert.equal(await emptyCold.model.update(at(empty.cx, empty.cz)), true);
  assert.deepEqual(emptyCold.model._record(emptyCold.model._active.get(empty.id)), empty);
  assert.equal(newAnimals(emptyCold.model._active.get(empty.id)).length, 0);
});

test('enabling water life on saved legacy owners preserves raw history, paused state and the exact next native steps', async () => {
  const old = fixture(fromRecords(await oldBirth()), false); assert.equal(await old.model.update(opening), true);
  old.model.step(.4, { foodSupply: 0, currentMps: .18, hour: 12 });
  const row = [...old.model._active.values()].find(r => allAnimals(r).some(a => a.alive));
  const a = allAnimals(row).find(a => a.alive); a.alive = false; a.energy = 0; a.state = 'dead'; a.velocity = { x: 0, y: 0, z: 0 };
  row.sim.counters.deathCount++; row._savedRecord = { ...row._savedRecord, opaqueHistory: { originalCommunity: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [11, 4] } };
  await old.model.checkpoint(); const saved = stored(old.store), enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model)); assert.deepEqual(stored(enabled.store), saved);
  assert.ok([...enabled.model._active.values()].every(r => r.kelpWaterLifeVersion === undefined && newAnimals(r).length === 0));
  enabled.model.step(0, { hour: 12 }); assert.deepEqual(records(enabled.model), records(disabled.model));
  for (const dt of [.1, .2]) { enabled.model.step(dt, { foodSupply: 0, currentMps: .18, hour: 12 }); disabled.model.step(dt, { foodSupply: 0, currentMps: .18, hour: 12 }); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('strict-null pending, refused and thrown atomic births expose no new actors or scenery before complete commits', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.kelpWaterLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('atomic water-life records were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    for (const [id, row] of offered) {
      assert.equal(store.records.has(`${f.model._world}|${id}`), false); assert.equal(row.state.timeSec, 0);
      assert.equal(row.kelpWaterLifeVersion, 1); assert.equal(row.kelpWaterLife.counters.consumedUnits, 0);
    }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal; const attempt = fixture(failed);
    assert.equal(await attempt.model.update(opening), false);
    assert.equal(attempt.model._active.size, 0); assert.equal(attempt.model.agents.length, 0);
    assert.equal(attempt.generator.forestBeltRevision, 0); assert.equal(failed.records.size, 0);
  }
});

test('undefined and thrown reads cannot be converted into fresh kelp-water communities', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('kelp-water historical owner unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('fifteen offscreen prefix, roster, raw-stock and old-category corruptions reject the complete historical read before publishing', async () => {
  const data = await sample(), shifted = at(31, -4), targetId = '33,-3';
  const base = data.initial.find(([, r]) => r.id === targetId)?.[1]; assert.ok(base?.kelpWaterLifeAgents.length);
  // 33,-3 is a real saved native owner in the forest read halo but is outside
  // the desired active x=30..32 / z=-5..-3 window. It must still be validated.
  const damages = [
    ['unknown-owner-prefix', r => { r.kelpWaterLifeUnrecognized = { bypass: true }; }],
    ['missing-owner-version', r => { delete r.kelpWaterLifeVersion; }],
    ['missing-descriptor', r => { delete r.kelpWaterLife; }],
    ['orphan-old-animal-prefix', r => { r.state.agents.find(a => a.speciesId !== 'giant-kelp').kelpWaterLifeUnrecognized = 1; }],
    ['unknown-individual-prefix', r => { r.kelpWaterLifeAgents[0].kelpWaterLifeUnrecognized = 1; }],
    ['missing-individual-version', r => { delete r.kelpWaterLifeAgents[0].kelpWaterLifeIndividualVersion; }],
    ['missing-native-food-reference', r => { r.kelpWaterLifeAgents[0].kelpWaterLifeFoodPatchId = 'missing-native-food'; }],
    ['incomplete-school-roster', r => { r.kelpWaterLife.groups[0].memberIds.pop(); }],
    ['future-individual-clock', r => { r.kelpWaterLifeAgents[0].timeSec = .1; }],
    ['body-above-water', r => { r.kelpWaterLifeAgents[0].position.y = 100; }],
    ['changed-individual-size', r => { r.kelpWaterLifeAgents[0].sizeM *= 1.01; }],
    ['unbalanced-original-food', r => { r.state.preyPatches[0].smallPrey += .1; }],
    ['invalid-original-animal', r => { r.state.agents.find(a => a.speciesId !== 'giant-kelp').energy = -1; }],
    ['invalid-original-water-category', r => { r.waterAgents = {}; }],
    ['invalid-original-support', r => { r.supportGeometryVersion = 99; }],
  ];
  for (const [name, damage] of damages) {
    const store = fromRecords(data.initial), row = [...store.records.values()].find(r => r.id === targetId); damage(row);
    const before = stored(store), f = fixture(store);
    assert.equal(await f.model.update(shifted), false, name);
    assert.ok(store.reads.includes(targetId), `${name} really read the offscreen owner`);
    assert.deepEqual(stored(store), before, `${name} does not refill or rewrite saved inventory`);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.forestBeltRevision, 0); assert.equal(store.batches.length, 0); assert.ok(store.reads.length <= 24);
  }
});
