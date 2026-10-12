import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {livingKitCoralGeometries,livingKitData} from '../src/world/ShallowLivingKit.js';
import {reefBankGeometries} from '../src/world/ShallowReefBank.js';

test('living kit retains original redistributable source images and distinct full coral material groups',()=>{
  const dir='public/assets/shallow-living-kit',receipt=JSON.parse(fs.readFileSync(`${dir}/provenance.json`));
  assert.equal(receipt.records.length,4);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  for(const record of receipt.records){
    assert.ok(['by','by-nc-sa'].includes(record.license));
    assert.ok(record.source.startsWith('https://sketchfab.com/'));
    const originals=JSON.parse(fs.readFileSync('tests/fixtures/shallow-source-images.json')).images;
    for(const row of livingKitData[record.key].variants.near){
      const original=originals[`shallow-living-kit/${row.file}`];assert.ok(original);
      assert.equal(hash(fs.readFileSync(`${dir}/${row.file}`)),original.sha256);
    }
  }
  for(let v=0;v<4;v++)for(const detail of ['near','distant']){
    const bank=reefBankGeometries(v,detail),table=bank['table-2'];
    assert.equal(table.groups.length,10,'two complete five-material table colonies per bank');
    assert.equal(table.groups.reduce((n,g)=>n+g.count,0),table.index.count);
    assert.equal(new Set(table.groups.map(g=>g.materialIndex)).size,5);
    Object.values(bank).forEach(g=>g.dispose());
  }
  const near=livingKitCoralGeometries(),far=livingKitCoralGeometries('distant');
  for(const key of Object.keys(near)){assert.ok(near[key].attributes.uv);assert.ok(far[key].index.count<near[key].index.count*.25);near[key].dispose();far[key].dispose();}
});

test('sediment field matches every actual bed vertex and nine source animals retain complete swimming envelopes',()=>{
  const w=new ShallowSampleScene();try{
    const bed=w.model.bed,field=w.sedimentContact.field.image.data;
    const tiles=w.environment.children.filter(o=>o.name==='Continuous shallow sand bed'||o.name.startsWith('Sand terrain /'));
    let vertices=0;
    for(const tile of tiles){const p=tile.geometry.attributes.position,c=tile.geometry.attributes.color;
      for(let i=0;i<p.count;i++){
        const col=Math.round((p.getX(i)-bed.min)/bed.step),row=Math.round((p.getZ(i)-bed.min)/bed.step),offset=(row*(bed.cells+1)+col)*4;
        assert.equal(field[offset+3],p.getY(i));assert.equal(field[offset],c.getX(i));assert.equal(field[offset+1],c.getY(i));assert.equal(field[offset+2],c.getZ(i));vertices++;
      }
    }assert.ok(vertices>78961);
    const point=new THREE.Vector3();let animals=0;
    for(const id of ['yellow-tang','blacktip-reef-shark']){
      const batch=w.animals.batches.find(b=>b.id===id);assert.equal(batch.assetFamily,'source-reef-fish');animals+=batch.agents.length;
      assert.ok(!w.animals.cohesive.models.has(id)&&!w.animals.heroes.models.has(id));
      for(const a of batch.agents)for(const part of batch.parts){const p=part.mesh.geometry.attributes.position;
        for(let i=0;i<p.count;i++){
          point.fromBufferAttribute(p,i);const amplitude=.028*THREE.MathUtils.clamp((.26-point.x)/.6,0,1)**2;
          assert.ok(Math.hypot(point.x,Math.abs(point.z)+amplitude)*a.sizeM<=a.clearance.radius+1e-7);
        }
      }
    }assert.equal(animals,9);assert.equal(w.model.agents.length,293);
    let meshes=0;w.scene.traverse(o=>meshes+=!!o.isMesh);assert.ok(meshes<350);
  }finally{w.dispose();}
});
