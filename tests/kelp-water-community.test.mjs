import test from 'node:test';
import assert from 'node:assert/strict';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createKelpWaterCommunityPlan, kelpWaterPositionValid, kelpWaterDynamicClearance, KELP_WATER_MODEL } from '../src/kelpWaterCommunity.js';

const origin = { x: 131, z: 5 };
function store() {
  const records = new Map();
  return { available: true, records, load: async (world, id) => structuredClone(records.get(`${world}|${id}`) ?? null),
    async saveMany(world, entries) { for (const [id, record] of entries) records.set(`${world}|${id}`, structuredClone(record)); },
    async clear(world) { for (const key of records.keys()) if (key.startsWith(`${world}|`)) records.delete(key); } };
}
async function model(storage = store(), position = origin, seed = '42') {
  const ecology = new KelpOceanEcology(seed, createKelpOceanGenerator(seed), { store: storage });
  assert.equal(await ecology.update(position), true); return ecology;
}
const waters = ecology => ecology.agents.filter(agent => agent.speciesId === 'blue-rockfish');
function baseRecords(storage, count = null) {
  const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: storage });
  for (let cz = -1; cz <= 1; cz++) for (let cx = 1; cx <= 3; cx++) {
    const region = ecology._create(cx, cz);
    if (cx === 2 && cz === 0 && count !== null) {
      const original = region.sim.agents.find(agent => agent.speciesId === 'purple-urchin');
      while (region.sim.agents.filter(agent => agent.speciesId !== 'giant-kelp').length < count) {
        const dead = { ...structuredClone(original), id: `legacy-dead:${region.sim.agents.length}`, alive: false, state: 'dead', energy: 0 };
        region.sim.agents.push(dead);
      }
    }
    storage.records.set(`kelp-ecology-v1:string:42|${region.id}`, ecology._record(region));
  }
}

test('coordinate allocation creates sparse coherent 4–6 member schools from real kelp hosts, independent of visit order', async () => {
  const a = await model(), b = await model();
  await b.update({ x: 900, z: 900 }); await b.update(origin);
  assert.deepEqual(waters(a), waters(b));
  const region = a._active.get('2,0'); assert.equal(region.waterAgents.length, 6);
  const groupIds = new Set(region.waterAgents.map(agent => agent.groupId)); assert.equal(groupIds.size, 1);
  assert.ok(region.waterAgents.every(agent => agent.sizeM >= .28 && agent.sizeM <= .34 && agent.regionId === '2,0'));
  assert.ok(a.snapshot().regions.every(region => region.agentCount <= 20));
  const beforeChunk = structuredClone(a.generator.chunk(2, 0));
  const hosts = [...region.sim.hostById.values()].map(plant => ({ id: plant.id, sceneryId: plant.sceneryId,
    anchor: region.sim.getKelpAnchor(plant.id), preyFraction: region.sim.preyPatches.find(patch => patch.hostId === plant.id).fraction }));
  const first = createKelpWaterCommunityPlan(a.generator, a.generator.chunk(2, 0), { seed: '42', hosts, capacity: 6 });
  const reverse = createKelpWaterCommunityPlan(a.generator, a.generator.chunk(2, 0), { seed: '42', hosts: [...hosts].reverse(), capacity: 6 });
  assert.deepEqual(first, reverse); assert.deepEqual(a.generator.chunk(2, 0), beforeChunk);
  assert.equal(createKelpWaterCommunityPlan(a.generator, a.generator.chunk(2, 0), { seed: '42', hosts, capacity: 3 }).placements.length, 0);
});

test('fixed-step frame partitions and reversed active Maps produce identical old and water-layer state', async () => {
  const a = await model(), b = await model(); b._active = new Map([...b._active].reverse());
  a.step(2, { currentMps: .55, hour: 10 });
  for (let index = 0; index < 120; index++) b.step(1 / 60, { currentMps: .55, hour: 10 });
  for (const [id, region] of a._active) assert.deepEqual(a._record(region), b._record(b._active.get(id)));
});

