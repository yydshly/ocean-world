import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { leafAttachmentPosition } from '../src/kelpHabitat.js';
import { kelpWaterPositionValid } from '../src/kelpWaterCommunity.js';
import { feedKelpDrift } from '../src/kelpDriftEcology.js';
import { kelpDriftContact } from '../src/kelpDriftGeometry.js';

const clone = value => structuredClone(value);
const START = { x: 259, z: 3 }, AWAY = { x: 963, z: -315 };
const WORLD = 'kelp-ecology-v1:string:42';
const beforeURL = new URL('../output/validation/kelp-macro-landscape-generation-before.js', import.meta.url);
const rawGenerator = readFileSync(beforeURL, 'utf8');
assert.equal(createHash('sha256').update(rawGenerator).digest('hex'),
  '3a1c041aa18c83dafa0f454a318e3937648960c5dc942b07a74bc1b84bb09c28', 'independent original generator is immutable');
const resolveSource = (raw, original, overrides = {}) => raw.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(overrides[dependency] ?? new URL(dependency, original).href)}`);
const generatorSource = resolveSource(rawGenerator, new URL('../src/kelpOceanGeneration.js', import.meta.url));
const generatorURL = `data:text/javascript;base64,${Buffer.from(generatorSource).toString('base64')}`;
const { createKelpOceanGenerator: originalGenerator } = await import(generatorURL);
const driftSource = resolveSource(readFileSync(new URL('../output/validation/kelp-macro-landscape-drift-before.js', import.meta.url), 'utf8'),
  new URL('../src/kelpDriftEcology.js', import.meta.url));
const driftURL = `data:text/javascript;base64,${Buffer.from(driftSource).toString('base64')}`;
const { feedKelpDrift: originalFeedKelpDrift } = await import(driftURL);
const ecologySource = resolveSource(readFileSync(new URL('../output/validation/kelp-macro-landscape-ecology-before.js', import.meta.url), 'utf8'),
  new URL('../src/kelpOceanEcology.js', import.meta.url), { './kelpOceanGeneration.js': generatorURL, './kelpDriftEcology.js': driftURL });
const { KelpOceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(ecologySource).toString('base64')}`);

class MemoryStore {
  available = true;
  records = new Map();
  batches = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async saveMany(world, entries) {
    const offered = entries.map(([id, record]) => [id, clone(record)]);
    this.batches.push({ world, offered });
    const result = await this.beforeCommit?.(world, offered);
    if (result === null) return null;
    const next = new Map(this.records);
    for (const [id, record] of offered) next.set(`${world}|${id}`, record);
    this.records = next;
  }
}
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => model._record(region));
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} versus ${expected}`);
const fieldEqual = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${label}.${key}`);
};
const without = (input, fields) => {
  const copy = clone(input);
  for (const field of fields) delete copy[field];
  return copy;
};

// Changes to support references are explicitly enumerated. Entire vectors,
// animal arrays, clocks, food pools and history are never omitted wholesale.
function unchangedApartFromSupport(after, before) {
  const current = clone(after), original = clone(before);
  delete current.supportGeometryVersion; delete original.supportGeometryVersion;
  for (const name of ['rockPatches', 'floorPatches']) {
    current.state[name].forEach((patch, index) => {
      const prior = original.state[name][index];
      close(patch.position.x, prior.position.x); close(patch.position.z, prior.position.z);
      delete patch.position.y; delete prior.position.y;
    });
  }
  current.state.agents.forEach((agent, index) => {
    const prior = original.state.agents[index];
    assert.equal(agent.id, prior.id);
    if (!prior.alive) return;
    if (['giant-kelp', 'purple-urchin', 'gumboot-chiton', 'bat-star', 'giant-kelpfish'].includes(prior.speciesId)) {
      for (const field of ['position', 'home', 'target']) {
        close(agent[field].x, prior[field].x); close(agent[field].z, prior[field].z);
        delete agent[field].y; delete prior[field].y;
      }
    }
    if (prior.speciesId === 'giant-kelp') {
      fieldEqual(without(agent.anchor, ['y', 'lengthM']), without(prior.anchor, ['y', 'lengthM']), `${agent.id}.anchor`);
      delete agent.anchor.y; delete prior.anchor.y; delete agent.anchor.lengthM; delete prior.anchor.lengthM;
      for (const key of ['sizeM', 'initialSizeM']) { delete agent[key]; delete prior[key]; }
    }
    if (['purple-urchin', 'gumboot-chiton', 'bat-star'].includes(prior.speciesId)) {
      delete agent.supportNormal; delete prior.supportNormal;
    }
    if (prior.speciesId === 'brown-turban-snail') {
      // A leaf point moves in XYZ when its original host length changes.
      for (const field of ['position', 'home', 'target']) { delete agent[field]; delete prior[field]; }
    }
    if (prior.lastDriftIntake) {
      assert.equal(agent.lastDriftIntake.supportGeometryVersion, 1);
      delete agent.lastDriftIntake.supportGeometryVersion;
    }
  });
  current.waterAgents.forEach((agent, index) => {
    const prior = original.waterAgents[index];
    if (!prior.alive) return;
    close(agent.position.x, prior.position.x); close(agent.position.z, prior.position.z);
    delete agent.position.y; delete prior.position.y;
  });
  current.driftPatches.forEach((patch, index) => {
    const prior = original.driftPatches[index];
    close(patch.position.x, prior.position.x); close(patch.position.z, prior.position.z);
    delete patch.position.y; delete prior.position.y;
    delete patch.supportNormal; delete prior.supportNormal;
  });
  assert.deepEqual(current, original, `complete record ${before.id} changed beyond its declared support references`);
}

