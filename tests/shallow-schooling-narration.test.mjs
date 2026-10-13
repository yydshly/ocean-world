import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {shallowNarrationTimeline} from '../src/shallowNarrationTimeline.js';
import {SHALLOW_SCHOOLING_PHASES} from '../src/shallowSchooling.js';
import {SHALLOW_JOURNEY_CHAPTERS} from '../src/shallowJourney.js';
import {createShallowNarration} from '../src/shallowNarration.js';
import {shallowNarrationPresentation} from '../src/shallowNarrationPresentation.js';

const readJSON = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const oldManifest = readJSON('../src/data/shallowJourneyNarration.json');
const schoolManifest = readJSON('../src/data/shallowSchoolingNarration.json');
const school = shallowNarrationTimeline({schoolingOnly:true});
const journey = shallowNarrationTimeline();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = (time=0, extra={}) => ({time,ready:true,playing:true,speed:1,free:false,returning:false,hidden:false,seekRevision:0,...extra});
const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeAudio {
  constructor(){
    this.listeners=new Map();this.paused=true;this.readyState=0;this.duration=NaN;
    this.currentTime=0;this.playbackRate=1;this.volume=1;this.muted=false;this.loads=0;this.plays=0;this.src='';
  }
  addEventListener(name,listener){this.listeners.set(name,listener);}
  removeEventListener(name){this.listeners.delete(name);}
  emit(name){this.listeners.get(name)?.();}
  load(){this.loads++;this.readyState=0;this.duration=NaN;this.currentTime=0;this.paused=true;}
  pause(){this.paused=true;this.emit('pause');}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  metadata(duration){this.readyState=2;this.duration=duration;this.emit('loadedmetadata');}
  removeAttribute(name){if(name==='src')this.src='';}
}
function player(timeline){
  const audio=new FakeAudio(),statuses=[];
  const controller=createShallowNarration(audio,timeline.clips,{baseUrl:'/ocean-world/',onStatus:value=>statuses.push(value)});
  return {audio,controller,statuses,last:()=>statuses.at(-1)};
}

// Read the shipped MPEG Layer III frame clock, rather than trusting manifest
// duration alone. Encoder delay/padding can trim one or two frames at playback.
function mp3FrameDuration(bytes){
  let offset=0,seconds=0,frames=0;
  if(bytes.subarray(0,3).toString()==='ID3'){
    assert.ok(bytes.length>=10,'ID3 header');
    const size=((bytes[6]&127)<<21)|((bytes[7]&127)<<14)|((bytes[8]&127)<<7)|(bytes[9]&127);
    offset=10+size+((bytes[5]&16)?10:0);
  }
  while(offset+4<=bytes.length){
    if(bytes.subarray(offset,offset+3).toString()==='TAG')break;
    const header=bytes.readUInt32BE(offset);
    assert.equal(header>>>21,0x7ff,`MP3 frame sync at ${offset}`);
    const version=(header>>>19)&3,layer=(header>>>17)&3,rateIndex=(header>>>10)&3,bitrateIndex=(header>>>12)&15;
    assert.notEqual(version,1,'reserved MPEG version');assert.equal(layer,1,'Layer III audio');
    assert.ok(rateIndex<3&&bitrateIndex>0&&bitrateIndex<15,'valid frame rate and bitrate');
    const rates=[44100,48000,32000],rate=rates[rateIndex]/(version===3?1:version===2?2:4);
    const bitrates=version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    const samples=version===3?1152:576;
    const size=Math.floor((version===3?144000:72000)*bitrates[bitrateIndex]/rate)+((header>>>9)&1);
    assert.ok(size>=4&&offset+size<=bytes.length,'complete MPEG frame');
    seconds+=samples/rate;frames++;offset+=size;
  }
  assert.ok(frames>0,'audio contains MPEG frames');
  assert.ok(bytes.length-offset<4,'no unexpected audio trailer');
  return seconds;
}

