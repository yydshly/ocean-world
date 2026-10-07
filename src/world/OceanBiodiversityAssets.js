import * as THREE from 'three';
import { oceanBiodiversityPatchMesh } from '../oceanBiodiversityShape.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const OCEAN_BIODIVERSITY_ASSET_VERSION = 1;
export const OCEAN_BIODIVERSITY_IDS = Object.freeze(['biodiversity-massive-coral', 'biodiversity-grape-algae',
  'tropical-urchin', 'feather-duster', 'sand-goby', 'reef-parrotfish', 'shallow-anemone', 'clown-anemonefish']);
export const OCEAN_BIODIVERSITY_ENVELOPES = Object.freeze({
  'tropical-urchin': Object.freeze({ radius: .5, bottom: 0, top: .55, sizeMeasure: 'complete spine span; test diameter about one fifth of span' }),
  'feather-duster': Object.freeze({ radius: .5, bottom: 0, top: .8, sizeMeasure: 'radiolar crown diameter; most of the tube/body is concealed' }),
  'shallow-anemone': Object.freeze({ radius: .5, bottom: 0, top: .48, sizeMeasure: 'oral disc diameter' }),
});
export const isOceanBiodiversitySpecies = id => OCEAN_BIODIVERSITY_IDS.includes(id);
const share = (root, key, make) => {
  let entry = resources.get(key); if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.biodiversityResources.has(key)) { root.userData.biodiversityResources.add(key); entry.refs++; }
  return entry.value;
};
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (x, y, z, tint) => { const i = positions.length / 3; positions.push(x, y, z); colors.push(...tint); return i; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, tint, sides = 12, rows = 7, colourAt = null) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let s = 0; s <= sides; s++) {
      const latitude = Math.PI * r / rows, angle = TAU * s / sides;
      const x = center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0];
      const y = center[1] + Math.cos(latitude) * scale[1], z = center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2];
      vertex(x, y, z, colourAt?.(x, y, z) ?? tint);
    }
    for (let r = 0; r < rows; r++) for (let s = 0; s < sides; s++) {
      const a = start + r * (sides + 1) + s, b = a + sides + 1;
      if (r) triangle(a, a + 1, b); if (r < rows - 1) triangle(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, tint, sides = 5) {
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const p = new THREE.Vector3(...points[i]), tangent = new THREE.Vector3(...points[Math.min(i + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(i - 1, 0)])).normalize();
      const a = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let s = 0; s < sides; s++) {
        const angle = s * TAU / sides, point = p.clone().addScaledVector(a, Math.cos(angle) * radii[i]).addScaledVector(b, Math.sin(angle) * radii[i]);
        vertex(point.x, point.y, point.z, tint);
      }
    }
    for (let r = 0; r < points.length - 1; r++) for (let s = 0; s < sides; s++) {
      const a = start + r * sides + s, b = start + r * sides + (s + 1) % sides;
      triangle(a, b, a + sides); triangle(b, b + sides, a + sides);
    }
  }
  function sheet(points, tint) {
    const start = positions.length / 3; for (const p of points) vertex(...p, tint);
    for (let i = 1; i < points.length - 1; i++) triangle(start, start + i, start + i + 1);
  }
  return { vertex, triangle, ellipsoid, tube, sheet, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function coralGeometry() {
  const data = oceanBiodiversityPatchMesh('biodiversity-massive-coral'), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const colours = []; for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i], y = data.positions[i + 1], z = data.positions[i + 2];
    const variation = .025 * Math.sin(x * 23 + z * 17) + .014 * Math.cos(z * 31 - x * 11);
    colours.push(.64 + .12 * y + variation, .55 + .09 * y + variation, .38 + .07 * y + variation);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}
function grapeGeometry() {
  const b = builder(), green = [.24, .36, .17];
  for (let stem = 0; stem < 5; stem++) {
    const angle = stem * TAU / 5 + .31, c = Math.cos(angle), s = Math.sin(angle);
    b.tube([[0, .006, 0], [c * .19, .009, s * .19], [c * .42, .006, s * .42]], [.009, .006, .002], green);
    for (let branch = 0; branch < 3; branch++) {
      const r = .09 + branch * .115, x = c * r, z = s * r, height = .078 + ((stem + branch) % 3) * .018;
      b.tube([[x, .006, z], [x + .012, height, z + .009]], [.004, .002], green);
      for (let level = 0; level < 4; level++) {
        const side = (level % 2 ? -1 : 1), y = .025 + level * (height - .025) / 4;
        b.ellipsoid([x + side * .022, y, z + (stem % 2 ? .01 : -.01)], [.006, .006, .006], [.29 + .014 * level, .43, .19], 7, 4);
      }
    }
  }
  const geometry = b.finish(), bottom = geometry.boundingBox.min.y, top = geometry.boundingBox.max.y;
  geometry.translate(0, -bottom, 0); geometry.scale(1, 1 / (top - bottom), 1);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}
