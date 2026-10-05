import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createKelpCommunityObservationPlan } from '../src/kelpCommunityObservation.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KelpSimulation } from '../src/kelpSimulation.js';
import { kelpStipePosition } from '../src/kelpHabitat.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { deepOceanLayerHeight } from '../src/deepOceanNavigation.js';
import { reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY } from '../src/habitat.js';

// Frozen public poses use their original support-v1 geometry. Fresh typed-seed
// ecology below still exercises the current default landscape independently.
const beforeReceipt = JSON.parse(readFileSync(new URL('../output/validation/kelp-community-view-browser-before.json', import.meta.url)));
const receipt = JSON.parse(readFileSync(new URL('../output/validation/kelp-community-view-browser-opening-final.json', import.meta.url)));
const point = { x: receipt.ocean.worldPosition[0], y: receipt.ocean.worldPosition[1], z: receipt.ocean.worldPosition[2] };
const baseArgs = { position: point, agents: receipt.ocean.ecology.agents,
  loadedChunkIds: receipt.ocean.streaming.loadedChunks, regionId: receipt.ocean.chunkId,
  visibilityM: receipt.ocean.localWater.visibilityM, surfaceY: receipt.surfaceY,
  aspect: receipt.viewport.width / receipt.viewport.height, fovDeg: 49 };
const planFor = (options = {}) => createKelpCommunityObservationPlan({ generator: createKelpOceanGenerator('42', { supportVersion: 1 }), ...baseArgs, ...options });
const vector = p => new THREE.Vector3(p.x, p.y, p.z);
const regionOf = p => `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} versus ${b}`);
const nearPoint = (a, b, label = '') => { for (const axis of ['x', 'y', 'z']) near(a[axis], b[axis], `${label}/${axis}`); };
const serialized = value => JSON.parse(JSON.stringify(value, (_key, child) => child instanceof Map ? [...child] : child));
function assertAllSphereInside(stop, references = stop.displayEvidence.references) {
  const { fovDeg, aspect, visibilityM } = stop.displayEvidence;
  const camera = new THREE.PerspectiveCamera(fovDeg, aspect, .04, visibilityM);
  camera.position.copy(vector(stop.position)); camera.lookAt(vector(stop.target)); camera.updateMatrixWorld();
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
  for (const reference of references) {
    const center = vector(reference.position), radius = reference.radiusM;
    assert.ok(frustum.containsPoint(center), `${stop.id}: ${reference.id} center is in actual THREE frustum`);
    for (const plane of frustum.planes) assert.ok(plane.distanceToPoint(center) >= radius - 1e-8,
      `${stop.id}: entire ${reference.id} reference sphere clears every independent frustum plane`);
    assert.ok(camera.position.distanceTo(center) + radius <= visibilityM + 1e-8);
  }
}
function assertUsableVerticalFrame(stop, low, high) {
  const { fovDeg, aspect, visibilityM } = stop.displayEvidence, nearPlane = .04;
  const camera = new THREE.PerspectiveCamera(fovDeg, aspect, nearPlane, visibilityM);
  camera.position.copy(vector(stop.position)); camera.lookAt(vector(stop.target)); camera.updateMatrixWorld();
  // Independently build an off-centre subfrustum for the usable strip of the
  // original canvas. A whole sphere must clear these real geometric planes.
  const tangent = Math.tan(fovDeg * Math.PI / 360);
  const projection = new THREE.Matrix4().makePerspective(-nearPlane * tangent * aspect, nearPlane * tangent * aspect,
    nearPlane * tangent * high, nearPlane * tangent * low, nearPlane, visibilityM);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(projection, camera.matrixWorldInverse));
  for (const reference of stop.displayEvidence.references) {
    const center = vector(reference.position);
    for (const plane of frustum.planes) assert.ok(plane.distanceToPoint(center) >= reference.radiusM - 1e-8,
      `${stop.id}: ${reference.id} clears the usable vertical strip [${low}, ${high}]`);
  }
}
function scenery(generator, ids = baseArgs.loadedChunkIds) {
  return ids.flatMap(id => generator.chunk(...id.split(',').map(Number)).elements);
}

