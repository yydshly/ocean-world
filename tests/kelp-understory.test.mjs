import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { oceanRockMesh } from '../src/oceanRockShape.js';
import { KELP_UNDERSTORY_SCENERY_VERSION, KELP_UNDERSTORY_LIMIT, createKelpUnderstoryPlan,
  understoryWaterClearance } from '../src/kelpUnderstory.js';
import { kelpVisitorPositionValid } from '../src/kelpVisitorCommunity.js';
import { kelpWaterPositionValid } from '../src/kelpWaterCommunity.js';

const clone = value => structuredClone(value);
const WORLD = 'kelp-ecology-v1:string:42', START = { x: -289, z: -62 }, AWAY = { x: 963, z: -315 };
const frozenSource = readFileSync(new URL('../output/validation/kelp-understory-ecology-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(frozenSource).digest('hex'),
  '5e7faff0418b771caff3c2712b9e5eb494e3286ab326bdf7301f1906f0a06761');
const rewritten = frozenSource.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(new URL(dependency, new URL('../src/kelpOceanEcology.js', import.meta.url)).href)}`);
const { KelpOceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
class MemoryStore {
  available = true; records = new Map(); batches = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { this.records.set(`${world}|${id}`, clone(record)); }
  async saveMany(world, entries) {
    const offered = clone(entries); this.batches.push(offered);
    const response = await this.beforeCommit?.(world, offered); if (response === null) return null;
    const next = new Map(this.records);
    for (const [id, record] of offered) next.set(`${world}|${id}`, record);
    this.records = next;
  }
}
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(region => model._record(region));
const plants = model => [...model._active.values()].flatMap(region => region.understoryPlants ?? []).sort((a, b) => a.id.localeCompare(b.id));
const strip = record => { const copy = clone(record); for (const key of ['understorySceneryVersion', 'understoryInitializedAtSec', 'understoryPlants']) delete copy[key]; return copy; };
async function current(store = new MemoryStore(), point = START, options = {}) {
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store, visitors: true, understory: true, ...options });
  assert.equal(await model.update(point), true); return model;
}
async function oldWindow() {
  const store = new MemoryStore(), old = new OriginalEcology('42', createKelpOceanGenerator('42'), { store, visitors: true });
  assert.equal(await old.update(START), true); old.step(3.3, { currentMps: .18, foodSupply: 0, hour: 0 });
  for (const region of old._active.values()) {
    region._savedRecord = { ...region._savedRecord, opaqueExtension: { untouched: true, bytes: [7, 2, 1] } };
    region._savedState = { ...region._savedState, opaqueState: { text: 'native RNG, stock and visitor history' } };
  }
  // A genuine original death is kept in the same native population and is
  // saved normally, rather than replaced by a synthetic low-layer animal.
  const owner = [...old._active.values()].find(region => region.sim.agents.some(a => a.speciesId === 'purple-urchin'));
  const dead = owner.sim.agents.find(a => a.speciesId === 'purple-urchin'); dead.alive = false; dead.state = 'dead'; dead.energy = 0;
  await old.checkpoint(); store.batches.length = 0;
  return { old, store, before: records(old), dead: clone(dead) };
}
function planOptions(model, region) {
  const original = model._plan(region.cx, region.cz);
  return { seed: model.seed, excludedHostIds: new Set(original.rocks.map(rock => rock.id)),
    floorSites: original.options.floorSites.map(([x, z]) => ({ x, z })), reservedAnchors: original.anchors,
    occupiedAgents: [...region.sim.agents, ...(region.waterAgents ?? []), ...(region.visitorAgents ?? [])], timeSec: region.sim.timeSec };
}
function rockMesh(rock) {
  const data = oceanRockMesh(rock.profile), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(rock.x, rock.y, rock.z); mesh.rotation.y = rock.rotation; mesh.scale.set(rock.scale.x, rock.scale.y, rock.scale.z);
  mesh.updateMatrixWorld(true); return mesh;
}

test('default false preserves the independently frozen full old ecology and next fixed steps exactly', async () => {
  const old = new OriginalEcology('42', createKelpOceanGenerator('42'), { store: new MemoryStore(), visitors: true });
  await old.update(START); const model = await current(new MemoryStore(), START, { understory: false });
  assert.deepEqual(records(model), records(old)); assert.equal(plants(model).length, 0);
  old.step(.8, { currentMps: .3, foodSupply: 0, hour: 11 }); model.step(.8, { currentMps: .3, foodSupply: 0, hour: 11 });
  assert.deepEqual(records(model), records(old)); assert.deepEqual(model.snapshot().resources, old.snapshot().resources);
});

test('one-time scenery metadata preserves all old animals, deaths, hidden RNG, positive stocks and whole opaque fields', async () => {
  const fixture = await oldWindow(); assert.ok(fixture.before.some(r => r.driftPatches?.some(p => p.stock > 0)));
  const model = await current(fixture.store); assert.ok(plants(model).length, 'the finite real window must actually contain a low layer');
  records(model).forEach((record, index) => {
    assert.deepEqual(strip(record), fixture.before[index]); assert.equal(record.understorySceneryVersion, KELP_UNDERSTORY_SCENERY_VERSION);
    assert.equal(record.understoryInitializedAtSec, record.state.timeSec); assert.ok(record.understoryPlants.length <= KELP_UNDERSTORY_LIMIT);
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${record.id}`), record, 'all scenery is durable before its owner is activated');
  });
  const dead = records(model).flatMap(r => r.state.agents).find(a => a.id === fixture.dead.id); assert.deepEqual(dead, fixture.dead);
  const beforeIds = fixture.before.flatMap(r => [...r.state.agents, ...r.waterAgents, ...r.visitorAgents].map(a => a.id)).sort();
  const afterIds = records(model).flatMap(r => [...r.state.agents, ...r.waterAgents, ...r.visitorAgents].map(a => a.id)).sort();
  assert.deepEqual(afterIds, beforeIds, 'lower scenery creates no ecological host, extra animal or food pool');
  assert.ok(plants(model).every(p => !Object.hasOwn(p, 'energy') && !Object.hasOwn(p, 'stock') && !Object.hasOwn(p, 'alive')));
});

