import test from 'node:test';
import assert from 'node:assert/strict';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingHabitatMosaic } from '../src/livingHabitatMosaic.js';
import { createLivingHabitatBeltPlans, sampleLivingHabitatBelt, validateLivingHabitatBeltPlan } from '../src/livingHabitatBelt.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

const seed = livingShallowsSeed('42'), base = createLivingShallowsGenerator(seed);
const origin = [74, 2], plans = createLivingHabitatBeltPlans(base, ...origin), group = plans[0].group;
const count = (rows, kind) => rows.filter(e => e.kind === kind).length;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);

test('one deterministic four-owner belt contains a real reef, complete meadow and surveyed native sediment opening', () => {
  assert.deepEqual(plans.map(p => p.id), ['74,2', '75,2', '74,3', '75,3']);
  assert.deepEqual(createLivingHabitatBeltPlans(createLivingShallowsGenerator(seed), ...origin), plans);
  assert.ok(Object.isFrozen(plans) && plans.every(p => Object.isFrozen(p.elements)));
  assert.equal(plans.filter(p => p.componentTheme === 'patch-reef').length, 1);
  assert.equal(plans.filter(p => p.componentTheme === 'meadow-edge').length, 1);
  assert.equal(plans.filter(p => p.componentTheme === 'native').length, 2);
  for (const p of plans) {
    assert.deepEqual(p.group, group); assert.equal(p.version, 5); assert.ok(validateLivingHabitatBeltPlan(p, base));
    assert.equal(p.habitatComposition.samples, 64);
    assert.equal(Object.values(p.habitatComposition.habitats).reduce((sum, value) => sum + value, 0), 64);
  }
  const reef = plans.find(p => p.id === group.reefOwnerId), meadow = plans.find(p => p.id === group.meadowOwnerId);
  assert.equal(reef.newRockIds.length, 4);
  assert.equal(count(reef.elements, 'coral'), 20);
  assert.equal(count(meadow.elements, 'seagrass'), 210);
  assert.equal(group.addedMeadowRootCount, 210);
  assert.equal(group.corridor.lengthM, 28);
  assert.equal(group.corridor.openingM, 4);
  assert.equal(group.corridor.clearSamples, 45);
});

test('the composite reuses existing v2 habitat plans and retains complete native owners and protected boundary hosts', () => {
  for (const p of plans) {
    const chunk = base.chunk(p.cx, p.cz), final = new Map(p.elements.map(e => [e.id, e]));
    assert.equal(p.floorUnchanged, true); assert.equal(p.floorPatch, undefined);
    if (p.componentTheme === 'native') assert.deepEqual(p.elements, chunk.elements);
    else assert.deepEqual(p.elements, createLivingHabitatMosaic(base, p.cx, p.cz, { theme: p.componentTheme }).elements);
    const protectedHosts = new Set(chunk.elements.filter(e => e.kind === 'rock' &&
      Math.min(e.x - chunk.bounds.minX, chunk.bounds.maxX - e.x, e.z - chunk.bounds.minZ, chunk.bounds.maxZ - e.z) <=
      Math.hypot(e.scale.x, e.scale.z) * .5 + 6).map(e => e.id));
    for (const e of chunk.elements) if (protectedHosts.has(e.id) || protectedHosts.has(e.attachmentId) ||
      ['seagrass', 'driftwood', 'bottle'].includes(e.kind)) assert.deepEqual(final.get(e.id), e, `whole retained descriptor ${e.id}`);
  }
});

test('the native sand route checks a finite body envelope, rather than only counting a clear centre point', () => {
  const rows = plans.flatMap(p => p.elements), route = group.corridor;
  for (const p of route.samples) {
    assert.notEqual(base.sample(p.x, p.z).substrate, 'rock');
    near(p.y, base.floorSurface(p.x, p.z).height, 'unchanged sediment contact');
    for (let i = 0; i < 16; i++) {
      const x = p.x + Math.cos(i * Math.PI / 8) * route.bodyRadiusM, z = p.z + Math.sin(i * Math.PI / 8) * route.bodyRadiusM;
      const floor = base.floorSurface(x, z).height;
      for (const e of rows.filter(e => e.kind === 'rock')) {
        const height = oceanRockHeight(e, x, z); assert.ok(height === null || height <= floor + .035, `body clear of ${e.id}`);
      }
    }
    for (const e of rows.filter(e => e.kind === 'seagrass')) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) >=
      Math.max(e.scale.x, e.scale.z) * .5 + route.bodyRadiusM + .2, `sediment route clear of ${e.id}`);
  }
});

