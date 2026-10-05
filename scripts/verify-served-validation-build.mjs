import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const [name, portText, phase] = process.argv.slice(2), port = Number(portText);
if (process.argv.length !== 5 || !/^(?:review|validation)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || '') ||
  !Number.isInteger(port) || port < 1024 || port > 65535 || !['before', 'after'].includes(phase)) {
  throw new Error('Pass build name, loopback port and before/after.');
}
const output = `output/validation/${name}-served-file-checks-${phase}.json`;
try { await access(output); throw new Error(`Preserving existing ${output}.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const manifestPath = `output/validation/${name}-build-manifest.json`, manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes), directory = path.resolve('dist', name);
if (path.resolve(manifest.directory) !== directory || !manifest.files?.length) throw new Error('Unexpected frozen manifest.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), origin = `http://127.0.0.1:${port}`, records = [];
for (const item of manifest.files) {
  const location = path.resolve(directory, item.file);
  if (!location.startsWith(directory + path.sep)) throw new Error('Manifest file escapes its frozen directory.');
  const disk = await readFile(location), response = await fetch(`${origin}/${item.file}`, { redirect: 'error' });
  const served = Buffer.from(await response.arrayBuffer());
  const record = { file: item.file, expectedBytes: item.bytes, expectedSha256: item.sha256,
    diskBytes: disk.length, diskSha256: sha(disk), httpStatus: response.status,
    servedBytes: served.length, servedSha256: sha(served) };
  record.passed = disk.length === item.bytes && served.length === item.bytes &&
    record.diskSha256 === item.sha256 && record.servedSha256 === item.sha256 && response.status === 200;
  records.push(record);
}
const capture = await fetch(`${origin}/__reef-capture`), captureEndpoint = { method: 'GET', status: capture.status,
  contentType: capture.headers.get('content-type'), body: await capture.text() };
const report = { schema: 'tidal-served-frozen-build-check-v1', checkedAt: new Date().toISOString(), phase,
  origin, manifest: manifestPath, manifestSha256: sha(manifestBytes), frozenDirectory: manifest.directory,
  files: records, captureEndpoint,
  passed: records.every(record => record.passed) && capture.status === 405 && captureEndpoint.contentType?.includes('application/json'),
  scope: `Exact byte/hash agreement between ${records.length} frozen files, their manifest and loopback HTTP at this checkpoint; not continuous file identity.` };
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, manifestSha256: report.manifestSha256, fileCount: records.length, passed: report.passed }));
if (!report.passed) process.exitCode = 1;
