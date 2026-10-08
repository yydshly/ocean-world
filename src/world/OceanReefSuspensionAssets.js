import * as THREE from 'three';
import { OCEAN_REEF_SUSPENSION_IDS, oceanReefSuspensionSpeciesById } from '../oceanReefSuspensionSpecies.js';
const resources = new Map(), instances = new Set(), TAU = Math.PI * 2;
export const isReefSuspensionAnimal = id => OCEAN_REEF_SUSPENSION_IDS.includes(id);
function share(root, key, make) {
  let r = resources.get(key); if (!r) { r = { value: make(), refs: 0 }; resources.set(key, r); }
  if (!root.userData.reefSuspensionResources.has(key)) { root.userData.reefSuspensionResources.add(key); r.refs++; }
  return r.value;
}
// Tube strips merge each fan sector into one geometry. No mesh per pinnule.
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const n = positions.length / 3; positions.push(p[0], Math.max(0, p[1]), p[2]); colors.push(...c); return n; };
  function tube(points, radius, tint, sides = 6) {
    const start = positions.length / 3;
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(axis, u), r = radius * (1 - .55 * i / Math.max(1, points.length - 1));
      for (let j = 0; j < sides; j++) { const h = TAU * j / sides; vertex([p[0] + r * (u.x * Math.cos(h) + v.x * Math.sin(h)),
        p[1] + r * (u.y * Math.cos(h) + v.y * Math.sin(h)), p[2] + r * (u.z * Math.cos(h) + v.z * Math.sin(h))], tint); }
    });
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = start + i * sides + j, b = start + i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { tube, finish() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g; } };
}
function coloredEllipsoid(center, scale, tint, flat = false) {
  const g = new THREE.SphereGeometry(1, 32, 24), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) { const x = center[0] + p.getX(i) * scale[0], y = center[1] + p.getY(i) * scale[1], z = center[2] + p.getZ(i) * scale[2];
    p.setXYZ(i, x, flat ? Math.max(0, y) : y, z); c.push(...(typeof tint === 'function' ? tint(x, y, z) : tint)); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function part(root, name, make, parent = root) {
  const mesh = new THREE.Mesh(share(root, `${root.userData.speciesId}/${name}`, make), share(root, 'non-emissive-tissue', () =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0, side: THREE.DoubleSide, emissiveIntensity: 0 })));
  mesh.name = name; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function featherStar(root) {
  part(root, 'central oral disc', () => coloredEllipsoid([0, .09, 0], [.06, .05, .06], [.40, .31, .18]));
  part(root, 'basal gripping cirri', () => { const b = builder();
    for (const contact of oceanReefSuspensionSpeciesById['shallow-feather-star'].support.footContacts)
      b.tube([[0, .065, 0], [contact.x * .5, .032, contact.z * .5], [contact.x, 0, contact.z]], .006, [.40, .32, .19]);
    return b.finish(); });
  const sectors = Array.from({ length: 5 }, (_, sector) => {
    const pivot = new THREE.Group(); pivot.name = `feeding fan sector ${sector}`; root.add(pivot);
    part(root, `eight arms and paired pinnules ${sector}`, () => { const b = builder();
      for (let i = 0; i < 8; i++) {
        const angle = (sector * 8 + i) * TAU / 40, rad = .46 + .018 * Math.sin(i * 1.7), cx = Math.cos(angle), cz = Math.sin(angle);
        const p = t => [cx * (.04 + rad * t), .10 + .35 * t + .026 * Math.sin(t * Math.PI), cz * (.04 + rad * t)];
        b.tube(Array.from({ length: 13 }, (_, j) => p(j / 12)), .005, [.63, .49, .24]);
        for (let j = 1; j <= 15; j++) for (const side of [-1, 1]) {
          const t = j / 16, a = p(t), len = .032 * Math.sin(t * Math.PI) + .007;
          b.tube([a, [a[0] - cz * side * len + cx * .008, a[1] + .012, a[2] + cx * side * len + cz * .008]], .0022, [.75, .62, .32], 4);
        }
      }
      return b.finish(); }, pivot); return pivot;
  }); root.userData.motion = { sectors };
}
function seaSquirt(root) {
  part(root, 'leathery tunic and basal attachment', () => coloredEllipsoid([0, .36, 0], [.26, .44, .23],
    (x, y, z) => Math.sin(x * 38 + Math.sin(y * 26) + z * 22) > .6 ? [.39, .34, .46] : [.76, .70, .59], true));
  const mouths = [[0, .72, 0, 0, .24], [.19, .59, 0, -.75, .14]].map(([x, y, z, rotation, length], i) => {
    const pivot = new THREE.Group(); pivot.name = i ? 'atrial exhalant siphon' : 'oral inhalant siphon'; pivot.position.set(x, y, z); pivot.rotation.z = rotation; root.add(pivot);
    part(root, `four-lobed open siphon ${i}`, () => {
      const g = new THREE.CylinderGeometry(.09, .10, length, 32, 4, true); g.translate(0, length / 2, 0);
      const p = g.attributes.position, colors = [];
      for (let j = 0; j < p.count; j++) { const h = Math.atan2(p.getZ(j), p.getX(j)), rim = p.getY(j) > length * .9;
        const r = 1 + (rim ? .065 * Math.cos(h * 4) : 0); p.setXYZ(j, p.getX(j) * r, p.getY(j), p.getZ(j) * r);
        colors.push(...(rim ? [.79, .63, .25] : [.72, .65, .53])); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
    }, pivot);
    part(root, `recessed siphon throat ${i}`, () => coloredEllipsoid([0, length * .72, 0], [.079, .009, .079], [.12, .11, .14]), pivot);
    return pivot;
  }); root.userData.motion = { mouths };
}
export function createReefSuspensionAnimal(speciesOrId) {
  const id = typeof speciesOrId === 'string' ? speciesOrId : speciesOrId?.id;
  if (!isReefSuspensionAnimal(id)) throw new RangeError('Unknown reef suspension animal.');
  const s = oceanReefSuspensionSpeciesById[id], root = new THREE.Group(); root.name = s.commonName;
  Object.assign(root.userData, { speciesId: id, reefSuspensionResources: new Set(), reefSuspensionDisposed: false,
    independentAnimal: true, sizeMeasure: s.sizeMeasure, normalizedEnvelope: s.normalizedEnvelope, morphology: s.morphology,
    emissionEnabled: false, sourceLinks: s.sourceLinks.map(v => ({ ...v })), axes: s.normalizedEnvelope.axes });
  try { (id === 'shallow-feather-star' ? featherStar : seaSquirt)(root); instances.add(root); animateReefSuspensionAnimal(root, null, 0); return root; }
  catch (e) { disposeReefSuspensionAnimal(root); throw e; }
}
export function animateReefSuspensionAnimal(root, agent = null, timeSec = 0) {
  if (!root?.userData || root.userData.reefSuspensionDisposed) return false;
  const motion = root.userData.motion, clock = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const alive = agent?.alive !== false;
  if (motion.sectors) motion.sectors.forEach((p, i) => {
    p.rotation.y = alive ? .025 * Math.sin(clock * .42 + phase + i * .7) : 0;
    p.scale.y = alive ? 1 + .018 * Math.sin(clock * .55 + phase + i) : 1;
  });
  if (motion.mouths) motion.mouths.forEach((p, i) => { const scale = alive ? 1 + .06 * Math.sin(clock * .65 + phase + i * .4) : .82;
    p.scale.x = p.scale.z = scale; });
  return true;
}
export function disposeReefSuspensionAnimal(root) {
  if (!root?.userData || root.userData.reefSuspensionDisposed) return false;
  root.userData.reefSuspensionDisposed = true;
  for (const key of root.userData.reefSuspensionResources ?? []) { const r = resources.get(key); if (r && --r.refs === 0) { r.value.dispose(); resources.delete(key); } }
  root.userData.reefSuspensionResources?.clear(); instances.delete(root); root.removeFromParent(); return true;
}
export const reefSuspensionAnimalAssetStats = () => ({ resources: resources.size, instances: instances.size });
