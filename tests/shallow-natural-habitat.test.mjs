import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {naturalBankSubstrate,naturalBankHeight,naturalHabitatData} from '../src/world/ShallowNaturalHabitat.js';
import {createShallowSample} from '../src/shallowSample.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('natural contact terrain retains source UVs and exact visible support, without any added flat platform',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster();
  for(let variant=0;variant<2;variant++){
    const g=naturalBankSubstrate(variant),far=naturalBankSubstrate(variant,'distant'),mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();
    assert.equal(g.index.count/3,2*naturalHabitatData.coast_land_rocks_02.variants.near[0].triangles);
    assert.ok(g.attributes.uv.count===g.attributes.position.count);assert.ok(far.index.count<g.index.count*.25);
    let hits=0,misses=0;const heights=[];
    for(let x=-.56;x<.56;x+=.071)for(let z=-.38;z<.6;z+=.069){
      ray.set(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0],height=naturalBankHeight(variant,x,z);
      if(hit){assert.ok(Math.abs(hit.point.y-height)<1e-6);hits++;heights.push(height);}else{assert.equal(height,null);misses++;}
    }
    assert.ok(hits>80&&misses>20);assert.ok(new Set(heights.map(h=>h.toFixed(5))).size>80);
    g.dispose();far.dispose();
  }material.dispose();
});

test('cached natural animal placement matches uncached geometry validation and leaves unsuitable animals intact',()=>{
  const live=createShallowSample(55),authored=createShallowSample(55,{prepareCover:false});
  assert.equal(live.preparedHabitats,true);assert.equal(authored.preparedHabitats,false);
  assert.deepEqual(live.slopeHabitats.footprints,authored.slopeHabitats.footprints);
  assert.deepEqual(live.agents.map(a=>[a.id,a.speciesId,a.sizeM,a.home,a.host]),authored.agents.map(a=>[a.id,a.speciesId,a.sizeM,a.home,a.host]));
  assert.equal(live.slopeHabitats.residents.length+live.slopeHabitats.unplaced.length,20);
  for(const id of live.slopeHabitats.unplaced){const a=live.agents.find(a=>a.id===id);assert.ok(a&&!a.slopeHabitat);}
});

test('redistributable original photographs are unmodified and rejected specimen is absent from the scene',()=>{
  const folder='public/assets/shallow-natural-habitat',p=JSON.parse(fs.readFileSync(`${folder}/provenance.json`));
  assert.equal(p.records.length,1);assert.equal(p.records[0].license,'CC0-1.0');
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(fs.readFileSync(`${folder}/coast_land_rocks_02-0.jpg`)),JSON.parse(fs.readFileSync('tests/fixtures/shallow-source-images.json')).images['shallow-natural-habitat/coast_land_rocks_02-0.jpg'].sha256);
  const world=new ShallowSampleScene();try{
    assert.equal(world.model.rocks.filter(r=>r.fieldAsset==='natural-substrate').length,3);
    const fish=world.animals.batches.find(b=>b.id==='unidentified-reef-fish');assert.equal(fish.agents.length,30);assert.equal(fish.assetFamily,'source-reef-fish');
    assert.ok(!world.animals.cohesive.models.has('unidentified-reef-fish'));
    assert.ok(!world.model.agents.some(a=>a.speciesId==='bigeye-trevally'));
    let meshes=0;world.scene.traverse(o=>meshes+=!!o.isMesh);assert.ok(meshes<350);
  }finally{world.dispose();}
});
