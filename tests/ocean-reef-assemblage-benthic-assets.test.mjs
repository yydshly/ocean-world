import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { oceanReefAssemblageSpeciesById } from '../src/oceanReefAssemblageSpecies.js';
import { isReefAssemblageBenthic, createReefAssemblageBenthic, animateReefAssemblageBenthic,
  disposeReefAssemblageBenthic, reefAssemblageBenthicAssetStats } from '../src/world/OceanReefAssemblageBenthicAssets.js';

const ids=['peacock-flounder','textile-cone','collector-urchin'], tolerance=2e-7;
function vertices(root) {
  root.updateMatrixWorld(true);const result=[];
  root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)result.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});
  return result;
}
function fits(root) {
  const s=oceanReefAssemblageSpeciesById[root.userData.speciesId],e=s.normalizedEnvelope;
  for(const p of vertices(root)) {
    for(const axis of ['x','y','z'])assert.ok(Number.isFinite(p[axis])&&p[axis]>=e[axis][0]-tolerance&&p[axis]<=e[axis][1]+tolerance,
      `${s.id}: actual complete animated ${axis} ${p[axis]} fits shared envelope`);
    assert.ok(Math.hypot(p.x,p.z)<=e.horizontalRadiusUnits+tolerance);
    assert.ok(p.y>=-tolerance,'complete body and appendages remain above true contact plane');
  }
}
function find(root,predicate){let result;root.traverse(o=>{if(predicate(o))result=o;});return result;}
function connected(g) {
  const count=g.getAttribute('position').count,parent=Array.from({length:count},(_,i)=>i);
  const ancestor=i=>parent[i]===i?i:(parent[i]=ancestor(parent[i]));
  const edge=(a,b)=>{parent[ancestor(a)]=ancestor(b);};
  for(let i=0;i<g.index.count;i+=3){edge(g.index.array[i],g.index.array[i+1]);edge(g.index.array[i],g.index.array[i+2]);}
  return new Set(parent.map((_,i)=>ancestor(i))).size===1;
}
function box(mesh){return new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position'));}

test('three new bottom forms preserve distinct anatomy and exact measured axes on their actual unscaled contact references',()=>{
  const before=reefAssemblageBenthicAssetStats(),roots=ids.map(createReefAssemblageBenthic);
  try{
    roots.forEach((root,i)=>{
      const s=oceanReefAssemblageSpeciesById[ids[i]];
      assert.equal(root.userData.scientificName,['Bothus mancus','Conus textile','Tripneustes gratilla'][i]);
      assert.equal(root.userData.sizeMeasure,s.sizeMeasure);assert.equal(root.userData.rootReference,s.support.rootReference);
      assert.equal(root.userData.contactKind,s.support.contactKind);assert.equal(root.userData.forwardAxis,'+X');
      assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);
      assert.deepEqual(root.userData.supportContacts,s.support.footContacts);
    });
    const [flounder,cone,urchin]=roots,skin=find(flounder,o=>o.userData.bodyMeasuredX),shell=find(cone,o=>o.userData.shellMeasuredX),hardTest=find(urchin,o=>o.userData.testMeasuredX);
    for(const mesh of [skin,shell,hardTest]){const b=box(mesh);assert.ok(Math.abs(b.min.x+.5)<tolerance&&Math.abs(b.max.x-.5)<tolerance);}
    const t=box(hardTest);assert.ok(Math.abs(t.min.z+.5)<tolerance&&Math.abs(t.max.z-.5)<tolerance);
    assert.ok(Math.abs(t.max.y-t.min.y-.67)<tolerance,'test height excludes all spines and feet');
    assert.equal(flounder.userData.anatomy.leftEyedFaceUp,true);assert.equal(flounder.userData.anatomy.blindSide,'right');
    assert.equal(flounder.userData.anatomy.groundLegCount,0);assert.equal(flounder.userData.anatomy.realSwimmingImplemented,false);
    assert.equal(flounder.userData.anatomy.realBurialImplemented,false);assert.equal(flounder.userData.anatomy.maleLongPectoralImplemented,false);
    const eyeMesh=find(flounder,o=>o.name.includes('Asymmetric left-side eyes'));assert.ok(box(eyeMesh).max.y>.10);
    assert.equal(shell.userData.longitudinalOpenAperture,true);assert.ok(box(shell).getSize(new THREE.Vector3()).x>box(shell).getSize(new THREE.Vector3()).y*1.5);
    assert.equal(cone.userData.anatomy.shortRetractedProboscis,true);assert.equal(cone.userData.anatomy.longRespiratorySiphon,true);
    assert.equal(cone.userData.anatomy.shellStandingUpright,false);assert.equal(cone.userData.anatomy.venomPreyStrikeImplemented,false);
    assert.equal(urchin.userData.anatomy.shortSpineBands,10);assert.equal(urchin.userData.anatomy.ambulacralTubeFootSectors,5);
    assert.equal(urchin.userData.anatomy.testDiameterExcludesSpines,true);assert.equal(urchin.userData.anatomy.collectedSceneryImplemented,false);
  }finally{roots.forEach(disposeReefAssemblageBenthic);}
  assert.deepEqual(reefAssemblageBenthicAssetStats(),before);
});

