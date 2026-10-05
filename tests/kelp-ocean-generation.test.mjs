import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKelpOceanGenerator, KELP_OCEAN_ELEMENT_LIMITS, kelpOceanRockMesh } from '../src/kelpOceanGeneration.js';
import { KELP_ANCHORS, floorHeight, habitatHeight } from '../src/kelpHabitat.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

test('authored floor vertices and ecological rock roots stay unchanged while support follows the rendered triangles', () => {
  for(const seed of [42,'42','other']){
    const generator=createKelpOceanGenerator(seed);
    for(let x=-40;x<=40;x+=2)for(let z=-40;z<=40;z+=2){
      if(Math.hypot(x,z)>40)continue;
      assert.equal(generator.sample(x,z).floorY,floorHeight(x,z));
      const authored=habitatHeight(x,z),floor=floorHeight(x,z);
      const expected=authored>floor?Math.max(authored,generator.floorSurface(x,z).height):generator.floorSurface(x,z).height;
      assert.equal(generator.heightAt(x,z),expected);
      assert.equal(generator.heightForCamera(x,z),expected);
    }
    assert.equal(generator.authoredAnchors,KELP_ANCHORS);
    for(const anchor of KELP_ANCHORS)assert.equal(generator.heightAt(anchor.x,anchor.z),anchor.y);
    for(let cx=-1;cx<=0;cx++)for(let cz=-1;cz<=0;cz++)for(const element of generator.chunk(cx,cz).elements)
      assert.ok(Math.hypot(element.x,element.z)>40,'no generated scenery inserted into original patch');
  }
});

test('seeded chunks are immutable and independent of load order, cache eviction and typed seeds', () => {
  const ordered=createKelpOceanGenerator('42'),reversed=createKelpOceanGenerator('42');
  const ids=[[1,-1],[4,-1],[8,2],[10,5],[-5,4],[-8,-6],[20,4],[30,-10]];
  const expected=ids.map(([x,z])=>ordered.chunk(x,z));
  for(const [x,z]of [...ids].reverse())reversed.chunk(x,z);
  for(let i=0;i<ids.length;i++)assert.deepEqual(reversed.chunk(...ids[i]),expected[i]);
  for(let i=0;i<50;i++)reversed.chunk(100+i,100-i);
  for(let i=0;i<ids.length;i++)assert.deepEqual(reversed.chunk(...ids[i]),expected[i]);
  ordered.clearCache();assert.deepEqual(ordered.chunk(...ids[0]),expected[0]);
  assert.notDeepEqual(createKelpOceanGenerator(42).chunk(4,-1),expected[1]);
  assert.ok(Object.isFrozen(expected[0])&&Object.isFrozen(expected[0].elements));
  assert.throws(()=>expected[0].elements.push({}));
});

test('bathymetry and forest fields are continuous at chunk boundaries and authored transition endpoints', () => {
  const generator=createKelpOceanGenerator('42');
  for(const coordinate of [-128,-96,-64,-40,40,64,96,128])for(const z of [-119,-64,0,41,133]){
    const a=generator.sample(coordinate-1e-5,z),b=generator.sample(coordinate+1e-5,z);
    assert.ok(Math.abs(a.floorY-b.floorY)<1e-4);assert.ok(Math.abs(a.forestCover-b.forestCover)<1e-4);
    assert.ok(Math.abs(a.rockiness-b.rockiness)<1e-4);
  }
});

test('the same world contains coherent forests, open clearings and rocky patches without copying populations', () => {
  const generator=createKelpOceanGenerator('42'),forest=generator.chunk(1,-1),rocks=generator.chunk(4,-1),clearing=generator.chunk(10,5);
  assert.equal(forest.composition.primary,'kelp-forest');assert.equal(rocks.composition.primary,'kelp-rock');
  assert.equal(clearing.composition.primary,'kelp-clearing');
  assert.ok(forest.counts.kelp>rocks.counts.kelp&&rocks.counts.kelp>clearing.counts.kelp);
  assert.equal(clearing.counts.kelp,0);assert.ok(clearing.counts.rock>0);
  for(const chunk of [forest,rocks,clearing]){
    assert.equal(Object.values(chunk.composition.habitats).reduce((a,b)=>a+b),64);
    assert.equal(chunk.habitatComposition,chunk.composition);
    assert.ok(chunk.composition.minDepthM>=12&&chunk.composition.maxDepthM<=27);
    assert.equal(chunk.agents,undefined);assert.equal(chunk.resources,undefined);
  }
});

