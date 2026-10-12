import * as THREE from 'three';
import data from './shallowBranchingCoralData.js';

// Mesh data is local and shared by instanced colonies. No external downloads
// or runtime Draco work can interrupt the 75-second sample.
export function shallowBranchingCoralGeometries(detail='near'){
  const result={};
  for(const form of ['branching','branching2']){
    const row=data[`${form}-${detail}`];if(!row)throw Error('Unknown museum coral detail');
    const bytes=Uint8Array.from(atob(row.data),c=>c.charCodeAt(0)),floats=new Float32Array(bytes.buffer,0,row.count*9);
    for(const variant of [form==='branching'?0:1]){
      const g=new THREE.BufferGeometry();
      for(const [offset,name] of [[0,'position'],[3,'normal'],[6,'color']])g.setAttribute(name,new THREE.BufferAttribute(floats.slice(row.count*offset,row.count*(offset+3)),3));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes.buffer.slice(row.count*36)),1));
      g.rotateY(variant*Math.PI*.61);g.computeBoundingBox();g.computeBoundingSphere();
      g.userData={role:'living-colony-display-not-biomass',sourceKind:'CC0-dry-specimen-with-authored-tissue-colour',form,variant,detail,rootRadius:row.rootRadius,rootBandY:.025,sourceAspect:row.aspect,sourceKey:row.key,license:'CC0-1.0'};
      result[`branching-${variant}`]=g;
    }
  }
  return result;
}
