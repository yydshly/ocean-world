import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { OCEAN_REEF_DIVERSITY_IDS } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_COMMUNITY_IDS } from '../src/oceanReefCommunitySpecies.js';
import { OCEAN_REEF_LIFE_IDS } from '../src/oceanReefLifeSpecies.js';
import { OCEAN_REEF_FAUNA_IDS } from '../src/oceanReefFaunaSpecies.js';
import { OCEAN_REEF_ASSEMBLAGE_IDS } from '../src/oceanReefAssemblageSpecies.js';
import { oceanShoalLifeSpeciesCatalog } from '../src/oceanShoalLifeSpecies.js';
import { createOceanShoalLifeAsset, animateOceanShoalLifeAsset, disposeOceanShoalLifeAsset,
  oceanShoalLifeAssetStats, OCEAN_SHOAL_LIFE_IDS, OCEAN_SHOAL_LIFE_ENVELOPES } from '../src/world/OceanShoalLifeAssets.js';

// Finite native Three/CPU kits, not measured anatomy, habitat admission,
// current browser images, GPU performance or complete director acceptance.
// The receipt cohort is fixed even when later packages grow the living catalog.
const baselineIds = new Set(['blue-tang', 'butterflyfish', 'green-chromis', 'lined-tang', 'cleaner-wrasse', 'honeycomb-grouper', 'cleaner-shrimp', 'reef-crab', 'black-cucumber', 'blue-starfish', 'top-shell', 'staghorn-coral', 'giant-clam', 'turf-algae', 'lyretail-anthias', 'yellowtail-fusilier', 'reef-manta', 'green-turtle', 'day-octopus', 'spotted-reef-crab', 'tube-sponge', 'reef-squid', 'spotted-jelly', 'biodiversity-massive-coral', 'biodiversity-grape-algae', 'tropical-urchin', 'feather-duster', 'sand-goby', 'reef-parrotfish', 'shallow-anemone', 'clown-anemonefish', 'tiger-cowrie', 'spotted-hermit-crab', 'blue-spotted-ray', 'reef-goatfish', 'sand-edge-seahorse', 'reef-cuttlefish', 'barrel-sea-pen', 'spider-conch']);
const oldCatalog = livingShallowsSpeciesCatalog.filter(s => baselineIds.has(s.id));
const catalog = [...oldCatalog, ...oceanShoalLifeSpeciesCatalog];
const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
const digest = root => { root.updateMatrixWorld(true); const h = createHash('sha256'); for (const m of meshes(root)) {
  for (const [name,a] of Object.entries(m.geometry.attributes).sort()) { h.update(name); h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)); }
  if (m.geometry.index) { const a=m.geometry.index.array; h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)); } h.update(JSON.stringify(m.matrix.toArray()));
} return h.digest('hex'); };
const pose = root => { root.updateMatrixWorld(true); const out=[]; root.traverse(o=>out.push(o.matrix.toArray())); return out; };
const agents = () => oceanShoalLifeSpeciesCatalog.map((s,i)=>({ id:`shoal:${s.id}`,speciesId:s.id,regionId:'188,14',alive:true,sizeM:s.lengthM,
  position:{x:12064+i*2,y:2,z:928},velocity:{x:.12,y:.008,z:.01},heading:.35,pitch:.07,timeSec:8.2,
  state:'schooling',lastFeedAt:8,groupId:s.id==='blacktip-reef-shark'?null:`group:${s.id}` }));

