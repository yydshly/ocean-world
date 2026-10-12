import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {shallowBranchingCoralGeometries} from '../src/world/ShallowBranchingCorals.js';
import {ShallowCohesiveFish,COHESIVE_FISH_IDS} from '../src/world/ShallowCohesiveFish.js';

test('replacement branching specimens retain metre proportions, attributed sources and cheaper complete LODs',()=>{
  const receipt=JSON.parse(fs.readFileSync('public/assets/shallow-branching-life/provenance.json'));
  assert.equal(receipt.license,'CC0-1.0');assert.equal(new Set(receipt.records.map(r=>r.key)).size,2);
  const near=shallowBranchingCoralGeometries(),far=shallowBranchingCoralGeometries('distant');
  try{for(const [id,g]of Object.entries(near)){
    assert.ok(g.index.count/3<=6000);assert.ok(far[id].index.count<g.index.count*.30);
    assert.equal(g.userData.sourceAspect,far[id].userData.sourceAspect);
    assert.ok(g.userData.sourceAspect>.1&&g.userData.sourceAspect<1);
    for(const part of [g,far[id]]){
      const p=part.attributes.position;assert.ok(part.index.array.every(i=>i<p.count));
      for(let i=0;i<p.count;i++)assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.5&&p.getY(i)>=-1e-6&&p.getY(i)<=1+1e-6);
    }
  }}finally{[...Object.values(near),...Object.values(far)].forEach(g=>g.dispose());}
  if(receipt.generatedData)assert.equal(createHash('sha256').update(fs.readFileSync(receipt.generatedData.file)).digest('hex'),receipt.generatedData.sha256);
});

test('complete unified swimmers share bounded resources and retain conservative physical motion envelopes',()=>{
  const kit=new ShallowCohesiveFish(),v=new THREE.Vector3();
  try{
    for(const id of COHESIVE_FISH_IDS){
      const m=kit.create(id),box=new THREE.Box3().setFromObject(m.root),base=box.clone().expandByScalar(.065),meshes=[];
      m.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
      assert.ok(Math.abs(box.max.x-box.min.x-1)<1e-6);assert.equal(meshes.length,4);
      assert.ok(meshes.reduce((n,m)=>n+m.geometry.index.count/3,0)<=9000);
      for(const mesh of meshes){
        assert.equal(mesh.customDepthMaterial,kit.depthMaterial);
        assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));
      }
      for(const speed of [0,1])for(let t=0;t<=75;t+=3.125){
        kit.update(t,new Map([[id,speed]]));
        for(const mesh of meshes){const p=mesh.geometry.attributes.position;
          for(let i=0;i<p.count;i++){
            v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
            // Conservative full-body wave bound at both extrema, including
            // the complete pivoted tail and pectorals at accepted speeds.
            const u=THREE.MathUtils.clamp((.26-v.x)/.6,0,1),pad=u*u*.028;
            assert.ok(base.containsPoint(v.clone().add(new THREE.Vector3(0,0,pad))));
            assert.ok(base.containsPoint(v.clone().add(new THREE.Vector3(0,0,-pad))));
          }
        }
      }
    }
    const a=kit.create('giant-trevally'),b=kit.create('giant-trevally');
    assert.equal(a.root.children[0].geometry,b.root.children[0].geometry);assert.notEqual(a.root,b.root);
    const disposed=new Map();for(const r of kit.resources)r.addEventListener('dispose',()=>disposed.set(r,(disposed.get(r)??0)+1));
    const n=kit.resources.size;kit.dispose();kit.dispose();assert.equal(disposed.size,n);assert.ok([...disposed.values()].every(n=>n===1));
  }finally{kit.dispose();}
});
