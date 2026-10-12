// Finite native receipt. Actual scene geometry, never browser/FPS evidence.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {ShallowSampleScene as BeforeScene} from '../output/validation/shallow-sourced-assets/before-ShallowSampleScene.mjs';
import {sampleSourcedFishVertex} from '../src/world/ShallowSourcedFishAssets.js';

const output='output/validation/shallow-sourced-assets';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const identities=m=>m.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
const counts=w=>({animals:w.model.agents.length,species:new Set(w.model.agents.map(a=>a.speciesId)).size,
  rocks:w.model.rocks.length,colonies:w.model.corals.length,slopeColonies:w.model.corals.filter(c=>c.growthPatch).length,
  grass:w.model.grass.length,rubble:w.model.rubble.length});
let before,after;
try {
  before=new BeforeScene(55);after=new ShallowSampleScene(55);
  const oldIds=new Set(before.model.agents.map(a=>a.id));
  const oldAnimalsExact=JSON.stringify(identities(before.model))===JSON.stringify(identities({agents:after.model.agents.filter(a=>oldIds.has(a.id))}));
  const bedExact=Buffer.from(before.model.bed.heights.buffer).equals(Buffer.from(after.model.bed.heights.buffer));
  const rocksExact=JSON.stringify(before.model.rocks)===JSON.stringify(after.model.rocks);
  const defaultCrownsExact=JSON.stringify(before.model.corals)===JSON.stringify(after.model.corals);
  const added=after.model.agents.filter(a=>!oldIds.has(a.id)).map(a=>({id:a.id,speciesId:a.speciesId,sizeM:a.sizeM}));
  if(!oldAnimalsExact||!bedExact||!rocksExact||added.length!==3||added.some(a=>a.speciesId!=='barramundi'))throw Error('Unintended identity, substrate or population change');
  if(after.model.scannedReef||!defaultCrownsExact)throw Error('Rejected scan candidate changed the default crown layer');
  let meshObjects=0;after.scene.traverse(o=>{if(o.isMesh)meshObjects++;});
  if(meshObjects>=350)throw Error('Original mesh budget exceeded');
  const batch=after.animals.batches.find(b=>b.id==='barramundi'),part=batch.parts[0],g=part.mesh.geometry;
  const matrix=new THREE.Matrix4(),combined=new THREE.Matrix4(),point=new THREE.Vector3();
  let vertices=0,minClearance=Infinity;
  // Every source vertex at 31 supported route poses. This is discrete vertex
  // clearance, not swept continuous triangle collision or neighbour avoidance.
  for(let frame=0;frame<=30;frame++){
    const t=frame*2.5;after.update(t);after.scene.updateMatrixWorld(true);
    const wave=g.attributes.sampleSwim;
    for(let i=0;i<batch.agents.length;i++){
      part.mesh.getMatrixAt(i,matrix);combined.multiplyMatrices(part.mesh.matrixWorld,matrix);
      for(let v=0;v<g.attributes.position.count;v++){
        sampleSourcedFishVertex(g,v,t,wave.getX(i),wave.getY(i),wave.getZ(i),point).applyMatrix4(combined);
        const gap=point.y-after.model.surface(point.x,point.z,true);minClearance=Math.min(minClearance,gap);vertices++;
        if(gap<-.000006)throw Error(`Source fish vertex enters substrate at ${t}: ${gap}`);
      }
    }
  }
  const reference=JSON.parse(fs.readFileSync('output/validation/shallow-natural-forms/final/render.json','utf8'));
  const cameras=reference.frames.map(f=>{after.update(f.time);after.camera.aspect=f.width/f.height;after.camera.updateProjectionMatrix();after.camera.updateMatrixWorld(true);
    return {time:f.time,defaultMatrixMaxAbsError:Math.max(...after.camera.matrixWorld.toArray().map((n,i)=>Math.abs(n-f.cameraMatrix[i])))};});
  after.update(58);after.camera.aspect=1280/720;after.camera.updateProjectionMatrix();after.camera.updateMatrixWorld(true);
  const sourceFishView=batch.agents.map(a=>{const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=p.distanceTo(after.camera.position),ndc=p.clone().project(after.camera);
    const side=Math.sqrt(Math.max(0,1-new THREE.Vector3(Math.cos(a.heading),0,Math.sin(a.heading)).dot(p.clone().sub(after.camera.position).normalize())**2));
    return {id:a.id,distance,ndc:ndc.toArray(),approxBodyPixels:a.sizeM*side/distance*720/(2*Math.tan(58*Math.PI/360))};});
  const sourceFiles=['src/shallowSample.js','src/shallowSampleSpecies.js','src/shallowSampleLivingCover.js','src/world/ShallowSampleScene.js',
    'src/world/shallowSampleCoralAssets.js','src/world/ShallowScannedReefAssets.js','src/world/ShallowScannedReefData.js',
    'src/world/ShallowSourcedFishAssets.js','src/world/ShallowSourcedFishData.js','src/ShallowSampleApp.jsx',
    'scripts/render-shallow-sample.mjs','scripts/rasterize-shallow-sample.py','scripts/inspect-shallow-sourced-assets.mjs'];
  const sources=Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(file))]));
  const receipt={schema:'shallow-sourced-assets-stage-v1',date:'2026-10-11',batch:14,seed:55,scope:'finite local source fish integration; scan-coral candidate rejected from default',
    before:counts(before),after:counts(after),preservation:{original281IdentitySpeciesSizeExact:oldAnimalsExact,bedHeightsByteExact:bedExact,rockTransformsExact:rocksExact,defaultCrownsExact,
      note:'Existing animal supported positions may change with the actual new crown envelopes; no persistent exploration or save migration'},added,
    scanned:after.model.scannedCoverComposition,
    scanDecision:{defaultEnabled:false,experimentSelector:'reef=scanned',reason:'Independent whole-scene candidate review found material/background-patch regression at 58 and 69 seconds',candidateReceipt:'candidate-stage.json',candidateVisualReview:'visual-review.json'},
    native:{kind:'native geometry, not WebGL playback/GPU/startup/FPS',meshObjects,meshBudgetStrictlyLessThan:350,
      sourceFishVertexClearance:{routePoses:31,modelSeconds:75,vertices,minClearanceM:minClearance,continuousCollision:false},sourceFishViewAt58:sourceFishView},
    cameras:{reference:'shallow-natural-forms/final/render.json',currentDefault:cameras},sources,
    checks:{suite:'pending',localBuild:'pending'},preview:{kind:'actual projected triangles and perspective baseColor; not WebGL screenshots or full PBR',visualReview:'pending'}};
  fs.writeFileSync(`${output}/stage.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify({...receipt,sources:undefined},null,2));
} finally {before?.dispose();after?.dispose();}
