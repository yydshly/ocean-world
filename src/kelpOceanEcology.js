import { initializeKelpUnderstoryLife, tickKelpUnderstoryLife, validateKelpUnderstoryLifeRecord, captureKelpUnderstoryLife, kelpUnderstoryLifeRole, kelpUnderstoryLifeSnapshot, kelpUnderstoryLifeFoodBudgetError, kelpUnderstoryLifeEnergyBudgetError, KELP_UNDERSTORY_LIFE_ANIMAL_IDS } from './kelpUnderstoryLife.js';
import { initializeKelpNearBottomLife, tickKelpNearBottomLife, validateKelpNearBottomLifeRecord, captureKelpNearBottomLife, kelpNearBottomLifeRole, kelpNearBottomLifeSnapshot, kelpNearBottomLifeFoodBudgetError, kelpNearBottomLifeEnergyBudgetError, KELP_NEAR_BOTTOM_LIFE_IDS } from './kelpNearBottomLife.js';
import { KelpSimulation, DEFAULT_ENVIRONMENT } from './kelpSimulation.js';
import { initializeKelpBenthicLife, tickKelpBenthicLife, validateKelpBenthicLifeRecord, captureKelpBenthicLife, KELP_BENTHIC_LIFE_IDS } from './kelpBenthicLife.js';
import { initializeKelpWaterLife, tickKelpWaterLife, validateKelpWaterLifeRecord, captureKelpWaterLife, kelpWaterLifeRole, KELP_WATER_LIFE_IDS } from './kelpWaterLife.js';
import { KELP_SURFACE_Y, kelpLeafNormal } from './kelpHabitat.js';
import { KELP_OCEAN_SUPPORT_GEOMETRY_VERSION, createKelpOceanGenerator } from './kelpOceanGeneration.js';
import { migrateKelpSupport } from './kelpSupportMigration.js';
import { OceanEcologyStore } from './oceanEcologyStore.js';
import { upgradeKelpDrift, installKelpDriftHooks, validateKelpDriftRecord, kelpDriftBalanceError, KELP_DRIFT_PARAMETERS } from './kelpDriftEcology.js';
import { oceanRockHeight } from './oceanRockShape.js';
import { createKelpWaterCommunityPlan, kelpWaterElements, kelpWaterPositionValid, kelpWaterDynamicClearance,
  KELP_WATER_COMMUNITY_VERSION, KELP_WATER_MODEL } from './kelpWaterCommunity.js';
import { createKelpVisitorPlan, validateKelpVisitorRecord, tickKelpVisitors,
  KELP_VISITOR_COMMUNITY_VERSION } from './kelpVisitorCommunity.js';
import { createKelpUnderstoryPlan, validateKelpUnderstoryRecord, KELP_UNDERSTORY_SCENERY_VERSION } from './kelpUnderstory.js';
import { createKelpForestBeltPlans, validateKelpForestBeltPlan } from './kelpForestBelt.js';
import { createKelpSeascapePlans, validateKelpSeascapePlan, KELP_SEASCAPE_ANCHOR, KELP_SEASCAPE_OWNERS } from './kelpSeascape.js';

export const KELP_OCEAN_REGION_ANIMAL_LIMIT = 20;
export const KELP_OCEAN_REGION_PLANT_LIMIT = 3;
export const KELP_OCEAN_ACTIVE_REGION_LIMIT = 9;
const STEP = .1, SIZE = 64, AUTHORED_RADIUS = 40, TAU = Math.PI * 2;
const kelpBenthicIds = new Set(KELP_BENTHIC_LIFE_IDS);
const benthicMarked = record => record && (['kelpBenthicLifeVersion', 'kelpBenthicLifeInitializedAtSec', 'kelpBenthicLife', 'kelpBenthicAgents'].some(key => Object.hasOwn(record, key)) ||
  [record.state?.agents, record.waterAgents, record.visitorAgents].filter(Array.isArray).flat().some(agent => agent && (kelpBenthicIds.has(agent.speciesId) ||
    ['kelpBenthicIndividualVersion', 'kelpBenthicHostId', 'kelpBenthicSiteId', 'kelpBenthicFoodPatchId'].some(key => Object.hasOwn(agent, key)))));
const waterLifeIds = new Set(KELP_WATER_LIFE_IDS);
const waterLifeMarked = record => record && (Object.keys(record).some(key => key.startsWith('kelpWaterLife')) ||
  [record.state?.agents, record.waterAgents, record.visitorAgents, record.kelpBenthicAgents, record.kelpWaterLifeAgents].filter(Array.isArray).flat().some(agent => agent && (waterLifeIds.has(agent.speciesId) || Object.keys(agent).some(key => key.startsWith('kelpWaterLife')))));
const nearBottomIds = new Set(KELP_NEAR_BOTTOM_LIFE_IDS);
const nearBottomMarked = record => record && (Object.keys(record).some(key => key.startsWith('kelpNearBottom')) ||
  Object.keys(record.state ?? {}).some(key => key.startsWith('kelpNearBottom')) ||
  [record.state?.agents, record.waterAgents, record.visitorAgents, record.kelpBenthicAgents, record.kelpWaterLifeAgents, record.kelpNearBottomLifeAgents].filter(Array.isArray).flat().some(agent => agent && (nearBottomIds.has(agent.speciesId) || Object.keys(agent).some(key => key.startsWith('kelpNearBottom')))));
const understoryLifeIds = new Set(KELP_UNDERSTORY_LIFE_ANIMAL_IDS);
const understoryLifeMarked = record => record && (Object.keys(record).some(key => key.startsWith('kelpUnderstory')) ||
  Object.keys(record.state ?? {}).some(key => key.startsWith('kelpUnderstory')) ||
  [record.state?.agents, record.waterAgents, record.visitorAgents, record.kelpBenthicAgents, record.kelpWaterLifeAgents, record.kelpNearBottomLifeAgents, record.kelpUnderstoryLifeAgents].filter(Array.isArray).flat().some(agent => agent && (understoryLifeIds.has(agent.speciesId) || Object.keys(agent).some(key => key.startsWith('kelpUnderstory')))));
const animalIds = new Set(['purple-urchin', 'gumboot-chiton', 'bat-star', 'brown-turban-snail', 'giant-kelpfish']);
const stateFields = ['_rngState', '_ticks', '_accumulator', 'timeSec', 'environment', 'events', 'agents',
  'primaryProduction', 'totalPrimaryProduction', 'counters', 'ledger', '_nextSummary',
  'rockPatches', 'floorPatches', 'kelpPatches', 'leafPatches', 'preyPatches'];
const clone = value => structuredClone(value);
const worldKey = seed => `kelp-ecology-v1:${typeof seed}:${seed}`;
const finiteVector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const seascapeMarked = record => record && (record.forestBeltVersion === 2 || record.forestBeltPlan?.version === 2 ||
  ['kelpSeascapeVersion', 'kelpSeascapeGroupId', 'kelpSeascapeInitializedAtSec'].some(key => Object.hasOwn(record, key)));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const regionCoordinates = id => typeof id === 'string' && /^-?\d+,-?\d+$/.test(id) ? id.split(',').map(Number) : null;
function hash(value) {
  let state = 2166136261;
  for (const char of value) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return (state >>> 0) / 4294967296;
}
function normalAt(generator, x, z) {
  if(typeof generator.supportNormal==='function')return generator.supportNormal(x,z);
  const d = .015, dx = (generator.heightAt(x + d, z) - generator.heightAt(x - d, z)) / (2 * d);
  const dz = (generator.heightAt(x, z + d) - generator.heightAt(x, z - d)) / (2 * d), length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}

/** Independent loaded-region kelp ecology. Actual generated supports drive the
 * authored kelp model's existing local feeding rules; rates/pools remain
 * qualitative. Only up to three selected plant hosts are simulated per cell.
 * All other streamed kelp is scenery and is excluded from animal counts. */
export class KelpOceanEcology {
  constructor(seed, generator, { store = new OceanEcologyStore(), visitors = false, understory = false, forestBelt = false, kelpSeascape = false, benthicLife = false, waterLife = false, nearBottomLife = false, understoryLife = false } = {}) {
    this.seed = seed; this.generator = generator; this.store = store; this._world = worldKey(seed);
    this.visitorsEnabled = visitors === true;
    this._benthicLifeRequested = benthicLife === true;
    this.benthicLifeEnabled = this._benthicLifeRequested && generator.supportVersion >= 2 && typeof store.saveMany === 'function';
    this._benthicLifeBirths = new WeakSet();
    this._understoryLifeRequested = understoryLife === true;
    this.understoryLifeEnabled = this._understoryLifeRequested && generator.supportVersion === 2 && typeof store.saveMany === 'function';
    this._understoryLifeBirths = new WeakMap();
    this._nearBottomLifeRequested = nearBottomLife === true;
    this.nearBottomLifeEnabled = this._nearBottomLifeRequested && generator.supportVersion === 2 && typeof store.saveMany === 'function';
    this._nearBottomLifeBirths = new WeakMap();
    this._waterLifeRequested = waterLife === true;
    this.waterLifeEnabled = this._waterLifeRequested && generator.supportVersion === 2 && typeof store.saveMany === 'function';
    this._waterLifeBirths = new WeakMap();
    this.understoryEnabled = understory === true;
    this._forestBeltRequested = forestBelt === true;
    this.forestBeltEnabled = this._forestBeltRequested && this._forestBeltAvailable(generator);
    this._kelpSeascapeRequested = kelpSeascape === true;
    this.kelpSeascapeEnabled = this._kelpSeascapeRequested && this.forestBeltEnabled;
    this._active = new Map(); this._locked = new Set(); this._center = null; this._waterCells = new Map();
    this._waterFrames = new Map(); this._waterPlantFrames = new Map(); this._waterTransfers = [];
    this._waterContextMemo = new Map(); this._waterContextMemoActive = false;
    this._queue = Promise.resolve(); this._pending = this._queue; this._revision = 0; this._generation = 0;
    this._accumulator = 0; this._activeTime = 0; this._checkpointAt = 10; this._disposed = false;
    this.environment = { ...DEFAULT_ENVIRONMENT };
    this._counts = { generated: 0, restored: 0, saved: 0, unloaded: 0, persistenceErrors: 0 };
    this._storageError = null;
  }

  _forestBeltAvailable(generator) {
    return Boolean(typeof this.store.saveMany === 'function' && generator.supportVersion === 2 && generator.baseGenerator &&
      typeof generator.withForestPlans === 'function' && typeof generator.setForestPlans === 'function' &&
      typeof generator.forestBeltPlan === 'function');
  }

  _savedForestPlan(record, cx, cz) {
    if (seascapeMarked(record)) {
      const plan = record.forestBeltPlan;
      if (!this.kelpSeascapeEnabled || record.forestBeltVersion !== 2 || record.supportGeometryVersion !== 2 ||
          record.forestBeltInitializedAtSec !== 0 || record.kelpSeascapeVersion !== 1 ||
          record.kelpSeascapeGroupId !== `${KELP_SEASCAPE_ANCHOR.cx},${KELP_SEASCAPE_ANCHOR.cz}` ||
          record.kelpSeascapeInitializedAtSec !== 0 || !KELP_SEASCAPE_OWNERS.includes(`${cx},${cz}`) ||
          plan?.version !== 2 || plan.id !== `${cx},${cz}` || plan.cx !== cx || plan.cz !== cz ||
          !validateKelpSeascapePlan(this.generator.baseGenerator, plan))
        throw new Error('Invalid saved kelp seascape; original landscape and population were not regenerated.');
      return plan;
    }
    const has = record && ['forestBeltVersion', 'forestBeltInitializedAtSec', 'forestBeltPlan'].some(key => Object.hasOwn(record, key));
    if (!has) return null;
    if (!this.forestBeltEnabled || record.forestBeltVersion !== 1 || record.supportGeometryVersion !== 2 ||
        !nonnegative(record.forestBeltInitializedAtSec) || record.forestBeltInitializedAtSec > record.state?.timeSec ||
        record.forestBeltPlan?.id !== `${cx},${cz}` || record.forestBeltPlan.cx !== cx || record.forestBeltPlan.cz !== cz ||
        !validateKelpForestBeltPlan(record.forestBeltPlan, this.generator.baseGenerator))
      throw new Error('Invalid saved kelp forest belt; original landscape and population were not regenerated.');
    return record.forestBeltPlan;
  }

