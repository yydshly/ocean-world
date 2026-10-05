import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanEcology, OCEAN_REGION_AGENT_LIMIT, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { speciesById } from '../src/species.js';
import { oceanSlopeSpeciesById } from '../src/oceanSlopeSpecies.js';

const WORLD = 'ecology-v1:string:42';
const REGION = '4,-2';
const CENTER = { x: 288, z: -96 };
const FAR = { x: 1024, z: 1024 };
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slopeKeys = ['slopeCommunityVersion', 'slopeCommunityAdded', 'slopeInitializedAtSec'];
const pelagicKeys = ['pelagicCommunityVersion', 'pelagicCommunityAdded', 'pelagicInitializedAtSec', 'mantaCommunityVersion', 'mantaCommunityAdded', 'mantaInitializedAtSec'];
// Preserve all fields in the historical prefix, excluding only the separately
// tested appended pelagic/manta cohorts and their one-time upgrade markers.
function withoutPelagicUpgrade(region) {
  const projected = clone(region);
  for (const key of pelagicKeys) delete projected[key];
  projected.agents = projected.agents.filter(agent => !['pelagic-community-v1', 'manta-community-v1'].includes(agent.populationOrigin));
  return projected;
}

class MemoryStore {
  available = true;
  records = new Map();
  saves = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) {
    await this.onSave?.(world, id, state);
    this.saves.push({ world, id, state: clone(state) });
    this.records.set(`${world}|${id}`, clone(state));
  }
  async clear(world) {
    for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key);
  }
}

function setup(store = new MemoryStore()) {
  const generator = createOceanGenerator('42');
  return { generator, store, ecology: new OceanEcology('42', generator, { store }) };
}

function priorProjection(region, priorLength) {
  const projected = withoutPelagicUpgrade(region);
  for (const key of slopeKeys) delete projected[key];
  projected.agents = projected.agents.slice(0, priorLength);
  return projected;
}

function legacyRecord(ecology, count = 0, speciesId = 'blue-starfish') {
  const region = ecology._createRegion(4, -2);
  assert.equal(region.agents.length, 0, 'the former shallow recipe must remain empty at this real deep slope');
  const populated = clone(region);
  assert.equal(ecology._supplementSlopeRegion(populated), true);
  const template = populated.agents.find(agent => agent.speciesId === speciesId);
  assert.ok(template);
  region.timeSec = 32.8; region.ticks = 328;
  region.resources = { algae: .21, plankton: .33, detritus: .47 };
  region.ledger = { initial: 1.07, input: .19, ingested: .1, exported: .15 };
  region.counters = { feeding: 17, escapes: 3, cleaning: 2, predation: 1, deaths: 2 };
  region.events = [{ id: 'old-event', timeSec: 8.2, type: 'feeding', agentId: 'historical:0' }];
  region.agents = Array.from({ length: count }, (_, index) => ({ ...clone(template),
    id: `historical:${index}`, populationOrigin: 'historical', alive: index % 2 === 0,
    state: index % 2 === 0 ? 'foraging' : 'dead', energy: index % 2 === 0 ? .72 : 0,
    velocity: { x: .013, y: -.002, z: -.01 }, stateSince: 12.4,
    lastFeedAt: 8.2, nextBite: 34, nextDecision: 35, decisions: 9,
    timeSec: 32.8 }));
  return region;
}

function forbidRebuild(ecology) {
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== 4 || cz !== -2, 'a valid saved population cannot enter initial allocation');
    return create(cx, cz);
  };
}

