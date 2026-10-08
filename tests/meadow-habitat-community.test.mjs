import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanBenthicLifePlan, initializeOceanBenthicLife, tickOceanBenthicLifeAgent,
  validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { createOceanMeadowLifePlan, initializeOceanMeadowLife, validateOceanMeadowLifeRecord,
  oceanMeadowLifePositionValid, tickOceanMeadowLife } from '../src/oceanMeadowLife.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';
import { initializeLivingNetwork, livingNetworkBalance, validateLivingNetworkRecord, recordLivingDeath } from '../src/livingEcologyNetwork.js';
import { oceanTurtleSeagrassLeafPose } from '../src/oceanTurtleGrazing.js';

const clone = value => structuredClone(value);
function fixture({ seed = 'belt-bottom', marked = true, grass = true, rocks = true, count = 0 } = {}) {
  const cx = 228, cz = 4, x0 = cx * 64, z0 = cz * 64;
  const chunk = { id: `${cx},${cz}`, cx, cz, origin: { x: x0, z: z0 }, size: 64,
    bounds: { minX: x0, maxX: x0 + 64, minZ: z0, maxZ: z0 + 64 }, counts: {}, elements: [] };
  if (rocks) chunk.elements.push({ id: 'belt-island', kind: 'rock', profile: 'terrace', x: x0 + 27, y: 0, z: z0 + 37,
    scale: { x: 12, y: 2, z: 12 }, rotation: .2 });
  if (grass) for (let index = 0; index < 8; index++) chunk.elements.push({ id: `grass:${index}`, kind: 'seagrass',
    x: x0 + 8 + index * 6, y: 0, z: z0 + 36, rotation: .1, scale: { x: .7, y: .4, z: .7 } });
  chunk.elements.push({ id: 'belt-algae', kind: 'algae', x: x0 + 27, y: 2, z: z0 + 37,
    scale: { x: 1, y: .018, z: 1 }, rotation: 0, attachmentId: 'belt-island' });
  const routePath = [{ x: x0 + 2, y: 2, z: z0 + 30, sM: 0 }, { x: x0 + 62, y: 2, z: z0 + 30, sM: 60 }];
  chunk.ridgePlan = { version: 9, theme: 'seagrass-meadow-region', id: chunk.id, cx, cz, seed,
    group: { id: `seagrass-meadow-region:${cx},${cz}`, cx, cz, seed,
      ownerIds: [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) => `${cx + dx},${cz + dz}`)), routePath } };
  const bed = () => 0;
  const surface = (x, z) => chunk.elements.reduce((y, e) => e.kind === 'rock' ? Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity) : y, 0);
  const generator = { seed, profile: 'living-shallows-v1', surfaceY: 8, chunk: () => chunk,
    floorSurface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
    sample: (x, z) => ({ floorY: 0, depthM: 8, substrate: surface(x, z) > .06 ? 'rock' : 'sand' }) };
  const region = { id: chunk.id, cx, cz, timeSec: 0, ticks: 0, agents: [], turtleAgents: [], events: [],
    resources: { algae: .4, plankton: .5, detritus: .3 }, counters: { feeding: 0, deaths: 0 },
    ledger: { initial: 1.2, input: 0, ingested: 0, exported: 0 }, reefGuildVersion: 1, reefGuild: { preyOrganicUnits: .05 } };
  for (let index = 0; index < count; index++) region.agents.push({ id: `historic:${index}`, regionId: region.id,
    speciesId: 'green-chromis', alive: index % 2 === 0, energy: .5, sizeM: .075,
    position: { x: x0 + 60, y: 2, z: z0 + 60 }, timeSec: 0 });
  if (marked) Object.assign(region, { meadowAnimalBeltVersion: 1,
    meadowAnimalBelt: { version: 1, initializedAtSec: 0, groupId: `${cx},${cz}`, recipe: 'route-neighborhood-v1' } });
  initializeLivingNetwork(region, chunk);
  return { chunk, generator, region, surface, bed, x0, z0, routePath };
}
const options = f => ({ surface: f.surface, bed: f.bed, random: () => .1 });
import { validateMeadowAnimalBelt, meadowAnimalBeltAllocation } from '../src/meadowAnimalBelt.js';
const community = f => {
  f.region.meadowAnimalBeltVersion = 2;
  Object.assign(f.region.meadowAnimalBelt, { version: 2, recipe: 'habitat-community-v2' });
  return f;
};

