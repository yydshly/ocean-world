import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createOceanBiodiversityPlan, initializeOceanBiodiversity, tickOceanBiodiversityAgent,
  validateOceanBiodiversityRecord, OCEAN_BIODIVERSITY_PATCH_LIMIT, OCEAN_BIODIVERSITY_IDS } from '../src/oceanBiodiversity.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { oceanBiodiversityPatchHeight } from '../src/oceanBiodiversityShape.js';
import { initializeLivingNetwork, validateLivingNetworkRecord, livingNetworkBalance, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

function fixture({ rocks = true, occupied = false, grass = true } = {}) {
  const floorY = -4;
  const chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64,
    bounds: { minX: 192, maxX: 256, minZ: 192, maxZ: 256 }, counts: {}, elements: [] };
  if (rocks) for (const [i, [x, z]] of [[209, 212], [234, 229]].entries()) {
    const rock = { id: `rock:${i}`, kind: 'rock', profile: 'terrace', x, y: floorY, z,
      scale: { x: 18, y: 1, z: 16 }, rotation: .2 };
    chunk.elements.push(rock, { id: `algae:${i}`, kind: 'algae', x: x + 2, y: oceanRockHeight(rock, x + 2, z), z,
      attachmentId: rock.id, scale: { x: .5, y: .02, z: .5 }, rotation: 0 });
    if (occupied) chunk.elements.push({ id: `coral:${i}`, kind: 'coral', x, y: -4, z,
      attachmentId: rock.id, scale: { x: 25, y: 2, z: 25 }, rotation: 0 });
  }
  if (grass) for (let i = 0; i < 8; i++) chunk.elements.push({ id: `grass:${i}`, kind: 'seagrass', x: 197 + i * 6,
    y: floorY, z: 248, scale: { x: .7, y: .4, z: .7 }, rotation: 0 });
  const bed = () => floorY;
  const surface = (x, z, crown = false) => chunk.elements.reduce((h, e) => {
    const rock = e.kind === 'rock' ? oceanRockHeight(e, x, z) : null;
    if (rock !== null) h = Math.max(h, rock);
    if (crown && e.kind === 'coral' && Math.hypot(x - e.x, z - e.z) < e.scale.x * .5) h = Math.max(h, e.y + e.scale.y);
    return h;
  }, floorY);
  const generator = { seed: 'fixture-17', profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    sample: (x, z) => ({ floorY, depthM: 8 - floorY, substrate: surface(x, z) > floorY + .06 ? 'rock' : 'sand',
      habitat: 'reef', rockiness: .6, seagrassSuitability: .2 }) };
  return { generator, chunk, bed, surface };
}
const allPresent = () => .10;
function regionFor(chunk, count = 0) {
  const region = { id: chunk.id, cx: chunk.cx, cz: chunk.cz, timeSec: 0, ticks: 0, agents: [], events: [],
    counters: { feeding: 0, deaths: 0 }, resources: { algae: .4, plankton: .5, detritus: .3 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 } };
  for (let i = 0; i < count; i++) region.agents.push({ id: `old:${i}`, regionId: chunk.id, speciesId: 'green-chromis',
    alive: i % 2 === 0, energy: .4, sizeM: .075, position: { x: 254, y: -2, z: 254 }, home: { x: 254, y: -2, z: 254 } });
  initializeLivingNetwork(region, chunk); return region;
}
function initialized(options = {}, count = 0, settings = {}) {
  const f = fixture(options), region = regionFor(f.chunk, count);
  initializeOceanBiodiversity(region, f.generator, { ...f, fresh: true, random: allPresent, ...settings });
  return { ...f, region };
}
const nearZero = n => assert.ok(Math.abs(n) < 1e-9, `residual ${n}`);

test('pure native planner separates immutable patches from six real animal identities', () => {
  const f = fixture(), stub = { id: '3,3', cx: 3, cz: 3, agents: [] };
  const plan = createOceanBiodiversityPlan(f.generator, stub, { ...f, random: allPresent, availableSlots: 6 });
  assert.ok(plan.patches.length > 0); assert.ok(plan.patches.length <= OCEAN_BIODIVERSITY_PATCH_LIMIT);
  assert.equal(plan.placements.length, 6); assert.equal(new Set(plan.placements.map(p => p.speciesId)).size, 6);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.placements[0]) && Object.isFrozen(plan.patches[0].scale));
  const staticOnly = createOceanBiodiversityPlan(f.generator, stub, { ...f, random: () => .99, availableSlots: 0 });
  assert.deepEqual(staticOnly.patches, plan.patches, 'individual occupancy RNG cannot alter static native birth view');
  assert.equal(staticOnly.placements.length, 0);
});