  _plan(cx, cz, generator = this.generator) {
    const chunk = generator.chunk(cx, cz), random = salt => hash(`${this._world}|${chunk.id}|${salt}`);
    const inside = item => Math.hypot(item.x, item.z) > AUTHORED_RADIUS + 1 &&
      item.x > cx * SIZE + 3 && item.x < (cx + 1) * SIZE - 3 &&
      item.z > cz * SIZE + 3 && item.z < (cz + 1) * SIZE - 3;
    const allRocks = chunk.elements.filter(item => item.kind === 'rock' && inside(item));
    const kelps = chunk.elements.filter(item => item.kind === 'kelp' && inside(item) &&
      allRocks.some(rock => rock.id === item.hostId)).sort((a, b) => random(`kelp:${a.id}`) - random(`kelp:${b.id}`)).slice(0, 3);
    const hostIds = new Set(kelps.map(item => item.hostId));
    const rocks = [...allRocks.filter(item => hostIds.has(item.id)),
      ...allRocks.filter(item => !hostIds.has(item.id)).sort((a, b) => random(`rock:${a.id}`) - random(`rock:${b.id}`))].slice(0, 3);
    const anchors = kelps.map(item => ({ ...item.anchor, rockIndex: rocks.findIndex(rock => rock.id === item.hostId),
      sceneryId: item.id, lengthM: item.lengthM ?? item.anchor.lengthM }));
    const floorSites = [];
    for (const [fx, fz] of [[.3, .3], [.7, .7], [.3, .7], [.7, .3]]) {
      const x = (cx + fx) * SIZE, z = (cz + fz) * SIZE;
      if (Math.hypot(x, z) <= AUTHORED_RADIUS + 2) continue;
      const sample = generator.sample(x, z);
      if (generator.heightAt(x, z) - sample.floorY > .03) continue;
      floorSites.push([x, z]);
      if (floorSites.length === 2) break;
    }
    const tuples = rocks.map(rock => {
      const width = Math.min(rock.scale.x, rock.scale.z) * .6;
      return [rock.x, rock.y, rock.z, width, rock.scale.y, width];
    });
    return { anchors, rocks, options: { anchors, rocks: tuples, floorSites,
      groundCounts: [['purple-urchin', rocks.length ? 2 + Math.floor(random('urchins') * 3) : 0],
        ['gumboot-chiton', rocks.length ? 1 + Math.floor(random('chitons') * 2) : 0]],
      fishHostIndices: anchors.map((_, index) => index).filter(index => random(`fish:${index}`) < .72),
      bounds: { x: [cx * SIZE + .5, (cx + 1) * SIZE - .5], y: [-1e6, KELP_SURFACE_Y - .5], z: [cz * SIZE + .5, (cz + 1) * SIZE - .5] },
      surfaceY: KELP_SURFACE_Y, idPrefix: `kelp-ocean:${chunk.id}:`,
      supportHeight: (x, z) => generator.heightAt(x, z), supportNormal: (x, z) => normalAt(generator, x, z),
      rockHeight: (index, x, z) => oceanRockHeight(rocks[index], x, z) ?? -Infinity,
      lightAtHeight: (y, light) => light * Math.exp(-.055 * Math.max(0, KELP_SURFACE_Y - y)),
    } };
  }

  _create(cx, cz, { waterLifeFresh = false, nearBottomLifeFresh = false, understoryLifeFresh = false } = {}) {
    const id = `${cx},${cz}`, plan = this._plan(cx, cz);
    const waterRole = waterLifeFresh && this.waterLifeEnabled && kelpWaterLifeRole(this.generator, cx, cz);
    // Only the unvisited role recipe changes: six native animals at most,
    // four old schooling fish, one visitor, two bottom representatives and
    // seven new water animals share the original twenty-record budget.
    if (waterRole) {
      plan.options = { ...plan.options, anchors: plan.options.anchors.slice(0, 2),
        floorSites: plan.options.floorSites.slice(0, 1),
        fishHostIndices: plan.options.fishHostIndices.filter(index => index < 2).slice(0, 1),
        groundCounts: [['purple-urchin', plan.rocks.length ? 1 : 0], ['gumboot-chiton', plan.rocks.length ? 1 : 0]] };
    }
    const sim = new KelpSimulation(`${this._world}|${id}`, plan.options);
    for (const agent of sim.agents) {
      agent.regionId = id;
      if (agent.speciesId === 'giant-kelp') agent.sceneryId = agent.anchor.sceneryId;
      else if (agent.speciesId !== 'giant-kelpfish' && !agent.attachment) agent.supportNormal = normalAt(this.generator, agent.position.x, agent.position.z);
    }
    const region = { id, cx, cz, habitat: this.generator.sample((cx + .5) * SIZE, (cz + .5) * SIZE).habitat, sim, waterAgents: [], visitorAgents: [], understoryPlants: [],
      supportGeometryVersion: this.generator.supportVersion ?? KELP_OCEAN_SUPPORT_GEOMETRY_VERSION };
    if (waterLifeFresh && this.waterLifeEnabled) this._waterLifeBirths.set(region, waterRole);
    if (nearBottomLifeFresh && this.nearBottomLifeEnabled) this._nearBottomLifeBirths.set(region, kelpNearBottomLifeRole(this.generator, cx, cz));
    if (understoryLifeFresh && this.understoryLifeEnabled) this._understoryLifeBirths.set(region, kelpUnderstoryLifeRole(this.generator, cx, cz));
    return region;
  }

  _legacySupport(cx, cz) {
    this._legacyGenerator ??= createKelpOceanGenerator(this.seed, { supportVersion: 1 });
    return { generator: this._legacyGenerator, rockHeight: this._plan(cx, cz, this._legacyGenerator).options.rockHeight };
  }

  _driftValidation(region, generator = this.generator) {
    const legacy = generator.supportVersion >= 2 ? this._legacySupport(region.cx, region.cz) : null;
    return { generator, historyGenerator: legacy?.generator, historyRockHeight: legacy?.rockHeight };
  }

  _record(region) {
    const state = { ...clone(region._savedState ?? {}), ...Object.fromEntries(stateFields.map(field => [field, clone(region.sim[field])])) };
    return { ...clone(region._savedRecord ?? {}), ...captureKelpBenthicLife(region), ...captureKelpWaterLife(region), ...captureKelpNearBottomLife(region), ...captureKelpUnderstoryLife(region), version: 1, id: region.id, cx: region.cx, cz: region.cz, habitat: region.habitat, state,
      ...(region.driftCommunityVersion !== undefined ? { driftCommunityVersion: region.driftCommunityVersion,
        driftPatches: clone(region.driftPatches), driftLedger: clone(region.driftLedger) } : {}),
      ...(region.supportGeometryVersion!==undefined?{supportGeometryVersion:region.supportGeometryVersion}:{}),
      ...(region.forestBeltVersion !== undefined ? { forestBeltVersion: region.forestBeltVersion,
        forestBeltInitializedAtSec: region.forestBeltInitializedAtSec, forestBeltPlan: clone(region.forestBeltPlan) } : {}),
      ...(region.kelpSeascapeVersion !== undefined ? { kelpSeascapeVersion: region.kelpSeascapeVersion,
        kelpSeascapeGroupId: region.kelpSeascapeGroupId, kelpSeascapeInitializedAtSec: region.kelpSeascapeInitializedAtSec } : {}),
      ...(region.waterEverOccupied !== undefined ? { waterEverOccupied: region.waterEverOccupied } : {}),
      ...(region.waterCommunityVersion !== undefined ? { waterCommunityVersion: region.waterCommunityVersion,
        waterCommunityAdded: region.waterCommunityAdded ?? 0, waterInitializedAtSec: region.waterInitializedAtSec ?? region.sim.timeSec,
        waterAgents: clone(region.waterAgents) } : region.waterAgents.length ? { waterAgents: clone(region.waterAgents) } : {}),
      ...(region.visitorCommunityVersion !== undefined ? { visitorCommunityVersion: region.visitorCommunityVersion,
        visitorInitializedAtSec: region.visitorInitializedAtSec, visitorAgents: clone(region.visitorAgents) } : {}),
      ...(region.understorySceneryVersion !== undefined ? { understorySceneryVersion: region.understorySceneryVersion,
        understoryInitializedAtSec: region.understoryInitializedAtSec, understoryPlants: clone(region.understoryPlants) } : {}) };
  }

