import * as THREE from 'three';

// A source-grounded, simplified Triakis silhouette in unit total length:
// neutral nose/tail bounds are x=+.5/-.5. All four meshes and three materials
// are shared. No skin map, fine scales or teeth are generated. Model dimensions
// and tail rates are display choices, not an animal scan or measured kinematics.
const resources = new Map();
const TAU = Math.PI * 2;

function shared(root, key, create) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: create(), owners: 0 }; resources.set(key, entry); }
  if (!root.userData.visitorResources.has(key)) { root.userData.visitorResources.add(key); entry.owners++; }
  return entry.value;
}

function geometry(positions, indices, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setIndex(indices); result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

function bodyGeometry() {
  const profile = [
    [.5, -.014, .007, .012], [.475, -.013, .017, .031], [.42, -.008, .044, .048],
    [.34, -.004, .056, .060], [.22, 0, .061, .062], [.09, -.002, .055, .056],
    [-.05, -.004, .039, .041], [-.17, -.007, .026, .027], [-.27, -.008, .013, .013],
  ];
  const rings = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1], steps = Math.max(1, Math.ceil((a[0] - b[0]) / .02));
    for (let step = 0; step < steps; step++) rings.push(a.map((value, j) => THREE.MathUtils.lerp(value, b[j], step / steps)));
  }
  rings.push(profile.at(-1));
  const positions = [], colors = [], indices = [], sides = 24;
  const back = new THREE.Color('#838b7d'), flank = new THREE.Color('#a0a08c'), belly = new THREE.Color('#c0c3b5');
  const saddle = new THREE.Color('#424c43');
  const saddleCenters = [.36, .22, .07, -.08, -.20];
  for (let row = 0; row < rings.length; row++) {
    const [x, cy, ry, rz] = rings[row];
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU, vertical = Math.cos(angle), lateral = Math.sin(angle);
      positions.push(x, cy + vertical * ry, lateral * rz);
      const color = vertical < 0 ? flank.clone().lerp(belly, -vertical) : flank.clone().lerp(back, vertical);
      const fromBack = Math.min(angle, TAU - angle);
      const patch = Math.min(...saddleCenters.map(center => ((x - center) / .041) ** 2 + (fromBack / 1.42) ** 2));
      if (patch < 1) color.lerp(saddle, .88 * THREE.MathUtils.smoothstep(1 - patch, 0, .24));
      colors.push(color.r, color.g, color.b);
      if (row < rings.length - 1 && side < sides) {
        const a = row * (sides + 1) + side;
        indices.push(a, a + sides + 1, a + 1, a + 1, a + sides + 1, a + sides + 2);
      }
    }
  }
  for (const row of [0, rings.length - 1]) {
    const [x, cy] = rings[row], center = positions.length / 3;
    positions.push(x, cy, 0); colors.push(flank.r, flank.g, flank.b);
    for (let side = 0; side < sides; side++) {
      const a = row * (sides + 1) + side;
      indices.push(...(row === 0 ? [center, a, a + 1] : [center, a + 1, a]));
    }
  }
  return geometry(positions, indices, colors);
}

function finGeometry() {
  const positions = [], indices = [];
  const polygon = points => {
    const start = positions.length / 3; for (const point of points) positions.push(...point);
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
  };
  // The two separate dorsals and swept triangular pectorals read at ordinary
  // observation distance; small pelvic/anal sheets complete the silhouette.
  polygon([[.22, .056, 0], [.16, .180, 0], [.045, .052, 0], [.085, .043, 0]]);
  polygon([[-.10, .029, 0], [-.16, .111, 0], [-.235, .009, 0], [-.20, .009, 0]]);
  polygon([[-.12, -.030, 0], [-.19, -.079, 0], [-.235, -.019, 0]]);
  for (const side of [-1, 1]) {
    polygon([[.28, -.009, side * .054], [.075, -.055, side * .180], [.055, -.039, side * .058]]);
    polygon([[-.02, -.028, side * .034], [-.13, -.044, side * .086], [-.14, -.028, side * .026]]);
  }
  return geometry(positions, indices);
}

