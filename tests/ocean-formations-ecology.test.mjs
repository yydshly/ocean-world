import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanEcology, oceanSupportHeight } from '../src/oceanEcology.js';
import { oceanRockHeight, oceanRockMesh, OCEAN_ROCK_PROFILES } from '../src/oceanRockShape.js';
import { OCEAN_FORMATIONS_VERSION } from '../src/oceanFormations.js';
import { OCEAN_SLOPE_COMMUNITY_VERSION } from '../src/oceanSlopeCommunity.js';
import { speciesById } from '../src/species.js';

const WORLD = 'ecology-v1:string:42';
const POINTS = ['position', 'home', 'target', 'refuge'];
const clone = value => structuredClone(value);
// Formation fixtures still compare every historical animal/clock/ledger field;
// only the separate one-time pelagic additions are outside that old projection.
function withoutPelagicUpgrade(region) {
  const record = clone(region);
  for (const key of ['pelagicCommunityVersion', 'pelagicCommunityAdded', 'pelagicInitializedAtSec', 'mantaCommunityVersion', 'mantaCommunityAdded', 'mantaInitializedAtSec']) delete record[key];
  record.agents = record.agents.filter(agent => !['pelagic-community-v1', 'manta-community-v1'].includes(agent.populationOrigin));
  return record;
}
class MemoryStore {
  available = true;
  records = new Map();
  saves = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, state) {
    this.onSave?.(world, id, state);
    this.saves.push({ world, id, state: clone(state) });
    this.records.set(`${world}|${id}`, clone(state));
  }
  async clear(world) { for (const key of this.records.keys()) if (key.startsWith(`${world}|`)) this.records.delete(key); }
}

function fixtureGenerator({ marker = true, rock = true, formation = true, owner = [2, 2], shape } = {}) {
  const existingRock = { id: 'old-rock', kind: 'rock', x: 160, y: -18, z: 160,
    scale: { x: 10, y: 3, z: 10 }, rotation: 0, profile: 'terrace' };
  const addition = shape || { id: 'new-formation', kind: 'formation', x: 176, y: -18, z: 160,
    scale: { x: 30, y: 3, z: 10 }, rotation: 0, profile: 'mound' };
  return {
    sample: () => ({ floorY: -18, depthM: 26, habitat: 'slope', substrate: 'mixed', rockiness: .45, seagrassSuitability: 0 }),
    chunk(cx, cz) {
      const owned = cx === owner[0] && cz === owner[1];
      const elements = owned ? [...(rock ? [existingRock] : []), ...(formation ? [addition] : [])] : [];
      return { id: `${cx},${cz}`, cx, cz, origin: { x: cx * 64, z: cz * 64 }, size: 64,
        bounds: { minX: cx * 64, maxX: (cx + 1) * 64, minZ: cz * 64, maxZ: (cz + 1) * 64 },
        counts: { rock: owned && rock ? 1 : 0, coral: 0, seagrass: 0, rubble: 0, algae: 0,
          formation: owned && formation ? 1 : 0 }, elements,
        ...(marker ? { formationsVersion: OCEAN_FORMATIONS_VERSION } : {}) };
    },
  };
}

