import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { OceanAnimalEncounters } from '../src/world/oceanAnimalEncounters.js';
import { OceanLifeExpedition, expeditionTerrainClear, createLifeExpeditionPath, sampleLifeExpeditionView } from '../src/lifeExpedition.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';
import { reefValleyRegionOrigin } from '../src/reefValleyRegion.js';
import { isDirectorPlaybackRate, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { DIRECTOR_LIFE_STEPS } from '../src/directorTour.js';

// Shipped native methods, real Three models and latest actual constructor
// options; there is no WebGL context, browser, image or FPS claim here.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const bindings = { THREE, clamp: THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight,
  isDirectorPlaybackRate, advanceDirectorCameraElapsed, coastalSeascapeWindowReady, reefValleyRegionOrigin,
  OceanLifeExpedition, expeditionTerrainClear, createLifeExpeditionPath, sampleLifeExpeditionView };
const World = new Function(...Object.keys(bindings), `return class {${[
  'oceanWorldPosition', 'currentReefValleyRegionPlan', 'enterReefValleyRegion', 'createReefValleyRegionSegment',
  'sampleReefValleyRegionSegment', 'updateReefValleyRegionMotion', 'beginDirectorMotion', 'directorMotionSnapshot',
  'setDirectorPlaybackRate', 'findAgent', 'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY',
  'floorY', 'habitatY', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'
].map(method).join('\n')}}`)(...Object.values(bindings));
const clone = x => structuredClone(x), capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const equal = (a, b, label) => assert.ok(isDeepStrictEqual(a, b), label);
function fixture(records = []) {
  const seed = livingShallowsSeed('55'), chunks = new OceanChunks(seed, { livingGeology: true }), generator = chunks.generator;
  const disk = new Map(clone(records)), commits = [], store = { available: true,
    async load(world, id) { return clone(disk.get(`${world}|${id}`) ?? null); },
    async saveMany(world, entries) { for (const [id, row] of entries) disk.set(`${world}|${id}`, clone(row)); commits.push(entries.map(([id]) => id)); } };
  const start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'), end = source.indexOf(');', start) + 1;
  class Options { constructor(_seed, _generator, options) { this.options = options; } }
  const options = new Function('OceanEcology', 'seed', 'return ' + source.slice(start, end))
    .call({ isLivingShallows: true, oceanWorldVariant: 'reef-bottom-life', oceanChunks: { generator } }, Options, seed).options;
  const ecology = new OceanEcology(seed, generator, { ...options, store }), world = new World();
  const animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, agents: [], metrics: { timeSec: 0 }, environment: { hour: 10, currentMps: .15, turbidity: .25, foodSupply: 1 } },
    elapsed: 0, errors: [], paused: false, controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY,
    camera: new THREE.PerspectiveCamera(49, 16 / 9, .05, 160), oceanRenderOrigin: { x: 0, z: 0 },
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30, enableDamping: true,
      update() { world.camera.lookAt(this.target); world.camera.updateMatrixWorld(true); } },
    highlight: new THREE.Group(), cameraRocks: [], entities: new Map(), catalog: new Map(livingShallowsSpeciesCatalog.map(s => [s.id, s])),
    oceanEcology: ecology, oceanChunks: chunks, oceanAnimals: animals, oceanAnimalEncounters: new OceanAnimalEncounters(),
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {} });
  return { world, chunks, generator, ecology, animals, disk, commits };
}
async function release(f) { f.world.disposed = true; await f.ecology._pending; f.animals.dispose(); await f.ecology.dispose(); f.chunks.dispose(); }
function bounded(f) {
  assert.equal(f.ecology._active.size, 9); assert.equal(f.chunks.stats.activeChunks, 9);
  assert.ok(f.ecology._supportCells.size <= 25); assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.ecology._reefValleyAdmission.privateOwnerCount <= 97);
  assert.ok([...f.ecology._active.values()].every(r => r.agents.length + (r.turtleAgents?.length ?? 0) <= 20));
}
test('the actual latest seed55 life stage traverses the full route, encounters real animals, pauses, changes speed, renders native models and cold restores', async () => {
  let f = fixture(), restored;
  try {
    assert.equal(await f.world.enterReefValleyRegion(), true); bounded(f);
    const plan = f.world.currentReefValleyRegionPlan(), births = plan.group.ownerIds.flatMap(id => f.disk.get(`${f.ecology._world}|${id}`).agents);
    const terrainElements = plan.group.ownerIds.flatMap(id => f.generator.chunk(...id.split(',').map(Number)).elements)
      .filter(e => ['rock', 'seagrass', 'driftwood', 'bottle'].includes(e.kind))
      .map(e => ({ id: e.id, kind: e.kind, x: e.x, z: e.z, scale: e.scale }));
    assert.equal(f.world.beginDirectorMotion({ ...DIRECTOR_LIFE_STEPS[0].motion }), true);
    const original = capture(f.ecology._active); f.world.paused = true; f.world.updateReefValleyRegionMotion(4);
    equal(capture(f.ecology._active), original, 'native camera pause preserves complete ecology');
    assert.equal(f.world.directorMotionSnapshot().elapsedSec, 0); f.world.paused = false;
    assert.equal(f.world.setDirectorPlaybackRate(2), true);
    f.world.updateReefValleyRegionMotion(.5); assert.equal(f.world.directorMotionSnapshot().elapsedSec, 1);
    f.ecology.step(.5, f.world.sim.environment); assert.equal(f.world.setDirectorPlaybackRate(1), true);
    let waits = 0, steps = 0, renderSamples = 0, loadedCentre = null; const windows = new Set(), routeRows = [];
    while (!f.world.directorMotionSnapshot().complete) {
      const before = f.world.directorMotionSnapshot(), centre = f.world.oceanWorldPosition();
      const centreId = `${Math.floor(centre.x / 64)},${Math.floor(centre.z / 64)}`;
      // Match native window changes. Re-saving every dirty macro plan each
      // half-second is an artificial stress test, not a rendered route check.
      if (centreId !== loadedCentre) { await f.ecology.update(centre); f.chunks.update(centre); loadedCentre = centreId; }
      bounded(f);
      // The shipped renderer getter annotates timeSec. Read it before comparing
      // full records, so the annotation is not misreported as a camera mutation.
      f.ecology.agents;
      const acceptedBefore = steps % 40 === 0 ? capture(f.ecology._active) : null;
      f.world.updateReefValleyRegionMotion(.5);
      if (acceptedBefore) equal(capture(f.ecology._active), acceptedBefore, 'route/encounters/ledger cannot alter complete live records');
      const shot = f.world.directorMotionSnapshot(); assert.equal(shot.error, null);
      if (shot.elapsedSec === before.elapsedSec) { waits++; assert.ok(waits < 32); continue; }
      f.ecology.step(.5, f.world.sim.environment); steps++;
      const id = `${Math.floor(shot.worldPosition.x / 64)},${Math.floor(shot.worldPosition.z / 64)}`; windows.add(id);
      assert.ok(Math.hypot(...['x', 'y', 'z'].map(k => shot.worldPosition[k] - before.worldPosition[k])) < 1.1, 'accepted route continues without jumps');
      if (steps % 40 === 0 || shot.complete) {
        f.animals.update(f.ecology.agents, f.ecology._activeTime, f.world.oceanRenderOrigin, f.world.camera.position, f.ecology.scenery);
        renderSamples++; const report = f.world.oceanLifeExpedition.stats();
        routeRows.push({ elapsedSec: shot.elapsedSec, position: shot.worldPosition, habitat: report.habitat, speciesIds: report.speciesIds, travelledM: shot.travelledM });
        for (const a of report.nearby) { assert.ok(f.world.findAgent(a.id)?.alive); assert.ok(f.animals.entities.has(a.id), 'the nearby individual has its own native rendered model'); }
        console.log('life stage', shot.elapsedSec, 's', report.speciesIds.length, 'near-route types');
      }
      if (steps === 80) { const position = f.world.oceanWorldPosition(); f.world.setOceanRenderOrigin(Math.floor(position.x / 64) * 64, Math.floor(position.z / 64) * 64); }
    }
    const shot = f.world.directorMotionSnapshot(), report = f.world.oceanLifeExpedition.stats();
    assert.equal(shot.elapsedSec, 240); assert.equal(shot.observationRoute.requestedGroups, 1);
    assert.ok(shot.travelledM > 400); assert.deepEqual(report.habitats, ['reef', 'sand', 'meadow', 'slope']);
    assert.ok(report.speciesIds.length >= 8); assert.ok(report.movedIndividuals > 0);
    const end = shot.worldPosition; await f.ecology.update(end); f.chunks.update(end); bounded(f);
    await f.ecology.checkpoint(); const disk = capture(f.disk), active = capture(f.ecology._active);
    const result = { scope: 'full shipped CPU camera/ecology/Three model route; no GPU image, occlusion or FPS acceptance', seed: 55,
      births: births.length, birthTypes: new Set(births.map(a => a.speciesId)).size, routeM: shot.travelledM,
      nativeRouteSeconds: 240, modelSeconds: f.ecology._activeTime, boundedOwners: 9, waits, renderSamples,
      cameraOwnerIds: [...windows], report, routeRows, terrainElements, routePath: plan.group.routePath,
      birthPositions: births.map(a => ({ id: a.id, speciesId: a.speciesId, position: a.position })) };
    await release(f); f = null; globalThis.gc?.();
    restored = fixture(disk); restored.ecology.setEnvironment({ hour: 10 }); await restored.ecology.update(end);
    equal(capture(restored.ecology._active), active, 'cold complete active records'); equal(capture(restored.disk), disk, 'cold complete disk records');
    result.coldRestore = 'complete active and disk records exact';
    if (process.env.LIFE_STAGE_RECEIPT) writeFileSync(process.env.LIFE_STAGE_RECEIPT, JSON.stringify(result, null, 2));
    console.log('life stage complete', JSON.stringify({ ...report, nearby: undefined }));
  } finally { if (f) await release(f); if (restored) await release(restored); }
});
