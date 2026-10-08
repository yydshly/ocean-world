import * as THREE from 'three';
import { OCEAN_REEF_LIFE_SPECIES, oceanReefLifeSpeciesById } from '../oceanReefLifeSpecies.js';

// Unscaled independent animals, +X forward. Complete forms and bounded local
// fin motion share their admission envelope; rendering never edits live data.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
const IDS = OCEAN_REEF_LIFE_SPECIES.filter(s => s.kind === 'fish').map(s => s.id);
export const OCEAN_REEF_LIFE_FISH_ASSET_VERSION = 1;
export const isReefLifeFish = id => IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefLifeFishResources.has(key)) { root.userData.reefLifeFishResources.add(key); row.refs++; }
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
const copperTint = x => [.285, .130, -.045, -.225].some(c => Math.abs(x - c) < .036) ? [.70, .41, .17] : [.83, .82, .70];
function copperbandButterflyfish(root) {
  part(root, 'silver deep copperband body', () => shape(b => b.body(profile(-.28, .325, 86, .240, .058), copperTint, 44)));
  part(root, 'copperband shorter tubular snout and terminal mouth', () => shape(b => {
    b.body([[.285, .074, .039], [.385, .031, .021], [.494, .017, .015]], copperTint, 24);
    b.ellipsoid([.497, -.006, 0], [.003, .008, .011], [.30, .29, .17]);
  }));
  eyes(root, .255, .093, .049, .023);
  part(root, 'complete square backed copperband dorsal and anal fins', () => shape(b => {
    b.sheet([[.21, .142, 0], [.10, .295, 0], [-.115, .336, 0], [-.278, .290, 0], [-.290, .070, 0], [-.09, .177, 0]], copperTint);
    b.sheet([[.16, -.163, 0], [.03, -.294, 0], [-.13, -.310, 0], [-.279, -.259, 0], [-.290, -.070, 0]], copperTint);
    for (const side of [-1, 1]) b.sheet([[.11, -.161, side * .023], [-.015, -.313, side * .039], [-.08, -.174, side * .034]], [.72, .52, .25]);
  }));
  part(root, 'rear dorsal false eyespot on both sides', () => shape(b => { for (const side of [-1, 1]) {
    b.ellipsoid([-.202, .266, side * .003], [.049, .045, .002], [.80, .72, .48]);
    b.ellipsoid([-.202, .266, side * .005], [.036, .033, .002], [.09, .105, .075]);
  } }));
  root.userData.motion = { tail: tail(root, -.28, [[0, .032, 0], [-.20, .135, 0], [-.22, .092, 0], [-.22, -.092, 0],
    [-.20, -.135, 0], [0, -.032, 0]], [.72, .57, .30]), pectorals: pectorals(root, .055, -.019, .058, .055, [.81, .77, .53]) };
}
const forcepsTint = (x, y) => x > .130 && y > .024 ? [.075, .092, .063] : x > .07 && y < .035 ? [.82, .83, .73] : [.80, .68, .19];
function longnoseButterflyfish(root) {
  part(root, 'yellow forcepsfish body with black upper head', () => shape(b => b.body(profile(-.29, .205, 66, .249, .052), forcepsTint, 44)));
  part(root, 'long narrow forceps snout with white lower head', () => shape(b => {
    b.body([[.13, .099, .035], [.245, .059, .025], [.39, .029, .015], [.494, .012, .009]], forcepsTint, 28);
    b.ellipsoid([.497, -.002, 0], [.003, .006, .008], [.49, .46, .20]);
  }));
  eyes(root, .223, .062, .030, .022);
  part(root, 'complete yellow spiny dorsal anal and paired pelvic fins', () => shape(b => {
    b.sheet([[.12, .19, 0], [.025, .407, 0], [-.155, .444, 0], [-.28, .28, 0], [-.30, .088, 0]], [.78, .66, .19]);
    for (let i = 0; i < 12; i++) { const x = .10 - i * .029;
      b.tube([[x, .15, 0], [x - .013, .29 + .113 * Math.sin(Math.PI * i / 11), 0]], [.0024, .0004], [.74, .67, .26], 5); }
    b.sheet([[.11, -.18, 0], [-.016, -.349, 0], [-.20, -.336, 0], [-.30, -.09, 0]], [.77, .67, .22]);
    for (const side of [-1, 1]) b.sheet([[.03, -.201, side * .019], [-.07, -.333, side * .032], [-.14, -.164, side * .027]], [.75, .66, .24]);
  }));
  part(root, 'rear anal false eyespot on both sides', () => shape(b => { for (const side of [-1, 1])
    b.ellipsoid([-.209, -.259, side * .003], [.030, .031, .002], [.075, .10, .067]);
  }));
  root.userData.motion = { tail: tail(root, -.29, [[0, .026, 0], [-.19, .122, 0], [-.21, .086, 0], [-.21, -.086, 0],
    [-.19, -.122, 0], [0, -.026, 0]], [.81, .73, .32]), pectorals: pectorals(root, -.04, -.017, .052, .048, [.80, .75, .39]) };
}
const fireTint = x => { const red = THREE.MathUtils.clamp((.07 - x) / .37, 0, 1);
  return [.85 - .20 * red, .81 - .56 * red, .73 - .50 * red]; };