function animal(id, speciesId, points, { dead = false, offset = .004 } = {}) {
  return { id, regionId: '2,2', speciesId, ...Object.fromEntries(POINTS.map((key, i) => [key, { ...points[i] }])),
    velocity: { x: .013, y: -.002, z: -.01 }, heading: 1.7, sizeM: speciesById[speciesId].lengthM,
    alive: !dead, state: dead ? 'dead' : 'foraging', energy: dead ? 0 : .73, stateSince: 12.4,
    parasites: .17, lastFeedAt: 8.2, nextBite: 34, nextDecision: 35, decisions: 9,
    refugeHostId: 'historical-host', habitat: 'historical-habitat', groupId: 'historical-group',
    supportOffset: offset, fleeUntil: 33, timeSec: 32.8 };
}
const p = (x, y, z = 160) => ({ x, y, z });
function savedRegion() {
  return { version: 1, surfaceVersion: 2, id: '2,2', cx: 2, cz: 2, habitat: 'slope',
    // These fixtures isolate geometric migration after the optional community
    // pass. Unmarked cohorts and their exact preservation have separate tests.
    slopeCommunityVersion: OCEAN_SLOPE_COMMUNITY_VERSION,
    timeSec: 32.8, ticks: 328, resources: { algae: .21, plankton: .33, detritus: .47 },
    ledger: { initial: 1.07, input: .19, ingested: .1, exported: .15 },
    counters: { feeding: 17, escapes: 3, cleaning: 2, predation: 1, deaths: 2 },
    events: [{ id: 'historical-event', timeSec: 8.2, type: 'feeding' }],
    agents: [
      animal('old-bottom', 'black-cucumber', [p(176, -17.996), p(150, -19), p(158, -15), p(176, -12)]),
      animal('old-fish', 'green-chromis', [p(176, -13), p(176, -17.2), p(181, -17.3), p(150, -17)], { offset: .8 }),
      animal('dead-clam', 'giant-clam', [p(173, -17.996), p(177, -17.996), p(150, -17.996), p(180, -17.996)], { dead: true }),
      animal('dead-shrimp', 'cleaner-shrimp', [p(180, -17.996), p(174, -17.996), p(150, -17.996), p(176, -17.996)], { dead: true }),
    ] };
}
function withoutMigration(region) {
  const result = withoutPelagicUpgrade(region);
  delete result.formationsVersion;
  for (const agent of result.agents) for (const key of POINTS) delete agent[key].y;
  return result;
}
function forbidSavedRebuild(ecology) {
  const create = ecology._createRegion.bind(ecology);
  ecology._createRegion = (cx, cz) => {
    assert.ok(cx !== 2 || cz !== 2, 'the historical record must never enter the new population allocator');
    return create(cx, cz);
  };
}

test('v2 records lift only newly obstructed Y values, retaining unaffected points, elevated fish and dead state', async () => {
  const generator = fixtureGenerator(), store = new MemoryStore(), old = savedRegion();
  await store.save(WORLD, old.id, old);
  const ecology = new OceanEcology('42', generator, { store });
  forbidSavedRebuild(ecology);
  const activeAtSave = [];
  store.onSave = (world, id) => { if (id === old.id) activeAtSave.push(ecology._active.has(id)); };
  await ecology.update({ x: 160, z: 160 });
  const current = ecology._active.get(old.id);
  assert.deepEqual(withoutMigration(current), withoutMigration(old));
  assert.equal(current.surfaceVersion, 2);
  assert.equal(current.formationsVersion, OCEAN_FORMATIONS_VERSION);
  assert.equal(withoutPelagicUpgrade(current).agents.length, old.agents.length);
  let moved = 0, unchanged = 0;
  for (const agent of withoutPelagicUpgrade(current).agents) {
    const previousAgent = old.agents.find(candidate => candidate.id === agent.id), fish = speciesById[agent.speciesId].kind === 'fish';
    for (const key of POINTS) {
      const point = previousAgent[key], before = oceanSupportHeight(generator, point.x, point.z, { avoidCoral: fish, includeFormations: false });
      const after = oceanSupportHeight(generator, point.x, point.z, { avoidCoral: fish });
      const minimum = after + Math.max(fish ? .08 : .004, previousAgent.supportOffset);
      const expected = after > before + 1e-9 && point.y < minimum ? minimum : point.y;
      assert.equal(agent[key].y, expected);
      if (expected === point.y) unchanged++; else moved++;
    }
  }
  assert.ok(moved >= 6 && unchanged >= 4, 'the fixture exercises both covered and unchanged coordinates');
  assert.equal(current.agents[0].home.y, -19, 'an unaffected historical below-floor point is not silently normalized');
  assert.equal(current.agents[1].position.y, -13, 'fish already above the new crest stays at its original height');
  assert.deepEqual(current.agents.filter(agent => !agent.alive).map(agent => [agent.id, agent.state, agent.energy]),
    [['dead-clam', 'dead', 0], ['dead-shrimp', 'dead', 0]]);
  assert.deepEqual(activeAtSave, [false], 'marker and Y changes are saved before activating the record');
  assert.deepEqual(await store.load(WORLD, old.id), current);
});

