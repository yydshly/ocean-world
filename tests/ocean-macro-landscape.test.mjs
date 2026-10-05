import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { OCEAN_MACRO_LANDSCAPE_VERSION, validateOceanMacroLandscapeRecord } from '../src/oceanMacroLandscape.js';

const clone = value => structuredClone(value);
const WORLD = 'ecology-v1:string:42';
const POSITION = { x: 224, z: 96 }, AWAY = { x: 2048, z: 2048 };
const fields = ['macroLandscapeVersion', 'macroLandscapeInitializedAtSec', 'macroLandscapeElements'];
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
const strip = record => { const result = clone(record); for (const field of fields) delete result[field]; return result; };
const residents = rows => rows.flatMap(row => row.agents.concat(row.turtleAgents ?? []));

class Store {
  available = true;
  records = new Map();
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { this.records.set(`${world}|${id}`, clone(record)); }
  async saveMany(world, entries) {
    if (await this.beforeCommit?.(entries) === null) return null;
    const next = new Map(this.records);
    for (const [id, record] of entries) next.set(`${world}|${id}`, clone(record));
    this.records = next;
  }
}

function construct(store = new Store(), enabled = true) {
  const options = { store, turtles: true, sceneElements: true, habitatScenes: true };
  if (enabled !== 'default') options.macroLandscape = enabled;
  return new OceanEcology('42', createOceanGenerator('42'), options);
}
async function model(store = new Store(), enabled = true, position = POSITION) {
  const ecology = construct(store, enabled);
  assert.notEqual(await ecology.update(position), false);
  assert.equal(ecology._active.size, 9);
  return ecology;
}
async function existing() {
  const store = new Store(), ecology = await model(store, false);
  ecology.step(.4, { currentMps: .15, foodSupply: 0, hour: 12 });
  for (const row of ecology._active.values()) row.opaqueHistory = { retained: ['old-macro-host', row.id] };
  const dead = [...ecology._active.values()].find(row => row.agents.length).agents[0];
  Object.assign(dead, { alive: false, state: 'dead', energy: 0, velocity: { x: 0, y: 0, z: 0 } });
  await ecology.checkpoint();
  return { store, before: records(ecology) };
}

test('macro landscape is opt-in and omitted/false retain identical complete future ecology', async () => {
  const omitted = await model(new Store(), 'default'), disabled = await model(new Store(), false);
  assert.deepEqual(records(omitted), records(disabled));
  for (const dt of [.04, .06, .3]) { omitted.step(dt); disabled.step(dt); }
  assert.deepEqual(records(omitted), records(disabled));
  assert.ok(records(omitted).every(row => fields.every(field => !Object.hasOwn(row, field))));
  assert.deepEqual(omitted.macroLandscapeElements, []);
  assert.equal(omitted._macroSupports.size, 0);
  assert.equal(omitted.macroLandscapeSupportHeight(224, 96, true), -Infinity);
});