test('all 39 previous shallow geometry and animation receipts remain exact alongside new real individuals',t=>{
  // Captured before this package changed OceanAnimals. Keep this first: the
  // unchanged original coral selects serial % 4 in fresh construction order.
  const expected = {
    'blue-tang': '9468da981ff5bfd4b930a805ab443a61092fbbe18dddd818258a721adc1e48ed',
    'butterflyfish': '5986d2198078a928c9b37024e0c198b8d539ae8b9bfc308e38c5ab0841af649e',
    'green-chromis': '5e4fe1616ba8e27bf596668826841a43876ab10e5cd4c841658b8ed8c55fbf24',
    'lined-tang': 'f0ceb97083d8dfeb0d1d9f3e60d101afec235fbe9642037ae83bd762fd133b54',
    'cleaner-wrasse': 'ad3408f30f7faff24668e1021ef207282e805d6db5d8dff7174634c376913d8b',
    'honeycomb-grouper': '4e9520996c41796f02a6098d51d5b86802efd9c250de158fba1cf9ccbcfd4a93',
    'cleaner-shrimp': '8470e1e63d1e0df710f6b60bae0ec3269b96623fca0da1871546effa2c5fb5e4',
    'reef-crab': 'f42c61696f5315d507fff5c45650489b89d872c532f47623de1707273eeb4292',
    'black-cucumber': '7f35b1abc006ed672b85e058f94e81ce0fdd10f48a70bd05931bb7d36d284edb',
    'blue-starfish': 'bc855d8a0c65755bfeb11ca4375d87cf41811ee3a0890e095b710efc8eacf2d9',
    'top-shell': 'c60bfdbaf91e0908c90c56adf2f8ff7eb1d226218bafaf78eeb9190ef30390c4',
    'staghorn-coral': '3d50789abb0dd6aefcf58c7414e9b0bd4facb596e34c202c867e1964af3b8997',
    'giant-clam': 'b50b01a8058b6e33b9df79e6ddb64ce93904fbafcd1e3b2e3cbca448e923fb4a',
    'turf-algae': 'ff00248c633c1f6ec008dc16b822de91cffce9641e3c318f39c4e694f12c3e8d',
    'lyretail-anthias': '7283e080a94d713ccfde4cda85cf45a8cb405221f61f5fdfbab4029448fcde96',
    'yellowtail-fusilier': 'eaabcf60f1a5b872053c3998c4a5ab871c8969f1dc5a6d7e0f4b0a8661f422f7',
    'reef-manta': 'ad5a61408455fe71060369c75230a93868df16b8f2bc225dc8c865d4bf2aa927',
    'green-turtle': 'd913294b8ac2291033294e9bb267ac63f1ddf2794b16abd3cbc7342315b5e6f0',
    'day-octopus': 'ee32a4501cf11d51e61d30678637247a86792c321f1d583d72afbe2befbe6b6e',
    'spotted-reef-crab': '63fb1c4e428c79ceb79b37320b6cdc2541e9e731fd4c596886cb595ce3220075',
    'tube-sponge': 'b8bf027ac877ed767d250d745ea0495f1a1fd38a68e3e06dc21c0d45c87f86d5',
    'reef-squid': '86611ad72ec0a199316244165730a2e927abe6ca557ed2a4e5becf902aabb37d',
    'spotted-jelly': '3c1f1d0c51f141db1747e8cac7138e72c533d41cc6a816693bb2e68a9131524a',
    'biodiversity-massive-coral': '904567ad43279a85df2a088e37e96bb3319762d301c094d906413c93e2785772',
    'biodiversity-grape-algae': 'e806fef65317d4ea9f9617f5b9382942eff981747a0857638e8d55e1842425d9',
    'tropical-urchin': 'da9931305d77a40cd7df0c0e330d08a350f1fcf64f47f0bc5c369db86c7d9780',
    'feather-duster': 'c22433817adc653372ec6295be3926d3ec952fc0ab2ea5a3ae003746af44ec4d',
    'sand-goby': '31b425f39a8e4c1e3abda95649c3d9111db6e0edb6f447a7d580685412749497',
    'reef-parrotfish': '3c95bd1e854f6113da67e33ea24bcd5a0b38c1c5094061d68544658c31a5aaa0',
    'shallow-anemone': '7689c4558eee4a601a83358d899b6c2d4810b5b4b6aa42e51c1ba7e1788847af',
    'clown-anemonefish': '873f104ffa0d8290df44f34676431855a3e674c9dea8ee5becc4656885379a24',
    'tiger-cowrie': 'df82a6c148277141bd0208c10e475e9369a79b4ae1e3e7c42998882222ac34f3',
    'spotted-hermit-crab': '9df3069af95e493c3eaa3b79314b2edb44a3afafc7187b9669f564b7194430bf',
    'blue-spotted-ray': 'e931efd87699b72c21f322ba23c5052f4890b07ea39045be98bf87324d2dd238',
    'reef-goatfish': '4e85fec6d4170e6ac17d754557c9ebff9587d61d85a7e320ebe305da090bdd1e',
    'sand-edge-seahorse': '11f35c62de14a6e42c35640c5bfbd0b70bfe37a3e88ceabfd0296f67e8ce70e2',
    'reef-cuttlefish': '391fb1a702d2b74ca911c499ee4a51e31ce3df2c082bd91b789d2b977626dcdc',
    'barrel-sea-pen': '66f71260585690cc8732b9ea6791242293cd27ebb07a042577a5df1ac821872a',
    'spider-conch': '72b71aebf7dd0e3721c710171e4497615fb62dd0bf85fe7e5dd7f1a55ae3ca83',
  };
  assert.equal(oldCatalog.length,39); assert.deepEqual(oldCatalog.map(s=>s.id).sort(),Object.keys(expected).sort());
  const animals=new OceanAnimals(catalog);t.after(()=>animals.dispose());
  const rows=oldCatalog.map((s,i)=>({id:`baseline:${s.id}`,speciesId:s.id,regionId:'188,14',alive:true,sizeM:s.lengthM,
    position:{x:12064+i*2,y:-5.2,z:928},velocity:{x:.05,y:.01,z:0},heading:.35,pitch:0,timeSec:8.2,state:'foraging',lastFeedAt:8}));
  const before=structuredClone(rows);animals.update([...rows,...agents()],999,{x:12032,z:896});
  for(const row of rows)assert.equal(digest(animals.getObject(row.id)),expected[row.speciesId],row.speciesId);
  const objects=rows.map(row=>animals.getObject(row.id));animals.update(rows,999999,{x:12096,z:960});
  assert.deepEqual(rows.map(row=>animals.getObject(row.id)),objects);assert.deepEqual(rows,before);
  for(const row of rows)assert.equal(digest(animals.getObject(row.id)),expected[row.speciesId],`${row.speciesId} unchanged clock/output`);
});

