import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import * as THREE from 'three';
import { deepFloorHeight } from '../src/deepHabitat.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX, reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfacePoint, reefRockSurfaceY } from '../src/habitat.js';
import { REEF_AUXILIARY_ROCKS } from '../src/reefScenery.js';

const evidencePrefix=process.argv[2];
if(process.argv.length>3||(evidencePrefix&&!/^[a-z][a-z0-9-]*$/.test(evidencePrefix)))throw new Error('Pass an optional fresh evidence prefix.');
const integrationOutput=evidencePrefix?`output/validation/${evidencePrefix}-world-integration.json`:'output/validation/world-integration-smoke.json';
const warmupOutput=evidencePrefix?`output/validation/${evidencePrefix}-world-warmup.json`:'output/validation/world-warmup-pause-resource-smoke.json';
for(const file of [integrationOutput,warmupOutput]){
  try{await access(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw new Error(`Preserving existing ${file}; choose a fresh evidence prefix.`);
}

// This test executes the real Three.js geometries, model, world positioning,
// raycaster and resource disposers. Only WebGLRenderer, OrbitControls and the
// browser platform are substitutes. It does not measure FPS or compile GLSL.
const host = { children: [], clientWidth: 1920, clientHeight: 1080,
  appendChild(canvas) { this.children.push(canvas); canvas.parent = this; } };
const windowHandlers = new Map();
const createdCanvases = [], renderers = [], controls = [], observers = [];
let rendererFailure = false, warmupRenderFailure = false, warmupCompileFailure = false;
class Canvas {
  constructor() { this.style = {}; this.handlers = new Map(); this.losses = 0; this.removed = false; createdCanvases.push(this); }
  setAttribute() {}
  addEventListener(name, handler) { this.handlers.set(name, handler); }
  removeEventListener(name) { this.handlers.delete(name); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; }
  getContext() {
    const canvas = this;
    return { RENDERER: 1, getParameter() { return 'Node substitute — no GPU'; },
      getExtension(name) { return name === 'WEBGL_lose_context' ? { loseContext() { canvas.losses++; } } : null; } };
  }
  remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(value => value !== this); }
}
globalThis.document = { visibilityState: 'visible', createElement() { return new Canvas(); } };
globalThis.window = { devicePixelRatio: 1,
  addEventListener(name, handler) { windowHandlers.set(name, handler); },
  removeEventListener(name, handler) { if (windowHandlers.get(name) === handler) windowHandlers.delete(name); } };
globalThis.ResizeObserver = class {
  constructor() { this.disconnections = 0; observers.push(this); }
  observe() {}
  disconnect() { this.disconnections++; }
};
globalThis.__OceanSmokeRenderer = class {
  constructor({ canvas, context }) {
    if (rendererFailure) throw new Error('injected WebGLRenderer-construction failure');
    this.domElement = canvas; this.context = context; this.shadowMap = {}; this.disposals = 0;
    this.target=null;this.viewport=new THREE.Vector4(0,0,1920,1080);this.scissor=new THREE.Vector4(0,0,1920,1080);this.scissorTest=true;
    this.uploadedGeometries=new Set();this.uploadedTextures=new Set();this.warmupPasses=[];this.compiles=[];this.targetDisposals=new Map();
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } }; renderers.push(this);
  }
  getContext() { return this.context; }
  setPixelRatio(value) { this.pixelRatio = value; }
  getPixelRatio() { return this.pixelRatio; }
  setSize() {}
  setAnimationLoop(callback) { this.loop = callback; }
  getRenderTarget(){return this.target;}
  getActiveCubeFace(){return 0;}
  getActiveMipmapLevel(){return 0;}
  setRenderTarget(target){
    this.target=target;
    if(target&&!this.targetDisposals.has(target)){
      this.targetDisposals.set(target,0);
      target.addEventListener('dispose',()=>this.targetDisposals.set(target,this.targetDisposals.get(target)+1));
    }
  }
  getViewport(target){return target.copy(this.viewport);}
  getScissor(target){return target.copy(this.scissor);}
  getScissorTest(){return this.scissorTest;}
  setViewport(x,y,width,height){if(x.isVector4)this.viewport.copy(x);else this.viewport.set(x,y,width,height);}
  setScissor(x,y,width,height){if(x.isVector4)this.scissor.copy(x);else this.scissor.set(x,y,width,height);}
  setScissorTest(value){this.scissorTest=value;}
  render(scene, camera) {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    if(this.target){
      let objects=0,allVisible=true,allUnculled=true;
      scene.traverse(object=>{objects++;allVisible&&=object.visible;allUnculled&&=!object.frustumCulled;});
      this.warmupPasses.push({target:this.target,width:this.target.width,height:this.target.height,
        shadowsEnabled:this.shadowMap.enabled,viewport:this.viewport.toArray(),scissorTest:this.scissorTest,objects,allVisible,allUnculled});
      if(warmupRenderFailure){monitorWarmupFailure(this,scene);throw new Error('injected warmup render failure');}
    }
    // Explicit CPU bookkeeping substitute: it models first registration of
    // visible buffer/texture identities, not WebGL uploads or shader execution.
    scene.traverseVisible(object=>{
      if(object.geometry)this.uploadedGeometries.add(object.geometry);
      for(const material of object.material?Array.isArray(object.material)?object.material:[object.material]:[]){
        for(const value of Object.values(material))if(value?.isTexture)this.uploadedTextures.add(value);
      }
    });
    this.info.memory.geometries=this.uploadedGeometries.size;this.info.memory.textures=this.uploadedTextures.size;
  }
  compile(scene){
    this.compiles.push({target:this.target,shadowsEnabled:this.shadowMap.enabled});
    if(warmupCompileFailure){monitorWarmupFailure(this,scene);throw new Error('injected warmup compile failure');}
  }
  dispose() { this.disposals++; }
};
globalThis.__OceanSmokeControls = class {
  constructor(camera) { this.camera = camera; this.target = new THREE.Vector3(); this.handlers = new Map(); this.disposals = 0; controls.push(this); }
  addEventListener(name, handler) { this.handlers.set(name, handler); }
  removeEventListener(name) { this.handlers.delete(name); }
  update() { this.camera.lookAt(this.target); this.camera.updateMatrixWorld(true); }
  dispose() { this.disposals++; }
};
const textureLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function (path) { const texture = new THREE.Texture(); texture.userData.path = path; return texture; };

