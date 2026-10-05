import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT } from '../src/oceanEcology.js';
import { createOceanCommunityPlan, OCEAN_COMMUNITY_VERSION } from '../src/oceanCommunity.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { speciesById } from '../src/species.js';

class MemoryStore {
  available = true;
  records = new Map();
  async load(world, id) { return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { this.records.set(`${world}|${id}`, structuredClone(record)); }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}
const model = (seed, generator = createOceanGenerator(seed), store = new MemoryStore()) => new OceanEcology(seed, generator, { store });
const countsOf = region => region.agents.reduce((counts, animal) => {
  counts[animal.speciesId] = (counts[animal.speciesId] || 0) + 1; return counts;
}, {});
const groupsOf = region => new Set(region.agents.filter(animal => animal.speciesId === 'green-chromis').map(animal => animal.groupId));
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

test('new communities distinguish actual grass sediment, coral habitat, open sand and entirely deep slope', () => {
  const ecology = model('42');
  const grass = ecology._createRegion(-2, -1), reef = ecology._createRegion(-1, -2),
    sand = ecology._createRegion(1, 0), slope = ecology._createRegion(3, -2);
  assert.equal(groupsOf(grass).size, 0, 'grass without actual colonies cannot host a coral-refuge school');
  assert.ok(countsOf(grass)['black-cucumber'] >= 3);
  assert.ok(groupsOf(reef).size >= 2);
  assert.ok(countsOf(reef)['lined-tang'] >= 1 && countsOf(reef)['top-shell'] >= 1);
  assert.equal(groupsOf(sand).size, 0);
  assert.equal(countsOf(sand)['lined-tang'] || 0, 0, 'bare rocks with no actual turf do not receive a turf grazer');
  assert.ok(countsOf(sand)['black-cucumber'] >= 1);
  assert.equal(slope.agents.length, 0, 'a wholly unsupported deep cell is not padded with shallow species');
  const mixed = model(91)._createRegion(3, -1);
  assert.equal(groupsOf(mixed).size, 1, 'small coral patches remain available within a grass-dominated soft-bottom region');
  assert.ok(countsOf(mixed)['black-cucumber'] >= 3);
  assert.ok(mixed.agents.length < OCEAN_REGION_AGENT_LIMIT);
});

test('multi-seed populations vary within niche, support, shelter-group and loading limits', () => {
  const allowed = new Set(['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'top-shell',
    'blue-starfish', 'black-cucumber', 'giant-clam', 'cleaner-shrimp']);
  const signatures = new Set(), populations = new Set(), groups = new Set();
  for (const seed of [42, '42', 91, '91', 'seams']) {
    const ecology = model(seed), generator = ecology.generator;
    for (const [cx, cz] of [[-2, -1], [-1, -2], [1, 0], [3, -2], [3, -1], [0, 2], [4, 1], [7, 1]]) {
      const region = ecology._createRegion(cx, cz), chunk = generator.chunk(cx, cz), counts = countsOf(region);
      signatures.add(JSON.stringify(Object.entries(counts).sort())); populations.add(region.agents.length); groups.add(groupsOf(region).size);
      assert.equal(region.communityVersion, OCEAN_COMMUNITY_VERSION);
      assert.ok(region.agents.length <= OCEAN_REGION_AGENT_LIMIT);
      assert.equal(new Set(region.agents.map(agent => agent.id)).size, region.agents.length);
      assert.ok((counts['green-chromis'] || 0) <= 12);
      assert.ok((counts['black-cucumber'] || 0) <= 7);
      for (const groupId of groupsOf(region)) {
        const members = region.agents.filter(agent => agent.groupId === groupId);
        assert.ok(members.length >= 3 && members.length <= 6);
        const host = chunk.elements.find(element => element.id === groupId);
        assert.equal(host?.kind, 'coral');
        assert.ok(members.every(agent => agent.refugeHostId === groupId && Math.hypot(agent.home.x - host.x, agent.home.z - host.z) < .8));
      }
      for (const agent of region.agents) {
        assert.ok(allowed.has(agent.speciesId));
        assert.ok(Math.hypot(agent.position.x, agent.position.z) > 41);
        assert.ok(agent.position.x >= chunk.bounds.minX + .5 && agent.position.x <= chunk.bounds.maxX - .5);
        assert.ok(agent.position.z >= chunk.bounds.minZ + .5 && agent.position.z <= chunk.bounds.maxZ - .5);
        const sample = generator.sample(agent.position.x, agent.position.z), hard = ecology._surface(agent.position.x, agent.position.z);
        assert.ok(sample.depthM <= 22);
        if (speciesById[agent.speciesId].kind === 'fish') {
          assert.ok(agent.position.y >= ecology._surface(agent.position.x, agent.position.z, true) + .08);
          assert.ok(agent.position.y <= OCEAN_SURFACE_Y - .6);
        }
        if (['lined-tang', 'top-shell', 'blue-starfish', 'giant-clam'].includes(agent.speciesId)) {
          const host = chunk.elements.find(element => element.id === agent.refugeHostId);
          assert.equal(host?.kind, 'rock');
          assert.ok(hard - sample.floorY > .06);
          assert.ok(Math.abs(oceanRockHeight(host, agent.position.x, agent.position.z) - hard) < .03);
        }
        if (['lined-tang', 'top-shell'].includes(agent.speciesId)) {
          const host = chunk.elements.find(element => element.id === agent.refugeHostId);
          const c = Math.cos(host.rotation), s = Math.sin(host.rotation);
          const wx = agent.position.x - host.x, wz = agent.position.z - host.z;
          const x = (wx * c - wz * s) / host.scale.x, z = (wx * s + wz * c) / host.scale.z;
          assert.ok(chunk.elements.some(element => element.kind === 'algae' && element.attachmentId === host.id &&
            Math.hypot(x - element.surfaceLocal.x, z - element.surfaceLocal.z) < element.patchRadius), 'turf grazers start on actual turf');
        }
        if (['cleaner-wrasse', 'honeycomb-grouper'].includes(agent.speciesId)) {
          assert.ok(chunk.elements.some(element => element.kind === 'coral' && element.attachmentId === agent.refugeHostId));
        }
        if (agent.speciesId === 'black-cucumber') {
          assert.notEqual(sample.substrate, 'rock'); assert.ok(hard - sample.floorY < .03);
          assert.ok(Math.abs(agent.position.y - hard - .004) < 1e-12);
          if (agent.habitat === 'sand-with-seagrass') assert.ok(chunk.elements.some(element => element.kind === 'seagrass' &&
            Math.hypot(agent.position.x - element.x, agent.position.z - element.z) < 3.2));
        }
      }
    }
  }
  assert.ok(signatures.size > 15 && populations.size > 5 && groups.size >= 3,
    'contrasting seeds and actual niches produce more than a fixed school/cucumber template');
});

test('allocation ignores display habitat labels and aggregate element counts, and leaves generated geometry untouched', () => {
  const seed = '42', generator = createOceanGenerator(seed), ecology = model(seed, generator), chunk = generator.chunk(-1, -2);
  const before = hash(chunk), random = salt => ecology._random({ id: chunk.id }, salt);
  const plan = createOceanCommunityPlan(generator, chunk, { random, surface: (x, z, fish) => ecology._surface(x, z, fish) });
  const relabelled = { ...generator, sample: (x, z) => ({ ...generator.sample(x, z), habitat: 'slope',
    rockiness: 0, seagrassSuitability: 1 }) };
  const fakeCounts = { ...chunk, counts: { rock: 0, coral: 0, seagrass: 9999, algae: 0 } };
  const samePlan = createOceanCommunityPlan(relabelled, fakeCounts, { random,
    surface: (x, z, fish) => ecology._surface(x, z, fish) });
  assert.deepEqual(samePlan, plan);
  assert.equal(hash(generator.chunk(-1, -2)), before);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements));
  const noTurf = { ...chunk, elements: chunk.elements.filter(element => element.kind !== 'algae') };
  const turfRemoved = createOceanCommunityPlan(generator, noTurf, { random, surface: (x, z, fish) => ecology._surface(x, z, fish) });
  assert.ok(turfRemoved.placements.every(agent => !['lined-tang', 'top-shell'].includes(agent.speciesId)));
  const noHosts = { ...chunk, elements: chunk.elements.map(element => element.kind === 'coral' ?
    { ...element, attachmentId: 'nonexistent-host' } : element) };
  const hostsRemoved = createOceanCommunityPlan(generator, noHosts, { random, surface: (x, z, fish) => ecology._surface(x, z, fish) });
  assert.ok(hostsRemoved.placements.every(agent => !['green-chromis', 'cleaner-wrasse', 'honeycomb-grouper'].includes(agent.speciesId)));
});