test('anemonefish requires the actual admitted live host and never a scenery stand-in', () => {
  const { region, generator, ...support } = initialized();
  const host = region.agents.find(a => a.speciesId === 'shallow-anemone');
  const clown = region.agents.find(a => a.speciesId === 'clown-anemonefish');
  assert.equal(clown.clownHostId, host.id); assert.equal(clown.regionId, host.regionId);
  assert.ok(clown.position.y - clown.sizeM * .2 > host.position.y + host.sizeM * .48);
  assert.ok(validateOceanBiodiversityRecord(region, generator, support));
  const beforeFood = structuredClone(region.resources); host.alive = false; recordLivingDeath(region, host);
  region.timeSec = 5;
  const position = { ...clown.position };
  tickOceanBiodiversityAgent(region, generator, clown, .1, { ...support, random: allPresent, environment: { lightAtDepth: 1 } });
  assert.equal(clown.state, 'host-unavailable'); assert.deepEqual(clown.position, position);
  // Death bookkeeping can add detritus; the resident itself makes no ingestion.
  assert.equal(region.resources.plankton, beforeFood.plankton); assert.equal(clown.lastFeedAt, null);
  assert.ok(validateOceanBiodiversityRecord(region, generator, support));
  const corrupt = structuredClone(region); corrupt.agents.find(a => a.id === clown.id).clownHostId = 'invented-host';
  assert.equal(validateOceanBiodiversityRecord(corrupt, generator, support), false);
});

test('fresh-only admission preserves old identities and deaths, reserves a total twenty records, and never refills', () => {
  const f = fixture(), region = regionFor(f.chunk, 17), before = structuredClone(region.agents);
  assert.equal(initializeOceanBiodiversity(region, f.generator, { ...f, random: allPresent }), false);
  assert.deepEqual(region.agents, before);
  assert.equal(initializeOceanBiodiversity(region, f.generator, { ...f, fresh: true, random: allPresent }), true);
  assert.equal(region.agents.length, 20); assert.deepEqual(region.agents.slice(0, 17), before);
  const saved = structuredClone(region);
  assert.equal(initializeOceanBiodiversity(region, f.generator, { ...f, fresh: true, random: allPresent }), false);
  assert.deepEqual(region, saved); nearZero(livingNetworkBalance(region));
  assert.ok(validateOceanBiodiversityRecord(region, f.generator, f));
  const aged = regionFor(f.chunk); aged.timeSec = 1;
  assert.equal(initializeOceanBiodiversity(aged, f.generator, { ...f, fresh: true }), false);
});

test('empty and fully occupied habitat records keep an examined marker with no invented hard-bottom life', () => {
  const f = fixture({ rocks: false }), region = regionFor(f.chunk, 20);
  assert.equal(initializeOceanBiodiversity(region, f.generator, { ...f, fresh: true }), true);
  assert.equal(region.biodiversity.addedIds.length, 0); assert.equal(region.biodiversity.patches.length, 0);
  const saved = structuredClone(region); assert.ok(validateOceanBiodiversityRecord(region, f.generator, f));
  assert.equal(initializeOceanBiodiversity(region, f.generator, { ...f, fresh: true }), false); assert.deepEqual(region, saved);
  const occupied = fixture({ occupied: true });
  const plan = createOceanBiodiversityPlan(occupied.generator, { id: '3,3', cx: 3, cz: 3, agents: [] }, { ...occupied, random: allPresent, availableSlots: 6 });
  assert.equal(plan.patches.length, 0);
  assert.ok(plan.placements.every(p => p.speciesId === 'sand-goby'));
});

