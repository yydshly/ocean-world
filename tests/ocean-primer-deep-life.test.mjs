import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { deepSpeciesCatalog } from '../src/deepSpecies.js';
import { deepMidwaterLifeSpeciesCatalog } from '../src/deepMidwaterLifeSpecies.js';
import { DeepSimulation } from '../src/deepSimulation.js';
import { createOceanPrimerDeepLife, animateOceanPrimerDeepLife, disposeOceanPrimerDeepLife, OCEAN_PRIMER_DEEP_LIFE_IDS } from '../src/world/OceanPrimerDeepLife.js';
import { createOceanPrimerDeep } from '../src/world/OceanPrimerDeep.js';

const catalog=[...deepSpeciesCatalog,...deepMidwaterLifeSpeciesCatalog].filter(s=>OCEAN_PRIMER_DEEP_LIFE_IDS.includes(s.id));
const sha=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const close=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('all five independent whole kits retain original taxonomy, measured axes, complete anatomy and finite bounded resources',t=>{
  const roots=catalog.map(s=>createOceanPrimerDeepLife(s,{id:`whole:${s.id}`}));t.after(()=>roots.forEach(disposeOceanPrimerDeepLife));
  assert.deepEqual(new Set(roots.map(r=>r.userData.speciesId)),new Set(OCEAN_PRIMER_DEEP_LIFE_IDS));
  let vertices=0;
  for(const [i,root]of roots.entries()){
    const s=catalog[i];assert.equal(root.userData.identityLevel,s.identityLevel);assert.equal(root.userData.scientificName,s.scientificName);
    assert.equal(root.userData.sizeMeasure,s.displaySizeM.measure);assert.deepEqual(root.userData.displaySizeRangeM,s.displaySizeM.range);
    assert.match(root.userData.source,/^https:/);assert.equal(root.userData.assetVersion,2);
    root.traverse(mesh=>{if(!mesh.isMesh)return;assert.ok(mesh.castShadow&&mesh.receiveShadow);assert.ok(mesh.customDepthMaterial);
      const p=mesh.geometry.attributes.position;vertices+=p.count;
      for(let v=0;v<p.count;v++)for(const key of['getX','getY','getZ'])assert.ok(Number.isFinite(p[key](v)));
      for(const attr of['lifePart','lifeAlong','lifeOffset','lifeFoot'])assert.equal(mesh.geometry.attributes[attr].count,p.count);
      assert.ok(mesh.material.isMeshPhysicalMaterial);assert.equal(mesh.material.emissiveIntensity,0);
      assert.ok(mesh.material.map?.isDataTexture);assert.ok(mesh.material.transmission<=.07);
    });
  }
  assert.ok(vertices<80000,'whole five-kit prototypes stay finite without CPU detail trees');
  const byId=new Map(roots.map(r=>[r.userData.speciesId,r]));
  assert.equal(byId.get('helmet-jelly').userData.anatomy.marginTentacles,12);
  assert.equal(byId.get('helmet-jelly').userData.anatomy.longOralArms,0);
  assert.equal(byId.get('vampire-squid').userData.anatomy.arms,8);
  assert.equal(byId.get('vampire-squid').userData.anatomy.retractileFilaments,2);
  assert.equal(byId.get('vampire-squid').userData.anatomy.extendedFilaments,1);
  assert.equal(byId.get('sea-pig-group').userData.anatomy.stiltFeet,12);
  assert.equal(byId.get('pom-pom-anemone').userData.anatomy.hardSpines,0);
  for(const id of['sea-pig-group','rattail-family']){
    const root=byId.get(id),body=root.children[0];body.geometry.computeBoundingBox();
    close(body.geometry.boundingBox.max.x-body.geometry.boundingBox.min.x,1);
  }
  assert.throws(()=>createOceanPrimerDeepLife({...catalog[0],identityLevel:'species',scientificName:'Invented named species'}),TypeError);
});

