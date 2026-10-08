import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { seagrassMeadowRegionOrigin } from '../src/seagrassMeadowRegion.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { meadowAnimalBeltMarked, validateMeadowAnimalBelt } from '../src/meadowAnimalBelt.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isOceanBenthicLifeAgent, validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { isOceanMeadowLifeAgent, oceanMeadowLifePositionValid, validateOceanMeadowLifeRecord } from '../src/oceanMeadowLife.js';
import { isOceanShoalLifeAgent, oceanShoalLifePositionValid, validateOceanShoalLifeRecord } from '../src/oceanShoalLife.js';
import { sampleOceanAnimalEncounter } from '../src/world/oceanAnimalEncounters.js';

const seed = livingShallowsSeed('45'), base = createLivingShallowsGenerator(seed);
const origin = seagrassMeadowRegionOrigin(228, 4), ids = origin.ownerIds;
const opening = { x: 228 * 64 + 24, z: 4 * 64 + 64 };
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const catalog = new Map(livingShallowsSpeciesCatalog.map(s => [s.id, s]));
const metadata = { version: 1, initializedAtSec: 0, groupId: '228,4', recipe: 'route-neighborhood-v1' };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
class Store {
  available = true; records = new Map(); commits = []; refusal = false;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    if (this.refusal) throw new Error('meadow animal belt atomic save failed');
    const rows = clone(entries);
    for (const [id, row] of rows) this.records.set(`${world}|${id}`, row);
    this.commits.push(rows);
  }
}
function fixture(store = new Store(), meadowAnimalBelt = true) {
  const generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, meadowAnimalBelt, meadowRegion: true,
    reefValleyRegion: true, livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true,
    livingBelt: true, shallowSeascape: true, turtles: true, turtleGrazing: true, biodiversity: true,
    benthicLife: true, meadowLife: true, shoalLife: true });
  return { model, generator, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
const agentsOf = rows => [...rows].flatMap(r => r.agents.concat(r.turtleAgents ?? []));
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false),
    bed: (x, z) => f.model._bed(x, z), capacity: 20 };
}
function bounded(f, { requireNine = true, physical = true } = {}) {
  assert.ok(f.model._active.size <= 9);
  if (requireNine) assert.equal(f.model._active.size, 9);
  assert.ok(f.generator.registryStats().size <= 25); assert.ok(f.model._supportCells.size <= 25);
  assert.ok(f.model._meadowRegionAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, `${row.id}: all records including dead/turtles`);
    assert.ok(validateLivingNetworkRecord(row), row.id); assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, `${row.id}: organic balance`);
    const foodError = row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus;
    assert.ok(Math.abs(foodError) < 1e-8, `${row.id}: existing food balance ${foodError}`);
    if (!physical || !meadowAnimalBeltMarked(row)) continue;
    assert.ok(validateMeadowAnimalBelt(row, f.generator), `${row.id}: complete new marker validator`);
    const q = supports(f);
    assert.ok(validateOceanBenthicLifeRecord(row, f.generator, q), `${row.id}: benthic full native validator`);
    assert.ok(validateOceanMeadowLifeRecord(row, f.generator, q), `${row.id}: meadow full native validator`);
    assert.ok(validateOceanShoalLifeRecord(row, f.generator, q), `${row.id}: shoal full native validator`);
    for (const a of row.agents.filter(a => a.alive && isOceanMeadowLifeAgent(a)))
      assert.ok(oceanMeadowLifePositionValid(row, f.generator, a, a.position, q), `${a.id}: whole meadow body pose`);
    for (const a of row.agents.filter(a => a.alive && isOceanShoalLifeAgent(a)))
      assert.ok(oceanShoalLifePositionValid(row, f.generator, a, a.position, q), `${a.id}: whole shoal body pose`);
  }
  assert.ok(f.model._supportCells.size <= 25, 'physical checks keep the public support bound');
}
function at(path, sM) { return path.find(p => p.sM >= sM) ?? path.at(-1); }
function layer(a) {
  if (isOceanShoalLifeAgent(a)) return 'water-column';
  if (['sand-edge-seahorse', 'reef-cuttlefish', 'green-turtle'].includes(a.speciesId)) return 'grass-edge';
  if (isOceanBenthicLifeAgent(a) || ['sand-goby', 'barrel-sea-pen', 'spider-conch'].includes(a.speciesId)) return 'near-bottom';
  return 'other';
}
function sampleCoverage(f, path, windowIndex) {
  // Only current live target-group owners participate. Saved offscreen birth
  // records and neighbouring grass groups never count as a local encounter.
  const activeOwnerIds = [...f.model._active.keys()];
  const agents = agentsOf(f.model._active.values()).filter(a => a.alive && ids.includes(a.regionId));
  const frames = [];
  for (let sM = 10; sM < path.at(-1).sM; sM += 10) {
    const p = at(path, sM), owner = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (!activeOwnerIds.includes(owner)) continue;
    const ahead = at(path, Math.min(path.at(-1).sM, sM + 6)), behind = at(path, Math.max(0, sM - 6));
    const dx = ahead.x - behind.x, dz = ahead.z - behind.z, n = Math.hypot(dx, dz);
    const routeTarget = { x: p.x + dx / n * 8, y: p.y - .65, z: p.z + dz / n * 8 };
    const estimate = sampleOceanAnimalEncounter({ position: p, routeTarget, agents, catalog, activeOwnerIds, aspect: 16 / 9 });
    const nearby = agents.filter(a => distance(a.position, p) <= 14);
    const camera = new THREE.PerspectiveCamera(49, 16 / 9, .04, 14);
    camera.position.set(p.x, p.y, p.z);
    const target = estimate.desiredTarget ?? routeTarget; camera.lookAt(target.x, target.y, target.z); camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const centresInFrustum = nearby.filter(a => frustum.containsPoint(new THREE.Vector3(a.position.x, a.position.y, a.position.z)));
    const groups = new Map();
    for (const a of nearby) if (typeof a.groupId === 'string' && a.groupId) {
      const members = groups.get(a.groupId) ?? []; members.push(a.id); groups.set(a.groupId, members);
    }
    frames.push({ sM, actualPathSM: p.sM, windowIndex, owner, nearbyIds: nearby.map(a => a.id),
      nearbySpecies: [...new Set(nearby.map(a => a.speciesId))], layers: [...new Set(nearby.map(layer))],
      selectedIds: estimate.ids, centresInFrustum: centresInFrustum.map(a => a.id),
      groups: [...groups].map(([groupId, members]) => ({ groupId, members })),
      maximumDistanceM: nearby.length ? Math.max(...nearby.map(a => distance(a.position, p))) : null });
  }
  return frames;
}
let birthRecords;