async function oldWindow({ seed = '42', contact = false, start = START } = {}) {
  const store = new MemoryStore(), legacy = new OriginalEcology(seed, originalGenerator(seed), { store });
  assert.equal(await legacy.update(start), true);
  // 3.3 real simulated seconds exceeds the unchanged minimum edible drift
  // stock without inventing resources or waiting through a long visual replay.
  legacy.step(3.3, { foodSupply: 0, currentMps: 0, hour: 0 });
  for (const region of legacy._active.values()) {
    region._savedRecord = { ...(region._savedRecord ?? {}), opaqueRegionalExtension: { bytes: [9, 2, 7], preserve: true } };
    region._savedState = { ...(region._savedState ?? {}), opaqueNativeExtension: { text: 'preserve RNG, pools and hidden state' } };
  }
  const region = [...legacy._active.values()].find(row => row.driftPatches?.length && row.waterAgents.length &&
    row.sim.agents.some(agent => agent.speciesId === 'purple-urchin' && agent.alive));
  assert.ok(region, 'original natural nine-owner window supplies existing drift, native animals and a school');
  const dead = region.sim.agents.find(agent => agent.speciesId === 'gumboot-chiton');
  assert.ok(dead); dead.alive = false; dead.state = 'dead'; dead.energy = 0;
  region.waterAgents.at(-1).alive = false; region.waterAgents.at(-1).state = 'dead';
  if (contact) {
    let successful = false;
    for (const patch of region.driftPatches) for (const agent of region.sim.agents.filter(animal =>
      animal.speciesId === 'purple-urchin' && animal.alive && animal.rockIndex === patch.rockIndex)) {
      agent.position = { ...patch.position, y: legacy.generator.heightAt(patch.position.x, patch.position.z) + .003 };
      agent.supportNormal = legacy.generator.supportNormal(agent.position.x, agent.position.z);
      agent.nextBite = region.sim.timeSec;
      if (kelpDriftContact(agent, patch, legacy.generator).distanceM > .004 + 1e-10) continue;
      if (originalFeedKelpDrift(region.sim, agent, patch, region, .1, legacy.generator) > 0) { successful = true; break; }
    }
    assert.ok(successful, 'real old supported oral contact must debit existing stock and create a legitimate frozen intake history');
  }
  await legacy.checkpoint(); store.batches.length = 0;
  return { store, legacy, before: records(legacy), regionId: region.id, seed, start };
}

