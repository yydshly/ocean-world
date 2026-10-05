import test from 'node:test';
import assert from 'node:assert/strict';
import { KelpOceanEcology, KELP_OCEAN_REGION_ANIMAL_LIMIT, KELP_OCEAN_REGION_PLANT_LIMIT } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { leafAttachmentPosition } from '../src/kelpHabitat.js';

function memoryStore() {
  const records = new Map();
  return { available: true, records,
    async load(world, id) { return structuredClone(records.get(`${world}|${id}`) ?? null); },
    async saveMany(world, entries) { for (const [id, state] of entries) records.set(`${world}|${id}`, structuredClone(state)); },
    async clear(world) { for (const key of records.keys()) if (key.startsWith(`${world}|`)) records.delete(key); },
  };
}
async function model(seed = '42', position = { x: 259, z: 3 }, store = memoryStore()) {
  const ecology = new KelpOceanEcology(seed, createKelpOceanGenerator(seed), { store });
  assert.equal(await ecology.update(position), true); return ecology;
}

test('real generated habitats allocate bounded sparse animal records and separate three plant representatives', async () => {
  for (const seed of ['42', 'kelp-other', 42]) {
    const ecology = await model(seed), snapshot = ecology.snapshot();
    assert.equal(snapshot.regions.length, 9);
    assert.ok(snapshot.regions.every(region => region.agentCount <= KELP_OCEAN_REGION_ANIMAL_LIMIT &&
      region.simulatedKelpRepresentatives <= KELP_OCEAN_REGION_PLANT_LIMIT));
    assert.ok(snapshot.agents.every(agent => agent.speciesId !== 'giant-kelp' && Math.hypot(agent.position.x, agent.position.z) > 40));
    assert.equal(snapshot.metrics.activeIndividuals, snapshot.agents.length);
    assert.equal(new Set(snapshot.agents.map(agent => agent.id)).size, snapshot.agents.length);
    assert.ok(snapshot.agents.some(agent => agent.speciesId === 'giant-kelpfish'));
    assert.ok(snapshot.agents.some(agent => agent.speciesId === 'brown-turban-snail'));
    for (const region of ecology._active.values()) {
      for (const plant of region.sim.hostById.values()) {
        const element = ecology.generator.chunk(region.cx, region.cz).elements.find(item => item.id === plant.sceneryId);
        assert.ok(element && element.kind === 'kelp'); assert.equal(plant.anchor.y, element.anchor.y);
      }
    }
  }
});

test('same logical cells are independent of visit order, Map order and fixed frame partitioning', async () => {
  const a = await model(), b = await model();
  b._active = new Map([...b._active].reverse());
  a.step(2, { currentMps: .55, hour: 10 });
  for (let index = 0; index < 120; index++) b.step(1 / 60, { currentMps: .55, hour: 10 });
  for (const [id, region] of a._active) assert.deepEqual(a._record(region), b._record(b._active.get(id)));
  const fresh = await model();
  await fresh.update({ x: 900, z: 900 }); await fresh.update({ x: 259, z: 3 });
  const untouched = await model();
  assert.deepEqual(fresh.snapshot().agents, untouched.snapshot().agents);
});

test('local feeding moves resources into a closed ledger and never awards intake from empty patches', async () => {
  const ecology = await model(), region = [...ecology._active.values()].find(region => region.sim.hostById.size);
  const sim = region.sim;
  const snail = sim.agents.find(agent => agent.speciesId === 'brown-turban-snail');
  snail.attachment.along = .55;
  snail.position = leafAttachmentPosition(sim.getKelpAnchor(snail.attachment.hostId), snail.attachment, sim.timeSec, sim.environment);
  snail.nextBite = 0;
  const before = sim.ledger.ingested;
  ecology.step(.1, { foodSupply: 0, hour: 0 });
  assert.ok(snail.lastFeedAt > 0); assert.ok(sim.ledger.ingested > before);
  assert.ok(Math.abs(sim.metrics.resourceBudgetError) < 1e-10);
  for (const patch of sim.leafPatches) patch.biofilm = 0;
  snail.nextBite = 0; const feedAt = snail.lastFeedAt, ingested = sim.ledger.ingested;
  ecology.step(.1, { foodSupply: 0, hour: 0 });
  assert.equal(snail.lastFeedAt, feedAt); assert.equal(sim.ledger.ingested, ingested);
});

