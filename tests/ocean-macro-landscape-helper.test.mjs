import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { sceneElementMesh } from '../src/oceanSceneElements.js';
import { habitatSceneMesh } from '../src/oceanHabitatScenes.js';
import { createOceanMacroLandscape, validateOceanMacroLandscapeRecord, macroLandscapeHeight,
  macroLandscapeMesh, macroPlantMesh, OCEAN_MACRO_LANDSCAPE_LIMITS, OCEAN_MACRO_LANDSCAPE_VERSION } from '../src/oceanMacroLandscape.js';

const clone = value => structuredClone(value), close = (a, b) => assert.ok(Math.abs(a - b) < 2e-6, `${a} vs ${b}`);
function fixture() {
  const receipt = JSON.parse(readFileSync(new URL('../output/validation/whole-scene-visible-before.json', import.meta.url), 'utf8'));
  const generator = createOceanGenerator(receipt.ocean.ecology.seed), region = clone(receipt.ocean.ecology.regions.find(row => row.id === '3,1'));
  region.agents = receipt.ocean.ecology.agents.filter(agent => agent.regionId === region.id && agent.speciesId !== 'green-turtle');
  region.turtleAgents = receipt.ocean.ecology.agents.filter(agent => agent.regionId === region.id && agent.speciesId === 'green-turtle');
  const surface = (x, z) => oceanSupportHeight(generator, x, z, { avoidCoral: true });
  return { generator, region, surface };
}
function marked(region, elements) { return { ...clone(region), macroLandscapeVersion: OCEAN_MACRO_LANDSCAPE_VERSION,
  macroLandscapeInitializedAtSec: region.timeSec, macroLandscapeElements: clone(elements) }; }
const massOf = elements => elements.filter(e => e.kind === 'reef-mass');
const flat = seed => ({ seed, floorSurface: () => ({ height: 0 }),
  sample: () => ({ floorY: 0, substrate: 'sand', seagrassSuitability: .7, depthM: 8 }),
  coverAt: () => ({ seagrass: .7, sandOpening: .2 }), chunk: () => ({ elements: [] }) });

test('the real seeded cell gets connected area-scale landforms and many separate sediment roots without changing old records or consuming a shared stream', () => {
  const { generator, region, surface } = fixture(), before = clone(region), elements = createOceanMacroLandscape(generator, region, { surface });
  const counts = Object.fromEntries(['reef-mass', 'meadow-shoot', 'reef-colony'].map(kind => [kind, elements.filter(e => e.kind === kind).length]));
  assert.equal(counts['reef-mass'], 2); assert.ok(counts['meadow-shoot'] > 100); assert.ok(counts['reef-colony'] >= 20);
  for (const [kind, count] of Object.entries(counts)) assert.ok(count <= OCEAN_MACRO_LANDSCAPE_LIMITS[kind]);
  assert.ok(elements.length <= OCEAN_MACRO_LANDSCAPE_LIMITS.total); assert.equal(new Set(elements.map(e => e.id)).size, elements.length);
  assert.deepEqual(region, before); assert.ok(Object.isFrozen(elements) && elements.every(Object.isFrozen));
  for (const mass of massOf(elements)) {
    assert.ok(mass.grid.cells.length * mass.grid.step ** 2 > 90, 'one actual connected body covers much more than an isolated prop');
    const unseen = new Set(mass.grid.cells.map(c => `${c.i},${c.j}`)), queue = [mass.grid.cells[0]]; unseen.delete(`${queue[0].i},${queue[0].j}`);
    for (let index = 0; index < queue.length; index++) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = queue[index].i + di, j = queue[index].j + dj, key = `${i},${j}`;
      if (unseen.delete(key)) queue.push({ i, j });
    }
    assert.equal(unseen.size, 0, 'all admitted top cells belong to one edge-connected reef body');
    const mesh = macroLandscapeMesh(mass, generator), xs = [], zs = [];
    for (let i = 0; i < mesh.positions.length; i += 3) { xs.push(mesh.positions[i]); zs.push(mesh.positions[i + 2]); }
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    assert.ok(span >= 8 && span <= 20.00001);
  }
  const copyGenerator = createOceanGenerator(generator.seed);
  for (const [x, z] of [[99, 100], [-5, 7], [9, -3], [4, 1]]) copyGenerator.chunk(x, z);
  assert.deepEqual(createOceanMacroLandscape(copyGenerator, clone(region), { surface: (x, z) => oceanSupportHeight(copyGenerator, x, z, { avoidCoral: true }) }), elements);
  const empty = { id: '3,1', cx: 3, cz: 1, timeSec: 0, agents: [] };
  assert.notDeepEqual(createOceanMacroLandscape(flat('42'), empty, { surface: () => 0 }),
    createOceanMacroLandscape(flat(42), empty, { surface: () => 0 }), 'numeric and string seeds retain separate coordinate streams');
});

