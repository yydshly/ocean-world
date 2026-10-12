import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFieldReefMesh,oceanRockSurface} from '../src/oceanRockShape.js';

test('height-pruned scan queries retain overhangs, negative floors and stable coincident normals',()=>{
  const positions=[],indices=[];
  const triangle=points=>{const start=positions.length/3;positions.push(...points.flat());indices.push(start,start+1,start+2);};
  // Underwater floor, two crossing surfaces, then a higher face whose box
  // shares a query bin but which does not cover the query point.
  triangle([[-.5,-2,-.5],[.5,-2,-.5],[0,-2,.5]]);
  triangle([[-.25,.25,-.25],[.25,.75,-.25],[0,.5,.25]]);
  triangle([[-.25,.75,-.25],[.25,.25,-.25],[0,.5,.25]]);
  triangle([[.005,9,.005],[.012,9,.005],[.012,9,.012]]);
  registerFieldReefMesh('sample-field-release-query',positions,indices);
  assert.equal(oceanRockSurface('sample-field-release-query',0,0).height,.5);
  assert.ok(oceanRockSurface('sample-field-release-query',0,0).normal.x<0,'equal hits retain the original first face');
  assert.ok(oceanRockSurface('sample-field-release-query',-.1,0).height>.59);
  assert.ok(oceanRockSurface('sample-field-release-query',.1,0).height>.59);
  assert.equal(oceanRockSurface('sample-field-release-query',.3,-.4).height,-2);
  assert.equal(oceanRockSurface('sample-field-release-query',.009,.008).height,9);
  assert.equal(oceanRockSurface('sample-field-release-query',.49,.49),null);
});
