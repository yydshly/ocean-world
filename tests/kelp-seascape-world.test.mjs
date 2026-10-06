import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';

// Execute shipped native entries with actual ecology, without a browser/WebGL.
const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
function method(name){
  const marker=source.includes(`  async ${name}(`)?`  async ${name}(`:`  ${name}(`;
  const start=source.indexOf(marker);assert.ok(start>=0,name);
  const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start+2));
  return source.slice(start,next?start+2+next.index:source.lastIndexOf('\n}'));
}
const World=new Function('THREE',`return class {${['oceanWorldPosition','enterKelpSeascape',
  'enterKelpForestBelt','travelKelpForestBelt'].map(method).join('\n')}}`)(THREE);
function fixture(){
  const generator=createKelpOceanGenerator('42',{forestBelt:true}),records=new Map(),commits=[];
  const store={available:true,async load(_world,id){return structuredClone(records.get(id)??null);},
    async saveMany(_world,rows){commits.push(structuredClone(rows));for(const[id,row]of rows)records.set(id,structuredClone(row));}};
  const ecology=new KelpOceanEcology('42',generator,{store,forestBelt:true,kelpSeascape:true,understory:true,visitors:true});
  const world=new World(),updates=[];
  Object.assign(world,{biomeId:'kelp',isKelp:true,disposed:false,oceanEcologyResetting:false,oceanExploring:true,
    sim:{seed:'42'},controlStartCount:0,keys:new Set(),surfaceY:generator.surfaceY,oceanRenderOrigin:{x:0,z:0},
    camera:new THREE.PerspectiveCamera(49,16/9),controls:{target:new THREE.Vector3(),update(){}},
    oceanEcology:ecology,oceanChunks:{generator,update(p){updates.push({...p});}},
    habitatY(x,z){return generator.heightForCamera(x,z);},
    restoreOceanObservation(view){this.camera.position.set(view.position.x,view.position.y,view.position.z);
      this.controls.target.set(view.target.x,view.target.y,view.target.z);return true;},
    select(){},onSelect(){},emitSnapshot(){}});
  return{world,ecology,generator,records,commits,updates,store};
}

test('ordinary whole-kelp entry waits for complete actual plans, births and safe native observation',async()=>{
  const f=fixture();assert.equal(await f.world.enterKelpSeascape(),true);
  const rows=[...f.records.values()].filter(row=>row.forestBeltVersion===2);
  assert.equal(rows.length,12);assert.ok(f.commits.some(batch=>batch.filter(([,row])=>row.forestBeltVersion===2).length===12));
  assert.equal(f.ecology._active.size,9);
  assert.ok(rows.every(row=>row.state.agents.some(agent=>agent.speciesId!=='giant-kelp')));
  const p=f.world.oceanWorldPosition();assert.ok(p.y>=f.generator.heightForCamera(p.x,p.z)+.25);
  assert.ok(p.y<=f.generator.surfaceY-.5);assert.equal(f.updates.length,1);
  const before=structuredClone([...f.records]);assert.equal(await f.world.enterKelpSeascape(),true);
  assert.deepEqual([...f.records],before,'reentry retains births, deaths, clock and food');
  const start=f.world.oceanWorldPosition(),next=f.generator.kelpSeascapeRouteStops.find(row=>row.id==='kelp-scene-opening');
  assert.equal(f.world.travelKelpForestBelt(next.id),true);assert.deepEqual(f.world.oceanWorldPosition(),start);
  assert.deepEqual(f.world.oceanTravel,{x:next.x,z:next.z},'ordinary route requests real travel, not an observation jump');
});

test('an already visited owner declines replacement and cannot report new whole-scene success',async()=>{
  const f=fixture(),stop=f.generator.kelpSeascapeRouteStops[0];
  const old=new KelpOceanEcology('42',createKelpOceanGenerator('42',{forestBelt:true}),
    {store:f.store,forestBelt:true,understory:true,visitors:true});
  await old.update(stop);await old.checkpoint();const historical=structuredClone([...f.records]);
  assert.equal(await f.world.enterKelpSeascape(),false);
  for(const[id,row]of historical)assert.deepEqual(f.records.get(id),row);
  assert.ok(![...f.records.values()].some(row=>row.forestBeltVersion===2));
});

test('late complete-scene preparation respects movement, seed, disposal and newer same-point entry ownership',async()=>{
  for(const takeover of[w=>{w.camera.position.x+=2;},w=>{w.controlStartCount++;},w=>{w.sim.seed='other';},
    w=>{w.disposed=true;},w=>{w.keys.add('KeyW');},w=>{w.directorMotion={};},
    w=>{w.enterKelpForestBelt('kelp-scene-forest');},w=>{w.travelKelpForestBelt('kelp-scene-forest');}]){
    const f=fixture();let finish;f.world.oceanEcology={update(){return new Promise(resolve=>{finish=resolve;});}};
    const pending=f.world.enterKelpSeascape();takeover(f.world);
    const p=f.world.oceanWorldPosition(),target=f.world.controls.target.clone();finish(true);
    assert.equal(await pending,false);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(f.world.controls.target,target);
  }
});

test('unreadable or unavailable complete plans fail entry without inventing scenery',async()=>{
  const f=fixture();f.world.oceanEcology={async update(){return false;}};
  assert.equal(await f.world.enterKelpSeascape(),false);assert.equal(f.records.size,0);assert.equal(f.updates.length,0);
});

test('director opening and four moving actions use the exact native whole-scene routes while old entries remain',async()=>{
  const f=fixture(),opening=DIRECTOR_STEPS.find(row=>row.id==='kelp-opening');
  assert.equal(directorStepAction(opening).entryStopId,'kelp-scene-forest');
  assert.equal(navigateDemoEntry(directorStepAction(opening),f.world),true);
  assert.equal(await f.ecology.update(f.world.oceanWorldPosition()),true);
  assert.equal(f.generator.forestBeltPlan(...f.world.oceanWorldPosition().toArray().filter((_,i)=>i!==1).map(v=>Math.floor(v/64))).version,2);
  for(const stop of f.generator.kelpSeascapeRouteStops){
    const chapter=DIRECTOR_STEPS.find(row=>row.action.stopId===stop.id);assert.ok(chapter);
    assert.equal(chapter.motion.kind,'walk');assert.equal(chapter.durationMs,12000);
    assert.equal(navigateDemoEntry(chapter.action,f.world),true);
    assert.ok(Math.hypot(f.world.oceanWorldPosition().x-stop.x,f.world.oceanWorldPosition().z-stop.z)<20);
  }
  for(const stop of f.generator.forestRouteStops)assert.ok(DIRECTOR_STEPS.some(row=>row.action.stopId===stop.id));
});

test('normal UI exposes the whole package, traversal controls and production ecology option',()=>{
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
  assert.match(app,/onClick=\{enterKelpScene\}>巨藻整景/);
  assert.match(app,/aria-label="巨藻整景探索路线"/);
  assert.match(app,/ocean\.kelpSeascapeRouteStops\.map/);
  assert.match(source,/visitors:true,understory:true,forestBelt:true,kelpSeascape:true/);
  assert.match(source,/this\._kelpSceneEntryToken=\(this\._kelpSceneEntryToken\?\?0\)\+1;this\.onDirectorManualTakeover/);
});
