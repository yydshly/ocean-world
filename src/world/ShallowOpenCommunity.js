import * as THREE from 'three';
import data from './shallowOpenCommunityData.js';
import {deformMaterial} from './ShallowSourcedFishAssets.js';

export const SHALLOW_OPEN_FISH_IDS=Object.freeze(['blacktail-snapper','giant-trevally']);
const coralSources={'massive':'porites-live'};
function geometry(row){
  const bytes=Uint8Array.from(atob(row.data),c=>c.charCodeAt(0)),g=new THREE.BufferGeometry();
  for(const [name,v]of Object.entries(row.views)){
    const T=name==='index'?Uint16Array:Float32Array,a=new THREE.BufferAttribute(new T(bytes.buffer,v.offset,v.count*v.size),v.size);
    if(name==='index')g.setIndex(a);else g.setAttribute(name,a);
  }
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function shallowOpenCoralGeometries(detail='near'){
  const result={};
  for(const [form,key]of Object.entries(coralSources))for(const variant of [0,1]){
    const asset=data[key],g=geometry(asset.variants[detail][0]);g.rotateY(variant*Math.PI*.61);
    g.computeBoundingBox();g.computeBoundingSphere();
    g.userData={sourceKey:key,sourceAspect:asset.aspect,sourceKind:'CC-BY-4.0-field-colony-crop',form,detail,variant};
    result[`${form}-${variant}`]=g;
  }
  return result;
}
// One texture/material per source part, shared by the whole community. The
// player seals preparation before cruise; late arrivals can only be disposed.
export class ShallowOpenCommunity{
  constructor(){this.resources=new Set();this.models=new Map();this.materials=new Map();this.clock={value:0};this.disposed=false;this._sealed=false;this.released=new WeakSet();}
  own(r){this.resources.add(r);return r;}
  release(r){if(this.released.has(r))return;this.released.add(r);this.resources.delete(r);r.dispose();}
  get sealed(){return this._sealed;}
  set sealed(v){if(v)this._sealed=true;}
  material(row,fish=false){
    if(this.materials.has(row.file))return this.materials.get(row.file);
    const m=this.own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:!!row.views.color,roughness:fish?.60:.88,metalness:0,side:THREE.DoubleSide}));
    if(fish)deformMaterial(m,this.clock);
    Object.assign(m.userData,{nativeBaseColorFile:`public/assets/shallow-open-community/${row.file}`,nativeBaseColorFlipY:false,nativeBaseColorWrapS:row.wrapS,nativeBaseColorWrapT:row.wrapT,nativeVertexColorsAreAlbedo:true});
    this.materials.set(row.file,m);return m;
  }
  coralMaterial(key){const source=coralSources[key.split('-')[0]];return source?this.material(data[source].variants.near[0]):null;}
  create(id){
    if(this.disposed||!SHALLOW_OPEN_FISH_IDS.includes(id))return null;if(this.models.has(id))return this.models.get(id);
    const root=new THREE.Group();root.name=`CC0 specimen fish / ${id}`;let motionRadius=0;
    for(const row of data[id].variants.near){
      const g=this.own(geometry(row)),p=g.attributes.position;
      g.setAttribute('sampleSwimX',new THREE.Float32BufferAttribute(Array.from({length:p.count},(_,i)=>p.getX(i)),1));
      g.setAttribute('sampleSwim',new THREE.InstancedBufferAttribute(new Float32Array([0,4.1,.025]),3));
      for(let i=0;i<p.count;i++){
        const u=THREE.MathUtils.clamp((.26-p.getX(i))/.6,0,1),delta=u*u*.028;
        motionRadius=Math.max(motionRadius,Math.hypot(p.getX(i),Math.abs(p.getZ(i))+delta));
      }
      g.boundingBox.min.z-=.028;g.boundingBox.max.z+=.028;g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh=new THREE.Mesh(g,this.material(row,true));mesh.name='photogrammetric body';
      mesh.customDepthMaterial=this.own(deformMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),this.clock));root.add(mesh);
    }
    root.updateMatrixWorld(true);const model={id,root,motionRadius};this.models.set(id,model);return model;
  }
  loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.loading)return this.loading;if(this.disposed||this.sealed)return Promise.resolve();
    this.loading=Promise.allSettled([...this.materials].map(async([file,m])=>{
      const t=await loader.loadAsync(`${base}assets/shallow-open-community/${file}`);
      if(this.disposed||this.sealed){this.release(t);return false;}
      t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=m.userData.nativeBaseColorWrapS==='repeat'?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.wrapT=m.userData.nativeBaseColorWrapT==='repeat'?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.anisotropy=4;
      this.own(t);m.map=t;m.vertexColors=false;m.needsUpdate=true;return true;
    }));return this.loading;
  }
  update(time){this.clock.value=time;}
  dispose(){if(this.disposed)return;this.disposed=true;this.sealed=true;for(const r of [...this.resources])this.release(r);this.models.clear();this.materials.clear();}
}