test('actual water movement respects nine-point bottom clearance, surface ceiling and total XYZ step budgets', async () => {
  const ecology = await model();
  const initial = new Map(waters(ecology).map(agent => [agent.id, { ...agent.position }]));
  for (let tick = 0; tick < 40; tick++) {
    const before = new Map(waters(ecology).map(agent => [agent.id, { ...agent.position }]));
    ecology.step(.1, { currentMps: .18, hour: 10 });
    for (const agent of waters(ecology)) {
      const old = before.get(agent.id), movement = Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z);
      assert.ok(movement <= KELP_WATER_MODEL.speedMps * .1 + 1e-8);
      assert.ok(Object.values(agent.position).every(Number.isFinite));
      assert.ok(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM,
        ecology._waterContext(ecology._active.get(agent.regionId))));
      for (const axis of ['x', 'y', 'z']) assert.equal(agent.velocity[axis], (agent.position[axis] - old[axis]) / .1);
    }
  }
  assert.ok(waters(ecology).some(agent => Math.hypot(agent.position.x - initial.get(agent.id).x,
    agent.position.y - initial.get(agent.id).y, agent.position.z - initial.get(agent.id).z) > .1));
});

test('food is debited only at the actual moving local prey reference with a successful near-distance bite', async () => {
  const ecology = await model(), region = ecology._active.get('2,0'), sim = region.sim;
  for (const animal of sim.agents) animal.nextBite = 1e9;
  const fish = region.waterAgents[0], context = ecology._waterContext(region);
  const patch = sim.preyPatches.find(patch => kelpWaterPositionValid(ecology.generator, sim._preyPosition(patch), fish.sizeM, context));
  assert.ok(patch); fish.position = sim._preyPosition(patch); fish.nextBite = 0;
  const before = sim.ledger.ingested, energy = fish.energy;
  ecology.step(.1, { currentMps: .18, foodSupply: 0, hour: 10 });
  assert.equal(fish.lastFeedAt, .1); assert.equal(fish.state, 'prey-feeding'); assert.ok(fish.energy > energy);
  assert.ok(Math.abs(sim.ledger.ingested - before - KELP_WATER_MODEL.feedingAmount) < 1e-10);
  assert.ok(Math.hypot(fish.position.x - sim._preyPosition(patch).x, fish.position.y - sim._preyPosition(patch).y,
    fish.position.z - sim._preyPosition(patch).z) <= .20);
  assert.ok(Math.abs(sim.metrics.resourceBudgetError) < 1e-10);
  const left = sim.preyPatches.reduce((total, item) => total + item.smallPrey, 0);
  for (const item of sim.preyPatches) item.smallPrey = 0;
  sim.ledger.exported += left; fish.nextBite = 0;
  const fed = fish.lastFeedAt, ingested = sim.ledger.ingested;
  ecology.step(.1, { foodSupply: 0, hour: 10 });
  assert.equal(fish.lastFeedAt, fed); assert.equal(sim.ledger.ingested, ingested);
});

test('distant local resources never feed a school member that cannot reach the food reference', async () => {
  const ecology = await model(), region = ecology._active.get('2,0'), sim = region.sim;
  for (const animal of sim.agents) animal.nextBite = 1e9;
  const fish = region.waterAgents[0]; fish.nextBite = 0;
  const before = sim.ledger.ingested;
  ecology.step(.1, { foodSupply: 0, hour: 10 });
  assert.equal(fish.lastFeedAt, null); assert.equal(sim.ledger.ingested, before);
  assert.ok(sim.preyPatches.some(patch => patch.smallPrey > 0));
});