test('v2 metadata admits only its matching actual v9 group and shares a twenty-record budget', () => {
  const old=fixture(), f=community(fixture());
  assert.equal(meadowAnimalBeltAllocation(old.generator,old.region).meadow,2);
  const q=meadowAnimalBeltAllocation(f.generator,f.region);
  assert.equal(q.meadow,4); assert.equal(q.shoal,5);
  assert.equal(Object.entries(q).filter(([k])=>k!=='total').reduce((n,[,v])=>n+v,0),20);
  for(const mutate of [r=>r.meadowAnimalBelt.version=1,r=>r.meadowAnimalBelt.recipe='route-neighborhood-v1',
    r=>r.meadowAnimalBeltVersion=3,r=>r.meadowAnimalBelt.extra=1]) {
    const bad=clone(f.region);mutate(bad);assert.equal(validateMeadowAnimalBelt(bad,f.generator),false);
    assert.equal(meadowAnimalBeltAllocation(f.generator,bad),null);
  }
  f.chunk.ridgePlan.version=8;assert.equal(validateMeadowAnimalBelt(f.region,f.generator),false);
});

test('grass, reef-water and buried soft-bottom actors share real space without the old two-animal cut-off', () => {
  const f=community(fixture()), old=fixture(), unchanged=clone(f.chunk);
  const p=createOceanMeadowLifePlan(f.generator,f.region,{...options(f),availableSlots:4});
  const prior=createOceanMeadowLifePlan(old.generator,old.region,{...options(old),availableSlots:4});
  assert.equal(prior.placements.length,2); assert.equal(p.placements.length,3);
  assert.deepEqual(new Set(p.placements.map(a=>a.mode)),new Set(['grass-tail','reef-water','soft-buried']));
  assert.deepEqual(f.chunk,unchanged);
  assert.ok(initializeOceanMeadowLife(f.region,f.generator,{...options(f),fresh:true,maxAdded:4}));
  assert.ok(validateOceanMeadowLifeRecord(f.region,f.generator,f));
  assert.ok(Math.abs(livingNetworkBalance(f.region))<1e-9);
  assert.deepEqual(createOceanMeadowLifePlan(old.generator,old.region,{...options(old),availableSlots:4}),prior);
});

test('missing grass, actual hard substrate and blocked bodies still refuse unsupported roles', () => {
  const grassless=community(fixture({grass:false})), rockless=community(fixture({rocks:false}));
  const plan=f=>createOceanMeadowLifePlan(f.generator,f.region,{...options(f),availableSlots:4});
  assert.ok(plan(grassless).placements.every(a=>a.speciesId!=='sand-edge-seahorse'));
  assert.ok(plan(rockless).placements.every(a=>!['reef-cuttlefish','spider-conch'].includes(a.speciesId)));
  const blocked=community(fixture()), surface=(x,z,crown)=>blocked.surface(x,z)+(crown?20:0);
  const p=createOceanMeadowLifePlan(blocked.generator,blocked.region,{surface,bed:blocked.bed,availableSlots:4});
  assert.ok(p.placements.every(a=>a.mode==='grass-tail'));
});

test('historical dead records occupy the complete budget and an initialized roster cannot refill', () => {
  const f=community(fixture({count:19}));
  assert.ok(initializeOceanMeadowLife(f.region,f.generator,{...options(f),fresh:true,maxAdded:4}));
  assert.equal(f.region.agents.length,20);
  const before=clone(f.region);
  assert.equal(initializeOceanMeadowLife(f.region,f.generator,{...options(f),fresh:true,maxAdded:4}),false);
  assert.deepEqual(f.region,before);
});