function urchinGeometry() {
  const b = builder(); b.ellipsoid([0, .095, 0], [.10, .085, .10], [.045, .035, .065], 16, 8);
  for (let i = 0; i < 55; i++) {
    const angle = i * 2.3999632297, vertical = .06 + (i % 11) / 12, reach = .46 - (i % 5) * .014;
    const horizontal = Math.sqrt(1 - vertical * vertical), dx = Math.cos(angle) * horizontal, dz = Math.sin(angle) * horizontal;
    b.tube([[dx * .065, .08 + vertical * .055, dz * .065], [dx * reach, .08 + vertical * reach, dz * reach]],
      [.0075, .0008], i % 4 ? [.055, .035, .095] : [.10, .065, .13], 4);
  }
  for (let i = 0; i < 5; i++) b.ellipsoid([Math.cos(i * TAU / 5) * .055, .162, Math.sin(i * TAU / 5) * .055], [.012, .005, .012], [.61, .55, .44], 7, 4);
  b.ellipsoid([0, .18, 0], [.012, .006, .012], [.58, .26, .11], 9, 4); return b.finish();
}
function featherGeometry() {
  const b = builder();
  for (let i = 0; i < 22; i++) {
    const a = i * TAU / 22, c = Math.cos(a), s = Math.sin(a), reach = .43 + .03 * Math.sin(i * 1.7);
    const bottom = [0, .15, 0], tip = [c * reach, .72 + .02 * Math.sin(i * .9), s * reach];
    const tint = i % 3 ? [.62, .52, .35] : [.42, .31, .22]; b.tube([bottom, tip], [.006, .001], tint, 4);
    for (let j = 1; j < 7; j++) {
      const u = j / 7, p = [c * reach * u, .15 + (tip[1] - .15) * u, s * reach * u], span = .033 * (1 - u * .65);
      for (const sign of [-1, 1]) b.tube([p, [p[0] - s * span * sign + c * .022, p[1] + .026, p[2] + c * span * sign + s * .022]], [.0025, .0005], tint, 3);
    }
  }
  return b.finish();
}
function anemoneGeometry() {
  const b = builder(); b.ellipsoid([0, .09, 0], [.21, .09, .21], [.43, .32, .32], 14, 7);
  b.ellipsoid([0, .18, 0], [.35, .045, .35], [.47, .48, .31], 20, 6);
  for (let i = 0; i < 48; i++) {
    const angle = i * 2.3999632297, r = .11 + .20 * Math.sqrt((i + .5) / 48), c = Math.cos(angle), s = Math.sin(angle);
    b.tube([[c * r, .18, s * r], [c * (r + .055), .29 + (i % 3) * .025, s * (r + .055)],
      [c * Math.min(.455, r + .095), .38 + (i % 4) * .017, s * Math.min(.455, r + .095)]],
    [.016, .012, .005], i % 4 ? [.53, .57, .35] : [.59, .54, .37], 5);
  }
  return b.finish();
}
function fishGeometry(id, part) {
  const b = builder(), goby = id === 'sand-goby', clown = id === 'clown-anemonefish';
  const bodyColor = goby ? [.66, .65, .52] : clown ? [.74, .34, .10] : [.22, .43, .37];
  const height = goby ? .09 : clown ? .18 : .21, width = goby ? .065 : clown ? .095 : .13;
  if (part === 'body') {
    b.ellipsoid([.08, 0, 0], [.42, height, width], bodyColor, 20, 10, (x, y) => {
      if (clown && ([.30, .015, -.235].some(at => Math.abs(x - at) < .055))) return [.82, .81, .72];
      if (goby && x > .29) return [.73, .65, .37];
      return bodyColor.map(value => value * (.83 + .16 * (y / height + 1) / 2));
    });
    for (const sign of [-1, 1]) {
      b.ellipsoid([.34, height * .32, sign * width * .82], [.030, .032, .008], [.065, .055, .045], 8, 5);
      if (goby) b.tube([[.27, -.025, sign * .058], [.45, -.027, sign * .032]], [.004, .003], [.25, .48, .51], 4);
      b.sheet([[.09, -.02, sign * width], [-.09, -.13, sign * (width + .04)], [-.13, .02, sign * width]], bodyColor);
    }
    if (goby) {
      b.sheet([[.23, .065, 0], [.07, .19, 0], [-.03, .075, 0]], [.48, .46, .32]);
      b.sheet([[-.04, .075, 0], [-.12, .15, 0], [-.30, .045, 0]], [.48, .46, .32]);
    } else b.sheet([[.28, .12, 0], [.08, height + .04, 0], [-.29, .09, 0]], bodyColor);
    b.sheet([[.10, -.07, 0], [-.13, -height - .03, 0], [-.29, -.05, 0]], bodyColor);
    if (!goby && !clown) b.ellipsoid([.473, -.03, 0], [.027, .024, .035], [.56, .57, .37], 8, 4);
  } else {
    const span = goby ? .10 : .17;
    b.sheet(clown || goby ? [[0, 0, 0], [-.09, span * .8, 0], [-.18, span, 0], [-.22, span * .48, 0],
      [-.22, -span * .48, 0], [-.18, -span, 0], [-.09, -span * .8, 0]]
      : [[0, 0, 0], [-.09, span, 0], [-.22, span, 0], [-.17, .025, 0], [-.22, -span, 0], [-.09, -span, 0]], bodyColor);
  }
  return b.finish();
}
const factories = { 'biodiversity-massive-coral': coralGeometry, 'biodiversity-grape-algae': grapeGeometry,
  'tropical-urchin': urchinGeometry, 'feather-duster': featherGeometry, 'shallow-anemone': anemoneGeometry };