test('actual support and shared moving leaves constrain crawlers and snails, while fish move and can shelter', async () => {
  const ecology = await model(), before = new Map(ecology.agents.map(agent => [agent.id, { ...agent.position }]));
  const fish = ecology.agents.find(agent => agent.speciesId === 'giant-kelpfish');
  fish.energy = .3;
  ecology.step(2, { currentMps: .9, hour: 10 });
  assert.equal(fish.state, 'sheltering'); assert.notDeepEqual(fish.position, before.get(fish.id));
  for (const agent of ecology.agents) {
    assert.ok(Object.values(agent.position).every(Number.isFinite));
    if (agent.speciesId === 'giant-kelpfish') {
      const owner = ecology._active.get(agent.regionId), plant = owner.sim.hostById.get(agent.hostId);
      assert.equal(agent.hostSceneryId, plant.sceneryId);
      assert.deepEqual(agent.hostAnchor, owner.sim.getKelpAnchor(agent.hostId));
      assert.equal(agent.hostTimeSec, owner.sim.timeSec);
      assert.deepEqual(agent.hostEnvironment, owner.sim.environment);
      assert.equal(agent.supportNormal, undefined, 'fish never inherit the leaf-bound snail normal');
    }
    if (agent.attachment) assert.deepEqual(agent.position,
      leafAttachmentPosition(agent.hostAnchor, agent.attachment, agent.hostTimeSec, agent.hostEnvironment));
    else if (agent.speciesId !== 'giant-kelpfish' && agent.speciesId !== 'blue-rockfish') assert.ok(Math.abs(agent.position.y - ecology.generator.heightAt(agent.position.x, agent.position.z) - .003) < 1e-10);
  }
});

test('zero-step pause freezes every animal, host, food patch and regional clock', async () => {
  const ecology = await model(); ecology.step(.7, { currentMps: .6 });
  const before = [...ecology._active.values()].map(region => ecology._record(region));
  ecology.step(0, { currentMps: 0, foodSupply: 0 });
  assert.deepEqual([...ecology._active.values()].map(region => ecology._record(region)), before);
});

test('unload freezes and preserves complete records, including deaths; reopen continues the same next step', async () => {
  const store = memoryStore(), ecology = await model('42', { x: 259, z: 3 }, store);
  ecology.step(1.3, { currentMps: .4 });
  const region = ecology._active.get('3,-1'), dead = region.sim.agents.find(agent => agent.speciesId !== 'giant-kelp');
  dead.alive = false; dead.state = 'dead'; dead.energy = 0;
  const original = ecology._record(region);
  await ecology.update({ x: 900, z: 900 }); ecology.step(2);
  await ecology.update({ x: 259, z: 3 });
  assert.deepEqual(ecology._record(ecology._active.get('3,-1')), original);
  assert.equal(ecology.agents.find(agent => agent.id === dead.id).alive, false);
  await ecology.checkpoint();
  const reopened = await model('42', { x: 259, z: 3 }, store);
  assert.deepEqual(ecology.snapshot().agents, reopened.snapshot().agents);
  ecology.step(.1, { currentMps: .2, hour: 12 }); reopened.step(.1, { currentMps: .2, hour: 12 });
  assert.deepEqual(ecology.snapshot().agents, reopened.snapshot().agents);
});

test('typed kelp namespaces never overwrite reef records and explicit reset clears only its old/new kelp seeds', async () => {
  const store = memoryStore(); store.records.set('ecology-v1:string:42|3,-1', { untouched: true });
  const string = await model('42', undefined, store), numeric = await model(42, undefined, store);
  await string.checkpoint(); await numeric.checkpoint();
  assert.ok(store.records.has('kelp-ecology-v1:string:42|3,-1'));
  assert.ok(store.records.has('kelp-ecology-v1:number:42|3,-1'));
  await string.reset('42', createKelpOceanGenerator('42'));
  assert.equal(store.records.has('kelp-ecology-v1:string:42|3,-1'), false);
  assert.equal(store.records.has('kelp-ecology-v1:number:42|3,-1'), true);
  assert.deepEqual(store.records.get('ecology-v1:string:42|3,-1'), { untouched: true });
});

