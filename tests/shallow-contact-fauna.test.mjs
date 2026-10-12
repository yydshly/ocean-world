import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buryNaturalGroundCut,naturalGroundCutSegments,naturalHabitatData,naturalHabitatGeometry} from '../src/world/ShallowNaturalHabitat.js';
import {ShallowContactFauna} from '../src/world/ShallowContactFauna.js';
import {ShallowNearCommunity} from '../src/world/ShallowNearCommunity.js';
import {shallowSampleSpeciesCatalog} from '../src/shallowSampleSpecies.js';

test('the scan perimeter is physically below sediment while interior rocks and original UVs remain intact',()=>{
  const source=naturalHabitatGeometry(naturalHabitatData.coast_land_rocks_02.variants.near[0]),g=buryNaturalGroundCut(source.clone()),p=g.attributes.position,q=source.attributes.position;
  const boundary=new Set(naturalGroundCutSegments().flat().map(p=>p.map(v=>Math.round(v*1e6)).join(',')));
  let buried=0,unchanged=0;
  assert.deepEqual(g.attributes.uv.array,source.attributes.uv.array);assert.deepEqual(g.index.array,source.index.array);
  for(let i=0;i<p.count;i++){
    assert.equal(p.getX(i),q.getX(i));assert.equal(p.getZ(i),q.getZ(i));
    if(boundary.has([q.getX(i),q.getY(i),q.getZ(i)].map(v=>Math.round(v*1e6)).join(','))){assert.ok(p.getY(i)<-.0119);buried++;}
    if(p.getY(i)===q.getY(i))unchanged++;
    assert.ok(p.getY(i)<=Math.max(q.getY(i),-.012)+1e-7);
  }
  assert.ok(buried>300&&unchanged>p.count*.5);g.dispose();source.dispose();
});

test('bank-only source maps cannot leak into older independent coral UVs',()=>{
  const kit=new ShallowNearCommunity();try{
    assert.equal(kit.coralMaterial('branching-1'),null);
    const old=kit.coralMaterial('table-2'),bank=kit.bankCoralMaterial('table-2');
    assert.ok(old.every(m=>m.userData.nativeAssetDirectory==='shallow-near-community'));
    assert.ok(bank.every(m=>m.userData.nativeAssetDirectory==='shallow-living-kit'));
    assert.notEqual(old[0],bank[0]);
  }finally{kit.dispose();}
});

test('whole crab and octopus assets have bounded complete bodies and explicit non-species source labels',()=>{
  const kit=new ShallowContactFauna();try{
    for(const id of ['spotted-reef-crab','day-octopus']){
      const animal=kit.create(id),species=shallowSampleSpeciesCatalog.find(s=>s.id===id);
      assert.equal(species.scientificName,null);assert.ok(species.sourceRecord.includes('contact-fauna'));
      assert.equal(kit.create(id),animal);assert.ok(animal.motionRadius<(id==='day-octopus'?.65:1.1));
      for(const mesh of animal.root.children){const p=mesh.geometry.attributes.position;
        for(let t=0;t<=75;t+=5)for(let i=0;i<p.count;i++){
          const weight=THREE.MathUtils.smoothstep(p.getY(i),0,.08),z=p.getZ(i)+.008*weight*Math.sin(t*.85+p.getX(i)*7);
          assert.ok(p.getY(i)>=-1e-6);assert.ok(Math.hypot(p.getX(i),z)<=animal.motionRadius+1e-6);
        }
      }
    }
  }finally{kit.dispose();kit.dispose();}
});

test('new asset licences and source images are traceable and original bytes unchanged',()=>{
  const folder='public/assets/shallow-contact-fauna',receipt=JSON.parse(fs.readFileSync(`${folder}/provenance.json`));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.deepEqual(receipt.records.map(r=>r.license),['by','by-nc']);
  const originals=JSON.parse(fs.readFileSync('tests/fixtures/shallow-source-images.json')).images;
  for(const record of receipt.records){
    const images=Object.entries(originals).filter(([file])=>file.startsWith(`shallow-contact-fauna/${record.key}-`));
    assert.ok(images.length>0);
    for(const [file,original] of images)assert.equal(hash(fs.readFileSync(`public/assets/${file}`)),original.sha256);
  }
});
