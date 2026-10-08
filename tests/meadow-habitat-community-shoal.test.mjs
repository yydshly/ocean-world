import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeLivingNetwork, tickLivingNetwork, livingNetworkBalance } from '../src/livingEcologyNetwork.js';
import { oceanShoalLifeRole, createOceanShoalLifePlan, initializeOceanShoalLife, validateOceanShoalLifeRecord, tickOceanShoalLife } from '../src/oceanShoalLife.js';
import { meadowAnimalBeltSites } from '../src/meadowAnimalBelt.js';

function fixture({ marked = true, seed = 'belt-fixture', floorY = -8, count = 0, plankton = .5 } = {}) {
  const group = { id: 'seagrass-meadow-region:228,4', cx: 228, cz: 4, seed,
    ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${228 + dx},${4 + dz}`)),
    routePath: [{ x: 14592, y: floorY + 2, z: 320 }, { x: 14976, y: floorY + 2, z: 320 }] };
  const r = { id: '228,4', cx: 228, cz: 4, ticks: 0, timeSec: 0, agents: [], turtleAgents: [], events: [], counters: { feeding: 0, deaths: 0 },
    resources: { algae: .3, plankton, detritus: .2 }, ledger: { initial: .5 + plankton, input: 0, ingested: 0, exported: 0 } };
  if (marked) Object.assign(r, { meadowAnimalBeltVersion: 1, meadowAnimalBelt: { version: 1, initializedAtSec: 0, groupId: '228,4', recipe: 'route-neighborhood-v1' } });
  const plan = { version: 9, theme: 'seagrass-meadow-region', id: r.id, cx: r.cx, cz: r.cz, seed, group },
    chunk = { id: r.id, cx: r.cx, cz: r.cz, origin: { x: 14592, z: 256 }, size: 64, elements: [], ridgePlan: plan };
  const g = { seed, profile: 'living-shallows-v1', surfaceY: 8,
    chunk(cx, cz) { return { ...chunk, id: `${cx},${cz}`, cx, cz, ...(cx !== r.cx || cz !== r.cz ? { ridgePlan: undefined } : {}) }; },
    floorSurface: () => ({ height: floorY, normal: { x: 0, y: 1, z: 0 } }), sample: () => ({ substrate: 'sand', floorY, depthM: 8 - floorY }) };
  for (let i = 0; i < count; i++) r.agents.push({ id: `prior:${i}`, regionId: r.id, speciesId: 'green-chromis', alive: i % 2 === 0,
    sizeM: .1, energy: .5, position: { x: 14652, y: floorY + 1, z: 259 } });
  initializeLivingNetwork(r, chunk);
  return { r, g, chunk, group, surface: () => floorY, bed: () => floorY };
}
const options = f => ({ surface: f.surface, bed: f.bed });
function step(f, { network = true } = {}) { const env = { foodSupply: 0, currentMps: 0, hour: 10, lightAtDepth: 1 }; f.r.ticks++; f.r.timeSec = f.r.ticks * .1;
  if (network) tickLivingNetwork(f.r, env, .1); assert.ok(tickOceanShoalLife(f.r, f.g, .1, { ...options(f), environmentAt: () => env })); }


test('v2 keeps an actual five-member school with complete body clearance, conserved food and a persistent roster', () => {
  const f=fixture();f.r.meadowAnimalBeltVersion=2;
  Object.assign(f.r.meadowAnimalBelt,{version:2,recipe:'habitat-community-v2'});
  const p=createOceanShoalLifePlan(f.g,f.r,{...options(f),availableSlots:5});
  assert.ok(p.school);assert.equal(p.placements.length,5);
  assert.equal(new Set(p.placements.map(a=>a.id)).size,5);
  assert.ok(initializeOceanShoalLife(f.r,f.g,{...options(f),fresh:true,maxAdded:5}));
  const roster=[...f.r.shoalLife.school.memberIds], before=structuredClone(f.r.agents);
  for(let i=0;i<40;i++) step(f);
  assert.ok(f.r.agents.some((a,i)=>Math.hypot(a.position.x-before[i].position.x,a.position.z-before[i].position.z)>.01));
  assert.ok(validateOceanShoalLifeRecord(f.r,f.g,options(f)));
  assert.deepEqual(f.r.shoalLife.school.memberIds,roster);assert.ok(Math.abs(livingNetworkBalance(f.r))<1e-9);
  const cold=structuredClone(f.r);assert.ok(validateOceanShoalLifeRecord(cold,f.g,options(f)));
  assert.equal(initializeOceanShoalLife(cold,f.g,{...options(f),fresh:true,maxAdded:5}),false);
});

test('v2 schools still reject inadequate capacity, invalid depth and whole-body obstacles', () => {
  for(const setup of [{count:16},{floorY:-24},{}]) {
    const f=fixture(setup);f.r.meadowAnimalBeltVersion=2;Object.assign(f.r.meadowAnimalBelt,{version:2,recipe:'habitat-community-v2'});
    const q=setup.count?options(f):setup.floorY?options(f):{surface:()=>-5,bed:f.bed};
    const p=createOceanShoalLifePlan(f.g,f.r,{...q,availableSlots:setup.count?4:5});
    assert.deepEqual(p.placements,[]);
  }
});
