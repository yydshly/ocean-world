import { deepSpeciesCatalog, deepSpeciesById, deepModelScope } from './deepSpecies.js';
import { DEEP_DEPTH_M, DEEP_WORLD_BOUNDS, DEEP_ANEMONE_ANCHORS, DEEP_SEA_PIG_CONTACTS_LOCAL, deepFloorHeight, sampleDeepSupportPose, seaPigContactPointsLocal } from './deepHabitat.js';
export { deepSpeciesCatalog, deepSpeciesById };
export const WORLD_BOUNDS = DEEP_WORLD_BOUNDS;
export const DEFAULT_ENVIRONMENT = Object.freeze({ currentMps: 0.06, turbidity: 0.25, foodSupply: 1, hour: 10, observerLight: 1 });
export const DEEP_MODEL_PARAMETERS = Object.freeze({
  fixedStepSec: 0.1, seaPigCrawlMps: 0.0007, fishSearchMps: 0.035,
  seaPigSenseM: 0.85, fishChemicalSenseM: 2.5,
  detritusInputPerPatchPerSec: 0.000010, benthicFoodInputPerPatchPerSec: 0.000008,
  suspendedInputPerLanePerRelease: 0.0015, suspendedReleaseIntervalSec: 10,
  suspendedTransportProbeSpacingM: 0.01,
  benthicBreakdownFractionPerSec: 0.00007, sedimentExportFractionPerSec: 0.00003,
  maximumSuspendedParcels: 256,
  note: 'Uncalibrated demonstration rates, not measured animal speeds, currents, densities, food fluxes or metabolism. All foods share relative organic-proxy units; energy is a condition index. Suspended prey advects along +X at constant world Y and leaves the modeled suspended channel at support contact; observer illumination and hour never supply ecological energy.',
});
const P = DEEP_MODEL_PARAMETERS;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const copy = (point) => ({ x: point.x, y: point.y, z: point.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const total = (values) => Object.values(values).reduce((sum, value) => sum + value, 0);
const POOLS = ['surfaceDetritus', 'benthicAnimalFood', 'suspendedPrey'];
function hashSeed(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return state >>> 0;
}

/** Independent deep soft-bottom functional model. Position m; velocity m/s;
 * time seconds; foods relative organic-proxy units; energy dimensionless.
 * No local photosynthesis, measured rates, recruitment or mortality forecast. */
export class DeepSimulation {
  constructor(seed = 42, options = {}) { this.reset(seed, options); }
  reset(seed = this.seed ?? 42, options = this._options ?? {}) {
    this._options = options;
    this._floorHeight = options.supportHeight ?? deepFloorHeight;
    this._anchors = options.anchors ?? DEEP_ANEMONE_ANCHORS;
    this._inletX = options.inletX ?? -8.8; this._outletX = options.outletX ?? 8.8;
    this._prefix = options.idPrefix ?? '';
    this.seed = seed;
    this._rngState = hashSeed(seed);
    this._ticks = 0; this._accumulator = 0; this.timeSec = 0;
    this.environment = { ...DEFAULT_ENVIRONMENT };
    this.events = []; this.agents = [];
    this.primaryProduction = 0; this.totalPrimaryProduction = 0;
    this.counters = { feedingCount: 0, grazingCount: 0, approachCount: 0, captureCount: 0, deathCount: 0 };
    this.ledger = { initial: 0, input: 0, ingested: 0, transferred: 0, exported: 0, byPool: {} };
    this.energyLedger = { initial: 0, feedingGain: 0, maintenanceAndMotionDebit: 0, clampCorrection: 0 };
    this._nextParcelId = 0; this._nextRelease = P.suspendedReleaseIntervalSec; this._nextSummary = 30;
    const sites = options.surfaceSites ?? [-3, 0, 3].flatMap(z => [-5, -2, 1, 4].map(x => [x, z]));
    this.surfacePatches = sites.map(([x, z]) => ({
      id: `${this._prefix}sediment-${x}-${z}`, position: { x, y: this._floorHeight(x, z), z }, surfaceDetritus: 0.025,
    }));
    this.benthicPatches = this.surfacePatches.filter((_, index) => options.benthicSiteIndices ? options.benthicSiteIndices.includes(index) : index % 3 !== 2).map((patch, index) => ({
      id: `${this._prefix}benthic-animal-${index}`, sedimentId: patch.id, position: copy(patch.position), benthicAnimalFood: 0.016,
    }));
    this.suspendedPatches = [];
    const pigSites = options.seaPigSiteIndices ?? Array.from({ length: 8 }, (_, index) => index);
    for (let index = 0; index < pigSites.length; index += 1) {
      const patch = this.surfacePatches[pigSites[index]];
      const x = patch.position.x + this._range(-0.025, 0.025);
      const z = patch.position.z + this._range(-0.025, 0.025);
      const agent = this._baseAgent('sea-pig-group', index, { x, y: this._floorHeight(x, z), z });
      this._support(agent); this.agents.push(agent);
    }
    const fishSites = options.fishSiteIndices ?? [0, 2, 4];
    for (let index = 0; index < fishSites.length; index += 1) {
      const patch = this.benthicPatches[fishSites[index]];
      const agent = this._baseAgent('rattail-family', index, {
        x: patch.position.x + this._range(-0.6, -0.45), y: 0, z: patch.position.z + this._range(-0.1, 0.1),
      });
      agent.heading = 0;
      agent.position.y = this._fishFloor(agent);
      agent.home = copy(agent.position); agent.target = copy(agent.position);
      this.agents.push(agent);
    }
    this._anchors.forEach((anchor, index) => {
      const agent = this._baseAgent('pom-pom-anemone', index, anchor);
      agent.state = 'attached-waiting'; agent.anchor = copy(agent.position);
      agent.supportPose = this._supportPose(anchor.x, anchor.z, agent.heading);
      this.agents.push(agent);
      for (let slot = 0; slot < 3; slot += 1) {
        this.suspendedPatches.push(this._parcel(index, anchor.x - 0.08 - slot * 0.18, anchor.z, 0.0015));
      }
    });
    for (const pool of POOLS) this.ledger.byPool[pool] = { initial: this.resources[pool], input: 0, ingested: 0, transferredIn: 0, transferredOut: 0, exported: 0 };
    this.ledger.initial = total(this.resources);
    this.energyLedger.initial = this.agents.reduce((sum, agent) => sum + agent.energy, 0);
    this._emit('initial', '3500米软底示意：3类准入生物', 'Scotoplanes 为属代理，Macrouridae 为科代理，Liponema brevicorne 为具名种；作者选择的组合和数量未按共同样方校准。');
    return this;
  }
  _random() {
    this._rngState = (this._rngState + 0x6d2b79f5) >>> 0;
    let value = this._rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  _range(low, high) { return low + this._random() * (high - low); }
  _baseAgent(speciesId, index, position) {
    const species = deepSpeciesById[speciesId];
    return {
      id: `${this._prefix}${speciesId}-${index + 1}`, speciesId, taxonomicLevel: species.taxonomicLevel,
      position: copy(position), velocity: { x: 0, y: 0, z: 0 }, heading: this._range(-Math.PI, Math.PI),
      sizeM: this._range(...species.displaySizeM.range), energy: this._range(0.65, 0.8),
      state: 'searching', alive: true, stateSince: 0, lastFeedAt: null, nextBite: this._range(0, 4),
      home: copy(position), target: copy(position), nextDecision: 0, stress: 0, hunger: 0,
    };
  }
  _parcel(laneIndex, x, z, amount = 0) {
    const anemone = this.agents.find((agent) => agent.id === `${this._prefix}pom-pom-anemone-${laneIndex + 1}`);
    const heightM = anemone.sizeM * 0.40;
    return { id: `${this._prefix}suspended-${++this._nextParcelId}`, laneIndex, heightM,
      position: { x, y: this._floorHeight(x, z) + heightM, z }, suspendedPrey: amount };
  }
  get resources() {
    return {
      surfaceDetritus: this.surfacePatches.reduce((sum, patch) => sum + patch.surfaceDetritus, 0),
      benthicAnimalFood: this.benthicPatches.reduce((sum, patch) => sum + patch.benthicAnimalFood, 0),
      suspendedPrey: this.suspendedPatches.reduce((sum, patch) => sum + patch.suspendedPrey, 0),
    };
  }
  get visibilityM() { return 0.7 + 10 * Math.exp(-2.8 * this.environment.turbidity); }
  get lightLevel() { return 0; }
  get naturalLightLevel() { return 0; }
  getAgent(id) { return this.agents.find((agent) => agent.id === id); }
  getMetrics() { return this.metrics; }
  setEnvironment(patch = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Environment patch must be an object.');
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24], observerLight: [0, 1] };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(ranges, key)) throw new TypeError(`Unknown environment parameter: ${key}`);
      if (!Number.isFinite(value)) throw new TypeError(`${key} must be finite.`);
    }
    const causes = {
      currentMps: '沿+X的底流改变悬浮食物的输运、出口及鱼的运动成本；不是已测场地流速。',
      turbidity: '只改变观察衰减；这三类首版的触手接触、沉积摄食和嗅觉/触觉代理不依赖灯光或视距。',
      foodSupply: '改变有限局部底床有机输入和上游动物性悬浮食物代理输入；先进入资源，不能直接给动物加体能。',
      hour: '只改变模拟时钟，3500米不产生太阳光和光合。',
      observerLight: '仅记录观察器照明开关，不产生自然光、光合或生态食物。',
    };
    for (const [key, value] of Object.entries(patch)) {
      const next = key === 'hour' ? ((value % 24) + 24) % 24 : clamp(value, ...ranges[key]);
      if (next === this.environment[key]) continue;
      const previous = this.environment[key]; this.environment[key] = next;
      this._emit('environment', `${key} 改变`, `${causes[key]} ${previous.toFixed(2)} → ${next.toFixed(2)}`);
    }
    return this.environment;
  }
  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) throw new RangeError('step requires 0–86400 finite seconds.');
    this._accumulator += seconds;
    while (this._accumulator + 1e-9 >= P.fixedStepSec) {
      this._accumulator -= P.fixedStepSec;
      if (this._accumulator < 0 && this._accumulator > -1e-8) this._accumulator = 0;
      this.timeSec = (++this._ticks) * P.fixedStepSec;
      this.environment.hour = (this.environment.hour + P.fixedStepSec / 3600) % 24;
      this._advance(P.fixedStepSec);
    }
    return this.metrics;
  }
  _input(patch, pool, amount) {
    amount = Math.max(0, amount); patch[pool] += amount;
    this.ledger.input += amount; this.ledger.byPool[pool].input += amount;
    return amount;
  }
  _remove(patch, pool, requested, kind = 'exported') {
    const amount = Math.min(Math.max(0, requested), patch[pool]);
    patch[pool] -= amount; this.ledger[kind] += amount; this.ledger.byPool[pool][kind] += amount;
    return amount;
  }
  _transfer(from, fromPool, to, toPool, requested) {
    const amount = Math.min(Math.max(0, requested), from[fromPool]);
    from[fromPool] -= amount; to[toPool] += amount;
    this.ledger.transferred += amount;
    this.ledger.byPool[fromPool].transferredOut += amount;
    this.ledger.byPool[toPool].transferredIn += amount;
    return amount;
  }
  _advance(dt) {
    const supply = this.environment.foodSupply;
    for (const patch of this.surfacePatches) {
      this._input(patch, 'surfaceDetritus', P.detritusInputPerPatchPerSec * supply * dt);
      this._remove(patch, 'surfaceDetritus', patch.surfaceDetritus * P.sedimentExportFractionPerSec * dt);
    }
    for (const patch of this.benthicPatches) {
      this._input(patch, 'benthicAnimalFood', P.benthicFoodInputPerPatchPerSec * supply * dt);
      const sediment = this.surfacePatches.find((item) => item.id === patch.sedimentId);
      this._transfer(patch, 'benthicAnimalFood', sediment, 'surfaceDetritus', patch.benthicAnimalFood * P.benthicBreakdownFractionPerSec * dt);
    }
    // Lagrangian functional parcels, not counted display particles. Material
    // enters at the upstream boundary; no parcel is teleported back downstream.
    if (this.timeSec + 1e-8 >= this._nextRelease) {
      this._nextRelease += P.suspendedReleaseIntervalSec;
      if (supply > 0) this._anchors.forEach((anchor, laneIndex) => {
        let parcel, overflow = false;
        if (this.suspendedPatches.length < P.maximumSuspendedParcels) {
          parcel = this._parcel(laneIndex, this._inletX, anchor.z + this._range(-0.025, 0.025));
          this.suspendedPatches.push(parcel);
        } else {
          // At zero flow, inlet material accumulates in the upstream parcel
          // of that lane. Finite parcel storage; incoming amount is still logged.
          parcel = this.suspendedPatches.filter((item) => item.laneIndex === laneIndex)
            .reduce((best, item) => !best || item.position.x < best.position.x ? item : best, null);
          if (!parcel) {
            // All parcels in one lane can leave while another lane fills the
            // storage cap. Account boundary overflow instead of dereferencing
            // null, silently discarding input or creating unbounded storage.
            parcel = this._parcel(laneIndex, this._inletX, anchor.z); overflow = true;
          }
        }
        this._input(parcel, 'suspendedPrey', P.suspendedInputPerLanePerRelease * supply);
        if (overflow) this._remove(parcel, 'suspendedPrey', parcel.suspendedPrey);
      });
    }
    for (const parcel of this.suspendedPatches) {
      const startX = parcel.position.x, travel = this.environment.currentMps * dt;
      // The imposed current has no vertical component. Relative clearance is
      // a saved-state reading, not a force lifting prey onto every rock. Check
      // the short whole segment so a low ridge between endpoints is not crossed.
      const probes = Math.max(1, Math.ceil(travel / P.suspendedTransportProbeSpacingM));
      let supportY, contact = false;
      for (let probe = 1; probe <= probes; probe++) {
        const x = startX + travel * probe / probes;
        supportY = this._floorHeight(x, parcel.position.z);
        if (supportY >= parcel.position.y - 1e-10) { contact = true; break; }
      }
      parcel.position.x = startX + travel;
      // Keep the existing heightM/position contract so old regional records
      // resume without changing IDs, supplies, clocks or their resource ledger.
      parcel.heightM = Math.max(0, parcel.position.y - supportY);
      // Contact removes material from this local suspended-food channel. It
      // is an accounted outlet, not another species' unmodeled food input.
      if (contact || parcel.position.x > this._outletX) this._remove(parcel, 'suspendedPrey', parcel.suspendedPrey);
    }
    this.suspendedPatches = this.suspendedPatches.filter((parcel) => parcel.position.x <= this._outletX && parcel.suspendedPrey > 0);
    for (const agent of this.agents) {
      if (!agent.alive) continue;
      const before = agent.energy;
      const gainBefore = this.energyLedger.feedingGain;
      if (agent.speciesId === 'sea-pig-group') this._seaPig(agent, dt);
      else if (agent.speciesId === 'rattail-family') this._rattail(agent, dt);
      else this._anemone(agent, dt);
      const rawEnergy = agent.energy;
      this.energyLedger.maintenanceAndMotionDebit += before + this.energyLedger.feedingGain - gainBefore - rawEnergy;
      agent.energy = clamp(rawEnergy, 0.02, 1);
      this.energyLedger.clampCorrection += agent.energy - rawEnergy;
      agent.hunger = 1 - agent.energy;
      agent.stress = clamp(this.environment.currentMps * (agent.speciesId === 'rattail-family' ? 0.8 : 0.25), 0, 1);
    }
    if (this.timeSec + 1e-8 >= this._nextSummary) {
      this._nextSummary += 30;
      this._emit('resource-summary', '局部食物与实际摄入更新', `外部输入 ${this.ledger.input.toFixed(4)}、实际摄入 ${this.ledger.ingested.toFixed(4)}、内部转移 ${this.ledger.transferred.toFixed(4)}、输出 ${this.ledger.exported.toFixed(4)}，单位均为有机食物相对代理。无现场光合。`);
    }
  }
  _setState(agent, state) {
    if (agent.state === state) return;
    if (state.startsWith('approaching')) this.counters.approachCount += 1;
    agent.state = state; agent.stateSince = this.timeSec;
  }
  _nearest(agent, patches, pool, range, from = agent.position) {
    let patch = null; let nearestDistance = range;
    for (const candidate of patches) {
      if (candidate[pool] <= 1e-12) continue;
      const d = distance(from, candidate.position);
      if (d <= nearestDistance) { patch = candidate; nearestDistance = d; }
    }
    return { patch, distance: nearestDistance };
  }
  feedingPosition(agent, pool) {
    if (pool === 'suspendedPrey') return { ...agent.position, y: agent.position.y + agent.sizeM * 0.40 };
    // These local mouth points agree with world/deepOrganisms.js. The fish
    // root is the lower support plane, not its body centre.
    const head = pool === 'benthicAnimalFood' ? 0.44 : 0.472;
    const x = agent.position.x + Math.cos(agent.heading) * head * agent.sizeM;
    const z = agent.position.z + Math.sin(agent.heading) * head * agent.sizeM;
    return { x, y: agent.position.y + agent.sizeM * (pool === 'benthicAnimalFood' ? 0.128 : 0.045), z };
  }
  feedingReachM(agent, pool) {
    if (pool === 'suspendedPrey') return agent.sizeM * 0.48 + 0.015;
    if (pool === 'benthicAnimalFood') return 0.10 + agent.sizeM * 0.12;
    return 0.035 + agent.sizeM * 0.35;
  }
  _feed(agent, patch, pool, requested, interval, gain) {
    if (!agent.alive || this.timeSec < agent.nextBite || patch[pool] <= 0) return 0;
    const feedPosition = this.feedingPosition(agent, pool);
    const feedDistanceM = distance(feedPosition, patch.position);
    const allowedDistanceM = this.feedingReachM(agent, pool);
    if (feedDistanceM > allowedDistanceM + 1e-10) return 0;
    const actualIntake = this._remove(patch, pool, requested, 'ingested');
    if (actualIntake <= 0) return 0;
    const energyGain = actualIntake * gain;
    agent.energy += energyGain; this.energyLedger.feedingGain += energyGain;
    agent.lastFeedAt = this.timeSec; agent.nextBite = this.timeSec + interval;
    this.counters.feedingCount += 1;
    if (pool === 'surfaceDetritus') this.counters.grazingCount += 1;
    if (pool === 'suspendedPrey') this.counters.captureCount += 1;
    this._setState(agent, pool === 'suspendedPrey' ? 'capturing-prey' : pool === 'surfaceDetritus' ? 'deposit-feeding' : 'benthic-feeding');
    this._emit('feeding', `${deepSpeciesById[agent.speciesId].commonName}实际摄入`, '食物位于可达口部/触手范围；资源实减后才更新体能和 lastFeedAt。', {
      agentId: agent.id, foodPool: pool, patchId: patch.id, requestedAmount: requested, actualIntake,
      unit: deepModelScope.resourceUnit, feedPosition, foodPosition: copy(patch.position), feedDistanceM, allowedDistanceM, energyGain,
    });
    return actualIntake;
  }
  _support(agent) {
    agent.position.y = this._floorHeight(agent.position.x, agent.position.z);
    agent.supportPose = this._supportPose(agent.position.x, agent.position.z, agent.heading);
    if (!this._options.supportHeight) agent.contactPointsLocal = seaPigContactPointsLocal(agent);
    else {
      const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
      agent.contactPointsLocal = DEEP_SEA_PIG_CONTACTS_LOCAL.map(point => ({ ...point,
        y: (this._floorHeight(agent.position.x + agent.sizeM * (point.x * c - point.z * s),
          agent.position.z + agent.sizeM * (point.x * s + point.z * c)) - agent.position.y) / agent.sizeM }));
    }
  }
  _supportPose(x, z, heading) {
    if (!this._options.supportHeight) return sampleDeepSupportPose(x, z, heading);
    const e = .01, dx = (this._floorHeight(x + e, z) - this._floorHeight(x - e, z)) / (2 * e);
    const dz = (this._floorHeight(x, z + e) - this._floorHeight(x, z - e)) / (2 * e), n = Math.hypot(dx, 1, dz);
    const normal = { x: -dx / n, y: 1 / n, z: -dz / n };
    const tangent = { x: Math.cos(heading), y: dx * Math.cos(heading) + dz * Math.sin(heading), z: Math.sin(heading) };
    const length = Math.hypot(tangent.x, tangent.y, tangent.z);
    for (const axis of ['x', 'y', 'z']) tangent[axis] /= length;
    return { position: { x, y: this._floorHeight(x, z), z }, normal, tangent };
  }
  _fishFloor(agent) {
    if (!this._options.supportHeight) return deepFloorHeight(agent.position.x, agent.position.z) + .03;
    const radius = agent.sizeM * .5;
    const probes = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.707, .707], [.707, -.707], [-.707, .707], [-.707, -.707]];
    return Math.max(...probes.map(([x, z]) => this._floorHeight(agent.position.x + x * radius, agent.position.z + z * radius))) + .03;
  }
  _move(agent, target, speed, dt, grounded) {
    if (this._options.bounds || this._options.supportHeight) return this._moveRegional(agent, target, speed, dt, grounded);
    const previous = copy(agent.position);
    const dx = target.x - agent.position.x, dz = target.z - agent.position.z;
    const d = Math.hypot(dx, dz); const travel = Math.min(d, speed * dt);
    if (d > 1e-8) {
      agent.position.x += dx / d * travel; agent.position.z += dz / d * travel;
      agent.heading = Math.atan2(dz, dx);
    }
    if (!grounded) agent.position.x += this.environment.currentMps * 0.006 * dt;
    agent.position.x = clamp(agent.position.x, -8.7, 8.7); agent.position.z = clamp(agent.position.z, -7.7, 7.7);
    if (grounded) this._support(agent);
    else agent.position.y = this._fishFloor(agent);
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
  }
  _moveRegional(agent, target, speed, dt, grounded) {
    const previous = copy(agent.position), bounds = this._options.bounds ?? DEEP_WORLD_BOUNDS;
    const dx = target.x - previous.x, dz = target.z - previous.z, d = Math.hypot(dx, dz);
    const travel = Math.min(d, speed * dt), drift = grounded ? 0 : this.environment.currentMps * .006 * dt;
    const budget = speed * dt + drift;
    let mx = (d > 1e-8 ? dx / d * travel : 0) + drift, mz = d > 1e-8 ? dz / d * travel : 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = { x: clamp(previous.x + mx, ...bounds.x), y: previous.y, z: clamp(previous.z + mz, ...bounds.z) };
      position.y = grounded ? this._floorHeight(position.x, position.z) : this._fishFloor({ ...agent, position });
      if (distance(previous, position) <= budget + 1e-10) {
        agent.position = position;
        if (Math.hypot(mx, mz) > 1e-10) agent.heading = Math.atan2(mz, mx);
        break;
      }
      mx *= .5; mz *= .5;
    }
    if (grounded) this._support(agent);
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
  }
  _wanderTarget(agent, radius, duration) {
    if (this.timeSec < agent.nextDecision) return;
    agent.nextDecision = this.timeSec + this._range(duration * 0.65, duration * 1.35);
    const angle = this._range(-Math.PI, Math.PI);
    const bounds = this._options.bounds;
    agent.target = {
      x: bounds ? clamp(agent.position.x + Math.cos(angle) * radius, ...bounds.x) : clamp(agent.position.x + Math.cos(angle) * radius, -8.4, 8.4),
      y: agent.position.y,
      z: bounds ? clamp(agent.position.z + Math.sin(angle) * radius, ...bounds.z) : clamp(agent.position.z + Math.sin(angle) * radius, -7.4, 7.4),
    };
  }
  _seaPig(agent, dt) {
    const nearest = this._nearest(agent, this.surfacePatches, 'surfaceDetritus', P.seaPigSenseM);
    let speed = P.seaPigCrawlMps;
    if (nearest.patch) {
      agent.target = copy(nearest.patch.position);
      const inReach = distance(this.feedingPosition(agent, 'surfaceDetritus'), nearest.patch.position) <= this.feedingReachM(agent, 'surfaceDetritus');
      if (inReach) {
        speed = 0; this._setState(agent, 'sediment-probing');
        this._feed(agent, nearest.patch, 'surfaceDetritus', 0.0008, 8, 3);
      } else this._setState(agent, 'approaching-detritus');
    } else {
      this._wanderTarget(agent, 0.25, 90); this._setState(agent, 'sediment-searching');
    }
    this._move(agent, agent.target, speed, dt, true);
    agent.energy -= dt * 0.000035;
  }
  _rattail(agent, dt) {
    const nearest = this._nearest(agent, this.benthicPatches, 'benthicAnimalFood', P.fishChemicalSenseM);
    let speed = P.fishSearchMps;
    if (nearest.patch) {
      agent.target = copy(nearest.patch.position);
      const inReach = distance(this.feedingPosition(agent, 'benthicAnimalFood'), nearest.patch.position) <= this.feedingReachM(agent, 'benthicAnimalFood');
      if (inReach) {
        speed = 0; this._setState(agent, 'bottom-probing');
        this._feed(agent, nearest.patch, 'benthicAnimalFood', 0.002, 20, 3.5);
      } else this._setState(agent, 'approaching-bottom-food');
    } else {
      this._wanderTarget(agent, 0.9, 25); this._setState(agent, 'near-bottom-searching');
      speed *= 0.55;
    }
    this._move(agent, agent.target, speed, dt, false);
    agent.energy -= dt * (0.00010 + this.environment.currentMps ** 2 * 0.0004);
  }
  _anemone(agent, dt) {
    const from = this.feedingPosition(agent, 'suspendedPrey');
    const nearest = this._nearest(agent, this.suspendedPatches, 'suspendedPrey', this.feedingReachM(agent, 'suspendedPrey'), from);
    this._setState(agent, 'attached-waiting');
    if (nearest.patch) this._feed(agent, nearest.patch, 'suspendedPrey', 0.0003, 6, 4);
    agent.position = copy(agent.anchor); agent.velocity = { x: 0, y: 0, z: 0 };
    agent.energy -= dt * 0.000024;
  }
  _emit(type, label, cause, fields = {}) {
    this.events.push({ timeSec: this.timeSec, type, label, cause, ...fields });
    if (this.events.length > 100) this.events.shift();
  }
  get metrics() {
    const alive = this.agents.filter((agent) => agent.alive);
    const behaviorCounts = {}, speciesCounts = {};
    for (const agent of alive) {
      behaviorCounts[agent.state] = (behaviorCounts[agent.state] || 0) + 1;
      speciesCounts[agent.speciesId] = (speciesCounts[agent.speciesId] || 0) + 1;
    }
    const resources = this.resources;
    const totalEnergy = this.agents.reduce((sum, agent) => sum + agent.energy, 0);
    const budget = this.energyLedger;
    return {
      timeSec: this.timeSec, depthM: DEEP_DEPTH_M, ...resources,
      resourceUnit: deepModelScope.resourceUnit, energyUnit: 'dimensionless-condition-index',
      population: alive.length, animalPopulation: alive.length, speciesCount: Object.keys(speciesCounts).length,
      averageEnergy: alive.length ? alive.reduce((sum, agent) => sum + agent.energy, 0) / alive.length : 0,
      visibilityM: this.visibilityM, lightLevel: 0, naturalLightLevel: 0, observerLightLevel: this.environment.observerLight,
      primaryProduction: 0, totalPrimaryProduction: 0,
      currentEnergyCost: this.environment.currentMps ** 2 * 0.0004,
      resourceBudgetError: total(resources) - (this.ledger.initial + this.ledger.input - this.ledger.ingested - this.ledger.exported),
      energyBudgetError: totalEnergy - (budget.initial + budget.feedingGain - budget.maintenanceAndMotionDebit + budget.clampCorrection - (budget.predationTransferredOut ?? 0)),
      suspendedParcelCount: this.suspendedPatches.length,
      ...this.counters, behaviorCounts, speciesCounts,
    };
  }
}
