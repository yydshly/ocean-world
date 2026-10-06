import { DeepSimulation, DEFAULT_ENVIRONMENT, DEEP_MODEL_PARAMETERS } from './deepSimulation.js';
import { deepSpeciesById } from './deepSpecies.js';
import { OceanEcologyStore } from './oceanEcologyStore.js';
import { upgradeDeepPredators, advanceDeepPredators, validateDeepPredatorRecord, predatorEnergyBudgetError } from './deepPredatorEcology.js';
import { createDeepSeascapePlans, validateDeepSeascapePlan } from './deepSeascape.js';

export const DEEP_OCEAN_REGION_ANIMAL_LIMIT = 20;
export const DEEP_OCEAN_ACTIVE_REGION_LIMIT = 9;
const SIZE = 64, STEP = .1, AUTHORED_RADIUS = 40;
const pools = ['surfaceDetritus', 'benthicAnimalFood', 'suspendedPrey'];
const fields = ['_rngState', '_ticks', '_accumulator', 'timeSec', 'environment', 'events', 'agents',
  'primaryProduction', 'totalPrimaryProduction', 'counters', 'ledger', 'energyLedger', '_nextParcelId',
  '_nextRelease', '_nextSummary', 'surfacePatches', 'benthicPatches', 'suspendedPatches'];
const clone = value => structuredClone(value);
const keyFor = seed => `deep-ecology-v1:${typeof seed}:${seed}`;
const vector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const close = (a, b) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
function hash(value) {
  let state = 2166136261;
  for (const char of value) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return (state >>> 0) / 4294967296;
}

/** Loaded-cell deep functional ecology. The original three identities and
 * local organic-food/condition ledgers are retained; unloaded cells freeze.
 * All allocation rates, occupancy and food quantities remain display proxies. */
export class DeepOceanEcology {
  constructor(seed, generator, { store = new OceanEcologyStore(), seascape = false } = {}) {
    this.seed = seed; this.generator = generator; this.store = store; this._world = keyFor(seed);
    this._seascapeRequested = seascape === true;
    this.seascapeEnabled = this._seascapeRequested && this._seascapeAvailable(generator);
    this._active = new Map(); this._locked = new Set(); this._center = null;
    this._queue = Promise.resolve(); this._pending = this._queue; this._revision = 0; this._generation = 0;
    this._accumulator = 0; this._activeTime = 0; this._checkpointAt = 10; this._disposed = false;
    this.environment = { ...DEFAULT_ENVIRONMENT };
    this._counts = { generated: 0, restored: 0, saved: 0, unloaded: 0, persistenceErrors: 0 };
    this._storageError = null;
  }

  _seascapeAvailable(generator) {
    return Boolean(typeof this.store.saveMany === 'function' && generator.baseGenerator &&
      typeof generator.withSeascapePlans === 'function' && typeof generator.setSeascapePlans === 'function' &&
      typeof generator.seascapePlan === 'function');
  }

  _savedSeascapePlan(record, cx, cz) {
    const has = record && ['seascapeVersion', 'seascapeInitializedAtSec', 'seascapePlan'].some(key => Object.hasOwn(record, key));
    if (!has) return null;
    if (!this.seascapeEnabled || record.seascapeVersion !== 1 ||
        !nonnegative(record.seascapeInitializedAtSec) || record.seascapeInitializedAtSec > record.state?.timeSec ||
        record.seascapePlan?.id !== `${cx},${cz}` || record.seascapePlan.cx !== cx || record.seascapePlan.cz !== cz ||
        !validateDeepSeascapePlan(record.seascapePlan, this.generator.baseGenerator))
      throw new Error('Invalid saved deep seascape; original landscape and population were not regenerated.');
    return record.seascapePlan;
  }

