import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingSeabedRelief, validateLivingSeabedRelief, selectLivingSeabedReliefTheme,
  sampleLivingSeabedRelief, livingSeabedFloorVertex, livingSeabedFloorSurface } from '../src/livingSeabedRelief.js';

const SEED = 'living-shallows-v1|string:42';
const base = createLivingShallowsGenerator(SEED), tuples = [[35, 7, 'shelf-rise'], [27, 9, 'sand-basin']];
const before = tuples.map(([cx, cz]) => JSON.stringify(base.chunk(cx, cz)));
const plans = tuples.map(([cx, cz]) => createLivingSeabedRelief(base, cx, cz));
function neighbourhood(plan) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) rows.push(...base.chunk(plan.cx + dx, plan.cz + dz).elements);
  return rows;
}
function world(element, x, z) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  return { x: element.x + x * element.scale.x * c + z * element.scale.z * s,
    z: element.z - x * element.scale.x * s + z * element.scale.z * c };
}

test('two actual themes are deterministic, gentle macro bed changes and keep the untouched generator exact', t => {
  for (const [i, [cx, cz, theme]] of tuples.entries()) {
    const plan = plans[i];
    assert.equal(selectLivingSeabedReliefTheme(base, cx, cz), theme); assert.equal(plan.theme, theme);
    assert.ok(validateLivingSeabedRelief(plan, base)); assert.ok(Object.isFrozen(plan.floorPatch.heights));
    assert.equal(JSON.stringify(createLivingSeabedRelief(base, cx, cz)), JSON.stringify(plan));
    assert.equal(JSON.stringify(base.chunk(cx, cz)), before[i]);
    assert.equal(plan.floorPatch.heights.length, 65 * 65);
    assert.ok(plan.floorPatch.heights.every(y => Number.isFinite(y) && Math.fround(y) === y));
    assert.ok(plan.floorPatch.deltaSpanM >= 2.3); assert.ok(plan.floorPatch.maxSlope <= .65);
    assert.ok(plan.floorPatch.controls.amplitudeM >= 3 && plan.floorPatch.controls.amplitudeM <= 5);
    const p = plan.floorPatch.mostDisplaced, actual = livingSeabedFloorSurface(base, plan, p.x, p.z).height;
    assert.equal(actual - base.floorSurface(p.x, p.z).height, p.deltaM);
    assert.equal(Math.sign(p.deltaM), theme === 'shelf-rise' ? 1 : -1);
    assert.deepEqual(plan.overview.center, { x: p.x, z: p.z });
    t.diagnostic(`${theme} owner=${plan.id} peak/basin=${p.x},${p.z}; displacement=${p.deltaM}m; max slope=${plan.floorPatch.maxSlope}`);
  }
  assert.equal(selectLivingSeabedReliefTheme(base, 30, 10), null, 'grass-intensive owners remain the existing scene');
  assert.equal(selectLivingSeabedReliefTheme(base, 34, 12), null, 'dense hard hosts remain the existing scene');
  const rejected = JSON.stringify(base.chunk(33, 9));
  assert.throws(() => createLivingSeabedRelief(base, 33, 9), RangeError, 'insufficient whole macro space declines finitely');
  assert.equal(JSON.stringify(base.chunk(33, 9)), rejected);
});

test('the actual persisted Float32 terrain triangles match support heights and normals on both sides of every diagonal', t => {
  let hits = 0, changedProbes = 0;
  for (const plan of plans) {
    const positions = [], indices = [], originX = plan.cx * 64, originZ = plan.cz * 64;
    for (let iz = 0; iz < 65; iz++) for (let ix = 0; ix < 65; ix++) positions.push(ix, plan.floorPatch.heights[iz * 65 + ix], iz);
    for (let iz = 0; iz < 64; iz++) for (let ix = 0; ix < 64; ix++) {
      const a = iz * 65 + ix, b = a + 1, c = a + 65, d = c + 1; indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(originX, 0, originZ); mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), peak = plan.floorPatch.mostDisplaced;
    try {
      for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) for (const [tx, tz] of [[.21, .31], [.73, .66]]) {
        const x = peak.x + dx + tx, z = peak.z + dz + tz, expected = livingSeabedFloorSurface(base, plan, x, z);
        ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - expected.height) < 2e-5);
        assert.ok(new THREE.Vector3(expected.normal.x, expected.normal.y, expected.normal.z).distanceTo(hit.face.normal) < 1e-6);
        assert.equal(livingSeabedFloorVertex(base, plan, x, z), expected.height);
        if (Math.abs(expected.height - base.floorSurface(x, z).height) > 1) changedProbes++;
        hits++;
      }
    } finally { geometry.dispose(); material.dispose(); }
  }
  assert.equal(hits, 36); assert.ok(changedProbes >= 30);
  t.diagnostic(`real terrain raycasts=${hits}; macroscopic changed probes=${changedProbes}`);
});