const sourcePaths = [
  'scripts/check-world-integration.mjs','src/world/reefRockMaterial.js','src/world/reefCoralMaterial.js','src/world/reefLandscapePlacement.js','src/world/reefLandscapeDetail.js',
  'src/world/ReefWorld.js', 'src/world/reefTerrain.js', 'src/world/reefSpatialQueries.js', 'src/world/reefScanPlacement.js', 'src/world/reefScanDisplay.js', 'src/world/organisms.js', 'src/world/kelpOrganisms.js', 'src/world/deepOrganisms.js',
  'src/simulation.js', 'src/kelpSimulation.js', 'src/deepSimulation.js', 'src/habitat.js', 'src/reefScenery.js', 'src/kelpHabitat.js',
  'src/deepHabitat.js', 'src/sceneCatalog.js', 'scripts/check-world-integration.mjs',
];
async function hashes() {
  return Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
}
const before = await hashes();
const server = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps:{noDiscovery:true,include:[]}, plugins: [{
  name: 'world-smoke-explicit-platform-substitutes', enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/world/ReefWorld.js')) return null;
    assert.match(code, /new THREE\.WebGLRenderer\(/); assert.match(code, /new OrbitControls\(/);
    return code.replace('new THREE.WebGLRenderer(', 'new globalThis.__OceanSmokeRenderer(')
      .replace('new OrbitControls(', 'new globalThis.__OceanSmokeControls(');
  },
}] });
let checks = [];
const report = { schema: 'world-integration-smoke-v2', observedAtUtc: new Date().toISOString(),
  scope: 'Real Three.js geometry, simulation, raycasting and disposal in Node; explicit renderer/control/browser substitutes.',
  sourceSha256: before, biomes: {}, initializationFailures: [], limitations: [
    'No browser screenshot, real GPU performance, rendered colour judgement or GLSL compilation.',
    'Renderer memory counts in this harness are explicit CPU identity-registration bookkeeping; they prove no real GPU count or upload timing.',
    'Lamp output, marine snow, fog and authored sediment are uncalibrated display choices.',
    'Only the constructor failure points explicitly injected below are covered.',
  ] };
