import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { createOceanHabitatScene, validateOceanHabitatSceneRecord, habitatSceneHeight, habitatSceneMesh } from '../src/oceanHabitatScenes.js';

const clone = value => structuredClone(value), WORLD = 'ecology-v1:string:42';
const POSITION = { x: 224, z: 96 }, AWAY = { x: 2048, z: 2048 };
const fields = ['habitatSceneVersion', 'habitatSceneInitializedAtSec', 'habitatSceneTheme', 'habitatSceneElements'];
const strip = row => { const copy = clone(row); fields.forEach(key => delete copy[key]); return copy; };
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
const elements = ecology => records(ecology).flatMap(row => row.habitatSceneElements ?? []);
class Store {
  available = true; records = new Map();
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { this.records.set(`${world}|${id}`, clone(row)); }
  async saveMany(world, entries) {
    if (await this.beforeCommit?.(entries) === null) return null;
    const next = new Map(this.records); for (const [id, row] of entries) next.set(`${world}|${id}`, clone(row)); this.records = next;
  }
}
function construct(store = new Store(), enabled = true, seed = '42') {
  const options = { store, turtles: true, sceneElements: true };
  if (enabled !== 'default') options.habitatScenes = enabled;
  return new OceanEcology(seed, createOceanGenerator(seed), options);
}
async function model(store = new Store(), enabled = true, position = POSITION) {
  const ecology = construct(store, enabled); assert.notEqual(await ecology.update(position), false); assert.equal(ecology._active.size, 9); return ecology;
}
async function existing() {
  const store = new Store(), ecology = await model(store, false); ecology.step(.4, { currentMps: .15, foodSupply: 0, hour: 12 });
  for (const row of ecology._active.values()) row.opaqueHistory = { retained: ['old-scene', row.id] };
  const dead = [...ecology._active.values()].find(row => row.agents.length).agents[0]; dead.alive = false; dead.state = 'dead'; dead.energy = 0;
  dead.velocity = { x: 0, y: 0, z: 0 }; await ecology.checkpoint(); return { ecology, store, before: records(ecology) };
}
const solidSurface = generator => (x, z) => oceanSupportHeight(generator, x, z, { avoidCoral: true });

test('omitting the option equals explicit false through ordinary future steps and publishes no habitat fields', async () => {
  const omitted = await model(new Store(), 'default'), disabled = await model(new Store(), false);
  assert.deepEqual(records(omitted), records(disabled));
  for (const dt of [.04, .06, .3]) { omitted.step(dt); disabled.step(dt); }
  assert.deepEqual(records(omitted), records(disabled));
  assert.ok(records(omitted).every(row => fields.every(field => !Object.hasOwn(row, field))));
});

