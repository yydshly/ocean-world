import * as THREE from 'three';
import { oceanMeadowLifeSpeciesCatalog, oceanMeadowLifeSpeciesById } from '../oceanMeadowLifeSpecies.js';

// Complete procedural representatives. Dimension metadata follows the source
// catalog; proportions and display polyp counts are authored, not scans.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const OCEAN_MEADOW_LIFE_ASSET_VERSION = 1;
export const OCEAN_MEADOW_LIFE_IDS = Object.freeze(oceanMeadowLifeSpeciesCatalog.map(s => s.id));
export const OCEAN_MEADOW_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(oceanMeadowLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: s.id === 'reef-cuttlefish' ? .15 : 0,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1], minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isOceanMeadowLifeSpecies = id => OCEAN_MEADOW_LIFE_IDS.includes(id);
function share(root, key, make) {
  let entry = resources.get(key); if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.meadowLifeResources.has(key)) { root.userData.meadowLifeResources.add(key); entry.refs++; }
  return entry.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (point, color) => { const i = positions.length / 3; positions.push(...point); colors.push(...color); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, color, sides = 16, rows = 8, colorAt = null, omit = null) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1], center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, colorAt?.(...p) ?? color);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
      if (row && !omit?.([a, a + 1, b].map(i => positions.slice(i * 3, i * 3 + 3)))) face(a, a + 1, b);
      if (row < rows - 1 && !omit?.([a + 1, b + 1, b].map(i => positions.slice(i * 3, i * 3 + 3)))) face(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, color, sides = 6, flatten = 1) {
    const start = positions.length / 3; let previous = null;
    for (let i = 0; i < points.length; i++) {
      const point = new THREE.Vector3(...points[i]), tangent = new THREE.Vector3(...points[Math.min(i + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(i - 1, 0)])).normalize();
      let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
      if (!a || a.lengthSq() < .00001) a = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      a.normalize(); previous = a; const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let side = 0; side < sides; side++) {
        const angle = TAU * side / sides, p = point.clone().addScaledVector(a, Math.cos(angle) * radii[i]).addScaledVector(b, Math.sin(angle) * radii[i] * flatten);
        vertex(p.toArray(), color);
      }
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, b = start + row * sides + (side + 1) % sides;
      face(a, b, a + sides); face(b, b + sides, a + sides);
    }
  }
  function sheet(points, color) { const start = positions.length / 3; points.forEach(p => vertex(p, color)); for (let i = 1; i < points.length - 1; i++) face(start, start + i, start + i + 1); }
  return { ellipsoid, tube, sheet, finish() { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry; } };
}
function material() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 }); }
function mesh(root, key, make) { const m = new THREE.Mesh(share(root, `geometry:${key}`, make), share(root, 'material:meadow', material)); m.castShadow = false; m.receiveShadow = true; return m; }
const lengthOf = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...p.map((v, axis) => v - points[i][axis])), 0);
function seahorse(root, parts) {
  const raw = [[0, .18, 0], [-.10, .10, 0], [-.16, .015, 0], [-.13, -.055, 0], [-.055, -.06, 0], [.012, -.025, 0], [0, 0, 0]], crownY = .68;
  const scale = (1 - crownY) / (lengthOf(raw) - raw[0][1]), tail = raw.map(p => p.map(v => v * scale));
  root.userData.measureReferences = { coronetY: crownY, tailBaseY: tail[0][1], uncurledTailLength: lengthOf(tail), straightenedHeight: crownY - tail[0][1] + lengthOf(tail), posedTailTip: [0, 0, 0] };
  const body = mesh(root, 'seahorse-body', () => {
    const b = builder(), ochre = [.50, .43, .27], light = [.63, .55, .34];
    b.ellipsoid([-.008, .372, 0], [.112, .18, .077], ochre, 20, 10);
    b.tube([[0, tail[0][1], 0], [-.018, .30, 0], [.012, .45, 0], [.035, .535, 0], [.092, .584, 0]], [.041, .058, .064, .041, .040], light, 10);
    b.ellipsoid([.147, .583, 0], [.092, .055, .059], light, 18, 8);
    b.ellipsoid([.067, .654, 0], [.025, .026, .034], ochre, 12, 6);
    b.tube([[.216, .583, 0], [.305, .579, 0], [.397, .575, 0]], [.027, .023, .015], light, 10);
    b.tube(tail, tail.map((_, i) => .030 * (1 - i / (tail.length + .25))), ochre, 8);
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) b.ellipsoid([-.018 + i * .004, .255 + i * .041, side * (.075 - i * .002)], [.018, .013, .011], light, 8, 4);
    for (const side of [-1, 1]) b.ellipsoid([.170, .602, side * .054], [.015, .014, .010], [.10, .09, .07], 10, 6);
    return b.finish();
  }); root.add(body); parts.body = body; parts.tail = tail; parts.coronet = { y: crownY };
  const dorsal = mesh(root, 'seahorse-dorsal', () => { const b = builder(); b.sheet([[-.092, .385, 0], [-.210, .385, 0], [-.228, .435, 0], [-.110, .466, 0]], [.55, .51, .34]); return b.finish(); }); root.add(dorsal); parts.dorsalFin = dorsal;
  parts.pectoralFins = [-1, 1].map(side => { const fin = mesh(root, `seahorse-pectoral:${side}`, () => { const b = builder(); b.sheet([[.09, .525, side * .040], [.018, .51, side * .11], [.115, .49, side * .040]], [.56, .52, .38]); return b.finish(); }); root.add(fin); return fin; });
  root.userData.feedingPointLocal = { x: .397, y: .575, z: 0 }; root.userData.holdfastPointLocal = { x: 0, y: 0, z: 0 };
}
function cuttlefish(root, parts) {
  const mantle = mesh(root, 'cuttle-mantle', () => { const b = builder(); b.ellipsoid([0, 0, 0], [.5, .19, .28], [.50, .43, .34], 28, 12,
    (x, y, z) => Math.sin(x * 31 + z * 10) > .55 && y >= 0 ? [.31, .28, .24] : [.59, .52, .40]); return b.finish(); }); root.add(mantle); parts.mantle = mantle;
  const head = mesh(root, 'cuttle-head', () => { const b = builder(); b.ellipsoid([.60, -.007, 0], [.18, .14, .19], [.55, .49, .38], 20, 10);
    for (const side of [-1, 1]) { b.ellipsoid([.60, .035, side * .178], [.080, .064, .035], [.72, .69, .56], 14, 8);
      b.tube([[.542, .043, side * .209], [.588, .034, side * .214], [.621, .045, side * .214], [.655, .034, side * .209]], [.011, .013, .013, .008], [.08, .07, .05], 6); }
    return b.finish(); }); root.add(head); parts.head = head;
  parts.fins = [-1, 1].map(side => { const fin = mesh(root, `cuttle-fin:${side}`, () => { const b = builder();
    const points = []; for (let i = 0; i <= 16; i++) { const x = -.49 + i * .06125, edge = Math.sin(Math.PI * i / 16); points.push([x, -.01, side * (.17 + edge * .12)]); points.push([x, -.015 + Math.sin(i * 1.4) * .012, side * (.18 + edge * .255)]); }
    for (let i = 0; i < 16; i++) { const a = i * 2; b.sheet([points[a], points[a + 1], points[a + 3], points[a + 2]], [.56, .51, .40]); } return b.finish(); }); root.add(fin); return fin; });
  parts.arms = [];
  for (let i = 0; i < 8; i++) { const angle = TAU * i / 8, y = Math.sin(angle) * .084, z = Math.cos(angle) * .13;
    const arm = mesh(root, `cuttle-arm:${i}`, () => { const b = builder(); b.tube([[.72, y, z], [.88, y * .93, z * 1.20], [1.03, y * .5, z * 1.25], [1.15, y * .24, z * .94]], [.033, .026, .017, .005], [.52, .46, .35], 8); return b.finish(); }); root.add(arm); parts.arms.push(arm); }
  parts.tentacles = [-1, 1].map(side => { const group = new THREE.Group(); group.position.x = .72;
    group.add(mesh(root, `cuttle-tentacle:${side}`, () => { const b = builder(); b.tube([[0, -.025, side * .042], [.24, -.016, side * .05], [.44, -.01, side * .075]], [.015, .012, .009], [.53, .47, .35], 8);
      b.ellipsoid([.49, -.012, side * .076], [.058, .023, .030], [.62, .55, .40], 12, 6); return b.finish(); })); root.add(group); return group; });
  root.userData.appendageCounts = { arms: 8, feedingTentacles: 2 }; root.userData.feedingPointLocal = { x: .68, y: -.07, z: 0 };
}
function seaPen(root, parts) {
  const peduncle = mesh(root, 'sea-pen-peduncle', () => { const b = builder(); b.tube([[0, -.25, 0], [0, -.10, 0], [0, .08, 0]], [.020, .039, .055], [.50, .38, .28], 12); return b.finish(); }); root.add(peduncle); parts.peduncle = peduncle;
  const body = mesh(root, 'sea-pen-clavate-body', () => { const b = builder(); b.tube([[0, .015, 0], [0, .16, 0], [0, .38, 0], [0, .58, 0], [0, .70, 0], [0, .75, 0]], [.040, .090, .14, .13, .070, .001], [.64, .40, .25], 24); return b.finish(); }); root.add(body); parts.body = body;
  const polyps = new THREE.Group(); root.add(polyps); parts.polyps = polyps;
  polyps.add(mesh(root, 'sea-pen-autozooids', () => { const b = builder();
    for (let i = 0; i < 32; i++) { const y = .19 + (i % 8) * .067, angle = i * 2.3999632297, radius = y < .38 ? .095 + (y - .19) * .25 : .14 - (y - .38) * .10,
      axis = new THREE.Vector3(Math.cos(angle), .12, Math.sin(angle)).normalize(), center = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
      tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)), up = new THREE.Vector3().crossVectors(axis, tangent).normalize(), tip = center.clone().addScaledVector(axis, .045);
      b.tube([center.toArray(), tip.toArray()], [.011, .009], [.72, .52, .35], 6);
      for (let t = 0; t < 8; t++) { const a = TAU * t / 8, end = tip.clone().addScaledVector(axis, .037).addScaledVector(tangent, Math.cos(a) * .020).addScaledVector(up, Math.sin(a) * .020);
        b.tube([tip.toArray(), end.toArray()], [.0035, .0015], [.76, .60, .44], 4); }
    } return b.finish(); }));
  root.userData.measureReferences = { buriedPeduncleLength: .25, expandedBodyHeight: .75, colonyBodyLength: 1 };
  root.userData.displayPolypCount = 32; root.userData.autozoidTentacles = 8; root.userData.feedingPointLocal = { x: .15, y: .48, z: 0 };
}
function spiderConch(root, parts) {
  const shell = mesh(root, 'spider-conch-shell', () => { const b = builder(), pale = [.74, .67, .51];
    b.ellipsoid([-.045, .30, -.06], [.43, .25, .28], pale, 26, 12, (x, y, z) => Math.sin(x * 44 + z * 39 + y * 17) > .75 ? [.40, .32, .22] : pale,
      corners => corners.every(p => p[1] < .18 && p[2] > -.08));
    b.tube([[-.40, .51, -.03], [-.28, .43, -.025], [-.17, .35, -.015]], [.014, .10, .17], [.66, .57, .39], 14);
    b.tube([[.23, .145, -.11], [.37, .115, -.12], [.50, .105, -.11]], [.045, .023, .007], pale, 8);
    b.sheet([[-.31, .10, .04], [.29, .09, .055], [.35, .19, .22], [-.29, .22, .26]], [.64, .43, .35]);
    b.tube([[-.35, .19, .21], [-.15, .115, .26], [.10, .12, .28], [.34, .23, .22]], [.022, .021, .02, .015], [.80, .70, .56], 8);
    for (let i = 0; i < 6; i++) { const x = -.35 + i * .135; b.tube([[x, .23 + i % 2 * .025, .23], [x - .035, .23 + i % 2 * .03, .42], [x + .025, .19 + i % 2 * .06, .65]], [.029, .018, .003], pale, 8); }
    const g = b.finish(), p = g.attributes.position, box = g.boundingBox, span = box.max.x - box.min.x;
    for (let v = 0; v < p.count; v++) p.setX(v, (p.getX(v) - box.min.x) / span - .5);
    p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }); root.add(shell); parts.shell = shell;
  const foot = mesh(root, 'spider-conch-foot', () => { const b = builder(); b.ellipsoid([.12, .035, -.035], [.40, .035, .20], [.55, .47, .33], 20, 8);
    b.ellipsoid([.40, .10, -.04], [.12, .07, .10], [.57, .48, .34], 12, 6);
    b.tube([[.45, .08, -.045], [.66, .05, -.045], [.80, .04, -.045]], [.035, .023, .012], [.65, .54, .34], 8);
    for (const side of [-1, 1]) { b.tube([[.43, .12, side * .07], [.48, .25, side * .11], [.53, .31, side * .13]], [.018, .013, .010], [.57, .47, .31], 6);
      b.ellipsoid([.53, .32, side * .13], [.018, .022, .018], [.10, .09, .06], 10, 6); }
    return b.finish(); }); root.add(foot); parts.foot = foot;
  const operculum = mesh(root, 'spider-conch-operculum', () => { const b = builder(); b.sheet([[.17, .016, -.12], [.47, .011, -.09], [.31, .01, -.17]], [.24, .20, .14]); return b.finish(); }); root.add(operculum); parts.operculum = operculum;
  root.userData.appendageCounts = { outerLipDigitations: 6, eyes: 2 }; root.userData.feedingPointLocal = { x: .80, y: .04, z: -.045 };
}
export function createOceanMeadowLifeAsset(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id, species = oceanMeadowLifeSpeciesById[id];
  if (!species) throw new Error(`Unknown ocean meadow life species: ${id}`);
  const group = new THREE.Group(), parts = {}, envelope = OCEAN_MEADOW_LIFE_ENVELOPES[id];
  group.name = species.commonName; group.userData.speciesId = id; group.userData.sizeMeasure = species.sizeMeasure;
  group.userData.meadowLifeResources = new Set(); group.userData.meadowLifeParts = parts; group.userData.meadowLifeEnvelope = envelope;
  group.userData.sourceLinks = (species.sources ?? []).map(s => ({ ...s })); group.userData.meadowLifeDisposed = false;
  if (id === 'sand-edge-seahorse') seahorse(group, parts);
  else if (id === 'reef-cuttlefish') cuttlefish(group, parts);
  else if (id === 'barrel-sea-pen') seaPen(group, parts);
  else if (id === 'spider-conch') spiderConch(group, parts);
  else throw new Error(`No qualified ocean meadow form: ${id}`);
  instances.add(group); return { group, parts, envelope };
}
export function animateOceanMeadowLifeAsset(group, timeSec, agent = {}) {
  if (!group || group.userData.meadowLifeDisposed) return;
  const time = Number.isFinite(timeSec) ? timeSec : 0, p = group.userData.meadowLifeParts, phase = Number.isFinite(group.userData.phase) ? group.userData.phase : 0;
  const moving = Math.hypot(agent.velocity?.x ?? 0, agent.velocity?.y ?? 0, agent.velocity?.z ?? 0) > 1e-8;
  const recentIntake = Number.isFinite(agent.lastFeedAt) && time >= agent.lastFeedAt && time - agent.lastFeedAt < .8;
  group.userData.meadowLifeLastTimeSec = time;
  if (group.userData.speciesId === 'sand-edge-seahorse') {
    p.dorsalFin.rotation.y = Math.sin(time * 18 + phase) * (moving ? .10 : .035);
    p.pectoralFins.forEach((fin, i) => { fin.rotation.x = Math.sin(time * 21 + phase + i * Math.PI) * (moving ? .035 : .015); });
  } else if (group.userData.speciesId === 'reef-cuttlefish') {
    p.fins.forEach((fin, i) => { fin.rotation.x = Math.sin(time * 4 + phase + i * Math.PI) * (moving ? .055 : .018); });
    p.arms.forEach((arm, i) => { arm.scale.x = recentIntake ? 1 - .025 * (.5 + .5 * Math.sin(time * 7 + i)) : 1; });
    p.tentacles.forEach(t => { t.scale.x = recentIntake ? .90 + .1 * (.5 + .5 * Math.sin(time * 8 + phase)) : .97; });
  } else if (group.userData.speciesId === 'barrel-sea-pen') {
    const extension = Number.isFinite(agent.colonyExtension) ? Math.max(0, Math.min(1, agent.colonyExtension)) : agent.state === 'retracted' ? 0 : 1;
    p.polyps.scale.setScalar(.18 + extension * .82); p.body.scale.y = .60 + extension * .40;
    group.userData.meadowLifeColonyExtension = extension;
  } else if (group.userData.speciesId === 'spider-conch') {
    p.operculum.rotation.y = moving ? Math.sin(time * 2.2 + phase) * .035 : 0;
  }
}
export function disposeOceanMeadowLifeAsset(group) {
  if (!group || group.userData.meadowLifeDisposed) return;
  group.userData.meadowLifeDisposed = true; instances.delete(group);
  for (const key of group.userData.meadowLifeResources) {
    const entry = resources.get(key); if (!entry) continue;
    entry.refs--; if (!entry.refs) { entry.value.dispose(); resources.delete(key); }
  }
  group.userData.meadowLifeResources.clear(); group.removeFromParent(); group.clear();
}
export const oceanMeadowLifeAssetStats = () => ({ resources: resources.size, instances: instances.size });
