import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { ShallowSourcedFishAssets, sampleSourcedFishVertex, SHALLOW_SOURCED_FISH_MAX_AMPLITUDE } from '../src/world/ShallowSourcedFishAssets.js';
import { sourcedFishBase64 } from '../src/world/ShallowSourcedFishData.js';

test('CC0 source topology, authored texture coordinates and +X mouth survive the adapter',()=>{
  const kit=new ShallowSourcedFishAssets(),model=kit.create('barramundi'),mesh=model.root.children[0],g=mesh.geometry;
  try{
    assert.equal(kit.create('barramundi'),model);assert.equal(kit.create('bluestripe-snapper'),null);
    assert.equal(g.attributes.position.count,2188);assert.equal(g.index.count/3,3864);assert.equal(model.root.children.length,1);
    assert.equal(g.attributes.tangent.itemSize,4);assert.equal(g.attributes.uv.count,2188);
    const position=g.attributes.position,uv=g.attributes.uv;
    let xmin=Infinity,xmax=-Infinity,headU=0,tailU=0,heads=0,tails=0;
    for(let i=0;i<position.count;i++){
      const x=position.getX(i);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);
      if(x>.498){headU+=uv.getX(i);heads++;}if(x<-.498){tailU+=uv.getX(i);tails++;}
      const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i),t=new THREE.Vector3().fromBufferAttribute(g.attributes.tangent,i);
      assert.ok(Math.abs(n.length()-1)<2e-6);assert.ok(Math.abs(t.length()-1)<2e-6);
      assert.ok(Math.abs(g.attributes.tangent.getW(i))===1);assert.ok(g.index.array.every(v=>v<position.count));
    }
    assert.ok(Math.abs((xmax-xmin)-1)<1e-7);assert.ok(Math.abs(xmax-.5)<1e-7&&Math.abs(xmin+.5)<1e-7);
    assert.ok(heads&&tails);assert.ok(headU/heads<.08,'mouth lies on wrong longitudinal end');assert.ok(tailU/tails>.90,'tail lies on wrong longitudinal end');
    assert.equal(model.material.userData.nativeBaseColorFile,'public/assets/shallow-sourced-fish/barramundi-basecolor.png');
    assert.equal(model.material.userData.nativeBaseColorFlipY,false);assert.equal(model.material.userData.nativeBaseColorWrapS,'repeat');
    assert.equal(model.material.color.getHex(),0xffffff);
    const provenance=JSON.parse(fs.readFileSync(new URL('../public/assets/shallow-sourced-fish/provenance.json',import.meta.url)));
    assert.equal(provenance.license,'CC0-1.0');assert.equal(provenance.author,'Microsoft');assert.equal(provenance.scientificName,'Lates calcarifer');
    assert.equal(crypto.createHash('sha256').update(Buffer.from(sourcedFishBase64,'base64')).digest('hex'),provenance.generatedData.sha256);
    for(const texture of provenance.textures){const bytes=fs.readFileSync(new URL('../public/assets/shallow-sourced-fish/'+texture.file,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),texture.sha256);assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1024);}
  }finally{kit.dispose();}
});

test('all source vertices and wave extrema fit the declared analytic envelope; PBR tangents and shadows get the same wave',()=>{
  const kit=new ShallowSourcedFishAssets(),model=kit.create('barramundi'),g=model.root.children[0].geometry,v=new THREE.Vector3();
  try{
    const box=model.motionEnvelope;let maxOffset=0;
    for(let phase=0;phase<=32;phase++)for(let i=0;i<g.attributes.position.count;i++){
      sampleSourcedFishVertex(g,i,phase*.071,phase*.37,4.9,1,v);
      assert.ok(box.clone().expandByScalar(1e-8).containsPoint(v));
      assert.equal(v.x,g.attributes.position.getX(i));assert.equal(v.y,g.attributes.position.getY(i));
      maxOffset=Math.max(maxOffset,Math.abs(v.z-g.attributes.position.getZ(i)));
    }
    assert.ok(maxOffset>.0278&&maxOffset<=SHALLOW_SOURCED_FISH_MAX_AMPLITUDE+1e-8);
    assert.equal(model.motionPadding.radius,.028);assert.equal(model.motionPadding.bottom,0);
    for(const material of [model.material,model.customDepthMaterial]){
      const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>'};material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.sampleSwimTime,kit.clock);assert.match(shader.vertexShader,/transformed\.z\+=sourcedWave/);assert.match(shader.vertexShader,/clamp\(sampleSwim\.z,0\.0,\.028\)/);
      assert.match(shader.vertexShader,/objectNormal\.x-=objectNormal\.z\*sourcedWaveSlope/);assert.match(shader.vertexShader,/objectTangent\.z\+=objectTangent\.x\*sourcedWaveSlope/);
    }
    g.setAttribute('sampleSwim',new THREE.InstancedBufferAttribute(new Float32Array([.2,4.2,.025,1.7,4.7,.027]),3));
    const before=Array.from(g.getAttribute('sampleSwim').array);kit.update(8,new Map([['barramundi',1]]));assert.deepEqual(Array.from(g.getAttribute('sampleSwim').array),before);assert.equal(kit.clock.value,8);
  }finally{kit.dispose();}
});