test('actual paused saved community frames every live member, real neighbouring roots and lower stems at the real aspect and FOV', () => {
  const plan = planFor(); assert.ok(plan); assert.equal(plan.scope, 'observation-only');
  assert.equal(plan.originCellId, receipt.ocean.chunkId); assert.deepEqual(plan.stops.map(s => s.id), ['community', 'forest', 'opening']);
  const source = receipt.ocean.ecology.agents.find(a => a.id === plan.sourceAgentIds[0]);
  assert.equal(source.speciesId, 'blue-rockfish');
  const completeGroup = receipt.ocean.ecology.agents.filter(a => a.alive && a.speciesId === 'blue-rockfish' && a.groupId === source.groupId);
  assert.equal(completeGroup.length, 5);
  assert.deepEqual(plan.sourceAgentIds, completeGroup.map(a => a.id).sort());
  assert.deepEqual(plan.stops[0].displayEvidence.references.filter(r => r.kind === 'animal').map(r => r.id), plan.sourceAgentIds);
  assertAllSphereInside(plan.stops[0]); assertAllSphereInside(plan.stops[1]);
  assertUsableVerticalFrame(plan.stops[0], -.78, .65);
  assertUsableVerticalFrame(plan.stops[1], -.74, .78);
  assertAllSphereInside(plan.stops[2], plan.stops[2].displayEvidence.references.filter(r => r.kind !== 'sediment-opening'));
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), byId = new Map(scenery(generator).map(e => [e.id, e]));
  for (const stop of plan.stops) for (const reference of stop.displayEvidence.references.filter(r => ['root', 'lower-stipe'].includes(r.kind))) {
    const root = byId.get(reference.id); assert.ok(root && root.kind === 'kelp');
    assert.ok(Number.isFinite(oceanRockHeight(byId.get(root.hostId), root.x, root.z)), 'root has a real supporting rock');
    nearPoint(reference.position, kelpStipePosition(root.anchor, reference.fraction,
      reference.referenceTimeSec, reference.referenceEnvironment, reference.frondIndex));
  }
});

test('all three ordinary views clear actual generator solids and floor, remain submerged and retain the same ecology cell', () => {
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), plan = planFor({ generator }); assert.ok(plan);
  for (const stop of plan.stops) {
    assert.equal(regionOf(stop.position), baseArgs.regionId);
    assert.ok(stop.position.y >= generator.heightForCamera(stop.position.x, stop.position.z) + .7 - 1e-8);
    assert.ok(stop.position.y >= generator.floorSurface(stop.position.x, stop.position.z).height + .7 - 1e-8);
    assert.ok(stop.position.y <= receipt.surfaceY - .5);
    const direction = vector(stop.position).sub(vector(stop.target));
    const spherical = new THREE.Spherical().setFromVector3(direction);
    assert.ok(spherical.phi >= .15 * Math.PI && spherical.phi <= .55 * Math.PI, 'ordinary control angle survives unchanged');
    assert.ok(spherical.radius >= .18 && spherical.radius <= 30);
  }
  assert.ok(plan.regionIds.every(id => baseArgs.loadedChunkIds.includes(id)));
});

test('opening is supported by nine actual sediment samples and independent absence of nearby real roots and rocks', () => {
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), plan = planFor({ generator }); assert.ok(plan);
  const stop = plan.stops.find(s => s.id === 'opening'), evidence = stop.displayEvidence;
  assert.equal(evidence.floorSamples.length, 9);
  for (const sample of evidence.floorSamples) {
    assert.equal(regionOf({ ...sample, y: 0 }), plan.originCellId);
    near(sample.height, generator.floorSurface(sample.x, sample.z).height);
    near(sample.supportHeight, generator.heightForCamera(sample.x, sample.z));
    near(sample.height, sample.supportHeight, 'opening has no elevated rock');
  }
  const roots = scenery(generator).filter(e => e.kind === 'kelp');
  const nearest = Math.min(...roots.map(root => Math.hypot(root.x - stop.position.x, root.z - stop.position.z)));
  assert.ok(nearest >= 4); near(nearest, evidence.nearestRootDistanceM);
  assert.equal(roots.filter(root => Math.hypot(root.x - stop.position.x, root.z - stop.position.z) < 4).length, 0);
  near(stop.position.y, evidence.floorSamples[0].height + 2.8);
});

test('the complete live cohort cannot be trimmed to conceal an outlying member that will not fit', () => {
  const initial = planFor(), first = receipt.ocean.ecology.agents.find(a => a.id === initial.sourceAgentIds[0]);
  const cohort = structuredClone(receipt.ocean.ecology.agents.filter(a => a.speciesId === 'blue-rockfish' && a.groupId === first.groupId));
  cohort.push({ ...structuredClone(first), id: 'independent-outlier', position: { x: 190, y: first.position.y, z: 60 }, regionId: '2,0' });
  assert.equal(planFor({ agents: cohort }), null, 'an impossible full group returns null rather than publishing a partial group');
  const remaining = cohort.filter(a => a.id !== 'independent-outlier');
  assert.ok(planFor({ agents: remaining }), 'the actual original group is a nontrivial successful control');
});

