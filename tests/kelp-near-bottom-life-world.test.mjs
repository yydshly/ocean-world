import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { KelpOceanAnimals } from '../src/world/KelpOceanAnimals.js';
import { KELP_NEAR_BOTTOM_LIFE_IDS, kelpNearBottomLifePositionValid, validateKelpNearBottomLifeRecord } from '../src/kelpNearBottomLife.js';
import { KELP_NEAR_BOTTOM_LIFE_ROUTE_STOPS } from '../src/kelpNearBottomLifeRoutes.js';
import { kelpNearBottomLifeSpeciesById } from '../src/kelpNearBottomLifeSpecies.js';
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
const World = new Function('THREE', 'clamp', 'normalizeOceanObservationView', 'oceanLayerHeight', 'KELP_NEAR_BOTTOM_LIFE_IDS', 'kelpNearBottomLifeSpeciesById',
  'isDirectorPlaybackRate', 'createDirectorCameraMotion', 'sampleDirectorCameraMotion', 'advanceDirectorCameraElapsed',
  `return class {${['oceanWorldPosition', 'enterKelpNearBottomLife', 'enterKelpForestBelt', 'travelKelpForestBelt',
    'kelpNearBottomLifeObservation', 'prepareDirectorObservation', 'beginDirectorMotion', 'directorMotionQueries', 'updateDirectorMotion', 'findAgent',
    'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY', 'floorY', 'habitatY',
    'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology'].map(method).join('\n')}}`)(
  THREE, THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight, KELP_NEAR_BOTTOM_LIFE_IDS, kelpNearBottomLifeSpeciesById,
  isDirectorPlaybackRate, createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed);
function fixture({ records = new Map(), nearBottomLife = true } = {}) {
  const generator = createKelpOceanGenerator('42', { forestBelt: true, kelpSeascape: true }), commits = [];
  const store = { available: true,
    async load(_world,id) { store.onRead?.(id); if(store.beforeRead) await store.beforeRead; if(store.readFault==='undefined') return undefined; if(store.readFault==='throw') throw new Error('native store read failure'); return structuredClone(records.get(id)??null); },
    async saveMany(_world, rows) { if(store.saveFault) return null; commits.push(structuredClone(rows)); for (const [id, row] of rows) records.set(id, structuredClone(row)); },
  };
  const ecology = new KelpOceanEcology('42', generator, { store, forestBelt: true, kelpSeascape: true, understory: true, visitors: true, benthicLife: true, waterLife: true, nearBottomLife });
  const world = new World(), animals = new KelpOceanAnimals(sceneCatalogs.kelp), updates = [], requests = [], views = [];
  Object.assign(world, { biomeId: 'kelp', isKelp: true, isDeep: false, isLivingShallows: false, disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed: '42', agents: [], environment: { hour: 14 }, metrics: { timeSec: 0 } },
    elapsed: 0, errors: [], controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY, oceanRenderOrigin: { x: 0, z: 0 },
    camera: new THREE.PerspectiveCamera(49, 16 / 9),
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30,
      enableDamping: true, update() {} }, highlight: new THREE.Group(), cameraRocks: [],
    oceanEcology: ecology, oceanAnimals: animals,
    oceanChunks: { generator, update(position) { updates.push(position.clone()); }, setRenderOrigin() {}, setDetailedHosts() {} },
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {},
  });
  const request = world.requestOceanEcology.bind(world), restore = world.restoreOceanObservation.bind(world);
  world.requestOceanEcology = position => { requests.push(position.clone()); return request(position); };
  world.restoreOceanObservation = view => { views.push(structuredClone(view)); return restore(view); };
  const stop = generator.kelpNearBottomLifeRouteStops.find(row => row.id === 'kelp-near-bottom-life'); assert.ok(stop);
  return { world, ecology, generator, records, commits, store, animals, updates, requests, views, stop };
}
const settle = async f => { await f.ecology._pending; await Promise.resolve(); };
const target = world => world.controls.target.clone().add(new THREE.Vector3(world.oceanRenderOrigin.x, 0, world.oceanRenderOrigin.z));
const anchorOf=life=>{const a=[...life].sort((a,b)=>b.sizeM-a.sizeM||a.id.localeCompare(b.id))[0];if(!a)return null;const e=kelpNearBottomLifeSpeciesById[a.speciesId].normalizedEnvelope,mid=(e.y[0]+e.y[1])*.5*a.sizeM,up=a.speciesId==='red-rock-crab'?a.supportNormal:{x:-Math.cos(a.heading)*Math.sin(a.pitch??0),y:Math.cos(a.pitch??0),z:-Math.sin(a.heading)*Math.sin(a.pitch??0)};return{x:a.position.x+up.x*mid,y:a.position.y+up.y*mid,z:a.position.z+up.z*mid};};

