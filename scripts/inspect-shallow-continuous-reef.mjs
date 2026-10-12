// One finite native evidence pass. No browser, URL access, tests or raw renders.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {oceanRockMesh} from '../src/oceanRockShape.js';

const project=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(project,'output/validation/shallow-continuous-reef');
const originals={
  'shallowSample.js':'src/shallowSample.js',
  'shallowSampleLivingCover.js':'src/shallowSampleLivingCover.js',
  'shallowSampleReefCommunity.js':'src/shallowSampleReefCommunity.js',
  'ShallowSampleScene.js':'src/world/ShallowSampleScene.js',
  'ShallowLiveReefAssets.js':'src/world/ShallowLiveReefAssets.js',
  'oceanRockShape.js':'src/oceanRockShape.js',
};
// Each relative dependency resolves against its original source location. All
// six frozen sources map to each other; unchanged dependencies map to source.
const frozen=new Map(Object.entries(originals).map(([name,source])=>[
  path.resolve(project,source),path.join(output,`before-${name.replace(/\.js$/,'.mjs')}`),
]));
for(const [name,source]of Object.entries(originals)){
  const original=path.resolve(project,source);
  const rewritten=fs.readFileSync(path.join(output,name),'utf8').replace(/\bfrom\s*(['"])([^'"]+)\1/g,(match,_quote,specifier)=>{
    if(!specifier.startsWith('.'))return match;
    const target=path.resolve(path.dirname(original),specifier);
    return `from '${pathToFileURL(frozen.get(target)??target).href}'`;
  });
  fs.writeFileSync(frozen.get(original),rewritten);
}
const {ShallowSampleScene:BeforeScene}=await import(pathToFileURL(frozen.get(path.resolve(project,'src/world/ShallowSampleScene.js'))).href);
const {oceanRockMesh:beforeRockMesh}=await import(pathToFileURL(frozen.get(path.resolve(project,'src/oceanRockShape.js'))).href);
const sha=data=>createHash('sha256').update(data).digest('hex');
const bytes=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const arrayEqual=(a,b)=>a.constructor===b.constructor&&bytes(a).equals(bytes(b));
const byForm=model=>Object.fromEntries(['branching','table','massive','fan'].map(form=>[form,model.corals.filter(c=>c.form===form).length]));
const terrain=world=>world.environment.children.filter(o=>o.name==='Continuous shallow sand bed'||o.name.startsWith('Sand terrain /'));
let world,beforeWorld;
try{
  const constructionStart=performance.now();world=new ShallowSampleScene(55);
  const constructionMs=performance.now()-constructionStart,model=world.model;
  let meshes=0,instancedMeshes=0;
  world.scene.traverse(o=>{if(o.isMesh)meshes++;if(o.isInstancedMesh)instancedMeshes++;});
  const samples=[];
  for(let i=0;i<=600;i++){
    const start=performance.now();world.update(i/8);samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);

  // The old scene is constructed solely to compare the actual terrain draws.
  // Its construction/update timing is not a before/after performance baseline.
  beforeWorld=new BeforeScene(55);const before=beforeWorld.model;
  const identities=m=>m.agents.map(a=>[a.id,a.speciesId,a.sizeM]);
  const animalIdentityAndSizeExact=JSON.stringify(identities(model))===JSON.stringify(identities(before));
  const oldTiles=terrain(beforeWorld),newTiles=terrain(world);
  const bedMetadataExact=['min','step','cells'].every(key=>model.bed[key]===before.bed[key]);
  const bedHeightsExact=arrayEqual(model.bed.heights,before.bed.heights),bedDraws=[];
  let bedPositionsExact=oldTiles.length===newTiles.length,bedIndicesExact=bedPositionsExact,bedNormalsExact=bedPositionsExact;
  for(let i=0;i<newTiles.length;i++){
    const old=oldTiles[i],current=newTiles[i];
    if(!old||old.name!==current.name)throw Error(`bed tile identity mismatch at ${i}`);
    const p=current.geometry.attributes.position,n=current.geometry.attributes.normal,index=current.geometry.index;
    const positionExact=arrayEqual(p.array,old.geometry.attributes.position.array);
    const normalExact=arrayEqual(n.array,old.geometry.attributes.normal.array);
    const indicesExact=arrayEqual(index.array,old.geometry.index.array);
    bedPositionsExact&&=positionExact;bedNormalsExact&&=normalExact;bedIndicesExact&&=indicesExact;
    bedDraws.push({name:current.name,vertices:p.count,indices:index.count,positionExact,normalExact,indicesExact,
      sha256:{position:sha(bytes(p.array)),normal:sha(bytes(n.array)),indices:sha(bytes(index.array))}});
  }
  const profileIds=['mound','terrace','ridge','natural-a','natural-b','natural-c','sample-reef-a','sample-reef-b','sample-reef-c'];
  const oldProfiles=Object.fromEntries(profileIds.map(id=>{
    const prior=sha(JSON.stringify(beforeRockMesh(id))),current=sha(JSON.stringify(oceanRockMesh(id)));
    return [id,{beforeSha256:prior,currentSha256:current,exact:prior===current}];
  }));
  const oldProfilesExact=Object.values(oldProfiles).every(p=>p.exact);
  const beforeCounts={animals:before.agents.length,types:new Set(before.agents.map(a=>a.speciesId)).size,
    rocks:before.rocks.length,corals:before.corals.length,forms:byForm(before),grass:before.grass.length,rubble:before.rubble.length};
  beforeWorld.dispose();beforeWorld=null;

  const final=JSON.parse(fs.readFileSync(path.join(output,'final/render.json'),'utf8'));
  const reference=JSON.parse(fs.readFileSync(path.join(project,'output/validation/shallow-habitat-completion/final/render.json'),'utf8'));
  const cameraComparisons=final.frames.map(frame=>{
    const prior=reference.frames.find(r=>r.time===frame.time);if(!prior)throw Error(`reference camera missing at ${frame.time}`);
    return {time:frame.time,maxError:Math.max(...frame.cameraMatrix.map((value,i)=>Math.abs(value-prior.cameraMatrix[i])))};
  });
  const cameraMaxError=Math.max(...cameraComparisons.map(row=>row.maxError));
  const supplement=JSON.parse(fs.readFileSync(path.join(output,'supplement/render.json'),'utf8'));
  const sourceFiles=[
    'src/shallowSample.js','src/shallowSampleLivingCover.js','src/shallowSampleSandHabitat.js',
    'src/shallowSampleReefSlope.js','src/shallowSampleSlopeAnimals.js','src/shallowSampleSoftBedFit.js',
    'src/oceanRockShape.js','src/world/ShallowLiveReefAssets.js','src/world/ShallowSampleScene.js',
    'tests/shallow-reef-slope.test.mjs','tests/shallow-slope-animals.test.mjs','tests/shallow-soft-bed-fit.test.mjs',
    'tests/shallow-live-reef-assets.test.mjs','scripts/inspect-shallow-continuous-reef.mjs',
  ];
  const result={date:'2026-10-10',batch:11,seed:55,scope:'local finite 75-second continuous living reef slope structure stage',
    before:beforeCounts,
    animals:{identitySpeciesAndSizeExact:animalIdentityAndSizeExact,count:model.agents.length,types:new Set(model.agents.map(a=>a.speciesId)).size,
      populationAdded:0,repositionedSlopeResidents:model.slopeHabitats.residents.length,repositionedSlopeFish:model.slopeHabitats.fish.length,
      reservedSpaces:model.slopeHabitats.footprints.length,unplaced:model.slopeHabitats.unplaced},
    physical:{bedMetadataExact,bedHeightsExact,bedPositionsExact,bedIndicesExact,bedNormalsExact,
      bedUniqueVertices:model.bed.heights.length,bedDrawTiles:newTiles.length,bedDraws,
      legacyRockProfilesExact:oldProfilesExact,legacyRockProfiles:oldProfiles,
      originalRockPlacementsExact:false,originalRockPlacementNote:'24 existing right-side bommies deliberately moved lower/rear; original IDs retained'},
    habitat:{rocks:model.rocks.length,corals:model.corals.length,slopeCorals:model.corals.filter(c=>c.host.startsWith('sample-live-slope-')).length,
      forms:byForm(model),grass:model.grass.length,rubble:model.rubble.length,
      coralSpatialBatches:world.coralBatches.length,grassSpatialBatches:world.grassBatches.length,
      livingCoverComposition:model.livingCoverComposition,softBedRefit:model.substrateSceneryRefit,
      slope:{physicalForm:model.reefSlope.physicalForm,sectors:model.reefSlope.sectors,modules:model.reefSlope.modules.map(rock=>({
        id:rock.id,profile:rock.profile,x:rock.x,y:rock.y,z:rock.z,scale:rock.scale,rotation:rock.rotation,
        frontToeDistance:rock.frontToeDistance,benches:rock.habitatBenches,
        fittedCorals:model.corals.filter(c=>c.host===rock.id).length}))},
      animalSpaces:model.slopeHabitats.footprints},
    native:{kind:'current model/scene CPU inventory; not browser startup, GPU timing or a matched performance reduction',
      sceneConstructionCount:1,constructionMs,updates:601,modelSeconds:75,
      medianUpdateMs:samples[300],p95UpdateMs:samples[570],maxUpdateMs:samples.at(-1),meshObjects:meshes,instancedMeshObjects:instancedMeshes},
    preview:{kind:final.kind,webgl:false,fpsMeasured:false,width:1280,height:720,
      finalTimes:final.frames.map(f=>f.time),supplementTimes:supplement.frames.map(f=>f.time),
      cameraReference:'output/validation/shallow-habitat-completion/final/render.json',cameraMaxError,cameraComparisons,
      limitation:'actual geometry/albedo CPU projections; no WebGL shadows, caustics, normal maps or real-time playback evidence'},
    checks:{cases:34,passed:34,failed:0,reportingSource:'parent inspected completed test output; this script does not execute tests',localBuild:'pending'},
    acceptance:{continuousReefStructure:'structural stage integrated; image evaluation remains partial',
      livingCanopy:'partial; continuous patches present, repeated rows and exposed pale bench faces remain',
      animalPresentation:'partial; nearby trevally occlude the reef at the 72-second native view',
      documentaryRealism:'not accepted; procedural geometry/materials remain apparent',
      actualWebglPlayback:'not measured; existing project-URL approval rejection respected',
      completeFoodWeb:'outside this finite display sample'},
    sources:Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(project,file)))])),
    metadataHashes:'pending parent finalization; no concurrent provenance edits in this script',
  };
  if(!animalIdentityAndSizeExact||!bedMetadataExact||!bedHeightsExact||!bedPositionsExact||!bedIndicesExact||!bedNormalsExact||!oldProfilesExact||meshes>=350||cameraMaxError>1e-10)
    throw Error('native stage invariants failed');
  fs.writeFileSync(path.join(output,'stage.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({output:path.join(output,'stage.json'),before:beforeCounts,
    animals:result.animals,habitat:{rocks:result.habitat.rocks,corals:result.habitat.corals,slopeCorals:result.habitat.slopeCorals,
      forms:result.habitat.forms,grass:result.habitat.grass,rubble:result.habitat.rubble,
      coralBatches:result.habitat.coralSpatialBatches,grassBatches:result.habitat.grassSpatialBatches},
    bedExact:true,legacyProfilesExact:oldProfilesExact,native:result.native,cameraMaxError,checks:result.checks},null,2));
}finally{beforeWorld?.dispose();world?.dispose();}
