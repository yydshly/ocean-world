import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample} from '../src/shallowSample.js';
import {composeJourneyHabitats,journeyMeadowChannel} from '../src/shallowJourneyHabitat.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';
import {shallowMeadowRibbonGeometry} from '../src/world/ShallowMeadowRibbonAssets.js';
import {shallowReefRubbleGeometry} from '../src/world/ShallowLiveReefAssets.js';

const baseline=createShallowSample(55),model=createShallowSample(55,{livingCommunities:true});

test('journey habitat is opt-in and retains identities, dimensions, bed and occupied hard habitats',()=>{
  assert.equal(baseline.journeyHabitat,undefined);
  assert.equal(model.preparedCover,true);
  assert.deepEqual(model.agents.map(a=>[a.id,a.speciesId,a.sizeM]),baseline.agents.map(a=>[a.id,a.speciesId,a.sizeM]));
  assert.deepEqual(model.bed.heights,baseline.bed.heights);
  const moved=new Set(model.journeyHabitat.reefs.moved.map(r=>r.id));
  assert.equal(moved.size,4);assert.equal(model.rocks.length,baseline.rocks.length);
  for(const rock of model.rocks){
    const before=baseline.rocks.find(r=>r.id===rock.id);
    if(!moved.has(rock.id))assert.deepEqual(rock,before);
    else{
      assert.ok(!baseline.agents.some(a=>a.host===rock.id));
      assert.ok(!baseline.corals.some(c=>c.host===rock.id));
      assert.deepEqual(rock.scale,before.scale);
    }
  }
  assert.deepEqual(model.corals,baseline.corals);
  const summary=model.journeyHabitat;
  assert.equal(composeJourneyHabitats(model),summary,'composition is idempotent');
});

test('relocated complete reef formations use the exact displayed triangle support without stale bins',()=>{
  for(const moved of model.journeyHabitat.reefs.moved){
    for(let dx=-7;dx<=7;dx+=.7)for(let dz=-7;dz<=7;dz+=.7){
      const x=moved.after.x+dx,z=moved.after.z+dz;
      let expected=model.floor(x,z);for(const rock of model.rocks)expected=Math.max(expected,oceanRockHeight(rock,x,z)??expected);
      assert.ok(Math.abs(model.surface(x,z)-expected)<1e-9,`surface ${x},${z}`);
    }
  }
});

test('meadow is a connected grass habitat with an actual sand opening and bounded batches',()=>{
  const rows=model.grass.filter(g=>g.journeyHabitat==='continuous-meadow');
  assert.ok(rows.length>=100);
  const visited=new Set();let largest=[];
  for(let start=0;start<rows.length;start++){
    if(visited.has(start))continue;const pending=[start],component=[];visited.add(start);
    while(pending.length){const i=pending.pop();component.push(rows[i]);
      for(let j=0;j<rows.length;j++)if(!visited.has(j)&&Math.hypot(rows[i].x-rows[j].x,rows[i].z-rows[j].z)<1.35){visited.add(j);pending.push(j);}
    }
    if(component.length>largest.length)largest=component;
  }
  assert.ok(largest.length>=80,`largest connected habitat ${largest.length}`);
  assert.ok(Math.max(...largest.map(g=>g.x))-Math.min(...largest.map(g=>g.x))>7);
  assert.ok(Math.max(...largest.map(g=>g.z))-Math.min(...largest.map(g=>g.z))>3.5);
  for(const g of rows)if(g.x>25&&g.x<44)assert.ok(Math.abs(g.z-journeyMeadowChannel(g.x))>.82);
  assert.ok(model.journeyHabitat.meadow.grassBatches<=8,'spatial grass draw groups stay bounded');
  assert.ok(model.grass.length<500);
});

test('all displayed grass roots and both leaf sway extremes stay on soft sediment',()=>{
  const g=shallowMeadowRibbonGeometry(),p=g.attributes.position,root=g.attributes.rootXZ;
  try{for(const row of model.grass){const co=Math.cos(row.rotation),si=Math.sin(row.rotation);
    for(let i=0;i<p.count;i++){
      const rx=row.x+(root.getX(i)*co+root.getY(i)*si)*row.width,rz=row.z+(-root.getX(i)*si+root.getY(i)*co)*row.width;
      const y=model.floor(rx,rz)+p.getY(i)*row.height;
      for(const sign of [-1,1]){const lx=p.getX(i)+sign*.07*p.getY(i)**2,lz=p.getZ(i),x=row.x+(lx*co+lz*si)*row.width,z=row.z+(-lx*si+lz*co)*row.width;
        assert.ok(model.surface(x,z)-model.floor(x,z)<=.002,`grass intersects hard reef ${x},${z}`);
        assert.ok(y>=model.floor(x,z)-.002,`grass under sediment ${x},${z}`);
      }
    }
  }}finally{g.dispose();}
});

test('sand fragments follow the substrate and preserve every authored animal probing footprint',()=>{
  const g=shallowReefRubbleGeometry(),point=new THREE.Vector3(),normal=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),q=new THREE.Quaternion(),matrix=new THREE.Matrix4();
  try{for(const row of model.rubble){
    normal.fromArray(row.supportNormal??[0,1,0]);q.setFromUnitVectors(up,normal).multiply(new THREE.Quaternion().setFromAxisAngle(up,row.rotation));
    matrix.compose(new THREE.Vector3(row.x,row.y,row.z),q,new THREE.Vector3(row.width,row.height,row.depth??row.width));
    for(let i=0;i<g.attributes.position.count;i++){
      point.fromBufferAttribute(g.attributes.position,i).applyMatrix4(matrix);
      assert.ok(model.surface(point.x,point.z)-model.floor(point.x,point.z)<=.002);
      assert.ok(point.y>=model.floor(point.x,point.z)-.006,`rubble penetrates ${point.toArray()}`);
    }
    if(row.journeyHabitat){
      assert.ok(!(row.x>7&&row.x<25&&row.z>-1.5&&row.z<4.8));
      for(const f of model.journeyLife.footprints)assert.ok(Math.hypot(row.x-f.x,row.z-f.z)>f.r+row.width*.65+.12);
    }
  }}finally{g.dispose();}
});
