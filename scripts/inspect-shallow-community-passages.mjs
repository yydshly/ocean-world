// Finite batch evidence. Actual meshes/CPU only; no browser or GPU claims.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

const project=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(project,'output/validation/shallow-community-passages');
const originals=['src/shallowSample.js','src/shallowSampleLivingCover.js','src/shallowSampleSlopeAnimals.js',
  'src/shallowSampleReefSlope.js','src/shallowSampleSandHabitat.js','src/shallowSampleSoftBedFit.js',
  'src/oceanRockShape.js','src/world/ShallowSampleScene.js','src/world/ShallowLiveReefAssets.js'];
const frozen=new Map(originals.map(p=>[path.resolve(project,p),path.join(root,`before-${path.basename(p,'.js')}.mjs`)]));
for(const source of originals){
  const original=path.resolve(project,source);
  const rewritten=fs.readFileSync(path.join(root,path.basename(source)),'utf8').replace(/\bfrom\s*(['"])([^'"]+)\1/g,(match,_q,specifier)=>{
    if(!specifier.startsWith('.'))return match;
    const target=path.resolve(path.dirname(original),specifier);
    return `from '${pathToFileURL(frozen.get(target)??target).href}'`;
  });
  fs.writeFileSync(frozen.get(original),rewritten);
}
// Freeze preparation can run before tests/renders without scene construction.
if(process.argv.includes('--prepare-only')){console.log('Nine frozen batch 11 modules prepared');process.exit(0);}
const {ShallowSampleScene:BeforeScene}=await import(pathToFileURL(frozen.get(path.resolve(project,'src/world/ShallowSampleScene.js'))).href);
const sha=data=>createHash('sha256').update(data).digest('hex');
const identities=m=>m.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
const counts=w=>({animals:w.model.agents.length,types:new Set(w.model.agents.map(a=>a.speciesId)).size,
  rocks:w.model.rocks.length,corals:w.model.corals.length,slopeCorals:w.model.corals.filter(c=>c.growthPatch||c.host.startsWith('sample-live-slope-')).length,
  grass:w.model.grass.length,rubble:w.model.rubble.length,forms:Object.fromEntries(['branching','table','massive','fan'].map(f=>[f,w.model.corals.filter(c=>c.form===f).length]))});
let before,after;
try{
  before=new BeforeScene(55);after=new ShallowSampleScene(55);
  const identityExact=JSON.stringify(identities(before.model))===JSON.stringify(identities(after.model));
  const bedExact=Buffer.from(before.model.bed.heights.buffer).equals(Buffer.from(after.model.bed.heights.buffer));
  const rocksExact=JSON.stringify(before.model.rocks)===JSON.stringify(after.model.rocks);
  if(!identityExact||!bedExact||!rocksExact)throw Error('Unintended body, bed or hard-slope change');
  const timing=w=>{
    for(let i=0;i<50;i++)w.update(i*.1);
    const samples=[];for(let i=0;i<=600;i++){const start=performance.now();w.update(i/8);samples.push(performance.now()-start);}
    samples.sort((a,b)=>a-b);return{updates:601,modelSeconds:75,medianMs:samples[300],p95Ms:samples[570],maxMs:samples.at(-1)};
  };
  // Sequential same machine/load. Model content differs intentionally; no
  // GPU/FPS inference or claim of identical scene workload is made.
  const beforeTiming=timing(before),afterTiming=timing(after);
  let meshes=0;after.scene.traverse(o=>{if(o.isMesh)meshes++;});
  const schoolMetrics=w=>{
    const minima=new Map(),frameMetrics=[];w.camera.aspect=1280/720;w.camera.updateProjectionMatrix();
    for(let i=0;i<=600;i++){
      const time=i/8;w.update(time);w.camera.updateMatrixWorld(true);
      for(const a of w.model.agents.filter(a=>a.mode==='school')){
        const gap=Math.hypot(a.position.x-w.camera.position.x,a.position.z-w.camera.position.z)-a.clearance.radius;
        if(!minima.has(a.speciesId)||gap<minima.get(a.speciesId).gap)minima.set(a.speciesId,{gap,time,agentId:a.id});
      }
    }
    for(const e of w.model.encounters){w.update(e.time);w.camera.updateMatrixWorld(true);let inFrame=0,broadside=0;const sizes=[];
      for(const a of e.agents){const point=new THREE.Vector3(a.position.x,a.position.y,a.position.z),d=point.distanceTo(w.camera.position),v=point.clone().sub(w.camera.position).normalize();
        const side=Math.sqrt(Math.max(0,1-new THREE.Vector3(Math.cos(a.heading),0,Math.sin(a.heading)).dot(v)**2)),ndc=point.project(w.camera);
        if(d<8&&Math.abs(ndc.x)<.85&&Math.abs(ndc.y)<.8&&ndc.z>-1&&ndc.z<1){inFrame++;if(side>.7)broadside++;sizes.push(a.sizeM*side/d*720/(2*Math.tan(58*Math.PI/360)));}}
      sizes.sort((a,b)=>a-b);frameMetrics.push({time:e.time,label:e.label,total:e.agents.length,inFrame,broadside,medianBodyPixels:sizes[Math.floor(sizes.length/2)]});
    }return{minimumHorizontalBodyGap:Object.fromEntries(minima),defaultEncounters:frameMetrics};
  };
  const sources={};for(const source of [...originals,'src/shallowSampleSchoolPassages.js','tests/shallow-school-passages.test.mjs','tests/shallow-canopy-composition.test.mjs','tests/shallow-slope-animals.test.mjs','scripts/render-shallow-sample.mjs','scripts/inspect-shallow-community-passages.mjs'])
    sources[source]=sha(fs.readFileSync(path.join(project,source)));
  const result={date:'2026-10-10',batch:12,scope:'finite local 75-second community passages and irregular canopy',seed:55,
    before:counts(before),after:counts(after),animalIdentitySpeciesSizeExact:identityExact,bedHeightsExact:bedExact,hardReefLayoutExact:rocksExact,
    schoolPassages:{method:'world-fixed whole-shoal side passages; smaller bounded orbit/drift, natural body size unchanged',
      before:schoolMetrics(before),after:schoolMetrics(after),count:after.model.schoolPassages.length},
    native:{kind:'sequential native CPU scene updates; not browser startup, GPU or equal-content performance comparison',before:beforeTiming,after:afterTiming,meshObjects:meshes,meshBudget:350},
    canopy:{layout:after.model.livingCoverComposition.layout,naturalGaps:after.model.livingCoverComposition.naturalGaps,
      activePatches:new Set(after.model.corals.map(c=>c.growthPatch).filter(Boolean)).size,candidateBudget:after.model.livingCoverComposition.candidateBudget},
    residents:{count:after.model.slopeHabitats.residents.length,fish:after.model.slopeHabitats.fish.length,spaces:after.model.slopeHabitats.footprints,unplaced:after.model.slopeHabitats.unplaced},
    checks:{cases:'pending',localBuild:'pending'},preview:{kind:'actual mesh/albedo CPU projection; no WebGL/FPS or full dynamic playback proof',review:'pending'},sources};
  fs.writeFileSync(path.join(root,'stage.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,sources:undefined,residents:{...result.residents,spaces:result.residents.spaces.length}},null,2));
}finally{before?.dispose();after?.dispose();}
