import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { oceanMeadowLifeSpeciesCatalog } from '../src/oceanMeadowLifeSpecies.js';
import { OCEAN_SHOAL_LIFE_IDS } from '../src/world/OceanShoalLifeAssets.js';
import { createOceanMeadowLifeAsset, animateOceanMeadowLifeAsset, disposeOceanMeadowLifeAsset,
  oceanMeadowLifeAssetStats, OCEAN_MEADOW_LIFE_IDS, OCEAN_MEADOW_LIFE_ENVELOPES } from '../src/world/OceanMeadowLifeAssets.js';

// Native CPU kit evidence, not habitat admission, measured anatomy, GPU/FPS,
// current browser image quality or a completed director viewing.
const oldCatalog = livingShallowsSpeciesCatalog.filter(s => !OCEAN_MEADOW_LIFE_IDS.includes(s.id) && !OCEAN_SHOAL_LIFE_IDS.includes(s.id));
const catalog = [...oldCatalog, ...oceanMeadowLifeSpeciesCatalog];
const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
const digest = root => { const h = createHash('sha256'); for (const m of meshes(root)) {
  for (const [name, a] of Object.entries(m.geometry.attributes).sort()) { h.update(name); h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength)); }
  if (m.geometry.index) { const a = m.geometry.index.array; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); } h.update(JSON.stringify(m.matrix.toArray()));
} return h.digest('hex'); };
const pose = root => { root.updateMatrixWorld(true); const out = []; root.traverse(o => out.push(o.matrix.toArray())); return out; };
const agents = () => oceanMeadowLifeSpeciesCatalog.map((s, i) => ({ id: `meadow:${s.id}`, speciesId: s.id, regionId: '188,14', alive: true,
  sizeM: s.lengthM, position: { x: 12064 + i * 2, y: -5.2, z: 928 }, velocity: { x: .02, y: .004, z: 0 },
  heading: .35, pitch: s.id === 'reef-cuttlefish' ? .06 : 0, timeSec: 8.2, state: 'foraging', lastFeedAt: 8,
  colonyExtension: 1, supportNormal: { x: .12, y: .98, z: .15 } }));

test('all 35 original shallow geometry and animation receipts remain exact after the new native dispatcher', t => {
  // Captured before OceanAnimals was edited for this package, using these
  // actual baseline identities and original native time/pose below. Run this
  // first: the unchanged authored coral chooses serial % 4 at construction.
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
  };
  assert.equal(oldCatalog.length, 35); assert.deepEqual(oldCatalog.map(s => s.id).sort(), Object.keys(expected).sort());
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose());
  const rows = oldCatalog.map((s, i) => ({ id: `baseline:${s.id}`, speciesId: s.id, regionId: '188,14', alive: true, sizeM: s.lengthM,
    position: { x: 12064 + i * 2, y: -5.2, z: 928 }, velocity: { x: .05, y: .01, z: 0 }, heading: .35, pitch: 0, timeSec: 8.2, state: 'foraging', lastFeedAt: 8 }));
  const before = structuredClone(rows); animals.update([...rows, ...agents()], 999, { x: 12032, z: 896 });
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId], row.speciesId);
  const originals = rows.map(r => animals.getObject(r.id)); animals.update(rows, 9900, { x: 12096, z: 960 });
  assert.deepEqual(rows.map(r => animals.getObject(r.id)), originals); assert.deepEqual(rows, before);
  for (const row of rows) assert.equal(digest(animals.getObject(row.id)), expected[row.speciesId], `${row.speciesId} stable regional clock`);
});

