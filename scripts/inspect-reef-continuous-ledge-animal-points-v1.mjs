import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';

const started=performance.now(),sha=b=>createHash('sha256').update(b).digest('hex');
const output=process.argv[3]||'output/validation/reef-continuous-ledge-animal-points-v1.json';
assert.match(output,/^output\/validation\/[a-z0-9-]+\.json$/,'Output must be a fresh flat validation JSON path.');
assert.ok(!existsSync(output),'Fresh report required; an existing report will not be replaced.');
const expectedHabitatSha=process.argv[2];
assert.match(expectedHabitatSha||'',/^[a-f0-9]{64}$/,'Pass the held habitat source SHA256.');
const scriptPath='scripts/inspect-reef-continuous-ledge-animal-points-v1.mjs';
const paths=['src/simulation.js','src/species.js','src/habitat.js','src/reefScenery.js',
  'src/world/ReefWorld.js','src/world/reefTerrain.js','src/world/reefSpatialQueries.js',
  'src/world/organisms.js',scriptPath];
const buffers=Object.fromEntries(paths.map(p=>[p,readFileSync(p)]));
const sourceSha256Before=Object.fromEntries(paths.map(p=>[p,sha(buffers[p])]));
assert.equal(sourceSha256Before['src/habitat.js'],expectedHabitatSha,'Held source differs: do not sample another version.');
const archive='output/validation/sources/reef-shelf-round-2-before';
function listFiles(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?listFiles(join(dir,e.name)):[join(dir,e.name)]);
}
const archivedFiles=listFiles(archive);
const archivedSourceSha256=Object.fromEntries(archivedFiles.map(p=>[relative(archive,p).replaceAll('\\','/'),sha(readFileSync(p))]));
const [simulationModule,speciesModule,habitat,terrain,spatial,organisms,beforeHabitat]=await Promise.all([
  import('../src/simulation.js'),import('../src/species.js'),import('../src/habitat.js'),
  import('../src/world/reefTerrain.js'),import('../src/world/reefSpatialQueries.js'),
  import('../src/world/organisms.js'),import(pathToFileURL(resolve(archive,'src/habitat.js')).href)
]);
const {ReefSimulation}=simulationModule,{speciesById}=speciesModule;
const {REEF_ROCKS,REEF_BRIDGE_ROCK_INDEX}=habitat;
const {createReefRockGeometry}=terrain,{enableStaticRayQueries}=spatial;
const {createOrganism,animateOrganism,disposeOrganism}=organisms;
const world=buffers['src/world/ReefWorld.js'].toString('utf8');
const poseStart=world.indexOf('  updateOrganism(agent,entity,metrics){'),poseEnd=world.indexOf('  select(id)',poseStart);
assert.ok(poseStart>=0&&poseEnd>poseStart,'Exact World pose method delimiters must exist.');
const poseMethod=world.slice(poseStart,poseEnd);
const Fixture=new Function('THREE','clamp','animateOrganism','return class AnimalPointFixture {'+poseMethod+'}')(THREE,THREE.MathUtils.clamp,animateOrganism);
const fixture=new Fixture();Object.assign(fixture,{isDeep:false,isKelp:false});
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),rocks=[],ray=new THREE.Raycaster();
ray.firstHitOnly=false;ray.near=0;
const down=new THREE.Vector3(0,-1,0),epsilonM=1e-7,normalEpsilon=1e-9;
const probeNames=['root','nose','tail','bodyBottomProxy','benthicRoot'];
const newStats=()=>({samples:0,bboxRejected:0,noTriangleColumn:0,triangleColumns:0,rawTriangleHits:0,
  occupiedIntervals:0,inside:0,onBoundary:0,inconclusive:0,
  negativeTopGapButOutside:0,minSignedVerticalBoundaryGapM:null,minimumCase:null,
  maxPenetrationM:0,maximumPenetrationCase:null});
