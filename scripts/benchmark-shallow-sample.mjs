// Native CPU and camera-frustum comparison. This does not measure WebGL/FPS.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
const root='output/validation/shallow-integrated',backup=path.resolve(root);
const aliases={'ShallowSampleScene.js':path.resolve('src/world/ShallowSampleScene.js'),
  'ShallowNaturalAssets.js':path.resolve('src/world/ShallowNaturalAssets.js'),'shallowSample.js':path.resolve('src/shallowSample.js')};
const frozen=new Map(Object.entries(aliases).map(([name,original])=>[original,path.join(backup,`before-${name.replace('.js','.mjs')}`)]));
for(const [name,original] of Object.entries(aliases)){
  const source=fs.readFileSync(path.join(backup,name),'utf8').replace(/from ['"]([^'"]+)['"]/g,(match,specifier)=>{
    if(!specifier.startsWith('.'))return match;
    const target=path.resolve(path.dirname(original),specifier);return `from '${pathToFileURL(frozen.get(target)??target).href}'`;
  });fs.writeFileSync(frozen.get(original),source);
}
const {ShallowSampleScene:BeforeScene}=await import(pathToFileURL(frozen.get(aliases['ShallowSampleScene.js'])).href);
function measure(Scene){
  let start=performance.now();const world=new Scene(55),construction=performance.now()-start;
  for(let i=0;i<60;i++)world.update(i*.75);
  const times=[];for(let i=0;i<=600;i++){start=performance.now();world.update(i/8);times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),frames=[];
  for(const t of [6,24,42,58,69]){
    world.update(t);world.camera.aspect=16/9;world.camera.updateProjectionMatrix();world.scene.updateMatrixWorld(true);world.camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse));
    let candidateDraws=0,candidateTriangles=0;
    world.scene.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;
      if(o.frustumCulled&&!frustum.intersectsObject(o))return;
      candidateDraws++;candidateTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);
    });frames.push({time:t,candidateDraws,candidateTriangles});
  }
  const identities=world.model.agents.map(a=>({id:a.id,sizeM:a.sizeM,speciesId:a.speciesId}));world.dispose();
  return {constructionMs:construction,medianUpdateMs:times[300],p95UpdateMs:times[570],maxUpdateMs:times.at(-1),frames,identities};
}
const before=measure(BeforeScene),after=measure(ShallowSampleScene);
const identical=JSON.stringify(before.identities)===JSON.stringify(after.identities);delete before.identities;delete after.identities;
const result={kind:'native-cpu-and-frustum-candidates-not-browser-or-gpu',modelSeconds:75,animalIdentityAndSizeExact:identical,before,after};
fs.writeFileSync(`${root}/performance.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