test('ordinary entry persists real native bodies before focus, advances integer clocks and restores living and dead records',async t=>{
  const f=fixture();t.after(()=>f.animals.dispose());assert.equal(await f.world.enterKelpNearBottomLife(),true);await settle(f);
  const id=`${Math.floor(f.stop.x/64)},${Math.floor(f.stop.z/64)}`,row=f.records.get(id),r=f.ecology._active.get(id);assert.equal(row.kelpNearBottomLifeVersion,1);assert.equal(f.ecology._active.size,9);
  assert.ok(f.commits.some(batch=>batch.some(([key,value])=>key===id&&value.kelpNearBottomLifeVersion===1)));
  const actual=f.ecology.agents.filter(a=>a.regionId===id&&a.alive&&a.kelpNearBottomIndividualVersion===1);assert.equal(actual.length,4);assert.deepEqual(actual.map(a=>a.speciesId).sort(),[...KELP_NEAR_BOTTOM_LIFE_IDS].sort());assert.equal(new Set(actual.map(a=>a.id)).size,4);
  assert.ok(actual.every(a=>a.timeSec===row.state.timeSec));const anchor=anchorOf(actual);assert.ok(new THREE.Vector3(anchor.x,anchor.y,anchor.z).distanceTo(target(f.world))<.05);
  f.animals.update(f.ecology.agents,99999,f.world.oceanRenderOrigin,f.world.camera.position);for(const a of actual)assert.ok(f.animals.entities.has(a.id),a.speciesId+' actual mesh');
  const p=f.world.oceanWorldPosition();assert.ok(p.y>=f.generator.heightForCamera(p.x,p.z)+.25-1e-8&&p.y<=f.generator.surfaceY-.5);
  const birth=structuredClone(actual);f.ecology.step(.4,{foodSupply:0,currentMps:.18,hour:12});await f.ecology.checkpoint();
  const moved=f.ecology.agents.filter(a=>a.regionId===id&&a.kelpNearBottomIndividualVersion===1);assert.ok(moved.every(a=>a.timeSec===.4));assert.equal(r.kelpNearBottomLife.counters.ticks,4);assert.ok(moved.every(a=>kelpNearBottomLifePositionValid(f.generator,r,a)));
  assert.ok(moved.some(a=>Math.hypot(...['x','y','z'].map(k=>a.position[k]-birth.find(b=>b.id===a.id).position[k]))>1e-6),'real native movement');
  // Controlled starvation transfers existing condition to its debit; the
  // actual next tick causes death, preserving birth and organic food stocks.
  const victim=r.kelpNearBottomLifeAgents[0];r.kelpNearBottomEnergyLedger.maintenanceAndMotionDebit+=victim.energy-1e-8;victim.energy=1e-8;
  assert.equal(validateKelpNearBottomLifeRecord(r,r,{generator:f.generator}),true);f.ecology.step(.1,{foodSupply:0,currentMps:.18,hour:12});assert.equal(victim.alive,false);assert.equal(victim.timeSec,.5);
  const dead=structuredClone(victim);f.ecology.step(.2,{foodSupply:0,currentMps:.18,hour:12});await f.ecology.checkpoint();assert.deepEqual(victim,dead,'dead pose and individual clock frozen');
  f.animals.update(f.ecology.agents,800000,f.world.oceanRenderOrigin);assert.equal(f.animals.getObject(victim.id),null);
  const before=structuredClone([...f.records]),cold=fixture({records:f.records});t.after(()=>cold.animals.dispose());assert.equal(await cold.world.enterKelpNearBottomLife(),true);await settle(cold);assert.deepEqual([...cold.records],before);assert.deepEqual(cold.ecology.agents.find(a=>a.id===dead.id),f.ecology.agents.find(a=>a.id===dead.id));
  assert.equal(f.world.errors.length+cold.world.errors.length,0);cold.world.oceanEcologyResetting=true;assert.equal(cold.world.kelpNearBottomLifeObservation(),null);cold.world.oceanEcologyResetting=false;cold.world.oceanChunks=null;assert.equal(cold.world.kelpNearBottomLifeObservation(),null);
});

