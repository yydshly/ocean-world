import { OCEAN_TURTLE_MODEL, oceanTurtlePositionValid } from './oceanTurtleCommunity.js';
import { livingShallowsMeadowGeometry } from './world/livingShallowsAssets.js';

/** Finite adult grass-crown contact. Lengths, timings and material intake are
 * authored representatives, not leaf deformation or measured animal rates. */
export const OCEAN_TURTLE_GRAZING_VERSION = 1;
export const OCEAN_TURTLE_GRAZING_MODEL = Object.freeze({ mouthForwardFactor: .49, mouthHeightFactor: .018,
  plantRadiusScope: 'all shared mesh vertices plus .05 local-unit shader bending', plantHeightFactor: 1.02, vegetationMarginM: .035,
  biteIntervalSec: 2.5, biteUnits: .0005, boutDurationSec: 12, retryIntervalSec: 20,
  maximumGrassCandidates: 32, maximumLeafCandidates: 12, directions: 3, sourceRadiusM: 12,
  contactScope: 'shared static leaf-tip mesh with existing four-corner grounding; shader current bend omitted, at most .05 local XZ units' });
const TAU = Math.PI * 2, EPS = 1e-8;
const PHASES = ['idle', 'lifting', 'approaching', 'aligning', 'descending', 'grazing', 'ascending'];
const POINTS = ['entryPosition', 'liftPosition', 'approachPosition', 'contactPosition', 'exitPosition'];
let leafReferences, leafRadius;
function sharedLeafReferences() {
  if (leafReferences) return leafReferences;
  const geometry = livingShallowsMeadowGeometry(), positions = geometry.attributes.position, roots = geometry.attributes.rootXZ;
  try {
    leafRadius = .05;
    for (let i = 0; i < positions.count; i++) leafRadius = Math.max(leafRadius, Math.hypot(positions.getX(i), positions.getZ(i)) + .05);
    leafReferences = Object.freeze(Array.from({ length: geometry.userData.bladeCount }, (_, index) => {
      const vertex = index * 10 + 8;
      return Object.freeze({ index, x: positions.getX(vertex), y: positions.getY(vertex), z: positions.getZ(vertex),
        rootX: roots.getX(vertex), rootZ: roots.getY(vertex) });
    }));
    return leafReferences;
  } finally { geometry.dispose(); }
}
const finite = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
const lerp = (a, b, t) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, a[k] + (b[k] - a[k]) * t]));
const ownGrass = (generator, region) => generator.chunk(region.cx, region.cz).elements.filter(e => e.kind === 'seagrass');
function allGrass(generator, region) {
  const result = [];
  for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++)
    result.push(...generator.chunk(region.cx + x, region.cz + z).elements.filter(e => e.kind === 'seagrass'));
  return result;
}
function context(region, surface, grass) { return { cx: region.cx, cz: region.cz, surface, grass }; }
function crownRadius(plant) { return Math.max(plant.scale.x, plant.scale.z) * .65; }
function actualVegetationRadius(plant) { sharedLeafReferences(); return Math.max(plant.scale.x, plant.scale.z) * leafRadius; }
function samePlant(actual, supplied) {
  return actual && supplied && actual.id === supplied.id && actual.kind === supplied.kind &&
    ['x', 'y', 'z', 'rotation'].every(k => actual[k] === supplied[k]) &&
    ['x', 'y', 'z'].every(k => actual.scale[k] === supplied.scale?.[k]);
}
function rectangleDistance(x, z, minX, maxX, halfZ, size) {
  const dx = Math.max(minX * size - x, 0, x - maxX * size), dz = Math.max(0, Math.abs(z) - halfZ * size);
  return Math.hypot(dx, dz);
}

/** The renderer's fixed beak reference, facing +X, with world heading. The
 * grazing controller uses zero pitch; arbitrary caller mouth points are never
 * accepted as evidence of contact. No independent animated/extended head. */
export function oceanTurtleMouthPose(agent) {
  if (!finite(agent?.position) || !Number.isFinite(agent.sizeM) || !Number.isFinite(agent.heading) || !Number.isFinite(agent.pitch)) return null;
  const forward = agent.sizeM * .49, up = agent.sizeM * .018;
  const x = forward * Math.cos(agent.pitch) - up * Math.sin(agent.pitch);
  return { x: agent.position.x + Math.cos(agent.heading) * x,
    y: agent.position.y + forward * Math.sin(agent.pitch) + up * Math.cos(agent.pitch),
    z: agent.position.z + Math.sin(agent.heading) * x };
}

