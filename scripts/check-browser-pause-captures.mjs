import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [firstPrefix,secondPrefix,outputName]=process.argv.slice(2);
for(const prefix of [firstPrefix,secondPrefix])assert.match(prefix||'',/^(reef|kelp|deep)-\d+$/);
assert.match(outputName||'',/^[a-z][a-z0-9-]{0,80}$/);
const directory='output/validation/telemetry/';
const files=await readdir(directory);
const frames=await Promise.all([firstPrefix,secondPrefix].map(async prefix=>{
  const matches=files.filter(file=>file.startsWith(prefix+'-metadata-')&&file.endsWith('.json'));
  assert.equal(matches.length,1,'Each requested capture must have exactly one paired metadata file.');
  const file=directory+matches[0],data=JSON.parse(await readFile(file,'utf8'));
  const bytes=await readFile(data.image);
  return {file,data,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
}));
const [first,last]=frames,[a,b]=frames.map(frame=>frame.data.snapshot);
assert.equal(a.runId,b.runId);
assert.ok(a.paused&&b.paused);
assert.ok(b.wallSeconds-a.wallSeconds>=10,'Observe paused rendering for at least ten actual seconds.');
assert.equal(a.visualTimeSec,b.visualTimeSec);
assert.deepEqual(a.camera,b.camera);
assert.deepEqual(a.environment,b.environment);
assert.deepEqual(a.metrics,b.metrics);
assert.deepEqual(a.agents,b.agents);
assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
assert.equal(a.resourceInventory.identitiesUnchanged,true);
assert.equal(b.resourceInventory.identitiesUnchanged,true);
assert.deepEqual(a.resourceInventory.counts,b.resourceInventory.counts);
assert.equal(first.sha256,last.sha256,'The paused canvas pixels must produce identical PNG bytes at the same camera.');
const report={schema:'tidal-actual-browser-pause-v1',checkedAt:new Date().toISOString(),passed:true,
  biomeId:a.biomeId,runId:a.runId,captures:frames.map(frame=>({image:frame.data.image,metadata:frame.file,pngSha256:frame.sha256,bytes:frame.bytes.length})),
  actualPausedIntervalSeconds:b.wallSeconds-a.wallSeconds,modelTimeSec:a.metrics.timeSec,visualTimeSec:a.visualTimeSec,
  canvasBytesIdentical:true,agentsAndMetricsIdentical:true,cpuAssetIdentitiesUnchanged:true,
  initializationMs:a.initializationMs,prewarm:a.gpuWarmup,viewport:a.viewport,
  limits:['Two real UI captures at a fixed camera; this is not a continuous pixel stream or GPU memory profiler.',
    'Development preview evidence for pause behavior; frozen-build performance and visual quality remain separate gates.']};
await writeFile('output/validation/'+outputName+'.json',JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