test('fresh seed45 target meadow persists a native animal belt and samples three actual nine-owner windows', async t => {
  const f = fixture(); t.after(() => f.model.dispose()); const started = performance.now();
  await f.model.update(opening); bounded(f);
  birthRecords = capture(f.store.records);
  const plan = f.generator.getRidgePlan('228,4'); assert.equal(plan?.version, 9);
  const group = plan.group, rows = ids.map(id => f.store.records.get(`${f.model._world}|${id}`));
  for (const row of rows) { assert.equal(row.meadowAnimalBeltVersion, 1); assert.deepEqual(row.meadowAnimalBelt, metadata); }
  assert.ok(f.store.commits.some(batch => batch.length === 12 && batch.every(([id, row]) => ids.includes(id) && row.meadowAnimalBeltVersion === 1)), 'one durable complete target-group birth');
  const all = agentsOf(rows), windows = [], frames = [], moved = new Set(), feeding = new Set(), fedShoal = new Set(), movedShoal = new Set();
  for (const [windowIndex, sM] of [0, 140, 280].entries()) {
    const pose = at(group.routePath, sM), updateStarted = performance.now(); await f.model.update(pose); bounded(f);
    const before = new Map(f.model.agents.map(a => [a.id, clone(a)]));
    f.model.step(.6); bounded(f); await f.model.checkpoint();
    for (const a of f.model.agents.filter(a => ids.includes(a.regionId))) {
      const old = before.get(a.id); if (!old) continue;
      if (distance(a.position, old.position) > .001) { moved.add(a.id); if (isOceanShoalLifeAgent(a)) movedShoal.add(a.id); }
      if (a.lastFeedAt !== null && a.lastFeedAt !== undefined && a.lastFeedAt !== old.lastFeedAt) { feeding.add(a.id); if (isOceanShoalLifeAgent(a)) fedShoal.add(a.id); }
    }
    frames.push(...sampleCoverage(f, group.routePath, windowIndex));
    windows.push({ sM, centre: `${f.model._center.cx},${f.model._center.cz}`, activeOwnerIds: [...f.model._active.keys()],
      modelAdvanceSec: .6, publicSupportOwners: f.generator.registryStats().size,
      privatePrefetchedOwners: f.model._meadowRegionAdmission.privateOwnerCount, wallSec: (performance.now() - updateStarted) / 1000 });
  }
  assert.ok(moved.size > 0 && feeding.size > 0, 'actual target-group movement and intake');
  assert.ok(movedShoal.size >= 2, 'multiple real schooling individuals move');
  const nearIds = new Set(frames.flatMap(frame => frame.nearbyIds)), selectedIds = new Set(frames.flatMap(frame => frame.selectedIds));
  const multiMemberGroups = frames.flatMap(frame => frame.groups.filter(g => g.members.length >= 2));
  assert.ok(multiMemberGroups.length > 0, 'at least one real multi-member school enters the actual 14 m camera neighbourhood');
  assert.ok(frames.length > 0 && nearIds.size >= 6, 'three native windows contain several distinct local target-group individuals');
  // The established public getter above derives display timeSec on each
  // resident. Save after those observations so disk and active capture refer
  // to exactly the same complete snapshot, including those display fields.
  await f.model.checkpoint();
  const expectedActive = capture(f.model._active), diskBefore = capture(f.store.records), cold = fixture(fromRecords(diskBefore));
  t.after(() => cold.model.dispose()); await cold.model.update(at(group.routePath, 280)); bounded(cold);
  assert.ok(isDeepStrictEqual(capture(cold.model._active), expectedActive), 'complete active cold restore equality');
  assert.ok(isDeepStrictEqual(capture(cold.store.records), diskBefore), 'cold restoration adds no births, food or repair writes');
  const merged = new Map(); for (const frame of frames) { const prev = merged.get(frame.sM); if (!prev || frame.nearbyIds.length > prev.nearbyIds.length) merged.set(frame.sM, frame); }
  const stationSamples = [...merged.values()].sort((a, b) => a.sM - b.sM), emptyStations = stationSamples.filter(f => !f.nearbyIds.length);
  const layerStationCounts = Object.fromEntries(['water-column', 'grass-edge', 'near-bottom', 'other'].map(name =>
    [name, stationSamples.filter(frame => frame.layers.includes(name)).length]));
  let emptyRunM = 0, longestEmptySampleRunM = 0, lastStation = null;
  for (const frame of stationSamples) {
    emptyRunM = frame.nearbyIds.length ? 0 : lastStation === frame.sM - 10 ? emptyRunM + 10 : 10;
    longestEmptySampleRunM = Math.max(longestEmptySampleRunM, emptyRunM); lastStation = frame.sM;
  }
  const receipt = { seed, scope: 'native actual target-group ecology, three ordinary windows and CPU camera-distance/point-frustum estimates; no GPU, scenery occlusion or frame-rate acceptance',
    groupId: group.id, routeLengthM: group.routeLengthM, completeOwnedRecords: rows.length,
    actualTargetAnimalRecords: all.length, representativeSpeciesIds: [...new Set(all.map(a => a.speciesId))],
    actualSchoolGroupIds: [...new Set(all.filter(isOceanShoalLifeAgent).map(a => a.groupId).filter(Boolean))],
    windows, actualModelAdvanceSec: 1.8, movedTargetIndividuals: moved.size, fedTargetIndividuals: feeding.size,
    movedSchoolIndividuals: movedShoal.size, fedSchoolIndividuals: fedShoal.size,
    nearbyUniqueTargetIds: nearIds.size, selectedUniqueTargetIds: selectedIds.size, multiMemberGroupSamples: multiMemberGroups.length,
    sampledRouteStations: stationSamples.length, emptyRouteStations: emptyStations.map(f => f.sM),
    layerStationCounts, longestEmptySampleRunM,
    bodyValidation: 'complete original benthic/meadow/shoal validators and full pose checks at each native window',
    coldActiveAndDiskEqual: true, bounds: { active: 9, publicSupport: 25, privatePrefetch: 97, allAnimalsIncludingDeadPerOwner: 20 },
    wallSec: (performance.now() - started) / 1000, stations: stationSamples };
  console.log('meadow animal belt native', JSON.stringify(receipt));
  if (process.env.MEADOW_ANIMAL_BELT_ECOLOGY_RECEIPT) await writeFile(process.env.MEADOW_ANIMAL_BELT_ECOLOGY_RECEIPT, JSON.stringify(receipt, null, 2));
});

