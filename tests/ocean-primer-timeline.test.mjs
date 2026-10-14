import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { OCEAN_PRIMER_SECONDS, OCEAN_PRIMER_CHAPTERS, OCEAN_PRIMER_CLIPS, oceanPrimerChapter } from '../src/oceanPrimer.js';
import { shallowNarrationTimeline } from '../src/shallowNarrationTimeline.js';
import { experienceHref, currentExperience } from '../src/experienceNavigation.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url));
const json = file => JSON.parse(read(file).toString('utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = json('src/data/oceanPrimerNarration.json');
const script = json('scripts/narration/ocean-primer.zh-CN.json');
const expectedChapters = [['surface', 0, 45], ['shallow', 45, 285], ['pelagic', 285, 365], ['deep', 365, 430], ['recap', 430, 450]];
const newIds = ['surface-ocean-scale', 'pelagic-whale-breathing', 'pelagic-dolphin-space', 'deep-midwater-light', 'deep-seafloor-food', 'recap-three-clues'];

// Frozen before Stage06 generation; portable to CI without the ignored local receipt directory.
const oldAudioHashes = {
  'audio/shallow-journey/open-water.mp3': '9ab73047813b43177ceb3b4cbc377efb03d37417a7dd4c5b5484e0d270b942fd',
  'audio/shallow-journey/reef-edge.mp3': 'aff048da0e2bf0b5f18d5038462ff7679a1c9079a5db93116040c846699336ee',
  'audio/shallow-journey/reef-entry.mp3': '1e33d4d20afec079b90d430679aaa45f9740d8db851c9e74b2d7ed8ea148ae1d',
  'audio/shallow-journey/reef-sand.mp3': 'cbcadf9cb6c65fdc700700627d2197508f8cbb9b1eb0a2f397b3b54896c35324',
  'audio/shallow-journey/sand-life.mp3': '35a81f61d0c4a707ab7d6d4e3b977e11035a13c468d742679ad46f8bf54fc70c',
  'audio/shallow-journey/seagrass.mp3': '7d8eb01d7fd07ea3e1d9c33601ddd1ca14324ce298f6cd1042623be4b09b0a05',
  'audio/shallow-schooling/school-disturb.mp3': 'b060110ac7b3c37bbf05198716167947f63cab94ab27f705a663ee887cd3dc2e',
  'audio/shallow-schooling/school-entry.mp3': '2ee82d199a1094909a2808d5699bd3bc60c0c75ca682d3d9833fda3f7c929ebf',
  'audio/shallow-schooling/school-merge.mp3': 'b30bf6bdff6f750c3c423a5f2cc647ea304162ba0b369aa92c9acf405d8a1615',
  'audio/shallow-schooling/school-regroup.mp3': '4977d8b6feabebbc155a7f4eaee0b9bb02eba29134380f4f881aa585487350f8',
  'audio/shallow-schooling/school-split.mp3': 'bb0251ededc6cd4c2a84247d1cf80e5a52ef756d9f748b72a203c69b284d3725',
};
const oldEntryUrls = {
  journey: '../?demo=shallow-journey&seed=55', school: '../?demo=shallow-journey&seed=55&school=1',
  sample: '../?demo=shallow-sample&seed=55', all: '../?demo=all&seed=55', director: '../?demo=director&seed=55',
  life: '../?demo=life-expedition&seed=55&world=whole-seabed', reef: '../?demo=reef-valley-region&seed=55&world=whole-seabed',
  meadow: '../?demo=seagrass-meadow-region&seed=55&world=whole-seabed', kelp: '../?demo=kelp-life&seed=55', deep: '../?demo=deep-life&seed=55',
};

// Verify shipped MPEG frames without requiring an external decoder in cloud checks.
function encodedDuration(bytes) {
  let offset = 0, seconds = 0, frames = 0;
  if (bytes.subarray(0, 3).toString() === 'ID3') {
    assert.ok(bytes.length >= 10);
    const size = ((bytes[6] & 127) << 21) | ((bytes[7] & 127) << 14) | ((bytes[8] & 127) << 7) | (bytes[9] & 127);
    offset = 10 + size + ((bytes[5] & 16) ? 10 : 0);
  }
  while (offset + 4 <= bytes.length) {
    if (bytes.subarray(offset, offset + 3).toString() === 'TAG') break;
    const header = bytes.readUInt32BE(offset), version = (header >>> 19) & 3;
    const rateIndex = (header >>> 10) & 3, bitrateIndex = (header >>> 12) & 15;
    assert.equal(header >>> 21, 0x7ff, `MP3 sync at ${offset}`);
    assert.notEqual(version, 1); assert.equal((header >>> 17) & 3, 1, 'Layer III audio');
    assert.ok(rateIndex < 3 && bitrateIndex > 0 && bitrateIndex < 15);
    const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const size = Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex] / rate) + ((header >>> 9) & 1);
    assert.equal(rate, 32000, 'authorized 32 kHz output');
    assert.equal(bitrates[bitrateIndex], 128, 'authorized 128 kbps output');
    assert.equal((header >>> 6) & 3, 3, 'authorized mono output');
    assert.ok(size >= 4 && offset + size <= bytes.length, 'complete MPEG frame');
    seconds += (version === 3 ? 1152 : 576) / rate; frames++; offset += size;
  }
  assert.ok(frames > 0); assert.ok(bytes.length - offset < 4, 'no truncated frame or unexpected trailer');
  return seconds;
}

