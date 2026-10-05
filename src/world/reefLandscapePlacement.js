import * as THREE from 'three';

/**
 * Read-only rigid fit for an unattached decorative massive-colony root.
 * The caller chooses uniform display scale/yaw and applies a successful pose.
 * No source geometry, object transform, resource or simulation RNG is changed.
 */
export function fitReefLandscapeBoulder(group, substrate, {
  x, z, scale = group?.scale?.x ?? 1, yaw = 0,
  burialM = .003, basalBandM = .005, maxHeightSpanRatio = .35,
} = {}) {
  const started=performance.now(),scope='sampled actual basal vertices against rendered hard substrate; no full-face contact or physical stability';
  const failed=(reason,details={})=>({ok:false,reason,scope,...details,cpuQueryMs:performance.now()-started});
  if(!group?.isObject3D||group.parent||group.userData?.morphotype!=='boulder')return failed('unsupported-boulder-root');
  if(!substrate?.isMesh||!substrate.geometry?.isBufferGeometry)return failed('invalid-hard-substrate');
  if(![x,z,scale,yaw,burialM,basalBandM,maxHeightSpanRatio].every(Number.isFinite)
    ||scale<=0||burialM<.002||burialM>.005||basalBandM<=0||basalBandM>.01
    ||maxHeightSpanRatio<=0||maxHeightSpanRatio>1)return failed('invalid-options');

  const poseMatrix=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(scale,scale,scale));
  const meshes=[],vertex=new THREE.Vector3();let invalidMesh=false,minY=Infinity,maxY=-Infinity;
  function visit(object,matrix){
    if(object.isMesh){
      const positions=object.geometry?.getAttribute('position');
      if(!positions?.count||object.isSkinnedMesh||object.isInstancedMesh||object.isBatchedMesh
        ||object.geometry.morphAttributes.position?.length){invalidMesh=true;return;}
      meshes.push({positions,matrix});
      for(let index=0;index<positions.count;index++){
        vertex.fromBufferAttribute(positions,index).applyMatrix4(matrix);
        if(![vertex.x,vertex.y,vertex.z].every(Number.isFinite)){invalidMesh=true;return;}
        minY=Math.min(minY,vertex.y);maxY=Math.max(maxY,vertex.y);
      }
    }
    for(const child of object.children){
      const local=child.matrixAutoUpdate?new THREE.Matrix4().compose(child.position,child.quaternion,child.scale):child.matrix;
      visit(child,new THREE.Matrix4().multiplyMatrices(matrix,local));
    }
  }
  visit(group,poseMatrix);
  const crownHeightM=maxY-minY;
  if(invalidMesh||!meshes.length||!Number.isFinite(crownHeightM)||crownHeightM<=1e-5)return failed('invalid-boulder-geometry');

  // Every unique low-layer vertex is used, with a fixed upper bound. Reject
  // denser shapes rather than imply a guarantee from unreported subsampling.
  const basalVertices=[],seen=new Set();let basalSourceVertices=0;
  for(const {positions,matrix}of meshes)for(let index=0;index<positions.count;index++){
    vertex.fromBufferAttribute(positions,index).applyMatrix4(matrix);
    if(vertex.y>minY+basalBandM+1e-9)continue;
    basalSourceVertices++;
    const key=[vertex.x,vertex.y,vertex.z].map(value=>Math.round(value*1e8)).join('/');
    if(seen.has(key))continue;seen.add(key);basalVertices.push(vertex.clone());
  }
  const common={scale,yaw,burialM,basalBandM,maxHeightSpanRatio,crownHeightM,basalSourceVertices,
    basalVertexSamples:basalVertices.length,maximumBasalSamples:128};
  if(basalVertices.length<3||basalVertices.length>128)return failed('unsupported-basal-sample-count',common);

  substrate.updateWorldMatrix(true,false);
  const bounds=new THREE.Box3().setFromObject(substrate);
  if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))return failed('empty-hard-substrate',common);
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),basalSamples=[];
  ray.firstHitOnly=true;
  let rootY=Infinity,minSubstrateY=Infinity,maxSubstrateY=-Infinity;
  for(const point of basalVertices){
    ray.set(new THREE.Vector3(point.x,bounds.max.y+.25,point.z),down);
    const hit=ray.intersectObject(substrate,false)[0];
    if(!hit||!Number.isFinite(hit.point.y))return failed('missing-hard-substrate',{...common,basalSamples});
    rootY=Math.min(rootY,hit.point.y-point.y-burialM);
    minSubstrateY=Math.min(minSubstrateY,hit.point.y);maxSubstrateY=Math.max(maxSubstrateY,hit.point.y);
    basalSamples.push({x:point.x,z:point.z,vertexYAtZeroRoot:point.y,substrateY:hit.point.y});
  }
  const hardSubstrateSpanM=maxSubstrateY-minSubstrateY;
  const visibleCrownAboveHighestSubstrateM=rootY+maxY-maxSubstrateY;
  let minBasalGapM=Infinity,maxBasalGapM=-Infinity;
  for(const sample of basalSamples){
    sample.gapM=rootY+sample.vertexYAtZeroRoot-sample.substrateY;
    minBasalGapM=Math.min(minBasalGapM,sample.gapM);maxBasalGapM=Math.max(maxBasalGapM,sample.gapM);
  }
  const result={...common,rootPositionM:[x,rootY,z],hardSubstrateSpanM,visibleCrownAboveHighestSubstrateM,
    minBasalGapM,maxBasalGapM,basalSamples};
  if(hardSubstrateSpanM>crownHeightM*maxHeightSpanRatio)return failed('excessive-hard-substrate-span',result);
  if(visibleCrownAboveHighestSubstrateM<=0)return failed('buried-crown',result);
  return {ok:true,method:'rigid-Y minimum of basal vertex-to-hard-substrate downward intersections',scope,...result,
    cpuQueryMs:performance.now()-started};
}
