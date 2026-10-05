import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DeepSimulation } from '../src/deepSimulation.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DEEP_PREDATOR_PARAMETERS as P } from '../src/deepPredatorSpecies.js';
import { upgradeDeepPredators, advanceDeepPredators, predatorEnergyBudgetError, feedDeepPredator, nearestDeepPredatorContact, deepPredatorSupportedPose } from '../src/deepPredatorEcology.js';
import { seaSpiderReferencePose, seaSpiderMouthWorld, anemoneTentacleReferences } from '../src/deepSeaSpiderGeometry.js';

const clone = value => structuredClone(value);
const baseline = JSON.parse(fs.readFileSync(new URL('../output/validation/deep-predator-default-before.json', import.meta.url), 'utf8'));
const nativeState = sim => clone(Object.fromEntries(baseline.fields.map(field => [field, sim[field]])));
const start = { x: 131, z: 5 }, away = { x: 835, z: -251 };
const world = 'deep-ecology-v1:string:42';
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => ecology._record(region));
function memoryStore() {
  const records = new Map();
  return { available: true, records, load: async (namespace, id) => clone(records.get(`${namespace}|${id}`) ?? null),
    async saveMany(namespace, entries) { for (const [id, state] of entries) records.set(`${namespace}|${id}`, clone(state)); },
    async clear(namespace) { for (const key of records.keys()) if (key.startsWith(`${namespace}|`)) records.delete(key); } };
}
async function model(storage = memoryStore(), seed = '42', position = start) {
  const ecology = new DeepOceanEcology(seed, createDeepOceanGenerator(seed), { store: storage });
  assert.equal(await ecology.update(position), true); return ecology;
}
function predators(ecology) { return [...ecology._active.values()].flatMap(region => region.predatorAgents ?? []); }
function occupied(ecology) {
  const region = [...ecology._active.values()].find(region => region.predatorAgents?.length);
  assert.ok(region, 'The fixed generated fixture must contain its deterministic sparse predator.');
  return region;
}
function baseRecord(ecology, cx, cz) {
  const record = ecology._record(ecology._create(cx, cz));
  for (const key of ['predatorCommunityVersion', 'predatorAgents', 'predatorEnergyLedger', 'predatorEvents', 'predatorCounters']) delete record[key];
  return record;
}
function oldWindow(storage, ecology) {
  for (let cz = -1; cz <= 1; cz++) for (let cx = 1; cx <= 3; cx++) {
    const record = baseRecord(ecology, cx, cz);
    storage.records.set(`${world}|${record.id}`, record);
  }
}
const nativeBalance = sim => sim.energyLedger.initial + sim.energyLedger.feedingGain - sim.energyLedger.maintenanceAndMotionDebit +
  sim.energyLedger.clampCorrection - (sim.energyLedger.predationTransferredOut ?? 0) - sim.agents.reduce((sum, animal) => sum + animal.energy, 0);
function setPreyEnergy(region, prey, value) {
  region.sim.energyLedger.initial += value - prey.energy; prey.energy = value;
}
function setPredatorEnergy(region, predator, value) {
  region.predatorEnergyLedger.initial += value - predator.energy; predator.energy = value;
}

test('the three pre-edit authored seeds retain complete initial and ten-second native states, metrics and source hashes', () => {
  for (const [path, expected] of Object.entries(baseline.sourceHashes)) {
    // The only permitted native source addition is optional regional predation
    // accounting in metrics; exact authored states and metrics remain below.
    if (path.endsWith('/deepSimulation.js')) continue;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(new URL(path, import.meta.url))).digest('hex');
    assert.equal(actual, expected);
  }
  for (const entry of baseline.cases) {
    const sim = new DeepSimulation(entry.seed);
    assert.deepEqual(nativeState(sim), entry.initial);
    assert.equal(sim.agents.length, 16);
    assert.deepEqual([...new Set(sim.agents.map(agent => agent.speciesId))].sort(), ['pom-pom-anemone', 'rattail-family', 'sea-pig-group']);
    sim.step(entry.seconds); assert.deepEqual(nativeState(sim), entry.after); assert.deepEqual(sim.metrics, entry.metrics);
  }
});

