import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {naturalHabitatGeometry} from './ShallowNaturalHabitat.js';
import data from './shallowLivingKitData.js';
export const LIVING_KIT_FISH={'blacktip-reef-shark':'reef-shark','yellow-tang':'yellow-tang-low'};
export const LIVING_KIT_CORALS={'table-2':'table-acropora','branching-1':'acropora-robusta'};
export const livingKitData=data;
export function livingKitCoralGeometries(detail='near'){
  return Object.fromEntries(Object.entries(LIVING_KIT_CORALS).map(([key,source])=>{
    const parts=data[source].variants[detail].map(naturalHabitatGeometry),g=mergeGeometries(parts,true);parts.forEach(p=>p.dispose());
    g.userData={sourceKey:source,sourceAspect:data[source].aspect,sourceKind:'CC-BY-NC-SA-4.0-field-live-colony',rootRadius:.50,form:key.split('-')[0],variant:Number(key.split('-')[1]),detail};
    g.computeBoundingBox();g.computeBoundingSphere();return [key,g];
  }));
}
// Preserve the original material groups while repeating a complete colony.
export function mergeLivingColonies(parts){
  const g=mergeGeometries(parts);g.clearGroups();let offset=0;
  for(const part of parts){for(const group of part.groups)g.addGroup(offset+group.start,group.count,group.materialIndex);offset+=part.index.count;}
  return g;
}
