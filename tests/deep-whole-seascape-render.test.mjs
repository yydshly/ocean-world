import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { DeepOceanChunks } from '../src/world/DeepOceanChunks.js';
import { createDeepSeascapePlans } from '../src/deepSeascape.js';
import { createDeepWholeSeascapePlans, DEEP_WHOLE_SEASCAPE_ANCHOR, DEEP_WHOLE_SEASCAPE_OWNERS } from '../src/deepWholeSeascape.js';

// Native Three buffers, transforms and static triangle queries are CPU renderer
// input evidence. They do not establish WebGL appearance or observer-lamp FPS.
const SEED = '42', ROW = 65;
const renderer = () => new DeepOceanChunks(SEED, { seascape: true });
const plansFor = scene => createDeepWholeSeascapePlans(scene.generator.baseGenerator,
  DEEP_WHOLE_SEASCAPE_ANCHOR.cx, DEEP_WHOLE_SEASCAPE_ANCHOR.cz);
const center = column => ({ x: (DEEP_WHOLE_SEASCAPE_ANCHOR.cx + column + .5) * 64,
  z: (DEEP_WHOLE_SEASCAPE_ANCHOR.cz + 1.5) * 64 });
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const meshFor = (record, id) => record.instances.find(mesh => mesh.userData.elementIds.includes(id));
function digest(record) {
  const hash = createHash('sha256');
  for (const [name, attribute] of Object.entries(record.terrainGeometry.attributes).sort()) {
    hash.update(name); hash.update(bytes(attribute.array));
  }
  hash.update(bytes(record.terrainGeometry.index.array));
  for (const mesh of record.instances) {
    hash.update(mesh.name); hash.update(JSON.stringify(mesh.userData.elementIds)); hash.update(bytes(mesh.instanceMatrix.array));
    if (mesh.instanceColor) hash.update(bytes(mesh.instanceColor.array));
  }
  return hash.digest('hex');
}
const nativeGolden = {
  '-6,-10': '8e3d9282d0f5c363b62f2596e00f41a56508abd12bd9dca76b7cd228695949e2',
  '-5,-10': 'fdfb7773882acad8d84d150868815b67f1ab23c5143a52a22d00662ae3be0c46',
  '-6,-9': '7b368f936f8d3338bff2e58152911c76872be988abbc784efb790b4ea1c8cee4',
  '-5,-9': '99fe452ae41de8c2e5bd8d3991ec97e839472297812758b86959fd2ce9c3e2ca',
};
const seascapeGolden = {
  '-6,-10': '06f05ed4e39be0cdb64527bdcf21702b81482d6b2ad0ed06dc03804ca6979b12',
  '-5,-10': 'ac9ffe3e0781ff2d9869ab4daa1778d3874dd6c2c6a5746050c8aec7161c747f',
  '-6,-9': 'e7ef2c5da456c1ff9e70e5bc759fb0f55c6d612d96a6a7e0799959eaa0870821',
  '-5,-9': '6f523ce62469542420086b86aa279613cc28a69b902cf61f20d55b69dfa021bd',
};
function budget(scene) {
  assert.equal(scene.stats.activeChunks, 9); assert.equal(scene.stats.maxActiveChunks, 9);
  assert.equal(scene.stats.prototypeGeometries, 2); assert.equal(scene.stats.prototypeMaterials, 3);
  assert.equal(scene.stats.maxDrawCalls, 36); assert.ok(scene.stats.drawCalls <= 36);
  assert.ok(scene.stats.elementCounts.rock <= 9 * 8); assert.ok(scene.stats.elementCounts.rubble <= 9 * 24);
  assert.equal(scene.stats.terrainTriangles, 9 * 64 ** 2 * 2); assert.equal(scene.stats.ownedOverlayGeometries, 0);
  assert.equal(scene.stats.naturalLight, 0); assert.equal(scene.stats.photosyntheticScenery, 0);
  assert.ok(scene.generator.seascapeRegistryStats().size <= 25);
}

