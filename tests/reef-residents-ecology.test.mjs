import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { reefValleyRegionOrigin } from '../src/reefValleyRegion.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefResidentAgent, reefResidentsMarked, validateReefResidentsRecord, reefResidentPositionValid } from '../src/oceanReefResidents.js';

const seed = livingShallowsSeed('42'), base = createLivingShallowsGenerator(seed);
const origin = reefValleyRegionOrigin(204, 4), ids = origin.ownerIds;
const opening = { x: 204 * 64 + 24, z: 4 * 64 + 64 };
const newSpeciesIds = ['coral-trout', 'painted-spiny-lobster'];
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class Store {
  available = true; records = new Map(); commits = []; beforeMany = null; refusal = false;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    const rows = clone(entries);
    if (this.beforeMany) await this.beforeMany(rows);
    if (this.refusal) throw new Error('reef residents atomic save failed');
    for (const [id, row] of rows) this.records.set(`${world}|${id}`, row);
    this.commits.push(rows);
  }
}
function fixture(store = new Store(), reefResidents = true) {
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, ...(reefResidents === null ? {} : { reefResidents }),
    reefValleyRegion: true, livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, turtles: true, turtleGrazing: true, biodiversity: true,
    benthicLife: true, meadowLife: true, shoalLife: true });
  return { model, generator, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
const agentsOf = rows => [...rows].flatMap(r => r.agents.concat(r.turtleAgents ?? []));
const targetRows = f => ids.map(id => f.store.records.get(`${f.model._world}|${id}`));
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false),
    bed: (x, z) => f.model._bed(x, z), capacity: 20 };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  assert.ok(f.model._reefValleyAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, `${row.id}: includes dead records and turtles`);
    assert.ok(validateLivingNetworkRecord(row), `${row.id}: complete organic network`);
    assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, `${row.id}: organic stock balance`);
    const foodError = row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus;
    assert.ok(Math.abs(foodError) < 1e-8, `${row.id}: existing food balance`);
    if (reefResidentsMarked(row)) {
      const q = supports(f);
      assert.ok(validateReefResidentsRecord(row, f.generator, q), `${row.id}: complete resident native record`);
      for (const a of row.agents.filter(a => a.alive && isReefResidentAgent(a)))
        assert.ok(reefResidentPositionValid(row, f.generator, a, a.position, q), `${a.id}: complete animated body clearance`);
    }
  }
  assert.ok(f.model._supportCells.size <= 25, 'physical validation preserves public support bound');
}
function at(path, sM) { return path.find(p => p.sM >= sM) ?? path.at(-1); }
function coverage(f, path, windowIndex) {
  const activeOwners = new Set(f.model._active.keys());
  const live = agentsOf(f.model._active.values()).filter(a => a.alive && ids.includes(a.regionId));
  const samples = [];
  for (let sM = 0; sM <= path.at(-1).sM; sM += 10) {
    const p = at(path, sM), owner = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (!activeOwners.has(owner)) continue;
    const near = live.filter(a => distance(a.position, p) <= 14);
    samples.push({ sM, actualPathSM: p.sM, windowIndex, owner,
      nearbyTargetIds: near.map(a => a.id), nearbySpeciesIds: [...new Set(near.map(a => a.speciesId))],
      nearbyNewResidentIds: near.filter(a => newSpeciesIds.includes(a.speciesId)).map(a => a.id),
      nearestNewResidentDistanceM: live.some(a => newSpeciesIds.includes(a.speciesId)) ?
        Math.min(...live.filter(a => newSpeciesIds.includes(a.speciesId)).map(a => distance(a.position, p))) : null });
  }
  return samples;
}

let birthRecords, baselineRecords;
async function initialRecords(enabled) {
  const saved = enabled ? birthRecords : baselineRecords;
  if (saved) return clone(saved);
  const f = fixture(new Store(), enabled);
  try {
    await f.model.update(opening); bounded(f);
    const records = capture(f.store.records);
    if (enabled) birthRecords = records; else baselineRecords = records;
    return clone(records);
  } finally { await f.model.dispose(); }
}

