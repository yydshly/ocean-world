// A moving observation of the committed whole habitat, in absolute metres.
// This path never generates scenery or advances an unloaded region's ecology.
const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const copy = p => ({ x: p.x, y: p.y, z: p.z });
const mix = (a, b, t) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, a[k] + (b[k] - a[k]) * t]));

export function createCoastalSeascapeMotion(plan, { durationSec = 200 } = {}) {
  const path = plan?.group?.routePath;
  if (plan?.version !== 7 || plan.theme !== 'living-coastal-seascape' || !Array.isArray(path) || path.length < 2 ||
      !path.every(point) || !Number.isFinite(durationSec) || durationSec < 120 || durationSec > 300)
    throw new TypeError('连续生活带尚未提交完整的观察路径。');
  const points = path.map(p => Object.freeze(copy(p))), distances = [0];
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(...['x', 'y', 'z'].map(k => points[i][k] - points[i - 1][k]));
    if (!(length > 0) || length > 8) throw new RangeError('生活带路径需要连续的实际采样点。');
    distances.push(distances.at(-1) + length);
  }
  const distanceM = distances.at(-1);
  if (distanceM < 300 || distanceM > 500) throw new RangeError('生活带实际路线应为300–500米。');
  return Object.freeze({ kind: 'coastal-route', durationSec, distanceM, groupId: plan.group.id,
    ownerIds: Object.freeze([...plan.group.ownerIds]), points: Object.freeze(points), distances: Object.freeze(distances) });
}

function atDistance(shot, distance) {
  const d = Math.max(0, Math.min(shot.distanceM, distance));
  let lo = 0, hi = shot.distances.length - 1;
  while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (shot.distances[mid] <= d) lo = mid; else hi = mid; }
  return mix(shot.points[lo], shot.points[hi], (d - shot.distances[lo]) / (shot.distances[hi] - shot.distances[lo]));
}

export function sampleCoastalSeascapeMotion(shot, elapsedSec) {
  if (!Number.isFinite(elapsedSec)) throw new TypeError('观察时钟必须有限。');
  const t = Math.max(0, Math.min(shot.durationSec, elapsedSec)), d = shot.distanceM * t / shot.durationSec;
  const position = atDistance(shot, d), ahead = atDistance(shot, Math.min(shot.distanceM, d + 6));
  const behind = atDistance(shot, Math.max(0, d - 6));
  const dx = ahead.x - behind.x, dz = ahead.z - behind.z, length = Math.hypot(dx, dz);
  if (!(length > .01)) throw new RangeError('观察路径没有可用前进方向。');
  return { position, target: { x: position.x + dx / length * 8, y: position.y - .65, z: position.z + dz / length * 8 },
    elapsedSec: t, complete: t === shot.durationSec };
}

// Test the current camera window. It may cross into the next already-resident
// owner once; then ordinary navigation loads that centre's nine owners while
// the camera and its observation clock wait in place.
export function coastalSeascapeWindowReady(position, { loadedOwnerIds = [], activeOwnerIds = [] } = {}) {
  if (!point(position)) return false;
  const loaded = new Set(loadedOwnerIds), active = new Set(activeOwnerIds), cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const id = `${cx + dx},${cz + dz}`; if (!loaded.has(id) || !active.has(id)) return false;
  }
  return true;
}
