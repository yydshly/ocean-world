import * as THREE from 'three';
import { deepHardLifeSpeciesCatalog, deepHardLifeSpeciesById } from '../deepHardLifeSpecies.js';

// One source-informed whole kit per persisted individual/colony. The fixed
// root and two visible feeding surfaces share the model's native rock frame.
// Outline ratios, pinnule/polyps density and soft poses are authored choices.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const DEEP_HARD_LIFE_ASSET_VERSION = 1;
export const DEEP_HARD_LIFE_IDS = Object.freeze(deepHardLifeSpeciesCatalog.map(s => s.id));
export const DEEP_HARD_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(deepHardLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: 0,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1],
      minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isDeepHardLifeSpecies = id => DEEP_HARD_LIFE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.deepHardLifeResources.has(key)) { root.userData.deepHardLifeResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 12, rows = 6) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let i = 0; i <= sides; i++) {
      const lat = Math.PI * r / rows, angle = TAU * i / sides;
      vertex([center[0] + Math.sin(lat) * Math.cos(angle) * scale[0], center[1] + Math.cos(lat) * scale[1],
        center[2] + Math.sin(lat) * Math.sin(angle) * scale[2]], tint);
    }
    for (let r = 0; r < rows; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1;
      if (r) face(a, a + 1, b); if (r < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, tint, sides = 6) {
    const start = positions.length / 3; let previous;
    for (let r = 0; r < points.length; r++) {
      const p = new THREE.Vector3(...points[r]), tangent = new THREE.Vector3(...points[Math.min(r + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(r - 1, 0)])).normalize();
      let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
      if (!a || a.lengthSq() < 1e-7) a = new THREE.Vector3().crossVectors(tangent,
        Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      a.normalize(); previous = a; const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let i = 0; i < sides; i++) vertex(p.clone().addScaledVector(a, Math.cos(TAU * i / sides) * radii[r])
        .addScaledVector(b, Math.sin(TAU * i / sides) * radii[r]).toArray(), tint);
    }
    for (let r = 0; r < points.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides;
      face(a, b, a + sides); face(b, b + sides, a + sides);
    }
    for (const [r, reverse] of [[0, false], [points.length - 1, true]]) {
      const center = vertex(points[r], tint); for (let i = 0; i < sides; i++) {
        const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides;
        reverse ? face(center, a, b) : face(center, b, a);
      }
    }
  }
  return { vertex, face, ellipsoid, tube, finish() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  } };
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .88, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const pale = [.65, .57, .42], paleTip = [.74, .66, .50], axisTint = [.24, .16, .11], polypTint = [.62, .42, .28];
const coralAxisLine = [[0, .017, 0], [0, .30, 0], [.075, .69, 0], [.16, .875, 0], [.29, .967, 0],
  [.55, .992, 0], [.80, .965, 0], [1.02, .925, 0]];
function coralAxisY(x) {
  const end = coralAxisLine.findIndex(p => p[0] >= x && p[0] > 0), a = coralAxisLine[end - 1], b = coralAxisLine[end];
  return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}
