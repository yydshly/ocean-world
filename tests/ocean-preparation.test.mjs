import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanPreparation } from '../src/oceanPreparation.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { createLifeExpeditionPath, sampleLifeExpeditionView } from '../src/lifeExpedition.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';

test('preparation yields between synchronous units and stops an obsolete job before another unit', async()=>{
 let clock=0,valid=true,context=false,yields=0;const visited=[];
 const p=new OceanPreparation({now:()=>clock,budgetMs:8,yieldTask:async()=>{assert.equal(context,false);yields++;if(yields===2)valid=false;}});
 const result=await p.each([1,2,3,4],i=>{context=true;clock+=9;visited.push(i);context=false;},()=>valid);
 assert.equal(result,false);assert.deepEqual(visited,[1,2]);assert.equal(p.stats().yields,2);assert.equal(p.stats().maxUnitMs,9);
});
test('failed preparation and asynchronous units cannot publish a later unit',async()=>{
 const p=new OceanPreparation(),visited=[];
 assert.equal(await p.each([1,2,3],i=>{visited.push(i);return i!==2;}),false);assert.deepEqual(visited,[1,2]);
 await assert.rejects(p.each([1],()=>Promise.resolve(true)),/synchronously/);
 await assert.rejects(p.each([1,2],()=>{throw Error('physical refusal');}),/physical refusal/);
});

const base=createLivingShallowsGenerator(livingShallowsSeed('55'));
const plans=createReefValleyRegionPlans(base,204,4),group=plans[0].group;
test('prepared native context isolates its immutable snapshot, restores terrain on throw and rejects async/publication',()=>{
 const g=createLivingRidgeGenerator(base),input=structuredClone(plans),prepared=g.prepareReefValleyContext(input);
 const id=plans[0].id,p=group.routePath[20],before=g.floorSurface(p.x,p.z),registry=g.registryStats();
 const snapshot=prepared(()=>g.chunk(plans[0].cx,plans[0].cz).ridgePlan);assert.notEqual(snapshot,input[0]);assert.ok(Object.isFrozen(snapshot.elements[0].scale));
 input[0].elements[0].x+=100;assert.notEqual(snapshot.elements[0].x,input[0].elements[0].x);
 assert.equal(g.getRidgePlan(id),undefined);assert.deepEqual(g.floorSurface(p.x,p.z),before);
 assert.throws(()=>prepared(()=>{assert.equal(g.chunk(plans[0].cx,plans[0].cz).ridgePlan,snapshot);g.registerLegacyRidgeOwner('204,4');}),/publish/);
 assert.throws(()=>prepared(()=>{throw Error('stop');}),/stop/);
 assert.throws(()=>prepared(async()=>true),/synchronous/);
 assert.throws(()=>prepared(()=>Promise.resolve(true)),/asynchronous/);
 assert.equal(g.getRidgePlan(id),undefined);assert.deepEqual(g.registryStats(),registry);
 const duplicate=structuredClone(plans);duplicate[1]=duplicate[0];assert.throws(()=>g.prepareReefValleyContext(duplicate),/Invalid|Incomplete/);
});

test('native expedition incorporates two committed side corridors with exact shared endpoints and no geometry mutation',()=>{
 const before=JSON.stringify(group),itinerary=createLifeExpeditionPath(group),main=group.routePath;
 assert.equal(itinerary.branches,2);assert.deepEqual(itinerary.path[0],main[0]);assert.deepEqual(itinerary.path.at(-1),main.at(-1));
 assert.ok(itinerary.path.some(p=>!main.some(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)));
 for(let i=1;i<itinerary.path.length;i++)assert.ok(Math.hypot(...['x','y','z'].map(k=>itinerary.path[i][k]-itinerary.path[i-1][k]))<=8);
 assert.equal(JSON.stringify(group),before);
});
test('habitat overview changes scale continuously, retains entry/end pose and keeps the camera below water',()=>{
 const fake={...plans[0],group:{...group,origin:{x:0,z:0}}},heights=[];
 for(let x=25;x<=360;x+=1){const frame={position:{x,y:-8,z:64},target:{x:x+8,y:-8.65,z:64},elapsedSec:120};
  const before=JSON.stringify(frame),v=sampleLifeExpeditionView(frame,{plan:fake,bedY:-10,surfaceY:0,durationSec:240});
  assert.ok(v.position.y>=-9.25&&v.position.y<=-.6);assert.equal(v.position.x,x);assert.equal(JSON.stringify(frame),before);
  heights.push(v.overview.heightM);
 }
 assert.ok(Math.max(...heights)-Math.min(...heights)>1.4);
 assert.ok(heights.slice(1).every((h,i)=>Math.abs(h-heights[i])<.1));
 for(const elapsedSec of[0,240]){const frame={position:{x:30,y:-8,z:64},target:{x:38,y:-8.65,z:64},elapsedSec};
  const v=sampleLifeExpeditionView(frame,{plan:fake,bedY:-10,surfaceY:0,durationSec:240});assert.deepEqual(v.position,frame.position);assert.deepEqual(v.target,frame.target);}
});
test('expedition continues only in a loaded active owner while legacy routes still require nine owners',()=>{
 const p={x:32,y:-3,z:32},single={loadedOwnerIds:['0,0'],activeOwnerIds:['0,0']};
 assert.equal(coastalSeascapeWindowReady(p,{...single,radius:0}),true);assert.equal(coastalSeascapeWindowReady(p,single),false);
 assert.equal(coastalSeascapeWindowReady(p,{...single,activeOwnerIds:[],radius:0}),false);
 assert.equal(coastalSeascapeWindowReady(p,{...single,radius:4}),false);
});
