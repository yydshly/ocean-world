import test from 'node:test';
import assert from 'node:assert/strict';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createKelpForestBeltPlans, validateKelpForestBeltPlan, kelpForestBeltRoute } from '../src/kelpForestBelt.js';
import { createKelpSeascapePlans, validateKelpSeascapePlan, kelpSeascapeRoute,
  KELP_SEASCAPE_ANCHOR, KELP_SEASCAPE_OWNERS, KELP_SEASCAPE_ROUTE_STOPS } from '../src/kelpSeascape.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

const base = createKelpOceanGenerator('42'), cx = 6, cz = -2, original = [], originals = new Map();
for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) {
  const c = base.chunk(cx + dx, cz + dz); original.push(c); originals.set(c.id, c);
}
const before = original.map(c => JSON.stringify(c)), plans = createKelpSeascapePlans(base, cx, cz), group = plans[0].group;
const added = plans.flatMap(p => p.elements.filter(e => p.addedRootIds.includes(e.id)));

test('one aligned 384 by 128m canonical composition uses twelve real native owners and finite admitted additional roots', t => {
  assert.deepEqual(KELP_SEASCAPE_ANCHOR, { cx, cz }); assert.deepEqual(plans.map(p => p.id), KELP_SEASCAPE_OWNERS);
  assert.deepEqual(group.ownerIds, KELP_SEASCAPE_OWNERS); assert.equal(group.widthM, 384); assert.equal(group.depthM, 128);
  assert.equal(group.floorUnchanged, true); assert.equal(group.ownerMarginM, 10);
  assert.equal(group.nativeRootCount, 252); assert.equal(group.nativeRockCount, 268); assert.equal(group.nativeFormationCount, 0);
  assert.equal(group.addedRootCount, added.length); assert.equal(added.length, 49); assert.equal(group.rootClusterCount, 12);
  assert.ok(Object.isFrozen(plans)); assert.ok(Object.isFrozen(added[0].anchor));
  for (const p of plans) {
    assert.equal(p.version, 2); assert.equal(p.theme, 'kelp-seascape'); assert.deepEqual(p.addedRockIds, []);
    assert.ok(p.elements.filter(e => e.kind === 'kelp').length <= 72);
    assert.equal(new Set(p.elements.map(e => e.id)).size, p.elements.length);
    assert.ok(p.addedRootIds.every(id => p.elements.some(e => e.id === id && e.kind === 'kelp')));
  }
  assert.deepEqual(createKelpSeascapePlans(createKelpOceanGenerator('42'), cx, cz), plans);
  assert.throws(() => createKelpSeascapePlans(base, 7, cz), TypeError);
  assert.throws(() => createKelpSeascapePlans(base, cx, -1), TypeError);
  assert.throws(() => createKelpSeascapePlans(createKelpOceanGenerator('42', { supportVersion: 1 }), cx, cz), TypeError);
  assert.throws(() => createKelpSeascapePlans(base, 12, -2), RangeError);
  t.diagnostic(`native complete source: 252 roots/268 rocks; admitted additions=${added.length} roots on ${group.rootClusterCount} actual native hard-cap groups`);
});

test('new roots touch real native rock triangles and conservative holdfast disks, keep spacing, and stop below the surface', () => {
  const allRoots = [];
  for (let z = cz - 1; z <= cz + 2; z++) for (let x = cx - 1; x <= cx + 6; x++)
    allRoots.push(...base.chunk(x, z).elements.filter(e => e.kind === 'kelp'));
  for (const p of plans) {
    const chunk = originals.get(p.id), hosts = new Map(chunk.elements.filter(e => e.kind === 'rock').map(e => [e.id, e]));
    for (const e of p.elements.filter(e => p.addedRootIds.includes(e.id))) {
      const host = hosts.get(e.hostId); assert.ok(host);
      assert.equal(e.y, oceanRockHeight(host, e.x, e.z));
      const actual = base.supportAt(e.x, e.z); assert.equal(actual.elementId, host.id); assert.equal(actual.substrate, 'rock'); assert.equal(actual.height, e.y);
      assert.ok(e.y > base.floorSurface(e.x, e.z).height + .035);
      assert.ok(e.x >= chunk.origin.x + 10 && e.x <= chunk.origin.x + 54);
      assert.ok(e.z >= chunk.origin.z + 10 && e.z <= chunk.origin.z + 54);
      assert.ok(base.surfaceY - e.y >= 5 && base.surfaceY - e.y <= 25);
      assert.ok(e.lengthM > 0); assert.ok(e.y + e.lengthM < base.surfaceY - .45);
      assert.deepEqual({ ...e.anchor, phase: 0 }, { id: e.id, x: e.x, z: e.z, y: e.y, lengthM: e.lengthM, phase: 0, hostId: host.id });
      for (let i = 0; i < 8; i++) assert.equal(base.supportAt(e.x + Math.cos(i * Math.PI / 4) * .10,
        e.z + Math.sin(i * Math.PI / 4) * .10).elementId, host.id);
      assert.ok(allRoots.every(q => Math.hypot(q.x - e.x, q.z - e.z) >= .70)); allRoots.push(e);
    }
  }
});