function validCurrentSupport(model, region) {
  const generator = model.generator, sim = region.sim;
  for (const patch of sim.groundPatches) close(patch.position.y, generator.heightAt(patch.position.x, patch.position.z), `${region.id}:food support`);
  for (const agent of sim.agents.filter(agent => agent.alive)) {
    if (['purple-urchin', 'gumboot-chiton', 'bat-star'].includes(agent.speciesId)) {
      close(agent.position.y, generator.heightAt(agent.position.x, agent.position.z) + .003, 'actual bottom support');
      assert.deepEqual(agent.supportNormal, generator.supportNormal(agent.position.x, agent.position.z));
      for (const point of [agent.home, agent.target]) assert.ok(point.y >= generator.heightAt(point.x, point.z) - 1e-8);
    }
    if (agent.speciesId === 'giant-kelp') {
      const scenery = generator.chunk(region.cx, region.cz).elements.find(element => element.id === agent.sceneryId);
      assert.ok(scenery); close(agent.anchor.y, scenery.anchor.y); close(agent.position.y, scenery.anchor.y);
      assert.ok(agent.anchor.y + agent.sizeM <= generator.surfaceY - .20 + 1e-8);
    }
    if (agent.speciesId === 'brown-turban-snail') {
      const actual = leafAttachmentPosition(sim.getKelpAnchor(agent.attachment.hostId), agent.attachment, sim.timeSec, sim.environment);
      for (const axis of ['x', 'y', 'z']) close(agent.position[axis], actual[axis], `new leaf support ${axis}`);
    }
    if (agent.speciesId === 'giant-kelpfish') {
      assert.ok(agent.position.y >= sim._fishFloor(agent) - 1e-8, 'whole existing kelpfish static floor clearance');
      assert.ok(agent.position.y <= generator.surfaceY - .25, 'kelpfish submerged ceiling');
    }
  }
  for (const agent of region.waterAgents.filter(agent => agent.alive)) assert.ok(kelpWaterPositionValid(generator, agent.position, agent.sizeM,
    { cx: region.cx, cz: region.cz, elements: [], ownerMarginM: agent.waterRoamingVersion ? 0 : .6 }), 'all nine water footprint probes clear actual v2 support');
  for (const patch of region.driftPatches) {
    const receiver = sim.rockPatches.find(item => item.id === patch.rockPatchId);
    assert.deepEqual(patch.position, receiver.position); assert.deepEqual(patch.supportNormal, generator.supportNormal(patch.position.x, patch.position.z));
  }
}

test('the actual saved v1 namespace migrates all nine complete records with only declared support changes and no animal refill', async () => {
  const context = await oldWindow(), model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true); assert.equal(model._active.size, 9);
  const after = records(model);
  after.forEach((record, index) => {
    assert.equal(record.supportGeometryVersion, 2); unchangedApartFromSupport(record, context.before[index]);
    validCurrentSupport(model, model._active.get(record.id));
    assert.deepEqual(context.store.records.get(`${WORLD}|${record.id}`), record, 'support conversion is durable before this owner is visible');
  });
  assert.equal(context.store.batches.reduce((count, batch) => count + batch.offered.length, 0), 9);
  assert.ok(context.store.batches.every(batch => batch.world === WORLD));
});

test('migration preserves actual positive drift stock and the original geometry of historical oral contact', async () => {
  const context = await oldWindow({ contact: true }), original = context.before.find(row => row.id === context.regionId);
  const history = original.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake;
  assert.ok(original.driftPatches.some(patch => patch.transferredIn > 0));
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true);
  const record = model._record(model._active.get(context.regionId)); unchangedApartFromSupport(record, original);
  const upgradedHistory = record.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake;
  fieldEqual(upgradedHistory, history, 'original finite contact'); assert.equal(upgradedHistory.supportGeometryVersion, 1);
  await model.checkpoint();
  const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await reopened.update(START), true); assert.deepEqual(records(reopened), records(model));
});

test('a staged support conversion publishes no actor until its complete record is committed', async () => {
  const context = await oldWindow(); let release, offered;
  context.store.beforeCommit = async (_world, entries) => {
    if (!offered) { offered = clone(entries); await new Promise(resolve => { release = resolve; }); }
  };
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store }), pending = model.update(START);
  for (let turn = 0; turn < 30 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(model._active.size, 0); assert.equal(model.agents.length, 0);
  assert.equal(offered[0][1].supportGeometryVersion, 2);
  for (const [id] of offered) assert.equal(context.store.records.get(`${WORLD}|${id}`).supportGeometryVersion, 1);
  model.step(.1); assert.equal(model.agents.length, 0);
  release(); assert.equal(await pending, true); assert.equal(model._active.size, 9);
});

test('throwing and explicitly uncommitted migrations leave complete old records intact and are retryable', async () => {
  for (const mode of ['throw', 'null']) {
    const context = await oldWindow(), frozen = clone([...context.store.records]); let rejecting = true;
    context.store.beforeCommit = () => {
      if (!rejecting) return;
      if (mode === 'throw') throw new Error('macro support transaction rejected'); return null;
    };
    const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
    assert.equal(await model.update(START), false); assert.equal(model._active.size, 0);
    assert.deepEqual([...context.store.records], frozen); assert.equal(model._counts.generated, 0);
    rejecting = false; assert.equal(await model.update(START), true);
    records(model).forEach((record, index) => unchangedApartFromSupport(record, context.before[index]));
  }
});

