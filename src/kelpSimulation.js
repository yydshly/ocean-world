import { biomeById } from './biomes.js';
import { supportedMotion } from './supportedMotion.js';
import { KELP_ANCHORS, KELP_ROCKS, KELP_SURFACE_Y, habitatHeight, habitatNormal, rockSurfaceHeight, kelpStipePosition, kelpLeafLength, leafAttachmentPosition } from './kelpHabitat.js';

export const kelpSpeciesCatalog = biomeById['kelp-forest'].organisms;
export const kelpSpeciesById = Object.fromEntries(kelpSpeciesCatalog.map((species) => [species.id, species]));
export const DEFAULT_ENVIRONMENT = Object.freeze({ currentMps: 0.18, deformationCurrentMps: 0.18, turbidity: 0.35, foodSupply: 1, hour: 10 });
export const WORLD_BOUNDS = Object.freeze({ x: [-9, 9], y: [-0.30, KELP_SURFACE_Y], z: [-8, 8] });
export const KELP_MODEL_PARAMETERS = Object.freeze({
  fixedStepSec: 0.1,
  secondsPerGrowthDay: 86400,
  kelpExtensionMPerDay: 0.06,
  deformationResponseTauSec: 4,
  chitonActivityPeriodSec: 120,
  chitonMinimumDayActivity: 0.08,
  crawlSpeedMps: Object.freeze({ 'purple-urchin': 0.0006, 'bat-star': 0.0008, 'gumboot-chiton': 0.0004, 'brown-turban-snail': 0.00015 }),
  fishApproachMps: 0.065,
  fishHoverMps: 0.025,
  note: 'All rates are uncalibrated demonstration parameters. Growth uses simulated days; movement uses seconds. Deformation flow is display-only with a 4s time constant; water exchange, fish advection and condition cost use the target current. Chiton nocturnality uses an approximate solar activity window, not a measured rhythm.',
});

