// Offline, finite generation. No credentials or provider calls enter the website.
// Six new clips only; all existing shallow recordings remain untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(await fs.readFile(path.join(root, 'scripts/narration/ocean-primer.zh-CN.json'), 'utf8'));
const output = path.join(root, 'public/audio/ocean-primer');
const receiptDirectory = path.join(root, 'output/narration/ocean-primer');
const manifestPath = path.join(root, 'src/data/oceanPrimerNarration.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const starts = [0, 285, 322, 365, 399, 430];
const ends = [45, 322, 365, 389, 430, 450];
const expectedIds = ['surface-ocean-scale', 'pelagic-whale-breathing', 'pelagic-dolphin-space', 'deep-midwater-light', 'deep-seafloor-food', 'recap-three-clues'];

if (script.duration !== 450 || script.clips.length !== 6 || script.model !== 'speech-2.8-hd' ||
    script.voiceId !== 'Chinese (Mandarin)_Gentleman' || script.voiceSpeed !== 1.05 ||
    script.clips.some((clip, i) => clip.id !== expectedIds[i] || clip.start !== starts[i] || clip.end !== ends[i] ||
      typeof clip.text !== 'string' || !clip.text.length || clip.text.length > 180 ||
      !Array.isArray(clip.sourceIds) || clip.sourceIds.some(id => !script.sources.some(source => source.id === id)))) {
  throw new Error('Expected six bounded primer windows with the existing authorized voice and model');
}

const requestFor = clip => ({
  model: script.model, text: clip.text, stream: false, output_format: 'hex',
  language_boost: 'Chinese', subtitle_enable: true, subtitle_type: 'sentence',
  voice_setting: {voice_id: script.voiceId, speed: script.voiceSpeed, vol: 1, pitch: 0},
  audio_setting: {sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1},
});
const exists = async filename => {
  try { await fs.access(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const validateRecord = (clip, record, audio) => {
  if (record.fingerprint !== digest(JSON.stringify(requestFor(clip))) || record.sha256 !== digest(audio) ||
      record.bytes !== audio.length || record.text !== clip.text || !Number.isFinite(record.duration) || record.duration <= 0 ||
      clip.start + record.duration + 0.15 > clip.end || !Array.isArray(record.subtitles) || !record.subtitles.length ||
      record.subtitles.map(cue => cue.text).join('') !== clip.text ||
      record.subtitles.some((cue, i) => typeof cue.text !== 'string' || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
        cue.start < 0 || cue.end <= cue.start || cue.end > record.duration ||
        (i > 0 && cue.start < record.subtitles[i - 1].end))) {
    throw new Error(`Saved output needs manual review for ${clip.id}; no replacement request made`);
  }
};
const readRecord = async clip => {
  const audioPath = path.join(output, `${clip.id}.mp3`);
  const metaPath = path.join(output, `${clip.id}.json`);
  const [hasAudio, hasMeta] = await Promise.all([exists(audioPath), exists(metaPath)]);
  if (!hasAudio && !hasMeta) return null;
  if (!hasAudio || !hasMeta) throw new Error(`Incomplete saved output for ${clip.id}; no retry made`);
  const [audio, metadata] = await Promise.all([fs.readFile(audioPath), fs.readFile(metaPath, 'utf8')]);
  let record;
  try { record = JSON.parse(metadata); }
  catch { throw new Error(`Invalid saved metadata for ${clip.id}; no replacement request made`); }
  validateRecord(clip, record, audio);
  return record;
};

const mode = process.argv[2];
if (mode === '--plan') {
  console.log(JSON.stringify({model: script.model, voiceId: script.voiceId, newRequestLimit: 6,
    characters: script.clips.reduce((sum, clip) => sum + clip.text.length, 0),
    clips: script.clips.map(clip => ({id: clip.id, start: clip.start, end: clip.end, characters: clip.text.length})),
    existingShallowAudio: 'unchanged; no requests', retryPolicy: 'stop on any uncertain paid output; no automatic retries'}, null, 2));
  process.exit(0);
}
if (!mode) throw new Error('Usage: node scripts/generate-ocean-primer-narration.mjs --plan | --validate | <external-env-file> [clip-id]');
const selected = process.argv[3];
if (selected && !expectedIds.includes(selected)) throw new Error('Unknown clip id; no request made');

// Resolve all saved outputs before reading a key or making any paid request.
const cached = new Map();
for (const clip of script.clips) cached.set(clip.id, await readRecord(clip));
let base, apiKey;
if (mode !== '--validate' && script.clips.some(clip => !cached.get(clip.id) && (!selected || selected === clip.id))) {
  const envPath = path.resolve(mode);
  const relative = path.relative(root, envPath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Credentials must stay outside the repository');
  const env = {};
  for (const line of (await fs.readFile(envPath, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(MINIMAX_API_KEY|MINIMAX_API_BASE)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^("|')(.*)\1$/, '$2');
  }
  if (!env.MINIMAX_API_KEY || !env.MINIMAX_API_BASE) throw new Error('MiniMax configuration is incomplete');
  try { base = new URL(env.MINIMAX_API_BASE); }
  catch { throw new Error('Expected a direct official MiniMax HTTPS endpoint'); }
  if (base.protocol !== 'https:' || !['api.minimaxi.com', 'api.minimax.io', 'api.minimax.cn'].includes(base.hostname) ||
      base.username || base.password || base.search || base.hash || base.port) throw new Error('Expected a direct official MiniMax HTTPS endpoint');
  base.pathname = '/v1/t2a_v2';
  apiKey = env.MINIMAX_API_KEY;
  await fs.mkdir(output, {recursive: true});
  await fs.mkdir(receiptDirectory, {recursive: true});
}

const manifest = {provider: 'MiniMax', synthetic: true, language: script.language, model: script.model,
  voiceId: script.voiceId, voiceSpeed: script.voiceSpeed, duration: script.duration, scope: script.scope,
  authorship: script.authorship, reusedShallow: script.reusedShallow, sources: script.sources, clips: []};
let requests = 0;
for (const clip of script.clips) {
  let record = cached.get(clip.id);
  if (!record) {
    if (mode === '--validate') throw new Error(`Missing saved output for ${clip.id}`);
    if (selected && selected !== clip.id) continue;
    const request = requestFor(clip), fingerprint = digest(JSON.stringify(request));
    const receiptPath = path.join(receiptDirectory, `${clip.id}.request.json`);
    if (await exists(receiptPath)) throw new Error(`A request receipt already exists for ${clip.id}; no retry made`);
    if (++requests > 6) throw new Error('The six-request boundary was reached');
    const requestedOn = new Date().toISOString();
    // Exclusive receipt prevents a second process or later rerun duplicating an uncertain paid request.
    await fs.writeFile(receiptPath, JSON.stringify({clipId: clip.id, fingerprint, requestedOn, status: 'requested'}, null, 2) + '\n', {flag: 'wx'});
    let response;
    try {
      response = await fetch(base, {method: 'POST', headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(request), signal: AbortSignal.timeout(90000)});
    } catch { throw new Error(`Narration request failed or timed out for ${clip.id}; no retry made`); }
    if (!response.ok) throw new Error(`MiniMax HTTP ${response.status} for ${clip.id}; no retry made`);
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`Invalid MiniMax response for ${clip.id}; no retry made`); }
    if (result.base_resp?.status_code !== 0) throw new Error(`MiniMax status ${result.base_resp?.status_code ?? 'missing'} for ${clip.id}; no retry made`);
    const hex = result.data?.audio;
    if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) throw new Error(`Invalid audio for ${clip.id}; no retry made`);
    const audio = Buffer.from(hex, 'hex'), duration = result.extra_info?.audio_length / 1000;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${clip.id}; no retry made`);
    const generatedOn = new Date().toISOString();
    // Save paid bytes and usable exact-text captions before any optional download or boundary check.
    record = {...clip, src: `audio/ocean-primer/${clip.id}.mp3`, duration, bytes: audio.length, sha256: digest(audio),
      fingerprint, requestedOn, generatedOn, subtitles: [{start: 0, end: duration, text: clip.text}], subtitleMode: 'whole-paragraph'};
    await fs.writeFile(path.join(output, `${clip.id}.mp3`), audio, {flag: 'wx'});
    await fs.writeFile(path.join(output, `${clip.id}.json`), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
    if (result.data.subtitle_file) {
      try {
        const url = new URL(result.data.subtitle_file);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected HTTPS subtitles');
        const subtitleResponse = await fetch(url, {signal: AbortSignal.timeout(20000)});
        if (!subtitleResponse.ok) throw new Error('Subtitle download failed');
        const data = await subtitleResponse.json();
        const rows = Array.isArray(data) ? data : data.subtitles ?? data.subtitle ?? [];
        const cues = rows.map(row => ({start: row.time_begin / 1000, end: Math.min(duration, row.time_end / 1000), text: row.text}));
        const candidate = {...record, subtitles: cues};
        validateRecord(clip, candidate, audio);
        record = {...candidate, subtitleMode: 'provider-sentence-exact-text'};
      } catch { console.warn(`${clip.id}: exact sentence subtitles unavailable; retained paid audio and exact whole-paragraph caption`); }
    }
    await fs.writeFile(path.join(output, `${clip.id}.json`), JSON.stringify(record, null, 2) + '\n');
    await fs.writeFile(receiptPath, JSON.stringify({clipId: clip.id, fingerprint, requestedOn, generatedOn,
      status: 'saved', sha256: record.sha256, bytes: record.bytes, duration}, null, 2) + '\n');
    validateRecord(clip, record, audio);
  }
  manifest.clips.push({...record, ...clip});
  console.log(`${clip.id}: ${record.duration.toFixed(3)}s, ${record.bytes} bytes, ${record.subtitles.length} exact-text subtitle cues; ends ${(clip.start + record.duration).toFixed(3)}s before ${clip.end}s`);
}
if (manifest.clips.length === 6) {
  if (mode === '--validate') {
    const saved = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(manifest)) throw new Error('Manifest differs from saved clip records and source script');
    console.log(`Validated six shipped clips; ${manifest.clips.reduce((sum, clip) => sum + clip.duration, 0).toFixed(3)}s new narration; zero API calls`);
  } else {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Saved six clips; ${manifest.clips.reduce((sum, clip) => sum + clip.duration, 0).toFixed(3)}s new narration; ${requests} requests in this run`);
  }
}
