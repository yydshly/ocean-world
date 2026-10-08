import * as THREE from 'three';
import { OCEAN_REEF_COMMUNITY_SPECIES, oceanReefCommunitySpeciesById } from '../oceanReefCommunitySpecies.js';

// Unscaled independent animals, +X forward. Complete forms and bounded local
// fin motion share their admission envelope; rendering never edits live data.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
const IDS = OCEAN_REEF_COMMUNITY_SPECIES.filter(s => s.kind === 'fish').map(s => s.id);
export const OCEAN_REEF_COMMUNITY_FISH_ASSET_VERSION = 1;
export const isReefCommunityFish = id => IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefCommunityFishResources.has(key)) { root.userData.reefCommunityFishResources.add(key); row.refs++; }
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
const boxTint = (x, y, z) => {
  const angle = Math.atan2(z, y), u = (x + .5) * 15, v = angle * 3 / Math.PI,
    ix = Math.floor(u), dx = u - ix - .5, dy = v - Math.floor(v) - .5;
  return dx * dx + dy * dy < .07 ? [.18, .21, .12] : y < -.08 ? [.67, .63, .28] : [.77, .68, .24];
};
function yellowBoxfish(root) {
  part(root, 'rounded rectangular rigid boxfish carapace', () => shape(b => b.body(profile(-.31, .43, 65, .207, .178), boxTint, 40, .33)));
  part(root, 'small terminal mouth and forehead bump', () => shape(b => {
    b.ellipsoid([.487, -.043, 0], [.013, .026, .027], [.45, .43, .19]);
    b.ellipsoid([.461, .031, 0], [.032, .040, .039], [.73, .67, .29]);
  }));
  eyes(root, .348, .122, .145, .023);
  part(root, 'small posterior dorsal and anal fins', () => shape(b => {
    b.sheet([[-.10, .15, 0], [-.12, .25, 0], [-.27, .22, 0], [-.29, .083, 0]], [.72, .68, .33]);
    b.sheet([[-.09, -.15, 0], [-.13, -.25, 0], [-.27, -.20, 0], [-.29, -.079, 0]], [.71, .66, .32]);
  }));
  root.userData.motion = { tail: tail(root, -.31, [[0, .033, 0], [-.15, .145, 0], [-.19, .085, 0], [-.19, -.085, 0],
    [-.15, -.145, 0], [0, -.033, 0]], [.70, .66, .29]), pectorals: pectorals(root, .24, -.012, .173, .049, [.76, .71, .36]) };
}
const triggerTint = (x, y) => x > .25 ? [.27, .43, .52] : y < -.08 ? [.16, .27, .33] : [.17, .28, .37];
function redToothedTriggerfish(root) {
  part(root, 'deep blue compressed triggerfish body', () => shape(b => b.body(profile(-.28, .455, 55, .232, .091), triggerTint, 40)));
  part(root, 'upturned mouth with two long red upper teeth', () => shape(b => {
    b.ellipsoid([.488, .035, 0], [.012, .024, .019], [.09, .14, .17]);
    for (const s of [-1, 1]) b.tube([[.493, .048, s * .009], [.496, .013, s * .009]], [.004, .0012], [.62, .24, .15], 7);
  }));
  eyes(root, .320, .099, .071, .024);
  part(root, 'distinct first dorsal trigger spine', () => shape(b => {
    b.tube([[.22, .155, 0], [.17, .449, 0]], [.012, .001], [.33, .46, .51], 7);
    b.tube([[.18, .18, 0], [.13, .285, 0]], [.007, .0004], [.29, .40, .46], 6);
  }));
  part(root, 'elevated complete soft dorsal and anal fins', () => shape(b => {
    b.sheet([[.03, .20, 0], [-.04, .421, 0], [-.16, .356, 0], [-.27, .11, 0], [-.10, .175, 0]], [.27, .43, .49]);
    b.sheet([[.03, -.20, 0], [-.04, -.388, 0], [-.16, -.326, 0], [-.27, -.11, 0], [-.10, -.175, 0]], [.27, .43, .49]);
  }));
  part(root, 'posterior lateral small spines', () => shape(b => { for (const s of [-1, 1]) for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
    const x = -.20 + i * .037, y = -.060 + row * .040, z = s * (.071 - Math.abs(y) * .2);
    b.tube([[x, y, z], [x - .012, y, z + s * .010]], [.002, .0002], [.34, .44, .48], 5);
  } }));
  root.userData.motion = { tail: tail(root, -.28, [[0, .031, 0], [-.14, .22, 0], [-.22, .34, 0], [-.17, .19, 0],
    [-.075, 0, 0], [-.17, -.19, 0], [-.22, -.34, 0], [-.14, -.22, 0], [0, -.031, 0]], [.29, .47, .53]),
    pectorals: pectorals(root, .14, -.03, .089, .049, [.26, .44, .52]) };
}
const batTint = (x, y) => (x > .29 && x < .37) || (x > .04 && x < .145) ||
  (x > -.01 && x < .16 && y < -.13 && y > -.29) ? [.17, .22, .19] : y < -.2 ? [.57, .59, .43] : [.67, .69, .60];
