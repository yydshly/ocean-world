import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const phase = process.argv[2];
if (!['before', 'after'].includes(phase) || process.argv.length !== 3) throw new Error('Pass before or after.');
const output = `output/validation/review-four-served-file-checks-${phase}.json`;
const manifestPath = 'output/validation/review-four-build-manifest.json';
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.directory !== 'dist/review-four' || manifest.files.length !== 22) throw new Error('Unexpected frozen manifest.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'http://127.0.0.1:4179';
const records = [];
for (const item of manifest.files) {
  const location = path.resolve(manifest.directory, item.file);
  if (!location.startsWith(path.resolve(manifest.directory) + path.sep)) throw new Error('Manifest path escapes frozen directory.');
  const disk = await readFile(location);
  const response = await fetch(`${origin}/${item.file}`, { redirect: 'error' });
  const served = Buffer.from(await response.arrayBuffer());
  const record = {
    file: item.file,
    expectedBytes: item.bytes, expectedSha256: item.sha256,
    diskBytes: disk.length, diskSha256: sha(disk),
    httpStatus: response.status, servedBytes: served.length, servedSha256: sha(served),
  };
  record.passed = record.diskBytes === item.bytes && record.servedBytes === item.bytes &&
    record.diskSha256 === item.sha256 && record.servedSha256 === item.sha256 && response.status === 200;
  records.push(record);
}
const capture = await fetch(`${origin}/__reef-capture`);
const captureBody = await capture.text();
const captureEndpoint = { method: 'GET', status: capture.status, contentType: capture.headers.get('content-type'), body: captureBody };
const report = {
  schema: 'tidal-served-frozen-build-check-v1', checkedAt: new Date().toISOString(), phase,
  origin, manifest: manifestPath, manifestSha256: sha(manifestBytes), frozenDirectory: manifest.directory,
  files: records, captureEndpoint,
  passed: records.every(record => record.passed) && capture.status === 405 && captureEndpoint.contentType?.includes('application/json'),
  scope: 'Exact byte/hash agreement between all 22 frozen disk files, their manifest and independent loopback HTTP reads at this checkpoint. This does not establish continuous file identity between checkpoints.',
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, checkedAt: report.checkedAt, manifestSha256: report.manifestSha256, fileCount: records.length, passed: report.passed, captureEndpoint }, null, 2));
if (!report.passed) process.exitCode = 1;