function extremeIndices(attribute,sign){
  let extreme=sign>0?-Infinity:Infinity;
  for(let i=0;i<attribute.count;i++)extreme=sign>0?Math.max(extreme,attribute.getX(i)):Math.min(extreme,attribute.getX(i));
  const indices=[];for(let i=0;i<attribute.count;i++)if(Math.abs(attribute.getX(i)-extreme)<1e-7)indices.push(i);
  assert.ok(indices.length);return indices;
}
function endpoint(mesh,indices){
  const p=mesh.geometry.attributes.position;let chosen=null;
  for(const i of indices){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);if(!chosen||v.y<chosen.y)chosen=v;}
  return chosen;
}
function columnIntervals(mesh,p){
  const box=mesh.geometry.boundingBox;
  if(p.x<box.min.x-epsilonM||p.x>box.max.x+epsilonM||p.z<box.min.z-epsilonM||p.z>box.max.z+epsilonM)
    return {kind:'bboxRejected',intervals:[],rawTriangleHits:0};
  const originY=Math.max(box.max.y+.5,p.y+.5);
  ray.far=originY-box.min.y+.5;ray.set(new THREE.Vector3(p.x,originY,p.z),down);
  const hits=ray.intersectObject(mesh,false);
  if(!hits.length)return {kind:'noTriangleColumn',intervals:[],rawTriangleHits:0};
  const groups=[];
  for(const hit of hits){
    let group=groups.at(-1);
    if(!group||Math.abs(group.y-hit.point.y)>epsilonM){group={y:hit.point.y,positive:[],negative:[],tangent:[]};groups.push(group);}
    const ny=hit.face?.normal.y;
    if(!Number.isFinite(ny))return {kind:'inconclusive',reason:'nonfinite actual triangle normal',rawTriangleHits:hits.length,intervals:[]};
    group[ny>normalEpsilon?'positive':ny< -normalEpsilon?'negative':'tangent'].push(hit.faceIndex);
  }
  const crossings=groups.filter(g=>!(g.positive.length&&g.negative.length)&&Boolean(g.positive.length||g.negative.length));
  const intervals=[];let upper=null;
  for(const g of crossings){
    if(g.positive.length){
      if(upper)return {kind:'inconclusive',reason:'two downward entries without exit',groups,rawTriangleHits:hits.length,intervals};
      upper=g;
    }else{
      if(!upper)return {kind:'inconclusive',reason:'downward exit without prior entry',groups,rawTriangleHits:hits.length,intervals};
      intervals.push({bottomY:g.y,topY:upper.y,topFaceIndices:upper.positive,bottomFaceIndices:g.negative});
      upper=null;
    }
  }
  if(upper)return {kind:'inconclusive',reason:'entry without closed exit',groups,rawTriangleHits:hits.length,intervals};
  if(!intervals.length)return {kind:'noTriangleColumn',tangentOnly:true,rawTriangleHits:hits.length,intervals:[]};
  let nearest=null,boundary=false,inside=false;
  for(const interval of intervals){
    const bottomGap=p.y-interval.bottomY,topGap=p.y-interval.topY;
    const within=p.y>interval.bottomY+epsilonM&&p.y<interval.topY-epsilonM;
    const touching=Math.abs(bottomGap)<=epsilonM||Math.abs(topGap)<=epsilonM;
    const gap=within?-Math.min(bottomGap,-topGap):touching?0:Math.min(Math.abs(bottomGap),Math.abs(topGap));
    if(nearest===null||gap<nearest.gapM)nearest={gapM:gap,interval};
    inside ||= within;boundary ||= touching;
  }
  return {kind:'triangleColumns',rawTriangleHits:hits.length,intervals,inside,onBoundary:boundary,
    signedVerticalBoundaryGapM:nearest.gapM,nearestInterval:nearest.interval,
    rawHighestTopGapM:p.y-Math.max(...intervals.map(i=>i.topY))};
}
function addSample(stat,result,context){
  stat.samples++;stat.rawTriangleHits+=result.rawTriangleHits||0;
  if(result.kind==='inconclusive'){stat.inconclusive++;return;}
  if(result.kind==='bboxRejected'||result.kind==='noTriangleColumn'){stat[result.kind]++;return;}
  stat.triangleColumns++;stat.occupiedIntervals+=result.intervals.length;
  if(result.inside)stat.inside++;if(result.onBoundary)stat.onBoundary++;
  if(result.rawHighestTopGapM< -epsilonM&&!result.inside&&!result.onBoundary)stat.negativeTopGapButOutside++;
  const c={...context,signedVerticalBoundaryGapM:result.signedVerticalBoundaryGapM,
    rawHighestTopGapM:result.rawHighestTopGapM,nearestActualTriangleInterval:result.nearestInterval};
  if(stat.minSignedVerticalBoundaryGapM===null||result.signedVerticalBoundaryGapM<stat.minSignedVerticalBoundaryGapM){
    stat.minSignedVerticalBoundaryGapM=result.signedVerticalBoundaryGapM;stat.minimumCase=c;
  }
  const depth=Math.max(0,-result.signedVerticalBoundaryGapM);
  if(depth>stat.maxPenetrationM){stat.maxPenetrationM=depth;stat.maximumPenetrationCase=c;}
}
// Same current model/species logic with only its habitat import redirected to
// the saved pre-round-2 module. This is an initial-pose counterfactual, not an
// earlier captured scene, not a dynamic trajectory or ecological A/B replay.
const simulationText=buffers['src/simulation.js'].toString('utf8');
const counterfactualText=simulationText
  .replace("from './species.js'",'from '+JSON.stringify(pathToFileURL(resolve('src/species.js')).href))
  .replace("from './habitat.js'",'from '+JSON.stringify(pathToFileURL(resolve(archive,'src/habitat.js')).href));
