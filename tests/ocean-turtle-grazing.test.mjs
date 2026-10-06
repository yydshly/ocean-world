import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanTurtlePlan, tickOceanTurtles, validateOceanTurtleRecord, oceanTurtlePositionValid } from '../src/oceanTurtleCommunity.js';
import { initializeOceanTurtleGrazing, tickOceanTurtleGrazing, validateOceanTurtleGrazingRecord,
  oceanTurtleGrazingContact, oceanTurtleMouthPose } from '../src/oceanTurtleGrazing.js';
import { livingShallowsMeadowGeometry } from '../src/world/livingShallowsAssets.js';

const clone = value => structuredClone(value), seed = livingShallowsSeed('42');
const generator = createLivingShallowsGenerator(seed);
const surface = (x, z) => oceanSupportHeight(generator, x, z, { avoidCoral: true });
function fixture() {
  const region = { id: '6,3', cx: 6, cz: 3, timeSec: 0, agents: [], turtleCommunityVersion: 1, turtleInitializedAtSec: 0 };
  region.turtleAgents = createOceanTurtlePlan(generator, region, { surface }).placements;
  assert.equal(region.turtleAgents.length, 1, 'real seeded grass bed supplies this actual turtle');
  return region;
}
function advance(region, consume) {
  region.timeSec = Math.round((region.timeSec + .1) * 10) / 10;
  if (!tickOceanTurtleGrazing(region, generator, { surface, stepSec: .1, consumeSeagrass: consume })) tickOceanTurtles(region, generator, { surface, stepSec: .1 });
}
let completed;
function actualRun() {
  if (completed) return completed;
  const region = fixture(); initializeOceanTurtleGrazing(region, generator, { surface });
  const phases = new Map(), bites = [];
  for (let i = 0; i < 1200; i++) {
    advance(region, (agent, id, quantity) => {
      const plant = generator.chunk(region.cx, region.cz).elements.find(p => p.id === id);
      assert.equal(oceanTurtleGrazingContact(agent, plant, generator, { ...region, surface }), true);
      bites.push({ timeSec: region.timeSec, plant, quantity, agent: clone(agent) }); return quantity;
    });
    const agent = region.turtleAgents[0];
    assert.ok(Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z) <= .22 + 1e-8);
    if (!phases.has(agent.grazing.phase)) phases.set(agent.grazing.phase, clone(region));
  }
  completed = { region, phases, bites }; return completed;
}

test('optional initializer is additive and the absent controller leaves the whole old patrol record exact', () => {
  const region = fixture(), before = clone(region);
  assert.equal(tickOceanTurtleGrazing(region, generator, { surface, stepSec: .1, consumeSeagrass: () => .0005 }), false);
  assert.deepEqual(region, before);
  assert.equal(initializeOceanTurtleGrazing(region, generator, { surface }), true);
  assert.equal(initializeOceanTurtleGrazing(region, generator, { surface }), false);
  const stripped = clone(region); delete stripped.turtleGrazingVersion; delete stripped.turtleGrazingInitializedAtSec;
  delete stripped.turtleAgents[0].grazing; assert.deepEqual(stripped, before);
  assert.equal(validateOceanTurtleRecord(region, generator, { surface }), true);
  const dead = fixture(); dead.turtleAgents[0].alive = false; dead.turtleAgents[0].state = 'dead';
  const originalDead = clone(dead.turtleAgents[0]); initializeOceanTurtleGrazing(dead, generator, { surface });
  assert.deepEqual(dead.turtleAgents[0], originalDead, 'historical dead individual receives no new controller');
});

test('one real seeded route visits every finite contact phase and preserves legal complete saved records', () => {
  const { phases, bites, region } = actualRun();
  assert.deepEqual([...phases.keys()].sort(), ['aligning', 'approaching', 'ascending', 'descending', 'grazing', 'idle', 'lifting']);
  assert.ok(bites.length > 0); assert.ok(bites[0].timeSec < 120);
  for (const row of [...phases.values(), region]) assert.equal(validateOceanTurtleRecord(row, generator, { surface }), true, row.turtleAgents[0].grazing.phase);
  for (let i = 1; i < bites.length; i++) assert.ok(bites[i].timeSec - bites[i - 1].timeSec >= 2.5 - 1e-8, 'intake is a discrete authored bite interval, not every rendered frame');
  assert.equal(region.turtleAgents[0].grazing.biteCount, bites.length);
  assert.ok(Math.abs(region.turtleAgents[0].grazing.consumedUnits - bites.reduce((sum, b) => sum + b.quantity, 0)) < 1e-10);
  const dead = clone(phases.get('grazing')), turtle = dead.turtleAgents[0];
  turtle.alive = false; turtle.state = 'dead'; const frozenDeath = clone(turtle);
  dead.timeSec = turtle.nextBreathAtSec + 200;
  assert.equal(tickOceanTurtleGrazing(dead, generator, { surface, stepSec: .1,
    consumeSeagrass: () => { assert.fail('dead frozen contact never consumes'); } }), false);
  tickOceanTurtles(dead, generator, { surface, stepSec: .1 });
  assert.deepEqual(turtle, frozenDeath, 'the complete dead grazing pose/history remain frozen beyond the old live breath deadline');
  assert.equal(validateOceanTurtleRecord(dead, generator, { surface }), true, 'a real low contact death is still a legal complete saved individual');
});

