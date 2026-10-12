import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import data from './shallowNaturalHabitatData.js';
import {registerFieldReefMesh,oceanRockHeight} from '../oceanRockShape.js';

export const naturalHabitatData=data;
const decodedSources=new WeakMap();
export function naturalHabitatGeometry(row){
  if(!decodedSources.has(row)){
    const raw=Uint8Array.fromBase64?Uint8Array.fromBase64(row.data):Uint8Array.from(atob(row.data),c=>c.charCodeAt(0));
    decodedSources.set(row,raw);
  }
  // Rigid assembly transforms receive their own array; the source is decoded once.
  const bytes=decodedSources.get(row).slice(),g=new THREE.BufferGeometry();
  for(const [name,v]of Object.entries(row.views)){
    const T=name==='index'?(row.indexType==='uint32'?Uint32Array:Uint16Array):Float32Array;
    const a=new THREE.BufferAttribute(new T(bytes.buffer,v.offset,v.count*v.size),v.size);
    if(name==='index')g.setIndex(a);else g.setAttribute(name,a);
  }g.computeBoundingBox();g.computeBoundingSphere();return g;
}
// Whole source-boundary reconstruction. The photographed ground cut is
// lowered into sediment, with a smooth 0.75 m collar at the 10 m bank scale.
// Both LODs use the same near-source boundary segments; inner rocks and all UVs
// remain intact. Collision is registered from this exact deformed mesh.
let cutSegments;
export function naturalGroundCutSegments(){
  if(cutSegments)return cutSegments;
  const g=naturalHabitatGeometry(data.coast_land_rocks_02.variants.near[0]),p=g.attributes.position;
  const points=[],lookup=new Map(),ids=[],edges=new Map();
  for(let i=0;i<p.count;i++){
    const point=[p.getX(i),p.getY(i),p.getZ(i)],key=point.map(v=>Math.round(v*1e6)).join(',');
    if(!lookup.has(key)){lookup.set(key,points.length);points.push(point);}ids.push(lookup.get(key));
  }
  const ix=g.index.array;
  for(let i=0;i<ix.length;i+=3)for(const [a,b]of [[ix[i],ix[i+1]],[ix[i+1],ix[i+2]],[ix[i+2],ix[i]]]){
    const u=ids[a],v=ids[b],key=u<v?`${u},${v}`:`${v},${u}`;edges.set(key,(edges.get(key)??0)+1);
  }
  cutSegments=[...edges].filter(([,n])=>n===1).map(([key])=>key.split(',').map(i=>points[+i]));g.dispose();return cutSegments;
}
export function buryNaturalGroundCut(g){
  const p=g.attributes.position,segments=naturalGroundCutSegments(),collar=.075;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);let nearest=Infinity;
    for(const [a,b]of segments){
      const dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz;
      const t=length?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/length,0,1):0;
      nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz));
    }
    if(nearest<collar){const keep=THREE.MathUtils.smoothstep(nearest,0,collar);p.setY(i,THREE.MathUtils.lerp(-.012,p.getY(i),keep));}
  }
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
const cache=new Map(),registered=new Set(),preparedGround=new Map();
export function naturalBankSubstrate(variant,detail='near'){
  const key=`${variant}/${detail}`;if(!cache.has(key)){
    const row=data.coast_land_rocks_02.variants[detail][0],parts=[];
    if(!preparedGround.has(detail))preparedGround.set(detail,buryNaturalGroundCut(naturalHabitatGeometry(row)));
    // Two complete eroded formations form a low bank with natural crevices.
    // Original proportions, UVs, and irregular edges replace every flat disk.
    for(const [i,z]of [-.065,.31].entries()){
      const g=preparedGround.get(detail).clone();g.rotateY(((variant+i)%2)*Math.PI);g.translate(i?.025:0,0,z);parts.push(g);
    }
    const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();cache.set(key,g);
  }return cache.get(key).clone();
}
export function naturalBankHeight(variant,x,z){
  const profile=`sample-field-natural-substrate-${variant}-v2`;
  if(!registered.has(profile)){const g=naturalBankSubstrate(variant);registerFieldReefMesh(profile,g.attributes.position.array,g.index.array);g.dispose();registered.add(profile);}
  return oceanRockHeight({profile,x:0,y:0,z:0,rotation:0,scale:{x:1,y:1,z:1}},x,z);
}
