import { readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const directory = 'output/validation/videos';
const videos = readdirSync(directory).filter(name => name.endsWith('.webm'));
const records = videos.map(name => {
  const result = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height:packet=pts_time,duration_time', '-of', 'json', join(directory, name)],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const packets = result.packets.filter(packet => Number.isFinite(Number(packet.pts_time)));
  const first = Number(packets[0]?.pts_time), last = packets.at(-1);
  const end = Number(last?.pts_time) + (Number(last?.duration_time) || 0);
  return { file: `videos/${name}`, ...result.streams[0], framePackets: packets.length,
    firstTimestampSec: first, lastTimestampSec: Number(last?.pts_time),
    packetSpanSec: end - first, measuredMeanFramesPerSec: packets.length / (end - first) };
});
writeFileSync('output/validation/video-metadata.json', JSON.stringify({
  schema: 'tidal-local-video-inspection-v1', inspectedAt: new Date().toISOString(), records,
  notes: ['Duration is the span of encoded packet timestamps. MediaRecorder WebM files may omit container duration.',
    'Video dimensions and encoded timestamps prove recording properties, not the biological interpretation of every visible action.']
}, null, 2));
console.log(JSON.stringify(records, null, 2));
