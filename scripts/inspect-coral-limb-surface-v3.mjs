import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inspectCoralLimbSurfaceV3 } from './lib/inspect-coral-limb-surface-v3.mjs';
const revision=process.argv[2]??'v3';assert.ok(['v3','v3b','v3c'].includes(revision));
const root=new URL('../',import.meta.url),output=new URL(`output/validation/coral-limb-surface-inspection-${revision}.json`,root),files=['src/world/organisms.js','src/species.js','scripts/lib/inspect-coral-limb-surface-v3.mjs','scripts/inspect-coral-limb-surface-v3.mjs','tests/coral-limb-surface.test.mjs','output/validation/organisms-before-coral-limb-v3.mjs','output/validation/coral-limb-before-v3.json'];
try{await readFile(output);throw new Error('Refusing existing geometry report');}catch(e){if(e.code!=='ENOENT')throw e;}
const receipts=async()=>Object.fromEntries(await Promise.all(files.map(async path=>{const b=await readFile(new URL(path,root));return[path,{bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}];})));
const before=await receipts(),report=inspectCoralLimbSurfaceV3();
const tests=spawnSync(process.execPath,['--test','tests/coral-limb-surface.test.mjs'],{cwd:root.pathname.replace(/^\/(\w:)/,'$1'),encoding:'utf8',timeout:60000});assert.equal(tests.status,0,tests.stdout+tests.stderr);assert.match(tests.stdout,/# pass 3\b/);assert.match(tests.stdout,/# fail 0\b/);
assert.deepEqual(await receipts(),before);Object.assign(report,{generatedAtUtc:new Date().toISOString(),passed:true,sourceFiles:before,sourceFilesUnchangedBeforeAfter:true,tests:{passed:3,failed:0,stdout:tests.stdout,stderr:tests.stderr}});
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,variants:report.rows.length,named:report.rows.filter(r=>r.id.startsWith('named/')).map(r=>({id:r.id,triangles:r.triangles,addedTriangles:r.triangleChange,shoulders:r.roundedShoulders})),maximumEnvelopeDeltaM:Math.max(...report.rows.map(r=>r.boundsMaximumAbsoluteDeltaM)),minimumOutwardDot:Math.min(...report.rows.filter(r=>r.minimumOutwardShaftDot!=null).map(r=>r.minimumOutwardShaftDot)),maximumInwardDot:Math.max(...report.rows.filter(r=>r.maximumInwardCupDot!=null).map(r=>r.maximumInwardCupDot)),output:`output/validation/coral-limb-surface-inspection-${revision}.json`},null,2));
