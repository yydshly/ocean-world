// Authored representative Monterey kelp patch, not a surveyed bathymetric map.
// Coordinates are metres. Ground/plant positions are support origins, not centroids.
export const KELP_SURFACE_Y = 12;
// One ecological display unit represents one plant, with a common holdfast.
// Four fronds and 54 blades/frond are rendering samples, not a field census.
export const KELP_FROND_COUNT = 4;
export const KELP_LEAF_COUNT = 54;
export const KELP_STIPE_RADIUS_M = 0.005; // Uncalibrated display radius.
export const KELP_MORPHOLOGY = Object.freeze({
  status: 'source-informed-representative-morphology',
  measuredAtSite: false,
  representativeFrondsPerPlant: KELP_FROND_COUNT,
  representativeLeavesPerFrond: KELP_LEAF_COUNT,
  bladeLengthRangeM: Object.freeze([0.45, 0.70]),
  bladeWidthRangeM: Object.freeze([0.075, 0.105]),
  pneumatocystLengthRangeM: Object.freeze([0.032, 0.062]),
  pneumatocystWidthRangeM: Object.freeze([0.011, 0.020]),
  stipeRadiusM: KELP_STIPE_RADIUS_M,
  sources: Object.freeze([
    'https://www.fao.org/4/x5819e/x5819e0a.htm',
    'https://link.springer.com/article/10.1007/s00227-009-1238-6',
    'https://sembrandoelmar.cl/web/wp-content/uploads/2021/09/PAPER-FENOLOGIA-REPRODUCTIVA-MACROCYSTIS-PABLO-2021.pdf',
  ]),
});
export const KELP_ROCKS = Object.freeze([
  [-5.5, 0.14, -4.2, 1.7, 0.72, 1.5],
  [-1.6, 0.12, -4.7, 1.9, 0.65, 1.6],
  [3.0, 0.10, -3.9, 1.8, 0.82, 1.7],
  [-4.1, 0.13, 1.8, 1.9, 0.70, 1.8],
  [0.5, 0.12, 1.2, 2.0, 0.58, 1.7],
  [5.2, 0.11, 2.9, 1.8, 0.78, 1.5],
].map((rock) => Object.freeze(rock)));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function floorHeight(x, z) {
  return -0.16 + 0.055 * Math.sin(x * 0.47) * Math.cos(z * 0.35) + 0.014 * Math.sin(z * 1.3 + x * 0.22);
}
export function rockSurfaceHeight(rockIndex, x, z) {
  const [cx, cy, cz, sx, sy, sz] = KELP_ROCKS[rockIndex];
  const r2 = ((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2;
  return r2 < 1 ? cy + sy * Math.sqrt(1 - r2) : -Infinity;
}
export function habitatHeight(x, z) {
  return KELP_ROCKS.reduce((height, _, index) => Math.max(height, rockSurfaceHeight(index, x, z)), floorHeight(x, z));
}
export function habitatNormal(x, z) {
  const epsilon = 0.01;
  const dx = (habitatHeight(x + epsilon, z) - habitatHeight(x - epsilon, z)) / (2 * epsilon);
  const dz = (habitatHeight(x, z + epsilon) - habitatHeight(x, z - epsilon)) / (2 * epsilon);
  const length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}

export const KELP_ANCHORS = Object.freeze(KELP_ROCKS.flatMap(([x, , z], rockIndex) => [
  { id: `kelp-anchor-${rockIndex * 2 + 1}`, x: x - 0.38, z: z - 0.18, phase: rockIndex * 1.43, lengthM: 10.7 + (rockIndex % 3) * 0.22, rockIndex },
  { id: `kelp-anchor-${rockIndex * 2 + 2}`, x: x + 0.42, z: z + 0.26, phase: rockIndex * 1.43 + 2.1, lengthM: 10.85 + (rockIndex % 2) * 0.18, rockIndex },
]).map((anchor) => {
  const y = habitatHeight(anchor.x, anchor.z);
  return Object.freeze({ ...anchor, y, lengthM: Math.min(anchor.lengthM, KELP_SURFACE_Y - y - 0.10) });
}));

// Flow deformation is an illustrative, deterministic curve, not fluid dynamics.
// The holdfast (fraction=0) stays exactly at its authored support point.
export function kelpStipePosition(anchor, fraction, timeSec, environment = {}, frondIndex = 0) {
  const u = clamp(fraction, 0, 1);
  const flow = clamp(environment.deformationCurrentMps ?? environment.currentMps ?? 0.18, 0, 1.2);
  const frond = clamp(Math.floor(frondIndex), 0, KELP_FROND_COUNT - 1);
  const phase = (anchor.phase ?? 0) + frond * 1.71;
  const length = anchor.lengthM * [1, 0.982, 0.96, 0.94][frond];
  // Each frond bows through a different plane before opening in the upper
  // water column. The rapid but smooth upper bend avoids four straight poles
  // with a regular radial brush. These shape coefficients are authored, not
  // measured water forces, and do not create additional plant/food units.
  const fanAngle = (anchor.phase ?? 0) + frond * 2.3999632297 + .38 * Math.sin(phase * 1.31);
  const fan = (1.22 + frond * .28 + .24 * Math.sin(phase * 1.9)) * u ** 5;
  const bow = .28 * Math.sin(u * Math.PI * 1.35 + phase) * u * (1 - u) * 4;
  const lean = flow * .54 * u ** 1.8;
  const sway = (.08 + flow * .48) * u ** 2;
  const x = fan * Math.cos(fanAngle) + bow * Math.cos(phase * .71) + .22 * Math.sin(phase) * u
    + lean + sway * Math.sin(timeSec * .43 + phase + u * 1.4);
  const z = fan * Math.sin(fanAngle) + bow * Math.sin(phase * .71) + .18 * Math.cos(phase * 1.13) * u
    + sway * .43 * Math.sin(timeSec * .31 + phase * 1.2 + u);
  // Keep the root-to-point metric distance at the existing nominal length.
  // The centreline is curved, so its arc is slightly longer than that chord.
  // Upper spreading lowers the crown rather than stretching the plant taller.
  const y = Math.sqrt(Math.max(0, (length * u) ** 2 - x * x - z * z));
  return {
    x: anchor.x + x, y: anchor.y + y, z: anchor.z + z,
  };
}

// Node spacing decreases upward (California observations, Reed et al. 2009).
// The exponent is authored. Stable leaf IDs 12/15/17 retain their earlier upper
// crown height so existing attached snails and local food patches keep identity.
const reservedLeafFractions = new Map([12, 15, 17].map(index => [index, 0.38 + index / 17 * 0.56]));
const denseLeafFractions = Array.from({ length: KELP_LEAF_COUNT }, (_, index) => {
  const t = index / (KELP_LEAF_COUNT - 1);
  // Retain upward compression while leaving a finite terminal interval: a
  // pure power curve previously stacked the last nodes almost at one point.
  return .12 + .865 * (.30 * t + .70 * (1 - (1 - t) ** 2));
});
for (const fraction of reservedLeafFractions.values()) {
  let closest = 0;
  for (let index = 1; index < denseLeafFractions.length; index++) if (Math.abs(denseLeafFractions[index] - fraction) < Math.abs(denseLeafFractions[closest] - fraction)) closest = index;
  denseLeafFractions.splice(closest, 1);
}
let nextLeafFraction = 0;
const leafFractions = Object.freeze(Array.from({ length: KELP_LEAF_COUNT }, (_, index) => reservedLeafFractions.get(index) ?? denseLeafFractions[nextLeafFraction++]));
const leafSpacing = Object.freeze(leafFractions.map(fraction => {
  const neighbours = leafFractions.filter(value => value !== fraction);
  return { below: fraction - Math.max(.10, ...neighbours.filter(value => value < fraction)),
    above: Math.min(.995, ...neighbours.filter(value => value > fraction)) - fraction };
}));
export function kelpLeafFraction(leafIndex, anchor, frondIndex = 0) {
  const index = clamp(Math.floor(leafIndex), 0, KELP_LEAF_COUNT - 1), fraction = leafFractions[index];
  // Preserve the original attached leaf identities on the ecological frond.
  // Other nodes are staggered inside their local interval, including between
  // fronds of one plant. No random draw or topology change happens per frame.
  if (!anchor || (frondIndex === 0 && reservedLeafFractions.has(index))) return fraction;
  const jitter = .32 * Math.sin(index * 19.17 + (anchor.phase ?? 0) * 3.71 + frondIndex * 2.83);
  return fraction + jitter * (jitter < 0 ? leafSpacing[index].below : leafSpacing[index].above);
}
export function kelpLeafLength(leafIndex) { return 0.45 + (leafIndex % 6) * 0.05; }
export function kelpLeafWidth(leafIndex) { return 0.075 + (leafIndex % 4) * 0.010; }
export function kelpPneumatocystDimensions(leafIndex) {
  return { lengthM: 0.032 + (leafIndex % 6) * 0.006, widthM: 0.011 + (leafIndex % 4) * 0.003 };
}
function leafShape(anchor, leafIndex, along, timeSec, environment, frondIndex, frame = {
  position: {}, tangent: {}, across: {}, normal: {},
}) {
  const index = clamp(Math.floor(leafIndex), 0, KELP_LEAF_COUNT - 1);
  const u = clamp(along, 0, 1);
  const frond = clamp(Math.floor(frondIndex), 0, KELP_FROND_COUNT - 1);
  const flow = clamp(environment.deformationCurrentMps ?? environment.currentMps ?? 0.18, 0, 1.2);
  const context = frame.context ?? (frame.context = {});
  if (context.index !== index || context.frond !== frond || context.timeSec !== timeSec || context.flow !== flow
    || context.x !== anchor.x || context.y !== anchor.y || context.z !== anchor.z
    || context.phase !== anchor.phase || context.lengthM !== anchor.lengthM) {
    // Renderer rows share one stem position and blade coefficients. This
    // fixed-size cache holds only the most recent blade for this output frame;
    // it cannot accumulate leaves or times and owns no GPU resource.
    context.index = index; context.frond = frond; context.timeSec = timeSec; context.flow = flow;
    context.x = anchor.x; context.y = anchor.y; context.z = anchor.z;
    context.phase = anchor.phase; context.lengthM = anchor.lengthM;
    const phase = (anchor.phase ?? 0) + frond * 1.57;
    const angle = index * 2.3999632297 + phase + .85 * Math.sin(index * 1.27 + phase * 2.2);
    context.length = kelpLeafLength(index);
    context.flutterPhase = timeSec * .67 + phase + index * .8;
    context.amplitude = .025 + flow * .045;
    context.droop = .20 + .14 * (.5 + .5 * Math.sin(index * 4.13 + phase));
    context.dx = Math.cos(angle) + flow * .43; context.dz = Math.sin(angle);
    context.initialSlope = Math.sin(angle * .8 + index * .29) * .30;
    context.roll = .48 * Math.sin(index * 2.73 + phase * 1.31);
    context.stem = kelpStipePosition(anchor, kelpLeafFraction(index, anchor, frond), timeSec, environment, frond);
  }
  const { length, amplitude, droop, dx, dz } = context, distance = length * u;
  const flutterPhase = context.flutterPhase - u * 1.6;
  const slope = context.initialSlope - u * droop + Math.sin(flutterPhase) * amplitude;
  const slopeDerivative = -droop - 1.6 * Math.cos(flutterPhase) * amplitude;
  const magnitude = Math.sqrt(dx * dx + slope * slope + dz * dz);
  const reach = distance / magnitude;
  const derivative = length / magnitude - distance * slope * slopeDerivative / (magnitude * magnitude * magnitude);
  const tangent = frame.tangent;
  tangent.x = dx * derivative; tangent.y = slope * derivative + reach * slopeDerivative; tangent.z = dz * derivative;
  const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y + tangent.z * tangent.z);
  tangent.x /= tangentLength; tangent.y /= tangentLength; tangent.z /= tangentLength;
  const horizontal = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z);
  const acrossX = -tangent.z / horizontal, acrossZ = tangent.x / horizontal;
  const upX = -tangent.x * tangent.y / horizontal, upY = horizontal, upZ = -tangent.z * tangent.y / horizontal;
  // Longitudinal roll is part of the same shared sheet used for snail support.
  // A different static roll per blade removes the repeated flat feather fans;
  // motion still reads only the ecological clock and smoothed current.
  const roll = context.roll + .19 * Math.sin(u * 4.1 + index)
    + Math.sin(flutterPhase) * (.035 + flow * .035) * u;
  const cosine = Math.cos(roll), sine = Math.sin(roll);
  frame.index = index; frame.frond = frond; frame.reach = reach; frame.dx = dx; frame.slope = slope; frame.dz = dz;
  frame.across.x = acrossX * cosine - upX * sine; frame.across.y = -upY * sine; frame.across.z = acrossZ * cosine - upZ * sine;
  frame.normal.x = upX * cosine + acrossX * sine; frame.normal.y = upY * cosine; frame.normal.z = upZ * cosine + acrossZ * sine;
  frame.position.x = context.stem.x + dx * reach; frame.position.y = context.stem.y + slope * reach;
  frame.position.z = context.stem.z + dz * reach;
  return frame;
}

