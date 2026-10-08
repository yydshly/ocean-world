import * as THREE from 'three';
import { oceanReefDiversitySpeciesById } from '../oceanReefDiversitySpecies.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const REEF_DIVERSITY_BENTHIC_ASSET_VERSION = 1;
export const REEF_DIVERSITY_BENTHIC_IDS = Object.freeze(['cushion-sea-star', 'leopard-sea-cucumber']);
export const isReefDiversityBenthic = value => REEF_DIVERSITY_BENTHIC_IDS.includes(typeof value === 'string' ? value : value?.id ?? value?.speciesId);
function share(root, key, make) {
  let row = resources.get(key);
  if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefDiversityBenthicResources.has(key)) { root.userData.reefDiversityBenthicResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const id = positions.length / 3; positions.push(...p); colors.push(...tint); return id; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 12, rows = 6) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0],
        center[1] + Math.cos(latitude) * scale[1], center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, typeof tint === 'function' ? tint(...p) : tint);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, c = a + sides + 1;
      if (row) face(a, a + 1, c); if (row < rows - 1) face(a + 1, c + 1, c);
    }
  }
  function tube(points, radii, tint, sides = 7) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]);
      const tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(row - 1, 0)])).normalize();
      const u = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(tangent, u);
      for (let side = 0; side < sides; side++) {
        const angle = side * TAU / sides;
        vertex(p.clone().addScaledVector(u, Math.cos(angle) * radii[row]).addScaledVector(v, Math.sin(angle) * radii[row]).toArray(), tint);
      }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, c = start + row * sides + (side + 1) % sides;
      face(a, c, a + sides); face(c, c + sides, a + sides);
    }
    for (const [row, reverse] of [[0, true], [points.length - 1, false]]) {
      const c = vertex(points[row], tint);
      for (let side = 0; side < sides; side++) {
        const a = start + row * sides + side, next = start + row * sides + (side + 1) % sides;
        reverse ? face(c, next, a) : face(c, a, next);
      }
    }
  }
  return { vertex, face, ellipsoid, tube, finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
const starRadius = angle => .463 + .028 * Math.cos(angle * 5);
function cushionBody() {
  const b = builder(), sides = 100;
  // A closed inflated pentagonal cushion with five very short blunt arms.
  // Culcita is not the long-armed or five-horned Protoreaster form.
  const profile = [[0, .354], [.22, .340], [.48, .300], [.73, .242], [.92, .178],
    [1, .115], [.96, .077], [.74, .049], [.38, .040], [0, .042]];
  for (const [fraction, y] of profile) for (let side = 0; side <= sides; side++) {
    const angle = side / sides * TAU, r = starRadius(angle) * fraction;
    const stipple = Math.sin(angle * 31 + fraction * 19) * .035 + Math.cos(angle * 17 - fraction * 27) * .023;
    b.vertex([Math.cos(angle) * r, y, Math.sin(angle) * r], y < .08 ? [.57, .35, .20] : [.69 + stipple, .42 + stipple, .22 + stipple * .7]);
  }
  for (let row = 0; row < profile.length - 1; row++) for (let side = 0; side < sides; side++) {
    const a = row * (sides + 1) + side, c = a + sides + 1;
    b.face(a, a + 1, c); b.face(a + 1, c + 1, c);
  }
  // Low granular tubercles and short spines follow the actual upper cushion.
  for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < ring * 10; i++) {
    const angle = i / (ring * 10) * TAU + ring * .19, fraction = ring / 5;
    const r = starRadius(angle) * fraction, x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const y = fraction < .48 ? .340 + (fraction - .22) / .26 * (.300 - .340) :
      fraction < .73 ? .300 + (fraction - .48) / .25 * (.242 - .300) : .242 + (fraction - .73) / .19 * (.178 - .242);
    const height = .009 + (i % 3) * .003;
    b.tube([[x, y - .004, z], [x, y + height, z]], [.009, .0015], [.53, .31, .16], 5);
  }
  return b.finish();
}
function tubeFeet(contacts, color) {
  const b = builder();
  for (const p of contacts) {
    // A fixed broad tip reaches the declared actual contact, exactly at y=0.
    b.ellipsoid([p.x, .004, p.z], [.010, .004, .010], color, 10, 6);
    b.tube([[p.x, .009, p.z], [p.x, .038, p.z], [p.x, .059, p.z]], [.007, .008, .009], color, 6);
  }
  return b.finish();
}
function cushionUnderside() {
  const b = builder();
  for (let arm = 0; arm < 5; arm++) {
    const angle = arm * TAU / 5, point = r => [Math.cos(angle) * r, .037, Math.sin(angle) * r];
    b.tube([point(.045), point(.15), point(.30), point(.38)], [.009, .008, .007, .003], [.40, .24, .14], 5);
  }
  return b.finish();
}
function oralDisk() {
  const b = builder();
  b.ellipsoid([0, 0, 0], [.028, .006, .028], [.28, .17, .10], 20, 6);
  b.ellipsoid([0, -.003, 0], [.012, .003, .012], [.12, .085, .06], 12, 6);
  return b.finish();
}
const cucumberProfile = [[-.5, .018, .018, .115], [-.46, .072, .070, .128], [-.37, .100, .105, .130],
  [-.2, .105, .130, .135], [0, .106, .137, .137], [.2, .103, .130, .133], [.37, .092, .112, .128],
  [.47, .060, .064, .126], [.5, .035, .031, .125]];