test('four distinct whole bodies preserve total-length semantics and complete state/size bounds without emission',t=>{
  const kits=oceanShoalLifeSpeciesCatalog.map(createOceanShoalLifeAsset),hashes=new Set();
  t.after(()=>kits.forEach(k=>disposeOceanShoalLifeAsset(k.group)));
  assert.deepEqual(oceanShoalLifeSpeciesCatalog.map(s=>s.id),OCEAN_SHOAL_LIFE_IDS);
  for(const[i,k]of kits.entries()){
    const s=oceanShoalLifeSpeciesCatalog[i],e=OCEAN_SHOAL_LIFE_ENVELOPES[s.id],root=k.group;
    assert.equal(root.userData.speciesId,s.id);assert.equal(root.userData.sizeMeasure,'total-length');
    assert.deepEqual([e.localBounds.minX,e.localBounds.maxX],s.normalizedEnvelope.x);
    assert.deepEqual([e.minY,e.maxY],s.normalizedEnvelope.y);assert.equal(e.horizontalRadius,s.normalizedEnvelope.horizontalRadiusUnits);assert.equal(e.pitchLimit,.12);
    assert.equal(root.userData.measureReferences.neutralTotalLength,1);
    const neutral=new THREE.Box3().setFromObject(root);assert.ok(Math.abs(neutral.max.x-neutral.min.x-1)<1e-6,`${s.id} whole nose-to-tail TL`);
    const triangles=meshes(root).reduce((sum,m)=>sum+m.geometry.index.count/3,0);assert.ok(triangles>300&&triangles<4000);
    assert.equal(meshes(root).length,5);hashes.add(digest(root));root.traverse(o=>assert.ok(!o.isLight));
    for(const m of meshes(root)){assert.ok(m.material.isMeshStandardMaterial);assert.equal(m.material.emissive.getHex(),0);assert.equal(m.material.emissiveIntensity,0);
      for(const a of Object.values(m.geometry.attributes))assert.ok([...a.array].every(Number.isFinite));}
    for(const state of ['resting','schooling','searching','blocked','fleeing'])for(let frame=0;frame<24;frame++){
      const time=frame*.41,agent={state,velocity:{x:['resting','blocked'].includes(state)?0:.12,y:0,z:0}};
      const before=structuredClone(agent);animateOceanShoalLifeAsset(root,time,agent);assert.deepEqual(agent,before);
      root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(root);
      assert.ok(b.min.x>=e.localBounds.minX-1e-6&&b.max.x<=e.localBounds.maxX+1e-6&&b.min.y>=e.minY-1e-6&&b.max.y<=e.maxY+1e-6&&b.min.z>=e.localBounds.minZ-1e-6&&b.max.z<=e.localBounds.maxZ+1e-6,`${s.id} full moving appendages`);
      for(const m of meshes(root)){const p=m.geometry.attributes.position;for(let v=0;v<p.count;v++){
        const q=new THREE.Vector3().fromBufferAttribute(p,v).applyMatrix4(m.matrixWorld);
        assert.ok(Math.hypot(q.x,q.z)<=e.horizontalRadius+1e-6,`${s.id} conservative horizontal body radius`);
      }}
      for(const size of s.sizeRangeM){root.scale.setScalar(size);root.updateMatrixWorld(true);const measured=new THREE.Box3().setFromObject(root);
        assert.ok(measured.max.y<=e.maxY*size+1e-6&&measured.min.y>=e.minY*size-1e-6);}
      root.scale.setScalar(1);
    }
  }
  assert.equal(hashes.size,4);
  assert.equal(kits[2].parts.body.material.transparent,false);assert.equal(kits[2].parts.tail.children[0].material.transparent,true);
  const fish=kits[0].group.userData.anatomy,jack=kits[1].group.userData.anatomy,herring=kits[2].group.userData.anatomy,shark=kits[3].group.userData.anatomy;
  assert.equal(fish.bodyForm,'slender-blue-and-gold');assert.equal(jack.bodyForm,'laterally-compressed-high-body');assert.equal(herring.bodyForm,'very-slender-silver-band');
  assert.equal(shark.gillSlitsPerSide,5);assert.equal(shark.dorsalFins,2);assert.equal(shark.pectoralFins,2);assert.equal(shark.pelvicFins,2);assert.equal(shark.analFins,1);assert.equal(shark.tail,'heterocercal-upper-lobe-longer');
  const bodyBox=k=>{k.parts.body.geometry.computeBoundingBox();return k.parts.body.geometry.boundingBox;};
  assert.ok(bodyBox(kits[1]).max.y>bodyBox(kits[0]).max.y*1.5);assert.ok(bodyBox(kits[2]).max.y<bodyBox(kits[0]).max.y*.55);
  const sharkTail=new THREE.Box3().setFromObject(kits[3].parts.tail);assert.ok(sharkTail.max.y>Math.abs(sharkTail.min.y)*1.5);
});