test('whole-scene private floors and rocks stay undrawn until same-center publication, preserving native instance matrices and shared assets', t => {
  const scene = renderer(), old = new DeepOceanChunks(SEED); t.after(() => { scene.dispose(); old.dispose(); });
  const position = center(1); scene.update(position); old.update(position);
  const plans = plansFor(scene), prior = new Map(scene._chunks), stats = scene.stats;
  assert.equal(plans.length, 12); assert.deepEqual(plans.map(plan => plan.id), DEEP_WHOLE_SEASCAPE_OWNERS);
  assert.equal(plans[0].version, 2); assert.equal(plans[0].theme, 'deep-whole-seascape');
  assert.equal(plans[0].group.widthM, 384); assert.equal(plans[0].group.depthM, 128);
  const prototypes = Object.values(scene._geometries), materials = Object.values(scene._materials);
  assert.throws(() => scene.generator.withSeascapePlans(plans, () => {
    assert.equal(scene.generator.chunk(plans[0].cx, plans[0].cz).seascapePlan, plans[0]);
    assert.equal(scene.update(center(5)), false); assert.deepEqual(new Map(scene._chunks), prior); assert.equal(scene.stats, stats);
    throw new Error('abort before durable commit');
  }), /abort before durable commit/);
  assert.equal(scene.generator.seascapeRevision, 0); assert.deepEqual(new Map(scene._chunks), prior);
  scene.generator.setSeascapePlans(plans); assert.equal(scene.update(position), true);
  const added = plans.filter(plan => scene._chunks.has(plan.id)).reduce((sum, plan) => sum + plan.addedRockIds.length, 0);
  assert.equal(scene.stats.seascapeAddedRocks, added); assert.equal(scene.stats.elementCounts.rock, old.stats.elementCounts.rock + added);
  assert.equal(scene.stats.elementCounts.rubble, old.stats.elementCounts.rubble);
  assert.deepEqual(Object.values(scene._geometries), prototypes); assert.deepEqual(Object.values(scene._materials), materials);
  for (const [id, record] of scene._chunks) {
    const original = old._chunks.get(id), changed = plans.some(plan => plan.id === id); assert.equal(record === prior.get(id), !changed);
    assert.deepEqual(record.terrainGeometry.index.array, original.terrainGeometry.index.array);
    for (const native of original.instances) {
      const mesh = record.instances.find(current => current.name === native.name); assert.ok(mesh);
      assert.deepEqual(mesh.userData.elementIds.slice(0, native.count), native.userData.elementIds);
      assert.deepEqual(mesh.instanceMatrix.array.slice(0, native.count * 16), native.instanceMatrix.array);
      assert.deepEqual(mesh.instanceColor.array.slice(0, native.count * 3), native.instanceColor.array);
    }
    for (const mesh of record.instances) {
      const source = scene.generator.chunk(...id.split(',').map(Number)).elements.filter(element =>
        element.kind === mesh.userData.landscapeKind && scene._geometries[`rock-${element.profile}`] === mesh.geometry);
      assert.deepEqual(mesh.userData.elementIds, source.map(element => element.id));
    }
    if (!changed) assert.equal(digest(record), digest(original));
  }
  const retained = new Map(scene._chunks), revision = scene.generator.seascapeRevision;
  assert.equal(scene.generator.setSeascapePlans(structuredClone(plans)), false); assert.equal(scene.update(position), false);
  assert.deepEqual(new Map(scene._chunks), retained); assert.equal(scene.generator.seascapeRevision, revision); budget(scene);
});

