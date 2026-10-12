import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {shallowMuseumCoralGeometries} from '../src/world/ShallowMuseumCorals.js';

test('redistributable specimen derivatives keep finite conservative envelopes and cheaper LODs',()=>{
  const receipt=JSON.parse(fs.readFileSync('public/assets/shallow-museum-corals/provenance.json','utf8'));
  assert.equal(receipt.license,'CC0-1.0');assert.equal(receipt.records.length,4);
  const near=shallowMuseumCoralGeometries(),far=shallowMuseumCoralGeometries('distant');
  try{
    assert.deepEqual(Object.keys(near).sort(),['branching-0','branching-1']);
    assert.equal(new Set(Object.values(near).map(g=>g.userData.sourceKey)).size,2);
    for(const [id,g] of [...Object.entries(near),...Object.entries(far)]){
      const p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
      assert.ok(g.index.count/3<=4000);assert.ok(g.index.array.every(v=>v<p.count));
      assert.ok(g.userData.sourceAspect>.1&&g.userData.sourceAspect<1);
      assert.ok(g.userData.rootRadius>0&&g.userData.rootRadius<=.5);
      for(let i=0;i<p.count;i++){
        assert.ok(p.getY(i)>=-1e-7&&p.getY(i)<=1+1e-7);
        assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.5);
        assert.ok(new THREE.Vector3().fromBufferAttribute(n,i).length()>.99);
        assert.ok([c.getX(i),c.getY(i),c.getZ(i)].every(x=>Number.isFinite(x)&&x>=0&&x<=1));
      }
      if(g.userData.detail==='near')assert.ok(far[id].index.count<g.index.count/2);
    }
    if(receipt.generatedData)assert.equal(createHash('sha256').update(fs.readFileSync(receipt.generatedData.file)).digest('hex'),receipt.generatedData.sha256);
  }finally{Object.values(near).forEach(g=>g.dispose());Object.values(far).forEach(g=>g.dispose());}
});
