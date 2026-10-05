import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createOceanSceneElements, validateOceanSceneElementsRecord, sceneElementHeight, sceneElementMesh } from '../src/oceanSceneElements.js';

const clone = value => structuredClone(value), WORLD = 'ecology-v1:string:42';
const POSITION = { x: 224, z: 96 }, AWAY = { x: 2048, z: 2048 };
const frozen = readFileSync(new URL('../output/validation/ocean-scene-ecology-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(frozen).digest('hex'), '73bfc7b8705666ddb472138f2c2081a463d721f1ae8d274226185ebbad5b5d63');
const source = frozen.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(new URL(dependency, new URL('../src/oceanEcology.js', import.meta.url)).href)}`);
const { OceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const fields = ['sceneElementsVersion', 'sceneElementsInitializedAtSec', 'sceneElements'];
const strip = row => { const copy = clone(row); for (const field of fields) delete copy[field]; return copy; };
const records = ecology => [...ecology._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
const scenery = ecology => records(ecology).flatMap(row => row.sceneElements ?? []);
const counts = { stone: 8, 'plant-clump': 6, bottle: 1, driftwood: 2 };

class MemoryStore {
  available = true; records = new Map(); batches = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { this.records.set(`${world}|${id}`, clone(row)); }
  async saveMany(world, entries) {
    const rows = clone(entries); this.batches.push(rows);
    if (await this.beforeCommit?.(world, rows) === null) return null;
    const next = new Map(this.records);
    for (const [id, row] of rows) next.set(`${world}|${id}`, row);
    this.records = next;
  }
}
async function model({ store = new MemoryStore(), position = POSITION, enabled = true, seed = '42', turtles = true } = {}) {
  const ecology = new OceanEcology(seed, createOceanGenerator(seed), { store, turtles, sceneElements: enabled });
  assert.notEqual(await ecology.update(position), false); assert.equal(ecology._active.size, 9); return ecology;
}
async function oldWindow() {
  const store = new MemoryStore(), old = new OriginalEcology('42', createOceanGenerator('42'), { store, turtles: true });
  await old.update(POSITION); old.step(.6, { currentMps: .15, foodSupply: 0, hour: 12 });
  for (const row of old._active.values()) {
    row.opaqueExtension = { bytes: [2, 7, 11], preserved: true };
    for (const agent of row.agents) agent.opaqueExtension = { oldHistory: [row.id, 'preserve'] };
  }
  const owner = [...old._active.values()].find(row => row.agents.length), dead = owner.agents[0];
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  await old.checkpoint(); store.batches.length = 0; return { old, store, before: records(old), dead: clone(dead) };
}
function worldVertices(element) {
  const mesh = sceneElementMesh(element.kind, element.variant), points = [];
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] * element.scale.x, z = mesh.positions[i + 2] * element.scale.z;
    points.push({ x: element.x + x * c + z * s, y: element.y + mesh.positions[i + 1] * element.scale.y,
      z: element.z - x * s + z * c });
  }
  return points;
}
function footprint(element) { return Math.max(...worldVertices(element).map(p => Math.hypot(p.x - element.x, p.z - element.z))); }
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function physicalMesh(element) {
  const template = sceneElementMesh(element.kind, element.variant), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(template.positions, 3)); geometry.setIndex(template.indices);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(element.x, element.y, element.z); mesh.scale.set(element.scale.x, element.scale.y, element.scale.z);
  mesh.rotation.y = element.rotation; mesh.updateMatrixWorld(true); return { mesh, geometry, material };
}

test('default disabled scene preserves the entire frozen previous ecology shape and future native and turtle steps', async () => {
  const current = await model({ enabled: false });
  const old = new OriginalEcology('42', createOceanGenerator('42'), { store: new MemoryStore(), turtles: true }); await old.update(POSITION);
  assert.deepEqual(records(current), records(old)); assert.ok(records(current).every(row => fields.every(field => !Object.hasOwn(row, field))));
  for (const dt of [.04, .06, .3, .4]) { current.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 }); old.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 }); }
  assert.deepEqual(records(current), records(old)); assert.deepEqual(current.snapshot().resources, old.snapshot().resources);
});

test('one committed additive scene preserves every old animal, turtle, death, stock, ledger, clock and opaque field', async () => {
  const fixture = await oldWindow(), current = await model({ store: fixture.store }); assert.ok(scenery(current).length > 0);
  assert.ok(fixture.before.some(row => Object.values(row.resources).some(stock => stock > 0)));
  records(current).forEach((row, index) => {
    assert.deepEqual(strip(row), fixture.before[index]); assert.equal(row.sceneElementsVersion, 1);
    assert.equal(row.sceneElementsInitializedAtSec, row.timeSec);
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${row.id}`), row, 'the complete additive record is durable before activation');
  });
  assert.deepEqual(records(current).flatMap(row => row.agents).find(agent => agent.id === fixture.dead.id), fixture.dead);
});

