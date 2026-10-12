// Offline projection of the actual Three scene. This is not a browser capture
// and does not execute/verify the WebGL shaders or measure browser performance.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import { ShallowSampleScene } from '../src/world/ShallowSampleScene.js';
import { sampleBodyWave } from '../src/world/ShallowNaturalAssets.js';
import { sampleHeroDeform } from '../src/world/ShallowHeroAnimals.js';
import { sampleArtistVertex } from '../src/world/ShallowArtistFish.js';
import {gradeMarineColour} from '../src/world/ShallowMarineAppearance.js';
import { decodeReefScanForInspection } from './lib/decode-reef-scan.mjs';
const options=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const output=options.output||'output/validation/shallow-sample',times=(options.times||'0,34,60').split(',').map(Number);
const comparison=options.cameraReference?JSON.parse(fs.readFileSync(options.cameraReference,'utf8')).frames:null;
if(times.some(t=>!Number.isFinite(t)||t<0||t>75))throw new Error('preview time outside sample');
fs.mkdirSync(output,{recursive:true});
const Scene=options.sceneModule?(await import(pathToFileURL(path.resolve(options.sceneModule)).href)).ShallowSampleScene:
  options.scene==='before'?(await import(pathToFileURL(`${process.cwd()}/output/validation/shallow-integrated/before-ShallowSampleScene.mjs`).href)).ShallowSampleScene:ShallowSampleScene;
