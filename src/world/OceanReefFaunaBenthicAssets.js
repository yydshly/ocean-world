import * as THREE from 'three';
import { oceanReefFaunaSpeciesById } from '../oceanReefFaunaSpecies.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const REEF_FAUNA_BENTHIC_ASSET_VERSION = 1;
export const REEF_FAUNA_BENTHIC_IDS = Object.freeze(['shame-faced-crab', 'wedge-sea-hare', 'varicose-phyllidia']);
export const isReefFaunaBenthic = value => REEF_FAUNA_BENTHIC_IDS.includes(typeof value === 'string' ? value : value?.id ?? value?.speciesId);
function share(root, key, make) {
  let row = resources.get(key);
  if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefFaunaBenthicResources.has(key)) { root.userData.reefFaunaBenthicResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const id = positions.length / 3; positions.push(...p); colors.push(...tint); return id; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 20, rows = 10) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1],
        center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
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
const olive = [.40, .40, .24], shellTint = (x, y, z) => Math.sin(x * 64 + z * 7) * Math.sin(z * 53 - y * 23) > .41 ? [.35, .27, .30] : olive;
function crabCarapace() {
  const b = builder(); b.ellipsoid([0, .255, 0], [.3125, .145, .5], shellTint, 40, 20);
  // Posterolateral shell canopies and real granules remain inside the measured CW.
  for (const sign of [-1, 1]) {
    b.ellipsoid([-.12, .207, sign * .402], [.20, .041, .093], olive, 24, 10);
    for (let i = 0; i < 5; i++) b.ellipsoid([-.22 + i * .05, .246, sign * (.43 + .012 * Math.sin(i))], [.018, .018, .014], [.47, .43, .29], 10, 6);
  }
  for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
    const x = -.20 + i * .063, z = -.30 + j * .15, height = Math.sqrt(Math.max(0, 1 - (x / .3125) ** 2 - (z / .5) ** 2));
    if (height > .25) b.ellipsoid([x, .255 + .145 * height, z], [.009, .008, .009], [.49, .44, .28], 8, 6);
  }
  return b.finish();
}
function crabFeet(s) {
  const b = builder();
  for (const p of s.support.footContacts) {
    const sign = Math.sign(p.z);
    b.tube([[p.x - .025, .169, sign * .16], [p.x - .040, .18, sign * .39], [p.x - .015, .062, sign * .58], [p.x, 0, p.z]],
      [.016, .014, .007, 0], [.52, .46, .30]);
  }
  return b.finish();
}
function crabFace() {
  const b = builder();
  for (const sign of [-1, 1]) {
    b.tube([[.24, .29, sign * .092], [.307, .318, sign * .116]], [.014, .010], olive);
    b.ellipsoid([.309, .320, sign * .116], [.014, .013, .014], [.11, .10, .08], 12, 8);
  }
  b.ellipsoid([.302, .152, 0], [.025, .027, .060], [.33, .29, .20]); return b.finish();
}
function crabChela(sign) {
  const b = builder();
  b.tube([[0, 0, 0], [.05, .10, sign * .14], [.16, .13, sign * .12]], [.035, .047, .050], olive, 12);
  b.ellipsoid([.24, .16, sign * .025], [.165, .135, .109], shellTint, 24, 14);
  b.tube([[.35, .18, sign * .018], [.45, .17, sign * .008], [.475, .115, sign * .002]], [.029, .025, .005], [.58, .48, .31], 10);
  b.tube([[.35, .092, sign * .018], [.433, .09, sign * .012], [.475, .107, sign * .002]], [.026, .019, .003], olive, 10);
  for (let i = 0; i < 7; i++) b.tube([[.12 + i * .038, .248 + .041 * Math.sin(i / 6 * Math.PI), sign * .018],
    [.125 + i * .038, .285 + .041 * Math.sin(i / 6 * Math.PI), sign * .018]], [.012, .003], [.51, .45, .30], 6);
  // One enlarged cutting tooth is present; no real prey shell is fabricated.
  if (sign === 1) b.ellipsoid([.425, .129, .008], [.012, .021, .016], [.62, .53, .36], 12, 8);
  return b.finish();
}
function continuousSole(id, s) {
  const b = builder(), width = id === 'wedge-sea-hare' ? .12 : .10, xs = [-.48, -.30, 0, .30, .48], zs = [-width * 1.5, -width, 0, width, width * 1.5];
  const bottom = [], top = [], tint = id === 'wedge-sea-hare' ? [.33, .31, .20] : [.36, .45, .49];
  for (let i = 0; i < xs.length; i++) {
    bottom[i] = []; top[i] = [];
    for (let j = 0; j < zs.length; j++) {
      const z = zs[j] * (i === 0 || i === xs.length - 1 ? .10 : 1), color = id === 'varicose-phyllidia' && j === 2 ? [.09, .11, .12] : tint;
      bottom[i][j] = b.vertex([xs[i], 0, z], color);
      top[i][j] = b.vertex([xs[i], .028 + Math.sin(i / 4 * Math.PI) * .026 + Math.sin(j / 4 * Math.PI) * .011, z], tint);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    b.face(top[i][j], top[i + 1][j + 1], top[i + 1][j]); b.face(top[i][j], top[i][j + 1], top[i + 1][j + 1]);
    b.face(bottom[i][j], bottom[i + 1][j], bottom[i + 1][j + 1]); b.face(bottom[i][j], bottom[i + 1][j + 1], bottom[i][j + 1]);
  }
  for (let i = 0; i < xs.length - 1; i++) for (const j of [0, zs.length - 1]) {
    const a = bottom[i][j], c = bottom[i + 1][j], d = top[i + 1][j], e = top[i][j];
    j === 0 ? (b.face(a, e, d), b.face(a, d, c)) : (b.face(a, c, d), b.face(a, d, e));
  }
  for (const i of [0, xs.length - 1]) for (let j = 0; j < zs.length - 1; j++) {
    const a = bottom[i][j], c = bottom[i][j + 1], d = top[i][j + 1], e = top[i][j];
    i === 0 ? (b.face(a, c, d), b.face(a, d, e)) : (b.face(a, e, d), b.face(a, d, c));
  }
  if (!s.support.footContacts.every(p => xs.includes(p.x) && zs.includes(p.z) && p.y === 0)) throw new Error('Continuous sole and catalog contacts disagree.');
  return b.finish();
}
const hareTint = (x, y, z) => {
  const grain = Math.sin(x * 52 + z * 13) * Math.cos(z * 61 + y * 32);
  return grain > .40 ? [.29, .33, .19] : grain < -.42 ? [.28, .25, .17] : [.42, .39, .25];
};
function hareBody() {
  const b = builder(), sides = 40;
  const sections = [[-.5, .26, .16, .31], [-.455, .265, .18, .33], [-.32, .235, .165, .30], [-.10, .19, .12, .23], [.15, .16, .09, .16], [.34, .132, .085, .12], [.5, .12, 0, 0]];
  for (const [x, cy, ry, rz] of sections) for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU, p = [x, cy + Math.cos(a) * ry, Math.sin(a) * rz]; b.vertex(p, hareTint(...p));
  }
  for (let row = 0; row < sections.length - 1; row++) for (let i = 0; i < sides; i++) {
    const a = row * (sides + 1) + i, c = a + sides + 1; b.face(a, a + 1, c); b.face(a + 1, c + 1, c);
  }
  // Posterior disk is an annulus around the real rear siphon, not a sealed dot or an exposed shell.
  const ring = sections.length * (sides + 1);
  for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU; b.vertex([-.5, .26 + Math.cos(a) * .042, Math.sin(a) * .047], [.32, .31, .20]);
  }
  for (let i = 0; i < sides; i++) { b.face(i, ring + i, i + 1); b.face(i + 1, ring + i, ring + i + 1); }
  for (const sign of [-1, 1]) b.ellipsoid([.321, .196, sign * .079], [.009, .007, .009], [.12, .12, .08], 12, 8);
  return b.finish();
}
function siphon(rear) {
  const b = builder(), sides = 32, start = rear ? [-.505, .26, 0] : [.02, .33, 0];
  const sections = rear ? [[0, .042, .047], [.010, .044, .049], [.050, .028, .032]] : [[0, .038, .042], [-.010, .044, .047], [-.028, .026, .031]];
  for (const [distance, a, c] of sections) for (let i = 0; i <= sides; i++) {
    const angle = i / sides * TAU, p = rear ? [start[0] + distance, start[1] + Math.cos(angle) * a, Math.sin(angle) * c] :
      [start[0] + Math.cos(angle) * a, start[1] + distance, Math.sin(angle) * c];
    b.vertex(p, distance === 0 ? [.41, .38, .24] : [.15, .18, .11]);
  }
  for (let row = 0; row < sections.length - 1; row++) for (let i = 0; i < sides; i++) {
    const a = row * (sides + 1) + i, c = a + sides + 1; b.face(a, c, a + 1); b.face(a + 1, c, c + 1);
  }
  return b.finish();
}
function hareTentacle(oral, sign) {
  const b = builder(), points = oral ? [[0, 0, 0], [.07, -.012, sign * .035], [.13, .008, sign * .055], [.145, .027, sign * .045]] :
    [[0, 0, 0], [.017, .057, sign * .011], [.043, .105, sign * .027], [.064, .113, sign * .026]];
  b.tube(points, oral ? [.027, .024, .017, .008] : [.018, .016, .013, .008], row => hareTint(...points[row]), 12);
  return b.finish();
}
const blueGrey = [.37, .47, .51], yellow = [.68, .57, .21], black = [.09, .12, .13];
const phyllidiaHeight = (x, z) => .108 + .083 * Math.sqrt(Math.max(0, 1 - (x / .5) ** 2 - (z / .215) ** 2));
function phyllidiaBody() {
  const b = builder(); b.ellipsoid([0, .108, 0], [.5, .083, .215], (x, y, z) => {
    if (y < .105) return blueGrey;
    const nearRidge = [-.102, 0, .102].some(value => Math.abs(z - value) < .023);
    return nearRidge || Math.abs(z) > .185 ? blueGrey : black;
  }, 48, 20);
  // Three true longitudinal blue-grey ridges with raised yellow-tipped tubercles.
  for (const z of [-.102, 0, .102]) {
    const xs = [-.40, -.32, -.22, -.11, 0, .11, .22, .30];
    b.tube(xs.map(x => [x, phyllidiaHeight(x, z) + .008, z]), xs.map((x, i) => i === 0 || i === xs.length - 1 ? .012 : .019), blueGrey, 10);
    for (const x of [-.33, -.20, -.06, .09, .23]) {
      const y = phyllidiaHeight(x, z) + .021;
      b.ellipsoid([x, y, z], [.023, .023, .022], blueGrey, 12, 8);
      b.ellipsoid([x, y + .017, z], [.019, .014, .018], yellow, 12, 8);
    }
  }
  return b.finish();
}
function phyllidiaVentralLamellae() {
  const b = builder();
  for (const sign of [-1, 1]) for (let i = 0; i < 14; i++) {
    const x = -.31 + i * .045, z = sign * (.137 + .012 * Math.sin(i / 13 * Math.PI));
    b.ellipsoid([x, .054, z], [.006, .021, .024], [.34, .41, .43], 8, 6);
  }
  b.ellipsoid([.388, .037, 0], [.026, .007, .034], black, 16, 8); return b.finish();
}
function phyllidiaRhinophore() {
  const b = builder(); b.tube([[0, 0, 0], [0, .045, 0], [.009, .095, 0], [.01, .105, 0]], [.018, .016, .012, .003], yellow, 12);
  for (let i = 0; i < 6; i++) b.ellipsoid([i * .0015, .022 + i * .013, 0], [.020 - i * .0013, .004, .020 - i * .0013], [.73, .61, .22], 16, 8);
  return b.finish();
}
function add(root, name, make, parent = root) {
  const mesh = new THREE.Mesh(share(root, `${root.userData.speciesId}:${name}:geometry`, make),
    share(root, `${root.userData.speciesId}:material`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, metalness: 0 })));
  mesh.name = name; parent.add(mesh); return mesh;
}
export function createReefFaunaBenthic(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id ?? speciesOrId?.speciesId;
  if (!isReefFaunaBenthic(id)) throw new RangeError('Unknown reef fauna benthic species.');
  const s = oceanReefFaunaSpeciesById[id];
  if (!s || (typeof speciesOrId === 'object' && speciesOrId?.scientificName && speciesOrId.scientificName !== s.scientificName))
    throw new RangeError('Conflicting reef fauna species identity.');
  const root = new THREE.Group(); root.name = s.commonName;
  Object.assign(root.userData, { speciesId: id, scientificName: s.scientificName, sizeMeasure: s.sizeMeasure,
    normalizedEnvelope: structuredClone(s.normalizedEnvelope), supportContacts: structuredClone(s.support.footContacts),
    rootReference: 'neutral-foot-plane', forwardAxis: '+X', reefFaunaBenthicResources: new Set(), reefFaunaBenthicDisposed: false,
    independentAnimal: true, animationScope: 'bounded appendage display; native controller owns root movement; reference contacts do not reproduce calibrated gait, burial or prey injury' });
  instances.add(root);
  try {
    const motion = { chelae: [], oralTentacles: [], rhinophores: [] };
    if (id === 'shame-faced-crab') {
      const shell = add(root, 'Broad domed granulate carapace with posterolateral canopies', crabCarapace); shell.userData.shellMeasuredZ = [-.5, .5];
      const feet = add(root, 'Four slender walking leg pairs with eight actual tips', () => crabFeet(s)); feet.userData.contactTips = true;
      add(root, 'Short eye stalks and front mouthparts', crabFace);
      for (const sign of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(.20, .10, sign * .17); root.add(pivot);
        const claw = add(root, `Raised close-fitting shield chela ${sign}`, () => crabChela(sign), pivot); claw.userData.raisedChela = true; motion.chelae.push(pivot);
      }
      root.userData.anatomy = { groundWalkingLegPairs: 4, actualGroundContactTips: 8, raisedChelipedCount: 2,
        domedCarapace: true, posterolateralCanopies: true, shellWidthExcludesLegsAndChelae: true, realBurialImplemented: false, realPreyBreakingImplemented: false };
    } else {
      const sole = add(root, 'One continuous muscular sole with six support samples', () => continuousSole(id, s));
      sole.userData.contactTips = true; sole.userData.continuousSole = true;
      if (id === 'wedge-sea-hare') {
        const body = add(root, 'Tapered sea-hare body with flattened posterior disk', hareBody); body.userData.bodyMeasuredX = [-.5, .5];
        for (const rear of [true, false]) {
          const opening = add(root, rear ? 'Rear exhalant siphon annular opening' : 'Dorsal inhalant siphon annular opening', () => siphon(rear));
          opening.userData.siphonOpening = true;
        }
        for (const sign of [-1, 1]) for (const oral of [true, false]) {
          const pivot = new THREE.Group(); pivot.position.set(oral ? .42 : .31, oral ? .09 : .20, sign * (oral ? .08 : .064)); root.add(pivot);
          add(root, `${oral ? 'Rolled oral tentacle' : 'Rolled rhinophore'} ${sign}`, () => hareTentacle(oral, sign), pivot);
          (oral ? motion.oralTentacles : motion.rhinophores).push(pivot);
        }
        root.userData.anatomy = { continuousSole: true, actualGroundContactSamples: 6, groundLegCount: 0, oralTentacleCount: 2, rhinophoreCount: 2,
          flattenedPosteriorDisk: true, fusedParapodia: true, siphonOpeningCount: 2, exposedSpiralShell: false, calibratedContractionGait: false };
      } else {
        const body = add(root, 'Oval mantle with three grey-blue ridges and yellow-tipped tubercles', phyllidiaBody); body.userData.bodyMeasuredX = [-.5, .5];
        add(root, 'Ventral lateral respiratory lamellae and separate oral slit', phyllidiaVentralLamellae);
        for (const sign of [-1, 1]) {
          const pivot = new THREE.Group(); pivot.position.set(.32, .195, sign * .057); root.add(pivot);
          add(root, `Yellow annulate rhinophore ${sign}`, phyllidiaRhinophore, pivot); motion.rhinophores.push(pivot);
        }
        root.userData.anatomy = { continuousSole: true, actualGroundContactSamples: 6, groundLegCount: 0, rhinophoreCount: 2,
          longitudinalRidgeCount: 3, yellowTippedTubercles: 15, ventralSoleBlackLine: true, ventralLateralGillLamellae: true,
          dorsalGillPlume: false, radula: false, realSpongeInjuryImplemented: false };
      }
    }
    root.userData.motion = motion; root.updateMatrixWorld(true); return root;
  } catch (error) { disposeReefFaunaBenthic(root); throw error; }
}
export function animateReefFaunaBenthic(root, agent = {}, timeSec = 0) {
  if (!root?.userData?.motion || root.userData.reefFaunaBenthicDisposed) return false;
  const t = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const active = agent?.alive === false || agent?.state === 'resting' ? 0 : 1, motion = root.userData.motion;
  motion.chelae.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .43 + phase + i) * .012 * active; });
  motion.oralTentacles.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .47 + phase + i) * .014 * active;
    pivot.rotation.z = Math.sin(t * .53 + phase + i * .7) * .015 * active; });
  motion.rhinophores.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .39 + phase + i) * .015 * active;
    pivot.rotation.z = Math.sin(t * .51 + phase + i) * .014 * active; });
  return true;
}
export function disposeReefFaunaBenthic(root) {
  if (!root?.userData || root.userData.reefFaunaBenthicDisposed) return false;
  root.userData.reefFaunaBenthicDisposed = true; instances.delete(root);
  for (const key of root.userData.reefFaunaBenthicResources ?? []) { const row = resources.get(key);
    if (row && --row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefFaunaBenthicResources?.clear(); root.removeFromParent(); root.clear(); return true;
}
export const reefFaunaBenthicAssetStats = () => ({ resources: resources.size, instances: instances.size });