test('bounded scenery is typed-seed and visit-order deterministic, independent of actual input array order and old food state', async () => {
  const a = await model(), b = await model({ position: { x: 288, z: 96 } }); await b.update(POSITION); assert.deepEqual(scenery(a), scenery(b));
  const owner = [...a._active.values()].find(row => row.sceneElements.length), before = clone(owner);
  const surface = (x, z) => oceanSupportHeight(a.generator, x, z, { avoidCoral: true });
  const plan = createOceanSceneElements(a.generator, owner, { seed: '42', surface });
  const reversed = { ...a.generator, chunk: (cx, cz) => { const chunk = a.generator.chunk(cx, cz); return { ...chunk, elements: [...chunk.elements].reverse() }; } };
  assert.deepEqual(createOceanSceneElements(reversed, { ...owner, agents: [...owner.agents].reverse() }, { seed: '42', surface }), plan);
  assert.deepEqual(owner, before); const typed = await model({ seed: 42 }); assert.notDeepEqual(scenery(a), scenery(typed));
  for (const row of records(a)) {
    assert.ok(row.sceneElements.length <= 17);
    for (const [kind, limit] of Object.entries(counts)) assert.ok(row.sceneElements.filter(element => element.kind === kind).length <= limit);
  }
});

test('real scene meshes rest on rendered bed triangles and grass clusters use actual neighboring rooted plants', async () => {
  const current = await model(); let rigid = 0, plants = 0;
  for (const row of records(current)) for (const element of row.sceneElements) {
    assert.equal(element.regionId, row.id); assert.ok(Object.hasOwn(counts, element.kind));
    const radius = footprint(element);
    assert.ok(element.x - radius >= row.cx * 64 && element.x + radius <= (row.cx + 1) * 64);
    assert.ok(element.z - radius >= row.cz * 64 && element.z + radius <= (row.cz + 1) * 64);
    if (element.kind === 'plant-clump') {
      assert.equal(element.y, current.generator.floorSurface(element.x, element.z).height);
      const grass = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        grass.push(...current.generator.chunk(row.cx + dx, row.cz + dz).elements.filter(e => e.kind === 'seagrass'));
      assert.ok(element.sourceGrassIds.length >= 2); assert.ok(element.sourceGrassIds.includes(element.sourceGrassId));
      for (const id of element.sourceGrassIds) { const source = grass.find(e => e.id === id); assert.ok(source);
        assert.ok(Math.hypot(source.x - element.x, source.z - element.z) <= 7);
        assert.equal(source.y, current.generator.floorSurface(source.x, source.z).height); }
      assert.equal(sceneElementHeight(element, element.x, element.z, false), null); plants++;
    } else {
      const gaps = worldVertices(element).map(p => p.y - current.generator.floorSurface(p.x, p.z).height);
      assert.ok(gaps.every(gap => gap >= -1e-7), 'no rigid vertex penetrates the actual terrain');
      assert.ok(Math.min(...gaps) <= 1e-7, 'at least one actual rigid vertex contacts the terrain'); rigid++;
    }
    if (element.kind === 'bottle') assert.deepEqual([element.physicalState, element.sealed, element.flooded], ['grounded-flooded', false, true]);
  }
  assert.ok(rigid > 0); assert.ok(plants > 0, 'the real window contains both solid seabed objects and supported vegetation');
});

