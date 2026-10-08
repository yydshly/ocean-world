import * as THREE from 'three';
import { oceanReefAssemblageSpeciesById } from '../oceanReefAssemblageSpecies.js';

// +X forward, unscaled independent roots. Moray templates are cloned before
// deformation, so one animal's explicit clock cannot alter another's body.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
const IDS = ['giant-moray', 'banded-pipefish', 'spot-fin-porcupinefish'];
export const OCEAN_REEF_ASSEMBLAGE_FISH_ASSET_VERSION = 1;
export const isReefAssemblageFish = id => IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefAssemblageFishResources.has(key)) { root.userData.reefAssemblageFishResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const index = positions.length / 3; positions.push(...p);
    colors.push(...(typeof tint === 'function' ? tint(...p) : tint)); return index; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 32, roundness = 1) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const a = TAU * i / sides;
      vertex([x, Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** roundness * y,
        Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** roundness * z], tint);
    }
    for (let row = 0; row < profile.length - 1; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1; triangle(a, b, a + 1); triangle(a + 1, b, b + 1);
    }
    for (const [row, reverse] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[row][0], 0, 0], tint);
      for (let i = 0; i < sides; i++) { const a = start + row * (sides + 1) + i;
        reverse ? triangle(c, a + 1, a) : triangle(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 14, rows = 8) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
      const a = TAU * i / sides, t = Math.PI * row / rows;
      vertex([center[0] + Math.sin(t) * Math.cos(a) * scale[0], center[1] + Math.cos(t) * scale[1],
        center[2] + Math.sin(t) * Math.sin(a) * scale[2]], tint);
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1;
      if (row) triangle(a, a + 1, b); if (row < rows - 1) triangle(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, tint, sides = 7) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]), tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(0, row - 1)])).normalize(),
        side = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(),
        up = new THREE.Vector3().crossVectors(side, tangent).normalize();
      for (let i = 0; i <= sides; i++) { const a = TAU * i / sides;
        vertex(p.clone().addScaledVector(side, Math.cos(a) * radii[row]).addScaledVector(up, Math.sin(a) * radii[row]).toArray(), tint); }
    }
    for (let row = 0; row < points.length - 1; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1; triangle(a, a + 1, b); triangle(a + 1, b + 1, b);
    }
  }
  function sheet(points, tint) {
    const start = positions.length / 3; points.forEach(p => vertex(p, tint));
    for (let i = 1; i < points.length - 1; i++) triangle(start, start + i, start + i + 1);
  }
  return { body, ellipsoid, tube, sheet, finish() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  } };
}
const shape = build => { const b = builder(); build(b); return b.finish(); };
function part(root, name, make, parent = root, deform = false) {
  const template = share(root, `${root.userData.speciesId}/geometry/${name}`, make), geometry = deform ? template.clone() : template,
    material = share(root, 'material/nonemissive-fish-tissue', () => new THREE.MeshStandardMaterial({ vertexColors: true,
      roughness: .67, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 })), mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh);
  if (deform) root.userData.deformableParts.push({ mesh, original: new Float32Array(geometry.getAttribute('position').array) });
  return mesh;
}
const profile = (start, end, rows, ry, rz) => Array.from({ length: rows }, (_, i) => {
  const t = i / (rows - 1), full = Math.sin(Math.PI * (.025 + .95 * t)); return [start + (end - start) * t, ry * full, rz * full];
});
function eyes(root, x, y, z, radius = .018) {
  part(root, 'paired eyes', () => shape(b => { for (const s of [-1, 1]) {
    b.ellipsoid([x, y, s * z], [radius, radius, radius * .35], [.75, .70, .43]);
    b.ellipsoid([x + .002, y, s * (z + radius * .26)], [radius * .55, radius * .55, radius * .15], [.025, .028, .025]);
  } }));
}
function tail(root, x, outline, tint) {
  const pivot = new THREE.Group(); pivot.name = 'tail pivot'; pivot.position.x = x; root.add(pivot);
  part(root, 'complete caudal fin', () => shape(b => b.sheet(outline, tint)), pivot); return pivot;
}
function pectorals(root, x, y, z, reach, tint, length = .12) {
  return [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.name = `pectoral pivot ${s}`; pivot.position.set(x, y, s * z); root.add(pivot);
    part(root, `paired pectoral fin ${s}`, () => shape(b => b.sheet([[0, 0, 0], [-length * .65, -.035, s * reach],
      [-length, .025, s * reach * .65]], tint)), pivot); return pivot; });
}