test('fresh seed42 persists two actual reef residents in one twelve-owner native group and three ordinary windows', async t => {
  const f = fixture(); t.after(() => f.model.dispose()); const started = performance.now();
  await f.model.update(opening); bounded(f);
  birthRecords = capture(f.store.records);
  const rows = targetRows(f), plan = rows[0]?.livingRidgePlan, group = plan?.group;
  assert.equal(plan?.version, 8, 'seed42 actual complete v8 admission');
  assert.ok(rows.every(r => r?.reefValleyRegionGroupId === '204,4' && reefResidentsMarked(r)));
  assert.ok(f.store.commits.some(batch => batch.length === 12 && batch.every(([id, row]) => ids.includes(id) && reefResidentsMarked(row))),
    'one atomic saved complete target group');
  for (const row of rows) {
    assert.equal(row.reefResidentsVersion, 1); assert.equal(row.reefResidentsInitializedAtSec, 0);
    assert.equal(row.reefResidents.version, 1); assert.equal(row.reefResidents.groupId, '204,4');
    assert.equal(row.reefResidents.recipe, 'reef-residents-v1');
    assert.ok(row.agents.filter(isReefResidentAgent).length <= 2, `${row.id}: no more than two naturally admitted residents`);
  }
  try {
    f.generator.withReefValleyPlans(rows.map(row => row.livingRidgePlan), () => {
      for (const row of rows) {
        assert.ok(validateReefResidentsRecord(row, f.generator, supports(f)), `${row.id}: actual complete birth validator`);
        assert.ok(validateLivingNetworkRecord(row), `${row.id}: complete birth organic network`);
        assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, `${row.id}: balanced birth organic stocks`);
      }
    });
  } finally { f.model._supportCells.clear(); }
  const residents = agentsOf(rows).filter(isReefResidentAgent);
  const openingPose = at(group.routePath, 0);
  const distribution = newSpeciesIds.map(speciesId => {
    const animals = residents.filter(a => a.speciesId === speciesId);
    const routeDistances = animals.length ? group.routePath.map(p => {
      const ranked = animals.map(a => ({ a, distanceM: distance(a.position, p) })).sort((a, b) => a.distanceM - b.distanceM);
      return { sM: p.sM, position: clone(p), nearestId: ranked[0].a.id, distanceM: ranked[0].distanceM };
    }) : [];
    return { speciesId, individuals: animals.length, owners: [...new Set(animals.map(a => a.regionId))],
      nearestOrdinaryEntryDistanceM: animals.length ? Math.min(...animals.map(a => distance(a.position, openingPose))) : null,
      earliestRoutePointWithin14M: routeDistances.find(p => p.distanceM <= 14) ?? null,
      closestRoutePoint: routeDistances.toSorted((a, b) => a.distanceM - b.distanceM)[0] ?? null,
      homes: animals.map(a => ({ id: a.id, owner: a.regionId, hostId: a.reefResidentHostId,
        siteId: a.reefResidentSiteId, mode: a.reefResidentMode, sizeM: a.sizeM, position: clone(a.position) })) };
  });
  console.log('reef residents actual seed42 birth', JSON.stringify({ seed, groupId: group.id, distribution,
    residents: residents.length, allTargetAnimalRecords: agentsOf(rows).length, actualRouteM: group.pathMetrics.lengthM }));
  for (const kind of distribution) assert.ok(kind.individuals > 0, `actual seed42 ${kind.speciesId} births`);

  // A separate native old-option birth is the literal old recipe, rather than
  // a fabricated quota expectation. Geometry and existing animal payloads must
  // remain exact; organic admission adds only the new individuals' stocks.
  const baseline = new Map(await initialRecords(false));
  for (const row of rows) {
    const old = baseline.get(`${f.model._world}|${row.id}`);
    assert.ok(old && !reefResidentsMarked(old));
    assert.ok(isDeepStrictEqual(row.livingRidgePlan, old.livingRidgePlan), `${row.id}: identical real terrain and scenery`);
    assert.ok(isDeepStrictEqual(row.agents.filter(a => !isReefResidentAgent(a)), old.agents), `${row.id}: old native animals unchanged`);
    assert.ok(isDeepStrictEqual(row.turtleAgents, old.turtleAgents), `${row.id}: old turtle roster unchanged`);
    const oldCount = agentsOf([old]).length, newCount = row.agents.filter(isReefResidentAgent).length;
    assert.ok(newCount <= Math.min(2, 20 - oldCount), `${row.id}: only literal natural spare capacity`);
    assert.ok(isDeepStrictEqual(row.resources, old.resources), `${row.id}: admission creates no food`);
  }
  const windows = [], frames = [], moved = new Set(), fed = new Set(), movedNew = new Set(), fedNew = new Set();
  for (const [windowIndex, sM] of [0, 150, 350].entries()) {
    const pose = at(group.routePath, sM), updateStarted = performance.now();
    await f.model.update(pose); bounded(f);
    const before = new Map(f.model.agents.map(a => [a.id, clone(a)]));
    f.model.step(3); bounded(f);
    for (const a of f.model.agents.filter(a => ids.includes(a.regionId))) {
      const old = before.get(a.id); if (!old) continue;
      if (distance(a.position, old.position) > .001) { moved.add(a.id); if (isReefResidentAgent(a)) movedNew.add(a.id); }
      if (a.lastFeedAt !== null && a.lastFeedAt !== undefined && a.lastFeedAt !== old.lastFeedAt) {
        fed.add(a.id); if (isReefResidentAgent(a)) fedNew.add(a.id);
      }
    }
    frames.push(...coverage(f, group.routePath, windowIndex));
    await f.model.checkpoint();
    windows.push({ sM, actualPathSM: pose.sM, centre: `${f.model._center.cx},${f.model._center.cz}`,
      activeOwnerIds: [...f.model._active.keys()], modelAdvanceSec: 3,
      publicSupportOwners: f.generator.registryStats().size, privatePrefetchedOwners: f.model._reefValleyAdmission.privateOwnerCount,
      wallSec: (performance.now() - updateStarted) / 1000 });
  }
  assert.ok(movedNew.size > 0, 'actual new resident movement in ordinary native time');
  assert.ok(fedNew.size > 0, 'actual new resident intake debits an existing owner-local food stock');
  const merged = new Map();
  for (const frame of frames) {
    const previous = merged.get(frame.sM);
    if (!previous || frame.nearbyTargetIds.length > previous.nearbyTargetIds.length) merged.set(frame.sM, frame);
  }
  const stations = [...merged.values()].sort((a, b) => a.sM - b.sM);
  const newNear = new Set(frames.flatMap(frame => frame.nearbyNewResidentIds));
  const latestRows = targetRows(f), latestResidents = agentsOf(latestRows).filter(isReefResidentAgent);
  // The public getter derives display clocks. Checkpoint after all observations
  // so complete cold equality includes those fields, without deleting them.
  await f.model.checkpoint();
  const expectedActive = capture(f.model._active), expectedDisk = capture(f.store.records), cold = fixture(fromRecords(expectedDisk));
  t.after(() => cold.model.dispose()); await cold.model.update(at(group.routePath, 350)); bounded(cold);
  assert.ok(isDeepStrictEqual(capture(cold.model._active), expectedActive), 'complete cold active snapshot equality');
  assert.ok(isDeepStrictEqual(capture(cold.store.records), expectedDisk), 'cold reload adds no births, food or repair writes');
  const receipt = { seed, groupId: group.id, scope: 'one actual twelve-owner v8 group, three ordinary nine-owner windows and CPU distance samples; no browser, GPU, scenery occlusion or documentary visual acceptance',
    completeOwnedRecords: 12, actualRouteM: group.pathMetrics.lengthM, actualTargetAnimalRecords: agentsOf(rows).length,
    representativeSpeciesIds: [...new Set(agentsOf(rows).map(a => a.speciesId))], distribution,
    windows, actualModelAdvanceSec: 9, movedTargetIndividuals: moved.size, fedTargetIndividuals: fed.size,
    movedNewResidentIds: [...movedNew], fedNewResidentIds: [...fedNew], nearbyUniqueNewResidentIds: [...newNear],
    stations: stations, sampledRouteStations: stations.length,
    emptyTargetRouteStations: stations.filter(frame => !frame.nearbyTargetIds.length).map(frame => frame.sM),
    stationsWithoutNewResidents: stations.filter(frame => !frame.nearbyNewResidentIds.length).map(frame => frame.sM),
    foodConsumedUnits: latestRows.reduce((sum, row) => sum + (row.reefResidents?.counters.consumedUnits ?? 0), 0),
    finalNewResidents: latestResidents.map(a => ({ id: a.id, speciesId: a.speciesId, alive: a.alive, lastFeedAt: a.lastFeedAt,
      lastResidentIntake: a.lastResidentIntake, position: clone(a.position), timeSec: a.timeSec })),
    oldBirthTerrainAndRosterExact: true, coldActiveAndDiskEqual: true,
    bounds: { active: 9, publicSupport: 25, privatePrefetch: 97, allAnimalsIncludingDeadPerOwner: 20, newResidentsPerOwner: 2 },
    wallSec: (performance.now() - started) / 1000 };
  console.log('reef residents native receipt', JSON.stringify(receipt));
  if (process.env.REEF_RESIDENTS_ECOLOGY_RECEIPT) await writeFile(process.env.REEF_RESIDENTS_ECOLOGY_RECEIPT, JSON.stringify(receipt, null, 2));
});

