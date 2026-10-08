import * as THREE from 'three';
import { OCEAN_REEF_FILTER_IDS, oceanReefFilterSpeciesById } from '../oceanReefFilterSpecies.js';
const resources = new Map(), instances = new Set(), TAU = Math.PI * 2;
export const isReefFilterAnimal = id => OCEAN_REEF_FILTER_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefFilterResources.has(key)) { root.userData.reefFilterResources.add(key); row.refs++; }
  return row.value;
}
function geometry(make, tint) {
  const positions = [], colors = [], indices = [], rows = 36, sides = 64;
  for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
    const p = make(row / rows, i / sides), c = typeof tint === 'function' ? tint(...p) : tint;
    positions.push(...p); colors.push(...c);
  }
  for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
    const a = row * (sides + 1) + i, b = a + sides + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
const ellipsoid = (center, scale, tint, flatBase = false) => geometry((u, v) => {
  const a = TAU * v, t = Math.PI * u;
  const y = center[1] + Math.cos(t) * scale[1];
  return [center[0] + Math.sin(t) * Math.cos(a) * scale[0], flatBase ? Math.max(0, y) : y, center[2] + Math.sin(t) * Math.sin(a) * scale[2]];
}, tint);
function part(root, name, make, parent = root) {
  const g = share(root, `${root.userData.speciesId}/${name}`, make), m = share(root, 'shell-and-tissue', () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .73, metalness: 0, side: THREE.DoubleSide, emissiveIntensity: 0 }));
  const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
function clam(root) {
  const valves = [-1, 1].map(sign => {
    const pivot = new THREE.Group(); pivot.name = `thick valve ${sign}`; pivot.position.set(0, .08, sign * .025); root.add(pivot);
    part(root, `six fluted radial shell folds ${sign}`, () => geometry((u, v) => {
      const t = Math.PI * u, a = Math.PI * v, rib = 1 + .13 * Math.cos(12 * t);
      return [.5 * Math.cos(t), .10 + .35 * Math.sin(t) * Math.sin(a), sign * (.055 + .20 * Math.sin(t) * rib * (.35 + .65 * Math.sin(a)))];
    }, (x, y, z) => Math.sin(y * 160) > .45 ? [.66, .61, .48] : [.76, .71, .59]), pivot);
    return pivot;
  });
  const mantle = part(root, 'mottled exposed living mantle', () => ellipsoid([0, .36, 0], [.43, .13, .19],
    (x, y, z) => Math.sin(x * 70 + Math.sin(z * 50)) > .25 ? [.32, .49, .42] : [.15, .28, .29]));
  part(root, 'shell support and short byssal opening', () => ellipsoid([0, .04, 0], [.30, .10, .09], [.54, .51, .42], true));
  root.userData.motion = { valves, mantle };
}
function oyster(root) {
  part(root, 'lower subcircular scaly valve', () => ellipsoid([0, .03, 0], [.50, .06, .35],
    (x, y, z) => Math.sin(Math.hypot(x, z) * 150) > .4 ? [.36, .37, .30] : [.24, .27, .23], true));
  const pivot = new THREE.Group(); pivot.name = 'upper oyster hinge'; pivot.position.set(0, .08, -.27); root.add(pivot);
  part(root, 'upper valve concentric growth scales', () => ellipsoid([0, .01, .27], [.50, .055, .35],
    (x, y, z) => Math.sin(Math.hypot(x, z - .27) * 170) > .25 ? [.41, .42, .35] : [.27, .30, .25]), pivot);
  const mantle = part(root, 'dark mantle rim and nacre interior', () => ellipsoid([0, .10, 0], [.40, .025, .27],
    (x, y, z) => Math.hypot(x / .4, z / .27) > .86 ? [.12, .17, .15] : [.63, .67, .59]));
  part(root, 'short straight hinge', () => ellipsoid([0, .08, -.27], [.15, .018, .028], [.22, .24, .20]));
  root.userData.motion = { valves: [pivot], mantle };
}
export function createReefFilterAnimal(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefFilterAnimal(id)) throw new RangeError('Unknown reef filter species.');
  const descriptor = oceanReefFilterSpeciesById[id], root = new THREE.Group(); root.name = descriptor.commonName;
  Object.assign(root.userData, { speciesId: id, reefFilterResources: new Set(), reefFilterDisposed: false, independentAnimal: true,
    sizeMeasure: descriptor.sizeMeasure, normalizedEnvelope: descriptor.normalizedEnvelope, morphology: descriptor.morphology,
    emissionEnabled: false, sourceLinks: descriptor.sourceLinks.map(s => ({ ...s })), axes: descriptor.normalizedEnvelope.axes });
  try { (id === 'fluted-giant-clam' ? clam : oyster)(root); instances.add(root); animateReefFilterAnimal(root, null, 0); return root; }
  catch (error) { disposeReefFilterAnimal(root); throw error; }
}
export function animateReefFilterAnimal(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefFilterDisposed) return false;
  const descriptor = oceanReefFilterSpeciesById[root.userData.speciesId], motion = root.userData.motion;
  const clock = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const alive = agent?.alive !== false, clam = root.userData.speciesId === 'fluted-giant-clam';
  motion.valves.forEach((valve, i) => { valve.rotation.x = alive ? (clam ? (i ? -1 : 1) : -1) *
    (.5 + .5 * Math.sin(clock * .6 + phase)) * descriptor.animationBounds.valveOpeningRad : 0; });
  motion.mantle.scale.y = alive ? 1 + Math.sin(clock * .9 + phase) * descriptor.animationBounds.mantleScaleFraction : 1;
  return true;
}
export function disposeReefFilterAnimal(root) {
  if (!root?.userData || root.userData.reefFilterDisposed) return false;
  root.userData.reefFilterDisposed = true;
  for (const key of root.userData.reefFilterResources ?? []) { const r = resources.get(key); if (r && --r.refs === 0) { r.value.dispose(); resources.delete(key); } }
  root.userData.reefFilterResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export const reefFilterAnimalAssetStats = () => ({ resources: resources.size, instances: instances.size });