test('complete actual geometry fits shared bounds in all finite live display poses and resting or dead states',()=>{
  for(const id of ids){const root=createReefAssemblageBenthic(id);
    try{for(const phase of [0,.8,4.2])for(const clock of [0,.3,1,3.5,8,17,31,63,117]){
      root.userData.phase=phase;animateReefAssemblageBenthic(root,{alive:true,state:'resident-proxy-feeding'},clock);fits(root);}
      for(const agent of [{alive:true,state:'resting'},{alive:false,state:'dead'}]){animateReefAssemblageBenthic(root,agent,117);fits(root);}
    }finally{disposeReefAssemblageBenthic(root);}
  }
});

test('actual blind skin and continuous sole samples or twelve real tube tips stay planted without using spines or mouths as feet',()=>{
  for(const id of ids){const root=createReefAssemblageBenthic(id);
    try{
      const contacts=find(root,o=>o.userData.contactTips),s=oceanReefAssemblageSpeciesById[id],p=contacts.geometry.getAttribute('position');
      assert.equal(s.support.footContacts.length,id==='collector-urchin'?12:6);assert.equal(root.userData.anatomy.groundLegCount,0);
      const raw=Array.from(p.array),matrix=contacts.matrixWorld.elements.slice();
      for(const point of s.support.footContacts){assert.equal(point.y,0);let nearest=Infinity;
        for(let i=0;i<p.count;i++)nearest=Math.min(nearest,Math.hypot(p.getX(i)-point.x,p.getY(i)-point.y,p.getZ(i)-point.z));
        assert.ok(nearest<tolerance,'catalog contact is an actual body-surface or tube-foot mesh vertex');
      }
      if(id!=='collector-urchin'){assert.ok(connected(contacts.geometry));
        assert.equal(contacts.userData.continuousBlindSkin,id==='peacock-flounder'?true:undefined);
        assert.equal(contacts.userData.continuousSole,id==='textile-cone'?true:undefined);
      }else{
        assert.equal(contacts.userData.tubeFootTips,true);assert.ok(s.support.footContacts.every(p=>Math.hypot(p.x,p.z)>.19));
        assert.equal(root.userData.anatomy.spinesAreSupportPoints,false);assert.equal(root.userData.anatomy.mouthIsSupportPoint,false);
        const mouth=find(root,o=>o.userData.mouthNotFoot),spines=find(root,o=>o.userData.spinesNotFeet);
        assert.ok(box(mouth).min.y>.09&&box(spines).min.y>.03,'mouth and downward spines never define planted tube tips');
      }
      for(const clock of [0,2,13,79]){animateReefAssemblageBenthic(root,{alive:true},clock);root.updateMatrixWorld(true);
        assert.deepEqual(contacts.matrixWorld.elements,matrix);assert.deepEqual(Array.from(p.array),raw);}
    }finally{disposeReefAssemblageBenthic(root);}
  }
});

