import * as THREE from 'three';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const OCEAN_BENTHIC_LIFE_ASSET_VERSION = 1;
export const OCEAN_BENTHIC_LIFE_IDS = Object.freeze(['tiger-cowrie', 'spotted-hermit-crab', 'blue-spotted-ray', 'reef-goatfish']);
export const OCEAN_BENTHIC_LIFE_ENVELOPES = Object.freeze({
  'tiger-cowrie': Object.freeze({ sizeMeasure: 'shell-length', horizontalRadius: .72, minY: 0, maxY: .50,
    localBounds: Object.freeze({ minX: -.52, maxX: .70, minZ: -.33, maxZ: .33 }), pitchLimit: 0 }),
  'spotted-hermit-crab': Object.freeze({ sizeMeasure: 'borrowed-shell-length', horizontalRadius: 1.1, minY: 0, maxY: .78,
    localBounds: Object.freeze({ minX: -.66, maxX: .98, minZ: -.66, maxZ: .66 }), pitchLimit: 0 }),
  'blue-spotted-ray': Object.freeze({ sizeMeasure: 'disc-width', horizontalRadius: 2.2, minY: 0, maxY: .12,
    localBounds: Object.freeze({ minX: -2.16, maxX: .45, minZ: -.52, maxZ: .52 }), pitchLimit: 0 }),
  'reef-goatfish': Object.freeze({ sizeMeasure: 'total-length', horizontalRadius: .57, minY: -.30, maxY: .22,
    localBounds: Object.freeze({ minX: -.5, maxX: .5, minZ: -.15, maxZ: .15 }), pitchLimit: .25 }),
});
export const isOceanBenthicLifeSpecies = id => OCEAN_BENTHIC_LIFE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.benthicLifeResources.has(key)) { root.userData.benthicLifeResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const id = positions.length / 3; positions.push(...p); colors.push(...tint); return id; };
  const face = (a, b, c, omit) => { if (!omit?.([a, b, c].map(i => positions.slice(i * 3, i * 3 + 3)))) indices.push(a, b, c); };
  function ellipsoid(center, scale, tint, sides = 16, rows = 8, colorAt = null, omit = null) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1],
        center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, colorAt?.(...p) ?? tint);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
      if (row) face(a, a + 1, b, omit); if (row < rows - 1) face(a + 1, b + 1, b, omit);
    }
  }
  function tube(points, radii, tint, sides = 6) {
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const p = new THREE.Vector3(...points[i]), tangent = new THREE.Vector3(...points[Math.min(i + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(0, i - 1)])).normalize();
      const a = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let side = 0; side < sides; side++) {
        const angle = side * TAU / sides, point = p.clone().addScaledVector(a, Math.cos(angle) * radii[i]).addScaledVector(b, Math.sin(angle) * radii[i]);
        vertex(point.toArray(), typeof tint === 'function' ? tint(i, side) : tint);
      }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, b = start + row * sides + (side + 1) % sides;
      face(a, b, a + sides); face(b, b + sides, a + sides);
    }
  }
  function sheet(points, tint) {
    const start = positions.length / 3; for (const point of points) vertex(point, tint);
    for (let i = 1; i < points.length - 1; i++) face(start, start + i, start + i + 1);
  }
  return { ellipsoid, tube, sheet, vertex, face, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function cowrieShell() {
  const b = builder(), spots = Array.from({ length: 31 }, (_, i) => {
    const angle = i * 2.3999632297, ring = Math.sqrt((i + .5) / 31);
    return [Math.cos(angle) * ring * .42, Math.sin(angle) * ring * .23, .025 + (i % 4) * .007];
  });
  b.ellipsoid([0, .255, 0], [.5, .235, .30], [.72, .65, .49], 32, 16, (x, y, z) => {
    if (y > .15 && spots.some(([sx, sz, r]) => (x - sx) ** 2 + (z - sz) ** 2 < r * r)) return [.18, .15, .11];
    return y < .18 ? [.76, .70, .56] : [.71, .63, .46];
  }, corners => corners.every(p => p[1] < .115 && Math.abs(p[2]) < .095));
  b.sheet([[-.40, .055, -.045], [.40, .055, -.045], [.40, .055, .045], [-.40, .055, .045]], [.13, .105, .085]);
  for (const side of [-1, 1]) {
    b.tube([[-.41, .072, side * .070], [0, .056, side * .058], [.41, .072, side * .070]], [.022, .024, .022], [.80, .73, .59], 8);
    for (let i = 0; i < 14; i++) {
      const x = -.36 + i * .055;
      b.tube([[x, .064, side * .075], [x, .060, side * .033]], [.010, .008], [.78, .71, .58], 4);
    }
  }
  return b.finish();
}
function cowrieMantle() {
  const b = builder();
  for (const side of [-1, 1]) {
    b.ellipsoid([.035, .105, side * .215], [.43, .085, .092], [.43, .36, .25], 20, 8);
    for (let i = 0; i < 8; i++) b.tube([[-.29 + i * .082, .14, side * .25], [-.28 + i * .082, .20 + (i % 3) * .011, side * .22]],
      [.010, .002], [.48, .40, .29], 4);
  }
  return b.finish();
}
function cowrieFoot() {
  const b = builder(); b.ellipsoid([.035, .023, 0], [.485, .023, .225], [.48, .40, .28], 24, 8);
  b.ellipsoid([.46, .055, 0], [.11, .048, .09], [.47, .40, .29], 12, 6);
  for (const side of [-1, 1]) {
    b.tube([[.52, .07, side * .055], [.61, .11, side * .10], [.68, .12, side * .13]], [.009, .005, .001], [.49, .43, .31]);
    b.ellipsoid([.576, .089, side * .07], [.006, .008, .006], [.08, .075, .06], 8, 4);
  }
  return b.finish();
}
function hermitShell() {
  const b = builder();
  b.ellipsoid([-.15, .405, 0], [.50, .30, .31], [.56, .49, .37], 24, 12, (x, y, z) => {
    const band = .035 * Math.sin((x + y * .7) * 29 + z * 8); return [.56 + band, .49 + band, .37 + band];
  });
  b.ellipsoid([-.37, .575, -.025], [.27, .195, .23], [.60, .53, .41], 16, 8);
  b.ellipsoid([-.48, .658, -.02], [.12, .105, .115], [.62, .56, .45], 12, 8);
  const coil = Array.from({ length: 27 }, (_, i) => { const angle = i / 26 * TAU * 1.7, r = .035 + i / 26 * .245;
    return [-.27 + Math.cos(angle) * r, .42 + Math.sin(angle) * r, -.285 - .018 * i / 26]; });
  b.tube(coil, coil.map(() => .012), [.37, .31, .23], 5);
  b.ellipsoid([.29, .245, 0], [.055, .17, .205], [.16, .125, .09], 16, 8);
  return b.finish();
}
function hermitBody() {
  const b = builder(); b.ellipsoid([.32, .185, 0], [.19, .12, .19], [.58, .21, .12], 16, 8);
  for (const side of [-1, 1]) {
    b.tube([[.40, .235, side * .10], [.50, .315, side * .115]], [.017, .011], [.57, .22, .13]);
    b.ellipsoid([.503, .322, side * .116], [.021, .020, .021], [.095, .065, .04], 8, 6);
    b.tube([[.43, .21, side * .065], [.65, .26, side * .17], [.76, .29, side * .23]], [.004, .0025, .001], [.66, .35, .21], 4);
  }
  return b.finish();
}
const hermitRed = (row, side) => (row + side) % 4 === 0 ? [.80, .72, .59] : [.62, .24, .14];
function hermitLeg(side, index) {
  const b = builder(), x = .18 + index * .12;
  b.tube([[x, .19, side * .12], [x - .12, .19, side * .40], [x + .03, .03, side * .61], [x + .10, .006, side * .63]],
    [.030, .030, .013, .003], hermitRed, 6); return b.finish();
}
function hermitClaw(side) {
  const b = builder(), large = side < 0, width = large ? .10 : .075;
  b.tube([[.37, .16, side * .14], [.61, .10, side * .32], [.74, .12, side * .28]], [.058, .060, .055], hermitRed, 8);
  b.ellipsoid([.78, .13, side * .25], [.10, .068, width], [.65, .27, .15], 12, 8,
    (x, y, z) => Math.sin(x * 117 + y * 89 + z * 71) > .90 ? [.83, .77, .64] : [.65, .27, .15]);
  b.tube([[.83, .12, side * .21], [.94, .08, side * .16], [.89, .075, side * .20]], [.028, .018, .008], [.67, .30, .17]);
  b.tube([[.83, .14, side * .29], [.93, .15, side * .24]], [.024, .012], [.67, .30, .17]);
  return b.finish();
}
function rayDisc(side = 0) {
  const b = builder(), spots = Array.from({ length: 23 }, (_, i) => [Math.cos(i * 2.39996) * Math.sqrt((i + .5) / 23) * .32,
    Math.sin(i * 2.39996) * Math.sqrt((i + .5) / 23) * .42]);
  const rows = 10, columns = 24, start = 0;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const angle = column / columns * TAU, radius = row / rows;
    const x = Math.cos(angle) * .43 * radius, z = Math.sin(angle) * .5 * radius;
    const y = .034 + .032 * (1 - radius * radius), blue = spots.some(([sx, sz]) => (x - sx) ** 2 + (z - sz) ** 2 < .0010);
    b.vertex([x, y, z], blue ? [.23, .45, .53] : [.58 + .04 * radius, .53 + .03 * radius, .36]);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = start + row * (columns + 1) + column, n = a + columns + 1;
    const z = Math.sin((column + .5) / columns * TAU);
    if (side && z * side < 0 || !side && Math.abs(z) > .32) continue;
    b.face(a, a + 1, n); b.face(a + 1, n + 1, n);
  }
  return b.finish();
}
function rayBody() {
  const b = builder(); b.ellipsoid([.11, .046, 0], [.30, .043, .13], [.61, .55, .38], 20, 10);
  for (const side of [-1, 1]) {
    b.ellipsoid([.205, .083, side * .105], [.055, .033, .033], [.49, .45, .30], 12, 6);
    b.ellipsoid([.215, .106, side * .105], [.026, .011, .020], [.09, .08, .055], 8, 4);
    b.ellipsoid([.08, .089, side * .112], [.055, .009, .026], [.26, .24, .17], 8, 4);
  }
  return b.finish();
}
function rayTail() {
  const b = builder(), points = [[0, .034, 0], [-.29, .035, .01], [-.63, .038, .02], [-1.06, .036, .045], [-1.50, .032, .085], [-1.80, .025, .10]];
  b.tube(points, [.034, .027, .021, .012, .006, .0015], (row, side) => side % 3 === 0 ? [.25, .40, .43] : [.57, .52, .35], 8);
  b.tube([[-.62, .051, .02], [-.75, .071, .027]], [.006, .001], [.31, .30, .24], 5); return b.finish();
}
function goatfishBody() {
  const b = builder();
  b.ellipsoid([.06, 0, 0], [.44, .135, .10], [.70, .65, .54], 24, 12, (x, y, z) => {
    const stripe = Math.abs(y - .012) < .034, caudalSpot = x < -.18 && (y * y + z * z) < .007;
    return caudalSpot ? [.19, .14, .095] : stripe ? [.39, .29, .18] : y < -.04 ? [.76, .70, .60] : [.65, .60, .47];
  });
  for (const side of [-1, 1]) {
    b.ellipsoid([.344, .048, side * .082], [.022, .025, .009], [.08, .065, .045], 8, 6);
    b.sheet([[.16, -.015, side * .095], [-.04, -.16, side * .14], [-.08, .005, side * .095]], [.60, .54, .41]);
  }
  b.sheet([[.24, .095, 0], [.13, .205, 0], [-.035, .105, 0]], [.62, .55, .40]);
  b.sheet([[-.065, .105, 0], [-.17, .185, 0], [-.29, .075, 0]], [.62, .55, .40]);
  b.sheet([[.08, -.065, 0], [-.14, -.18, 0], [-.30, -.065, 0]], [.65, .57, .43]);
  return b.finish();
}
function goatfishTail() {
  const b = builder(); b.sheet([[0, 0, 0], [-.08, .14, 0], [-.20, .17, 0], [-.13, .01, 0], [-.20, -.17, 0], [-.08, -.14, 0]], [.65, .55, .36]);
  return b.finish();
}
function goatfishBarbels() {
  const b = builder(); for (const side of [-1, 1]) b.tube([[.384, -.080, side * .032], [.40, -.15, side * .047], [.34, -.245, side * .061], [.30, -.282, side * .064]],
    [.006, .005, .003, .0015], [.78, .70, .54], 6); return b.finish();
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, root.userData.speciesId === 'tiger-cowrie' && key === 'spotted shell' ? 'material/shell' : 'material/tissue',
    () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: key === 'spotted shell' ? .43 : .84,
      vertexColors: true, metalness: 0, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
export function createOceanBenthicLifeAsset(species) {
  const id = typeof species === 'string' ? species : species?.id;
  if (!isOceanBenthicLifeSpecies(id)) throw new TypeError('Unknown shallow benthic-life representative.');
  const group = new THREE.Group(), parts = {};
  Object.assign(group.userData, { speciesId: id, benthicLifeResources: new Set(), benthicLifeDisposed: false,
    assetVersion: OCEAN_BENTHIC_LIFE_ASSET_VERSION, phase: 0, sizeMeasure: OCEAN_BENTHIC_LIFE_ENVELOPES[id].sizeMeasure,
    morphologyStatus: 'complete procedural representative; sizes and outline ratios are display selections, not measured anatomy' });
  group.name = species?.commonName ?? id; instances.add(group);
  try {
    if (id === 'tiger-cowrie') {
      parts.shell = add(group, 'spotted shell', cowrieShell); parts.foot = add(group, 'foot and head tentacles', cowrieFoot);
      parts.mantle = new THREE.Group(); group.add(parts.mantle); add(group, 'living mantle folds', cowrieMantle, parts.mantle);
    } else if (id === 'spotted-hermit-crab') {
      parts.shell = add(group, 'borrowed gastropod shell', hermitShell); parts.body = add(group, 'exposed shield eyes and antennae', hermitBody);
      parts.legs = []; parts.claws = [];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) { const leg = new THREE.Group(); group.add(leg); parts.legs.push(leg); add(group, `walking leg ${side}:${i}`, () => hermitLeg(side, i), leg); }
        const claw = new THREE.Group(); group.add(claw); parts.claws.push(claw); add(group, `unequal cheliped ${side}`, () => hermitClaw(side), claw);
      }
    } else if (id === 'blue-spotted-ray') {
      parts.body = add(group, 'head eyes spiracles and central disc', rayBody); add(group, 'central spotted disc', () => rayDisc(0));
      parts.wings = [];
      for (const side of [-1, 1]) { const wing = new THREE.Group(); group.add(wing); parts.wings.push(wing); add(group, `spotted pectoral disc ${side}`, () => rayDisc(side), wing); }
      parts.tail = new THREE.Group(); parts.tail.position.x = -.34; group.add(parts.tail); add(group, 'long striped tail', rayTail, parts.tail);
    } else {
      parts.body = add(group, 'striped goatfish body and paired dorsals', goatfishBody);
      parts.tail = new THREE.Group(); parts.tail.position.x = -.30; group.add(parts.tail); add(group, 'forked caudal fin', goatfishTail, parts.tail);
      parts.barbels = new THREE.Group(); group.add(parts.barbels); add(group, 'two chin barbels', goatfishBarbels, parts.barbels);
    }
    group.userData.benthicLifeParts = parts; return { group, parts };
  } catch (error) { disposeOceanBenthicLifeAsset(group); throw error; }
}
export function animateOceanBenthicLifeAsset(group, timeSec, agent = {}) {
  if (!group || group.userData.benthicLifeDisposed) return;
  const parts = group.userData.benthicLifeParts, time = Number.isFinite(timeSec) ? timeSec : 0, phase = group.userData.phase ?? 0;
  const resting = ['resting', 'sheltering', 'fixed', 'host-unavailable'].includes(agent.state);
  if (group.userData.speciesId === 'tiger-cowrie') {
    parts.mantle.scale.set(resting ? .93 : 1, 1, resting ? .92 : 1);
  } else if (group.userData.speciesId === 'spotted-hermit-crab') {
    parts.legs.forEach((leg, i) => { leg.rotation.y = resting ? 0 : Math.sin(time * 3.2 + phase + i * Math.PI) * .045;
      leg.scale.setScalar(agent.state === 'sheltering' ? .82 : 1); });
    parts.claws.forEach((claw, i) => { claw.rotation.y = resting ? 0 : Math.sin(time * 1.5 + phase + i) * .018; });
  } else if (group.userData.speciesId === 'blue-spotted-ray') {
    parts.wings.forEach((wing, i) => { wing.rotation.x = resting ? 0 : Math.sin(time * 2.3 + phase + i * .25) * .018; });
    parts.tail.rotation.y = resting ? 0 : Math.sin(time * 1.2 + phase) * .025;
  } else {
    parts.tail.rotation.y = Math.sin(time * (resting ? 2 : 5) + phase) * (resting ? .035 : .14);
    parts.barbels.rotation.x = ['feeding', 'foraging'].includes(agent.state) ? Math.sin(time * 2.1 + phase) * .07 : .10;
  }
}
export const createTigerCowrieAsset = () => createOceanBenthicLifeAsset('tiger-cowrie');
export const createSpottedHermitCrabAsset = () => createOceanBenthicLifeAsset('spotted-hermit-crab');
export const createBlueSpottedRayAsset = () => createOceanBenthicLifeAsset('blue-spotted-ray');
export const createReefGoatfishAsset = () => createOceanBenthicLifeAsset('reef-goatfish');
export function disposeOceanBenthicLifeAsset(group) {
  if (!group || group.userData.benthicLifeDisposed) return;
  group.userData.benthicLifeDisposed = true;
  for (const key of group.userData.benthicLifeResources ?? []) {
    const row = resources.get(key); if (row && --row.refs <= 0) { row.value.dispose(); resources.delete(key); }
  }
  group.userData.benthicLifeResources?.clear(); instances.delete(group); group.removeFromParent(); group.clear();
}
export function oceanBenthicLifeAssetStats() { return { resources: resources.size, instances: instances.size }; }
