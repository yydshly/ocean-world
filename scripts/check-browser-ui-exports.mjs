import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const dir='output/validation/telemetry/';
const ageFiles=[
  'age-seed-42-365days-2026-10-03T02-34-38-104Z-2296fae0.json',
  'age-seed-42-730days-2026-10-03T02-35-37-575Z-7769aa37.json',
];
const age=[];
for(const file of ageFiles){
  const bytes=await readFile(dir+file),result=JSON.parse(bytes);
  assert.equal(result.schema,'tidal-paired-age-experiment-v1');
  assert.equal(result.preInterventionEqual,true);
  assert.equal(result.baseline.mapsTo3DIndividuals,false);
  const current=result.perturbed.current;
  assert.ok(Math.abs(current.carbonBudgetError)<1e-8);
  assert.ok(bytes.length<2*1024*1024);
  age.push({file:dir+file,bytes:bytes.length,durationDays:result.durationDays,
    intervention:result.intervention,preInterventionEqual:result.preInterventionEqual,
    carbonBudgetError:current.carbonBudgetError,juvenileDensityM2:current.juvenile.densityM2,
    adultDensityM2:current.adult.densityM2});
}
const lampFiles=['deep-seed-42-2026-10-03T02-37-51-389Z-4d690e5c.json','deep-seed-42-2026-10-03T02-38-07-878Z-219d5942.json'];
const [off,on]=await Promise.all(lampFiles.map(async file=>JSON.parse(await readFile(dir+file,'utf8'))));
for(const r of [off,on]){assert.equal(r.snapshot.paused,true);assert.deepEqual(r.snapshot.errors,[]);}
assert.equal(off.snapshot.environment.observerLight,0);assert.equal(on.snapshot.environment.observerLight,1);
assert.equal(off.snapshot.metrics.timeSec,on.snapshot.metrics.timeSec);
const fields=['surfaceDetritus','benthicAnimalFood','suspendedPrey','averageEnergy','feedingCount','grazingCount','captureCount','naturalLightLevel','totalPrimaryProduction'];
for(const key of fields)assert.equal(off.snapshot.metrics[key],on.snapshot.metrics[key]);
assert.deepEqual(off.snapshot.agents,on.snapshot.agents);
assert.equal(off.snapshot.metrics.naturalLightLevel,0);assert.equal(off.snapshot.metrics.totalPrimaryProduction,0);
const report={schema:'tidal-actual-browser-ui-exports-v1',checkedAt:new Date().toISOString(),age,
  deepLamp:{files:lampFiles.map(f=>dir+f),pausedTimeSec:off.snapshot.metrics.timeSec,
    identicalEcologyFields:fields,allAgentsUnchanged:true,naturalLight:0,photosyntheticInput:0},
  passed:true,notes:['These JSON files were produced using the visible app controls in the real browser.',
    '365-day food stop and 730-day adult removal were computed in a Worker, plotted, and exported successfully.',
    'A zero-light canvas was visually checked and captured separately. This report verifies ecological independence of the observer lamp.',
    'Development preview captures are evidence for these actions, not a frozen final-build performance or visual-completion claim.']};
await writeFile('output/validation/browser-ui-exports-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
