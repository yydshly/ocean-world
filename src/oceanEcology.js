import { speciesById as reefSpeciesById } from './species.js';
import { oceanSlopeSpeciesById } from './oceanSlopeSpecies.js';
import { oceanPelagicSpeciesById } from './oceanPelagicSpecies.js';
import { oceanMantaSpeciesById } from './oceanMantaSpecies.js';
import { reefGuildSpeciesById } from './oceanReefGuildSpecies.js';
import { openWaterSpeciesById } from './oceanOpenWaterSpecies.js';
import { oceanBiodiversitySpeciesById } from './oceanBiodiversitySpecies.js';
import { createOceanBiodiversityPlan, initializeOceanBiodiversity, validateOceanBiodiversityRecord,
  isOceanBiodiversityAgent, tickOceanBiodiversityAgent } from './oceanBiodiversity.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { oceanBenthicLifeSpeciesById } from './oceanBenthicLifeSpecies.js';
import { initializeOceanBenthicLife, validateOceanBenthicLifeRecord, isOceanBenthicLifeAgent, tickOceanBenthicLifeAgent } from './oceanBenthicLife.js';
import { OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS, OCEAN_SURFACE_Y } from './oceanGeneration.js';
import { OceanEcologyStore } from './oceanEcologyStore.js';
import { oceanRockHeight, OCEAN_ROCK_SURFACE_VERSION } from './oceanRockShape.js';
import { createOceanEnvironment } from './oceanEnvironment.js';
import { createOceanCommunityPlan, OCEAN_COMMUNITY_VERSION } from './oceanCommunity.js';
import { createOceanSlopeCommunityPlan, OCEAN_SLOPE_COMMUNITY_VERSION } from './oceanSlopeCommunity.js';
import { createOceanPelagicCommunityPlan, OCEAN_PELAGIC_COMMUNITY_VERSION } from './oceanPelagicCommunity.js';
import { createOceanMantaCommunityPlan, OCEAN_MANTA_COMMUNITY_VERSION } from './oceanMantaCommunity.js';
import { createOceanTurtlePlan, validateOceanTurtleRecord, tickOceanTurtles } from './oceanTurtleCommunity.js';
import { initializeOceanTurtleGrazing, validateOceanTurtleGrazingRecord,
  tickOceanTurtleGrazing, oceanTurtleGrazingContact } from './oceanTurtleGrazing.js';
import { createOceanSceneElements, validateOceanSceneElementsRecord, sceneElementHeight } from './oceanSceneElements.js';
import { createOceanHabitatScene, validateOceanHabitatSceneRecord, habitatSceneHeight } from './oceanHabitatScenes.js';
import { createOceanMacroLandscape, upgradeOceanMacroLandscape, validateOceanMacroLandscapeRecord,
  macroLandscapeHeight, OCEAN_MACRO_LANDSCAPE_VERSION } from './oceanMacroLandscape.js';
import { computeOceanPlanktonTransport, OCEAN_PLANKTON_TRANSPORT_VERSION,
  OCEAN_PLANKTON_FACE_SAMPLE_COUNT, OCEAN_PLANKTON_MINIMUM_WATER_COLUMN_M,
  OCEAN_PLANKTON_TRANSPORT_METHOD, OCEAN_PLANKTON_TRANSPORT_SCOPE } from './oceanPlanktonTransport.js';
import { LIVING_NETWORK_PROFILE, initializeLivingNetwork, validateLivingNetworkRecord,
  tickLivingNetwork, recordLivingIngestion, recordLivingDeath, recordLivingPredation,
  recordLivingTransfer, recordLivingFoodExchange, summarizeLivingNetwork, recordLivingAdmission,
  initializeLivingTurtleOrganic, recordLivingSeagrassGrazing } from './livingEcologyNetwork.js';
import { initializeReefGuild, validateReefGuildRecord, isReefGuildAgent, tickReefGuildAgent, tickReefGuildPool } from './oceanReefGuild.js';
import { initializeOpenWaterLife, validateOpenWaterLifeRecord, isOpenWaterLifeAgent,
  tickOpenWaterLifeAgent, tickOpenWaterLifePool } from './oceanOpenWaterLife.js';
import { createLivingRidgePlan, validateLivingRidgePlan } from './livingRidgeGeology.js';
import { createLivingHabitatMosaic, selectLivingHabitatMosaicTheme } from './livingHabitatMosaic.js';
import { createLivingSeabedRelief, selectLivingSeabedReliefTheme } from './livingSeabedRelief.js';
import { createLivingSeascapePlans } from './livingSeascape.js';
import { createLivingHabitatBeltPlans } from './livingHabitatBelt.js';
import { createLivingShallowSeascapePlans, SHALLOW_SEASCAPE_ANCHOR } from './livingShallowSeascape.js';

const speciesById = { ...reefSpeciesById, ...oceanSlopeSpeciesById, ...oceanPelagicSpeciesById, ...oceanMantaSpeciesById, ...reefGuildSpeciesById, ...openWaterSpeciesById, ...oceanBiodiversitySpeciesById, ...oceanBenthicLifeSpeciesById };

export const OCEAN_REGION_AGENT_LIMIT = 20;
export const OCEAN_ACTIVE_REGION_LIMIT = 9;
const STEP = .1;
const VERSION = 1;
// One explicit first sample; ordinary unbounded exploration keeps the existing
// v1-v5 admission rules rather than eagerly tiling twelve-owner groups.
const SHALLOW_SEASCAPE_OWNERS = [0, 1].flatMap(dz => Array.from({ length: 6 }, (_, dx) =>
  `${SHALLOW_SEASCAPE_ANCHOR.cx + dx},${SHALLOW_SEASCAPE_ANCHOR.cz + dz}`));
const shallowSeascapeMarked = row => row && (row.livingRidgePlan?.version === 6 ||
  ['shallowSeascapeVersion', 'shallowSeascapeGroupId', 'shallowSeascapeInitializedAtSec'].some(key => Object.hasOwn(row, key)));
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = value => structuredClone(value);
const sum = resources => Object.values(resources).reduce((total, value) => total + value, 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const worldKey = seed => `ecology-v${VERSION}:${typeof seed}:${seed}`;
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

// The shared triangle surface matches the rendered rock mesh, including
// neighbouring owners at chunk seams. The camera ceiling is not animal support.
export function oceanSupportHeight(generator, x, z, { avoidCoral = false, includeFormations = true, actualFloor = true } = {}) {
  let height = actualFloor && generator.floorSurface ? generator.floorSurface(x, z).height : generator.sample(x, z).floorY;
  const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const element of generator.chunk(cx + dx, cz + dz).elements) {
      if (generator.profile === LIVING_NETWORK_PROFILE && (element.kind === 'bottle' || element.kind === 'driftwood')) {
        const propHeight = sceneElementHeight(element, x, z);
        if (propHeight !== null) height = Math.max(height, propHeight);
        continue;
      }
      if (element.kind !== 'rock' && !(includeFormations && element.kind === 'formation') && !(avoidCoral && element.kind === 'coral')) continue;
      if (element.kind === 'rock' || element.kind === 'formation') {
        const rockHeight = oceanRockHeight(element, x, z);
        if (rockHeight !== null) height = Math.max(height, rockHeight);
        continue;
      }
      const wx = x - element.x, wz = z - element.z;
      const cos = Math.cos(element.rotation), sin = Math.sin(element.rotation);
      const radius = ((wx * cos - wz * sin) / (element.scale.x * .5)) ** 2 +
        ((wx * sin + wz * cos) / (element.scale.z * .5)) ** 2;
      if (radius <= 1) height = Math.max(height, element.y + element.scale.y);
    }
  }
  return height;
}

/** Qualitative loaded-region ecology, metres and simulation seconds. Regional
 * food pools are relative indices, not measured biomass. Unloaded regions
 * freeze, and changed state is restored from IndexedDB when they return. */
export class OceanEcology {
  constructor(seed, generator, { store = new OceanEcologyStore(), turtles = false, sceneElements = false, habitatScenes = false, macroLandscape = false, livingGeology = false, habitatMosaic = false, seabedRelief = false, seascape = false, livingBelt = false, turtleGrazing = false, shallowSeascape = false, biodiversity = false, benthicLife = false } = {}) {
    this.seed = seed;
    this.generator = generator;
    this.livingNetworkEnabled = generator.profile === LIVING_NETWORK_PROFILE;
    this.environmentField = createOceanEnvironment(seed, generator);
    this.store = store;
    this._biodiversityRequested = biodiversity === true;
    this.biodiversityEnabled = this._biodiversityRequested && this.livingNetworkEnabled && typeof store.saveMany === 'function';
    this._benthicLifeRequested = benthicLife === true;
    this.benthicLifeEnabled = this._benthicLifeRequested && this.livingNetworkEnabled && typeof store.saveMany === 'function';
    this._benthicLifeBirths = new WeakSet();
    this._biodiversityBirths = new WeakSet();
    this._biodiversityBirthView = [];
    this._livingGeologyRequested = livingGeology === true;
    this.livingGeologyEnabled = this._livingGeologyRequested && this.livingNetworkEnabled &&
      typeof generator.withRidgePlan === 'function' && typeof store.saveMany === 'function';
    this.habitatMosaicEnabled = habitatMosaic === true;
    this.seabedReliefEnabled = seabedRelief === true;
    this.seascapeEnabled = seascape === true;
    this._livingBeltRequested = livingBelt === true;
    this.livingBeltEnabled = this._livingBeltRequested && this.livingGeologyEnabled;
    this._shallowSeascapeRequested = shallowSeascape === true;
    this.shallowSeascapeEnabled = this._shallowSeascapeRequested && this.livingGeologyEnabled &&
      typeof generator.withShallowSeascapePlans === 'function' && typeof generator.replaceRidgeOwners === 'function';
    this.turtlesEnabled = turtles === true;
    this._turtleGrazingRequested = turtleGrazing === true;
    this.turtleGrazingEnabled = this._turtleGrazingRequested && this.turtlesEnabled && this.livingNetworkEnabled && typeof store.saveMany === 'function';
    this.sceneElementsEnabled = sceneElements === true;
    this.habitatScenesEnabled = habitatScenes === true;
    this.macroLandscapeEnabled = macroLandscape === true;
    this._world = worldKey(seed);
    this._active = new Map();
    this._supportCells = new Map();
    this._sceneSupports = new Map();
    this._habitatSupports = new Map();
    this._macroSupports = new Map();
    this._macroRevision = 0;
    this._generation = 0;
    this._revision = 0;
    this._center = null;
    this._queue = Promise.resolve();
    this._pending = this._queue;
    this._accumulator = 0;
    this._activeTime = 0;
    this._checkpointAt = 10;
    this._disposed = false;
    this._lockedRegions = new Set();
    this._transfers = [];
    this._pelagicFrames = new Map();
    this._planktonFaces = new Map();
    this._planktonDesiredRegions = new Set();
    this._planktonLastStep = { lastStepSec: 0, lastTransferredUnits: 0, lastBoundaryExportedUnits: 0, lastOverflowExportedUnits: 0 };
    this._counts = { generated: 0, restored: 0, saved: 0, unloaded: 0, persistenceErrors: 0 };
    this._storageError = null;
    this._environment = { currentMps: .15, turbidity: .25, foodSupply: 1, hour: 10 };
  }

  get agents() {
    // Rendering reads the live array without cloning each frame. Expose its
    // clock here as well as in snapshot(). Mobile manta clocks travel with the
    // individual; other organisms retain their existing regional clock.
    return [...this._active.values()].flatMap(region => {
      for (const agent of region.agents) agent.timeSec = agent.mobileTimeSec ?? region.timeSec;
      for (const agent of region.turtleAgents ?? []) agent.timeSec = region.timeSec;
      return region.turtleAgents?.length ? region.agents.concat(region.turtleAgents) : region.agents;
    });
  }

  _random(region, salt) { return hash(`${this._world}|${region.id}|${salt}`) / 4294967296; }

  _residentCount(region) { return region.agents.length + (region.turtleAgents?.length ?? 0); }

  get sceneElements() { return [...this._active.values()].flatMap(region => region.sceneElements ?? []); }

  get habitatSceneElements() { return [...this._active.values()].flatMap(region => region.habitatSceneElements ?? []); }

  get macroLandscapeElements() { return [...this._active.values()].flatMap(region => region.macroLandscapeElements ?? []); }
  get macroLandscapeRevision() { return this._macroRevision; }

  _supplementMacroLandscape(region) {
    if (!this.macroLandscapeEnabled || typeof this.store.saveMany !== 'function') return false;
    if(region.macroLandscapeVersion===1){
      const upgrade=upgradeOceanMacroLandscape(region,this.generator,{seed:this.seed,
        surface:(x,z)=>this._macroBaselineSurface(region,x,z)});
      if(!upgrade)return false;
      Object.assign(region,upgrade);return true;
    }
    if(region.macroLandscapeVersion!==undefined)return false;
    region.macroLandscapeElements = createOceanMacroLandscape(this.generator, region, { seed: this.seed,
      surface: (x, z) => this._macroBaselineSurface(region, x, z) });
    region.macroLandscapeVersion = OCEAN_MACRO_LANDSCAPE_VERSION; region.macroLandscapeInitializedAtSec = region.timeSec;
    return true;
  }

  _macroBaselineSurface(region, x, z) {
    return Math.max(this._surface(x, z, true, true, true, true, true, false),
      ...(region.sceneElements ?? []).map(e => sceneElementHeight(e, x, z, true) ?? -Infinity),
      ...(region.habitatSceneElements ?? []).map(e => habitatSceneHeight(e, x, z, true) ?? -Infinity));
  }