const morayTint = (x, y, z) => {
  const u = x * 47, a = Math.atan2(z, y) * 6 / Math.PI,
    dx = u - Math.floor(u) - .5, dy = a - Math.floor(a) - .5;
  return dx * dx + dy * dy < .13 ? [.22, .22, .14] : [.47, .41, .26];
};
function giantMoray(root) {
  const p = Array.from({ length: 77 }, (_, i) => { const t = i / 76,
    radius = .0008 + .052 * Math.sin(Math.PI * .82 * t) ** .8; return [-.5 + .84 * t, radius, radius * .88]; });
  part(root, 'whole tapered long moray body', () => shape(b => b.body(p, morayTint, 28)), root, true);
  part(root, 'continuous dorsal caudal anal moray fin', () => shape(b => {
    // Separate strips join around the taper; all vertices use the body's same
    // analytic deformation and there is no detached conventional tail pivot.
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], c = p[i + 1], liftA = .019 * Math.sin(Math.PI * i / 90), liftC = .019 * Math.sin(Math.PI * (i + 1) / 90);
      for (const s of [-1, 1]) b.sheet([[a[0], s * a[1], 0], [c[0], s * c[1], 0],
        [c[0], s * (c[1] + liftC), 0], [a[0], s * (a[1] + liftA), 0]], [.40, .37, .23]);
    }
  }), root, true);
  part(root, 'large spotted moray head and upper jaw', () => shape(b => {
    b.ellipsoid([.383, .021, 0], [.112, .051, .047], morayTint, 26, 14);
    b.ellipsoid([.463, .004, 0], [.031, .012, .035], [.18, .17, .11], 18, 8);
  }));
  const jaw = new THREE.Group(); jaw.name = 'moray lower jaw pivot'; jaw.position.set(.363, -.016, 0); root.add(jaw);
  part(root, 'moray lower jaw and bounded visible teeth', () => shape(b => {
    b.ellipsoid([.069, -.003, 0], [.068, .017, .036], morayTint, 22, 10);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) b.tube([[.042 + i * .014, .011, s * .023],
      [.044 + i * .014, .023, s * .022]], [.0025, .0001], [.76, .73, .53], 6);
  }), jaw);
  eyes(root, .426, .039, .038, .009);
  part(root, 'two tubular anterior nostrils', () => shape(b => {
    for (const s of [-1, 1]) b.tube([[.471, .033, s * .014], [.494, .036, s * .020]], [.0035, .002], [.49, .44, .29], 8);
  }));
  part(root, 'black blotch and small round gill openings', () => shape(b => {
    for (const s of [-1, 1]) { b.ellipsoid([.255, .002, s * .043], [.020, .019, .004], [.17, .18, .13], 14, 8);
      b.ellipsoid([.253, .001, s * .046], [.006, .008, .002], [.025, .030, .021], 12, 6); }
  }));
  root.userData.motion = { jaw, pectorals: [], tail: null };
}

