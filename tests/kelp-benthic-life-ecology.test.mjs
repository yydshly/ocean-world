import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpDriftBalanceError } from '../src/kelpDriftEcology.js';
import { KELP_BENTHIC_LIFE_IDS, KELP_BENTHIC_LIFE_MODEL, isKelpBenthicLifeAgent,
  kelpBenthicLifePositionValid, validateKelpBenthicLifeRecord } from '../src/kelpBenthicLife.js';
import { kelpBenthicLifeSpeciesCatalog, kelpBenthicLifeSpeciesById } from '../src/kelpBenthicLifeSpecies.js';

const seed = '42', at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
const opening = at(6, -2), windows = [opening, at(14, -2)], fallback = at(18, -2), far = at(-38, 25);
const clone = value => structuredClone(value), stored = store => clone([...store.records]).sort(([a], [b]) => a.localeCompare(b));
const records = model => [...model._active.values()].map(row => model._record(row)).sort((a, b) => a.id.localeCompare(b.id));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const allAnimals = row => row.sim.agents.filter(a => a.speciesId !== 'giant-kelp').concat(row.waterAgents, row.visitorAgents, row.kelpBenthicAgents ?? []);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { return this.saveMany(world, [[id, record]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('kelp bottom-life atomic commit rejected');
    const offered = clone(entries);
    if (await this.beforeMany?.(offered) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of offered) next.set(`${world}|${id}`, row);
    this.records = next; this.batches.push(offered);
  }
}
function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), benthicLife = true) {
  const generator = createKelpOceanGenerator(seed, { forestBelt: true, kelpSeascape: true });
  const model = new KelpOceanEcology(seed, generator,
    { store, visitors: true, understory: true, forestBelt: true, kelpSeascape: true, benthicLife });
  return { generator, model, store };
}
function bounded(f) {
  assert.ok(f.model._active.size <= 9); assert.ok(f.generator.forestBeltRegistryStats().size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(allAnimals(row).length <= 20, 'dead, old, water, visitor and new animals share the cap');
    assert.ok(row.sim.hostById.size <= 3); close(row.sim.metrics.resourceBudgetError, 'actual complete food ledger');
    close(kelpDriftBalanceError(row), 'actual shed-food ledger');
    if (row.kelpBenthicLifeVersion !== undefined) {
      assert.ok((row.kelpBenthicAgents ?? []).length <= 4);
      assert.ok(validateKelpBenthicLifeRecord(f.model._record(row), row, { generator: f.generator, capacity: 20 }), row.id);
      for (const agent of row.kelpBenthicAgents) assert.ok(kelpBenthicLifePositionValid(f.generator, row, agent), `${row.id}/${agent.id}`);
    }
  }
}
function killActual(row, newAnimal = true) {
  const agent = allAnimals(row).find(a => a.alive && (newAnimal ? isKelpBenthicLifeAgent(a) : !isKelpBenthicLifeAgent(a)));
  assert.ok(agent); agent.alive = false; agent.energy = 0; agent.state = 'dead'; agent.velocity = { x: 0, y: 0, z: 0 };
  row.sim.counters.deathCount++; return agent.id;
}
let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), union = new Set(), fed = new Set(), moved = new Set(), owners = [], visited = [], windowActivity = [], planned = [...windows];
    let initial, ordinaryInitial;
    for (let index = 0; index < planned.length; index++) {
      const position = planned[index]; visited.push(position); f.store.reads.length = 0;
      assert.equal(await f.model.update(position), true); bounded(f); assert.ok(f.store.reads.length <= 24);
      if (index === 0) {
        initial = stored(f.store);
        for (const [, row] of initial) {
          assert.equal(row.state.timeSec, 0); assert.equal(row.state._ticks, 0);
          assert.equal(row.kelpBenthicLifeInitializedAtSec, 0); assert.equal(row.state.ledger.input, 0);
          assert.equal(row.state.ledger.ingested, 0); assert.equal(row.kelpBenthicLife.counters.consumedUnits, 0);
        }
      }
      if (index === 1) ordinaryInitial = stored(f.store);
      const before = new Map([...f.model._active.values()].flatMap(row => row.kelpBenthicAgents ?? []).map(a => [a.id, clone(a.position)]));
      const offscreen = [...f.store.records].filter(([, row]) => !f.model._active.has(row.id)).map(([id, row]) => [id, clone(row)]);
      for (const row of f.model._active.values()) {
        assert.equal(row.sim.timeSec, 0); assert.equal(row.kelpBenthicLifeVersion, 1); assert.equal(row.kelpBenthicLifeInitializedAtSec, 0);
        assert.equal(row.kelpBenthicLife.lastTickSec, 0); assert.equal(row.kelpBenthicLife.counters.consumedUnits, 0);
        assert.equal(row.sim.ledger.input, 0); assert.equal(row.sim.ledger.ingested, 0);
        const agents = row.kelpBenthicAgents; agents.forEach(a => union.add(a.speciesId));
        owners.push({ id: row.id, totalAnimalRecordCount: allAnimals(row).length,
          sourceDepthM: f.generator.sample((row.cx + .5) * 64, (row.cz + .5) * 64).depthM,
          initialFoodUnits: row.sim.ledger.initial,
          newAgents: agents.map(a => ({ speciesId: a.speciesId, sizeM: a.sizeM, position: clone(a.position),
            actualSupportDepthM: f.generator.surfaceY - a.position.y,
            hostId: a.kelpBenthicHostId, foodPatchId: a.kelpBenthicFoodPatchId, sizeMeasure: kelpBenthicLifeSpeciesById[a.speciesId].sizeMeasure })) });
      }
      if (process.env.KELP_BENTHIC_LIFE_RECEIPT) console.log(JSON.stringify({ nativeWindow: position, unionSoFar: [...union],
        center: owners.find(row => row.id === `${Math.floor(position.x / 64)},${Math.floor(position.z / 64)}`) }));
      f.model.step(4, { foodSupply: 0, currentMps: .18, hour: 12 }); await f.model.checkpoint(); bounded(f);
      for (const row of f.model._active.values()) for (const agent of row.kelpBenthicAgents) {
        if (agent.lastBenthicIntake) {
          const bite = agent.lastBenthicIntake; fed.add(agent.speciesId);
          close(bite.stockBefore - bite.stockAfter - bite.removedUnits, 'actual local stock debit');
          assert.ok(bite.contactDistanceM <= KELP_BENTHIC_LIFE_MODEL.maximumFoodDistanceM);
          assert.equal(bite.pool, KELP_BENTHIC_LIFE_MODEL.traits[agent.speciesId].pool);
        }
        const old = before.get(agent.id), movedM = Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z);
        if (movedM > 1e-8) moved.add(agent.speciesId);
        if (agent.speciesId === 'giant-plumose-anemone') assert.deepEqual(agent.position, old, 'attached animal retains actual root');
      }
      for (const [id, row] of offscreen) assert.deepEqual(f.store.records.get(id), row, 'offscreen clocks, births and inventory stay frozen');
      windowActivity.push({ position, observedSec: 4, newAnimalRecordCount: before.size,
        movedNewAnimals: [...f.model._active.values()].flatMap(row => row.kelpBenthicAgents).filter(agent => {
          const p = before.get(agent.id); return Math.hypot(agent.position.x - p.x, agent.position.y - p.y, agent.position.z - p.z) > 1e-8;
        }).length,
        fedNewAnimals: [...f.model._active.values()].flatMap(row => row.kelpBenthicAgents).filter(agent => agent.lastBenthicIntake).length,
        actualNewConsumedUnits: [...f.model._active.values()].reduce((n, row) => n + row.kelpBenthicLife.counters.consumedUnits, 0) });
      if (index === 1 && union.size < 4) planned.push(fallback);
    }
    const data = { initial, ordinaryInitial, windows: visited, union: [...union], fed: [...fed], moved: [...moved], owners, windowActivity,
      activeOwnerCount: f.model._active.size, sourceOwnerCount: f.generator.forestBeltRegistryStats().size,
      maxFoodBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(row.sim.metrics.resourceBudgetError))),
      maxDriftBalanceError: Math.max(...[...f.model._active.values()].map(row => Math.abs(kelpDriftBalanceError(row)))) };
    return data;
  })();
  return clone(await samplePromise);
}

