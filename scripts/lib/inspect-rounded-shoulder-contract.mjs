import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as current from '../../src/habitat.js';
import * as previous from '../../output/validation/sources/reef-asymmetric-habitat-v1.mjs';
import { REEF_AUXILIARY_ROCKS } from '../../src/reefScenery.js';

export const ROUNDED_SHOULDER_INDICES=Object.freeze([0,1,2,3,4,5,6,10,11]);

export async function inspectRoundedShoulderContract(){
  const baselinePath='output/validation/sources/reef-asymmetric-habitat-v1.mjs';
  const baselineSourceSha256=createHash('sha256').update(await readFile(new URL(`../../${baselinePath}`,import.meta.url))).digest('hex');
  assert.equal(baselineSourceSha256,'bc5fdbb2c2dc7c26f19496887ec5d55e060375ba21b7952dba5ce5a02a7751cf');
  const scenerySha256=createHash('sha256').update(await readFile(new URL('../../output/validation/sources/reefScenery.js',import.meta.url))).digest('hex');
  assert.equal(scenerySha256,'28189c2586c2bd47fb99eee74f23565cf210540637b5f050ab7cd10fb136824d');
  const radii=[0,.1,.2,.3,.38,.45,.55,.65,.75,.85,.90,.95,.99,1],allRocks=[...current.REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
  let footprintPointSamples=0,preservedLowerPointSamples=0,revisedLowerEdgeSamples=0,protectedMainCorePointSamples=0,unchangedRockPointSamples=0;
  let macroHeightPointSamples=0,sumAbsDelta=0,minDelta=Infinity,maxDelta=-Infinity,maxAbsDelta=0,changedByAtLeast2cm=0;
  let maxHeightRoundTripErrorM=0,minShellThicknessM=Infinity,maxCoreBoundaryDeltaOverStepSquared=0;
  const rocks=[];
  for(const [index,rock]of allRocks.entries()){
    const revised=ROUNDED_SHOULDER_INDICES.includes(index),bedSupported=index<12&&index!==9,changes=[],rims=[];
    for(let direction=0;direction<72;direction++){
      const angle=direction*Math.PI/36,c=Math.cos(angle),s=Math.sin(angle);
      for(const radius of radii){
        const nx=radius*c,nz=radius*s,ny=Math.sqrt(Math.max(0,1-radius*radius));
        const before=previous.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported),after=current.reefRockSurfacePoint(rock,nx,ny,nz,bedSupported);
        assert.equal(after.x,before.x);assert.equal(after.z,before.z);footprintPointSamples++;
        const lowerBefore=previous.reefRockSurfacePoint(rock,nx,-ny,nz,bedSupported),lowerAfter=current.reefRockSurfacePoint(rock,nx,-ny,nz,bedSupported);
        if(!revised||radius<=.90){assert.deepEqual(lowerAfter,lowerBefore);preservedLowerPointSamples++;}
        else revisedLowerEdgeSamples++;
        const thickness=after.y-lowerAfter.y;minShellThicknessM=Math.min(minShellThicknessM,thickness);assert.ok(thickness>=-1e-12);
        if(!revised){assert.deepEqual(after,before);unchangedRockPointSamples++;}
        if(revised&&radius<=.38){assert.deepEqual(after,before);protectedMainCorePointSamples++;}
        const worldNx=(after.x-rock[0])/rock[3],worldNz=(after.z-rock[2])/rock[5];
        const error=Math.abs(current.reefRockSurfaceY(rock,worldNx,ny,worldNz,bedSupported)-after.y);
        maxHeightRoundTripErrorM=Math.max(maxHeightRoundTripErrorM,error);assert.ok(error<1e-5);
        if(revised&&radius>.38&&radius<.90){
          const delta=after.y-before.y;changes.push(delta);macroHeightPointSamples++;sumAbsDelta+=Math.abs(delta);
          minDelta=Math.min(minDelta,delta);maxDelta=Math.max(maxDelta,delta);maxAbsDelta=Math.max(maxAbsDelta,Math.abs(delta));
          if(Math.abs(delta)>=.02)changedByAtLeast2cm++;
        }
        if(revised&&radius===1){
          const burial=after.y-current.floorHeight(after.x,after.z);rims.push(burial);
          assert.ok(burial>=-.025-1e-10&&burial<=-.015+1e-10);
        }
      }
      if(revised){
        const step=1e-5,radius=.38+step,ny=Math.sqrt(1-radius*radius);
        const coreContinuation=rock[1]+rock[4]*ny+previous.reefRockRelief(radius*c,ny,radius*s,rock);
        const after=current.reefRockSurfacePoint(rock,radius*c,ny,radius*s).y;
        maxCoreBoundaryDeltaOverStepSquared=Math.max(maxCoreBoundaryDeltaOverStepSquared,Math.abs(after-coreContinuation)/(step*step));
      }
    }
    if(revised)rocks.push({index,sampledOuterPoints:changes.length,minimumOuterHeightChangeM:Math.min(...changes),maximumOuterHeightChangeM:Math.max(...changes),
      meanAbsoluteOuterHeightChangeM:changes.reduce((sum,value)=>sum+Math.abs(value),0)/changes.length,
      sampledRimBelowSedimentRangeM:[Math.min(...rims),Math.max(...rims)]});
  }
  assert.ok(sumAbsDelta/macroHeightPointSamples>.04&&maxAbsDelta>.20,'Broad exterior shape must change beyond a fine relief adjustment');
  assert.ok(maxCoreBoundaryDeltaOverStepSquared<.05);
  return {baselinePath,baselineSourceSha256,baselineScenerySha256:scenerySha256,revisedRockIndices:ROUNDED_SHOULDER_INDICES,
    footprintPointSamples,preservedLowerPointSamples,revisedLowerEdgeSamples,protectedMainCorePointSamples,unchangedRockPointSamples,
    protectedCanonicalCoreRadius:.38,protectedCanonicalLowerRadius:.90,macroHeightPointSamples,changedByAtLeast2cm,
    meanAbsoluteOuterHeightChangeM:sumAbsDelta/macroHeightPointSamples,minimumOuterHeightChangeM:minDelta,maximumOuterHeightChangeM:maxDelta,maxAbsOuterHeightChangeM:maxAbsDelta,
    maxHeightRoundTripErrorM,minSampledShellThicknessM:minShellThicknessM,maxCoreBoundaryDeltaOverStepSquared,rocks,
    scope:'Exact asymmetric-baseline equality for protected regions; explicitly revised upper shoulders and .90→1 burial edge are measured separately',
    limitations:['Sample equality does not prove all continuous coordinates; source review establishes the unchanged footprint and retained branch formulas.',
      'The prior whole-lower-shell/edge invariance contract is intentionally superseded for nine .90→1 edge bands.',
      'Analytic and finite point checks do not replace actual triangle raycasts, browser collision, visual review or physical stability.',
      'Exterior height changes can alter mobile organisms and decorative placements; prior ecological runs and frozen review-six are separate revisions.']};
}
