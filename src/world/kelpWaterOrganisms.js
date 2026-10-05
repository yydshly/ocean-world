import * as THREE from 'three';

// Simple unit-total-length S. mystinus silhouette, distinct from leaf-shaped
// Heterostichus. Dimensions and tail motion are display choices, not scans or
// calibrated rates. Four shared meshes per fish keep schools inexpensive.
const resources = new Map();
const TAU = Math.PI * 2;

function shared(root, key, create) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: create(), owners: 0 }; resources.set(key, entry); }
  if (!root.userData.waterResources.has(key)) { root.userData.waterResources.add(key); entry.owners++; }
  return entry.value;
}

function geometry(positions, indices, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setIndex(indices); result.computeVertexNormals(); result.computeBoundingSphere();
  return result;
}

function bodyGeometry() {
  // Forebody is deep and rounded; the posterior tapers into a narrow stalk.
  const rings = [
    [.50, -.016, .012, .010], [.44, -.002, .060, .043],
    [.34, .001, .104, .067], [.20, 0, .142, .079],
    [.03, -.006, .147, .073], [-.13, -.010, .127, .055],
    [-.25, -.009, .084, .034], [-.33, -.008, .037, .020],
  ];
  const sides = 16, positions = [], colors = [], indices = [];
  const belly = new THREE.Color('#a8aea9'), flank = new THREE.Color('#788e9a'), back = new THREE.Color('#536873');
  for (let row = 0; row < rings.length; row++) {
    const [x, cy, ry, rz] = rings[row];
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * TAU, vertical = Math.cos(a), lateral = Math.sin(a);
      positions.push(x, cy + vertical * ry, lateral * rz);
      const color = vertical < 0 ? flank.clone().lerp(belly, -vertical) : flank.clone().lerp(back, vertical);
      const patch = Math.min(((x - .18) / .145) ** 2 + ((vertical - .10) / .65) ** 2,
        ((x + .16) / .125) ** 2 + ((vertical - .25) / .65) ** 2);
      if (Math.abs(lateral) > .5 && patch < 1) color.multiplyScalar(.63);
      colors.push(color.r, color.g, color.b);
      if (row < rings.length - 1 && side < sides) {
        const b = row * (sides + 1) + side;
        indices.push(b, b + sides + 1, b + 1, b + 1, b + sides + 1, b + sides + 2);
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
  const strip = (upper, lower) => {
    const offset = positions.length / 3;
    for (let i = 0; i < upper.length; i++) positions.push(...upper[i], ...lower[i]);
    for (let i = 0; i < upper.length - 1; i++) {
      const b = offset + i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  };
  // One continuous dorsal sheet: front spines, a shallow notch, rear soft lobe.
  const dorsal = [[.32, .108, .176], [.27, .128, .229], [.22, .141, .202],
    [.17, .145, .237], [.12, .145, .207], [.06, .140, .226], [.005, .130, .191],
    [-.05, .122, .161], [-.11, .116, .199], [-.18, .096, .205], [-.25, .074, .175], [-.32, .032, .084]];
  strip(dorsal.map(([x, , y]) => [x, y, 0]), dorsal.map(([x, y]) => [x, y, 0]));
  strip([[-.10, -.122, 0], [-.18, -.193, 0], [-.26, -.169, 0], [-.31, -.045, 0]],
    [[-.10, -.116, 0], [-.18, -.096, 0], [-.26, -.060, 0], [-.31, -.029, 0]]);
  for (const side of [-1, 1]) {
    strip([[.24, -.015, side * .066], [.13, -.030, side * .139], [.025, -.075, side * .152]],
      [[.24, -.040, side * .066], [.12, -.090, side * .115], [.025, -.075, side * .152]]);
    strip([[.13, -.125, side * .040], [.025, -.167, side * .070], [-.045, -.152, side * .076]],
      [[.13, -.115, side * .040], [.015, -.125, side * .047], [-.045, -.152, side * .076]]);
  }
  return geometry(positions, indices);
}

function tailGeometry() {
  // A broad, weakly emarginate tail: the central edge is only slightly shorter.
  return geometry([0, .030, 0, 0, -.030, 0, -.17, .096, 0,
    -.17, -.096, 0, -.147, 0, 0], [0, 1, 4, 0, 4, 2, 1, 3, 4]);
}

function eyesGeometry() {
  const positions = [], indices = [];
  for (const side of [-1, 1]) {
    const sphere = new THREE.SphereGeometry(1, 10, 7);
    sphere.scale(.022, .024, .009); sphere.translate(.355, .046, side * .064);
    const offset = positions.length / 3;
    positions.push(...sphere.attributes.position.array);
    for (const index of sphere.index.array) indices.push(index + offset);
    sphere.dispose();
  }
  return geometry(positions, indices);
}

export function createKelpWaterOrganism(species) {
  if (species?.id !== 'blue-rockfish') throw new Error(`Unsupported kelp water organism: ${species?.id}`);
  const root = new THREE.Group(); root.name = species.commonName ?? species.id;
  root.userData.speciesId = species.id; root.userData.kind = 'fish';
  root.userData.morphologyStatus = 'source-grounded-procedural-proxy';
  root.userData.sizeMeasure = 'total-length'; root.userData.waterResources = new Set();
  root.userData.sources = (species.sources ?? []).map(source => ({ ...source }));
  const anatomy = new THREE.Group(); anatomy.name = 'Deep oval rockfish body'; root.add(anatomy);
  const mesh = (name, key, make, material, parent = anatomy) => {
    const result = new THREE.Mesh(shared(root, `geometry/${key}`, make), material);
    result.name = name; parent.add(result); return result;
  };
  const bodyMaterial = shared(root, 'material/body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .73, metalness: .02 }));
  const finMaterial = shared(root, 'material/fin', () => new THREE.MeshStandardMaterial({ color: '#667d86', roughness: .77, side: THREE.DoubleSide }));
  const eyeMaterial = shared(root, 'material/eye', () => new THREE.MeshStandardMaterial({ color: '#161e22', roughness: .36 }));
  const body = mesh('Grey-blue body with broad dark patches', 'body', bodyGeometry, bodyMaterial);
  const fins = mesh('Continuous dorsal and paired fins', 'fins', finGeometry, finMaterial);
  mesh('Lateral eyes', 'eyes', eyesGeometry, eyeMaterial);
  const tail = new THREE.Group(); tail.name = 'Caudal propulsion'; tail.position.set(-.33, -.008, 0); anatomy.add(tail);
  mesh('Broad shallow-notched tail', 'tail', tailGeometry, finMaterial, tail);
  root.userData.motion = { type: 'rockfish', anatomy, tail, body, fins, lastTimeSec: 0, phaseRad: 0 };
  animateKelpWaterOrganism(root, 0);
  return root;
}

export function animateKelpWaterOrganism(root, timeSec, agent = {}) {
  const motion = root?.userData.motion;
  if (motion?.type !== 'rockfish' || root.userData.waterDisposed) return;
  const clock = Number.isFinite(timeSec) ? timeSec : 0;
  const phase = Number.isFinite(agent.individualPhaseRad) ? agent.individualPhaseRad : (root.userData.phase ?? 0);
  const beat = clock * 5 + phase;
  motion.tail.rotation.y = Math.sin(beat) * .14;
  motion.anatomy.rotation.y = Math.sin(beat - .65) * .009;
  motion.lastTimeSec = clock; motion.phaseRad = phase;
}

export function disposeKelpWaterOrganism(root) {
  if (!root?.userData.waterResources || root.userData.waterDisposed) return;
  root.userData.waterDisposed = true;
  for (const key of root.userData.waterResources) {
    const entry = resources.get(key);
    if (entry && --entry.owners === 0) { entry.value.dispose(); resources.delete(key); }
  }
  root.userData.waterResources.clear(); root.removeFromParent(); root.clear();
}
