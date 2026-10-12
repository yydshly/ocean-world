import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {livingShallowsSpeciesCatalog} from '../src/sceneCatalog.js';

test('new reef and sand communities reach the default moving view at natural size without duplicate legacy bodies',()=>{
  const world=new ShallowSampleScene(55);world.camera.aspect=16/9;world.camera.updateProjectionMatrix();
  const cases=[['cleaner-wrasse',25,10],['black-blotched-porcupinefish',25,25],['lionfish',69,22],['reef-cuttlefish',47,20]];
  try{
    for(const [id,time,minimumPixels] of cases){
      const agents=world.model.agents.filter(a=>a.speciesId===id&&a.sampleCommunityVisit===time);assert.ok(agents.length);
      const batch=world.animals.batches.find(b=>b.id===id);assert.ok(batch.parts.length);
      assert.equal(world.animals.templates.getObject(`sample-template-${id}`),null,'new complete asset must not leave a duplicate legacy template');
      world.update(time);world.camera.updateMatrixWorld(true);let visible=0;
      for(const a of agents){
        const position=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=position.distanceTo(world.camera.position),ndc=position.project(world.camera),
          pixels=a.sizeM/distance*720/(2*Math.tan(58*Math.PI/360));
        if(ndc.z>-1&&ndc.z<1&&Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.90&&pixels>=minimumPixels)visible++;
        const original=livingShallowsSpeciesCatalog.find(s=>s.id===id);
        assert.ok(a.sizeM<=(original?.lengthM??.32)*1.12+1e-7,'close observation must not enlarge the catalogue animal');
      }
      assert.ok(visible>=Math.ceil(agents.length*.65),`${id} has no readable default passage: ${visible}/${agents.length}`);
    }
    const tail=world.model.corals.filter(c=>c.x>25);assert.ok(tail.some(c=>c.form==='branching')&&tail.some(c=>c.form==='table'),'tail reef lost its living crown variety');
  }finally{world.dispose();}
});