test('rigid beak meets an independently transformed actual shared mesh leaf tip rather than an empty crown edge', () => {
  const bite = actualRun().bites[0], geometry = livingShallowsMeadowGeometry();
  try {
    const p = geometry.attributes.position, r = geometry.attributes.rootXZ, index = bite.agent.grazing.leafIndex * 10 + 8;
    const plant = bite.plant, c = Math.cos(plant.rotation), s = Math.sin(plant.rotation);
    const world = (x, z) => ({ x: plant.x + x * plant.scale.x * c + z * plant.scale.z * s,
      z: plant.z - x * plant.scale.x * s + z * plant.scale.z * c });
    const ground = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, z]) => {
      const point = world(x, z); return Math.fround((generator.floorSurface(point.x, point.z).height - plant.y) / plant.scale.y);
    });
    const x = r.getX(index) + .5, z = r.getY(index) + .5;
    const y = (ground[0] * (1 - x) + ground[1] * x) * (1 - z) + (ground[2] * (1 - x) + ground[3] * x) * z;
    const leaf = { ...world(p.getX(index), p.getZ(index)), y: plant.y + (y + p.getY(index) * (1 - Math.max(0, y))) * plant.scale.y };
    const mouth = oceanTurtleMouthPose(bite.agent);
    assert.ok(Math.hypot(leaf.x - mouth.x, leaf.y - mouth.y, leaf.z - mouth.z) < 1e-7);
    const root = new THREE.Object3D(); root.rotation.set(0, -bite.agent.heading, 0); root.rotateZ(bite.agent.pitch);
    root.scale.setScalar(bite.agent.sizeM); root.position.set(...['x', 'y', 'z'].map(k => bite.agent.position[k])); root.updateMatrixWorld();
    const renderedBeak = new THREE.Vector3(.49, .018, 0).applyMatrix4(root.matrixWorld);
    assert.ok(renderedBeak.distanceTo(new THREE.Vector3(mouth.x, mouth.y, mouth.z)) < 1e-9);
    const noHardGrass = { cx: 6, cz: 3, surface, grass: [] };
    assert.equal(oceanTurtlePositionValid(generator, bite.agent.position, bite.agent.sizeM, noHardGrass), true, 'original complete nine hard-body probes remain valid at contact');
  } finally { geometry.dispose(); }
});

test('saved forged grass, ghost leaf, arbitrary mouth position and inconsistent consumption counter reject', () => {
  const baseline = clone(actualRun().phases.get('grazing'));
  assert.equal(validateOceanTurtleRecord(baseline, generator, { surface }), true);
  for (const mutate of [a => { a.grazing.leafIndex = 96; }, a => { a.grazing.sourceGrassId = 'ghost:grass'; },
    a => { a.grazing.contactPosition.y += .03; }, a => { a.position.x += .02; }, a => { a.heading += Math.PI; },
    a => { a.grazing.version = 99; }]) {
    const bad = clone(baseline); mutate(bad.turtleAgents[0]);
    assert.equal(validateOceanTurtleRecord(bad, generator, { surface }), false);
  }
  const withCounter = clone(baseline); withCounter.turtleOrganicVersion = 1;
  withCounter.turtleOrganic = { counters: { seagrassGrazedUnits: withCounter.turtleAgents[0].grazing.consumedUnits } };
  assert.equal(validateOceanTurtleGrazingRecord(withCounter, generator, { surface }), true);
  withCounter.turtleOrganic.counters.seagrassGrazedUnits += .0001;
  assert.equal(validateOceanTurtleRecord(withCounter, generator, { surface }), false);
  const bite = actualRun().bites[0], forged = { ...bite.plant, x: bite.plant.x + .01 };
  assert.equal(oceanTurtleGrazingContact(bite.agent, forged, generator, { cx: 6, cz: 3, surface }), false);
});

test('zero actual stock debit ends the bout without inventing a bite or consumption', () => {
  const region = clone(actualRun().phases.get('grazing')), agent = region.turtleAgents[0];
  const before = { count: agent.grazing.biteCount, consumed: agent.grazing.consumedUnits, last: agent.grazing.lastConsumedAtSec };
  let called = 0;
  for (let i = 0; i < 8 && !called; i++) advance(region, () => { called++; return 0; });
  assert.equal(called, 1); assert.equal(agent.grazing.phase, 'ascending');
  assert.equal(agent.grazing.biteCount, before.count); assert.equal(agent.grazing.consumedUnits, before.consumed); assert.equal(agent.grazing.lastConsumedAtSec, before.last);
  assert.equal(validateOceanTurtleRecord(region, generator, { surface }), true);
});

test('breathing deadline cancels feeding immediately and ascends to old clearance before the native surface column', () => {
  const region = clone(actualRun().phases.get('grazing')), agent = region.turtleAgents[0];
  agent.nextBreathAtSec = region.timeSec + .1;
  let calls = 0, sawLowExit = false, reachedSurfaceColumn = false;
  for (let i = 0; i < 100 && !reachedSurfaceColumn; i++) {
    const beforeY = agent.position.y;
    advance(region, () => { calls++; return .0005; });
    assert.equal(calls, 0);
    if (agent.grazing.phase === 'ascending') {
      sawLowExit = true; assert.ok(agent.position.y >= beforeY - 1e-9);
      assert.equal(agent.state, 'seagrass-cruising');
    }
    if (agent.state === 'surfacing') {
      reachedSurfaceColumn = true; assert.equal(agent.grazing.phase, 'idle');
      assert.equal(oceanTurtlePositionValid(generator, agent.diveTarget, agent.sizeM, { cx: 6, cz: 3, surface }), true);
    }
    assert.equal(validateOceanTurtleRecord(region, generator, { surface }), true);
  }
  assert.equal(sawLowExit, true); assert.equal(reachedSurfaceColumn, true);
});