/** Original nine hard-support probes and owner/water constraints remain.
 * Grass uses conservative oriented shell/flipper rectangles. Only the beak
 * may contact a crown edge; excluding an entire target tuft would be unsafe. */
export function oceanTurtleGrazingPositionValid(agent, generator, { cx, cz, surface, grass } = {}) {
  if (!agent || agent.pitch !== 0 || !Number.isFinite(agent.heading) ||
      !oceanTurtlePositionValid(generator, agent.position, agent.sizeM, { cx, cz, surface, grass: [] })) return false;
  const plants = grass ?? allGrass(generator, { cx, cz }), c = Math.cos(agent.heading), s = Math.sin(agent.heading);
  for (const plant of plants) {
    if (agent.position.y - agent.sizeM * .25 >= plant.y + plant.scale.y * 1.02 + .25 - EPS) continue;
    const dx = plant.x - agent.position.x, dz = plant.z - agent.position.z;
    const x = dx * c + dz * s, z = -dx * s + dz * c;
    const separation = Math.min(rectangleDistance(x, z, -.40, .325, .30, agent.sizeM),
      rectangleDistance(x, z, -.50, .25, .64, agent.sizeM));
    if (separation < actualVegetationRadius(plant) + .035 - EPS) return false;
  }
  return true;
}
function oldHeight(generator, position, agent, surface, grass) {
  const radius = .64 * agent.sizeM + .12;
  let top = -Infinity;
  for (let i = 0; i < 9; i++) {
    const a = (i - 1) * TAU / 8, r = i ? radius : 0;
    const height = surface(position.x + Math.cos(a) * r, position.z + Math.sin(a) * r);
    if (!Number.isFinite(height)) return NaN;
    top = Math.max(top, height);
  }
  for (const plant of grass) if (Math.hypot(plant.x - position.x, plant.z - position.z) <= radius + crownRadius(plant))
    top = Math.max(top, plant.y + plant.scale.y * 1.02);
  return top + agent.sizeM * .25 + .45;
}
/** Actual prototype leaf-tip vertex, transformed by its owner's original
 * instance rotation/scale and the same four-corner root grounding as rendering.
 * Current-driven shader bending stays an explicit finite display discrepancy. */
export function oceanTurtleSeagrassLeafPose(generator, plant, leafIndex) {
  const ref = Number.isInteger(leafIndex) && sharedLeafReferences()[leafIndex];
  if (!ref || !plant?.scale || plant.kind !== 'seagrass' || typeof generator.floorSurface !== 'function') return null;
  const c = Math.cos(plant.rotation), s = Math.sin(plant.rotation);
  const transform = (x, z) => ({ x: plant.x + x * plant.scale.x * c + z * plant.scale.z * s,
    z: plant.z - x * plant.scale.x * s + z * plant.scale.z * c });
  const values = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, z]) => {
    const world = transform(x, z); return (generator.floorSurface(world.x, world.z).height - plant.y) / plant.scale.y;
  });
  const x = ref.rootX + .5, z = ref.rootZ + .5;
  const ground = (values[0] * (1 - x) + values[1] * x) * (1 - z) + (values[2] * (1 - x) + values[3] * x) * z;
  return { ...transform(ref.x, ref.z), y: plant.y + (ground + ref.y * (1 - Math.max(0, ground))) * plant.scale.y };
}
function derivedContact(agent, generator, plant, leafIndex, heading) {
  const leaf = oceanTurtleSeagrassLeafPose(generator, plant, leafIndex);
  return leaf && { x: leaf.x - Math.cos(heading) * agent.sizeM * .49,
    y: leaf.y - agent.sizeM * .018, z: leaf.z - Math.sin(heading) * agent.sizeM * .49 };
}
function oldValid(agent, position, generator, region, surface, grass) {
  return oceanTurtlePositionValid(generator, position, agent.sizeM, context(region, surface, grass));
}
function segmentValid(a, b, predicate) {
  const count = Math.max(1, Math.ceil(distance(a, b) / .20));
  for (let i = 0; i <= count; i++) if (!predicate(lerp(a, b, i / count))) return false;
  return true;
}
function setPhase(agent, phase, now) { agent.grazing.phase = phase; agent.grazing.phaseSinceSec = now; }
function clearRoute(agent, now) {
  const g = agent.grazing;
  setPhase(agent, 'idle', now); g.nextAttemptAtSec = now + 20;
  for (const key of POINTS) g[key] = null;
  g.sourceGrassId = null; g.leafIndex = null; g.contactHeading = null; g.startedAtSec = null; g.biteUntilSec = null;
}

