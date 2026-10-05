import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A finite adult Chelonia outline in unit total length, facing +X. The
// scenery renderer scales the root once; neither shell length nor limb span
// is substituted for total length. Rates and proportions are display choices.
const resources = new Map(), TAU = Math.PI * 2;

function use(root, key, make) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.turtleResources.has(key)) { root.userData.turtleResources.add(key); entry.refs++; }
  return entry.value;
}

function geometry(positions, indices, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setIndex(indices); result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere(); return result;
}

function carapaceGeometry() {
  const positions = [-.035, .18, 0], colors = [.31, .29, .16], indices = [], sides = 24, rows = 7;
  for (let row = 1; row <= rows; row++) {
    const angle = row / rows * Math.PI * .5;
    for (let side = 0; side < sides; side++) {
      const azimuth = side / sides * TAU, fraction = Math.sin(angle);
      positions.push(-.035 + Math.cos(azimuth) * .36 * fraction,
        .02 + Math.cos(angle) * .16, Math.sin(azimuth) * .285 * fraction);
      // Broad olive/brown tonal variation only; no individual scute carving.
      const shade = .93 + Math.sin(azimuth * 2 + .4) * .055 + Math.cos(angle) * .055;
      colors.push(.39 * shade, .36 * shade, .20 * shade);
      const current = 1 + (row - 1) * sides + side, next = 1 + (row - 1) * sides + (side + 1) % sides;
      if (row === 1) indices.push(0, next, current);
      else { const previous = current - sides, previousNext = next - sides; indices.push(previous, previousNext, current, previousNext, next, current); }
    }
  }
  return geometry(positions, indices, colors);
}

function addColor(shape, color) {
  const rgb = new THREE.Color(color), data = new Float32Array(shape.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) { data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b; }
  shape.setAttribute('color', new THREE.BufferAttribute(data, 3)); return shape;
}

function plastronGeometry() {
  const shape = new THREE.SphereGeometry(1, 20, 10);
  shape.scale(.352, .052, .273); shape.translate(-.035, -.015, 0);
  shape.computeBoundingBox(); shape.computeBoundingSphere(); return shape;
}

function headNeckTailGeometry() {
  const profile = [
    [.25, .021, .030, .040], [.32, .023, .031, .043], [.36, .028, .046, .057],
    [.405, .030, .053, .066], [.455, .033, .044, .060], [.49, .035, .025, .040], [.5, .034, .018, .025],
  ];
  const positions = [], colors = [], indices = [], sides = 16;
  for (let row = 0; row < profile.length; row++) {
    const [x, cy, ry, rz] = profile[row];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, up = Math.cos(angle);
      positions.push(x, cy + up * ry, Math.sin(angle) * rz);
      colors.push(.45 + Math.max(0, -up) * .16, .43 + Math.max(0, -up) * .12, .28 + Math.max(0, -up) * .11);
      if (row) {
        const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  for (const row of [0, profile.length - 1]) {
    const [x, cy] = profile[row], center = positions.length / 3;
    positions.push(x, cy, 0); colors.push(.48, .45, .29);
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(...(row === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  const tail = positions.length / 3;
  positions.push(-.335, -.015, -.028, -.335, -.015, .028, -.5, -.025, 0, -.37, -.044, 0);
  for (let i = 0; i < 4; i++) colors.push(.45, .41, .25);
  indices.push(tail, tail + 2, tail + 1, tail, tail + 3, tail + 2, tail + 1, tail + 2, tail + 3, tail, tail + 1, tail + 3);
  const body = geometry(positions, indices, colors);
  // Two eyes and two tiny nasal marks are merged into this same shared mesh.
  // The rigid breathing reference is between those marks, not an animated head.
  const parts = [body];
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1, 8, 5);
    eye.scale(.012, .010, .008); eye.translate(.432, .057, side * .058);
    parts.push(addColor(eye, '#29281f'));
    const nostril = new THREE.SphereGeometry(1, 6, 4);
    nostril.scale(.004, .003, .004); nostril.translate(.49, .055, side * .020);
    parts.push(addColor(nostril, '#38362a'));
  }
  // The custom body has no UV; all merged parts use only position/normal/color.
  for (const part of parts) part.deleteAttribute('uv');
  const merged = mergeGeometries(parts); for (const part of parts) part.dispose();
  merged.computeBoundingBox(); merged.computeBoundingSphere(); return merged;
}

function flipperGeometry(front) {
  const outline = front ? [
    [0, 0, 0], [.050, .002, .070], [.015, -.004, .220], [-.125, -.010, .380],
    [-.190, -.010, .390], [-.160, -.004, .185], [-.085, .002, .050],
  ] : [
    [0, 0, 0], [-.020, .002, .065], [-.080, -.005, .195], [-.145, -.011, .230],
    [-.155, -.011, .185], [-.095, -.003, .055],
  ];
  const positions = [], colors = [], indices = [], count = outline.length;
  for (const surface of [-1, 1]) for (const [x, y, z] of outline) {
    positions.push(x, y + surface * .005, z);
    colors.push(...(surface > 0 ? [.48, .45, .28] : [.64, .58, .39]));
  }
  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i + 1, i, count, count + i, count + i + 1);
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, next, i + count, next, next + count, i + count);
  }
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return geometry(positions, indices, colors);
}