function longfinBatfish(root) {
  part(root, 'non juvenile deep rounded silver batfish body', () => shape(b => {
    b.body(profile(-.28, .435, 72, .417, .068), batTint, 48);
    b.ellipsoid([.28, .355, 0], [.091, .084, .052], batTint, 20, 12);
  }));
  part(root, 'near vertical roundface and small terminal mouth', () => shape(b => {
    b.body([[.32, .229, .047], [.425, .144, .034], [.481, .055, .025]], batTint, 28);
    b.ellipsoid([.491, .018, 0], [.009, .033, .022], [.41, .42, .31]);
  }));
  eyes(root, .348, .154, .057, .025);
  part(root, 'complete adult rounded dorsal fin without juvenile filament', () => shape(b => {
    b.sheet([[.25, .29, 0], [.17, .631, 0], [-.01, .721, 0], [-.19, .615, 0], [-.31, .24, 0], [-.17, .321, 0]], [.62, .60, .37]);
  }));
  part(root, 'complete adult anal and yellow pelvic fins', () => shape(b => {
    b.sheet([[.21, -.28, 0], [.10, -.583, 0], [-.08, -.615, 0], [-.25, -.497, 0], [-.30, -.17, 0]], [.57, .55, .31]);
    for (const s of [-1, 1]) b.sheet([[.20, -.28, s * .029], [.10, -.642, s * .039], [-.035, -.455, s * .026]], [.66, .59, .23]);
  }));
  root.userData.motion = { tail: tail(root, -.28, [[0, .036, 0], [-.18, .241, 0], [-.22, .145, 0], [-.22, -.145, 0],
    [-.18, -.241, 0], [0, -.036, 0]], [.63, .59, .35]), pectorals: pectorals(root, .12, -.017, .067, .071, [.67, .62, .32]) };
}
const pufferTint = (x, y, z) => {
  const centers = [-.25, -.065, .135, .31], saddle = centers.findIndex(c => Math.abs(x - c) < .043);
  if (saddle >= 0 && (y > .020 || saddle === 1 || saddle === 2)) return [.19, .21, .15];
  const angle = Math.atan2(z, y), u = (x + .5) * 27, v = angle * 5 / Math.PI,
    dx = u - Math.floor(u) - .5, dy = v - Math.floor(v) - .5;
  return dx * dx + dy * dy < .065 ? [.52, .43, .26] : [.77, .77, .64];
};
function valentiniPuffer(root) {
  part(root, 'small uninflated rounded toby with four black saddles', () => shape(b => b.body(profile(-.30, .365, 90, .182, .140), pufferTint, 44)));
  part(root, 'sharp small puffer snout without spines', () => shape(b => {
    b.body([[.30, .09, .064], [.42, .038, .031], [.492, .016, .016]], pufferTint, 24);
    b.ellipsoid([.496, -.004, 0], [.004, .010, .011], [.41, .38, .23]);
  }));
  eyes(root, .271, .086, .097, .028);
  part(root, 'small posterior dorsal and anal fins without pelvic fins', () => shape(b => {
    b.sheet([[-.09, .123, 0], [-.17, .235, 0], [-.27, .167, 0], [-.28, .068, 0]], [.71, .68, .43]);
    b.sheet([[-.09, -.123, 0], [-.17, -.211, 0], [-.27, -.147, 0], [-.28, -.068, 0]], [.71, .68, .43]);
  }));
  root.userData.motion = { tail: tail(root, -.30, [[0, .027, 0], [-.16, .129, 0], [-.20, .08, 0], [-.20, -.08, 0],
    [-.16, -.129, 0], [0, -.027, 0]], [.65, .60, .34]), pectorals: pectorals(root, .16, -.005, .129, .046, [.72, .69, .47]) };
}
const buildSpecies = { 'yellow-boxfish': yellowBoxfish, 'red-toothed-triggerfish': redToothedTriggerfish, 'longfin-batfish': longfinBatfish, 'valentini-puffer': valentiniPuffer };
export function createReefCommunityFish(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefCommunityFish(id)) throw new RangeError('Unknown reef community fish species.');
  const descriptor = oceanReefCommunitySpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefCommunityFishResources: new Set(), reefCommunityFishDisposed: false,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, footContacts: descriptor.support.footContacts,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { buildSpecies[id](root); instances.add(root); animateReefCommunityFish(root, null, 0); return root; }
  catch (error) { disposeReefCommunityFish(root); throw error; }
}
export function animateReefCommunityFish(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefCommunityFishDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, descriptor = oceanReefCommunitySpeciesById[root.userData.speciesId],
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001;
  motion.tail.rotation.y = Math.sin(clock * (moving ? 3.4 : 1.2) + phase) * descriptor.animationBounds.tailYawRad * (moving ? 1 : .3);
  motion.pectorals.forEach((pivot, i) => { pivot.rotation.x = Math.sin(clock * 1.7 + phase + i * Math.PI) * descriptor.animationBounds.pectoralRollRad; });
  return true;
}
export function disposeReefCommunityFish(root) {
  if (!root?.userData || root.userData.reefCommunityFishDisposed) return false;
  root.userData.reefCommunityFishDisposed = true;
  for (const key of root.userData.reefCommunityFishResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefCommunityFishResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefCommunityFishAssetStats() { return { resources: resources.size, instances: instances.size }; }
