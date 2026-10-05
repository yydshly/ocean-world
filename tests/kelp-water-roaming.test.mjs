import test from 'node:test';
import assert from 'node:assert/strict';
import { KelpOceanEcology, KELP_OCEAN_REGION_ANIMAL_LIMIT } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KELP_SURFACE_Y, kelpStipePosition } from '../src/kelpHabitat.js';
import { KELP_WATER_MODEL, kelpWaterPositionValid, kelpWaterDynamicClearance } from '../src/kelpWaterCommunity.js';

const SEED = '42', WORLD = 'kelp-ecology-v1:string:42', SOURCE = '2,0', DESTINATION = '3,0';
const CENTER = { x: 160, z: 32 }, FAR = { x: 2048, z: 2048 };
const BASELINE = { currentMps: 0, foodSupply: 0, turbidity: 0, hour: 12 };
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${label}: expected ${expected}, received ${actual}`);

// An atomic adapter independently stages every owner record before replacing
// disk. Both rejected and explicitly uncommitted writes retain all old data.
class MemoryStore {
  available = true;
  records = new Map();
  batches = [];
  singleSaves = [];
  async load(world, id) {
    await this.onLoad?.(world, id);
    return clone(this.records.get(`${world}|${id}`) ?? null);
  }
  async save(world, id, record) {
    const snapshot = clone(record), result = await this.onSave?.(world, id, snapshot);
    if (result === null) return null;
    this.records.set(`${world}|${id}`, snapshot); this.singleSaves.push({ world, id, record: clone(snapshot) });
  }
  async saveMany(world, entries) {
    const snapshot = entries.map(([id, record]) => [id, clone(record)]);
    this.batches.push({ world, records: clone(snapshot) });
    const result = await this.onBatch?.(world, snapshot);
    if (result === null) return null;
    const next = new Map(this.records);
    for (const [id, record] of snapshot) next.set(`${world}|${id}`, record);
    this.records = next;
  }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function gateNextBatch(store) {
  const entered = deferred(), release = deferred();
  store.onBatch = async () => { store.onBatch = null; entered.resolve(); await release.promise; };
  return { entered: entered.promise, release: release.resolve };
}
function originalFields(current, before, label) {
  for (const [key, value] of Object.entries(before)) assert.deepEqual(current[key], value, `${label}: ${key}`);
}
function balance(region) {
  close(region.sim.ledger.initial + region.sim.ledger.input - region.sim.ledger.ingested - region.sim.ledger.exported,
    Object.values(region.sim.resources).reduce((total, value) => total + value, 0), `ledger ${region.id}`);
}
function storedOwners(store, id) {
  return [...store.records].filter(([key]) => key.startsWith(`${WORLD}|`))
    .flatMap(([, record]) => record.waterAgents?.filter(agent => agent.id === id) ?? []);
}
function fixture({ mobile = true, reverse = false, sourceTime = 17.4, destinationTime = 1220,
  store = new MemoryStore(), forceTarget = true } = {}) {
  const generator = createKelpOceanGenerator(SEED), ecology = new KelpOceanEcology(SEED, generator, { store });
  const source = ecology._create(2, 0), destination = ecology._create(3, 0);
  ecology._upgradeWater(source); ecology._upgradeWater(destination);
  assert.equal(source.waterAgents.length, 6, 'real seeded host allocation supplies the existing six-member school');
  const school = clone(source.waterAgents), agent = source.waterAgents[0];
  source.waterAgents = [agent]; destination.waterAgents = [];
  // Retain all genuine plant hosts and food patches, excluding unrelated
  // benthic bites so geographic school intake can be measured independently.
  for (const region of [source, destination]) {
    region.sim.agents = region.sim.agents.filter(animal => animal.speciesId === 'giant-kelp');
    region.sim.ledger = { initial: Object.values(region.sim.resources).reduce((a, b) => a + b, 0), input: 0, ingested: 0, exported: 0 };
  }
  source.sim.timeSec = sourceTime; source.sim._ticks = Math.round(sourceTime * 10);
  destination.sim.timeSec = destinationTime; destination.sim._ticks = Math.round(destinationTime * 10);
  agent.position = { x: 191.995, y: 4, z: 32 }; agent.velocity = { x: 0, y: 0, z: 0 };
  agent.energy = .72; agent.stateSince = 12.3; agent.lastFeedAt = 6.7;
  agent.nextBite = sourceTime + 100; agent.timeSec = sourceTime;
  if (mobile) assert.equal(ecology._upgradeWaterMobility(source), true);
  ecology._active = new Map(reverse ? [[DESTINATION, destination], [SOURCE, source]] : [[SOURCE, source], [DESTINATION, destination]]);
  ecology._center = { cx: 2, cz: 0 };
  if (forceTarget) ecology._roamingWaterTarget = animal => ({ x: animal.position.x + .4, y: animal.position.y, z: animal.position.z });
  assert.ok(kelpWaterPositionValid(generator, { x: 191.3, y: 4, z: 32 }, agent.sizeM, { cx: 2, cz: 0, elements: [] }));
  return { ecology, generator, store, source, destination, agent, school };
}
function setPrey(region, position, amount = .1) {
  assert.ok(region.sim.preyPatches.length);
  for (const patch of region.sim.preyPatches) patch.smallPrey = 0;
  region.sim.preyPatches[0].smallPrey = amount;
  region.sim._preyPosition = () => ({ ...position });
  region.sim.ledger = { initial: Object.values(region.sim.resources).reduce((a, b) => a + b, 0), input: 0, ingested: 0, exported: 0 };
}
function seedWindow(context, { legacyPosition = false } = {}) {
  const { ecology, store, source, destination } = context;
  if (legacyPosition) source.waterAgents[0].position = { x: 191.2, y: 4, z: 32 };
  for (let cz = -1; cz <= 1; cz++) for (let cx = 1; cx <= 3; cx++) {
    const region = `${cx},${cz}` === SOURCE ? source : `${cx},${cz}` === DESTINATION ? destination : ecology._create(cx, cz);
    if (region !== source && region !== destination) { region.waterCommunityVersion = 1; region.waterCommunityAdded = 0; region.waterInitializedAtSec = 0; }
    store.records.set(`${WORLD}|${region.id}`, ecology._record(region));
  }
}

test('one-time water mobility adds metadata without rewriting old live, dead, plant, food or individual fields', () => {
  const { ecology, source, agent, school } = fixture({ mobile: false });
  const dead = { ...school[1], alive: false, state: 'dead', energy: 0, stateSince: 8.1,
    lastFeedAt: 4.2, nextBite: 9, mobileTimeSec: 9.1, birthRegionId: 'older-owner' };
  source.waterAgents.push(dead); source.sim.events.push({ timeSec: 6.7, type: 'feeding', label: 'old-history' });
  const before = ecology._record(source);
  assert.equal(ecology._upgradeWaterMobility(source), true);
  const after = ecology._record(source);
  for (const [key, value] of Object.entries(before)) if (key !== 'waterAgents') assert.deepEqual(after[key], value, `regional ${key}`);
  after.waterAgents.forEach((animal, index) => originalFields(animal, before.waterAgents[index], 'individual'));
  assert.equal(agent.birthRegionId, SOURCE); assert.equal(agent.mobileTimeSec, source.sim.timeSec); assert.equal(agent.waterRoamingVersion, 1);
  assert.ok(Number.isFinite(agent.roamingSchoolPeriodSec) && Number.isFinite(agent.roamingSchoolPhaseRad));
  const once = clone(after.waterAgents); source.sim.timeSec += 200;
  assert.equal(ecology._upgradeWaterMobility(source), false); assert.deepEqual(source.waterAgents, once);
  const legacyStore = new MemoryStore(); legacyStore.saveMany = undefined;
  const legacy = fixture({ mobile: false, store: legacyStore }), previous = legacy.ecology._record(legacy.source);
  assert.equal(legacy.ecology._upgradeWaterMobility(legacy.source), false);
  assert.deepEqual(legacy.ecology._record(legacy.source), previous);
});

test('crossing publishes exactly one XYZ, energy and mobile-clock tick across differently aged owners in either Map order', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const { ecology, source, destination, agent, store } = fixture({ reverse });
    const before = clone(agent), paused = [...ecology._active].map(([id, region]) => [id, ecology._record(region)]);
    ecology.step(0, BASELINE); assert.deepEqual([...ecology._active].map(([id, region]) => [id, ecology._record(region)]), paused);
    ecology.step(.1, BASELINE);
    assert.equal(source.waterAgents.length, 0); assert.equal(destination.waterAgents.length, 1);
    assert.equal(destination.waterAgents[0], agent); assert.equal(agent.regionId, DESTINATION);
    assert.equal(agent.id, before.id); assert.equal(agent.groupId, before.groupId); assert.equal(agent.birthRegionId, SOURCE);
    assert.ok(distance(before.position, agent.position) > 0); assert.ok(distance(before.position, agent.position) <= .018000001);
    close(agent.mobileTimeSec, 17.5, 'one mobile tick'); close(agent.timeSec, 17.5, 'individual public clock');
    close(source.sim.timeSec, 17.5, 'source local time'); close(destination.sim.timeSec, 1220.1, 'destination local time');
    close(agent.energy, .72 - .1 * .00007, 'single metabolic tick');
    assert.equal(agent.lastFeedAt, before.lastFeedAt); assert.equal(agent.nextBite, before.nextBite);
    for (const axis of ['x', 'y', 'z']) close(agent.velocity[axis], (agent.position[axis] - before.position[axis]) / .1, `${axis} velocity`);
    assert.equal(ecology.snapshot().agents.find(animal => animal.id === agent.id).timeSec, agent.mobileTimeSec);
    assert.equal(store.batches.length + store.singleSaves.length, 0, 'ownership changes in the model without I/O during a tick');
    balance(source); balance(destination); outcomes.push(clone(agent));
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('the departure tick feeds source prey, later ticks feed destination prey, and all deadlines use the carried clock', () => {
  const { ecology, source, destination, agent } = fixture({ sourceTime: 100, destinationTime: 3 });
  setPrey(source, { x: 191.999, y: 4, z: 32 }); setPrey(destination, { x: 192.04, y: 4, z: 32 }); agent.nextBite = 100;
  // Control intention only, so the ordinary bite still uses its real current
  // owner and prior published position before the deferred transfer commits.
  const move = ecology._moveRoamingWater.bind(ecology);
  ecology._moveRoamingWater = (animal, target, budget) => move(animal,
    { x: animal.position.x + .4, y: animal.position.y, z: animal.position.z }, budget);
  ecology.step(.1, BASELINE);
  close(source.sim.ledger.ingested, KELP_WATER_MODEL.feedingAmount, 'departure geographic debit');
  close(destination.sim.ledger.ingested, 0, 'no arrival double bite'); close(agent.lastFeedAt, 100.1, 'departure mobile feed clock');
  agent.nextBite = 100.15; ecology.step(.1, BASELINE);
  close(destination.sim.ledger.ingested, KELP_WATER_MODEL.feedingAmount, 'destination geographic debit');
  close(agent.lastFeedAt, 100.2, 'younger owner cannot reset the feed clock');
  ecology.step(.1, { ...BASELINE, hour: 0 }); assert.equal(agent.state, 'resting'); close(agent.stateSince, 100.3, 'mobile state time');
  close(destination.sim.ledger.ingested, KELP_WATER_MODEL.feedingAmount, 'darkness supplies no intake'); balance(source); balance(destination);
});

test('mobile route phase and depth do not inherit the current owner age or rewrite birthplace school fields', () => {
  const { ecology, source, destination, agent } = fixture({ forceTarget: false });
  ecology._prepareWaterFrames(); ecology._prepareWaterPlantFrames();
  const before = ecology._roamingWaterTarget(agent), fields = clone({ schoolHome: agent.schoolHome, schoolPhaseRad: agent.schoolPhaseRad,
    schoolSlot: agent.schoolSlot, orbitRadiusM: agent.orbitRadiusM, preferredDepthM: agent.preferredDepthM });
  agent.regionId = DESTINATION; destination.sim.timeSec += 8000;
  assert.deepEqual(ecology._roamingWaterTarget(agent), before);
  assert.deepEqual({ schoolHome: agent.schoolHome, schoolPhaseRad: agent.schoolPhaseRad, schoolSlot: agent.schoolSlot,
    orbitRadiusM: agent.orbitRadiusM, preferredDepthM: agent.preferredDepthM }, fields);
  agent.regionId = SOURCE;
});

test('a cross-seam school frame retains peers and produces the same target irrespective of owner iteration order', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const { ecology, source, destination, agent, school } = fixture({ reverse });
    const peer = { ...school[1], position: { x: 192.04, y: 4.03, z: 32.04 }, regionId: DESTINATION };
    destination.waterAgents.push(peer); ecology._upgradeWaterMobility(destination);
    let captured; agent.energy = .99;
    ecology._moveRoamingWater = (animal, target) => { if (animal.id === agent.id) captured = { ...target }; return { recovering: false }; };
    ecology._prepareWaterFrames(); ecology._prepareWaterPlantFrames(); ecology._tickWater(source);
    const across = captured;
    destination.waterAgents = []; source.waterAgents.push(peer); peer.regionId = SOURCE;
    ecology._prepareWaterFrames(); ecology._prepareWaterPlantFrames(); ecology._tickWater(source);
    const together = captured;
    assert.deepEqual(across, together, 'peer separation/cohesion is a group view, not an owner-local list');
    source.waterAgents.pop(); ecology._prepareWaterFrames(); ecology._prepareWaterPlantFrames(); ecology._tickWater(source);
    const alone = captured;
    assert.notDeepEqual(across, alone, 'the adjacent-owner peer materially affects the target');
    outcomes.push(across);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('static supports and intermediate barriers are checked over the full budgeted XYZ step without an upward snap', () => {
  const { ecology, generator, agent } = fixture();
  ecology._prepareWaterPlantFrames();
  const previous = clone(agent.position), budget = .018;
  ecology._moveRoamingWater(agent, { x: previous.x + 10, y: previous.y + 10, z: previous.z + 10 }, budget);
  ecology._applyWaterTransfers();
  assert.ok(distance(previous, agent.position) <= budget + 1e-10);
  agent.position = { x: 180, y: 4, z: 32 }; agent.regionId = SOURCE;
  const start = clone(agent.position), end = { x: 180.018, y: 4, z: 32 };
  const actualHeight = generator.heightAt.bind(generator);
  ecology.generator = { ...generator, heightAt: (x, z) => Math.abs(x - 180.009) < .001 && Math.abs(z - 32) < .001 ? 5 : actualHeight(x, z) };
  assert.equal(ecology._waterCandidate(agent, end, budget), null, 'a thin midpoint barrier cannot be crossed by endpoint-only validation');
  ecology._moveRoamingWater(agent, end, budget); ecology._applyWaterTransfers();
  assert.ok(distance(start, agent.position) <= budget + 1e-10);
  assert.ok(agent.position.y < 4.1, 'support invalidity never becomes a free terrain lift');
  ecology.generator = generator;
  const ceiling = { x: 180, y: KELP_SURFACE_Y - .8 - agent.sizeM * .22 + .01, z: 32 };
  assert.equal(ecology._waterCandidate(agent, ceiling, 20), null);
});

test('moving plant references resolve their own geographic clock and environment rather than mobile fish time', () => {
  const { ecology, generator, destination, agent } = fixture();
  const element = generator.chunk(3, 0).elements.find(item => item.kind === 'kelp'); assert.ok(element);
  destination.sim.environment.currentMps = .55; destination.sim.environment.deformationCurrentMps = .23;
  ecology._prepareWaterPlantFrames();
  const context = ecology._mobileWaterContext(agent.position), resolved = context.elementContext(element);
  close(resolved.timeSec, destination.sim.timeSec, 'plant owner time');
  close(resolved.environment.deformationCurrentMps, .23, 'owner deformation environment');
  agent.mobileTimeSec = 98765;
  const again = ecology._mobileWaterContext(agent.position).elementContext(element);
  assert.deepEqual(again, resolved, 'moving the individual clock does not animate a different geographic plant phase');
  const anchor = resolved.anchor ?? element.anchor;
  const stipe = kelpStipePosition(anchor, .4, resolved.timeSec, resolved.environment, 0);
  const point = { x: stipe.x + .3, y: stipe.y, z: stipe.z };
  const expected = kelpWaterDynamicClearance(point, agent.sizeM, { elements: [{ ...element, anchor }], timeSec: resolved.timeSec, environment: resolved.environment });
  const actual = kelpWaterDynamicClearance(point, agent.sizeM, { ...context, elements: [element], timeSec: agent.mobileTimeSec });
  close(actual, expected, 'per-element geometric reference');
  const wrong = kelpWaterDynamicClearance(point, agent.sizeM, { elements: [{ ...element, anchor }], timeSec: agent.mobileTimeSec, environment: resolved.environment });
  assert.ok(Math.abs(expected - wrong) > .001, 'the fixture distinguishes the two phases rather than testing equivalent clocks');
});

test('all differently aged local plants finish their tick before any water fish reads the geographic reference', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const { ecology, destination, agent } = fixture({ reverse });
    const plant = [...destination.sim.hostById.values()][0]; assert.ok(plant);
    const element = ecology.generator.chunk(3, 0).elements.find(item => item.id === plant.sceneryId); assert.ok(element);
    const tick = ecology._tickWater.bind(ecology), readings = [];
    ecology._tickWater = region => {
      if (region.id === SOURCE) {
        const state = ecology._mobileWaterContext(agent.position).elementContext(element);
        close(state.timeSec, 1220.1, 'adjacent plant has already completed this global fixed step');
        assert.deepEqual(state.anchor, destination.sim.getKelpAnchor(plant.id), 'reference uses the actual post-growth anchor');
        readings.push(clone(state));
      }
      tick(region);
    };
    ecology.step(.1, { ...BASELINE, currentMps: .55 });
    assert.equal(readings.length, 1);
    outcomes.push({ reading: readings[0], animal: clone(agent), destinationPlants: clone([...destination.sim.hostById.values()]) });
  }
  assert.deepEqual(outcomes[0], outcomes[1], 'Map order cannot alter the actual plant reference, fish pose or host growth');
});

test('dead records occupy destination capacity and competing arrivals cannot exceed the combined regional animal cap', () => {
  const { ecology, source, destination, agent, school } = fixture();
  const dead = { ...school[2], id: 'historical-water-death', regionId: DESTINATION, alive: false, state: 'dead', energy: 0,
    position: { x: 200, y: 4, z: 32 } };
  destination.waterAgents = Array.from({ length: 10 }, (_, index) => ({ ...clone(dead), id: `${dead.id}:${index}` }));
  const ground = ecology._create(3, 0).sim.agents.find(animal => animal.speciesId === 'purple-urchin'); assert.ok(ground);
  destination.sim.agents.push(...Array.from({ length: 9 }, (_, index) => ({ ...clone(ground), id: `historical-ground-death:${index}`, alive: false, energy: 0, state: 'dead' })));
  const competitor = { ...clone(agent), id: 'second-candidate', schoolSlot: 1, position: { x: 191.996, y: 4.01, z: 32 } };
  source.waterAgents.push(competitor); ecology.step(.1, BASELINE);
  assert.equal(destination.waterAgents.length, 11);
  assert.equal(ecology.snapshot().regions.find(region => region.id === DESTINATION).agentCount, KELP_OCEAN_REGION_ANIMAL_LIMIT);
  assert.equal(source.waterAgents.length, 1, 'only one last slot can be reserved');
  assert.equal(new Set(ecology.agents.map(animal => animal.id)).size, ecology.agents.length);
  const stay = source.waterAgents[0], previous = clone(stay.position);
  ecology.step(.1, BASELINE); assert.equal(stay.regionId, SOURCE);
  assert.ok(distance(previous, stay.position) <= .018000001);
  assert.equal(destination.waterAgents.filter(animal => !animal.alive).length, 10);
});

test('unloaded and locked owners block entry without changing identity or granting a larger movement budget', () => {
  for (const blocked of ['unloaded', 'locked']) {
    const { ecology, destination, agent } = fixture();
    if (blocked === 'unloaded') ecology._active.delete(DESTINATION); else ecology._locked.add(DESTINATION);
    const before = clone(agent); ecology.step(.1, BASELINE);
    assert.equal(agent.regionId, SOURCE); assert.equal(agent.id, before.id);
    assert.ok(distance(before.position, agent.position) <= .018000001);
    assert.equal(destination.waterAgents.length, 0);
    close(agent.mobileTimeSec, before.mobileTimeSec + .1, 'blocked fish still has one individual tick');
  }
});

test('preactivation metadata commits before publication while all historical record fields remain exact', async () => {
  const context = fixture({ mobile: false }); seedWindow(context, { legacyPosition: true });
  const { generator, store } = context, previous = clone(store.records.get(`${WORLD}|${SOURCE}`));
  const entered = deferred(), release = deferred();
  const reopened = new KelpOceanEcology(SEED, generator, { store });
  store.onBatch = async (world, entries) => {
    const entry = entries.find(([id]) => id === SOURCE); if (!entry) return;
    assert.equal(entry[1].waterAgents[0].waterRoamingVersion, 1); assert.equal(reopened._active.has(SOURCE), false);
    entered.resolve(); await release.promise;
  };
  const loading = reopened.update(CENTER); await entered.promise;
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous);
  release.resolve(); await loading;
  const after = reopened._record(reopened._active.get(SOURCE));
  for (const [key, value] of Object.entries(previous)) if (key !== 'waterAgents') assert.deepEqual(after[key], value, `old region ${key}`);
  originalFields(after.waterAgents[0], previous.waterAgents[0], 'old saved animal');
  assert.equal(after.waterAgents[0].mobileTimeSec, previous.state.timeSec);
  assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), after);
});

test('throwing or explicitly uncommitted preactivation saves roll back the complete base record and retry once', async () => {
  for (const failure of ['throw', 'null']) {
    const context = fixture({ mobile: false }); seedWindow(context, { legacyPosition: true });
    const { generator, store } = context, previous = clone(store.records.get(`${WORLD}|${SOURCE}`));
    store.onBatch = (world, entries) => { if (!entries.some(([id]) => id === SOURCE)) return; if (failure === 'throw') throw new Error('mobility-upgrade-rejected'); return null; };
    const reopened = new KelpOceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
    assert.deepEqual(store.records.get(`${WORLD}|${SOURCE}`), previous);
    const active = reopened._active.get(SOURCE); if (active) assert.deepEqual(reopened._record(active), previous);
    store.onBatch = null; await reopened.update(FAR); await reopened.update(CENTER);
    const restored = reopened._active.get(SOURCE); assert.ok(restored);
    originalFields(restored.waterAgents[0], previous.waterAgents[0], 'retry keeps history');
    assert.equal(restored.waterAgents[0].waterRoamingVersion, 1); assert.equal(storedOwners(store, previous.waterAgents[0].id).length, 1);
  }
});

test('support correction, missing water allocation and mobility metadata share one preactivation transaction and rejection', async () => {
  for (const failure of ['throw', 'null']) {
    const store = new MemoryStore(), generator = createKelpOceanGenerator(SEED), model = new KelpOceanEcology(SEED, generator, { store });
    for (let cz = -1; cz <= 1; cz++) for (let cx = 1; cx <= 3; cx++) {
      const region = model._create(cx, cz); region.waterCommunityVersion = 1; region.waterCommunityAdded = 0; region.waterInitializedAtSec = 0;
      store.records.set(`${WORLD}|${region.id}`, model._record(region));
    }
    const key = `${WORLD}|${SOURCE}`, previous = clone(store.records.get(key));
    delete previous.supportGeometryVersion; delete previous.waterCommunityVersion; delete previous.waterCommunityAdded;
    delete previous.waterInitializedAtSec; delete previous.waterAgents;
    const crawler = previous.state.agents.find(animal => animal.speciesId === 'purple-urchin'); assert.ok(crawler);
    crawler.position.y -= .2; previous.state.extraLegacyField = { preserved: ['complete-history', 17] };
    store.records.set(key, clone(previous)); let attempted;
    store.onBatch = (world, entries) => {
      const entry = entries.find(([id]) => id === SOURCE); if (!entry) return;
      attempted = clone(entry[1]);
      if (failure === 'throw') throw new Error('combined-upgrade-denied'); return null;
    };
    const reopened = new KelpOceanEcology(SEED, generator, { store }); assert.equal(await reopened.update(CENTER), false);
    assert.ok(attempted.supportGeometryVersion > 0); assert.equal(attempted.waterCommunityVersion, 1);
    assert.equal(attempted.waterAgents.length, 6); assert.ok(attempted.waterAgents.every(animal => animal.waterRoamingVersion === 1));
    assert.deepEqual(store.records.get(key), previous); assert.equal(reopened._active.has(SOURCE), false, 'support-corrected Y cannot activate before commit');
    assert.deepEqual(attempted.state.extraLegacyField, previous.state.extraLegacyField);
    assert.notEqual(attempted.state.agents.find(animal => animal.id === crawler.id).position.y, crawler.position.y);
    store.onBatch = null; assert.equal(await reopened.update(CENTER), true);
    const after = reopened._record(reopened._active.get(SOURCE)); assert.deepEqual(after, attempted);
    assert.equal(store.records.get(key).waterAgents.length, 6);
  }
});

test('mobile restoration retains strict birthplace home and finite metadata checks while only current seam position permits zero margin', () => {
  const { ecology, source, agent } = fixture(), record = ecology._record(source);
  assert.ok(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM,
    { cx: 2, cz: 0, elements: [], ownerMarginM: 0 }));
  assert.equal(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM, { cx: 2, cz: 0, elements: [] }), false,
    'legacy static helper retains its existing owner margin');
  assert.equal(ecology._restore(record, 2, 0).waterAgents[0].id, agent.id);
  const wrongBirthHome = clone(record); wrongBirthHome.waterAgents[0].schoolHome.x = 193;
  assert.throws(() => ecology._restore(wrongBirthHome, 2, 0), /coordinates.*owner or birth/);
  for (const field of ['mobileTimeSec', 'roamingSchoolPeriodSec', 'roamingSchoolPhaseRad']) {
    const corrupt = clone(record); corrupt.waterAgents[0][field] = NaN;
    assert.throws(() => ecology._restore(corrupt, 2, 0), /roaming metadata/);
  }
});

test('atomic checkpoint, zero-step pause, actual unload/revisit and reopen preserve complete ownership without a birthplace refill', async () => {
  const { ecology, generator, store, source, destination, agent } = fixture();
  ecology.step(.1, BASELINE); const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  assert.equal(source.waterEverOccupied, true); assert.equal(destination.waterEverOccupied, true);
  await ecology.checkpoint(); assert.equal(store.batches.length, 1); assert.equal(store.singleSaves.length, 0);
  assert.equal(store.batches[0].records.length, 2); assert.deepEqual(storedOwners(store, agent.id), [expected]);
  const paused = [...ecology._active].map(([id, region]) => [id, ecology._record(region)]); ecology.step(0, BASELINE);
  assert.deepEqual([...ecology._active].map(([id, region]) => [id, ecology._record(region)]), paused);
  await ecology.update(FAR); assert.equal(ecology.agents.some(animal => animal.id === agent.id), false);
  await ecology.update(CENTER); assert.deepEqual(ecology.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(ecology._active.get(SOURCE).waterAgents.length, 0);
  const reopened = new KelpOceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  assert.deepEqual(reopened.snapshot().agents.filter(animal => animal.id === agent.id), [expected]);
  assert.equal(reopened._active.get(SOURCE).waterAgents.length, 0); assert.equal(storedOwners(store, agent.id).length, 1);
  assert.ok(reopened.snapshot().regions.every(region => region.agentCount <= 20)); assert.ok(reopened.snapshot().metrics.activeRegions <= 9);
});

test('queued atomic checkpoints capture the latest ownership at execution and failed unloads retain all owners for retry', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), first = ecology.checkpoint(); await gate.entered;
  const second = ecology.checkpoint(); ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  gate.release(); await Promise.all([first, second]);
  assert.equal(store.batches.length, 2); assert.equal(store.batches[0].records.find(([id]) => id === SOURCE)[1].waterAgents[0].regionId, SOURCE);
  assert.deepEqual(storedOwners(store, agent.id), [expected]);
  for (const failure of ['throw', 'null']) {
    const current = fixture(); current.ecology.step(.1, BASELINE); await current.ecology.checkpoint();
    const before = clone([...current.store.records]); current.store.onBatch = () => { if (failure === 'throw') throw new Error('ownership-save-rejected'); return null; };
    assert.equal(await current.ecology.update(FAR), false); assert.deepEqual([...current.store.records], before);
    assert.equal(current.ecology._active.get(SOURCE), current.source); assert.equal(current.ecology._active.get(DESTINATION), current.destination);
    assert.equal(current.ecology._locked.size, 0); assert.equal(current.ecology._center, null);
    current.store.onBatch = null; await current.ecology.update(FAR); assert.equal(current.ecology._active.has(SOURCE), false);
    assert.equal(storedOwners(current.store, current.agent.id).length, 1);
  }
});

test('unloading only the destination still checkpoints its retained departure owner in one coherent batch', async () => {
  const { ecology, store, agent } = fixture(); ecology.step(.1, BASELINE);
  const expected = clone(ecology.snapshot().agents.find(animal => animal.id === agent.id));
  await ecology.checkpoint(); store.batches.length = 0;
  await ecology.update({ x: 96, z: 32 });
  const unload = store.batches[0];
  assert.ok(unload.records.some(([id]) => id === SOURCE), 'retained source record participates in the transaction');
  assert.ok(unload.records.some(([id]) => id === DESTINATION), 'departing destination record participates in the transaction');
  assert.equal(unload.records.find(([id]) => id === SOURCE)[1].waterAgents.length, 0);
  assert.deepEqual(storedOwners(store, agent.id), [expected]);
  assert.equal(ecology._active.has(SOURCE), true); assert.equal(ecology._active.has(DESTINATION), false);
});

test('pre-unload locks freeze owner clocks and a failed birth-cell read cannot allocate duplicate departing fish', async () => {
  const { ecology, store, agent } = fixture();
  const gate = gateNextBatch(store), leaving = ecology.update(FAR); await gate.entered;
  assert.ok(ecology._locked.has(SOURCE)); assert.ok(ecology._locked.has(DESTINATION));
  const before = [...ecology._active].map(([id, region]) => [id, ecology._record(region)]); ecology.step(.2, BASELINE);
  assert.deepEqual([...ecology._active].map(([id, region]) => [id, ecology._record(region)]), before);
  gate.release(); await leaving; assert.equal(ecology._active.has(SOURCE), false); assert.equal(ecology._locked.size, 0);
  const create = ecology._create.bind(ecology); ecology._create = (cx, cz) => { assert.ok(cx !== 2 || cz !== 0, 'failed read cannot regenerate birth population'); return create(cx, cz); };
  store.onLoad = (world, id) => { if (id === SOURCE) throw new Error('birth-cell read denied'); };
  assert.equal(await ecology.update(CENTER), false); assert.equal(ecology._active.has(SOURCE), false);
  assert.equal(storedOwners(store, agent.id).length, 1); store.onLoad = null; ecology._create = create; await ecology.update(CENTER);
  assert.equal(ecology.agents.filter(animal => animal.id === agent.id).length, 1);
});

test('durable ever-occupied markers and historical deaths prevent category supplementation after departure', () => {
  const { ecology, source, agent } = fixture(); ecology.step(.1, BASELINE);
  assert.equal(agent.regionId, DESTINATION); assert.equal(source.waterEverOccupied, true);
  delete source.waterCommunityVersion; assert.equal(ecology._upgradeWater(source), true);
  assert.equal(source.waterCommunityAdded, 0); assert.equal(source.waterAgents.length, 0);
  const dead = { ...clone(agent), id: `${agent.id}:historical-dead`, regionId: SOURCE, alive: false, state: 'dead', energy: 0 };
  source.waterAgents.push(dead); delete source.waterCommunityVersion;
  const before = clone(dead); assert.equal(ecology._upgradeWater(source), true); assert.equal(source.waterAgents.length, 1); assert.deepEqual(dead, before);
  ecology.step(.1, BASELINE); assert.deepEqual(dead, before, 'death occupies capacity without clock advancement, movement or revival');
});

test('a legacy non-atomic adapter keeps even restored mobile records in the old local patrol and never duplicates ownership', async () => {
  const context = fixture(); seedWindow(context, { legacyPosition: true }); const { generator, store } = context;
  const previous = clone(store.records.get(`${WORLD}|${SOURCE}`).waterAgents[0]); store.saveMany = undefined;
  const reopened = new KelpOceanEcology(SEED, generator, { store }); await reopened.update(CENTER);
  const restored = reopened._active.get(SOURCE).waterAgents[0]; originalFields(restored, previous, 'legacy restored fish');
  const before = clone(restored.position); reopened.step(.1, BASELINE);
  assert.equal(restored.regionId, SOURCE); assert.ok(restored.position.x <= 191.4);
  assert.ok(distance(before, restored.position) <= .018000001);
  assert.equal(reopened.agents.filter(animal => animal.id === restored.id).length, 1);
  close(restored.mobileTimeSec, previous.mobileTimeSec + .1, 'legacy mobile history advances once');
  close(restored.timeSec, restored.mobileTimeSec, 'legacy getters retain individual clock');
  await reopened.checkpoint(); assert.equal(store.batches.length, 0); assert.equal(storedOwners(store, restored.id).length, 1);
});

test('restored mobile history with a non-atomic adapter uses geographic plant motion when patrol intention is unchanged', () => {
  const outcomes = [];
  for (const carried of [true, false]) {
    const store = new MemoryStore(), ecology = new KelpOceanEcology(SEED, createKelpOceanGenerator(SEED), { store });
    let region = ecology._create(1, -1); ecology._upgradeWater(region);
    assert.equal(region.waterAgents.length, 6); region.waterAgents = [region.waterAgents[0]];
    region.sim.timeSec = 803.8; region.sim._ticks = 8038;
    region.sim.environment = { currentMps: .18, deformationCurrentMps: .18, turbidity: .35, foodSupply: 1, hour: 10 };
    for (const animal of region.sim.agents) animal.nextBite = 1e9;
    const fish = region.waterAgents[0];
    // This is the recorded 803.8s moving-stipe historical intrusion from the
    // earlier community check. Its ordinary recovery remains a finite step.
    fish.position = { x: 115.6177658162436, y: .14808856399355308, z: -6.493953340573132 };
    fish.energy = .99; fish.nextBite = 1e9;
    if (carried) { ecology._upgradeWaterMobility(region); fish.mobileTimeSec = 200; }
    else {
      // A phase offset gives the ordinary regional-clock fish exactly the
      // same patrol intention. Individual age should then have no effect on
      // the physical geographic stipe reference or accepted next position.
      fish.schoolPhaseRad += (200 - 803.8) * Math.PI * 2 / fish.patrolPeriodSec;
    }
    const record = ecology._record(region); store.saveMany = undefined;
    region = ecology._restore(record, 1, -1); ecology._active.set(region.id, region);
    const restored = region.waterAgents[0], before = { ...restored.position };
    ecology.step(.1, { currentMps: .18, foodSupply: 1, hour: 10 });
    assert.ok(distance(before, restored.position) <= .018 + 1e-10, 'the real recovery does not gain a movement budget');
    assert.equal(restored.id, fish.id); assert.equal(restored.regionId, '1,-1'); assert.equal(restored.lastFeedAt, null);
    close(restored.timeSec, carried ? 200.1 : 803.9, 'behavior still retains the appropriate individual clock');
    outcomes.push({ position: { ...restored.position }, gap: kelpWaterDynamicClearance(restored.position, restored.sizeM,
      ecology._waterContext(region)), plantAnchors: [...region.sim.hostById.values()].map(plant => region.sim.getKelpAnchor(plant.id)) });
  }
  assert.deepEqual(outcomes[0].plantAnchors, outcomes[1].plantAnchors, 'actual geographic plants are identical in both worlds');
  assert.ok(distance(outcomes[0].position, outcomes[1].position) < 1e-10,
    `same intention must recover against the same geographic plant pose; separation ${distance(outcomes[0].position, outcomes[1].position)}m`);
  close(outcomes[0].gap, outcomes[1].gap, 'actual moving-reference clearance');
});