test('original finite native body corridors and the closed turtle patrol remain free of the actual new geometry', async () => {
  const current = await model(); let checked = 0;
  for (const row of records(current)) for (const element of row.sceneElements) {
    const radius = footprint(element);
    for (const agent of [...row.agents, ...(row.turtleAgents ?? [])]) {
      const points = ['position', 'home', 'target', 'refuge', 'diveTarget'].map(key => agent[key]).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z));
      const turtle = agent.speciesId === 'green-turtle', clearance = turtle ? .64 * agent.sizeM + .37 : Math.max(.7, .65 * agent.sizeM);
      for (const a of points) for (const b of points) {
        // An object on the bed can sit beneath a genuinely high water-column
        // route. Check horizontal clearance when its actual mesh height also
        // overlaps the route's finite body, rather than forbidding every XZ.
        const half = Math.max(.12, .3 * agent.sizeM), low = Math.min(a.y, b.y) - half, high = Math.max(a.y, b.y) + half;
        if (turtle || (element.y <= high && element.y + element.scale.y >= low))
          assert.ok(segmentDistance(element, a, b) >= radius + clearance - 1e-8);
        checked++;
      }
      if (agent.patrolWaypoints) for (let i = 0; i < agent.patrolWaypoints.length; i++) {
        const a = agent.patrolWaypoints[i], b = agent.patrolWaypoints[(i + 1) % agent.patrolWaypoints.length];
        assert.ok(segmentDistance(element, a, b) >= radius + clearance - 1e-8); checked++;
      }
      for (const point of points) {
        const oldTop = oceanSupportHeight(current.generator, point.x, point.z, { avoidCoral: true });
        assert.ok(current._surface(point.x, point.z, true) <= Math.max(oldTop, point.y - .25 * agent.sizeM) + 1e-8,
          'new scenery cannot introduce an intrusion at an old body pose');
      }
    }
  }
  assert.ok(checked > 0);
});

test('actual shared triangle supports enter physics only for the relevant solid or swimming plant footprint', async t => {
  const current = await model(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0); let checked = 0;
  for (const element of scenery(current)) {
    const { mesh, geometry, material } = physicalMesh(element); t.after(() => { geometry.dispose(); material.dispose(); });
    const vertices = worldVertices(element), center = { x: element.x, z: element.z };
    for (const p of [center, ...vertices.filter((_, i) => i % 11 === 0).map(v => ({ x: (v.x + element.x) * .5, z: (v.z + element.z) * .5 }))]) {
      ray.set(new THREE.Vector3(p.x, 20, p.z), down); const hit = ray.intersectObject(mesh)[0]; if (!hit) continue;
      const top = sceneElementHeight(element, p.x, p.z, true); assert.ok(top !== null);
      if (element.kind === 'plant-clump') assert.ok(top >= hit.point.y - 5e-6, 'the finite canopy envelope includes every actual leaf triangle');
      else assert.ok(Math.abs(top - hit.point.y) <= 5e-6);
      const baseline = oceanSupportHeight(current.generator, p.x, p.z, { avoidCoral: true });
      assert.ok(Math.abs(current._surface(p.x, p.z, true) - Math.max(baseline, top)) <= 5e-6);
      if (element.kind === 'plant-clump') assert.equal(current._surface(p.x, p.z, false), oceanSupportHeight(current.generator, p.x, p.z));
      checked++;
    }
    assert.equal(sceneElementHeight(element, element.x + footprint(element) + 1, element.z, true), null);
  }
  assert.ok(checked >= 10, 'support checks include actual ray hits rather than bounding-box heights');
});

test('atomic scene saves expose no uncommitted owner and null or throwing commits preserve the complete prior disk state', async () => {
  const fixture = await oldWindow(); let release, offered;
  fixture.store.beforeCommit = async (_world, rows) => { if (!release) { offered = clone(rows); await new Promise(resolve => { release = resolve; }); } };
  const current = new OceanEcology('42', createOceanGenerator('42'), { store: fixture.store, turtles: true, sceneElements: true }), pending = current.update(POSITION);
  for (let i = 0; i < 80 && !release; i++) await Promise.resolve(); assert.ok(release); assert.equal(current._active.size, 0);
  const [id, row] = offered[0]; assert.deepEqual(strip(row), fixture.before.find(old => old.id === id));
  assert.ok(!Object.hasOwn(fixture.store.records.get(`${WORLD}|${id}`), 'sceneElementsVersion')); release(); await pending;
  for (const mode of ['null', 'throw']) {
    const old = await oldWindow(), disk = clone([...old.store.records]); old.store.beforeCommit = async () => { if (mode === 'throw') throw new Error('scene transaction failed'); return null; };
    const failed = new OceanEcology('42', createOceanGenerator('42'), { store: old.store, turtles: true, sceneElements: true });
    assert.equal(await failed.update(POSITION), false); assert.equal(scenery(failed).length, 0); assert.deepEqual([...old.store.records], disk);
    old.store.beforeCommit = undefined; assert.notEqual(await failed.update(POSITION), false); assert.ok(scenery(failed).length > 0);
  }
});

