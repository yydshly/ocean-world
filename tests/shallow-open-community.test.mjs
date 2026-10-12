import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowOpenCommunity,SHALLOW_OPEN_FISH_IDS,shallowOpenCoralGeometries} from '../src/world/ShallowOpenCommunity.js';
import {sampleSourcedFishVertex} from '../src/world/ShallowSourcedFishAssets.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {NEAR_FISH_ID} from '../src/world/ShallowNearCommunity.js';

test('open community uses attributed redistributable files and real species, with bounded source motion',()=>{
  const receipt=JSON.parse(fs.readFileSync('public/assets/shallow-open-community/provenance.json'));
  assert.equal(receipt.records.length,3);assert.ok(!receipt.records.some(r=>r.key==='echinopora'),'rejected colony must not ship');for(const r of receipt.records)assert.ok(['CC0-1.0','CC-BY-4.0'].includes(r.license));
  for(const t of receipt.textures)assert.equal(createHash('sha256').update(fs.readFileSync(`public/assets/shallow-open-community/${t.file}`)).digest('hex'),t.sha256);
  assert.equal(createHash('sha256').update(fs.readFileSync(receipt.generatedData.file)).digest('hex'),receipt.generatedData.sha256);
  const kit=new ShallowOpenCommunity(),v=new THREE.Vector3();
  try{
    assert.equal(kit.create('bigeye-trevally'),null);assert.equal(kit.create('bluestripe-snapper'),null);
    for(const id of SHALLOW_OPEN_FISH_IDS){
      const model=kit.create(id),box=new THREE.Box3().setFromObject(model.root);assert.ok(Math.abs(box.max.x-box.min.x-1)<1e-6);
      assert.ok(model.root.children.reduce((n,m)=>n+m.geometry.index.count/3,0)<=6000);
      for(const m of model.root.children){
        const g=m.geometry;assert.ok(g.attributes.color&&m.material.vertexColors,'late texture fallback must carry source colours');
        for(let i=0;i<g.attributes.position.count;i++)for(const t of [0,8,24,58,69,75]){sampleSourcedFishVertex(g,i,t,1.7,4.1,.028,v);assert.ok(g.boundingBox.containsPoint(v));}
      }
    }
  }finally{kit.dispose();}
});

test('new textures are shared and sealed late loads release exactly once',async()=>{
  const kit=new ShallowOpenCommunity(),pending=[],textures=[];
  kit.create('giant-trevally');kit.create('blacktail-snapper');
  assert.equal(kit.coralMaterial('massive-0'),kit.coralMaterial('massive-1'));
  assert.equal(kit.coralMaterial('table-0'),null);
  const task=kit.loadTextures({loader:{loadAsync:()=>new Promise(resolve=>pending.push(resolve))}});
  kit.sealed=true;kit.dispose();
  for(const resolve of pending){const t=new THREE.Texture();let count=0;t.addEventListener('dispose',()=>count++);textures.push(()=>count);resolve(t);}
  await task;kit.dispose();assert.ok(textures.every(count=>count()===1));assert.equal(kit.resources.size,0);
});

test('retained source coral shares uniform physical proportions across both display levels',()=>{
  const near=shallowOpenCoralGeometries(),far=shallowOpenCoralGeometries('distant');
  try{
    for(const [key,g]of Object.entries(near)){
      assert.equal(g.userData.sourceAspect,far[key].userData.sourceAspect);assert.ok(g.userData.sourceAspect>0);
      assert.ok(far[key].index.count<=g.index.count);
      for(const asset of [g,far[key]]){const p=asset.attributes.position;
        for(let i=0;i<p.count;i++){assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.5);assert.ok(p.getY(i)>=-1e-6&&p.getY(i)<=1+1e-6);}
      }
    }
  }finally{[...Object.values(near),...Object.values(far)].forEach(g=>g.dispose());}
});

test('principal shoals complete sampled 75-second habitat clearances at their actual animated mesh vertices',()=>{
  const world=new ShallowSampleScene(),v=new THREE.Vector3(),matrix=new THREE.Matrix4();
  try{
    assert.equal(world.model.agents.filter(a=>a.speciesId===NEAR_FISH_ID).length,30);
    assert.equal(world.model.agents.filter(a=>a.speciesId==='giant-trevally').length,16);
    assert.equal(world.model.agents.length,293);
    for(const time of [0,6,18,24,32,42,58,68,75]){
      world.update(time);
      for(const b of world.animals.batches.filter(b=>[...SHALLOW_OPEN_FISH_IDS,NEAR_FISH_ID].includes(b.id)))for(const {mesh}of b.parts){
        const g=mesh.geometry,phase=g.attributes.sampleSwim;
        for(let a=0;a<mesh.count;a++){
          mesh.getMatrixAt(a,matrix);
          for(let i=0;i<g.attributes.position.count;i++){
            sampleSourcedFishVertex(g,i,time,phase.getX(a),phase.getY(a),phase.getZ(a),v).applyMatrix4(matrix);
            assert.ok(v.y>=world.model.surface(v.x,v.z)-.001,`${b.id}: entered substrate`);
          }
        }
      }
    }
    let draws=0;world.scene.traverse(o=>{if(o.isMesh)draws++;});assert.ok(draws<350);
  }finally{world.dispose();}
});
