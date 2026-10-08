import * as THREE from 'three';
import { OCEAN_REEF_RESIDENT_IDS, oceanReefResidentsSpeciesById } from '../oceanReefResidentsSpecies.js';

// One independently posed kit per real saved animal. Units are body length;
// lobster antennae remain additional geometry inside the shared full envelope.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const OCEAN_REEF_RESIDENT_ASSET_VERSION = 1;
export const isReefResidentSpecies = id => OCEAN_REEF_RESIDENT_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefResidentResources.has(key)) { root.userData.reefResidentResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const index = positions.length / 3; positions.push(...p); colors.push(...tint); return index; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function body(profile, colorAt, sides = 32) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let side = 0; side <= sides; side++) {
      const angle = TAU * side / sides, p = [x, Math.cos(angle) * y, Math.sin(angle) * z]; vertex(p, colorAt(...p, angle));
    }
    for (let row = 0; row < profile.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1; triangle(a, b, a + 1); triangle(a + 1, b, b + 1);
    }
    for (const [row, reversed] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[row][0], 0, 0], colorAt(profile[row][0], 0, 0, 0));
      for (let side = 0; side < sides; side++) { const a = start + row * (sides + 1) + side;
        reversed ? triangle(c, a + 1, a) : triangle(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 12, rows = 7) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const angle = TAU * side / sides, latitude = Math.PI * row / rows,
        p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1],
          center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, typeof tint === 'function' ? tint(...p) : tint);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
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
      for (let i = 0; i <= sides; i++) { const angle = TAU * i / sides,
        point = p.clone().addScaledVector(side, Math.cos(angle) * radii[row]).addScaledVector(up, Math.sin(angle) * radii[row]);
        vertex(point.toArray(), typeof tint === 'function' ? tint(row, i) : tint); }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1; triangle(a, a + 1, b); triangle(a + 1, b + 1, b);
    }
  }
  function sheet(points, tint) {
    const start = positions.length / 3; points.forEach(p => vertex(p, tint));
    for (let i = 1; i < points.length - 1; i++) triangle(start, start + i, start + i + 1);
  }
  return { body, ellipsoid, tube, sheet, finish() { const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry; } };
}
function part(root, name, make, parent = root) {
  const geometry = share(root, `${root.userData.speciesId}/geometry/${name}`, make),
    material = share(root, 'material/nonemissive-tissue', () => new THREE.MeshStandardMaterial({ vertexColors: true,
      roughness: .64, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 })), mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
const shape = build => { const b = builder(); build(b); return b.finish(); };
const troutTint = (x, y, z, angle = Math.atan2(z, y)) => {
  const u = (x + .5) * 16, v = angle * 6 / Math.PI, ix = Math.floor(u), iy = Math.floor(v),
    dx = u - ix - .5, dy = v - iy - .5, blue = dx * dx + dy * dy < .12 && (ix + iy * 3) % 5 !== 0;
  return blue ? [.13, .34, .46] : y < -.03 ? [.69, .51, .35] : [.53, .28, .18];
};
function trout(root) {
  part(root, 'thick blue-spotted body', () => shape(b => b.body(Array.from({ length: 45 }, (_, i) => {
    const x = -.34 + .82 * i / 44, t = i / 44, shoulder = Math.sin(Math.PI * (.08 + .80 * t)),
      taper = .55 + .45 * Math.sin(Math.PI * t); return [x, .168 * shoulder * taper, .102 * shoulder * taper];
  }), troutTint)));
  part(root, 'wide mouth rim and cavity', () => shape(b => {
    b.ellipsoid([.491, -.015, 0], [.008, .031, .037], [.055, .033, .025]);
    for (let i = 0; i < 18; i++) { const a = TAU * i / 18, next = TAU * (i + 1) / 18;
      b.tube([[.495, -.015 + Math.cos(a) * .040, Math.sin(a) * .047], [.495, -.015 + Math.cos(next) * .040, Math.sin(next) * .047]], [.005, .005], [.64, .39, .25], 4); }
  }));
  part(root, 'paired eyes and gill plates', () => shape(b => { for (const side of [-1, 1]) {
    b.ellipsoid([.355, .059, side * .080], [.025, .026, .008], [.63, .61, .40]);
    b.ellipsoid([.358, .060, side * .088], [.013, .014, .005], [.035, .030, .025]);
    b.tube([[.265, .094, side * .073], [.232, .018, side * .104], [.255, -.075, side * .081]], [.004, .004, .003], [.28, .16, .12], 5);
  } }));
  part(root, 'complete spiny and soft dorsal', () => shape(b => {
    b.sheet([[-.30, .069, 0], [-.26, .218, 0], [-.15, .246, 0], [-.04, .267, 0], [.055, .248, 0],
      [.12, .224, 0], [.22, .203, 0], [.27, .124, 0], [.08, .158, 0]], [.56, .32, .20]);
    for (let i = 0; i < 8; i++) { const x = -.24 + i * .054;
      b.tube([[x, .128, 0], [x - .018, .228 + .025 * Math.sin(i * .5), 0]], [.0025, .001], [.69, .48, .31], 4); }
  }));
  part(root, 'anal and paired pelvic fins', () => shape(b => {
    b.sheet([[-.28, -.062, 0], [-.21, -.207, 0], [-.07, -.207, 0], [.05, -.130, 0]], [.50, .28, .17]);
    for (const side of [-1, 1]) b.sheet([[.08, -.120, side * .035], [-.06, -.218, side * .092], [-.10, -.130, side * .055]], [.57, .35, .23]);
  }));
  const tail = new THREE.Group(); tail.name = 'tail pivot'; tail.position.x = -.34; root.add(tail);
  part(root, 'near-truncate complete caudal fin', () => shape(b => b.sheet([[.025, .037, 0], [-.13, .152, 0], [-.16, .134, 0],
    [-.16, -.134, 0], [-.13, -.152, 0], [.025, -.037, 0]], [.57, .32, .20])), tail);
  const pectorals = [-1, 1].map(side => { const pivot = new THREE.Group(); pivot.name = `pectoral pivot ${side}`;
    pivot.position.set(.18, -.015, side * .10); root.add(pivot);
    part(root, `complete pectoral fin ${side}`, () => shape(b => b.sheet([[0, 0, 0], [-.12, -.084, side * .095], [-.17, .017, side * .060]], [.63, .40, .26])), pivot);
    return pivot; });
  root.userData.motion = { tail, pectorals };
}
function lobster(root) {
  part(root, 'spined green carapace without large claws', () => shape(b => {
    b.ellipsoid([.21, .166, 0], [.28, .132, .154], (x, y, z) => Math.sin(x * 78 + z * 41) > .83 ? [.76, .77, .66] : [.25, .40, .32], 24, 12);
    for (let i = 0; i < 14; i++) { const x = .015 + (i % 7) * .065, side = i < 7 ? -1 : 1;
      b.tube([[x, .242, side * .085], [x + .023, .320, side * .112]], [.012, 0], [.74, .73, .59], 5); }
    for (const side of [-1, 1]) { b.ellipsoid([.43, .269, side * .10], [.040, .011, .011], [.76, .75, .61]);
      b.ellipsoid([.462, .277, side * .105], [.017, .020, .017], [.06, .055, .04]); }
  }));
  part(root, 'six separately banded abdominal segments', () => shape(b => {
    for (let i = 0; i < 6; i++) { const x = -.065 - i * .052;
      b.ellipsoid([x, .108 - i * .004, 0], [.033, .081 - i * .005, .130 - i * .009], [.22, .35, .29], 12, 7);
      for (const side of [-1, 1]) b.tube([[x + .011, .070, side * (.124 - i * .009)], [x + .011, .173 - i * .007, 0]], [.005, .005], [.82, .81, .72], 5);
    }
  }));
  part(root, 'complete five-lobed tail fan', () => shape(b => {
    for (let i = -2; i <= 2; i++) b.sheet([[-.31, .057, i * .023], [-.50, .030, i * .070],
      [-.49, .030, i * .070 + .034], [-.34, .053, i * .023 + .025]], [.48, .52, .37]);
  }));
  const legs = oceanReefResidentsSpeciesById['painted-spiny-lobster'].support.footContacts.map((foot, index) => {
    const side = Math.sign(foot.z), pivot = new THREE.Group(); pivot.name = `walking leg ${Math.floor(index / 2) + 1} ${side}`;
    pivot.position.set(foot.x, 0, foot.z); root.add(pivot);
    part(root, pivot.name, () => shape(b => b.tube([[0, 0, 0], [.038, .094, -side * .110], [-.023, .151, -side * .263],
      [0, .139, -side * .350]], [0, .007, .010, .011], row => row % 2 ? [.83, .82, .71] : [.22, .31, .26], 7)), pivot);
    return pivot;
  });
  const antennae = [-1, 1].map(side => { const pivot = new THREE.Group(); pivot.name = `long white antenna ${side}`;
    pivot.position.set(.34, .19, side * .12); root.add(pivot);
    part(root, pivot.name, () => shape(b => b.tube([[0, 0, 0], [.20, .041, side * .069], [.74, .128, side * .226],
      [1.24, .222, side * .390], [1.77, .279, side * .604]], [.020, .012, .007, .004, .001], [.88, .87, .79], 7)), pivot);
    return pivot;
  });
  part(root, 'paired short antennules', () => shape(b => { for (const side of [-1, 1])
    b.tube([[.435, .168, side * .036], [.680, .195, side * .075], [.88, .174, side * .128]], [.004, .003, .0005], [.84, .82, .70], 5);
  }));
  root.userData.motion = { legs, antennae };
}

export function createReefResidentAnimal(speciesOrId, agent = null) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefResidentSpecies(id)) throw new RangeError('Unknown reef resident species.');
  const descriptor = oceanReefResidentsSpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefResidentResources: new Set(), reefResidentDisposed: false,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, footContacts: descriptor.support.footContacts,
    bodyMeasuredX: descriptor.morphology.bodyMeasuredX, independentAnimal: true, emissionEnabled: false,
    sourceLinks: descriptor.sourceLinks.map(item => ({ ...item })), axes: descriptor.normalizedEnvelope.axes });
  try { id === 'coral-trout' ? trout(root) : lobster(root); instances.add(root); animateReefResidentAnimal(root, agent, 0); return root; }
  catch (error) { disposeReefResidentAnimal(root); throw error; }
}