function cucumberBody() {
  const b = builder(), sides = 48, rows = 64;
  const spots = [-.35, -.15, .055, .26, .40].flatMap((x, row) => [0, -.92, .92, -1.80, 1.80].map((angle, column) =>
    ({ x: x + (column % 2 ? .022 : -.008), angle: angle + row * .08, radius: .030 + (row + column) % 3 * .005 })));
  for (let row = 0; row <= rows; row++) {
    const x = -.5 + row / rows; let index = cucumberProfile.findIndex(p => p[0] >= x); if (index <= 0) index = 1;
    const a = cucumberProfile[index - 1], c = cucumberProfile[index], f = (x - a[0]) / (c[0] - a[0]);
    const [ry, rz, cy] = [1, 2, 3].map(k => a[k] + (c[k] - a[k]) * f);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU, y = cy + Math.cos(angle) * ry, z = Math.sin(angle) * rz;
      const tone = .022 * Math.sin(x * 117 + angle * 23);
      let tint = y < .06 ? [.40, .31, .20] : [.43 + tone, .32 + tone, .20 + tone];
      for (const spot of spots) {
        const around = Math.atan2(Math.sin(angle - spot.angle), Math.cos(angle - spot.angle)) * .11;
        const d = Math.hypot(x - spot.x, around) / spot.radius;
        if (d < .65) { tint = [.66, .51, .32]; break; }
        if (d < 1.12) { tint = [.15, .12, .085]; break; }
      }
      b.vertex([x, y, z], tint);
    }
  }
  for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
    const a = row * (sides + 1) + side, c = a + sides + 1;
    b.face(a, a + 1, c); b.face(a + 1, c + 1, c);
  }
  for (const [row, reverse] of [[0, true], [rows, false]]) {
    const x = -.5 + row / rows, cy = row ? .125 : .115, centre = b.vertex([x, cy, 0], [.28, .21, .14]);
    for (let side = 0; side < sides; side++) {
      const a = row * (sides + 1) + side;
      reverse ? b.face(centre, a + 1, a) : b.face(centre, a, a + 1);
    }
  }
  return b.finish();
}
function cucumberMouth() {
  const b = builder(); b.ellipsoid([0, 0, 0], [.006, .031, .028], [.24, .18, .12], 16, 8);
  b.ellipsoid([.004, 0, 0], [.003, .012, .012], [.09, .075, .055], 12, 6); return b.finish();
}
function feedingTentacle(index) {
  const b = builder(), angle = index / 10 * TAU, point = (x, r, offset = 0) => [x, Math.cos(angle + offset) * r, Math.sin(angle + offset) * r];
  b.tube([point(0, .014), point(.048, .026), point(.090, .048), point(.132, .061), point(.155, .047)],
    [.009, .008, .006, .004, .002], [.50, .40, .25], 7);
  for (const side of [-1, 1]) b.tube([point(.085, .044), point(.110, .057, side * .25), point(.130, .068, side * .32)],
    [.004, .003, .001], [.53, .42, .27], 6);
  return b.finish();
}
function add(root, key, make, parent = root) {
  const id = root.userData.speciesId;
  const geometry = share(root, `geometry/${id}/${key}`, make);
  const material = share(root, 'material/benthic-skin', () => new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: .88, metalness: 0, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.userData.oceanStreaming = true; parent.add(mesh); return mesh;
}
export function createReefDiversityBenthic(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id, species = oceanReefDiversitySpeciesById[id];
  if (!isReefDiversityBenthic(id) || !species) throw new TypeError('Unknown reef-diversity benthic species.');
  if (typeof speciesOrId === 'object' && speciesOrId.scientificName && speciesOrId.scientificName !== species.scientificName)
    throw new TypeError('Conflicting reef-diversity benthic identity.');
  const root = new THREE.Group(); root.name = species.commonName ?? id;
  Object.assign(root.userData, { speciesId: id, scientificName: species.scientificName, kind: species.kind,
    assetVersion: REEF_DIVERSITY_BENTHIC_ASSET_VERSION, sizeMeasure: species.sizeMeasure,
    localEnvelope: species.normalizedEnvelope, supportContacts: species.support.footContacts.map(p => ({ ...p })),
    morphologyStatus: 'complete simplified distinct benthic form; not calibrated anatomy',
    originConvention: '+X forward; actual fixed foot contact plane at local y=0; unscaled body measure',
    reefDiversityBenthicResources: new Set(), reefDiversityBenthicDisposed: false, phase: 0, oceanStreaming: true });
  instances.add(root);
  try {
    const feet = add(root, 'Actual ventral tube feet with fixed support tips', () => tubeFeet(species.support.footContacts,
      id === 'cushion-sea-star' ? [.62, .45, .28] : [.48, .37, .23]));
    feet.userData.contactTips = species.support.footContacts.map(p => ({ ...p }));
    if (id === 'cushion-sea-star') {
      const body = add(root, 'Inflated five blunt-arm cushion with low granules and short spines', cushionBody);
      add(root, 'Five ventral ambulacral grooves', cushionUnderside);
      const mouth = new THREE.Group(); mouth.name = 'Separate central oral area above the foot plane'; mouth.position.y = .032; root.add(mouth);
      add(root, 'Central mouth and oral membrane', oralDisk, mouth);
      root.userData.anatomy = { bodyForm: 'domed five-blunt-arm cushion', shortArmCount: 5, longArms: false,
        largeDorsalHorns: false, shortSpines: true, ambulacralRows: 5, actualContactTips: species.support.footContacts.length,
        centralMouthIsNotAContact: true };
      root.userData.motion = { body, mouth, tentacles: [] };
    } else {
      const body = add(root, 'Closed elongated leathery body with dark-ringed pale ocelli', cucumberBody);
      const mouth = new THREE.Group(); mouth.name = 'Anterior oral crown outside the measured body length'; mouth.position.set(.495, .125, 0); root.add(mouth);
      add(root, 'Anterior mouth', cucumberMouth, mouth);
      const tentacles = [];
      for (let index = 0; index < 10; index++) {
        const pivot = new THREE.Group(); pivot.name = `Branched oral tentacle ${index + 1}`; mouth.add(pivot);
        add(root, pivot.name, () => feedingTentacle(index), pivot); tentacles.push(pivot);
      }
      root.userData.anatomy = { bodyForm: 'elongated spotted soft body', ocelli: true, oralTentacles: 10,
        ventralTubeFeet: true, actualContactTips: species.support.footContacts.length, bodyLengthX: [-.5, .5],
        anteriorTentaclesIncludedInBodySize: false };
      root.userData.motion = { body, mouth, tentacles };
    }
    root.updateMatrixWorld(true); return root;
  } catch (error) { disposeReefDiversityBenthic(root); throw error; }
}
export function animateReefDiversityBenthic(root, agent = {}, nativeTimeSec = 0) {
  if (!root || root.userData.reefDiversityBenthicDisposed || !root.userData.motion) return;
  const time = Number.isFinite(nativeTimeSec) ? nativeTimeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const activity = agent.alive === false ? 0 : ['resident-proxy-feeding', 'feeding', 'grazing'].includes(agent.state) ? 1 : .35;
  const motion = root.userData.motion;
  motion.body.scale.y = 1 + Math.sin(time * .7 + phase) * (root.userData.speciesId === 'cushion-sea-star' ? .004 : .012) * activity;
  motion.mouth.scale.y = 1 + Math.sin(time * 1.1 + phase) * .035 * activity;
  for (const [index, pivot] of motion.tentacles.entries()) {
    pivot.rotation.x = Math.sin(time * .9 + phase + index * .47) * .05 * activity;
    pivot.rotation.y = Math.sin(time * .8 + phase + index * .51) * .025 * activity;
  }
}
export function disposeReefDiversityBenthic(root) {
  if (!root || root.userData.reefDiversityBenthicDisposed) return false;
  root.userData.reefDiversityBenthicDisposed = true; instances.delete(root);
  for (const key of root.userData.reefDiversityBenthicResources ?? []) {
    const row = resources.get(key); if (row && --row.refs === 0) { row.value.dispose(); resources.delete(key); }
  }
  root.userData.reefDiversityBenthicResources?.clear(); root.removeFromParent(); root.clear(); return true;
}
export const reefDiversityBenthicAssetStats = () => ({ resources: resources.size, instances: instances.size });
