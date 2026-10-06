import { OCEAN_SURFACE_Y, OCEAN_CHUNK_SIZE, OCEAN_AUTHORED_RADIUS } from './oceanGeneration.js';
import { validateOceanTurtleGrazingRecord } from './oceanTurtleGrazing.js';

export const OCEAN_TURTLE_COMMUNITY_VERSION = 1;
export const OCEAN_TURTLE_MODEL = Object.freeze({ speedMps: .22, turnRateRadps: .7,
  horizontalRadiusFactor: .64, verticalHalfExtentFactor: .25, clearanceM: .25,
  ownerMarginM: 2, nostrilHeightFactor: .055, breathDurationSec: 8 });
const TAU = Math.PI * 2, SPECIES = 'green-turtle';
const finite = p => p && ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerp = (a, b, t) => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, a[axis] + (b[axis] - a[axis]) * t]));
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}
function owns(point, cx, cz, generator) {
  const margin = OCEAN_TURTLE_MODEL.ownerMarginM;
  return finite(point) && point.x >= cx * OCEAN_CHUNK_SIZE + margin && point.x <= (cx + 1) * OCEAN_CHUNK_SIZE - margin &&
    point.z >= cz * OCEAN_CHUNK_SIZE + margin && point.z <= (cz + 1) * OCEAN_CHUNK_SIZE - margin &&
    (generator?.profile === 'living-shallows-v1' || Math.hypot(point.x, point.z) > OCEAN_AUTHORED_RADIUS + 2);
}
function grasses(generator, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    rows.push(...generator.chunk(cx + dx, cz + dz).elements.filter(e => e.kind === 'seagrass'));
  return rows;
}
function topAt(generator, point, sizeM, surface, grass) {
  const radius = sizeM * OCEAN_TURTLE_MODEL.horizontalRadiusFactor + .12;
  let top = -Infinity;
  for (let i = 0; i < 9; i++) {
    const a = (i - 1) * TAU / 8, r = i ? radius : 0;
    const y = surface(point.x + Math.cos(a) * r, point.z + Math.sin(a) * r);
    if (!Number.isFinite(y)) return NaN;
    top = Math.max(top, y);
  }
  // Rooted scenery has no food stock. Its complete finite crown, including
  // display sway, is only a clearance reference for this swimming body.
  for (const plant of grass) if (Math.hypot(plant.x - point.x, plant.z - point.z) <= radius + Math.max(plant.scale.x, plant.scale.z) * .65)
    top = Math.max(top, plant.y + plant.scale.y * 1.02);
  return top;
}
function phaseValid(a) {
  if (!a.alive) return a.state === 'dead';
  if (a.state === 'dead' || Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > OCEAN_TURTLE_MODEL.speedMps + 1e-8) return false;
  if ((a.breathCount === 0) !== (a.lastBreathAtSec === null)) return false;
  if (a.state === 'seagrass-cruising') return a.diveTarget === null && a.breathHoldUntilSec === null &&
    distance(a.target, a.patrolWaypoints[a.patrolIndex]) <= 1e-8;
  if (!finite(a.diveTarget) || Math.hypot(a.position.x - a.diveTarget.x, a.position.z - a.diveTarget.z) > 1e-8 || a.pitch !== 0) return false;
  if (a.state === 'diving') return distance(a.target, a.diveTarget) <= 1e-8 && a.lastBreathAtSec !== null &&
    a.breathHoldUntilSec === a.lastBreathAtSec + OCEAN_TURTLE_MODEL.breathDurationSec && a.timeSec >= a.breathHoldUntilSec - 1e-8;
  const surfaceTarget = { ...a.diveTarget, y: OCEAN_SURFACE_Y - a.sizeM * OCEAN_TURTLE_MODEL.nostrilHeightFactor };
  if (distance(a.target, surfaceTarget) > 1e-8) return false;
  if (a.state === 'surfacing') return a.breathHoldUntilSec === null;
  return a.state === 'breathing' && distance(a.position, surfaceTarget) <= 1e-8 && a.lastBreathAtSec !== null &&
    a.lastBreathAtSec === a.stateSince && a.breathHoldUntilSec === a.lastBreathAtSec + OCEAN_TURTLE_MODEL.breathDurationSec &&
    a.timeSec <= a.breathHoldUntilSec + .1 + 1e-8 && Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) <= 1e-8;
}

