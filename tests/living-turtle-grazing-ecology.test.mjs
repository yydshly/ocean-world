import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingNetworkBalance, recordLivingDeath, tickLivingNetwork, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { oceanTurtleMouthPose } from '../src/oceanTurtleGrazing.js';
import { livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';

const SEED = livingShallowsSeed('42'), AT = { x: 448, z: 240 }, AWAY = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, message ?? `${a} != ${b}`);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class MemoryStore {
  available = true; records = new Map(); batches = []; beforeMany = null; failRead = false;
  async load(world, id) {
    if (this.failRead) throw new Error('saved turtle read rejected');
    return clone(this.records.get(`${world}|${id}`) ?? null);
  }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    const pending = clone(entries); this.batches.push(pending);
    const result = await this.beforeMany?.(pending); if (result === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of pending) next.set(`${world}|${id}`, row);
    this.records = next;
  }
}
function model(store = new MemoryStore(), grazing = false) {
  return new OceanEcology(SEED, createOceanGenerator(SEED), { store, turtles: true, turtleGrazing: grazing });
}
async function oldWindow({ history = true } = {}) {
  const store = new MemoryStore(), old = model(store);
  assert.notEqual(await old.update(AT), false); assert.equal(old._active.size, 9);
  assert.ok(old._active.get('6,2').turtleAgents.length === 1);
  assert.ok(old._active.get('6,3').turtleAgents.length === 1, 'actual seeded grass bed supplies the live turtle');
  if (history) {
    old.step(.4, { currentMps: .15, foodSupply: 0, hour: 12 });
    for (const region of old._active.values()) {
      region.opaqueExtension = { notes: ['keep', region.id] };
      for (const agent of [...region.agents, ...region.turtleAgents]) agent.opaqueExtension = { historical: region.id };
    }
    const owner = old._active.get('6,2'), dead = owner.turtleAgents[0];
    dead.alive = false; dead.state = 'dead'; dead.velocity = { x: 0, y: 0, z: 0 };
    const nativeOwner = [...old._active.values()].find(row => row.agents.some(agent => agent.alive));
    const native = nativeOwner.agents.find(agent => agent.alive);
    native.alive = false; native.state = 'dead'; native.energy = 0; native.velocity = { x: 0, y: 0, z: 0 };
    recordLivingDeath(nativeOwner, native); nativeOwner.counters.deaths++;
  }
  await old.checkpoint(); store.batches.length = 0;
  return { old, store, before: records(old) };
}
function preservesOld(row, before) {
  const stripped = clone(row), initialInput = row.turtleOrganic?.initialInputUnits ?? 0;
  for (const key of ['turtleOrganicVersion', 'turtleOrganicInitializedAtSec', 'turtleOrganic',
    'turtleGrazingVersion', 'turtleGrazingInitializedAtSec']) delete stripped[key];
  for (const turtle of stripped.turtleAgents) for (const key of ['organicUnits', 'organicDeathRecorded', 'grazing']) delete turtle[key];
  close(stripped.basicNetwork.ledger.externalInput - before.basicNetwork.ledger.externalInput, initialInput);
  close(stripped.basicNetwork.processTotals.externalInput - before.basicNetwork.processTotals.externalInput, initialInput);
  stripped.basicNetwork.ledger.externalInput = before.basicNetwork.ledger.externalInput;
  stripped.basicNetwork.processTotals.externalInput = before.basicNetwork.processTotals.externalInput;
  assert.deepEqual(stripped, before, 'all old individuals, positions, deaths, clocks, resources and opaque state stay exact');
}
function staticLeafDistance(generator, geometry, plant, mouth) {
  const transform = new THREE.Object3D();
  transform.position.set(plant.x, plant.y, plant.z); transform.rotation.set(0, plant.rotation, 0);
  transform.scale.set(plant.scale.x, plant.scale.y, plant.scale.z); transform.updateMatrix();
  const vertices = geometry.attributes.position, roots = geometry.attributes.rootXZ, indices = geometry.index;
  const c = Math.cos(plant.rotation), s = Math.sin(plant.rotation);
  const corners = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, z]) => Math.fround((generator.floorSurface(
    plant.x + x * plant.scale.x * c + z * plant.scale.z * s,
    plant.z - x * plant.scale.x * s + z * plant.scale.z * c).height - plant.y) / plant.scale.y));
  const vertex = (target, index) => {
    const x = roots.getX(index) + .5, z = roots.getY(index) + .5;
    const ground = (corners[0] * (1 - x) + corners[1] * x) * (1 - z) +
      (corners[2] * (1 - x) + corners[3] * x) * z;
    return target.set(vertices.getX(index), ground + vertices.getY(index) * (1 - Math.max(0, ground)), vertices.getZ(index))
      .applyMatrix4(transform.matrix);
  };
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3(), point = new THREE.Vector3(mouth.x, mouth.y, mouth.z);
  let minimum = Infinity;
  for (let index = 0; index < indices.count; index += 3) {
    vertex(triangle.a, indices.getX(index));
    vertex(triangle.b, indices.getX(index + 1));
    vertex(triangle.c, indices.getX(index + 2));
    if (triangle.getArea() <= 1e-12) continue;
    triangle.closestPointToPoint(point, closest); minimum = Math.min(minimum, closest.distanceTo(point));
  }
  return minimum;
}

