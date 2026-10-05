import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as current from '../../src/world/organisms.js';
import * as before from '../../output/validation/organisms-before-coral-v4.mjs';
import { speciesCatalog } from '../../src/species.js';
import { inspectCoralGeometryMetrics as inspect } from './inspect-coral-limb-surface-v3.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(new URL('../../src/world/organisms.js',import.meta.url),'utf8');
const sourceBefore=readFileSync(new URL('../../output/validation/organisms-before-coral-v4.mjs',import.meta.url),'utf8');
const stripLimb=s=>{const a=s.indexOf('function coralLimb('),b=s.indexOf('// A small tubular radial corallite',a);return (s.slice(0,a)+s.slice(b)).replace(/\r\n/g,'\n');};
const restoredUv=source.replace(/      \/\/ Local metre projection removes[\s\S]*?uvs\.push\(p\.x \/ \.21504, p\.z \/ \.192\);/,
  '      uvs.push(a / TAU * 4, t * 2.5);');
assert.equal(hash(stripLimb(restoredUv)),hash(stripLimb(sourceBefore)),'Only coralLimb and the explicit boulder UV substitution may change; RNG/fish/other geometry/material remain exact');
const equalArray=(a,b,label)=>assert.equal(hash(Buffer.from(a.buffer,a.byteOffset,a.byteLength)),hash(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),label);
const point=(a,i)=>new THREE.Vector3().fromBufferAttribute(a,i);
function geometry(root){let mesh,count=0;root.traverse(o=>{if(o.isMesh){mesh=o;count++;}});assert.equal(count,1);return mesh.geometry;}
function ringCenter(g,s,ring){const p=new THREE.Vector3();for(let i=0;i<s.sides;i++)p.add(point(g.attributes.position,s.vertexStart+ring*(s.sides+1)+i));return p.divideScalar(s.sides);}
function equalVertex(old,g,oi,ni,names=['position','uv','color']){for(const name of names){const a=old.attributes[name],b=g.attributes[name];for(let c=0;c<a.itemSize;c++)assert.equal(a.getComponent(oi,c),b.getComponent(ni,c),`${name} retained vertex ${oi}/${ni}`);}}
function faceNormalMetrics(g){let minDot=Infinity,negative=0;const p=g.attributes.position,n=g.attributes.normal,idx=g.index;for(let k=0;k<idx.count;k+=3){const ids=[0,1,2].map(j=>idx.getX(k+j)),a=point(p,ids[0]),b=point(p,ids[1]),c=point(p,ids[2]);const face=b.sub(a).cross(c.sub(a)).normalize(),mean=ids.reduce((v,i)=>v.add(point(n,i)),new THREE.Vector3()).normalize(),dot=face.dot(mean);minDot=Math.min(minDot,dot);if(dot<0)negative++;}assert.equal(negative,0);return{faceMeanVertexNormalNegativeCount:negative,minimumFaceMeanVertexNormalDot:minDot};}
function resources(root){const set=new Set();root.traverse(o=>{if(o.geometry)set.add(o.geometry);if(o.material){set.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)set.add(v);}});assert.equal(set.size,4);return{geometry:1,material:1,textures:2,mainDraws:1};}
function textureHashes(root){const out={};root.traverse(o=>{if(o.material)for(const key of ['map','bumpMap']){const t=o.material[key];if(t?.image?.data)out[key]=hash(Buffer.from(t.image.data.buffer,t.image.data.byteOffset,t.image.data.byteLength));}});return out;}
const geometryBytes=g=>g.index.array.byteLength+Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0);
function boulderUv(old,g){
  for(const name of ['position','normal','color'])equalArray(g.attributes[name].array,old.attributes[name].array,name);
  equalArray(g.index.array,old.index.array,'index');
  const p=g.attributes.position,u=g.attributes.uv,idx=g.index;let maximumMappingError=0,minDet=Infinity,maxDet=-Infinity,seamError=0;
  const uvAt=i=>[u.getX(i),u.getY(i)];
  for(let i=0;i<p.count;i++)maximumMappingError=Math.max(maximumMappingError,Math.abs(u.getX(i)-p.getX(i)/.21504),Math.abs(u.getY(i)-p.getZ(i)/.192));
  for(let k=0;k<idx.count;k+=3){const [a,b,c]=[0,1,2].map(j=>uvAt(idx.getX(k+j))),det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);minDet=Math.min(minDet,det);maxDet=Math.max(maxDet,det);assert.ok(det<0,'Every planar UV triangle has consistent nondegenerate winding');}
  const points=new Map();for(let i=0;i<p.count;i++){const key=point(p,i).toArray().map(v=>Math.round(v*1e6)).join(',');if(points.has(key)){const j=points.get(key);seamError=Math.max(seamError,Math.hypot(u.getX(i)-u.getX(j),u.getY(i)-u.getY(j)));}else points.set(key,i);}
  assert.ok(maximumMappingError<4e-7);assert.ok(seamError<1e-6);
  return{xyzTopologyColorNormalsPreserved:true,maximumUvMappingError:maximumMappingError,maximumWeldedSeamUvDifference:seamError,minimumUvDeterminant:minDet,maximumUvDeterminant:maxDet,
    localMetresPerTextureRepeat:[.21504,.192],texturePixels:256,cellsPerRepeat:32,localMetresPerCell:[.00672,.006],authoredCupLipProjectedDiameterM:.00288,
    limit:'Local metre projection; instance scaling and steep sidewalls still stretch the authored tissue proxy.'};
}
function compareLow(old,g){
  assert.deepEqual(g.userData.coralBranches,old.userData.coralBranches);assert.deepEqual(g.userData.coralCorallites,old.userData.coralCorallites);
  const aa=old.userData.coralSurfaceSections,bb=g.userData.coralSurfaceSections;assert.equal(aa.length,bb.length);
  let retained=0,removedInnerVertices=0,newShoulderVertices=0,compactCups=0,limitedShoulders=0,unchangedRadialVertices=0,originalAxialCupsRetained=0;
  const shoulderBulges=[],shoulderEnvelopeDeltas=[];
  for(let section=0;section<aa.length;section++){
    const a=aa[section],b=bb[section],stride=a.sides+1;assert.equal(a.kind,b.kind);assert.equal(a.sides,b.sides);assert.equal(a.axialCup,b.axialCup);
    if(a.kind==='branch'&&b.compactAxialCup){
      compactCups++;assert.equal(b.compactAxialCup,true);assert.equal(b.roundedShoulderRing,3);assert.equal(b.rings,a.rings+1);assert.equal(b.lipRing,a.lipRing+1);
      const oldBounds=new THREE.Box3();for(let local=0;local<a.rings*stride+2;local++)oldBounds.expandByPoint(point(old.attributes.position,a.vertexStart+local));
      for(let ring=0;ring<a.rings-1;ring++)for(let side=0;side<=a.sides;side++){const newRing=ring<3?ring:ring+1;equalVertex(old,g,a.vertexStart+ring*stride+side,b.vertexStart+newRing*stride+side);retained++;}
      for(let pole=0;pole<2;pole++){equalVertex(old,g,a.vertexStart+a.rings*stride+pole,b.vertexStart+b.rings*stride+pole);retained++;}
      // Both sides of the lip have identical XYZ but independently oriented normals.
      for(let side=0;side<=b.sides;side++)equalVertex(g,g,b.vertexStart+b.lipRing*stride+side,b.vertexStart+(b.rings-1)*stride+side,['position','uv']);
      removedInnerVertices+=stride;newShoulderVertices+=stride;if(b.lowShoulderRadiusOffset<0)limitedShoulders++;
      const cap=ringCenter(g,b,2),lip=ringCenter(g,b,b.lipRing),shoulder=ringCenter(g,b,3);
      let previousLinearRadius=0,newRadius=0;
      for(let side=0;side<b.sides;side++){
        previousLinearRadius+=point(g.attributes.position,b.vertexStart+2*stride+side).distanceTo(cap)*.38+
          point(g.attributes.position,b.vertexStart+b.lipRing*stride+side).distanceTo(lip)*.62;
        const p=point(g.attributes.position,b.vertexStart+3*stride+side);newRadius+=p.distanceTo(shoulder);
        const envelopeDelta=Math.max(...['x','y','z'].flatMap(axis=>[oldBounds.min[axis]-p[axis],p[axis]-oldBounds.max[axis]]));
        assert.ok(envelopeDelta<=1e-7,'New shoulder must remain inside previous branch AABB');shoulderEnvelopeDeltas.push(Math.max(0,envelopeDelta));
      }
      shoulderBulges.push(newRadius/previousLinearRadius-1);
    }else{
      if(a.kind==='branch'&&a.axialCup)originalAxialCupsRetained++;
      assert.equal(a.rings,b.rings);for(let local=0;local<a.rings*stride+2;local++){equalVertex(old,g,a.vertexStart+local,b.vertexStart+local,['position','uv','color','normal']);retained++;if(a.kind==='radial')unchangedRadialVertices++;}
    }
  }
  assert.equal(g.index.count,old.index.count,'Reallocation must preserve actual triangle count');
  assert.ok(shoulderBulges.every(v=>v>0),`Inserted shoulder radius must exceed the prior linear cone: ${JSON.stringify({min:Math.min(...shoulderBulges),max:Math.max(...shoulderBulges),nonpositive:shoulderBulges.flatMap((v,i)=>v<=0?[{i,v}]:[])})}`);
  return{retainedPositionUvColorVertices:retained,removedInnerVertices,newShoulderVertices,compactCups,limitedShoulders,originalAxialCupsRetained,unchangedRadialVertices,
    minimumShoulderRadiusBulgeFraction:Math.min(...shoulderBulges),maximumShoulderRadiusBulgeFraction:Math.max(...shoulderBulges),maximumShoulderBranchEnvelopeOverflowM:Math.max(...shoulderEnvelopeDeltas),
    unchangedMajorGrowthAxesAndLipMouthBasalCoordinates:true};
}
export function inspectCoralLowSurfaceV4(){
  const rows=[],named=speciesCatalog.find(s=>s.id==='staghorn-coral');
  function add(id,oldRoot,newRoot){try{
    const old=geometry(oldRoot),g=geometry(newRoot),original=inspect(old),metrics=inspect(g),r=resources(newRoot);
    metrics.corallites=g.userData.coralCorallites;
    const textures=textureHashes(newRoot);assert.deepEqual(textures,textureHashes(oldRoot),'Original material texture bytes must remain unchanged');
    let comparison;if(id.startsWith('boulder/'))comparison=boulderUv(old,g);else if(id.endsWith('/low'))comparison=compareLow(old,g);else{
      equalArray(g.index.array,old.index.array,'index');for(const name of Object.keys(old.attributes))equalArray(g.attributes[name].array,old.attributes[name].array,id+'/'+name);
      assert.deepEqual(g.userData.coralBranches,old.userData.coralBranches);assert.deepEqual(g.userData.coralCorallites,old.userData.coralCorallites);comparison={allGeometryAttributesAndEcologicalSummariesUnchanged:true};}
    const boundDelta=Math.max(...['min','max'].flatMap(key=>metrics.bounds[key].map((v,i)=>Math.abs(v-original.bounds[key][i]))));
    for(let axis=0;axis<3;axis++){assert.ok(metrics.bounds.min[axis]>=original.bounds.min[axis]-1e-7);assert.ok(metrics.bounds.max[axis]<=original.bounds.max[axis]+1e-7);}
    assert.ok(boundDelta<1e-7,'Entire colony bbox remains exact within Float32 rounding');
    assert.equal(metrics.nonFiniteValues,0);assert.equal(metrics.invalidIndices,0);assert.ok(metrics.minimumNormalLength>.99&&metrics.maximumNormalLength<1.01);
    assert.equal(metrics.triangles,original.triangles);
    if(metrics.corallites){assert.equal(metrics.boundaryEdges,0);assert.equal(metrics.nonManifoldEdges,0);assert.ok(metrics.minimumDoubleArea>1e-9);assert.ok(metrics.maximumSeamNormalDifference<1e-6);assert.ok(metrics.minimumOutwardShaftDot>.15);assert.ok(metrics.maximumInwardCupDot<-.1);assert.ok(metrics.minimumCupDepression>.0006&&metrics.maximumCupDepression<.0035);}
    if(id.startsWith('named/'))assert.ok(metrics.triangles<36500);if(id.endsWith('/low'))assert.ok(metrics.triangles<6000);
    rows.push({id,...metrics,...comparison,...faceNormalMetrics(g),originalTriangles:original.triangles,triangleChange:0,boundsMaximumAbsoluteDeltaM:boundDelta,resources:r,
      originalGeometryBytes:geometryBytes(old),geometryBytes:geometryBytes(g),geometryBytesChange:geometryBytes(g)-geometryBytes(old),originalVertices:old.attributes.position.count,vertexChange:g.attributes.position.count-old.attributes.position.count,texturePixelSha256:textures,textureBytesUnchanged:true,
      attributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,{count:a.count,sha256:hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))}]))});
  }finally{before.disposeOrganism(oldRoot);current.disposeOrganism(newRoot);}}
  for(let i=0;i<4;i++)add('named/'+i,before.createOrganism(named),current.createOrganism(named));
  for(const m of ['boulder','table','branching'])for(let i=0;i<4;i++)for(const d of ['low','medium','high'])add(`${m}/${i}/${d}`,before.createCoralLandscape(m,['#b2aa88'],i,d),current.createCoralLandscape(m,['#b2aa88'],i,d));
  return{schema:'coral-low-surface-node-inspection-v4',sourceSha256:hash(source),sourceBeforeSha256:hash(sourceBefore),outsidePermittedCoralEditsSha256:hash(stripLimb(restoredUv)),outsidePermittedCoralEditsUnchanged:true,rows,
    limits:['CPU geometry and UV invariants only. Root must verify actual browser images before any visual pass claim.',
      'Low axial cup inner ring is replaced by a closed single-cone concavity on duplicated original lip; this is an authored LOD approximation, not measured anatomy.',
      'Low shaft remains six-sided. New shoulder silhouette is proven geometrically; finite-difference normals follow its authored radius profile and geometric orientation guard.',
      'Boulder UVs use local metre x/z projection. Instance scaling and steep sidewalls can stretch the unchanged tissue texture.',
      'Branch intersections remain overlapping shells rather than boolean fusion. No new ecology, biomass or scientific ground truth.']};
}
