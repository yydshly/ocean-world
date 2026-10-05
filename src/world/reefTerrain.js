import * as THREE from 'three';
import { reefRockProfile, reefRockSurfacePoint } from '../habitat.js';

// Retain the original lower sampling and add intermediate upper latitude
// rings, including the now curved crown. All upper positions are evaluated
// from the CURRENT shared height field; an old contact pose is not preserved
// by the topology. UV v continues to describe the original latitude.
function createShoulderSamplingSphere(){
  const sampled=new THREE.SphereGeometry(1,64,160),rows=[];
  // Fine sampling in the broad curved crown keeps a 4 mm analytic coral
  // attachment close to its rendered triangles. Outside it, half-density
  // rings suffice; the lower hemisphere retains its original 40-latitude grid.
  for(let row=0;row<=20;row++)rows.push(row);
  for(let row=22;row<=80;row+=2)rows.push(row);
  for(let row=84;row<=160;row+=4)rows.push(row);
  const geometry=new THREE.BufferGeometry(),positions=[],uvs=[],indices=[];
  const sourcePosition=sampled.attributes.position,sourceUv=sampled.attributes.uv;
  for(const row of rows)for(let column=0;column<=64;column++){
    const index=row*65+column;
    positions.push(sourcePosition.getX(index),sourcePosition.getY(index),sourcePosition.getZ(index));
    uvs.push(sourceUv.getX(index),sourceUv.getY(index));
  }
  for(let row=0;row<rows.length-1;row++)for(let column=0;column<64;column++){
    const a=row*65+column+1,b=row*65+column,c=(row+1)*65+column,d=c+1;
    if(row!==0)indices.push(a,b,d);
    if(row!==rows.length-2)indices.push(b,c,d);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);sampled.dispose();return geometry;
}

// Shared render geometry for the world and geometry-only contact inspection.
// Heights are authored metres; the sampled triangles approximate the analytic
// upper surface used by the model. No surveyed geology is implied.
export function createReefRockGeometry(rock,{bedSupported=false}={}){
  const profile=reefRockProfile(rock),weathered=Boolean(profile);
  // Only the continuous ledge's steep undercut needs denser sampling. Other
  // authored mounds and auxiliary stones retain their exact previous buffers.
  const ledge=profile?.shapeKind==='continuousLedge';
  const geometry=profile?.roundedShoulders?createShoulderSamplingSphere():new THREE.SphereGeometry(1,ledge?96:weathered?64:32,ledge?80:weathered?40:20),positions=geometry.attributes.position;
  for(let index=0;index<positions.count;index++){
    const nx=positions.getX(index),ny=positions.getY(index),nz=positions.getZ(index);
    const point=reefRockSurfacePoint(rock,nx,ny,nz,bedSupported);
    positions.setXYZ(index,point.x,point.y,point.z);
  }
  geometry.computeVertexNormals();
  // Sphere UVs duplicate the seam and poles. Average only those coincident
  // positions to remove artificial shading seams without changing indices.
  const normals=geometry.attributes.normal,seams=new Map();
  for(let i=0;i<positions.count;i++){
    const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(value=>Math.round(value*1e6)).join('/');
    if(!seams.has(key))seams.set(key,[]);seams.get(key).push(i);
  }
  for(const indices of seams.values())if(indices.length>1){
    const normal=new THREE.Vector3();
    for(const index of indices)normal.add(new THREE.Vector3().fromBufferAttribute(normals,index));
    if(normal.lengthSq()>1e-16){normal.normalize();for(const index of indices)normals.setXYZ(index,normal.x,normal.y,normal.z);}
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