test('both real narration timelines fit their observation windows and preserve the six original clip records',()=>{
  const original=structuredClone(oldManifest);
  assert.equal(school.duration,60);assert.equal(school.clips.length,5);
  assert.deepEqual(school.clips,schoolManifest.clips);
  assert.deepEqual(school.chapters,SHALLOW_SCHOOLING_PHASES);
  assert.match(school.intro,/五段.*讲解/);
  assert.deepEqual(school.clips.map(clip=>clip.start),[0,8,28,36,46]);
  assert.equal(journey.duration,240);assert.equal(journey.clips.length,10);
  assert.match(journey.intro,/十段.*讲解/);
  assert.deepEqual(journey.clips.slice(0,5),school.clips);
  assert.deepEqual(journey.clips.slice(5),oldManifest.clips.slice(1).map(clip=>clip.id==='reef-edge'?{...clip,start:64}:clip));
  assert.deepEqual(journey.chapters,[...SHALLOW_SCHOOLING_PHASES,{...SHALLOW_JOURNEY_CHAPTERS[1],start:60},...SHALLOW_JOURNEY_CHAPTERS.slice(2)]);
  assert.deepEqual(readJSON('../src/data/shallowJourneyNarration.json'),original,'timeline composition must not rewrite legacy media metadata');
  for(const timeline of [school,journey])for(const [index,clip] of timeline.clips.entries()){
    assert.ok(clip.duration>0);
    assert.ok(clip.start+clip.duration<=Math.min(timeline.clips[index+1]?.start??timeline.duration,timeline.duration),`${clip.id}: overlaps its next narration or route end`);
    const chapter=timeline.chapters.find(item=>clip.start>=item.start&&clip.start<item.end);
    assert.ok(chapter,`${clip.id}: no associated observation chapter`);
    assert.ok(clip.start+clip.duration<=chapter.end,`${clip.id}: speech crosses the named observation phase`);
  }
});

test('five shipped school MP3 files match authored text, media hashes and actual encoded frame durations',()=>{
  const script=readJSON('../scripts/narration/shallow-schooling.zh-CN.json');
  assert.equal(script.clips.length,5);
  for(const [index,clip] of school.clips.entries()){
    assert.equal(clip.text,script.clips[index].text);assert.equal(clip.start,script.clips[index].start);
    assert.match(clip.src,/^audio\/shallow-schooling\/[a-z-]+\.mp3$/);
    const bytes=fs.readFileSync(new URL(`../public/${clip.src}`,import.meta.url));
    assert.equal(bytes.length,clip.bytes);assert.equal(hash(bytes),clip.sha256);
    assert.ok(Math.abs(mp3FrameDuration(bytes)-clip.duration)<.06,`${clip.id}: encoded media duration disagrees with timeline`);
    assert.equal(clip.subtitles.map(cue=>cue.text).join(''),clip.text);
    let previousEnd=0;
    for(const cue of clip.subtitles){
      assert.ok(cue.start>=previousEnd&&cue.end>cue.start&&cue.end<=clip.duration,`${clip.id}: invalid subtitle range`);
      previousEnd=cue.end;
    }
  }
  for(const clip of journey.clips.slice(5)){
    const bytes=fs.readFileSync(new URL(`../public/${clip.src}`,import.meta.url));
    assert.equal(bytes.length,clip.bytes);assert.equal(hash(bytes),clip.sha256,'existing four-minute audio must remain the same recording');
  }
});

test('school chapter replay and silent gaps identify the current phase without promising speech after 60 seconds',()=>{
  const view=(time,voice={})=>shallowNarrationPresentation({snapshot:snapshot(time),voice:{enabled:false,status:'off',...voice},...school});
  assert.match(view(0).message,/五段.*讲解/);assert.doesNotMatch(view(0).message,/六段/);
  for(const clip of school.clips){
    const atStart=view(clip.start);
    assert.equal(atStart.replayStart,clip.start);assert.equal(atStart.canReplay,false);
    const heard=view(clip.start+Math.min(1,clip.duration/2));
    assert.equal(heard.replayStart,clip.start);assert.equal(heard.canReplay,true);
    const inGap=view(clip.start+clip.duration+.1,{enabled:true,status:'quiet'});
    assert.equal(inGap.replayStart,clip.start,'a quiet phase gap never replays the preceding phase');
  }
  const complete=view(60,{enabled:true,status:'quiet'});
  assert.equal(complete.finished,true);assert.equal(complete.canReplay,false);
  assert.equal(complete.message,'讲解已结束，可从头重听');
  const main=shallowNarrationPresentation({snapshot:snapshot(62),voice:{enabled:false,status:'off'},...journey});
  assert.match(main.message,/十段.*讲解/);assert.equal(main.replayStart,64);assert.equal(main.canReplay,false);
});