test('canonical native static plans reject a safe-looking relocated colony, a changed size, or missing patches', () => {
  const { region, generator, ...support } = initialized();
  for (const mutate of [r => r.biodiversity.patches[0].x += .01, r => r.biodiversity.patches[0].scale.x *= 1.01,
    r => r.biodiversity.patches.pop(), r => r.biodiversity.patches[0].hostId = 'other-host']) {
    const corrupt = structuredClone(region); mutate(corrupt); assert.equal(validateOceanBiodiversityRecord(corrupt, generator, support), false);
  }
  const restored = JSON.parse(JSON.stringify(region)); assert.ok(validateOceanBiodiversityRecord(restored, generator, support));
  assert.ok(validateLivingNetworkRecord(restored)); nearZero(livingNetworkBalance(restored));
});

test('actual real-clock movement and ingestion conserve both existing ledgers; fixed hosts remain attached', () => {
  const { region, generator, ...support } = initialized();
  const starts = new Map(region.agents.map(a => [a.id, { ...a.position }]));
  for (let i = 1; i <= 300; i++) {
    region.timeSec = i * .1; region.ticks = i;
    for (const agent of region.agents) tickOceanBiodiversityAgent(region, generator, agent, .1,
      { ...support, random: allPresent, environment: { lightAtDepth: .8, currentMps: .1 } });
  }
  assert.ok(region.biodiversity.counters.feedings > 0); assert.ok(region.ledger.ingested > 0);
  assert.ok(region.events.every(e => e.type === 'feeding' && e.amount > 0 && e.agentId));
  assert.ok(region.agents.some(a => ['sand-goby', 'clown-anemonefish', 'reef-parrotfish'].includes(a.speciesId) &&
    Math.hypot(a.position.x - starts.get(a.id).x, a.position.z - starts.get(a.id).z) > .01));
  for (const a of region.agents.filter(a => ['feather-duster', 'shallow-anemone'].includes(a.speciesId))) assert.deepEqual(a.position, starts.get(a.id));
  assert.ok(validateOceanBiodiversityRecord(region, generator, support)); assert.ok(validateLivingNetworkRecord(region)); nearZero(livingNetworkBalance(region));
  const cold = JSON.parse(JSON.stringify(region)); assert.ok(validateOceanBiodiversityRecord(cold, generator, support));
});

test('zero timestep and dead animals cannot move, feed, or create an event', () => {
  const { region, generator, ...support } = initialized(); const before = structuredClone(region);
  for (const a of region.agents) tickOceanBiodiversityAgent(region, generator, a, 0, support);
  assert.deepEqual(region, before);
  const dead = region.agents[0]; dead.alive = false; recordLivingDeath(region, dead); const afterDeath = structuredClone(region);
  tickOceanBiodiversityAgent(region, generator, dead, 2, support); assert.deepEqual(region, afterDeath);
});

test('uncalibrated food proxies deplete rather than feeding from empty pools', () => {
  const { region, generator, ...support } = initialized();
  const removed = Object.values(region.resources).reduce((a, b) => a + b, 0);
  region.resources = { algae: 0, plankton: 0, detritus: 0 }; region.ledger.exported += removed;
  region.basicNetwork.ledger.output += removed; region.basicNetwork.processTotals.systemOutput += removed;
  region.timeSec = 10;
  for (const a of region.agents) tickOceanBiodiversityAgent(region, generator, a, .1, { ...support, random: allPresent });
  assert.equal(region.biodiversity.counters.feedings, 0); assert.equal(region.ledger.ingested, 0);
  assert.equal(region.events.length, 0); nearZero(livingNetworkBalance(region)); assert.ok(validateLivingNetworkRecord(region));
});

