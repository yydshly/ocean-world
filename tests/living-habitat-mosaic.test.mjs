import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLivingShallowsGenerator, LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites,
  livingShallowsPropGroundY } from '../src/livingShallowsGeneration.js';
import { createLivingHabitatMosaic, validateLivingHabitatMosaic, selectLivingHabitatMosaicTheme } from '../src/livingHabitatMosaic.js';
import { oceanRockHeight, oceanRockMesh } from '../src/oceanRockShape.js';
import { createOceanEnvironment } from '../src/oceanEnvironment.js';
import { livingShallowsAssetGeometries } from '../src/world/livingShallowsAssets.js';
import { meadowInstanceData, meadowGroundOffset } from '../src/world/livingMeadowEnvironment.js';

const SEED = 'living-shallows-v1|string:42', TAU = Math.PI * 2;
const base = createLivingShallowsGenerator(SEED);
const owners = [[21, 7, 'patch-reef'], [19, 4, 'meadow-edge'], [4, 8, 'meadow-edge']];
const originals = new Map(owners.map(([cx, cz]) => [`${cx},${cz}`, JSON.stringify(base.chunk(cx, cz))]));
const plans = owners.map(([cx, cz, theme]) => createLivingHabitatMosaic(base, cx, cz, { theme }));
const [patch, meadow, establishedMeadow] = plans;
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s, z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}
function rowsNear(plan, changed = true) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    rows.push(...(changed && !dx && !dz ? plan.elements : base.chunk(plan.cx + dx, plan.cz + dz).elements));
  return rows;
}
function support(rows, x, z) {
  return rows.filter(e => e.kind === 'rock').reduce((y, r) => Math.max(y, oceanRockHeight(r, x, z) ?? -Infinity), base.floorSurface(x, z).height);
}
function ring(x, z, radius, n = 8) {
  return [{ x, z }, ...Array.from({ length: n }, (_, i) => ({ x: x + Math.cos(i * TAU / n) * radius, z: z + Math.sin(i * TAU / n) * radius }))];
}
function boundaryRock(e, b) {
  return Math.min(e.x - b.minX, b.maxX - e.x, e.z - b.minZ, b.maxZ - e.z) <= Math.hypot(e.scale.x, e.scale.z) * .5 + 6;
}
function fits(e, b) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation), hx = .5 * (Math.abs(c) * e.scale.x + Math.abs(s) * e.scale.z),
    hz = .5 * (Math.abs(s) * e.scale.x + Math.abs(c) * e.scale.z);
  return e.x - hx >= b.minX + 6 && e.x + hx <= b.maxX - 6 && e.z - hz >= b.minZ + 6 && e.z + hz <= b.maxZ - 6;
}

test('real coordinate admission and complete plans are deterministic without rewriting base descriptors or habitat fields', () => {
  for (const [index, [cx, cz, theme]] of owners.entries()) {
    assert.equal(selectLivingHabitatMosaicTheme(base, cx, cz), theme);
    assert.equal(JSON.stringify(createLivingHabitatMosaic(base, cx, cz, { theme })), JSON.stringify(plans[index]));
    assert.ok(validateLivingHabitatMosaic(plans[index], base));
    assert.equal(JSON.stringify(base.chunk(cx, cz)), originals.get(`${cx},${cz}`));
    assert.ok(Object.isFrozen(plans[index]) && Object.isFrozen(plans[index].elements));
  }
  assert.equal(selectLivingHabitatMosaicTheme(base, 19, 6), null, 'all-hard owner does not promise a sediment corridor or bed');
  assert.throws(() => createLivingHabitatMosaic(base, 2, -4, { theme: 'meadow-edge' }), RangeError);
  assert.equal(base.chunk(2, -4).counts.seagrass, 140, 'a rejected birth cannot delete the original grass');
  const anotherSeed = createLivingShallowsGenerator('living-shallows-v1|string:73');
  assert.equal(validateLivingHabitatMosaic(meadow, anotherSeed), false);
  for (const p of plans) {
    const chunk = base.chunk(p.cx, p.cz), h = chunk.habitatComposition.habitats;
    const v1Qualified = chunk.counts.rock >= 4 && chunk.counts.seagrass <= 64 && h.seagrass <= 8 && h.reef + h.slope >= 16 && chunk.seed % 3 === 2;
    assert.equal(v1Qualified, false, 'ordinary sample is not intercepted by the existing v1 ridge admission');
  }
  checkCacheReplay();
});