function add(root, id, key, make, parent = root) {
  const geometry = share(root, `geometry/${id}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .87,
    vertexColors: true, side: THREE.DoubleSide, metalness: 0 }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
export function createOceanBiodiversityAsset(species) {
  const id = typeof species === 'string' ? species : species?.id;
  if (!isOceanBiodiversitySpecies(id)) throw new TypeError('Unknown tropical biodiversity representative.');
  const group = new THREE.Group(), parts = {};
  Object.assign(group.userData, { speciesId: id, biodiversityResources: new Set(), biodiversityDisposed: false,
    assetVersion: OCEAN_BIODIVERSITY_ASSET_VERSION, phase: 0, sizeMeasure: OCEAN_BIODIVERSITY_ENVELOPES[id]?.sizeMeasure ?? 'whole horizontal unit span',
    morphologyStatus: 'complete procedural representative silhouette; not scanned or calibrated anatomy' });
  group.name = species?.commonName ?? id; instances.add(group);
  try {
    if (['sand-goby', 'reef-parrotfish', 'clown-anemonefish'].includes(id)) {
      parts.body = add(group, id, 'body', () => fishGeometry(id, 'body'));
      parts.tail = new THREE.Group(); parts.tail.position.x = -.28; group.add(parts.tail);
      add(group, id, 'caudal fin', () => fishGeometry(id, 'tail'), parts.tail);
    } else {
      const parent = new THREE.Group(); group.add(parent); parts.crown = parent;
      add(group, id, id === 'feather-duster' ? 'radiolar crown' : 'complete colony', factories[id], parent);
      if (id === 'feather-duster') add(group, id, 'exposed tube', () => {
        const b = builder(); b.tube([[0, .004, 0], [0, .17, 0]], [.043, .033], [.47, .43, .31], 10); return b.finish();
      });
    }
    group.userData.biodiversityParts = parts; return { group, parts };
  } catch (error) { disposeOceanBiodiversityAsset(group); throw error; }
}
export function animateOceanBiodiversityAsset(group, timeSec, agent = {}) {
  if (!group || group.userData.biodiversityDisposed) return;
  const time = Number.isFinite(timeSec) ? timeSec : 0, phase = group.userData.phase ?? 0, parts = group.userData.biodiversityParts;
  if (parts.tail) {
    const speed = Math.min(1, Math.hypot(agent.velocity?.x ?? 0, agent.velocity?.z ?? 0) / .1);
    parts.tail.rotation.y = Math.sin(time * (4 + speed * 3) + phase) * (.06 + speed * .13);
  } else if (group.userData.speciesId === 'feather-duster') {
    parts.crown.scale.y = agent.state === 'sheltering' ? .35 : 1;
    parts.crown.rotation.y = Math.sin(time * .5 + phase) * .014;
  } else if (group.userData.speciesId === 'shallow-anemone') parts.crown.rotation.y = Math.sin(time * .42 + phase) * .016;
}
export const createMassiveCoralAsset = () => createOceanBiodiversityAsset('biodiversity-massive-coral');
export const createGrapeAlgaeAsset = () => createOceanBiodiversityAsset('biodiversity-grape-algae');
export const createTropicalUrchinAsset = () => createOceanBiodiversityAsset('tropical-urchin');
export const createFeatherDusterAsset = () => createOceanBiodiversityAsset('feather-duster');
export const createSandGobyAsset = () => createOceanBiodiversityAsset('sand-goby');
export const createReefParrotfishAsset = () => createOceanBiodiversityAsset('reef-parrotfish');
export const createShallowAnemoneAsset = () => createOceanBiodiversityAsset('shallow-anemone');
export const createClownAnemonefishAsset = () => createOceanBiodiversityAsset('clown-anemonefish');
export function disposeOceanBiodiversityAsset(group) {
  if (!group || group.userData.biodiversityDisposed) return;
  group.userData.biodiversityDisposed = true;
  for (const key of group.userData.biodiversityResources ?? []) {
    const entry = resources.get(key); if (entry && --entry.refs <= 0) { entry.value.dispose(); resources.delete(key); }
  }
  group.userData.biodiversityResources?.clear(); instances.delete(group); group.removeFromParent(); group.clear();
}
export function oceanBiodiversityAssetStats() { return { resources: resources.size, instances: instances.size }; }

/** Fixed capacity, two shared scenery batches. These durable descriptors are
 * habitat display patches, never extra animals, food pools or pickable life. */
export class OceanBiodiversityPatches {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Actual tropical habitat patches';
    this.root.userData.oceanStreaming = true; this.root.userData.role = 'static-habitat-descriptors';
    this._holder = new THREE.Group(); Object.assign(this._holder.userData, { biodiversityResources: new Set(), biodiversityDisposed: false });
    this._meshes = new Map(); this._signature = null; this._disposed = false; this._transform = new THREE.Object3D(); this._origin = { x: 0, z: 0 };
    this._up = new THREE.Vector3(0, 1, 0); this._normal = new THREE.Vector3(); this._alignment = new THREE.Quaternion();
    for (const id of OCEAN_BIODIVERSITY_IDS.slice(0, 2)) {
      const geometry = share(this._holder, `geometry/${id}/complete colony`, factories[id]);
      const material = share(this._holder, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .87,
        vertexColors: true, side: THREE.DoubleSide, metalness: 0 }));
      const mesh = new THREE.InstancedMesh(geometry, material, 180); mesh.count = 0; mesh.receiveShadow = true;
      mesh.name = id; mesh.userData.role = 'static-habitat-descriptor-not-additional-simulated-biomass';
      this._meshes.set(id, mesh); this.root.add(mesh);
    }
  }
  update(input = [], origin = this._origin) {
    if (this._disposed) return false;
    const rows = (Array.isArray(input) ? input : []).filter(p => this._meshes.has(p?.speciesId) &&
      [p.x, p.y, p.z, p.rotation, p.scale?.x, p.scale?.y, p.scale?.z].every(Number.isFinite) &&
      p.scale.x > 0 && p.scale.y > 0 && p.scale.z > 0 && (!p.surfaceNormal ||
        [p.surfaceNormal.x, p.surfaceNormal.y, p.surfaceNormal.z].every(Number.isFinite) && p.surfaceNormal.y > 0)).slice(0, 180);
    const signature = JSON.stringify([rows, origin.x, origin.z]); if (signature === this._signature) return false; this._signature = signature;
    this._origin = { x: origin.x, z: origin.z }; this.root.position.set(origin.x, 0, origin.z);
    for (const [id, mesh] of this._meshes) {
      const selected = rows.filter(row => row.speciesId === id); mesh.count = selected.length; mesh.userData.elementIds = selected.map(row => row.id);
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i]; this._transform.position.set(p.x - origin.x, p.y, p.z - origin.z); this._transform.rotation.set(0, p.rotation, 0);
        // Soft stolons follow an admitted native rock plane. Hard colonies keep
        // their original shared vertical support-query transform unchanged.
        if (p.speciesId === 'biodiversity-grape-algae' && p.surfaceNormal) {
          this._normal.set(p.surfaceNormal.x, p.surfaceNormal.y, p.surfaceNormal.z).normalize();
          this._alignment.setFromUnitVectors(this._up, this._normal);
          this._transform.quaternion.premultiply(this._alignment);
        }
        this._transform.scale.set(p.scale.x, p.scale.y, p.scale.z); this._transform.updateMatrix(); mesh.setMatrixAt(i, this._transform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.visible = selected.length > 0; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    }
    return true;
  }
  get stats() {
    return { count: [...this._meshes.values()].reduce((n, mesh) => n + mesh.count, 0),
      speciesCounts: Object.fromEntries([...this._meshes].map(([id, mesh]) => [id, mesh.count])),
      drawCalls: [...this._meshes.values()].filter(mesh => mesh.count > 0).length, maxPatches: 180 };
  }
  reset() { return this.update([]); }
  dispose() {
    if (this._disposed) return; this._disposed = true;
    for (const mesh of this._meshes.values()) mesh.dispose(); this._meshes.clear();
    disposeOceanBiodiversityAsset(this._holder); this.root.removeFromParent(); this.root.clear();
  }
}
