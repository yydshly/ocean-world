import { speciesCatalog, speciesById } from './species.js';
import { supportedMotion } from './supportedMotion.js';
import { floorHeight, habitatHeight, coralAttachmentPosition } from './habitat.js';
import { REEF_ACTIVITY_ZONES, REEF_GRAZING_ZONE_IDS, REEF_GROUPER_ZONE_IDS, REEF_CLEANING_CLIENT_REACH_M } from './reefActivityZones.js';

export const DEFAULT_ENVIRONMENT = Object.freeze({ currentMps: 0.15, turbidity: 0.25, foodSupply: 1, hour: 10 });
export const WORLD_BOUNDS = Object.freeze({ x: [-9, 9], y: [-0.35, 4.5], z: [-9, 9] });
const FIXED_STEP = 0.1;
const COUNTS = [7, 5, 18, 7, 4, 2, 4, 4, 4, 3, 4, 8, 3, 5];
const STATIC_KINDS = new Set(['coral', 'clam', 'algae']);
export const DEFAULT_MOBILE_INDIVIDUALS = COUNTS.reduce((sum, count, i) => sum + (STATIC_KINDS.has(speciesCatalog[i].kind) ? 0 : count), 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const magnitude = (v) => Math.hypot(v.x, v.y, v.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const direction = (from, to) => {
  const v = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = magnitude(v) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
const copy = (v) => ({ x: v.x, y: v.y, z: v.z });

function activityZoneId(species, index) {
  if (species.id === 'green-chromis') return 'mainReef';
  if (species.id === 'blue-tang') return 'reefEdge';
  if (species.id === 'butterflyfish') return 'reefForaging';
  if (['lined-tang', 'top-shell', 'turf-algae', 'blue-starfish'].includes(species.id)) return REEF_GRAZING_ZONE_IDS[index % REEF_GRAZING_ZONE_IDS.length];
  if (species.id === 'cleaner-wrasse') return 'openCleaning';
  if (species.id === 'cleaner-shrimp') return 'shrimpMouth';
  if (species.id === 'honeycomb-grouper') return REEF_GROUPER_ZONE_IDS[index % REEF_GROUPER_ZONE_IDS.length];
  if (species.id === 'black-cucumber') return 'sandCorridor';
  if (species.id === 'giant-clam') return 'reefClams';
  return null;
}

function supportedZoneXZ(position, zone, extent = zone.wanderHalfExtentM) {
  const next = { ...position,
    x: clamp(position.x, zone.center.x - extent.x, zone.center.x + extent.x),
    z: clamp(position.z, zone.center.z - extent.z, zone.center.z + extent.z),
  };
  const supported = () => {
    const relief = habitatHeight(next.x, next.z) - floorHeight(next.x, next.z);
    return zone.substrate === 'reef' ? relief > .08 : zone.substrate === 'sand' ? relief < .025 : true;
  };
  // Deterministic contraction uses the same seeded samples, with no extra RNG
  // draws. Do not put a rock-associated animal on intervening sediment.
  for (let attempt = 0; attempt < 8 && !supported(); attempt += 1) {
    next.x = zone.center.x + (next.x - zone.center.x) * .6;
    next.z = zone.center.z + (next.z - zone.center.z) * .6;
  }
  return next;
}

function hashSeed(seed) {
  const text = String(seed);
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** A qualitative reef patch model. Position: m; velocity/current: m/s;
 * step(): simulation seconds. Resource/condition values are relative indices,
 * not measurements or calibrated population forecasts. See docs/SCIENCE.md. */
export class ReefSimulation {
  constructor(seed = 42, { mobileIndividuals = null, supportHeight = habitatHeight, floorHeight: floorSupport = floorHeight } = {}) {
    if (mobileIndividuals !== null && (!Number.isInteger(mobileIndividuals) || mobileIndividuals < DEFAULT_MOBILE_INDIVIDUALS || mobileIndividuals > 250)) {
      throw new RangeError(`Mobile workload must be an integer from ${DEFAULT_MOBILE_INDIVIDUALS} to 250, or null for the authored scene.`);
    }
    this.mobileIndividuals = mobileIndividuals;
    this.supportHeight = supportHeight; this.floorHeight = floorSupport;
    this.reset(seed);
  }

  reset(seed = this.seed ?? 42) {
    this.seed = seed;
    this._rngState = hashSeed(seed);
    this._accumulator = 0;
    this._ticks = 0;
    this.environment = { ...DEFAULT_ENVIRONMENT };
    this.timeSec = 0;
    this.events = [];
    this.resources = { algae: 0.7, plankton: 0.75, detritus: 0.35, microfauna: 0.45 };
    this.ledger = { initial: 2.25, input: 0, ingested: 0, exported: 0 };
    this.counters = { grazingCount: 0, escapeCount: 0, feedingCount: 0, cleaningCount: 0, predationCount: 0, deathCount: 0 };
    this.primaryProduction = 0;
    this.totalPrimaryProduction = 0;
    this._nextSummary = 25;
    this.agents = [];
    speciesCatalog.forEach((species, speciesIndex) => {
      const extra = species.id === 'green-chromis' && this.mobileIndividuals !== null ? this.mobileIndividuals - DEFAULT_MOBILE_INDIVIDUALS : 0;
      for (let index = 0; index < COUNTS[speciesIndex] + extra; index += 1) this.agents.push(this._createAgent(species, index));
    });
    const corals = this.agents.filter((agent) => agent.speciesId === 'staghorn-coral');
    for (const fish of this.agents.filter((agent) => speciesById[agent.speciesId].kind === 'fish')) {
      const host = corals.reduce((nearest, colony) => distance(fish.home, colony.position) < distance(fish.home, nearest.position) ? colony : nearest, corals[0]);
      // Reuse the original two refuge draws as small offsets at an actual
      // colony, rather than treating a random nearby sand point as shelter.
      fish.refuge.x = host.position.x + (fish.refuge.x + 3.1) / 1.3 * .06;
      fish.refuge.z = host.position.z + (fish.refuge.z + 1) / .8 * .05;
      fish.refuge.y = this._fishFloor(fish, fish.refuge.x, fish.refuge.z) + .12;
      fish.refugeHostId = host.id;
    }
    for (const crab of this.agents.filter((agent) => agent.speciesId === 'reef-crab')) {
      const host = corals[(Number(crab.id.split('-').at(-1)) - 1) % corals.length];
      crab.position.x = host.position.x + this._range(-0.08, 0.08);
      crab.position.z = host.position.z + this._range(-0.08, 0.08);
      crab.branchOffset = host.sizeM * 0.11;
      crab.position.y = this.supportHeight(crab.position.x, crab.position.z) + crab.branchOffset;
      crab.home = copy(crab.position);
      crab.target = copy(crab.position);
    }
    this._emit('initial', '浅海礁区已建立：13 种生物与 1 个藻膜功能群', '随机种子决定个体初始位置和行为差异；群落数量用于演示，未按野外样方校准。');
    if (this.mobileIndividuals !== null) this._emit('performance', '性能工作负载', `初始 ${this.mobileIndividuals} 个可移动个体；额外雀鲷用于测试渲染与行为更新，数量不是野外群落密度。死亡个体不会自动补回。`);
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

  _createAgent(species, index) {
    const homes = {
      'blue-tang': [-1.7, 2.7, 1.4], butterflyfish: [-2.7, 1.6, -0.2],
      'green-chromis': [-3.5, 2.35, -1.6], 'lined-tang': [-3.3, 1.4, 0.5],
      'cleaner-wrasse': [0.3, 1.0, -1.5], 'honeycomb-grouper': [-1.0 + index * 2.2, 0.7, -2.6],
      'cleaner-shrimp': [1, 0, -1.5], 'reef-crab': [-3.0, 0.7, -1],
      'black-cucumber': [2.3, 0.18, 1.5], 'blue-starfish': [-1.8, 0.2, 2.0],
      'top-shell': [-3.0, 0.24, 0.4], 'staghorn-coral': [-3.0, 0.18, -1],
      'giant-clam': [-1.3, 0.2, -0.5], 'turf-algae': [-3.5, 0.17, 1.0],
    };
    const [x, y, z] = homes[species.id];
    const spread = species.kind === 'coral' ? 2.3 : species.kind === 'fish' ? 1.4 : species.kind === 'cucumber' ? 1.4 : species.kind === 'shrimp' ? 0.15 : 0.65;
    const position = { x: x + this._range(-spread, spread), y: y + (species.kind === 'fish' ? this._range(-0.25, 0.25) : 0), z: z + this._range(-spread, spread) };
    const zoneId = activityZoneId(species, index), zone = REEF_ACTIVITY_ZONES[zoneId];
    if (zone) {
      const jitterX = (position.x - x) / spread, jitterZ = (position.z - z) / spread;
      const jitterY = species.kind === 'fish' ? (position.y - y) / .25 : 0;
      Object.assign(position, supportedZoneXZ({ x: zone.center.x + jitterX * zone.spawnHalfExtentM.x,
        y: zone.center.y + jitterY * zone.spawnHalfExtentM.y,
        z: zone.center.z + jitterZ * zone.spawnHalfExtentM.z }, zone, zone.spawnHalfExtentM));
    }
    // Reuse the two seeded position draws: a colony attaches to a solid reef
    // shoulder instead of sampling the surrounding sand corridor. Random draw
    // order, colony size and the remaining agents' random traits are unchanged.
    if(species.kind==='coral')Object.assign(position,coralAttachmentPosition(index,(position.x-x)/spread,(position.z-z)/spread));
    if (species.kind === 'crab') position.y = this._range(0.38, 0.7);
    const staticAgent = STATIC_KINDS.has(species.kind);
    const heading = this._range(-Math.PI, Math.PI);
    const agent = {
      id: `${species.id}-${index + 1}`, speciesId: species.id, activityZoneId: zoneId, position, velocity: { x: 0, y: 0, z: 0 }, heading,
      energy: species.guild === 'predator' ? 0.63 : this._range(0.6, 0.88),
      state: staticAgent ? (species.kind === 'clam' ? 'filtering' : 'fixed') : species.kind === 'fish' ? (species.id === 'green-chromis' ? 'schooling' : 'foraging') : 'resting',
      alive: true, sizeM: species.lengthM * this._range(0.85, 1.07),
      home: copy(position), target: copy(position), nextDecision: this._range(0, 2.5),
      stateSince: 0, fleeUntil: 0, nextBite: this._range(0, 3), lastFeedAt: null, parasites: staticAgent ? 0 : this._range(0.15, 0.55),
      stress: 0, hunger: 0, refuge: { x: -3.1 + this._range(-1.3, 1.3), y: 0.95, z: -1 + this._range(-0.8, 0.8) },
    };
    if (species.kind === 'fish') {
      agent.position.y = Math.max(agent.position.y, this._fishFloor(agent));
      // Benthic grazers / ambush fish remain just above local reef surfaces.
      if (species.guild === 'grazer' || species.guild === 'predator' || species.guild === 'benthic-feeder') agent.position.y = this._fishFloor(agent) + this._range(0.2, 0.5);
      agent.refuge.y = this.supportHeight(agent.refuge.x, agent.refuge.z) + 0.20 + agent.sizeM * 0.3;
    } else {
      agent.position.y = (species.kind === 'shrimp' ? this.floorHeight(agent.position.x, agent.position.z) : this.supportHeight(agent.position.x, agent.position.z)) + 0.004;
    }
    agent.home = copy(agent.position);
    agent.target = copy(agent.position);
    return agent;
  }

  setEnvironment(patch = {}) {
    if (!patch || typeof patch !== 'object') throw new TypeError('Environment patch must be an object.');
    const ranges = { currentMps: [0, 1.2], turbidity: [0, 1], foodSupply: [0, 3], hour: [0, 24] };
    // Validate the full patch first: a rejected input cannot partially mutate the environment.
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in ranges)) throw new TypeError(`Unknown environment parameter: ${key}`);
      if (!Number.isFinite(value)) throw new TypeError(`${key} must be finite.`);
    }
    for (const [key, value] of Object.entries(patch)) {
      const nextValue = key === 'hour' ? ((value % 24) + 24) % 24 : clamp(value, ...ranges[key]);
      const previous = this.environment[key];
      if (previous === nextValue) continue;
      this.environment[key] = nextValue;
      const explanations = {
        currentMps: ['水流改变', '流速以米/秒计。水体输送与游泳维持位置的能量成本随流速改变。'],
        turbidity: ['浑浊度改变', '相对浑浊指数改变光照与视觉发现距离；浑浊本身没有被假设为毒性。'],
        foodSupply: ['浮游食物输入改变', '外部浮游食物输入改变，资源先响应，再影响摄食与体能。'],
        hour: ['时刻改变', '白天光合作用、夜间休息和庇护行为使用模拟时刻。'],
      };
      this._emit('environment', explanations[key][0], `${explanations[key][1]} ${previous.toFixed(2)} → ${nextValue.toFixed(2)}`);
    }
    return this.environment;
  }

  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('step() requires a finite, nonnegative number of simulation seconds.');
    if (seconds > 86400) throw new RangeError('Advance at most one simulated day per call.');
    this._accumulator += seconds;
    // A shared fixed clock makes rendering frame rate irrelevant to the ecology.
    while (this._accumulator + 1e-9 >= FIXED_STEP) {
      this._accumulator -= FIXED_STEP;
      if (this._accumulator < 0 && this._accumulator > -1e-8) this._accumulator = 0;
      this._ticks += 1;
      this.timeSec = this._ticks * FIXED_STEP;
      this.environment.hour = (this.environment.hour + FIXED_STEP / 3600) % 24;
      this._advance(FIXED_STEP);
    }
    return this.metrics;
  }

  get lightLevel() {
    // Photoperiod proxy: no solar irradiance at night, maximum around local noon.
    return Math.max(0, Math.sin((this.environment.hour - 6) * Math.PI / 12)) * Math.exp(-1.7 * this.environment.turbidity);
  }

  get visibilityM() { return 9 * Math.exp(-2 * this.environment.turbidity) + 0.7; }

  _input(pool, amount) {
    if (amount <= 0) return;
    this.resources[pool] += amount;
    this.ledger.input += amount;
  }

  _remove(pool, amount, kind = 'exported') {
    const taken = Math.min(this.resources[pool], Math.max(0, amount));
    this.resources[pool] -= taken;
    this.ledger[kind] += taken;
    return taken;
  }

  _transfer(from, to, amount) {
    const moved = Math.min(this.resources[from], Math.max(0, amount));
    this.resources[from] -= moved;
    this.resources[to] += moved;
  }

  _advance(dt) {
    const env = this.environment;
    const light = this.lightLevel;
    this.primaryProduction = 0.0009 * light * Math.max(0, 1 - this.resources.algae / 1.6);
    this.totalPrimaryProduction += this.primaryProduction * dt;
    this._input('algae', this.primaryProduction * dt);
    this._input('plankton', 0.0018 * env.foodSupply * dt);
    // Current exchanges this local patch with surrounding water, rather than creating food.
    this._remove('plankton', this.resources.plankton * (0.0007 + env.currentMps * 0.0013) * dt);
    this._transfer('plankton', 'detritus', this.resources.plankton * 0.00015 * dt);
    this._transfer('algae', 'detritus', this.resources.algae * 0.000035 * dt);
    this._transfer('detritus', 'microfauna', this.resources.detritus * 0.00014 * dt);
    this._remove('detritus', this.resources.detritus * 0.00008 * dt);
    const fish = this.agents.filter((agent) => agent.alive && speciesById[agent.speciesId].kind === 'fish');
    const predators = fish.filter((agent) => agent.speciesId === 'honeycomb-grouper');
    const school = fish.filter((agent) => agent.speciesId === 'green-chromis');
    const center = school.length ? school.reduce((v, agent) => ({ x: v.x + agent.position.x / school.length, y: v.y + agent.position.y / school.length, z: v.z + agent.position.z / school.length }), { x: 0, y: 0, z: 0 }) : { x: -3, y: 2.2, z: -1 };
    for (const agent of this.agents) {
      if (!agent.alive) continue;
      const species = speciesById[agent.speciesId];
      if (STATIC_KINDS.has(species.kind)) { this._updateStatic(agent, species, dt, light); continue; }
      if (species.kind === 'fish') this._updateFish(agent, species, fish, predators, school, center, dt, light);
      else this._updateBottom(agent, species, fish, predators, dt, light);
      agent.hunger = 1 - agent.energy;
      agent.parasites = Math.min(1, agent.parasites + dt * 0.000025);
      agent.energy = clamp(agent.energy, 0, 1);
      if (agent.energy <= 0) this._die(agent, 'starvation', '长期供能不足耗尽相对体能；死亡时间是演示模型参数，不是真实耐饥时间。');
    }
    if (this.timeSec >= this._nextSummary) {
      this._nextSummary += 25;
      const counts = this.metrics.behaviorCounts;
      if (counts.fleeing) this._emit('escape', `${counts.fleeing} 尾鱼正在避敌`, '捕食者接近可见范围，鱼转向珊瑚庇护区；逃逸耗费更多体能。');
      else if (counts.grazing) this._emit('grazing', '礁面发生刮食', '藻食倒吊与马蹄螺从藻膜资源摄食；摄食有资源去向和体能收益。');
      else this._emit('resources', '浮游食物—摄食—碎屑继续交换', '本礁区是与外海交换物质的开放区域，不是密封水族箱。');
    }
  }

  _setState(agent, state) {
    if (agent.state === state) return;
    agent.state = state;
    agent.stateSince = this.timeSec;
    if (state === 'fleeing') this.counters.escapeCount += 1;
    if (state === 'grazing') this.counters.grazingCount += 1;
    if (state === 'cleaning') this.counters.cleaningCount += 1;
  }

  _wander(agent, radius = 2.4, yRange = 0.55) {
    const zone = REEF_ACTIVITY_ZONES[agent.activityZoneId];
    const extent = zone?.wanderHalfExtentM;
    agent.target = {
      x: clamp((zone?.center.x ?? agent.home.x) + this._range(-(extent?.x ?? radius), extent?.x ?? radius), -8.4, 8.4),
      y: clamp(agent.home.y + this._range(-(extent?.y ?? yRange), extent?.y ?? yRange), -0.25, 4.2),
      z: clamp((zone?.center.z ?? agent.home.z) + this._range(-(extent?.z ?? radius), extent?.z ?? radius), -8.4, 8.4),
    };
    if (zone) agent.target = supportedZoneXZ(agent.target, zone);
    if (speciesById[agent.speciesId].kind === 'fish') agent.target.y = Math.max(agent.target.y, this._fishFloor(agent, agent.target.x, agent.target.z) + 0.12);
    if (speciesById[agent.speciesId].kind === 'shrimp') {
      // This station is at the open mouth of the authored crevice, not inside
      // the solid side pillars or on the roof returned by the height field.
      agent.target.x = clamp(agent.target.x, 0.85, 1.15);
      agent.target.z = clamp(agent.target.z, -1.65, -1.35);
    }
    agent.nextDecision = this.timeSec + this._range(3, 8);
  }

  _nearest(agent, candidates, predicate = () => true) {
    let result = null;
    let nearest = Infinity;
    for (const other of candidates) {
      if (other === agent || !other.alive || !predicate(other)) continue;
      const d = distance(agent.position, other.position);
      if (d < nearest) { nearest = d; result = other; }
    }
    return { agent: result, distance: nearest };
  }

  _feed(agent, pool, rate, dt, efficiency = 1) {
    const abundance = this.resources[pool];
    const taken = this._remove(pool, rate * abundance / (abundance + 0.12) * dt, 'ingested');
    agent.energy += taken * 18 * efficiency;
    if (taken > 1e-8 && this.timeSec >= agent.nextBite) {
      this.counters.feedingCount += 1;
      agent.lastFeedAt = this.timeSec;
      agent.nextBite = this.timeSec + this._range(2, 6);
    }
    // A small portion is egested. This is an explicit return to the resource ledger.
    this._input('detritus', taken * 0.16);
    return taken;
  }

  _updateFish(agent, species, fish, predators, school, center, dt, light) {
    const isPredator = species.guild === 'predator';
    const cleaner = species.guild === 'cleaner';
    let desired;
    let speed = species.id === 'green-chromis' ? 0.18 : isPredator ? 0.13 : 0.21;
    const threat = this._nearest(agent, predators);
    // Smaller visual ranges in turbid water affect prey and predator alike.
    const visualLightFactor = 0.25 + 0.75 * Math.sqrt(light);
    const detectionRange = Math.min(this.visibilityM, 2.4) * (1 - this.environment.turbidity * 0.32) * visualLightFactor;
    if (!isPredator && !cleaner && threat.agent && threat.distance < detectionRange && agent.sizeM < threat.agent.sizeM * 0.92) agent.fleeUntil = this.timeSec + 2.4;
    if (!isPredator && !cleaner && agent.fleeUntil > this.timeSec) {
      this._setState(agent, 'fleeing');
      const escape = threat.agent ? direction(threat.agent.position, agent.position) : { x: 0, y: 1, z: 0 };
      const refuge = direction(agent.position, agent.refuge);
      desired = { x: escape.x * 0.7 + refuge.x * 0.6, y: escape.y * 0.3 + refuge.y * 0.6, z: escape.z * 0.7 + refuge.z * 0.6 };
      speed = 0.46;
      agent.stress = Math.min(1, agent.stress + dt * 0.04);
    } else if (light < 0.05 && !isPredator) {
      this._setState(agent, distance(agent.position, agent.refuge) < 0.5 ? 'hiding' : 'resting');
      desired = direction(agent.position, agent.refuge);
      speed = distance(agent.position, agent.refuge) < 0.5 ? 0.012 : 0.14;
    } else if (cleaner) {
      const station = REEF_ACTIVITY_ZONES.openCleaning.center;
      const client = this._nearest(agent, fish, (other) => other.sizeM > 0.17 && other.parasites > 0.06
        && distance(other.position, station) < REEF_CLEANING_CLIENT_REACH_M);
      if (client.agent && client.distance < 4.2) {
        agent.target = copy(client.agent.position);
        desired = direction(agent.position, agent.target);
        speed = client.distance < 0.38 ? 0.05 : 0.26;
        this._setState(agent, client.distance < 0.55 ? 'cleaning' : 'foraging');
        if (client.distance < 0.55) {
          const removed = Math.min(client.agent.parasites, dt * 0.007);
          client.agent.parasites -= removed;
          agent.energy += removed * 0.12;
          client.agent.stress = Math.max(0, client.agent.stress - dt * 0.012);
        }
      } else {
        this._setState(agent, 'foraging');
        if (this.timeSec >= agent.nextDecision || distance(agent.target, station) > REEF_CLEANING_CLIENT_REACH_M) this._wander(agent, 1.2, 0.35);
        desired = direction(agent.position, agent.target);
      }
    } else if (isPredator) {
      const prey = this._nearest(agent, fish, (other) => other.sizeM < agent.sizeM * 0.6 && other.speciesId !== 'cleaner-wrasse');
      if (agent.energy < 0.82 && prey.agent && prey.distance < Math.min(this.visibilityM, 3.4) * visualLightFactor && distance(prey.agent.position, agent.home) < 5) {
        this._setState(agent, 'hunting');
        desired = direction(agent.position, prey.agent.position);
        speed = 0.36;
        if (prey.distance < 0.15 && prey.agent.position.y > this.supportHeight(prey.agent.position.x, prey.agent.position.z) + 0.35) {
          this._die(prey.agent, 'predation', '蜂巢石斑鱼接近暴露的小鱼；位于珊瑚庇护区的个体不执行本次捕获。');
          agent.energy += 0.26;
          this.counters.predationCount += 1;
          this._emit('predation', '蜂巢石斑鱼完成一次捕食', '捕食是小型礁鱼体能和数量变化的原因；捕获频率未按野外数据标定。');
        }
      } else {
        this._setState(agent, 'ambushing');
        if (this.timeSec >= agent.nextDecision || distance(agent.position, agent.home) > 2) this._wander(agent, 0.65, 0.15);
        desired = direction(agent.position, agent.target);
        speed = distance(agent.position, agent.target) < 0.22 ? 0.018 : 0.1;
      }
    } else {
      if (this.timeSec >= agent.nextDecision || distance(agent.position, agent.target) < 0.25) this._wander(agent);
      desired = direction(agent.position, agent.target);
      // Separate entry/exit energy thresholds keep a grazing bout readable
      // without a timer or forcing a behavior when food/support is absent.
      const hungry = species.guild === 'grazer'
        ? agent.energy < (agent.state === 'grazing' ? .85 : .80)
        : agent.energy < .83;
      if (species.guild === 'grazer') {
        agent.target.y = this._fishFloor(agent, agent.target.x, agent.target.z) + 0.12;
        desired = direction(agent.position, agent.target);
        const atReefSurface = this.supportHeight(agent.position.x, agent.position.z) - this.floorHeight(agent.position.x, agent.position.z) > .08
          && agent.position.y - this._fishFloor(agent) < .55;
        this._setState(agent, hungry && atReefSurface ? 'grazing' : 'foraging');
        if (hungry) speed = 0.13;
        if (hungry && atReefSurface) this._feed(agent, 'algae', 0.00007, dt);
      } else if (species.guild === 'benthic-feeder') {
        this._setState(agent, 'foraging');
        agent.target.y = this._fishFloor(agent, agent.target.x, agent.target.z) + 0.16;
        desired = direction(agent.position, agent.target);
        this._feed(agent, 'microfauna', 0.000063, dt);
      } else {
        this._setState(agent, species.id === 'green-chromis' ? 'schooling' : 'foraging');
        this._feed(agent, 'plankton', species.id === 'green-chromis' ? 0.000052 : 0.000072, dt);
      }
      if (species.id === 'green-chromis') {
        const cohesion = direction(agent.position, center);
        let separation = { x: 0, y: 0, z: 0 };
        let alignment = { x: 0, y: 0, z: 0 };
        let neighbors = 0;
        for (const other of school) {
          if (other === agent || !other.alive) continue;
          const d = distance(agent.position, other.position);
          if (d < 1.6) {
            alignment.x += other.velocity.x; alignment.y += other.velocity.y; alignment.z += other.velocity.z;
            neighbors += 1;
          }
          if (d < 0.3 && d > 0) {
            const away = direction(other.position, agent.position);
            separation.x += away.x * (1 - d / 0.3); separation.y += away.y * (1 - d / 0.3); separation.z += away.z * (1 - d / 0.3);
          }
        }
        desired = { x: desired.x * 0.35 + cohesion.x * 0.5 + separation.x * 1.2 + (neighbors ? alignment.x / neighbors : 0), y: desired.y * 0.3 + cohesion.y * 0.45 + separation.y, z: desired.z * 0.35 + cohesion.z * 0.5 + separation.z * 1.2 + (neighbors ? alignment.z / neighbors : 0) };
      }
    }
    this._move(agent, desired || { x: 0, y: 0, z: 0 }, speed, dt, true);
    const currentCost = this.environment.currentMps ** 2 * 0.00105;
    agent.energy -= dt * (0.00043 + currentCost + (agent.state === 'fleeing' ? 0.00075 : agent.state === 'hunting' ? 0.0004 : 0) + agent.parasites * 0.000025);
    agent.stress = Math.max(0, agent.stress - dt * 0.0025);
  }

  _updateBottom(agent, species, fish, predators, dt, light) {
    let speed = species.kind === 'shrimp' ? 0.024 : species.kind === 'crab' ? 0.012 : species.kind === 'cucumber' ? 0.0009 : species.kind === 'star' ? 0.00065 : 0.0008;
    if (this.timeSec >= agent.nextDecision || distance(agent.position, agent.target) < 0.02) this._wander(agent, species.kind === 'cucumber' ? 1.4 : species.kind === 'shrimp' ? 0.15 : species.kind === 'crab' ? 0.1 : 0.45, 0);
    if (species.kind === 'shrimp' || species.kind === 'crab') {
      const threat = this._nearest(agent, predators);
      if (threat.distance < 1.0) {
        this._setState(agent, 'hiding');
        agent.target = copy(agent.home);
        speed *= 1.8;
      } else if (species.kind === 'shrimp') {
        const client = this._nearest(agent, fish, (other) => other.sizeM > 0.17 && other.parasites > 0.08);
        if (client.agent && client.distance < 0.85) {
          this._setState(agent, 'cleaning');
          const removed = Math.min(client.agent.parasites, dt * 0.004);
          client.agent.parasites -= removed;
          agent.energy += removed * 0.1;
        } else { this._setState(agent, 'foraging'); this._feed(agent, 'detritus', 0.00003, dt); }
      } else { this._setState(agent, 'foraging'); this._feed(agent, 'detritus', 0.000025, dt); }
    } else if (species.kind === 'cucumber') {
      this._setState(agent, 'deposit-feeding');
      this._feed(agent, 'detritus', 0.00004, dt);
    } else if (species.kind === 'snail') {
      this._setState(agent, 'grazing');
      this._feed(agent, 'algae', 0.000035, dt);
    } else {
      this._setState(agent, 'foraging');
      this._feed(agent, 'microfauna', 0.000023, dt);
    }
    agent.target.y = (species.kind === 'shrimp' ? this.floorHeight(agent.target.x, agent.target.z) : this.supportHeight(agent.target.x, agent.target.z)) + (agent.branchOffset || 0.004);
    const previous = copy(agent.position);
    this._move(agent, direction(agent.position, agent.target), speed, dt, false);
    if (species.kind === 'shrimp') {
      agent.position.x = clamp(agent.position.x, 0.85, 1.15);
      agent.position.z = clamp(agent.position.z, -1.65, -1.35);
    } else if (Math.abs(this.supportHeight(agent.position.x, agent.position.z) - this.supportHeight(previous.x, previous.z)) > 0.025) {
      // Analytic rock silhouettes have a height-field edge. Ground animals
      // cannot teleport over that edge: remain on this connected surface and
      // choose another local crawl target on the next decision.
      agent.position = previous;
      agent.velocity = { x: 0, y: 0, z: 0 };
      agent.nextDecision = this.timeSec;
    }
    agent.position.y = (species.kind === 'shrimp' ? this.floorHeight(agent.position.x, agent.position.z) : this.supportHeight(agent.position.x, agent.position.z)) + (agent.branchOffset || 0.004);
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    agent.energy -= dt * (0.00019 + (species.kind === 'shrimp' ? this.environment.currentMps ** 2 * 0.00012 : 0));
    // No photosynthesis is assigned to these animals.
    void light;
  }

  _updateStatic(agent, species, dt, light) {
    agent.velocity = { x: 0, y: 0, z: 0 };
    if (species.kind === 'algae') {
      agent.energy = clamp(this.resources.algae / 1.3, 0, 1);
      return;
    }
    const photoGain = light * (species.kind === 'coral' ? 0.00045 : 0.00033);
    agent.energy += dt * (photoGain - 0.00017);
    if (species.kind === 'clam') this._feed(agent, 'plankton', 0.000028, dt, 0.6);
    else this._feed(agent, 'plankton', 0.000013, dt, 0.3);
    agent.energy = clamp(agent.energy, 0, 1);
    // Long-term coral mortality / bleaching require temperature and exposure models,
    // which this version deliberately does not infer from turbidity alone.
  }

  _fishFloor(agent, x = agent.position.x, z = agent.position.z) {
    const halfLength = agent.sizeM * 0.5;
    const dx = Math.cos(agent.heading) * halfLength;
    const dz = Math.sin(agent.heading) * halfLength;
    // Sample nose and tail as well as the centre so body endpoints cannot cut
    // into an inclined reef even when the centre is above the local surface.
    return Math.max(this.supportHeight(x, z), this.supportHeight(x + dx, z + dz), this.supportHeight(x - dx, z - dz)) + 0.10 + agent.sizeM * 0.3;
  }

  _move(agent, desired, swimSpeed, dt, inWater) {
    const previous = copy(agent.position);
    const previousSpeed = magnitude(agent.velocity);
    let v = copy(desired);
    const current = inWater ? this.environment.currentMps * 0.38 : 0;
    // Steering away from boundaries is gradual; clamping is only the final guard.
    for (const axis of ['x', 'z']) {
      if (Math.abs(agent.position[axis]) > 7.7) v[axis] -= Math.sign(agent.position[axis]) * (Math.abs(agent.position[axis]) - 7.7) * 2;
    }
    if (inWater) {
      const lookAhead = swimSpeed * 1.4 + 0.18;
      const forward = magnitude(v) || 1;
      const anticipatedFloor = this._fishFloor(agent, agent.position.x + v.x / forward * lookAhead, agent.position.z + v.z / forward * lookAhead);
      if (agent.position.y < anticipatedFloor + 0.20) v.y += (anticipatedFloor + 0.20 - agent.position.y) * 3.5;
    }
    if (inWater && agent.position.y > 4.0) v.y -= 1.2;
    const length = magnitude(v);
    const ground = { x: (length ? v.x / length * swimSpeed : 0) + current, y: length ? v.y / length * swimSpeed : 0, z: length ? v.z / length * swimSpeed : 0 };
    // Active station keeping counters much of the flow when hiding or ambushing.
    if (agent.state === 'hiding' || agent.state === 'ambushing') ground.x -= current * 0.92;
    const blend = 1 - Math.exp(-dt * (inWater ? 2.3 : 4));
    for (const axis of ['x', 'y', 'z']) {
      agent.velocity[axis] += (ground[axis] - agent.velocity[axis]) * blend;
      agent.position[axis] += agent.velocity[axis] * dt;
      const [min, max] = WORLD_BOUNDS[axis];
      if (agent.position[axis] < min || agent.position[axis] > max) {
        agent.position[axis] = clamp(agent.position[axis], min, max);
        agent.velocity[axis] = 0;
      }
    }
    const heading = Math.hypot(agent.position.x - previous.x, agent.position.z - previous.z) > 1e-8
      ? Math.atan2(agent.position.z - previous.z, agent.position.x - previous.x) : agent.heading;
    const kind = speciesById[agent.speciesId].kind;
    agent.position = supportedMotion(previous, agent.position, {
      maxDistance: Math.max(previousSpeed, magnitude(ground)) * dt,
      minimumY: inWater ? (x, z) => this._fishFloor({ ...agent, heading }, x, z)
        : (x, z) => (kind === 'shrimp' ? this.floorHeight(x, z) : this.supportHeight(x, z)) + (agent.branchOffset || .004),
      maximumY: WORLD_BOUNDS.y[1], attached: !inWater,
    });
    for (const axis of ['x', 'y', 'z']) agent.velocity[axis] = (agent.position[axis] - previous[axis]) / dt;
    if (Math.hypot(agent.velocity.x, agent.velocity.z) > .0001) agent.heading = Math.atan2(agent.velocity.z, agent.velocity.x);
  }

  _die(agent, reason, cause) {
    if (!agent.alive) return;
    agent.alive = false;
    agent.energy = 0;
    agent.velocity = { x: 0, y: 0, z: 0 };
    agent.state = 'dead';
    this.counters.deathCount += 1;
    this._input('detritus', 0.004);
    if (reason !== 'predation') this._emit(reason, `${speciesById[agent.speciesId].commonName}体能耗尽`, cause);
  }

  _emit(type, label, cause) {
    this.events.push({ timeSec: this.timeSec, type, label, cause });
    if (this.events.length > 45) this.events.shift();
  }

  get metrics() {
    const alive = this.agents.filter((agent) => agent.alive);
    const animals = alive.filter((agent) => speciesById[agent.speciesId].kind !== 'algae');
    const corals = alive.filter((agent) => speciesById[agent.speciesId].kind === 'coral');
    const behaviorCounts = {};
    const speciesCounts = {};
    for (const agent of alive) {
      behaviorCounts[agent.state] = (behaviorCounts[agent.state] || 0) + 1;
      speciesCounts[agent.speciesId] = (speciesCounts[agent.speciesId] || 0) + 1;
    }
    const totalResources = Object.values(this.resources).reduce((sum, value) => sum + value, 0);
    return {
      timeSec: this.timeSec, ...this.resources,
      averageEnergy: animals.length ? animals.reduce((sum, agent) => sum + agent.energy, 0) / animals.length : 0,
      population: alive.length, animalPopulation: animals.length,
      mobilePopulation: alive.filter(agent => !STATIC_KINDS.has(speciesById[agent.speciesId].kind)).length,
      speciesCount: Object.keys(speciesCounts).length,
      coralHealth: corals.length ? corals.reduce((sum, agent) => sum + agent.energy, 0) / corals.length : 0,
      visibilityM: this.visibilityM, lightLevel: this.lightLevel, primaryProduction: this.primaryProduction,
      totalPrimaryProduction: this.totalPrimaryProduction,
      currentEnergyCost: this.environment.currentMps ** 2 * 0.00105,
      resourceBudgetError: totalResources - (this.ledger.initial + this.ledger.input - this.ledger.ingested - this.ledger.exported),
      ...this.counters, behaviorCounts, speciesCounts,
    };
  }
}
