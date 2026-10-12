import * as THREE from 'three';
import { sourcedFishBase64, sourcedFishViews } from './ShallowSourcedFishData.js';
import { sampleBodyWave } from './ShallowNaturalAssets.js';

export const SHALLOW_SOURCED_FISH_IDS=Object.freeze(['barramundi']);
export const SHALLOW_SOURCED_FISH_MAX_AMPLITUDE=.028;
const clampAmplitude=a=>THREE.MathUtils.clamp(a,0,SHALLOW_SOURCED_FISH_MAX_AMPLITUDE);
const clampRate=r=>THREE.MathUtils.clamp(r,0,8);
const baseColorFile='public/assets/shallow-sourced-fish/barramundi-basecolor.png';

// Native previews and the GPU use the same bounded authored display wave.
// The original static source has no joints or supplied animation.
export function sampleSourcedFishVertex(geometry,index,time,phase=0,rate=4.1,amplitude=.025,target=new THREE.Vector3()){
  target.fromBufferAttribute(geometry.attributes.position,index);
  target.z+=sampleBodyWave(geometry.attributes.sampleSwimX?.getX(index)??target.x,time,phase,clampRate(rate),clampAmplitude(amplitude)).offset;
  return target;
}
export function deformMaterial(material,clock){
  material.onBeforeCompile=shader=>{
    shader.uniforms.sampleSwimTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 sampleSwim;attribute float sampleSwimX;uniform float sampleSwimTime;
float sourcedWave(){float u=clamp((.26-sampleSwimX)/.6,0.0,1.0),a=clamp(sampleSwim.z,0.0,.028);return sin(sampleSwimTime*clamp(sampleSwim.y,0.0,8.0)-sampleSwimX*6.0+sampleSwim.x)*u*u*a;}
float sourcedWaveSlope(){float u=clamp((.26-sampleSwimX)/.6,0.0,1.0),a=sampleSwimTime*clamp(sampleSwim.y,0.0,8.0)-sampleSwimX*6.0+sampleSwim.x;
return clamp(sampleSwim.z,0.0,.028)*((u>0.0&&u<1.0?-2.0*u/.6:0.0)*sin(a)-6.0*u*u*cos(a));}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sourcedWave();')
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
objectNormal.x-=objectNormal.z*sourcedWaveSlope();objectNormal=normalize(objectNormal);
#ifdef USE_TANGENT
objectTangent.z+=objectTangent.x*sourcedWaveSlope();objectTangent=normalize(objectTangent);
#endif`);
  };
  material.customProgramCacheKey=()=> 'shallow-cc0-sourced-fish-wave-v1';return material;
}
function geometry(){
  const bytes=Uint8Array.from(atob(sourcedFishBase64),character=>character.charCodeAt(0)),g=new THREE.BufferGeometry();
  for(const [name,view]of Object.entries(sourcedFishViews)){
    const ArrayType=view.type==='Uint16Array'?Uint16Array:Float32Array;
    const attribute=new THREE.BufferAttribute(new ArrayType(bytes.buffer,view.byteOffset,view.count*view.itemSize),view.itemSize);
    if(name==='index')g.setIndex(attribute);else g.setAttribute(name,attribute);
  }
  const waveX=Float32Array.from(g.attributes.position.array.filter((_,index)=>index%3===0));
  g.setAttribute('sampleSwimX',new THREE.BufferAttribute(waveX,1));
  g.setAttribute('sampleSwim',new THREE.InstancedBufferAttribute(new Float32Array([0,4.1,.025]),3));
  g.computeBoundingBox();
  const neutral=g.boundingBox.clone(),envelope=neutral.clone(),v=new THREE.Vector3();
  for(let i=0;i<g.attributes.position.count;i++){
    v.fromBufferAttribute(g.attributes.position,i);const u=THREE.MathUtils.clamp((.26-v.x)/.6,0,1),delta=u*u*SHALLOW_SOURCED_FISH_MAX_AMPLITUDE;
    envelope.expandByPoint(new THREE.Vector3(v.x,v.y,v.z-delta));envelope.expandByPoint(new THREE.Vector3(v.x,v.y,v.z+delta));
  }
  g.boundingBox=envelope;g.boundingSphere=envelope.getBoundingSphere(new THREE.Sphere());
  g.userData={assetFamily:'shallow-cc0-sourced-fish-v1',representativeId:'barramundi',neutralBounds:{min:neutral.min.toArray(),max:neutral.max.toArray()},sourceTriangles:3864,sourceAnimation:false};
  return g;
}