test('default-disabled grazing preserves complete saved old turtle and native future state', async () => {
  const f = await oldWindow({ history: false }), current = model(f.store);
  await current.update(AT); assert.deepEqual(records(current), f.before);
  for (const dt of [.1, .3, .2]) {
    current.step(dt, { currentMps: .15, foodSupply: 0, hour: 12 });
    f.old.step(dt, { currentMps: .15, foodSupply: 0, hour: 12 });
  }
  assert.deepEqual(records(current), records(f.old));
  assert.ok(records(current).every(row => row.turtleGrazingVersion === undefined && row.turtleOrganicVersion === undefined));
});

test('organic boundary and grazing fields become public only after an atomic successful save and preserve full old history', async () => {
  const f = await oldWindow(), gate = deferred(), offered = deferred(); let waiting = false;
  f.store.beforeMany = async entries => {
    if (!waiting && entries.some(([, row]) => row.turtleGrazingVersion === 1)) {
      waiting = true; offered.resolve(clone(entries)); await gate.promise;
    }
  };
  const current = model(f.store, true), pending = current.update(AT), entries = await offered.promise;
  for (const [id, row] of entries) {
    assert.equal(current._active.has(id), false);
    assert.equal(f.store.records.get(`${current._world}|${id}`).turtleGrazingVersion, undefined);
    preservesOld(row, f.before.find(old => old.id === id));
  }
  gate.resolve(); assert.notEqual(await pending, false);
  for (const row of records(current)) {
    preservesOld(row, f.before.find(old => old.id === row.id));
    assert.deepEqual(f.store.records.get(`${current._world}|${row.id}`), row);
    assert.ok(validateLivingNetworkRecord(row)); close(livingNetworkBalance(row), 0);
  }
  const dead = current._active.get('6,2').turtleAgents[0], live = current._active.get('6,3').turtleAgents[0];
  assert.equal(dead.organicUnits, 0); assert.equal(dead.organicDeathRecorded, true); assert.equal(dead.grazing, undefined);
  assert.equal(live.organicUnits, .004); assert.ok(live.grazing); assert.equal(live.grazing.biteCount, 0);
});

test('read failure and null or throwing atomic saves never publish partial compatibility fields or replace old disk history', async () => {
  for (const failure of ['read', 'null', 'throw']) {
    const f = await oldWindow(), disk = clone([...f.store.records]), current = model(f.store, true);
    if (failure === 'read') f.store.failRead = true;
    else f.store.beforeMany = async () => {
      if (failure === 'throw') throw new Error('atomic turtle grazing admission rejected');
      return null;
    };
    assert.equal(await current.update(AT), false);
    assert.deepEqual([...f.store.records], disk);
    assert.ok(records(current).every(row => row.turtleGrazingVersion === undefined && row.turtleOrganicVersion === undefined));
    f.store.failRead = false; f.store.beforeMany = null;
    assert.notEqual(await current.update(AT), false);
    assert.ok(current._active.get('6,3').turtleAgents[0].grazing);
    assert.ok(records(current).every(validateLivingNetworkRecord));
  }
});

test('unload, revisit and cold refresh retain complete grazing history without repeating initial input or refilling dead turtles', async () => {
  const f = await oldWindow(), current = model(f.store, true); await current.update(AT);
  current.step(.3, { currentMps: .15, foodSupply: 0, hour: 12 });
  const expected = records(current), ids = expected.map(row => row.id);
  await current.update(AWAY); assert.ok(ids.every(id => !current._active.has(id)));
  current.step(.2); await current.update(AT); assert.deepEqual(records(current), expected);
  await current.checkpoint(); f.store.batches.length = 0;
  const restored = model(f.store, true); await restored.update(AT);
  assert.deepEqual(records(restored), expected); assert.equal(f.store.batches.length, 0);
  const dead = restored._active.get('6,2').turtleAgents;
  assert.equal(dead.length, 1); assert.equal(dead[0].alive, false); assert.equal(dead[0].organicUnits, 0);
  const frozen = records(restored); restored.step(0); assert.deepEqual(records(restored), frozen);
});

