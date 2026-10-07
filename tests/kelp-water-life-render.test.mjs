import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { kelpSpeciesCatalog } from '../src/kelpSimulation.js';
import { kelpWaterSpeciesCatalog } from '../src/kelpWaterSpecies.js';
import { kelpVisitorSpeciesCatalog } from '../src/kelpVisitorSpecies.js';
import { kelpBenthicLifeSpeciesCatalog } from '../src/kelpBenthicLifeSpecies.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from '../src/world/kelpOrganisms.js';
import { kelpWaterLifeSpeciesCatalog } from '../src/kelpWaterLifeSpecies.js';
import { createKelpWaterLifeAsset, animateKelpWaterLifeAsset, disposeKelpWaterLifeAsset, kelpWaterLifeAssetStats,
  KELP_WATER_LIFE_IDS, KELP_WATER_LIFE_ENVELOPES, isKelpWaterLifeSpecies } from '../src/world/KelpWaterLifeAssets.js';

// Native CPU geometry, clocks and lifecycle evidence; no browser/GPU claim.
const originalCatalog = [...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog, ...kelpVisitorSpeciesCatalog, ...kelpBenthicLifeSpeciesCatalog];
const meshes = object => { const rows = []; object.traverse(mesh => { if (mesh.isMesh) rows.push(mesh); }); return rows; };
const digest = object => {
  const hash = createHash('sha256');
  for (const mesh of meshes(object)) {
    for (const [name, a] of Object.entries(mesh.geometry.attributes).sort()) { hash.update(name); hash.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength)); }
    if (mesh.geometry.index) { const a = mesh.geometry.index.array; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    hash.update(JSON.stringify(mesh.matrix.toArray()));
  }
  return hash.digest('hex');
};
const poseDigest = object => { const hash = createHash('sha256'); object.traverse(part => { hash.update(part.type); hash.update(JSON.stringify(part.matrix.toArray())); }); return hash.digest('hex'); };
const originalRows = () => [
  ...[...kelpSpeciesCatalog, ...kelpWaterSpeciesCatalog, ...kelpVisitorSpeciesCatalog].filter(s => s.kind !== 'kelp').map((s, i) => ({
    id: `baseline:${s.id}`, speciesId: s.id, alive: true, sizeM: s.lengthM || .1, position: { x: 400 + i * 2, y: 2, z: -96 },
    velocity: { x: .08, y: .01, z: 0 }, heading: .35, timeSec: 8.2, state: 'foraging', localEnvironment: { currentMps: .18 } })),
  ...kelpBenthicLifeSpeciesCatalog.map((s, i) => ({ id: `new:${s.id}`, speciesId: s.id, regionId: '6,-2', alive: true, sizeM: s.lengthM,
    position: { x: 400 + i * 2, y: 2, z: -96 }, velocity: { x: .012, y: .001, z: 0 }, heading: .35, state: 'foraging', timeSec: 8.2,
    supportNormal: { x: .12, y: .98, z: .15 }, localEnvironment: { currentMps: .18 } })),
];
const catalog = [...originalCatalog, ...kelpWaterLifeSpeciesCatalog];
const newRows = () => kelpWaterLifeSpeciesCatalog.map((s, i) => ({ id: `water-life:${s.id}`, speciesId: s.id, regionId: '6,-2',
  alive: true, sizeM: s.lengthM, position: { x: 400 + i * 2, y: 5, z: -96 }, velocity: { x: .12, y: .04, z: .01 },
  heading: .35, pitch: .07, timeSec: 8.2, state: 'foraging', energy: .7, lastFeedAt: 8,
  supportNormal: { x: .2, y: .96, z: .1 } }));
const points = object => meshes(object).flatMap(mesh => {
  const a = mesh.geometry.attributes.position; return Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld));
});
function contactDistance(object) { const point = new THREE.Vector3(...Object.values(object.userData.feedingPointLocal)); return Math.min(...points(object).map(p => p.distanceTo(point))); }

