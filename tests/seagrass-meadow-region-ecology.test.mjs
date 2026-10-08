import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createSeagrassMeadowRegionPlans, seagrassMeadowRegionOrigin, seagrassMeadowAllocation } from '../src/seagrassMeadowRegion.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent } from '../src/oceanReefGuild.js';
import { isOpenWaterLifeAgent } from '../src/oceanOpenWaterLife.js';
import { isOceanBiodiversityAgent } from '../src/oceanBiodiversity.js';
import { isOceanBenthicLifeAgent } from '../src/oceanBenthicLife.js';
import { isOceanMeadowLifeAgent } from '../src/oceanMeadowLife.js';
import { isOceanShoalLifeAgent } from '../src/oceanShoalLife.js';
import { validateOceanTurtleRecord } from '../src/oceanTurtleCommunity.js';

const seed = livingShallowsSeed('42'), base = createLivingShallowsGenerator(seed);
const first = seagrassMeadowRegionOrigin(228, 4), ids = first.ownerIds;
const opening = { x: 228 * 64 + 24, z: 4 * 64 + 64 }, far = { x: 32, z: 32 };
const clone = value => structuredClone(value), capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const category = a => isReefGuildAgent(a) ? 'guild' : isOpenWaterLifeAgent(a) ? 'openWater' :
  isOceanBiodiversityAgent(a) ? 'diversity' : isOceanBenthicLifeAgent(a) ? 'benthic' :
  isOceanMeadowLifeAgent(a) ? 'meadow' : isOceanShoalLifeAgent(a) ? 'shoal' : 'native';
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Store {
  available = true; records = new Map(); commits = []; beforeMany = null; refusal = null;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    const pending = clone(entries); if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    if (pending.length === 12 && pending.every(([, row]) => row.livingRidgePlan?.version === 9 && row.timeSec === 0)) this.commits.push(pending);
  }
}
function fixture(store = new Store(), meadowRegion = true, extra = {}) {
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, meadowRegion, reefValleyRegion: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    turtles: true, turtleGrazing: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife: true, ...extra });
  return { model, generator, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
function bounded(f) {
  assert.ok(f.model._active.size <= 9); assert.ok(f.generator.registryStats().size <= 25); assert.ok(f.model._supportCells.size <= 25);
  assert.ok(f.model._meadowRegionAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  assert.equal(f.model._meadowRegionAdmission.privateOwnerCount, f.model._reefValleyAdmission.privateOwnerCount);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, row.id);
    assert.ok(validateLivingNetworkRecord(row), row.id); assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, row.id);
  }
  const { cx, cz } = f.model._center;
  for (const id of f.generator.registryStats().ids) {
    const [x, z] = id.split(',').map(Number); assert.ok(Math.abs(x - cx) <= 2 && Math.abs(z - cz) <= 2, `future source ${id}`);
  }
}
let initialPromise;
async function initialRecords() {
  initialPromise ??= (async () => { const f = fixture(); await f.model.update(opening); bounded(f);
    assert.ok(ids.every(id => f.store.records.get(`${f.model._world}|${id}`)?.livingRidgePlan?.version === 9));
    return capture(f.store.records); })();
  return clone(await initialPromise);
}

