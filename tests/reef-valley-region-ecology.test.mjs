import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createReefValleyRegionPlans, reefValleyRegionOrigin, reefValleyAllocation } from '../src/reefValleyRegion.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent } from '../src/oceanReefGuild.js';
import { isOpenWaterLifeAgent } from '../src/oceanOpenWaterLife.js';
import { isOceanBiodiversityAgent } from '../src/oceanBiodiversity.js';
import { isOceanBenthicLifeAgent } from '../src/oceanBenthicLife.js';
import { isOceanMeadowLifeAgent } from '../src/oceanMeadowLife.js';
import { isOceanShoalLifeAgent } from '../src/oceanShoalLife.js';

const seed = livingShallowsSeed('42'), base = createLivingShallowsGenerator(seed);
const anchors = [204, 210, 216, 222], first = reefValleyRegionOrigin(204, 4), ids = first.ownerIds;
const opening = { x: 204 * 64 + 24, z: 4 * 64 + 64 }, far = { x: 32, z: 32 };
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
    // Retain birth receipts rather than every full landscape checkpoint.
    if (pending.length === 12 && pending.every(([, row]) => row.livingRidgePlan?.version === 8 && row.timeSec === 0)) this.commits.push(pending);
  }
}
function fixture(store = new Store(), reefValleyRegion = true, extra = {}) {
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, reefValleyRegion, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    turtles: true, turtleGrazing: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife: true, ...extra });
  return { model, generator, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
function bounded(f) {
  assert.ok(f.model._active.size <= 9); assert.ok(f.generator.registryStats().size <= 25); assert.ok(f.model._supportCells.size <= 25);
  assert.ok(f.model._reefValleyAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
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
    assert.ok(ids.every(id => f.store.records.get(`${f.model._world}|${id}`)?.livingRidgePlan?.version === 8));
    return capture(f.store.records); })();
  return clone(await initialPromise);
}

