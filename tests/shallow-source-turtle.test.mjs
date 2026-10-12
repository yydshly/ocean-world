import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowSourceTurtle,setSourceTurtlePose} from '../src/world/ShallowSourceTurtle.js';

test('source hawksbill preserves source topology, images and full animated body envelope',()=>{
  const kit=new ShallowSourceTurtle(),model=kit.create('hawksbill-turtle'),point=new THREE.Vector3();
  try{
    assert.equal(kit.create('green-turtle'),null,'distinct species must not share this representative');
    const receipt=JSON.parse(fs.readFileSync('public/assets/shallow-source-turtle/provenance.json','utf8'));
    assert.equal(receipt.species,'Eretmochelys imbricata');assert.match(receipt.license,/CC-BY-NC-4.0/);
    assert.equal(createHash('sha256').update(fs.readFileSync(receipt.generatedData.file)).digest('hex'),receipt.generatedData.sha256);
    let triangles=0,maxRadius=0,changed=0;
    for(const [index,mesh] of model.root.children.entries()){
      const g=mesh.geometry;triangles+=g.index.count/3;assert.equal(g.morphAttributes.position.length,8);
      assert.equal(g.attributes.uv.count,g.attributes.position.count);assert.ok(g.index.array.every(i=>i<g.attributes.position.count));
      const image=fs.readFileSync(`public/assets/shallow-source-turtle/${receipt.parts[index].texture}`);
      assert.equal(createHash('sha256').update(image).digest('hex'),receipt.parts[index].sha256);
      for(let f=0;f<8;f++)for(let i=0;i<g.attributes.position.count;i++){
        point.fromBufferAttribute(g.morphAttributes.position[f],i);assert.ok(point.toArray().every(Number.isFinite));
        assert.ok(model.motionEnvelope.clone().expandByScalar(1e-7).containsPoint(point));
        maxRadius=Math.max(maxRadius,Math.hypot(point.x,point.z));
        const n=new THREE.Vector3().fromBufferAttribute(g.morphAttributes.normal[f],i);assert.ok(Math.abs(n.length()-1)<1e-5);
        if(f&&point.distanceTo(new THREE.Vector3().fromBufferAttribute(g.morphAttributes.position[0],i))>.01)changed++;
      }
      setSourceTurtlePose(mesh,0);const start=[...mesh.morphTargetInfluences];
      setSourceTurtlePose(mesh,1/.36);assert.deepEqual(mesh.morphTargetInfluences,start,'swim loop seam');
      for(let t=0;t<3;t+=.037){setSourceTurtlePose(mesh,t,1.2);const w=mesh.morphTargetInfluences;
        assert.ok(w.every(v=>v>=0&&v<=1));assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-12);
        assert.ok(w.filter(v=>v>0).length<=2);
      }
    }
    assert.equal(triangles,5984);assert.ok(changed>1000,'source swimming motion was lost');assert.equal(model.motionRadius,maxRadius);
  }finally{kit.dispose();}
});

test('source photos load with original material factors and no late publication or resource leaks',async()=>{
  for(const closure of ['none','seal','dispose']){
    const kit=new ShallowSourceTurtle(),model=kit.create('hawksbill-turtle'),pending=[],textures=[new THREE.Texture(),new THREE.Texture()],counts=[0,0];
    textures.forEach((t,i)=>t.addEventListener('dispose',()=>counts[i]++));
    const ready=kit.loadTextures({base:'/ocean-world/',loader:{loadAsync:url=>{assert.ok(url.startsWith('/ocean-world/assets/shallow-source-turtle/'));return new Promise(resolve=>pending.push(resolve));}}});
    assert.equal(kit.loadTextures(),ready);
    if(closure==='seal')kit.sealed=true;if(closure==='dispose')kit.dispose();
    pending.forEach((resolve,i)=>resolve(textures[i]));assert.equal(await ready,closure==='none');
    model.materials.forEach(({material,factor},i)=>{
      if(closure==='none'){assert.equal(material.map,textures[i]);assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.map.flipY,false);assert.deepEqual(material.color.toArray(),factor.slice(0,3));}
      else assert.equal(material.map,null);
    });
    kit.dispose();kit.dispose();assert.deepEqual(counts,[1,1]);assert.equal(kit.create('hawksbill-turtle'),null);
  }
});