export function kelpLeafFrame(anchor, leafIndex, along, timeSec, environment = {}, frondIndex = 0, outputFrame) {
  // Renderer callers reuse one output frame; model callers receive independent
  // objects. Avoid allocating a complete vector frame for every uploaded row.
  // Flow turns the blade instead of stretching its metric length. Each point
  // is its nominal along-distance from the base; slight curvature adds arc.
  return leafShape(anchor, leafIndex, along, timeSec, environment, frondIndex, outputFrame);
}

export function kelpLeafPosition(anchor, leafIndex, along, timeSec, environment = {}, frondIndex = 0) {
  return kelpLeafFrame(anchor, leafIndex, along, timeSec, environment, frondIndex).position;
}

export function kelpLeafNormal(anchor, leafIndex, along, timeSec, environment = {}, frondIndex = 0) {
  return leafShape(anchor, leafIndex, along, timeSec, environment, frondIndex).normal;
}

// Renderer and attached snail must use this exact function and the same time/env.
export function leafAttachmentPosition(anchor, attachment, timeSec, environment = {}) {
  const position = kelpLeafPosition(anchor, attachment.leafIndex, attachment.along, timeSec, environment, attachment.frondIndex ?? 0);
  return { ...position, y: position.y + (attachment.clearanceM ?? 0.003) };
}

export const KELP_HABITAT_NOTES = Object.freeze({
  waterDepth: 'Surface y=12 m; local depth is surface minus local support elevation. This is an authored patch, not observed bathymetry.',
  surfaceEdges: 'Ellipsoid rock silhouettes have height-field edges. Crawlers remain on a connected support instead of stepping over discontinuities.',
  deformation: 'Frequency, phase, flow lean and leaf flutter are display parameters. They do not solve water forces or stipe failure.',
  representation: '12 plant display units; each has 4 representative fronds and 54 representative blades/frond. Frond/leaf sampling does not multiply ecological resource pools.',
  bladeSizes: 'Selected blade and pneumatocyst sizes lie inside the Leal et al. 2021 southern New Zealand observation ranges; these are morphology references, not a Monterey measurement or site calibration.',
});
