import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { oceanRockSurface, oceanRockHeight } from '../src/oceanRockShape.js';
import { createOceanSupportIndex, oceanSupportCandidates } from '../src/oceanSupportIndex.js';
import { oceanBiodiversityPatchHeight } from '../src/oceanBiodiversityShape.js';

// Execute the actual private geometry kernel. Compare to the former full scan
// and allocation-heavy arithmetic, not a second copy of the new algorithm.
const source = readFileSync(new URL('../src/oceanReefResidents.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const close = (a, b, t = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= t;
const kernel = new Function('point', 'close', 'oceanRockSurface', 'oceanBiodiversityPatchHeight', 'createOceanSupportIndex', 'oceanSupportCandidates',
  `${section('function queries(', 'function bodyOffsets(')}\n${section('function rockGround(', 'function reefHost(')}\nreturn {queries,frame,transform,rockGround,groundAt};`)
  (point, close, oceanRockSurface, oceanBiodiversityPatchHeight, createOceanSupportIndex, oceanSupportCandidates);
const oldFrame = (normal, heading, pitch, grounded) => {
  let up = { x: 0, y: 1, z: 0 };
  if (grounded) {
    if (!point(normal)) return null; const length = Math.hypot(normal.x, normal.y, normal.z); if (!(length > 0)) return null;
    up = Object.fromEntries(['x','y','z'].map(k => [k, normal[k]/length]));
  }
  const dot = up.x*Math.cos(heading)+up.z*Math.sin(heading);
  let forward = {x:Math.cos(heading)-up.x*dot,y:-up.y*dot,z:Math.sin(heading)-up.z*dot};
  const length = Math.hypot(forward.x,forward.y,forward.z); if (!(length > 1e-8)) return null;
  forward = Object.fromEntries(['x','y','z'].map(k => [k,forward[k]/length]));
  const side = {x:forward.y*up.z-forward.z*up.y,y:forward.z*up.x-forward.x*up.z,z:forward.x*up.y-forward.y*up.x};
  return {forward:Object.fromEntries(['x','y','z'].map(k => [k,forward[k]*Math.cos(pitch)+up[k]*Math.sin(pitch)])),
    up:Object.fromEntries(['x','y','z'].map(k => [k,up[k]*Math.cos(pitch)-forward[k]*Math.sin(pitch)])),side};
};
const oldGround = (g,q,x,z) => {
  const height=q.surface(x,z),floor=q.bed(x,z); if (![height,floor].every(Number.isFinite)) return null;
  if(height-floor<=.025)return{height,normal:g.floorSurface(x,z).normal};
  for(const e of q.nearby.filter(e=>['rock','formation'].includes(e.kind))) {
    const support=kernel.rockGround(e,x,z);if(support&&close(support.height,height,1e-7))return support;
  }
  return null;
};
const frozen = e => Object.freeze({...e,scale:Object.freeze({...e.scale})});

test('native frame and body transform preserve every exact component across slopes, heading, pitch and invalid normals', () => {
  for(let i=0;i<700;i++) {
    const n={x:Math.sin(i)*.35,y:.7+(i%13)/31,z:Math.cos(i*2)*.25},h=i*.123,p=(i%9-4)*.07;
    for(const grounded of [false,true]) {
      const pose=kernel.frame(n,h,p,grounded);assert.deepEqual(pose,oldFrame(n,h,p,grounded));
      const v={x:Math.sin(i)*.8,y:(i%11-5)*.13,z:Math.cos(i*.3)},size=.04+(i%31)*.09;
      const expected=Object.fromEntries(['x','y','z'].map(k=>[k,size*(pose.forward[k]*v.x+pose.up[k]*v.y+pose.side[k]*v.z)]));
      assert.deepEqual(kernel.transform(v,size,pose),expected);
    }
  }
  for(const n of [null,{x:0,y:0,z:0},{x:NaN,y:1,z:0}]) assert.equal(kernel.frame(n,0,0,true),oldFrame(n,0,0,true));
});

test('the actual indexed ground kernel matches full scans on native profiles, rotated edges, overlaps and owner boundaries', () => {
  const rows=[];for(let i=0;i<70;i++)rows.push(frozen({id:`r${i}`,kind:i%6===0?'formation':'rock',profile:['mound','terrace','ridge','natural-a','natural-b','natural-c'][i%6],
    x:-64+(i%10)*7,z:-64+Math.floor(i/10)*9,y:-2,rotation:i*.31,scale:{x:2+(i%7),y:1+(i%3),z:3+(i%5)}}));
  const g={chunk:()=>({elements:rows}),floorSurface:()=>({height:-3,normal:{x:0,y:1,z:0}})};
  const q=kernel.queries({cx:-1,cz:-1},g,{bed:()=>-3,surface:(x,z)=>rows.reduce((h,e)=>Math.max(h,oceanRockHeight(e,x,z)??-Infinity),-3)});
  assert.equal(q.groundIndex.bins.length,256);assert.equal(q.groundMemo,null);
  for(let z=-67;z<=2;z+=.73)for(let x=-67;x<=2;x+=.91)assert.deepEqual(kernel.groundAt(g,q,x,z),oldGround(g,q,x,z));
  assert.ok(oceanSupportCandidates(q.groundIndex,-60,-60).length<rows.length/4);
});

test('mutable supports and new query snapshots keep changes observable instead of inheriting a stale cached result', () => {
  const rock={id:'moving',kind:'rock',profile:'terrace',x:300,y:0,z:300,rotation:0,scale:{x:12,y:1,z:12}};
  let normal={x:0,y:1,z:0}; const g={chunk:()=>({elements:[rock]}),floorSurface:()=>({height:0,normal})};
  const surface=(x,z)=>Math.max(0,oceanRockHeight(rock,x,z)??-Infinity),q=kernel.queries({cx:0,cz:0},g,{surface,bed:()=>0});
  assert.equal(q.groundMemo,null);rock.x=32;rock.z=32;
  // The former surface/bed memo remains scoped to a query; use previously
  // unqueried coordinates after the descriptor change.
  assert.deepEqual(kernel.groundAt(g,q,32,32),oldGround(g,q,32,32));
  assert.ok(oceanSupportCandidates(q.groundIndex,32,32).some(f=>f.element===rock));
  const base=Object.freeze({}),native=Object.freeze({baseGenerator:base,chunk:g.chunk,floorSurface:g.floorSurface});
  const mutableNative=kernel.queries({cx:0,cz:0},native,{surface,bed:()=>0});assert.equal(mutableNative.groundMemo,null);
  const stable=Object.freeze({...native,chunk:()=>({elements:[]})});
  const a=kernel.queries({cx:0,cz:0},stable,{surface:()=>0,bed:()=>0});
  assert.deepEqual(kernel.groundAt(native,a,1,1).normal,normal);normal={x:.1,y:.99,z:.02};
  const b=kernel.queries({cx:0,cz:0},stable,{surface:()=>0,bed:()=>0});
  assert.deepEqual(kernel.groundAt(native,b,1,1).normal,normal);assert.notEqual(a.groundMemo,b.groundMemo);
});

test('native normal memo is finite, local and caches both support and rejection without changing physical thresholds', () => {
  let normals=0;const g=Object.freeze({baseGenerator:Object.freeze({}),chunk:()=>({elements:[]}),
    floorSurface:()=>{normals++;return{height:0,normal:{x:0,y:1,z:0}};}});
  const q=kernel.queries({cx:0,cz:0},g,{surface:()=>0,bed:()=>0});
  for(let i=0;i<20;i++)assert.deepEqual(kernel.groundAt(g,q,1,1),{height:0,normal:{x:0,y:1,z:0}});
  assert.equal(normals,1);for(let i=0;i<18000;i++)kernel.groundAt(g,q,i+.3,1);
  assert.equal(q.groundMemo.size,16384);
  const absent=kernel.queries({cx:0,cz:0},g,{surface:()=>1,bed:()=>0});
  assert.equal(kernel.groundAt(g,absent,2,2),null);assert.equal(absent.groundMemo.get('2,2'),null);
});