test('all twelve rendered 1m floor patches, sixteen shared seams and broad rock caps agree with the physical source through a floating-origin rebase', t => {
  const scene = renderer(), old = new DeepOceanChunks(SEED); t.after(() => { scene.dispose(); old.dispose(); });
  const plans = plansFor(scene); scene.generator.setSeascapePlans(plans);
  const origin = { x: DEEP_WHOLE_SEASCAPE_ANCHOR.cx * 64, z: DEEP_WHOLE_SEASCAPE_ANCHOR.cz * 64 };
  scene.setRenderOrigin(origin); old.setRenderOrigin(origin);
  const ray = new THREE.Raycaster(), matrix = new THREE.Matrix4(), captured = new Map(), owners = new Set();
  let floorRays = 0, rockRays = 0, vertices = 0, changedFloor = 0, maxFloorError = 0, maxRockError = 0;
  for (const column of [1, 3, 5]) {
    scene.update(center(column)); old.update(center(column)); scene.root.updateMatrixWorld(true);
    for (const plan of plans.filter(plan => scene._chunks.has(plan.id))) {
      if (owners.has(plan.id)) continue; owners.add(plan.id);
      const record = scene._chunks.get(plan.id), native = old._chunks.get(plan.id), attributes = record.terrainGeometry.attributes;
      assert.equal(attributes.position.count, ROW ** 2); assert.equal(plan.floorPatch.gridSize, ROW); assert.equal(plan.floorPatch.spacingM, 1);
      captured.set(plan.id, { origin: record.origin,
        attributes: Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, { itemSize: attribute.itemSize, array: attribute.array.slice() }])) });
      for (let z = 0; z < ROW; z++) for (let x = 0; x < ROW; x++) {
        const index = z * ROW + x, y = attributes.position.getY(index), wx = record.origin.x + x, wz = record.origin.z + z;
        assert.equal(y, plan.floorPatch.heights[index]); assert.equal(y, scene.generator.floorVertex(wx, wz)); vertices++;
        const nativeY = native.terrainGeometry.attributes.position.getY(index), lx = wx - origin.x, lz = wz - origin.z;
        if (lx <= 16 || lx >= 384 - 16 || lz <= 16 || lz >= 128 - 16) assert.equal(y, nativeY, 'original outer sixteen-metre rim');
        if (y !== nativeY) changedFloor++;
      }
      const floor = record.group.children.find(object => object.userData.landscapeKind === 'floor');
      for (const [dx, dz] of [[16.17, 16.29], [32.61, 31.18], [48.19, 47.27]]) {
        const x = record.origin.x + dx, z = record.origin.z + dz;
        ray.set(new THREE.Vector3(x - origin.x, 30, z - origin.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(floor)[0]; assert.ok(hit);
        const surface = scene.generator.floorSurface(x, z), error = Math.abs(hit.point.y - surface.height);
        maxFloorError = Math.max(maxFloorError, error); assert.ok(error < 1e-8);
        for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(hit.face.normal[axis] - surface.normal[axis]) < 1e-8);
        assert.equal(scene.generator.sample(x, z).floorY, surface.height); floorRays++;
      }
      for (const id of plan.addedRockIds) {
        const rock = plan.elements.find(element => element.id === id), mesh = meshFor(record, id), index = mesh.userData.elementIds.indexOf(id);
        mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
        const location = new THREE.Vector3().applyMatrix4(matrix).add(new THREE.Vector3(origin.x, 0, origin.z));
        assert.ok(location.distanceTo(new THREE.Vector3(rock.x, rock.y, rock.z)) < 1e-5);
        for (const [dx, dz] of [[0, 0], [.17, .09], [-.15, -.08]]) {
          const point = new THREE.Vector3(dx, 0, dz).applyMatrix4(matrix);
          ray.set(new THREE.Vector3(point.x, 30, point.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(mesh).find(current => current.instanceId === index); assert.ok(hit);
          const x = point.x + origin.x, z = point.z + origin.z, support = scene.generator.supportAt(x, z);
          assert.equal(support.elementId, id); const error = Math.abs(hit.point.y - support.height);
          maxRockError = Math.max(maxRockError, error); assert.ok(error < 1e-5);
          assert.ok(scene.generator.heightForCamera(x, z) >= hit.point.y - 1e-5); rockRays++;
        }
      }
      budget(scene);
    }
  }
  let seams = 0;
  for (const plan of plans) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const neighbor = captured.get(`${plan.cx + dx},${plan.cz + dz}`); if (!neighbor) continue;
    const current = captured.get(plan.id);
    for (let i = 0; i < ROW; i++) {
      const a = dx ? i * ROW + 64 : 64 * ROW + i, b = dx ? i * ROW : i;
      for (const [name, attribute] of Object.entries(current.attributes)) for (let component = 0; component < attribute.itemSize; component++) {
        const left = attribute.array[a * attribute.itemSize + component], right = neighbor.attributes[name].array[b * attribute.itemSize + component];
        if (name === 'position' && component !== 1) {
          const axis = component === 0 ? 'x' : 'z'; assert.equal(left + current.origin[axis], right + neighbor.origin[axis]);
        } else assert.equal(left, right, `${name} shared seam`);
      }
    }
    seams++;
  }
  assert.equal(owners.size, 12); assert.equal(vertices, 12 * ROW ** 2); assert.equal(seams, 16); assert.equal(floorRays, 36);
  assert.equal(rockRays, plans.reduce((sum, plan) => sum + plan.addedRockIds.length, 0) * 3); assert.ok(rockRays > 0 && changedFloor > 0);
  t.diagnostic(JSON.stringify({ seed: 'string:42', group: `${DEEP_WHOLE_SEASCAPE_ANCHOR.cx},${DEEP_WHOLE_SEASCAPE_ANCHOR.cz}`,
    owners: owners.size, floorVertices: vertices, sharedSeams: seams, changedFloorVertices: changedFloor, floorRays, rockRays,
    maxFloorTriangleErrorM: maxFloorError, maxRockCapTriangleErrorM: maxRockError,
    scope: 'CPU renderer inputs and physical support; no WebGL or GPU acceptance' }));
});