test('actual giant kelpfish fallback uses real hosts or honestly refuses a community that cannot clear usable framing', () => {
  const agents = receipt.ocean.ecology.agents.filter(a => a.speciesId !== 'blue-rockfish');
  const before = structuredClone(agents), fallback = planFor({ agents });
  assert.ok(fallback, 'this real final observer supplies a nontrivial successful host-fish fallback');
  if (fallback) {
    assert.equal(fallback.stops[0].displayEvidence.groupMode, 'live-host-fish');
    for (const id of fallback.sourceAgentIds) {
      const fish = agents.find(a => a.id === id); assert.ok(fish.alive && fish.speciesId === 'giant-kelpfish');
      assert.ok(fallback.sourceRootIds.includes(fish.hostSceneryId));
    }
    assertAllSphereInside(fallback.stops[0]); assertUsableVerticalFrame(fallback.stops[0], -.78, .65);
  } else {
    assert.equal(fallback, null); assert.ok(agents.some(a => a.alive && a.speciesId === 'giant-kelpfish'));
  }
  assert.deepEqual(agents, before);
  assert.equal(planFor({ agents: [] }), null);
  assert.equal(planFor({ agents: agents.map(a => ({ ...a, alive: false })) }), null);
  assert.equal(planFor({ agents: agents.filter(a => a.speciesId === 'giant-kelpfish').map(a => ({ ...a, hostSceneryId: 'unavailable-host' })) }), null);
});

test('queries are bounded to exactly the supplied loaded owners and reordered inputs/cache visits do not affect output', () => {
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), queried = [];
  const bounded = { ...generator, chunk(cx, cz) {
    const id = `${cx},${cz}`; assert.ok(baseArgs.loadedChunkIds.includes(id), `unloaded query ${id}`);
    queried.push(id); return generator.chunk(cx, cz);
  } };
  const result = planFor({ generator: bounded }); assert.ok(result);
  assert.equal(queried.length, 9); assert.equal(new Set(queried).size, 9);
  const reordered = createKelpOceanGenerator('42', { supportVersion: 1 });
  for (const id of [...baseArgs.loadedChunkIds].reverse()) reordered.chunk(...id.split(',').map(Number));
  const reverseChunks = { ...reordered, chunk(cx, cz) {
    const chunk = reordered.chunk(cx, cz); return { ...chunk, elements: [...chunk.elements].reverse() };
  } };
  assert.deepEqual(planFor({ generator: reverseChunks, loadedChunkIds: [...baseArgs.loadedChunkIds].reverse(),
    agents: [...baseArgs.agents].reverse() }), result);
});

test('planning does not modify input/public biological fields or actual scenery and returned plan is deeply immutable', () => {
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), args = structuredClone(baseArgs), input = structuredClone(args);
  const beforeScenery = structuredClone(scenery(generator)), result = createKelpCommunityObservationPlan({ generator, ...args });
  assert.ok(result); assert.deepEqual(args, input); assert.deepEqual(scenery(generator), beforeScenery);
  const verifyFrozen = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(verifyFrozen); } };
  verifyFrozen(result); assert.throws(() => { result.stops[0].position.x += 1; }, TypeError);
});

test('invalid windows, public data or failing support reject without requesting outside owners or mutating input', () => {
  const original = structuredClone(baseArgs);
  const invalid = [{ position: { ...point, x: NaN } }, { loadedChunkIds: [] }, { loadedChunkIds: ['1,0'] },
    { loadedChunkIds: [...baseArgs.loadedChunkIds, '4,0'] }, { loadedChunkIds: ['2,0', '90,0'] }, { loadedChunkIds: ['2,0', 'oops'] },
    { regionId: '1,0' }, { visibilityM: 6.99 }, { visibilityM: Infinity }, { aspect: 0 }, { fovDeg: 101 },
    { surfaceY: NaN }, { generator: { chunk() { throw new Error('unavailable'); }, floorSurface() {} } },
    { generator: { ...createKelpOceanGenerator('42', { supportVersion: 1 }), floorSurface: () => ({ height: NaN }) } },
    { agents: [...baseArgs.agents, structuredClone(baseArgs.agents.find(a => a.alive))] }];
  for (const options of invalid) assert.equal(planFor(options), null);
  const isolated = baseArgs.agents.filter(a => a.speciesId === 'blue-rockfish');
  assert.equal(planFor({ agents: isolated.map(a => ({ ...a, regionId: 'unloaded' })) }), null);
  assert.equal(planFor({ position: { x: beforeReceipt.ocean.worldPosition[0], y: beforeReceipt.ocean.worldPosition[1],
    z: beforeReceipt.ocean.worldPosition[2] }, agents: beforeReceipt.ocean.ecology.agents,
    aspect: beforeReceipt.viewport.width / beforeReceipt.viewport.height,
    visibilityM: beforeReceipt.ocean.localWater.visibilityM }), null,
  'the real earlier observer honestly refuses rather than crop a group or ignore foreground plant envelopes');
  assert.deepEqual(baseArgs, original);
});