  _plan(cx, cz) {
    const id = `${cx},${cz}`, random = salt => hash(`${this._world}|${id}|${salt}`), sites = [];
    for (let iz = 0; iz < 5; iz++) for (let ix = 0; ix < 5; ix++) {
      const x = (cx + .16 + ix * .17 + (random(`jx:${ix}:${iz}`) - .5) * .035) * SIZE;
      const z = (cz + .16 + iz * .17 + (random(`jz:${ix}:${iz}`) - .5) * .035) * SIZE;
      if (Math.hypot(x, z) < AUTHORED_RADIUS + 2) continue;
      const sample = this.generator.sample(x, z), y = this.generator.heightAt(x, z);
      const heights = [[0, 0], [.65, 0], [-.65, 0], [0, .65], [0, -.65], [.46, .46], [-.46, .46], [.46, -.46], [-.46, -.46]]
        .map(([dx, dz]) => this.generator.heightAt(x + dx, z + dz));
      // A small finite footprint gate avoids placing these slow animals on
      // unresolved steep steps; movement still queries the real support.
      if (!heights.every(Number.isFinite) || Math.max(...heights) - Math.min(...heights) > .07) continue;
      sites.push({ x, y, z, sample, order: random(`site:${ix}:${iz}`) });
    }
    sites.sort((a, b) => a.order - b.order);
    const soft = sites.filter(site => site.sample.substrate !== 'rock' &&
      site.y - site.sample.floorY < .04 && (site.sample.organicPatchSuitability ?? .5) >= .2)
      .slice(0, 5 + Math.floor(random('patch-count') * 4));
    const benthicIndices = soft.map((_, index) => index).filter(index => index % 2 === 0);
    const pigIndices = soft.map((_, index) => index).slice(0, 3 + Math.floor(random('pigs') * 4));
    const fishIndices = benthicIndices.map((_, index) => index).slice(0, 1 + Math.floor(random('fish') * 3));
    const anchors = sites.filter(site => site.sample.habitat !== 'deep-slope').slice(0, 2 + Math.floor(random('anemones') * 3))
      .map((site, index) => ({ id: `deep-anchor:${id}:${index}`, x: site.x, y: site.y, z: site.z }));
    return { surfaceSites: soft.map(site => [site.x, site.z]), benthicSiteIndices: benthicIndices,
      seaPigSiteIndices: pigIndices, fishSiteIndices: fishIndices, anchors,
      supportHeight: (x, z) => this.generator.heightAt(x, z), idPrefix: `deep-ocean:${id}:`,
      bounds: { x: [cx * SIZE + .8, (cx + 1) * SIZE - .8], z: [cz * SIZE + .8, (cz + 1) * SIZE - .8] },
      inletX: cx * SIZE + .85, outletX: (cx + 1) * SIZE - .85 };
  }
  _create(cx, cz) {
    const id = `${cx},${cz}`, sim = new DeepSimulation(`${this._world}|${id}`, this._plan(cx, cz));
    for (const agent of sim.agents) agent.regionId = id;
    return { id, cx, cz, habitat: this.generator.sample((cx + .5) * SIZE, (cz + .5) * SIZE).habitat, sim };
  }
  _record(region) {
    const record = { ...clone(region._savedRecord ?? {}), version: 1, id: region.id, cx: region.cx, cz: region.cz, habitat: region.habitat,
      state: { ...clone(region._savedState ?? {}), ...Object.fromEntries(fields.map(field => [field, clone(region.sim[field])])) } };
    if (region.predatorCommunityVersion !== undefined) for (const key of ['predatorCommunityVersion', 'predatorAgents',
      'predatorEnergyLedger', 'predatorCounters', 'predatorEvents']) record[key] = clone(region[key]);
    if (region.seascapeVersion !== undefined) {
      record.seascapeVersion = region.seascapeVersion;
      record.seascapeInitializedAtSec = region.seascapeInitializedAtSec;
      record.seascapePlan = clone(region.seascapePlan);
    }
    return record;
  }
  _restore(record, cx, cz) {
    const id = `${cx},${cz}`, state = record?.state;
    const fail = () => { throw new Error(`Saved deep region ${id} is invalid; population was not regenerated.`); };
    const owns = point => vector(point) && Math.floor(point.x / SIZE) === cx && Math.floor(point.z / SIZE) === cz;
    if (record?.version !== 1 || record.id !== id || record.cx !== cx || record.cz !== cz ||
      !fields.every(field => Object.hasOwn(state ?? {}, field)) || !Array.isArray(state.agents) || state.agents.length > 20 ||
      !Number.isSafeInteger(state._ticks) || state._ticks < 0 || !close(state.timeSec, state._ticks * STEP) ||
      !Number.isSafeInteger(state._rngState) || state._rngState < 0 || state._rngState > 0xffffffff ||
      !nonnegative(state._accumulator) || state._accumulator >= STEP + 1e-8 ||
      !['_nextRelease', '_nextSummary', 'timeSec'].every(field => nonnegative(state[field])) ||
      !Number.isSafeInteger(state._nextParcelId) || state._nextParcelId < 0 ||
      state.primaryProduction !== 0 || state.totalPrimaryProduction !== 0 ||
      !Array.isArray(state.events) || state.events.length > 100) fail();
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24], observerLight: [0, 1] };
    if (Object.entries(ranges).some(([key, [min, max]]) => !Number.isFinite(state.environment?.[key]) || state.environment[key] < min || state.environment[key] > max) ||
      !['feedingCount', 'grazingCount', 'approachCount', 'captureCount', 'deathCount'].every(key => Number.isSafeInteger(state.counters?.[key]) && state.counters[key] >= 0) ||
      !['initial', 'input', 'ingested', 'transferred', 'exported'].every(key => nonnegative(state.ledger?.[key])) ||
      !['initial', 'feedingGain', 'maintenanceAndMotionDebit'].every(key => nonnegative(state.energyLedger?.[key])) ||
      !Number.isFinite(state.energyLedger?.clampCorrection)) fail();
    const seascapePlan = this._savedSeascapePlan(record, cx, cz);
    const region = this._create(cx, cz), ids = new Set(), expected = new Map(region.sim.agents.map(agent => [agent.id, agent]));
    if (expected.size !== state.agents.length) fail();
    for (const agent of state.agents) {
      const species = deepSpeciesById[agent?.speciesId], original = expected.get(agent?.id);
      if (!species || !original || original.speciesId !== agent.speciesId || ids.has(agent.id) || agent.regionId !== id ||
        agent.taxonomicLevel !== species.taxonomicLevel || !['position', 'home', 'target'].every(key => owns(agent[key])) ||
        !vector(agent.velocity) || !Number.isFinite(agent.heading) || !Number.isFinite(agent.sizeM) ||
        agent.sizeM < species.displaySizeM.range[0] || agent.sizeM > species.displaySizeM.range[1] ||
        !Number.isFinite(agent.energy) || agent.energy < (agent.alive ? .02 : 0) || agent.energy > 1 || typeof agent.alive !== 'boolean' ||
        typeof agent.state !== 'string' || !['stateSince', 'nextBite', 'nextDecision', 'stress', 'hunger'].every(key => nonnegative(agent[key])) ||
        (agent.lastFeedAt !== null && (!nonnegative(agent.lastFeedAt) || agent.lastFeedAt > state.timeSec + 1e-8))) fail();
      if (agent.speciesId === 'pom-pom-anemone' && (!owns(agent.anchor) ||
        ['x', 'y', 'z'].some(axis => !close(agent.position[axis], agent.anchor[axis]) || !close(agent.anchor[axis], original.anchor[axis])))) fail();
      if (agent.alive) {
        const y = agent.speciesId === 'rattail-family' ? region.sim._fishFloor(agent) : this.generator.heightAt(agent.position.x, agent.position.z);
        if (!close(y, agent.position.y)) fail();
        if (agent.speciesId === 'sea-pig-group') {
          if (!Array.isArray(agent.contactPointsLocal) || agent.contactPointsLocal.length !== 12 || agent.contactPointsLocal.some(point => !vector(point))) fail();
          const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
          for (const point of agent.contactPointsLocal) {
            const x = agent.position.x + agent.sizeM * (point.x * c - point.z * s);
            const z = agent.position.z + agent.sizeM * (point.x * s + point.z * c);
            if (!close(agent.position.y + point.y * agent.sizeM, this.generator.heightAt(x, z))) fail();
          }
        }
      }
      ids.add(agent.id);
    }
    const patchIds = new Set(), stocks = {};
    for (const [name, pool, limit] of [['surfacePatches', 'surfaceDetritus', 16], ['benthicPatches', 'benthicAnimalFood', 16], ['suspendedPatches', 'suspendedPrey', DEEP_MODEL_PARAMETERS.maximumSuspendedParcels]]) {
      if (!Array.isArray(state[name]) || state[name].length > limit) fail();
      if (name !== 'suspendedPatches' && (state[name].length !== region.sim[name].length ||
        state[name].some(patch => !region.sim[name].some(original => original.id === patch.id &&
          ['x', 'y', 'z'].every(axis => close(original.position[axis], patch.position?.[axis])))))) fail();
      for (const patch of state[name]) {
        if (typeof patch?.id !== 'string' || patchIds.has(patch.id) || !owns(patch.position) || !nonnegative(patch[pool])) fail();
        patchIds.add(patch.id);
        const y = this.generator.heightAt(patch.position.x, patch.position.z);
        if (pool === 'suspendedPrey') {
          if (!Number.isInteger(patch.laneIndex) || patch.laneIndex < 0 || patch.laneIndex >= region.sim._anchors.length ||
            !nonnegative(patch.heightM) || !close(patch.position.y, y + patch.heightM) ||
            patch.position.x < region.sim._inletX || patch.position.x > region.sim._outletX) fail();
        } else if (!close(patch.position.y, y)) fail();
      }
      stocks[pool] = state[name].reduce((sum, patch) => sum + patch[pool], 0);
    }
    const sedimentIds = new Set(state.surfacePatches.map(patch => patch.id));
    if (state.benthicPatches.some(patch => !sedimentIds.has(patch.sedimentId))) fail();
    for (const pool of pools) {
      const budget = state.ledger.byPool?.[pool];
      if (!['initial', 'input', 'ingested', 'transferredIn', 'transferredOut', 'exported'].every(key => nonnegative(budget?.[key])) ||
        !close(stocks[pool], budget.initial + budget.input + budget.transferredIn - budget.transferredOut - budget.ingested - budget.exported)) fail();
    }
    if (!close(Object.values(stocks).reduce((a, b) => a + b, 0), state.ledger.initial + state.ledger.input - state.ledger.ingested - state.ledger.exported) ||
      !close(state.agents.reduce((sum, agent) => sum + agent.energy, 0), state.energyLedger.initial + state.energyLedger.feedingGain - state.energyLedger.maintenanceAndMotionDebit + state.energyLedger.clampCorrection - (state.energyLedger.predationTransferredOut ?? 0))) fail();
    for (const field of fields) region.sim[field] = clone(state[field]);
    region.habitat = record.habitat;
    if (!validateDeepPredatorRecord(record, region, { seed: this.seed, supportHeight: (x, z) => this.generator.heightAt(x, z) })) fail();
    region._savedRecord = clone(record); region._savedState = clone(state);
    if (record.predatorCommunityVersion !== undefined) for (const key of ['predatorCommunityVersion', 'predatorAgents',
      'predatorEnergyLedger', 'predatorCounters', 'predatorEvents']) region[key] = clone(record[key]);
    if (seascapePlan) {
      region.seascapeVersion = record.seascapeVersion;
      region.seascapeInitializedAtSec = record.seascapeInitializedAtSec;
      region.seascapePlan = clone(seascapePlan);
    }
    return region;
  }
  _enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(error => { this._storageError = String(error?.message || error); });
    return result;
  }
  async _save(world, records) {
    try {
      if (this.store.available === false) throw new Error('Deep regional storage is unavailable; population was not committed.');
      if (typeof this.store.saveMany === 'function') {
        if (await this.store.saveMany(world, records) === null) throw new Error('Deep regional save did not commit.');
      } else for (const [id, record] of records) if (await this.store.save(world, id, record) === null) throw new Error('Deep regional save did not commit.');
      this._counts.saved += records.length; return true;
    } catch (error) { this._counts.persistenceErrors++; this._storageError = String(error?.message || error); return false; }
  }

  _prepareSeascapeOwner(saved, cx, cz) {
    const fresh = saved === null, region = fresh ? this._create(cx, cz) : this._restore(saved, cx, cz);
    const upgraded = upgradeDeepPredators(region, { seed: this.seed,
      supportHeight: (x, z) => this.generator.heightAt(x, z), animalLimit: DEEP_OCEAN_REGION_ANIMAL_LIMIT });
    return { region, fresh, changed: fresh || upgraded };
  }

  async _updateSeascapeWindow(world, desired, current) {
    try {
      const groups = new Map(), halo = new Map();
      for (const [x, z] of desired.values()) {
        const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
        groups.set(`${gx},${gz}`, [gx, gz]);
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) halo.set(`${gx + dx},${gz + dz}`, [gx + dx, gz + dz]);
      }
      if (halo.size > 16) throw new Error('Deep seascape admission exceeded the bounded owner read halo.');
      const savedRows = new Map(), savedPlans = [];
      for (const [id, [x, z]] of halo) {
        const active = this._active.get(id), saved = active ? this._record(active) : await this.store.load(world, id);
        if (!current()) return;
        // A failed or undefined read is not an empty ocean. Only a successful
        // null permits new landscape, population and initial food inventory.
        if (saved === undefined) throw new Error('Deep seascape owner read returned no result.');
        savedRows.set(id, saved);
        if (saved !== null) {
          const plan = this._savedSeascapePlan(saved, x, z);
          if (plan) savedPlans.push(plan);
        }
      }
      const freshPlans = [];
      for (const [gx, gz] of groups.values()) {
        const ids = [0, 1].flatMap(dz => [0, 1].map(dx => `${gx + dx},${gz + dz}`));
        const rows = ids.map(id => savedRows.get(id));
        const marked = rows.filter(row => row && ['seascapeVersion', 'seascapeInitializedAtSec', 'seascapePlan'].some(key => Object.hasOwn(row, key)));
        if (marked.length) {
          // All four owners were committed together. Missing records or
          // stripped markers must not reconstruct unrecorded life or food.
          if (marked.length !== 4 || rows.some(row => !row || row.seascapeVersion !== 1 ||
              row.seascapePlan?.group?.cx !== gx || row.seascapePlan?.group?.cz !== gz ||
              row.seascapeInitializedAtSec !== marked[0].seascapeInitializedAtSec ||
              JSON.stringify(row.seascapePlan.group) !== JSON.stringify(marked[0].seascapePlan.group)))
            throw new Error('Saved deep seascape group is incomplete or inconsistent; no landscape or population was regenerated.');
          continue;
        }
        if (!ids.every(id => savedRows.get(id) === null)) continue;
        let plans;
        try { plans = createDeepSeascapePlans(this.generator.baseGenerator, gx, gz); }
        catch (error) { if (error instanceof RangeError) continue; throw error; }
        if (!Array.isArray(plans) || plans.length !== 4 || new Set(plans.map(plan => plan.id)).size !== 4 ||
            plans.some(plan => !ids.includes(plan.id) || plan.group?.cx !== gx || plan.group?.cz !== gz ||
              !Array.isArray(plan.group.ownerIds) || plan.group.ownerIds.length !== 4 || ids.some(id => !plan.group.ownerIds.includes(id)) ||
              !validateDeepSeascapePlan(plan, this.generator.baseGenerator)))
          throw new Error('Invalid fresh deep seascape group.');
        freshPlans.push(...plans);
      }
      const allPlans = [...savedPlans, ...freshPlans], prepared = new Map();
      // The same temporary source creates the original three identities,
      // conditional predator and every real food patch once, without exposing
      // scenery revisions before the complete birth records are committed.
      this.generator.withSeascapePlans(allPlans, () => {
        for (const plan of freshPlans) {
          const item = this._prepareSeascapeOwner(null, plan.cx, plan.cz);
          item.region.seascapeVersion = 1; item.region.seascapeInitializedAtSec = item.region.sim.timeSec;
          item.region.seascapePlan = clone(plan); prepared.set(plan.id, item);
        }
        for (const [id, [x, z]] of desired) {
          if (this._active.has(id) || prepared.has(id)) continue;
          prepared.set(id, this._prepareSeascapeOwner(savedRows.get(id), x, z));
        }
      });
      if (!current()) return;
      for (const { region } of prepared.values()) {
        if (region.sim.agents.length + (region.predatorAgents?.length ?? 0) > DEEP_OCEAN_REGION_ANIMAL_LIMIT ||
            Math.abs(region.sim.metrics.resourceBudgetError) > 1e-8 ||
            Math.abs(region.sim.metrics.energyBudgetError) > 1e-8 || Math.abs(predatorEnergyBudgetError(region)) > 1e-8)
          throw new Error('Invalid deep seascape birth population or initial food inventory.');
      }
      const records = [...prepared].filter(([, item]) => item.changed).map(([id, item]) => [id, this._record(item.region)]);
      if (records.length && !await this._save(world, records)) { this._center = null; return false; }
      if (!current()) return;
      // Offscreen members of a newly saved group remain frozen at time zero.
      // Replace with the complete bounded halo rather than accumulate visited
      // plans; sim support closures continue to query this published facade.
      this.generator.setSeascapePlans(allPlans);
      for (const [id, item] of prepared) {
        if (!desired.has(id)) continue;
        this._active.set(id, item.region); this._counts[item.fresh ? 'generated' : 'restored']++;
      }
      return true;
    } catch (error) {
      this._counts.persistenceErrors++; this._storageError = String(error?.message || error); this._center = null; return false;
    }
  }
  update(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) throw new RangeError('Deep exploration coordinates must be finite.');
    const cx = Math.floor(position.x / SIZE), cz = Math.floor(position.z / SIZE);
    if (![cx - 1, cx + 1, cz - 1, cz + 1].every(Number.isSafeInteger)) throw new RangeError('Deep chunk coordinates must be safe integers.');
    if (this._disposed) return Promise.resolve();
    if (this._center?.cx === cx && this._center?.cz === cz) return this._pending;
    this._center = { cx, cz };
    const generation = this._generation, revision = ++this._revision, world = this._world;
    return this._pending = this._enqueue(async () => {
      const current = () => !this._disposed && generation === this._generation && revision === this._revision;
      if (!current()) return;
      const desired = new Map();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) desired.set(`${cx + dx},${cz + dz}`, [cx + dx, cz + dz]);
      const exits = [...this._active.keys()].filter(id => !desired.has(id));
      for (const id of exits) this._locked.add(id);
      try {
        if (exits.length) {
          const saved = await this._save(world, exits.map(id => [id, this._record(this._active.get(id))]));
          if (!current()) return;
          if (!saved) { this._center = null; return false; }
          for (const id of exits) { this._active.delete(id); this._counts.unloaded++; }
        }
      } finally { for (const id of exits) this._locked.delete(id); }
      if (this.seascapeEnabled) return this._updateSeascapeWindow(world, desired, current);
      for (const [id, [x, z]] of desired) {
        if (this._active.has(id)) continue;
        try {
          const saved = await this.store.load(world, id);
          if (!current()) return;
          const fresh = saved === null || saved === undefined, region = fresh ? this._create(x, z) : this._restore(saved, x, z);
          // A missing class is examined exactly once, independently of the
          // native RNG. Commit the additive metadata before public activation.
          const upgraded = typeof this.store.saveMany === 'function' && upgradeDeepPredators(region, {
            seed: this.seed, supportHeight: (px, pz) => this.generator.heightAt(px, pz), animalLimit: DEEP_OCEAN_REGION_ANIMAL_LIMIT });
          if ((fresh || upgraded) && !await this._save(world, [[id, this._record(region)]])) { this._center = null; return false; }
          if (!current()) return;
          this._active.set(id, region); this._counts[fresh ? 'generated' : 'restored']++;
        } catch (error) { this._counts.persistenceErrors++; this._storageError = String(error?.message || error); this._center = null; return false; }
      }
      return true;
    });
  }
  setEnvironment(patch = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Deep regional environment must be an object.');
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24], observerLight: [0, 1] };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(ranges, key) || !Number.isFinite(value)) throw new TypeError(`Invalid deep regional parameter: ${key}`);
    }
    for (const [key, value] of Object.entries(patch)) this.environment[key] = key === 'hour' ? ((value % 24) + 24) % 24 :
      Math.max(ranges[key][0], Math.min(ranges[key][1], value));
    return this.environment;
  }
  step(seconds, environment = {}) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) throw new RangeError('Deep ecology step requires 0–86400 finite simulation seconds.');
    if (this._disposed || seconds === 0) return;
    this.setEnvironment(environment); this._accumulator += seconds;
    while (this._accumulator + 1e-10 >= STEP) {
      this._accumulator = Math.max(0, this._accumulator - STEP); this._activeTime += STEP;
      for (const region of this._active.values()) {
        if (this._locked.has(region.id)) continue;
        for (const key of ['currentMps', 'turbidity', 'foodSupply', 'hour', 'observerLight']) region.sim.environment[key] = this.environment[key];
        region.sim.step(STEP);
        if (typeof this.store.saveMany === 'function') advanceDeepPredators(region, STEP, { supportHeight: (x, z) => this.generator.heightAt(x, z) });
      }
    }
    if (this._activeTime >= this._checkpointAt) { this._checkpointAt = this._activeTime + 10; this.checkpoint(); }
  }
  get agents() {
    return [...this._active.values()].flatMap(region => [...region.sim.agents, ...(region.predatorAgents ?? [])].map(agent => ({ ...agent,
      regionId: region.id, timeSec: region.sim.timeSec, localEnvironment: { ...region.sim.environment } })));
  }
  checkpoint() {
    const generation = this._generation, world = this._world;
    return this._enqueue(async () => {
      if (this._disposed || generation !== this._generation) return;
      return this._save(world, [...this._active].map(([id, region]) => [id, this._record(region)]));
    });
  }
  snapshot() {
    const agents = this.agents, living = agents.filter(agent => agent.alive);
    const regions = [...this._active.values()].map(region => ({ id: region.id, cx: region.cx, cz: region.cz, habitat: region.habitat,
      timeSec: region.sim.timeSec, agentCount: region.sim.agents.length + (region.predatorAgents?.length ?? 0),
      nativeAgentCount: region.sim.agents.length, predatorAgentCount: region.predatorAgents?.length ?? 0,
      alive: [...region.sim.agents, ...(region.predatorAgents ?? [])].filter(agent => agent.alive).length,
      resources: { ...region.sim.resources }, ledger: clone(region.sim.ledger), energyLedger: clone(region.sim.energyLedger), counters: { ...region.sim.counters },
      balanceError: region.sim.metrics.resourceBudgetError, energyBalanceError: region.sim.metrics.energyBudgetError,
      predatorCommunityVersion: region.predatorCommunityVersion ?? 0,
      predatorEnergyLedger: clone(region.predatorEnergyLedger ?? { initial: 0, transferredIn: 0, metabolism: 0, loss: 0 }),
      predatorCounters: clone(region.predatorCounters ?? { feedingCount: 0, approachCount: 0, deathCount: 0 }),
      predatorEnergyBalanceError: predatorEnergyBudgetError(region),
      ...(region.seascapeVersion !== undefined ? { seascapeVersion: region.seascapeVersion,
        seascapeInitializedAtSec: region.seascapeInitializedAtSec, seascape: clone(region.seascapePlan.group) } : {}),
      suspendedParcelCount: region.sim.suspendedPatches.length, primaryProduction: 0,
      localEnvironment: { ...region.sim.environment, lightLevel: 0, naturalLightLevel: 0, visibilityM: region.sim.visibilityM } }));
    const resources = Object.fromEntries(pools.map(pool => [pool, regions.reduce((sum, region) => sum + region.resources[pool], 0)]));
    const averageResources = Object.fromEntries(pools.map(pool => [pool, regions.length ? resources[pool] / regions.length : 0]));
    const averageEnergy = living.length ? living.reduce((sum, agent) => sum + agent.energy, 0) / living.length : 0;
    return { seed: this.seed, agents: clone(agents), regions, resources,
      events: [...this._active.values()].flatMap(region => [...region.sim.events.slice(-8), ...(region.predatorEvents ?? []).slice(-4)].map((event, index) => ({ ...clone(event),
        id: `${region.id}:${event.timeSec}:${index}`, regionId: region.id, title: event.label }))),
      metrics: { ...this._counts, activeRegions: this._active.size, maxActiveRegions: 9, activeIndividuals: agents.length,
        alive: living.length, maxIndividualsPerRegion: 20, averageResources, ...averageResources, averageEnergy, avgEnergy: averageEnergy,
        timeSec: regions.length ? regions.reduce((sum, region) => sum + region.timeSec, 0) / regions.length : 0,
        visibilityM: regions.length ? regions.reduce((sum, region) => sum + region.localEnvironment.visibilityM, 0) / regions.length : 0,
        turbidity: this.environment.turbidity, currentMps: this.environment.currentMps, observerLight: this.environment.observerLight,
        lightLevel: 0, naturalLightLevel: 0, primaryProduction: 0, totalPrimaryProduction: 0,
        loadingRegions: this._center ? 9 - this._active.size : 0,
        balanceError: regions.reduce((error, region) => Math.max(error, Math.abs(region.balanceError)), 0),
        energyBalanceError: regions.reduce((error, region) => Math.max(error, Math.abs(region.energyBalanceError)), 0),
        predatorEnergyBalanceError: regions.reduce((error, region) => Math.max(error, Math.abs(region.predatorEnergyBalanceError)), 0),
        predatorPopulation: agents.filter(agent => agent.speciesId === 'giant-sea-spider-group').length,
        predationTransferredOut: regions.reduce((sum, region) => sum + (region.energyLedger.predationTransferredOut ?? 0), 0),
        predationCount: regions.reduce((sum, region) => sum + region.predatorCounters.feedingCount, 0),
        persistenceStatus: this._storageError ? 'error' : this.store.available === false ? 'session-only' : 'indexeddb',
        storageError: this._storageError, scope: 'loaded-deep-regions-only', unloadedPolicy: 'frozen',
        resourceScope: 'relative-organic-food-proxy-unit' } };
  }
  reset(seed = this.seed, generator = this.generator) {
    const previous = this._world, next = keyFor(seed);
    this._generation++; this._revision++; this._active.clear(); this._locked.clear(); this._center = null;
    this.seed = seed; this.generator = generator; this._world = next; this._disposed = false;
    this.seascapeEnabled = this._seascapeRequested && this._seascapeAvailable(generator);
    if (this.seascapeEnabled) this.generator.setSeascapePlans([]);
    this._accumulator = 0; this._activeTime = 0; this._checkpointAt = 10;
    return this._pending = this._enqueue(async () => {
      try { await this.store.clear(previous); if (next !== previous) await this.store.clear(next); }
      catch (error) { this._counts.persistenceErrors++; this._storageError = String(error?.message || error); }
    });
  }
  dispose() {
    if (this._disposed) return this._queue;
    const world = this._world; this._disposed = true; this._generation++; this._revision++;
    return this._enqueue(async () => {
      await this._save(world, [...this._active].map(([id, region]) => [id, this._record(region)]));
      this._active.clear(); this._locked.clear(); this._center = null;
    });
  }
}