test('formation migration is persisted once and is byte-equivalent during pause, unload, revisit and reopening', async () => {
  const generator = fixtureGenerator(), store = new MemoryStore();
  await store.save(WORLD, '2,2', savedRegion());
  const ecology = new OceanEcology('42', generator, { store });
  forbidSavedRebuild(ecology);
  await ecology.update({ x: 160, z: 160 });
  const expected = clone(ecology._active.get('2,2'));
  assert.equal(ecology._reanchorFormations(ecology._active.get('2,2')), false);
  ecology.step(0);
  assert.deepEqual(ecology._active.get('2,2'), expected);
  await ecology.update({ x: 800, z: 800 });
  ecology.step(2);
  await ecology.update({ x: 160, z: 160 });
  assert.deepEqual(ecology._active.get('2,2'), expected);
  await ecology.dispose();
  const reopened = new OceanEcology('42', generator, { store });
  forbidSavedRebuild(reopened);
  const saves = store.saves.length;
  await reopened.update({ x: 160, z: 160 });
  assert.deepEqual(reopened._active.get('2,2'), expected);
  assert.equal(store.saves.length, saves, 'marked records do not receive another migration save');
  assert.ok([...store.records.keys()].every(key => key.startsWith(`${WORLD}|`)));
});

test('pre-v2 surface records complete their old-rock reanchor before the one-time formation correction', async () => {
  const generator = fixtureGenerator(), store = new MemoryStore(), old = savedRegion();
  delete old.surfaceVersion;
  old.agents[0].position.x = 164;
  const legacyHeight = (x, z) => {
    const radius = ((x - 160) / 5) ** 2 + ((z - 160) / 5) ** 2;
    return radius <= 1 ? -18 + 3 * Math.sqrt(Math.max(0, 1 - radius)) : -18;
  };
  const expectedIntermediate = clone(old);
  for (const agent of old.agents) for (const key of POINTS) agent[key].y = legacyHeight(agent[key].x, agent[key].z) + agent.supportOffset;
  for (const agent of expectedIntermediate.agents) for (const key of POINTS) {
    agent[key].y = oceanSupportHeight(generator, agent[key].x, agent[key].z,
      { avoidCoral: speciesById[agent.speciesId].kind === 'fish', includeFormations: false }) + agent.supportOffset;
  }
  expectedIntermediate.surfaceVersion = 2;
  await store.save(WORLD, old.id, old);
  const ecology = new OceanEcology('42', generator, { store });
  forbidSavedRebuild(ecology);
  const migrate = ecology._reanchorFormations.bind(ecology);
  let inspected = false;
  ecology._reanchorFormations = region => {
    if (region.id === old.id) {
      assert.deepEqual(region, expectedIntermediate, 'surfaceVersion2 uses the old scene support without the added formation');
      inspected = true;
    }
    return migrate(region);
  };
  await ecology.update({ x: 160, z: 160 });
  assert.ok(inspected);
  const current = ecology._active.get(old.id), expected = clone(expectedIntermediate);
  for (const agent of expected.agents) for (const key of POINTS) {
    const before = oceanSupportHeight(generator, agent[key].x, agent[key].z, { includeFormations: false });
    const after = oceanSupportHeight(generator, agent[key].x, agent[key].z);
    if (after > before + 1e-9) agent[key].y = Math.max(agent[key].y, after + agent.supportOffset);
  }
  expected.formationsVersion = OCEAN_FORMATIONS_VERSION;
  assert.deepEqual(withoutPelagicUpgrade(current), expected);
  assert.deepEqual(await store.load(WORLD, old.id), current);
});

