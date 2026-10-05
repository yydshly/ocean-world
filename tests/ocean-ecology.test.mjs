import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight, OCEAN_REGION_AGENT_LIMIT } from '../src/oceanEcology.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { speciesById as reefSpeciesById } from '../src/species.js';
import { oceanSlopeSpeciesById } from '../src/oceanSlopeSpecies.js';
import { oceanMantaSpeciesById } from '../src/oceanMantaSpecies.js';
import { oceanPelagicSpeciesById } from '../src/oceanPelagicSpecies.js';
import { oceanRockHeight, oceanRockMesh, OCEAN_ROCK_PROFILES, OCEAN_ROCK_SURFACE_VERSION } from '../src/oceanRockShape.js';
import { OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import * as THREE from 'three';

const speciesById = { ...reefSpeciesById, ...oceanSlopeSpeciesById, ...oceanPelagicSpeciesById, ...oceanMantaSpeciesById };
// Old fixture assertions retain every historical field. Only the independently
// tested pelagic/manta cohorts and their explicit compatibility keys are projected.
function withoutPelagicUpgrade(region) {
  const record = structuredClone(region);
  for (const key of ['pelagicCommunityVersion', 'pelagicCommunityAdded', 'pelagicInitializedAtSec', 'mantaCommunityVersion', 'mantaCommunityAdded', 'mantaInitializedAtSec']) delete record[key];
  record.agents = record.agents.filter(agent => !['pelagic-community-v1', 'manta-community-v1'].includes(agent.populationOrigin));
  return record;
}

class MemoryStore {
  available = true;
  records = new Map();
  async load(world, id) { return structuredClone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) { this.records.set(`${world}|${id}`, structuredClone(state)); }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}

function fixtureGenerator(mode = 'reef', profile) {
  return {
    sample: () => ({ floorY: -5, depthM: 13, substrate: 'sand', habitat: mode, rockiness: mode === 'reef' ? .7 : .1, seagrassSuitability: mode === 'seagrass' ? .5 : 0 }),
    chunk(cx, cz) {
      const x = cx * 64 + 32, z = cz * 64 + 32;
      const rock = { id: `rock:${cx},${cz}`, kind: 'rock', x, y: -5, z, scale: { x: 10, y: 3, z: 8 }, rotation: 0, ...(profile ? { profile } : {}) };
      const coral = { id: `coral:${cx},${cz}`, kind: 'coral', x, y: oceanRockHeight(rock, x, z), z, scale: { x: 1, y: 1, z: 1 }, rotation: 0, attachmentId: rock.id };
      const algae = { id: `algae:${cx},${cz}`, kind: 'algae', x: x + 3, y: oceanRockHeight(rock, x + 3, z), z,
        scale: { x: 1, y: .02, z: 1 }, rotation: 0, attachmentId: rock.id, surfaceRadius: .18, patchRadius: Math.sin(.18) * .5 };
      const elements = mode === 'reef' ? [rock, coral, algae] : [];
      return { id: `${cx},${cz}`, cx, cz, seed: 99, origin: { x: cx * 64, z: cz * 64 }, size: 64,
        bounds: { minX: cx * 64, maxX: (cx + 1) * 64, minZ: cz * 64, maxZ: (cz + 1) * 64 },
        elements, counts: { rock: mode === 'reef' ? 1 : 0, coral: mode === 'reef' ? 1 : 0, seagrass: mode === 'seagrass' ? 8 : 0,
          algae: mode === 'reef' ? 1 : 0 } };
    },
    heightForCamera() { throw new Error('Camera ceiling must not be used as animal support.'); },
  };
}
const agentsOf = (model, regionId) => model.snapshot().agents.filter(agent => agent.regionId === regionId).sort((a, b) => a.id.localeCompare(b.id));

test('coordinate-seeded communities reproduce independently of loading order, including string seeds', async () => {
  const first = new OceanEcology('珊瑚42', createOceanGenerator('珊瑚42'), { store: new MemoryStore() });
  const reordered = new OceanEcology('珊瑚42', createOceanGenerator('珊瑚42'), { store: new MemoryStore() });
  await first.update({ x: 160, z: 160 });
  const expected = agentsOf(first, '2,2');
  await reordered.update({ x: -200, z: 500 });
  await reordered.update({ x: 160, z: 160 });
  assert.deepEqual(agentsOf(reordered, '2,2'), expected);
  assert.ok(first.snapshot().regions.every(region => Object.values(region.resources).every(Number.isFinite)));
  const changed = new OceanEcology('different', createOceanGenerator('different'), { store: new MemoryStore() });
  await changed.update({ x: 160, z: 160 });
  assert.notDeepEqual(agentsOf(changed, '2,2'), expected);
});

test('species are linked to actual refuge and substrate; the authored 40m patch is excluded', async () => {
  const reef = new OceanEcology(42, fixtureGenerator('reef'), { store: new MemoryStore() });
  const sand = new OceanEcology(42, fixtureGenerator('sand'), { store: new MemoryStore() });
  await reef.update({ x: 160, z: 160 }); await sand.update({ x: 160, z: 160 });
  assert.ok(reef.agents.some(agent => agent.speciesId === 'green-chromis' && agent.refugeHostId.startsWith('coral:')));
  assert.ok(reef.agents.some(agent => agent.speciesId === 'lined-tang'));
  assert.ok(sand.agents.length > 0);
  assert.ok(sand.agents.every(agent => agent.speciesId === 'black-cucumber' && agent.habitat === 'sand'));
  await reef.update({ x: 0, z: 0 });
  assert.ok(reef.agents.every(agent => Math.hypot(agent.position.x, agent.position.z) > 40));
  assert.equal(new Set(reef.agents.map(agent => agent.id)).size, reef.agents.length);
  assert.ok(reef.snapshot().regions.every(region => region.agentCount <= OCEAN_REGION_AGENT_LIMIT));
});

test('animal support follows the shared rock triangles and neighbouring chunk owners, not whole camera height', () => {
  const generator = fixtureGenerator();
  const rock = generator.chunk(2, 2).elements[0];
  assert.equal(oceanSupportHeight(generator, 160, 160), oceanRockHeight(rock, 160, 160));
  assert.equal(oceanSupportHeight(generator, 164, 160), oceanRockHeight(rock, 164, 160));
  const crossSeam = fixtureGenerator();
  const original = crossSeam.chunk;
  crossSeam.chunk = (cx, cz) => {
    const chunk = original(cx, cz);
    if (cx === 0 && cz === 0) chunk.elements = [{ ...chunk.elements[0], x: 63, z: 32 }];
    else chunk.elements = [];
    return chunk;
  };
  assert.ok(oceanSupportHeight(crossSeam, 65, 32) > -5);
});

test('fixed simulation steps conserve relative food pools, feed records indicate actual intake, and pause is exact', async () => {
  const a = new OceanEcology(42, fixtureGenerator(), { store: new MemoryStore() });
  const b = new OceanEcology(42, fixtureGenerator(), { store: new MemoryStore() });
  await a.update({ x: 160, z: 160 }); await b.update({ x: 160, z: 160 });
  a.step(8); for (let i = 0; i < 80; i++) b.step(.1);
  assert.deepEqual(a.snapshot().agents, b.snapshot().agents);
  assert.deepEqual(a.snapshot().regions, b.snapshot().regions);
  assert.ok(a.snapshot().metrics.balanceError < 1e-12);
  assert.ok(a.agents.some(agent => agent.lastFeedAt !== null));
  const paused = a.snapshot(); a.step(0); assert.deepEqual(a.snapshot(), paused);
  for (const region of a._active.values()) { region.resources = { algae: 0, plankton: 0, detritus: 0 }; for (const agent of region.agents) agent.lastFeedAt = null; }
  a.step(.1, { foodSupply: 0, hour: 0 });
  assert.ok(a.agents.filter(agent => speciesById[agent.speciesId].guild === 'planktivore').every(agent => agent.lastFeedAt === null));
});

test('a sand animal stops at a rock footprint and chooses another path instead of climbing its top', async () => {
  const generator = fixtureGenerator();
  const ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
  await ecology.update({ x: 160, z: 160 });
  const cucumber = ecology.agents.find(agent => agent.regionId === '2,2' && agent.speciesId === 'black-cucumber');
  // Find the actual mesh's .03m hard-relief threshold instead of assuming
  // the old ellipsoid has a vertical jump at x=155.
  let low = 155, high = 156;
  for (let i = 0; i < 48; i++) {
    const x = (low + high) * .5;
    if (oceanSupportHeight(generator, x, 160) + 5 < .03) low = x; else high = x;
  }
  cucumber.home = { x: 154.5, y: -4.996, z: 160 };
  cucumber.position = { x: low - .00001, y: oceanSupportHeight(generator, low - .00001, 160) + .004, z: 160 };
  cucumber.target = { x: 166, y: -4.996, z: 160 };
  cucumber.nextDecision = 100;
  const previous = structuredClone(cucumber.position);
  ecology.step(.1);
  assert.ok(Math.hypot(cucumber.position.x - previous.x, cucumber.position.y - previous.y,
    cucumber.position.z - previous.z) <= .006 * .1 + 1e-12);
  assert.ok(oceanSupportHeight(generator, cucumber.position.x, cucumber.position.z) + 5 < .03);
  assert.equal(cucumber.nextDecision, 0);
  for (let i = 0; i < 40; i++) {
    ecology.step(.1);
    assert.ok(oceanSupportHeight(generator, cucumber.position.x, cucumber.position.z) - generator.sample(cucumber.position.x, cucumber.position.z).floorY < .03);
    assert.ok(Math.abs(cucumber.position.y - oceanSupportHeight(generator, cucumber.position.x, cucumber.position.z) - .004) < 1e-12);
  }
});

test('unloading freezes regional clocks; revisits and a new instance restore changed state including death', async () => {
  const store = new MemoryStore();
  const first = new OceanEcology(42, fixtureGenerator(), { store });
  await first.update({ x: 160, z: 160 }); first.step(4);
  const dead = first.agents.find(agent => agent.regionId === '2,2');
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  const expected = agentsOf(first, '2,2');
  const expectedResources = first.snapshot().regions.find(region => region.id === '2,2').resources;
  await first.update({ x: 800, z: 800 }); first.step(30);
  await first.update({ x: 160, z: 160 });
  assert.deepEqual(agentsOf(first, '2,2'), expected);
  assert.deepEqual(first.snapshot().regions.find(region => region.id === '2,2').resources, expectedResources);
  await first.dispose();
  assert.equal(first.agents.length, 0);
  const reloaded = new OceanEcology(42, fixtureGenerator(), { store });
  await reloaded.update({ x: 160, z: 160 });
  assert.deepEqual(agentsOf(reloaded, '2,2'), expected);
  assert.equal(reloaded.agents.find(agent => agent.id === dead.id).alive, false);
  const restoredClock = reloaded.snapshot().regions.find(region => region.id === '2,2').timeSec;
  assert.ok(reloaded.agents.filter(agent => agent.regionId === '2,2').every(agent => agent.timeSec === restoredClock));
});

test('a late read cannot activate an old seed after reset or overwrite the explicitly cleared session', async () => {
  const store = new MemoryStore();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const began = new Promise(resolve => { entered = resolve; });
  const load = store.load.bind(store);
  let delayed = true;
  store.load = async (...args) => {
    if (delayed) { delayed = false; entered(); await gate; }
    return load(...args);
  };
  const ecology = new OceanEcology('old', fixtureGenerator(), { store });
  const loading = ecology.update({ x: 160, z: 160 });
  await began;
  const reset = ecology.reset('new', fixtureGenerator('sand'));
  const next = ecology.update({ x: 300, z: 300 });
  release(); await Promise.all([loading, reset, next]);
  assert.equal(ecology.seed, 'new');
  assert.equal(ecology.snapshot().metrics.activeRegions, 9);
  assert.ok(ecology.agents.every(agent => agent.speciesId === 'black-cucumber'));
  ecology.step(2); await ecology.checkpoint();
  await ecology.reset('new', fixtureGenerator('sand'));
  assert.ok([...store.records.keys()].every(key => !key.startsWith('ecology-v1:string:new|')));
});

test('streaming memory remains bounded across distant exploration and superseded moves', async () => {
  const ecology = new OceanEcology(42, fixtureGenerator(), { store: new MemoryStore() });
  for (let i = 0; i < 16; i++) {
    await ecology.update({ x: i * 200 - 1400, z: i * -100 });
    const snapshot = ecology.snapshot();
    assert.equal(snapshot.metrics.activeRegions, 9);
    assert.ok(snapshot.agents.length <= 9 * OCEAN_REGION_AGENT_LIMIT);
    assert.ok(snapshot.metrics.supportCacheCells <= snapshot.metrics.maxSupportCacheCells);
  }
  await Promise.all([ecology.update({ x: 10000, z: 10000 }), ecology.update({ x: -50000, z: 60000 })]);
  assert.equal(ecology.snapshot().metrics.activeRegions, 9);
  assert.ok(ecology.snapshot().regions.every(region => Math.abs(region.cx - Math.floor(-50000 / 64)) <= 1));
  assert.equal(ecology.snapshot().metrics.loadingRegions, 0);
});

test('failed or unavailable persistence is visible without an unbounded in-memory archive', async () => {
  const failed = { available: true, async load() { throw new Error('quota or read failure'); }, async save() { throw new Error('quota failure'); }, async clear() {} };
  const ecology = new OceanEcology(42, fixtureGenerator('sand'), { store: failed });
  await ecology.update({ x: 160, z: 160 }); ecology.step(2); await ecology.dispose();
  const snapshot = ecology.snapshot();
  assert.equal(snapshot.metrics.persistenceStatus, 'error');
  assert.match(snapshot.metrics.storageError, /failure/);
  assert.equal(snapshot.metrics.activeRegions, 0);
  assert.ok(snapshot.metrics.persistenceErrors > 0);
  const unavailable = new OceanEcology(42, fixtureGenerator('sand'));
  await unavailable.update({ x: 160, z: 160 });
  assert.equal(unavailable.snapshot().metrics.persistenceStatus, 'session-only');
});

test('v1 supplementation preserves old state, is idempotent, and never revives the new dead categories', async () => {
  const store = new MemoryStore(), generator = fixtureGenerator();
  const source = new OceanEcology(42, generator, { store });
  const legacy = source._createRegion(2, 2);
  legacy.agents = legacy.agents.filter(agent => !['giant-clam', 'cleaner-shrimp'].includes(agent.speciesId));
  legacy.timeSec = 12.3; legacy.ticks = 123;
  legacy.resources = { algae: .13, plankton: .24, detritus: .35 };
  legacy.ledger = { initial: .72, input: .2, ingested: .1, exported: .1 };
  legacy.agents[0].alive = false; legacy.agents[0].state = 'dead'; legacy.agents[0].energy = 0;
  legacy.agents[0].lastFeedAt = 7.2; legacy.agents[0].position.x += .01;
  const previous = structuredClone(legacy);
  await store.save('ecology-v1:number:42', '2,2', legacy);
  // More decorative vegetation must not reinitialise a saved food pool.
  const oldChunk = generator.chunk;
  generator.chunk = (...coordinates) => {
    const chunk = oldChunk(...coordinates);
    return { ...chunk, counts: { ...chunk.counts, seagrass: 64 } };
  };
  const restored = new OceanEcology(42, generator, { store });
  await restored.update({ x: 160, z: 160 });
  const region = restored._active.get('2,2');
  assert.deepEqual(region.agents.slice(0, previous.agents.length), previous.agents);
  assert.deepEqual({ ...withoutPelagicUpgrade(region), agents: previous.agents }, previous);
  const additions = withoutPelagicUpgrade(region).agents.slice(previous.agents.length);
  assert.deepEqual(additions.map(agent => agent.speciesId), ['giant-clam', 'cleaner-shrimp']);
  assert.ok(additions.every(agent => agent.id.includes(':host:rock:2,2') && agent.stateSince === 12.3));
  assert.equal(restored._supplementRegion(region), false);
  assert.equal(new Set(region.agents.map(agent => agent.id)).size, region.agents.length);
  assert.ok([...store.records.keys()].every(key => key.startsWith('ecology-v1:number:42|')));
  for (const agent of additions) { agent.alive = false; agent.state = 'dead'; agent.energy = 0; }
  const expected = structuredClone(region);
  await restored.checkpoint();
  await restored.update({ x: 800, z: 800 });
  await restored.update({ x: 160, z: 160 });
  assert.deepEqual(restored._active.get('2,2'), expected);
  const reloaded = new OceanEcology(42, generator, { store });
  await reloaded.update({ x: 160, z: 160 });
  assert.deepEqual(reloaded._active.get('2,2'), expected);
});

test('supplemented categories need actual hosts and suitable shallow attachment, and respect old full records', async () => {
  for (const mode of ['sand', 'seagrass']) {
    const ecology = new OceanEcology(42, fixtureGenerator(mode), { store: new MemoryStore() });
    await ecology.update({ x: 160, z: 160 });
    assert.ok(ecology.agents.every(agent => !['giant-clam', 'cleaner-shrimp'].includes(agent.speciesId)));
  }
  const deep = fixtureGenerator(), sample = deep.sample;
  deep.sample = (...point) => ({ ...sample(...point), floorY: -11, depthM: 19 });
  const depthLimited = new OceanEcology(42, deep, { store: new MemoryStore() });
  await depthLimited.update({ x: 160, z: 160 });
  assert.ok(depthLimited.agents.every(agent => agent.speciesId !== 'giant-clam'));
  const store = new MemoryStore(), generator = fixtureGenerator();
  const source = new OceanEcology(42, generator, { store });
  const full = source._createRegion(2, 2);
  full.agents = full.agents.filter(agent => !['giant-clam', 'cleaner-shrimp'].includes(agent.speciesId));
  while (full.agents.length < OCEAN_REGION_AGENT_LIMIT) full.agents.push({ ...structuredClone(full.agents[0]), id: `old-full:${full.agents.length}` });
  await store.save('ecology-v1:number:42', '2,2', full);
  const restored = new OceanEcology(42, generator, { store });
  await restored.update({ x: 160, z: 160 });
  assert.deepEqual(withoutPelagicUpgrade(restored._active.get('2,2')), full);
  assert.equal(restored.agents.filter(agent => agent.regionId === '2,2').length, OCEAN_REGION_AGENT_LIMIT);
});

test('the fixed clam filters only actual plankton intake; light adds a separate energy proxy with balanced food pools', async () => {
  const create = async (stocked, hour) => {
    const generator = fixtureGenerator(), ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
    await ecology.update({ x: 160, z: 160 });
    const region = ecology._active.get('2,2'), clam = region.agents.find(agent => agent.speciesId === 'giant-clam');
    assert.ok(clam);
    assert.ok(oceanSupportHeight(generator, clam.position.x, clam.position.z) - generator.sample(clam.position.x, clam.position.z).floorY > .06);
    region.agents = [clam]; ecology._active = new Map([['2,2', region]]);
    region.resources = { algae: stocked ? .6 : 0, plankton: stocked ? .5 : 0, detritus: stocked ? .3 : 0 };
    region.ledger = { initial: stocked ? 1.4 : 0, input: 0, ingested: 0, exported: 0 };
    clam.energy = .7; clam.nextBite = 0;
    const position = { ...clam.position }, pools = [], feed = ecology._feed.bind(ecology);
    ecology._feed = (record, animal, pool, amount) => { pools.push(pool); return feed(record, animal, pool, amount); };
    ecology.step(10, { hour, currentMps: 0, turbidity: 0, foodSupply: 0 });
    assert.deepEqual(clam.position, position);
    assert.deepEqual(clam.velocity, { x: 0, y: 0, z: 0 });
    assert.equal(clam.state, 'filtering');
    assert.ok(pools.every(pool => pool === 'plankton'));
    assert.ok(ecology.snapshot().metrics.balanceError < 1e-12);
    if (stocked) { assert.ok(region.ledger.ingested > 0); assert.ok(clam.lastFeedAt > 0); }
    else { assert.equal(region.ledger.ingested, 0); assert.equal(clam.lastFeedAt, null); }
    return clam.energy;
  };
  const stockedDay = await create(true, 12), stockedNight = await create(true, 0);
  assert.ok(stockedDay > stockedNight);
  const emptyDay = await create(false, 12), emptyNight = await create(false, 0);
  assert.ok(emptyDay > .7 && emptyNight < .7);
});

test('the benthic shrimp stays within its reef-foot station and cleans only a nearby eligible fish', async () => {
  const generator = fixtureGenerator(), ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
  await ecology.update({ x: 160, z: 160 });
  const region = ecology._active.get('2,2'), shrimp = region.agents.find(agent => agent.speciesId === 'cleaner-shrimp');
  const client = region.agents.find(agent => agent.speciesId === 'lined-tang');
  const clam = region.agents.find(agent => agent.speciesId === 'giant-clam');
  assert.ok(shrimp && client && clam);
  assert.equal(shrimp.refugeHostId, 'rock:2,2');
  assert.equal(shrimp.habitat, 'reef-foot-cleaning-station');
  assert.ok(oceanSupportHeight(generator, shrimp.position.x, shrimp.position.z) - generator.sample(shrimp.position.x, shrimp.position.z).floorY < .03);
  ecology._active = new Map([['2,2', region]]);
  region.agents = [shrimp, client, clam];
  const putClient = offset => {
    client.position = { x: shrimp.home.x + offset, y: shrimp.home.y + .1, z: shrimp.home.z };
    client.home = { ...client.position }; client.target = { ...client.position };
    client.nextDecision = 1000; client.energy = .95; client.parasites = .4;
  };
  clam.position = { ...shrimp.home }; clam.parasites = .8;
  putClient(2);
  ecology.step(.1);
  assert.equal(shrimp.state, 'foraging');
  assert.equal(region.counters.cleaning, 0);
  assert.equal(client.parasites, .4);
  assert.equal(clam.parasites, .8); // a large nearby clam is never a fish client
  putClient(.3); shrimp.nextBite = 0;
  ecology.step(.1);
  assert.equal(shrimp.state, 'cleaning');
  assert.ok(client.parasites < .4);
  assert.ok(region.counters.cleaning > 0 && shrimp.lastFeedAt === region.timeSec);
  putClient(2);
  for (let i = 0; i < 100; i++) {
    ecology.step(.1);
    assert.equal(shrimp.state, 'foraging');
    assert.ok(Math.hypot(shrimp.position.x - shrimp.home.x, shrimp.position.z - shrimp.home.z) <= .28 + 1e-10);
    assert.ok(Math.abs(shrimp.position.y - oceanSupportHeight(generator, shrimp.position.x, shrimp.position.z) - .004) < 1e-12);
    assert.equal(shrimp.velocity.y, 0);
  }
});

test('cached and uncached support agree with actual transformed mesh ray hits for all three rock forms', () => {
  for (const profile of OCEAN_ROCK_PROFILES) {
    const generator = fixtureGenerator('reef', profile), original = generator.chunk;
    generator.chunk = (...coordinates) => {
      const chunk = original(...coordinates);
      return { ...chunk, elements: chunk.elements.map(element => element.kind === 'rock' ? { ...element, rotation: .37 } : element) };
    };
    const rock = generator.chunk(2, 2).elements[0], data = oceanRockMesh(profile);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex([...data.indices]);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(rock.x, rock.y, rock.z); mesh.scale.set(rock.scale.x, rock.scale.y, rock.scale.z); mesh.rotation.y = rock.rotation;
    mesh.updateMatrixWorld(true);
    const ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (let iz = -6; iz <= 6; iz++) for (let ix = -6; ix <= 6; ix++) {
      const x = 160 + ix * .8 + .037, z = 160 + iz * .67 + .019;
      ray.set(new THREE.Vector3(x, 10, z), down);
      const hit = ray.intersectObject(mesh)[0], expected = hit ? Math.max(-5, hit.point.y) : -5;
      assert.ok(Math.abs(oceanSupportHeight(generator, x, z) - expected) < 1e-6, `${profile} support at ${x},${z}`);
      assert.ok(Math.abs(ecology._surface(x, z) - expected) < 1e-6, `${profile} cached support at ${x},${z}`);
      assert.equal(ecology._surface(x, z, true), oceanSupportHeight(generator, x, z, { avoidCoral: true }));
    }
    geometry.dispose(); material.dispose();
  }
});

test('old v1 records reanchor only four Y coordinates once, retaining ecology and dead individuals across reload', async () => {
  for (const [index, profile] of OCEAN_ROCK_PROFILES.entries()) {
    const store = new MemoryStore(), generator = fixtureGenerator('reef', profile);
    const source = new OceanEcology(42, generator, { store }), legacy = source._createRegion(2, 2);
    if (index === 0) delete legacy.surfaceVersion; else legacy.surfaceVersion = 1;
    legacy.ticks = 417; legacy.timeSec = 41.7;
    legacy.resources = { algae: .19, plankton: .23, detritus: .31 };
    legacy.ledger = { initial: .73, input: .4, ingested: .2, exported: .2 };
    legacy.counters = { feeding: 37, escapes: 5, cleaning: 2, predation: 1, deaths: 2 };
    const oldSupport = (x, z, fish) => {
      const radius = ((x - 160) / 5) ** 2 + ((z - 160) / 4) ** 2;
      let height = radius <= 1 ? -5 + 3 * Math.sqrt(1 - radius) : -5;
      if (fish && ((x - 160) / .5) ** 2 + ((z - 160) / .5) ** 2 <= 1) height = Math.max(height, -1);
      return height;
    };
    for (const agent of legacy.agents) {
      const fish = speciesById[agent.speciesId].kind === 'fish';
      for (const point of [agent.position, agent.home, agent.target, agent.refuge]) point.y = oldSupport(point.x, point.z, fish) + agent.supportOffset;
      agent.lastFeedAt = 17.2; agent.nextBite = 42.1; agent.nextDecision = 44; agent.decisions = 9;
    }
    const fish = legacy.agents.find(agent => speciesById[agent.speciesId].kind === 'fish');
    fish.position = { x: 160, y: -.4, z: 160 }; // .6m above the old coral clearance proxy
    fish.home = { x: 162, y: oldSupport(162, 160, true) + .35, z: 160 };
    fish.target = { x: 180, y: 12, z: 180 }; // apply the existing near-surface cap
    fish.refuge = { x: 160, y: -1.03, z: 160 }; // protect a formerly marginal clearance
    fish.alive = false; fish.state = 'dead'; fish.energy = 0; fish.velocity = { x: 0, y: 0, z: 0 };
    const clam = legacy.agents.find(agent => agent.speciesId === 'giant-clam');
    clam.alive = false; clam.state = 'dead'; clam.energy = 0;
    const previous = structuredClone(legacy);
    await store.save('ecology-v1:number:42', '2,2', legacy);
    const restored = new OceanEcology(42, generator, { store });
    await restored.update({ x: 160, z: 160 });
    const current = restored._active.get('2,2');
    const withoutSupportY = region => {
      const record = withoutPelagicUpgrade(region); delete record.surfaceVersion;
      for (const agent of record.agents) for (const name of ['position', 'home', 'target', 'refuge']) delete agent[name].y;
      return record;
    };
    assert.deepEqual(withoutSupportY(current), withoutSupportY(previous));
    assert.equal(current.surfaceVersion, OCEAN_ROCK_SURFACE_VERSION);
    assert.equal(current.version, 1);
    assert.equal(withoutPelagicUpgrade(current).agents.length, previous.agents.length);
    for (const agent of withoutPelagicUpgrade(current).agents) {
      const old = previous.agents.find(candidate => candidate.id === agent.id), isFish = speciesById[agent.speciesId].kind === 'fish';
      for (const name of ['position', 'home', 'target', 'refuge']) {
        const point = agent[name], surface = oceanSupportHeight(generator, point.x, point.z, { avoidCoral: isFish });
        if (isFish) {
          const clearance = Math.max(.08, old[name].y - oldSupport(point.x, point.z, true));
          assert.ok(Math.abs(point.y - Math.max(surface + .08, Math.min(OCEAN_SURFACE_Y - .6, surface + clearance))) < 1e-12);
        } else assert.ok(Math.abs(point.y - surface - old.supportOffset) < 1e-12);
      }
    }
    assert.equal(current.agents.find(agent => agent.id === fish.id).alive, false);
    assert.equal(current.agents.find(agent => agent.id === clam.id).alive, false);
    assert.equal(restored._reanchorRegion(current), false);
    const expected = structuredClone(current);
    assert.deepEqual(await store.load('ecology-v1:number:42', '2,2'), expected);
    await restored.update({ x: 800, z: 800 }); await restored.update({ x: 160, z: 160 });
    assert.deepEqual(restored._active.get('2,2'), expected);
    const reloaded = new OceanEcology(42, generator, { store });
    await reloaded.update({ x: 160, z: 160 });
    assert.deepEqual(reloaded._active.get('2,2'), expected);
  }
});

test('new fixed clams and reef-foot shrimp retain suitable support on every rock form', async () => {
  for (const profile of OCEAN_ROCK_PROFILES) {
    const generator = fixtureGenerator('reef', profile), ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
    await ecology.update({ x: 160, z: 160 });
    const region = ecology._active.get('2,2');
    assert.equal(region.surfaceVersion, OCEAN_ROCK_SURFACE_VERSION);
    const clam = region.agents.find(agent => agent.speciesId === 'giant-clam'), shrimp = region.agents.find(agent => agent.speciesId === 'cleaner-shrimp');
    assert.ok(clam && shrimp);
    const clamPosition = { ...clam.position };
    ecology.step(2);
    assert.deepEqual(clam.position, clamPosition);
    assert.equal(clam.state, 'filtering');
    assert.ok(oceanSupportHeight(generator, clam.position.x, clam.position.z) + 5 > .06);
    assert.ok(oceanSupportHeight(generator, shrimp.position.x, shrimp.position.z) + 5 < .03);
    assert.ok(Math.abs(shrimp.position.y - oceanSupportHeight(generator, shrimp.position.x, shrimp.position.z) - .004) < 1e-12);
    assert.ok(Math.hypot(shrimp.position.x - shrimp.home.x, shrimp.position.z - shrimp.home.z) <= .28 + 1e-10);
  }
});

test('regional resource transport uses local water while actual agents preserve support and the food ledger', async () => {
  const generator = createOceanGenerator(42), ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
  await ecology.update({ x: 160, z: 160 });
  const baseline = { currentMps: .4, turbidity: .3, hour: 12, foodSupply: .8 };
  ecology.setEnvironment(baseline);
  const before = ecology.snapshot();
  assert.ok(new Set(before.regions.map(region => region.localEnvironment.currentMps.toFixed(6))).size > 1);
  assert.ok(new Set(before.regions.map(region => region.localEnvironment.turbidity.toFixed(6))).size > 1);
  ecology.step(6, baseline);
  const after = ecology.snapshot();
  for (const region of after.regions) {
    const old = before.regions.find(candidate => candidate.id === region.id), local = region.localEnvironment;
    const expectedInput = 6 * (.0007 * local.lightAtDepth + .0012 * local.foodSupply * (1 + local.currentMps) + .0002);
    assert.ok(Math.abs(region.ledger.input - old.ledger.input - expectedInput) < 1e-12);
    assert.equal(region.timeSec, 6);
  }
  const averageVisibility = after.regions.reduce((sum, region) => sum + region.localEnvironment.visibilityM, 0) / after.regions.length;
  assert.equal(after.metrics.visibilityM, averageVisibility);
  assert.match(after.metrics.environmentScope, /region centres/);
  assert.ok(after.metrics.balanceError < 1e-12);
  for (const agent of after.agents) {
    const fish = speciesById[agent.speciesId].kind === 'fish';
    const ray = speciesById[agent.speciesId].kind === 'ray';
    const surface = oceanSupportHeight(generator, agent.position.x, agent.position.z, { avoidCoral: fish || ray });
    assert.ok(Object.values(agent.position).every(Number.isFinite));
    if (ray) assert.ok(agent.position.y >= surface + 1.5 - 1e-10 && agent.position.y <= OCEAN_SURFACE_Y - 2);
    else if (fish) assert.ok(agent.position.y >= surface + .08 - 1e-10);
    else assert.ok(Math.abs(agent.position.y - surface - .004) < 1e-10);
  }
});

test('schooling drift accepts signed X and Z currents without escaping regional bounds', async () => {
  const ecology = new OceanEcology(42, fixtureGenerator(), { store: new MemoryStore() });
  await ecology.update({ x: 160, z: 160 });
  const fish = ecology.agents.find(agent => agent.regionId === '2,2' && agent.speciesId === 'green-chromis');
  fish.position = { x: 180, y: -3, z: 180 };
  ecology._move(fish, { ...fish.position }, 0, .1, { x: -.6, z: .4 });
  assert.ok(Math.abs(fish.position.x - (180 - .0024)) < 1e-12);
  assert.ok(Math.abs(fish.position.z - (180 + .0016)) < 1e-12);
  fish.position = { x: 191.49999, y: -3, z: 191.49999 };
  ecology._move(fish, { ...fish.position }, 0, .1, { x: .6, z: .4 });
  assert.equal(fish.position.x, 191.5);
  assert.equal(fish.position.z, 191.5);
});

test('paused baseline changes update derived summaries without changing or resetting persistent ecology', async () => {
  const store = new MemoryStore(), generator = fixtureGenerator(), ecology = new OceanEcology(42, generator, { store });
  await ecology.update({ x: 160, z: 160 }); ecology.step(4);
  ecology.snapshot(); // expose the existing derived agent clock before comparison
  const previous = structuredClone([...ecology._active]);
  ecology.setEnvironment({ currentMps: .7, turbidity: .85, foodSupply: 0, hour: 0 });
  ecology.step(0);
  const paused = ecology.snapshot();
  assert.deepEqual([...ecology._active], previous);
  assert.ok(paused.regions.every(region => region.localEnvironment.hour === 0 && region.localEnvironment.foodSupply === 0 && region.localEnvironment.lightAtDepth === 0));
  const environment = { ...ecology._environment };
  assert.throws(() => ecology.setEnvironment({ currentMps: .3, turbidity: NaN }), /finite/);
  assert.deepEqual(ecology._environment, environment);
  await ecology.checkpoint();
  const expected = structuredClone(ecology._active.get('2,2'));
  await ecology.update({ x: 800, z: 800 }); await ecology.update({ x: 160, z: 160 });
  assert.deepEqual(ecology._active.get('2,2'), expected);
  const restored = new OceanEcology(42, generator, { store });
  await restored.update({ x: 160, z: 160 });
  assert.deepEqual(restored._active.get('2,2'), expected);
  assert.ok([...store.records.keys()].every(key => key.startsWith('ecology-v1:number:42|')));
});

test('regional fish light responses use their own actual depth rather than the sea-floor summary', async () => {
  const generator = fixtureGenerator(), sample = generator.sample;
  const ecology = new OceanEcology(42, generator, { store: new MemoryStore() });
  await ecology.update({ x: 160, z: 160 });
  const region = ecology._active.get('2,2'), school = region.agents.filter(agent => agent.speciesId === 'green-chromis');
  // Isolate the operational light response of already-present fish. New
  // occupancy should not manufacture a shallow-reef school on a 28m floor.
  generator.sample = (...point) => ({ ...sample(...point), floorY: -20, depthM: 28 });
  const [shallow, deeper] = school;
  for (const [agent, y] of [[shallow, 5], [deeper, -14]]) {
    agent.position = { x: 180, y, z: 180 }; agent.home = { ...agent.position };
    agent.target = { ...agent.position }; agent.refuge = { ...agent.position };
    agent.nextDecision = 999; agent.nextBite = 999; agent.fleeUntil = 0; agent.energy = .9;
  }
  region.agents = [shallow, deeper]; ecology._active = new Map([['2,2', region]]);
  ecology.step(.1, { hour: 12, turbidity: 1, currentMps: 0 });
  assert.equal(shallow.state, 'schooling');
  assert.equal(deeper.state, 'hiding');
  assert.ok(ecology.snapshot().regions[0].localEnvironment.lightAtDepth < .05);
});
