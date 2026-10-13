import test from 'node:test';
import assert from 'node:assert/strict';
import {createShallowNarration} from '../src/shallowNarration.js';

class FakeAudio {
  constructor() {
    this.listeners = new Map(); this.paused = true; this.readyState = 0;
    this.duration = NaN; this.currentTime = 0; this.playbackRate = 1;
    this.volume = 1; this.loads = 0; this.plays = 0; this.src = '';
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  emit(name) { this.listeners.get(name)?.(); }
  load() { this.loads++; this.readyState = 0; this.duration = NaN; this.currentTime = 0; this.paused = true; }
  pause() { this.paused = true; this.emit('pause'); }
  play() { this.plays++; this.paused = false; return this.nextPlay ? this.nextPlay() : Promise.resolve(); }
  metadata(duration = 10) { this.readyState = 2; this.duration = duration; this.emit('loadedmetadata'); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
const clips = [
  {id:'reef',start:0,duration:10,src:'narration/reef.mp3',subtitles:[{start:0,end:4,text:'进入礁谷'},{start:4,end:10,text:'观察鱼群'}]},
  {id:'sand',start:20,duration:8,src:'narration/sand.mp3',subtitles:[{start:0,end:8,text:'沿沙道前进'}]},
];
const snapshot = (time = 0, extra = {}) => ({time,playing:true,speed:1,free:false,returning:false,ready:true,hidden:false,...extra});
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = () => {
  const audio = new FakeAudio(), statuses = [];
  const controller = createShallowNarration(audio, clips, {baseUrl:'/ocean-world/',onStatus:value=>statuses.push(value)});
  return {audio,controller,statuses,last:()=>statuses.at(-1)};
};

test('narration is opt-in and the click initiates playback without fetching beforehand',async()=>{
  const f=fixture();f.controller.sync(snapshot(2));
  assert.equal(f.audio.loads,0);assert.equal(f.audio.plays,0);assert.equal(f.audio.preload,'none');assert.equal(f.last().status,'off');
  f.controller.enable(snapshot(2));
  assert.equal(f.audio.plays,1);assert.equal(f.audio.src,'/ocean-world/narration/reef.mp3');assert.equal(f.last().status,'loading');
  f.audio.metadata();await flush();
  assert.equal(f.audio.currentTime,2);assert.equal(f.last().status,'playing');assert.equal(f.last().subtitle,'进入礁谷');
});
test('seeks, speed and captions follow the selected clip and leave real silent gaps',async()=>{
  const f=fixture();f.controller.enable(snapshot());f.audio.metadata();await flush();
  f.audio.currentTime=4.2;f.audio.emit('timeupdate');assert.equal(f.last().subtitle,'观察鱼群');
  f.controller.sync(snapshot(5,{speed:2}));assert.equal(f.audio.currentTime,5);assert.equal(f.audio.playbackRate,2);assert.equal(f.audio.preservesPitch,true);
  f.audio.currentTime=5.1;f.controller.sync(snapshot(5.2,{speed:2}));assert.equal(f.audio.currentTime,5.1,'small drift does not seek every frame');
  f.controller.sync(snapshot(14));assert.equal(f.last().status,'quiet');assert.equal(f.last().subtitle,'');assert.equal(f.audio.paused,true);
  f.controller.sync(snapshot(23));f.audio.metadata(8);await flush();
  assert.equal(f.audio.currentTime,3);assert.equal(f.last().clipId,'sand');assert.equal(f.last().subtitle,'沿沙道前进');
  f.controller.sync(snapshot(240));assert.equal(f.last().status,'quiet');assert.equal(f.audio.paused,true);
});
test('paused route, free exploration, returning camera, hidden tab and scene preparation all hold audio',async()=>{
  for(const state of [{playing:false},{free:true},{returning:true},{hidden:true},{ready:false}]){
    const f=fixture();f.controller.enable(snapshot(2));f.audio.metadata();await flush();
    f.controller.sync(snapshot(2,state));assert.equal(f.audio.paused,true);assert.equal(f.last().status,'paused');
    const count=f.audio.plays;f.controller.sync(snapshot(2,state));assert.equal(f.audio.plays,count);
    f.controller.sync(snapshot(3));await flush();assert.equal(f.audio.paused,false);assert.equal(f.audio.currentTime,3);assert.equal(f.audio.plays,count+1);
    f.controller.dispose();
  }
});
test('blocked and failed playback report once without a frame-by-frame retry storm',async()=>{
  const f=fixture();f.audio.nextPlay=()=>Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}));
  f.controller.enable(snapshot());await flush();assert.equal(f.last().status,'blocked');
  for(let i=0;i<20;i++)f.controller.sync(snapshot(i*.1));
  assert.equal(f.audio.plays,1);
  f.audio.nextPlay=()=>Promise.resolve();f.controller.enable(snapshot(2));f.audio.metadata();await flush();assert.equal(f.last().status,'playing');
  f.audio.emit('error');assert.equal(f.last().status,'error');
  for(let i=0;i<20;i++)f.controller.sync(snapshot(2+i*.1));
  assert.equal(f.audio.plays,2);
  f.controller.sync(snapshot(20));f.audio.metadata(8);await flush();assert.equal(f.last().status,'playing','one broken file does not break the next chapter');
});
test('late metadata seeks to the latest route time and obsolete play promises cannot poison a new clip',async()=>{
  const f=fixture();let rejectOld;
  f.audio.nextPlay=()=>new Promise((resolve,reject)=>{rejectOld=reject;});
  f.controller.enable(snapshot());f.controller.sync(snapshot(7));f.audio.metadata();assert.equal(f.audio.currentTime,7);
  f.audio.nextPlay=()=>Promise.resolve();f.controller.sync(snapshot(22));f.audio.metadata(8);await flush();
  rejectOld(Object.assign(new Error('old request'),{name:'NotAllowedError'}));await flush();
  assert.equal(f.last().clipId,'sand');assert.equal(f.last().status,'playing');assert.equal(f.audio.paused,false);
});
test('disable and disposal prevent pending promises from restarting audio and release listeners',async()=>{
  const f=fixture();let resolvePlay;f.audio.nextPlay=()=>new Promise(resolve=>{resolvePlay=resolve;});
  f.controller.enable(snapshot());f.controller.disable();resolvePlay();await flush();
  assert.equal(f.audio.paused,true);assert.equal(f.last().status,'off');
  f.controller.setVolume(3);assert.equal(f.audio.volume,1);f.controller.setVolume(-1);assert.equal(f.audio.volume,0);
  f.controller.dispose();assert.equal(f.audio.listeners.size,0);assert.equal(f.audio.src,'');assert.equal(f.audio.preload,'none');
  const calls=f.audio.plays;f.controller.enable(snapshot());f.controller.sync(snapshot());assert.equal(f.audio.plays,calls);
});
test('media end remains silent until a deliberate backwards seek',async()=>{
  const f=fixture();f.controller.enable(snapshot(9.7));f.audio.metadata();await flush();
  f.audio.currentTime=10;f.audio.paused=true;f.audio.emit('ended');
  for(let i=0;i<3;i++)f.controller.sync(snapshot(9.8+i*.05));
  assert.equal(f.audio.plays,1);assert.equal(f.last().status,'quiet');
  f.controller.sync(snapshot(3));await flush();assert.equal(f.audio.plays,2);assert.equal(f.audio.currentTime,3);assert.equal(f.last().status,'playing');
});
test('an explicit retry reloads a failed file, and disposed promises cannot pause a new controller',async()=>{
  const f=fixture();f.controller.enable(snapshot());f.audio.metadata();await flush();
  f.audio.emit('error');const loads=f.audio.loads;
  f.controller.enable(snapshot(2));assert.equal(f.audio.loads,loads+1);f.audio.metadata();await flush();
  assert.equal(f.last().status,'playing');
  let resolveOld;f.controller.disable();f.audio.nextPlay=()=>new Promise(resolve=>{resolveOld=resolve;});
  f.controller.enable(snapshot(3));f.controller.dispose();
  f.audio.nextPlay=()=>Promise.resolve();const next=createShallowNarration(f.audio,clips);
  next.enable(snapshot());f.audio.metadata();await flush();resolveOld();await flush();
  assert.equal(f.audio.paused,false);next.dispose();
});
test('a slightly delayed final phrase finishes naturally inside a bounded silent gap',async()=>{
  const f=fixture();f.controller.enable(snapshot(9.65));f.audio.metadata();await flush();
  f.audio.currentTime=9.6;f.controller.sync(snapshot(9.85));
  f.audio.currentTime=9.72;f.controller.sync(snapshot(10.03));
  assert.equal(f.audio.paused,false);assert.equal(f.last().status,'playing');
  assert.equal(f.last().clipId,'reef');assert.equal(f.last().subtitle,'观察鱼群');
  assert.equal(f.audio.currentTime,9.72,'the tail must not seek to the final millisecond');
  f.audio.currentTime=10;f.audio.paused=true;f.audio.emit('ended');
  f.controller.sync(snapshot(10.25));assert.equal(f.last().status,'quiet');assert.equal(f.audio.plays,1);
});
test('tail grace never survives an explicit jump, suspension, excessive lag, or its time bound',async()=>{
  const cases = [
    snapshot(11),
    snapshot(10.03,{seekRevision:1}),
    snapshot(10.03,{playing:false}),
    snapshot(10.03,{free:true}),
    snapshot(10.03,{returning:true}),
    snapshot(10.03,{hidden:true}),
    snapshot(10.03,{ready:false}),
  ];
  for(const next of cases){
    const f=fixture();f.controller.enable(snapshot(9.85,{seekRevision:0}));f.audio.metadata();await flush();
    f.audio.currentTime=9.7;f.controller.sync(next);
    assert.equal(f.audio.paused,true,JSON.stringify(next));assert.equal(f.last().status,'quiet');f.controller.dispose();
  }
  const lag=fixture();lag.controller.enable(snapshot(9.85));lag.audio.metadata();await flush();
  lag.audio.currentTime=8.9;lag.controller.sync(snapshot(10.03));assert.equal(lag.audio.paused,true);
  const bound=fixture();bound.controller.enable(snapshot(9.85));bound.audio.metadata();await flush();bound.audio.currentTime=9.7;
  for(const time of [10.03,10.23,10.43,10.63])bound.controller.sync(snapshot(time));
  assert.equal(bound.audio.paused,false);bound.controller.sync(snapshot(10.76));assert.equal(bound.audio.paused,true);
});