test('cached and uncached formation support matches transformed shared mesh hits across positive and negative seams', () => {
  for (const profile of OCEAN_ROCK_PROFILES) for (const [owner, x, z] of [[[2, 2], 191, 160], [[-1, -1], -1, -32]]) {
    const formation = { id: `seam:${profile}:${x}`, kind: 'formation', x, y: -18, z,
      profile, rotation: .37, scale: { x: 20, y: 3, z: 10 } };
    const generator = fixtureGenerator({ rock: false, owner, shape: formation });
    const ecology = new OceanEcology('42', generator, { store: new MemoryStore() });
    const data = oceanRockMesh(profile), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex([...data.indices]);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, -18, z); mesh.scale.set(20, 3, 10); mesh.rotation.y = .37; mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    try {
      let acrossSeam = 0;
      for (let iz = -3; iz <= 3; iz++) for (let ix = -5; ix <= 5; ix++) {
        const wx = x + ix * 1.7 + .013, wz = z + iz * .87 + .021;
        ray.set(new THREE.Vector3(wx, 0, wz), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh)[0], expected = hit ? Math.max(-18, hit.point.y) : -18;
        assert.ok(Math.abs(oceanSupportHeight(generator, wx, wz) - expected) < 1e-6);
        assert.ok(Math.abs(ecology._surface(wx, wz) - expected) < 1e-6);
        assert.equal(ecology._surface(wx, wz, false, false), -18, 'the same cache can query the pre-addition support');
        assert.equal(oceanSupportHeight(generator, wx, wz, { includeFormations: false }), -18);
        assert.ok(Math.abs(ecology._surface(wx, wz) - expected) < 1e-6, 'querying old support does not poison the new surface cache');
        if (hit && Math.floor(wx / 64) !== owner[0]) acrossSeam++;
      }
      assert.ok(acrossSeam > 5, 'actual formation faces are queried from a neighbouring owner');
    } finally { geometry.dispose(); material.dispose(); }
  }
});

test('new deep geometry records omit shallow allocation; a missing formation marker preserves old geometry through the separate pelagic upgrade', async () => {
  const generator = fixtureGenerator(), fresh = new OceanEcology('42', generator, { store: new MemoryStore() })._createRegion(2, 2);
  assert.equal(fresh.formationsVersion, OCEAN_FORMATIONS_VERSION);
  assert.equal(fresh.agents.length, 0);
  const original = new OceanEcology('42', fixtureGenerator({ marker: false, formation: false }), { store: new MemoryStore() })._createRegion(2, 2);
  assert.deepEqual(fresh.resources, original.resources, 'the formation does not count as an old rock or add a food pool');
  assert.equal(fresh.ledger.initial, original.ledger.initial);
  const store = new MemoryStore(), old = savedRegion(), unmarked = fixtureGenerator({ marker: false, formation: false });
  await store.save(WORLD, old.id, old);
  const ecology = new OceanEcology('42', unmarked, { store });
  forbidSavedRebuild(ecology);
  const saves = store.saves.length;
  await ecology.update({ x: 160, z: 160 });
  const current = ecology._active.get(old.id);
  assert.deepEqual(withoutPelagicUpgrade(current), old);
  assert.equal(current.pelagicCommunityVersion, 1);
  assert.equal(current.pelagicInitializedAtSec, old.timeSec);
  const added = current.agents.filter(agent => agent.populationOrigin === 'pelagic-community-v1');
  assert.equal(current.pelagicCommunityAdded, added.length);
  assert.ok(added.length >= 4);
  assert.equal(store.saves.length, saves + 1, 'only the eligible pelagic upgrade requires a new save');
  assert.deepEqual(await store.load(WORLD, old.id), current);
  assert.equal(Object.hasOwn(current, 'formationsVersion'), false);
});
