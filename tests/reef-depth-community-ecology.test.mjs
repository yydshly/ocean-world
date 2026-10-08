import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OceanEcology, REEF_VALLEY_PREFETCH_OWNER_LIMIT } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { reefValleyRegionOrigin } from '../src/reefValleyRegion.js';
import { livingNetworkBalance, recordLivingDeath, validateLivingNetworkRecord } from '../src/livingEcologyNetwork.js';
import { isReefResidentAgent, reefResidentsMarked, validateReefResidentsRecord, reefResidentPositionValid, REEF_SLOPE_COMMUNITY_IDS } from '../src/oceanReefResidents.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';

const seed = livingShallowsSeed('55'), base = createLivingShallowsGenerator(seed);
const origin = reefValleyRegionOrigin(204, 4), ids = origin.ownerIds;
const opening = { x: 204 * 64 + 24, z: 4 * 64 + 64 };
const residentSpeciesIds = REEF_SLOPE_COMMUNITY_IDS;
const clone = value => structuredClone(value);
const capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class Store {
  available = true; records = new Map(); commits = []; beforeMany = null; refusal = false;
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async save(world, id, row) { return this.saveMany(world, [[id, row]]); }
  async saveMany(world, entries) {
    const rows = clone(entries);
    if (this.beforeMany) await this.beforeMany(rows);
    if (this.refusal) throw new Error('reef residents atomic save failed');
    for (const [id, row] of rows) this.records.set(`${world}|${id}`, row);
    this.commits.push(rows);
  }
}
function fixture(store = new Store(), reefDepthCommunity = true, worldVariant = null) {
  const generator = createLivingRidgeGenerator(base);
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture { constructor(seed,generator,options){this.options=options;} }
  const captured=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:worldVariant,oceanChunks:{generator}},Capture,seed);
  const model=new OceanEcology(seed,generator,{...captured.options,reefVisitors:true,reefHabitatLayers:true,reefSandCorridor:true,reefSlopeCommunity:true,reefDepthCommunity,store});
  return { model, generator, store };
}
const fromRecords = records => { const store = new Store(); store.records = new Map(clone(records)); return store; };
const agentsOf = rows => [...rows].flatMap(r => r.agents.concat(r.turtleAgents ?? []));
const targetRows = f => ids.map(id => f.store.records.get(`${f.model._world}|${id}`));
function supports(f) {
  return { surface: (x, z, crown) => f.model._surface(x, z, crown, true, true, true, true, true, false),
    bed: (x, z) => f.model._bed(x, z), capacity: 20 };
}
function bounded(f) {
  assert.equal(f.model._active.size, 9);
  assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.model._supportCells.size <= 25);
  assert.ok(f.model._reefValleyAdmission.privateOwnerCount <= REEF_VALLEY_PREFETCH_OWNER_LIMIT);
  for (const row of f.model._active.values()) {
    assert.ok(row.agents.length + (row.turtleAgents?.length ?? 0) <= 20, `${row.id}: includes dead records and turtles`);
    assert.ok(validateLivingNetworkRecord(row), `${row.id}: complete organic network`);
    assert.ok(Math.abs(livingNetworkBalance(row)) < 1e-8, `${row.id}: organic stock balance`);
    const foodError = row.ledger.initial + row.ledger.input + (row.ledger.transferredIn ?? 0) + row.ledger.networkAdded -
      row.ledger.ingested - row.ledger.exported - (row.ledger.transferredOut ?? 0) - row.ledger.networkRemoved -
      row.resources.algae - row.resources.plankton - row.resources.detritus;
    assert.ok(Math.abs(foodError) < 1e-8, `${row.id}: existing food balance`);
    if (reefResidentsMarked(row)) {
      const q = supports(f);
      const valid = validateReefResidentsRecord(row, f.generator, q);
      if (!valid && process.env.REEF_DEPTH_FAILURE_RECEIPT) writeFileSync(process.env.REEF_DEPTH_FAILURE_RECEIPT, JSON.stringify({
        seed, row, activeRows: [...f.model._active.values()], disk: capture(f.store.records),
        physical: row.agents.filter(isReefResidentAgent).map(a => ({ id: a.id, speciesId: a.speciesId,
          current: reefResidentPositionValid(row, f.generator, a, a.position, q),
          home: reefResidentPositionValid(row, f.generator, a, a.home, { ...q, heading: row.reefResidents.birthPlacements.find(b => b.id === a.id).heading, pitch: 0 }),
          target: reefResidentPositionValid(row, f.generator, a, a.target, { ...q, heading: a.targetHeading, pitch: 0 }) }))
      }, null, 2));
      assert.ok(valid, `${row.id}: complete resident native record`);
      for (const a of row.agents.filter(a => a.alive && isReefResidentAgent(a)))
        assert.ok(reefResidentPositionValid(row, f.generator, a, a.position, q), `${a.id}: complete animated body clearance`);
    }
  }
  assert.ok(f.model._supportCells.size <= 25, 'physical validation preserves public support bound');
}
function at(path, sM) { return path.find(p => p.sM >= sM) ?? path.at(-1); }
function birthCoverage(rows,path) {
  const live=agentsOf(rows).filter(a=>a.alive),samples=[];
  for(let sM=0;sM<=path.at(-1).sM;sM+=10) {
    const p=at(path,sM),near=live.filter(a=>distance(a.position,p)<=14);
    samples.push({sM,actualPathSM:p.sM,nearbyIds:near.map(a=>a.id),
      nearbySpeciesIds:[...new Set(near.map(a=>a.speciesId))],
      nearbyResidentIds:near.filter(isReefResidentAgent).map(a=>a.id)});
  }
  return {scope:'target-group saved birth positions against fixed path; CPU proximity only',samples,
    emptyStationSM:samples.filter(r=>r.nearbyIds.length===0).map(r=>r.sM),
    residentEmptyStationSM:samples.filter(r=>r.nearbyResidentIds.length===0).map(r=>r.sM)};
}
function coverage(f, path, windowIndex) {
  const activeOwners = new Set(f.model._active.keys());
  const live = agentsOf(f.model._active.values()).filter(a => a.alive && ids.includes(a.regionId));
  const samples = [];
  for (let sM = 0; sM <= path.at(-1).sM; sM += 10) {
    const p = at(path, sM), owner = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (!activeOwners.has(owner)) continue;
    const near = live.filter(a => distance(a.position, p) <= 14);
    samples.push({ sM, actualPathSM: p.sM, windowIndex, owner,
      nearbyTargetIds: near.map(a => a.id), nearbySpeciesIds: [...new Set(near.map(a => a.speciesId))],
      nearbyHabitatResidentIds: near.filter(a => residentSpeciesIds.includes(a.speciesId)).map(a => a.id),
      nearestHabitatResidentDistanceM: live.some(a => residentSpeciesIds.includes(a.speciesId)) ?
        Math.min(...live.filter(a => residentSpeciesIds.includes(a.speciesId)).map(a => distance(a.position, p))) : null });
  }
  return samples;
}


