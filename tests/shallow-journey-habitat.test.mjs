import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample} from '../src/shallowSample.js';
import {composeJourneyHabitats,journeyMeadowChannel} from '../src/shallowJourneyHabitat.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';
import {shallowMeadowRibbonGeometry} from '../src/world/ShallowMeadowRibbonAssets.js';
import {shallowReefRubbleGeometry} from '../src/world/ShallowLiveReefAssets.js';

const baseline=createShallowSample(55),model=createShallowSample(55,{livingCommunities:true});

test('stage04 is opt-in and moves complete formations while retaining bed, assets and animal identities',()=>{
  assert.equal(baseline.journeyHabitat,undefined);assert.equal(model.preparedCover,true);
  assert.deepEqual(model.agents.map(a=>[a.id,a.speciesId,a.sizeM]),baseline.agents.map(a=>[a.id,a.speciesId,a.sizeM]));
  assert.deepEqual(model.bed.heights,baseline.bed.heights);
  const moved=new Map(model.journeyHabitat.reefs.moved.map(r=>[r.id,r]));
  assert.ok(moved.size>=20,'macro layout changes whole banks throughout the three habitats');
  assert.ok([...moved.values()].filter(r=>r.distance>5).length>=12);
  assert.equal(model.rocks.length,baseline.rocks.length);
  for(const rock of model.rocks){
    const before=baseline.rocks.find(r=>r.id===rock.id),move=moved.get(rock.id);
    if(!move)assert.deepEqual(rock,before);
    else{
      assert.deepEqual(rock.scale,before.scale);assert.equal(rock.profile,before.profile);assert.equal(rock.fieldAsset,before.fieldAsset);
      for(const a of model.agents.filter(a=>a.host===rock.id)){
        const old=baseline.agents.find(row=>row.id===a.id);
        assert.ok(Math.abs((a.home.x-rock.x)-(old.home.x-before.x))<1e-9);
        assert.ok(Math.abs((a.home.z-rock.z)-(old.home.z-before.z))<1e-9);
      }
    }
  }
  assert.ok([...moved.values()].reduce((sum,r)=>sum+r.occupants.length,0)>=6,'occupied formations move intact too');
  assert.deepEqual(model.corals,baseline.corals);
  assert.equal(model.journeyHabitat.communities.length,3);assert.equal(model.journeyHabitat.transitions.length,2);
  const summary=model.journeyHabitat;assert.equal(composeJourneyHabitats(model),summary,'composition is idempotent');
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

test('moved residents keep their complete supported disk and transported habitat records',()=>{
  for(const move of model.journeyHabitat.reefs.moved){
    const host=model.rocks.find(r=>r.id===move.id);
    for(const id of move.occupants){
      const a=model.agents.find(a=>a.id===id),site=model.slopeHabitats.footprints.find(f=>f.agentId===id)??model.primaryHabitatSites.find(f=>f.agentId===id);
      assert.equal(site.host,host.id);assert.ok(Math.hypot(site.x-a.home.x,site.z-a.home.z)<1e-9);
      if(a.mode!=='crawl'&&a.mode!=='fixed')continue;
      const steps=Math.ceil(site.r/.045);
      for(let ix=-steps;ix<=steps;ix++)for(let iz=-steps;iz<=steps;iz++){
        const dx=ix*site.r/steps,dz=iz*site.r/steps;if(dx*dx+dz*dz>site.r*site.r)continue;
        const x=site.x+dx,z=site.z+dz,y=oceanRockHeight(host,x,z);
        assert.notEqual(y,null);assert.ok(y>model.floor(x,z)+.035,`${id} above sediment`);
        assert.ok(Math.abs(model.surface(x,z)-y)<.01,`${id} unobstructed support`);
      }
    }
  }
});

test('meadow has a connected irregular core, graded fringe and actual sand slit',()=>{
  const rows=model.grass.filter(g=>g.journeyHabitat==='continuous-meadow');assert.ok(rows.length>=250);
  const visited=new Set();let largest=[];
  for(let start=0;start<rows.length;start++){
    if(visited.has(start))continue;const pending=[start],component=[];visited.add(start);
    while(pending.length){const i=pending.pop();component.push(rows[i]);
      for(let j=0;j<rows.length;j++)if(!visited.has(j)&&Math.hypot(rows[i].x-rows[j].x,rows[i].z-rows[j].z)<1.35){visited.add(j);pending.push(j);}
    }if(component.length>largest.length)largest=component;
  }
  assert.ok(largest.length>=220,`largest connected habitat ${largest.length}`);
  assert.ok(Math.max(...largest.map(g=>g.x))-Math.min(...largest.map(g=>g.x))>18);
  assert.ok(Math.max(...largest.map(g=>g.z))-Math.min(...largest.map(g=>g.z))>5);
  assert.ok(model.journeyHabitat.meadow.coreClumps>200);assert.ok(model.journeyHabitat.meadow.fringeClumps>=30);
  const mean=(zone,key)=>{const a=rows.filter(g=>g.zone===zone);return a.reduce((s,g)=>s+g[key],0)/a.length;};
  assert.ok(mean('core','height')>mean('fringe','height')+.10);assert.ok(mean('core','width')>mean('fringe','width')+.15);
  for(const g of rows)if(g.x>23&&g.x<46)assert.ok(Math.abs(g.z-journeyMeadowChannel(g.x))>.72);
  assert.ok(model.journeyHabitat.meadow.grassBatches<=8);assert.ok(model.grass.length<500);
});

test('life observation anchors refer to real contiguous grass margins and clear sand sites',()=>{
  const anchors=model.journeyHabitat.lifeAnchors;assert.equal(anchors.reefPassages.length,3);assert.equal(anchors.grassEdges.length,3);
  for(const row of [...anchors.reefPassages,...anchors.grassEdges])for(const [i,p]of row.points.entries()){
    assert.ok(Math.abs(p.y-model.surface(p.x,p.z))<1e-9);
    if(row.speciesId)assert.ok(model.agents.some(a=>a.speciesId===row.speciesId));
    else{
      assert.ok(Math.min(...model.grass.map(g=>Math.hypot(g.x-p.x,g.z-p.z)))<1.2);
      if(i)assert.ok(Math.hypot(p.x-row.points[i-1].x,p.z-row.points[i-1].z)<2);
    }
  }
  for(const f of anchors.softBeds)for(let i=0;i<24;i++){
    const x=f.x+f.radius*Math.cos(i*TAU/24),z=f.z+f.radius*Math.sin(i*TAU/24);
    assert.ok(model.surface(x,z,true)-model.floor(x,z)<.002);
  }
});
const TAU=Math.PI*2;

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

test('sand fragments follow substrate, grade toward bare sand and preserve probing footprints',()=>{
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
      assert.ok(!(row.x>7&&row.x<19&&row.z>-1.5&&row.z<4.8));
      for(const f of model.journeyLife.footprints)assert.ok(Math.hypot(row.x-f.x,row.z-f.z)>f.r+row.width*.65+.12);
    }
  }}finally{g.dispose();}
  const bands=[0,1,2].map(b=>model.rubble.filter(r=>r.edgeBand===b));assert.ok(bands.every(b=>b.length>=15));
  assert.ok(bands[2].reduce((s,r)=>s+r.width,0)/bands[2].length>bands[0].reduce((s,r)=>s+r.width,0)/bands[0].length+.05);
});