test('native feed cues and twelve supplied foot contacts advance and rewind without modifying native data or mesh vertices',t=>{
  const sim=new DeepSimulation(55),pig=sim.agents.find(a=>a.speciesId==='sea-pig-group'),before=structuredClone(pig);
  const root=createOceanPrimerDeepLife(deepSpeciesCatalog.find(s=>s.id===pig.speciesId),pig);t.after(()=>disposeOceanPrimerDeepLife(root));
  const geometryHashes=root.children.map(mesh=>sha(mesh.geometry.attributes.position.array));
  const observed={...pig,lastFeedAt:10,contactPointsLocal:pig.contactPointsLocal.map((p,i)=>({...p,y:i*.001}))};
  animateOceanPrimerDeepLife(root,12.5,observed);close(root.userData.primerUniforms.lifeFeed.value,1);
  assert.deepEqual(root.userData.primerUniforms.lifeContactsY.value,observed.contactPointsLocal.map(p=>p.y));
  animateOceanPrimerDeepLife(root,9,observed);assert.equal(root.userData.primerUniforms.lifeFeed.value,0);
  animateOceanPrimerDeepLife(root,12.5,{...observed,lastFeedAt:null});assert.equal(root.userData.primerUniforms.lifeFeed.value,0,'no invented feeding without native timestamp');
  assert.deepEqual(pig,before);assert.deepEqual(root.children.map(mesh=>sha(mesh.geometry.attributes.position.array)),geometryHashes);
  for(const mesh of root.children){
    const shader={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\n}'};
    mesh.material.onBeforeCompile(shader);assert.equal(shader.uniforms.lifeContactsY,root.userData.primerUniforms.lifeContactsY);
    assert.match(shader.vertexShader,/uniform float lifeContactsY\[12\]/);assert.match(shader.vertexShader,/lifeContactsY\[foot\] \* lifeAlong/);
    const depth={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\n}'};
    mesh.customDepthMaterial.onBeforeCompile(depth);assert.equal(depth.vertexShader,shader.vertexShader,'actual depth shadow uses the same foot and soft-pose transform');
  }
});

test('functional diversity replaces repeated individuals while the native model and display proxies remain separate',t=>{
  const scene=new THREE.Scene(),chapter=createOceanPrimerDeep(scene,{seed:55});t.after(()=>chapter.dispose());chapter.update(50);
  const d=chapter.diagnostics();assert.equal(d.representativeAnimalCount,15);assert.equal(d.nativeLocalModel.population,10);
  assert.deepEqual(d.nativeLocalModel.speciesCounts,{'sea-pig-group':4,'rattail-family':3,'pom-pom-anemone':3});
  assert.equal(d.originalWholeLifeKits,5);assert.equal(d.functionalExtraClasses,3);assert.equal(d.extraGuilds.length,3);
  assert.equal(d.visibleCountIsScreenCensus,false);assert.equal(d.researchOwnersConnected,0);assert.equal(d.noPersistence,true);
  assert.equal(d.contactShadows,true);assert.match(d.authoredTracesRole,/not-native-history-or-feeding/);
  const extras=d.animals.filter(a=>a.id.includes('functional-'));assert.equal(extras.length,3);
  assert.ok(extras.every(a=>a.state==='functional-display-proxy-no-native-feeding'));
  const snow=chapter.root.getObjectByName('Slowly falling observer-lit marine snow');
  const sizes=snow.geometry.attributes.snowSize.array;assert.ok(Math.max(...sizes)-Math.min(...sizes)>.8);
  assert.equal(snow.userData.volumeRole,'bounded-camera-local-size-and-distance-varied-scattering-proxy');
  const camera=new THREE.PerspectiveCamera(50,1,.05,100);camera.position.set(1,-8,2);camera.lookAt(.2,-10,-.5);camera.updateMatrixWorld(true);
  chapter.update(50,camera,415);const lamp=chapter.root.getObjectByName('Observation vehicle forward lamp');
  assert.deepEqual(lamp.position.toArray(),camera.position.toArray(),'observation lamps follow the actual bridged/free camera');
});

test('new kit materials, depth materials, maps and geometry release once and preserve an unrelated kit',t=>{
  const species=deepSpeciesCatalog.find(s=>s.id==='pom-pom-anemone'),first=createOceanPrimerDeepLife(species),second=createOceanPrimerDeepLife(species);
  t.after(()=>disposeOceanPrimerDeepLife(second));const resources=[...first.userData.primerOwned],counts=new Map(resources.map(r=>[r,0]));
  resources.forEach(r=>r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1)));
  disposeOceanPrimerDeepLife(first);disposeOceanPrimerDeepLife(first);assert.ok([...counts.values()].every(n=>n===1));
  assert.equal(first.children.length,0);assert.equal(first.userData.primerOwned.size,0);
  assert.equal(second.userData.disposed,false);assert.ok(second.children.length>0);
  animateOceanPrimerDeepLife(second,17);assert.equal(second.userData.primerUniforms.lifeTime.value,17);
});

test('provenance identifies original ownership, source-based measurements and time-compressed teaching limits',()=>{
  const p=JSON.parse(readFileSync(new URL('../assets/ocean-primer/deep-life/provenance.json',import.meta.url),'utf8'));
  assert.equal(p.core.length,5);assert.equal(p.functionalAdditions.length,3);assert.equal(p.budget.totalIndividuals,15);
  assert.deepEqual(p.budget.travelWindowSec,[27,35]);assert.match(p.ownership,/No third-party model, photograph, video or texture/);
  for(const entry of[...p.core,...p.functionalAdditions])assert.ok(entry.sources.every(url=>url.startsWith('https://')));
  assert.ok(p.factsAndDisplayChoices.some(note=>note.includes('no invented native ingestion')));
});
