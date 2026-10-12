import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shallowLiveReefGeometries} from '../src/world/ShallowLiveReefAssets.js';

test('live crown silhouettes spread through connected low forks and retain actual fan apertures',()=>{
  const near=shallowLiveReefGeometries(),far=shallowLiveReefGeometries('distant');
  try{
    for(const family of [near,far])for(const variant of [0,1]){
      // A pedestal carrying a plate cannot satisfy this low wide support band.
      const table=family[`table-${variant}`],p=table.attributes.position;
      const sectors=new Set();let spread=0;
      for(let i=0;i<p.count;i++)if(p.getY(i)>=.20&&p.getY(i)<=.55){
        const x=p.getX(i),z=p.getZ(i),r=Math.hypot(x,z);spread=Math.max(spread,r);
        if(r>.22)sectors.add(Math.floor(((Math.atan2(z,x)+Math.PI)/(Math.PI*2))*8)%8);
      }
      assert.ok(spread>.27&&sectors.size>=4,'table support reverted to a tall single pole');
      const branch=family[`branching-${variant}`].attributes.position;
      let lowOuter=0;
      for(let i=0;i<branch.count;i++)if(branch.getY(i)<.55&&Math.hypot(branch.getX(i),branch.getZ(i))>.22)lowOuter++;
      assert.ok(lowOuter/branch.count>.15,'branching crown reverted to parallel upward stalks');
    }
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(near['fan-0'],material);
    const ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,0,-1);mesh.updateMatrixWorld();
    let hit=0,total=0;
    for(let y=.24;y<.94;y+=.035)for(let x=-.40;x<=.40;x+=.035){
      ray.set(new THREE.Vector3(x,y,1),direction);hit+=ray.intersectObject(mesh).length>0;total++;
    }
    material.dispose();
    assert.ok(hit/total>.04&&hit/total<.50,'sea fan lost its open branching apertures');
  }finally{Object.values(near).forEach(g=>g.dispose());Object.values(far).forEach(g=>g.dispose());}
});
