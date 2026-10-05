import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { inspectCoralLowSurfaceV4 } from './lib/inspect-coral-low-surface-v4.mjs';
const report=inspectCoralLowSurfaceV4();
const revision=process.argv[2]??'v4a';assert.ok(['v4a'].includes(revision));
await writeFile(new URL(`../output/validation/coral-low-surface-inspection-${revision}.json`,import.meta.url),JSON.stringify({...report,generatedAtUtc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sourceSha256:report.sourceSha256,rows:report.rows.length,low:report.rows.filter(r=>r.compactCups).map(r=>({id:r.id,triangles:r.triangles,shoulders:r.compactCups,bboxDelta:r.boundsMaximumAbsoluteDeltaM,minBulge:r.minimumShoulderRadiusBulgeFraction}))},null,2));
