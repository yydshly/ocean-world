import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Display envelopes use the same metres/reference points as regional ecology.
// The squid points +X; jelly Y=0 is its neutral bell's geometric centre.
export const OPEN_WATER_ASSET_ENVELOPES = Object.freeze({
  'reef-squid': Object.freeze({ sizeMeasure: 'total-length', horizontalRadius: .6, minY: -.35, maxY: .35, pitchLimit: .2 }),
  'spotted-jelly': Object.freeze({ sizeMeasure: 'bell-diameter', horizontalRadius: .7, minY: -1.2, maxY: .55, pitchLimit: 0 }),
});
export const isOpenWaterSpecies = id => Object.hasOwn(OPEN_WATER_ASSET_ENVELOPES, id);
const resources = new Map(), instances = new Set(), TAU = Math.PI * 2;

function share(root, key, make) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.waterLifeResources.has(key)) { root.userData.waterLifeResources.add(key); entry.refs++; }
  return entry.value;
}
function finish(shape) {
  shape.computeVertexNormals(); shape.computeBoundingBox(); shape.computeBoundingSphere(); return shape;
}
function geometry(positions, indices, colors) {
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  shape.setIndex(indices); return finish(shape);
}
function colored(shape, color) {
  shape.deleteAttribute('uv'); const rgb = new THREE.Color(color);
  const values = new Float32Array(shape.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = rgb.r; values[i + 1] = rgb.g; values[i + 2] = rgb.b; }
  shape.setAttribute('color', new THREE.BufferAttribute(values, 3)); return shape;
}
function ellipsoid(center, scale, color, columns = 12, rows = 6) {
  const shape = colored(new THREE.SphereGeometry(1, columns, rows), color);
  shape.scale(...scale); shape.translate(...center); return shape;
}
function merge(parts) {
  const result = mergeGeometries(parts); for (const part of parts) part.dispose(); return finish(result);
}
function tube(points, radii, color, sides = 8) {
  const positions = [], indices = [], colors = [], rgb = new THREE.Color(color);
  // Rings use a local frame perpendicular to each centreline segment, so both
  // forward squid appendages and downward oral arms retain actual volume.
  for (let row = 0; row < points.length; row++) {
    const previous = new THREE.Vector3(...points[Math.max(0, row - 1)]);
    const next = new THREE.Vector3(...points[Math.min(points.length - 1, row + 1)]);
    const tangent = next.sub(previous).normalize();
    const reference = Math.abs(tangent.y) > .8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const first = new THREE.Vector3().crossVectors(tangent, reference).normalize();
    const second = new THREE.Vector3().crossVectors(tangent, first).normalize();
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      const offset = first.clone().multiplyScalar(Math.cos(angle) * radii[row])
        .addScaledVector(second, Math.sin(angle) * radii[row]);
      positions.push(points[row][0] + offset.x, points[row][1] + offset.y, points[row][2] + offset.z);
      const shade = .9 + .1 * (Math.cos(angle) + 1) / 2;
      colors.push(rgb.r * shade, rgb.g * shade, rgb.b * shade);
      if (row) {
        const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  for (const row of [0, points.length - 1]) {
    const center = positions.length / 3; positions.push(...points[row]); colors.push(rgb.r, rgb.g, rgb.b);
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(...(row === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  return geometry(positions, indices, colors);
}

function squidMantle() {
  const profile = [[-.5, .001, .001], [-.44, .037, .053], [-.34, .065, .085], [-.21, .081, .100],
    [-.08, .078, .099], [.055, .055, .068], [.12, .041, .043]];
  const positions = [], indices = [], colors = [], sides = 16;
  const skin = new THREE.Color('#9a9b82'), dark = new THREE.Color('#657972');
  for (let row = 0; row < profile.length; row++) for (let side = 0; side < sides; side++) {
    const [x, ry, rz] = profile[row], angle = side / sides * TAU;
    positions.push(x, Math.cos(angle) * ry, Math.sin(angle) * rz);
    const color = skin.clone().lerp(dark, .15 + .2 * Math.max(0, Math.cos(angle)) + .12 * Math.sin(row * 1.4) ** 2);
    colors.push(color.r, color.g, color.b);
    if (row) {
      const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  // The short end caps are part of the complete mantle, never open proxy rings.
  for (const row of [0, profile.length - 1]) {
    const center = positions.length / 3; positions.push(profile[row][0], 0, 0); colors.push(skin.r, skin.g, skin.b);
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(...(row === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  return geometry(positions, indices, colors);
}
function squidBody() {
  const parts = [squidMantle(), ellipsoid([.14, 0, 0], [.062, .054, .060], '#a1a78e')];
  for (const side of [-1, 1]) parts.push(ellipsoid([.139, .018, side * .058], [.022, .024, .016], '#263931', 10, 6));
  for (let arm = 0; arm < 8; arm++) {
    const angle = arm / 8 * TAU;
    const at = (x, radius, turn = 0) => [x, Math.cos(angle + turn) * radius, Math.sin(angle + turn) * radius];
    parts.push(tube([at(.18, .042), at(.245, .047), at(.31, .030, .08), at(.390 + (arm % 2) * .018, .018, -.10)],
      [.016, .015, .010, .003], '#a6a88e'));
  }
  for (const side of [-1, 1]) {
    parts.push(tube([[.175, -.026, side * .033], [.28, -.024, side * .042], [.405, -.016, side * .033], [.48, -.012, side * .029]],
      [.008, .006, .005, .007], '#a7aa92'));
    parts.push(ellipsoid([.483, -.012, side * .029], [.017, .010, .012], '#a8ad95', 10, 6));
  }
  return merge(parts);
}
function squidFin() {
  // A broad elongated fin runs most of the mantle length. Its thin closed
  // membrane moves about the true mantle edge, rather than the animal root.
  const outline = [[-.31, 0, .01], [-.24, 0, .094], [-.12, 0, .192], [.015, 0, .218],
    [.13, 0, .144], [.25, 0, .006], [.12, 0, .024], [-.05, 0, .055], [-.22, 0, .024]];
  const positions = [], indices = [], colors = [], rgb = new THREE.Color('#9ba990'), count = outline.length;
  for (const side of [-1, 1]) for (const [x, y, z] of outline) {
    positions.push(x, y + side * .003, z); colors.push(rgb.r, rgb.g, rgb.b);
  }
  for (let i = 1; i < count - 1; i++) indices.push(0, i + 1, i, count, count + i, count + i + 1);
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count; indices.push(i, next, i + count, next, next + count, i + count);
  }
  return geometry(positions, indices, colors);
}

function jellyBell() {
  const positions = [], indices = [], colors = [], sides = 36, rows = 12;
  const skin = new THREE.Color('#b1b69d'), white = new THREE.Color('#eeeeda');
  // A neutral hemisphere centred by its bounding box: top +.25, rim -.25.
  // White surface patches are vertex colour on the same translucent membrane.
  const patches = Array.from({ length: 24 }, (_, index) => {
    const angle = index * 2.3999632297, radius = Math.sqrt((index + .5) / 24) * .47;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  for (let row = 0; row <= rows; row++) {
    const latitude = row / rows * Math.PI / 2;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, x = Math.cos(angle) * Math.sin(latitude) * .5;
      const z = Math.sin(angle) * Math.sin(latitude) * .5, y = -.25 + Math.cos(latitude) * .5;
      positions.push(x, y, z);
      const color = patches.some(([px, pz]) => (x - px) ** 2 + (z - pz) ** 2 < .0009) ? white : skin;
      colors.push(color.r, color.g, color.b);
      if (row) {
        const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  return geometry(positions, indices, colors);
}
function jellyOralArms() {
  const parts = [ellipsoid([0, -.31, 0], [.17, .09, .17], '#bbb79a', 16, 8)];
  for (let arm = 0; arm < 8; arm++) {
    const angle = arm / 8 * TAU, at = (radius, y, turn = 0) => [Math.cos(angle + turn) * radius, y, Math.sin(angle + turn) * radius];
    const lower = -.93 - (arm % 3) * .075;
    parts.push(tube([at(.095, -.31), at(.16, -.47), at(.22, -.64, .08), at(.20, -.83, -.04), at(.15, lower, -.09)],
      [.039, .051, .053, .036, .009], '#c6c2a5'));
    // Coarse frilled oral-arm branches, not long marginal tentacles.
    for (let branch = 0; branch < 3; branch++) {
      const y = -.47 - branch * .15, radius = .17 + branch * .015;
      const center = at(radius, y), left = at(radius + .052, y - .075, -.16);
      const right = at(radius + .065, y - .085, .16);
      parts.push(tube([center, left], [.024, .009], '#dbd6b5', 6));
      parts.push(tube([center, right], [.024, .009], '#dbd6b5', 6));
    }
  }
  return merge(parts);
}
function mesh(parent, shape, material, name) {
  const object = new THREE.Mesh(shape, material); object.name = name;
  object.castShadow = false; object.receiveShadow = true; object.userData.oceanStreaming = true; parent.add(object); return object;
}
export function createOpenWaterOrganism(species) {
  if (!isOpenWaterSpecies(species?.id)) throw new Error('Unknown open-water representative');
  const root = new THREE.Group(), id = species.id; root.name = species.commonName ?? id;
  Object.assign(root.userData, { speciesId: id, kind: species.kind, oceanStreaming: true,
    sizeMeasure: OPEN_WATER_ASSET_ENVELOPES[id].sizeMeasure, waterLifeResources: new Set(), waterLifeDisposed: false,
    localEnvelope: { ...OPEN_WATER_ASSET_ENVELOPES[id] }, phase: 0,
    morphologyStatus: 'complete simplified silhouette; uncalibrated fin/pulse display',
    referencePoint: id === 'reef-squid' ? 'total-length centre' : 'neutral bell geometric centre',
  });
  instances.add(root);
  try {
    if (id === 'reef-squid') {
      const material = share(root, 'squid/material', () => new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: .65, metalness: 0, side: THREE.DoubleSide }));
      const near = new THREE.Group(), far = new THREE.Group(); root.add(near, far); far.visible = false;
      const body = share(root, 'squid/body', squidBody), fin = share(root, 'squid/fin', squidFin);
      mesh(near, body, material, 'Long mantle head eight arms and two tentacles');
      const fins = [];
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(-.17, 0, side * .054); pivot.userData.side = side;
        const object = mesh(pivot, fin, material, `Broad ${side < 0 ? 'left' : 'right'} mantle fin`);
        object.scale.z = side; near.add(pivot); fins.push(pivot);
      }
      const whole = share(root, 'squid/far', () => {
        const left = fin.clone(); left.scale(1, 1, -1); left.translate(-.17, 0, -.054);
        const right = fin.clone(); right.translate(-.17, 0, .054); return merge([body.clone(), left, right]);
      });
      mesh(far, whole, material, 'Complete distant squid outline');
      root.userData.waterMotion = { type: 'squid-fin', fins, armCount: 8, tentacleCount: 2 };
      root.userData.waterDetail = { level: 'near', near, far, farAboveSizeUnits: 24, nearBelowSizeUnits: 18 };
    } else {
      const bellMaterial = share(root, 'jelly/bell-material', () => new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: .48, metalness: 0,
        transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide }));
      const oralMaterial = share(root, 'jelly/oral-material', () => new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: .75, metalness: 0,
        transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide }));
      const bell = mesh(root, share(root, 'jelly/bell', jellyBell), bellMaterial, 'Translucent hemisphere with white patches');
      const oral = mesh(root, share(root, 'jelly/oral-arms', jellyOralArms), oralMaterial, 'Eight branched downward oral arms');
      bell.renderOrder = 2; oral.renderOrder = 1;
      root.userData.waterMotion = { type: 'jelly-pulse', bell, oral, oralArmCount: 8, marginalTentacleCount: 0 };
    }
    return root;
  } catch (error) { disposeOpenWaterOrganism(root); throw error; }
}

export function animateOpenWaterOrganism(root, timeSec, agent = {}) {
  if (!root?.userData.waterMotion || root.userData.waterLifeDisposed) return;
  const motion = root.userData.waterMotion, time = Number.isFinite(timeSec) ? timeSec : 0;
  const phase = Number.isFinite(agent.pulsePhase) ? agent.pulsePhase : Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  if (motion.type === 'squid-fin') {
    const amplitude = agent.state === 'resting' ? .025 : .10;
    for (const pivot of motion.fins) pivot.rotation.x = pivot.userData.side * Math.sin(time * 2.2 + phase) * amplitude;
  } else {
    const pulse = (Math.sin(time * 1.65 + phase) + 1) / 2;
    motion.bell.scale.set(1 - pulse * .10, 1 - pulse * .08, 1 - pulse * .10);
    motion.oral.rotation.y = Math.sin(time * .55 + phase) * .018;
  }
  // The ecological controller owns all displacement, drift, depth and yaw.
}
const worldScale = new THREE.Vector3();
export function updateOpenWaterDetail(root, distanceM) {
  const detail = root?.userData.waterDetail;
  if (!detail || root.userData.waterLifeDisposed || !Number.isFinite(distanceM) || distanceM < 0) return;
  root.getWorldScale(worldScale);
  const units = distanceM / Math.max(1e-6, Math.abs(worldScale.x));
  const level = detail.level === 'near' ? units > detail.farAboveSizeUnits ? 'far' : 'near'
    : units < detail.nearBelowSizeUnits ? 'near' : 'far';
  detail.level = level; detail.near.visible = level === 'near'; detail.far.visible = level === 'far'; return level;
}
export function disposeOpenWaterOrganism(root) {
  if (!root || root.userData.waterLifeDisposed) return;
  root.userData.waterLifeDisposed = true;
  for (const key of root.userData.waterLifeResources ?? []) {
    const entry = resources.get(key);
    if (entry && --entry.refs <= 0) { entry.value.dispose(); resources.delete(key); }
  }
  root.userData.waterLifeResources?.clear(); instances.delete(root); root.removeFromParent(); root.clear();
}
export function openWaterAssetStats() { return { resources: resources.size, instances: instances.size }; }
