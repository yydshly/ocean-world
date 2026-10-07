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
import { isOceanBenthicLifeAgent, OCEAN_BENTHIC_LIFE_IDS, validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { oceanBenthicLifeSpeciesCatalog } from '../src/oceanBenthicLifeSpecies.js';

const seed = livingShallowsSeed('42');
const at = (cx, cz) => ({ x: cx * 64 + 32, z: cz * 64 + 32 });
const windows = [at(176, 8), at(188, 17)], fallback = at(188, 14);
const opening = windows[0], far = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const close = (value, label) => assert.ok(Math.abs(value) < 1e-8, `${label}: ${value}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class MemoryStore {
  available = true;
  records = new Map();
  commits = [];
  beforeMany = null;
  refusal = null;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('benthic-life atomic commit rejected');
    const pending = clone(entries);
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}
function fromRecords(records) { const store = new MemoryStore(); store.records = new Map(clone(records)); return store; }
function fixture(store = new MemoryStore(), benthicLife = true) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, biodiversity: true, benthicLife });
  return { base, generator, model, store };
}
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false),
    bed: (x, z) => f.model._bed(x, z), capacity: 20 };
}
function bounded(f) {
  assert.ok(f.model._active.size <= 9); assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, row.id);
    assert.ok(validateLivingNetworkRecord(row), row.id); close(livingNetworkBalance(row), 'organic material balance');
    close(row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus, 'food stock balance');
    if (row.biodiversityVersion !== undefined) {
      assert.ok(row.biodiversity.patches.length <= 20);
      assert.ok(validateOceanBiodiversityRecord(row, f.generator, supports(f)), row.id);
    }
    if (row.benthicLifeVersion !== undefined) {
      assert.ok(row.agents.filter(isOceanBenthicLifeAgent).length <= 4);
      assert.ok(validateOceanBenthicLifeRecord(row, f.generator, supports(f)), row.id);
    }
  }
}
function killActual(row) {
  const agent = row.agents.find(a => a.alive && isOceanBenthicLifeAgent(a));
  assert.ok(agent); agent.alive = false; agent.energy = 0; agent.state = 'dead';
  recordLivingDeath(row, agent); row.counters.deaths++; return agent.id;
}

let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), initial = new Map(), union = new Set(), fed = new Set(), moved = new Set(), owners = [], timing = [], visited = [];
    const planned = [...windows];
    for (let index = 0; index < planned.length; index++) {
      const position = planned[index]; visited.push(position);
      assert.notEqual(await f.model.update(position), false); bounded(f);
      const before = new Map([...f.model._active.values()].flatMap(row => row.agents.filter(isOceanBenthicLifeAgent))
        .map(a => [a.id, clone(a.position)]));
      for (const [id, row] of f.model._active) {
        if (!initial.has(`${f.model._world}|${id}`)) initial.set(`${f.model._world}|${id}`, clone(row));
        assert.equal(row.timeSec, 0); assert.equal(row.benthicLifeVersion, 1);
        const agents = row.agents.filter(isOceanBenthicLifeAgent); agents.forEach(a => union.add(a.speciesId));
        owners.push({ id, communityType: row.benthicLife.communityType,
          habitatComposition: clone(f.generator.chunk(row.cx, row.cz).habitatComposition),
          individualRecordCount: row.agents.length + (row.turtleAgents?.length ?? 0),
          newAgents: agents.map(a => ({ speciesId: a.speciesId, sizeM: a.sizeM, position: clone(a.position) })),
          firstPackageStaticPatchCount: row.biodiversity?.patches.length ?? 0 });
      }
      if (process.env.OCEAN_BENTHIC_LIFE_RECEIPT) console.log(JSON.stringify({ nativeWindow: position,
        center: owners.find(row => row.id === `${Math.floor(position.x / 64)},${Math.floor(position.z / 64)}`),
        unionSoFar: [...union] }));
      const started = performance.now(); f.model.step(8, { hour: 0 }); const nightDone = performance.now();
      f.model.step(4, { hour: 12 }); const dayDone = performance.now();
      timing.push({ position, simulatedNightSec: 8, simulatedDaySec: 4,
        nightStepWallTimeMs: nightDone - started, dayStepWallTimeMs: dayDone - nightDone,
        scope: 'one actual CPU simulation timing; not browser/GPU/FPS evidence' });
      await f.model.checkpoint(); bounded(f);
      for (const row of f.model._active.values()) for (const a of row.agents.filter(isOceanBenthicLifeAgent)) {
        if (a.lastFeedAt !== null) fed.add(a.speciesId);
        if (Math.hypot(a.position.x - before.get(a.id).x, a.position.z - before.get(a.id).z) > 1e-5) moved.add(a.speciesId);
      }
      if (index === 1 && union.size < 4) planned.push(fallback);
    }
    return { initial: capture(initial), windows: visited, union: [...union], fed: [...fed], moved: [...moved], owners, timing };
  })();
  return clone(await samplePromise);
}

test('two finite ordinary production windows birth, feed and move the four sourced taxa with both packages balanced', async () => {
  const actual = await sample(), { initial, ...evidence } = actual;
  if (process.env.OCEAN_BENTHIC_LIFE_RECEIPT) await writeFile(process.env.OCEAN_BENTHIC_LIFE_RECEIPT,
    `${JSON.stringify({ scope: 'CPU production model and persisted owner records; no browser/GPU acceptance',
      seed, activeOwnerLimit: 9, animalLimit: 20, firstPackageStaticPatchLimit: 20, newPackageStaticPatches: 0,
      sourceSpecies: oceanBenthicLifeSpeciesCatalog.map(s => ({ id: s.id, scientificName: s.scientificName, measure: s.sizeMeasure })),
      ...evidence }, null, 2)}\n`);
  assert.deepEqual(new Set(actual.union), new Set(OCEAN_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.fed), new Set(OCEAN_BENTHIC_LIFE_IDS));
  assert.deepEqual(new Set(actual.moved), new Set(OCEAN_BENTHIC_LIFE_IDS));
  assert.ok(actual.owners.some(row => row.newAgents.length < 4), 'actual habitat is not a compulsory species checklist');
});

test('death, unload, revisit and cold restore retain all old and new records without refill', async () => {
  const f = fixture(fromRecords((await sample()).initial)); await f.model.update(opening); f.model.step(.4, { hour: 0 });
  const row = [...f.model._active.values()].find(r => r.agents.some(a => a.alive && isOceanBenthicLifeAgent(a)));
  const deadId = killActual(row); row.historyExtension = { evidence: ['visited', 'benthic-death'], retained: 17 };
  await f.model.checkpoint(); bounded(f); const before = capture(f.model._active), ids = [...f.model._active.keys()];
  await f.model.update(far); assert.ok(ids.every(id => !f.model._active.has(id)));
  await f.model.update(opening); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); await cold.model.update(opening); assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal(cold.model._active.get(row.id).agents.find(a => a.id === deadId).alive, false);
});

test('turning on the second package preserves complete first-package history and its next ecological step', async () => {
  const old = fixture(new MemoryStore(), false); await old.model.update(opening); old.model.step(.4, { hour: 0 });
  const row = [...old.model._active.values()].find(r => r.agents.some(a => a.alive));
  const agent = row.agents.find(a => a.alive); agent.alive = false; agent.energy = 0; agent.state = 'dead';
  recordLivingDeath(row, agent); row.counters.deaths++; row.historyExtension = { retainedFirstPackage: true };
  await old.model.checkpoint(); const records = capture(old.store.records);
  const enabled = fixture(fromRecords(records)), disabled = fixture(fromRecords(records), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.ok([...enabled.model._active.values()].every(r => r.benthicLifeVersion === undefined));
  enabled.model.step(.4, { hour: 0 }); disabled.model.step(.4, { hour: 0 });
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic births remain unpublished until their exact records commit', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => {
    if (offered || !rows.some(([, row]) => row.benthicLifeVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('atomic benthic birth was not offered'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.agents.filter(isOceanBenthicLifeAgent).length, 0);
    for (const [id] of offered) assert.equal(store.records.has(`${f.model._world}|${id}`), false);
  } finally { permit.resolve(); await pending; }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal;
    const attempt = fixture(failed); assert.equal(await attempt.model.update(opening), false);
    assert.equal(attempt.model._active.size, 0); assert.equal(failed.records.size, 0);
  }
});

test('undefined or thrown reads are not virgin null records and cannot trigger either package', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => {
      if (failure === 'throw') throw new Error('historical record read failed, adapter returns null');
      return undefined;
    };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.scenery.length, 0); assert.equal(store.records.size, 0);
  }
});

test('partial owner and individual markers reject even in an offscreen support owner without replacing saved history', async () => {
  const records = (await sample()).initial;
  for (const damage of ['descriptor', 'individual', 'host', 'offscreen']) {
    const store = fromRecords(records), f = fixture(store);
    const [, row] = [...store.records].find(([, r]) => Math.abs(r.cx - 176) <= 1 && Math.abs(r.cz - 8) <= 1 && r.agents.some(isOceanBenthicLifeAgent));
    const agent = row.agents.find(isOceanBenthicLifeAgent);
    if (damage === 'individual') delete agent.benthicLifeIndividualVersion;
    else if (damage === 'host') agent.benthicLifeHostId = 'missing-real-host';
    else delete row.benthicLife;
    const position = damage === 'offscreen' ? at(row.cx - 2, row.cz) : opening;
    const before = capture(store.records); await assert.rejects(f.model.update(position), /Invalid saved/);
    assert.deepEqual(capture(store.records), before); assert.equal(f.model._active.has(row.id), false);
    for (const [id, neighbour] of f.model._active) assert.deepEqual(neighbour, store.records.get(`${f.model._world}|${id}`));
  }
});