test('sparse allocation is coordinate deterministic and adds a genus category without consuming native randomness or changing old state', async () => {
  const a = await model(), b = await model(); await b.update(away); await b.update(start);
  assert.deepEqual(records(a), records(b));
  assert.ok(predators(a).length > 0 && predators(a).length < 9);
  const identities = new Set();
  for (const region of a._active.values()) {
    assert.equal(region.predatorCommunityVersion, 1);
    assert.deepEqual(nativeState(region.sim), nativeState(a._create(region.cx, region.cz).sim));
    assert.ok(region.sim.agents.length + region.predatorAgents.length <= 20);
    assert.ok(region.predatorAgents.length <= 1);
    for (const predator of region.predatorAgents) {
      assert.ok(!identities.has(predator.id)); identities.add(predator.id);
      assert.equal(predator.speciesId, 'giant-sea-spider-group'); assert.equal(predator.taxonomicLevel, 'genus');
      assert.ok(predator.sizeM >= .2 && predator.sizeM <= .4);
      assert.ok(region.sim.agents.some(prey => prey.speciesId === 'pom-pom-anemone' && prey.alive));
      close(predatorEnergyBudgetError(region), 0);
      assert.equal(region.sim.energyLedger.predationTransferredOut, undefined);
    }
  }
});

test('the one-time capacity decision counts dead old occupants and never refills empty or dead predator cohorts', async () => {
  const ecology = await model(), example = occupied(ecology);
  const full = ecology._create(example.cx, example.cz), before = nativeState(full.sim);
  while (full.sim.agents.length < 20) full.sim.agents.push({ ...clone(full.sim.agents[0]), id: `dead-capacity-${full.sim.agents.length}`, alive: false, state: 'dead' });
  const capped = nativeState(full.sim);
  upgradeDeepPredators(full, { seed: ecology.seed, supportHeight: (x, z) => ecology.generator.heightAt(x, z) });
  assert.equal(full.predatorCommunityVersion, 1); assert.equal(full.predatorAgents.length, 0); assert.deepEqual(nativeState(full.sim), capped);
  full.sim.agents.pop(); upgradeDeepPredators(full, { seed: ecology.seed, supportHeight: (x, z) => ecology.generator.heightAt(x, z) });
  assert.equal(full.predatorAgents.length, 0); assert.equal(full.sim._rngState, before._rngState);
  const empty = ecology._create(example.cx, example.cz);
  for (const prey of empty.sim.agents.filter(agent => agent.speciesId === 'pom-pom-anemone')) { prey.alive = false; prey.state = 'dead'; }
  upgradeDeepPredators(empty, { seed: ecology.seed, supportHeight: (x, z) => ecology.generator.heightAt(x, z) });
  assert.equal(empty.predatorAgents.length, 0);
  for (const prey of empty.sim.agents.filter(agent => agent.speciesId === 'pom-pom-anemone')) { prey.alive = true; prey.state = 'attached-waiting'; }
  upgradeDeepPredators(empty, { seed: ecology.seed, supportHeight: (x, z) => ecology.generator.heightAt(x, z) });
  assert.equal(empty.predatorAgents.length, 0);
  const spider = example.predatorAgents[0]; spider.alive = false; spider.state = 'dead';
  const dead = clone(spider); ecology.step(1); assert.deepEqual(example.predatorAgents, [dead]);
  upgradeDeepPredators(example, { seed: ecology.seed, supportHeight: (x, z) => ecology.generator.heightAt(x, z) });
  assert.deepEqual(example.predatorAgents, [dead]);
});