test('enabling the new belt preserves a valid old v9 population, its real death, food, clocks and random progression', async t => {
  const old = fixture(new Store(), false); t.after(() => old.model.dispose());
  await old.model.update(opening); old.model.step(.6); bounded(old);
  const row = [...old.model._active.values()].find(row => ids.includes(row.id) && row.agents.some(a => a.alive && !isOceanBenthicLifeAgent(a) && !isOceanMeadowLifeAgent(a) && !isOceanShoalLifeAgent(a)));
  const animal = row.agents.find(a => a.alive && !isOceanBenthicLifeAgent(a) && !isOceanMeadowLifeAgent(a) && !isOceanShoalLifeAgent(a));
  animal.alive = false; animal.state = 'dead'; animal.energy = 0; recordLivingDeath(row, animal); row.counters.deaths++;
  row.historyExtension = { retained: true }; await old.model.checkpoint();
  const records = capture(old.store.records), enabled = fixture(fromRecords(records), true), disabled = fixture(fromRecords(records), false);
  t.after(() => enabled.model.dispose()); t.after(() => disabled.model.dispose());
  await enabled.model.update(opening); await disabled.model.update(opening); bounded(enabled); bounded(disabled);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active));
  assert.deepEqual(capture(enabled.store.records), records); assert.deepEqual(capture(disabled.store.records), records);
  for (const r of enabled.model._active.values()) if (ids.includes(r.id)) assert.equal(meadowAnimalBeltMarked(r), false);
  const death = enabled.model._active.get(row.id).agents.find(a => a.id === animal.id); assert.equal(death.alive, false); assert.equal(death.state, 'dead');
  assert.deepEqual(enabled.model._active.get(row.id).historyExtension, row.historyExtension);
  enabled.model.step(.6); disabled.model.step(.6);
  assert.deepEqual(capture(enabled.model._active), capture(disabled.model._active), 'identical existing recipe and saved random state continue');
});