/** Add fields only. The owner is committed by OceanEcology before this optional
 * controller becomes public. Existing patrol, breath, deaths and clocks stay. */
export function initializeOceanTurtleGrazing(region, generator, { surface } = {}) {
  if (region.turtleGrazingVersion !== undefined || generator.profile !== 'living-shallows-v1' ||
      region.turtleCommunityVersion !== 1 || !region.turtleAgents?.length || typeof surface !== 'function') return false;
  if (region.turtleAgents.some(a => a.grazing !== undefined)) throw new Error('Partial saved turtle grazing state.');
  region.turtleGrazingVersion = 1; region.turtleGrazingInitializedAtSec = region.timeSec;
  for (const agent of region.turtleAgents) if (agent.alive) agent.grazing = {
    version: 1, initializedAtSec: region.timeSec, phase: 'idle', phaseSinceSec: region.timeSec,
    nextAttemptAtSec: region.timeSec + 5, nextBiteAtSec: region.timeSec + 5,
    sourceGrassId: null, leafIndex: null, contactHeading: null, entryPosition: null, liftPosition: null,
    approachPosition: null, contactPosition: null, exitPosition: null, startedAtSec: null, biteUntilSec: null,
    lastConsumedAtSec: null, biteCount: 0, consumedUnits: 0,
  };
  return true;
}

function chooseRoute(agent, region, generator, surface, grass) {
  const source = ownGrass(generator, region).filter(p => Math.hypot(p.x - agent.home.x, p.z - agent.home.z) <= 12)
    .sort((a, b) => Math.hypot(a.x - agent.position.x, a.z - agent.position.z) - Math.hypot(b.x - agent.position.x, b.z - agent.position.z) || a.id.localeCompare(b.id));
  const refs = sharedLeafReferences().slice().sort((a, b) => b.y - a.y || Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z) || a.index - b.index).slice(0, 12);
  for (const plant of source.slice(0, 32)) for (const ref of refs) for (const offset of [0, -.125 * Math.PI, .125 * Math.PI]) {
    const leaf = oceanTurtleSeagrassLeafPose(generator, plant, ref.index);
    const heading = Math.atan2(plant.z - leaf.z, plant.x - leaf.x) + offset;
    const position = derivedContact(agent, generator, plant, ref.index, heading);
    const proposed = { ...agent, position, heading, pitch: 0 };
    if (!oceanTurtleGrazingPositionValid(proposed, generator, context(region, surface, grass))) continue;
    let high = Math.max(agent.position.y, oldHeight(generator, position, agent, surface, grass));
    const count = Math.max(1, Math.ceil(Math.hypot(agent.position.x - position.x, agent.position.z - position.z) / .20));
    for (let j = 0; j <= count; j++) high = Math.max(high, oldHeight(generator, lerp(agent.position, position, j / count), agent, surface, grass));
    const lift = { ...agent.position, y: high }, approach = { ...position, y: high };
    if (!segmentValid(agent.position, lift, p => oldValid(agent, p, generator, region, surface, grass)) ||
        !segmentValid(lift, approach, p => oldValid(agent, p, generator, region, surface, grass)) ||
        !segmentValid(approach, position, p => oceanTurtleGrazingPositionValid({ ...proposed, position: p }, generator, context(region, surface, grass)))) continue;
    return { sourceGrassId: plant.id, leafIndex: ref.index, contactHeading: heading, entryPosition: { ...agent.position },
      liftPosition: lift, approachPosition: approach, contactPosition: position, exitPosition: { ...approach } };
  }
  return null;
}

/** A real owner descriptor and the recomputed rigid beak/edge pose are required
 * on every debit, including when called separately by the material ledger. */