test('legacy preactivation upgrades preserve every old native field, death, unknown extension and both old ledgers', async () => {
  const storage = memoryStore(), source = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage }); oldWindow(storage, source);
  const original = clone(storage.records.get(`${world}|2,0`));
  original.state.extraLegacyField = { note: 'retain opaque state', rows: [1, 2, 3] };
  original.archivalMetadata = { retained: true };
  original.state.agents[0].alive = false; original.state.agents[0].state = 'dead';
  storage.records.set(`${world}|2,0`, clone(original));
  const ecology = await model(storage), upgraded = ecology._record(ecology._active.get('2,0'));
  assert.deepEqual(upgraded.state, original.state); assert.deepEqual(upgraded.archivalMetadata, original.archivalMetadata);
  assert.equal(upgraded.predatorCommunityVersion, 1); assert.equal(upgraded.state.energyLedger.predationTransferredOut, undefined);
  const paused = records(ecology); ecology.step(0, { observerLight: 0, hour: 23 }); assert.deepEqual(records(ecology), paused);
  await ecology.checkpoint(); assert.deepEqual(storage.records.get(`${world}|2,0`), upgraded);
});

test('throwing or uncommitted metadata writes cannot publish an unsaved new cohort and retry preserves the old native record', async () => {
  for (const rejection of ['throw', 'null']) {
    const storage = memoryStore(), ecology = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage }); oldWindow(storage, ecology);
    const old = clone(storage.records.get(`${world}|1,-1`)), save = storage.saveMany; let reject = true;
    storage.saveMany = async (...args) => { if (reject) { if (rejection === 'throw') throw new Error('upgrade rejected'); return null; } return save(...args); };
    assert.equal(await ecology.update(start), false);
    assert.ok(!ecology._active.has('1,-1')); assert.deepEqual(storage.records.get(`${world}|1,-1`), old);
    reject = false; assert.equal(await ecology.update(start), true);
    const next = ecology._record(ecology._active.get('1,-1'));
    assert.deepEqual(next.state, old.state); assert.equal(next.predatorCommunityVersion, 1);
    const stable = records(ecology); await ecology.update(start); assert.deepEqual(records(ecology), stable);
  }
});

test('a sequential legacy store keeps exact native evolution and creates no new regional predator category', async () => {
  const storage = memoryStore(); delete storage.saveMany;
  storage.save = async (namespace, id, state) => storage.records.set(`${namespace}|${id}`, clone(state));
  const ecology = await model(storage); assert.equal(predators(ecology).length, 0);
  const controls = new Map([...ecology._active.values()].map(region => [region.id, ecology._create(region.cx, region.cz).sim]));
  ecology.step(3, { foodSupply: 0, currentMps: .2 });
  for (const region of ecology._active.values()) {
    const control = controls.get(region.id);
    for (let tick = 0; tick < 30; tick++) { Object.assign(control.environment, ecology.environment); control.step(.1); }
    assert.deepEqual(nativeState(region.sim), nativeState(control)); assert.equal(region.sim.energyLedger.predationTransferredOut, undefined);
  }
});

