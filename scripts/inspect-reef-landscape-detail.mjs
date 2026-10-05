import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectReefLandscapeDetail } from './lib/inspect-reef-landscape-detail.mjs';
const output = process.argv[2];
if (process.argv.length !== 3 || !/^output\/validation\/[a-z0-9-]+\.json$/.test(output ?? '')) throw new Error('Pass a fresh output/validation/*.json path');
try { await access(output); throw new Error(`Preserving existing ${output}`); } catch(error) { if (error.code !== 'ENOENT') throw error; }
const paths = ['scripts/inspect-reef-landscape-detail.mjs','scripts/lib/inspect-reef-landscape-detail.mjs','src/world/reefLandscapeDetail.js','src/world/reefCoralMaterial.js','src/world/organisms.js','src/world/ReefWorld.js'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const before=await hashes(), report=inspectReefLandscapeDetail(), after=await hashes();
assert.deepEqual(after,before,'Source changed during inspection');
await writeFile(output,JSON.stringify({...report,observedAtUtc:new Date().toISOString(),sourceSha256:before,sourceSha256After:after},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,variants:report.rows.length,output}));
