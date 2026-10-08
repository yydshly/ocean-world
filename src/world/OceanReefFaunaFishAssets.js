import * as THREE from 'three';
import { OCEAN_REEF_FAUNA_SPECIES, oceanReefFaunaSpeciesById } from '../oceanReefFaunaSpecies.js';

// Unscaled independent animals, +X forward. Complete forms and bounded local
// fin motion share their admission envelope; rendering never edits live data.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
const IDS = OCEAN_REEF_FAUNA_SPECIES.filter(s => s.kind === 'fish').map(s => s.id);
export const OCEAN_REEF_FAUNA_FISH_ASSET_VERSION = 1;
export const isReefFaunaFish = id => IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefFaunaFishResources.has(key)) { root.userData.reefFaunaFishResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const index = positions.length / 3; positions.push(...p);
    colors.push(...(typeof tint === 'function' ? tint(...p) : tint)); return index; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 36, roundness = 1) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; vertex([x, Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** roundness * y, Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** roundness * z], tint);
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
  function ellipsoid(center, scale, tint, sides = 12, rows = 7) {
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
function part(root, name, make, parent = root) {
  const geometry = share(root, `${root.userData.speciesId}/geometry/${name}`, make),
    material = share(root, 'material/nonemissive-fish-tissue', () => new THREE.MeshStandardMaterial({ vertexColors: true,
      roughness: .67, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 })), mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
const profile = (start, end, rows, ry, rz) => Array.from({ length: rows }, (_, i) => {
  const t = i / (rows - 1), full = Math.sin(Math.PI * (.025 + .95 * t)); return [start + (end - start) * t, ry * full, rz * full];
});
function eyes(root, x, y, z, radius = .02) {
  part(root, 'paired eyes', () => shape(b => { for (const s of [-1, 1]) {
    b.ellipsoid([x, y, s * z], [radius, radius, .006], [.73, .69, .42]);
    b.ellipsoid([x + .003, y, s * (z + .005)], [radius * .56, radius * .56, .003], [.025, .028, .025]);
  } }));
}
function tail(root, x, outline, tint) {
  const pivot = new THREE.Group(); pivot.name = 'tail pivot'; pivot.position.x = x; root.add(pivot);
  part(root, 'complete caudal fin', () => shape(b => b.sheet(outline, tint)), pivot); return pivot;
}
function pectorals(root, x, y, z, reach, tint) {
  return [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.name = `pectoral pivot ${s}`; pivot.position.set(x, y, s * z); root.add(pivot);
    part(root, `paired pectoral fin ${s}`, () => shape(b => b.sheet([[0, 0, 0], [-.10, -.05, s * reach], [-.13, .035, s * reach * .65]], tint)), pivot);
    return pivot; });
}

const wrasseTint = (x, y, z) => {
  const waves = Math.sin(x * 88 + Math.sin(y * 25) * 1.9);
  return waves > .83 ? [.30, .43, .27] : [.39, .55, .39];
};
function humpheadWrasse(root) {
  part(root, 'large thick green wrasse body with curved scale lines', () => shape(b => b.body(profile(-.29, .43, 95, .231, .155), wrasseTint, 42)));
  part(root, 'adult forehead hump joined to head', () => shape(b =>
    b.ellipsoid([.280, .205, 0], [.119, .103, .102], wrasseTint, 28, 16)));
  part(root, 'thick rubbery paired lips and terminal mouth', () => shape(b => {
    b.ellipsoid([.467, .024, 0], [.026, .043, .042], [.34, .47, .29], 20, 12);
    b.ellipsoid([.485, .044, 0], [.015, .021, .045], [.45, .57, .36], 20, 10);
    b.ellipsoid([.485, .010, 0], [.015, .018, .043], [.45, .57, .36], 20, 10);
    b.ellipsoid([.499, .026, 0], [.001, .0035, .030], [.07, .11, .07], 14, 7);
  }));
  eyes(root, .332, .121, .091, .021);
  part(root, 'two dark curved lines behind each wrasse eye', () => shape(b => {
    for (const side of [-1, 1]) for (const offset of [0, -.045]) b.tube([
      [.302, .111 + offset, side * .112], [.254, .086 + offset, side * .134],
      [.213, .062 + offset, side * .143]], [.003, .003, .0014], [.14, .23, .16], 6);
  }));
  part(root, 'complete long low dorsal anal and pelvic wrasse fins', () => shape(b => {
    b.sheet([[.233, .178, 0], [.11, .264, 0], [-.17, .245, 0], [-.29, .07, 0], [-.09, .177, 0]], [.38, .49, .30]);
    b.sheet([[.032, -.216, 0], [-.085, -.272, 0], [-.246, -.181, 0], [-.29, -.07, 0]], [.38, .49, .30]);
    for (const side of [-1, 1]) b.sheet([[.12, -.19, side * .057], [.025, -.277, side * .070],
      [-.07, -.18, side * .052]], [.35, .46, .27]);
  }));
  root.userData.motion = { tail: tail(root, -.29, [[0, .034, 0], [-.15, .122, 0], [-.197, .066, 0],
    [-.21, 0, 0], [-.197, -.066, 0], [-.15, -.122, 0], [0, -.034, 0]], [.38, .50, .32]),
    pectorals: pectorals(root, .18, -.013, .126, .060, [.46, .54, .35]) };
}
function bluespineUnicornfish(root) {
  part(root, 'large grey green compressed unicornfish body', () => shape(b => b.body(profile(-.30, .446, 84, .231, .093), [.47, .52, .40], 40)));
  part(root, 'short forehead horn ending behind mouth', () => shape(b => {
    b.tube([[.294, .150, 0], [.366, .232, 0], [.448, .243, 0]], [.040, .024, .004], [.44, .50, .37], 16);
  }));
  part(root, 'small terminal mouth beyond horn', () => shape(b =>
    b.ellipsoid([.488, -.003, 0], [.012, .022, .022], [.43, .44, .29], 16, 10)));
  eyes(root, .318, .108, .077, .020);
  part(root, 'long yellow median fins with narrow blue outer margins', () => shape(b => {
    b.sheet([[.275, .158, 0], [.16, .286, 0], [-.17, .242, 0], [-.30, .039, 0], [-.11, .18, 0]], [.61, .59, .29]);
    b.tube([[.16, .286, 0], [-.06, .268, 0], [-.17, .242, 0], [-.30, .039, 0]], [.004, .004, .004, .002], [.22, .40, .53], 6);
    b.sheet([[.12, -.183, 0], [-.01, -.278, 0], [-.23, -.197, 0], [-.30, -.036, 0]], [.60, .56, .26]);
    b.tube([[-.01, -.278, 0], [-.14, -.251, 0], [-.23, -.197, 0]], [.004, .004, .002], [.22, .40, .53], 6);
    for (const side of [-1, 1]) b.sheet([[.15, -.173, side * .027], [.03, -.225, side * .043],
      [-.025, -.177, side * .035]], [.54, .55, .27]);
  }));
  part(root, 'paired blue peduncle plates and forward directed scalpel spines', () => shape(b => {
    for (const side of [-1, 1]) {
      b.ellipsoid([-.267, 0, side * .034], [.032, .020, .005], [.18, .40, .58], 12, 7);
      b.tube([[-.279, .003, side * .039], [-.228, .006, side * .054]], [.007, .001], [.17, .36, .54], 6);
    }
  }));
  root.userData.motion = { tail: tail(root, -.30, [[0, .035, 0], [-.20, .203, 0], [-.135, .096, 0],
    [-.08, 0, 0], [-.135, -.096, 0], [-.20, -.203, 0], [0, -.035, 0]], [.45, .48, .31]),
    pectorals: pectorals(root, .145, -.020, .091, .060, [.49, .50, .31]) };
}
const clownTint = (x, y, z) => {
  if (y < .018) {
    const u = (x + .5) * 11, v = Math.atan2(z, y) * 4 / Math.PI;
    const dx = u - Math.floor(u) - .5, dy = v - Math.floor(v) - .5;
    if (dx * dx + dy * dy < .145) return [.83, .81, .68];
  }
  if (y > .14 && x < .12) return Math.sin(x * 58) * Math.sin(Math.atan2(z,y) * 12) > -.08 ?
    [.68, .59, .22] : [.15, .17, .11];
  if (x > .39) return [.76, .50, .17];
  return [.095, .12, .085];
};
function clownTriggerfish(root) {
  part(root, 'deep black adult triggerfish with white lower spots and yellow upper network', () => shape(b =>
    b.body(profile(-.28, .455, 105, .246, .109), clownTint, 64)));
  part(root, 'orange thick lips and short terminal mouth', () => shape(b => {
    b.ellipsoid([.484, .009, 0], [.016, .032, .027], [.75, .47, .12], 18, 10);
    b.ellipsoid([.499, .009, 0], [.001, .006, .017], [.13, .12, .07], 14, 6);
  }));
  eyes(root, .325, .112, .087, .022);
  part(root, 'pale band across adult snout in front of eyes', () => shape(b => {
    for (const side of [-1, 1]) b.tube([[.345, .062, side * .090], [.379, .038, side * .075],
      [.404, .006, side * .066]], [.009, .009, .007], [.81, .74, .44], 8);
  }));
  part(root, 'separate upright trigger spine and complete soft median fins', () => shape(b => {
    b.tube([[.21, .17, 0], [.172, .397, 0]], [.012, .0008], [.43, .47, .30], 7);
    b.tube([[.18, .18, 0], [.133, .263, 0]], [.008, .0004], [.38, .42, .26], 6);
    b.sheet([[.03, .216, 0], [-.08, .337, 0], [-.20, .287, 0], [-.28, .074, 0]], [.34, .41, .28]);
    b.sheet([[.03, -.216, 0], [-.10, -.326, 0], [-.21, -.258, 0], [-.28, -.074, 0]], [.34, .41, .28]);
  }));
  part(root, 'adult pale caudal peduncle and posterior small spines', () => shape(b => {
    b.body([[-.291, .029, .026], [-.237, .047, .040]], [.68, .66, .44], 20);
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = -.231 + i * .032, y = -.048 + row * .048, z = side * (.061 - Math.abs(y) * .12);
      b.tube([[x, y, z], [x + .012, y, z + side * .010]], [.0018, .0002], [.31, .34, .22], 5);
    }
  }));
  const caudalTint = x => x < -.17 ? [.11, .14, .08] : x < -.105 ? [.78, .71, .41] : [.17, .22, .13];
  root.userData.motion = { tail: tail(root, -.28, [[0, .031, 0], [-.17, .138, 0], [-.22, .086, 0],
    [-.22, -.086, 0], [-.17, -.138, 0], [0, -.031, 0]], caudalTint),
    pectorals: pectorals(root, .155, -.031, .105, .050, [.39, .45, .29]) };
}
const buildSpecies = { 'humphead-wrasse': humpheadWrasse, 'bluespine-unicornfish': bluespineUnicornfish,
  'clown-triggerfish': clownTriggerfish };
