import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ReefSimulation} from '../src/simulation.js';
import {REEF_AUXILIARY_ROCKS} from '../src/reefScenery.js';
import * as beforeCorrection from '../output/validation/sources/reef-shelf-v2/src/habitat.js';
import {createReefRockGeometry as createBeforeCorrectionGeometry} from '../output/validation/sources/reef-shelf-v2/src/world/reefTerrain.js';
import {speciesById} from '../src/species.js';
import * as habitat from '../src/habitat.js';
import * as v1 from '../output/validation/sources/reef-shelf-v1/src/habitat.js';
import {createReefRockGeometry} from '../src/world/reefTerrain.js';
import {createReefRockGeometry as createV1Geometry} from '../output/validation/sources/reef-shelf-v1/src/world/reefTerrain.js';
import {enableStaticRayQueries} from '../src/world/reefSpatialQueries.js';

const files=['scripts/inspect-reef-shelf-passage-risk-v2.mjs','src/habitat.js','src/reefScenery.js',
  'src/world/reefTerrain.js','src/world/reefSpatialQueries.js','src/simulation.js','src/species.js',
  'output/validation/reef-shelf-preview-v1.json','output/validation/reef-shelf-passage-correction-v2.json',
  'output/validation/sources/reef-shelf-v1/src/habitat.js',
  'output/validation/sources/reef-shelf-v1/src/reefScenery.js',
  'output/validation/sources/reef-shelf-v1/src/world/reefTerrain.js',
  'output/validation/sources/reef-shelf-v2/src/habitat.js',
  'output/validation/sources/reef-shelf-v2/src/reefScenery.js',
  'output/validation/sources/reef-shelf-v2/src/world/reefTerrain.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>
  [file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const sourceSha256=await hashes(),changed=[7,8,9],material=new THREE.MeshBasicMaterial();
const meshes=changed.map(index=>new THREE.Mesh(createReefRockGeometry(habitat.REEF_ROCKS[index],{bedSupported:index!==9}),material));
for(const mesh of meshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
const ray=new THREE.Raycaster();ray.firstHitOnly=true;
const allRocks=[...habitat.REEF_ROCKS,...REEF_AUXILIARY_ROCKS];
const allMeshes=allRocks.map((rock,index)=>new THREE.Mesh(createReefRockGeometry(rock,{bedSupported:index<12&&index!==9}),material));
for(const mesh of allMeshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
const down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);
function interval(mesh,x,z){
  ray.set(new THREE.Vector3(x,7,z),down);const top=ray.intersectObject(mesh)[0];if(!top)return null;
  ray.set(new THREE.Vector3(x,-2,z),up);const bottom=ray.intersectObject(mesh)[0];assert.ok(bottom);
  return {upperM:top.point.y,lowerM:bottom.point.y};
}
const report={schema:'reef-shelf-passage-animal-point-risk-v2',observedAtUtc:new Date().toISOString(),sourceSha256,
  scope:'Three seeds,30 simulated seconds,0.1s snapshots; only root/nose/tail proxies near changed rocks7/8/9 and finite central corridor points.',
  cases:[],passageSamples:[],violations:[],limits:[
    'Actual finite triangle ray intervals, not whole animal meshes, animation/pitch envelopes or arbitrary paths.',
    'Nose/tail are horizontal half-length points at root Y; body-bottom proxy subtracts0.3*length, mirroring model clearance.',
    'No static animal near a changed mesh is not evidence of hypothetical4mm attachments at every surface coordinate.',
    'Central sampled corridor is a point path, not a swept camera/animal-body clearance proof.',
    'No browser visual pass, long ecological experiment, physical stability or World integration claim.']};
try{
  for(const seed of [42,77,2026]){
    const simulation=new ReefSimulation(seed),counts={root:0,nose:0,tail:0,nonFishRoot:0},hits={root:0,nose:0,tail:0,nonFishRoot:0};
    let worstRoot=null,worstEndpoint=null,worstBodyBottom=null,fishPointViolations=0,nonFishPointViolations=0;
    const byRock={7:0,8:0,9:0};
    for(let tick=0;tick<=300;tick++){
      for(const agent of simulation.agents){
        if(!agent.alive)continue;
        const {x,y,z}=agent.position;assert.ok([x,y,z].every(Number.isFinite));
        const fish=speciesById[agent.speciesId].kind==='fish',dx=Math.cos(agent.heading)*agent.sizeM*.5,dz=Math.sin(agent.heading)*agent.sizeM*.5;
        const points=fish?[['root',x,z],['nose',x+dx,z+dz],['tail',x-dx,z-dz]]:[['nonFishRoot',x,z]];
        for(const [kind,px,pz]of points){
          counts[kind]++;
          for(const [slot,index]of changed.entries()){
            const rock=habitat.REEF_ROCKS[index],nx=(px-rock[0])/rock[3],nz=(pz-rock[2])/rock[5];
            if(!habitat.reefRockFootprintContains(rock,nx,nz))continue;
            const actual=interval(meshes[slot],px,pz);if(!actual)continue;hits[kind]++;byRock[index]++;
            const topGap=y-actual.upperM,inside=y>actual.lowerM&&y<actual.upperM;
            const row={seed,agentId:agent.id,timeSec:simulation.timeSec,kind,rockIndex:index,pointM:[px,y,pz],
              actualIntervalM:[actual.lowerM,actual.upperM],rootOrEndpointToUpperGapM:topGap};
            if(fish){
              if(kind==='root'&&(!worstRoot||topGap<worstRoot.rootOrEndpointToUpperGapM))worstRoot=row;
              if(kind!=='root'&&(!worstEndpoint||topGap<worstEndpoint.rootOrEndpointToUpperGapM))worstEndpoint=row;
              const bodyGap=topGap-.3*agent.sizeM;
              if(!worstBodyBottom||bodyGap<worstBodyBottom.bodyBottomProxyGapM)worstBodyBottom={...row,sizeM:agent.sizeM,bodyBottomProxyGapM:bodyGap};
              if(inside||bodyGap<=0){fishPointViolations++;report.violations.push({...row,bodyBottomProxyGapM:bodyGap});}
            }else if(inside){nonFishPointViolations++;report.violations.push(row);}
          }
        }
      }
      if(tick<300)simulation.step(.1);
    }
    assert.ok(Math.abs(simulation.metrics.resourceBudgetError)<1e-9);
    report.cases.push({seed,simulationSeconds:30,snapshots:301,examinedPointCounts:counts,actualChangedRockRayHits:hits,
      actualRayHitsByRock:byRock,worstRoot,worstEndpoint,worstBodyBottom,fishPointViolations,nonFishPointViolations,
      resourceBudgetError:simulation.metrics.resourceBudgetError});
  }
  // Preserve v1 evidence and distinguish positive floating error from negative
  // error that can consume the model's chosen4mm static attachment allowance.
  const previous=JSON.parse(await readFile('output/validation/reef-shelf-preview-v1.json','utf8'));
  const worst=previous.heightSamples.reduce((a,b)=>a.upperAnalyticMinusTriangleM<b.upperAnalyticMinusTriangleM?a:b);
  const oldRock=v1.REEF_ROCKS[worst.index],oldPoint=v1.reefRockSurfacePoint(oldRock,
    worst.radius*Math.cos(worst.angle),Math.sqrt(1-worst.radius**2),worst.radius*Math.sin(worst.angle),true);
  const oldMesh=new THREE.Mesh(createV1Geometry(oldRock,{bedSupported:true}),material);oldMesh.updateMatrixWorld(true);
  try{
    const actual=interval(oldMesh,oldPoint.x,oldPoint.z);assert.ok(actual);
    report.v1ConditionalAttachmentRisk={rockIndex:worst.index,canonicalRadius:worst.radius,canonicalAngle:worst.angle,
      syntheticAnalyticPlus4mmRootM:[oldPoint.x,oldPoint.y+.004,oldPoint.z],actualUpperM:actual.upperM,
      hypotheticalRootGapM:oldPoint.y+.004-actual.upperM,
      meaning:'V1 +30.338mm maximum is floating error; its most-negative error makes this hypothetical4mm root penetrate. No actual attached animal is asserted at this coordinate.'};
  }finally{oldMesh.geometry.dispose();}
  const quick=JSON.parse(await readFile('output/validation/reef-shelf-passage-correction-v2.json','utf8'));
  report.v2FiniteHeightSampleAttachmentBand={samples:quick.heightSamples.length,
    analyticPlus4mmMinimumActualGapM:.004+quick.summary.minimumUpperAnalyticMinusTriangleM,
    analyticPlus4mmMaximumActualGapM:.004+quick.summary.maximumUpperAnalyticMinusTriangleM,
    scope:'Conditional432-point upper-surface sample, not actual animal placements'};
  // Examine ingress/egress as well as the central eye. A hollow center alone
  // does not prove that a low shelf permits passage from the surrounding sand.
  for(const x of [1.30,1.35,1.40])for(let j=0;j<=34;j++){
    const z=-3.2+j*.05,y=.30,solid=[];
    for(const [index,mesh]of allMeshes.entries()){
      const actual=interval(mesh,x,z);if(!actual)continue;
      if(y>=actual.lowerM-.03&&y<=actual.upperM+.03)solid.push({rockIndex:index,...actual});
      const rock=allRocks[index],nx=(x-rock[0])/rock[3],nz=(z-rock[2])/rock[5];
      if(habitat.reefRockFootprintContains(rock,nx,nz)){
        const canonical=habitat.reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-canonical.radius**2));
        const low=habitat.reefRockSurfaceY(rock,nx,-ny,nz,index<12&&index!==9),high=habitat.reefRockSurfaceY(rock,nx,ny,nz,index<12&&index!==9);
        if(y>=low-.03&&y<=high+.03)solid.push({rockIndex:index,analyticIntervalM:[low,high]});
      }
    }
    const row={pointM:[x,y,z],blockedIntervalsWith30mmPointMargin:solid};report.passageSamples.push(row);
  }
  report.centralPathBlockedSamples=report.passageSamples.filter(row=>row.blockedIntervalsWith30mmPointMargin.length);
  report.forwardBackCorridorRays=[];
  for(const x of [1.27,1.30,1.35,1.40,1.43])for(const y of [.27,.30,.33])for(const direction of [-1,1]){
    const origin=new THREE.Vector3(x,y,direction===1?-3.2:-1.5);ray.set(origin,new THREE.Vector3(0,0,direction));ray.far=1.7;
    const hits=ray.intersectObjects(allMeshes,false);
    report.forwardBackCorridorRays.push({originM:origin.toArray(),directionZ:direction,lengthM:1.7,actualHitCount:hits.length,firstHit:hits[0]?{pointM:hits[0].point.toArray(),distanceM:hits[0].distance,rockIndex:allMeshes.indexOf(hits[0].object)}:null});
  }ray.far=Infinity;
  const digest=b=>createHash('sha256').update(b).digest('hex');
  const contract={allThirtyOtherPositionBuffersExact:true,capXZFootprintVerticesExact:true,changedUpperVertices:0,changedLowerVertices:0,maxUpperLiftM:0,maxLowerLiftM:0,upperNormalizedWorldXRange:[],upperWorldZRange:[]};
  for(const [index,mesh]of allMeshes.entries()){
    const oldGeometry=createBeforeCorrectionGeometry(allRocks[index],{bedSupported:index<12&&index!==9});
    try{const p=mesh.geometry.attributes.position,q=oldGeometry.attributes.position,uv=mesh.geometry.attributes.uv;assert.equal(p.count,q.count);
      if(index!==9)assert.equal(digest(Buffer.from(p.array.buffer)),digest(Buffer.from(q.array.buffer)));
      else for(let i=0;i<p.count;i++){assert.equal(p.getX(i),q.getX(i));assert.equal(p.getZ(i),q.getZ(i));const delta=p.getY(i)-q.getY(i);if(delta===0)continue;assert.ok(delta>=0);const nx=(p.getX(i)-allRocks[index][0])/allRocks[index][3];assert.ok(Math.abs(nx)<.280001);
        if(uv.getY(i)>=.5-1e-8){contract.changedUpperVertices++;contract.maxUpperLiftM=Math.max(contract.maxUpperLiftM,delta);contract.upperNormalizedWorldXRange.push(nx);contract.upperWorldZRange.push(p.getZ(i));}
        else{contract.changedLowerVertices++;contract.maxLowerLiftM=Math.max(contract.maxLowerLiftM,delta);}
      }
    }finally{oldGeometry.dispose();}
  }
  contract.upperNormalizedWorldXRange=[Math.min(...contract.upperNormalizedWorldXRange),Math.max(...contract.upperNormalizedWorldXRange)];contract.upperWorldZRange=[Math.min(...contract.upperWorldZRange),Math.max(...contract.upperWorldZRange)];report.correctionContract=contract;
  report.passed=report.violations.length===0&&report.centralPathBlockedSamples.length===0&&report.forwardBackCorridorRays.every(r=>r.actualHitCount===0);
  report.sourceSha256After=await hashes();assert.deepEqual(report.sourceSha256After,sourceSha256);
  await writeFile('output/validation/reef-shelf-passage-risk-v2.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,blockedPath:report.centralPathBlockedSamples,
    v1Risk:report.v1ConditionalAttachmentRisk,v2Band:report.v2FiniteHeightSampleAttachmentBand,correction:report.correctionContract,corridorRays:report.forwardBackCorridorRays},null,2));
}finally{for(const mesh of [...meshes,...allMeshes])mesh.geometry.dispose();material.dispose();}
