import test from 'node:test';
import assert from 'node:assert/strict';
import { meadowAnimalBeltMarked, validateMeadowAnimalBelt, meadowAnimalBeltSites, meadowAnimalBeltRank, meadowAnimalBeltAllocation } from '../src/meadowAnimalBelt.js';

function fixture({ cx = 228, cz = 4, short = false } = {}) {
  const seed = 'belt-fixture', group = { id: 'seagrass-meadow-region:228,4', cx: 228, cz: 4, seed,
    ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${228 + dx},${4 + dz}`)),
    routePath: [{ x: 14592, y: -6, z: 320 }, { x: 14592 + (short ? 32 : 384), y: -6, z: 320 }] };
  const r = { id: `${cx},${cz}`, cx, cz, meadowAnimalBeltVersion: 1,
    meadowAnimalBelt: { version: 1, initializedAtSec: 0, groupId: '228,4', recipe: 'route-neighborhood-v1' } };
  const plan = { version: 9, theme: 'seagrass-meadow-region', id: r.id, cx, cz, seed, group },
    chunk = { id: r.id, cx, cz, ridgePlan: plan, elements: [{ id: 'near-grass', kind: 'seagrass', x: 14608, z: 312 }] };
  return { r, group, plan, chunk, g: { profile: 'living-shallows-v1', seed, chunk: () => chunk } };
}

test('fresh policy marker requires the actual current twelve-owner v9 group and exact metadata', () => {
  const f = fixture(); assert.ok(meadowAnimalBeltMarked(f.r)); assert.ok(validateMeadowAnimalBelt(f.r, f.g));
  assert.equal(meadowAnimalBeltMarked({}), false); assert.ok(validateMeadowAnimalBelt({}, { chunk() { throw Error('old path must not query'); } }));
  for (const mutate of [f => { delete f.r.meadowAnimalBelt; }, f => { delete f.r.meadowAnimalBeltVersion; },
    f => { f.r.meadowAnimalBelt.groupId = '234,4'; }, f => { f.r.meadowAnimalBelt.initializedAtSec = .1; },
    f => { f.r.meadowAnimalBelt.extra = true; }, f => { f.r.meadowAnimalBeltUnknown = 1; },
    f => { f.plan.version = 8; }, f => { f.group.ownerIds.pop(); }, f => { f.group.routePath[0].x = NaN; },
    f => { f.plan.seed = 'other'; }]) { const bad = fixture(); mutate(bad); assert.equal(validateMeadowAnimalBelt(bad.r, bad.g), false); assert.deepEqual(meadowAnimalBeltSites(bad.g, bad.r), []); }
});

test('route-border candidates cover the first fifty metres with whole-owner room, limited count and stable identities', () => {
  const first = fixture(), upper = fixture({ cz: 5 });
  for (const f of [first, upper]) {
    const before = structuredClone({ r: f.r, group: f.group }), rows = meadowAnimalBeltSites(f.g, f.r);
    assert.ok(rows.length > 0 && rows.length <= 24); assert.ok(rows.some(p => p.sM < 50));
    assert.deepEqual(meadowAnimalBeltSites(f.g, f.r), rows); assert.equal(new Set(rows.map(p => p.id)).size, rows.length);
    for (const p of rows) { assert.equal(p.id, p.siteId); assert.ok(Math.abs(p.z - 320) <= 10);
      assert.ok(p.x >= f.r.cx * 64 + 6 && p.x <= (f.r.cx + 1) * 64 - 6); assert.ok(p.z >= f.r.cz * 64 + 6 && p.z <= (f.r.cz + 1) * 64 - 6); }
    assert.deepEqual(f.r, before.r); assert.deepEqual(f.group, before.group);
  }
});

test('rank prioritizes actual route-near native hosts and candidates without moving or mutating them', () => {
  const f = fixture(), rows = [{ id: 'far', x: 14600, z: 280 }, { id: 'host', hostId: 'near-grass' },
    { id: 'closest', position: { x: 14612, z: 318 } }], before = structuredClone(rows);
  assert.deepEqual(meadowAnimalBeltRank(f.g, f.r, rows).map(p => p.id), ['closest', 'host', 'far']); assert.deepEqual(rows, before);
  const old = { id: f.r.id, cx: f.r.cx, cz: f.r.cz }; assert.deepEqual(meadowAnimalBeltRank({ chunk() { throw Error('unused'); } }, old, rows), rows);
  assert.deepEqual(meadowAnimalBeltSites(f.g, old), []); assert.equal(meadowAnimalBeltAllocation(f.g, old), null);
});

test('twenty total records reserve actual school, grass-edge and near-bottom room only beside the main route', () => {
  const f = fixture(), quota = meadowAnimalBeltAllocation(f.g, f.r);
  assert.deepEqual(quota, { native: 2, guild: 1, openWater: 1, diversity: 2, benthic: 4, meadow: 2, turtles: 1, shoal: 7, total: 20 });
  assert.equal(Object.entries(quota).filter(([k]) => k !== 'total').reduce((n, [, v]) => n + v, 0), 20);
  const away = fixture({ cx: 233, cz: 5, short: true }); assert.ok(validateMeadowAnimalBelt(away.r, away.g));
  assert.deepEqual(meadowAnimalBeltSites(away.g, away.r), []); assert.equal(meadowAnimalBeltAllocation(away.g, away.r), null);
});
