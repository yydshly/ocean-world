import test from 'node:test';
import assert from 'node:assert/strict';
import {createShallowSample} from '../src/shallowSample.js';
import {createShallowSchooling,prepareShallowSchooling,updateShallowSchooling,sampleShallowSchooling,
  resetShallowSchooling,shallowSchoolingDiagnostics,SHALLOW_SCHOOLING_PHASES} from '../src/shallowSchooling.js';

const model=createShallowSample(55,{livingCommunities:true});
const identities=model.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
const records=JSON.stringify(model.agents);
const shoal=createShallowSchooling(model);
await prepareShallowSchooling(shoal,{yieldTask:()=>Promise.resolve()});
const poses=system=>system.agents.map(a=>sampleShallowSchooling(system,a));
const at=time=>{updateShallowSchooling(shoal,time);return shallowSchoolingDiagnostics(shoal);};

test('the finite shoal reuses 38 existing fish without changing population, assets or other records',()=>{
  assert.equal(shoal.count,38);
  assert.deepEqual(model.agents.map(a=>[a.id,a.speciesId,a.sizeM]),identities);
  assert.equal(JSON.stringify(model.agents),records,'simulation state is separate until renderer integration');
  assert.equal(sampleShallowSchooling(shoal,model.agents.find(a=>a.speciesId!=='blue-and-gold-fusilier')),null);
  assert.equal(shoal.obstacles[0].id,'sample-rock-0');
  assert.ok(model.rocks.some(r=>r.id===shoal.obstacles[0].id),'avoidance crown exists in the scene');
  assert.deepEqual(SHALLOW_SCHOOLING_PHASES.map(p=>[p.start,p.end]),[[0,8],[8,28],[28,36],[36,46],[46,60]]);
});

test('the existing reef produces two spatial branches followed by an actual common group before disturbance',()=>{
  const split=at(24);
  assert.ok(split.split.left>=12&&split.split.right>=12,JSON.stringify(split.split));
  const obstacle=shoal.obstacles[0],left=poses(shoal).filter(p=>p.position.z<obstacle.z),right=poses(shoal).filter(p=>p.position.z>obstacle.z);
  const average=rows=>rows.reduce((n,p)=>n+p.position.z,0)/rows.length;
  assert.ok(average(right)-average(left)>5,'branches occupy opposite sides of the physical crown');
  const merged=at(35.9);
  assert.equal(merged.alarmCount,0);
  assert.ok(merged.spreadM<1.05&&merged.spreadM<split.spreadM*.4,'the group reunited before the event');
  assert.ok(merged.center.x>obstacle.x+obstacle.radius,'the reunited group passed the crown');
});

test('a local disturbance propagates through neighbours, spreads the group and then settles',()=>{
  const quiet=at(35.9),first=at(36.02),wave=at(36.2),escape=at(38),restored=at(60);
  assert.equal(quiet.alarmCount,0);
  assert.ok(first.alarmCount>0&&first.alarmCount<shoal.count/3,'only local members first sense the disturbance');
  assert.ok(wave.alarmCount>first.alarmCount,'the signal spreads from one step to later neighbouring members');
  assert.ok(escape.spreadM>quiet.spreadM*1.5,'the animal group visibly spreads rather than only changing its label');
  assert.ok(escape.alignment<.3,'members turn in different directions during escape');
  assert.equal(restored.alarmCount,0);
  assert.ok(restored.spreadM<quiet.spreadM&&restored.alignment>.95,'spacing and heading coherence recover');
});

test('whole sampled fish footprints clear actual reef and coral surfaces throughout the demonstration',()=>{
  let minimum=Infinity,minimumBodyGap=Infinity;
  for(let t=0;t<=60;t+=.2){
    updateShallowSchooling(shoal,t+.013);
    const current=poses(shoal);
    for(const [i,a]of shoal.agents.entries()){
      const p=current[i].position,r=a.clearance?.radius??a.sizeM*.65;
      for(let n=0;n<8;n++){
        const ground=model.surface(p.x+r*Math.cos(n*Math.PI/4),p.z+r*Math.sin(n*Math.PI/4),true);
        minimum=Math.min(minimum,p.y-ground-(a.clearance?.bottom??a.sizeM*.15));
      }
      for(let j=i+1;j<current.length;j++){
        const other=current[j].position;
        minimumBodyGap=Math.min(minimumBodyGap,Math.hypot(p.x-other.x,p.y-other.y,p.z-other.z)-shoal.radii[i]-shoal.radii[j]);
      }
    }
  }
  assert.ok(minimum>.05,`sampled actual support gap ${minimum} m`);
  assert.ok(minimumBodyGap>=-.001,`lateral body spheres overlap by ${minimumBodyGap} m`);
  // Sampling is deliberately an acceptance check, not a proof for all frames,
  // every part of an articulated mesh, arbitrary seeds or other species.
});