const FIXED_STEP = KELP_MODEL_PARAMETERS.fixedStepSec;
const DAY = KELP_MODEL_PARAMETERS.secondsPerGrowthDay;
const GROUND_CLEARANCE = 0.003;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const copy = (point) => ({ x: point.x, y: point.y, z: point.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
function hashSeed(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return state >>> 0;
}

/** Independent qualitative kelp model. Position m, velocity m/s, step seconds.
 * Resource amounts and energy are relative indices, not mass or energy units.
 * No recruitment, mortality forecast or measured ecological rates are implied. */
export class KelpSimulation {
  constructor(seed = 42, options = {}) { this.options = options; this.reset(seed); }

  reset(seed = this.seed ?? 42) {
    // Regional kelp patches can supply their actual supports and sparse host
    // plan. The authored model retains the exact old defaults and draw order.
    const options = this.options;
    this.anchors = options.anchors ?? KELP_ANCHORS;
    this.rocks = options.rocks ?? KELP_ROCKS;
    this.bounds = options.bounds ?? WORLD_BOUNDS;
    this.surfaceY = options.surfaceY ?? KELP_SURFACE_Y;
    this.supportHeight = options.supportHeight ?? habitatHeight;
    this.supportNormal = options.supportNormal ?? habitatNormal;
    this.rockHeight = options.rockHeight ?? rockSurfaceHeight;
    this._idPrefix = options.idPrefix ?? '';
    this.seed = seed;
    this._rngState = hashSeed(seed);
    this._ticks = 0;
    this._accumulator = 0;
    this.timeSec = 0;
    this.environment = { ...DEFAULT_ENVIRONMENT };
    this.events = [];
    this.agents = [];
    this.hostById = new Map();
    this.primaryProduction = 0;
    this.totalPrimaryProduction = 0;
    this.counters = { grazingCount: 0, feedingCount: 0, approachCount: 0, shelterCount: 0, deathCount: 0 };
    this.ledger = { initial: 0, input: 0, ingested: 0, exported: 0 };
    this._nextSummary = 30;

    this.rockPatches = this.rocks.flatMap(([cx, , cz, sx, , sz], rockIndex) => [0, 1, 2].map((slot) => {
      const angle = slot * Math.PI * 2 / 3 + rockIndex * 0.27;
      const x = cx + Math.cos(angle) * sx * 0.32;
      const z = cz + Math.sin(angle) * sz * 0.32;
      return { id: `rock-food-${rockIndex}-${slot}`, rockIndex, position: { x, y: this.supportHeight(x, z), z }, algae: 0.085, detritus: 0.048 };
    }));
    this.floorPatches = (options.floorSites ?? [[-6.8, -0.6], [-0.8, -0.4], [3.2, 0.0], [1.5, 4.8], [-3.6, 5.3]]).map(([x, z], index) => ({
      id: `floor-food-${index}`, rockIndex: null, position: { x, y: this.supportHeight(x, z), z }, algae: 0, detritus: 0.07,
    }));
    this.groundPatches = [...this.rockPatches, ...this.floorPatches];
    this.kelpPatches = [];
    this.leafPatches = [];
    this.preyPatches = [];

    this.anchors.forEach((anchor, index) => {
      const plant = this._baseAgent('giant-kelp', index, { x: anchor.x, y: anchor.y, z: anchor.z });
      plant.anchor = { ...anchor };
      plant.sizeM = anchor.lengthM;
      plant.initialSizeM = plant.sizeM;
      plant.state = 'fixed';
      this.agents.push(plant);
      this.hostById.set(plant.id, plant);
      this.kelpPatches.push({ id: `kelp-food-${index}`, hostId: plant.id, kelpTissue: 0.35 });
      for (const leafIndex of [12, 15, 17]) this.leafPatches.push({ id: `leaf-food-${index}-${leafIndex}`, hostId: plant.id, leafIndex, biofilm: 0.035 });
      this.preyPatches.push({ id: `prey-food-${index}`, hostId: plant.id, fraction: 0.32 + (index % 3) * 0.045, smallPrey: 0.024 });
    });
    for (const [speciesId, count] of options.groundCounts ?? [['purple-urchin', 8], ['gumboot-chiton', 5]]) {
      for (let index = 0; index < count; index += 1) {
        const rockIndex = index % this.rocks.length;
        const [cx, , cz, sx, , sz] = this.rocks[rockIndex];
        const angle = this._range(-Math.PI, Math.PI);
        const x = cx + Math.cos(angle) * sx * this._range(0.12, 0.42);
        const z = cz + Math.sin(angle) * sz * this._range(0.12, 0.42);
        const agent = this._baseAgent(speciesId, index, { x, y: this.supportHeight(x, z) + GROUND_CLEARANCE, z });
        agent.rockIndex = rockIndex;
        if (speciesId === 'gumboot-chiton') agent.activityPhaseSec = index * 23.7 % KELP_MODEL_PARAMETERS.chitonActivityPeriodSec;
        this.agents.push(agent);
      }
    }
    this.floorPatches.forEach((patch, index) => {
      const agent = this._baseAgent('bat-star', index, { x: patch.position.x + this._range(-0.16, 0.16), y: 0, z: patch.position.z + this._range(-0.16, 0.16) });
      agent.position.y = this.supportHeight(agent.position.x, agent.position.z) + GROUND_CLEARANCE;
      agent.rockIndex = null;
      this.agents.push(agent);
    });
    this.anchors.forEach((_, index) => {
      const hostId = `${this._idPrefix}giant-kelp-${index + 1}`;
      const agent = this._baseAgent('brown-turban-snail', index, { x: 0, y: 0, z: 0 });
      agent.attachment = { hostId, leafIndex: [12, 15, 17][index % 3], along: this._range(0.35, 0.70), clearanceM: 0.003 };
      agent.position = leafAttachmentPosition(this.getKelpAnchor(hostId), agent.attachment, 0, this.environment);
      agent.home = copy(agent.position);
      agent.target = copy(agent.position);
      this.agents.push(agent);
    });
    const fishHostIndices = options.fishHostIndices ?? [0, 3, 6, 9];
    for (let index = 0; index < fishHostIndices.length; index += 1) {
      const hostId = `${this._idPrefix}giant-kelp-${fishHostIndices[index] + 1}`;
      const position = kelpStipePosition(this.getKelpAnchor(hostId), 0.40, 0, this.environment);
      position.x += this._range(0.22, 0.38);
      position.z += this._range(0.08, 0.20);
      const agent = this._baseAgent('giant-kelpfish', index, position);
      agent.hostId = hostId;
      this.agents.push(agent);
    }
    this.ledger.initial = Object.values(this.resources).reduce((total, value) => total + value, 0);
    this._emit('initial', '独立海带林已建立：6 个候选物种', '巨藻固着岩底；林底刮食者、冠层小螺和藻间鱼采用不同支持面与食物池，数量为展示选择。');
    return this;
  }

  _random() {
    this._rngState = (this._rngState + 0x6d2b79f5) >>> 0;
    let value = this._rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  _range(min, max) { return min + this._random() * (max - min); }

  _baseAgent(speciesId, index, position) {
    const [min, max] = kelpSpeciesById[speciesId].displaySizeM.range;
    return {
      id: `${this._idPrefix}${speciesId}-${index + 1}`, speciesId, position: copy(position), velocity: { x: 0, y: 0, z: 0 },
      heading: this._range(-Math.PI, Math.PI), sizeM: this._range(min, max), energy: this._range(0.66, 0.82),
      state: 'resting', alive: true, stateSince: 0, lastFeedAt: null, nextBite: this._range(0, 4),
      nextDecision: 0, home: copy(position), target: copy(position), stress: 0, hunger: 0,
    };
  }

  getKelpAnchor(hostId) {
    const plant = this.hostById.get(hostId);
    if (!plant) throw new RangeError(`Unknown kelp host: ${hostId}`);
    return { ...plant.anchor, lengthM: plant.sizeM };
  }

  setEnvironment(patch = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Environment patch must be an object.');
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24] };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(ranges, key)) throw new TypeError(`Unknown environment parameter: ${key}`);
      if (!Number.isFinite(value)) throw new TypeError(`${key} must be finite.`);
    }
    const explanations = {
      currentMps: '目标水流影响鱼的成本与物质交换；藻柄与叶面通过独立 deformationCurrentMps 以4秒时间常数平滑响应，根部不移动。',
      turbidity: '相对浑浊指数降低视距和光合输入；本模型没有由浑浊直接推断毒性或死亡。',
      foodSupply: '外部小型动物食物及有机材料输入改变，先进入局部资源，再由实际摄食影响体能。',
      hour: '模拟时刻改变太阳光；成长与光合依然使用明确的模拟天换算。',
    };
    for (const [key, value] of Object.entries(patch)) {
      const next = key === 'hour' ? ((value % 24) + 24) % 24 : clamp(value, ...ranges[key]);
      if (next === this.environment[key]) continue;
      const previous = this.environment[key];
      this.environment[key] = next;
      this._emit('environment', `${key} 改变`, `${explanations[key]} ${previous.toFixed(2)} → ${next.toFixed(2)}`);
    }
    return this.environment;
  }

  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > DAY) throw new RangeError('step() requires 0–86400 finite simulation seconds.');
    this._accumulator += seconds;
    while (this._accumulator + 1e-9 >= FIXED_STEP) {
      this._accumulator -= FIXED_STEP;
      if (this._accumulator < 0 && this._accumulator > -1e-8) this._accumulator = 0;
      this.timeSec = (++this._ticks) * FIXED_STEP;
      this.environment.hour = (this.environment.hour + FIXED_STEP / 3600) % 24;
      // Smooth only the visual support deformation; target current stays the
      // explicit setting used for water exchange, fish motion and condition cost.
      const blend = 1 - Math.exp(-FIXED_STEP / KELP_MODEL_PARAMETERS.deformationResponseTauSec);
      this.environment.deformationCurrentMps += (this.environment.currentMps - this.environment.deformationCurrentMps) * blend;
      this._advance(FIXED_STEP);
    }
    return this.metrics;
  }

  get lightLevel() {
    return Math.max(0, Math.sin((this.environment.hour - 6) * Math.PI / 12)) * Math.exp(-2.2 * this.environment.turbidity);
  }
  get visibilityM() { return 11 * Math.exp(-2.3 * this.environment.turbidity) + 0.8; }
  get chitonActivityLevel() {
    // Aquarium natural history supports usually feeding at night, but not an
    // exact threshold. Turbidity must not turn astronomical daytime into night.
    const daylight = Math.max(0, Math.sin((this.environment.hour - 6) * Math.PI / 12));
    const minimum = KELP_MODEL_PARAMETERS.chitonMinimumDayActivity;
    return minimum + (1 - minimum) * (1 - daylight);
  }
  lightAtHeight(y) { return this.options.lightAtHeight ? this.options.lightAtHeight(y, this.lightLevel) : this.lightLevel * (0.20 + 0.80 * clamp(y / KELP_SURFACE_Y, 0, 1)); }
  get resources() {
    const resources = {
      algae: sum(this.groundPatches, 'algae'), biofilm: sum(this.leafPatches, 'biofilm'),
      detritus: sum(this.groundPatches, 'detritus'), smallPrey: sum(this.preyPatches, 'smallPrey'), kelpTissue: sum(this.kelpPatches, 'kelpTissue'),
    };
    return this.options.resourceTotals ? this.options.resourceTotals(this, resources) : resources;
  }
  _input(patch, key, amount) {
    if (!(amount > 0)) return;
    patch[key] += amount;
    this.ledger.input += amount;
  }
  _remove(patch, key, amount, kind = 'exported') {
    const taken = Math.min(patch[key], Math.max(0, amount));
    patch[key] -= taken;
    this.ledger[kind] += taken;
    return taken;
  }
  _transfer(from, fromKey, to, toKey, amount) {
    if (this.options.transferOverride?.(this, { from, fromKey, to, toKey, amount })) return;
    const moved = Math.min(from[fromKey], Math.max(0, amount));
    from[fromKey] -= moved;
    to[toKey] += moved;
  }
  _preyPosition(patch) {
    const position = kelpStipePosition(this.getKelpAnchor(patch.hostId), patch.fraction, this.timeSec, this.environment);
    return { x: position.x + 0.28, y: position.y, z: position.z + 0.18 };
  }
  _leafPatch(agent) { return this.leafPatches.find((patch) => patch.hostId === agent.attachment.hostId && patch.leafIndex === agent.attachment.leafIndex); }
  _hostRockPatch(hostId) { return this.rockPatches[this.hostById.get(hostId).anchor.rockIndex * 3]; }

  _advance(dt) {
    const env = this.environment;
    let photoInput = 0;
    for (const patch of this.rockPatches) {
      const production = 0.20 / DAY * this.lightAtHeight(patch.position.y) * Math.max(0, 1 - patch.algae / 0.16) * dt;
      this._input(patch, 'algae', production);
      photoInput += production;
      this._transfer(patch, 'algae', patch, 'detritus', patch.algae * 0.015 / DAY * dt);
    }
    for (const patch of this.groundPatches) {
      this._input(patch, 'detritus', 0.000004 * env.foodSupply * dt);
      this._remove(patch, 'detritus', patch.detritus * 0.02 / DAY * dt);
    }
    for (const patch of this.leafPatches) {
      const position = leafAttachmentPosition(this.getKelpAnchor(patch.hostId), { leafIndex: patch.leafIndex, along: 0.55, clearanceM: 0 }, this.timeSec, env);
      const production = 0.08 / DAY * this.lightAtHeight(position.y) * Math.max(0, 1 - patch.biofilm / 0.07) * dt;
      this._input(patch, 'biofilm', production);
      photoInput += production;
      this._transfer(patch, 'biofilm', this._hostRockPatch(patch.hostId), 'detritus', patch.biofilm * 0.03 / DAY * dt);
    }
    for (const patch of this.kelpPatches) {
      const production = 0.24 / DAY * this.lightLevel * Math.max(0, 1 - patch.kelpTissue / 0.8) * dt;
      this._input(patch, 'kelpTissue', production);
      photoInput += production;
      this._transfer(patch, 'kelpTissue', this._hostRockPatch(patch.hostId), 'detritus', patch.kelpTissue * 0.01 / DAY * dt);
    }
    for (const patch of this.preyPatches) {
      this._input(patch, 'smallPrey', 0.00005 * env.foodSupply * dt);
      this._remove(patch, 'smallPrey', patch.smallPrey * (0.0001 + env.currentMps * 0.0005) * dt);
    }
    this.primaryProduction = photoInput / dt;
    this.totalPrimaryProduction += photoInput;

    for (const agent of this.agents) {
      if (!agent.alive) continue;
      if (agent.speciesId === 'giant-kelp') this._updateKelp(agent, dt);
      else if (agent.speciesId === 'brown-turban-snail') this._updateSnail(agent, dt);
      else if (agent.speciesId === 'giant-kelpfish') this._updateFish(agent, dt);
      else this._updateGround(agent, dt);
      // Energy is a relative condition proxy. No uncalibrated rapid starvation death.
      agent.energy = clamp(agent.energy, 0.02, 1);
      agent.hunger = 1 - agent.energy;
      agent.stress = agent.speciesId === 'giant-kelpfish' ? clamp(env.currentMps ** 2 * (1 - agent.energy), 0, 1) : 0;
    }
    if (this.timeSec >= this._nextSummary) {
      this._nextSummary += 30;
      this._emit('resources', '局部摄食与物质交换', '附岩藻、叶面食物、小型动物食物与有机材料分别记账；环境输入、摄食移出和输出都有账目。');
    }
  }

  _updateKelp(agent, dt) {
    agent.position = { x: agent.anchor.x, y: agent.anchor.y, z: agent.anchor.z };
    agent.velocity = { x: 0, y: 0, z: 0 };
    this._setState(agent, 'fixed');
    // A deliberately modest display extension, stated in m/day, not m/frame.
    const cap = Math.max(agent.initialSizeM, Math.min(agent.initialSizeM + 0.8, this.surfaceY - agent.anchor.y - 0.05));
    agent.sizeM = Math.min(cap, agent.sizeM + KELP_MODEL_PARAMETERS.kelpExtensionMPerDay / DAY * this.lightLevel * agent.energy * dt);
    agent.energy += dt / DAY * (0.18 * this.lightLevel - 0.05);
  }

  _nearestPatch(agent, patches, pool, position = (patch) => patch.position, maxDistance = Infinity) {
    let nearest = null;
    let nearestDistance = maxDistance;
    for (const patch of patches) {
      if (patch[pool] <= 1e-7) continue;
      const d = distance(agent.position, position(patch));
      if (d < nearestDistance) { nearest = patch; nearestDistance = d; }
    }
    return { patch: nearest, distance: nearestDistance };
  }
  _setState(agent, state) {
    if (agent.state === state) return;
    agent.state = state;
    agent.stateSince = this.timeSec;
    if (state === 'grazing') this.counters.grazingCount += 1;
    if (state === 'approaching-prey') this.counters.approachCount += 1;
    if (state === 'sheltering') this.counters.shelterCount += 1;
  }
  _feed(agent, patch, pool, amount, intervalSec, gain) {
    if (this.timeSec < agent.nextBite || agent.energy > 0.94) return 0;
    agent.nextBite = this.timeSec + intervalSec;
    const taken = this._remove(patch, pool, amount, 'ingested');
    if (taken > 0) {
      agent.energy += taken * gain;
      agent.lastFeedAt = this.timeSec;
      this.counters.feedingCount += 1;
      if (!agent.hasExplainedFeeding) {
        agent.hasExplainedFeeding = true;
        this._emit('feeding', `${kelpSpeciesById[agent.speciesId].commonName}实际摄食`, `接近局部 ${pool} 斑块后移出 ${taken.toFixed(4)} 相对资源，进入个体体能代理；不是远距离免费供能。`);
      }
    }
    return taken;
  }
  _velocityFrom(agent, previous, dt) {
    agent.velocity = { x: (agent.position.x - previous.x) / dt, y: (agent.position.y - previous.y) / dt, z: (agent.position.z - previous.z) / dt };
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > 1e-8) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _updateGround(agent, dt) {
    if (this.options.groundUpdater?.(this, agent, dt)) return;
    if (agent.speciesId === 'gumboot-chiton') {
      agent.activityLevel = this.chitonActivityLevel;
      const phase = ((this.timeSec + agent.activityPhaseSec) % KELP_MODEL_PARAMETERS.chitonActivityPeriodSec) / KELP_MODEL_PARAMETERS.chitonActivityPeriodSec;
      if (phase >= agent.activityLevel) {
        this._setState(agent, 'daytime-resting');
        agent.position.y = this.supportHeight(agent.position.x, agent.position.z) + GROUND_CLEARANCE;
        agent.supportNormal = this.supportNormal(agent.position.x, agent.position.z);
        agent.velocity = { x: 0, y: 0, z: 0 };
        agent.energy -= dt * (0.00003 + this.environment.currentMps ** 2 * 0.000008);
        return;
      }
    }
    const scavenger = agent.speciesId === 'bat-star';
    const patches = agent.rockIndex === null ? this.floorPatches : this.rockPatches.filter((patch) => patch.rockIndex === agent.rockIndex);
    const pool = scavenger ? 'detritus' : 'algae';
    const nearest = this._nearestPatch(agent, patches, pool);
    if (nearest.patch && nearest.distance < 0.24) {
      this._setState(agent, scavenger ? 'scavenging' : 'grazing');
      this._feed(agent, nearest.patch, pool, scavenger ? 0.0012 : 0.0009, scavenger ? 12 : 8, 1.8);
    } else {
      this._setState(agent, 'surface-searching');
      if (nearest.patch) agent.target = copy(nearest.patch.position);
      else if (this.timeSec >= agent.nextDecision) {
        agent.target = { x: agent.home.x + this._range(-0.22, 0.22), y: 0, z: agent.home.z + this._range(-0.22, 0.22) };
        agent.nextDecision = this.timeSec + this._range(20, 45);
      }
    }
    const previous = copy(agent.position);
    const dx = agent.target.x - previous.x;
    const dz = agent.target.z - previous.z;
    const d = Math.hypot(dx, dz);
    const speed = KELP_MODEL_PARAMETERS.crawlSpeedMps[agent.speciesId] * (agent.state === 'surface-searching' ? 1 : 0.10);
    const travel = Math.min(d, speed * dt);
    if (d > 1e-10) {
      const x = clamp(previous.x + dx / d * travel, this.bounds.x[0] + .3, this.bounds.x[1] - .3);
      const z = clamp(previous.z + dz / d * travel, this.bounds.z[0] + .3, this.bounds.z[1] - .3);
      const height = this.supportHeight(x, z);
      const connected = Math.abs(height - this.supportHeight(previous.x, previous.z)) < 0.008;
      const sameRock = agent.rockIndex === null || this.rockHeight(agent.rockIndex, x, z) >= height - 1e-8;
      if (connected && sameRock) agent.position = supportedMotion(previous, { x, y: height + GROUND_CLEARANCE, z }, {
        maxDistance: speed * dt, minimumY: (px, pz) => this.supportHeight(px, pz) + GROUND_CLEARANCE, attached: true,
      });
      else agent.nextDecision = this.timeSec;
    }
    agent.position.y = this.supportHeight(agent.position.x, agent.position.z) + GROUND_CLEARANCE;
    agent.supportNormal = this.supportNormal(agent.position.x, agent.position.z);
    this._velocityFrom(agent, previous, dt);
    agent.energy -= dt * (0.000045 + this.environment.currentMps ** 2 * 0.000008);
  }

  _updateSnail(agent, dt) {
    const previous = copy(agent.position);
    const patch = this._leafPatch(agent);
    const direction = Math.sign(0.55 - agent.attachment.along);
    const increment = KELP_MODEL_PARAMETERS.crawlSpeedMps['brown-turban-snail'] / kelpLeafLength(agent.attachment.leafIndex) * dt;
    agent.attachment.along += direction * Math.min(Math.abs(0.55 - agent.attachment.along), increment);
    agent.position = leafAttachmentPosition(this.getKelpAnchor(agent.attachment.hostId), agent.attachment, this.timeSec, this.environment);
    this._velocityFrom(agent, previous, dt);
    if (patch.biofilm > 1e-7 && Math.abs(agent.attachment.along - 0.55) < 0.13) {
      this._setState(agent, 'leaf-grazing');
      this._feed(agent, patch, 'biofilm', 0.00018, 10, 6);
    } else this._setState(agent, 'leaf-searching');
    agent.energy -= dt * 0.000035;
  }

  _fishFloor(agent, x = agent.position.x, z = agent.position.z) {
    const half = agent.sizeM * 0.5;
    const dx = Math.cos(agent.heading) * half;
    const dz = Math.sin(agent.heading) * half;
    return Math.max(this.supportHeight(x, z), this.supportHeight(x + dx, z + dz), this.supportHeight(x - dx, z - dz)) + 0.08 + agent.sizeM * 0.18;
  }
  _updateFish(agent, dt) {
    const shelter = this.environment.currentMps > 0.65 && agent.energy < 0.45;
    const sight = this.visibilityM * (0.25 + this.lightLevel * 0.75);
    const nearest = this._nearestPatch(agent, this.preyPatches, 'smallPrey', (patch) => this._preyPosition(patch), sight);
    let target;
    let speed;
    if (shelter) {
      const anchor = this.getKelpAnchor(agent.hostId);
      target = { x: anchor.x + 0.22, y: anchor.y + 0.75, z: anchor.z - 0.10 };
      this._setState(agent, 'sheltering');
      speed = KELP_MODEL_PARAMETERS.fishHoverMps;
    } else if (nearest.patch) {
      target = this._preyPosition(nearest.patch);
      agent.hostId = nearest.patch.hostId;
      this._setState(agent, nearest.distance < 0.20 ? 'prey-feeding' : 'approaching-prey');
      speed = nearest.distance < 0.20 ? KELP_MODEL_PARAMETERS.fishHoverMps : KELP_MODEL_PARAMETERS.fishApproachMps;
      if (nearest.distance < 0.20) this._feed(agent, nearest.patch, 'smallPrey', 0.003, 15, 2);
    } else {
      const anchor = this.getKelpAnchor(agent.hostId);
      target = kelpStipePosition(anchor, 0.40, this.timeSec, this.environment);
      target.x += 0.18 * Math.cos(agent.heading);
      target.z += 0.18 * Math.sin(agent.heading);
      this._setState(agent, 'kelp-hovering');
      speed = KELP_MODEL_PARAMETERS.fishHoverMps;
    }
    agent.target = copy(target);
    const previous = copy(agent.position);
    const d = distance(previous, target);
    const travel = Math.min(d, speed * dt);
    const flow = this.environment.currentMps * (shelter ? 0.006 : 0.018);
    // Residual advection after active station keeping; not the full water speed.
    const desired = {
      x: (d > 1e-10 ? (target.x - previous.x) / d * travel / dt : 0) + flow,
      y: d > 1e-10 ? (target.y - previous.y) / d * travel / dt : 0,
      z: d > 1e-10 ? (target.z - previous.z) / d * travel / dt : 0,
    };
    const blend = 1 - Math.exp(-2 * dt);
    const previousSpeed = Math.hypot(agent.velocity.x, agent.velocity.y, agent.velocity.z);
    for (const axis of ['x', 'y', 'z']) {
      agent.velocity[axis] += (desired[axis] - agent.velocity[axis]) * blend;
      agent.position[axis] = clamp(previous[axis] + agent.velocity[axis] * dt, this.bounds[axis][0] + 0.02, this.bounds[axis][1] - 0.02);
    }
    const heading = Math.hypot(agent.position.x - previous.x, agent.position.z - previous.z) > 1e-8
      ? Math.atan2(agent.position.z - previous.z, agent.position.x - previous.x) : agent.heading;
    agent.position = supportedMotion(previous, agent.position, {
      maxDistance: Math.max(previousSpeed, speed + flow) * dt,
      minimumY: (x, z) => this._fishFloor({ ...agent, heading }, x, z),
      maximumY: Math.min(this.bounds.y[1] - .02, this.surfaceY - .08),
    });
    this._velocityFrom(agent, previous, dt);
    agent.energy -= dt * (0.00018 + this.environment.currentMps ** 2 * (shelter ? 0.00055 : 0.0012));
  }

  _emit(type, label, cause) {
    this.events.push({ timeSec: this.timeSec, type, label, cause });
    if (this.events.length > 60) this.events.shift();
  }
  get metrics() {
    const alive = this.agents.filter((agent) => agent.alive);
    const animals = alive.filter((agent) => agent.speciesId !== 'giant-kelp');
    const plants = alive.filter((agent) => agent.speciesId === 'giant-kelp');
    const behaviorCounts = {};
    const speciesCounts = {};
    for (const agent of alive) {
      behaviorCounts[agent.state] = (behaviorCounts[agent.state] || 0) + 1;
      speciesCounts[agent.speciesId] = (speciesCounts[agent.speciesId] || 0) + 1;
    }
    const resources = this.resources;
    const total = Object.values(resources).reduce((amount, value) => amount + value, 0);
    return {
      timeSec: this.timeSec, simulatedGrowthDays: this.timeSec / DAY, ...resources,
      population: alive.length, animalPopulation: animals.length, speciesCount: Object.keys(speciesCounts).length,
      averageEnergy: animals.length ? sum(animals, 'energy') / animals.length : 0,
      kelpHealth: plants.length ? sum(plants, 'energy') / plants.length : 0,
      totalKelpExtensionM: plants.reduce((value, plant) => value + plant.sizeM - plant.initialSizeM, 0),
      lightLevel: this.lightLevel, understoryLightLevel: this.lightAtHeight(1), visibilityM: this.visibilityM,
      deformationCurrentMps: this.environment.deformationCurrentMps, chitonActivityLevel: this.chitonActivityLevel,
      primaryProduction: this.primaryProduction, totalPrimaryProduction: this.totalPrimaryProduction,
      currentEnergyCost: this.environment.currentMps ** 2 * 0.0012,
      resourceBudgetError: total - (this.ledger.initial + this.ledger.input - this.ledger.ingested - this.ledger.exported),
      ...this.counters, behaviorCounts, speciesCounts,
    };
  }
}
