import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ReefSimulation } from '../simulation.js';
import { KelpSimulation } from '../kelpSimulation.js';
import { DeepSimulation } from '../deepSimulation.js';
import { sceneCatalogs, sceneDefinitions, livingShallowsSpeciesCatalog } from '../sceneCatalog.js';
import { createLivingDiscoveries, livingDiscoveryCandidates, LIVING_DISCOVERY_LIMIT } from '../livingDiscoveries.js';
import { createOrganism, animateOrganism, disposeOrganism, updateOrganismDetail } from './organisms.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from './kelpOrganisms.js';
import { createDeepOrganism, animateDeepOrganism, disposeDeepOrganism } from './deepOrganisms.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX, reefRockFootprintContains, reefRockCanonicalCoordinates, reefRockSurfaceY, floorHeight as reefFloorHeight, habitatHeight as reefHabitatHeight } from '../habitat.js';
import { createReefRockGeometry } from './reefTerrain.js';
import { createReefRockMaterial } from './reefRockMaterial.js';
import { createReefSceneryLayout } from '../reefScenery.js';
import { reefCoverOrganization, crossesReefSandCorridor } from './reefSceneOrganization.js';
import { REEF_EXPLORATION_PRESETS } from '../reefExploration.js';
import { OceanChunks } from './OceanChunks.js';
import { OceanEcology } from '../oceanEcology.js';
import { OceanAnimals } from './OceanAnimals.js';
import { OceanSceneElements } from './OceanSceneElements.js';
import { OceanHabitatScenes } from './OceanHabitatScenes.js';
import { OceanMacroLandscape } from './OceanMacroLandscape.js';
import { KelpOceanChunks } from './KelpOceanChunks.js';
import { KelpOceanEcology } from '../kelpOceanEcology.js';
import { KelpOceanAnimals } from './KelpOceanAnimals.js';
import { KelpDriftFood } from './KelpDriftFood.js';
import { KelpUnderstory } from './KelpUnderstory.js';
import { DeepOceanChunks } from './DeepOceanChunks.js';
import { DeepOceanEcology } from '../deepOceanEcology.js';
import { DeepOceanAnimals } from './DeepOceanAnimals.js';
import { OceanWaterParticles } from './OceanWaterParticles.js';
import { createOceanEnvironment } from '../oceanEnvironment.js';
import { oceanCommunityReading, nearestOceanAnimal } from '../oceanCommunityReading.js';
import { oceanFormationObservation } from '../oceanFormationObservation.js';
import { oceanOverviewObservation } from '../oceanOverview.js';
import { createOceanSceneObservation } from '../oceanSceneObservation.js';
import { createOceanLivingLandscapeObservation } from '../oceanLivingLandscapeObservation.js';
import { createKelpCommunityObservationPlan } from '../kelpCommunityObservation.js';
import { kelpAnimationInRange } from './kelpAnimationVisibility.js';
import { oceanLayerHeight } from '../oceanLayerNavigation.js';
import { deepOceanLayerHeight } from '../deepOceanNavigation.js';
import { normalizeOceanObservationView } from '../oceanExplorationMemory.js';
import { fitReefLandscapeBoulder } from './reefLandscapePlacement.js';
import { createReefLandscapeCoral, updateReefLandscapeDetail, reefLandscapeLevelAt, disposeReefLandscapeCoral } from './reefLandscapeDetail.js';
import { enableStaticRayQueries } from './reefSpatialQueries.js';
import { placeReefSkeletonOnSubstrate } from './reefScanPlacement.js';
import { prepareReefSkeletonDisplay } from './reefScanDisplay.js';
import { KELP_ROCKS, KELP_MORPHOLOGY, floorHeight as kelpFloorHeight, habitatHeight as kelpHabitatHeight, habitatNormal as kelpHabitatNormal, kelpLeafNormal } from '../kelpHabitat.js';
import { DEEP_DEPTH_M, deepFloorHeight } from '../deepHabitat.js';
import { SEA_SPIDER_BODY_LOCAL } from '../deepSeaSpiderGeometry.js';
import { localCaptureEnabled, saveJson } from '../capture.js';
import { LIVING_SHALLOWS_PROFILE, livingShallowsSeed } from '../livingShallows.js';
import { createLivingWorldState } from '../livingWorldState.js';
import { createDirectorCameraMotion, sampleDirectorCameraMotion, advanceDirectorCameraElapsed, isDirectorPlaybackRate } from '../directorCameraMotion.js';

