import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createReefLandscapeCoral, updateReefLandscapeDetail, reefLandscapeLevelAt, disposeReefLandscapeCoral } from '../../src/world/reefLandscapeDetail.js';
import { enableStaticRayQueries } from '../../src/world/reefSpatialQueries.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const paths=['src/world/ReefWorld.js','src/world/reefLandscapeDetail.js','src/world/organisms.js','src/world/reefSpatialQueries.js'];
const sources=Object.fromEntries(paths.map(p=>[p,readFileSync(new URL('../../'+p,import.meta.url))]));
const source=sources['src/world/ReefWorld.js'].toString('utf8'),start=source.indexOf('  focusUp('),end=source.indexOf('  applyFocus(',start);
assert.ok(start>=0&&end>start);
// Evaluate the actual current method text without the World constructor, Vite
// import.meta.env, habitat, a DOM, a renderer, or any mutable terrain fixtures.
const methods=source.slice(start,end);
const FocusFixture=new Function('THREE','clamp','reefLandscapeLevelAt','return class FocusFixture {'+methods+'}')(THREE,THREE.MathUtils.clamp,reefLandscapeLevelAt);
function fixture(root){
  const w=new FocusFixture();const decorations=new THREE.Group();decorations.add(root);decorations.updateMatrixWorld(true);enableStaticRayQueries(root);
  Object.assign(w,{reefMesh:null,decorations,reefScanAsset:null,entities:new Map(),catalog:new Map([['probe-crab',{kind:'crab'}]]),isDeep:false,isKelp:false,
    controls:{minPolarAngle:Math.PI*.15,maxPolarAngle:Math.PI*.55},camera:{position:new THREE.Vector3(3,3.6,5)}});
  // This fixture covers authored scenery only; no regional animals are loaded.
  w.findAgent=()=>null;
  w.clearCameraPosition=p=>p;return w;
}
function mesh(root){const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});assert.equal(out.length,1);return out[0];}
function flags(root){const d=root.userData.landscapeDetail;return{level:d.level,nearVisible:d.near.visible,farVisible:d.far.visible,rootVisible:root.visible};}
function buffers(root){const h=createHash('sha256');root.traverse(o=>{if(o.geometry){for(const a of Object.values(o.geometry.attributes))h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));h.update(Buffer.from(o.geometry.index.array.buffer));}});return h.digest('hex');}
function owned(root){const d=root.userData.landscapeDetail;return{low:[...root.userData.resources].sort(),medium:[...d.near.userData.resources].sort()};}
function fiveRays(w,agent,assessment){
  const view=assessment.target.clone().sub(assessment.position).normalize(),right=new THREE.Vector3().crossVectors(view,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,view).normalize(),radius=agent.sizeM*.16;
  const points=[assessment.target,assessment.target.clone().addScaledVector(right,radius),assessment.target.clone().addScaledVector(right,-radius),
    assessment.target.clone().addScaledVector(up,radius*.6),assessment.target.clone().addScaledVector(up,-radius*.4)];
  const obstacles=w.focusObstacles(agent.id),ray=new THREE.Raycaster();ray.firstHitOnly=true;
  return points.map(target=>{const delta=target.clone().sub(assessment.position),length=delta.length();ray.set(assessment.position,delta.multiplyScalar(1/length));ray.near=.003;ray.far=Math.max(.003,length-.001);const hits=ray.intersectObjects(obstacles,false);return{visible:hits.length===0,hitCount:hits.length,firstHitDistanceM:hits[0]?.distance??null};});
}
function moveLine(root,from,to){for(let step=0;step<=128;step++)updateReefLandscapeDetail(root,from.clone().lerp(to,step/128));}
export function inspectReefLandscapeFocusV1(){
  const rows=[];
  for(const morphotype of ['branching','table'])for(let variant=0;variant<4;variant++){
    const root=createReefLandscapeCoral(morphotype,undefined,variant),w=fixture(root),d=root.userData.landscapeDetail,low=mesh(d.far),medium=mesh(d.near),beforeBuffers=buffers(root),beforeOwned=owned(root);
    try{
      const center=root.getWorldPosition(new THREE.Vector3()),diameter=d.diameterLocalM,nearPosition=center.clone(),farPosition=center.clone().add(new THREE.Vector3(diameter*3.1,0,0));
      const originalFlags=flags(root);assert.deepEqual(w.focusObstacles(null),[low]);assert.deepEqual(w.focusObstacles(null,nearPosition),[medium]);assert.deepEqual(flags(root),originalFlags,'Candidate selection must not mutate real visibility');
      medium.visible=false;assert.equal(w.focusObstacles(null,nearPosition).length,0,'Only the selected LOD parent may ignore visibility; hidden mesh children stay hidden');medium.visible=true;
      root.visible=false;assert.equal(w.focusObstacles(null,nearPosition).length,0,'A hidden colony ancestor remains excluded');root.visible=true;
      w.decorations.visible=false;assert.equal(w.focusObstacles(null,nearPosition).length,0,'A hidden decoration ancestor remains excluded');w.decorations.visible=true;
      updateReefLandscapeDetail(root,nearPosition);assert.deepEqual(w.focusObstacles(null),[medium]);assert.deepEqual(w.focusObstacles(null,farPosition),[low]);
      const lineCases=[];
      for(const scenario of [
        {id:'cross-near-and-finish-in-band',from:-4,to:2.6,expected:'near'},
        {id:'same-side-band-without-crossing-near',from:4,to:2.6,expected:'far'},
        {id:'finish-beyond-far-threshold',from:-4,to:3.1,expected:'far'},
      ]){
        const from=center.clone().add(new THREE.Vector3(diameter*scenario.from,0,0)),to=center.clone().add(new THREE.Vector3(diameter*scenario.to,0,0));
        updateReefLandscapeDetail(root,from);const f=flags(root),predicted=reefLandscapeLevelAt(root,to,from);assert.deepEqual(flags(root),f);assert.equal(predicted,scenario.expected);moveLine(root,from,to);assert.equal(d.level,predicted);
        lineCases.push({scenario:scenario.id,predicted,actualFinalLevel:d.level});
      }
      updateReefLandscapeDetail(root,w.camera.position);
      let ghostCheck=null,counterexample=null;
      if(morphotype==='branching'&&variant===0){
        const ray=new THREE.Raycaster(new THREE.Vector3(-.2688,1,.0576),new THREE.Vector3(0,-1,0),0,1.2);ray.firstHitOnly=true;
        const filtered=ray.intersectObjects(w.focusObstacles(null),false),hidden=ray.intersectObject(medium,false),naive=ray.intersectObject(root,true);
        assert.equal(filtered.length,0);assert.ok(hidden.length>0&&naive.length>0);
        ghostCheck={origin:ray.ray.origin.toArray(),filteredVisibleLowHits:filtered.length,hiddenMediumHits:hidden.length,unfilteredRecursiveHits:naive.length};
        // Replay the original current-LOD obstacle policy with the current
        // null-candidate collector. No original full source snapshot exists.
        const agent={id:'probe-agent',speciesId:'probe-crab',sizeM:.05,position:{x:-.24,y:.115,z:-.2}},legacy=new FocusFixture();
        Object.assign(legacy,w);const collector=legacy.focusObstacles;
        legacy.focusObstacles=function(excludedId){return collector.call(this,excludedId,null);};
        const old=legacy.assessFocus(agent);assert.equal(old.centerVisible,true);assert.equal(old.visibleSamples,5);
        moveLine(root,legacy.camera.position,old.position);const originalPolicyActual=fiveRays(w,agent,old);assert.equal(originalPolicyActual[0].visible,false);
        updateReefLandscapeDetail(root,w.camera.position);const stateBefore=flags(root),fixed=w.assessFocus(agent);assert.deepEqual(flags(root),stateBefore);
        const predictedMeshes=w.focusObstacles(agent.id,fixed.position);assert.equal(fixed.obstacleMeshes,predictedMeshes.length);
        moveLine(root,w.camera.position,fixed.position);const selectedActualMeshes=w.focusObstacles(agent.id);assert.deepEqual(selectedActualMeshes,predictedMeshes);
        const actual=fiveRays(w,agent,fixed);assert.equal(fixed.centerVisible,actual[0].visible);assert.equal(fixed.visibleSamples,actual.filter(r=>r.visible).length);
        counterexample={agent:{...agent,position:{...agent.position}},originalCurrentLodPolicyReplay:{position:old.position.toArray(),target:old.target.toArray(),predictedCenterVisible:old.centerVisible,predictedVisibleSamples:old.visibleSamples,actualAfterLinearApproach:originalPolicyActual},
          fixed:{position:fixed.position.toArray(),target:fixed.target.toArray(),centerVisible:fixed.centerVisible,visibleSamples:fixed.visibleSamples,obstacleMeshes:fixed.obstacleMeshes,finalLevel:d.level,actualAfterLinearApproach:actual},
          previousOriginalWorldSha256Observed:'46461643841767edadeb5b7ff90bd4c55affd1f5f86cf8d993561fc9dd6c9097',originalFullSourceSnapshotRetained:false,
          originalEvidenceScope:'Original method execution in this review observed erroneous 5/5; here the behavior is replayed using current focusObstacles(excludedId, null), not a claimed original source snapshot.'};
      }
      assert.equal(buffers(root),beforeBuffers);assert.deepEqual(owned(root),beforeOwned);
      rows.push({morphotype,variant,lineCases,actualVisibilityStateChecksPassed:true,selectedParentOnlyIgnoresVisibility:true,hiddenAncestorsAndMeshChildrenExcluded:true,buffersAndOwnerReferencesUnchanged:true,ghostCheck,counterexample});
    }finally{disposeReefLandscapeCoral(root);}
  }
  const sourceSha256=Object.fromEntries(paths.map(p=>[p,hash(sources[p])]));
  for(const p of paths)assert.equal(hash(readFileSync(new URL('../../'+p,import.meta.url))),sourceSha256[p],'Reviewed source changed while fixture ran: '+p);
  return{schema:'reef-landscape-focus-v1',status:'passed',sourceSha256,focusMethodTextSha256:hash(methods),rows,
    scope:'CPU actual preallocated landscape geometry and current World focus method text evaluated in a constructor-free fixture; terrain clearance is identity and the probe is a synthetic crab target, not a captured ecological individual.',
    limits:['No browser, GPU renderer, real scene placement, full World construction or actual visual-quality pass.','The prediction is checked against sampled straight camera paths; nonlinear terrain push, orbit damping and moving targets require separate browser evidence.','The original complete World source was not retained; old current-LOD behavior is explicitly replayed, not identified as a saved historical source module.','Hidden LOD buffers remain allocated/prewarmed; this test establishes selection/geometry ownership invariants, not JavaScript heap or GPU memory stability.']};
}
