import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { DeepOceanEcology } from '../src/deepOceanEcology.js';
import { DEEP_WHOLE_SEASCAPE_OWNERS } from '../src/deepWholeSeascape.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';

// Execute the shipped native entry with actual persisted ecology; no browser/GPU.
const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
function method(name){
  const marker=source.includes(`  async ${name}(`)?`  async ${name}(`:`  ${name}(`;
  const start=source.indexOf(marker);assert.ok(start>=0,name);
  const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start+2));
  return source.slice(start,next?start+2+next.index:source.lastIndexOf('\n}'));
}
const World=new Function('THREE',`return class {${['oceanWorldPosition','enterDeepWholeSeascape',
  'enterDeepSeascape','travelDeepSeascape'].map(method).join('\n')}}`)(THREE);
function fixture(){
  const generator=createDeepOceanGenerator('42',{seascape:true}),records=new Map(),commits=[];
  const store={available:true,async load(_world,id){return structuredClone(records.get(id)??null);},
    async saveMany(_world,rows){commits.push(structuredClone(rows));for(const[id,row]of rows)records.set(id,structuredClone(row));}};
  const ecology=new DeepOceanEcology('42',generator,{store,seascape:true,wholeSeascape:true});
  const world=new World(),updates=[];
  Object.assign(world,{biomeId:'deep',isDeep:true,disposed:false,oceanEcologyResetting:false,oceanExploring:true,
    sim:{seed:'42'},controlStartCount:0,keys:new Set(),surfaceY:generator.surfaceY,oceanRenderOrigin:{x:0,z:0},
    camera:new THREE.PerspectiveCamera(49,16/9),controls:{target:new THREE.Vector3(),update(){}},
    oceanEcology:ecology,oceanChunks:{generator,update(p){updates.push({...p});}},
    habitatY(x,z){return generator.heightForCamera(x,z);},
    restoreOceanObservation(view){this.camera.position.set(view.position.x,view.position.y,view.position.z);
      this.controls.target.set(view.target.x,view.target.y,view.target.z);return true;},
    select(){},onSelect(){},emitSnapshot(){}});
  return{world,ecology,generator,records,commits,updates,store};
}

test('ordinary deep whole-scene entry awaits all actual plans, births and safe observation before success',async()=>{
  const f=fixture();assert.equal(await f.world.enterDeepWholeSeascape(),true);
  const rows=[...f.records.values()].filter(row=>row.seascapeVersion===2);
  assert.equal(rows.length,12);assert.ok(f.commits.some(batch=>batch.filter(([,row])=>row.seascapeVersion===2).length===12));
  assert.deepEqual(rows.map(row=>row.id).sort(),[...DEEP_WHOLE_SEASCAPE_OWNERS].sort());
  assert.equal(f.ecology._active.size,9);assert.ok(rows.some(row=>row.state.agents.length>0));
  const p=f.world.oceanWorldPosition();assert.ok(p.y>=f.generator.heightForCamera(p.x,p.z)+.25);
  assert.ok(p.y<=f.generator.surfaceY-.5);assert.equal(f.updates.length,1);
  const before=structuredClone([...f.records]);assert.equal(await f.world.enterDeepWholeSeascape(),true);
  assert.deepEqual([...f.records],before,'reentry retains births, deaths, clocks and inventories');
  const start=f.world.oceanWorldPosition(),next=f.generator.wholeSeascapeRouteStops.find(row=>row.id==='deep-scene-slope');
  assert.equal(f.world.travelDeepSeascape(next.id),true);assert.deepEqual(f.world.oceanWorldPosition(),start);
  assert.deepEqual(f.world.oceanTravel,{x:next.x,z:next.z},'ordinary travel follows actual coordinates');
});

test('an already visited deep owner declines replacement and cannot report a new whole scene',async()=>{
  const f=fixture(),stop=f.generator.wholeSeascapeRouteStops[0];
  const old=new DeepOceanEcology('42',createDeepOceanGenerator('42',{seascape:true}),{store:f.store,seascape:true});
  await old.update(stop);await old.checkpoint();const historical=structuredClone([...f.records]);
  assert.equal(await f.world.enterDeepWholeSeascape(),false);
  for(const[id,row]of historical)assert.deepEqual(f.records.get(id),row);
  assert.ok(![...f.records.values()].some(row=>row.seascapeVersion===2));
});

test('late deep scene preparation respects movement, manual control, seed, disposal and newer entries',async()=>{
  for(const takeover of[w=>{w.camera.position.x+=2;},w=>{w.controlStartCount++;},w=>{w.sim.seed='other';},
    w=>{w.disposed=true;},w=>{w.keys.add('KeyW');},w=>{w.directorMotion={};},w=>{w.directorEntry={active:true};},
    w=>{w.enterDeepSeascape('deep-scene-plain');},w=>{w.travelDeepSeascape('deep-scene-plain');}]){
    const f=fixture();let finish;f.world.oceanEcology={update(){return new Promise(resolve=>{finish=resolve;});}};
    const pending=f.world.enterDeepWholeSeascape();takeover(f.world);
    const p=f.world.oceanWorldPosition(),target=f.world.controls.target.clone();finish(true);
    assert.equal(await pending,false);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(f.world.controls.target,target);
  }
});

test('unreadable or absent committed deep plans cannot report successful scenery',async()=>{
  for(const loaded of[false,true]){
    const f=fixture();f.world.oceanEcology={async update(){return loaded;}};
    assert.equal(await f.world.enterDeepWholeSeascape(),false);assert.equal(f.records.size,0);assert.equal(f.updates.length,0);
  }
});

test('director deep opening and four moving chapters reach the native scene while old routes remain',async()=>{
  const f=fixture(),opening=DIRECTOR_STEPS.find(row=>row.id==='deep-opening');
  assert.equal(directorStepAction(opening).entryStopId,'deep-scene-plain');
  assert.equal(navigateDemoEntry(directorStepAction(opening),f.world),true);
  assert.equal(await f.ecology.update(f.world.oceanWorldPosition()),true);
  const p=f.world.oceanWorldPosition();assert.equal(f.generator.seascapePlan(Math.floor(p.x/64),Math.floor(p.z/64)).version,2);
  for(const stop of f.generator.wholeSeascapeRouteStops){
    const chapter=DIRECTOR_STEPS.find(row=>row.action.stopId===stop.id);assert.ok(chapter);
    assert.equal(chapter.motion.kind,'walk');assert.equal(chapter.durationMs,12000);
    assert.equal(navigateDemoEntry(chapter.action,f.world),true);
    assert.ok(Math.hypot(f.world.oceanWorldPosition().x-stop.x,f.world.oceanWorldPosition().z-stop.z)<20);
  }
  for(const stop of f.generator.seascapeRouteStops)assert.ok(DIRECTOR_STEPS.some(row=>row.action.stopId===stop.id));
});

test('ordinary UI exposes deep whole scene, travel routes and production ecology option',()=>{
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
  assert.match(app,/onClick=\{enterDeepScene\}>深海整景/);
  assert.match(app,/aria-label="深海整景探索路线"/);
  assert.match(app,/ocean\.wholeSeascapeRouteStops\.map/);
  assert.match(source,/seascape:true,wholeSeascape:true/);
  assert.match(source,/this\._deepSceneEntryToken=\(this\._deepSceneEntryToken\?\?0\)\+1/);
});