test('the real deep slope adds a deterministic supported cohort without changing the shallow catalog or scenery', async () => {
  const { ecology, generator } = setup();
  const originalCatalog = hash(speciesById);
  const originalGeometry = hash({ chunk: generator.chunk(4, -2), sample: generator.sample(CENTER.x, CENTER.z) });
  const baseline = ecology._createRegion(4, -2);
  await ecology.update(CENTER);
  const current = ecology._active.get(REGION);
  assert.deepEqual(priorProjection(current, 0), baseline);
  assert.equal(current.slopeCommunityVersion, 1);
  const slopeCohort = current.agents.filter(agent => agent.populationOrigin === 'slope-community-v1');
  assert.equal(current.slopeCommunityAdded, slopeCohort.length);
  assert.equal(current.slopeInitializedAtSec, 0);
  const fish = current.agents.filter(agent => agent.speciesId === 'lyretail-anthias');
  const stars = current.agents.filter(agent => agent.speciesId === 'blue-starfish');
  assert.ok(fish.length >= 4 && fish.length <= 10);
  assert.ok(stars.length >= 1 && stars.length <= 2);
  const hosts = new Map(generator.chunk(4, -2).elements.filter(element => element.kind === 'formation').map(host => [host.id, host]));
  for (const agent of slopeCohort) {
    const host = hosts.get(agent.refugeHostId);
    assert.ok(host, 'every new animal has an actual locally owned formation');
    assert.ok(agent.id.includes(`:slope:${host.id}:`));
    const depth = generator.sample(agent.position.x, agent.position.z).depthM;
    assert.ok(depth >= 22 && depth <= 35);
    const surface = oceanSupportHeight(generator, agent.position.x, agent.position.z);
    assert.ok(Math.abs(surface - oceanRockHeight(host, agent.position.x, agent.position.z)) < .03);
    assert.ok(Math.abs(agent.position.y - surface - agent.supportOffset) < 1e-12);
    assert.ok(agent.position.y < OCEAN_SURFACE_Y);
    assert.equal(agent.lastFeedAt, null);
    assert.equal(agent.populationOrigin, 'slope-community-v1');
  }
  for (const groupId of new Set(fish.map(agent => agent.groupId))) {
    assert.ok(fish.filter(agent => agent.groupId === groupId).length >= 4);
  }
  assert.equal(hash(speciesById), originalCatalog);
  assert.equal(speciesById['lyretail-anthias'], undefined);
  assert.equal(oceanSlopeSpeciesById['lyretail-anthias'].guild, 'planktivore');
  assert.equal(hash({ chunk: generator.chunk(4, -2), sample: generator.sample(CENTER.x, CENTER.z) }), originalGeometry);
  const reordered = setup();
  await reordered.ecology.update(FAR);
  await reordered.ecology.update(CENTER);
  assert.deepEqual(reordered.ecology._active.get(REGION), current);
});

test('a valid old live/dead record is saved before activation with only appended identities and slope markers', async () => {
  const { ecology, store } = setup();
  const old = legacyRecord(ecology, 2), historicalHash = hash(old);
  store.records.set(`${WORLD}|${REGION}`, clone(old));
  forbidRebuild(ecology);
  let checkedSave = false;
  store.onSave = (world, id, state) => {
    if (id !== REGION) return;
    assert.equal(world, WORLD);
    assert.equal(ecology._active.has(REGION), false);
    assert.equal(hash(priorProjection(state, old.agents.length)), historicalHash);
    checkedSave = true;
  };
  await ecology.update(CENTER);
  const current = ecology._active.get(REGION);
  assert.ok(checkedSave);
  assert.equal(hash(priorProjection(current, old.agents.length)), historicalHash);
  assert.deepEqual(store.records.get(`${WORLD}|${REGION}`), current);
  const additions = current.agents.filter(agent => agent.populationOrigin === 'slope-community-v1');
  assert.ok(additions.length >= 4);
  assert.ok(additions.every(agent => agent.speciesId === 'lyretail-anthias'));
  assert.equal(current.slopeInitializedAtSec, old.timeSec);
  for (const agent of additions) {
    assert.equal(agent.stateSince, old.timeSec);
    assert.equal(agent.nextDecision, old.timeSec);
    assert.ok(agent.nextBite > old.timeSec);
    assert.equal(agent.lastFeedAt, null);
  }
  const pausedHash = hash(current);
  ecology.step(0, { hour: 0, foodSupply: 0 });
  assert.equal(hash(current), pausedHash);
  assert.equal(ecology._supplementSlopeRegion(current), false);
  assert.equal(hash(current), pausedHash);
  assert.ok([...store.records.keys()].every(key => key.startsWith(`${WORLD}|`)));
});