test('actual rendered rock triangles support every finite root, while sediment openings and authored roots stay free', async () => {
  const model = await current(), ray = new THREE.Raycaster(); let count = 0, sediment = 0;
  for (const region of model._active.values()) {
    const chunk = model.generator.chunk(region.cx, region.cz), roots = region.understoryPlants ?? [], options = planOptions(model, region);
    for (const plant of roots) {
      const rock = chunk.elements.find(element => element.id === plant.hostId); assert.ok(rock && ['rock', 'formation'].includes(rock.kind));
      assert.equal(options.excludedHostIds.has(rock.id), false);
      assert.equal(plant.regionId, region.id); assert.equal(Math.floor(plant.x / 64), region.cx); assert.equal(Math.floor(plant.z / 64), region.cz);
      assert.ok(Math.hypot(plant.x, plant.z) > 42); assert.ok(plant.heightM >= 1.2 && plant.heightM <= 1.8);
      assert.ok(plant.radiusM >= .7 && plant.radiusM <= 1.05); assert.ok(Number.isFinite(plant.phase));
      const support = model.generator.supportAt(plant.x, plant.z); assert.equal(support.substrate, 'rock'); assert.equal(support.elementId, plant.hostId);
      const mesh = rockMesh(rock); ray.set(new THREE.Vector3(plant.x, 20, plant.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit); assert.ok(Math.abs(hit.point.y + .006 - plant.y) < 1e-5, 'the declared six-millimetre root offset sits directly above real hard-cap triangles');
      assert.ok(plant.y + plant.heightM < model.generator.surfaceY - .3, 'the complete low layer stays submerged');
      for (const { x, z } of options.floorSites) assert.ok(Math.hypot(plant.x - x, plant.z - z) > 4 + plant.radiusM);
      mesh.geometry.dispose(); mesh.material.dispose(); count++;
    }
    for (let z = 4; z < 64; z += 8) for (let x = 4; x < 64; x += 8) {
      const point = { x: region.cx * 64 + x, z: region.cz * 64 + z };
      if (model.generator.supportAt(point.x, point.z).substrate === 'sediment') {
        assert.ok(!roots.some(p => Math.hypot(p.x - point.x, p.z - point.z) < .02), 'sediment is never silently treated as a rock root'); sediment++;
      }
    }
  }
  assert.ok(count >= 6 && sediment > 30, 'the scene has an actual new low layer and real open bottom, not a uniform carpet');
});

test('allocation uses typed world seeds and is independent of visit order and old animal/chunk ordering', async () => {
  const model = await current(), old = records(model), region = [...model._active.values()].find(r => r.understoryPlants.length);
  const chunk = model.generator.chunk(region.cx, region.cz), options = planOptions(model, region);
  const first = createKelpUnderstoryPlan(model.generator, chunk, options);
  const reversed = { ...chunk, elements: [...chunk.elements].reverse() };
  assert.deepEqual(createKelpUnderstoryPlan(model.generator, reversed, { ...options, occupiedAgents: [...options.occupiedAgents].reverse() }), first);
  assert.deepEqual(records(model), old, 'planning never changes old clocks, arrays, resources or motion');
  const other = await current(); await other.update(AWAY); await other.update(START); assert.deepEqual(plants(other), plants(model));
  const numeric = createKelpUnderstoryPlan(createKelpOceanGenerator(42), createKelpOceanGenerator(42).chunk(region.cx, region.cz), { seed: 42 });
  assert.notDeepEqual(numeric, createKelpUnderstoryPlan(model.generator, chunk, { seed: '42' }));
  assert.deepEqual(createKelpUnderstoryPlan(model.generator, chunk, { excludedHostIds: new Set(chunk.elements.filter(e => ['rock', 'formation'].includes(e.kind)).map(e => e.id)) }), []);
});

test('the shared finite cylinder includes the whole swimmer body and leaves air above and open channels clear', () => {
  const plant = { id: 'test:rock-root', x: 100, y: -4, z: 100, heightM: 1.8, radiusM: .9 }, size = 1.5;
  assert.ok(understoryWaterClearance({ x: 100, y: -3, z: 100 }, size, [plant]) < 0);
  assert.ok(understoryWaterClearance({ x: 100, y: -4 - .33 * size - .03, z: 100 }, size, [plant]) >= 0);
  assert.ok(understoryWaterClearance({ x: 100, y: -4 + 1.8 + .33 * size + .03, z: 100 }, size, [plant]) >= 0);
  assert.ok(understoryWaterClearance({ x: 100 + .9 + .58 * size + .12 + .01, y: -3, z: 100 }, size, [plant]) > 0);
  assert.ok(understoryWaterClearance({ x: 100 + .9 + .58 * size + .12 - .01, y: -3, z: 100 }, size, [plant]) < 0);
  assert.equal(understoryWaterClearance({ x: 100, y: -3, z: 100 }, size, []), Infinity);
});

test('scenery activation intersects no existing live animals or reserved original floor/host routes', async () => {
  const fixture = await oldWindow(), model = await current(fixture.store); let checked = 0;
  for (const region of model._active.values()) {
    const nearby = [...model._active.values()].filter(other => Math.abs(other.cx - region.cx) <= 1 && Math.abs(other.cz - region.cz) <= 1)
      .flatMap(other => other.understoryPlants ?? []);
    for (const animal of [...region.sim.agents, ...region.waterAgents, ...region.visitorAgents].filter(a => a.alive && a.speciesId !== 'giant-kelp')) {
      assert.ok(understoryWaterClearance(animal.position, animal.sizeM, nearby) >= 0, `saved body ${animal.id} remains clear on activation`);
      if (animal.speciesId === 'giant-kelpfish') for (const point of [animal.home, animal.target])
        assert.ok(understoryWaterClearance(point, animal.sizeM, nearby) >= 0, 'native targets remain clear without rewriting native routes');
      checked++;
    }
  }
  assert.ok(checked > 80);
});

test('pause, genuine unload/revisit and reopening retain complete old and low-layer records and the same next step', async () => {
  const model = await current(); model.step(.7, { currentMps: .2, foodSupply: 0, hour: 11 });
  const before = records(model), owners = before.map(r => r.id); model.step(0); assert.deepEqual(records(model), before);
  await model.update(AWAY); assert.ok(owners.every(id => !model._active.has(id))); model.step(.2);
  await model.update(START); assert.deepEqual(records(model), before); await model.checkpoint();
  const restored = await current(model.store); assert.deepEqual(records(restored), before);
  model.step(.1, { currentMps: .4, foodSupply: 0, hour: 8 }); restored.step(.1, { currentMps: .4, foodSupply: 0, hour: 8 });
  assert.deepEqual(records(model), records(restored));
  const disabled = await current(model.store, START, { understory: false }), savedPlants = clone(plants(disabled));
  assert.ok(savedPlants.length, 'saved scenery remains preserved when future allocation is disabled'); disabled.step(.1);
  assert.deepEqual(plants(disabled), savedPlants, 'a disabled option does not refill or erase durable plant identity and support');
});

test('metadata and plants remain private until a complete compatibility transaction commits', async () => {
  const fixture = await oldWindow(); let release, offered;
  fixture.store.beforeCommit = async (_world, entries) => { if (!release) { offered = clone(entries); await new Promise(resolve => { release = resolve; }); } };
  const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: fixture.store, visitors: true, understory: true });
  const pending = model.update(START); for (let turn = 0; turn < 60 && !release; turn++) await Promise.resolve();
  assert.ok(release); assert.equal(model._active.size, 0); assert.equal(plants(model).length, 0);
  const [id, record] = offered[0]; assert.equal(record.understorySceneryVersion, 1);
  assert.deepEqual(strip(record), fixture.before.find(r => r.id === id));
  assert.equal(fixture.store.records.get(`${WORLD}|${id}`).understorySceneryVersion, undefined);
  release(); assert.equal(await pending, true); assert.ok(plants(model).length);
});

