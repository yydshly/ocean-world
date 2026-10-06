import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { SHALLOW_SEASCAPE_ROUTE_STOPS } from '../src/livingShallowSeascape.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';

// Execute the native entry against real records and geometry. No WebGL context
// or browser acceptance is implied by these CPU observation tests.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const WorldCPU = new Function('THREE', `return class {${['oceanWorldPosition', 'enterShallowSeascape',
  'enterLivingShallows', 'travelLivingShallows', 'makeLighting'].map(method).join('\n')}}`)(THREE);
function fixture() {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const records = new Map(), commits = [], store = { available: true,
    async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, entries) { commits.push(structuredClone(entries)); for (const [id, row] of entries) records.set(id, structuredClone(row)); },
  };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, shallowSeascape: true, turtleGrazing: true });
  const world = new WorldCPU(), updates = [];
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, environment: { hour: 14 } },
    controlStartCount: 0, camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), update() {} }, oceanRenderOrigin: { x: 0, z: 0 },
    surfaceY: generator.surfaceY, oceanEcology: ecology,
    oceanChunks: { generator, update(position) { updates.push({ ...position }); } }, keys: new Set(),
    habitatY(x, z) { return generator.heightForCamera(x, z); },
    restoreOceanObservation(view) {
      this.camera.position.set(view.position.x, view.position.y, view.position.z);
      this.controls.target.set(view.target.x, view.target.y, view.target.z); return true;
    }, select() {}, onSelect() {}, emitSnapshot() {},
  });
  return { world, ecology, generator, records, commits, updates };
}

test('ordinary whole-scene entry waits for twelve actual committed plans, real animals and a safe native view', async () => {
  const f = fixture();
  assert.equal(await f.world.enterShallowSeascape(), true);
  const complete = [...f.records.values()].filter(row => row.livingRidgePlan?.version === 6);
  assert.equal(complete.length, 12);
  assert.ok(f.commits.some(rows => rows.length === 12 && rows.every(([, row]) => row.livingRidgePlan?.version === 6)));
  assert.equal(f.ecology._active.size, 9);
  assert.ok(complete.every(row => row.agents.length > 0 && row.agents.length <= 20));
  const p = f.world.oceanWorldPosition();
  assert.ok(p.y >= f.generator.heightForCamera(p.x, p.z) + .25);
  assert.ok(p.y <= f.generator.surfaceY - .5);
  assert.equal(f.world.oceanTravel, undefined, 'entry is an explicit observation placement');
  const before = structuredClone([...f.records]);
  assert.equal(await f.world.enterShallowSeascape(), true);
  assert.deepEqual([...f.records], before, 'the second entry neither rebirths nor refills');
  const nativeIndex = f.generator.routeStops.findIndex(stop => stop.id === 'shallow-scene-sand');
  const start = f.world.oceanWorldPosition();
  assert.equal(f.world.travelLivingShallows(nativeIndex), true);
  assert.deepEqual(f.world.oceanWorldPosition(), start, 'ordinary next stage swims through the same sea, without teleportation');
  assert.equal(f.world.oceanTravel.x, SHALLOW_SEASCAPE_ROUTE_STOPS[1].x);
  assert.equal(f.world.oceanTravel.z, SHALLOW_SEASCAPE_ROUTE_STOPS[1].z);
});

test('a saved owner prevents a false new-package success and retains the complete old record', async () => {
  const f = fixture(), stop = SHALLOW_SEASCAPE_ROUTE_STOPS[0];
  // Create and persist an ordinary old-version owner, then visit with the new option.
  const oldGenerator = createLivingRidgeGenerator(createLivingShallowsGenerator(f.world.sim.seed));
  const old = new OceanEcology(f.world.sim.seed, oldGenerator, { store: {
    available: true, async load(_world, id) { return structuredClone(f.records.get(id) ?? null); },
    async saveMany(_world, rows) { for (const [id, row] of rows) f.records.set(id, structuredClone(row)); },
  }, turtles: true, livingGeology: true, habitatMosaic: true, seabedRelief: true,
    seascape: true, livingBelt: true, turtleGrazing: true });
  await old.update(stop); await old.checkpoint();
  const historical = structuredClone([...f.records]);
  assert.equal(await f.world.enterShallowSeascape(), false);
  for (const [id, row] of historical) assert.deepEqual(f.records.get(id), row);
  assert.ok(![...f.records.values()].some(row => row.livingRidgePlan?.version === 6));
});

test('late load cannot move the camera after manual takeover, seed change or disposal', async () => {
  for (const takeover of [world => { world.camera.position.x += 2; },
    world => { world.controlStartCount++; }, world => { world.sim.seed = 'other'; }, world => { world.disposed = true; },
    world => { world.keys.add('KeyW'); }, world => { world.directorMotion = {}; },
    world => { world.enterLivingShallows(world.oceanChunks.generator.routeStops.findIndex(stop => stop.id === 'shallow-scene-reef')); }]) {
    const f = fixture(); let finish;
    f.world.oceanEcology = { update() { return new Promise(resolve => { finish = resolve; }); } };
    const pending = f.world.enterShallowSeascape();
    takeover(f.world); const position = f.world.oceanWorldPosition(), target = f.world.controls.target.clone();
    finish(true); assert.equal(await pending, false);
    assert.deepEqual(f.world.oceanWorldPosition(), position); assert.deepEqual(f.world.controls.target, target);
  }
});

test('unreadable persistence fails ordinary entry rather than inventing a complete package', async () => {
  const f = fixture(); f.world.oceanEcology = { async update() { return false; } };
  assert.equal(await f.world.enterShallowSeascape(), false);
  assert.equal(f.records.size, 0);
});

test('the director covers all four whole-scene native entries with real moving chapter actions', () => {
  for (const stop of SHALLOW_SEASCAPE_ROUTE_STOPS) {
    const step = DIRECTOR_STEPS.find(row => row.action.stopId === stop.id); assert.ok(step);
    assert.equal(step.motion.kind, 'walk'); assert.equal(step.durationMs, 12000);
    const f = fixture(), index = f.generator.routeStops.findIndex(row => row.id === stop.id);
    assert.equal(navigateDemoEntry(step.action, f.world), true);
    const p = f.world.oceanWorldPosition();
    assert.ok(Math.hypot(p.x - stop.x, p.z - stop.z) < 20);
    assert.equal(f.records.size, 0, 'native navigation itself cannot invent ecological records');
    assert.ok(index >= 13, 'the old public route indices stay unchanged');
  }
});

test('the first director chapter enters the complete committed scene rather than the older small sample', async () => {
  const f = fixture(), step = DIRECTOR_STEPS[0], action = directorStepAction(step);
  assert.equal(action.entryStopId, SHALLOW_SEASCAPE_ROUTE_STOPS[0].id);
  assert.equal(step.motion.kind, 'walk');
  assert.equal(step.motion.routeId, undefined, 'the old twelve-metre close sample is not the new opening');
  assert.equal(navigateDemoEntry(action, f.world), true);
  assert.notEqual(await f.ecology.update(f.world.oceanWorldPosition()), false);
  const p = f.world.oceanWorldPosition(), chunk = f.generator.chunk(Math.floor(p.x / 64), Math.floor(p.z / 64));
  assert.equal(chunk.ridgePlan.version, 6);
  assert.equal([...f.records.values()].filter(row => row.livingRidgePlan?.version === 6).length, 12);
  assert.equal(f.ecology._active.size, 9);
});

test('the same sun covers the whole shallow middle distance while other worlds retain original lighting', () => {
  for (const living of [true, false]) {
    const world = new WorldCPU(); Object.assign(world, { isDeep: false, isKelp: false, isLivingShallows: living,
      surfaceY: 8, scene: new THREE.Scene() }); world.makeLighting();
    assert.equal(world.sun.shadow.camera.right - world.sun.shadow.camera.left, living ? 60 : 30);
    assert.equal(world.sun.shadow.mapSize.x, living ? 2048 : 1024);
    assert.equal(world.sun.shadow.camera.far, living ? 80 : 45);
    assert.equal(world.scene.children.filter(object => object.isDirectionalLight).length, 1);
    assert.equal(world.scene.children.filter(object => object.isSpotLight).length, 0);
  }
});
