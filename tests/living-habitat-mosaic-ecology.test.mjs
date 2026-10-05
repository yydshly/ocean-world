import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent, reefGuildFootRadius } from '../src/oceanReefGuild.js';
import { reefGuildSupportHeight } from '../src/reefGuildHabitat.js';
import { isOpenWaterLifeAgent, openWaterLifePositionValid } from '../src/oceanOpenWaterLife.js';
import { validateOceanTurtleRecord } from '../src/oceanTurtleCommunity.js';

const seed = livingShallowsSeed('42');
const examples = [
  { theme: 'patch-reef', id: '21,7', x: 1376, z: 480 },
  { theme: 'meadow-edge', id: '19,4', x: 1248, z: 288 },
];
const oldCentre = { x: 928, z: 288 }, far = { x: 2400, z: -1600 };
const clone = value => structuredClone(value);
const capture = entries => clone([...entries]).sort(([a], [b]) => a.localeCompare(b));
const near = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-9, `${message}: ${a} != ${b}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class MemoryStore {
  available = true;
  records = new Map();
  failWrites = false;
  beforeMany = null;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) { await this.saveMany(world, [[id, state]]); }
  async saveMany(world, entries) {
    const pending = clone(entries);
    if (this.failWrites) throw new Error('mosaic atomic write rejected');
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, state] of pending) this.records.set(`${world}|${id}`, state);
  }
}
function storeFrom(records) {
  const store = new MemoryStore(); store.records = new Map(clone(records)); return store;
}
function fixture(store = new MemoryStore(), { mosaic = true, geology = true } = {}) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true,
    livingGeology: geology, habitatMosaic: mosaic });
  return { base, generator, model, store };
}
function bounded(model, generator) {
  assert.ok(model._active.size <= 9);
  assert.ok(generator.registryStats().size <= 25);
  assert.equal(generator.registryStats().limit, 25);
  for (const region of model._active.values()) {
    assert.ok(region.agents.length + (region.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(region), region.id);
    near(livingNetworkBalance(region), 0, `${region.id}: total material balance`);
  }
}
function killOneActualIndividual(model) {
  const owner = [...model._active.values()].find(region => region.agents.some(agent =>
    agent.alive && !isReefGuildAgent(agent) && !isOpenWaterLifeAgent(agent)));
  assert.ok(owner, 'the actual community has an ordinary individual for historical-death persistence');
  const agent = owner.agents.find(candidate => candidate.alive && !isReefGuildAgent(candidate) && !isOpenWaterLifeAgent(candidate));
  agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  recordLivingDeath(owner, agent); owner.counters.deaths++;
  return agent.id;
}

const originals = new Map();
async function originalCapture(geology) {
  if (!originals.has(geology)) originals.set(geology, (async () => {
    const f = fixture(new MemoryStore(), { mosaic: false, geology });
    await f.model.update(oldCentre); f.model.step(.4);
    const deadId = killOneActualIndividual(f.model);
    await f.model.checkpoint();
    if (geology) assert.equal(f.model._active.get('14,4').livingRidgePlan.version, 1);
    return { records: capture(f.store.records), active: capture(f.model._active), deadId };
  })());
  return clone(await originals.get(geology));
}

function initialPhysicalCommunity(f, example) {
  const { model, generator, base } = f;
  const central = model._active.get(example.id);
  assert.equal(central.livingRidgePlan.version, 2);
  assert.equal(central.livingRidgePlan.theme, example.theme);
  const surface = (x, z, coral) => oceanSupportHeight(generator, x, z, { avoidCoral: coral });
  let newHillUsers = 0, grassUsers = 0;
  for (const region of model._active.values()) {
    const chunk = generator.chunk(region.cx, region.cz);
    const rows = new Map(chunk.elements.map(element => [element.id, element]));
    const native = new Set(base.chunk(region.cx, region.cz).elements.map(element => element.id));
    const newHills = new Set(chunk.elements.filter(element => element.kind === 'rock' && !native.has(element.id)).map(element => element.id));
    const count = kind => chunk.elements.filter(element => element.kind === kind).length;
    assert.deepEqual(region.basicNetwork.habitat, {
      algae: Math.min(1, count('algae') / 4), seagrass: Math.min(1, count('seagrass') / 24), coral: Math.min(1, count('coral') / 8),
    }, 'the network initializes from real descriptors rather than declared visual coverage');
    near(region.basicNetwork.plantOrganicUnits, .06 * region.basicNetwork.habitat.seagrass, 'initial plant stock');
    near(region.basicNetwork.coralOrganicUnits, .06 * region.basicNetwork.habitat.coral, 'initial coral stock');
    near(region.basicNetwork.ledger.externalInput,
      (region.reefGuild?.initialInputUnits ?? 0) + (region.openWaterLife?.initialInputUnits ?? 0), 'one explicit initial input');
    assert.equal(region.basicNetwork.processTotals.primaryProduction, 0);
    assert.equal(region.counters.feeding, 0);
    for (const agent of region.agents) {
      const refuge = rows.get(agent.refugeHostId), host = rows.get(refuge?.attachmentId ?? refuge?.id);
      if (region.livingRidgePlan?.version === 2 && newHills.has(host?.id)) {
        if (refuge?.kind === 'coral') {
          near(oceanRockHeight(host, refuge.x, refuge.z), refuge.y, 'the used new-hill coral is actually attached');
          newHillUsers++;
        } else if (agent.speciesId === 'giant-clam') {
          const own = oceanRockHeight(host, agent.home.x, agent.home.z);
          assert.notEqual(own, null); near(agent.home.y, own + .004, 'the new-hill clam is attached'); newHillUsers++;
        } else if (agent.speciesId === 'yellowtail-fusilier') {
          assert.notEqual(oceanRockHeight(host, agent.schoolHome.x, agent.schoolHome.z), null);
          assert.ok(model._pelagicCandidate(agent, agent.position, 0)); newHillUsers++;
        } else if (agent.speciesId === 'lined-tang' || agent.speciesId === 'top-shell' || agent.speciesId === 'blue-starfish') {
          const own = oceanRockHeight(host, agent.home.x, agent.home.z);
          assert.notEqual(own, null); near(own, surface(agent.home.x, agent.home.z), 'the new-hill hard-site uses its own support');
          newHillUsers++;
        }
      }
      if (isOpenWaterLifeAgent(agent)) {
        assert.ok(openWaterLifePositionValid(generator, region, agent, agent.position, { surface }), agent.id);
      } else if (isReefGuildAgent(agent)) {
        const support = reefGuildSupportHeight(surface, agent.position.x, agent.position.z, reefGuildFootRadius(agent), { avoidCoral: true });
        assert.ok(support, agent.id); near(agent.position.y, support.height + .004, 'whole-footprint contact');
      } else {
        const swimmer = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(agent.speciesId);
        assert.ok(agent.position.y >= surface(agent.position.x, agent.position.z, swimmer) + (swimmer ? .08 : .0039), agent.id);
      }
      if (region.livingRidgePlan?.theme === 'meadow-edge' && agent.habitat === 'sand-with-seagrass') {
        const grass = chunk.elements.filter(element => element.kind === 'seagrass');
        assert.ok(grass.some(plant => Math.hypot(plant.x - agent.home.x, plant.z - agent.home.z) <= 3.2));
        near(surface(agent.home.x, agent.home.z), generator.floorSurface(agent.home.x, agent.home.z).height, 'the grass-associated animal uses sediment');
        grassUsers++;
      }
    }
    assert.ok(validateOceanTurtleRecord(region, generator, { surface }));
    if (region.livingRidgePlan?.theme === 'meadow-edge') {
      const neighbouringGrass = new Set();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        for (const row of generator.chunk(region.cx + dx, region.cz + dz).elements) if (row.kind === 'seagrass') neighbouringGrass.add(row.id);
      for (const turtle of region.turtleAgents ?? []) {
        assert.ok(turtle.sourceGrassIds.length >= 6);
        assert.ok(turtle.sourceGrassIds.every(id => neighbouringGrass.has(id)));
        grassUsers++;
      }
    }
  }
  if (example.theme === 'patch-reef') assert.ok(newHillUsers > 0, 'real individuals use an actual new hill, without forcing a particular fish recipe');
  else assert.ok(grassUsers > 0, 'real animals use the meadow; a turtle is not forced when its seeded or physical gate rejects it');
  bounded(model, generator);
}

const fresh = new Map();
async function freshCapture(example) {
  if (!fresh.has(example.theme)) fresh.set(example.theme, (async () => {
    const f = fixture(); await f.model.update(example); initialPhysicalCommunity(f, example);
    const before = capture(f.model._active); await f.model.update(example); await f.model.checkpoint();
    assert.deepEqual(capture(f.model._active), before, 'a second visit does not initialize food or bodies again');
    return { records: capture(f.store.records), active: before };
  })());
  return clone(await fresh.get(example.theme));
}

test('mosaic admission preserves complete v1 and legacy records, including deaths, and never upgrades their plans or food', async () => {
  for (const geology of [false, true]) {
    const before = await originalCapture(geology), f = fixture(storeFrom(before.records));
    await f.model.update(oldCentre);
    assert.deepEqual(capture(f.model._active), before.active);
    assert.deepEqual(capture(f.store.records), before.records);
    const dead = [...f.model._active.values()].flatMap(region => region.agents).find(agent => agent.id === before.deadId);
    assert.equal(dead.alive, false);
    for (const region of f.model._active.values()) assert.notEqual(region.livingRidgePlan?.version, 2);
    bounded(f.model, f.generator);
  }
});

test('both real mosaic themes have physical community use and one descriptor-based material initialization', async () => {
  for (const example of examples) await freshCapture(example);
});

test('pending and rejected v2 commits stay invisible, preserve old disk state, and can be retried', { timeout: 60000 }, async () => {
  const example = examples[0], store = new MemoryStore(), entered = defer(), permit = defer();
  let pendingOwner;
  store.beforeMany = async entries => {
    if (pendingOwner) return;
    const candidate = entries.find(([, region]) => region.livingRidgePlan?.version === 2);
    if (!candidate) return;
    pendingOwner = candidate[1]; entered.resolve(); await permit.promise;
  };
  const delayed = fixture(store), updating = delayed.model.update(example);
  try {
    await Promise.race([entered.promise, updating.then(() => { throw new Error('no v2 atomic gate was reached'); })]);
    assert.equal(delayed.model._active.has(pendingOwner.id), false);
    assert.equal(store.records.has(`${delayed.model._world}|${pendingOwner.id}`), false);
    assert.equal(delayed.generator.getRidgePlan(pendingOwner.id), undefined);
    assert.deepEqual(delayed.generator.chunk(pendingOwner.cx, pendingOwner.cz), delayed.base.chunk(pendingOwner.cx, pendingOwner.cz));
  } finally { permit.resolve(); await updating; }
  assert.equal(delayed.model._active.size, 9); bounded(delayed.model, delayed.generator);
  const original = await originalCapture(false), rejectedStore = storeFrom(original.records);
  rejectedStore.failWrites = true;
  const rejected = fixture(rejectedStore); await rejected.model.update(example);
  assert.equal(rejected.model._active.size, 0);
  assert.equal(rejected.generator.registryStats().ridgePlanOwnerIds.length, 0);
  assert.deepEqual(capture(rejectedStore.records), original.records);
  rejectedStore.failWrites = false; await rejected.model.update(example);
  assert.equal(rejected.model._active.get(example.id).livingRidgePlan.version, 2);
  for (const [key, record] of original.records) assert.deepEqual(rejectedStore.records.get(key), record);
  bounded(rejected.model, rejected.generator);
});

test('a v2 plan mislabeled as another plan class is rejected without replacement, births, or inventory writes', async () => {
  const example = examples[0], initial = await freshCapture(example), store = storeFrom(initial.records);
  const key = initial.records.find(([name]) => name.endsWith(`|${example.id}`))[0];
  store.records.get(key).livingRidgePlan.theme = 'ridge-gully';
  const before = capture(store.records), f = fixture(store);
  await assert.rejects(f.model.update(example), /ridge|habitat|mosaic/i);
  assert.equal(f.model._active.has(example.id), false);
  assert.equal(f.generator.getRidgePlan(example.id), undefined);
  assert.deepEqual(f.generator.chunk(21, 7), f.base.chunk(21, 7));
  assert.deepEqual(capture(store.records), before);
});

test('both complete themes survive genuine all-owner unload, revisit and fresh-facade restoration with deaths and bounded state', async () => {
  const patch = await freshCapture(examples[0]), meadow = await freshCapture(examples[1]);
  const store = storeFrom([...patch.records, ...meadow.records]), f = fixture(store), baselines = [];
  for (const example of examples) {
    if (baselines.length) {
      const oldIds = [...f.model._active.keys()]; await f.model.update(example);
      assert.ok(oldIds.every(id => !f.model._active.has(id)), 'every prior theme owner genuinely unloaded');
    } else await f.model.update(example);
    f.model.step(.4); const deadId = killOneActualIndividual(f.model); await f.model.checkpoint();
    baselines.push({ example, active: capture(f.model._active), deadId }); bounded(f.model, f.generator);
  }
  const oldIds = [...f.model._active.keys()]; await f.model.update(far);
  assert.ok(oldIds.every(id => !f.model._active.has(id))); bounded(f.model, f.generator);
  for (const baseline of baselines) {
    await f.model.update(baseline.example);
    assert.deepEqual(capture(f.model._active), baseline.active); bounded(f.model, f.generator);
    await f.model.checkpoint();
    const reload = fixture(store); await reload.model.update(baseline.example);
    assert.deepEqual(capture(reload.model._active), baseline.active);
    const dead = [...reload.model._active.values()].flatMap(region => region.agents).find(agent => agent.id === baseline.deadId);
    assert.equal(dead.alive, false);
    for (const [id, region] of baseline.active) assert.deepEqual(reload.generator.getRidgePlan(id), region.livingRidgePlan);
    bounded(reload.model, reload.generator);
  }
});
