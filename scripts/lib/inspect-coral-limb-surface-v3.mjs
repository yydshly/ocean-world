import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
// This historical v3/v3c comparison is intentionally anchored to the saved
// final v3c source. Current low-detail/UV changes have their own v4 inspection.
import * as current from '../../output/validation/organisms-before-coral-v4.mjs';
import * as before from '../../output/validation/organisms-before-coral-limb-v3.mjs';
import { speciesCatalog } from '../../src/species.js';

const hash = b => createHash('sha256').update(b).digest('hex');
const source = readFileSync(new URL('../../output/validation/organisms-before-coral-v4.mjs', import.meta.url),'utf8');
const baseline = JSON.parse(readFileSync(new URL('../../output/validation/coral-limb-before-v3.json',import.meta.url),'utf8'));
const start = source.indexOf('function coralLimb('), end = source.indexOf('// A small tubular radial corallite',start);
const outside = source.slice(0,start) + source.slice(end);
assert.equal(hash(outside), baseline.outsideCoralLimbSha256, 'Anatomy, RNG, radial cups, material, LOD or ecology code outside coralLimb changed');

function geometryOf(root) { const meshes = []; root.traverse(o => { if(o.isMesh) meshes.push(o); }); assert.equal(meshes.length,1); return meshes[0].geometry; }
function resourcesOf(root) { const set = new Set(); root.traverse(o => { if(o.geometry)set.add(o.geometry);if(o.material){set.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)set.add(v);} });return set; }
const point = (attribute,i) => new THREE.Vector3().fromBufferAttribute(attribute,i);
function ringCenter(g, s, ring) { const out = new THREE.Vector3(), stride = s.sides+1; for(let side=0;side<s.sides;side++)out.add(point(g.attributes.position,s.vertexStart+ring*stride+side));return out.divideScalar(s.sides); }
function inspect(g) {
  g.computeBoundingBox(); const p=g.attributes.position,n=g.attributes.normal, index=g.index;
  let minimumDoubleArea=Infinity,minimumNormalLength=Infinity,maximumNormalLength=0,nonFiniteValues=0,invalidIndices=0;
  for(const a of Object.values(g.attributes))for(const value of a.array)if(!Number.isFinite(value))nonFiniteValues++;
  for(const i of index.array)if(!Number.isInteger(i)||i<0||i>=p.count)invalidIndices++;
  for(let i=0;i<n.count;i++){const l=point(n,i).length();minimumNormalLength=Math.min(minimumNormalLength,l);maximumNormalLength=Math.max(maximumNormalLength,l);}
  for(let k=0;k<index.count;k+=3){const a=point(p,index.getX(k)),b=point(p,index.getX(k+1)),c=point(p,index.getX(k+2));minimumDoubleArea=Math.min(minimumDoubleArea,b.sub(a).cross(c.sub(a)).length());}
  const vertices=new Map(),welded=[],edges=new Map();
  for(let i=0;i<p.count;i++){const key=point(p,i).toArray().map(v=>Math.round(v*1e6)).join(',');if(!vertices.has(key))vertices.set(key,vertices.size);welded.push(vertices.get(key));}
  if(g.userData.coralSurfaceSections)for(let k=0;k<index.count;k+=3){const ids=[0,1,2].map(j=>welded[index.getX(k+j)]);assert.equal(new Set(ids).size,3);for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a}/${b}`:`${b}/${a}`;edges.set(key,(edges.get(key)||0)+1);}}
  const boundaryEdges=[...edges.values()].filter(v=>v===1).length,nonManifoldEdges=[...edges.values()].filter(v=>v>2).length;
  let maximumSeamNormalDifference=0,minimumOutwardShaftDot=Infinity,maximumInwardCupDot=-Infinity,minimumCupDepression=Infinity,maximumCupDepression=0,roundedShoulders=0;
  for(const s of g.userData.coralSurfaceSections||[]){const stride=s.sides+1;
    for(let ring=0;ring<s.rings;ring++){const first=s.vertexStart+ring*stride;maximumSeamNormalDifference=Math.max(maximumSeamNormalDifference,point(n,first).distanceTo(point(n,first+s.sides)));}
    if(s.kind!=='branch')continue;if(s.roundedShoulderRing!=null)roundedShoulders++;
    for(const ring of s.outerNormalRings||[]){const center=ringCenter(g,s,ring);for(let side=0;side<s.sides;side++){const i=s.vertexStart+ring*stride+side;minimumOutwardShaftDot=Math.min(minimumOutwardShaftDot,point(p,i).sub(center).normalize().dot(point(n,i)));}}
    if(!s.axialCup)continue;const inner=s.rings-1,center=ringCenter(g,s,inner);
    for(let side=0;side<s.sides;side++){const i=s.vertexStart+inner*stride+side;maximumInwardCupDot=Math.max(maximumInwardCupDot,point(p,i).sub(center).normalize().dot(point(n,i)));}
    const depth=ringCenter(g,s,s.lipRing).sub(point(p,s.vertexStart+s.mouthPole)).dot(new THREE.Vector3().fromArray(s.axis));
    minimumCupDepression=Math.min(minimumCupDepression,depth);maximumCupDepression=Math.max(maximumCupDepression,depth);
  }
  return{triangles:index.count/3,vertices:p.count,bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray(),size:g.boundingBox.getSize(new THREE.Vector3()).toArray()},minimumDoubleArea,
    minimumNormalLength,maximumNormalLength,nonFiniteValues,invalidIndices,boundaryEdges,nonManifoldEdges,edgeWeldToleranceM:1e-6,maximumSeamNormalDifference,
    minimumOutwardShaftDot:Number.isFinite(minimumOutwardShaftDot)?minimumOutwardShaftDot:null,maximumInwardCupDot:Number.isFinite(maximumInwardCupDot)?maximumInwardCupDot:null,
    minimumCupDepression:Number.isFinite(minimumCupDepression)?minimumCupDepression:null,maximumCupDepression:Number.isFinite(minimumCupDepression)?maximumCupDepression:null,roundedShoulders};
}
function compareOriginalVertices(old,g) {
  if(!old.userData.coralSurfaceSections){for(const name of Object.keys(old.attributes))assert.deepEqual(g.attributes[name].array,old.attributes[name].array);return{originalVerticesPreserved:old.attributes.position.count,unchangedBoulder:true};}
  const oldSections=old.userData.coralSurfaceSections,newSections=g.userData.coralSurfaceSections;assert.equal(oldSections.length,newSections.length);
  assert.deepEqual(g.userData.coralBranches,old.userData.coralBranches);assert.deepEqual(g.userData.coralCorallites,old.userData.coralCorallites);
  let checked=0,unchangedInnerCupNormals=0,changedShaftNormals=0;
  for(let k=0;k<oldSections.length;k++){
    const a=oldSections[k],b=newSections[k];assert.equal(a.kind,b.kind);assert.equal(a.sides,b.sides);assert.equal(a.axialCup,b.axialCup);
    const stride=a.sides+1,inserted=b.roundedShoulderRing;
    assert.equal(b.rings,a.rings+(inserted==null?0:1));
    const map=[];for(let ring=0;ring<a.rings;ring++)for(let side=0;side<=a.sides;side++)map.push((ring+(inserted!=null&&ring>=inserted?1:0))*stride+side);
    map.push(b.rings*stride,b.rings*stride+1);
    for(let local=0;local<map.length;local++){
      const oi=a.vertexStart+local,ni=b.vertexStart+map[local];
      for(const name of ['position','uv','color']){const oa=old.attributes[name],na=g.attributes[name];for(let c=0;c<oa.itemSize;c++)assert.equal(na.getComponent(ni,c),oa.getComponent(oi,c),`${name} original vertex moved in section ${k}`);}
      checked++;
      if(a.kind==='radial'||(a.axialCup&&(local>=((a.rings-1)*stride)))){for(let c=0;c<3;c++)assert.equal(g.attributes.normal.getComponent(ni,c),old.attributes.normal.getComponent(oi,c),'Inner-cup/radial normals changed');unchangedInnerCupNormals++;}
      else if(point(g.attributes.normal,ni).distanceTo(point(old.attributes.normal,oi))>1e-6)changedShaftNormals++;
    }
  }
  assert.equal(checked,old.attributes.position.count);return{originalVerticesPreserved:checked,unchangedInnerCupNormals,changedShaftNormals};
}

export function inspectCoralLimbSurfaceV3(){
  const rows=[],named=speciesCatalog.find(s=>s.id==='staghorn-coral'),oldRoots=[],newRoots=[];
  const add=(id,oldRoot,newRoot)=>{oldRoots.push(oldRoot);newRoots.push(newRoot);const old=geometryOf(oldRoot),g=geometryOf(newRoot),comparison=compareOriginalVertices(old,g),metrics=inspect(g),original=inspect(old),r=resourcesOf(newRoot);
    assert.equal(r.size,4);assert.equal([...r].filter(v=>v.isBufferGeometry).length,1);assert.equal([...r].filter(v=>v.isMaterial).length,1);assert.equal([...r].filter(v=>v.isTexture).length,2);
    const boundDelta=Math.max(...['min','max'].flatMap(key=>metrics.bounds[key].map((v,i)=>Math.abs(v-original.bounds[key][i]))));
    const dimensionsDelta=metrics.bounds.size.map((v,i)=>v-original.bounds.size[i]);
    assert.ok(boundDelta<.002,`Major colony envelope moved by 2mm: ${id} ${boundDelta}`);assert.ok(dimensionsDelta.every(v=>Math.abs(v)<.002),`${id}: ${dimensionsDelta}`);
    if(id.endsWith('/low')){assert.equal(metrics.triangles,original.triangles);assert.deepEqual(g.attributes.position.array,old.attributes.position.array);}
    rows.push({id,...metrics,originalTriangles:original.triangles,triangleChange:metrics.triangles-original.triangles,boundsMaximumAbsoluteDeltaM:boundDelta,dimensionsDeltaM:dimensionsDelta,...comparison,
      mainDraws:1,resources:{geometry:1,material:1,textures:2},sourceColonyRngAndMaterialsUnchanged:true,
      geometrySha256:hash(Buffer.from(g.attributes.position.array.buffer)),normalSha256:hash(Buffer.from(g.attributes.normal.array.buffer)),corallites:g.userData.coralCorallites});
  };
  try{
    for(let i=0;i<4;i++)add('named/'+i,before.createOrganism(named),current.createOrganism(named));
    for(const m of ['boulder','table','branching'])for(let i=0;i<4;i++)for(const d of ['low','medium','high'])add(`${m}/${i}/${d}`,before.createCoralLandscape(m,['#b2aa88'],i,d),current.createCoralLandscape(m,['#b2aa88'],i,d));
    for(const row of rows){assert.equal(row.nonFiniteValues,0);assert.equal(row.invalidIndices,0);assert.ok(row.minimumNormalLength>.99&&row.maximumNormalLength<1.01);if(row.corallites){assert.equal(row.boundaryEdges,0);assert.equal(row.nonManifoldEdges,0);assert.ok(row.minimumDoubleArea>1e-9);assert.ok(row.maximumSeamNormalDifference<1e-6);assert.ok(row.minimumOutwardShaftDot>.15);assert.ok(row.maximumInwardCupDot<-.1);assert.ok(row.minimumCupDepression>.0006&&row.maximumCupDepression<.0035);}if(row.id.startsWith('named/'))assert.ok(row.triangles<36500);if(row.id.endsWith('/low'))assert.ok(row.triangles<6000);}
    return{schema:'coral-limb-surface-node-inspection-v3',sourceSha256:hash(source),sourceBeforeSha256:baseline.sourceSha256,outsideCoralLimbSha256:hash(outside),outsideCoralLimbUnchanged:true,rows,
      limits:['Node geometry only; no browser, WebGL, screenshot after change or final visual pass.','Every original position/UV/color vertex is preserved, including cup lips, mouth poles and basal feet; added shoulder vertices may change the outer envelope by the reported amount.',
        'The source shells are closed with intersecting branch junctions, not boolean biological fusion.','Finite-difference normals follow the authored smooth parametric surface, not exact normals of each coarse drawn triangle.','Shape/cup dimensions are uncalibrated display proxies; no new organism, biomass, anatomy measurement or growth model.']};
  }finally{for(const r of oldRoots)before.disposeOrganism(r);for(const r of newRoots)current.disposeOrganism(r);}
}
export { inspect as inspectCoralGeometryMetrics };