function mesh(root, shape, material, name, parent = root) {
  const object = new THREE.Mesh(shape, material); object.name = name;
  object.castShadow = false; object.receiveShadow = true;
  object.userData.oceanStreaming = true; parent.add(object); return object;
}

export function createOceanTurtleOrganism(species = {}) {
  const root = new THREE.Group(); root.name = species.commonName ?? 'Green sea turtle';
  Object.assign(root.userData, { kind: 'turtle', oceanStreaming: true, turtleResources: new Set(),
    sizeMeasure: 'total-length', nostrilReference: new THREE.Vector3(.49, .055, 0),
    anatomy: { role: 'simplified-adult-green-turtle-outline', shellLengthFraction: .72,
      unitTotalLengthBounds: [-.5, .5], horizontalRadiusBound: .64, verticalHalfHeightBound: .25,
      includedPitchLimitRad: .15, maximumFrontFlipperAngleRad: .14, maximumRearFlipperAngleRad: .05 } });
  const motion = { frontFlippers: [], rearFlippers: [] }; root.userData.motion = motion;
  try {
    const shellMaterial = use(root, 'mat/shell', () => new THREE.MeshStandardMaterial({
      color: '#d9d1b6', vertexColors: true, roughness: .87, metalness: 0, side: THREE.DoubleSide }));
    const bellyMaterial = use(root, 'mat/plastron', () => new THREE.MeshStandardMaterial({
      color: '#b7ad86', roughness: .91, metalness: 0 }));
    const skinMaterial = use(root, 'mat/skin', () => new THREE.MeshStandardMaterial({
      color: '#ded4b9', vertexColors: true, roughness: .89, metalness: 0 }));
    mesh(root, use(root, 'geom/carapace', carapaceGeometry), shellMaterial, 'carapace');
    mesh(root, use(root, 'geom/plastron', plastronGeometry), bellyMaterial, 'plastron');
    mesh(root, use(root, 'geom/head-neck-tail', headNeckTailGeometry), skinMaterial, 'head-neck-tail');
    for (const front of [true, false]) for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.name = `${front ? 'front' : 'rear'}-flipper-${side < 0 ? 'left' : 'right'}`;
      pivot.position.set(front ? .20 : -.27, front ? -.004 : -.022, side * (front ? .20 : .18));
      pivot.userData.side = side; root.add(pivot);
      const shape = use(root, front ? 'geom/front-flipper' : 'geom/rear-flipper', () => flipperGeometry(front));
      const flipper = mesh(root, shape, skinMaterial, `${front ? 'front' : 'rear'}-flipper`, pivot);
      flipper.scale.z = side; (front ? motion.frontFlippers : motion.rearFlippers).push(pivot);
    }
    return root;
  } catch (error) { disposeOceanTurtleOrganism(root); throw error; }
}

export function animateOceanTurtleOrganism(root, timeSec, agent = {}) {
  if (!root?.userData.motion || root.userData.turtleDisposed) return;
  const time = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const breathing = agent.state === 'breathing';
  const amplitude = breathing ? .024 : agent.state === 'surfacing' || agent.state === 'diving' ? .14 : .12;
  const stroke = Math.sin(time * .72 + phase);
  for (const pivot of root.userData.motion.frontFlippers) pivot.rotation.x = pivot.userData.side * amplitude * stroke;
  for (const pivot of root.userData.motion.rearFlippers) pivot.rotation.x = pivot.userData.side *
    (breathing ? .016 : .05) * Math.sin(time * .55 + phase + .45);
  // The controller owns root pose and pitch. In particular the rigid head and
  // nostril reference never bob independently of the actual animal body.
}

export function disposeOceanTurtleOrganism(root) {
  if (!root || root.userData.turtleDisposed) return;
  root.userData.turtleDisposed = true; root.removeFromParent();
  for (const key of root.userData.turtleResources ?? []) {
    const entry = resources.get(key);
    if (entry && --entry.refs <= 0) { entry.value.dispose(); resources.delete(key); }
  }
  root.userData.turtleResources?.clear(); root.clear();
}