test('old boundary hosts, attached colonies and every source grass ID remain exact; new whole footprints retreat six metres', () => {
  let oldGrass = 0;
  for (const p of plans) {
    const chunk = base.chunk(p.cx, p.cz), before = new Map(chunk.elements.map(e => [e.id, e])), after = new Map(p.elements.map(e => [e.id, e]));
    const retained = chunk.elements.filter(e => e.kind === 'rock' && (p.theme === 'meadow-edge' || boundaryRock(e, chunk.bounds)));
    assert.deepEqual(p.retainedRockIds, retained.map(e => e.id));
    const hostIds = new Set(retained.map(e => e.id));
    for (const e of chunk.elements.filter(e => hostIds.has(e.id) || hostIds.has(e.attachmentId) || ['seagrass', 'bottle', 'driftwood'].includes(e.kind)))
      assert.equal(JSON.stringify(after.get(e.id)), JSON.stringify(e), e.id);
    for (const e of chunk.elements.filter(e => e.kind === 'seagrass')) { assert.ok(after.has(e.id)); oldGrass++; }
    for (const e of p.elements.filter(e => !before.has(e.id))) assert.ok(fits(e, chunk.bounds), e.id);
    if (p.theme === 'meadow-edge') for (const e of chunk.elements) assert.equal(JSON.stringify(after.get(e.id)), JSON.stringify(e));
  }
  assert.equal(oldGrass, 161, 'test contains actual pre-existing source IDs, including the neighbour halo');
  assert.equal(establishedMeadow.elements.filter(e => e.kind === 'seagrass').length, 250);
  checkOwnerBudgets();
});

test('all four real hummock meshes and new colony roots share the existing Float32 rock triangles', t => {
  const rocks = patch.elements.filter(e => patch.newRockIds.includes(e.id)), rows = rowsNear(patch), ray = new THREE.Raycaster();
  assert.equal(rocks.length, 4); let samples = 0, attached = 0;
  assert.ok(new Set(rocks.map(e => e.rotation)).size >= 3);
  assert.ok(new Set(rocks.map(e => e.scale.x)).size >= 3);
  for (const rock of rocks) {
    assert.ok(rock.scale.y >= 3 && rock.scale.y <= 5);
    assert.equal(rock.y, base.floorSurface(rock.x, rock.z).height - .18);
    const data = oceanRockMesh(rock.profile), geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(rock.x, rock.y, rock.z);
    mesh.rotation.y = rock.rotation; mesh.scale.set(rock.scale.x, rock.scale.y, rock.scale.z); mesh.updateMatrixWorld(true);
    try {
      for (const [x, z] of [[0, 0], [.13, -.10], [-.23, .08]]) {
        const p = world(rock, x, z), expected = oceanRockHeight(rock, p.x, p.z);
        ray.set(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh, false)[0]; assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - expected) < 2e-5); samples++;
      }
      for (const e of patch.elements.filter(e => e.attachmentId === rock.id)) {
        assert.ok(Math.abs(e.y - oceanRockHeight(rock, e.x, e.z)) < 1e-6);
        assert.ok(Math.abs(e.y - support(rows, e.x, e.z)) < 1e-6); attached++;
      }
    } finally { geometry.dispose(); material.dispose(); }
  }
  assert.equal(samples, 12); assert.ok(attached >= 8);
  t.diagnostic(`actual new rock raycasts=${samples}; exact attached roots=${attached}`);
});