/** Nine actual solid probes plus finite grass crowns. A conservative whole
 * body/flipper envelope, not deforming vegetation collision or buoyancy. */
export function oceanTurtlePositionValid(generator, position, sizeM, { cx, cz, surface, allowSurface = false, grass } = {}) {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || !owns(position, cx, cz, generator) ||
      typeof surface !== 'function' || !Number.isFinite(sizeM) || sizeM < 1.25 || sizeM > 1.5) return false;
  const half = sizeM * OCEAN_TURTLE_MODEL.verticalHalfExtentFactor;
  const top = topAt(generator, position, sizeM, surface, grass ?? grasses(generator, cx, cz));
  const high = allowSurface ? OCEAN_SURFACE_Y - OCEAN_TURTLE_MODEL.nostrilHeightFactor * sizeM : OCEAN_SURFACE_Y - half - .15;
  return Number.isFinite(top) && position.y - half >= top + OCEAN_TURTLE_MODEL.clearanceM - 1e-9 && position.y <= high + 1e-9;
}

/** One seed-derived representative near real grass roots. The complete local
 * route and vertical breathing columns remain inside its geographic owner. */
export function createOceanTurtlePlan(generator, region, { seed = generator.seed, surface, capacity = 1 } = {}) {
  const none = { version: OCEAN_TURTLE_COMMUNITY_VERSION, placements: [] };
  if (capacity < 1 || typeof surface !== 'function') return none;
  const chunk = generator.chunk(region.cx, region.cz), random = salt => hash(`${typeof seed}:${seed}|ocean-turtle-v1|${region.id}|${salt}`);
  if (random('present') >= .58) return none;
  const grass = grasses(generator, region.cx, region.cz), sizeM = 1.25 + random('size') * .25;
  const candidates = chunk.elements.filter(e => e.kind === 'seagrass').sort((a, b) => random(a.id) - random(b.id) || a.id.localeCompare(b.id));
  for (const plant of candidates.slice(0, 24)) {
    const centre = { x: plant.x, y: plant.y, z: plant.z }, radius = 3.4 + random(`radius:${plant.id}`) * 1.4;
    const neighbours = grass.filter(e => Math.hypot(e.x - centre.x, e.z - centre.z) <= 9);
    if (neighbours.length < 6) continue;
    const phase = random(`phase:${plant.id}`) * TAU;
    const waypoints = Array.from({ length: 16 }, (_, i) => {
      const a = phase + i * TAU / 16, p = { x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius };
      return { ...p, y: topAt(generator, p, sizeM, surface, grass) + sizeM * .25 + .45 };
    });
    const context = { cx: region.cx, cz: region.cz, surface, grass };
    if (!waypoints.every(p => {
      const bed = generator.floorSurface(p.x, p.z).height, depth = OCEAN_SURFACE_Y - bed;
      return depth >= 3 && depth <= 18 && surface(p.x, p.z) - bed < .15 &&
        oceanTurtlePositionValid(generator, p, sizeM, context);
    })) continue;
    let valid = true;
    for (let i = 0; valid && i < waypoints.length; i++) {
      const a = waypoints[i], b = waypoints[(i + 1) % waypoints.length], count = Math.ceil(distance(a, b) / .25);
      for (let j = 1; j < count; j++) if (!oceanTurtlePositionValid(generator, lerp(a, b, j / count), sizeM, context)) { valid = false; break; }
    }
    if (!valid) continue;
    const timeSec = region.timeSec, position = { ...waypoints[0] };
    return { version: OCEAN_TURTLE_COMMUNITY_VERSION, placements: [{
      id: `ocean-turtle:${region.id}:${SPECIES}:0`, speciesId: SPECIES, regionId: region.id, birthRegionId: region.id,
      position, home: { ...position }, target: { ...waypoints[1] }, velocity: { x: 0, y: 0, z: 0 },
      heading: Math.atan2(waypoints[1].z - position.z, waypoints[1].x - position.x), pitch: 0, sizeM, alive: true,
      state: 'seagrass-cruising', createdAtSec: timeSec, stateSince: timeSec, timeSec,
      sourceGrassId: plant.id, sourceGrassIds: neighbours.map(e => e.id).sort(), patrolWaypoints: waypoints, patrolIndex: 1,
      nextBreathAtSec: timeSec + 120 + random('breath-interval') * 60, breathIntervalSec: 120 + random('breath-interval') * 60,
      breathCount: 0, breathHoldUntilSec: null, lastBreathAtSec: null, diveTarget: null,
      habitat: 'seagrass-water-column', modelScope: 'local-patrol-and-breathing-display; oxygen-feeding-metabolism-reproduction-not-modeled',
    }] };
  }
  return none;
}

