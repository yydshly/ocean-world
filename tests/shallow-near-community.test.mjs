import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import data from '../src/world/shallowNearCommunityData.js';
import {createShallowSample} from '../src/shallowSample.js';
import {oceanRockSurface} from '../src/oceanRockShape.js';
import {ShallowNearCommunity,nearSourceGeometry,nearReefFoundationGeometry,NEAR_FISH_ID,FIELD_REEF_PROFILE} from '../src/world/ShallowNearCommunity.js';
import {sampleSourcedFishVertex} from '../src/world/ShallowSourcedFishAssets.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('whole field reef support matches independent rendered-triangle raycasts including holes',()=>{
  createShallowSample(55);
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const geometries=[...data.reefscan.variants.near.map(nearSourceGeometry),nearReefFoundationGeometry()];
  geometries.forEach(g=>root.add(new THREE.Mesh(g,material)));root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let hits=0,holes=0;
  for(let x=-.65;x<=.65;x+=.037)for(let z=-.65;z<=.65;z+=.041){
    ray.set(new THREE.Vector3(x,2,z),down);const hit=ray.intersectObject(root,true)[0];
    const support=oceanRockSurface(FIELD_REEF_PROFILE,x,z);
    if(hit){hits++;assert.ok(support&&Math.abs(support.height-hit.point.y)<1e-6,'rendered source and support diverged');}
    else{holes++;assert.equal(support,null,'a source hole became invisible hard ground');}
  }
  assert.ok(hits>100&&holes>100);geometries.forEach(g=>g.dispose());material.dispose();
});

test('redistributable source identities, licence conditions and original texture hashes are retained',()=>{
  const receipt=JSON.parse(fs.readFileSync('public/assets/shallow-near-community/provenance.json'));
  assert.deepEqual(receipt.records.map(r=>[r.key,r.license.slug]),[['fish','by'],['foliose','by-nc-sa'],['reefscan','by']]);
  for(const r of receipt.records)assert.ok(r.author&&r.source&&r.changes&&r.license.url);
  for(const t of receipt.textures)assert.equal(createHash('sha256').update(fs.readFileSync(`public/assets/shallow-near-community/${t.file}`)).digest('hex'),t.sha256);
  assert.equal(createHash('sha256').update(fs.readFileSync(receipt.generatedData.file)).digest('hex'),receipt.generatedData.sha256);
  assert.ok(receipt.records.find(r=>r.key==='fish').limits.includes('no taxonomic identification'));
});

test('new fish bounds contain sampled deformation and late source textures are released once',async()=>{
  const kit=new ShallowNearCommunity(),model=kit.create(NEAR_FISH_ID),point=new THREE.Vector3(),pending=[],disposed=[];
  const box=new THREE.Box3().setFromObject(model.root);assert.ok(Math.abs(box.max.x-box.min.x-1)<1e-6);
  for(const mesh of model.root.children){const g=mesh.geometry;
    for(let i=0;i<g.attributes.position.count;i++)for(const t of [0,8,24,58,69,75]){
      sampleSourcedFishVertex(g,i,t,1.7,4.1,.025,point);assert.ok(g.boundingBox.containsPoint(point));
    }
  }
  kit.coralMaterial('table-0');kit.coralMaterial('table-1');
  const task=kit.loadTextures({loader:{loadAsync:()=>new Promise(resolve=>pending.push(resolve))}});
  kit.dispose();for(const resolve of pending){let n=0;const t=new THREE.Texture();t.addEventListener('dispose',()=>n++);disposed.push(()=>n);resolve(t);}
  await task;kit.dispose();assert.ok(disposed.every(count=>count()===1));assert.equal(kit.resources.size,0);
});

test('prepared showcase is identical to full exact fitting and never applies to another seed',()=>{
  const prepared=createShallowSample(55),full=createShallowSample(55,{prepareCover:false});
  assert.equal(prepared.preparedCover,true);assert.equal(full.preparedCover,false);
  for(const key of ['rocks','corals','grass','rubble','livingCoverComposition','sandHabitat','scannedCoverComposition'])
    assert.deepEqual(prepared[key],full[key],`stale prepared ${key}: rebuild the sample authoring export`);
  assert.equal(createShallowSample(56).preparedCover,false);
});

test('source crop removes the survey apron; the continuous visible foundation ends in sediment',()=>{
  for(const row of data.reefscan.variants.near){const g=nearSourceGeometry(row),same=nearSourceGeometry(row);
    assert.ok(g.attributes.position.array.every((n,i)=>i%3!==1||n>=.30-1e-7));
    const original=Array.from(same.attributes.position.array);g.rotateY(.7);
    const fresh=nearSourceGeometry(row);assert.deepEqual(Array.from(fresh.attributes.position.array),original,'decoded source cache was mutated by a geometry transform');
    g.dispose();same.dispose();fresh.dispose();
  }
  assert.ok(data.reefscan.variants.near.reduce((n,r)=>n+r.triangles,0)<25000);
  const world=new ShallowSampleScene();let count=0;
  try{world.environment.traverse(mesh=>{if(!mesh.name.startsWith('Grounded field reef foundation /'))return;
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(mesh.geometry.attributes.foundationBottom.getX(i)){
      assert.ok(p.getY(i)<=world.model.floor(p.getX(i),p.getZ(i))-.0599,'the complete physical apron rim must stay buried');count++;
    }
  });assert.ok(count>100);}finally{world.dispose();}
});
