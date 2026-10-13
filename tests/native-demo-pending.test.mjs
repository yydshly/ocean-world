import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoWorldMatches } from '../src/demoNavigation.js';
import { directorSceneReady } from '../src/directorReadiness.js';
import { LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';

// Execute the shipped effect with explicit React/World interfaces. The native
// regional suite separately proves real terrain, ecology and history publication.
const source=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
const start=source.indexOf('    if(pendingNativeDemo.current?.choice!==pendingDemo)');
const end=source.indexOf('  },[pendingDemo,snapshot,worldReady,biome,reefProfile,director.state.token,director.state.active]);',start);
assert.ok(start>=0&&end>start);
const run=new Function('context',`const {pendingDemo,pendingNativeDemo,worldReady,world,snapshot,director,demoWorldMatches,setPendingDemo,
  setView,setOceanToolsOpen,setPanel,rememberOcean,setToast,directorSceneReady}=context;${source.slice(start,end)}`);
const closeLine=source.split('\n').find(line=>line.includes('  const closeDemo=()=>'));
const close=new Function('context',`const {pendingNativeDemo,director,setPendingDemo,setPanel}=context;${closeLine};closeDemo();`);
const turns=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function gate(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function fixture({guided=false,meadow=false}={}){
  const ids=[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>`${204+dx},${5+dz}`)),gates=[],log=[];
  const snapshot={biomeId:'reef',sceneProfile:LIVING_SHALLOWS_PROFILE,ocean:{exploring:true,chunkId:'204,5',localHabitat:{status:'empty'},
    ecology:{metrics:{loadingRegions:0,activeRegions:9},regions:ids.map(id=>({id}))},streaming:{loadedChunks:ids}}};
  const actual={biomeId:'reef',isLivingShallows:true,sim:{seed:'retained-seed'},controlStartCount:0,_shallowSceneEntryToken:0,
    snapshot:()=>snapshot,enterReefValleyRegion:enter,enterSeagrassMeadowRegion:enter};
  function enter(options){this._shallowSceneEntryToken++;const pending=gate();gates.push({...pending,options});log.push(['native']);return pending.promise;}
  const choice={kind:'living-stop',biome:'reef',profile:LIVING_SHALLOWS_PROFILE,
    ...(meadow?{seagrassMeadowRegionEntry:true}:{reefValleyRegionEntry:true}),...(guided?{directorToken:7}:{})};
  const context={pendingDemo:choice,pendingNativeDemo:{current:null},worldReady:true,world:{current:actual},snapshot,
    demoWorldMatches,directorSceneReady,director:{state:{active:guided,token:7},isCurrent:token=>token===7,
      prepareWorld(){},applied:token=>log.push(['applied',token]),fail:(token,message)=>log.push(['fail',token,message]),stop:()=>log.push(['stop'])},
    setPendingDemo(next){context.pendingDemo=typeof next==='function'?next(context.pendingDemo):next;log.push(['pending',context.pendingDemo]);},
    setView:value=>log.push(['view',value]),setOceanToolsOpen:value=>log.push(['tools',value]),setPanel:value=>log.push(['panel',value]),
    rememberOcean:()=>log.push(['remember']),setToast:value=>log.push(['toast',value])};
  return{actual,choice,context,snapshot,gates,log,start:()=>run(context)};
}

test('manual and guided regional entries keep waiting across snapshots and dispatch native preparation exactly once',async()=>{
  for(const guided of[false,true])for(const meadow of[false,true]){
    const f=fixture({guided,meadow});f.start();f.start();f.start();
    assert.equal(f.gates.length,1);assert.equal(f.context.pendingDemo,f.choice);
    assert.equal(f.gates[0].options.isCurrent(),true);
    assert.equal(f.log.some(row=>['pending','remember','applied'].includes(row[0])),false);
    assert.deepEqual(f.log.filter(row=>row[0]==='panel'),[['panel',guided?null:'demo']]);
    f.gates[0].resolve(true);await turns();
    assert.equal(f.context.pendingDemo,null);assert.equal(f.context.pendingNativeDemo.current,null);
    assert.equal(f.log.filter(row=>row[0]==='remember').length,1);
    assert.equal(f.log.filter(row=>row[0]==='applied').length,guided?1:0);
  }
});

test('a native result cannot confirm the destination from an older nine-owner or partial terrain window',async()=>{
  for(const missing of['ecology','terrain']){
    const f=fixture({guided:true});f.start();
    if(missing==='ecology')f.snapshot.ocean.ecology.regions=[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>({id:`${207+dx},${5+dz}`})));
    else f.snapshot.ocean.streaming.loadedChunks=['205,4','205,5','205,6'];
    f.gates[0].resolve(true);await turns();
    assert.equal(f.log.some(row=>['remember','applied'].includes(row[0])),false);
    assert.equal(f.log.filter(row=>row[0]==='fail').length,1);assert.equal(f.context.pendingDemo,null);
  }
});

test('closing the manual overview revokes native ownership immediately and suppresses all late completion effects',async()=>{
  const f=fixture();f.start();const pending=f.gates[0];close(f.context);
  assert.equal(pending.options.isCurrent(),false,'the native guard is revoked before another snapshot');
  pending.resolve(true);await turns();
  assert.equal(f.context.pendingDemo,null);assert.equal(f.log.some(row=>['remember','applied','toast'].includes(row[0])),false);
});

test('a replaced entry owns the new waiting state and old success or error cannot clear it',async()=>{
  for(const reject of[false,true]){
    const f=fixture();f.start();const first=f.gates[0];
    const replacement={...f.choice,seagrassMeadowRegionEntry:true,reefValleyRegionEntry:false};
    f.context.pendingDemo=replacement;f.start();assert.equal(f.gates.length,2);
    assert.equal(first.options.isCurrent(),false);assert.equal(f.gates[1].options.isCurrent(),true);
    if(reject)first.reject(new Error('obsolete save'));else first.resolve(true);await turns();
    assert.equal(f.context.pendingDemo,replacement);assert.equal(f.log.some(row=>['remember','toast'].includes(row[0])),false);
    f.gates[1].resolve(true);await turns();assert.equal(f.context.pendingDemo,null);
    assert.equal(f.log.filter(row=>row[0]==='remember').length,1);
  }
});

test('a current declined or failed entrance releases waiting and reports one finite failure',async()=>{
  for(const reject of[false,true]){
    const f=fixture();f.start();if(reject)f.gates[0].reject(new Error('unreadable saved owner'));else f.gates[0].resolve(false);await turns();
    assert.equal(f.context.pendingDemo,null);assert.equal(f.context.pendingNativeDemo.current,null);
    assert.equal(f.log.some(row=>row[0]==='remember'),false);assert.equal(f.log.filter(row=>row[0]==='toast').length,1);
  }
});
