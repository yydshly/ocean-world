import * as THREE from 'three';
import data from './shallowBenthicCoralData.js';

const decoded=new WeakMap();
function geometry(row){
  if(!decoded.has(row)){
    const b=Uint8Array.from(atob(row.data),c=>c.charCodeAt(0)),attrs={};
    for(const [k,v]of Object.entries(row.views)){const T=k==='index'?Uint16Array:Float32Array;attrs[k]={array:new T(b.buffer,v.offset,v.count*v.size).slice(),size:v.size};}decoded.set(row,attrs);
  }
  const g=new THREE.BufferGeometry();for(const [k,a]of Object.entries(decoded.get(row))){const v=new THREE.BufferAttribute(a.array.slice(),a.size);if(k==='index')g.setIndex(v);else g.setAttribute(k,v);}
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export const BENTHIC_CORAL_KEYS={'table-1':'reef-lettuce','massive-1':'reef-lobed'};
export function shallowSpongeSourceGeometry(){return geometry(data['sponge-stove'].variants.near[0]);}
export function shallowBenthicCoralGeometries(detail='near'){
  return Object.fromEntries(Object.entries(BENTHIC_CORAL_KEYS).map(([key,source])=>{
    const g=geometry(data[source].variants[detail][0]);
    g.userData={sourceKey:source,sourceAspect:data[source].aspect,sourceKind:'CC-BY-4.0-live-colony-scan',rootRadius:.489,form:key.split('-')[0],variant:1,detail};return [key,g];
  }));
}
export class ShallowBenthicCorals{
  constructor(){this.resources=new Set();this.materials=new Map();this.sealed=false;this.disposed=false;}
  material(key){
    const source=BENTHIC_CORAL_KEYS[key]??(key==='tube-sponge'?'sponge-stove':null);if(!source)return null;
    if(!this.materials.has(source)){
      const row=data[source].variants.near[0],m=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.88,side:THREE.DoubleSide});
      m.userData={nativeBaseColorFile:`public/assets/shallow-benthic-habitat/${row.file}`,nativeBaseColorFlipY:false,nativeBaseColorWrapS:row.wrapS,nativeBaseColorWrapT:row.wrapT};
      this.resources.add(m);this.materials.set(source,m);
    }return this.materials.get(source);
  }
  loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.loading)return this.loading;
    return this.loading=Promise.allSettled([...this.materials].map(async([source,m])=>{
      const row=data[source].variants.near[0],t=await loader.loadAsync(`${base}assets/shallow-benthic-habitat/${row.file}`);
      if(this.sealed||this.disposed){t.dispose();return;}this.resources.add(t);t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;m.map=t;m.needsUpdate=true;
    }));
  }
  dispose(){if(this.disposed)return;this.disposed=this.sealed=true;for(const r of this.resources)r.dispose();this.resources.clear();}
}