test('partial saved organic or grazing records reject without repairing or regenerating the original turtle', async () => {
  const f = await oldWindow(), current = model(f.store, true); await current.update(AT); await current.checkpoint();
  const baseline = clone([...f.store.records]), key = `${current._world}|6,3`;
  for (const mutate of [row => { delete row.turtleGrazingVersion; }, row => { delete row.turtleAgents[0].organicUnits; },
    row => { row.turtleAgents[0].grazing.consumedUnits = -1; }]) {
    const store = new MemoryStore(); store.records = new Map(clone(baseline)); mutate(store.records.get(key));
    const disk = clone([...store.records]), restored = model(store, true);
    await assert.rejects(restored.update(AT), /Invalid saved.*(turtle|grazing|living-shallows)/i);
    assert.equal(restored._active.has('6,3'), false); assert.deepEqual([...store.records], disk);
  }
});

test('ordinary seeded turtle grazing reaches the existing static leaf mesh, consumes plant stock and conserves the ecosystem', async t => {
  const kit = livingShallowsAssetGeometries();
  t.after(() => Object.values(kit).forEach(geometry => geometry.dispose()));
  const f = await oldWindow({ history: false }), current = model(f.store, true); await current.update(AT);
  const observed = new Map(), contacts = [];
  for (let index = 0; index < 1200 && !contacts.length; index++) {
    const controls = new Map([...current._active.values()].filter(row => row.turtleAgents.length)
      .map(row => [row.id, clone(row)]));
    const before = records(current).flatMap(row => row.turtleAgents).map(turtle => ({ id: turtle.id,
      position: clone(turtle.position), organic: turtle.organicUnits, consumed: turtle.grazing?.consumedUnits ?? 0 }));
    current.step(.1, { currentMps: .15, foodSupply: 0, hour: 12 });
    for (const row of current._active.values()) for (const turtle of row.turtleAgents) {
      const previous = before.find(agent => agent.id === turtle.id);
      const moved = Math.hypot(turtle.position.x - previous.position.x, turtle.position.y - previous.position.y, turtle.position.z - previous.position.z);
      assert.ok(moved <= .022 + 1e-8, 'normal whole-body movement stays within .22 m/s');
      observed.set(turtle.id, turtle.grazing?.phase);
      if ((turtle.grazing?.consumedUnits ?? 0) > previous.consumed) {
        const grass = current.generator.chunk(row.cx, row.cz).elements.find(element => element.id === turtle.grazing.sourceGrassId);
        assert.ok(grass?.kind === 'seagrass', 'intake references a real existing descriptor');
        assert.deepEqual(turtle.position, turtle.grazing.contactPosition);
        const leafDistance = staticLeafDistance(current.generator, kit.seagrass, grass, oceanTurtleMouthPose(turtle));
        assert.ok(leafDistance < 1e-5,
          'fixed beak meets a shared static leaf triangle with renderer root grounding; current shader bending stays a separate approximation');
        assert.ok(row.events.some(event => event.agentId === turtle.id && /海草|摄食/.test(event.title)));
        assert.ok(row.turtleOrganic.counters.seagrassGrazedUnits > 0); assert.ok(turtle.organicUnits > previous.organic);
        const control = controls.get(row.id);
        tickLivingNetwork(control, current._regionEnvironment(control), .1);
        close(row.basicNetwork.plantOrganicUnits, control.basicNetwork.plantOrganicUnits -
          (turtle.grazing.consumedUnits - previous.consumed), 'actual production/litter plus exact grazing debit');
        contacts.push({ id: turtle.id, owner: row.id, firstBiteAtSec: row.timeSec, plantId: grass.id,
          leafIndex: turtle.grazing.leafIndex, biteCount: turtle.grazing.biteCount,
          consumedUnits: turtle.grazing.consumedUnits, nearestStaticGroundedLeafDistanceM: leafDistance,
          phase: turtle.grazing.phase });
      }
    }
  }
  assert.ok(contacts.length > 0, `finite ordinary route reaches a real grazing contact; phases ${JSON.stringify([...observed])}`);
  assert.ok(records(current).every(validateLivingNetworkRecord));
  close(current.snapshot().ecosystem.balanceError, 0); close(current.snapshot().metrics.balanceError, 0);
  assert.ok(current.snapshot().ecosystem.turtleGrazing.seagrassGrazedUnits > 0);
  const frozen = records(current); current.step(0); assert.deepEqual(records(current), frozen);
  await current.checkpoint(); const restored = model(f.store, true); await restored.update(AT);
  assert.deepEqual(records(restored), frozen, 'an actual feeding phase survives cold refresh');
  t.diagnostic(JSON.stringify({ seed: SEED, realTurtleOwners: [...current._active.values()].filter(row => row.turtleAgents.length).map(row => row.id),
    contacts, plantDebitsVerified: true, materialBalanceError: current.snapshot().ecosystem.balanceError,
    foodBalanceError: current.snapshot().metrics.balanceError, feedingPhaseColdRestoreExact: true,
    forcedBirthsOrFood: false, shaderCurrentBendOmittedLocalXZUnitsMax: .05, browserViewingVerified: false }));
});