  _restore(record, cx, cz) {
    if (record?.version !== 1 || record.id !== `${cx},${cz}` || record.cx !== cx || record.cz !== cz ||
        !stateFields.every(field => Object.hasOwn(record.state || {}, field)) || !Array.isArray(record.state.agents) ||
        !Number.isFinite(record.state.timeSec) || record.state.timeSec < 0 ||
        record.state.agents.filter(agent => animalIds.has(agent.speciesId)).length > KELP_OCEAN_REGION_ANIMAL_LIMIT ||
        record.state.agents.filter(agent => agent.speciesId === 'giant-kelp').length > KELP_OCEAN_REGION_PLANT_LIMIT) {
      throw new Error(`Saved kelp region ${cx},${cz} is invalid; population was not regenerated.`);
    }
    const state = record.state;
    const forestPlan = this._savedForestPlan(record, cx, cz);
    const supportVersion = this.generator.supportVersion ?? KELP_OCEAN_SUPPORT_GEOMETRY_VERSION;
    if(record.supportGeometryVersion!==undefined&&(!Number.isInteger(record.supportGeometryVersion)||record.supportGeometryVersion<1 || record.supportGeometryVersion > supportVersion))
      throw new Error('Invalid saved kelp support geometry version.');
    if (!Number.isSafeInteger(state._ticks) || state._ticks < 0 || !Number.isSafeInteger(state._rngState) ||
        !nonnegative(state._accumulator) || state._accumulator >= STEP + 1e-8 ||
        !['primaryProduction', 'totalPrimaryProduction', '_nextSummary'].every(key => nonnegative(state[key])) ||
        !['currentMps', 'deformationCurrentMps', 'turbidity', 'foodSupply', 'hour'].every(key => nonnegative(state.environment?.[key])) ||
        !['initial', 'input', 'ingested', 'exported'].every(key => nonnegative(state.ledger?.[key])) ||
        !['grazingCount', 'feedingCount', 'approachCount', 'shelterCount', 'deathCount'].every(key => nonnegative(state.counters?.[key])) ||
        !Array.isArray(state.events) || state.events.length > 60) throw new Error('Invalid saved kelp clock or ledger.');
    for (const name of ['rockPatches', 'floorPatches', 'kelpPatches', 'leafPatches', 'preyPatches']) {
      if (!Array.isArray(state[name]) || state[name].length > 32) throw new Error('Invalid saved kelp resource patches.');
      for (const patch of state[name]) {
        if (!patch || typeof patch.id !== 'string' ||
            (name === 'rockPatches' || name === 'floorPatches' ?
              !finiteVector(patch.position) || !nonnegative(patch.algae) || !nonnegative(patch.detritus) :
              typeof patch.hostId !== 'string' || !nonnegative(patch[name === 'kelpPatches' ? 'kelpTissue' : name === 'leafPatches' ? 'biofilm' : 'smallPrey']))) {
          throw new Error('Invalid saved kelp resource quantity.');
        }
      }
    }
    const groundPatches = [...state.rockPatches, ...state.floorPatches];
    const sumPool = (patches, key) => patches.reduce((total, patch) => total + patch[key], 0);
    const resourceTotal = [sumPool(groundPatches, 'algae'), sumPool(state.leafPatches, 'biofilm'),
      sumPool(groundPatches, 'detritus'), sumPool(state.preyPatches, 'smallPrey'),
      sumPool(state.kelpPatches, 'kelpTissue')].reduce((total, value) => total + value, 0) +
      (Array.isArray(record.driftPatches) ? sumPool(record.driftPatches, 'stock') : 0);
    const expectedTotal = state.ledger.initial + state.ledger.input - state.ledger.ingested - state.ledger.exported;
    // Allow accumulated floating-point rounding in relative reference pools;
    // a missing/altered pool must never activate with an inconsistent ledger.
    const balanceTolerance = 1e-8 * Math.max(1, state.ledger.initial, state.ledger.input,
      state.ledger.ingested, state.ledger.exported);
    if (!Number.isFinite(resourceTotal) || !Number.isFinite(expectedTotal) ||
        Math.abs(resourceTotal - expectedTotal) > balanceTolerance) {
      throw new Error('Saved kelp resource ledger does not balance.');
    }
    const ids = new Set();
    for (const agent of record.state.agents) {
      if (!agent || typeof agent.id !== 'string' || ids.has(agent.id) ||
          (!animalIds.has(agent.speciesId) && agent.speciesId !== 'giant-kelp') ||
          !['position', 'home', 'target', 'velocity'].every(key => finiteVector(agent[key])) ||
          !nonnegative(agent.sizeM) || agent.sizeM === 0 || !nonnegative(agent.energy) || typeof agent.alive !== 'boolean' ||
          !nonnegative(agent.nextBite) || !nonnegative(agent.nextDecision) || !Number.isFinite(agent.heading)) {
        throw new Error('Invalid saved kelp animal record.');
      }
      if (agent.speciesId === 'giant-kelp' && (!finiteVector(agent.anchor) || !nonnegative(agent.anchor.lengthM) ||
          !Number.isInteger(agent.anchor.rockIndex) || agent.anchor.rockIndex < 0 ||
          !Number.isFinite(agent.anchor.phase) || !nonnegative(agent.initialSizeM))) throw new Error('Invalid saved kelp host.');
      ids.add(agent.id);
    }
    const hostIds = new Set(state.agents.filter(agent => agent.speciesId === 'giant-kelp').map(agent => agent.id));
    for (const agent of state.agents) {
      if (agent.speciesId === 'giant-kelpfish' && !hostIds.has(agent.hostId)) throw new Error('Saved kelpfish host is missing.');
      if (agent.speciesId === 'brown-turban-snail' && (!hostIds.has(agent.attachment?.hostId) ||
          !Number.isInteger(agent.attachment.leafIndex) || agent.attachment.leafIndex < 0 || agent.attachment.leafIndex >= 54 ||
          !nonnegative(agent.attachment.along) || agent.attachment.along > 1)) throw new Error('Saved snail host is missing.');
      if (agent.speciesId === 'brown-turban-snail' && !state.leafPatches.some(patch =>
        patch.hostId === agent.attachment.hostId && patch.leafIndex === agent.attachment.leafIndex)) {
        throw new Error('Saved snail leaf food patch is missing.');
      }
    }
    for (const name of ['kelpPatches', 'leafPatches', 'preyPatches']) {
      if (state[name].some(patch => !hostIds.has(patch.hostId))) throw new Error('Saved resource host is missing.');
    }
    const region = this._create(cx, cz);
    for (const field of stateFields) region.sim[field] = clone(record.state[field]);
    region._savedState = clone(record.state);
    region.sim.groundPatches = [...region.sim.rockPatches, ...region.sim.floorPatches];
    region.sim.hostById = new Map(region.sim.agents.filter(agent => agent.speciesId === 'giant-kelp').map(agent => [agent.id, agent]));
    const legacy = supportVersion >= 2 && (record.supportGeometryVersion ?? 1) < 2 ? this._legacySupport(cx, cz) : null;
    const savedGenerator = legacy?.generator ?? this.generator;
    const validationRegion = legacy ? { ...region, sim: Object.assign(Object.create(Object.getPrototypeOf(region.sim)), region.sim, { rockHeight: legacy.rockHeight }) } : region;
    if (!validateKelpDriftRecord(record, validationRegion, this._driftValidation(region, savedGenerator))) throw new Error('Invalid saved kelp-drift inventory or contact history.');
    region._savedRecord = clone(record);
    if (forestPlan) {
      region.forestBeltVersion = record.forestBeltVersion;
      region.forestBeltInitializedAtSec = record.forestBeltInitializedAtSec;
      region.forestBeltPlan = clone(forestPlan);
      if (forestPlan.version === 2) {
        region.kelpSeascapeVersion = record.kelpSeascapeVersion;
        region.kelpSeascapeGroupId = record.kelpSeascapeGroupId;
        region.kelpSeascapeInitializedAtSec = record.kelpSeascapeInitializedAtSec;
      }
    }
    if (record.driftCommunityVersion !== undefined) {
      region.driftCommunityVersion = record.driftCommunityVersion;
      region.driftPatches = clone(record.driftPatches); region.driftLedger = clone(record.driftLedger);
      // Restored positive inventory belongs in the resource budget before
      // activation too. Process hooks remain gated by the committed owner.
      installKelpDriftHooks(region, { generator: this.generator,
        enabled: () => this._active.get(region.id) === region && typeof this.store.saveMany === 'function' });
    }
    region.habitat = record.habitat;
    region.supportGeometryVersion=record.supportGeometryVersion??0;
    if (record.waterAgents !== undefined && !Array.isArray(record.waterAgents)) throw new Error('Invalid saved water-layer array.');
    if (record.waterCommunityVersion !== undefined && (!Number.isInteger(record.waterCommunityVersion) || record.waterCommunityVersion < 1 ||
        !Array.isArray(record.waterAgents) || !nonnegative(record.waterInitializedAtSec))) throw new Error('Invalid saved water-layer version.');
    region.waterAgents = clone(record.waterAgents ?? []);
    if (record.waterEverOccupied !== undefined && typeof record.waterEverOccupied !== 'boolean') throw new Error('Invalid saved water occupancy marker.');
    if (record.waterEverOccupied !== undefined) region.waterEverOccupied = record.waterEverOccupied;
    if (state.agents.filter(agent => animalIds.has(agent.speciesId)).length + region.waterAgents.length > KELP_OCEAN_REGION_ANIMAL_LIMIT) {
      throw new Error('Saved water-layer population exceeds the regional cap.');
    }
    for (const agent of region.waterAgents) {
      if (!agent || typeof agent.id !== 'string' || ids.has(agent.id) || agent.speciesId !== 'blue-rockfish' ||
          typeof agent.groupId !== 'string' || agent.regionId !== region.id ||
          !finiteVector(agent.position) || !finiteVector(agent.velocity) || !finiteVector(agent.schoolHome) ||
          !['sizeM', 'energy', 'createdAtSec', 'stateSince', 'nextBite', 'timeSec', 'preferredDepthM', 'orbitRadiusM', 'schoolRadiusM'].every(key => nonnegative(agent[key])) ||
          !['heading', 'schoolPhaseRad', 'individualPhaseRad', 'patrolPeriodSec'].every(key => Number.isFinite(agent[key])) ||
          agent.sizeM <= 0 || agent.patrolPeriodSec <= 0 || !Number.isInteger(agent.schoolSlot) || agent.schoolSlot < 0 ||
          typeof agent.alive !== 'boolean' || (agent.lastFeedAt !== null && !nonnegative(agent.lastFeedAt))) throw new Error('Invalid saved water-layer animal.');
      const mobile = agent.waterRoamingVersion !== undefined;
      const birth = regionCoordinates(agent.birthRegionId);
      if (mobile && (agent.waterRoamingVersion !== 1 || !birth || !birth.every(Number.isSafeInteger) ||
        !nonnegative(agent.mobileTimeSec) || !nonnegative(agent.roamingSchoolStartedAtSec) ||
        !nonnegative(agent.roamingSchoolRadiusM) || agent.roamingSchoolRadiusM <= 0 ||
        !nonnegative(agent.roamingSchoolPeriodSec) || agent.roamingSchoolPeriodSec <= 0 ||
        !Number.isFinite(agent.roamingSchoolPhaseRad) || !finiteVector(agent.roamingSchoolHome) ||
        (agent.schoolAvoidance !== undefined && (!Number.isFinite(agent.schoolAvoidance?.headingRad) || !nonnegative(agent.schoolAvoidance?.untilSec))) ||
        (agent.crossings !== undefined && (!Number.isSafeInteger(agent.crossings) || agent.crossings < 0)))) {
        throw new Error('Invalid saved water-layer roaming metadata.');
      }
      const owns = (point, x, z, margin) => Math.floor(point.x / SIZE) === x && Math.floor(point.z / SIZE) === z &&
        point.x >= x * SIZE + margin && point.x <= (x + 1) * SIZE - margin &&
        point.z >= z * SIZE + margin && point.z <= (z + 1) * SIZE - margin;
      if (!owns(agent.position, cx, cz, mobile ? 0 : .6) ||
        !owns(agent.schoolHome, mobile ? birth[0] : cx, mobile ? birth[1] : cz, .6)) throw new Error('Saved water-layer coordinates do not belong to their owner or birth region.');
      // Historical dead bodies retain their stored pose. For living fish, the
      // static support footprint/ceiling must be legal before publication;
      // moving-plant envelopes remain a finite next-step controller.
      if (agent.alive && !kelpWaterPositionValid(savedGenerator, agent.position, agent.sizeM,
        { cx, cz, elements: [], ownerMarginM: mobile ? 0 : .6 })) throw new Error('Saved water-layer body has no static water clearance.');
      ids.add(agent.id);
    }
    if (record.waterCommunityVersion !== undefined) {
      region.waterCommunityVersion = record.waterCommunityVersion;
      region.waterCommunityAdded = record.waterCommunityAdded ?? 0;
      region.waterInitializedAtSec = record.waterInitializedAtSec;
    }
    if (record.visitorCommunityVersion !== undefined && (record.supportGeometryVersion ?? 1) < 2)
      throw new Error('Kelp visitors require support geometry v2; saved population was not regenerated.');
    if (!validateKelpVisitorRecord(record, region, savedGenerator, ids)) throw new Error('Invalid saved kelp visitor; population was not regenerated.');
    region.visitorAgents = clone(record.visitorAgents ?? []);
    if (this._waterRegionCount(region) > KELP_OCEAN_REGION_ANIMAL_LIMIT) throw new Error('Saved combined kelp population exceeds the regional cap.');
    if (record.visitorCommunityVersion !== undefined) {
      region.visitorCommunityVersion = record.visitorCommunityVersion;
      region.visitorInitializedAtSec = record.visitorInitializedAtSec;
    }
    if (!validateKelpUnderstoryRecord(record, region, savedGenerator)) throw new Error('Invalid saved kelp understory scenery; old population was not regenerated.');
    region.understoryPlants = clone(record.understoryPlants ?? []);
    if (record.understorySceneryVersion !== undefined) {
      region.understorySceneryVersion = record.understorySceneryVersion;
      region.understoryInitializedAtSec = record.understoryInitializedAtSec;
    }
    if (!validateKelpBenthicLifeRecord(record, region, { generator: savedGenerator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid saved kelp bottom-life community; original animals and inventory were not regenerated.');
    if (record.kelpBenthicLifeVersion !== undefined) {
      for (const key of ['kelpBenthicLifeVersion', 'kelpBenthicLifeInitializedAtSec', 'kelpBenthicLife', 'kelpBenthicAgents']) region[key] = clone(record[key]);
    }
    if (!validateKelpWaterLifeRecord(record, region, { generator: savedGenerator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid saved kelp water-life community; original animals and inventory were not regenerated.');
    if (record.kelpWaterLifeVersion !== undefined) {
      for (const key of ['kelpWaterLifeVersion', 'kelpWaterLifeInitializedAtSec', 'kelpWaterLife', 'kelpWaterLifeAgents']) region[key] = clone(record[key]);
    }
    if (!validateKelpNearBottomLifeRecord(record, region, { generator: savedGenerator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid saved kelp near-bottom community; original animals and inventory were not regenerated.');
    if (record.kelpNearBottomLifeVersion !== undefined) {
      for (const key of ['kelpNearBottomLifeVersion', 'kelpNearBottomLifeInitializedAtSec', 'kelpNearBottomLife', 'kelpNearBottomLifeAgents', 'kelpNearBottomEnergyLedger']) region[key] = clone(record[key]);
    }
    if (!validateKelpUnderstoryLifeRecord(record, region, { generator: savedGenerator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid saved kelp understory community; plants, animals and inventory were not regenerated.');
    if (record.kelpUnderstoryLifeVersion !== undefined) {
      for (const key of ['kelpUnderstoryLifeVersion','kelpUnderstoryLifeInitializedAtSec','kelpUnderstoryLife','kelpUnderstoryLifeAgents','kelpUnderstoryEnergyLedger']) region[key] = clone(record[key]);
    }
    if (this._waterRegionCount(region) > KELP_OCEAN_REGION_ANIMAL_LIMIT) throw new Error('Saved complete kelp community exceeds the regional cap.');
    return region;
  }

  _initialAnimalCapacity(region) { return this._waterLifeBirths.get(region) === true ?
    KELP_OCEAN_REGION_ANIMAL_LIMIT - 7 - (this._benthicLifeBirths.has(region) ? 2 : 0) :
    KELP_OCEAN_REGION_ANIMAL_LIMIT - (this._benthicLifeBirths.has(region) ? 4 : 0); }

  _initializeBenthicLife(region, fresh) {
    const changed = initializeKelpBenthicLife(this.generator, region, { fresh: fresh && this.benthicLifeEnabled, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT - (this._waterLifeBirths.get(region) === true ? 7 : 0), maxAdded: this._waterLifeBirths.get(region) === true ? 2 : 4 });
    this._benthicLifeBirths.delete(region);
    if (changed && !validateKelpBenthicLifeRecord(this._record(region), region, { generator: this.generator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid fresh kelp bottom-life community; no population was published.');
    return changed;
  }

  _initializeWaterLife(region, fresh) {
    const changed = initializeKelpWaterLife(this.generator, region, { fresh: fresh && this.waterLifeEnabled,
      role: this._waterLifeBirths.get(region) === true, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT, maxAdded: 7 });
    this._waterLifeBirths.delete(region);
    if (changed && !validateKelpWaterLifeRecord(this._record(region), region, { generator: this.generator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid fresh kelp water-life community; no population was published.');
    return changed;
  }

  _initializeNearBottomLife(region, fresh) {
    const changed = initializeKelpNearBottomLife(this.generator, region, { fresh: fresh && this.nearBottomLifeEnabled,
      role: this._nearBottomLifeBirths.get(region) === true, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT, maxAdded: 4 });
    this._nearBottomLifeBirths.delete(region);
    if (changed && !validateKelpNearBottomLifeRecord(this._record(region), region, { generator: this.generator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid fresh kelp near-bottom community; no population was published.');
    return changed;
  }

  _initializeUnderstoryLife(region, fresh) {
    const changed = initializeKelpUnderstoryLife(this.generator, region, { fresh: fresh && this.understoryLifeEnabled,
      role: this._understoryLifeBirths.get(region) === true, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT, maxAdded: 4, maxPlants: 12 });
    this._understoryLifeBirths.delete(region);
    if (changed && !validateKelpUnderstoryLifeRecord(this._record(region), region, { generator: this.generator, capacity: KELP_OCEAN_REGION_ANIMAL_LIMIT }))
      throw new Error('Invalid fresh kelp understory community; no new plants or animals were published.');
    return changed;
  }

  get understoryLifeRegions() {
    return [...this._active.values()].filter(region => region.kelpUnderstoryLifeVersion === 1).map(region => ({
      id: region.id, cx: region.cx, cz: region.cz, timeSec: region.sim.timeSec, localEnvironment: region.sim.environment,
      understoryLife: { plants: region.kelpUnderstoryLife.plants } }));
  }

  _upgradeUnderstory(region) {
    if (region.kelpBenthicLifeVersion === 1 || region.kelpWaterLifeVersion === 1 || region.kelpNearBottomLifeVersion === 1 || region.kelpUnderstoryLifeVersion === 1) return false;
    if (!this.understoryEnabled || typeof this.store.saveMany !== 'function' ||
        (this.generator.supportVersion ?? KELP_OCEAN_SUPPORT_GEOMETRY_VERSION) < 2 || region.understorySceneryVersion !== undefined) return false;
    const nativePlan = this._plan(region.cx, region.cz);
    region.understoryPlants = createKelpUnderstoryPlan(this.generator, this.generator.chunk(region.cx, region.cz), {
      seed: this.seed, excludedHostIds: nativePlan.rocks.map(rock => rock.id), reservedAnchors: nativePlan.anchors,
      occupiedAgents: [...region.sim.agents, ...region.waterAgents, ...region.visitorAgents],
      floorSites: region.sim.floorPatches.map(patch => patch.position) });
    region.understorySceneryVersion = KELP_UNDERSTORY_SCENERY_VERSION;
    region.understoryInitializedAtSec = region.sim.timeSec;
    return true;
  }

  get understoryRegions() {
    return [...this._active.values()].filter(region => region.understorySceneryVersion === 1).map(region => ({
      id: region.id, cx: region.cx, cz: region.cz, timeSec: region.sim.timeSec,
      localEnvironment: region.sim.environment, understoryPlants: region.understoryPlants }));
  }

  _upgradeVisitors(region) {
    if (region.kelpBenthicLifeVersion === 1 || region.kelpWaterLifeVersion === 1 || region.kelpNearBottomLifeVersion === 1 || region.kelpUnderstoryLifeVersion === 1) return false;
    if (!this.visitorsEnabled || (this.generator.supportVersion ?? KELP_OCEAN_SUPPORT_GEOMETRY_VERSION) < 2 || typeof this.store.saveMany !== 'function' ||
        region.visitorCommunityVersion >= KELP_VISITOR_COMMUNITY_VERSION) return false;
    const capacity = Math.min(this._waterLifeBirths.get(region) === true ? 1 : Infinity, this._initialAnimalCapacity(region) - this._waterRegionCount(region));
    const plan = createKelpVisitorPlan(this.generator, region, { seed: this.seed, capacity });
    region.visitorAgents.push(...plan.placements);
    region.visitorCommunityVersion = KELP_VISITOR_COMMUNITY_VERSION;
    region.visitorInitializedAtSec = region.sim.timeSec;
    return true;
  }

  _upgradeSupport(region){
    const changed = migrateKelpSupport(region, this.generator, this.generator.supportVersion ?? KELP_OCEAN_SUPPORT_GEOMETRY_VERSION);
    if (changed && !validateKelpDriftRecord(this._record(region), region, this._driftValidation(region)))
      throw new Error('Migrated kelp-drift support is invalid; old inventory was not replaced.');
    return changed;
  }

  _upgradeWater(region) {
    if (region.kelpBenthicLifeVersion === 1 || region.kelpWaterLifeVersion === 1 || region.kelpNearBottomLifeVersion === 1 || region.kelpUnderstoryLifeVersion === 1) return false;
    if (region.waterCommunityVersion >= KELP_WATER_COMMUNITY_VERSION) return false;
    const capacity = Math.min(this._waterLifeBirths.get(region) === true ? 4 : Infinity, this._initialAnimalCapacity(region) - this._waterRegionCount(region));
    const hosts = [...region.sim.hostById.values()].map(plant => ({ id: plant.id, sceneryId: plant.sceneryId,
      anchor: region.sim.getKelpAnchor(plant.id), preyFraction: region.sim.preyPatches.find(patch => patch.hostId === plant.id)?.fraction ?? .36 }));
    const plan = region.waterAgents.length || region.waterEverOccupied ? { placements: [] } : createKelpWaterCommunityPlan(this.generator,
      this.generator.chunk(region.cx, region.cz), { seed: this.seed, hosts, timeSec: region.sim.timeSec,
        environment: region.sim.environment, capacity });
    region.waterAgents.push(...plan.placements);
    region.waterCommunityVersion = KELP_WATER_COMMUNITY_VERSION;
    region.waterCommunityAdded = plan.placements.length; region.waterInitializedAtSec = region.sim.timeSec;
    return true;
  }

  _upgradeWaterMobility(region) {
    if (typeof this.store.saveMany !== 'function') return false;
    let changed = false;
    for (const agent of region.waterAgents) {
      if (!region.waterEverOccupied) { region.waterEverOccupied = true; changed = true; }
      if (agent.waterRoamingVersion >= 1) continue;
      agent.birthRegionId ??= agent.regionId;
      agent.mobileTimeSec ??= region.sim.timeSec;
      const phase = agent.schoolPhaseRad + (region.sim.timeSec - agent.createdAtSec) * TAU / agent.patrolPeriodSec;
      const random = salt => hash(`${this._world}|${agent.birthRegionId}|${agent.groupId}|${salt}`);
      agent.roamingSchoolRadiusM ??= 80 + random('roaming-radius') * 16;
      agent.roamingSchoolPeriodSec ??= 3200 + random('roaming-period') * 400;
      agent.roamingSchoolPhaseRad ??= phase;
      agent.roamingSchoolStartedAtSec ??= agent.mobileTimeSec;
      // The larger reference route starts at the old small orbit's target.
      // This changes only intention, never the saved position or old fields.
      agent.roamingSchoolHome ??= {
        x: agent.schoolHome.x + Math.cos(phase) * (agent.orbitRadiusM - agent.roamingSchoolRadiusM),
        y: agent.schoolHome.y,
        z: agent.schoolHome.z + Math.sin(phase) * (agent.orbitRadiusM - agent.roamingSchoolRadiusM),
      };
      agent.waterRoamingVersion = 1; changed = true;
    }
    return changed;
  }

  _waterMobile(agent) {
    return agent.speciesId === 'blue-rockfish' && agent.waterRoamingVersion >= 1 && typeof this.store.saveMany === 'function';
  }

  _prepareWaterFrames() {
    this._clearWaterContextMemo();
    this._waterFrames.clear(); this._waterPlantFrames.clear();
    for (const region of this._active.values()) for (const agent of region.waterAgents) {
      if (!agent.alive || !this._waterMobile(agent)) continue;
      let frame = this._waterFrames.get(agent.groupId);
      if (!frame) { frame = { members: [], centroid: { x: 0, y: 0, z: 0 } }; this._waterFrames.set(agent.groupId, frame); }
      frame.members.push({ id: agent.id, regionId: region.id, position: { ...agent.position } });
    }
    for (const frame of this._waterFrames.values()) {
      frame.members.sort((a, b) => a.id.localeCompare(b.id));
      for (const axis of ['x', 'y', 'z']) frame.centroid[axis] = frame.members.reduce((sum, member) => sum + member.position[axis], 0) / frame.members.length;
    }
  }

  _prepareWaterPlantFrames() {
    // All local plant models finish their one tick before any water agent.
    // Nearby plants use their own geographic clock, including differently
    // aged owners across a seam, regardless of regional Map iteration order.
    this._clearWaterContextMemo(); this._waterPlantFrames.clear();
    for (const region of this._active.values()) {
      const anchors = new Map([...region.sim.hostById.values()].map(plant => [plant.sceneryId, region.sim.getKelpAnchor(plant.id)]));
      this._waterPlantFrames.set(region.id, { timeSec: region.sim.timeSec, environment: { ...region.sim.environment }, anchors });
    }
  }

  _clearWaterContextMemo() {
    this._waterContextMemo.clear(); this._waterContextMemoActive = false;
  }

  _mobileWaterContext(point, seconds = 0) {
    const cx = Math.floor(point.x / SIZE), cz = Math.floor(point.z / SIZE), id = `${cx},${cz}`, region = this._active.get(id);
    const memoize = this._waterContextMemoActive && Number.isFinite(seconds);
    const cached = memoize && this._waterContextMemo.get(id)?.get(seconds);
    if (cached) return cached;
    const context = region ? this._waterContext(region) : { cx, cz, elements: [] };
    const result = { ...context, ownerMarginM: 0, elementContext: element => {
      const id = `${Math.floor(element.x / SIZE)},${Math.floor(element.z / SIZE)}`;
      const local = this._waterPlantFrames.get(id);
      if (!local) return { conservative: true };
      const environment = { ...local.environment, deformationCurrentMps: local.environment.currentMps +
        (local.environment.deformationCurrentMps - local.environment.currentMps) * Math.exp(-seconds / 4) };
      return { timeSec: local.timeSec + seconds, environment, anchor: local.anchors.get(element.id) ?? element.anchor };
    } };
    if (memoize) {
      // Plant poses and geographic clocks are immutable during this step's
      // water phase. Share those exact references, including prediction time;
      // all support probes and signed-clearance calculations still run.
      const lookup = result.elementContext, references = new Map();
      result.elementContext = element => {
        if (references.has(element)) return references.get(element);
        const local = lookup(element);
        if (references.size < result.elements.length) references.set(element, local);
        return local;
      };
      let predictions = this._waterContextMemo.get(id);
      if (!predictions) {
        predictions = new Map(); this._waterContextMemo.set(id, predictions);
        if (this._waterContextMemo.size > 9) this._waterContextMemo.delete(this._waterContextMemo.keys().next().value);
      }
      predictions.set(seconds, result);
      // Nine owners and three ordinary prediction offsets. Unknown additional
      // offsets retain their exact calculation under a finite eviction bound.
      if (predictions.size > 3) predictions.delete(predictions.keys().next().value);
    }
    return result;
  }

  _waterRegionCount(region) {
    return region.sim.agents.filter(agent => animalIds.has(agent.speciesId)).length + region.waterAgents.length + region.visitorAgents.length + (region.kelpBenthicAgents?.length ?? 0) + (region.kelpWaterLifeAgents?.length ?? 0) + (region.kelpNearBottomLifeAgents?.length ?? 0) + (region.kelpUnderstoryLifeAgents?.length ?? 0);
  }

  _waterRouteSite(agent, x, z, y) {
    const id = `${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`, destination = this._active.get(id);
    if (!destination || this._locked.has(id) || Math.hypot(x, z) <= AUTHORED_RADIUS + 1) return null;
    const frame = this._waterFrames.get(agent.groupId);
    const arriving = frame ? frame.members.filter(member => member.regionId !== id).length : agent.regionId === id ? 0 : 1;
    if (this._waterRegionCount(destination) + arriving > KELP_OCEAN_REGION_ANIMAL_LIMIT) return null;
    const point = { x, y, z };
    return kelpWaterPositionValid(this.generator, point, agent.sizeM, { ...this._mobileWaterContext(point), dynamicMarginM: KELP_WATER_MODEL.avoidanceMarginM }) ? point : null;
  }

  _roamingWaterTarget(agent) {
    const phase = agent.roamingSchoolPhaseRad + (agent.mobileTimeSec - agent.roamingSchoolStartedAtSec) * TAU / agent.roamingSchoolPeriodSec;
    const x = agent.roamingSchoolHome.x + Math.cos(phase) * agent.roamingSchoolRadiusM;
    const z = agent.roamingSchoolHome.z + Math.sin(phase) * agent.roamingSchoolRadiusM;
    const y = agent.schoolHome.y + Math.sin(phase + agent.individualPhaseRad) * .12;
    let site = this._waterRouteSite(agent, x, z, y);
    if (!site) {
      const center = this._waterFrames.get(agent.groupId)?.centroid ?? agent.position;
      const heading = Math.atan2(z - center.z, x - center.x);
      const side = hash(`${this._world}|${agent.birthRegionId}|${agent.groupId}|roaming-side`) < .5 ? 1 : -1;
      for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
        site = this._waterRouteSite(agent, center.x + Math.cos(heading + offset * side) * 8,
          center.z + Math.sin(heading + offset * side) * 8, y);
        if (site) break;
      }
    }
    if (!site) site = { ...agent.position };
    return { x: site.x + Math.cos(agent.individualPhaseRad) * agent.schoolRadiusM,
      y: site.y, z: site.z + Math.sin(agent.individualPhaseRad) * agent.schoolRadiusM };
  }

  _waterCandidate(agent, requested, budget, { dynamic = true, recovery = false } = {}) {
    const owner = this._active.get(agent.regionId);
    if (!this._waterMobile(agent) || !owner || this._locked.has(owner.id) || !finiteVector(requested) || distance(agent.position, requested) > budget + 1e-10) return null;
    const id = `${Math.floor(requested.x / SIZE)},${Math.floor(requested.z / SIZE)}`, destination = this._active.get(id);
    if (!destination || this._locked.has(id) || (id !== owner.id && this._waterRegionCount(destination) >= KELP_OCEAN_REGION_ANIMAL_LIMIT)) return null;
    for (const fraction of [.25, .5, .75, 1]) {
      const point = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, agent.position[axis] + (requested[axis] - agent.position[axis]) * fraction]));
      const probeId = `${Math.floor(point.x / SIZE)},${Math.floor(point.z / SIZE)}`, probeOwner = this._active.get(probeId);
      if (!probeOwner || this._locked.has(probeId) || (probeOwner !== owner && this._waterRegionCount(probeOwner) >= KELP_OCEAN_REGION_ANIMAL_LIMIT)) return null;
      const context = this._mobileWaterContext(point);
      if (!kelpWaterPositionValid(this.generator, point, agent.sizeM, { ...context, elements: [] })) return null;
      if (dynamic && !recovery && kelpWaterDynamicClearance(point, agent.sizeM, context) < KELP_WATER_MODEL.avoidanceMarginM) return null;
    }
    if (dynamic && !recovery) for (const seconds of [.2, KELP_WATER_MODEL.predictionSec]) {
      if (kelpWaterDynamicClearance(requested, agent.sizeM, this._mobileWaterContext(requested, seconds)) < KELP_WATER_MODEL.avoidanceMarginM) return null;
    }
    return { position: requested, owner, destination };
  }

  _moveRoamingWater(agent, target, budget) {
    const previous = { ...agent.position }, length = distance(previous, target), step = Math.min(length, budget);
    const vertical = length > 1e-10 ? (target.y - previous.y) / length : 0;
    const horizontal = length > 1e-10 ? Math.hypot(target.x - previous.x, target.z - previous.z) / length : 1;
    const intended = length > 1e-10 ? Math.atan2(target.z - previous.z, target.x - previous.x) : agent.heading;
    const held = agent.schoolAvoidance && agent.mobileTimeSec < agent.schoolAvoidance.untilSec;
    const heading = held ? agent.schoolAvoidance.headingRad : intended;
    const requested = (angle, metres = step) => ({ x: previous.x + Math.cos(angle) * horizontal * metres,
      y: previous.y + vertical * metres, z: previous.z + Math.sin(angle) * horizontal * metres });
    let candidate = this._waterCandidate(agent, requested(heading), budget), recovering = false;
    if (!candidate) {
      const side = hash(`${this._world}|${agent.birthRegionId}|${agent.groupId}|roaming-side`) < .5 ? 1 : -1;
      for (const lookahead of [true, false]) {
        for (const offset of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
          const angle = intended + offset * side;
          if (lookahead && !this._waterCandidate(agent, requested(angle, .8), .8)) continue;
          candidate = this._waterCandidate(agent, requested(angle), budget);
          if (!candidate) continue;
          agent.schoolAvoidance = { headingRad: angle, untilSec: agent.mobileTimeSec + 6 }; break;
        }
        if (candidate) break;
      }
      if (!candidate) for (const fraction of [.5, .25, .125, .0625]) {
        candidate = this._waterCandidate(agent, requested(heading, step * fraction), budget);
        if (candidate) break;
      }
      if (!candidate) {
        const gap = point => Math.min(...[0, .2, KELP_WATER_MODEL.predictionSec].map(seconds =>
          kelpWaterDynamicClearance(point, agent.sizeM, this._mobileWaterContext(point, seconds))));
        const oldGap = gap(previous);
        const choices = Array.from({ length: 8 }, (_, index) => this._waterCandidate(agent,
          { x: previous.x + Math.cos(intended + index * Math.PI / 4) * budget, y: previous.y,
            z: previous.z + Math.sin(intended + index * Math.PI / 4) * budget }, budget, { recovery: true }))
          .filter(Boolean).map(choice => ({ choice, gap: gap(choice.position) })).sort((a, b) => b.gap - a.gap);
        if (oldGap < KELP_WATER_MODEL.avoidanceMarginM && choices[0]?.gap > oldGap + 1e-8) candidate = choices[0].choice;
        recovering = true;
      }
    } else if (!held && agent.schoolAvoidance) delete agent.schoolAvoidance;
    if (!candidate) { agent.velocity = { x: 0, y: 0, z: 0 }; return { recovering: true }; }
    if (candidate.destination !== candidate.owner) this._waterTransfers.push({ agent, ...candidate, previous, dt: STEP });
    else {
      agent.position = candidate.position;
      for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / STEP;
      if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-8) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
    }
    return { recovering };
  }

  _applyWaterTransfers() {
    for (const { agent, owner, destination, position, previous, dt } of this._waterTransfers.sort((a, b) => a.agent.id.localeCompare(b.agent.id))) {
      if (!this._waterMobile(agent) || !agent.alive || this._active.get(owner.id) !== owner || this._active.get(destination.id) !== destination ||
        this._locked.has(owner.id) || this._locked.has(destination.id) || !owner.waterAgents.includes(agent) ||
        this._waterRegionCount(destination) >= KELP_OCEAN_REGION_ANIMAL_LIMIT) { agent.velocity = { x: 0, y: 0, z: 0 }; continue; }
      owner.waterAgents.splice(owner.waterAgents.indexOf(agent), 1); destination.waterAgents.push(agent);
      owner.waterEverOccupied = destination.waterEverOccupied = true;
      agent.regionId = destination.id; agent.position = position; agent.crossings = (agent.crossings ?? 0) + 1;
      for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (position[axis] - previous[axis]) / dt;
      if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-8) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
      for (const [region, type, label] of [[owner, 'departure', '蓝岩鱼游向相邻海域'], [destination, 'arrival', '蓝岩鱼从相邻海域游入']]) {
        region.sim.events.push({ timeSec: region.sim.timeSec, type, label, agentId: agent.id,
          cause: '同一群体在已加载窗口内巡游；身份与个体时钟保留，食物从当前地理海域的真实相对资源扣除。' });
        if (region.sim.events.length > 60) region.sim.events.shift();
      }
    }
    this._waterTransfers.length = 0;
  }

  _enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(error => { this._storageError = String(error?.message || error); });
    return result;
  }
  async _save(world, records) {
    try {
      if (typeof this.store.saveMany === 'function') {
        if (await this.store.saveMany(world, records) === null) throw new Error('Kelp regional save did not commit.');
      } else for (const [id, record] of records) {
        if (await this.store.save(world, id, record) === null) throw new Error('Kelp regional save did not commit.');
      }
      this._counts.saved += records.length;
      return true;
    } catch (error) {
      this._counts.persistenceErrors++; this._storageError = String(error?.message || error); return false;
    }
  }

  _prepareForestOwner(saved, cx, cz) {
    const fresh = saved === null;
    const region = fresh ? this._create(cx, cz, { waterLifeFresh: true, nearBottomLifeFresh: true, understoryLifeFresh: true }) : this._restore(saved, cx, cz);
    if (fresh && this.benthicLifeEnabled) this._benthicLifeBirths.add(region);
    const supportUpdated = this._upgradeSupport(region), waterUpdated = this._upgradeWater(region);
    const mobilityUpdated = this._upgradeWaterMobility(region);
    const driftUpdated = upgradeKelpDrift(region, { generator: this.generator });
    const visitorUpdated = this._upgradeVisitors(region), understoryUpdated = this._upgradeUnderstory(region);
    const benthicUpdated = this._initializeBenthicLife(region, fresh);
    const waterLifeUpdated = this._initializeWaterLife(region, fresh);
    const nearBottomUpdated = this._initializeNearBottomLife(region, fresh);
    const understoryLifeUpdated = this._initializeUnderstoryLife(region, fresh);
    return { region, fresh, changed: fresh || supportUpdated || waterUpdated || mobilityUpdated || driftUpdated || visitorUpdated || understoryUpdated || benthicUpdated || waterLifeUpdated || nearBottomUpdated || understoryLifeUpdated };
  }

  async _updateForestWindow(world, desired, current) {
    try {
      const groups = new Map(), halo = new Map();
      for (const [x, z] of desired.values()) {
        const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
        groups.set(`${gx},${gz}`, [gx, gz]);
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) halo.set(`${gx + dx},${gz + dz}`, [gx + dx, gz + dz]);
      }
      if (halo.size > 16) throw new Error('Kelp forest admission exceeded the bounded owner read halo.');
      const savedRows = new Map(), savedPlans = [];
      const readOwner = async (id, x, z) => {
        const active = this._active.get(id), saved = active ? this._record(active) : await this.store.load(world, id);
        if (!current()) return false;
        // Only an explicit successful null is virgin. Missing/failed reads
        // cannot be reinterpreted as empty landscape or population history.
        if (saved === undefined) throw new Error('Kelp forest owner read returned no result.');
        savedRows.set(id, saved);
        if (saved !== null) {
          const plan = this._savedForestPlan(saved, x, z);
          if (plan) savedPlans.push(plan);
        }
        return true;
      };
      for (const [id, [x, z]] of halo) {
        if (!await readOwner(id, x, z)) return;
      }
      const freshPlans = [];
      const wantsSeascape = this.kelpSeascapeEnabled && KELP_SEASCAPE_OWNERS.some(id => desired.has(id));
      let savedSeascape = [];
      if (this.kelpSeascapeEnabled && (wantsSeascape || [...savedRows.values()].some(seascapeMarked))) {
        // A 6x2 aligned sample overlaps this aligned 2x2 halo in at least
        // four owners. Only this one fixed group is expanded: 16+12-4 <=24.
        for (const id of KELP_SEASCAPE_OWNERS) if (!savedRows.has(id)) {
          const [x, z] = id.split(',').map(Number); halo.set(id, [x, z]);
          if (!await readOwner(id, x, z)) return;
        }
        if (halo.size > 24) throw new Error('Kelp seascape admission exceeded its 24-owner read halo.');
        const rows = KELP_SEASCAPE_OWNERS.map(id => savedRows.get(id)), marked = rows.filter(seascapeMarked);
        if (marked.length) {
          const group = marked[0].forestBeltPlan?.group;
          if (marked.length !== 12 || group?.cx !== KELP_SEASCAPE_ANCHOR.cx || group?.cz !== KELP_SEASCAPE_ANCHOR.cz ||
              JSON.stringify(group.ownerIds) !== JSON.stringify(KELP_SEASCAPE_OWNERS) || rows.some(row =>
                row.forestBeltVersion !== 2 || row.kelpSeascapeVersion !== 1 ||
                row.kelpSeascapeGroupId !== `${group.cx},${group.cz}` || row.kelpSeascapeInitializedAtSec !== 0 ||
                row.forestBeltInitializedAtSec !== 0 || JSON.stringify(row.forestBeltPlan?.group) !== JSON.stringify(group)))
            throw new Error('Saved kelp seascape group is incomplete or inconsistent; no landscape or population was regenerated.');
          savedSeascape = rows;
        } else if (wantsSeascape && rows.every(row => row === null)) {
          let plans;
          try { plans = createKelpSeascapePlans(this.generator.baseGenerator, KELP_SEASCAPE_ANCHOR.cx, KELP_SEASCAPE_ANCHOR.cz); }
          catch (error) { if (!(error instanceof RangeError)) throw error; }
          if (plans) {
            if (!Array.isArray(plans) || plans.length !== 12 || new Set(plans.map(plan => plan.id)).size !== 12 ||
                plans.some(plan => plan.version !== 2 || !KELP_SEASCAPE_OWNERS.includes(plan.id) ||
                  JSON.stringify(plan.group?.ownerIds) !== JSON.stringify(KELP_SEASCAPE_OWNERS) ||
                  !validateKelpSeascapePlan(this.generator.baseGenerator, plan)))
              throw new Error('Invalid fresh complete kelp seascape.');
            freshPlans.push(...plans);
          }
        }
      }
      if (this.kelpSeascapeEnabled) {
        // Reading the larger sample may discover an existing v1 group outside
        // the desired window. Its four-owner contract still applies, but no
        // extra offscreen v1 groups are generated just because they were read.
        const historicalGroups = new Map();
        for (const row of savedRows.values()) if (row?.forestBeltVersion === 1) {
          const group = row.forestBeltPlan.group; historicalGroups.set(`${group.cx},${group.cz}`, group);
        }
        for (const group of historicalGroups.values()) {
          const rows = group.ownerIds.map(id => savedRows.get(id));
          if (rows.length !== 4 || rows.some(row => !row || row.forestBeltVersion !== 1 ||
              row.forestBeltInitializedAtSec !== rows[0]?.forestBeltInitializedAtSec ||
              JSON.stringify(row.forestBeltPlan?.group) !== JSON.stringify(group)))
            throw new Error('Saved kelp forest group is incomplete or inconsistent; no landscape or population was regenerated.');
        }
      }
      for (const [gx, gz] of groups.values()) {
        const ids = [0, 1].flatMap(dz => [0, 1].map(dx => `${gx + dx},${gz + dz}`));
        const rows = ids.map(id => savedRows.get(id));
        if (rows.some(seascapeMarked) || freshPlans.some(plan => plan.version === 2 && ids.includes(plan.id))) continue;
        const marked = rows.filter(row => row && ['forestBeltVersion', 'forestBeltInitializedAtSec', 'forestBeltPlan'].some(key => Object.hasOwn(row, key)));
        if (marked.length) {
          // A committed forest is one four-owner persistence boundary. A lost
          // row or stripped marker cannot silently turn its sibling into a
          // fresh baseline owner, nor reconstruct unrecorded animals or food.
          if (marked.length !== 4 || rows.some(row => !row || row.forestBeltVersion !== 1 ||
              row.forestBeltPlan?.group?.cx !== gx || row.forestBeltPlan?.group?.cz !== gz ||
              row.forestBeltInitializedAtSec !== marked[0].forestBeltInitializedAtSec ||
              JSON.stringify(row.forestBeltPlan.group) !== JSON.stringify(marked[0].forestBeltPlan.group)))
            throw new Error('Saved kelp forest group is incomplete or inconsistent; no landscape or population was regenerated.');
          continue;
        }
        if (!ids.every(id => savedRows.get(id) === null)) continue;
        let plans;
        try { plans = createKelpForestBeltPlans(this.generator.baseGenerator, gx, gz); }
        catch (error) { if (error instanceof RangeError) continue; throw error; }
        if (!Array.isArray(plans) || plans.length !== 4 || new Set(plans.map(p => p.id)).size !== 4 ||
            plans.some(p => !ids.includes(p.id) || p.group?.cx !== gx || p.group?.cz !== gz ||
              !Array.isArray(p.group.ownerIds) || p.group.ownerIds.length !== 4 || ids.some(id => !p.group.ownerIds.includes(id)) ||
              !validateKelpForestBeltPlan(p, this.generator.baseGenerator)))
          throw new Error('Invalid fresh kelp forest group.');
        freshPlans.push(...plans);
      }
      const allPlans = [...savedPlans, ...freshPlans], prepared = new Map();
      // This synchronous source view creates actual sim hosts, animals, water
      // representatives, understory and food once. It never publishes scenery
      // revisions, and its references become public only after persistence.
      this.generator.withForestPlans(allPlans, () => {
        // A complete restored sample is validated as actual full records,
        // including unloaded owners' death histories and food ledgers. These
        // private simulations never tick, publish or add inventory.
        for (const record of savedSeascape) this._restore(record, record.cx, record.cz);
        for (const [id, record] of savedRows) if ((benthicMarked(record) || waterLifeMarked(record) || nearBottomMarked(record) || understoryLifeMarked(record)) && !savedSeascape.includes(record)) {
          const [x, z] = id.split(',').map(Number); this._restore(record, x, z);
        }
        for (const plan of freshPlans) {
          const item = this._prepareForestOwner(null, plan.cx, plan.cz);
          item.region.forestBeltVersion = plan.version; item.region.forestBeltInitializedAtSec = item.region.sim.timeSec;
          if (plan.version === 2) {
            item.region.kelpSeascapeVersion = 1; item.region.kelpSeascapeGroupId = `${plan.group.cx},${plan.group.cz}`;
            item.region.kelpSeascapeInitializedAtSec = 0;
          }
          item.region.forestBeltPlan = clone(plan); prepared.set(plan.id, item);
        }
        for (const [id, [x, z]] of desired) {
          if (this._active.has(id) || prepared.has(id)) continue;
          prepared.set(id, this._prepareForestOwner(savedRows.get(id), x, z));
        }
      });
      if (!current()) return;
      for (const { region } of prepared.values()) {
        if (this._waterRegionCount(region) > KELP_OCEAN_REGION_ANIMAL_LIMIT || region.sim.hostById.size > KELP_OCEAN_REGION_PLANT_LIMIT ||
            Math.abs(region.sim.metrics.resourceBudgetError) > 1e-8)
          throw new Error('Invalid kelp forest birth population or initial food inventory.');
      }
      const records = [...prepared].filter(([, item]) => item.changed).map(([id, item]) => [id, this._record(item.region)]);
      if (records.length && !await this._save(world, records)) { this._center = null; return false; }
      if (!current()) return;
      // Complete persisted groups can include offscreen owners.
      // Retain only this bounded read halo; no unbounded visited-plan registry.
      this.generator.setForestPlans(allPlans);
      this._waterCells.clear(); this._clearWaterContextMemo();
      for (const [id, item] of prepared) {
        if (!desired.has(id)) continue;
        const region = item.region;
        installKelpDriftHooks(region, { generator: this.generator,
          enabled: () => this._active.get(region.id) === region && typeof this.store.saveMany === 'function' });
        this._active.set(id, region); this._counts[item.fresh ? 'generated' : 'restored']++;
      }
      return true;
    } catch (error) {
      this._counts.persistenceErrors++; this._storageError = String(error?.message || error); this._center = null; return false;
    }
  }

  update(position) {
    this._clearWaterContextMemo();
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) throw new RangeError('Kelp exploration coordinates must be finite.');
    const cx = Math.floor(position.x / SIZE), cz = Math.floor(position.z / SIZE);
    if (![cx - 1, cx + 1, cz - 1, cz + 1].every(Number.isSafeInteger)) throw new RangeError('Kelp chunk coordinates must be safe integers.');
    if (this._disposed) return Promise.resolve();
    if (this._center?.cx === cx && this._center?.cz === cz) return this._pending;
    this._center = { cx, cz };
    const generation = this._generation, revision = ++this._revision, world = this._world;
    this._pending = this._enqueue(async () => {
      const current = () => !this._disposed && generation === this._generation && revision === this._revision;
      if (!current()) return;
      const desired = new Map();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) desired.set(`${cx + dx},${cz + dz}`, [cx + dx, cz + dz]);
      const exits = [...this._active.keys()].filter(id => !desired.has(id));
      for (const id of exits) this._locked.add(id);
      try {
        if (exits.length) {
          // A departed school may now have an owner that remains loaded. Save
          // the whole active ownership set in one transaction before exits.
          const records = typeof this.store.saveMany === 'function' ? [...this._active] :
            exits.map(id => [id, this._active.get(id)]);
          const success = await this._save(world, records.map(([id, region]) => [id, this._record(region)]));
          if (!current()) return;
          if (!success) { this._center = null; return false; }
          for (const id of exits) { this._active.delete(id); this._counts.unloaded++; }
        }
      } finally { for (const id of exits) this._locked.delete(id); }
      if (this.forestBeltEnabled) return this._updateForestWindow(world, desired, current);
      for (const [id, [x, z]] of desired) {
        if (this._active.has(id)) continue;
        try {
          const saved = await this.store.load(world, id);
          if (!current()) return;
          if ((this.benthicLifeEnabled || this.waterLifeEnabled || this.nearBottomLifeEnabled || this.understoryLifeEnabled) && saved === undefined) throw new Error('Kelp community owner read returned no result.');
          const fresh = saved === null || saved === undefined;
          let region = fresh ? this._create(x, z, { waterLifeFresh: saved === null, nearBottomLifeFresh: saved === null, understoryLifeFresh: saved === null }) : this._restore(saved, x, z);
          if (saved === null && this.benthicLifeEnabled) this._benthicLifeBirths.add(region);
          const supportUpdated=this._upgradeSupport(region),waterUpdated=this._upgradeWater(region), mobilityUpdated=this._upgradeWaterMobility(region);
          const driftUpdated = typeof this.store.saveMany === 'function' && upgradeKelpDrift(region, { generator: this.generator });
          const visitorUpdated = this._upgradeVisitors(region);
          const understoryUpdated = this._upgradeUnderstory(region);
          const benthicUpdated = this._initializeBenthicLife(region, saved === null);
          const waterLifeUpdated = this._initializeWaterLife(region, saved === null);
          const nearBottomUpdated = this._initializeNearBottomLife(region, saved === null);
          const understoryLifeUpdated = this._initializeUnderstoryLife(region, saved === null);
          if (supportUpdated||waterUpdated||mobilityUpdated||driftUpdated||visitorUpdated||understoryUpdated||benthicUpdated||waterLifeUpdated||nearBottomUpdated||understoryLifeUpdated) {
            const committed = await this._save(world, [[id, this._record(region)]]);
            if (!current()) return;
            if (!committed) {
              if (fresh) { this._center = null; return false; }
              if(supportUpdated||driftUpdated||visitorUpdated||understoryUpdated||benthicUpdated||waterLifeUpdated||nearBottomUpdated||understoryLifeUpdated){
                // Never publish corrected coordinates without preserving the
                // complete old record and its geometry marker first.
                this._center=null;return false;
              }
              // Retain the old working population and every original field.
              // The unsaved cohort/marker is never published or checkpointed.
              region = this._restore(saved, x, z);
            }
          }
          installKelpDriftHooks(region, { generator: this.generator,
            enabled: () => this._active.get(region.id) === region && typeof this.store.saveMany === 'function' });
          this._active.set(id, region); this._counts[saved === null || saved === undefined ? 'generated' : 'restored']++;
        } catch (error) {
          this._counts.persistenceErrors++; this._storageError = String(error?.message || error); this._center = null; return false;
        }
      }
      return true;
    });
    return this._pending;
  }

  setEnvironment(patch = {}) {
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24] };
    for (const [key, range] of Object.entries(ranges)) {
      if (!Object.hasOwn(patch, key)) continue;
      if (!Number.isFinite(patch[key])) throw new TypeError(`Kelp regional ${key} must be finite.`);
      this.environment[key] = key === 'hour' ? ((patch[key] % 24) + 24) % 24 : Math.max(range[0], Math.min(range[1], patch[key]));
    }
    return this.environment;
  }
  step(seconds, environment = {}) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) throw new RangeError('Kelp ecology step requires 0–86400 finite simulation seconds.');
    if (this._disposed || seconds === 0) return;
    this.setEnvironment(environment); this._accumulator += seconds;
    while (this._accumulator + 1e-10 >= STEP) {
      this._accumulator = Math.max(0, this._accumulator - STEP); this._activeTime += STEP;
      this._prepareWaterFrames();
      for (const region of this._active.values()) {
        if (this._locked.has(region.id)) continue;
        for (const key of ['currentMps', 'turbidity', 'foodSupply', 'hour']) region.sim.environment[key] = this.environment[key];
        region.sim.step(STEP);
        if (region.kelpBenthicLifeVersion === 1) tickKelpBenthicLife(region, this.generator, STEP);
      }
      this._prepareWaterPlantFrames();
      this._waterContextMemoActive = true;
      try {
        for (const region of this._active.values()) if (!this._locked.has(region.id)) this._tickWater(region);
        if (this.visitorsEnabled && typeof this.store.saveMany === 'function') {
          for (const region of this._active.values()) if (!this._locked.has(region.id)) tickKelpVisitors(region,
            { generator: this.generator, dt: STEP, contextAt: (point, seconds) => this._mobileWaterContext(point, seconds) });
        }
      } finally { this._clearWaterContextMemo(); }
      this._applyWaterTransfers();
      for (const region of this._active.values()) if (!this._locked.has(region.id) && region.kelpWaterLifeVersion === 1)
        tickKelpWaterLife(region, this.generator, STEP);
      for (const region of this._active.values()) if (!this._locked.has(region.id) && region.kelpNearBottomLifeVersion === 1)
        tickKelpNearBottomLife(region, this.generator, STEP);
      for (const region of this._active.values()) if (!this._locked.has(region.id) && region.kelpUnderstoryLifeVersion === 1)
        tickKelpUnderstoryLife(region, this.generator, STEP);
    }
    if (this._activeTime >= this._checkpointAt) { this._checkpointAt = this._activeTime + 10; this.checkpoint(); }
  }

  get agents() {
    return [...this._active.values()].flatMap(region => region.sim.agents.filter(agent => animalIds.has(agent.speciesId)).concat(region.waterAgents).map(agent => {
      agent.timeSec = agent.mobileTimeSec ?? region.sim.timeSec; agent.regionId = region.id; agent.localEnvironment = { ...region.sim.environment };
      const hostId = agent.attachment?.hostId ?? agent.hostId;
      if (agent.alive && hostId && region.sim.hostById.has(hostId)) {
        const anchor = region.sim.getKelpAnchor(hostId);
        agent.hostAnchor = anchor; agent.hostTimeSec = region.sim.timeSec;
        agent.hostEnvironment = { ...region.sim.environment };
        agent.hostSceneryId = region.sim.hostById.get(hostId).sceneryId;
        if (agent.attachment) agent.supportNormal = kelpLeafNormal(anchor, agent.attachment.leafIndex, agent.attachment.along,
          region.sim.timeSec, region.sim.environment, agent.attachment.frondIndex ?? 0);
      }
      return agent;
    }).concat(region.visitorAgents.map(agent => ({ ...agent, localEnvironment: { ...region.sim.environment } })),
      (region.kelpBenthicAgents ?? []).map(agent => ({ ...agent, timeSec: agent.alive ? region.sim.timeSec : agent.timeSec, localEnvironment: { ...region.sim.environment } })),
      (region.kelpWaterLifeAgents ?? []).map(agent => ({ ...agent, localEnvironment: { ...region.sim.environment } })),
      (region.kelpNearBottomLifeAgents ?? []).map(agent => ({ ...agent, localEnvironment: { ...region.sim.environment } })),
      (region.kelpUnderstoryLifeAgents ?? []).map(agent => ({ ...agent, localEnvironment: { ...region.sim.environment } }))));
  }
  get driftFoodPatches() {
    return [...this._active.values()].flatMap(region => (region.driftPatches ?? []).map(patch => ({ ...clone(patch),
      timeSec: region.sim.timeSec, aliveHost: region.sim.hostById.get(patch.hostId)?.alive === true,
      unit: KELP_DRIFT_PARAMETERS.unit })));
  }
  _waterContext(region) {
    let elements = this._waterCells.get(region.id);
    if (!elements) {
      elements = kelpWaterElements(this.generator, region.cx, region.cz); this._waterCells.set(region.id, elements);
      if (this._waterCells.size > 25) this._waterCells.delete(this._waterCells.keys().next().value);
    }
    return { cx: region.cx, cz: region.cz, elements, timeSec: region.sim.timeSec, environment: region.sim.environment,
      ...(this.understoryEnabled ? { understoryPlants: [...this._active.values()].filter(owner =>
        Math.abs(owner.cx - region.cx) <= 1 && Math.abs(owner.cz - region.cz) <= 1).flatMap(owner => owner.understoryPlants) } : {}) };
  }
  _tickWater(region) {
    if (!region.waterAgents.length) return;
    const sim = region.sim, context = this._waterContext(region);
    const lowLight = sim.lightLevel < .08;
    for (const agent of region.waterAgents) {
      if (!agent.alive) continue;
      if (agent.mobileTimeSec !== undefined) agent.mobileTimeSec = Math.round((agent.mobileTimeSec + STEP) / STEP) * STEP;
      const clock = agent.mobileTimeSec ?? sim.timeSec, mobile = this._waterMobile(agent);
      const phase = agent.schoolPhaseRad + (clock - agent.createdAtSec) * Math.PI * 2 / agent.patrolPeriodSec;
      let target = mobile ? this._roamingWaterTarget(agent) : { x: agent.schoolHome.x + Math.cos(phase) * agent.orbitRadiusM + Math.cos(agent.individualPhaseRad) * agent.schoolRadiusM,
        y: agent.schoolHome.y + Math.sin(phase + agent.individualPhaseRad) * .12,
        z: agent.schoolHome.z + Math.sin(phase) * agent.orbitRadiusM + Math.sin(agent.individualPhaseRad) * agent.schoolRadiusM };
      const frame = mobile ? this._waterFrames.get(agent.groupId) : null;
      if (frame && frame.members.length > 1) {
        const peers = frame.members.filter(peer => peer.id !== agent.id);
        const gap = Math.max(...peers.map(peer => distance(agent.position, peer.position))), centerDistance = distance(agent.position, frame.centroid);
        const routeWeight = gap > 8 && centerDistance > 2 ? 0 : gap > 6 ? .05 : .92;
        for (const axis of ['x', 'y', 'z']) target[axis] = target[axis] * routeWeight + frame.centroid[axis] * (1 - routeWeight);
        for (const peer of peers) if (distance(agent.position, peer.position) < .35) {
          target.x += (agent.position.x - peer.position.x) * 1.8; target.z += (agent.position.z - peer.position.z) * 1.8;
        }
      }
      const schoolTarget = target;
      let patch = null, foodPosition = null, nearest = Infinity;
      const groupSize = frame?.members.length ?? region.waterAgents.filter(other => other.groupId === agent.groupId).length;
      const feedingTurn = (Math.floor((clock - agent.createdAtSec) / 40) + agent.schoolSlot) % groupSize === 0;
      if (!lowLight && feedingTurn && agent.energy < .94) {
        for (const candidate of sim.preyPatches) {
          if (candidate.smallPrey <= 1e-10) continue;
          const position = sim._preyPosition(candidate);
          const distance = Math.hypot(agent.position.x - position.x, agent.position.y - position.y, agent.position.z - position.z);
          if (distance < nearest && distance <= sim.visibilityM && kelpWaterPositionValid(this.generator, position, agent.sizeM,
            mobile ? this._mobileWaterContext(position) : context) &&
            (!mobile || Math.floor(position.x / SIZE) === region.cx && Math.floor(position.z / SIZE) === region.cz)) {
            nearest = distance; patch = candidate; foodPosition = position;
          }
        }
        if (foodPosition) target = foodPosition;
      }
      const previous = { ...agent.position };
      const budget = KELP_WATER_MODEL.speedMps * (lowLight ? .25 : 1) * STEP;
      let recovering = false;
      if (mobile) {
        ({ recovering } = this._moveRoamingWater(agent, target, budget));
        if (recovering) { patch = null; foodPosition = null; }
      } else {
      const candidate = destination => {
        const distance = Math.hypot(destination.x - previous.x, destination.y - previous.y, destination.z - previous.z);
        const length = Math.min(distance, budget);
        const next = distance > 1e-10 ? { x: previous.x + (destination.x - previous.x) / distance * length,
          y: previous.y + (destination.y - previous.y) / distance * length,
          z: previous.z + (destination.z - previous.z) / distance * length } : previous;
        return next;
      };
      const staticSafe = next => Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z) <= budget + 1e-8 &&
        kelpWaterPositionValid(this.generator, next, agent.sizeM, { ...context, elements: [] });
      const futureContexts = [0, .2, KELP_WATER_MODEL.predictionSec].map(seconds => ({ ...context,
        timeSec: sim.timeSec + seconds, environment: { ...sim.environment,
          deformationCurrentMps: sim.environment.currentMps + (sim.environment.deformationCurrentMps - sim.environment.currentMps) * Math.exp(-seconds / 4) } }));
      const gap = next => Math.min(...futureContexts.map(ctx => kelpWaterDynamicClearance(next, agent.sizeM, ctx)));
      const safe = next => staticSafe(next) && gap(next) >= KELP_WATER_MODEL.avoidanceMarginM;
      let next = candidate(target);
      if (!safe(next)) {
        const alternative = candidate(schoolTarget);
        if (foodPosition && safe(alternative)) next = alternative;
        else {
          const heading = Math.atan2(target.z - previous.z, target.x - previous.x);
          const choices = Array.from({ length: 8 }, (_, index) => {
            const angle = heading + index * Math.PI / 4;
            return { x: previous.x + Math.cos(angle) * budget, y: previous.y, z: previous.z + Math.sin(angle) * budget };
          }).filter(staticSafe);
          const preventive = choices.find(safe);
          if (preventive) next = preventive;
          else {
            const oldGap = gap(previous);
            const best = choices.map(point => ({ point, gap: gap(point) })).sort((a, b) => b.gap - a.gap)[0];
            // An already intruded historical pose may have no legal endpoint
            // in one step. Only publish a budgeted improvement; feeding stays
            // disabled until ordinary current-pose validity is recovered.
            next = best && best.gap > oldGap + 1e-8 ? best.point : null;
            recovering = true;
          }
        }
        patch = null; foodPosition = null;
      }
      if (next) agent.position = next;
      agent.velocity = { x: (agent.position.x - previous.x) / STEP,
        y: (agent.position.y - previous.y) / STEP, z: (agent.position.z - previous.z) / STEP };
      if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-8) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
      }
      let state = lowLight ? 'resting' : foodPosition ? 'approaching-prey' : 'schooling';
      if (patch && !recovering && !lowLight && clock >= agent.nextBite && kelpWaterPositionValid(this.generator, agent.position, agent.sizeM,
        mobile ? this._mobileWaterContext(agent.position) : context) &&
          Math.hypot(agent.position.x - foodPosition.x, agent.position.y - foodPosition.y, agent.position.z - foodPosition.z) <= KELP_WATER_MODEL.feedingDistanceM) {
        const taken = Math.min(patch.smallPrey, KELP_WATER_MODEL.feedingAmount);
        if (taken > 1e-10) {
          patch.smallPrey -= taken; sim.ledger.ingested += taken; sim.counters.feedingCount++;
          agent.energy = Math.min(1, agent.energy + taken * KELP_WATER_MODEL.energyGain);
          agent.lastFeedAt = clock; agent.nextBite = clock + KELP_WATER_MODEL.feedingIntervalSec; state = 'prey-feeding';
          if (!agent.hasExplainedFeeding) {
            agent.hasExplainedFeeding = true;
            sim.events.push({ timeSec: clock, type: 'feeding', label: '蓝岩鱼实际摄食',
              cause: `接近本格动态小型动物食物参考后消耗 ${taken.toFixed(4)} 相对资源；食距与摄食量为未校准模型参数。` });
            if (sim.events.length > 60) sim.events.shift();
          }
        }
      }
      if (state !== agent.state) { agent.state = state; agent.stateSince = clock; }
      agent.energy = Math.max(.02, agent.energy - STEP * (.00007 + sim.environment.currentMps ** 2 * .00012));
      agent.hunger = 1 - agent.energy; agent.timeSec = clock;
    }
  }
  getKelpState(sceneryId) {
    for (const region of this._active.values()) {
      const plant = region.sim.agents.find(agent => agent.sceneryId === sceneryId);
      if (plant) return { anchor: region.sim.getKelpAnchor(plant.id), timeSec: region.sim.timeSec, environment: { ...region.sim.environment } };
    }
    return null;
  }
  checkpoint() {
    const generation = this._generation, world = this._world;
    return this._enqueue(async () => {
      if (this._disposed || generation !== this._generation) return;
      return this._save(world, [...this._active].map(([id, region]) => [id, this._record(region)]));
    });
  }
  snapshot() {
    const agents = this.agents, living = agents.filter(agent => agent.alive), energetic = living.filter(agent => Number.isFinite(agent.energy));
    const regions = [...this._active.values()].map(region => ({ id: region.id, cx: region.cx, cz: region.cz, habitat: region.habitat,
      timeSec: region.sim.timeSec, supportGeometryVersion: region.supportGeometryVersion, agentCount: this._waterRegionCount(region),
      ...(region.forestBeltVersion !== undefined ? { forestBeltVersion: region.forestBeltVersion,
        forestBeltInitializedAtSec: region.forestBeltInitializedAtSec, forestBelt: clone(region.forestBeltPlan.group) } : {}),
      ...(region.kelpSeascapeVersion !== undefined ? { kelpSeascapeVersion: region.kelpSeascapeVersion,
        kelpSeascapeGroupId: region.kelpSeascapeGroupId, kelpSeascapeInitializedAtSec: region.kelpSeascapeInitializedAtSec } : {}),
      alive: region.sim.agents.filter(agent => animalIds.has(agent.speciesId) && agent.alive).length + region.waterAgents.filter(agent => agent.alive).length + region.visitorAgents.filter(agent => agent.alive).length + (region.kelpBenthicAgents ?? []).filter(agent => agent.alive).length + (region.kelpWaterLifeAgents ?? []).filter(agent => agent.alive).length + (region.kelpNearBottomLifeAgents ?? []).filter(agent => agent.alive).length + (region.kelpUnderstoryLifeAgents ?? []).filter(agent => agent.alive).length,
      ...captureKelpBenthicLife(region),
      ...(region.visitorCommunityVersion !== undefined ? { visitorCommunityVersion: region.visitorCommunityVersion,
        visitorInitializedAtSec: region.visitorInitializedAtSec, visitorAgentCount: region.visitorAgents.length } : {}),
      ...(region.understorySceneryVersion !== undefined ? { understorySceneryVersion: region.understorySceneryVersion,
        understoryInitializedAtSec: region.understoryInitializedAtSec, understoryPlants: clone(region.understoryPlants) } : {}),
      waterCommunityVersion: region.waterCommunityVersion ?? null, waterCommunityAdded: region.waterCommunityAdded ?? 0,
      waterInitializedAtSec: region.waterInitializedAtSec ?? null, waterAgentCount: region.waterAgents.length,
      waterEverOccupied: region.waterEverOccupied ?? false,
      simulatedKelpRepresentatives: region.sim.hostById.size, resources: { ...region.sim.resources },
      driftCommunityVersion: region.driftCommunityVersion ?? 0, driftPatches: clone(region.driftPatches ?? []),
      driftLedger: clone(region.driftLedger ?? { transferredIn: 0, ingested: 0, returnedToDetritus: 0 }),
      driftStock: (region.driftPatches ?? []).reduce((sum, patch) => sum + patch.stock, 0), driftBalanceError: kelpDriftBalanceError(region),
      ...captureKelpWaterLife(region),
      ...captureKelpNearBottomLife(region),
      ...captureKelpUnderstoryLife(region),
      ...(region.kelpUnderstoryLifeVersion === 1 ? { understoryLife: kelpUnderstoryLifeSnapshot(region),
        understoryFoodBudgetError: kelpUnderstoryLifeFoodBudgetError(region), understoryEnergyBudgetError: kelpUnderstoryLifeEnergyBudgetError(region) } : {}),
      ...(region.kelpNearBottomLifeVersion === 1 ? { nearBottomLife: kelpNearBottomLifeSnapshot(region),
        nearBottomFoodBudgetError: kelpNearBottomLifeFoodBudgetError(region), nearBottomEnergyBudgetError: kelpNearBottomLifeEnergyBudgetError(region) } : {}),
      ledger: { ...region.sim.ledger }, counters: { ...region.sim.counters }, balanceError: region.sim.metrics.resourceBudgetError,
      localEnvironment: { ...region.sim.environment, lightLevel: region.sim.lightLevel, visibilityM: region.sim.visibilityM } }));
    const rawResources = regions.reduce((total, region) => {
      for (const key of ['algae', 'biofilm', 'detritus', 'smallPrey', 'kelpTissue']) total[key] += region.resources[key];
      total.kelpDrift += region.driftStock;
      return total;
    }, { algae: 0, biofilm: 0, detritus: 0, smallPrey: 0, kelpTissue: 0, kelpDrift: 0 });
    // UI plankton is an explicitly labelled generic animal-food reference,
    // mapped from the existing kelp model's smallPrey pool, not phytoplankton.
    const resources = { ...rawResources, plankton: rawResources.smallPrey,
      ...(regions.some(region => region.kelpNearBottomLifeVersion === 1) ? { benthicAnimalFood: regions.reduce((total, region) => total + (region.nearBottomLife?.resources?.benthicAnimalFood ?? 0), 0) } : {}),
      ...(regions.some(region => region.kelpUnderstoryLifeVersion === 1) ? { suspendedOrganicFood: regions.reduce((total, region) => total + (region.understoryLife?.resources?.suspendedOrganicFood ?? 0), 0) } : {}) };
    const averageResources = Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, regions.length ? value / regions.length : 0]));
    return { seed: this.seed, agents: clone(agents), regions, resources, driftFoodPatches: this.driftFoodPatches,
      events: [...this._active.values()].flatMap(region => region.sim.events.slice(-8).map((event, index) => ({
        ...clone(event), id: `${region.id}:${event.timeSec}:${index}`, regionId: region.id, title: event.label }))),
      metrics: { ...this._counts, activeRegions: this._active.size, maxActiveRegions: 9,
        activeIndividuals: agents.length, alive: living.length, maxIndividualsPerRegion: 20,
        simulatedKelpRepresentatives: regions.reduce((value, region) => value + region.simulatedKelpRepresentatives, 0),
        driftStock: resources.kelpDrift, driftTransferredIn: regions.reduce((value, region) => value + region.driftLedger.transferredIn, 0),
        driftIngested: regions.reduce((value, region) => value + region.driftLedger.ingested, 0),
        driftBalanceError: regions.reduce((error, region) => Math.max(error, Math.abs(region.driftBalanceError)), 0),
        averageResources, ...averageResources, averageEnergy: energetic.length ? energetic.reduce((value, agent) => value + agent.energy, 0) / energetic.length : 0,
        timeSec: regions.length ? regions.reduce((value, region) => value + region.timeSec, 0) / regions.length : 0,
        visibilityM: regions.length ? regions.reduce((value, region) => value + region.localEnvironment.visibilityM, 0) / regions.length : 0,
        loadingRegions: this._center ? 9 - this._active.size : 0, balanceError: regions.reduce((value, region) => Math.max(value, Math.abs(region.balanceError) + Math.abs(region.nearBottomFoodBudgetError ?? 0) + Math.abs(region.understoryFoodBudgetError ?? 0)), 0),
        ...(regions.some(region => region.kelpUnderstoryLifeVersion === 1) ? { understoryFoodBudgetError: regions.reduce((error, region) => Math.max(error, Math.abs(region.understoryFoodBudgetError ?? 0)), 0),
          understoryEnergyBudgetError: regions.reduce((error, region) => Math.max(error, Math.abs(region.understoryEnergyBudgetError ?? 0)), 0) } : {}),
        ...(regions.some(region => region.kelpNearBottomLifeVersion === 1) ? { nearBottomFoodBudgetError: regions.reduce((error, region) => Math.max(error, Math.abs(region.nearBottomFoodBudgetError ?? 0)), 0),
          nearBottomEnergyBudgetError: regions.reduce((error, region) => Math.max(error, Math.abs(region.nearBottomEnergyBudgetError ?? 0)), 0) } : {}),
        persistenceStatus: this._storageError ? 'error' : this.store.available === false ? 'session-only' : 'indexeddb',
        storageError: this._storageError, scope: 'loaded-kelp-regions-only', unloadedPolicy: 'frozen',
        resourceScope: 'relative local pools; plankton display alias means kelp-model small animal prey' } };
  }
  reset(seed = this.seed, generator = this.generator) {
    this._clearWaterContextMemo();
    const previous = this._world, next = worldKey(seed);
    this._generation++; this._revision++; this._active.clear(); this._locked.clear(); this._center = null; this._waterCells.clear();
    this._waterFrames.clear(); this._waterPlantFrames.clear(); this._waterTransfers.length = 0;
    this.benthicLifeEnabled = this._benthicLifeRequested && generator.supportVersion >= 2 && typeof this.store.saveMany === 'function';
    this._benthicLifeBirths = new WeakSet();
    this.waterLifeEnabled = this._waterLifeRequested && generator.supportVersion === 2 && typeof this.store.saveMany === 'function';
    this._waterLifeBirths = new WeakMap();
    this.nearBottomLifeEnabled = this._nearBottomLifeRequested && generator.supportVersion === 2 && typeof this.store.saveMany === 'function';
    this._nearBottomLifeBirths = new WeakMap();
    this.understoryLifeEnabled = this._understoryLifeRequested && generator.supportVersion === 2 && typeof this.store.saveMany === 'function';
    this._understoryLifeBirths = new WeakMap();
    this.seed = seed; this.generator = generator; this._legacyGenerator = null; this._world = next; this._disposed = false;
    this.forestBeltEnabled = this._forestBeltRequested && this._forestBeltAvailable(generator);
    this.kelpSeascapeEnabled = this._kelpSeascapeRequested && this.forestBeltEnabled;
    if (this.forestBeltEnabled) this.generator.setForestPlans([]);
    this._accumulator = 0; this._activeTime = 0; this._checkpointAt = 10;
    return this._pending = this._enqueue(async () => {
      try { await this.store.clear(previous); if (next !== previous) await this.store.clear(next); }
      catch (error) { this._counts.persistenceErrors++; this._storageError = String(error?.message || error); }
    });
  }
  dispose() {
    this._clearWaterContextMemo();
    if (this._disposed) return this._queue;
    const world = this._world; this._disposed = true; this._generation++; this._revision++;
    return this._enqueue(async () => {
      await this._save(world, [...this._active].map(([id, region]) => [id, this._record(region)]));
      this._active.clear(); this._locked.clear(); this._center = null; this._waterCells.clear();
      this._waterFrames.clear(); this._waterPlantFrames.clear(); this._waterTransfers.length = 0;
    });
  }
}