test('habitat fields use the actual added rock and meadow supports without changing floor or depth', () => {
  const reef = plans.find(p => p.id === group.reefOwnerId), meadow = plans.find(p => p.id === group.meadowOwnerId);
  const rock = reef.elements.find(e => e.id === reef.newRockIds[0]);
  assert.ok(oceanRockHeight(rock, rock.x, rock.z) > base.floorSurface(rock.x, rock.z).height + .06);
  const hard = sampleLivingHabitatBelt(base, reef, rock.x, rock.z), oldHard = base.sample(rock.x, rock.z);
  assert.equal(hard.substrate, 'rock'); assert.equal(hard.habitat, 'reef'); assert.equal(hard.rockiness, 1);
  assert.equal(hard.seagrassSuitability, 0); near(hard.floorY, oldHard.floorY, 'rock does not modify terrain');
  near(hard.depthM, oldHard.depthM, 'rock does not modify original depth forcing');
  const root = meadow.elements.filter(e => e.kind === 'seagrass').find(e =>
    Math.min(e.x - meadow.cx * 64, (meadow.cx + 1) * 64 - e.x, e.z - meadow.cz * 64, (meadow.cz + 1) * 64 - e.z) > 9);
  assert.ok(root);
  const grass = sampleLivingHabitatBelt(base, meadow, root.x, root.z), oldGrass = base.sample(root.x, root.z);
  assert.equal(grass.substrate, 'sand'); assert.equal(grass.habitat, 'seagrass'); assert.equal(grass.seagrassSuitability, .92);
  const cover = base.coverAt(root.x, root.z, grass); assert.equal(cover.hardBottom, 0); assert.ok(cover.seagrass > .9);
  near(grass.floorY, oldGrass.floorY, 'same planted sediment'); near(grass.depthM, oldGrass.depthM, 'same depth');
});

test('all original six-metre boundary bands and queries outside the owner keep the base habitat exactly', () => {
  for (const plan of plans) {
    const ox = plan.cx * 64, oz = plan.cz * 64;
    for (const offset of [0, 2, 6]) for (const n of [0, 16, 32, 48, 64])
      for (const [x, z] of [[ox + offset, oz + n], [ox + 64 - offset, oz + n], [ox + n, oz + offset], [ox + n, oz + 64 - offset]])
        assert.deepEqual(sampleLivingHabitatBelt(base, plan, x, z), base.sample(x, z));
    assert.deepEqual(sampleLivingHabitatBelt(base, plan, ox - 12, oz + 32), base.sample(ox - 12, oz + 32));
  }
});

test('saved plan validation rejects altered supports, group membership, route and a fifth terrain source', () => {
  const reef = plans.find(p => p.id === group.reefOwnerId);
  for (const mutate of [
    p => { p.elements.find(e => e.kind === 'rock').y += .1; },
    p => { p.group.ownerIds.pop(); },
    p => { p.group.corridor.samples[0].y += .01; },
    p => { p.floorPatch = { heights: [0] }; },
    p => { p.componentTheme = 'native'; },
    p => { p.group.cx += 2; },
  ]) { const changed = structuredClone(reef); mutate(changed); assert.equal(validateLivingHabitatBeltPlan(changed, base), false); }
  assert.equal(validateLivingHabitatBeltPlan(null, base), false);
});

test('unsuitable groups decline finitely, and invalid coordinate/world requests are rejected', () => {
  assert.throws(() => createLivingHabitatBeltPlans(base, 66, 2), RangeError);
  assert.throws(() => createLivingHabitatBeltPlans(base, 66, 2), RangeError);
  assert.throws(() => createLivingHabitatBeltPlans(base, 75, 2), TypeError);
  assert.throws(() => createLivingHabitatBeltPlans(base, 74, Infinity), TypeError);
  assert.throws(() => createLivingHabitatBeltPlans({ profile: 'reef' }, 74, 2), TypeError);
});
