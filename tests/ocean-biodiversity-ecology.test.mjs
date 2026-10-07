import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isOceanBiodiversityAgent, OCEAN_BIODIVERSITY_IDS, validateOceanBiodiversityRecord } from '../src/oceanBiodiversity.js';
import { oceanBiodiversitySpeciesCatalog } from '../src/oceanBiodiversitySpecies.js';

const seed = livingShallowsSeed('42');
// Ordinary first visits, with the exact production geology and ecological flags.
// This is a finite model sample, not an authored community or a survey census.
const windows = [[188, 14], [176, 4], [182, -16]].map(([cx, cz]) => ({ x: cx * 64 + 32, z: cz * 64 + 32 }));
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
    if (this.refusal === 'throw') throw new Error('biodiversity commit rejected');
    const pending = clone(entries);
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}

function fromRecords(rows) { const store = new MemoryStore(); store.records = new Map(clone(rows)); return store; }
function fixture(store = new MemoryStore(), biodiversity = true) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true, turtleGrazing: true,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    shallowSeascape: true, biodiversity });
  return { base, generator, model, store };
}
function bounded(f) {
  assert.ok(f.model._active.size <= 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, row.id);
    assert.ok(validateLivingNetworkRecord(row), row.id);
    close(livingNetworkBalance(row), 'organic material balance');
    close(row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus, 'food stock balance');
    if (row.biodiversityVersion !== 1) continue;
    assert.ok(row.biodiversity.patches.length <= 20);
    assert.ok(row.agents.filter(isOceanBiodiversityAgent).length <= 6);
    assert.ok(validateOceanBiodiversityRecord(row, f.generator, {
      surface: (x, z, coral) => f.model._surface(x, z, coral, true, true, true, true, true, false),
      bed: (x, z) => f.model._bed(x, z), capacity: 20 }), row.id);
  }
}
function killActual(row) {
  const agent = row.agents.find(a => a.alive && isOceanBiodiversityAgent(a));
  assert.ok(agent); agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  recordLivingDeath(row, agent); row.counters.deaths++; return agent.id;
}

let samplePromise;
async function sample() {
  samplePromise ??= (async () => {
    const f = fixture(), initial = new Map(), union = new Set(), fed = new Set(), moved = new Set(), owners = [];
    for (const position of windows) {
      assert.notEqual(await f.model.update(position), false); bounded(f);
      const before = new Map([...f.model._active.values()].flatMap(row => row.agents.filter(isOceanBiodiversityAgent))
        .map(a => [a.id, clone(a.position)]));
      for (const [id, row] of f.model._active) {
        if (!initial.has(`${f.model._world}|${id}`)) initial.set(`${f.model._world}|${id}`, clone(row));
        assert.equal(row.timeSec, 0); assert.equal(row.biodiversityVersion, 1);
        row.agents.filter(isOceanBiodiversityAgent).forEach(a => union.add(a.speciesId));
        row.biodiversity.patches.forEach(p => union.add(p.speciesId));
        const chunk = f.generator.chunk(row.cx, row.cz);
        owners.push({ id, communityType: row.biodiversity.communityType, habitatComposition: clone(chunk.habitatComposition),
          individualRecordCount: row.agents.length + (row.turtleAgents?.length ?? 0),
          newAgents: row.agents.filter(isOceanBiodiversityAgent).map(a => a.speciesId),
          staticPatches: row.biodiversity.patches.map(p => p.speciesId) });
      }
      f.model.step(8, { hour: 12 });
      // Night activity uses a normal subsequent clock step; no animal is moved
      // or made hungry to force a receipt. The long-spined urchin is nocturnal.
      f.model.step(4, { hour: 0 }); await f.model.checkpoint(); bounded(f);
      for (const row of f.model._active.values()) for (const a of row.agents.filter(isOceanBiodiversityAgent)) {
        if (a.lastFeedAt !== null) fed.add(a.speciesId);
        if (Math.hypot(a.position.x - before.get(a.id).x, a.position.z - before.get(a.id).z) > 1e-5) moved.add(a.speciesId);
        if (['feather-duster', 'shallow-anemone'].includes(a.speciesId)) assert.deepEqual(a.position, a.home);
      }
    }
    return { initial: capture(initial), union: [...union], fed: [...fed], moved: [...moved], owners };
  })();
  return clone(await samplePromise);
}