function tailGeometry() {
  // Coordinates are relative to the x=-.255 peduncle. The upper lobe extends
  // farther than the lower lobe, giving an asymmetric taper rather than a fan.
  return geometry([
    .010, .014, 0, -.075, .028, 0, -.245, .130, 0,
    -.193, .035, 0, -.175, -.006, 0, -.160, -.083, 0,
    -.082, -.037, 0, .010, -.014, 0,
  ], [0, 1, 7, 1, 6, 7, 1, 3, 6, 1, 2, 3, 3, 4, 6, 4, 5, 6]);
}

function faceGeometry() {
  const positions = [], indices = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1, 8, 6);
    eye.scale(.0065, .0075, .004); eye.translate(.406, .018, side * .047);
    const offset = positions.length / 3;
    positions.push(...eye.attributes.position.array);
    for (const index of eye.index.array) indices.push(index + offset);
    eye.dispose();
  }
  // A small downward-facing mouth patch; no exposed teeth or frontal smile.
  const offset = positions.length / 3;
  positions.push(.428, -.052, -.017, .428, -.052, .017,
    .402, -.053, .021, .405, -.053, -.021);
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  return geometry(positions, indices);
}

export function createKelpVisitorOrganism(species) {
  if (species?.id !== 'leopard-shark') throw new Error(`Unsupported kelp visitor organism: ${species?.id}`);
  const root = new THREE.Group(); root.name = species.commonName ?? species.id;
  root.userData.speciesId = species.id; root.userData.kind = 'fish';
  root.userData.morphologyStatus = 'source-grounded-procedural-proxy';
  root.userData.sizeMeasure = 'total-length'; root.userData.visitorResources = new Set();
  root.userData.sources = (species.sources ?? []).map(source => ({ ...source }));
  root.userData.localEnvelope = { x: .51, y: .20, z: .20 };
  const bodyMaterial = shared(root, 'material/body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .01 }));
  const finMaterial = shared(root, 'material/fin', () => new THREE.MeshStandardMaterial({ color: '#828b7d', roughness: .75, side: THREE.DoubleSide }));
  const faceMaterial = shared(root, 'material/face', () => new THREE.MeshStandardMaterial({ color: '#202923', roughness: .42, side: THREE.DoubleSide }));
  const mesh = (name, key, make, material, parent = root) => {
    const item = new THREE.Mesh(shared(root, `geometry/${key}`, make), material);
    item.name = name; parent.add(item); return item;
  };
  mesh('Slender silver-bronze body with dark dorsal saddles', 'body', bodyGeometry, bodyMaterial);
  mesh('Two dorsal and swept paired fins', 'fins', finGeometry, finMaterial);
  mesh('Small lateral eyes and underside mouth', 'face', faceGeometry, faceMaterial);
  const tail = new THREE.Group(); tail.name = 'Asymmetric caudal propulsion'; tail.position.set(-.255, -.008, 0); root.add(tail);
  mesh('Long upper and short lower caudal lobes', 'tail', tailGeometry, finMaterial, tail);
  root.userData.motion = { type: 'leopard-shark', tail, lastTimeSec: 0, phaseRad: 0 };
  animateKelpVisitorOrganism(root, 0);
  return root;
}

export function animateKelpVisitorOrganism(root, timeSec, agent = {}) {
  const motion = root?.userData.motion;
  if (motion?.type !== 'leopard-shark' || root.userData.visitorDisposed) return;
  const clock = Number.isFinite(timeSec) ? timeSec : 0;
  const phase = Number.isFinite(agent.individualPhaseRad) ? agent.individualPhaseRad : (root.userData.phase ?? 0);
  // Fixed clock phase makes pause/reload/origin changes deterministic. Velocity
  // changes amplitude only, rather than rephasing an accumulated animation.
  const speed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.y || 0, agent.velocity?.z || 0);
  const amplitude = .13 + THREE.MathUtils.clamp(speed / Math.max(.1, agent.sizeM || 1.35), 0, 1) * .08;
  motion.tail.rotation.y = Math.sin(clock * 3.6 + phase) * amplitude;
  motion.lastTimeSec = clock; motion.phaseRad = phase;
}

export function disposeKelpVisitorOrganism(root) {
  if (!root?.userData.visitorResources || root.userData.visitorDisposed) return;
  root.userData.visitorDisposed = true;
  for (const key of root.userData.visitorResources) {
    const entry = resources.get(key);
    if (entry && --entry.owners === 0) { entry.value.dispose(); resources.delete(key); }
  }
  root.userData.visitorResources.clear(); root.removeFromParent(); root.clear();
}