test('rigid support matches actual Float32 triangles, connected edges share vertices without internal walls, and old full scenery geometry stays above new solids', () => {
  const { generator, region, surface } = fixture(), elements = createOceanMacroLandscape(generator, region, { surface });
  const masses = massOf(elements); let rays = 0, oldVertices = 0;
  for (const mass of masses) {
    const data = macroLandscapeMesh(mass, generator), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), ownerX = region.cx * 64, ownerZ = region.cz * 64;
    const unique = new Set();
    for (let i = 0; i < data.positions.length; i += 3) {
      const p = data.positions.slice(i, i + 3); assert.ok(p.every(v => Number.isFinite(v) && Math.fround(v) === v));
      const key = p.join(','); assert.ok(!unique.has(key), 'connected cells share actual indexed vertices instead of duplicate per-cell stacks'); unique.add(key);
    }
    for (const cell of mass.grid.cells.filter((_, index) => index % 7 === 0)) {
      const x = mass.grid.origin.x + (cell.i + .41) * mass.grid.step, z = mass.grid.origin.z + (cell.j + .27) * mass.grid.step;
      ray.set(new THREE.Vector3(x - ownerX, 8, z - ownerZ), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; assert.ok(hit); close(macroLandscapeHeight(mass, generator, x, z, false), hit.point.y); rays++;
    }
    // Each boundary edge has only its outer wall. There is no vertical face
    // between adjacent top cells, even when their saved shoulder caps differ.
    const occupied = new Set(mass.grid.cells.map(c => `${c.i},${c.j}`)); let edges = 0;
    for (const c of mass.grid.cells) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!occupied.has(`${c.i + di},${c.j + dj}`)) edges++;
    assert.equal(data.indices.length / 3, mass.grid.cells.length * 4 + edges * 2);
    geometry.dispose(); mesh.material.dispose();
  }
  assert.ok(rays > 15);
  const old = [...region.sceneElements, ...region.habitatSceneElements];
  for (const e of old) {
    const data = e.kind.startsWith('coral-') || ['sea-fan', 'grass-meadow'].includes(e.kind) ? habitatSceneMesh(e.kind) : sceneElementMesh(e.kind, e.variant);
    const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
    for (let i = 0; i < data.positions.length; i += 3) {
      const lx = data.positions[i] * e.scale.x, lz = data.positions[i + 2] * e.scale.z;
      const x = e.x + lx * c + lz * s, z = e.z - lx * s + lz * c, y = e.y + data.positions[i + 1] * e.scale.y;
      for (const mass of masses) { const top = macroLandscapeHeight(mass, generator, x, z, false); assert.ok(top === null || top < y + 1e-6); }
      oldVertices++;
    }
  }
  assert.ok(oldVertices > 100);
  const shoot = macroPlantMesh('meadow-shoot'); assert.equal(shoot.indices.length / 3, 48);
  for (let i = 0; i < shoot.positions.length; i += 3) {
    assert.ok(Math.hypot(shoot.positions[i], shoot.positions[i + 2]) <= .5);
    assert.ok(shoot.positions[i + 1] >= 0 && shoot.positions[i + 1] <= 1);
  }
  for (const e of elements.filter(e => e.kind !== 'reef-mass')) {
    assert.equal(macroLandscapeHeight(e, generator, e.x, e.z, false), null);
    close(macroLandscapeHeight(e, generator, e.x, e.z, true), e.y + e.scale.y);
    assert.equal(macroLandscapeHeight(e, generator, e.x + Math.max(e.scale.x, e.scale.z), e.z), null);
  }
});