let frozenV12, frozenV11;
async function initial(diverse) {
  if (diverse ? frozenV12 : frozenV11) return clone(diverse ? frozenV12 : frozenV11);
  const f=fixture(new Store(),diverse);
  try { await f.model.update(opening);bounded(f);const result=capture(f.store.records);
    if(diverse) frozenV12=result;else frozenV11=result;return clone(result);
  } finally { await f.model.dispose(); }
}
test('actual fresh55 depth-separated habitats distribute40 types within real geometry, food, movement and exact cold restoration',async t=>{
  const f=fixture();t.after(()=>f.model.dispose());const started=performance.now();
  await f.model.update(opening);bounded(f);frozenV12=capture(f.store.records);
  const rows=targetRows(f),group=rows[0]?.livingRidgePlan?.group;
  assert.equal(rows[0]?.livingRidgePlan?.version,8);
  assert.ok(f.store.commits.some(batch=>batch.length===12&&batch.every(([id,r])=>ids.includes(id)&&r.reefResidentsVersion===12)));
  for(const r of rows){assert.equal(r.reefResidentsVersion,12);assert.equal(r.reefResidents.recipe,'reef-residents-v12');
    assert.ok(r.agents.filter(isReefResidentAgent).length<=10);assert.ok(r.agents.length+(r.turtleAgents?.length??0)<=20);}
  f.generator.withReefValleyPlans(rows.map(r=>r.livingRidgePlan),()=>{
    for(const r of rows)assert.ok(validateReefResidentsRecord(r,f.generator,supports(f)),r.id);
  });f.model._supportCells.clear();
  const actual=agentsOf(rows),added=actual.filter(a=>residentSpeciesIds.includes(a.speciesId)),path=group.routePath;
  const distribution=residentSpeciesIds.map(speciesId=>{
    const list=added.filter(a=>a.speciesId===speciesId);
    const distances=list.length?path.map(p=>({sM:p.sM,distanceM:Math.min(...list.map(a=>distance(a.position,p)))})):[];
    return {speciesId,individuals:list.length,ownerIds:[...new Set(list.map(a=>a.regionId))],
      foodPools:[...new Set(list.map(a=>a.reefResidentFoodPool))],nearestStartM:distances[0]?.distanceM??null,
      earliestWithin14M:distances.find(p=>p.distanceM<=14)??null,closest:distances.toSorted((a,b)=>a.distanceM-b.distanceM)[0]??null};
  });
  assert.ok(added.some(a=>a.reefResidentMode==='reef-water'),'actual water-layer residents');
  assert.ok(added.some(a=>a.reefResidentSiteId.startsWith('sand-layer:')),'actual new layer locations admitted without bypassing body gates');
  assert.ok(added.some(a=>a.reefResidentMode==='reef-foot'),'actual bottom-supported residents');
  assert.ok(rows.every(r=>r.reefResidents.candidateOrder.length===40),'same40 share one depth-ranked queue');
  assert.ok(rows.every(r=>r.reefResidents.habitatEvidence.version===4 && r.reefResidents.habitatEvidence.depthBandCandidates));
  console.log('actual reef sand corridor55 birth',JSON.stringify({targetRecords:actual.length,distribution}));
  const baseline=new Map(await initial(false)),freshRosterChanges=[];
  for(const r of rows){const old=baseline.get(`${f.model._world}|${r.id}`);
    assert.equal(old.reefResidentsVersion,11);
    assert.deepEqual(r.livingRidgePlan,old.livingRidgePlan);
    assert.deepEqual(r.agents.filter(a=>!isReefResidentAgent(a)),old.agents.filter(a=>!isReefResidentAgent(a)),'all original nonresident births exact');
    const selected=r.agents.filter(isReefResidentAgent),before=old.agents.filter(isReefResidentAgent);
    freshRosterChanges.push({ownerId:r.id,habitatEvidence:clone(r.reefResidents.habitatEvidence),selectedIds:selected.map(a=>a.id),
      selectedSpeciesIds:selected.map(a=>a.speciesId),baselineIds:before.map(a=>a.id),baselineSpeciesIds:before.map(a=>a.speciesId)});
    assert.deepEqual(r.turtleAgents,old.turtleAgents);assert.deepEqual(r.resources,old.resources,'no fabricated food');}
  const moved=new Set(),fed=new Set(),perSpecies={},windows=[],stations=[];
  for(const [index,sM]of[0,150,350].entries()){
    await f.model.update(at(path,sM));bounded(f);f.model.setEnvironment({hour:index===2?0:10});
    const before=new Map(f.model.agents.map(a=>[a.id,clone(a)]));f.model.step(3);bounded(f);
    for(const a of f.model.agents.filter(a=>ids.includes(a.regionId)&&residentSpeciesIds.includes(a.speciesId))){
      const old=before.get(a.id);if(!old)continue;
      if(distance(a.position,old.position)>.000001)moved.add(a.id);
      if(Number.isFinite(a.lastFeedAt)&&a.lastFeedAt!==old.lastFeedAt){fed.add(a.id);
        assert.equal(a.lastResidentIntake.pool,a.reefResidentFoodPool);assert.ok(a.lastResidentIntake.removedUnits>0);}
      (perSpecies[a.speciesId]??={ids:new Set(),moved:new Set(),fed:new Set()}).ids.add(a.id);
      if(moved.has(a.id))perSpecies[a.speciesId].moved.add(a.id);if(fed.has(a.id))perSpecies[a.speciesId].fed.add(a.id);
    }
    for(const r of f.model._active.values())assert.ok(validateReefResidentsRecord(r,f.generator,supports(f)),`${r.id}: after tick`);
    stations.push(...coverage(f,path,index));await f.model.checkpoint();
    windows.push({sM,hour:index===2?0:10,activeOwnerIds:[...f.model._active.keys()],modelSec:3,supports:f.generator.registryStats().size,
      privatePrefetch:f.model._reefValleyAdmission.privateOwnerCount});
  }
  assert.ok(moved.size>0);assert.ok(fed.size>0);
  await f.model.checkpoint();const active=capture(f.model._active),disk=capture(f.store.records),cold=fixture(fromRecords(disk));
  t.after(()=>cold.model.dispose());await cold.model.update(at(path,350));bounded(cold);
  assert.ok(isDeepStrictEqual(capture(cold.model._active),active),'entire cold active state exact');
  assert.ok(isDeepStrictEqual(capture(cold.store.records),disk),'cold restore no supplement or repair writes');
  const report={seed,groupId:group.id,targetRecords:actual.length,actualSpeciesIds:[...new Set(actual.map(a=>a.speciesId))],
    slopeSpeciesIds: ['bigscale-soldierfish','lunartail-bigeye','banded-lizardfish','thousand-spot-sandperch'],
    scope:'one native fresh55 depth-community twelve-owner group and three ordinary nine-owner windows; CPU distances, no GPU acceptance',
    habitatResidentRecords:added.length,distribution,actualRouteM:group.pathMetrics.lengthM,
    birthLayerPlacements:rows.flatMap(r=>r.agents.filter(isReefResidentAgent).map(a=>({id:a.id,speciesId:a.speciesId,siteId:a.reefResidentSiteId,position:clone(a.position),sizeM:a.sizeM,foodPool:a.reefResidentFoodPool}))),
    absentResidentSpeciesIds:distribution.filter(r=>r.individuals===0).map(r=>r.speciesId),
    movedHabitatResidentIds:[...moved],fedHabitatResidentIds:[...fed],perSpecies:Object.fromEntries(Object.entries(perSpecies).map(([id,r])=>[id,{individuals:r.ids.size,moved:r.moved.size,fed:r.fed.size}])),
    windows,stations,birthRouteCoverage:{current:birthCoverage(rows,path),baseline:birthCoverage(ids.map(id=>baseline.get(`${f.model._world}|${id}`)),path)},
    actualModelSeconds:9,oldTerrainAndOriginalNonresidentBirthsExact:true,freshRosterChanges,coldActiveAndDiskExact:true,
    sourceHashes:Object.fromEntries(['src/oceanEcology.js','src/oceanReefResidents.js','src/reefValleyRegion.js'].map(p=>[p,createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex')])),
    wallSec:(performance.now()-started)/1000};
  if(process.env.REEF_DEPTH_RECEIPT)await writeFile(process.env.REEF_DEPTH_RECEIPT,JSON.stringify(report,null,2));
});
test('old v11 residents and deaths retain every record, resource, clock and future decision with v12 option enabled',async t=>{
  const f=fixture(fromRecords(await initial(false)),false);t.after(()=>f.model.dispose());await f.model.update(opening);f.model.step(.6);
  const row=[...f.model._active.values()].find(r=>ids.includes(r.id)&&r.agents.some(isReefResidentAgent)),a=row.agents.find(isReefResidentAgent);
  a.alive=false;a.energy=0;a.velocity={x:0,y:0,z:0};a.state='dead';a.stateSince=a.timeSec;
  recordLivingDeath(row,a);row.counters.deaths++;row.reefResidents.counters.deaths++;row.persistedNote={retained:true};
  await f.model.checkpoint();const saved=capture(f.store.records),on=fixture(fromRecords(saved),true),off=fixture(fromRecords(saved),false);
  t.after(()=>on.model.dispose());t.after(()=>off.model.dispose());
  await on.model.update(opening);await off.model.update(opening);
  assert.ok(isDeepStrictEqual(capture(on.model._active),capture(off.model._active)));
  assert.ok(isDeepStrictEqual(capture(on.store.records),saved));
  assert.ok(targetRows(on).every(r=>r.reefResidentsVersion===11));
  on.model.step(.6);off.model.step(.6);bounded(on);bounded(off);
  assert.ok(isDeepStrictEqual(capture(on.model._active),capture(off.model._active)),'future v11 decisions and inventory unchanged');
});
test('all twelve diverse owners stay private until atomic commit and failed saves expose none',async t=>{
  const gate=defer(),release=defer(),store=new Store(),f=fixture(store);let intercepted=false;
  t.after(()=>{release.resolve();return f.model.dispose();});
  store.beforeMany=async batch=>{if(!intercepted&&batch.length===12&&batch.every(([id,r])=>ids.includes(id)&&r.reefResidentsVersion===12)){
    intercepted=true;gate.resolve(batch);await release.promise;}};
  const updating=f.model.update(opening);await Promise.race([gate.promise,updating.then(()=>{throw Error('No whole v12 group commit');})]);
  assert.equal(f.model._active.size,0);assert.equal(f.generator.registryStats().size,0);
  assert.equal(agentsOf(f.model._active.values()).filter(a=>residentSpeciesIds.includes(a.speciesId)).length,0);
  release.resolve();await updating;bounded(f);
  const failed=new Store();failed.refusal=true;const no=fixture(failed);t.after(()=>no.model.dispose());
  await no.model.update(opening);assert.equal(no.model._active.size,0);assert.equal(no.generator.registryStats().size,0);
});
test('mixed recipe epochs, forged habitat evidence or order and malformed food or support records reject historical regeneration',async t=>{
  const original=await initial(true);
  const mutations=[rows=>{rows[0].reefResidentsVersion=6;},rows=>{rows[0].reefResidents.habitatEvidence.forged=true;},rows=>{rows[0].reefResidents.candidateOrder.reverse();},
    rows=>{const r=rows.find(r=>r.agents.some(a=>residentSpeciesIds.includes(a.speciesId)));r.agents.find(a=>residentSpeciesIds.includes(a.speciesId)).reefResidentFoodPool='missing.invalid-stock';},
    rows=>{const r=rows.find(r=>r.agents.some(a=>residentSpeciesIds.includes(a.speciesId)));r.agents.find(a=>residentSpeciesIds.includes(a.speciesId)).position.y-=4;}];
  for(const mutate of mutations){const store=fromRecords(original),rows=ids.map(id=>[...store.records.entries()].find(([key])=>key.endsWith(`|${id}`))[1]);mutate(rows);
    const expected=capture(store.records),f=fixture(store);t.after(()=>f.model.dispose());
    await assert.rejects(f.model.update(opening),/Invalid|Incomplete/);
    assert.equal(f.model._active.size,0);assert.ok(isDeepStrictEqual(capture(store.records),expected));}
});

test('explicit same-seed preview has complete depth-separated births and cold history without touching the original saved world',async t=>{
  const original=await initial(false),store=fromRecords(original),variant=readOceanWorldVariant('?demo=reef-valley-region&seed=55&world=depth-community'),f=fixture(store,true,variant);
  t.after(()=>f.model.dispose());await f.model.update(opening);bounded(f);
  assert.equal(f.model.worldVariant,'depth-community');assert.ok(f.model._world.startsWith('ecology-v1-copy:depth-community:'));
  for(const[key,row]of original)assert.deepEqual(store.records.get(key),row,'every original saved record retained exactly');
  const rows=targetRows(f);assert.ok(rows.every(r=>r.reefResidentsVersion===12));
  const actual=agentsOf(rows),types=new Set(actual.map(a=>a.speciesId));
  assert.ok(actual.some(a=>a.reefResidentSiteId?.startsWith('sand-layer:') && a.reefResidentHostId===null));
  const normal=new Map(await initial(true));
  for(const r of rows){const standard=[...normal].find(([key])=>key.endsWith(`|${r.id}`))[1];assert.deepEqual(r,standard,'preview changes only persistence identity, not geometry RNG or births');}
  f.model.step(.6);bounded(f);await f.model.checkpoint();const active=capture(f.model._active),disk=capture(store.records),cold=fixture(fromRecords(disk),true,variant);
  t.after(()=>cold.model.dispose());await cold.model.update(opening);bounded(cold);
  assert.deepEqual(capture(cold.model._active),active);assert.deepEqual(capture(cold.store.records),disk);
  for(const[key,row]of original)assert.deepEqual(store.records.get(key),row,'preview clock and writes leave the original world unchanged');
});