test('the complete primer covers 450 seconds in four contiguous chapters plus a final recap', () => {
  assert.equal(OCEAN_PRIMER_SECONDS, 450); assert.equal(manifest.duration, 450);
  assert.deepEqual(OCEAN_PRIMER_CHAPTERS.map(c => [c.id, c.start, c.end]), expectedChapters);
  assert.equal(new Set(OCEAN_PRIMER_CHAPTERS.map(c => c.id)).size, 5);
  assert.equal(OCEAN_PRIMER_CHAPTERS.reduce((sum, c) => sum + c.end - c.start, 0), 450);
  for (const [index, chapter] of OCEAN_PRIMER_CHAPTERS.entries()) {
    assert.equal(oceanPrimerChapter(chapter.start), chapter);
    assert.equal(oceanPrimerChapter(chapter.end - .001), chapter);
    assert.equal(oceanPrimerChapter(chapter.end), OCEAN_PRIMER_CHAPTERS[index + 1] ?? chapter);
  }
  for (const invalid of [NaN, Infinity, -Infinity, '45', undefined]) assert.throws(() => oceanPrimerChapter(invalid), TypeError);
});

test('the original 240-second shallow section retains all recordings and retimes only two opening cues for arrival', () => {
  const shallow = shallowNarrationTimeline(), reused = OCEAN_PRIMER_CLIPS.filter(clip => clip.reused);
  assert.equal(shallow.duration, 240); assert.equal(shallow.clips.length, 10); assert.equal(reused.length, 10);
  assert.deepEqual(reused, shallow.clips.map(clip => ({...clip, id: `primer-shallow-${clip.id}`,
    start: ({'school-entry':52,'school-split':56})[clip.id] ?? clip.start + 45, chapterId: 'shallow', reused: true})));
  assert.equal(manifest.reusedShallow.offset, 45); assert.equal(manifest.reusedShallow.duration, 240);
  assert.equal(manifest.reusedShallow.clipCount, 10);
  assert.deepEqual(shallowNarrationTimeline().clips, shallow.clips, 'composition must not mutate the old timeline');
});

