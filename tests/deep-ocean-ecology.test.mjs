import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DeepSimulation, DEEP_MODEL_PARAMETERS } from '../src/deepSimulation.js';
import { deepFloorHeight, DEEP_ANEMONE_ANCHORS } from '../src/deepHabitat.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

const fields = ['_rngState', '_ticks', '_accumulator', 'timeSec', 'environment', 'events', 'agents',
  'primaryProduction', 'totalPrimaryProduction', 'counters', 'ledger', 'energyLedger', '_nextParcelId',
  '_nextRelease', '_nextSummary', 'surfacePatches', 'benthicPatches', 'suspendedPatches'];
const position = { x: 131, z: 5 };
const world = 'deep-ecology-v1:string:42';
function store() {
  const records = new Map();
  return { available: true, records, load: async (world, id) => structuredClone(records.get(`${world}|${id}`) ?? null),
    async saveMany(world, entries) { for (const [id, state] of entries) records.set(`${world}|${id}`, structuredClone(state)); },
    async clear(world) { for (const key of records.keys()) if (key.startsWith(`${world}|`)) records.delete(key); } };
}
async function model(storage = store(), seed = '42', start = position) {
  const ecology = new DeepOceanEcology(seed, createDeepOceanGenerator(seed), { store: storage });
  assert.equal(await ecology.update(start), true); return ecology;
}
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => ecology._record(region));
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test('authored configuration retains identities and initial random order while corrected prey transport applies to both models', () => {
  // Historical complete evolving-state hashes included terrain-following
  // suspended prey. The physical correction intentionally changes that path.
  for (const seed of [42, '42', 2026]) {
    const original = new DeepSimulation(seed), injected = new DeepSimulation(seed, { supportHeight: deepFloorHeight,
      anchors: DEEP_ANEMONE_ANCHORS, bounds: { x: [-8.7, 8.7], z: [-7.7, 7.7] } });
    assert.equal(original._rngState, injected._rngState);
    assert.deepEqual(original.agents.map(a => [a.id, a.speciesId, a.sizeM, a.energy, a.heading, a.nextBite]),
      injected.agents.map(a => [a.id, a.speciesId, a.sizeM, a.energy, a.heading, a.nextBite]));
    assert.deepEqual(original.suspendedPatches, injected.suspendedPatches);
    const parcel = original.suspendedPatches.at(-1), before = { ...parcel.position };
    original.step(.1); close(parcel.position.y, before.y); close(parcel.position.x, before.x + .006);
  }
});

test('coordinate-seeded habitats allocate sparse admitted animals within owners and independent of visit order', async () => {
  const a = await model(), b = await model(); await b.update({ x: 771, z: -187 }); await b.update(position);
  assert.deepEqual(records(a), records(b));
  assert.equal(a.snapshot().metrics.activeRegions, 9);
  const seen = new Set();
  for (const region of a._active.values()) {
    assert.ok(region.sim.agents.length <= 20);
    for (const agent of region.sim.agents) {
      assert.ok(!seen.has(agent.id)); seen.add(agent.id);
      assert.equal(Math.floor(agent.position.x / 64), region.cx); assert.equal(Math.floor(agent.position.z / 64), region.cz);
      assert.ok(Math.hypot(agent.position.x, agent.position.z) > 40);
      assert.ok(['sea-pig-group', 'rattail-family', 'pom-pom-anemone'].includes(agent.speciesId));
    }
  }
  const hard = a._create(-1, -10);
  for (const pig of hard.sim.agents.filter(agent => agent.speciesId === 'sea-pig-group')) {
    assert.notEqual(a.generator.sample(pig.position.x, pig.position.z).substrate, 'rock');
  }
});

test('fixed frame partitions and reversed active Maps preserve complete regional state', async () => {
  const a = await model(), b = await model(); b._active = new Map([...b._active].reverse());
  a.step(3); for (let tick = 0; tick < 30; tick++) b.step(.1);
  assert.deepEqual(records(a), records(b));
});