test('throwing and null saves publish no uncommitted layer and leave old records untouched until ordinary retry', async () => {
  for (const failure of ['throw', 'null']) {
    const fixture = await oldWindow(), before = clone([...fixture.store.records]);
    fixture.store.beforeCommit = async () => { if (failure === 'throw') throw new Error('understory save denied'); return null; };
    const model = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store: fixture.store, visitors: true, understory: true });
    assert.equal(await model.update(START), false); assert.equal(plants(model).length, 0); assert.deepEqual([...fixture.store.records], before);
    assert.ok(model.snapshot().metrics.storageError); fixture.store.beforeCommit = undefined;
    assert.equal(await model.update(START), true); const first = plants(model); assert.ok(first.length);
    await model.update(AWAY); await model.update(START); assert.deepEqual(plants(model), first);
  }
});

test('invalid future version, root host/geometry, finite range, ownership or cap records reject without regeneration', async () => {
  const model = await current(); await model.checkpoint();
  // This actual seeded owner has enough unselected hard caps to construct
  // thirty-three individually legal roots and isolate only the total cap.
  const region = model._active.get('-4,-1'); assert.ok(region.understoryPlants.length);
  const original = model._record(region), key = `${WORLD}|${region.id}`;
  const changes = [r => { r.understorySceneryVersion = 99; }, r => { r.understoryInitializedAtSec = r.state.timeSec + 1; },
    r => { r.understoryPlants[0].x += 64; }, r => { r.understoryPlants[0].hostId = 'missing:rock'; },
    r => { r.understoryPlants[0].y += .5; }, r => { r.understoryPlants[0].heightM = NaN; },
    r => { r.understoryPlants[0].radiusM = 20; }, r => { r.understoryPlants[0].regionId = '999,999'; },
    r => { r.understoryPlants[0].phase = 9; }, r => { r.understoryPlants[0].id = `${r.understoryPlants[0].id}:wrong-slot`; },
    r => { r.understoryPlants.push(clone(r.understoryPlants[0])); },
    r => {
      const selected = new Set(model._plan(region.cx, region.cz).rocks.map(rock => rock.id)), overfull = [];
      for (const host of model.generator.chunk(region.cx, region.cz).elements.filter(e => ['rock', 'formation'].includes(e.kind) && !selected.has(e.id))) {
        const support = model.generator.supportAt(host.x, host.z), depth = model.generator.surfaceY - support.height;
        if (support.elementId !== host.id || depth < 4 || depth > 20 || host.x < region.cx * 64 + 4 || host.x > (region.cx + 1) * 64 - 4 ||
            host.z < region.cz * 64 + 4 || host.z > (region.cz + 1) * 64 - 4 || Math.hypot(host.x, host.z) <= 46) continue;
        for (let slot = 0; slot < 3; slot++) overfull.push({ id: `kelp-understory:${region.id}:${host.id}:${slot}`, regionId: region.id,
          hostId: host.id, x: host.x, y: support.height + .006, z: host.z, heightM: 1.2, radiusM: .7, phase: 0 });
      }
      assert.ok(overfull.length > 32, 'the overflow fixture uses physically supported, correctly named records so cap validation is isolated');
      r.understoryPlants = overfull.slice(0, 33);
    }];
  for (const change of changes) {
    const store = new MemoryStore(); store.records = new Map(clone([...model.store.records])); const corrupt = clone(original); change(corrupt); store.records.set(key, corrupt);
    const restored = new KelpOceanEcology('42', createKelpOceanGenerator('42'), { store, visitors: true, understory: true });
    assert.equal(await restored.update(START), false); assert.equal(restored._active.has(region.id), false);
    assert.deepEqual(store.records.get(key), corrupt); assert.ok(restored.snapshot().metrics.storageError);
  }
});