export function validateOceanTurtleRecord(record, generator, { surface } = {}) {
  if (!validateOceanTurtleGrazingRecord(record, generator, { surface })) return false;
  if (record.turtleCommunityVersion === undefined && record.turtleInitializedAtSec === undefined && record.turtleAgents === undefined) return true;
  if (record.turtleCommunityVersion !== 1 || !Array.isArray(record.turtleAgents) || record.turtleAgents.length > 1 ||
      !Number.isSafeInteger(record.cx) || !Number.isSafeInteger(record.cz) || record.id !== `${record.cx},${record.cz}` ||
      !Number.isFinite(record.timeSec) || record.timeSec < 0 || !Array.isArray(record.agents) ||
      !Number.isFinite(record.turtleInitializedAtSec) || record.turtleInitializedAtSec < 0 || record.turtleInitializedAtSec > record.timeSec ||
      record.agents.length + record.turtleAgents.length > 20) return false;
  const cx = record.cx, cz = record.cz, grass = grasses(generator, cx, cz), ids = new Set(record.agents.map(a => a.id));
  for (const a of record.turtleAgents) {
    if (!a || a.id !== `ocean-turtle:${record.id}:${SPECIES}:0` || ids.has(a.id) || a.speciesId !== SPECIES ||
        a.regionId !== record.id || a.birthRegionId !== record.id || typeof a.alive !== 'boolean' ||
        !['position', 'home', 'target', 'velocity'].every(key => finite(a[key])) || !owns(a.home, cx, cz, generator) || !owns(a.target, cx, cz, generator) ||
        !Number.isFinite(a.sizeM) || a.sizeM < 1.25 || a.sizeM > 1.5 || !Number.isFinite(a.heading) || !Number.isFinite(a.pitch) || Math.abs(a.pitch) > .15 ||
        !['seagrass-cruising', 'surfacing', 'breathing', 'diving', 'dead'].includes(a.state) || (!a.alive && a.state !== 'dead') ||
        !['createdAtSec', 'stateSince', 'timeSec', 'nextBreathAtSec', 'breathIntervalSec'].every(k => Number.isFinite(a[k]) && a[k] >= 0) ||
        a.createdAtSec < record.turtleInitializedAtSec || a.createdAtSec > record.timeSec || a.stateSince > record.timeSec || a.timeSec > record.timeSec ||
        a.breathIntervalSec < 120 || a.breathIntervalSec > 180 || !Number.isInteger(a.breathCount) || a.breathCount < 0 ||
        ![a.breathHoldUntilSec, a.lastBreathAtSec].every(t => t === null || Number.isFinite(t) && t >= 0) ||
        (a.lastBreathAtSec !== null && a.lastBreathAtSec > record.timeSec) ||
        !Array.isArray(a.sourceGrassIds) || a.sourceGrassIds.length < 6 || !a.sourceGrassIds.includes(a.sourceGrassId) ||
        !generator.chunk(cx, cz).elements.some(e => e.kind === 'seagrass' && e.id === a.sourceGrassId) ||
        a.sourceGrassIds.some(id => !grass.some(e => e.id === id)) || new Set(a.sourceGrassIds).size !== a.sourceGrassIds.length ||
        !Array.isArray(a.patrolWaypoints) || a.patrolWaypoints.length !== 16 || !Number.isInteger(a.patrolIndex) || a.patrolIndex < 0 || a.patrolIndex >= 16 ||
        !a.patrolWaypoints.every(p => oceanTurtlePositionValid(generator, p, a.sizeM, { cx, cz, surface, grass })) ||
        !oceanTurtlePositionValid(generator, a.home, a.sizeM, { cx, cz, surface, grass }) ||
        (!(a.grazing?.version === 1 && a.grazing.phase !== 'idle') && !oceanTurtlePositionValid(generator, a.position, a.sizeM, { cx, cz, surface, grass, allowSurface: a.state !== 'seagrass-cruising' })) ||
        (a.diveTarget !== null && !oceanTurtlePositionValid(generator, a.diveTarget, a.sizeM, { cx, cz, surface, grass })) ||
        (a.alive && ['surfacing', 'breathing', 'diving'].includes(a.state) && !finite(a.diveTarget)) ||
        !phaseValid(a) || Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > OCEAN_TURTLE_MODEL.speedMps + 1e-8) return false;
  }
  return true;
}