test('generated ground, all twelve sea-pig feet and fish nine-point support obey bounded full-XYZ movements', async () => {
  const ecology = await model();
  for (let tick = 0; tick < 200; tick++) {
    const before = new Map(ecology.agents.map(agent => [agent.id, { ...agent.position }])); ecology.step(.1, { currentMps: .4 });
    for (const region of ecology._active.values()) for (const agent of region.sim.agents) {
      const old = before.get(agent.id), travel = Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z);
      const budget = agent.speciesId === 'sea-pig-group' ? DEEP_MODEL_PARAMETERS.seaPigCrawlMps * .1 :
        agent.speciesId === 'rattail-family' ? (DEEP_MODEL_PARAMETERS.fishSearchMps + .4 * .006) * .1 : 0;
      assert.ok(travel <= budget + 1e-8);
      if (agent.speciesId === 'rattail-family') close(agent.position.y, region.sim._fishFloor(agent));
      else close(agent.position.y, ecology.generator.heightAt(agent.position.x, agent.position.z));
      if (agent.speciesId === 'sea-pig-group') {
        const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
        for (const foot of agent.contactPointsLocal) close(agent.position.y + foot.y * agent.sizeM,
          ecology.generator.heightAt(agent.position.x + agent.sizeM * (foot.x * c - foot.z * s), agent.position.z + agent.sizeM * (foot.x * s + foot.z * c)));
      }
    }
  }
});

test('all three foods have reachable positive ingestion, real resource debit, and closed per-pool and condition ledgers', async () => {
  const ecology = await model(); ecology.step(30);
  const found = new Set();
  for (const region of ecology._active.values()) {
    const sim = region.sim; close(sim.metrics.resourceBudgetError, 0); close(sim.metrics.energyBudgetError, 0);
    for (const pool of Object.keys(sim.resources)) {
      const l = sim.ledger.byPool[pool]; close(sim.resources[pool], l.initial + l.input + l.transferredIn - l.transferredOut - l.ingested - l.exported);
    }
    for (const event of sim.events.filter(event => event.type === 'feeding')) {
      assert.ok(event.actualIntake > 0 && event.feedDistanceM <= event.allowedDistanceM + 1e-10); found.add(event.foodPool);
      assert.ok(sim.getAgent(event.agentId).lastFeedAt >= event.timeSec);
    }
  }
  assert.deepEqual([...found].sort(), ['benthicAnimalFood', 'surfaceDetritus', 'suspendedPrey']);
  const empty = await model();
  for (const region of empty._active.values()) {
    for (const [name, pool] of [['surfacePatches', 'surfaceDetritus'], ['benthicPatches', 'benthicAnimalFood'], ['suspendedPatches', 'suspendedPrey']]) {
      for (const patch of region.sim[name]) patch[pool] = 0;
      region.sim.ledger.byPool[pool].initial = 0;
    }
    region.sim.ledger.initial = 0;
  }
  empty.step(30, { foodSupply: 0 }); assert.ok(empty.agents.every(agent => agent.lastFeedAt === null));
  assert.ok(empty.snapshot().regions.every(region => region.ledger.ingested === 0));
});

test('suspended prey advances from its real local position and exits with a ledger debit instead of wrapping', async () => {
  const ecology = await model(), region = ecology._active.get('2,0'), sim = region.sim;
  const parcel = sim.suspendedPatches.at(-1), x = parcel.position.x, y = parcel.position.y;
  ecology.step(.1, { currentMps: .06 }); close(parcel.position.x, x + .006);
  close(parcel.position.y, y);
  close(parcel.position.y, ecology.generator.heightAt(parcel.position.x, parcel.position.z) + parcel.heightM);
  parcel.position.x = sim._outletX - .01; parcel.position.y = ecology.generator.heightAt(parcel.position.x, parcel.position.z) + parcel.heightM;
  const amount = parcel.suspendedPrey, exported = sim.ledger.byPool.suspendedPrey.exported;
  ecology.step(.1, { currentMps: 1.2, foodSupply: 0 });
  assert.ok(!sim.suspendedPatches.some(patch => patch.id === parcel.id));
  close(sim.ledger.byPool.suspendedPrey.exported - exported, amount); close(sim.metrics.resourceBudgetError, 0);
});