test('an existing alive or dead category prevents refill even before the first slope marker', async () => {
  for (const speciesId of ['lyretail-anthias', 'blue-starfish']) for (const alive of [false, true]) {
    const { ecology } = setup();
    const region = legacyRecord(ecology, 1, speciesId);
    region.agents[0].alive = alive; region.agents[0].state = alive ? 'foraging' : 'dead';
    region.agents[0].energy = alive ? .72 : 0;
    const before = clone(region);
    assert.equal(ecology._supplementSlopeRegion(region), true);
    assert.deepEqual(priorProjection(region, 1), before);
    assert.equal(region.agents.filter(agent => agent.speciesId === speciesId).length, 1);
    assert.ok(region.agents.length > 1, 'the independently missing other category can still be added');
  }
});

test('dead individuals consume the 20 slots and fewer than four free slots cannot create a partial shoal', async () => {
  for (const count of [20, 17, 16]) {
    const { ecology, store } = setup();
    const old = legacyRecord(ecology, count);
    store.records.set(`${WORLD}|${REGION}`, clone(old));
    forbidRebuild(ecology);
    await ecology.update(CENTER);
    const region = ecology._active.get(REGION);
    assert.deepEqual(priorProjection(region, count), old);
    assert.ok(region.agents.length <= OCEAN_REGION_AGENT_LIMIT);
    const added = region.agents.slice(count).filter(agent => agent.populationOrigin === 'slope-community-v1');
    assert.equal(added.length, count === 16 ? 4 : 0);
    assert.ok(added.every(agent => agent.speciesId === 'lyretail-anthias'));
    assert.equal(region.slopeCommunityAdded, added.length);
    assert.equal(region.agents.filter(agent => !agent.alive).length, old.agents.filter(agent => !agent.alive).length);
    assert.equal(new Set(region.agents.map(agent => agent.id)).size, region.agents.length);
  }
});

test('throwing or explicit-null migration saves roll back new animals and markers before activation', async () => {
  for (const failure of ['throw', 'null']) {
    const { ecology, store } = setup();
    const old = legacyRecord(ecology), expectedHash = hash(old);
    store.records.set(`${WORLD}|${REGION}`, clone(old));
    forbidRebuild(ecology);
    let attempts = 0;
    store.save = async (world, id, state) => {
      if (id !== REGION) return;
      attempts++;
      assert.equal(world, WORLD);
      assert.equal(ecology._active.has(REGION), false);
      assert.ok(state.agents.length >= 5 && state.slopeCommunityVersion === 1);
      if (failure === 'throw') throw new Error('slope-save-rejected');
      return null;
    };
    await ecology.update(CENTER);
    assert.equal(attempts, 1);
    assert.equal(hash(ecology._active.get(REGION)), expectedHash);
    assert.equal(hash(store.records.get(`${WORLD}|${REGION}`)), expectedHash);
    if (failure === 'throw') {
      assert.equal(ecology.snapshot().metrics.persistenceStatus, 'error');
      assert.match(ecology.snapshot().metrics.storageError, /slope-save-rejected/);
    }
  }
});