test('zero-step pause preserves whole records and low light reduces activity without fabricated feeding or night-depth relocation', async () => {
  const ecology = await model(); ecology.step(.3);
  const before = [...ecology._active.values()].map(region => ecology._record(region));
  ecology.step(0, { currentMps: 0, hour: 0 });
  assert.deepEqual([...ecology._active.values()].map(region => ecology._record(region)), before);
  const positions = new Map(waters(ecology).map(agent => [agent.id, { ...agent.position }]));
  const feeds = new Map(waters(ecology).map(agent => [agent.id, agent.lastFeedAt]));
  ecology.step(.1, { hour: 0 });
  for (const agent of waters(ecology)) {
    const old = positions.get(agent.id);
    assert.equal(agent.state, 'resting'); assert.equal(agent.lastFeedAt, feeds.get(agent.id));
    assert.ok(Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z) <= .18 * .25 * .1 + 1e-8);
    assert.equal(agent.preferredDepthM, 12 - agent.schoolHome.y);
  }
});

test('one-time legacy upgrades preserve every old state field and initialize new clocks at the saved region time', async () => {
  const storage = store(); baseRecords(storage);
  const key = 'kelp-ecology-v1:string:42|2,0', record = storage.records.get(key);
  record.state.timeSec = 18.7; record.state._ticks = 187; record.state.extraLegacyField = { preserved: true };
  const before = JSON.stringify(record.state);
  const ecology = await model(storage), upgraded = ecology._record(ecology._active.get('2,0'));
  assert.equal(JSON.stringify(upgraded.state), before);
  assert.equal(upgraded.waterCommunityVersion, 1); assert.equal(upgraded.waterAgents.length, 6);
  assert.ok(upgraded.waterAgents.every(agent => agent.createdAtSec === 18.7 && agent.timeSec === 18.7 && agent.lastFeedAt === null));
  assert.equal(JSON.stringify(storage.records.get(key).state), before, 'upgrade was persisted before activation');
});

test('full and fewer-than-four-slot legacy records are marked examined and never replace or revive dead occupants', async () => {
  for (const count of [17, 20]) {
    const storage = store(); baseRecords(storage, count);
    const key = 'kelp-ecology-v1:string:42|2,0', before = JSON.stringify(storage.records.get(key).state);
    const ecology = await model(storage), record = ecology._record(ecology._active.get('2,0'));
    assert.equal(record.waterAgents.length, 0); assert.equal(record.waterCommunityVersion, 1);
    assert.equal(JSON.stringify(record.state), before); assert.equal(ecology.snapshot().regions.find(region => region.id === '2,0').agentCount, count);
    const reopened = await model(storage);
    assert.equal(reopened._active.get('2,0').waterAgents.length, 0);
    assert.equal(reopened._active.get('2,0').sim.agents.filter(agent => agent.alive === false).length,
      ecology._active.get('2,0').sim.agents.filter(agent => agent.alive === false).length);
  }
});

test('dead water records retain capacity and identity across ordinary reload and cannot trigger cohort refill', async () => {
  const storage = store(), ecology = await model(storage), region = ecology._active.get('2,0');
  for (const agent of region.waterAgents) { agent.alive = false; agent.state = 'dead'; agent.energy = 0; }
  const ids = region.waterAgents.map(agent => agent.id); await ecology.checkpoint();
  const reopened = await model(storage), restored = reopened._active.get('2,0');
  assert.deepEqual(restored.waterAgents.map(agent => agent.id), ids);
  assert.ok(restored.waterAgents.every(agent => !agent.alive));
  assert.equal(restored.waterCommunityAdded, 6); assert.equal(restored.waterAgents.length, 6);
});