export function animateReefResidentAnimal(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefResidentDisposed) return false;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, motion = root.userData.motion,
    moving = agent?.alive !== false && Math.hypot(agent?.velocity?.x ?? 0, agent?.velocity?.y ?? 0, agent?.velocity?.z ?? 0) > .0001,
    phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  if (root.userData.speciesId === 'coral-trout') {
    motion.tail.rotation.y = Math.sin(clock * (moving ? 4.2 : 1.5) + phase) * (moving ? .14 : .045);
    motion.pectorals.forEach((part, i) => { part.rotation.x = Math.sin(clock * 2.1 + phase + i * Math.PI) * .08; });
  } else {
    motion.antennae.forEach((part, i) => { part.rotation.y = Math.sin(clock * .64 + phase + i * Math.PI) * .025; });
    // Feet are real neutral contact points; upper segments bend about them.
    // No rendered vertex moves below the foot plane to fake ground contact.
    motion.legs.forEach((part, i) => { part.rotation.z = moving ? Math.sin(clock * 3.2 + phase + i * Math.PI) * .035 : 0; });
  }
  return true;
}

export function disposeReefResidentAnimal(root) {
  if (!root?.userData || root.userData.reefResidentDisposed) return false;
  root.userData.reefResidentDisposed = true;
  for (const key of root.userData.reefResidentResources ?? []) { const row = resources.get(key); if (!row) continue;
    if (--row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefResidentResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export function reefResidentAssetStats() { return { resources: resources.size, instances: instances.size }; }