const width=1280,height=720,world=new Scene(55),records=[];
// Optional source albedo is projected per pixel by the CPU rasterizer. This
// remains an approximation: no WebGL normal maps, shadows, caustics or FPS.
const photo=options.albedo==='1',rockFile=options.rockAlbedo||world.reefAlbedoFile||(options.scene==='before'?'public/assets/reef-limestone-albedo-v2.png':'public/assets/shallow-reef-carbonate-v1.png');
const rockTextureScale=world.reefTextureScale??(options.scene==='before'?.8:.32);
const scan=await decodeReefScanForInspection();await world.installSkeleton(scan);
const vertex=new THREE.Vector3(),normal=new THREE.Vector3(),sun=new THREE.Vector3(-.48,.82,-.31).normalize();
const transform=new THREE.Matrix4(),local=new THREE.Matrix4(),view=new THREE.Matrix4();
const base=new THREE.Color(),tint=new THREE.Color(),color=new THREE.Color();
// A compact per-material table, not texture colours expanded into vertices.
// Real glTF colour textures use flipY=false; TextureLoader defaults are read
// from an installed map. Artist fallback colours already contain this albedo.
const artistFiles=new Map([...(world.animals?.artists?.models?.values()??[])].map(m=>[m.material,`public/assets/shallow-artist/${m.diffuse}`]));
const baseColorTextures=[],materialTextures=new WeakMap();
function baseColorTexture(material){
  if(!photo)return null;if(materialTextures.has(material))return materialTextures.get(material);
  const file=material.userData?.nativeBaseColorFile??artistFiles.get(material);
  if(!file){materialTextures.set(material,null);return null;}
  if(!fs.existsSync(file))throw new Error(`Missing native baseColor texture: ${file}`);
  const map=material.map,wrap=value=>{if(value===undefined||value===THREE.ClampToEdgeWrapping||value==='clamp')return 'clamp';if(value===THREE.RepeatWrapping||value==='repeat')return 'repeat';throw new Error('Native baseColor supports clamp/repeat wrapping only');};
  if(map?.matrixAutoUpdate!==false)map?.updateMatrix();
  const entry={kind:baseColorTextures.length+3,file,flipY:map?.flipY??material.userData?.nativeBaseColorFlipY??false,
    wrapS:wrap(map?.wrapS??material.userData?.nativeBaseColorWrapS),wrapT:wrap(map?.wrapT??material.userData?.nativeBaseColorWrapT),
    alphaTest:material.alphaTest??0,transparent:!!material.transparent,depthWrite:material.depthWrite!==false,
    uvMatrix:map?.matrix?.toArray()??[1,0,0,0,1,0,0,0,1],uvChannel:map?.channel??0,
    replaceFallbackColors:artistFiles.has(material)||material.userData?.nativeVertexColorsAreAlbedo===true,
    marineSaturation:material.userData?.sampleMarineAppearance?.saturation??1};
  baseColorTextures.push(entry);materialTextures.set(material,entry);return entry;
}
for(const time of times){
  world.update(time);world.camera.aspect=width/height;world.camera.updateProjectionMatrix();world.scene.updateMatrixWorld(true);world.camera.updateMatrixWorld(true);
  if(comparison){const reference=comparison.find(f=>f.time===time);if(!reference)throw new Error(`Missing reference camera at ${time}`);
    world.camera.matrix.fromArray(reference.cameraMatrix);world.camera.matrix.decompose(world.camera.position,world.camera.quaternion,world.camera.scale);world.camera.updateMatrixWorld(true);}
  view.multiplyMatrices(world.camera.projectionMatrix,world.camera.matrixWorldInverse);
  const chunks=[];let count=0;
  world.scene.traverse(object=>{
    if(!object.isMesh||!object.visible||object.material?.isShaderMaterial)return;
    const g=object.geometry,position=g.getAttribute('position'),colors=g.getAttribute('color'),index=g.index;
    const n=object.isInstancedMesh?object.count:1,triangles=(index?index.count:position.count)/3;
    for(let instance=0;instance<n;instance++){
      if(object.isInstancedMesh){object.getMatrixAt(instance,local);transform.multiplyMatrices(object.matrixWorld,local);}else transform.copy(object.matrixWorld);
      const location=new THREE.Vector3().setFromMatrixPosition(transform);
      if(object.isInstancedMesh&&location.distanceTo(world.camera.position)>65)continue;
      const projected=new Float32Array(position.count*3),worldPoints=new Float32Array(position.count*3);
      const morph=object.morphTexture&&g.morphAttributes.position?Array.from(object.morphTexture.source.data.data.slice(instance*(g.morphAttributes.position.length+1)+1,(instance+1)*(g.morphAttributes.position.length+1))):null;
      for(let i=0;i<position.count;i++){
        vertex.fromBufferAttribute(position,i);
        if(morph){vertex.multiplyScalar(1-morph.reduce((a,b)=>a+b,0));for(let k=0;k<morph.length;k++)if(morph[k])vertex.addScaledVector(new THREE.Vector3().fromBufferAttribute(g.morphAttributes.position[k],i),morph[k]);}
        if(g.hasAttribute('artistPhase'))sampleArtistVertex(g,i,time,g.attributes.artistPhase.getX(instance),vertex);
        if(g.hasAttribute('sampleHero')){const h=g.getAttribute('sampleHero'),role=g.getAttribute('heroRole');
          const p=sampleHeroDeform(vertex.x,vertex.y,vertex.z,role.getX(i),time,h.getX(instance),h.getY(instance));vertex.y=p.y;vertex.z=p.z;}
        if(g.hasAttribute('sampleSwimX')&&g.hasAttribute('sampleSwim')){
          const wave=g.getAttribute('sampleSwim');vertex.z+=sampleBodyWave(g.getAttribute('sampleSwimX').getX(i),time,wave.getX(instance),wave.getY(instance),wave.getZ(instance)).offset;
        }
        vertex.applyMatrix4(transform);
        // Mirror the bed-root shader for offline grass placement.
        if(g.hasAttribute('rootXZ')){const root=g.getAttribute('rootXZ'),p=new THREE.Vector3(root.getX(i),0,root.getY(i)).applyMatrix4(transform);
          vertex.y+=world.model.floor(p.x,p.z)-p.y;}
        worldPoints.set(vertex.toArray(),i*3);vertex.applyMatrix4(view);
        projected[i*3]=(vertex.x+1)*width/2;projected[i*3+1]=(1-vertex.y)*height/2;projected[i*3+2]=vertex.z;
      }
      const rows=[];
      for(let t=0;t<triangles;t++){
        const ids=[0,1,2].map(k=>index?index.getX(t*3+k):t*3+k),points=ids.map(i=>Array.from(projected.subarray(i*3,i*3+3)));
        if(points.some(p=>p[2]<-1||p[2]>1)||points.every(p=>p[0]<0)||points.every(p=>p[0]>width)||points.every(p=>p[1]<0)||points.every(p=>p[1]>height))continue;
        const area=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[2][0]-points[0][0])*(points[1][1]-points[0][1]);
        if(Math.abs(area)<.13)continue;
        const a=new THREE.Vector3().fromArray(worldPoints,ids[0]*3),b=new THREE.Vector3().fromArray(worldPoints,ids[1]*3),c=new THREE.Vector3().fromArray(worldPoints,ids[2]*3);
        normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        let m=materials[0];if(materials.length>1){const group=g.groups.find(q=>t*3>=q.start&&t*3<q.start+q.count);m=materials[group?.materialIndex??0];}
        if(m.side===THREE.FrontSide&&area>=0)continue;
        if(m.side===THREE.DoubleSide&&normal.dot(world.camera.position.clone().sub(a))<0)normal.negate();
        const faceNormal=normal.clone(),normals=g.getAttribute('normal');
        if(normals){normal.set(0,0,0);for(const i of ids){
          if(morph&&g.morphAttributes.normal){for(let k=0;k<morph.length;k++)if(morph[k])normal.addScaledVector(new THREE.Vector3().fromBufferAttribute(g.morphAttributes.normal[k],i),morph[k]);}
          else normal.add(new THREE.Vector3().fromBufferAttribute(normals,i));}
          normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(transform)).normalize();if(normal.dot(faceNormal)<0)normal.negate();}
        const texture=baseColorTexture(m);
        base.copy(m.color||new THREE.Color('#ffffff'));
        if(texture&&m.userData?.nativeBaseColorFactor)base.setRGB(...m.userData.nativeBaseColorFactor.slice(0,3));
        if(m.vertexColors&&colors&&!texture?.replaceFallbackColors){tint.setRGB(0,0,0);for(const i of ids){tint.r+=colors.getX(i)/3;tint.g+=colors.getY(i)/3;tint.b+=colors.getZ(i)/3;}base.multiply(tint);}
        if(object.instanceColor){object.getColorAt(instance,tint);base.multiply(tint);}
        if(!texture&&m.userData?.sampleMarineAppearance)gradeMarineColour(base,m.userData.sampleMarineAppearance.saturation);
        const light=.48+.78*Math.max(0,normal.dot(sun));color.copy(base).multiplyScalar(light);
        const center=a.add(b).add(c).multiplyScalar(1/3),distance=center.distanceTo(world.camera.position);
        rows.push(...points.flat(),color.r,color.g,color.b,distance,m.opacity??1);
        if(photo){
          const raw=ids.map(i=>Array.from(worldPoints.subarray(i*3,i*3+3))),elements=view.elements;
          const inverseW=raw.map(([x,y,z])=>1/(elements[3]*x+elements[7]*y+elements[11]*z+elements[15]));
          const uv=g.getAttribute(texture?.uvChannel?`uv${texture.uvChannel}`:'uv');
          if(texture&&!uv)throw new Error(`Mapped native material has no UV channel: ${object.name}`);
          const coords=ids.flatMap(i=>{const u=uv?.getX(i)??0,v=uv?.getY(i)??0,e=texture?.uvMatrix;return e?[e[0]*u+e[3]*v+e[6],e[1]*u+e[4]*v+e[7]]:[u,v];});
          const kind=texture?.kind??(object.material===world.rockMaterial?2:(object.name==='Continuous shallow sand bed'||object.name.startsWith('Sand terrain /'))?1:0);
          const weights=[Math.abs(faceNormal.x)**4,Math.abs(faceNormal.y)**4,Math.abs(faceNormal.z)**4],sum=weights.reduce((a,b)=>a+b,0);
          rows.push(...inverseW,...raw.flat(),...coords,kind,rockTextureScale,...weights.map(w=>w/sum));
        }
      }
      if(rows.length){chunks.push(new Float32Array(rows));count+=rows.length/(photo?37:14);}
    }
  });
  const file=`${output}/frame-${time}.f32`;const fd=fs.openSync(file,'w');for(const chunk of chunks)fs.writeSync(fd,new Uint8Array(chunk.buffer));fs.closeSync(fd);
  records.push({time,file,width,height,triangles:count,cameraMatrix:world.camera.matrixWorld.toArray()});console.log(JSON.stringify({time,triangles:count}));
}
fs.writeFileSync(`${output}/render.json`,JSON.stringify({kind:'offline-actual-mesh-preview-not-webgl',cameraReference:options.cameraReference??'current-authored-route',stride:photo?37:14,albedo:photo?'perspective-pixel-albedo-only-no-normal-map-shadows-or-webgl':'none',albedoFiles:photo?{sand:'public/assets/sand-albedo.png',rock:rockFile}:null,rockDesaturation:world.reefTextureDesaturation??0,baseColorTextures,summary:world.summary,frames:records},null,2));world.dispose();