test('four native stages cite actual clusters, exposed rockbed, surveyed clear sediment and root-free outer water', t => {
  assert.deepEqual(group.route, KELP_SEASCAPE_ROUTE_STOPS); assert.equal(kelpSeascapeRoute(base), group.route);
  assert.deepEqual(group.route.map(p => p.id), ['kelp-scene-forest', 'kelp-scene-rockbed', 'kelp-scene-opening', 'kelp-scene-outer']);
  assert.equal(group.forestOwnerId, '7,-1'); assert.equal(group.rockbedOwnerId, '9,-1');
  assert.equal(group.openingOwnerId, '10,-2'); assert.equal(group.outerOwnerId, '11,-1');
  const roots = plans.flatMap(p => p.elements.filter(e => e.kind === 'kelp'));
  assert.ok(roots.filter(e => Math.hypot(e.x - group.forestCenter.x, e.z - group.forestCenter.z) < 32).length >= 24);
  const bed = group.rockbed, rocks = originals.get(bed.ownerId).elements.filter(e => bed.sourceRockIds.includes(e.id));
  assert.equal(rocks.length, 7); assert.equal(base.supportAt(bed.center.x, bed.center.z).elementId, bed.hostId);
  assert.equal(base.supportAt(bed.center.x, bed.center.z).height, bed.actualHardHeight);
  for (const clearing of [group.opening, group.outer]) {
    assert.equal(clearing.samples.length, clearing.clearSamples);
    const minRootDistance = Math.hypot(clearing.widthM, clearing.depthM) * .5 + 2;
    assert.ok(roots.every(e => Math.hypot(e.x - clearing.center.x, e.z - clearing.center.z) >= minRootDistance));
    for (const p of clearing.samples) {
      const native = base.supportAt(p.x, p.z); assert.equal(native.substrate, 'sediment'); assert.equal(p.y, native.height);
      for (let i = 0; i < 8; i++) assert.equal(base.supportAt(p.x + Math.cos(i * Math.PI / 4) * .6,
        p.z + Math.sin(i * Math.PI / 4) * .6).substrate, 'sediment');
    }
  }
  assert.equal(group.opening.widthM, 16); assert.equal(group.opening.depthM, 8);
  for (const [i, stop] of group.route.entries()) {
    const id = [group.forestOwnerId, group.rockbedOwnerId, group.openingOwnerId, group.outerOwnerId][i];
    assert.equal(`${Math.floor(stop.x / 64)},${Math.floor(stop.z / 64)}`, id);
    assert.equal(`${Math.floor((stop.x - 6) / 64)},${Math.floor(stop.z / 64)}`, id);
  }
  t.diagnostic(`clear native sediment opening=${group.opening.widthM} by ${group.opening.depthM}m, ${group.opening.clearSamples} positions each with nine .6m body-support probes`);
});

test('all original native beds, environmental fields, hosts, root anchors and formation descriptors remain exact in public v2 source', () => {
  const facade = createKelpOceanGenerator('42', { forestBelt: true }), methods = ['sample', 'floorSurface', 'floorVertex', 'supportAt', 'supportNormal', 'heightAt', 'heightForCamera', 'landscapeAt'];
  const points = group.route.flatMap(p => [[p.x, p.z], [p.x - 6, p.z], [p.x + 3.25, p.z + 2.75]])
    .concat([[384, -64], [448, -128], [768, 0], [0, 0], [999999.5, -111111.3]]);
  const physical = points.map(([x, z]) => methods.map(method => structuredClone(facade[method](x, z))));
  facade.setForestPlans(plans);
  for (let i = 0; i < points.length; i++) assert.deepEqual(methods.map(method => structuredClone(facade[method](...points[i]))), physical[i]);
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i], old = original[i], c = facade.chunk(p.cx, p.cz);
    assert.equal(p.baseStamp, before[i]); assert.deepEqual(p.elements.slice(0, old.elements.length), old.elements);
    assert.equal(JSON.stringify(base.chunk(p.cx, p.cz)), before[i]);
    assert.equal(c.counts.kelp, old.counts.kelp + p.addedRootIds.length); assert.equal(c.counts.rock, old.counts.rock);
    assert.equal(c.composition, facade.baseGenerator.chunk(p.cx, p.cz).composition);
    assert.equal(c.forestBeltSummary.version, 2); assert.equal(c.forestBeltSummary.widthM, 384); assert.equal(c.forestBeltSummary.depthM, 128);
  }
  for (let i = 0; i < 40; i++) base.chunk(100 + i, -100 - i);
  assert.ok(base.cacheStats().chunks <= 32); assert.deepEqual(createKelpSeascapePlans(base, cx, cz), plans);
});

