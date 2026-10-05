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

const root=new URL('../',import.meta.url),target=new URL('output/validation/reef-weathered-scan-placement-candidates-v1.json',root);
try{await access(target);throw new Error('Keep existing candidate evidence; use a new report version');}
catch(error){if(error.code!=='ENOENT')throw error;}
const sourceFiles=['src/habitat.js','src/world/reefTerrain.js','src/world/reefScanPlacement.js',
  'src/world/reefScanDisplay.js','scripts/lib/decode-reef-scan.mjs','scripts/inspect-weathered-scan-sites.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>
  [name,createHash('sha256').update(await readFile(new URL(name,root))).digest('hex')])));
const sourceSha256=await hashes(),geometries=REEF_ROCKS.map((rock,index)=>
  createReefRockGeometry(rock,{bedSupported:index!==REEF_BRIDGE_ROCK_INDEX}));
const geometry=mergeGeometries(geometries,false),material=new THREE.MeshBasicMaterial(),substrate=new THREE.Mesh(geometry,material);
let scan=null;
try{
  scan=await decodeReefScanForInspection();prepareReefSkeletonDisplay(scan.group);
  const corals=new ReefSimulation(42).agents.filter(agent=>agent.speciesId==='staghorn-coral');
  const sites=[{label:'current-default-exterior-shoulder',x:4.6,z:1.95},
    {label:'rock-10-central-crown',x:4.0,z:1.3},{label:'rock-10-centre-east',x:4.25,z:1.15},
    {label:'rock-5-unassigned-crown',x:4.8,z:-4.8},{label:'rock-6-unassigned-crown',x:6.9,z:-7.2}];
  const rows=[];
  for(const site of sites){
    const placement=placeReefSkeletonOnSubstrate(scan.group,substrate,site);
    assert.equal(placement.vertexSamples,22909);assert.ok(Math.abs(placement.minVertexGapM-.004)<1e-10);
    const nearestCoral=corals.map(agent=>({id:agent.id,distanceM:Math.hypot(agent.position.x-site.x,agent.position.z-site.z)}))
      .sort((a,b)=>a.distanceM-b.distanceM)[0];
    rows.push({...site,placement,nearestSeed42CoralRoot:nearestCoral});
  }
  const sourceSha256After=await hashes();assert.deepEqual(sourceSha256After,sourceSha256);
  const report={schema:'weathered-reef-scan-placement-candidates-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,sourceSha256After,
    scope:'Actual original-scale official Draco geometry clipped above the museum mount; per-vertex rays against the new rendered reef in Node',rows,
    limitations:['Minimum vertex clearance is not complete triangle contact or physical stability.',
      'Nearest coral root distance is a seed42 observation, not a complete live-colony collision or co-occurrence check.',
      'Candidate positions do not modify the World, scan placement defaults, UI, original asset or frozen benchmark.',
      'Node geometry inspection is not browser framing, GPU decoding, final visual appearance or performance evidence.']};
  await writeFile(target,`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(rows.map(row=>({label:row.label,position:row.placement.rootPositionM,
    maxGapM:row.placement.maxVertexGapM,nearVertices:row.placement.nearContactVertices,nearestCoral:row.nearestSeed42CoralRoot})),null,2));
}finally{scan?.dispose();geometry.dispose();for(const value of geometries)value.dispose();material.dispose();}
