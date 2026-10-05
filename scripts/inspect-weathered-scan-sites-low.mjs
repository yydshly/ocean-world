import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX } from '../src/habitat.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { placeReefSkeletonOnSubstrate } from '../src/world/reefScanPlacement.js';
import { prepareReefSkeletonDisplay } from '../src/world/reefScanDisplay.js';
import { ReefSimulation } from '../src/simulation.js';
import { decodeReefScanForInspection } from './lib/decode-reef-scan.mjs';

const root=new URL('../',import.meta.url),target=new URL('output/validation/reef-weathered-scan-placement-low-v1.json',root);
try{await access(target);throw new Error('Keep existing low-derivative placement evidence; use a new report version');}
catch(error){if(error.code!=='ENOENT')throw error;}
const sourceFiles=['src/habitat.js','src/world/reefTerrain.js','src/world/ReefWorld.js','src/world/reefScanAssets.js',
  'src/world/reefScanPlacement.js','src/world/reefScanDisplay.js','scripts/lib/decode-reef-scan.mjs','scripts/inspect-weathered-scan-sites-low.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>
  [name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex')])));
const sourceSha256=await hashes(),worldSource=await readFile(new URL('src/world/ReefWorld.js',root),'utf8');
const seedDeclaration='function seeded(seed) { let s = seed | 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }';
const auxiliaryLoop='for(let i=0;i<22;i++){const x=-7.5+random()*16,z=-10+random()*18;if(x>-.5&&x<3.5&&z>-5)continue;rockAt(x,.1,z,.3+random()*.7,.2+random()*.35,.3+random()*.55);}';
assert.ok(worldSource.includes(seedDeclaration)&&worldSource.includes(auxiliaryLoop)&&worldSource.includes('const random=seeded(851);const all=[];'));
function seeded(seed){let s=seed|0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const random=seeded(851),auxiliary=[];
for(let i=0;i<22;i++){const x=-7.5+random()*16,z=-10+random()*18;if(x>-.5&&x<3.5&&z>-5)continue;auxiliary.push([x,.1,z,.3+random()*.7,.2+random()*.35,.3+random()*.55]);}
assert.equal(auxiliary.length,19);
const geometries=[...REEF_ROCKS.map((rock,index)=>createReefRockGeometry(rock,{bedSupported:index!==REEF_BRIDGE_ROCK_INDEX})),
  ...auxiliary.map(rock=>createReefRockGeometry(rock))];
const geometry=mergeGeometries(geometries,false),material=new THREE.MeshBasicMaterial(),substrate=new THREE.Mesh(geometry,material);
let scan=null;
const quantiles=values=>{values.sort((a,b)=>a-b);return Object.fromEntries([0,.01,.1,.5,.9,.99,1].map(fraction=>
  [fraction===0?'min':fraction===1?'max':`p${fraction*100}`,values[Math.floor(fraction*(values.length-1))]]));};
try{
  scan=await decodeReefScanForInspection({detail:'low'});const display=prepareReefSkeletonDisplay(scan.group);
  assert.equal(scan.geometry.attributes.position.count,115927);
  const corals=new ReefSimulation(42).agents.filter(agent=>agent.speciesId==='staghorn-coral');
  const sites=[{label:'current-default-exterior-shoulder',x:4.6,z:1.95},
    {label:'rock-10-central-crown',x:4.0,z:1.3},{label:'rock-5-unassigned-crown',x:4.8,z:-4.8}];
  const rows=[],ray=new THREE.Raycaster(),vertex=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);ray.firstHitOnly=true;
  for(const site of sites){
    const placement=placeReefSkeletonOnSubstrate(scan.group,substrate,site);
    assert.equal(placement.vertexSamples,115927);assert.ok(Math.abs(placement.minVertexGapM-.004)<1e-10);
    const gaps=[],basalGaps=[],positions=scan.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      vertex.fromBufferAttribute(positions,i).applyMatrix4(scan.group.children[0].matrixWorld);
      ray.set(new THREE.Vector3(vertex.x,7,vertex.z),down);const hit=ray.intersectObject(substrate,false)[0];assert.ok(hit);
      const gap=vertex.y-hit.point.y;gaps.push(gap);assert.ok(gap>=.004-1e-10);
      if(positions.getY(i)<=.01)basalGaps.push(gap);
    }
    const nearestCoral=corals.map(agent=>({id:agent.id,distanceM:Math.hypot(agent.position.x-site.x,agent.position.z-site.z)}))
      .sort((a,b)=>a.distanceM-b.distanceM)[0];
    rows.push({...site,placement,gapDistributionM:quantiles(gaps),basalHeightThresholdM:.01,basalVertexCount:basalGaps.length,
      basalGapDistributionM:quantiles(basalGaps),nearBasalVertices:basalGaps.filter(gap=>gap<=.005).length,
      nearestSeed42CoralRoot:nearestCoral});
  }
  const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,sourceSha256);
  const report={schema:'weathered-reef-scan-placement-low-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,sourceSha256After,
    derivative:'low / official 150k 1024 GLB',display:display.meshes[0],terrain:{authoredRocks:12,auxiliaryRocks:19,auxiliaryPositions:auxiliary,
      triangles:geometry.index.count/3,assembly:'Shared actual terrain builder; auxiliary deterministic loop mirrored and exact current World source guarded'},
    scope:'Actual original-scale official local Draco geometry; all display vertices intersected with all31 rock meshes merged identically to the World hard substrate',rows,
    limitations:['Upper branch height contributes to whole-model gap maxima; basal <=1cm vertex subset is reported separately.',
      'Minimum vertex clearance is not complete triangle contact or physical stability; the basal cut remains uncapped.',
      'Nearest coral root distance is a seed42 observation, not a full live-colony collision or co-occurrence check.',
      'The World hard-substrate assembly is reproduced with exact source guards; browser and renderer are not executed.',
      'Candidate positions do not modify placement defaults, World, UI, original assets or frozen benchmark.']};
  await writeFile(target,`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify({terrain:report.terrain.triangles,rows:rows.map(row=>({label:row.label,position:row.placement.rootPositionM,
    gaps:row.gapDistributionM,basalVertices:row.basalVertexCount,basalGaps:row.basalGapDistributionM,nearBasal:row.nearBasalVertices,
    nearestCoral:row.nearestSeed42CoralRoot}))},null,2));
}finally{scan?.dispose();geometry.dispose();for(const value of geometries)value.dispose();material.dispose();}
