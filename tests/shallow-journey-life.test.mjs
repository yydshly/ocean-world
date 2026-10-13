import test from 'node:test';
import assert from 'node:assert/strict';
import {createShallowSample} from '../src/shallowSample.js';
import {initializeJourneyLife,evaluateJourneyLife,journeyLifeSummary} from '../src/shallowJourneyLife.js';

const model=createShallowSample(55);
const population=model.agents.map(a=>({id:a.id,speciesId:a.speciesId,sizeM:a.sizeM,mode:a.mode}));
const turtles=JSON.stringify(model.agents.filter(a=>a.kind==='turtle'));
const original=JSON.stringify(model.agents);
test('the opt-in behaviour layer preserves every animal identity, metre size and turtle behaviour',()=>{
  assert.equal(initializeJourneyLife(model,{livingCommunities:false}),null);
  assert.equal(JSON.stringify(model.agents),original);
  const result=initializeJourneyLife(model);
  assert.equal(initializeJourneyLife(model),result);
  assert.deepEqual(model.agents.map(a=>({id:a.id,speciesId:a.speciesId,sizeM:a.sizeM,mode:a.mode})),population);
  assert.equal(model.agents.length,293);
  assert.equal(new Set(model.agents.map(a=>a.speciesId)).size,38);
  assert.equal(JSON.stringify(model.agents.filter(a=>a.kind==='turtle')),turtles);
  assert.deepEqual(result.kinds,{school:118,'grass-edge':18,'reef-hold':19,'sand-probe':9});
});

test('nine sand probers retain separated whole-body reservations on actual soft bed',()=>{
  const sites=model.journeyLife.footprints;assert.equal(sites.length,9);
  for(const [index,site]of sites.entries()){
    for(const other of sites.slice(index+1))assert.ok(Math.hypot(site.x-other.x,site.z-other.z)>=site.r+other.r);
    const a=model.agents.find(a=>a.id===site.id);
    for(let t=0;t<=240;t+=.5){
      const p=evaluateJourneyLife(a,t),bodyRadius=a.sizeM*.70;
      assert.ok(Math.hypot(p.x-site.x,p.z-site.z)+bodyRadius<=site.r+1e-9);
      for(let ring=0;ring<=1;ring++)for(let i=0;i<(ring?8:1);i++){
        const x=p.x+bodyRadius*ring*Math.cos(i*Math.PI/4),z=p.z+bodyRadius*ring*Math.sin(i*Math.PI/4);
        assert.ok(model.surface(x,z,true)-model.floor(x,z)<=.025,`${a.id} probed hard substrate at ${t}`);
      }
      assert.ok(p.pitch>=-.14&&p.pitch<=0);
      assert.ok(p.pitchClearance>=Math.abs(Math.sin(p.pitch))*a.sizeM*.5);
      assert.ok(p.probeStrength>=0&&p.probeStrength<=1);
      assert.equal('y' in p,false,'support height remains the shared physical query');
    }
  }
});

test('seek order never changes trajectories and group turns stay continuous at natural movement speeds',()=>{
  const agents=model.agents.filter(a=>a.journeyLife),before=JSON.stringify(agents);
  for(const a of agents){
    const forward=[0,20,40,88,120,164,210,240].map(t=>evaluateJourneyLife(a,t));
    const backward=[240,210,164,120,88,40,20,0].map(t=>evaluateJourneyLife(a,t)).reverse();
    assert.deepEqual(forward,backward);
    for(let t=0;t<240;t+=.25){
      const p=evaluateJourneyLife(a,t),next=evaluateJourneyLife(a,t+.01);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.lift));
      assert.ok(Math.hypot(next.x-p.x,next.z-p.z)/.01<.75,`${a.id}: discontinuity at ${t}`);
    }
  }
  assert.equal(JSON.stringify(agents),before,'evaluation is pure, including reverse seek');
});

test('each forager and reef resident has readable holds and transit within its reserved footprint',()=>{
  for(const a of model.agents.filter(a=>a.journeyLife&&a.journeyLife.kind!=='school')){
    const life=a.journeyLife,activities=new Set();let held=0,moving=0;
    for(let t=0;t<64;t+=.25){
      const p=evaluateJourneyLife(a,t);activities.add(p.activity);
      assert.ok(Math.abs(p.x-life.anchor.x)<=life.rx+1e-9);
      assert.ok(Math.abs(p.z-life.anchor.z)<=life.rz+1e-9);
      if(p.state==='swimming')moving++;else{held++;assert.ok(Number.isFinite(p.heading));}
    }
    assert.ok(held>=12&&moving>held,`${a.id}: no meaningful stop-and-travel sequence`);
    assert.equal(activities.size,2);
    if(life.kind==='reef-hold'){
      assert.equal(life.rx,a.reefPatrol.x);assert.equal(life.rz,a.reefPatrol.z);
      assert.deepEqual(life.anchor,a.home);
    }
  }
});

test('display summaries disclose authored participation without inventing ecosystem resource exchanges',()=>{
  const summary=journeyLifeSummary(model,142);
  assert.equal(summary.participants,164);
  assert.equal(Object.values(summary.activities).reduce((a,b)=>a+b,0),164);
  assert.ok(summary.activities['sand-probe']>0&&summary.activities['sand-transit']>0);
  assert.ok(summary.activities['grass-edge-hold']>0&&summary.activities['grass-edge-swim']>0);
  assert.equal(journeyLifeSummary({},142),null);
  const base={x:1,z:2,lift:3};assert.equal(evaluateJourneyLife({},142,base),base);
});