const pipeTint = x => Math.floor((x + .5) * 25) % 2 ? [.27, .21, .16] : [.84, .79, .66];
function bandedPipefish(root) {
  part(root, 'rectangular ringed pipefish trunk and tapering tail body', () => shape(b => {
    const p = Array.from({ length: 72 }, (_, i) => { const t = i / 71; return [-.407 + t * .662, .006 + t * .011, .004 + t * .006]; });
    b.body(p, pipeTint, 16, .30);
    for (let i = 0; i < 35; i++) { const t = i / 34, x = -.400 + t * .638, y = .0065 + t * .011, z = .0045 + t * .006;
      b.tube([[x, y, -z], [x, y, z], [x, -y, z], [x, -y, -z], [x, y, -z]], [.00065, .00065, .00065, .00065, .00065], [.59, .52, .37], 5); }
  }));
  part(root, 'long straight tubular snout and tiny terminal mouth', () => shape(b => {
    b.body([[.25, .014, .010], [.285, .008, .007], [.495, .0047, .005]], pipeTint, 16);
    b.ellipsoid([.499, 0, 0], [.001, .002, .0038], [.12, .10, .075], 12, 6);
  }));
  eyes(root, .257, .008, .008, .005);
  const dorsal = new THREE.Group(); dorsal.name = 'pipefish soft dorsal pivot'; root.add(dorsal);
  part(root, 'complete small pipefish dorsal fin', () => shape(b => b.sheet([[-.13, .012, 0], [-.115, .047, 0],
    [-.038, .041, 0], [-.016, .014, 0]], [.73, .69, .54])), dorsal);
  part(root, 'complete tiny pipefish anal fin', () => shape(b => b.sheet([[-.10, -.013, 0], [-.087, -.028, 0],
    [-.055, -.028, 0], [-.046, -.014, 0]], [.73, .69, .54])));
  const caudal = tail(root, -.407, [[0, .006, 0], [-.030, .049, 0], [-.071, .064, 0], [-.093, .039, 0],
    [-.093, -.039, 0], [-.071, -.064, 0], [-.030, -.049, 0], [0, -.006, 0]], [.57, .22, .13]);
  part(root, 'white pipefish caudal margins and central white spot', () => shape(b => {
    b.tube([[-.027, .047, 0], [-.071, .064, 0], [-.093, .039, 0]], [.0015, .0015, .001], [.86, .82, .67], 6);
    b.tube([[-.027, -.047, 0], [-.071, -.064, 0], [-.093, -.039, 0]], [.0015, .0015, .001], [.86, .82, .67], 6);
    b.ellipsoid([-.057, 0, 0], [.009, .009, .0015], [.88, .86, .74], 14, 8);
  }), caudal);
  root.userData.motion = { tail: caudal, dorsal, pectorals: pectorals(root, .225, -.004, .011, .020, [.73, .69, .54], .045) };
}

