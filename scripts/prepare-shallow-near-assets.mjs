// Offline-only public asset evaluation. It does not install candidates in the app.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const evidence='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd';
const folder='output/validation/shallow-near-community/candidates',key=process.argv[2],target=Number(process.argv[3]??6000);
if(!/^[a-z-]+$/.test(key)||!Number.isFinite(target))throw Error('Invalid asset evaluation arguments');
const {MeshoptSimplifier:S}=await import(pathToFileURL(`${evidence}/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js`));await S.ready;
const raw=fs.readFileSync(`${folder}/${key==='reefscan'?'reefscan-complete':key}.glb`),len=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+len)),bin=raw.subarray(28+len);
if(raw.readUInt32LE(8)!==raw.length)throw Error('Incomplete GLB');
const types={5126:[Float32Array,4],5125:[Uint32Array,4],5123:[Uint16Array,2],5121:[Uint8Array,1]};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(id){
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],[T,bytes]=types[a.componentType],size=widths[a.type],out=new T(a.count*size);
  const start=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*bytes;
  for(let i=0;i<a.count;i++)out.set(new T(Uint8Array.from(bin.subarray(start+i*stride,start+i*stride+size*bytes)).buffer),i*size);
  return new THREE.BufferAttribute(out,size,a.normalized??false);
}
const grouped=new Map();
function visit(i,parent){
  const n=doc.nodes[i],m=new THREE.Matrix4();
  if(n.matrix)m.fromArray(n.matrix);else m.compose(new THREE.Vector3().fromArray(n.translation??[0,0,0]),new THREE.Quaternion().fromArray(n.rotation??[0,0,0,1]),new THREE.Vector3().fromArray(n.scale??[1,1,1]));
  m.premultiply(parent);
  if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){
    if(p.extensions?.KHR_draco_mesh_compression)throw Error('Decoder required');
    const g=new THREE.BufferGeometry();
    for(const [a,b]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']])if(p.attributes[a]!==undefined)g.setAttribute(b,accessor(p.attributes[a]));
    if(p.indices!==undefined)g.setIndex(new THREE.BufferAttribute(Uint32Array.from(accessor(p.indices).array),1));
    g.applyMatrix4(m);if(!g.attributes.normal)g.computeVertexNormals();
    const mat=p.material??0;if(!grouped.has(mat))grouped.set(mat,[]);grouped.get(mat).push(g);
  }
  for(const c of n.children??[])visit(c,m);
}
for(const i of doc.scenes[doc.scene??0].nodes)visit(i,new THREE.Matrix4());
const output=`${folder}/${key}`;fs.mkdirSync(output,{recursive:true});
const box=new THREE.Box3(),rows=[];let total=0;
for(const gs of grouped.values())for(const g of gs){g.computeBoundingBox();box.union(g.boundingBox);total+=g.index.count/3;}
const center=box.getCenter(new THREE.Vector3()),extent=Math.max(...box.getSize(new THREE.Vector3()).toArray());
for(const [material,gs]of grouped){
  let g=mergeGeometries(gs);gs.forEach(g=>g.dispose());const weld=mergeVertices(g,1e-6);g.dispose();g=weld;
  const budget=Math.min(g.index.count/3,Math.max(24,Math.round(target*g.index.count/(total*3)))),indices=Uint32Array.from(g.index.array);
  const [idx,error]=g.attributes.uv?S.simplifyWithAttributes(indices,g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,budget*3,1,['Permissive']):S.simplify(indices,g.attributes.position.array,3,budget*3,.025,['Permissive']);
  const [remap,count]=S.compactMesh(idx),attrs={};
  for(const [name,a]of Object.entries(g.attributes)){
    const out=new Float32Array(count*a.itemSize);for(let old=0;old<remap.length;old++)if(remap[old]<count)out.set(a.array.subarray(old*a.itemSize,(old+1)*a.itemSize),remap[old]*a.itemSize);
    attrs[name]=Array.from(out);
  }
  for(let i=0;i<attrs.position.length;i+=3){attrs.position[i]=(attrs.position[i]-center.x)/extent;attrs.position[i+1]=(attrs.position[i+1]-center.y)/extent;attrs.position[i+2]=(attrs.position[i+2]-center.z)/extent;}
  const mat=doc.materials[material],pbr=mat.pbrMetallicRoughness??{},tex=pbr.baseColorTexture?.index;let image=null;
  if(tex!==undefined){const im=doc.images[doc.textures[tex].source],bv=doc.bufferViews[im.bufferView];image=`${output}/original-${material}.${im.mimeType==='image/jpeg'?'jpg':'png'}`;fs.writeFileSync(image,bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));}
  const sampler=tex===undefined?{}:doc.samplers?.[doc.textures[tex].sampler]??{};
  rows.push({material,name:mat.name,attributes:attrs,index:Array.from(idx),image,factor:pbr.baseColorFactor??[1,1,1,1],wrapS:(sampler.wrapS??10497)===10497?'repeat':'clamp',wrapT:(sampler.wrapT??10497)===10497?'repeat':'clamp',error});g.dispose();
}
const result={key,originalTriangles:total,sourceBounds:[box.min.toArray(),box.max.toArray()],normalization:{center:center.toArray(),extent},parts:rows};
fs.writeFileSync(`${output}/model.json`,JSON.stringify(result));console.log(JSON.stringify({key,originalTriangles:total,triangles:rows.reduce((n,r)=>n+r.index.length/3,0),sourceBounds:result.sourceBounds,parts:rows.map(r=>({material:r.material,name:r.name,triangles:r.index.length/3,error:r.error,image:r.image}))}));