export function oceanTurtleGrazingContact(agent, plant, generator, { cx, cz, surface } = {}) {
  const g = agent?.grazing;
  if (!agent?.alive || g?.version !== 1 || g.phase !== 'grazing' || agent.state !== 'seagrass-cruising' ||
      !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || agent.regionId !== `${cx},${cz}` ||
      g.sourceGrassId !== plant?.id || !Number.isFinite(g.contactHeading) || Math.abs(angle(agent.heading - g.contactHeading)) > EPS) return false;
  const actual = ownGrass(generator, { cx, cz }).find(p => p.id === plant.id);
  const pose = actual && derivedContact(agent, generator, actual, g.leafIndex, g.contactHeading);
  if (!samePlant(actual, plant) || !finite(pose) || !finite(g.contactPosition) || distance(pose, g.contactPosition) > EPS ||
      distance(agent.position, g.contactPosition) > EPS || !oceanTurtleGrazingPositionValid(agent, generator, { cx, cz, surface })) return false;
  const mouth = oceanTurtleMouthPose(agent);
  const leaf = oceanTurtleSeagrassLeafPose(generator, actual, g.leafIndex);
  return mouth !== null && finite(leaf) && distance(mouth, leaf) < 1e-7;
}

function onSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length2 = dx * dx + dy * dy + dz * dz;
  if (!length2) return distance(point, a) <= EPS;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy + (point.z - a.z) * dz) / length2;
  return t >= -EPS && t <= 1 + EPS && distance(point, lerp(a, b, Math.max(0, Math.min(1, t)))) <= 1e-7;
}
export function validateOceanTurtleGrazingRecord(region, generator, { surface } = {}) {
  const has = region.turtleGrazingVersion !== undefined || region.turtleGrazingInitializedAtSec !== undefined ||
    region.turtleAgents?.some(a => a.grazing !== undefined);
  if (!has) return true;
  if (region.turtleGrazingVersion !== 1 || generator.profile !== 'living-shallows-v1' || region.turtleCommunityVersion !== 1 ||
      !Array.isArray(region.turtleAgents) || !region.turtleAgents.length || region.turtleAgents.length > 1 ||
      !Number.isFinite(region.timeSec) || !Number.isFinite(region.turtleGrazingInitializedAtSec) ||
      region.turtleGrazingInitializedAtSec < 0 || region.turtleGrazingInitializedAtSec > region.timeSec || typeof surface !== 'function') return false;
  if (region.turtleOrganicVersion === 1 && (!Number.isFinite(region.turtleOrganic?.counters?.seagrassGrazedUnits) ||
      Math.abs(region.turtleOrganic.counters.seagrassGrazedUnits - region.turtleAgents.reduce((sum, a) => sum + (a.grazing?.consumedUnits ?? 0), 0)) > EPS)) return false;
  const grass = allGrass(generator, region), plants = ownGrass(generator, region);
  for (const a of region.turtleAgents) {
    const g = a.grazing;
    if (!a.alive && g === undefined) continue;
    if (!g || g.version !== 1 || !PHASES.includes(g.phase) || g.initializedAtSec !== region.turtleGrazingInitializedAtSec ||
        !['phaseSinceSec', 'nextAttemptAtSec', 'nextBiteAtSec'].every(k => Number.isFinite(g[k]) && g[k] >= g.initializedAtSec) ||
        g.phaseSinceSec > region.timeSec || !Number.isInteger(g.biteCount) || g.biteCount < 0 ||
        !Number.isFinite(g.consumedUnits) || g.consumedUnits < 0 ||
        !(g.lastConsumedAtSec === null || Number.isFinite(g.lastConsumedAtSec) && g.lastConsumedAtSec >= g.initializedAtSec && g.lastConsumedAtSec <= region.timeSec) ||
        (g.biteCount === 0) !== (g.lastConsumedAtSec === null) || (g.biteCount === 0) !== (g.consumedUnits === 0) ||
        g.consumedUnits > g.biteCount * .0005 + EPS) return false;
    if (g.phase === 'idle') {
      if (POINTS.some(k => g[k] !== null) || g.sourceGrassId !== null || g.leafIndex !== null || g.contactHeading !== null || g.startedAtSec !== null || g.biteUntilSec !== null) return false;
      continue;
    }
    if ((a.alive && a.state !== 'seagrass-cruising') || a.pitch !== 0 ||
        !POINTS.every(k => finite(g[k])) || !Number.isFinite(g.contactHeading) ||
        !Number.isFinite(g.startedAtSec) || g.startedAtSec < g.initializedAtSec || g.startedAtSec > g.phaseSinceSec ||
        !(g.biteUntilSec === null || Number.isFinite(g.biteUntilSec) && g.biteUntilSec >= g.startedAtSec) ||
        !oceanTurtleGrazingPositionValid(a, generator, context(region, surface, grass))) return false;
    const plant = plants.find(p => p.id === g.sourceGrassId);
    const derived = plant && derivedContact(a, generator, plant, g.leafIndex, g.contactHeading);
    if (!plant || !finite(derived) || Math.hypot(plant.x - a.home.x, plant.z - a.home.z) > 12 + EPS ||
        distance(g.contactPosition, derived) > EPS ||
        !oceanTurtleGrazingPositionValid({ ...a, position: g.contactPosition, heading: g.contactHeading }, generator, context(region, surface, grass)) ||
        !oldValid(a, g.entryPosition, generator, region, surface, grass) ||
        !oldValid(a, g.liftPosition, generator, region, surface, grass) ||
        !oldValid(a, g.approachPosition, generator, region, surface, grass) ||
        !oldValid(a, g.exitPosition, generator, region, surface, grass) ||
        g.liftPosition.x !== g.entryPosition.x || g.liftPosition.z !== g.entryPosition.z ||
        g.liftPosition.y !== g.approachPosition.y || g.liftPosition.y < g.entryPosition.y ||
        g.approachPosition.x !== g.contactPosition.x || g.approachPosition.z !== g.contactPosition.z ||
        g.approachPosition.y < g.contactPosition.y ||
        !segmentValid(g.entryPosition, g.liftPosition, p => oldValid(a, p, generator, region, surface, grass)) ||
        !segmentValid(g.liftPosition, g.approachPosition, p => oldValid(a, p, generator, region, surface, grass))) return false;
    if (g.phase === 'lifting' && !onSegment(a.position, g.entryPosition, g.liftPosition) ||
        g.phase === 'approaching' && !onSegment(a.position, g.liftPosition, g.approachPosition) ||
        g.phase === 'aligning' && distance(a.position, g.approachPosition) > EPS ||
        g.phase === 'descending' && (!onSegment(a.position, g.approachPosition, g.contactPosition) || Math.abs(angle(a.heading - g.contactHeading)) > EPS) ||
        g.phase === 'ascending' && (a.position.x !== g.exitPosition.x || a.position.z !== g.exitPosition.z || a.position.y > g.exitPosition.y + EPS)) return false;
    if (g.phase === 'grazing' && (g.biteUntilSec !== g.phaseSinceSec + 12 ||
        distance(a.position, g.contactPosition) > EPS || Math.abs(angle(a.heading - g.contactHeading)) > EPS ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > EPS ||
        (a.alive && (region.timeSec >= a.nextBreathAtSec || !oceanTurtleGrazingContact(a, plant, generator, context(region, surface, grass)))))) return false;
    if (['lifting', 'approaching', 'aligning', 'descending'].includes(g.phase) && g.biteUntilSec !== null) return false;
  }
  return true;
}

