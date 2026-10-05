import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createKelpVisitorPlan, kelpVisitorPositionValid, tickKelpVisitors } from '../src/kelpVisitorCommunity.js';
import { kelpWaterElements } from '../src/kelpWaterCommunity.js';
import { feedKelpDrift } from '../src/kelpDriftEcology.js';
import { kelpDriftContact } from '../src/kelpDriftGeometry.js';
import { kelpStipePosition } from '../src/kelpHabitat.js';

const clone = value => structuredClone(value);
const WORLD = 'kelp-ecology-v1:string:42', START = { x: -289, z: -62 }, AWAY = { x: 963, z: -315 };
const frozenSource = readFileSync(new URL('../output/validation/kelp-visitor-ecology-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(frozenSource).digest('hex'),
  '8600b710b32db25870726712081a3360aa4dff8025522b6e2a95277d2dd4458d', 'independent previous ecology is immutable');
const resolvedSource = frozenSource.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(new URL(dependency, new URL('../src/kelpOceanEcology.js', import.meta.url)).href)}`);
const { KelpOceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(resolvedSource).toString('base64')}`);

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
const recordList = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => model._record(region));
const visitorList = model => [...model._active.values()].flatMap(region => region.visitorAgents ?? []).sort((a, b) => a.id.localeCompare(b.id));
const withoutVisitors = record => {
  const copy = clone(record);
  for (const key of ['visitorCommunityVersion', 'visitorInitializedAtSec', 'visitorAgents']) delete copy[key];
  return copy;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDifference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function visitorContext(model, region, timeSec = region.sim.timeSec) {
  const delta = timeSec - region.sim.timeSec;
  return { cx: region.cx, cz: region.cz, elements: kelpWaterElements(model.generator, region.cx, region.cz),
    timeSec, environment: region.sim.environment, elementContext: element => {
      const owner = model._active.get(`${Math.floor(element.anchor.x / 64)},${Math.floor(element.anchor.z / 64)}`);
      if (!owner) return { anchor: element.anchor, conservative: true };
      const host = [...owner.sim.hostById.values()].find(plant => plant.sceneryId === element.id);
      return { anchor: host ? owner.sim.getKelpAnchor(host.id) : element.anchor,
        timeSec: owner.sim.timeSec + delta, environment: owner.sim.environment };
    } };
}
async function model(store = new MemoryStore(), position = START, { seed = '42', visitors = true } = {}) {
  const ecology = new KelpOceanEcology(seed, createKelpOceanGenerator(seed), { store, visitors });
  assert.equal(await ecology.update(position), true); return ecology;
}
async function oldWindow({ contact = false, position = START } = {}) {
  const store = new MemoryStore(), old = new OriginalEcology('42', createKelpOceanGenerator('42'), { store });
  assert.equal(await old.update(position), true);
  old.step(3.3, { foodSupply: 0, currentMps: 0, hour: 0 });
  for (const region of old._active.values()) {
    region._savedRecord = { ...region._savedRecord, opaqueRegionalExtension: { bytes: [9, 2, 7], preserve: true } };
    region._savedState = { ...region._savedState, opaqueNativeExtension: { text: 'preserve RNG, pools and hidden state' } };
  }
  if (contact) {
    let successful = false;
    for (const region of old._active.values()) for (const patch of region.driftPatches ?? []) {
      for (const agent of region.sim.agents.filter(item => item.speciesId === 'purple-urchin' && item.alive && item.rockIndex === patch.rockIndex)) {
        agent.position = { ...patch.position, y: old.generator.heightAt(patch.position.x, patch.position.z) + .003 };
        agent.supportNormal = old.generator.supportNormal(agent.position.x, agent.position.z); agent.nextBite = region.sim.timeSec;
        if (kelpDriftContact(agent, patch, old.generator).distanceM > .004 + 1e-10) continue;
        if (feedKelpDrift(region.sim, agent, patch, region, .1, old.generator) > 0) { successful = true; break; }
      }
      if (successful) break;
    }
    assert.ok(successful, 'the old fixture must contain a real supported oral contact with existing drift stock');
  }
  await old.checkpoint(); store.batches.length = 0;
  return { old, store, before: recordList(old) };
}

function clearVisitor(model, region, agent, { timeSec = region.sim.timeSec } = {}) {
  assert.equal(agent.speciesId, 'leopard-shark'); assert.ok(agent.sizeM >= 1.2 && agent.sizeM <= 1.5);
  assert.equal(agent.regionId, region.id); assert.equal(Math.floor(agent.position.x / 64), region.cx);
  assert.equal(Math.floor(agent.position.z / 64), region.cz);
  assert.ok(kelpVisitorPositionValid(model.generator, agent.position, agent.sizeM, visitorContext(model, region, timeSec)), 'complete visitor footprint clears actual habitat');
  assert.ok(agent.position.y < model.generator.surfaceY - .3, 'whole body remains submerged');
  // Independent finite horizontal probes cover the long axis and body width.
  // The rendering envelope is 1.02 total lengths × .40 widths/heights.
  const co = Math.cos(agent.heading), si = Math.sin(agent.heading), length = agent.sizeM * .51, width = agent.sizeM * .2;
  for (const [along, side] of [[0, 0], [-length, 0], [length, 0], [0, -width], [0, width],
    [-length, -width], [-length, width], [length, -width], [length, width]]) {
    const point = { x: agent.position.x + co * along - si * side,
      y: agent.position.y, z: agent.position.z + si * along + co * side };
    assert.ok(point.y - agent.sizeM * .2 > model.generator.heightAt(point.x, point.z), 'nine actual floor/solid supports clear the body envelope');
  }
}

test('the opt-in default keeps the independently frozen previous model and every complete regional record exact', async () => {
  const oldStore = new MemoryStore(), currentStore = new MemoryStore();
  const old = new OriginalEcology('42', createKelpOceanGenerator('42'), { store: oldStore });
  const current = await model(currentStore, START, { visitors: false });
  assert.equal(await old.update(START), true); assert.deepEqual(recordList(current), recordList(old));
  current.step(2, { foodSupply: 0, currentMps: .2, hour: 10 }); old.step(2, { foodSupply: 0, currentMps: .2, hour: 10 });
  assert.deepEqual(recordList(current), recordList(old)); assert.equal(visitorList(current).length, 0);
  assert.deepEqual(current.snapshot().resources, old.snapshot().resources);
});

test('once-only additions preserve all nine old native, water, food, RNG, clock and opaque fields exactly', async () => {
  const fixture = await oldWindow(), current = await model(fixture.store);
  assert.equal(current._active.size, 9); assert.ok(visitorList(current).length, 'a real sparse visitor must be allocated in the finite window');
  for (const [index, record] of recordList(current).entries()) {
    const before = fixture.before[index]; assert.deepEqual(withoutVisitors(record), before);
    assert.equal(record.visitorCommunityVersion, 1); assert.equal(record.visitorInitializedAtSec, before.state.timeSec);
    assert.ok(record.visitorAgents.length <= 1);
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${record.id}`), record, 'complete additive migration is durable before activation');
    for (const agent of record.visitorAgents) assert.equal(agent.createdAtSec, before.state.timeSec);
  }
  const ids = visitorList(current).map(agent => agent.id); await current.checkpoint();
  const reopened = await model(fixture.store); assert.deepEqual(visitorList(reopened).map(agent => agent.id), ids);
  const snapshot = reopened.snapshot();
  assert.equal(snapshot.agents.filter(agent => agent.speciesId === 'leopard-shark').length, ids.length);
  assert.equal(snapshot.metrics.activeIndividuals, snapshot.agents.length);
  assert.ok(Number.isFinite(snapshot.metrics.averageEnergy), 'non-metabolic visitors do not turn the old energy readout into NaN');
});

test('the additive upgrade preserves actual positive food stocks and legitimate historical oral contact', async () => {
  const fixture = await oldWindow({ contact: true, position: { x: 259, z: 3 } });
  assert.ok(fixture.before.some(record => record.driftPatches.some(patch => patch.stock > 0)));
  assert.ok(fixture.before.some(record => record.state.agents.some(agent => agent.lastDriftIntake?.removedUnits > 0)));
  const current = await model(fixture.store, { x: 259, z: 3 });
  recordList(current).forEach((record, index) => assert.deepEqual(withoutVisitors(record), fixture.before[index]));
});

test('coordinate-seeded allocation is sparse, typed and independent of model visit order and native array order', async () => {
  const current = await model(), other = await model(); await other.update(AWAY); await other.update(START);
  assert.deepEqual(visitorList(other), visitorList(current));
  const region = [...current._active.values()].find(row => row.visitorAgents?.length); assert.ok(region);
  const saved = current._record(region), plan = createKelpVisitorPlan(current.generator, region, { seed: '42', capacity: 1 });
  const reversed = { ...region, sim: Object.assign(Object.create(Object.getPrototypeOf(region.sim)), region.sim,
    { agents: [...region.sim.agents].reverse(), hostById: new Map([...region.sim.hostById].reverse()) }) };
  assert.deepEqual(createKelpVisitorPlan(current.generator, reversed, { seed: '42', capacity: 1 }), plan);
  assert.deepEqual(current._record(region), saved, 'planning never changes old simulation arrays or records');
  assert.equal(createKelpVisitorPlan(current.generator, region, { seed: '42', capacity: 0 }).placements.length, 0);
  const typed = await model(new MemoryStore(), START, { seed: 42 });
  assert.notDeepEqual(visitorList(typed), visitorList(current), 'number and string seed worlds retain independent coordinate allocation');
});

test('visitor motion has no effect on native/water simulation, food input, metabolism, resources or event histories', async () => {
  const current = await model(), original = await model(new MemoryStore(), START, { visitors: false });
  assert.ok(visitorList(current).length);
  assert.ok(visitorList(current).every(agent => !Object.hasOwn(agent, 'energy') && !Object.hasOwn(agent, 'nextBite') && !Object.hasOwn(agent, 'lastFeedAt')),
    'the first visible visitor milestone explicitly carries no invented metabolic or food state');
  const oldEnergy = visitorList(current).map(agent => agent.energy);
  current.step(2, { foodSupply: 0, currentMps: .2, hour: 10 }); original.step(2, { foodSupply: 0, currentMps: .2, hour: 10 });
  const oldRecords = recordList(original);
  recordList(current).forEach((record, index) => assert.deepEqual(withoutVisitors(record), oldRecords[index]));
  assert.deepEqual(visitorList(current).map(agent => agent.energy), oldEnergy, 'this finite visitor controller does not invent energy exchange');
});

test('full XYZ budgets and finite intermediate real support/plant references hold over ordinary one-timescale patrol', async () => {
  const current = await model(); assert.ok(visitorList(current).length);
  const initial = new Map(visitorList(current).map(agent => [agent.id, clone(agent.position)]));
  for (let tick = 0; tick < 60; tick++) {
    const before = new Map(visitorList(current).map(agent => [agent.id, clone(agent)]));
    current.step(.1, { currentMps: .2, hour: 10, foodSupply: 0 });
    for (const region of current._active.values()) for (const agent of (region.visitorAgents ?? []).filter(item => item.alive)) {
      const prior = before.get(agent.id); assert.ok(dist(prior.position, agent.position) <= .28 * .1 + 1e-9);
      assert.ok(angleDifference(prior.heading, agent.heading) <= .08 + 1e-9, 'whole-animal yaw cannot snap across the finite .1s step');
      clearVisitor(current, region, agent);
      for (const fraction of [.25, .5, .75]) {
        const probe = { ...agent, heading: prior.heading + Math.atan2(Math.sin(agent.heading - prior.heading), Math.cos(agent.heading - prior.heading)) * fraction,
          position: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, prior.position[axis] + (agent.position[axis] - prior.position[axis]) * fraction])) };
        clearVisitor(current, region, probe, { timeSec: prior.timeSec + .1 * fraction });
      }
    }
  }
  assert.ok(visitorList(current).some(agent => dist(agent.position, initial.get(agent.id)) > .3), 'a finite controller produces actual locomotion, not only a live count');
});

test('paused, locked and disabled owners retain complete visitor records and pending clocks', async () => {
  const current = await model(), before = recordList(current); current.step(0, { currentMps: 0, hour: 0 });
  assert.deepEqual(recordList(current), before);
  const occupied = [...current._active.values()].find(region => region.visitorAgents?.length); assert.ok(occupied);
  const old = current._record(occupied); current._locked.add(occupied.id); current.step(.2);
  assert.deepEqual(current._record(occupied), old); current._locked.delete(occupied.id);
  await current.checkpoint(); const disabled = await model(current.store, START, { visitors: false });
  const visitors = clone(visitorList(disabled)); assert.ok(visitors.length, 'saved visitors are retained even when allocation is disabled');
  disabled.step(.2); assert.deepEqual(visitorList(disabled), visitors, 'disabled visitor clocks/poses are frozen, independent of native progression');
});

test('fixed-step partitions and reversed active-owner order give identical complete state', async () => {
  const a = await model(), b = await model(); b._active = new Map([...b._active].reverse());
  a.step(2, { foodSupply: 0, currentMps: .2, hour: 10 });
  for (let step = 0; step < 120; step++) b.step(1 / 60, { foodSupply: 0, currentMps: .2, hour: 10 });
  assert.deepEqual(recordList(a), recordList(b));
});

test('unload/revisit and reopened saved owners retain all records and the same next deterministic step', async () => {
  const current = await model(); current.step(.8, { currentMps: .2, foodSupply: 0, hour: 10 });
  const before = recordList(current), owners = before.map(record => record.id);
  await current.update(AWAY); assert.ok(owners.every(id => !current._active.has(id))); current.step(.5);
  await current.update(START); assert.deepEqual(recordList(current), before); await current.checkpoint();
  const reopened = await model(current.store); assert.deepEqual(recordList(reopened), before);
  current.step(.1, { currentMps: .3, foodSupply: 0, hour: 11 }); reopened.step(.1, { currentMps: .3, foodSupply: 0, hour: 11 });
  assert.deepEqual(recordList(reopened), recordList(current));
});

test('a compatibility transaction exposes no added visitor before the complete record commits', async () => {
  const fixture = await oldWindow(); let release, offered;
  fixture.store.beforeCommit = async (_world, entries) => {
    if (!release) { offered = clone(entries); await new Promise(resolve => { release = resolve; }); }
  };
  const current = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: fixture.store, visitors: true });
  const pending = current.update(START);
  for (let turn = 0; turn < 50 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(current._active.size, 0); assert.equal(current.agents.length, 0);
  const [id, record] = offered[0]; assert.equal(record.visitorCommunityVersion, 1);
  assert.deepEqual(withoutVisitors(record), fixture.before.find(old => old.id === id));
  assert.equal(fixture.store.records.get(`${WORLD}|${id}`).visitorCommunityVersion, undefined);
  release(); assert.equal(await pending, true); assert.ok(visitorList(current).length);
});

test('throwing/null migration saves preserve old storage and retry once without publishing uncommitted visitors', async () => {
  for (const failure of ['throw', 'null']) {
    const fixture = await oldWindow(), oldRecords = clone([...fixture.store.records]);
    fixture.store.beforeCommit = async () => { if (failure === 'throw') throw new Error('visitor upgrade denied'); return null; };
    const current = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: fixture.store, visitors: true });
    await current.update(START);
    assert.equal(visitorList(current).length, 0); assert.deepEqual([...fixture.store.records], oldRecords);
    assert.ok(current.snapshot().metrics.storageError);
    fixture.store.beforeCommit = undefined;
    await current.update(AWAY); assert.equal(await current.update(START), true);
    assert.ok(visitorList(current).length); const ids = visitorList(current).map(agent => agent.id);
    await current.update(AWAY); await current.update(START); assert.deepEqual(visitorList(current).map(agent => agent.id), ids);
  }
});

test('fresh rejected allocation publishes no unsaved owner and an ordinary retry creates unique identities', async () => {
  const store = new MemoryStore(); store.beforeCommit = async () => null;
  const current = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store, visitors: true });
  assert.equal(await current.update(START), false); assert.equal(current._active.size, 0); assert.equal(store.records.size, 0);
  store.beforeCommit = undefined; assert.equal(await current.update(START), true);
  assert.equal(new Set(current.agents.map(agent => agent.id)).size, current.agents.length); assert.ok(visitorList(current).length);
});

test('capacity includes dead native/water/visitor identities; records at twenty never receive a replacement', async () => {
  const fixture = await oldWindow(), target = fixture.before.find(record => record.state.agents.some(agent => agent.speciesId !== 'giant-kelp'));
  const record = clone(target), native = record.state.agents.find(agent => agent.speciesId !== 'giant-kelp');
  const count = () => record.state.agents.filter(agent => agent.speciesId !== 'giant-kelp').length + record.waterAgents.length;
  while (count() < 20) record.state.agents.push({ ...clone(native), id: `dead:capacity:${count()}`, alive: false, state: 'dead', energy: 0 });
  fixture.store.records.set(`${WORLD}|${record.id}`, record);
  const current = await model(fixture.store), restored = current._record(current._active.get(record.id));
  assert.equal(restored.visitorCommunityVersion, 1); assert.deepEqual(restored.visitorAgents, []);
  assert.deepEqual(withoutVisitors(restored), record); assert.equal(current.snapshot().regions.find(row => row.id === record.id).agentCount, 20);
  assert.ok(current.snapshot().regions.every(row => row.agentCount <= 20));
  const withVisitor = [...current._active.values()].find(region => region.visitorAgents?.length); assert.ok(withVisitor);
  const dead = withVisitor.visitorAgents[0]; dead.alive = false; dead.state = 'dead';
  const deadRecord = current._record(withVisitor); await current.checkpoint();
  const reopened = await model(fixture.store); assert.deepEqual(reopened._record(reopened._active.get(withVisitor.id)), deadRecord);
  assert.equal(reopened._active.get(withVisitor.id).visitorAgents.length, 1);
  assert.ok(!reopened._active.get(withVisitor.id).visitorAgents[0].alive);
});

test('corrupt ownership, body support, identity, time, future marker or excess saved visitors are rejected without regeneration', async () => {
  const base = await model(); await base.checkpoint();
  const region = [...base._active.values()].find(row => row.visitorAgents?.length); assert.ok(region);
  const original = base._record(region), key = `${WORLD}|${region.id}`;
  const mutate = [record => { record.visitorAgents[0].position.x += 64; },
    record => { record.visitorAgents[0].position.y = base.generator.heightAt(record.visitorAgents[0].position.x, record.visitorAgents[0].position.z); },
    record => { record.visitorAgents[0].sizeM = 0; }, record => { record.visitorAgents[0].id = record.state.agents[0].id; },
    record => { record.visitorAgents[0].timeSec = NaN; }, record => { record.visitorCommunityVersion = 99; },
    record => { record.visitorAgents.push({ ...clone(record.visitorAgents[0]), id: 'illegal:second' }); },
    record => { record.visitorAgents[0].alive = false; record.visitorAgents[0].regionId = '999,999'; },
    record => {
      const native = record.state.agents.find(agent => agent.speciesId !== 'giant-kelp');
      const oldCount = () => record.state.agents.filter(agent => agent.speciesId !== 'giant-kelp').length + record.waterAgents.length;
      while (oldCount() < 20) record.state.agents.push({ ...clone(native), id: `dead:overflow:${oldCount()}`, alive: false, state: 'dead', energy: 0 });
      // Native/water count remains legal at twenty; its saved visitor makes
      // the combined owner illegal at twenty-one, including dead identities.
    }];
  for (const change of mutate) {
    const store = new MemoryStore(); store.records = new Map(clone([...base.store.records]));
    const corrupt = clone(original); change(corrupt); store.records.set(key, corrupt);
    const current = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store, visitors: true });
    assert.equal(await current.update(START), false); assert.equal(current._active.has(region.id), false);
    assert.deepEqual(store.records.get(key), corrupt); assert.ok(current.snapshot().metrics.storageError);
    assert.equal(current.agents.some(agent => agent.id === corrupt.visitorAgents[0].id), false);
  }
});

test('legacy non-atomic stores keep the old local recipe and allocate no new visitor inventory', async () => {
  const records = new Map(), store = { available: true,
    load: async (world, id) => clone(records.get(`${world}|${id}`) ?? null),
    async save(world, id, record) { records.set(`${world}|${id}`, clone(record)); } };
  const current = await model(store); assert.equal(visitorList(current).length, 0);
  assert.equal(current._active.size, 9);
  const oldRecords = new Map(), oldStore = { available: true,
    load: async (world, id) => clone(oldRecords.get(`${world}|${id}`) ?? null),
    async save(world, id, record) { oldRecords.set(`${world}|${id}`, clone(record)); } };
  const original = new OriginalEcology('42', createKelpOceanGenerator('42'), { store: oldStore });
  assert.equal(await original.update(START), true); assert.deepEqual(recordList(current), recordList(original));
  current.step(.2); original.step(.2); assert.deepEqual(recordList(current), recordList(original));
});

test('the standalone fixed-step controller rejects invalid dt without changing any complete regional field', async () => {
  const current = await model(), region = [...current._active.values()].find(row => row.visitorAgents?.length); assert.ok(region);
  const before = current._record(region);
  for (const dt of [0, -.1, .2, NaN, Infinity]) {
    assert.throws(() => tickKelpVisitors(region, { generator: current.generator, dt }), RangeError);
    assert.deepEqual(current._record(region), before);
  }
});

test('a centre-cleared body is rejected when its real footprint strikes a v2 formation slope or reaches the surface', () => {
  const generator = createKelpOceanGenerator('42'), sizeM = 1.35;
  let example;
  for (let cz = -6; cz <= 6 && !example; cz++) for (let cx = -6; cx <= 6 && !example; cx++) {
    for (const formation of generator.chunk(cx, cz).elements.filter(item => item.kind === 'formation')) {
      for (let n = 0; n < 48 && !example; n++) {
        const angle = n * Math.PI / 24;
        const x = formation.x + Math.cos(angle) * formation.scale.x * .48,
          z = formation.z + Math.sin(angle) * formation.scale.z * .48;
        const center = generator.heightAt(x, z), probe = generator.heightAt(x + Math.cos(angle + Math.PI) * sizeM * .58,
          z + Math.sin(angle + Math.PI) * sizeM * .58);
        if (probe < center + .3 || center > 9) continue;
        const point = { x, y: center + sizeM * .33 + .26, z }, owner = { cx: Math.floor(x / 64), cz: Math.floor(z / 64), elements: [] };
        if (Math.hypot(x, z) < 41 || Math.min(x - owner.cx * 64, (owner.cx + 1) * 64 - x,
          z - owner.cz * 64, (owner.cz + 1) * 64 - z) < 2) continue;
        example = { point, owner };
      }
    }
  }
  assert.ok(example, 'the actual seeded v2 formations must expose a slope where a long body needs more than its centre height');
  assert.equal(kelpVisitorPositionValid(generator, example.point, sizeM, example.owner), false);
  const high = { ...example.point, y: generator.surfaceY - .1 };
  assert.equal(kelpVisitorPositionValid(generator, high, sizeM, example.owner), false, 'surface check covers the conservative pitched body');
});

test('actual dynamic kelp stipes block otherwise free water rather than acting as decoration through the animal body', async () => {
  const current = await model(new MemoryStore(), { x: 259, z: 3 });
  let example;
  for (const region of current._active.values()) {
    const context = visitorContext(current, region);
    for (const host of region.sim.hostById.values()) {
      const anchor = region.sim.getKelpAnchor(host.id);
      for (const fraction of [.3, .45, .6]) {
        const position = kelpStipePosition(anchor, fraction, region.sim.timeSec, region.sim.environment, 0);
        if (kelpVisitorPositionValid(current.generator, position, 1.35, { ...context, elements: [] })) {
          example = { position, context }; break;
        }
      }
      if (example) break;
    }
    if (example) break;
  }
  assert.ok(example, 'a real rooted plant provides a physically submerged, floor-cleared stipe point');
  assert.equal(kelpVisitorPositionValid(current.generator, example.position, 1.35, example.context), false);
});

test('visitors require support v2: explicit v1 retains the frozen old recipe and mismarked saved visitors are rejected intact', async () => {
  const legacyStore = new MemoryStore(), enabledStore = new MemoryStore();
  const legacy = new OriginalEcology('42', createKelpOceanGenerator('42', { supportVersion: 1 }), { store: legacyStore });
  const enabled = new KelpOceanEcology('42', createKelpOceanGenerator('42', { supportVersion: 1 }), { store: enabledStore, visitors: true });
  assert.equal(await legacy.update(START), true); assert.equal(await enabled.update(START), true);
  assert.deepEqual(recordList(enabled), recordList(legacy)); assert.equal(visitorList(enabled).length, 0);
  assert.ok(recordList(enabled).every(record => !Object.hasOwn(record, 'visitorCommunityVersion') && !Object.hasOwn(record, 'visitorAgents')));
  legacy.step(.2, { foodSupply: 0, currentMps: .2, hour: 10 }); enabled.step(.2, { foodSupply: 0, currentMps: .2, hour: 10 });
  assert.deepEqual(recordList(enabled), recordList(legacy), 'v1 opt-in cannot alter any old native/water/resource/RNG field');

  const current = await model(); await current.checkpoint();
  // This real owner has neither water nor drift/host records. Their older
  // geometry checks cannot accidentally mask the dedicated visitor guard.
  const region = [...current._active.values()].find(row => row.visitorAgents.length && !row.waterAgents.length && !row.driftPatches.length);
  assert.ok(region); const key = `${WORLD}|${region.id}`, copy = current._record(region);
  copy.supportGeometryVersion = 1;
  const store = new MemoryStore(); store.records = new Map(clone([...current.store.records])); store.records.set(key, clone(copy));
  const reopening = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store, visitors: true });
  assert.equal(await reopening.update(START), false); assert.equal(reopening._active.has(region.id), false);
  assert.equal(reopening.agents.some(agent => agent.id === copy.visitorAgents[0].id), false);
  assert.match(reopening.snapshot().metrics.storageError, /visitors require support geometry v2/);
  assert.deepEqual(store.records.get(key), copy, 'invalid geometry metadata cannot reset, migrate or replace any saved visitor');
});
