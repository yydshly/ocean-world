import test from 'node:test';
import assert from 'node:assert/strict';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createKelpForestBeltPlans, validateKelpForestBeltPlan, kelpForestBeltRoute } from '../src/kelpForestBelt.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

const fixture = () => {
  const base = createKelpOceanGenerator('42');
  return { base, plans: createKelpForestBeltPlans(base, -6, -2) };
};
const clone = value => structuredClone(value);

test('natural 128m forest/edge/clearing keeps every native descriptor and admits sixteen real rock-cap roots', () => {
  const { base, plans } = fixture();
  assert.deepEqual(plans.map(p => p.id), ['-6,-2', '-5,-2', '-6,-1', '-5,-1']);
  assert.deepEqual(plans.map(p => p.role), ['clearing', 'native', 'forest', 'edge']);
  assert.deepEqual(plans.map(p => p.addedRootIds.length), [0, 0, 10, 6]);
  assert.equal(plans[0].group.widthM, 128); assert.equal(plans[0].group.rootClusterCount, 5);
  assert.ok(plans[0].group.forestCoverMax - plans[0].group.forestCoverMin >= .25);
  const allRoots = [];
  for (let z = -3; z <= 0; z++) for (let x = -7; x <= -4; x++)
    allRoots.push(...base.chunk(x, z).elements.filter(e => e.kind === 'kelp'));
  for (const plan of plans) {
    const old = base.chunk(plan.cx, plan.cz);
    assert.equal(validateKelpForestBeltPlan(plan, base), true);
    assert.equal(plan.baseStamp, JSON.stringify(old));
    assert.equal(JSON.stringify(plan.elements.slice(0, old.elements.length)), JSON.stringify(old.elements));
    if (!plan.addedRootIds.length) assert.equal(JSON.stringify(plan.elements), JSON.stringify(old.elements));
    const hosts = new Map(old.elements.filter(e => e.kind === 'rock').map(e => [e.id, e]));
    for (const plant of plan.elements.slice(old.elements.length)) {
      assert.equal(plant.kind, 'kelp'); assert.ok(hosts.has(plant.hostId));
      assert.equal(plant.y, oceanRockHeight(hosts.get(plant.hostId), plant.x, plant.z));
      assert.equal(base.supportAt(plant.x, plant.z).elementId, plant.hostId);
      assert.equal(base.supportAt(plant.x, plant.z).height, plant.y);
      assert.ok(plant.x >= old.origin.x + 10 && plant.x <= old.origin.x + 54);
      assert.ok(plant.z >= old.origin.z + 10 && plant.z <= old.origin.z + 54);
      assert.ok(plant.y + plant.lengthM < base.surfaceY - .45);
      assert.ok(plant.lengthM > 11 && plant.lengthM < 14);
      assert.ok(allRoots.every(root => Math.hypot(root.x - plant.x, root.z - plant.z) >= .70));
      allRoots.push(plant);
    }
  }
  assert.ok(Object.isFrozen(plans) && Object.isFrozen(plans[0].group.clusters) && Object.isFrozen(plans[2].elements.at(-1).anchor));
  assert.deepEqual(createKelpForestBeltPlans(createKelpOceanGenerator('42'), -6, -2), plans);
  assert.throws(() => createKelpForestBeltPlans(base, -5, -2), TypeError);
  assert.throws(() => createKelpForestBeltPlans(base, 0, 0), RangeError);
  assert.equal(validateKelpForestBeltPlan(plans[0], createKelpOceanGenerator(42)), false);
});

test('opt-in facade preserves exact original bed, environment and solids before and after forest publication', () => {
  const g = createKelpOceanGenerator('42', { forestBelt: true }), base = g.baseGenerator;
  assert.equal(Object.hasOwn(createKelpOceanGenerator('42'), 'forestRouteStops'), false);
  const plans = createKelpForestBeltPlans(base, -6, -2);
  for (const p of plans) assert.equal(g.chunk(p.cx, p.cz), base.chunk(p.cx, p.cz));
  const points = [[-351, -104], [-345.592, -29.372], [-299, -15], [-320, -64], [0, 0], [1000245, -999911]];
  const snapshot = points.map(([x,z]) => ['sample', 'floorSurface', 'floorVertex', 'supportAt', 'supportNormal', 'heightAt', 'heightForCamera', 'landscapeAt']
    .map(method => clone(base[method](x, z))));
  assert.equal(g.setForestPlans(plans), true); assert.equal(g.forestBeltRevision, 1);
  for (let i = 0; i < points.length; i++) {
    const [x,z] = points[i];
    assert.deepEqual(['sample', 'floorSurface', 'floorVertex', 'supportAt', 'supportNormal', 'heightAt', 'heightForCamera', 'landscapeAt']
      .map(method => clone(g[method](x, z))), snapshot[i]);
  }
  for (const p of plans) {
    const rendered = g.chunk(p.cx, p.cz), original = base.chunk(p.cx, p.cz);
    assert.equal(rendered.counts.kelp, original.counts.kelp + p.addedRootIds.length);
    assert.equal(rendered.counts.rock, original.counts.rock); assert.equal(rendered.counts.formation, original.counts.formation);
    assert.equal(rendered.composition, original.composition); assert.equal(rendered.forestBeltPlan, p);
  }
  assert.equal(g.setForestPlans(clone(plans).reverse()), false); assert.equal(g.forestBeltRevision, 1);
  g.clearCache(); assert.deepEqual(g.chunk(-6,-1).elements, plans[2].elements);
});

