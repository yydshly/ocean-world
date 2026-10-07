import * as THREE from 'three';

// Whole procedural representatives, using the source catalog's declared size
// measure. Ratios, sample appendage counts and motion are display choices;
// this module supplies no light, populations, nutrition or simulated time.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const DEEP_BENTHIC_LIFE_ASSET_VERSION = 1;
export const DEEP_BENTHIC_LIFE_IDS = Object.freeze(['abyssal-brittle-star', 'pyramid-urchin', 'acorn-worm-group', 'deep-amphipod-group']);
export const DEEP_BENTHIC_LIFE_ENVELOPES = Object.freeze({
  'abyssal-brittle-star': Object.freeze({ sizeMeasure: 'arm-span', horizontalRadius: .62, minY: 0, maxY: .12,
    localBounds: Object.freeze({ minX: -.55, maxX: .55, minZ: -.55, maxZ: .55 }), pitchLimit: 0 }),
  'pyramid-urchin': Object.freeze({ sizeMeasure: 'test-length', horizontalRadius: .80, minY: 0, maxY: .90,
    localBounds: Object.freeze({ minX: -.58, maxX: .60, minZ: -.52, maxZ: .52 }), pitchLimit: 0 }),
  'acorn-worm-group': Object.freeze({ sizeMeasure: 'body-length', horizontalRadius: .69, minY: 0, maxY: .16,
    localBounds: Object.freeze({ minX: -.58, maxX: .62, minZ: -.20, maxZ: .20 }), pitchLimit: 0 }),
  'deep-amphipod-group': Object.freeze({ sizeMeasure: 'body-length', horizontalRadius: .90, minY: 0, maxY: .44,
    localBounds: Object.freeze({ minX: -.70, maxX: .84, minZ: -.26, maxZ: .26 }), pitchLimit: 0 }),
});
export const isDeepBenthicLifeSpecies = id => DEEP_BENTHIC_LIFE_IDS.includes(id);
const identities = Object.freeze({
  'abyssal-brittle-star': { scientificName: 'Ophiosphalma glabrum', identityLevel: 'species' },
  'pyramid-urchin': { scientificName: 'Echinocrepis rostrata', identityLevel: 'species' },
  'acorn-worm-group': { scientificName: 'Tergivelum spp.', identityLevel: 'genus-group' },
  'deep-amphipod-group': { scientificName: 'Eurythenes spp.', identityLevel: 'genus-group' },
});

