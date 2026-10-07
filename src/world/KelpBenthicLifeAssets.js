import * as THREE from 'three';

// Whole procedural representatives use the source catalog's length measure.
// Outline ratios, colors, branch counts and small motions are display choices,
// not scanned anatomy or measurements of this simulated community.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const KELP_BENTHIC_LIFE_ASSET_VERSION = 1;
export const KELP_BENTHIC_LIFE_IDS = Object.freeze(['red-abalone', 'northern-kelp-crab', 'california-sea-hare', 'giant-plumose-anemone']);
export const KELP_BENTHIC_LIFE_ENVELOPES = Object.freeze({
  'red-abalone': Object.freeze({ sizeMeasure: 'shell-length', horizontalRadius: .87, minY: 0, maxY: .38,
    localBounds: Object.freeze({ minX: -.56, maxX: .74, minZ: -.42, maxZ: .42 }), pitchLimit: 0 }),
  'northern-kelp-crab': Object.freeze({ sizeMeasure: 'carapace-width', horizontalRadius: 2.15, minY: 0, maxY: .72,
    localBounds: Object.freeze({ minX: -1.35, maxX: 1.45, minZ: -1.65, maxZ: 1.65 }), pitchLimit: 0 }),
  'california-sea-hare': Object.freeze({ sizeMeasure: 'body-length', horizontalRadius: .76, minY: 0, maxY: .50,
    localBounds: Object.freeze({ minX: -.51, maxX: .66, minZ: -.36, maxZ: .36 }), pitchLimit: 0 }),
  'giant-plumose-anemone': Object.freeze({ sizeMeasure: 'expanded-column-height', horizontalRadius: .84, minY: 0, maxY: 1.40,
    localBounds: Object.freeze({ minX: -.72, maxX: .72, minZ: -.72, maxZ: .72 }), pitchLimit: 0 }),
});
export const isKelpBenthicLifeSpecies = id => KELP_BENTHIC_LIFE_IDS.includes(id);