test('six new clips and ten reused clips have unique identities, stay in their chapters and leave real silent gaps', () => {
  assert.equal(OCEAN_PRIMER_CLIPS.length, 16); assert.equal(new Set(OCEAN_PRIMER_CLIPS.map(c => c.id)).size, 16);
  assert.deepEqual(manifest.clips.map(c => c.id), newIds);
  assert.deepEqual(manifest.clips.map(c => c.start), [0, 285, 322, 365, 399, 430]);
  assert.deepEqual(OCEAN_PRIMER_CLIPS.filter(c => !c.reused), manifest.clips.map(c=>({...c,
    start:({'pelagic-whale-breathing':294,'deep-midwater-light':375,'deep-seafloor-food':405})[c.id]??c.start,
    end:c.id==='deep-midwater-light'?392:c.end})));
  for (const [index, clip] of OCEAN_PRIMER_CLIPS.entries()) {
    const chapter = OCEAN_PRIMER_CHAPTERS.find(c => c.id === clip.chapterId);
    assert.ok(chapter, `${clip.id}: missing chapter`);
    assert.ok(Number.isFinite(clip.duration) && clip.duration > 0);
    assert.ok(clip.start >= chapter.start && clip.start + clip.duration <= chapter.end, `${clip.id}: crosses chapter boundary`);
    assert.ok(clip.start + clip.duration <= (OCEAN_PRIMER_CLIPS[index + 1]?.start ?? 450), `${clip.id}: overlaps later speech`);
    if (!clip.reused) assert.ok(clip.start + clip.duration + .15 <= clip.end, `${clip.id}: truncation guard`);
  }
  const cue=id=>OCEAN_PRIMER_CLIPS.find(c=>c.id===id);
  assert.equal(cue('primer-shallow-school-entry').start,52,'observe reef fish after the arrival passage');
  assert.equal(cue('pelagic-whale-breathing').start,294,'observe whale after the open-water arrival');
  assert.equal(cue('deep-midwater-light').start,375,'describe 700 m only after the observation vehicle arrives');
  assert.ok(cue('deep-midwater-light').start+cue('deep-midwater-light').duration<392,
    '700 m narration finishes before the 27-second deep observation journey');
  assert.ok(cue('deep-seafloor-food').start>=400,'describe seabed only after the internal journey');
});