function memoryStore() {
  const records = new Map(); return { available: true, records,
    load: async (world, id) => structuredClone(records.get(`${world}|${id}`) ?? null),
    saveMany: async (world, entries) => { for (const [id, record] of entries) records.set(`${world}|${id}`, structuredClone(record)); },
    clear: async () => records.clear() };
}
const completeEcology = ecology => [...ecology._active].map(([id, region]) => [id, serialized(ecology._record(region))]);
test('typed seeds and real fresh ecology are independently repeatable and honest about locations with no complete view', async () => {
  for (const seed of [42, '42', 'community-observation']) {
    const generator = createKelpOceanGenerator(seed), ecology = new KelpOceanEcology(seed, generator, { store: memoryStore() });
    await ecology.update(point); const snapshot = ecology.snapshot(), complete = completeEcology(ecology);
    const args = { ...baseArgs, generator, agents: snapshot.agents, loadedChunkIds: snapshot.regions.map(r => r.id) };
    const result = createKelpCommunityObservationPlan(args), repeated = createKelpCommunityObservationPlan({ ...args,
      agents: [...args.agents].reverse(), loadedChunkIds: [...args.loadedChunkIds].reverse() });
    assert.deepEqual(result, repeated); assert.deepEqual(completeEcology(ecology), complete);
    if (result) { assertAllSphereInside(result.stops[0]); assert.ok(result.sourceAgentIds.every(id => snapshot.agents.some(a => a.id === id && a.alive))); }
    else assert.equal(result, null, 'fresh region need not fabricate a frameable community');
  }
});

test('actual desktop and earlier portrait canvases retain the complete valid school and clear the asymmetric toolbar/footer strip', () => {
  for (const aspect of [1280 / 720, 767 / 871]) {
    const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), plan = planFor({ generator, aspect });
    assert.ok(plan); assert.equal(plan.sourceAgentIds.length, 5);
    assertAllSphereInside(plan.stops[0]); assertAllSphereInside(plan.stops[1]);
    assertUsableVerticalFrame(plan.stops[0], -.78, .65); assertUsableVerticalFrame(plan.stops[1], -.74, .78);
    for (const stop of plan.stops) {
      assert.equal(regionOf(stop.position), baseArgs.regionId);
      assert.ok(stop.position.y >= generator.heightForCamera(stop.position.x, stop.position.z) + .7 - 1e-8);
    }
  }
});

