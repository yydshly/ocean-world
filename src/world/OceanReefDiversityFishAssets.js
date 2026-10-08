import * as THREE from 'three';
import { OCEAN_REEF_DIVERSITY_SPECIES, oceanReefDiversitySpeciesById } from '../oceanReefDiversitySpecies.js';

// Unscaled independent animals, +X forward. Complete forms and bounded local
// fin motion share their admission envelope; rendering never edits live data.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
const IDS = OCEAN_REEF_DIVERSITY_SPECIES.filter(s => s.kind === 'fish').map(s => s.id);
export const OCEAN_REEF_DIVERSITY_FISH_ASSET_VERSION = 1;
export const isReefDiversityFish = id => IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefDiversityFishResources.has(key)) { root.userData.reefDiversityFishResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const index = positions.length / 3; positions.push(...p);
    colors.push(...(typeof tint === 'function' ? tint(...p) : tint)); return index; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 36) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; vertex([x, Math.cos(angle) * y, Math.sin(angle) * z], tint);
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
const lionTint = x => Math.sin((x + .5) * 63) > -.1 ? [.56, .24, .15] : [.82, .76, .62];
function lionfish(root) {
  part(root, 'red and cream barred lionfish body', () => shape(b => b.body(profile(-.26, .46, 64, .174, .103), lionTint)));
  part(root, 'broad mouth and head appendages', () => shape(b => {
    b.ellipsoid([.490, -.014, 0], [.010, .037, .046], [.24, .18, .12]);
    for (const s of [-1, 1]) { b.tube([[.30, .107, s * .061], [.26, .209, s * .078]], [.014, .002], [.56, .27, .18], 7);
      b.tube([[.44, -.049, s * .037], [.43, -.108, s * .045]], [.008, .001], [.72, .57, .40], 6); }
  }));
  eyes(root, .355, .071, .079, .025);
  part(root, 'thirteen long dorsal spines with membranes', () => shape(b => {
    for (let i = 0; i < 13; i++) { const x = -.22 + i * .043, tip = [x - .07, .57 + .17 * Math.sin(Math.PI * i / 12), 0];
      b.tube([[x, .10, 0], tip], [.008, .001], [.80, .74, .60], 7);
      if (i) b.sheet([[x, .105, 0], tip, [x - .09, .48 + .15 * Math.sin(Math.PI * (i - 1) / 12), 0]], lionTint); }
  }));
  const fans = [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.name = `radiating pectoral pivot ${s}`;
    pivot.position.set(.16, -.02, s * .08); root.add(pivot);
    part(root, `wide radiating pectoral fan ${s}`, () => shape(b => {
      const tips = Array.from({ length: 9 }, (_, i) => { const a = -.9 + 1.8 * i / 8;
        return [-.10 - .22 * Math.cos(a), .27 * Math.sin(a), s * (.42 + .08 * Math.cos(a))]; });
      for (let i = 0; i < tips.length; i++) { b.tube([[0, 0, 0], tips[i]], [.006, .001], [.76, .70, .58], 6);
        if (i) b.sheet([[0, 0, 0], tips[i - 1].map((v, axis) => axis === 2 ? v * .88 : v * .82),
          tips[i].map((v, axis) => axis === 2 ? v * .88 : v * .82)], lionTint); }
    }), pivot); return pivot; });
  part(root, 'anal and paired pelvic fins', () => shape(b => {
    b.sheet([[-.24, -.05, 0], [-.23, -.28, 0], [-.09, -.26, 0], [.04, -.14, 0]], lionTint);
    for (const s of [-1, 1]) b.sheet([[.13, -.13, s * .034], [-.02, -.29, s * .09], [-.07, -.16, s * .08]], lionTint);
  }));
  root.userData.motion = { tail: tail(root, -.26, [[0, .035, 0], [-.24, .19, 0], [-.24, -.19, 0], [0, -.035, 0]], lionTint), pectorals: fans };
}
function trumpetfish(root) {
  const tint = (x, y) => Math.sin(y * 430) > .5 ? [.71, .63, .28] : [.43, .47, .23];
  part(root, 'slender long trumpetfish body', () => shape(b => b.body(profile(-.37, .21, 44, .042, .027), tint)));
  part(root, 'long tubular snout and small terminal mouth', () => shape(b => {
    b.body([[.16, .030, .020], [.27, .020, .018], [.43, .019, .017], [.49, .025, .019], [.50, .015, .015]], tint, 20);
    b.tube([[.48, -.021, 0], [.45, -.066, 0]], [.003, .0004], [.50, .47, .20], 5);
  }));
  eyes(root, .18, .021, .027, .014);
  part(root, 'ten isolated short dorsal spines', () => shape(b => {
    for (let i = 0; i < 10; i++) { const x = -.08 + i * .025;
      b.tube([[x, .034, 0], [x - .012, .071, 0]], [.0024, .0002], [.58, .53, .25], 5); }
  }));
  part(root, 'posterior dorsal and anal fins', () => shape(b => {
    b.sheet([[-.15, .026, 0], [-.22, .109, 0], [-.35, .090, 0], [-.37, .017, 0]], [.62, .58, .28]);
    b.sheet([[-.15, -.026, 0], [-.22, -.092, 0], [-.35, -.081, 0], [-.37, -.017, 0]], [.60, .55, .25]);
    for (const s of [-1, 1]) b.sheet([[.02, -.031, s * .005], [-.03, -.067, s * .026], [-.07, -.029, s * .009]], [.64, .59, .26]);
  }));
  root.userData.motion = { tail: tail(root, -.37, [[0, .016, 0], [-.13, .055, 0], [-.13, -.055, 0], [0, -.016, 0]], [.67, .59, .23]),
    pectorals: pectorals(root, .09, -.006, .024, .040, [.61, .58, .28]) };
}
const idolTint = (x, y) => x > .28 ? [.82, .69, .17] : (x > .055 && x < .17) || x < -.13 ? [.035, .046, .041] :
  y < .09 && x > -.13 && x < .04 ? [.90, .77, .18] : [.88, .86, .72];
