// Offline adaptation of the credited CC BY 4.0 artist model. No browser/GPU.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// FileLoader's progress notification in a native asset conversion process.
globalThis.ProgressEvent ??= class extends Event {constructor(type,values){super(type);Object.assign(this,values);}};

const source='output/validation/shallow-habitat/candidates/tropical-fish-school-512.glb';
const bytes=fs.readFileSync(source),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
const bin=bytes.subarray(28+jsonLength);
const usedImages=new Set([1,2,3].map(i=>json.textures[json.materials[i].pbrMetallicRoughness.baseColorTexture.index].source));
const textures=json.images.map((image,i)=>{const v=json.bufferViews[image.bufferView],name=`artist-fish-${i}.png`;
  if(!usedImages.has(i))return name;
  fs.mkdirSync('public/assets/shallow-artist',{recursive:true});
  fs.writeFileSync(`public/assets/shallow-artist/${name}`,bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));return name;
});
const diffuse=[0,1,2,3].map(i=>textures[json.textures[json.materials[i].pbrMetallicRoughness.baseColorTexture.index].source]);
// Native decoding needs geometry and skeleton only, not an HTML image loader.
const native=structuredClone(json);delete native.images;delete native.textures;delete native.materials;
for(const m of native.meshes)for(const p of m.primitives)delete p.material;
native.buffers[0].uri=`data:application/octet-stream;base64,${bin.toString('base64')}`;
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(native),'');
const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations[0]).play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
const meshes=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
const result={},v=new THREE.Vector3(),head=new THREE.Vector3(),tail=new THREE.Vector3();
for(const [id,meshIndex,prefix] of [['blue-tang',1,'blue_tang1'],['moorish-idol',2,'moorish1'],['yellow-tang',3,'Yellow1']]){
  const mesh=meshes[meshIndex],g=mesh.geometry,weights=g.attributes.skinWeight,joints=g.attributes.skinIndex;
  const named=part=>mesh.skeleton.bones.find(b=>b.name.startsWith(prefix)&&b.name.includes(part));
  const root=named('Root'),hb=named('head'),tb=named('Tail')??named('Spine_03');
  if(!root||!hb||!tb)throw new Error(`Missing source anatomy: ${id}`);
  const inverse=root.matrixWorld.clone().invert();hb.getWorldPosition(head).applyMatrix4(inverse);tb.getWorldPosition(tail).applyMatrix4(inverse);
  const forward=head.clone().sub(tail).normalize(),up=new THREE.Vector3(0,1,0).transformDirection(inverse);
  up.addScaledVector(forward,-up.dot(forward)).normalize();const side=new THREE.Vector3().crossVectors(forward,up).normalize();
  const ids=[],remap=new Map();
  for(let i=0;i<g.attributes.position.count;i++){
    let best=-1,bone=0;for(let k=0;k<4;k++)if(weights.array[i*4+k]>best){best=weights.array[i*4+k];bone=joints.array[i*4+k];}
    if(mesh.skeleton.bones[bone].name.startsWith(prefix)){remap.set(i,ids.length);ids.push(i);}
  }
  const indices=[];for(let i=0;i<g.index.count;i+=3){const a=[0,1,2].map(k=>g.index.getX(i+k));if(a.every(n=>remap.has(n)))indices.push(...a.map(n=>remap.get(n)));}
  const duration=gltf.animations[0].duration,frames=[];
  for(let frame=0;frame<4;frame++){
    mixer.setTime(frame*duration/4);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();inverse.copy(root.matrixWorld).invert();
    const positions=[];
    for(const i of ids){v.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      positions.push(v.dot(forward),v.dot(up),v.dot(side));}
    frames.push(positions);
  }
  const xs=frames[0].filter((_,i)=>i%3===0),ys=frames[0].filter((_,i)=>i%3===1),zs=frames[0].filter((_,i)=>i%3===2);
  const min=Math.min(...xs),max=Math.max(...xs),scale=1/(max-min),center=[(max+min)/2,(Math.max(...ys)+Math.min(...ys))/2,(Math.max(...zs)+Math.min(...zs))/2];
  for(const f of frames)for(let i=0;i<f.length;i++)f[i]=Number(((f[i]-center[i%3])*scale).toFixed(6));
  const uv=ids.flatMap(i=>[g.attributes.uv.getX(i),g.attributes.uv.getY(i)]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(frames[0],3));geometry.setIndex(indices);geometry.computeVertexNormals();
  result[id]={position:frames[0],poses:frames,normal:Array.from(geometry.attributes.normal.array,n=>Number(n.toFixed(6))),uv,indices,diffuse:diffuse[meshIndex],duration};
  console.log(JSON.stringify({id,vertices:ids.length,triangles:indices.length/3,duration,unit:'total-length-1',bounds:[Math.min(...ys)*scale,Math.max(...ys)*scale]}));
}
fs.writeFileSync('public/assets/shallow-artist/fish.json',JSON.stringify(result));
// Finish with: python scripts/bake-shallow-artist-colors.py
fs.writeFileSync('public/assets/shallow-artist/provenance.json',JSON.stringify({author:json.asset.extras.author,license:json.asset.extras.license,source:json.asset.extras.source,title:json.asset.extras.title,download:'https://raw.githubusercontent.com/bob6664569/open-water/main/site/assets/animals/tropical-fish-school-512.glb',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),changes:'Isolated first Moorish idol, blue tang and yellow tang; remove group trajectory, normalize full body length; bake four root-local skeletal poses; preserve UV and original source diffuse. Artistic models, not scans or anatomical calibration. Source clownfish held back until a suitable anemone habitat is present.',usedDiffuses:Object.values(result).map(x=>x.diffuse)},null,2));
