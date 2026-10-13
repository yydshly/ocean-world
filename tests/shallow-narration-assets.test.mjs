import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('six shipped MP3 clips match their scripts, checksums and four-minute route windows',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../src/data/shallowJourneyNarration.json',import.meta.url),'utf8'));
  const script=JSON.parse(await fs.readFile(new URL('../scripts/narration/shallow-journey.zh-CN.json',import.meta.url),'utf8'));
  assert.equal(manifest.clips.length,6);
  for(const [i,clip] of manifest.clips.entries()){
    assert.equal(clip.text,script.clips[i].text);assert.equal(clip.start,script.clips[i].start);
    assert.ok(clip.duration>5);assert.ok(clip.start+clip.duration<(manifest.clips[i+1]?.start??240));
    assert.match(clip.src,/^audio\/shallow-journey\/[a-z-]+\.mp3$/);
    const audio=await fs.readFile(new URL(`../public/${clip.src}`,import.meta.url));
    assert.equal(audio.length,clip.bytes);assert.equal(createHash('sha256').update(audio).digest('hex'),clip.sha256);
    assert.equal(clip.subtitles.map(s=>s.text).join(''),clip.text);
    for(const cue of clip.subtitles){assert.ok(cue.start>=0&&cue.end>cue.start&&cue.end<=clip.duration);}
  }
});
