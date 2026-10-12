import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample} from '../src/shallowSample.js';
import {oceanRockHeight,oceanRockSurface} from '../src/oceanRockShape.js';
import {reefBankGeometries,REEF_BANK_PROFILES} from '../src/world/ShallowReefBank.js';
const model=createShallowSample(55),rocks=new Map(model.rocks.map(r=>[r.id,r]));

test('remaining outer canopy keeps real host contact and clears complete animal spaces',()=>{
  assert.ok(model.corals.length>=150&&model.corals.length<=650);
  const route=Array.from({length:121},(_,i)=>model.path.getPointAt(i/120));
  for(const c of model.corals){
    assert.ok(Number.isFinite(c.clearanceHeight)&&Array.isArray(c.supportNormal));
    assert.ok(Math.abs(oceanRockHeight(rocks.get(c.host),c.x,c.z)-c.y)<1e-7);
    assert.ok(route.every(p=>Math.hypot(c.x-p.x,c.z-p.z)>=1.9+c.radius-1e-9));
    for(const p of model.slopeHabitats.footprints)assert.ok(Math.hypot(c.x-p.x,c.z-p.z)>=c.radius+p.r+.02499);
  }
  assert.equal(model.attachedReef.length,0,'scatter-fill must not replace the new architecture');
});

test('whole bank near and distant meshes share visible support, source UVs, real channels and a bounded LOD',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(let v=0;v<4;v++){
    const near=reefBankGeometries(v),far=reefBankGeometries(v,'distant'),root=new THREE.Group();
    for(const [key,g]of Object.entries(near)){root.add(new THREE.Mesh(g,material));if(key!=='substrate')assert.ok(g.attributes.uv);}
    root.updateMatrixWorld(true);let hits=0,gaps=0;
    for(let x=-.55;x<=.55;x+=.091)for(let z=-.43;z<=.55;z+=.083){
      ray.set(new THREE.Vector3(x,3,z),down);const hit=ray.intersectObject(root,true)[0],support=oceanRockSurface(REEF_BANK_PROFILES[v],x,z);
      if(hit){assert.ok(support&&Math.abs(hit.point.y-support.height)<1e-6,'rendered whole bank and support differ');hits++;}
      else{assert.equal(support,null,'invisible collider fills a visible sand gap');gaps++;}
    }
    assert.ok(hits>35&&gaps>20,'open bank became a solid slab or empty accents');
    const count=family=>Object.values(family).reduce((sum,g)=>sum+g.index.count,0);
    assert.ok(count(far)<count(near)*.4,'whole bank LOD failed to reduce geometry');
    for(const g of [...Object.values(near),...Object.values(far)])g.dispose();
  }
  material.dispose();
});
