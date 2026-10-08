import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { KELP_UNDERSTORY_LIFE_ANIMAL_IDS, KELP_UNDERSTORY_LIFE_PLANT_IDS, kelpUnderstoryLifeBodyPoints, kelpUnderstoryLifePositionValid, validateKelpUnderstoryLifeRecord } from '../src/kelpUnderstoryLife.js';
import { KELP_UNDERSTORY_LIFE_ROUTE_STOPS } from '../src/kelpUnderstoryLifeRoutes.js';
import { kelpUnderstoryLifeSpeciesById } from '../src/kelpUnderstoryLifeSpecies.js';
import { KelpUnderstoryLife } from '../src/world/KelpUnderstoryLife.js';
import { sceneCatalogs } from '../src/sceneCatalog.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { navigateDemoEntry } from '../src/demoNavigation.js';
import { DEMO_KELP_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS, directorStepAction } from '../src/directorTour.js';
import { isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';

// Shipped native navigation/normal camera methods with actual persistence and
// regional ecology. CPU/Three fixtures do not establish browser/GPU acceptance.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, `shipped ${name}`);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight', 'KELP_UNDERSTORY_LIFE_ANIMAL_IDS', 'kelpUnderstoryLifeSpeciesById', 'kelpUnderstoryLifeBodyPoints',
  'isDirectorPlaybackRate', 'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed',
  `return class {${['oceanWorldPosition', 'enterKelpUnderstoryLife', 'enterKelpForestBelt', 'travelKelpForestBelt',
    'kelpUnderstoryLifeObservation', 'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries', 'updateDirectorMotion', 'findAgent',
    'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY', 'floorY', 'habitatY',
    'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology', 'updateKelpDriftFood'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, KELP_UNDERSTORY_LIFE_ANIMAL_IDS, kelpUnderstoryLifeSpeciesById, kelpUnderstoryLifeBodyPoints,
  isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed);
function fixture({ records = new Map(), understoryLife = true } = {}) {
  const generator = createKelpOceanGenerator('42', { forestBelt: true, kelpSeascape: true }), commits = [];
  const store = { available: true,
    async load(_world,id) { store.onRead?.(id); if(store.beforeRead) await store.beforeRead; if(store.readFault==='undefined') return undefined; if(store.readFault==='throw') throw new Error('native store read failure'); return structuredClone(records.get(id)??null); },
    async saveMany(_world, rows) { if(store.saveFault) return null; commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new KelpOceanEcology('42', generator, { store, forestBelt: true, kelpSeascape: true, understory: true, visitors: true, benthicLife: true, waterLife: true, nearBottomLife: true, understoryLife });
  const world = new World(), animals = new KelpOceanAnimals(sceneCatalogs.kelp), scenery = new KelpUnderstoryLife(), updates = [], requests = [], views = [];
  Object.assign(world, { biomeId: 'kelp', isKelp: true, isDeep: false, isLivingShallows: false, disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed: '42', agents: [], environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY, oceanRenderOrigin: { x: 0, z: 0 },
    camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30,
      enableDamping: true, update() {} }, highlight: new THREE.Group(), cameraRocks: [],
    oceanEcology: ecology, oceanAnimals: animals, oceanKelpUnderstoryLife: scenery,
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {}, setDetailedHosts() {} },
    select() {}, onSelect() {}, emitSnapshot() {},
  });
  const request = world.requestOceanEcology.bind(world), restore = world.restoreOceanObservation.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  world.restoreOceanObservation = view => { views.push(structuredClone(view)); return restore(view); };
  const stop = generator.kelpUnderstoryLifeRouteStops.find(row => row.id === 'kelp-understory-life'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, scenery, updates, requests, views, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const target = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));
function firstSavedDifference(actual,expected,path='record'){if(isDeepStrictEqual(actual,expected))return null;if(actual===null||expected===null||typeof actual!=='object'||typeof expected!=='object')return`${path}: actual=${String(actual).slice(0,160)}, expected=${String(expected).slice(0,160)}`;for(const key of new Set([...Object.keys(actual),...Object.keys(expected)])){if(!Object.hasOwn(actual,key)||!Object.hasOwn(expected,key))return`${path}.${key}: own-field presence changed`;const difference=firstSavedDifference(actual[key],expected[key],`${path}.${key}`);if(difference)return difference;}return`${path}: object identity/type difference`;}
const community=(f,ownerId=null)=>{const position=f.world.oceanWorldPosition(),id=ownerId??`${Math.floor(position.x/64)},${Math.floor(position.z/64)}`,row=f.ecology.snapshot().regions.find(r=>r.id===id),records=[...(row?.understoryLife?.plants??[]),...f.ecology.agents.filter(a=>a.regionId===id&&a.alive&&a.kelpUnderstoryIndividualVersion===1)],groups=new Map();for(const a of records){const host=a.hostId??a.kelpUnderstoryHostId;if(!groups.has(host))groups.set(host,[]);groups.get(host).push(a);}const ranked=[...groups].sort((a,b)=>new Set(b[1].map(a=>a.speciesId)).size-new Set(a[1].map(a=>a.speciesId)).size||b[1].length-a[1].length||a[0].localeCompare(b[0]));const selected=ranked[0]?.[1]??[],points=selected.flatMap(a=>kelpUnderstoryLifeBodyPoints(a)),box=new THREE.Box3().setFromPoints(points.map(a=>new THREE.Vector3(a.x,a.y,a.z)));return{id,row,selected,box,anchor:box.getCenter(new THREE.Vector3())};};

test('ordinary entry atomically exposes saved plant groups and attached animals, retains native and dead clocks and exact cold roots',async t=>{
  const f=fixture();let cold;try{assert.equal(await f.world.enterKelpUnderstoryLife(),true);await settle(f);
  const id=`${Math.floor(f.stop.x/64)},${Math.floor(f.stop.z/64)}`,row=f.records.get(id),r=f.ecology._active.get(id);assert.equal(id,'58,-4');assert.equal(row.kelpUnderstoryLifeVersion,1);assert.equal(f.ecology._active.size,9);
  assert.ok(f.commits.some(batch=>batch.some(([key,value])=>key===id&&value.kelpUnderstoryLifeVersion===1)));
  const actual=f.ecology.agents.filter(a=>a.regionId===id&&a.alive&&a.kelpUnderstoryIndividualVersion===1),plants=r.kelpUnderstoryLife.plants;assert.ok(actual.length>0&&actual.length<=4&&actual.every(a=>KELP_UNDERSTORY_LIFE_ANIMAL_IDS.includes(a.speciesId)));assert.ok(plants.length>0&&plants.length<=12&&plants.every(a=>KELP_UNDERSTORY_LIFE_PLANT_IDS.includes(a.speciesId)));assert.equal(new Set([...actual,...plants].map(a=>a.id)).size,actual.length+plants.length);
  const selected=community(f,id);assert.ok(selected.selected.length>1);assert.ok(target(f.world).distanceTo(selected.anchor)<.05,'observe complete real host community bounds');assert.ok(f.world.oceanWorldPosition().distanceTo(selected.anchor)>3.5,'macro host observation rather than single tiny pore');
  const repeated=f.world.kelpUnderstoryLifeObservation();assert.ok(new THREE.Vector3(repeated.target.x,repeated.target.y,repeated.target.z).distanceTo(selected.anchor)<1e-8,'repeat preparation retains actual target-owner host across a camera-owner boundary');
  const origin={...f.world.oceanRenderOrigin};f.world.setOceanRenderOrigin(origin.x+64,origin.z-64);const rebased=f.world.kelpUnderstoryLifeObservation();assert.deepEqual(rebased,repeated,'floating origin does not select another actual host');f.world.setOceanRenderOrigin(origin.x,origin.z);
  f.world.updateKelpDriftFood();f.animals.update(f.ecology.agents,999999,f.world.oceanRenderOrigin);assert.ok(f.scenery.stats.activePlants>0);for(const a of plants)assert.ok(f.scenery.objects.has(a.id));for(const a of actual)assert.ok(f.animals.getObject(a.id));
  const originalPlants=structuredClone(plants);f.ecology.step(.4,{foodSupply:0,currentMps:.18,hour:12});await f.ecology.checkpoint();f.world.updateKelpDriftFood();assert.equal(r.kelpUnderstoryLife.counters.ticks,4);assert.ok(r.kelpUnderstoryLifeAgents.every(a=>a.timeSec===.4));assert.deepEqual(plants,originalPlants);
  for(const a of plants)assert.equal(f.scenery.objects.get(a.id).object.userData.kelpUnderstoryLifeLastTimeSec,.4);
  // Controlled starvation debits existing condition before a real native death;
  // plants are scenery, so animal death neither removes nor replenishes them.
  for(const owner of f.ecology._active.values()){for(const a of owner.kelpUnderstoryLifeAgents??[]){owner.kelpUnderstoryEnergyLedger.maintenanceAndMotionDebit+=a.energy-1e-8;a.energy=1e-8;}if(owner.kelpUnderstoryLifeVersion===1)assert.equal(validateKelpUnderstoryLifeRecord(owner,owner,{generator:f.generator}),true);}f.ecology.step(.1,{foodSupply:0,currentMps:.18,hour:12});assert.ok(r.kelpUnderstoryLifeAgents.every(a=>!a.alive&&a.timeSec===.5));
  const dead=structuredClone(r.kelpUnderstoryLifeAgents);f.ecology.step(.2,{foodSupply:0,currentMps:.18,hour:12});await f.ecology.checkpoint();assert.deepEqual(r.kelpUnderstoryLifeAgents,dead);assert.deepEqual(plants,originalPlants);f.animals.update(f.ecology.agents,999999,f.world.oceanRenderOrigin);for(const a of dead)assert.equal(f.animals.getObject(a.id),null);assert.ok(f.world.kelpUnderstoryLifeObservation(),'actual persisted plants remain observable when filter animals die');
  // Legacy public agents attach current host/time display references in place.
  // Finish the actual warm observation before saving the exact cold baseline.
  await f.ecology.checkpoint();
  // The warm render fixture is no longer queried. Release actual meshes and
  // native support caches before allocating the complete cold owner window.
  f.animals.dispose();f.scenery.dispose();f.generator.clearCache();f.commits.length=0;
  const before=new Map(structuredClone([...f.records])),coldReads=new Set();cold=fixture({records:f.records});cold.store.onRead=key=>coldReads.add(key);assert.equal(await cold.world.enterKelpUnderstoryLife(),true);await settle(cold);
  for(const[key,record]of before){const difference=firstSavedDifference(cold.records.get(key),record,`owner ${key}`);assert.equal(difference,null,'every saved field stays exact across cold entry');}
  // Removing animal contributions can legitimately choose a different actual
  // plant host and load a new second window. Every added owner must be a real
  // first load; none may replace a stored owner or inherit evolved clocks/food.
  const added=[...cold.records].filter(([key])=>!before.has(key));for(const[key,record]of added){assert.ok(coldReads.has(key));assert.equal(record.state.timeSec,0);assert.equal(record.kelpUnderstoryLifeVersion,1);assert.equal(record.kelpUnderstoryLifeInitializedAtSec,0);assert.equal(record.kelpUnderstoryLife.counters.ticks,0);assert.equal(record.kelpUnderstoryLife.foodLedger.input,0);assert.ok(record.kelpUnderstoryLifeAgents.every(a=>a.alive&&a.timeSec===0));const owner=cold.ecology._active.get(key)??cold.ecology._restore(record,...key.split(',').map(Number));assert.equal(validateKelpUnderstoryLifeRecord(record,owner,{generator:cold.generator}),true);}
  t.diagnostic(`Cold plant-only focus retained ${before.size} saved owners; actual new first-load owners: ${added.map(([key])=>key).join(',')||'none'}`);
  const coldCommitted=structuredClone([...cold.records]);assert.deepEqual(cold.ecology._active.get(id).kelpUnderstoryLifeAgents,dead);assert.deepEqual(cold.ecology._active.get(id).kelpUnderstoryLife.plants,originalPlants);assert.equal(f.world.errors.length+cold.world.errors.length,0);
  const native=cold.world.oceanEcology,empty=native.snapshot();for(const row of empty.regions)if(row.understoryLife)row.understoryLife.plants=[];cold.world.oceanEcology={agents:native.agents,snapshot(){return empty;}};const p=cold.world.oceanWorldPosition(),look=target(cold.world);assert.equal(cold.world.kelpUnderstoryLifeObservation(),null);assert.equal(cold.world.prepareDirectorObservation({routeId:'kelp-understory-life'}),false);assert.deepEqual(cold.world.oceanWorldPosition(),p);assert.deepEqual(target(cold.world),look);assert.ok(isDeepStrictEqual([...cold.records],coldCommitted),'empty observation cannot change any saved field');
  }finally{f.animals.dispose();f.scenery.dispose();f.generator.clearCache();cold?.animals.dispose();cold?.scenery.dispose();cold?.generator.clearCache();}
});

test('historical forest owners retain all animals hosts food and clocks without understory-life refill or empty director success', async t => {
  const old = fixture({ understoryLife: false }); t.after(()=>{old.animals.dispose();old.scenery.dispose();});
  assert.equal(old.world.enterKelpForestBelt(old.stop.id), true); await settle(old); await old.ecology.checkpoint();
  const before = structuredClone([...old.records]), enabled = fixture({ records: old.records }); t.after(()=>{enabled.animals.dispose();enabled.scenery.dispose();});
  assert.equal(await enabled.world.enterKelpUnderstoryLife(), false); await settle(enabled);
  assert.deepEqual([...enabled.records], before); assert.ok(!enabled.ecology.agents.some(agent => agent.kelpUnderstoryIndividualVersion === 1));
  assert.ok(![...enabled.records.values()].some(row => row.kelpUnderstoryLifeVersion === 1));
  const position = enabled.world.oceanWorldPosition(), viewTarget = target(enabled.world), viewCount = enabled.views.length;
  assert.equal(enabled.world.kelpUnderstoryLifeObservation(), null);
  assert.equal(enabled.world.prepareDirectorObservation({ routeId: 'kelp-understory-life' }), false);
  assert.deepEqual(enabled.world.oceanWorldPosition(), position); assert.deepEqual(target(enabled.world), viewTarget);
  assert.equal(enabled.views.length, viewCount); assert.deepEqual([...enabled.records], before, 'a director chapter cannot create absent historical animals');
});

test('both actual preparation windows respect late view control seed keys reset disposal and newer navigation',async t=>{
  const baseline=fixture();t.after(()=>{baseline.animals.dispose();baseline.scenery.dispose();});assert.equal(await baseline.world.enterKelpUnderstoryLife(),true);await settle(baseline);
  const takeovers=[w=>{w.camera.position.x+=2;},w=>{w.controls.target.z+=2;},w=>{w.controlStartCount++;},w=>{w.sim.seed='other';},w=>{w.disposed=true;},w=>{w.oceanEcologyResetting=true;},w=>{w.keys.add('KeyW');},w=>{w.directorMotion={};},w=>{w.directorEntry={active:true};},w=>{w._kelpSceneEntryToken++;},w=>{w.enterKelpForestBelt('kelp-understory-life');},w=>{w.travelKelpForestBelt('kelp-understory-life');}];
  for(const takeover of takeovers){const f=fixture({records:new Map(structuredClone([...baseline.records]))});t.after(()=>{f.animals.dispose();f.scenery.dispose();});let resume,started;f.store.beforeRead=new Promise(resolve=>{resume=resolve;});const read=new Promise(resolve=>{started=resolve;});f.store.onRead=()=>started();const pending=f.world.enterKelpUnderstoryLife();await read;takeover(f.world);const p=f.world.oceanWorldPosition(),view=target(f.world),views=f.views.length,records=structuredClone([...f.records]);resume();assert.equal(await pending,false);await settle(f);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(target(f.world),view);assert.equal(f.views.length,views);assert.deepEqual([...f.records],records);}
  const f=fixture({records:new Map(structuredClone([...baseline.records]))});t.after(()=>{f.animals.dispose();f.scenery.dispose();});f.world.requestOceanEcology=()=>{};let resume,started;const ready=new Promise(resolve=>{started=resolve;}),update=f.ecology.update.bind(f.ecology);let calls=0;f.ecology.update=async p=>{if(++calls===2){started();await new Promise(resolve=>{resume=resolve;});}return update(p);};const pending=f.world.enterKelpUnderstoryLife();await ready;f.world.keys.add('KeyS');const p=f.world.oceanWorldPosition(),view=target(f.world);resume();assert.equal(await pending,false);await settle(f);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(target(f.world),view);
});

test('failed actual reads and commits never expose a fresh community or invented observation focus',async t=>{
  for(const fault of['undefined','throw','save-refused']){const f=fixture();t.after(()=>{f.animals.dispose();f.scenery.dispose();});if(fault==='save-refused')f.store.saveFault=true;else f.store.readFault=fault;assert.equal(await f.world.enterKelpUnderstoryLife(),false);await settle(f);assert.equal(f.views.length,1);assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);assert.equal(f.animals.stats.activeAnimals,0);assert.equal(f.world.kelpUnderstoryLifeObservation(),null);f.world.updateKelpDriftFood();assert.equal(f.scenery.stats.activePlants,0);}
  for(const block of[w=>{w.isKelp=false;},w=>{w.disposed=true;},w=>{w.oceanEcologyResetting=true;},w=>{w.oceanEcology=null;}]){const f=fixture();t.after(()=>{f.animals.dispose();f.scenery.dispose();});block(f.world);assert.equal(await f.world.enterKelpUnderstoryLife(),false);assert.equal(f.views.length,0);assert.equal(f.records.size,0);}
});

test('direct URL, ordinary control and moving director use the native route and frame actual life before a finite moving shot', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('kelpSeascape:true,benthicLife:true,waterLife:true,nearBottomLife:true,understoryLife:true'));
  assert.match(app, /get\('demo'\)==='kelp-understory-life'[\s\S]{0,260}kelpUnderstoryLifeEntry:true/);
  assert.match(app, /onClick=\{enterKelpUnderstoryCommunity\}>林下附着群落/);
  const branchStart = app.indexOf('    if(choice.kelpUnderstoryLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.ok(app.slice(branchStart, branchEnd).includes('actual.enterKelpUnderstoryLife()'));
  assert.equal(sceneCatalogs.kelp.length, 24); assert.equal(sceneCatalogs.kelp.filter(species => species.kind !== 'kelp').length, 21);
  assert.deepEqual(KELP_UNDERSTORY_LIFE_ROUTE_STOPS.map(stop => stop.id), ['kelp-understory-life']);
  const entry = DEMO_KELP_STOPS.find(stop => stop.id === 'kelp-understory-life'), chapter = DIRECTOR_STEPS.find(step => step.action.stopId === 'kelp-understory-life');
  assert.ok(entry && chapter); assert.equal(chapter.motion.kind, 'walk'); assert.equal(chapter.durationMs, 16000);
  assert.equal(chapter.motion.routeId, 'kelp-understory-life');
  assert.equal(chapter.context.biome, 'kelp'); assert.equal(entry.action.kind, 'kelp-stop');
  const f = fixture(); try {
    f.world.requestOceanEcology = () => {};
    assert.equal(navigateDemoEntry(directorStepAction(chapter), f.world), true);
    assert.ok(Math.hypot(f.world.oceanWorldPosition().x - f.stop.x, f.world.oceanWorldPosition().z - f.stop.z) < 20);
    for (const stop of [...f.generator.forestRouteStops, ...f.generator.kelpSeascapeRouteStops]) assert.ok(DIRECTOR_STEPS.some(step => step.action.stopId === stop.id));
    assert.equal(await f.ecology.update(f.world.oceanWorldPosition()), true); await settle(f);
    assert.equal(f.ecology._active.size, 9);
    const id = `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`;
    const life = f.ecology.agents.filter(agent => agent.regionId === id && agent.alive && agent.kelpUnderstoryIndividualVersion === 1);
    assert.ok(life.length > 0); const selected=community(f),anchor=selected.anchor;
    const records = structuredClone([...f.records]), snapshot = structuredClone(f.ecology.snapshot());
    const nativePosition = f.world.oceanWorldPosition(), nativeTarget = target(f.world), view = f.world.kelpUnderstoryLifeObservation();
    assert.ok(view); assert.ok(Math.hypot(view.target.x - anchor.x, view.target.z - anchor.z) < .05);
    assert.deepEqual(f.world.oceanWorldPosition(), nativePosition); assert.deepEqual(target(f.world), nativeTarget);
    assert.deepEqual(f.ecology.snapshot(), snapshot, 'the shared observation helper is read-only');
    assert.equal(f.world.prepareDirectorObservation(chapter.motion), true);
    assert.ok(Math.hypot(target(f.world).x - anchor.x, target(f.world).z - anchor.z) < .05);
    assert.equal(f.world.beginDirectorMotion(chapter.motion), true);
    const shot = f.world.directorMotion.shot, queries = f.world.directorMotionQueries(), first = sampleDirectorCameraMotion(shot, 0, queries);
    const forward = new THREE.Vector3(first.target.x - first.position.x, 0, first.target.z - first.position.z).normalize();
    const towardLife = new THREE.Vector3(anchor.x - first.position.x, 0, anchor.z - first.position.z).normalize();
    assert.ok(forward.dot(towardLife) > .99, 'the animals behind the generic +X stop are in front of the actual director shot');
    const camera = new THREE.PerspectiveCamera(f.world.camera.fov, f.world.camera.aspect, .05, 60);
    camera.position.set(first.position.x, first.position.y, first.position.z); camera.lookAt(first.target.x, first.target.y, first.target.z); camera.updateMatrixWorld(true);
    assert.ok(selected.selected.some(a => { const v = new THREE.Vector3(a.position.x,a.position.y,a.position.z).project(camera);
      return Math.abs(v.x)<1 && Math.abs(v.y)<1 && v.z>-1 && v.z<1; }), 'a real persisted plant or attached animal enters the initial native camera frustum');
    for (const seconds of [0, 4, 8, 16]) {
      const frame = sampleDirectorCameraMotion(shot, seconds, queries);
      assert.ok(frame.position.y >= f.world.habitatY(frame.position.x, frame.position.z) + .25 - 1e-8);
      assert.ok(frame.position.y <= f.generator.surfaceY - .5); assert.ok(Object.values(frame.position).every(Number.isFinite));
    }
    const start = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(8);
    assert.equal(f.world.directorMotion.elapsedSec, 8); assert.ok(f.world.oceanWorldPosition().distanceTo(start) > 1);
    f.world.paused = true; const paused = f.world.oceanWorldPosition(); f.world.updateDirectorMotion(2); assert.deepEqual(f.world.oceanWorldPosition(), paused);
    f.world.paused = false; f.world.updateDirectorMotion(8); assert.equal(f.world.directorMotion.elapsedSec, 16);
    assert.equal(f.world.directorMotion.complete, true); assert.equal(f.world.directorMotion.error, null);
    assert.deepEqual(f.ecology.snapshot(), snapshot); assert.deepEqual([...f.records], records, 'camera-only queries retain actual saved animal and food histories');
    f.world.updateKelpDriftFood();const roots=structuredClone(f.ecology._active.get(id).kelpUnderstoryLife.plants),beforePose=roots.map(a=>f.scenery.objects.get(a.id).object.userData.kelpUnderstoryLifeLastTimeSec);f.ecology.step(16,{foodSupply:1,currentMps:.18,hour:12});await f.ecology.checkpoint();f.world.updateKelpDriftFood();f.animals.update(f.ecology.agents,999999,f.world.oceanRenderOrigin);const owner=f.ecology._active.get(id);assert.equal(owner.kelpUnderstoryLife.counters.ticks,160);assert.ok(owner.kelpUnderstoryLifeAgents.every(a=>a.timeSec===16));assert.deepEqual(owner.kelpUnderstoryLife.plants,roots,'actual roots are attached through native observation duration');assert.ok(beforePose.every(t=>t===0));for(const a of roots)assert.equal(f.scenery.objects.get(a.id).object.userData.kelpUnderstoryLifeLastTimeSec,16);


  } finally { f.animals.dispose(); f.scenery.dispose(); }
  assert.equal(DIRECTOR_STEPS.length, 65); assert.equal(new Set(DIRECTOR_STEPS.map(step => step.action.id)).size, 59);
  assert.equal(DIRECTOR_STEPS.reduce((sum, step) => sum + step.durationMs, 0), 994000);
});

test('ordinary and direct-URL asynchronous UI results cannot overwrite a newer world, seed, control, disposal or entry toast', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const enterKelpUnderstoryCommunity=async()=>'), end = app.indexOf('  const enterKelpBottomLife=', start);
  assert.ok(start >= 0 && end > start); const fn = app.slice(start, end).trim().replace('const enterKelpUnderstoryCommunity=', 'return ');
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpUnderstoryLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
    const pending = invoke(); takeover(actual); resume(false); await pending;
    assert.equal(toast.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let reject; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpUnderstoryLife() { return new Promise((_resolve, no) => { reject = no; }); } }, current = { current: actual };
  const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
  const pending = invoke(); current.current = { sim: { seed: 'new-world' } }; reject(new Error('old pending failure')); await pending;
  assert.deepEqual(toast, []);
  const branchStart = app.indexOf('    if(choice.kelpUnderstoryLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  const branch = `return function(choice){${app.slice(branchStart, branchEnd)}}`;
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpUnderstoryLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
      current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text));
    invoke({ kelpUnderstoryLifeEntry: true }); takeover(actual); resume(true); await Promise.resolve(); await Promise.resolve();
    assert.equal(receipts.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let fail; const directToast = [], direct = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpUnderstoryLife() { return new Promise((_resolve, reject) => { fail = reject; }); } }, directCurrent = { current: direct };
  const directInvoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
    directCurrent, () => {}, () => {}, () => {}, () => directToast.push('remembered'), text => directToast.push(text));
  directInvoke({ kelpUnderstoryLifeEntry: true }); directCurrent.current = { sim: { seed: 'new-world' } }; fail(new Error('old direct URL failure'));
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(directToast, []);
});
