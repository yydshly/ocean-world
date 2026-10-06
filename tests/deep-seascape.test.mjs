import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { createDeepSeascapePlans, validateDeepSeascapePlan, deepSeascapeRoute } from '../src/deepSeascape.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

const fixture=()=>{const g=createDeepOceanGenerator('42',{seascape:true});return{g,base:g.baseGenerator,plans:createDeepSeascapePlans(g,-6,-10)};};
const rockAdditions=plans=>plans.flatMap(p=>p.elements.filter(e=>p.addedRockIds.includes(e.id)));

test('one 128m shared bed preserves external bands, every native element footprint and a complete low-slope plain',()=>{
  const{g,base,plans}=fixture();assert.deepEqual(plans.map(p=>p.id),['-6,-10','-5,-10','-6,-9','-5,-9']);
  const group=plans[0].group;assert.equal(group.widthM,128);assert.equal(group.plainOwnerId,'-5,-10');assert.equal(group.addedRockCount,2);
  assert.ok(group.deltaSpanM>.75&&group.maxTriangleGrade<=.12&&group.seam.lengthM>=8);
  for(const p of plans){const old=base.chunk(p.cx,p.cz);assert.equal(validateDeepSeascapePlan(p,base),true);
    assert.equal(p.baseStamp,JSON.stringify(old));assert.deepEqual(p.elements.slice(0,old.elements.length),old.elements);
    assert.ok(Object.isFrozen(p.floorPatch.heights));assert.equal(p.floorPatch.heights.length,65**2);
    for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){const wx=p.cx*64+x,wz=p.cz*64+z,lx=wx+384,lz=wz+640;
      if(lx<=16||lx>=112||lz<=16||lz>=112||p.id===group.plainOwnerId)assert.equal(p.floorPatch.heights[z*65+x],base.floorVertex(wx,wz));}
  }
  const byId=new Map(plans.map(p=>[p.id,p]));
  for(let z=0;z<2;z++)for(let i=0;i<=64;i++)assert.equal(byId.get(`-6,${-10+z}`).floorPatch.heights[i*65+64],byId.get(`-5,${-10+z}`).floorPatch.heights[i*65]);
  for(let x=0;x<2;x++)for(let i=0;i<=64;i++)assert.equal(byId.get(`${-6+x},-10`).floorPatch.heights[64*65+i],byId.get(`${-6+x},-9`).floorPatch.heights[i]);
  g.setSeascapePlans(plans);
  for(let cz=-11;cz<=-8;cz++)for(let cx=-7;cx<=-4;cx++)for(const e of base.chunk(cx,cz).elements){
    for(let i=-1;i<16;i++){const a=i*Math.PI/8,r=i<0?0:.49,lx=Math.cos(a)*r*e.scale.x,lz=Math.sin(a)*r*e.scale.z;
      const x=e.x+lx*Math.cos(e.rotation)+lz*Math.sin(e.rotation),z=e.z-lx*Math.sin(e.rotation)+lz*Math.cos(e.rotation);
      assert.deepEqual(g.floorSurface(x,z),base.floorSurface(x,z));assert.deepEqual(g.supportAt(x,z),base.supportAt(x,z));}}
  assert.throws(()=>createDeepSeascapePlans(base,-5,-10),TypeError);assert.throws(()=>createDeepSeascapePlans(base,0,0),RangeError);
  assert.equal(validateDeepSeascapePlan(plans[0],createDeepOceanGenerator(42)),false);
});

test('two sparse wide solids keep original counts within budget and are actual same-source hard support and camera obstacles',()=>{
  const{g,base,plans}=fixture();g.setSeascapePlans(plans);const rocks=rockAdditions(plans);assert.equal(rocks.length,2);
  for(const rock of rocks){assert.equal(rock.kind,'rock');assert.ok(['mound','ridge'].includes(rock.profile));
    assert.ok(rock.scale.x>=8&&rock.scale.x<=12&&rock.scale.y>=1&&rock.scale.y<=1.6);
    const support=g.supportAt(rock.x,rock.z);assert.equal(support.elementId,rock.id);assert.equal(support.substrate,'rock');
    assert.equal(support.height,oceanRockHeight(rock,rock.x,rock.z));assert.ok(support.height>g.floorSurface(rock.x,rock.z).height+.35);
    assert.equal(g.sample(rock.x,rock.z).habitat,'deep-hard-bottom');assert.equal(g.sample(rock.x,rock.z).substrate,'rock');
    assert.equal(g.sample(rock.x,rock.z).floorY,g.floorSurface(rock.x,rock.z).height);assert.ok(g.heightForCamera(rock.x,rock.z)>=support.height);
    // Every real mesh rim vertex is buried below the queried physical bed.
    for(let i=0;i<16;i++){const angle=i*Math.PI/8,lx=Math.cos(angle)*rock.scale.x*.5,lz=Math.sin(angle)*rock.scale.z*.5;
      const x=rock.x+lx*Math.cos(rock.rotation)+lz*Math.sin(rock.rotation),z=rock.z-lx*Math.sin(rock.rotation)+lz*Math.cos(rock.rotation);
      assert.ok(rock.y<g.floorSurface(x,z).height);}
  }
  for(const p of plans){const c=g.chunk(p.cx,p.cz);assert.ok(c.counts.rock<=8&&c.counts.rubble<=24);
    assert.equal(c.counts.rock,base.chunk(p.cx,p.cz).counts.rock+p.addedRockIds.length);
    assert.equal(Object.values(c.composition.habitats).reduce((a,b)=>a+b),64);}
  const point=plans[0].group.seam.center;
  assert.ok(g.floorSurface(point.x,point.z).height-base.floorSurface(point.x,point.z).height>=.25);
  for(const[x,z]of[[point.x-.001,point.z],[point.x+.001,point.z]]){
    assert.equal(g.sample(x,z).floorY,g.floorSurface(x,z).height);assert.equal(g.sample(x,z).depthM,g.surfaceY-g.floorSurface(x,z).height);}
});

