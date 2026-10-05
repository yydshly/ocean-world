import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { REEF_ROCKS, reefRockSurfacePoint, reefRockSurfaceY, reefRockFootprintContains, reefRockCanonicalCoordinates, habitatHeight } from '../src/habitat.js';

const root=new URL('../',import.meta.url),target=new URL('output/validation/reef-fractured-footprint-v1.json',root);
try{await access(target);throw new Error('Preserve previous footprint evidence; choose a new report version');}
catch(error){if(error.code!=='ENOENT')throw error;}
const sources=['src/habitat.js','src/world/reefTerrain.js','scripts/inspect-fractured-footprint.mjs','tests/reef-fractured-footprint.test.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>
  [name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex')])));
const sourceSha256=await hashes(),rocks=[];let maxInverseError=0,maxHeightRoundTripErrorM=0,minMapSlope=Infinity,checks=0;
for(const [index,rock]of REEF_ROCKS.entries()){
  if(index===9)continue;
  const boundaries=[];
  for(let j=0;j<144;j++){
    const angle=j*Math.PI/72,c=Math.cos(angle),s=Math.sin(angle);let previous=-1;
    for(let i=0;i<=100;i++){
      const radius=i/100,ny=Math.sqrt(1-radius*radius),point=reefRockSurfacePoint(rock,c*radius,ny,s*radius,true);
      const nx=(point.x-rock[0])/rock[3],nz=(point.z-rock[2])/rock[5],mapped=Math.hypot(nx,nz);
      assert.ok(mapped>=previous-1e-12&&mapped<=1+1e-12);assert.ok(reefRockFootprintContains(rock,nx,nz));
      if(previous>=0)minMapSlope=Math.min(minMapSlope,(mapped-previous)/.01);previous=mapped;
      const inverse=reefRockCanonicalCoordinates(rock,nx,nz),error=Math.hypot(inverse.nx-c*radius,inverse.nz-s*radius);
      const heightError=Math.abs(reefRockSurfaceY(rock,nx,ny,nz,true)-point.y);
      maxInverseError=Math.max(maxInverseError,error);maxHeightRoundTripErrorM=Math.max(maxHeightRoundTripErrorM,heightError);
      assert.ok(error<1e-6&&heightError<1e-5);checks++;
      if(radius<=.38){assert.ok(Math.abs(nx-c*radius)<1e-12);assert.ok(Math.abs(nz-s*radius)<1e-12);}
    }
    boundaries.push(previous);assert.equal(reefRockFootprintContains(rock,c*(previous+.001),s*(previous+.001)),false);
  }
  rocks.push({index,minimumBoundaryRadius:Math.min(...boundaries),maximumBoundaryRadius:Math.max(...boundaries),
    estimatedAreaOverOldEllipse:boundaries.reduce((total,value)=>total+value*value,0)/boundaries.length,
    rimAngles:144,radialStepsPerAngle:101});
}
const points=[];
for(const [index,rock]of REEF_ROCKS.entries())if(index!==9)for(let j=0;j<16;j++){
  const angle=j*Math.PI/8,point=reefRockSurfacePoint(rock,.68*Math.cos(angle),Math.sqrt(1-.68*.68),.68*Math.sin(angle),true);
  points.push({rock,nx:(point.x-rock[0])/rock[3],nz:(point.z-rock[2])/rock[5],x:point.x,z:point.z});
}
let checksum=0;
function measure(label,call){
  for(let i=0;i<5000;i++)checksum+=call(points[i%points.length]);
  const repetitions=[];
  for(let repeat=0;repeat<3;repeat++){
    const started=performance.now();for(let i=0;i<50000;i++)checksum+=call(points[i%points.length]);
    repetitions.push(performance.now()-started);
  }
  return {label,queriesPerRepetition:50000,repetitions,unit:'Node CPU wall milliseconds; not browser FPS'};
}
const cpuQueries=[measure('protected core surface',point=>reefRockSurfaceY(point.rock,.2,1,.1)),
  measure('outer surface with20-step inverse',point=>reefRockSurfaceY(point.rock,point.nx,1,point.nz)),
  measure('complete model habitatHeight at fixed outer positions',point=>habitatHeight(point.x,point.z))];
assert.ok(Number.isFinite(checksum));const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,sourceSha256);
const report={schema:'fractured-footprint-inspection-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,sourceSha256After,
  passed:true,checks,rocks,maxInverseError,maxHeightRoundTripErrorM,minMapSlope,cpuQueries,checksum,
  scope:'Deterministic shared footprint mapping and inverse; node CPU queries on fixed metre-scale points',
  limitations:['Angular/radial sampling does not prove every real number or a global continuous error bound.',
    'Area ratios use a144-angle radial integral estimate, not surveyed geology.',
    'Timing depends on this Node process and host load; no old implementation timed here, so no speedup claim.',
    'No browser, GPU, visual gate, camera integration or formal20-minute benchmark is covered.']};
await writeFile(target,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({passed:report.passed,checks,rocks,maxInverseError,maxHeightRoundTripErrorM,minMapSlope,cpuQueries},null,2));