test('ordinary owner exploration grows four real regional groups with bounded ecology and independent food-fed clocks', async () => {
  const f = fixture(), windows = [], actualGroups = [], moved = new Set(), feeding = new Set(), species = new Set();
  // Cold first entry precedes any independent factory query that could warm
  // the immutable model cache. Production's loading deadline remains 45s.
  const coldStarted = performance.now(); await f.model.update(opening);
  const coldFirstEntry = { wallMs: performance.now() - coldStarted, ...clone(f.model._reefValleyTiming) };
  console.log('reef-valley cold first entry timing', JSON.stringify(coldFirstEntry));
  assert.ok(coldFirstEntry.wallMs < 45000, `cold ordinary entry exceeded 45s: ${JSON.stringify(coldFirstEntry)}`); bounded(f);
  let actualRouteLengthM = 0, previousCentre, maxPrivateOwners = 0;
  for (const cx of anchors) {
    const plans = createReefValleyRegionPlans(base, cx, 4), group = plans[0].group;
    actualRouteLengthM += group.pathMetrics.lengthM; actualGroups.push(group.id);
    // The world/director suite owns the continuous camera walk. This finite
    // ecology case samples entry, midpoint and exit of each real route group.
    const samples = [group.routePath[0], group.routePath[Math.floor(group.routePath.length / 2)], group.routePath.at(-1)];
    for (const p of samples) {
      const centre = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
      if (centre === previousCentre) continue; previousCentre = centre;
      const loadingStarted = performance.now(); await f.model.update(p);
      const loadingWallMs = performance.now() - loadingStarted, transitionTimingMs = clone(f.model._reefValleyTiming); bounded(f);
      assert.ok(loadingWallMs < 45000, `ordinary window ${centre} exceeded 45s: ${JSON.stringify(transitionTimingMs)}`);
      const before = new Map([...f.model._active.values()].flatMap(row => row.agents).map(a => [a.id, clone(a)]));
      const tickStarted = performance.now(); f.model.step(.4); const tickWallMs = performance.now() - tickStarted;
      await f.model.checkpoint(); bounded(f);
      for (const row of f.model._active.values()) for (const a of row.agents) {
        species.add(a.speciesId); const old = before.get(a.id); if (!old) continue;
        if (Math.hypot(a.position.x - old.position.x, a.position.y - old.position.y, a.position.z - old.position.z) > .001) moved.add(a.id);
        if (a.lastFeedAt !== null && a.lastFeedAt !== old.lastFeedAt) feeding.add(a.id);
      }
      maxPrivateOwners = Math.max(maxPrivateOwners, f.model._reefValleyAdmission.privateOwnerCount);
      windows.push({ centre, advancedSec: .4, activeOwners: f.model._active.size,
        publicSources: f.generator.registryStats().size, privateOwnerCount: f.model._reefValleyAdmission.privateOwnerCount,
        loadingWallMs, transitionTimingMs, tickWallMs, admission: clone(f.model._reefValleyAdmission.groups) });
    }
    for (const plan of plans) {
      const row = f.store.records.get(`${f.model._world}|${plan.id}`), quota = reefValleyAllocation(plan), counts = { turtles: row?.turtleAgents?.length ?? 0 };
      assert.equal(row?.livingRidgePlan?.version, 8, plan.id); assert.equal(row.reefValleyRegionGroupId, `${cx},4`);
      assert.equal(row.reefValleyRegionInitializedAtSec, 0); assert.equal(quota.total, 20);
      for (const a of row.agents) counts[category(a)] = (counts[category(a)] ?? 0) + 1;
      for (const key of ['native', 'guild', 'openWater', 'diversity', 'benthic', 'meadow', 'turtles', 'shoal'])
        assert.ok((counts[key] ?? 0) <= quota[key], `${plan.id}/${key}`);
    }
  }
  assert.ok(actualRouteLengthM >= 1400 && actualRouteLengthM <= 2200, actualRouteLengthM);
  assert.equal(new Set(actualGroups).size, 4); assert.ok(moved.size > 0 && feeding.size > 0);
  // Main route groups are a subset of real ordinary-window births; neighbouring
  // row groups are not silently counted as part of the four-group route.
  const birthCommits = f.store.commits.filter(rows => rows.some(([, row]) => row.livingRidgePlan?.version === 8) && rows.every(([, row]) => row.timeSec === 0));
  assert.ok(birthCommits.length >= 4);
  for (const rows of birthCommits) { assert.equal(rows.length, 12); assert.equal(new Set(rows.map(([, row]) => row.reefValleyRegionGroupId)).size, 1); }
  const receipt = { scope: 'native ecology owner-window samples; no continuous camera, browser, GPU or documentary visual acceptance',
    seed, mainRouteGroupIds: actualGroups, mainRouteOwnedRecords: 48, actualRouteLengthM, coldFirstEntry,
    windowScope: 'sample entry, midpoint and exit of each actual group route; model relocation and .4-second windows, not continuous camera travel',
    modelAdvanceSec: windows.length * .4, ordinaryWindows: windows,
    actualSpeciesIds: [...species], movedIndividualCount: moved.size, feedingIndividualCount: feeding.size,
    maxPrivateOwners, limits: { active: 9, public: 25, privatePrefetch: 97, animalsIncludingDeadPerOwner: 20 },
    allOrdinaryBornGroupIds: [...new Set(birthCommits.flatMap(rows => rows.map(([, row]) => row.reefValleyRegionGroupId)))],
    excluded: 'atomic, partial-history and cold-restoration cases below do not contribute to route distance or model time' };
  await mkdir('output/validation', { recursive: true });
  await writeFile(process.env.REEF_VALLEY_ECOLOGY_RECEIPT ?? 'output/validation/reef-valley-region-ecology.json', `${JSON.stringify(receipt, null, 2)}\n`);
});