test('frame cadence, backwards seeks and resets replay the same fixed-step trajectory without catch-up stalls',()=>{
  const expected=new Map();
  for(const t of [0,16.011,24.137,35.9,36.201,38.077,60,120.141,240]){updateShallowSchooling(shoal,t);expected.set(t,poses(shoal));}
  for(const t of [240,36.201,0,120.141,35.9,24.137,60,38.077,16.011]){
    updateShallowSchooling(shoal,t);assert.deepEqual(poses(shoal),expected.get(t));
    assert.ok(shoal.stats.steps<=6,'a seek performs no more than one 0.2-second interval');
  }
  resetShallowSchooling(shoal);assert.deepEqual(poses(shoal),expected.get(0));
  const phaseAt=38.077;for(let t=0;t<phaseAt;t+=1/144)updateShallowSchooling(shoal,t);
  updateShallowSchooling(shoal,phaseAt);assert.deepEqual(poses(shoal),expected.get(phaseAt));
  assert.equal(shoal.checkpoints.size,1201);
  assert.ok(shallowSchoolingDiagnostics(shoal).checkpointBytes<3_500_000,'finite CPU-only state cache is bounded');
});

function pairFixture(near,otherVelocity){
  const agents=[0,1].map(i=>({id:`pair-${i}`,speciesId:'blue-and-gold-fusilier',sizeM:.28,clearance:{radius:.18,bottom:.05}}));
  const flat={agents,rocks:[],surface:()=>-1};
  return createShallowSchooling(flat,{initialConditions:[
    {id:'pair-0',position:{x:-43,y:2.3,z:-9},velocity:{x:.3,y:0,z:0}},
    {id:'pair-1',position:{x:near?-43.8:-30,y:2.3,z:-9},velocity:otherVelocity}],
    guide:()=>({x:-40,y:2.3,z:-9})});
}
test('changing a nearby fish changes its neighbour, while a distant fish cannot steer it',async()=>{
  const opposite={x:-.3,y:0,z:.2},parallel={x:.3,y:0,z:0};
  const nearA=pairFixture(true,opposite),nearB=pairFixture(true,parallel),farA=pairFixture(false,opposite),farB=pairFixture(false,parallel);
  await Promise.all([nearA,nearB,farA,farB].map(s=>prepareShallowSchooling(s,{yieldTask:()=>Promise.resolve()})));
  for(const s of [nearA,nearB,farA,farB])updateShallowSchooling(s,.1);
  const a=sampleShallowSchooling(nearA,0),b=sampleShallowSchooling(nearB,0);
  assert.ok(Math.hypot(a.velocity.x-b.velocity.x,a.velocity.y-b.velocity.y,a.velocity.z-b.velocity.z)>.01,
    'the first fish responds to the real neighbour velocity, not just time and its own id');
  assert.deepEqual(sampleShallowSchooling(farA,0),sampleShallowSchooling(farB,0),'neighbourhood is spatially local');
});

test('smooth interpolation keeps heading and positions bounded across the entire four-minute route',()=>{
  let maxSpeed=0,maxTurn=0;
  for(let t=0;t<240;t+=.23){
    updateShallowSchooling(shoal,t);const before=poses(shoal);
    updateShallowSchooling(shoal,t+.01);const after=poses(shoal);
    for(let i=0;i<before.length;i++){
      const a=before[i],b=after[i];
      maxSpeed=Math.max(maxSpeed,Math.hypot(b.position.x-a.position.x,b.position.y-a.position.y,b.position.z-a.position.z)/.01);
      maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)))/.01);
      assert.ok(Number.isFinite(b.position.y)&&Math.abs(b.pitch)<=.18);
    }
  }
  assert.ok(maxSpeed<1.4,`no unbounded jump: ${maxSpeed} m/s`);
  assert.ok(maxTurn<2.81,`heading is limited rather than snapping: ${maxTurn} rad/s`);
});

test('preparation yields between bounded batches and seek CPU work stays finite',async()=>{
  let yields=0;const fixture=pairFixture(true,{x:.3,y:0,z:0});
  await prepareShallowSchooling(fixture,{yieldTask:async()=>{yields++;}});
  assert.equal(yields,60);
  updateShallowSchooling(fixture,240);assert.equal(fixture.stats.steps,0);
  updateShallowSchooling(fixture,3.173);assert.ok(fixture.stats.steps<=6);
  assert.equal(fixture.pending,false);
  assert.equal(fixture.field.checks,fixture.field.cols*fixture.field.rows,'terrain sampling happens once during setup');
  assert.equal(createShallowSchooling({agents:[],surface:()=>-1}),null);
});