test('temporary complete replacement and failed publication preserve original public source, revision and physical caches',()=>{
  const{g,base,plans}=fixture(),rock=rockAdditions(plans)[0],before=base.supportAt(rock.x,rock.z),initialChunk=g.chunk(-6,-9);
  assert.equal(g.seascapeRevision,0);assert.equal(g.seascapePlan(-6,-9),undefined);
  g.withSeascapePlans(plans,view=>{assert.equal(view.seascapeCandidatesActive,true);assert.equal(view.supportAt(rock.x,rock.z).elementId,rock.id);
    assert.equal(view.seascapeRevision,0);assert.equal(view.seascapePlan(-6,-9),undefined);assert.throws(()=>view.setSeascapePlans(plans),/temporary/);
    assert.throws(()=>view.withSeascapePlans([],()=>{assert.deepEqual(view.supportAt(rock.x,rock.z),before);throw new Error('birth failed');}),/birth failed/);
    assert.equal(view.supportAt(rock.x,rock.z).elementId,rock.id);});
  assert.deepEqual(g.supportAt(rock.x,rock.z),before);assert.equal(g.chunk(-6,-9),initialChunk);assert.equal(g.seascapeRevision,0);
  assert.throws(()=>g.withSeascapePlans(plans,async()=>{}),/synchronous/);assert.throws(()=>g.withSeascapePlans(plans,()=>Promise.resolve()),/asynchronous/);
  g.setSeascapePlans(plans);const saved=g.seascapePlan(-6,-9),stats=g.seascapeRegistryStats();
  g.withSeascapePlans([],view=>{assert.deepEqual(view.supportAt(rock.x,rock.z),before);assert.deepEqual(view.seascapeRegistryStats(),stats);});
  assert.equal(g.supportAt(rock.x,rock.z).elementId,rock.id);
  const bad=structuredClone(plans);bad[0].floorPatch.heights[32*65+32]+=.1;
  for(const invalid of[bad,[...plans,plans[0]],Array(26).fill(plans[0])]){assert.throws(()=>g.setSeascapePlans(invalid),TypeError);assert.equal(g.seascapeRevision,1);assert.equal(g.seascapePlan(-6,-9),saved);}
  assert.equal(g.setSeascapePlans(structuredClone(plans).reverse()),false);assert.equal(g.seascapeRevision,1);
  g.clearCache();assert.equal(g.supportAt(rock.x,rock.z).elementId,rock.id);
  g.setSeascapePlans([]);assert.deepEqual(g.supportAt(rock.x,rock.z),before);assert.equal(g.chunk(-6,-9),base.chunk(-6,-9));
});

test('default source remains exact and bounded route discovery never publishes new terrain or resources',()=>{
  const{g,base}=fixture();assert.equal(Object.hasOwn(createDeepOceanGenerator('42'),'seascapeRouteStops'),false);
  for(const[x,z]of[[-343.69,-527.16],[-320,-559],[0,0],[40,0],[1000259,-1000123]])for(const name of['sample','floorVertex','floorSurface','supportAt','heightAt','floorNormal','heightForCamera'])
    assert.deepEqual(g[name](x,z),base[name](x,z));
  const route=g.seascapeRouteStops;assert.equal(route,deepSeascapeRoute(base));assert.equal(route,g.seascapeRouteStops);
  assert.deepEqual(route.map(p=>p.id),['deep-plain-community','deep-slope-outcrop']);
  assert.equal(g.seascapeRegistryStats().size,0);assert.equal(g.seascapeRevision,0);
  assert.ok(Math.hypot(route[0].x-route[1].x,route[0].z-route[1].z)>60);
  assert.deepEqual(createDeepSeascapePlans(createDeepOceanGenerator('42'),-6,-10),createDeepSeascapePlans(base,-6,-10));
});
