import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanAnimalEncounters, sampleOceanAnimalEncounter } from '../src/world/oceanAnimalEncounters.js';

const frame = { position: { x: 14592, y: -5, z: 320 }, target: { x: 14602, y: -6, z: 320 }, elapsedSec: 0 };
const owner = '228,5', activeOwnerIds = [owner];
const animal = (id, dx = 7, dz = 2, extra = {}) => ({ id, alive: true, regionId: owner, speciesId: 'green-chromis',
  position: { x: frame.position.x + dx, y: -5.5, z: frame.position.z + dz }, sizeM: .12, state: 'schooling', habitat: 'water-column', ...extra });
const options = agents => ({ position: frame.position, routeTarget: frame.target, agents, activeOwnerIds });
const magnitude = p => Math.hypot(p.x, p.y, p.z);
const vector = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (magnitude(a) * magnitude(b))))) * 180 / Math.PI;

test('current alive local school is selected without changing organisms or the safe path', () => {
  const agents = [animal('school-a', 7, 2, { groupId: 'real-school' }), animal('school-b', 7.5, 2.5, { groupId: 'real-school' }),
    animal('solo', 8, 0, { sizeM: .65, state: 'foraging' })];
  const before = structuredClone(agents), result = sampleOceanAnimalEncounter(options(agents));
  assert.deepEqual(agents, before); assert.deepEqual(result.ids.sort(), ['school-a', 'school-b']); assert.equal(result.groupId, 'real-school');
  assert.equal(result.category, 'water-column'); assert.ok(result.stats.maxDistanceM <= 8);
  assert.ok(angle(vector(result.desiredTarget, frame.position), vector(frame.target, frame.position)) <= 18.001);
});

test('dead, nonresident, behind, too far and failed clearance records cannot attract the camera', () => {
  const agents = [animal('dead', 6, 0, { alive: false }), animal('dead-state', 6, 0, { state: 'dead' }),
    animal('offscreen-owner', 6, 0, { regionId: '235,5' }), animal('behind', -5, 0), animal('far', 22, 0), animal('side', 1, 7)];
  const result = sampleOceanAnimalEncounter(options(agents)); assert.deepEqual(result.ids, []); assert.deepEqual(result.desiredTarget, frame.target);
  for (const callback of [() => false, () => undefined, () => { throw Error('unavailable'); }])
    assert.deepEqual(sampleOceanAnimalEncounter({ ...options([animal('blocked')]), candidateClearance: callback }).ids, []);
  let called; const actual = sampleOceanAnimalEncounter({ ...options([animal('native')]), candidateClearance: (from, to, a) => { called = { from, to, id: a.id }; return true; } });
  assert.deepEqual(called.from, frame.position); assert.equal(called.to.x, 14599); assert.deepEqual(actual.ids, ['native']);
});

test('large animals and nearby small grass-edge animals remain eligible within natural local range', () => {
  const turtle = animal('turtle', 12, 1, { sizeM: 1.4, speciesId: 'green-turtle', habitat: 'seagrass-water-column', state: 'grazing' });
  const result = sampleOceanAnimalEncounter(options([turtle])); assert.deepEqual(result.ids, ['turtle']); assert.equal(result.category, 'grass-edge');
  const seahorse = animal('seahorse', 3, 1, { sizeM: .09, speciesId: 'sand-edge-seahorse', habitat: 'meadow-life-tail-holding', state: 'tail-holding' });
  assert.deepEqual(sampleOceanAnimalEncounter(options([seahorse])).ids, ['seahorse']);
  assert.deepEqual(sampleOceanAnimalEncounter({ ...options([turtle]), visibilityM: 8 }).ids, []);
});

test('start heading, finite damping and floating-origin translation preserve the original route position', () => {
  const agents = [animal('a')], helper = new OceanAnimalEncounters(), before = structuredClone(frame);
  for (const t of [0, 3, 6]) assert.deepEqual(helper.update({ frame, agents, activeOwnerIds, elapsedSec: t }).target, frame.target);
  let last; for (let t = 6.1; t < 9; t += .1) last = helper.update({ frame, agents, activeOwnerIds, elapsedSec: t });
  assert.deepEqual(frame, before); assert.deepEqual(last.position, frame.position); assert.ok(last.target.z > frame.target.z);
  assert.ok(angle(vector(last.target, last.position), vector(frame.target, frame.position)) < 18.001);
  const origin = { x: 14592, z: 320 }, localFrame = { ...frame, position: { ...frame.position, x: 0, z: 0 }, target: { ...frame.target, x: 10, z: 0 } };
  const localAgents = agents.map(a => ({ ...a, position: { ...a.position, x: a.position.x - origin.x, z: a.position.z - origin.z } }));
  const local = sampleOceanAnimalEncounter({ position: localFrame.position, routeTarget: localFrame.target, agents: localAgents, activeOwnerIds });
  const world = sampleOceanAnimalEncounter(options(agents));
  assert.ok(Math.abs(world.desiredTarget.x - origin.x - local.desiredTarget.x) < 1e-10);
  assert.ok(Math.abs(world.desiredTarget.z - origin.z - local.desiredTarget.z) < 1e-10);
});