test('a native whole meadow persists real turtle, grass-tail, bottom and water animals with shared bounded ecology', async () => {
  const f = fixture(), coldStarted = performance.now(); await f.model.update(opening); bounded(f);
  const coldEntry = { wallMs: performance.now() - coldStarted, ...clone(f.model._meadowRegionTiming) };
  assert.ok(coldEntry.wallMs < 45000, JSON.stringify(coldEntry));
  initialPromise ??= Promise.resolve(capture(f.store.records));
  const plans = createSeagrassMeadowRegionPlans(base, 228, 4), group = plans[0].group;
  const animals = [], guildTotals = Object.fromEntries(['native', 'guild', 'openWater', 'diversity', 'benthic', 'meadow', 'turtles', 'shoal'].map(k => [k, 0]));
  for (const plan of plans) {
    const row = f.store.records.get(`${f.model._world}|${plan.id}`), quota = seagrassMeadowAllocation(plan), counts = { turtles: row?.turtleAgents?.length ?? 0 };
    assert.equal(row?.livingRidgePlan?.version, 9); assert.equal(row.meadowRegionGroupId, '228,4'); assert.equal(row.meadowRegionInitializedAtSec, 0);
    assert.equal(quota.total, 20); assert.equal(Object.entries(quota).filter(([key]) => !['facies', 'total'].includes(key)).reduce((n, [, value]) => n + value, 0), 20);
    for (const a of row.agents) counts[category(a)] = (counts[category(a)] ?? 0) + 1;
    for (const key of Object.keys(guildTotals)) { assert.ok((counts[key] ?? 0) <= quota[key], `${plan.id}/${key}`); guildTotals[key] += counts[key] ?? 0; }
    animals.push(...row.agents, ...(row.turtleAgents ?? []));
  }
  const actualSpeciesIds = [...new Set(animals.map(a => a.speciesId))];
  assert.ok(actualSpeciesIds.includes('green-turtle'), 'actual native grass/room admitted no turtle');
  assert.ok(actualSpeciesIds.includes('sand-edge-seahorse'), 'actual native leaves admitted no grass-tail individual');
  assert.ok(actualSpeciesIds.includes('reef-cuttlefish'), 'actual native hard edges admitted no cuttlefish');
  for (const key of ['native', 'openWater', 'benthic', 'meadow']) assert.ok(guildTotals[key] > 0, key);
  assert.ok(f.store.commits.some(rows => rows.every(([id]) => ids.includes(id))));
  const moved = new Set(), feeding = new Set(), windows = [];
  for (const p of [group.routePath[0], group.routePath[Math.floor(group.routePath.length / 2)], group.routePath.at(-1)]) {
    await f.model.update(p); bounded(f);
    const before = new Map(f.model.agents.map(a => [a.id, clone(a)])); f.model.step(.4); await f.model.checkpoint(); bounded(f);
    for (const a of f.model.agents) {
      const old = before.get(a.id); if (!old) continue;
      if (Math.hypot(a.position.x - old.position.x, a.position.y - old.position.y, a.position.z - old.position.z) > .001) moved.add(a.id);
      if (a.lastFeedAt !== null && a.lastFeedAt !== undefined && a.lastFeedAt !== old.lastFeedAt) feeding.add(a.id);
    }
    windows.push({ centre: `${f.model._center.cx},${f.model._center.cz}`, advancedSec: .4,
      activeOwners: f.model._active.size, publicSources: f.generator.registryStats().size,
      privateOwnerCount: f.model._meadowRegionAdmission.privateOwnerCount, loadingTimingMs: clone(f.model._meadowRegionTiming) });
  }
  assert.ok(moved.size > 0 && feeding.size > 0);
  const receipt = { scope: 'native ordinary-window ecology; no camera, browser or GPU appearance acceptance', seed,
    sampleGroupId: group.id, actualRouteLengthM: group.pathMetrics.lengthM, ownedRecordCount: 12,
    actualAnimalRecordCount: animals.length, actualSpeciesIds, guildTotals, coldEntry,
    ordinaryWindows: windows, modelAdvanceSec: windows.length * .4, movedIndividualCount: moved.size, feedingIndividualCount: feeding.size,
    limits: { active: 9, public: 25, privatePrefetch: 97, animalsIncludingDeadPerOwner: 20 },
    naturalAdmissionScope: 'seeded native presence and complete physical clearance, category ceilings; not forced full catalogue or measured population density' };
  console.log('seagrass-meadow actual ecology', JSON.stringify(receipt));
  if (process.env.SEAGRASS_MEADOW_ECOLOGY_RECEIPT) { await mkdir(new URL('../output/validation/', import.meta.url), { recursive: true });
    await writeFile(process.env.SEAGRASS_MEADOW_ECOLOGY_RECEIPT, JSON.stringify(receipt, null, 2)); }
});

