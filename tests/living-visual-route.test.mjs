import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivingVisualRoute, sampleLivingVisualRoute } from '../src/livingVisualRoute.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { OceanEcology } from '../src/oceanEcology.js';

const clone = value => structuredClone(value);
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function fixture(dx = 0, dz = 0) {
  const x = 224 + dx, z = 224 + dz, id = `${Math.floor(x / 64)},${Math.floor(z / 64)}`, reads = [];
  const elements = [
    { id: 'actual-rock', kind: 'rock', x, y: 0, z, profile: 'mound', rotation: 0, scale: { x: 4, y: 1, z: 4 } },
    ...[-1, 0, 1].map((offset, i) => ({ id: `actual-coral-${i}`, kind: 'coral', x: x + offset,
      y: 1, z: z + .2, scale: { x: .8, y: .7, z: .8 } })),
    { id: 'actual-grass', kind: 'seagrass', x, y: 0, z: z + 8, scale: { x: 1, y: .6, z: 1 } },
  ];
  const agents = [{ id: 'actual-fish', speciesId: 'honeycomb-grouper', alive: true, sizeM: .3,
    regionId: id, position: { x: x + .8, y: 1.3, z: z + .3 } },
  { id: 'nearest-tiny', speciesId: 'top-shell', alive: true, sizeM: .02,
    regionId: id, position: { x, y: 0, z: z - 8 } },
  { id: 'dead-large-fish', speciesId: 'honeycomb-grouper', alive: false, sizeM: .7,
    regionId: id, position: { x, y: 1, z } }];
  const generator = {
    get seascapeRouteStops() { throw new Error('Candidate macro route must not be read.'); },
    chunk(cx, cz) { reads.push(`${cx},${cz}`); return { id, elements }; },
    floorSurface: () => ({ height: 0 }),
    heightAt: (px, pz) => Math.hypot(px - x, pz - z) < 2 ? 1 : 0,
    sample: (px, pz) => ({ substrate: Math.hypot(px - x, pz - z) < 2 ? 'rock' : 'sand' }),
  };
  return { generator, agents, loadedChunkIds: [id], cameraPosition: { x, y: 2.7, z: z - 10 },
    surfaceY: 8, safeHeight: generator.heightAt, reads, elements };
}

test('a complete actual core selects living fish and public reef/grass IDs without changing source records', () => {
  const input = fixture(), before = clone({ agents: input.agents, elements: input.elements });
  const route = createLivingVisualRoute(input);
  assert.equal(route.status, 'ready', route.reason);
  assert.deepEqual(route.sourceAgentIds, ['actual-fish']);
  assert.ok(route.sourceElementIds.includes('actual-rock'));
  assert.ok(route.sourceElementIds.includes('actual-grass'));
  assert.equal(route.sourceElementIds.filter(id => id.startsWith('actual-coral')).length, 3);
  assert.deepEqual(input.reads, ['3,3']);
  assert.deepEqual({ agents: input.agents, elements: input.elements }, before);
  assert.equal(route.stops.length, 3); assert.equal(route.coreDiameterM, 28);
  assert.ok(Object.isFrozen(route) && Object.isFrozen(route.path));
  close(route.pathLengthM, 12);
  for (const row of route.path) {
    assert.ok(row.position.y >= input.safeHeight(row.position.x, row.position.z) + .7);
    assert.ok(row.position.y <= input.surfaceY - .6);
  }
});

test('the admitted path continuously moves through three low views in absolute world metres', () => {
  const route = createLivingVisualRoute(fixture()), shifted = createLivingVisualRoute(fixture(4096, -8192));
  assert.equal(route.status, 'ready'); assert.equal(shifted.status, 'ready');
  assert.deepEqual(sampleLivingVisualRoute(route, 0), { position: route.stops[0].position, target: route.stops[0].target });
  assert.deepEqual(sampleLivingVisualRoute(route, 1), { position: route.stops[2].position, target: route.stops[2].target });
  let previous = sampleLivingVisualRoute(route, 0), traveled = 0;
  for (let i = 1; i <= 100; i++) {
    const frame = sampleLivingVisualRoute(route, i / 100), far = sampleLivingVisualRoute(shifted, i / 100);
    const movement = Math.hypot(frame.position.x - previous.position.x, frame.position.y - previous.position.y,
      frame.position.z - previous.position.z);
    assert.ok(movement <= .121); traveled += movement; previous = frame;
    close(far.position.x - frame.position.x, 4096); close(far.position.z - frame.position.z, -8192);
    close(far.position.y, frame.position.y); close(far.target.x - frame.target.x, 4096);
  }
  close(traveled, route.pathLengthM);
  assert.equal(sampleLivingVisualRoute(route, NaN), null);
  assert.equal(sampleLivingVisualRoute({ status: 'empty' }, .5), null);
});

