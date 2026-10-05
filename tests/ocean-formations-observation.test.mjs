import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanFormationObservation } from '../src/oceanFormationObservation.js';

// Run the actual single World action and logical-position method on a CPU
// fixture. No browser/WebGL constructor, synthetic replacement action or save.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const start = source.indexOf('  focusNearbyOceanFormation(){'), end = source.indexOf('  stopOceanTravel(){', start);
const worldPosition = source.match(/  oceanWorldPosition\(\)\{[^\n]*\}/)?.[0];
assert.ok(start >= 0 && end > start && worldPosition);
const WorldFixture = new Function('THREE', 'oceanFormationObservation',
  `return class {${worldPosition}\n${source.slice(start, end)}}`)(THREE, oceanFormationObservation);
const generator = createOceanGenerator('42');
const observer = Object.freeze({ x: 259, y: -10, z: -123 });
const loaded = [];
for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) loaded.push(`${4 + dx},${-2 + dz}`);
const elements = loaded.flatMap(id => generator.chunk(...id.split(',').map(Number)).elements);
const callbacks = { floorHeight: (x, z) => generator.sample(x, z).floorY,
  safeHeight: (x, z) => generator.heightForCamera(x, z) };

function fixture({ origin = { x: 0, z: 0 }, chunks = generator, position = observer } = {}) {
  const calls = [];
  const ecologyData = { timeSec: 1756.4, resources: { algae: 4.2, detritus: 2.3 },
    agents: [{ id: 'saved-live', alive: true, position: { x: 273, y: -15, z: -92 } },
      { id: 'saved-dead', alive: false, position: { x: 274, y: -15, z: -93 } }],
    storedRegions: [{ id: '-1,-1', timeSec: 1756.4, communityVersion: null, foodLedger: [{ consumed: .02 }] }] };
  const world = Object.assign(Object.create(WorldFixture.prototype), {
    camera: { position: new THREE.Vector3(position.x - origin.x, position.y, position.z - origin.z) },
    controls: { target: new THREE.Vector3(10, -11, -20), update() { calls.push(['controls']); } },
    oceanRenderOrigin: { ...origin }, oceanExploring: true, oceanTravel: { x: 323, z: -123 },
    oceanCruising: true, following: true, transition: { agentId: 'saved-live' },
    keys: new Set(['w', 'a']), selectedId: 'saved-live', paused: true,
    oceanChunks: { generator: chunks, stats: { loadedChunks: [...loaded] },
      update(position) { calls.push(['chunks', position.x, position.y, position.z]); } },
    oceanEcology: { data: ecologyData,
      reset() { throw new Error('camera focus must not reset ecology'); },
      setEnvironment() { throw new Error('camera focus must not change ecological forcing'); } },
    sim: { metrics: { timeSec: 218.8 }, environment: { hour: 10, currentMps: .15 } },
    select(id) { this.selectedId = id; calls.push(['select', id]); },
    onSelect(id) { calls.push(['onSelect', id]); },
    requestOceanEcology(position) { calls.push(['ecology-request', position.x, position.y, position.z]); },
    emitSnapshot(force) { calls.push(['snapshot', force]); },
  });
  return { world, calls, ecologyData };
}

const stateOf = world => ({ camera: world.camera.position.toArray(), target: world.controls.target.toArray(),
  origin: { ...world.oceanRenderOrigin }, travel: structuredClone(world.oceanTravel), cruising: world.oceanCruising,
  exploring: world.oceanExploring, following: world.following, transition: structuredClone(world.transition),
  keys: [...world.keys], selectedId: world.selectedId, paused: world.paused,
  ecology: structuredClone(world.oceanEcology.data), sim: structuredClone(world.sim) });

test('real nine-cell string-seed route finds the actual channel and uses its rotation, bed and safe clearance', () => {
  const view = oceanFormationObservation(elements, observer, callbacks);
  assert.equal(loaded.length, 9);
  assert.ok(view && view.groupId === 'formation-group:1,-1' && view.count === 2 && view.distanceM <= 96);
  const members = elements.filter(element => element.groupId === view.groupId);
  assert.equal(members.length, 2);
  const rotation = members[0].rotation, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const dx = view.target.x - view.position.x, dz = view.target.z - view.position.z;
  assert.ok(Math.abs(dx * sin + dz * cos) < 1e-9, 'the viewing axis follows the real strips rather than north or camera direction');
  assert.ok(Math.abs(dx * cos - dz * sin) > 20);
  const centerX = (members[0].x + members[1].x) * .5, centerZ = (members[0].z + members[1].z) * .5;
  assert.ok(Math.abs((view.position.x - centerX) * sin + (view.position.z - centerZ) * cos) < 1e-9,
    'the entry stays between the actual neighbouring strip centres');
  assert.ok(view.position.y >= generator.sample(view.position.x, view.position.z).floorY + 3.2 - 1e-12);
  assert.ok(view.position.y >= generator.heightForCamera(view.position.x, view.position.z) + 1 - 1e-12);
  assert.equal(view.target.y, generator.sample(view.target.x, view.target.z).floorY + 1);
  assert.ok(Math.abs(view.distanceM - Math.hypot(view.position.x - observer.x, view.position.z - observer.z)) < 1e-12);
});

