import * as THREE from 'three';
import data from '../../public/assets/shallow-artist/fish.json' with {type:'json'};

// LasquetiSpice, CC BY 4.0. Artist anatomy and four root-local skeletal poses;
// these are independent fish, never a pasted pre-animated school scene.
export const SHALLOW_ARTIST_FISH_IDS=Object.freeze(Object.keys(data));
export function sampleArtistVertex(geometry,index,time,phase,target=new THREE.Vector3()){
  const p=((time*1.15+phase)%4+4)%4,i=Math.floor(p),u=p-i;
  return target.fromBufferAttribute(geometry.attributes[`artistPose${i}`],index)
    .lerp(new THREE.Vector3().fromBufferAttribute(geometry.attributes[`artistPose${(i+1)%4}`],index),u);
}
export class ShallowArtistFish {
  constructor(){this.models=new Map();this.resources=new Set();this.clock={value:0};}
  create(id){
    const asset=data[id];if(!asset)return null;
    const g=new THREE.BufferGeometry();
    for(const [name,values,size]of [['position',asset.position,3],['normal',asset.normal,3],['uv',asset.uv,2],['color',asset.color,3]])g.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    asset.poses.forEach((p,i)=>g.setAttribute(`artistPose${i}`,new THREE.Float32BufferAttribute(p,3)));g.setIndex(asset.indices);
    g.computeBoundingBox();for(const pose of asset.poses)for(let i=0;i<pose.length;i+=3)g.boundingBox.expandByPoint(new THREE.Vector3(...pose.slice(i,i+3)));
    g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.57,metalness:0,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.artistTime=this.clock;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 artistPose0;attribute vec3 artistPose1;attribute vec3 artistPose2;attribute vec3 artistPose3;attribute float artistPhase;uniform float artistTime;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
float frame=mod(artistTime*1.15+artistPhase,4.0),blend=fract(frame);
if(frame<1.0)transformed=mix(artistPose0,artistPose1,blend);
else if(frame<2.0)transformed=mix(artistPose1,artistPose2,blend);
else if(frame<3.0)transformed=mix(artistPose2,artistPose3,blend);
else transformed=mix(artistPose3,artistPose0,blend);`);
    };
    material.customProgramCacheKey=()=> 'shallow-artist-skeletal-poses-v1';
    const root=new THREE.Group(),mesh=new THREE.Mesh(g,material);mesh.name=`artist body / ${id}`;root.add(mesh);root.updateMatrixWorld(true);
    const model={root,material,diffuse:asset.diffuse};this.models.set(id,model);this.resources.add(g);this.resources.add(material);return model;
  }
  async loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    await Promise.allSettled([...this.models.values()].map(async model=>{
      const texture=await loader.loadAsync(`${base}assets/shallow-artist/${model.diffuse}`);
      if(this.sealed||!this.resources.size){texture.dispose();return;}texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
      this.resources.add(texture);model.material.map=texture;model.material.vertexColors=false;model.material.needsUpdate=true;
    }));
  }
  update(time){this.clock.value=time;}
  dispose(){for(const r of this.resources)r.dispose();this.resources.clear();this.models.clear();}
}
