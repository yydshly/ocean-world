// Rejected visual candidate: evidence-only output, never the default scene.
// One finite derivative pass. Original base-colour pixels become vertex
// attributes; source photographs remain untouched and no PBR scan is claimed.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';import * as THREE from 'three';
const root='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd',folder=`${root}/shallow-source-community`;
const {MeshoptSimplifier:S}=await import(pathToFileURL(`${root}/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js`));await S.ready;
const rows=[['field-table','acropora_cytherea_2_komang','Acropora cytherea'],['field-branching','montipora_digitata_komang','Montipora digitata'],['field-massive','leptoria_phrygia_komang','Leptoria phrygia']];
const packed={},records=[];fs.mkdirSync('output/validation/shallow-source-community/rejected-candidate-assets',{recursive:true});
const bound=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){min[i%3]=Math.min(min[i%3],p[i]);max[i%3]=Math.max(max[i%3],p[i]);}return {min,max,size:max.map((v,k)=>v-min[k])};};
for(const [key,name,label] of rows){
  const raw=fs.readFileSync(`${folder}/media-${name}.glb`),l=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+l)),bin=raw.subarray(28+l),p=json.meshes[0].primitives[0];
  if(json.nodes.length!==1||json.nodes[0].mesh!==0)throw Error('Unexpected source transform');
  const read=id=>{const a=json.accessors[id],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    const result=a.componentType===5126?new Float32Array(a.count*n):new Uint32Array(a.count*n);for(let i=0;i<a.count;i++)for(let c=0;c<n;c++)result[i*n+c]=bin[method]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*bytes)+c*bytes);return result;};
  let positions=read(p.attributes.POSITION),indices=read(p.indices);const uv=read(p.attributes.TEXCOORD_0),bounds=bound(positions);
  const texture=json.textures[json.materials[p.material].pbrMetallicRoughness.baseColorTexture.index],image=json.images[texture.source],bv=json.bufferViews[image.bufferView];
  const imageFile=`${folder}/${key}-source.${image.mimeType==='image/png'?'png':'jpg'}`;fs.writeFileSync(imageFile,bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));fs.writeFileSync(`${folder}/${key}-uv.f32`,Buffer.from(uv.buffer));
  const python=`import numpy as np\nfrom PIL import Image\nu=np.fromfile(r'${folder}/${key}-uv.f32',dtype='<f4').reshape(-1,2)\na=np.asarray(Image.open(r'${imageFile}').convert('RGB'))\nc=a[np.clip((u[:,1]*a.shape[0]).astype(int),0,a.shape[0]-1),np.clip((u[:,0]*a.shape[1]).astype(int),0,a.shape[1]-1)]/255.0\nc=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)\nc.astype('<f4').tofile(r'${folder}/${key}-colours.f32')`;
  const sampled=spawnSync('D:/software/python310/python.exe',['-c',python],{encoding:'utf8'});if(sampled.status)throw Error(sampled.stderr);
  const rgbBuffer=fs.readFileSync(`${folder}/${key}-colours.f32`),colors=new Float32Array(rgbBuffer.buffer.slice(rgbBuffer.byteOffset,rgbBuffer.byteOffset+rgbBuffer.byteLength));
  // Remove the low survey skirt in one documented plane cut. This is not
  // tissue segmentation, hole filling or a fabricated biological root.
  const cutoff=bounds.min[1]+bounds.size[1]*.10,kept=[];for(let i=0;i<indices.length;i+=3){const face=indices.subarray(i,i+3);if([...face].every(v=>positions[v*3+1]>=cutoff))kept.push(...face);}
  indices=Uint32Array.from(kept);const width=Math.max(bounds.size[0],bounds.size[2]),cx=(bounds.min[0]+bounds.max[0])/2,cz=(bounds.min[2]+bounds.max[2])/2;
  let low=Infinity;for(const i of indices)low=Math.min(low,positions[i*3+1]);
  positions=Float32Array.from(positions,(v,i)=>(v-[cx,low,cz][i%3])/width);
  for(const [detail,target]of [['near',3900],['distant',950]]){
    const [index,error]=S.simplifyWithAttributes(indices,positions,3,colors,3,[.5,.5,.5],null,target*3,1,['Permissive']);
    const [remap,count]=S.compactMesh(index),pos=new Float32Array(count*3),col=new Float32Array(count*3);
    for(let old=0;old<remap.length;old++)if(remap[old]<count){pos.set(positions.subarray(old*3,old*3+3),remap[old]*3);col.set(colors.subarray(old*3,old*3+3),remap[old]*3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(new THREE.BufferAttribute(Uint16Array.from(index),1));g.computeVertexNormals();
    const bytes=Buffer.concat([Buffer.from(pos.buffer),Buffer.from(g.attributes.normal.array.buffer),Buffer.from(col.buffer),Buffer.from(Uint16Array.from(index).buffer)]),b=bound(pos);
    let radius=0,rootRadius=0;for(let i=0;i<count;i++){const r=Math.hypot(pos[i*3],pos[i*3+2]);radius=Math.max(radius,r);if(pos[i*3+1]<=.025)rootRadius=Math.max(rootRadius,r);}
    if(index.length/3>4000)throw Error('Original crown triangle budget exceeded');
    packed[`${key}-${detail}`]={key,detail,count,triangles:index.length/3,data:bytes.toString('base64'),radius,rootRadius,height:b.max[1]};
    records.push({key,label,detail,vertices:count,triangles:index.length/3,error,bounds:b,radius,rootRadius,source:name,sourceSHA256:createHash('sha256').update(raw).digest('hex'),sourceTriangles:json.accessors[p.indices].count/3,retainedAfterCut:kept.length/3,cutFractionOfHeight:.10});g.dispose();
  }
}
fs.writeFileSync('output/validation/shallow-source-community/rejected-candidate-src/world/shallowFieldCoralData.js',`// Source: Dina3D / Komang, MIT repository license. See asset provenance.\nexport default ${JSON.stringify(packed)};\n`);
fs.copyFileSync('public/assets/shallow-scanned-reef/SOURCE-MIT-LICENSE.txt','output/validation/shallow-source-community/rejected-candidate-assets/SOURCE-MIT-LICENSE.txt');
fs.writeFileSync('output/validation/shallow-source-community/rejected-candidate-assets/provenance.json',JSON.stringify({version:1,author:'Komang Ngurah Semita Dana',source:'https://scan3d.dinacon.org/',repository:'https://github.com/Reobos/Dina3D',license:'MIT repository scope; original copyright retained in SOURCE-MIT-LICENSE.txt',records,limits:['Source labels retained, not independent taxonomic verification.','Ten-percent-height plane cut removes low survey skirt; not tissue segmentation or a watertight mesh.','Uniform original source proportions; no survey scale supplied, world widths authored.','Actual original albedo sampled into linear vertex colour before colour-aware simplification. No image recolouring or invented photographic texture.','No source normal/roughness maps or photographic PBR equivalence; near/far vertex-fit and whole-scene review required.']},null,2));
console.log(JSON.stringify(records,null,2));