test('v2 geometry never excuses an invalid legacy water pose, wrong host, duplicate identity or inconsistent food ledger', async () => {
  const context = await oldWindow({ contact: true });
  const original = context.before.find(row => row.id === context.regionId), mutations = [
    row => { row.waterAgents.find(agent => agent.alive).position.y = -1000; },
    row => { row.state.agents.find(agent => agent.speciesId === 'brown-turban-snail').attachment.hostId = 'missing-original-host'; },
    row => { row.state.agents[1].id = row.state.agents[0].id; },
    row => { row.state.ledger.initial += .2; },
    row => { row.driftPatches[0].position.y += .05; },
    row => { row.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake.foodPosition.y += .08; },
    row => { row.supportGeometryVersion = 77; },
  ];
  for (const mutate of mutations) {
    const store = new MemoryStore(); store.records = new Map(clone([...context.store.records]));
    const bad = clone(original); mutate(bad); store.records.set(`${WORLD}|${bad.id}`, clone(bad));
    const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
    assert.equal(await model.update(START), false); assert.equal(model._active.has(bad.id), false); assert.equal(model._counts.generated, 0);
    assert.deepEqual(store.records.get(`${WORLD}|${bad.id}`), bad, 'invalid stored population is never regenerated or silently repaired');
  }
});

test('migrated owners pause, freeze offscreen, reopen once and resume with identical full hidden records', async () => {
  const context = await oldWindow(), model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true); const migrated = records(model);
  model.step(0, { hour: 12, foodSupply: 3 }); assert.deepEqual(records(model), migrated);
  assert.equal(await model.update(AWAY), true); model.step(.5, { hour: 0, foodSupply: 0 });
  for (const record of migrated) assert.deepEqual(context.store.records.get(`${WORLD}|${record.id}`), record);
  assert.equal(await model.update(START), true); assert.deepEqual(records(model), migrated);
  await model.checkpoint();
  const restored = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await restored.update(START), true); assert.deepEqual(records(restored), migrated);
  model.step(.1, { hour: 0, foodSupply: 0 }); restored.step(.1, { hour: 0, foodSupply: 0 });
  assert.deepEqual(records(restored), records(model), 'next real fixed step carries the same old RNG, deadlines, history and geographic pool owners');
  for (const region of model._active.values()) validCurrentSupport(model, region);
});

test('typed legacy seeds retain independent namespaces and full old support-v1 records when explicitly reopened as v1', async () => {
  for (const seed of [42, '42', 'other']) {
    const store = new MemoryStore(), original = new OriginalEcology(seed, originalGenerator(seed), { store });
    assert.equal(await original.update(START), true); original.step(.4, { foodSupply: 0 }); await original.checkpoint();
    const before = records(original), current = new KelpOceanEcology(seed, createKelpOceanGenerator(seed, { supportVersion: 1 }), { store });
    assert.equal(await current.update(START), true); assert.deepEqual(records(current), before);
    assert.ok([...store.records.keys()].every(key => key.startsWith(`kelp-ecology-v1:${typeof seed}:${seed}|`)));
  }
});

test('genuine existing plant growth survives support remapping without another simulated tick or biological gain', async () => {
  const context = await oldWindow();
  context.legacy.step(10, { foodSupply: 0, currentMps: 0, hour: 12 }); await context.legacy.checkpoint();
  const before = records(context.legacy), growth = new Map(before.flatMap(record => record.state.agents.filter(agent =>
    agent.alive && agent.speciesId === 'giant-kelp').map(agent => [agent.id, agent.sizeM - agent.initialSizeM])));
  assert.ok([...growth.values()].some(value => value > 1e-6), 'the actual original model must have extended a real host');
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true);
  for (const record of records(model)) {
    unchangedApartFromSupport(record, before.find(item => item.id === record.id));
    for (const plant of record.state.agents.filter(agent => agent.alive && agent.speciesId === 'giant-kelp'))
      close(plant.sizeM - plant.initialSizeM, growth.get(plant.id), 'old biological extension survives its new display reference');
    validCurrentSupport(model, model._active.get(record.id));
  }
});