test('new speech retains the authorized model and voice, its exact text, relative subtitles and official source provenance', () => {
  assert.equal(manifest.provider, 'MiniMax'); assert.equal(manifest.synthetic, true); assert.equal(manifest.language, 'zh-CN');
  assert.equal(manifest.model, 'speech-2.8-hd'); assert.equal(manifest.voiceId, 'Chinese (Mandarin)_Gentleman'); assert.equal(manifest.voiceSpeed, 1.05);
  assert.equal(manifest.model, json('src/data/shallowJourneyNarration.json').model);
  assert.equal(manifest.voiceId, json('src/data/shallowJourneyNarration.json').voiceId);
  assert.deepEqual(manifest.sources, script.sources); assert.equal(new Set(manifest.sources.map(s => s.id)).size, manifest.sources.length);
  for (const source of manifest.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:'); assert.ok(['oceanservice.noaa.gov', 'www.noaa.gov', 'www.mbari.org'].includes(url.hostname));
    assert.equal(url.username + url.password + url.search, ''); assert.match(source.accessedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const [index, clip] of manifest.clips.entries()) {
    for (const field of Object.keys(script.clips[index])) assert.deepEqual(clip[field], script.clips[index][field], `${clip.id}: ${field}`);
    assert.ok(Number.isFinite(Date.parse(clip.requestedOn))); assert.ok(Date.parse(clip.generatedOn) >= Date.parse(clip.requestedOn));
    assert.equal(clip.subtitles.map(cue => cue.text).join(''), clip.text, `${clip.id}: spoken text and captions differ`);
    let previousEnd = 0;
    for (const cue of clip.subtitles) {
      assert.ok(typeof cue.text === 'string' && cue.text.length > 0);
      assert.ok(Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= previousEnd && cue.end > cue.start && cue.end <= clip.duration,
        `${clip.id}: invalid or overlapping caption`);
      previousEnd = cue.end;
    }
    for (const sourceId of clip.sourceIds) assert.ok(manifest.sources.some(source => source.id === sourceId));
  }
  assert.match(manifest.scope, /科普展示.*不是全海洋生态预测/);
  assert.match(manifest.scope, /压缩切换/);
});

test('six shipped MP3 files match the manifest, request fingerprint and actual encoded frame duration', () => {
  for (const clip of manifest.clips) {
    assert.match(clip.src, /^audio\/ocean-primer\/[a-z-]+\.mp3$/);
    const bytes = read(`public/${clip.src}`), record = json(`public/${clip.src.replace(/\.mp3$/, '.json')}`);
    assert.equal(bytes.length, clip.bytes); assert.equal(hash(bytes), clip.sha256);
    assert.ok(Math.abs(encodedDuration(bytes) - clip.duration) < .06, `${clip.id}: actual audio length differs from timeline`);
    for (const field of ['id', 'text', 'start', 'src', 'duration', 'bytes', 'sha256', 'fingerprint', 'requestedOn', 'generatedOn', 'subtitles'])
      assert.deepEqual(record[field], clip[field], `${clip.id}: saved metadata differs in ${field}`);
    const request = {model: manifest.model, text: clip.text, stream: false, output_format: 'hex', language_boost: 'Chinese',
      subtitle_enable: true, subtitle_type: 'sentence', voice_setting: {voice_id: manifest.voiceId, speed: manifest.voiceSpeed, vol: 1, pitch: 0},
      audio_setting: {sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1}};
    assert.equal(hash(JSON.stringify(request)), clip.fingerprint, 'fingerprint must match the same authorized voice request');
  }
});

test('all eleven previous shallow recordings and their manifest hashes retain the pre-generation bytes', () => {
  const oldClips = [...json('src/data/shallowJourneyNarration.json').clips, ...json('src/data/shallowSchoolingNarration.json').clips];
  assert.equal(oldClips.length, 11); assert.equal(Object.keys(oldAudioHashes).length, 11);
  assert.deepEqual(oldClips.map(c => c.src).sort(), Object.keys(oldAudioHashes).sort());
  for (const clip of oldClips) {
    const bytes = read(`public/${clip.src}`);
    assert.equal(hash(bytes), oldAudioHashes[clip.src], `${clip.id}: previous paid audio was replaced`);
    assert.equal(clip.sha256, oldAudioHashes[clip.src], `${clip.id}: original manifest hash was rewritten`);
    assert.equal(bytes.length, clip.bytes);
  }
});

test('the guide preserves all ten old entry URLs and adds a parseable local primer without changing the hosted audit', () => {
  const inventory = json('public/overview/inventory.json'), html = read('public/overview/index.html').toString();
  assert.equal(Object.keys(oldEntryUrls).length, 10);
  for (const [id, href] of Object.entries(oldEntryUrls)) {
    assert.equal(inventory.links[id], href, `${id}: old public URL changed`);
    assert.equal(experienceHref(id, {base: '../', seed: '55'}), href);
    assert.ok(html.includes(`href="${href.replaceAll('&', '&amp;')}"`), `${id}: old guide entry was removed`);
  }
  const href = '../?demo=ocean-primer&seed=55', url = new URL(inventory.addition.links.entry, 'https://example.test/ocean-world/overview/');
  assert.equal(inventory.addition.links.entry, href); assert.equal(experienceHref('primer', {base: '../', seed: '55'}), href);
  assert.equal(url.pathname, '/ocean-world/'); assert.deepEqual([...url.searchParams], [['demo', 'ocean-primer'], ['seed', '55']]);
  assert.equal(currentExperience(url.search), 'primer'); assert.ok(html.includes(href.replaceAll('&', '&amp;')));
  assert.equal(inventory.addition.route.seconds, 450); assert.equal(inventory.addition.narration.totalClips, 16);
  assert.equal(inventory.addition.narration.reusedShallowClips, 10); assert.equal(inventory.addition.narration.newClips, 6);
  assert.equal(inventory.entryAudit.majorMenuEntries, 10); assert.equal(inventory.entryAudit.topicLinks, 15);
  assert.equal(inventory.entryAudit.runtimeCommit, '5e4c280'); assert.equal(inventory.currentStage.stage, '05');
});

test('the shipped primer uses existing dependencies and static local narration without credentials or provider endpoints', () => {
  const pkg = json('package.json');
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@vitejs/plugin-react', 'react', 'react-dom', 'three', 'three-mesh-bvh', 'vite'].sort());
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /\.env|minimax_api_key|authorization|bearer\s|\b[a-z]:[\\/]|\/Users\/|\/home\//i);
  assert.doesNotMatch(serialized, /api\.minimax|\/v1\/t2a|access_token|api_key|password/i);
  const runtimeFiles = ['src/OceanPrimerApp.jsx', 'src/oceanPrimer.js', 'src/world/OceanPrimerSurface.js', 'src/world/OceanPrimerPelagic.js', 'src/world/OceanPrimerDeep.js'];
  for (const file of runtimeFiles) {
    const source = read(file).toString();
    assert.doesNotMatch(source, /\.env\.minimax|MINIMAX_API_KEY|api\.minimax|\/v1\/t2a|Bearer\s/);
    for (const [, specifier] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g))
      assert.ok(specifier.startsWith('.') || /^(react|three)(\/|$)/.test(specifier), `${file}: unexpected external runtime dependency ${specifier}`);
  }
});