// Execute actual shipped actions and clearance with real OrbitControls; only
// WebGL construction is omitted. The paused public pose fixture supplies the
// planner snapshot while separate real model records guard against any update.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function worldMethod(name) {
  const start = source.indexOf(`  ${name}(`); assert.ok(start >= 0, `${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const WorldFixture = new Function('THREE', 'clamp', 'createKelpCommunityObservationPlan', 'normalizeOceanObservationView',
  'oceanLayerHeight', 'deepOceanLayerHeight', 'reefRockFootprintContains', 'reefRockCanonicalCoordinates', 'reefRockSurfaceY',
  `return class {${['floorY', 'habitatY', 'oceanWorldPosition', 'focusKelpCommunity', 'restoreOceanObservation',
    'oceanLayerY', 'setOceanRenderOrigin', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(worldMethod).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, createKelpCommunityObservationPlan, normalizeOceanObservationView,
  oceanLayerHeight, deepOceanLayerHeight, reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY);
async function worldFixture(origin = { x: 128, z: 64 }, aspect = baseArgs.aspect) {
  const generator = createKelpOceanGenerator('42', { supportVersion: 1 }), ecology = new KelpOceanEcology('42', generator, { store: memoryStore() });
  await ecology.update(point); const publicData = structuredClone(receipt.ocean.ecology), calls = [];
  ecology.snapshot = () => structuredClone(publicData);
  ecology.update = () => { throw new Error('same-cell observation must not update owners'); };
  ecology.step = () => { throw new Error('observation must not step ecology'); };
  ecology.reset = () => { throw new Error('observation must not reset ecology'); };
  ecology.checkpoint = () => { throw new Error('observation must not checkpoint ecology'); };
  const camera = new THREE.PerspectiveCamera(49, aspect, .04, 160);
  camera.position.copy(vector(point)).sub(new THREE.Vector3(origin.x, 0, origin.z));
  const controls = new OrbitControls(camera); controls.minDistance = .18; controls.maxDistance = 30;
  controls.minPolarAngle = .15 * Math.PI; controls.maxPolarAngle = .55 * Math.PI;
  controls.enableDamping = true; controls.dampingFactor = .065;
  controls.target.copy(camera.position).add(new THREE.Vector3(-5, -4, -15)); controls.update();
  const sim = new KelpSimulation('42'); sim.step(.3);
  const world = Object.assign(Object.create(WorldFixture.prototype), { camera, controls, sim, isKelp: true, isDeep: false,
    surfaceY: receipt.surfaceY, oceanRenderOrigin: { ...origin }, oceanEcology: ecology,
    oceanChunks: { generator, stats: { loadedChunks: [...baseArgs.loadedChunkIds] },
      update(p) { calls.push(['chunks', p.toArray()]); assert.equal(regionOf(p), baseArgs.regionId); },
      setRenderOrigin(p) { calls.push(['chunk-origin', p]); } },
    oceanLocalWater: structuredClone(receipt.ocean.localWater), oceanEcologyCenter: baseArgs.regionId,
    oceanExploring: true, oceanObservationLayer: 'bed', oceanFreeDepthM: 3,
    oceanTravel: { x: point.x + 64, z: point.z }, oceanCruising: true, following: true,
    transition: { agentId: 'selected', position: new THREE.Vector3(), target: new THREE.Vector3() },
    followOffsetY: 2, lastFocusAssessment: { agentId: 'selected' }, keys: new Set(['KeyW']),
    selectedId: 'selected', highlight: { visible: true, position: new THREE.Vector3() },
    reefRoot: new THREE.Group(), cameraRocks: [], paused: true, speed: 12, disposed: false, oceanEcologyResetting: false,
    oceanAnimals: { setObservationAgent(id) { calls.push(['observation', id]); }, setRenderOrigin(p) { calls.push(['animal-origin', p]); } },
    onSelect(id) { calls.push(['onSelect', id]); }, emitSnapshot(force) { calls.push(['snapshot', force]); } });
  return { world, calls, publicData };
}
function actualState(world) {
  return { position: world.camera.position.toArray(), target: world.controls.target.toArray(), quaternion: world.camera.quaternion.toArray(),
    origin: { ...world.oceanRenderOrigin }, layer: world.oceanObservationLayer, freeDepth: world.oceanFreeDepthM,
    following: world.following, travel: serialized(world.oceanTravel), cruising: world.oceanCruising,
    transition: serialized(world.transition), selected: world.selectedId, highlight: world.highlight.visible,
    keys: [...world.keys], assessment: serialized(world.lastFocusAssessment), offset: world.followOffsetY,
    paused: world.paused, speed: world.speed, sim: serialized(world.sim), ecology: completeEcology(world.oceanEcology),
    public: world.oceanEcology.snapshot(), plan: world._kelpCommunityObservationPlan ?? null };
}

test('actual World switches all three free views through origin changes without altering complete native or regional records', async () => {
  for (const aspect of [767 / 871, 1280 / 720]) for (const origin of [{ x: 0, z: 0 }, { x: 128, z: 64 }, { x: -640, z: 896 }]) {
    const { world, calls, publicData } = await worldFixture(origin, aspect), native = serialized(world.sim), hidden = completeEcology(world.oceanEcology);
    assert.equal(world.focusKelpCommunity('community'), true);
    const plan = world._kelpCommunityObservationPlan;
    for (const id of ['community', 'forest', 'opening']) {
      if (id !== 'community') assert.equal(world.focusKelpCommunity(id), true);
      const stop = plan.stops.find(s => s.id === id);
      nearPoint(world.oceanWorldPosition(), stop.position, 'actual safe eye');
      nearPoint(world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z)), stop.target, 'actual target');
      assert.equal(regionOf(world.oceanWorldPosition()), baseArgs.regionId);
      assert.equal(world.oceanObservationLayer, 'free'); near(world.oceanFreeDepthM, world.surfaceY - stop.position.y);
      assert.equal(world._kelpCommunityObservationPlan, plan, 'other stops reuse the same route');
      assert.equal(world.paused, true); assert.equal(world.speed, 12); assert.equal(world.controls.enableDamping, true);
      assert.equal(world.selectedId, null); assert.equal(world.following, false); assert.equal(world.oceanCruising, false);
      assert.equal(world.oceanTravel, null); assert.equal(world.transition, null); assert.equal(world.highlight.visible, false);
      assert.equal(world.keys.size, 0); assert.equal(world.followOffsetY, 0); assert.equal(world.lastFocusAssessment, null);
      assert.deepEqual(serialized(world.sim), native); assert.deepEqual(completeEcology(world.oceanEcology), hidden);
      assert.deepEqual(world.oceanEcology.snapshot(), publicData);
    }
    assert.deepEqual(calls.filter(c => c[0] === 'observation').map(c => c[1]), [null, null, null]);
    assert.deepEqual(calls.filter(c => c[0] === 'onSelect').map(c => c[1]), [null, null, null]);
    assert.equal(world.camera.far, 160);
  }
});

test('pending actual OrbitControls damping cannot slide a group view or its target during sixty later paused frames', async () => {
  const { world } = await worldFixture(); world.controls.rotateLeft(.9); world.controls.rotateUp(.2);
  assert.equal(world.focusKelpCommunity(), true);
  const before = actualState(world);
  for (let frame = 0; frame < 60; frame++) { world.controls.update(); world.enforceCameraClearance(); }
  nearPoint(world.camera.position, { x: before.position[0], y: before.position[1], z: before.position[2] });
  nearPoint(world.controls.target, { x: before.target[0], y: before.target[1], z: before.target[2] });
  assert.deepEqual(completeEcology(world.oceanEcology), before.ecology); assert.deepEqual(serialized(world.sim), before.sim);
});

test('unready actual World, unavailable real group and failed support leave camera, selection and complete models unchanged', async () => {
  const mutations = [world => { world.isKelp = false; }, world => { world.oceanExploring = false; },
    world => { world.disposed = true; }, world => { world.oceanEcologyResetting = true; },
    world => { world.oceanChunks.stats.loadedChunks = ['1,0']; },
    world => { world.oceanEcology.snapshot = () => ({ regions: receipt.ocean.ecology.regions, agents: [] }); },
    world => { world.oceanChunks.generator = { ...world.oceanChunks.generator, floorSurface() { throw new Error('support unavailable'); } }; }];
  for (const mutate of mutations) {
    const { world, calls } = await worldFixture(); mutate(world); const before = actualState(world);
    assert.equal(world.focusKelpCommunity(), false); assert.deepEqual(actualState(world), before); assert.deepEqual(calls, []);
  }
  const { world, calls } = await worldFixture(); const before = actualState(world);
  assert.equal(world.focusKelpCommunity('invented'), false); assert.deepEqual(actualState(world), before); assert.deepEqual(calls, []);
});

test('actual UI action saves only a successful free group view and safely handles absent old-instance methods', () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('const observeKelpCommunity=stopId=>{'), end = app.indexOf('\n  const record=', start);
  assert.ok(start > 0 && end > start);
  const code = app.slice(start + 'const observeKelpCommunity='.length, end).trim().replace(/;$/, '');
  const calls = [], state = { current: { focusKelpCommunity(id) { calls.push(['group', id]); return true; },
    focusNearbyOceanAnimal() { throw new Error('whole view must not invoke individual follow'); } } };
  const handler = new Function('world', 'setToast', 'setSelected', 'setObservationId', 'setExplorationIndex', 'setView', 'rememberOcean',
    `return ${code}`)(state, value => calls.push(['toast', value]), value => calls.push(['selected', value]),
    value => calls.push(['observation', value]), value => calls.push(['exploration', value]), value => calls.push(['view', value]),
    () => calls.push(['remember']));
  handler('forest'); assert.deepEqual(calls, [['group', 'forest'], ['selected', null], ['observation', null], ['exploration', null], ['view', 'ocean'], ['remember']]);
  for (const current of [null, {}, { focusKelpCommunity: () => false }]) {
    state.current = current; calls.length = 0; assert.doesNotThrow(() => handler('community'));
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'toast');
  }
});
