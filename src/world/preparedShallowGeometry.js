import * as THREE from 'three';
import manifest from './shallowGeometryManifest.js';

const geometries=new Map();let loading;
const types={Float32Array,Float64Array,Uint16Array,Uint32Array,Int32Array,Uint8Array};
export function preparedGeometry(key){
  const parts=geometries.get(key);if(!parts)return null;
  return Object.fromEntries(Object.entries(parts).map(([name,g])=>[name,g.clone()]));
}
// No camera, population, placement or mutable history is compiled. This is a
// byte-exact transport for the already selected static source mesh factories.
export async function loadPreparedShallowGeometry({fetcher=fetch,base=import.meta.env?.BASE_URL??'./'}={}){
  if(!manifest)return {used:false};
  if(loading)return loading;
  loading=(async()=>{
    const response=await fetcher(`${base}assets/${manifest.file}?v=${manifest.sha256.slice(0,16)}`,{signal:globalThis.AbortSignal?.timeout?.(3000)});if(!response.ok)throw new Error('Prepared reef buffers unavailable');
    const buffer=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
    if(buffer.byteLength!==manifest.bytes||digest!==manifest.sha256)throw new Error('Prepared reef buffer checksum mismatch');
    const view=row=>new types[row.type](buffer,row.offset,row.length);
    const pending=new Map();
    for(const [key,parts]of Object.entries(manifest.geometries)){
      const result={};for(const [name,row]of Object.entries(parts)){
        const g=new THREE.BufferGeometry();
        for(const [attribute,d]of Object.entries(row.attributes))g.setAttribute(attribute,new THREE.BufferAttribute(view(d).slice(),d.itemSize,d.normalized));
        if(row.index)g.setIndex(new THREE.BufferAttribute(view(row.index).slice(),1));
        g.groups=structuredClone(row.groups);g.userData=structuredClone(row.userData);
        g.boundingBox=new THREE.Box3(new THREE.Vector3().fromArray(row.box[0]),new THREE.Vector3().fromArray(row.box[1]));
        g.boundingSphere=new THREE.Sphere(new THREE.Vector3().fromArray(row.sphere[0]),row.sphere[1]);result[name]=g;
      }pending.set(key,result);
    }
    for(const [key,value]of pending)geometries.set(key,value);
    return {used:true,bytes:buffer.byteLength,geometries:geometries.size};
  })();
  // A failed transport must use the original complete factories. Never seal a
  // partially loaded scene or silently drop geometry to meet a time target.
  try{return await loading;}catch(error){loading=null;throw error;}
}
