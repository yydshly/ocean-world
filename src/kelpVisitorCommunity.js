import { KELP_SURFACE_Y } from './kelpHabitat.js';
import { kelpWaterElements, kelpWaterDynamicClearance } from './kelpWaterCommunity.js';

export const KELP_VISITOR_COMMUNITY_VERSION = 1;
export const KELP_VISITOR_MODEL = Object.freeze({ speedMps: .28, turnRateRadps: .8,
  clearanceM: .25, ownerMarginM: 2, horizontalRadiusFactor: .58,
  verticalHalfExtentFactor: .33, predictionSec: .4, maxVisitorsPerRegion: 1 });
const SIZE = 64, TAU = Math.PI * 2, SPECIES = 'leopard-shark';
const finitePoint = p => p && ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const interpolate = (a, b, t) => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, a[axis] + (b[axis] - a[axis]) * t]));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}
function owns(p, cx, cz) {
  const m = KELP_VISITOR_MODEL.ownerMarginM;
  return finitePoint(p) && p.x >= cx * SIZE + m && p.x <= (cx + 1) * SIZE - m &&
    p.z >= cz * SIZE + m && p.z <= (cz + 1) * SIZE - m && Math.hypot(p.x, p.z) > 42;
}
function supportTop(generator, p, sizeM) {
  const radius = sizeM * KELP_VISITOR_MODEL.horizontalRadiusFactor + .12;
  let maximum = -Infinity;
  for (let index = 0; index < 9; index++) {
    const angle = (index - 1) * TAU / 8, r = index ? radius : 0;
    const y = generator.heightAt(p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r);
    if (!Number.isFinite(y)) return NaN;
    maximum = Math.max(maximum, y);
  }
  return maximum;
}

/** Finite nine-point body support and plant envelopes, including the renderer's
 * maximum .25-radian pitch. These are conservative references, not a complete
 * deforming-leaf collision or hydrodynamic shark model. */
export function kelpVisitorPositionValid(generator, position, sizeM, context = {}) {
  const { cx, cz } = context;
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || !owns(position, cx, cz) ||
      !Number.isFinite(sizeM) || sizeM < 1.2 || sizeM > 1.5) return false;
  const halfHeight = sizeM * KELP_VISITOR_MODEL.verticalHalfExtentFactor, support = supportTop(generator, position, sizeM);
  if (position.y + halfHeight > KELP_SURFACE_Y - .5 ||
      !Number.isFinite(support) || position.y - halfHeight < support + KELP_VISITOR_MODEL.clearanceM) return false;
  const elements = context.elements ?? kelpWaterElements(generator, cx, cz);
  // The shared water helper uses a half-length radius. Enlarging the collision
  // size covers fins, tail yaw and the horizontal projection of fish pitch.
  const collisionSizeM = sizeM * KELP_VISITOR_MODEL.horizontalRadiusFactor * 2;
  return [-halfHeight, 0, halfHeight].every(dy => kelpWaterDynamicClearance(
    { ...position, y: position.y + dy }, collisionSizeM, { ...context, elements }) >= .012);
}

/** A sparse, seed-derived local patrol. Neither the camera nor native RNG,
 * resource stocks or loaded-neighbour clocks participate in allocation. */
export function createKelpVisitorPlan(generator, region, { seed = generator.seed, capacity = 1 } = {}) {
  const random = salt => hash(`${typeof seed}:${seed}|kelp-visitor-v1|${region.id}|${salt}`);
  const none = { version: KELP_VISITOR_COMMUNITY_VERSION, placements: [] };
  if (capacity < 1 || random('present') >= .67) return none;
  const sizeM = 1.2 + random('size') * .3, elements = kelpWaterElements(generator, region.cx, region.cz);
  // Conservative allocation is independent of which neighbours were loaded
  // first and remains clear when those neighbours subsequently unload.
  const context = { cx: region.cx, cz: region.cz, elements, elementContext: () => ({ conservative: true }) };
  for (let attempt = 0; attempt < 16; attempt++) {
    const center = { x: region.cx * SIZE + 15 + random(`x:${attempt}`) * 34,
      z: region.cz * SIZE + 15 + random(`z:${attempt}`) * 34 };
    const radius = 5.5 + random(`radius:${attempt}`) * 2.5, phase = random(`phase:${attempt}`) * TAU;
    const waypoints = Array.from({ length: 16 }, (_, i) => {
      const angle = phase + i * TAU / 16, p = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
      return { ...p, y: supportTop(generator, p, sizeM) + sizeM * KELP_VISITOR_MODEL.verticalHalfExtentFactor + .45 };
    });
    if (!waypoints.every(p => {
      const depth = KELP_SURFACE_Y - generator.heightAt(p.x, p.z);
      return depth >= 4 && depth <= 20 && kelpVisitorPositionValid(generator, p, sizeM, context);
    })) continue;
    let valid = true;
    for (let i = 0; valid && i < waypoints.length; i++) {
      const a = waypoints[i], b = waypoints[(i + 1) % waypoints.length], samples = Math.ceil(distance(a, b) / .3);
      for (let j = 1; j < samples; j++) if (!kelpVisitorPositionValid(generator, interpolate(a, b, j / samples), sizeM, context)) { valid = false; break; }
    }
    if (!valid) continue;
    const timeSec = region.sim.timeSec, position = { ...waypoints[0] };
    return { version: KELP_VISITOR_COMMUNITY_VERSION, placements: [{
      id: `kelp-visitor:${region.id}:${SPECIES}:0`, speciesId: SPECIES, regionId: region.id,
      birthRegionId: region.id, position, home: { ...position }, target: { ...waypoints[1] },
      velocity: { x: 0, y: 0, z: 0 }, heading: Math.atan2(waypoints[1].z - position.z, waypoints[1].x - position.x),
      sizeM, alive: true, state: 'bottom-cruising', createdAtSec: timeSec, stateSince: timeSec, timeSec,
      patrolWaypoints: waypoints, patrolIndex: 1, habitat: 'kelp-edge-open-bottom',
      modelScope: 'local-patrol-only; feeding-metabolism-reproduction-not-modeled',
    }] };
  }
  return none;
}