test('actual seeded rock shoulders cannot lift suspended prey beyond the current movement budget', () => {
  const ecology = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: store() });
  const sim = ecology._create(-6, -7).sim;
  const parcel = sim.suspendedPatches.find(patch => Math.abs(patch.position.z + 427.6259701385349) < 1e-8);
  assert.ok(parcel, 'the recorded seeded lane still exists');
  parcel.position.x = -381.33200000000856;
  parcel.position.y = ecology.generator.heightAt(parcel.position.x, parcel.position.z) + parcel.heightM;
  const before = { ...parcel.position }, amount = parcel.suspendedPrey;
  const legacyRise = ecology.generator.heightAt(before.x + .006, before.z) - ecology.generator.heightAt(before.x, before.z);
  assert.ok(legacyRise > .05, 'this real rock shoulder used to add over 5 cm of unforced vertical movement');
  sim.setEnvironment({ currentMps: .06, foodSupply: 0 }); sim.step(.1);
  close(parcel.position.y, before.y); close(parcel.position.x, before.x + .006);
  close(Math.hypot(parcel.position.x - before.x, parcel.position.y - before.y, parcel.position.z - before.z), .006);
  const exported = sim.ledger.byPool.suspendedPrey.exported;
  sim.step(.2);
  assert.ok(!sim.suspendedPatches.some(patch => patch.id === parcel.id));
  close(sim.ledger.byPool.suspendedPrey.exported - exported, amount);
  close(sim.metrics.resourceBudgetError, 0);
});

test('old regional heightM records resume unchanged without rewriting identity, food, timers or ledger', async () => {
  const storage = store(), a = await model(storage); a.step(3); await a.checkpoint();
  const record = structuredClone(storage.records.get(`${world}|2,0`));
  // Legacy transport stored a fixed positive bed clearance and its resulting
  // world Y. Both fields remain accepted; the first new step begins there.
  for (const parcel of record.state.suspendedPatches) {
    const anchor = record.state.agents.filter(agent => agent.speciesId === 'pom-pom-anemone')[parcel.laneIndex];
    parcel.heightM = anchor.sizeM * .40;
    parcel.position.y = a.generator.heightAt(parcel.position.x, parcel.position.z) + parcel.heightM;
  }
  storage.records.set(`${world}|2,0`, record);
  const b = await model(storage);
  assert.deepEqual(b._record(b._active.get('2,0')), record);
  const sim = b._active.get('2,0').sim, parcel = sim.suspendedPatches.at(-1), before = { ...parcel.position };
  b.step(.1, { currentMps: .06 });
  close(parcel.position.y, before.y); close(parcel.position.x, before.x + .006);
  close(sim.metrics.resourceBudgetError, 0); close(sim.metrics.energyBudgetError, 0);
  await b.checkpoint();
  const c = await model(storage);
  assert.deepEqual(c._record(c._active.get('2,0')), b._record(b._active.get('2,0')));
});

test('zero-step pause is exact and light, hour and turbidity do not create food, energy or photosynthesis', async () => {
  const a = await model(), b = await model(); const paused = records(a); a.step(0, { observerLight: 0 }); assert.deepEqual(records(a), paused);
  a.step(10, { observerLight: 0, hour: 0, turbidity: 0 }); b.step(10, { observerLight: 1, hour: 12, turbidity: 1 });
  const strip = rows => rows.map(row => { delete row.state.environment; return row; });
  assert.deepEqual(strip(records(a)), strip(records(b)));
  for (const metrics of [a.snapshot().metrics, b.snapshot().metrics]) {
    assert.equal(metrics.primaryProduction, 0); assert.equal(metrics.totalPrimaryProduction, 0); assert.equal(metrics.naturalLightLevel, 0);
  }
});

test('unload freezes complete food, random and animal records, including deaths, and reopen resumes the identical next step', async () => {
  const storage = store(), a = await model(storage); a.step(3);
  const dead = a._active.get('2,0').sim.agents[0]; dead.alive = false; dead.state = 'dead';
  await a.checkpoint(); const saved = structuredClone(storage.records.get(`${world}|2,0`));
  await a.update({ x: 835, z: -251 }); a.step(10); assert.deepEqual(storage.records.get(`${world}|2,0`), saved);
  await a.update(position); assert.deepEqual(a._record(a._active.get('2,0')), saved);
  const b = await model(storage); assert.deepEqual(records(a), records(b));
  a.step(.1); b.step(.1); assert.deepEqual(records(a), records(b));
  assert.equal(a._active.get('2,0').sim.getAgent(dead.id).alive, false);
  const snapshot = a.snapshot(); snapshot.agents[0].position.x = -1e9; assert.notEqual(a.agents[0].position.x, -1e9);
});