test('failed compatibility saves publish only intact base records; later ordinary revisit commits just one cohort', async () => {
  const storage = store(); baseRecords(storage);
  // Isolate the water-only upgrade: the independent drift inventory has
  // already committed. Its own failed preactivation save must not publish a
  // region, and is covered separately by kelp-drift-ecology.test.mjs.
  await model(storage);
  for (const record of storage.records.values()) {
    assert.equal(record.driftCommunityVersion, 1);
    assert.ok(record.driftPatches.every(patch => patch.stock === 0));
    for (const field of ['waterCommunityVersion', 'waterCommunityAdded', 'waterInitializedAtSec', 'waterAgents', 'waterEverOccupied']) delete record[field];
  }
  const key = 'kelp-ecology-v1:string:42|2,0', original = structuredClone(storage.records.get(key));
  const save = storage.saveMany; storage.saveMany = async () => { throw new Error('upgrade denied'); };
  const ecology = await model(storage), active = ecology._record(ecology._active.get('2,0'));
  assert.deepEqual(active, original); assert.equal(ecology._active.get('2,0').waterAgents.length, 0);
  assert.deepEqual(storage.records.get(key), original);
  assert.equal(await ecology.checkpoint(), false); assert.deepEqual(storage.records.get(key), original);
  storage.saveMany = save;
  await ecology.checkpoint(); assert.equal(storage.records.get(key).waterCommunityVersion, undefined);
  await ecology.update({ x: 900, z: 900 }); await ecology.update(origin);
  assert.equal(ecology._active.get('2,0').waterAgents.length, 6);
  const added = ecology._active.get('2,0').waterAgents.map(agent => agent.id);
  await ecology.update({ x: 900, z: 900 }); await ecology.update(origin);
  assert.deepEqual(ecology._active.get('2,0').waterAgents.map(agent => agent.id), added);
});

test('a fresh save failure publishes no unsaved population and can retry without duplicate identities', async () => {
  const storage = store(), saving = storage.saveMany; storage.saveMany = async () => { throw new Error('initial save denied'); };
  const ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: storage });
  assert.equal(await ecology.update(origin), false); assert.equal(ecology.snapshot().agents.length, 0); assert.equal(storage.records.size, 0);
  storage.saveMany = saving; assert.equal(await ecology.update(origin), true);
  assert.equal(new Set(ecology.agents.map(agent => agent.id)).size, ecology.agents.length);
});

test('checkpoint, unload/revisit and reopen restore complete water records and the same next step', async () => {
  const storage = store(), ecology = await model(storage); ecology.step(.8, { currentMps: .4 });
  const before = ecology._record(ecology._active.get('2,0'));
  await ecology.update({ x: 900, z: 900 }); ecology.step(.5); await ecology.update(origin);
  assert.deepEqual(ecology._record(ecology._active.get('2,0')), before);
  await ecology.checkpoint(); const reopened = await model(storage);
  assert.deepEqual(waters(ecology), waters(reopened));
  ecology.step(.1, { currentMps: .2, hour: 12 }); reopened.step(.1, { currentMps: .2, hour: 12 });
  assert.deepEqual(waters(ecology), waters(reopened));
  await reopened.dispose(); assert.equal(reopened.agents.length, 0);
});

test('corrupt water ownership or live body clearance is rejected before any altered fish can be published', async () => {
  const originalStore = store(), valid = await model(originalStore); await valid.checkpoint();
  const key = 'kelp-ecology-v1:string:42|2,0', original = originalStore.records.get(key);
  const mutations = [record => { record.waterAgents[0].position.x += 128; },
    record => { record.waterAgents[0].schoolHome.z += 64; },
    record => { record.waterAgents[0].alive = false; record.waterAgents[0].position.x += 64; },
    record => { record.waterAgents[0].position.y = 12; }];
  for (const mutate of mutations) {
    const storage = store(); baseRecords(storage); const corrupt = structuredClone(original); mutate(corrupt); storage.records.set(key, corrupt);
    const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: storage });
    assert.equal(await reopened.update(origin), false);
    assert.equal(reopened._active.has('2,0'), false);
    assert.deepEqual(storage.records.get(key), corrupt, 'bad historical fish are never silently replaced');
    assert.match(reopened.snapshot().metrics.storageError, /owner|clearance/);
    assert.equal(reopened.agents.some(agent => agent.id === corrupt.waterAgents[0].id), false);
  }
});

