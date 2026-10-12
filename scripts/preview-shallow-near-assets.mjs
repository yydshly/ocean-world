import fs from 'node:fs';
import * as THREE from 'three';
const folder='output/validation/shallow-near-community/candidates';
export class ShallowSampleScene{
  constructor(){
    const key=process.env.SHALLOW_OPEN_ASSET??'live-acropora',d=JSON.parse(fs.readFileSync(`${folder}/${key}/model.json`));
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,16/9,.01,20);this.model={floor:()=>-1};this.summary={key,kind:'offline-source-candidate-not-installed'};
    for(const p of d.parts){
      const g=new THREE.BufferGeometry();for(const [name,array]of Object.entries(p.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(array,name==='uv'?2:3));g.setIndex(p.index);
      const m=new THREE.MeshStandardMaterial({color:new THREE.Color(...p.factor.slice(0,3)),side:THREE.DoubleSide});Object.assign(m.userData,{nativeBaseColorFile:p.image,nativeBaseColorWrapS:p.wrapS??'repeat',nativeBaseColorWrapT:p.wrapT??'repeat'});
      this.scene.add(new THREE.Mesh(g,m));
    }
  }
  update(t){const points=[[1,.6,1.8],[0,.12,1.8],[0,1.8,.05]];this.camera.position.set(...points[Math.round(t)%3]);this.camera.lookAt(0,0,0);}
  installSkeleton(){return Promise.resolve();}
  dispose(){this.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
