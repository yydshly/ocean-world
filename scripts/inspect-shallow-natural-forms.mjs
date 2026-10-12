// One finite whole-scene receipt. Native geometry only; no browser/FPS claim.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {oceanRockMesh} from '../src/oceanRockShape.js';
import {shallowLiveReefGeometries} from '../src/world/ShallowLiveReefAssets.js';

const project=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(project,'output/validation/shallow-natural-forms');
const originals=['src/shallowSample.js','src/shallowSampleLivingCover.js','src/shallowSampleSlopeAnimals.js',
  'src/shallowSampleReefSlope.js','src/shallowSampleSandHabitat.js','src/shallowSampleSoftBedFit.js',
  'src/shallowSampleSchoolPassages.js','src/oceanRockShape.js','src/world/ShallowSampleScene.js',
  'src/world/ShallowLiveReefAssets.js','src/world/ShallowNaturalAssets.js'];
const frozen=new Map(originals.map(p=>[path.resolve(project,p),path.join(root,`before-${path.basename(p,'.js')}.mjs`)]));
for(const source of originals){
  const original=path.resolve(project,source);
  const rewritten=fs.readFileSync(path.join(root,'before-source',source),'utf8').replace(/\bfrom\s*(['"])([^'"]+)\1/g,(match,_q,specifier)=>{
    if(!specifier.startsWith('.'))return match;
    const target=path.resolve(path.dirname(original),specifier);
    return `from '${pathToFileURL(frozen.get(target)??target).href}'`;
  });
  fs.writeFileSync(frozen.get(original),rewritten);
}
if(process.argv.includes('--prepare-only')){console.log('Eleven frozen batch 12 modules prepared');process.exit(0);}
const {ShallowSampleScene:BeforeScene}=await import(pathToFileURL(frozen.get(path.resolve(project,'src/world/ShallowSampleScene.js'))).href);
const {oceanRockMesh:beforeRockMesh}=await import(pathToFileURL(frozen.get(path.resolve(project,'src/oceanRockShape.js'))).href);
const sha=data=>createHash('sha256').update(data).digest('hex');
const identity=m=>m.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
const counts=w=>({animals:w.model.agents.length,types:new Set(w.model.agents.map(a=>a.speciesId)).size,
  rocks:w.model.rocks.length,corals:w.model.corals.length,slopeCorals:w.model.corals.filter(c=>c.growthPatch).length,
  grass:w.model.grass.length,rubble:w.model.rubble.length,
  forms:Object.fromEntries(['branching','table','massive','fan'].map(f=>[f,w.model.corals.filter(c=>c.form===f).length]))});
let before,after;
try{
  before=new BeforeScene(55);after=new ShallowSampleScene(55);
  const identityExact=JSON.stringify(identity(before.model))===JSON.stringify(identity(after.model));
  const bedExact=Buffer.from(before.model.bed.heights.buffer).equals(Buffer.from(after.model.bed.heights.buffer));
  const transformsExact=JSON.stringify(before.model.rocks)===JSON.stringify(after.model.rocks);
  const oldProfiles=['mound','terrace','ridge','natural-a','natural-b','natural-c','sample-reef-a','sample-reef-b','sample-reef-c'];
  const legacyExact=oldProfiles.every(p=>JSON.stringify(oceanRockMesh(p))===JSON.stringify(beforeRockMesh(p)));
  if(!identityExact||!bedExact||!transformsExact||!legacyExact)throw Error('Unintended identity, bed, rock transform or legacy surface change');
  const slopeProfiles=['sample-slope-a','sample-slope-b','sample-slope-c'];
  const slopeSurfaces=Object.fromEntries(slopeProfiles.map(p=>[p,{before:sha(JSON.stringify(beforeRockMesh(p))),after:sha(JSON.stringify(oceanRockMesh(p))),
    vertices:oceanRockMesh(p).positions.length/3,triangles:oceanRockMesh(p).indices.length/3}]));
  const canopy={};for(const detail of ['near','distant']){
    const family=shallowLiveReefGeometries(detail);
    try{canopy[detail]=Object.fromEntries(Object.entries(family).map(([id,g])=>[id,{vertices:g.attributes.position.count,triangles:g.index.count/3,rootRadius:g.userData.rootRadius}]));}
    finally{Object.values(family).forEach(g=>g.dispose());}
  }
  let meshObjects=0;after.scene.traverse(o=>{if(o.isMesh)meshObjects++;});
  for(let i=0;i<50;i++)after.update(i*.1);
  const durations=[];for(let i=0;i<=600;i++){const start=performance.now();after.update(i/8);durations.push(performance.now()-start);}
  durations.sort((a,b)=>a-b);
  const prior=JSON.parse(fs.readFileSync(path.join(project,'output/validation/shallow-community-passages/final/render.json'),'utf8'));
  const cameras=prior.frames.map(f=>{after.update(f.time);after.camera.aspect=f.width/f.height;after.camera.updateProjectionMatrix();after.camera.updateMatrixWorld(true);
    const current=after.camera.matrixWorld.toArray();return{time:f.time,matrixMaxAbsError:Math.max(...current.map((v,i)=>Math.abs(v-f.cameraMatrix[i])))};});
  const sources={};for(const file of [...originals,'scripts/render-shallow-sample.mjs','scripts/inspect-shallow-natural-forms.mjs'])sources[file]=sha(fs.readFileSync(path.join(project,file)));
  const result={date:'2026-10-10',batch:13,seed:55,scope:'finite local whole-form reef/coral/principal-school asset upgrade',
    before:counts(before),after:counts(after),preservation:{animalIdentitySpeciesSizeExact:identityExact,bedHeightsExact:bedExact,rockTransformsExact:transformsExact,
      nineLegacySurfacesByteExact:legacyExact,scope:'sample-slope surfaces change intentionally; transform equality is not full surface equality'},
    slopeSurfaces,canopy,residents:{spaces:after.model.slopeHabitats.footprints.length,unplaced:after.model.slopeHabitats.unplaced},
    native:{kind:'current sequential native CPU update; not equal-workload comparison, browser startup, GPU or FPS',updates:601,modelSeconds:75,
      medianMs:durations[300],p95Ms:durations[570],maxMs:durations.at(-1),meshObjects,meshBudget:350},
    priorCameraComparison:cameras,checks:{localBuild:'pending',cases:'pending'},preview:{review:'pending',kind:'actual mesh/albedo offline CPU; no WebGL/shadows/FPS or full playback proof'},sources};
  fs.writeFileSync(path.join(root,'stage.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,canopy:undefined,sources:undefined},null,2));
}finally{before?.dispose();after?.dispose();}
