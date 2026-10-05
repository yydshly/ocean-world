import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefGuildAgent, reefGuildFootRadius } from '../src/oceanReefGuild.js';
import { reefGuildSupportHeight } from '../src/reefGuildHabitat.js';
import { isOpenWaterLifeAgent, openWaterLifePositionValid } from '../src/oceanOpenWaterLife.js';
import { validateOceanTurtleRecord } from '../src/oceanTurtleCommunity.js';

const seed = livingShallowsSeed('42');
// These are real admitted owners, not forced scenery or species fixtures.
const examples = [
  { theme: 'shelf-rise', id: '35,7', x: 2272, z: 480 },
  { theme: 'sand-basin', id: '27,9', x: 1760, z: 608 },
];
const far = { x: 2400, z: -1600 };
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
    if (this.failWrites) throw new Error('seabed atomic write rejected');
    if (this.beforeMany) await this.beforeMany(pending);
    for (const [id, state] of pending) this.records.set(`${world}|${id}`, state);
  }
}
function storeFrom(records) {
  const store = new MemoryStore(); store.records = new Map(clone(records)); return store;
}
function fixture(store = new MemoryStore(), { relief = true, mosaic = true, geology = true } = {}) {
  const base = createLivingShallowsGenerator(seed), generator = createLivingRidgeGenerator(base);
  const model = new OceanEcology(seed, generator, { store, turtles: true,
    livingGeology: geology, habitatMosaic: mosaic, seabedRelief: relief });
  return { base, generator, model, store };
}
function bounded(model, generator) {
  assert.ok(model._active.size <= 9);
  assert.ok(generator.registryStats().size <= 25);
  assert.equal(generator.registryStats().limit, 25);
  assert.equal(generator.floorSurfaceVersion, 1, 'fresh local floors do not trigger historical global reanchoring');
  for (const region of model._active.values()) {
    assert.ok(region.agents.length + (region.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(region), region.id);
    near(livingNetworkBalance(region), 0, `${region.id}: material balance`);
  }
}
function killOneActualIndividual(model) {
  const owner = [...model._active.values()].find(region => region.agents.some(agent =>
    agent.alive && !isReefGuildAgent(agent) && !isOpenWaterLifeAgent(agent)));
  assert.ok(owner, 'a real ordinary individual is available for historical-death persistence');
  const agent = owner.agents.find(candidate => candidate.alive && !isReefGuildAgent(candidate) && !isOpenWaterLifeAgent(candidate));
  agent.alive = false; agent.state = 'dead'; agent.energy = 0;
  recordLivingDeath(owner, agent); owner.counters.deaths++;
  return agent.id;
}
function turtleSourcesRemain(f) {
  const surface = (x, z) => oceanSupportHeight(f.generator, x, z, { avoidCoral: true });
  let actualTurtles = 0;
  for (const region of f.model._active.values()) {
    assert.ok(validateOceanTurtleRecord(region, f.generator, { surface }), region.id);
    const grass = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      for (const row of f.generator.chunk(region.cx + dx, region.cz + dz).elements)
        if (row.kind === 'seagrass') grass.set(row.id, row);
    for (const turtle of region.turtleAgents ?? []) {
      actualTurtles++;
      assert.ok(turtle.sourceGrassIds.length >= 6);
      assert.ok(turtle.sourceGrassIds.every(id => grass.has(id)), 'actual persisted grass references survive neighbouring sources');
    }
  }
  return actualTurtles;
}

const oldKinds = [
  { kind: 'legacy', position: { x: 448, z: 240 }, geology: false, mosaic: false },
  { kind: 'v1', position: { x: 928, z: 288 }, geology: true, mosaic: false, id: '14,4', version: 1 },
  { kind: 'v2', position: { x: 1248, z: 288 }, geology: true, mosaic: true, id: '19,4', version: 2 },
];
const originals = new Map();
async function originalCapture(spec) {
  if (!originals.has(spec.kind)) originals.set(spec.kind, (async () => {
    const f = fixture(new MemoryStore(), { relief: false, geology: spec.geology, mosaic: spec.mosaic });
    await f.model.update(spec.position); f.model.step(.4);
    const deadId = killOneActualIndividual(f.model); await f.model.checkpoint();
    if (spec.version) assert.equal(f.model._active.get(spec.id).livingRidgePlan.version, spec.version);
    if (spec.kind === 'legacy') assert.ok(turtleSourcesRemain(f) > 0, 'the already-validated original meadow supplies a genuine saved turtle');
    return { records: capture(f.store.records), active: capture(f.model._active), deadId };
  })());
  return clone(await originals.get(spec.kind));
}

function witness(plan, generator, base) {
  const p = plan.floorPatch.mostDisplaced;
  return p && Math.abs(generator.floorSurface(p.x, p.z).height - base.floorSurface(p.x, p.z).height) > .01 ? p : undefined;
}
function physicalInitialCommunity(f, example) {
  const { generator, base, model } = f, centre = model._active.get(example.id);
  assert.equal(centre.livingRidgePlan.version, 3);
  assert.equal(centre.livingRidgePlan.theme, example.theme);
  const p = witness(centre.livingRidgePlan, generator, base);
  assert.ok(p, 'the true owner has a nonzero committed seabed displacement');
  near(generator.sample(p.x, p.z).floorY, generator.floorSurface(p.x, p.z).height, 'sample and physical triangle height agree');
  near(generator.sample(p.x, p.z).depthM, 8 - generator.floorSurface(p.x, p.z).height, 'real depth follows the new bed');
  near(generator.floorVertex(Math.floor(p.x), Math.floor(p.z)),
    generator.floorSurface(Math.floor(p.x), Math.floor(p.z)).height, 'render and physical vertices agree');
  const surface = (x, z, coral) => oceanSupportHeight(generator, x, z, { avoidCoral: coral });
  let newFloorUsers = 0;
  for (const region of model._active.values()) {
    const chunk = generator.chunk(region.cx, region.cz), counts = kind => chunk.elements.filter(row => row.kind === kind).length;
    const habitat = { algae: Math.min(1, counts('algae') / 4), seagrass: Math.min(1, counts('seagrass') / 24), coral: Math.min(1, counts('coral') / 8) };
    assert.deepEqual(region.basicNetwork.habitat, habitat, 'real descriptors initialize stocks, not visual coverage metadata');
    near(region.basicNetwork.plantOrganicUnits, .06 * habitat.seagrass, 'initial plant stock');
    near(region.basicNetwork.coralOrganicUnits, .06 * habitat.coral, 'initial coral stock');
    near(region.basicNetwork.ledger.externalInput,
      (region.reefGuild?.initialInputUnits ?? 0) + (region.openWaterLife?.initialInputUnits ?? 0), 'one recorded new-body/prey input');
    assert.equal(region.basicNetwork.processTotals.primaryProduction, 0);
    assert.equal(region.counters.feeding, 0);
    if (region.livingRidgePlan?.version === 3) {
      const finalRows = new Map(chunk.elements.map(row => [row.id, row]));
      for (const row of base.chunk(region.cx, region.cz).elements)
        if (row.kind !== 'rubble') assert.deepEqual(finalRows.get(row.id), row, 'native hosts, attachments, roots and props stay exact');
      for (const row of chunk.elements) if (row.kind === 'rubble')
        near(row.y, generator.floorSurface(row.x, row.z).height, 'fresh rubble rests on the actual new sediment');
    }
    for (const agent of region.agents) {
      if (isOpenWaterLifeAgent(agent)) {
        assert.ok(openWaterLifePositionValid(generator, region, agent, agent.position, { surface }), agent.id);
      } else if (isReefGuildAgent(agent)) {
        const contact = reefGuildSupportHeight(surface, agent.position.x, agent.position.z, reefGuildFootRadius(agent), { avoidCoral: true });
        assert.ok(contact, agent.id); near(agent.position.y, contact.height + .004, 'new guild whole-footprint contact');
      } else {
        const swimmer = ['green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'yellowtail-fusilier', 'lyretail-anthias', 'reef-manta'].includes(agent.speciesId);
        assert.ok(agent.position.y >= surface(agent.position.x, agent.position.z, swimmer) + (swimmer ? .08 : .0039), agent.id);
        if (!swimmer) near(agent.home.y, surface(agent.home.x, agent.home.z) + .004, 'actual benthic birth uses shared support');
        if (agent.speciesId === 'black-cucumber') {
          assert.notEqual(generator.sample(agent.home.x, agent.home.z).substrate, 'rock');
          near(surface(agent.home.x, agent.home.z), generator.floorSurface(agent.home.x, agent.home.z).height, 'deposit feeder remains on sediment');
        }
      }
      if (region.livingRidgePlan?.version === 3 &&
          Math.abs(generator.floorSurface(agent.home.x, agent.home.z).height - base.floorSurface(agent.home.x, agent.home.z).height) > .0001) {
        newFloorUsers++;
        near(generator.sample(agent.home.x, agent.home.z).depthM,
          8 - generator.floorSurface(agent.home.x, agent.home.z).height, 'actual birth depth follows relief');
      }
    }
  }
  turtleSourcesRemain(f); bounded(model, generator);
  return newFloorUsers;
}

const fresh = new Map();
async function freshCapture(example) {
  if (!fresh.has(example.id)) fresh.set(example.id, (async () => {
    const f = fixture(); await f.model.update(example);
    const users = physicalInitialCommunity(f, example), before = capture(f.model._active);
    await f.model.update(example); await f.model.checkpoint();
    assert.deepEqual(capture(f.model._active), before, 'repeated visit does not initialize bodies or stocks twice');
    return { records: capture(f.store.records), active: before, users };
  })());
  return clone(await fresh.get(example.id));
}

test('relief admission preserves full legacy/v1/v2 states and deaths, including genuine saved turtle grass references', async () => {
  for (const spec of oldKinds) {
    const before = await originalCapture(spec), f = fixture(storeFrom(before.records));
    await f.model.update(spec.position);
    assert.deepEqual(capture(f.model._active), before.active);
    assert.deepEqual(capture(f.store.records), before.records);
    const dead = [...f.model._active.values()].flatMap(region => region.agents).find(agent => agent.id === before.deadId);
    assert.equal(dead.alive, false);
    for (const region of f.model._active.values()) assert.notEqual(region.livingRidgePlan?.version, 3);
    turtleSourcesRemain(f); bounded(f.model, f.generator);
  }
});

test('both true relief themes give real shared-floor births and one balanced descriptor-based initialization', async () => {
  assert.equal(examples.length, 2);
  let users = 0;
  for (const example of examples) users += (await freshCapture(example)).users;
  assert.ok(users > 0, 'an actual existing individual is born over displaced floor; no particular species is forced');
});

test('pending and rejected relief commits expose no candidate bed or population, preserve old disk and allow retry', { timeout: 60000 }, async () => {
  const example = examples[0], store = new MemoryStore(), entered = defer(), permit = defer();
  let pendingOwner;
  store.beforeMany = async entries => {
    if (pendingOwner) return;
    const candidate = entries.find(([, region]) => region.livingRidgePlan?.version === 3);
    if (!candidate) return;
    pendingOwner = candidate[1]; entered.resolve(); await permit.promise;
  };
  const delayed = fixture(store), updating = delayed.model.update(example);
  try {
    await Promise.race([entered.promise, updating.then(() => { throw new Error('no v3 atomic gate was reached'); })]);
    assert.equal(delayed.model._active.has(pendingOwner.id), false);
    assert.equal(store.records.has(`${delayed.model._world}|${pendingOwner.id}`), false);
    assert.equal(delayed.generator.getRidgePlan(pendingOwner.id), undefined);
    assert.equal(delayed.generator.isRidgeOwnerReady(pendingOwner.id), false);
    const plan = pendingOwner.livingRidgePlan;
    const p = delayed.generator.withRidgePlan(plan, () => witness(plan, delayed.generator, delayed.base));
    assert.ok(p, 'temporary birth floor was truly displaced');
    assert.deepEqual(delayed.generator.floorSurface(p.x, p.z), delayed.base.floorSurface(p.x, p.z));
    assert.deepEqual(delayed.generator.sample(p.x, p.z), delayed.base.sample(p.x, p.z));
    near(delayed.generator.floorVertex(Math.floor(p.x), Math.floor(p.z)), delayed.base.floorVertex(Math.floor(p.x), Math.floor(p.z)), 'pending render vertex stays original');
    assert.deepEqual(delayed.generator.chunk(plan.cx, plan.cz), delayed.base.chunk(plan.cx, plan.cz));
  } finally { permit.resolve(); await updating; }
  assert.equal(delayed.model._active.size, 9); bounded(delayed.model, delayed.generator);
  const original = await originalCapture(oldKinds[0]), rejectedStore = storeFrom(original.records);
  rejectedStore.failWrites = true;
  const rejected = fixture(rejectedStore); await rejected.model.update(example);
  assert.equal(rejected.model._active.size, 0);
  assert.equal(rejected.generator.registryStats().ridgePlanOwnerIds.length, 0);
  assert.deepEqual(capture(rejectedStore.records), original.records);
  near(rejected.generator.floorSurface(example.x, example.z).height, rejected.base.floorSurface(example.x, example.z).height, 'failed bed remains original');
  rejectedStore.failWrites = false; await rejected.model.update(example);
  assert.equal(rejected.model._active.get(example.id).livingRidgePlan.version, 3);
  for (const [key, row] of original.records) assert.deepEqual(rejectedStore.records.get(key), row);
  bounded(rejected.model, rejected.generator);
});

test('invalid saved v3 floor is rejected without replacing original disk, animals, inventories or public terrain', async () => {
  const example = examples[0], initial = await freshCapture(example), store = storeFrom(initial.records);
  const key = initial.records.find(([name]) => name.endsWith(`|${example.id}`))[0];
  store.records.get(key).livingRidgePlan.floorPatch = null;
  const before = capture(store.records), f = fixture(store);
  await assert.rejects(f.model.update(example), /ridge|floor|relief|seabed/i);
  assert.equal(f.model._active.has(example.id), false);
  assert.equal(f.generator.getRidgePlan(example.id), undefined);
  assert.deepEqual(f.generator.floorSurface(example.x, example.z), f.base.floorSurface(example.x, example.z));
  assert.deepEqual(capture(store.records), before);
});

test('both complete relief windows survive all-nine-owner unload, revisit and fresh-facade restoration with deaths and bounded inventory', async () => {
  for (const example of examples) {
    const initial = await freshCapture(example), f = fixture(storeFrom(initial.records));
    await f.model.update(example); f.model.step(.4);
    const deadId = killOneActualIndividual(f.model); await f.model.checkpoint();
    const before = capture(f.model._active), oldIds = [...f.model._active.keys()];
    const p = witness(f.model._active.get(example.id).livingRidgePlan, f.generator, f.base);
    const committed = clone(f.generator.floorSurface(p.x, p.z));
    await f.model.update(far);
    assert.ok(oldIds.every(id => !f.model._active.has(id)), 'all nine original owners genuinely unloaded');
    bounded(f.model, f.generator);
    await f.model.update(example);
    assert.deepEqual(capture(f.model._active), before);
    assert.deepEqual(f.generator.floorSurface(p.x, p.z), committed);
    turtleSourcesRemain(f); bounded(f.model, f.generator);
    const reload = fixture(f.store); await reload.model.update(example);
    assert.deepEqual(capture(reload.model._active), before);
    assert.deepEqual(reload.generator.floorSurface(p.x, p.z), committed);
    const dead = [...reload.model._active.values()].flatMap(region => region.agents).find(agent => agent.id === deadId);
    assert.equal(dead.alive, false);
    for (const [id, region] of before) assert.deepEqual(reload.generator.getRidgePlan(id), region.livingRidgePlan);
    turtleSourcesRemain(reload); bounded(reload.model, reload.generator);
  }
});