test('real school narration is opt-in and all five clips play in order with silent observation between them',async()=>{
  const f=player(school);f.controller.sync(snapshot());
  assert.equal(f.audio.loads,0);assert.equal(f.audio.plays,0);assert.equal(f.last().status,'off');
  f.controller.enable(snapshot());
  for(const clip of school.clips){
    f.controller.sync(snapshot(clip.start));f.audio.metadata(clip.duration);await flush();
    assert.equal(f.last().status,'playing');assert.equal(f.last().clipId,clip.id);
    assert.equal(f.audio.src,`/ocean-world/${clip.src}`);assert.equal(f.audio.currentTime,0);
    // There is an intentional gap before the next observation begins.
    f.audio.currentTime=clip.duration;f.audio.paused=true;f.audio.emit('ended');
    f.controller.sync(snapshot(clip.start+clip.duration+.1));
    assert.equal(f.last().status,'quiet');assert.equal(f.last().subtitle,'');assert.equal(f.audio.paused,true);
  }
  assert.equal(f.audio.plays,5);f.controller.sync(snapshot(60));
  assert.equal(f.last().clipId,null);assert.equal(f.audio.paused,true);f.controller.dispose();
});

test('school narration follows pause, speed, exploration, return, backward seek and replay without moving route snapshots',async()=>{
  const f=player(school),clip=school.clips[3],time=clip.start+1;
  const start=snapshot(time),unchanged=structuredClone(start);
  f.controller.enable(start);f.audio.metadata(clip.duration);await flush();
  assert.deepEqual(start,unchanged);assert.equal(f.last().clipId,clip.id);assert.equal(f.audio.currentTime,1);
  f.controller.sync(snapshot(time+.2,{speed:2}));
  assert.equal(f.audio.playbackRate,2);assert.equal(f.audio.preservesPitch,true);
  for(const held of [{playing:false},{free:true},{returning:true},{hidden:true},{ready:false}]){
    f.controller.sync(snapshot(time,held));assert.equal(f.audio.paused,true);assert.equal(f.last().status,'paused');
    const plays=f.audio.plays;f.controller.sync(snapshot(time,held));assert.equal(f.audio.plays,plays);
    f.controller.sync(snapshot(time));await flush();assert.equal(f.audio.paused,false);assert.equal(f.audio.currentTime,1);
  }
  const earlier=school.clips[1];f.controller.sync(snapshot(earlier.start+1,{seekRevision:1}));f.audio.metadata(earlier.duration);await flush();
  assert.equal(f.last().clipId,earlier.id);assert.equal(f.audio.currentTime,1);
  f.controller.sync(snapshot(0,{seekRevision:2}));f.audio.metadata(school.clips[0].duration);await flush();
  assert.equal(f.last().clipId,school.clips[0].id);assert.equal(f.audio.currentTime,0);
  f.controller.disable();assert.equal(f.last().status,'off');assert.equal(f.audio.paused,true);
  const requests=f.audio.plays;f.controller.sync(snapshot(time));assert.equal(f.audio.plays,requests);f.controller.dispose();
});

test('the real four-minute timeline hands speech from the five school phases to the unchanged habitats and ends cleanly',async()=>{
  const f=player(journey);f.controller.enable(snapshot());
  for(const clip of journey.clips){
    f.controller.sync(snapshot(clip.start,{seekRevision:0}));f.audio.metadata(clip.duration);await flush();
    assert.equal(f.last().clipId,clip.id);assert.equal(f.last().status,'playing');
    f.audio.currentTime=clip.duration;f.audio.paused=true;f.audio.emit('ended');
    f.controller.sync(snapshot(clip.start+clip.duration+1));
    assert.equal(f.last().status,'quiet');assert.equal(f.audio.paused,true);
    if(clip===journey.clips[4]){
      for(const time of [60,62,63.9]){f.controller.sync(snapshot(time));assert.equal(f.last().clipId,null);assert.equal(f.audio.paused,true);}
    }
  }
  assert.equal(f.audio.plays,10);f.controller.sync(snapshot(240));assert.equal(f.last().status,'quiet');assert.equal(f.last().clipId,null);
  f.controller.dispose();assert.equal(f.audio.listeners.size,0);
});