test('native dispatcher renders one object per real record, preserves clock/pitch/origin/picking and cannot mutate agents',t=>{
  const animals=new OceanAnimals(catalog);t.after(()=>animals.dispose());const rows=agents(),before=structuredClone(rows),origin={x:12032,z:896};
  animals.update(rows,999999,origin);assert.equal(animals.entities.size,4);assert.equal(animals.pickableObjects.length,4);
  for(const row of rows){
    const object=animals.getObject(row.id);assert.ok(object);assert.equal(object.userData.agentId,row.id);assert.equal(object.userData.regionId,row.regionId);
    assert.equal(object.userData.shoalLifeLastTimeSec,row.timeSec);assert.equal(object.scale.x,row.sizeM);
    assert.deepEqual(object.position.toArray(),[row.position.x,row.position.y,row.position.z]);
    const p=object.getWorldPosition(new THREE.Vector3());assert.ok(p.distanceTo(new THREE.Vector3(row.position.x-origin.x,row.position.y,row.position.z-origin.z))<1e-8);
    const forward=new THREE.Vector3(1,0,0).applyQuaternion(object.quaternion),expected=new THREE.Vector3(Math.cos(row.heading)*Math.cos(row.pitch),Math.sin(row.pitch),Math.sin(row.heading)*Math.cos(row.pitch));
    assert.ok(forward.distanceTo(expected)<1e-8,'explicit ±.12 native pitch rather than inferred generic fish pitch');
    meshes(object).forEach(m=>{let cursor=m;while(cursor&&!cursor.userData.agentId)cursor=cursor.parent;assert.equal(cursor?.userData.agentId,row.id);});
  }
  const poses=rows.map(r=>pose(animals.getObject(r.id)));animals.update(rows,11111111,origin);assert.deepEqual(rows.map(r=>pose(animals.getObject(r.id))),poses);assert.deepEqual(rows,before);
  const ray=new THREE.Raycaster(new THREE.Vector3(rows[0].position.x-origin.x,rows[0].position.y+1,rows[0].position.z-origin.z),new THREE.Vector3(0,-1,0));
  animals.root.updateMatrixWorld(true);assert.ok(ray.intersectObjects(animals.pickableObjects,true).length>0);
  animals.update(rows,0,{x:12096,z:960});assert.deepEqual(rows,before);assert.deepEqual(animals.stats.speciesCounts,Object.fromEntries(rows.map(r=>[r.speciesId,1])));
  animals.update(rows.map(r=>({...r,alive:false})),100);assert.equal(animals.entities.size,0);assert.equal(animals.pickableObjects.length,0);
});