assert.notEqual(counterfactualText,simulationText);
const {ReefSimulation:BeforeHabitatSimulation}=await import('data:text/javascript;base64,'+Buffer.from(counterfactualText).toString('base64'));
const cases=[],issues=[],negativeTopGapOutsideExamples=[];
const totalByProbe=Object.fromEntries(probeNames.map(p=>[p,newStats()]));
const totalByRock=Object.fromEntries([7,8,9].map(i=>[i,newStats()]));
try{
  for(const rockIndex of [7,8,9]){
    const geometry=createReefRockGeometry(REEF_ROCKS[rockIndex],{bedSupported:rockIndex!==REEF_BRIDGE_ROCK_INDEX});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='actual-rock-'+rockIndex;mesh.updateMatrixWorld(true);
    enableStaticRayQueries(mesh);assert.ok(geometry.boundsTree);
    rocks.push({rockIndex,mesh,definition:REEF_ROCKS[rockIndex].slice(),beforeDefinition:beforeHabitat.REEF_ROCKS[rockIndex].slice(),
      profileKind:habitat.reefRockProfile(REEF_ROCKS[rockIndex])?.shapeKind,
      triangles:geometry.index.count/3,vertices:geometry.attributes.position.count,
      boundsM:{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}});
  }
  for(const seed of [1,42,2026]){
    const sim=new ReefSimulation(seed),oldSim=new BeforeHabitatSimulation(seed),entities=new Map();
    const beforeById=new Map(oldSim.agents.map(a=>[a.id,a])),initialPoseChanges=[],initialRoots=new Map();
    for(const agent of sim.agents){
      const old=beforeById.get(agent.id);assert.ok(old);
      const delta={x:agent.position.x-old.position.x,y:agent.position.y-old.position.y,z:agent.position.z-old.position.z};
      if(Math.hypot(delta.x,delta.y,delta.z)>1e-12)initialPoseChanges.push({agentId:agent.id,speciesId:agent.speciesId,
        beforeM:{...old.position},afterM:{...agent.position},deltaM:delta});
      assert.equal(agent.sizeM,old.sizeM);assert.equal(agent.heading,old.heading);
      initialRoots.set(agent.id,new THREE.Vector3(agent.position.x,agent.position.y,agent.position.z));
      if(speciesById[agent.speciesId].kind!=='fish')continue;
      const object=createOrganism(speciesById[agent.speciesId]);
      const body=object.userData.detail.near.children.find(o=>o.isMesh&&o.material.map?.image?.width===528);
      const tail=object.userData.animation.tail.children.find(o=>o.isMesh);
      assert.ok(body&&tail,'Actual fish anatomy landmarks required.');
      entities.set(agent.id,{object,kind:'fish',body,tail,noseIndices:extremeIndices(body.geometry.attributes.position,1),
        tailIndices:extremeIndices(tail.geometry.attributes.position,-1)});
    }
    const byProbe=Object.fromEntries(probeNames.map(p=>[p,newStats()])),byRock=Object.fromEntries([7,8,9].map(i=>[i,newStats()]));
    const distinctAnimalIds=new Set(),distinctKinds=new Set(),movedFishIds=new Set();
    let sampledPoints=0,maxRootDisplacementM=0;
    try{
      for(let tick=0;tick<=300;tick++){
        const metrics=sim.metrics;
        for(const agent of sim.agents){
          const animalKind=speciesById[agent.speciesId].kind;
          if(!agent.alive||animalKind==='coral'||animalKind==='algae')continue;
          distinctAnimalIds.add(agent.id);distinctKinds.add(animalKind);
          let probes;
          if(animalKind==='fish'){
            const e=entities.get(agent.id);fixture.updateOrganism(agent,e,metrics);e.object.updateMatrixWorld(true);
            const root=e.object.getWorldPosition(new THREE.Vector3());
            const displacement=root.distanceTo(initialRoots.get(agent.id));maxRootDisplacementM=Math.max(maxRootDisplacementM,displacement);
            if(displacement>.001)movedFishIds.add(agent.id);
            probes={root,nose:endpoint(e.body,e.noseIndices),tail:endpoint(e.tail,e.tailIndices),
              bodyBottomProxy:root.clone().add(new THREE.Vector3(0,-.3*agent.sizeM,0))};
          }else probes={benthicRoot:new THREE.Vector3(agent.position.x,agent.position.y,agent.position.z)};
          for(const [probeKind,p]of Object.entries(probes)){
            assert.ok(p.toArray().every(Number.isFinite));sampledPoints++;
            for(const {rockIndex,mesh}of rocks){
              const result=columnIntervals(mesh,p);
              const context={seed,timeSec:metrics.timeSec,agentId:agent.id,speciesId:agent.speciesId,animalKind,
                probeKind,rockIndex,pointM:p.toArray(),agentSizeM:agent.sizeM};
              for(const stat of [byProbe[probeKind],byRock[rockIndex],totalByProbe[probeKind],totalByRock[rockIndex]])addSample(stat,result,context);
              if((result.inside||result.onBoundary||result.kind==='inconclusive')&&issues.length<24)
                issues.push({...context,...result});
              if(result.rawHighestTopGapM< -epsilonM&&!result.inside&&!result.onBoundary&&negativeTopGapOutsideExamples.length<12)
                negativeTopGapOutsideExamples.push({...context,...result});
            }
          }
        }
        if(tick<300)sim.step(.1);
      }
      cases.push({seed,simulationSeconds:sim.timeSec,snapshots:301,stepSeconds:.1,sampledPoints,
        distinctAnimalIds:[...distinctAnimalIds],distinctAnimalKinds:[...distinctKinds],
        movedFishCount:movedFishIds.size,maxFishRootDisplacementM:maxRootDisplacementM,
        byProbe,byRock,initialPoseCounterfactualChanges:initialPoseChanges});
    }finally{for(const e of entities.values())disposeOrganism(e.object);}
  }
  const sourceSha256After=Object.fromEntries(paths.map(p=>[p,sha(readFileSync(p))]));
  const archivedSourceSha256After=Object.fromEntries(archivedFiles.map(p=>[relative(archive,p).replaceAll('\\','/'),sha(readFileSync(p))]));
  const sourceStable=JSON.stringify(sourceSha256Before)===JSON.stringify(sourceSha256After);
  const archiveStable=JSON.stringify(archivedSourceSha256)===JSON.stringify(archivedSourceSha256After);
  const actualLandmarkInside=['root','nose','tail','benthicRoot'].reduce((n,p)=>n+totalByProbe[p].inside,0);
  const proxyInside=totalByProbe.bodyBottomProxy.inside,inconclusive=Object.values(totalByRock).reduce((n,s)=>n+s.inconclusive,0);
  const report={schema:'reef-continuous-ledge-animal-points-v1',observedAtUtc:new Date().toISOString(),
    status:sourceStable&&archiveStable&&actualLandmarkInside===0&&proxyInside===0&&inconclusive===0?'passed-finite-samples':'failed-finite-samples',
    heldHabitatSha256:expectedHabitatSha,sourceSha256Before,sourceSha256After,sourceStable,
    archivedSourceDirectory:archive,archivedSourceSha256,archivedSourceSha256After,archiveStable,
    exactWorldPoseMethodSha256:sha(poseMethod),
    geometry:rocks.map(({mesh,...r})=>r),cases,totalByProbe,totalByRock,
    actualLandmarkInsideCount:actualLandmarkInside,bodyBottomProxyInsideCount:proxyInside,inconclusiveCount:inconclusive,
    countUnits:'Each byProbe sample is one point-versus-one-rock query (three queries per point); case sampledPoints counts distinct emitted points before rock queries.',
    issues,negativeTopGapOutsideExamples,
    probeDefinitions:{
      root:'Displayed fish object world root after exact current World pose/animation.',
      nose:'Lowest world-Y among maximum local-X vertices of actual near body geometry.',
      tail:'Lowest world-Y among minimum local-X vertices of actual near caudal geometry after animation.',
      bodyBottomProxy:'World-vertical point 0.3 times agent.sizeM below displayed root; a heuristic clearance point, not an actual body surface.',
      benthicRoot:'Current model translation root for living shrimp, crab, cucumber, star, snail and clam; World source assigns this exact position.'},
    intervalMethod:'Downward all-hit rays on actual DoubleSide rock 7/8/9 triangles using existing indirect BVH. Deduplicate co-height hits within 1e-7m; geometric normal signs form closed occupied top/bottom intervals. Strict actual point membership determines inside, never highest-top gap alone. Mixed entry/exit co-height grazing groups are omitted; malformed open/alternating crossings are inconclusive.',
    gapDefinition:'Signed vertical distance to nearest boundary of an actual occupied interval: negative only inside; positive when above, below or between intervals. This is not Euclidean distance to nearest triangle. No intersecting vertical column gives null gap and reduced coverage.',
    poseChangeScope:{method:'Same current simulation/species source, same seeds/RNG/size/heading, habitat import redirected to saved pre-round-2 habitat for t=0 only.',
      redirectedSimulationTextSha256:sha(counterfactualText),notes:[
        'Rock 7 profile is buried below sediment; rock 8 is scaled/moved into a low rear fragment; rock 9 is one continuous visible ledge with a side crevice. These change shared model heights, so animal initialization and subsequent trajectories can change.',
        'Initial position differences are computed above; they are not a recorded old browser scene or strict ecological A/B. The saved geometry report owns the separate 28-other-buffer exact claim, which is not rechecked here.']},
    limitations:[
      'Three seeds, 30 model seconds, 0.1s snapshots at ordinary authored population; not browser time, endurance, GPU or ecology acceptance.',
      'Only actual fish root/nose/tail landmarks, one body-bottom proxy and nonfish roots, not whole animals, all vertices, fins, swept volumes or continuous collision.',
      'Only rock 7/8/9; sediment, other 28 rock buffers, corals, scans, particles and animal-animal contacts are excluded.',
      'No vertical triangle column or no hit on a particular rock is coverage absence, not proof of clearance or complete collision safety.',
      'Constructor-free Node World pose fixture and fresh organism anatomy phases; no replay of an actual browser frame.',
      'Any body-bottom proxy penetration is a potential proxy-clearance risk, not proof that the real mesh body penetrates.'],
    cpuInspectionMs:performance.now()-started};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,sha256:sha(readFileSync(output)),status:report.status,sourceStable,archiveStable,
    actualLandmarkInside,proxyInside,inconclusive,cases:cases.map(c=>({seed:c.seed,simulationSeconds:c.simulationSeconds,
      sampledPoints:c.sampledPoints,movedFishCount:c.movedFishCount,initialPoseChanges:c.initialPoseCounterfactualChanges})),
    byProbe:Object.fromEntries(Object.entries(totalByProbe).map(([p,s])=>[p,{samples:s.samples,
      triangleColumns:s.triangleColumns,inside:s.inside,onBoundary:s.onBoundary,inconclusive:s.inconclusive,
      negativeTopGapButOutside:s.negativeTopGapButOutside,minSignedVerticalBoundaryGapM:s.minSignedVerticalBoundaryGapM}])),
    byRock:Object.fromEntries(Object.entries(totalByRock).map(([i,s])=>[i,{samples:s.samples,triangleColumns:s.triangleColumns,
      inside:s.inside,inconclusive:s.inconclusive,minSignedVerticalBoundaryGapM:s.minSignedVerticalBoundaryGapM}])),
    cpuInspectionMs:report.cpuInspectionMs}));
}finally{for(const {mesh}of rocks)mesh.geometry.dispose();material.dispose();}
