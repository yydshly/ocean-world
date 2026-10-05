import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KelpOceanChunks } from '../src/world/KelpOceanChunks.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { oceanRockFootingMesh } from '../src/world/oceanRockFooting.js';

test('kelp support height and normal agree with a downward ray onto actual floor triangles, including old 23 mm mismatch',()=>{
  const chunks=new KelpOceanChunks('42'),ray=new THREE.Raycaster();let checked=0;
  for(const [x,z]of [[34.9,-28.8],[24.5,18.8],[-203.1,-84.25],[148.37,99.21],[255.31,-64.73]]){
    chunks.update({x,z});chunks.setRenderOrigin({x:Math.floor(x/64)*64,z:Math.floor(z/64)*64});chunks.root.updateMatrixWorld(true);
    const floor=chunks._chunks.get(`${Math.floor(x/64)},${Math.floor(z/64)}`).group.children.find(mesh=>mesh.userData.landscapeKind==='floor');
    ray.set(new THREE.Vector3(x-chunks.renderOrigin.x,30,z-chunks.renderOrigin.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(floor)[0];assert.ok(hit);
    const actual=chunks.generator.floorSurface(x,z);assert.ok(Math.abs(actual.height-hit.point.y)<1e-9);
    assert.ok(Math.hypot(actual.normal.x-hit.face.normal.x,actual.normal.y-hit.face.normal.y,actual.normal.z-hit.face.normal.z)<1e-9);
    checked++;
  }
  assert.equal(checked,5);chunks.dispose();
});

test('support-v1 closed rock bases retain their original upper profiles and exact plant anchors',()=>{
  const generator=createKelpOceanGenerator('42', { supportVersion: 1 });let rocksChecked=0;
  for(const [cx,cz]of [[1,-1],[4,-1],[-5,4]]){
    const chunk=generator.chunk(cx,cz),rocks=chunk.elements.filter(element=>element.kind==='rock');
    const bases=oceanRockFootingMesh(rocks,chunk.origin,(x,z)=>generator.floorSurface(x,z).height);
    assert.equal(bases.positions.length,rocks.length*16*2*3);assert.equal(bases.indices.length,rocks.length*16*6);
    for(let index=0;index<rocks.length;index++){
      const rock=rocks[index],footing=bases.footings[index];
      assert.equal(rock.y,generator.sample(rock.x,rock.z).floorY-.08,'existing rock top is not translated');
      for(let sector=0;sector<16;sector++){
        assert.equal(bases.positions[(index*32+sector*2)*3+1],rock.y);
        assert.ok(footing.burialY<footing.rim[sector].floorY-.0149);
      }
      rocksChecked++;
    }
    for(const plant of chunk.elements.filter(element=>element.kind==='kelp'))assert.equal(plant.anchor.y,plant.y);
  }
  assert.ok(rocksChecked>50);
});

function memoryStore(){const records=new Map();return{records,async load(world,id){return structuredClone(records.get(`${world}|${id}`)??null);},
  async saveMany(world,entries){for(const[id,record]of entries)records.set(`${world}|${id}`,structuredClone(record));}};}
// This historical v0-to-v1 triangle correction retains its original contract;
// the current v1-to-v2 macro migration has separate complete-record cases.
async function legacyFixture(){
  const store=memoryStore(),source=new KelpOceanEcology('42',createKelpOceanGenerator('42', { supportVersion: 1 }),{store});
  await source.update({x:118,z:0});
  // Produce a genuine five-pool record from before the drift extension. A
  // modern litter inventory cannot retain its old receiver while that same
  // receiver is deliberately lowered to reproduce the historic floor error.
  for(const region of source._active.values()){
    for(const key of ['resourceTotals','transferOverride','groundUpdater'])delete region.sim.options[key];
    for(const key of ['driftCommunityVersion','driftPatches','driftLedger'])delete region[key];
  }
  source.step(1.3);
  const record=source._record(source._active.get('1,-1'));delete record.supportGeometryVersion;
  const dead=record.state.agents.find(agent=>agent.speciesId==='purple-urchin');dead.alive=false;dead.state='dead';dead.energy=0;
  for(const patch of [...record.state.rockPatches,...record.state.floorPatches])patch.position.y-=.02;
  for(const agent of record.state.agents.filter(agent=>agent.alive&&['purple-urchin','bat-star','gumboot-chiton'].includes(agent.speciesId)))agent.position.y-=.02;
  store.records.clear();store.records.set('kelp-ecology-v1:string:42|1,-1',structuredClone(record));
  return{store,record};
}
function withoutSupportCorrection(record){
  const result=structuredClone(record);delete result.supportGeometryVersion;
  for(const key of ['driftCommunityVersion','driftPatches','driftLedger'])delete result[key];
  for(const patch of [...result.state.rockPatches,...result.state.floorPatches])delete patch.position.y;
  for(const agent of result.state.agents.filter(agent=>agent.alive&&['purple-urchin','bat-star','gumboot-chiton'].includes(agent.speciesId))){delete agent.position.y;delete agent.supportNormal;}
  return result;
}
test('legacy floor correction commits before activation and preserves every other stored field, including deaths and food',async()=>{
  const{store,record}=await legacyFixture(),model=new KelpOceanEcology('42',createKelpOceanGenerator('42', { supportVersion: 1 }),{store});
  assert.equal(await model.update({x:118,z:0}),true);
  const region=model._active.get('1,-1'),corrected=model._record(region);
  assert.equal(corrected.supportGeometryVersion,1);assert.deepEqual(withoutSupportCorrection(corrected),withoutSupportCorrection(record));
  assert.equal(corrected.driftCommunityVersion,1);
  assert.ok(corrected.driftPatches.every(patch=>patch.stock===0));
  assert.deepEqual(corrected.driftLedger,{transferredIn:0,ingested:0,returnedToDetritus:0});
  for(const agent of region.sim.agents.filter(agent=>agent.alive&&['purple-urchin','bat-star','gumboot-chiton'].includes(agent.speciesId)))
    assert.equal(agent.position.y,model.generator.heightAt(agent.position.x,agent.position.z)+.003);
  assert.deepEqual(store.records.get('kelp-ecology-v1:string:42|1,-1'),corrected);
  const paused=model._record(region);model.step(0);assert.deepEqual(model._record(region),paused);
  const reopened=new KelpOceanEcology('42',createKelpOceanGenerator('42', { supportVersion: 1 }),{store});await reopened.update({x:118,z:0});
  assert.deepEqual(reopened._record(reopened._active.get('1,-1')),corrected,'migration is applied once');
});
test('a rejected geometric migration leaves the old record intact and never publishes unsupported old coordinates',async()=>{
  const{store,record}=await legacyFixture();store.saveMany=async(world,entries)=>{
    if(entries.some(([id])=>id==='1,-1'))throw new Error('support save denied');
    for(const[id,state]of entries)store.records.set(`${world}|${id}`,structuredClone(state));
  };
  const model=new KelpOceanEcology('42',createKelpOceanGenerator('42', { supportVersion: 1 }),{store});
  assert.equal(await model.update({x:118,z:0}),false);
  assert.equal(model._active.has('1,-1'),false);assert.deepEqual(store.records.get('kelp-ecology-v1:string:42|1,-1'),record);
  assert.match(model.snapshot().metrics.storageError,/support save denied/);
});
