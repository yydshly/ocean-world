import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpSimulation, kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { KELP_ANCHORS, kelpLeafNormal, habitatNormal, leafAttachmentPosition } from '../src/kelpHabitat.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from '../src/world/kelpOrganisms.js';
import { kelpAnimationInRange } from '../src/world/kelpAnimationVisibility.js';

const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function shippedMethod(name) {
  const start = source.indexOf(`  ${name}(`); assert.ok(start >= 0, `World.${name} exists`);
  const next = /\n  [A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const unsupported = () => { throw new Error('Unexpected non-kelp renderer path'); };
const World = new Function('THREE', 'clamp', 'kelpAnimationInRange', 'animateKelpOrganism', 'kelpLeafNormal',
  'kelpHabitatNormal', 'animateDeepOrganism', 'animateOrganism',
  `return class { ${shippedMethod('updateOrganism')} }`)(THREE, THREE.MathUtils.clamp, kelpAnimationInRange,
  animateKelpOrganism, kelpLeafNormal, habitatNormal, unsupported, unsupported);

const giant = kelpSpeciesCatalog.find(species => species.id === 'giant-kelp');
const point = value => new THREE.Vector3(value.x, value.y, value.z);
function fingerprint(root) {
  const hash = createHash('sha256');
  root.traverse(child => {
    if (!child.isMesh) return;
    for (const name of ['position', 'normal', 'uv']) {
      const array = child.geometry.attributes[name]?.array;
      if (array) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    const array = child.instanceMatrix?.array;
    if (array) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  });
  hash.update(JSON.stringify({ position: root.position.toArray(), scale: root.scale.toArray(), quaternion: root.quaternion.toArray() }));
  return hash.digest('hex');
}
function versions(root) {
  const { stem, blades, bulbs } = root.userData.motion;
  return [stem.geometry.attributes.position.version, stem.geometry.attributes.normal.version,
    blades.geometry.attributes.position.version, blades.geometry.attributes.normal.version, bulbs.instanceMatrix.version];
}
function modelState(sim) {
  return structuredClone({ timeSec: sim.timeSec, ticks: sim._ticks, rng: sim._rngState, accumulator: sim._accumulator,
    agents: sim.agents, environment: sim.environment, ledger: sim.ledger, events: sim.events,
    kelpPatches: sim.kelpPatches, leafPatches: sim.leafPatches, groundPatches: sim.groundPatches, preyPatches: sim.preyPatches });
}
function fixture(t, { origin = { x: 0, z: 0 }, logicalCamera = { x: 400, y: 3, z: 0 } } = {}) {
  const sim = new KelpSimulation('42'), agent = sim.agents.find(candidate => candidate.speciesId === 'giant-kelp');
  const object = createKelpOrganism(giant, { anchor: sim.getKelpAnchor(agent.id) }); t.after(() => disposeKelpOrganism(object));
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 160);
  camera.position.set(logicalCamera.x - origin.x, logicalCamera.y, logicalCamera.z - origin.z);
  const world = Object.assign(new World(), { sim, camera, oceanRenderOrigin: { ...origin }, oceanChunks: {},
    transition: null, following: false, isKelp: true, isDeep: false });
  return { world, sim, agent, object, entity: { kind: 'kelp', object } };
}

test('the whole plant sphere and camera-step margin use full XYZ distance at the real far-plane boundary', () => {
  const anchor = { x: 30, y: -4, z: -20, lengthM: 11 }, radius = 11 + .8 + 3, far = 160;
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(kelpAnimationInRange(anchor, { ...anchor, [axis]: anchor[axis] + far + radius }, far), true);
    assert.equal(kelpAnimationInRange(anchor, { ...anchor, [axis]: anchor[axis] + far + radius + 1e-5 }, far), false);
  }
  const component = (far + radius) / Math.sqrt(3);
  assert.equal(kelpAnimationInRange(anchor, { x: anchor.x + component * 1.001, y: anchor.y + component * 1.001,
    z: anchor.z + component * 1.001 }, far), false, 'diagonal distance cannot use independent axis limits');
  assert.equal(kelpAnimationInRange(anchor, { x: anchor.x + far + 11 + .8 + 2.88, y: anchor.y, z: anchor.z }, far), true,
    'the maximum ordinary 24 m/s × .12 s move is covered');
});

test('unknown or invalid dimensions retain animation instead of accidentally culling a plant', () => {
  const anchor = { x: 0, y: 0, z: 0, lengthM: 11 }, camera = { x: 400, y: 0, z: 0 };
  for (const invalid of [null, {}, { ...anchor, x: NaN }, { ...anchor, lengthM: 0 }, { ...anchor, lengthM: -1 }, { ...anchor, z: Infinity }]) {
    assert.equal(kelpAnimationInRange(invalid, camera, 160), true);
  }
  for (const invalid of [null, {}, { ...camera, y: NaN }, { ...camera, z: Infinity }]) assert.equal(kelpAnimationInRange(anchor, invalid, 160), true);
  for (const invalid of [0, -1, NaN, Infinity, undefined]) assert.equal(kelpAnimationInRange(anchor, camera, invalid), true);
});

test('all actual kelp mesh and instanced-bulb vertices fit length plus .8 m at multiple clocks and the maximum deformation flow', t => {
  const instance = new THREE.Matrix4(), vertex = new THREE.Vector3(); let verticesChecked = 0;
  for (const anchor of KELP_ANCHORS) {
    const object = createKelpOrganism(giant, { anchor }); t.after(() => disposeKelpOrganism(object));
    for (const timeSec of [0, 13.7, 187.3]) for (const flow of [0, .18, 1.2]) {
      animateKelpOrganism(object, timeSec, { currentMps: flow, deformationCurrentMps: flow }, anchor);
      object.updateMatrixWorld(true);
      const origin = point(anchor), allowed = anchor.lengthM + .8;
      object.traverse(child => {
        if (!child.isMesh) return;
        const attribute = child.geometry.attributes.position;
        for (let slot = 0; slot < (child.isInstancedMesh ? child.count : 1); slot++) {
          if (child.isInstancedMesh) child.getMatrixAt(slot, instance);
          for (let index = 0; index < attribute.count; index++) {
            vertex.fromBufferAttribute(attribute, index);
            if (child.isInstancedMesh) vertex.applyMatrix4(instance);
            vertex.applyMatrix4(child.matrixWorld); verticesChecked++;
            assert.ok(vertex.distanceTo(origin) <= allowed + 1e-5,
              `${anchor.id} clock ${timeSec} flow ${flow} vertex ${index} escaped the conservative sphere`);
          }
        }
      });
    }
  }
  assert.ok(verticesChecked > 1_000_000, 'the independent check traverses rendered vertices rather than restating analytic bounds');
});

test('the shipped World skips far geometry only, then restores the exact current-clock shape without altering model output', t => {
  const { world, sim, agent, object, entity } = fixture(t), beforeShape = fingerprint(object), beforeVersions = versions(object);
  for (let tick = 0; tick < 10; tick++) {
    sim.step(.1); const before = modelState(sim), anchor = structuredClone(sim.getKelpAnchor(agent.id));
    world.updateOrganism(agent, entity, sim.metrics);
    assert.deepEqual(modelState(sim), before); assert.deepEqual(sim.getKelpAnchor(agent.id), anchor);
  }
  assert.equal(fingerprint(object), beforeShape); assert.deepEqual(versions(object), beforeVersions);
  assert.equal(object.userData.motion.lastGeometry.timeSec, 0);
  assert.equal(object.visible, true, 'the conservative far guard does not hide an alive model');
  const anchor = sim.getKelpAnchor(agent.id), expected = createKelpOrganism(giant, { anchor }); t.after(() => disposeKelpOrganism(expected));
  animateKelpOrganism(expected, sim.metrics.timeSec, sim.environment, anchor);
  world.camera.position.set(anchor.x, anchor.y + 3, anchor.z);
  const before = modelState(sim); world.updateOrganism(agent, entity, sim.metrics);
  assert.equal(fingerprint(object), fingerprint(expected)); assert.equal(object.userData.motion.lastGeometry.timeSec, sim.metrics.timeSec);
  assert.deepEqual(modelState(sim), before, 'revealing is a rendering operation with no ecological tick or refill');
  assert.notEqual(fingerprint(object), beforeShape);
});

test('floating origin cannot turn a geographically distant authored kelp into a near-camera update', t => {
  const { world, sim, agent, object, entity } = fixture(t, { origin: { x: 384, z: -128 }, logicalCamera: { x: 400, y: 3, z: 0 } });
  const before = versions(object); sim.step(.1); world.updateOrganism(agent, entity, sim.metrics);
  assert.deepEqual(versions(object), before, 'local camera x=16 must still be far from the authored world anchor');
  const anchor = sim.getKelpAnchor(agent.id);
  world.camera.position.set(anchor.x - world.oceanRenderOrigin.x, anchor.y + 1, anchor.z - world.oceanRenderOrigin.z);
  world.updateOrganism(agent, entity, sim.metrics);
  assert.equal(object.userData.motion.lastGeometry.timeSec, sim.metrics.timeSec);
  assert.deepEqual(object.position.toArray(), [anchor.x, anchor.y, anchor.z]);
});

test('transition, animal following and scenes without streamed chunks bypass far animation culling', t => {
  for (const mode of ['transition', 'following', 'authored-only']) {
    const { world, sim, agent, object, entity } = fixture(t); sim.step(.1);
    if (mode === 'transition') world.transition = { position: new THREE.Vector3(0, 0, 0) };
    if (mode === 'following') world.following = true;
    if (mode === 'authored-only') world.oceanChunks = null;
    const before = versions(object), state = modelState(sim); world.updateOrganism(agent, entity, sim.metrics);
    assert.equal(object.userData.motion.lastGeometry.timeSec, sim.metrics.timeSec, mode);
    assert.ok(versions(object)[0] > before[0], `${mode} performs the real animation`);
    assert.deepEqual(modelState(sim), state);
  }
});

test('attached snails continue using the exact current-clock leaf support while the distant host geometry is skipped', t => {
  const { world, sim, agent, object, entity } = fixture(t);
  const snail = sim.agents.find(candidate => candidate.attachment?.hostId === agent.id); assert.ok(snail);
  const species = kelpSpeciesCatalog.find(candidate => candidate.id === snail.speciesId), snailObject = createKelpOrganism(species);
  t.after(() => disposeKelpOrganism(snailObject));
  sim.step(1); world.updateOrganism(agent, entity, sim.metrics); assert.equal(object.userData.motion.lastGeometry.timeSec, 0);
  const before = modelState(sim); world.updateOrganism(snail, { kind: 'snail', object: snailObject }, sim.metrics);
  assert.deepEqual(modelState(sim), before);
  const anchor = sim.getKelpAnchor(snail.attachment.hostId), expectedPosition = leafAttachmentPosition(anchor, snail.attachment, sim.metrics.timeSec, sim.environment);
  assert.ok(snailObject.position.distanceTo(point(expectedPosition)) < 1e-10);
  const expectedNormal = point(kelpLeafNormal(anchor, snail.attachment.leafIndex, snail.attachment.along,
    sim.metrics.timeSec, sim.environment, snail.attachment.frondIndex ?? 0)).normalize();
  const actualNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(snailObject.quaternion);
  assert.ok(actualNormal.distanceTo(expectedNormal) < 1e-10, 'the shared analytic normal still governs the attached animal');
});