test('old unmarked v8 history retains death, food, clocks and future random progression with the option enabled', async t => {
  const defaults = fixture(new Store(), null); t.after(() => defaults.model.dispose());
  assert.equal(defaults.model.reefResidentsEnabled, false, 'constructor omission keeps the established recipe');
  const old = fixture(fromRecords(await initialRecords(false)), false); t.after(() => old.model.dispose());
  assert.ok(targetRows(old).every(row => row?.livingRidgePlan?.version === 8 && !reefResidentsMarked(row)),
    'old unmarked history is genuinely a complete twelve-owner v8 group');
  await old.model.update(opening); old.model.step(.6); bounded(old);
  const row = [...old.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive));
  const animal = row.agents.find(a => a.alive); animal.alive = false; animal.state = 'dead'; animal.energy = 0;
  recordLivingDeath(row, animal); row.counters.deaths++; row.historyExtension = { retained: true };
  await old.model.checkpoint();
  const saved = capture(old.store.records), enabled = fixture(fromRecords(saved), true), disabled = fixture(fromRecords(saved), false);
  t.after(() => enabled.model.dispose()); t.after(() => disabled.model.dispose());
  await enabled.model.update(opening); await disabled.model.update(opening); bounded(enabled); bounded(disabled);
  assert.ok(isDeepStrictEqual(capture(enabled.model._active), capture(disabled.model._active)));
  assert.ok(isDeepStrictEqual(capture(enabled.store.records), saved));
  assert.ok(isDeepStrictEqual(capture(disabled.store.records), saved));
  for (const target of ids) assert.equal(reefResidentsMarked(enabled.store.records.get(`${enabled.model._world}|${target}`)), false);
  const restored = enabled.model._active.get(row.id).agents.find(a => a.id === animal.id);
  assert.equal(restored.alive, false); assert.equal(restored.state, 'dead');
  assert.deepEqual(enabled.model._active.get(row.id).historyExtension, { retained: true });
  enabled.model.step(.6); disabled.model.step(.6); bounded(enabled); bounded(disabled);
  assert.ok(isDeepStrictEqual(capture(enabled.model._active), capture(disabled.model._active)), 'old recipe, food and RNG continue exactly');
});

