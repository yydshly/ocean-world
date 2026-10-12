import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';

test('whole changed substrate keeps existing and new rendered grass and rubble clear of actual hard surfaces',()=>{
  const world=new ShallowSampleScene(55),model=world.model,matrix=new THREE.Matrix4(),point=new THREE.Vector3(),root=new THREE.Vector3();
  let grassVertices=0,rubbleVertices=0;
  try{
    world.scene.updateMatrixWorld(true);
    for(const batch of world.grassBatches){
      const p=batch.nearGeometry.attributes.position,roots=batch.nearGeometry.attributes.rootXZ;
      for(let row=0;row<batch.mesh.count;row++){
        batch.mesh.getMatrixAt(row,matrix);
        for(let i=0;i<p.count;i++){
          root.set(roots.getX(i),0,roots.getY(i)).applyMatrix4(matrix);
          assert.ok(model.surface(root.x,root.z)-model.floor(root.x,root.z)<=.00201,'a ribbon root occupies hard reef');
          const yCorrection=model.floor(root.x,root.z)-root.y;
          for(const sign of [-1,1]){
            point.fromBufferAttribute(p,i);point.x+=sign*.07*p.getY(i)**2;point.applyMatrix4(matrix);point.y+=yCorrection;
            assert.ok(model.surface(point.x,point.z)-model.floor(point.x,point.z)<=.00201,'a bounded swaying leaf occupies hard reef');
            assert.ok(point.y>=model.floor(point.x,point.z)-.00201,'a bounded swaying leaf penetrates the displayed bed');
          }
          grassVertices++;
        }
      }
    }
    const rubbleMesh=world.environment.children.find(o=>o.isInstancedMesh&&o.geometry.userData.role==='reef-skeleton-rubble-display-not-biomass');
    assert.ok(rubbleMesh);assert.equal(rubbleMesh.count,model.rubble.length);
    const p=rubbleMesh.geometry.attributes.position;
    for(let row=0;row<rubbleMesh.count;row++){
      rubbleMesh.getMatrixAt(row,matrix);let contact=Infinity;
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(matrix);const floor=model.floor(point.x,point.z);
        assert.ok(model.surface(point.x,point.z)-floor<=.00201,'fragment intersects a hard slope');
        assert.ok(point.y>=floor-(p.getY(i)<.14?.005:.001)-1e-5,'fragment penetrates the displayed bed');
        contact=Math.min(contact,point.y-floor);rubbleVertices++;
      }
      assert.ok(contact<=.00101,'fragment pile floats above all bed vertices');
    }
    assert.ok(grassVertices>200000&&rubbleVertices>10000,'whole existing scenery must be verified, not only the new patch');
  }finally{world.dispose();}
});