test('ordinary production owners admit all eight source taxa, feed and move on balanced existing clocks', async () => {
  const actual = await sample();
  const { initial, ...evidence } = actual;
  if (process.env.OCEAN_BIODIVERSITY_RECEIPT) await writeFile(process.env.OCEAN_BIODIVERSITY_RECEIPT,
    `${JSON.stringify({ scope: 'CPU production model observations, native supports and persisted food/material records; no browser/GPU acceptance',
      seed, windows, activeOwnerLimit: 9, animalLimit: 20, staticPatchLimit: 20,
      liveTaxa: [...OCEAN_BIODIVERSITY_IDS], staticTaxa: ['biodiversity-massive-coral', 'biodiversity-grape-algae'],
      taxonomicLevels: Object.fromEntries(oceanBiodiversitySpeciesCatalog.map(s => [s.id, s.taxonomicLevel])),
      ...evidence }, null, 2)}\n`);
  assert.deepEqual(new Set(actual.union), new Set(oceanBiodiversitySpeciesCatalog.map(s => s.id)));
  assert.deepEqual(new Set(actual.fed), new Set(OCEAN_BIODIVERSITY_IDS));
  for (const id of ['sand-goby', 'tropical-urchin', 'reef-parrotfish', 'clown-anemonefish']) assert.ok(actual.moved.includes(id), id);
  assert.ok(actual.owners.some(row => row.newAgents.length < 6), 'local niches are not a compulsory species checklist');
  assert.ok(actual.owners.every(row => !row.staticPatches.length || row.habitatComposition.samples === 64));
});

test('unload, revisit and cold restore retain deaths, patches, clocks, food and opaque history without refill', async () => {
  const initial = (await sample()).initial, f = fixture(fromRecords(initial)); await f.model.update(opening);
  f.model.step(.4, { hour: 12 });
  const row = [...f.model._active.values()].find(r => r.agents.some(a => a.alive && isOceanBiodiversityAgent(a)));
  const deadId = killActual(row); row.historyExtension = { evidence: ['visited', 'death'], retained: 17 };
  await f.model.checkpoint(); bounded(f); const before = capture(f.model._active), ids = [...f.model._active.keys()];
  await f.model.update(far); assert.ok(ids.every(id => !f.model._active.has(id)));
  await f.model.update(opening); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); await cold.model.update(opening); assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal(cold.model._active.get(row.id).agents.find(a => a.id === deadId).alive, false);
});

test('enabling biodiversity on historical native owners preserves the entire record and next ecological step', async () => {
  const old = fixture(new MemoryStore(), false); await old.model.update(opening); old.model.step(.4, { hour: 12 });
  const row = [...old.model._active.values()].find(r => r.agents.some(a => a.alive));
  const agent = row.agents.find(a => a.alive); agent.alive = false; agent.energy = 0; agent.state = 'dead';
  recordLivingDeath(row, agent); row.counters.deaths++; row.historyExtension = { old: true };
  await old.model.checkpoint(); const records = capture(old.store.records);
  const enabled = fixture(fromRecords(records)), disabled = fixture(fromRecords(records), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.ok([...enabled.model._active.values()].every(r => r.biodiversityVersion === undefined));
  enabled.model.step(.4, { hour: 12 }); disabled.model.step(.4, { hour: 12 });
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active)); bounded(enabled); bounded(disabled);
});

test('pending and refused atomic births expose no new population or static patches', async () => {
  const store = new MemoryStore(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => {
    if (offered || !rows.some(([, row]) => row.biodiversityVersion === 1)) return;
    offered = clone(rows); entered.resolve(); await permit.promise;
  };
  const f = fixture(store), pending = f.model.update(opening);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('marked atomic birth save was not reached'); })]);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.scenery.length, 0);
    for (const [id] of offered) assert.equal(store.records.has(`${f.model._world}|${id}`), false);
  } finally { permit.resolve(); await pending; }
  bounded(f);
  for (const refusal of ['null', 'throw']) {
    const failed = new MemoryStore(); failed.refusal = refusal;
    const attempt = fixture(failed); assert.equal(await attempt.model.update(opening), false);
    assert.equal(attempt.model._active.size, 0); assert.equal(attempt.model.scenery.length, 0);
    assert.equal(failed.records.size, 0);
  }
});

test('undefined and thrown reads never become strict-null fresh-owner births', async () => {
  for (const failure of ['undefined', 'throw']) {
    const store = new MemoryStore(); store.load = async () => {
      if (failure === 'throw') throw new Error('historical owner cannot be read');
      return undefined;
    };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.model.scenery.length, 0); assert.equal(store.records.size, 0);
  }
});

test('a corrupt marked owner rejects without replacement while valid saved neighbours stay intact', async () => {
  const records = (await sample()).initial;
  for (const damage of ['host', 'patch', 'food']) {
    const store = fromRecords(records), f = fixture(store);
    const [, row] = [...store.records].find(([, r]) => Math.abs(r.cx - 188) <= 1 && Math.abs(r.cz - 14) <= 1 &&
      r.biodiversity.patches.length && r.agents.some(a => isOceanBiodiversityAgent(a) && a.speciesId !== 'sand-goby'));
    if (damage === 'host') row.agents.find(a => isOceanBiodiversityAgent(a) && a.speciesId !== 'sand-goby').biodiversityHostId = 'missing-native-host';
    else if (damage === 'patch') row.biodiversity.patches[0].x += .125;
    else row.resources.plankton += .1;
    const before = capture(store.records); await assert.rejects(f.model.update(opening), /Invalid saved/);
    assert.deepEqual(capture(store.records), before); assert.equal(f.model._active.has(row.id), false);
    for (const [id, neighbour] of f.model._active) assert.deepEqual(neighbour, store.records.get(`${f.model._world}|${id}`));
  }
});