test('historical forest owners retain all animals hosts food and clocks without near-bottom-life refill or empty director success', async t => {
  const old = fixture({ nearBottomLife: false }); t.after(() => old.animals.dispose());
  assert.equal(old.world.enterKelpForestBelt(old.stop.id), true); await settle(old); await old.ecology.checkpoint();
  const before = structuredClone([...old.records]), enabled = fixture({ records: old.records }); t.after(() => enabled.animals.dispose());
  assert.equal(await enabled.world.enterKelpNearBottomLife(), false); await settle(enabled);
  assert.deepEqual([...enabled.records], before); assert.ok(!enabled.ecology.agents.some(agent => agent.kelpNearBottomIndividualVersion === 1));
  assert.ok(![...enabled.records.values()].some(row => row.kelpNearBottomLifeVersion === 1));
  const position = enabled.world.oceanWorldPosition(), viewTarget = target(enabled.world), viewCount = enabled.views.length;
  assert.equal(enabled.world.kelpNearBottomLifeObservation(), null);
  assert.equal(enabled.world.prepareDirectorObservation({ routeId: 'kelp-near-bottom-life' }), false);
  assert.deepEqual(enabled.world.oceanWorldPosition(), position); assert.deepEqual(target(enabled.world), viewTarget);
  assert.equal(enabled.views.length, viewCount); assert.deepEqual([...enabled.records], before, 'a director chapter cannot create absent historical animals');
});

test('both actual preparation windows respect late view control seed keys reset disposal and newer navigation',async t=>{
  const baseline=fixture();t.after(()=>baseline.animals.dispose());assert.equal(await baseline.world.enterKelpNearBottomLife(),true);await settle(baseline);
  const takeovers=[w=>{w.camera.position.x+=2;},w=>{w.controls.target.z+=2;},w=>{w.controlStartCount++;},w=>{w.sim.seed='other';},w=>{w.disposed=true;},w=>{w.oceanEcologyResetting=true;},w=>{w.keys.add('KeyW');},w=>{w.directorMotion={};},w=>{w.directorEntry={active:true};},w=>{w._kelpSceneEntryToken++;},w=>{w.enterKelpForestBelt('kelp-near-bottom-life');},w=>{w.travelKelpForestBelt('kelp-near-bottom-life');}];
  for(const takeover of takeovers){const f=fixture({records:new Map(structuredClone([...baseline.records]))});t.after(()=>f.animals.dispose());let resume,started;f.store.beforeRead=new Promise(resolve=>{resume=resolve;});const read=new Promise(resolve=>{started=resolve;});f.store.onRead=()=>started();const pending=f.world.enterKelpNearBottomLife();await read;takeover(f.world);const p=f.world.oceanWorldPosition(),view=target(f.world),views=f.views.length,records=structuredClone([...f.records]);resume();assert.equal(await pending,false);await settle(f);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(target(f.world),view);assert.equal(f.views.length,views);assert.deepEqual([...f.records],records);}
  const f=fixture({records:new Map(structuredClone([...baseline.records]))});t.after(()=>f.animals.dispose());f.world.requestOceanEcology=()=>{};let resume,started;const ready=new Promise(resolve=>{started=resolve;}),update=f.ecology.update.bind(f.ecology);let calls=0;f.ecology.update=async p=>{if(++calls===2){started();await new Promise(resolve=>{resume=resolve;});}return update(p);};const pending=f.world.enterKelpNearBottomLife();await ready;f.world.keys.add('KeyS');const p=f.world.oceanWorldPosition(),view=target(f.world);resume();assert.equal(await pending,false);await settle(f);assert.deepEqual(f.world.oceanWorldPosition(),p);assert.deepEqual(target(f.world),view);
});

