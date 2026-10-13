import { nativeTerrainWorkerFactory } from './helpers/ocean-terrain-node.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { nativePreparation } from './helpers/ocean-preparation-node.mjs';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { OceanAnimalEncounters } from '../src/world/oceanAnimalEncounters.js';
import { OceanLifeExpedition, expeditionTerrainClear, createLifeExpeditionPath, sampleLifeExpeditionView, expeditionPreparationPosition } from '../src/lifeExpedition.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { normalizeOceanObservationView } from '../src/oceanExplorationMemory.js';
import { oceanLayerHeight } from '../src/oceanLayerNavigation.js';
import { coastalSeascapeWindowReady } from '../src/coastalSeascapeMotion.js';
import { reefValleyRegionOrigin } from '../src/reefValleyRegion.js';
import { isDirectorPlaybackRate, advanceDirectorCameraElapsed } from '../src/directorCameraMotion.js';
import { DIRECTOR_LIFE_STEPS } from '../src/directorTour.js';

// Shipped native methods, real Three models and latest actual constructor
// options; there is no WebGL context, browser, image or FPS claim here.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
function method(name) {
  const marker = source.includes(`  async ${name}(`) ? `  async ${name}(` : `  ${name}(`;
  const start = source.indexOf(marker); assert.ok(start >= 0, name);
  const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
  return source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
}
const bindings = { THREE, clamp: THREE.MathUtils.clamp, normalizeOceanObservationView, oceanLayerHeight,
  isDirectorPlaybackRate, advanceDirectorCameraElapsed, coastalSeascapeWindowReady, reefValleyRegionOrigin,
  OceanLifeExpedition, expeditionTerrainClear, createLifeExpeditionPath, sampleLifeExpeditionView, expeditionPreparationPosition };
const World = new Function(...Object.keys(bindings), `return class {${[
  'oceanWorldPosition', 'currentReefValleyRegionPlan', 'enterReefValleyRegion', 'createReefValleyRegionSegment',
  'sampleReefValleyRegionSegment', 'updateReefValleyRegionMotion', 'beginDirectorMotion', 'directorMotionSnapshot',
  'setDirectorPlaybackRate', 'findAgent', 'restoreOceanObservation', 'setOceanRenderOrigin', 'oceanLayerY',
  'floorY', 'habitatY', 'clearCameraPosition', 'enforceCameraClearance', 'requestOceanEcology', 'expeditionPreparationPosition'
].map(method).join('\n')}}`)(...Object.values(bindings));
const clone = x => structuredClone(x), capture = rows => clone([...rows]).sort(([a], [b]) => a.localeCompare(b));
const equal = (a, b, label) => assert.ok(isDeepStrictEqual(a, b), label);
function fixture(records = []) {
  const seed = livingShallowsSeed('55'), chunks = new OceanChunks(seed, { livingGeology: true, wholeSeabed: process.env.EXPEDITION_WORLD_VARIANT === 'whole-seabed', progressiveStreaming: process.env.EXPEDITION_WORLD_VARIANT === 'whole-seabed', backgroundTerrain: process.env.EXPEDITION_WORLD_VARIANT === 'whole-seabed', terrainWorkerFactory: nativeTerrainWorkerFactory });
  chunks.generator = createLivingRidgeGenerator(chunks.generator.baseGenerator, { preparation: nativePreparation() });
  const generator = chunks.generator;
  const disk = new Map(clone(records)), commits = [], store = { available: true,
    async load(world, id) { return clone(disk.get(`${world}|${id}`) ?? null); },
    async saveMany(world, entries) { for (const [id, row] of entries) disk.set(`${world}|${id}`, clone(row)); commits.push(entries.map(([id]) => id)); } };
  const start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'), end = source.indexOf(');', start) + 1;
  class Options { constructor(_seed, _generator, options) { this.options = options; } }
  const options = new Function('OceanEcology', 'seed', 'return ' + source.slice(start, end))
    .call({ isLivingShallows: true, oceanWorldVariant: process.env.EXPEDITION_WORLD_VARIANT ?? 'reef-bottom-life', oceanChunks: { generator } }, Options, seed).options;
  const ecology = new OceanEcology(seed, generator, { ...options, store }), world = new World();
  const animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  Object.assign(world, { isLivingShallows: true, isKelp: false, isDeep: false, biomeId: 'reef', disposed: false,
    oceanEcologyResetting: false, oceanExploring: true, sim: { seed, agents: [], metrics: { timeSec: 0 }, environment: { hour: 10, currentMps: .15, turbidity: .25, foodSupply: 1 } },
    elapsed: 0, errors: [], paused: false, controlStartCount: 0, keys: new Set(), surfaceY: generator.surfaceY,
    camera: new THREE.PerspectiveCamera(49, 16 / 9, .05, 160), oceanRenderOrigin: { x: 0, z: 0 },
    controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: .18, maxDistance: 30, enableDamping: true,
      update() { world.camera.lookAt(this.target); world.camera.updateMatrixWorld(true); } },
    highlight: new THREE.Group(), cameraRocks: [], entities: new Map(), catalog: new Map(livingShallowsSpeciesCatalog.map(s => [s.id, s])),
    oceanEcology: ecology, oceanChunks: chunks, oceanAnimals: animals, oceanAnimalEncounters: new OceanAnimalEncounters(),
    select() {}, onSelect() {}, emitSnapshot() {}, updateKelpDriftFood() {} });
  return { world, chunks, generator, ecology, animals, disk, commits };
}
async function release(f) { f.world.disposed = true; await f.ecology._pending; f.animals.dispose(); await f.ecology.dispose(); f.chunks.dispose(); }
function bounded(f) {
  assert.equal(f.ecology._active.size, 9); assert.ok(f.chunks.stats.activeChunks > 0 && f.chunks.stats.activeChunks <= 9);
  const p=f.world.oceanWorldPosition(); assert.ok(f.chunks.stats.loadedChunks.includes(`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`),'current camera terrain is loaded');
  assert.ok(f.ecology._supportCells.size <= 25); assert.ok(f.generator.registryStats().size <= 25);
  assert.ok(f.ecology._reefValleyAdmission.privateOwnerCount <= 97);
  assert.ok([...f.ecology._active.values()].every(r => r.agents.length + (r.turtleAgents?.length ?? 0) <= 20));
}

