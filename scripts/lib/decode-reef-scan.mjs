import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from 'three';
import { normalizeReefSkeletonGroup, REEF_SKELETON_VARIANTS } from '../../src/world/reefScanAssets.js';

// Geometry analysis only. The actual app's GLTFLoader, images and Worker still
// require a real browser. Decode the unchanged bundled official Draco asset.
export async function decodeReefScanForInspection({detail='thumbnail'}={}){
  if(!Object.hasOwn(REEF_SKELETON_VARIANTS,detail))throw new Error('Unknown reef scan derivative.');
  const variant=REEF_SKELETON_VARIANTS[detail];
  const directory=new URL('../../public/assets/reef-scan/',import.meta.url);
  const [source,wasm,wrapper,manifestText]=await Promise.all([
    readFile(new URL(variant.file,directory)),readFile(new URL('draco_decoder.wasm',directory)),
    readFile(new URL('draco_wasm_wrapper.js',directory),'utf8'),readFile(new URL('document.json',directory),'utf8'),
  ]);
  const sourceSha256=createHash('sha256').update(source).digest('hex');
  if(source.length!==variant.bytes||sourceSha256!==variant.sha256)throw new Error('Reef scan original source identity differs from receipt.');
  const jsonSize=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonSize).toString()),binaryStart=20+jsonSize+8;
  const primitive=json.meshes[0].primitives[0],extension=primitive.extensions.KHR_draco_mesh_compression;
  const view=json.bufferViews[extension.bufferView],compressed=source.subarray(binaryStart+(view.byteOffset||0),binaryStart+(view.byteOffset||0)+view.byteLength);
  const context={module:{exports:{}},exports:{},require:createRequire(import.meta.url),process,console,Buffer,
    __dirname:new URL('.',directory).pathname,__filename:'draco_wasm_wrapper.js',WebAssembly,setTimeout,clearTimeout,URL,TextDecoder};
  vm.runInNewContext(wrapper,context,{filename:'official-bundled-draco-wrapper.js'});
  const draco=await context.module.exports({wasmBinary:new Uint8Array(wasm)}),decoder=new draco.Decoder(),buffer=new draco.DecoderBuffer(),mesh=new draco.Mesh();
  let geometry=null;
  try{
    buffer.Init(new Int8Array(compressed),compressed.byteLength);
    const status=decoder.DecodeBufferToMesh(buffer,mesh);
    if(!status.ok())throw new Error(status.error_msg());
    geometry=new THREE.BufferGeometry();
    for(const [semantic,name] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){
      const attribute=decoder.GetAttributeByUniqueId(mesh,extension.attributes[semantic]),array=new draco.DracoFloat32Array();
      try{
        if(!decoder.GetAttributeFloatForAllPoints(mesh,attribute,array))throw new Error('Draco attribute decoding failed');
        const values=new Float32Array(array.size());for(let i=0;i<values.length;i++)values[i]=array.GetValue(i);
        geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.num_components()));
      }finally{draco.destroy(array);}
    }
    const faces=new Uint32Array(mesh.num_faces()*3),face=new draco.DracoInt32Array();
    try{for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let j=0;j<3;j++)faces[i*3+j]=face.GetValue(j);}}finally{draco.destroy(face);}
    geometry.setIndex(new THREE.BufferAttribute(faces,1));
    const material=new THREE.MeshStandardMaterial(),group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));
    const transform=normalizeReefSkeletonGroup(group,JSON.parse(manifestText).models[0]);
    return {group,geometry,transform,sourceJson:json,sourceIdentity:{detail,file:variant.file,bytes:source.length,sha256:sourceSha256},dispose(){geometry.dispose();material.dispose();group.clear();}};
  }catch(error){geometry?.dispose();throw error;}
  finally{draco.destroy(mesh);draco.destroy(buffer);draco.destroy(decoder);}
}
