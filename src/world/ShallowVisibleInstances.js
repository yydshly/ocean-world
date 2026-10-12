import * as THREE from 'three';

// Keep the authored population and physical layout intact. Only submit the
// instances intersecting the current view, with one complete LOD per object.
// Stable membership avoids uploading all static matrices on every frame.
export class ShallowVisibleInstances {
  constructor(nearMeshes,farMeshes,{nearDistance=10,farDistance=14}={}){
    this.nearMeshes=nearMeshes;this.farMeshes=farMeshes;
    const source=nearMeshes[0];this.count=source.count;this.nearDistance=nearDistance;this.farDistance=farDistance;
    this.matrices=Array.from({length:this.count},(_,i)=>{const m=new THREE.Matrix4();source.getMatrixAt(i,m);return m;});
    this.colors=source.instanceColor?Array.from({length:this.count},(_,i)=>{const c=new THREE.Color();source.getColorAt(i,c);return c;}):null;
    const bounds=new THREE.Box3();
    for(const mesh of [...nearMeshes,...farMeshes]){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);}
    const sphere=bounds.getBoundingSphere(new THREE.Sphere());
    this.spheres=this.matrices.map(m=>sphere.clone().applyMatrix4(m));
    this.levels=new Uint8Array(this.count);this.excluded=new Set();this.nearIndices=[];this.farIndices=[];
    this.frustum=new THREE.Frustum();this.projection=new THREE.Matrix4();this.probe=new THREE.Sphere();
    this.signatures={near:null,far:null};
    for(const mesh of [...nearMeshes,...farMeshes])mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  update(camera){
    camera.updateMatrixWorld();this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
    const near=[],far=[];
    for(let i=0;i<this.count;i++){
      if(this.excluded.has(i))continue;
      const s=this.spheres[i];this.probe.copy(s);this.probe.radius+=.5;
      if(!this.frustum.intersectsSphere(this.probe))continue;
      const distance=camera.position.distanceTo(s.center)-s.radius;
      if(distance>this.farDistance)this.levels[i]=1;
      else if(distance<this.nearDistance)this.levels[i]=0;
      (this.levels[i]?far:near).push(i);
    }
    this.nearIndices=near;this.farIndices=far;
    for(const [level,indices,meshes]of [['near',near,this.nearMeshes],['far',far,this.farMeshes]]){
      const signature=indices.join(',');if(this.signatures[level]===signature)continue;this.signatures[level]=signature;
      for(const mesh of meshes){
        mesh.count=indices.length;mesh.visible=indices.length>0;
        indices.forEach((original,i)=>{mesh.setMatrixAt(i,this.matrices[original]);if(this.colors)mesh.setColorAt(i,this.colors[original]);});
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        if(mesh.count)mesh.computeBoundingSphere();
      }
    }
  }
}