test('four whole forms use source measurement semantics and complete finite state/size envelopes without emission', t => {
  const kits = oceanMeadowLifeSpeciesCatalog.map(createOceanMeadowLifeAsset), hashes = new Set(), receipt = {};
  t.after(() => kits.forEach(k => disposeOceanMeadowLifeAsset(k.group)));
  assert.deepEqual(oceanMeadowLifeSpeciesCatalog.map(s => s.id), OCEAN_MEADOW_LIFE_IDS);
  for (const [i, k] of kits.entries()) {
    const s = oceanMeadowLifeSpeciesCatalog[i], e = OCEAN_MEADOW_LIFE_ENVELOPES[s.id], root = k.group;
    assert.equal(root.userData.speciesId, s.id); assert.equal(root.userData.sizeMeasure, s.sizeMeasure);
    assert.deepEqual([e.localBounds.minX, e.localBounds.maxX], s.normalizedEnvelope.x); assert.equal(e.horizontalRadius, s.normalizedEnvelope.horizontalRadiusUnits);
    assert.deepEqual([e.minY, e.maxY], s.normalizedEnvelope.y);
    const triangles = meshes(root).reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
    assert.ok(triangles > 250 && triangles < 6000); assert.ok(meshes(root).length <= 16);
    receipt[s.id] = { triangles, meshes: meshes(root).length, sizeMeasure: s.sizeMeasure };
    root.updateMatrixWorld(true); hashes.add(digest(root));
    root.traverse(o => assert.ok(!o.isLight));
    for (const m of meshes(root)) { assert.ok(m.material.isMeshStandardMaterial); assert.equal(m.material.emissive.getHex(), 0); assert.equal(m.material.emissiveIntensity, 0);
      for (const a of Object.values(m.geometry.attributes)) assert.ok([...a.array].every(Number.isFinite)); }
    for (const state of ['resting', 'foraging', 'meadow-feeding', 'retracted', 'blocked']) for (let frame = 0; frame < 24; frame++) {
      const time = frame * .41;
      animateOceanMeadowLifeAsset(root, time, { state, velocity: { x: state === 'resting' ? 0 : .02 }, lastFeedAt: time - .2, colonyExtension: state === 'retracted' ? 0 : 1 });
      root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root), bounds = e.localBounds;
      assert.ok(b.min.x >= bounds.minX - 1e-6 && b.max.x <= bounds.maxX + 1e-6 && b.min.z >= bounds.minZ - 1e-6 && b.max.z <= bounds.maxZ + 1e-6, `${s.id} complete appendage/colony envelope`);
      assert.ok(b.min.y >= e.minY - 1e-6 && b.max.y <= e.maxY + 1e-6, `${s.id} vertical/buried envelope`);
      for (const m of meshes(root)) for (let v = 0; v < m.geometry.attributes.position.count; v++) {
        const p = new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, v).applyMatrix4(m.matrixWorld);
        assert.ok(Math.hypot(p.x, p.z) <= e.horizontalRadius + 1e-6);
      }
    }
    animateOceanMeadowLifeAsset(root, 0, { state: 'resting', colonyExtension: 1 }); root.updateMatrixWorld(true);
    if (s.id === 'sand-edge-seahorse') {
      const r = root.userData.measureReferences; assert.ok(Math.abs(r.coronetY - r.tailBaseY + r.uncurledTailLength - 1) < 1e-12);
      assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y < .9, 'curled posed height is less than straightened height');
      assert.deepEqual(r.posedTailTip, [0, 0, 0]); assert.deepEqual(root.userData.holdfastPointLocal, { x: 0, y: 0, z: 0 }); assert.ok(k.parts.dorsalFin);
    } else if (s.id === 'reef-cuttlefish') {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(k.parts.mantle).getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.equal(k.parts.arms.length, 8); assert.equal(k.parts.tentacles.length, 2); assert.equal(k.parts.fins.length, 2);
      assert.ok(new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x > 1.7, 'head and all appendages extend beyond the mantle measure');
    } else if (s.id === 'barrel-sea-pen') {
      const r = root.userData.measureReferences; assert.equal(r.buriedPeduncleLength + r.expandedBodyHeight, 1);
      const b = new THREE.Box3().setFromObject(k.parts.peduncle); assert.ok(b.min.y < -.24);
      assert.equal(root.userData.displayPolypCount, 32); assert.equal(root.userData.autozoidTentacles, 8);
      assert.equal(Object.hasOwn(k.parts, 'branches'), false, 'clavate axisless colony is not a feather-shaped sea pen');
    } else {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(k.parts.shell).getSize(new THREE.Vector3()).x - 1) < 1e-6);
      assert.equal(root.userData.appendageCounts.outerLipDigitations, 6); assert.equal(root.userData.appendageCounts.eyes, 2);
      assert.ok(new THREE.Box3().setFromObject(k.parts.foot).max.x > .78, 'proboscis is outside the axial shell measure');
    }
    for (const size of s.sizeRangeM) {
      root.scale.setScalar(size); root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root);
      assert.ok(b.min.y >= e.minY * size - 1e-6 && b.max.y <= e.maxY * size + 1e-6);
    }
    root.scale.setScalar(1);
  }
  assert.equal(hashes.size, 4); t.diagnostic(JSON.stringify({ prototypes: receipt, scope: 'whole representative geometry; native CPU only' }));
});

