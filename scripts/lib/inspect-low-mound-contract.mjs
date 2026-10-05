import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as current from '../../src/habitat.js';
import * as previous from '../../output/validation/sources/reef-rounded-v1/src/habitat.js';
import {REEF_AUXILIARY_ROCKS} from '../../src/reefScenery.js';

export const LOW_MOUND_INDICES=Object.freeze([0,1,2,3,4,5,6,10,11]);

export async function inspectLowMoundContract(){
  const baselinePath='output/validation/sources/reef-rounded-v1/src/habitat.js';
  const baselineSourceSha256=createHash('sha256').update(await readFile(new URL('../../'+baselinePath,import.meta.url))).digest('hex');
  assert.equal(baselineSourceSha256,'bbad15ee12a57c2349146a4f6b2e5bda879582cda982c680d50907f2668b4bbb');
  assert.deepEqual(current.REEF_ROCKS,previous.REEF_ROCKS);
  const radii=[0,.1,.2,.3,.38,.45,.55,.65,.75,.85,.90,.95,.99,1],allRocks=[...current.REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
  let footprintPointSamples=0,preservedLowerPointSamples=0,changedUpperCorePointSamples=0,unchangedRockPointSamples=0;
  let revisedUpperPointSamples=0,sumAbsDelta=0,minDelta=Infinity,maxDelta=-Infinity,maxAbsDelta=0,maxHeightRoundTripErrorM=0,minShellThicknessM=Infinity;
  const rocks=[];
  for(const [index,rock]of allRocks.entries()){
    const revised=LOW_MOUND_INDICES.includes(index),bedSupported=index<12&&index!==9,changes=[],rims=[];
    for(let direction=0;direction<72;direction++)for(const radius of radii){
      const angle=direction*Math.PI/36,c=Math.cos(angle),s=Math.sin(angle),nx=radius*c,nz=radius*s,ny=Math.sqrt(Math.max(0,1-radius*radius));
      const before=previous.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported),after=current.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported);
      assert.equal(after.x,before.x);assert.equal(after.z,before.z);footprintPointSamples++;
      const lowerSign=ny===0?-Number.EPSILON:-ny;
      const lowerBefore=previous.reefRockSurfacePoint(rock,nx,lowerSign,nz,bedSupported),lowerAfter=current.reefRockSurfacePoint(rock,nx,lowerSign,nz,bedSupported);
      assert.deepEqual(lowerAfter,lowerBefore);preservedLowerPointSamples++;
      const thickness=after.y-lowerAfter.y;minShellThicknessM=Math.min(minShellThicknessM,thickness);assert.ok(thickness>=-1e-12);
      if(!revised){assert.deepEqual(after,before);unchangedRockPointSamples++;}
      if(revised&&radius<=.38){assert.ok(after.y<before.y-.20,'Authorized old high core is materially lowered');changedUpperCorePointSamples++;}
      const error=Math.abs(current.reefRockSurfaceY(rock,(after.x-rock[0])/rock[3],ny,(after.z-rock[2])/rock[5],bedSupported)-after.y);
      maxHeightRoundTripErrorM=Math.max(maxHeightRoundTripErrorM,error);assert.ok(error<1e-5);
      if(revised&&radius<.90){
        const delta=after.y-before.y;changes.push(delta);revisedUpperPointSamples++;sumAbsDelta+=Math.abs(delta);
        minDelta=Math.min(minDelta,delta);maxDelta=Math.max(maxDelta,delta);maxAbsDelta=Math.max(maxAbsDelta,Math.abs(delta));
      }
      if(revised&&radius===1){const burial=after.y-current.floorHeight(after.x,after.z);rims.push(burial);assert.ok(burial>=-.025-1e-10&&burial<=-.015+1e-10);}
    }
    if(revised){
      const floor=current.floorHeight(rock[0],rock[2]),oldRise=previous.reefRockSurfacePoint(rock,0,1,0,bedSupported).y-floor,
        newRise=current.reefRockSurfacePoint(rock,0,1,0,bedSupported).y-floor,ratio=newRise/oldRise;
      assert.ok(ratio>=.55-1e-12&&ratio<=.65+1e-12);
      rocks.push({index,sampledRevisedUpperPoints:changes.length,oldCrownAboveFloorM:oldRise,crownAboveFloorM:newRise,adoptedCoreRiseRatio:ratio,
        minimumUpperHeightChangeM:Math.min(...changes),maximumUpperHeightChangeM:Math.max(...changes),
        meanAbsoluteUpperHeightChangeM:changes.reduce((sum,value)=>sum+Math.abs(value),0)/changes.length,
        sampledRimBelowSedimentRangeM:[Math.min(...rims),Math.max(...rims)]});
    }
  }
  assert.ok(sumAbsDelta/revisedUpperPointSamples>.10&&maxAbsDelta>.35);
  return {baselinePath,baselineSourceSha256,revisedRockIndices:LOW_MOUND_INDICES,footprintPointSamples,preservedLowerPointSamples,
    changedUpperCorePointSamples,unchangedRockPointSamples,revisedUpperPointSamples,
    meanAbsoluteUpperHeightChangeM:sumAbsDelta/revisedUpperPointSamples,minimumUpperHeightChangeM:minDelta,maximumUpperHeightChangeM:maxDelta,
    maxAbsUpperHeightChangeM:maxAbsDelta,maxHeightRoundTripErrorM,minSampledShellThicknessM:minShellThicknessM,rocks,
    scope:'Current authorized low-mound core/upper change against exact rounded-v1 source; full lower/XZ and22 other rocks retain their formulas',
    superseded:['Exact .38 core geometry/triangle invariance','Coral historical rootY invariance','Historical scan rootY/maximum-gap invariance'],
    limitations:['Finite analytic samples do not prove every continuous coordinate; actual mesh rays are separately checked.',
      'New terrain requires current mobile-organism/camera/World/ecological integration; prior frozen runs do not validate this revision.']};
}
