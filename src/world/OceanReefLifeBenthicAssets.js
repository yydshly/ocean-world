import * as THREE from 'three';
import { oceanReefLifeSpeciesById } from '../oceanReefLifeSpecies.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const REEF_LIFE_BENTHIC_ASSET_VERSION = 1;
export const REEF_LIFE_BENTHIC_IDS = Object.freeze(['banded-coral-shrimp', 'chocolate-chip-sea-star']);
export const isReefLifeBenthic = value => REEF_LIFE_BENTHIC_IDS.includes(typeof value === 'string' ? value : value?.id ?? value?.speciesId);
function share(root, key, make) {
  let row = resources.get(key);
  if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefLifeBenthicResources.has(key)) { root.userData.reefLifeBenthicResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const id = positions.length / 3; positions.push(...p); colors.push(...tint); return id; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 16, rows = 8) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0],
        center[1] + Math.cos(latitude) * scale[1], center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, typeof tint === 'function' ? tint(...p) : tint);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, c = a + sides + 1;
      if (row) face(a, a + 1, c); if (row < rows - 1) face(a + 1, c + 1, c);
    }
  }
  function tube(points, radii, tint, sides = 8) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]), tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(row - 1, 0)])).normalize();
      const u = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(tangent, u), color = typeof tint === 'function' ? tint(row) : tint;
      for (let side = 0; side < sides; side++) vertex(p.clone().addScaledVector(u, Math.cos(side * TAU / sides) * radii[row])
        .addScaledVector(v, Math.sin(side * TAU / sides) * radii[row]).toArray(), color);
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, c = start + row * sides + (side + 1) % sides;
      face(a, c, a + sides); face(c, c + sides, a + sides);
    }
    for (const [row, reverse] of [[0, true], [points.length - 1, false]]) {
      const center = vertex(points[row], typeof tint === 'function' ? tint(row) : tint);
      for (let side = 0; side < sides; side++) {
        const a = start + row * sides + side, next = start + row * sides + (side + 1) % sides;
        reverse ? face(center, next, a) : face(center, a, next);
      }
    }
  }
  return { vertex, face, ellipsoid, tube, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
const red = [.58, .15, .10], white = [.71, .68, .56], band = row => row % 3 === 1 ? red : white;
function shrimpBody() {
  const b = builder();
  b.ellipsoid([.18, .189, 0], [.175, .080, .092], (x, y) => Math.floor((x + .5) * 15) % 2 ? red : white, 24, 12);
  b.ellipsoid([.333, .202, 0], [.075, .048, .070], white);
  b.tube([[.381, .225, 0], [.473, .205, 0], [.5, .20, 0]], [.011, .007, 0], red);
  for (let i = 0; i < 6; i++) {
    const x = -.321 + i * .055, y = .129 + Math.sin(i / 5 * Math.PI) * .060;
    b.ellipsoid([x, y, 0], [.036, .039, .061 + i * .004], i % 2 ? white : red, 16, 8);
    for (const sign of [-1, 1]) b.ellipsoid([x, y - .042, sign * .027], [.017, .018, .027], [.61, .52, .37], 10, 6);
  }
  b.ellipsoid([-.435, .095, 0], [.065, .019, .055], red);
  for (const sign of [-1, 1]) {
    b.ellipsoid([-.441, .097, sign * .062], [.049, .017, .037], white);
    b.ellipsoid([.364, .252, sign * .047], [.015, .017, .013], [.13, .11, .09], 12, 8);
    // The first two chelate pairs are small and held clear of the support plane.
    for (let pair = 0; pair < 2; pair++) {
      const x = .24 + pair * .066;
      b.tube([[x, .169, sign * .071], [x + .065, .09, sign * .122], [x + .098, .10, sign * .085]], [.009, .007, .004], band);
      b.tube([[x + .098, .10, sign * .085], [x + .135, .114, sign * .069]], [.004, .001], white);
      b.tube([[x + .098, .10, sign * .085], [x + .133, .089, sign * .069]], [.004, .001], red);
    }
  }
  // A finite set of short real carapace spinules; no change to the body measure.
  for (let i = 0; i < 9; i++) {
    const x = .041 + i * .028;
    b.tube([[x, .253, 0], [x + .005, .286, 0]], [.006, .0005], i % 2 ? white : red, 5);
  }
  return b.finish();
}
function shrimpWalkingFeet(s) {
  const b = builder();
  for (const p of s.support.footContacts) {
    const sign = Math.sign(p.z);
    b.tube([[p.x + .031, .163, sign * .055], [p.x + .052, .206, sign * .208], [p.x + .013, .091, sign * .291], [p.x, p.y, p.z]],
      [.008, .007, .005, 0], band);
  }
  return b.finish();
}
function shrimpBigChela(sign) {
  const b = builder();
  b.tube([[0, 0, 0], [.127, .10, sign * .206], [.294, .091, sign * .332], [.419, .094, sign * .344]], [.018, .024, .027, .028], band);
  b.ellipsoid([.44, .101, sign * .343], [.060, .033, .030], red);
  b.tube([[.468, .11, sign * .341], [.535, .13, sign * .32], [.58, .117, sign * .31]], [.012, .009, .001], white);
  b.tube([[.468, .092, sign * .341], [.535, .07, sign * .32], [.58, .09, sign * .31]], [.012, .009, .001], red);
  return b.finish();
}
const shrimpAntennaPoints = (sign, pair) => pair === 0 ? [[0, 0, sign * .035], [.67, .14, sign * .22], [1.39, .28, sign * .52], [1.93, .39, sign * .82]] :
    [[0, 0, sign * .054], [.57, .059, sign * .279], [1.25, .122, sign * .63], [1.78, .18, sign * .95]];
function shrimpAntenna(sign, pair) {
  const b = builder(), points = shrimpAntennaPoints(sign, pair);
  b.tube(points, [.005, .0032, .002, .0006], white, 6); return b.finish();
}
const starRadius = angle => .20 + .30 * ((1 + Math.cos(angle * 5)) / 2) ** 1.2;
function chocolateStarBody() {
  const b = builder(), sides = 120;
  const profile = [[0, .176], [.35, .171], [.65, .146], [.85, .112], [1, .074], [.96, .047], [.70, .035], [.36, .031], [0, .034]];
  for (const [fraction, y] of profile) for (let side = 0; side <= sides; side++) {
    const angle = side / sides * TAU, r = starRadius(angle) * fraction;
    const grain = Math.sin(angle * 19 + fraction * 12) * .018;
    b.vertex([Math.cos(angle) * r, y, Math.sin(angle) * r], y < .05 ? [.51, .39, .25] : [.62 + grain, .43 + grain, .27 + grain]);
  }
  for (let row = 0; row < profile.length - 1; row++) for (let side = 0; side < sides; side++) {
    const a = row * (sides + 1) + side, c = a + sides + 1; b.face(a, a + 1, c); b.face(a + 1, c + 1, c);
  }
  // The dark conical tubercles are actual raised geometry, not painted chips.
  const knob = (x, y, z, height, radius) => {
    b.tube([[x, y - .004, z], [x, y + height * .62, z], [x, y + height, z]], [radius, radius * .48, .002], [.17, .13, .09], 10);
  };
  knob(0, .175, 0, .115, .039);
  for (let arm = 0; arm < 5; arm++) {
    const a = arm / 5 * TAU;
    knob(Math.cos(a) * .20, .166, Math.sin(a) * .20, .100, .031);
    knob(Math.cos(a) * .36, .135, Math.sin(a) * .36, .060, .023);
    // A ventral groove follows each arm but stays above the planted tube feet.
    b.tube([[Math.cos(a) * .08, .043, Math.sin(a) * .08], [Math.cos(a) * .23, .037, Math.sin(a) * .23],
      [Math.cos(a) * .40, .045, Math.sin(a) * .40]], [.013, .012, .008], [.48, .35, .20], 8);
  }
  return b.finish();
}
function starFeet(s) {
  const b = builder();
  for (const p of s.support.footContacts) {
    b.tube([[p.x, .042, p.z], [p.x, .015, p.z], [p.x, p.y, p.z]], [.010, .012, 0], [.62, .51, .32], 8);
  }
  return b.finish();
}
function starMouth() {
  const b = builder(); b.ellipsoid([0, .035, 0], [.024, .007, .024], [.36, .27, .17], 16, 8); return b.finish();
}
function add(root, name, make, parent = root) {
  const mesh = new THREE.Mesh(share(root, `${root.userData.speciesId}:${name}:geometry`, make),
    share(root, `${root.userData.speciesId}:material`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, metalness: 0 })));
  mesh.name = name; parent.add(mesh); return mesh;
}
export function createReefLifeBenthic(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id ?? speciesOrId?.speciesId;
  if (!isReefLifeBenthic(id)) throw new RangeError('Unknown reef life benthic species.');
  const s = oceanReefLifeSpeciesById[id];
  if (!s || (typeof speciesOrId === 'object' && speciesOrId?.scientificName && speciesOrId.scientificName !== s.scientificName))
    throw new RangeError('Conflicting reef life species identity.');
  const root = new THREE.Group(); root.name = s.commonName;
  Object.assign(root.userData, { speciesId: id, scientificName: s.scientificName, sizeMeasure: s.sizeMeasure,
    normalizedEnvelope: structuredClone(s.normalizedEnvelope), supportContacts: structuredClone(s.support.footContacts),
    rootReference: 'neutral-foot-plane', forwardAxis: '+X', reefLifeBenthicResources: new Set(), reefLifeBenthicDisposed: false,
    independentAnimal: true, animationScope: 'bounded appendage display; native controller owns root movement; planted reference contacts; no calibrated gait or cleaning interaction' });
  instances.add(root);
  try {
    const motion = { antennae: [], chelae: [], mouth: null };
    if (id === 'banded-coral-shrimp') {
      const body = add(root, 'Spiny red-white shrimp body and six abdominal segments', shrimpBody); body.userData.bodyMeasuredX = [-.5, .5];
      const feet = add(root, 'Fourth and fifth walking leg pairs', () => shrimpWalkingFeet(s)); feet.userData.contactTips = true;
      for (const sign of [-1, 1]) {
        const chela = new THREE.Group(); chela.position.set(.18, .163, sign * .09); root.add(chela);
        add(root, `Enlarged raised third cheliped ${sign}`, () => shrimpBigChela(sign), chela); motion.chelae.push(chela);
        for (let pair = 0; pair < 2; pair++) {
          const antenna = new THREE.Group(); antenna.position.set(.30, .22, 0); root.add(antenna);
          add(root, `Long white antenna pair ${pair + 1} side ${sign}`, () => shrimpAntenna(sign, pair), antenna); motion.antennae.push(antenna);
        }
      }
      root.userData.anatomy = { chelateLegPairs: 3, largestChelipedPair: 3, groundWalkingLegPairs: 2, actualGroundContactTips: 4,
        antennaePairs: 2, completeLongAntennae: true, antennaCenterlineLengthsUnits: [0, 1].map(pair => {
          const path = shrimpAntennaPoints(1, pair); return path.slice(1).reduce((n, p, i) => n + Math.hypot(...p.map((v, k) => v - path[i][k])), 0);
        }), abdominalSegments: 6,
        centralMouthIsFoot: false, fabricatedCrevice: false, cleaningInteractionImplemented: false };
    } else {
      add(root, 'Five thick arms, raised central disc and eleven dark tubercles', chocolateStarBody);
      const feet = add(root, 'Ten ambulacral tube-foot support tips', () => starFeet(s)); feet.userData.contactTips = true;
      const mouth = new THREE.Group(); root.add(mouth); add(root, 'Separate oral membrane above contact plane', starMouth, mouth); motion.mouth = mouth;
      root.userData.anatomy = { armCount: 5, thickShortArms: true, raisedConicalTubercles: 11, actualGroundContactTips: 10,
        ambulacralGrooves: 5, centralMouthIsFoot: false, speciesDuplicateOfExistingBlueStar: false };
    }
    root.userData.motion = motion; root.updateMatrixWorld(true); return root;
  } catch (error) { disposeReefLifeBenthic(root); throw error; }
}
export function animateReefLifeBenthic(root, agent = {}, timeSec = 0) {
  if (!root?.userData?.motion || root.userData.reefLifeBenthicDisposed) return false;
  const t = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const active = agent?.alive === false || agent?.state === 'resting' ? 0 : 1, motion = root.userData.motion;
  motion.antennae.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .57 + phase + i * .77) * .022 * active;
    pivot.rotation.z = Math.sin(t * .49 + phase + i) * .010 * active; });
  motion.chelae.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .41 + phase + i) * .012 * active; });
  if (motion.mouth) motion.mouth.scale.y = 1 + Math.sin(t * .62 + phase) * .015 * active;
  return true;
}
export function disposeReefLifeBenthic(root) {
  if (!root?.userData || root.userData.reefLifeBenthicDisposed) return false;
  root.userData.reefLifeBenthicDisposed = true; instances.delete(root);
  for (const key of root.userData.reefLifeBenthicResources ?? []) { const row = resources.get(key);
    if (row && --row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefLifeBenthicResources?.clear(); root.removeFromParent(); root.clear(); return true;
}
export const reefLifeBenthicAssetStats = () => ({ resources: resources.size, instances: instances.size });