test('failed actual reads and commits never expose a fresh community or invented observation focus',async t=>{
  for(const fault of['undefined','throw','save-refused']){const f=fixture();t.after(()=>f.animals.dispose());if(fault==='save-refused')f.store.saveFault=true;else f.store.readFault=fault;assert.equal(await f.world.enterKelpNearBottomLife(),false);await settle(f);assert.equal(f.views.length,1);assert.equal(f.records.size,0);assert.equal(f.ecology._active.size,0);assert.equal(f.animals.stats.activeAnimals,0);assert.equal(f.world.kelpNearBottomLifeObservation(),null);}
  for(const block of[w=>{w.isKelp=false;},w=>{w.disposed=true;},w=>{w.oceanEcologyResetting=true;},w=>{w.oceanEcology=null;}]){const f=fixture();t.after(()=>f.animals.dispose());block(f.world);assert.equal(await f.world.enterKelpNearBottomLife(),false);assert.equal(f.views.length,0);assert.equal(f.records.size,0);}
});

test('direct URL, ordinary control and moving director use the native route and frame actual life before a finite moving shot', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('kelpSeascape:true,benthicLife:true,waterLife:true,nearBottomLife:true'));
  assert.match(app, /get\('demo'\)==='kelp-near-bottom-life'[\s\S]{0,260}kelpNearBottomLifeEntry:true/);
  assert.match(app, /onClick=\{enterKelpNearBottomCommunity\}>岩沙底层群落/);
  const branchStart = app.indexOf('    if(choice.kelpNearBottomLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.ok(app.slice(branchStart, branchEnd).includes('actual.enterKelpNearBottomLife()'));
  assert.equal(sceneCatalogs.kelp.length, 24); assert.equal(sceneCatalogs.kelp.filter(species => species.kind !== 'kelp').length, 21);
  assert.deepEqual(KELP_NEAR_BOTTOM_LIFE_ROUTE_STOPS.map(stop => stop.id), ['kelp-near-bottom-life']);
  const entry = DEMO_KELP_STOPS.find(stop => stop.id === 'kelp-near-bottom-life'), chapter = DIRECTOR_STEPS.find(step => step.action.stopId === 'kelp-near-bottom-life');
  assert.ok(entry && chapter); assert.equal(chapter.motion.kind, 'walk'); assert.equal(chapter.durationMs, 16000);
  assert.equal(chapter.motion.routeId, 'kelp-near-bottom-life');
  assert.equal(chapter.context.biome, 'kelp'); assert.equal(entry.action.kind, 'kelp-stop');
  const f = fixture(); try {
    f.world.requestOceanEcology = () => {};
    assert.equal(navigateDemoEntry(directorStepAction(chapter), f.world), true);
    assert.ok(Math.hypot(f.world.oceanWorldPosition().x - f.stop.x, f.world.oceanWorldPosition().z - f.stop.z) < 20);
    for (const stop of [...f.generator.forestRouteStops, ...f.generator.kelpSeascapeRouteStops]) assert.ok(DIRECTOR_STEPS.some(step => step.action.stopId === stop.id));
    assert.equal(await f.ecology.update(f.world.oceanWorldPosition()), true); await settle(f);
    assert.equal(f.ecology._active.size, 9);
    const id = `${Math.floor(f.stop.x / 64)},${Math.floor(f.stop.z / 64)}`;
    const life = f.ecology.agents.filter(agent => agent.regionId === id && agent.alive && agent.kelpNearBottomIndividualVersion === 1);
    assert.ok(life.length > 0); const anchor = anchorOf(life);
    const records = structuredClone([...f.records]), snapshot = structuredClone(f.ecology.snapshot());
    const nativePosition = f.world.oceanWorldPosition(), nativeTarget = target(f.world), view = f.world.kelpNearBottomLifeObservation();
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
    assert.ok(life.some(a => { const v = new THREE.Vector3(a.position.x,a.position.y,a.position.z).project(camera);
      return Math.abs(v.x)<1 && Math.abs(v.y)<1 && v.z>-1 && v.z<1; }), 'a real independent near-bottom animal enters the initial native camera frustum');
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
    const birth=structuredClone(life);f.ecology.step(16,{foodSupply:0,currentMps:.18,hour:12});await f.ecology.checkpoint();const advanced=f.ecology.agents.filter(a=>a.regionId===id&&a.kelpNearBottomIndividualVersion===1);assert.equal(f.ecology._active.get(id).kelpNearBottomLife.counters.ticks,160);assert.ok(advanced.every(a=>a.timeSec===16));assert.ok(advanced.some(a=>Math.hypot(...['x','y','z'].map(k=>a.position[k]-birth.find(b=>b.id===a.id).position[k]))>1e-6),'separately advanced native animals move through observation duration');

  } finally { f.animals.dispose(); }
  assert.equal(DIRECTOR_STEPS.length, 67); assert.equal(new Set(DIRECTOR_STEPS.map(step => step.action.id)).size, 61);
  assert.equal(DIRECTOR_STEPS.reduce((sum, step) => sum + step.durationMs, 0), 1994000);
});