function beginExit(agent, generator, region, surface, grass) {
  agent.grazing.exitPosition = { ...agent.position, y: Math.max(agent.position.y, oldHeight(generator, agent.position, agent, surface, grass)) };
  setPhase(agent, 'ascending', region.timeSec);
}
function move(agent, target, heading, generator, region, surface, grass, dt) {
  const previous = { ...agent.position }, oldHeading = agent.heading;
  const turn = Math.max(-.7 * dt, Math.min(.7 * dt, angle(heading - oldHeading))), nextHeading = oldHeading + turn;
  if (![.25, .5, .75, 1].every(t => oceanTurtleGrazingPositionValid({ ...agent, heading: oldHeading + turn * t }, generator, context(region, surface, grass)))) return false;
  agent.heading = nextHeading;
  if (Math.abs(angle(heading - nextHeading)) <= EPS) {
    const length = distance(previous, target), candidate = length <= .22 * dt ? { ...target } : lerp(previous, target, .22 * dt / length);
    if (![.25, .5, .75, 1].every(t => oceanTurtleGrazingPositionValid({ ...agent, position: lerp(previous, candidate, t) }, generator, context(region, surface, grass)))) {
      agent.heading = oldHeading; return false;
    }
    agent.position = candidate;
  }
  agent.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (agent.position[k] - previous[k]) / dt]));
  return true;
}