export function validateKelpVisitorRecord(record, region, generator, existingIds = new Set()) {
  if (record.visitorCommunityVersion === undefined && record.visitorAgents === undefined && record.visitorInitializedAtSec === undefined) return true;
  if (record.visitorCommunityVersion !== KELP_VISITOR_COMMUNITY_VERSION || !Array.isArray(record.visitorAgents) ||
      record.visitorAgents.length > 1 || !Number.isFinite(record.visitorInitializedAtSec) ||
      record.visitorInitializedAtSec < 0 || record.visitorInitializedAtSec > region.sim.timeSec + 1e-8) return false;
  for (const a of record.visitorAgents) {
    if (!a || a.id !== `kelp-visitor:${region.id}:${SPECIES}:0` || existingIds.has(a.id) || a.speciesId !== SPECIES ||
        a.regionId !== region.id || a.birthRegionId !== region.id || typeof a.alive !== 'boolean' ||
        !['position', 'home', 'target', 'velocity'].every(key => finitePoint(a[key])) ||
        !owns(a.position, region.cx, region.cz) || !owns(a.home, region.cx, region.cz) || !owns(a.target, region.cx, region.cz) ||
        !Number.isFinite(a.sizeM) || a.sizeM < 1.2 || a.sizeM > 1.5 || !Number.isFinite(a.heading) ||
        !['createdAtSec', 'stateSince', 'timeSec'].every(key => Number.isFinite(a[key]) && a[key] >= 0 && a[key] <= region.sim.timeSec + 1e-8) ||
        a.createdAtSec !== record.visitorInitializedAtSec || a.stateSince < a.createdAtSec || a.timeSec < a.createdAtSec ||
        (a.alive && a.state !== 'bottom-cruising') ||
        !Number.isInteger(a.patrolIndex) || a.patrolIndex < 0 || a.patrolIndex >= 16 ||
        !Array.isArray(a.patrolWaypoints) || a.patrolWaypoints.length !== 16 ||
        !a.patrolWaypoints.every(p => owns(p, region.cx, region.cz)) ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > KELP_VISITOR_MODEL.speedMps + 1e-8 ||
        a.modelScope !== 'local-patrol-only; feeding-metabolism-reproduction-not-modeled') return false;
    // Dead records retain their historical pose. Moving plant phases can
    // change; only actual static water support is required before publication.
    if (a.alive && !kelpVisitorPositionValid(generator, a.position, a.sizeM, { cx: region.cx, cz: region.cz, elements: [] })) return false;
    existingIds.add(a.id);
  }
  return true;
}

/** Owner-local fixed-step patrol. No offscreen clock, stock, energy, native
 * RNG or food effects. Every actual XYZ displacement has one speed budget. */
export function tickKelpVisitors(region, { generator, dt = .1, contextAt } = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > .1 + 1e-10) throw new RangeError('Visitor movement uses at most one .1s fixed step.');
  const defaultElements = contextAt ? null : kelpWaterElements(generator, region.cx, region.cz);
  const context = (p, seconds = 0) => ({ cx: region.cx, cz: region.cz,
    ...(contextAt?.(p, seconds) ?? { elements: defaultElements, timeSec: region.sim.timeSec + seconds, environment: region.sim.environment }) });
  for (const a of region.visitorAgents ?? []) {
    if (!a.alive) continue;
    const previous = { ...a.position }, budget = dt * KELP_VISITOR_MODEL.speedMps;
    if (distance(previous, a.patrolWaypoints[a.patrolIndex]) < .25) a.patrolIndex = (a.patrolIndex + 1) % a.patrolWaypoints.length;
    a.target = { ...a.patrolWaypoints[a.patrolIndex] };
    const dx = a.target.x - previous.x, dz = a.target.z - previous.z, horizontal = Math.hypot(dx, dz);
    const requestedHeading = horizontal > 1e-8 ? Math.atan2(dz, dx) : a.heading;
    const turn = Math.max(-KELP_VISITOR_MODEL.turnRateRadps * dt, Math.min(KELP_VISITOR_MODEL.turnRateRadps * dt, angleDifference(requestedHeading, a.heading)));
    a.heading += turn;
    const vertical = (a.target.y - previous.y) / Math.max(.25, horizontal), normalization = Math.hypot(1, vertical);
    const travel = Math.min(budget, distance(previous, a.target));
    let accepted = null;
    for (const fraction of [1, .5, .25, .125]) {
      const step = travel * fraction, next = { x: previous.x + Math.cos(a.heading) * step / normalization,
        y: previous.y + vertical * step / normalization, z: previous.z + Math.sin(a.heading) * step / normalization };
      if ([.25, .5, .75, 1].every(t => {
        const p = interpolate(previous, next, t);
        return kelpVisitorPositionValid(generator, p, a.sizeM, context(p));
      }) && [.2, KELP_VISITOR_MODEL.predictionSec].every(seconds => kelpVisitorPositionValid(generator, next, a.sizeM, context(next, seconds)))) {
        accepted = next; break;
      }
    }
    if (accepted) a.position = accepted;
    a.velocity = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (a.position[axis] - previous[axis]) / dt]));
    a.timeSec = region.sim.timeSec;
  }
}
