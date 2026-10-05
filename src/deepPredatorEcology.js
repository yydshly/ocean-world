import { DEEP_PREDATOR_PARAMETERS as P } from './deepPredatorSpecies.js';
import { SEA_SPIDER_MOUTH_LOCAL, seaSpiderReferencePose,
  anemoneTentacleReferences } from './deepSeaSpiderGeometry.js';

const SIZE = 64, clone = value => structuredClone(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const vector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const close = (a, b) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const owns = (region, point) => vector(point) && Math.floor(point.x / SIZE) === region.cx && Math.floor(point.z / SIZE) === region.cz;
const identity = region => `deep-ocean:${region.id}:giant-sea-spider-group-1`;
function random(seed, region, salt) {
  let value = 2166136261;
  for (const char of `deep-predator-v1:${typeof seed}:${seed}|${region.id}|${salt}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967296;
}
function transform(agent, point) {
  const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
  return { x: agent.position.x + agent.sizeM * (point.x * c - point.z * s),
    y: agent.position.y + agent.sizeM * point.y,
    z: agent.position.z + agent.sizeM * (point.x * s + point.z * c) };
}
function preyAvailable(agent) {
  return agent.speciesId === 'pom-pom-anemone' && agent.alive && agent.energy > P.preyMinimumCondition + 1e-12;
}
function state(agent, next, timeSec, region) {
  if (agent.state === next) return;
  if (next === 'approaching-anemone') region.predatorCounters.approachCount++;
  agent.state = next; agent.stateSince = timeSec;
}

/** Finite shared references, not a triangle/rigid-body or hydraulic solver.
 * Feet articulate to the actual rendered support; the trunk remains yaw-only.
 * The small supported root lift is part of the XYZ movement budget. */
export function deepPredatorSupportedPose(agent, region, supportHeight, { avoidPreyBodies = true } = {}) {
  if (!owns(region, agent.position) || !Number.isFinite(agent.heading) || !Number.isFinite(agent.sizeM)) return null;
  const floor = supportHeight(agent.position.x, agent.position.z);
  if (!Number.isFinite(floor) || agent.position.y < floor - 1e-8 ||
    agent.position.y > floor + P.maximumRootLiftFraction * agent.sizeM + 1e-8) return null;
  // Ignore stored contacts while deriving a candidate, then publish those same
  // geographic endpoints for the renderer and subsequent restore validation.
  const pose = seaSpiderReferencePose({ ...agent, contactPointsLocal: undefined }, supportHeight);
  if (!pose || !Array.isArray(pose.feetWorld) || pose.feetWorld.length !== 8 ||
    !vector(pose.bodyWorld) || !vector(pose.mouthWorld) || !pose.feetWorld.every(point => owns(region, point))) return null;
  const levels = pose.feetWorld.map(point => supportHeight(point.x, point.z));
  if (!levels.every(Number.isFinite) || Math.max(...levels) - Math.min(...levels) > agent.sizeM * .24) return null;
  for (let index = 0; index < 8; index++) if (!close(pose.feetWorld[index].y, levels[index])) return null;
  const bodyProbes = [[0, 0], [.075, 0], [-.075, 0], [0, .027], [0, -.027]].map(([x, z]) =>
    transform(agent, { x, y: .082, z }));
  const probes = [...bodyProbes, pose.mouthWorld];
  // Every leg has a bounded set of along-segment references. The shared helper
  // returns the actual joints used in rendering, including the supported foot.
  for (const leg of pose.legsLocal ?? []) {
    const joints = Array.isArray(leg) ? leg : leg.points;
    if (!Array.isArray(joints) || joints.length < 2 || !joints.every(vector)) return null;
    for (let index = 1; index < joints.length; index++) for (const f of [.25, .5, .75, 1]) {
      const a = joints[index - 1], b = joints[index];
      probes.push(transform(agent, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }));
    }
  }
  if (probes.some(point => !owns(region, point) || !Number.isFinite(supportHeight(point.x, point.z)) ||
    point.y < supportHeight(point.x, point.z) - 1e-8)) return null;
  if (avoidPreyBodies) {
    for (const prey of region.sim.agents.filter(item => item.speciesId === 'pom-pom-anemone' && item.alive)) {
      if ([...bodyProbes, ...pose.feetWorld, ...probes].some(point =>
        point.y >= prey.position.y - 1e-8 && point.y < prey.position.y + prey.sizeM * .361 &&
        Math.hypot(point.x - prey.position.x, point.z - prey.position.z) < prey.sizeM * .272)) return null;
    }
  }
  return pose;
}
function publishPose(agent, pose) {
  agent.contactPointsLocal = clone(pose.contactPointsLocal);
  agent.bodyReferenceWorld = clone(pose.bodyWorld); agent.mouthReferenceWorld = clone(pose.mouthWorld);
}

/** A new independent draw never calls native sim._random or modifies any native
 * field. Examined empty/full/dead categories remain permanently examined. */
export function upgradeDeepPredators(region, { seed, supportHeight, animalLimit = 20 } = {}) {
  if (region.predatorCommunityVersion >= P.communityVersion) return false;
  region.predatorCommunityVersion = P.communityVersion; region.predatorAgents = [];
  region.predatorEnergyLedger = { initial: 0, transferredIn: 0, metabolism: 0, loss: 0 };
  region.predatorCounters = { feedingCount: 0, approachCount: 0, deathCount: 0 }; region.predatorEvents = [];
  if (region.sim.agents.length >= animalLimit || random(seed, region, 'occupied') >= P.allocationProbability) return true;
  const hosts = region.sim.agents.filter(preyAvailable).sort((a, b) => a.id.localeCompare(b.id));
  if (!hosts.length) return true;
  const host = hosts[Math.floor(random(seed, region, 'host') * hosts.length)];
  const sizeM = .2 + random(seed, region, 'size') * .2, energy = .58 + random(seed, region, 'energy') * .08;
  const separation = .4 + random(seed, region, 'distance') * .3;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random(seed, region, 'angle') * Math.PI * 2 + attempt * Math.PI / 6;
    const x = host.position.x + Math.cos(angle) * separation, z = host.position.z + Math.sin(angle) * separation;
    const position = { x, y: supportHeight(x, z), z }, heading = Math.atan2(host.position.z - z, host.position.x - x);
    const agent = { id: identity(region), speciesId: 'giant-sea-spider-group', taxonomicLevel: 'genus', regionId: region.id,
      position, home: clone(position), target: clone(position), heading, sizeM, energy, alive: true,
      velocity: { x: 0, y: 0, z: 0 }, state: 'searching-anemone', stateSince: region.sim.timeSec,
      birthTimeSec: region.sim.timeSec, birthPreyId: host.id, targetPreyId: host.id,
      nextBite: region.sim.timeSec, nextDecision: region.sim.timeSec, lastFeedAt: null, lastContact: null, lastPredation: null,
      hunger: 1 - energy, stress: 0 };
    const pose = deepPredatorSupportedPose(agent, region, supportHeight);
    if (!pose) continue;
    publishPose(agent, pose); region.predatorAgents.push(agent); region.predatorEnergyLedger.initial = energy; break;
  }
  return true;
}

export function nearestDeepPredatorContact(agent, prey, timeSec, environment = {}) {
  const mouth = seaSpiderReferencePose(agent).mouthWorld;
  let point = null, gap = Infinity;
  for (const candidate of anemoneTentacleReferences(prey, timeSec, environment)) {
    const next = distance(mouth, candidate);
    if (next < gap) { point = candidate; gap = next; }
  }
  return { mouth, point, distanceM: gap, allowedDistanceM: P.mouthReachM };
}
function selectTarget(agent, region) {
  let target = null, best = P.senseM;
  for (const prey of region.sim.agents) {
    if (!preyAvailable(prey)) continue;
    const gap = distance(agent.position, prey.position);
    if (gap < best || gap === best && prey.id < target?.id) { target = prey; best = gap; }
  }
  return target;
}
function angleToward(current, goal, maximum) {
  const difference = Math.atan2(Math.sin(goal - current), Math.cos(goal - current));
  return current + clamp(difference, -maximum, maximum);
}
function move(agent, target, region, dt, supportHeight, targetHeading) {
  const previous = clone(agent.position), budget = P.crawlMps * dt;
  const heading = angleToward(agent.heading, targetHeading, P.turnRadiansPerSec * dt);
  const dx = target.x - previous.x, dy = target.y - previous.y, dz = target.z - previous.z;
  const length = Math.hypot(dx, dy, dz), ratio = length > 1e-12 ? Math.min(1, budget / length) : 0;
  const previousLift = previous.y - supportHeight(previous.x, previous.z);
  const targetLift = target.y - supportHeight(target.x, target.z);
  for (let attempt = 0; attempt < 10; attempt++) {
    const fraction = ratio * 2 ** -attempt;
    const endpoint = { x: previous.x + dx * fraction, y: previous.y, z: previous.z + dz * fraction };
    endpoint.y = supportHeight(endpoint.x, endpoint.z) + previousLift + (targetLift - previousLift) * fraction;
    const candidate = { ...agent, position: endpoint, heading }, pose = deepPredatorSupportedPose(candidate, region, supportHeight);
    if (!pose || distance(previous, endpoint) > budget + 1e-10) continue;
    let clear = true, priorProbe = previous, pathLength = 0;
    for (const f of [.25, .5, .75]) {
      const point = { x: previous.x + (endpoint.x - previous.x) * f, y: previous.y, z: previous.z + (endpoint.z - previous.z) * f };
      point.y = supportHeight(point.x, point.z) + previousLift + (targetLift - previousLift) * fraction * f;
      const probe = { ...agent, position: point,
        heading: agent.heading + (heading - agent.heading) * f };
      pathLength += distance(priorProbe, point); priorProbe = point;
      if (distance(previous, point) > budget * f + 1e-10 ||
        !deepPredatorSupportedPose(probe, region, supportHeight)) { clear = false; break; }
    }
    pathLength += distance(priorProbe, endpoint);
    if (!clear || pathLength > budget + 1e-10) continue;
    agent.position = endpoint; agent.heading = heading; publishPose(agent, pose); break;
  }
  agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (agent.position[axis] - previous[axis]) / dt]));
}

/** Only the actual proboscis point contacting sampled living tentacles debits
 * the prey's condition. The span/sense radius never grants feeding reach. */
export function feedDeepPredator(agent, prey, region, dt, supportHeight) {
  const now = region.sim.timeSec;
  if (!Number.isFinite(dt) || dt <= 0 || dt > .1 + 1e-10 || !region.predatorAgents?.includes(agent) ||
    !region.sim.agents.includes(prey) || agent.regionId !== region.id || prey.regionId !== region.id ||
    !agent.alive || !preyAvailable(prey) || agent.energy >= P.hungryBelow || now + 1e-10 < agent.nextBite ||
    !deepPredatorSupportedPose(agent, region, supportHeight)) return 0;
  const contact = nearestDeepPredatorContact(agent, prey, now, region.sim.environment);
  if (!contact.point || contact.distanceM > P.mouthReachM + 1e-10) return 0;
  const removedUnits = Math.min(P.intakeConditionPerSec * dt, prey.energy - P.preyMinimumCondition);
  if (!(removedUnits > 0)) return 0;
  const preyEnergyBefore = prey.energy, predatorEnergyBefore = agent.energy;
  const gainUnits = Math.min(1 - agent.energy, removedUnits * P.assimilationFraction), lossUnits = removedUnits - gainUnits;
  prey.energy -= removedUnits; prey.hunger = 1 - prey.energy;
  region.sim.energyLedger.predationTransferredOut = (region.sim.energyLedger.predationTransferredOut ?? 0) + removedUnits;
  agent.energy += gainUnits; agent.hunger = 1 - agent.energy;
  region.predatorEnergyLedger.transferredIn += removedUnits; region.predatorEnergyLedger.loss += lossUnits;
  agent.lastFeedAt = now; agent.nextBite = now + dt; region.predatorCounters.feedingCount++;
  state(agent, 'proboscis-feeding', now, region);
  const intake = { timeSec: now, targetId: prey.id, removedUnits, gainUnits, lossUnits,
    preyEnergyBefore, preyEnergyAfter: prey.energy, predatorEnergyBefore, predatorEnergyAfter: agent.energy,
    mouthPosition: clone(contact.mouth), preyContactPosition: clone(contact.point),
    preyPose: { id: prey.id, position: clone(prey.position), heading: prey.heading, sizeM: prey.sizeM,
      lastFeedAt: prey.lastFeedAt, contraction: Number.isFinite(prey.contraction) ? prey.contraction : 0, state: prey.state },
    currentMps: region.sim.environment.currentMps,
    contactDistanceM: contact.distanceM, mouthGap: P.mouthReachM - contact.distanceM, allowedDistanceM: P.mouthReachM,
    referenceId: contact.point.referenceId ?? null, unit: 'dimensionless-condition-index' };
  agent.lastContact = clone(intake); agent.lastPredation = clone(intake);
  region.predatorEvents.push({ type: 'predation', label: '海蜘蛛吻管接触吸食', agentId: agent.id,
    cause: '接触已有活海葵触手后转移少量体况指数；不代表整只吞食、真实生物量或已测野外速率。', ...intake });
  if (region.predatorEvents.length > 40) region.predatorEvents.shift();
  return removedUnits;
}

export function advanceDeepPredators(region, dt, { supportHeight } = {}) {
  if (region.predatorCommunityVersion !== P.communityVersion) return;
  const now = region.sim.timeSec;
  for (const agent of region.predatorAgents) {
    if (!agent.alive) continue;
    const prey = selectTarget(agent, region);
    if (prey && agent.energy < P.hungryBelow) {
      agent.targetPreyId = prey.id;
      const contact = nearestDeepPredatorContact(agent, prey, now, region.sim.environment);
      const heading = Math.atan2(prey.position.z - agent.position.z, prey.position.x - agent.position.x);
      const c = Math.cos(heading), s = Math.sin(heading), mouth = SEA_SPIDER_MOUTH_LOCAL;
      if (contact.point) {
        const x = contact.point.x - agent.sizeM * (mouth.x * c - mouth.z * s);
        const z = contact.point.z - agent.sizeM * (mouth.x * s + mouth.z * c);
        const floor = supportHeight(x, z);
        agent.target = { x, y: clamp(contact.point.y - mouth.y * agent.sizeM, floor, floor + P.maximumRootLiftFraction * agent.sizeM), z };
        // Once in real mouth contact, keep the supported pose; do not jitter
        // the feet to track decorative tip motion or drag the prey along.
        if (contact.distanceM > P.mouthReachM) {
          state(agent, 'approaching-anemone', now, region); move(agent, agent.target, region, dt, supportHeight, heading);
        }
        else agent.velocity = { x: 0, y: 0, z: 0 };
        feedDeepPredator(agent, prey, region, dt, supportHeight);
      }
    } else {
      agent.targetPreyId = null; agent.target = clone(agent.position); agent.velocity = { x: 0, y: 0, z: 0 };
      state(agent, prey ? 'resting-satiated' : 'searching-no-prey', now, region);
    }
    const debit = Math.min(agent.energy, P.metabolismPerSec * dt);
    agent.energy -= debit; region.predatorEnergyLedger.metabolism += debit; agent.hunger = 1 - agent.energy;
    if (agent.energy <= 0) {
      agent.energy = 0; agent.alive = false; agent.velocity = { x: 0, y: 0, z: 0 };
      state(agent, 'dead', now, region); region.predatorCounters.deathCount++;
    }
  }
}

export function predatorEnergyBudgetError(region) {
  const ledger = region.predatorEnergyLedger;
  if (!ledger) return 0;
  return region.predatorAgents.reduce((sum, agent) => sum + agent.energy, 0) -
    (ledger.initial + ledger.transferredIn - ledger.metabolism - ledger.loss);
}

export function validateDeepPredatorRecord(record, region, { seed, supportHeight, animalLimit = 20 } = {}) {
  const hasMetadata = ['predatorCommunityVersion', 'predatorAgents', 'predatorEnergyLedger', 'predatorEvents', 'predatorCounters']
    .some(key => Object.hasOwn(record, key));
  if (!hasMetadata) return !Object.hasOwn(region.sim.energyLedger, 'predationTransferredOut');
  if (record.predatorCommunityVersion !== P.communityVersion || !Array.isArray(record.predatorAgents) || record.predatorAgents.length > 1 ||
    record.predatorAgents.length && random(seed, region, 'occupied') >= P.allocationProbability ||
    record.predatorAgents.length + region.sim.agents.length > animalLimit || !Array.isArray(record.predatorEvents) || record.predatorEvents.length > 40 ||
    !['initial', 'transferredIn', 'metabolism', 'loss'].every(key => nonnegative(record.predatorEnergyLedger?.[key])) ||
    !['feedingCount', 'approachCount', 'deathCount'].every(key => Number.isSafeInteger(record.predatorCounters?.[key]) && record.predatorCounters[key] >= 0) ||
    Object.hasOwn(region.sim.energyLedger, 'predationTransferredOut') && !nonnegative(region.sim.energyLedger.predationTransferredOut)) return false;
  const ids = new Set(region.sim.agents.map(agent => agent.id));
  const validateIntake = (intake, agent) => {
    const prey = region.sim.agents.find(item => item.id === intake?.targetId), pose = intake?.preyPose;
    if (!prey || !pose || pose.id !== prey.id || !vector(pose.position) ||
      ['x', 'y', 'z'].some(axis => !close(pose.position[axis], prey.position[axis])) ||
      !close(pose.heading, prey.heading) || !close(pose.sizeM, prey.sizeM) || !nonnegative(pose.contraction) || pose.contraction > 1 ||
      typeof pose.state !== 'string' || pose.lastFeedAt !== null && (!nonnegative(pose.lastFeedAt) || pose.lastFeedAt > intake.timeSec + 1e-8) ||
      !nonnegative(intake.currentMps) || intake.currentMps > 1.2) return false;
    const reference = anemoneTentacleReferences(pose, intake.timeSec, { currentMps: intake.currentMps })
      .find(point => point.referenceId === intake.referenceId);
    if (!reference || ['x', 'y', 'z'].some(axis => !close(reference[axis], intake.preyContactPosition?.[axis]))) return false;
    return intake && nonnegative(intake.timeSec) && intake.timeSec <= region.sim.timeSec + 1e-8 &&
    ids.has(intake.targetId) && region.sim.agents.find(prey => prey.id === intake.targetId)?.speciesId === 'pom-pom-anemone' &&
    ['removedUnits', 'gainUnits', 'lossUnits', 'preyEnergyBefore', 'preyEnergyAfter', 'predatorEnergyBefore', 'predatorEnergyAfter', 'contactDistanceM', 'mouthGap', 'allowedDistanceM'].every(key => nonnegative(intake[key])) &&
    intake.removedUnits > 0 && intake.removedUnits <= P.intakeConditionPerSec * .1 + 1e-10 &&
    intake.preyEnergyAfter >= P.preyMinimumCondition - 1e-8 && intake.preyEnergyBefore <= 1 && intake.predatorEnergyAfter <= 1 &&
    close(intake.preyEnergyBefore - intake.preyEnergyAfter, intake.removedUnits) &&
    close(intake.predatorEnergyAfter - intake.predatorEnergyBefore, intake.gainUnits) && close(intake.gainUnits + intake.lossUnits, intake.removedUnits) &&
    close(intake.allowedDistanceM, P.mouthReachM) && intake.contactDistanceM <= P.mouthReachM + 1e-8 &&
    vector(intake.mouthPosition) && vector(intake.preyContactPosition) && owns(region, intake.mouthPosition) && owns(region, intake.preyContactPosition) &&
    close(distance(intake.mouthPosition, intake.preyContactPosition), intake.contactDistanceM) && close(intake.mouthGap, P.mouthReachM - intake.contactDistanceM) &&
    intake.unit === 'dimensionless-condition-index' && (!agent || intake.timeSec === agent.lastFeedAt);
  };
  for (const agent of record.predatorAgents) {
    const originalEnergy = .58 + random(seed, region, 'energy') * .08;
    const host = region.sim.agents.find(prey => prey.id === agent.birthPreyId);
    if (agent.id !== identity(region) || agent.speciesId !== 'giant-sea-spider-group' || agent.taxonomicLevel !== 'genus' || agent.regionId !== region.id ||
      !host || host.speciesId !== 'pom-pom-anemone' || !close(agent.sizeM, .2 + random(seed, region, 'size') * .2) ||
      !['position', 'home', 'target'].every(key => owns(region, agent[key])) || !vector(agent.velocity) || !Number.isFinite(agent.heading) ||
      !Number.isFinite(agent.energy) || agent.energy < 0 || agent.energy > 1 || typeof agent.alive !== 'boolean' ||
      typeof agent.state !== 'string' || !['stateSince', 'nextBite', 'nextDecision', 'birthTimeSec', 'hunger', 'stress'].every(key => nonnegative(agent[key])) ||
      agent.stateSince > region.sim.timeSec + 1e-8 || agent.birthTimeSec > region.sim.timeSec + 1e-8 || !close(agent.hunger, 1 - agent.energy) ||
      !close(record.predatorEnergyLedger.initial, originalEnergy) ||
      !close(Math.hypot(agent.home.x - host.position.x, agent.home.z - host.position.z), .4 + random(seed, region, 'distance') * .3) ||
      agent.targetPreyId !== null && (!ids.has(agent.targetPreyId) || region.sim.agents.find(prey => prey.id === agent.targetPreyId)?.speciesId !== 'pom-pom-anemone') ||
      agent.lastFeedAt !== null && (!nonnegative(agent.lastFeedAt) || agent.lastFeedAt > region.sim.timeSec + 1e-8) ||
      agent.lastFeedAt === null && (agent.lastContact !== null || agent.lastPredation !== null) ||
      agent.lastFeedAt !== null && (!validateIntake(agent.lastContact, agent) || !validateIntake(agent.lastPredation, agent)) ||
      !Array.isArray(agent.contactPointsLocal) || agent.contactPointsLocal.length !== 8 || !agent.contactPointsLocal.every(vector) ||
      !vector(agent.bodyReferenceWorld) || !vector(agent.mouthReferenceWorld)) return false;
    if (agent.alive) {
      const pose = deepPredatorSupportedPose(agent, region, supportHeight);
      if (!pose || pose.contactPointsLocal.some((point, index) => ['x', 'y', 'z'].some(axis => !close(point[axis], agent.contactPointsLocal[index][axis]))) ||
        ['x', 'y', 'z'].some(axis => !close(pose.bodyWorld[axis], agent.bodyReferenceWorld[axis]) || !close(pose.mouthWorld[axis], agent.mouthReferenceWorld[axis]))) return false;
    } else if (agent.state !== 'dead') return false;
  }
  const copyRegion = { ...region, predatorAgents: record.predatorAgents, predatorEnergyLedger: record.predatorEnergyLedger };
  if (!close(predatorEnergyBudgetError(copyRegion), 0) || !close(record.predatorEnergyLedger.transferredIn, region.sim.energyLedger.predationTransferredOut ?? 0) ||
    record.predatorEvents.some(event => event.type !== 'predation' || event.agentId !== identity(region) || !validateIntake(event)) ||
    !record.predatorAgents.length && (Object.values(record.predatorEnergyLedger).some(value => value !== 0) || record.predatorEvents.length ||
      Object.values(record.predatorCounters).some(value => value !== 0))) return false;
  return true;
}