function finiteGeometry(scene) {
  let objects = 0, vertices = 0;
  scene.traverse(object => {
    if (!object.geometry) return;
    objects++;
    const geometry = object.geometry;
    for (const attribute of Object.values(geometry.attributes)) for (const number of attribute.array) assert.ok(Number.isFinite(number));
    vertices += geometry.attributes.position.count;
    if (geometry.index) for (const index of geometry.index.array) assert.ok(index < geometry.attributes.position.count);
  });
  return { geometryObjects: objects, vertexInstances: vertices };
}
function checkFloor(world) {
  const inner = world.floorMesh.geometry, ring = world.floorContinuation.geometry;
  const p = ring.attributes.position, normals = ring.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getY(i) - world.floorY(p.getX(i), p.getZ(i))) < 2e-6);
    assert.ok(normals.getY(i) > .97, `Upward-facing continuation normal at ${i}`);
  }
  assert.equal(inner.index.count / 3, 39200); assert.equal(ring.index.count / 3, 1120);
  const ray = new THREE.Raycaster(); world.scene.updateMatrixWorld(true);
  for (const [x, z] of [[0, 0], [34.75, 0], [35.25, 0], [55, 0], [-55, 35], [35, 55], [-72, -70]]) {
    ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects([world.floorMesh, world.floorContinuation]); assert.ok(hits.length > 0, `No floor ray hit ${x},${z}`);
  }
  const clamped = world.clearCameraPosition(new THREE.Vector3(100, 4000, -100));
  assert.equal(clamped.x, 28); assert.equal(clamped.z, -28); assert.ok(clamped.y <= (world.isDeep ? 8 : world.surfaceY - .5));
  return { centreTriangles: 39200, continuationTriangles: 1120, floorRaySamples: 7, minimumBoundaryDistanceM: 52 };
}
function checkReefBedSupport(world) {
  const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0),samples=[];
  world.scene.updateMatrixWorld(true);
  for(const [index,rock] of REEF_ROCKS.entries()){
    if(index===REEF_BRIDGE_ROCK_INDEX)continue;
    for(const radius of [.5,.75,.9])for(let direction=0;direction<8;direction++){
      const angle=direction*Math.PI/4,nx=radius*Math.cos(angle),nz=radius*Math.sin(angle);
      const mapped=reefRockSurfacePoint(rock,nx,-Math.sqrt(1-radius*radius),nz,true);
      const x=mapped.x,z=mapped.z,floor=world.floorY(x,z);
      ray.set(new THREE.Vector3(x,floor-3,z),up);
      const hit=ray.intersectObject(world.reefMesh)[0];assert.ok(hit,'Bed-support ray must intersect the actual reef mesh');
      const gap=hit.point.y-floor;
      assert.ok(gap<-.04,`Rock ${index} radius ${radius}: lower mesh must meet sediment, gap=${gap}`);
      samples.push({rockIndex:index,radius,meshBottomMinusFloorM:gap,
        oldAnalyticBottomMinusFloorM:rock[1]-rock[4]*Math.sqrt(1-radius*radius)-floor});
    }
  }
  let cameraSamples=0,maxRepeatDisplacementM=0;
  const outsideAllRockIntervals=point=>world.cameraRocks.every(({rock,bedSupported})=>{
    const nx=(point.x-rock[0])/rock[3],nz=(point.z-rock[2])/rock[5],q=nx*nx+nz*nz;
    if(q>=1||!reefRockFootprintContains(rock,nx,nz))return true;
    const coordinate=reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-coordinate.radius**2)),lower=reefRockSurfaceY(rock,nx,-ny,nz,bedSupported);
    const upper=reefRockSurfaceY(rock,nx,ny,nz);
    return point.y<lower-.039999||point.y>upper+.039999;
  });
  for(const [index,rock]of REEF_ROCKS.entries()){
    if(index===REEF_BRIDGE_ROCK_INDEX)continue;
    for(let direction=0;direction<8;direction++){
      const angle=direction*Math.PI/4,x=rock[0]+rock[3]*.9*Math.cos(angle),z=rock[2]+rock[5]*.9*Math.sin(angle);
      const cleared=world.clearCameraPosition(new THREE.Vector3(x,world.floorY(x,z)+.04,z));
      assert.ok(outsideAllRockIntervals(cleared),'Cleared observer must be outside actual rock/support intervals');
      const again=world.clearCameraPosition(cleared.clone()),movement=again.distanceTo(cleared);
      maxRepeatDisplacementM=Math.max(maxRepeatDisplacementM,movement);assert.ok(movement<1e-7,'Camera correction must not jitter on repeated frames');
      cameraSamples++;
    }
  }
  assert.equal(world.cameraRocks.length,31,'Every rendered authored and auxiliary reef rock must enter the camera guard');
  assert.deepEqual(world.cameraRocks.slice(REEF_ROCKS.length).map(entry=>entry.rock),REEF_AUXILIARY_ROCKS,
    'Rendered auxiliary rocks and shared model hard substrate must be identical');
  let auxiliaryCameraSamples=0,auxiliaryBuriedEyePoints=0;
  for(const {rock,bedSupported}of world.cameraRocks.slice(REEF_ROCKS.length)){
    const floor=world.floorY(rock[0],rock[2]),eye=floor+.04;
    const top=reefRockSurfaceY(rock,0,1,0),bottom=reefRockSurfaceY(rock,0,-1,0,bedSupported);
    if(eye>bottom&&eye<top)auxiliaryBuriedEyePoints++;
    for(const height of [eye,(bottom+top)/2,top+.02]){
      const cleared=world.clearCameraPosition(new THREE.Vector3(rock[0],height,rock[2]));
      assert.ok(outsideAllRockIntervals(cleared),'Auxiliary-centre observer must leave every rendered rock interval');
      assert.ok(cleared.y>=world.floorY(cleared.x,cleared.z)+.04-1e-9,'Auxiliary correction must retain sediment clearance');
      const movement=world.clearCameraPosition(cleared.clone()).distanceTo(cleared);
      assert.ok(movement<1e-7,'Auxiliary camera correction must be stable on repeated frames');
      maxRepeatDisplacementM=Math.max(maxRepeatDisplacementM,movement);
      auxiliaryCameraSamples++;
    }
  }
  assert.ok(auxiliaryBuriedEyePoints>0,'Regression must exercise formerly enterable auxiliary rocks');
  const bridge=REEF_ROCKS[REEF_BRIDGE_ROCK_INDEX],underBridge=new THREE.Vector3(bridge[0],.30,bridge[2]);
  assert.ok(world.clearCameraPosition(underBridge.clone()).distanceTo(underBridge)<1e-7,'Supported crevice cap must leave its underside open');
  ray.set(new THREE.Vector3(bridge[0],world.floorY(bridge[0],bridge[2])-3,bridge[2]),up);
  const capHit=ray.intersectObject(world.reefMesh)[0];assert.ok(capHit);
  assert.ok(Math.abs(capHit.point.y-(bridge[1]-bridge[4]))<1e-6,'Cap underside is unchanged');
  return {scope:'upward rays against actual merged render geometry; analytic camera-volume samples',
    bedSupportedRocks:11,retainedBridgeRockIndex:REEF_BRIDGE_ROCK_INDEX,footRaySamples:samples.length,
    sampledRadii:[.5,.75,.9],maximumMeshBottomMinusFloorM:Math.max(...samples.map(sample=>sample.meshBottomMinusFloorM)),
    oldMaximumAnalyticGapM:Math.max(...samples.map(sample=>sample.oldAnalyticBottomMinusFloorM)),
    cameraSamples,auxiliaryCameraSamples,auxiliaryBuriedEyePoints,cameraGuardRockCount:world.cameraRocks.length,
    maxRepeatDisplacementM,creviceEyePointPreserved:true,
    limit:'Local samples do not prove all surface points, every branch contact, or measured geology.',samples};
}
function checkReefBoulderAttachments(world){
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),point=new THREE.Vector3();
  ray.firstHitOnly=true;world.scene.updateMatrixWorld(true);
  let colonies=0,samples=0,maximumBasalGapM=-Infinity,minimumVisibleCrownM=Infinity;
  const colonyBounds=[];
  for(const colony of world.decorations.children){
    if(colony.userData.morphotype!=='boulder')continue;
    const fit=colony.userData.landscapePlacement;
    assert.ok(fit?.ok,'Every retained decorative massive colony must have an accepted rigid fit');
    assert.deepEqual(colony.position.toArray(),fit.rootPositionM);
    assert.deepEqual(colony.scale.toArray(),[fit.scale,fit.scale,fit.scale]);
    assert.equal(colony.rotation.y,fit.yaw);
    colonyBounds.push(new THREE.Box3().setFromObject(colony));
    const vertices=[];colony.traverse(object=>{
      const positions=object.geometry?.getAttribute('position');if(!positions)return;
      for(let index=0;index<positions.count;index++)vertices.push(new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld));
    });
    const minY=Math.min(...vertices.map(vertex=>vertex.y)),seen=new Set();
    for(const vertex of vertices){
      if(vertex.y>minY+fit.basalBandM+1e-9)continue;
      const key=vertex.toArray().map(value=>Math.round(value*1e8)).join('/');if(seen.has(key))continue;seen.add(key);
      point.set(vertex.x,7,vertex.z);ray.set(point,down);
      const hit=ray.intersectObject(world.reefMesh)[0];assert.ok(hit,'Fitted basal vertices require real rendered hard substrate');
      const gap=vertex.y-hit.point.y;
      assert.ok(gap<=-.0029,'Actual applied massive-colony base must remain slightly buried rather than hovering');
      maximumBasalGapM=Math.max(maximumBasalGapM,gap);samples++;
    }
    assert.equal(seen.size,fit.basalVertexSamples);
    assert.ok(fit.visibleCrownAboveHighestSubstrateM>0);
    minimumVisibleCrownM=Math.min(minimumVisibleCrownM,fit.visibleCrownAboveHighestSubstrateM);colonies++;
  }
  assert.ok(colonies>0&&samples>0,'The real world must exercise retained massive-colony basal contact');
  let boundsPairs=0,minimumBoundsSeparationM=Infinity;
  for(let first=0;first<colonyBounds.length;first++)for(let second=first+1;second<colonyBounds.length;second++){
    const a=colonyBounds[first],b=colonyBounds[second];
    const axisGaps=['x','y','z'].map(axis=>Math.max(a.min[axis]-b.max[axis],b.min[axis]-a.max[axis]));
    const separation=Math.max(...axisGaps);
    assert.ok(separation>=.012-1e-9,'Retained massive colonies require at least 12 mm between world bounds on one axis');
    minimumBoundsSeparationM=Math.min(minimumBoundsSeparationM,separation);boundsPairs++;
  }
  return {colonies,actualBasalVertexRays:samples,maximumBasalGapM,minimumVisibleCrownM,
    boundsPairs,minimumBoundsSeparationM:boundsPairs?minimumBoundsSeparationM:null,
    scope:'applied rigid poses, sampled real basal vertices and conservative world AABB spacing, not whole-face contact or physical stability'};
}
function monitorResources(world) {
  const resources = new Set([...world.worldGeometries, ...world.worldMaterials, ...world.worldTextures]);
  world.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
      resources.add(material); for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return counts;
}
function monitorWarmupFailure(renderer,scene){
  renderer.failureObjects=[];scene.traverse(object=>renderer.failureObjects.push(object));
  renderer.failureResourceCounts=monitorResources({worldGeometries:[],worldMaterials:[],worldTextures:[],scene});
}
function checkClean(world, counts) {
  world.dispose(); world.dispose();
  assert.equal(world.renderer.disposals, 1); assert.equal(world.controls.disposals, 1); assert.equal(world.canvas.losses, 1);
  assert.equal(world.canvas.handlers.size, 0); assert.equal(world.controls.handlers.size, 0); assert.equal(windowHandlers.size, 0);
  assert.equal(host.children.length, 0); assert.equal(world.entities.size, 0);
  for (const count of counts.values()) assert.equal(count, 1, 'A reachable resource must be released exactly once');
  return { monitoredResources: counts.size, disposalCountEach: 1, canvasRemoved: true, handlersRemaining: 0 };
}
function checkWarmup(world){
  const renderer=world.renderer;
  assert.equal(renderer.warmupPasses.length,1);assert.equal(renderer.compiles.length,1);
  const pass=renderer.warmupPasses[0];
  assert.equal(pass.width,1);assert.equal(pass.height,1);assert.equal(pass.shadowsEnabled,false);
  assert.equal(pass.allVisible,true);assert.equal(pass.allUnculled,true);assert.equal(pass.scissorTest,false);
  assert.deepEqual(pass.viewport,[0,0,1,1]);assert.equal(renderer.targetDisposals.get(pass.target),1);
  assert.equal(renderer.getRenderTarget(),null);assert.deepEqual(renderer.viewport.toArray(),[0,0,1920,1080]);
  assert.deepEqual(renderer.scissor.toArray(),[0,0,1920,1080]);assert.equal(renderer.scissorTest,true);
  assert.equal(renderer.shadowMap.enabled,!world.isDeep);
  assert.deepEqual(renderer.compiles[0],{target:null,shadowsEnabled:!world.isDeep});
  assert.equal(world.highlight.visible,false);assert.equal(world.highlight.frustumCulled,true);
  assert.equal(world.floorMesh.frustumCulled,true);
  if(world.waterVolume)assert.equal(world.waterVolume.frustumCulled,false);
  let detailTrees=0;
  for(const {object}of world.entities.values()){
    const detail=object.userData.detail;
    if(!detail?.near)continue;
    detailTrees++;assert.equal(detail.near.visible,true);assert.equal(detail.far.visible,false);
  }
  let landscapeDetailTrees=0;
  for(const coral of world.decorations.children){
    const detail=coral.userData.landscapeDetail;if(!detail)continue;
    landscapeDetailTrees++;assert.equal(detail.near.visible,false);assert.equal(detail.far.visible,true);
  }
  world.scene.traverse(object=>{if(object.geometry)assert.ok(renderer.uploadedGeometries.has(object.geometry));});
  assert.equal(world.warmupTarget,null);assert.ok(world.initializationMs>=world.gpuWarmup.dispatchAndCompileMs);
  return {offscreenPasses:1,dimensions:[1,1],allSceneObjectsTemporarilyVisible:true,
    shadowPasses:0,detailTrees,landscapeDetailTrees,normalCanvasCompileCalls:1,flagsAndRendererStateRestored:true,
    targetDisposalCount:1,bookkeepingRegisteredGeometries:renderer.uploadedGeometries.size,
    bookkeepingRegisteredTextures:renderer.uploadedTextures.size,initializationMs:world.initializationMs,
    dispatchAndCompileMs:world.gpuWarmup.dispatchAndCompileMs,
    timingScope:'Node substitute CPU wall time; no actual GPU compilation/upload measurement'};
}
function shapeHash(world){
  const hash=createHash('sha256'),seen=new Set();
  for(const {object}of world.entities.values()){
    hash.update(JSON.stringify([object.position.toArray(),object.quaternion.toArray(),object.scale.toArray()]));
    object.traverse(child=>{
      const geometry=child.geometry;
      if(!geometry||seen.has(geometry))return;
      seen.add(geometry);
      for(const attribute of Object.values(geometry.attributes))hash.update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
    });
  }
  return hash.digest('hex');
}
function waterClockState(world){
  return {visualTimeSec:world.visualTimeSec,modelTimeSec:world.sim.timeSec,
    surfaceTime:world.surfaceTime?.value??null,particleTime:world.particleUniforms.t.value,
    particleDrift:world.particleUniforms.drift?.value??null,causticTimes:world.causticUniforms.map(value=>value.value)};
}
function checkPauseAndInventory(world){
  world.paused=false;
  for(let frame=0;frame<24;frame++)world.tick(world.lastTime+1000/60);
  world.paused=true;world.transition=null;world.following=false;
  world.tick(world.lastTime+16);
  const beforeClock=waterClockState(world),beforeShape=shapeHash(world),beforeElapsed=world.elapsed;
  const initialInventory=world.resourceInventorySnapshot(true);
  assert.ok(initialInventory.identitiesUnchanged);
  const scan=world.scanResourceInventory.bind(world);let scans=0;
  world.scanResourceInventory=()=>{scans++;return scan();};
  for(let frame=0;frame<120;frame++)world.tick(world.lastTime+1000/60);
  assert.equal(scans,0,'Paused frame and frequent React snapshots must not scan full scene inventories');
  world.scanResourceInventory=scan;
  assert.deepEqual(waterClockState(world),beforeClock);assert.equal(shapeHash(world),beforeShape);
  assert.ok(world.elapsed>beforeElapsed,'Render/telemetry clock continues while scene animation is paused');
  const cameraBefore=world.camera.position.clone();
  world.keys.add('KeyD');world.tick(world.lastTime+16);world.keys.clear();
  assert.ok(world.camera.position.distanceTo(cameraBefore)>0,'Free camera remains available during pause');
  assert.deepEqual(waterClockState(world),beforeClock);assert.equal(shapeHash(world),beforeShape);
  world.controls.handlers.get('start')();assert.equal(world.controlStartCount,1);
  // Exercise the actual LOD path repeatedly on a frozen model: this changes
  // only preallocated child visibility/shadow flags, never resource identity.
  let lodChanges=0,landscapeLodChanges=0;
  if(!world.isDeep&&!world.isKelp){
    const fish=world.sim.agents.find(agent=>agent.speciesId==='lined-tang'),object=world.entities.get(fish.id).object;
    for(let cycle=0;cycle<24;cycle++){
      world.camera.position.copy(object.position).add(new THREE.Vector3(.1,.05,.1));world.tick(world.lastTime+16);
      assert.equal(object.userData.detail.level,'near');
      world.camera.position.copy(object.position).add(new THREE.Vector3(10,3,10));world.tick(world.lastTime+16);
      assert.equal(object.userData.detail.level,'far');lodChanges+=2;
    }
    const coral=world.decorations.children.find(item=>item.userData.landscapeDetail);
    assert.ok(coral,'Reef must retain a landscape detail tree');
    const detail=coral.userData.landscapeDetail;
    for(let cycle=0;cycle<4;cycle++){
      world.camera.position.copy(coral.position).add(new THREE.Vector3(0,1,0));world.tick(world.lastTime+16);
      assert.equal(detail.level,'near');assert.equal(detail.near.visible,true);assert.equal(detail.far.visible,false);
      world.camera.position.copy(coral.position).add(new THREE.Vector3(12,5,12));world.tick(world.lastTime+16);
      assert.equal(detail.level,'far');assert.equal(detail.near.visible,false);assert.equal(detail.far.visible,true);landscapeLodChanges+=2;
    }
  }
  world.paused=false;
  for(let frame=0;frame<180;frame++)world.tick(world.lastTime+1000/60);
  const finalInventory=world.resourceInventorySnapshot(true);
  assert.ok(finalInventory.identitiesUnchanged);assert.deepEqual(finalInventory.counts,initialInventory.counts);
  const snapshot=world.snapshot();
  assert.deepEqual(snapshot.resourceInventory,finalInventory);assert.equal(snapshot.controlStartCount,1);
  assert.deepEqual(snapshot.camera.target,world.controls.target.toArray());assert.deepEqual(snapshot.environment,world.sim.environment);
  return {pausedFrames:120,waterAndParticleClocksUnchanged:true,organismShapeHashUnchanged:true,
    freeCameraWhilePaused:true,perFrameResourceScans:0,lodVisibilityChanges:lodChanges,landscapeLodVisibilityChanges:landscapeLodChanges,
    animationFrames:180,initialInventory,finalInventory,controlStartCount:1};
}