test('pending and superseded group saves leave private candidates invisible until durable twelve-owner completion', async () => {
  const store = new Store(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.livingRidgePlan?.version === 8)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening); let next;
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

test('failed persistence and partial or corrupt offscreen group history cannot become virgin terrain', async () => {
  const refused = new Store(); refused.refusal = 'null'; const noWrite = fixture(refused);
  assert.equal(await noWrite.model.update(opening), false); assert.equal(noWrite.generator.ridgeRevision, 0); assert.equal(refused.records.size, 0);
  const unread = new Store(); unread.load = async () => undefined; const noRead = fixture(unread);
  assert.equal(await noRead.model.update(opening), false); assert.equal(noRead.generator.ridgeRevision, 0); assert.equal(unread.records.size, 0);
  const initial = await initialRecords();
  for (const damage of ['missing', 'marker', 'stock', 'clock', 'transport', 'community', 'animal']) {
    const f = fixture(fromRecords(initial)), key = `${f.model._world}|${ids.at(-1)}`, row = f.store.records.get(key);
    if (damage === 'missing') f.store.records.delete(key);
    else if (damage === 'marker') delete row.reefValleyRegionGroupId;
    else if (damage === 'stock') row.resources.detritus += .1;
    else if (damage === 'clock') row.timeSec += .01;
    else if (damage === 'transport') row.planktonTransportVersion += 1;
    else if (damage === 'community') row.pelagicCommunityVersion = 99;
    else row.agents[0].energy = 1.1;
    // Both paths inspect the same real mutable saved record and actual whole
    // floor. This accompanies admission rejection, rather than a mock schema.
    const actualPlans = ids.map(id => new Map(initial).get(`${f.model._world}|${id}`).livingRidgePlan);
    try { f.generator.withReefValleyPlans(actualPlans, () => assert.equal(
      f.model._validCoastalHistory(f.store.records.get(key), ids.at(-1), true),
      f.model._validCoastalHistory(f.store.records.get(key), ids.at(-1)), damage)); }
    finally { f.model._supportCells.clear(); }
    const before = capture(f.store.records); await assert.rejects(f.model.update(opening), /Incomplete saved|Invalid saved/);
    assert.deepEqual(capture(f.store.records), before); assert.equal(f.generator.ridgeRevision, 0); assert.equal(f.model._active.size, 0);
  }
});

test('visited owners retain old terrain and next-step history; cold v8 restore preserves death and naturally empty roles', async () => {
  const old = fixture(new Store(), false, { livingGeology: false }); await old.model.update(opening); old.model.step(.4); await old.model.checkpoint();
  const beforeOld = capture(old.store.records), enabled = fixture(fromRecords(beforeOld)), disabled = fixture(fromRecords(beforeOld), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  enabled.model.step(.4); disabled.model.step(.4); assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.ok(enabled.model._reefValleyAdmission.groups.some(g => g.status === 'preserved'));
  const f = fixture(fromRecords(await initialRecords())); await f.model.update(opening); f.model.step(.4);
  const owner = [...f.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive && category(a) === 'native'));
  const animal = owner.agents.find(a => a.alive && category(a) === 'native'); animal.alive = false; animal.state = 'dead'; animal.energy = 0;
  recordLivingDeath(owner, animal); owner.counters.deaths++; owner.historyExtension = { stable: true }; await f.model.checkpoint();
  const actualPlans = ids.map(id => f.store.records.get(`${f.model._world}|${id}`).livingRidgePlan);
  try { f.generator.withReefValleyPlans(actualPlans, () => {
    for (const id of ids) { const row = f.store.records.get(`${f.model._world}|${id}`);
      assert.equal(f.model._validCoastalHistory(row, id, true), true);
      assert.equal(f.model._validCoastalHistory(row, id), true); }
  }); } finally { f.model._supportCells.clear(); }
  const before = capture(f.model._active); await f.model.update(far); await f.model.update(opening);
  assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(fromRecords(capture(f.store.records)), false); await cold.model.update(opening);
  assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal(cold.model._active.get(owner.id).agents.find(a => a.id === animal.id).alive, false);
});
