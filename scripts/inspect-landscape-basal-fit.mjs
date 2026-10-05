import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REEF_ROCKS,REEF_BRIDGE_ROCK_INDEX } from '../src/habitat.js';
import { REEF_AUXILIARY_ROCKS } from '../src/reefScenery.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { createCoralLandscape,disposeOrganism } from '../src/world/organisms.js';
import { fitReefLandscapeBoulder } from '../src/world/reefLandscapePlacement.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';

const sources=['src/world/reefLandscapePlacement.js','src/world/organisms.js','src/habitat.js','src/reefScenery.js',
  'src/world/reefTerrain.js','src/world/reefSpatialQueries.js','tests/reef-landscape-placement.test.mjs','scripts/inspect-landscape-basal-fit.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const sourceSha256=await hashes(),allRocks=[...REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
const parts=allRocks.map((rock,index)=>createReefRockGeometry(rock,{bedSupported:index<REEF_ROCKS.length&&index!==REEF_BRIDGE_ROCK_INDEX}));
const geometry=mergeGeometries(parts,false),material=new THREE.MeshBasicMaterial(),substrate=new THREE.Mesh(geometry,material);
parts.forEach(part=>part.dispose());enableStaticRayQueries(substrate);substrate.updateMatrixWorld(true);
const report={schema:'reef-landscape-basal-fit-v1',observedAtUtc:new Date().toISOString(),sourceSha256,
  scope:'32 finite actual massive-colony fits against the complete31-rock rendered substrate in Node; no browser or physical stability',cases:[],
  limits:['Only the low-layer vertices selected by minY+5mm are checked; no continuous underside, triangle interior or whole-body contact proof.',
    'A minimum rigid-Y fit buries all checked basal vertices by at least3mm; some are buried further on unequal substrate.',
    'The hard-substrate height span must be <=35% of transformed crown height, an authored display threshold rather than measured attachment biology.',
    'Accepted/rejected counts depend on these chosen sites/scales/yaws; they do not prove the later World candidate population.',
    'Helper ownership/resource checks are CPU identities and disposal events, not a browser GPU or heap leak measurement.']};
try{
  const ray=new THREE.Raycaster();ray.firstHitOnly=true;
  for(const rockIndex of [0,3,5,10])for(let variant=0;variant<4;variant++)for(const kind of ['core','outer-large']){
    const rock=REEF_ROCKS[rockIndex],x=rock[0]+(kind==='core'?0:.55*rock[3]),z=rock[2],scale=kind==='core'?.9:1.7,yaw=.4;
    const group=createCoralLandscape('boulder',undefined,variant,'low'),resources=new Set();
    group.traverse(object=>{if(!object.isMesh)return;resources.add(object.geometry);resources.add(object.material);
      for(const value of Object.values(object.material))if(value?.isTexture)resources.add(value);});
    const disposals=new Map([...resources].map(resource=>[resource,0]));
    for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
    try{
      const fit=fitReefLandscapeBoulder(group,substrate,{x,z,scale,yaw});
      assert.deepEqual(group.position.toArray(),[0,0,0]);assert.deepEqual(group.scale.toArray(),[1,1,1]);
      assert.ok([...disposals.values()].every(value=>value===0));
      ray.set(new THREE.Vector3(x,7,z),new THREE.Vector3(0,-1,0));const centre=ray.intersectObject(substrate,false)[0];assert.ok(centre);
      const oldRootY=centre.point.y-.07;
      const oldGaps=(fit.basalSamples||[]).map(point=>oldRootY+point.vertexYAtZeroRoot-point.substrateY);
      report.cases.push({rockIndex,variant,kind,siteM:[x,z],scale,yaw,fit,
        previousSinglePointRootY:oldRootY,previousSampledBasalGapRangeM:oldGaps.length?[Math.min(...oldGaps),Math.max(...oldGaps)]:null,
        previousGapScope:'same available basal samples; partial if footprint misses hard substrate'});
      if(fit.ok){assert.ok(fit.maxBasalGapM<=-.003+1e-9);assert.ok(fit.visibleCrownAboveHighestSubstrateM>0);}
    }finally{
      disposeOrganism(group);disposeOrganism(group);
      assert.equal(group.children.length,0);assert.equal(group.userData.resources.size,0);
      for(const count of disposals.values())assert.equal(count,1);
      report.cases.at(-1).resourceDisposal={ownedByCaller:resources.size,disposalCountEach:1,helperDisposals:0,rootCleared:true};
    }
  }
  const accepted=report.cases.filter(row=>row.fit.ok),rejected=report.cases.filter(row=>!row.fit.ok);
  assert.ok(accepted.length>0&&rejected.length>0);
  report.summary={cases:report.cases.length,accepted:accepted.length,rejected:rejected.length,terrainRocks:allRocks.length,terrainTriangles:geometry.index.count/3,
    maximumAcceptedBasalGapM:Math.max(...accepted.map(row=>row.fit.maxBasalGapM)),
    minimumAcceptedBasalGapM:Math.min(...accepted.map(row=>row.fit.minBasalGapM)),
    minimumVisibleCrownAboveHighestSubstrateM:Math.min(...accepted.map(row=>row.fit.visibleCrownAboveHighestSubstrateM)),
    previouslyFloatingAtSampleCases:report.cases.filter(row=>row.previousSampledBasalGapRangeM?.[1]>.005).length,
    maximumPreviousSampledBasalGapM:Math.max(...report.cases.map(row=>row.previousSampledBasalGapRangeM?.[1]??-Infinity)),
    rejectionReasons:Object.fromEntries([...new Set(rejected.map(row=>row.fit.reason))].map(reason=>[reason,rejected.filter(row=>row.fit.reason===reason).length]))};
  report.sourceSha256After=await hashes();assert.deepEqual(report.sourceSha256After,sourceSha256);report.passed=true;
  await writeFile('output/validation/reef-landscape-basal-fit-v1.json',`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});
  console.log(JSON.stringify({passed:true,summary:report.summary},null,2));
}finally{geometry.dispose();material.dispose();}