test('failed atomic save exposes no new meadow terrain or population', async t => {
  const store = new Store(); store.refusal = true; const f = fixture(store); t.after(() => f.model.dispose());
  assert.equal(await f.model.update(opening), false);
  assert.equal(f.generator.ridgeRevision, 0); assert.equal(f.model._active.size, 0); assert.equal(store.records.size, 0);
  assert.ok(f.model._counts.persistenceErrors > 0);
});

test('partial or invalid new belt markers are rejected without repairing saved owners', async t => {
  assert.ok(birthRecords, 'first native case supplies a complete untouched actual birth snapshot');
  for (const damage of ['missing-member-marker', 'future-version', 'future-initialization', 'wrong-group', 'missing-metadata']) {
    const f = fixture(fromRecords(birthRecords)); t.after(() => f.model.dispose());
    const row = f.store.records.get(`${f.model._world}|${ids.at(-1)}`);
    if (damage === 'missing-member-marker') { delete row.meadowAnimalBeltVersion; delete row.meadowAnimalBelt; }
    else if (damage === 'future-version') row.meadowAnimalBeltVersion = 2;
    else if (damage === 'future-initialization') row.meadowAnimalBelt.initializedAtSec = 1;
    else if (damage === 'wrong-group') row.meadowAnimalBelt.groupId = '228,6';
    else delete row.meadowAnimalBelt;
    const before = capture(f.store.records);
    await assert.rejects(f.model.update(opening), /Incomplete saved|Invalid saved/);
    assert.equal(f.generator.ridgeRevision, 0); assert.equal(f.model._active.size, 0);
    assert.deepEqual(capture(f.store.records), before, damage);
  }
});