// Actual observedBefore clock/pose from kelp-water-check.json. The local food
// proxy is supplied at its observed aggregate amount, with old animal bites
// disabled so this finite replay isolates the new school controller.
function intrusionFixture() {
  // The frozen 734.6s/803.8s poses were observed on support-v1 geometry.
  // Ordinary fresh model/allocation cases above retain the default v2 world.
  const storage = store(), ecology = new KelpOceanEcology('42', createKelpOceanGenerator('42', { supportVersion: 1 }), { store: storage });
  const region = ecology._create(1, -1);
  const common = { id: 'kelp-ocean:1,-1:blue-rockfish:kelp:kelp-rock:11,-1:1:0', regionId: '1,-1', speciesId: 'blue-rockfish',
    groupId: 'kelp-water-school:1,-1:kelp:kelp-rock:11,-1:1', schoolSlot: 0,
    schoolHome: { x: 114.03191317830185, y: .13887697048362213, z: -9.191333902556444 },
    preferredDepthM: 11.861123029516378, orbitRadiusM: .6, schoolRadiusM: 1.1822348291520028,
    schoolPhaseRad: 4.427372324388366, individualPhaseRad: 0, patrolPeriodSec: 122.78859668294899,
    position: { x: 115.04544394622751, y: .13887697048362213, z: -9.76712808429653 },
    velocity: { x: 0, y: 0, z: 0 }, heading: 5.998168651183263, sizeM: .29669475309550764,
    energy: .6945956800039859, state: 'schooling', alive: true, createdAtSec: 734.6, stateSince: 734.6,
    lastFeedAt: null, nextBite: 736.3182841305621, timeSec: 734.6, habitat: 'kelp-edge-water-column',
    sourceHostId: 'kelp-ocean:1,-1:giant-kelp-2', sourceSceneryId: 'kelp:kelp-rock:11,-1:1' };
  region.waterAgents = Array.from({ length: 6 }, (_, index) => {
    const agent = structuredClone(common), phase = index * Math.PI * 2 / 6;
    agent.id = common.id.slice(0, -1) + index; agent.schoolSlot = index; agent.individualPhaseRad = phase;
    agent.position = { x: common.schoolHome.x + Math.cos(common.schoolPhaseRad) * .6 + Math.cos(phase) * common.schoolRadiusM,
      y: common.schoolHome.y + Math.sin(phase) * .12,
      z: common.schoolHome.z + Math.sin(common.schoolPhaseRad) * .6 + Math.sin(phase) * common.schoolRadiusM };
    return agent;
  });
  region.waterAgents[0] = structuredClone(common);
  region.waterCommunityVersion = 1; region.waterCommunityAdded = 6; region.waterInitializedAtSec = 734.6;
  region.sim._ticks = 7346; region.sim.timeSec = 734.6;
  region.sim.environment = { currentMps: .18, deformationCurrentMps: .18, turbidity: .35, foodSupply: 1, hour: 10.133749999998738 };
  for (const animal of region.sim.agents) animal.nextBite = 1e9;
  for (const patch of region.sim.preyPatches) patch.smallPrey = .16546513093663898 / region.sim.preyPatches.length;
  region.sim.ledger = { initial: Object.values(region.sim.resources).reduce((a, b) => a + b, 0), input: 0, ingested: 0, exported: 0 };
  ecology._active.set(region.id, region);
  return { ecology, region };
}