function share(root, key, create) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: create(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.deepBenthicLifeResources.has(key)) { root.userData.deepBenthicLifeResources.add(key); entry.refs++; }
  return entry.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (point, color) => { const i = positions.length / 3; positions.push(...point); colors.push(...color); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, color, sides = 16, rows = 8) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      vertex([center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1],
        center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]], color);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
      if (row) face(a, a + 1, b); if (row < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, color, sides = 6, flatten = 1) {
    const start = positions.length / 3;
    let previous = null;
    for (let i = 0; i < points.length; i++) {
      const point = new THREE.Vector3(...points[i]);
      const tangent = new THREE.Vector3(...points[Math.min(i + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(i - 1, 0)])).normalize();
      let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
      if (!a || a.lengthSq() < .00001) a = new THREE.Vector3().crossVectors(tangent,
        Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      a.normalize(); previous = a;
      const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let side = 0; side < sides; side++) {
        const angle = TAU * side / sides;
        vertex(point.clone().addScaledVector(a, Math.cos(angle) * radii[i])
          .addScaledVector(b, Math.sin(angle) * radii[i] * flatten).toArray(), color);
      }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, b = start + row * sides + (side + 1) % sides;
      face(a, b, a + sides); face(b, b + sides, a + sides);
    }
  }
  return { vertex, face, ellipsoid, tube, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    roughness: .85, vertexColors: true, metalness: 0, emissive: 0, emissiveIntensity: 0, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function brittleDisc() {
  const b = builder(); b.ellipsoid([0, .027, 0], [.064, .027, .064], [.60, .52, .41], 20, 8);
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU;
    b.ellipsoid([Math.cos(angle) * .041, .049, Math.sin(angle) * .041], [.013, .003, .009], [.66, .57, .44], 8, 4);
  }
  return b.finish();
}
function brittleArm() {
  const b = builder(), points = [], radii = [];
  const extent = 1 / (2 * Math.sin(Math.PI * .4));
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push([.047 + t * (extent - .047), .019 - t * .010, Math.sin(t * Math.PI * 2) * .009 * t]);
    radii.push(.019 * (1 - t) ** .85 + .001);
    if (i > 0 && i < 15) for (const side of [-1, 1]) {
      const [x, y, z] = points[i], r = radii[i];
      b.tube([[x, y, z + side * r], [x - .013, y + .009, z + side * (r + .018)]], [.004, .001], [.63, .55, .45], 4);
    }
  }
  b.tube(points, radii, [.57, .48, .37], 6, .55); return b.finish();
}
function acornWormTrunk() {
  const b = builder(), points = [], radii = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, radius = .032 * Math.sin(t * Math.PI) ** .5 + .007;
    points.push([-.5 + t * .78, .040, Math.sin(t * Math.PI * 2) * .018]); radii.push(radius);
  }
  b.tube(points, radii, [.65, .56, .51], 14, .82);
  return b.finish();
}
function acornWormAnterior() {
  const b = builder(); b.ellipsoid([.286, .049, 0], [.055, .043, .075], [.49, .35, .30], 20, 10);
  b.ellipsoid([.407, .053, 0], [.093, .049, .075], [.55, .40, .33], 24, 12);
  // The two backward lateral veils are a Tergivelum reference morphology;
  // this genus representative is not promoted to the reference's named species.
  for (const side of [-1, 1]) b.ellipsoid([.239, .055, side * .105], [.091, .015, .080], [.54, .39, .33], 16, 6);
  return b.finish();
}
function pyramidTest() {
  const b = builder(), positions = [], rings = [[.06, .43, .42], [.16, .49, .43], [.35, .38, .34], [.58, .24, .20], [.76, .10, .085], [.80, .015, .014]];
  // Rounded three-lobed, high irregular test. The apex is posterior of centre,
  // unlike the sphere/long-spine outline of a shallow regular sea urchin.
  for (const [y, rx, rz] of rings) for (let side = 0; side <= 30; side++) {
    const angle = side / 30 * TAU, lobe = 1 + .08 * Math.cos(angle * 3);
    positions.push([Math.cos(angle) * rx * lobe - y * .09, y, Math.sin(angle) * rz * lobe]);
  }
  let minX = Infinity, maxX = -Infinity;
  for (const p of positions) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
  const width = maxX - minX, centre = (maxX + minX) / 2;
  // Unit is test length, excluding spines and tube feet.
  const ringIndices = positions.map(([x, y, z]) => b.vertex([(x - centre) / width, y, z], [.48 + y * .12, .43 + y * .09, .34 + y * .06]));
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < 30; side++) {
    const a = ringIndices[row * 31 + side], c = ringIndices[(row + 1) * 31 + side];
    b.face(a, c, a + 1); b.face(a + 1, c, c + 1);
  }
  const base = b.vertex([0, .025, 0], [.43, .38, .30]), apex = b.vertex([(-.08 - centre) / width, .81, 0], [.57, .49, .39]);
  for (let side = 0; side < 30; side++) {
    b.face(base, ringIndices[side], ringIndices[side + 1]);
    const a = ringIndices[(rings.length - 1) * 31 + side]; b.face(apex, a + 1, a);
  }
  return b.finish();
}
function pyramidSpines() {
  const b = builder();
  // Fine short spines are a finite rendering sample, not a diagnostic count.
  for (let row = 0; row < 6; row++) for (let side = 0; side < 24; side++) {
    const angle = (side + row * .35) / 24 * TAU, y = .11 + row * .115;
    const fraction = Math.max(.12, 1 - (y - .11) / .76), rx = .49 * fraction, rz = .435 * fraction;
    const start = [Math.cos(angle) * rx - y * .07, y, Math.sin(angle) * rz];
    const end = [start[0] + Math.cos(angle) * .035, y + .023, start[2] + Math.sin(angle) * .035];
    b.tube([start, end], [.0055, .0007], [.63, .57, .46], 4);
  }
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * TAU, x = Math.cos(angle) * .28, z = Math.sin(angle) * .27;
    b.tube([[x, .082, z], [x * 1.03, .035, z * 1.03], [x * 1.08, .003, z * 1.08]], [.008, .006, .002], [.53, .45, .35], 5);
  }
  return b.finish();
}
function amphipodBody() {
  const b = builder();
  b.ellipsoid([.355, .15, 0], [.145, .105, .096], [.66, .55, .44], 20, 10);
  for (let i = 0; i < 10; i++) {
    const x = .235 - i * .07, fullness = i < 7 ? 1 : .89 - (i - 7) * .12;
    b.ellipsoid([x, .16 + Math.sin(i / 9 * Math.PI) * .037, 0], [.053, .105 * fullness, .092 * fullness],
      i % 2 ? [.64, .53, .42] : [.69, .59, .48], 12, 8);
  }
  b.ellipsoid([-.47, .15, 0], [.03, .047, .041], [.62, .50, .40], 12, 8);
  // Eye presence/contrast is not verified for this modern genus proxy.
  return b.finish();
}
function amphipodAppendages(side) {
  const b = builder();
  for (let i = 0; i < 7; i++) {
    const x = .24 - i * .081, splay = i < 3 ? .045 : -.045;
    const points = i < 2
      ? [[x, .13, side * .066], [x + .045, .103, side * .12], [x + .073, .087, side * .15], [x + .050, .076, side * .12]]
      : [[x, .13, side * .066], [x + splay, .092, side * .14], [x + splay * 2, .027, side * .21], [x + splay * 2.3, .007, side * .18]];
    // Seven pereiopod pairs include two front gnathopod pairs; only the other
    // five pairs use the bed-directed walking outline.
    b.tube(points,
      [.013, .010, .006, .002], [.67, .58, .48], 6);
  }
  for (let i = 0; i < 3; i++) {
    const x = -.13 - i * .09;
    b.tube([[x, .12, side * .056], [x - .033, .035, side * .105], [x - .075, .025, side * .153]],
      [.010, .008, .002], [.72, .64, .53], 5);
  }
  for (let i = 0; i < 2; i++) b.tube([[.43, .16 - i * .04, side * .060], [.54, .17 - i * .036, side * .11], [.66, .20 - i * .04, side * .15], [.78, .21 - i * .04, side * .16]],
    [.009, .006, .0035, .001], [.72, .65, .55], 6);
  for (let i = 0; i < 3; i++) b.tube([[-.32 - i * .060, .12, side * .030], [-.46 - i * .035, .078, side * (.075 + i * .014)],
    [-.56 - i * .025, .043, side * (.091 + i * .016)]], [.009, .006, .001], [.64, .54, .45], 5);
  return b.finish();
}
export function createDeepBenthicLifeAsset(species) {
  const id = typeof species === 'string' ? species : species?.id, identity = identities[id];
  if (!isDeepBenthicLifeSpecies(id)) throw new TypeError('Unknown deep benthic-life representative.');
  if (typeof species === 'object' && ((species.scientificName && species.scientificName !== identity.scientificName) ||
    (species.identityLevel && species.identityLevel !== identity.identityLevel))) throw new TypeError('Conflicting deep representative taxonomy.');
  const group = new THREE.Group(), parts = {};
  Object.assign(group.userData, { speciesId: id, ...identity, deepBenthicLifeResources: new Set(), deepBenthicLifeDisposed: false,
    assetVersion: DEEP_BENTHIC_LIFE_ASSET_VERSION, phase: 0, sizeMeasure: DEEP_BENTHIC_LIFE_ENVELOPES[id].sizeMeasure,
    morphologyStatus: 'whole procedural representative; outline ratios and motions are uncalibrated display choices',
    originConvention: 'bed tangent reference plane, local +X forward, +Y support normal, +Z side', morphologyProxy: true });
  group.name = species?.commonName ?? id; instances.add(group);
  try {
    if (id === 'abyssal-brittle-star') {
      parts.disc = add(group, 'small central disc', brittleDisc); parts.arms = [];
      for (let i = 0; i < 5; i++) {
        const arm = new THREE.Group(); arm.userData.restAngle = -i / 5 * TAU; group.add(arm); parts.arms.push(arm);
        add(group, 'slender tapering segmented arm with lateral spines', brittleArm, arm);
      }
      group.userData.feedingPointLocal = { x: 0, y: .025, z: 0 };
    } else if (id === 'pyramid-urchin') {
      parts.test = add(group, 'high irregular pyramid test', pyramidTest);
      parts.spines = add(group, 'fine short spines and lower tube feet', pyramidSpines);
      group.userData.feedingPointLocal = { x: 0, y: .015, z: 0 };
    } else if (id === 'acorn-worm-group') {
      parts.trunk = add(group, 'long beige soft trunk', acornWormTrunk);
      parts.anterior = new THREE.Group(); group.add(parts.anterior);
      add(group, 'brown proboscis collar and paired backward lateral veils', acornWormAnterior, parts.anterior);
      group.userData.feedingPointLocal = { x: .44, y: .025, z: 0 };
    } else {
      parts.body = add(group, 'laterally compressed head and curved segmented body', amphipodBody); parts.appendages = [];
      group.userData.appendagePairs = Object.freeze({ antennae: 2, pereiopods: 7, gnathopodsWithinPereiopods: 2, pleopods: 3, uropods: 3 });
      for (const side of [-1, 1]) {
        const appendages = new THREE.Group(); group.add(appendages); parts.appendages.push(appendages);
        add(group, `two antennae two gnathopods five walking legs three pleopods and three uropods ${side}`, () => amphipodAppendages(side), appendages);
      }
      group.userData.feedingPointLocal = { x: .4, y: .06, z: 0 };
    }
    group.userData.deepBenthicLifeParts = parts; animateDeepBenthicLifeAsset(group, 0, { state: 'resting' }); return group;
  } catch (error) { disposeDeepBenthicLifeAsset(group); throw error; }
}
export function animateDeepBenthicLifeAsset(group, timeSec, agent = {}) {
  if (!group || group.userData.deepBenthicLifeDisposed) return;
  const parts = group.userData.deepBenthicLifeParts, time = Number.isFinite(timeSec) ? timeSec : 0, phase = group.userData.phase ?? 0;
  const quiet = agent.alive === false || ['resting', 'fixed', 'blocked', 'host-unavailable'].includes(agent.state);
  const moving = !quiet && Math.hypot(agent.velocity?.x ?? 0, agent.velocity?.y ?? 0, agent.velocity?.z ?? 0) > 1e-8;
  const feeding = !quiet && Number.isFinite(agent.lastFeedAt) && time >= agent.lastFeedAt && time - agent.lastFeedAt <= 3;
  if (group.userData.speciesId === 'abyssal-brittle-star') {
    parts.arms.forEach((arm, i) => { arm.rotation.y = arm.userData.restAngle + (moving ? Math.sin(time * 1.2 + phase + i * 1.9) * .013 : 0); });
  } else if (group.userData.speciesId === 'acorn-worm-group') {
    parts.anterior.scale.z = moving || feeding ? .98 + Math.sin(time * .8 + phase) * .02 : .98;
  } else if (group.userData.speciesId === 'deep-amphipod-group') {
    parts.appendages.forEach((part, i) => { part.rotation.y = moving ? Math.sin(time * 2 + phase + i * Math.PI) * .020 : 0; });
  }
  group.userData.deepBenthicLifeLastTimeSec = time;
}
export function disposeDeepBenthicLifeAsset(group) {
  if (!group || group.userData.deepBenthicLifeDisposed) return;
  group.userData.deepBenthicLifeDisposed = true;
  for (const key of group.userData.deepBenthicLifeResources ?? []) {
    const row = resources.get(key); if (row && --row.refs <= 0) { row.value.dispose(); resources.delete(key); }
  }
  group.userData.deepBenthicLifeResources?.clear(); instances.delete(group); group.removeFromParent(); group.clear();
}
export function deepBenthicLifeAssetStats() { return { resources: resources.size, instances: instances.size }; }
