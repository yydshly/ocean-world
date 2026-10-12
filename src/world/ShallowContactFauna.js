import * as THREE from 'three';
import {naturalHabitatGeometry} from './ShallowNaturalHabitat.js';
import data from './shallowContactFaunaData.js';

// Historical sample track keys stay stable. The sample catalogue explicitly
// labels the replacement sources; they are not the previous identified species.
export const CONTACT_FAUNA={'spotted-reef-crab':'crab-blue','day-octopus':'octopus-lukas'};
const padding=.012;
function motionMaterial(material,clock){
  material.onBeforeCompile=shader=>{
    shader.uniforms.contactTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float contactTime;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
float contactWeight=smoothstep(0.0,.08,position.y);
transformed.z+=.008*contactWeight*sin(contactTime*.85+position.x*7.0);
`);
  };
  material.customProgramCacheKey=()=> 'whole-contact-fauna-motion-v1';return material;
}
export class ShallowContactFauna{
  constructor(){this.resources=new Set();this.models=new Map();this.materials=[];this.clock={value:0};this.disposed=false;this.sealed=false;}
  own(resource){this.resources.add(resource);return resource;}
  create(id){
    const key=CONTACT_FAUNA[id];if(!key)return null;if(this.models.has(id))return this.models.get(id);
    const root=new THREE.Group();let motionRadius=0;
    for(const row of data[key].variants.near){
      const g=this.own(naturalHabitatGeometry(row)),p=g.attributes.position;
      // This source octopus has a normal map, but no skin photograph. Pigment
      // is authored vertex colour and is disclosed with the source attribution.
      if(!row.file){const colours=new Float32Array(p.count*3),low=new THREE.Color('#68503b'),high=new THREE.Color('#ae946a');
        for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),patch=.48+.26*Math.sin(x*23+z*17)*Math.cos(y*31+z*25);colours.set(low.clone().lerp(high,patch).toArray(),i*3);}
        g.setAttribute('color',new THREE.BufferAttribute(colours,3));
      }
      const material=this.own(motionMaterial(new THREE.MeshStandardMaterial({color:row.file?'#ffffff':'#ffffff',vertexColors:!row.file,roughness:.78,metalness:0,side:THREE.DoubleSide}),this.clock));
      material.userData.biologicalSkin=true;
      Object.assign(material.userData,{nativeBaseColorFile:row.file?`public/assets/shallow-contact-fauna/${row.file}`:null,nativeBaseColorFlipY:false,sourceAsset:key});
      this.materials.push({material,row});
      for(let i=0;i<p.count;i++)motionRadius=Math.max(motionRadius,Math.hypot(p.getX(i),Math.abs(p.getZ(i))+padding));
      g.boundingBox.min.z-=padding;g.boundingBox.max.z+=padding;g.boundingBox.getBoundingSphere(g.boundingSphere);
      const mesh=new THREE.Mesh(g,material);mesh.name=`complete source ${key} / ${row.file?'photographed surface':'authored pigment'}`;
      mesh.customDepthMaterial=this.own(motionMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),this.clock));root.add(mesh);
    }
    root.updateMatrixWorld(true);const model={id,root,motionRadius};this.models.set(id,model);return model;
  }
  async loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.loading)return this.loading;
    this.loading=Promise.allSettled(this.materials.flatMap(({material,row})=>[['map',row.file],['normalMap',row.normalFile]].filter(([,file])=>file).map(async([slot,file])=>{
      const t=await loader.loadAsync(`${base}assets/shallow-contact-fauna/${file}`);
      if(this.sealed||this.disposed){t.dispose();return;}this.own(t);t.flipY=false;t.colorSpace=slot==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;material[slot]=t;material.needsUpdate=true;
    })));return this.loading;
  }
  update(time){this.clock.value=time;}
  dispose(){if(this.disposed)return;this.disposed=this.sealed=true;for(const r of this.resources)r.dispose();this.resources.clear();}
}