let replayPromise;
function naturalReplay() {
  return replayPromise ??= (async () => {
    const ecology = await model(), first = new Map(), states = new Set(predators(ecology).map(agent => agent.state));
    const initial = new Map(predators(ecology).map(agent => [agent.id, clone(agent.position)]));
    for (let tick = 0; tick < 1600; tick++) {
      const old = new Map(predators(ecology).map(agent => [agent.id, clone(agent.position)]));
      ecology.step(.1);
      for (const region of ecology._active.values()) for (const spider of region.predatorAgents) {
        states.add(spider.state);
        const before = old.get(spider.id), travel = Math.hypot(spider.position.x - before.x, spider.position.y - before.y, spider.position.z - before.z);
        assert.ok(travel <= .0006 + 1e-10, `Full XYZ crawl budget exceeded: ${travel}`);
        const pose = seaSpiderReferencePose(spider), floor = ecology.generator.heightAt(spider.position.x, spider.position.z);
        assert.ok(spider.position.y >= floor - 1e-8 && spider.position.y <= floor + spider.sizeM * .12 + 1e-8);
        assert.equal(pose.feetWorld.length, 8);
        for (const foot of pose.feetWorld) {
          close(foot.y, ecology.generator.heightAt(foot.x, foot.z), 1e-8);
          assert.equal(Math.floor(foot.x / 64), region.cx); assert.equal(Math.floor(foot.z / 64), region.cz);
        }
        for (const point of [pose.bodyWorld, pose.mouthWorld]) assert.ok(point.y >= ecology.generator.heightAt(point.x, point.z) - 1e-8);
        assert.deepEqual(pose.bodyWorld, spider.bodyReferenceWorld); assert.deepEqual(pose.mouthWorld, spider.mouthReferenceWorld);
        if (spider.lastFeedAt !== null && !first.has(spider.id)) first.set(spider.id, ecology._record(region));
      }
    }
    await ecology.checkpoint();
    return { ecology, first, states, initial };
  })();
}
async function fedFixture() {
  const replay = await naturalReplay();
  assert.ok(replay.first.size, 'At least one fixed generated animal must naturally touch and feed within 160 seconds.');
  const record = clone([...replay.first.values()][0]);
  const region = replay.ecology._restore(record, record.cx, record.cz), spider = region.predatorAgents[0];
  const prey = region.sim.agents.find(agent => agent.id === spider.lastPredation.targetId);
  assert.ok(prey); return { ...replay, region, spider, prey, supportHeight: (x, z) => replay.ecology.generator.heightAt(x, z) };
}

test('normal generated steps complete search, supported approach and actual mouth contact with closed condition and organic-food ledgers', async () => {
  const { ecology, first, states, initial } = await naturalReplay();
  assert.ok(states.has('searching-anemone')); assert.ok(states.has('approaching-anemone')); assert.ok(states.has('proboscis-feeding'));
  assert.ok(first.size > 0);
  for (const record of first.values()) {
    const spider = record.predatorAgents[0], event = spider.lastPredation;
    assert.ok(Math.hypot(spider.position.x - initial.get(spider.id).x, spider.position.y - initial.get(spider.id).y, spider.position.z - initial.get(spider.id).z) > .1);
    assert.ok(event.timeSec > 1 && event.timeSec <= 160);
    assert.ok(event.removedUnits > 0 && event.contactDistanceM <= .004 + 1e-10);
    close(event.preyEnergyBefore - event.preyEnergyAfter, event.removedUnits);
    close(event.predatorEnergyAfter - event.predatorEnergyBefore, event.gainUnits);
    close(event.gainUnits, event.removedUnits * .8); close(event.lossUnits, event.removedUnits * .2);
    assert.ok(event.referenceId.startsWith('tentacle:'));
    assert.ok(record.state.agents.find(agent => agent.id === event.targetId).alive);
  }
  for (const region of ecology._active.values()) {
    close(nativeBalance(region.sim), 0, 1e-8); close(predatorEnergyBudgetError(region), 0, 1e-8);
    close(region.sim.metrics.resourceBudgetError, 0, 1e-8);
    close(region.predatorEnergyLedger.transferredIn, region.sim.energyLedger.predationTransferredOut ?? 0);
    const l = region.predatorEnergyLedger;
    close(region.predatorAgents.reduce((sum, spider) => sum + spider.energy, 0), l.initial + l.transferredIn - l.metabolism - l.loss);
    assert.ok(region.predatorEvents.length <= 40);
  }
  const snapshot = ecology.snapshot();
  assert.equal(snapshot.metrics.primaryProduction, 0); assert.equal(snapshot.metrics.naturalLightLevel, 0);
  close(snapshot.metrics.energyBalanceError, 0, 1e-8);
});

