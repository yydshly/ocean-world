import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';
import { DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, createDirectorState, directorReducer } from '../src/directorTour.js';
import { directorMotionCompletionEvent } from '../src/directorMotionReceipt.js';

// Execute the shipped initialization and asynchronous entry handler. World
// interfaces are explicit doubles; this does not mount React or accept pixels.
const source=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
function initializer(name,setter){
  const prefix=`const [${name},${setter}]=useState(`,begin=source.indexOf(prefix);
  assert.ok(begin>=0);let quote=null,escaped=false,depth=1,i=begin+prefix.length;
  const start=i;
  for(;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='(')depth++;else if(c===')'&&!--depth)break;
  }
  assert.equal(depth,0);
  return new Function('window','localStorage','URLSearchParams','LIVING_SHALLOWS_PROFILE',`return (${source.slice(start,i)});`);
}
const factories=[['pendingDemo','setPendingDemo'],['biome','setBiome'],['reefProfile','setReefProfile']].map(([a,b])=>initializer(a,b));
const begin=source.indexOf('    if(choice.reefValleyRegionEntry||choice.seagrassMeadowRegionEntry){'),end=source.indexOf('    if(choice.coastalLifeBeltEntry',begin);
assert.ok(begin>=0&&end>begin);
const runEntry=new Function('choice','world','director','setView','setOceanToolsOpen','setPanel','rememberOcean','setToast',source.slice(begin,end));
const wait=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture({guided=false}={}){
  let resolve,reject,valid=true;const gate=new Promise((yes,no)=>{resolve=yes;reject=no;}),log=[];
  const retained={timeSec:132.4,dead:{id:'retained-death',alive:false},stock:{plankton:.14},rng:88};
  const actual={sim:{seed:'retained-seed'},disposed:false,controlStartCount:2,_shallowSceneEntryToken:10,retained,
    enterReefValleyRegion(options){this.options=options;this._shallowSceneEntryToken++;return gate;}};
  const world={current:actual},director={isCurrent:token=>valid&&token===37,
    applied:token=>log.push(['applied',token]),fail:(token,message)=>log.push(['failed',token,message])};
  const choice={reefValleyRegionEntry:true,...(guided?{directorToken:37}:{})};
  runEntry(choice,world,director,value=>log.push(['view',value]),value=>log.push(['tools',value]),value=>log.push(['panel',value]),
    ()=>log.push(['remember']),value=>log.push(['toast',value]));
  return {actual,world,log,resolve,reject,retained,before:structuredClone(retained),invalidate:()=>valid=false};
}

test('the direct reef-valley URL enters the living reef without altering previously selected worlds or seeds',()=>{
  const writes=[],storage={getItem:key=>key==='tidal-observation-biome-v1'?'kelp':'legacy',setItem:(...args)=>writes.push(args)};
  const values=search=>factories.map(make=>make({location:{search}},storage,URLSearchParams,LIVING_SHALLOWS_PROFILE)());
  assert.deepEqual(values('?demo=reef-valley-region'),[{kind:'living-stop',biome:'reef',profile:LIVING_SHALLOWS_PROFILE,
    stopId:'reef-valley-region',reefValleyRegionEntry:true},'reef',LIVING_SHALLOWS_PROFILE]);
  assert.deepEqual(values(''),[null,'kelp','legacy']);assert.deepEqual(writes,[]);
  const capability=DEMO_LIVING_STOPS.find(row=>row.id==='reef-valley-region');
  assert.equal(capability.action.reefValleyRegionEntry,true);
  assert.equal(DIRECTOR_STEPS[0].action,capability.action);
});

test('manual and guided entries await native durable preparation before remembering and confirming the chapter',async()=>{
  for(const guided of[false,true]){
    const f=fixture({guided});assert.equal(f.actual.options.isCurrent(),true);
    assert.equal(f.log.some(row=>['remember','applied'].includes(row[0])),false);
    f.resolve(true);await wait();
    assert.equal(f.log.filter(row=>row[0]==='remember').length,1);
    assert.equal(f.log.filter(row=>row[0]==='applied').length,guided?1:0);
    assert.deepEqual(f.retained,f.before);
  }
});

test('stop, seek, changed controls, world, seed or native entry ownership suppress all late entry effects',async()=>{
  for(const change of[f=>f.invalidate(),f=>f.actual.controlStartCount++,f=>f.world.current={},f=>f.actual.sim.seed='replacement',
    f=>f.actual._shallowSceneEntryToken++,f=>f.actual.disposed=true]){
    const f=fixture({guided:true});change(f);f.resolve(true);await wait();
    assert.equal(f.log.some(row=>['remember','applied','failed','toast'].includes(row[0])),false);
    assert.deepEqual(f.retained,f.before);
  }
  const stopped=fixture({guided:true});stopped.invalidate();assert.equal(stopped.actual.options.isCurrent(),false,
    'the native World also receives live chapter ownership before any camera write');stopped.reject(new Error('old-save-error'));await wait();
  assert.equal(stopped.log.some(row=>row[0]==='failed'),false);
});

test('declined and failed native entries report the active attempt without claiming successful exploration',async()=>{
  for(const guided of[false,true])for(const failure of[false,true]){
    const f=fixture({guided});if(failure)f.reject(new Error('durable-save-failed'));else f.resolve(false);await wait();
    assert.equal(f.log.some(row=>['remember','applied'].includes(row[0])),false);
    const reports=f.log.filter(row=>row[0]===(guided?'failed':'toast'));assert.equal(reports.length,1);
    if(failure)assert.equal(reports[0].at(-1),'durable-save-failed');assert.deepEqual(f.retained,f.before);
  }
  let state=directorReducer(createDirectorState(),{type:'start'});state=directorReducer(state,{type:'entered',token:state.token});
  const shot={kind:'reef-valley-route',durationSec:800,elapsedSec:800,complete:true};
  assert.deepEqual(directorMotionCompletionEvent(shot,state,state.token,DIRECTOR_STEPS),{type:'record-complete',token:state.token});
  assert.equal(directorMotionCompletionEvent({...shot,durationSec:200},state,state.token,DIRECTOR_STEPS),null);
  assert.equal(directorMotionCompletionEvent({...shot,elapsedSec:799.9},state,state.token,DIRECTOR_STEPS),null);
});
