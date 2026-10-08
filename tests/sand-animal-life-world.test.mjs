import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanAnimalSediment } from '../src/world/OceanAnimalSediment.js';
import { OceanAnimalEncounters } from '../src/world/oceanAnimalEncounters.js';
import { OceanWaterParticles } from '../src/world/OceanWaterParticles.js';
import { livingShallowsPresentation } from '../src/livingShallowsPresentation.js';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
import { isDirectorPlaybackRate, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';

const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function method(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, 'actual shipped method ' + name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'livingShallowsPresentation', 'isDirectorPlaybackRate',
  'advanceDirectorCameraElapsed', 'coastalSeascapeWindowReady', `return class {${[
    'oceanWorldPosition', 'updateOceanWater', 'beginDirectorMotion', 'createReefValleyRegionSegment',
    'sampleReefValleyRegionSegment', 'updateReefValleyRegionMotion', 'stopDirectorMotion',
  ].map(method).join('\n')}}`)(THREE, THREE.MathUtils.clamp, livingShallowsPresentation,
  isDirectorPlaybackRate, advanceDirectorCameraElapsed, coastalSeascapeWindowReady);

test('shipped constructor creates sand interaction and encounters only for living shallows', t => {
  const marker = '        if(this.isLivingShallows){\n          this.oceanAnimalSediment=';
  const start = source.indexOf(marker), end = source.indexOf('\n      this.onOceanCheckpoint=', start);
  assert.ok(start >= 0 && end > start);
  const construct = new Function('seed', 'OceanAnimalSediment', 'OceanAnimalEncounters', source.slice(start, end));
  for (const living of [true, false]) {
    const world = { isLivingShallows: living, scene: new THREE.Scene(), surfaceY: 8 };
    construct.call(world, 'native44', OceanAnimalSediment, OceanAnimalEncounters);
    assert.equal(world.oceanAnimalSediment instanceof OceanAnimalSediment, living);
    assert.equal(world.oceanAnimalEncounters instanceof OceanAnimalEncounters, living);
    world.oceanAnimalSediment?.dispose();
    assert.equal(world.scene.children.length, 0);
  }
  assert.match(source, /new OceanChunks\(seed,\{sandMaterial:this.sandMaterial,livingGeology:this.isLivingShallows,sandHabitat:this.isLivingShallows\}\)/);
});

test('shipped clock passes actual quantized ecology advance, freezing pause and loading', () => {
  const start = source.indexOf('    this._animalSedimentDtSec=0;', source.indexOf('  tick('));
  const end = source.indexOf('    if(this.isLivingShallows&&this.elapsed-', start);
  const tick = new Function('dt', source.slice(start, end));
  const world = { paused: false, isLivingShallows: true, speed: 1, visualTimeSec: 0, livingClockSec: 0,
    sim: { timeSec: 0, environment: { hour: 12 } }, errors: [], onError: assert.fail,
    oceanEcology: { _activeTime: 0, remainder: 0, step(dt) { this.remainder += dt;
      if (this.remainder >= .1) { this.remainder -= .1; this._activeTime += .1; } } } };
  tick.call(world, .04); assert.equal(world._animalSedimentDtSec, 0);
  tick.call(world, .07); assert.equal(world._animalSedimentDtSec, .1);
  world.paused = true; tick.call(world, .12); assert.equal(world._animalSedimentDtSec, 0);
  world.paused = false; world.oceanEcologyResetting = true; tick.call(world, .12);
  assert.equal(world._animalSedimentDtSec, 0); assert.equal(world.oceanEcology._activeTime, .1);
});

test('native water frame delivers real feed events, world coordinates, pause and rebasing', t => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#236b87');
  scene.fog = new THREE.FogExp2(scene.background, .06);
  const x = 228 * 64 + 32, z = 320;
  const generator = { profile: 'living-shallows-v1', surfaceY: 8,
    sample: () => ({ floorY: -6, substrate: 'sand', habitat: 'sand', depthM: 14, rockiness: 0 }),
    floorSurface: () => ({ height: -6, normal: { x: 0, y: 1, z: 0 } }),
    coverAt: () => ({ seagrass: 0, coral: 0 }) };
  const agent = { id: 'real-feed-event', speciesId: 'reef-goatfish', alive: true,
    regionId: '228,5', benthicLifeIndividualVersion: 1, benthicLifeMode: 'soft', sizeM: .25, state: 'foraging', heading: 0, timeSec: 0, lastFeedAt: null,
    position: { x: x + 1, y: -5.82, z }, velocity: { x: .1, y: 0, z: 0 } };
  const world = Object.assign(new World(), { isLivingShallows: true, oceanEcologyResetting: false,
    surfaceY: 8, scene, paused: false, livingClockSec: 0, visualTimeSec: 0,
    camera: new THREE.PerspectiveCamera(49, 16 / 9, .05, 160), oceanRenderOrigin: { x: x - 32, z: z - 32 },
    sim: { environment: { hour: 12, currentMps: .15, turbidity: .25, foodSupply: 1 } },
    oceanChunks: { generator, setEnvironment() {} }, oceanEcology: { agents: [agent] },
    oceanWaterField: createOceanEnvironment('native44', generator),
    oceanWaterParticles: new OceanWaterParticles(scene, { seed: 'native44' }),
    oceanAnimalSediment: new OceanAnimalSediment(scene, { seed: 'native44', surfaceY: 8 }),
    habitatY: () => -6, sun: { intensity: 1, color: new THREE.Color() },
    ambient: { intensity: 1, color: new THREE.Color(), groundColor: new THREE.Color() },
    waterNightColor: new THREE.Color('#071e2b'),
    waterColors: { horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, top: { value: new THREE.Color() } },
    oceanWaterPalette: Object.fromEntries(['clear', 'green', 'topClear', 'topGreen', 'night', 'day', 'tone', 'top'].map(k => [k, new THREE.Color('#195e7a')])),
    particleUniforms: { opacity: { value: .18 } }, visualEnvironment: {}, _animalSedimentDtSec: 0 });
  t.after(() => { world.oceanAnimalSediment.dispose(); world.oceanWaterParticles.dispose(); });
  world.camera.position.set(32, -4, 32);
  world.updateOceanWater(.12); assert.equal(world.oceanAnimalSediment.stats.emittedParticles, 0);
  agent.timeSec = .1; agent.lastFeedAt = .1; world._animalSedimentDtSec = .1;
  const before = structuredClone(agent); world.updateOceanWater(.12);
  assert.ok(world.oceanAnimalSediment.stats.emittedParticles > 0, 'native water receives the new actual feed timestamp');
  assert.deepEqual(agent, before, 'render layer never mutates the real ecology');
  const emitted = world.oceanAnimalSediment.stats.emittedParticles;
  const particles = world.oceanAnimalSediment.particleSnapshot();
  world.paused = true; world._animalSedimentDtSec = 0;
  world.oceanRenderOrigin.x += 64; world.camera.position.x -= 64; world.updateOceanWater(.12);
  assert.equal(world.oceanAnimalSediment.stats.emittedParticles, emitted);
  assert.equal(world.oceanAnimalSediment.stats.clockSec, .1);
  assert.deepEqual(agent, before);
  // Absolute particle positions remain fixed while the render transform rebases.
  assert.deepEqual(world.oceanAnimalSediment.particleSnapshot(), particles);
  assert.equal(world.oceanAnimalSediment.root.parent, scene);
});