test('historical unmarked v1 population including deaths and unsuitable old positions remains byte-equivalent on revisit', async () => {
  const seed = '42', generator = createOceanGenerator(seed), store = new MemoryStore(), source = model(seed, generator, store);
  const legacy = source._createRegion(-1, -1), template = legacy.agents[0];
  delete legacy.communityVersion;
  legacy.timeSec = 1729.1; legacy.ticks = 17291;
  legacy.resources = { algae: .21, plankton: .33, detritus: .47 };
  legacy.ledger = { initial: 1.3, input: .31, ingested: .2, exported: .4 };
  legacy.counters = { feeding: 58, escapes: 9, cleaning: 3, predation: 1, deaths: 3 };
  legacy.agents = Array.from({ length: 20 }, (_, index) => ({ ...structuredClone(template),
    id: `historical:${index}`, timeSec: 1729.1, speciesId: index === 18 ? 'giant-clam' : index === 19 ? 'cleaner-shrimp' :
      index < 10 ? 'green-chromis' : index < 13 ? 'black-cucumber' : 'lined-tang',
    alive: index !== 3 && index !== 18 && index !== 19,
    state: index === 3 || index >= 18 ? 'dead' : 'foraging', energy: index === 3 || index >= 18 ? 0 : .71,
    lastFeedAt: 17.2, groupId: index < 10 ? `historical-refuge:${index % 2}` : null }));
  // This historical placement must not be corrected by a new birth policy.
  legacy.agents[13].position = { x: -49, y: -.19, z: -50 };
  const expected = structuredClone(legacy), world = 'ecology-v1:string:42';
  await store.save(world, legacy.id, legacy);
  const restored = model(seed, generator, store), create = restored._createRegion.bind(restored);
  restored._createRegion = (cx, cz) => {
    assert.ok(cx !== -1 || cz !== -1, 'a valid saved region never executes the new allocator');
    return create(cx, cz);
  };
  await restored.update({ x: -32, z: -32 });
  assert.deepEqual(restored._active.get(legacy.id), expected);
  assert.equal(restored.snapshot().regions.find(region => region.id === legacy.id).communityVersion, null);
  assert.ok(restored.snapshot().regions.some(region => region.id !== legacy.id && region.communityVersion === OCEAN_COMMUNITY_VERSION));
  const oldHash = hash(expected);
  restored.step(0);
  await restored.update({ x: 900, z: 900 }); restored.step(4);
  await restored.update({ x: -32, z: -32 });
  assert.equal(hash(restored._active.get(legacy.id)), oldHash);
  await restored.dispose();
  const reloaded = model(seed, generator, store);
  await reloaded.update({ x: -32, z: -32 });
  assert.deepEqual(reloaded._active.get(legacy.id), expected);
  assert.ok(!Object.hasOwn(reloaded._active.get(legacy.id), 'communityVersion'));
});

test('new allocation is deterministic across independent visits and fixes newly born historical hard-support failures', async () => {
  const first = model('seams'), reordered = model('seams');
  await first.update({ x: -32, z: -96 });
  const expected = structuredClone(first._active.get('-1,-2'));
  await reordered.update({ x: 1000, z: -700 }); await reordered.update({ x: -32, z: -96 });
  assert.deepEqual(reordered._active.get('-1,-2'), expected);
  assert.equal(expected.communityVersion, OCEAN_COMMUNITY_VERSION);
  for (const grazer of expected.agents.filter(agent => agent.speciesId === 'lined-tang')) {
    const sample = first.generator.sample(grazer.position.x, grazer.position.z);
    assert.ok(first._surface(grazer.position.x, grazer.position.z) - sample.floorY > .06);
  }
  assert.ok(expected.agents.some(agent => agent.speciesId === 'lined-tang'));
  const changed = model('other-community-seed')._createRegion(-1, -2);
  assert.notDeepEqual(changed.agents, expected.agents);
});
