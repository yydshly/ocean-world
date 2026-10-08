import * as THREE from 'three';
import { oceanReefCommunitySpeciesById } from '../oceanReefCommunitySpecies.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const REEF_COMMUNITY_BENTHIC_ASSET_VERSION = 1;
export const REEF_COMMUNITY_BENTHIC_IDS = Object.freeze(['peacock-mantis-shrimp', 'green-turban-snail']);
export const isReefCommunityBenthic = value => REEF_COMMUNITY_BENTHIC_IDS.includes(typeof value === 'string' ? value : value?.id ?? value?.speciesId);
function shared(root, key, make) {
  let row = resources.get(key);
  if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefCommunityBenthicResources.has(key)) { row.refs++; root.userData.reefCommunityBenthicResources.add(key); }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const id = positions.length / 3; positions.push(...p); colors.push(...tint); return id; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 16, rows = 8) {
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
  function tube(points, radii, tint, sides = 8) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]), tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(row - 1, 0)])).normalize();
      const u = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(tangent, u);
      for (let side = 0; side < sides; side++) vertex(p.clone().addScaledVector(u, Math.cos(side * TAU / sides) * radii[row])
        .addScaledVector(v, Math.sin(side * TAU / sides) * radii[row]).toArray(), tint);
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, c = start + row * sides + (side + 1) % sides;
      face(a, c, a + sides); face(c, c + sides, a + sides);
    }
    for (const [row, reverse] of [[0, true], [points.length - 1, false]]) {
      const center = vertex(points[row], tint);
      for (let side = 0; side < sides; side++) {
        const a = start + row * sides + side, next = start + row * sides + (side + 1) % sides;
        reverse ? face(center, next, a) : face(center, a, next);
      }
    }
  }
  return { positions, vertex, face, ellipsoid, tube, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function mantisBody() {
  const b = builder(), green = [.25, .40, .18], rim = [.43, .20, .09];
  // The body-length measure excludes antennae and folded raptorial appendages.
  b.ellipsoid([.18, .183, 0], [.205, .086, .134], (x, y, z) => {
    const mottled = Math.sin(x * 87 + z * 53) * Math.cos(z * 97 - y * 33);
    return Math.abs(z) > .095 && mottled > .42 ? [.11, .14, .07] : [green[0] + mottled * .025, green[1] + mottled * .04, green[2]];
  }, 24, 12);
  b.ellipsoid([.384, .186, 0], [.076, .046, .105], [.29, .43, .20]);
  b.tube([[.425, .205, 0], [.485, .185, 0], [.5, .179, 0]], [.026, .009, 0], [.34, .43, .19]);
  for (let segment = 0; segment < 5; segment++) {
    const x = -.305 + segment * .071, breadth = .096 + segment * .006;
    b.ellipsoid([x, .154, 0], [.046, .056, breadth], (px, py) => py > .176 ? [.29, .42, .18] : [.24, .31, .15]);
    b.tube([[x - .028, .165, -breadth * .8], [x - .032, .202, 0], [x - .028, .165, breadth * .8]], [.007, .007, .007], rim);
    for (const sign of [-1, 1]) b.ellipsoid([x, .092, sign * .07], [.024, .029, .045], [.35, .24, .13], 10, 5);
  }
  b.ellipsoid([-.435, .126, 0], [.065, .031, .080], [.25, .38, .16], 16, 8);
  for (const sign of [-1, 1]) {
    b.ellipsoid([-.417, .121, sign * .126], [.070, .025, .087], [.12, .26, .20], 16, 8);
    b.ellipsoid([-.417, .123, sign * .180], [.054, .014, .045], [.44, .19, .09], 12, 6);
    // Broad antennal scales and three pairs of small maxillipeds are not legs.
    b.ellipsoid([.381, .173, sign * .183], [.082, .023, .074], [.54, .27, .10], 16, 8);
    for (let i = 0; i < 3; i++) b.tube([[.22 + i * .048, .113, sign * .059], [.275 + i * .045, .068, sign * .094],
      [.305 + i * .043, .082, sign * .055]], [.009, .008, .003], [.46, .23, .09]);
  }
  return b.finish();
}
function mantisFeet(species) {
  const b = builder();
  for (const p of species.support.footContacts) {
    const sign = Math.sign(p.z);
    b.tube([[p.x + .028, .148, sign * .085], [p.x - .021, .084, sign * .170], [p.x, p.y, p.z]], [.012, .009, 0], [.48, .23, .10]);
  }
  return b.finish();
}
function mantisEyes(sign) {
  const b = builder();
  b.tube([[0, 0, 0], [.012, .055, sign * .014]], [.014, .011], [.19, .30, .32]);
  b.ellipsoid([.018, .072, sign * .017], [.032, .027, .041], (x, y, z) => Math.abs(y - .072) < .006 ? [.13, .19, .19] : [.25, .39, .36], 16, 8);
  return b.finish();
}
function mantisAntennae(sign) {
  const b = builder();
  for (let i = 0; i < 3; i++) b.tube([[0, 0, sign * .043], [.132, .016, sign * (.078 + i * .026)],
    [.337 - i * .028, .045 + i * .011, sign * (.108 + i * .038)]], [.005, .003, .001], [.48, .28, .13], 6);
  return b.finish();
}
function foldedClub(sign) {
  const b = builder();
  b.tube([[0, 0, 0], [.097, .038, sign * .015], [.055, .043, sign * .067], [.172, -.010, sign * .042]], [.026, .026, .020, .017], [.51, .22, .10]);
  b.ellipsoid([.172, -.010, sign * .042], [.040, .036, .024], [.43, .20, .08]);
  return b.finish();
}
function snailFoot(species) {
  const b = builder(), xs = [-.48, -.38, 0, .38, .48], zs = [-.22, -.15, 0, .15, .22];
  const bottom = [], top = [];
  for (let i = 0; i < xs.length; i++) {
    bottom[i] = []; top[i] = [];
    for (let j = 0; j < zs.length; j++) {
      const z = zs[j] * (i === 0 || i === xs.length - 1 ? .08 : 1);
      bottom[i][j] = b.vertex([xs[i], 0, z], [.37, .30, .20]);
      top[i][j] = b.vertex([xs[i], .031 + Math.sin(i / (xs.length - 1) * Math.PI) * .034 + Math.sin(j / (zs.length - 1) * Math.PI) * .014, z], [.46, .35, .23]);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    b.face(top[i][j], top[i + 1][j + 1], top[i + 1][j]); b.face(top[i][j], top[i][j + 1], top[i + 1][j + 1]);
    b.face(bottom[i][j], bottom[i + 1][j], bottom[i + 1][j + 1]); b.face(bottom[i][j], bottom[i + 1][j + 1], bottom[i][j + 1]);
  }
  for (let i = 0; i < xs.length - 1; i++) for (const j of [0, zs.length - 1]) {
    const a = bottom[i][j], c = bottom[i + 1][j], d = top[i + 1][j], e = top[i][j];
    j === 0 ? (b.face(a, e, d), b.face(a, d, c)) : (b.face(a, c, d), b.face(a, d, e));
  }
  for (const i of [0, xs.length - 1]) for (let j = 0; j < zs.length - 1; j++) {
    const a = bottom[i][j], c = bottom[i][j + 1], d = top[i][j + 1], e = top[i][j];
    i === 0 ? (b.face(a, c, d), b.face(a, d, e)) : (b.face(a, e, d), b.face(a, d, c));
  }
  // These are six samples of one continuous sole, not six appendages.
  if (!species.support.footContacts.every(p => xs.includes(p.x) && zs.includes(p.z) && p.y === 0)) throw new Error('Snail sole and catalog contacts disagree.');
  return b.finish();
}
function turbanShell() {
  const b = builder(), steps = 224, sides = 40, path = [], radii = [], frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = (1 - t) * TAU * 4.8 - Math.PI / 2, radius = .008 + .221 * t ** 1.25;
    const p = new THREE.Vector3(-.05 + Math.cos(angle) * radius, .971 - .489 * t ** .67, Math.sin(angle) * radius);
    if (t > .966) p.lerp(new THREE.Vector3(.292, .341, -.036), ((t - .966) / .034) ** 1.2);
    path.push(p); radii.push(.011 + .244 * t ** 1.38);
  }
  for (let row = 0; row <= steps; row++) {
    const p = path[row], tangent = path[Math.min(steps, row + 1)].clone().sub(path[Math.max(0, row - 1)]).normalize();
    const u = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(tangent, u); frames.push({ tangent, u, v });
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * TAU, rib = 1 + .023 * Math.cos(a * 3) + .012 * Math.sin(row * .85 + a * 9);
      const dot = Math.sin(row * .15 + a * 3) * Math.cos(row * .41 - a * 5);
      const tint = row > steps - 3 ? [.62, .59, .43] : dot > .63 ? [.60, .60, .40] : dot < -.38 ? [.25, .22, .12] : [.26 + dot * .06, .34 + dot * .07, .16];
      b.vertex(p.clone().addScaledVector(u, Math.cos(a) * radii[row] * rib).addScaledVector(v, Math.sin(a) * radii[row] * rib).toArray(), tint);
    }
  }
  for (let row = 0; row < steps; row++) for (let side = 0; side < sides; side++) {
    const a = row * (sides + 1) + side, c = a + sides + 1; b.face(a, a + 1, c); b.face(a + 1, c + 1, c);
  }
  const apex = b.vertex(path[0].toArray(), [.37, .35, .22]);
  for (let side = 0; side < sides; side++) b.face(apex, side + 1, side);
  const { tangent, u, v } = frames.at(-1), end = path.at(-1), innerStart = b.positions.length / 3;
  // A thick lip and actual recessed interior distinguish the shell aperture.
  for (let ring = 0; ring < 3; ring++) for (let side = 0; side <= sides; side++) {
    const a = side / sides * TAU, radius = [.227, .214, .17][ring];
    b.vertex(end.clone().addScaledVector(tangent, -[0, .045, .12][ring]).addScaledVector(u, Math.cos(a) * radius)
      .addScaledVector(v, Math.sin(a) * radius).toArray(), ring === 0 ? [.65, .61, .43] : [.24, .25, .14]);
  }
  for (let side = 0; side < sides; side++) {
    const a = steps * (sides + 1) + side, c = innerStart + side; b.face(a, c, a + 1); b.face(a + 1, c, c + 1);
  }
  for (let ring = 0; ring < 2; ring++) for (let side = 0; side < sides; side++) {
    const a = innerStart + ring * (sides + 1) + side, c = a + sides + 1; b.face(a, c, a + 1); b.face(a + 1, c, c + 1);
  }
  const inner = b.vertex(end.clone().addScaledVector(tangent, -.122).toArray(), [.13, .15, .08]);
  for (let side = 0; side < sides; side++) b.face(inner, innerStart + 2 * (sides + 1) + side, innerStart + 2 * (sides + 1) + side + 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < b.positions.length; i += 3) { lo = Math.min(lo, b.positions[i]); hi = Math.max(hi, b.positions[i]); }
  for (let i = 2; i < b.positions.length; i += 3) b.positions[i] = (b.positions[i] - (lo + hi) / 2) / (hi - lo);
  return b.finish();
}
function snailHead() {
  const b = builder();
  b.ellipsoid([.457, .103, 0], [.168, .068, .13], [.44, .34, .21], 20, 10);
  b.ellipsoid([.588, .086, 0], [.043, .025, .075], [.36, .25, .17], 12, 6);
  for (const sign of [-1, 1]) b.ellipsoid([.536, .141, sign * .09], [.009, .012, .01], [.12, .12, .08], 10, 6);
  b.ellipsoid([.170, .130, -.102], [.115, .081, .043], [.41, .38, .25], 16, 8);
  return b.finish();
}
function snailTentacle(sign) {
  const b = builder();
  b.tube([[0, 0, 0], [.124, .084, sign * .060], [.231, .095, sign * .094]], [.015, .008, .002], [.44, .35, .23]);
  return b.finish();
}
function add(root, name, make, parent = root) {
  const mesh = new THREE.Mesh(shared(root, `${root.userData.speciesId}:${name}:geometry`, make),
    shared(root, `${root.userData.speciesId}:material`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: 0 })));
  mesh.name = name; parent.add(mesh); return mesh;
}
export function createReefCommunityBenthic(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id ?? speciesOrId?.speciesId;
  if (!isReefCommunityBenthic(id)) throw new RangeError('Unknown reef community benthic species.');
  const s = oceanReefCommunitySpeciesById[id];
  if (!s || (typeof speciesOrId === 'object' && speciesOrId?.scientificName && speciesOrId.scientificName !== s.scientificName))
    throw new RangeError('Conflicting reef community species identity.');
  const root = new THREE.Group(); root.name = s.commonName;
  Object.assign(root.userData, { speciesId: id, scientificName: s.scientificName, sizeMeasure: s.sizeMeasure,
    normalizedEnvelope: structuredClone(s.normalizedEnvelope), supportContacts: structuredClone(s.support.footContacts),
    rootReference: 'neutral-foot-plane', forwardAxis: '+X', reefCommunityBenthicResources: new Set(), reefCommunityBenthicDisposed: false,
    independentAnimal: true, animationScope: 'bounded display appendage motion; native movement owns root position; planted reference contacts, no calibrated gait or prey strike' });
  instances.add(root);
  try {
    const motion = { eyes: [], antennae: [], clubs: [] };
    if (id === 'peacock-mantis-shrimp') {
      const body = add(root, 'Segmented mantis body, five abdominal segments and tail fan', mantisBody);
      body.userData.bodyMeasuredX = [-.5, .5]; const feet = add(root, 'Three pairs of actual walking legs', () => mantisFeet(s)); feet.userData.contactTips = true;
      for (const sign of [-1, 1]) {
        const eye = new THREE.Group(); eye.position.set(.403, .213, sign * .071); root.add(eye); add(root, `Stalked three-band eye ${sign}`, () => mantisEyes(sign), eye); motion.eyes.push(eye);
        const antenna = new THREE.Group(); antenna.position.set(.40, .219, 0); root.add(antenna); add(root, `Three-flagella antennule ${sign}`, () => mantisAntennae(sign), antenna); motion.antennae.push(antenna);
        const club = new THREE.Group(); club.position.set(.252, .151, sign * .123); root.add(club); add(root, `Folded raptorial club ${sign}`, () => foldedClub(sign), club); motion.clubs.push(club);
      }
      root.userData.anatomy = { walkingLegPairs: 3, actualContactTips: 6, raptorialAppendages: 2, smallMaxillipedPairs: 3,
        abdominalSegments: 5, swimmeretPairs: 5, tailFan: true, antennalScales: 2, antennuleFlagellaPerSide: 3, fabricatedBurrow: false };
    } else {
      const sole = add(root, 'One continuous muscular sole', () => snailFoot(s)); sole.userData.contactTips = true;
      const shell = add(root, 'Coiled thick green turban shell and recessed aperture', turbanShell); shell.userData.shellMeasuredZ = [-.5, .5];
      add(root, 'Extended soft head and calcareous operculum', snailHead);
      for (const sign of [-1, 1]) {
        const antenna = new THREE.Group(); antenna.position.set(.505, .123, sign * .075); root.add(antenna);
        add(root, `Cephalic tentacle ${sign}`, () => snailTentacle(sign), antenna); motion.antennae.push(antenna);
      }
      root.userData.anatomy = { continuousMuscularFoot: true, soleSamples: 6, walkingLegs: 0, cephalicTentacles: 2,
        shellWhorls: 4.8, shellWidthZ: [-.5, .5], recessedShellAperture: true, calcareousOperculum: true };
    }
    root.userData.motion = motion; root.updateMatrixWorld(true); return root;
  } catch (error) { disposeReefCommunityBenthic(root); throw error; }
}
export function animateReefCommunityBenthic(root, agent = {}, timeSec = 0) {
  if (!root?.userData?.motion || root.userData.reefCommunityBenthicDisposed) return false;
  const t = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const active = agent?.alive === false || agent?.state === 'resting' ? 0 : 1;
  const motion = root.userData.motion;
  motion.eyes.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .62 + phase + i * 1.7) * .065 * active;
    pivot.rotation.z = Math.sin(t * .41 + phase + i) * .025 * active; });
  motion.antennae.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .70 + phase + i * 1.3) * .025 * active;
    pivot.rotation.z = Math.sin(t * .53 + phase + i * .7) * .015 * active; });
  motion.clubs.forEach((pivot, i) => { pivot.rotation.y = Math.sin(t * .45 + phase + i) * .012 * active; });
  return true;
}
export function disposeReefCommunityBenthic(root) {
  if (!root?.userData || root.userData.reefCommunityBenthicDisposed) return false;
  root.userData.reefCommunityBenthicDisposed = true; instances.delete(root);
  for (const key of root.userData.reefCommunityBenthicResources ?? []) { const row = resources.get(key);
    if (row && --row.refs === 0) { row.value.dispose(); resources.delete(key); } }
  root.userData.reefCommunityBenthicResources?.clear(); root.removeFromParent(); root.clear(); return true;
}
export const reefCommunityBenthicAssetStats = () => ({ resources: resources.size, instances: instances.size });