test('ordinary and direct-URL asynchronous UI results cannot overwrite a newer world, seed, control, disposal or entry toast', async () => {
  const app = readFileSync(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const enterKelpNearBottomCommunity=async()=>'), end = app.indexOf('  const enterKelpBottomLife=', start);
  assert.ok(start >= 0 && end > start); const fn = app.slice(start, end).trim().replace('const enterKelpNearBottomCommunity=', 'return ');
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpNearBottomLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
    const pending = invoke(); takeover(actual); resume(false); await pending;
    assert.equal(toast.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let reject; const toast = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpNearBottomLife() { return new Promise((_resolve, no) => { reject = no; }); } }, current = { current: actual };
  const invoke = new Function('world', 'director', 'setPendingDemo', 'setToast', fn)(current, { stop() {} }, () => {}, text => toast.push(text));
  const pending = invoke(); current.current = { sim: { seed: 'new-world' } }; reject(new Error('old pending failure')); await pending;
  assert.deepEqual(toast, []);
  const branchStart = app.indexOf('    if(choice.kelpNearBottomLifeEntry&&choice.directorToken===undefined)'), branchEnd = app.indexOf('    if(choice.kelpBenthicLifeEntry&&choice.directorToken===undefined)', branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  const branch = `return function(choice){${app.slice(branchStart, branchEnd)}}`;
  for (const takeover of [() => {}, world => { world.disposed = true; }, world => { world.sim.seed = 'new'; }, world => { world.controlStartCount++; }, world => { world._kelpSceneEntryToken++; }]) {
    let resume; const receipts = [], actual = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 0, disposed: false,
      enterKelpNearBottomLife() { this._kelpSceneEntryToken++; return new Promise(resolve => { resume = resolve; }); } }, current = { current: actual };
    const invoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
      current, () => {}, () => {}, () => {}, () => receipts.push('remembered'), text => receipts.push(text));
    invoke({ kelpNearBottomLifeEntry: true }); takeover(actual); resume(true); await Promise.resolve(); await Promise.resolve();
    assert.equal(receipts.length, actual.disposed || actual.sim.seed !== '42' || actual.controlStartCount || actual._kelpSceneEntryToken !== 1 ? 0 : 1);
  }
  let fail; const directToast = [], direct = { sim: { seed: '42' }, controlStartCount: 0, _kelpSceneEntryToken: 1, disposed: false,
    enterKelpNearBottomLife() { return new Promise((_resolve, reject) => { fail = reject; }); } }, directCurrent = { current: direct };
  const directInvoke = new Function('world', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', branch)(
    directCurrent, () => {}, () => {}, () => {}, () => directToast.push('remembered'), text => directToast.push(text));
  directInvoke({ kelpNearBottomLifeEntry: true }); directCurrent.current = { sim: { seed: 'new-world' } }; fail(new Error('old direct URL failure'));
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(directToast, []);
});