test('scene objects never become food or animals, and an empty once-only cohort or legacy sequential store cannot refill', async () => {
  const current = await model(), snapshot = current.snapshot();
  assert.equal(snapshot.agents.length, records(current).reduce((sum, row) => sum + row.agents.length + (row.turtleAgents?.length ?? 0), 0));
  assert.ok(scenery(current).every(element => !Object.hasOwn(element, 'energy') && !Object.hasOwn(element, 'food') && !Object.hasOwn(element, 'alive')));
  const owner = [...current._active.values()].find(row => row.sceneElements.length); owner.sceneElements = [];
  await current.checkpoint(); const before = clone(owner), restored = await model({ store: current.store }); assert.deepEqual(restored._active.get(owner.id), before);
  const legacyStore = new MemoryStore(); legacyStore.saveMany = undefined; const legacy = await model({ store: legacyStore });
  assert.equal(scenery(legacy).length, 0); assert.ok(records(legacy).every(row => fields.every(field => !Object.hasOwn(row, field))));
});

test('damaged marked scene records reject instead of replacing old individuals or regenerating a layout', async () => {
  const current = await model(); await current.checkpoint(); const row = records(current).find(r => r.sceneElements.length), key = `${WORLD}|${row.id}`;
  for (const mutate of [r => { r.sceneElementsVersion = 99; }, r => { r.sceneElementsInitializedAtSec = r.timeSec + 1; },
    r => { r.sceneElements[0].x += 64; }, r => { r.sceneElements[0].y -= 10; },
    r => { r.sceneElements[0].scale.x = NaN; }, r => { r.sceneElements.push(clone(r.sceneElements[0])); }]) {
    const corrupt = clone(row); mutate(corrupt); assert.equal(validateOceanSceneElementsRecord(corrupt, current.generator, {
      surface: (x, z) => oceanSupportHeight(current.generator, x, z, { avoidCoral: true }) }), false);
    const store = new MemoryStore(); store.records = new Map(clone([...current.store.records])); store.records.set(key, corrupt);
    const restored = new OceanEcology('42', createOceanGenerator('42'), { store, turtles: true, sceneElements: true });
    await assert.rejects(restored.update(POSITION), /Invalid saved .*scene/i); assert.ok(!restored._active.has(row.id)); assert.deepEqual(store.records.get(key), corrupt);
  }
  // A legacy native array can throw during turtle validation after the valid
  // historical scene geometry is accepted. That pending owner must leave
  // neither active animals nor ghost collision geometry behind.
  const turtleOwner = records(current).find(r => r.turtleAgentCount === 1 || r.turtleAgents?.length === 1);
  assert.ok(turtleOwner); const corrupt = clone(turtleOwner); corrupt.agents[0] = null;
  const store = new MemoryStore(); store.records = new Map(clone([...current.store.records])); store.records.set(`${WORLD}|${corrupt.id}`, corrupt);
  const restored = new OceanEcology('42', createOceanGenerator('42'), { store, turtles: true, sceneElements: true });
  await assert.rejects(restored.update(POSITION)); assert.ok(!restored._active.has(corrupt.id));
  assert.ok(!restored._sceneSupports.has(corrupt.id), 'an exceptional restore cannot leak its pending solid or canopy support');
  assert.deepEqual(store.records.get(`${WORLD}|${corrupt.id}`), corrupt);
});

test('pause, genuine unload, revisit and fresh restoration preserve complete scene records and the same next ordinary ecology step', async () => {
  const current = await model(); current.step(.6, { currentMps: .2, foodSupply: 0, hour: 12 }); const before = records(current), ids = before.map(row => row.id);
  current.step(0); assert.deepEqual(records(current), before); await current.update(AWAY); assert.ok(ids.every(id => !current._active.has(id)));
  current.step(.4); await current.update(POSITION); assert.deepEqual(records(current), before); await current.checkpoint();
  const restored = await model({ store: current.store }); assert.deepEqual(records(restored), before);
  current.step(.1, { currentMps: .3, foodSupply: 0, hour: 12 }); restored.step(.1, { currentMps: .3, foodSupply: 0, hour: 12 });
  assert.deepEqual(records(current), records(restored)); assert.deepEqual(scenery(current), before.flatMap(row => row.sceneElements));
});