test('the actual 734.6s school pose remains clear through a 120s moving-stipe reference replay', () => {
  const { ecology, region } = intrusionFixture();
  const id = region.waterAgents[0].id;
  let maximumMovement = 0;
  for (let tick = 0; tick < 1200; tick++) {
    const before = new Map(region.waterAgents.map(agent => [agent.id, { ...agent.position }]));
    ecology.step(.1, { currentMps: .18, foodSupply: 1, hour: 10 + tick / 36000 });
    const context = ecology._waterContext(region);
    for (const agent of region.waterAgents) {
      assert.ok(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM, context), `${agent.id} at ${region.sim.timeSec}`);
      const old = before.get(agent.id), movement = Math.hypot(agent.position.x - old.x, agent.position.y - old.y, agent.position.z - old.z);
      maximumMovement = Math.max(maximumMovement, movement); assert.ok(movement <= .018 + 1e-8);
    }
  }
  assert.equal(region.waterAgents[0].id, id); assert.ok(maximumMovement > .01);
  assert.ok(Math.abs(region.sim.metrics.resourceBudgetError) < 1e-8);
});

test('the actual 803.8s historical 24.9mm stipe intrusion recovers monotonically without a snap or food debit', () => {
  const { ecology, region } = intrusionFixture(), fish = region.waterAgents[0];
  region.sim._ticks = 8038; region.sim.timeSec = 803.8;
  fish.position = { x: 115.6177658162436, y: .14808856399355308, z: -6.493953340573132 };
  fish.velocity = { x: 0, y: 0, z: 0 }; fish.timeSec = 803.8; fish.lastFeedAt = 771.8000000000001;
  let context = ecology._waterContext(region);
  const firstGap = kelpWaterDynamicClearance(fish.position, fish.sizeM, context);
  assert.ok(firstGap < -.024 && firstGap > -.026); assert.ok(!kelpWaterPositionValid(ecology.generator, fish.position, fish.sizeM, context));
  const paused = ecology._record(region); ecology.step(0); assert.deepEqual(ecology._record(region), paused);
  let previousGap = firstGap;
  const feedAt = fish.lastFeedAt;
  for (let tick = 0; tick < 4; tick++) {
    const old = { ...fish.position }; ecology.step(.1, { currentMps: .18, hour: 10 }); context = ecology._waterContext(region);
    const gap = kelpWaterDynamicClearance(fish.position, fish.sizeM, context);
    if (previousGap < KELP_WATER_MODEL.avoidanceMarginM) {
      assert.ok(gap > previousGap, 'each bounded recovery step improves the actual moving-reference margin');
    } else {
      assert.ok(gap >= KELP_WATER_MODEL.avoidanceMarginM, 'normal motion resumes only with the preventive clearance margin');
    }
    assert.ok(Math.hypot(fish.position.x - old.x, fish.position.y - old.y, fish.position.z - old.z) <= .018 + 1e-8);
    assert.equal(fish.lastFeedAt, feedAt); previousGap = gap;
  }
  assert.ok(kelpWaterPositionValid(ecology.generator, fish.position, fish.sizeM, context));
  assert.equal(fish.id, 'kelp-ocean:1,-1:blue-rockfish:kelp:kelp-rock:11,-1:1:0');
});

test('allocation validates at the accepted saved clock and deformation environment rather than an empty initial phase', () => {
  const { ecology, region } = intrusionFixture();
  const hosts = [...region.sim.hostById.values()].map(plant => ({ id: plant.id, sceneryId: plant.sceneryId,
    anchor: region.sim.getKelpAnchor(plant.id), preyFraction: region.sim.preyPatches.find(patch => patch.hostId === plant.id).fraction }));
  for (const timeSec of [734.6, 803.8, 1245.8]) {
    const environment = { currentMps: .9, deformationCurrentMps: .65, turbidity: .35, foodSupply: 1, hour: 10 };
    const plan = createKelpWaterCommunityPlan(ecology.generator, ecology.generator.chunk(1, -1),
      { seed: '42', hosts, timeSec, environment, capacity: 6 });
    assert.ok(plan.placements.length >= 4);
    for (const agent of plan.placements) assert.ok(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM,
      { ...ecology._waterContext(region), timeSec, environment, dynamicMarginM: KELP_WATER_MODEL.avoidanceMarginM }));
  }
});