test('the shared eight-foot yaw transform follows actual support and rejects body, along-leg terrain and owner-boundary penetration', () => {
  const agent = { position: { x: 150, y: 0, z: 20 }, heading: Math.PI / 2, sizeM: .3 };
  const terrain = (x, z) => .005 * (x - 150) + .003 * (z - 20);
  const pose = seaSpiderReferencePose(agent, terrain);
  assert.equal(pose.feetWorld.length, 8);
  for (let index = 0; index < 8; index++) {
    const local = pose.contactPointsLocal[index], worldPoint = pose.feetWorld[index];
    close(worldPoint.x, 150 - .3 * local.z); close(worldPoint.z, 20 + .3 * local.x); close(worldPoint.y, terrain(worldPoint.x, worldPoint.z));
    close(Math.hypot(local.x, local.z), .5);
  }
  close(pose.mouthWorld.x, 150); close(pose.mouthWorld.z, 20 + .3 * .32); close(pose.mouthWorld.y, .3 * .07);
  const region = { cx: 2, cz: 0, sim: { agents: [] } };
  assert.ok(deepPredatorSupportedPose(agent, region, terrain));
  const obstruction = (x, z) => Math.abs(x - 150) < .005 && Math.abs(z - 20) < .005 ? .05 : 0;
  assert.equal(deepPredatorSupportedPose(agent, region, obstruction), null);
  const joint = pose.legsLocal[0][2], priorJoint = pose.legsLocal[0][1];
  const midpoint = { x: 150 - .3 * (joint.z + priorJoint.z) / 2, z: 20 + .3 * (joint.x + priorJoint.x) / 2 };
  const ridge = (x, z) => Math.hypot(x - midpoint.x, z - midpoint.z) < .0001 ? .09 : 0;
  assert.equal(deepPredatorSupportedPose(agent, region, ridge), null);
  assert.equal(deepPredatorSupportedPose({ ...agent, position: { x: 128.01, y: 0, z: 20 } }, region, () => 0), null);
});

test('positive mouth intake debits only the existing living anemone condition, records assimilation loss and leaves organic pools untouched', async () => {
  const { region, spider, prey, supportHeight } = await fedFixture(); spider.nextBite = region.sim.timeSec;
  const before = { prey: prey.energy, spider: spider.energy, foods: clone(region.sim.resources), foodLedger: clone(region.sim.ledger),
    native: clone(region.sim.energyLedger), predator: clone(region.predatorEnergyLedger), nativeRng: region.sim._rngState, preyPosition: clone(prey.position) };
  const removed = feedDeepPredator(spider, prey, region, .1, supportHeight);
  close(removed, .00003); close(prey.energy, before.prey - removed); close(spider.energy, before.spider + removed * .8);
  close(region.sim.energyLedger.predationTransferredOut - before.native.predationTransferredOut, removed);
  close(region.predatorEnergyLedger.transferredIn - before.predator.transferredIn, removed);
  close(region.predatorEnergyLedger.loss - before.predator.loss, removed * .2);
  assert.deepEqual(region.sim.resources, before.foods); assert.deepEqual(region.sim.ledger, before.foodLedger);
  assert.equal(region.sim._rngState, before.nativeRng); assert.deepEqual(prey.position, before.preyPosition);
  assert.equal(prey.alive, true); close(nativeBalance(region.sim), 0, 1e-8); close(predatorEnergyBudgetError(region), 0, 1e-8);
  const event = spider.lastPredation;
  const mouth = seaSpiderMouthWorld(spider), reference = anemoneTentacleReferences(prey, region.sim.timeSec, region.sim.environment).find(point => point.referenceId === event.referenceId);
  assert.deepEqual(event.mouthPosition, mouth); assert.deepEqual(event.preyContactPosition, reference);
});