  _registerMacroSupport(region) {
    const bins = new Map();
    for (const element of region.macroLandscapeElements) {
      // Committed scenery never moves. Restored descriptors regain the same
      // immutability as a fresh plan, so mesh caches need no per-query hashes.
      Object.freeze(element.scale);
      if(element.grid){
        Object.freeze(element.grid.origin);
        element.grid.cells.forEach(Object.freeze);
        Object.freeze(element.grid.cells);Object.freeze(element.grid);
      }
      Object.freeze(element);
      const radius = Math.hypot(element.scale.x, element.scale.z) * .5;
      for (let z = Math.floor((element.z - radius) / 4); z <= Math.floor((element.z + radius) / 4); z++)
        for (let x = Math.floor((element.x - radius) / 4); x <= Math.floor((element.x + radius) / 4); x++) {
          const key = `${x},${z}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(element);
        }
    }
    this._macroSupports.set(region.id, bins);
    this._macroRevision++;
  }

  macroLandscapeSupportHeight(x, z, swimmer = true) {
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    let height = -Infinity;
    // Per-owner bins vanish on unloading. Dense planted areas do not add a
    // complete landscape scan to each fixed-step animal support query.
    for (const bins of this._macroSupports.values()) for (const element of bins.get(key) ?? []) {
      const top = macroLandscapeHeight(element, this.generator, x, z, swimmer);
      if (top !== null) height = Math.max(height, top);
    }
    return height;
  }

  _supplementHabitatScene(region) {
    if (!this.habitatScenesEnabled || typeof this.store.saveMany !== 'function' || region.habitatSceneVersion !== undefined) return false;
    const plan = createOceanHabitatScene(this.generator, region, { seed: this.seed,
      surface: (x, z) => this._surface(x, z, true, true, true, true, false, false) });
    region.habitatSceneVersion = 1; region.habitatSceneInitializedAtSec = region.timeSec;
    region.habitatSceneTheme = plan.theme; region.habitatSceneElements = plan.elements;
    return true;
  }

  habitatSceneSupportHeight(x, z, swimmer = true) {
    if (!swimmer || !this._habitatSupports.size) return -Infinity;
    let height = -Infinity;
    const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const element of this._habitatSupports.get(`${cx + dx},${cz + dz}`) ?? []) {
        const support = habitatSceneHeight(element, x, z, swimmer);
        if (support !== null) height = Math.max(height, support);
      }
    }
    return height;
  }

  _supplementSceneElementsRegion(region) {
    if (!this.sceneElementsEnabled || typeof this.store.saveMany !== 'function' || region.sceneElementsVersion !== undefined) return false;
    region.sceneElements = createOceanSceneElements(this.generator, region, { seed: this.seed,
      surface: (x, z) => this._surface(x, z, true, true, true, false, false, false) });
    region.sceneElementsVersion = 1; region.sceneElementsInitializedAtSec = region.timeSec;
    return true;
  }

  sceneSupportHeight(x, z, swimmer = true) {
    if (!this._sceneSupports.size) return -Infinity;
    let height = -Infinity;
    const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const element of this._sceneSupports.get(`${cx + dx},${cz + dz}`) ?? []) {
        const support = sceneElementHeight(element, x, z, swimmer);
        if (support !== null) height = Math.max(height, support);
      }
    }
    return height;
  }

  _supplementTurtleRegion(region) {
    // A complete marked birth record fixes occupied and empty categories alike.
    if (region.benthicLifeVersion === 1) return false;
    if (!this.turtlesEnabled || typeof this.store.saveMany !== 'function' || region.turtleCommunityVersion !== undefined) return false;
    const plan = createOceanTurtlePlan(this.generator, region, { seed: this.seed,
      surface: (x, z) => this._surface(x, z, true), capacity: this._initialAnimalCapacity(region) - this._residentCount(region) });
    region.turtleAgents = plan.placements;
    region.turtleCommunityVersion = 1; region.turtleInitializedAtSec = region.timeSec;
    return true;
  }

  _bed(x, z) { return this.generator.floorSurface?.(x, z).height ?? this.generator.sample(x, z).floorY; }

  _surface(x, z, fish = false, includeFormations = true, actualFloor = true, includeScene = true, includeHabitat = true, includeMacro = true, includeBiodiversity = true) {
    const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE), key = `${cx},${cz}`;
    let features = this._supportCells.get(key);
    if (!features) {
      features = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        for (const element of this.generator.chunk(cx + dx, cz + dz).elements) {
          if (element.kind === 'rock' || element.kind === 'formation' || element.kind === 'coral' ||
            (this.livingNetworkEnabled && (element.kind === 'bottle' || element.kind === 'driftwood'))) features.push({ element,
            cos: Math.cos(element.rotation), sin: Math.sin(element.rotation),
            inverseX: 2 / element.scale.x, inverseZ: 2 / element.scale.z });
        }
      }
      this._supportCells.set(key, features);
      if (this._supportCells.size > 25) this._supportCells.delete(this._supportCells.keys().next().value);
    } else { this._supportCells.delete(key); this._supportCells.set(key, features); }
    let height = actualFloor ? this._bed(x, z) : this.generator.sample(x, z).floorY;
    for (const { element, cos, sin, inverseX, inverseZ } of features) {
      if (element.kind === 'bottle' || element.kind === 'driftwood') {
        const propHeight = sceneElementHeight(element, x, z);
        if (propHeight !== null) height = Math.max(height, propHeight);
        continue;
      }
      if (element.kind === 'coral' && !fish) continue;
      if (element.kind === 'formation' && !includeFormations) continue;
      if (element.kind === 'rock' || element.kind === 'formation') {
        const rockHeight = oceanRockHeight(element, x, z);
        if (rockHeight !== null) height = Math.max(height, rockHeight);
        continue;
      }
      const wx = x - element.x, wz = z - element.z;
      const radius = ((wx * cos - wz * sin) * inverseX) ** 2 + ((wx * sin + wz * cos) * inverseZ) ** 2;
      if (radius <= 1) height = Math.max(height, element.y + element.scale.y);
    }
    return Math.max(height, includeScene ? this.sceneSupportHeight(x, z, fish) : -Infinity,
      includeHabitat ? this.habitatSceneSupportHeight(x, z, fish) : -Infinity,
      includeMacro ? this.macroLandscapeSupportHeight(x, z, fish) : -Infinity,
      includeBiodiversity && fish ? this.biodiversitySupportHeight(x, z) : -Infinity);
  }

  _createRegion(cx, cz) {
    const chunk = this.generator.chunk(cx, cz);
    const region = { version: VERSION, surfaceVersion: OCEAN_ROCK_SURFACE_VERSION, communityVersion: OCEAN_COMMUNITY_VERSION, id: chunk.id, cx, cz,
      ...(this.generator.floorSurfaceVersion ? { floorSurfaceVersion: this.generator.floorSurfaceVersion } : {}),
      ...(chunk.formationsVersion ? { formationsVersion: chunk.formationsVersion } : {}),
      habitat: this.generator.sample(chunk.origin.x + chunk.size * .5, chunk.origin.z + chunk.size * .5).habitat,
      timeSec: 0, ticks: 0, agents: [], events: [],
      resources: { algae: .20 + Math.min(.65, chunk.counts.rock * .035),
        plankton: .45 + this._random({ id: chunk.id }, 'initial-plankton') * .24,
        detritus: .20 + Math.min(.3, chunk.counts.seagrass * .01) },
      ledger: { initial: 0, input: 0, ingested: 0, exported: 0 },
      counters: { feeding: 0, escapes: 0, cleaning: 0, predation: 0, deaths: 0 } };
    if (this.biodiversityEnabled) this._biodiversityBirths.add(region);
    if (this.benthicLifeEnabled) this._benthicLifeBirths.add(region);
    region.ledger.initial = sum(region.resources);
    const random = salt => this._random(region, salt);
    const add = (speciesId, x, z, habitat, hostId = null, groupId = null) => {
      if (this._residentCount(region) >= this._initialAnimalCapacity(region) || (!this.livingNetworkEnabled && Math.hypot(x, z) < OCEAN_AUTHORED_RADIUS + 1) ||
        x < chunk.bounds.minX + .5 || x > chunk.bounds.maxX - .5 || z < chunk.bounds.minZ + .5 || z > chunk.bounds.maxZ - .5) return;
      const species = speciesById[speciesId], index = region.agents.length;
      const fish = species.kind === 'fish';
      const surface = this._surface(x, z, fish);
      const sample = this.generator.sample(x, z), hardSurface = this._surface(x, z);
      // Correct new births against actual local support. This path is never
      // called for a valid saved record and cannot move historical individuals.
      if (sample.depthM > 22 || (speciesId === 'black-cucumber' &&
        (sample.substrate === 'rock' || hardSurface - this._bed(x, z) >= .03)) ||
        ((species.guild === 'grazer' || species.kind === 'star' || species.kind === 'snail') &&
          hardSurface - this._bed(x, z) <= .06)) return;
      const y = surface + (fish ? speciesId === 'green-chromis' ? .7 + random(`height:${index}`) * .45 : .18 + random(`height:${index}`) * .32 : .004);
      const position = { x, y: Math.min(OCEAN_SURFACE_Y - .6, y), z };
      if (fish && position.y < surface + .08) return;
      const id = `ocean:${region.id}:${speciesId}:${index}`;
      region.agents.push({ id, regionId: region.id, speciesId, position, home: { ...position }, target: { ...position },
        velocity: { x: 0, y: 0, z: 0 }, heading: random(`heading:${index}`) * TAU,
        sizeM: species.lengthM * (.88 + random(`size:${index}`) * .18),
        state: fish ? speciesId === 'green-chromis' ? 'schooling' : species.guild === 'predator' ? 'ambushing' : 'foraging' : 'resting',
        stateSince: 0, energy: .64 + random(`energy:${index}`) * .22, alive: true,
        parasites: fish ? .12 + random(`parasites:${index}`) * .25 : 0,
        lastFeedAt: null, nextBite: random(`bite:${index}`) * 3,
        nextDecision: 0, decisions: 0, refuge: { ...position }, refugeHostId: hostId,
        habitat, groupId, supportOffset: position.y - surface, fleeUntil: 0 });
    };
    const plan = createOceanCommunityPlan(this.generator, chunk, { random, surface: (x, z, fish) => this._surface(x, z, fish), biodiversity: this._biodiversityBirths.has(region) });
    if (plan.populationRecipeVersion !== undefined) region.populationRecipeVersion = plan.populationRecipeVersion;
    for (const animal of plan.placements) add(animal.speciesId, animal.x, animal.z, animal.habitat, animal.hostId, animal.groupId);
    this._supplementRegion(region);
    return region;
  }

  _supplementRegion(region) {
    // A complete marked birth record fixes occupied and empty categories alike.
    if (region.benthicLifeVersion === 1) return false;
    const chunk = this.generator.chunk(region.cx, region.cz);
    const rocks = chunk.elements.filter(element => element.kind === 'rock');
    const coralHosts = new Set(chunk.elements.filter(element => element.kind === 'coral').map(element => element.attachmentId));
    let changed = false;
    for (const speciesId of ['giant-clam', 'cleaner-shrimp']) {
      // A dead individual still occupies its category and stable identity.
      // Upgrading a v1 record never replaces its population or resurrects it.
      if (this._residentCount(region) >= this._initialAnimalCapacity(region) || region.agents.some(agent => agent.speciesId === speciesId)) continue;
      const species = speciesById[speciesId];
      const hosts = rocks.filter(rock => this.generator.sample(rock.x, rock.z).depthM < (species.kind === 'clam' ? 18 : 22)
        && (species.kind !== 'shrimp' || coralHosts.has(rock.id)))
        .sort((a, b) => this._random(region, `${speciesId}:host:${a.id}`) - this._random(region, `${speciesId}:host:${b.id}`));
      let candidate = null;
      for (const rock of hosts) {
        const id = `ocean:${region.id}:${speciesId}:host:${rock.id}`;
        const angle = this._random(region, `${id}:site`) * TAU;
        // Keep existing rocks/colonies intact: the clam attaches on a bare
        // crest shoulder, while the shrimp uses open sediment at that reef's
        // foot. An ellipsoid is not evidence of a newly authored cave.
        for (let attempt = 0; attempt < 8; attempt++) {
          const theta = angle + attempt * TAU / 8, radius = species.kind === 'clam' ? .42 : 1.10;
          const lx = Math.cos(theta) * radius * rock.scale.x * .5;
          const lz = Math.sin(theta) * radius * rock.scale.z * .5;
          const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
          const x = rock.x + lx * cos + lz * sin, z = rock.z - lx * sin + lz * cos;
          const sample = this.generator.sample(x, z), surface = this._surface(x, z);
          if ((!this.livingNetworkEnabled && Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + 1) || sample.depthM >= (species.kind === 'clam' ? 18 : 22)
            || x < chunk.bounds.minX + .5 || x > chunk.bounds.maxX - .5 || z < chunk.bounds.minZ + .5 || z > chunk.bounds.maxZ - .5
            || (species.kind === 'clam' ? surface - this._bed(x, z) <= .06 : surface - this._bed(x, z) >= .03 || sample.habitat === 'seagrass')
            || this._surface(x, z, true) > surface + .02) continue;
          const position = { x, y: surface + .004, z };
          candidate = { id, regionId: region.id, speciesId, position, home: { ...position }, target: { ...position },
            velocity: { x: 0, y: 0, z: 0 }, heading: this._random(region, `${id}:heading`) * TAU,
            sizeM: species.lengthM * (.88 + this._random(region, `${id}:size`) * .18),
            state: species.kind === 'clam' ? 'filtering' : 'foraging', stateSince: region.timeSec,
            energy: .64 + this._random(region, `${id}:energy`) * .22, alive: true, parasites: 0,
            lastFeedAt: null, nextBite: region.timeSec + this._random(region, `${id}:bite`) * 3,
            nextDecision: region.timeSec, decisions: 0, refuge: { ...position }, refugeHostId: rock.id,
            habitat: species.kind === 'clam' ? 'hard-substrate' : 'reef-foot-cleaning-station',
            groupId: null, supportOffset: .004, fleeUntil: 0 };
          break;
        }
        if (candidate) break;
      }
      if (candidate) { region.agents.push(candidate); changed = true; }
    }
    return changed;
  }

  _supplementSlopeRegion(region) {
    // A complete marked birth record fixes occupied and empty categories alike.
    if (region.benthicLifeVersion === 1) return false;
    const chunk = this.generator.chunk(region.cx, region.cz);
    if (!chunk.elements.some(element => element.kind === 'formation') ||
      region.slopeCommunityVersion >= OCEAN_SLOPE_COMMUNITY_VERSION) return false;
    const random = salt => this._random(region, `slope:${salt}`);
    const plan = createOceanSlopeCommunityPlan(this.generator, chunk, {
      random, surface: (x, z, fish) => this._surface(x, z, fish) });
    if (!plan.eligible) return false;
    // A dead record still occupies its category. This is a one-time model
    // upgrade, never a respawn rule, population replacement or food refill.
    const present = new Set(region.agents.map(agent => agent.speciesId));
    const add = animal => {
      const species = speciesById[animal.speciesId], fish = species.kind === 'fish';
      const surface = this._surface(animal.x, animal.z, fish);
      const offset = fish ? .6 + random(`${animal.siteId}:height`) * .6 : .004;
      const position = { x: animal.x, y: surface + offset, z: animal.z };
      const id = `ocean:${region.id}:${animal.speciesId}:${animal.siteId}`;
      region.agents.push({ id, regionId: region.id, speciesId: animal.speciesId,
        position, home: { ...position }, target: { ...position },
        velocity: { x: 0, y: 0, z: 0 }, heading: random(`${animal.siteId}:heading`) * TAU,
        sizeM: species.lengthM * (.88 + random(`${animal.siteId}:size`) * .18),
        state: fish ? 'schooling' : 'resting', stateSince: region.timeSec,
        energy: .64 + random(`${animal.siteId}:energy`) * .22, alive: true,
        parasites: fish ? .12 + random(`${animal.siteId}:parasites`) * .25 : 0,
        lastFeedAt: null, nextBite: region.timeSec + .3 + random(`${animal.siteId}:bite`) * 2,
        nextDecision: region.timeSec, decisions: 0,
        refuge: { ...position, y: surface + (fish ? .12 : .004) }, refugeHostId: animal.hostId,
        habitat: animal.habitat, groupId: animal.groupId, supportOffset: offset,
        fleeUntil: 0, populationOrigin: 'slope-community-v1' });
    };
    const before = region.agents.length;
    const schools = new Map();
    for (const animal of plan.placements) {
      if (animal.speciesId !== 'lyretail-anthias') continue;
      if (!schools.has(animal.groupId)) schools.set(animal.groupId, []);
      schools.get(animal.groupId).push(animal);
    }
    if (!present.has('lyretail-anthias')) for (const members of schools.values()) {
      const free = this._initialAnimalCapacity(region) - this._residentCount(region);
      if (free < 4) break;
      for (const animal of members.slice(0, free)) add(animal);
    }
    if (!present.has('blue-starfish')) for (const animal of plan.placements) {
      if (animal.speciesId !== 'blue-starfish' || this._residentCount(region) >= this._initialAnimalCapacity(region)) continue;
      add(animal);
    }
    region.slopeCommunityVersion = OCEAN_SLOPE_COMMUNITY_VERSION;
    region.slopeCommunityAdded = region.agents.length - before;
    region.slopeInitializedAtSec = region.timeSec;
    return true;
  }

  _supplementPelagicRegion(region) {
    // A complete marked birth record fixes occupied and empty categories alike.
    if (region.benthicLifeVersion === 1) return false;
    if (region.pelagicCommunityVersion >= OCEAN_PELAGIC_COMMUNITY_VERSION) return false;
    const random = salt => this._random(region, salt);
    const plan = createOceanPelagicCommunityPlan(this.generator, this.generator.chunk(region.cx, region.cz), {
      random, surface: (x, z, fish) => this._surface(x, z, fish) });
    if (!plan.eligible) return false;
    const before = region.agents.length;
    // Historical deaths occupy both their species category and total slots.
    // This is a one-time compatibility addition, never natural recruitment.
    if (!region.pelagicEverOccupied && !region.agents.some(agent => agent.speciesId === 'yellowtail-fusilier')) {
      const reserved = this.livingNetworkEnabled ? (region.reefGuildVersion === undefined ? 3 : 0) + (region.openWaterLifeVersion === undefined ? 2 : 0) : 0;
      const free = this._initialAnimalCapacity(region) - this._residentCount(region) - reserved;
      if (free >= 4) for (const animal of plan.placements.slice(0, free)) {
        const species = speciesById[animal.speciesId];
        const position = { x: animal.x, y: this._pelagicY(animal.x, animal.z, animal.depthM), z: animal.z };
        const id = `ocean:${region.id}:${animal.speciesId}:${animal.siteId}`;
        region.agents.push({ id, regionId: region.id, speciesId: animal.speciesId,
          position, home: { ...position }, target: { ...position }, refuge: { ...position },
          velocity: { x: 0, y: 0, z: 0 }, heading: animal.schoolPhaseRad,
          sizeM: species.lengthM * (.88 + random(`${animal.siteId}:size`) * .18),
          state: 'schooling', stateSince: region.timeSec,
          energy: .64 + random(`${animal.siteId}:energy`) * .22, alive: true,
          parasites: .12 + random(`${animal.siteId}:parasites`) * .25,
          lastFeedAt: null, nextBite: region.timeSec + .3 + random(`${animal.siteId}:bite`) * 2,
          nextDecision: region.timeSec, decisions: 0, refugeHostId: animal.hostId,
          habitat: animal.habitat, groupId: animal.groupId,
          supportOffset: position.y - this._surface(position.x, position.z, true), fleeUntil: 0,
          schoolHome: { ...animal.schoolHome }, orbitRadiusM: animal.orbitRadiusM,
          schoolPhaseRad: animal.schoolPhaseRad, schoolSlot: animal.schoolSlot,
          preferredDepthM: animal.depthM, populationOrigin: 'pelagic-community-v1' });
      }
    }
    // Even a full historical record is examined once: later deaths do not
    // release slots for a second automatic attempt at this school.
    region.pelagicCommunityVersion = OCEAN_PELAGIC_COMMUNITY_VERSION;
    if (this.livingNetworkEnabled && region.basicNetwork) recordLivingAdmission(region, region.agents.slice(before));
    region.pelagicCommunityAdded = region.agents.length - before;
    region.pelagicInitializedAtSec = region.timeSec;
    return true;
  }

  _pelagicY(x, z, depthM) {
    return Math.min(OCEAN_SURFACE_Y - 1.5, Math.max(this._surface(x, z, true) + 1, OCEAN_SURFACE_Y - depthM));
  }

  _supplementMantaRegion(region) {
    // A complete marked birth record fixes occupied and empty categories alike.
    if (region.benthicLifeVersion === 1) return false;
    if (region.mantaCommunityVersion >= OCEAN_MANTA_COMMUNITY_VERSION) return false;
    const random = salt => this._random(region, salt);
    const plan = createOceanMantaCommunityPlan(this.generator, this.generator.chunk(region.cx, region.cz), {
      random, surface: (x, z) => this._surface(x, z, true) });
    if (!plan.eligible) return false;
    const before = region.agents.length;
    if (!region.mantaEverOccupied && !region.agents.some(agent => agent.speciesId === 'reef-manta') && this._residentCount(region) < this._initialAnimalCapacity(region)) {
      for (const animal of plan.placements.slice(0, this._initialAnimalCapacity(region) - this._residentCount(region))) {
        const sizeM = 3 + random(`${animal.siteId}:size`) * .3;
        const y = this._mantaY(animal.x, animal.z, animal.depthM, sizeM);
        if (y === null) continue;
        const position = { x: animal.x, y, z: animal.z };
        region.agents.push({ id: `ocean:${region.id}:${animal.speciesId}:${animal.siteId}`,
          regionId: region.id, speciesId: animal.speciesId, position,
          home: { ...position }, target: { ...position }, refuge: { ...position },
          velocity: { x: 0, y: 0, z: 0 }, heading: animal.patrolPhaseRad + Math.PI / 2,
          sizeM, state: 'gliding', stateSince: region.timeSec,
          energy: .72 + random(`${animal.siteId}:energy`) * .16, alive: true, parasites: 0,
          lastFeedAt: null, nextBite: region.timeSec + .5 + random(`${animal.siteId}:bite`) * 2,
          nextDecision: region.timeSec, decisions: 0, refugeHostId: animal.hostId,
          habitat: animal.habitat, supportOffset: y - this._surface(animal.x, animal.z, true), fleeUntil: 0,
          patrolHome: { ...animal.patrolHome }, orbitRadiusM: animal.orbitRadiusM,
          patrolPhaseRad: animal.patrolPhaseRad, patrolStartedAtSec: region.timeSec,
          preferredDepthM: animal.depthM, populationOrigin: 'manta-community-v1' });
      }
    }
    // A historical death or a full/seeded-empty record is examined once.
    region.mantaCommunityVersion = OCEAN_MANTA_COMMUNITY_VERSION;
    region.mantaCommunityAdded = region.agents.length - before;
    region.mantaInitializedAtSec = region.timeSec;
    return true;
  }

  _upgradeMantaMobility(region) {
    // Legacy stores cannot atomically persist changed geographic ownership.
    if (typeof this.store.saveMany !== 'function') return false;
    let changed = false;
    for (const agent of region.agents) {
      if (agent.speciesId !== 'reef-manta' || agent.roamingVersion >= 1) continue;
      agent.birthRegionId = agent.regionId;
      agent.mobileTimeSec = region.timeSec;
      agent.roamingVersion = 1;
      agent.roamingRadiusM = 80 + this._random(region, `${agent.id}:roaming-radius`) * 16;
      agent.roamingStartedAtSec = region.timeSec;
      agent.roamingPhaseRad = Math.atan2(agent.position.z - agent.patrolHome.z, agent.position.x - agent.patrolHome.x);
      changed = true;
    }
    return changed;
  }

  _upgradePelagicMobility(region) {
    // Ownership can change only when all owners can be saved atomically. The
    // upgrade adds metadata; historical poses, deadlines, deaths and food stay.
    if (typeof this.store.saveMany !== 'function') return false;
    let changed = false;
    for (const agent of region.agents) {
      if (agent.speciesId !== 'yellowtail-fusilier') continue;
      if (!region.pelagicEverOccupied) { region.pelagicEverOccupied = true; changed = true; }
      if (agent.fusilierRoamingVersion >= 1) continue;
      agent.birthRegionId ??= agent.regionId;
      agent.mobileTimeSec ??= region.timeSec;
      const birthplace = { id: agent.birthRegionId };
      const period = 180 + this._random(region, `${agent.groupId}:patrol-period`) * 40;
      const phase = agent.schoolPhaseRad + region.timeSec * TAU / period;
      const radius = 80 + this._random(birthplace, `${agent.groupId}:roaming-radius`) * 16;
      agent.roamingSchoolRadiusM ??= radius;
      agent.roamingSchoolPeriodSec ??= 2400 + this._random(birthplace, `${agent.groupId}:roaming-period`) * 320;
      agent.roamingSchoolPhaseRad ??= phase;
      agent.roamingSchoolStartedAtSec ??= agent.mobileTimeSec;
      // A shifted large route passes through the old local patrol target at
      // this exact phase. Increasing its radius never teleports the school.
      agent.roamingSchoolHome ??= {
        x: agent.schoolHome.x + Math.cos(phase) * (agent.orbitRadiusM - agent.roamingSchoolRadiusM),
        z: agent.schoolHome.z + Math.sin(phase) * (agent.orbitRadiusM - agent.roamingSchoolRadiusM) * .65,
      };
      agent.fusilierRoamingVersion = 1;
      changed = true;
    }
    return changed;
  }

  _pelagicMobile(agent) {
    return agent.speciesId === 'yellowtail-fusilier' && agent.fusilierRoamingVersion >= 1 && typeof this.store.saveMany === 'function';
  }

  _preparePelagicFrames() {
    // Snapshot before any regional tick: a crossing cohort sees the same
    // neighbours regardless of Map order, including peers in another owner.
    this._pelagicFrames.clear();
    for (const region of this._active.values()) for (const agent of region.agents) {
      if (!agent.alive || !this._pelagicMobile(agent)) continue;
      let frame = this._pelagicFrames.get(agent.groupId);
      if (!frame) { frame = { members: [], centroid: { x: 0, y: 0, z: 0 } }; this._pelagicFrames.set(agent.groupId, frame); }
      frame.members.push({ id: agent.id, regionId: agent.regionId, position: { ...agent.position } });
    }
    for (const frame of this._pelagicFrames.values()) {
      frame.members.sort((a, b) => a.id.localeCompare(b.id));
      for (const axis of ['x', 'y', 'z']) frame.centroid[axis] = frame.members.reduce((total, member) => total + member.position[axis], 0) / frame.members.length;
    }
  }

  _upgradePlanktonTransport(region) {
    if (typeof this.store.saveMany !== 'function' || region.planktonTransportVersion >= OCEAN_PLANKTON_TRANSPORT_VERSION) return false;
    // Optional additive accounting. No old population, clock, stock or ledger
    // value is recomputed, normalized or replaced during preactivation.
    // Missing transfer counters mean zero. Do not append even zero-valued
    // ledger keys until a genuine fixed step; the entire old ledger survives
    // a paused metadata upgrade byte-for-byte in its existing object shape.
    region.planktonTransport ??= {
      lastStepSec: 0, lastImportedUnits: 0, lastTransferredOutUnits: 0,
      lastBoundaryExportedUnits: 0, lastOverflowExportedUnits: 0,
      cumulativeBoundaryExportedUnits: 0, cumulativeOverflowExportedUnits: 0,
    };
    region.planktonTransportVersion = OCEAN_PLANKTON_TRANSPORT_VERSION;
    return true;
  }

  _usesPlanktonTransport(region) {
    return typeof this.store.saveMany === 'function' && region.planktonTransportVersion >= OCEAN_PLANKTON_TRANSPORT_VERSION;
  }

  _planktonFaceOpenFraction({ axis, x, z }) {
    const key = `${axis}:${x},${z}`;
    if (this._planktonFaces.has(key)) return this._planktonFaces.get(key);
    let open = 0;
    // Five fixed transverse references, each with both sides and the face
    // centre, use the rendered coral/rock/formation support. This describes a
    // shared water column, not full 3D porosity or surveyed hydraulic area.
    for (let index = 0; index < OCEAN_PLANKTON_FACE_SAMPLE_COUNT; index++) {
      const offset = ((index + .5) / OCEAN_PLANKTON_FACE_SAMPLE_COUNT - .5) * OCEAN_CHUNK_SIZE;
      let top = -Infinity;
      for (const normal of [-.25, 0, .25]) {
        const px = x + (axis === 'x' ? normal : offset);
        const pz = z + (axis === 'z' ? normal : offset);
        top = Math.max(top, this._surface(px, pz, true));
      }
      if (Number.isFinite(top) && OCEAN_SURFACE_Y - top > OCEAN_PLANKTON_MINIMUM_WATER_COLUMN_M) open++;
    }
    const fraction = open / OCEAN_PLANKTON_FACE_SAMPLE_COUNT;
    this._planktonFaces.set(key, fraction);
    // Static generation permits bounded memoization across neighbouring
    // windows; no persistent world-size face inventory is retained.
    if (this._planktonFaces.size > 96) this._planktonFaces.delete(this._planktonFaces.keys().next().value);
    return fraction;
  }

  _transportPlankton(baseline = this._environment) {
    this._planktonLastStep = { lastStepSec: STEP, lastTransferredUnits: 0, lastBoundaryExportedUnits: 0, lastOverflowExportedUnits: 0 };
    if (typeof this.store.saveMany !== 'function') return;
    const blocked = new Set(this._lockedRegions);
    for (const region of this._active.values()) if (!this._usesPlanktonTransport(region)) blocked.add(region.id);
    // Retain the requested window even when a failed load clears _center to
    // allow retry. Missing intended neighbours remain closed, never oceanside
    // export sinks created by a storage failure or a partially loaded window.
    for (const id of this._planktonDesiredRegions) if (!this._active.has(id)) blocked.add(id);
    const regions = [...this._active.values()];
    const result = computeOceanPlanktonTransport(regions, {
      dt: STEP, cellSizeM: OCEAN_CHUNK_SIZE, lockedRegionIds: blocked,
      currentAt: (x, z) => this.environmentField.sample(x, z, baseline).currentVector,
      openFractionAt: face => this._planktonFaceOpenFraction(face),
    });
    const changes = new Map(regions.map(region => [region.id, { imported: 0, transferredOut: 0, boundaryExported: 0 }]));
    for (const flow of result.transfers) {
      changes.get(flow.fromId).transferredOut += flow.amount;
      changes.get(flow.toId).imported += flow.amount;
    }
    for (const flow of result.exports) changes.get(flow.fromId).boundaryExported += flow.amount;
    let overflowExported = 0;
    for (const region of regions) {
      if (blocked.has(region.id)) continue;
      const change = changes.get(region.id);
      const stock = region.resources.plankton - change.transferredOut - change.boundaryExported + change.imported;
      const overflow = Math.max(0, stock - 1);
      region.resources.plankton = Math.max(0, stock - overflow);
      if (change.imported > 0) region.ledger.transferredIn = (region.ledger.transferredIn ?? 0) + change.imported;
      if (change.transferredOut > 0) region.ledger.transferredOut = (region.ledger.transferredOut ?? 0) + change.transferredOut;
      region.ledger.exported += change.boundaryExported + overflow;
      if (this.livingNetworkEnabled) recordLivingFoodExchange(region, {
        imported: change.imported, transferredOut: change.transferredOut, exported: change.boundaryExported + overflow });
      const previous = region.planktonTransport;
      region.planktonTransport = {
        lastStepSec: STEP, lastImportedUnits: change.imported, lastTransferredOutUnits: change.transferredOut,
        lastBoundaryExportedUnits: change.boundaryExported, lastOverflowExportedUnits: overflow,
        cumulativeBoundaryExportedUnits: (previous?.cumulativeBoundaryExportedUnits ?? 0) + change.boundaryExported,
        cumulativeOverflowExportedUnits: (previous?.cumulativeOverflowExportedUnits ?? 0) + overflow,
      };
      overflowExported += overflow;
    }
    this._planktonLastStep = { lastStepSec: STEP, lastTransferredUnits: result.transferred,
      lastBoundaryExportedUnits: result.exported, lastOverflowExportedUnits: overflowExported };
  }

  _mantaY(x, z, depthM, sizeM) {
    // Finite footprint probes use the rendered support including coral. These
    // guard a wide representative, without claiming swept/body collision.
    const radius = sizeM * .5 + .2;
    let top = this._surface(x, z, true);
    for (let i = 0; i < 8; i++) {
      const angle = i * TAU / 8;
      top = Math.max(top, this._surface(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, true));
    }
    const low = top + 1.5, high = OCEAN_SURFACE_Y - 2;
    return low <= high ? clamp(OCEAN_SURFACE_Y - depthM, low, high) : null;
  }

  _mantaTarget(region, agent) {
    if (agent.roamingVersion >= 1) {
      const birthplace = { id: agent.birthRegionId };
      const period = 1100 + this._random(birthplace, `${agent.id}:roaming-period`) * 160;
      const phase = agent.roamingPhaseRad + (agent.mobileTimeSec - agent.roamingStartedAtSec + 6) * TAU / period;
      const x = agent.patrolHome.x + Math.cos(phase) * agent.roamingRadiusM;
      const z = agent.patrolHome.z + Math.sin(phase) * agent.roamingRadiusM;
      const y = this._mantaY(x, z, agent.preferredDepthM + Math.sin(phase) * .35, agent.sizeM);
      agent.target = y === null ? { ...agent.position } : { x, y, z };
      return agent.target;
    }
    const period = 200 + this._random(region, `${agent.id}:patrol-period`) * 40;
    const phase = agent.patrolPhaseRad + (region.timeSec - agent.patrolStartedAtSec + 6) * TAU / period;
    const x = agent.patrolHome.x + Math.cos(phase) * agent.orbitRadiusM;
    const z = agent.patrolHome.z + Math.sin(phase) * agent.orbitRadiusM;
    const depthM = agent.preferredDepthM + Math.sin(phase) * .35;
    const y = this._mantaY(x, z, depthM, agent.sizeM);
    agent.target = y === null ? { ...agent.position } : { x, y, z };
    return agent.target;
  }

  _moveManta(agent, target, dt) {
    if (agent.roamingVersion >= 1 && typeof this.store.saveMany === 'function') {
      this._moveRoamingManta(agent, target, dt);
      return;
    }
    const previous = { ...agent.position };
    const delta = { x: target.x - previous.x, y: target.y - previous.y, z: target.z - previous.z };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (length < .000001) { agent.velocity = { x: 0, y: 0, z: 0 }; return; }
    const step = Math.min(length, .5 * dt), radius = agent.sizeM * .5 + .2;
    const owner = this._active.get(agent.regionId), bounds = this.generator.chunk(owner.cx, owner.cz).bounds;
    const mobile = agent.roamingVersion >= 1;
    const x = mobile ? previous.x + delta.x / length * step : clamp(previous.x + delta.x / length * step, bounds.minX + radius, bounds.maxX - radius);
    const z = mobile ? previous.z + delta.z / length * step : clamp(previous.z + delta.z / length * step, bounds.minZ + radius, bounds.maxZ - radius);
    const requestedY = previous.y + delta.y / length * step;
    const y = this._mantaY(x, z, OCEAN_SURFACE_Y - requestedY, agent.sizeM);
    if (y === null || (!this.livingNetworkEnabled && Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + radius + 1)) {
      agent.velocity = { x: 0, y: 0, z: 0 }; return;
    }
    // A new support probe may require a large upward lift. Block the mobile
    // step rather than snapping a three-metre animal onto the raised surface.
    if (mobile && Math.hypot(x - previous.x, y - previous.y, z - previous.z) > step + 1e-8) {
      agent.velocity = { x: 0, y: 0, z: 0 }; return;
    }
    const destinationId = `${Math.floor(x / OCEAN_CHUNK_SIZE)},${Math.floor(z / OCEAN_CHUNK_SIZE)}`;
    if (mobile && destinationId !== agent.regionId) {
      const destination = this._active.get(destinationId);
      if (typeof this.store.saveMany !== 'function' || !destination || this._lockedRegions.has(destinationId) || this._residentCount(destination) >= OCEAN_REGION_AGENT_LIMIT) {
        agent.velocity = { x: 0, y: 0, z: 0 }; return;
      }
      this._transfers.push({ agent, owner, destination, position: { x, y, z }, previous, dt });
      return;
    }
    agent.position = { x, y, z };
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > .00001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _mantaCandidate(agent, requested, budget) {
    // Pure, bounded reference-point check: lookahead never queues ownership or
    // spends a tick. The actual step is checked separately before publication.
    const owner = this._active.get(agent.regionId);
    if (!owner || this._lockedRegions.has(owner.id) || !Object.values(requested).every(Number.isFinite)) return null;
    const radius = agent.sizeM * .5 + .2;
    const { x, z } = requested;
    const y = this._mantaY(x, z, OCEAN_SURFACE_Y - requested.y, agent.sizeM);
    if (y === null || (!this.livingNetworkEnabled && Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + radius + 1) ||
      distance(agent.position, { x, y, z }) > budget + 1e-8) return null;
    const id = `${Math.floor(x / OCEAN_CHUNK_SIZE)},${Math.floor(z / OCEAN_CHUNK_SIZE)}`;
    const destination = this._active.get(id);
    if (id !== owner.id && (typeof this.store.saveMany !== 'function' || !destination ||
      this._lockedRegions.has(id) || this._residentCount(destination) >= OCEAN_REGION_AGENT_LIMIT)) return null;
    return { position: { x, y, z }, owner, destination };
  }

  _moveRoamingManta(agent, target, dt) {
    const previous = { ...agent.position };
    const delta = { x: target.x - previous.x, y: target.y - previous.y, z: target.z - previous.z };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    const held = agent.avoidance && agent.mobileTimeSec < agent.avoidance.untilSec;
    const stationaryTarget = length < .000001;
    if (stationaryTarget && !held) { agent.velocity = { x: 0, y: 0, z: 0 }; return; }
    // An unavailable distant patrol probe does not cancel a still-valid local
    // turn. Its next actual footprint remains subject to the same checks.
    const step = stationaryTarget ? .5 * dt : Math.min(length, .5 * dt);
    const vertical = stationaryTarget ? 0 : delta.y / length;
    const horizontal = stationaryTarget ? 1 : Math.hypot(delta.x, delta.z) / length;
    const intendedHeading = stationaryTarget ? agent.avoidance.headingRad : Math.atan2(delta.z, delta.x);
    const heading = held ? agent.avoidance.headingRad : intendedHeading;
    const requested = (angle, metres) => ({ x: previous.x + Math.cos(angle) * horizontal * metres,
      y: previous.y + vertical * metres, z: previous.z + Math.sin(angle) * horizontal * metres });
    let candidate = this._mantaCandidate(agent, requested(heading, step), step);
    if (!candidate) {
      const preference = this._random({ id: agent.birthRegionId }, `${agent.id}:avoidance-side`) < .5 ? 1 : -1;
      const offsets = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2,
        Math.PI * .75, -Math.PI * .75, Math.PI];
      // Prefer a little free water ahead, but a distant obstacle must not veto
      // a safe immediate step. Fixed angle order is independent of Map order.
      for (const lookahead of [true, false]) {
        for (const offset of offsets) {
          const angle = intendedHeading + offset * preference;
          if (lookahead && [1.5, 3].some(metres => !this._mantaCandidate(agent, requested(angle, metres), metres))) continue;
          candidate = this._mantaCandidate(agent, requested(angle, step), step);
          if (!candidate) continue;
          agent.avoidance = { headingRad: angle, untilSec: agent.mobileTimeSec + 12 };
          break;
        }
        if (candidate) break;
      }
    } else if (!held && agent.avoidance) delete agent.avoidance;
    if (!candidate) { agent.velocity = { x: 0, y: 0, z: 0 }; return; }
    if (candidate.destination !== candidate.owner) {
      this._transfers.push({ agent, ...candidate, previous, dt });
      return;
    }
    agent.position = candidate.position;
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > .00001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _applyMantaTransfers() {
    // All regional ticks finish before changing arrays: every individual gets
    // exactly one tick, even when the receiving region appears later in the Map.
    for (const { agent, owner, destination, position, previous, dt } of this._transfers.sort((a, b) => a.agent.id.localeCompare(b.agent.id))) {
      if (typeof this.store.saveMany !== 'function' || !agent.alive || this._active.get(owner.id) !== owner || this._active.get(destination.id) !== destination ||
        this._lockedRegions.has(owner.id) || this._lockedRegions.has(destination.id) ||
        this._residentCount(destination) >= OCEAN_REGION_AGENT_LIMIT || !owner.agents.includes(agent)) {
        agent.velocity = { x: 0, y: 0, z: 0 }; continue;
      }
      owner.agents.splice(owner.agents.indexOf(agent), 1);
      destination.agents.push(agent);
      if (this.livingNetworkEnabled) recordLivingTransfer(owner, destination, agent.organicUnits);
      agent.regionId = destination.id;
      agent.position = position;
      for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (position[axis] - previous[axis]) / dt;
      agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
      agent.crossings = (agent.crossings ?? 0) + 1;
      if (agent.speciesId === 'yellowtail-fusilier') {
        owner.pelagicEverOccupied = destination.pelagicEverOccupied = true;
        this._emit(owner, 'departure', agent, '黄尾乌尾鮗游向相邻海域');
        this._emit(destination, 'arrival', agent, '黄尾乌尾鮗从相邻海域游入');
      } else {
        owner.mantaEverOccupied = destination.mantaEverOccupied = true;
        this._emit(owner, 'departure', agent, '礁蝠鲼游向相邻海域');
        this._emit(destination, 'arrival', agent, '礁蝠鲼从相邻海域游入');
      }
    }
    this._transfers.length = 0;
  }

  _pelagicTarget(region, agent, lowLight) {
    if (this._pelagicMobile(agent)) return this._roamingPelagicTarget(agent, lowLight);
    // The shared regional clock moves a small local school through open water.
    // No observer position, new random decision or hidden global population.
    const period = 180 + this._random(region, `${agent.groupId}:patrol-period`) * 40;
    const phase = agent.schoolPhaseRad + region.timeSec * TAU / period;
    const radius = agent.orbitRadiusM;
    const slotAngle = agent.schoolSlot * TAU / 8;
    const home = agent.schoolHome;
    const chunk = this.generator.chunk(region.cx, region.cz);
    const x = clamp(home.x + Math.cos(phase) * radius + Math.cos(slotAngle) * .9,
      chunk.bounds.minX + .5, chunk.bounds.maxX - .5);
    const z = clamp(home.z + Math.sin(phase) * radius * .65 + Math.sin(slotAngle) * .9,
      chunk.bounds.minZ + .5, chunk.bounds.maxZ - .5);
    const depth = agent.preferredDepthM + Math.sin(phase) * (lowLight ? .1 : .4);
    agent.target = { x, y: this._pelagicY(x, z, depth), z };
    return agent.target;
  }

  _pelagicRouteSite(agent, x, z, depthM) {
    const id = `${Math.floor(x / OCEAN_CHUNK_SIZE)},${Math.floor(z / OCEAN_CHUNK_SIZE)}`;
    const destination = this._active.get(id);
    if (!destination || this._lockedRegions.has(id) || (!this.livingNetworkEnabled && Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + 1)) return null;
    const column = OCEAN_SURFACE_Y - this._bed(x, z), top = this._surface(x, z, true);
    if (!Number.isFinite(column) || column < 12 || column > 35 || OCEAN_SURFACE_Y - top < 8) return null;
    const frame = this._pelagicFrames.get(agent.groupId);
    const arriving = frame ? frame.members.filter(member => member.regionId !== id).length : agent.regionId === id ? 0 : 1;
    if (this._residentCount(destination) + arriving > OCEAN_REGION_AGENT_LIMIT) return null;
    const y = this._pelagicY(x, z, depthM);
    return Number.isFinite(y) && y <= OCEAN_SURFACE_Y - 1.5 && y >= top + 1 ? { x, y, z } : null;
  }

  _roamingPelagicTarget(agent, lowLight) {
    const phase = agent.roamingSchoolPhaseRad + (agent.mobileTimeSec - agent.roamingSchoolStartedAtSec) * TAU / agent.roamingSchoolPeriodSec;
    const home = agent.roamingSchoolHome;
    const x = home.x + Math.cos(phase) * agent.roamingSchoolRadiusM;
    const z = home.z + Math.sin(phase) * agent.roamingSchoolRadiusM * .65;
    const depth = agent.preferredDepthM + Math.sin(phase) * (lowLight ? .1 : .4);
    let site = this._pelagicRouteSite(agent, x, z, depth);
    if (!site) {
      // The route is only a qualitative intention. Finite local alternatives
      // turn through loaded, suitable water rather than pinning to an owner
      // seam or requesting an offscreen population to evolve.
      const center = this._pelagicFrames.get(agent.groupId)?.centroid ?? agent.position;
      const heading = Math.atan2(z - center.z, x - center.x);
      const side = this._random({ id: agent.birthRegionId }, `${agent.groupId}:roaming-side`) < .5 ? 1 : -1;
      for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
        site = this._pelagicRouteSite(agent, center.x + Math.cos(heading + offset * side) * 8,
          center.z + Math.sin(heading + offset * side) * 8, depth);
        if (site) break;
      }
    }
    if (!site) site = { ...agent.position };
    const slotAngle = agent.schoolSlot * TAU / 8;
    agent.target = { x: site.x + Math.cos(slotAngle) * .9, y: site.y, z: site.z + Math.sin(slotAngle) * .9 };
    return agent.target;
  }

  _pelagicCandidate(agent, requested, budget) {
    const owner = this._active.get(agent.regionId);
    if (!this._pelagicMobile(agent) || !owner || this._lockedRegions.has(owner.id) || !Object.values(requested).every(Number.isFinite)) return null;
    const { x, z } = requested, high = OCEAN_SURFACE_Y - 1.5;
    const low = this._surface(x, z, true) + 1;
    if (low > high || (!this.livingNetworkEnabled && Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + 1)) return null;
    const y = clamp(requested.y, low, high), position = { x, y, z };
    if (distance(agent.position, position) > budget + 1e-10) return null;
    const id = `${Math.floor(x / OCEAN_CHUNK_SIZE)},${Math.floor(z / OCEAN_CHUNK_SIZE)}`;
    const destination = this._active.get(id);
    if (!destination || this._lockedRegions.has(id) || (id !== owner.id && this._residentCount(destination) >= OCEAN_REGION_AGENT_LIMIT)) return null;
    for (const fraction of [.25, .5, .75, 1]) {
      const px = agent.position.x + (x - agent.position.x) * fraction;
      const pz = agent.position.z + (z - agent.position.z) * fraction;
      const py = agent.position.y + (y - agent.position.y) * fraction;
      const column = OCEAN_SURFACE_Y - this._bed(px, pz);
      if (column < 12 || column > 35 || py < this._surface(px, pz, true) + 1 - 1e-10 || py > high + 1e-10 ||
        (!this.livingNetworkEnabled && Math.hypot(px, pz) <= OCEAN_AUTHORED_RADIUS + 1)) return null;
    }
    return { position, owner, destination };
  }

  _moveRoamingPelagic(agent, target, speed, dt, currentVector = { x: 0, z: 0 }) {
    const previous = { ...agent.position };
    const delta = { x: target.x - previous.x, y: target.y - previous.y, z: target.z - previous.z };
    const length = Math.hypot(delta.x, delta.y, delta.z), step = Math.min(length, speed * dt);
    const drift = { x: currentVector.x * .04 * dt, z: currentVector.z * .04 * dt };
    const budget = speed * dt + Math.hypot(drift.x, drift.z);
    const vertical = length > 1e-8 ? delta.y / length : 0;
    const horizontal = length > 1e-8 ? Math.hypot(delta.x, delta.z) / length : 1;
    const intended = length > 1e-8 ? Math.atan2(delta.z, delta.x) : agent.heading;
    const held = agent.schoolAvoidance && agent.mobileTimeSec < agent.schoolAvoidance.untilSec;
    const heading = held ? agent.schoolAvoidance.headingRad : intended;
    const requested = (angle, fraction = 1, metres = step) => ({
      x: previous.x + (Math.cos(angle) * horizontal * metres + drift.x) * fraction,
      y: previous.y + vertical * metres * fraction,
      z: previous.z + (Math.sin(angle) * horizontal * metres + drift.z) * fraction,
    });
    let candidate = this._pelagicCandidate(agent, requested(heading), budget);
    if (!candidate) {
      const side = this._random({ id: agent.birthRegionId }, `${agent.groupId}:roaming-side`) < .5 ? 1 : -1;
      for (const lookahead of [true, false]) {
        for (const offset of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
          const angle = intended + offset * side;
          if (lookahead && !this._pelagicCandidate(agent, requested(angle, 1, 1.5), 1.5 + Math.hypot(drift.x, drift.z))) continue;
          candidate = this._pelagicCandidate(agent, requested(angle), budget);
          if (!candidate) continue;
          agent.schoolAvoidance = { headingRad: angle, untilSec: agent.mobileTimeSec + 6 };
          break;
        }
        if (candidate) break;
      }
      if (!candidate) for (const fraction of [.5, .25, .125, .0625, .03125]) {
        candidate = this._pelagicCandidate(agent, requested(heading, fraction), budget);
        if (candidate) break;
      }
    } else if (!held && agent.schoolAvoidance) delete agent.schoolAvoidance;
    if (!candidate) {
      // Historical intrusions recover vertically within the same budget,
      // rather than reanchoring a saved swimmer or teleporting onto a rock.
      const low = this._surface(previous.x, previous.z, true) + 1;
      if (previous.y < low && low <= OCEAN_SURFACE_Y - 1.5) {
        candidate = { position: { ...previous, y: Math.min(low, previous.y + budget) },
          owner: this._active.get(agent.regionId), destination: this._active.get(agent.regionId) };
      }
    }
    if (!candidate || !candidate.owner || this._lockedRegions.has(candidate.owner.id)) { agent.velocity = { x: 0, y: 0, z: 0 }; return; }
    if (candidate.destination !== candidate.owner) { this._transfers.push({ agent, ...candidate, previous, dt }); return; }
    agent.position = candidate.position;
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > .00001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _legacySurface(x, z, fish, cells) {
    // Used only once while migrating old saved coordinates. New placement and
    // movement always use the shared mesh; this does not restore old geometry.
    const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE), key = `${cx},${cz}`;
    let features = cells.get(key);
    if (!features) {
      const elements = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        elements.push(...this.generator.chunk(cx + dx, cz + dz).elements.filter(element => element.kind === 'rock' || element.kind === 'coral'));
      }
      const rocks = new Map(elements.filter(element => element.kind === 'rock').map(element => [element.id, element]));
      const ellipsoidHeight = (rock, wx, wz) => {
        const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
        const rx = wx - rock.x, rz = wz - rock.z;
        const radius = ((rx * cos - rz * sin) * 2 / rock.scale.x) ** 2 + ((rx * sin + rz * cos) * 2 / rock.scale.z) ** 2;
        return rock.y + rock.scale.y * Math.sqrt(Math.max(0, 1 - radius));
      };
      features = elements.map(element => {
        const host = element.kind === 'coral' ? rocks.get(element.attachmentId) : null;
        return { element, y: host ? ellipsoidHeight(host, element.x, element.z) : element.y,
          cos: Math.cos(element.rotation), sin: Math.sin(element.rotation),
          inverseX: 2 / element.scale.x, inverseZ: 2 / element.scale.z };
      });
      cells.set(key, features);
    }
    let height = this.generator.sample(x, z).floorY;
    for (const { element, y, cos, sin, inverseX, inverseZ } of features) {
      if (element.kind === 'coral' && !fish) continue;
      const wx = x - element.x, wz = z - element.z;
      const radius = ((wx * cos - wz * sin) * inverseX) ** 2 + ((wx * sin + wz * cos) * inverseZ) ** 2;
      if (radius <= 1) height = Math.max(height, y + element.scale.y * (element.kind === 'rock' ? Math.sqrt(Math.max(0, 1 - radius)) : 1));
    }
    return height;
  }

  _reanchorRegion(region) {
    if (region.surfaceVersion >= OCEAN_ROCK_SURFACE_VERSION) return false;
    const legacyCells = new Map();
    for (const agent of region.agents) {
      const fish = speciesById[agent.speciesId]?.kind === 'fish';
      for (const name of ['position', 'home', 'target', 'refuge']) {
        const point = agent[name];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
        // Finish the old rock-surface migration independently of later additions.
        const surface = this._surface(point.x, point.z, fish, false, false);
        if (fish) {
          const previous = this._legacySurface(point.x, point.z, true, legacyCells);
          const clearance = Number.isFinite(point.y) ? point.y - previous : agent.supportOffset;
          point.y = Math.max(surface + .08, Math.min(OCEAN_SURFACE_Y - .6,
            surface + Math.max(.08, Number.isFinite(clearance) ? clearance : .08)));
        } else {
          const offset = Number.isFinite(agent.supportOffset) ? agent.supportOffset : .004;
          point.y = surface + offset;
        }
      }
    }
    // No biological fields are changed, including for dead individuals.
    region.surfaceVersion = OCEAN_ROCK_SURFACE_VERSION;
    return true;
  }

  _reanchorFormations(region) {
    const nextVersion = this.generator.chunk(region.cx, region.cz).formationsVersion || 0;
    if (!nextVersion || region.formationsVersion >= nextVersion) return false;
    for (const agent of region.agents) {
      const fish = speciesById[agent.speciesId]?.kind === 'fish';
      const clearance = Math.max(fish ? .08 : .004,
        Number.isFinite(agent.supportOffset) ? agent.supportOffset : fish ? .08 : .004);
      for (const name of ['position', 'home', 'target', 'refuge']) {
        const point = agent[name];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
        const previous = this._surface(point.x, point.z, fish, false);
        const current = this._surface(point.x, point.z, fish, true);
        // Never move an unaffected point or an animal already above the addition.
        if (current > previous + 1e-9 && point.y < current + clearance) point.y = current + clearance;
      }
    }
    // Persist the geometry marker with the necessary Y changes, without altering
    // identities, X/Z, velocities, deaths, clocks, food or historical behavior.
    region.formationsVersion = nextVersion;
    return true;
  }

  _reanchorFloor(region) {
    const version = this.generator.floorSurfaceVersion || 0;
    if (!version || region.floorSurfaceVersion >= version) return false;
    for (const agent of region.agents) {
      const fish = speciesById[agent.speciesId]?.kind === 'fish';
      const swimming = fish || speciesById[agent.speciesId]?.kind === 'ray';
      for (const name of ['position', 'home', 'target', 'refuge']) {
        const point = agent[name];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) continue;
        const before = this._surface(point.x, point.z, swimming, true, false);
        const after = this._surface(point.x, point.z, swimming);
        if (swimming) point.y += after - before;
        else point.y = after + (Number.isFinite(agent.supportOffset) ? agent.supportOffset : .004);
      }
    }
    // A geometric correction only: XZ, IDs, deaths, clocks and food survive.
    region.floorSurfaceVersion = version;
    return true;
  }

  _enqueue(operation) {
    const result = this._queue.then(operation);
    // Storage failure is recorded and cannot poison subsequent transitions.
    this._queue = result.catch(error => { this._storageError = String(error?.message || error); });
    return result;
  }

  async _storage(method, ...args) {
    try { return await this.store[method](...args); }
    catch (error) {
      this._counts.persistenceErrors++;
      this._storageError = String(error?.message || error);
      return null;
    }
  }

  async _saveRecords(world, records) {
    if (!records.length) return;
    if (typeof this.store.saveMany === 'function') {
      const errorsBefore = this._counts.persistenceErrors;
      const result = await this._storage('saveMany', world, records);
      if (result !== null) this._counts.saved += records.length;
      else if (this._counts.persistenceErrors === errorsBefore) {
        this._counts.persistenceErrors++;
        this._storageError = 'Atomic regional save did not commit.';
      }
      return result;
    }
    // Backward-compatible local patrols have no transfers to persist.
    for (const [id, state] of records) {
      const result = await this._storage('save', world, id, state);
      if (result !== null) this._counts.saved++;
    }
  }

  update(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) throw new RangeError('Exploration coordinates must be finite.');
    if (this._disposed) return Promise.resolve();
    const cx = Math.floor(position.x / OCEAN_CHUNK_SIZE), cz = Math.floor(position.z / OCEAN_CHUNK_SIZE);
    if (this._center?.cx === cx && this._center?.cz === cz) return this._pending;
    this._center = { cx, cz };
    this._planktonDesiredRegions.clear();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this._planktonDesiredRegions.add(`${cx + dx},${cz + dz}`);
    const generation = this._generation, revision = ++this._revision, world = this._world;
    this._pending = this._enqueue(async () => {
      const current = () => !this._disposed && generation === this._generation && revision === this._revision;
      if (!current()) return;
      const desired = new Map();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) desired.set(`${cx + dx},${cz + dz}`, [cx + dx, cz + dz]);
      const prefetched = new Map();
      const supportHaloIds = new Set();
      if (this.livingGeologyEnabled) {
        // Read the complete support halo before changing its source. A failed
        // read never means virgin terrain, and old records without a plan
        // retain their exact original floor, hosts and attachments.
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const id = `${cx + dx},${cz + dz}`, errorsBefore = this._counts.persistenceErrors;
          supportHaloIds.add(id);
          const saved = this._active.get(id) ?? await this._storage('load', world, id);
          if (!current()) return;
          if (this._counts.persistenceErrors > errorsBefore) { this._center = null; return false; }
          if ((this.shallowSeascapeEnabled || this.biodiversityEnabled || this.benthicLifeEnabled) && saved === undefined) {
            this._storageError = 'A shallow seascape owner read returned no persistence result.';
            this._counts.persistenceErrors++; this._center = null; return false;
          }
          if (saved && Object.hasOwn(saved, 'livingRidgePlan') &&
              (!validateLivingRidgePlan(saved.livingRidgePlan, this.generator) || saved.livingRidgePlan.id !== id)) {
            this._center = null;
            throw new Error('Invalid saved ridge-gully plan; original terrain and population were not regenerated.');
          }
          if (this.shallowSeascapeEnabled && shallowSeascapeMarked(saved) &&
              !SHALLOW_SEASCAPE_OWNERS.includes(id)) {
            this._center = null;
            throw new Error('Invalid saved shallow seascape owner outside the admitted sample.');
          }
          prefetched.set(id, saved);
        }
      }
      const shallowCandidate = this.shallowSeascapeEnabled && SHALLOW_SEASCAPE_OWNERS.some(id => desired.has(id));
      if (this.shallowSeascapeEnabled && (shallowCandidate ||
          [...prefetched.values()].some(shallowSeascapeMarked))) {
        // The public 5x5 support window and this one complete 6x2 group have
        // at most 37 distinct owners. Disk completeness is independent of the
        // smaller public registry and is checked before any source changes.
        for (const id of SHALLOW_SEASCAPE_OWNERS) if (!prefetched.has(id)) {
          const errorsBefore = this._counts.persistenceErrors;
          const saved = this._active.get(id) ?? await this._storage('load', world, id);
          if (!current()) return;
          if (this._counts.persistenceErrors > errorsBefore || saved === undefined) {
            if (saved === undefined) { this._counts.persistenceErrors++; this._storageError = 'A complete shallow seascape owner could not be read.'; }
            this._center = null; return false;
          }
          prefetched.set(id, saved);
        }
        const marked = SHALLOW_SEASCAPE_OWNERS.map(id => prefetched.get(id)).filter(shallowSeascapeMarked);
        if (marked.length) {
          const group = marked[0].livingRidgePlan?.group;
          const complete = marked.length === 12 && group?.cx === SHALLOW_SEASCAPE_ANCHOR.cx && group?.cz === SHALLOW_SEASCAPE_ANCHOR.cz &&
            JSON.stringify(group.ownerIds) === JSON.stringify(SHALLOW_SEASCAPE_OWNERS) &&
            SHALLOW_SEASCAPE_OWNERS.every(id => {
              const row = prefetched.get(id), plan = row?.livingRidgePlan;
              return row?.version === VERSION && row.id === id && row.cx === plan?.cx && row.cz === plan?.cz &&
                Number.isInteger(row.ticks) && row.ticks >= 0 && Number.isFinite(row.timeSec) &&
                Math.abs(row.timeSec - row.ticks * STEP) < 1e-8 &&
                row.shallowSeascapeVersion === 1 && row.shallowSeascapeGroupId === `${group.cx},${group.cz}` &&
                row.shallowSeascapeInitializedAtSec === 0 &&
                plan?.version === 6 && plan.id === id && JSON.stringify(plan.group) === JSON.stringify(group) &&
                validateLivingRidgePlan(plan, this.generator) && validateLivingNetworkRecord(row) &&
                this._residentCount(row) <= OCEAN_REGION_AGENT_LIMIT;
            });
          if (!complete) { this._center = null; throw new Error('Incomplete saved shallow seascape group; historical terrain and populations were not regenerated.'); }
        }
      }
      if (typeof this.store.saveMany === 'function') {
        const exits = [...this._active.keys()].filter(id => !desired.has(id));
        for (const id of exits) this._lockedRegions.add(id);
        try {
          if (exits.length) {
            // One coherent ownership snapshot. Exiting records freeze until
            // commit; remaining cells can tick but cannot enter those exits.
            const result = await this._saveRecords(world, [...this._active].map(([id, region]) => [id, clone(region)]));
            if (!current()) return;
            if (result === null) { this._center = null; return false; }
            for (const id of exits) { this._active.delete(id); this._sceneSupports.delete(id); this._habitatSupports.delete(id); if (this._macroSupports.delete(id)) this._macroRevision++; this._counts.unloaded++; }
          }
        } finally { for (const id of exits) this._lockedRegions.delete(id); }
      }
      for (const [id, region] of this._active) {
        if (desired.has(id)) continue;
        this._active.delete(id);
        this._sceneSupports.delete(id);
        this._habitatSupports.delete(id);
        if (this._macroSupports.delete(id)) this._macroRevision++;
        await this._storage('save', world, id, clone(region));
        this._counts.saved++; this._counts.unloaded++;
        if (!current()) return;
      }
      if (this.livingGeologyEnabled) {
        if (this.shallowSeascapeEnabled) {
          const savedHalo = [...prefetched].filter(([id, saved]) => supportHaloIds.has(id) && saved);
          this.generator.replaceRidgeOwners(savedHalo.filter(([, row]) => row.livingRidgePlan).map(([, row]) => row.livingRidgePlan),
            savedHalo.filter(([, row]) => !row.livingRidgePlan).map(([id]) => id));
        } else {
          this.generator.retainRidgeOwners(prefetched.keys());
          for (const [id, saved] of prefetched) if (saved) {
            if (saved.livingRidgePlan) this.generator.registerRidgePlan(saved.livingRidgePlan);
            else this.generator.registerLegacyRidgeOwner(id);
          }
        }
        this._supportCells.clear();
      }
      // Validate every saved support owner before admitting new neighbours.
      for (const [id, saved] of prefetched) if (saved && (['biodiversityVersion', 'biodiversityInitializedAtSec', 'biodiversity'].some(key => Object.hasOwn(saved, key)) || saved.agents?.some(isOceanBiodiversityAgent))) {
        if (!validateOceanBiodiversityRecord(saved, this.generator, {
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
          bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })) {
          this._center = null; throw new Error(`Invalid saved biodiversity owner ${id}; historical community was not regenerated.`);
        }
      }
      for (const [id, saved] of prefetched) if (saved && (['benthicLifeVersion', 'benthicLifeInitializedAtSec', 'benthicLife'].some(key => Object.hasOwn(saved, key)) || saved.agents?.some(agent => isOceanBenthicLifeAgent(agent) || (agent && ['benthicLifeIndividualVersion', 'benthicLifeSiteId', 'benthicLifeHostId', 'benthicLifeMode'].some(key => Object.hasOwn(agent, key)))))) {
        if (!validateOceanBenthicLifeRecord(saved, this.generator, {
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
          bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })) {
          this._center = null; throw new Error(`Invalid saved benthic-life owner ${id}; historical community was not regenerated.`);
        }
      }
      const prepareRegion = (saved, coordinates, valid) => {
        const previousBirthView = this._biodiversityBirthView;
        const diverseFresh = this.biodiversityEnabled && !valid && saved === null;
        const benthicFresh = this.benthicLifeEnabled && !valid && saved === null;
        if (diverseFresh) {
          const stub = { id: coordinates.join(','), cx: coordinates[0], cz: coordinates[1], agents: [], timeSec: 0 };
          this._biodiversityBirthView = createOceanBiodiversityPlan(this.generator, stub, {
            random: salt => this._random(stub, salt), surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
            bed: (x, z) => this._bed(x, z), availableSlots: 0 }).patches;
        }
        try {
        const region = valid ? saved : this._createRegion(...coordinates);
        const reanchored = valid && this._reanchorRegion(region);
        const formationsReanchored = valid && this._reanchorFormations(region);
        const floorReanchored = valid && this._reanchorFloor(region);
        const supplemented = valid && this._supplementRegion(region);
        const slopeCandidate = !(region.slopeCommunityVersion >= OCEAN_SLOPE_COMMUNITY_VERSION) &&
          this.generator.chunk(...coordinates).elements.some(element => element.kind === 'formation');
        const newCommunityCandidate = slopeCandidate || !(region.pelagicCommunityVersion >= OCEAN_PELAGIC_COMMUNITY_VERSION) ||
          !(region.mantaCommunityVersion >= OCEAN_MANTA_COMMUNITY_VERSION);
        const beforeCommunity = newCommunityCandidate ? clone(region) : null;
        const slopeSupplemented = slopeCandidate && this._supplementSlopeRegion(region);
        const pelagicSupplemented = this._supplementPelagicRegion(region);
        const mantaSupplemented = this._supplementMantaRegion(region);
        const beforeMobility = clone(region);
        const mantaMobilityUpgraded = this._upgradeMantaMobility(region);
        const pelagicMobilityUpgraded = this._upgradePelagicMobility(region);
        const mobilityUpgraded = mantaMobilityUpgraded || pelagicMobilityUpgraded;
        const beforeTransport = clone(region);
        const transportUpgraded = this._upgradePlanktonTransport(region);
        const turtleSupplemented = this._supplementTurtleRegion(region);
        const sceneSupplemented = this._supplementSceneElementsRegion(region);
        const habitatSupplemented = this._supplementHabitatScene(region);
        const macroSupplemented = this._supplementMacroLandscape(region);
        const networkInitialized = this.livingNetworkEnabled && initializeLivingNetwork(region, this.generator.chunk(...coordinates));
        const guildInitialized = this.livingNetworkEnabled && typeof this.store.saveMany === 'function' && initializeReefGuild(region, this.generator,
          { random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral), bed: (x, z) => this._bed(x, z), capacity: this._initialAnimalCapacity(region) });
        const openWaterInitialized = this.livingNetworkEnabled && typeof this.store.saveMany === 'function' && initializeOpenWaterLife(region, this.generator,
          { random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral), capacity: this._initialAnimalCapacity(region) });
        const biodiversityInitialized = diverseFresh && initializeOceanBiodiversity(region, this.generator, {
          fresh: true, random: salt => this._random(region, salt),
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
          bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT - (benthicFresh ? 4 : 0), maxAdded: 6 });
        const benthicLifeInitialized = benthicFresh && initializeOceanBenthicLife(region, this.generator, {
          fresh: true, random: salt => this._random(region, salt),
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
          bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT, maxAdded: 4 });
        this._biodiversityBirths.delete(region);
        this._benthicLifeBirths.delete(region);
        if (benthicLifeInitialized && (!validateLivingNetworkRecord(region) || !validateOceanBenthicLifeRecord(region, this.generator, {
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false), bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })))
          throw new Error('Invalid fresh benthic-life community; no original population was regenerated.');
        if (biodiversityInitialized && (!validateLivingNetworkRecord(region) || !validateOceanBiodiversityRecord(region, this.generator, {
          surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false), bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })))
          throw new Error('Invalid fresh biodiversity community; no original population was regenerated.');
        const turtleOrganicInitialized = this.turtleGrazingEnabled && region.turtleAgents?.length > 0 && initializeLivingTurtleOrganic(region);
        const turtleGrazingInitialized = this.turtleGrazingEnabled && region.turtleAgents?.length > 0 && initializeOceanTurtleGrazing(region, this.generator,
          { surface: (x, z) => this._surface(x, z, true) });
        if ((turtleOrganicInitialized || turtleGrazingInitialized) && (!validateLivingNetworkRecord(region) ||
          !validateOceanTurtleGrazingRecord(region, this.generator, { surface: (x, z) => this._surface(x, z, true) })))
          throw new Error('Invalid grass-bed turtle feeding admission; original population was not regenerated.');
        return { region, reanchored, formationsReanchored, floorReanchored, supplemented,
          beforeCommunity, slopeSupplemented, pelagicSupplemented, mantaSupplemented,
          beforeMobility, mobilityUpgraded, beforeTransport, transportUpgraded,
          turtleSupplemented, sceneSupplemented, habitatSupplemented, macroSupplemented,
          networkInitialized, guildInitialized, openWaterInitialized, biodiversityInitialized, benthicLifeInitialized, turtleOrganicInitialized, turtleGrazingInitialized };
        } finally { this._biodiversityBirthView = previousBirthView; }
      };
      if (shallowCandidate && SHALLOW_SEASCAPE_OWNERS.every(id => prefetched.get(id) === null)) {
        try {
          let plans;
          try { plans = createLivingShallowSeascapePlans(this.generator.baseGenerator, SHALLOW_SEASCAPE_ANCHOR.cx, SHALLOW_SEASCAPE_ANCHOR.cz); }
          catch (error) { if (!(error instanceof RangeError)) throw error; }
          if (plans) {
            let births;
            this._supportCells.clear();
            try {
              births = this.generator.withShallowSeascapePlans(plans, () => plans.map(plan => {
                const { region } = prepareRegion(null, [plan.cx, plan.cz], false);
                region.livingRidgePlan = clone(plan);
                region.shallowSeascapeVersion = 1; region.shallowSeascapeGroupId = `${plan.group.cx},${plan.group.cz}`;
                region.shallowSeascapeInitializedAtSec = 0;
                if (!SHALLOW_SEASCAPE_OWNERS.includes(region.id) || !validateLivingNetworkRecord(region) ||
                    this._residentCount(region) > OCEAN_REGION_AGENT_LIMIT) throw new Error('Invalid fresh whole-shallow ecological network.');
                return region;
              }));
            } finally { this._supportCells.clear(); }
            if (!current()) return;
            const result = await this._saveRecords(world, births.map(region => [region.id, clone(region)]));
            if (result === null) { this._center = null; return false; }
            if (!current()) return;
            for (const region of births) prefetched.set(region.id, region);
            const savedHalo = [...prefetched].filter(([id, saved]) => supportHaloIds.has(id) && saved);
            this.generator.replaceRidgeOwners(savedHalo.filter(([, row]) => row.livingRidgePlan).map(([, row]) => row.livingRidgePlan),
              savedHalo.filter(([, row]) => !row.livingRidgePlan).map(([id]) => id));
            this._supportCells.clear();
            for (const region of births) if (desired.has(region.id)) {
              this._active.set(region.id, region);
              if (region.sceneElementsVersion === 1) this._sceneSupports.set(region.id, region.sceneElements);
              if (region.habitatSceneVersion === 1) this._habitatSupports.set(region.id, region.habitatSceneElements);
              if (region.macroLandscapeVersion >= 1) this._registerMacroSupport(region);
            }
            this._counts.generated += births.length;
          }
        } catch (error) { this._supportCells.clear(); if (current()) this._center = null; throw error; }
      }
      if (this.livingGeologyEnabled && (this.seascapeEnabled || this.livingBeltEnabled) &&
          typeof this.generator.withRidgePlans === 'function' && typeof this.generator.registerRidgePlans === 'function') {
        const groups = new Map();
        for (const coordinates of desired.values()) {
          const gx = Math.floor(coordinates[0] / 2) * 2, gz = Math.floor(coordinates[1] / 2) * 2;
          groups.set(`${gx},${gz}`, [gx, gz]);
        }
        try {
        for (const [gx, gz] of groups.values()) {
          const ownerIds = [0, 1].flatMap(dz => [0, 1].map(dx => `${gx + dx},${gz + dz}`));
          // A group may cross the active window, but its complete four owners
          // are in the read halo. Any saved member keeps the whole group on
          // the existing per-owner path, with no historical floor upgrade.
          if (!ownerIds.every(id => prefetched.has(id) && prefetched.get(id) === null)) continue;
          let plans;
          if (this.livingBeltEnabled) {
            try { plans = createLivingHabitatBeltPlans(this.generator.baseGenerator, gx, gz); }
            catch (error) { if (!(error instanceof RangeError)) throw error; }
          }
          if (!plans && this.seascapeEnabled) {
            try { plans = createLivingSeascapePlans(this.generator.baseGenerator, gx, gz); }
            catch (error) { if (!(error instanceof RangeError)) throw error; }
          }
          if (!plans) continue;
          const planVersion = plans[0]?.version;
          if (!Array.isArray(plans) || plans.length !== 4 || new Set(plans.map(plan => plan.id)).size !== 4 ||
              ![4, 5].includes(planVersion) || plans.some(plan => plan.version !== planVersion || plan.group?.cx !== gx || plan.group?.cz !== gz || !ownerIds.includes(plan.id) ||
                !Array.isArray(plan.group.ownerIds) || plan.group.ownerIds.length !== 4 || ownerIds.some(id => !plan.group.ownerIds.includes(id))))
            throw new TypeError('Invalid fresh living habitat group.');
          let births;
          this._supportCells.clear();
          try {
            births = this.generator.withRidgePlans(plans, () => plans.map(plan => {
              const { region } = prepareRegion(null, [plan.cx, plan.cz], false);
              region.livingRidgePlan = clone(plan);
              if (!validateLivingNetworkRecord(region) || this._residentCount(region) > OCEAN_REGION_AGENT_LIMIT)
                throw new Error('Invalid fresh seascape ecological network.');
              return region;
            }));
          } finally { this._supportCells.clear(); }
          if (!current()) return;
          // Four real populations, stocks and their shared floor sources form
          // one persistence boundary. The temporary view has already ended,
          // so no uncommitted floor or individual is public during this wait.
          const result = await this._saveRecords(world, births.map(region => [region.id, clone(region)]));
          if (result === null) { this._center = null; return false; }
          // A superseded transition still leaves a complete durable group.
          // Its next reader restores those records rather than rebirthing it.
          if (!current()) return;
          this.generator.registerRidgePlans(births.map(region => region.livingRidgePlan));
          this._supportCells.clear();
          for (const region of births) {
            prefetched.set(region.id, region);
            if (desired.has(region.id)) {
              this._active.set(region.id, region);
              if (region.sceneElementsVersion === 1) this._sceneSupports.set(region.id, region.sceneElements);
              if (region.habitatSceneVersion === 1) this._habitatSupports.set(region.id, region.habitatSceneElements);
              if (region.macroLandscapeVersion >= 1) this._registerMacroSupport(region);
            }
          }
          this._counts.generated += births.length;
        }
        } catch (error) {
          this._supportCells.clear();
          if (current()) this._center = null;
          throw error;
        }
      }
      for (const [id, coordinates] of desired) {
        if (this._active.has(id)) continue;
        const errorsBefore = this._counts.persistenceErrors;
        const saved = this.livingGeologyEnabled ? prefetched.get(id) : await this._storage('load', world, id);
        if (!current()) return;
        // A failed read is not an unvisited cell. Reinitializing a birth cell
        // could recreate an individual already saved in a different owner.
        if (typeof this.store.saveMany === 'function' && this._counts.persistenceErrors > errorsBefore) {
          this._center = null; return false;
        }
        if ((this.biodiversityEnabled || this.benthicLifeEnabled) && saved === undefined) {
          this._storageError = 'A biodiversity owner read returned no persistence result.';
          this._counts.persistenceErrors++; this._center = null; return false;
        }
        const valid = saved?.version === VERSION && saved.id === id && Array.isArray(saved.agents) &&
          saved.agents.length <= OCEAN_REGION_AGENT_LIMIT && saved.resources && saved.ledger;
        if (this.livingNetworkEnabled && saved) {
          const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
          const baseValid = valid && saved.cx === coordinates[0] && saved.cz === coordinates[1] &&
            Number.isInteger(saved.ticks) && saved.ticks >= 0 && Number.isFinite(saved.timeSec) &&
            Math.abs(saved.timeSec - saved.ticks * STEP) < 1e-8 &&
            ['algae', 'plankton', 'detritus'].every(key => Number.isFinite(saved.resources[key]) && saved.resources[key] >= 0) &&
            ['initial', 'input', 'ingested', 'exported'].every(key => Number.isFinite(saved.ledger[key]) && saved.ledger[key] >= 0) &&
            new Set(saved.agents.map(agent => agent.id)).size === saved.agents.length &&
            saved.agents.every(agent => typeof agent.id === 'string' && agent.regionId === id && speciesById[agent.speciesId] &&
              typeof agent.alive === 'boolean' && Number.isFinite(agent.energy) && point(agent.position) && point(agent.home) &&
              point(agent.target) && point(agent.velocity) && point(agent.refuge));
          const partialNetwork = saved.basicNetwork === undefined && (Object.hasOwn(saved.ledger, 'networkAdded') ||
            Object.hasOwn(saved.ledger, 'networkRemoved') || saved.agents.some(agent => Object.hasOwn(agent, 'organicUnits') || Object.hasOwn(agent, 'organicDeathRecorded')));
          if (!baseValid || partialNetwork || (saved.basicNetwork !== undefined && !validateLivingNetworkRecord(saved)))
            throw new Error('Invalid saved living-shallows ecological network; original population was not regenerated.');
        }
        const hasSceneRecord = saved && ['sceneElementsVersion', 'sceneElementsInitializedAtSec', 'sceneElements'].some(key => Object.hasOwn(saved, key));
        if (hasSceneRecord && (!valid || !validateOceanSceneElementsRecord(saved, this.generator,
          { surface: (x, z) => this._surface(x, z, true, true, true, false, false, false) })))
          throw new Error('Invalid saved ocean scene elements; original population was not regenerated.');
        const hasHabitatRecord = saved && ['habitatSceneVersion', 'habitatSceneInitializedAtSec', 'habitatSceneTheme', 'habitatSceneElements']
          .some(key => Object.hasOwn(saved, key));
        if (hasHabitatRecord && (!valid || !validateOceanHabitatSceneRecord(saved, this.generator,
          { surface: (x, z) => this._surface(x, z, true, true, true, true, false, false) })))
          throw new Error('Invalid saved habitat scene; original population was not regenerated.');
        const hasMacroRecord = saved && ['macroLandscapeVersion', 'macroLandscapeInitializedAtSec', 'macroLandscapeElements']
          .some(key => Object.hasOwn(saved, key));
        if (hasMacroRecord && (!valid || !validateOceanMacroLandscapeRecord(saved, this.generator,
          { surface: (x, z) => this._macroBaselineSurface(saved, x, z) })))
          throw new Error('Invalid saved macro landscape; original population was not regenerated.');
        // Restore checks read this committed owner's historical solids locally;
        // live physics sees only owners that have completed activation.
        try {
          const hasBiodiversityRecord = saved && (['biodiversityVersion', 'biodiversityInitializedAtSec', 'biodiversity'].some(key => Object.hasOwn(saved, key)) || saved.agents?.some(isOceanBiodiversityAgent));
          if (hasBiodiversityRecord && (!valid || !validateOceanBiodiversityRecord(saved, this.generator, {
            surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false), bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })))
            throw new Error('Invalid saved biodiversity community; original animals and scenery were not regenerated.');
          const hasBenthicRecord = saved && (['benthicLifeVersion', 'benthicLifeInitializedAtSec', 'benthicLife'].some(key => Object.hasOwn(saved, key)) || saved.agents?.some(agent => isOceanBenthicLifeAgent(agent) || (agent && ['benthicLifeIndividualVersion', 'benthicLifeSiteId', 'benthicLifeHostId', 'benthicLifeMode'].some(key => Object.hasOwn(agent, key)))));
          if (hasBenthicRecord && (!valid || !validateOceanBenthicLifeRecord(saved, this.generator, {
            surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false), bed: (x, z) => this._bed(x, z), capacity: OCEAN_REGION_AGENT_LIMIT })))
            throw new Error('Invalid saved benthic-life community; original animals were not regenerated.');
          const hasTurtleRecord = saved && ['turtleCommunityVersion', 'turtleInitializedAtSec', 'turtleAgents'].some(key => Object.hasOwn(saved, key));
          const restoredSurface = (x, z) => Math.max(
            (hasSceneRecord ? saved.sceneElements : []).reduce((height, element) => Math.max(height,
              sceneElementHeight(element, x, z, true) ?? -Infinity), this._surface(x, z, true)),
            (hasHabitatRecord ? saved.habitatSceneElements : []).reduce((height, element) => Math.max(height,
              habitatSceneHeight(element, x, z, true) ?? -Infinity), -Infinity),
            (hasMacroRecord ? saved.macroLandscapeElements : []).reduce((height, element) => Math.max(height,
              macroLandscapeHeight(element, this.generator, x, z, true) ?? -Infinity), -Infinity));
          const hasGuildRecord = saved && (['reefGuildVersion', 'reefGuildInitializedAtSec', 'reefGuild'].some(key => Object.hasOwn(saved, key)) ||
            saved.agents?.some(isReefGuildAgent));
          if (hasGuildRecord && (!valid || !validateReefGuildRecord(saved, this.generator,
            { surface: (x, z, coral) => this._surface(x, z, coral) })))
            throw new Error('Invalid saved reef-life guild; original population was not regenerated.');
          const hasOpenWaterRecord = saved && (['openWaterLifeVersion', 'openWaterLifeInitializedAtSec', 'openWaterLife'].some(key => Object.hasOwn(saved, key)) ||
            saved.agents?.some(isOpenWaterLifeAgent));
          if (hasOpenWaterRecord && (!valid || !validateOpenWaterLifeRecord(saved, this.generator,
            { surface: (x, z, coral) => this._surface(x, z, coral) })))
            throw new Error('Invalid saved open-water life; original population was not regenerated.');
          if (hasTurtleRecord && (!valid || !validateOceanTurtleRecord(saved, this.generator, { surface: restoredSurface }))) {
            this._sceneSupports.delete(id);
            throw new Error('Invalid saved grass-bed turtle; original population was not regenerated.');
          }
          const hasGrazingRecord = saved && (['turtleGrazingVersion', 'turtleGrazingInitializedAtSec', 'turtleOrganicVersion', 'turtleOrganicInitializedAtSec', 'turtleOrganic'].some(key => Object.hasOwn(saved, key)) ||
            saved.turtleAgents?.some(agent => Object.hasOwn(agent, 'grazing')));
          if (hasGrazingRecord && (!hasTurtleRecord || saved.turtleOrganicVersion !== 1 || saved.turtleGrazingVersion !== 1 ||
              !validateOceanTurtleGrazingRecord(saved, this.generator, { surface: restoredSurface })))
            throw new Error('Invalid saved turtle feeding state; original population was not regenerated.');
          let freshPlan = null;
          if (this.livingGeologyEnabled && !saved) {
            if (this.seabedReliefEnabled) {
              const theme = selectLivingSeabedReliefTheme(this.generator.baseGenerator, ...coordinates);
              if (theme) {
                try { freshPlan = createLivingSeabedRelief(this.generator.baseGenerator, ...coordinates, { theme }); }
                catch (error) { if (!(error instanceof RangeError)) throw error; }
              }
            }
            const chunk = this.generator.baseGenerator.chunk(...coordinates), habitats = chunk.habitatComposition.habitats;
            const qualified = chunk.counts.rock >= 4 && chunk.counts.seagrass <= 64 && (habitats.seagrass ?? 0) <= 8 &&
              (habitats.reef ?? 0) + (habitats.slope ?? 0) >= 16 && chunk.seed % 3 === 2;
            if (!freshPlan && qualified) {
              try { freshPlan = createLivingRidgePlan(this.generator, ...coordinates); }
              catch (error) { if (!(error instanceof RangeError)) throw error; }
            }
            if (!freshPlan && this.habitatMosaicEnabled) {
              const theme = selectLivingHabitatMosaicTheme(this.generator.baseGenerator, ...coordinates);
              if (theme) {
                try { freshPlan = createLivingHabitatMosaic(this.generator.baseGenerator, ...coordinates, { theme }); }
                catch (error) { if (!(error instanceof RangeError)) throw error; }
              }
            }
          }
          const prepare = () => prepareRegion(saved, coordinates, valid);
          let prepared;
          if (freshPlan) {
            this._supportCells.clear();
            try { prepared = this.generator.withRidgePlan(freshPlan, prepare); }
            finally { this._supportCells.clear(); }
          } else prepared = prepare();
          let { region } = prepared;
          const { reanchored, formationsReanchored, floorReanchored, supplemented,
            beforeCommunity, slopeSupplemented, pelagicSupplemented, mantaSupplemented,
            beforeMobility, mobilityUpgraded, beforeTransport, transportUpgraded,
            turtleSupplemented, sceneSupplemented, habitatSupplemented, macroSupplemented,
            networkInitialized, guildInitialized, openWaterInitialized, biodiversityInitialized, benthicLifeInitialized, turtleOrganicInitialized, turtleGrazingInitialized } = prepared;
          if (freshPlan) region.livingRidgePlan = clone(freshPlan);
          const freshGeologyOwner = this.livingGeologyEnabled && !saved;
          if (freshGeologyOwner || floorReanchored || reanchored || formationsReanchored || supplemented || slopeSupplemented || pelagicSupplemented || mantaSupplemented || mobilityUpgraded || transportUpgraded || turtleSupplemented || sceneSupplemented || habitatSupplemented || macroSupplemented || networkInitialized || guildInitialized || openWaterInitialized || biodiversityInitialized || benthicLifeInitialized || turtleOrganicInitialized || turtleGrazingInitialized) {
            // Keep the v1 namespace. Persist the one-time geometric migration
            // and any missing-category additions before activating the record.
            const atomicSupplement = freshGeologyOwner || turtleSupplemented || sceneSupplemented || habitatSupplemented || macroSupplemented || networkInitialized || guildInitialized || openWaterInitialized || biodiversityInitialized || benthicLifeInitialized || turtleOrganicInitialized || turtleGrazingInitialized;
            const result = atomicSupplement ? await this._saveRecords(world, [[id, clone(region)]]) : await this._storage('save', world, id, clone(region));
            if (!atomicSupplement && result !== null) this._counts.saved++;
            if (atomicSupplement && result === null) { this._sceneSupports.delete(id); this._center = null; return false; }
            if (floorReanchored && result === null) {
              // Retain the old disk record and leave this cell pending. Activating
              // a half-committed contact correction can recreate state on reload.
              this._sceneSupports.delete(id); this._center = null;
              return false;
            }
            // An unsuccessful disk upgrade must not show a new cohort which
            // could later be recreated after its deaths. Keep the base record.
            if ((slopeSupplemented || pelagicSupplemented || mantaSupplemented) && result === null) region = beforeCommunity;
            else if (mobilityUpgraded && result === null) region = beforeMobility;
            else if (transportUpgraded && result === null) region = beforeTransport;
            if (!current()) { this._sceneSupports.delete(id); return; }
          }
          if (freshGeologyOwner) {
            // The temporary birth source is invisible while saveMany is pending.
            // Publish exactly the committed plan, then activate its real agents.
            if (freshPlan) this.generator.registerRidgePlan(region.livingRidgePlan);
            else this.generator.registerLegacyRidgeOwner(id);
            this._supportCells.clear();
          }
          this._active.set(id, region);
          if (region.sceneElementsVersion === 1) this._sceneSupports.set(id, region.sceneElements);
          if (region.habitatSceneVersion === 1) this._habitatSupports.set(id, region.habitatSceneElements);
          if (region.macroLandscapeVersion >= 1) this._registerMacroSupport(region);
          this._counts[valid ? 'restored' : 'generated']++;
        } catch (error) {
          // A rejecting historical animal or migration must not leave an
          // unactivated scenery owner's physical supports in the live world.
          this._sceneSupports.delete(id); this._center = null;
          this._habitatSupports.delete(id);
          if (this._macroSupports.delete(id)) this._macroRevision++;
          throw error;
        }
      }
    });
    return this._pending;
  }

  _emit(region, type, agent, detail) {
    region.events.push({ id: `${region.id}:${region.ticks}:${type}:${agent.id}`, regionId: region.id,
      timeSec: region.timeSec, type, agentId: agent.id, title: detail });
    if (region.events.length > 12) region.events.shift();
  }

  _state(agent, state, timeSec) {
    if (agent.state !== state) { agent.state = state; agent.stateSince = timeSec; }
  }

  _feed(region, agent, pool, amount) {
    const clock = agent.mobileTimeSec ?? region.timeSec;
    if (clock < agent.nextBite) return 0;
    const origin = agent.birthRegionId ? { id: agent.birthRegionId } : region;
    const tick = agent.mobileTimeSec === undefined ? region.ticks : Math.round(clock / STEP);
    agent.nextBite = clock + 2.5 + this._random(origin, `${agent.id}:bite:${tick}`) * 2;
    const taken = Math.min(region.resources[pool], amount);
    if (taken > 1e-10) {
      region.resources[pool] -= taken;
      region.ledger.ingested += taken;
      if (this.livingNetworkEnabled) recordLivingIngestion(region, agent, taken);
      agent.energy = Math.min(1, agent.energy + taken * 8);
      agent.lastFeedAt = clock;
      region.counters.feeding++;
    }
    return taken;
  }

  _target(region, agent, extent) {
    if (region.timeSec < agent.nextDecision) return;
    const key = `${agent.id}:decision:${agent.decisions++}`;
    agent.nextDecision = region.timeSec + 4 + this._random(region, `${key}:time`) * 5;
    const angle = this._random(region, `${key}:angle`) * TAU;
    const radius = this._random(region, `${key}:radius`) * extent;
    const chunk = this.generator.chunk(region.cx, region.cz);
    let x = clamp(agent.home.x + Math.cos(angle) * radius, chunk.bounds.minX + .5, chunk.bounds.maxX - .5);
    let z = clamp(agent.home.z + Math.sin(angle) * radius, chunk.bounds.minZ + .5, chunk.bounds.maxZ - .5);
    const species = speciesById[agent.speciesId];
    for (let attempt = 0; attempt < 7; attempt++) {
      const relief = this._surface(x, z) - this._bed(x, z);
      const valid = (this.livingNetworkEnabled || Math.hypot(x, z) > OCEAN_AUTHORED_RADIUS + 1) &&
        (agent.habitat.startsWith('sand') || agent.habitat === 'reef-foot-cleaning-station' ? relief < .03 : species.guild === 'grazer' || species.kind === 'star' || species.kind === 'snail' ? relief > .06 : true);
      if (valid) break;
      x = (x + agent.home.x) * .5; z = (z + agent.home.z) * .5;
    }
    agent.target = { x, y: this._surface(x, z, species.kind === 'fish') + agent.supportOffset, z };
  }

  _move(agent, target, speed, dt, currentVector = { x: 0, z: 0 }) {
    const delta = { x: target.x - agent.position.x, y: target.y - agent.position.y, z: target.z - agent.position.z };
    const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
    const step = Math.min(length, speed * dt);
    const previous = { ...agent.position };
    const owner = this._active.get(agent.regionId);
    const bounds = this.generator.chunk(owner.cx, owner.cz).bounds;
    const species = speciesById[agent.speciesId];
    const fish = species.kind === 'fish';
    const pelagic = agent.habitat === 'pelagic-water-column';
    const driftX = (fish ? currentVector.x : 0) * .04 * dt, driftZ = (fish ? currentVector.z : 0) * .04 * dt;
    const budget = speed * dt + Math.hypot(driftX, driftZ);
    const displacement = { x: delta.x / length * step + driftX, y: delta.y / length * step,
      z: delta.z / length * step + driftZ };
    const high = OCEAN_SURFACE_Y - (pelagic ? 1.5 : .6);
    const validHabitat = (x, z) => {
      const surface = this._surface(x, z), bed = this._bed(x, z);
      const relief = surface - bed;
      return (this.livingNetworkEnabled || Math.hypot(x, z) >= OCEAN_AUTHORED_RADIUS + 1) &&
        !((agent.habitat.startsWith('sand') || agent.habitat === 'reef-foot-cleaning-station') && relief >= .03) &&
        !((species.guild === 'grazer' || species.kind === 'star' || species.kind === 'snail') && relief <= .06);
    };
    const candidateAt = fraction => {
      const x = clamp(previous.x + displacement.x * fraction, bounds.minX + .5, bounds.maxX - .5);
      const z = clamp(previous.z + displacement.z * fraction, bounds.minZ + .5, bounds.maxZ - .5);
      if (!validHabitat(x, z)) return null;
      const low = this._surface(x, z, fish) + (pelagic ? 1 : fish ? .08 : .004);
      if (fish && low > high) return null;
      const y = fish ? Math.max(low, Math.min(high, previous.y + displacement.y * fraction)) : low;
      const candidate = { x, y, z };
      if (distance(previous, candidate) > budget + 1e-12) return null;
      // Check the midpoint too: a supported endpoint alone can skip a narrow
      // obstacle or a disconnected hard-bottom edge.
      const mx = (previous.x + x) * .5, mz = (previous.z + z) * .5;
      if (!validHabitat(mx, mz)) return null;
      if (fish && (previous.y + y) * .5 < this._surface(mx, mz, true) + (pelagic ? 1 : .08) - 1e-10) return null;
      return candidate;
    };
    let next = null, acceptedFraction = 1;
    // Shortening a complete XYZ step follows a slope within the same speed
    // budget. Neither swimmers nor crawlers are snapped onto a new rock top.
    for (const fraction of [1, .5, .25, .125, .0625, .03125, .015625, .0078125]) {
      next = candidateAt(fraction);
      if (next) { acceptedFraction = fraction; break; }
    }
    if (!next && fish) {
      const low = this._surface(previous.x, previous.z, true) + (pelagic ? 1 : .08);
      const neededY = Math.max(low, Math.min(high, previous.y + Math.sign(displacement.y) * budget));
      const y = previous.y + clamp(neededY - previous.y, -budget, budget);
      // A retained historical intrusion recovers in place at the ordinary
      // speed. It is never normalized by replacing its saved pose or ID.
      if (Math.abs(y - previous.y) > 1e-12 && low <= high) next = { ...previous, y };
    }
    if (!next) {
      agent.velocity = { x: 0, y: 0, z: 0 };
      agent.nextDecision = 0;
      return;
    }
    if (acceptedFraction < 1) agent.nextDecision = 0;
    agent.position = next;
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > .00001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _regionEnvironment(region, baseline = this._environment) {
    return this.environmentField.sample((region.cx + .5) * OCEAN_CHUNK_SIZE, (region.cz + .5) * OCEAN_CHUNK_SIZE, baseline);
  }

  _tick(region, environment, baseline = this._environment) {
    region.ticks++;
    region.timeSec = region.ticks * STEP;
    const light = environment.lightAtDepth;
    // Explicit inputs, exports and ingestion preserve the regional food ledger.
    const inputs = { algae: .0007 * light, plankton: .0012 * environment.foodSupply * (1 + environment.currentMps), detritus: .0002 };
    if (this.livingNetworkEnabled) tickLivingNetwork(region, environment, STEP);
    else for (const pool of Object.keys(inputs)) {
      const input = inputs[pool] * STEP;
      region.resources[pool] += input; region.ledger.input += input;
      // External proxy supply remains the established authored formula. Atomic
      // face exchange replaces only the old flow-dependent local disappearance.
      const planktonLoss = .0008 + (this._usesPlanktonTransport(region) ? 0 : environment.currentMps * .003);
      const exported = Math.min(region.resources[pool], region.resources[pool] * (pool === 'plankton' ? planktonLoss : .0001) * STEP);
      region.resources[pool] -= exported; region.ledger.exported += exported;
      // A unit is the model's reference capacity. Excess is accounted as
      // regional export, rather than silently clipped or made to disappear.
      const excess = Math.max(0, region.resources[pool] - 1);
      region.resources[pool] -= excess; region.ledger.exported += excess;
    }
    if (this.livingNetworkEnabled) tickReefGuildPool(region, STEP);
    if (this.livingNetworkEnabled) tickOpenWaterLifePool(region, STEP);
    const alive = region.agents.filter(agent => agent.alive);
    const predators = alive.filter(agent => speciesById[agent.speciesId].guild === 'predator');
    for (const agent of alive) {
      if (!agent.alive) continue;
      if (agent.mobileTimeSec !== undefined) agent.mobileTimeSec = Math.round((agent.mobileTimeSec + STEP) / STEP) * STEP;
      const clock = agent.mobileTimeSec ?? region.timeSec;
      const species = speciesById[agent.speciesId];
      const fish = species.kind === 'fish';
      const swimmer = fish || species.kind === 'ray' || (this.livingNetworkEnabled && isOpenWaterLifeAgent(agent));
      const local = swimmer || species.guild === 'photosymbiotic-filter' || (this.livingNetworkEnabled && (isReefGuildAgent(agent) || isOceanBiodiversityAgent(agent) || isOceanBenthicLifeAgent(agent)))
        ? this.environmentField.sample(agent.position.x, agent.position.z, baseline, Math.max(0, OCEAN_SURFACE_Y - agent.position.y)) : environment;
      agent.energy = Math.max(0, agent.energy - STEP * (swimmer ? .00012 + local.currentMps ** 2 * .00015 : .000025));
      if (agent.energy <= 0) {
        agent.alive = false; agent.velocity = { x: 0, y: 0, z: 0 };
        this._state(agent, 'dead', clock); region.counters.deaths++;
        if (this.livingNetworkEnabled) recordLivingDeath(region, agent);
        this._emit(region, 'death', agent, '区域个体能量耗尽'); continue;
      }
      if (this.livingNetworkEnabled && isOceanBenthicLifeAgent(agent)) {
        tickOceanBenthicLifeAgent(region, this.generator, agent, STEP, {
          random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral, true, true, true, true, true, false),
          bed: (x, z) => this._bed(x, z), environment: local,
          state: (individual, state, time) => this._state(individual, state, time),
        });
        continue;
      }
      if (this.livingNetworkEnabled && isOceanBiodiversityAgent(agent)) {
        tickOceanBiodiversityAgent(region, this.generator, agent, STEP, {
          random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral),
          bed: (x, z) => this._bed(x, z), environment: local,
          state: (individual, state, time) => this._state(individual, state, time),
        });
        continue;
      }
      if (this.livingNetworkEnabled && agent.speciesId === 'butterflyfish' && region.biodiversityVersion === 1) {
        this._state(agent, local.lightAtDepth < .05 ? 'hiding' : 'foraging', clock);
        this._target(region, agent, .6); this._move(agent, agent.target, .07, STEP);
        if (local.lightAtDepth >= .05) {
          const taken = Math.min(region.basicNetwork.coralOrganicUnits, .00012 * STEP);
          region.basicNetwork.coralOrganicUnits -= taken;
          recordLivingIngestion(region, agent, taken);
          if (taken > 0) { agent.energy = Math.min(1, agent.energy + taken * 9); agent.lastFeedAt = clock; }
        }
        continue;
      }
      if (this.livingNetworkEnabled && isReefGuildAgent(agent)) {
        tickReefGuildAgent(region, this.generator, agent, STEP, {
          random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral),
          feedPlankton: (individual, amount) => this._feed(region, individual, 'plankton', amount),
          state: (individual, state, time) => this._state(individual, state, time),
          environment: local,
        });
        continue;
      }
      if (this.livingNetworkEnabled && isOpenWaterLifeAgent(agent)) {
        tickOpenWaterLifeAgent(region, this.generator, agent, STEP, {
          random: salt => this._random(region, salt), surface: (x, z, coral) => this._surface(x, z, coral), environment: local,
          feedPlankton: (individual, amount) => this._feed(region, individual, 'plankton', amount),
          state: (individual, state, time) => this._state(individual, state, time),
        });
        continue;
      }
      if (agent.habitat === 'manta-water-column') {
        // Resource index .35 is a display proxy for a richer plankton patch,
        // not the field study's measured prey-density threshold. No night gate.
        const feeding = region.resources.plankton >= .35;
        this._state(agent, feeding ? 'filtering' : 'gliding', clock);
        this._moveManta(agent, this._mantaTarget(region, agent), STEP);
        if (feeding) this._feed(region, agent, 'plankton', .0035);
        continue;
      }
      if (agent.habitat === 'pelagic-water-column') {
        const lowLight = local.lightAtDepth < .05;
        const mobile = this._pelagicMobile(agent);
        this._state(agent, lowLight ? 'resting' : 'schooling', mobile ? clock : region.timeSec);
        const target = { ...this._pelagicTarget(region, agent, lowLight) };
        const frame = mobile ? this._pelagicFrames.get(agent.groupId) : null;
        const peers = frame ? frame.members.filter(peer => peer.id !== agent.id) : alive.filter(peer => peer.id !== agent.id && peer.groupId === agent.groupId);
        if (frame && peers.length) {
          const gap = Math.max(...peers.map(peer => distance(agent.position, peer.position)));
          const centerDistance = distance(agent.position, frame.centroid);
          // A leading fragment waits/catches up inside a bounded neighbourhood;
          // an unloaded or capacity-blocked peer is never dragged or cloned.
          const routeWeight = gap > 8 && centerDistance > 2 ? 0 : gap > 6 ? .05 : .92;
          for (const axis of ['x', 'y', 'z']) target[axis] = target[axis] * routeWeight + frame.centroid[axis] * (1 - routeWeight);
        }
        for (const peer of peers) if (distance(agent.position, peer.position) < .35) {
          target.x += (agent.position.x - peer.position.x) * 1.8;
          target.z += (agent.position.z - peer.position.z) * 1.8;
        }
        if (mobile) this._moveRoamingPelagic(agent, target, lowLight ? .06 : .25, STEP, local.currentVector);
        else this._move(agent, target, lowLight ? .06 : .25, STEP, local.currentVector);
        if (!lowLight) this._feed(region, agent, 'plankton', .0012);
        continue;
      }
      if (fish && species.guild !== 'predator') {
        const threat = predators.find(predator => predator.alive && distance(agent.position, predator.position) < 1.6 * (1 - local.turbidity * .5));
        if (threat) {
          if (agent.state !== 'fleeing') { region.counters.escapes++; this._emit(region, 'escape', agent, '发现近处捕食者，退向庇护位置'); }
          agent.fleeUntil = region.timeSec + 1.5;
        }
        if (agent.fleeUntil > region.timeSec) {
          this._state(agent, 'fleeing', region.timeSec);
          this._move(agent, agent.refuge, .55, STEP); continue;
        }
        if (local.lightAtDepth < .05) {
          this._state(agent, agent.habitat === 'slope-water-column' ? 'resting' : 'hiding', region.timeSec);
          this._move(agent, agent.refuge, .12, STEP); continue;
        }
      }
      if (species.guild === 'photosymbiotic-filter') {
        // Fixed filter feeder: photosymbiotic gain is an uncalibrated energy
        // proxy, separate from consumption of the regional plankton ledger.
        this._state(agent, 'filtering', region.timeSec);
        agent.velocity = { x: 0, y: 0, z: 0 };
        agent.energy = Math.min(1, agent.energy + STEP * local.lightAtDepth * .00009);
        this._feed(region, agent, 'plankton', .00035);
      } else if (species.kind === 'shrimp' && species.guild === 'cleaner') {
        // A benthic station does not inherit the cleaner fish's pursuit.
        // Only an actual nearby fish with parasites can activate cleaning.
        const client = alive.filter(candidate => candidate.alive && speciesById[candidate.speciesId].kind === 'fish'
          && candidate.sizeM > .17 && candidate.parasites > .08 && distance(candidate.position, agent.position) < .85)
          .sort((a, b) => distance(agent.position, a.position) - distance(agent.position, b.position))[0];
        this._target(region, agent, .28);
        this._move(agent, agent.target, .008, STEP);
        const cleaning = client && distance(agent.position, client.position) < .85;
        this._state(agent, cleaning ? 'cleaning' : 'foraging', region.timeSec);
        if (cleaning) {
          const removed = Math.min(client.parasites, .002 * STEP);
          client.parasites -= removed; agent.energy = Math.min(1, agent.energy + removed * .25);
          if (removed > 0 && region.timeSec >= agent.nextBite) { agent.lastFeedAt = region.timeSec; agent.nextBite = region.timeSec + 3; region.counters.cleaning++; }
        } else this._feed(region, agent, 'detritus', .00015);
      } else if (species.guild === 'predator') {
        const prey = alive.filter(candidate => candidate.alive && candidate.speciesId === 'green-chromis')
          .sort((a, b) => distance(agent.position, a.position) - distance(agent.position, b.position))[0];
        const close = prey && distance(agent.position, prey.position) < 1.1;
        this._state(agent, close && agent.energy < .68 ? 'hunting' : 'ambushing', region.timeSec);
        this._target(region, agent, 1.5);
        this._move(agent, agent.state === 'hunting' ? prey.position : agent.target, agent.state === 'hunting' ? .38 : .035, STEP);
        // A genuine proximity/energy condition, not a periodically directed event.
        if (agent.state === 'hunting' && prey.alive && distance(agent.position, prey.position) < .13 && region.timeSec >= agent.nextBite) {
          prey.alive = false; prey.state = 'dead'; prey.stateSince = region.timeSec; prey.velocity = { x: 0, y: 0, z: 0 };
          const intake = this.livingNetworkEnabled ? recordLivingPredation(region, agent, prey) : null;
          agent.energy = Math.min(1, agent.energy + (this.livingNetworkEnabled ? intake * 8 : prey.energy * .2)); agent.lastFeedAt = region.timeSec;
          agent.nextBite = region.timeSec + 20; region.counters.predation++; region.counters.deaths++;
          this._emit(region, 'predation', agent, '近距离捕食小鱼；死亡个体保持死亡状态');
        }
      } else if (species.guild === 'cleaner') {
        const client = alive.find(candidate => candidate.alive && candidate.sizeM > .17 && candidate.parasites > .06 && distance(candidate.position, agent.home) < 2.4);
        this._state(agent, client ? 'cleaning' : 'foraging', region.timeSec);
        this._target(region, agent, .8);
        this._move(agent, client ? client.position : agent.target, .18, STEP);
        if (client && distance(agent.position, client.position) < .42) {
          const removed = Math.min(client.parasites, .002 * STEP);
          client.parasites -= removed; agent.energy = Math.min(1, agent.energy + removed * .25);
          if (removed > 0 && region.timeSec >= agent.nextBite) { agent.lastFeedAt = region.timeSec; agent.nextBite = region.timeSec + 3; region.counters.cleaning++; }
        }
      } else if (species.guild === 'planktivore') {
        const foodAvailable = !this.livingNetworkEnabled || region.resources.plankton > 1e-7;
        this._state(agent, foodAvailable ? 'schooling' : 'foraging', region.timeSec);
        this._target(region, agent, foodAvailable ? 2.2 : 4);
        const peers = alive.filter(peer => peer.id !== agent.id && peer.groupId === agent.groupId && peer.alive);
        const target = { ...agent.target };
        if (peers.length) {
          for (const axis of ['x', 'y', 'z']) target[axis] = target[axis] * .55 + peers.reduce((n, peer) => n + peer.position[axis], 0) / peers.length * .45;
          for (const peer of peers) if (distance(agent.position, peer.position) < .16) {
            target.x += (agent.position.x - peer.position.x) * 1.8; target.z += (agent.position.z - peer.position.z) * 1.8;
          }
        }
        this._move(agent, target, .12, STEP, local.currentVector);
        this._feed(region, agent, 'plankton', .0012);
      } else {
        this._target(region, agent, fish ? 1.3 : agent.speciesId === 'black-cucumber' ? 2 : .8);
        this._move(agent, agent.target, fish ? .08 : agent.speciesId === 'black-cucumber' ? .006 : .002, STEP);
        const relief = this._surface(agent.position.x, agent.position.z) - this._bed(agent.position.x, agent.position.z);
        if (agent.speciesId === 'black-cucumber') {
          this._state(agent, this.livingNetworkEnabled && region.resources.detritus <= 1e-7 ? 'foraging' : 'deposit-feeding', region.timeSec);
          if (relief < .03) this._feed(region, agent, 'detritus', .0007);
        } else {
          const grazing = relief > .06 && agent.energy < .86 && (!this.livingNetworkEnabled || region.resources.algae > 1e-7);
          this._state(agent, grazing ? 'grazing' : 'foraging', region.timeSec);
          if (grazing) this._feed(region, agent, 'algae', fish ? .0015 : .0005);
        }
      }
    }
    if (region.turtleAgents?.length) {
      const surface = (x, z) => this._surface(x, z, true);
      const handled = region.turtleGrazingVersion === 1 && region.turtleOrganicVersion === 1 &&
        tickOceanTurtleGrazing(region, this.generator, { surface, stepSec: STEP,
          consumeSeagrass: (agent, plantId, quantity) => {
            const plant = this.generator.chunk(region.cx, region.cz).elements.find(element => element.kind === 'seagrass' && element.id === plantId);
            if (!plant || !oceanTurtleGrazingContact(agent, plant, this.generator, { cx: region.cx, cz: region.cz, surface })) return 0;
            const taken = recordLivingSeagrassGrazing(region, agent, quantity);
            if (taken > 0) {
              agent.lastFeedAt = region.timeSec;
              region.counters.feeding++;
              this._emit(region, 'feeding', agent, '绿海龟接触海草后摄食');
            }
            return taken;
          } });
      if (!handled) tickOceanTurtles(region, this.generator, { surface, stepSec: STEP });
    }
  }

  setEnvironment(environment = {}) {
    const values = { ...this._environment, ...environment };
    for (const key of ['currentMps', 'turbidity', 'foodSupply', 'hour']) if (!Number.isFinite(values[key])) throw new TypeError(`Environment ${key} must be finite.`);
    values.currentMps = clamp(values.currentMps, 0, 1.2); values.turbidity = clamp(values.turbidity, 0, 1);
    values.foodSupply = clamp(values.foodSupply, 0, 3); values.hour = ((values.hour % 24) + 24) % 24;
    this._environment = values;
    return { ...values };
  }

  step(deltaSec, environment = {}) {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) throw new RangeError('Ecology step must be non-negative simulation seconds.');
    if (this._disposed || deltaSec === 0) return;
    const values = this.setEnvironment(environment);
    const localEnvironments = new Map([...this._active].map(([id, region]) => [id, this._regionEnvironment(region, values)]));
    this._accumulator += deltaSec;
    while (this._accumulator + 1e-10 >= STEP) {
      this._accumulator = Math.max(0, this._accumulator - STEP);
      this._activeTime += STEP;
      this._preparePelagicFrames();
      for (const region of this._active.values()) if (!this._lockedRegions.has(region.id)) this._tick(region, localEnvironments.get(region.id), values);
      this._applyMantaTransfers();
      this._transportPlankton(values);
    }
    if (this._activeTime >= this._checkpointAt) {
      this._checkpointAt = this._activeTime + 10;
      this.checkpoint();
    }
  }

  checkpoint() {
    const generation = this._generation, world = this._world;
    return this._enqueue(async () => {
      if (this._disposed || generation !== this._generation) return;
      return this._saveRecords(world, [...this._active].map(([id, region]) => [id, clone(region)]));
    });
  }

  _initialAnimalCapacity(region) { return OCEAN_REGION_AGENT_LIMIT - (this._biodiversityBirths.has(region) ? 6 : 0) - (this._benthicLifeBirths.has(region) ? 4 : 0); }

  get scenery() { return [...this._active.values()].flatMap(region => region.biodiversityVersion === 1 ? region.biodiversity.patches : []); }

  biodiversitySupportHeight(x, z) {
    let height = -Infinity;
    for (const patch of [...this.scenery, ...this._biodiversityBirthView]) {
      if (Math.hypot(x - patch.x, z - patch.z) > Math.hypot(patch.scale.x, patch.scale.z) * .5) continue;
      const y = oceanBiodiversityPatchHeight(patch, x, z);
      if (y !== null) height = Math.max(height, y);
    }
    return height;
  }

  snapshot() {
    const regions = [...this._active.values()].map(region => ({ id: region.id, cx: region.cx, cz: region.cz, habitat: region.habitat, surfaceVersion: region.surfaceVersion,
      floorSurfaceVersion: region.floorSurfaceVersion ?? 0,
      communityVersion: region.communityVersion ?? null,
      ...(region.biodiversityVersion !== undefined ? { biodiversityVersion: region.biodiversityVersion,
        biodiversityInitializedAtSec: region.biodiversityInitializedAtSec, biodiversity: clone(region.biodiversity) } : {}),
      ...(region.benthicLifeVersion !== undefined ? { benthicLifeVersion: region.benthicLifeVersion,
        benthicLifeInitializedAtSec: region.benthicLifeInitializedAtSec, benthicLife: clone(region.benthicLife) } : {}),
      ...(region.populationRecipeVersion !== undefined ? { populationRecipeVersion: region.populationRecipeVersion } : {}),
      ...(region.livingRidgePlan !== undefined ? { livingRidgePlan: clone(region.livingRidgePlan) } : {}),
      formationsVersion: region.formationsVersion ?? 0,
      slopeCommunityVersion: region.slopeCommunityVersion ?? 0,
      slopeCommunityAdded: region.slopeCommunityAdded ?? 0,
      slopeInitializedAtSec: region.slopeInitializedAtSec ?? null,
      pelagicCommunityVersion: region.pelagicCommunityVersion ?? 0,
      pelagicCommunityAdded: region.pelagicCommunityAdded ?? 0,
      pelagicInitializedAtSec: region.pelagicInitializedAtSec ?? null,
      ...(region.pelagicEverOccupied !== undefined ? { pelagicEverOccupied: region.pelagicEverOccupied } : {}),
      mantaCommunityVersion: region.mantaCommunityVersion ?? 0,
      mantaCommunityAdded: region.mantaCommunityAdded ?? 0,
      mantaInitializedAtSec: region.mantaInitializedAtSec ?? null,
      mantaEverOccupied: region.mantaEverOccupied ?? false,
      ...(region.turtleCommunityVersion !== undefined ? { turtleCommunityVersion: region.turtleCommunityVersion,
        turtleInitializedAtSec: region.turtleInitializedAtSec, turtleAgentCount: region.turtleAgents.length } : {}),
      ...(region.turtleGrazingVersion !== undefined ? { turtleGrazingVersion: region.turtleGrazingVersion,
        turtleGrazingInitializedAtSec: region.turtleGrazingInitializedAtSec } : {}),
      ...(region.turtleOrganicVersion !== undefined ? { turtleOrganicVersion: region.turtleOrganicVersion,
        turtleOrganicInitializedAtSec: region.turtleOrganicInitializedAtSec, turtleOrganic: clone(region.turtleOrganic) } : {}),
      ...(region.sceneElementsVersion !== undefined ? { sceneElementsVersion: region.sceneElementsVersion,
        sceneElementsInitializedAtSec: region.sceneElementsInitializedAtSec, sceneElements: clone(region.sceneElements) } : {}),
      ...(region.habitatSceneVersion !== undefined ? { habitatSceneVersion: region.habitatSceneVersion,
        habitatSceneInitializedAtSec: region.habitatSceneInitializedAtSec, habitatSceneTheme: region.habitatSceneTheme,
        habitatSceneElements: clone(region.habitatSceneElements) } : {}),
      ...(region.macroLandscapeVersion !== undefined ? { macroLandscapeVersion: region.macroLandscapeVersion,
        macroLandscapeInitializedAtSec: region.macroLandscapeInitializedAtSec,
        macroLandscapeElements: clone(region.macroLandscapeElements) } : {}),
      ...(region.planktonTransportVersion !== undefined ? { planktonTransportVersion: region.planktonTransportVersion } : {}),
      ...(this.livingNetworkEnabled ? { basicNetwork: clone(region.basicNetwork) } : {}),
      ...(region.reefGuildVersion !== undefined ? { reefGuildVersion: region.reefGuildVersion,
        reefGuildInitializedAtSec: region.reefGuildInitializedAtSec, reefGuild: clone(region.reefGuild) } : {}),
      ...(region.openWaterLifeVersion !== undefined ? { openWaterLifeVersion: region.openWaterLifeVersion,
        openWaterLifeInitializedAtSec: region.openWaterLifeInitializedAtSec, openWaterLife: clone(region.openWaterLife) } : {}),
      ...(region.planktonTransport ? { transport: { ...region.planktonTransport,
        cumulativeImportedUnits: region.ledger.transferredIn ?? 0,
        cumulativeTransferredOutUnits: region.ledger.transferredOut ?? 0 } } : {}),
      localEnvironment: this._regionEnvironment(region),
      timeSec: region.timeSec, resources: { ...region.resources }, ledger: { ...region.ledger }, counters: { ...region.counters },
      balanceError: region.ledger.initial + region.ledger.input + (region.ledger.transferredIn ?? 0) -
        region.ledger.ingested - region.ledger.exported - (region.ledger.transferredOut ?? 0) - sum(region.resources) +
        (region.ledger.networkAdded ?? 0) - (region.ledger.networkRemoved ?? 0),
      alive: region.agents.filter(agent => agent.alive).length + (region.turtleAgents?.filter(agent => agent.alive).length ?? 0), individuals: this._residentCount(region),
      aliveCount: region.agents.filter(agent => agent.alive).length + (region.turtleAgents?.filter(agent => agent.alive).length ?? 0), agentCount: this._residentCount(region) }));
    const resources = regions.reduce((total, region) => {
      for (const pool of Object.keys(total)) total[pool] += region.resources[pool]; return total;
    }, { algae: 0, plankton: 0, detritus: 0 });
    const averageResources = Object.fromEntries(Object.entries(resources).map(([pool, quantity]) => [pool, regions.length ? quantity / regions.length : 0]));
    const living = this.agents.filter(agent => agent.alive && Number.isFinite(agent.energy));
    return { seed: this.seed, scenery: clone(this.scenery), agents: this.agents.map(agent => clone(agent)),
      ...(this.livingNetworkEnabled ? { ecosystem: summarizeLivingNetwork([...this._active.values()], speciesById) } : {}),
      regions, resources, events: [...this._active.values()].flatMap(region => clone(region.events)),
      metrics: { ...this._counts, activeRegions: this._active.size, maxActiveRegions: OCEAN_ACTIVE_REGION_LIMIT,
        activeIndividuals: this.agents.length, alive: this.agents.filter(agent => agent.alive).length,
        averageResources, averageEnergy: living.length ? living.reduce((n, agent) => n + agent.energy, 0) / living.length : 0,
        visibilityM: regions.length ? regions.reduce((n, region) => n + region.localEnvironment.visibilityM, 0) / regions.length : 3 + (1 - this._environment.turbidity) * 16,
        environmentScope: 'local-water-field; regional summaries sampled at loaded-region centres',
        timeSec: regions.length ? regions.reduce((n, region) => n + region.timeSec, 0) / regions.length : 0,
        loadingRegions: this._center ? OCEAN_ACTIVE_REGION_LIMIT - this._active.size : 0,
        maxIndividualsPerRegion: OCEAN_REGION_AGENT_LIMIT,
        supportCacheCells: this._supportCells.size, maxSupportCacheCells: 25,
        planktonTransport: { enabled: typeof this.store.saveMany === 'function',
          mode: typeof this.store.saveMany === 'function' ? 'loaded-neighbour-upwind' : 'legacy-local-exchange',
          method: OCEAN_PLANKTON_TRANSPORT_METHOD, scope: OCEAN_PLANKTON_TRANSPORT_SCOPE,
          units: 'relative food units; equal-area reference-capacity cells, not measured concentration or equal physical water volume',
          cellSizeM: OCEAN_CHUNK_SIZE, faceSampleCount: OCEAN_PLANKTON_FACE_SAMPLE_COUNT,
          minimumSharedWaterColumnM: OCEAN_PLANKTON_MINIMUM_WATER_COLUMN_M,
          faceCacheCount: this._planktonFaces.size, maxFaceCacheCount: 96,
          readyRegions: regions.filter(region => region.planktonTransportVersion >= OCEAN_PLANKTON_TRANSPORT_VERSION).length,
          pendingDesiredRegions: [...this._planktonDesiredRegions].filter(id => !this._active.has(id)).length,
          ...this._planktonLastStep,
          windowCumulativeImportedUnits: regions.reduce((total, region) => total + (region.ledger.transferredIn ?? 0), 0),
          windowCumulativeTransferredOutUnits: regions.reduce((total, region) => total + (region.ledger.transferredOut ?? 0), 0),
          windowCumulativeBoundaryExportedUnits: regions.reduce((total, region) => total + (region.transport?.cumulativeBoundaryExportedUnits ?? 0), 0),
          windowCumulativeOverflowExportedUnits: regions.reduce((total, region) => total + (region.transport?.cumulativeOverflowExportedUnits ?? 0), 0),
          cumulativeScope: 'sum of each currently loaded region’s saved history; changes when the window changes',
        },
        persistenceStatus: this._storageError ? 'error' : this.store.available === false ? 'session-only' : 'indexeddb',
        storageError: this._storageError, scope: 'loaded-regions-only', unloadedPolicy: 'frozen',
        balanceError: regions.reduce((value, region) => Math.max(value, Math.abs(region.balanceError)), 0) } };
  }

  reset(seed = this.seed, generator = this.generator) {
    const previous = this._world, next = worldKey(seed);
    this._generation++; this._revision++; this._active.clear(); this._supportCells.clear(); this._sceneSupports.clear(); this._habitatSupports.clear(); this._macroSupports.clear(); this._center = null;
    this._macroRevision++;
    this._lockedRegions.clear(); this._transfers.length = 0; this._pelagicFrames.clear(); this._planktonFaces.clear(); this._planktonDesiredRegions.clear();
    this._planktonLastStep = { lastStepSec: 0, lastTransferredUnits: 0, lastBoundaryExportedUnits: 0, lastOverflowExportedUnits: 0 };
    this.seed = seed; this.generator = generator; this._world = next;
    this.livingNetworkEnabled = generator.profile === LIVING_NETWORK_PROFILE;
    this.biodiversityEnabled = this._biodiversityRequested && this.livingNetworkEnabled && typeof this.store.saveMany === 'function';
    this.benthicLifeEnabled = this._benthicLifeRequested && this.livingNetworkEnabled && typeof this.store.saveMany === 'function';
    this._biodiversityBirthView = [];
    this.turtleGrazingEnabled = this._turtleGrazingRequested && this.turtlesEnabled && this.livingNetworkEnabled && typeof this.store.saveMany === 'function';
    this.livingGeologyEnabled = this._livingGeologyRequested && this.livingNetworkEnabled &&
      typeof generator.withRidgePlan === 'function' && typeof this.store.saveMany === 'function';
    this.livingBeltEnabled = this._livingBeltRequested && this.livingGeologyEnabled;
    this.shallowSeascapeEnabled = this._shallowSeascapeRequested && this.livingGeologyEnabled &&
      typeof generator.withShallowSeascapePlans === 'function' && typeof generator.replaceRidgeOwners === 'function';
    if (this.livingGeologyEnabled) generator.retainRidgeOwners([]);
    this.environmentField = createOceanEnvironment(seed, generator);
    this._accumulator = 0; this._activeTime = 0; this._checkpointAt = 10;
    this._disposed = false;
    this._pending = this._enqueue(async () => {
      await this._storage('clear', previous);
      if (next !== previous) await this._storage('clear', next);
    });
    return this._pending;
  }

  dispose() {
    if (this._disposed) return this._queue;
    const world = this._world;
    this._disposed = true; this._generation++; this._revision++;
    return this._enqueue(async () => {
      const records = [...this._active].map(([id, region]) => [id, clone(region)]);
      await this._saveRecords(world, records);
      this._active.clear(); this._supportCells.clear(); this._sceneSupports.clear(); this._habitatSupports.clear(); this._macroSupports.clear(); this._center = null;
      this._macroRevision++;
      this._lockedRegions.clear(); this._transfers.length = 0; this._pelagicFrames.clear(); this._planktonFaces.clear(); this._planktonDesiredRegions.clear();
    });
  }
}