test('temporary birth views and invalid registry replacements never publish partial plans or revisions', () => {
  const g = createKelpOceanGenerator('42', { forestBelt: true }), plans = createKelpForestBeltPlans(g, -6, -2);
  const original = g.chunk(-6,-1);
  g.withForestPlans(plans, view => {
    assert.equal(view.chunk(-6,-1).counts.kelp, 25); assert.equal(view.forestBeltCandidatesActive, true);
    assert.equal(view.forestBeltPlan(-6,-1), undefined); assert.equal(view.forestBeltRevision, 0);
    assert.throws(() => view.setForestPlans(plans), /temporary/);
    assert.throws(() => view.withForestPlans([plans[0]], () => { throw new Error('birth failed'); }), /birth failed/);
    assert.equal(view.chunk(-6,-1).counts.kelp, 25);
  });
  assert.equal(g.chunk(-6,-1), original); assert.equal(g.forestBeltCandidatesActive, false);
  assert.throws(() => g.withForestPlans(plans, async () => {}), /synchronous/);
  assert.throws(() => g.withForestPlans(plans, () => Promise.resolve()), /asynchronous/);
  assert.equal(g.forestBeltRevision, 0); assert.equal(g.forestBeltRegistryStats().size, 0);
  g.setForestPlans(plans); const published = g.forestBeltPlan(-6,-1);
  const corrupt = clone(plans); corrupt[2].elements.at(-1).lengthM += 1;
  for (const invalid of [corrupt, [...plans, plans[0]], Array(26).fill(plans[0])]) {
    assert.throws(() => g.setForestPlans(invalid), TypeError);
    assert.equal(g.forestBeltRevision, 1); assert.equal(g.forestBeltPlan(-6,-1), published);
  }
  assert.equal(g.setForestPlans([clone(plans[2])]), true);
  assert.equal(g.forestBeltPlan(-6,-1), published, 'unchanged saved plan retains its public identity for resource reuse');
  assert.equal(g.forestBeltRegistryStats().size, 1); assert.equal(g.forestBeltPlan(-5,-1), undefined);
  g.setForestPlans([]); assert.equal(g.chunk(-6,-1), g.baseGenerator.chunk(-6,-1));
});

test('native route derives one canonical belt without publication and surveys the unchanged sediment opening', () => {
  const g = createKelpOceanGenerator('42', { forestBelt: true }), route = g.forestRouteStops;
  assert.equal(route, kelpForestBeltRoute(g.baseGenerator)); assert.equal(g.forestRouteStops, route);
  assert.deepEqual(route.map(p => p.id), ['forest-belt-interior', 'forest-belt-opening']);
  assert.equal(g.forestBeltRegistryStats().size, 0); assert.equal(g.forestBeltRevision, 0);
  const plans = createKelpForestBeltPlans(g, -6, -2), group = plans[0].group;
  assert.deepEqual({x:route[0].x,z:route[0].z}, group.forestCenter);
  assert.deepEqual({x:route[1].x,z:route[1].z}, group.clearingCenter);
  assert.ok(Math.hypot(route[0].x-route[1].x,route[0].z-route[1].z) > 60);
  const p = route[1];
  assert.equal(g.supportAt(p.x,p.z).substrate, 'sediment');
  for (let i = 0; i < 8; i++) assert.equal(g.supportAt(p.x+3*Math.cos(i*Math.PI/4),p.z+3*Math.sin(i*Math.PI/4)).substrate, 'sediment');
  const clearing = plans.find(plan=>plan.id===group.clearingOwnerId);
  assert.equal(clearing.addedRootIds.length, 0); assert.equal(clearing.elements.filter(e=>e.kind==='kelp').length, 2);
  assert.equal(group.openingSurvey.scope, 'finite sediment support probes; no flora removed');
});

test('two disjoint valid sixteen-owner birth windows replace temporary scenery without exceeding the registry cap', () => {
  const g = createKelpOceanGenerator('42', { forestBelt: true });
  const groups = [[-10,-12],[-6,-12],[6,-12],[-6,-10],[2,-10],[6,-10],[0,-8],[2,-8]];
  const first = groups.slice(0,4).flatMap(([x,z])=>createKelpForestBeltPlans(g,x,z));
  const second = groups.slice(4).flatMap(([x,z])=>createKelpForestBeltPlans(g,x,z));
  assert.equal(new Set([...first,...second].map(p=>p.id)).size, 32);
  g.setForestPlans(first); const saved = g.forestBeltRegistryStats();
  g.withForestPlans(second, view => {
    for (const p of second) assert.equal(view.chunk(p.cx,p.cz).forestBeltPlan, p);
    for (const p of first) assert.equal(view.chunk(p.cx,p.cz).forestBeltPlan, undefined);
    assert.deepEqual(view.forestBeltRegistryStats(), saved, 'public registry remains the original committed window');
    assert.equal(view.forestBeltRevision, 1);
  });
  assert.deepEqual(g.forestBeltRegistryStats(), saved);
  for (const p of first) assert.equal(g.chunk(p.cx,p.cz).forestBeltPlan, p);
  g.setForestPlans(second); assert.equal(g.forestBeltRevision, 2);
  assert.equal(g.forestBeltRegistryStats().size, 16);
  assert.equal(g.forestBeltPlan(first[0].cx,first[0].cz), undefined);
});