test('blocked vertical clearance and failed physical queries produce explicit absence', () => {
  const input = fixture();
  const blocked = createLivingVisualRoute({ ...input, safeHeight: () => 8 });
  assert.equal(blocked.status, 'empty'); assert.equal(blocked.reason, 'no-safe-framed-continuous-path');
  const failed = createLivingVisualRoute({ ...input, safeHeight() { throw new Error('Support unavailable'); } });
  assert.equal(failed.status, 'empty'); assert.equal(failed.reason, 'public-source-query-failed');
  assert.deepEqual(blocked.sourceAgentIds, []); assert.deepEqual(blocked.path, []);
});

test('dead fish, tiny nearest animals, missing grass and distant fish cannot stand in for a complete real scene', () => {
  const input = fixture();
  assert.equal(createLivingVisualRoute({ ...input, agents: input.agents.filter(a => a.id !== 'actual-fish') }).reason,
    'no-live-fish-in-loaded-window');
  input.elements.splice(input.elements.findIndex(e => e.kind === 'seagrass'), 1);
  assert.equal(createLivingVisualRoute(input).reason, 'missing-reef-grass-composition');
  const distant = fixture(); distant.agents[0].position = { x: 250, y: 1, z: 250 };
  assert.equal(createLivingVisualRoute(distant).reason, 'no-complete-28m-core');
});

test('owner reads remain bounded and malformed or duplicate loaded windows are refused', () => {
  const input = fixture();
  assert.equal(createLivingVisualRoute({ ...input, loadedChunkIds: Array.from({ length: 10 }, (_, i) => `${i},3`) }).status, 'empty');
  assert.equal(input.reads.length, 0);
  assert.equal(createLivingVisualRoute({ ...input, loadedChunkIds: ['3,3', '3,3'] }).reason, 'invalid-loaded-owners');
  assert.ok(input.reads.length <= 1);
});

test('a naturally committed living42 window supplies the complete route without rewriting animals, clocks or food', async () => {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createOceanGenerator(seed)), rows = new Map();
  const store = { available: true, load: async (world, id) => clone(rows.get(`${world}|${id}`) ?? null),
    async saveMany(world, entries) { for (const [id, row] of entries) rows.set(`${world}|${id}`, clone(row)); } };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true });
  assert.notEqual(await ecology.update({ x: 4758, z: 150 }), false);
  const actualAgents = ecology.agents;
  const before = clone([...ecology._active]), disk = clone([...rows]);
  const ids = [...ecology._active.keys()], input = { generator, agents: actualAgents, loadedChunkIds: ids,
    cameraPosition: { x: 4756, y: 3, z: 157 }, surfaceY: 8 };
  const route = createLivingVisualRoute(input); assert.equal(route.status, 'ready', route.reason);
  const live = new Map(actualAgents.filter(agent => agent.alive).map(agent => [agent.id, agent]));
  assert.ok(route.sourceAgentIds.length >= 3);
  assert.ok(route.sourceAgentIds.every(id => live.has(id)));
  const actual = new Set(ids.flatMap(id => generator.chunk(...id.split(',').map(Number)).elements.map(e => e.id)));
  assert.ok(route.sourceElementIds.every(id => actual.has(id)));
  assert.ok(route.sourceChunkIds.every(id => ids.includes(id)));
  assert.equal(route.evidence.actualRenderedOcclusion, false);
  assert.ok(route.pathLengthM >= 10 && route.pathLengthM <= 24);
  assert.deepEqual([...ecology._active], before);
  assert.deepEqual([...rows], disk);
  console.log(`actual visual route: ${route.sourceChunkIds.join(';')} / ${route.sourceElementIds.length} elements / ${route.sourceAgentIds.length} living fish / ${route.pathLengthM.toFixed(2)} m`);
});
