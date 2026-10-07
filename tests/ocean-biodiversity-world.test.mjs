import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanBiodiversityPatchHeight } from '../src/oceanBiodiversityShape.js';
import { OCEAN_BIODIVERSITY_ROUTE_STOPS } from '../src/oceanBiodiversityRoutes.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';

// Run shipped navigation and camera methods with actual regional persistence,
// habitat queries and native Three objects. This is not browser/GPU acceptance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight',
  `return class {${['oceanWorldPosition', 'enterOceanBiodiversity', 'enterLivingShallows',
    'travelLivingShallows', 'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY',
    'floorY', 'habitatY', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight);
function fixture({ records = new Map(), biodiversity = true } = {}) {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const commits = [], store = { available: true,
    async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    shallowSeascape: true, turtleGrazing: true, biodiversity });
  const world = new World(), animals = new OceanAnimals(livingShallowsSpeciesCatalog), updates = [], requests = [];
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18,
      maxDistance: 30, enableDamping: true, update() {} }, oceanRenderOrigin: { x: 0, z: 0 },
    highlight: new THREE.Group(), cameraRocks: [], surfaceY: generator.surfaceY,
    oceanEcology: ecology, oceanAnimals: animals, keys: new Set(),
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {} },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {},
  });
  const request = world.requestOceanEcology.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  const stop = generator.routeStops.find(row => row.id === 'biodiversity-reef'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, updates, requests, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const worldTarget = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));

test('the ordinary rich-community entry awaits actual new records and frames existing live habitat, retaining them on cold revisit', async t => {
  const f = fixture(); t.after(() => f.animals.dispose());
  assert.equal(await f.world.enterOceanBiodiversity(), true); await settle(f);
  const initial = f.updates[0], centre = `${Math.floor(initial.x / 64)},${Math.floor(initial.z / 64)}`;
  const row = f.records.get(centre); assert.equal(row.biodiversityVersion, 1);
  assert.ok(f.commits.some(rows => rows.some(([id, record]) => id === centre && record.biodiversityVersion === 1)));
  const life = f.ecology.agents.filter(a => a.regionId === centre && a.alive && a.biodiversityIndividualVersion === 1);
  const anchor = life.find(a => a.speciesId === 'shallow-anemone')?.position ||
    row.biodiversity.patches.find(p => p.speciesId === 'biodiversity-massive-coral') || life[0]?.position || row.biodiversity.patches[0];
  assert.ok(anchor && (life.length || row.biodiversity.patches.length));
  const target = worldTarget(f.world), position = f.world.oceanWorldPosition();
  assert.ok(Math.hypot(target.x - anchor.x, target.z - anchor.z) < 1e-8, 'target is actual committed habitat');
  assert.ok(position.y >= f.world.habitatY(position.x, position.z) + .25 - 1e-8);
  assert.ok(position.y <= f.world.surfaceY - .5); assert.ok(Math.abs(f.world.camera.position.x) < 64 && Math.abs(f.world.camera.position.z) < 64);
  assert.equal(f.ecology._active.size, 9); assert.ok(f.animals.stats.activeAnimals > 0);
  assert.equal(f.animals.stats.biodiversityScenery.count, f.ecology.scenery.length);
  assert.ok(f.animals.stats.biodiversityScenery.count > 0); assert.equal(f.world.errors.length, 0);
  const before = structuredClone([...f.records]), cold = fixture({ records: f.records }); t.after(() => cold.animals.dispose());
  assert.equal(await cold.world.enterOceanBiodiversity(), true); await settle(cold);
  assert.deepEqual([...f.records], before, 'cold entry does not regenerate, refill or reinterpret durable life');
  t.diagnostic(JSON.stringify({ seed: f.world.sim.seed, centre, actualLivingAdditions: life.length,
    actualPatchCount: row.biodiversity.patches.length, renderedPatchCount: f.animals.stats.biodiversityScenery.count,
    floatingOrigin: f.world.oceanRenderOrigin, scope: 'real ecology and CPU observation; no GPU visual acceptance' }));
});

test('an old persisted owner remains complete and cannot be relabelled as a newly rich community', async t => {
  const old = fixture({ biodiversity: false }); t.after(() => old.animals.dispose());
  const index = old.generator.routeStops.findIndex(row => row.id === old.stop.id);
  assert.equal(old.world.enterLivingShallows(index), true); await settle(old); await old.ecology.checkpoint();
  const historical = structuredClone([...old.records]), freshOption = fixture({ records: old.records }); t.after(() => freshOption.animals.dispose());
  assert.equal(await freshOption.world.enterOceanBiodiversity(), false); await settle(freshOption);
  assert.deepEqual([...old.records], historical); assert.equal(freshOption.ecology.scenery.length, 0);
  assert.ok(!freshOption.ecology.agents.some(a => a.biodiversityIndividualVersion === 1));
});

test('a loaded marker without actual new living agents or patches is declined, and failed persistence cannot claim success', async t => {
  for (const marker of [false, true]) {
    const f = fixture(); t.after(() => f.animals.dispose());
    const heading = f.stop.heading ?? 0, across = f.stop.entryAcrossM ?? 8;
    const x = f.stop.x - 7 * Math.cos(heading) + across * Math.sin(heading), z = f.stop.z + 7 * Math.sin(heading) + across * Math.cos(heading);
    f.world.oceanEcology = { async update() { return true; }, agents: [], scenery: [], snapshot() { return { regions: marker
      ? [{ id: `${Math.floor(x / 64)},${Math.floor(z / 64)}`, biodiversityVersion: 1, biodiversity: { patches: [] } }] : [] }; } };
    assert.equal(await f.world.enterOceanBiodiversity(), false); assert.equal(f.records.size, 0);
  }
  for (const failure of ['read', 'write']) {
    const f = fixture(); t.after(() => f.animals.dispose());
    if (failure === 'read') f.store.load = async () => { throw new Error('unreadable owner'); };
    else f.store.saveMany = async () => { throw new Error('uncommitted owner'); };
    assert.equal(await f.world.enterOceanBiodiversity(), false); await settle(f);
    assert.equal(f.records.size, 0); assert.equal(f.ecology.scenery.length, 0);
    assert.ok(!f.ecology.agents.some(a => a.biodiversityIndividualVersion === 1));
  }
});

test('a late prepared entry never repositions after camera, target, controls, keys, director, reset, seed or native entry takeover', async t => {
  const takeovers = [w => { w.camera.position.x += 2; }, w => { w.controls.target.z += 2; },
    w => { w.controlStartCount++; }, w => { w.keys.add('KeyW'); }, w => { w.directorEntry = { active: true }; },
    w => { w.directorMotion = {}; }, w => { w.oceanEcologyResetting = true; }, w => { w.sim.seed = 'different'; },
    w => { w.disposed = true; }, w => { w.enterLivingShallows(w.oceanChunks.generator.routeStops.findIndex(s => s.id === 'biodiversity-reef')); }];
  for (const takeover of takeovers) {
    const f = fixture(); t.after(() => f.animals.dispose()); let finish;
    f.world.requestOceanEcology = () => {};
    f.world.oceanEcology = { update() { return new Promise(resolve => { finish = resolve; }); } };
    const pending = f.world.enterOceanBiodiversity(); takeover(f.world);
    const position = f.world.oceanWorldPosition(), target = f.world.controls.target.clone(), updates = f.updates.length;
    finish(true); assert.equal(await pending, false);
    assert.deepEqual(f.world.oceanWorldPosition(), position); assert.deepEqual(f.world.controls.target, target); assert.equal(f.updates.length, updates);
  }
});

test('production camera support and renderer receive real patch surfaces while normal and director navigation share the native geographic stop', async t => {
  const f = fixture(); t.after(() => f.animals.dispose());
  assert.equal(await f.world.enterOceanBiodiversity(), true); await settle(f);
  const coral = f.ecology.scenery.find(p => p.speciesId === 'biodiversity-massive-coral'); assert.ok(coral);
  const cap = oceanBiodiversityPatchHeight(coral, coral.x, coral.z); assert.ok(Number.isFinite(cap));
  assert.ok(f.world.habitatY(coral.x, coral.z) >= cap); assert.equal(f.ecology.biodiversitySupportHeight(coral.x, coral.z), cap);
  const position = f.world.oceanWorldPosition(), target = worldTarget(f.world), before = structuredClone([...f.records]);
  f.world.setOceanRenderOrigin(f.world.oceanRenderOrigin.x + 64, f.world.oceanRenderOrigin.z - 64);
  assert.deepEqual(f.world.oceanWorldPosition(), position); assert.deepEqual(worldTarget(f.world), target);
  assert.ok(f.world.habitatY(coral.x, coral.z) >= cap);
  assert.equal(f.world.travelLivingShallows(f.generator.routeStops.findIndex(row => row.id === f.stop.id)), true);
  assert.deepEqual(f.world.oceanWorldPosition(), position); assert.equal(f.world.oceanTravel.x, f.stop.x);
  assert.deepEqual([...f.records], before, 'ordinary travel does not rewrite the admitted community');
  const step = DIRECTOR_STEPS.find(row => row.action.stopId === f.stop.id); assert.ok(step); assert.equal(step.motion.kind, 'walk');
  assert.equal(navigateDemoEntry(step.action, f.world), true);
  assert.deepEqual([...f.records], before, 'director placement itself does not invent ecological records');
  const calls = source.split('\n').filter(line => line.includes('this.oceanAnimals.update(this.oceanEcology.agents,'));
  assert.equal(calls.length, 3); assert.ok(calls.every(line => line.includes('this.oceanEcology.scenery??[]')));
  assert.ok(source.includes('biodiversity:this.isLivingShallows'));
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("get('demo')==='biodiversity'?{kind:'living-stop',biome:'reef',profile:LIVING_SHALLOWS_PROFILE,stopId:'biodiversity-reef',biodiversityEntry:true}"));
  assert.ok(app.includes("if(new URLSearchParams(window.location.search).get('demo')==='biodiversity')return 'reef'"));
  assert.ok(app.includes("if(new URLSearchParams(window.location.search).get('demo')==='biodiversity')return LIVING_SHALLOWS_PROFILE"));
  assert.ok(app.includes('actual.enterOceanBiodiversity().then(entered=>'));
  assert.deepEqual(OCEAN_BIODIVERSITY_ROUTE_STOPS.map(row => row.id), ['biodiversity-reef']);
});