test('death and unload clear IDs immediately; pause and absent ecology release all look ownership', () => {
  for (const kind of ['death', 'unload', 'pause', 'ecology']) {
    const helper = new OceanAnimalEncounters(), a = animal('a');
    helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 7 });
    const before = helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 8 }); assert.ok(before.target.z > frame.target.z);
    const result = helper.update({ frame, agents: kind === 'death' ? [{ ...a, alive: false }] : [a],
      activeOwnerIds: kind === 'unload' ? [] : activeOwnerIds, elapsedSec: 8.1, paused: kind === 'pause', ecologyAvailable: kind !== 'ecology' });
    if (kind === 'death' || kind === 'unload') {
      assert.ok(result.target.z - frame.target.z < before.target.z - frame.target.z, kind);
      assert.ok(result.target.z >= frame.target.z, kind);
    } else assert.deepEqual(result.target, frame.target, kind);
    assert.deepEqual(result.encounter.ids, [], kind); assert.deepEqual(helper.stats().ids, []);
  }
});

test('observing a resident is time bounded rather than forced perpetual single-animal pursuit', () => {
  const helper = new OceanAnimalEncounters(), a = animal('a');
  for (const t of [7, 8, 10, 11.9]) assert.deepEqual(helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: t }).encounter.ids, ['a']);
  assert.deepEqual(helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 12 }).encounter.ids, []);
  assert.deepEqual(helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 13 }).encounter.ids, []);
  helper.reset(); assert.deepEqual(helper.stats().ids, []);
});

test('normal observation completion returns smoothly to the path during its two second release', () => {
  const helper = new OceanAnimalEncounters(), a = animal('a'); let prior;
  for (let i = 0; i <= 99; i++) prior = helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 7 + i * .05 });
  const release = helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 12 });
  assert.deepEqual(release.encounter.ids, []); assert.ok(release.target.z > frame.target.z);
  assert.ok(release.target.z < prior.target.z); assert.ok(release.target.z > prior.target.z - .3);
  const later = helper.update({ frame, agents: [a], activeOwnerIds, elapsedSec: 13 });
  assert.deepEqual(later.encounter.ids, []); assert.ok(later.target.z > frame.target.z); assert.ok(later.target.z < release.target.z);
});

test('a real school look admits later local members without switching to another school or restarting its clock', () => {
  const helper = new OceanAnimalEncounters(), agents = [animal('one', 7, 1, { groupId: 'resident-school' }),
    animal('two', 9, 1, { groupId: 'resident-school' }), animal('three', 10, 1, { groupId: 'resident-school' })];
  const first = helper.update({ frame, agents, activeOwnerIds, elapsedSec: 7 });
  assert.deepEqual(first.encounter.ids, ['one']); assert.equal(first.encounter.groupId, 'resident-school');
  agents[1].position.x = frame.position.x + 7.2; agents[2].position.x = frame.position.x + 7.4;
  agents.push(...['other-a', 'other-b', 'other-c'].map(id => animal(id, 6, .5, { groupId: 'different-school' })));
  const before = structuredClone(agents), next = helper.update({ frame, agents, activeOwnerIds, elapsedSec: 7.1 });
  assert.deepEqual(next.encounter.ids.sort(), ['one', 'three', 'two']); assert.equal(next.encounter.groupId, 'resident-school');
  assert.deepEqual(agents, before); assert.deepEqual(next.position, frame.position);
  // The expanded resident group still releases five seconds after the first
  // look rather than extending dwell time as each new member enters range.
  const released = helper.update({ frame, agents: agents.slice(0, 3), activeOwnerIds, elapsedSec: 12 });
  assert.deepEqual(released.encounter.ids, []);
});