/** True means this finite optional controller used this step; false delegates
 * to the unchanged patrol/breath controller. Unloaded owners receive no tick. */
export function tickOceanTurtleGrazing(region, generator, { surface, stepSec = .1, consumeSeagrass } = {}) {
  if (region.turtleGrazingVersion !== 1 || typeof surface !== 'function' || typeof consumeSeagrass !== 'function' ||
      !Number.isFinite(stepSec) || stepSec <= 0 || stepSec > .1) return false;
  const agent = region.turtleAgents?.[0], g = agent?.grazing;
  if (!agent?.alive || g?.version !== 1 || agent.state !== 'seagrass-cruising') return false;
  const grass = allGrass(generator, region);
  if (region.timeSec >= agent.nextBreathAtSec) {
    if (g.phase === 'idle') return false;
    if (oldValid(agent, agent.position, generator, region, surface, grass)) { clearRoute(agent, region.timeSec); return false; }
    if (g.phase !== 'ascending') beginExit(agent, generator, region, surface, grass);
  }
  if (g.phase === 'idle') {
    if (region.timeSec < g.nextAttemptAtSec) return false;
    const route = chooseRoute(agent, region, generator, surface, grass);
    if (!route) { g.nextAttemptAtSec = region.timeSec + 20; return false; }
    Object.assign(g, route, { startedAtSec: region.timeSec });
    agent.pitch = 0; setPhase(agent, 'lifting', region.timeSec);
  }
  agent.timeSec = region.timeSec; agent.pitch = 0;
  if (g.phase === 'grazing') {
    agent.velocity = { x: 0, y: 0, z: 0 };
    const plant = ownGrass(generator, region).find(p => p.id === g.sourceGrassId);
    if (region.timeSec >= g.biteUntilSec || !oceanTurtleGrazingContact(agent, plant, generator, context(region, surface, grass))) beginExit(agent, generator, region, surface, grass);
    else if (region.timeSec >= g.nextBiteAtSec) {
      const taken = consumeSeagrass(agent, plant.id, .0005);
      if (!Number.isFinite(taken) || taken < 0 || taken > .0005 + 1e-12) throw new Error('Invalid actual turtle seagrass debit.');
      g.nextBiteAtSec = region.timeSec + 2.5;
      if (taken > 0) { g.consumedUnits += taken; g.biteCount++; g.lastConsumedAtSec = region.timeSec; }
      else beginExit(agent, generator, region, surface, grass);
    }
    return true;
  }
  let target, heading = agent.heading;
  if (g.phase === 'lifting') target = g.liftPosition;
  else if (g.phase === 'approaching') { target = g.approachPosition; heading = Math.atan2(target.z - agent.position.z, target.x - agent.position.x); }
  else if (g.phase === 'aligning') { target = g.approachPosition; heading = g.contactHeading; }
  else if (g.phase === 'descending') { target = g.contactPosition; heading = g.contactHeading; }
  else target = g.exitPosition;
  if (!move(agent, target, heading, generator, region, surface, grass, stepSec)) {
    agent.velocity = { x: 0, y: 0, z: 0 }; beginExit(agent, generator, region, surface, grass); return true;
  }
  if (distance(agent.position, target) <= EPS && Math.abs(angle(agent.heading - heading)) <= EPS) {
    if (g.phase === 'lifting') setPhase(agent, 'approaching', region.timeSec);
    else if (g.phase === 'approaching') setPhase(agent, 'aligning', region.timeSec);
    else if (g.phase === 'aligning') setPhase(agent, 'descending', region.timeSec);
    else if (g.phase === 'descending') { setPhase(agent, 'grazing', region.timeSec); g.biteUntilSec = region.timeSec + 12;
      g.nextBiteAtSec = region.timeSec + .5; agent.velocity = { x: 0, y: 0, z: 0 }; }
    else if (g.phase === 'ascending') clearRoute(agent, region.timeSec);
  }
  return true;
}
