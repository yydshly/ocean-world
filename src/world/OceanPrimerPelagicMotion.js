import * as THREE from 'three';

// Version 2 is a deterministic, finite observation sequence. This display
// controller does not create, advance or save the persistent ocean ecology.
export const PELAGIC_MOTION_VERSION = 'pelagic-integrated-motion-v2';
export const PELAGIC_STEP = 1 / 30;
const clamp = THREE.MathUtils.clamp, mix = THREE.MathUtils.lerp;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const point = v => ({ x: v.x, y: v.y, z: v.z });
const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const whaleKeys = [
  [0, -20, -8.3, -12], [12, -7, -2.0, -9.8], [17, -.5, -.48, -9],
  [23, 6.5, -.48, -9.4], [35, 21, -7.7, -13], [50, 24, -10, -42],
  [65, 34, -10.5, -54], [80, 51, -9, -58],
];
function whalePath(t, surface) {
  t = clamp(t, 0, 80); let k = 0;
  while (k < whaleKeys.length - 2 && t > whaleKeys[k + 1][0]) k++;
  const a = whaleKeys[k], b = whaleKeys[k + 1], span = b[0] - a[0], u = (t - a[0]) / span;
  const tangent = (index, axis) => {
    if (axis === 2 && (index === 2 || index === 3)) return 0;
    const left = whaleKeys[Math.max(0, index - 1)], right = whaleKeys[Math.min(whaleKeys.length - 1, index + 1)];
    return (right[axis] - left[axis]) / (right[0] - left[0]);
  };
  const p = [1, 2, 3].map(axis => (2 * u ** 3 - 3 * u ** 2 + 1) * a[axis] + (u ** 3 - 2 * u ** 2 + u) * span * tangent(k, axis)
    + (-2 * u ** 3 + 3 * u ** 2) * b[axis] + (u ** 3 - u ** 2) * span * tangent(k + 1, axis));
  // Near the surface the broad body follows the swell partly, rather than
  // being locked to a perfectly flat y=0 plane. Its resulting tangent is used
  // below for the actual body posture; breathing still checks the nose itself.
  if (surface) p[1] += (surface(p[0] + 3.8, p[2], t)?.heightM ?? 0) * .62 * smooth(12, 17, t) * (1 - smooth(23, 29, t));
  return new THREE.Vector3(...p);
}
function whaleVelocity(t, surface) {
  const low = Math.max(0, t - .01), high = Math.min(80, t + .01);
  return whalePath(high, surface).sub(whalePath(low, surface)).divideScalar(high - low || 1);
}
function whaleStroke(t) {
  const glide = smooth(24, 28, t) * (1 - smooth(34, 38, t)) + smooth(53, 57, t) * (1 - smooth(62, 66, t));
  const surfaceRest = smooth(15, 18, t) * (1 - smooth(22, 25, t));
  return clamp(1 - Math.max(glide, surfaceRest * .82), 0, 1);
}
function quaternion(velocity, roll = 0) {
  const yaw = -Math.atan2(velocity.z, velocity.x), pitch = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX'));
  return { quaternion: q.toArray(), heading: yaw, pitch, roll };
}
function leaderPath(t) {
  return new THREE.Vector3(-35 + t * 1.44 + .8 * Math.sin(t * .12), -4.6 + .45 * Math.sin(t * .075), 6.4 + 3.2 * Math.sin(t * .045));
}
const formationA = [[0, 0, 0], [-3.4, -.45, -3.7], [-6.4, .25, 2.7], [-8.8, -1.0, -5.5], [-11, -.25, -.8], [-13.4, -1.15, 4.5]];
const formationB = [[0, .2, 0], [-4.4, -.75, -5.1], [-4.9, -.2, 5.2], [-9.5, -.45, -2.4], [-9.9, -.9, 2.8], [-14.0, -.15, -.3]];
function dolphinStroke(t, i, speed) {
  const glide = smooth(20 + i * .45, 23 + i * .45, t) * (1 - smooth(25 + i * .45, 28 + i * .45, t));
  return (1 - glide) * smooth(.72, 1.22, speed);
}