test('the entire meadow grows on real sediment and its 96-shoot kit grounds within one centimetre', t => {
  const geometries = livingShallowsAssetGeometries(); t.after(() => Object.values(geometries).forEach(g => g.dispose()));
  const kit = geometries.seagrass, refs = new Map(), attribute = kit.attributes.rootXZ, water = createOceanEnvironment(SEED, base);
  for (let i = 0; i < attribute.count; i++) refs.set(`${attribute.getX(i)},${attribute.getY(i)}`, [attribute.getX(i), attribute.getY(i)]);
  assert.equal(kit.userData.bladeCount, 96);
  let maxError = 0, samples = 0;
  for (const plan of [meadow, establishedMeadow]) {
    const originalIds = new Set(base.chunk(plan.cx, plan.cz).elements.map(e => e.id)), rows = rowsNear(plan);
    for (const e of plan.elements.filter(e => e.kind === 'seagrass' && !originalIds.has(e.id))) {
      const ground = Float32Array.from(meadowInstanceData(base, water, e).ground);
      assert.equal(e.y, base.floorSurface(e.x, e.z).height);
      const state = base.sample(e.x, e.z); assert.ok(['sand', 'mixed'].includes(state.substrate)); assert.ok(state.depthM <= 20);
      for (const [x, z] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) {
        const p = world(e, x, z); assert.notEqual(base.sample(p.x, p.z).substrate, 'rock');
        assert.ok(support(rows, p.x, p.z) <= base.floorSurface(p.x, p.z).height + .035);
      }
      for (const [x, z] of refs.values()) {
        const p = world(e, x, z), shownY = e.y + meadowGroundOffset(x, z, ground) * e.scale.y;
        maxError = Math.max(maxError, Math.abs(shownY - base.floorSurface(p.x, p.z).height)); samples++;
      }
    }
  }
  assert.equal(meadow.meadow.diameterM, 18); assert.equal(meadow.meadow.rootsWithin9m, 26);
  assert.equal(meadow.meadow.worldFieldM, 180); assert.equal(meadow.elements.filter(e => e.kind === 'seagrass').length, 180);
  assert.ok(maxError <= .01, `maximum actual grounding error=${maxError}m`);
  t.diagnostic(`new roots tested=269; shoot probes=${samples}; maximum ground error=${maxError}m`);
});

test('the open sediment passage stays the original floor and old adjacent support including grounded props stays exact', () => {
  const { center, heading } = patch.corridor, before = rowsNear(patch, false), after = rowsNear(patch); let clear = 0;
  for (const along of [-14, -7, 0, 7, 14]) for (const across of [-3, 0, 3]) {
    const x = center.x + along * Math.cos(heading) + across * Math.sin(heading), z = center.z - along * Math.sin(heading) + across * Math.cos(heading);
    if (base.sample(x, z).substrate !== 'rock' && ring(x, z, .7).every(p => support(after, p.x, p.z) <= base.floorSurface(p.x, p.z).height + .035)) clear++;
  }
  assert.equal(clear, 14); assert.equal(clear, patch.corridor.clearSamples);
  for (const p of plans) {
    const b = base.chunk(p.cx, p.cz).bounds, oldRows = rowsNear(p, false), newRows = rowsNear(p);
    for (const offset of [-.5, 0, 5.5]) for (const middle of [18, 32, 48]) for (const [x, z] of [
      [b.minX + offset, b.minZ + middle], [b.maxX - offset, b.minZ + middle],
      [b.minX + middle, b.minZ + offset], [b.minX + middle, b.maxZ - offset]])
      assert.equal(support(newRows, x, z), support(oldRows, x, z), `${p.id} boundary support`);
  }
  assert.ok(before.filter(e => e.kind === 'driftwood').length > 0, 'actual neighbouring grounded prop participates');
  for (const prop of after.filter(e => ['driftwood', 'bottle'].includes(e.kind))) {
    assert.equal(JSON.stringify(prop), JSON.stringify(before.find(e => e.id === prop.id)));
    assert.equal(prop.y, livingShallowsPropGroundY(base, prop));
  }
});