test('native meadow shot observes live residents without changing path, clocks or population', () => {
  const cx = 228, cz = 4, x = cx * 64 + 2, z = cz * 64 + 32;
  const plan = { version: 9, theme: 'seagrass-meadow-region', group: { id: 'native-meadow', cx, cz,
    ownerIds: Array.from({ length: 12 }, (_, i) => `${cx + i % 6},${cz + Math.floor(i / 6)}`),
    routePath: Array.from({ length: 60 }, (_, i) => ({ x: x + i * 6, y: -4, z })) } };
  const owners = Array.from({ length: 9 }, (_, i) => `${cx - 1 + i % 3},${cz - 1 + Math.floor(i / 3)}`);
  const animals = [0, 1, 2].map(i => ({ id: `school:${i}`, alive: true, state: 'schooling', regionId: `${cx},${cz}`,
    speciesId: 'green-chromis', groupId: 'native-school', sizeM: .2, timeSec: 0,
    position: { x: x + 23 + i * .25, y: -3.9, z: z + 2.5 + i * .1 } }));
  const world = Object.assign(new World(), { isLivingShallows: true, disposed: false, paused: false,
    oceanEcologyResetting: false, camera: new THREE.PerspectiveCamera(49, 16 / 9, .05, 160),
    controls: { target: new THREE.Vector3(x + 8, -4.65, z), enableDamping: true, update() {} },
    oceanRenderOrigin: { x: 0, z: 0 }, keys: new Set(), surfaceY: 8, sim: { seed: 'native44' },
    oceanChunks: { stats: { loadedChunks: owners } }, oceanEcology: { agents: animals, _active: new Map(owners.map(id => [id, {}])) },
    currentSeagrassMeadowRegionPlan: () => plan, oceanAnimalEncounters: new OceanAnimalEncounters(),
    catalog: new Map([['green-chromis', { kind: 'fish', lengthM: .2 }]]),
    floorY: () => -6, habitatY: () => -6, clearCameraPosition: p => p, enforceCameraClearance() {}, emitSnapshot() {} });
  world.camera.position.set(x, -4, z);
  assert.equal(world.beginDirectorMotion({ kind: 'reef-valley-route', routeId: 'seagrass-meadow-region', durationSec: 200 }), true);
  const original = structuredClone(animals); let encountered = false;
  for (let i = 0; i < 150; i++) {
    world.updateReefValleyRegionMotion(.1);
    assert.equal(world.directorMotion.error, null);
    const frame = world.sampleReefValleyRegionSegment(world.directorMotion.reefValleySegments[0], world.directorMotion.elapsedSec, 200);
    assert.deepEqual(world.camera.position.toArray(), [frame.position.x, frame.position.y, frame.position.z]);
    encountered ||= world.oceanAnimalEncounters.stats().ids.length > 1;
  }
  assert.equal(encountered, true, 'shipped motion actually calls the local school observer');
  assert.deepEqual(animals, original);
  const pose = world.camera.position.clone(), target = world.controls.target.clone(); world.paused = true;
  world.updateReefValleyRegionMotion(1); assert.ok(world.camera.position.equals(pose)); assert.ok(world.controls.target.equals(target));
  world.paused = false; const elapsed = world.directorMotion.elapsedSec; world.oceanEcology._active.delete(owners[0]);
  world.updateReefValleyRegionMotion(.1); assert.equal(world.directorMotion.elapsedSec, elapsed);
  assert.equal(world.directorMotion.waitingForRegions, true);
  world.stopDirectorMotion(); assert.equal(world.oceanAnimalEncounters.stats().ids.length, 0); assert.deepEqual(animals, original);
});
