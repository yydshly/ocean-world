import assert from 'node:assert/strict';
import { readFile,writeFile,access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectReefLandscapeFocusV1 } from './lib/inspect-reef-landscape-focus-v1.mjs';
const output=process.argv[2]??'output/validation/reef-landscape-focus-v1.json';
if(process.argv.length>3||!/^output\/validation\/[a-z0-9-]+\.json$/.test(output))throw new Error('Pass an optional fresh output/validation/*.json path');
try{await access(output);throw new Error(`Preserving existing ${output}`);}catch(error){if(error.code!=='ENOENT')throw error;}
const paths=['scripts/inspect-reef-landscape-focus-v1.mjs','scripts/lib/inspect-reef-landscape-focus-v1.mjs','src/world/ReefWorld.js','src/world/reefLandscapeDetail.js','src/world/reefCoralMaterial.js','src/world/organisms.js','src/world/reefSpatialQueries.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const sourceSha256Before=await hashes();
const report=inspectReefLandscapeFocusV1();
const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,sourceSha256Before,'Source changed during inspection');
await writeFile(output,JSON.stringify({...report,generatedAtUtc:new Date().toISOString(),cliSourceSha256Before:sourceSha256Before,cliSourceSha256After:sourceSha256After},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,variants:report.rows.length,linearPaths:report.rows.reduce((sum,r)=>sum+r.lineCases.length,0),output}));
