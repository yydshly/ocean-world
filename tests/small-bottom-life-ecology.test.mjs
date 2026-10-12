import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { seagrassMeadowRegionOrigin } from '../src/seagrassMeadowRegion.js';
import { isOceanMeadowLifeAgent, validateOceanMeadowLifeRecord, oceanMeadowForagingReady } from '../src/oceanMeadowLife.js';
import { OCEAN_SMALL_BOTTOM_IDS } from '../src/oceanSmallBottomSpecies.js';
import { isOceanBenthicLifeAgent, validateOceanBenthicLifeRecord } from '../src/oceanBenthicLife.js';
import { livingNetworkBalance, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';

const seed = livingShallowsSeed('56'), base = createLivingShallowsGenerator(seed);
const ids = seagrassMeadowRegionOrigin(228, 4).ownerIds;
const opening = { x: 228 * 64 + 24, z: 4 * 64 + 64 };
const clone = x => structuredClone(x);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const at = (path, sM) => path.find(p => p.sM >= sM) ?? path.at(-1);
// A failing comparison of complete macro records must not expand both worlds
// into Node's assertion formatter; keep the real comparison and compact error.
const equalRecords = (a,b,label) => assert.ok(isDeepStrictEqual(a,b),label);
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
    .call({ isLivingShallows: true, oceanWorldVariant: 'small-bottom-life', oceanChunks: { generator } }, Capture, seed);
  const model = new OceanEcology(seed, generator, { ...captured.options, meadowForaging: true, meadowFoodWeb: true, smallBottomLife: enabled, store });
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
    assert.ok(validateOceanBenthicLifeRecord(r, f.generator, supports(f)), r.id+': benthic full support'); assert.ok(validateLivingNetworkRecord(r)); assert.ok(Math.abs(livingNetworkBalance(r)) < 1e-8);
    assert.ok(validateOceanMeadowLifeRecord(r, f.generator, supports(f)), r.id + ': whole native record');
  }
}
let legacyBirths;
test('native seed56 complete community admits both new animals, uses bounded active windows and cold restores exact clocks and food',async()=>{
 let f=fixture(),restored;
 try{
  await f.model.update(opening);bounded(f);
  const rows=ids.map(id=>f.store.records.get(`${f.model._world}|${id}`));
  assert.ok(rows.every(r=>r.benthicLifeVersion===2&&r.meadowLifeForagingVersion===2));
  assert.ok(f.store.commits.some(batch=>batch.length===12&&batch.every(([id,r])=>ids.includes(id)&&r.benthicLifeVersion===2)));
  const all=rows.flatMap(r=>r.agents.concat(r.turtleAgents??[])),starts=new Map(all.map(a=>[a.id,clone(a)])),path=rows[0].livingRidgePlan.group.routePath;
  const moved=new Set(),fed=new Set();
  const report={scope:'native CPU actual births, motion, food and full-body validation; no GPU/image acceptance',seed:56,routeM:path.at(-1).sM,
   totalAnimals:all.length,localTypes:new Set(all.map(a=>a.speciesId)).size,classes:Object.fromEntries(OCEAN_SMALL_BOTTOM_IDS.map(id=>[id,{born:all.filter(a=>a.speciesId===id).length,moved:0,fed:0}])),windows:[]};
  assert.ok(OCEAN_SMALL_BOTTOM_IDS.every(id=>report.classes[id].born>0),'both classes really born in native macro community');
  if(process.env.SMALL_BOTTOM_RECEIPT)console.log('native births',JSON.stringify(report.classes),process.memoryUsage().rss);
  for(const [index,sM] of [0,140,280].entries()){
   await f.model.update(at(path,sM));f.model.setEnvironment({hour:index===2?2:10});
   for(let i=0;i<40;i++){f.model.step(.1);for(const a of f.model.agents.filter(a=>OCEAN_SMALL_BOTTOM_IDS.includes(a.speciesId))){
    if(!starts.has(a.id))continue;
    if(distance(a.position,starts.get(a.id).position)>.001)moved.add(a.id);if(a.lastFeedAt===a.timeSec)fed.add(a.id);
   }}
   bounded(f);await f.model.checkpoint();report.windows.push({sM,modelSeconds:4,hour:index===2?2:10,owners:[...f.model._active.keys()]});
   if(process.env.SMALL_BOTTOM_RECEIPT){writeFileSync(new URL('../output/validation/small-bottom-native-progress.json',import.meta.url),JSON.stringify({...report,phase:`window-${index}`},null,2));console.log('native window',index,process.memoryUsage().rss);}
   globalThis.gc?.();
  }
  for(const id of OCEAN_SMALL_BOTTOM_IDS){report.classes[id].moved=all.filter(a=>a.speciesId===id&&moved.has(a.id)).length;report.classes[id].fed=all.filter(a=>a.speciesId===id&&fed.has(a.id)).length;}
  assert.ok(OCEAN_SMALL_BOTTOM_IDS.every(id=>report.classes[id].moved>0&&report.classes[id].fed>0),'both classes really move and feed in ordinary native windows');
  const disk=capture(f.store.records),active=capture(f.model._active),endPosition=clone(at(path,280));
  for(let i=0;i<3;i++)f.model.step(.1);const future=capture(f.model._active);
  await f.model.dispose();f=null;globalThis.gc?.();
  // Cold restore follows original disposal, as an actual reload does. Keep
  // immutable saved records and expected futures, not two simulation graphs.
  if(process.env.SMALL_BOTTOM_RECEIPT)console.log('native restoring');
  restored=fixture(disk);restored.model.setEnvironment({hour:2});await restored.model.update(endPosition);bounded(restored);
  if(process.env.SMALL_BOTTOM_RECEIPT)console.log('native restored',process.memoryUsage().rss);
  equalRecords(capture(restored.model._active),active,'complete cold active records');equalRecords(capture(restored.store.records),disk,'complete cold disk records');
  for(let i=0;i<3;i++)restored.model.step(.1);equalRecords(capture(restored.model._active),future,'complete cold three-step future');
  report.coldRestore='complete active/disk and three future steps exact';
  if(process.env.SMALL_BOTTOM_RECEIPT)writeFileSync(new URL('../output/validation/small-bottom-native.json',import.meta.url),JSON.stringify(report,null,2));
 }finally{if(f)await f.model.dispose();if(restored)await restored.model.dispose();}
});

