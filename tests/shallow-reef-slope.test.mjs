import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { oceanRockMesh, oceanRockSurface, oceanRockHeight, SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES } from '../src/oceanRockShape.js';
import { arrangeShallowReefSlope } from '../src/shallowSampleReefSlope.js';

const historic = {
  mound: '21212d7784d5c27cbe4e8f61356473678d558a6547f043b9830d37041fc8fb2c',
  terrace: '9ee13238ccbcd0b6d3f155da7aca23d0750576225631277e22c264fe5a15b7b3',
  ridge: 'c90070b6a5145388432701d53d9c24874462cc9c1162f3f321c29ccde14b7e01',
  'natural-a': '87c9460f53398119bc004df42aa71d3675800564cf6adf2b2db45be9821d8d55',
  'natural-b': 'bd18a942b49c0de35e636462f85767c0ab01e840ec562ed98070d44905e7b471',
  'natural-c': 'ece7b9040c29b150b48c01fe967842b98c9d2b833e9deff4f28c5c6f7e26afd5',
  'sample-reef-a': '0d11a10f8dc45cc9695e3ce23b5c59ccd51bd6ea2c546f6c1752e6c82ec4f597',
  'sample-reef-b': 'f325122c541ad0978740f98b772a136d4c72777f472f037c4c7a33f91c9f7fa6',
  'sample-reef-c': 'be749f2fc5e78b84faa8847f7a9ff7df58e51e7be405ecf43813de0d41b9b209',
};
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);

test('live slope registry leaves all nine old rock meshes byte exact and uses real Float32 top faces', () => {
  for (const [profile, hash] of Object.entries(historic))
    assert.equal(createHash('sha256').update(JSON.stringify(oceanRockMesh(profile))).digest('hex'), hash);
  assert.ok(Object.isFrozen(SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES));
  for (const profile of SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES) {
    const mesh = oceanRockMesh(profile), p = mesh.positions;
    assert.strictEqual(oceanRockMesh(profile), mesh);
    assert.ok(Object.isFrozen(mesh) && Object.isFrozen(p) && Object.isFrozen(mesh.indices));
    assert.equal(p.length / 3, 2305);
    assert.equal(mesh.indices.length / 3, 4544);
    for (let i = 0; i < p.length; i++) assert.equal(p[i], Math.fround(p[i]));
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const [a, b, c] = mesh.indices.slice(k, k + 3).map(v => v * 3);
      const x = .2 * p[a] + .3 * p[b] + .5 * p[c], z = .2 * p[a + 2] + .3 * p[b + 2] + .5 * p[c + 2];
      const support = oceanRockSurface(profile, x, z);
      assert.ok(support, `${profile} triangle ${k / 3} has actual support`);
      near(support.height, .2 * p[a + 1] + .3 * p[b + 1] + .5 * p[c + 1]);
      assert.ok(support.normal.y > 0 && Number.isFinite(support.normal.x) && Number.isFinite(support.normal.z));
    }
    assert.equal(oceanRockSurface(profile, .51, 0), null);
    assert.ok(oceanRockSurface(profile, 0, .15).height - oceanRockSurface(profile, 0, -.16).height > .20,
      'the connected slope must gain real elevation from toe to shoulder');
  }
});

test('complete reef banks replace the broad slope with real sediment gaps and small hard contact pockets', () => {
  const floor=(x,z)=>-.8+.34*Math.sin(x*.065+z*.045)+.22*Math.cos(z*.11-x*.035);
  const path=new THREE.CatmullRomCurve3([[-42,2.4,0],[-27,1.1,-.5],[-13,.35,1],[8,1.1,1],[27,1.3,0],[43,1.9,1],[52,2.8,0]].map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const model={floor,path,rocks:[]},modules=arrangeShallowReefSlope(model);
  assert.equal(modules.length,12);assert.equal(model.reefSlope.structureRevision,7);
  const route=Array.from({length:601},(_,i)=>path.getPointAt(i/600));
  for(const r of modules){
    assert.equal(r.fieldAsset,'habitat-bank');assert.ok(!SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES.includes(r.profile));
    const g=oceanRockMesh(r.profile),co=Math.cos(r.rotation),si=Math.sin(r.rotation);
    const world=(x,z)=>({x:r.x+x*r.scale.x*co+z*r.scale.z*si,z:r.z-x*r.scale.x*si+z*r.scale.z*co});
    let gaps=0,occupied=0;
    for(let x=-.5;x<=.5;x+=.05)for(let z=-.43;z<=.5;z+=.05){const p=world(x,z);if(oceanRockHeight(r,p.x,p.z)===null)gaps++;else occupied++;}
    assert.ok(gaps>0,'natural banks must retain their open irregular outline');
    assert.ok(occupied>100,'the whole bank has disappeared');
    for(let i=0;i<g.positions.length;i+=3)if(g.positions[i+1]<0){
      const p=world(g.positions[i],g.positions[i+2]);assert.ok(r.y+g.positions[i+1]*r.scale.y<floor(p.x,p.z));
      assert.ok(route.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>2.59),'bank footprint enters camera corridor');
    }
    // Search regions are no longer fabricated flat support disks. Exact
    // accepted animal footprints are verified separately against this mesh.
    const heights=[];for(let x=-.4;x<.4;x+=.073)for(let z=-.22;z<.48;z+=.071){const p=world(x,z),y=oceanRockHeight(r,p.x,p.z);if(y!==null)heights.push(y);}
    assert.ok(new Set(heights.map(y=>y.toFixed(4))).size>80,'flat platform replaced the scan');
    assert.ok(Math.max(...heights)-Math.min(...heights)>.6,'natural relief disappeared');
  }
});