test('independent pre-v2 native and original four-owner deep-seascape bed, color, index and instance SHA receipts remain exact', t => {
  for (const [mode, expected] of [['native', nativeGolden], ['v1', seascapeGolden]]) {
    const scene = new DeepOceanChunks(SEED, { seascape: mode === 'v1' }); t.after(() => scene.dispose());
    if (mode === 'v1') scene.generator.setSeascapePlans(createDeepSeascapePlans(scene.generator, -6, -10));
    scene.update({ x: -320, z: -576 });
    for (const [id, hash] of Object.entries(expected)) assert.equal(digest(scene._chunks.get(id)), hash, `${mode} ${id}`);
    if (mode === 'native') assert.equal(Object.hasOwn(scene.stats, 'seascapeRevision'), false);
    else assert.equal(scene.stats.seascapeAddedRocks, 2);
  }
});

test('saved cold plans and distant travel retain actual buffers; unload, reset and repeated disposal release owned resources once within the original window', t => {
  const scene = renderer(); t.after(() => scene.dispose()); const plans = plansFor(scene), saved = structuredClone(plans), released = new Map();
  const track = () => { for (const record of scene._chunks.values()) for (const resource of [record.terrainGeometry, ...record.instances])
    if (!released.has(resource)) { released.set(resource, 0); resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1)); } };
  let prototypeReleases = 0, materialReleases = 0;
  Object.values(scene._geometries).forEach(resource => resource.addEventListener('dispose', () => prototypeReleases++));
  [...Object.values(scene._materials), scene._terrainMaterial].forEach(resource => resource.addEventListener('dispose', () => materialReleases++));
  scene.update(center(1)); track(); scene.generator.setSeascapePlans(plans); scene.update(center(1)); track();
  const hashes = new Map();
  for (const column of [1, 3, 5]) {
    scene.update(center(column)); track(); budget(scene);
    for (const plan of plans.filter(plan => scene._chunks.has(plan.id))) hashes.set(plan.id, digest(scene._chunks.get(plan.id)));
  }
  scene.update({ x: -1500, z: 1500 }); track(); budget(scene); assert.equal(scene.stats.seascapeAddedRocks, 0);
  assert.equal(prototypeReleases, 0); assert.equal(materialReleases, 0);
  for (const column of [5, 3, 1]) {
    scene.update(center(column)); track(); budget(scene);
    for (const plan of plans.filter(plan => scene._chunks.has(plan.id))) assert.equal(digest(scene._chunks.get(plan.id)), hashes.get(plan.id));
  }
  const cold = renderer(); t.after(() => cold.dispose()); cold.generator.setSeascapePlans(saved);
  for (const column of [1, 3, 5]) {
    cold.update(center(column)); budget(cold);
    for (const plan of plans.filter(plan => cold._chunks.has(plan.id))) assert.equal(digest(cold._chunks.get(plan.id)), hashes.get(plan.id));
  }
  scene.generator.setSeascapePlans([]); scene.update(center(1)); track(); assert.equal(scene.stats.seascapeAddedRocks, 0);
  scene.reset(SEED); track(); budget(scene); assert.equal(scene.generator.seascapeRevision, 0);
  scene.dispose(); scene.dispose(); assert.ok([...released.values()].every(count => count === 1));
  assert.equal(prototypeReleases, 2); assert.equal(materialReleases, 3); assert.equal(scene.root.children.length, 0); assert.equal(scene.stats.activeChunks, 0);
});