function share(root, key, create) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: create(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.kelpBenthicLifeResources.has(key)) { root.userData.kelpBenthicLifeResources.add(key); entry.refs++; }
  return entry.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (point, color) => { const i = positions.length / 3; positions.push(...point); colors.push(...color); return i; };
  const face = (a, b, c, omit) => {
    if (!omit?.([a, b, c].map(i => positions.slice(i * 3, i * 3 + 3)))) indices.push(a, b, c);
  };
  function ellipsoid(center, scale, tint, sides = 20, rows = 10, colorAt = null, omit = null) {
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
  function tube(points, radii, color, sides = 6) {
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const point = new THREE.Vector3(...points[i]);
      const tangent = new THREE.Vector3(...points[Math.min(i + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(i - 1, 0)])).normalize();
      const a = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let side = 0; side < sides; side++) {
        const angle = TAU * side / sides;
        vertex(point.clone().addScaledVector(a, Math.cos(angle) * radii[i]).addScaledVector(b, Math.sin(angle) * radii[i]).toArray(),
          typeof color === 'function' ? color(i, side) : color);
      }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, b = start + row * sides + (side + 1) % sides;
      face(a, b, a + sides); face(b, b + sides, a + sides);
    }
  }
  function lathe(rings, colorAt, sides = 24) {
    const start = positions.length / 3;
    for (const [y, rx, rz] of rings) for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU; vertex([Math.cos(angle) * rx, y, Math.sin(angle) * rz], colorAt(y, angle));
    }
    for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
      face(a, b, a + 1); face(a + 1, b, b + 1);
    }
  }
  return { vertex, face, ellipsoid, tube, lathe, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function abaloneShell() {
  const b = builder(), holes = [-.28, -.12, .04, .20].map(x => [x, .145, -.218]);
  b.ellipsoid([0, .155, 0], [.5, .135, .305], [.47, .30, .22], 36, 16,
    (x, y, z) => {
      const ring = Math.hypot(x / .5, z / .305), mottling = .035 * Math.sin(x * 55 + z * 37 + y * 14);
      return ring > .94 ? [.57, .24, .16] : [.45 + mottling, .31 + mottling, .23 + mottling];
    }, corners => holes.some(([x, , z]) => corners.every(p => Math.hypot(p[0] - x, p[2] - z) < .033 && p[1] > .14)));
  for (const [x, , z] of holes) {
    const y = .155 + .135 * Math.sqrt(Math.max(0, 1 - (x / .5) ** 2 - (z / .305) ** 2));
    const points = Array.from({ length: 13 }, (_, i) => [x + Math.cos(i / 12 * TAU) * .027, y, z + Math.sin(i / 12 * TAU) * .022]);
    b.tube(points, points.map(() => .007), [.55, .35, .25], 5);
  }
  return b.finish();
}
function abaloneFoot() {
  const b = builder(); b.ellipsoid([.015, .029, 0], [.535, .029, .35], [.38, .33, .24], 24, 8);
  b.ellipsoid([.47, .071, 0], [.10, .055, .105], [.39, .35, .27], 12, 6);
  for (const side of [-1, 1]) {
    b.tube([[.54, .095, side * .06], [.63, .14, side * .15], [.70, .15, side * .20]], [.012, .007, .001], [.42, .39, .29]);
    for (let i = 0; i < 9; i++) {
      const angle = .2 + i / 8 * Math.PI * .83, x = Math.cos(angle) * .49, z = side * Math.sin(angle) * .31;
      b.tube([[x, .049, z], [x * 1.03, .074, z * 1.10]], [.008, .002], [.47, .41, .31], 4);
    }
  }
  return b.finish();
}
function crabCarapace() {
  const b = builder(), sides = 12, perimeter = [];
  for (let side = 0; side < sides; side++) {
    const angle = side / sides * TAU, x = Math.cos(angle) * (Math.cos(angle) > 0 ? .55 : .36), z = Math.sin(angle) * .43;
    perimeter.push([x, .35 + .018 * Math.cos(angle * 4), z]);
  }
  const top = b.vertex([.02, .59, 0], [.31, .37, .21]), bottom = b.vertex([0, .22, 0], [.34, .36, .24]);
  const ring = perimeter.map(point => b.vertex(point, [.32, .36, .21]));
  for (let i = 0; i < sides; i++) { b.face(top, ring[(i + 1) % sides], ring[i]); b.face(bottom, ring[i], ring[(i + 1) % sides]); }
  for (const side of [-1, 1]) b.tube([[.49, .37, side * .035], [.65, .38, side * .055]], [.035, .001], [.31, .37, .21]);
  for (const side of [-1, 1]) {
    b.tube([[.43, .43, side * .17], [.50, .52, side * .23]], [.022, .011], [.38, .40, .24]);
    b.ellipsoid([.506, .523, side * .23], [.022, .019, .024], [.095, .11, .075], 8, 6);
    for (let i = 0; i < 2; i++) b.tube([[.06 - i * .22, .35, side * .43], [.07 - i * .22, .37, side * .50]], [.033, 0], [.32, .37, .21]);
  }
  return b.finish();
}
function crabLeg(side, i) {
  const b = builder(), x = .25 - i * .17, end = .78 - i * .63;
  b.tube([[x, .31, side * .32], [x + (1.5 - i) * .30, .41, side * .94], [end, .055, side * 1.46], [end + .09, .009, side * 1.51]],
    [.040, .036, .013, .003], [.34, .39, .22], 6); return b.finish();
}
function crabClaw(side) {
  const b = builder(); b.tube([[.42, .30, side * .28], [.76, .31, side * .70], [1.06, .24, side * .53]],
    [.060, .055, .046], [.38, .40, .24], 8);
  b.ellipsoid([1.12, .235, side * .49], [.115, .075, .075], [.41, .42, .26], 12, 8);
  b.tube([[1.17, .23, side * .45], [1.36, .17, side * .34], [1.28, .16, side * .39]], [.033, .015, .004], [.42, .43, .28]);
  b.tube([[1.17, .26, side * .54], [1.34, .25, side * .46]], [.030, .008], [.42, .43, .28]); return b.finish();
}
const hareColor = (x, y, z) => {
  const patches = Math.sin(x * 29 + z * 23) * Math.cos(y * 31 - z * 17);
  return patches > .32 ? [.27, .31, .19] : patches < -.45 ? [.49, .41, .29] : [.37, .35, .23];
};
function hareBody() {
  const b = builder(); b.ellipsoid([0, .139, 0], [.5, .139, .23], [.37, .35, .23], 28, 12, hareColor);
  b.ellipsoid([.31, .205, 0], [.16, .13, .14], [.38, .36, .24], 16, 10, hareColor);
  for (const side of [-1, 1]) {
    b.tube([[.39, .268, side * .060], [.37, .36, side * .08], [.39, .425, side * .10]], [.027, .018, .004], [.40, .36, .25], 8);
    b.tube([[.43, .15, side * .09], [.54, .18, side * .15], [.63, .21, side * .17]], [.029, .015, .004], [.40, .36, .25], 8);
  }
  return b.finish();
}
function hareFold(side) {
  const b = builder(); b.ellipsoid([-.045, .255, side * .12], [.32, .135, .091], [.40, .36, .24], 22, 10, hareColor);
  b.tube([[-.29, .32, side * .16], [-.13, .399, side * .125], [.09, .355, side * .13], [.23, .30, side * .15]],
    [.018, .024, .019, .012], [.47, .42, .29], 6); return b.finish();
}
function anemoneColumn() {
  const b = builder(); b.ellipsoid([0, .028, 0], [.36, .028, .36], [.63, .48, .31], 24, 8);
  b.lathe([[.027, .30, .30], [.12, .24, .24], [.46, .18, .18], [.83, .22, .22], [1, .295, .295]],
    (y, angle) => [.64 + .025 * Math.sin(angle * 9), .48 + y * .06, .31 + y * .10]);
  b.ellipsoid([0, .987, 0], [.295, .013, .295], [.74, .69, .54], 24, 6);
  return b.finish();
}
function anemoneCrown() {
  const b = builder(); b.ellipsoid([0, 1.015, 0], [.29, .02, .29], [.75, .71, .60], 24, 6);
  for (let i = 0; i < 36; i++) {
    const angle = i / 36 * TAU, c = Math.cos(angle), s = Math.sin(angle), rim = .52 + (i % 3) * .04, height = 1.17 + (i % 4) * .035;
    b.tube([[c * .22, 1.016, s * .22], [c * .35, 1.10, s * .35], [c * rim, height, s * rim]],
      [.012, .009, .004], [.77, .75, .65], 5);
    for (const side of [-1, 1]) {
      const a = angle + side * .075, cc = Math.cos(a), ss = Math.sin(a);
      b.tube([[c * .35, 1.10, s * .35], [cc * (rim + .03), height + .04, ss * (rim + .03)], [cc * (rim + .065), height + .065, ss * (rim + .065)]],
        [.007, .004, .001], [.81, .79, .70], 4);
    }
  }
  return b.finish();
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const shell = root.userData.speciesId === 'red-abalone' && key === 'low ear shell with respiratory pores';
  const material = share(root, shell ? 'material/shell' : 'material/tissue', () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: shell ? .76 : .87, vertexColors: true, metalness: 0, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.receiveShadow = true; mesh.castShadow = false;
  parent.add(mesh); return mesh;
}
export function createKelpBenthicLifeAsset(species) {
  const id = typeof species === 'string' ? species : species?.id;
  if (!isKelpBenthicLifeSpecies(id)) throw new TypeError('Unknown kelp benthic-life representative.');
  const group = new THREE.Group(), parts = {};
  Object.assign(group.userData, { speciesId: id, kelpBenthicLifeResources: new Set(), kelpBenthicLifeDisposed: false,
    assetVersion: KELP_BENTHIC_LIFE_ASSET_VERSION, phase: 0, sizeMeasure: KELP_BENTHIC_LIFE_ENVELOPES[id].sizeMeasure,
    morphologyStatus: 'whole procedural representative; outline ratios and motion are uncalibrated display choices' });
  group.name = species?.commonName ?? id; instances.add(group);
  try {
    if (id === 'red-abalone') {
      parts.shell = add(group, 'low ear shell with respiratory pores', abaloneShell);
      parts.foot = add(group, 'broad foot epipodium and head tentacles', abaloneFoot);
    } else if (id === 'northern-kelp-crab') {
      parts.carapace = add(group, 'angular shield rostrum and stalked eyes', crabCarapace); parts.legs = []; parts.claws = [];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const leg = new THREE.Group(); group.add(leg); parts.legs.push(leg); add(group, `jointed walking leg ${side}:${i}`, () => crabLeg(side, i), leg);
        }
        const claw = new THREE.Group(); group.add(claw); parts.claws.push(claw); add(group, `paired cheliped ${side}`, () => crabClaw(side), claw);
      }
    } else if (id === 'california-sea-hare') {
      parts.body = add(group, 'soft body oral tentacles and rhinophores', hareBody); parts.parapodia = [];
      for (const side of [-1, 1]) {
        const fold = new THREE.Group(); group.add(fold); parts.parapodia.push(fold); add(group, `paired parapodial fold ${side}`, () => hareFold(side), fold);
      }
    } else {
      parts.column = add(group, 'pedal disc column and collar', anemoneColumn);
      parts.crown = new THREE.Group(); group.add(parts.crown); add(group, 'expanded fine plumose crown', anemoneCrown, parts.crown);
    }
    group.userData.kelpBenthicLifeParts = parts; animateKelpBenthicLifeAsset(group, 0, { state: 'resting' }); return group;
  } catch (error) { disposeKelpBenthicLifeAsset(group); throw error; }
}
export function animateKelpBenthicLifeAsset(group, timeSec, agent = {}) {
  if (!group || group.userData.kelpBenthicLifeDisposed) return;
  const parts = group.userData.kelpBenthicLifeParts, time = Number.isFinite(timeSec) ? timeSec : 0, phase = group.userData.phase ?? 0;
  const quiet = agent.alive === false || ['resting', 'sheltering', 'blocked', 'host-unavailable'].includes(agent.state);
  const feeding = !quiet && ['feeding', 'kelp-benthic-feeding'].includes(agent.state);
  const moving = !quiet && Math.hypot(agent.velocity?.x ?? 0, agent.velocity?.y ?? 0, agent.velocity?.z ?? 0) > 1e-8;
  if (group.userData.speciesId === 'red-abalone') parts.foot.scale.x = moving ? .99 + Math.sin(time * 1.2 + phase) * .01 : .97;
  else if (group.userData.speciesId === 'northern-kelp-crab') {
    parts.legs.forEach((leg, i) => { leg.rotation.y = moving ? Math.sin(time * 3 + phase + i * Math.PI) * .022 : 0; });
    parts.claws.forEach((claw, i) => { claw.rotation.y = feeding ? Math.sin(time * 1.5 + phase + i) * .020 : 0; });
  } else if (group.userData.speciesId === 'california-sea-hare') {
    parts.parapodia.forEach((fold, i) => { fold.scale.z = moving || feeding ? .97 + Math.sin(time * 1.1 + phase + i * .2) * .03 : .94; });
  } else {
    const pulse = feeding ? .985 + Math.sin(time * .7 + phase) * .015 : 1;
    parts.crown.scale.set(pulse, 1, pulse);
  }
  group.userData.kelpBenthicLifeLastTimeSec = time;
}
export function disposeKelpBenthicLifeAsset(group) {
  if (!group || group.userData.kelpBenthicLifeDisposed) return;
  group.userData.kelpBenthicLifeDisposed = true;
  for (const key of group.userData.kelpBenthicLifeResources ?? []) {
    const row = resources.get(key); if (row && --row.refs <= 0) { row.value.dispose(); resources.delete(key); }
  }
  group.userData.kelpBenthicLifeResources?.clear(); instances.delete(group); group.removeFromParent(); group.clear();
}
export function kelpBenthicLifeAssetStats() { return { resources: resources.size, instances: instances.size }; }