test('every unchanged native host and neighbouring plant footprint keeps the original complete supporting triangles', t => {
  let hosts = 0, grasses = 0, probes = 0;
  for (const plan of plans) {
    const original = base.chunk(plan.cx, plan.cz), after = new Map(plan.elements.map(e => [e.id, e]));
    for (const e of original.elements.filter(e => e.kind !== 'rubble')) assert.equal(JSON.stringify(after.get(e.id)), JSON.stringify(e));
    assert.deepEqual(plan.retainedRockIds, original.elements.filter(e => e.kind === 'rock').map(e => e.id));
    for (const e of neighbourhood(plan).filter(e => ['rock', 'coral', 'algae', 'seagrass', 'bottle', 'driftwood'].includes(e.kind))) {
      for (const [x, z] of [[0, 0], [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [-.49, 0], [.49, 0], [0, -.49], [0, .49]]) {
        const p = world(e, x, z);
        assert.deepEqual(livingSeabedFloorSurface(base, plan, p.x, p.z), base.floorSurface(p.x, p.z), `${e.id} full footprint`);
        assert.deepEqual(sampleLivingSeabedRelief(base, plan, p.x, p.z), base.sample(p.x, p.z)); probes++;
      }
      if (e.kind === 'rock') hosts++;
      if (e.kind === 'seagrass') grasses++;
    }
  }
  assert.ok(hosts >= 8); assert.ok(grasses >= 100, 'actual old neighbour grass IDs participate, rather than a vacuous own-grass check');
  t.diagnostic(`unchanged hard hosts=${hosts}; real protected neighbour grass=${grasses}; full footprint probes=${probes}`);
});

test('only existing rubble is regrounded and depth/class summaries follow the shared real bed without changing native cover fields', () => {
  let movedRubble = 0;
  for (const plan of plans) {
    const old = base.chunk(plan.cx, plan.cz);
    assert.equal(plan.elements.length, old.elements.length);
    assert.deepEqual(plan.elements.map(e => e.id), old.elements.map(e => e.id));
    for (const [i, e] of plan.elements.entries()) if (e.kind === 'rubble') {
      assert.equal(e.y, livingSeabedFloorSurface(base, plan, e.x, e.z).height);
      assert.deepEqual({ ...e, y: old.elements[i].y }, old.elements[i]); if (e.y !== old.elements[i].y) movedRubble++;
    }
    const p = plan.floorPatch.mostDisplaced, fresh = sampleLivingSeabedRelief(base, plan, p.x + .23, p.z + .29), original = base.sample(p.x + .23, p.z + .29);
    const floor = livingSeabedFloorSurface(base, plan, p.x + .23, p.z + .29);
    assert.equal(fresh.floorY, floor.height); assert.equal(fresh.depthM, base.surfaceY - floor.height);
    assert.equal(fresh.bedSlope, Math.hypot(floor.normal.x, floor.normal.z) / floor.normal.y);
    for (const key of ['rockiness', 'seagrassSuitability', 'sandOpening', 'substrate']) assert.equal(fresh[key], original[key]);
    assert.deepEqual(base.coverAt(p.x + .23, p.z + .29, fresh), base.coverAt(p.x + .23, p.z + .29, original));
    const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 }; let min = Infinity, max = -Infinity;
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const s = sampleLivingSeabedRelief(base, plan, plan.cx * 64 + 4 + ix * 8, plan.cz * 64 + 4 + iz * 8);
      habitats[s.habitat]++; min = Math.min(min, s.depthM); max = Math.max(max, s.depthM);
    }
    assert.equal(plan.habitatComposition.samples, 64); assert.deepEqual(plan.habitatComposition.habitats, habitats);
    assert.equal(plan.habitatComposition.minDepthM, min); assert.equal(plan.habitatComposition.maxDepthM, max);
    assert.equal(plan.elements.some(e => ['resource', 'food', 'animal'].includes(e.kind)), false);
  }
  assert.ok(movedRubble >= 4);
});

