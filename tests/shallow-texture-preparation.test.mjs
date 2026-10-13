import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function trackedTexture(){
  const texture=new THREE.Texture();let disposals=0;
  texture.addEventListener('dispose',()=>disposals++);
  return {texture,get disposals(){return disposals;}};
}
function fixture(){
  // Exercise the shipped preparation and disposal methods without constructing
  // the unrelated 293-animal scene or issuing real image/GPU requests.
  const world=Object.create(ShallowSampleScene.prototype),sand=deferred(),reef=deferred(),animal=deferred();
  const kit=()=>({loadTextures:()=>Promise.resolve(),dispose(){}});
  const sandMaterial=new THREE.MeshStandardMaterial(),rockMaterial=new THREE.MeshStandardMaterial();
  rockMaterial.onBeforeCompile=shader=>{shader.uniforms.existingSediment={value:17};};
  const scene=new THREE.Scene(),environment=new THREE.Group(),bed=new THREE.Mesh(new THREE.PlaneGeometry(),sandMaterial);
  bed.name='Continuous shallow sand bed';environment.add(bed);scene.add(environment);
  Object.assign(world,{
    scene,environment,rockMaterial,reefAlbedoFile:'assets/reef-albedo.png',reefTextureScale:.32,reefTextureDesaturation:.40,
    disposed:false,assetsSealed:false,textures:[],resources:[bed.geometry,sandMaterial,rockMaterial],
    sedimentContact:{setSand(texture){this.texture=texture;}},scannedReefMaterials:new Map(),
    nearCommunity:kit(),benthicCorals:kit(),scanController:new AbortController(),
    sun:{shadow:{dispose(){}}},coralBatches:[],skeletonMeshes:[],
    animals:{artists:kit(),openCommunity:kit(),sourcedFish:kit(),sourceTurtle:kit(),contactFauna:{loadTextures:()=>animal.promise},dispose(){}},
  });
  const options={base:'/ocean-world/',loader:{loadAsync(url){
    if(url==='/ocean-world/assets/sand-albedo.png')return sand.promise;
    assert.equal(url,'/ocean-world/assets/reef-albedo.png');return reef.promise;
  }}};
  return {world,sandMaterial,rockMaterial,sand,reef,animal,options};
}

test('ready sand and reef install independently of slow animal textures before preparation seals',async()=>{
  const f=fixture(),sand=trackedTexture(),reef=trackedTexture();let finished=false;
  const loading=f.world.loadTextures(f.options).then(()=>{finished=true;});
  f.sand.resolve(sand.texture);await flush();
  assert.equal(f.sandMaterial.map,sand.texture);
  assert.equal(f.sandMaterial.bumpMap,sand.texture);assert.equal(f.sandMaterial.bumpScale,.025);
  assert.equal(f.world.sedimentContact.texture,sand.texture);
  assert.equal(f.rockMaterial.map,null,'unresolved rock keeps its fallback');
  assert.equal(finished,false,'the complete preparation promise still waits for all assets');
  f.reef.resolve(reef.texture);await flush();
  assert.equal(f.rockMaterial.map,reef.texture);assert.equal(finished,false);
  assert.equal(f.rockMaterial.customProgramCacheKey(),'sample-coastal-pbr-false-false');
  const shader={uniforms:{},fragmentShader:'#include <map_fragment>\n#include <common>'};
  f.rockMaterial.onBeforeCompile(shader);
  assert.equal(shader.uniforms.existingSediment.value,17,'the existing sediment shader hook is preserved');
  assert.match(shader.fragmentShader,/sampleWorld\*0\.32/);assert.match(shader.fragmentShader,/0\.40/);
  for(const asset of [sand,reef]){
    assert.equal(asset.texture.wrapS,THREE.RepeatWrapping);assert.equal(asset.texture.wrapT,THREE.RepeatWrapping);
    assert.equal(asset.texture.colorSpace,THREE.SRGBColorSpace);assert.equal(asset.texture.anisotropy,4);
    assert.equal(asset.disposals,0);
  }
  f.world.assetsSealed=true;f.animal.resolve();await loading;
  assert.equal(f.sandMaterial.map,sand.texture);assert.equal(f.rockMaterial.map,reef.texture);
  assert.deepEqual(f.world.textures,[sand.texture,reef.texture]);
  f.world.dispose();f.world.dispose();
  assert.equal(sand.disposals,1);assert.equal(reef.disposals,1);
});

test('sealing or disposal releases late substrate textures without changing installed materials',async()=>{
  for(const close of ['seal','dispose']){
    const f=fixture(),sand=trackedTexture(),reef=trackedTexture();
    const loading=f.world.loadTextures(f.options);
    f.sand.resolve(sand.texture);await flush();
    if(close==='seal')f.world.assetsSealed=true;else f.world.dispose();
    f.reef.resolve(reef.texture);f.animal.resolve();await loading;
    assert.equal(f.rockMaterial.map,null);assert.equal(reef.disposals,1);
    assert.deepEqual(f.world.textures,[sand.texture],'late textures must not enter scene ownership');
    assert.equal(sand.disposals,close==='dispose'?1:0);
    f.world.dispose();f.world.dispose();
    assert.equal(sand.disposals,1);assert.equal(reef.disposals,1);
  }
});

test('a failed substrate keeps its fallback without withholding a successful independent substrate',async()=>{
  const f=fixture(),reef=trackedTexture();
  const loading=f.world.loadTextures(f.options);
  f.sand.reject(new Error('sand unavailable'));f.reef.resolve(reef.texture);f.animal.resolve();await loading;
  assert.equal(f.sandMaterial.map,null);assert.equal(f.world.sedimentContact.texture,undefined);
  assert.equal(f.rockMaterial.map,reef.texture);
  f.world.dispose();assert.equal(reef.disposals,1);
});
