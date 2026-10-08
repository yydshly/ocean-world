import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanAnimalSediment, OCEAN_ANIMAL_SEDIMENT_LIMIT } from '../src/world/OceanAnimalSediment.js';
import { initializeLivingNetwork, livingNetworkBalance } from '../src/livingEcologyNetwork.js';
import { initializeOceanBenthicLife, tickOceanBenthicLifeAgent } from '../src/oceanBenthicLife.js';

const flat = () => ({ profile: 'living-shallows-v1', sample: () => ({ substrate: 'sand' }),
  floorSurface: () => ({ height: -3, normal: { x: 0, y: 1, z: 0 } }) });
const animal = (overrides = {}) => ({ id: 'actual-ray:1', speciesId: 'blue-spotted-ray', alive: true,
  position: { x: 200, y: -2.996, z: 200 }, timeSec: 0, lastFeedAt: null,
  benthicLifeIndividualVersion: 1, benthicLifeMode: 'soft', ...overrides });
const frame = (agents, overrides = {}) => ({ agents, generator: flat(), surfaceAt: () => -3,
  cameraPosition: { x: 200, y: -1, z: 200 }, renderOrigin: { x: 192, z: 192 }, dtSec: .1,
  currentVector: { x: 0, z: 0 }, ...overrides });
