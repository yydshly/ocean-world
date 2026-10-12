import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the shipped frame/load boundaries; renderer and disk failures are injected.
const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
function method(name){
  const start=source.indexOf(`  ${name}(`);assert.ok(start>=0);
  const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start+2));
  return source.slice(start,next?start+2+next.index:source.lastIndexOf('\n}'));
}
const Boundary=new Function(`return class{${method('runFrame')}\n${method('requestOceanEcology')}}`)();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(update=async()=>true){
  const notices=[],loops=[],calls=[],agents=[{id:'existing-animal',timeSec:7,alive:true}],world=new Boundary();
  Object.assign(world,{disposed:false,elapsed:1,errors:[],onError:message=>notices.push(message),
    renderer:{setAnimationLoop:fn=>loops.push(fn)},tick:now=>calls.push(['tick',now]),
    oceanWorldPosition:()=>({x:204*64+24,z:4*64+64}),
    oceanEcology:{agents,update,_counts:{persistenceErrors:0}},oceanChunks:{update:p=>calls.push(['chunks',p])},
    oceanAnimals:{update:a=>calls.push(['animals',a])},sim:{metrics:{timeSec:7}},camera:{position:{x:0,y:2,z:0}},
    updateKelpDriftFood:()=>calls.push(['food']),emitSnapshot:()=>calls.push(['snapshot'])});
  return {world,notices,loops,calls,agents};
}
test('normal frame passes its timestamp and keeps the loop running',()=>{
  const f=fixture();assert.equal(f.world.runFrame(123),true);
  assert.deepEqual(f.calls,[['tick',123]]);assert.deepEqual(f.notices,[]);assert.deepEqual(f.loops,[]);
});
test('a first-frame geometry or draw failure reaches the existing error panel once and stops broken frames',()=>{
  const f=fixture();f.world.tick=()=>{throw Error('injected draw failure');};
  assert.equal(f.world.runFrame(123),false);assert.equal(f.world.paused,true);
  assert.deepEqual(f.loops,[null]);assert.deepEqual(f.notices,['场景绘制失败：injected draw failure']);
  assert.equal(f.world.runFrame(456),false);assert.equal(f.notices.length,1);
  assert.deepEqual(f.agents,[{id:'existing-animal',timeSec:7,alive:true}]);
});
test('a failed driver loop shutdown does not conceal the original drawing error',()=>{
  const f=fixture();f.world.tick=()=>{throw Error('original failure');};
  f.world.renderer.setAnimationLoop=()=>{throw Error('shutdown failure');};
  assert.equal(f.world.runFrame(5),false);assert.deepEqual(f.notices,['场景绘制失败：original failure']);
  assert.equal(f.world.errors.length,2);
});
test('rejected regional reads reach the UI instead of only an internal log; saved agents remain intact',async()=>{
  const f=fixture(async()=>{throw Error('incomplete saved group');});f.world.requestOceanEcology();await flush();
  assert.deepEqual(f.notices,['海域加载失败：incomplete saved group']);
  assert.ok(f.world.errors.includes('区域生态加载失败：incomplete saved group'));
  assert.deepEqual(f.calls,[['snapshot']]);assert.deepEqual(f.agents,[{id:'existing-animal',timeSec:7,alive:true}]);
});
test('a false persistence result reports the real storage failure, while normal supersession remains quiet',async()=>{
  const f=fixture(async()=>{f.world.oceanEcology._counts.persistenceErrors++;return false;});f.world.oceanEcology._storageError='disk unavailable';
  f.world.requestOceanEcology();await flush();assert.deepEqual(f.notices,['海域存档加载失败：disk unavailable']);
  assert.equal(f.world.oceanEcologyCenter,null);assert.equal(f.world.oceanEcologyRetryAt,3);
  const superseded=fixture(async()=>false);superseded.world.oceanEcology._storageError='old unrelated error';
  superseded.world.oceanEcology._counts.persistenceErrors=3;superseded.world.requestOceanEcology();await flush();
  assert.deepEqual(superseded.notices,[]);
});
test('late failure from a disposed world never replaces the next world error state',async()=>{
  let reject;const pending=new Promise((_,no)=>{reject=no;});const f=fixture(()=>pending);
  f.world.requestOceanEcology();f.world.disposed=true;reject(Error('late old read'));await flush();
  assert.deepEqual(f.notices,[]);assert.deepEqual(f.calls,[]);assert.equal(f.world.runFrame(0),false);
});
test('successful regional activation still delivers the same animal collection and snapshot',async()=>{
  const f=fixture();f.world.requestOceanEcology();await flush();
  assert.deepEqual(f.notices,[]);assert.equal(f.calls[0][0],'animals');assert.equal(f.calls[0][1],f.agents);
  assert.deepEqual(f.calls.slice(1),[['food'],['snapshot']]);
});
