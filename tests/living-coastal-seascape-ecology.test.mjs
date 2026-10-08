import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { COASTAL_SEASCAPE_ANCHOR, coastalSeascapeAnimalAllocation } from '../src/livingCoastalSeascape.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent } from '../src/oceanReefGuild.js';
import { isOpenWaterLifeAgent } from '../src/oceanOpenWaterLife.js';
import { isOceanBiodiversityAgent } from '../src/oceanBiodiversity.js';
import { isOceanBenthicLifeAgent } from '../src/oceanBenthicLife.js';
import { isOceanMeadowLifeAgent } from '../src/oceanMeadowLife.js';
import { isOceanShoalLifeAgent } from '../src/oceanShoalLife.js';

const seed = livingShallowsSeed('42'), base = createLivingShallowsGenerator(seed);
const { cx, cz } = COASTAL_SEASCAPE_ANCHOR;
const ids = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${cx + dx},${cz + dz}`));
const opening = { x: cx * 64 + 32, z: cz * 64 + 48 }, far = { x: -1600, z: -1600 };
const clone = value => structuredClone(value), capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Store {
  available = true; records = new Map(); commits = []; reads = []; beforeMany = null; refusal = null;
  async load(world, id) { this.reads.push(id); return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal === 'null') return null;
    if (this.refusal === 'throw') throw new Error('coastal commit rejected');
    const pending = clone(entries); if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, row] of pending) this.records.set(`${world}|${id}`, row);
    this.commits.push(pending);
  }
}
function fixture(store = new Store(), coastalSeascape = true) {
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, coastalSeascape, turtles: true, turtleGrazing: true,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    shallowSeascape: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife: true });
  return { base, generator, model, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
const groupRows = f => ids.map(id => f.store.records.get(`${f.model._world}|${id}`));
const category = a => isReefGuildAgent(a) ? 'guild' : isOpenWaterLifeAgent(a) ? 'openWater' :
  isOceanBiodiversityAgent(a) ? 'diversity' : isOceanBenthicLifeAgent(a) ? 'benthic' :
  isOceanMeadowLifeAgent(a) ? 'meadow' : isOceanShoalLifeAgent(a) ? 'shoal' : 'native';
function bounded(f) {
  assert.ok(f.model._active.size <= 9); assert.ok(f.generator.registryStats().size <= 25); assert.ok(f.model._supportCells.size <= 25);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, row.id);
    assert.ok(validateLivingNetworkRecord(row), row.id); assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, row.id);
  }
}
function killActual(row) {
  const animal = row.agents.find(a => a.alive && category(a) === 'native'); assert.ok(animal);
  animal.alive = false; animal.state = 'dead'; animal.energy = 0; recordLivingDeath(row, animal); row.counters.deaths++;
  return animal.id;
}
let initialPromise;
async function initialRecords() {
  initialPromise ??= (async () => {
    const f = fixture(); await f.model.update(opening); bounded(f);
    assert.ok(groupRows(f).every(row => row?.livingRidgePlan?.version === 7));
    const commits = f.store.commits.filter(rows => rows.some(([, row]) => row.livingRidgePlan?.version === 7));
    assert.equal(commits.length, 1); assert.equal(commits[0].length, 12);
    return capture(f.store.records);
  })();
  return clone(await initialPromise);
}

test('twelve true owners commit one coastal bed, real quotas and inventories, then ordinary route windows move and feed', async () => {
  const initial = await initialRecords(), f = fixture(fromRecords(initial)); await f.model.update(opening);
  const rows = groupRows(f), group = rows[0].livingRidgePlan.group, byFacies = {}, species = {};
  for (const row of rows) {
    const plan = row.livingRidgePlan, quota = coastalSeascapeAnimalAllocation(plan), counts = { turtles: row.turtleAgents?.length ?? 0 };
    assert.equal(row.coastalSeascapeVersion, 1); assert.equal(row.coastalSeascapeGroupId, `${cx},${cz}`);
    assert.equal(row.coastalSeascapeInitializedAtSec, 0); assert.equal(quota.total, 20);
    for (const a of row.agents) { const k = category(a); counts[k] = (counts[k] ?? 0) + 1; species[a.speciesId] = (species[a.speciesId] ?? 0) + 1; }
    for (const a of row.turtleAgents ?? []) species[a.speciesId] = (species[a.speciesId] ?? 0) + 1;
    for (const key of ['native', 'guild', 'openWater', 'diversity', 'benthic', 'meadow', 'turtles', 'shoal'])
      assert.ok((counts[key] ?? 0) <= quota[key], `${row.id}/${key}: ${counts[key] ?? 0}>${quota[key]}`);
    const band = byFacies[quota.facies] ??= { owners: [], geometry: {}, actualCategories: {} }; band.owners.push(row.id);
    for (const e of plan.elements) band.geometry[e.kind] = (band.geometry[e.kind] ?? 0) + 1;
    for (const [key, n] of Object.entries(counts)) band.actualCategories[key] = (band.actualCategories[key] ?? 0) + n;
    assert.ok(validateLivingNetworkRecord(row)); assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8);
  }
  assert.equal(Object.keys(byFacies).length, 4);
  assert.ok(Array.isArray(group.routePath) && group.routePath.length > 1);
  const path = group.routePath, windows = [], moved = new Set(), fed = new Set(), seen = new Set();
  let lastCentre = null, maxBalanceError = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const centre = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (centre === lastCentre && i !== path.length - 1) continue; lastCentre = centre;
    await f.model.update(p); bounded(f);
    const actual = [...f.model._active.values()].filter(row => ids.includes(row.id));
    const before = new Map(actual.flatMap(row => row.agents).map(a => [a.id, clone(a)]));
    const feedingBefore = actual.reduce((n, row) => n + row.counters.feeding, 0);
    const ingestionBefore = actual.reduce((n, row) => n + row.basicNetwork.processTotals.ingestion, 0);
    f.model.step(4); await f.model.checkpoint(); bounded(f);
    for (const row of actual) {
      seen.add(row.id); maxBalanceError = Math.max(maxBalanceError, Math.abs(livingNetworkBalance(row)));
      for (const a of row.agents) {
        const old = before.get(a.id); if (!old) continue;
        if (Math.hypot(a.position.x - old.position.x, a.position.y - old.position.y, a.position.z - old.position.z) > .01) moved.add(a.id);
        if (a.lastFeedAt !== null && a.lastFeedAt !== old.lastFeedAt) fed.add(a.id);
      }
    }
    windows.push({ centre, position: { x: p.x, y: p.y, z: p.z }, advancedSec: 4, activeOwners: f.model._active.size,
      sourceOwners: f.generator.registryStats().size, coastalOwners: actual.map(row => row.id),
      feedingEvents: actual.reduce((n, row) => n + row.counters.feeding, 0) - feedingBefore,
      ingestedUnits: actual.reduce((n, row) => n + row.basicNetwork.processTotals.ingestion, 0) - ingestionBefore });
  }
  const actualRouteLengthM = group.pathMetrics.lengthM;
  const sampledOwnerWindowDistanceM = windows.slice(1).reduce((sum, window, i) => sum + Math.hypot(
    window.position.x - windows[i].position.x, window.position.y - windows[i].position.y,
    window.position.z - windows[i].position.z), 0);
  assert.ok(actualRouteLengthM >= 300 && actualRouteLengthM <= 500, actualRouteLengthM);
  assert.ok(moved.size > 0 && fed.size > 0, 'real stock-fed individuals move and ingest during actual owner-clock advancement');
  const receipt = { scope: 'native model route execution; no browser, GPU or documentary visual acceptance',
    seed, groupId: group.id, widthM: group.widthM, depthM: group.depthM, actualRouteLengthM, sampledOwnerWindowDistanceM,
    ordinaryWindowScope: 'sample one path point on each owner-centre transition plus the endpoint; relocate model windows and advance each 4 seconds, not a continuous camera walk',
    modelAdvanceSec: windows.reduce((sum, window) => sum + window.advancedSec, 0),
    committedOwners: 12, initialFacies: byFacies, actualSpecies: species,
    ordinaryWindows: windows, exploredOwnerIds: [...seen], movedIds: [...moved], feedingIds: [...fed], maxBalanceError,
    limits: { activeOwners: 9, publicSources: 25, allAnimalRecordsPerOwner: 20, deadRecordsCount: true },
    excludedFromExplorationScale: 'atomic failure, corruption, cold restore and far-unload tests are separate checks' };
  const receiptPath = process.env.COASTAL_SEASCAPE_RECEIPT ?? 'output/validation/living-coastal-seascape-model.json';
  await mkdir('output/validation', { recursive: true }); await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
});

test('a pending or superseded twelve-owner commit has no visible candidate geometry or animals', async () => {
  const store = new Store(), entered = defer(), permit = defer(); let offered;
  store.beforeMany = async rows => { if (offered || !rows.some(([, row]) => row.livingRidgePlan?.version === 7)) return;
    offered = clone(rows); entered.resolve(); await permit.promise; };
  const f = fixture(store), pending = f.model.update(opening); let next;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error('coastal atomic commit was not reached'); })]);
    assert.equal(offered.length, 12); assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0);
    for (const [id, row] of offered) { assert.equal(f.generator.getRidgePlan(id), undefined);
      assert.deepEqual(f.generator.chunk(row.cx, row.cz).elements, base.chunk(row.cx, row.cz).elements);
      assert.equal(store.records.has(`${f.model._world}|${id}`), false); }
    next = f.model.update(far);
  } finally { permit.resolve(); await pending; if (next) await next; }
  for (const [id, row] of offered) { assert.deepEqual(store.records.get(`${f.model._world}|${id}`), row); assert.equal(f.model._active.has(id), false); }
  await f.model.update(opening); bounded(f);
});

test('null/thrown writes and undefined/failed reads never publish or write a partial coastal group', async () => {
  for (const refusal of ['null', 'throw']) {
    const store = new Store(); store.refusal = refusal; const f = fixture(store);
    assert.equal(await f.model.update(opening), false); assert.equal(f.model._active.size, 0);
    assert.equal(f.generator.ridgeRevision, 0); assert.equal(store.records.size, 0);
  }
  for (const failure of ['undefined', 'throw']) {
    const store = new Store(); store.load = async () => { if (failure === 'throw') throw new Error('coastal owner read failed'); return undefined; };
    const f = fixture(store); assert.equal(await f.model.update(opening), false);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0); assert.equal(store.records.size, 0);
  }
});

test('one visited member declines the whole new recipe and preserves opaque history, deaths and the next step', async () => {
  const original = fixture(new Store(), false); await original.model.update(opening); original.model.step(.4);
  const row = [...original.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive && category(a) === 'native'));
  const deadId = killActual(row); row.historyExtension = { evidence: ['visited', 'opaque'], value: 17 }; await original.model.checkpoint();
  const initial = capture(original.store.records), enabled = fixture(fromRecords(initial)), disabled = fixture(fromRecords(initial), false);
  await enabled.model.update(opening); await disabled.model.update(opening);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.ok(groupRows(enabled).every(row => row?.livingRidgePlan?.version !== 7));
  assert.equal(enabled.model._active.get(row.id).agents.find(a => a.id === deadId).alive, false);
  enabled.model.step(.4); disabled.model.step(.4); assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  bounded(enabled); bounded(disabled);
});

test('missing members, removed markers, corrupt source, stock or offscreen history reject before source publication', async () => {
  const initial = await initialRecords();
  for (const damage of ['missing', 'plan', 'all-plans', 'marker', 'floor', 'food', 'clock', 'animal']) {
    const f = fixture(fromRecords(initial)), key = `${f.model._world}|${ids.at(-1)}`, row = f.store.records.get(key);
    if (damage === 'missing') f.store.records.delete(key);
    else if (damage === 'plan') delete row.livingRidgePlan;
    else if (damage === 'all-plans') for (const id of ids) delete f.store.records.get(`${f.model._world}|${id}`).livingRidgePlan;
    else if (damage === 'marker') delete row.coastalSeascapeGroupId;
    else if (damage === 'floor') row.livingRidgePlan.floorPatch.heights[32 * 65 + 32] += .125;
    else if (damage === 'food') row.resources.detritus += .1;
    else if (damage === 'clock') row.timeSec += .01;
    else row.agents[0].position.y = NaN;
    const before = capture(f.store.records);
    await assert.rejects(f.model.update(opening), /Invalid saved|Incomplete saved/);
    assert.deepEqual(capture(f.store.records), before); assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0);
  }
});

test('all-nine unload, revisit and cold restore retain complete ecology, deaths and plans without fresh allocation', async () => {
  const f = fixture(fromRecords(await initialRecords())); await f.model.update(opening); f.model.step(.4);
  const row = [...f.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive && category(a) === 'native'));
  const deadId = killActual(row); row.historyExtension = { key: 'stable' }; await f.model.checkpoint();
  const before = capture(f.model._active), oldIds = [...f.model._active.keys()];
  await f.model.update(far); assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f);
  await f.model.update(opening); assert.deepEqual(capture(f.model._active), before); bounded(f);
  const cold = fixture(f.store); await cold.model.update(opening); assert.deepEqual(capture(cold.model._active), before); bounded(cold);
  assert.equal([...cold.model._active.values()].flatMap(row => row.agents).find(a => a.id === deadId).alive, false);
  // The coastal marker fixes empty categories even without later class flags.
  const minimalStore = new Store();
  const minimal = new OceanEcology(seed, createLivingRidgeGenerator(base), { store: minimalStore, livingGeology: true, coastalSeascape: true });
  await minimal.update(opening); await minimal.checkpoint();
  const minimalBefore = capture(minimal._active);
  const restored = new OceanEcology(seed, createLivingRidgeGenerator(base), { store: minimalStore, livingGeology: true, coastalSeascape: true });
  await restored.update(opening); assert.deepEqual(capture(restored._active), minimalBefore);
});