test('latest native expedition preloads adjacent windows in a worker, completes both branches and restores full history and future exactly',async()=>{
 let f=fixture(),cold;
 try{
  assert.equal(await f.world.enterReefValleyRegion(),true);bounded(f);
  const plan=f.world.currentReefValleyRegionPlan();if(process.env.EXPEDITION_WORLD_VARIANT==='whole-seabed')assert.equal(plan.group.wholeSeabedVersion,1);const oldTerrain=JSON.stringify(plan),beforeCounts=[...f.disk.values()].reduce((n,r)=>n+r.agents.length+(r.turtleAgents?.length??0),0);
  assert.equal(f.world.beginDirectorMotion({...DIRECTOR_LIFE_STEPS[0].motion}),true);
  const segment=f.world.directorMotion.reefValleySegments[0];assert.equal(segment.branches,2);
  const heights=[],owners=new Set(),outerOwners=new Set(),timings=[];let publishedCenter=null,frames=0,preparingFrames=0,progressDuringPrepare=0,modelSteps=0,terrainWaitingFrames=0,motionSamples=0;
  // Preparation also advances the actual camera. Sample both paths: otherwise a
  // slower worker can move through whole owners that the outer loop never sees.
  const sampleMotion=(dt,duringPreparation=false)=>{
   const before=f.world.directorMotionSnapshot();f.world.updateReefValleyRegionMotion(dt);
   const after=f.world.directorMotionSnapshot();assert.equal(after.error,null);
   if(after.elapsedSec>before.elapsedSec){
    assert.ok(Math.hypot(...['x','y','z'].map(k=>after.worldPosition[k]-before.worldPosition[k]))<1.4,'continuous bounded camera displacement');
    const pos=after.worldPosition,owner=`${Math.floor(pos.x/64)},${Math.floor(pos.z/64)}`;
    owners.add(owner);if(!duringPreparation)outerOwners.add(owner);
    heights.push(pos.y-f.world.floorY(pos.x,pos.z));motionSamples++;
   }
   return {before,after};
  };
  while(!f.world.directorMotion.complete){
   const p=f.world.oceanWorldPosition(),next=f.world.expeditionPreparationPosition(p),center=`${Math.floor(next.x/64)},${Math.floor(next.z/64)}`;
   if(center!==publishedCenter){
    let settled=false,failure;const start=performance.now();
    const pending=f.ecology.update(next).then(()=>{settled=true;},error=>{failure=error;settled=true;});
    while(!settled){
     await new Promise(resolve=>setTimeout(resolve,0));
     const {before,after}=sampleMotion(.05,true);
     preparingFrames++;if(after.elapsedSec>before.elapsedSec)progressDuringPrepare++;
     // Finite live tick probes during preparation, not a real-time FPS test.
     if(preparingFrames%200===0&&modelSteps<80){f.ecology.step(.1,f.world.sim.environment);modelSteps++;}
     assert.ok(f.ecology._active.size<=9);assert.ok(f.generator.registryStats().size<=25);
     f.chunks.update(f.world.oceanWorldPosition());
    }
    await pending;if(failure)throw failure;publishedCenter=center;bounded(f);
    timings.push({center,ms:performance.now()-start,preparation:f.ecology._reefValleyTiming?.preparation});
   }
   const {before,after}=sampleMotion(.5);
   if(after.elapsedSec===before.elapsedSec&&!after.complete) {
    assert.equal(after.waitingForRegions,true,'only a real unloaded/unactivated owner may hold the camera');
    const blocked=f.world.directorMotion.waitingPosition;assert.ok(blocked);
    equal(f.world.expeditionPreparationPosition(f.world.oceanWorldPosition()),blocked,'actual next required owner overrides speculative lookahead');
    const start=performance.now();await f.chunks.prepareWindow(f.world.oceanWorldPosition());
    assert.ok(performance.now()-start<15000,'bounded native terrain completion');
    terrainWaitingFrames++;assert.ok(terrainWaitingFrames<40,'route cannot cycle indefinitely at an owner boundary');
    publishedCenter=null;continue;
   }
   assert.ok(after.elapsedSec>before.elapsedSec||after.complete,'loaded current owner continues');
   const pos=after.worldPosition;
   if(after.elapsedSec>before.elapsedSec){
    frames++;
    if(frames%40===0){f.ecology.step(.1,f.world.sim.environment);modelSteps++;f.animals.update(f.ecology.agents,f.ecology._activeTime,f.world.oceanRenderOrigin,f.world.camera.position,f.ecology.scenery);}
   }
   f.chunks.update(pos);assert.ok(frames<600);
  }
  assert.equal(f.world.directorMotion.elapsedSec,240);assert.ok(progressDuringPrepare>0);assert.ok(owners.size>=6,`full actual camera sampling visits six owners: ${[...owners].join('; ')}`);
  assert.equal(motionSamples,progressDuringPrepare+frames,'all preparation and outer motion steps were sampled');
  assert.ok(Math.max(...heights)-Math.min(...heights)>1.4);assert.equal(JSON.stringify(plan),oldTerrain);
  const report=f.world.oceanLifeExpedition.stats();assert.deepEqual(report.habitats,['reef','sand','meadow','slope']);assert.ok(report.individuals>0);
  const end=f.world.oceanWorldPosition();await f.ecology.update(end);await f.ecology.checkpoint();bounded(f);
  const disk=capture(f.disk),active=capture(f.ecology._active),total=[...f.disk.values()].reduce((n,r)=>n+r.agents.length+(r.turtleAgents?.length??0),0);
  writeFileSync(new URL(`../output/validation/${process.env.EXPEDITION_RECEIPT_PREFIX ?? 'background'}-expedition-cold-input.json`,import.meta.url),JSON.stringify({disk,active,end,timings,frames,preparingFrames,progressDuringPrepare,modelSteps,terrainWaitingFrames,report,heights,beforeCounts,total,terrain:plan}));
  cold=fixture(disk);const loaded=await cold.ecology.update(end);
  assert.notEqual(loaded,false,`cold load: ${cold.ecology._storageError}; counts=${JSON.stringify(cold.ecology._counts)}`);
  cold.world.camera.position.set(end.x,end.y,end.z); cold.chunks.update(end);await cold.chunks.prepareWindow(end);bounded(cold);
  equal(capture(cold.ecology._active),active,'complete cold active records');equal(capture(cold.disk),disk,'complete cold disk records');
  for(let i=0;i<3;i++){f.ecology.step(.1,f.world.sim.environment);cold.ecology.step(.1,f.world.sim.environment);}equal(capture(cold.ecology._active),capture(f.ecology._active),'future decisions and food exact');
  const result={scope:'actual 240s camera route with finite live tick probes and native Three objects; not 240 model seconds, browser images, FPS or visible species acceptance',
   branches:segment.branches,routeM:f.world.directorMotion.travelledM,frames,preparingFrames,progressDuringPrepare,terrainWaitingFrames,modelSteps,modelSeconds:modelSteps*.1,
   cameraOwners:[...owners],outerCameraOwners:[...outerOwners],motionSamples,heightRangeM:[Math.min(...heights),Math.max(...heights)],timings,report,beforeCounts,total,
   originalCommittedTerrainExact:true,completeColdActiveAndDiskExact:true,futureThreeStepsExact:true};
  writeFileSync(new URL(`../output/validation/${process.env.EXPEDITION_RECEIPT_PREFIX ?? 'background'}-expedition-native.json`,import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,report:undefined,timings:undefined}));
 }finally{if(f)await release(f);if(cold)await release(cold);}
});