test('all native meshes have finite indexed geometry and lighting normals with natural nonemissive material colours',()=>{
  for(const id of ids){const root=createReefAssemblageBenthic(id);
    try{let meshes=0;const colours=new Set();root.traverse(o=>{if(!o.isMesh)return;meshes++;
      const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),c=o.geometry.getAttribute('color');
      assert.ok(p.count>2&&o.geometry.index.count>2);assert.equal(n.count,p.count);assert.equal(c.count,p.count);
      for(const attr of [p,n,c])assert.ok(Array.from(attr.array).every(Number.isFinite));
      for(const i of o.geometry.index.array)assert.ok(i>=0&&i<p.count);
      for(let i=0;i<c.count;i++){const rgb=[c.getX(i),c.getY(i),c.getZ(i)];assert.ok(rgb.every(v=>v>=0&&v<=1));colours.add(rgb.map(v=>v.toFixed(3)).join(','));}
      assert.equal(o.material.type,'MeshStandardMaterial');assert.equal(o.material.vertexColors,true);assert.equal(o.material.emissive.getHex(),0);
      assert.equal(o.material.map,null);assert.ok(o.material.roughness>.6);
    });assert.ok(meshes>=3&&colours.size>=3);}finally{disposeReefAssemblageBenthic(root);}
  }
});

test('saved native clocks reproduce independent bounded poses without modifying ecology or native root placement',()=>{
  for(const id of ids){const a=createReefAssemblageBenthic(id),b=createReefAssemblageBenthic(id),agent={alive:true,state:'reef-foraging',timeSec:31,
    position:{x:12,y:-3,z:5},velocity:{x:.01,y:0,z:0},energy:.85},saved=structuredClone(agent);
    try{a.userData.phase=b.userData.phase=.76;animateReefAssemblageBenthic(a,agent,agent.timeSec);animateReefAssemblageBenthic(b,agent,agent.timeSec);
      const snapshot=root=>vertices(root).map(p=>p.toArray());assert.deepEqual(snapshot(a),snapshot(b));
      const old=snapshot(b);animateReefAssemblageBenthic(a,agent,57);assert.deepEqual(snapshot(b),old);assert.notDeepEqual(snapshot(a),old);
      assert.deepEqual(agent,saved);assert.deepEqual(a.position.toArray(),[0,0,0]);assert.deepEqual(a.scale.toArray(),[1,1,1]);
      animateReefAssemblageBenthic(a,{alive:true},NaN);fits(a);
    }finally{disposeReefAssemblageBenthic(a);disposeReefAssemblageBenthic(b);}
  }
});

test('strict species identity and attached-root disposal preserve shared sibling resources and release final references once',()=>{
  const before=reefAssemblageBenthicAssetStats();assert.equal(isReefAssemblageBenthic('long-spined-sea-urchin'),false);
  assert.throws(()=>createReefAssemblageBenthic('long-spined-sea-urchin'),/Unknown/);
  assert.throws(()=>createReefAssemblageBenthic({id:'peacock-flounder',scientificName:'Bothus lunatus'}),/Conflicting/);
  assert.deepEqual(reefAssemblageBenthicAssetStats(),before);
  for(const id of ids){const a=createReefAssemblageBenthic(id),b=createReefAssemblageBenthic(id),parent=new THREE.Group();parent.add(a,b);
    const during=reefAssemblageBenthicAssetStats(),unique=new Set();b.traverse(o=>{if(o.isMesh){unique.add(o.geometry);unique.add(o.material);}});
    let disposed=0;unique.forEach(r=>r.addEventListener('dispose',()=>disposed++));
    assert.equal(during.instances,before.instances+2);assert.equal(disposeReefAssemblageBenthic(a),true);assert.equal(disposeReefAssemblageBenthic(a),false);
    assert.equal(a.parent,null);assert.deepEqual(parent.children,[b]);assert.equal(disposed,0);assert.equal(reefAssemblageBenthicAssetStats().resources,during.resources);fits(b);
    assert.equal(disposeReefAssemblageBenthic(b),true);assert.equal(b.parent,null);assert.equal(parent.children.length,0);assert.equal(disposed,unique.size);
    assert.equal(animateReefAssemblageBenthic(b,{alive:true},3),false);assert.deepEqual(reefAssemblageBenthicAssetStats(),before);
  }
});