test('native dispatch preserves real regional clocks, support conventions, floating origin and picking without model mutation', t => {
  const animals = new OceanAnimals(catalog); t.after(() => animals.dispose()); const rows = agents(), before = structuredClone(rows);
  animals.update([...rows, { ...rows[0], id: 'dead', alive: false }], 999, { x: 12032, z: 896 });
  assert.equal(animals.stats.activeAnimals, 4); assert.equal(animals.pickableObjects.length, 4); assert.equal(animals.getObject('dead'), null);
  for (const row of rows) {
    const object = animals.getObject(row.id); assert.deepEqual(object.position.toArray(), [row.position.x, row.position.y, row.position.z]);
    assert.equal(object.scale.x, row.sizeM); assert.equal(object.userData.regionId, row.regionId); assert.equal(object.userData.meadowLifeLastTimeSec, row.timeSec);
    if (['barrel-sea-pen', 'spider-conch'].includes(row.speciesId)) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion), n = new THREE.Vector3(row.supportNormal.x, row.supportNormal.y, row.supportNormal.z).normalize(); assert.ok(up.distanceTo(n) < 1e-12);
    } else if (row.speciesId === 'sand-edge-seahorse') assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);
    else assert.ok(Math.abs(object.rotation.z - row.pitch) < 1e-12);
    let hit = null;
    for (const m of meshes(object)) { const p = m.geometry.attributes.position, ix = m.geometry.index.array;
      for (let face = 0; !hit && face < Math.min(ix.length, 150); face += 3) { const a = new THREE.Vector3().fromBufferAttribute(p, ix[face]).applyMatrix4(m.matrixWorld), b = new THREE.Vector3().fromBufferAttribute(p, ix[face + 1]).applyMatrix4(m.matrixWorld), c = new THREE.Vector3().fromBufferAttribute(p, ix[face + 2]).applyMatrix4(m.matrixWorld), n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (n.lengthSq() < .9) continue; const center = a.clone().add(b).add(c).multiplyScalar(1 / 3); hit = new THREE.Raycaster(center.clone().addScaledVector(n, .2), n.clone().negate()).intersectObject(object, true)[0]; }
      if (hit) break;
    }
    assert.ok(hit, `${row.speciesId} native mesh picking`); let parent = hit.object; while (parent && !parent.userData.agentId) parent = parent.parent; assert.equal(parent.userData.agentId, row.id);
  }
  const objects = rows.map(r => animals.getObject(r.id)), poses = objects.map(pose);
  animals.update(rows, 9000, { x: 12096, z: 960 }); assert.deepEqual(objects.map(pose), poses); assert.deepEqual(rows, before);
  const sea = animals.getObject(rows[0].id), anchor = new THREE.Vector3().applyMatrix4(sea.matrixWorld), expected = new THREE.Vector3(rows[0].position.x - 12096, rows[0].position.y, rows[0].position.z - 960); assert.ok(anchor.distanceTo(expected) < 1e-12);
  rows.forEach(r => { r.timeSec += .2; }); animals.update(rows, 9000); assert.ok(objects.some((o, i) => JSON.stringify(pose(o)) !== JSON.stringify(poses[i])));
});