test('span and body proximity, dead prey, empty condition, satiation and a closed bite timer never fabricate intake', async () => {
  for (const mode of ['remote-mouth', 'dead', 'floor', 'satiated', 'future-bite']) {
    const { region, spider, prey, supportHeight } = await fedFixture(); spider.nextBite = region.sim.timeSec;
    if (mode === 'remote-mouth') {
      // Reverse the head at the already touching root. This keeps its physical
      // span near the prey while placing the actual proboscis point away.
      spider.heading += Math.PI;
      assert.ok(Math.hypot(spider.position.x - prey.position.x, spider.position.z - prey.position.z) < spider.sizeM / 2 + prey.sizeM / 2);
      assert.ok(nearestDeepPredatorContact(spider, prey, region.sim.timeSec, region.sim.environment).distanceM > .004);
    }
    if (mode === 'dead') { prey.alive = false; prey.state = 'dead'; }
    if (mode === 'floor') setPreyEnergy(region, prey, .08);
    if (mode === 'satiated') setPredatorEnergy(region, spider, .85);
    if (mode === 'future-bite') spider.nextBite = region.sim.timeSec + 1;
    const before = { prey: clone(prey), spider: clone(spider), native: clone(region.sim.energyLedger), predator: clone(region.predatorEnergyLedger), events: clone(region.predatorEvents) };
    assert.equal(feedDeepPredator(spider, prey, region, .1, supportHeight), 0, mode);
    assert.deepEqual({ prey, spider, native: region.sim.energyLedger, predator: region.predatorEnergyLedger, events: region.predatorEvents }, before);
  }
});

test('the prey floor limits actual debit and a large unsupported interval cannot bypass the fixed-step intake bound', async () => {
  const a = await fedFixture(); a.spider.nextBite = a.region.sim.timeSec; setPreyEnergy(a.region, a.prey, .08001);
  const gainBefore = a.spider.energy, amount = feedDeepPredator(a.spider, a.prey, a.region, .1, a.supportHeight);
  close(amount, .00001); close(a.prey.energy, .08); close(a.spider.energy - gainBefore, amount * .8);
  a.spider.nextBite = a.region.sim.timeSec; assert.equal(feedDeepPredator(a.spider, a.prey, a.region, .1, a.supportHeight), 0);
  close(nativeBalance(a.region.sim), 0, 1e-8); close(predatorEnergyBudgetError(a.region), 0, 1e-8);
  // A finite large requested intake cannot become a shortcut around normal
  // integration's .1-second intake cap or the hungry/satiated decision.
  const b = await fedFixture(); b.spider.nextBite = b.region.sim.timeSec; setPreyEnergy(b.region, b.prey, 1); setPredatorEnergy(b.region, b.spider, .849);
  const before = clone({ spider: b.spider, prey: b.prey, ledger: b.region.predatorEnergyLedger, native: b.region.sim.energyLedger });
  assert.equal(feedDeepPredator(b.spider, b.prey, b.region, 3000, b.supportHeight), 0);
  assert.deepEqual({ spider: b.spider, prey: b.prey, ledger: b.region.predatorEnergyLedger, native: b.region.sim.energyLedger }, before);
  close(nativeBalance(b.region.sim), 0, 1e-8); close(predatorEnergyBudgetError(b.region), 0, 1e-8);
});

test('observer light and hour changes cannot grant energy, food or extra predation at an actual contact pose', async () => {
  const { ecology: replay, first } = await naturalReplay(), record = clone([...first.values()][0]);
  const a = new DeepOceanEcology('42', replay.generator, { store: memoryStore() }), b = new DeepOceanEcology('42', replay.generator, { store: memoryStore() });
  for (const ecology of [a, b]) ecology._active.set(record.id, ecology._restore(record, record.cx, record.cz));
  const paused = records(a); a.step(0, { observerLight: 0, hour: 0 }); assert.deepEqual(records(a), paused);
  a.step(5, { observerLight: 0, hour: 0 }); b.step(5, { observerLight: 1, hour: 12 });
  const withoutObservation = ecology => records(ecology).map(row => { delete row.state.environment; return row; });
  assert.deepEqual(withoutObservation(a), withoutObservation(b));
  assert.ok(a._active.get(record.id).predatorEnergyLedger.transferredIn > record.predatorEnergyLedger.transferredIn);
  for (const ecology of [a, b]) {
    assert.equal(ecology.snapshot().metrics.primaryProduction, 0); assert.equal(ecology.snapshot().metrics.totalPrimaryProduction, 0);
    close(ecology.snapshot().metrics.energyBalanceError, 0, 1e-8);
  }
});

