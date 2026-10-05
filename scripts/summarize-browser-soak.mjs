import { readdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assessSoakResources, assessObservationHistory } from './lib/soak-assessment.mjs';
const root=path.resolve('output/validation/telemetry'),runId=process.argv[2];
const outputName=process.argv[3]||'browser-soak-summary';
const allowPreallocatedLod=process.argv[4]==='--preallocated-lod-warmup';
const requirePrewarmedResources=process.argv[4]==='--require-prewarmed-resources';
if(process.argv[4]&&!allowPreallocatedLod&&!requirePrewarmedResources)throw new Error('Unknown resource-count assessment option.');
if(!/^[a-z][a-z0-9-]{0,80}$/.test(outputName))throw new Error('Invalid report file name.');
if(!/^browser-run-\d+$/.test(runId||''))throw new Error('Pass the observed browser run ID.');
const files=(await readdir(root)).filter(file=>file.startsWith(runId+'-')&&file.endsWith('.json')).sort();
if(!files.length)throw new Error('No captured browser telemetry for this run.');
const source=files.at(-1),report=JSON.parse(await readFile(path.join(root,source),'utf8')),samples=report.samples;
const numbers=[];const flatten=value=>{if(typeof value==='number')numbers.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(flatten);};
samples.forEach(s=>flatten(s.metrics));
const violations=[];
if(report.wallSeconds<1200)violations.push('Less than 20 actual wall minutes.');
if(samples.length<40)violations.push('Fewer than forty thirty-second checkpoints.');
const sampleGaps=samples.map((sample,index)=>index?sample.wallSeconds-samples[index-1].wallSeconds:sample.wallSeconds);
if(sampleGaps.some(seconds=>seconds>45))violations.push('A telemetry gap exceeds 45 actual seconds; continuous rendering is not established.');
if(report.errors.length)violations.push('Runtime errors recorded.');
if(numbers.some(n=>!Number.isFinite(n)))violations.push('Nonfinite numeric metrics.');
if(samples.some(s=>s.paused||s.speed!==1||s.visibility!=='visible'))violations.push('Some interval samples were paused, accelerated or hidden.');
const resourceKeys=report.biomeId==='deep'?['surfaceDetritus','benthicAnimalFood','suspendedPrey']:report.biomeId==='kelp'?['algae','smallPrey','detritus']:['algae','plankton','detritus','microfauna'];
const requiredNumericKeys=[...resourceKeys,'timeSec','averageEnergy','population','resourceBudgetError'];
if(samples.some(s=>requiredNumericKeys.some(key=>!Number.isFinite(s.metrics[key]))))violations.push('A required metric is missing, null or nonfinite.');
if(samples.some(s=>resourceKeys.some(key=>s.metrics[key]<0)||Math.abs(s.metrics.resourceBudgetError)>1e-6))violations.push('Resource or ledger invariant violated.');
const geometryCounts=[...new Set(samples.map(s=>s.memory?.geometries))];
let lodUploadWarmup=null;
if(allowPreallocatedLod&&geometryCounts.length>1){
  const evidenceFile='output/validation/world-integration-smoke.json';
  const evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
  // This opt-in assessment is only for the audited fish-LOD implementation:
  // both detail trees exist before the first render and switching changes
  // visibility. Preserve the strict report as well; do not silently erase a
  // GPU resource-count change or classify arbitrary growth as warming up.
  for(const file of ['src/world/ReefWorld.js','src/world/organisms.js']){
    const hash=createHash('sha256').update(await readFile(file)).digest('hex');
    if(evidence.sourceSha256[file]!==hash)throw new Error('LOD allocation evidence does not match current source: '+file);
  }
  const audit=evidence.biomes?.reef;
  if(evidence.status!=='passed'||!audit||audit.initialGeometry.geometryObjects!==audit.finalGeometry.geometryObjects)
    throw new Error('No passing, unchanged CPU geometry-tree evidence for this source.');
  const transitions=samples.filter((sample,index)=>index===0||sample.memory.geometries!==samples[index-1].memory.geometries);
  const lastChange=transitions.at(-1).wallSeconds;
  const monotonic=samples.every((sample,index)=>!index||sample.memory.geometries>=samples[index-1].memory.geometries);
  // At most 48 cached fish geometries (six species, eight visible/detail
  // geometries each) may first upload. Require early bounded change followed
  // by at least fifteen actual minutes of unchanged counts.
  const bounded=monotonic&&geometryCounts.at(-1)-geometryCounts[0]<=48&&lastChange<=300;
  const stableSeconds=report.wallSeconds-lastChange;
  lodUploadWarmup={evidence:evidenceFile,geometryCounts,changes:transitions.map(s=>({wallSeconds:s.wallSeconds,geometries:s.memory.geometries})),
    boundedEarlyUpload:bounded,subsequentStableSeconds:stableSeconds,accepted:bounded&&stableSeconds>=900,
    interpretation:'Initial GPU increase is consistent with lazy upload of preallocated fish LOD geometry; specific first-upload species is inferred, not logged.'};
}
const resourceAssessment=assessSoakResources(samples,{requirePrewarmedResources,lodUploadWarmup,biomeId:report.biomeId||'reef'});
violations.push(...resourceAssessment.violations);
const fps=samples.map(s=>s.fps),sum={schema:'tidal-browser-soak-v1',runId,source:'telemetry/'+source,actualWallSeconds:report.wallSeconds,simulatedSeconds:samples.at(-1).metrics.timeSec,sampleIntervalSeconds:30,sampleCount:samples.length,hardware:report.hardware,viewport:report.viewport,...assessObservationHistory(samples),fps:{minimum:Math.min(...fps),mean:fps.reduce((a,b)=>a+b,0)/fps.length,maximum:Math.max(...fps)},entityCounts:resourceAssessment.entityCounts,geometryCounts:resourceAssessment.geometryCounts,textureCounts:resourceAssessment.textureCounts,initialAlive:samples[0].metrics.population,finalAlive:samples.at(-1).metrics.population,maxResourceLedgerError:Math.max(...samples.map(s=>Math.abs(s.metrics.resourceBudgetError))),runtimeErrors:report.errors,violations,passed:!violations.length};
sum.cpuAssetInventory=resourceAssessment.cpuAssetInventory;
sum.prewarmValidation=resourceAssessment.prewarmValidation;
sum.biomeId=report.biomeId||'reef';
sum.limits=['Thirty-second interval samples are not exact per-frame percentile FPS or a JavaScript heap profiler.','Allocated entities include fixed and retained dead objects; living mobile count is reported separately.','This result applies to the captured version and hardware; identify its frozen manifest separately.'];
sum.mobileIndividuals=samples.every(s=>Number.isFinite(s.metrics.mobilePopulation))?{minimum:Math.min(...samples.map(s=>s.metrics.mobilePopulation)),maximum:Math.max(...samples.map(s=>s.metrics.mobilePopulation))}:null;
sum.fullRunTiming=report.actualFrameSeconds>0?{actualFrameCount:report.actualFrameCount,actualFrameSeconds:report.actualFrameSeconds,overallMeanFPS:report.overallMeanFPS,frameTimeBuckets:report.frameTimeBuckets}:null;
sum.maximumCheckpointGapSeconds=Math.max(...sampleGaps);
sum.resourceCountNotes=resourceAssessment.resourceCountNotes;
if(lodUploadWarmup)sum.lodUploadWarmup=lodUploadWarmup;
await writeFile('output/validation/'+outputName+'.json',JSON.stringify(sum,null,2)+'\n');
process.stdout.write(JSON.stringify(sum,null,2)+'\n');if(violations.length)process.exitCode=1;