export function createPelagicMotion() {
  const frames = [], positions = formationA.map(offset => leaderPath(0).add(new THREE.Vector3(...offset))), velocities = positions.map(() => new THREE.Vector3(1.44, 0, .144));
  const phases = formationA.map((_, i) => i * 1.17), whalePhases = [0];
  // The finite follower solve is prepared once in the same fixed order. Seek
  // reads this bounded table; playback frame rate does not change the cohort.
  for (let step = 0; step <= 2400; step++) {
    const t = step * PELAGIC_STEP;
    if (step) {
      const leader = leaderPath(t), leaderVelocity = leaderPath(t + .01).sub(leaderPath(t - .01)).divideScalar(.02);
      const changes = smooth(40, 60, t), nextVelocities = positions.map((position, i) => {
        const offset = formationA[i].map((n, axis) => mix(n, formationB[i][axis], changes));
        const target = leader.clone().add(new THREE.Vector3(...offset));
        const following = target.sub(position).multiplyScalar(.62).add(leaderVelocity);
        for (let j = 0; j < positions.length; j++) if (j !== i) {
          const away = position.clone().sub(positions[j]), distance = away.length();
          if (distance < 4.6 && distance > 1e-6) following.addScaledVector(away, (4.6 - distance) * .55 / distance);
        }
        if (following.length() > 2.1) following.setLength(2.1);
        return velocities[i].clone().lerp(following, 1 - Math.exp(-PELAGIC_STEP * 2.1));
      });
      nextVelocities.forEach((velocity, i) => { velocities[i].copy(velocity); positions[i].addScaledVector(velocity, PELAGIC_STEP); });
    }
    const dolphins = positions.map((position, i) => {
      const speed = velocities[i].length(), stroke = dolphinStroke(t, i, speed);
      // Fish 1993's frequency fit applies only to the observed 1.22–6m/s
      // active-swim range. Slower states fade toward a glide, not an extrapolated
      // regression. This is a reference-informed display, not fluid dynamics.
      const frequency = .47 + .37 * clamp(speed, 1.22, 6);
      if (step) phases[i] += frequency * Math.PI * 2 * stroke * PELAGIC_STEP;
      const turn = step ? clamp((velocities[i].z - frames.at(-1).dolphins[i].velocity.z) / PELAGIC_STEP, -.45, .45) : 0;
      return { position: point(position), velocity: point(velocities[i]), speed, stroke, phase: phases[i], frequency, amplitude: .10 * stroke,
        flukePitch: .26 * stroke, pectoralPitch: -.055 + Math.atan2(velocities[i].y, speed) * .35, pectoralRoll: turn * .16,
        ...quaternion(velocities[i], -turn * .14) };
    });
    if (step) whalePhases.push(whalePhases.at(-1) + (.27 + .075 * smooth(.6, 1.4, whaleVelocity(t).length())) * Math.PI * 2 * whaleStroke(t) * PELAGIC_STEP);
    frames.push({ dolphins });
  }
  function interpolate(t) {
    t = clamp(t, 0, 80); const frame = t / PELAGIC_STEP, low = Math.min(2399, Math.floor(frame)), f = frame - low;
    return frames[low].dolphins.map((a, i) => {
      const b = frames[low + 1].dolphins[i], position = v3(a.position).lerp(v3(b.position), f), velocity = v3(a.velocity).lerp(v3(b.velocity), f);
      const pose = { position: point(position), velocity: point(velocity), ...quaternion(velocity, mix(a.roll, b.roll, f)) };
      for (const key of ['speed', 'stroke', 'phase', 'frequency', 'amplitude', 'flukePitch', 'pectoralPitch', 'pectoralRoll']) pose[key] = mix(a[key], b[key], f);
      return pose;
    });
  }
  const whaleAt = (t, surface = null) => {
    t = clamp(t, 0, 80); const position = whalePath(t, surface), velocity = whaleVelocity(t, surface), speed = velocity.length(), stroke = whaleStroke(t);
    const before = whaleVelocity(Math.max(0, t - .05), surface), after = whaleVelocity(Math.min(80, t + .05), surface);
    const turn = clamp((Math.atan2(after.z, after.x) - Math.atan2(before.z, before.x)) / .1, -.35, .35);
    const frame = t / PELAGIC_STEP, low = Math.min(2399, Math.floor(frame)), f = frame - low;
    const phase = mix(whalePhases[low], whalePhases[low + 1], f);
    return { position: point(position), velocity: point(velocity), speed, stroke, phase, amplitude: .036 * stroke, flukePitch: .17 * stroke,
      frequency: .27 + .075 * smooth(.6, 1.4, speed), pectoralPitch: -.025 + Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * .12,
      pectoralRoll: turn * .32, breathingWindow: t >= 18.0 && t <= 21.0, ...quaternion(velocity, -turn * .18) };
  };
  return { whaleAt, dolphinsAt: interpolate, diagnostics: () => ({ version: PELAGIC_MOTION_VERSION, fixedStep: PELAGIC_STEP, frames: frames.length, followers: 6, formationChange: [40, 60], noPersistentEcology: true }) };
}

// The same deformation is used by geometric diagnostics and encoded in the
// renderer. Role 2 is a hinged fluke; role 1 is a controlled pectoral surface.
export function deformPelagicVertex(position, role, motion, kind) {
  const p = position.clone(), u = clamp((-.12 - p.x) / .36, 0, 1);
  const bend = x => { const w = clamp((-.12 - x) / .36, 0, 1); return motion.amplitude * w * w * Math.sin(motion.phase - (1 - w) * .75); };
  if (role > 1.5) {
    const pivotX = -.44, pivotY = -.012, angle = -motion.flukePitch * Math.cos(motion.phase), dx = p.x - pivotX, dy = p.y - pivotY;
    p.x = pivotX + dx * Math.cos(angle) - dy * Math.sin(angle);
    p.y = pivotY + dx * Math.sin(angle) + dy * Math.cos(angle) + bend(pivotX);
  } else {
    p.y += motion.amplitude * u * u * Math.sin(motion.phase - (1 - u) * .75);
    if (role > .5) {
      const side = Math.sign(p.z), rootZ = side * .055, wing = smooth(.055, kind === 'whale' ? .22 : .14, Math.abs(p.z));
      const angle = (motion.pectoralPitch + side * motion.pectoralRoll + .022 * motion.stroke * Math.sin(motion.phase)) * side * wing;
      const dy = p.y + .025, dz = p.z - rootZ;
      p.y = -.025 + dy * Math.cos(angle) - dz * Math.sin(angle); p.z = rootZ + dy * Math.sin(angle) + dz * Math.cos(angle);
    }
  }
  return p;
}
