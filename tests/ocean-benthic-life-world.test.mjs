import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { oceanBiodiversityPatchHeight } from '../src/oceanBiodiversityShape.js';
import { OCEAN_BENTHIC_LIFE_ROUTE_STOPS } from '../src/oceanBenthicLifeRoutes.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';

// Run shipped navigation and camera methods with actual regional persistence,
// habitat queries and native Three objects. This is not browser/GPU acceptance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight',
  `return class {${['oceanWorldPosition', 'enterOceanBenthicLife', 'enterLivingShallows',
    'travelLivingShallows', 'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY',
    'floorY', 'habitatY', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight);
function fixture({ records = new Map(), benthicLife = true } = {}) {
  const seed = livingShallowsSeed('42'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const commits = [], store = { available: true,
    async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new OceanEcology(seed, generator, { store, turtles: true, livingGeology: true,
    habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true,
    shallowSeascape: true, turtleGrazing: true, biodiversity: true, benthicLife });
  const world = new World(), animals = new OceanAnimals(livingShallowsSpeciesCatalog), updates = [], requests = [];
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18,
      maxDistance: 30, enableDamping: true, update() {} }, oceanRenderOrigin: { x: 0, z: 0 },
    highlight: new THREE.Group(), cameraRocks: [], surfaceY: generator.surfaceY,
    oceanEcology: ecology, oceanAnimals: animals, keys: new Set(),
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {} },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {},
  });
  const request = world.requestOceanEcology.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  const stop = generator.routeStops.find(row => row.id === 'benthic-community'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, updates, requests, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const worldTarget = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));

test('ordinary sand-and-reef entry awaits persisted animals and renders actual new taxa, then retains them on cold revisit', async t => {
  const f=fixture(); t.after(()=>f.animals.dispose());
  assert.equal(await f.world.enterOceanBenthicLife(),true); await settle(f);
  const id=`${Math.floor(f.stop.x/64)},${Math.floor(f.stop.z/64)}`,row=f.records.get(id);
  assert.equal(row.benthicLifeVersion,1);
  assert.ok(f.commits.some(rows=>rows.some(([key,r])=>key===id&&r.benthicLifeVersion===1)));
  const actual=f.ecology.agents.filter(a=>a.regionId===id&&a.alive&&a.benthicLifeIndividualVersion===1);
  const anchor=actual.find(a=>a.speciesId==='reef-goatfish'&&f.generator.sample(a.position.x,a.position.z).substrate==='sand')?.position||actual.find(a=>a.speciesId==='blue-spotted-ray')?.position||actual[0]?.position;
  assert.ok(anchor); assert.ok(worldTarget(f.world).distanceTo(new THREE.Vector3(anchor.x,anchor.y+.3,anchor.z))<.05);
  f.animals.update(f.ecology.agents,0,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);
  for(const a of actual) assert.ok(f.animals.entities.has(a.id),a.speciesId);
  const before=structuredClone([...f.records]);
  const cold=fixture({records:f.records});t.after(()=>cold.animals.dispose());
  assert.equal(await cold.world.enterOceanBenthicLife(),true);await settle(cold);
  assert.deepEqual([...cold.records],before);assert.equal(cold.world.errors.length,0);
});

test('the new observation entry does not refill historical first-package owners or frame nonexistent life',async t=>{
  const old=fixture({benthicLife:false});t.after(()=>old.animals.dispose());
  old.world.enterLivingShallows(old.generator.routeStops.findIndex(s=>s.id==='benthic-community'));await settle(old);
  const before=structuredClone([...old.records]);const enabled=fixture({records:old.records});t.after(()=>enabled.animals.dispose());
  assert.equal(await enabled.world.enterOceanBenthicLife(),false);await settle(enabled);
  assert.deepEqual([...enabled.records],before);
  assert.ok(!enabled.ecology.agents.some(a=>a.benthicLifeIndividualVersion===1));
});

test('entry completion cannot take the camera back after manual control or disposal during the actual load',async t=>{
  for(const takeover of [w=>{w.controlStartCount++;},w=>{w.disposed=true;},w=>{w.sim.seed='new-seed';},w=>{w.enterLivingShallows(w.oceanChunks.generator.routeStops.findIndex(s=>s.id==='benthic-community'));}]){
    const f=fixture();t.after(()=>f.animals.dispose());let resume;
    f.ecology.update=()=>new Promise(resolve=>{resume=resolve;});
    const pending=f.world.enterOceanBenthicLife();takeover(f.world);
    const before=f.world.camera.position.clone(),target=f.world.controls.target.clone();resume(true);
    assert.equal(await pending,false);assert.ok(f.world.camera.position.equals(before));assert.ok(f.world.controls.target.equals(target));
  }
});

test('production, direct URL, ordinary controls and moving director share the native benthic route',()=>{
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
  assert.ok(source.includes('benthicLife:this.isLivingShallows'));
  assert.ok(app.includes("get('demo')==='benthic'?{kind:'living-stop',biome:'reef',profile:LIVING_SHALLOWS_PROFILE,stopId:'benthic-community',benthicLifeEntry:true}"));
  assert.ok(app.includes('pending.then(entered=>'));assert.ok(app.includes('actual._shallowSceneEntryToken===token'));
  assert.ok(app.includes('onClick={enterBenthicCommunity}>沙地生物'));
  assert.equal(livingShallowsSpeciesCatalog.length,79);
  assert.deepEqual(OCEAN_BENTHIC_LIFE_ROUTE_STOPS.map(s=>s.id),['benthic-community']);
  const f={biomeId:'reef',oceanChunks:{generator:{routeStops:OCEAN_BENTHIC_LIFE_ROUTE_STOPS}},enterLivingShallows:i=>i===0};
  const chapter=DIRECTOR_STEPS.find(s=>s.action.stopId==='benthic-community');assert.ok(chapter);
  assert.equal(navigateDemoEntry(chapter.action,f),true);assert.equal(chapter.motion.kind,'walk');
});


test('ordinary asynchronous UI completion cannot overwrite a newer world, seed, control or entry toast',async()=>{
  const app=readFileSync(new URL('../src/OceanApp.jsx',import.meta.url),'utf8');
  const marker='  const enterBenthicCommunity=async()=>',start=app.indexOf(marker),end=app.indexOf('  const enterKelpScene=',start);
  assert.ok(start>=0&&end>start);
  const fn=app.slice(start,end).trim().replace('const enterBenthicCommunity=','return ');
  for(const takeover of [()=>{},w=>{w.disposed=true;},w=>{w.sim.seed='new';},w=>{w.controlStartCount++;},w=>{w._shallowSceneEntryToken++;}]){
    let resume;const toast=[];
    const actual={sim:{seed:'42'},controlStartCount:0,_shallowSceneEntryToken:0,disposed:false,
      enterOceanBenthicLife(){this._shallowSceneEntryToken++;return new Promise(resolve=>{resume=resolve;});}};
    const currentWorld={current:actual};
    const invoke=new Function('world','director','setPendingDemo','setToast',fn)(currentWorld,{stop(){}},()=>{},text=>toast.push(text));
    const pending=invoke();takeover(actual);resume(false);await pending;
    assert.equal(toast.length,actual.disposed||actual.sim.seed!=='42'||actual.controlStartCount||actual._shallowSceneEntryToken!==1?0:1);
  }
  let reject;const toast=[],actual={sim:{seed:'42'},controlStartCount:0,_shallowSceneEntryToken:1,disposed:false,
    enterOceanBenthicLife(){return new Promise((_ok,no)=>{reject=no;});}},currentWorld={current:actual};
  const invoke=new Function('world','director','setPendingDemo','setToast',fn)(currentWorld,{stop(){}},()=>{},text=>toast.push(text));
  const pending=invoke();currentWorld.current={sim:{seed:'other'}};reject(new Error('stale failure'));await pending;
  assert.deepEqual(toast,[]);
});