test('latest small-bottom option restores actual old v1 native deaths and future without adding animals or food',async()=>{
 const old=fixture([],false);let enabled;
 try{
  await old.model.update(opening);bounded(old);
  const rows=ids.map(id=>old.store.records.get(`${old.model._world}|${id}`));assert.ok(rows.every(r=>r.benthicLifeVersion===1));
  assert.ok(!rows.some(r=>r.agents.some(a=>OCEAN_SMALL_BOTTOM_IDS.includes(a.speciesId))));
  const a=old.model.agents.find(isOceanBenthicLifeAgent);assert.ok(a);a.energy=0;old.model.step(.1);assert.ok(a.organicDeathRecorded);
  await old.model.checkpoint();legacyBirths=capture(old.store.records);const active=capture(old.model._active);
  enabled=fixture(legacyBirths,true);await enabled.model.update(opening);bounded(enabled);
  assert.deepEqual(capture(enabled.model._active),active);assert.deepEqual(capture(enabled.store.records),legacyBirths);
  assert.ok([...enabled.model._active.values()].every(r=>r.benthicLifeVersion===1));
  for(let i=0;i<3;i++){old.model.step(.1);enabled.model.step(.1);}assert.deepEqual(capture(enabled.model._active),capture(old.model._active));
 }finally{await old.model.dispose();if(enabled)await enabled.model.dispose();}
});