test('ordinary native generated owners use reproducible habitat allocation across load orders and away from the fixed sample', () => {
  const generator = createLivingShallowsGenerator(livingShallowsSeed(42));
  const bed = (x, z) => generator.floorSurface(x, z).height;
  const surface = (x, z, crown = false) => {
    let y = bed(x, z), cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const e of generator.chunk(cx + dx, cz + dz).elements) {
      if (e.kind === 'rock') { const h = oceanRockHeight(e, x, z); if (h !== null) y = Math.max(y, h); }
      if (crown && e.kind === 'coral' && Math.hypot(e.x - x, e.z - z) < Math.max(e.scale.x, e.scale.z) * .5) y = Math.max(y, e.y + e.scale.y);
    }
    return y;
  };
  const snapshots = [];
  for (const [cx, cz] of [[3, 3], [5, 3], [8, 4], [12, 6], [20, 8]]) {
    const stub = { id: `${cx},${cz}`, cx, cz, agents: [] };
    const first = createOceanBiodiversityPlan(generator, stub, { surface, bed, availableSlots: 6 });
    generator.chunk(-14, -8); generator.chunk(70, 28);
    assert.deepEqual(createOceanBiodiversityPlan(generator, stub, { surface, bed, availableSlots: 6 }), first);
    assert.ok(first.placements.length <= 6 && first.patches.length <= 20);
    const actual = regionFor(generator.chunk(cx, cz));
    initializeOceanBiodiversity(actual, generator, { surface, bed, fresh: true });
    assert.ok(validateOceanBiodiversityRecord(actual, generator, { surface, bed }));
    for (const p of first.patches) {
      const host = generator.chunk(cx, cz).elements.find(e => e.id === p.hostId);
      for (let i = 0; i < 8; i++) {
        const x = p.x + Math.cos(i * Math.PI / 4) * p.scale.x * .5, z = p.z + Math.sin(i * Math.PI / 4) * p.scale.z * .5;
        assert.equal(oceanRockHeight(host, x, z), surface(x, z));
      }
      if (p.speciesId === 'biodiversity-massive-coral') assert.ok(oceanBiodiversityPatchHeight(p, p.x, p.z) > p.y);
    }
    snapshots.push(first.placements.map(p => p.speciesId).join(','));
  }
  assert.ok(new Set(snapshots).size > 1, 'actual differing native niches should differ rather than repeating a universal checklist');
  assert.ok(snapshots.some(s => s.length > 0), 'ordinary exploration has admitted real new animals');
});

test('sloped native grape bases follow the renderer quaternion with bounded root clearance', () => {
  const generator = createLivingShallowsGenerator(livingShallowsSeed('42'));
  const bed = (x, z) => generator.floorSurface(x, z).height;
  const surface = (x, z, crown = false) => oceanSupportHeight(generator, x, z, { avoidCoral: crown });
  const stub = { id: '184,-16', cx: 184, cz: -16, agents: [] };
  const plan = createOceanBiodiversityPlan(generator, stub, { surface, bed, availableSlots: 0 });
  const grapes = plan.patches.filter(p => p.speciesId === 'biodiversity-grape-algae');
  assert.ok(grapes.length > 0 && grapes.some(p => p.surfaceNormal.y < .99));
  for (const p of grapes) {
    const host = generator.chunk(stub.cx, stub.cz).elements.find(e => e.id === p.hostId);
    const normal = new Vector3(p.surfaceNormal.x, p.surfaceNormal.y, p.surfaceNormal.z);
    assert.ok(Math.abs(normal.length() - 1) < 1e-10);
    const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal);
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.rotation);
    const transform = align.multiply(yaw);
    for (const fraction of [0, .5, 1]) for (let i = 0; i < (fraction === 0 ? 1 : 8); i++) {
      const root = new Vector3(Math.cos(i * Math.PI / 4) * p.scale.x * .5 * fraction, 0,
        Math.sin(i * Math.PI / 4) * p.scale.z * .5 * fraction).applyQuaternion(transform)
        .add(new Vector3(p.x, p.y, p.z));
      const native = surface(root.x, root.z);
      assert.equal(oceanRockHeight(host, root.x, root.z), native);
      assert.ok(root.y - native >= .004 - 1e-8 && root.y - native <= .012 + 1e-8,
        `tilted root gap ${root.y - native}`);
    }
  }
  const actual = regionFor(generator.chunk(stub.cx, stub.cz));
  initializeOceanBiodiversity(actual, generator, { fresh: true, surface, bed, capacity: 0 });
  assert.ok(validateOceanBiodiversityRecord(actual, generator, { surface, bed }));
  const corrupted = JSON.parse(JSON.stringify(actual));
  corrupted.biodiversity.patches.find(p => p.surfaceNormal).surfaceNormal.x += .01;
  assert.equal(validateOceanBiodiversityRecord(corrupted, generator, { surface, bed }), false);
});
