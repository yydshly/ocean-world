import * as THREE from 'three';
import data from './shallowHawksbillData.js';

const decode=(text,Type)=>{const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);};
export function setSourceTurtlePose(mesh,time,phase=0){
  const weights=mesh.morphTargetInfluences,frame=((time*.36+phase/(Math.PI*2))%1+1)%1*data.frames,low=Math.floor(frame);
  weights.fill(0);weights[low]=1-(frame-low);weights[(low+1)%data.frames]=frame-low;
}

// Source anatomy and eight source swim poses. Built-in morph targets supply
// the same position/normal motion to instanced colour and shadow rendering.
export class ShallowSourceTurtle {
  constructor(){this.resources=new Set();this.model=null;this.sealed=false;this.disposed=false;}
  own(value){this.resources.add(value);return value;}
  create(id){
    if(id!=='hawksbill-turtle'||this.disposed)return null;if(this.model)return this.model;
    const root=new THREE.Group(),materials=[];let motionRadius=0;
    for(const part of data.parts){
      const g=this.own(new THREE.BufferGeometry());
      g.morphAttributes.position=part.poses.map(p=>new THREE.BufferAttribute(decode(p,Float32Array),3));
      for(const pose of g.morphAttributes.position)for(let i=0;i<pose.count;i++)motionRadius=Math.max(motionRadius,Math.hypot(pose.getX(i),pose.getZ(i)));
      g.morphAttributes.normal=part.normals.map(p=>new THREE.BufferAttribute(decode(p,Float32Array),3));
      g.setAttribute('position',g.morphAttributes.position[0]);g.setAttribute('normal',g.morphAttributes.normal[0]);
      g.setAttribute('uv',new THREE.BufferAttribute(decode(part.uv,Float32Array),2));g.setIndex(new THREE.BufferAttribute(decode(part.indices,Uint16Array),1));
      g.boundingBox=new THREE.Box3(new THREE.Vector3(...data.bounds.min),new THREE.Vector3(...data.bounds.max));g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
      g.userData={assetFamily:'DigitalLife-50A-hawksbill',license:'CC-BY-NC-4.0',sourceMotion:true,sizeMeasure:'total-length'};
      const material=this.own(new THREE.MeshStandardMaterial({color:part.role==='eyes'?'#181915':'#6d6a51',roughness:part.roughness,metalness:0,side:THREE.DoubleSide}));
      material.userData={nativeBaseColorFile:`public/assets/shallow-source-turtle/${part.baseColor}`,nativeBaseColorFlipY:false};
      // With the source image, use the source material factor instead of tinting
      // the photography with the loading fallback colour.
      material.userData.nativeBaseColorFactor=part.factor;
      const mesh=new THREE.Mesh(g,material);mesh.name=`hawksbill source ${part.role}`;setSourceTurtlePose(mesh,0);root.add(mesh);materials.push({material,file:part.baseColor,factor:part.factor});
    }
    root.updateMatrixWorld(true);return this.model={root,materials,motionRadius,motionEnvelope:new THREE.Box3(new THREE.Vector3(...data.bounds.min),new THREE.Vector3(...data.bounds.max))};
  }
  loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.ready)return this.ready;if(!this.model||this.disposed)return Promise.resolve(false);
    this.ready=Promise.allSettled(this.model.materials.map(async row=>{
      const texture=await loader.loadAsync(`${base}assets/shallow-source-turtle/${row.file}`);
      if(this.disposed||this.sealed){texture.dispose();return false;}
      texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;this.own(texture);
      row.material.color.setRGB(...row.factor.slice(0,3));row.material.map=texture;row.material.needsUpdate=true;return true;
    })).then(rows=>rows.every(r=>r.status==='fulfilled'&&r.value));return this.ready;
  }
  dispose(){if(this.disposed)return;this.disposed=true;for(const resource of this.resources)resource.dispose();this.resources.clear();this.model=null;}
}