test('shared bounded resources survive replacement/revisit and release once after the last actual individual',t=>{
  assert.deepEqual(oceanShoalLifeAssetStats(),{resources:0,instances:0});const animals=new OceanAnimals(catalog);t.after(()=>animals.dispose());
  const rows=agents();animals.update(rows,0);const first=rows.map(r=>animals.getObject(r.id));assert.deepEqual(oceanShoalLifeAssetStats(),{resources:18,instances:4});
  const replacement=rows.map(r=>({...r,id:r.id+':new'}));animals.update([...rows,...replacement],0);
  assert.deepEqual(oceanShoalLifeAssetStats(),{resources:18,instances:8});
  for(let i=0;i<4;i++)assert.equal(meshes(first[i])[0].geometry,meshes(animals.getObject(replacement[i].id))[0].geometry);
  let disposed=0;const geometry=new Set(),material=new Set();for(const object of first)for(const m of meshes(object)){geometry.add(m.geometry);material.add(m.material);}
  for(const value of [...geometry,...material])value.addEventListener('dispose',()=>disposed++);
  animals.update(replacement,0);assert.equal(disposed,0);animals.update([],0);assert.equal(disposed,18);assert.deepEqual(oceanShoalLifeAssetStats(),{resources:0,instances:0});
  animals.update(rows,0);assert.equal(oceanShoalLifeAssetStats().instances,4);animals.reset();assert.deepEqual(oceanShoalLifeAssetStats(),{resources:0,instances:0});
  animals.dispose();animals.dispose();assert.equal(disposed,18);assert.equal(animals.update(rows,0),false);
  for(const object of first)disposeOceanShoalLifeAsset(object);assert.equal(disposed,18);
});

test('native local fin clocks freeze on repeated time and death while resting uses actual zero motion',t=>{
  const kits=oceanShoalLifeSpeciesCatalog.map(createOceanShoalLifeAsset);t.after(()=>kits.forEach(k=>disposeOceanShoalLifeAsset(k.group)));
  for(const k of kits){
    const agent={alive:true,velocity:{x:.1,y:0,z:0},state:'schooling',timeSec:8.2},before=structuredClone(agent);
    k.group.userData.phase=.47;const rootPose=[k.group.position.clone(),k.group.quaternion.clone()];
    animateOceanShoalLifeAsset(k.group,8.2,agent);const moving=pose(k.group);animateOceanShoalLifeAsset(k.group,8.2,agent);assert.deepEqual(pose(k.group),moving);
    animateOceanShoalLifeAsset(k.group,9000,{...agent,alive:false,timeSec:8.2});assert.deepEqual(pose(k.group),moving);
    animateOceanShoalLifeAsset(k.group,8.3,{...agent,state:'blocked',velocity:{x:0,y:0,z:0}});assert.equal(k.parts.tail.rotation.y,0);
    assert.ok(k.parts.pectoralFins.every(fin=>fin.rotation.x===0));assert.ok(k.group.position.equals(rootPose[0]));assert.ok(k.group.quaternion.equals(rootPose[1]));assert.deepEqual(agent,before);
  }
});