test('the complete 16 metre band, neighbouring queries and replay after cache eviction preserve old seam behavior', () => {
  for (const plan of plans) {
    const x0 = plan.cx * 64, z0 = plan.cz * 64;
    for (let iz = 0; iz < 65; iz++) for (let ix = 0; ix < 65; ix++) if (ix <= 16 || ix >= 48 || iz <= 16 || iz >= 48)
      assert.equal(livingSeabedFloorVertex(base, plan, x0 + ix, z0 + iz), base.floorVertex(x0 + ix, z0 + iz));
    for (const offset of [-1, -.01, 0, .37, 8.41, 15.21]) for (const along of [3.14, 22.54, 45.12, 61.77]) for (const [x, z] of [
      [x0 + offset, z0 + along], [x0 + 64 - offset, z0 + along], [x0 + along, z0 + offset], [x0 + along, z0 + 64 - offset]]) {
      assert.deepEqual(livingSeabedFloorSurface(base, plan, x, z), base.floorSurface(x, z));
      assert.deepEqual(sampleLivingSeabedRelief(base, plan, x, z), base.sample(x, z));
    }
  }
  const saved = plans.map(p => JSON.stringify(p)), samples = plans.map(p => livingSeabedFloorSurface(base, p, p.overview.center.x + .15, p.overview.center.z + .22));
  for (let i = 0; i < 35; i++) base.chunk(100 + i, -100 - i);
  assert.ok(base.cacheStats().size <= 32);
  for (const [i, [cx, cz]] of tuples.entries()) {
    assert.equal(JSON.stringify(base.chunk(cx, cz)), before[i]);
    assert.equal(JSON.stringify(createLivingSeabedRelief(base, cx, cz)), saved[i]);
    assert.deepEqual(livingSeabedFloorSurface(base, plans[i], plans[i].overview.center.x + .15, plans[i].overview.center.z + .22), samples[i]);
  }
});

test('saved-plan validation rejects edited grids, native identities, relief metadata and wrong seeds without regenerating public plans', () => {
  for (const plan of plans) {
    const reject = mutate => { const p = structuredClone(plan); mutate(p); assert.equal(validateLivingSeabedRelief(p, base), false); };
    reject(p => p.seed = 'living-shallows-v1|string:73'); reject(p => p.baseStamp += 'changed');
    reject(p => p.floorPatch.heights[0] = Math.fround(p.floorPatch.heights[0] + .1));
    reject(p => p.floorPatch.heights[32 * 65 + 32] = Math.fround(p.floorPatch.heights[32 * 65 + 32] + .01));
    reject(p => p.floorPatch.heights.pop()); reject(p => p.floorPatch.heights[20] = Infinity);
    reject(p => p.floorPatch.controls.amplitudeM += .1); reject(p => p.floorPatch.maxSlope = .8);
    reject(p => p.floorPatch.deltaSpanM = 1); reject(p => p.floorPatch.mostDisplaced.x++);
    reject(p => p.elements.find(e => e.kind === 'rock').y += .1);
    reject(p => p.elements.find(e => e.kind === 'coral').attachmentId = 'not-a-host');
    reject(p => p.elements.find(e => e.kind === 'rubble').y += .1);
    reject(p => p.elements.pop()); reject(p => p.elements.push(structuredClone(p.elements[0])));
    reject(p => p.overview.center.x++); reject(p => p.habitatComposition.minDepthM += .2);
    reject(p => p.newRockIds = ['invented']); reject(p => p.theme = p.theme === 'sand-basin' ? 'shelf-rise' : 'sand-basin');
  }
  assert.equal(validateLivingSeabedRelief(null, base), false);
  assert.throws(() => livingSeabedFloorVertex(base, plans[0], Infinity, 0), RangeError);
});