function trackedTexture(){const texture=new THREE.Texture();let disposals=0;texture.addEventListener('dispose',()=>disposals++);return {texture,get disposals(){return disposals;}};}
test('atomic PBR load shares ORM channels, retains source texture factor and releases every resource exactly once',async()=>{
  const kit=new ShallowSourcedFishAssets(),model=kit.create('barramundi'),textures=[trackedTexture(),trackedTexture(),trackedTexture()],requests=[];
  const ready=kit.loadTextures({base:'/ocean-world/',loader:{loadAsync:url=>{requests.push(url);return Promise.resolve(textures[requests.length-1].texture);}}});
  assert.equal(await ready,true);assert.equal(kit.loadTextures(),ready);assert.equal(requests.length,3);
  const material=model.material;assert.equal(material.map,textures[0].texture);assert.equal(material.normalMap,textures[1].texture);
  assert.equal(material.aoMap,textures[2].texture);assert.equal(material.roughnessMap,material.aoMap);assert.equal(material.metalnessMap,material.aoMap);
  assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(material.aoMap.colorSpace,THREE.NoColorSpace);
  assert.ok(textures.every(t=>!t.texture.flipY&&t.texture.wrapS===THREE.RepeatWrapping&&t.texture.wrapT===THREE.RepeatWrapping));
  assert.equal(material.color.getHex(),0xffffff);assert.equal(material.roughness,1);assert.equal(material.metalness,1);
  const counts=new Map([...kit.resources].map(resource=>[resource,0]));for(const resource of counts.keys())resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  kit.dispose();kit.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.ok(textures.every(t=>t.disposals===1));assert.equal(kit.create('barramundi'),null);
});

test('sealing and disposal release arrived and late textures once without publishing maps',async()=>{
  for(const close of ['seal','dispose']){
    const kit=new ShallowSourcedFishAssets(),model=kit.create('barramundi'),pending=[],textures=[trackedTexture(),trackedTexture(),trackedTexture()];
    const loading=kit.loadTextures({loader:{loadAsync:()=>new Promise(resolve=>pending.push(resolve))}});
    pending[0](textures[0].texture);await Promise.resolve();await Promise.resolve();
    if(close==='seal'){kit.sealed=true;kit.sealed=false;assert.equal(kit.sealed,true);}else kit.dispose();
    assert.equal(textures[0].disposals,1,'already arrived staged texture retained after closure');
    pending[1](textures[1].texture);pending[2](textures[2].texture);assert.equal(await loading,false);
    assert.ok(textures.every(t=>t.disposals===1));assert.equal(model.material.map,null);assert.equal(model.material.normalMap,null);kit.dispose();kit.dispose();assert.ok(textures.every(t=>t.disposals===1));
  }
});

test('a failed PBR channel does not publish a partial set or leak successful requests',async()=>{
  const kit=new ShallowSourcedFishAssets(),model=kit.create('barramundi'),a=trackedTexture(),b=trackedTexture();let request=0;
  assert.equal(await kit.loadTextures({loader:{loadAsync:()=>[++request===1?Promise.resolve(a.texture):request===2?Promise.reject(new Error('normal unavailable')):Promise.resolve(b.texture)][0]}}),false);
  assert.equal(model.material.map,null);assert.equal(a.disposals,1);assert.equal(b.disposals,1);kit.dispose();assert.equal(a.disposals,1);assert.equal(b.disposals,1);
});