const make = t => { const display = new OceanAnimalSediment(new THREE.Scene(), { seed: 'sand' }); t.after(() => display.dispose()); return display; };
const clone = value => structuredClone(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('real native benthic ingestion triggers a display puff without changing animal, food or organic accounts', t => {
  const display = make(t), chunk = { id: '3,3', cx: 3, cz: 3, origin: { x: 192, z: 192 }, size: 64,
    bounds: { minX: 192, maxX: 256, minZ: 192, maxZ: 256 }, elements: [], counts: {} };
  const generator = { ...flat(), seed: 'native-sediment', surfaceY: 8, chunk: () => chunk,
    sample: () => ({ substrate: 'sand', floorY: -3, depthM: 11 }) };
  const region = { id: '3,3', cx: 3, cz: 3, timeSec: 0, ticks: 0, agents: [], events: [], turtleAgents: [],
    resources: { algae: .4, plankton: .5, detritus: .3 }, counters: { feeding: 0, deaths: 0 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 } };
  initializeLivingNetwork(region, chunk);
  assert.equal(initializeOceanBenthicLife(region, generator, {
    fresh: true, capacity: 20, random: () => .1, surface: () => -3, bed: () => -3,
  }), true);
  const agent = region.agents.find(a => a.speciesId === 'reef-goatfish');
  assert.ok(agent);
  const input = () => frame([{ ...agent, timeSec: region.timeSec }], {
    generator, cameraPosition: { x: agent.position.x, y: -1, z: agent.position.z },
  });
  display.update(input());
  assert.equal(display.stats.activeParticles, 0);
  const initialFood = region.resources.detritus;
  for (let step = 1; step <= 5; step++) {
    region.ticks = step; region.timeSec = step * .1;
    tickOceanBenthicLifeAgent(region, generator, agent, .1, {
      random: () => .1, surface: () => -3, bed: () => -3, environment: { lightAtDepth: .7 },
    });
    const before = clone(region), actualInput = freeze(input());
    display.update(actualInput);
    assert.deepEqual(region, before);
  }
  assert.ok(region.resources.detritus < initialFood);
  assert.ok(Number.isFinite(agent.lastFeedAt));
  assert.ok(Math.abs(livingNetworkBalance(region)) < 1e-10);
  assert.equal(display.stats.feedTriggers, 1);
  assert.equal(display.stats.moveTriggers, 0);
  assert.equal(display.stats.activeParticles, 10);
  assert.ok(display.particleSnapshot().every(p => p.sourceId === agent.id && p.position.y > -3));
});

test('only live shallow sand-bottom admitted animals can trigger; midwater, rocks and fixed feeders stay quiet', t => {
  const cases = [
    { agent: { alive: false } }, { agent: { alive: undefined } },
    { agent: { speciesId: 'green-turtle' } }, { agent: { speciesId: 'sand-edge-seahorse' } },
    { agent: { speciesId: 'barrel-sea-pen' } }, { agent: { speciesId: 'giant-clam' } },
    { agent: { speciesId: 'blue-tang' } }, { agent: { benthicLifeMode: 'hard' } },
    { agent: { benthicLifeIndividualVersion: undefined } },
    { agent: { position: { x: 200, y: -1, z: 200 } } },
    { agent: { position: { x: 200, y: -3.1, z: 200 } } },
    { frame: { generator: { ...flat(), profile: 'kelp' } } },
    { frame: { generator: { ...flat(), sample: () => ({ substrate: 'rock' }) } } },
    { frame: { generator: { ...flat(), floorSurface: () => ({ height: -100 }) } } },
    { frame: { surfaceAt: () => -2.8 } },
    { frame: { cameraPosition: { x: 260, y: -1, z: 200 } } },
  ];
  for (const entry of cases) {
    const display = make(t), agent = animal(entry.agent);
    display.update(frame([agent], entry.frame));
    display.update(frame([{ ...agent, timeSec: .1, lastFeedAt: .1 }], entry.frame));
    assert.equal(display.stats.activeParticles, 0, JSON.stringify(entry));
  }
  const valid = make(t), ray = animal();
  valid.update(frame([ray]));
  valid.update(frame([{ ...ray, timeSec: .1, lastFeedAt: .1 }]));
  assert.equal(valid.stats.feedTriggers, 1);
  assert.ok(valid.stats.activeParticles > 0);
});

test('sufficient actual bottom travel accumulates across frames with unchanged model clocks; goatfish swimming alone does not stir sand', t => {
  for (const [speciesId, speed, expected] of [['blue-spotted-ray', .10, 1], ['spotted-hermit-crab', .010, 1],
    ['black-cucumber', .006, 1], ['reef-goatfish', .16, 0]]) {
    const display = make(t), agent = animal({ speciesId, habitat: 'sand-with-seagrass',
      position: { x: 200, y: speciesId === 'reef-goatfish' ? -2.74 : -2.996, z: 200 } });
    display.update(frame([agent]));
    for (let step = 1; step <= 20; step++) {
      const current = { ...agent, timeSec: step * .1, position: { ...agent.position, x: 200 + step * .1 * speed } };
      display.update(frame([current]));
      display.update(frame([current], { dtSec: 0 }));
    }
    if (expected) assert.ok(display.stats.moveTriggers >= expected, speciesId);
    else assert.equal(display.stats.moveTriggers, 0, speciesId);
    assert.equal(display.stats.feedTriggers, 0);
  }
  const jump = make(t), agent = animal();
  jump.update(frame([agent]));
  jump.update(frame([{ ...agent, timeSec: .1, position: { ...agent.position, x: 220 } }]));
  assert.equal(jump.stats.activeParticles, 0, 'teleport is not native travel');
});

test('first exposure, pause, zero model dt and loading clock gaps never replay feeding or move display particles', t => {
  const display = make(t), initial = animal({ timeSec: 10, lastFeedAt: 10 });
  display.update(frame([initial]));
  assert.equal(display.stats.activeParticles, 0, 'saved feed not replayed');
  const fed = { ...initial, timeSec: 10.1, lastFeedAt: 10.1 };
  display.update(frame([fed]));
  const before = display.particleSnapshot(), clock = display.stats.clockSec;
  display.update(frame([{ ...fed, timeSec: 10.2, lastFeedAt: 10.2 }], { paused: true, dtSec: 10 }));
  assert.deepEqual(display.particleSnapshot(), before);
  display.update(frame([{ ...fed, timeSec: 10.3, lastFeedAt: 10.3 }], { dtSec: 0 }));
  assert.deepEqual(display.particleSnapshot(), before);
  assert.equal(display.stats.clockSec, clock);
  const loaded = { ...fed, timeSec: 100, lastFeedAt: 100 };
  display.update(frame([loaded], { dtSec: 90 }));
  assert.deepEqual(display.particleSnapshot(), before);
  display.update(frame([{ ...loaded, timeSec: 100.1 }], { dtSec: .1 }));
  assert.equal(display.stats.feedTriggers, 1);
  assert.equal(display.stats.skippedClockJumps, 1);
  assert.equal(display.stats.activeParticles, before.length);
  // A stale or future timestamp cannot impersonate a new present feeding.
  display.update(frame([{ ...loaded, timeSec: 100.2, lastFeedAt: 101 }]));
  assert.equal(display.stats.feedTriggers, 1);
});

test('local current advects emitted particles; gravity settles them and the actual floor clips every active slot', t => {
  const a = make(t), b = make(t), agent = animal();
  for (const display of [a, b]) {
    display.update(frame([agent]));
    display.update(frame([{ ...agent, timeSec: .1, lastFeedAt: .1 }]));
  }
  assert.deepEqual(a.particleSnapshot(), b.particleSnapshot());
  a.update(frame([], { dtSec: .5, currentVector: { x: .5, z: -.25 } }));
  b.update(frame([], { dtSec: .5, currentVector: { x: 0, z: 0 } }));
  const flow = a.particleSnapshot(), still = b.particleSnapshot();
  for (let index = 0; index < flow.length; index++) {
    assert.ok(Math.abs(flow[index].position.x - still[index].position.x - .1) < 1e-10);
    assert.ok(Math.abs(flow[index].position.z - still[index].position.z + .05) < 1e-10);
    assert.ok(flow[index].position.y > -3 && flow[index].position.y <= -2.3);
  }
  const early = b.particleSnapshot();
  for (let step = 0; step < 9; step++) b.update(frame([], { dtSec: .5 }));
  assert.ok(b.stats.activeParticles < early.length, 'finite gravity/lifetime must remove grains');
  a.update(frame([], { generator: { ...flat(), floorSurface: () => ({ height: -2 }) }, dtSec: .1 }));
  assert.equal(a.stats.activeParticles, 0, 'raised real floor terminates below-floor particles');
  assert.ok(a.stats.settledParticles > 0);
});

test('floating origin only changes rendered buffers, preserving logical particles and all caller-owned inputs', t => {
  const display = make(t), x = 1e9 + 8, z = -1e9 + 3;
  const agent = animal({ position: { x, y: -2.996, z } });
  const origin = { x: 1e9, z: -1e9 }, cameraPosition = { x, y: -1, z };
  display.update(frame(freeze([agent]), { renderOrigin: origin, cameraPosition }));
  const fed = freeze({ ...agent, timeSec: .1, lastFeedAt: .1 });
  const snapshot = clone(fed);
  display.update(frame([fed], { renderOrigin: origin, cameraPosition }));
  const logical = display.particleSnapshot(), geometry = display.root.geometry;
  for (const p of logical) {
    assert.ok(Math.abs(geometry.attributes.position.getX(p.slot) - (p.position.x - origin.x)) < 1e-5);
    assert.ok(Math.abs(geometry.attributes.position.getZ(p.slot) - (p.position.z - origin.z)) < 1e-5);
  }
  const nextOrigin = { x: origin.x + 64, z: origin.z - 64 };
  display.update(frame([fed], { renderOrigin: nextOrigin, cameraPosition, paused: true }));
  assert.deepEqual(display.particleSnapshot(), logical);
  assert.deepEqual(fed, snapshot);
  for (const p of logical) {
    assert.ok(Math.abs(geometry.attributes.position.getX(p.slot) - (p.position.x - nextOrigin.x)) < 1e-5);
    assert.ok(Math.abs(geometry.attributes.position.getZ(p.slot) - (p.position.z - nextOrigin.z)) < 1e-5);
  }
  assert.deepEqual(display.root.position.toArray(), [0, 0, 0]);
});

test('many real source identities share one fixed 256-slot buffer, bounded emission and scalar-only snapshots; unload forgets owners', t => {
  const display = make(t), agents = Array.from({ length: 220 }, (_, index) => animal({ id: `actual-ray:${index}` }));
  const geometry = display.root.geometry, material = display.root.material, positions = geometry.attributes.position.array;
  display.update(frame(agents));
  assert.equal(display.stats.trackedSources, 180);
  let previousEmitted = 0;
  for (let step = 1; step <= 20; step++) {
    display.update(frame(agents.map(a => ({ ...a, timeSec: step * .1, lastFeedAt: step * .1 }))));
    assert.ok(display.stats.emittedParticles - previousEmitted <= 32);
    previousEmitted = display.stats.emittedParticles;
    assert.ok(display.stats.activeParticles <= OCEAN_ANIMAL_SEDIMENT_LIMIT);
    assert.ok(display.stats.trackedSources <= 180);
  }
  assert.equal(display.stats.activeParticles, 256);
  assert.ok(display.stats.droppedParticles > 0);
  assert.equal(display.root.geometry, geometry);
  assert.equal(display.root.material, material);
  assert.equal(geometry.attributes.position.array, positions);
  assert.equal(display.stats.maxDrawCalls, 1);
  assert.equal(display.stats.textureCount, 0);
  for (const snapshot of display._sources.values()) assert.ok(Object.values(snapshot).every(v => v === null || typeof v !== 'object'));
  display.update(frame([], { dtSec: 0 }));
  assert.equal(display.stats.trackedSources, 0);
  assert.equal(display.stats.retainedEntityReferences, 0);
  const restored = agents.map(a => ({ ...a, timeSec: 50, lastFeedAt: 50 }));
  display.update(frame(restored));
  assert.equal(display.stats.emittedParticles, previousEmitted, 'unloaded owners do not replay a historical feed on restore');
});

test('reset reuses owned resources; disposal removes only its points and releases geometry/material exactly once', () => {
  const scene = new THREE.Scene(), other = new THREE.Group(); scene.add(other);
  const display = new OceanAnimalSediment(scene), geometry = display.root.geometry, material = display.root.material;
  const positions = geometry.attributes.position.array, opacity = geometry.attributes.opacity.array;
  const agent = animal();
  display.update(frame([agent]));
  display.update(frame([{ ...agent, timeSec: .1, lastFeedAt: .1 }]));
  assert.ok(display.stats.activeParticles);
  assert.equal(display.reset('new-world'), true);
  assert.equal(display.root.geometry, geometry); assert.equal(display.root.material, material);
  assert.equal(geometry.attributes.position.array, positions); assert.equal(geometry.attributes.opacity.array, opacity);
  assert.equal(display.stats.activeParticles, 0); assert.equal(display.stats.trackedSources, 0);
  assert.equal(display.stats.emittedParticles, 0); assert.equal(display.stats.clockSec, 0);
  let geometries = 0, materials = 0;
  geometry.addEventListener('dispose', () => geometries++); material.addEventListener('dispose', () => materials++);
  display.dispose(); display.dispose();
  assert.equal(geometries, 1); assert.equal(materials, 1);
  assert.equal(display.root.parent, null); assert.equal(other.parent, scene);
  assert.equal(display.stats.geometryCount, 0); assert.equal(display.stats.materialCount, 0);
  assert.equal(display.stats.activeParticles, 0); assert.equal(display.stats.visible, false);
  assert.equal(display.update(frame([])), false); assert.equal(display.reset('after-dispose'), false);
});