test('failed reads and corrupt saved records do not silently regenerate a population', async () => {
  const store = memoryStore(); store.load = async () => { throw new Error('read denied'); };
  const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
  assert.equal(await ecology.update({ x: 259, z: 3 }), false);
  assert.equal(ecology.snapshot().agents.length, 0); assert.equal(ecology.snapshot().metrics.persistenceErrors, 1);
  store.load = async () => ({ version: 1, id: '3,-1', state: {} });
  assert.equal(await ecology.update({ x: 259, z: 3 }), false);
  assert.equal(ecology.snapshot().agents.length, 0);
  const valid = await model();
  const record = valid._record(valid._active.get('3,-1'));
  record.state.kelpPatches[0].kelpTissue = 'corrupt quantity';
  store.load = async () => record;
  assert.equal(await ecology.update({ x: 259, z: 3 }), false);
  assert.equal(ecology.snapshot().agents.length, 0, 'corrupt food cannot poison the model after activation');
});

test('a missing snail leaf food patch is rejected before activation even when the stored ledger still balances', async () => {
  const valid = await model(), record = valid._record(valid._active.get('3,-1'));
  const snail = record.state.agents.find(agent => agent.speciesId === 'brown-turban-snail');
  const index = record.state.leafPatches.findIndex(patch => patch.hostId === snail.attachment.hostId &&
    patch.leafIndex === snail.attachment.leafIndex);
  assert.ok(index >= 0);
  const [removed] = record.state.leafPatches.splice(index, 1);
  record.state.ledger.exported += removed.biofilm;
  const store = memoryStore(), key = 'kelp-ecology-v1:string:42|3,-1';
  store.records.set(key, structuredClone(record));
  const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(await reopened.update({ x: 259, z: 3 }), false);
    assert.equal(reopened.snapshot().agents.length, 0);assert.equal(reopened.snapshot().metrics.generated, 0);
    assert.match(reopened.snapshot().metrics.storageError, /snail leaf food patch is missing/);
    reopened.step(.1);
    assert.equal(reopened.snapshot().agents.length, 0, 'failed restoration never publishes a crashing snail');
    assert.deepEqual(store.records.get(key), record, 'invalid persisted data is retained rather than overwritten by a fresh population');
  }
});

test('finite but altered stored resources cannot activate against an inconsistent ledger and an intact record can retry', async () => {
  const valid = await model();valid.step(.7, { currentMps: .4 });
  const original = valid._record(valid._active.get('3,-1')), corrupt = structuredClone(original);
  corrupt.state.leafPatches[0].biofilm += .01;
  const store = memoryStore(), key = 'kelp-ecology-v1:string:42|3,-1';store.records.set(key, corrupt);
  const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
  assert.equal(await reopened.update({ x: 259, z: 3 }), false);
  assert.equal(reopened.snapshot().agents.length, 0);assert.equal(reopened.snapshot().metrics.generated, 0);
  assert.match(reopened.snapshot().metrics.storageError, /resource ledger does not balance/);
  assert.deepEqual(store.records.get(key), corrupt);
  store.records.set(key, structuredClone(original));
  assert.equal(await reopened.update({ x: 259, z: 3 }), true);
  assert.deepEqual(reopened._record(reopened._active.get('3,-1')), original,
    'successful retry preserves every intact animal, resource, clock and ledger field');
});

test('failed unloading saves retain the live window for retry without losing state or exceeding nine regions', async () => {
  const store = memoryStore(), ecology = await model('42', undefined, store);
  ecology.step(.2); const before = ecology.snapshot().agents;
  const saving = store.saveMany; store.saveMany = async () => { throw new Error('write denied'); };
  assert.equal(await ecology.update({ x: 900, z: 900 }), false);
  assert.deepEqual(ecology.snapshot().agents, before); assert.equal(ecology.snapshot().regions.length, 9);
  store.saveMany = saving;
  assert.equal(await ecology.update({ x: 900, z: 900 }), true);
  assert.equal(ecology.snapshot().regions.length, 9);
  assert.equal(await ecology.update({ x: 259, z: 3 }), true);
  assert.deepEqual(ecology.snapshot().agents, before);
});

test('dispose freezes immediately and serializes after queued saves; unsafe coordinates cannot touch storage', async () => {
  const store = memoryStore(), ecology = await model('42', undefined, store);
  ecology.step(.3); const before = ecology.snapshot().agents;
  await ecology.dispose(); ecology.step(1);
  const reopened = await model('42', undefined, store);
  assert.deepEqual(reopened.snapshot().agents, before);
  assert.equal(ecology.snapshot().agents.length, 0);
  for (const position of [{ x: Infinity, z: 0 }, { x: Number.MAX_SAFE_INTEGER * 64, z: 0 }]) {
    assert.throws(() => reopened.update(position), RangeError);
  }
});