test('failed reads, corrupted food/ownership and oversized cohorts do not regenerate or publish altered records', async () => {
  for (const mutate of [record => { record.state.surfacePatches[0].surfaceDetritus += .01; },
    record => { record.state.agents[0].position.x += 128; },
    record => { while (record.state.agents.length <= 20) record.state.agents.push(structuredClone(record.state.agents[0])); },
    record => { record.state.suspendedPatches[0].laneIndex = 999; },
    record => { record.state.benthicPatches[0].sedimentId = 'missing'; }]) {
    const storage = store(), original = await model(storage); await original.checkpoint();
    const intact = structuredClone(storage.records.get(`${world}|1,-1`));
    const corrupt = structuredClone(intact); mutate(corrupt); storage.records.set(`${world}|1,-1`, corrupt);
    const next = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage });
    assert.equal(await next.update(position), false); assert.ok(!next._active.has('1,-1'));
    assert.deepEqual(storage.records.get(`${world}|1,-1`), corrupt);
    storage.records.set(`${world}|1,-1`, intact); assert.equal(await next.update(position), true);
  }
  const storage = store(); storage.load = async () => { throw new Error('read failure'); };
  const failed = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage });
  assert.equal(await failed.update(position), false); assert.equal(failed.agents.length, 0); assert.equal(storage.records.size, 0);
});

test('fresh save failures never activate unsaved animals and blocked unload freezes outgoing records until a retry', async () => {
  const storage = store(), save = storage.saveMany; let reject = true;
  storage.saveMany = async (...args) => { if (reject) throw new Error('write failure'); return save(...args); };
  const ecology = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage });
  assert.equal(await ecology.update(position), false); assert.equal(ecology.agents.length, 0);
  reject = false; assert.equal(await ecology.update(position), true);
  let release;
  storage.saveMany = () => new Promise(resolve => { release = resolve; });
  const outgoing = ecology._record(ecology._active.get('2,0')), pending = ecology.update({ x: 899, z: 261 });
  await Promise.resolve(); await Promise.resolve(); ecology.step(1);
  assert.deepEqual(ecology._record(ecology._active.get('2,0')), outgoing); assert.equal(ecology._active.size, 9);
  release(null); assert.equal(await pending, false); assert.equal(ecology._active.size, 9);
  storage.saveMany = save; assert.equal(await ecology.update({ x: 899, z: 261 }), true);
  assert.equal(ecology._active.size, 9);
});

test('typed deep namespaces and explicit reset never overwrite reef or kelp records; dispose freezes and saves before clearing', async () => {
  const storage = store(); storage.records.set('ecology-v1:string:42|2,0', { reef: true }); storage.records.set('kelp-ecology-v1:string:42|2,0', { kelp: true });
  const a = await model(storage), b = await model(storage, 42); assert.notDeepEqual(a.agents.map(a => a.position), b.agents.map(a => a.position));
  assert.ok(storage.records.has('deep-ecology-v1:number:42|2,0'));
  a.step(1); const last = a._record(a._active.get('2,0')); const pending = a.dispose(); a.step(100); await pending;
  assert.deepEqual(storage.records.get(`${world}|2,0`), last); assert.equal(a._active.size, 0);
  await b.reset('other', createDeepOceanGenerator('other'));
  assert.deepEqual(storage.records.get('ecology-v1:string:42|2,0'), { reef: true });
  assert.deepEqual(storage.records.get('kelp-ecology-v1:string:42|2,0'), { kelp: true });
  assert.ok(![...storage.records.keys()].some(key => key.startsWith('deep-ecology-v1:number:42|')));
  assert.throws(() => b.update({ x: Infinity, z: 0 }), RangeError); assert.throws(() => b.update({ x: Number.MAX_VALUE, z: 0 }), RangeError);
  const unavailable = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: { ...store(), available: false } });
  assert.equal(await unavailable.update(position), false); assert.equal(unavailable.agents.length, 0); assert.equal(unavailable.snapshot().metrics.saved, 0);
});