test('new deaths and one-time cohort identities survive paused unload, revisit and a fresh model', async () => {
  const { ecology, store, generator } = setup();
  await ecology.update(CENTER);
  const region = ecology._active.get(REGION);
  for (const speciesId of ['lyretail-anthias', 'blue-starfish']) {
    const victim = region.agents.find(agent => agent.speciesId === speciesId);
    victim.energy = .00000001;
  }
  ecology.step(.1);
  assert.equal(region.agents.filter(agent => !agent.alive).length, 2);
  assert.equal(region.counters.deaths, 2);
  const expected = clone(region), expectedHash = hash(expected);
  await ecology.checkpoint();
  await ecology.update(FAR);
  ecology.step(2);
  await ecology.update(CENTER);
  assert.equal(hash(ecology._active.get(REGION)), expectedHash);
  assert.equal(ecology._supplementSlopeRegion(ecology._active.get(REGION)), false);
  const reopened = new OceanEcology('42', generator, { store });
  forbidRebuild(reopened);
  await reopened.update(CENTER);
  assert.deepEqual(reopened._active.get(REGION), expected);
  assert.equal(reopened._active.get(REGION).agents.filter(agent => !agent.alive).length, 2);
  assert.equal(reopened._active.get(REGION).timeSec, .1);
});

test('daytime fish and benthos consume distinct actual pools; night fish rest, pause freezes, and all ledgers balance', async () => {
  const run = async (hour, emptyPlankton = false) => {
    const { ecology, generator } = setup();
    const region = legacyRecord(ecology);
    assert.equal(ecology._supplementSlopeRegion(region), true);
    if (emptyPlankton) {
      region.agents = region.agents.filter(agent => agent.speciesId === 'lyretail-anthias');
      region.resources.plankton = 0;
      region.ledger = { initial: .68, input: 0, ingested: 0, exported: 0 };
    }
    ecology._active.set(REGION, region);
    const before = clone(region);
    ecology.step(0);
    assert.deepEqual(region, before);
    const intakes = [], feed = ecology._feed.bind(ecology);
    ecology._feed = (record, agent, pool, amount) => {
      const taken = feed(record, agent, pool, amount);
      if (taken > 0) intakes.push({ speciesId: agent.speciesId, pool, taken });
      return taken;
    };
    ecology.step(6, { hour, foodSupply: 0, currentMps: 0, turbidity: 0 });
    const fish = region.agents.filter(agent => agent.speciesId === 'lyretail-anthias');
    assert.ok(fish.every(agent => agent.state === (hour === 0 ? 'resting' : 'schooling')));
    const fishIntakes = intakes.filter(intake => intake.speciesId === 'lyretail-anthias');
    if (hour === 0 || emptyPlankton) {
      assert.equal(fishIntakes.length, 0);
      assert.ok(fish.every(agent => agent.lastFeedAt === null));
    } else {
      assert.ok(fishIntakes.length > 0);
      assert.ok(fishIntakes.every(intake => intake.pool === 'plankton'));
      assert.ok(fish.some(agent => agent.lastFeedAt > before.timeSec));
    }
    const starIntakes = intakes.filter(intake => intake.speciesId === 'blue-starfish');
    if (!emptyPlankton) {
      assert.ok(starIntakes.length > 0);
      assert.ok(starIntakes.every(intake => intake.pool === 'algae'));
      for (const star of region.agents.filter(agent => agent.speciesId === 'blue-starfish')) {
        const old = before.agents.find(agent => agent.id === star.id);
        assert.ok(Math.hypot(star.position.x - old.position.x, star.position.z - old.position.z) <= .002 * 6 + 1e-9);
        assert.ok(Math.abs(star.position.y - oceanSupportHeight(generator, star.position.x, star.position.z) - .004) < 1e-12);
      }
    }
    assert.ok(Math.abs(intakes.reduce((total, intake) => total + intake.taken, 0) -
      (region.ledger.ingested - before.ledger.ingested)) < 1e-12);
    const quantity = Object.values(region.resources).reduce((total, value) => total + value, 0);
    assert.ok(Math.abs(region.ledger.initial + region.ledger.input - region.ledger.ingested - region.ledger.exported - quantity) < 1e-12);
    assert.ok(Math.abs(region.timeSec - 38.8) < 1e-12);
  };
  await run(12);
  await run(0);
  await run(12, true);
});