const porcupineTint = (x, y, z) => {
  const u = (x + .5) * 25, v = Math.atan2(z, y) * 10 / Math.PI,
    dx = u - Math.floor(u) - .5, dy = v - Math.floor(v) - .5;
  return dx * dx + dy * dy < .11 ? [.23, .23, .16] : y < -.02 ? [.79, .76, .63] : [.65, .62, .46];
};
function spotfinPorcupinefish(root) {
  part(root, 'ordinary uninflated spotted porcupinefish body', () => shape(b =>
    b.body(profile(-.31, .447, 88, .178, .148), porcupineTint, 64)));
  part(root, 'rounded porcupinefish head and small beaked mouth', () => shape(b => {
    b.ellipsoid([.305, .008, 0], [.145, .112, .111], porcupineTint, 28, 16);
    b.ellipsoid([.471, -.018, 0], [.029, .029, .030], [.72, .70, .55], 18, 10);
    b.ellipsoid([.499, -.018, 0], [.001, .005, .020], [.18, .18, .13], 12, 6);
  }));
  eyes(root, .335, .058, .097, .026);
  part(root, 'complete backward laid long spines including under pectorals', () => shape(b => {
    for (const x of [-.20, -.10, 0, .10, .20, .30]) {
      const t = (x + .31) / .757, full = Math.sin(Math.PI * (.025 + .95 * t));
      for (let i = 0; i < 12; i++) { const a = TAU * (i + .25) / 12, y = Math.cos(a) * .179 * full, z = Math.sin(a) * .149 * full,
        long = y < 0 && Math.abs(z) > .08 ? .085 : .066;
        b.tube([[x, y, z], [x - long, y + Math.cos(a) * .034, z + Math.sin(a) * .034]], [.004, .0002], [.69, .66, .47], 7);
      }
    }
  }));
  const dorsal = new THREE.Group(); dorsal.name = 'porcupinefish soft dorsal pivot'; root.add(dorsal);
  part(root, 'complete spotted posterior dorsal fin', () => shape(b => b.sheet([[-.08, .15, 0], [-.14, .25, 0],
    [-.23, .21, 0], [-.27, .062, 0]], porcupineTint)), dorsal);
  part(root, 'complete spotted posterior anal fin', () => shape(b => b.sheet([[-.08, -.15, 0], [-.16, -.233, 0],
    [-.235, -.18, 0], [-.27, -.062, 0]], porcupineTint)));
  root.userData.motion = { tail: tail(root, -.31, [[0, .022, 0], [-.145, .098, 0], [-.19, .064, 0],
    [-.19, -.064, 0], [-.145, -.098, 0], [0, -.022, 0]], porcupineTint), dorsal,
    pectorals: pectorals(root, .135, -.023, .128, .060, porcupineTint, .145) };
}
const buildSpecies = { 'giant-moray': giantMoray, 'banded-pipefish': bandedPipefish, 'spot-fin-porcupinefish': spotfinPorcupinefish };
export function createReefAssemblageFish(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefAssemblageFish(id)) throw new RangeError('Unknown reef assemblage freewater fish species.');
  const descriptor = oceanReefAssemblageSpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefAssemblageFishResources: new Set(), reefAssemblageFishDisposed: false,
    deformableParts: [], sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, footContacts: [], independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { buildSpecies[id](root); instances.add(root); animateReefAssemblageFish(root, null, 0); return root; }
  catch (error) { disposeReefAssemblageFish(root); throw error; }
}
export function animateReefAssemblageFish(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefAssemblageFishDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, descriptor = oceanReefAssemblageSpeciesById[root.userData.speciesId],
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001;
  if (motion.jaw) {
    for (const { mesh, original } of root.userData.deformableParts) {
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const x = original[i * 3], taper = Math.max(0, Math.min(1, (.18 - x) / .68));
        p.setXYZ(i, x, original[i * 3 + 1], original[i * 3 + 2] + Math.sin(clock * (moving ? 2.2 : .7) - (x + .5) * 10 + phase)
          * descriptor.animationBounds.bodyWaveUnits * taper * (moving ? 1 : .3)); }
      p.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    }
    motion.jaw.rotation.z = -.022 + Math.sin(clock * .9 + phase) * descriptor.animationBounds.jawPitchRad;
  } else {
    motion.tail.rotation.y = Math.sin(clock * (moving ? 3.4 : 1.2) + phase) * descriptor.animationBounds.tailYawRad * (moving ? 1 : .3);
    motion.pectorals.forEach((pivot, i) => { pivot.rotation.x = Math.sin(clock * 1.7 + phase + i * Math.PI) * descriptor.animationBounds.pectoralRollRad; });
    motion.dorsal.rotation.y = Math.sin(clock * 1.9 + phase) * descriptor.animationBounds.dorsalYawRad;
  }
  return true;
}
export function disposeReefAssemblageFish(root) {
  if (!root?.userData || root.userData.reefAssemblageFishDisposed) return false;
  root.userData.reefAssemblageFishDisposed = true;
  for (const { mesh } of root.userData.deformableParts ?? []) mesh.geometry.dispose();
  root.userData.deformableParts.length = 0;
  for (const key of root.userData.reefAssemblageFishResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefAssemblageFishResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefAssemblageFishAssetStats() { return { resources: resources.size, instances: instances.size }; }
