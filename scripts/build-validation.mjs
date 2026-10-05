import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Each validation build has a new name. Failed or successful attempts remain
// available for inspection; this command never empties an existing directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const name = process.argv[2];
if (process.argv.length !== 3 || !/^(?:review|validation)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || '')) {
  throw new Error('Pass a fresh build name, e.g. npm run build:validation -- review-next.');
}
const relativeDirectory = `dist/${name}`;
const manifest = `output/validation/${name}-build-manifest.json`;
const receipt = `output/validation/${name}-build-receipt.json`;
for (const relative of [relativeDirectory, manifest, receipt]) {
  try { await access(path.join(root, relative)); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  throw new Error(`Preserving existing ${relative}; choose a new build name.`);
}
const startedAt = new Date().toISOString();
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', relativeDirectory], {
  cwd: root, stdio: 'inherit', env: { ...process.env, VITE_VALIDATION_CAPTURE: '1' },
});
const assets = path.join(root, relativeDirectory, 'assets');
const bundleName = (await readdir(assets)).find(file => /^index-.*\.js$/.test(file));
if (!bundleName) throw new Error('No application bundle; preserve this attempt and investigate.');
const bundle = await readFile(path.join(assets, bundleName));
const text = bundle.toString('utf8');
const compiledCapture = text.includes('__reef-capture') && text.includes('telemetrySamples.push');
if (!compiledCapture) throw new Error('Capture/telemetry code was not compiled; this build cannot start a recorded soak.');
execFileSync(process.execPath, ['scripts/record-build-manifest.mjs', name, manifest], { cwd: root, stdio: 'inherit' });
await writeFile(path.join(root, receipt), JSON.stringify({
  schema: 'tidal-validation-build-receipt-v1', startedAt, finishedAt: new Date().toISOString(),
  directory: relativeDirectory, manifest, environment: { VITE_VALIDATION_CAPTURE: '1' },
  applicationBundle: `assets/${bundleName}`, applicationBundleSha256: createHash('sha256').update(bundle).digest('hex'),
  compiledCapture,
  scope: 'Build-time capture preflight only. Verify a real saved screenshot and automatic telemetry in the browser before counting a continuous run.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Recorded validation build: ${relativeDirectory}. Serve it with scripts/serve-validation-build.mjs ${name} <port>.`);
