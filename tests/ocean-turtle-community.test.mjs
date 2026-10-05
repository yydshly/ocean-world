import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';
import { createOceanTurtlePlan, oceanTurtlePositionValid, validateOceanTurtleRecord, tickOceanTurtles } from '../src/oceanTurtleCommunity.js';

const clone = value => structuredClone(value), WORLD = 'ecology-v1:string:42', AWAY = { x: 2048, z: 2048 };
const frozen = readFileSync(new URL('../output/validation/ocean-turtle-ecology-before.js', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(frozen).digest('hex'), 'a732f526fc74e44150b98b443ca437d76d6af40bd4fa0489fefad0fad7bb1647');
const source = frozen.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(new URL(dependency, new URL('../src/oceanEcology.js', import.meta.url)).href)}`);
const { OceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class MemoryStore {
  available = true; records = new Map(); batches = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, record) { this.records.set(`${world}|${id}`, clone(record)); }
  async saveMany(world, entries) {
    const offered = clone(entries); this.batches.push(offered);
    const response = await this.beforeCommit?.(world, offered); if (response === null) return null;
    const next = new Map(this.records); for (const [id, record] of offered) next.set(`${world}|${id}`, record); this.records = next;
  }
}
const records = model => [...model._active.values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
const turtles = model => [...model._active.values()].flatMap(r => r.turtleAgents ?? []).sort((a, b) => a.id.localeCompare(b.id));
const strip = row => { const result = clone(row); for (const key of ['turtleCommunityVersion', 'turtleInitializedAtSec', 'turtleAgents']) delete result[key]; return result; };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const difference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const grassAround = (generator, region) => {
  const rows = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    rows.push(...generator.chunk(region.cx + dx, region.cz + dz).elements.filter(e => e.kind === 'seagrass')); return rows;
};

// The real seeded 3,1 owner has 256 supported grass tufts. No fabricated
// grass counts, flat floor, habitat label or green texture is used as support.
const FIXTURE = { cx: 3, cz: 1, x: 224, z: 96 };
async function model(store = new MemoryStore(), position = FIXTURE, { seed = '42', turtles: enabled = true } = {}) {
  const ecology = new OceanEcology(seed, createOceanGenerator(seed), { store, turtles: enabled });
  assert.notEqual(await ecology.update(position), false); assert.equal(ecology._active.size, 9); return ecology;
}
async function oldWindow() {
  const store = new MemoryStore(), old = new OriginalEcology('42', createOceanGenerator('42'), { store });
  assert.notEqual(await old.update(FIXTURE), false); assert.equal(old._active.size, 9); old.step(2.4, { currentMps: .15, foodSupply: 0, hour: 12 });
  for (const region of old._active.values()) { region.opaqueExtension = { original: true, bytes: [1, 6, 9] };
    for (const agent of region.agents) agent.opaqueExtension = { oldHistory: ['preserve', region.id] }; }
  const owner = [...old._active.values()].find(r => r.agents.length), dead = owner.agents[0];
  dead.alive = false; dead.state = 'dead'; dead.energy = 0; dead.velocity = { x: 0, y: 0, z: 0 };
  await old.checkpoint(); store.batches.length = 0; return { old, store, before: records(old), dead: clone(dead) };
}
function independentPose(generator, region, agent, position = agent.position) {
  const radius = .64 * agent.sizeM + .12, half = .25 * agent.sizeM;
  assert.ok(position.x >= region.cx * 64 + 2 && position.x <= (region.cx + 1) * 64 - 2);
  assert.ok(position.z >= region.cz * 64 + 2 && position.z <= (region.cz + 1) * 64 - 2);
  for (let index = 0; index < 9; index++) {
    const angle = (index - 1) * Math.PI / 4, r = index ? radius : 0;
    assert.ok(position.y - half >= oceanSupportHeight(generator, position.x + Math.cos(angle) * r, position.z + Math.sin(angle) * r, { avoidCoral: true }) + .25 - 1e-8,
      'independent actual rock/coral/floor supports clear the full body');
  }
  for (const grass of grassAround(generator, region)) if (Math.hypot(grass.x - position.x, grass.z - position.z) <= radius + Math.max(grass.scale.x, grass.scale.z) * .65)
    assert.ok(position.y - half >= grass.y + grass.scale.y * 1.02 + .25 - 1e-8, 'actual finite grass crowns remain below the turtle body');
  assert.ok(position.y + .055 * agent.sizeM <= OCEAN_SURFACE_Y + 1e-8, 'the actual nasal reference never rises beyond its nominal surface target');
}

test('default false matches the independently frozen full previous regional model including ordinary future steps', async () => {
  const old = new OriginalEcology('42', createOceanGenerator('42'), { store: new MemoryStore() }); await old.update(FIXTURE);
  const current = await model(new MemoryStore(), FIXTURE, { turtles: false }); assert.deepEqual(records(current), records(old));
  for (const dt of [.04, .06, .3, .4]) { current.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 }); old.step(dt, { currentMps: .2, foodSupply: 0, hour: 12 }); }
  assert.deepEqual(records(current), records(old)); assert.equal(turtles(current).length, 0);
  assert.deepEqual(current.snapshot().resources, old.snapshot().resources);
});

test('once-only committed turtles preserve complete old individuals, deaths, positive stocks, ledgers, clocks and opaque state', async () => {
  const fixture = await oldWindow(), current = await model(fixture.store); assert.ok(turtles(current).length);
  assert.ok(fixture.before.some(r => Object.values(r.resources).some(stock => stock > 0)));
  records(current).forEach((row, index) => {
    assert.deepEqual(strip(row), fixture.before[index]); assert.equal(row.turtleCommunityVersion, 1);
    assert.equal(row.turtleInitializedAtSec, row.timeSec); assert.ok(row.turtleAgents.length <= 1);
    assert.deepEqual(fixture.store.records.get(`${WORLD}|${row.id}`), row, 'full additive state is durable before activation');
    assert.ok(row.turtleAgents.every(a => !Object.hasOwn(a, 'energy') && !Object.hasOwn(a, 'oxygen') && !Object.hasOwn(a, 'lastFeedAt')));
  });
  assert.deepEqual(records(current).flatMap(r => r.agents).find(a => a.id === fixture.dead.id), fixture.dead);
  const snapshot = current.snapshot(); assert.equal(snapshot.agents.filter(a => a.speciesId === 'green-turtle').length, turtles(current).length);
  assert.ok(Number.isFinite(snapshot.metrics.averageEnergy));
  for (const region of snapshot.regions) assert.equal(region.agentCount, current._active.get(region.id).agents.length + region.turtleAgentCount);
});

test('sparse allocation is typed and deterministic across visit order and reversed actual scenery/native arrays without consuming old state', async () => {
  const current = await model(), other = await model(); await other.update(AWAY); await other.update(FIXTURE);
  assert.deepEqual(turtles(current), turtles(other)); const region = [...current._active.values()].find(r => r.turtleAgents.length);
  const old = clone(region), surface = (x, z) => current._surface(x, z, true);
  const plan = createOceanTurtlePlan(current.generator, region, { surface, seed: '42', capacity: 1 });
  const reversed = { ...current.generator, chunk: (cx, cz) => { const chunk = current.generator.chunk(cx, cz); return { ...chunk, elements: [...chunk.elements].reverse() }; } };
  assert.deepEqual(createOceanTurtlePlan(reversed, { ...region, agents: [...region.agents].reverse() }, { surface, seed: '42', capacity: 1 }), plan);
  assert.deepEqual(region, old); assert.equal(createOceanTurtlePlan(current.generator, region, { surface, capacity: 0 }).placements.length, 0);
  const typed = await model(new MemoryStore(), FIXTURE, { seed: 42 }); assert.notDeepEqual(turtles(current), turtles(typed));
});

test('birth and all sixteen patrol points use a real sediment-rooted six-tuft cluster and actual finite whole-body support', async () => {
  const current = await model(); let roots = 0;
  for (const region of current._active.values()) for (const turtle of region.turtleAgents) {
    const grass = grassAround(current.generator, region), source = grass.find(e => e.id === turtle.sourceGrassId); assert.ok(source);
    assert.ok(turtle.sourceGrassIds.length >= 6);
    for (const id of turtle.sourceGrassIds) {
      const plant = grass.find(e => e.id === id); assert.ok(plant); assert.ok(Math.hypot(plant.x - source.x, plant.z - source.z) <= 9);
      assert.ok(Math.abs(plant.y - current.generator.floorSurface(plant.x, plant.z).height) < 1e-9);
      assert.ok(current.generator.sample(plant.x, plant.z).substrate !== 'rock'); roots++;
    }
    assert.equal(turtle.patrolWaypoints.length, 16); assert.ok(turtle.sizeM >= 1.25 && turtle.sizeM <= 1.5);
    for (const point of turtle.patrolWaypoints) { independentPose(current.generator, region, turtle, point);
      const depth = 8 - current.generator.floorSurface(point.x, point.z).height; assert.ok(depth >= 3 && depth <= 18); }
  }
  assert.ok(roots >= 6);
});

test('one actual normal-speed patrol, ascent, eight-second nasal breathing and descent obey full XYZ, turn and intermediate support budgets', async () => {
  const current = await model(), original = [...current._active.values()].find(r => r.turtleAgents.length), region = clone(original);
  const surface = (x, z) => current._surface(x, z, true), turtle = region.turtleAgents[0], beforeNative = clone(region.agents), beforeFood = clone({ resources: region.resources, ledger: region.ledger });
  const initial = clone(turtle), seen = new Set([turtle.state]), phaseRecords = new Map(); let enteredBreathing = null, exitedBreathing = null, returned = false, movingM = 0;
  for (let index = 1; index <= 4200; index++) {
    const previous = clone(turtle); region.timeSec = original.timeSec + index * .1;
    tickOceanTurtles(region, current.generator, { surface, stepSec: .1 }); seen.add(turtle.state);
    if (!phaseRecords.has(turtle.state)) {
      assert.equal(validateOceanTurtleRecord(region, current.generator, { surface }), true, 'each actual controller phase is a legal complete saved record');
      phaseRecords.set(turtle.state, clone(region));
    }
    movingM += distance(previous.position, turtle.position);
    assert.ok(distance(previous.position, turtle.position) <= .22 * .1 + 1e-9);
    assert.ok(difference(previous.heading, turtle.heading) <= .7 * .1 + 1e-9);
    independentPose(current.generator, region, turtle);
    for (const fraction of [.25, .5, .75]) independentPose(current.generator, region, turtle,
      Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, previous.position[axis] + (turtle.position[axis] - previous.position[axis]) * fraction])));
    if (turtle.state === 'breathing') {
      enteredBreathing ??= region.timeSec; assert.ok(Math.abs(turtle.position.y + .055 * turtle.sizeM - 8) < 1e-8);
      assert.equal(turtle.pitch, 0); assert.deepEqual(turtle.velocity, { x: 0, y: 0, z: 0 });
    }
    if (previous.state === 'breathing' && turtle.state === 'diving') exitedBreathing = region.timeSec;
    if (seen.has('diving') && turtle.state === 'seagrass-cruising') { returned = true; break; }
  }
  assert.ok(returned, 'an actual finite cycle completes without accelerating or repositioning the turtle');
  assert.deepEqual([...seen].sort(), ['breathing', 'diving', 'seagrass-cruising', 'surfacing']);
  assert.ok(Math.abs(exitedBreathing - enteredBreathing - 8) <= .1 + 1e-8); assert.ok(movingM > 2);
  assert.equal(turtle.breathCount, initial.breathCount + 1); assert.deepEqual(region.agents, beforeNative);
  assert.deepEqual({ resources: region.resources, ledger: region.ledger }, beforeFood, 'a surface demonstration invents neither food nor metabolism');
  for (const [state, mutate] of [
    ['surfacing', a => { a.target.x += 1; }], ['breathing', a => { a.breathHoldUntilSec += 1; }],
    ['breathing', a => { a.position.y -= .04; }], ['breathing', a => { a.pitch = .15; }],
    ['diving', a => { a.target.x += .4; }],
  ]) {
    const corrupt = clone(phaseRecords.get(state)); mutate(corrupt.turtleAgents[0]);
    assert.equal(validateOceanTurtleRecord(corrupt, current.generator, { surface }), false, 'damaged phase relationships reject, after the matching real phase was independently accepted');
  }
});

test('turtle stepping never changes the independently frozen native stocks, food history, randomness or old event stream', async () => {
  const current = await model(), old = new OriginalEcology('42', createOceanGenerator('42'), { store: new MemoryStore() }); await old.update(FIXTURE);
  current.step(1.2, { currentMps: .2, foodSupply: 0, hour: 12 }); old.step(1.2, { currentMps: .2, foodSupply: 0, hour: 12 });
  assert.deepEqual(records(current).map(strip), records(old));
});

test('fixed-step partitions and reversed owner order match complete state while paused and locked owners do not advance', async () => {
  const a = await model(), b = await model(); b._active = new Map([...b._active].reverse());
  a.step(1, { currentMps: .2, foodSupply: 0, hour: 12 }); for (let index = 0; index < 60; index++) b.step(1 / 60, { currentMps: .2, foodSupply: 0, hour: 12 });
  assert.deepEqual(records(a), records(b)); const paused = records(a); a.step(0); assert.deepEqual(records(a), paused);
  const region = [...a._active.values()].find(r => r.turtleAgents.length), frozen = clone(region); a._lockedRegions.add(region.id); a.step(.1);
  assert.deepEqual(region, frozen);
});

test('unload and reopen freeze complete local turtle clocks, cohorts and native state and preserve the same next ordinary step', async () => {
  const current = await model(); current.step(.6, { currentMps: .2, foodSupply: 0, hour: 12 }); const before = records(current), ids = before.map(r => r.id);
  await current.update(AWAY); assert.ok(ids.every(id => !current._active.has(id))); current.step(.4); await current.update(FIXTURE);
  assert.deepEqual(records(current), before); await current.checkpoint(); const restored = await model(current.store); assert.deepEqual(records(restored), before);
  current.step(.1, { currentMps: .3, foodSupply: 0, hour: 8 }); restored.step(.1, { currentMps: .3, foodSupply: 0, hour: 8 }); assert.deepEqual(records(current), records(restored));
});

test('a full compatibility transaction exposes no uncommitted turtle, and null or throwing saves preserve old disk records before retry', async () => {
  const fixture = await oldWindow(); let release, offered;
  fixture.store.beforeCommit = async (_world, rows) => { if (!release) { offered = clone(rows); await new Promise(resolve => { release = resolve; }); } };
  const current = new OceanEcology('42', createOceanGenerator('42'), { store: fixture.store, turtles: true }), pending = current.update(FIXTURE);
  for (let index = 0; index < 60 && !release; index++) await Promise.resolve(); assert.ok(release); assert.equal(current._active.size, 0);
  const [id, row] = offered[0]; assert.equal(row.turtleCommunityVersion, 1); assert.deepEqual(strip(row), fixture.before.find(r => r.id === id));
  assert.equal(fixture.store.records.get(`${WORLD}|${id}`).turtleCommunityVersion, undefined); release(); await pending; assert.ok(turtles(current).length);
  for (const failure of ['null', 'throw']) {
    const old = await oldWindow(), disk = clone([...old.store.records]); old.store.beforeCommit = async () => { if (failure === 'throw') throw new Error('turtle compatibility save rejected'); return null; };
    const failed = new OceanEcology('42', createOceanGenerator('42'), { store: old.store, turtles: true }); assert.equal(await failed.update(FIXTURE), false);
    assert.equal(turtles(failed).length, 0); assert.deepEqual([...old.store.records], disk); old.store.beforeCommit = undefined;
    assert.notEqual(await failed.update(FIXTURE), false); assert.equal(failed._active.size, 9); assert.ok(turtles(failed).length); assert.ok(failed.snapshot().metrics.storageError);
  }
});

test('native and turtle deaths occupy the shared twenty-slot capacity and no once-only empty or dead cohort is refilled', async () => {
  const fixture = await oldWindow(), target = fixture.before.find(r => r.agents.length), full = clone(target), native = full.agents[0];
  while (full.agents.length < 20) full.agents.push({ ...clone(native), id: `dead:capacity:${full.agents.length}`, alive: false, state: 'dead', energy: 0 });
  fixture.store.records.set(`${WORLD}|${full.id}`, full); const current = await model(fixture.store);
  assert.deepEqual(current._active.get(full.id).turtleAgents, []); assert.deepEqual(strip(current._active.get(full.id)), full);
  const owner = [...current._active.values()].find(r => r.turtleAgents.length), turtle = owner.turtleAgents[0]; assert.ok(owner);
  turtle.alive = false; turtle.state = 'dead'; const dead = clone(owner); await current.checkpoint(); const restored = await model(current.store);
  assert.deepEqual(restored._active.get(owner.id), dead); assert.equal(restored._active.get(owner.id).turtleAgents.length, 1);
  assert.ok(restored.snapshot().regions.every(r => r.agentCount <= 20));
});

test('invalid saved turtle identity, ownership, body, grass source, finite clock, future marker or excess speed is rejected without regenerating old animals', async () => {
  const current = await model(); await current.checkpoint(); const region = [...current._active.values()].find(r => r.turtleAgents.length), original = clone(region), key = `${WORLD}|${region.id}`;
  const mutations = [r => { r.turtleCommunityVersion = 99; }, r => { r.turtleInitializedAtSec = r.timeSec + 1; },
    r => { r.turtleAgents[0].position.x += 64; }, r => { r.turtleAgents[0].position.y = current._surface(r.turtleAgents[0].position.x, r.turtleAgents[0].position.z, true); },
    r => { r.turtleAgents[0].id = 'duplicate:invalid'; }, r => { r.turtleAgents[0].sourceGrassId = 'missing:grass'; },
    r => { r.turtleAgents[0].sizeM = NaN; }, r => { r.turtleAgents[0].timeSec = r.timeSec + 1; },
    r => { r.turtleAgents[0].velocity.x = 999; }, r => { r.turtleAgents[0].state = 'breathing'; r.turtleAgents[0].pitch = .15; },
    r => { r.turtleAgents[0].position.y = 8 - .055 * r.turtleAgents[0].sizeM; },
    r => { r.turtleAgents.push(clone(r.turtleAgents[0])); }];
  for (const mutate of mutations) {
    const store = new MemoryStore(); store.records = new Map(clone([...current.store.records])); const corrupt = clone(original); mutate(corrupt); store.records.set(key, corrupt);
    const restored = new OceanEcology('42', createOceanGenerator('42'), { store, turtles: true });
    await assert.rejects(restored.update(FIXTURE), /Invalid saved grass-bed turtle/);
    assert.equal(restored._active.has(region.id), false); assert.deepEqual(store.records.get(key), corrupt);
  }
  const sequential = new MemoryStore(); sequential.saveMany = undefined; const legacy = await model(sequential);
  assert.equal(turtles(legacy).length, 0); assert.ok(records(legacy).every(r => !Object.hasOwn(r, 'turtleCommunityVersion')));
});

test('the old roaming ray candidate and ownership commit reserve a saved turtle death as a twentieth resident', async () => {
  const current = await model(), destination = [...current._active.values()].find(r => r.turtleAgents.length && r.agents.length);
  assert.ok(destination); destination.turtleAgents[0].alive = false; destination.turtleAgents[0].state = 'dead';
  const template = destination.agents[0]; while (destination.agents.length < 19)
    destination.agents.push({ ...clone(template), id: `dead:transfer-capacity:${destination.agents.length}`, alive: false, state: 'dead', energy: 0 });
  const source = current._createRegion(destination.cx + 1, destination.cz), actual = current._createRegion(4, -2); actual.agents = []; current._supplementMantaRegion(actual);
  assert.equal(actual.agents.length, 1); const incoming = clone(actual.agents[0]); incoming.regionId = source.id; incoming.roamingVersion = 1;
  source.agents = [incoming]; current._active = new Map([[source.id, source], [destination.id, destination]]);
  let point;
  for (let offset = 4; offset <= 60 && !point; offset += 4) {
    const p = { x: (destination.cx + 1) * 64 - .01, z: destination.cz * 64 + offset };
    const y = current._mantaY(p.x, p.z, 2.5, incoming.sizeM); if (y !== null) point = { ...p, y };
  }
  assert.ok(point, 'the real seam contains a physically supported candidate'); incoming.position = { ...point, x: point.x + .02 };
  const pose = clone(incoming.position);
  assert.equal(current._mantaCandidate(incoming, point, .05), null, 'a lookahead cannot reserve the turtle death slot');
  current._transfers = [{ agent: incoming, owner: source, destination, position: point, previous: pose, dt: .1 }]; current._applyMantaTransfers();
  assert.ok(source.agents.includes(incoming)); assert.equal(destination.agents.length, 19); assert.deepEqual(incoming.position, pose);
  assert.equal(destination.agents.length + destination.turtleAgents.length, 20, 'the atomic ownership commit cannot create a twenty-first resident');
});