test('legacy sequential stores and explicitly old support do not allocate new low scenery', async () => {
  const store = new MemoryStore(); store.saveMany = undefined; const model = await current(store);
  assert.equal(plants(model).length, 0); assert.ok(records(model).every(r => r.understorySceneryVersion === undefined));
  const oldSupport = new KelpOceanEcology('42', createKelpOceanGenerator('42', { supportVersion: 1 }), { store: new MemoryStore(), understory: true });
  assert.equal(await oldSupport.update(START), true); assert.equal(plants(oldSupport).length, 0);
  assert.ok(records(oldSupport).every(r => r.understorySceneryVersion === undefined));
});

test('finite old and new water validators both include a genuine physical low-layer obstruction', async () => {
  const model = await current(), region = [...model._active.values()].find(r => r.understoryPlants.length), plant = region.understoryPlants[0];
  const point = { x: plant.x, y: plant.y + 1.2, z: plant.z }, context = { cx: region.cx, cz: region.cz, elements: [], understoryPlants: [plant] };
  const empty = { ...context, understoryPlants: [] };
  assert.equal(kelpWaterPositionValid(model.generator, point, .3, empty), true, 'the actual selected rock top supports a small existing swimmer');
  assert.equal(kelpWaterPositionValid(model.generator, point, .3, context), false);
  // Larger visitor body can begin slightly higher while overlapping the
  // conservative vegetation cylinder with its lower pitch envelope.
  let sharkObstruction = false;
  for (const owner of model._active.values()) for (const canopy of owner.understoryPlants) {
    const sharkPoint = { x: canopy.x, y: canopy.y + 1.4, z: canopy.z };
    const open = { cx: owner.cx, cz: owner.cz, elements: [], understoryPlants: [] };
    if (!kelpVisitorPositionValid(model.generator, sharkPoint, 1.2, open)) continue;
    assert.equal(kelpVisitorPositionValid(model.generator, sharkPoint, 1.2, { ...open, understoryPlants: [canopy] }), false);
    sharkObstruction = true; break;
  }
  assert.ok(sharkObstruction, 'a real complete visitor body is rejected by the actual low layer');
  const allCanopies = plants(model), mobile = () => [...model._active.values()].flatMap(owner => [...owner.waterAgents, ...owner.visitorAgents]).filter(a => a.alive);
  let checked = 0;
  for (let tick = 0; tick < 20; tick++) {
    const before = new Map(mobile().map(a => [a.id, clone(a.position)])); model.step(.1, { currentMps: .18, foodSupply: 0, hour: 10 });
    for (const animal of mobile()) {
      const prior = before.get(animal.id), speed = animal.speciesId === 'leopard-shark' ? .28 : .18;
      assert.ok(Math.hypot(animal.position.x - prior.x, animal.position.y - prior.y, animal.position.z - prior.z) <= speed * .1 + 1e-9);
      for (const t of [.25, .5, .75, 1]) {
        const reference = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, prior[axis] + (animal.position[axis] - prior[axis]) * t]));
        assert.ok(understoryWaterClearance(reference, animal.sizeM, allCanopies) >= 0, 'actual old/new swimmer steps remain outside the new physical low layer');
      }
      checked++;
    }
  }
  assert.ok(checked > 100, 'ordinary fixed steps exercise real existing schools and visitors');
});