test('temporary whole-scene views replace the bounded source without publication; legacy v1 plans and two-stop route remain exact', () => {
  const facade = createKelpOceanGenerator('42', { forestBelt: true }), v1 = createKelpForestBeltPlans(facade, -6, -2), oldRoute = kelpForestBeltRoute(facade);
  assert.deepEqual(v1.map(p => p.addedRootIds.length), [0, 0, 10, 6]);
  assert.deepEqual(v1.map(p => p.role), ['clearing', 'native', 'forest', 'edge']);
  assert.deepEqual(facade.forestRouteStops, oldRoute); assert.equal(facade.forestRouteStops.length, 2);
  assert.deepEqual(facade.kelpSeascapeRouteStops, group.route); assert.equal(facade.forestBeltRevision, 0);
  facade.setForestPlans(v1); const published = facade.forestBeltPlan(-6, -1), revision = facade.forestBeltRevision;
  assert.throws(() => facade.withForestPlans(plans, view => {
    assert.equal(view.forestBeltCandidatesActive, true); assert.equal(view.forestBeltPlan(7, -1), undefined);
    assert.equal(view.forestBeltRevision, revision); assert.equal(view.chunk(7, -1).counts.kelp, 64);
    assert.equal(view.chunk(-6, -1), view.baseGenerator.chunk(-6, -1));
    throw new Error('failed atomic admission');
  }), /failed atomic admission/);
  assert.equal(facade.forestBeltPlan(-6, -1), published); assert.equal(facade.forestBeltRevision, revision);
  assert.equal(facade.forestBeltRegistryStats().size, 4);
  facade.setForestPlans([...v1, ...plans]); assert.equal(facade.forestBeltRegistryStats().size, 16);
  assert.equal(facade.forestBeltPlan(-6, -1), published);
  assert.deepEqual(facade.chunk(-6, -1).forestBeltSummary, {
    version: 1, groupId: v1[0].group.id, role: 'forest', addedRootCount: 10, widthM: 128, floorUnchanged: true });
  assert.ok(v1.every(p => validateKelpForestBeltPlan(p, facade.baseGenerator)));
  assert.equal(facade.setForestPlans(structuredClone([...v1, ...plans]).reverse()), false);
  assert.deepEqual(facade.forestRouteStops, oldRoute);
  facade.setForestPlans(plans); assert.equal(facade.forestBeltRegistryStats().size, 12);
  assert.equal(facade.forestBeltPlan(-6, -1), undefined); facade.clearCache();
  assert.deepEqual(facade.chunk(7, -1).elements, plans[7].elements);
});

test('canonical save validation rejects fabricated roots, host references, caps, clearance surveys and group provenance', () => {
  for (const p of plans) assert.ok(validateKelpSeascapePlan(base, structuredClone(p)));
  const p = plans[7], reject = mutate => { const q = structuredClone(p); mutate(q); assert.equal(validateKelpSeascapePlan(base, q), false); };
  reject(q => q.elements.at(-1).y += .01); reject(q => q.elements.at(-1).lengthM += 1);
  reject(q => q.elements.at(-1).hostId = 'fake-cap'); reject(q => q.elements.at(-1).anchor.phase += 1);
  reject(q => q.elements[0].y += .01); reject(q => q.elements.shift()); reject(q => q.addedRootIds.pop());
  reject(q => q.addedRockIds.push('invented-rock')); reject(q => q.group.ownerIds.pop());
  reject(q => q.group.opening.samples[0].y += .01); reject(q => q.group.opening.widthM += 1);
  reject(q => q.group.rockbed.sourceRockIds.push('invented-host')); reject(q => q.group.route[0].x += 1);
  reject(q => q.baseStamp += ':wrong'); reject(q => q.seed = 42);
  assert.equal(validateKelpSeascapePlan(base, null), false);
  assert.equal(validateKelpSeascapePlan(createKelpOceanGenerator(42), p), false);
  const facade = createKelpOceanGenerator('42', { forestBelt: true }); facade.setForestPlans(plans);
  const revision = facade.forestBeltRevision, forged = structuredClone(plans); forged[7].elements.at(-1).y += 1;
  assert.throws(() => facade.setForestPlans(forged), TypeError); assert.equal(facade.forestBeltRevision, revision);
  assert.throws(() => facade.setForestPlans([...plans, plans[0]]), TypeError);
  assert.throws(() => facade.setForestPlans(Array(26).fill(plans[0])), TypeError);
});
