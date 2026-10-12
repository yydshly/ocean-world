import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { seagrassMeadowRegionOrigin } from '../src/seagrassMeadowRegion.js';
import { isOceanMeadowLifeAgent, validateOceanMeadowLifeRecord, oceanMeadowForagingReady } from '../src/oceanMeadowLife.js';
import { MEADOW_FORAGING_IDS } from '../src/oceanMeadowForaging.js';
import { livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';

const seed = livingShallowsSeed('56'), base = createLivingShallowsGenerator(seed);
const ids = seagrassMeadowRegionOrigin(228, 4).ownerIds;
const opening = { x: 228 * 64 + 24, z: 4 * 64 + 64 };
const clone = x => structuredClone(x);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const at = (path, sM) => path.find(p => p.sM >= sM) ?? path.at(-1);
class Store {
  available = true; records = new Map(); commits = [];
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    const rows = clone(entries);
    for (const [id, row] of rows) this.records.set(`${world}|${id}`, row);
    this.commits.push(rows);
  }
}
function fixture(records = [], enabled = true) {
  const generator = createLivingRidgeGenerator(base), store = new Store(); store.records = new Map(clone(records));
  const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  const start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'), end = source.indexOf(');', start) + 1;
  class Capture { constructor(seed, generator, options) { this.options = options; } }
  const captured = new Function('OceanEcology', 'seed', `return ${source.slice(start, end)};`)
    .call({ isLivingShallows: true, oceanWorldVariant: 'meadow-food-web', oceanChunks: { generator } }, Capture, seed);
  const model = new OceanEcology(seed, generator, { ...captured.options, meadowForaging: true, meadowFoodWeb: enabled, store });
  return { generator, store, model };
}
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false), bed: (x, z) => f.model._bed(x, z) };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9);
  assert.ok(f.model._supportCells.size <= 25 && f.generator.registryStats().size <= 25);
  assert.ok(f.model._meadowRegionAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  for (const r of f.model._active.values()) {
    assert.ok(r.agents.length + (r.turtleAgents?.length ?? 0) <= 20);
    assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-8);
    assert.ok(validateOceanMeadowLifeRecord(r, f.generator, supports(f)), r.id + ': whole native record');
  }
}
let legacyBirths;
test('fresh food-web seed56 community approaches and feeds in three ordinary nine-owner windows with exact cold recovery', async () => {
  const f = fixture();
  try {
    await f.model.update(opening); bounded(f);
    const rows = ids.map(id => f.store.records.get(`${f.model._world}|${id}`));
    assert.ok(rows.every(r => r.meadowLifeForagingVersion === 2 && r.meadowAnimalBeltVersion === 2));
    assert.ok(f.store.commits.some(batch => batch.length === 12 && batch.every(([id, r]) => ids.includes(id) && r.meadowLifeForagingVersion === 2)));
    legacyBirths = capture(f.store.records);
    for(const [,r] of legacyBirths){if(r.meadowLifeForagingVersion===2)r.meadowLifeForagingVersion=1;for(const a of r.agents)if(a.meadowLifeForagingVersion===2)a.meadowLifeForagingVersion=1;}
    const baseline = process.env.MEADOW_FOOD_WEB_RECEIPT ? JSON.parse(readFileSync(new URL('../output/validation/meadow-food-web-native-v1-births.json',import.meta.url),'utf8')).map(([key,r])=>[key.replace('copy:meadow-foraging:','copy:meadow-food-web:'),r]) : null;
    if(process.env.MEADOW_FOOD_WEB_RECEIPT)assert.deepEqual(legacyBirths,baseline,'complete original birth stocks/classes preserved');
    const path = rows[0].livingRidgePlan.group.routePath;
    const all = rows.flatMap(r => r.agents.concat(r.turtleAgents ?? [])), originals = new Map(all.map(a => [a.id, clone(a)]));
    const moved = new Set(), fed = new Set(), paused = new Set();
    const report = { scope: 'native CPU three active windows; no GPU/image acceptance', seed: 56, routeM: path.at(-1).sM,
      totalAnimals: all.length, localTypes: new Set(all.map(a => a.speciesId)).size,
      meadowAnimals: all.filter(isOceanMeadowLifeAgent).length,
      classes: Object.fromEntries(['sand-edge-seahorse', 'reef-cuttlefish', 'barrel-sea-pen', 'spider-conch'].map(id => [id, { born: all.filter(a => a.speciesId === id).length, moved: 0, fed: 0, paused: 0 }])), windows: [] };
    for (const [index, sM] of [0, 140, 280].entries()) {
      await f.model.update(at(path, sM)); f.model.setEnvironment({ hour: index === 2 ? 2 : 10 });
      const steps = index === 0 ? 120 : 60;
      for (let i = 0; i < steps; i++) {
        f.model.step(.1);
        for (const a of f.model.agents.filter(isOceanMeadowLifeAgent)) {
          if (originals.has(a.id) && distance(a.position, originals.get(a.id).position) > .001) moved.add(a.id);
          if (a.state === 'meadow-forage-paused') paused.add(a.id);
          if (a.lastMeadowIntake?.timeSec === a.timeSec && a.lastMeadowIntake?.removedUnits > 0) {
            if (MEADOW_FORAGING_IDS.includes(a.speciesId)) assert.ok(oceanMeadowForagingReady(f.model._active.get(a.regionId), f.generator, a, supports(f)), a.id);
            fed.add(a.id);
          }
        }
      }
      bounded(f); await f.model.checkpoint();
      report.windows.push({ sM, modelSeconds: steps * .1, hour: index === 2 ? 2 : 10, activeOwners: [...f.model._active.keys()] });
    }
    for (const [id, counts] of Object.entries(report.classes)) {
      const animals = all.filter(a => a.speciesId === id);
      counts.moved = animals.filter(a => moved.has(a.id)).length; counts.fed = animals.filter(a => fed.has(a.id)).length; counts.paused = animals.filter(a => paused.has(a.id)).length;
    }
    assert.ok(report.meadowAnimals > 0);
    report.preySupport = ids.map(id => {
      const r = f.store.records.get(`${f.model._world}|${id}`);
      return { id, transferredUnits: r.reefGuild.counters.preySupportedUnits,
        remainingPreyUnits: r.reefGuild.preyOrganicUnits, remainingDetritusUnits: r.resources.detritus,
        guildConsumers: r.agents.filter(a => a.alive && ['day-octopus','spotted-reef-crab'].includes(a.speciesId)).length };
    });
    assert.ok(report.preySupport.some(r => r.guildConsumers === 0 && r.transferredUnits > 0), 'real meadow-only owner gets accounted detrital support');
    const active = capture(f.model._active), disk = capture(f.store.records), cold = fixture(disk);
    try { await cold.model.update(at(path, 280)); bounded(cold); assert.deepEqual(capture(cold.model._active), active); assert.deepEqual(capture(cold.store.records), disk); }
    finally { await cold.model.dispose(); }
    report.completeColdActiveAndDiskExact = true; report.modelSeconds = 24;
    assert.ok(report.classes['reef-cuttlefish'].fed>0,'native cuttlefish really ingests after actual arrival');
    assert.ok(report.classes['sand-edge-seahorse'].fed>1,'multiple native seahorses consume supported nutrition');
    if (process.env.MEADOW_FOOD_WEB_RECEIPT) writeFileSync(process.env.MEADOW_FOOD_WEB_RECEIPT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await f.model.dispose(); }
});
test('fresh food-web option preserves complete old native clocks, death, food, targets and future decisions', async () => {
  assert.ok(legacyBirths); const old = fixture(legacyBirths, false); let enabled;
  try {
    await old.model.update(opening); bounded(old);
    const a = old.model.agents.find(isOceanMeadowLifeAgent); assert.ok(a); a.energy = 0; old.model.step(.1); assert.ok(a.organicDeathRecorded);
    await old.model.checkpoint(); const disk = capture(old.store.records), active = capture(old.model._active);
    enabled = fixture(disk, true); await enabled.model.update(opening); bounded(enabled);
    assert.deepEqual(capture(enabled.model._active), active); assert.deepEqual(capture(enabled.store.records), disk);
    assert.ok([...enabled.model._active.values()].every(r => r.meadowLifeForagingVersion === 1));
    for (let i = 0; i < 3; i++) { old.model.step(.1); enabled.model.step(.1); }
    assert.deepEqual(capture(enabled.model._active), capture(old.model._active));
  } finally { await old.model.dispose(); if (enabled) await enabled.model.dispose(); }
});
