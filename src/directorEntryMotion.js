import { isDirectorPlaybackRate } from './directorCameraMotion.js';

const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const copy = value => ({ x: value.x, y: value.y, z: value.z });
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;
const owner = p => `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
function look(position, target) {
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!(distance > 1e-6) || !Number.isFinite(distance)) throw new RangeError('Entry needs a nonzero finite look direction.');
  return { yaw: Math.atan2(dz, dx), pitch: Math.atan2(dy, Math.hypot(dx, dz)), distance };
}

/** A bounded bridge between already resident observation poses. No source
 * queries, population creation or loading are performed by this helper. */
export function createDirectorEntryMotion({ position, target, destination, loadedOwnerIds,
  safeHeight, ceilingHeight, clearanceM = .25 } = {}) {
  if (!point(position) || !point(target) || !point(destination?.position) || !point(destination?.target) ||
      typeof safeHeight !== 'function' || typeof ceilingHeight !== 'function' ||
      !Array.isArray(loadedOwnerIds) || loadedOwnerIds.length > 9 ||
      !Number.isFinite(clearanceM) || clearanceM < .04) throw new TypeError('Entry needs finite poses and resident support.');
  const length = Math.hypot(...['x', 'y', 'z'].map(key => destination.position[key] - position[key]));
  if (!Number.isFinite(length) || length > 32) throw new RangeError('Entry bridge exceeds 32 metres.');
  const loaded = new Set(loadedOwnerIds);
  if (loaded.size !== loadedOwnerIds.length || [...loaded].some(id => {
    if (typeof id !== 'string') return true;
    const [cx, cz, extra] = id.split(',').map(Number);
    return extra !== undefined || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || `${cx},${cz}` !== id;
  })) throw new TypeError('Entry has malformed resident owners.');
  const startLook = look(position, target), endLook = look(destination.position, destination.target);
  const yawDelta = Math.atan2(Math.sin(endLook.yaw - startLook.yaw), Math.cos(endLook.yaw - startLook.yaw));
  const steps = Math.max(1, Math.ceil(length / .5)), owners = new Set();
  for (let i = 0; i <= steps; i++) {
    const p = Object.fromEntries(['x', 'y', 'z'].map(key => [key, mix(position[key], destination.position[key], i / steps)]));
    const id = owner(p); owners.add(id);
    const floor = safeHeight(p.x, p.z), ceiling = ceilingHeight(p.x, p.z);
    if (!loaded.has(id) || !Number.isFinite(floor) || !Number.isFinite(ceiling) ||
        p.y < floor + clearanceM - 1e-7 || p.y > ceiling + 1e-7) throw new RangeError('Entry path is not resident or has insufficient water clearance.');
  }
  return Object.freeze({ position: Object.freeze(copy(position)), target: Object.freeze(copy(target)),
    destination: Object.freeze({ position: Object.freeze(copy(destination.position)), target: Object.freeze(copy(destination.target)) }),
    startLook: Object.freeze(startLook), endLook: Object.freeze(endLook), yawDelta,
    durationSec: Math.max(1.2, length / 2, Math.abs(yawDelta) / .5, Math.abs(endLook.pitch - startLook.pitch) / .5),
    distanceM: length, clearanceM, ownerIds: Object.freeze([...owners]), sampleSpacingM: .5,
    coordinateSpace: 'absolute-world-metres' });
}

export function sampleDirectorEntryMotion(motion, elapsedSec) {
  if (!motion || !Number.isFinite(elapsedSec) || !(motion.durationSec > 0)) throw new TypeError('Entry sampling needs a finite motion clock.');
  const u = clamp(elapsedSec / motion.durationSec, 0, 1), t = smooth(u);
  const position = Object.fromEntries(['x', 'y', 'z'].map(key => [key, mix(motion.position[key], motion.destination.position[key], t)]));
  // Interpolate heading and pitch, rather than world targets. Opposing views
  // keep a positive look distance and turn through a finite shortest yaw.
  const yaw = motion.startLook.yaw + motion.yawDelta * t;
  const pitch = mix(motion.startLook.pitch, motion.endLook.pitch, t);
  const distance = mix(motion.startLook.distance, motion.endLook.distance, t);
  const target = u === 0 ? copy(motion.target) : u === 1 ? copy(motion.destination.target) : {
    x: position.x + Math.cos(pitch) * Math.cos(yaw) * distance,
    y: position.y + Math.sin(pitch) * distance,
    z: position.z + Math.cos(pitch) * Math.sin(yaw) * distance,
  };
  if (!point(position) || !point(target)) throw new TypeError('Entry path left finite coordinates.');
  return { position, target, elapsedSec: clamp(elapsedSec, 0, motion.durationSec), complete: u === 1 };
}

export function advanceDirectorEntryElapsed(elapsedSec, durationSec, dt, { playing = true, hidden = false, playbackRate = 1 } = {}) {
  if (!playing || hidden || !Number.isFinite(dt) || dt <= 0 || !isDirectorPlaybackRate(playbackRate)) return elapsedSec;
  return Math.min(durationSec, elapsedSec + dt * playbackRate);
}
