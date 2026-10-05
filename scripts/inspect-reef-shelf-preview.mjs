import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import * as current from '../src/habitat.js';
import * as old from '../output/validation/sources/reef-low-mound-v1/src/habitat.js';
import {REEF_AUXILIARY_ROCKS} from '../src/reefScenery.js';
import {createReefRockGeometry} from '../src/world/reefTerrain.js';
import {createReefRockGeometry as createOldGeometry} from '../output/validation/sources/reef-low-mound-v1/src/world/reefTerrain.js';
import {enableStaticRayQueries} from '../src/world/reefSpatialQueries.js';

const root=new URL('../',import.meta.url),changed=[7,8,9],hash=b=>createHash('sha256').update(b).digest('hex');
const files=['src/habitat.js','src/reefScenery.js','src/world/reefTerrain.js','src/world/reefSpatialQueries.js',
  'scripts/inspect-reef-shelf-preview.mjs','output/validation/sources/reef-low-mound-v1/src/habitat.js',
  'output/validation/sources/reef-low-mound-v1/src/reefScenery.js','output/validation/sources/reef-low-mound-v1/src/world/reefTerrain.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(new URL(file,root)))])));

export async function inspectReefShelfPreview(){
  const sourceSha256=await sourceHashes();assert.deepEqual(current.REEF_ROCKS,old.REEF_ROCKS);
  assert.equal(sourceSha256['output/validation/sources/reef-low-mound-v1/src/habitat.js'],'8879c21b072aaae7a5bf63ad3bbb4f153a078850124a219c944f3ab7ed00ede1');
  assert.equal(sourceSha256['output/validation/sources/reef-low-mound-v1/src/world/reefTerrain.js'],'5eab04a04ccb1378bae0c3d5d507273995d79ebddcc37db3ffdadc372158a978');
  const rocks=[...current.REEF_ROCKS,...REEF_AUXILIARY_ROCKS],material=new THREE.MeshBasicMaterial();
  const meshes=rocks.map((rock,index)=>new THREE.Mesh(createReefRockGeometry(rock,{bedSupported:index<12&&index!==9}),material));
  for(const mesh of meshes){enableStaticRayQueries(mesh);mesh.updateMatrixWorld(true);}
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0);ray.firstHitOnly=true;
  const cast=(mesh,x,z,direction)=>{ray.set(new THREE.Vector3(x,direction===down?7:-2,z),direction);return ray.intersectObject(mesh,false)[0];};
  const report={schema:'reef-shelf-preview-sanity-v1',generatedAtUtc:new Date().toISOString(),sourceSha256,
    scope:'Bounded actual31-rock finite/closed/normals/shared-height and central-crevice checks before actual visual preview',
    changedRockIndices:changed,rocks:[],heightSamples:[],passageSamples:[],connectionSamples:[],
    limits:['Authored shelf/shoulders are a style prototype, not measured geology or structural stability.',
      'Central passage samples do not prove a whole animal/camera body traverses every surrounding coordinate.',
      'Old bridge7/8/9 upper/lower/footprint contracts intentionally change; raw parameters, RNG and28 other rock buffers stay fixed.',
      'Full coral/scan/model/camera regressions and current browser judgement remain separate after the visual prototype review.',
      'No World/coral/organisms/material/frozen dist edits or new20-minute browser performance claim.']};
  try{
    for(const [index,mesh]of meshes.entries()){
      const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,face=g.index;
      const welded=new Map(),ids=[],edges=new Map();let upper=0,lower=0,minArea=Infinity;
      for(let i=0;i<p.count;i++){
        assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
        const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join('/');
        if(!welded.has(key))welded.set(key,welded.size);ids[i]=welded.get(key);
      }
      for(let k=0;k<face.count;k+=3){
        const v=[face.getX(k),face.getX(k+1),face.getX(k+2)];
        const [a,b,c]=v.map(i=>new THREE.Vector3().fromBufferAttribute(p,i)),cross=b.sub(a).cross(c.sub(a));
        assert.ok(cross.length()>2e-12);minArea=Math.min(minArea,cross.length()/2);
        if(v.every(i=>uv.getY(i)>=.5-1e-8)){assert.ok(cross.y>0);upper++;}
        if(v.every(i=>uv.getY(i)<=.5+1e-8)){assert.ok(cross.y<0);lower++;}
        for(let j=0;j<3;j++){const a=ids[v[j]],b=ids[v[(j+1)%3]];assert.notEqual(a,b);
          const key=a<b?a+'/'+b:b+'/'+a;edges.set(key,(edges.get(key)||0)+1);}
      }
      assert.ok([...edges.values()].every(count=>count===2));assert.equal(upper+lower,face.count/3);
      const baseline=createOldGeometry(rocks[index],{bedSupported:index<12&&index!==9});
      let baselinePositionSha256;
      try{baselinePositionSha256=hash(Buffer.from(baseline.attributes.position.array.buffer));}finally{baseline.dispose();}
      const positionSha256=hash(Buffer.from(p.array.buffer));
      if(!changed.includes(index))assert.equal(positionSha256,baselinePositionSha256,'Nine main low mounds and19 auxiliary buffers stay exact');
      else assert.notEqual(positionSha256,baselinePositionSha256);
      report.rocks.push({index,triangles:face.count/3,upperFaces:upper,lowerFaces:lower,minArea,closedWeldedEdges:true,
        positionSha256,baselinePositionSha256,changed:changed.includes(index)});
    }
    for(const index of changed){
      const rock=rocks[index];
      for(let j=0;j<24;j++)for(const radius of [.15,.35,.55,.75,.90,.97]){
        const angle=j*Math.PI/12,ny=Math.sqrt(1-radius*radius),point=current.reefRockSurfacePoint(rock,radius*Math.cos(angle),ny,radius*Math.sin(angle),index!==9);
        const nx=(point.x-rock[0])/rock[3],nz=(point.z-rock[2])/rock[5],analytic=current.reefRockSurfaceY(rock,nx,ny,nz,index!==9);
        assert.ok(current.reefRockFootprintContains(rock,nx,nz));assert.ok(Math.abs(analytic-point.y)<1e-5);
        const top=cast(meshes[index],point.x,point.z,down),bottom=cast(meshes[index],point.x,point.z,up);assert.ok(top&&bottom);
        const analyticLower=current.reefRockSurfaceY(rock,nx,-ny,nz,index!==9);
        assert.ok(analytic>=analyticLower-1e-12);
        report.heightSamples.push({index,radius,angle,upperAnalyticMinusTriangleM:analytic-top.point.y,
          lowerAnalyticMinusTriangleM:analyticLower-bottom.point.y,forwardInverseErrorM:analytic-point.y});
      }
    }
    const cap=rocks[9];
    for(const dx of [-.08,0,.08])for(const dz of [-.14,0,.14]){
      const x=cap[0]+dx,z=cap[2]+dz,y=.30,top=cast(meshes[9],x,z,down),bottom=cast(meshes[9],x,z,up);assert.ok(top&&bottom);
      assert.ok(bottom.point.y>=.50-1e-6);if(dx===0&&dz===0)assert.ok(Math.abs(bottom.point.y-.50)<1e-6);
      for(const [index,rock]of rocks.entries()){
        const nx=(x-rock[0])/rock[3],nz=(z-rock[2])/rock[5];if(!current.reefRockFootprintContains(rock,nx,nz))continue;
        const coord=current.reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-coord.radius**2)),
          low=current.reefRockSurfaceY(rock,nx,-ny,nz,index<12&&index!==9),high=current.reefRockSurfaceY(rock,nx,ny,nz);
        assert.ok(y<low-.03||y>high+.03,'Central eye samples remain outside every analytic rock interval');
      }
      report.passageSamples.push({pointM:[x,y,z],actualCapUndersideY:bottom.point.y,eyeToCeilingGapM:bottom.point.y-y});
    }
    for(const supportIndex of [7,8]){
      let connections=0,maxOverlap=0,maxSignedOverlap=-Infinity,commonColumns=0;
      for(let i=0;i<16;i++)for(let j=0;j<12;j++){
        const x=cap[0]+cap[3]*((i+.5)/8-1),z=cap[2]+cap[5]*((j+.5)/6-1);
        const capBottom=cast(meshes[9],x,z,up),supportTop=cast(meshes[supportIndex],x,z,down);if(!capBottom||!supportTop)continue;
        const overlap=supportTop.point.y-capBottom.point.y;
        commonColumns++;maxSignedOverlap=Math.max(maxSignedOverlap,overlap);
        if(overlap>=0){connections++;maxOverlap=Math.max(maxOverlap,overlap);}
      }
      assert.ok(connections>0,JSON.stringify({supportIndex,commonColumns,maxSignedOverlap}));
      report.connectionSamples.push({supportIndex,gridColumns:192,overlappingActualColumns:connections,maximumVerticalOverlapM:maxOverlap,
        scope:'Finite shared-column overlap only; not mechanical stability or union mesh'});
    }
    report.summary={rocks:31,changedMeshes:3,unchangedPositionBuffers:28,terrainTriangles:report.rocks.reduce((sum,r)=>sum+r.triangles,0),
      sharedHeightRaySamples:report.heightSamples.length,centralPassageSamples:report.passageSamples.length,
      maximumUpperAnalyticMinusTriangleM:Math.max(...report.heightSamples.map(r=>r.upperAnalyticMinusTriangleM)),
      minimumUpperAnalyticMinusTriangleM:Math.min(...report.heightSamples.map(r=>r.upperAnalyticMinusTriangleM)),
      maximumAbsoluteLowerAnalyticMinusTriangleM:Math.max(...report.heightSamples.map(r=>Math.abs(r.lowerAnalyticMinusTriangleM)))};
    assert.ok(report.summary.maximumUpperAnalyticMinusTriangleM<.04&&report.summary.minimumUpperAnalyticMinusTriangleM>-.04,JSON.stringify(report.summary));
    report.sourceSha256After=await sourceHashes();assert.deepEqual(report.sourceSha256After,sourceSha256);report.passed=true;return report;
  }finally{for(const mesh of meshes)mesh.geometry.dispose();material.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await inspectReefShelfPreview();
  await writeFile(new URL('output/validation/reef-shelf-preview-v1.json',root),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:report.passed,summary:report.summary,connections:report.connectionSamples,passage:report.passageSamples},null,2));
}