test('all eleven prior kelp animals and the original animated giant-kelp host retain captured native receipts', t => {
  const expected = {
    'purple-urchin': '70133c1c48bdf4db9459f0236379714503c845cd18e4b3b94eeea3e4fba7aa60',
    'bat-star': 'd50f1418c9797a2988f5c0bc515121d990304be10798aab226fb0ef596920bf2',
    'giant-kelpfish': '5fc8f3a77717905c38e387125455caff9ced95f1336b681d05f91fb92811f8e1',
    'brown-turban-snail': '80cbfa4a998f77a5475257166a35ec4487cf928b218510db8f715dd41e114ab0',
    'gumboot-chiton': '2365c667d99ff68b580d2f387ca5b70510176a0384fd25f779696c8c0ee64fd8',
    'blue-rockfish': '1507bcb63ca167dc85f1cc3625af68441c20bc70cb5229947633048883b09e9a',
    'leopard-shark': '1d16cae8f71622a39ca453989c2ef95938c841153d492b9922b3e26c43117bf9',
    'red-abalone': '4cbcb09267b08a0a0bfeea255a9e299478b71149891275f297952d3611165db9',
    'northern-kelp-crab': '5d747449a8de1b30483b6669b1dd51c15f61e73b39443038fb9ce52f0fb13088',
    'california-sea-hare': '15f6b7b64607e4a43df52438948caae46879ca06ddf90d75918c6bc8213af5d3',
    'giant-plumose-anemone': 'f5c519cbb26a0a8e960228d0ad57647477e0bdd82e6123e3fe9498f7076a6dbb',
  };
  const animals = new KelpOceanAnimals(originalCatalog), rows = originalRows(), before = structuredClone(rows);
  t.after(() => animals.dispose()); animals.update(rows, 999, { x: 384, z: -128 }); assert.equal(animals.stats.activeAnimals, 11);
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId]);
  animals.update(rows, 50000, { x: 448, z: -64 }); assert.deepEqual(rows, before);
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId]);
  const anchor = { id: 'baseline-kelp-anchor', x: 0, y: .8, z: 0, phase: .7, lengthM: 10.8 };
  const host = createKelpOrganism(kelpSpeciesCatalog.find(s => s.id === 'giant-kelp'), { anchor }); t.after(() => disposeKelpOrganism(host));
  animateKelpOrganism(host, 8.2, { currentMps: .18, deformationCurrentMps: .18 }, anchor); host.updateMatrixWorld(true);
  assert.equal(digest(host), '7e7b9be44d6f6ca66523c3a19c00e8c5e08e5f46f6d5397554510991e2f143fe');
});