test('the four-field additive commit preserves the complete existing native, turtle, old scenery, food, death and opaque records', async () => {
  const fixture = await existing(), current = await model(fixture.store); assert.ok(elements(current).length > 0);
  assert.deepEqual(records(current).map(strip), fixture.before);
  for (const row of records(current)) {
    assert.equal(row.habitatSceneVersion, 1); assert.equal(row.habitatSceneInitializedAtSec, row.timeSec);
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${row.id}`), row, 'the whole additive record is durable before activation');
    assert.ok(row.habitatSceneElements.length <= 36);
  }
  assert.ok(elements(current).length <= 324); assert.equal(current.agents.length, fixture.before.reduce((sum, row) => sum + row.agents.length + (row.turtleAgents?.length ?? 0), 0));
  assert.ok(elements(current).every(e => !Object.hasOwn(e, 'energy') && !Object.hasOwn(e, 'foodStock') && !Object.hasOwn(e, 'alive')));
});

test('seeded regional themes have actual hard attachments or sediment grass sources, bounded shared geometry and finite swimmer-only support', async () => {
  const generator = createOceanGenerator('42'), baseline = construct(new Store(), false), kinds = new Set(), themes = new Set();
  const fixtures = [[3, 2], [3, 1], [4, -2], [2, -2]];
  for (const [cx, cz] of fixtures) {
    const region = baseline._createRegion(cx, cz), before = clone(region), surface = solidSurface(generator);
    const plan = createOceanHabitatScene(generator, region, { seed: '42', surface });
    const reversed = { ...generator, chunk: (x, z) => { const chunk = generator.chunk(x, z); return { ...chunk, elements: [...chunk.elements].reverse() }; } };
    assert.deepEqual(createOceanHabitatScene(reversed, { ...region, agents: [...region.agents].reverse() }, { seed: '42', surface }), plan);
    assert.deepEqual(region, before); assert.ok(plan.elements.length <= 36); themes.add(plan.theme);
    const record = { ...region, habitatSceneVersion: 1, habitatSceneInitializedAtSec: region.timeSec,
      habitatSceneTheme: plan.theme, habitatSceneElements: plan.elements };
    assert.equal(validateOceanHabitatSceneRecord(record, generator, { surface }), true);
    const source = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) source.push(...generator.chunk(cx + dx, cz + dz).elements);
    for (const element of plan.elements) {
      kinds.add(element.kind); assert.equal(element.regionId, region.id); const mesh = habitatSceneMesh(element.kind);
      let root = false; for (let i = 0; i < mesh.positions.length; i += 3) {
        assert.ok(Number.isFinite(mesh.positions[i]) && Number.isFinite(mesh.positions[i + 1]) && Number.isFinite(mesh.positions[i + 2]));
        assert.ok(Math.hypot(mesh.positions[i], mesh.positions[i + 2]) <= .5 + 1e-7);
        assert.ok(mesh.positions[i + 1] >= 0 && mesh.positions[i + 1] <= 1 + 1e-7);
        root ||= Math.hypot(...mesh.positions.slice(i, i + 3)) <= 1e-8;
      }
      assert.ok(root, 'all broad colonies have an actual common root');
      if (element.kind === 'grass-meadow') {
        assert.equal(element.y, generator.floorSurface(element.x, element.z).height);
        assert.notEqual(generator.sample(element.x, element.z).substrate, 'rock'); assert.ok(element.sourceGrassIds.length >= 2);
        for (const id of element.sourceGrassIds) { const grass = source.find(p => p.id === id && p.kind === 'seagrass'); assert.ok(grass);
          assert.ok(Math.hypot(grass.x - element.x, grass.z - element.z) <= 7); assert.equal(grass.y, generator.floorSurface(grass.x, grass.z).height); }
      } else {
        const host = source.find(p => p.id === element.hostId); assert.ok(host && ['rock', 'formation'].includes(host.kind));
        if (plan.theme === 'outer-slope' && element.kind === 'sea-fan') assert.equal(host.kind, 'formation');
        const height = oceanRockHeight(host, element.x, element.z); assert.notEqual(height, null); assert.ok(Math.abs(element.y - height - .004) < 1e-9);
      }
      const top = habitatSceneHeight(element, element.x, element.z, true); assert.ok(Number.isFinite(top) && top >= element.y + element.scale.y - 1e-8);
      assert.equal(habitatSceneHeight(element, element.x, element.z, false), null);
      assert.equal(habitatSceneHeight(element, element.x + Math.max(element.scale.x, element.scale.z) + 1, element.z, true), null);
    }
  }
  assert.deepEqual([...themes].sort(), ['grass-meadow', 'open-sand', 'outer-slope', 'reef-garden']);
  assert.deepEqual([...kinds].sort(), ['coral-branch', 'coral-table', 'grass-meadow', 'sea-fan']);
});

test('staged allocation is invisible until an atomic commit and rejected writes or legacy stores cannot expose new geometry', async () => {
  const fixture = await existing(); let release, offered;
  fixture.store.beforeCommit = async rows => { if (!release) { offered = clone(rows); await new Promise(resolve => { release = resolve; }); } };
  const current = construct(fixture.store), pending = current.update(POSITION);
  for (let i = 0; i < 80 && !release; i++) await Promise.resolve(); assert.ok(release); assert.equal(current._active.size, 0);
  assert.deepEqual(strip(offered[0][1]), fixture.before.find(row => row.id === offered[0][0]));
  assert.equal(elements(current).length, 0); release(); await pending; assert.ok(elements(current).length > 0);
  const disk = clone([...fixture.store.records]);
  for (const fail of ['null', 'throw']) {
    const store = new Store(); store.records = new Map(fixture.before.map(row => [`${WORLD}|${row.id}`, clone(row)])); const original = clone([...store.records]);
    store.beforeCommit = async () => { if (fail === 'throw') throw new Error('habitat scene write rejected'); return null; };
    const failed = construct(store); assert.equal(await failed.update(POSITION), false); assert.equal(elements(failed).length, 0); assert.deepEqual([...store.records], original);
  }
  assert.deepEqual([...fixture.store.records], disk);
  const legacy = new Store(); legacy.saveMany = undefined; const unchanged = await model(legacy);
  assert.equal(elements(unchanged).length, 0); assert.ok(records(unchanged).every(row => !Object.hasOwn(row, 'habitatSceneVersion')));
});

test('paused unload, revisit and fresh restore retain whole cohorts and old records, while damaged marked geometry rejects without regeneration', async () => {
  const current = await model(); current.step(.4); const before = records(current), ids = before.map(row => row.id); current.step(0); assert.deepEqual(records(current), before);
  await current.update(AWAY); assert.ok(ids.every(id => !current._active.has(id))); current.step(.2); await current.update(POSITION); assert.deepEqual(records(current), before);
  await current.checkpoint(); const restored = await model(current.store); assert.deepEqual(records(restored), before);
  const owner = before.find(row => row.habitatSceneElements.length), key = `${WORLD}|${owner.id}`; assert.ok(owner);
  for (const mutate of [r => { r.habitatSceneVersion = 99; }, r => { r.habitatSceneElements[0].y -= 5; }]) {
    const corrupt = clone(owner); mutate(corrupt); const store = new Store(); store.records = new Map(clone([...current.store.records])); store.records.set(key, corrupt);
    const failed = construct(store); await assert.rejects(failed.update(POSITION), /habitat/i); assert.ok(!failed._active.has(owner.id)); assert.deepEqual(store.records.get(key), corrupt);
  }
  current.step(.1); restored.step(.1); assert.deepEqual(records(current), records(restored));
});
