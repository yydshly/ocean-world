// Adapt the openly redistributed DigitalLife model without a browser or GPU.
// Asset remains CC BY-NC 4.0; the repository's source-code license does not apply.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const folder='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-source-community';
const output='public/assets/shallow-source-turtle';fs.mkdirSync(output,{recursive:true});
const raw=fs.readFileSync(`${folder}/hawksbill.glb`),len=raw.readUInt32LE(12),source=JSON.parse(raw.subarray(20,20+len)),bin=raw.subarray(28+len);
globalThis.ProgressEvent??=class extends Event{constructor(t,v){super(t);Object.assign(this,v);}};
const native=structuredClone(source);delete native.images;delete native.textures;delete native.materials;
for(const mesh of native.meshes)for(const p of mesh.primitives)delete p.material;
native.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(native),''),mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations[0];
mixer.clipAction(clip).play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
const meshes=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
const skeleton=meshes[0].skeleton,root=skeleton.bones.find(b=>b.name.startsWith('Root_Hawksbill')),
  head=skeleton.bones.find(b=>b.name.startsWith('Head001')),tail=skeleton.bones.find(b=>b.name.startsWith('Tail_'));
if(!root||!head||!tail)throw Error(`Anatomy anchors missing: ${skeleton.bones.map(b=>b.name).join(',')}`);
const inverse=root.matrixWorld.clone().invert(),h=head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),t=tail.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
const forward=h.sub(t).normalize(),up=new THREE.Vector3(0,1,0).transformDirection(inverse);up.addScaledVector(forward,-up.dot(forward)).normalize();
const side=new THREE.Vector3().crossVectors(forward,up).normalize(),frames=8,parts=[],v=new THREE.Vector3();
for(const index of [0,2]){
  const mesh=meshes[index],g=mesh.geometry,poses=[];
  for(let frame=0;frame<frames;frame++){
    mixer.setTime(frame*clip.duration/frames);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();inverse.copy(root.matrixWorld).invert();
    const positions=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<g.attributes.position.count;i++){v.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);positions.set([v.dot(forward),v.dot(up),v.dot(side)],i*3);}
    poses.push(positions);
  }
  const material=source.materials[index],texture=material.pbrMetallicRoughness.baseColorTexture.index,image=source.images[source.textures[texture].source],view=source.bufferViews[image.bufferView];
  const file=index===0?'hawksbill-body.png':'hawksbill-eyes.png';fs.writeFileSync(`${output}/${file}`,bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
  parts.push({role:index===0?'body':'eyes',poses,uv:g.attributes.uv.array,indices:g.index.array,file,factor:material.pbrMetallicRoughness.baseColorFactor,roughness:material.pbrMetallicRoughness.roughnessFactor});
}
// Keep the observed source proportions, normalize neutral complete body length
// once, and include every sampled flipper pose in its actual clearance envelope.
const box=new THREE.Box3();for(const p of parts)for(let i=0;i<p.poses[0].length;i+=3)box.expandByPoint(v.fromArray(p.poses[0],i));
const center=box.getCenter(new THREE.Vector3()),scale=1/(box.max.x-box.min.x),bounds=new THREE.Box3(),records=[];
const encode=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
for(const p of parts){
  const normals=[];
  for(const pose of p.poses){for(let i=0;i<pose.length;i+=3){v.fromArray(pose,i).sub(center).multiplyScalar(scale);v.toArray(pose,i);bounds.expandByPoint(v);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pose,3));g.setIndex(new THREE.BufferAttribute(p.indices,1));g.computeVertexNormals();normals.push(encode(g.attributes.normal.array));g.dispose();}
  records.push({role:p.role,vertexCount:p.uv.length/2,poses:p.poses.map(encode),normals,uv:encode(p.uv),indices:encode(Uint16Array.from(p.indices)),baseColor:p.file,factor:p.factor,roughness:p.roughness});
}
const data={frames,duration:clip.duration,unit:'neutral total length 1; source proportions; +X forward +Y up',bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},parts:records};
fs.writeFileSync('src/world/shallowHawksbillData.js',`// DigitalLife3D, CC BY-NC 4.0. See public/assets/shallow-source-turtle/provenance.json.\nexport default ${JSON.stringify(data)};\n`);
const receipt={version:1,species:'Eretmochelys imbricata',id:'hawksbill-turtle',...source.asset.extras,download:'https://raw.githubusercontent.com/bob6664569/open-water/main/site/assets/animals/turtle.glb',sourceSHA256:crypto.createHash('sha256').update(raw).digest('hex'),limits:['Non-commercial asset; retain credit, source and CC BY-NC 4.0 on redistribution. No unrestricted commercial distribution.','Eight root-local source skeletal poses, linearly interpolated; not a biomechanical simulation.','Neutral total length normalized to 1; authored sample individual size, not a specimen measurement.','Original body/eye images retained without image editing; thin transparent outer-eye shell omitted; normals regenerated for each pose.','Photographic/model-reconstructed representative, not the green-turtle species.'],sourceAnimation:{name:clip.name,duration:clip.duration,frames,playbackCyclesPerSecond:.36},bounds:data.bounds,parts:records.map(p=>({role:p.role,vertices:p.vertexCount,triangles:Buffer.from(p.indices,'base64').length/2/3,texture:p.baseColor,sha256:crypto.createHash('sha256').update(fs.readFileSync(`${output}/${p.baseColor}`)).digest('hex')}))};
receipt.generatedData={file:'src/world/shallowHawksbillData.js',sha256:crypto.createHash('sha256').update(fs.readFileSync('src/world/shallowHawksbillData.js')).digest('hex')};
fs.writeFileSync(`${output}/provenance.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