test('dead historical hosts, dependants and fed bodies retain their complete original poses, sizes and oral-contact evidence', async () => {
  const context = await oldWindow({ contact: true }), region = context.legacy._active.get(context.regionId);
  const fed = region.sim.agents.find(agent => agent.lastDriftIntake); assert.ok(fed);
  fed.alive = false; fed.state = 'dead'; fed.energy = 0;
  const host = region.sim.hostById.values().next().value; assert.ok(host);
  for (const agent of region.sim.agents.filter(agent => agent.id === host.id || agent.hostId === host.id || agent.attachment?.hostId === host.id)) {
    agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  }
  await context.legacy.checkpoint(); const before = records(context.legacy), old = before.find(record => record.id === region.id);
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true);
  const after = model._record(model._active.get(region.id)); unchangedApartFromSupport(after, old);
  for (const agent of old.state.agents.filter(agent => !agent.alive))
    assert.deepEqual(after.state.agents.find(current => current.id === agent.id), agent, 'dead complete biological record is a historical record');
  await model.checkpoint();
  const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await reopened.update(START), true); assert.deepEqual(records(reopened), records(model));
});

test('a public snapshot cannot replace a dead dependant historical support with its living host migrated geometry', async () => {
  const context = await oldWindow(), region = context.legacy._active.get(context.regionId);
  const snail = region.sim.agents.find(agent => agent.speciesId === 'brown-turban-snail');
  assert.ok(snail && region.sim.hostById.get(snail.attachment.hostId).alive);
  snail.alive = false; snail.state = 'dead'; snail.energy = 0;
  context.legacy.snapshot(); await context.legacy.checkpoint();
  const original = clone(snail), model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true); model.snapshot(); await model.checkpoint();
  assert.deepEqual(model._record(model._active.get(region.id)).state.agents.find(agent => agent.id === snail.id), original);
  const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await reopened.update(START), true); reopened.snapshot();
  assert.deepEqual(reopened._record(reopened._active.get(region.id)).state.agents.find(agent => agent.id === snail.id), original);
});

test('a new v2 oral contact is tagged with its actual support while later invalid v2 water and contact histories remain rejected', async () => {
  const context = await oldWindow({ contact: true }), model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: context.store });
  assert.equal(await model.update(START), true);
  const region = model._active.get(context.regionId), feeder = region.sim.agents.find(agent => agent.lastDriftIntake), oldHistory = clone(feeder.lastDriftIntake);
  const patch = region.driftPatches.find(item => item.id === oldHistory.patchId);
  const waterRecord = records(model).find(record => record.waterAgents.some(agent => agent.alive)); assert.ok(waterRecord);
  // Keep the original actual producer and existing resource budget; suppress
  // competing animal intakes for one finite inventory replenishment only.
  for (const agent of region.sim.agents) if (agent.speciesId !== 'giant-kelp') agent.alive = false;
  region.waterAgents.forEach(agent => { agent.alive = false; });
  model.step(3.3, { foodSupply: 0, currentMps: 0, hour: 0 });
  assert.ok(patch.stock > 1e-7); feeder.alive = true; feeder.energy = .72; feeder.nextBite = region.sim.timeSec;
  feeder.position = { ...patch.position, y: model.generator.heightAt(patch.position.x, patch.position.z) + .003 };
  feeder.supportNormal = model.generator.supportNormal(feeder.position.x, feeder.position.z);
  assert.ok(feedKelpDrift(region.sim, feeder, patch, region, .1, model.generator) > 0, 'new feeding uses an actual current supported mouth and stock');
  assert.equal(feeder.lastDriftIntake.supportGeometryVersion, 2); assert.ok(feeder.lastDriftIntake.timeSec > oldHistory.timeSec);
  assert.ok(region.sim.events.some(event => event.type === 'kelp-drift-feeding' && event.timeSec === oldHistory.timeSec), 'old event remains at its original time and geometry');
  // An untouched other owner still supplies a living water school for the
  // independent invalid-body test; the fed owner supplies current v2 history.
  await model.checkpoint();
  const malformed = [
    [waterRecord, record => { record.waterAgents.find(agent => agent.alive).position.y = -1000; }],
    [model._record(region), record => { record.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake.supportGeometryVersion = 99; }],
    [model._record(region), record => { record.state.agents.find(agent => agent.lastDriftIntake).lastDriftIntake.foodPosition.y += .08; }],
  ];
  for (const [original, mutate] of malformed) {
    const store = new MemoryStore(); store.records = new Map(clone([...context.store.records]));
    const bad = clone(original); mutate(bad); store.records.set(`${WORLD}|${bad.id}`, clone(bad));
    const reopened = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store });
    assert.equal(await reopened.update(START), false); assert.equal(reopened._active.has(bad.id), false);
    assert.deepEqual(store.records.get(`${WORLD}|${bad.id}`), bad);
  }
});