export class ShallowSourcedFishAssets{
  constructor(){this.models=new Map();this.resources=new Set();this.clock={value:0};this.disposed=false;this._sealed=false;this.stagedTextures=new Set();this.released=new WeakSet();this.loading=null;}
  get sealed(){return this._sealed;}
  set sealed(value){if(!value||this._sealed)return;this._sealed=true;for(const texture of this.stagedTextures)this.release(texture);this.stagedTextures.clear();}
  own(resource){this.resources.add(resource);return resource;}
  release(resource){if(this.released.has(resource))return;this.released.add(resource);resource.dispose();this.resources.delete(resource);this.stagedTextures.delete(resource);}
  create(id){
    if(this.disposed||!SHALLOW_SOURCED_FISH_IDS.includes(id))return null;
    if(this.models.has(id))return this.models.get(id);
    const g=this.own(geometry()),material=this.own(deformMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.68,metalness:0}),this.clock));
    Object.assign(material.userData,{nativeBaseColorFile:baseColorFile,nativeBaseColorFlipY:false,nativeBaseColorWrapS:'repeat',nativeBaseColorWrapT:'repeat'});
    const depth=this.own(deformMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),this.clock));
    const root=new THREE.Group(),mesh=new THREE.Mesh(g,material);mesh.name='CC0 sourced barramundi body';mesh.customDepthMaterial=depth;root.name='Sourced fish / barramundi';root.add(mesh);root.updateMatrixWorld(true);
    const model={id,root,material,customDepthMaterial:depth,motionPadding:Object.freeze({radius:.028,bottom:0}),motionEnvelope:g.boundingBox.clone()};
    this.models.set(id,model);return model;
  }
  loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.loading)return this.loading;if(this.disposed||this.sealed||!this.models.size)return Promise.resolve(false);
    const files=['barramundi-basecolor.png','barramundi-normal.png','barramundi-orm.png'];
    this.loading=(async()=>{
      const results=await Promise.allSettled(files.map(async(file,index)=>{
        const texture=await loader.loadAsync(`${base}assets/shallow-sourced-fish/${file}`);
        if(this.disposed||this.sealed){this.release(texture);return null;}
        texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.colorSpace=index===0?THREE.SRGBColorSpace:THREE.NoColorSpace;
        this.own(texture);this.stagedTextures.add(texture);return texture;
      }));
      const textures=results.map(result=>result.status==='fulfilled'?result.value:null);
      if(this.disposed||this.sealed||textures.some(texture=>!texture)){for(const texture of textures)if(texture)this.release(texture);return false;}
      for(const model of this.models.values()){
        Object.assign(model.material,{map:textures[0],normalMap:textures[1],aoMap:textures[2],roughnessMap:textures[2],metalnessMap:textures[2],roughness:1,metalness:1});
        model.material.color.set('#ffffff');model.material.needsUpdate=true;
      }
      this.stagedTextures.clear();return true;
    })();return this.loading;
  }
  update(time,speeds=new Map()){
    if(this.disposed)return;this.clock.value=time;
    for(const [id,model]of this.models){const attribute=model.root.children[0].geometry.getAttribute('sampleSwim');
      // Instanced school attributes supplied by the scene keep their independent
      // per-fish phase and cadence. Only the single prototype gets a speed rate.
      if(attribute.count===1){attribute.setY(0,3.6+THREE.MathUtils.clamp(speeds.get(id)??0,0,1)*1.4);attribute.needsUpdate=true;}
    }
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.sealed=true;for(const resource of [...this.resources])this.release(resource);this.models.clear();}
}
