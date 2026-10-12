import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { ShallowNaturalFishAssets, NATURAL_SAMPLE_FISH, SHALLOW_SCHOOL_BODY_IDS, sampleBodyWave } from '../src/world/ShallowNaturalAssets.js';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/shallow-school-kit-v2.json',import.meta.url),'utf8'));

function inventory(root){
  const rows=[];root.traverse(o=>{if(o.isMesh)rows.push(o);});return rows;
}
function digest(root){
  const hash=crypto.createHash('sha256');
  for(const mesh of inventory(root)){
    hash.update(mesh.name);hash.update(JSON.stringify(mesh.matrixWorld.toArray()));
    for(const name of Object.keys(mesh.geometry.attributes).sort()){
      hash.update(name);hash.update(new Uint8Array(mesh.geometry.attributes[name].array.buffer));
    }
    hash.update(new Uint8Array(mesh.geometry.index.array.buffer));
    hash.update(JSON.stringify({roughness:mesh.material.roughness,metalness:mesh.material.metalness,side:mesh.material.side,vertexColors:mesh.material.vertexColors}));
  }
  return hash.digest('hex');
}
function sampleSide(body,x,y){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1)),hit=ray.intersectObject(body)[0];
  if(!hit)return null;
  const g=body.geometry,p=g.attributes.position,c=g.attributes.color,a=new THREE.Vector3().fromBufferAttribute(p,hit.face.a),b=new THREE.Vector3().fromBufferAttribute(p,hit.face.b),d=new THREE.Vector3().fromBufferAttribute(p,hit.face.c);
  const weights=THREE.Triangle.getBarycoord(hit.point,a,b,d,new THREE.Vector3());
  return new THREE.Color().setRGB(c.getX(hit.face.a)*weights.x+c.getX(hit.face.b)*weights.y+c.getX(hit.face.c)*weights.z,
    c.getY(hit.face.a)*weights.x+c.getY(hit.face.b)*weights.y+c.getY(hit.face.c)*weights.z,
    c.getZ(hit.face.a)*weights.x+c.getZ(hit.face.b)*weights.y+c.getZ(hit.face.c)*weights.z);
}
function colourRuns(body,predicate){
  let runs=0,inside=false;
  for(let n=0;n<=500;n++){
    const c=sampleSide(body,.03,-.16+n*.0006),yes=c&&predicate(c);
    if(yes&&!inside)runs++;inside=!!yes;
  }
  return runs;
}

test('main school kit preserves other nine complete assets, hero provenance, draw and triangle budgets',()=>{
  const current=new ShallowNaturalFishAssets();
  try{
    for(const id of Object.keys(NATURAL_SAMPLE_FISH)){
      const a=current.create(id),meshes=inventory(a.root),old=frozen.models[id];
      assert.equal(meshes.length,old.meshParts,`${id}: added animal draw part`);
      assert.ok(meshes.reduce((n,m)=>n+m.geometry.index.count/3,0)<=old.triangles,`${id}: triangle budget grew`);
      if(!SHALLOW_SCHOOL_BODY_IDS.includes(id))assert.equal(digest(a.root),old.sha256,`${id}: non-target asset changed`);
      else assert.notEqual(digest(a.root),old.sha256,`${id}: entire school asset remained unchanged`);
    }
    const p=JSON.parse(fs.readFileSync('public/assets/shallow-body-kit/provenance.json','utf8'));
    const old=frozen;
    assert.equal(p.version,4);assert.deepEqual(p.limits,old.limits);assert.deepEqual(p.screenedExternalAssets,old.screenedExternalAssets);
    assert.deepEqual(p.representatives.find(r=>r.id==='blue-spotted-ray'),old.representatives.find(r=>r.id==='blue-spotted-ray'));
    const turtle=p.representatives.find(r=>r.id==='green-turtle'),oldTurtle=old.representatives.find(r=>r.id==='green-turtle');
    assert.equal(turtle.unit,oldTurtle.unit);assert.deepEqual(turtle.sources,oldTurtle.sources);
    for(const id of SHALLOW_SCHOOL_BODY_IDS){const row=p.representatives.find(r=>r.id===id),previous=old.representatives.find(r=>r.id===id);assert.deepEqual(row.sources.slice(0,previous.sources.length),previous.sources);}
  }finally{current.dispose();}
});

test('main school kit has complete side colour signatures and natural-length bounded animated bodies',()=>{
  const assets=new ShallowNaturalFishAssets();
  try{
    const bounds=new Map();
    for(const id of SHALLOW_SCHOOL_BODY_IDS){
      const m=assets.create(id),box=new THREE.Box3().setFromObject(m.root);bounds.set(id,box);
      assert.ok(Math.abs(box.max.x-box.min.x-1)<1e-6,`${id}: metre total-length unit changed`);
      for(const mesh of inventory(m.root))for(const key of ['position','normal','color'])assert.ok([...mesh.geometry.attributes[key].array].every(Number.isFinite));
    }
    const snapper=assets.models.get('bluestripe-snapper').root.children.find(m=>m.name==='continuous body and inset eyes');
    assert.equal(colourRuns(snapper,c=>c.b>c.r*1.30&&c.g>c.r*1.20),4,'complete rendered flank must show four separate blue bands');
    const fusilier=assets.models.get('doubleline-fusilier').root.children.find(m=>m.name==='continuous body and inset eyes');
    assert.equal(colourRuns(fusilier,c=>c.r>c.b*1.30&&c.g>c.b*1.40),2,'complete rendered flank must show two separate yellow lines');
    const point=new THREE.Vector3();
    for(const time of [0,1,7.5,24,42,58,69,75]){
      assets.update(time,new Map(SHALLOW_SCHOOL_BODY_IDS.map(id=>[id,.6])));
      for(const id of SHALLOW_SCHOOL_BODY_IDS){
        const model=assets.models.get(id),box=bounds.get(id),radius=Math.hypot(Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),Math.max(Math.abs(box.min.z),Math.abs(box.max.z)));
        for(const mesh of inventory(model.root))for(let v=0;v<mesh.geometry.attributes.position.count;v++){
          point.fromBufferAttribute(mesh.geometry.attributes.position,v).applyMatrix4(mesh.matrixWorld);
          for(const sign of [-1,1])assert.ok(Math.hypot(point.x,point.z+sign*.04)<=radius+.04+1e-6,`${id}: full fin/body left measured horizontal support`);
        }
      }
    }
    for(const {x,time,value}of frozen.wave){const actual=sampleBodyWave(x,time,.3,4.1,.03);assert.equal(actual.offset+0,value.offset);assert.equal(actual.slope+0,value.slope);}
  }finally{assets.dispose();}
});