test('four distinct whole forms use TL mantle length or bell diameter and retain all appendages within source envelopes', t => {
  const objects = kelpWaterLifeSpeciesCatalog.map(createKelpWaterLifeAsset), hashes = new Set(); t.after(() => objects.forEach(disposeKelpWaterLifeAsset));
  assert.deepEqual(kelpWaterLifeSpeciesCatalog.map(s => s.id), KELP_WATER_LIFE_IDS); assert.equal(isKelpWaterLifeSpecies('blue-rockfish'), false);
  assert.throws(() => createKelpWaterLifeAsset('not-a-taxon'));
  for (const [i, object] of objects.entries()) {
    const s = kelpWaterLifeSpeciesCatalog[i], env = KELP_WATER_LIFE_ENVELOPES[s.id], p = object.userData.kelpWaterLifeParts;
    assert.equal(object.userData.sizeMeasure, s.sizeMeasure); assert.deepEqual(object.userData.feedingPointLocal, s.morphology.feedingPointLocal);
    assert.deepEqual([env.localBounds.minX, env.localBounds.maxX], s.normalizedEnvelope.x); assert.deepEqual([env.minY, env.maxY], s.normalizedEnvelope.y);
    assert.equal(env.horizontalRadius, s.normalizedEnvelope.horizontalRadiusUnits); assert.equal(env.pitchLimit, s.kind === 'jellyfish' ? 0 : .12);
    object.updateMatrixWorld(true); hashes.add(digest(object));
    for (const mesh of meshes(object)) {
      assert.ok(mesh.geometry.index.count > 0); assert.ok(Object.values(mesh.geometry.attributes).every(a => [...a.array].every(Number.isFinite)));
      assert.equal(mesh.material.emissiveIntensity, 0); assert.equal(mesh.material.emissive.getHex(), 0); assert.equal(mesh.material.isMeshStandardMaterial, true);
    }
    assert.ok(contactDistance(object) < 1e-6, `${s.id} feeding point is an actual geometry reference`);
    const anatomy = object.userData.anatomy;
    if (s.id === 'california-market-squid') {
      assert.equal(anatomy.shortArms, 8); assert.equal(anatomy.feedingTentacles, 2); assert.equal(anatomy.clubs, 2);
      const bounds = new THREE.Box3().setFromObject(p.mantle); assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.ok(new THREE.Box3().setFromObject(object).max.x >= 1.49, 'head and complete arms are outside the unit mantle');
    } else if (s.id === 'pacific-sea-nettle') {
      assert.equal(anatomy.oralArms, 4); assert.equal(anatomy.marginalTentacles, 24);
      const bell = new THREE.Box3().setFromObject(p.bell); assert.ok(Math.abs(bell.getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.ok(new THREE.Box3().setFromObject(p.oralArms).min.y < -7.9 && new THREE.Box3().setFromObject(p.tentacles).min.y < -8);
      assert.equal(p.bell.material.transparent, true); assert.equal(p.bell.material.depthWrite, false);
    } else {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.equal(anatomy.dorsalFins, s.id === 'opaleye' ? 1 : 2); assert.equal(anatomy.pectoralFins, 2); assert.equal(anatomy.pelvicFins, 2);
      const height = new THREE.Box3().setFromObject(p.body).getSize(new THREE.Vector3()).y;
      assert.ok(s.id === 'opaleye' ? height > .35 : height < .15, 'different body silhouettes');
    }
    for (const state of ['resting', 'schooling', 'foraging', 'feeding', 'blocked']) for (let frame = 0; frame < 24; frame++) {
      animateKelpWaterLifeAsset(object, frame * .41, { state, velocity: { x: ['resting', 'blocked'].includes(state) ? 0 : .12 } }); object.updateMatrixWorld(true);
      const all = points(object), b = env.localBounds;
      assert.ok(all.every(v => v.x >= b.minX - 1e-6 && v.x <= b.maxX + 1e-6 && v.z >= b.minZ - 1e-6 && v.z <= b.maxZ + 1e-6 &&
        v.y >= env.minY - 1e-6 && v.y <= env.maxY + 1e-6 && Math.hypot(v.x, v.z) <= env.horizontalRadius + 1e-6), `${s.id} entire finite animated body`);
      assert.ok(contactDistance(object) < 1e-6, 'native appendage animation never moves the recorded contact');
    }
    animateKelpWaterLifeAsset(object, 0, { velocity: { x: 0 } });
    for (const size of s.sizeRangeM) { object.scale.setScalar(size); object.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(object);
      assert.ok(b.min.y >= env.minY * size - 1e-6 && b.max.y <= env.maxY * size + 1e-6); }
    object.scale.setScalar(1);
  }
  assert.equal(hashes.size, 4); assert.ok(meshes(objects[0]).length <= 6 && meshes(objects[2]).length === 3);
});

test('native kelp dispatcher uses actual independent identities clocks metre poses explicit pitch and picking without mutating records', t => {
  const animals = new KelpOceanAnimals(catalog), rows = newRows(), before = structuredClone(rows); t.after(() => animals.dispose());
  animals.update([...rows, { ...rows[0], id: 'dead', alive: false }], 999, { x: 384, z: -128 }); assert.equal(animals.stats.activeAnimals, 4); assert.equal(animals.pickableObjects.length, 4);
  assert.equal(animals.getObject('dead'), null);
  for (const row of rows) {
    const o = animals.getObject(row.id), jelly = row.speciesId === 'pacific-sea-nettle';
    assert.deepEqual(o.position.toArray(), [row.position.x, row.position.y, row.position.z]); assert.equal(o.scale.x, row.sizeM);
    assert.equal(o.rotation.y, -.35); assert.equal(o.rotation.z, jelly ? 0 : .07); assert.equal(o.rotation.x, 0);
    assert.equal(o.userData.kelpWaterLifeLastTimeSec, 8.2); assert.equal(o.userData.agentId, row.id);
    assert.ok(o.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(row.position.x - 384, row.position.y, row.position.z + 128)) < 1e-9);
    const mesh = meshes(o)[0], a = mesh.geometry.attributes.position, indices = mesh.geometry.index.array; let hit;
    for (let face = 0; !hit && face < Math.min(indices.length, 300); face += 3) {
      const p = [0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(a, indices[face+j]).applyMatrix4(mesh.matrixWorld));
      const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize(); if (n.lengthSq() < .9) continue;
      const center = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3); hit = new THREE.Raycaster(center.clone().addScaledVector(n, .2), n.clone().negate()).intersectObject(o, true)[0];
    }
    assert.ok(hit, `${row.speciesId} real mesh picking`); let parent = hit.object; while (parent && !parent.userData.agentId) parent = parent.parent; assert.equal(parent.userData.agentId, row.id);
  }
  const poses = rows.map(r => poseDigest(animals.getObject(r.id))); animals.update(rows, 90000, { x: 448, z: -64 }); assert.deepEqual(rows, before);
  assert.deepEqual(rows.map(r => poseDigest(animals.getObject(r.id))), poses);
  rows[0].pitch = 1; rows[1].pitch = -.9; rows[2].pitch = .7; animals.update(rows, 90000); assert.equal(animals.getObject(rows[0].id).rotation.z, .12);
  assert.equal(animals.getObject(rows[1].id).rotation.z, -.12); assert.equal(animals.getObject(rows[2].id).rotation.z, 0);
  rows[0].timeSec += .1; animals.update(rows, 90000); assert.notEqual(poseDigest(animals.getObject(rows[0].id)), poses[0]);
});