test('finite ordinary kelp windows birth four native hard-bottom taxa, debit real food and move whole supported bodies', async () => {
  const actual = await sample(), { initial, ordinaryInitial, ...evidence } = actual;
  if (process.env.KELP_BENTHIC_LIFE_RECEIPT) await writeFile(process.env.KELP_BENTHIC_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'CPU native generation, actual model and persisted records; no browser/GPU/visual acceptance',
      seed, activeOwnerLimit: 9, sourceOwnerLimit: 25, animalRecordLimit: 20, newAnimalLimit: 4,
      sourceSpecies: kelpBenthicLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, measure: s.sizeMeasure })),
      ...evidence }, null, 2)}\n`);
  assert.deepEqual(new Set(actual.union), new Set(KELP_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.fed), new Set(KELP_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.moved), new Set(KELP_BENTHIC_LIFE_IDS.filter(id => id !== 'giant-plumose-anemone')));
  assert.ok(actual.owners.some(row => row.newAgents.length < 4), 'habitat admission does not force a four-species checklist');
  const control = fixture(new MemoryStore(), false); assert.equal(await control.model.update(opening), true);
  for (const record of records(control.model)) {
    const actualBirth = initial.find(([, row]) => row.id === record.id)?.[1]; assert.ok(actualBirth);
    for (const key of ['rockPatches', 'floorPatches', 'kelpPatches', 'leafPatches', 'preyPatches', 'ledger'])
      assert.deepEqual(actualBirth.state[key], record.state[key], 'adding relative-condition animals creates no initial food inventory');
  }
});

test('new death, complete empty categories, unload, revisit and cold restore preserve all identities and inventories without refill', async () => {
  const f = fixture(fromRecords((await sample()).initial)); assert.equal(await f.model.update(opening), true);
  f.model.step(.4, { foodSupply: 0, currentMps: .18, hour: 12 });
  const row = [...f.model._active.values()].find(r => r.kelpBenthicAgents.some(a => a.alive)); assert.ok(row);
  const deadId = killActual(row), liveIds = row.kelpBenthicAgents.map(a => a.id);
  row.waterAgents = []; row.visitorAgents = [];
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { evidence: ['visited', 'kelp-benthic-death'], retained: 17 } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [2, 9] } };
  await f.model.checkpoint(); bounded(f); const before = records(f.model), oldIds = [...f.model._active.keys()];
  assert.equal(await f.model.update(far), true); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  assert.equal(await f.model.update(opening), true); assert.deepEqual(records(f.model), before); bounded(f);
  const cold = fixture(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(records(cold.model), before); bounded(cold);
  assert.deepEqual(cold.model._active.get(row.id).kelpBenthicAgents.map(a => a.id), liveIds);
  assert.equal(cold.model._active.get(row.id).kelpBenthicAgents.find(a => a.id === deadId).alive, false);
  assert.deepEqual(cold.model._active.get(row.id).waterAgents, []); assert.deepEqual(cold.model._active.get(row.id).visitorAgents, []);
  const full = stored(f.store); assert.equal(await cold.model.update(opening), true); assert.deepEqual(stored(f.store), full);
  const deadBefore = clone(cold.model._active.get(row.id).kelpBenthicAgents.find(a => a.id === deadId));
  cold.model.step(.1, { foodSupply: 0, hour: 12 });
  assert.deepEqual(cold.model._active.get(row.id).kelpBenthicAgents.find(a => a.id === deadId), deadBefore, 'dead body history does not advance or feed');
  assert.equal(cold.model.agents.find(a => a.id === deadId).timeSec, deadBefore.timeSec, 'public dead body clock retains its final actual tick');
  const snapshot = cold.model.snapshot();
  assert.equal(snapshot.agents.find(a => a.id === deadId).timeSec, deadBefore.timeSec, 'public snapshot does not borrow the later owner clock');
  assert.equal(snapshot.regions.find(r => r.id === row.id).kelpBenthicAgents.find(a => a.id === deadId).timeSec, deadBefore.timeSec,
    'region snapshot and public dead clock agree with frozen saved history');
});

test('enabling the package on saved old whole communities preserves complete history and next ordinary steps', async () => {
  const old = fixture(new MemoryStore(), false); assert.equal(await old.model.update(opening), true);
  old.model.step(.4, { foodSupply: 0, hour: 12 });
  const row = [...old.model._active.values()].find(r => allAnimals(r).some(a => a.alive)); killActual(row, false);
  row._savedRecord = { ...row._savedRecord, opaqueHistory: { originalCommunity: true } };
  row._savedState = { ...row._savedState, opaqueLifeHistory: { lineage: [11, 4] } };
  await old.model.checkpoint(); const saved = stored(old.store), enabled = fixture(fromRecords(saved)), disabled = fixture(fromRecords(saved), false);
  assert.equal(await enabled.model.update(opening), true); assert.equal(await disabled.model.update(opening), true);
  assert.deepEqual(records(enabled.model), records(disabled.model));
  assert.ok([...enabled.model._active.values()].every(r => r.kelpBenthicLifeVersion === undefined));
  for (const dt of [.1, .2]) { enabled.model.step(dt, { foodSupply: 0, hour: 12 }); disabled.model.step(dt, { foodSupply: 0, hour: 12 }); }
  assert.deepEqual(records(enabled.model), records(disabled.model)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic births expose no new actors or plan revisions until full saved records commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.kelpBenthicLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('atomic kelp-benthic records were not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.filter(isKelpBenthicLifeAgent).length, 0);
    assert.equal(f.generator.forestBeltRevision, 0);
    for (const [id, row] of offered) { assert.equal(store.records.has(`${f.model._world}|${id}`), false);
      assert.equal(row.state.timeSec, 0); assert.equal(row.kelpBenthicLifeVersion, 1); }
  } finally { permit.resolve(); assert.equal(await pending, true); }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal;
    const attempt = fixture(failed); assert.equal(await attempt.model.update(opening), false);
    assert.equal(attempt.model._active.size, 0); assert.equal(attempt.model.agents.length, 0);
    assert.equal(attempt.generator.forestBeltRevision, 0); assert.equal(failed.records.size, 0);
  }
});

test('undefined and thrown historical reads cannot become strict-null fresh kelp births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => { if (failure === 'throw') throw new Error('kelp historical owner unavailable'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.forestBeltRevision, 0); assert.equal(store.records.size, 0); assert.equal(store.batches.length, 0);
  }
});

test('partial owner and animal markers and corrupt offscreen prefetched histories reject before public state or inventory changes', async () => {
  const { initial, ordinaryInitial } = await sample();
  const desired = new Set([-3, -2, -1].flatMap(z => [5, 6, 7].map(x => `${x},${z}`)));
  const offscreen = initial.find(([, row]) => !desired.has(row.id) && row.kelpBenthicAgents?.length); assert.ok(offscreen);
  for (const damage of ['descriptor', 'version', 'individual', 'host', 'food', 'offscreen']) {
    const store = fromRecords(initial), f = fixture(store);
    const [, row] = damage === 'offscreen' ? [offscreen[0], store.records.get(offscreen[0])] :
      [...store.records].find(([, r]) => desired.has(r.id) && r.kelpBenthicAgents?.length);
    const agent = row.kelpBenthicAgents[0];
    if (damage === 'individual') delete agent.kelpBenthicIndividualVersion;
    else if (damage === 'host') agent.kelpBenthicHostId = 'missing-native-hard-host';
    else if (damage === 'version') delete row.kelpBenthicLifeVersion;
    else if (damage === 'food') row.state.rockPatches[0].algae += .1;
    else delete row.kelpBenthicLife;
    const before = stored(store); assert.equal(await f.model.update(opening), false, damage);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.length, 0);
    assert.equal(f.generator.forestBeltRevision, 0); assert.ok(store.reads.length <= 24);
  }
  const ordinaryPoint = at(13, -2), ordinaryDesired = new Set([-3, -2, -1].flatMap(z => [12, 13, 14].map(x => `${x},${z}`)));
  const ordinaryHalo = ordinaryInitial.find(([, row]) => row.cx >= 12 && row.cx <= 15 && row.cz >= -4 && row.cz <= -1 &&
    !ordinaryDesired.has(row.id) && row.forestBeltVersion !== 2 && row.state.agents.some(a => a.speciesId !== 'giant-kelp'));
  assert.ok(ordinaryHalo, 'ordinary window has an actual saved offscreen prefetched old individual');
  for (const marker of ['kelpBenthicIndividualVersion', 'kelpBenthicHostId', 'kelpBenthicSiteId', 'kelpBenthicFoodPatchId']) {
    const store = fromRecords(ordinaryInitial), f = fixture(store), row = store.records.get(ordinaryHalo[0]);
    for (const key of ['kelpBenthicLifeVersion', 'kelpBenthicLifeInitializedAtSec', 'kelpBenthicLife', 'kelpBenthicAgents']) delete row[key];
    row.state.agents.find(a => a.speciesId !== 'giant-kelp')[marker] = marker.endsWith('Version') ? 1 : 'orphan-reserved-marker';
    const before = stored(store); assert.equal(await f.model.update(ordinaryPoint), false, `prefetched ${marker}`);
    assert.deepEqual(stored(store), before); assert.equal(f.model._active.size, 0); assert.equal(f.generator.forestBeltRevision, 0);
    assert.ok(store.reads.length <= 24);
  }
});
