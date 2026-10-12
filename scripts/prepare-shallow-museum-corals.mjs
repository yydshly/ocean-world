// CC0 specimen meshes, adapted as display growth forms. These are dry skeleton
// scans with authored tissue colours, never photographs of living tissue.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
const evidence='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd';
const folder=`${evidence}/shallow-free-kit`;
const {MeshoptSimplifier:S}=await import(pathToFileURL(`${evidence}/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js`));await S.ready;
const context={module:{exports:{}},exports:{},require:createRequire(import.meta.url),process,console,Buffer,__dirname:process.cwd(),__filename:'draco_wasm_wrapper.js',WebAssembly,setTimeout,clearTimeout,URL,TextDecoder};
vm.runInNewContext(fs.readFileSync('public/assets/reef-scan/draco_wasm_wrapper.js','utf8'),context);
const draco=await context.module.exports({wasmBinary:new Uint8Array(fs.readFileSync('public/assets/reef-scan/draco_decoder.wasm'))});
const rows=[
  ['branching','pocillopora','ae26ad01-e7be-4664-8a3a-b8bffd42a186','Pocillopora damicornis','USNM 46926',['#746d48','#c9b89a']],
  ['branching2','nobilis','25e7d19b-bb0a-4f60-a7d2-894e234a4faa','Pocillopora nobilis / Pocillopora meandrina','source syntype',['#756553','#c5ad94']],
];
const packed={},records=[];
for(const [form,key,uid,name,catalog,palette] of rows){
  const raw=fs.readFileSync(`${folder}/${key}.glb`),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length)),bin=raw.subarray(28+length);
  const manifest=JSON.parse(fs.readFileSync(`${folder}/${key}-document.json`,'utf8')),model=manifest.models[0];
  const primitive=json.meshes[0].primitives[0],ext=primitive.extensions.KHR_draco_mesh_compression,bv=json.bufferViews[ext.bufferView];
  const decoder=new draco.Decoder(),buffer=new draco.DecoderBuffer(),mesh=new draco.Mesh();let positions,indices;
  try{
    const compressed=bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength);buffer.Init(new Int8Array(compressed),compressed.length);
    const status=decoder.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw Error(status.error_msg());
    const a=decoder.GetAttributeByUniqueId(mesh,ext.attributes.POSITION),values=new draco.DracoFloat32Array();
    try{decoder.GetAttributeFloatForAllPoints(mesh,a,values);positions=Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));}finally{draco.destroy(values);}
    indices=new Uint32Array(mesh.num_faces()*3);const face=new draco.DracoInt32Array();
    try{for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let k=0;k<3;k++)indices[i*3+k]=face.GetValue(k);}}finally{draco.destroy(face);}
  }finally{draco.destroy(mesh);draco.destroy(buffer);draco.destroy(decoder);}
  let source=new THREE.BufferGeometry();source.setAttribute('position',new THREE.BufferAttribute(positions,3));source.setIndex(new THREE.BufferAttribute(indices,1));
  if(json.nodes.length!==1||json.nodes[0].mesh!==0)throw Error('Unexpected source node hierarchy');
  const welded=mergeVertices(source,1e-6);source.dispose();source=welded;positions=source.attributes.position.array;indices=Uint32Array.from(source.index.array);
  const node=json.nodes[0];
  source.applyMatrix4(node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation??[0,0,0]),new THREE.Quaternion().fromArray(node.rotation??[0,0,0,1]),new THREE.Vector3().fromArray(node.scale??[1,1,1])));
  const q=new THREE.Quaternion().fromArray(model.rotation??[0,0,0,1]).normalize(),unit=model.units==='mm'?.001:1;
  if(!['mm','m'].includes(model.units))throw Error('Unknown source units');
  source.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(model.translation??[0,0,0]).multiplyScalar(unit),q,new THREE.Vector3(unit,unit,unit)));
  source.computeBoundingBox();const box=source.boundingBox.clone(),center=box.getCenter(new THREE.Vector3()),p=source.attributes.position;
  let radius=0;for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i)-center.x,p.getZ(i)-center.z));
  const sourceHeight=box.max.y-box.min.y,aspect=sourceHeight/(radius/.489);
  // The scene applies width and width*aspect: the source shape then undergoes
  // a uniform scale. Neither source vertices nor a survey skirt are cut away.
  for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-center.x)*.489/radius,(p.getY(i)-box.min.y)/sourceHeight,(p.getZ(i)-center.z)*.489/radius);
  const low=new THREE.Color(palette[0]),high=new THREE.Color(palette[1]),c=new THREE.Color();
  for(const [detail,target] of [['near',3900],['distant',950]]){
    const [idx,error]=S.simplify(indices,p.array,3,target*3,1,['Permissive']);const [remap,count]=S.compactMesh(idx),pos=new Float32Array(count*3);
    for(let old=0;old<remap.length;old++)if(remap[old]<count)pos.set(p.array.subarray(old*3,old*3+3),remap[old]*3);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(new THREE.BufferAttribute(Uint16Array.from(idx),1));g.computeVertexNormals();
    const colors=new Float32Array(count*3);let rootRadius=0;
    for(let i=0;i<count;i++){
      const [x,y,z]=pos.subarray(i*3,i*3+3),n=g.attributes.normal;
      const light=THREE.MathUtils.clamp(.15+.34*y+.18*Math.max(0,n.getY(i))+.04*Math.sin(x*53+z*37),0,1);
      c.copy(low).lerp(high,light);colors.set(c.toArray(),i*3);if(y<=.025)rootRadius=Math.max(rootRadius,Math.hypot(x,z));
    }
    const bytes=Buffer.concat([Buffer.from(pos.buffer),Buffer.from(g.attributes.normal.array.buffer),Buffer.from(colors.buffer),Buffer.from(Uint16Array.from(idx).buffer)]);
    packed[`${form}-${detail}`]={form,key,count,triangles:idx.length/3,aspect,rootRadius,data:bytes.toString('base64')};
    records.push({form,key,name,catalog,detail,vertices:count,triangles:idx.length/3,error,aspect,sourceBoundsM:[box.min.toArray(),box.max.toArray()],sourceSHA256:createHash('sha256').update(raw).digest('hex'),documentSHA256:createHash('sha256').update(fs.readFileSync(`${folder}/${key}-document.json`)).digest('hex'),source:`https://3d-api.si.edu/content/document/3d_package:${uid}/document.json`,license:'CC0-1.0'});g.dispose();
  }source.dispose();
}
fs.mkdirSync('public/assets/shallow-museum-corals',{recursive:true});
fs.writeFileSync('src/world/shallowMuseumCoralData.js',`// Smithsonian CC0 dry specimens; authored tissue colours. See public provenance.\nexport default ${JSON.stringify(packed)};\n`);
fs.writeFileSync('public/assets/shallow-museum-corals/provenance.json',JSON.stringify({version:1,author:'Smithsonian Institution / National Museum of Natural History',license:'CC0-1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',sourceCollection:'https://3d.si.edu/corals',changes:'Official source transform; no cuts, holes filled or invented branches; simplify to two LODs; authored restrained tissue colours; scene dimensions uniformly scale each source shape.',limits:['Dry specimen geometry adapted for living-colony display, not living-tissue photogrammetry.','Source record names and locations are provenance, not a calibrated local ecological census.','World widths are authored; original physical specimen dimensions retained in records.'],records},null,2));
console.log(JSON.stringify(records.map(({data,...r})=>r),null,2));
