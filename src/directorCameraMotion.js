const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const point = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
const copy = value => ({ x: value.x, y: value.y, z: value.z });
const mix = (a, b, t) => a + (b - a) * t;

/** A finite local observation shot in absolute metres, independent of any
 * renderer origin. It never stands for travel between distant route stops. */
export function createDirectorCameraMotion({ position, target, durationSec = 12, kind = 'walk', distanceM,
  floorY = 0, focusPosition = null, focusTarget = null, clearanceM = .25 } = {}) {
  if (!point(position) || !point(target) || !Number.isFinite(floorY)) throw new TypeError('Director shot needs finite world coordinates.');
  if (!['walk', 'orbit', 'follow'].includes(kind)) throw new RangeError('Unknown director camera motion.');
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 60) throw new RangeError('Director shot must have a finite duration of at most 60 seconds.');
  const distance = distanceM ?? (kind === 'walk' ? 12 : kind === 'orbit' ? 3 : 1.6);
  if (!Number.isFinite(distance) || distance <= 0 || distance > 18 || !Number.isFinite(clearanceM) || clearanceM <= 0) throw new RangeError('Invalid director camera distance or clearance.');
  const dx = target.x - position.x, dz = target.z - position.z;
  const heading = Math.hypot(dx, dz) > .001 ? Math.atan2(dz, dx) : -Math.PI / 2;
  return Object.freeze({ position: Object.freeze(copy(position)), target: Object.freeze(copy(target)),
    focusPosition: Object.freeze(copy(point(focusPosition) ? focusPosition : position)),
    focusTarget: Object.freeze(copy(point(focusTarget) ? focusTarget : target)),
    kind, durationSec, distanceM: distance, floorY, clearanceM, heading });
}

export function advanceDirectorCameraElapsed(elapsedSec, durationSec, dtSec, { paused = false, hidden = false } = {}) {
  if (paused || hidden || !Number.isFinite(dtSec) || dtSec <= 0) return elapsedSec;
  return Math.min(durationSec, elapsedSec + dtSec);
}

export function sampleDirectorCameraMotion(shot, elapsedSec, { floorHeight = () => shot.floorY,
  safeHeight = floorHeight, surfaceY, ceilingHeight = null, layerHeight = null, trackingTarget = null } = {}) {
  if (!Number.isFinite(elapsedSec) || !Number.isFinite(surfaceY)) throw new TypeError('Director sampling needs finite elapsed time and water surface.');
  const u = clamp(elapsedSec / shot.durationSec, 0, 1), progress = smooth(u);
  let position, target;
  if (shot.kind === 'walk') {
    const turn = .34, angle = shot.heading + turn * progress, radius = shot.distanceM / turn;
    position = { x: shot.position.x + radius * (Math.sin(angle) - Math.sin(shot.heading)), y: shot.position.y,
      z: shot.position.z - radius * (Math.cos(angle) - Math.cos(shot.heading)) };
    const ahead = mix(Math.max(.5, Math.hypot(shot.target.x - shot.position.x, shot.target.z - shot.position.z)), 8, progress);
    target = { x: position.x + Math.cos(angle) * ahead, y: position.y + shot.target.y - shot.position.y,
      z: position.z + Math.sin(angle) * ahead };
  } else {
    const following = shot.kind === 'follow', centre = following && point(trackingTarget) ? trackingTarget : shot.focusTarget;
    const anchor = following ? shot.focusPosition : shot.position;
    const dx = anchor.x - shot.focusTarget.x, dz = anchor.z - shot.focusTarget.z;
    const radius = Math.max(.3, Math.hypot(dx, dz)), angle = Math.min(.45, shot.distanceM / radius) * progress;
    const goal = { x: centre.x + dx * Math.cos(angle) - dz * Math.sin(angle),
      y: anchor.y, z: centre.z + dx * Math.sin(angle) + dz * Math.cos(angle) };
    const blend = following ? smooth(u / .35) : 1;
    position = { x: mix(shot.position.x, goal.x, blend), y: mix(shot.position.y, goal.y, blend),
      z: mix(shot.position.z, goal.z, blend) };
    target = { x: mix(shot.target.x, centre.x, blend), y: mix(shot.target.y, centre.y, blend),
      z: mix(shot.target.z, centre.z, blend) };
  }
  const floor = floorHeight(position.x, position.z), solid = safeHeight(position.x, position.z);
  const ceiling = Math.min(surfaceY - .5, ceilingHeight ? ceilingHeight(position.x, position.z) : surfaceY - .5);
  if (![floor, solid, ceiling].every(Number.isFinite)) throw new TypeError('Director terrain query returned a nonfinite height.');
  const lower = Math.max(floor, solid) + shot.clearanceM;
  if (lower > ceiling) throw new RangeError('当前前进路径没有足够的安全水层净空。');
  let desiredY = position.y + (floor - shot.floorY);
  if (layerHeight) {
    const layerY = layerHeight(position.x, position.z);
    if (!Number.isFinite(layerY)) throw new TypeError('Director layer query returned a nonfinite height.');
    desiredY = mix(desiredY, layerY, progress);
  }
  const previousY = position.y;
  position.y = clamp(desiredY, lower, ceiling);
  if (shot.kind !== 'follow') target.y += position.y - previousY;
  if (!point(position) || !point(target)) throw new TypeError('Director camera path left finite world coordinates.');
  return { position, target, elapsedSec: clamp(elapsedSec, 0, shot.durationSec), complete: u === 1 };
}