test('no living eligible target leaves the predator searching with maintenance only and no invented debit or successful timestamp', async () => {
  const ecology = await model(), region = occupied(ecology), spider = region.predatorAgents[0];
  for (const prey of region.sim.agents.filter(agent => agent.speciesId === 'pom-pom-anemone')) { prey.alive = false; prey.state = 'dead'; }
  const before = clone(spider), ledger = clone(region.predatorEnergyLedger);
  ecology.step(.1, { foodSupply: 0 });
  assert.equal(spider.state, 'searching-no-prey'); assert.equal(spider.targetPreyId, null); assert.equal(spider.lastFeedAt, null);
  assert.deepEqual(spider.position, before.position); assert.deepEqual(spider.velocity, { x: 0, y: 0, z: 0 });
  close(spider.energy, before.energy - .0000035); close(region.predatorEnergyLedger.metabolism - ledger.metabolism, .0000035);
  assert.equal(region.predatorEnergyLedger.transferredIn, 0); assert.equal(region.sim.energyLedger.predationTransferredOut, undefined);
  assert.equal(region.predatorCounters.feedingCount, 0); assert.equal(region.predatorEvents.length, 0);
  close(predatorEnergyBudgetError(region), 0);
});

test('an additive cohort remains unpublished during its preactivation save, including public getter and checkpoint calls', async () => {
  const storage = memoryStore(), ecology = new DeepOceanEcology('42', createDeepOceanGenerator('42'), { store: storage }); oldWindow(storage, ecology);
  const original = clone(storage.records.get(`${world}|1,-1`)), save = storage.saveMany;
  let release, waiting;
  storage.saveMany = async (namespace, entries) => {
    if (!waiting) { waiting = clone(entries); await new Promise(resolve => { release = resolve; }); }
    return save(namespace, entries);
  };
  const pending = ecology.update(start);
  for (let turn = 0; turn < 10 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(waiting[0][1].predatorCommunityVersion, 1);
  assert.ok(waiting[0][1].predatorAgents.length > 0);
  assert.equal(ecology.agents.length, 0); assert.equal(ecology._active.size, 0);
  ecology.step(1); assert.deepEqual(storage.records.get(`${world}|1,-1`), original);
  const checkpoint = ecology.checkpoint(); release(); assert.equal(await pending, true); await checkpoint;
  assert.deepEqual(ecology._record(ecology._active.get('1,-1')).state, original.state);
  assert.deepEqual(storage.records.get(`${world}|1,-1`), ecology._record(ecology._active.get('1,-1')));
});

test('queued checkpoint captures current paired native/predator state and failed atomic unload freezes both sides until retry', async () => {
  const replay = await naturalReplay(), storage = memoryStore();
  for (const [key, value] of replay.ecology.store.records) storage.records.set(key, clone(value));
  const ecology = await model(storage), queued = ecology.checkpoint(); ecology.step(.1); const current = records(ecology); await queued;
  for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  const save = storage.saveMany; let release, offered;
  storage.saveMany = (namespace, entries) => { offered = clone(entries); return new Promise(resolve => { release = resolve; }); };
  const pending = ecology.update(away);
  for (let turn = 0; turn < 10 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(offered.length, 9); assert.equal(ecology._locked.size, 9);
  ecology.step(1); assert.deepEqual(records(ecology), current);
  for (const [, record] of offered) {
    close(record.predatorEnergyLedger.transferredIn, record.state.energyLedger.predationTransferredOut ?? 0);
    assert.ok(Array.isArray(record.predatorAgents));
  }
  release(null); assert.equal(await pending, false); assert.deepEqual(records(ecology), current); assert.equal(ecology._locked.size, 0);
  for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  storage.saveMany = save; assert.equal(await ecology.update(away), true);
  ecology.step(7); for (const record of current) assert.deepEqual(storage.records.get(`${world}|${record.id}`), record);
  assert.equal(await ecology.update(start), true); assert.deepEqual(records(ecology), current);
  const reopened = await model(storage); assert.deepEqual(records(reopened), records(ecology));
  ecology.step(.1); reopened.step(.1); assert.deepEqual(records(ecology), records(reopened));
});

test('strict predator restore rejects impossible ownership, support, target, clock, contact proof and energy without regenerating the category', async () => {
  const replay = await naturalReplay(), record = clone([...replay.first.values()][0]);
  const mutations = [
    row => { row.predatorAgents[0].home.x += 64; },
    row => { row.predatorAgents[0].contactPointsLocal[0].y += .1; },
    row => { row.predatorAgents[0].mouthReferenceWorld.y += .1; },
    row => { row.predatorAgents[0].targetPreyId = row.state.agents.find(agent => agent.speciesId === 'sea-pig-group').id; },
    row => { row.predatorAgents[0].stateSince = row.state.timeSec + 1; },
    row => { row.predatorAgents[0].lastContact.preyContactPosition.x += .1; },
    row => { row.predatorAgents[0].lastPredation.preyPose.heading += .1; },
    row => { row.predatorEnergyLedger.transferredIn += .01; },
    row => { row.state.energyLedger.predationTransferredOut = -1; },
  ];
  for (const mutate of mutations) {
    const corrupt = clone(record); mutate(corrupt);
    const storage = memoryStore(); for (const [key, value] of replay.ecology.store.records) storage.records.set(key, clone(value));
    storage.records.set(`${world}|${record.id}`, corrupt);
    const ecology = new DeepOceanEcology('42', replay.ecology.generator, { store: storage });
    assert.equal(await ecology.update(start), false); assert.ok(!ecology._active.has(record.id));
    assert.deepEqual(storage.records.get(`${world}|${record.id}`), corrupt); assert.equal(ecology._counts.generated, 0);
    storage.records.set(`${world}|${record.id}`, clone(record)); assert.equal(await ecology.update(start), true);
    assert.deepEqual(ecology._record(ecology._active.get(record.id)), record);
  }
});

test('saved predator death keeps its identity, supported pose, completed feeding history and native prey debit through unload, revisit and refresh', async () => {
  const replay = await naturalReplay(), storage = memoryStore();
  for (const [key, value] of replay.ecology.store.records) storage.records.set(key, clone(value));
  const ecology = await model(storage), region = [...ecology._active.values()].find(region => region.predatorAgents[0]?.lastFeedAt !== null && region.predatorAgents.length);
  assert.ok(region); const spider = region.predatorAgents[0];
  region.predatorEnergyLedger.metabolism += spider.energy; spider.energy = 0; spider.hunger = 1; spider.alive = false;
  spider.state = 'dead'; spider.velocity = { x: 0, y: 0, z: 0 }; region.predatorCounters.deathCount++;
  await ecology.checkpoint(); const dead = clone(spider), ledger = clone(region.predatorEnergyLedger), nativeDebit = region.sim.energyLedger.predationTransferredOut;
  ecology.step(1); assert.deepEqual(region.predatorAgents, [dead]); assert.deepEqual(region.predatorEnergyLedger, ledger);
  assert.equal(region.sim.energyLedger.predationTransferredOut, nativeDebit);
  await ecology.checkpoint(); const saved = ecology._record(region);
  await ecology.update(away); ecology.step(2); assert.deepEqual(storage.records.get(`${world}|${region.id}`), saved);
  await ecology.update(start); assert.deepEqual(ecology._record(ecology._active.get(region.id)), saved);
  const reopened = await model(storage); assert.deepEqual(reopened._record(reopened._active.get(region.id)), saved);
  reopened.step(.1); assert.deepEqual(reopened._active.get(region.id).predatorAgents, [dead]);
});