test('one additive three-field commit preserves all old animals, roots, scenery, resources, RNG, deaths and opaque history', async () => {
  const fixture = await existing(), upgraded = await model(fixture.store);
  assert.ok(upgraded.macroLandscapeElements.length > 0, 'the ordinary grass/reef window gains actual broad scenery');
  assert.deepEqual(records(upgraded).map(strip), fixture.before);
  assert.deepEqual(residents(records(upgraded)), residents(fixture.before));
  for (const row of records(upgraded)) {
    assert.equal(row.macroLandscapeVersion, OCEAN_MACRO_LANDSCAPE_VERSION);
    assert.equal(row.macroLandscapeInitializedAtSec, row.timeSec);
    assert.ok(Array.isArray(row.macroLandscapeElements));
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${row.id}`), row, 'the entire record is durable before activation');
  }
  assert.equal(upgraded._macroSupports.size, 9);
  assert.ok(upgraded.macroLandscapeElements.every(element => !Object.hasOwn(element, 'energy') && !Object.hasOwn(element, 'foodStock') && !Object.hasOwn(element, 'alive')));
});

test('uncommitted proposals remain invisible; rejected writes and legacy stores expose no new supports or partial record', async () => {
  const fixture = await existing();
  let release, offered;
  fixture.store.beforeCommit = async entries => {
    if (!release) { offered = clone(entries); await new Promise(resolve => { release = resolve; }); }
  };
  const upgraded = construct(fixture.store), pending = upgraded.update(POSITION);
  for (let turn = 0; turn < 80 && !release; turn++) await Promise.resolve();
  assert.ok(release, 'one regional preactivation transaction is pending');
  assert.equal(upgraded._active.size, 0);
  assert.equal(upgraded._macroSupports.size, 0);
  assert.deepEqual(upgraded.macroLandscapeElements, []);
  assert.equal(upgraded.macroLandscapeSupportHeight(224, 96, true), -Infinity);
  assert.deepEqual(strip(offered[0][1]), fixture.before.find(row => row.id === offered[0][0]));
  release(); await pending;
  assert.ok(upgraded.macroLandscapeElements.length > 0);
  for (const fail of ['null', 'throw']) {
    const store = new Store(); store.records = new Map(fixture.before.map(row => [`${WORLD}|${row.id}`, clone(row)]));
    const disk = clone([...store.records]);
    store.beforeCommit = async () => { if (fail === 'throw') throw new Error('macro landscape write rejected'); return null; };
    const failed = construct(store);
    assert.equal(await failed.update(POSITION), false);
    assert.equal(failed._active.size, 0);
    assert.equal(failed._macroSupports.size, 0);
    assert.deepEqual(failed.macroLandscapeElements, []);
    assert.deepEqual([...store.records], disk);
  }
  const legacyStore = new Store(); legacyStore.saveMany = undefined;
  const legacy = await model(legacyStore);
  assert.deepEqual(legacy.macroLandscapeElements, []);
  assert.equal(legacy._macroSupports.size, 0);
  assert.ok(records(legacy).every(row => fields.every(field => !Object.hasOwn(row, field))));
});

test('unload/revisit and a fresh restore retain complete once-only cohorts, with bounded active-owner supports', async () => {
  const fixture = await existing(), ecology = await model(fixture.store);
  ecology.step(.2);
  const before = records(ecology), ids = new Set(before.map(row => row.id));
  ecology.step(0); assert.deepEqual(records(ecology), before);
  await ecology.update(AWAY);
  assert.ok([...ids].every(id => !ecology._active.has(id) && !ecology._macroSupports.has(id)));
  assert.equal(ecology._macroSupports.size, 9);
  assert.deepEqual([...ecology._macroSupports.keys()].sort(), [...ecology._active.keys()].sort());
  ecology.step(.2); await ecology.update(POSITION);
  assert.deepEqual(records(ecology), before);
  assert.equal(ecology._macroSupports.size, 9);
  await ecology.checkpoint();
  const restored = await model(ecology.store);
  assert.deepEqual(records(restored), before);
  assert.deepEqual(residents(records(restored)), residents(before));
  assert.ok(residents(records(restored)).some(agent => agent.alive === false), 'restoring scenery cannot refill a dead native animal');
  assert.deepEqual(restored.macroLandscapeElements, ecology.macroLandscapeElements);
  await ecology.dispose();
  assert.equal(ecology._macroSupports.size, 0);
});

test('marked malformed or partial saved landscape is rejected without regenerating or leaking its owner supports', async () => {
  const ecology = await model(), before = records(ecology);
  await ecology.checkpoint();
  const owner = before.find(row => row.macroLandscapeElements.length), key = `${WORLD}|${owner.id}`;
  assert.ok(owner);
  for (const mutate of [
    record => { record.macroLandscapeVersion = 99; },
    record => { delete record.macroLandscapeInitializedAtSec; },
    record => { record.macroLandscapeElements[0].x = NaN; },
  ]) {
    const corrupt = clone(owner); mutate(corrupt);
    const store = new Store(); store.records = new Map(clone([...ecology.store.records])); store.records.set(key, corrupt);
    const failed = construct(store);
    await assert.rejects(failed.update(POSITION), /macro landscape/i);
    assert.ok(!failed._active.has(owner.id));
    assert.ok(!failed._macroSupports.has(owner.id));
    assert.deepEqual(store.records.get(key), corrupt);
    assert.ok([...failed._macroSupports.keys()].every(id => failed._active.has(id)));
  }
});

test('actual committed v1 preview prisms upgrade once atomically, retaining all old biology and the original initialization time', async () => {
  // The actual first browser preview supplies historic prism descriptors and
  // their original plant roots, rather than changing a current mesh's marker.
  // Public cohorts/scenery are placed in a complete model record for the
  // storage protocol check; this does not claim to recover private browser RNG.
  const receipt = JSON.parse(await readFile(new URL('../output/validation/macro-landscape-first.json', import.meta.url), 'utf8'));
  const publicOwner = receipt.ocean.ecology.regions.find(row => row.id === '3,1');
  const fixture = await existing(), baseline = construct(fixture.store, false);
  const owner = clone(fixture.before.find(row => row.id === publicOwner.id));
  const sceneryFields = ['sceneElementsVersion', 'sceneElementsInitializedAtSec', 'sceneElements',
    'habitatSceneVersion', 'habitatSceneInitializedAtSec', 'habitatSceneTheme', 'habitatSceneElements', ...fields];
  for (const field of sceneryFields) owner[field] = clone(publicOwner[field]);
  owner.timeSec = publicOwner.timeSec;
  const publicAnimals = receipt.ocean.ecology.agents.filter(agent => agent.regionId === owner.id);
  owner.agents = clone(publicAnimals.filter(agent => agent.speciesId !== 'green-turtle'));
  owner.turtleAgents = clone(publicAnimals.filter(agent => agent.speciesId === 'green-turtle'));
  assert.equal(owner.macroLandscapeVersion, 1);
  assert.ok(owner.macroLandscapeElements.some(element => element.kind === 'reef-mass'));
  assert.ok(owner.macroLandscapeElements.some(element => element.kind === 'reef-colony'));
  assert.ok(owner.macroLandscapeElements.filter(element => element.kind === 'reef-mass').every(element => !Object.hasOwn(element.grid, 'topology')));
  const surface = (x, z) => baseline._macroBaselineSurface(owner, x, z);
  assert.equal(validateOceanMacroLandscapeRecord(owner, baseline.generator, { surface }), true, 'actual legacy prisms and their saved plant roots remain valid');
  const key = `${WORLD}|${owner.id}`, disk = clone([...fixture.store.records]);
  const legacyDisk = new Map(disk); legacyDisk.set(key, clone(owner));
  const position = { x: 288, z: 160 }; // The historic owner is the first entering cell.
  const failedStore = new Store(); failedStore.records = new Map(clone([...legacyDisk]));
  failedStore.beforeCommit = async () => null;
  const failed = construct(failedStore);
  assert.equal(await failed.update(position), false);
  assert.equal(failed._active.size, 0); assert.equal(failed._macroSupports.size, 0);
  assert.deepEqual([...failedStore.records], [...legacyDisk]);
  const store = new Store(); store.records = new Map(clone([...legacyDisk]));
  let ownerCommits = 0;
  store.beforeCommit = entries => { ownerCommits += entries.filter(([id]) => id === owner.id).length; };
  const upgraded = await model(store, true, position), current = clone(upgraded._active.get(owner.id));
  assert.equal(ownerCommits, 1);
  assert.equal(current.macroLandscapeVersion, OCEAN_MACRO_LANDSCAPE_VERSION);
  assert.equal(current.macroLandscapeInitializedAtSec, owner.macroLandscapeInitializedAtSec);
  assert.ok(current.macroLandscapeElements.filter(element => element.kind === 'reef-mass').every(element => element.grid.topology === 'continuous-v1'));
  assert.deepEqual(strip(current), strip(owner));
  assert.deepEqual(store.records.get(key), current);
  const restored = await model(store, true, position);
  assert.deepEqual(restored._active.get(owner.id), current);
  assert.equal(ownerCommits, 1, 'restoring v2 cannot reallocate or write another topology upgrade');
});
