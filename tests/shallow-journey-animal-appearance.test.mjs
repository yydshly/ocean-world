import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowJourneyAnimalAppearance,JOURNEY_ANIMAL_APPEARANCE_IDS,JOURNEY_ANIMAL_MOTION_PADDING,journeyAnimalSkinColour} from '../src/world/ShallowJourneyAnimalAppearance.js';
import {unifyMarineMaterial} from '../src/world/ShallowMarineAppearance.js';

const luma=c=>c.r*.2126+c.g*.7152+c.b*.0722;
test('journey skins preserve visible identification marks instead of applying one fish texture to six species',()=>{
  const c=(id,x,v)=>journeyAnimalSkinColour(id,x,v);
  const blue=c('blue-and-gold-fusilier',0,-.05),gold=c('blue-and-gold-fusilier',0,.8);
  assert.ok(blue.b>blue.r);assert.ok(gold.r>gold.b*2);
  for(const v of [.60,-.10]){const stripe=c('doubleline-fusilier',0,v),between=c('doubleline-fusilier',0,v+.13);assert.ok(stripe.r>between.r*1.4);}
  for(const v of [.60,.24,-.10,-.43]){const stripe=c('bluestripe-snapper',0,v);assert.ok(stripe.b>stripe.r*2);}
  const dash=c('reef-goatfish',.12,.24),plain=c('reef-goatfish',.12,-.20),dot=c('reef-goatfish',-.265,.10);
  assert.ok(luma(dash)<luma(plain)*.25);assert.ok(luma(dot)<luma(plain)*.25);
  assert.ok(luma(c('giant-trevally',.25,.40))>luma(c('giant-trevally',.19,.40))*.76,'giant trevally must not inherit a black gill-cover spot');
  assert.equal(c('not-a-supported-species',0,0),null);
});

test('six species retain full bodies, protected eyes/barbels, separated fins and bounded cached resources',()=>{
  const assets=new ShallowJourneyAnimalAppearance(),resources=new Set(),v=new THREE.Vector3();let triangles=0;
  try{
    assert.equal(JOURNEY_ANIMAL_APPEARANCE_IDS.length,6);assert.equal(assets.create('hawksbill-turtle'),null);
    for(const id of JOURNEY_ANIMAL_APPEARANCE_IDS){
      const model=assets.create(id),meshes=[];model.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
      assert.equal(assets.create(id),model);assert.equal(meshes.length,5);
      const box=new THREE.Box3().setFromObject(model.root);assert.ok(Math.abs(box.max.x-box.min.x-1)<1e-6);
      const body=meshes.find(m=>m.geometry.userData.role==='body');assert.ok(body);
      const mask=body.geometry.attributes.journeySkin;assert.ok(mask.array.every(Number.isFinite));
      assert.ok(mask.count>0);assert.equal(mask.getZ(0),1);assert.equal(mask.getZ(mask.count-1),0);
      assert.ok(body.geometry.attributes.position.count<6000);
      assert.equal(body.material.transparent,false);assert.equal(body.material.userData.sampleFishSurface,undefined);
      for(const m of meshes){
        triangles+=m.geometry.index.count/3;resources.add(m.geometry);
        assert.equal(m.customDepthMaterial,assets.depthMaterial);assert.ok(m.geometry.attributes.normal.array.every(Number.isFinite));
        if(m!==body){assert.equal(m.material.transparent,true);assert.equal(m.material.depthWrite,false);assert.equal(m.material.forceSinglePass,true);}
      }
      const padded=box.clone();padded.min.x-=JOURNEY_ANIMAL_MOTION_PADDING.radius;padded.max.x+=JOURNEY_ANIMAL_MOTION_PADDING.radius;
      padded.min.z-=JOURNEY_ANIMAL_MOTION_PADDING.radius;padded.max.z+=JOURNEY_ANIMAL_MOTION_PADDING.radius;
      padded.min.y-=JOURNEY_ANIMAL_MOTION_PADDING.bottom;padded.max.y+=JOURNEY_ANIMAL_MOTION_PADDING.bottom;
      for(const speed of [0,1])for(let time=0;time<240;time+=7.35){
        assets.update(time,new Map([[id,speed]]));
        for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i+=3){
          v.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
          const delta=THREE.MathUtils.clamp((.26-v.x)/.6,0,1)**2*.028;
          assert.ok(padded.containsPoint(v.clone().add(new THREE.Vector3(0,0,delta))),`${id} motion exceeds positive wave envelope`);
          assert.ok(padded.containsPoint(v.clone().add(new THREE.Vector3(0,0,-delta))),`${id} motion exceeds negative wave envelope`);
        }
      }
    }
    assert.ok(triangles<50000);
    const textures=[...assets.resources].filter(r=>r.isTexture);assert.equal(textures.length,6);
    assert.equal(textures.reduce((n,t)=>n+t.image.data.byteLength,0),786432);
    const seen=new Map();for(const r of [...resources,...assets.resources])r.addEventListener('dispose',()=>seen.set(r,(seen.get(r)??0)+1));
    assets.dispose();assets.dispose();assert.equal(seen.size,resources.size+13+6);assert.ok([...seen.values()].every(n=>n===1));assert.equal(assets.create('reef-goatfish'),null);
  }finally{assets.dispose();}
});

test('species albedo composes with existing deformation and scene grading without duplicate surface passes',()=>{
  const assets=new ShallowJourneyAnimalAppearance();
  try{
    const model=assets.create('blue-and-gold-fusilier'),mesh=model.root.children.find(o=>o.isMesh&&o.geometry.userData.role==='body');
    unifyMarineMaterial(mesh.material);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    mesh.material.onBeforeCompile(shader,{});
    assert.ok(shader.uniforms.journeyAnimalSkin.value.isDataTexture);assert.equal(shader.uniforms.sampleSwimTime,assets.clock);
    assert.match(shader.vertexShader,/transformed\.z\+=sourcedWave/);assert.match(shader.fragmentShader,/marineLuma/);
    assert.equal(shader.fragmentShader.match(/texture2D\(journeyAnimalSkin/g).length,1);
    assert.ok(shader.fragmentShader.indexOf('texture2D(journeyAnimalSkin')<shader.fragmentShader.indexOf('marineLuma'));
    assert.doesNotMatch(shader.fragmentShader,/sampleSkinPoint/);
  }finally{assets.dispose();}
});