test('a complete twelve-owner save publishes only after commit and a failed commit exposes no residents or terrain', async t => {
  const pending = defer(), release = defer(), store = new Store(), f = fixture(store);
  let intercepted = false;
  store.beforeMany = async rows => {
    if (!intercepted && rows.length === 12 && rows.every(([id, row]) => ids.includes(id) && reefResidentsMarked(row))) {
      intercepted = true; pending.resolve(rows); await release.promise;
    }
  };
  t.after(() => { release.resolve(); return f.model.dispose(); });
  const updating = f.model.update(opening);
  const batch = await Promise.race([pending.promise, updating.then(() => {
    throw new Error('The ordinary update completed without the requested target twelve-owner resident batch.');
  })]);
  assert.equal(batch.length, 12); assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0);
  assert.equal(store.records.size, 0, 'no partial disk write before group commit');
  release.resolve(); await updating; bounded(f);
  assert.ok(ids.every(id => reefResidentsMarked(store.records.get(`${f.model._world}|${id}`))));
  const refusedStore = new Store(); refusedStore.refusal = true;
  const refused = fixture(refusedStore); t.after(() => refused.model.dispose());
  assert.equal(await refused.model.update(opening), false);
  assert.equal(refused.model._active.size, 0); assert.equal(refused.generator.ridgeRevision, 0); assert.equal(refusedStore.records.size, 0);
  assert.ok(refused.model._counts.persistenceErrors > 0);
});

test('mixed, malformed resident metadata and invalid saved resident poses reject regeneration', async t => {
  const saved = await initialRecords(true);
  for (const damage of ['missing-member-marker', 'future-version', 'future-initialization', 'wrong-group', 'missing-metadata', 'invalid-resident-pose']) {
    const f = fixture(fromRecords(saved)); t.after(() => f.model.dispose());
    const row = f.store.records.get(`${f.model._world}|${ids.at(-1)}`);
    if (damage === 'missing-member-marker') { delete row.reefResidentsVersion; delete row.reefResidentsInitializedAtSec; delete row.reefResidents; }
    else if (damage === 'future-version') row.reefResidentsVersion = 2;
    else if (damage === 'future-initialization') row.reefResidentsInitializedAtSec = 1;
    else if (damage === 'wrong-group') row.reefResidents.groupId = '210,4';
    else if (damage === 'missing-metadata') delete row.reefResidents;
    else {
      const residentRow = targetRows(f).find(row => row.agents.some(isReefResidentAgent));
      const resident = residentRow.agents.find(isReefResidentAgent); resident.position.y += 100;
    }
    const before = capture(f.store.records);
    await assert.rejects(f.model.update(opening), /Incomplete saved|Invalid saved/);
    assert.equal(f.model._active.size, 0); assert.equal(f.generator.ridgeRevision, 0);
    assert.ok(isDeepStrictEqual(capture(f.store.records), before), `${damage}: preserved saved records, no repair births`);
  }
});
