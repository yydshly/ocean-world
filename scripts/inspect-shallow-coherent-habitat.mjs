// Finite native whole-scene receipt, never a WebGL/FPS acceptance report.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {ShallowSampleScene as BeforeScene} from '../output/validation/shallow-coherent-habitat/before-src/world/ShallowSampleScene.js';
import {oceanRockMesh} from '../src/oceanRockShape.js';
import {oceanRockMesh as oldRockMesh} from '../output/validation/shallow-coherent-habitat/before-src/oceanRockShape.js';
import {shallowLiveReefGeometries} from '../src/world/ShallowLiveReefAssets.js';
const output='output/validation/shallow-coherent-habitat',sha=value=>createHash('sha256').update(value).digest('hex');
const counts=w=>({animals:w.model.agents.length,species:new Set(w.model.agents.map(a=>a.speciesId)).size,rocks:w.model.rocks.length,
  colonies:w.model.corals.length,slopeColonies:w.model.corals.filter(c=>c.host.startsWith('sample-live-slope-')).length,
  grass:w.model.grass.length,rubble:w.model.rubble.length});
const identities=w=>JSON.stringify(w.model.agents.map(a=>[a.id,a.speciesId,a.sizeM]));
let before,after;
try{
  before=new BeforeScene(55);after=new ShallowSampleScene(55);
  const preservation={animalIdentitySpeciesSizeExact:identities(before)===identities(after),
    bedByteExact:Buffer.from(before.model.bed.heights.buffer).equals(Buffer.from(after.model.bed.heights.buffer)),
    all85RockTransformsExact:JSON.stringify(before.model.rocks)===JSON.stringify(after.model.rocks)};
  const rockProfiles=Object.fromEntries([...new Set(after.model.rocks.map(r=>r.profile))].map(profile=>[profile,
    {unchanged:JSON.stringify(oceanRockMesh(profile))===JSON.stringify(oldRockMesh(profile)),
      rimXZExact:JSON.stringify(oceanRockMesh(profile).positions.filter((n,i)=>i%3!==1))===JSON.stringify(oldRockMesh(profile).positions.filter((n,i)=>i%3!==1))}]));
  if(Object.values(preservation).some(v=>!v))throw Error('Unintended identity, bed, or rock-transform change');
  for(const [profile,proof]of Object.entries(rockProfiles))if(!profile.startsWith('sample-slope-')&&!proof.unchanged)throw Error(`Historic profile changed: ${profile}`);
  let meshes=0;after.scene.traverse(o=>{if(o.isMesh)meshes++;});if(meshes>=350)throw Error('Original 350 mesh budget exceeded');
  const families={};for(const detail of ['near','distant']){
    const assets=shallowLiveReefGeometries(detail);
    families[detail]=Object.fromEntries(Object.entries(assets).map(([key,g])=>[key,{triangles:g.index.count/3,vertices:g.attributes.position.count,rootRadius:g.userData.rootRadius}]));
    Object.values(assets).forEach(g=>g.dispose());
  }
  const ref=JSON.parse(fs.readFileSync('output/validation/shallow-sourced-assets/final/render.json','utf8'));
  const cameras=ref.frames.map(f=>{after.update(f.time);after.camera.aspect=f.width/f.height;after.camera.updateProjectionMatrix();after.camera.updateMatrixWorld(true);
    return {time:f.time,defaultMatrixMaxAbsError:Math.max(...after.camera.matrixWorld.toArray().map((n,i)=>Math.abs(n-f.cameraMatrix[i])))};});
  const files=['src/oceanRockShape.js','src/shallowSampleReefSlope.js','src/shallowSampleSlopeAnimals.js','src/world/ShallowLiveReefAssets.js','src/world/ShallowHeroAnimals.js',
    'src/world/ShallowNaturalAssets.js','src/world/ShallowSampleScene.js','tests/shallow-natural-slope-structure.test.mjs',
    'tests/shallow-reef-slope.test.mjs','tests/shallow-school-body-kit.test.mjs','scripts/inspect-shallow-coherent-habitat.mjs'];
  const receipt={schema:'shallow-coherent-habitat-stage-v1',batch:15,date:'2026-10-11',seed:55,
    scope:'One local whole-asset and continuous-slope batch; authored geometry, not scans',before:counts(before),after:counts(after),preservation,rockProfiles,
    assets:{bodyKit:4,coralKit:4,slopeStructure:3,reefAlbedo:after.reefAlbedoFile,albedoSHA256:sha(fs.readFileSync(after.reefAlbedoFile)),
      textureNote:'Existing generated carbonate-v1 reused unchanged after a new built-in image generation was aborted; no new image output or CLI fallback'},
    native:{meshObjects:meshes,meshBudgetStrictlyLessThan:350,coralFamilies:families,currentDefaultCameras:cameras},
    sources:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(file))])),checks:{suite:'pending',localBuild:'pending'},
    preview:{kind:'CPU actual mesh and perspective albedo; not WebGL/PBR/playback/FPS',status:'pending'}};
  fs.writeFileSync(`${output}/stage.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify({...receipt,sources:undefined,native:{meshObjects:meshes,currentDefaultCameras:cameras}},null,2));
}finally{before?.dispose();after?.dispose();}