test('each generated plant has a stable actual rock anchor, metre length and submerged canopy', () => {
  const generator=createKelpOceanGenerator('42'),ids=new Set();let plants=0;
  for(const [cx,cz]of [[1,-1],[8,2],[-5,4],[-8,-6],[30,-10]]){
    const chunk=generator.chunk(cx,cz),rocks=new Map(chunk.elements.filter(e=>e.kind==='rock').map(e=>[e.id,e]));
    assert.ok(chunk.counts.kelp<=KELP_OCEAN_ELEMENT_LIMITS.kelp&&chunk.counts.rock<=KELP_OCEAN_ELEMENT_LIMITS.rock);
    for(const element of chunk.elements){assert.ok(!ids.has(element.id));ids.add(element.id);
      assert.equal(Math.floor(element.x/64),cx);assert.equal(Math.floor(element.z/64),cz);
      if(element.kind!=='kelp')continue;
      plants++;const host=rocks.get(element.hostId);assert.ok(host);
      assert.equal(element.anchor.id,element.id);assert.equal(element.anchor.hostId,host.id);
      assert.equal(element.y,oceanRockHeight(host,element.x,element.z));
      assert.equal(element.y,generator.heightAt(element.x,element.z));
      assert.equal(element.anchor.lengthM,element.lengthM);assert.ok(element.lengthM>4&&element.lengthM<30);
      assert.ok(element.y+element.lengthM<12-.24);assert.ok(element.y+element.lengthM>7,'upper canopy remains observable');
      assert.ok(Object.isFrozen(element.anchor));
    }
  }
  assert.ok(plants>100);
});

test('generated support queries agree with actual Float32 rock triangles under scale and rotation', () => {
  const generator=createKelpOceanGenerator('42'),ray=new THREE.Raycaster();let checked=0;
  for(const rock of generator.chunk(4,-1).elements.filter(e=>e.kind==='rock')){
    const data=kelpOceanRockMesh(rock.profile),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setIndex(data.indices);
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(rock.x,rock.y,rock.z);mesh.rotation.y=rock.rotation;mesh.scale.set(rock.scale.x,rock.scale.y,rock.scale.z);mesh.updateMatrixWorld(true);
    for(const [dx,dz]of [[0,0],[.13,.1],[-.17,.14],[.28,-.09]]){
      const point=new THREE.Vector3(dx,0,dz).applyMatrix4(mesh.matrixWorld);
      ray.set(new THREE.Vector3(point.x,20,point.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
      const support=Math.max(generator.floorSurface(point.x,point.z).height,hit.point.y);
      assert.ok(Math.abs(generator.heightAt(point.x,point.z)-support)<1e-8);
      assert.ok(generator.heightForCamera(point.x,point.z)>=hit.point.y-1e-8);checked++;
    }
    geometry.dispose();material.dispose();
  }
  assert.ok(checked>40);
});

test('a rock bounding-box corner outside the actual footprint never turns a negative sea floor into zero-height support', () => {
  const generator=createKelpOceanGenerator('42');let checked=0;
  for(const rock of generator.chunk(4,-1).elements.filter(e=>e.kind==='rock')){
    const x=rock.x+rock.scale.x*.58,z=rock.z+rock.scale.x*.58;
    assert.equal(oceanRockHeight(rock,x,z),null);
    const floor=generator.floorSurface(x,z).height;assert.ok(floor<0);
    assert.equal(generator.heightAt(x,z),floor);assert.equal(generator.heightForCamera(x,z),floor);checked++;
  }
  assert.ok(checked>10);
});

test('large positive and negative coordinates remain finite, with a bounded cache and explicit malformed-input rejection', () => {
  const generator=createKelpOceanGenerator('42');
  for(let i=0;i<60;i++){
    const cx=(i%2?1:-1)*(15625+i),cz=-cx,chunk=generator.chunk(cx,cz);
    assert.ok(Number.isFinite(chunk.composition.minDepthM));assert.ok(generator.cacheStats().chunks<=32);
  }
  for(const [x,z]of [[1000259,-1000123],[-1000259,1000123]]){
    assert.ok(Number.isFinite(generator.heightAt(x,z)));assert.ok(Number.isFinite(generator.heightForCamera(x,z)));
  }
  assert.throws(()=>generator.sample(NaN,0));assert.throws(()=>generator.heightAt(0,Infinity));
  assert.throws(()=>generator.chunk(.5,0));assert.throws(()=>createKelpOceanGenerator({}));
  generator.clearCache();assert.equal(generator.cacheStats().chunks,0);
});
