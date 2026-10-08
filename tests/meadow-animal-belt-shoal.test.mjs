import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeLivingNetwork, tickLivingNetwork, livingNetworkBalance } from '../src/livingEcologyNetwork.js';
import { oceanShoalLifeRole, createOceanShoalLifePlan, initializeOceanShoalLife, validateOceanShoalLifeRecord, tickOceanShoalLife } from '../src/oceanShoalLife.js';
import { meadowAnimalBeltSites } from '../src/meadowAnimalBelt.js';

function fixture({ marked = true, seed = 'belt-fixture', floorY = -8, count = 0, plankton = .5 } = {}) {
  const group = { id: 'seagrass-meadow-region:228,4', cx: 228, cz: 4, seed,
    ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${228 + dx},${4 + dz}`)),
    routePath: [{ x: 14592, y: floorY + 2, z: 320 }, { x: 14976, y: floorY + 2, z: 320 }] };
  const r = { id: '228,4', cx: 228, cz: 4, ticks: 0, timeSec: 0, agents: [], turtleAgents: [], events: [], counters: { feeding: 0, deaths: 0 },
    resources: { algae: .3, plankton, detritus: .2 }, ledger: { initial: .5 + plankton, input: 0, ingested: 0, exported: 0 } };
  if (marked) Object.assign(r, { meadowAnimalBeltVersion: 1, meadowAnimalBelt: { version: 1, initializedAtSec: 0, groupId: '228,4', recipe: 'route-neighborhood-v1' } });
  const plan = { version: 9, theme: 'seagrass-meadow-region', id: r.id, cx: r.cx, cz: r.cz, seed, group },
    chunk = { id: r.id, cx: r.cx, cz: r.cz, origin: { x: 14592, z: 256 }, size: 64, elements: [], ridgePlan: plan };
  const g = { seed, profile: 'living-shallows-v1', surfaceY: 8,
    chunk(cx, cz) { return { ...chunk, id: `${cx},${cz}`, cx, cz, ...(cx !== r.cx || cz !== r.cz ? { ridgePlan: undefined } : {}) }; },
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }), sample: () => ({ substrate: 'sand', floorY, depthM: 8 - floorY }) };
  for (let i = 0; i < count; i++) r.agents.push({ id: `prior:${i}`, regionId: r.id, speciesId: 'green-chromis', alive: i % 2 === 0,
    sizeM: .1, energy: .5, position: { x: 14652, y: floorY + 1, z: 259 } });
  initializeLivingNetwork(r, chunk);
  return { r, g, chunk, group, surface: () => floorY, bed: () => floorY };
}
const options = f => ({ surface: f.surface, bed: f.bed });
function step(f, { network = true } = {}) { const env = { foodSupply: 0, currentMps: 0, hour: 10, lightAtDepth: 1 }; f.r.ticks++; f.r.timeSec = f.r.ticks * .1;
  if (network) tickLivingNetwork(f.r, env, .1); assert.ok(tickOceanShoalLife(f.r, f.g, .1, { ...options(f), environmentAt: () => env })); }

test('a fresh actual school starts near the route entrance above real bed with five to seven independent fish and no added shark', () => {
  const f = fixture(), before = structuredClone(f.r), p = createOceanShoalLifePlan(f.g, f.r, { ...options(f), availableSlots: 7 });
  assert.ok(oceanShoalLifeRole(f.r, f.g)); assert.equal(p.school.speciesId, 'blue-and-gold-fusilier'); assert.ok(p.placements.length >= 5 && p.placements.length <= 7);
  assert.ok(Math.hypot(p.school.home.x - f.group.routePath[0].x, p.school.home.y - f.group.routePath[0].y, p.school.home.z - f.group.routePath[0].z) < 14);
  assert.equal(p.school.home.y, f.g.floorSurface(p.school.home.x, p.school.home.z).height + 2.2);
  assert.ok(p.placements.every(a => a.speciesId !== 'blacktip-reef-shark')); assert.deepEqual(f.r, before);
  assert.deepEqual(createOceanShoalLifePlan(f.g, f.r, { ...options(f), availableSlots: 7 }), p);
  assert.ok(initializeOceanShoalLife(f.r, f.g, { ...options(f), fresh: true, maxAdded: 7 }));
  assert.ok(validateOceanShoalLifeRecord(f.r, f.g, options(f))); assert.deepEqual(f.r.resources, before.resources);
  assert.ok(Math.abs(livingNetworkBalance(f.r)) < 1e-9); assert.equal(new Set(f.r.agents.map(a => a.id)).size, p.placements.length);
});

test('depth, entire body clearance, all existing live/dead records and short available capacity still control admission', () => {
  for (const setup of [{ floorY: -24 }, { floorY: -8 }]) {
    const f = fixture(setup), surface = setup.floorY === -8 ? () => -5 : f.surface;
    const p = createOceanShoalLifePlan(f.g, f.r, { surface, bed: f.bed, availableSlots: 7 }); assert.deepEqual(p.placements, []);
  }
  const full = fixture({ count: 16 }); assert.ok(initializeOceanShoalLife(full.r, full.g, { ...options(full), fresh: true, maxAdded: 7 }));
  assert.equal(full.r.agents.length, 16); assert.equal(full.r.shoalLife.admissionSlots, 4); assert.deepEqual(full.r.shoalLife.addedIds, []);
  assert.ok(validateOceanShoalLifeRecord(full.r, full.g, options(full)));
});

test('real unchanged controller moves and removes existing plankton with exact birth roster and cold restore', () => {
  const f = fixture(); assert.ok(initializeOceanShoalLife(f.r, f.g, { ...options(f), fresh: true, maxAdded: 7 }));
  const initial = structuredClone(f.r.agents), roster = [...f.r.shoalLife.school.memberIds];
  for (let i = 0; i < 40; i++) step(f);
  assert.ok(f.r.agents.some((a, i) => Math.hypot(a.position.x - initial[i].position.x, a.position.z - initial[i].position.z) > .01));
  assert.ok(f.r.agents.some(a => a.lastFeedAt !== null)); assert.ok(f.r.resources.plankton < .5); assert.ok(Math.abs(livingNetworkBalance(f.r)) < 1e-9);
  assert.deepEqual(f.r.shoalLife.school.memberIds, roster); assert.ok(validateOceanShoalLifeRecord(structuredClone(f.r), f.g, options(f)));
  const before = structuredClone(f.r); assert.equal(initializeOceanShoalLife(f.r, f.g, { ...options(f), fresh: true }), false); assert.deepEqual(f.r, before);
});

test('malformed or erased policy metadata refuses initialization and stored actual roster validation', () => {
  const f = fixture(); assert.ok(initializeOceanShoalLife(f.r, f.g, { ...options(f), fresh: true, maxAdded: 7 }));
  for (const mutate of [r => { delete r.meadowAnimalBeltVersion; }, r => { delete r.meadowAnimalBelt; },
    r => { delete r.meadowAnimalBeltVersion; delete r.meadowAnimalBelt; }, r => { r.meadowAnimalBelt.groupId = '234,4'; }]) {
    const damaged = structuredClone(f.r); mutate(damaged); assert.equal(validateOceanShoalLifeRecord(damaged, f.g, options(f)), false);
  }
  const bad = fixture(); bad.r.meadowAnimalBelt.groupId = '234,4'; const before = structuredClone(bad.r);
  assert.equal(initializeOceanShoalLife(bad.r, bad.g, { ...options(bad), fresh: true }), false); assert.deepEqual(bad.r, before);
});

test('zero local food stays zero through shoal-only feeding decisions without artificial food supply', () => {
  const f = fixture({ plankton: 0 }); assert.ok(initializeOceanShoalLife(f.r, f.g, { ...options(f), fresh: true, maxAdded: 7 }));
  for (let i = 0; i < 40; i++) step(f, { network: false });
  assert.equal(f.r.resources.plankton, 0); assert.ok(f.r.agents.every(a => a.lastFeedAt === null)); assert.ok(Math.abs(livingNetworkBalance(f.r)) < 1e-9);
});

test('no-marker legacy reef owners retain original role, seeded column sites and sea-surface-relative birth height', () => {
  let chosen;
  for (let i = 0; i < 20; i++) { const f = fixture({ marked: false, seed: `legacy-belt-${i}` });
    if (!oceanShoalLifeRole(f.r, f.g)) continue; const p = createOceanShoalLifePlan(f.g, f.r, { ...options(f), availableSlots: 8 });
    if (p.school) { chosen = { f, p }; break; } }
  assert.ok(chosen); assert.match(chosen.p.placements[0].siteId, /^column:/); assert.notEqual(chosen.p.school.home.y, -5.8);
  assert.deepEqual(meadowAnimalBeltSites(chosen.f.g, chosen.f.r), []);
  assert.ok(initializeOceanShoalLife(chosen.f.r, chosen.f.g, { ...options(chosen.f), fresh: true }));
  assert.ok(validateOceanShoalLifeRecord(chosen.f.r, chosen.f.g, options(chosen.f)));
});
