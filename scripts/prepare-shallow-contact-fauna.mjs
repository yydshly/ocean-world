// Offline-only public asset evaluation. It does not install candidates in the app.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const evidence='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd';
const folder='output/validation/shallow-contact-fauna/candidates',key=process.argv[2],target=Number(process.argv[3]??6000);
if(!/^[a-z0-9_-]+$/.test(key)||!Number.isFinite(target))throw Error('Invalid asset evaluation arguments');
const {MeshoptSimplifier:S}=await import(pathToFileURL(`${evidence}/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js`));await S.ready;
const external=key==='coast_land_rocks_02';
const raw=fs.readFileSync(`${folder}/${key}/${external?key+'.gltf':'source.glb'}`),len=external?0:raw.readUInt32LE(12),doc=JSON.parse(external?raw:raw.subarray(20,20+len)),bin=external?fs.readFileSync(`${folder}/${key}/${doc.buffers[0].uri}`):raw.subarray(28+len);
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
if(key==='bigeye-trevally'){
  grouped.delete(0); // The source's detached colour calibration card is not an animal.
  const rows=[...grouped.values()].flat(),parents=[],keys=new Map(),offsets=[];let total=0;
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(const g of rows){offsets.push(total);const p=g.attributes.position;for(let i=0;i<p.count;i++){
    const id=total+i;parents[id]=id;const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
    if(keys.has(key))parents[find(id)]=find(keys.get(key));else keys.set(key,id);
  }total+=p.count;}
  for(const [r,g]of rows.entries()){const o=offsets[r],ix=g.index;for(let i=0;i<ix.count;i+=3){const a=find(o+ix.getX(i)),b=find(o+ix.getX(i+1)),c=find(o+ix.getX(i+2));parents[a]=b;parents[c]=b;}}
  const counts=new Map();for(const [r,g]of rows.entries())for(let i=0;i<g.index.count;i+=3){const k=find(offsets[r]+g.index.getX(i));counts.set(k,(counts.get(k)??0)+1);}
  const ordered=[...counts].sort((a,b)=>b[1]-a[1]),body=ordered[0][0];console.log('Source components',ordered.slice(0,8));
  for(const [r,g]of rows.entries()){const ix=[];for(let i=0;i<g.index.count;i+=3)if(find(offsets[r]+g.index.getX(i))===body)ix.push(g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2));g.setIndex(ix);}
}
const output=`${folder}/${key}`;fs.mkdirSync(output,{recursive:true});
const box=new THREE.Box3(),rows=[];let total=0;
for(const gs of grouped.values())for(const g of gs){g.computeBoundingBox();box.union(g.boundingBox);total+=g.index.count/3;}
const center=box.getCenter(new THREE.Vector3()),extent=Math.max(...box.getSize(new THREE.Vector3()).toArray());
// One fixed whole-cluster selection removes the surrounding photographed
// ledge. Select before simplification so its tubes keep their share of detail.
if(key==='sponge-stove'){
  total=0;
  for(const gs of grouped.values())for(const g of gs){const p=g.attributes.position,ix=[];
    const inside=i=>(p.getX(i)-center.x)/extent<-.22&&(p.getY(i)-center.y)/extent>.12&&(p.getZ(i)-center.z)/extent>-.17&&(p.getZ(i)-center.z)/extent<0;
    for(let j=0;j<g.index.count;j+=3){const a=g.index.getX(j),b=g.index.getX(j+1),c=g.index.getX(j+2);if(inside(a)&&inside(b)&&inside(c))ix.push(a,b,c);}
    g.setIndex(ix);total+=ix.length/3;
  }
}
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
  if(tex!==undefined){const im=doc.images[doc.textures[tex].source],bv=doc.bufferViews[im.bufferView];image=`${output}/original-${material}.${im.mimeType==='image/jpeg'?'jpg':'png'}`;fs.writeFileSync(image,external?fs.readFileSync(`${output}/${im.uri}`):bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));}
  let normalImage=null; const normalTex=mat.normalTexture?.index; if(normalTex!==undefined){const im=doc.images[doc.textures[normalTex].source],bv=doc.bufferViews[im.bufferView];normalImage=`${output}/normal-${material}.${im.mimeType==='image/jpeg'?'jpg':'png'}`;fs.writeFileSync(normalImage,bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));}
  const sampler=tex===undefined?{}:doc.samplers?.[doc.textures[tex].sampler]??{};
  rows.push({material,name:mat.name,attributes:attrs,index:Array.from(idx),image,normalImage,factor:pbr.baseColorFactor??[1,1,1,1],wrapS:(sampler.wrapS??10497)===10497?'repeat':'clamp',wrapT:(sampler.wrapT??10497)===10497?'repeat':'clamp',error});g.dispose();
}
const result={key,originalTriangles:total,sourceBounds:[box.min.toArray(),box.max.toArray()],normalization:{center:center.toArray(),extent},parts:rows};
fs.writeFileSync(`${output}/model.json`,JSON.stringify(result));console.log(JSON.stringify({key,originalTriangles:total,triangles:rows.reduce((n,r)=>n+r.index.length/3,0),sourceBounds:result.sourceBounds,parts:rows.map(r=>({material:r.material,name:r.name,triangles:r.index.length/3,error:r.error,image:r.image}))}));

