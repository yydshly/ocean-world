import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHALLOW_JOURNEY_CHAPTERS,SHALLOW_JOURNEY_SECONDS} from '../src/shallowJourney.js';
import {shallowNarrationPresentation} from '../src/shallowNarrationPresentation.js';

const {clips}=JSON.parse(readFileSync(new URL('../src/data/shallowJourneyNarration.json',import.meta.url),'utf8'));
const view=(time,route={},voice={})=>shallowNarrationPresentation({
  snapshot:{time,ready:true,playing:true,...route},
  voice:{enabled:true,status:'quiet',...voice},
  clips,chapters:SHALLOW_JOURNEY_CHAPTERS,duration:SHALLOW_JOURNEY_SECONDS,
});

test('chapter replay does not jump back to the previous habitat during a leading narration gap',()=>{
  for(let index=1;index<SHALLOW_JOURNEY_CHAPTERS.length;index++){
    const chapter=SHALLOW_JOURNEY_CHAPTERS[index],clip=clips[index];
    const leading=view(chapter.start);
    assert.equal(leading.replayStart,clip.start);
    assert.equal(leading.canReplay,false,'a clip not yet heard does not offer replay');
    const after=view(clip.start+clip.duration+1);
    assert.equal(after.replayStart,clip.start);
    assert.equal(after.canReplay,true,'replay remains available in its chapter after speech finishes');
  }
});

test('silent gaps clearly distinguish paused exploration, camera return and continued observation',()=>{
  assert.match(view(26,{playing:false}).message,/继续巡游后/);
  assert.match(view(26,{free:true,playing:false}).message,/探索中.*返回巡游后/);
  assert.match(view(26,{returning:true,playing:false}).message,/镜头正在归位/);
  assert.match(view(26).message,/留白观察.*礁边群落/);
  assert.match(view(26,{}, {enabled:false,status:'off'}).message,/从当前位置继续/);
});

test('the last silence and completed tour never promise a nonexistent next chapter',()=>{
  const last=clips.at(-1);
  const lastGap=view(last.start+last.duration+1);
  assert.match(lastGap.message,/已播完/);
  assert.doesNotMatch(lastGap.message,/下一段/);
  for(const enabled of [true,false]){
    const final=view(240,{playing:false},{enabled,status:enabled?'quiet':'off'});
    assert.equal(final.message,'讲解已结束，可从头重听');
    assert.equal(final.finished,true);
    assert.equal(final.canReplay,false);
  }
});
