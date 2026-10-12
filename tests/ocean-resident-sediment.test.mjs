import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OceanAnimalSediment } from '../src/world/OceanAnimalSediment.js';

const ids=['leopard-sea-cucumber','shame-faced-crab','peacock-flounder','humble-sea-biscuit'];
const speeds=[.003,.005,.01,.0015];
const generator={profile:'living-shallows-v1',sample:()=>({substrate:'sand'}),floorSurface:()=>({height:-3})};
const clone=v=>structuredClone(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const make=t=>{const d=new OceanAnimalSediment(new THREE.Scene(),{seed:'resident-sand'});t.after(()=>d.dispose());return d;};
function animal(speciesId){return {id:`real:${speciesId}`,speciesId,alive:true,timeSec:0,position:{x:200,y:-2.996,z:200},lastFeedAt:null,
  regionId:'3,3',reefResidentIndividualVersion:15,reefResidentMode:'reef-foot',
  reefResidentFoodPool:['leopard-sea-cucumber','humble-sea-biscuit'].includes(speciesId)?'resources.detritus':'reefGuild.preyOrganicUnits'};}
function fed(a,time=.1){return {...a,timeSec:time,lastFeedAt:time,lastResidentIntake:{timeSec:time,ownerId:a.regionId,pool:a.reefResidentFoodPool,
  stockBefore:.2,stockAfter:.19995,removedUnits:.00005}};}
const frame=(agents,options={})=>({agents,generator,surfaceAt:()=>-3,dtSec:.1,currentVector:{x:0,z:0},cameraPosition:{x:200,y:-1,z:200},renderOrigin:{x:192,z:192},...options});

test('each of four supported resident source groups emits only after a real current intake; display leaves frozen animals and intake exact',t=>{
  for(const id of ids){const d=make(t),a=animal(id);d.update(frame([a],{dtSec:0}));assert.equal(d.stats.emittedParticles,0);
    const input=freeze(fed(a)),before=clone(input);d.update(frame([input]));assert.deepEqual(input,before);
    assert.equal(d.stats.feedTriggers,1);assert.ok(d.stats.activeParticles>0);
    assert.ok(d.particleSnapshot().every(p=>p.sourceId===a.id&&p.position.y>-3&&p.position.y<-2.98));
  }
});
test('forged markers or intake, rock, raised solid, hovering and fixed feeders cannot imitate a soft-bed event',t=>{
  const mutations=[a=>{a.reefResidentMode='reef-water';},a=>{a.reefResidentIndividualVersion=1;},a=>{a.reefResidentIndividualVersion=20;},
    a=>{a.reefResidentFoodPool='resources.plankton';},a=>{a.lastResidentIntake.ownerId='another-owner';},
    a=>{a.lastResidentIntake.removedUnits=.01;},a=>{a.lastResidentIntake.stockAfter=-1;},a=>{a.lastResidentIntake.pool='resources.plankton';},
    a=>{delete a.lastResidentIntake;},a=>{a.position.y=-2;},a=>{a.alive=false;},a=>{a.speciesId='gold-mouth-sea-squirt';},a=>{a.speciesId='banded-brittle-star';}];
  for(const mutate of mutations){const d=make(t),a=animal(ids[3]);d.update(frame([a]));const input=fed(a);mutate(input);d.update(frame([input]));assert.equal(d.stats.emittedParticles,0);}
  for(const options of[{generator:{...generator,sample:()=>({substrate:'rock'})}},{surfaceAt:()=>-2.9}]){
    const d=make(t),a=animal(ids[0]);d.update(frame([a],options));d.update(frame([fed(a)],options));assert.equal(d.stats.emittedParticles,0);}
});
test('real slow travel accumulates into movement feedback; wrong-speed jumps do not become locomotion or feeding events',t=>{
  for(const [i,id]of ids.entries()){
    const d=make(t),a=animal(id);d.update(frame([a]));
    for(let tick=1;tick<=40;tick++){d.update(frame([{...a,timeSec:tick*.1,position:{...a.position,x:200+speeds[i]*tick*.1}}]));}
    assert.ok(d.stats.moveTriggers>0,id);assert.equal(d.stats.feedTriggers,0);
    const jumped=make(t);jumped.update(frame([a]));jumped.update(frame([{...fed(a),position:{...a.position,x:200.01}}]));
    assert.equal(jumped.stats.emittedParticles,0,id);
  }
});
test('pause, zero advancement, cold exposure and long loading gaps never replay saved resident feeding',t=>{
  const d=make(t),saved=fed(animal(ids[2]),100);d.update(frame([saved],{dtSec:0}));assert.equal(d.stats.emittedParticles,0);
  d.update(frame([fed(saved,100.1)],{paused:true}));assert.equal(d.stats.emittedParticles,0);
  d.update(frame([fed(saved,100.2)],{dtSec:0}));assert.equal(d.stats.emittedParticles,0);
  d.update(frame([fed(saved,200)]));assert.equal(d.stats.emittedParticles,0);assert.equal(d.stats.skippedClockJumps,1);
  d.update(frame([fed(saved,200.1)]));assert.equal(d.stats.feedTriggers,1);
  const particles=clone(d.particleSnapshot());d.update(frame([fed(saved,200.2)],{paused:true}));assert.deepEqual(d.particleSnapshot(),particles);
});
test('new resident grains stay low, follow local current, settle, and stop where actual solid or rock interrupts the sand',t=>{
  const d=make(t),a=animal(ids[2]);d.update(frame([a]));d.update(frame([fed(a)]));
  const first=d.particleSnapshot();d.update(frame([],{dtSec:.5,currentVector:{x:.5,z:0}}));
  const next=d.particleSnapshot();assert.equal(first.length,next.length);
  for(let i=0;i<next.length;i++){assert.ok(next[i].position.x-first[i].position.x>.08);assert.ok(next[i].position.y>-3&&next[i].position.y<-2.82);}
  d.update(frame([],{dtSec:.1,surfaceAt:()=>-2.95}));assert.equal(d.stats.activeParticles,0);
  const low=make(t),b=animal(ids[3]);low.update(frame([b]));low.update(frame([fed(b)]));
  for(let i=0;i<20;i++){low.update(frame([],{dtSec:.1}));assert.ok(low.particleSnapshot().every(p=>p.position.y<-2.94));}
  assert.equal(low.stats.activeParticles,0);
});
test('large mixed resident populations remain bounded and hold no animal references; reset and disposal release only owned resources',t=>{
  const d=make(t),agents=Array.from({length:240},(_,i)=>({...animal(ids[i%4]),id:`actual:${i}`}));
  d.update(frame(agents));d.update(frame(freeze(agents.map(a=>fed(a)))));
  assert.ok(d.stats.activeParticles<=32);assert.ok(d.stats.trackedSources<=180);assert.equal(d.stats.retainedEntityReferences,0);
  assert.equal(d.stats.geometryCount,1);assert.equal(d.stats.materialCount,1);assert.equal(d.stats.maxDrawCalls,1);
  d.update(frame([],{dtSec:0}));assert.equal(d.stats.trackedSources,0);
  const geometry=d.root.geometry,material=d.root.material;d.reset();assert.equal(d.root.geometry,geometry);assert.equal(d.root.material,material);
  assert.equal(d.stats.activeParticles,0);assert.ok(d._sourceTraits.every(v=>v===null));
  d.dispose();assert.equal(d.root.parent,null);assert.equal(d.stats.geometryCount,0);assert.equal(d.stats.materialCount,0);
});