const reefPresets = {
  wide: { position: [3, 2.8, 5], target: [-2.5, 0.65, -2] },
  reef: { position: [-0.1, 1.65, 2.6], target: [-2.3, 1.1, -1.5] },
  crevice: { position: [1.08, 0.48, -1.28], target: [1.70, 0.22, -2.60] },
  ...REEF_EXPLORATION_PRESETS,
};
const kelpPresets = {
  wide: { position: [5.8, 7.5, 5.6], target: [-0.2, 6.5, -1] },
  reef: { position: [1.5, 2.1, 5.1], target: [-1.4, 3.4, -3.3] },
  canopy: { position: [3.2, 9.8, 1.8], target: [-1.4, 9.5, -3.3] },
  crevice: { position: [3.5, kelpHabitatHeight(3.5, .8) + .16, .8], target: [3.2, kelpHabitatHeight(3.2, 0) + .055, 0] },
};
const deepPresets = {
  wide: { position: [0.4, 1.1, 4.2], target: [-1.9, 0.02, -1.5] },
  reef: { position: [-4.65, deepFloorHeight(-4.65, -2.65) + .30, -2.65], target: [-5, deepFloorHeight(-5, -3) + .045, -3] },
  crevice: { position: [-3.18, deepFloorHeight(-3.18, -.95) + .26, -.95], target: [-3.6, deepFloorHeight(-3.6, -1.3) + .095, -1.3] },
};
const clamp = THREE.MathUtils.clamp;
const FRAME_TIME_LIMITS_MS = [16.67, 25, 33.34, 50, 100, 250, 1000];
function seeded(seed) { let s = seed | 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class ReefWorld {
  constructor(container, onSnapshot, onSelect, onError, { biomeId = 'reef', mobileIndividuals = null, reefScanAsset = null, seed = 42, paused = false, sceneProfile = null } = {}) {
    const initializationStarted = performance.now();
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.onSelect = onSelect;
    this.onError = onError;
    this.reefScanAsset = reefScanAsset;
    if (!sceneCatalogs[biomeId] || !sceneDefinitions[biomeId]) throw new RangeError(`Unknown scene biome: ${biomeId}`);
    this.biomeId = biomeId; this.isKelp = biomeId === 'kelp'; this.isDeep = biomeId === 'deep';
    this.isLivingShallows = biomeId === 'reef' && sceneProfile === LIVING_SHALLOWS_PROFILE && mobileIndividuals === null;
    this.inputSeed = seed;
    if (this.isLivingShallows) seed = livingShallowsSeed(seed);
    this.definition = sceneDefinitions[biomeId]; this.surfaceY = this.definition.surfaceY;
    this.catalog = new Map((this.isLivingShallows ? livingShallowsSpeciesCatalog : sceneCatalogs[biomeId]).map(species => [species.id, species]));
    this.rocks = this.isDeep ? [] : this.isKelp ? KELP_ROCKS : REEF_ROCKS;
    this.cameraRocks = [];
    this.presets = { ...(this.isDeep ? deepPresets : this.isKelp ? kelpPresets : reefPresets) };
    this.environmentAssets = [];
    this.sim = this.isDeep ? new DeepSimulation(seed) : this.isKelp ? new KelpSimulation(seed) : new ReefSimulation(seed, { mobileIndividuals });
    this.livingWorldState = this.isLivingShallows ? createLivingWorldState(seed) : null;
    this.livingDiscoveries = this.isLivingShallows ? createLivingDiscoveries(seed) : null;
    this.livingClockSec = 0;
    this.workload = { requestedMobileIndividuals: this.isDeep || this.isKelp ? null : mobileIndividuals, mode: !this.isDeep && !this.isKelp && mobileIndividuals !== null ? 'mobile-population-benchmark' : 'representative-biome' };
    this.worldGeometries = new Set(); this.worldMaterials = new Set(); this.worldTextures = new Set();
    this.followOffsetY = 0;
    this.paused = !!paused; this.speed = 1; this.selectedId = null; this.following = false;
    this.oceanExploring = false; this.oceanCruising = false; this.oceanTravel = null;
    this.directorMotion = null;
    this.oceanObservationLayer = 'bed'; this.oceanFreeDepthM = null;
    this.oceanRenderOrigin = { x: 0, z: 0 };
    this.oceanEcologyCenter = null; this.oceanEcologyResetting = false;
    this.disposed = false; this.elapsed = 0; this.visualTimeSec = 0; this.frameCount = 0; this.frameSeconds = 0; this.fps = 0;
    this.controlStartCount = 0; this.lastResourceInventory = -Infinity;
    this.actualFrameCount = 0; this.actualFrameSeconds = 0;
    this.frameTimeBuckets = Array(FRAME_TIME_LIMITS_MS.length + 1).fill(0);
    this.minFrameTimeMs = Infinity; this.maxFrameTimeMs = 0;
    this.runStarted=Date.now();this.runId=`browser-run-${this.runStarted}`;this.telemetrySamples=[];this.lastTelemetry=0;
    this.lastSnapshot = -1; this.errors = []; this.entities = new Map(); this.keys = new Set();
    this.frameVectors = { direction: new THREE.Vector3(), target: new THREE.Vector3(), delta: new THREE.Vector3() };
    this.waterNightColor = new THREE.Color().setRGB(.009, .031, .049);
    this.oceanWaterPalette = {
      clear: new THREE.Color(this.isKelp?'#195e7a':'#126e91'), green: new THREE.Color(this.isKelp?'#466e61':'#377f79'),
      topClear: new THREE.Color('#64afc2'), topGreen: new THREE.Color('#9bb4a3'),
      night: new THREE.Color('#071e2b'), day: new THREE.Color(), tone: new THREE.Color(), top: new THREE.Color(),
    };
    this.deepParticleDrift = 0; this.lastParticleSimTime = 0;
    this.visualEnvironment = this.isDeep ? {
      lightingLabel: '观察器照明 · 深海软底', naturalSunlight: false, localPhotosynthesis: false,
      displayedParticles: 'marine-snow-display-only-not-suspended-food-amount',
      substrate: 'authored-grey-brown-soft-sediment; texture-and-fog-uncalibrated',
    } : { lightingLabel: '自然光观察', fogStatus: 'uncalibrated-display-attenuation' };
    this.visualEnvironment.animationClock = this.isDeep ? 'simulation-seconds' : 'unpaused-wall-seconds-not-speed-scaled';
    // Own the canvas before WebGL construction and clean up the complete
    // initialization path, including failures after a context was acquired.
    try {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(this.isDeep ? '#000000' : this.isKelp ? '#386258' : '#378faa');
      this.scene.fog = new THREE.FogExp2(this.scene.background, this.isDeep ? .10 : this.isKelp ? .038 : .039);
      this.camera = new THREE.PerspectiveCamera(49, 1, this.isDeep ? .008 : .04, 100);
      this.canvas = document.createElement('canvas');
      const contextAttributes={antialias:true,alpha:false,depth:true,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'};
      this.glContext=this.canvas.getContext('webgl2',contextAttributes);
      if(!this.glContext)throw new Error('本浏览器无法创建 WebGL2 绘图上下文');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context:this.glContext, ...contextAttributes });
      // The explicit workload is measured at one drawing-buffer pixel per
      // viewport pixel. A 1920×1080 benchmark must not silently become 2880×1620
      // on a high-DPI desktop. Normal observation retains its 1.5 DPR cap.
      this.renderer.setPixelRatio(this.workload.mode==='mobile-population-benchmark'?1:Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.AgXToneMapping;
      this.renderer.toneMappingExposure = this.isDeep ? 1.45 : this.isKelp ? 1.25 : 1.2;
      this.renderer.shadowMap.enabled = !this.isDeep;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.domElement.setAttribute('aria-label', `${this.definition.label}三维世界，拖拽观察，滚轮靠近，点击生物查看档案`);
      this.renderer.domElement.style.touchAction = 'none';
      container.appendChild(this.renderer.domElement);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = 0.065;
      this.controls.minDistance = this.isDeep ? .11 : .18; this.controls.maxDistance = this.isDeep ? 14 : 30;
      this.controls.maxPolarAngle = Math.PI * 0.55;
      this.controls.minPolarAngle = Math.PI * 0.15;
      this.controls.panSpeed = 0.7; this.controls.rotateSpeed = 0.42;
      this.onControlStart = () => { this.stopDirectorMotion(); this.controlStartCount++; this.beginOceanManualObservation(); this.following = false; this.transition = null; };
      this.controls.addEventListener('start', this.onControlStart);
      this.makeLighting();
      this.causticUniforms = [];
      this.makeWaterVolume(); this.makeHabitat(); this.makeParticles(); this.makeSurface(); this.captureWorldResources(); this.syncPopulation();
      {
        // The authored observation area keeps its local ecological coordinates. Its parent
        // moves only when the rendering origin shifts during ocean exploration.
        this.reefRoot=new THREE.Group();this.scene.add(this.reefRoot);
        for(const object of [this.reefMesh,this.decorations,this.reefScanAsset?.group,...[...this.entities.values()].map(e=>e.object)])if(object)this.reefRoot.add(object);
        this.oceanChunks=this.isDeep?new DeepOceanChunks(seed,{sandMaterial:this.sandMaterial}):this.isKelp?new KelpOceanChunks(seed,{sandMaterial:this.sandMaterial}):new OceanChunks(seed,{sandMaterial:this.sandMaterial,livingGeology:this.isLivingShallows});
        this.bindAuthoredSurface();
        if(this.isLivingShallows){
          this.reefRoot.visible=false;
          this.cameraRocks=[];
          if(this.floorMesh)this.floorMesh.visible=false;if(this.floorContinuation)this.floorContinuation.visible=false;
          const state=this.livingWorldState.load();
          if(state){this.sim.environment={...this.sim.environment,...state.environment};this.livingClockSec=state.timeSec;this.sim.timeSec=state.timeSec;}
        }
        if(this.isKelp||this.isDeep){this.floorMesh.visible=false;this.floorContinuation.visible=false;}
        this.scene.add(this.oceanChunks.root);this.oceanChunks.update(this.camera.position);
        this.oceanEcology=this.isDeep?new DeepOceanEcology(seed,this.oceanChunks.generator):this.isKelp?new KelpOceanEcology(seed,this.oceanChunks.generator,{visitors:true,understory:true}):new OceanEcology(seed,this.oceanChunks.generator,{turtles:true,sceneElements:!this.isLivingShallows,habitatScenes:!this.isLivingShallows,macroLandscape:!this.isLivingShallows,livingGeology:this.isLivingShallows,habitatMosaic:this.isLivingShallows,seabedRelief:this.isLivingShallows,seascape:this.isLivingShallows});
        if(this.isLivingShallows)this.oceanEcology.setEnvironment(this.sim.environment);
        this.oceanAnimals=this.isDeep?new DeepOceanAnimals([...this.catalog.values()]):this.isKelp?new KelpOceanAnimals([...this.catalog.values()]):new OceanAnimals([...this.catalog.values()]);this.scene.add(this.oceanAnimals.root);
        if(!this.isKelp&&!this.isDeep&&!this.isLivingShallows){this.oceanSceneElements=new OceanSceneElements();this.scene.add(this.oceanSceneElements.root);}
        if(!this.isKelp&&!this.isDeep&&!this.isLivingShallows){this.oceanHabitatScenes=new OceanHabitatScenes();this.scene.add(this.oceanHabitatScenes.root);}
        if(!this.isKelp&&!this.isDeep&&!this.isLivingShallows){this.oceanMacroLandscape=new OceanMacroLandscape();this.scene.add(this.oceanMacroLandscape.root);}
        if(this.isKelp){
          this.oceanKelpDriftFood=new KelpDriftFood();this.scene.add(this.oceanKelpDriftFood.root);
          this.oceanKelpUnderstory=new KelpUnderstory();this.scene.add(this.oceanKelpUnderstory.root);
        }
        this.oceanWaterField=this.isDeep?null:createOceanEnvironment(seed,this.oceanChunks.generator,{uniformCurrent:this.isKelp});
        if(!this.isDeep){
          this.oceanWaterParticles=new OceanWaterParticles(this.scene,{seed,surfaceY:this.surfaceY});
          this.oceanWaterParticles.root.visible=false;
        }
      this.onOceanCheckpoint=()=>{this.persistLivingWorld();if(!this.oceanEcologyResetting)this.oceanEcology?.checkpoint().catch(()=>{});};
      this.onOceanVisibility=()=>{if(document.visibilityState==='hidden')this.onOceanCheckpoint();};
      window.addEventListener('pagehide',this.onOceanCheckpoint);document.addEventListener('visibilitychange',this.onOceanVisibility);
        this.visualEnvironment.worldGeneration='coordinate-seeded streaming habitats and regional animal communities; unloaded regional ecology frozen and persisted locally';
        this.camera.far=160;this.camera.updateProjectionMatrix();
      }
      this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
      this.onPointerDown = e => { this.pointerStart = {x:e.clientX,y:e.clientY}; };
      this.onPointerUp = e => {
        if (!this.pointerStart || Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>5) return;
        const r=this.renderer.domElement.getBoundingClientRect();
        this.pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
        this.raycaster.setFromCamera(this.pointer,this.camera);
        const hit=this.raycaster.intersectObjects([...this.entities.values()].map(e=>e.object).concat(this.oceanAnimals?.pickableObjects||[]),true)[0];
        if(hit){ let o=hit.object; while(o && !o.userData.agentId) o=o.parent; if(o){this.select(o.userData.agentId);this.onSelect(o.userData.agentId);} }
      };
      this.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);
      this.renderer.domElement.addEventListener('pointerup',this.onPointerUp);
      this.onContextLost=e=>{e.preventDefault();const message='WebGL 绘图上下文丢失，请重新加载场景';this.errors.push(message);this.onError(message);};
      this.renderer.domElement.addEventListener('webglcontextlost',this.onContextLost);
      this.onKeyDown = e => { if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return; if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code))this.stopDirectorMotion(); this.keys.add(e.code); if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space'].includes(e.code))e.preventDefault(); };
      this.onKeyUp = e => this.keys.delete(e.code);
      this.onBlur = () => this.keys.clear();
      window.addEventListener('keydown',this.onKeyDown);window.addEventListener('keyup',this.onKeyUp);window.addEventListener('blur',this.onBlur);
      this.resizeObserver = new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(container); this.resize();
      if(this.isLivingShallows)this.enterLivingShallows();else this.setView('wide',true);
      this.warmupPreallocatedResources();
      this.resourceInventorySnapshot(true);
      // Initialization and its one-time upload/precompile cost are reported
      // separately; the observation clock and frame timing begin afterwards.
      this.initializationMs = performance.now() - initializationStarted;
      this.runStarted=Date.now();this.runId=`browser-run-${this.runStarted}`;
      this.lastTime=performance.now();
      this.renderer.setAnimationLoop(t=>this.tick(t));
      const gl=this.renderer.getContext(); const ext=gl.getExtension('WEBGL_debug_renderer_info');
      this.hardware=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    } catch (error) {
      this.dispose();
      this.onError?.(`三维场景初始化失败：${error.message}`);
      throw error;
    }
  }
  ownGeometry(geometry){this.worldGeometries.add(geometry);return geometry;}
  ownMaterial(material){this.worldMaterials.add(material);return material;}
  warmupPreallocatedResources(){
    const renderer=this.renderer,started=performance.now(),states=[];
    const previousTarget=renderer.getRenderTarget();
    const previousCubeFace=renderer.getActiveCubeFace(),previousMipmap=renderer.getActiveMipmapLevel();
    const previousViewport=renderer.getViewport(new THREE.Vector4());
    const previousScissor=renderer.getScissor(new THREE.Vector4()),previousScissorTest=renderer.getScissorTest();
    const previousShadows=renderer.shadowMap.enabled;
    let target;
    try{
      // Both fish detail trees already exist. Upload their buffers offscreen,
      // including geometry hidden by the initial camera or LOD selection.
      // This never draws duplicate fish into the visible canvas.
      this.scene.traverse(object=>{
        states.push([object,object.visible,object.frustumCulled]);
        object.visible=true;object.frustumCulled=false;
      });
      target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false});
      this.warmupTarget=target;
      renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);
      renderer.setViewport(0,0,1,1);renderer.setScissorTest(false);
      renderer.render(this.scene,this.camera);
      // Offscreen output has different tone-mapping/shadow program variants.
      // Compile the normal canvas variants after restoring its target and
      // shadow setting, while both preallocated detail trees remain reachable.
      renderer.setRenderTarget(previousTarget,previousCubeFace,previousMipmap);
      renderer.shadowMap.enabled=previousShadows;
      renderer.compile(this.scene,this.camera);
      this.gpuWarmup={dispatchAndCompileMs:performance.now()-started,offscreenPasses:1,
        targetWidth:1,targetHeight:1,shadowRendering:false,canvasProgramsPrecompiled:true,
        timingScope:'CPU wall time including synchronous driver calls; no GPU timer query'};
    }finally{
      // A failed upload or compile must still restore every changed object
      // flag and renderer state before constructor cleanup releases resources.
      for(const [object,visible,frustumCulled]of states){object.visible=visible;object.frustumCulled=frustumCulled;}
      renderer.shadowMap.enabled=previousShadows;
      try{
        renderer.setRenderTarget(previousTarget,previousCubeFace,previousMipmap);
        renderer.setViewport(previousViewport);renderer.setScissor(previousScissor);renderer.setScissorTest(previousScissorTest);
      }finally{
        if(target){this.warmupTarget=null;target.dispose();}
      }
    }
  }
  scanResourceInventory(){
    // Identity sets include hidden LOD trees and asynchronously loaded texture
    // objects. Renderer-owned shadow maps/render targets are outside this CPU
    // asset inventory and remain visible in renderer.info GPU counts.
    const inventory={geometries:new Set(this.worldGeometries),materials:new Set(this.worldMaterials),textures:new Set(this.worldTextures)};
    const addTexture=value=>{if(value?.isTexture)inventory.textures.add(value);};
    addTexture(this.scene.background);addTexture(this.scene.environment);
    this.scene.traverse(object=>{
      if(object.geometry)inventory.geometries.add(object.geometry);
      for(const material of object.material?Array.isArray(object.material)?object.material:[object.material]:[]){
        inventory.materials.add(material);
        for(const value of Object.values(material))addTexture(value);
        for(const uniform of Object.values(material.uniforms||{})){
          const value=uniform?.value;
          if(Array.isArray(value))value.forEach(addTexture);else addTexture(value);
        }
      }
    });
    return inventory;
  }
  resourceInventorySnapshot(force=false){
    // A normal React snapshot reads this bounded cache. Full identity scans
    // occur once at initialization and at most once per 30 render seconds.
    if(force||!this.cachedResourceInventory||this.elapsed-this.lastResourceInventory>=30){
      const current=this.scanResourceInventory();
      if(!this.initialResourceInventory)this.initialResourceInventory=current;
      const counts={},initialCounts={},addedSinceInit={},missingSinceInit={};
      for(const kind of ['geometries','materials','textures']){
        const initial=this.initialResourceInventory[kind];
        counts[kind]=current[kind].size;initialCounts[kind]=initial.size;
        addedSinceInit[kind]=0;missingSinceInit[kind]=0;
        for(const resource of current[kind])if(!initial.has(resource))addedSinceInit[kind]++;
        for(const resource of initial)if(!current[kind].has(resource))missingSinceInit[kind]++;
      }
      this.cachedResourceInventory={scope:'unique scene and owned world CPU assets including hidden detail trees; excludes GPU internal targets',
        sampledAtRenderSeconds:this.elapsed,counts,initialCounts,addedSinceInit,missingSinceInit,
        identitiesUnchanged:Object.values(addedSinceInit).every(value=>value===0)&&Object.values(missingSinceInit).every(value=>value===0)};
      this.lastResourceInventory=this.elapsed;
    }
    const inventory=this.cachedResourceInventory;
    return {...inventory,counts:{...inventory.counts},initialCounts:{...inventory.initialCounts},
      addedSinceInit:{...inventory.addedSinceInit},missingSinceInit:{...inventory.missingSinceInit}};
  }
  makeLighting(){
    if(this.isDeep){
      // A local observer lamp is the only illuminant. There is no ambient,
      // solar or bioluminescent energy inferred from the scene's depth.
      this.observerSpot=new THREE.SpotLight(0xf4efe5,36,15,.62,.65,2);
      this.observerSpot.castShadow=false;
      this.observerTarget=new THREE.Object3D();this.scene.add(this.observerTarget);
      this.observerSpot.target=this.observerTarget;this.scene.add(this.observerSpot);
      this.observerFill=new THREE.PointLight(0xdbe5e8,.06,3,2);this.scene.add(this.observerFill);
      this.visualEnvironment.observerLightingStatus='uncalibrated-camera-local-display-lamp';
      this.visualEnvironment.lightIntensityAdaptation='camera-target-distance-only-no-ecological-effect';
      return;
    }
    this.sun=new THREE.DirectionalLight(this.isKelp?0xe1e6d7:0xe5f2ee,3.2);
    this.sun.position.set(-7,this.surfaceY+3,4);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-15;this.sun.shadow.camera.right=15;
    this.sun.shadow.camera.top=15;this.sun.shadow.camera.bottom=-15;this.sun.shadow.camera.near=.5;this.sun.shadow.camera.far=45;
    this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.025;
    this.sun.target.position.set(0,.4,-3);this.scene.add(this.sun,this.sun.target);
    this.ambient=new THREE.HemisphereLight(this.isKelp?0xa3bca6:0xaed5df,this.isKelp?0x2b4032:0x335263,1.2);
    this.scene.add(this.ambient);
  }
  updateObserverLighting(){
    if(!this.isDeep)return;
    const enabled=this.sim.environment.observerLight>0;
    const direction=this.frameVectors.direction;this.camera.getWorldDirection(direction);
    this.observerSpot.position.copy(this.camera.position);
    this.observerFill.position.copy(this.camera.position);
    this.observerTarget.position.copy(this.camera.position).addScaledVector(direction,4);
    // Scale lamp output for the observer's chosen camera distance. This is an
    // exposure aid, explicitly separate from natural light and food flux.
    const distance=clamp(this.camera.position.distanceTo(this.controls.target),.25,5);
    this.observerSpot.intensity=enabled?distance*distance*2.2:0;
    this.observerFill.intensity=enabled?.06*Math.min(2,distance)**2:0;
    this.visualEnvironment.observerLightOn=enabled;
  }
  makeWaterVolume(){
    if(this.isDeep)return;
    this.waterColors={daylight:{value:1},top:{value:new THREE.Color(this.isKelp?'#81a09a':'#64bac9')},horizon:{value:new THREE.Color(this.isKelp?'#386258':'#246f88')},bottom:{value:new THREE.Color(this.isKelp?'#1f3933':'#144d65')}};
    const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,uniforms:this.waterColors,
      vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 direction;uniform vec3 top;uniform vec3 horizon;uniform vec3 bottom;void main(){vec3 d=normalize(direction);float up=smoothstep(${this.isKelp ? '-.05,.9' : '0.,.5'},d.y);float down=1.-smoothstep(-.85,-.08,d.y);vec3 col=mix(horizon,top,up);col=mix(col,bottom,down);gl_FragColor=vec4(col,1.);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
    this.ownMaterial(material);
    this.waterVolume=new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(85,24,16)),material);this.waterVolume.renderOrder=-100;this.waterVolume.frustumCulled=false;this.scene.add(this.waterVolume);
  }
  texture(path, repeat) {
    const url=`${import.meta.env?.BASE_URL || '/'}${path.replace(/^\/+/, '')}`;
    const tex=new THREE.TextureLoader().load(url,undefined,undefined,()=>{this.errors.push(`纹理加载失败：${url}`);});
    this.worldTextures.add(tex);
    tex.colorSpace=THREE.SRGBColorSpace; tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeat,repeat);tex.anisotropy=4;return tex;
  }
  caustics(material) {
    if(this.isDeep)return material;
    const uniform={value:0}; this.causticUniforms.push(uniform);
    const previousCompile=material.onBeforeCompile,previousCacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previousCompile.call(material,shader,renderer);
      shader.uniforms.uReefTime=uniform;
      shader.vertexShader='varying vec3 vReefWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvReefWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='uniform float uReefTime;\nvarying vec3 vReefWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>', `
        float a=sin(vReefWorld.x*4.1+sin(vReefWorld.z*2.4+uReefTime*.3)*1.8+uReefTime*.4);
        float b=sin(vReefWorld.z*4.4+sin(vReefWorld.x*3.3-uReefTime*.28)*1.7);
        float c=pow(clamp((a+b)*.5,0.,1.),7.);
        gl_FragColor.rgb*=1.0+c*${this.isKelp ? '.05' : '.14'};
        #include <dithering_fragment>
      `);
    }; material.customProgramCacheKey=()=> `${this.biomeId}-caustic-v2/${previousCacheKey}`; return material;
  }
  bindAuthoredSurface(){
    const generator=()=>this.oceanChunks.generator;
    const floor=(x,z)=>generator().floorSurface(x,z).height;
    if(this.isDeep){
      this.sim._options={...this.sim._options,supportHeight:(x,z)=>generator().heightAt(x,z),
        anchors:this.sim._anchors.map(anchor=>({...anchor,y:generator().heightAt(anchor.x,anchor.z)}))};
    }else if(this.isKelp){
      this.sim.options={...this.sim.options,supportHeight:(x,z)=>generator().heightAt(x,z),
        supportNormal:(x,z)=>generator().supportAt?.(x,z).normal??(kelpHabitatHeight(x,z)-kelpFloorHeight(x,z)>.001?kelpHabitatNormal(x,z):generator().floorSurface(x,z).normal)};
    }else{
      this.sim.floorHeight=floor;
      this.sim.supportHeight=(x,z)=>reefHabitatHeight(x,z)-reefFloorHeight(x,z)>.001?reefHabitatHeight(x,z):floor(x,z);
    }
    // Bind only during construction, before any live time has elapsed. Normal
    // navigation/restores never reset a model or replace its population.
    this.sim.reset(this.sim.seed);this.syncPopulation();
  }
  floorY(x,z){ return this.oceanChunks?(this.oceanChunks.generator.floorSurface?.(x,z).height??this.oceanChunks.generator.sample(x,z).floorY):(this.isDeep ? deepFloorHeight : this.isKelp ? kelpFloorHeight : reefFloorHeight)(x,z); }
  habitatY(x,z){ return this.oceanChunks?Math.max(this.oceanChunks.generator.heightForCamera(x,z),this.oceanEcology?.sceneSupportHeight?.(x,z,true)??-Infinity,this.oceanEcology?.habitatSceneSupportHeight?.(x,z,true)??-Infinity,this.oceanEcology?.macroLandscapeSupportHeight?.(x,z,true)??-Infinity):(this.isDeep ? deepFloorHeight : this.isKelp ? kelpHabitatHeight : reefHabitatHeight)(x,z); }
  makeFloor(material){
    // Preserve the existing 0.5 m sampling in the observed central 70 m.
    // Four coarse strips extend that exact boundary to 160 m without adding
    // another enormous grid. Both share the same sampled height and UV scale.
    const inner=this.ownGeometry(new THREE.PlaneGeometry(70,70,140,140));inner.rotateX(-Math.PI/2);
    const positions=inner.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setY(i,this.floorY(positions.getX(i),positions.getZ(i)));
    inner.computeVertexNormals();
    const floor=new THREE.Mesh(inner,material);floor.receiveShadow=!this.isDeep;
    this.scene.add(floor);this.floorMesh=floor;
    const ringPositions=[],uvs=[],indices=[];
    const sides=[(v,r)=>[v*r, -r],(v,r)=>[r,v*r],(v,r)=>[-v*r,r],(v,r)=>[-r,-v*r]];
    for(const side of sides){
      const offset=ringPositions.length/3;
      for(const r of [35,80])for(let i=0;i<=140;i++){
        const [x,z]=side(-1+2*i/140,r);
        ringPositions.push(x,this.floorY(x,z),z);uvs.push(x/70+.5,.5-z/70);
      }
      for(let i=0;i<140;i++){
        const a=offset+i,b=a+1,c=a+141,d=c+1;
        // Opposite boundary traversal produces upward-facing triangles.
        indices.push(a,b,c,b,d,c);
      }
    }
    const ring=this.ownGeometry(new THREE.BufferGeometry());
    ring.setAttribute('position',new THREE.Float32BufferAttribute(ringPositions,3));
    ring.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));ring.setIndex(indices);ring.computeVertexNormals();
    const continuation=new THREE.Mesh(ring,material);continuation.receiveShadow=!this.isDeep;this.scene.add(continuation);this.floorContinuation=continuation;
    this.visualEnvironment.floorCoverage={centralWidthM:70,outerWidthM:160,centralTriangles:140*140*2,continuationTriangles:4*140*2};
  }
  makeHighlight(){
    this.highlight=new THREE.Mesh(this.ownGeometry(new THREE.TorusGeometry(.28,.003,6,64)),this.ownMaterial(new THREE.MeshBasicMaterial({color:0xe4ecce,transparent:true,opacity:.3,depthTest:true,depthWrite:false})));
    this.highlight.visible=false;this.highlight.renderOrder=20;this.scene.add(this.highlight);
  }
  makeHabitat(){
    this.cameraRocks = [];
    const sand=this.caustics(this.ownMaterial(new THREE.MeshStandardMaterial({color:this.isDeep?0x9c9186:this.isKelp?0x686a51:0xe1d8bd,map:this.texture(this.isKelp?'/assets/reef-rock-albedo.png':'/assets/sand-albedo.png',this.isKelp?18:28),roughness:.99})));
    this.sandMaterial=sand;
    if(this.isDeep||this.isKelp)this.makeFloor(sand);
    this.decorations=new THREE.Group();this.scene.add(this.decorations);
    if(this.isDeep||this.isLivingShallows){this.makeHighlight();return;}
    const rockTexture=this.texture('/assets/reef-rock-albedo.png',2.2);
    const rock=this.caustics(this.ownMaterial(this.isKelp?
      new THREE.MeshStandardMaterial({color:0x757460,map:rockTexture,bumpMap:rockTexture,bumpScale:.025,roughness:.95}):
      createReefRockMaterial(rockTexture)));
    if(rock.userData.rockProjection)this.visualEnvironment.terrainTextureProjection={...rock.userData.rockProjection};
    if(!this.isKelp)this.visualEnvironment.decorativeCoralPalette='authored restrained brown/ochre by morphology; not surveyed species, tissue condition or biomass';
    if(!this.isKelp)this.visualEnvironment.decorativeCoralDetail='preallocated low/medium branching crowns; 2.25–3 display-diameter viewing band; massive colonies retain their fitted low surface';
    const {rocks:auxiliaryRocks,random}=createReefSceneryLayout();const all=[];
    const rockAt=(x,y,z,sx,sy,sz,bedSupported=false)=>{
      const rockShape=[x,y,z,sx,sy,sz];
      this.cameraRocks.push({rock:rockShape,bedSupported});
      const geo=this.ownGeometry(this.isKelp?
        new THREE.SphereGeometry(1,22,14):
        createReefRockGeometry(rockShape,{bedSupported}));
      if(this.isKelp){geo.scale(sx,sy,sz);geo.computeVertexNormals();geo.translate(x,y,z);}
      all.push(geo);
    };
    // Authored opposing reef shoulders leave a curved, legible sand corridor.
    this.rocks.forEach((v,index)=>rockAt(...v,!this.isKelp&&index!==REEF_BRIDGE_ROCK_INDEX));
    if(!this.isKelp)auxiliaryRocks.forEach(v=>rockAt(...v));
    const merged=this.ownGeometry(mergeGeometries(all));all.forEach(g=>{g.dispose();this.worldGeometries.delete(g);});const reef=new THREE.Mesh(merged,rock);reef.castShadow=true;reef.receiveShadow=true;this.scene.add(reef);this.reefMesh=reef;
    if(!this.isKelp){
      enableStaticRayQueries(reef);
      const placementRay=new THREE.Raycaster();
      placementRay.firstHitOnly=true;
      const shoulders=[...REEF_ROCKS.slice(0,7),...REEF_ROCKS.slice(10)];
      const massiveBounds=[];
      const massiveSeparationM=.012;
      const coverOrganization={main:0,foreground:0,rear:0,corridorOmissions:0,
        scope:'authored decorative cover hierarchy on unchanged hard substrate; no measured cover or ecological biomass'};
      const boulderAttachment={method:'rigid basal-vertex fit on rendered hard substrate',
        candidates:0,supportAttempts:0,centerFallbacks:0,admitted:0,omitted:0,omittedOverlap:0,minimumSeparationM:massiveSeparationM,
        basalVertexSamples:0,maxBasalGapM:null,minimumVisibleCrownM:null,
        scope:'decorative colonies before scan reservation; sampled basal contact and non-overlapping world AABBs, not measured attachment or physical stability'};
      for(let i=0;i<165;i++){
        let shoulder=shoulders[i%shoulders.length];
        const angle=random()*Math.PI*2,radius=Math.sqrt(random())*.88;
        const morphotype=i%5===0?'boulder':i%5===1||i%5===2?'table':'branching';
        const organized=reefCoverOrganization(i,morphotype,angle,radius,0);
        if(organized)shoulder=REEF_ROCKS[organized.supportIndex];
        let x=shoulder[0]+(organized?organized.nx:Math.cos(angle)*radius)*shoulder[3],
          z=shoulder[2]+(organized?organized.nz:Math.sin(angle)*radius)*shoulder[5];
        placementRay.set(new THREE.Vector3(x,7,z),new THREE.Vector3(0,-1,0));reef.updateMatrixWorld();
        const surface=placementRay.intersectObject(reef)[0];if(!surface)continue;
        // Use each morphology's restrained brown/ochre tissue palette rather
        // than tinting every decorative colony the same grey-green.
        // One authored close-view colony is the tissue-relief prototype. Its
        // display cups do not add ecological agents or measured coral biomass.
        const tissuePrototype=i===144&&morphotype==='branching';
        const coral=createReefLandscapeCoral(morphotype,
          tissuePrototype?['#96734e','#a58154','#8c6c46','#ac8b5a']:undefined,i%4,
          tissuePrototype?{nearDetail:'medium-prototype'}:{});
        if(tissuePrototype)coral.userData.tissuePrototype={version:'v3',placementIndex:i,
          scope:'authored decorative near-view colony; not a new ecological agent or measured density'};
        const scaleDraw=random();
        const s=organized?reefCoverOrganization(i,morphotype,angle,radius,scaleDraw).scale:
          morphotype==='branching'?.7+scaleDraw*.95:morphotype==='boulder'?.65+scaleDraw*.55:1.1+scaleDraw*1.2;
        const yaw=random()*Math.PI*2;
        if(morphotype==='boulder'){
          // A broad massive colony needs a gentle support footprint. Keep its
          // original geometry and consume the same placement random draws.
          x=shoulder[0]+(x-shoulder[0])*(.10/.88);z=shoulder[2]+(z-shoulder[2])*(.10/.88);
          let fit=fitReefLandscapeBoulder(coral,reef,{x,z,scale:s,yaw});
          boulderAttachment.candidates++;
          boulderAttachment.supportAttempts++;
          let usedCenterFallback=false;
          if(!fit.ok){
            // One deterministic alternative on the broad crown. Preserve the
            // colony's scale, yaw and RNG schedule; retain the same slope gate.
            fit=fitReefLandscapeBoulder(coral,reef,{x:shoulder[0],z:shoulder[2],scale:s,yaw});
            boulderAttachment.supportAttempts++;usedCenterFallback=fit.ok;
          }
          if(!fit.ok){boulderAttachment.omitted++;disposeReefLandscapeCoral(coral);continue;}
          coral.position.fromArray(fit.rootPositionM);
          coral.scale.setScalar(s);coral.rotation.y=yaw;coral.updateMatrixWorld(true);
          const bounds=new THREE.Box3().setFromObject(coral);
          // Repeated candidates used the same gentle central support patch.
          // Keep their authored geometry intact and omit intersecting crowns.
          if(massiveBounds.some(previous=>previous.intersectsBox(bounds.clone().expandByScalar(massiveSeparationM)))){
            boulderAttachment.omitted++;boulderAttachment.omittedOverlap++;
            disposeReefLandscapeCoral(coral);continue;
          }
          massiveBounds.push(bounds);
          if(usedCenterFallback)boulderAttachment.centerFallbacks++;
          boulderAttachment.admitted++;boulderAttachment.basalVertexSamples+=fit.basalVertexSamples;
          boulderAttachment.maxBasalGapM=Math.max(boulderAttachment.maxBasalGapM??-Infinity,fit.maxBasalGapM);
          boulderAttachment.minimumVisibleCrownM=Math.min(boulderAttachment.minimumVisibleCrownM??Infinity,fit.visibleCrownAboveHighestSubstrateM);
          const {basalSamples,...summary}=fit;coral.userData.landscapePlacement=summary;
        }else coral.position.set(x,surface.point.y-.07,z);
        coral.scale.setScalar(s);coral.rotation.y=yaw;coral.updateMatrixWorld(true);
        if(organized&&crossesReefSandCorridor(new THREE.Box3().setFromObject(coral))){
          coverOrganization.corridorOmissions++;disposeReefLandscapeCoral(coral);continue;
        }
        if(organized){coverOrganization[organized.band]++;coral.userData.coverBand=organized.band;}
        this.decorations.add(coral);
        if(tissuePrototype){
          // One authored viewing colony on the existing rock6 slope. Its rigid
          // pose was fitted to all28 actual main-stem basal centres; other
          // colonies and the scenery RNG schedule remain unchanged. Finite
          // contact samples are not a whole-surface attachment/stability claim.
          coral.position.set(5.712060607606601,-.12278600404148743,-8.09095454429505);
          coral.scale.setScalar(.85);
          coral.quaternion.set(.057035277903060205,.2325209243081137,-.1456664646613761,-.9599282670629494);
          coral.userData.landscapePlacement={method:'authored rigid pose on rendered rock6 slope',
            mainStemBasalSamples:28,tiltDegrees:18,scope:'finite basal centres, not whole-surface contact or measured growth'};
          this.presets.coral={position:[6.4498576334139885,.38798757637674064,-8.168493905913817],
            target:[5.636680300550777,.022057776588295427,-8.168493905913817]};
          this.visualEnvironment.representativeCoral={placementIndex:i,rootPositionM:coral.position.toArray(),
            scale:.85,quaternionXYZW:coral.quaternion.toArray(),view:'authored readable crown and tissue approximation'};
        }
      }
      this.visualEnvironment.decorativeBoulderAttachment=boulderAttachment;
      this.visualEnvironment.reefCoverOrganization=coverOrganization;
      enableStaticRayQueries(this.decorations);
      this.attachReefSkeleton();
      this.landscapeCoralDetail={nearColonies:0,
        farColonies:this.decorations.children.filter(coral=>coral.userData.landscapeDetail).length,
        scope:'retained decorative branching/table colonies; preallocated geometry, no modeled biomass'};
    }
    this.makeHighlight();
  }
  attachReefSkeleton(){
    const asset=this.reefScanAsset;if(!asset)return;
    const displayExcision=prepareReefSkeletonDisplay(asset.group);
    const placement=placeReefSkeletonOnSubstrate(asset.group,this.reefMesh);
    enableStaticRayQueries(asset.group);
    // Reserve a small visible hard-bottom patch for the skeleton. Only cosmetic
    // landscape clones are removed; model organisms and resources stay intact.
    const bounds=new THREE.Box3().setFromObject(asset.group),reserved=bounds.clone().expandByVector(new THREE.Vector3(.18,.12,.18));
    this.decorations.updateMatrixWorld(true);let omittedLandscapeClones=0;
    for(const coral of [...this.decorations.children]){
      if(reserved.intersectsBox(new THREE.Box3().setFromObject(coral))){coral.removeFromParent();disposeReefLandscapeCoral(coral);omittedLandscapeClones++;}
    }
    this.scene.add(asset.group);
    this.environmentAssets.push({...asset.metadata,displayExcision,placement:{...placement,omittedLandscapeClones,landscapeReservationMarginM:[.18,.12,.18]}});
    const target=bounds.getCenter(new THREE.Vector3());
    const position=this.clearCameraPosition(target.clone().add(new THREE.Vector3(.78,.75,.9)));
    this.presets.skeleton={position:position.toArray(),target:target.toArray()};
  }
  makeSurface(){
    if(this.isDeep)return;
    this.surfaceTime={value:0};
    const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{t:this.surfaceTime,daylight:this.waterColors.daylight},vertexShader:`uniform float t;varying vec2 vUv;varying float viewDistance;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*.7+t*.4)*.055+sin(p.y*.8-t*.3)*.04;vec4 viewPosition=modelViewMatrix*vec4(p,1.);viewDistance=length(viewPosition.xyz);gl_Position=projectionMatrix*viewPosition;}`,fragmentShader:`uniform float t;uniform float daylight;varying vec2 vUv;varying float viewDistance;void main(){float w=sin(vUv.x*82.+t*.3)*sin(vUv.y*64.-t*.2);float fade=${this.isKelp?'1.':'1.-smoothstep(18.,36.,viewDistance)'};vec3 colour=(vec3(${this.isKelp?'.54,.68,.57':'.58,.82,.85'})+w*.035)*mix(.035,1.,daylight);gl_FragColor=vec4(colour,.27*fade);}`});
    this.ownMaterial(material);
    const surface=new THREE.Mesh(this.ownGeometry(new THREE.PlaneGeometry(90,90,60,60)),material);surface.rotation.x=-Math.PI/2;surface.position.y=this.surfaceY;this.scene.add(surface);this.waterSurface=surface;
  }
  makeParticles(){
    if(this.isDeep){this.makeDeepParticles();return;}
    const random=seeded(355),p=new Float32Array(720*3);for(let i=0;i<720;i++){p[i*3]=random()*34-17;p[i*3+1]=random()*(this.surfaceY-1);p[i*3+2]=random()*34-17;}
    const geo=this.ownGeometry(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.BufferAttribute(p,3));
    this.particleUniforms={t:{value:0},current:{value:.15},opacity:{value:.24}};
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:this.particleUniforms,vertexShader:`uniform float t;uniform float current;void main(){vec3 p=position;p.x=mod(p.x+17.+t*current*.7,34.)-17.;p.z+=sin(t*.14+p.y)*.15;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(6./max(1.,-mv.z),.8,2.1);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float opacity;void main(){float d=length(gl_PointCoord-.5);if(d>.45)discard;gl_FragColor=vec4(.73,.86,.8,opacity*(1.-d*2.));}`});
    this.ownMaterial(mat);this.particles=new THREE.Points(geo,mat);this.scene.add(this.particles);
  }
  makeDeepParticles(){
    // Sparse visual marine snow is authored separately from the model's
    // finite suspended animal-food parcels. Point counts encode no biomass.
    const random=seeded(355),positions=new Float32Array(180*3);
    for(let i=0;i<180;i++){positions[i*3]=random()*18-9;positions[i*3+1]=random()*4+.05;positions[i*3+2]=random()*16-8;}
    const geometry=this.ownGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.particleUniforms={t:{value:0},drift:{value:0},opacity:{value:.18},light:{value:1},beamCos:{value:Math.cos(.62)}};
    const material=this.ownMaterial(new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms:this.particleUniforms,
      vertexShader:`uniform float t;uniform float drift;uniform float beamCos;varying float intensity;void main(){vec3 p=position;p.x=mod(p.x+9.+drift,18.)-9.;p.y=mod(p.y-.012*t,4.);vec4 mv=modelViewMatrix*vec4(p,1.);float d=length(mv.xyz);float beam=smoothstep(beamCos,beamCos+.12,-mv.z/max(.001,d));intensity=beam*exp(-d*.32);gl_PointSize=clamp(5./max(.5,-mv.z),.7,2.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float opacity;uniform float light;varying float intensity;void main(){float d=length(gl_PointCoord-.5);if(d>.45)discard;gl_FragColor=vec4(.75,.77,.76,light*opacity*intensity*(1.-d*2.));}`
    }));
    this.deepParticles=new THREE.Points(geometry,material);this.deepParticles.userData.role='display-marine-snow-not-resource-pool';this.scene.add(this.deepParticles);
  }
  captureWorldResources(){
    // Organism modules own their reference-counted caches. Skip their roots
    // here; only terrain, water, particles and selection geometry belong to us.
    const visit=object=>{
      if(object.userData.resources||object.userData.shared||object.userData.oceanStreaming)return;
      if(object.geometry)this.worldGeometries.add(object.geometry);
      if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material]){
        this.worldMaterials.add(material);
        for(const value of Object.values(material))if(value?.isTexture)this.worldTextures.add(value);
      }
      object.children.forEach(visit);
    };
    visit(this.scene);
  }
  disposeEntity(object){ (this.isDeep?disposeDeepOrganism:this.isKelp?disposeKelpOrganism:disposeOrganism)(object); }
  syncPopulation(){
    const ids=new Set(this.sim.agents.map(a=>a.id));
    for(const [id,e] of this.entities){if(!ids.has(id)){e.object.removeFromParent();this.disposeEntity(e.object);this.entities.delete(id);}}
    for(const agent of this.sim.agents){
      if(this.entities.has(agent.id))continue;
      const s=this.catalog.get(agent.speciesId);if(!s)continue;
      const object=this.isDeep?createDeepOrganism(s):this.isKelp?createKelpOrganism(s,{anchor:s.kind==='kelp'?this.sim.getKelpAnchor(agent.id):undefined}):createOrganism(s);
      this.entities.set(agent.id,{object,kind:s.kind});
      if(!this.isKelp&&!this.isDeep&&s.kind==='coral')enableStaticRayQueries(object);
      object.userData.agentId=agent.id;object.userData.sourceLinks=(s.sourceLinks||s.sources||[]).map(source=>({...source}));
      object.scale.setScalar(s.kind==='kelp'?1:(agent.sizeM||s.lengthM||.3));
      object.traverse(o=>{if(o.isMesh){if(this.isDeep||(!this.isKelp&&s.kind!=='fish'))o.castShadow=false;o.receiveShadow=!this.isDeep;}});
      (this.reefRoot||this.scene).add(object);
      this.updateOrganism(agent,this.entities.get(agent.id),this.sim.metrics);
    }
  }
  updateOrganism(agent,entity,metrics){
    const object=entity.object;object.visible=agent.alive!==false;
    if(entity.kind==='kelp'){
      // Giant kelp geometry is in metres and animation sets its world origin.
      // Attached snails remain independent world objects using the same clock.
      const anchor=this.sim.getKelpAnchor(agent.id);
      if(!this.transition&&!this.following&&this.oceanChunks&&!kelpAnimationInRange(anchor,{
        x:this.camera.position.x+this.oceanRenderOrigin.x,y:this.camera.position.y,
        z:this.camera.position.z+this.oceanRenderOrigin.z},this.camera.far))return;
      object.scale.setScalar(1);object.quaternion.identity();
      animateKelpOrganism(object,metrics.timeSec,this.sim.environment,anchor);
      return;
    }
    object.position.set(agent.position.x,agent.position.y,agent.position.z);
    object.scale.setScalar(agent.sizeM||.3);
    const heading=Number.isFinite(agent.heading)?agent.heading:Math.atan2(agent.velocity?.z||0,agent.velocity?.x||1);
    object.rotation.set(0,-heading,0);
    if(this.isDeep){
      // The ecology samples mouths and all 12 sea-pig feet in yaw-only root
      // coordinates. Do not tilt this root to the floor normal or pitch a fish
      // away from its shared mouth / 0.03 m lower-support clearance.
      animateDeepOrganism(object,metrics.timeSec,agent,this.sim.environment);
      return;
    }
    if(entity.kind==='fish'){
      const vy=agent.velocity?.y||0,vs=Math.hypot(agent.velocity?.x||0,agent.velocity?.z||0);
      object.rotation.z=clamp(Math.atan2(vy,Math.max(.08,vs)),-.25,.25);
      if(agent.state==='grazing'&&typeof agent.lastFeedAt==='number'){
        const since=metrics.timeSec-agent.lastFeedAt;
        if(since>=0&&since<.7)object.rotation.z-=.18*Math.sin(since/.7*Math.PI);
      }
    }else if(this.isKelp){
      const attachment=agent.attachment;
      const normal=attachment?kelpLeafNormal(this.sim.getKelpAnchor(attachment.hostId),attachment.leafIndex,attachment.along,metrics.timeSec,this.sim.environment,attachment.frondIndex??0):agent.supportNormal||kelpHabitatNormal(agent.position.x,agent.position.z);
      const up=new THREE.Vector3(normal.x,normal.y,normal.z).normalize();
      const forward=new THREE.Vector3(Math.cos(heading),0,Math.sin(heading));
      forward.addScaledVector(up,-forward.dot(up)).normalize();
      const side=new THREE.Vector3().crossVectors(forward,up).normalize();
      object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward,up,side));
    }
    if(this.isKelp)animateKelpOrganism(object,metrics.timeSec,this.sim.environment);
    else animateOrganism(object,metrics.timeSec,agent.state==='fleeing'?2:(agent.state==='resting'||agent.state==='fixed'?.25:1));
  }
  select(id){ this.selectedId=id;this.oceanAnimals?.setObservationAgent?.(id);if(!id){this.following=false;if(this.transition?.agentId)this.transition=null;}if(this.lastFocusAssessment?.agentId!==id)this.lastFocusAssessment=null;this.highlight.visible=!!id;this.emitSnapshot(true); }
  findAgent(id){return this.sim.agents.find(a=>a.id===id)||this.oceanEcology?.agents.find(a=>a.id===id);}
  requestOceanEcology(position=this.oceanWorldPosition()){
    if(!this.oceanEcology||this.oceanEcologyResetting||this.disposed)return;
    const center=`${Math.floor(position.x/64)},${Math.floor(position.z/64)}`;
    if(center===this.oceanEcologyCenter)return;
    if(this.elapsed<(this.oceanEcologyRetryAt||0))return;
    this.oceanEcologyCenter=center;
    this.oceanEcology.update(position).then(result=>{
      if(this.disposed)return;
      if(this.isLivingShallows)this.oceanChunks.update(this.oceanWorldPosition());
      if(result===false&&this.oceanEcologyCenter===center){this.oceanEcologyCenter=null;this.oceanEcologyRetryAt=this.elapsed+2;}
      this.oceanAnimals.update(this.oceanEcology.agents,this.sim.metrics.timeSec,this.oceanRenderOrigin,this.camera.position);
      this.updateKelpDriftFood();
      this.oceanChunks.setDetailedHosts?.(this.oceanAnimals.detailedHostIds);
      if(this.selectedId&&!this.findAgent(this.selectedId)){this.following=false;this.transition=null;this.selectedId=null;this.oceanAnimals?.setObservationAgent?.(null);this.onSelect(null);}
      this.emitSnapshot();
    }).catch(error=>{if(!this.disposed)this.errors.push('区域生态加载失败：'+error.message);});
  }
  updateKelpDriftFood(){
    if(this.oceanMacroLandscape&&!this.oceanEcologyResetting&&this._macroRenderRevision!==this.oceanEcology.macroLandscapeRevision){
      this.oceanMacroLandscape.update(this.oceanEcology.macroLandscapeElements,this.oceanChunks.generator,this.oceanRenderOrigin);
      this._macroRenderRevision=this.oceanEcology.macroLandscapeRevision;
    }
    if(this.oceanHabitatScenes&&!this.oceanEcologyResetting)this.oceanHabitatScenes.update(
      this.oceanEcology?.habitatSceneElements??[],this.oceanChunks.generator,this.oceanRenderOrigin);
    if(this.oceanSceneElements&&!this.oceanEcologyResetting)this.oceanSceneElements.update(
      this.oceanEcology?.sceneElements??[],this.oceanChunks.generator,this.oceanRenderOrigin);
    if(this.oceanKelpUnderstory&&!this.oceanEcologyResetting)this.oceanKelpUnderstory.update(
      this.oceanEcology?.understoryRegions??[],this.oceanRenderOrigin);
    if(this.oceanKelpDriftFood&&!this.oceanEcologyResetting)this.oceanKelpDriftFood.update(
      this.oceanEcology?.driftFoodPatches??[],this.oceanChunks.generator,this.oceanRenderOrigin);
  }
  focusUp(agent){
    const kind=this.catalog.get(agent.speciesId)?.kind;
    if(kind==='kelp'||kind==='fish'||!this.isKelp)return new THREE.Vector3(0,1,0);
    const object=this.entities.get(agent.id)?.object;
    if(object)return new THREE.Vector3(0,1,0).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const normal=agent.supportNormal||kelpHabitatNormal(agent.position.x,agent.position.z);
    return new THREE.Vector3(normal.x,normal.y,normal.z).normalize();
  }
  focusTarget(agent){
    const kind=this.catalog.get(agent.speciesId)?.kind,size=agent.sizeM||.3;
    const height=this.isDeep?size*(kind==='sea-spider'?SEA_SPIDER_BODY_LOCAL.y:kind==='fish'?.19:kind==='cucumber'?.32:.33):kind==='kelp'?size*.45:kind==='fish'||kind==='ray'?0:size*(kind==='sponge'?.45:kind==='octopus'?.07:kind==='crab'?.15:kind==='urchin'?.282:kind==='snail'?.25:.1);
    return new THREE.Vector3(agent.position.x-(this.oceanChunks?this.oceanRenderOrigin.x:0),agent.position.y,agent.position.z-(this.oceanChunks?this.oceanRenderOrigin.z:0)).addScaledVector(this.focusUp(agent),height);
  }
  focusObstacles(excludedId,candidatePosition=null){
    const meshes=[];
    const visit=(object,chosenDetail=false)=>{
      if(!object||(!object.visible&&!chosenDetail))return;
      const detail=object.userData.landscapeDetail;
      if(detail&&candidatePosition){
        const level=reefLandscapeLevelAt(object,candidatePosition,this.camera.position);
        visit(level==='near'?detail.near:detail.far,true);return;
      }
      if(object.isMesh){
        const materials=Array.isArray(object.material)?object.material:[object.material];
        if(materials.some(material=>material?.visible!==false&&(!material.transparent||material.opacity>.08)))meshes.push(object);
      }
      for(const child of object.children)visit(child);
    };
    visit(this.reefMesh);visit(this.decorations);visit(this.reefScanAsset?.group);
    // Live fronds, pneumatocysts and holdfasts obstruct a real observer just
    // like rock. Ignore only the organism currently being observed.
    for(const [id,entity]of this.entities)if(id!==excludedId)visit(entity.object);
    if(this.findAgent(excludedId)?.regionId){
      visit(this.oceanChunks?.root);
      visit(this.oceanSceneElements?.root);
      visit(this.oceanHabitatScenes?.root);
      visit(this.oceanMacroLandscape?.root);
      for(const [id,entity]of this.oceanAnimals.entities)if(id!==excludedId)visit(entity.object);
      for(const host of this.oceanAnimals.hosts?.values()||[])visit(host);
    }
    return meshes;
  }
  assessFocus(agent,{minDistanceM=0}={}){
    const kind=this.catalog.get(agent.speciesId)?.kind,size=agent.sizeM||.3;
    const target=this.focusTarget(agent),up=this.focusUp(agent),worldUp=new THREE.Vector3(0,1,0);
    const distance=kind==='kelp'?Math.min(14,Math.max(7,size*1.15)):Math.max(this.isKelp?.25:this.isDeep?.14:.18,size*2.8,minDistanceM);
    const angle=kind==='ray'||kind==='turtle'?(agent.heading||0)+.4:kind==='fish'?(agent.heading||0)+Math.PI/2:.8;
    const turns=[0,.55,-.55,1.1,-1.1,1.65,-1.65,2.2,-2.2,Math.PI];
    const benthic=kind!=='fish'&&kind!=='ray'&&kind!=='kelp'&&kind!=='turtle';
    const pitches=kind==='kelp'?[.12,.35]:kind==='ray'?[.45,.65]:benthic?[.5,.9,1.35]:[.2,.5];
    const ray=new THREE.Raycaster();
    ray.firstHitOnly=true;
    let best=null;let candidateCount=0;
    for(const pitch of pitches)for(const turn of turns){
      const lateral=new THREE.Vector3(Math.cos(angle+turn),0,Math.sin(angle+turn));
      if(benthic){lateral.addScaledVector(up,-lateral.dot(up));if(lateral.lengthSq()<.001)lateral.crossVectors(up,new THREE.Vector3(0,0,1));}
      lateral.normalize();
      const lift=benthic?up.clone().multiplyScalar(.7).addScaledVector(worldUp,.3).normalize():worldUp;
      let offset=lateral.multiplyScalar(distance).addScaledVector(lift,distance*pitch);
      // Keep candidates inside OrbitControls' actual polar limits so its
      // update does not silently move the camera back into an obstruction.
      const spherical=new THREE.Spherical().setFromVector3(offset);
      spherical.phi=clamp(spherical.phi,this.controls.minPolarAngle+.015,this.controls.maxPolarAngle-.015);
      offset.setFromSpherical(spherical);
      const position=this.clearCameraPosition(target.clone().add(offset));
      const obstacles=this.focusObstacles(agent.id,position);
      const view=target.clone().sub(position).normalize();
      const right=new THREE.Vector3().crossVectors(view,worldUp).normalize();
      const screenUp=new THREE.Vector3().crossVectors(right,view).normalize();
      const radius=kind==='kelp'?Math.min(.35,size*.035):size*.16;
      const samples=[target,target.clone().addScaledVector(right,radius),target.clone().addScaledVector(right,-radius),
        target.clone().addScaledVector(screenUp,radius*.6),target.clone().addScaledVector(screenUp,-radius*.4)];
      let visibleSamples=0,centerVisible=false;
      for(let i=0;i<samples.length;i++){
        const delta=samples[i].clone().sub(position),length=delta.length();
        ray.set(position,delta.multiplyScalar(1/length));ray.near=.003;ray.far=Math.max(.003,length-.001);
        const visible=ray.intersectObjects(obstacles,false).length===0;
        if(visible)visibleSamples++;if(i===0)centerVisible=visible;
      }
      const travel=Math.min(30,this.camera.position.distanceTo(position)/(distance+1));
      const score=(samples.length-visibleSamples)*10+(centerVisible?0:25)+travel*.002+Math.abs(turn)*.004+(benthic?Math.abs(pitch-.9)*.015:Math.abs(pitch-.2)*.015);
      candidateCount++;
      if(!best||score<best.score)best={position,target,score,visibleSamples,totalSamples:samples.length,centerVisible,obstacleMeshes:obstacles.length};
    }
    return {...best,candidateCount,agentId:agent.id};
  }
  applyFocus(agent,assessment){
    this.followOffsetY=assessment.target.y-agent.position.y;
    this.lastFocusAssessment={agentId:agent.id,visibleSamples:assessment.visibleSamples,totalSamples:assessment.totalSamples,
      centerVisible:assessment.centerVisible,candidateCount:assessment.candidateCount,obstacleMeshes:assessment.obstacleMeshes};
    this.transition={position:assessment.position,target:assessment.target,agentId:agent.id};this.following=true;
    if(agent.regionId){this.oceanObservationLayer='free';this.oceanFreeDepthM=null;}
  }
  focusSpecies(speciesId,options={}){
    if(this.isLivingShallows)return this.focusNearbyOceanAnimal(speciesId);
    if(this.oceanExploring)this.returnToReef();
    const started=performance.now();
    this.scene.updateMatrixWorld(true);
    let best=null,chosen=null,individualsConsidered=0;
    for(const agent of this.sim.agents){
      if(agent.speciesId!==speciesId||!agent.alive||!this.entities.get(agent.id)?.object.visible)continue;
      const assessment=this.assessFocus(agent,options);individualsConsidered++;
      if(!best||assessment.score<best.score){best=assessment;chosen=agent;}
    }
    if(chosen){
      this.select(chosen.id);this.onSelect(chosen.id);this.applyFocus(chosen,best);
      this.lastFocusAssessment.individualsConsidered=individualsConsidered;this.lastFocusAssessment.queryMs=performance.now()-started;this.emitSnapshot(true);
    }
  }
  focusAgent(id,options={}){
    const agent=this.findAgent(id);if(!agent?.alive)return;
    if(agent.speciesId==='blue-rockfish')options={minDistanceM:5.5,...options};
    if(!agent.regionId&&this.oceanExploring)this.returnToReef();
    if(agent.regionId){this.oceanExploring=true;this.oceanCruising=false;this.oceanTravel=null;}
    this.select(id);this.onSelect(id);
    if(this.isKelp&&agent.regionId){
      this.oceanAnimals.update(this.oceanEcology.agents,this.sim.metrics.timeSec,this.oceanRenderOrigin,this.camera.position);
      this.oceanChunks.setDetailedHosts?.(this.oceanAnimals.detailedHostIds);
    }
    this.scene.updateMatrixWorld(true);this.applyFocus(agent,this.assessFocus(agent,options));
    this.emitSnapshot();
  }
  focusNearbyOceanAnimal(speciesId=null,regionId=null){
    if(!this.oceanEcology)return false;
    const p=this.oceanWorldPosition();
    const agents=this.oceanEcology.agents;
    const schoolMembers=speciesId==='blue-rockfish'?agents.filter(agent=>agent.speciesId===speciesId&&agent.alive&&
      (!regionId||agent.regionId===regionId)&&agent.state==='schooling'):[];
    const nearest=nearestOceanAnimal(schoolMembers.length?schoolMembers:agents,p,{speciesId,regionId});
    if(!nearest)return false;
    this.focusAgent(nearest.id,{minDistanceM:Math.max(nearest.speciesId==='blue-rockfish'?5.5:nearest.habitat==='pelagic-water-column'?3.5:.7,nearest.sizeM*3.5)});return true;
  }
  focusKelpCommunity(stopId='community'){
    if(!this.isKelp||!this.oceanExploring||!this.oceanChunks||!this.oceanEcology||this.disposed||this.oceanEcologyResetting||
      !['community','forest','opening'].includes(stopId))return false;
    const position=this.oceanWorldPosition(),cellId=`${Math.floor(position.x/64)},${Math.floor(position.z/64)}`;
    let plan;
    try{
      const ecology=this.oceanEcology.snapshot(),resident=new Set(this.oceanChunks.stats.loadedChunks);
      const loadedChunkIds=ecology.regions.map(region=>region.id).filter(id=>resident.has(id));
      if(!loadedChunkIds.includes(cellId))return false;
      const alive=new Set(ecology.agents.filter(agent=>agent.alive).map(agent=>agent.id));
      const previous=this._kelpCommunityObservationPlan;
      plan=stopId!=='community'&&previous?.originCellId===cellId&&previous.sourceAgentIds.every(id=>alive.has(id))?
        previous:createKelpCommunityObservationPlan({generator:this.oceanChunks.generator,position,
          agents:ecology.agents,loadedChunkIds,regionId:cellId,surfaceY:this.surfaceY,
          visibilityM:this.oceanLocalWater?.visibilityM??14,aspect:this.camera.aspect,fovDeg:this.camera.fov});
    }catch{return false;}
    const stop=plan?.stops.find(value=>value.id===stopId);
    if(!stop)return false;
    // Ordinary, freely draggable habitat views. The same geographic cell keeps
    // its active owners; selecting a stop never moves or follows an organism.
    if(!this.restoreOceanObservation({position:stop.position,target:stop.target,layer:'free',
      freeDepthM:Math.max(0,this.surfaceY-stop.position.y),habitat:this.oceanChunks.generator.sample(stop.position.x,stop.position.z).habitat}))return false;
    this._kelpCommunityObservationPlan=plan;this._kelpCommunityStopId=stopId;
    this.emitSnapshot(true);return true;
  }
  setView(key,immediate=false){
    if(this.isLivingShallows){
      const index={wide:0,reef:0,coral:0,crevice:1,seagrass:2,slope:3}[key]??0;
      return this.enterLivingShallows(index);
    }
    const wasFar=this.oceanChunks&&this.oceanWorldPosition().length()>40;
    this.oceanExploring=false;this.oceanCruising=false;this.oceanTravel=null;
    this.oceanObservationLayer='bed';this.oceanFreeDepthM=null;
    if(this.oceanChunks)this.setOceanRenderOrigin(0,0);
    const p=this.presets[key]||this.presets.wide;this.following=false;this.followOffsetY=0;this.lastFocusAssessment=null;
    const position=new THREE.Vector3(...p.position),target=new THREE.Vector3(...p.target);
    if(immediate||wasFar){this.transition=null;this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();}else this.transition={position,target};
    this.oceanChunks?.update(this.oceanWorldPosition());
    this.requestOceanEcology();
  }
  oceanWorldPosition(){return this.camera.position.clone().add(new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z));}
  beginDirectorMotion({durationSec=12,kind='walk',layer=null,distanceM,playbackRate=1}={}){
    if(this.disposed||!this.camera||!this.controls)return false;
    if(!isDirectorPlaybackRate(playbackRate))return false;
    if(layer&&!['bed','midwater','surface','free'].includes(layer))return false;
    const origin=new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z),position=this.oceanWorldPosition();
    const target=this.controls.target.clone().add(origin),selected=this.findAgent(this.selectedId);
    const following=kind==='follow'&&selected?.alive;
    const focusTarget=following?this.focusTarget(selected).add(origin):target;
    const focusPosition=following&&this.transition?.position?this.transition.position.clone().add(origin):position.clone();
    if(following){
      // The normal species focus can be only centimetres from a shrimp. A
      // director chapter observes its real surrounding habitat, so approach
      // a wider framing smoothly instead of orbiting an invisible tiny arc.
      const offset=focusPosition.clone().sub(focusTarget);offset.y=0;
      if(offset.length()<3){
        if(offset.lengthSq()<1e-10){offset.copy(position).sub(focusTarget);offset.y=0;}
        if(offset.lengthSq()<1e-10){this.camera.getWorldDirection(offset);offset.y=0;offset.negate();}
        if(offset.lengthSq()<1e-10)offset.set(0,0,1);
        offset.normalize().multiplyScalar(3);
        focusPosition.x=focusTarget.x+offset.x;focusPosition.z=focusTarget.z+offset.z;
      }
      focusPosition.y=Math.max(focusPosition.y,focusTarget.y+1);
    }
    try{
      const shot=createDirectorCameraMotion({position,target,durationSec,kind:following?'follow':kind==='follow'?'orbit':kind,
        distanceM:distanceM??(!this.oceanExploring&&kind==='walk'?3:undefined),floorY:this.floorY(position.x,position.z),
        focusPosition,focusTarget,clearanceM:.25});
      // Validate the starting pose before acquiring the camera. This affects
      // observation only, with no environment, animal or clock mutation.
      sampleDirectorCameraMotion(shot,0,this.directorMotionQueries(layer));
      this.directorMotion={shot,active:true,complete:false,elapsedSec:0,travelledM:0,error:null,playbackRate,
        layer,agentId:following?selected.id:null,lastTrackingTarget:following?{x:focusTarget.x,y:focusTarget.y,z:focusTarget.z}:null,
        lastPosition:{x:position.x,y:position.y,z:position.z}};
      this.following=false;this.transition=null;this.oceanTravel=null;this.oceanCruising=false;this.keys.clear();
      if(layer){this.oceanObservationLayer=layer;this.oceanFreeDepthM=layer==='free'?Math.max(0,this.surfaceY-position.y):null;}
      this.emitSnapshot(true);return true;
    }catch(error){this.directorMotion={active:false,complete:true,elapsedSec:0,travelledM:0,error:error.message,shot:null};return false;}
  }
  directorMotionQueries(layer=null){
    return {floorHeight:(x,z)=>this.floorY(x,z),safeHeight:(x,z)=>this.habitatY(x,z),surfaceY:this.surfaceY,
      ceilingHeight:this.isDeep?(x,z)=>this.floorY(x,z)+8:null,
      layerHeight:layer?(x,z)=>this.oceanLayerY(x,z,layer):null};
  }
  setDirectorPlaybackRate(playbackRate){
    if(this.disposed||!this.directorMotion?.shot||!isDirectorPlaybackRate(playbackRate))return false;
    this.directorMotion.playbackRate=playbackRate;
    this.emitSnapshot(true);return true;
  }
  updateDirectorMotion(dt){
    const motion=this.directorMotion;if(!motion?.active)return;
    const elapsed=advanceDirectorCameraElapsed(motion.elapsedSec,motion.shot.durationSec,dt,
      {paused:this.paused,hidden:typeof document!=='undefined'&&document.visibilityState==='hidden',playbackRate:motion.playbackRate});
    if(elapsed===motion.elapsedSec)return;
    try{
      const agent=motion.agentId?this.findAgent(motion.agentId):null;
      const actualTarget=agent?.alive?this.focusTarget(agent).add(new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z)):null;
      if(actualTarget&&['x','y','z'].every(key=>Number.isFinite(actualTarget[key])))motion.lastTrackingTarget={x:actualTarget.x,y:actualTarget.y,z:actualTarget.z};
      // Death or regional unloading ends tracking of the real individual.
      // Keep the last observed absolute location for this finite shot rather
      // than suddenly aiming back at its original chapter-entry position.
      const trackingTarget=motion.lastTrackingTarget;
      const frame=sampleDirectorCameraMotion(motion.shot,elapsed,{...this.directorMotionQueries(motion.layer),trackingTarget});
      const position=new THREE.Vector3(frame.position.x-this.oceanRenderOrigin.x,frame.position.y,frame.position.z-this.oceanRenderOrigin.z);
      const target=new THREE.Vector3(frame.target.x-this.oceanRenderOrigin.x,frame.target.y,frame.target.z-this.oceanRenderOrigin.z);
      this.camera.position.copy(position);this.controls.target.copy(target);
      const damping=this.controls.enableDamping;this.controls.enableDamping=false;
      try{this.controls.update();this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();}
      finally{this.controls.enableDamping=damping;}
      this.enforceCameraClearance();
      const actual=this.oceanWorldPosition(),previous=motion.lastPosition;
      motion.travelledM+=Math.hypot(actual.x-previous.x,actual.y-previous.y,actual.z-previous.z);
      motion.lastPosition={x:actual.x,y:actual.y,z:actual.z};motion.elapsedSec=frame.elapsedSec;
      motion.complete=frame.complete;motion.active=!frame.complete;
    }catch(error){motion.active=false;motion.complete=true;motion.error=error.message;}
  }
  stopDirectorMotion(){this.directorMotion=null;}
  directorMotionSnapshot(){
    const motion=this.directorMotion,shot=motion?.shot;
    return {active:!!motion?.active,complete:!!motion?.complete,kind:shot?.kind??null,
      elapsedSec:motion?.elapsedSec??0,durationSec:shot?.durationSec??0,distanceM:shot?.distanceM??0,travelledM:motion?.travelledM??0,playbackRate:motion?.playbackRate??1,
      layer:motion?.layer??null,agentId:motion?.agentId??null,error:motion?.error??null,
      paused:!!this.paused,scope:'local-continuous-observation-shot',coordinateSpace:'absolute-world-metres',
      worldPosition:this.camera?{...this.oceanWorldPosition()}:null,
      worldTarget:this.controls?{x:this.controls.target.x+this.oceanRenderOrigin.x,y:this.controls.target.y,z:this.controls.target.z+this.oceanRenderOrigin.z}:null};
  }
  persistLivingWorld(){
    if(!this.livingWorldState||!this.sim)return;
    this.livingWorldState.save({version:1,timeSec:this.livingClockSec,environment:{...this.sim.environment}});
    this._livingStateSavedAt=this.elapsed;
  }
  enterLivingShallows(index=0){
    if(!this.isLivingShallows||!this.oceanChunks)return false;
    const stops=this.oceanChunks.generator.routeStops;
    const stop=stops?.[index]||stops?.[0];
    if(!stop)return false;
    const x=stop.x-7,z=stop.z+8;
    const y=Math.min(this.surfaceY-.6,this.habitatY(x,z)+2.8);
    return this.restoreOceanObservation({position:{x,y,z},target:{x:stop.x+7,
      y:Math.min(y-.8,this.habitatY(stop.x+7,stop.z)+1.2),z:stop.z},
      layer:'bed',freeDepthM:this.surfaceY-y,habitat:this.oceanChunks.generator.sample(x,z).habitat});
  }
  travelLivingShallows(index){
    if(!this.isLivingShallows||!Number.isInteger(index)||this.disposed)return false;
    const stop=this.oceanChunks.generator.routeStops?.[index];if(!stop)return false;
    const p=this.oceanWorldPosition(),dx=stop.x-p.x,dz=stop.z-p.z,length=Math.hypot(dx,dz);
    if(length<.1)return stop.id==='ridge-gully'&&this.orientLivingRidgePassage();
    this.oceanTravel={x:stop.x,z:stop.z,...(stop.id==='ridge-gully'?{ridgePassage:true}:{})};this.oceanCruising=false;this.following=false;this.transition=null;
    this.oceanObservationLayer='bed';this.oceanFreeDepthM=null;this.keys.clear();this.select(null);this.onSelect(null);
    this.controls.target.copy(this.camera.position).add(new THREE.Vector3(dx/length*10,-1.8,dz/length*10));
    this.controls.update();this.emitSnapshot();return true;
  }
  orientLivingRidgePassage(){
    const p=this.oceanWorldPosition();
    const plan=this.oceanChunks.generator.getRidgePlan?.(`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`);
    if(plan?.version!==1||!plan.corridor)return false;
    const heading=plan.corridor.heading;
    this.controls.target.copy(this.camera.position).add(new THREE.Vector3(Math.cos(heading)*18,-.7,-Math.sin(heading)*18));
    this.controls.update();this.emitSnapshot(true);return true;
  }
  livingDiscoveryCandidates(){
    if(!this.isLivingShallows||!this.oceanChunks)return [];
    return livingDiscoveryCandidates(this.oceanChunks.generator,this.oceanChunks.stats.loadedChunks,this.oceanWorldPosition());
  }
  updateLivingDiscoveries(){
    if(!this.livingDiscoveries||!this.oceanExploring||this.elapsed-(this._discoveryCheckedAt??-Infinity)<.4)return;
    this._discoveryCheckedAt=this.elapsed;
    this.livingDiscoveries.observe(this.livingDiscoveryCandidates(),this.oceanWorldPosition(),this.livingClockSec);
  }
  livingDiscoverySnapshot(){
    if(!this.livingDiscoveries)return null;
    return {recorded:this.livingDiscoveries.records.length,records:this.livingDiscoveries.records,limit:LIVING_DISCOVERY_LIMIT,status:this.livingDiscoveries.status,
      scope:'proximity marks of actual static props; no visual occlusion or drifting-object simulation',
      nearby:this.livingDiscoveryCandidates().slice(0,3).map(row=>({...row,recorded:this.livingDiscoveries.has(row.id)}))};
  }
  travelLivingDiscovery(id){
    if(!this.isLivingShallows||this.disposed||this.oceanEcologyResetting)return false;
    const row=this.livingDiscoveryCandidates().find(row=>row.id===id);if(!row)return false;
    const p=this.oceanWorldPosition(),dx=p.x-row.position.x,dz=p.z-row.position.z,length=Math.hypot(dx,dz)||1;
    this.oceanTravel={x:row.position.x+dx/length*3,z:row.position.z+dz/length*3,discoveryId:row.id};
    this.oceanCruising=false;this.following=false;this.transition=null;this.keys.clear();
    this.oceanObservationLayer='bed';this.oceanFreeDepthM=null;this.select(null);this.onSelect(null);
    this.controls.target.set(row.position.x-this.oceanRenderOrigin.x,row.position.y+.12,row.position.z-this.oceanRenderOrigin.z);
    this.controls.update();this.emitSnapshot();return true;
  }
  captureOceanObservation(){
    if(!this.oceanChunks||!this.oceanExploring||this.disposed)return null;
    try{
      const position=this.oceanWorldPosition();
      const target=this.controls.target.clone().add(new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z));
      return normalizeOceanObservationView({position:{x:position.x,y:position.y,z:position.z},
        target:{x:target.x,y:target.y,z:target.z},layer:this.oceanObservationLayer||'bed',
        freeDepthM:Math.max(0,this.surfaceY-position.y),habitat:this.oceanChunks.generator.sample(position.x,position.z).habitat});
    }catch{return null;}
  }
  restoreOceanObservation(value){
    if(!this.oceanChunks||this.disposed||this.oceanEcologyResetting)return false;
    let view,position,target;
    try{
      view=normalizeOceanObservationView(value);if(!view)return false;
      const original=new THREE.Vector3(view.position.x,view.position.y,view.position.z);
      position=original.clone();position.y=this.oceanLayerY(position.x,position.z,'free',view.freeDepthM);
      // The existing rock guard accepts render-local coordinates. Resolve it
      // before changing origins or any active observation state.
      position.x-=this.oceanRenderOrigin.x;position.z-=this.oceanRenderOrigin.z;
      this.clearCameraPosition(position);
      position.x+=this.oceanRenderOrigin.x;position.z+=this.oceanRenderOrigin.z;
      if(![position.x,position.y,position.z].every(Number.isFinite)||position.y>this.surfaceY-.5+1e-8)return false;
      target=new THREE.Vector3(view.target.x,view.target.y,view.target.z).add(position.clone().sub(original));
      // Retain every valid saved view; malformed angles/distances must not
      // move the restored camera when OrbitControls first updates.
      const offset=position.clone().sub(target),spherical=new THREE.Spherical().setFromVector3(offset);
      spherical.phi=clamp(spherical.phi,this.controls.minPolarAngle??0,this.controls.maxPolarAngle??Math.PI);
      spherical.radius=clamp(spherical.radius,this.controls.minDistance??.18,this.controls.maxDistance??30);
      target.copy(position).sub(offset.setFromSpherical(spherical));
      if(![target.x,target.y,target.z].every(Number.isFinite))return false;
    }catch{return false;}
    this.oceanExploring=true;this.oceanTravel=null;this.oceanCruising=false;this.following=false;this.transition=null;
    this.followOffsetY=0;this.lastFocusAssessment=null;this.keys.clear();this.selectedId=null;this.highlight.visible=false;
    this.oceanAnimals?.setObservationAgent?.(null);
    this.setOceanRenderOrigin(Math.round(position.x/64)*64,Math.round(position.z/64)*64);
    const localPosition=position.clone().sub(new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z));
    const localTarget=target.clone().sub(new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z));
    this.camera.position.copy(localPosition);this.controls.target.copy(localTarget);
    // Flush residual orbit/pan damping, then apply the already-clamped view
    // again so a return cannot continue a previous drag on later frames.
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;
    try{this.controls.update();this.camera.position.copy(localPosition);this.controls.target.copy(localTarget);this.controls.update();}
    finally{this.controls.enableDamping=damping;}
    this.enforceCameraClearance();
    this.oceanObservationLayer=view.layer;
    this.oceanFreeDepthM=view.layer==='free'?Math.max(0,this.surfaceY-this.camera.position.y):null;
    const actualPosition=this.oceanWorldPosition();
    this.oceanChunks.update(actualPosition);this.requestOceanEcology(actualPosition);
    this.onSelect(null);this.emitSnapshot(true);return true;
  }
  oceanLayerY(x,z,layer=this.oceanObservationLayer||'bed',freeDepthM=this.oceanFreeDepthM??Math.max(0,this.surfaceY-this.camera.position.y)){
    if(this.isDeep)return deepOceanLayerHeight(layer,{surfaceY:this.surfaceY,floorY:this.floorY(x,z),safeY:this.habitatY(x,z),freeDepthM});
    return oceanLayerHeight(layer,{surfaceY:this.surfaceY,floorY:this.floorY(x,z),safeY:this.habitatY(x,z),freeDepthM});
  }
  beginOceanManualObservation(){
    if(!this.oceanExploring)return;
    this.oceanObservationLayer='free';this.oceanFreeDepthM=null;
    this.oceanTravel=null;this.oceanCruising=false;
  }
  captureOceanFreeDepth(){
    if(this.oceanExploring&&this.oceanObservationLayer==='free'&&this.oceanFreeDepthM==null)
      this.oceanFreeDepthM=Math.max(0,this.surfaceY-this.camera.position.y);
  }
  setOceanObservationLayer(layer){
    if(!this.oceanChunks||!this.oceanExploring||!['bed','midwater','surface','free'].includes(layer))return false;
    const p=this.oceanWorldPosition();if(![p.x,p.y,p.z,this.surfaceY].every(Number.isFinite))return false;
    let y;try{y=this.oceanLayerY(p.x,p.z,layer,Math.max(0,this.surfaceY-p.y));}catch{return false;}
    if(!Number.isFinite(y))return false;
    const direction=this.camera.getWorldDirection(new THREE.Vector3());direction.y=0;
    if(direction.lengthSq()<.01)direction.set(0,0,-1);direction.normalize();
    this.oceanObservationLayer=layer;this.oceanFreeDepthM=layer==='free'?Math.max(0,this.surfaceY-y):null;
    this.oceanTravel=null;this.oceanCruising=false;this.following=false;this.transition=null;this.lastFocusAssessment=null;
    this.keys.clear();this.select(null);this.onSelect(null);
    // Presets change observation height directly at the existing X/Z. This is
    // a safe viewing placement, not a simulated ascent through reef solids.
    this.camera.position.y=y;
    this.controls.target.copy(this.camera.position).addScaledVector(direction,8);
    this.controls.target.y+=layer==='surface'?.8:layer==='midwater'?-.5:-2.4;
    this.controls.update();this.emitSnapshot(true);return true;
  }
  focusOceanScene(){
    if(!this.oceanExploring||this.isKelp||this.isDeep||this.oceanEcologyResetting||this.disposed)return false;
    const p=this.oceanWorldPosition(),regionId=`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;
    const solids=[];this.scene.updateMatrixWorld(true);
    this.oceanChunks.root.traverse(object=>{if(object.isMesh&&
      (['rock','formation','rock-base'].includes(object.userData.landscapeKind)||object.name==='sampled-seabed'))solids.push(object);});
    const ray=new THREE.Raycaster();ray.firstHitOnly=true;
    const candidateClear=(position,target,references)=>{
      const origin=new THREE.Vector3(position.x-this.oceanRenderOrigin.x,position.y,position.z-this.oceanRenderOrigin.z);
      const clear=point=>{
        const delta=new THREE.Vector3(point.x-this.oceanRenderOrigin.x,point.y,point.z-this.oceanRenderOrigin.z).sub(origin),length=delta.length();
        ray.set(origin,delta.multiplyScalar(1/length));ray.near=.01;ray.far=Math.max(.01,length-.02);
        return ray.intersectObjects(solids,false).length===0;
      };
      return clear(target)&&references.every(reference=>clear(reference.point));
    };
    const view=createOceanSceneObservation({elements:this.oceanEcology?.sceneElements??[],agents:this.oceanEcology?.agents??[],
      generator:this.oceanChunks.generator,regionId,surfaceY:this.surfaceY,fov:this.camera.fov,aspect:this.camera.aspect,
      safeHeight:(x,z)=>this.habitatY(x,z),candidateClear});
    if(!view||!this.restoreOceanObservation({position:view.position,target:view.target,layer:'free',
      freeDepthM:this.surfaceY-view.position.y,habitat:this.oceanChunks.generator.sample(view.position.x,view.position.z).habitat}))return false;
    this.oceanSceneObservation={...view,regionId};this.emitSnapshot(true);return true;
  }
  focusOceanHabitat(){
    if(!this.oceanExploring||this.isKelp||this.isDeep||this.oceanEcologyResetting||this.disposed)return false;
    if(this.focusOceanLivingLandscape())return true;
    if(this.focusOceanMacroLandscape())return true;
    const p=this.oceanWorldPosition(),cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),regionId=`${cx},${cz}`;
    const elements=(this.oceanEcology?.habitatSceneElements??[]).filter(e=>e.regionId===regionId);
    if(!elements.length)return false;
    const animals=(this.oceanEcology?.agents??[]).filter(a=>a.alive&&a.regionId===regionId&&a.position);
    const nearby=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
    // Find a real local group, then try eight ordinary viewpoints. Selection
    // changes only the camera; neither animals nor saved plants are relocated.
    let anchor=elements.reduce((best,e)=>{
      const score=elements.filter(other=>nearby(e,other,9)).length+
        animals.filter(a=>nearby(e,a.position,10)).length*2;
      return !best||score>best.score?{element:e,score}:best;
    },null).element;
    const schools=new Map();
    for(const animal of animals)if(animal.groupId&&animal.sizeM>=.16){
      if(!schools.has(animal.groupId))schools.set(animal.groupId,[]);schools.get(animal.groupId).push(animal);
    }
    let school=null;
    for(const members of schools.values()){
      if(members.length<3)continue;
      const center=members.reduce((v,a)=>v.add(new THREE.Vector3(a.position.x,a.position.y,a.position.z)),new THREE.Vector3()).multiplyScalar(1/members.length);
      const nearbyPlants=elements.filter(e=>nearby(center,e,13)).length;
      // A bed-edge school fits the same view as vegetation. Surface visitors
      // remain in their own water layer rather than dragging this view upward.
      if(!nearbyPlants||center.y-this.floorY(center.x,center.z)>7)continue;
      const score=members.length*4+Math.min(nearbyPlants,10);
      if(!school||score>school.score)school={center,score};
    }
    if(school)anchor=school.center;
    const cluster=elements.filter(e=>nearby(anchor,e,school?13:9));
    const target=new THREE.Vector3();
    cluster.forEach(e=>target.add(new THREE.Vector3(e.x,e.y+e.scale.y*.5,e.z)));target.multiplyScalar(1/cluster.length);
    if(school){target.x=school.center.x;target.z=school.center.z;target.y=school.center.y-.8;}
    const solids=[];this.scene.updateMatrixWorld(true);
    this.oceanChunks.root.traverse(o=>{if(o.isMesh&&
      (['rock','formation','rock-base'].includes(o.userData.landscapeKind)||o.name==='sampled-seabed'))solids.push(o);});
    this.oceanMacroLandscape?.root.traverse(o=>{if(o.isMesh&&o.userData.landscapeKind==='reef-mass')solids.push(o);});
    const ray=new THREE.Raycaster();ray.firstHitOnly=true;
    const originOffset=new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z);
    const visible=(camera,frustum,point,radius)=>{
      if(!frustum.planes.every(plane=>plane.distanceToPoint(point)>=radius))return false;
      const delta=point.clone().sub(camera.position),distance=delta.length();
      if(distance<.03)return false;
      ray.set(camera.position.clone().sub(originOffset),delta.multiplyScalar(1/distance));
      ray.near=.01;ray.far=distance-.02;return ray.intersectObjects(solids,false).length===0;
    };
    let best=null;
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,position=new THREE.Vector3(
        clamp(target.x+Math.cos(angle)*(school?10.5:14),cx*64+1,(cx+1)*64-1),0,
        clamp(target.z+Math.sin(angle)*(school?10.5:14),cz*64+1,(cz+1)*64-1));
      // Clamping at a loaded-owner edge must not turn a wide view into a
      // near-vertical close-up directly over the target.
      if(school&&Math.hypot(position.x-target.x,position.z-target.z)<8)continue;
      position.y=Math.min(this.surfaceY-.8,Math.max(target.y+(school?1.4:4),this.habitatY(position.x,position.z)+1.3));
      const camera=new THREE.PerspectiveCamera(this.camera.fov,this.camera.aspect,.05,60);
      camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld(true);
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const plants=cluster.filter(e=>visible(camera,frustum,new THREE.Vector3(e.x,e.y+e.scale.y*.5,e.z),Math.hypot(Math.max(e.scale.x,e.scale.z),e.scale.y)*.5));
      const life=animals.filter(a=>nearby(anchor,a.position,12)&&visible(camera,frustum,
        new THREE.Vector3(a.position.x,a.position.y,a.position.z),Math.max(.15,(a.sizeM??1)*.6)));
      const score=Math.min(plants.length,10)+life.length*4;
      if((school?life.length>=2:plants.length>0)&&(!best||score>best.score))best={position,target,score,elementIds:plants.map(e=>e.id),animalIds:life.map(a=>a.id)};
    }
    if(!best||!this.restoreOceanObservation({position:best.position,target:best.target,layer:'free',
      freeDepthM:this.surfaceY-best.position.y,habitat:this.oceanChunks.generator.sample(best.position.x,best.position.z).habitat}))return false;
    this.oceanHabitatObservation={regionId,elementIds:best.elementIds,animalIds:best.animalIds};
    this.emitSnapshot(true);return true;
  }
  focusOceanLivingLandscape(){
    const p=this.oceanWorldPosition(),cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),regionId=`${cx},${cz}`;
    const solids=[];this.scene.updateMatrixWorld(true);
    for(const root of [this.oceanChunks?.root,this.oceanMacroLandscape?.root,this.oceanSceneElements?.root])root?.traverse(o=>{
      if(o.isMesh&&(['rock','formation','rock-base','reef-mass','stone','driftwood','bottle'].includes(o.userData.landscapeKind)||o.name==='sampled-seabed'))solids.push(o);
    });
    const ray=new THREE.Raycaster();ray.firstHitOnly=true;
    const offset=new THREE.Vector3(this.oceanRenderOrigin.x,0,this.oceanRenderOrigin.z);
    const visible=(position,point)=>{
      const from=new THREE.Vector3(position.x,position.y,position.z).sub(offset),delta=new THREE.Vector3(point.x,point.y,point.z).sub(offset).sub(from),distance=delta.length();
      if(distance<.03)return false;
      ray.set(from,delta.multiplyScalar(1/distance));ray.near=.01;ray.far=distance-.02;
      return ray.intersectObjects(solids,false).length===0;
    };
    const native=this.oceanChunks.generator.chunk(cx,cz).elements.map(e=>({...e,regionId}));
    const view=createOceanLivingLandscapeObservation({agents:this.oceanEcology?.agents??[],
      elements:[...native,...(this.oceanEcology?.habitatSceneElements??[]),...(this.oceanEcology?.macroLandscapeElements??[])],
      regionId,generator:this.oceanChunks.generator,currentPosition:p,safeHeight:(x,z)=>this.habitatY(x,z),visible,
      surfaceY:this.surfaceY,fov:this.camera.fov,aspect:this.camera.aspect,viewportHeight:this.renderer.domElement.clientHeight||720});
    if(!view||!this.restoreOceanObservation({position:view.position,target:view.target,layer:'free',
      freeDepthM:this.surfaceY-view.position.y,habitat:this.oceanChunks.generator.sample(view.position.x,view.position.z).habitat}))return false;
    this.oceanHabitatObservation={regionId,elementIds:view.elementIds,animalIds:view.animalIds,evidence:view.evidence};
    this.emitSnapshot(true);return true;
  }
  focusOceanMacroLandscape(){
    const p=this.oceanWorldPosition(),cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),regionId=`${cx},${cz}`;
    const elements=(this.oceanEcology?.macroLandscapeElements??[]).filter(e=>e.regionId===regionId);
    const masses=elements.filter(e=>e.kind==='reef-mass');
    if(!masses.length)return false;
    const animals=(this.oceanEcology?.agents??[]).filter(a=>a.alive&&a.regionId===regionId&&a.position);
    const anchor=masses.reduce((best,e)=>{
      const score=e.scale.x*e.scale.z+animals.filter(a=>Math.hypot(a.position.x-e.x,a.position.z-e.z)<18).length*15;
      return !best||score>best.score?{element:e,score}:best;
    },null).element;
    const target=new THREE.Vector3(anchor.x,anchor.y+anchor.scale.y*.45,anchor.z);
    let best=null;
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,position=new THREE.Vector3(
        clamp(target.x+Math.cos(angle)*23,cx*64+1,(cx+1)*64-1),0,
        clamp(target.z+Math.sin(angle)*23,cz*64+1,(cz+1)*64-1));
      if(Math.hypot(position.x-target.x,position.z-target.z)<18)continue;
      position.y=Math.min(this.surfaceY-.8,Math.max(target.y+2.8,this.habitatY(position.x,position.z)+2));
      const camera=new THREE.PerspectiveCamera(this.camera.fov,this.camera.aspect,.05,80);
      camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld(true);
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const inView=point=>frustum.containsPoint(new THREE.Vector3(point.x,point.y,point.z));
      const foreground=this.habitatY(position.x,position.z)-this.floorY(position.x,position.z);
      const score=elements.filter(e=>inView({x:e.x,y:e.y+e.scale.y*.6,z:e.z})).length+
        animals.filter(a=>inView(a.position)).length*12-foreground*10;
      if(!best||score>best.score)best={position,target,score};
    }
    return !!best&&this.restoreOceanObservation({position:best.position,target:best.target,layer:'free',
      freeDepthM:this.surfaceY-best.position.y,habitat:this.oceanChunks.generator.sample(best.position.x,best.position.z).habitat});
  }
  setOceanOverview(){
    if(!this.oceanChunks||!this.oceanExploring||this.disposed)return false;
    const p=this.oceanWorldPosition(),direction=this.camera.getWorldDirection(new THREE.Vector3());
    const ridge=this.isLivingShallows&&this.oceanChunks.generator.getRidgePlan?.(`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`);
    const corridor=ridge?.version===1?ridge.corridor:null;
    if(corridor||ridge?.overview){
      // A macro overview of the actual committed landform, using one ordinary
      // viewpoint. It changes the observation, never the terrain or animals.
      const c=corridor||ridge.overview,distance=corridor?32:18;
      const position={x:c.center.x-Math.cos(c.heading)*distance,y:0,z:c.center.z+Math.sin(c.heading)*distance};
      position.y=Math.min(this.surfaceY-.8,Math.max(this.habitatY(position.x,position.z)+.8,this.floorY(position.x,position.z)+(corridor?10:7)));
      return this.restoreOceanObservation({position,target:{x:c.center.x,y:this.floorY(c.center.x,c.center.z)+2.5,z:c.center.z},
        layer:'free',freeDepthM:this.surfaceY-position.y,habitat:this.oceanChunks.generator.sample(position.x,position.z).habitat});
    }
    const view=oceanOverviewObservation(p,direction,{biome:this.biomeId,surfaceY:this.surfaceY,
      floorHeight:(x,z)=>this.floorY(x,z),safeHeight:(x,z)=>this.habitatY(x,z)});
    if(!view)return false;
    this.oceanTravel=null;this.oceanCruising=false;this.following=false;this.transition=null;
    this.followOffsetY=0;this.lastFocusAssessment=null;this.keys.clear();this.select(null);this.onSelect(null);
    const position=new THREE.Vector3(view.position.x-this.oceanRenderOrigin.x,view.position.y,view.position.z-this.oceanRenderOrigin.z);
    const target=new THREE.Vector3(view.target.x-this.oceanRenderOrigin.x,view.target.y,view.target.z-this.oceanRenderOrigin.z);
    // Settle the old orbit damping before installing this geographic view.
    // The overview remains an ordinary free observation and can be saved.
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;
    try{this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();
      this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();}
    finally{this.controls.enableDamping=damping;}
    this.enforceCameraClearance();this.oceanObservationLayer='free';
    this.oceanFreeDepthM=Math.max(0,this.surfaceY-this.camera.position.y);
    this.emitSnapshot(true);return true;
  }
  setOceanRenderOrigin(x,z){
    const dx=x-this.oceanRenderOrigin.x,dz=z-this.oceanRenderOrigin.z;
    if(!dx&&!dz)return;
    this.camera.position.x-=dx;this.camera.position.z-=dz;
    this.controls.target.x-=dx;this.controls.target.z-=dz;
    if(this.highlight){this.highlight.position.x-=dx;this.highlight.position.z-=dz;}
    if(this.transition){this.transition.position.x-=dx;this.transition.position.z-=dz;this.transition.target.x-=dx;this.transition.target.z-=dz;}
    this.oceanRenderOrigin={x,z};this.reefRoot?.position.set(-x,0,-z);
    this.oceanChunks?.setRenderOrigin({x,z});
    this.oceanAnimals?.setRenderOrigin({x,z});
    this.oceanKelpDriftFood?.setRenderOrigin({x,z});
    this.oceanKelpUnderstory?.setRenderOrigin({x,z});
    this.oceanSceneElements?.setRenderOrigin({x,z});
    this.oceanHabitatScenes?.setRenderOrigin({x,z});
    this.oceanMacroLandscape?.setRenderOrigin({x,z});
  }
  startOceanExploration(){
    if(!this.oceanChunks)return;
    this.oceanExploring=true;this.oceanCruising=false;this.oceanTravel=null;
    this.following=false;this.transition=null;this.select(null);this.onSelect(null);
    const p=this.oceanWorldPosition();
    const layer=this.oceanObservationLayer||'bed';
    this.camera.position.y=this.isDeep?this.oceanLayerY(p.x,p.z,layer):layer==='bed'?Math.max(this.camera.position.y,this.habitatY(p.x,p.z)+2.4):this.oceanLayerY(p.x,p.z,layer);
    const direction=this.camera.getWorldDirection(new THREE.Vector3());direction.y=0;
    if(direction.lengthSq()<.01)direction.set(0,0,-1);direction.normalize();
    this.controls.target.copy(this.camera.position).addScaledVector(direction,8);this.controls.target.y+=layer==='surface'?.8:layer==='midwater'?-.5:-2.4;
    this.controls.update();this.emitSnapshot(true);
  }
  travelOcean(dx,dz){
    if(!this.oceanChunks||!Number.isInteger(dx)||!Number.isInteger(dz)||Math.abs(dx)>1||Math.abs(dz)>1||(!dx&&!dz))return;
    if(!this.oceanExploring)this.startOceanExploration();
    this.select(null);this.onSelect(null);
    this.captureOceanFreeDepth();
    const p=this.oceanWorldPosition();
    this.oceanTravel={x:p.x+dx*64,z:p.z+dz*64};this.oceanCruising=false;this.following=false;this.transition=null;
    this.controls.target.copy(this.camera.position).addScaledVector(new THREE.Vector3(dx,0,dz).normalize(),8);this.controls.target.y+=(this.oceanObservationLayer==='surface'?.8:this.oceanObservationLayer==='midwater'?-.5:-2.4);this.controls.update();
    this.emitSnapshot(true);
  }
  toggleOceanCruise(){
    if(!this.oceanChunks)return;
    if(!this.oceanExploring)this.startOceanExploration();
    this.captureOceanFreeDepth();
    this.oceanTravel=null;this.oceanCruising=!this.oceanCruising;
    if(this.oceanCruising){this.following=false;this.transition=null;}
    this.emitSnapshot(true);
  }
  focusNearbyOceanFormation(){
    if(!this.oceanChunks||!this.oceanExploring)return false;
    const generator=this.oceanChunks.generator;
    const elements=(this.oceanChunks.stats.loadedChunks||[]).flatMap(id=>{
      const [cx,cz]=id.split(',').map(Number);
      return generator.chunk(cx,cz).elements.filter(element=>element.kind==='formation');
    });
    const view=oceanFormationObservation(elements,this.oceanWorldPosition(),{
      floorHeight:(x,z)=>generator.sample(x,z).floorY,safeHeight:(x,z)=>generator.heightForCamera(x,z)});
    if(!view)return false;
    this.oceanTravel=null;this.oceanCruising=false;this.following=false;this.transition=null;
    this.keys.clear();this.select(null);this.onSelect(null);
    this.camera.position.set(view.position.x-this.oceanRenderOrigin.x,view.position.y,view.position.z-this.oceanRenderOrigin.z);
    this.oceanObservationLayer='free';this.oceanFreeDepthM=Number.isFinite(this.surfaceY)?Math.max(0,this.surfaceY-view.position.y):null;
    this.controls.target.set(view.target.x-this.oceanRenderOrigin.x,view.target.y,view.target.z-this.oceanRenderOrigin.z);
    this.controls.update();this.oceanChunks.update(view.position);
    this.requestOceanEcology(this.oceanWorldPosition());this.emitSnapshot(true);
    return true;
  }
  stopOceanTravel(){this.oceanTravel=null;this.oceanCruising=false;this.emitSnapshot(true);}
  returnToReef(){this.setView('wide',true);this.select(null);this.onSelect(null);this.emitSnapshot(true);}
  oceanSnapshot(){
    if(!this.oceanChunks)return null;
    const position=this.oceanWorldPosition(),sample=this.oceanChunks.generator.sample(position.x,position.z);
    const cx=Math.floor(position.x/64),cz=Math.floor(position.z/64),nearby=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const habitat=dx===0&&dz===0?sample.habitat:this.oceanChunks.generator.sample((cx+dx+.5)*64,(cz+dz+.5)*64).habitat;
      const cell=this.oceanChunks.generator.chunk(cx+dx,cz+dz);
      nearby.push({dx,dz,habitat,composition:cell.habitatComposition,current:dx===0&&dz===0});
    }
    const ecology=this.oceanEcology?.snapshot();
    const community=oceanCommunityReading({agents:ecology?.agents||[],regionId:`${cx},${cz}`,cameraPosition:position,
      catalog:this.catalog,loaded:!this.oceanEcologyResetting&&!!ecology?.regions.some(region=>region.id===`${cx},${cz}`)});
    const chunk=this.oceanChunks.generator.chunk(cx,cz);
    const localHabitat={scope:'current-map-cell',chunkId:`${cx},${cz}`,
      cover:{...chunk.counts},landform:chunk.landform,formations:chunk.formationSummary,composition:chunk.habitatComposition,...community};
    const localRegion=ecology?.regions.find(region=>region.id===`${cx},${cz}`);
    if(localRegion?.habitatSceneVersion===1){
      localHabitat.sceneTheme=localRegion.habitatSceneTheme;
      localHabitat.habitatScenes={counts:localRegion.habitatSceneElements.reduce((counts,element)=>{
        counts[element.kind]=(counts[element.kind]||0)+1;return counts;},{}),elementIds:localRegion.habitatSceneElements.map(element=>element.id)};
      for(const cell of nearby)cell.sceneTheme=ecology.regions.find(region=>region.id===`${cx+cell.dx},${cz+cell.dz}`)?.habitatSceneTheme;
    }
    if(localRegion?.understorySceneryVersion===1)localHabitat.cover.understory=localRegion.understoryPlants.length;
    if(localRegion?.sceneElementsVersion===1)localHabitat.sceneElements={
      counts:localRegion.sceneElements.reduce((counts,element)=>{counts[element.kind]=(counts[element.kind]||0)+1;return counts;},{}),
      elementIds:localRegion.sceneElements.map(element=>element.id)};
    const communityPlan=this.isKelp&&this.oceanExploring&&this._kelpCommunityObservationPlan?.originCellId===`${cx},${cz}`?
      this._kelpCommunityObservationPlan:null;
    const communityStop=communityPlan?.stops.find(stop=>stop.id===this._kelpCommunityStopId);
    const onCommunityStop=communityStop&&Math.hypot(position.x-communityStop.position.x,position.y-communityStop.position.y,
      position.z-communityStop.position.z)<.5;
    const sceneObservation=this.oceanSceneObservation,sceneTarget=sceneObservation?.target;
    const onSceneObservation=sceneObservation?.regionId===`${cx},${cz}`&&
      Math.hypot(position.x-sceneObservation.position.x,position.y-sceneObservation.position.y,position.z-sceneObservation.position.z)<.05&&
      Math.hypot(this.controls.target.x+this.oceanRenderOrigin.x-sceneTarget.x,this.controls.target.y-sceneTarget.y,
        this.controls.target.z+this.oceanRenderOrigin.z-sceneTarget.z)<.05;
    return {exploring:this.oceanExploring,cruising:this.oceanCruising,travelling:!!this.oceanTravel,observationLayer:this.oceanObservationLayer||'bed',
      ...(this.isLivingShallows?{profile:LIVING_SHALLOWS_PROFILE,routeStops:this.oceanChunks.generator.routeStops,
        distanceFromEntryM:Math.hypot(position.x-this.oceanChunks.generator.routeStops[0].x,position.z-this.oceanChunks.generator.routeStops[0].z),
        forcingPersistence:this.livingWorldState.status,discoveries:this.livingDiscoverySnapshot()}:{}),
      worldPosition:position.toArray(),renderOrigin:{...this.oceanRenderOrigin},habitat:sample.habitat,
      distanceFromReefM:Math.hypot(position.x,position.z),chunkId:`${cx},${cz}`,nearby,
      streaming:{...this.oceanChunks.stats},generatorCache:this.oceanChunks.generator.cacheStats(),localEcologyOnly:false,
      ecology,localHabitat,animalRendering:this.oceanAnimals?.stats,
      ...(communityPlan?{communityObservation:{scope:'observation-only',id:communityPlan.id,originCellId:communityPlan.originCellId,
        sourceAgentIds:[...communityPlan.sourceAgentIds],sourceRootIds:[...communityPlan.sourceRootIds],
        activeStopId:onCommunityStop?this._kelpCommunityStopId:null,
        stops:communityPlan.stops.map(stop=>({id:stop.id,label:stop.label,position:{...stop.position},target:{...stop.target},
          displayEvidence:stop.displayEvidence}))}}:{}),
      ...(this.oceanKelpDriftFood?{driftFoodRendering:this.oceanKelpDriftFood.stats}:{}),
      ...(this.oceanKelpUnderstory?{understoryRendering:this.oceanKelpUnderstory.stats}:{}),
      ...(this.oceanSceneElements?{sceneElementsRendering:this.oceanSceneElements.stats}:{}),
      ...(this.oceanHabitatScenes?{habitatScenesRendering:this.oceanHabitatScenes.stats}:{}),
      ...(this.oceanMacroLandscape?{macroLandscapeRendering:this.oceanMacroLandscape.stats}:{}),
      ...(onSceneObservation?{sceneObservation:{...sceneObservation,scope:'ordinary-whole-scene-observation'}}:{}),
      localWater:this.oceanLocalWater?{...this.oceanLocalWater,currentVector:{...this.oceanLocalWater.currentVector},scope:'observer-world-position',depthM:Math.max(0,this.surfaceY-position.y)}:null,
      waterParticles:this.oceanWaterParticles?.stats};
  }
  updateOceanWater(dt){
    if(!this.oceanWaterField)return;
    // Query after camera motion and floating-origin rebasing. Only logical
    // coordinates determine water conditions; the observer never drives ecology.
    const position=this.oceanWorldPosition(),env=this.sim.environment;
    const depthM=Math.max(0,this.surfaceY-position.y);
    const water=this.oceanWaterField.sample(position.x,position.z,env,depthM);
    this.oceanLocalWater=water;
    const blend=water.authoredBlend,daylight=clamp(Math.sin((env.hour-6)/12*Math.PI),0,1);
    const transmission=Math.exp(-depthM*water.attenuationPerM);
    const palette=this.oceanWaterPalette;
    palette.day.copy(palette.clear).lerp(palette.green,water.waterTint);
    palette.tone.copy(palette.night).lerp(palette.day,daylight).multiplyScalar(.7+.3*transmission);
    this.scene.background.lerp(palette.tone,blend);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density=this.isKelp?.046+water.turbidity*.075:.022+water.turbidity*.035;
    // Display exposure is deliberately milder than the model light proxy so
    // nearby animals remain observable; these are not measured radiances.
    this.sun.intensity*=THREE.MathUtils.lerp(1,Math.max(this.isKelp?.18:.32,transmission),blend);
    this.ambient.intensity*=THREE.MathUtils.lerp(1,Math.max(this.isKelp?.45:.72,Math.sqrt(transmission)),blend);
    this.waterColors.horizon.value.copy(this.scene.fog.color);this.waterColors.bottom.value.copy(this.scene.fog.color).multiplyScalar(this.isKelp?1:.60);
    palette.top.copy(palette.topClear).lerp(palette.topGreen,water.waterTint);
    palette.tone.copy(this.waterNightColor).lerp(palette.top,daylight);
    this.waterColors.top.value.lerp(palette.tone,blend);
    this.particleUniforms.opacity.value*=1-blend;
    this.oceanWaterParticles.root.visible=blend>0;
    this.oceanWaterParticles.update({cameraPosition:position,renderOrigin:this.oceanRenderOrigin,dtSec:dt,paused:this.paused,
      currentVector:water.currentVector,turbidity:water.turbidity,lightAtDepth:water.lightAtDepth,
      floorY:this.oceanChunks.generator.sample(position.x,position.z).floorY,blend});
    this.oceanChunks.setEnvironment(this.isLivingShallows?env:water,this.isLivingShallows?this.livingClockSec:this.visualTimeSec);
    this.oceanSceneElements?.setEnvironment(water,this.visualTimeSec);
    this.visualEnvironment.localWater='continuous coordinate field; depth attenuation and advection are qualitative proxies';
  }
  updateDeepOceanWater(){
    const env=this.sim.environment;
    this.oceanLocalWater={currentMps:env.currentMps,currentVector:{x:env.currentMps,y:0,z:0},turbidity:env.turbidity,
      visibilityM:this.sim.metrics.visibilityM,observerLight:env.observerLight,lightAtDepth:0,naturalSunlight:false,localPhotosynthesis:false};
    // This fixed display volume follows the observer; phase and drift remain
    // paused with the original deep simulation and encode no resource amount.
    this.deepParticles.position.set(this.camera.position.x,this.camera.position.y-2,this.camera.position.z);
    this.oceanChunks.setEnvironment(this.oceanLocalWater,this.sim.timeSec);
    this.visualEnvironment.localWater='near-bed observer light only; zero solar/primary-production input; display snow is not food';
    this.visualEnvironment.particleVolume='camera-local bounded 180 display points';
  }
  setEnvironment(patch){this.sim.setEnvironment(patch);this.oceanEcology?.setEnvironment(this.sim.environment);if(this.isLivingShallows)this.persistLivingWorld();this.emitSnapshot(true);}
  async setPaused(paused){
    this.paused=!!paused;
    if(this.isLivingShallows)this.persistLivingWorld();
    try{
      // A pagehide transaction can be interrupted by document teardown. Freeze
      // immediately and acknowledge the pause after its latest atomic save.
      if(this.paused&&this.oceanEcology&&!this.oceanEcologyResetting){
        const saved=await this.oceanEcology.checkpoint();
        if(saved===false)throw new Error('暂停已生效，但最新状态保存失败；请保留当前页面并重试。');
      }
    }finally{if(!this.disposed)this.emitSnapshot(true);}
    return this.paused;
  }
  reset(seed=42){
    this.inputSeed=seed===''?42:seed;
    if(this.isLivingShallows){seed=livingShallowsSeed(this.inputSeed);this.livingWorldState=createLivingWorldState(seed);this.livingDiscoveries=createLivingDiscoveries(seed);this.livingClockSec=0;}
    this.sim.reset(seed===''?42:seed);this.selectedId=null;this.following=false;this.transition=null;this.followOffsetY=0;this.lastFocusAssessment=null;this.highlight.visible=false;this.visualTimeSec=0;this.deepParticleDrift=0;this.lastParticleSimTime=0;this.oceanExploring=false;this.oceanCruising=false;this.oceanTravel=null;this.oceanObservationLayer='bed';this.oceanFreeDepthM=null;
    if(this.oceanChunks){
      const revision=(this.oceanResetRevision||0)+1;this.oceanResetRevision=revision;
      this.oceanEcologyResetting=true;this.oceanEcologyCenter=null;this.oceanAnimals.reset();
      this.oceanKelpDriftFood?.reset();
      this.oceanKelpUnderstory?.reset();
      this.oceanSceneElements?.reset();
      this.oceanHabitatScenes?.reset();
      this.oceanMacroLandscape?.reset();
      this._macroRenderRevision=null;
      this.setOceanRenderOrigin(0,0);this.oceanChunks.reset(this.sim.seed);this.setView('wide',true);
      this.oceanWaterField=this.isDeep?null:createOceanEnvironment(this.sim.seed,this.oceanChunks.generator,{uniformCurrent:this.isKelp});this.oceanLocalWater=null;
      this.oceanWaterParticles?.reset(this.sim.seed);
      this.oceanEcology.reset(this.sim.seed,this.oceanChunks.generator).then(()=>{
        if(this.disposed||revision!==this.oceanResetRevision)return;
        this.oceanEcologyResetting=false;
        if(this.isLivingShallows){this.oceanEcology.setEnvironment(this.sim.environment);this.enterLivingShallows();}
        this.requestOceanEcology();
      }).catch(error=>{if(!this.disposed&&revision===this.oceanResetRevision){this.oceanEcologyResetting=false;this.errors.push('区域生态重置失败：'+error.message);}});
    }
    this.syncPopulation();if(this.isLivingShallows)this.persistLivingWorld();this.onSelect(null);this.emitSnapshot(true);
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  tick(now){
    if(this.disposed)return;
    // A first rAF callback can carry the timestamp of the frame in which the
    // constructor began, before synchronous geometry/upload work completed.
    // Never move our baseline backwards and count that initialization again
    // in the following interval. Ordinary slow intervals remain untrimmed in
    // the performance record; only ecological integration uses the dt cap.
    const frameTime=Math.max(now,this.lastTime);
    const rawFrameSeconds=(frameTime-this.lastTime)/1000;
    const dt=clamp(rawFrameSeconds,0,.12);this.lastTime=frameTime;this.elapsed+=dt;
    if(!this.paused){this.visualTimeSec+=dt;try{
      if(this.isLivingShallows){this.livingClockSec+=dt*this.speed;this.sim.timeSec=this.livingClockSec;this.sim.environment.hour=(this.sim.environment.hour+dt*this.speed/3600)%24;}
      else this.sim.step(dt*this.speed);
      if(!this.oceanEcologyResetting)this.oceanEcology?.step(dt*this.speed,this.sim.environment);
    }catch(error){this.paused=true;this.errors.push(error.message);this.onError(`生态模型停止：${error.message}`);}}
    if(this.isLivingShallows&&this.elapsed-(this._livingStateSavedAt??0)>=2)this.persistLivingWorld();
    if(!this.isLivingShallows)this.syncPopulation();
    const metrics=this.sim.metrics;
    if(!this.isLivingShallows)for(const agent of this.sim.agents){const entity=this.entities.get(agent.id);if(entity)this.updateOrganism(agent,entity,metrics);}
    const env=this.sim.environment;
    if(this.isDeep){
      this.scene.background.set('#000000');this.scene.fog.color.copy(this.scene.background);
      this.scene.fog.density=.8/Math.max(.7,metrics.visibilityM);
      const deltaSim=Math.max(0,metrics.timeSec-this.lastParticleSimTime);
      this.deepParticleDrift=(this.deepParticleDrift+deltaSim*env.currentMps*.35)%18;this.lastParticleSimTime=metrics.timeSec;
      this.particleUniforms.t.value=metrics.timeSec;this.particleUniforms.drift.value=this.deepParticleDrift;
      this.particleUniforms.opacity.value=.10+env.turbidity*.18;
      this.particleUniforms.light.value=env.observerLight>0?1:0;
    }else{
      const sunFactor=clamp(Math.sin((env.hour-6)/12*Math.PI),0,1);
      this.sun.intensity=.08+sunFactor*(this.isKelp?2.2:3.2);this.ambient.intensity=(this.isKelp?.24:.18)+sunFactor*(this.isKelp?.85:.75);
      const dayColor=new THREE.Color(this.isKelp?'#315e51':'#236b87'),nightColor=new THREE.Color(this.isKelp?'#071b19':'#092835');
      this.scene.background.copy(nightColor).lerp(dayColor,sunFactor);
      this.scene.fog.color.copy(this.scene.background);this.scene.fog.density=(this.isKelp?.038:.022)+env.turbidity*(this.isKelp?.06:.035);
      this.waterColors.daylight.value=sunFactor;
      // Distant sediment converges to exactly the same linear-space colour
      // as the downward water background; no hard rectangle against it.
      this.waterColors.horizon.value.copy(this.scene.fog.color);this.waterColors.bottom.value.copy(this.scene.fog.color).multiplyScalar(this.isKelp?1:.60);
      this.waterColors.top.value.copy(this.waterNightColor).lerp(new THREE.Color(this.isKelp?'#81a09a':'#64bac9'),sunFactor);
      this.surfaceTime.value=this.visualTimeSec;
      this.particleUniforms.t.value=this.visualTimeSec;this.particleUniforms.current.value=env.currentMps;this.particleUniforms.opacity.value=.1+env.turbidity*.34;
    }
    this.causticUniforms.forEach(u=>u.value=this.visualTimeSec);
    const selected=this.findAgent(this.selectedId);
    if(selected&&selected.alive){const isPlant=this.catalog.get(selected.speciesId)?.kind==='kelp';this.highlight.position.copy(this.focusTarget(selected));this.highlight.quaternion.copy(this.camera.quaternion);this.highlight.scale.setScalar((isPlant?.28:Math.max(.009,selected.sizeM*.65))/.28);this.highlight.material.opacity=this.isDeep?(env.observerLight>0?.16:0):isPlant?.3:.16;
      if(this.following&&!this.transition&&!this.directorMotion){const p=this.focusTarget(selected),delta=p.clone().sub(this.controls.target);this.controls.target.lerp(p,.08);this.camera.position.addScaledVector(delta,.08);}
    }else this.highlight.visible=false;
    if(this.transition&&!this.directorMotion){if(this.transition.agentId&&selected){const next=this.focusTarget(selected),delta=next.clone().sub(this.transition.target);this.transition.position.add(delta);this.transition.target.copy(next);}this.camera.position.lerp(this.transition.position,.065);this.controls.target.lerp(this.transition.target,.065);if(this.camera.position.distanceTo(this.transition.position)<.025)this.transition=null;}
    if(this.directorMotion)this.updateDirectorMotion(dt);
    else{this.moveCamera(dt);this.controls.update();}
    this.enforceCameraClearance();this.updateLivingDiscoveries();
    if(this.oceanChunks){
      const p=this.oceanWorldPosition();
      if(Math.hypot(p.x,p.z)>25&&!this.following&&!this.oceanExploring){this.oceanExploring=true;this.select(null);this.onSelect(null);}
      if(Math.abs(this.camera.position.x)>256||Math.abs(this.camera.position.z)>256)this.setOceanRenderOrigin(Math.round(p.x/64)*64,Math.round(p.z/64)*64);
      this.oceanChunks.update(p);
      this.requestOceanEcology(p);
      this.oceanAnimals.update(this.oceanEcology.agents,metrics.timeSec,this.oceanRenderOrigin,this.camera.position);
      this.updateKelpDriftFood();
      this.oceanChunks.setDetailedHosts?.(this.oceanAnimals.detailedHostIds);
      // Camera-local display volumes follow exploration; none encode biomass.
      if(this.isDeep)this.updateDeepOceanWater();
      else{
        this.waterSurface.position.x=this.camera.position.x;this.waterSurface.position.z=this.camera.position.z;
        this.particles.position.set(this.camera.position.x,this.camera.position.y-(this.surfaceY-1)*.5,this.camera.position.z);
        const floor=this.floorY(p.x,p.z);
        this.sun.position.set(this.camera.position.x-7,floor+this.surfaceY+3,this.camera.position.z+4);
        this.sun.target.position.set(this.camera.position.x,floor+.4,this.camera.position.z-3);
        this.updateOceanWater(dt);
      }
    }
    this.waterVolume?.position.copy(this.camera.position);
    // Let the renderer test the surface against the whole camera frustum.
    // A downward centre ray does not mean the upper part of the view is below it.
    this.updateObserverLighting();
    if(!this.isDeep&&!this.isKelp&&!this.isLivingShallows){
      for(const entity of this.entities.values())updateOrganismDetail(entity.object,this.camera.position.distanceTo(entity.object.getWorldPosition(this.frameVectors.target)));
      let nearColonies=0,farColonies=0;
      for(const coral of this.decorations.children){
        const level=updateReefLandscapeDetail(coral,this.camera.position);
        if(level==='near')nearColonies++;else if(level==='far')farColonies++;
      }
      this.landscapeCoralDetail.nearColonies=nearColonies;this.landscapeCoralDetail.farColonies=farColonies;
    }
    this.renderer.render(this.scene,this.camera);
    this.recordFrameInterval(rawFrameSeconds);
    this.frameCount++;this.frameSeconds+=rawFrameSeconds;if(this.frameSeconds>=1){this.fps=this.frameCount/this.frameSeconds;this.frameCount=0;this.frameSeconds=0;}
    if(this.elapsed-this.lastSnapshot>.3)this.emitSnapshot();
    if(localCaptureEnabled&&this.elapsed<=1501&&this.elapsed-this.lastTelemetry>=30){this.lastTelemetry=this.elapsed;this.telemetrySamples.push({...this.frameTimingSnapshot(),...this.observationStateSnapshot(),biomeId:this.biomeId,wallSeconds:(Date.now()-this.runStarted)/1000,fps:Math.round(this.fps),metrics:{...metrics},paused:this.paused,speed:this.speed,visibility:document.visibilityState,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,entities:this.entities.size,memory:{geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures}});this.telemetrySamples=this.telemetrySamples.slice(-50);fetch('/__reef-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'telemetry',name:this.runId,data:{...this.frameTimingSnapshot(),...this.observationStateSnapshot(),biomeId:this.biomeId,runId:this.runId,startedAt:new Date(this.runStarted).toISOString(),wallSeconds:(Date.now()-this.runStarted)/1000,hardware:this.hardware,viewport:this.snapshot().viewport,samples:this.telemetrySamples,errors:this.errors}})}).catch(()=>{});}
  }
  clearCameraPosition(p){
    // Keep the observer inside the authored site and at least 52 m from the
    // outer sediment edge, where the matched far-fog already converges.
    if(this.oceanChunks){p.x+=this.oceanRenderOrigin.x;p.z+=this.oceanRenderOrigin.z;}
    else {p.x=clamp(p.x,-28,28);p.z=clamp(p.z,-28,28);}
    p.y=clamp(p.y,this.floorY(p.x,p.z)+.04,this.isDeep?(this.oceanChunks?this.floorY(p.x,p.z)+8:8):this.surfaceY-.5);
    for(const {rock,bedSupported}of this.cameraRocks){
      const [x,y,z,sx,sy,sz]=rock;
      if(!this.isKelp&&!this.isDeep){
        const nx=(p.x-x)/sx,nz=(p.z-z)/sz;
        if(!reefRockFootprintContains(rock,nx,nz))continue;
        const coordinate=reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-coordinate.radius**2));
        const low=reefRockSurfaceY(rock,nx,-ny,nz,bedSupported),high=reefRockSurfaceY(rock,nx,ny,nz);
        if(p.y<low-.04||p.y>high+.04)continue;
      }
      const dx=(p.x-x)/(sx*1.08),dy=(p.y-y)/(sy*1.08),dz=(p.z-z)/(sz*1.08),r=Math.hypot(dx,dy,dz);
      if(r<1.03){const v=new THREE.Vector3(dx,Math.max(.12,dy),dz).normalize().multiplyScalar(1.03);p.set(x+v.x*sx*1.08,y+v.y*sy*1.08,z+v.z*sz*1.08);}
    }
    if(!this.isKelp&&!this.isDeep){
      // The added sediment feet fill space outside the old ellipsoid guard.
      // Check their actual vertical interval, keeping the crevice cap open.
      // A single lift above every overlapping rock prevents a sequence of
      // horizontal pushes from placing the observer inside another shoulder.
      let entersRock=false,highestRock=this.floorY(p.x,p.z);
      for(const {rock,bedSupported}of this.cameraRocks){
        const nx=(p.x-rock[0])/rock[3],nz=(p.z-rock[2])/rock[5];
        if(!reefRockFootprintContains(rock,nx,nz))continue;
        const coordinate=reefRockCanonicalCoordinates(rock,nx,nz),ny=Math.sqrt(Math.max(0,1-coordinate.radius**2));
        const low=reefRockSurfaceY(rock,nx,-ny,nz,bedSupported),high=reefRockSurfaceY(rock,nx,ny,nz);
        highestRock=Math.max(highestRock,high);
        if(p.y>=low-.04&&p.y<=high+.04)entersRock=true;
      }
      if(entersRock)p.y=Math.max(p.y,highestRock+.05);
    }
    if(this.isKelp)p.y=clamp(p.y,this.habitatY(p.x,p.z)+.04,this.surfaceY-.5);
    p.y=Math.max(p.y,this.floorY(p.x,p.z)+.04);
    if(this.oceanChunks){
      if(Math.hypot(p.x,p.z)>40)p.y=Math.max(p.y,this.habitatY(p.x,p.z)+.25);
      p.x-=this.oceanRenderOrigin.x;p.z-=this.oceanRenderOrigin.z;
    }
    return p;
  }
  enforceCameraClearance(){
    const before=this.camera.position.clone(),p=this.clearCameraPosition(this.camera.position);
    this.controls.target.add(p.clone().sub(before));
  }
  recordFrameInterval(seconds){
    this.actualFrameCount++;this.actualFrameSeconds+=seconds;
    const ms=seconds*1000;
    this.minFrameTimeMs=Math.min(this.minFrameTimeMs,ms);this.maxFrameTimeMs=Math.max(this.maxFrameTimeMs,ms);
    const index=FRAME_TIME_LIMITS_MS.findIndex(limit=>ms<=limit);
    this.frameTimeBuckets[index<0?FRAME_TIME_LIMITS_MS.length:index]++;
  }
  frameTimingSnapshot(){
    return {actualFrameCount:this.actualFrameCount,actualFrameSeconds:this.actualFrameSeconds,
      overallMeanFPS:this.actualFrameSeconds>0?this.actualFrameCount/this.actualFrameSeconds:0,
      minFrameTimeMs:Number.isFinite(this.minFrameTimeMs)?this.minFrameTimeMs:null,maxFrameTimeMs:this.maxFrameTimeMs,
      frameTimeBuckets:this.frameTimeBuckets.map((frames,index)=>({upperMs:FRAME_TIME_LIMITS_MS[index]??null,frames}))};
  }
  moveCamera(dt){
    if(!this.keys.size&&!this.oceanTravel&&!this.oceanCruising)return;const v=new THREE.Vector3(),f=new THREE.Vector3();this.camera.getWorldDirection(f);f.y=0;f.normalize();const right=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0));
    if(this.keys.has('KeyW'))v.add(f);if(this.keys.has('KeyS'))v.sub(f);if(this.keys.has('KeyD'))v.add(right);if(this.keys.has('KeyA'))v.sub(right);if(this.keys.has('KeyE'))v.y++;if(this.keys.has('KeyQ'))v.y--;
    if(v.lengthSq()){
      this.oceanCruising=false;this.oceanTravel=null;v.normalize().multiplyScalar(dt*(this.oceanExploring?(this.keys.has('ShiftLeft')?24:4):(this.keys.has('ShiftLeft')?2.6:1.2)));
    }else if(this.oceanTravel){
      const p=this.oceanWorldPosition();v.set(this.oceanTravel.x-p.x,0,this.oceanTravel.z-p.z);
      const distance=v.length();if(distance<.02){
        const discovery=this.oceanTravel.discoveryId&&this.livingDiscoveryCandidates().find(row=>row.id===this.oceanTravel.discoveryId);
        if(discovery)this.controls.target.set(discovery.position.x-this.oceanRenderOrigin.x,discovery.position.y+.12,discovery.position.z-this.oceanRenderOrigin.z);
        if(this.oceanTravel.ridgePassage)this.orientLivingRidgePassage();
        this.oceanTravel=null;return;
      }v.multiplyScalar(Math.min(distance,dt*16)/distance);
    }else if(this.oceanCruising&&!this.paused)v.copy(f).multiplyScalar(dt*(this.keys.has('ShiftLeft')?24:12));
    if(v.lengthSq()){
      this.following=false;this.transition=null;
      this.captureOceanFreeDepth();
      if(this.oceanExploring&&(this.keys.has('KeyQ')||this.keys.has('KeyE'))){
        const p=this.oceanWorldPosition(),y=this.oceanLayerY(p.x+v.x,p.z+v.z,'free',Math.max(0,this.surfaceY-p.y-v.y));
        this.oceanObservationLayer='free';this.oceanFreeDepthM=Math.max(0,this.surfaceY-y);v.y=y-p.y;
      }
      if(this.oceanExploring&&Math.hypot(v.x,v.z)>0&&!this.keys.has('KeyQ')&&!this.keys.has('KeyE')){
        const p=this.oceanWorldPosition(),before=this.floorY(p.x,p.z),after=this.floorY(p.x+v.x,p.z+v.z);
        const layer=this.oceanObservationLayer||'bed';
        if(layer==='bed')v.y+=after-before;
        if(this.oceanTravel||this.oceanCruising||layer!=='bed'){
          const desiredY=this.oceanLayerY(p.x+v.x,p.z+v.z,layer);
          v.y=clamp(desiredY-this.camera.position.y,-dt*3,dt*3);
        }
      }
      this.camera.position.add(v);this.controls.target.add(v);
    }
  }
  observationStateSnapshot(){
    return {ocean:this.oceanSnapshot(),directorMotion:this.directorMotionSnapshot(),resourceInventory:this.resourceInventorySnapshot(),environmentAssets:this.environmentAssets.map(asset=>({...asset})),initializationMs:this.initializationMs,
      ...(this.isLivingShallows?{sceneProfile:LIVING_SHALLOWS_PROFILE,inputSeed:this.inputSeed,worldClockSec:this.livingClockSec}:{}),
      gpuWarmup:this.gpuWarmup?{...this.gpuWarmup}:null,visualTimeSec:this.visualTimeSec,
      landscapeCoralDetail:this.landscapeCoralDetail?{...this.landscapeCoralDetail}:null,
      camera:{position:this.camera.position.toArray(),target:this.controls.target.toArray()},
      environment:{...this.sim.environment},following:this.following,controlStartCount:this.controlStartCount,
      viewport:{width:this.container.clientWidth,height:this.container.clientHeight,pixelRatio:this.renderer.getPixelRatio()}};
  }
  snapshot(){const selected=this.findAgent(this.selectedId);return {...this.frameTimingSnapshot(),...this.observationStateSnapshot(),focusObservation:this.lastFocusAssessment?{...this.lastFocusAssessment}:null,biomeId:this.biomeId,sceneLabel:this.definition.label,surfaceY:this.surfaceY,visualEnvironment:{...this.visualEnvironment},workload:{...this.workload},morphology:this.isKelp?{...KELP_MORPHOLOGY}:null,selectedSpecies:selected?this.catalog.get(selected.speciesId):null,selectedAgentId:this.selectedId,runId:this.runId,wallSeconds:(Date.now()-this.runStarted)/1000,metrics:{...this.sim.metrics},environment:{...this.sim.environment},events:this.sim.events.slice(-8).reverse(),agents:(this.isLivingShallows?[]:this.sim.agents).concat(this.oceanEcology?.snapshot().agents||[]).map(a=>({...a,position:{...a.position}})),fps:Math.round(this.fps),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,hardware:this.hardware,viewport:{width:this.container.clientWidth,height:this.container.clientHeight,pixelRatio:this.renderer.getPixelRatio()},camera:{position:this.camera.position.toArray(),target:this.controls.target.toArray()},depthM:Math.max(0,(this.isDeep?this.definition.observationDepthM??DEEP_DEPTH_M:this.surfaceY)-this.camera.position.y),following:this.following,paused:this.paused,speed:this.speed,errors:[...this.errors]};}
  emitSnapshot(){this.lastSnapshot=this.elapsed;this.onSnapshot(this.snapshot());}
  async downloadScreenshot(){this.renderer.render(this.scene,this.camera);const data=this.renderer.domElement.toDataURL('image/png'),name=`${this.biomeId}-${Date.now()}`;if(localCaptureEnabled){const r=await fetch('/__reef-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'screenshot',name,data})});if(!r.ok)throw new Error('无法写入项目验证目录');const file=(await r.json()).file;await saveJson({schema:'tidal-observation-frame-v1',biomeId:this.biomeId,image:file,selectedId:this.selectedId,snapshot:this.snapshot()},name+'-metadata');return file;}const a=document.createElement('a');a.download=name+'.png';a.href=data;a.click();return name+'.png';}
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.stopDirectorMotion();
    // A partial constructor must release every resource that it acquired.
    // Continue cleanup if one disposer fails; preserve the original failure.
    const release=action=>{try{action();}catch(error){this.errors?.push('资源释放失败：'+error.message);}};
    release(()=>this.renderer?.setAnimationLoop(null));release(()=>this.resizeObserver?.disconnect());
    release(()=>this.persistLivingWorld());
    release(()=>window.removeEventListener('pagehide',this.onOceanCheckpoint));release(()=>document.removeEventListener('visibilitychange',this.onOceanVisibility));
    release(()=>{this.oceanEcology?.dispose().catch(error=>this.errors?.push('区域生态保存失败：'+error.message));});
    release(()=>this.oceanAnimals?.dispose());this.oceanAnimals=null;
    release(()=>this.oceanKelpDriftFood?.dispose());this.oceanKelpDriftFood=null;
    release(()=>this.oceanKelpUnderstory?.dispose());this.oceanKelpUnderstory=null;
    release(()=>this.oceanSceneElements?.dispose());this.oceanSceneElements=null;
    release(()=>this.oceanHabitatScenes?.dispose());this.oceanHabitatScenes=null;
    release(()=>this.oceanMacroLandscape?.dispose());this.oceanMacroLandscape=null;
    release(()=>this.oceanWaterParticles?.dispose());this.oceanWaterParticles=null;
    release(()=>this.oceanChunks?.dispose());this.oceanChunks=null;
    release(()=>this.warmupTarget?.dispose());this.warmupTarget=null;
    release(()=>{if(this.onControlStart)this.controls?.removeEventListener('start',this.onControlStart);});release(()=>this.controls?.dispose());
    for(const [name,handler]of [['keydown',this.onKeyDown],['keyup',this.onKeyUp],['blur',this.onBlur]])if(handler)release(()=>window.removeEventListener(name,handler));
    const canvas=this.canvas||this.renderer?.domElement;
    for(const [name,handler]of [['pointerdown',this.onPointerDown],['pointerup',this.onPointerUp],['webglcontextlost',this.onContextLost]])if(handler)release(()=>canvas?.removeEventListener(name,handler));
    if(this.scene)release(()=>this.captureWorldResources());
    for(const entity of this.entities?.values()||[])release(()=>this.disposeEntity(entity.object));this.entities?.clear();
    for(const object of [...(this.decorations?.children||[])])release(()=>disposeReefLandscapeCoral(object));
    release(()=>{const errors=this.reefScanAsset?.dispose()||[];for(const error of errors)this.errors.push('扫描资源释放失败：'+error);});this.reefScanAsset=null;
    // Shared organism resources were released by their own disposers above.
    for(const resources of [this.worldMaterials,this.worldTextures,this.worldGeometries]){
      for(const resource of resources||[])release(()=>resource?.dispose());resources?.clear();
    }
    release(()=>this.sun?.shadow?.map?.dispose());release(()=>this.scene?.clear());
    release(()=>this.renderer?.dispose());
    // Explicitly lose our owned context even when WebGLRenderer construction
    // failed before it could be assigned to this.renderer.
    release(()=>this.glContext?.getExtension('WEBGL_lose_context')?.loseContext());
    release(()=>canvas?.remove());
    this.keys?.clear();this.transition=null;this.following=false;
    for(const resources of Object.values(this.initialResourceInventory||{}))resources.clear();
    this.initialResourceInventory=null;this.cachedResourceInventory=null;
  }
}