test('bounded shared resources retain active owners and release exactly once through replacement, unloading, reset and final disposal', t => {
  const first = new OceanAnimals(catalog), second = new OceanAnimals(catalog), rows = agents(), events = new Map();
  t.after(() => { first.dispose(); second.dispose(); }); first.update(rows, 0); second.update(rows, 0);
  for (const r of rows) { const a = meshes(first.getObject(r.id)), b = meshes(second.getObject(r.id)); assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) { assert.equal(a[i].geometry, b[i].geometry); assert.equal(a[i].material, b[i].material);
      for (const resource of [a[i].geometry, a[i].material]) if (!events.has(resource)) { events.set(resource, 0); resource.addEventListener('dispose', () => events.set(resource, events.get(resource) + 1)); } }
  }
  const stats = oceanMeadowLifeAssetStats(); assert.equal(stats.instances, 8); assert.ok(stats.resources <= 30);
  const stable = rows.map(r => second.getObject(r.id));
  for (let frame = 0; frame < 32; frame++) { second.update(rows, frame, { x: frame % 2 ? 12032 : 12096, z: 896 }); assert.deepEqual(oceanMeadowLifeAssetStats(), stats); assert.deepEqual(rows.map(r => second.getObject(r.id)), stable); }
  const replaced = first.getObject(rows[0].id); first.update([{ ...rows[0], speciesId: 'green-chromis' }, ...rows.slice(1)], 0); assert.equal(replaced.children.length, 0); assert.equal(replaced.parent, null);
  assert.ok([...events.values()].every(n => n === 0)); first.update([], 0); first.dispose(); first.dispose(); assert.ok([...events.values()].every(n => n === 0));
  const p = stable.map(pose); second.update([], 9000); assert.ok([...events.values()].every(n => n === 1));
  second.update(rows, 9900); assert.deepEqual(rows.map(r => pose(second.getObject(r.id))), p); second.reset(); assert.equal(second.pickableObjects.length, 0);
  assert.deepEqual(oceanMeadowLifeAssetStats(), { resources: 0, instances: 0 }); second.dispose(); second.dispose(); assert.equal(second.update(rows, 99999), false);
  assert.throws(() => createOceanMeadowLifeAsset('green-chromis'), /Unknown/);
});

test('actual colony extension and intake timestamps control display motion while ecological records and anchor references stay intact', t => {
  const kits = oceanMeadowLifeSpeciesCatalog.map(createOceanMeadowLifeAsset); t.after(() => kits.forEach(k => disposeOceanMeadowLifeAsset(k.group)));
  const rows = agents(), before = structuredClone(rows); kits.forEach((k, i) => animateOceanMeadowLifeAsset(k.group, 8.2, rows[i]));
  const pen = kits.find(k => k.group.userData.speciesId === 'barrel-sea-pen'), cuttle = kits.find(k => k.group.userData.speciesId === 'reef-cuttlefish'), sea = kits.find(k => k.group.userData.speciesId === 'sand-edge-seahorse');
  const expanded = new THREE.Box3().setFromObject(pen.group); animateOceanMeadowLifeAsset(pen.group, 8.2, { colonyExtension: 0, state: 'meadow-feeding', lastFeedAt: 8 });
  assert.equal(pen.group.userData.meadowLifeColonyExtension, 0); assert.ok(new THREE.Box3().setFromObject(pen.group).max.y < expanded.max.y); assert.equal(pen.parts.peduncle.position.y, 0);
  animateOceanMeadowLifeAsset(cuttle.group, 8.2, { state: 'meadow-feeding', velocity: { x: 0 }, lastFeedAt: null }); assert.ok(cuttle.parts.arms.every(a => a.scale.x === 1));
  const quiet = cuttle.parts.tentacles[0].scale.x; animateOceanMeadowLifeAsset(cuttle.group, 8.2, { state: 'foraging', velocity: { x: 0 }, lastFeedAt: 8 }); assert.notEqual(cuttle.parts.tentacles[0].scale.x, quiet);
  const tail = structuredClone(sea.parts.tail); animateOceanMeadowLifeAsset(sea.group, 8.4, { velocity: { x: .02 } }); assert.deepEqual(sea.parts.tail, tail); assert.deepEqual(sea.group.position.toArray(), [0, 0, 0]);
  assert.deepEqual(rows, before); assert.ok(kits.every(k => !k.group.userData.meadowLifeDisposed));
});