/** Local display controller. Unloaded owners do not get elapsed wall time or
 * offscreen oxygen simulation. Surface breathing is a nominal-water reference. */
export function tickOceanTurtles(region, generator, { surface, stepSec = .1 } = {}) {
  if (!Number.isFinite(stepSec) || stepSec <= 0 || stepSec > .1 || typeof surface !== 'function') return;
  const grass = grasses(generator, region.cx, region.cz), context = { cx: region.cx, cz: region.cz, surface, grass, allowSurface: true };
  for (const a of region.turtleAgents ?? []) {
    if (!a.alive) continue;
    a.timeSec = region.timeSec;
    const state = next => { if (a.state !== next) { a.state = next; a.stateSince = region.timeSec; } };
    if (a.state === 'seagrass-cruising' && region.timeSec >= a.nextBreathAtSec) {
      a.diveTarget = { ...a.position }; a.target = { ...a.position, y: OCEAN_SURFACE_Y - a.sizeM * .055 }; state('surfacing');
    }
    if (a.state === 'breathing') {
      a.velocity = { x: 0, y: 0, z: 0 }; a.pitch = 0;
      if (region.timeSec < a.breathHoldUntilSec) continue;
      a.target = { ...a.diveTarget }; state('diving');
    }
    if (distance(a.position, a.target) <= 1e-8) {
      if (a.state === 'surfacing') {
        state('breathing'); a.breathCount++; a.lastBreathAtSec = region.timeSec;
        a.breathHoldUntilSec = region.timeSec + OCEAN_TURTLE_MODEL.breathDurationSec;
        a.velocity = { x: 0, y: 0, z: 0 }; a.pitch = 0; continue;
      }
      if (a.state === 'diving') {
        state('seagrass-cruising'); a.nextBreathAtSec = region.timeSec + a.breathIntervalSec;
        a.breathHoldUntilSec = null; a.diveTarget = null;
      } else a.patrolIndex = (a.patrolIndex + 1) % a.patrolWaypoints.length;
      a.target = { ...a.patrolWaypoints[a.patrolIndex] };
    }
    const delta = { x: a.target.x - a.position.x, y: a.target.y - a.position.y, z: a.target.z - a.position.z };
    const length = Math.hypot(delta.x, delta.y, delta.z), horizontal = Math.hypot(delta.x, delta.z);
    const desired = horizontal > 1e-9 ? Math.atan2(delta.z, delta.x) : a.heading;
    a.heading += Math.max(-.7 * stepSec, Math.min(.7 * stepSec, angle(desired - a.heading)));
    const budget = Math.min(length, OCEAN_TURTLE_MODEL.speedMps * stepSec), previous = { ...a.position };
    let candidate = null;
    for (const fraction of [1, .5, .25, .125]) {
      const advance = budget * fraction, h = length ? advance * horizontal / length : 0;
      const next = length <= advance + 1e-12 ? { ...a.target } : {
        x: previous.x + Math.cos(a.heading) * h, y: previous.y + advance * delta.y / length,
        z: previous.z + Math.sin(a.heading) * h };
      if ([.25, .5, .75, 1].every(t => oceanTurtlePositionValid(generator, lerp(previous, next, t), a.sizeM, context))) { candidate = next; break; }
    }
    if (candidate) a.position = candidate;
    a.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (a.position[axis] - previous[axis]) / stepSec]));
    // Fixed reference head during the breathing column keeps the nostril pose
    // compatible with the nominal surface. Cruise pitch remains finite.
    a.pitch = a.state === 'seagrass-cruising' ? Math.max(-.15, Math.min(.15, Math.atan2(a.velocity.y, Math.max(.08, Math.hypot(a.velocity.x, a.velocity.z))))) : 0;
  }
}
