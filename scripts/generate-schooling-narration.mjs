// Local generation only. No credentials or provider calls enter the website.
// Five short, independently saved outputs; uncertain paid requests are never retried.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(await fs.readFile(path.join(root, 'scripts/narration/shallow-schooling.zh-CN.json'), 'utf8'));
const envPath = process.argv[2];
if (!envPath) throw new Error('Usage: node scripts/generate-schooling-narration.mjs <external-env-file> [clip-id]');
if (script.duration !== 60 || script.clips.length !== 5 || script.clips.some((clip, i) => clip.start !== [0, 8, 28, 36, 46][i])) {
  throw new Error('Expected the five finite schooling observation windows');
}
const env = {};
for (const line of (await fs.readFile(envPath, 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?(MINIMAX_API_KEY|MINIMAX_API_BASE)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^("|')(.*)\1$/, '$2');
}
if (!env.MINIMAX_API_KEY || !env.MINIMAX_API_BASE) throw new Error('MiniMax configuration is incomplete');
const base = new URL(env.MINIMAX_API_BASE);
if (base.protocol !== 'https:' || !['api.minimaxi.com', 'api.minimax.io', 'api.minimax.cn'].includes(base.hostname) || base.username || base.password || base.search) {
  throw new Error('Expected a direct official MiniMax HTTPS endpoint');
}
base.pathname = '/v1/t2a_v2';
base.hash = '';
const output = path.join(root, 'public/audio/shallow-schooling');
await fs.mkdir(output, {recursive: true});
await fs.mkdir(path.join(root, 'src/data'), {recursive: true});
const manifest = {provider: 'MiniMax', synthetic: true, language: script.language, model: script.model, voiceId: script.voiceId, duration: script.duration, clips: []};
const selected = process.argv[3];
for (const [index, clip] of script.clips.entries()) {
  const end = script.clips[index + 1]?.start ?? script.duration;
  const request = {
    model: script.model, text: clip.text, stream: false, output_format: 'hex',
    language_boost: 'Chinese', subtitle_enable: true, subtitle_type: 'sentence',
    voice_setting: {voice_id: script.voiceId, speed: script.voiceSpeed, vol: 1, pitch: 0},
    audio_setting: {sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1},
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const metaPath = path.join(output, `${clip.id}.json`);
  const audioPath = path.join(output, `${clip.id}.mp3`);
  let record;
  try {
    record = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    if (createHash('sha256').update(await fs.readFile(audioPath)).digest('hex') !== record.sha256) throw new Error('Cached audio differs');
  } catch { record = null; }
  if (record?.fingerprint !== fingerprint) {
    if (selected && selected !== clip.id) continue;
    let response;
    try {
      response = await fetch(base, {
        method: 'POST', headers: {Authorization: `Bearer ${env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(request), signal: AbortSignal.timeout(90000),
      });
    } catch { throw new Error(`Narration request failed or timed out for ${clip.id}; no retry made`); }
    if (!response.ok) throw new Error(`MiniMax HTTP ${response.status} for ${clip.id}`);
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`Invalid MiniMax response for ${clip.id}; no retry made`); }
    if (result.base_resp?.status_code !== 0) throw new Error(`MiniMax status ${result.base_resp?.status_code ?? 'missing'} for ${clip.id}`);
    const hex = result.data?.audio;
    if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) throw new Error(`Invalid audio for ${clip.id}`);
    const audio = Buffer.from(hex, 'hex');
    const duration = result.extra_info?.audio_length / 1000;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${clip.id}`);
    // Persist the paid output immediately, before downloading optional subtitle data.
    await fs.writeFile(audioPath, audio);
    let subtitles = [{start: 0, end: duration, text: clip.text}];
    record = {...clip, src: `audio/shallow-schooling/${clip.id}.mp3`, duration, bytes: audio.length,
      sha256: createHash('sha256').update(audio).digest('hex'), fingerprint, generatedOn: new Date().toISOString(), subtitles};
    await fs.writeFile(metaPath, JSON.stringify(record, null, 2) + '\n');
    if (result.data.subtitle_file) {
      try {
        const subtitleUrl = new URL(result.data.subtitle_file);
        if (subtitleUrl.protocol !== 'https:') throw new Error('Subtitle URL must use HTTPS');
        const subtitleResponse = await fetch(subtitleUrl, {signal: AbortSignal.timeout(20000)});
        if (!subtitleResponse.ok) throw new Error('Subtitle download failed');
        const data = await subtitleResponse.json();
        const rows = Array.isArray(data) ? data : data.subtitles ?? data.subtitle ?? [];
        const cues = rows.map(row => ({start: row.time_begin / 1000, end: row.time_end / 1000, text: row.text}))
          .filter(row => Number.isFinite(row.start) && row.start >= 0 && row.end > row.start && row.end <= duration + 0.25 && typeof row.text === 'string');
        if (cues.length) subtitles = cues;
      } catch { console.warn(`${clip.id}: subtitles unavailable; retained audio and whole-paragraph caption`); }
    }
    record = {...record, subtitles};
    await fs.writeFile(metaPath, JSON.stringify(record, null, 2) + '\n');
  }
  if (clip.start + record.duration > end) throw new Error(`Narration exceeds its observation window: ${clip.id}; saved output retained, no retry made`);
  manifest.clips.push({...record, ...clip});
  console.log(`${clip.id}: ${record.duration.toFixed(3)}s, ${record.bytes} bytes, ${record.subtitles.length} subtitle cues; ends ${(clip.start + record.duration).toFixed(3)}s before ${end}s`);
}
if (manifest.clips.length === script.clips.length) {
  await fs.writeFile(path.join(root, 'src/data/shallowSchoolingNarration.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Saved 5 clips; ${manifest.clips.reduce((n, c) => n + c.duration, 0).toFixed(3)} seconds of narration`);
}