function checkFrameStartBoundary(world) {
  const baseline=world.lastTime, modelBefore=world.sim.metrics.timeSec, visualBefore=world.visualTimeSec;
  world.tick(baseline-800);
  assert.equal(world.lastTime,baseline,'An older first rAF must not move the post-initialization baseline back');
  assert.equal(world.actualFrameSeconds,0);
  assert.equal(world.sim.metrics.timeSec,modelBefore);assert.equal(world.visualTimeSec,visualBefore);
  world.tick(baseline+16);
  assert.ok(Math.abs(world.actualFrameSeconds-.016)<1e-10,'Next interval must exclude initialization');
  world.tick(baseline+10);
  assert.equal(world.lastTime,baseline+16,'A stale later callback must not rewind the baseline either');
  world.tick(baseline+40);
  assert.ok(Math.abs(world.actualFrameSeconds-.04)<1e-10);
  assert.ok(Math.abs(world.maxFrameTimeMs-24)<1e-8);
  return { scope:'synthetic rAF timestamp boundary on the real tick method; renderer substitute',
    olderFirstCallbackMs:800,staleLaterCallbackMs:6,recordedFrameSeconds:world.actualFrameSeconds,
    baselineNeverMovedBackwards:true,initializationNotRecountedInNextInterval:true };
}