test('twelve meadow owners become public only after one durable atomic birth, including superseded entry', async () => {
  const store = new Store(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (rows.length === 12 && rows.every(([, row]) => row.livingRidgePlan?.version === 9)) {
    offered = clone(rows); entered.resolve(); await permit.promise; } };
  const f = fixture(store, true, { reefValleyRegion: false }), pending = f.model.update(opening); let next;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('regional atomic commit was not reached'); })]);
    assert.equal(offered.length, 12); assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0);
    for (const [id, row] of offered) { assert.equal(f.generator.getRidgePlan(id), undefined);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz).elements, base.chunk(row.cx, row.cz).elements); }
    next = f.model.update(far);
  } finally { permit.resolve(); await pending; if (next) await next; }
  for (const [id, row] of offered) { assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row); assert.equal(f.model._active.has(id), false); }
  await f.model.update(opening); bounded(f);
});

test('failed reads, refused commit and partial or corrupt private meadow history never regenerate', async () => {
  const refused = new Store(); refused.refusal = 'null'; const noWrite = fixture(refused, true, { reefValleyRegion: false });
  assert.equal(await noWrite.model.update(opening), false); assert.equal(noWrite.generator.ridgeRevision, 0); assert.equal(refused.records.size, 0);
  const unread = new Store(); unread.load = async () => undefined; const noRead = fixture(unread, true, { reefValleyRegion: false });
  assert.equal(await noRead.model.update(opening), false); assert.equal(noRead.generator.ridgeRevision, 0); assert.equal(unread.records.size, 0);
  const initial = await initialRecords();
  for (const damage of ['missing', 'marker', 'stock', 'clock', 'transport', 'animal']) {
    const f = fixture(fromRecords(initial)), key = `${f.model._world}|${ids.at(-1)}`, row = f.store.records.get(key);
    if (damage === 'missing') f.store.records.delete(key);
    else if (damage === 'marker') delete row.meadowRegionGroupId;
    else if (damage === 'stock') row.resources.detritus += .1;
    else if (damage === 'clock') row.timeSec += .01;
    else if (damage === 'transport') row.planktonTransportVersion += 1;
    else row.agents[0].energy = 1.1;
    const before = capture(f.store.records); await assert.rejects(f.model.update(opening), /Incomplete saved|Invalid saved/);
    assert.deepEqual(capture(f.store.records), before); assert.equal(f.generator.ridgeRevision, 0); assert.equal(f.model._active.size, 0);
  }
});

test('visited old owners and cold v9 restores preserve deaths, food, clocks and naturally empty classes', async () => {
  const old = fixture(new Store(), false, { reefValleyRegion: false, livingGeology: false });
  await old.model.update(opening); old.model.step(.4); await old.model.checkpoint();
  const beforeOld = capture(old.store.records), enabled = fixture(fromRecords(beforeOld)), disabled = fixture(fromRecords(beforeOld), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  enabled.model.step(.4); disabled.model.step(.4); assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.ok(enabled.model._meadowRegionAdmission.groups.some(g => g.status === 'preserved'));
  const f = fixture(fromRecords(await initialRecords())); await f.model.update(opening); f.model.step(.4);
  const owner = [...f.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive && category(a) === 'native'));
  const animal = owner.agents.find(a => a.alive && category(a) === 'native'); animal.alive = false; animal.state = 'dead'; animal.energy = 0;
  recordLivingDeath(owner, animal); owner.counters.deaths++; owner.historyExtension = { stable: true }; await f.model.checkpoint();
  const plans = ids.map(id => f.store.records.get(`${f.model._world}|${id}`).livingRidgePlan);
  try { f.generator.withMeadowRegionPlans(plans, () => {
    for (const id of ids) { const row = f.store.records.get(`${f.model._world}|${id}`);
      assert.equal(f.model._validCoastalHistory(row, id, true), true); assert.equal(validateOceanTurtleRecord(row, f.generator,
        { surface: (x, z) => f.model._surface(x, z, true) }), true); }
  }); } finally { f.model._supportCells.clear(); }
  const before = capture(f.model._active); await f.model.update(far); await f.model.update(opening);
  assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(fromRecords(capture(f.store.records)), false); await cold.model.update(opening);
  assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal(cold.model._active.get(owner.id).agents.find(a => a.id === animal.id).alive, false);
});