test('finite shared resources survive native individual replacement revisit and reset then dispose once at their final reference', t => {
  const first = kelpWaterLifeSpeciesCatalog.map(createKelpWaterLifeAsset), second = kelpWaterLifeSpeciesCatalog.map(createKelpWaterLifeAsset), events = new Map();
  t.after(() => [...first, ...second].forEach(disposeKelpWaterLifeAsset));
  for (let i=0;i<first.length;i++) for (let m=0;m<meshes(first[i]).length;m++) {
    const a=meshes(first[i])[m],b=meshes(second[i])[m]; assert.equal(a.geometry,b.geometry); assert.equal(a.material,b.material);
    for (const resource of [a.geometry,a.material]) if(!events.has(resource)){events.set(resource,0);resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)+1));}
  }
  const stats=kelpWaterLifeAssetStats(); assert.deepEqual(stats,{resources:18,instances:8});
  for(let frame=0;frame<24;frame++){second.forEach(o=>animateKelpWaterLifeAsset(o,frame*.1,{velocity:{x:.12}}));assert.deepEqual(kelpWaterLifeAssetStats(),stats);}
  first.forEach(disposeKelpWaterLifeAsset); first.forEach(disposeKelpWaterLifeAsset); assert.ok([...events.values()].every(n=>n===0));
  const animals=new KelpOceanAnimals(catalog),rows=newRows(); t.after(()=>animals.dispose());animals.update(rows,0);assert.equal(kelpWaterLifeAssetStats().instances,8);
  animals.update(rows.slice(1),0);assert.equal(kelpWaterLifeAssetStats().instances,7);animals.update(rows,0);assert.equal(kelpWaterLifeAssetStats().resources,18);
  animals.reset();assert.equal(kelpWaterLifeAssetStats().instances,4);assert.ok([...events.values()].every(n=>n===0));
  second.forEach(disposeKelpWaterLifeAsset);second.forEach(disposeKelpWaterLifeAsset);assert.ok([...events.values()].every(n=>n===1));assert.deepEqual(kelpWaterLifeAssetStats(),{resources:0,instances:0});
});

test('all native appendage motions repeat at one clock stop at zero velocity freeze on death and preserve root and contact geometry', t => {
  const objects=kelpWaterLifeSpeciesCatalog.map(createKelpWaterLifeAsset);t.after(()=>objects.forEach(disposeKelpWaterLifeAsset));
  for(const o of objects){const agent={alive:true,velocity:{x:.12,y:.01,z:.003},state:'feeding',lastFeedAt:8,timeSec:8.2},before=structuredClone(agent);
    const pose={position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray()}; animateKelpWaterLifeAsset(o,8.2,agent);o.updateMatrixWorld(true);const active=poseDigest(o);
    animateKelpWaterLifeAsset(o,8.2,agent);o.updateMatrixWorld(true);assert.equal(poseDigest(o),active);animateKelpWaterLifeAsset(o,8.3,agent);o.updateMatrixWorld(true);assert.notEqual(poseDigest(o),active);
    const frozen=poseDigest(o),clock=o.userData.kelpWaterLifeLastTimeSec;animateKelpWaterLifeAsset(o,99,{...agent,alive:false});o.updateMatrixWorld(true);assert.equal(poseDigest(o),frozen);assert.equal(o.userData.kelpWaterLifeLastTimeSec,clock);
    animateKelpWaterLifeAsset(o,0,{velocity:{x:0}});o.updateMatrixWorld(true);const still=poseDigest(o);animateKelpWaterLifeAsset(o,91,{state:'blocked',velocity:{x:0}});o.updateMatrixWorld(true);assert.equal(poseDigest(o),still);
    assert.ok(contactDistance(o)<1e-6);assert.deepEqual({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray()},pose);assert.deepEqual(agent,before);
  }
});
