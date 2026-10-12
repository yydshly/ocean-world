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
import { isReefResidentAgent, reefResidentsMarked, validateReefResidentsRecord, reefResidentPositionValid, REEF_GRAZERS_COMMUNITY_IDS } from '../src/oceanReefResidents.js';
import { readOceanWorldVariant } from '../src/oceanWorldVariant.js';

const seed = livingShallowsSeed('55'), base = createLivingShallowsGenerator(seed);
const origin = reefValleyRegionOrigin(204, 4), ids = origin.ownerIds;
const opening = { x: 204 * 64 + 24, z: 4 * 64 + 64 };
const residentSpeciesIds = REEF_GRAZERS_COMMUNITY_IDS;
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
function fixture(store = new Store(), reefGrazers = true, worldVariant = null) {
  const generator = createLivingRidgeGenerator(base);
  const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),end=source.indexOf(');',start)+1;
  class Capture { constructor(seed,generator,options){this.options=options;} }
  const captured=new Function('OceanEcology','seed',`return ${source.slice(start,end)};`).call({isLivingShallows:true,oceanWorldVariant:worldVariant,oceanChunks:{generator}},Capture,seed);
  const model=new OceanEcology(seed,generator,{...captured.options,reefForaging:false,reefSchooling:false,reefColorFish:false,reefGrazers,reefVisitors:true,reefHabitatLayers:true,reefSandCorridor:true,reefSlopeCommunity:true,reefDepthCommunity:true,reefFilterLife:true,reefSuspensionLife:true,reefMobileBenthos:true,store});
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
      if (!valid && process.env.REEF_MOBILE_BENTHOS_FAILURE_RECEIPT) writeFileSync(process.env.REEF_MOBILE_BENTHOS_FAILURE_RECEIPT, JSON.stringify({
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


const newIds=['reef-fireworm','long-spined-diadem-urchin'];
test('actual fresh55 recipe16 admits full new crawlers only in real habitat and preserves finite food, ordinary activity and exact cold recovery',async()=>{
 const f=fixture();try{
  await f.model.update(opening);bounded(f);const birthRows=targetRows(f),path=birthRows[0].livingRidgePlan.group.routePath;
  assert.ok(birthRows.every(r=>r.reefResidentsVersion===16));assert.ok(f.store.commits.some(b=>b.length===12&&b.every(([id,r])=>ids.includes(id)&&r.reefResidentsVersion===16)));
  const added=agentsOf(birthRows).filter(a=>newIds.includes(a.speciesId));const originals=new Map(added.map(a=>[a.id,clone(a)]));
  const report={scope:'actual same55 recipe16; ordinary nine-owner windows, no browser/GPU acceptance',routeM:birthRows[0].livingRidgePlan.group.pathMetrics.lengthM,
   totalAnimals:agentsOf(birthRows).length,residents:agentsOf(birthRows).filter(isReefResidentAgent).length,
   localTypes:new Set(agentsOf(birthRows).map(a=>a.speciesId)).size,residentTypes:new Set(agentsOf(birthRows).filter(isReefResidentAgent).map(a=>a.speciesId)).size,
   newSpecies:Object.fromEntries(newIds.map(id=>[id,{born:added.filter(a=>a.speciesId===id).length,moved:0,fed:0}])),windows:[]};
  const moved=new Set(),fed=new Set();
  for(const [window,sM]of[0,150,300].entries()){
   const p=at(path,sM);await f.model.update(p);f.model.setEnvironment({hour:window===0?10:20});
   for(let i=0;i<20;i++){f.model.step(.1);for(const a of f.model.agents.filter(a=>newIds.includes(a.speciesId))){if(originals.has(a.id)&&distance(a.position,originals.get(a.id).position)>1e-6)moved.add(a.id);if(a.lastResidentIntake?.removedUnits>0)fed.add(a.id);}}
   bounded(f);await f.model.checkpoint();report.windows.push({sM,hour:window===0?10:20,activeOwners:[...f.model._active.keys()],newAnimalIds:f.model.agents.filter(a=>newIds.includes(a.speciesId)).map(a=>a.id)});
  }
  for(const id of newIds){const a=added.filter(a=>a.speciesId===id);report.newSpecies[id].moved=a.filter(x=>moved.has(x.id)).length;report.newSpecies[id].fed=a.filter(x=>fed.has(x.id)).length;}
  assert.ok(added.length>0,'at least one true new representative naturally admitted; absence is not refilled');
  assert.ok(moved.size>0&&fed.size>0,'real low-light crawling and owner stock intake');
  const active=capture(f.model._active),disk=capture(f.store.records),cold=fixture(fromRecords(disk));
  try{await cold.model.update(at(path,300));bounded(cold);assert.deepEqual(capture(cold.model._active),active);assert.deepEqual(capture(cold.store.records),disk);}finally{await cold.model.dispose();}
  report.completeColdActiveAndDiskExact=true;report.modelSeconds=6;
  if(process.env.REEF_GRAZERS_RECEIPT)writeFileSync(process.env.REEF_GRAZERS_RECEIPT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await f.model.dispose();}
});
test('new recipe16 option leaves saved recipe15 complete records, clocks, deaths, food and future decisions untouched',async()=>{
 const old=fixture(new Store(),false);let enabled;
 try{await old.model.update(opening);bounded(old);const resident=old.model.agents.find(isReefResidentAgent);resident.energy=0;old.model.step(.1);await old.model.checkpoint();
  const disk=capture(old.store.records),active=capture(old.model._active);assert.ok(resident.organicDeathRecorded);
  enabled=fixture(fromRecords(disk),true);await enabled.model.update(opening);bounded(enabled);assert.deepEqual(capture(enabled.model._active),active);assert.deepEqual(capture(enabled.store.records),disk);
  assert.ok([...enabled.model._active.values()].filter(reefResidentsMarked).every(r=>r.reefResidentsVersion===15));
  for(let i=0;i<3;i++){old.model.step(.1);enabled.model.step(.1);}assert.deepEqual(capture(enabled.model._active),capture(old.model._active));
 }finally{await old.model.dispose();if(enabled)await enabled.model.dispose();}
});