try {
  const { ReefWorld } = await server.ssrLoadModule('/src/world/ReefWorld.js');
  function syntheticScanBundle(){
    // Solely exercise World ownership/prewarming. This box is never evidence
    // of real GLB decoding, museum dimensions, textures or visual quality.
    const group=new THREE.Group(),geometry=new THREE.BoxGeometry(.626,.343,.411),texture=new THREE.Texture();geometry.translate(0,.343/2,0);geometry.clearGroups();
    const material=new THREE.MeshStandardMaterial({map:texture});group.add(new THREE.Mesh(geometry,material));group.userData.shared=true;
    let disposed=false,disposals=0;
    return {group,geometry,material,texture,metadata:{schema:'synthetic-scan-world-ownership-test-only'},get disposals(){return disposals;},dispose(){if(!disposed){disposed=true;disposals++;group.removeFromParent();geometry.dispose();material.dispose();texture.dispose();group.clear();}return [];}};
  }
  for (const biomeId of ['reef', 'kelp', 'deep']) {
    const errors = [], snapshots = [];
    const world = new ReefWorld(host, value => snapshots.push(value), () => {}, value => errors.push(value), { biomeId, mobileIndividuals: biomeId === 'reef' ? 120 : null });
    const data = report.biomes[biomeId] = { entities: world.entities.size, warmup:checkWarmup(world), floor: checkFloor(world) };
    data.frameStartBoundary=checkFrameStartBoundary(world);
    if(biomeId==='reef'){data.bedSupport=checkReefBedSupport(world);data.massiveColonyAttachment=checkReefBoulderAttachments(world);}
    data.pauseAndInventory=checkPauseAndInventory(world);
    world.tick(world.lastTime + 16); data.initialGeometry = finiteGeometry(world.scene);
    if (biomeId === 'deep') {
      assert.equal(world.entities.size, 16); assert.equal(world.decorations.children.length, 0);
      assert.equal(world.sun, undefined); assert.equal(world.ambient, undefined); assert.equal(world.waterVolume, undefined); assert.equal(world.waterSurface, undefined);
      assert.equal(world.causticUniforms.length, 0); assert.equal(world.rocks.length, 0); assert.equal(world.renderer.shadowMap.enabled, false);
      assert.equal(world.deepParticles.geometry.attributes.position.count, 180); assert.equal(world.deepParticles.userData.role, 'display-marine-snow-not-resource-pool');
      const beforeClock = world.sim.environment.hour;
      for (let frame = 0; frame < 360; frame++) world.tick(world.lastTime + 1000 / 60);
      world.paused = true; const pausedTime = world.sim.timeSec, drift = world.deepParticleDrift;
      world.tick(world.lastTime + 500); assert.equal(world.sim.timeSec, pausedTime); assert.equal(world.deepParticleDrift, drift);
      world.setEnvironment({ observerLight: 0, hour: beforeClock + 12 }); world.tick(world.lastTime + 16);
      assert.equal(world.observerSpot.intensity, 0); assert.equal(world.observerFill.intensity, 0); assert.equal(world.particleUniforms.light.value, 0);
      assert.equal(world.scene.background.getHex(), 0); assert.equal(world.sim.metrics.naturalLightLevel, 0); assert.equal(world.sim.metrics.lightLevel, 0);
      world.camera.position.set(1, 2, 3); world.controls.target.set(0, .05, 0);
      world.setEnvironment({ observerLight: 1 }); world.tick(world.lastTime + 16);
      assert.ok(world.observerSpot.intensity > 0); assert.ok(world.observerFill.intensity > 0);
      assert.ok(world.observerSpot.position.distanceTo(world.camera.position) < 1e-12);
      assert.ok(world.observerFill.position.distanceTo(world.camera.position) < 1e-12);
      let maxMouthErrorM = 0, maxFootCentreErrorM = 0, minimumFishRootClearanceM = Infinity, footVerticesChecked = 0;
      world.scene.updateMatrixWorld(true);
      for (const agent of world.sim.agents) {
        const object = world.entities.get(agent.id).object;
        assert.equal(object.rotation.x, 0); assert.equal(object.rotation.z, 0); assert.equal(object.scale.x, agent.sizeM);
        const local = object.userData.feedingPointLocal;
        const mouth = object.localToWorld(new THREE.Vector3(local.x, local.y, local.z));
        const pool = agent.speciesId === 'sea-pig-group' ? 'surfaceDetritus' : agent.speciesId === 'rattail-family' ? 'benthicAnimalFood' : 'suspendedPrey';
        const ecological = world.sim.feedingPosition(agent, pool);
        maxMouthErrorM = Math.max(maxMouthErrorM, mouth.distanceTo(new THREE.Vector3(ecological.x, ecological.y, ecological.z)));
        if (agent.speciesId === 'sea-pig-group') {
          const record = object.userData.animation.find(item => item.channel === 'pig-appendages');
          for (let i = 0; i < record.item.geometry.attributes.position.count; i++) {
            const k = i * 3, m = i * 4;
            if (record.tags[m] !== 1 || record.tags[m + 2] !== 1) continue;
            const id = record.tags[m + 1], template = object.userData.contactTemplateLocal[id];
            const attr = record.item.geometry.attributes.position;
            // Remove the authored tube-tip surface radius to recover its axis
            // endpoint. This is an endpoint pose check, not a mesh contact-surface assertion.
            const endpoint = new THREE.Vector3(attr.getX(i) - record.rest[k] + template[0],
              attr.getY(i) - record.rest[k + 1] + template[1], attr.getZ(i) - record.rest[k + 2] + template[2]);
            object.localToWorld(endpoint); footVerticesChecked++;
            const expected = object.localToWorld(new THREE.Vector3(agent.contactPointsLocal[id].x, agent.contactPointsLocal[id].y, agent.contactPointsLocal[id].z));
            maxFootCentreErrorM = Math.max(maxFootCentreErrorM, endpoint.distanceTo(expected), Math.abs(endpoint.y - deepFloorHeight(endpoint.x, endpoint.z)));
          }
        }
        if (agent.speciesId === 'rattail-family') minimumFishRootClearanceM = Math.min(minimumFishRootClearanceM, object.position.y - deepFloorHeight(object.position.x, object.position.z));
      }
      assert.ok(maxMouthErrorM < 1e-12); assert.ok(maxFootCentreErrorM < 1e-8); assert.ok(footVerticesChecked >= 8 * 12);
      assert.ok(Math.abs(minimumFishRootClearanceM - .03) < 1e-12);
      const focus = {};
      for (const speciesId of ['sea-pig-group', 'rattail-family', 'pom-pom-anemone']) {
        world.focusSpecies(speciesId); assert.ok(world.lastFocusAssessment.centerVisible);
        focus[speciesId] = { ...world.lastFocusAssessment };
      }
      Object.assign(data, { naturalLightObjects: 0, solarCaustics: 0, waterSurfaceMeshes: 0, displayMarineSnowPoints: 180,
        pausedParticleDriftUnchanged: true, observerLightOffIntensities: [0, 0], observerLampsFollowCamera: true,
        maxMouthErrorM, maxFootCentreErrorM, footVerticesChecked, minimumFishRootClearanceM, focus,
        depthM: world.snapshot().depthM, ledgerResidual: world.sim.metrics.resourceBalanceResidual });
    } else {
      assert.equal(world.waterColors.bottom.value.getHex(), world.scene.fog.color.getHex());
      assert.equal(world.waterColors.horizon.value.getHex(), world.scene.fog.color.getHex());
      assert.ok(!world.waterVolume.material.fragmentShader.includes('smoothstep(-.08,-.85'));
      if (biomeId === 'kelp') {
        world.focusSpecies('purple-urchin'); assert.ok(world.lastFocusAssessment.centerVisible);
        data.urchinFocus = { ...world.lastFocusAssessment };
      } else {
        assert.equal(world.sim.metrics.mobilePopulation, 120);
        const fish = world.sim.agents.find(agent => agent.speciesId === 'lined-tang');
        const object = world.entities.get(fish.id).object;
        world.camera.position.copy(object.position).add(new THREE.Vector3(.1, .05, .1));
        world.paused = true; world.tick(world.lastTime + 16);
        data.nearFishDetail = object.userData.detail.level; assert.equal(data.nearFishDetail, 'near');
        world.camera.position.copy(object.position).add(new THREE.Vector3(10, 3, 10));
        world.tick(world.lastTime + 16); data.farFishDetail = object.userData.detail.level; assert.equal(data.farFishDetail, 'far');
      }
      data.farFogMatchesBackground = true;
    }
    data.finalGeometry = finiteGeometry(world.scene);
    // Cumulative raw frame timing stays bounded by 8 counters, preserving a
    // synthetic slow frame. This arithmetic check is not a GPU benchmark.
    world.actualFrameCount = 0; world.actualFrameSeconds = 0; world.frameTimeBuckets.fill(0);
    world.minFrameTimeMs = Infinity; world.maxFrameTimeMs = 0;
    world.recordFrameInterval(.5); world.recordFrameInterval(.5);
    assert.equal(world.frameTimingSnapshot().overallMeanFPS, 2);
    assert.equal(world.frameTimingSnapshot().frameTimeBuckets.length, 8); data.syntheticSlowFrameMeanFPS = 2;
    assert.deepEqual(errors, []); data.cleanup = checkClean(world, monitorResources(world));
  }
  const scan=syntheticScanBundle(),scanWorld=new ReefWorld(host,()=>{},()=>{},()=>{},{reefScanAsset:scan});
  assert.equal(scan.group.parent,scanWorld.scene);assert.ok(!scanWorld.worldGeometries.has(scan.geometry));
  assert.ok(!scanWorld.worldMaterials.has(scan.material));assert.ok(!scanWorld.worldTextures.has(scan.texture));
  assert.ok(scanWorld.scanResourceInventory().geometries.has(scan.geometry));assert.ok(scanWorld.renderer.uploadedGeometries.has(scan.geometry));
  assert.ok(scanWorld.renderer.uploadedTextures.has(scan.texture));assert.ok(scan.geometry.boundsTree);
  assert.equal(scanWorld.environmentAssets.length,1);assert.equal(scanWorld.sim.agents.length,78);
  assert.ok(scanWorld.environmentAssets[0].placement.minVertexGapM>=.004-1e-10);
  scanWorld.setView('skeleton',true);assert.ok(scanWorld.camera.position.toArray().every(Number.isFinite));
  const scanCleanup=checkClean(scanWorld,monitorResources(scanWorld));assert.equal(scan.disposals,1);assert.equal(scan.geometry.boundsTree,null);
  report.syntheticScanIntegration={scope:'synthetic geometry World ownership/warmup only; no GLB, JPEG or actual GPU validation',
    sceneOwnedByScanModule:true,worldCaptureExcluded:true,inventoryAndWarmupIncluded:true,staticTreeCleared:true,
    noEcologicalIndividualsAdded:true,disposals:scan.disposals,cleanup:scanCleanup};
  const original = ReefWorld.prototype.makeParticles;
  let failureGeometryDisposals = 0, failureMaterialDisposals = 0;
  ReefWorld.prototype.makeParticles = function () {
    this.ownGeometry(new THREE.BoxGeometry()).addEventListener('dispose', () => failureGeometryDisposals++);
    this.ownMaterial(new THREE.MeshStandardMaterial()).addEventListener('dispose', () => failureMaterialDisposals++);
    throw new Error('injected failure after deep habitat allocation');
  };
  assert.throws(() => new ReefWorld(host, () => {}, () => {}, () => {}, { biomeId: 'deep' }), /injected failure after deep habitat allocation/);
  ReefWorld.prototype.makeParticles = original;
  assert.equal(failureGeometryDisposals, 1); assert.equal(failureMaterialDisposals, 1);
  assert.equal(renderers.at(-1).disposals, 1); assert.equal(controls.at(-1).disposals, 1);
  assert.equal(createdCanvases.at(-1).losses, 1); assert.ok(createdCanvases.at(-1).removed); assert.equal(host.children.length, 0);
  report.initializationFailures.push({ point: 'after deep habitat resources and before particles', geometryDisposals: 1, materialDisposals: 1, rendererDisposals: 1, contextLosses: 1, canvasRemoved: true });
  for(const point of ['render','compile']){
    warmupRenderFailure=point==='render';warmupCompileFailure=point==='compile';
    const failureScan=syntheticScanBundle();
    assert.throws(()=>new ReefWorld(host,()=>{},()=>{},()=>{},{biomeId:'reef',reefScanAsset:failureScan}),new RegExp(`injected warmup ${point} failure`));
    assert.equal(failureScan.disposals,1);assert.equal(failureScan.geometry.boundsTree,null);
    warmupRenderFailure=false;warmupCompileFailure=false;
    const renderer=renderers.at(-1),controller=controls.at(-1),pass=renderer.warmupPasses[0];
    assert.equal(renderer.targetDisposals.get(pass.target),1);assert.equal(renderer.getRenderTarget(),null);
    assert.equal(renderer.shadowMap.enabled,true);assert.deepEqual(renderer.viewport.toArray(),[0,0,1920,1080]);
    assert.deepEqual(renderer.scissor.toArray(),[0,0,1920,1080]);assert.equal(renderer.scissorTest,true);
    const farTrees=renderer.failureObjects.filter(object=>object.name==='fish-far');
    assert.ok(farTrees.length>0);for(const object of farTrees)assert.equal(object.visible,false);
    assert.ok(renderer.failureResourceCounts.size>0);
    for(const count of renderer.failureResourceCounts.values())assert.equal(count,1,'Warmup failure releases reachable resources once');
    assert.equal(renderer.disposals,1);assert.equal(controller.disposals,1);
    assert.equal(createdCanvases.at(-1).losses,1);assert.ok(createdCanvases.at(-1).removed);
    assert.equal(host.children.length,0);assert.equal(windowHandlers.size,0);
    report.initializationFailures.push({point:`inside one-time warmup ${point}`,warmupTargetDisposals:1,
      objectVisibilityRestored:true,rendererStateRestored:true,monitoredResources:renderer.failureResourceCounts.size,
      disposalCountEach:1,rendererDisposals:1,contextLosses:1,canvasRemoved:true});
  }
  rendererFailure = true;
  assert.throws(() => new ReefWorld(host, () => {}, () => {}, () => {}, { biomeId: 'deep' }), /injected WebGLRenderer-construction failure/);
  rendererFailure = false;
  assert.equal(createdCanvases.at(-1).losses, 1); assert.ok(createdCanvases.at(-1).removed); assert.equal(host.children.length, 0);
  report.initializationFailures.push({ point: 'after acquiring owned WebGL context, inside renderer construction', contextLosses: 1, canvasRemoved: true });
  assert.equal(windowHandlers.size, 0);
  checks = ['three-biome geometry creation and finite attributes', 'upward continuation faces and 7 floor ray samples',
    'deep only local observer lamps with explicit light-off state', 'model metres / yaw-only roots / actual mouth agreement',
    'sea-pig 12 foot axes agree with shared mud surface', 'deep fish root retains 0.03 m clearance',
    'deep and kelp species focus raycasts find a visible centre', 'paused all-biome water clocks and organism shapes with free camera',
    'fog background agreement and valid smoothstep edge order', 'resource disposal exactly once and four partial constructor failures',
    'cumulative raw frame timing preserves slow frames with bounded buckets',
    'older first rAF and stale callback cannot rewind the post-initialization timing baseline',
    'reef support feet meet sediment at 264 mesh-ray samples and preserve the open crevice cap',
    '88 main-rock and 57 auxiliary-rock camera corrections leave actual intervals and remain stable',
    'retained decorative massive colonies have correctly applied rigid poses and real basal rays slightly below substrate',
    'one offscreen all-detail warmup restores visibility, frustum flags, target, shadow and viewport state',
    'warmup render and compile constructor failures dispose the temporary target and scene resources once',
    'CPU resource identity inventory unchanged through 48 fish LOD transitions and all-biome animation',
    'bounded cached inventory performs zero full scene scans during 120 consecutive paused frames',
    'synthetic scan ownership excluded from World capture and included in inventory / prewarm without ecology changes',
    'synthetic scan resources and static tree released once after normal disposal and warmup constructor failures'];
  report.checks = checks; report.sourceSha256After = await hashes();
  assert.deepEqual(report.sourceSha256After, before, 'Sources changed during the smoke run; repeat against a stable revision');
  report.status = 'passed';
} finally {
  THREE.TextureLoader.prototype.load = textureLoad;
  await server.close();
}
await mkdir('output/validation', { recursive: true });
await writeFile(integrationOutput, JSON.stringify(report, null, 2) + '\n',{flag:'wx'});
await writeFile(warmupOutput,JSON.stringify({schema:'world-warmup-pause-resource-smoke-v1',
  observedAtUtc:report.observedAtUtc,status:report.status,sourceSha256:report.sourceSha256,limitations:report.limitations,
  biomes:Object.fromEntries(Object.entries(report.biomes).map(([biomeId,data])=>[biomeId,{entities:data.entities,warmup:data.warmup,pauseAndInventory:data.pauseAndInventory}])),
  initializationFailures:report.initializationFailures.filter(failure=>failure.point.includes('warmup'))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ status: report.status, checks: checks.length, biomes: Object.keys(report.biomes), output: integrationOutput }));
