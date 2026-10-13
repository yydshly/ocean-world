import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import manifest from '../src/world/shallowGeometryManifest.js';
import {naturalBankSubstrate} from '../src/world/ShallowNaturalHabitat.js';
import {loadPreparedShallowGeometry} from '../src/world/preparedShallowGeometry.js';

test('compiled existing substrates preserve every source vertex, normal, UV, group and bound, reject damaged transport and return independent geometry',async()=>{
  const expected=new Map();
  for(const detail of ['near','distant'])for(let variant=0;variant<4;variant++)expected.set(`${variant}/${detail}`,naturalBankSubstrate(variant,detail));
  const bytes=readFileSync(new URL(`../public/assets/${manifest.file}`,import.meta.url));
  const compressed=readFileSync(new URL(`../public/assets/${manifest.transport.file}`,import.meta.url));
  assert.deepEqual(gunzipSync(compressed),bytes);
  assert.equal(compressed.length,manifest.transport.bytes);
  assert.ok(compressed.length<bytes.length);
  const response=b=>new Response(b);
  await assert.rejects(loadPreparedShallowGeometry({fetcher:async()=>new Response('',{status:404})}),/unavailable/);
  await assert.rejects(loadPreparedShallowGeometry({fetcher:async()=>response(Buffer.from('invalid gzip'))}));
  const damaged=Buffer.from(bytes);damaged[20]^=1;
  await assert.rejects(loadPreparedShallowGeometry({fetcher:async()=>response(gzipSync(damaged))}),/checksum/);
  const info=await loadPreparedShallowGeometry({base:'/ocean-world/',fetcher:async(url,options)=>{
    assert.equal(url,`/ocean-world/assets/${manifest.transport.file}?v=${manifest.sha256.slice(0,16)}`);
    assert.ok(options.signal instanceof AbortSignal);
    return response(compressed);
  }});assert.equal(info.used,true);assert.equal(info.geometries,8);assert.ok(info.bytes<3e6);assert.equal(info.transportBytes,compressed.length);
  for(const [key,before]of expected){const [variant,detail]=key.split('/'),after=naturalBankSubstrate(+variant,detail);
    assert.deepEqual(after.index.array,before.index.array);
    assert.deepEqual(Object.keys(after.attributes),Object.keys(before.attributes));
    for(const name of Object.keys(before.attributes))assert.deepEqual(after.attributes[name].array,before.attributes[name].array);
    assert.deepEqual(after.groups,before.groups);assert.deepEqual(after.userData,before.userData);assert.deepEqual(after.boundingBox,before.boundingBox);assert.deepEqual(after.boundingSphere,before.boundingSphere);
    after.attributes.position.array[0]+=10;const independent=naturalBankSubstrate(+variant,detail);assert.deepEqual(independent.attributes.position.array,before.attributes.position.array);after.dispose();before.dispose();independent.dispose();
  }
});