function armLine() {
  // Two equal half-length centreline sections give exact unit arm length;
  // pinnules and the illustrative stalk are excluded from that measure.
  const length = Math.hypot(.8, .5), bend = Math.sqrt(.25 - length * length / 4);
  const middle = [.4 - .5 / length * bend, 1.8 + .8 / length * bend, 0];
  const points = [];
  for (let r = 0; r <= 16; r++) {
    const first = r <= 8, u = first ? r / 8 : (r - 8) / 8, a = first ? [0, 1.55, 0] : middle, b = first ? middle : [.80, 2.05, 0];
    points.push(a.map((v, k) => v + (b[k] - v) * u));
  }
  return points;
}
function seaLily(root, parts) {
  parts.base = add(root, 'illustrative fixed small attachment base', () => { const b = builder(); b.ellipsoid([0, .018, 0], [.105, .018, .105], pale); return b.finish(); });
  parts.stalk = add(root, 'long fixed stalk and small cup', () => {
    const b = builder(); b.tube([[0, .018, 0], [0, .45, 0], [.009, 1.0, -.008], [0, 1.55, 0]], [.021, .019, .015, .017], pale);
    b.tube([[0, 1.48, 0], [0, 1.51, 0], [0, 1.55, 0]], [.018, .032, .058], paleTip, 10); return b.finish();
  });
  const line = armLine(); parts.arms = [];
  for (let arm = 0; arm < 5; arm++) {
    const pivot = new THREE.Group(); pivot.userData.restAngle = -arm / 5 * TAU; pivot.rotation.y = pivot.userData.restAngle; root.add(pivot); parts.arms.push(pivot);
    add(root, 'one simple unit-length arm with paired fine pinnules', () => {
      const b = builder(); b.tube(line, line.map((_, i) => .014 * (1 - i / 16) + .002), pale, 7);
      for (let i = 2; i < 16; i++) for (const side of [-1, 1]) {
        const p = line[i], reach = .265 * Math.sin(Math.PI * i / 16) ** .65;
        b.tube([p, [p[0] + .025, p[1] + .042, side * reach * .48], [p[0] + .035, p[1] + .065, side * reach]], [.005, .003, .0008], paleTip, 4);
      }
      return b.finish();
    }, pivot);
  }
  parts.feedingOrgan = parts.arms[0];
  root.userData.measureReferences = { armLength: 1, armCenterline: line.map(p => [...p]), pinnulesExcluded: true,
    stalkRatioStatus: 'authored; complete specimen stalk height not measured in the cited damaged material' };
  root.userData.anatomy = { simpleUndividedArms: 5, pairedPinnules: true, cirriAdded: false, attachmentBaseMeasured: false };
}
function polyp(b, center, fixed = false) {
  b.ellipsoid(center, [.012, .012, .014], polypTint, 12, 6);
  // Six short tentacles are an Antipatharia reference; sampling density is
  // illustrative. The fixed polyp surface remains the actual intake point.
  for (let i = 0; i < 6; i++) {
    const a = TAU * i / 6, reach = .025;
    b.tube([[center[0] + Math.cos(a) * .007, center[1] + Math.sin(a) * .007, center[2]],
      [center[0] + Math.cos(a) * reach, center[1] + Math.sin(a) * reach, center[2] + (fixed ? -.004 : .009)]], [.0023, .0008], polypTint, 4);
  }
}
function blackCoral(root, parts) {
  parts.base = add(root, 'fixed small holdfast', () => { const b = builder(); b.ellipsoid([0, .017, 0], [.090, .017, .090], axisTint); return b.finish(); });
  parts.axis = add(root, 'main axis curving into a near-horizontal upper segment', () => {
    const b = builder(); b.tube(coralAxisLine, [.019, .017, .013, .011, .009, .008, .006, .003], axisTint, 8);
    b.ellipsoid([.55, .992, 0], [.008, .008, .008], axisTint); return b.finish();
  });
  parts.pinnules = [];
  for (let i = 0; i < 12; i++) {
    const fixed = i === 0, side = i % 2 ? -1 : 1, x = fixed ? .16 : .19 + i * .067, y = coralAxisY(x);
    const length = .50 - i * .025, drop = .59 - i * .033, pivot = new THREE.Group(); pivot.position.set(x, y, 0); pivot.userData.index = i; root.add(pivot); parts.pinnules.push(pivot);
    const line = fixed ? [[0, 0, 0], [.03, -.09, .14], [.08, -.30, .31], [.19, -.525, .406]] :
      [[0, 0, 0], [.012, -.045, side * length * .35], [.025, -drop * .53, side * length * .84], [.04, -drop, side * length]];
    add(root, fixed ? 'fixed down-curving pinnule and its real terminal polyp' : `alternating simple down-curving pinnule ${i}`, () => {
      const b = builder(); b.tube(line, [.006, .005, .003, .0015], axisTint, 5);
      for (let sample = 1; sample < 6; sample++) {
        const u = sample / 6, section = Math.min(2, Math.floor(u * 3)), f = u * 3 - section;
        const p = line[section].map((v, k) => v + (line[section + 1][k] - v) * f); polyp(b, p);
      }
      if (fixed) polyp(b, [.19, -.525, .406], true);
      return b.finish();
    }, pivot);
  }
  parts.feedingOrgan = parts.pinnules[0];
  root.userData.measureReferences = { colonyHeight: 1, rootY: 0, maximumNeutralY: 1, curvedAxisArcLengthIsNotHeight: true,
    mainAxisCenterline: coralAxisLine.map(p => [...p]) };
  root.userData.anatomy = { mainAxis: 'upper axis bends toward near-horizontal', pinnules: 'simple alternating and recurved downward',
    silhouette: 'windsock-like mature reference', sampledPinnules: 12, polypTentacles: 6 };
}
export function createDeepHardLifeAsset(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id, species = deepHardLifeSpeciesById[id];
  if (!species) throw new TypeError('Unknown deep hard-life representative.');
  if (typeof speciesOrId === 'object' && ((speciesOrId.scientificName && speciesOrId.scientificName !== species.scientificName) ||
      (speciesOrId.identityLevel && speciesOrId.identityLevel !== species.identityLevel))) throw new TypeError('Conflicting deep hard-life identity.');
  const root = new THREE.Group(), parts = {}; root.name = species.commonName;
  Object.assign(root.userData, { speciesId: id, scientificName: species.scientificName, identityLevel: species.identityLevel,
    kind: species.kind, sizeMeasure: species.sizeMeasure, phase: 0, assetVersion: 1, deepHardLifeResources: new Set(), deepHardLifeDisposed: false,
    localEnvelope: DEEP_HARD_LIFE_ENVELOPES[id], feedingPointLocal: { ...species.morphology.feedingPointLocal },
    originConvention: 'fixed attachment base; local +Y native rock normal, +X projected heading tangent, +Z side',
    morphologyStatus: 'whole source-informed procedural reference; proportions, sample counts and passive poses are uncalibrated display choices' });
  instances.add(root);
  try { if (id === 'sea-lily-thalassocrinus') seaLily(root, parts); else blackCoral(root, parts);
    root.userData.deepHardLifeParts = parts; return root; } catch (error) { disposeDeepHardLifeAsset(root); throw error; }
}
export function animateDeepHardLifeAsset(root, nativeTimeSec, agent = {}) {
  const parts = root?.userData.deepHardLifeParts; if (!parts || root.userData.deepHardLifeDisposed || agent.alive === false) return;
  const time = Number.isFinite(nativeTimeSec) ? nativeTimeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const rawCurrent = agent.localEnvironment?.currentMps, current = typeof rawCurrent === 'number' ? rawCurrent : Math.hypot(rawCurrent?.x ?? 0, rawCurrent?.z ?? 0);
  const flow = Number.isFinite(current) ? Math.min(1, Math.max(0, Math.abs(current) / .18)) : 0;
  if (root.userData.speciesId === 'sea-lily-thalassocrinus') parts.arms.forEach((arm, i) => {
    if (i) arm.rotation.y = arm.userData.restAngle + Math.sin(time * .55 + phase + i) * .014 * flow;
  });
  else parts.pinnules.forEach((pinnule, i) => { if (i) pinnule.rotation.x = Math.sin(time * .47 + phase + i * .8) * .012 * flow; });
  root.userData.deepHardLifeLastTimeSec = time;
}
export function disposeDeepHardLifeAsset(root) {
  if (!root || root.userData.deepHardLifeDisposed) return; root.userData.deepHardLifeDisposed = true;
  for (const key of root.userData.deepHardLifeResources ?? []) { const row = resources.get(key); if (row && --row.refs <= 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.deepHardLifeResources?.clear(); instances.delete(root); root.removeFromParent(); root.clear();
}
export const deepHardLifeAssetStats = () => ({ resources: resources.size, instances: instances.size });