function checkOwnerBudgets() {
  for (const p of plans) {
    for (const [kind, cap] of Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS)) assert.ok(p.elements.filter(e => e.kind === kind).length <= cap);
    assert.equal(p.elements.some(e => ['animal', 'food', 'resource'].includes(e.kind)), false);
    assert.ok(p.displayScope.includes('initialized separately'));
    const oldRows = rowsNear(p, false), newRows = rowsNear(p), baseIds = new Set(base.chunk(p.cx, p.cz).elements.map(e => e.id));
    let protectedCount = 0;
    for (const s of livingShallowsSoftActivitySites(base.seed, p.cx, p.cz)) {
      const state = base.sample(s.x, s.z);
      if (state.substrate === 'rock' || state.depthM > 20 || !ring(s.x, s.z, .6).every(q => support(oldRows, q.x, q.z) <= base.floorSurface(q.x, q.z).height + .035)) continue;
      assert.ok(ring(s.x, s.z, .6).every(q => support(newRows, q.x, q.z) <= base.floorSurface(q.x, q.z).height + .035));
      for (const grass of p.elements.filter(e => e.kind === 'seagrass' && !baseIds.has(e.id)))
        assert.ok(Math.hypot(grass.x - s.x, grass.z - s.z) >= grass.scale.x * .5 + .32);
      protectedCount++;
    }
    assert.ok(protectedCount >= 8);
  }
}

test('validation rejects incompatible records, removed old roots, false geometry, moved lattice roots and tampered corridors', () => {
  const reject = (plan, mutate) => { const p = structuredClone(plan); mutate(p); assert.equal(validateLivingHabitatMosaic(p, base), false); };
  reject(patch, p => p.seed = 'living-shallows-v1|string:73'); reject(patch, p => p.baseStamp += 'changed');
  reject(patch, p => p.elements.push(structuredClone(p.elements[0])));
  reject(patch, p => p.elements = p.elements.filter(e => e.id !== p.retainedRockIds[0]));
  reject(patch, p => p.elements.find(e => p.newRockIds.includes(e.id)).x = p.cx * 64 + 6);
  reject(patch, p => p.elements.find(e => p.newRockIds.includes(e.id)).profile = 'display-only');
  reject(patch, p => p.elements.find(e => p.newRockIds.includes(e.attachmentId) && e.kind === 'coral').y += .1);
  reject(patch, p => p.corridor.clearSamples--); reject(patch, p => p.overview.center.x = Infinity);
  reject(meadow, p => { const e = p.elements.find(e => e.kind === 'seagrass'); e.x += .2; e.y = base.floorSurface(e.x, e.z).height; });
  reject(meadow, p => p.meadow.rootsWithin9m++);
  const oldRoot = base.chunk(4, 8).elements.find(e => e.kind === 'seagrass').id;
  reject(establishedMeadow, p => p.elements = p.elements.filter(e => e.id !== oldRoot));
  reject(patch, p => p.elements.find(e => e.kind === 'rubble').scale.x = NaN);
  assert.equal(validateLivingHabitatMosaic(null, base), false);
});

function checkCacheReplay() {
  const before = plans.map(p => JSON.stringify(p)), terrain = [base.floorSurface(1248.13, 276.72), base.floorSurface(1386.31, 480.44)];
  for (let i = 0; i < 40; i++) base.chunk(100 + i, -100 - i);
  assert.ok(base.cacheStats().size <= 32);
  for (const [i, [cx, cz, theme]] of owners.entries()) {
    assert.equal(JSON.stringify(base.chunk(cx, cz)), originals.get(`${cx},${cz}`));
    assert.equal(JSON.stringify(createLivingHabitatMosaic(base, cx, cz, { theme })), before[i]);
    for (const e of plans[i].elements.filter(e => e.id.startsWith(`living-mosaic:${cx},${cz}:grass:`))) {
      const [gx, gz] = e.id.split(':').at(-1).split(',').map(Number);
      assert.ok(Math.abs(e.x - gx * 3) <= .55 && Math.abs(e.z - gz * 3) <= .55, 'world lattice does not restart at the owner');
    }
  }
  assert.deepEqual([base.floorSurface(1248.13, 276.72), base.floorSurface(1386.31, 480.44)], terrain);
}
