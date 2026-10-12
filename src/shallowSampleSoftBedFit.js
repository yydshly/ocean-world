import * as THREE from 'three';
import {shallowMeadowRibbonGeometry as livingShallowsMeadowGeometry} from './world/ShallowMeadowRibbonAssets.js';
import {shallowReefRubbleGeometry} from './world/ShallowLiveReefAssets.js';

// Shared by existing sediment scenery and new edge patches after reef topology
// changes. Pin each real ribbon root exactly as the display shader does.
export function sampleGrassFitsSoftBed(model,geometry,g){
  const p=geometry.attributes.position,roots=geometry.attributes.rootXZ;
  const co=Math.cos(g.rotation),si=Math.sin(g.rotation);
  for(let i=0;i<p.count;i++){
    const rx=g.x+(roots.getX(i)*co+roots.getY(i)*si)*g.width;
    const rz=g.z+(-roots.getX(i)*si+roots.getY(i)*co)*g.width;
    const y=model.floor(rx,rz)+p.getY(i)*g.height;
    for(const sign of [-1,1]){
      const lx=p.getX(i)+sign*.07*p.getY(i)**2,lz=p.getZ(i);
      const x=g.x+(lx*co+lz*si)*g.width,z=g.z+(-lx*si+lz*co)*g.width,floor=model.floor(x,z);
      if(model.surface(x,z)-floor>.002||y<floor-.002)return false;
    }
  }
  return true;
}

export function fitSampleRubbleOnSoftBed(model,geometry,row){
  const d=.015,hx=(model.floor(row.x+d,row.z)-model.floor(row.x-d,row.z))/(2*d);
  const hz=(model.floor(row.x,row.z+d)-model.floor(row.x,row.z-d))/(2*d);
  const up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(-hx,1,-hz).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(up,normal).multiply(new THREE.Quaternion().setFromAxisAngle(up,row.rotation));
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(row.x,row.y,row.z),q,new THREE.Vector3(row.width,row.height,row.depth??row.width));
  const point=new THREE.Vector3(),p=geometry.attributes.position;let shift=-Infinity;
  for(let i=0;i<p.count;i++){
    point.fromBufferAttribute(p,i).applyMatrix4(matrix);const floor=model.floor(point.x,point.z);
    if(model.surface(point.x,point.z)-floor>.002)return false;
    shift=Math.max(shift,floor-point.y-(p.getY(i)<.14?.005:.001));
  }
  if(Math.abs(shift)>.018)return false;
  row.y+=shift;row.supportNormal=normal.toArray();return true;
}

export function refitSampleSoftBedScenery(model){
  const grass=livingShallowsMeadowGeometry(),rubble=shallowReefRubbleGeometry();
  const before={grass:model.grass.length,rubble:model.rubble.length};
  try{
    const rooted=model.grass.filter(g=>sampleGrassFitsSoftBed(model,grass,g));
    const grounded=model.rubble.filter(r=>fitSampleRubbleOnSoftBed(model,rubble,r));
    model.grass.splice(0,model.grass.length,...rooted);model.rubble.splice(0,model.rubble.length,...grounded);
    model.substrateSceneryRefit={before,after:{grass:rooted.length,rubble:grounded.length}};
  }finally{grass.dispose();rubble.dispose();}
}
