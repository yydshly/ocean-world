import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFieldReefMesh,oceanRockSurface} from '../src/oceanRockShape.js';
import {createLivingShallowsGenerator} from '../src/livingShallowsGeneration.js';
import {OceanEcology,oceanSupportHeight} from '../src/oceanEcology.js';
import {createReefGuildPlan} from '../src/reefGuildHabitat.js';

test('scan bounds retain overlapping faces, original tie normals, negative height and tolerated edges',()=>{
  const profile='sample-field-stable-demo-edge-test';
  // Coincident faces deliberately have different slopes/normals; the original
  // face wins ties. A lower negative face remains valid where no top exists.
  const positions=[-.4,-2,-.4,.4,-2,-.4,0,-2,.4, -.4,-1,-.4,.4,-1,-.4,0,-1,.4,
    -.4,-1,-.4,.4,-1,-.4,0,0,.4];
  registerFieldReefMesh(profile,positions,[0,1,2,3,4,5,6,7,8]);
  assert.equal(oceanRockSurface(profile,0,0).height,-.5);
  const edge=oceanRockSurface(profile,0,Math.fround(-.4));
  assert.equal(edge.height,-1);assert.equal(edge.normal.y,1);assert.equal(Math.abs(edge.normal.z),0);
  assert.equal(oceanRockSurface(profile,0,-.4-1e-6),null);
  // Stay inside the existing grid cell while extending just beyond the edge.
  const tolerance=oceanRockSurface(profile,.2+1e-12,0);
  assert.ok(tolerance);assert.ok(Number.isFinite(tolerance.height));
});

test('frozen guild plant broadphase matches exhaustive mutable-descriptor planning',()=>{
  for(const seed of ['living-shallows-v1|string:42','living-shallows-v1|string:55']){
    const generator=createLivingShallowsGenerator(seed),ecology=new OceanEcology(seed,generator);
    const mutable={...generator,chunk:(cx,cz)=>{
      const chunk=generator.chunk(cx,cz);return {...chunk,elements:structuredClone(chunk.elements)};
    }};
    for(const [cx,cz] of [[3,3],[4,3],[5,3],[3,4]]){
      const region=ecology._createRegion(cx,cz),options={random:salt=>ecology._random(region,salt),
        surface:(x,z,avoidCoral)=>oceanSupportHeight(generator,x,z,{avoidCoral}),
        bed:(x,z)=>generator.floorSurface(x,z).height,availableSlots:20-region.agents.length};
      assert.deepEqual(createReefGuildPlan(generator,region,options),createReefGuildPlan(mutable,region,options));
    }
  }
});
