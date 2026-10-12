import fs from 'node:fs';import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {ShallowBenthicAssets,SHALLOW_BENTHIC_IDS} from '../src/world/ShallowBenthicAssets.js';
import {shallowBenthicCoralGeometries} from '../src/world/ShallowBenthicCorals.js';
import {conformAttachedColony} from '../src/world/ShallowAttachedReef.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';

test('new whole benthic bodies retain complete measures, movement, open sponge cavities and bounded resource ownership',()=>{
 const kit=new ShallowBenthicAssets(),models=SHALLOW_BENTHIC_IDS.map(id=>kit.create(id)),p=new THREE.Vector3();
 const resources=[...kit.resources],disposed=new Map(resources.map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>disposed.set(r,disposed.get(r)+1));
 try{
  const sponge=new THREE.Box3().setFromObject(models[0].root),clam=new THREE.Box3().setFromObject(models[1].root);assert.ok(Math.abs(sponge.max.y-1)<1e-6);assert.ok(Math.abs(clam.max.x-clam.min.x-1)<1e-6);
  const s=models[0].root.children[0].geometry;assert.ok(s.index.count/3<18000);assert.ok(models[2].moving.length===8);
  const radius=[.43,.56,1.12];
  for(let t=0;t<=75;t+=2.5){kit.update(t,new Map([['spotted-reef-crab',.05]]));for(let k=0;k<models.length;k++)models[k].root.traverse(m=>{if(!m.isMesh)return;const pos=m.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);assert.ok(p.toArray().every(Number.isFinite));assert.ok(p.y>=-.00001);assert.ok(Math.hypot(p.x,p.z)<=radius[k]);}
  });}
  assert.ok(models[2].moving.some(l=>Math.abs(l.rotation.y)>.001));assert.equal(kit.create('tube-sponge'),models[0]);
 }finally{kit.dispose();kit.dispose();}assert.ok([...disposed.values()].every(n=>n===1));
});

test('complete banks replace scattered fill while preserving benthic asset dispatch and the scene budget',()=>{
 const w=new ShallowSampleScene(),m=w.model;
 try{
  assert.deepEqual(m.attachedReef,[]);assert.equal(m.reefSlope.structureRevision,7);
  assert.ok(!m.rocks.some(r=>r.profile.startsWith('sample-slope-')));
  assert.ok(!m.rocks.some(r=>/^sample-field-(toe|slope)-/.test(r.id)));
  for(const id of SHALLOW_BENTHIC_IDS){assert.ok((id==='spotted-reef-crab'?w.animals.contactFauna:w.animals.benthic).models.has(id));assert.ok(!w.animals.templatesAgents.some(a=>a.speciesId===id));}
  let meshes=0;w.scene.traverse(o=>meshes+=o.isMesh?1:0);assert.ok(meshes<350,'bank draws must stay within the existing scene budget');
  assert.equal(m.agents.length,293);assert.equal(m.slopeHabitats.residents.length,18);assert.equal(m.slopeHabitats.fish.length,7);assert.equal(m.slopeHabitats.unplaced.length,2);for(const id of m.slopeHabitats.unplaced)assert.ok(m.agents.some(a=>a.id===id&&!a.slopeHabitat),'unmoved existing residents must remain present');
 }finally{w.dispose();}
});

test('new coral sources retain redistributable attribution and byte-identical original images',()=>{
 const folder='public/assets/shallow-benthic-habitat',r=JSON.parse(fs.readFileSync(`${folder}/provenance.json`));assert.equal(r.records.length,3);assert.ok(r.records.every(a=>a.license.slug==='by'&&a.author==='Patric Lengacher'));
 const hash=b=>createHash('sha256').update(b).digest('hex');for(const t of r.textures){assert.equal(hash(fs.readFileSync(`${folder}/${t.file}`)),t.sha256);const key=t.file.replace('-0.jpg','');assert.equal(JSON.parse(fs.readFileSync('tests/fixtures/shallow-source-images.json')).images[`shallow-benthic-habitat/${t.file}`].sha256,t.sha256);}
});