test('observation plans are independent of loaded-element order and leave geometry and observer unchanged', () => {
  const before = structuredClone(elements), positionBefore = { ...observer };
  const expected = oceanFormationObservation(elements, observer, callbacks);
  assert.deepEqual(oceanFormationObservation(elements.toReversed(), observer, callbacks), expected);
  const reordered = [...elements.filter(element => element.kind !== 'formation'),
    ...elements.filter(element => element.kind === 'formation').toReversed()];
  assert.deepEqual(oceanFormationObservation(reordered, observer, callbacks), expected);
  assert.deepEqual(elements, before);
  assert.deepEqual(observer, positionBefore);
});

test('empty, singleton and out-of-range groups return no plan without touching height callbacks', () => {
  const members = elements.filter(element => element.kind === 'formation');
  let calls = 0;
  const reject = { floorHeight() { calls++; throw new Error('no plan may read the floor'); },
    safeHeight() { calls++; throw new Error('no plan may read support'); } };
  assert.equal(oceanFormationObservation([], observer, reject), null);
  assert.equal(oceanFormationObservation([members[0]], observer, reject), null);
  assert.equal(oceanFormationObservation(members, { x: 1000, z: 1000 }, reject), null);
  assert.equal(oceanFormationObservation(members.map(element => ({ ...element, kind: 'rock' })), observer, reject), null);
  assert.equal(calls, 0);
});

test('actual World action applies floating-origin conversion while requesting only the new logical loading position', () => {
  const plain = fixture(), shifted = fixture({ origin: { x: 256, z: -128 } });
  const expected = oceanFormationObservation(elements, observer, callbacks);
  const saved = structuredClone(shifted.ecologyData), originalAgents = shifted.ecologyData.agents,
    originalEcology = shifted.world.oceanEcology, originalSim = structuredClone(shifted.world.sim);
  assert.equal(plain.world.focusNearbyOceanFormation(), true);
  assert.equal(shifted.world.focusNearbyOceanFormation(), true);
  assert.deepEqual(plain.world.oceanWorldPosition().toArray(), shifted.world.oceanWorldPosition().toArray());
  assert.deepEqual(shifted.world.oceanWorldPosition().toArray(), [expected.position.x, expected.position.y, expected.position.z]);
  assert.deepEqual(shifted.world.camera.position.toArray(),
    [expected.position.x - 256, expected.position.y, expected.position.z + 128]);
  assert.deepEqual(shifted.world.controls.target.toArray(),
    [expected.target.x - 256, expected.target.y, expected.target.z + 128]);
  assert.deepEqual(shifted.world.oceanRenderOrigin, { x: 256, z: -128 });
  assert.equal(shifted.world.oceanEcology, originalEcology);
  assert.equal(shifted.ecologyData.agents, originalAgents);
  assert.deepEqual(shifted.ecologyData, saved, 'living/dead agents, coordinates, clocks, resources and saved ledger remain unchanged');
  assert.deepEqual(shifted.world.sim, originalSim);
  const requested = shifted.calls.filter(call => call[0] === 'ecology-request');
  assert.deepEqual(requested, [['ecology-request', expected.position.x, expected.position.y, expected.position.z]]);
  assert.deepEqual(shifted.calls.filter(call => call[0] === 'chunks'),
    [['chunks', expected.position.x, expected.position.y, expected.position.z]]);
});

test('successful World focus stops travel, cruise, following and selection while preserving pause and exploration', () => {
  const { world, calls } = fixture();
  assert.equal(world.focusNearbyOceanFormation(), true);
  assert.equal(world.oceanTravel, null); assert.equal(world.oceanCruising, false);
  assert.equal(world.following, false); assert.equal(world.transition, null);
  assert.equal(world.selectedId, null); assert.equal(world.keys.size, 0);
  assert.equal(world.paused, true); assert.equal(world.oceanExploring, true);
  assert.deepEqual(calls.filter(call => ['select', 'onSelect', 'controls', 'snapshot'].includes(call[0])),
    [['select', null], ['onSelect', null], ['controls'], ['snapshot', true]]);
});

test('World ready guards and absent, singleton or distant geometry leave camera and all interaction state unchanged', () => {
  const members = elements.filter(element => element.kind === 'formation');
  const unavailable = fixture(); unavailable.world.oceanChunks = null;
  const outsideExploration = fixture(); outsideExploration.world.oceanExploring = false;
  const absent = fixture({ chunks: { chunk: () => ({ elements: [] }),
    sample() { throw new Error('missing group must not sample'); }, heightForCamera() { throw new Error('missing group must not query'); } } });
  const singleton = fixture({ chunks: { chunk: (cx, cz) => ({ elements: cx === 4 && cz === -2 ? [members[0]] : [] }),
    sample() { throw new Error('singleton must not sample'); }, heightForCamera() { throw new Error('singleton must not query'); } } });
  const distant = fixture({ position: { x: 1000, y: -10, z: 1000 } });
  for (const { world, calls } of [unavailable, outsideExploration, absent, singleton, distant]) {
    const before = stateOf(world);
    assert.equal(world.focusNearbyOceanFormation(), false);
    assert.deepEqual(stateOf(world), before);
    assert.equal(calls.length, 0);
  }
});