function moorishIdol(root) {
  part(root, 'black white yellow disc body', () => shape(b => b.body(profile(-.29, .32, 72, .279, .055), idolTint, 44)));
  part(root, 'tubular small snout and eye horns', () => shape(b => {
    b.body([[.26, .082, .035], [.39, .031, .021], [.50, .019, .015]], idolTint, 24);
    for (const s of [-1, 1]) b.tube([[.23, .10, s * .036], [.21, .157, s * .046]], [.006, .0005], [.85, .78, .49], 6);
  }));
  eyes(root, .215, .065, .048, .024);
  part(root, 'complete sickle dorsal and deep anal fins', () => shape(b => {
    b.sheet([[.10, .22, 0], [.075, .59, 0], [-.05, .48, 0], [-.24, .32, 0], [-.30, .10, 0]], idolTint);
    b.sheet([[.14, -.19, 0], [.02, -.36, 0], [-.16, -.35, 0], [-.30, -.12, 0]], idolTint);
    for (const s of [-1, 1]) b.sheet([[.15, -.20, s * .025], [.055, -.365, s * .035], [-.02, -.21, s * .04]], [.82, .78, .46]);
  }));
  const pennant = new THREE.Group(); pennant.name = 'dorsal pennant pivot'; root.add(pennant);
  part(root, 'long curved dorsal pennant', () => shape(b => {
    b.tube([[.07, .55, 0], [.03, .73, 0], [-.11, .865, 0], [-.34, .89, 0], [-.61, .80, 0]],
      [.018, .013, .008, .004, .0005], [.90, .88, .73], 7);
  }), pennant);
  root.userData.motion = { tail: tail(root, -.29, [[0, .04, 0], [-.21, .22, 0], [-.16, 0, 0], [-.21, -.22, 0], [0, -.04, 0]], [.05, .057, .048]),
    pectorals: pectorals(root, .12, -.02, .055, .055, [.81, .79, .55]), pennant };
}
const tangTint = (x, y) => Math.sin((x + .5) * 62 + y * .6) > -.08 ? [.29, .34, .25] : [.71, .66, .32];
function sailfinTang(root) {
  part(root, 'barred compressed sailfin body', () => shape(b => b.body(profile(-.28, .36, 72, .263, .060), tangTint, 44)));
  part(root, 'short tang snout and small mouth', () => shape(b => b.body([[.28, .092, .041], [.40, .052, .027], [.50, .019, .016]], tangTint, 24)));
  eyes(root, .245, .105, .054, .022);
  part(root, 'tall complete sail dorsal fin', () => shape(b => {
    const outline = [[.23, .16, 0], [.22, .51, 0], [.09, .64, 0], [-.09, .65, 0], [-.25, .51, 0], [-.31, .16, 0]];
    b.sheet([[0, .17, 0], ...outline, [.12, .22, 0]], tangTint);
    for (let i = 0; i < 14; i++) { const x = -.26 + i * .036;
      b.tube([[x, .17, 0], [x, .47 + .17 * Math.sin(Math.PI * i / 13), 0]], [.002, .001], [.62, .61, .35], 5); }
  }));
  part(root, 'wide complete sail anal and pelvic fins', () => shape(b => {
    b.sheet([[0, -.17, 0], [.21, -.20, 0], [.13, -.45, 0], [-.01, -.56, 0], [-.21, -.51, 0], [-.31, -.12, 0]], tangTint);
    for (const s of [-1, 1]) b.sheet([[.15, -.20, s * .024], [.03, -.33, s * .035], [-.07, -.20, s * .043]], [.54, .56, .31]);
  }));
  part(root, 'two short caudal peduncle spines', () => shape(b => { for (const s of [-1, 1])
    b.tube([[-.26, 0, s * .025], [-.31, 0, s * .070]], [.005, .0005], [.75, .73, .45], 6);
  }));
  root.userData.motion = { tail: tail(root, -.28, [[0, .025, 0], [-.22, .20, 0], [-.18, 0, 0], [-.22, -.20, 0], [0, -.025, 0]], [.75, .66, .27]),
    pectorals: pectorals(root, .13, -.016, .058, .048, [.61, .60, .37]) };
}
const buildSpecies = { lionfish, 'chinese-trumpetfish': trumpetfish, 'moorish-idol': moorishIdol, 'sailfin-tang': sailfinTang };
export function createReefDiversityFish(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefDiversityFish(id)) throw new RangeError('Unknown reef diversity fish species.');
  const descriptor = oceanReefDiversitySpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefDiversityFishResources: new Set(), reefDiversityFishDisposed: false,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, footContacts: descriptor.support.footContacts,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { buildSpecies[id](root); instances.add(root); animateReefDiversityFish(root, null, 0); return root; }
  catch (error) { disposeReefDiversityFish(root); throw error; }
}
export function animateReefDiversityFish(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefDiversityFishDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, descriptor = oceanReefDiversitySpeciesById[root.userData.speciesId],
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001;
  motion.tail.rotation.y = Math.sin(clock * (moving ? 3.4 : 1.2) + phase) * descriptor.animationBounds.tailYawRad * (moving ? 1 : .3);
  motion.pectorals.forEach((pivot, i) => { pivot.rotation.x = Math.sin(clock * 1.7 + phase + i * Math.PI) * descriptor.animationBounds.pectoralRollRad; });
  if (motion.pennant) motion.pennant.rotation.y = Math.sin(clock * .7 + phase) * descriptor.animationBounds.dorsalFilamentYawRad;
  return true;
}
export function disposeReefDiversityFish(root) {
  if (!root?.userData || root.userData.reefDiversityFishDisposed) return false;
  root.userData.reefDiversityFishDisposed = true;
  for (const key of root.userData.reefDiversityFishResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefDiversityFishResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefDiversityFishAssetStats() { return { resources: resources.size, instances: instances.size }; }