export function createReefFaunaFish(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefFaunaFish(id)) throw new RangeError('Unknown reef fauna fish species.');
  const descriptor = oceanReefFaunaSpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefFaunaFishResources: new Set(), reefFaunaFishDisposed: false,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, footContacts: descriptor.support.footContacts,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { buildSpecies[id](root); instances.add(root); animateReefFaunaFish(root, null, 0); return root; }
  catch (error) { disposeReefFaunaFish(root); throw error; }
}
export function animateReefFaunaFish(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefFaunaFishDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, descriptor = oceanReefFaunaSpeciesById[root.userData.speciesId],
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001;
  motion.tail.rotation.y = Math.sin(clock * (moving ? 3.4 : 1.2) + phase) * descriptor.animationBounds.tailYawRad * (moving ? 1 : .3);
  motion.pectorals.forEach((pivot, i) => { pivot.rotation.x = Math.sin(clock * 1.7 + phase + i * Math.PI) * descriptor.animationBounds.pectoralRollRad; });
  if (motion.firstDorsal) motion.firstDorsal.rotation.y = Math.sin(clock * .9 + phase) * descriptor.animationBounds.firstDorsalYawRad;
  return true;
}
export function disposeReefFaunaFish(root) {
  if (!root?.userData || root.userData.reefFaunaFishDisposed) return false;
  root.userData.reefFaunaFishDisposed = true;
  for (const key of root.userData.reefFaunaFishResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefFaunaFishResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefFaunaFishAssetStats() { return { resources: resources.size, instances: instances.size }; }