test('all sixteen closed turtle-route segments remain free, high swimmers permit landforms below them, and saved geometry validation ignores subsequent animal travel while rejecting damage', () => {
  const generator = flat('route'), region = { id: '3,1', cx: 3, cz: 1, timeSec: 4, agents: [] }, surface = () => 0;
  const base = createOceanMacroLandscape(generator, region, { surface }), mass = massOf(base)[0]; assert.ok(mass);
  const above = { id: 'high-swimmer', speciesId: 'test-existing', sizeM: .5, alive: true,
    position: { x: mass.x, y: 6.5, z: mass.z }, home: { x: mass.x, y: 6.5, z: mass.z }, target: { x: mass.x, y: 6.5, z: mass.z } };
  assert.deepEqual(massOf(createOceanMacroLandscape(generator, { ...region, agents: [above] }, { surface })), massOf(base),
    'three-dimensional guards allow real mass height safely beneath a high swimmer');
  const waypoints = Array.from({ length: 16 }, (_, i) => ({ x: 224 + Math.cos(i * Math.PI / 8) * 9, y: 2,
    z: 96 + Math.sin(i * Math.PI / 8) * 9 }));
  const guardedRegion = { ...region, turtleAgents: [{ id: 'old-turtle', speciesId: 'green-turtle', sizeM: 1.4, alive: true,
    position: waypoints[0], home: waypoints[0], target: waypoints[1], patrolWaypoints: waypoints }] };
  const guarded = createOceanMacroLandscape(generator, guardedRegion, { surface }); assert.ok(massOf(guarded).length);
  for (let i = 0; i < 16; i++) for (let step = 0; step <= 10; step++) {
    const a = waypoints[i], b = waypoints[(i + 1) % 16], x = a.x + (b.x - a.x) * step / 10, z = a.z + (b.z - a.z) * step / 10;
    for (const m of massOf(guarded)) assert.equal(macroLandscapeHeight(m, generator, x, z, false), null, `closed route segment ${i} must retain its carved corridor`);
    assert.ok(guarded.filter(e => e.kind !== 'reef-mass').every(e => Math.hypot(e.x - x, e.z - z) > .8));
  }
  const record = marked(guardedRegion, guarded); assert.equal(validateOceanMacroLandscapeRecord(record, generator, { surface }), true);
  record.turtleAgents[0].position = { x: 224, y: 8, z: 96 }; record.turtleAgents[0].home = { x: 230, y: 3, z: 102 };
  assert.equal(validateOceanMacroLandscapeRecord(record, generator, { surface }), true, 'historical cut descriptors do not follow moved animals');
  for (const change of [r => delete r.macroLandscapeVersion, r => r.macroLandscapeInitializedAtSec = 5,
    r => r.macroLandscapeElements.push(clone(r.macroLandscapeElements[0])),
    r => r.macroLandscapeElements[0].grid.cells[0].riseM = NaN,
    r => r.macroLandscapeElements[0].grid.cells.push(clone(r.macroLandscapeElements[0].grid.cells[0])),
    r => r.macroLandscapeElements[0].grid.origin.x += 1,
    r => r.macroLandscapeElements[0].foodStock = 1]) {
    const bad = clone(record); change(bad); assert.equal(validateOceanMacroLandscapeRecord(bad, generator, { surface }), false);
  }
});