function fireGoby(root) {
  part(root, 'small white to red slender firegoby body', () => shape(b => b.body(profile(-.32, .475, 58, .074, .035), fireTint, 32)));
  part(root, 'small terminal firegoby mouth', () => shape(b => b.ellipsoid([.491, -.003, 0], [.009, .010, .010], [.69, .64, .48])));
  eyes(root, .340, .030, .034, .020);
  part(root, 'long second dorsal anal and white paired pelvic fins', () => shape(b => {
    b.sheet([[.01, .065, 0], [-.05, .157, 0], [-.28, .138, 0], [-.33, .025, 0]], [.70, .36, .31]);
    b.sheet([[.025, -.059, 0], [-.07, -.137, 0], [-.29, -.115, 0], [-.33, -.025, 0]], [.69, .32, .28]);
    for (const side of [-1, 1]) b.sheet([[.16, -.064, side * .010], [.035, -.147, side * .032], [-.03, -.074, side * .020]], [.83, .78, .62]);
  }));
  const firstDorsal = new THREE.Group(); firstDorsal.name = 'upright first dorsal pivot'; firstDorsal.position.set(.20, .060, 0); root.add(firstDorsal);
  part(root, 'very long upright first dorsal fin', () => shape(b => {
    b.tube([[0, 0, 0], [-.030, .35, 0], [-.085, .572, 0], [-.109, .612, 0]], [.007, .004, .0017, .0005], [.88, .81, .59], 7);
    b.sheet([[0, 0, 0], [-.085, .572, 0], [-.134, .32, 0], [-.175, 0, 0]], [.84, .76, .53]);
  }), firstDorsal);
  root.userData.motion = { tail: tail(root, -.32, [[0, .018, 0], [-.14, .095, 0], [-.18, .052, 0], [-.18, -.052, 0],
    [-.14, -.095, 0], [0, -.018, 0]], [.68, .25, .22]), pectorals: pectorals(root, .19, -.016, .034, .034, [.83, .77, .60]), firstDorsal };
}
const pajamaTint = (x, y, z) => {
  if (x > .075) return [.75, .67, .37]; if (x > -.03) return [.12, .16, .12];
  const u = (x + .5) * 14, v = Math.atan2(z, y) * 3 / Math.PI, dx = u - Math.floor(u) - .5, dy = v - Math.floor(v) - .5;
  return dx * dx + dy * dy < .11 ? [.52, .30, .35] : [.80, .76, .68];
};
function pajamaCardinalfish(root) {
  part(root, 'yellow head mid black bar and spotted rear cardinal body', () => shape(b => b.body(profile(-.30, .45, 81, .203, .066), pajamaTint, 44)));
  part(root, 'small cardinal terminal mouth', () => shape(b => b.ellipsoid([.491, -.019, 0], [.009, .022, .024], [.51, .46, .28])));
  part(root, 'large paired eyes with red iris', () => shape(b => { for (const side of [-1, 1]) {
    b.ellipsoid([.331, .070, side * .058], [.035, .037, .007], [.71, .31, .20]);
    b.ellipsoid([.334, .070, side * .064], [.023, .025, .004], [.075, .085, .06]);
  } }));
  part(root, 'separate first spiny dorsal and second soft dorsal fins', () => shape(b => {
    b.sheet([[.23, .102, 0], [.10, .341, 0], [-.012, .168, 0], [-.017, .145, 0]], [.19, .24, .15]);
    b.tube([[.12, .171, 0], [.10, .341, 0]], [.003, .0004], [.34, .37, .23], 5);
    b.sheet([[-.06, .137, 0], [-.155, .257, 0], [-.285, .170, 0], [-.30, .049, 0]], [.67, .59, .44]);
  }));
  part(root, 'complete anal and dark paired pelvic fins', () => shape(b => {
    b.sheet([[-.065, -.142, 0], [-.16, -.257, 0], [-.285, -.158, 0], [-.30, -.049, 0]], [.62, .56, .42]);
    for (const side of [-1, 1]) b.sheet([[.15, -.166, side * .023], [.025, -.286, side * .032], [-.027, -.159, side * .037]], [.18, .23, .14]);
  }));
  root.userData.motion = { tail: tail(root, -.30, [[0, .026, 0], [-.20, .175, 0], [-.13, 0, 0], [-.20, -.175, 0],
    [0, -.026, 0]], [.66, .59, .43]), pectorals: pectorals(root, .10, -.02, .063, .058, [.73, .68, .43]) };
}
const buildSpecies = { 'copperband-butterflyfish': copperbandButterflyfish, 'longnose-butterflyfish': longnoseButterflyfish,
  'fire-goby': fireGoby, 'pajama-cardinalfish': pajamaCardinalfish };
export function createReefLifeFish(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefLifeFish(id)) throw new RangeError('Unknown reef life fish species.');
  const descriptor = oceanReefLifeSpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefLifeFishResources: new Set(), reefLifeFishDisposed: false,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, footContacts: descriptor.support.footContacts,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { buildSpecies[id](root); instances.add(root); animateReefLifeFish(root, null, 0); return root; }
  catch (error) { disposeReefLifeFish(root); throw error; }
}
export function animateReefLifeFish(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefLifeFishDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, descriptor = oceanReefLifeSpeciesById[root.userData.speciesId],
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001;
  motion.tail.rotation.y = Math.sin(clock * (moving ? 3.4 : 1.2) + phase) * descriptor.animationBounds.tailYawRad * (moving ? 1 : .3);
  motion.pectorals.forEach((pivot, i) => { pivot.rotation.x = Math.sin(clock * 1.7 + phase + i * Math.PI) * descriptor.animationBounds.pectoralRollRad; });
  if (motion.firstDorsal) motion.firstDorsal.rotation.y = Math.sin(clock * .9 + phase) * descriptor.animationBounds.firstDorsalYawRad;
  return true;
}
export function disposeReefLifeFish(root) {
  if (!root?.userData || root.userData.reefLifeFishDisposed) return false;
  root.userData.reefLifeFishDisposed = true;
  for (const key of root.userData.reefLifeFishResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefLifeFishResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefLifeFishAssetStats() { return { resources: resources.size, instances: instances.size }; }
